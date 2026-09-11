// ---------------------------------------------------------------------------
//  MOTEUR DE SIGNAUX COMMERCIAUX — côté application.
//
//  La chaîne : COLLECTE (gratuite, sans IA) → REGROUPEMENT → ANALYSE IA
//  CONTEXTUALISÉE → SCORE → SIGNAL.
//
//  ⚠️ La collecte et l'analyse sont DEUX TEMPS SÉPARÉS, et c'est ce qui rend le
//  coût tenable : ramasser les preuves ne coûte rien, seule l'analyse consomme.
//  On n'analyse donc que si les preuves ont CHANGÉ — l'empreinte de l'ensemble
//  le dit sans avoir à demander à l'IA.
//
//  ⚠️ Un signal n'est PAS un article. Un seul appel couvre toute l'entreprise, ce
//  qui permet à l'IA de rassembler plusieurs preuves autour du même mouvement :
//  « 8 nouvelles offres + un DRH nommé + un bureau ouvert » devient UN signal de
//  structuration, pas trois lignes qu'un commercial devra recouper lui-même.
// ---------------------------------------------------------------------------
import { newsRelayUrl } from './news.js'
import { once, cooldownLeft, startCooldown, quotaMessage } from './aiGuard.js'

const CACHE_KEY = 'bdrflow_signals_v1'
const TTL = 24 * 3600 * 1000
const keyOf = (c) => String(c || '').trim().toLowerCase()

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch (e) { return {} } }
export function cachedCollect(company) {
  const e = readCache()[keyOf(company)]
  if (!e || Date.now() - (e.at || 0) > TTL) return null
  return e
}
function putCache(company, patch) {
  const all = readCache()
  const k = keyOf(company)
  all[k] = { ...(all[k] || {}), ...patch }
  const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
  const trimmed = {}
  keys.slice(0, 40).forEach(x => { trimmed[x] = all[x] })
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)) } catch (e) { /* quota */ }
}

/** Empreinte de l'ENSEMBLE des preuves : si elle n'a pas bougé, il n'y a rien de neuf à analyser. */
export const evidencePrint = (items) =>
  (items || []).map(i => i.fingerprint || i.sourceUrl).sort().join('|').slice(0, 4000)

/** Les types de signaux cochés par le staff, mis à plat pour le relais. */
const typesFor = (rules, catalogue) => (rules.signals || [])
  .filter(s => s.on)
  .map(s => {
    const t = catalogue.find(x => x.id === s.id)
    return { id: s.id, label: t ? t.label : s.id, priority: s.priority || 'medium' }
  })

/** Une phrase décrivant l'ICP, à partir des profils COCHÉS — jamais redéfini ici. */
export function icpSummary(rules, profiles) {
  const chosen = (profiles || []).filter(p => (rules.icpProfileIds || []).includes(p.id))
  if (!chosen.length) return ''
  return chosen.map(p => [
    p.name,
    (p.secteurs || []).length ? `secteurs : ${p.secteurs.join(', ')}` : '',
    (p.effMin || p.effMax) ? `effectif ${p.effMin ?? '?'}–${p.effMax ?? '?'}` : '',
    (p.postes || []).length ? `interlocuteurs : ${p.postes.join(', ')}` : '',
  ].filter(Boolean).join(' — ')).join(' ; ')
}

/** Ramasse les preuves publiques. Gratuit : aucune IA n'est appelée ici. */
export async function collectEvidence(company, site, rules, db, { force = false } = {}) {
  const name = String(company || '').trim()
  if (!name) return { error: "Aucun nom d'entreprise." }
  if (!force) {
    const hit = cachedCollect(name)
    if (hit?.items) return { ...hit, fromCache: true }
  }
  const base = newsRelayUrl(db)
  if (!base) return { error: "Le relais n'est pas configuré. L'équipe BD Report doit publier son URL." }
  return once('collect:' + keyOf(name), async () => {
    try {
      const res = await fetch(`${base}/signals/collect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: name, site: site || '', types: rules.types, sources: rules.sources || {} }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body || body.error) return { error: body?.error || `Le relais a répondu ${res.status}.` }
      const items = Array.isArray(body.items) ? body.items : []
      const out = { at: Date.now(), items, stats: body.stats || {} }
      // Les preuves ont changé : l'analyse précédente ne les décrit plus.
      const prev = readCache()[keyOf(name)]
      if (prev && evidencePrint(prev.items) !== evidencePrint(items)) out.signals = null
      putCache(name, out)
      return out
    } catch (e) {
      return { error: 'Relais injoignable. Vérifiez la connexion ou l\'URL publiée.' }
    }
  })
}

/**
 * Analyse les preuves avec le contexte de l'environnement. C'est le seul appel payant,
 * et il n'est jamais automatique : ni à l'ouverture d'un écran, ni sur des preuves
 * inchangées depuis la dernière analyse.
 */
export async function analyzeEvidence(company, items, rules, db) {
  const name = String(company || '').trim()
  const base = newsRelayUrl(db)
  if (!base) return { error: "Le relais n'est pas configuré." }
  if (!name || !(items || []).length) return { error: 'Aucune preuve à analyser.' }
  const left = cooldownLeft()
  if (left) return { error: quotaMessage(left), quota: true }
  return once('signals:' + keyOf(name), async () => {
    try {
      const res = await fetch(`${base}/signals/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: name, items, rules: rules.forAi, icp: rules.icp || '' }),
      })
      const body = await res.json().catch(() => null)
      const quota = res.status === 429 || body?.code === 429
      if (quota) startCooldown(body?.retryAfter)
      if (!res.ok || !body || body.error) return { error: body?.error || `Le relais a répondu ${res.status}.`, quota }
      const signals = Array.isArray(body.signals) ? body.signals : []
      putCache(name, { signals, analyzedAt: Date.now(), print: evidencePrint(items) })
      return { signals, model: body.model || '' }
    } catch (e) {
      return { error: 'Relais injoignable. Vérifiez la connexion ou l\'URL publiée.' }
    }
  })
}

/**
 * Le contexte envoyé au relais, assemblé à partir de la règle de l'environnement.
 * ⚠️ Rien ici n'est inventé : l'ICP vient des profils cochés, les types des cases cochées.
 */
export function buildContext(rules, catalogue, icpProfiles) {
  const types = typesFor(rules, catalogue)
  return {
    types,
    sources: rules.sources || {},
    icp: icpSummary(rules, icpProfiles),
    forAi: {
      activite: rules.activite || '',
      offre: rules.offre || '',
      personas: rules.personas || [],
      consignes: rules.consignes || '',
      types,
    },
  }
}
