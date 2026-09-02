// ---------------------------------------------------------------------------
//  Helpers de sécurité applicative.
// ---------------------------------------------------------------------------

// Neutralise les URLs dangereuses (javascript:, data:, vbscript:…) avant de les
// mettre dans un href. N'autorise que http/https/mailto/tel ; un domaine nu
// (« linkedin.com/in/x ») est préfixé en https. Renvoie null si non sûr.
export function safeUrl(url) {
  if (!url) return null
  const s = String(url).trim()
  if (!s) return null
  // schéma explicite → uniquement une liste blanche
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    return /^(https?:|mailto:|tel:)/i.test(s) ? s : null
  }
  // pas de schéma : domaine nu → https, sinon on refuse
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(s)) return 'https://' + s
  return null
}

// Supprime récursivement les clés dangereuses (__proto__/constructor/prototype)
// de tout objet issu d'une source externe (blob Supabase, sauvegarde importée)
// avant qu'il ne soit fusionné dans l'état — évite la pollution de prototype.
export function stripDangerousKeys(value) {
  if (Array.isArray(value)) return value.map(stripDangerousKeys)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
      out[k] = stripDangerousKeys(value[k])
    }
    return out
  }
  return value
}
