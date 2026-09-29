// ---------------------------------------------------------------------------
//  Client API Pipedrive (API v1).
//
//  Même architecture que le client HubSpot, et volontairement : le relais, la
//  configuration par entreprise cliente, le journal d'appels et la reprise sur quota
//  sont des motifs déjà éprouvés ici. Réinventer une seconde façon de faire aurait
//  condamné chaque correction à être portée deux fois.
//
//  ⚠️ PASSER PAR LE RELAIS, MÊME SI LE NAVIGATEUR Y ARRIVE. Deux raisons, et la
//  seconde suffit à elle seule :
//   · CORS — rien ne garantit que l'API accepte un appel de navigateur, et un produit
//     qui dépend de cela casse le jour où le fournisseur resserre ses en-têtes ;
//   · LE JETON. Un jeton d'API Pipedrive ouvre TOUT le compte. Le mettre dans le
//     navigateur, c'est le livrer à quiconque ouvre l'inspecteur — exactement la
//     leçon des clés de ce projet. Chez le relais, il ne descend jamais.
//  Le mode `direct` existe pour dépanner et pour les essais hors navigateur ; il n'est
//  pas le chemin recommandé, et l'écran le dit.
//
//  ⚠️ ÉCRIT SANS ACCÈS À UN VRAI COMPTE. L'environnement de développement n'a pas de
//  sortie réseau vers api.pipedrive.com : le comportement est conforme à la
//  documentation de l'API, mais il n'a pas été confronté à un compte réel. Le premier
//  branchement est donc une VÉRIFICATION, pas une formalité — c'est à cela que sert
//  le bouton « Tester la connexion ».
// ---------------------------------------------------------------------------

export const PD_API_BASE = 'https://api.pipedrive.com/v1'

// --------------------------------------------------------------- Configuration
// `tenantId` / `tenantKey` : identifiant + clé de l'ENTREPRISE CLIENTE, comme pour
// HubSpot. Le relais s'en sert pour retrouver QUEL compte Pipedrive utiliser, sans
// qu'aucun jeton ne descende dans le navigateur.
let CFG = { base: PD_API_BASE, token: '', companyDomain: '', tenantId: '', tenantKey: '', headers: {} }

export function configurePipedrive(patch) { CFG = { ...CFG, ...(patch || {}) }; return { ...CFG } }
export function currentPipedriveConfig() { return { ...CFG } }
export function isPipedriveConfigured() {
  const viaRelay = !!CFG.base && CFG.base.replace(/\/$/, '') !== PD_API_BASE
  return viaRelay || !!CFG.token
}

// ------------------------------------------------------------------- Journal
const LOG = []
export function pipedriveCallLog() { return LOG.slice() }
export function clearPipedriveCallLog() { LOG.length = 0 }
function pushLog(entry) {
  LOG.unshift({ ...entry, ts: new Date().toISOString() })
  if (LOG.length > 200) LOG.length = 200
  try { window.dispatchEvent(new CustomEvent('pipedrive-log', { detail: entry })) } catch (e) { /* hors navigateur */ }
}

export class PipedriveError extends Error {
  constructor(message, info = {}) {
    super(message)
    this.name = 'PipedriveError'
    Object.assign(this, info)
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const qstr = (query) => {
  if (!query) return ''
  const p = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    if (Array.isArray(v)) v.forEach(x => p.append(k, String(x)))
    else p.append(k, String(v))
  })
  const s = p.toString()
  return s ? '?' + s : ''
}

// -------------------------------------------------------------- Cœur HTTP
export async function pdRequest(method, path, { body, query, retries = 2, base } = {}) {
  const root = (base || CFG.base || PD_API_BASE).replace(/\/$/, '')
  const headers = { 'Content-Type': 'application/json', ...(CFG.headers || {}) }
  // ⚠️ Le jeton passe par un EN-TÊTE, jamais par la chaîne de requête. En paramètre
  // d'URL il se retrouverait dans les journaux du serveur, dans l'historique et dans
  // l'en-tête Referer — trois endroits où un secret n'a rien à faire.
  if (CFG.token) headers['x-api-token'] = CFG.token
  if (CFG.tenantId) headers['X-BDR-Tenant'] = CFG.tenantId
  if (CFG.tenantKey) headers['X-BDR-Key'] = CFG.tenantKey
  const url = root + path + qstr(query)
  const started = Date.now()

  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      pushLog({ method, path, ok: false, status: 0, ms: Date.now() - started, message: 'Réseau / CORS' })
      throw new PipedriveError(
        "Appel bloqué par le navigateur (CORS) ou réseau injoignable. Renseignez l'URL du relais dans la console d'intégration : l'API Pipedrive n'est pas prévue pour être appelée depuis un navigateur.",
        { status: 0, cors: true })
    }
    // 429 = quota. Pipedrive publie le délai à attendre ; on le respecte au lieu de
    // deviner, et on ne réessaie pas indéfiniment.
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Number(res.headers.get('Retry-After')) * 1000 || (2 ** attempt) * 800
      await sleep(wait)
      continue
    }
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch (e) { data = { raw: text } }
    const ms = Date.now() - started

    // ⚠️ Pipedrive répond 200 avec `success:false` sur certaines erreurs métier.
    // Ne regarder que le code HTTP laisserait passer un échec pour une réussite.
    const failed = !res.ok || (data && data.success === false)
    if (failed) {
      const message = data?.error || data?.error_info || data?.message || `Erreur Pipedrive ${res.status}`
      pushLog({ method, path, ok: false, status: res.status, ms, message })
      throw new PipedriveError(message, { status: res.status, body: data })
    }
    pushLog({ method, path, ok: true, status: res.status, ms })
    // L'API enveloppe systématiquement le résultat dans `data`.
    return data
  }
}

const GET = (p, o) => pdRequest('GET', p, o)
const POST = (p, body, o) => pdRequest('POST', p, { ...o, body })
const PUT = (p, body, o) => pdRequest('PUT', p, { ...o, body })
const DEL = (p, o) => pdRequest('DELETE', p, o)

const unwrap = (r) => (r && 'data' in r ? r.data : r)

// ------------------------------------------------------------------ Ressources
/** CRUD uniforme. `kind` = 'organizations' | 'persons' | 'deals' | 'activities' | 'notes'. */
export const crm = {
  list: (kind, query) => GET(`/${kind}`, { query }).then(unwrap),
  get: (kind, id) => GET(`/${kind}/${id}`).then(unwrap),
  create: (kind, body) => POST(`/${kind}`, body).then(unwrap),
  update: (kind, id, body) => PUT(`/${kind}/${id}`, body).then(unwrap),
  remove: (kind, id) => DEL(`/${kind}/${id}`).then(unwrap),
  /**
   * Recherche. ⚠️ `exact_match` est volontaire : sans lui, « Acme » remonte aussi
   * « Acme Group » et « Acmelia », et l'envoi rattacherait l'affaire à la mauvaise
   * société — une erreur silencieuse et pénible à défaire.
   */
  search: (kind, term, extra = {}) =>
    GET(`/${kind}/search`, { query: { term, exact_match: true, limit: 10, ...extra } })
      .then(r => unwrap(r)?.items?.map(i => i.item) || []),
}

/** Champs personnalisés. ⚠️ Voir pipedriveSync.js : ils se désignent par une CLÉ hachée. */
export const fields = {
  list: (kind) => GET(`/${kind}Fields`, { query: { limit: 500 } }).then(unwrap),
  create: (kind, body) => POST(`/${kind}Fields`, body).then(unwrap),
}

export const pipelines = {
  list: () => GET('/pipelines').then(unwrap),
  stages: (pipelineId) => GET('/stages', { query: pipelineId ? { pipeline_id: pipelineId } : undefined }).then(unwrap),
}

export const users = {
  me: () => GET('/users/me').then(unwrap),
  list: () => GET('/users').then(unwrap),
}

/** Test de connexion : rend l'identité du compte, ou lève une erreur lisible. */
export async function testPipedrive() {
  const me = await users.me()
  return {
    ok: true,
    name: me?.name || '',
    email: me?.email || '',
    company: me?.company_name || '',
    companyDomain: me?.company_domain || '',
  }
}
