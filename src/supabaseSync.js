// ---------------------------------------------------------------------------
//  Couche de synchronisation Supabase (optionnelle).
//  Tout est inerte tant que supabaseConfig n'est pas renseigné : aucune
//  dépendance n'est chargée et aucun appel réseau n'est fait.
//  Le client @supabase/supabase-js est importé dynamiquement depuis un CDN
//  (esm.sh) pour ne pas alourdir le bundle/déploiement mono-fichier.
// ---------------------------------------------------------------------------
import { isSupabaseConfigured } from './supabaseConfig.js'
import { getClient } from './supabaseClient.js'
import { encryptBlob, decryptBlob, decryptString } from './blobCrypto.js'
import { stripDangerousKeys } from './security.js'

const STATE_ID = 'main'

// ⚠️ UNE SEULE INSTANCE DE CLIENT dans toute l'application (`supabaseClient.js`).
// Ce module en fabriquait une seconde, sans les options d'authentification : deux
// connexions temps réel ouvertes en parallèle sur la même table (donc chaque changement
// traité deux fois), et une session Google posée sur une instance dont les requêtes de
// données ne se servaient pas. Le commentaire promettait déjà le partage — il est tenu.
export const getSupabaseClient = getClient

// ----- État applicatif partagé (toute l'app) ------------------------------
/**
 * État distant. TROIS réponses possibles, et il faut savoir les distinguer :
 *  · `null`          — il n'y a rien là-bas (première utilisation, ou hors ligne).
 *  · `{_unreadable}` — une ligne EXISTE mais reste illisible (clé changée, blob corrompu).
 *  · l'état          — lisible.
 * ⚠️ On renvoyait `null` dans les trois cas. L'appelant en concluait « la base commune est
 * vide » et poussait la base locale par-dessus : un blob simplement indéchiffrable était
 * donc REMPLACÉ, et avec lui le travail de tous les autres postes. Un état qu'on ne sait
 * pas lire n'est pas un état absent.
 */
export async function fetchRemoteState() {
  const c = await getClient(); if (!c) return null
  try {
    const { data, error } = await c.from('app_state').select('data').eq('id', STATE_ID).maybeSingle()
    if (error || !data) return null
    if (data.data == null) return null
    // déchiffre (rétro-compatible clair) + neutralise __proto__/constructor d'un blob distant malveillant
    const clear = stripDangerousKeys(await decryptBlob(data.data))
    if (!clear || typeof clear !== 'object') return { _unreadable: true }
    return clear
  } catch (e) { return null }
}

export async function pushRemoteState(db) {
  const c = await getClient(); if (!c) return
  try {
    const data = await encryptBlob(db)    // chiffré au repos dans Supabase
    await c.from('app_state').upsert({ id: STATE_ID, data, updated_at: new Date().toISOString() })
  } catch (e) { /* offline */ }
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
      async payload => {
        if (!payload.new || !payload.new.data) return
        const db = stripDangerousKeys(await decryptBlob(payload.new.data))
        if (db) onChange(db)
      })
    .subscribe()
  return () => { try { c.removeChannel(ch) } catch (e) {} }
}

// ----- Offres publiques (app → site) --------------------------------------
// Les offres sont des informations MARKETING (non secrètes) : on les publie EN CLAIR dans
// une ligne dédiée `app_state.id='offers'` pour que le site vitrine les affiche toujours à
// jour, quel que soit l'appareil. Le site les lit via la même clé anon.
const OFFERS_ID = 'offers'
let offersTimer = null
export function publishOffersDebounced(offers, delay = 900) {
  if (!isSupabaseConfigured()) return
  clearTimeout(offersTimer)
  offersTimer = setTimeout(async () => {
    const c = await getClient(); if (!c) return
    try { await c.from('app_state').upsert({ id: OFFERS_ID, data: { offers }, updated_at: new Date().toISOString() }) } catch (e) { /* offline */ }
  }, delay)
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
    // Un test ne laisse pas de trace : la ligne de contrôle repart. Elle restait sinon
    // à demeure dans la table, à côté de l'état réel, sans que personne ne sache ce que c'est.
    try { await c.from('app_state').delete().eq('id', id) } catch (e) { /* sans conséquence */ }
    return { ok: true, msg: 'Connexion Supabase OK ✓ — la synchronisation temps réel est active.' }
  } catch (e) {
    return { ok: false, msg: 'Erreur : ' + (e && e.message ? e.message : String(e)) }
  }
}

// ----- Demandes de contact (site → app) -----------------------------------
// Les champs sensibles (nom/email/message) peuvent être chiffrés par le site
// (préfixe "enc:") — on les déchiffre à la lecture (rétro-compatible avec le clair).
const mapReq = async (r) => ({
  id: r.id,
  name: await decryptString(r.name || ''),
  email: await decryptString(r.email || ''),
  message: await decryptString(r.message || ''),
  lang: r.lang || 'fr',
  createdAt: r.created_at || new Date().toISOString(),
})

export async function fetchContactRequests() {
  const c = await getClient(); if (!c) return []
  try {
    const { data } = await c.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(500)
    return await Promise.all((data || []).map(mapReq))
  } catch (e) { return [] }
}

export async function subscribeContactRequests(onInsert) {
  const c = await getClient(); if (!c) return () => {}
  const ch = c.channel('contact_rt')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_requests' },
      async payload => { if (payload.new) onInsert(await mapReq(payload.new)) })
    .subscribe()
  return () => { try { c.removeChannel(ch) } catch (e) {} }
}
