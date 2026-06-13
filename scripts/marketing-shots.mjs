// Captures marketing du produit pour les pages du site (site/assets/*.png)
import puppeteer from 'puppeteer'
import { mkdirSync } from 'fs'

const OUT = 'site/assets'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 880 } })
const page = await browser.newPage()
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const shoot = async (name, ms = 900) => { await wait(ms); await page.screenshot({ path: `${OUT}/${name}.png` }) }

const clickText = async (sel, txt) => {
  const ok = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().includes(t))
    if (el) el.click()
    return !!el
  }, sel, txt)
  if (!ok) throw new Error(`not found: ${txt}`)
  await wait(450)
}
const nav = async (label) => { await clickText('nav button', label); await wait(600) }
const typeInput = async (i, v) => {
  const inputs = await page.$$('input')
  await inputs[i].click({ clickCount: 3 })
  await inputs[i].type(v)
}

await page.goto('http://localhost:4188/', { waitUntil: 'networkidle0' })
await wait(2200) // splash
await typeInput(0, 'OwenMtp')
await typeInput(1, 'Elisaowen2003.')
await clickText('button', 'Se connecter')
await wait(3100) // bienvenue
await clickText('button', 'PeopleSpheres')
await clickText('button', 'Owen Mrani Bonnier')
await (await page.$('input')).type('1205')
await wait(1200) // squelette

await shoot('dashboard')
await nav('Mes Rendez-vous'); await shoot('rdv')
await clickText('button', 'Calendrier'); await clickText('button', 'Mois'); await shoot('calendar')
await nav('Tâches prioritaires'); await shoot('tasks')
await nav('Primes & Commissions'); await shoot('primes')
await nav('Mes contacts'); await shoot('contacts')
await nav('Logs'); await shoot('logs')

// Bascule vers l'environnement Test (équipe de Julie)
await clickText('button', "Changer d'espace")
await clickText('button', "Changer d'environnement")
await clickText('button', 'Test')
await clickText('button', 'Julie Lambert')
await (await page.$('input')).type('0000')
await wait(1200)

await nav('Pilotage équipe'); await shoot('teamlead')
await nav('Leads'); await clickText('button', 'Pipeline entreprise'); await shoot('leads')
await clickText('button', 'NovaCorp Industries'); await shoot('company')
await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelector('.fixed.inset-0')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
await page.evaluate(() => document.querySelector('button[title="Organigramme"]')?.click()); await shoot('orgchart')

await browser.close()
console.log('MARKETING SHOTS OK')
