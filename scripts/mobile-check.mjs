// ---------------------------------------------------------------------------
//  CONTRÔLE MOBILE — le seul symptôme qui compte : LA PAGE DÉBORDE-T-ELLE ?
//
//  ⚠️ Pourquoi un vrai navigateur, et pas le smoke. `npm run smoke` tourne dans jsdom,
//  qui ne fait AUCUNE mise en page : toutes les largeurs y valent 0, et un test de
//  débordement y passerait toujours — le pire des tests, celui qui rassure sans rien
//  vérifier. On mesure donc dans Chromium, à la largeur d'un téléphone.
//
//  ⚠️ Et on ne compte pas des classes CSS. Un premier jet cherchait les `grid-cols-4`
//  sans variante responsive : c'est une approximation du problème, pas le problème.
//  Une grille figée dans un conteneur qui défile ne gêne personne ; un simple bouton
//  trop large, lui, fait glisser la page entière sous le doigt. Seule la MESURE
//  distingue les deux.
//
//  Ce qui est refusé : `scrollWidth > innerWidth` sur le document. Le coupable est
//  NOMMÉ (balise, classes, texte) — « la page déborde » n'a jamais aidé personne à
//  corriger quoi que ce soit.
//
//  ⚠️ Un débordement HORIZONTAL VOULU reste permis : un kanban se fait défiler du
//  doigt, c'est son fonctionnement. Il est donc toléré dès qu'il vit dans un conteneur
//  qui défile (`overflow-x-auto`) — ce qui déborde alors, c'est la colonne, pas la page.
//
//    npm run build && node scripts/mobile-check.mjs
// ---------------------------------------------------------------------------
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

function findChromium() {
  const root = '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const dir = readdirSync(root).find(d => /^chromium-\d+$/.test(d)) || 'chromium'
  const bin = path.join(root, dir, 'chrome-linux', 'chrome')
  return existsSync(bin) ? bin : undefined
}

const DIST = path.resolve('dist')
const PORT = 4179
// iPhone SE : le plus étroit encore répandu. Viser plus large, c'est ne rien attraper.
const VIEWPORT = { width: 375, height: 812 }

// Les écrans traversés, dans la démo. On prend ceux que quelqu'un consulte réellement
// depuis un téléphone — pas l'atelier de composition d'environnement, qu'on n'ouvre
// jamais dans le métro.
const PAGES = [
  ['dashboard', 'Tableau de bord'],
  ['rdv', 'Mes Rendez-vous'],
  ['leads', 'Leads'],
  ['companies', 'Mes entreprises'],
  ['mytasks', 'Mes tâches'],
  ['contacts', 'Mes contacts'],
  ['notes', 'Mes notes'],
  ['primes', 'Primes & Commissions'],
  ['simulateur', 'Simulateur'],
  ['classement', 'Classement'],
  ['dataquality', 'Qualité des données'],
  ['icp', 'ICP'],
  ['conversations', 'Conversations'],
  ['teamlead', 'Pilotage équipe'],
  ['kpi', 'KPI Entreprise'],
  ['ecosystem', 'Écosystème'],
  ['support', 'Support'],
  ['settings', 'Paramètres'],
]

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }

function serveDist() {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      const url = (req.url || '/').split('?')[0]
      let file = path.join(DIST, url === '/' ? 'index.html' : url)
      if (!existsSync(file)) file = path.join(DIST, 'index.html')
      try {
        const body = await readFile(file)
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
        res.end(body)
      } catch { res.writeHead(404); res.end('not found') }
    })
    srv.listen(PORT, () => resolve(srv))
  })
}

// Retrouve, DANS L'ÉCRAN MÉTIER, ce qui dépasse à droite.
//
// ⚠️ ON MESURE `<main>`, PAS LE DOCUMENT, et ce n'est pas un détail : la page de
// démonstration enveloppe l'application dans son propre conteneur à défilement
// (`overflow-auto`). Contre le document, `scrollWidth` ne bougeait donc JAMAIS —
// le cadre de la démo absorbait tout. Le test passait au vert sur les dix-huit
// écrans, y compris après injection délibérée d'un bloc de 900 px : il ne pouvait
// pas échouer. C'est la falsification qui l'a montré, pas la lecture du code.
//
// On ignore ce qui vit dans un conteneur à défilement SITUÉ SOUS `main` : un kanban
// se fait défiler du doigt, c'est son fonctionnement. La remontée s'arrête donc à
// `main`, sinon le cadre de la démo excuserait de nouveau tout.
const OVERFLOW_PROBE = () => {
  const main = document.querySelector('main')
  if (!main) return { error: 'aucun <main> : la sonde ne mesure rien' }
  const limit = main.clientWidth
  const edge = main.getBoundingClientRect().right
  const bad = []
  const scrollable = (el) => {
    for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    return false
  }
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right <= edge + 1) continue
    if (scrollable(el)) continue
    // On ne retient que le plus PROFOND : un parent déborde parce que son enfant
    // déborde, et nommer le parent envoie corriger au mauvais endroit.
    if (el.querySelector('*') && [...el.children].some(c => c.getBoundingClientRect().right > edge + 1)) continue
    bad.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 110),
      txt: (el.textContent || '').trim().slice(0, 50),
      right: Math.round(r.right - main.getBoundingClientRect().left),
    })
  }
  return { limit, docWidth: main.scrollWidth, bad: bad.slice(0, 6) }
}

const run = async () => {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ absent — lancez `npm run build` d\'abord.')
    process.exit(1)
  }
  const srv = await serveDist()
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'fr-FR', isMobile: true, hasTouch: true })
  const page = await ctx.newPage()

  let failures = 0
  try {
    await page.goto(`http://localhost:${PORT}/#/demo`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const comp = page.locator('input[placeholder*="nom de votre entreprise"]').first()
    await comp.waitFor({ state: 'visible', timeout: 15000 })
    await comp.fill('Atlas Revenue')
    await page.locator('button:has-text("Créer mon espace")').first().click()
    await page.waitForTimeout(2600)
    const skip = page.locator('button:has-text("Passer")').first()
    if (await skip.count() && await skip.isVisible()) { await skip.click(); await page.waitForTimeout(400) }

    console.log(`\n=== MOBILE ${VIEWPORT.width}×${VIEWPORT.height} — débordement horizontal ===\n`)
    for (const [id, label] of PAGES) {
      await page.evaluate((p) => window.dispatchEvent(new CustomEvent('demo-navigate', { detail: p })), id)
      await page.waitForTimeout(700)
      const r = await page.evaluate(OVERFLOW_PROBE)
      if (r.error) { failures++; console.log(`  ✖ ${label} — ${r.error}`); continue }
      if (r.docWidth <= r.limit + 1 && !r.bad.length) { console.log(`  ✓ ${label}`); continue }
      failures++
      console.log(`  ✖ ${label} — le contenu fait ${r.docWidth}px pour ${r.limit}px d'écran`)
      for (const b of r.bad) console.log(`       <${b.tag} class="${b.cls}">  jusqu'à ${b.right}px  « ${b.txt} »`)
    }
  } finally {
    await browser.close()
    srv.close()
  }

  if (failures) {
    console.error(`\n✖ mobile : ${failures} écran(s) débordent à ${VIEWPORT.width}px`)
    process.exit(1)
  }
  console.log(`\nmobile OK ✓ — aucun des ${PAGES.length} écrans ne déborde à ${VIEWPORT.width}px`)
}

run().catch(e => { console.error('mobile-check FAILED:', e.message); process.exit(1) })
