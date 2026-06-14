// ---------------------------------------------------------------------------
//  Couche de synchronisation Supabase (optionnelle).
//  Tout est inerte tant que supabaseConfig n'est pas renseigné : aucune
//  dépendance n'est chargée et aucun appel réseau n'est fait.
//  Le client @supabase/supabase-js est importé dynamiquement depuis un CDN
//  (esm.sh) pour ne pas alourdir le bundle/déploiement mono-fichier.
// ---------------------------------------------------------------------------
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseConfig.js'

const STATE_ID = 'main'
let clientPromise = null

async function getClient() {
  if (!isSupabaseConfigured()) return null
  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ 'https://esm.sh/@supabase/supabase-js@2')
      .then(m => m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 5 } } }))
      .catch(() => null)
  }
  return clientPromise
}

// ----- État applicatif partagé (toute l'app) ------------------------------
export async function fetchRemoteState() {
  const c = await getClient(); if (!c) return null
  try {
    const { data, error } = await c.from('app_state').select('data').eq('id', STATE_ID).maybeSingle()
    if (error || !data) return null
    return data.data
  } catch (e) { return null }
}

export async function pushRemoteState(db) {
  const c = await getClient(); if (!c) return
  try { await c.from('app_state').upsert({ id: STATE_ID, data: db, updated_at: new Date().toISOString() }) } catch (e) { /* offline */ }
}

let pushTimer = null
export function pushRemoteStateDebounced(db, delay = 900) {
  if (!isSupabaseConfigured()) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => pushRemoteState(db), delay)
}

export async function subscribeRemoteState(onChange) {
  const c = await getClient(); if (!c) return () => {}
  const ch = c.channel('app_state_rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: `id=eq.${STATE_ID}` },
      payload => { if (payload.new && payload.new.data) onChange(payload.new.data) })
    .subscribe()
  return () => { try { c.removeChannel(ch) } catch (e) {} }
}

// ----- Test de connexion (bouton « Tester » dans les Réglages) -------------
export async function testConnection() {
  if (!isSupabaseConfigured()) return { ok: false, msg: 'Supabase non configuré (clés vides).' }
  let c
  try { c = await getClient() } catch (e) { c = null }
  if (!c) return { ok: false, msg: "Impossible de charger le client Supabase (réseau bloqué ou CDN injoignable)." }
  try {
    const id = '__healthcheck__'
    const up = await c.from('app_state').upsert({ id, data: { ok: true, ts: Date.now() }, updated_at: new Date().toISOString() })
    if (up.error) return { ok: false, msg: 'Écriture refusée : ' + up.error.message + ' (le SQL a-t-il bien été exécuté ?)' }
    const rd = await c.from('app_state').select('id').eq('id', id).maybeSingle()
    if (rd.error) return { ok: false, msg: 'Lecture refusée : ' + rd.error.message }
    return { ok: true, msg: 'Connexion Supabase OK ✓ — la synchronisation temps réel est active.' }
  } catch (e) {
    return { ok: false, msg: 'Erreur : ' + (e && e.message ? e.message : String(e)) }
  }
}

// ----- Demandes de contact (site → app) -----------------------------------
const mapReq = (r) => ({ id: r.id, name: r.name || '', email: r.email || '', message: r.message || '', lang: r.lang || 'fr', createdAt: r.created_at || new Date().toISOString() })

export async function fetchContactRequests() {
  const c = await getClient(); if (!c) return []
  try {
    const { data } = await c.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(500)
    return (data || []).map(mapReq)
  } catch (e) { return [] }
}

export async function subscribeContactRequests(onInsert) {
  const c = await getClient(); if (!c) return () => {}
  const ch = c.channel('contact_rt')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_requests' },
      payload => { if (payload.new) onInsert(mapReq(payload.new)) })
    .subscribe()
  return () => { try { c.removeChannel(ch) } catch (e) {} }
}
