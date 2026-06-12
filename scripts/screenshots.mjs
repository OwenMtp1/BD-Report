// Capture des pages clés de l'app (dossier dist) via Chromium headless.
// Démarre son propre serveur statique (vite preview) puis l'arrête à la fin.
import puppeteer from 'puppeteer'
import { fileURLToPath } from 'url'
import path from 'path'
import { mkdirSync } from 'fs'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 4188
const outDir = '/tmp/shots'
mkdirSync(outDir, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' })
const stopServer = () => { try { server.kill() } catch (e) { /* déjà arrêté */ } }
process.on('exit', stopServer)
await new Promise(r => setTimeout(r, 3500))

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
const wait = (ms) => new Promise(r => setTimeout(r, ms))

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' })
await wait(800)

// Connexion
async function typeInto(i, value) {
  const inputs = await page.$$('input')
  await inputs[i].click({ clickCount: 3 })
  await inputs[i].type(value)
}
const clickText = async (selector, text) => {
  const handle = await page.evaluateHandle((sel, t) => {
    return [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(t))
  }, selector, text)
  const el = handle.asElement()
  if (!el) throw new Error('not found: ' + text)
  await el.click()
}

await typeInto(0, 'OwenMtp')
await typeInto(1, 'demo1234')
await clickText('button', 'Se connecter')
await wait(3000) // écran de bienvenue
await clickText('button', 'PeopleSpheres')
await wait(500)
await clickText('button', 'Owen Mrani Bonnier')
await wait(400)
// PIN
const pinInput = await page.$('input')
await pinInput.type('1205')
await wait(800)

const shoot = async (name) => { await wait(900); await page.screenshot({ path: `${outDir}/${name}.png` }) }
const nav = async (label) => {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === t)
    if (b) b.click()
  }, label)
  await wait(700)
}

await shoot('1-dashboard')
await nav('Leads'); await shoot('2-leads-par-entreprise')
await nav('Tâches prioritaires'); await shoot('3-taches-prioritaires')
await nav('Primes & Commissions'); await shoot('4-primes')
// Paramètres → Intégrations puis Téléchargement
await page.evaluate(() => document.querySelector('button[title="Paramètres"]')?.click())
await wait(600)
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Intégrations')); b && b.click() })
await shoot('5-integrations-hubspot')
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes("Télécharger l'app")); b && b.click() })
await shoot('6-telechargement')

await browser.close()
stopServer()
console.log('SHOTS OK → ' + outDir)
