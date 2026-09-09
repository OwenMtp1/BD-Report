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

  html = html.replace(/<\/head>/i, `${tags}${ldTags ? '\n' + ldTags : ''}\n</head>`)
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
