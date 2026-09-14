import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️ UN SEUL FICHIER JS EN SORTIE — ce n'est pas une préférence, c'est une
// contrainte du déploiement. Le workflow GitHub Actions inline l'unique balise
// <script> dans `app-inline.html` et ne publie QUE ce fichier : tout morceau
// séparé produit par Rollup finirait en 404 chez l'utilisateur.
//
// Le cas s'est présenté en embarquant @supabase/supabase-js, qui contient un
// `import()` interne : Rollup a sorti un second morceau, et c'est le chemin de
// CONNEXION qui serait tombé en production — sans que rien n'échoue au build.
// `inlineDynamicImports` replie ces imports dans le morceau principal.
//
// ⚠️ MAIS SEULEMENT POUR L'APPLICATION. Appliqué aussi aux builds SSR (le smoke
// et l'audit), il change l'ordre d'évaluation des modules : react-dom se
// retrouvait chargé AVANT que le banc n'installe les globales jsdom, et prenait
// le document pour un vieil IE — d'où un « detachEvent is not a function » à
// chaque frappe simulée. Le test tombait pour une raison qui n'existait que
// dans le test. Ces builds-là n'ont de toute façon aucune contrainte de
// mono-fichier : ils sont exécutés par Node, pas servis à un navigateur.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: isSsrBuild ? {} : { inlineDynamicImports: true },
    },
  },
}))
