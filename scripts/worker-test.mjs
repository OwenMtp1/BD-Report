// ---------------------------------------------------------------------------
//  Test du relais (news/worker.js), exécuté à chaque `npm run audit`.
//
//  ⚠️ POURQUOI CE FICHIER EXISTE. Le relais est le SEUL morceau serveur de
//  l'application, et il n'était couvert par rien : ni le build (il n'est pas
//  dans le bundle), ni le smoke (il vit chez Cloudflare). Une route a donc pu
//  appeler un `PROMPT` supprimé et partir en production ; l'utilisateur a lu
//  « PROMPT is not defined » à l'écran. Un identifiant mort ne se voit qu'à
//  l'exécution : il faut donc exécuter.
//
//  Le réseau est entièrement simulé — aucun appel réel à Google ni à Gemini.
//  On vérifie le COMPORTEMENT du relais, pas la disponibilité des tiers.
// ---------------------------------------------------------------------------
import worker from '../news/worker.js'

let failures = 0
const ok = (cond, label) => { if (!cond) { console.error('  ✗ ' + label); failures++ } }

// --- Réponses simulées ------------------------------------------------------
const rss = (titles) => `<?xml version="1.0"?><rss><channel>${titles.map(t => `
  <item><title>${t}</title><link>https://presse.example/${encodeURIComponent(t)}</link>
  <pubDate>${new Date().toUTCString()}</pubDate><source url="https://presse.example">Presse</source>
  <description>Extrait sur ${t}.</description></item>`).join('')}</channel></rss>`

const geminiBody = (payload) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
})

/** Installe un faux `fetch`. `routes` = [regexp, handler] ; le premier qui matche répond. */
function stubFetch(routes) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    calls.push({ url: u, init })
    for (const [re, handler] of routes) {
      if (re.test(u)) {
        const r = await handler(u, init)
        if (r instanceof Response) return r
        return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}), { status: r.status ?? 200 })
      }
    }
    return new Response('not stubbed: ' + u, { status: 404 })
  }
  return calls
}

const call = (path, { method = 'GET', body } = {}) => worker.fetch(new Request('https://relay.test' + path, {
  method, body: body === undefined ? undefined : JSON.stringify(body),
  headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
}), { GEMINI_API_KEY: 'test-key' })

const GOOGLE = /news\.google\.com/
const BING = /bing\.com/
const GEMINI = /generativelanguage\.googleapis\.com/

// ---------------------------------------------------------------------------
console.log('Relais — santé et routage')
{
  stubFetch([])
  const res = await call('/health')
  const b = await res.json()
  ok(res.status === 200 && b.ok === true, '/health doit répondre 200')
  ok((await (await call('/')).json()).ok === true, "la racine doit répondre comme /health")
  ok((await call('/nimporte-quoi')).status === 404, 'une route inconnue doit répondre 404')
}

console.log('Actualités — /news')
{
  stubFetch([[GOOGLE, () => ({ body: rss(['Acme lève 10 M€', 'Acme ouvre un bureau']) })]])
  const b = await (await call('/news?q=Acme')).json()
  ok(b.articles?.length === 2, '/news doit rendre les articles trouvés')
  ok(b.source === 'google', '/news doit dire quelle source a répondu')
}
{
  // Google refuse (503) : le repli Bing est la raison d'être du second flux.
  stubFetch([[GOOGLE, () => ({ status: 503, body: 'nope' })], [BING, () => ({ body: rss(['Acme recrute']) })]])
  const b = await (await call('/news?q=Acme')).json()
  ok(b.source === 'bing' && b.articles?.length === 1, 'un refus de Google doit basculer sur Bing')
}
{
  stubFetch([[GOOGLE, () => ({ status: 503, body: '' })], [BING, () => ({ status: 503, body: '' })]])
  const res = await call('/news?q=Acme')
  ok(res.status === 502, 'deux sources muettes doivent remonter une erreur, pas un tableau vide')
}

// ⚠️ LA RÉGRESSION : cette route appelait un identifiant supprimé. Elle doit
// répondre, et son analyse doit être celle — unique — des signaux.
console.log("Ancienne route /analyze — elle ne doit plus référencer de fantôme")
{
  stubFetch([[GEMINI, () => ({
    body: geminiBody({ signals: [{ type: 'fundraising', title: 'Levée de 10 M€', summary: 'x', evidence: [0], importance: 80, relevance: 70, confidence: 90 }] }),
  })]])
  const res = await call('/analyze', { method: 'POST', body: { company: 'Acme', articles: [{ title: 'Acme lève 10 M€', url: 'https://presse.example/a', source: 'Presse', date: '2026-09-01', summary: 'x' }] } })
  const b = await res.json()
  ok(res.status === 200, '/analyze doit répondre 200 (et non 502 « … is not defined »)')
  ok(b.signals?.length === 1, '/analyze doit rendre le signal analysé')
  ok(b.signals?.[0]?.evidence?.[0]?.url === 'https://presse.example/a', "l'article doit être résolu comme preuve")
}

console.log('Collecte de signaux — chaque source rend ses comptes')
{
  // Google répond à la requête de base : la presse doit remonter même si les
  // requêtes composées (le bonus) ne donnent rien.
  stubFetch([[GOOGLE, (u) => (/levée|croissance|recrut/i.test(decodeURIComponent(u)) ? { body: rss([]) } : { body: rss(['Acme lève 10 M€']) })]])
  const b = await (await call('/signals/collect', { method: 'POST', body: { company: 'Acme', types: [{ id: 'fundraising' }] } })).json()
  ok(b.items?.length === 1, 'la recherche de base doit suffire à ramener des preuves')
  const news = b.stats?.bySource?.find(s => s.kind === 'news')
  ok(news?.n === 1, 'la presse doit être comptée par source')
}
{
  // Le cas qui rendait « 0 preuve publique » : Google limite, et il n'y avait pas
  // de repli. Bing doit prendre le relais, exactement comme pour /news.
  stubFetch([[GOOGLE, () => ({ status: 429, body: '' })], [BING, () => ({ body: rss(['Acme recrute 40 personnes']) })]])
  const b = await (await call('/signals/collect', { method: 'POST', body: { company: 'Acme', types: [] } })).json()
  ok(b.items?.length === 1, 'un refus de Google ne doit plus vider la collecte de signaux')
}
{
  // Sans site, deux sources sur trois sont inutilisables — et ça doit se DIRE.
  stubFetch([[GOOGLE, () => ({ body: rss([]) })]])
  const b = await (await call('/signals/collect', { method: 'POST', body: { company: 'Acme', types: [] } })).json()
  const site = b.stats?.bySource?.find(s => s.kind === 'website')
  ok(/site web/i.test(site?.why || ''), "l'absence de site doit être donnée comme motif")
  ok(b.stats.bySource.every(s => typeof s.why === 'string'), 'chaque source doit porter un motif')
}
{
  // Une source éteinte par la règle staff n'est pas une panne.
  stubFetch([[GOOGLE, () => ({ body: rss(['Acme']) })]])
  const b = await (await call('/signals/collect', { method: 'POST', body: { company: 'Acme', sources: { news: false } } })).json()
  const news = b.stats?.bySource?.find(s => s.kind === 'news')
  ok(news?.off === true && !news?.error, 'une source désactivée doit être signalée comme telle, pas comme une erreur')
}

console.log('Analyse contextualisée — aucune preuve inventée ne passe')
{
  stubFetch([[GEMINI, () => ({
    body: geminiBody({ signals: [
      { type: 'growth', title: 'Vrai signal', evidence: [0], importance: 50, relevance: 50, confidence: 50 },
      { type: 'growth', title: 'Signal sans preuve', evidence: [99], importance: 90, relevance: 90, confidence: 90 },
      { type: 'growth', title: 'Signal sans indice', importance: 90, relevance: 90, confidence: 90 },
    ] }),
  })]])
  const b = await (await call('/signals/analyze', { method: 'POST', body: {
    company: 'Acme', items: [{ kind: 'news', title: 'Acme grandit', sourceUrl: 'https://presse.example/x', publisher: 'Presse', date: '2026-09-01', content: 'x' }],
  } })).json()
  ok(b.signals?.length === 1 && b.signals[0].title === 'Vrai signal', 'un signal dont la preuve est inventée doit être refusé')
}
{
  // Quota : ce n'est ni une panne ni notre plafond — le code et le délai doivent remonter.
  stubFetch([[GEMINI, () => ({ status: 429, body: JSON.stringify({ error: { message: 'quota, retry in 42s' } }) })]])
  const res = await call('/signals/analyze', { method: 'POST', body: { company: 'Acme', items: [{ kind: 'news', title: 'x', sourceUrl: 'u' }] } })
  const b = await res.json()
  ok(res.status === 429 && b.code === 429, 'un quota doit remonter avec son propre code')
  ok(b.retryAfter > 0, 'un quota doit dire dans combien de temps réessayer')
}
{
  // Rotation de modèles : le premier dit non, le second répond. Le modèle RENDU
  // doit être celui qui a réellement répondu.
  let n = 0
  stubFetch([[GEMINI, () => (++n === 1
    ? { status: 429, body: JSON.stringify({ error: { message: 'quota' } }) }
    : { body: geminiBody({ signals: [{ type: 'growth', title: 'ok', evidence: [0], importance: 1, relevance: 1, confidence: 1 }] }) })]])
  const b = await (await call('/signals/analyze', { method: 'POST', body: { company: 'Acme', items: [{ kind: 'news', title: 'x', sourceUrl: 'u' }] } })).json()
  ok(n === 2, 'un quota sur un modèle doit faire essayer le suivant')
  ok(b.model === 'gemini-flash-lite-latest', 'le modèle rendu doit être celui qui a répondu')
}

console.log('Enrichissement — la liste des champs vient de l\'application')
{
  stubFetch([[GEMINI, () => ({
    body: geminiBody({ site: { value: 'https://acme.fr', publisher: 'Acme', url: 'https://acme.fr', confidence: 'high' },
      effectif: { value: '120', publisher: 'Societe.com', url: 'https://societe.com/acme', confidence: 'medium' },
      email: { value: 'contact@acme.fr', publisher: 'x', url: 'https://acme.fr', confidence: 'high' } }),
  })]])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['site', 'effectif'], known: {} } })).json()
  ok(b.found && 'site' in b.found && 'effectif' in b.found, 'les champs demandés doivent être rendus')
  ok(!('email' in (b.found || {})), "un champ que l'application n'a pas demandé ne doit jamais sortir du relais")
}
{
  // Aucune donnée personnelle, même quand le modèle en propose une.
  stubFetch([[GEMINI, () => ({
    body: geminiBody({ localisation: { value: 'contact@acme.fr', publisher: 'x', url: 'https://acme.fr', confidence: 'high' } }),
  })]])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['localisation'], known: {} } })).json()
  ok(!b.found?.localisation, 'une valeur qui ressemble à une donnée personnelle doit être refusée')
}

if (failures) { console.error(`\nRELAIS : ${failures} vérification(s) en échec`); process.exit(1) }
console.log('relais OK ✓ — routes, replis, quotas et garde-fous')
