/**
 * Connecteur HubSpot multi-clients pour BD Report — Cloudflare Worker.
 * ---------------------------------------------------------------------------
 * UN SEUL relais déployé par l'éditeur, mais UNE CONNEXION PAR ENTREPRISE CLIENTE :
 * chaque client autorise BD Report dans SON portail HubSpot, et le Worker garde
 * ses jetons (accès + rafraîchissement) côté serveur, indexés par entreprise.
 * Aucun jeton HubSpot ne descend jamais dans le navigateur.
 *
 * Rôles du Worker :
 *   1. répondre aux préflights OPTIONS et ajouter les en-têtes CORS
 *      (l'API HubSpot n'en renvoie aucun : un navigateur ne peut pas l'appeler) ;
 *   2. dérouler le parcours OAuth du client (/oauth/start → /oauth/callback) ;
 *   3. stocker/rafraîchir les jetons par entreprise dans un espace KV ;
 *   4. relayer les appels API en injectant le jeton du BON portail ;
 *   5. n'accepter que les origines et les chemins autorisés.
 *
 * Déploiement : voir hubspot/SETUP.md (+ hubspot/wrangler.toml).
 *
 * Variables d'environnement (secrets Cloudflare) :
 *   HUBSPOT_CLIENT_ID       requis — application publique HubSpot (marketplace/privée)
 *   HUBSPOT_CLIENT_SECRET   requis — idem
 *   HUBSPOT_REDIRECT_URI    requis — https://<worker>/oauth/callback (identique côté HubSpot)
 *   STATE_SECRET            requis — chaîne aléatoire : signe l'état OAuth et hache les clés
 *   ALLOWED_ORIGINS         origines autorisées, séparées par des virgules
 *                           ex : "https://bdreport.js.org,http://localhost:5173"
 *   HUBSPOT_SCOPES          (optionnel) scopes demandés, séparés par des espaces
 *   HUBSPOT_OPTIONAL_SCOPES (optionnel) scopes facultatifs
 *   HUBSPOT_TOKEN           (optionnel) jeton unique de repli, pour les appels SANS entreprise
 *   SHARED_SECRET           (optionnel) valeur attendue dans l'en-tête X-BDR-Secret
 *
 * Liaison KV (obligatoire pour le mode multi-clients) :
 *   TENANTS                 espace KV stockant un enregistrement par entreprise
 */

const HUBSPOT_API = 'https://api.hubapi.com'
const HUBSPOT_AUTHORIZE = 'https://app.hubspot.com/oauth/authorize'

// Scopes demandés au client. Doivent être déclarés à l'identique dans la config
// de votre application HubSpot, sinon HubSpot refuse l'URL d'autorisation.
const DEFAULT_SCOPES = [
  'oauth',
  'crm.objects.contacts.read', 'crm.objects.contacts.write',
  'crm.objects.companies.read', 'crm.objects.companies.write',
  'crm.objects.deals.read', 'crm.objects.deals.write',
  'crm.objects.owners.read',
  'crm.schemas.contacts.read', 'crm.schemas.contacts.write',
  'crm.schemas.companies.read', 'crm.schemas.companies.write',
  'crm.schemas.deals.read', 'crm.schemas.deals.write',
]
// Scopes facultatifs : si le portail du client ne les propose pas (offre HubSpot
// plus légère), la connexion aboutit quand même — seule la fonction liée manque.
const DEFAULT_OPTIONAL_SCOPES = [
  'crm.objects.meetings.read', 'crm.objects.meetings.write',
  'crm.objects.notes.read', 'crm.objects.notes.write',
  'crm.objects.tasks.read', 'crm.objects.tasks.write',
  'tickets',
]

// Préfixes de chemins relayables — tout le reste est refusé (moindre privilège).
const ALLOWED_PREFIXES = [
  '/crm/v3/', '/crm/v4/', '/account-info/v3/', '/marketing/v3/forms',
  '/integrators/timeline/v3/', '/webhooks/v3/',
]

// ----------------------------------------------------------------- utilitaires
const enc = new TextEncoder()
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
// Comparaison à temps constant (évite de fuiter la clé octet par octet).
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
const keyHashOf = (env, key) => sha256hex(`${env.STATE_SECRET || ''}:${key}`)

async function signState(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)))
  return `${body}.${await hmac(secret, body)}`
}
async function readState(secret, state, maxAgeMs = 15 * 60 * 1000) {
  const [body, sig] = String(state || '').split('.')
  if (!body || !sig) return null
  if (!safeEqual(sig, await hmac(secret, body))) return null
  let payload
  try { payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) } catch (e) { return null }
  if (!payload?.ts || Date.now() - payload.ts > maxAgeMs) return null
  return payload
}

function corsHeaders(origin, allowed) {
  const ok = allowed.length === 0 || allowed.includes(origin)
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-BDR-Secret,X-BDR-Tenant,X-BDR-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}
const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Page de fin d'autorisation : renvoie le résultat à l'app puis se ferme.
function closingPage(targetOrigin, payload) {
  const data = JSON.stringify({ source: 'bdr-hubspot', ...payload })
  const title = payload.ok ? 'HubSpot connecté' : 'Connexion HubSpot interrompue'
  const detail = payload.ok
    ? `Portail ${esc(payload.portalId)}${payload.hubDomain ? ` — ${esc(payload.hubDomain)}` : ''}. Vous pouvez revenir à BD Report.`
    : esc(payload.message || 'La connexion n\'a pas abouti.')
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;height:100vh;background:#f6f7f9;color:#111}
.box{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.15rem;margin:.5rem 0}p{color:#555}</style></head>
<body><div class="box"><h1>${title}</h1><p>${detail}</p><p><small>Cette fenêtre se ferme automatiquement.</small></p></div>
<script>
  try { if (window.opener) window.opener.postMessage(${data}, ${JSON.stringify(targetOrigin || '*')}) } catch (e) {}
  setTimeout(function () { try { window.close() } catch (e) {} }, ${payload.ok ? 900 : 4000});
</script></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// ------------------------------------------------------- entreprises (KV)
async function loadTenant(env, tenantId) {
  if (!env.TENANTS) return null
  const raw = await env.TENANTS.get(`tenant:${tenantId}`)
  return raw ? JSON.parse(raw) : null
}
const saveTenant = (env, rec) => env.TENANTS.put(`tenant:${rec.tenantId}`, JSON.stringify(rec))

// Authentifie l'appel : l'entreprise doit exister et présenter sa clé.
async function authTenant(env, request) {
  const tenantId = request.headers.get('X-BDR-Tenant') || ''
  const key = request.headers.get('X-BDR-Key') || ''
  if (!tenantId) return { tenantId: '', rec: null }
  if (!env.TENANTS) return { tenantId, error: json.bind(null, { message: 'Espace KV TENANTS non lié au relais : le mode multi-clients est indisponible.' }, 500) }
  const rec = await loadTenant(env, tenantId)
  if (!rec) return { tenantId, rec: null }
  if (!key || !safeEqual(rec.keyHash, await keyHashOf(env, key))) return { tenantId, rec, denied: true }
  return { tenantId, rec }
}

// Jeton d'accès valide pour une entreprise (rafraîchi à la volée si besoin).
async function accessTokenFor(env, rec) {
  if (rec.mode === 'pat') return rec.accessToken
  if (rec.expiresAt && rec.expiresAt - Date.now() > 60_000) return rec.accessToken
  if (!rec.refreshToken) return rec.accessToken
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.HUBSPOT_CLIENT_ID || '',
    client_secret: env.HUBSPOT_CLIENT_SECRET || '',
    refresh_token: rec.refreshToken,
  })
  const r = await fetch(`${HUBSPOT_API}/oauth/v1/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
  })
  if (!r.ok) return rec.accessToken // laisse HubSpot renvoyer un 401 explicite
  const t = await r.json()
  rec.accessToken = t.access_token
  if (t.refresh_token) rec.refreshToken = t.refresh_token
  rec.expiresAt = Date.now() + (Number(t.expires_in || 1800) * 1000)
  rec.updatedAt = new Date().toISOString()
  await saveTenant(env, rec)
  return rec.accessToken
}

// Métadonnées du portail portées par un jeton (Hub ID, domaine, utilisateur, scopes).
async function tokenInfo(token) {
  const r = await fetch(`${HUBSPOT_API}/oauth/v1/access-tokens/${encodeURIComponent(token)}`)
  return r.ok ? r.json() : null
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = request.headers.get('Origin') || ''
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    const cors = corsHeaders(origin, allowed)
    const isOAuthRoute = path === '/oauth/start' || path === '/oauth/callback'

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    // Les routes OAuth sont des NAVIGATIONS (pas de fetch) : elles n'ont ni en-tête
    // Origin ni secret partagé. Leur garde-fou est l'état signé + l'origine du retour.
    if (!isOAuthRoute) {
      if (allowed.length && origin && !allowed.includes(origin)) {
        return json({ message: 'Origine non autorisée par le connecteur.' }, 403, cors)
      }
      if (env.SHARED_SECRET && request.headers.get('X-BDR-Secret') !== env.SHARED_SECRET) {
        return json({ message: 'Secret partagé invalide.' }, 401, cors)
      }
    }

    // =====================================================================
    //  1. Parcours d'autorisation du client — /oauth/start
    // =====================================================================
    if (path === '/oauth/start') {
      const tenantId = url.searchParams.get('tenant') || ''
      const key = url.searchParams.get('key') || ''
      const back = url.searchParams.get('origin') || ''
      const label = url.searchParams.get('label') || ''
      if (!env.HUBSPOT_CLIENT_ID || !env.HUBSPOT_CLIENT_SECRET || !env.STATE_SECRET) {
        return closingPage(back, { ok: false, message: 'Connecteur incomplet : HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET / STATE_SECRET manquants.' })
      }
      if (!tenantId || !key) return closingPage(back, { ok: false, message: 'Requête de connexion incomplète (entreprise manquante).' })
      if (allowed.length && back && !allowed.includes(back)) return closingPage('', { ok: false, message: 'Origine non autorisée par le connecteur.' })

      const redirectUri = env.HUBSPOT_REDIRECT_URI || `${url.origin}/oauth/callback`
      const state = await signState(env.STATE_SECRET, { t: tenantId, k: key, o: back, l: label, ts: Date.now() })
      const scopes = (env.HUBSPOT_SCOPES || DEFAULT_SCOPES.join(' ')).trim()
      const optional = (env.HUBSPOT_OPTIONAL_SCOPES ?? DEFAULT_OPTIONAL_SCOPES.join(' ')).trim()
      const p = new URLSearchParams({ client_id: env.HUBSPOT_CLIENT_ID, redirect_uri: redirectUri, scope: scopes, state })
      if (optional) p.set('optional_scope', optional)
      return Response.redirect(`${HUBSPOT_AUTHORIZE}?${p.toString()}`, 302)
    }

    // =====================================================================
    //  2. Retour d'autorisation — /oauth/callback (échange du code)
    // =====================================================================
    if (path === '/oauth/callback') {
      const state = await readState(env.STATE_SECRET || '', url.searchParams.get('state'))
      const back = state?.o || ''
      if (!state) return closingPage(back, { ok: false, message: 'Demande expirée ou invalide : relancez la connexion depuis BD Report.' })
      const err = url.searchParams.get('error')
      if (err) return closingPage(back, { ok: false, message: `HubSpot a refusé l'autorisation (${err}).` })
      const code = url.searchParams.get('code')
      if (!code) return closingPage(back, { ok: false, message: 'Code d\'autorisation absent.' })
      if (!env.TENANTS) return closingPage(back, { ok: false, message: 'Espace KV TENANTS non lié au relais.' })

      const redirectUri = env.HUBSPOT_REDIRECT_URI || `${url.origin}/oauth/callback`
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.HUBSPOT_CLIENT_ID || '',
        client_secret: env.HUBSPOT_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        code,
      })
      const r = await fetch(`${HUBSPOT_API}/oauth/v1/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
      })
      if (!r.ok) {
        const detail = await r.text()
        return closingPage(back, { ok: false, message: `Échange du code refusé par HubSpot (${r.status}). ${detail.slice(0, 200)}` })
      }
      const tok = await r.json()
      const info = await tokenInfo(tok.access_token)

      // Une entreprise déjà reliée ne peut être réécrite qu'avec SA clé : cela empêche
      // qu'un autre espace détourne la connexion en devinant un identifiant.
      const existing = await loadTenant(env, state.t)
      const hash = await keyHashOf(env, state.k)
      if (existing && !safeEqual(existing.keyHash, hash)) {
        return closingPage(back, { ok: false, message: 'Cette entreprise est déjà reliée à un autre espace BD Report. Déconnectez-la d\'abord.' })
      }

      const now = new Date().toISOString()
      await saveTenant(env, {
        tenantId: state.t,
        keyHash: hash,
        mode: 'oauth',
        label: state.l || existing?.label || '',
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token || '',
        expiresAt: Date.now() + (Number(tok.expires_in || 1800) * 1000),
        portalId: String(info?.hub_id || ''),
        hubDomain: info?.hub_domain || '',
        user: info?.user || '',
        scopes: info?.scopes || [],
        connectedAt: existing?.connectedAt || now,
        updatedAt: now,
      })
      return closingPage(back, {
        ok: true,
        portalId: String(info?.hub_id || ''),
        hubDomain: info?.hub_domain || '',
        user: info?.user || '',
        scopes: info?.scopes || [],
      })
    }

    // =====================================================================
    //  3. État / jeton privé / déconnexion d'une entreprise
    // =====================================================================
    if (path.startsWith('/tenant/')) {
      const { tenantId, rec, denied, error } = await authTenant(env, request)
      if (error) return error(cors)
      if (!tenantId) return json({ message: 'Entreprise non précisée (en-tête X-BDR-Tenant).' }, 400, cors)
      if (denied) return json({ message: 'Clé d\'entreprise invalide.' }, 401, cors)

      if (path === '/tenant/status') {
        if (!rec) return json({ connected: false }, 200, cors)
        return json({
          connected: true, mode: rec.mode, portalId: rec.portalId, hubDomain: rec.hubDomain,
          user: rec.user, scopes: rec.scopes || [], connectedAt: rec.connectedAt, updatedAt: rec.updatedAt,
        }, 200, cors)
      }

      // Repli « application privée » : le client colle son jeton, il reste ici.
      if (path === '/tenant/token' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const token = String(body.token || '').trim()
        if (!token) return json({ message: 'Jeton absent.' }, 400, cors)
        const key = request.headers.get('X-BDR-Key') || ''
        if (!key) return json({ message: 'Clé d\'entreprise absente.' }, 400, cors)
        const info = await tokenInfo(token)
        const now = new Date().toISOString()
        await saveTenant(env, {
          tenantId, keyHash: await keyHashOf(env, key), mode: 'pat',
          accessToken: token, refreshToken: '', expiresAt: 0,
          portalId: String(info?.hub_id || ''), hubDomain: info?.hub_domain || '',
          user: info?.user || '', scopes: info?.scopes || [],
          connectedAt: rec?.connectedAt || now, updatedAt: now,
        })
        return json({ connected: true, portalId: String(info?.hub_id || ''), hubDomain: info?.hub_domain || '' }, 200, cors)
      }

      if (path === '/tenant/disconnect' && request.method === 'POST') {
        if (rec?.refreshToken) {
          // Révoque le jeton de rafraîchissement côté HubSpot (best effort).
          await fetch(`${HUBSPOT_API}/oauth/v1/refresh-tokens/${encodeURIComponent(rec.refreshToken)}`, { method: 'DELETE' }).catch(() => {})
        }
        await env.TENANTS.delete(`tenant:${tenantId}`)
        return json({ connected: false }, 200, cors)
      }
      return json({ message: `Route inconnue : ${path}` }, 404, cors)
    }

    // =====================================================================
    //  4. Relais générique vers l'API HubSpot (jeton du bon portail injecté)
    // =====================================================================
    if (!ALLOWED_PREFIXES.some(p => path.startsWith(p))) {
      return json({ message: `Chemin non autorisé par le connecteur : ${path}` }, 403, cors)
    }

    const { tenantId, rec, denied, error } = await authTenant(env, request)
    if (error) return error(cors)
    if (denied) return json({ message: 'Clé d\'entreprise invalide : reconnectez votre portail HubSpot.' }, 401, cors)

    let token = ''
    if (tenantId) {
      // 428 = « il manque une étape » : l'app le traduit en « connectez votre HubSpot ».
      if (!rec) return json({ message: 'Aucun portail HubSpot relié à cette entreprise.' }, 428, cors)
      token = await accessTokenFor(env, rec)
    } else {
      token = env.HUBSPOT_TOKEN || ''
      if (!token) return json({ message: 'Aucune entreprise précisée et aucun jeton de repli configuré.' }, 428, cors)
    }

    const target = HUBSPOT_API + path + url.search
    const init = {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      },
    }
    if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.text()

    const res = await fetch(target, init)
    const headers = { ...cors, 'Content-Type': res.headers.get('Content-Type') || 'application/json' }
    // Remonte les en-têtes de quota pour que l'app puisse se réguler.
    for (const h of ['X-HubSpot-RateLimit-Remaining', 'X-HubSpot-RateLimit-Daily-Remaining', 'Retry-After']) {
      const v = res.headers.get(h); if (v) headers[h] = v
    }
    return new Response(await res.text(), { status: res.status, headers })
  },
}
