// ============================================================
// Origin Roleplay — liaison Discord
// Identité par OAuth2, appartenance et RÔLES lus côté serveur avec
// le jeton du bot. Le navigateur ne voit jamais ni le secret, ni le
// jeton, ni la liste brute des rôles : il reçoit des droits déjà
// résolus.
// ============================================================
'use strict';
const crypto = require('node:crypto');
const CAT = require('./catalogue.js');

// Base surchargeable : sert aux tests hors ligne, et à rien d'autre.
const SITE = process.env.DISCORD_SITE || 'https://discord.com';
const API = process.env.DISCORD_API_BASE || (SITE + '/api/v10');

/* ---------- configuration ----------
   Les SECRETS restent dans .env (ils ne doivent jamais repartir vers
   le panneau). Les IDENTIFIANTS — serveur, rôles — vivent en base et
   se règlent depuis l'écran « Liaison Discord », comme demandé. */
function config(get) {
  return {
    clientId:     get('discord.clientId') || process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    botToken:     process.env.DISCORD_BOT_TOKEN || '',
    guildId:      get('discord.guildId') || process.env.DISCORD_GUILD_ID || '',
    staffRoleId:  get('discord.staffRoleId') || '',
    redirectUri:  get('discord.redirectUri') || process.env.DISCORD_REDIRECT_URI || '',
    roleMap:      CAT.ROLE_IDS.reduce((m, id) => {
                    const v = get('discord.role.' + id);
                    if (v) m[id] = v;
                    return m;
                  }, {})
  };
}
// « Prêt » veut dire : on peut réellement authentifier quelqu'un.
// Un rôle staff non renseigné laisserait entrer tout le serveur.
const isReady = c => !!(c.clientId && c.clientSecret && c.botToken && c.guildId && c.staffRoleId);

/* ---------- état anti-CSRF ----------
   Signé avec le secret du client : pas de table à nettoyer, et un état
   forgé ailleurs ne passe pas. */
function makeState(secret) {
  const brut = crypto.randomBytes(16).toString('hex') + '.' + Date.now();
  const sig = crypto.createHmac('sha256', secret).update(brut).digest('hex').slice(0, 32);
  return brut + '.' + sig;
}
function checkState(state, secret) {
  const p = String(state || '').split('.');
  if (p.length !== 3) return false;
  const attendu = crypto.createHmac('sha256', secret).update(p[0] + '.' + p[1]).digest('hex').slice(0, 32);
  if (!crypto.timingSafeEqual(Buffer.from(attendu), Buffer.from(p[2].padEnd(32).slice(0, 32)))) return false;
  return Date.now() - Number(p[1]) < 10 * 60 * 1000;      // dix minutes
}

const authorizeUrl = (c, state) => SITE +
  '/oauth2/authorize?' + new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirectUri,
    response_type: 'code', scope: 'identify', state, prompt: 'none'
  });

/* ---------- appels ---------- */
async function call(url, opts, essai = 0) {
  const r = await fetch(url, opts);
  if (r.status === 429 && essai < 2) {
    const j = await r.json().catch(() => ({}));
    await new Promise(res => setTimeout(res, Math.min(5000, (j.retry_after || 1) * 1000)));
    return call(url, opts, essai + 1);
  }
  return r;
}
const bot = (c, chemin) => call(API + chemin, { headers: { authorization: 'Bot ' + c.botToken } });

async function exchangeCode(c, code) {
  const r = await call(API + '/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId, client_secret: c.clientSecret,
      grant_type: 'authorization_code', code, redirect_uri: c.redirectUri
    })
  });
  if (!r.ok) throw new Error('Discord a refusé le code d’autorisation (' + r.status + ').');
  return r.json();
}
async function meFromToken(jeton) {
  const r = await call(API + '/users/@me', { headers: { authorization: 'Bearer ' + jeton } });
  if (!r.ok) throw new Error('Impossible de lire votre profil Discord (' + r.status + ').');
  return r.json();
}

/* ---------- appartenance et rôles ----------
   Lu avec le jeton du BOT, pas avec celui de l'utilisateur : personne
   ne peut se déclarer membre ni s'inventer un rôle. */
async function member(c, userId) {
  const r = await bot(c, `/guilds/${c.guildId}/members/${userId}`);
  if (r.status === 404) return null;                       // pas sur le serveur
  if (!r.ok) throw new Error('Discord n’a pas répondu pour ce membre (' + r.status + ').');
  return r.json();
}
async function guildRoles(c) {
  const r = await bot(c, `/guilds/${c.guildId}/roles`);
  if (!r.ok) throw new Error('Impossible de lire les rôles du serveur (' + r.status + ').');
  const l = await r.json();
  return l.map(x => ({ id: x.id, name: x.name, color: x.color, position: x.position }))
          .sort((a, b) => b.position - a.position);
}

/* ---------- traduction rôles Discord -> rôles du panneau ----------
   Un membre cumule souvent plusieurs rôles : on rend TOUS ceux qui
   correspondent, et le panneau en fait l'union. */
function mapRoles(discordRoleIds, roleMap) {
  const porte = new Set(discordRoleIds || []);
  return CAT.ROLE_IDS.filter(id => roleMap[id] && porte.has(roleMap[id]));
}

/* Le verdict complet pour une personne : dans le serveur ? staff ?
   quels rôles ? Une seule fonction, pour qu'il n'existe qu'un endroit
   où l'on décide d'ouvrir la porte. */
async function verdict(c, userId) {
  const m = await member(c, userId);
  if (!m) return { ok: false, raison: 'absent', message: 'Vous n’êtes pas sur le serveur Discord d’Origin Roleplay.' };
  const rolesDiscord = m.roles || [];
  if (!rolesDiscord.includes(c.staffRoleId))
    return { ok: false, raison: 'pas_staff', message: 'Votre compte Discord n’a pas le rôle staff requis.' };
  const roles = mapRoles(rolesDiscord, c.roleMap);
  if (!roles.length)
    return { ok: false, raison: 'aucun_role', membre: m, rolesDiscord,
             message: 'Vous avez le rôle staff, mais aucun rôle du panneau ne vous est encore attribué. Prévenez un fondateur.' };
  return { ok: true, membre: m, rolesDiscord, roles };
}

module.exports = { API, config, isReady, makeState, checkState, authorizeUrl,
                   exchangeCode, meFromToken, member, guildRoles, mapRoles, verdict };
