// ---------------------------------------------------------------------------
//  ENRICHISSEMENT D'UNE FICHE ENTREPRISE — côté application.
//
//  ⚠️ LA RÈGLE QUI COMMANDE TOUT LE RESTE : on ne remplit QUE des champs qui
//  existent déjà. `ENRICHABLE` est la liste EXHAUSTIVE des champs de la fiche
//  entreprise (`data.companies[nom]`), et c'est elle qu'on envoie au relais —
//  lequel jette tout ce qui n'y figure pas. Un modèle qui proposerait « effectif »
//  ou « e-mail » n'a donc aucun moyen d'en créer un : ni ici, ni là-bas.
//
//  ⚠️ L'ENTREPRISE, JAMAIS LES PERSONNES. Aucune recherche sur les contacts liés,
//  même quand la fiche en affiche. Le relais refuse d'ailleurs toute valeur qui
//  ressemble à une donnée personnelle.
//
//  Cache 24 h en `localStorage`, comme les actualités : une fiche qu'on rouvre ne
//  doit pas consommer un appel de plus.
// ---------------------------------------------------------------------------
import { newsRelayUrl } from './news.js'
import { once, cooldownLeft, startCooldown, quotaMessage } from './aiGuard.js'

// LES CHAMPS DE LA FICHE, ET RIEN D'AUTRE. Toute addition ici doit correspondre à
// un champ réellement présent dans `Company.jsx` — sinon on invente un champ,
// ce qui est exactement ce qu'on s'interdit.
export const ENRICHABLE = [
  { id: 'site', label: 'Site web' },
  { id: 'linkedin', label: 'LinkedIn entreprise' },
  { id: 'localisation', label: 'Localisation' },
  { id: 'ca', label: "Chiffre d'affaires" },
  { id: 'effectif', label: 'Effectif' },
  { id: 'secteur', label: "Secteur d'activité" },
]
export const ENRICHABLE_IDS = ENRICHABLE.map(f => f.id)

const CACHE_KEY = 'bdrflow_enrich_v1'
const TTL = 24 * 3600 * 1000
const keyOf = (c) => String(c || '').trim().toLowerCase()
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch (e) { return {} } }

export function cachedEnrichment(company) {
  const e = readCache()[keyOf(company)]
  if (!e || Date.now() - (e.at || 0) > TTL) return null
  return e
}

function putCache(company, found) {
  const all = readCache()
  all[keyOf(company)] = { at: Date.now(), found }
  const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
  const trimmed = {}
  keys.slice(0, 40).forEach(k => { trimmed[k] = all[k] })
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)) } catch (e) { /* quota */ }
}

/**
 * Cherche les informations publiques manquantes. Renvoie `{ found, fromCache }` où
 * `found[champ]` vaut soit `{value, publisher, url, confidence}`, soit `null` —
 * « je n'ai pas trouvé » étant une réponse légitime, jamais remplacée par une estimation.
 */
export async function enrichCompany(company, known, db, { force = false } = {}) {
  const name = String(company || '').trim()
  if (!name) return { error: "Aucun nom d'entreprise." }
  if (!force) {
    const hit = cachedEnrichment(name)
    if (hit) return { found: hit.found, fromCache: true, at: hit.at }
  }
  const base = newsRelayUrl(db)
  if (!base) return { error: "Le relais n'est pas configuré. L'équipe BD Report doit publier son URL." }
  const left = cooldownLeft()
  if (left) return { error: quotaMessage(left), quota: true }
  // ⚠️ Une demande identique déjà en vol est PARTAGÉE. Sans cela, un remontage du
  // panneau relançait une seconde recherche — et l'enrichissement, qui interroge la
  // recherche Google, est la plus coûteuse des deux fonctionnalités.
  return once('enrich:' + keyOf(name), async () => {
  try {
    const res = await fetch(`${base}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: name,
        fields: ENRICHABLE_IDS,                       // la liste part d'ICI, jamais du modèle
        known: Object.fromEntries(ENRICHABLE_IDS.map(f => [f, String(known?.[f] || '')])),
      }),
    })
    const body = await res.json().catch(() => null)
    // Un quota atteint n'est pas une erreur technique : l'application doit pouvoir le dire
    // autrement, et ne pas décompter un appel qui n'a rien consommé chez Google.
    const quota = res.status === 429 || body?.code === 429
    if (quota) startCooldown(body?.retryAfter)
    if (!res.ok || !body || body.error) return { error: body?.error || `Le relais a répondu ${res.status}.`, quota }
    // Dernière barrière côté application : on ne retient que nos propres champs.
    const found = {}
    ENRICHABLE_IDS.forEach(f => { found[f] = body.found?.[f] || null })
    putCache(name, found)
    return { found, model: body.model || '', inputTokens: body.inputTokens || 0, outputTokens: body.outputTokens || 0 }
  } catch (e) {
    return { error: 'Relais injoignable. Vérifiez la connexion ou l\'URL publiée.' }
  }
  })
}

/**
 * Ce que l'enrichissement CHANGERAIT, champ par champ. On ne décide rien ici : on
 * qualifie, pour que l'écran puisse demander. Une valeur identique à celle déjà
 * saisie n'est pas une proposition — la proposer ferait cocher dans le vide.
 */
export function enrichmentDiff(found, current) {
  return ENRICHABLE.map(f => {
    const hit = found?.[f.id] || null
    const now = String(current?.[f.id] || '').trim()
    if (!hit) return { ...f, state: 'none', current: now }
    const value = String(hit.value || '').trim()
    if (!value) return { ...f, state: 'none', current: now }
    if (!now) return { ...f, state: 'empty', current: now, hit, value }
    if (now.toLowerCase() === value.toLowerCase()) return { ...f, state: 'same', current: now, hit, value }
    return { ...f, state: 'conflict', current: now, hit, value }
  })
}
