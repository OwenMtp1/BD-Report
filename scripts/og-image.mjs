// Génère l'image de partage (1200×630) affichée quand un lien BD Report est collé
// dans LinkedIn, Slack ou WhatsApp. Rendue depuis le navigateur préinstallé, avec
// l'identité du site — plutôt qu'un fichier binaire déposé dans le dépôt, que
// personne ne saurait plus regénérer six mois plus tard.
//   node scripts/og-image.mjs [chemin de sortie]
import { chromium } from 'playwright-core'
import { readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2] || 'site/assets/og.png'

const findChromium = () => {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const dir = readdirSync(root).find(d => d.startsWith('chromium-'))
  return dir ? path.join(root, dir, 'chrome-linux', 'chrome') : undefined
}

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#070A0F;font-family:Inter,system-ui,sans-serif;color:#F8FAFC;
       position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:72px 84px 132px}
  .halo{position:absolute;inset:-20% -10% auto -10%;height:900px;
        background:radial-gradient(620px 520px at 14% 4%, rgba(124,92,255,.34), transparent 62%),
                   radial-gradient(720px 560px at 96% 12%, rgba(34,211,166,.18), transparent 58%)}
  .grid{position:absolute;inset:0;opacity:.5;
        background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);
        background-size:62px 62px;
        -webkit-mask-image:radial-gradient(circle at 30% 40%,#000,transparent 76%)}
  .row{position:relative;display:flex;align-items:center;gap:16px;margin-bottom:30px}
  .mark{width:56px;height:56px;border-radius:15px;background:linear-gradient(135deg,#9B84FF,#22D3A6);
        display:flex;align-items:center;justify-content:center}
  .mark i{display:block;width:8px;height:26px;border-radius:4px;background:#0B0F16;margin:0 2px}
  .mark i:nth-child(1){height:14px;align-self:flex-end;margin-bottom:15px}
  .mark i:nth-child(2){height:20px;align-self:flex-end;margin-bottom:15px}
  .brand{font-size:30px;font-weight:800;letter-spacing:-.02em}
  h1{position:relative;font-size:60px;line-height:1.06;font-weight:800;letter-spacing:-.035em;max-width:19ch}
  .grad{background:linear-gradient(90deg,#B9A6FF,#7C5CFF 52%,#22D3A6);-webkit-background-clip:text;color:transparent}
  p{position:relative;margin-top:22px;font-size:24px;color:#94A3B8;max-width:34ch;line-height:1.35}
  .foot{position:absolute;left:84px;bottom:56px;display:flex;gap:14px}
  .chip{font-size:19px;font-weight:600;color:#C4B5FD;border:1px solid rgba(124,92,255,.35);
        background:rgba(124,92,255,.1);border-radius:999px;padding:8px 20px}
</style></head><body>
  <div class="halo"></div><div class="grid"></div>
  <div class="row"><div class="mark"><i></i><i></i><i></i></div><div class="brand">BD Report</div></div>
  <h1>Toute la prospection,<br><span class="grad">et la rémunération qui va avec.</span></h1>
  <p>Rendez-vous, pipeline, primes et pilotage d'équipe dans un seul espace.</p>
  <div class="foot"><span class="chip">BDR &amp; SDR</span><span class="chip">Primes au centime</span><span class="chip">FR · EN · ES</span></div>
</body></html>`

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(HTML, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200) // laisse la police se charger
await page.screenshot({ path: OUT })
await browser.close()
console.log('✓ image de partage écrite dans ' + OUT)
