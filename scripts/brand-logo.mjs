// Écrit les fichiers du logo depuis brand/logo.mjs (la source) : brand/*.svg,
// brand/*.png (fond transparent) et public/icon.svg — d'où partent les favicons,
// le manifeste et les icônes de l'app de bureau.   npm run logo
import { markSvg, markInner, lockup, STANDALONE } from '../brand/logo.mjs'
const { writeFileSync, readFileSync, readdirSync, existsSync } = await import('node:fs')
const path = await import('node:path')
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const here = path.join(root, 'brand')

const mark = STANDALONE(markSvg())
writeFileSync(path.join(here, 'bd-report-mark.svg'), mark + '\n')
writeFileSync(path.join(root, 'public', 'icon.svg'), mark + '\n')
writeFileSync(path.join(here, 'bd-report-logo.svg'), lockup('#14171C') + '\n')
writeFileSync(path.join(here, 'bd-report-logo-blanc.svg'), lockup('#FFFFFF') + '\n')

// PNG : rendus par le Chromium préinstallé, fond transparent.
const { chromium } = await import('playwright-core')
const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
const dir = existsSync(pw) && readdirSync(pw).find(d => d.startsWith('chromium-'))
const browser = await chromium.launch(dir ? { executablePath: path.join(pw, dir, 'chrome-linux', 'chrome') } : {})
// Inter embarquée (celle de la vidéo) : aucune dépendance réseau, rendu identique partout.
const font = w => `@font-face{font-family:Inter;font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(path.join(root, 'video/assets/fonts', `inter-${w}.ttf`)).toString('base64')})}`
const FONTS = font(400) + font(800)
const page = await browser.newPage()
const shot = async (svg, w, h, out, bg = 'transparent', dir = here) => {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<!doctype html><html><head><style>${FONTS}*{margin:0}html,body{background:${bg}}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(dir, out), omitBackground: bg === 'transparent' })
}
await shot(mark, 512, 512, 'bd-report-mark-512.png')
await shot(mark, 1024, 1024, 'bd-report-mark-1024.png')
await shot(lockup('#14171C'), 1760, Math.round(1760 * 64 / 256), 'bd-report-logo-1760.png')
await shot(lockup('#FFFFFF'), 1760, Math.round(1760 * 64 / 256), 'bd-report-logo-blanc-1760.png')

// Icônes d'onglet et d'écran d'accueil en PNG/ICO. ⚠️ Le SVG seul ne suffit pas :
// Safari l'ignore, et Google comme les lecteurs de flux vont chercher /favicon.ico —
// sans eux, ils montrent l'ancienne icône en cache, ou une lettre.
const pub = path.join(root, 'public')
await shot(mark, 32, 32, 'favicon-32.png', 'transparent', pub)
await shot(mark, 48, 48, 'favicon-48.png', 'transparent', pub)
await shot(mark, 192, 192, 'icon-192.png', 'transparent', pub)
await shot(mark, 512, 512, 'icon-512.png', 'transparent', pub)
// iOS pose ses propres coins arrondis et noircit la transparence : carré plein, sans arrondi.
await shot(STANDALONE(`<svg viewBox="0 0 64 64">${markInner(0)}</svg>`), 180, 180, 'apple-touch-icon.png', '#1D3FD6', pub)
await browser.close()

// favicon.ico = conteneur ICO autour de PNG (lu par tous les navigateurs depuis IE 11).
const pngs = [32, 48].map(s => readFileSync(path.join(pub, `favicon-${s}.png`)))
const head = Buffer.alloc(6 + 16 * pngs.length)
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4)
let off = head.length
pngs.forEach((png, i) => {
  const s = [32, 48][i], e = 6 + 16 * i
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
  head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(off, e + 12); off += png.length
})
const ico = Buffer.concat([head, ...pngs])
writeFileSync(path.join(pub, 'favicon.ico'), ico)
writeFileSync(path.join(root, 'site', 'favicon.ico'), ico)   // la racine du site, où on le cherche
console.log('✓ logo : brand/*.svg|png, public/icon.svg, favicons PNG/ICO, site/favicon.ico')
