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

{
  // ⚠️ SANS SITE, DEUX SOURCES SUR TROIS SONT MORTES — première cause de « 0 preuve ».
  // Le relais sait maintenant retrouver le site officiel sans IA ni quota (Wikidata).
  stubFetch([
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
    [/wikidata\.org/, (u) => ({ body: u.includes('wbsearchentities')
      ? { search: [{ id: 'Q42', label: 'Acme', description: 'entreprise de logiciels' }] }
      : { entities: { Q42: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://acme.fr' } } }] } } } } })],
    [/acme\.fr\/robots\.txt/, () => ({ status: 404, body: '' })],
    [/acme\.fr/, () => ({ body: '<html><head><title>Acme — actualités</title></head><body><a href="/actualites">Actualités</a><p>Acme ouvre un bureau à Lyon.</p></body></html>' })],
  ])
  const b = await (await call('/signals/collect', { method: 'POST', body: { company: 'Acme', types: [] } })).json()
  ok(b.stats?.foundSite === 'https://acme.fr', `le site doit être retrouvé sans qu'on le saisisse (reçu : ${b.stats?.foundSite})`)
  ok((b.items || []).some(i => i.kind === 'website'), 'le site retrouvé doit être réellement lu')
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

// ---------------------------------------------------------------------------
//  ENRICHISSEMENT — SOURCES PUBLIQUES UNIQUEMENT.
//
//  ⚠️ LE CONTRAT A CHANGÉ, ET C'EST LE FOND DU CORRECTIF. L'enrichissement passait par
//  l'outil de recherche Google, dont le quota gratuit est le plus serré de l'API : en
//  pratique la fonctionnalité ne répondait presque jamais. On a contourné, puis réduit,
//  puis posé la vraie question — à quoi sert un modèle pour retrouver six champs que des
//  bases publiques publient déjà, gratuitement et de façon citable ?
//  Gemini a donc été RETIRÉ de ce chemin. Ces tests figent qu'il n'y revienne pas.
// ---------------------------------------------------------------------------
const REGISTRY = /recherche-entreprises\.api\.gouv\.fr/
const REGISTRY_BODY = {
  total_results: 1,
  results: [{
    siren: '794598813', nom_complet: 'DOCTOLIB',
    siege: { libelle_commune: 'LEVALLOIS-PERRET', code_postal: '92300' },
    tranche_effectif_salarie: '52',
    libelle_activite_principale: 'Programmation informatique',
  }],
}
const WIKIDATA = /wikidata\.org/
const wdSearch = (label, description) => ({ search: [{ id: 'Q42', label, description }] })
const wdEntity = {
  entities: { Q42: { claims: {
    P856: [{ mainsnak: { datavalue: { value: 'https://doctolib.fr' } } }],
    P4264: [{ mainsnak: { datavalue: { value: 'doctolib' } } }],
    P2139: [{ mainsnak: { datavalue: { value: { amount: '+12000000', unit: 'http://www.wikidata.org/entity/Q4916' } } } }],
  } } },
}
const wdRoute = (label = 'Doctolib', desc = 'entreprise française de santé') => [WIKIDATA, (u) =>
  ({ body: u.includes('wbsearchentities') ? wdSearch(label, desc) : wdEntity })]

console.log("Enrichissement — les sources publiques d'abord, l'IA pour ce qui reste")
{
  // ⚠️ LA GARANTIE CENTRALE : quels que soient les champs demandés, ZÉRO appel Gemini.
  let gemini = 0
  stubFetch([
    [GEMINI, () => { gemini++; return { body: geminiBody({}) } }],
    [REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute(),
  ])
  const b = await (await call('/enrich', { method: 'POST', body: {
    company: 'Doctolib', fields: ['site', 'linkedin', 'localisation', 'ca', 'effectif', 'secteur'], known: {},
  } })).json()
  ok(gemini === 0, `quand les sources publiques couvrent tout, aucun appel IA (${gemini} appel(s))`)
  ok(b.source === 'public', "la provenance doit dire que rien ne vient d'une IA")
  const got = Object.keys(b.found || {}).filter(k => b.found[k])
  ok(got.length === 6, `les deux sources publiques doivent couvrir les six champs (reçu : ${got.join(', ')})`)
}
{
  // L'annuaire (État) couvre implantation, effectif, secteur — et PRIME sur Wikidata.
  stubFetch([[REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute()])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['localisation', 'effectif', 'secteur'], known: {} } })).json()
  ok(/LEVALLOIS-PERRET/.test(b.found?.localisation?.value || ''), "l'implantation doit venir de l'annuaire")
  ok(b.found?.effectif?.value === '5 000 à 9 999', `le code INSEE doit être traduit en ordre de grandeur (reçu : ${b.found?.effectif?.value})`)
  ok(b.found?.secteur?.value === 'Programmation informatique', "le secteur doit venir de l'annuaire")
  ok(b.found?.localisation?.confidence === 'high', 'une donnée officielle mérite une confiance haute')
  ok(/annuaire-entreprises\.data\.gouv\.fr/.test(b.found?.secteur?.url || ''), 'la source officielle doit être citable')
}
{
  // Wikidata couvre ce que l'annuaire ignore : site, LinkedIn, chiffre d'affaires.
  stubFetch([[REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute()])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['site', 'linkedin', 'ca'], known: {} } })).json()
  ok(b.found?.site?.value === 'https://doctolib.fr', 'le site officiel doit venir de Wikidata')
  ok(/linkedin\.com\/company\/doctolib/.test(b.found?.linkedin?.value || ''), "l'URL LinkedIn doit être reconstruite depuis l'identifiant")
  ok(/12\s?000\s?000/.test((b.found?.ca?.value || '').replace(/ | /g, ' ')), `le chiffre d'affaires doit être lisible (reçu : ${b.found?.ca?.value})`)
  ok(b.found?.site?.confidence === 'medium', 'une base collaborative ne vaut pas une source officielle')
}
{
  // ⚠️ L'HOMONYMIE est le vrai danger de Wikidata : « Orange » est aussi un fruit, et
  // remplir la fiche d'un client avec les données d'autre chose est pire que ne rien trouver.
  stubFetch([[REGISTRY, () => ({ body: { results: [] } })], wdRoute('Orange', 'fruit du genre Citrus')])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Orange', fields: ['site'], known: {} } })).json()
  ok(!b.found?.site, "une entité qui n'est pas une organisation ne doit jamais être retenue")
}
{
  stubFetch([[REGISTRY, () => ({ body: { results: [] } })], wdRoute('Alan Assurances', 'entreprise')])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['site'], known: {} } })).json()
  ok(!b.found?.site, 'une entité sans rapport de nom ne doit pas être prise pour la bonne')
}
{
  // ⚠️ MAIS la forme juridique ne doit PAS faire manquer la bonne fiche : « Doctolib SAS »
  // et « Doctolib » sont la même société, et l'exiger au caractère près vidait presque
  // tous les enrichissements.
  stubFetch([[REGISTRY, () => ({ body: { results: [] } })], wdRoute('Doctolib SAS', 'entreprise de santé')])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['site'], known: {} } })).json()
  ok(b.found?.site?.value === 'https://doctolib.fr', "une forme juridique en plus ne doit pas faire manquer la fiche")
}
{
  // ⚠️ DEUX SOURCES MUETTES NE SONT PAS UNE PANNE : on rend des champs vides, avec les
  // motifs — et surtout PAS un message de quota, puisqu'aucun quota n'est en jeu.
  stubFetch([
    [REGISTRY, () => ({ status: 503, body: 'nope' })],
    [WIKIDATA, () => ({ status: 503, body: 'nope' })],
  ])
  const res = await call('/enrich', { method: 'POST', body: { company: 'Inconnue SARL', fields: ['site', 'secteur'], known: {} } })
  const b = await res.json()
  ok(res.status === 200, "l'absence de résultat n'est pas une erreur")
  ok(b.found && b.found.site === null && b.found.secteur === null, 'un champ introuvable reste vide, jamais deviné')
  ok(/503/.test(b.registryError || '') && /503/.test(b.wikiError || ''), 'chaque source doit dire pourquoi elle est muette')
  ok(!/quota/i.test(JSON.stringify(b)), "aucun message de quota ne doit subsister : plus rien n'en dépend")
}
{
  // Seuls les champs DEMANDÉS sortent — la garantie « aucun champ créé » reste entière.
  stubFetch([[REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute()])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['secteur'], known: {} } })).json()
  ok(Object.keys(b.found).length === 1 && 'secteur' in b.found, `seul le champ demandé doit sortir (reçu : ${Object.keys(b.found).join(', ')})`)
}
{
  // ⚠️ L'ENTREPRISE, JAMAIS LES PERSONNES — même si une base publique glisse un e-mail.
  stubFetch([
    [REGISTRY, () => ({ body: { total_results: 1, results: [{ siren: '1', siege: { libelle_commune: 'contact@acme.fr' } }] } })],
    [WIKIDATA, () => ({ body: { search: [] } })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['localisation'], known: {} } })).json()
  ok(!b.found?.localisation, 'une valeur qui ressemble à une donnée personnelle doit être refusée')
}
{
  // Les garde-fous de forme survivent au retrait de l'IA.
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })],
    [WIKIDATA, (u) => ({ body: u.includes('wbsearchentities')
      ? wdSearch('Acme', 'entreprise')
      : { entities: { Q42: { claims: {
          P856: [{ mainsnak: { datavalue: { value: 'pas-une-url' } } }],
          P4264: [{ mainsnak: { datavalue: { value: 'acme' } } }],
        } } } } })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['site', 'linkedin'], known: {} } })).json()
  ok(!b.found?.site, "une valeur qui n'est pas une URL ne doit pas entrer dans la fiche")
  ok(/linkedin\.com\/company\/acme/.test(b.found?.linkedin?.value || ''), 'une URL LinkedIn bien formée doit passer')
}
// ⚠️ PAPPERS — par son API OFFICIELLE et par SIREN. Leurs pages web ne sont jamais lues :
// leur contenu est leur fonds de commerce, et leurs conditions l'interdisent. Le SIREN vient
// de l'annuaire de l'État, ce qui ferme définitivement le risque d'homonymie.
const PAPPERS = /api\.pappers\.fr/
const PAPPERS_BODY = {
  siren: '794598813', libelle_code_naf: 'Programmation informatique', site_web: 'https://doctolib.fr',
  finances: [
    { annee: 2023, chiffre_affaires: 9000000 },
    { annee: 2024, chiffre_affaires: 12500000 },
  ],
}
const withToken = { GEMINI_API_KEY: 'test-key', PAPPERS_API_TOKEN: 'tok-secret-pappers' }
const callTok = (path, body) => worker.fetch(new Request('https://relay.test' + path, {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}), withToken)

console.log("Enrichissement — retrouver la BONNE fiche à l'annuaire")
{
  // ⚠️ LA CAUSE LA PLUS PROBABLE D'UN ENRICHISSEMENT VIDE. On demandait UN résultat et on
  // le prenait sans vérifier — et la raison sociale diffère presque toujours de la marque.
  stubFetch([
    [REGISTRY, () => ({ body: { total_results: 3, results: [
      { siren: '111', nom_complet: 'ACME CONSEIL', siege: { libelle_commune: 'PARIS' }, libelle_activite_principale: 'Conseil' },
      { siren: '222', nom_complet: 'ACME SAS', siege: { libelle_commune: 'LYON', code_postal: '69002' }, tranche_effectif_salarie: '22', libelle_activite_principale: 'Édition de logiciels' },
    ] } })],
    [WIKIDATA, () => ({ body: { search: [] } })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['secteur', 'localisation', 'effectif'], known: {} } })).json()
  ok(/Édition de logiciels/.test(b.found?.secteur?.value || ''), `« Acme » doit retrouver « ACME SAS », pas le premier venu (reçu : ${b.found?.secteur?.value})`)
  ok(/LYON/.test(b.found?.localisation?.value || ''), "l'implantation doit être celle de la bonne fiche")
  ok(b.found?.effectif?.value === '100 à 199', `l'effectif doit venir de la bonne fiche (reçu : ${b.found?.effectif?.value})`)
}
{
  // ⚠️ Mais on ne prend PAS n'importe quoi : plusieurs candidats sans rapport de nom, on
  // s'abstient. Remplir une fiche avec les données d'une autre société est pire qu'un vide.
  stubFetch([
    [REGISTRY, () => ({ body: { total_results: 2, results: [
      { siren: '111', nom_complet: 'BOULANGERIE DUPONT', siege: { libelle_commune: 'PARIS' }, libelle_activite_principale: 'Boulangerie' },
      { siren: '222', nom_complet: 'GARAGE MARTIN', siege: { libelle_commune: 'LYON' }, libelle_activite_principale: 'Garage' },
    ] } })],
    [WIKIDATA, () => ({ body: { search: [] } })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['secteur'], known: {} } })).json()
  ok(!b.found?.secteur, "sans correspondance de nom, l'annuaire ne doit rien imposer")
  ok(/candidats/.test(JSON.stringify(b)) || b.registryError !== undefined, "le motif doit rester consultable")
}

console.log("Enrichissement — l'IA en dernier recours, sur NOS pages")
{
  // ⚠️ LE CHEMIN QUI SAUVE UN ENRICHISSEMENT VIDE. Les bases publiques ne connaissent pas
  // toutes les sociétés (marque ≠ raison sociale, société étrangère, entité récente). Le
  // modèle ne CHERCHE alors rien : il LIT les pages qu'on est allé chercher. C'est le quota
  // de TEXTE, large — pas celui de la recherche Google, qui saturait.
  let payload = null
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })],
    [WIKIDATA, () => ({ body: { search: [] } })],
    [/acme\.fr\/robots\.txt/, () => ({ status: 404, body: '' })],
    [/acme\.fr/, () => ({ body: '<html><head><title>Acme — à propos</title></head><body><a href="/a-propos">À propos</a><p>Acme édite un logiciel RH en SaaS, 120 personnes à Lyon.</p></body></html>' })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
    [GEMINI, (u, init) => {
      payload = JSON.parse(init.body)
      return { body: geminiBody({ secteur: { value: 'Logiciel RH (SaaS)', publisher: 'acme.fr', url: 'https://acme.fr/a-propos', confidence: 'high' } }) }
    }],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['secteur'], known: { site: 'https://acme.fr' } } })).json()
  ok(b.found?.secteur?.value === 'Logiciel RH (SaaS)', "l'IA doit sauver un champ qu'aucune base publique ne donne")
  ok(b.source === 'public+ai', "la provenance doit dire que l'IA est intervenue")
  // ⚠️ AUCUN OUTIL DE RECHERCHE : c'est le quota serré qu'on évite.
  ok(payload && !payload.tools, "l'IA ne doit jamais recevoir l'outil de recherche Google")
  ok(/PAGES :/.test(payload?.contents?.[0]?.parts?.[0]?.text || ''), 'les pages lues doivent être fournies au modèle')
}
{
  // Une URL que le modèle invente n'a aucun chemin vers l'écran.
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })], [WIKIDATA, () => ({ body: { search: [] } })],
    [/acme\.fr\/robots\.txt/, () => ({ status: 404, body: '' })],
    [/acme\.fr/, () => ({ body: '<html><head><title>Acme</title></head><body><a href="/a-propos">À propos</a><p>Acme.</p></body></html>' })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
    [GEMINI, () => ({ body: geminiBody({ secteur: { value: 'Logiciel', publisher: 'x', url: 'https://invente.example/x', confidence: 'high' } }) })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['secteur'], known: { site: 'https://acme.fr' } } })).json()
  ok(b.found?.secteur?.url === '', 'une URL absente des pages fournies doit être retirée')
  ok(b.found?.secteur?.confidence === 'low', 'sans source vérifiable, la confiance ne peut pas rester haute')
}
{
  // L'IA n'est PAS appelée pour des champs que les bases publiques ont déjà donnés.
  let gemini = 0
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute(),
    [GEMINI, () => { gemini++; return { body: geminiBody({}) } }],
  ])
  await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['secteur', 'localisation'], known: {} } })
  ok(gemini === 0, `aucun appel IA quand les bases publiques suffisent (${gemini})`)
}
{
  // Un échec de l'IA ne doit pas emporter ce que les bases publiques ont trouvé.
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], [WIKIDATA, () => ({ body: { search: [] } })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
    [GEMINI, () => ({ status: 429, body: JSON.stringify({ error: { message: 'quota' } }) })],
  ])
  const res = await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['secteur', 'ca'], known: {} } })
  const b = await res.json()
  ok(res.status === 200, "un refus de l'IA ne doit pas faire échouer l'enrichissement")
  ok(b.found?.secteur?.value === 'Programmation informatique', "ce que l'annuaire a trouvé doit survivre")
  ok(!!b.aiError, "le motif de l'échec de l'IA doit être dit")
}

// ⚠️ TROIS CHAMPS NE REMONTAIENT JAMAIS, chacun pour une raison différente. Une source
// généraliste de plus n'y aurait rien changé : il fallait traiter les trois causes.
const FINANCE = /data\.economie\.gouv\.fr/
const FINANCE_BODY = { records: [
  { fields: { siren: '794598813', date_cloture_exercice: '2023-12-31', chiffre_d_affaires: 9000000 } },
  { fields: { siren: '794598813', date_cloture_exercice: '2024-12-31', chiffre_d_affaires: 12500000 } },
] }
const HOME = (name, extra = '') => `<html><head><title>${name} — accueil</title></head><body><p>Bienvenue chez ${name}.</p>${extra}</body></html>`

console.log("Enrichissement — les trois champs qui ne remontaient pas")
{
  // CA : les comptes annuels déposés, publiés par l'État, sans clé.
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], [WIKIDATA, () => ({ body: { search: [] } })],
    [FINANCE, () => ({ body: FINANCE_BODY })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['ca'], known: { site: 'https://doctolib.fr' } } })).json()
  ok(/12\s?500\s?000/.test((b.found?.ca?.value || '').replace(/ | /g, ' ')), `le CA doit venir des comptes déposés (reçu : ${b.found?.ca?.value})`)
  ok(/2024/.test(b.found?.ca?.value || ''), "l'exercice le plus RÉCENT doit être retenu")
  ok(/INPI/.test(b.found?.ca?.publisher || ''), 'la source officielle doit être nommée')
}
{
  // SITE : problème CIRCULAIRE — pour lire le site il faut le connaître. On propose des
  // domaines et on VÉRIFIE lequel parle bien de cette entreprise.
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })], [WIKIDATA, () => ({ body: { search: [] } })],
    [/robots\.txt/, () => ({ status: 404, body: '' })],
    [/www\.acme\.fr/, () => ({ body: HOME('Acme') })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['site'], known: {} } })).json()
  ok(b.found?.site?.value === 'https://www.acme.fr', `le site doit être trouvé et vérifié (reçu : ${b.found?.site?.value})`)
}
{
  // ⚠️ VÉRIFIER, PAS DEVINER : un domaine qui répond mais ne parle pas de l'entreprise
  // (parking, homonyme) ne doit JAMAIS entrer dans la fiche.
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })], [WIKIDATA, () => ({ body: { search: [] } })],
    [/robots\.txt/, () => ({ status: 404, body: '' })],
    [/www\.acme\./, () => ({ body: HOME('Domaine à vendre') })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['site'], known: {} } })).json()
  ok(!b.found?.site, "un domaine qui ne parle pas de l'entreprise ne doit pas être retenu")
  ok(/essais/.test(b.siteError || ''), 'le motif doit dire que rien n\'a été vérifié')
}
{
  // LINKEDIN : LinkedIn interdit sa lecture par robots.txt. Le lien vit sur le SITE de
  // l'entreprise, qui le publie pour être suivi — c'est la source légitime.
  const seen = []
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })], [WIKIDATA, () => ({ body: { search: [] } })],
    [/robots\.txt/, () => ({ status: 404, body: '' })],
    [/linkedin\.com/, (u) => { seen.push(u); return { body: '<html></html>' } }],
    [/www\.acme\.fr/, () => ({ body: HOME('Acme', '<a href="https://www.linkedin.com/company/acme-sa">LinkedIn</a>') })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['site', 'linkedin'], known: {} } })).json()
  ok(/linkedin\.com\/company\/acme-sa/.test(b.found?.linkedin?.value || ''), `le LinkedIn doit être pris sur le site (reçu : ${b.found?.linkedin?.value})`)
  ok(seen.length === 0, `⚠️ LinkedIn ne doit JAMAIS être visité (${seen.length} appel(s))`)
}
{
  // Un site déjà connu ne se re-cherche pas : on n'essaie pas huit domaines pour rien.
  let tried = 0
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })], [WIKIDATA, () => ({ body: { search: [] } })],
    [/robots\.txt/, () => ({ status: 404, body: '' })],
    [/www\.acme\./, () => { tried++; return { body: HOME('Acme') } }],
    [/acme\.fr/, () => ({ body: HOME('Acme', '<a href="https://linkedin.com/company/acme">in</a>') })],
    [GOOGLE, () => ({ body: rss([]) })], [BING, () => ({ body: rss([]) })],
  ])
  await call('/enrich', { method: 'POST', body: { company: 'Acme', fields: ['linkedin'], known: { site: 'https://acme.fr' } } })
  ok(tried === 0, `un site déjà connu ne doit pas relancer la recherche de domaine (${tried})`)
}

console.log('Enrichissement — Pappers, par API officielle et par SIREN')
{
  let asked = ''
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute(),
    [PAPPERS, (u) => { asked = u; return { body: PAPPERS_BODY } }],
  ])
  const b = await (await callTok('/enrich', { company: 'Doctolib', fields: ['ca', 'secteur', 'localisation'], known: {} })).json()
  ok(/siren=794598813/.test(asked), `Pappers doit être interrogé par SIREN (appel : ${asked || 'aucun'})`)
  ok(!/pappers\.fr\/entreprise/.test(asked), "aucune page web de Pappers ne doit être lue — seulement leur API")
  // ⚠️ Le CA vient des comptes DÉPOSÉS, que l'annuaire ne publie pas : Pappers prime ici.
  ok(/12\s?500\s?000/.test((b.found?.ca?.value || '').replace(/ | /g, ' ')), `le CA doit venir de Pappers (reçu : ${b.found?.ca?.value})`)
  ok(/2024/.test(b.found?.ca?.value || ''), "l'exercice le plus RÉCENT doit être retenu, pas le premier de la liste")
  // Sur le reste, l'annuaire de l'État garde la main.
  ok(/Annuaire/.test(b.found?.secteur?.publisher || ''), "l'État garde la main sur ce qu'il publie lui-même")
  ok(/LEVALLOIS/.test(b.found?.localisation?.value || ''), "l'implantation reste celle de l'annuaire")
}
{
  // ⚠️ SANS TOKEN, LA SOURCE EST ÉTEINTE — pas en panne. Confondre les deux enverrait
  // chercher un incident là où il n'y a qu'un réglage absent.
  let called = false
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute(),
    [PAPPERS, () => { called = true; return { body: PAPPERS_BODY } }],
  ])
  const b = await (await call('/enrich', { method: 'POST', body: { company: 'Doctolib', fields: ['ca', 'secteur'], known: {} } })).json()
  ok(!called, "sans token, Pappers ne doit pas être appelé du tout")
  ok(b.pappersOff === true, 'une source non configurée doit se déclarer éteinte')
  ok(/PAPPERS_API_TOKEN/.test(b.pappersError || ''), 'le motif doit nommer le réglage manquant')
  ok(b.found?.secteur?.value === 'Programmation informatique', "l'absence de Pappers ne doit rien retirer aux autres sources")
}
{
  // Un token refusé est une VRAIE erreur : elle doit se distinguer d'une absence de données.
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], wdRoute(),
    [PAPPERS, () => ({ status: 401, body: 'unauthorized' })],
  ])
  const b = await (await callTok('/enrich', { company: 'Doctolib', fields: ['ca', 'secteur'], known: {} })).json()
  ok(/refusé le token/.test(b.pappersError || ''), `un token invalide doit le dire (reçu : ${b.pappersError})`)
  ok(b.pappersOff !== true, "un token refusé n'est pas une source éteinte")
  ok(b.found?.secteur?.value === 'Programmation informatique', "l'échec de Pappers ne doit pas emporter les autres sources")
}
{
  // Sans SIREN (société non trouvée à l'annuaire), on n'invente pas une recherche par nom.
  let called = false
  stubFetch([
    [REGISTRY, () => ({ body: { results: [] } })], wdRoute('Acme', 'entreprise'),
    [PAPPERS, () => { called = true; return { body: PAPPERS_BODY } }],
  ])
  const b = await (await callTok('/enrich', { company: 'Acme', fields: ['ca'], known: {} })).json()
  ok(!called, "sans SIREN, Pappers ne doit pas être interrogé au jugé")
  ok(/SIREN/.test(b.pappersError || ''), 'le motif doit dire que le SIREN manque')
}

console.log('Diagnostic — le relais dit lui-même ce qui bloque')
{
  // ⚠️ Le diagnostic ne teste QUE ce qui sert. La brique « recherche Google » a disparu
  // avec l'IA de l'enrichissement : garder une brique qui n'alimente plus rien ferait
  // chercher une panne là où il n'y en a pas.
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], [GOOGLE, () => ({ body: rss(['Doctolib lève']) })],
    [BING, () => ({ body: rss([]) })], wdRoute(), [PAPPERS, () => ({ body: PAPPERS_BODY })],
    [GEMINI, () => ({ body: geminiBody({ ok: true }) })],
  ])
  const b = await (await worker.fetch(new Request('https://relay.test/diag'), withToken)).json()
  const by = Object.fromEntries((b.steps || []).map(s => [s.id, s]))
  ok(!by.gemini_search, "la brique « recherche Google » ne doit plus exister : plus rien ne l'utilise")
  for (const id of ['key', 'registry', 'wikidata', 'pappers', 'news', 'gemini_text', 'enrich']) {
    ok(by[id], `le diagnostic doit couvrir la brique « ${id} »`)
  }
  ok(by.enrich?.ok === true, "le diagnostic doit vérifier l'enrichissement de bout en bout")
  ok((by.enrich?.detail?.champs || []).length >= 3, "le test de bout en bout doit rendre des champs réels")
  ok(b.ok === true && /Tout répond/.test(b.verdict || ''), `tout vert doit donner un verdict vert (reçu : ${b.verdict})`)
  ok(!JSON.stringify(b).includes('test-key') && !JSON.stringify(b).includes('tok-secret-pappers'),
    '⚠️ le diagnostic ne doit jamais laisser fuir une clé ni un token')
}
{
  // ⚠️ UNE SOURCE FACULTATIVE NON CONFIGURÉE N'EST PAS UNE PANNE. Sans ce cas, l'écran
  // affichait du rouge pour un réglage qu'on a sciemment laissé vide.
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], [GOOGLE, () => ({ body: rss(['x']) })],
    [BING, () => ({ body: rss([]) })], wdRoute(), [PAPPERS, () => ({ body: PAPPERS_BODY })],
    [GEMINI, () => ({ body: geminiBody({ ok: true }) })],
  ])
  const b = await (await call('/diag')).json()   // sans token Pappers
  const by = Object.fromEntries((b.steps || []).map(s => [s.id, s]))
  ok(by.pappers?.ok === false, 'une source sans réglage doit être signalée')
  ok(by.enrich?.ok === true, "l'enrichissement doit rester vert sans Pappers")
  ok(/FACULTATIVE/.test(b.verdict || '') && /PAPPERS_API_TOKEN/.test(b.verdict || ''),
    `le verdict doit dire que la source est facultative et nommer le réglage (reçu : ${b.verdict})`)
}
{
  // ⚠️ GEMINI EN PANNE NE CONCERNE PLUS QUE LES SIGNAUX. Le verdict doit le dire, sinon
  // l'utilisateur croit son enrichissement cassé alors qu'il fonctionne.
  stubFetch([
    [REGISTRY, () => ({ body: REGISTRY_BODY })], [GOOGLE, () => ({ body: rss(['x']) })],
    [BING, () => ({ body: rss([]) })], wdRoute(),
    [GEMINI, () => ({ status: 429, body: JSON.stringify({ error: { message: 'quota' } }) })],
  ])
  const b = await (await call('/diag')).json()
  const by = Object.fromEntries((b.steps || []).map(s => [s.id, s]))
  ok(by.gemini_text?.ok === false, 'une brique en échec doit être rouge')
  ok(by.enrich?.ok === true, "l'enrichissement doit rester vert quand Gemini est en panne")
  ok(/SIGNAUX/.test(b.verdict || '') && /continue de fonctionner/.test(b.verdict || ''),
    `le verdict doit dire que seuls les signaux sont touchés (reçu : ${b.verdict})`)
}
{
  // Sans clé, le verdict doit désigner le geste exact — pas « erreur Gemini ».
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  const res = await worker.fetch(new Request('https://relay.test/diag'), {})
  const b = await res.json()
  ok(/GEMINI_API_KEY/.test(b.verdict || ''), 'sans clé, le verdict doit nommer le secret à créer')
}

if (failures) { console.error(`\nRELAIS : ${failures} vérification(s) en échec`); process.exit(1) }
console.log('relais OK ✓ — routes, replis, quotas et garde-fous')
