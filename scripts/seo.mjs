// ---------------------------------------------------------------------------
//  Balises de partage, sitemap et robots.txt — posés au DÉPLOIEMENT.
//
//  Écrire ces balises à la main dans treize pages, c'était treize occasions de les
//  oublier : le site n'en portait aucune. Un lien BD Report collé dans LinkedIn ou
//  Slack s'affichait en URL nue, sans titre ni image. Et deux pages déclaraient une
//  adresse canonique sur un domaine qui n'existe pas, ce qui invite un moteur de
//  recherche à les désindexer.
//
//  Ce script lit chaque page produite, en tire le titre et la description qu'elle
//  porte déjà, et injecte ce qui manque. Une page nouvelle est couverte sans rien
//  faire de plus.
//
//  Usage : node scripts/seo.mjs <dossier> <urlDeBase>
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'

const [, , OUT = 'out', BASE_RAW = 'https://owenmtp1.github.io/BD-Report'] = process.argv
const BASE = BASE_RAW.replace(/\/$/, '')

const htmlFiles = (dir, acc = []) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) { if (name !== 'app' && name !== 'assets') htmlFiles(full, acc) }
    else if (name.endsWith('.html')) acc.push(full)
  }
  return acc
}

const pick = (html, re) => (html.match(re)?.[1] || '').trim()
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Les pages de contenu passent en premier dans le sitemap : l'accueil, puis le produit,
// puis le blog, et les mentions légales en dernier — l'ordre d'importance réelle.
const priorityOf = (rel) => {
  if (rel === 'index.html') return '1.0'
  if (rel.startsWith('produit/')) return '0.8'
  if (rel.startsWith('blog/')) return '0.7'
  if (rel === 'securite.html') return '0.6'
  return '0.3'
}

// ----- Mode clair -----------------------------------------------------------
// Le choix est appliqué AVANT le premier rendu : posé après, la page clignoterait
// en sombre à chaque chargement. Le bouton est injecté ici plutôt que recopié dans
// dix-neuf pages — c'est de cette recopie que venaient les balises manquantes.
const THEME_HEAD = `<script>(function(){try{var t=localStorage.getItem('bdr_site_theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()<\/script>
<style>
.theme-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line2);
  background:var(--veil);color:var(--muted);border-radius:10px;width:34px;height:34px;padding:0;
  cursor:pointer;transition:color .2s,background .2s,border-color .2s}
.theme-btn:hover{color:var(--text);background:var(--veil2)}
.theme-btn svg{width:17px;height:17px;display:block}
</style>`

const THEME_BODY = `<script>
(function(){
  var host = document.querySelector('.nav-right') || document.querySelector('.nav-links');
  if (!host) return;
  var b = document.createElement('button');
  b.className = 'theme-btn'; b.type = 'button';
  // Pictogrammes tracés au trait plutôt qu'émoji : un émoji est rendu différemment par
  // chaque système, en couleur, et jure avec le reste d'une interface sobre.
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M4.2 12H1.8M22.2 12h-2.4M6.5 6.5 4.8 4.8M19.2 19.2l-1.7-1.7M17.5 6.5l1.7-1.7M4.8 19.2l1.7-1.7"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8Z"/></svg>';
  var root = document.documentElement;
  function isLight(){
    var t = root.getAttribute('data-theme');
    if (t) return t === 'light';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }
  // Les captures du produit suivent le thème du site : montrer une interface sombre
  // sur une page claire donne l'impression d'une image collée là par erreur.
  function swapShots(light){
    var imgs = document.querySelectorAll('img[src*="/assets/"], img[src^="assets/"], img[src^="../assets/"]');
    for (var i = 0; i < imgs.length; i++) {
      var el = imgs[i], src = el.getAttribute('src');
      if (!src || src.indexOf('og.png') > -1 || src.indexOf('.svg') > -1) continue;
      var isLightSrc = src.indexOf('-light.') > -1;
      if (light && !isLightSrc) el.setAttribute('src', src.replace(/(\.[a-z]+)$/, '-light$1'));
      else if (!light && isLightSrc) el.setAttribute('src', src.replace('-light.', '.'));
    }
  }
  function paint(){
    var light = isLight();
    b.innerHTML = light ? MOON : SUN;
    b.title = light ? 'Passer en mode sombre' : 'Passer en mode clair';
    b.setAttribute('aria-label', b.title);
    swapShots(light);
  }
  b.onclick = function(){
    var next = isLight() ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('bdr_site_theme', next); } catch (e) {}
    paint();
  };
  paint();
  var lang = host.querySelector('#langBtn');
  if (lang) host.insertBefore(b, lang); else host.appendChild(b);
})();
<\/script>`

const files = htmlFiles(OUT).sort()
const urls = []

for (const file of files) {
  const rel = path.relative(OUT, file).split(path.sep).join('/')
  if (rel === '404.html') continue // une page d'erreur ne s'indexe pas
  let html = readFileSync(file, 'utf8')
  const canonical = `${BASE}/${rel === 'index.html' ? '' : rel}`
  const title = pick(html, /<title>([\s\S]*?)<\/title>/i) || 'BD Report'
  const desc = pick(html, /<meta name="description" content="([^"]*)"/i)
  const image = `${BASE}/assets/og.png`

  // Une canonique déjà présente est REMPLACÉE : c'est précisément celles qui étaient
  // écrites à la main qui pointaient vers un domaine non configuré.
  html = html.replace(/[ \t]*<link rel="canonical"[^>]*>\n?/gi, '')
  html = html.replace(/[ \t]*<meta (?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>\n?/gi, '')

  const tags = [
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="BD Report">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta property="og:title" content="${esc(title)}">`,
    desc ? `<meta property="og:description" content="${esc(desc)}">` : '',
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    desc ? `<meta name="twitter:description" content="${esc(desc)}">` : '',
    `<meta name="twitter:image" content="${esc(image)}">`,
  ].filter(Boolean).join('\n')

  // ----- Données structurées -----------------------------------------------
  // Elles disent à un moteur ce QU'EST la page, au lieu de le lui faire deviner :
  // le fil d'Ariane s'affiche dans les résultats, et les questions de la section
  // « Questions légitimes » peuvent y apparaître dépliées.
  const ld = []

  const crumbs = rel.split('/').slice(0, -1)
  if (crumbs.length) {
    ld.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'BD Report', item: `${BASE}/` },
        ...crumbs.map((c, i) => ({
          '@type': 'ListItem', position: i + 2,
          name: c === 'produit' ? 'Produit' : c === 'blog' ? 'Blog' : c,
          item: `${BASE}/${crumbs.slice(0, i + 1).join('/')}/`,
        })),
      ],
    })
  }

  if (rel === 'index.html') {
    ld.push({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication',
      name: 'BD Report', applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Windows, macOS, Linux',
      description: desc, url: `${BASE}/`, image,
      inLanguage: ['fr', 'en', 'es'],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: 'Offre Starter gratuite' },
    })
    // Les questions de la page d'accueil, telles qu'elles y sont écrites : on les lit
    // dans le HTML plutôt que de les recopier, pour qu'elles ne divergent jamais.
    const qa = [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => ({
        '@type': 'Question',
        name: m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        acceptedAnswer: { '@type': 'Answer', text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() },
      }))
      .filter(q => q.name && q.acceptedAnswer.text)
    if (qa.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa })
  }

  if (rel.startsWith('blog/') && rel !== 'blog/index.html' && !['blog/prospection.html', 'blog/remuneration.html', 'blog/management.html'].includes(rel)) {
    ld.push({
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: title.replace(/^BD Report — /, ''), description: desc,
      url: canonical, image, inLanguage: 'fr',
      publisher: { '@type': 'Organization', name: 'BD Report', url: `${BASE}/` },
    })
  }

  const ldTags = ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}<\/script>`).join('\n')

  html = html.replace(/<\/head>/i, `${tags}${ldTags ? '\n' + ldTags : ''}\n${THEME_HEAD}\n</head>`)
  html = html.replace(/<\/body>/i, `${THEME_BODY}\n</body>`)
  writeFileSync(file, html)
  urls.push({ loc: canonical, priority: priorityOf(rel) })
}

const today = new Date().toISOString().slice(0, 10)
writeFileSync(path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join('\n') +
  `\n</urlset>\n`)

// L'application n'a rien à faire dans un index de recherche : elle est derrière une
// authentification et ses URL ne mènent nulle part pour un visiteur.
writeFileSync(path.join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: ${BASE}/sitemap.xml\n`)

console.log(`✓ SEO : ${urls.length} pages balisées (avec données structurées), sitemap.xml et robots.txt générés (${BASE})`)
