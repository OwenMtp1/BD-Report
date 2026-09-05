/**
 * Relais CORS HubSpot pour BD Report — Cloudflare Worker.
 * ---------------------------------------------------------------------------
 * Pourquoi ce relais ? L'API HubSpot (api.hubapi.com) ne renvoie aucun en-tête
 * CORS : un navigateur ne peut donc pas l'appeler directement. Ce Worker :
 *   1. répond aux préflights OPTIONS et ajoute les en-têtes CORS ;
 *   2. injecte le jeton HubSpot CÔTÉ SERVEUR (il ne descend jamais au navigateur) ;
 *   3. n'accepte que les origines et les chemins que vous autorisez ;
 *   4. gère l'échange OAuth (qui exige le client_secret).
 *
 * Déploiement : voir hubspot/SETUP.md
 *
 * Variables d'environnement (secrets Cloudflare) :
 *   HUBSPOT_TOKEN      jeton de l'application privée (pat-…) — requis
 *   ALLOWED_ORIGINS    origines autorisées, séparées par des virgules
 *                      ex : "https://bdreport.js.org,http://localhost:5173"
 *   SHARED_SECRET      (optionnel) valeur attendue dans l'en-tête X-BDR-Secret
 *   HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET  (optionnels) pour l'OAuth
 */

const HUBSPOT_API = 'https://api.hubapi.com'

// Préfixes de chemins autorisés — tout le reste est refusé (principe du moindre privilège).
const ALLOWED_PREFIXES = [
  '/crm/v3/', '/crm/v4/', '/account-info/v3/', '/marketing/v3/forms',
  '/integrators/timeline/v3/', '/webhooks/v3/', '/oauth/v1/',
]

function corsHeaders(origin, allowed) {
  const ok = allowed.length === 0 || allowed.includes(origin)
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-BDR-Secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    const cors = corsHeaders(origin, allowed)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    if (allowed.length && !allowed.includes(origin)) {
      return json({ message: 'Origine non autorisée par le relais.' }, 403, cors)
    }
    if (env.SHARED_SECRET && request.headers.get('X-BDR-Secret') !== env.SHARED_SECRET) {
      return json({ message: 'Secret partagé invalide.' }, 401, cors)
    }

    const url = new URL(request.url)
    const path = url.pathname

    // ----- Échange OAuth (nécessite le client_secret : jamais côté navigateur) -----
    if (path === '/oauth/exchange' || path === '/oauth/refresh') {
      const payload = await request.json().catch(() => ({}))
      const form = new URLSearchParams({
        client_id: env.HUBSPOT_CLIENT_ID || payload.clientId || '',
        client_secret: env.HUBSPOT_CLIENT_SECRET || '',
        redirect_uri: payload.redirectUri || '',
        ...(path === '/oauth/exchange'
          ? { grant_type: 'authorization_code', code: payload.code || '' }
          : { grant_type: 'refresh_token', refresh_token: payload.refreshToken || '' }),
      })
      const r = await fetch(`${HUBSPOT_API}/oauth/v1/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      return new Response(await r.text(), { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ----- Relais générique vers l'API HubSpot -----
    if (!ALLOWED_PREFIXES.some(p => path.startsWith(p))) {
      return json({ message: `Chemin non autorisé par le relais : ${path}` }, 403, cors)
    }
    if (!env.HUBSPOT_TOKEN) {
      return json({ message: 'HUBSPOT_TOKEN non configuré sur le relais.' }, 500, cors)
    }

    const target = HUBSPOT_API + path + url.search
    const init = {
      method: request.method,
      headers: {
        Authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
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
