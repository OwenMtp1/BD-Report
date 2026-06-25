// ---------------------------------------------------------------------------
//  Client Supabase partagé (auth + données + realtime sur la MÊME instance,
//  pour que la session authentifiée s'applique aux requêtes et au temps réel).
//  Chargé dynamiquement depuis esm.sh (cohérent avec supabaseSync.js).
// ---------------------------------------------------------------------------
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseConfig.js'

let clientPromise = null

export async function getClient() {
  if (!isSupabaseConfigured()) return null
  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ 'https://esm.sh/@supabase/supabase-js@2')
      .then((m) => m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 5 } },
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }))
      .catch(() => null)
  }
  return clientPromise
}
