// Petits utilitaires de couleur pour dériver les palettes des designs de CV.

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const int = parseInt(n, 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
const toHex = (n) => clamp(n).toString(16).padStart(2, '0')

export function rgb(hex) { const { r, g, b } = hexToRgb(hex); return `${r},${g},${b}` }
export function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})` }

// Mélange linéaire entre deux couleurs (t=0 → a, t=1 → b).
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b)
  return '#' + toHex(A.r + (B.r - A.r) * t) + toHex(A.g + (B.g - A.g) * t) + toHex(A.b + (B.b - A.b) * t)
}
export const lighten = (hex, t) => mix(hex, '#ffffff', t)
export const darken = (hex, t) => mix(hex, '#000000', t)

// Luminance perçue → pour choisir un texte lisible sur un fond donné.
export function isLight(hex) {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150
}
export const readableOn = (hex) => (isLight(hex) ? '#1f2530' : '#ffffff')
