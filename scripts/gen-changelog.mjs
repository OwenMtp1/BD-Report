// Génère out/app/changelog.json à partir des commits git (au déploiement).
// Ne garde que les entrées orientées utilisateur (Feature/Design/Sécurité),
// nettoyées de leur préfixe. Auto-renseigné à chaque déploiement.
import { execSync } from 'node:child_process'
import fs from 'node:fs'

let raw = ''
try {
  raw = execSync('git log -120 --pretty=format:%ad%x09%s --date=short', { encoding: 'utf8' })
} catch (e) {
  console.warn('gen-changelog: git log indisponible', e.message)
}

const seen = new Set()
const entries = raw.split('\n')
  .map(l => { const i = l.indexOf('\t'); return i < 0 ? null : { date: l.slice(0, i), text: l.slice(i + 1).trim() } })
  .filter(Boolean)
  .filter(e => /^(feature|features|design|s[ée]curit[ée])\b/i.test(e.text))
  .map(e => ({ date: e.date, text: e.text.replace(/^(features?|design|s[ée]curit[ée])\s*:\s*/i, '').trim() }))
  .filter(e => { const k = e.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  .slice(0, 40)

fs.mkdirSync('out/app', { recursive: true })
fs.writeFileSync('out/app/changelog.json', JSON.stringify(entries))
console.log(`gen-changelog: ${entries.length} entrées écrites`)
