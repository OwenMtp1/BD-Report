// ============================================================
// Origin Roleplay — comptes staff et sessions
// Mots de passe en scrypt (jamais en clair, jamais réversibles),
// session par jeton aléatoire stocké en base : révoquer un accès
// = supprimer une ligne, pas attendre l'expiration d'un jeton.
// ============================================================
'use strict';
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hash(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('hex'), key.toString('hex')].join('$');
}

function verify(password, stored) {
  try {
    const [algo, N, r, p, salt, key] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const want = Buffer.from(key, 'hex');
    const got = crypto.scryptSync(password, Buffer.from(salt, 'hex'), want.length,
      { N: Number(N), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(want, got);   // comparaison à temps constant
  } catch { return false; }
}

const newToken = () => crypto.randomBytes(32).toString('hex');

/* ---------- freinage des tentatives ----------
   Un panneau de logs exposé sur le site du serveur est une cible :
   sans frein, un mot de passe faible tombe en quelques minutes. */
const fails = new Map();
const WINDOW = 15 * 60 * 1000;
function throttle(keyIp) {
  const now = Date.now();
  const e = fails.get(keyIp);
  if (!e || now - e.first > WINDOW) return 0;
  if (e.n < 5) return 0;
  return Math.min(60, Math.pow(2, e.n - 5)) * 1000;   // 1 s, 2 s, 4 s… plafonné à 60 s
}
function noteFail(keyIp) {
  const now = Date.now();
  const e = fails.get(keyIp);
  if (!e || now - e.first > WINDOW) fails.set(keyIp, { first: now, n: 1 });
  else e.n++;
}
const clearFails = keyIp => fails.delete(keyIp);

/* ---------- cookies ---------- */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookieHeader(name, value, { maxAge = 0, secure = false, clear = false } = {}) {
  const bits = [`${name}=${clear ? '' : encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) bits.push('Secure');
  bits.push(`Max-Age=${clear ? 0 : maxAge}`);
  return bits.join('; ');
}

module.exports = { hash, verify, newToken, throttle, noteFail, clearFails, parseCookies, cookieHeader };
