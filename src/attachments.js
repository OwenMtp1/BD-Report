// ---------------------------------------------------------------------------
//  Pièces jointes des conversations
//
//  Elles vivaient en base64 À L'INTÉRIEUR de l'état applicatif. L'encodage gonfle
//  le poids d'un tiers : un fichier de 4 Mo en occupait ~5,3, soit déjà plus que le
//  quota localStorage d'un navigateur (5 Mo) — et l'état entier est sérialisé d'un
//  bloc à chaque enregistrement. Résultat : à la première ou deuxième pièce jointe,
//  plus rien ne s'enregistrait. L'utilisateur voyait « stockage plein », continuait
//  de travailler, et perdait tout au rechargement.
//
//  Désormais le fichier part vers Supabase Storage et l'état ne garde qu'une URL.
//  Sans Supabase (usage 100 % local), on retombe sur l'insertion directe mais avec
//  un plafond strict : mieux vaut refuser un fichier que casser la sauvegarde.
// ---------------------------------------------------------------------------
import { getSupabaseClient } from './supabaseSync.js'
import { isSupabaseConfigured } from './supabaseConfig.js'

export const BUCKET = 'attachments'
// Plafond d'envoi vers le stockage distant.
export const MAX_UPLOAD = 20 * 1024 * 1024 // 20 Mo
// Plafond quand tout reste dans le navigateur : au-delà, la sauvegarde de l'espace
// devient le vrai risque. 400 Ko de source ≈ 540 Ko une fois encodés.
export const MAX_INLINE = 400 * 1024

export const humanSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko')

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(new Error('lecture impossible'))
  r.readAsDataURL(file)
})

// Réduit une image avant tout stockage : une photo de téléphone pèse plusieurs Mo
// pour un rendu qui n'en demande pas le dixième.
export function shrinkImage(file, maxSide = 1400, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          (blob) => resolve(blob && blob.size < file.size ? blob : file),
          'image/jpeg', quality,
        )
      }
      img.onerror = () => resolve(file) // format exotique : on garde l'original
      img.src = reader.result
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

const safeName = (name) => String(name || 'fichier').replace(/[^\w.-]+/g, '_').slice(-80)

// Envoie une pièce jointe et renvoie de quoi l'afficher :
//   { url, name, type, size, inline }   — `inline` = restée dans l'état, faute de stockage.
// Renvoie { error } si le fichier ne peut pas être accepté, avec un message affichable.
export async function uploadAttachment(file, { envId = 'local' } = {}) {
  if (!file) return { error: 'Aucun fichier.' }
  const isImage = (file.type || '').startsWith('image/')
  const payload = isImage ? await shrinkImage(file) : file

  if (payload.size > MAX_UPLOAD) {
    return { error: `Fichier trop volumineux (${humanSize(payload.size)}, maximum ${humanSize(MAX_UPLOAD)}).` }
  }

  if (isSupabaseConfigured()) {
    const client = await getSupabaseClient()
    if (client) {
      const path = `${envId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`
      try {
        const { error } = await client.storage.from(BUCKET).upload(path, payload, {
          contentType: file.type || 'application/octet-stream', upsert: false,
        })
        if (!error) {
          const { data } = client.storage.from(BUCKET).getPublicUrl(path)
          if (data?.publicUrl) {
            return { url: data.publicUrl, path, name: file.name, type: file.type || '', size: payload.size, inline: false }
          }
        }
      } catch (e) { /* stockage indisponible : on bascule sur le repli ci-dessous */ }
    }
  }

  // Repli : le fichier reste dans l'état. Strictement plafonné — dépasser ce seuil
  // casserait l'enregistrement de tout l'espace, ce qui coûte bien plus qu'un refus.
  if (payload.size > MAX_INLINE) {
    return {
      error: isSupabaseConfigured()
        ? `Envoi indisponible pour le moment. Sans stockage distant, la limite est de ${humanSize(MAX_INLINE)}.`
        : `Fichier trop volumineux (${humanSize(payload.size)}). Sans stockage cloud configuré, la limite est de ${humanSize(MAX_INLINE)}.`,
    }
  }
  try {
    const dataUrl = await readAsDataUrl(payload)
    return { url: dataUrl, name: file.name, type: file.type || '', size: payload.size, inline: true }
  } catch (e) {
    return { error: 'Lecture du fichier impossible.' }
  }
}

// Supprime la pièce jointe distante d'un message effacé. Sans chemin (pièce jointe
// restée dans l'état, ou message d'avant cette version), il n'y a rien à faire.
export async function removeAttachment(path) {
  if (!path || !isSupabaseConfigured()) return
  const client = await getSupabaseClient()
  if (!client) return
  try { await client.storage.from(BUCKET).remove([path]) } catch (e) { /* best effort */ }
}

// Une pièce jointe s'affiche par son `url`. Les messages d'avant cette version
// portaient une dataURL dans `image` ou `file.dataUrl` : on les lit encore.
export const attachmentUrl = (att) => att?.url || att?.dataUrl || ''
