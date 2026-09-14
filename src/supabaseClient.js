// ---------------------------------------------------------------------------
//  Client Supabase partagé (auth + données + realtime sur la MÊME instance,
//  pour que la session authentifiée s'applique aux requêtes et au temps réel).
//
//  ⚠️ LA BIBLIOTHÈQUE EST EMBARQUÉE DANS LE BUILD, plus téléchargée depuis esm.sh.
//  Elle était le SEUL tiers présent dans le chemin critique de la connexion : s'il
//  tombait, plus personne ne se connectait ni ne synchronisait ; s'il était
//  compromis, le code servi avait la main sur la session de tous les utilisateurs.
//  Faire dépendre l'authentification d'un CDN qu'on ne contrôle pas ne se justifie
//  que par la commodité — et il n'y en avait même pas, puisqu'on l'installe de
//  toute façon pour la migration.
//
//  ⚠️ L'import est STATIQUE, et il doit le rester : le déploiement (GitHub Actions)
//  inline l'application en un seul fichier et ne publie que lui, donc un `import()`
//  vers un module local finirait en 404 (cf. CLAUDE.md, section DÉPLOIEMENT).
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseConfig.js'

let client = null

export async function getClient() {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    try {
      client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 5 } },
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    } catch (e) { return null }
  }
  return client
}
