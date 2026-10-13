// ---------------------------------------------------------------------------
//  LE LOGO BD REPORT — source unique.
//
//  « Bloc entonnoir » : un carré bleu roi dans lequel est découpé un D en quatre
//  bandes, de plus en plus fines en descendant (R1 → R2 → SQL → Signée : la forme
//  réelle d'un pipeline). La dernière bande, l'affaire signée, est en menthe.
//
//  Tout le reste (site, app, favicons, image de partage, bannières, vidéo) part
//  d'ici ou en est une copie : `npm run logo` (scripts/brand-logo.mjs) réécrit les
//  fichiers du dossier brand/ et public/icon.svg. Ce module-ci reste PUR (aucune
//  écriture, aucun await) : l'audit l'importe pour vérifier chaque copie.
//  ⚠️ Pas de masque ni d'identifiant dans le SVG : il est collé plusieurs fois dans
//  une même page (en-tête + pied), et deux <mask id="…"> identiques se marchent dessus.
// ---------------------------------------------------------------------------

export const BLUE = '#1D3FD6'
export const MINT = '#2EE6A8'
export const WHITE = '#FFFFFF'

// Le D d'origine (repère 64) : droite x=13, demi-cercle de centre (31, 32), rayon 22.
// Bandes : 10-22, 25-34.5, 37.5-45, 48-54 — chaque intervalle plus fin que le précédent.
const BANDS = [[10, 22], [25, 34.5], [37.5, 45], [48, 54]]
const S = 0.72            // taille du D dans le carré
const T = (v, c) => 32 + S * (v - c)
const r = 22 * S, cx = T(31, 33), cy = 32, left = T(13, 33)
const n = v => Math.round(v * 100) / 100
const xr = y => cx + Math.sqrt(Math.max(0, r * r - (y - cy) ** 2))

const band = ([a, b]) => {
  const y1 = T(a, 32), y2 = T(b, 32)
  return `M${n(left)} ${n(y1)}H${n(xr(y1))}A${n(r)} ${n(r)} 0 0 1 ${n(xr(y2))} ${n(y2)}H${n(left)}Z`
}

export const BAND_PATHS = BANDS.map(band)
export const PATH_WHITE = BANDS.slice(0, 3).map(band).join('')
export const PATH_MINT = band(BANDS[3])

// Le sigle complet (carré plein, coins 15/64 comme l'ancien).
export const markInner = (radius = 15) =>
  `<rect width="64" height="64" rx="${radius}" fill="${BLUE}"/><path d="${PATH_WHITE}" fill="${WHITE}"/><path d="${PATH_MINT}" fill="${MINT}"/>`

export const markSvg = ({ size, attrs = '' } = {}) =>
  `<svg${size ? ` width="${size}" height="${size}"` : ''} viewBox="0 0 64 64"${attrs ? ' ' + attrs : ''}>${markInner()}</svg>`

export const STANDALONE = s => `<svg xmlns="http://www.w3.org/2000/svg"${s.slice(4)}`

// Logo horizontal (sigle + « BD Report ») pour les documents. Le texte est en
// tracés de police au moment du rendu PNG ; le SVG garde du texte Inter.
export const lockup = (textColor) => STANDALONE(`<svg viewBox="0 0 256 64">${markInner()}<text x="80" y="44" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="36" letter-spacing="-0.7" fill="${textColor}"><tspan font-weight="800">BD</tspan><tspan font-weight="400"> Report</tspan></text></svg>`)
