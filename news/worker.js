/**
 * Relais « Actualités » de BD Report — Cloudflare Worker.
 * ---------------------------------------------------------------------------
 * POURQUOI UN RELAIS, ET PAS DU CODE DANS L'APPLICATION.
 *
 * BD Report est une application 100 % front (aucun serveur). Deux choses sont
 * donc impossibles depuis le navigateur, et ce Worker existe pour les deux :
 *
 *   1. LIRE GOOGLE NEWS. Le flux RSS de Google News ne renvoie aucun en-tête
 *      CORS : un navigateur ne peut pas l'appeler, quel que soit le code écrit.
 *   2. TENIR LA CLÉ GEMINI. Une clé livrée dans le bundle est une clé publique —
 *      lisible par n'importe quel visiteur, et facturable par lui. Elle vit donc
 *      ici, en secret Cloudflare, et ne descend JAMAIS dans le navigateur.
 *
 * L'application n'envoie que le nom de l'entreprise, et reçoit des articles ou
 * des signaux. Elle ne voit jamais la clé.
 *
 * Deux routes :
 *   GET  /news?q=<entreprise>   → { articles: [...] }  (Google News RSS, 30 jours, 20 max)
 *   POST /analyze               → { signals: [...] }   (Gemini, 5 signaux max)
 *
 * Déploiement : voir news/SETUP.md (+ news/wrangler.toml).
 *
 * Variables d'environnement (secrets Cloudflare) :
 *   GEMINI_API_KEY   requis — clé Google AI Studio (offre gratuite suffisante)
 *   ALLOWED_ORIGINS  origines autorisées, séparées par des virgules
 *                    ex : "https://bdreport.js.org,http://localhost:5173"
 *   GEMINI_MODEL     (optionnel) modèle à utiliser, défaut « gemini-2.0-flash »
 */

const RSS_BASE = 'https://news.google.com/rss/search'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MAX_ARTICLES = 20        // ce qu'on envoie à l'IA : au-delà, on paie pour du bruit
const MAX_SIGNALS = 5          // ce qu'on rend : cinq signaux se lisent, vingt se survolent
const WINDOW_DAYS = 30

// ---------------------------------------------------------------- CORS
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  const ok = allowed.length === 0 || allowed.includes(origin)
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
const json = (data, request, env, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request, env) },
  })

// ---------------------------------------------------------------- Google News
const decodeEntities = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, '')
  .trim()

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(m[1]) : ''
}

// Google News suffixe systématiquement le titre par « - <Source> » : on le retire,
// la source étant déjà rendue à part. La laisser dupliquerait l'information dans
// chaque ligne, et fausserait la comparaison des titres au dédoublonnage.
const stripSource = (title, source) => {
  if (!source) return title
  const suffix = ' - ' + source
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title
}

const normTitle = (t) => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function parseRss(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  return items.map(block => {
    const source = tag(block, 'source')
    return {
      title: stripSource(tag(block, 'title'), source),
      url: tag(block, 'link'),
      source,
      date: tag(block, 'pubDate'),
      summary: tag(block, 'description').slice(0, 400),
    }
  }).filter(a => a.title && a.url)
}

async function getNews(company) {
  // `when:30d` borne la fenêtre côté Google ; on refiltre ensuite sur la date, le
  // flux renvoyant parfois des articles plus anciens.
  const q = `"${company}" when:${WINDOW_DAYS}d`
  const url = `${RSS_BASE}?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`
  const res = await fetch(url, { headers: { 'User-Agent': 'BDReport/1.0 (+https://bdreport.js.org)' } })
  if (!res.ok) throw new Error('Google News a répondu ' + res.status)
  const parsed = parseRss(await res.text())

  const floor = Date.now() - WINDOW_DAYS * 86400000
  const seen = new Set()
  const out = []
  for (const a of parsed) {
    const ts = Date.parse(a.date)
    if (Number.isFinite(ts) && ts < floor) continue
    const key = normTitle(a.title)
    if (!key || seen.has(key)) continue      // doublons : le même sujet repris par dix titres
    seen.add(key)
    out.push({ ...a, date: Number.isFinite(ts) ? new Date(ts).toISOString() : '' })
    if (out.length >= MAX_ARTICLES) break
  }
  return out
}

// ---------------------------------------------------------------- Gemini
const SIGNAL_TYPES = [
  'recrutement', 'changement de direction', 'levée de fonds', 'acquisition', 'fusion',
  'croissance', 'expansion', 'ouverture de bureaux', 'lancement de produit',
  'changement stratégique', 'restructuration', 'licenciements', 'changement technologique',
  'transformation RH', 'partenariat',
]

const PROMPT = (company, articles) => `Tu es analyste commercial pour une équipe de prospection B2B (SDR/BDR).

Voici des articles de presse récents concernant l'entreprise « ${company} ».

RÈGLE ABSOLUE : tu ne t'appuies QUE sur les articles fournis ci-dessous. Tu n'ajoutes aucune information venue d'ailleurs, tu ne devines rien, tu n'extrapoles pas. Si un article ne dit pas quelque chose, cette chose n'existe pas.

Identifie uniquement les faits qui constituent un SIGNAL COMMERCIAL, c'est-à-dire une raison concrète de contacter cette entreprise maintenant. Types recherchés : ${SIGNAL_TYPES.join(', ')}.

Ignore : les articles sans rapport avec l'entreprise, les analyses de marché générales, les cours de bourse, les contenus purement promotionnels.

Réponds en JSON strict, sans texte autour, avec cette forme :
{"signals":[{"type":"...","title":"...","summary":"...","score":0,"urgency":"LOW|MEDIUM|HIGH","why_now":"...","targets":["..."],"angle":"...","source":"...","date":"...","url":"..."}]}

· type : l'un des types ci-dessus
· title : le fait, en une ligne
· summary : deux phrases maximum, tirées de l'article
· score : intérêt commercial de 0 à 100
· urgency : LOW, MEDIUM ou HIGH
· why_now : pourquoi ce moment précis est le bon
· targets : les fonctions à contacter (3 maximum)
· angle : une phrase d'accroche utilisable telle quelle par un commercial
· source, date, url : repris EXACTEMENT de l'article d'origine

${MAX_SIGNALS} signaux maximum, du plus pertinent au moins pertinent.
Si aucun article ne constitue un signal commercial, réponds {"signals":[]}.

ARTICLES :
${articles.map((a, i) => `[${i + 1}] ${a.title}
source: ${a.source || 'inconnue'}
date: ${a.date || 'inconnue'}
url: ${a.url}
extrait: ${a.summary || '(aucun)'}`).join('\n\n')}`

const URGENCIES = ['LOW', 'MEDIUM', 'HIGH']

async function analyze(company, articles, env) {
  const key = env.GEMINI_API_KEY
  if (!key) throw new Error("Le relais n'a pas de clé Gemini configurée.")
  const model = env.GEMINI_MODEL || 'gemini-2.0-flash'
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(company, articles) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini a répondu ${res.status}${detail ? ' — ' + detail.slice(0, 200) : ''}`)
  }
  const body = await res.json()
  const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  let parsed
  try { parsed = JSON.parse(text) } catch (e) { throw new Error("Réponse de l'IA illisible.") }

  // On ne fait pas confiance à la forme renvoyée : un modèle peut inventer un champ,
  // en oublier un autre, ou rendre 12 signaux quand on en demandait 5.
  const urls = new Set(articles.map(a => a.url))
  return (Array.isArray(parsed?.signals) ? parsed.signals : [])
    .map(s => ({
      type: String(s.type || '').slice(0, 60),
      title: String(s.title || '').slice(0, 200),
      summary: String(s.summary || '').slice(0, 600),
      score: Math.max(0, Math.min(100, Math.round(Number(s.score) || 0))),
      urgency: URGENCIES.includes(String(s.urgency || '').toUpperCase()) ? String(s.urgency).toUpperCase() : 'LOW',
      why_now: String(s.why_now || '').slice(0, 600),
      targets: (Array.isArray(s.targets) ? s.targets : []).slice(0, 3).map(t => String(t).slice(0, 60)),
      angle: String(s.angle || '').slice(0, 400),
      source: String(s.source || '').slice(0, 120),
      date: String(s.date || '').slice(0, 40),
      // Une URL absente des articles fournis est une URL inventée : on la retire plutôt
      // que d'envoyer un commercial vers une page qui n'existe pas.
      url: urls.has(s.url) ? s.url : '',
    }))
    .filter(s => s.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SIGNALS)
}

// ---------------------------------------------------------------- Routage
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) })
    const url = new URL(request.url)

    try {
      if (url.pathname === '/news' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim()
        if (!q) return json({ error: "Nom d'entreprise manquant." }, request, env, 400)
        return json({ articles: await getNews(q) }, request, env)
      }

      if (url.pathname === '/analyze' && request.method === 'POST') {
        const body = await request.json().catch(() => null)
        const company = String(body?.company || '').trim()
        const articles = Array.isArray(body?.articles) ? body.articles.slice(0, MAX_ARTICLES) : []
        if (!company || !articles.length) return json({ error: 'Entreprise ou articles manquants.' }, request, env, 400)
        return json({ signals: await analyze(company, articles, env) }, request, env)
      }

      // La racine répond comme /health : ouvrir l'URL du relais dans un navigateur doit
      // suffire à savoir s'il est vivant. Renvoyer « Route inconnue » à la seule adresse
      // qu'on pense à essayer envoyait chercher une panne là où il n'y en avait pas.
      if (url.pathname === '/health' || url.pathname === '/' || url.pathname === '') {
        return json({ ok: true, gemini: !!env.GEMINI_API_KEY, service: 'bdr-news' }, request, env)
      }
    } catch (e) {
      return json({ error: e && e.message ? e.message : String(e) }, request, env, 502)
    }
    return json({ error: 'Route inconnue.' }, request, env, 404)
  },
}
