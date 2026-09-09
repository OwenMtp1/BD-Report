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

const CODE = /=>|&&|\|\||\?\?|\?\.|===|!==|\.length|\.map\(|\.filter\(|\.includes\(|\breturn\b|\bconst \b|\.push\(|\.join\(|\.slice\(|\.trim\(|\.toLowerCase|\.indexOf|useState|\bnull\b|\bundefined\b|\bfunction\b|[{}$]/
const START_BAD = /^[)(\[\],:;=!.`|&+*/%<>~^-]/
const KEEP_START = /^[—·▶«»→✓✨⚠🎫🎯🏆💤📅🔥↺]/
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n')

export function collectUIStrings() {
  const found = new Map()
  const add = (s, f) => {
    s = s.replace(/\s+/g, ' ').trim()
    if (s.length < 2 || s.length > 240) return
    if (!/[a-zA-ZÀ-ÿ]{2}/.test(s)) return
    if (/^[a-z0-9._!\-[\]/ ]+$/.test(s)) return
    if (/^(https?:|#|\/|data:|sha256:)/.test(s)) return
    if (/[<>]/.test(s)) return
    if (CODE.test(s)) return
    if (START_BAD.test(s) && !KEEP_START.test(s)) return
    if (/^[0-9\s%.,;:+*/=()-]+$/.test(s)) return
    if (!found.has(s)) found.set(s, new Set())
    found.get(s).add(f.replace(/^src\//, ''))
  }
  const props = 'placeholder|title|label|text|message|yesLabel|hint|desc|alt|aria-label|sub|tooltip'
  for (const f of files) {
    const src = strip(fs.readFileSync(f, 'utf8'))
    for (const m of src.matchAll(/>\s*([^<>{}\n][^<>{}]{1,240}?)\s*</g)) add(m[1], f)
    for (const m of src.matchAll(new RegExp(`(?:${props})=(?:"([^"]{2,240})"|'([^']{2,240})'|\\{['"]([^'"]{2,240})['"]\\})`, 'g'))) add(m[1] || m[2] || m[3], f)
    for (const m of src.matchAll(/toast\(\s*['"`]([^'"`]{2,240})['"`]/g)) add(m[1], f)
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
