// 50 designs de CV — uniquement le style visuel (couleurs, typographies, mise en page,
// et position de chaque champ via l'« archetype » de layout). Aucun texte : les réponses
// du questionnaire sont injectées par le moteur de rendu (CvDocument.jsx).
import { lighten, darken, readableOn, mix } from './colors.js'

// --- Typographies (piles web-safe : aucun chargement réseau, rendu identique à l'export) ---
export const FONTS = {
  inter: { heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif" },
  georgia: { heading: "Georgia, 'Times New Roman', serif", body: "Georgia, serif" },
  times: { heading: "'Times New Roman', Times, serif", body: "'Times New Roman', Times, serif" },
  garamond: { heading: "Garamond, 'Times New Roman', serif", body: "Garamond, 'Times New Roman', serif" },
  palatino: { heading: "'Palatino Linotype', Palatino, Georgia, serif", body: "'Palatino Linotype', Palatino, serif" },
  helvetica: { heading: "Helvetica, Arial, sans-serif", body: "Helvetica, Arial, sans-serif" },
  trebuchet: { heading: "'Trebuchet MS', Helvetica, sans-serif", body: "'Trebuchet MS', Helvetica, sans-serif" },
  verdana: { heading: "Verdana, Geneva, sans-serif", body: "Verdana, Geneva, sans-serif" },
  tahoma: { heading: "Tahoma, Geneva, sans-serif", body: "Tahoma, Geneva, sans-serif" },
  century: { heading: "'Century Gothic', 'Futura', 'Trebuchet MS', sans-serif", body: "'Century Gothic', 'Futura', sans-serif" },
  mono: { heading: "'Courier New', 'Consolas', monospace", body: "'Courier New', 'Consolas', monospace" },
  techmix: { heading: "'Courier New', 'Consolas', monospace", body: "'Inter', system-ui, sans-serif" },
  serifmix: { heading: "Georgia, serif", body: "'Inter', system-ui, sans-serif" },
}

// Archetypes de mise en page — définissent la POSITION de chaque bloc de champs.
// Utilisés par CvDocument.layoutFor(). Résumé :
//  classic       : en-tête centré + colonne unique
//  sidebar-left  : bandeau latéral gauche coloré (contact/compétences/langues) + contenu
//  sidebar-right : bandeau latéral droit coloré + contenu
//  header-band   : large bandeau supérieur coloré (nom + contact) puis 2 colonnes
//  timeline      : expériences/diplômes sur une frise verticale
//  minimal       : colonne unique aérée, filets fins, en-tête aligné à gauche
//  twocol        : deux colonnes équilibrées sans fond de couleur
//  boxed         : chaque section dans une carte encadrée
//  compact       : dense, en-tête compact + 2 colonnes serrées (profils seniors)
//  creative      : gros bloc nom coloré + accents géométriques
export const ARCHETYPES = ['classic', 'sidebar-left', 'sidebar-right', 'header-band', 'timeline', 'minimal', 'twocol', 'boxed', 'compact', 'creative']

// Construit la palette complète d'un design à partir d'une couleur d'accent + réglages.
function build(cfg) {
  const accent = cfg.accent
  const accent2 = cfg.accent2 || lighten(accent, 0.28)
  const page = cfg.page || '#ffffff'
  const text = cfg.text || '#242a33'
  const muted = cfg.muted || '#6b7280'
  const line = cfg.line || '#e6e8ec'
  const heading = cfg.heading || accent
  const band = cfg.band || accent
  const bandText = cfg.bandText || readableOn(band)
  const tone = cfg.sidebarTone || 'dark'
  const sidebarBg = cfg.sidebarBg || (tone === 'dark' ? darken(accent, cfg.sidebarShade ?? 0.12)
    : tone === 'ink' ? '#1f2530'
    : lighten(accent, cfg.sidebarShade ?? 0.9))
  const sidebarText = cfg.sidebarText || readableOn(sidebarBg)
  const sidebarMuted = cfg.sidebarMuted || (readableOn(sidebarBg) === '#ffffff' ? 'rgba(255,255,255,.72)' : mix(text, sidebarBg, 0.35))
  const sidebarHeading = cfg.sidebarHeading || (readableOn(sidebarBg) === '#ffffff' ? '#ffffff' : accent)
  const sidebarLine = cfg.sidebarLine || (readableOn(sidebarBg) === '#ffffff' ? 'rgba(255,255,255,.22)' : line)
  return {
    accent, accent2, page, text, muted, line, heading, band, bandText,
    sidebarBg, sidebarText, sidebarMuted, sidebarHeading, sidebarLine,
  }
}

// opts par défaut selon l'archetype (surchargeables par design).
function baseOpts(archetype) {
  const o = {
    nameUpper: false, headingUpper: true, headingStyle: 'underline', skillStyle: 'chip',
    photoShape: 'circle', divider: 'line', nameSize: 30, letterSpacing: 0, dense: false,
  }
  if (archetype === 'minimal') Object.assign(o, { headingStyle: 'plain', skillStyle: 'text', headingUpper: true, letterSpacing: 2 })
  if (archetype === 'creative') Object.assign(o, { nameUpper: true, headingStyle: 'bar', skillStyle: 'bar', nameSize: 40 })
  if (archetype === 'boxed') Object.assign(o, { headingStyle: 'boxed', skillStyle: 'chip' })
  if (archetype === 'timeline') Object.assign(o, { headingStyle: 'pill' })
  if (archetype === 'compact') Object.assign(o, { dense: true, nameSize: 26, headingStyle: 'bar', skillStyle: 'text' })
  if (archetype === 'header-band') Object.assign(o, { headingStyle: 'underline' })
  return o
}

// Fabrique un design complet.
function d(id, name, style, archetype, accent, fontKey, opts = {}, keywords = [], paletteCfg = {}) {
  return {
    id, name, style, archetype,
    fonts: FONTS[fontKey] || FONTS.inter,
    palette: build({ accent, ...paletteCfg }),
    opts: { ...baseOpts(archetype), ...opts },
    keywords: [style, ...keywords].map(k => k.toLowerCase()),
  }
}

// ------------------------------------------------------------------ Les 50 designs
export const DESIGNS = [
  // — Modernes / bleus —
  d('azur-pro', 'Azur Pro', 'moderne', 'sidebar-left', '#3B5BDB', 'inter', {}, ['professionnel', 'bleu', 'corporate', 'clair', 'développeur']),
  d('cyan-wave', 'Cyan Wave', 'moderne', 'sidebar-right', '#0EA5E9', 'inter', { headingStyle: 'bar' }, ['bleu', 'tech', 'coloré', 'dynamique']),
  d('indigo-band', 'Indigo Band', 'moderne', 'header-band', '#4F46E5', 'inter', {}, ['bleu', 'corporate', 'cadre', 'professionnel']),
  d('sky-minimal', 'Sky Minimal', 'minimaliste', 'minimal', '#0891B2', 'helvetica', {}, ['bleu', 'sobre', 'épuré', 'clair']),
  d('royal-classic', 'Royal Classic', 'classique', 'classic', '#1E3A8A', 'georgia', { headingStyle: 'underline' }, ['bleu', 'sérieux', 'traditionnel', 'juridique']),

  // — Corporate / sobres —
  d('slate-corp', 'Slate Corporate', 'corporate', 'sidebar-left', '#334155', 'helvetica', { skillStyle: 'bar' }, ['sobre', 'gris', 'entreprise', 'sérieux', 'manager']),
  d('graphite', 'Graphite', 'corporate', 'twocol', '#475569', 'verdana', {}, ['gris', 'sobre', 'neutre', 'consultant']),
  d('navy-executive', 'Navy Executive', 'senior', 'compact', '#1E293B', 'georgia', {}, ['bleu nuit', 'senior', 'dirigeant', 'executive', 'expérimenté']),
  d('charcoal-lines', 'Charcoal Lines', 'minimaliste', 'minimal', '#374151', 'trebuchet', {}, ['gris', 'épuré', 'sobre', 'noir et blanc']),
  d('steel-boxed', 'Steel Boxed', 'corporate', 'boxed', '#64748B', 'tahoma', {}, ['gris', 'structuré', 'cadres', 'entreprise']),

  // — Créatifs / colorés —
  d('coral-creative', 'Coral Creative', 'créatif', 'creative', '#F43F5E', 'century', {}, ['rose', 'créatif', 'coloré', 'design', 'audacieux']),
  d('sunset-band', 'Sunset Band', 'créatif', 'header-band', '#F97316', 'trebuchet', { nameUpper: true }, ['orange', 'chaleureux', 'coloré', 'marketing']),
  d('magenta-pop', 'Magenta Pop', 'créatif', 'sidebar-left', '#DB2777', 'century', { skillStyle: 'bar' }, ['rose', 'pop', 'coloré', 'communication']),
  d('violet-studio', 'Violet Studio', 'créatif', 'creative', '#7C3AED', 'century', {}, ['violet', 'artistique', 'design', 'studio', 'graphiste']),
  d('amber-craft', 'Amber Craft', 'créatif', 'boxed', '#F59E0B', 'trebuchet', {}, ['jaune', 'orange', 'artisan', 'chaleureux', 'coloré']),

  // — Tech —
  d('terminal', 'Terminal', 'tech', 'sidebar-left', '#10B981', 'techmix', { headingStyle: 'bar', photoShape: 'square' }, ['vert', 'développeur', 'code', 'ingénieur', 'geek']),
  d('cyber-mono', 'Cyber Mono', 'tech', 'minimal', '#22D3EE', 'mono', { photoShape: 'square' }, ['cyan', 'code', 'moderne', 'startup', 'data'], { text: '#1f2937' }),
  d('devops-dark', 'DevOps Dark', 'tech', 'sidebar-left', '#3B82F6', 'techmix', { photoShape: 'rounded' }, ['bleu', 'ingénieur', 'infrastructure', 'sombre'], { sidebarTone: 'ink' }),
  d('circuit', 'Circuit', 'tech', 'twocol', '#06B6D4', 'techmix', { headingStyle: 'bar' }, ['cyan', 'électronique', 'ingénieur', 'technique']),
  d('matrix-green', 'Matrix Green', 'tech', 'compact', '#16A34A', 'mono', {}, ['vert', 'code', 'dense', 'développeur', 'senior']),

  // — Minimalistes —
  d('pure-white', 'Pure White', 'minimaliste', 'minimal', '#111827', 'helvetica', { skillStyle: 'text' }, ['noir', 'épuré', 'sobre', 'élégant', 'simple']),
  d('thin-serif', 'Thin Serif', 'minimaliste', 'minimal', '#4B5563', 'garamond', {}, ['serif', 'épuré', 'élégant', 'raffiné', 'éditorial']),
  d('mono-line', 'Mono Line', 'minimaliste', 'classic', '#1F2937', 'mono', { headingStyle: 'plain' }, ['monospace', 'sobre', 'moderne', 'simple']),
  d('whitespace', 'Whitespace', 'minimaliste', 'twocol', '#6B7280', 'trebuchet', { skillStyle: 'text', headingStyle: 'plain' }, ['aéré', 'clair', 'sobre', 'lisible']),
  d('ink-minimal', 'Ink Minimal', 'minimaliste', 'minimal', '#0F172A', 'times', {}, ['noir', 'classique', 'sobre', 'sérieux']),

  // — Luxe / élégants —
  d('gold-lux', 'Gold Lux', 'luxe', 'sidebar-right', '#B8860B', 'garamond', { headingStyle: 'underline', photoShape: 'circle' }, ['or', 'luxe', 'élégant', 'raffiné', 'haut de gamme']),
  d('bordeaux', 'Bordeaux', 'luxe', 'classic', '#7F1D1D', 'palatino', {}, ['rouge', 'bordeaux', 'élégant', 'prestige', 'sérieux']),
  d('emerald-lux', 'Emerald Luxe', 'luxe', 'sidebar-left', '#065F46', 'garamond', {}, ['vert', 'luxe', 'raffiné', 'élégant', 'nature']),
  d('noir-or', 'Noir & Or', 'luxe', 'header-band', '#0A0A0A', 'palatino', { nameUpper: true }, ['noir', 'or', 'luxe', 'prestige', 'chic'], { band: '#0A0A0A', accent2: '#C9A227', heading: '#B8860B' }),
  d('rose-elegant', 'Rose Élégant', 'élégant', 'sidebar-right', '#BE185D', 'garamond', {}, ['rose', 'élégant', 'féminin', 'raffiné', 'mode']),

  // — Juniors / étudiants —
  d('fresh-start', 'Fresh Start', 'junior', 'sidebar-left', '#22C55E', 'trebuchet', {}, ['vert', 'étudiant', 'jeune', 'premier emploi', 'stage']),
  d('campus', 'Campus', 'junior', 'header-band', '#0EA5E9', 'verdana', {}, ['bleu', 'étudiant', 'dynamique', 'stage', 'alternance']),
  d('junior-pop', 'Junior Pop', 'junior', 'boxed', '#8B5CF6', 'century', {}, ['violet', 'jeune', 'coloré', 'stage', 'débutant']),
  d('grad-clean', 'Grad Clean', 'junior', 'twocol', '#F59E0B', 'trebuchet', {}, ['orange', 'diplômé', 'jeune', 'clair', 'stage']),
  d('starter-blue', 'Starter Blue', 'junior', 'classic', '#2563EB', 'verdana', {}, ['bleu', 'débutant', 'simple', 'étudiant']),

  // — Seniors / directions —
  d('director', 'Director', 'senior', 'compact', '#0F172A', 'georgia', {}, ['noir', 'direction', 'senior', 'executive', 'expérimenté']),
  d('consultant', 'Consultant', 'senior', 'twocol', '#1D4ED8', 'georgia', { headingStyle: 'underline' }, ['bleu', 'consultant', 'senior', 'conseil', 'expert']),
  d('heritage', 'Heritage', 'senior', 'classic', '#3F3F46', 'times', {}, ['gris', 'classique', 'senior', 'traditionnel']),
  d('board', 'Board', 'senior', 'sidebar-left', '#334155', 'palatino', { skillStyle: 'text' }, ['gris', 'dirigeant', 'senior', 'gouvernance']),
  d('veteran', 'Veteran', 'senior', 'compact', '#7C2D12', 'georgia', {}, ['brun', 'expérimenté', 'senior', 'dense', 'expert']),

  // — Marketing / communication —
  d('brand-pink', 'Brand Pink', 'marketing', 'header-band', '#EC4899', 'century', { nameUpper: true }, ['rose', 'marketing', 'communication', 'coloré', 'branding']),
  d('growth-teal', 'Growth Teal', 'marketing', 'sidebar-left', '#14B8A6', 'trebuchet', { skillStyle: 'bar' }, ['turquoise', 'marketing', 'growth', 'dynamique']),
  d('social-orange', 'Social Orange', 'marketing', 'creative', '#EA580C', 'century', {}, ['orange', 'social media', 'communication', 'coloré']),
  d('media-violet', 'Media Violet', 'marketing', 'boxed', '#9333EA', 'trebuchet', {}, ['violet', 'média', 'communication', 'créatif']),

  // — Divers styles supplémentaires —
  d('timeline-blue', 'Timeline Blue', 'moderne', 'timeline', '#2563EB', 'inter', {}, ['bleu', 'frise', 'chronologie', 'moderne', 'parcours']),
  d('timeline-warm', 'Timeline Warm', 'créatif', 'timeline', '#DB6E1E', 'trebuchet', {}, ['orange', 'frise', 'chronologie', 'chaleureux']),
  d('teal-band', 'Teal Band', 'moderne', 'header-band', '#0D9488', 'helvetica', {}, ['turquoise', 'moderne', 'clair', 'santé']),
  d('crimson-boxed', 'Crimson Boxed', 'moderne', 'boxed', '#DC2626', 'trebuchet', {}, ['rouge', 'énergique', 'coloré', 'commercial']),
  d('forest', 'Forest', 'moderne', 'sidebar-right', '#166534', 'georgia', {}, ['vert', 'nature', 'environnement', 'sobre']),
  d('midnight', 'Midnight', 'moderne', 'sidebar-left', '#4338CA', 'inter', { photoShape: 'rounded' }, ['bleu nuit', 'moderne', 'élégant', 'sombre'], { sidebarTone: 'ink' }),
]

// Sécurité : garantir exactement 50 designs et des ids uniques.
if (DESIGNS.length !== 50) console.warn('[cv] nombre de designs attendu = 50, obtenu', DESIGNS.length)

export const designById = (id) => DESIGNS.find(x => x.id === id) || DESIGNS[0]

// Vocabulaire de synonymes pour rapprocher les mots-clés utilisateur des mots-clés design.
const SYNONYMS = {
  moderne: ['modern', 'contemporain', 'actuel'],
  minimaliste: ['minimal', 'épuré', 'epure', 'sobre', 'simple', 'clean'],
  créatif: ['creatif', 'creative', 'artistique', 'original', 'audacieux'],
  corporate: ['entreprise', 'business', 'pro', 'professionnel', 'formel'],
  tech: ['technique', 'développeur', 'developpeur', 'dev', 'informatique', 'code', 'startup', 'ingénieur', 'ingenieur'],
  luxe: ['luxury', 'prestige', 'chic', 'raffiné', 'raffine', 'haut de gamme', 'premium', 'élégant', 'elegant'],
  junior: ['étudiant', 'etudiant', 'jeune', 'débutant', 'debutant', 'stage', 'alternance', 'premier emploi'],
  senior: ['expérimenté', 'experimente', 'expert', 'direction', 'dirigeant', 'executive', 'cadre'],
  marketing: ['communication', 'com', 'growth', 'branding', 'social', 'digital'],
  coloré: ['colore', 'couleur', 'vif', 'pop', 'dynamique'],
  élégant: ['elegant', 'raffiné', 'raffine', 'sobre', 'chic'],
  classique: ['classic', 'traditionnel', 'sérieux', 'serieux', 'formel'],
}

function expand(token) {
  const out = new Set([token])
  for (const [k, arr] of Object.entries(SYNONYMS)) {
    if (k === token || arr.includes(token)) { out.add(k); arr.forEach(s => out.add(s)) }
  }
  return [...out]
}

// Normalise + découpe une saisie utilisateur en tokens (sans accents pour être tolérant).
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,;:!?()/]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !['un', 'une', 'de', 'des', 'le', 'la', 'les', 'et', 'ou', 'pour', 'avec', 'cv', 'style', 'type', 'plutot', 'plutôt', 'très', 'tres'].includes(t))
}

// Score de correspondance entre une saisie et un design (nombre de mots-clés couverts).
export function scoreDesign(design, tokens) {
  if (!tokens.length) return 0
  const kw = new Set(design.keywords)
  let score = 0
  for (const tok of tokens) {
    const variants = expand(tok)
    let hit = variants.some(v => kw.has(v))
    // correspondance partielle (préfixe) pour tolérer les fautes/formes
    if (!hit) hit = [...kw].some(k => (k.length >= 4 && (k.startsWith(tok) || tok.startsWith(k))))
    if (hit) score += 1
  }
  return score
}

// Classe les designs par pertinence. Renvoie toujours la liste complète triée
// (score décroissant) → si aucun ne correspond, les « plus proches » restent proposés.
export function matchDesigns(keywords) {
  const tokens = tokenize(keywords)
  const scored = DESIGNS.map(design => ({ design, score: scoreDesign(design, tokens) }))
  scored.sort((a, b) => b.score - a.score || a.design.name.localeCompare(b.design.name))
  const hasMatch = scored.some(s => s.score > 0)
  return { tokens, scored, hasMatch }
}
