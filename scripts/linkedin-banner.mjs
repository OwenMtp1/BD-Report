// ============================================================================
//  Bannières LinkedIn de BD Report.
//
//  Rend une page HTML au navigateur puis la capture à la taille EXACTE attendue par
//  LinkedIn. Reprend strictement l'identité du logo (public/icon.svg) : le dégradé
//  bleu #3B5BDB → #0EA5E9, les barres blanches, le point menthe.
//
//  ⚠️ DEUX FORMATS, ET ILS NE SONT PAS INTERCHANGEABLES :
//   · 1128 × 191  — couverture d'une PAGE ENTREPRISE (bandeau très plat) ;
//   · 1584 × 396  — couverture d'un PROFIL PERSONNEL.
//  Se tromper donne une image rognée n'importe comment.
//
//  ⚠️ ZONE RÉSERVÉE À GAUCHE. LinkedIn pose le logo de la page PAR-DESSUS le bandeau,
//  en bas à gauche, et rogne le bandeau sur mobile. Tout ce qui compte est donc écarté
//  du bord gauche — c'est pour cela que le texte n'est pas centré.
//
//  Usage : node scripts/linkedin-banner.mjs   → site/assets/linkedin-*.png
// ============================================================================
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'site', 'assets')
const findChromium = () => {
  const root = '/opt/pw-browsers'
  if (!fs.existsSync(root)) return undefined
  for (const d of fs.readdirSync(root)) {
    for (const p of [`${root}/${d}/chrome-linux/chrome`, `${root}/${d}`]) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    }
  }
  return undefined
}

// Le sigle du logo — copie de brand/logo.mjs. Liseré clair : un carré bleu sur un fond bleu
// se confondrait avec lui.
const MARK = (s) => `
<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true" style="flex:none;border-radius:23%;box-shadow:0 0 0 ${Math.max(2, Math.round(s / 40))}px rgba(255,255,255,.32),0 ${Math.round(s / 8)}px ${Math.round(s / 3)}px rgba(4,10,40,.35)"><rect width="64" height="64" rx="15" fill="#1D3FD6"/><path d="M17.6 16.16H30.56A15.84 15.84 0 0 1 44.67 24.8H17.6ZM17.6 26.96H45.58A15.84 15.84 0 0 1 46.3 33.8H17.6ZM17.6 35.96H45.9A15.84 15.84 0 0 1 43.34 41.36H17.6Z" fill="#FFFFFF"/><path d="M17.6 43.52H41.43A15.84 15.84 0 0 1 30.56 47.84H17.6Z" fill="#2EE6A8"/></svg>`

/** @param {{w:number,h:number,pad:number,mark:number,name:number,slogan:number,sub:number|0}} m */
const page = (m) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${m.w}px;height:${m.h}px;overflow:hidden;
    font-family:'Segoe UI',-apple-system,'Helvetica Neue',Arial,sans-serif;
    /* Dégradé du logo, d'angle à angle. */
    background:linear-gradient(115deg,#142FA8 0%,#1D3FD6 45%,#2E5BFF 100%);
    position:relative;display:flex;align-items:center}
  /* Halos et grille fine : la même texture que le site, très discrète pour que le
     texte reste le seul élément qu'on lit. */
  .halo{position:absolute;border-radius:50%;filter:blur(${Math.round(m.h / 3)}px);pointer-events:none}
  .h1{width:${m.h * 1.6}px;height:${m.h * 1.6}px;background:rgba(46,230,168,.20);right:-${m.h * .35}px;top:-${m.h * .6}px}
  .h2{width:${m.h * 1.3}px;height:${m.h * 1.3}px;background:rgba(255,255,255,.14);right:${m.w * .22}px;bottom:-${m.h * .75}px}
  .grid{position:absolute;inset:0;opacity:.13;
    background-image:linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px);
    background-size:${Math.round(m.h / 3.2)}px ${Math.round(m.h / 3.2)}px}
  /* ⚠️ Marge gauche = la place que LinkedIn prend pour le logo de la page. */
  .in{position:relative;padding-left:${m.pad}px;display:flex;align-items:center;gap:${Math.round(m.mark * .42)}px}
  .name{color:#fff;font-size:${m.name}px;font-weight:400;letter-spacing:-.02em;line-height:1;white-space:nowrap}
  .name b{font-weight:800}
  .slogan{color:#fff;font-size:${m.slogan}px;font-weight:600;line-height:1.18;letter-spacing:-.015em;max-width:${Math.round(m.w * .58)}px}
  /* ⚠️ BLEU ET BLANC, comme demandé. La seconde ligne se distingue par son opacité,
     pas par une couleur d'accent : le menthe du logo reste cantonné à la bande signée du sigle,
     où il est un détail d'identité et non une couleur de communication. */
  .slogan span{color:rgba(255,255,255,.88)}
  .sub{color:rgba(255,255,255,.82);font-size:${m.sub}px;font-weight:500;margin-top:${Math.round(m.sub * .7)}px}
  .rule{width:2px;height:${Math.round(m.mark * 1.15)}px;background:rgba(255,255,255,.3);border-radius:2px;flex:none}
</style></head><body>
  <div class="halo h1"></div><div class="halo h2"></div><div class="grid"></div>
  <div class="in">
    ${MARK(m.mark)}
    <div>
      <div class="name"><b>BD</b> Report</div>
    </div>
    <div class="rule"></div>
    <div>
      <div class="slogan">Toute la prospection,<br><span>et la rémunération qui va avec.</span></div>
      ${m.sub ? `<div class="sub">Rendez-vous · pipeline · primes · pilotage d'équipe — dans un seul espace.</div>` : ''}
    </div>
  </div>
</body></html>`

const FORMATS = [
  // Page entreprise : bandeau très plat, pas de place pour une sous-ligne.
  { file: 'linkedin-banniere-entreprise-1128x191.png', w: 1128, h: 191, pad: 250, mark: 54, name: 30, slogan: 25, sub: 0 },
  // Profil personnel : deux fois plus haut, la sous-ligne tient.
  { file: 'linkedin-banniere-profil-1584x396.png', w: 1584, h: 396, pad: 300, mark: 92, name: 46, slogan: 40, sub: 19 },
]

const exe = findChromium()
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
fs.mkdirSync(OUT, { recursive: true })
for (const m of FORMATS) {
  // deviceScaleFactor 2 : LinkedIn réduit l'image sur les écrans ordinaires et
  // l'affiche telle quelle sur un écran fin. Une capture 1× y paraîtrait floue.
  const ctx = await browser.newContext({ viewport: { width: m.w, height: m.h }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.setContent(page(m), { waitUntil: 'load' })
  const dest = path.join(OUT, m.file)
  await p.screenshot({ path: dest, type: 'png' })
  await ctx.close()
  console.log(`  ✓ ${m.file}  (${m.w}×${m.h}, rendu en 2×, ${Math.round(fs.statSync(dest).size / 1024)} Ko)`)
}
await browser.close()
