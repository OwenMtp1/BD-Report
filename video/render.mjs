// ---------------------------------------------------------------------------
//  RENDU DE LA PUBLICITÉ — image par image, puis encodage.
//
//    node video/render.mjs                    → video/out/bd-report-pub-30s.mp4 (+ .srt)
//    node video/render.mjs --stills 1,5,9.5   → images-clés dans video/out/stills/
//
//  ⚠️ IMAGE PAR IMAGE, jamais l'enregistrement vidéo de Playwright. Celui-ci filme
//  en temps réel : une machine lente perd des images, et la vidéo varie d'un rendu
//  à l'autre. Ici chaque image est CALCULÉE pour son instant exact (`__seek(t)`),
//  puis photographiée — la même commande donne la même vidéo, à l'image près.
//
//  ffmpeg vient du paquet npm `ffmpeg-static` (binaire autonome) : la machine de
//  développement n'en a pas. Chemin surchargeable par FFMPEG=/chemin/vers/ffmpeg.
// ---------------------------------------------------------------------------
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve('.')
const OUT = path.resolve('video/out')
const FPS = 30
const DURATION = 30
const PORT = 4190

function findChromium() {
  const root = '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const dir = readdirSync(root).find(d => /^chromium-\d+$/.test(d)) || 'chromium'
  const bin = path.join(root, dir, 'chrome-linux', 'chrome')
  return existsSync(bin) ? bin : undefined
}

async function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG
  try { return (await import('ffmpeg-static')).default } catch { return 'ffmpeg' }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.wav': 'audio/wav' }
const serve = () => new Promise(resolve => {
  const srv = createServer(async (req, res) => {
    const file = path.join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]))
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(await readFile(file))
  })
  srv.listen(PORT, () => resolve(srv))
})

const run = (bin, args) => new Promise((resolve, reject) => {
  const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  p.stderr.on('data', d => { err += d })
  p.on('close', code => code === 0 ? resolve() : reject(new Error(err.slice(-1500))))
})

const srtTime = (s) => {
  const ms = Math.round(s * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

const main = async () => {
  const stillsArg = process.argv.find(a => a.startsWith('--stills'))
  const stills = stillsArg ? (process.argv[process.argv.indexOf(stillsArg) + 1] || '').split(',').map(Number).filter(n => !isNaN(n)) : null

  await mkdir(OUT, { recursive: true })
  const srv = await serve()
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--force-color-profile=srgb'] })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('requestfailed', r => errors.push('ressource manquante : ' + r.url()))

  try {
    await page.goto(`http://localhost:${PORT}/video/ad.html`, { waitUntil: 'networkidle' })
    await page.evaluate(() => window.__ready)
    if (errors.length) throw new Error('La page de la publicité a des erreurs :\n  ' + errors.join('\n  '))

    // ⚠️ UNE RÉPLIQUE DOIT POUVOIR SE DIRE DANS SON CRÉNEAU. Une voix off publicitaire
    // française tient 2,5 à 3,3 mots/s ; au-delà, le comédien bâcle. La première version
    // demandait 5,3 mots/s sur la phrase du pivot — celle qui porte toute la publicité —
    // et rien ne le signalait : les sous-titres, eux, s'affichent à n'importe quelle vitesse.
    // On refuse donc de rendre plutôt que de livrer un texte qu'aucune voix ne peut tenir.
    // Un « ? » ou un « : » isolé n'est pas un mot : les compter refusait des répliques saines.
    // C'est un garde-fou GROSSIER ; `voice.py` mesure ensuite la durée réellement synthétisée.
    const MAX_WPS = 3.6
    const tooFast = (await page.evaluate(() => window.VO))
      .map(([a, b, txt]) => ({ txt, wps: txt.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length / (b - a) }))
      .filter(l => l.wps > MAX_WPS)
    if (tooFast.length) {
      throw new Error(`Réplique(s) trop rapide(s) pour une voix off (> ${MAX_WPS} mots/s) :\n  ` +
        tooFast.map(l => `${l.wps.toFixed(1)} mots/s — « ${l.txt} »`).join('\n  '))
    }
    const stage = page.locator('#stage')

    // Les sous-titres sont écrits D'ABORD, même pour des images-clés : `voice.py` les lit,
    // et vérifier qu'une réplique tient dans son créneau ne doit pas coûter 900 images.
    const vo = await page.evaluate(() => window.VO)
    const srt = vo.map(([a, b, txt], i) => `${i + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${txt}\n`).join('\n')
    await writeFile(path.join(OUT, 'bd-report-pub-30s.srt'), srt)

    if (stills) {
      const dir = path.join(OUT, 'stills')
      await mkdir(dir, { recursive: true })
      for (const t of stills) {
        await page.evaluate(t => window.__seek(t), t)
        await stage.screenshot({ path: path.join(dir, `t${String(t.toFixed(2)).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 })
      }
      console.log(`${stills.length} image(s)-clé(s) → ${path.relative(ROOT, dir)}`)
      return
    }

    // ---- 1. Les images
    const frames = path.join(OUT, 'frames')
    await rm(frames, { recursive: true, force: true })
    await mkdir(frames, { recursive: true })
    const total = FPS * DURATION
    const t0 = Date.now()
    for (let i = 0; i < total; i++) {
      await page.evaluate(t => window.__seek(t), i / FPS)
      await stage.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 })
      if (i % 90 === 0) process.stdout.write(`  image ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`)
    }
    if (errors.length) throw new Error('Erreurs pendant le rendu :\n  ' + errors.join('\n  '))

    // ---- 2. Encodage. H.264 + yuv420p : lu partout (LinkedIn, Instagram, navigateurs, PowerPoint).
    const ffmpeg = await findFfmpeg()
    const music = path.resolve('video/out/musique.wav')
    const args = ['-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg')]
    if (existsSync(music)) args.push('-i', music)
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
    if (existsSync(music)) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest')
    const mp4 = path.join(OUT, 'bd-report-pub-30s.mp4')
    args.push(mp4)
    await run(ffmpeg, args)
    await rm(frames, { recursive: true, force: true })
    console.log(`\n✓ ${path.relative(ROOT, mp4)}${existsSync(music) ? ' (avec musique)' : ' (SANS musique — lancez video/music.mjs d\'abord)'}`)
  } finally {
    await browser.close()
    srv.close()
  }
}

main().catch(e => { console.error('✖ rendu :', e.message); process.exit(1) })
