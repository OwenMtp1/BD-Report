// ---------------------------------------------------------------------------
//  Regénère les captures du site vitrine depuis l'ESPACE DE DÉMONSTRATION.
//  Les visuels vieillissaient à chaque évolution de l'interface : ils sont désormais
//  reproductibles d'une commande, avec le thème « BD Report Studio ».
//
//  On passe par la démo (#/demo, société fictive « Atlas Revenue ») et JAMAIS par le
//  compte réel : une capture prise sur celui-ci afficherait le nom de l'entreprise
//  cliente et celui de l'utilisateur en haut de chaque écran, publiés sur le site.
//
//    npm run build && node scripts/screenshots.mjs
//
//  Le navigateur est celui préinstallé (PLAYWRIGHT_BROWSERS_PATH) : rien à télécharger.
// ---------------------------------------------------------------------------
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

// Le navigateur préinstallé porte un suffixe de version : on le retrouve plutôt que de
// le figer, sinon une mise à jour de l'image casse la génération.
function findChromium() {
  const root = '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const dir = readdirSync(root).find(d => /^chromium-\d+$/.test(d)) || 'chromium'
  const bin = path.join(root, dir, 'chrome-linux', 'chrome')
  return existsSync(bin) ? bin : undefined
}

const DIST = path.resolve('dist')
const OUT = path.resolve('site/assets')
const PORT = 4178

// Pages à capturer : id d'onglet dans l'app → fichier attendu par le site.
const SHOTS = [
  { file: 'dashboard.png', page: 'dashboard', wait: 'RDV réalisés' },
  { file: 'rdv.png', page: 'rdv', wait: 'Rendez-vous' },
  { file: 'leads.png', page: 'leads', wait: 'Leads' },
  { file: 'tasks.png', page: 'mytasks', wait: 'tâches' },
  { file: 'contacts.png', page: 'contacts', wait: 'contacts' },
  { file: 'primes.png', page: 'primes', wait: 'Primes' },
  // `click` : une capture peut demander d'entrer dans une vue interne. Sans cela,
  // calendar.png dupliquait rdv.png et company.png dupliquait leads.png — le site
  // publiait deux fois la même image sous deux légendes différentes.
  { file: 'calendar.png', page: 'rdv', click: 'Calendrier' },
  { file: 'logs.png', page: 'logs', wait: 'Logs' },
  { file: 'company.png', page: 'leads', clickTitle: 'Ouvrir la fiche entreprise' },
  { file: 'teamlead.png', page: 'teamlead', role: 'manager' },
  { file: 'orgchart.png', page: 'manager', role: 'manager' },
]

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }

function serveDist() {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      const url = (req.url || '/').split('?')[0]
      let file = path.join(DIST, url === '/' ? 'index.html' : url)
      if (!existsSync(file)) file = path.join(DIST, 'index.html') // SPA
      try {
        const body = await readFile(file)
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
        res.end(body)
      } catch { res.writeHead(404); res.end('not found') }
    })
    srv.listen(PORT, () => resolve(srv))
  })
}

const clickText = async (page, text, opts = {}) => {
  const el = page.locator(`button:has-text("${text}")`).first()
  await el.waitFor({ state: 'visible', timeout: opts.timeout || 8000 })
  await el.click()
}

const run = async () => {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ absent — lancez `npm run build` d\'abord.')
    process.exit(1)
  }
  const srv = await serveDist()
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR' })
  const page = await ctx.newPage()

  await page.goto(`http://localhost:${PORT}/#/demo`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // Parcours d'achat de la démo : le formulaire part vide et n'exige rien. On nomme
  // quand même l'entreprise, pour que les captures publiées portent toujours le nom de
  // la société FICTIVE et jamais celui d'un prospect saisi lors d'un rendez-vous.
  const comp = page.locator('input[placeholder*="nom de votre entreprise"]').first()
  await comp.waitFor({ state: 'visible', timeout: 10000 })
  await comp.fill('Atlas Revenue')
  await clickText(page, 'Créer mon espace')
  await page.waitForTimeout(2600)

  // Le thème est mémorisé PAR ESPACE : chaque casquette a le sien, il faut donc
  // l'appliquer à nouveau après chaque bascule.
  const applyStudio = async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('demo-navigate', { detail: 'settings' })))
    await page.waitForTimeout(1100)
    const btn = page.locator('button:has-text("BD Report Studio")').first()
    if (!(await btn.count())) { console.warn('! thème Studio introuvable'); return }
    await btn.click()
    await clickText(page, 'Sauvegarder le thème')
    await page.waitForTimeout(800)
  }
  // Le panneau de prise en main masque le contenu : on le referme s'il est là.
  const dismissOnboarding = async () => {
    const skip = page.locator('button:has-text("Passer")').first()
    if (await skip.count() && await skip.isVisible()) { await skip.click(); await page.waitForTimeout(500) }
  }
  await applyStudio()
  await dismissOnboarding()

  // La barre de pilotage de la démo n'a rien à faire sur une capture marketing : on la
  // masque le temps des prises de vue, sans la retirer du produit.
  await page.addStyleTag({ content: '[data-demo-chrome]{display:none !important}' })
  await page.waitForTimeout(300)

  let role = 'employe'
  for (const shot of SHOTS) {
    if ((shot.role || 'employe') !== role) {
      role = shot.role || 'employe'
      await page.addStyleTag({ content: '[data-demo-chrome]{display:flex !important}' })
      await page.waitForTimeout(200)
      await clickText(page, role === 'manager' ? 'Manager' : 'Employé')
      await page.waitForTimeout(1400)
      await applyStudio()
      await dismissOnboarding()
      await page.addStyleTag({ content: '[data-demo-chrome]{display:none !important}' })
      await page.waitForTimeout(200)
    }
    await page.evaluate((p) => window.dispatchEvent(new CustomEvent('demo-navigate', { detail: p })), shot.page)
    await page.waitForTimeout(1600)
    await dismissOnboarding()
    if (shot.click) { await clickText(page, shot.click); await page.waitForTimeout(1200) }
    if (shot.clickTitle) {
      const el = page.locator(`button[title="${shot.clickTitle}"]`).first()
      await el.waitFor({ state: 'visible', timeout: 8000 })
      await el.click()
      await page.waitForTimeout(1400)
    }
    await page.screenshot({ path: path.join(OUT, shot.file), scale: 'css' })
    console.log('✓', shot.file)
  }

  await browser.close()
  srv.close()
}

run().catch(e => { console.error('Échec des captures :', e.message); process.exit(1) })
