// Écrit les fichiers du logo depuis brand/logo.mjs (la source) : brand/*.svg,
// brand/*.png (fond transparent) et public/icon.svg — d'où partent les favicons,
// le manifeste et les icônes de l'app de bureau.   npm run logo
import { markSvg, lockup, STANDALONE } from '../brand/logo.mjs'
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
const shot = async (svg, w, h, out, bg = 'transparent') => {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<!doctype html><html><head><style>${FONTS}*{margin:0}html,body{background:${bg}}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(here, out), omitBackground: bg === 'transparent' })
}
await shot(mark, 512, 512, 'bd-report-mark-512.png')
await shot(mark, 1024, 1024, 'bd-report-mark-1024.png')
await shot(lockup('#14171C'), 1760, Math.round(1760 * 64 / 256), 'bd-report-logo-1760.png')
await shot(lockup('#FFFFFF'), 1760, Math.round(1760 * 64 / 256), 'bd-report-logo-blanc-1760.png')
await browser.close()
console.log('✓ logo : brand/*.svg, brand/*.png, public/icon.svg')
