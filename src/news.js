// ---------------------------------------------------------------------------
//  ACTUALITÉS D'UNE ENTREPRISE — côté application.
//
//  L'application ne parle qu'au RELAIS (`news/worker.js`), jamais à Google News
//  ni à Gemini. Deux raisons, toutes deux dirimantes :
//   · le flux RSS de Google News ne renvoie aucun en-tête CORS — un navigateur ne
//     peut pas l'appeler, quoi qu'on écrive ici ;
//   · une clé Gemini livrée dans le bundle serait publique, donc utilisable (et
//     facturable) par n'importe quel visiteur.
//  Même schéma que le connecteur HubSpot : un relais déployé une fois par l'éditeur,
//  dont l'URL est publiée dans l'application.
//
//  CACHE : 24 h, en `localStorage`. Volontairement PAS dans l'état synchronisé —
//  des dépêches de presse sont une vue, pas une donnée d'équipe : les y écrire
//  ferait grossir la base commune et déclencherait une synchronisation à chaque
//  ouverture d'une fiche entreprise.
// ---------------------------------------------------------------------------

const CACHE_KEY = 'bdrflow_news_v1'
const TTL = 24 * 3600 * 1000

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch (e) { return {} }
}
const writeCache = (all) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(all)) } catch (e) { /* quota : le cache est un confort */ }
}
const keyOf = (company) => String(company || '').trim().toLowerCase()

/** Ce qu'on a déjà pour cette entreprise, si c'est encore frais. */
export function cachedNews(company) {
  const entry = readCache()[keyOf(company)]
  if (!entry || Date.now() - (entry.at || 0) > TTL) return null
  return entry
}

function patchCache(company, patch) {
  const all = readCache()
  const k = keyOf(company)
  all[k] = { ...(all[k] || {}), ...patch }
  // Le cache ne grossit pas indéfiniment : on ne garde que les 40 entreprises les
  // plus récemment consultées, le reste n'est qu'un coût de stockage.
  const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
  const trimmed = {}
  keys.slice(0, 40).forEach(x => { trimmed[x] = all[x] })
  writeCache(trimmed)
  return all[k]
}

export const newsRelayUrl = (db) => String(db?.integrations?.news?.relayUrl || '').replace(/\/+$/, '')

const NO_RELAY = "Le relais Actualités n'est pas configuré. L'équipe BD Report doit publier son URL (voir news/SETUP.md)."

/**
 * Actualités récentes. `force` rejoue la recherche même si le cache est frais —
 * c'est le bouton « Actualiser les actualités ».
 */
export async function fetchCompanyNews(company, db, { force = false } = {}) {
  const name = String(company || '').trim()
  if (!name) return { error: "Aucun nom d'entreprise." }
  if (!force) {
    const hit = cachedNews(name)
    if (hit?.articles) return { articles: hit.articles, signals: hit.signals || null, cachedAt: hit.at, fromCache: true }
  }
  const base = newsRelayUrl(db)
  if (!base) return { error: NO_RELAY }
  try {
    const res = await fetch(`${base}/news?q=${encodeURIComponent(name)}`)
    const body = await res.json().catch(() => null)
    if (!res.ok || !body || body.error) return { error: body?.error || `Le relais a répondu ${res.status}.` }
    const articles = Array.isArray(body.articles) ? body.articles : []
    // Les actualités ont changé : l'analyse précédente ne les décrit plus.
    patchCache(name, { at: Date.now(), articles, signals: null })
    return { articles, signals: null, cachedAt: Date.now() }
  } catch (e) {
    return { error: 'Relais injoignable. Vérifiez la connexion ou l\'URL publiée.' }
  }
}

/** Analyse des articles DÉJÀ récupérés. Jamais lancée toute seule : elle coûte un appel IA. */
export async function analyzeCompanyNews(company, articles, db) {
  const name = String(company || '').trim()
  const base = newsRelayUrl(db)
  if (!base) return { error: NO_RELAY }
  if (!name || !(articles || []).length) return { error: 'Aucune actualité à analyser.' }
  try {
    const res = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: name, articles }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body || body.error) return { error: body?.error || `Le relais a répondu ${res.status}.` }
    const signals = Array.isArray(body.signals) ? body.signals : []
    patchCache(name, { signals, analyzedAt: Date.now() })
    return { signals }
  } catch (e) {
    return { error: 'Relais injoignable. Vérifiez la connexion ou l\'URL publiée.' }
  }
}
