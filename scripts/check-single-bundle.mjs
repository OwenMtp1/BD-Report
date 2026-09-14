// ============================================================================
//  Le build ne doit produire qu'UN SEUL fichier JavaScript.
//
//  Pourquoi c'est un contrôle et pas une préférence : le workflow de déploiement
//  inline l'unique balise <script> dans `app-inline.html` et ne publie QUE ce
//  fichier (cf. .github/workflows/deploy-pages.yml). Un second morceau produit
//  par Rollup n'est copié nulle part — l'utilisateur reçoit un 404 et l'écran
//  reste blanc, alors que le build, lui, s'est terminé sans la moindre erreur.
//
//  C'est arrivé en embarquant @supabase/supabase-js, qui contient un `import()`
//  interne : le morceau sorti portait le client Supabase, donc c'est le chemin
//  de CONNEXION qui serait tombé en production. Rien ne l'aurait signalé avant
//  qu'un utilisateur ne s'en plaigne.
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'dist', 'assets')

console.log('\n=== UN SEUL MORCEAU JS ===')

if (!fs.existsSync(ASSETS)) {
  // `npm run audit` se lance aussi seul. Ne pas échouer ici, mais ne pas non
  // plus laisser croire que le contrôle a été fait.
  console.log('  ⚠ dist/ absent — contrôle NON effectué (lancez `npm run build` avant).')
  process.exit(0)
}

const js = fs.readdirSync(ASSETS).filter(f => f.endsWith('.js'))
if (js.length !== 1) {
  console.error(`  ✖ ${js.length} fichier(s) JS produits, il en faut exactement 1 :`)
  for (const f of js) console.error(`      - ${f}`)
  console.error('    Un morceau séparé ne serait PAS publié : 404 à l\'exécution, écran blanc.')
  console.error('    Corrigez la cause (un `import()` dynamique, dans le code ou dans une')
  console.error('    dépendance) — `inlineDynamicImports` est déjà posé dans vite.config.js.')
  process.exit(1)
}

// Le CDN tiers ne doit pas revenir par la bande : la bibliothèque est embarquée.
const code = fs.readFileSync(path.join(ASSETS, js[0]), 'utf8')
if (code.includes('esm.sh')) {
  console.error('  ✖ le bundle référence encore esm.sh — la dépendance doit être embarquée.')
  process.exit(1)
}

const ko = Math.round(fs.statSync(path.join(ASSETS, js[0])).size / 1024)
console.log(`  ✓ un seul fichier JS (${ko} Ko), aucun CDN tiers dans le chemin critique`)
