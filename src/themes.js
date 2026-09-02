// 10 thèmes statiques + 10 ambiances animées. Couleurs en triplets RGB pour les variables CSS.
export const THEMES = [
  // ---- Statiques ----
  { id: 'ocean-pro', name: 'Océan Pro', type: 'static', vars: { brand: '59 91 219', brand2: '14 165 233', surface: '244 246 250', card: '255 255 255', ink: '23 32 51', muted: '100 112 133', line: '226 230 238' } },
  { id: 'hubspot', name: 'Orange Corail', type: 'static', vars: { brand: '255 122 89', brand2: '255 156 102', surface: '250 247 245', card: '255 255 255', ink: '33 53 71', muted: '112 124 138', line: '234 227 222' } },
  { id: 'emeraude', name: 'Émeraude', type: 'static', vars: { brand: '16 150 110', brand2: '52 211 153', surface: '243 249 246', card: '255 255 255', ink: '20 45 38', muted: '95 115 105', line: '222 235 228' } },
  { id: 'nuit', name: 'Mode Nuit', type: 'static', vars: { brand: '99 132 255', brand2: '56 189 248', surface: '15 20 32', card: '24 31 46', ink: '230 236 246', muted: '140 152 175', line: '45 55 75' } },
  // Vrai mode sombre : palette neutre pensée (fond ardoise profond, cartes surélevées, texte off-white).
  { id: 'sombre', name: 'Sombre', type: 'static', vars: { brand: '96 130 255', brand2: '56 189 248', surface: '15 18 25', card: '25 30 41', ink: '226 232 240', muted: '148 163 184', line: '42 50 64' } },
  { id: 'violet-saas', name: 'Violet SaaS', type: 'static', vars: { brand: '124 58 237', brand2: '167 139 250', surface: '247 245 252', card: '255 255 255', ink: '35 28 60', muted: '110 102 135', line: '231 226 243' } },
  { id: 'graphite', name: 'Graphite', type: 'static', vars: { brand: '51 65 85', brand2: '100 116 139', surface: '241 243 245', card: '255 255 255', ink: '20 28 40', muted: '105 115 130', line: '224 228 234' } },
  { id: 'rose-punch', name: 'Rose Punch', type: 'static', vars: { brand: '219 39 119', brand2: '244 114 182', surface: '252 246 249', card: '255 255 255', ink: '55 22 40', muted: '130 100 115', line: '240 224 232' } },
  { id: 'ambre', name: 'Ambre Doré', type: 'static', vars: { brand: '202 138 4', brand2: '250 204 21', surface: '251 249 243', card: '255 255 255', ink: '50 40 15', muted: '125 115 90', line: '236 229 212' } },
  { id: 'cyan-tech', name: 'Cyan Tech', type: 'static', vars: { brand: '8 145 178', brand2: '34 211 238', surface: '242 249 251', card: '255 255 255', ink: '18 40 48', muted: '95 118 126', line: '220 235 240' } },
  { id: 'bordeaux', name: 'Bordeaux Élégant', type: 'static', vars: { brand: '159 18 57', brand2: '225 29 72', surface: '250 245 246', card: '255 255 255', ink: '50 18 28', muted: '128 100 108', line: '238 224 228' } },
  // ---- Ambiances animées ----
  { id: 'aurore', name: 'Aurore Boréale', type: 'animated', bg: 'linear-gradient(120deg,#0b1026,#16324f,#0e5e4e,#16324f,#0b1026)', bubbles: ['#34d399', '#38bdf8', '#a78bfa'], vars: { brand: '52 211 153', brand2: '56 189 248', surface: '11 16 38', card: '20 28 52', ink: '230 240 250', muted: '145 160 185', line: '45 58 88' } },
  { id: 'ocean-anime', name: 'Océan Profond', type: 'animated', bg: 'linear-gradient(160deg,#dff3fb,#bfe6f5,#dff3fb,#cdebf7)', bubbles: ['#38bdf8', '#0ea5e9', '#67e8f9'], vars: { brand: '2 132 199', brand2: '14 165 233', surface: '223 243 251', card: '255 255 255', ink: '12 45 65', muted: '85 115 135', line: '200 228 240' } },
  { id: 'lagon', name: 'Lagon Tropical', type: 'animated', bg: 'linear-gradient(135deg,#e0fbf4,#c9f3ec,#e8fbef,#d2f5e8)', bubbles: ['#2dd4bf', '#34d399', '#22d3ee'], vars: { brand: '13 148 136', brand2: '45 212 191', surface: '224 251 244', card: '255 255 255', ink: '15 50 45', muted: '90 120 112', line: '198 235 226' } },
  { id: 'crepuscule', name: 'Crépuscule', type: 'animated', bg: 'linear-gradient(140deg,#fdf0e7,#fbe3e0,#f3e3f3,#fdf0e7)', bubbles: ['#fb923c', '#f472b6', '#c084fc'], vars: { brand: '234 88 12', brand2: '244 114 182', surface: '253 240 231', card: '255 255 255', ink: '60 35 25', muted: '135 110 100', line: '243 224 212' } },
  { id: 'nebuleuse', name: 'Nébuleuse', type: 'animated', bg: 'linear-gradient(130deg,#171130,#2a1b4d,#1b2a5c,#171130)', bubbles: ['#a78bfa', '#f472b6', '#60a5fa'], vars: { brand: '167 139 250', brand2: '244 114 182', surface: '23 17 48', card: '34 26 64', ink: '236 232 248', muted: '160 150 190', line: '58 48 95' } },
  { id: 'foret', name: 'Forêt Brumeuse', type: 'animated', bg: 'linear-gradient(150deg,#eef5ee,#dcebdd,#e8f2e4,#eef5ee)', bubbles: ['#4ade80', '#86efac', '#a3e635'], vars: { brand: '22 101 52', brand2: '74 222 128', surface: '238 245 238', card: '255 255 255', ink: '22 45 30', muted: '100 122 105', line: '215 232 216' } },
  { id: 'sakura', name: 'Sakura', type: 'animated', bg: 'linear-gradient(135deg,#fdf2f6,#fce7ef,#f8e8f8,#fdf2f6)', bubbles: ['#f9a8d4', '#f472b6', '#fbcfe8'], vars: { brand: '219 39 119', brand2: '249 168 212', surface: '253 242 246', card: '255 255 255', ink: '60 25 42', muted: '140 105 120', line: '245 222 232' } },
  { id: 'desert', name: 'Dunes au Couchant', type: 'animated', bg: 'linear-gradient(145deg,#fdf6ec,#fbeeda,#f9e4cf,#fdf6ec)', bubbles: ['#fbbf24', '#fb923c', '#fcd34d'], vars: { brand: '180 83 9', brand2: '251 146 60', surface: '253 246 236', card: '255 255 255', ink: '62 40 18', muted: '138 115 90', line: '241 228 208' } },
  { id: 'glacier', name: 'Glacier', type: 'animated', bg: 'linear-gradient(155deg,#f0f7ff,#e2eefc,#eaf3ff,#f0f7ff)', bubbles: ['#93c5fd', '#bfdbfe', '#a5f3fc'], vars: { brand: '37 99 235', brand2: '147 197 253', surface: '240 247 255', card: '255 255 255', ink: '20 38 65', muted: '100 118 145', line: '218 232 248' } },
  { id: 'minuit-or', name: 'Minuit & Or', type: 'animated', bg: 'linear-gradient(135deg,#10131c,#1c2030,#241f12,#10131c)', bubbles: ['#facc15', '#fbbf24', '#fde68a'], vars: { brand: '250 204 21', brand2: '251 191 36', surface: '16 19 28', card: '26 30 42', ink: '240 238 228', muted: '158 152 132', line: '52 56 70' } },
]

// Vrai/faux : le mode système est-il sombre ?
export function prefersDark() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(themeId) {
  // 'auto' = suit la préférence système (clair → Océan Pro, sombre → Sombre).
  const resolvedId = themeId === 'auto' ? (prefersDark() ? 'sombre' : 'ocean-pro') : themeId
  const theme = THEMES.find(t => t.id === resolvedId) || THEMES[0]
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v))
  if (theme.type === 'animated') {
    root.style.setProperty('--anim-bg', theme.bg)
    document.body.classList.add('animated-bg')
  } else {
    root.style.setProperty('--anim-bg', 'none')
    document.body.classList.remove('animated-bg')
  }
  return theme
}
