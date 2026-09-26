'use strict';
// ============================================================
// Origin Logs — TOTP (double authentification) zéro dépendance
// ------------------------------------------------------------
// RFC 6238 (TOTP) au-dessus de RFC 4226 (HOTP), HMAC-SHA1, pas de dépendance.
// Le but : un SECOND facteur pour les comptes à MOT DE PASSE local (les
// comptes Discord ont déjà l'OAuth du serveur). Facultatif, activé par le
// titulaire lui-même après avoir prouvé qu'il lit bien les codes.
// ============================================================
const crypto = require('node:crypto');

// --- base32 (RFC 4648, sans rembourrage) : c'est ce que lisent les apps ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const c of clean) {
    const idx = B32.indexOf(c); if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

// Un secret de 20 octets (160 bits) : la taille recommandée pour SHA-1.
function genSecret() { return base32Encode(crypto.randomBytes(20)); }

// Le code à 6 chiffres pour un pas de temps donné (HOTP).
function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  // Compteur sur 64 bits big-endian (writeBigUInt64BE dispo en Node 12+).
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}

// ⚠️ Tolérance d'UN pas de 30 s de part et d'autre : les horloges du
// téléphone et du serveur ne sont jamais parfaitement synchrones.
// Comparaison à temps constant, pour ne rien laisser fuir par la durée.
function verify(secretB32, code, { step = 30, window = 1, t = Date.now() } = {}) {
  const propose = String(code || '').replace(/\D/g, '');
  if (propose.length !== 6) return false;
  const secret = base32Decode(secretB32);
  if (!secret.length) return false;
  const counter = Math.floor(t / 1000 / step);
  for (let e = -window; e <= window; e++) {
    const attendu = hotp(secret, counter + e);
    const a = Buffer.from(attendu), b = Buffer.from(propose);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

// L'URI otpauth:// que lisent Google Authenticator, Aegis, 1Password…
// (encodée dans un QR côté client, ou saisie à la main).
function otpauthUrl(secretB32, { compte = 'staff', emetteur = 'Origin Logs' } = {}) {
  const label = encodeURIComponent(emetteur + ':' + compte);
  const q = new URLSearchParams({ secret: secretB32, issuer: emetteur, algorithm: 'SHA1', digits: '6', period: '30' });
  return 'otpauth://totp/' + label + '?' + q.toString();
}

// Le code courant pour un secret (surtout utile aux tests ; côté serveur on
// ne fait que VÉRIFIER, jamais générer pour quelqu'un).
function code(secretB32, { step = 30, t = Date.now() } = {}) {
  return hotp(base32Decode(secretB32), Math.floor(t / 1000 / step));
}

module.exports = { genSecret, verify, code, otpauthUrl, base32Encode, base32Decode };
