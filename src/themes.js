// Quatre thèmes, volontairement peu nombreux : le design BD Report d'origine, deux
// déclinaisons sombres, et « Studio » — une refonte complète des formes inspirée du site
// vitrine. Les variantes colorées et les fonds animés ont été retirés : ils multipliaient
// les rendus à vérifier sans rien apporter au travail quotidien.
// Couleurs en triplets RGB pour les variables CSS.
export const THEMES = [
  {
    id: 'ocean-pro', name: 'BD Report', type: 'static',
    vars: { brand: '59 91 219', brand2: '14 165 233', surface: '244 246 250', card: '255 255 255', ink: '23 32 51', muted: '100 112 133', line: '226 230 238' },
  },
  // Vrai mode sombre : palette neutre pensée (fond ardoise profond, cartes surélevées, texte off-white).
  {
    id: 'sombre', name: 'Sombre', type: 'static',
    vars: { brand: '96 130 255', brand2: '56 189 248', surface: '15 18 25', card: '25 30 41', ink: '226 232 240', muted: '148 163 184', line: '42 50 64' },
  },
  {
    id: 'nuit', name: 'Nuit profonde', type: 'static',
    vars: { brand: '99 132 255', brand2: '56 189 248', surface: '10 13 21', card: '18 23 35', ink: '230 236 246', muted: '140 152 175', line: '38 46 64' },
  },
  // « Studio » : quasi-noir et vert néon, avec le cyan en second accent. Volontairement
  // très contrasté — une version claire, puis une version bleu nuit, se confondaient
  // toutes deux avec le thème d'origine.
  // Le `skin` pose une classe sur <html> : c'est elle qui change les FORMES et les
  // MATIÈRES (fond dégradé, cartes en verre, halos, chiffres colorés).
  {
    id: 'bdr-studio', name: 'BD Report Studio', type: 'static', skin: 'studio',
    vars: { brand: '52 211 153', brand2: '94 220 255', surface: '5 8 16', card: '12 17 30', ink: '228 238 244', muted: '128 146 168', line: '28 39 58' },
  },
]

export const THEME_IDS = THEMES.map(t => t.id)
export const isKnownTheme = (id) => id === 'auto' || THEME_IDS.includes(id)

// Vrai/faux : le mode système est-il sombre ?
export function prefersDark() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(themeId) {
  // 'auto' = suit la préférence système (clair → BD Report, sombre → Sombre).
  const resolvedId = themeId === 'auto' ? (prefersDark() ? 'sombre' : 'ocean-pro') : themeId
  const theme = THEMES.find(t => t.id === resolvedId) || THEMES[0]
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v))
  // Les fonds animés ont disparu avec les anciens thèmes : on nettoie l'état laissé
  // par une préférence enregistrée avant leur retrait.
  root.style.setProperty('--anim-bg', 'none')
  document.body.classList.remove('animated-bg')
  THEMES.forEach(t => { if (t.skin) root.classList.remove(`skin-${t.skin}`) })
  if (theme.skin) root.classList.add(`skin-${theme.skin}`)
  return theme
}
