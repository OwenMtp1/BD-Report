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

// ---------------------------------------------------------------------------
//  RIEN DE COMPROMETTANT DANS LE CODE LIVRÉ.
//
//  ⚠️ Ce contrôle lit le BUNDLE, pas les sources : c'est ce que voit qui fait
//  « inspecter » sur l'application. Une chaîne peut disparaître d'un fichier et
//  revenir par un autre, ou par une dépendance — seule la sortie fait foi.
//
//  Ce qui s'y trouvait vraiment avant ce contrôle : le code PIN de démarrage en
//  clair (`pin:"1205"`), et deux identifiants nommant le fondateur (`sub-owen`,
//  `pipelineOwen`). Les valeurs sont conservées à l'identique — seules les chaînes
//  sont masquées (deob), car ces identifiants sont persistés dans les bases.
//
//  ⚠️ Ce n'est PAS du chiffrement, et ça ne prétend pas l'être : la valeur est
//  reconstruite dans le navigateur. Ça retire ce qui se lit d'un coup d'œil ou se
//  trouve par une recherche de texte. La confidentialité réelle vient du passage au
//  serveur (RLS, tâche 46), pas d'ici.
//  ⚠️ LA RECHERCHE EST INSENSIBLE À LA CASSE, et c'est le correctif le plus important
//  de ce contrôle. Ma vérification cherchait « PeopleSpheres » ; l'identifiant s'écrit
//  `env-peoplespheres`, en minuscules. J'ai donc conclu « zéro occurrence » et affirmé
//  que le bundle était propre — alors que la chaîne y était, et que la recherche de
//  DevTools, elle, ignore la casse par défaut. Un utilisateur l'a trouvée en trois
//  secondes après que j'ai déclaré le contraire. Un contrôle plus strict que le mien
//  ne sert à rien : c'est celui de l'attaquant qu'il faut égaler.
const INTERDIT = [
  { motif: 'pin:"1205"', why: "le code PIN de démarrage, en clair dans le code livré" },
  { motif: 'sub-owen', why: "un identifiant qui nomme le fondateur" },
  { motif: 'pipelineowen', why: "un repère de semis qui nomme le fondateur" },
  { motif: 'peoplespheres', why: "le nom de l'entreprise cliente, dans un identifiant d'environnement" },
  { motif: 'mrani', why: "le patronyme du fondateur" },
]
// ⚠️ Deux règles ont été RETIRÉES après vérification, et c'est instructif :
//  · `passwordClear` / `passwordPlain` sont bien dans le bundle — uniquement dans des
//    `delete`. C'est la PURGE des clairs hérités, elle doit continuer de tourner. Ce
//    qu'il faut interdire, c'est d'en ÉCRIRE un, pas d'en effacer un (règle ci-dessous).
//  · le sel d'obscurcissement y est par nécessité : `deob()` s'en sert à l'exécution.
//    Le masquer n'apporterait rien — qui ouvre la console peut appeler `deob` lui-même.
//    C'est la limite assumée de l'obscurcissement, déjà écrite dans obf.js.
const ECRITURE_CLAIR = /password(?:Clear|Plain)\s*[:=](?!=)/
if (ECRITURE_CLAIR.test(code)) {
  console.error("  ✖ le bundle ÉCRIT un mot de passe en clair (passwordClear/passwordPlain) — seule leur purge est permise")
  process.exit(1)
}
const bas = code.toLowerCase()
const trouves = INTERDIT.filter(x => bas.includes(x.motif.toLowerCase()))
if (trouves.length) {
  console.error('  ✖ chaînes compromettantes dans le bundle livré :')
  for (const t of trouves) console.error(`      « ${t.motif} » — ${t.why}`)
  process.exit(1)
}

// La porte de test ne doit pas s'ouvrir toute seule : `window.__bdrStore` donnait, depuis
// la console, la base ENTIÈRE de tous les clients. Elle n'est posée que si le banc d'essai
// s'est annoncé (`__BDR_TEST__`).
// ⚠️ Contrôle d'abord écrit trop faible : il se contentait de chercher `__BDR_TEST__`
// QUELQUE PART dans le fichier — or le drapeau sert aussi à `__bdrFlushSave`. Retirer la
// garde sur `__bdrStore` laissait donc le test au vert. On exige que le drapeau précède
// IMMÉDIATEMENT l'affectation (forme minifiée : `window.__BDR_TEST__&&(window.__bdrStore=…`).
if (/window\.__bdrStore\s*=/.test(code) && !/__BDR_TEST__[^;]{0,40}__bdrStore\s*=/.test(code)) {
  console.error("  ✖ window.__bdrStore est exposé sans garde : la base entière se lit depuis la console")
  process.exit(1)
}
console.log('  ✓ aucune chaîne compromettante, porte de test fermée, aucune source map')

// ---------------------------------------------------------------------------
//  AUCUN FICHIER DE CORRESPONDANCE (source map) PUBLIÉ.
//
//  ⚠️ C'est le pire cas, et il ne tient aujourd'hui qu'à un défaut de Vite. Avec une
//  source map à côté du bundle, l'onglet « Sources » du navigateur n'affiche PAS du
//  code minifié : il reconstitue les fichiers d'ORIGINE, commentaires compris — donc
//  toute l'architecture, les raisons de chaque garde-fou, et où sont les points
//  faibles. Un `sourcemap: true` ajouté un jour pour déboguer, et tout part en ligne
//  sans que rien n'échoue.
const maps = fs.readdirSync(ASSETS).filter(f => f.endsWith('.map'))
if (maps.length) {
  console.error(`  ✖ ${maps.length} fichier(s) de correspondance dans dist/ : le code source complet, commentaires compris, serait publié`)
  for (const m of maps) console.error(`      - ${m}`)
  process.exit(1)
}
if (/\/\/[#@]\s*sourceMappingURL=/.test(code)) {
  console.error('  ✖ le bundle référence une source map — le navigateur ira chercher le code source d\'origine')
  process.exit(1)
}

const ko = Math.round(fs.statSync(path.join(ASSETS, js[0])).size / 1024)
console.log(`  ✓ un seul fichier JS (${ko} Ko), aucun CDN tiers dans le chemin critique`)
