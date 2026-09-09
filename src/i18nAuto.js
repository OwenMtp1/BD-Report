// ---------------------------------------------------------------------------
//  TRADUCTION DE TOUTE L'INTERFACE
//
//  Le produit a été écrit en français, en dur, dans 54 écrans : ~1 500 chaînes.
//  Les envelopper une par une dans un `t('cle')` supposerait 1 500 modifications
//  manuelles, et surtout : chaque phrase ajoutée ensuite resterait en français sans
//  que personne ne s'en aperçoive. On prend donc le problème par l'autre bout —
//  le texte FRANÇAIS est la clé, et la traduction s'applique au rendu.
//
//  Conséquences, assumées :
//   · une chaîne absente du dictionnaire reste en français (dégradation lisible,
//     jamais une clé technique affichée à l'écran) ;
//   · `npm run audit` liste ce qui manque, donc rien ne se perd en silence ;
//   · seules les correspondances EXACTES sont traduites : une donnée saisie par un
//     utilisateur n'est touchée que si elle est mot pour mot une phrase de l'interface.
//
//  On ne touche QUE le texte rendu et quatre attributs visibles. Jamais la `value`
//  d'un champ : ce serait modifier une donnée, pas son affichage.
// ---------------------------------------------------------------------------
import { UI_DICT } from './i18nDict.js'

const INDEX = new Map()
UI_DICT.forEach(([fr, en, es]) => INDEX.set(fr, { en, es }))

export const uiDictSize = () => INDEX.size
export const hasTranslation = (fr) => INDEX.has(fr)

// Traduit une chaîne isolée (utilisable hors DOM : titre de page, export…).
export function trUI(text, lang) {
  if (!text || lang === 'fr') return text
  const key = String(text).trim()
  if (!key) return text
  const hit = INDEX.get(key)
  if (!hit) return text
  const out = hit[lang] || text
  // On restitue l'espacement d'origine : un nœud de texte porte souvent des blancs
  // significatifs autour (« Créer un RDV » suivi d'une icône).
  return String(text).replace(key, out)
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE'])

// Originaux mémorisés : sans eux, repasser en français serait impossible et une
// seconde passe traduirait une traduction.
const ORIG_TEXT = new WeakMap()   // Text  -> français d'origine
const ORIG_ATTR = new WeakMap()   // Element -> { attr: français d'origine }

let applying = false              // garde anti-boucle : nos écritures déclenchent l'observateur
let missing = new Set()           // chaînes vues à l'écran et absentes du dictionnaire

const skip = (node) => {
  let el = node.nodeType === 1 ? node : node.parentElement
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.hasAttribute?.('data-no-i18n')) return true
    if (el.isContentEditable) return true
    el = el.parentElement
  }
  return false
}

function applyText(node, lang) {
  const original = ORIG_TEXT.has(node) ? ORIG_TEXT.get(node) : node.data
  const key = original.trim()
  if (!key || key.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(key)) return
  if (lang === 'fr') {
    if (ORIG_TEXT.has(node) && node.data !== original) node.data = original
    return
  }
  if (!INDEX.has(key)) { if (key.length <= 240) missing.add(key); return }
  const next = original.replace(key, INDEX.get(key)[lang] || key)
  if (node.data !== next) { ORIG_TEXT.set(node, original); node.data = next }
}

function applyAttrs(el, lang) {
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) continue
    const saved = ORIG_ATTR.get(el)
    const original = saved && attr in saved ? saved[attr] : el.getAttribute(attr)
    const key = (original || '').trim()
    if (!key) continue
    if (lang === 'fr') {
      if (saved && attr in saved && el.getAttribute(attr) !== original) el.setAttribute(attr, original)
      continue
    }
    if (!INDEX.has(key)) { if (key.length <= 240) missing.add(key); continue }
    const next = original.replace(key, INDEX.get(key)[lang] || key)
    if (el.getAttribute(attr) !== next) {
      ORIG_ATTR.set(el, { ...(saved || {}), [attr]: original })
      el.setAttribute(attr, next)
    }
  }
}

function walk(root, lang) {
  if (root.nodeType === 3) { if (!skip(root)) applyText(root, lang); return }
  if (root.nodeType !== 1) return
  if (SKIP_TAGS.has(root.tagName)) return
  if (root.hasAttribute?.('data-no-i18n')) return
  applyAttrs(root, lang)
  // 4 = SHOW_TEXT, 1 = SHOW_ELEMENT. Les constantes plutôt que le global `NodeFilter` :
  // celui-ci n'existe pas dans tous les environnements de rendu (jsdom du test de fumée).
  const it = document.createTreeWalker(root, 4 | 1)
  let n
  while ((n = it.nextNode())) {
    if (n.nodeType === 3) { if (!skip(n)) applyText(n, lang) }
    else if (!SKIP_TAGS.has(n.tagName) && !n.hasAttribute?.('data-no-i18n')) applyAttrs(n, lang)
  }
}

let observer = null
let currentLang = 'fr'
let pending = null

const flush = () => {
  pending = null
  applying = true
  try { walk(document.body, currentLang) } finally { applying = false }
}

/**
 * Installe la traduction de l'interface. Idempotent : rappeler la fonction avec une
 * autre langue re-parcourt l'écran, y compris pour revenir au français.
 */
export function installUITranslator(lang) {
  currentLang = lang || 'fr'
  if (typeof document === 'undefined') return
  // Prise de test : le contrôle statique (`npm run audit`) ne voit que les chaînes écrites
  // en dur. Celles composées à l'exécution n'apparaissent qu'ici, une fois l'écran rendu.
  if (typeof window !== 'undefined') window.__bdrI18nMissing = missingStrings
  flush()
  if (observer) return
  // Environnement sans observateur de mutations (rendu serveur, jsdom minimal) : la
  // traduction initiale a déjà eu lieu, on se passe du suivi plutôt que de planter.
  const MO = typeof MutationObserver !== 'undefined' ? MutationObserver
    : (typeof window !== 'undefined' ? window.MutationObserver : null)
  if (!MO) return
  observer = new MO((records) => {
    if (applying) return // nos propres écritures : on ne se répond pas à soi-même
    // React réécrit des sous-arbres entiers : on regroupe en une passe au prochain
    // cadre plutôt que de traduire nœud par nœud pendant qu'il travaille encore.
    if (pending) return
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16)
    pending = raf(flush)
    void records
  })
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  })
}

export function uninstallUITranslator() {
  if (observer) { observer.disconnect(); observer = null }
  if (pending) { try { cancelAnimationFrame(pending) } catch (e) { clearTimeout(pending) } pending = null }
}

// Ce que l'écran a montré et que le dictionnaire ne connaît pas. Sert au contrôle de
// couverture : une phrase oubliée doit se voir dans un rapport, pas chez le client.
export const missingStrings = () => [...missing].sort()
export const resetMissing = () => { missing = new Set() }
