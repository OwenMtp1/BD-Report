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

// ⚠️ TOUS LES QUOTAS NE SE CONTOURNENT PAS DE LA MÊME FAÇON, et c'est ce qui manquait.
// La rotation de modèles ne vaut que pour un quota PAR MODÈLE. Certaines limites portent
// sur autre chose — au premier chef l'outil de recherche Google (le « grounding »), dont
// le compteur est commun à tous les modèles et bien plus serré que celui du texte. Face
// à une limite de ce genre, essayer les modèles l'un après l'autre ne fait que perdre du
// temps pour recevoir trois fois le même refus.
// Google nomme la limite atteinte dans le corps de l'erreur : on la LIT.
const quotaMetricOf = (text) => (String(text || '').match(/"quotaMetric"\s*:\s*"([^"]+)"/) || [])[1] || ''
const isGroundingQuota = (text) => /ground|search/i.test(quotaMetricOf(text)) || /google_?search/i.test(String(text || ''))

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
    // SAUF si la limite ne porte pas sur le modèle : les suivants la rencontreront à
    // l'identique, et l'utilisateur aura attendu trois refus au lieu d'un.
    if (res.status === 429) {
      lastQuota = { text, model }
      if (isGroundingQuota(text)) break
      continue
    }
    // Le code HTTP est conservé : l'appelant doit pouvoir distinguer « outil refusé »
    // (400) de « modèle en panne » (5xx) — ils n'appellent pas le même remède.
    const httpErr = new Error(`Gemini a répondu ${res.status}${text ? ' — ' + text.slice(0, 200) : ''}`)
    httpErr.status = res.status
    throw httpErr
  }

  // Plus de modèle à essayer : c'est un vrai plafond. La chose utile à dire est LAQUELLE
  // des limites a été atteinte — elles ne se contournent pas de la même façon — et dans
  // combien de temps réessayer. Google indique les deux dans le corps de l'erreur.
  const wait = lastQuota ? retryDelayOf(lastQuota.text) : 0
  const grounded = lastQuota ? isGroundingQuota(lastQuota.text) : false
  const quand = wait ? `Réessayez dans ${wait} seconde${wait > 1 ? 's' : ''}.` : 'Réessayez dans une minute, ou demain si la limite quotidienne est atteinte.'
  const err = new Error(grounded
    ? `Quota de recherche Google atteint (offre gratuite). Cette limite est commune à tous les modèles : changer de modèle n'y change rien. ${quand}`
    : `Quota Google atteint (offre gratuite) sur tous les modèles. ${quand}`)
  err.code = 429
  err.retryAfter = wait || 60
  err.grounding = grounded
  err.quotaMetric = lastQuota ? quotaMetricOf(lastQuota.text) : ''
  throw err
}

// ⚠️ IL N'Y A PLUS QU'UNE SEULE ANALYSE — `analyzeSignals`, plus bas. L'analyse
// « actualités » avait son propre prompt, sans le contexte de l'équipe : elle jugeait
// donc l'intérêt commercial d'un fait sans savoir ce que l'équipe vend. Deux prompts
// pour une même question, c'est aussi deux endroits à corriger, et c'est ainsi que
// celui-ci a fini par appeler un `PROMPT` supprimé — « PROMPT is not defined » à
// l'écran, sur la seule branche qu'aucun test ne couvrait.
// Un article est une PREUVE de presse comme une autre : il suffit de le dire.
const articleToEvidence = (a) => ({
  kind: 'news', sourceUrl: a.url || '', publisher: a.source || '', title: a.title || '',
  content: a.summary || '', date: a.date || '',
})


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

/**
 * Presse. ⚠️ LA RECHERCHE DE BASE PASSE PAR `getNews`, c'est-à-dire par le chemin qui
 * marche : en-têtes de navigateur, fenêtre de 30 jours, ET REPLI SUR BING quand Google
 * refuse. La version précédente composait sept requêtes spécialisées et les envoyait
 * toutes à Google, sans repli : sept appels rapprochés depuis un Worker, Google limite,
 * les sept reviennent vides — et l'appelant recevait « 0 preuve publique » sans qu'aucune
 * source n'ait vraiment été interrogée.
 * Les requêtes composées (« Nom + levée de fonds ») restent, mais comme un BONUS qui
 * s'ajoute : leur échec n'emporte plus la recherche de base.
 */
async function collectNews(company, types) {
  const seen = new Set()
  const out = []
  const push = (a) => {
    const key = normTitle(a.title)
    if (!key || seen.has(key) || out.length >= MAX_ARTICLES) return
    seen.add(key)
    const ts = Date.parse(a.date)
    out.push({
      kind: 'news', sourceUrl: a.url, publisher: a.source, title: a.title,
      content: a.summary || '', date: Number.isFinite(ts) ? new Date(ts).toISOString() : '',
    })
  }

  // 1) Le socle : la recherche qui a toujours fonctionné, repli compris.
  let baseError = ''
  try { (await getNews(company)).articles.forEach(push) } catch (e) { baseError = e?.message || String(e) }

  // 2) Le bonus : des requêtes ciblées sur les signaux que le staff a cochés. On s'arrête
  //    dès que le socle a rempli la page — inutile de payer des appels pour du rab.
  const extra = [...new Set(types.slice(0, 6).flatMap(t => (SIGNAL_QUERIES[t.id] || []).slice(0, 2)))].slice(0, 4)
  for (const k of extra) {
    if (out.length >= MAX_ARTICLES) break
    try {
      const r = await readRss(`${RSS_BASE}?q=${encodeURIComponent(`"${company}" ${k} when:${WINDOW_DAYS}d`)}&hl=fr&gl=FR&ceid=FR:fr`)
      r.items.forEach(push)
    } catch (e) { /* un mot-clé muet n'est pas une panne */ }
  }
  // Une erreur ne compte QUE si rien n'a été trouvé : ce qu'on a vaut mieux que le récit
  // de ce qui a manqué.
  if (!out.length && baseError) { const err = new Error(baseError); err.soft = true; throw err }
  return out
}

// Empreinte d'une preuve : même entreprise, même jour, même titre normalisé = même fait,
// quelle que soit la source qui le rapporte.
const fingerprint = (company, it) =>
  `${normTitle(company)}|${(it.date || '').slice(0, 10)}|${normTitle(it.title).slice(0, 80)}`

async function collectSignals({ company, site, types, sources }) {
  const on = (id) => sources?.[id] !== false
  // ⚠️ CHAQUE SOURCE REND SES COMPTES. Les erreurs partaient dans un `.catch(() => [])` :
  // une source éteinte par le staff, un site absent, un refus de Google et une page
  // carrière introuvable produisaient tous le même « 0 preuve publique », impossible à
  // diagnostiquer depuis l'écran. Le motif remonte maintenant avec le résultat.
  const run = async (id, fn, skipWhy) => {
    if (!on(id)) return { id, n: 0, why: 'Source désactivée dans la règle de cet environnement.', off: true }
    if (skipWhy) return { id, n: 0, why: skipWhy }
    try { const items = await fn(); return { id, items, n: items.length, why: items.length ? '' : 'Aucun résultat.' } }
    catch (e) { return { id, n: 0, why: (e && e.message) || String(e), error: true } }
  }
  const noSite = site ? '' : "Aucun site web n'est renseigné sur la fiche."
  const report = await Promise.all([
    run('news', () => collectNews(company, types || [])),
    run('website', () => collectWebsite(site), noSite),
    run('careers', () => collectCareers(site), noSite),
  ])
  const all = report.flatMap(r => r.items || [])

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
      bySource: report.map(r => ({ kind: r.id, n: r.n, why: r.why, error: !!r.error, off: !!r.off })),
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

const CONFIDENCES = ['low', 'medium', 'high']
const isHttp = (u) => /^https?:\/\/\S+$/i.test(String(u || ''))
// Les valeurs qui ressemblent à une donnée personnelle sont refusées, même si le modèle
// les a glissées dans un champ d'entreprise : une adresse e-mail nominative ou un numéro
// de portable n'a rien à faire dans une fiche société, et rien ne la lui a demandée.
const looksPersonal = (v) => /@/.test(v) || /\b0[67](?:[ .-]?\d{2}){4}\b/.test(v)

const REGISTRY = 'https://recherche-entreprises.api.gouv.fr/search'
const REGISTRY_PAGE = (siren) => `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`

// Codes INSEE de tranche d'effectif. L'annuaire rend un code, pas un nombre : le traduire
// ici évite d'afficher « 42 » là où l'utilisateur attend un ordre de grandeur.
const INSEE_TRANCHES = {
  '00': '0 salarié', '01': '1 à 2', '02': '3 à 5', '03': '6 à 9', '11': '10 à 19',
  '12': '20 à 49', '21': '50 à 99', '22': '100 à 199', '31': '200 à 249', '32': '250 à 499',
  '41': '500 à 999', '42': '1 000 à 1 999', '51': '2 000 à 4 999', '52': '5 000 à 9 999',
  '53': '10 000 et plus',
}

/**
 * Cherche l'entreprise dans l'annuaire officiel. Renvoie `{found, raw}` — `raw` sert au
 * diagnostic : si la forme de la réponse changeait, on veut le VOIR plutôt que de rendre
 * silencieusement un résultat vide.
 * ⚠️ Tolérant par construction : plusieurs noms de champs sont acceptés, et tout ce qui
 * manque vaut simplement « non trouvé ». Une API publique qui évolue ne doit jamais faire
 * tomber l'enrichissement entier.
 */
async function officialRegistry(company) {
  const name = String(company || '').trim()
  if (!name) return { found: {}, raw: null }
  const res = await fetch(`${REGISTRY}?q=${encodeURIComponent(name)}&per_page=1`, {
    headers: { Accept: 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true },
  })
  if (!res.ok) throw new Error(`Annuaire des entreprises : ${res.status}`)
  const body = await res.json()
  const r = (body?.results || [])[0]
  if (!r) return { found: {}, raw: { total: body?.total_results ?? 0 } }

  const siren = String(r.siren || '')
  const url = siren ? REGISTRY_PAGE(siren) : 'https://annuaire-entreprises.data.gouv.fr/'
  const src = (value) => (value ? { value: String(value).slice(0, 300), publisher: 'Annuaire des entreprises (INSEE)', url, confidence: 'high' } : null)

  const siege = r.siege || {}
  const ville = siege.libelle_commune || siege.commune || ''
  const cp = siege.code_postal || ''
  const lieu = ville ? `${ville}${cp ? ` (${cp})` : ''}, France` : ''

  const code = String(r.tranche_effectif_salarie ?? '').padStart(2, '0')
  const tranche = INSEE_TRANCHES[code] || ''

  const naf = r.libelle_activite_principale || siege.libelle_activite_principale || ''

  return {
    found: { localisation: src(lieu), effectif: src(tranche), secteur: src(naf) },
    raw: { siren, nom: r.nom_complet || r.nom_raison_sociale || '', keys: Object.keys(r).slice(0, 20) },
  }
}

// ---------------------------------------------------------------- Wikidata
// ⚠️ L'ANNUAIRE NE DONNE NI SITE, NI LINKEDIN, NI CHIFFRE D'AFFAIRES — et ce sont
// précisément les trois champs qui restaient à la charge de l'IA, donc du quota.
// Wikidata les publie : base libre (CC0), sans clé, sans quota, et explicitement faite
// pour être interrogée par des programmes. Aucun contournement, aucune page scrapée.
const WD_API = 'https://www.wikidata.org/w/api.php'
const WD_PROPS = { site: 'P856', linkedin: 'P4264', ca: 'P2139', effectif: 'P1128' }
// Ce qui désigne une organisation dans la description d'une entité. Sans ce filtre,
// chercher « Orange » ramène le fruit — et l'enrichissement irait remplir la fiche
// d'un client avec les données d'un agrume.
const WD_ORG = /entreprise|société|societe|company|corporation|organisation|organization|groupe|group|firm|éditeur|editor|startup|banque|bank|assurance/i
const wdNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')

const wdClaim = (claims, prop) => (claims?.[prop] || [])
  .map(c => c.mainsnak?.datavalue?.value).filter(v => v != null)[0]

/**
 * Cherche l'entreprise dans Wikidata. ⚠️ On ne retient une entité que si son nom
 * CORRESPOND et que sa description parle d'une organisation : une homonymie silencieuse
 * remplirait la fiche d'un client avec les données de quelqu'un d'autre, ce qui est pire
 * que ne rien trouver.
 */
async function wikidata(company) {
  const name = String(company || '').trim()
  if (!name) return { found: {}, raw: null }
  const search = await fetch(`${WD_API}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=fr&uselang=fr&type=item&limit=5&format=json`,
    { headers: { Accept: 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true } })
  if (!search.ok) throw new Error(`Wikidata : ${search.status}`)
  const hits = (await search.json())?.search || []
  const target = wdNorm(name)
  const hit = hits.find(h => wdNorm(h.label) === target && WD_ORG.test(h.description || ''))
  if (!hit) return { found: {}, raw: { candidats: hits.map(h => `${h.label} — ${h.description || ''}`).slice(0, 3) } }

  const ent = await fetch(`${WD_API}?action=wbgetentities&ids=${encodeURIComponent(hit.id)}&props=claims&format=json`,
    { headers: { Accept: 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true } })
  if (!ent.ok) throw new Error(`Wikidata : ${ent.status}`)
  const claims = (await ent.json())?.entities?.[hit.id]?.claims || {}
  const url = `https://www.wikidata.org/wiki/${hit.id}`
  // Wikidata est une source SECONDAIRE, tenue par des contributeurs : « medium », jamais « high ».
  const src = (value) => (value ? { value: String(value).slice(0, 300), publisher: 'Wikidata', url, confidence: 'medium' } : null)

  const money = wdClaim(claims, WD_PROPS.ca)
  const emp = wdClaim(claims, WD_PROPS.effectif)
  const li = wdClaim(claims, WD_PROPS.linkedin)
  const web = wdClaim(claims, WD_PROPS.site)
  const amount = money?.amount ? String(money.amount).replace(/^\+/, '') : ''

  return {
    found: {
      site: typeof web === 'string' ? src(web) : null,
      linkedin: typeof li === 'string' ? src(`https://www.linkedin.com/company/${li}`) : null,
      ca: amount ? src(`${Number(amount).toLocaleString('fr-FR')} ${/Q4916$/.test(money.unit || '') ? '€' : ''}`.trim()) : null,
      effectif: emp?.amount ? src(String(emp.amount).replace(/^\+/, '')) : null,
    },
    raw: { id: hit.id, label: hit.label },
  }
}

/**
 * ENRICHISSEMENT — SOURCES PUBLIQUES UNIQUEMENT, PLUS AUCUNE IA.
 *
 * ⚠️ POURQUOI GEMINI A ÉTÉ RETIRÉ D'ICI. L'enrichissement passait par l'outil de recherche
 * Google, dont le quota gratuit est le plus serré de toute l'API — si serré qu'en pratique
 * la fonctionnalité ne répondait presque jamais : « Quota Google atteint » à chaque clic.
 * On a d'abord contourné (repli sur nos pages), puis réduit (l'annuaire d'abord). Restait
 * la vraie question : à quoi sert un modèle pour retrouver six champs que des bases
 * publiques publient déjà, gratuitement et de façon vérifiable ?
 *   · annuaire des entreprises (INSEE/État) → implantation, effectif, secteur
 *   · Wikidata (CC0)                        → site, LinkedIn, chiffre d'affaires
 * À elles deux, elles couvrent les six champs de la fiche. Sans clé, sans quota, sans
 * attente — et avec une source citable, ce qu'un modèle ne garantissait pas.
 *
 * Un champ qu'aucune source ne donne reste VIDE. C'est une réponse correcte : mieux vaut
 * un blanc qu'une valeur inventée, et c'était déjà la règle du temps de l'IA.
 *
 * ⚠️ Gemini reste utilisé pour les SIGNAUX, où il est irremplaçable : regrouper des preuves
 * éparses en un fait commercial n'est pas une recherche, c'est un jugement.
 */
async function enrich(company, fields) {
  // Les deux sources tournent EN PARALLÈLE et se complètent. L'échec de l'une n'arrête
  // rien : elles complètent, elles ne commandent pas.
  let registryError = ''
  let wikiError = ''
  const [reg, wiki] = await Promise.all([
    officialRegistry(company).catch(e => { registryError = (e && e.message) || String(e); return { found: {} } }),
    wikidata(company).catch(e => { wikiError = (e && e.message) || String(e); return { found: {} } }),
  ])

  const out = {}
  for (const f of fields) {
    // L'annuaire PRIME : une donnée d'État l'emporte sur une fiche collaborative.
    const v = reg.found[f] || wiki.found[f]
    // Dernière barrière, inchangée : aucune donnée personnelle dans une fiche société.
    out[f] = v && !looksPersonal(v.value) ? v : null
  }
  // Les garde-fous de forme restent : une URL qui n'en est pas une n'entre pas dans la fiche.
  if (out.site && !isHttp(out.site.value)) out.site = null
  if (out.linkedin && !(isHttp(out.linkedin.value) && /linkedin\.com\/company\//i.test(out.linkedin.value))) out.linkedin = null

  return {
    found: out, model: '', source: 'public', registryError, wikiError,
    inputTokens: 0, outputTokens: 0,
  }
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

      // Ancienne route « analyse d'actualités ». Elle reste servie parce qu'un navigateur
      // peut encore exécuter une version antérieure de l'application, mise en cache : la
      // faire disparaître casserait l'écran de quelqu'un qui n'a rien demandé. Elle passe
      // désormais par l'analyse UNIQUE, avec le contexte que le corps veut bien porter.
      if (url.pathname === '/analyze' && request.method === 'POST') {
        const body = await request.json().catch(() => null)
        const company = String(body?.company || '').trim()
        const articles = Array.isArray(body?.articles) ? body.articles.slice(0, MAX_ARTICLES) : []
        if (!company || !articles.length) return json({ error: 'Entreprise ou articles manquants.' }, request, env, 400)
        return json(await analyzeSignals({
          company, rules: body?.rules || {}, items: articles.map(articleToEvidence), icp: body?.icp || '',
        }, env), request, env)
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
        return json(await enrich(company, fields), request, env)
      }

      // ⚠️ /diag — LE RELAIS SE TESTE LUI-MÊME, ET LE DIT.
      // Une panne d'enrichissement a trois causes possibles (clé absente, quota de texte,
      // quota de RECHERCHE) et elles se corrigent différemment. Tant qu'on en était réduit
      // à les deviner depuis un message d'erreur, on cherchait au mauvais endroit. Cette
      // route interroge chaque brique POUR DE VRAI et rend un compte rendu lisible.
      // ⚠️ Aucun secret n'en sort : on dit si la clé existe, jamais ce qu'elle vaut.
      if (url.pathname === '/diag') {
        const q = (url.searchParams.get('q') || 'Doctolib').trim()
        const steps = []
        const step = async (id, label, fn) => {
          const t = Date.now()
          try { const detail = await fn(); steps.push({ id, label, ok: true, ms: Date.now() - t, detail }) }
          catch (e) { steps.push({ id, label, ok: false, ms: Date.now() - t, error: (e && e.message) || String(e), code: e?.code }) }
        }
        await step('key', 'Clé Gemini configurée', async () => {
          if (!env.GEMINI_API_KEY) throw new Error('Aucune clé : ajoutez le secret GEMINI_API_KEY dans Cloudflare.')
          return { models: modelList(env) }
        })
        await step('registry', `Annuaire des entreprises (« ${q} »)`, async () => {
          const r = await officialRegistry(q)
          const got = Object.keys(r.found).filter(k => r.found[k])
          if (!got.length) throw new Error(`Joignable, mais aucun champ exploité. Réponse : ${JSON.stringify(r.raw)}`)
          return { champs: got, valeurs: Object.fromEntries(got.map(k => [k, r.found[k].value])) }
        })
        await step('wikidata', `Wikidata (« ${q} »)`, async () => {
          const w = await wikidata(q)
          const got = Object.keys(w.found).filter(k => w.found[k])
          if (!got.length) throw new Error(`Joignable, mais aucune fiche d'entreprise reconnue. ${JSON.stringify(w.raw)}`)
          return { champs: got }
        })
        await step('news', `Presse (« ${q} »)`, async () => {
          const n = await getNews(q)
          return { articles: n.articles.length, source: n.source }
        })
        // Texte SANS outil : c'est le quota le plus large, celui des signaux.
        await step('gemini_text', 'Gemini — génération de texte', async () => {
          if (!env.GEMINI_API_KEY) throw new Error('Sans clé, rien à tester.')
          const { model } = await callGemini({
            contents: [{ parts: [{ text: 'Réponds exactement : {"ok":true}' }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
          }, env)
          return { model }
        })
        // ⚠️ LA BRIQUE QUI RÉPOND VRAIMENT À LA QUESTION. Voir « recherche Google
        // indisponible » n'apprend rien tant qu'on ignore si l'enrichissement fonctionne
        // MALGRÉ ça — et c'est justement tout l'objet du correctif. On le fait donc pour
        // de vrai, sur l'entreprise de test, et on dit combien de champs en sortent.
        await step('enrich', `Enrichissement de bout en bout (« ${q} »)`, async () => {
          const r = await enrich(q, ['site', 'linkedin', 'localisation', 'ca', 'effectif', 'secteur'])
          const got = Object.keys(r.found || {}).filter(k => r.found[k])
          if (!got.length) throw new Error(`Aucun champ trouvé. Annuaire : ${r.registryError || 'ok'} · Wikidata : ${r.wikiError || 'ok'}`)
          return { champs: got, source: r.source, valeurs: Object.fromEntries(got.map(k => [k, r.found[k].value])) }
        })

        const ko = steps.filter(s => !s.ok)
        // Le verdict est écrit ici, pas laissé à interpréter : c'est tout l'objet de la route.
        const enrichOk = steps.find(s => s.id === 'enrich')?.ok
        let verdict = 'Tout répond : enrichissement et signaux sont opérationnels.'
        if (ko.some(s => s.id === 'key')) verdict = "Le relais n'a pas de clé Gemini. Ajoutez le secret GEMINI_API_KEY dans Cloudflare, puis redéployez."
        // ⚠️ NOMMER CE QUI EST TOUCHÉ passe avant le constat général : « Gemini ne répond
        // pas » fait craindre le pire à qui vient d'enrichir une fiche, alors que
        // l'enrichissement ne dépend plus de lui du tout.
        else if (ko.some(s => s.id === 'gemini_text')) verdict = "Gemini ne répond pas : seuls les SIGNAUX sont concernés. L'enrichissement ne passe plus par l'IA — il continue de fonctionner."
        // Un service tiers en panne n'est PAS une panne du produit tant que le résultat
        // sort quand même. Le dire dans cet ordre évite de chercher un problème réglé.
        else if (enrichOk && ko.length) verdict = `L'enrichissement FONCTIONNE (${(steps.find(s => s.id === 'enrich')?.detail?.champs || []).length} champs trouvés). Ce qui est en rouge ci-dessous n'est pas bloquant.`
        else if (ko.some(s => s.id === 'registry') && ko.some(s => s.id === 'wikidata')) verdict = "Les deux sources publiques sont muettes : l'enrichissement dépendra entièrement de l'IA, donc du quota de recherche."
        else if (ko.some(s => s.id === 'registry' || s.id === 'wikidata')) verdict = "Une source publique sur deux répond : l'enrichissement fonctionne, avec une couverture un peu plus étroite."
        else if (ko.length) verdict = 'Une source secondaire ne répond pas ; le reste fonctionne.'
        return json({ ok: !ko.length, verdict, steps }, request, env)
      }

      // La racine répond comme /health : ouvrir l'URL du relais dans un navigateur doit
      // suffire à savoir s'il est vivant. Renvoyer « Route inconnue » à la seule adresse
      // qu'on pense à essayer envoyait chercher une panne là où il n'y en avait pas.
      if (url.pathname === '/health' || url.pathname === '/' || url.pathname === '') {
        return json({ ok: true, gemini: !!env.GEMINI_API_KEY, service: 'bdr-news', diag: '/diag' }, request, env)
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
