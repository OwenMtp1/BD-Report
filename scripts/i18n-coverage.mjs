// Couverture de la traduction : compare les chaînes de l'interface au dictionnaire.
// Sans ce contrôle, une phrase ajoutée plus tard resterait en français chez un client
// anglophone sans que personne ne s'en aperçoive.
import fs from 'node:fs'
import path from 'node:path'

const files = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name)
  if (e.isDirectory()) walk(p); else if (/\.jsx$/.test(e.name)) files.push(p)
})
walk('src')

const CODE = /=>|&&|\|\||\?\?|\?\.|===|!==|\.[a-zA-Z]\w*\(|\breturn\b|\bconst \b|\.length|\.toLowerCase|\.indexOf|useState|\bnull\b|\bundefined\b|\bfunction\b|[{}$]|['"][a-z][\w-]*['"]\s*:/
const START_BAD = /^[)(\[\],:;=!.`|&+*/%<>~^-]/
const KEEP_START = /^[—·▶«»→✓✨⚠🎫🎯🏆💤📅🔥↺]/
// Noms propres et notations qui ne se traduisent pas : les signaler comme « manquantes »
// reviendrait à demander éternellement de traduire « HubSpot » ou « macOS ».
const PROPER = new Set(['BD', 'Report', 'BDR', 'Esc', 'HubSpot', 'CRM', 'LinkedIn', 'MQL', 'SQL',
  'PDF', 'Print', 'R1', 'R2', 'RDV', 'Windows', 'Word', 'macOS', 'KO', 'ICP', 'CSAT', 'SLA',
  // Noms d'offres et de badges, employés tels quels en français comme ailleurs — et les
  // noms de langues, qui s'écrivent toujours dans leur propre langue.
  'Starter', 'Beta', 'Testing', 'Hot', 'Streak', 'Français', 'English', 'Español'])
const isProper = (s) => {
  const words = s.split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean)
  return words.length > 0 && words.every(w => PROPER.has(w))
}
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n')
// JSX écrit parfois l'apostrophe en entité : le DOM, lui, affiche le caractère. La clé du
// dictionnaire doit être ce que l'écran montre, pas ce que le source contient.
const ENTITIES = { apos: "'", nbsp: '\u00a0', amp: '&', quot: '"', laquo: '«', raquo: '»', hellip: '…', rsquo: '’', deg: '°', eacute: 'é', times: '×' }
const decode = (s) => s.replace(/&(\w+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m))
const unquote = (s) => s.replace(/\\(['"\\])/g, '$1')

export function collectUIStrings() {
  const found = new Map()
  const add = (s, f) => {
    s = decode(s).replace(/\s+/g, ' ').trim()
    if (s.length < 2 || s.length > 240) return
    if (!/[a-zA-ZÀ-ÿ]{2}/.test(s)) return
    if (/^[a-z0-9._!\-[\]/ ]+$/.test(s)) return
    if (/^(https?:|#|\/|data:|sha256:)/.test(s)) return
    if (/[<>]/.test(s)) return
    if (/\S+@\S+\.\S+/.test(s)) return                    // e-mails d'exemple
    if (/^[\w./-]+\.(md|js|jsx|css|json|html|toml)$/.test(s)) return // chemins de fichiers
    if (/^pat-/.test(s)) return                            // jetons d'exemple HubSpot
    if (CODE.test(s)) return
    if (isProper(s)) return
    if (START_BAD.test(s) && !KEEP_START.test(s)) return
    if (/^[0-9\s%.,;:+*/=()-]+$/.test(s)) return
    if (!found.has(s)) found.set(s, new Set())
    found.get(s).add(f.replace(/^src\//, ''))
  }
  const props = 'placeholder|title|label|text|message|yesLabel|hint|desc|alt|aria-label|sub|tooltip'
  const objProps = 'label|hint|tip|help|legend|caption|placeholder'
  for (const f of files) {
    const src = strip(fs.readFileSync(f, 'utf8'))
    for (const m of src.matchAll(/>\s*([^<>{}\n][^<>{}]{1,240}?)\s*</g)) add(m[1], f)
    for (const m of src.matchAll(new RegExp(`(?:${props})=(?:"([^"]{2,240})"|'([^']{2,240})'|\\{['"]([^'"]{2,240})['"]\\})`, 'g'))) add(m[1] || m[2] || m[3], f)
    // Les libellés déclarés en objet (`{ label: 'Explorer votre pipeline' }`) sont affichés
    // exactement comme un attribut JSX : les ignorer laissait des phrases entières en français.
    for (const m of src.matchAll(new RegExp(`\\b(?:${objProps})\\s*:\\s*(?:'((?:[^'\\\\]|\\\\.){2,240})'|"((?:[^"\\\\]|\\\\.){2,240})")`, 'g'))) add(unquote(m[1] || m[2]), f)
    // Les apostrophes échappées (`toast('Nommez l\'offre')`) coupaient la chaîne en deux :
    // on lit la chaîne entière, échappements compris, puis on la déséchappe.
    for (const m of src.matchAll(/toast\(\s*(?:'((?:[^'\\]|\\.){2,300})'|"((?:[^"\\]|\\.){2,300})"|`([^`{]{2,300})`)/g)) {
      add(unquote(m[1] || m[2] || m[3]), f)
    }
  }
  return found
}

const dictSrc = fs.readFileSync('src/i18nDict.js', 'utf8')
const known = new Set()
for (const m of dictSrc.matchAll(/^\s*\[\s*(['"])((?:[^\\]|\\.)*?)\1\s*,/gm)) {
  known.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
}

const all = collectUIStrings()
const missing = [...all.keys()].filter(s => !known.has(s)).sort()
const pct = all.size ? Math.round(((all.size - missing.length) / all.size) * 100) : 100

if (process.argv.includes('--list')) {
  fs.writeFileSync('/tmp/i18n-missing.json', JSON.stringify(missing, null, 1))
  process.stdout.write(missing.join('\n') + '\n')
} else {
  process.stdout.write(`i18n : ${all.size - missing.length}/${all.size} chaînes traduites (${pct} %)\n`)
  if (missing.length) process.stdout.write(`manquantes : ${missing.length}\n`)
}
