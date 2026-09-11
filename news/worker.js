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
 *   GEMINI_MODELS    (optionnel) modèles à essayer DANS L'ORDRE, séparés par des virgules.
 *                    Défaut : « gemini-3.6-flash,gemini-flash-lite-latest ». Chaque modèle a
 *                    son propre quota : quand l'un refuse (429), le suivant répond souvent.
 *                    Un modèle retiré (404) est remplacé par celui que Google désigne.
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
  }).map(a => {
    // Bing ne renseigne pas <source> : à défaut, le nom de domaine du lien dit
    // suffisamment de quel média il s'agit.
    if (a.source) return a
    const m = String(a.url).match(/^https?:\/\/(?:www\.)?([^/]+)/i)
    return { ...a, source: m ? m[1] : '' }
  }).filter(a => a.title && a.url)
}

// ⚠️ GOOGLE REFUSE LES AGENTS QUI SE DÉCLARENT ROBOTS. Avec un `User-Agent` maison,
// news.google.com répond 503 à tous les coups depuis un serveur — ce n'est pas une panne,
// c'est un refus. On se présente donc comme un navigateur ordinaire et on demande du
// français, ce qui est exactement ce que fait un lecteur de flux RSS.
// On ne contourne rien : ni CAPTCHA, ni authentification, ni paywall. Le flux RSS est
// public et prévu pour être lu par des programmes.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
}

// Bing News, en second. Google reste la source PRIORITAIRE, mais un relais qui rend
// « 0 actualité » parce qu'une source a dit non est un relais inutile : on a une réponse
// à donner, il faut aller la chercher ailleurs.
const BING_RSS = 'https://www.bing.com/news/search'

async function readRss(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS, cf: { cacheTtl: 900, cacheEverything: true } })
  if (!res.ok) return { error: res.status, items: [] }
  const xml = await res.text()
  return { error: 0, items: parseRss(xml) }
}

async function getNews(company) {
  // `when:30d` borne la fenêtre côté Google ; on refiltre ensuite sur la date, le
  // flux renvoyant parfois des articles plus anciens.
  const q = `"${company}" when:${WINDOW_DAYS}d`
  const google = await readRss(`${RSS_BASE}?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`)
  let parsed = google.items
  let source = 'google'
  if (!parsed.length) {
    const bing = await readRss(`${BING_RSS}?q=${encodeURIComponent(`"${company}"`)}&format=RSS&setmkt=fr-FR&setlang=fr`)
    if (bing.items.length) { parsed = bing.items; source = 'bing' }
    else if (google.error) throw new Error(`Aucune source d'actualités n'a répondu (Google ${google.error}${bing.error ? `, Bing ${bing.error}` : ''}).`)
  }

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
  return { articles: out, source }
}

// ---------------------------------------------------------------- Gemini

// ---------------------------------------------------------------- Appel Gemini
// ⚠️ LES MODÈLES SONT RETIRÉS SANS PRÉAVIS. `gemini-2.0-flash` a cessé de répondre du jour
// au lendemain, et tout s'est arrêté sur un 404 — alors que Google DIT dans son message
// d'erreur quel modèle prend la relève. On lit donc cette indication et on rejoue l'appel
// une fois avec le modèle proposé : la prochaine mise à la retraite ne cassera rien, et le
// relais signale le modèle réellement utilisé plutôt que celui qu'on croyait appeler.
const DEFAULT_MODELS = ['gemini-3.6-flash', 'gemini-flash-lite-latest']

// Chaque modèle a son PROPRE compteur de quota. Quand l'un dit « trop de requêtes », le
// suivant peut très bien répondre — c'est la seule façon d'étendre une offre gratuite sans
// la payer. On les essaie donc dans l'ordre, du plus capable au plus économe.
const modelList = (env) => String(env.GEMINI_MODELS || env.GEMINI_MODEL || DEFAULT_MODELS.join(','))
  .split(',').map(x => x.trim()).filter(Boolean)

const retryDelayOf = (text) => {
  const m = text.match(/"retryDelay"\s*:\s*"(\d+)s"/)
  return m ? Number(m[1]) : 0
}

async function callGemini(payload, env) {
  const key = env.GEMINI_API_KEY
  if (!key) throw new Error("Le relais n'a pas de clé Gemini configurée.")
  const models = modelList(env)
  const once = async (m) => {
    const res = await fetch(`${GEMINI_BASE}/${m}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    return { res, text: res.ok ? null : await res.text().catch(() => '') }
  }

  let lastQuota = null
  for (let i = 0; i < models.length; i++) {
    const model = models[i]
    let { res, text } = await once(model)
    if (res.ok) return { body: await res.json(), model }

    // Modèle retiré : Google nomme son successeur dans l'erreur. On prend CELUI-LÀ, jamais
    // un autre — et une seule fois, pour ne pas partir en cascade.
    if (res.status === 404) {
      const suggested = (text.match(/models\/([A-Za-z0-9._-]+)/g) || [])
        .map(x => x.replace('models/', '')).filter(x => x !== model)[0]
      if (suggested) {
        const retry = await once(suggested)
        if (retry.res.ok) return { body: await retry.res.json(), model: suggested }
        res = retry.res; text = retry.text
      }
    }
    // Quota atteint sur CE modèle : on tente le suivant de la liste avant d'abandonner.
    if (res.status === 429) { lastQuota = { text, model }; continue }
    throw new Error(`Gemini a répondu ${res.status}${text ? ' — ' + text.slice(0, 200) : ''}`)
  }

  // Tous les modèles ont dit non : c'est un vrai plafond, et la seule chose utile à dire
  // est DANS COMBIEN DE TEMPS réessayer. Google l'indique dans le corps de l'erreur.
  const wait = lastQuota ? retryDelayOf(lastQuota.text) : 0
  const err = new Error(wait
    ? `Quota Google atteint sur tous les modèles. Réessayez dans ${wait} seconde${wait > 1 ? 's' : ''}.`
    : "Quota Google atteint (offre gratuite) sur tous les modèles. Réessayez dans une minute, ou demain si la limite quotidienne est atteinte.")
  err.code = 429
  err.retryAfter = wait || 60
  throw err
}

async function analyze(company, articles, env) {
  const { body, model } = await callGemini({
    contents: [{ parts: [{ text: PROMPT(company, articles) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  }, env)
  const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  let parsed
  try { parsed = JSON.parse(text) } catch (e) { throw new Error("Réponse de l'IA illisible.") }

  // On ne fait pas confiance à la forme renvoyée : un modèle peut inventer un champ,
  // en oublier un autre, ou rendre 12 signaux quand on en demandait 5.
  const urls = new Set(articles.map(a => a.url))
  const signals = (Array.isArray(parsed?.signals) ? parsed.signals : [])
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
  // Le modèle qui a RÉELLEMENT répondu — pas celui qu'on croyait appeler : avec la rotation
  // sur quota, ce n'est pas toujours le premier de la liste.
  return { signals, model }
}


// ============================================================ SALES SIGNALS
//  Un signal n'est PAS un article. C'est un FAIT — souvent établi par plusieurs preuves
//  venues de sources différentes — qui donne une raison d'appeler ce compte maintenant.
//  Le relais collecte les preuves ; l'IA, plus bas, les regroupe et les qualifie.
//
//  Trois sources, toutes PUBLIQUES et sans clé ni compte :
//   · la presse, avec des requêtes composées à partir des signaux que le client a cochés ;
//   · le site de l'entreprise (actualités, presse, implantations) ;
//   · sa page carrière — de loin le signal de croissance le plus direct.
//  Chacune s'éteint seule : une source muette ne doit jamais emporter les deux autres.

// Mots-clés par type de signal. Ils servent à COMPOSER les recherches : « Nom + levée de
// fonds » trouve ce qu'un flux générique noie. C'est toute la différence entre un
// agrégateur et un moteur.
const SIGNAL_QUERIES = {
  growth: ['croissance', 'développement'],
  hiring_mass: ['recrutement', 'recrute', 'embauches'],
  hiring_hr: ['recrutement RH', 'DRH recrute'],
  new_site: ['ouverture site', 'nouveau bureau', 'implantation'],
  international: ['international', 'filiale', "s'implante"],
  fundraising: ['levée de fonds', 'financement'],
  ma: ['acquisition', 'rachat', 'fusion'],
  exec_change: ['nomination', 'nommé directeur'],
  transformation: ['transformation', 'réorganisation'],
  hr_lead_change: ['DRH', 'directeur des ressources humaines'],
  tech_change: ['déploiement', 'logiciel', 'digitalisation'],
  financial_growth: ["chiffre d'affaires", 'résultats'],
  industrial: ['investissement', 'usine', 'site industriel'],
  strategy: ['stratégie', 'plan'],
  distress: ['restructuration', 'plan social', 'difficultés'],
  other: [],
}

// Pages à chercher sur un site d'entreprise. On ne parcourt pas le site : on suit les liens
// dont le texte ou l'adresse annonce l'une de ces pages, et on s'arrête là.
const SITE_PAGE_HINTS = [
  { re: /actualit|news|presse|press|blog|communiqu/i, kind: 'news' },
  { re: /a-propos|about|qui-sommes|notre-histoire/i, kind: 'about' },
  { re: /implantation|nos-bureaux|nos-sites|locations|agences/i, kind: 'sites' },
]
const CAREER_HINTS = /carriere|carrières|careers|recrutement|jobs|emploi|nous-rejoindre|join-us|talent/i
const MAX_PAGES = 4            // au-delà, on interroge un site, on ne le lit plus
const FETCH_TIMEOUT = 8000

const abs = (href, base) => { try { return new URL(href, base).toString() } catch (e) { return '' } }
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, '') } catch (e) { return '' } }
const textOf = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

async function getPage(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal, cf: { cacheTtl: 1800, cacheEverything: true } })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!/html|xml|text/i.test(ct)) return null
    return await res.text()
  } catch (e) { return null } finally { clearTimeout(t) }
}

// ⚠️ ROBOTS.TXT EST RESPECTÉ, et son absence vaut autorisation. On ne contourne rien :
// pas de CAPTCHA, pas d'authentification, pas de paywall. Un site qui dit non est un site
// qu'on ne lit pas — c'est aussi simple que ça.
async function robotsAllows(origin, path) {
  const txt = await getPage(origin + '/robots.txt')
  if (!txt) return true
  let applies = false
  for (const line of txt.split('\n')) {
    const l = line.split('#')[0].trim()
    if (/^user-agent:/i.test(l)) applies = /\*\s*$/.test(l)
    else if (applies && /^disallow:/i.test(l)) {
      const rule = l.split(':')[1].trim()
      if (rule && path.startsWith(rule)) return false
    }
  }
  return true
}

const links = (html, base) => [...String(html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)]
  .map(m => ({ url: abs(m[1], base), label: textOf(m[2]) }))
  .filter(l => l.url.startsWith('http'))

/** Pages publiques du site : actualités, à propos, implantations. */
async function collectWebsite(site) {
  if (!site) return []
  const home = await getPage(site)
  if (!home) return []
  const origin = new URL(site).origin
  const out = []
  const seen = new Set()
  for (const l of links(home, site)) {
    if (hostOf(l.url) !== hostOf(site)) continue
    const hint = SITE_PAGE_HINTS.find(h => h.re.test(l.url) || h.re.test(l.label))
    if (!hint || seen.has(l.url) || out.length >= MAX_PAGES) continue
    seen.add(l.url)
    const path = new URL(l.url).pathname
    if (!(await robotsAllows(origin, path))) continue
    const html = await getPage(l.url)
    if (!html) continue
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
    out.push({
      kind: 'website', sourceUrl: l.url, publisher: hostOf(l.url),
      title: textOf(title) || l.label || 'Page du site',
      content: textOf(html).slice(0, 1200), date: '',
    })
  }
  return out
}

/**
 * Page carrière : le nombre d'offres, les métiers, les localisations.
 * ⚠️ C'est une ESTIMATION, et l'écran le dira. Chaque site publie ses offres à sa façon ;
 * annoncer « 14 offres » comme un fait vérifié serait mentir sur la nature de la mesure.
 */
async function collectCareers(site) {
  if (!site) return []
  const home = await getPage(site)
  if (!home) return []
  const origin = new URL(site).origin
  const link = links(home, site).find(l => hostOf(l.url) === hostOf(site) && (CAREER_HINTS.test(l.url) || CAREER_HINTS.test(l.label)))
  if (!link) return []
  if (!(await robotsAllows(origin, new URL(link.url).pathname))) return []
  const html = await getPage(link.url)
  if (!html) return []

  // Les intitulés d'offres sont les liens dont l'adresse parle de job/offre/poste.
  const offers = links(html, link.url)
    .filter(l => /job|offre|poste|vacanc|career|recrut/i.test(l.url) && l.label && l.label.length > 3 && l.label.length < 120)
    .map(l => ({ title: l.label.trim(), url: l.url }))
  const uniq = [...new Map(offers.map(o => [o.title.toLowerCase(), o])).values()].slice(0, 60)
  const hr = uniq.filter(o => /\bRH\b|ressources humaines|HRBP|talent|recrut|paie|formation|people/i.test(o.title))
  return [{
    kind: 'careers', sourceUrl: link.url, publisher: hostOf(link.url),
    title: `${uniq.length} offre${uniq.length > 1 ? 's' : ''} publiée${uniq.length > 1 ? 's' : ''}`,
    content: uniq.map(o => o.title).join(' · ').slice(0, 1200),
    date: '', jobCount: uniq.length, hrCount: hr.length,
    jobs: uniq.slice(0, 25).map(o => o.title),
  }]
}

/** Presse, avec des requêtes composées à partir des signaux cochés. */
async function collectNews(company, types) {
  const queries = [`"${company}"`]
  types.slice(0, 6).forEach(t => (SIGNAL_QUERIES[t.id] || []).slice(0, 2)
    .forEach(k => queries.push(`"${company}" ${k}`)))
  const seen = new Set()
  const out = []
  for (const q of [...new Set(queries)].slice(0, 7)) {
    const r = await readRss(`${RSS_BASE}?q=${encodeURIComponent(q + ` when:${WINDOW_DAYS}d`)}&hl=fr&gl=FR&ceid=FR:fr`)
    for (const a of r.items) {
      const key = normTitle(a.title)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const ts = Date.parse(a.date)
      out.push({
        kind: 'news', sourceUrl: a.url, publisher: a.source, title: a.title,
        content: a.summary || '', date: Number.isFinite(ts) ? new Date(ts).toISOString() : '',
      })
      if (out.length >= MAX_ARTICLES) return out
    }
  }
  return out
}

// Empreinte d'une preuve : même entreprise, même jour, même titre normalisé = même fait,
// quelle que soit la source qui le rapporte.
const fingerprint = (company, it) =>
  `${normTitle(company)}|${(it.date || '').slice(0, 10)}|${normTitle(it.title).slice(0, 80)}`

async function collectSignals({ company, site, types, sources }) {
  const on = (id) => sources?.[id] !== false
  const jobs = []
  if (on('news')) jobs.push(collectNews(company, types || []).catch(() => []))
  if (on('website')) jobs.push(collectWebsite(site).catch(() => []))
  if (on('careers')) jobs.push(collectCareers(site).catch(() => []))
  const all = (await Promise.all(jobs)).flat()

  // Déduplication : une même information vue sur le site ET dans la presse ne fait pas
  // deux preuves. On garde une entrée, et on note toutes les sources qui la confirment.
  const byPrint = new Map()
  for (const it of all) {
    const fp = fingerprint(company, it)
    const prev = byPrint.get(fp)
    if (prev) { prev.alsoSeen = [...new Set([...(prev.alsoSeen || []), it.kind])]; continue }
    byPrint.set(fp, { ...it, fingerprint: fp, alsoSeen: [it.kind] })
  }
  const items = [...byPrint.values()]
  return {
    items,
    stats: {
      collected: all.length,
      kept: items.length,
      duplicates: all.length - items.length,
      bySource: ['news', 'website', 'careers'].map(k => ({ kind: k, n: all.filter(x => x.kind === k).length })),
    },
  }
}


// ---------------------------------------------------------------- Analyse contextualisée
// ⚠️ UN SEUL APPEL POUR TOUTE L'ENTREPRISE, pas un par article. C'est ce qui permet à
// l'IA de RASSEMBLER plusieurs preuves autour d'un même fait — « 8 nouvelles offres + un
// nouveau DRH + un nouveau bureau » devient UN signal de structuration, pas trois lignes.
// C'est aussi ce qui rend le coût tenable.
const SIGNAL_PROMPT = ({ company, rules, items, icp }) => `Tu es analyste commercial pour une équipe de prospection B2B.

CONTEXTE DE L'ÉQUIPE QUI VEND — c'est lui qui décide de ce qui est pertinent :
· Son activité : ${rules.activite || '(non précisée)'}
· Ce qu'elle vend : ${rules.offre || '(non précisé)'}
· Ses clients types (ICP) : ${icp || '(non précisé)'}
· Les personas visés : ${(rules.personas || []).join(', ') || '(non précisés)'}
· Signaux recherchés, par ordre d'importance : ${(rules.types || []).map(t => `${t.label} (priorité ${t.priority})`).join(', ') || '(tous)'}
${rules.consignes ? `· Consignes : ${rules.consignes}` : ''}

ENTREPRISE ANALYSÉE : « ${company} »

RÈGLES ABSOLUES :
· Tu ne t'appuies QUE sur les preuves ci-dessous. Aucune information venue d'ailleurs, aucune déduction sur ce qui n'y figure pas.
· Une simple mention de l'entreprise n'est PAS un signal commercial. S'il n'y a rien de commercialement exploitable, réponds {"signals":[]} — c'est une réponse correcte.
· REGROUPE les preuves qui décrivent le même mouvement en UN SEUL signal, en citant toutes ses preuves.
· Tu écris en français, court et factuel.

Réponds en JSON strict, sans texte autour :
{"signals":[{"type":"<id>","title":"...","summary":"...","whyNow":"...","whyRelevant":"...","opportunity":"...","persona":"...","action":"...","importance":0,"relevance":0,"confidence":0,"evidence":[0]}]}

· type : l'un de ${(rules.types || []).map(t => t.id).join(', ') || 'growth, hiring_mass, hiring_hr, new_site, international, fundraising, ma, exec_change, transformation, hr_lead_change, tech_change, financial_growth, industrial, strategy, distress, other'}
· title : le fait, en une ligne
· summary : ce qui s'est passé, deux phrases maximum
· whyNow : ce qui rend ce moment opportun
· whyRelevant : le lien explicite avec l'activité, l'offre, l'ICP ou le persona ci-dessus
· opportunity : ce que le commercial peut concrètement proposer
· persona : la fonction à contacter, parmi les personas visés quand c'est possible
· action : la prochaine action, en une phrase
· importance : 0-100, l'ampleur du fait en soi
· relevance : 0-100, sa pertinence POUR CETTE OFFRE
· confidence : 0-100, la solidité des preuves
· evidence : les NUMÉROS des preuves utilisées

5 signaux maximum, du plus pertinent au moins pertinent.

PREUVES :
${items.map((it, i) => `[${i}] (${it.kind}${it.jobCount != null ? `, ${it.jobCount} offres dont ${it.hrCount} RH` : ''}) ${it.title}
source: ${it.publisher || 'inconnue'} — ${it.sourceUrl}
date: ${it.date || 'inconnue'}
extrait: ${(it.content || '').slice(0, 500)}`).join('\n\n')}`

async function analyzeSignals({ company, rules, items, icp }, env) {
  const { body, model } = await callGemini({
    contents: [{ parts: [{ text: SIGNAL_PROMPT({ company, rules, items, icp }) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  }, env)
  const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  let parsed
  try { parsed = JSON.parse(text) } catch (e) { throw new Error("Réponse de l'IA illisible.") }

  const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
  const signals = (Array.isArray(parsed?.signals) ? parsed.signals : []).slice(0, 5).map(sg => {
    // Les preuves citées sont RÉSOLUES sur nos propres éléments : un indice inventé ne
    // désigne rien, et une source fabriquée n'a aucun moyen d'atteindre l'écran.
    const evidence = (Array.isArray(sg.evidence) ? sg.evidence : [])
      .map(i => items[Number(i)]).filter(Boolean)
      .map(it => ({ kind: it.kind, title: it.title, publisher: it.publisher, url: it.sourceUrl, date: it.date }))
    return {
      type: String(sg.type || 'other').slice(0, 40),
      title: String(sg.title || '').slice(0, 200),
      summary: String(sg.summary || '').slice(0, 600),
      whyNow: String(sg.whyNow || '').slice(0, 400),
      whyRelevant: String(sg.whyRelevant || '').slice(0, 400),
      opportunity: String(sg.opportunity || '').slice(0, 400),
      persona: String(sg.persona || '').slice(0, 80),
      action: String(sg.action || '').slice(0, 400),
      importance: clamp(sg.importance),
      relevance: clamp(sg.relevance),
      confidence: clamp(sg.confidence),
      evidence,
      // La date du signal est celle de sa preuve la plus récente : c'est elle qui dit si
      // le fait est encore une raison d'appeler.
      date: evidence.map(e => e.date).filter(Boolean).sort().pop() || '',
    }
  }).filter(sg => sg.title && sg.evidence.length)
  return { signals, model }
}

// ---------------------------------------------------------------- Enrichissement
// ⚠️ LE RELAIS NE RENVOIE QUE LES CHAMPS DEMANDÉS. C'est la garantie structurelle que
// l'enrichissement ne peut PAS inventer de champ : l'application envoie la liste de ses
// champs existants, et tout ce qui n'y figure pas est jeté ici, avant même d'être affiché.
// Un modèle bavard qui ajouterait « effectif » ou « email » ne sera jamais entendu.
const ENRICH_SPECS = {
  site: { label: 'site web officiel', hint: 'URL complète du site officiel de l\'entreprise' },
  linkedin: { label: 'page LinkedIn de l\'entreprise', hint: 'URL linkedin.com/company/... — la PAGE ENTREPRISE, jamais un profil de personne' },
  localisation: { label: 'localisation du siège', hint: 'Ville et pays, ex. « Paris, France »' },
  ca: { label: "chiffre d'affaires", hint: 'Montant annuel publié, ex. « 12 M€ (2024) ». Uniquement s\'il est publié officiellement.' },
  effectif: { label: "effectif de l'entreprise", hint: 'Nombre de collaborateurs, ex. « 250 » ou « 200-500 ». Uniquement si une source publique le donne.' },
  secteur: { label: "secteur d'activité", hint: 'En quelques mots, ex. « Logiciel RH (SaaS) »' },
}

const ENRICH_PROMPT = (company, fields, known) => `Tu recherches des informations PUBLIQUES sur l'ENTREPRISE « ${company} ».

RÈGLES ABSOLUES :
· Tu ne renseignes QUE ce que tu trouves réellement dans des sources publiques. Aucune estimation, aucune déduction, aucune moyenne du secteur.
· Si tu ne trouves pas une information de façon fiable, tu réponds null pour ce champ. « null » est une réponse correcte et attendue.
· Tu ne cherches AUCUNE information sur des PERSONNES : ni e-mail, ni téléphone, ni adresse, ni profil individuel. Uniquement l'entreprise elle-même.
· Tu ne renseignes QUE les champs listés ci-dessous. Aucun autre champ, sous aucun prétexte.

CHAMPS DEMANDÉS :
${fields.map(f => `· ${f} — ${ENRICH_SPECS[f].label} : ${ENRICH_SPECS[f].hint}`).join('\n')}

DÉJÀ CONNU dans la fiche (à confirmer ou corriger si une source publique dit autre chose) :
${fields.map(f => `· ${f} : ${known[f] ? known[f] : '(vide)'}`).join('\n')}

Réponds UNIQUEMENT en JSON, sans texte autour ni balises de code :
{${fields.map(f => `"${f}":{"value":"...","publisher":"...","url":"...","confidence":"low|medium|high"}`).join(',')}}
Chaque champ vaut soit cet objet, soit null.
· value : la valeur, telle qu'elle s'écrit dans la source
· publisher : le nom du site d'où elle vient
· url : l'adresse exacte de la page consultée
· confidence : high si la source est officielle (site de l'entreprise, registre public), medium si c'est une source secondaire fiable, low sinon`

const CONFIDENCES = ['low', 'medium', 'high']
const isHttp = (u) => /^https?:\/\/\S+$/i.test(String(u || ''))
// Les valeurs qui ressemblent à une donnée personnelle sont refusées, même si le modèle
// les a glissées dans un champ d'entreprise : une adresse e-mail nominative ou un numéro
// de portable n'a rien à faire dans une fiche société, et rien ne la lui a demandée.
const looksPersonal = (v) => /@/.test(v) || /\b0[67](?:[ .-]?\d{2}){4}\b/.test(v)

async function enrich(company, fields, known, env) {
  const { body, model } = await callGemini({
    contents: [{ parts: [{ text: ENRICH_PROMPT(company, fields, known) }] }],
    // Recherche Google : sans elle, le modèle répondrait de mémoire — c'est-à-dire
    // qu'il inventerait. La consigne « ne rien inventer » n'a de sens qu'avec une source.
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0 },
  }, env)
  const raw = body?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  // Le modèle encadre souvent son JSON de balises de code malgré la consigne.
  const text = raw.replace(/^[\s\S]*?```(?:json)?/i, '').replace(/```[\s\S]*$/, '').trim() || raw.trim()
  let parsed
  try { parsed = JSON.parse(text) } catch (e) { throw new Error("Réponse de l'IA illisible.") }

  const out = {}
  for (const f of fields) {              // on itère sur les champs DEMANDÉS, pas sur la réponse
    const v = parsed?.[f]
    if (!v || typeof v !== 'object') { out[f] = null; continue }
    const value = String(v.value ?? '').trim()
    if (!value || value.toLowerCase() === 'null' || looksPersonal(value)) { out[f] = null; continue }
    if (f === 'site' && !isHttp(value)) { out[f] = null; continue }
    if (f === 'linkedin' && !(isHttp(value) && /linkedin\.com\/company\//i.test(value))) { out[f] = null; continue }
    const url = isHttp(v.url) ? v.url : ''
    out[f] = {
      value: value.slice(0, 300),
      publisher: String(v.publisher || '').slice(0, 120),
      url,
      // Sans source vérifiable, la confiance ne peut pas être haute, quoi qu'en dise le modèle.
      confidence: url && CONFIDENCES.includes(String(v.confidence || '').toLowerCase())
        ? String(v.confidence).toLowerCase() : 'low',
    }
  }
  const usage = body?.usageMetadata || {}
  return { found: out, model, inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 }
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
        const news = await getNews(q)
        return json({ articles: news.articles, source: news.source }, request, env)
      }

      if (url.pathname === '/analyze' && request.method === 'POST') {
        const body = await request.json().catch(() => null)
        const company = String(body?.company || '').trim()
        const articles = Array.isArray(body?.articles) ? body.articles.slice(0, MAX_ARTICLES) : []
        if (!company || !articles.length) return json({ error: 'Entreprise ou articles manquants.' }, request, env, 400)
        return json(await analyze(company, articles, env), request, env)
      }

      if (url.pathname === '/signals/collect' && request.method === 'POST') {
        const b = await request.json().catch(() => null)
        const company = String(b?.company || '').trim()
        if (!company) return json({ error: "Nom d'entreprise manquant." }, request, env, 400)
        return json(await collectSignals({
          company, site: String(b?.site || ''), types: b?.types || [], sources: b?.sources || {},
        }), request, env)
      }

      if (url.pathname === '/signals/analyze' && request.method === 'POST') {
        const b = await request.json().catch(() => null)
        const company = String(b?.company || '').trim()
        const items = Array.isArray(b?.items) ? b.items.slice(0, MAX_ARTICLES) : []
        if (!company || !items.length) return json({ error: 'Entreprise ou preuves manquantes.' }, request, env, 400)
        return json(await analyzeSignals({ company, rules: b?.rules || {}, items, icp: b?.icp || '' }, env), request, env)
      }

      if (url.pathname === '/enrich' && request.method === 'POST') {
        const body = await request.json().catch(() => null)
        const company = String(body?.company || '').trim()
        // Les champs viennent de l'APPLICATION : elle seule sait lesquels existent chez elle.
        const fields = (Array.isArray(body?.fields) ? body.fields : []).filter(f => ENRICH_SPECS[f])
        if (!company || !fields.length) return json({ error: 'Entreprise ou champs manquants.' }, request, env, 400)
        return json(await enrich(company, fields, body?.known || {}, env), request, env)
      }

      // La racine répond comme /health : ouvrir l'URL du relais dans un navigateur doit
      // suffire à savoir s'il est vivant. Renvoyer « Route inconnue » à la seule adresse
      // qu'on pense à essayer envoyait chercher une panne là où il n'y en avait pas.
      if (url.pathname === '/health' || url.pathname === '/' || url.pathname === '') {
        return json({ ok: true, gemini: !!env.GEMINI_API_KEY, service: 'bdr-news' }, request, env)
      }
    } catch (e) {
      // Un quota atteint n'est pas une panne du relais : on le dit avec son propre code,
      // pour que l'application propose d'attendre plutôt que d'annoncer une erreur technique.
      const status = e && e.code === 429 ? 429 : 502
      return json({ error: e && e.message ? e.message : String(e), code: e?.code, retryAfter: e?.retryAfter }, request, env, status)
    }
    return json({ error: 'Route inconnue.' }, request, env, 404)
  },
}
