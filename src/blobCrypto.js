// ---------------------------------------------------------------------------
//  Chiffrement du blob synchronisé (AES-256-GCM, Web Crypto).
//
//  But : la table Supabase `app_state` ne contient plus l'état en clair mais du
//  texte chiffré. Même si la clé anon (publique) permet de lire la ligne via
//  l'API REST, on n'obtient que du charabia → neutralise l'attaque la plus
//  courante (un bot qui scanne GitHub, trouve la clé et vide la table).
//
//  ⚠️ Limite honnête : l'app reste 100 % front, donc la clé de déchiffrement est
//  nécessairement livrée au navigateur. Un attaquant *ciblé* qui lit le bundle
//  déployé peut la retrouver. Ce chiffrement bloque le pillage automatique/opportuniste,
//  pas un adversaire déterminé — le correctif complet reste la RLS par organisation
//  (voir supabase/MIGRATION_MULTITENANT.md).
// ---------------------------------------------------------------------------

import { deob } from './obf.js'
// Clé applicative (256 bits), obscurcie (non lisible en clair dans le repo).
const KEY_HEX = deob('AAZDVENaEUFPDVMFFAYHA1QeT1RTUUdVFF9HQUkKA1JOVwMDARtOBlQAQFJJC0MRG19bAkkLBFMOFEAAUQUTVw==')

const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) || null

let keyPromise = null
function getKey() {
  if (!subtle) return Promise.resolve(null)
  if (!keyPromise) {
    const bytes = new Uint8Array(KEY_HEX.match(/.{2}/g).map((h) => parseInt(h, 16)))
    keyPromise = subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }
  return keyPromise
}

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

// True si la donnée lue depuis Supabase est un blob chiffré.
export const isEncrypted = (d) => !!d && typeof d === 'object' && typeof d._enc === 'string'

// Chiffre un objet JS → { _enc: "base64(iv|ciphertext)" } stockable en JSONB.
// Repli (navigateur sans Web Crypto) : renvoie l'objet tel quel pour ne pas casser l'app.
export async function encryptBlob(obj) {
  const key = await getKey()
  if (!key) return obj
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(obj))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const packed = new Uint8Array(iv.length + ct.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ct), iv.length)
  return { _enc: toB64(packed.buffer) }
}

// --- Chiffrement au niveau d'une CHAÎNE (ex. champs des demandes de contact) ---
// Format : "enc:" + base64(iv|ciphertext). Rétro-compatible : une valeur sans
// le préfixe "enc:" est renvoyée telle quelle (ancien texte en clair).
const ENC_PREFIX = 'enc:'

export async function encryptString(str) {
  const key = await getKey()
  if (!key || str == null) return str
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(str)))
  const packed = new Uint8Array(iv.length + ct.byteLength)
  packed.set(iv, 0); packed.set(new Uint8Array(ct), iv.length)
  return ENC_PREFIX + toB64(packed.buffer)
}

export async function decryptString(val) {
  if (typeof val !== 'string' || !val.startsWith(ENC_PREFIX)) return val
  const key = await getKey()
  if (!key) return val
  try {
    const packed = fromB64(val.slice(ENC_PREFIX.length))
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: packed.slice(0, 12) }, key, packed.slice(12))
    return new TextDecoder().decode(pt)
  } catch (e) {
    return val
  }
}

// Déchiffre une valeur lue depuis Supabase. Rétro-compatible :
// si ce n'est pas un blob chiffré (ancien état en clair), renvoie tel quel.
export async function decryptBlob(stored) {
  if (!isEncrypted(stored)) return stored
  const key = await getKey()
  if (!key) return null
  try {
    const packed = fromB64(stored._enc)
    const iv = packed.slice(0, 12)
    const ct = packed.slice(12)
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return JSON.parse(new TextDecoder().decode(pt))
  } catch (e) {
    console.warn('[blobCrypto] déchiffrement impossible', e)
    return null
  }
}
