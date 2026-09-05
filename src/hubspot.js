// ---------------------------------------------------------------------------
//  Client API HubSpot — couverture complète de l'API CRM v3 / v4.
//
//  ⚠️ IMPORTANT — CORS : l'API HubSpot (api.hubapi.com) N'AUTORISE PAS les appels
//  directs depuis un navigateur (aucun en-tête CORS renvoyé). Une app 100 % front
//  comme BD Report doit donc passer par un **relais** (proxy) que vous hébergez :
//  Cloudflare Worker, fonction Vercel/Netlify, Supabase Edge Function… Le relais
//  ajoute les en-têtes CORS et garde le token HubSpot côté serveur (bien plus sûr
//  que de livrer un token privé au navigateur).
//  → Modèle de relais prêt à déployer : `hubspot/proxy-worker.js` + `hubspot/SETUP.md`.
//
//  Deux modes de fonctionnement :
//   • « relais » (recommandé) : `base` = l'URL de votre relais, aucun token dans
//     le navigateur — le relais injecte l'Authorization côté serveur.
//   • « direct » : `base` = https://api.hubapi.com + token privé. Ne fonctionne
//     que hors navigateur (ou derrière un relais transparent qui gère CORS).
//
//  Seule exception réellement appelable depuis un navigateur : l'API Forms
//  (api.hsforms.com), qui est volontairement ouverte au CORS — voir `forms.submit`.
// ---------------------------------------------------------------------------

export const HS_API_BASE = 'https://api.hubapi.com'
export const HS_FORMS_BASE = 'https://api.hsforms.com'

// Types d'objets CRM standard (l'API v3 est uniforme : le même jeu d'appels
// fonctionne pour chacun, y compris pour vos objets personnalisés).
export const HS_OBJECTS = [
  { type: 'contacts', label: 'Contacts' },
  { type: 'companies', label: 'Entreprises' },
  { type: 'deals', label: 'Transactions (deals)' },
  { type: 'tickets', label: 'Tickets' },
  { type: 'meetings', label: 'Rendez-vous (meetings)' },
  { type: 'calls', label: 'Appels' },
  { type: 'emails', label: 'E-mails' },
  { type: 'notes', label: 'Notes' },
  { type: 'tasks', label: 'Tâches' },
  { type: 'products', label: 'Produits' },
  { type: 'line_items', label: 'Lignes de produit' },
  { type: 'quotes', label: 'Devis' },
]

// --------------------------------------------------------------- Configuration
let CFG = { base: HS_API_BASE, token: '', portalId: '', headers: {} }

export function configureHubspot(patch) { CFG = { ...CFG, ...(patch || {}) }; return { ...CFG } }
export function currentHubspotConfig() { return { ...CFG } }
// Configurée = un relais est renseigné, ou un token est fourni.
export function isHubspotConfigured() {
  const viaProxy = !!CFG.base && CFG.base.replace(/\/$/, '') !== HS_API_BASE
  return viaProxy || !!CFG.token
}

// ------------------------------------------------------------------- Journal
// Journal en mémoire des appels (affiché dans la console d'intégration).
const LOG = []
export function hubspotCallLog() { return LOG.slice() }
export function clearHubspotCallLog() { LOG.length = 0 }
function pushLog(entry) {
  LOG.unshift({ ...entry, ts: new Date().toISOString() })
  if (LOG.length > 200) LOG.length = 200
  try { window.dispatchEvent(new CustomEvent('hubspot-log', { detail: entry })) } catch (e) { /* hors navigateur */ }
}

export class HubspotError extends Error {
  constructor(message, info = {}) {
    super(message)
    this.name = 'HubspotError'
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
// Toutes les fonctions du client passent par ici : auth, JSON, erreurs
// normalisées, respect du quota (429 → nouvelle tentative) et journalisation.
export async function hsRequest(method, path, { body, query, retries = 2, base, absolute = false } = {}) {
  const root = (base || CFG.base || HS_API_BASE).replace(/\/$/, '')
  const url = absolute ? path : root + path + qstr(query)
  const headers = { 'Content-Type': 'application/json', ...(CFG.headers || {}) }
  if (CFG.token) headers.Authorization = `Bearer ${CFG.token}`
  const started = Date.now()

  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      pushLog({ method, path, ok: false, status: 0, ms: Date.now() - started, message: 'Réseau / CORS' })
      throw new HubspotError(
        "Appel bloqué par le navigateur (CORS) ou réseau injoignable. L'API HubSpot n'accepte pas les appels directs depuis un navigateur : renseignez l'URL de relais dans la console d'intégration.",
        { status: 0, cors: true })
    }
    // Quota dépassé : HubSpot renvoie 429 + éventuellement Retry-After (secondes).
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Number(res.headers.get('Retry-After')) * 1000 || (2 ** attempt) * 800
      await sleep(wait)
      continue
    }
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch (e) { data = { raw: text } }
    const ms = Date.now() - started
    if (!res.ok) {
      const message = data?.message || data?.error || `Erreur HubSpot ${res.status}`
      pushLog({ method, path, ok: false, status: res.status, ms, message })
      throw new HubspotError(message, {
        status: res.status, category: data?.category, correlationId: data?.correlationId,
        errors: data?.errors, body: data,
      })
    }
    pushLog({ method, path, ok: true, status: res.status, ms })
    return data
  }
}

const GET = (p, o) => hsRequest('GET', p, o)
const POST = (p, body, o) => hsRequest('POST', p, { ...o, body })
const PATCH = (p, body, o) => hsRequest('PATCH', p, { ...o, body })
const PUT = (p, body, o) => hsRequest('PUT', p, { ...o, body })
const DEL = (p, o) => hsRequest('DELETE', p, o)

// ==========================================================================
//  1. Compte, authentification et diagnostic
// ==========================================================================
export const account = {
  // Détails du portail (id, devise, fuseau) — sert aussi de test de connexion.
  details: () => GET('/account-info/v3/details'),
  // Quotas d'appels API consommés aujourd'hui.
  apiUsage: () => GET('/account-info/v3/api-usage/daily'),
  // Informations portées par un jeton OAuth (portalId, scopes, expiration).
  tokenInfo: (token) => GET(`/oauth/v1/access-tokens/${encodeURIComponent(token)}`),
}

// OAuth — l'échange de code exige le client_secret : il DOIT se faire côté
// relais/serveur, jamais dans le navigateur. Ces helpers construisent l'URL
// d'autorisation et délèguent l'échange au relais.
export const oauth = {
  authorizeUrl({ clientId, redirectUri, scopes = [], optionalScopes = [], state = '' }) {
    const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: scopes.join(' ') })
    if (optionalScopes.length) p.set('optional_scope', optionalScopes.join(' '))
    if (state) p.set('state', state)
    return `https://app.hubspot.com/oauth/authorize?${p.toString()}`
  },
  // À router vers votre relais (`/oauth/exchange`) qui détient le client_secret.
  exchangeCode: (payload) => POST('/oauth/exchange', payload),
  refresh: (payload) => POST('/oauth/refresh', payload),
}

// Test de connexion « en un clic » utilisé par le bouton de la console.
export async function testHubspotConnection() {
  if (!isHubspotConfigured()) return { ok: false, msg: 'HubSpot non configuré : renseignez l\'URL de relais (ou un token privé).' }
  try {
    const d = await account.details()
    return {
      ok: true,
      msg: `Connexion HubSpot OK ✓ — portail ${d.portalId}${d.uiDomain ? ' (' + d.uiDomain + ')' : ''}, devise ${d.companyCurrency || '—'}.`,
      details: d,
    }
  } catch (e) {
    if (e.status === 401) return { ok: false, msg: 'Jeton refusé (401) : vérifiez le token de votre application privée et ses scopes.' }
    if (e.status === 403) return { ok: false, msg: 'Accès refusé (403) : il manque un scope à votre application privée HubSpot.' }
    return { ok: false, msg: e.message }
  }
}

// ==========================================================================
//  2. Objets CRM (API uniforme v3) — vaut pour contacts, entreprises, deals,
//     tickets, meetings, notes, tâches… et vos objets personnalisés.
// ==========================================================================
export const crm = {
  list: (type, { limit = 100, after, properties, propertiesWithHistory, associations, archived } = {}) =>
    GET(`/crm/v3/objects/${type}`, { query: { limit, after, properties, propertiesWithHistory, associations, archived } }),

  get: (type, id, { properties, propertiesWithHistory, associations, archived, idProperty } = {}) =>
    GET(`/crm/v3/objects/${type}/${encodeURIComponent(id)}`, { query: { properties, propertiesWithHistory, associations, archived, idProperty } }),

  create: (type, properties, associations) =>
    POST(`/crm/v3/objects/${type}`, { properties, ...(associations ? { associations } : {}) }),

  update: (type, id, properties, { idProperty } = {}) =>
    PATCH(`/crm/v3/objects/${type}/${encodeURIComponent(id)}`, { properties }, { query: { idProperty } }),

  archive: (type, id) => DEL(`/crm/v3/objects/${type}/${encodeURIComponent(id)}`),

  // Recherche : filtres, tri, texte libre. C'est l'appel à utiliser pour retrouver
  // un enregistrement par e-mail / domaine / nom avant de décider créer vs mettre à jour.
  search: (type, { query, filterGroups, sorts, properties, limit = 100, after } = {}) =>
    POST(`/crm/v3/objects/${type}/search`, { query, filterGroups, sorts, properties, limit, after }),

  batchRead: (type, ids, { properties, idProperty } = {}) =>
    POST(`/crm/v3/objects/${type}/batch/read`, { inputs: ids.map(id => ({ id: String(id) })), properties, idProperty }),
  batchCreate: (type, inputs) => POST(`/crm/v3/objects/${type}/batch/create`, { inputs }),
  batchUpdate: (type, inputs) => POST(`/crm/v3/objects/${type}/batch/update`, { inputs }),
  // Upsert : crée ou met à jour selon une propriété unique (ex : email pour un contact).
  batchUpsert: (type, inputs, idProperty) => POST(`/crm/v3/objects/${type}/batch/upsert`, { inputs, idProperty }),
  batchArchive: (type, ids) => POST(`/crm/v3/objects/${type}/batch/archive`, { inputs: ids.map(id => ({ id: String(id) })) }),

  merge: (type, primaryObjectId, objectIdToMerge) =>
    POST(`/crm/v3/objects/${type}/merge`, { primaryObjectId: String(primaryObjectId), objectIdToMerge: String(objectIdToMerge) }),

  // Suppression RGPD définitive (contacts) — irréversible.
  gdprDelete: (objectId, idProperty) => POST('/crm/v3/objects/contacts/gdpr-delete', { objectId: String(objectId), idProperty }),

  // Raccourci : retrouve UN enregistrement par la valeur exacte d'une propriété.
  async findByProperty(type, propertyName, value, properties) {
    if (!value) return null
    const r = await crm.search(type, {
      filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value: String(value) }] }],
      properties, limit: 1,
    })
    return r?.results?.[0] || null
  },

  // Parcourt TOUTES les pages d'une liste ou d'une recherche (pagination `after`).
  async listAll(type, opts = {}, { max = 1000, onPage } = {}) {
    const out = []
    let after
    do {
      const page = await crm.list(type, { ...opts, after })
      out.push(...(page.results || []))
      if (onPage) onPage(out.length)
      after = page.paging?.next?.after
    } while (after && out.length < max)
    return out.slice(0, max)
  },
}

// ==========================================================================
//  3. Associations (API v4) — relier contact ↔ entreprise ↔ deal ↔ meeting…
// ==========================================================================
export const associations = {
  // Association par défaut (le type standard entre les deux objets) — le cas courant.
  createDefault: (fromType, fromId, toType, toId) =>
    PUT(`/crm/v4/objects/${fromType}/${encodeURIComponent(fromId)}/associations/default/${toType}/${encodeURIComponent(toId)}`),
  // Association typée (libellés personnalisés / rôles).
  create: (fromType, fromId, toType, toId, types) =>
    PUT(`/crm/v4/objects/${fromType}/${encodeURIComponent(fromId)}/associations/${toType}/${encodeURIComponent(toId)}`, types),
  list: (fromType, fromId, toType, { limit = 100, after } = {}) =>
    GET(`/crm/v4/objects/${fromType}/${encodeURIComponent(fromId)}/associations/${toType}`, { query: { limit, after } }),
  remove: (fromType, fromId, toType, toId) =>
    DEL(`/crm/v4/objects/${fromType}/${encodeURIComponent(fromId)}/associations/${toType}/${encodeURIComponent(toId)}`),
  // Catalogue des types d'association disponibles entre deux objets.
  labels: (fromType, toType) => GET(`/crm/v4/associations/${fromType}/${toType}/labels`),
  createLabel: (fromType, toType, payload) => POST(`/crm/v4/associations/${fromType}/${toType}/labels`, payload),
  batchCreateDefault: (fromType, toType, inputs) =>
    POST(`/crm/v4/associations/${fromType}/${toType}/batch/associate/default`, { inputs }),
  batchCreate: (fromType, toType, inputs) =>
    POST(`/crm/v4/associations/${fromType}/${toType}/batch/create`, { inputs }),
  batchRead: (fromType, toType, inputs) =>
    POST(`/crm/v4/associations/${fromType}/${toType}/batch/read`, { inputs }),
  batchArchive: (fromType, toType, inputs) =>
    POST(`/crm/v4/associations/${fromType}/${toType}/batch/archive`, { inputs }),
}

// ==========================================================================
//  4. Propriétés (champs) — indispensable pour créer les champs BD Report
//     (ex : « Provenance du lead », « Date de passage SQL ») dans HubSpot.
// ==========================================================================
export const properties = {
  list: (type, { archived } = {}) => GET(`/crm/v3/properties/${type}`, { query: { archived } }),
  get: (type, name) => GET(`/crm/v3/properties/${type}/${encodeURIComponent(name)}`),
  create: (type, payload) => POST(`/crm/v3/properties/${type}`, payload),
  update: (type, name, payload) => PATCH(`/crm/v3/properties/${type}/${encodeURIComponent(name)}`, payload),
  archive: (type, name) => DEL(`/crm/v3/properties/${type}/${encodeURIComponent(name)}`),
  batchCreate: (type, inputs) => POST(`/crm/v3/properties/${type}/batch/create`, { inputs }),
  batchRead: (type, names) => POST(`/crm/v3/properties/${type}/batch/read`, { inputs: names.map(name => ({ name })) }),
  batchArchive: (type, names) => POST(`/crm/v3/properties/${type}/batch/archive`, { inputs: names.map(name => ({ name })) }),
  groups: (type) => GET(`/crm/v3/properties/${type}/groups`),
  createGroup: (type, payload) => POST(`/crm/v3/properties/${type}/groups`, payload),
}

// ==========================================================================
//  5. Pipelines & étapes — pour faire correspondre les phases BD Report
//     (R1, R2, MQL, SQL, KO, Signée) aux étapes de votre pipeline HubSpot.
// ==========================================================================
export const pipelines = {
  list: (type = 'deals') => GET(`/crm/v3/pipelines/${type}`),
  get: (type, pipelineId) => GET(`/crm/v3/pipelines/${type}/${encodeURIComponent(pipelineId)}`),
  create: (type, payload) => POST(`/crm/v3/pipelines/${type}`, payload),
  update: (type, pipelineId, payload) => PATCH(`/crm/v3/pipelines/${type}/${encodeURIComponent(pipelineId)}`, payload),
  archive: (type, pipelineId) => DEL(`/crm/v3/pipelines/${type}/${encodeURIComponent(pipelineId)}`),
  stages: (type, pipelineId) => GET(`/crm/v3/pipelines/${type}/${encodeURIComponent(pipelineId)}/stages`),
  createStage: (type, pipelineId, payload) => POST(`/crm/v3/pipelines/${type}/${encodeURIComponent(pipelineId)}/stages`, payload),
  updateStage: (type, pipelineId, stageId, payload) => PATCH(`/crm/v3/pipelines/${type}/${encodeURIComponent(pipelineId)}/stages/${encodeURIComponent(stageId)}`, payload),
}

// ==========================================================================
//  6. Propriétaires (owners) — pour attribuer chaque deal/RDV au bon commercial.
// ==========================================================================
export const owners = {
  list: ({ email, limit = 100, after, archived } = {}) => GET('/crm/v3/owners', { query: { email, limit, after, archived } }),
  get: (ownerId, { idProperty } = {}) => GET(`/crm/v3/owners/${encodeURIComponent(ownerId)}`, { query: { idProperty } }),
}

// ==========================================================================
//  7. Engagements — raccourcis typés au-dessus des objets CRM.
//     (meetings / calls / notes / tasks / emails sont des objets v3 standard)
// ==========================================================================
const engagement = (type) => ({
  create: (props, assoc) => crm.create(type, props, assoc),
  update: (id, props) => crm.update(type, id, props),
  get: (id, opts) => crm.get(type, id, opts),
  list: (opts) => crm.list(type, opts),
  archive: (id) => crm.archive(type, id),
  search: (opts) => crm.search(type, opts),
})
export const meetings = engagement('meetings')
export const calls = engagement('calls')
export const notes = engagement('notes')
export const tasks = engagement('tasks')
export const emails = engagement('emails')

// ==========================================================================
//  8. Listes marketing (v3)
// ==========================================================================
export const lists = {
  search: (payload) => POST('/crm/v3/lists/search', payload),
  get: (listId, { includeFilters } = {}) => GET(`/crm/v3/lists/${encodeURIComponent(listId)}`, { query: { includeFilters } }),
  create: (payload) => POST('/crm/v3/lists', payload),
  addMembers: (listId, recordIds) => PUT(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships/add`, recordIds.map(String)),
  removeMembers: (listId, recordIds) => PUT(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships/remove`, recordIds.map(String)),
  memberships: (listId, { limit = 100, after } = {}) => GET(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships`, { query: { limit, after } }),
}

// ==========================================================================
//  9. Formulaires — SEULE API HubSpot appelable directement depuis un navigateur
//     (CORS ouvert). Repli utile pour pousser un lead sans relais.
// ==========================================================================
export const forms = {
  submit: (portalId, formGuid, { fields, context, legalConsentOptions } = {}) =>
    hsRequest('POST', `${HS_FORMS_BASE}/submissions/v3/integration/submit/${portalId}/${formGuid}`, {
      absolute: true, body: { fields, context, legalConsentOptions },
    }),
  list: () => GET('/marketing/v3/forms/'),
  get: (formId) => GET(`/marketing/v3/forms/${encodeURIComponent(formId)}`),
}

// ==========================================================================
//  10. Événements de timeline (affiche l'activité BD Report sur la fiche HubSpot)
// ==========================================================================
export const timeline = {
  createEvent: (payload) => POST('/integrators/timeline/v3/events', payload),
  createEventTemplate: (appId, payload) => POST(`/integrators/timeline/v3/${appId}/event-templates`, payload),
  listEventTemplates: (appId) => GET(`/integrators/timeline/v3/${appId}/event-templates`),
}

// ==========================================================================
//  11. Webhooks (niveau application — nécessite la clé développeur HubSpot)
// ==========================================================================
export const webhooks = {
  getSettings: (appId) => GET(`/webhooks/v3/${appId}/settings`),
  updateSettings: (appId, payload) => PUT(`/webhooks/v3/${appId}/settings`, payload),
  listSubscriptions: (appId) => GET(`/webhooks/v3/${appId}/subscriptions`),
  createSubscription: (appId, payload) => POST(`/webhooks/v3/${appId}/subscriptions`, payload),
  updateSubscription: (appId, subId, payload) => PATCH(`/webhooks/v3/${appId}/subscriptions/${subId}`, payload),
  deleteSubscription: (appId, subId) => DEL(`/webhooks/v3/${appId}/subscriptions/${subId}`),
}

// ==========================================================================
//  12. Imports en masse (fichier CSV → HubSpot)
// ==========================================================================
export const imports = {
  list: ({ limit = 100, after } = {}) => GET('/crm/v3/imports/', { query: { limit, after } }),
  get: (importId) => GET(`/crm/v3/imports/${encodeURIComponent(importId)}`),
  cancel: (importId) => POST(`/crm/v3/imports/${encodeURIComponent(importId)}/cancel`),
}

// ==========================================================================
//  Catalogue des appels — alimente l'explorateur d'API de la console
//  d'intégration (chaque entrée est exécutable en un clic).
// ==========================================================================
export const HS_ENDPOINTS = [
  { id: 'account.details', group: 'Compte', label: 'Détails du portail', method: 'GET', path: '/account-info/v3/details', run: () => account.details() },
  { id: 'account.apiUsage', group: 'Compte', label: 'Consommation d\'API du jour', method: 'GET', path: '/account-info/v3/api-usage/daily', run: () => account.apiUsage() },
  { id: 'owners.list', group: 'Compte', label: 'Lister les propriétaires (commerciaux)', method: 'GET', path: '/crm/v3/owners', run: () => owners.list() },
  { id: 'pipelines.deals', group: 'Pipelines', label: 'Pipelines de transactions + étapes', method: 'GET', path: '/crm/v3/pipelines/deals', run: () => pipelines.list('deals') },
  { id: 'pipelines.tickets', group: 'Pipelines', label: 'Pipelines de tickets', method: 'GET', path: '/crm/v3/pipelines/tickets', run: () => pipelines.list('tickets') },
  { id: 'props.contacts', group: 'Propriétés', label: 'Propriétés des contacts', method: 'GET', path: '/crm/v3/properties/contacts', run: () => properties.list('contacts') },
  { id: 'props.companies', group: 'Propriétés', label: 'Propriétés des entreprises', method: 'GET', path: '/crm/v3/properties/companies', run: () => properties.list('companies') },
  { id: 'props.deals', group: 'Propriétés', label: 'Propriétés des transactions', method: 'GET', path: '/crm/v3/properties/deals', run: () => properties.list('deals') },
  { id: 'list.contacts', group: 'Lecture', label: 'Lister les contacts', method: 'GET', path: '/crm/v3/objects/contacts', run: () => crm.list('contacts', { limit: 10, properties: ['email', 'firstname', 'lastname', 'company'] }) },
  { id: 'list.companies', group: 'Lecture', label: 'Lister les entreprises', method: 'GET', path: '/crm/v3/objects/companies', run: () => crm.list('companies', { limit: 10, properties: ['name', 'domain', 'industry'] }) },
  { id: 'list.deals', group: 'Lecture', label: 'Lister les transactions', method: 'GET', path: '/crm/v3/objects/deals', run: () => crm.list('deals', { limit: 10, properties: ['dealname', 'dealstage', 'amount'] }) },
  { id: 'list.meetings', group: 'Lecture', label: 'Lister les rendez-vous', method: 'GET', path: '/crm/v3/objects/meetings', run: () => crm.list('meetings', { limit: 10 }) },
  { id: 'list.tasks', group: 'Lecture', label: 'Lister les tâches', method: 'GET', path: '/crm/v3/objects/tasks', run: () => crm.list('tasks', { limit: 10 }) },
  { id: 'list.notes', group: 'Lecture', label: 'Lister les notes', method: 'GET', path: '/crm/v3/objects/notes', run: () => crm.list('notes', { limit: 10 }) },
  { id: 'list.tickets', group: 'Lecture', label: 'Lister les tickets', method: 'GET', path: '/crm/v3/objects/tickets', run: () => crm.list('tickets', { limit: 10 }) },
  { id: 'search.contacts', group: 'Recherche', label: 'Rechercher des contacts (10 derniers)', method: 'POST', path: '/crm/v3/objects/contacts/search', run: () => crm.search('contacts', { sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }], limit: 10, properties: ['email', 'firstname', 'lastname'] }) },
  { id: 'search.deals', group: 'Recherche', label: 'Rechercher des transactions (10 dernières)', method: 'POST', path: '/crm/v3/objects/deals/search', run: () => crm.search('deals', { sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }], limit: 10, properties: ['dealname', 'dealstage'] }) },
  { id: 'assoc.labels', group: 'Associations', label: 'Types d\'association contact ↔ entreprise', method: 'GET', path: '/crm/v4/associations/contacts/companies/labels', run: () => associations.labels('contacts', 'companies') },
  { id: 'lists.search', group: 'Listes', label: 'Rechercher des listes marketing', method: 'POST', path: '/crm/v3/lists/search', run: () => lists.search({ count: 10 }) },
  { id: 'forms.list', group: 'Formulaires', label: 'Lister les formulaires', method: 'GET', path: '/marketing/v3/forms/', run: () => forms.list() },
  { id: 'imports.list', group: 'Imports', label: 'Historique des imports', method: 'GET', path: '/crm/v3/imports/', run: () => imports.list() },
]

export default {
  configureHubspot, currentHubspotConfig, isHubspotConfigured, testHubspotConnection,
  hsRequest, account, oauth, crm, associations, properties, pipelines, owners,
  meetings, calls, notes, tasks, emails, lists, forms, timeline, webhooks, imports,
  hubspotCallLog, clearHubspotCallLog, HS_ENDPOINTS, HS_OBJECTS,
}
