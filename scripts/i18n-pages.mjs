// ---------------------------------------------------------------------------
//  Versions anglaise et espagnole ADRESSABLES
//
//  Les traductions étaient complètes — 139 clés sur la page d'accueil, aucune
//  manquante — mais elles s'appliquaient en JavaScript sur une seule et même URL.
//  Aucune adresse distincte, aucun hreflang : pour un moteur de recherche, le site
//  n'existait qu'en français, et tout ce travail de traduction ne rapportait rien.
//
//  Ce script produit /en/ et /es/ à partir des MÊMES dictionnaires, au déploiement.
//  Rien à maintenir en double : on continue d'écrire le français dans le HTML, et les
//  traductions dans le dictionnaire de la page.
//
//  Usage : node scripts/i18n-pages.mjs <dossier> <urlDeBase>
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, cpSync, existsSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

const [, , OUT = 'out', BASE_RAW = 'https://owenmtp1.github.io/BD-Report'] = process.argv
const BASE = BASE_RAW.replace(/\/$/, '')
const LANGS = ['en', 'es']
// Chemin racine du site tel qu'il est servi (« /BD-Report » sur GitHub Pages, « » sur
// un domaine dédié) : c'est lui qui rend les liens de ressources valables à tout niveau.
const ASSET_ROOT = new URL(BASE).pathname.replace(/\/$/, '')

const htmlFiles = (dir, root, acc = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) { if (!['app', 'assets', 'en', 'es'].includes(name)) htmlFiles(full, root, acc) }
    else if (name.endsWith('.html')) acc.push(path.relative(root, full).split(path.sep).join('/'))
  }
  return acc
}

// Les dictionnaires sont des littéraux JavaScript (apostrophes simples, apostrophes
// échappées) : JSON.parse ne suffit pas. On les évalue — c'est notre propre source,
// produite par notre propre build.
function readDicts(html) {
  for (const name of ['I18N', 'DICTS']) {
    const start = html.indexOf(`const ${name} = {`)
    if (start < 0) continue
    let i = html.indexOf('{', start), depth = 0, end = -1
    let inStr = null, esc = false
    for (let j = i; j < html.length; j++) {
      const c = html[j]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === inStr) inStr = null
        continue
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break } }
    }
    if (end < 0) continue
    try { return new Function(`return ${html.slice(i, end)}`)() } catch (e) { /* dictionnaire illisible */ }
  }
  return null
}

const relToLocalized = (rel, lang) => `${BASE}/${lang}/${rel === 'index.html' ? '' : rel}`
const relToFr = (rel) => `${BASE}/${rel === 'index.html' ? '' : rel}`

// Le sélecteur de langue devient une NAVIGATION : rester sur la même URL en changeant
// le texte recréerait le problème qu'on corrige — un contenu anglais servi à l'adresse
// française, que Google traiterait comme du contenu dupliqué.
const switcherScript = (rel, lang) => `
<script>
(function(){
  var urls = ${JSON.stringify({ fr: relToFr(rel), en: relToLocalized(rel, 'en'), es: relToLocalized(rel, 'es') })};
  var seq = ['fr','en','es'], cur = ${JSON.stringify(lang)};
  var btn = document.getElementById('langBtn');
  if (!btn) return;
  var labels = { fr: '\\uD83C\\uDDEC\\uD83C\\uDDE7 EN', en: '\\uD83C\\uDDEA\\uD83C\\uDDF8 ES', es: '\\uD83C\\uDDEB\\uD83C\\uDDF7 FR' };
  btn.textContent = labels[cur];
  btn.onclick = function(){
    var next = seq[(seq.indexOf(cur) + 1) % seq.length];
    try { localStorage.setItem('bdr_site_lang', next); } catch (e) {}
    window.location.href = urls[next];
  };
})();
</script>`

function hreflangTags(rel) {
  return [
    `<link rel="alternate" hreflang="fr" href="${relToFr(rel)}">`,
    `<link rel="alternate" hreflang="en" href="${relToLocalized(rel, 'en')}">`,
    `<link rel="alternate" hreflang="es" href="${relToLocalized(rel, 'es')}">`,
    `<link rel="alternate" hreflang="x-default" href="${relToFr(rel)}">`,
  ].join('\n')
}

const files = htmlFiles(OUT, OUT)
let made = 0

// 1. Les pages françaises déclarent leurs équivalents.
for (const rel of files) {
  if (rel === '404.html') continue
  const full = path.join(OUT, rel)
  let html = readFileSync(full, 'utf8')
  html = html.replace(/<\/head>/i, `${hreflangTags(rel)}\n</head>`)
  html = html.replace(/<\/body>/i, `${switcherScript(rel, 'fr')}\n</body>`)
  writeFileSync(full, html)
}

// 2. Une copie complète par langue : les chemins relatifs (assets, liens internes)
//    restent valides sans avoir à les réécrire un par un.
for (const lang of LANGS) {
  const dir = path.join(OUT, lang)
  mkdirSync(dir, { recursive: true })
  // Ni les ressources (2,7 Mo de captures), ni le sitemap, ni robots.txt : les
  // dupliquer par langue triplerait le poids publié et sèmerait trois sitemaps
  // concurrents. Les pages localisées pointent les ressources en chemin absolu.
  for (const name of readdirSync(OUT)) {
    if (['en', 'es', 'app', 'assets', 'sitemap.xml', 'robots.txt'].includes(name)) continue
    cpSync(path.join(OUT, name), path.join(dir, name), { recursive: true })
  }

  for (const rel of files) {
    if (rel === '404.html') continue
    const full = path.join(dir, rel)
    if (!existsSync(full)) continue
    const source = readFileSync(path.join(OUT, rel), 'utf8')
    const dicts = readDicts(source)
    const dict = dicts?.[lang]
    if (!dict) continue // page sans traduction (securite.html) : elle reste en français

    const dom = new JSDOM(source)
    const doc = dom.window.document
    doc.documentElement.lang = lang

    doc.querySelectorAll('[data-i18n]').forEach(el => {
      const v = dict[el.getAttribute('data-i18n')]
      if (v != null) el.innerHTML = v
    })
    doc.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const v = dict[el.getAttribute('data-i18n-ph')]
      if (v != null) el.setAttribute('placeholder', v)
    })

    // Le titre et la description suivent la langue quand la page les a traduits ;
    // sinon on garde le français plutôt que de servir une page sans titre.
    const t = dict['meta.title'] || dict['hero.title']
    if (t) doc.title = String(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + ' — BD Report'
    const d = dict['meta.description'] || dict['hero.sub'] || dict['hero.pitch']
    const md = doc.querySelector('meta[name="description"]')
    if (d && md) md.setAttribute('content', String(d).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

    // La langue est déjà appliquée dans le HTML livré : le script d'origine la
    // réappliquerait au chargement, en repartant du français mémorisé localement.
    doc.querySelectorAll('script').forEach(sc => {
      if (/applyLang\s*\(\)/.test(sc.textContent || '')) sc.remove()
    })

    let out = dom.serialize()
    out = out.replace(/[ \t]*<link rel="canonical"[^>]*>\n?/gi, '')
    out = out.replace(/[ \t]*<link rel="alternate" hreflang[^>]*>\n?/gi, '')
    out = out.replace(/<\/head>/i,
      `<link rel="canonical" href="${relToLocalized(rel, lang)}">\n${hreflangTags(rel)}\n</head>`)
    out = out.replace(/<meta property="og:url" content="[^"]*">/i,
      `<meta property="og:url" content="${relToLocalized(rel, lang)}">`)
    out = out.replace(/<meta property="og:locale" content="[^"]*">/i,
      `<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'es_ES'}">`)
    out = out.replace(/<\/body>/i, `${switcherScript(rel, lang)}\n</body>`)
    // Les ressources vivent à la racine du site, pas sous /en/ : sans cette réécriture
    // une page localisée irait chercher /en/assets/… et n'aurait ni style ni image.
    out = out.replace(/(href|src)="(?:\.\.\/)*assets\//g, `$1="${ASSET_ROOT}/assets/`)
    writeFileSync(full, out)
    made++
  }
}

// Le sitemap doit annoncer les pages localisées, sinon elles restent invisibles —
// c'est exactement le problème qu'on corrige.
const sitemapPath = path.join(OUT, 'sitemap.xml')
if (existsSync(sitemapPath)) {
  const today = new Date().toISOString().slice(0, 10)
  const extra = []
  for (const lang of LANGS) {
    for (const rel of files) {
      if (rel === '404.html') continue
      if (!existsSync(path.join(OUT, lang, rel))) continue
      extra.push(`  <url><loc>${relToLocalized(rel, lang)}</loc><lastmod>${today}</lastmod><priority>0.5</priority></url>`)
    }
  }
  const xml = readFileSync(sitemapPath, 'utf8').replace('</urlset>', extra.join('\n') + '\n</urlset>')
  writeFileSync(sitemapPath, xml)
}

console.log(`✓ i18n : ${made} pages localisées écrites dans /en/ et /es/ (${BASE})`)
