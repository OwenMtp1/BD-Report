// ---------------------------------------------------------------------------
//  Authentification Supabase — utilisée UNIQUEMENT quand FEATURES.multiTenant
//  est activé. Inerte tant que rien ne l'importe (drapeau OFF).
//  Donne : connexion e-mail/mot de passe, session courante, déconnexion,
//  écoute des changements de session, réinitialisation de mot de passe.
// ---------------------------------------------------------------------------
import { getClient } from './supabaseClient.js'
import { isSupabaseConfigured } from './supabaseConfig.js'

export async function signIn(email, password) {
  const c = await getClient(); if (!c) return { error: 'Supabase indisponible' }
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  return { user: data?.user || null, session: data?.session || null, error: error?.message || null }
}

// Connexion Google : redirige vers Google, qui renvoie sur `redirectTo` avec une
// session Supabase déjà posée (detectSessionInUrl). La jonction avec un compte
// BD Report se fait ensuite sur l'e-mail, côté app.
export async function signInWithGoogle(redirectTo) {
  const c = await getClient()
  // Deux pannes très différentes se cachaient derrière « Supabase indisponible » :
  // des clés absentes, ou la librairie qui n'a pas pu être chargée. On les sépare.
  if (!c) return { error: isSupabaseConfigured() ? 'librairie Supabase non chargée' : 'Supabase non configuré' }
  const back = redirectTo || (typeof window !== 'undefined' ? window.location.href.split('#')[0] : undefined)
  // prompt=select_account : Google redemande systématiquement quel compte utiliser,
  // au lieu d'enchaîner sur le dernier — indispensable sur un poste partagé.
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: back, queryParams: { prompt: 'select_account' } },
  })
  return { error: error?.message || null }
}

export async function signOut() {
  const c = await getClient(); if (!c) return
  try { await c.auth.signOut() } catch { /* ignore */ }
}

export async function getCurrentUser() {
  const c = await getClient(); if (!c) return null
  const { data } = await c.auth.getUser()
  return data?.user || null
}

export async function getSession() {
  const c = await getClient(); if (!c) return null
  const { data } = await c.auth.getSession()
  return data?.session || null
}

// Appelle cb(session) à chaque changement (login / logout / refresh). Renvoie un désabonnement.
export async function onAuthChange(cb) {
  const c = await getClient(); if (!c) return () => {}
  const { data } = c.auth.onAuthStateChange((_event, session) => cb(session))
  return () => { try { data.subscription.unsubscribe() } catch { /* ignore */ } }
}

export async function sendPasswordReset(email, redirectTo) {
  const c = await getClient(); if (!c) return { error: 'Supabase indisponible' }
  const { error } = await c.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  return { error: error?.message || null }
}
