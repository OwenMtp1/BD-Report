#!/usr/bin/env node
// ============================================================
// Origin Roleplay — API du panneau de logs
// Node 22+, aucune dépendance. Sert aussi le panneau lui-même,
// pour qu'un seul processus suffise derrière votre reverse proxy.
//   SERVER_KEY=... node server.js
// ============================================================
'use strict';
const http = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const url = require('node:url');

const DB = require('./db.js');
const AUTH = require('./auth.js');
const CAT = require('./catalogue.js');
const DISCORD = require('./discord.js');
const ROLESVC = require('./roles.js');

/* ---------- configuration ---------- */
// setup.js écrit un .env ; sans cette lecture, `npm start` réclamerait
// encore la clé à la main et le fichier ne servirait à rien.
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);
} catch (e) { console.error('[.env] ignoré :', e.message); }

const CFG = {
  port:       Number(process.env.PORT || 8080),
  host:       process.env.HOST || '0.0.0.0',
  dbFile:     process.env.DB_FILE || path.join(__dirname, 'data', 'origin-logs.db'),
  serverKey:  process.env.SERVER_KEY || '',
  retention:  Number(process.env.RETENTION_DAYS || 30),
  secure:     process.env.SECURE_COOKIE === '1',
  sessionDays:Number(process.env.SESSION_DAYS || 7),
  panelDir:   path.resolve(__dirname, process.env.PANEL_DIR || '..'),
  maxBody:    2 * 1024 * 1024
};
if (!CFG.serverKey) {
  console.error('\n  SERVER_KEY est vide : la ressource FiveM ne pourrait pas déposer de logs.');
  console.error('  Générez-en une puis relancez :  SERVER_KEY=$(openssl rand -hex 24) node server.js\n');
  process.exit(1);
}

const db = DB.open(CFG.dbFile);
const now = () => Date.now();

/* ---------- amorçage ----------
   Une base qui tournait avant le multi-espaces contient déjà des
   journaux : ils appartiennent au premier espace, qui reprend la clé
   d'ingestion en service. Rien à migrer à la main, rien à reconfigurer
   côté serveur de jeu. */
function bootstrapSpace() {
  const n = DB.row(db.prepare('SELECT COUNT(*) n FROM spaces').get()).n;
  if (!n) {
    db.prepare(`INSERT INTO spaces(id,name,server_key,state,created_at,created_by)
                VALUES(1,?,?, 'actif', ?, 'installation')`)
      .run(process.env.SPACE_NAME || 'Origin Roleplay', CFG.serverKey, now());
    for (const t of ['events', 'players', 'sanctions', 'actions', 'staff', 'audit'])
      db.prepare(`UPDATE ${t} SET space_id = 1 WHERE space_id IS NULL OR space_id = 0`).run();
    console.log('  Espace « ' + (process.env.SPACE_NAME || 'Origin Roleplay') + ' » créé avec la clé en service.');
  }
  // Tant qu'il n'y a qu'UN espace, c'est .env qui commande sa clé :
  // staff.js et le serveur pouvaient sinon créer le premier espace
  // chacun de leur côté, avec deux clés différentes — et l'ingestion
  // tombait en 401 sans que rien ne l'explique.
  const tous = db.prepare('SELECT id, name, server_key FROM spaces ORDER BY id').all();
  if (tous.length === 1 && CFG.serverKey && tous[0].server_key !== CFG.serverKey) {
    db.prepare('UPDATE spaces SET server_key = ? WHERE id = ?').run(CFG.serverKey, tous[0].id);
    console.log('  Clé d’ingestion de « ' + tous[0].name + ' » alignée sur SERVER_KEY.');
  }
  // Le premier fondateur devient propriétaire de son espace : sans
  // propriétaire, personne ne peut nommer de second fondateur.
  for (const sp of tous) {
    ROLESVC.seed(db, sp.id);
    const cur = DB.row(db.prepare('SELECT owner_id FROM spaces WHERE id = ?').get(sp.id));
    if (cur && !cur.owner_id) {
      const f = DB.row(db.prepare(`SELECT id FROM staff WHERE space_id = ? AND disabled = 0
        AND (role = 'fondateur' OR roles LIKE '%"fondateur"%') ORDER BY id LIMIT 1`).get(sp.id));
      if (f) db.prepare('UPDATE spaces SET owner_id = ? WHERE id = ?').run(f.id, sp.id);
    }
  }
}

/* ---------- réglages ----------
   Modifiables depuis le panneau par un fondateur : le rôle staff et
   les rôles du panneau n'ont pas à passer par un redéploiement. */
const qGet = db.prepare('SELECT v FROM settings WHERE k = ?');
const qSet = db.prepare(`INSERT INTO settings(k,v,updated_at,by_name) VALUES(?,?,?,?)
                         ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at, by_name=excluded.by_name`);
const getSetting = k => { const r = DB.row(qGet.get(k)); return r ? r.v : ''; };
const setSetting = (k, v, par) => qSet.run(k, v == null ? '' : String(v), Date.now(), par || null);
const dconf = () => DISCORD.config(getSetting);
/* Une seule application Discord peut servir PLUSIEURS serveurs : les
   secrets sont globaux, le serveur et les rôles appartiennent à l'espace. */
function dconfFor(esp) {
  const c = dconf();
  c.guildId = (esp && esp.guild_id) || '';
  c.staffRoleId = (esp && esp.staff_role_id) || '';
  c.roleMap = {};
  if (esp) for (const r of ROLESVC.list(db, esp.id)) if (r.discordRoleId) c.roleMap[r.key] = r.discordRoleId;
  return c;
}
const spacesDiscord = () => db.prepare(`SELECT * FROM spaces WHERE state='actif'
  AND guild_id IS NOT NULL AND guild_id <> '' AND staff_role_id IS NOT NULL AND staff_role_id <> ''`)
  .all().map(DB.row);
const discordGlobalOk = () => { const c = dconf(); return !!(c.clientId && c.clientSecret && c.botToken); };
const discordPret = () => discordGlobalOk() && spacesDiscord().length > 0;

function originOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0] || (CFG.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || ('localhost:' + CFG.port);
  return proto + '://' + host;
}
const redirectUriOf = (c, req) => c.redirectUri || (originOf(req) + '/api/auth/discord/callback');

/* ---------- réponses ---------- */
const JSONH = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
function send(res, code, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({}, JSONH, extra || {}));
  res.end(body);
}
const ok   = (res, o) => send(res, 200, o);
const fail = (res, code, msg) => send(res, code, { error: msg });

function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  return (f ? String(f).split(',')[0] : req.socket.remoteAddress || '').trim();
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > CFG.maxBody) { reject(new Error('corps trop volumineux')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

/* ---------- session staff ---------- */
const qSession = db.prepare(`SELECT s.token, s.expires_at, s.space_id AS visite,
                                    t.id, t.pseudo, t.role, t.roles, t.manual_roles, t.disabled,
                                    t.source, t.discord_id, t.roles_checked_at, t.avatar,
                                    t.space_id, t.platform_admin
                             FROM sessions s JOIN staff t ON t.id = s.staff_id WHERE s.token = ?`);
const qDropSession = db.prepare('DELETE FROM sessions WHERE token = ?');

function whoami(req) {
  const tok = AUTH.parseCookies(req)['origin_sid'];
  if (!tok) return null;
  const r = DB.row(qSession.get(tok));
  if (!r) return null;
  if (r.expires_at < now() || r.disabled) { qDropSession.run(tok); return null; }
  // Une personne cumule plusieurs rôles Discord : les droits sont
  // l'UNION, le rang le plus haut, et le libellé celui du rôle principal.
  // Des rôles posés À LA MAIN par un fondateur l'emportent sur Discord :
  // c'est une décision, elle ne doit pas être défaite à la synchro.
  const manuels = parseRoles(r.manual_roles);
  let roles = manuels.length ? manuels : parseRoles(r.roles);
  if (!roles.length) roles = [CAT.canon(r.role)];

  const platform = !!r.platform_admin;
  // Un administrateur de plateforme peut visiter un autre espace ; sa
  // visite ne change pas l'espace de son compte.
  const spaceId = Number(r.visite || r.space_id || 1);
  const esp = DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId));
  if (r.source === 'discord' && !manuels.length) refreshRolesSoon(r);

  const res = ROLESVC.resolve(db, spaceId, roles);
  // Le PROPRIÉTAIRE de l'espace peut attribuer jusqu'à son propre rang :
  // sans cela, un fondateur ne pourrait jamais en nommer un second, et
  // l'espace resterait suspendu à une seule personne.
  const proprio = !!(esp && Number(esp.owner_id) === Number(r.id));
  const perms = platform ? CAT.PERM_IDS.slice() : res.perms;
  const cats  = platform ? CAT.CATS.map(c => c.id) : res.cats;
  return { id: r.id, pseudo: r.pseudo, token: tok, avatar: r.avatar,
           roles: res.keys.length ? res.keys : roles,
           roleLabels: res.labels, role: res.main ? res.main.key : roles[0],
           roleLabel: res.main ? res.main.label : (CAT.ROLES[roles[0]] || {}).label || roles[0],
           rank: platform ? 1000 : res.rank,
           manual: manuels.length > 0, platform, owner: proprio,
           plafond: platform ? 10000 : (res.rank + (proprio ? 1 : 0)),
           spaceId, space: esp, visiting: !!r.visite && Number(r.visite) !== Number(r.space_id),
           homeSpaceId: Number(r.space_id || 1),
           source: r.source, discordId: r.discord_id, perms, cats };
}
function parseRoles(j) {
  try { const v = JSON.parse(j || '[]'); return Array.isArray(v) ? v.map(CAT.canon) : []; }
  catch (e) { return []; }
}

/* ---------- révocation ----------
   Quelqu'un rétrogradé sur Discord garderait sinon ses droits jusqu'à
   l'expiration de sa session. On revérifie au plus toutes les quinze
   minutes, en tâche de fond : la requête en cours n'attend pas Discord. */
const REVERIF_MS = 15 * 60 * 1000;
const enVol = new Set();
function refreshRolesSoon(r) {
  if (enVol.has(r.id)) return;
  if (r.roles_checked_at && now() - r.roles_checked_at < REVERIF_MS) return;
  const esp = DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(r.space_id || 1));
  const c = dconfFor(esp);
  if (!discordGlobalOk() || !c.guildId || !c.staffRoleId || !r.discord_id) return;
  enVol.add(r.id);
  db.prepare('UPDATE staff SET roles_checked_at = ? WHERE id = ?').run(now(), r.id);
  verdictEspace(c, esp, r.discord_id).then(v => {
    if (!v.ok) {
      db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(r.id);
      db.prepare('UPDATE staff SET disabled = 1 WHERE id = ?').run(r.id);
      audit(null, 'discord.revocation', `${r.pseudo} — ${v.raison}`, null);
      console.log(`[discord] ${r.pseudo} a perdu son accès (${v.raison}) — sessions fermées`);
      return;
    }
    const avant = r.roles || '[]';
    const apres = JSON.stringify(v.roles);
    if (avant !== apres) {
      db.prepare('UPDATE staff SET roles = ?, role = ? WHERE id = ?').run(apres, v.roles[0], r.id);
      audit(null, 'discord.roles', `${r.pseudo} → ${v.roles.join(', ')}`, null);
    }
  }).catch(e => console.error('[discord] revérification impossible :', e.message))
    .finally(() => enVol.delete(r.id));
}
const iAudit = db.prepare('INSERT INTO audit(ts,staff_id,pseudo,action,detail,ip,space_id) VALUES(?,?,?,?,?,?,?)');
const audit = (me, action, detail, ip, spaceId) =>
  iAudit.run(now(), me ? me.id : null, me ? me.pseudo : null, action,
             detail ? String(detail).slice(0, 400) : null, ip || null,
             Number(spaceId || (me && me.spaceId) || 1));

/* Le verdict s'appuie sur les rôles de CET espace : c'est la table
   `roles` qui porte les identifiants Discord, plus un fichier. */
async function verdictEspace(c, esp, userId) {
  const m = await DISCORD.member(c, userId);
  if (!m) return { ok:false, raison:'absent', message:'Vous n’êtes pas sur le serveur Discord de cet espace.' };
  const rolesDiscord = m.roles || [];
  if (!rolesDiscord.includes(c.staffRoleId))
    return { ok:false, raison:'pas_staff', message:'Votre compte Discord n’a pas le rôle staff requis.' };
  const roles = ROLESVC.fromDiscord(db, esp.id, rolesDiscord);
  if (!roles.length)
    return { ok:false, raison:'aucun_role',
             message:'Vous avez le rôle staff, mais aucun rôle du panneau ne vous est encore attribué. Prévenez un fondateur.' };
  return { ok:true, membre:m, rolesDiscord, roles };
}

/* ---------- comptes issus de Discord ----------
   Le pseudo affiché vient de Discord ; en cas de collision avec un
   compte local, on suffixe plutôt que d'écraser le compte de quelqu'un. */
function pseudoLibre(base, discordId) {
  const propre = String(base || 'staff').replace(/\s+/g, ' ').trim().slice(0, 28) || 'staff';
  const pris = p => DB.row(db.prepare('SELECT id FROM staff WHERE pseudo = ? COLLATE NOCASE AND (discord_id IS NULL OR discord_id <> ?)').get(p, discordId));
  // (l'unicité reste globale : deux espaces ne doivent pas se marcher
  //  dessus dans la liste d'une administration de plateforme)
  if (!pris(propre)) return propre;
  return propre + '#' + String(discordId).slice(-4);
}
function upsertDiscordStaff(user, v, spaceId) {
  const nom = user.global_name || user.username;
  const roles = JSON.stringify(v.roles);
  const principal = v.roles[0];
  const existant = DB.row(db.prepare('SELECT * FROM staff WHERE discord_id = ? AND space_id = ?').get(user.id, spaceId));
  if (existant) {
    db.prepare(`UPDATE staff SET pseudo=?, avatar=?, roles=?, role=?, disabled=0,
                                 roles_checked_at=?, last_login=?, discord=? WHERE id=?`)
      .run(pseudoLibre(nom, user.id), S(user.avatar), roles, principal, now(), now(),
           'discord:' + user.id, existant.id);
    return DB.row(db.prepare('SELECT * FROM staff WHERE id = ?').get(existant.id));
  }
  // Le mot de passe est volontairement inutilisable : ce compte
  // n'entre que par Discord, et AUTH.verify refuse cette valeur.
  const r = db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,discord,discord_id,avatar,source,created_at,roles_checked_at,last_login,space_id)
                        VALUES(?,?,?,?,?,?,?, 'discord', ?,?,?,?)`)
    .run(pseudoLibre(nom, user.id), 'discord', principal, roles,
         'discord:' + user.id, user.id, S(user.avatar), now(), now(), now(), spaceId);
  return DB.row(db.prepare('SELECT * FROM staff WHERE id = ?').get(DB.num(r.lastInsertRowid)));
}
function ouvrirSession(res, compte, req) {
  const token = AUTH.newToken(), exp = now() + CFG.sessionDays * 86400000;
  db.prepare('INSERT INTO sessions(token,staff_id,created_at,expires_at,ua,space_id) VALUES(?,?,?,?,?,?)')
    .run(token, compte.id, now(), exp, String(req.headers['user-agent'] || '').slice(0, 200), compte.space_id || 1);
  return AUTH.cookieHeader('origin_sid', token, { maxAge: CFG.sessionDays * 86400, secure: CFG.secure });
}

/* ---------- flux temps réel (SSE) ---------- */
const streams = new Set();
function broadcast(ev, spaceId) {
  if (!streams.size) return;
  const payload = JSON.stringify(ev);
  for (const c of streams) {
    if (Number(c.space) !== Number(spaceId)) continue;   // jamais d'un espace à l'autre
    if (!c.cats.includes(ev.cat)) continue;      // un modérateur ne reçoit pas les logs admin
    try { c.res.write(`event: log\ndata: ${payload}\n\n`); } catch { streams.delete(c); }
  }
}
setInterval(() => {
  for (const c of streams) { try { c.res.write(': ping\n\n'); } catch { streams.delete(c); } }
}, 25000).unref();

/* ---------- ingestion ---------- */
const iEvent = db.prepare(`INSERT INTO events
  (ts,cat,sev,server,actor_key,actor_name,actor_sid,actor_staff,target_key,target_name,msg,data,res,search,space_id)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const uPlayer = db.prepare(`INSERT INTO players(key,name,sid,discord,steam,fivem,job,grade,first_seen,last_seen,events,space_id)
  VALUES(?,?,?,?,?,?,?,?,?,?,1,?)
  ON CONFLICT(space_id, key) DO UPDATE SET
    name=COALESCE(excluded.name,players.name), sid=COALESCE(excluded.sid,players.sid),
    discord=COALESCE(excluded.discord,players.discord), steam=COALESCE(excluded.steam,players.steam),
    fivem=COALESCE(excluded.fivem,players.fivem), job=COALESCE(excluded.job,players.job),
    grade=COALESCE(excluded.grade,players.grade), last_seen=excluded.last_seen,
    events=players.events+1`);
const iSanction = db.prepare(`INSERT INTO sanctions(player_key,name,type,reason,by_name,created_at,expires_at,active,space_id)
  VALUES(?,?,?,?,?,?,?,1,?)`);
const uLift = db.prepare(`UPDATE sanctions SET active=0, lifted_at=?, lifted_by=? WHERE player_key=? AND type='ban' AND active=1 AND space_id=?`);

const S = v => (v == null ? null : String(v));
const N = v => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

function normalize(raw, server) {
  const cat = CAT.CAT_IDS.includes(raw.cat) ? raw.cat : 'systeme';
  const sev = CAT.SEV_IDS.includes(raw.sev) ? raw.sev : 'info';
  let ts = N(raw.ts) || now();
  const max = now() + 5 * 60000, min = now() - 7 * 86400000;
  if (ts > max || ts < min) ts = now();          // horloge de serveur de jeu fantaisiste
  const a = raw.actor || {};
  const t = raw.target || {};
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const dataStr = JSON.stringify(data).slice(0, 8000);
  const msg = String(raw.msg || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const search = [msg, a.name, a.key, a.sid, t.name, t.key, raw.res, dataStr]
    .filter(Boolean).join(' ').toLowerCase().slice(0, 2000);
  return {
    ts, cat, sev, server: S(server),
    actor_key: S(a.key), actor_name: S(a.name), actor_sid: N(a.sid), actor_staff: a.staff ? 1 : 0,
    target_key: S(t.key), target_name: S(t.name),
    msg, data: dataStr, res: S(raw.res) || 'origin_logs', search, _data: data, _actor: a
  };
}

function ingest(list, server, spaceId) {
  const sp = Number(spaceId) || 1;
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const raw of list) {
      const e = normalize(raw, server);
      if (!e.msg) continue;
      const r = iEvent.run(e.ts, e.cat, e.sev, e.server, e.actor_key, e.actor_name, e.actor_sid,
                           e.actor_staff, e.target_key, e.target_name, e.msg, e.data, e.res, e.search, sp);
      const id = DB.num(r.lastInsertRowid);
      if (e.actor_key) {
        const a = e._actor;
        uPlayer.run(e.actor_key, e.actor_name, e.actor_sid, S(a.discord), S(a.steam), S(a.fivem),
                    S(a.job), N(a.grade), e.ts, e.ts, sp);
      }
      // Une sanction reçue du jeu doit exister comme sanction, pas seulement
      // comme ligne de log : c'est elle qui décide d'un refus de connexion.
      if ((e.cat === 'sanctions' || e.cat === 'bans') && e._data && e._data.type) {
        const d = e._data, key = S(d.cibleKey) || e.target_key;
        if (key) {
          if (d.type === 'unban') uLift.run(e.ts, e.actor_name, key, sp);
          else if (['warn', 'kick', 'ban', 'mute'].includes(d.type))
            iSanction.run(key, S(d.cible) || e.target_name, d.type, S(d.motif), e.actor_name,
                          e.ts, N(d.expireAt), sp);
        }
      }
      n++;
      broadcast(outEvent(Object.assign({ id, space_id: sp }, e)), sp);
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return n;
}

/* ---------- poignée de joueur ----------
   Le panneau a besoin d'un identifiant pour ouvrir un dossier ou viser
   une sanction. Lui donner la LICENCE reviendrait à publier l'identifiant
   à qui n'a pas le droit de le lire : on lui donne un alias, dérivé de la
   clé serveur, qui ne sort pas d'ici et ne se remonte pas. */
const ALIAS_SEL = crypto.createHash('sha256').update('origin-alias:' + CFG.serverKey).digest();
const aliasOf = k => (k ? 'k:' + crypto.createHmac('sha256', ALIAS_SEL).update(String(k)).digest('hex').slice(0, 24) : null);
const aliasCache = new Map();
function resolveKey(k, spaceId) {
  if (!k || !String(k).startsWith('k:')) return k;
  if (aliasCache.has(k)) return aliasCache.get(k);
  const rows = spaceId ? db.prepare('SELECT key FROM players WHERE space_id = ?').all(spaceId)
                       : db.prepare('SELECT key FROM players').all();
  for (const r of rows) {
    const a = aliasOf(r.key);
    aliasCache.set(a, r.key);
    if (a === k) return r.key;
  }
  return k;
}
const keyFor = (me, k) => (!me || me.perms.includes('players.identifiers') ? k : aliasOf(k));

/* ---------- sortie d'un évènement ---------- */
function outEvent(r, me) {
  const showIds = !me || me.perms.includes('players.identifiers');
  let data = r.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  if (!showIds && data) {
    data = Object.assign({}, data);
    for (const k of Object.keys(data)) if (/license|discord|steam|fivem|identifiant|ip/i.test(k)) data[k] = '— masqué —';
  }
  return {
    id: r.id, t: r.ts, cat: r.cat, sev: r.sev, res: r.res, server: r.server,
    actor: { name: r.actor_name || 'Système', sid: r.actor_sid, key: keyFor(me, r.actor_key),
             staff: !!r.actor_staff, license: showIds ? r.actor_key : null },
    target: r.target_name ? { name: r.target_name, key: keyFor(me, r.target_key) } : null,
    msg: r.msg, d: data || {},
    pin: !!r.pin, done: !!r.done, doneBy: r.done_by || null
  };
}

/* ============================================================
   Lecture des journaux
   Les filtres s'appliquent EN SQL, jamais après coup : les
   catégories qu'un rôle n'a pas le droit de voir ne quittent
   pas la base, même si le client en demande d'autres.
   ============================================================ */
const MARKJOIN = `LEFT JOIN marks mp ON mp.event_id=e.id AND mp.kind='pin'
                  LEFT JOIN marks md ON md.event_id=e.id AND md.kind='done'`;
const MARKCOLS = `, mp.at IS NOT NULL AS pin, md.at IS NOT NULL AS done, md.by_name AS done_by`;

function scopeCats(me, asked) {
  const allowed = me.cats;
  if (!asked || !asked.length) return allowed;
  const keep = asked.filter(c => allowed.includes(c));
  return keep.length ? keep : allowed;
}
function buildWhere(me, p, opts) {
  const w = ['e.space_id = ?'], a = [me.spaceId];
  const cats = scopeCats(me, p.cats);
  w.push(`e.cat IN (${cats.map(() => '?').join(',')})`); a.push(...cats);
  if (!(opts && opts.noSev) && p.sevs && p.sevs.length) {
    const s = p.sevs.filter(x => CAT.SEV_IDS.includes(x));
    if (s.length) { w.push(`e.sev IN (${s.map(() => '?').join(',')})`); a.push(...s); }
  }
  if (p.from) { w.push('e.ts >= ?'); a.push(p.from); }
  if (p.to)   { w.push('e.ts <= ?'); a.push(p.to); }
  if (p.actor){ w.push('(e.actor_key = ? OR e.target_key = ?)'); a.push(p.actor, p.actor); }
  if (p.undone) w.push('md.at IS NULL');
  return { where: w, args: a };
}
function queryEvents(me, p) {
  const { where, args } = buildWhere(me, p);
  let join = MARKJOIN;
  const q = (p.q || '').trim();
  if (q) {
    const fts = DB.ftsQuery(q);
    if (fts) { join += ' JOIN events_fts f ON f.rowid = e.id'; where.push('events_fts MATCH ?'); args.push(fts); }
    else     { where.push('e.search LIKE ?'); args.push('%' + q.toLowerCase() + '%'); }
  }
  const sql = `SELECT e.* ${MARKCOLS} FROM events e ${join} WHERE ${where.join(' AND ')}`;
  const total = DB.row(db.prepare(`SELECT COUNT(*) AS n FROM events e ${join} WHERE ${where.join(' AND ')}`).get(...args)).n;

  const pageWhere = where.slice(), pageArgs = args.slice();
  if (p.cursorTs) { pageWhere.push('(e.ts < ? OR (e.ts = ? AND e.id < ?))'); pageArgs.push(p.cursorTs, p.cursorTs, p.cursorId || 0); }
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 120));
  const rows = db.prepare(`SELECT e.* ${MARKCOLS} FROM events e ${join} WHERE ${pageWhere.join(' AND ')}
                           ORDER BY e.ts DESC, e.id DESC LIMIT ?`).all(...pageArgs, limit);
  const events = rows.map(r => outEvent(DB.row(r), me));
  const last = events[events.length - 1];

  // Compte par gravité AVANT le filtre de gravité : une pastille décochée
  // doit continuer d'annoncer combien elle ramènerait.
  const nb = buildWhere(me, p, { noSev: true });
  const nbWhere = nb.where.slice(), nbArgs = nb.args.slice();
  let nbJoin = MARKJOIN;
  if (q) {
    const fts = DB.ftsQuery(q);
    if (fts) { nbJoin += ' JOIN events_fts f ON f.rowid = e.id'; nbWhere.push('events_fts MATCH ?'); nbArgs.push(fts); }
    else     { nbWhere.push('e.search LIKE ?'); nbArgs.push('%' + q.toLowerCase() + '%'); }
  }
  const sevCounts = {};
  for (const r of db.prepare(`SELECT e.sev, COUNT(*) n FROM events e ${nbJoin}
       WHERE ${nbWhere.join(' AND ')} GROUP BY e.sev`).all(...nbArgs)) sevCounts[r.sev] = Number(r.n);

  return { events, total, sevCounts,
           cursor: last && events.length === limit ? { ts: last.t, id: last.id } : null };
}

function statsOf(me, from, to, buckets) {
  const cats = me.cats;
  const IN = `(${cats.map(() => '?').join(',')})`;
  const base = `FROM events e WHERE e.space_id = ? AND e.cat IN ${IN} AND e.ts >= ? AND e.ts <= ?`;
  const A = [me.spaceId, ...cats, from, to];
  const one = (sql, ...extra) => DB.row(db.prepare(sql).get(...A, ...extra));

  const total    = one(`SELECT COUNT(*) n ${base}`).n;
  const uniques  = one(`SELECT COUNT(DISTINCT e.actor_key) n ${base} AND e.actor_key IS NOT NULL AND e.actor_staff=0`).n;
  const anticheat= one(`SELECT COUNT(*) n ${base} AND e.cat='anticheat'`).n;
  const acCrit   = one(`SELECT COUNT(*) n ${base} AND e.cat='anticheat' AND e.sev='critique'`).n;
  const sanctions= one(`SELECT COUNT(*) n ${base} AND e.cat='sanctions'`).n;
  const alerts   = DB.row(db.prepare(`SELECT COUNT(*) n FROM events e
      LEFT JOIN marks md ON md.event_id=e.id AND md.kind='done'
      WHERE e.space_id = ? AND e.cat IN ${IN} AND e.ts >= ? AND e.ts <= ? AND e.sev IN ('critique','alerte') AND md.at IS NULL`).get(...A)).n;

  const span = to - from;
  const prev = DB.row(db.prepare(`SELECT COUNT(*) n FROM events e WHERE e.space_id = ? AND e.cat IN ${IN} AND e.ts >= ? AND e.ts < ?`)
                      .get(me.spaceId, ...cats, from - span, from)).n;

  const size = Math.max(60000, Math.floor(span / buckets));
  const series = new Array(buckets).fill(0);
  const seriesBySev = {};
  for (const id of CAT.SEV_IDS) seriesBySev[id] = new Array(buckets).fill(0);
  // Une barre qui ne dit que le VOLUME ne dit rien : 40 évènements peuvent
  // être 40 messages de chat ou 3 détections. On compte par gravité.
  for (const r of db.prepare(`SELECT CAST((e.ts - ?) / ? AS INTEGER) b, e.sev, COUNT(*) n ${base}
                              GROUP BY b, e.sev`).all(from, size, ...A)) {
    const i = Number(r.b);
    if (i < 0 || i >= buckets) continue;
    series[i] += Number(r.n);
    if (seriesBySev[r.sev]) seriesBySev[r.sev][i] = Number(r.n);
  }
  const bansActifs = DB.row(db.prepare(`SELECT COUNT(*) n FROM sanctions
      WHERE space_id = ? AND type='ban' AND active=1 AND (expires_at IS NULL OR expires_at > ?)`).get(me.spaceId, now())).n;

  const split = {};
  for (const r of db.prepare(`SELECT e.cat, COUNT(*) n ${base} GROUP BY e.cat`).all(...A)) split[r.cat] = Number(r.n);

  const top = db.prepare(`SELECT e.actor_key k, e.actor_name name, MAX(e.actor_sid) sid, COUNT(*) n ${base}
                          AND e.actor_staff=0 AND e.actor_key IS NOT NULL
                          GROUP BY e.actor_key ORDER BY n DESC LIMIT 6`).all(...A)
              .map(r => ({ key: r.k, name: r.name, sid: r.sid, n: Number(r.n) }));

  const alertRows = db.prepare(`SELECT e.* ${MARKCOLS} FROM events e ${MARKJOIN}
      WHERE e.space_id = ? AND e.cat IN ${IN} AND e.ts >= ? AND e.ts <= ? AND e.sev IN ('critique','alerte') AND md.at IS NULL
      ORDER BY e.ts DESC LIMIT 7`).all(...A).map(r => outEvent(DB.row(r), me));

  return { from, to, bucketSize: size, total, prev, uniques, alerts, anticheat, acCrit, sanctions,
           bansActifs, series, seriesBySev, split, top, alertList: alertRows };
}

function playerFile(me, key) {
  const p = DB.row(db.prepare('SELECT * FROM players WHERE key = ? AND space_id = ?').get(key, me.spaceId));
  if (!p) return null;
  const IN = `(${me.cats.map(() => '?').join(',')})`;
  const cnt = sql => DB.row(db.prepare(sql).get(me.spaceId, ...me.cats, key, key)).n;
  const stats = {
    events:  cnt(`SELECT COUNT(*) n FROM events WHERE space_id=? AND cat IN ${IN} AND (actor_key=? OR target_key=?)`),
    sessions:cnt(`SELECT COUNT(*) n FROM events WHERE space_id=? AND cat IN ${IN} AND json_extract(data,'$.kind')='join' AND (actor_key=? OR ?='')`),
    kills:   cnt(`SELECT COUNT(*) n FROM events WHERE space_id=? AND cat IN ${IN} AND json_extract(data,'$.kind')='kill' AND (actor_key=? OR ?='')`),
    deaths:  cnt(`SELECT COUNT(*) n FROM events WHERE space_id=? AND cat IN ${IN} AND ((json_extract(data,'$.kind')='kill' AND target_key=?) OR (json_extract(data,'$.kind')='death' AND actor_key=?))`),
    flags:   cnt(`SELECT COUNT(*) n FROM events WHERE space_id=? AND cat IN ${IN} AND cat='anticheat' AND (actor_key=? OR ?='')`)
  };
  const sanctions = db.prepare(`SELECT * FROM sanctions WHERE space_id=? AND player_key=? ORDER BY created_at DESC LIMIT 20`)
                      .all(me.spaceId, key).map(DB.row);
  const last = db.prepare(`SELECT e.* ${MARKCOLS} FROM events e ${MARKJOIN}
      WHERE e.space_id=? AND e.cat IN ${IN} AND (e.actor_key=? OR e.target_key=?) ORDER BY e.ts DESC LIMIT 20`)
      .all(me.spaceId, ...me.cats, key, key).map(r => outEvent(DB.row(r), me));
  const ids = me.perms.includes('players.identifiers');
  return {
    player: { key: ids ? p.key : aliasOf(p.key), keyMasquee: !ids, name: p.name, sid: p.sid, job: p.job, grade: p.grade,
              discord: ids ? p.discord : null, steam: ids ? p.steam : null, fivem: ids ? p.fivem : null,
              firstSeen: p.first_seen, lastSeen: p.last_seen, playtime: p.playtime, events: p.events },
    stats, sanctions, last,
    ban: DB.row(db.prepare(`SELECT * FROM sanctions WHERE space_id=? AND player_key=? AND type='ban' AND active=1
                            AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`).get(me.spaceId, key, now()))
  };
}

/* ============================================================
   Actions de modération
   Une action est d'abord un ÉVÈNEMENT (elle s'inscrit au journal
   comme le reste) puis une tâche déposée pour le serveur de jeu.
   Les deux ne se séparent jamais : une sanction qui n'apparaît
   pas au journal est une sanction que personne ne peut contester.
   ============================================================ */
const ACTION_PERM = { warn:'actions.warn', kick:'actions.kick', ban:'actions.ban',
                      unban:'actions.unban', give:'actions.give' };
const iAction = db.prepare(`INSERT INTO actions(type,target_key,target_name,target_sid,payload,reason,by_id,by_name,created_at,space_id)
                            VALUES(?,?,?,?,?,?,?,?,?,?)`);

function doAction(me, b, ip) {
  const type = String(b.type || '');
  if (!ACTION_PERM[type]) return { error: 'Action inconnue.' };
  if (!me.perms.includes(ACTION_PERM[type])) return { error: 'Votre rôle ne permet pas cette action.', code: 403 };
  const key = resolveKey(S(b.key), me.spaceId), name = S(b.name) || 'Joueur inconnu';
  if (!key) return { error: 'Joueur non identifié.' };
  const reason = String(b.reason || '').trim().slice(0, 300);
  if (type !== 'unban' && reason.length < 3) return { error: 'Un motif est obligatoire.' };

  const days = Math.max(0, Math.min(3650, Number(b.days) || 0));
  const expireAt = type === 'ban' && days > 0 ? now() + days * 86400000 : null;
  const payload = b.payload && typeof b.payload === 'object' ? b.payload : {};

  const msg =
    type === 'warn'  ? `${me.pseudo} a averti ${name} — ${reason}` :
    type === 'kick'  ? `${me.pseudo} a expulsé ${name} — ${reason}` :
    type === 'ban'   ? `${me.pseudo} a banni ${name} ${days ? 'pour ' + days + ' jour(s)' : 'définitivement'} — ${reason}` :
    type === 'unban' ? `${me.pseudo} a levé le bannissement de ${name}` :
                       `${me.pseudo} a rendu ${payload.label || 'un objet'} à ${name}`;

  ingest([{
    ts: now(),
    cat: type === 'give' ? 'admin' : (type === 'ban' || type === 'unban') ? 'bans' : 'sanctions',
    sev: type === 'ban' ? (days ? 'alerte' : 'critique') : type === 'unban' ? 'info' : 'notice',
    actor: { name: me.pseudo, staff: true },
    target: { name, key },
    msg,
    res: 'panneau',
    data: Object.assign({ type, cible: name, cibleKey: key, motif: reason || null,
                          expireAt, duree: days ? days + ' jour(s)' : (type === 'ban' ? 'permanent' : null),
                          staff: me.pseudo, source: 'panneau de logs' }, payload)
  }], 'panel', me.spaceId);

  const r = iAction.run(type, key, name, N(b.sid), JSON.stringify(payload), reason, me.id, me.pseudo, now(), me.spaceId);
  audit(me, 'action.' + type, `${name} (${key}) — ${reason}`, ip);
  return { ok: true, id: DB.num(r.lastInsertRowid), message: 'Action enregistrée et transmise au serveur.' };
}

/* ---------- entretien ---------- */
function purge() {
  // Chaque espace garde ses journaux aussi longtemps qu'il l'a décidé.
  let total = 0;
  for (const sp of db.prepare('SELECT id, retention FROM spaces').all()) {
    const jours = Number(sp.retention) || CFG.retention;
    total += DB.num(db.prepare('DELETE FROM events WHERE space_id = ? AND ts < ?')
                      .run(sp.id, now() - jours * 86400000).changes);
  }
  const n = { changes: total };
  db.prepare('DELETE FROM marks WHERE event_id NOT IN (SELECT id FROM events)').run();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  db.prepare(`DELETE FROM actions WHERE status IN ('done','failed') AND created_at < ?`).run(now() - 7 * 86400000);
  db.prepare('DELETE FROM audit WHERE ts < ?').run(now() - 180 * 86400000);
  if (DB.num(n.changes) > 0) {
    db.exec(`INSERT INTO events_fts(events_fts) VALUES('optimize')`);
    console.log(`[purge] ${DB.num(n.changes)} évènement(s) au-delà de la rétention supprimés`);
  }
}

/* ============================================================
   Routage
   ============================================================ */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2' };

const SEC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
};

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(CFG.panelDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(CFG.panelDir)) return fail(res, 403, 'Chemin refusé.');
  try {
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) return fail(res, 404, 'Introuvable.');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, Object.assign({ 'content-type': type, 'content-length': stat.size,
      'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' }, SEC_HEADERS));
    fs.createReadStream(file).pipe(res);
  } catch {
    if (pathname.startsWith('/api/')) return fail(res, 404, 'Route inconnue.');
    return serveStatic(req, res, '/index.html');
  }
}

/* La clé d'ingestion ne dit plus seulement « c'est bien le serveur de
   jeu », elle dit LEQUEL : chaque espace a la sienne, et elle n'ouvre
   que le sien. Comparaison à temps constant sur toutes les clés. */
function spaceFromKey(req) {
  const k = req.headers['x-origin-key'];
  if (typeof k !== 'string' || !k) return null;
  const donne = Buffer.from(k);
  for (const sp of db.prepare("SELECT * FROM spaces WHERE state = 'actif'").all()) {
    const attendu = Buffer.from(String(sp.server_key));
    if (attendu.length === donne.length && crypto.timingSafeEqual(attendu, donne)) return DB.row(sp);
  }
  return null;
}

async function route(req, res) {
  const u = url.parse(req.url, true);
  const p = u.pathname.replace(/\/+$/, '') || '/';
  const Q = u.query;
  const ip = clientIp(req);
  const method = req.method;

  /* ---- dépôt des logs par la ressource FiveM ---- */
  if (p === '/api/ingest' && method === 'POST') {
    const esp = spaceFromKey(req);
    if (!esp) return fail(res, 401, 'Clé serveur invalide ou espace fermé.');
    const b = await readBody(req);
    const list = Array.isArray(b) ? b : (b.events || []);
    if (!Array.isArray(list)) return fail(res, 400, 'Attendu : un tableau d’évènements.');
    const n = ingest(list.slice(0, 500), S(b.server) || esp.name, esp.id);
    return ok(res, { recus: n, espace: esp.name });
  }
  if (p === '/api/actions/pending' && method === 'GET') {
    const esp = spaceFromKey(req);
    if (!esp) return fail(res, 401, 'Clé serveur invalide ou espace fermé.');
    const rows = db.prepare(`SELECT * FROM actions WHERE status='pending' AND space_id = ?
                             ORDER BY created_at LIMIT 25`).all(esp.id).map(DB.row);
    if (rows.length) {
      const mark = db.prepare(`UPDATE actions SET status='sent' WHERE id=?`);
      for (const r of rows) mark.run(r.id);
    }
    return ok(res, { actions: rows.map(r => ({ id: r.id, type: r.type, key: r.target_key,
      name: r.target_name, sid: r.target_sid, reason: r.reason, by: r.by_name,
      payload: r.payload ? JSON.parse(r.payload) : {} })) });
  }
  if (p === '/api/actions/ack' && method === 'POST') {
    const esp = spaceFromKey(req);
    if (!esp) return fail(res, 401, 'Clé serveur invalide ou espace fermé.');
    const b = await readBody(req);
    db.prepare(`UPDATE actions SET status=?, result=?, done_at=? WHERE id=? AND space_id=?`)
      .run(b.ok ? 'done' : 'failed', S(b.result), now(), Number(b.id) || 0, esp.id);
    return ok(res, { ok: true });
  }
  if (p === '/api/ban-check' && method === 'GET') {
    const esp = spaceFromKey(req);
    if (!esp) return fail(res, 401, 'Clé serveur invalide ou espace fermé.');
    const ids = [Q.key, Q.discord, Q.steam, Q.fivem].filter(Boolean).map(String);
    if (!ids.length) return ok(res, { ban: null });
    const keys = new Set(ids);
    for (const r of db.prepare(`SELECT key FROM players WHERE space_id = ? AND (key IN (${ids.map(() => '?').join(',')})
        OR discord IN (${ids.map(() => '?').join(',')}) OR steam IN (${ids.map(() => '?').join(',')}))`)
        .all(esp.id, ...ids, ...ids, ...ids)) keys.add(r.key);
    const list = [...keys];
    const ban = DB.row(db.prepare(`SELECT * FROM sanctions WHERE space_id = ? AND player_key IN (${list.map(() => '?').join(',')})
        AND type='ban' AND active=1 AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC LIMIT 1`).get(esp.id, ...list, now()));
    return ok(res, { ban });
  }

  /* ---- ce que l'écran de connexion doit proposer ---- */
  if (p === '/api/auth/options' && method === 'GET') {
    const c = dconf();
    const espaces = spacesDiscord();
    return ok(res, {
      discord: discordPret(),
      // Dire POURQUOI la liaison n'est pas prête évite de chercher au
      // mauvais endroit : il manque presque toujours une seule chose.
      manque: discordPret() ? [] : [
        !c.clientId && 'identifiant d’application',
        !c.clientSecret && 'secret d’application (DISCORD_CLIENT_SECRET)',
        !c.botToken && 'jeton du bot (DISCORD_BOT_TOKEN)',
        !espaces.length && 'un espace avec son serveur Discord et son rôle staff'
      ].filter(Boolean),
      motDePasse: DB.row(db.prepare("SELECT COUNT(*) n FROM staff WHERE source='local' AND disabled=0").get()).n > 0
    });
  }

  /* ---- départ vers Discord ---- */
  if (p === '/api/auth/discord' && method === 'GET') {
    const c = dconf();
    if (!discordPret()) return fail(res, 503, 'La connexion Discord n’est pas configurée.');
    c.redirectUri = redirectUriOf(c, req);
    const state = DISCORD.makeState(c.clientSecret);
    res.writeHead(302, {
      location: DISCORD.authorizeUrl(c, state),
      'set-cookie': AUTH.cookieHeader('origin_state', state, { maxAge: 600, secure: CFG.secure }),
      'cache-control': 'no-store'
    });
    return res.end();
  }

  /* ---- retour de Discord ---- */
  if (p === '/api/auth/discord/callback' && method === 'GET') {
    const c = dconf();
    c.redirectUri = redirectUriOf(c, req);
    const rentrer = (msg, cookie) => {
      const tetes = { location: '/' + (msg ? '?discord=' + encodeURIComponent(msg) : ''), 'cache-control': 'no-store' };
      const biscuits = [AUTH.cookieHeader('origin_state', '', { clear: true, secure: CFG.secure })];
      if (cookie) biscuits.push(cookie);
      tetes['set-cookie'] = biscuits;
      res.writeHead(302, tetes); res.end();
    };
    try {
      if (!discordPret()) return rentrer('La connexion Discord n’est pas configurée.');
      if (Q.error) return rentrer('Autorisation refusée sur Discord.');
      const attendu = AUTH.parseCookies(req)['origin_state'];
      if (!Q.state || Q.state !== attendu || !DISCORD.checkState(Q.state, c.clientSecret))
        return rentrer('Lien de connexion expiré ou invalide. Réessayez.');
      const jetons = await DISCORD.exchangeCode(c, String(Q.code || ''));
      const user = await DISCORD.meFromToken(jetons.access_token);

      // Plusieurs espaces peuvent exister : on cherche celui (ou ceux) où
      // cette personne est staff. Un espace déjà connu passe en premier,
      // pour qu'on retombe toujours sur le sien.
      const espaces = spacesDiscord();
      const connu = DB.row(db.prepare('SELECT space_id FROM staff WHERE discord_id = ? ORDER BY last_login DESC LIMIT 1').get(user.id));
      if (connu) espaces.sort((a, b) => (b.id === connu.space_id) - (a.id === connu.space_id));
      let v = null, esp = null, dernier = null;
      for (const e of espaces) {
        const r = await verdictEspace(dconfFor(e), e, user.id);
        if (r.ok) { v = r; esp = e; break; }
        dernier = r;
      }
      if (!v) {
        audit(null, 'discord.refus', `${user.username} — ${(dernier || {}).raison || 'aucun espace'}`, ip, 1);
        return rentrer((dernier || {}).message || 'Aucun espace de logs ne vous reconnaît comme staff.');
      }
      const compte = upsertDiscordStaff(user, v, esp.id);
      if (compte.disabled) return rentrer('Votre accès au panneau a été suspendu.');
      audit({ id: compte.id, pseudo: compte.pseudo }, 'auth.discord', v.roles.join(', '), ip, esp.id);
      return rentrer(null, ouvrirSession(res, compte, req));
    } catch (e) {
      console.error('[discord] échec de connexion :', e.message);
      return rentrer('Discord n’a pas répondu correctement : ' + e.message);
    }
  }

  /* ---- connexion ---- */
  if (p === '/api/auth/login' && method === 'POST') {
    const wait = AUTH.throttle(ip);
    if (wait) return send(res, 429, { error: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` });
    const b = await readBody(req);
    const pseudo = String(b.pseudo || '').trim();
    const row = DB.row(db.prepare('SELECT * FROM staff WHERE pseudo = ? COLLATE NOCASE').get(pseudo));
    if (!row || row.disabled || row.source === 'discord' || !AUTH.verify(String(b.password || ''), row.pass)) {
      AUTH.noteFail(ip);
      audit(null, 'auth.echec', pseudo, ip);
      return fail(res, 401, 'Pseudo ou mot de passe incorrect.');
    }
    AUTH.clearFails(ip);
    const token = AUTH.newToken(), exp = now() + CFG.sessionDays * 86400000;
    db.prepare('INSERT INTO sessions(token,staff_id,created_at,expires_at,ua) VALUES(?,?,?,?,?)')
      .run(token, row.id, now(), exp, String(req.headers['user-agent'] || '').slice(0, 200));
    db.prepare('UPDATE staff SET last_login=? WHERE id=?').run(now(), row.id);
    audit({ id: row.id, pseudo: row.pseudo }, 'auth.connexion', null, ip);
    const manuels = parseRoles(row.manual_roles);
    const sesRoles = manuels.length ? manuels : (parseRoles(row.roles).length ? parseRoles(row.roles) : [CAT.canon(row.role)]);
    const spId = Number(row.space_id || 1);
    const rr = ROLESVC.resolve(db, spId, sesRoles);
    const esp = DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(spId));
    const platform = !!row.platform_admin;
    return send(res, 200, {
      staff: { pseudo: row.pseudo, role: rr.main ? rr.main.key : sesRoles[0],
               roleLabel: rr.main ? rr.main.label : sesRoles[0],
               roles: rr.labels, source: row.source || 'local',
               manuel: manuels.length > 0, plateforme: platform },
      espace: esp ? { id: esp.id, nom: esp.name, etat: esp.state, visite: false, monEspace: esp.id } : null,
      perms: platform ? CAT.PERM_IDS.slice() : rr.perms,
      cats: platform ? CAT.CATS.map(c => c.id) : rr.cats
    }, { 'set-cookie': AUTH.cookieHeader('origin_sid', token, { maxAge: CFG.sessionDays * 86400, secure: CFG.secure }) });
  }

  const me = whoami(req);
  // Un espace fermé ne laisse plus entrer personne — sauf l'administration
  // de la plateforme, qui doit pouvoir le rouvrir.
  if (me && me.space && me.space.state === 'ferme' && !me.platform && p.startsWith('/api/') && p !== '/api/auth/logout')
    return fail(res, 423, 'Cet espace de logs est fermé. Contactez l’administration.');

  if (p === '/api/auth/logout' && method === 'POST') {
    if (me) { qDropSession.run(me.token); audit(me, 'auth.deconnexion', null, ip); }
    return send(res, 200, { ok: true }, { 'set-cookie': AUTH.cookieHeader('origin_sid', '', { clear: true, secure: CFG.secure }) });
  }
  if (p === '/api/auth/me') {
    if (!me) return fail(res, 401, 'Session expirée.');
    return ok(res, {
      staff: { pseudo: me.pseudo, role: me.role, roleLabel: me.roleLabel,
               roles: me.roleLabels && me.roleLabels.length ? me.roleLabels
                    : me.roles.map(r => ({ id: r, label: r })),
               source: me.source, avatar: me.avatar, discordId: me.discordId,
               manuel: me.manual, plateforme: me.platform },
      espace: me.space ? { id: me.space.id, nom: me.space.name, etat: me.space.state,
                           visite: me.visiting, monEspace: me.homeSpaceId } : null,
      perms: me.perms, cats: me.cats });
  }
  if (p === '/api/catalogue') {
    const sp = me ? me.spaceId : 1;
    return ok(res, {
      cats: CAT.CATS, sevs: CAT.SEVS, groups: CAT.GROUPS, perms: CAT.PERMS,
      roles: ROLESVC.list(db, sp).map(r => ({ id: r.key, label: r.label, rank: r.rank,
        desc: r.desc, perms: r.perms, cats: r.cats })),
      espace: me && me.space ? { id: me.space.id, nom: me.space.name, etat: me.space.state } : null,
      retention: (me && me.space && me.space.retention) || CFG.retention });
  }

  if (p.startsWith('/api/')) {
    if (!me) return fail(res, 401, 'Connexion requise.');
    const need = perm => { if (!me.perms.includes(perm)) { fail(res, 403, 'Droit insuffisant.'); return false; } return true; };

    if (p === '/api/events' && method === 'GET') {
      if (!need('logs.view')) return;
      return ok(res, queryEvents(me, {
        cats: Q.cat ? String(Q.cat).split(',') : null,
        sevs: Q.sev ? String(Q.sev).split(',') : null,
        from: N(Q.from), to: N(Q.to), q: Q.q, actor: S(Q.actor),
        undone: Q.undone === '1',
        limit: N(Q.limit), cursorTs: N(Q.cursorTs), cursorId: N(Q.cursorId)
      }));
    }
    if (p === '/api/stats' && method === 'GET') {
      if (!need('logs.view')) return;
      const to = N(Q.to) || now(), from = N(Q.from) || to - 86400000;
      return ok(res, statsOf(me, from, to, Math.min(48, Math.max(6, N(Q.buckets) || 24))));
    }
    if (p === '/api/players' && method === 'GET') {
      if (!need('players.view')) return;
      const terme = String(Q.q || '').trim();
      if (terme.length < 2) return ok(res, { players: [] });
      const rows = db.prepare(`SELECT key, name, sid, job FROM players
        WHERE space_id = ? AND name LIKE ? ORDER BY last_seen DESC LIMIT 6`)
        .all(me.spaceId, '%' + terme + '%').map(DB.row);
      return ok(res, { players: rows.map(r => ({ key: keyFor(me, r.key), name: r.name, sid: r.sid, job: r.job })) });
    }
    if (p.startsWith('/api/players/') && method === 'GET') {
      if (!need('players.view')) return;
      const key = resolveKey(decodeURIComponent(p.slice('/api/players/'.length)), me.spaceId);
      const f = playerFile(me, key);
      if (!f) return fail(res, 404, 'Joueur inconnu.');
      audit(me, 'dossier.ouvert', key, ip);
      return ok(res, f);
    }
    /* ---- liaison Discord ----
       Les secrets sont globaux (une seule application Discord), le
       SERVEUR et les RÔLES appartiennent à l'espace : deux espaces
       peuvent vivre sur deux Discord différents. */
    if (p === '/api/discord/config' && method === 'GET') {
      if (!need('settings.discord')) return;
      const c = dconfFor(me.space);
      return ok(res, {
        pret: discordGlobalOk() && !!c.guildId && !!c.staffRoleId,
        // Les secrets ne repartent JAMAIS vers le navigateur : on dit
        // seulement s'ils sont en place.
        secrets: { clientSecret: !!c.clientSecret, botToken: !!c.botToken },
        clientId: c.clientId, guildId: c.guildId, staffRoleId: c.staffRoleId,
        redirectUri: c.redirectUri, redirectUriParDefaut: originOf(req) + '/api/auth/discord/callback',
        espace: { id: me.space.id, nom: me.space.name },
        roleMap: c.roleMap,
        roles: ROLESVC.list(db, me.spaceId).map(r => ({ id: r.key, label: r.label, rank: r.rank, desc: r.desc }))
      });
    }
    if (p === '/api/discord/config' && method === 'POST') {
      if (!need('settings.discord')) return;
      const b = await readBody(req);
      const idOk = v => v === '' || /^[0-9]{5,25}$/.test(String(v));
      if (b.clientId !== undefined) {
        if (!idOk(b.clientId)) return fail(res, 400, 'L’identifiant d’application doit être numérique.');
        setSetting('discord.clientId', b.clientId, me.pseudo);
      }
      if (b.redirectUri !== undefined) setSetting('discord.redirectUri', String(b.redirectUri || '').slice(0, 300), me.pseudo);
      for (const [champ, col] of [['guildId', 'guild_id'], ['staffRoleId', 'staff_role_id']]) {
        if (b[champ] === undefined) continue;
        if (!idOk(b[champ])) return fail(res, 400, `« ${champ} » doit être un identifiant Discord (chiffres uniquement).`);
        db.prepare(`UPDATE spaces SET ${col} = ? WHERE id = ?`).run(String(b[champ] || ''), me.spaceId);
      }
      if (b.roleMap && typeof b.roleMap === 'object') {
        const maj = db.prepare('UPDATE roles SET discord_role_id = ? WHERE space_id = ? AND key = ?');
        for (const r of ROLESVC.list(db, me.spaceId)) {
          if (!(r.key in b.roleMap)) continue;
          const v = String(b.roleMap[r.key] || '');
          if (!idOk(v)) return fail(res, 400, `L’identifiant du rôle « ${r.label} » est invalide.`);
          maj.run(v, me.spaceId, r.key);
        }
        ROLESVC.invalidate(me.spaceId);
      }
      audit(me, 'discord.config', 'liaison mise à jour', ip);
      const c = dconfFor(DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(me.spaceId)));
      return ok(res, { ok: true, pret: discordGlobalOk() && !!c.guildId && !!c.staffRoleId });
    }
    // Lister les rôles du serveur évite de copier des identifiants à la
    // main : on choisit dans une liste, et une faute de frappe disparaît.
    if (p === '/api/discord/roles' && method === 'GET') {
      if (!need('settings.discord')) return;
      const c = dconfFor(me.space);
      if (!c.botToken) return fail(res, 400, 'DISCORD_BOT_TOKEN manquant dans .env — le bot ne peut pas lire le serveur.');
      if (!c.guildId) return fail(res, 400, 'Renseignez d’abord l’identifiant du serveur Discord.');
      try {
        const roles = await DISCORD.guildRoles(c);
        return ok(res, { roles, guildId: c.guildId });
      } catch (e) {
        return fail(res, 502, e.message + ' Vérifiez que le bot est bien invité sur ce serveur.');
      }
    }

    /* ============================================================
       RÔLES DE L'ESPACE
       Créer, renommer, recomposer — droits ET rubriques — et relier à
       un rôle Discord. Rien de tout cela ne vit dans le code.
       ============================================================ */
    if (p === '/api/roles' && method === 'GET') {
      if (!need('roles.manage')) return;
      return ok(res, {
        roles: ROLESVC.list(db, me.spaceId),
        perms: CAT.PERMS, cats: CAT.CATS, groups: CAT.GROUPS,
        monRang: me.plafond,
        effectifs: db.prepare('SELECT roles, manual_roles FROM staff WHERE space_id = ? AND disabled = 0').all()
          .reduce((m, r) => { for (const k of parseRoles(r.manual_roles).concat(parseRoles(r.roles)))
                                m[k] = (m[k] || 0) + 1; return m; }, {})
      });
    }
    if (p === '/api/roles' && method === 'POST') {
      if (!need('roles.manage')) return;
      const b = await readBody(req);
      const label = String(b.label || '').trim().slice(0, 40);
      if (label.length < 2) return fail(res, 400, 'Donnez un nom au rôle (2 caractères minimum).');
      const rang = Math.max(1, Math.min(999, Number(b.rank) || 10));
      // On ne crée pas un rôle plus haut que soi : ce serait se donner
      // des droits qu'on n'a pas, par un détour.
      if (rang >= me.plafond) return fail(res, 403, `Vous ne pouvez pas créer un rôle de rang ${rang} : le vôtre est ${me.rank}.`);
      const perms = (Array.isArray(b.perms) ? b.perms : []).filter(x => CAT.PERM_IDS.includes(x))
                      .filter(x => me.perms.includes(x));   // on n'accorde que ce qu'on détient
      const cats = (Array.isArray(b.cats) ? b.cats : []).filter(x => CAT.CAT_IDS.includes(x));
      const key = ROLESVC.makeKey(db, me.spaceId, label);
      db.prepare(`INSERT INTO roles(space_id,key,label,rank,perms,cats,discord_role_id,builtin,created_at)
                  VALUES(?,?,?,?,?,?,?,0,?)`)
        .run(me.spaceId, key, label, rang, JSON.stringify(perms), JSON.stringify(cats),
             /^[0-9]{5,25}$/.test(String(b.discordRoleId || '')) ? String(b.discordRoleId) : null, now());
      ROLESVC.invalidate(me.spaceId);
      audit(me, 'roles.creation', `${label} (rang ${rang})`, ip);
      return ok(res, { ok: true, key });
    }
    if (p.startsWith('/api/roles/')) {
      if (!need('roles.manage')) return;
      const key = decodeURIComponent(p.slice('/api/roles/'.length));
      const role = ROLESVC.byKey(db, me.spaceId, key);
      if (!role) return fail(res, 404, 'Rôle inconnu dans cet espace.');
      if (role.rank >= me.plafond) return fail(res, 403, 'Ce rôle est au moins au niveau du vôtre.');

      if (method === 'PATCH') {
        const b = await readBody(req);
        const sets = [], args = [];
        if (b.label !== undefined) {
          const l = String(b.label).trim().slice(0, 40);
          if (l.length < 2) return fail(res, 400, 'Nom de rôle trop court.');
          sets.push('label = ?'); args.push(l);
        }
        if (b.rank !== undefined) {
          const rg = Math.max(1, Math.min(999, Number(b.rank) || role.rank));
          if (rg >= me.plafond) return fail(res, 403, 'Vous ne pouvez pas hisser un rôle à votre niveau.');
          sets.push('rank = ?'); args.push(rg);
        }
        if (Array.isArray(b.perms)) {
          const pr = b.perms.filter(x => CAT.PERM_IDS.includes(x) && me.perms.includes(x));
          sets.push('perms = ?'); args.push(JSON.stringify(pr));
        }
        if (Array.isArray(b.cats)) {
          const ct = CAT.CAT_IDS.filter(x => b.cats.includes(x));
          sets.push('cats = ?'); args.push(JSON.stringify(ct));
        }
        if (b.discordRoleId !== undefined) {
          const v = String(b.discordRoleId || '');
          if (v && !/^[0-9]{5,25}$/.test(v)) return fail(res, 400, 'Identifiant de rôle Discord invalide.');
          sets.push('discord_role_id = ?'); args.push(v || null);
        }
        if (!sets.length) return ok(res, { ok: true });
        db.prepare(`UPDATE roles SET ${sets.join(', ')} WHERE space_id = ? AND key = ?`).run(...args, me.spaceId, key);
        ROLESVC.invalidate(me.spaceId);
        audit(me, 'roles.modification', role.label, ip);
        return ok(res, { ok: true });
      }
      if (method === 'DELETE') {
        if (role.builtin) return fail(res, 409, 'Un rôle d’origine ne se supprime pas : videz ses droits ou retirez son lien Discord.');
        const porteurs = db.prepare('SELECT COUNT(*) n FROM staff WHERE space_id = ? AND (roles LIKE ? OR manual_roles LIKE ?)')
          .get(me.spaceId, '%"' + key + '"%', '%"' + key + '"%').n;
        if (porteurs) return fail(res, 409, `${porteurs} compte(s) portent encore ce rôle. Retirez-le-leur d’abord.`);
        db.prepare('DELETE FROM roles WHERE space_id = ? AND key = ?').run(me.spaceId, key);
        ROLESVC.invalidate(me.spaceId);
        audit(me, 'roles.suppression', role.label, ip);
        return ok(res, { ok: true });
      }
    }

    if (p === '/api/bans' && method === 'GET') {
      if (!need('logs.view')) return;
      // Le registre n'est pas une relecture du flux : il dit qui est
      // banni MAINTENANT, ce qu'aucune liste d'évènements ne répond.
      const etat = ['actifs', 'expires', 'tous'].includes(Q.state) ? Q.state : 'actifs';
      const t = now();
      const encours = `(active=1 AND (expires_at IS NULL OR expires_at > ${t}))`;
      const filtre = etat === 'actifs' ? `WHERE space_id=? AND type='ban' AND ${encours}`
                   : etat === 'expires' ? `WHERE space_id=? AND type='ban' AND NOT ${encours}`
                   : `WHERE space_id=? AND type='ban'`;
      const rows = db.prepare(`SELECT * FROM sanctions ${filtre} ORDER BY created_at DESC LIMIT 300`).all(me.spaceId).map(DB.row);
      const ids = me.perms.includes('players.identifiers');
      const compte = k => DB.row(db.prepare(`SELECT COUNT(*) n FROM sanctions WHERE space_id=? AND type='ban' AND ${k}`).get(me.spaceId)).n;
      return ok(res, {
        bans: rows.map(b => Object.assign({}, b, {
          player_key: keyFor(me, b.player_key),
          encours: b.active === 1 && (!b.expires_at || b.expires_at > t)
        })),
        counts: { actifs: compte(encours), expires: compte('NOT ' + encours), tous: compte('1=1') }
      });
    }
    if (p === '/api/marks' && method === 'POST') {
      if (!need('logs.mark')) return;
      const b = await readBody(req);
      const kind = b.kind === 'pin' ? 'pin' : 'done';
      const id = Number(b.id) || 0;
      const aMoi = DB.row(db.prepare('SELECT id FROM events WHERE id = ? AND space_id = ?').get(id, me.spaceId));
      if (!aMoi) return fail(res, 404, 'Évènement introuvable dans cet espace.');
      if (b.on) db.prepare('INSERT OR REPLACE INTO marks(event_id,kind,by_id,by_name,at) VALUES(?,?,?,?,?)')
                  .run(id, kind, me.id, me.pseudo, now());
      else db.prepare('DELETE FROM marks WHERE event_id=? AND kind=?').run(id, kind);
      return ok(res, { ok: true });
    }
    if (p === '/api/actions' && method === 'POST') {
      const b = await readBody(req);
      const r = doAction(me, b, ip);
      return r.error ? fail(res, r.code || 400, r.error) : ok(res, r);
    }
    if (p === '/api/actions' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM actions WHERE space_id = ? ORDER BY created_at DESC LIMIT 100').all(me.spaceId).map(DB.row);
      return ok(res, { actions: rows });
    }
    if (p === '/api/audit' && method === 'GET') {
      if (!need('audit.view')) return;
      return ok(res, { audit: db.prepare('SELECT * FROM audit WHERE space_id = ? ORDER BY ts DESC LIMIT 200')
                                 .all(me.spaceId).map(DB.row) });
    }
    if (p === '/api/export' && method === 'GET') {
      if (!need('logs.export')) return;
      audit(me, 'export.csv', Q.cat || 'toutes catégories', ip);
      const r = queryEvents(me, { cats: Q.cat ? String(Q.cat).split(',') : null,
        sevs: Q.sev ? String(Q.sev).split(',') : null, from: N(Q.from), to: N(Q.to), q: Q.q, limit: 5000 });
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = ['horodatage;categorie;gravite;joueur;server_id;evenement;ressource'];
      for (const e of r.events) lines.push([new Date(e.t).toISOString(), e.cat, e.sev,
        e.actor.name, e.actor.sid == null ? '' : e.actor.sid, esc(e.msg), e.res].join(';'));
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="origin-logs-${new Date().toISOString().slice(0,10)}.csv"` });
      return res.end('﻿' + lines.join('\n'));
    }

    /* ============================================================
       ÉQUIPE DE L'ESPACE
       Les rôles viennent de Discord, mais un fondateur garde le dernier
       mot : des rôles posés À LA MAIN l'emportent et survivent aux
       resynchronisations. Sinon sa décision serait défaite en 15 minutes.
       ============================================================ */
    if (p === '/api/staff') {
      if (!need('accounts.manage')) return;
      if (method === 'GET') {
        const lignes = db.prepare(`SELECT id,pseudo,role,roles,manual_roles,source,discord_id,avatar,
                                          disabled,created_at,last_login,platform_admin
                                   FROM staff WHERE space_id = ?`).all(me.spaceId).map(DB.row);
        return ok(res, {
          staff: lignes.map(x => {
            const manuels = parseRoles(x.manual_roles);
            const rs = manuels.length ? manuels : parseRoles(x.roles);
            const r = ROLESVC.resolve(db, me.spaceId, rs.length ? rs : [x.role]);
            return { id:x.id, pseudo:x.pseudo, source:x.source, avatar:x.avatar,
                     disabled:x.disabled, created_at:x.created_at, last_login:x.last_login,
                     platform_admin: !!x.platform_admin,
                     role: r.main ? r.main.key : x.role,
                     roles: r.labels, roleKeys: r.keys, manual: manuels.length > 0,
                     rank: r.rank, estMoi: x.id === me.id };
          }).sort((a, b) => b.rank - a.rank || a.pseudo.localeCompare(b.pseudo)),
          roles: ROLESVC.list(db, me.spaceId).map(r => ({ id: r.key, label: r.label, rank: r.rank })),
          monRang: me.plafond
        });
      }
      if (method === 'POST') {
        const b = await readBody(req);
        const pseudo = String(b.pseudo || '').trim();
        const pass = String(b.password || '');
        const role = ROLESVC.byKey(db, me.spaceId, b.role) ? b.role : 'moderateur';
        if (pseudo.length < 3) return fail(res, 400, 'Pseudo trop court (3 caractères minimum).');
        if (pass.length < 10) return fail(res, 400, 'Mot de passe trop court (10 caractères minimum).');
        const r = ROLESVC.byKey(db, me.spaceId, role);
        if (r.rank >= me.plafond) return fail(res, 403, 'Vous ne pouvez pas créer un rôle supérieur ou égal au vôtre.');
        if (DB.row(db.prepare('SELECT id FROM staff WHERE pseudo = ? COLLATE NOCASE').get(pseudo))) return fail(res, 409, 'Ce pseudo existe déjà.');
        db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,created_at,space_id,source)
                    VALUES(?,?,?,?,?,?, 'local')`)
          .run(pseudo, AUTH.hash(pass), role, JSON.stringify([role]), now(), me.spaceId);
        audit(me, 'staff.creation', `${pseudo} (${r.label})`, ip);
        return ok(res, { ok: true });
      }
    }
    if (p.startsWith('/api/staff/')) {
      if (!need('accounts.manage')) return;
      const id = Number(p.slice('/api/staff/'.length)) || 0;
      const target = DB.row(db.prepare('SELECT * FROM staff WHERE id = ? AND space_id = ?').get(id, me.spaceId));
      if (!target) return fail(res, 404, 'Compte inconnu dans cet espace.');
      const rangCible = ROLESVC.resolve(db, me.spaceId,
        (parseRoles(target.manual_roles).length ? parseRoles(target.manual_roles) : parseRoles(target.roles))
          .concat(target.role ? [target.role] : [])).rank;
      if (rangCible >= me.plafond && target.id !== me.id)
        return fail(res, 403, 'Ce compte est à votre niveau ou au-dessus.');

      if (method === 'PATCH') {
        const b = await readBody(req);
        // Attribution MANUELLE : c'est ce que demande un fondateur qui
        // veut trancher lui-même, sans passer par Discord.
        if (Array.isArray(b.roles)) {
          const voulus = b.roles.filter(k => ROLESVC.byKey(db, me.spaceId, k));
          for (const k of voulus) {
            const r = ROLESVC.byKey(db, me.spaceId, k);
            if (r.rank >= me.plafond) return fail(res, 403, `« ${r.label} » est au moins au niveau de votre rôle.`);
          }
          if (!voulus.length) {
            // Rendre la main à Discord plutôt que laisser un compte sans rôle.
            db.prepare('UPDATE staff SET manual_roles = NULL WHERE id = ?').run(id);
            audit(me, 'staff.roles', `${target.pseudo} → rendus à Discord`, ip);
          } else {
            db.prepare('UPDATE staff SET manual_roles = ?, role = ? WHERE id = ?')
              .run(JSON.stringify(voulus), voulus[0], id);
            audit(me, 'staff.roles', `${target.pseudo} → ${voulus.join(', ')} (manuel)`, ip);
          }
          db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(id);   // les droits changent tout de suite
        }
        if (b.password) {
          if (target.source === 'discord') return fail(res, 409, 'Ce compte se connecte par Discord : il n’a pas de mot de passe.');
          if (String(b.password).length < 10) return fail(res, 400, 'Mot de passe trop court (10 caractères minimum).');
          db.prepare('UPDATE staff SET pass=? WHERE id=?').run(AUTH.hash(String(b.password)), id);
          db.prepare('DELETE FROM sessions WHERE staff_id=?').run(id);
        }
        if (b.disabled !== undefined) {
          if (id === me.id) return fail(res, 400, 'Vous ne pouvez pas désactiver votre propre compte.');
          db.prepare('UPDATE staff SET disabled=? WHERE id=?').run(b.disabled ? 1 : 0, id);
          if (b.disabled) db.prepare('DELETE FROM sessions WHERE staff_id=?').run(id);
          audit(me, b.disabled ? 'staff.suspension' : 'staff.reactivation', target.pseudo, ip);
        }
        return ok(res, { ok: true });
      }
      if (method === 'DELETE') {
        if (id === me.id) return fail(res, 400, 'Vous ne pouvez pas supprimer votre propre compte.');
        db.prepare('DELETE FROM sessions WHERE staff_id=?').run(id);
        db.prepare('DELETE FROM staff WHERE id=?').run(id);
        audit(me, 'staff.suppression', target.pseudo, ip);
        return ok(res, { ok: true });
      }
    }

    /* ============================================================
       ADMINISTRATION DE LA PLATEFORME
       Au-dessus des espaces : créer, fermer, changer de propriétaire,
       révoquer. Réservé aux comptes marqués administrateurs de
       plateforme — un droit qui ne s'accorde pas depuis un espace,
       sinon un fondateur se hisserait au-dessus de tous les autres.
       ============================================================ */
    if (p.startsWith('/api/platform')) {
      if (!me.platform) return fail(res, 403, 'Réservé à l’administration de la plateforme.');

      if (p === '/api/platform/spaces' && method === 'GET') {
        const rows = db.prepare('SELECT * FROM spaces ORDER BY state, name').all().map(DB.row);
        const compte = (t, id) => DB.row(db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE space_id = ?`).get(id)).n;
        return ok(res, {
          spaces: rows.map(sp => ({
            id: sp.id, nom: sp.name, etat: sp.state,
            guildId: sp.guild_id || '', staffRoleId: sp.staff_role_id || '',
            retention: sp.retention || CFG.retention,
            cle: sp.server_key, creeLe: sp.created_at, creePar: sp.created_by,
            fermeLe: sp.closed_at, motifFermeture: sp.closed_reason,
            proprietaire: sp.owner_id
              ? DB.row(db.prepare('SELECT id,pseudo FROM staff WHERE id = ?').get(sp.owner_id)) : null,
            membres: compte('staff', sp.id), evenements: compte('events', sp.id),
            bannis: DB.row(db.prepare(`SELECT COUNT(*) n FROM sanctions WHERE space_id=? AND type='ban' AND active=1`).get(sp.id)).n
          })),
          monEspace: me.spaceId, discordGlobal: discordGlobalOk()
        });
      }
      if (p === '/api/platform/spaces' && method === 'POST') {
        const b = await readBody(req);
        const nom = String(b.nom || '').trim().slice(0, 60);
        if (nom.length < 2) return fail(res, 400, 'Donnez un nom à l’espace.');
        const idOk = v => !v || /^[0-9]{5,25}$/.test(String(v));
        if (!idOk(b.guildId) || !idOk(b.staffRoleId))
          return fail(res, 400, 'Les identifiants Discord doivent être numériques.');
        // Une clé d'ingestion par espace : celle d'un serveur de jeu
        // n'ouvre jamais les journaux d'un autre.
        const cle = crypto.randomBytes(24).toString('hex');
        const r = db.prepare(`INSERT INTO spaces(name,guild_id,staff_role_id,server_key,state,retention,created_at,created_by)
                              VALUES(?,?,?,?, 'actif', ?,?,?)`)
          .run(nom, S(b.guildId), S(b.staffRoleId), cle,
               Math.max(1, Math.min(3650, Number(b.retention) || CFG.retention)), now(), me.pseudo);
        const sid = DB.num(r.lastInsertRowid);
        ROLESVC.seed(db, sid);
        audit(me, 'plateforme.espace.creation', `${nom} (#${sid})`, ip, sid);
        return ok(res, { ok: true, id: sid, cle });
      }
      if (p.startsWith('/api/platform/spaces/')) {
        const sid = Number(p.slice('/api/platform/spaces/'.length)) || 0;
        const sp = DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(sid));
        if (!sp) return fail(res, 404, 'Espace inconnu.');

        if (method === 'PATCH') {
          const b = await readBody(req);
          const sets = [], args = [];
          const idOk = v => !v || /^[0-9]{5,25}$/.test(String(v));
          if (b.nom !== undefined) { const v = String(b.nom).trim().slice(0, 60);
            if (v.length < 2) return fail(res, 400, 'Nom trop court.'); sets.push('name = ?'); args.push(v); }
          if (b.guildId !== undefined) { if (!idOk(b.guildId)) return fail(res, 400, 'Identifiant de serveur invalide.');
            sets.push('guild_id = ?'); args.push(String(b.guildId || '')); }
          if (b.staffRoleId !== undefined) { if (!idOk(b.staffRoleId)) return fail(res, 400, 'Identifiant de rôle invalide.');
            sets.push('staff_role_id = ?'); args.push(String(b.staffRoleId || '')); }
          if (b.retention !== undefined) { sets.push('retention = ?');
            args.push(Math.max(1, Math.min(3650, Number(b.retention) || CFG.retention))); }
          if (b.proprietaire !== undefined) {
            const cand = b.proprietaire ? DB.row(db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(b.proprietaire))) : null;
            if (b.proprietaire && !cand) return fail(res, 404, 'Ce compte n’existe pas.');
            if (cand && Number(cand.space_id) !== sid)
              return fail(res, 409, 'Le propriétaire doit être membre de cet espace.');
            sets.push('owner_id = ?'); args.push(cand ? cand.id : null);
            if (cand) audit(me, 'plateforme.proprietaire', `${sp.name} → ${cand.pseudo}`, ip, sid);
          }
          if (b.etat !== undefined) {
            const e = b.etat === 'ferme' ? 'ferme' : 'actif';
            if (e === 'ferme') {
              // Fermer, ce n'est pas supprimer : les journaux restent, mais
              // plus personne n'entre et le serveur de jeu cesse d'écrire.
              sets.push('state = ?', 'closed_at = ?', 'closed_reason = ?');
              args.push('ferme', now(), String(b.motif || '').slice(0, 200));
              db.prepare('DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE space_id = ?)').run(sid);
            } else { sets.push('state = ?', 'closed_at = ?', 'closed_reason = ?'); args.push('actif', null, null); }
            audit(me, e === 'ferme' ? 'plateforme.espace.fermeture' : 'plateforme.espace.reouverture', sp.name, ip, sid);
          }
          if (b.regenererCle) {
            sets.push('server_key = ?'); args.push(crypto.randomBytes(24).toString('hex'));
            audit(me, 'plateforme.cle', `${sp.name} — clé régénérée`, ip, sid);
          }
          if (!sets.length) return ok(res, { ok: true });
          db.prepare(`UPDATE spaces SET ${sets.join(', ')} WHERE id = ?`).run(...args, sid);
          const apres = DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(sid));
          return ok(res, { ok: true, cle: apres.server_key });
        }
        if (method === 'DELETE') {
          if (Q.confirme !== sp.name)
            return fail(res, 400, 'Pour supprimer un espace, renvoyez son nom exact : la suppression efface tous ses journaux.');
          if (db.prepare('SELECT COUNT(*) n FROM spaces').get().n <= 1)
            return fail(res, 409, 'Le dernier espace ne se supprime pas.');
          const restants = DB.row(db.prepare(`SELECT COUNT(*) n FROM staff
            WHERE platform_admin = 1 AND disabled = 0 AND space_id <> ?`).get(sid)).n;
          if (!restants) return fail(res, 409,
            'Cet espace abrite le dernier administrateur de plateforme : déplacez-le d’abord, sinon plus personne ne pourrait administrer.');
          db.exec('BEGIN');
          try {
            db.prepare('DELETE FROM marks WHERE event_id IN (SELECT id FROM events WHERE space_id = ?)').run(sid);
            for (const t of ['events', 'players', 'sanctions', 'actions', 'audit', 'roles'])
              db.prepare(`DELETE FROM ${t} WHERE space_id = ?`).run(sid);
            db.prepare('DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE space_id = ?)').run(sid);
            db.prepare('DELETE FROM staff WHERE space_id = ?').run(sid);
            db.prepare('DELETE FROM spaces WHERE id = ?').run(sid);
            db.exec('COMMIT');
          } catch (e) { db.exec('ROLLBACK'); throw e; }
          ROLESVC.invalidate(sid);
          audit(me, 'plateforme.espace.suppression', sp.name, ip, 1);
          return ok(res, { ok: true });
        }
      }

      if (p === '/api/platform/members' && method === 'GET') {
        const sid = N(Q.space);
        const rows = (sid ? db.prepare('SELECT * FROM staff WHERE space_id = ? ORDER BY pseudo').all(sid)
                          : db.prepare('SELECT * FROM staff ORDER BY space_id, pseudo').all()).map(DB.row);
        return ok(res, { members: rows.map(x => {
          const rs = parseRoles(x.manual_roles).length ? parseRoles(x.manual_roles) : parseRoles(x.roles);
          const r = ROLESVC.resolve(db, x.space_id || 1, rs.length ? rs : [x.role]);
          return { id:x.id, pseudo:x.pseudo, spaceId:x.space_id, source:x.source, disabled:!!x.disabled,
                   platform:!!x.platform_admin, avatar:x.avatar, discordId:x.discord_id,
                   roles:r.labels, rank:r.rank, last_login:x.last_login, estMoi:x.id === me.id };
        }) });
      }
      if (p.startsWith('/api/platform/members/')) {
        const mid = Number(p.slice('/api/platform/members/'.length)) || 0;
        const cible = DB.row(db.prepare('SELECT * FROM staff WHERE id = ?').get(mid));
        if (!cible) return fail(res, 404, 'Compte inconnu.');
        if (method === 'PATCH') {
          const b = await readBody(req);
          if (b.disabled !== undefined) {
            if (mid === me.id) return fail(res, 400, 'Vous ne pouvez pas révoquer votre propre accès.');
            db.prepare('UPDATE staff SET disabled = ? WHERE id = ?').run(b.disabled ? 1 : 0, mid);
            db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(mid);
            audit(me, b.disabled ? 'plateforme.revocation' : 'plateforme.reactivation', cible.pseudo, ip, cible.space_id);
          }
          if (b.spaceId !== undefined) {
            const dest = DB.row(db.prepare('SELECT id FROM spaces WHERE id = ?').get(Number(b.spaceId)));
            if (!dest) return fail(res, 404, 'Espace de destination inconnu.');
            // Les rôles appartiennent à l'espace quitté : on repart de zéro
            // plutôt que d'accorder au hasard des droits homonymes.
            db.prepare('UPDATE staff SET space_id = ?, manual_roles = NULL, roles = ? WHERE id = ?')
              .run(dest.id, JSON.stringify([]), mid);
            db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(mid);
            audit(me, 'plateforme.mutation', `${cible.pseudo} → espace #${dest.id}`, ip, dest.id);
          }
          if (b.platform !== undefined) {
            if (mid === me.id && !b.platform) {
              const autres = DB.row(db.prepare('SELECT COUNT(*) n FROM staff WHERE platform_admin = 1 AND id <> ?').get(mid)).n;
              if (!autres) return fail(res, 409, 'Vous êtes le dernier administrateur de plateforme.');
            }
            db.prepare('UPDATE staff SET platform_admin = ? WHERE id = ?').run(b.platform ? 1 : 0, mid);
            audit(me, 'plateforme.admin', `${cible.pseudo} → ${b.platform ? 'oui' : 'non'}`, ip, cible.space_id);
          }
          return ok(res, { ok: true });
        }
        if (method === 'DELETE') {
          if (mid === me.id) return fail(res, 400, 'Vous ne pouvez pas supprimer votre propre compte.');
          db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(mid);
          db.prepare('DELETE FROM staff WHERE id = ?').run(mid);
          audit(me, 'plateforme.membre.suppression', cible.pseudo, ip, cible.space_id);
          return ok(res, { ok: true });
        }
      }

      // Visiter un espace : la session change, pas le compte.
      if (p === '/api/platform/enter' && method === 'POST') {
        const b = await readBody(req);
        const sid = Number(b.spaceId) || 0;
        const sp = DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(sid));
        if (!sp) return fail(res, 404, 'Espace inconnu.');
        db.prepare('UPDATE sessions SET space_id = ? WHERE token = ?').run(sid, me.token);
        audit(me, 'plateforme.visite', sp.name, ip, sid);
        return ok(res, { ok: true, espace: sp.name });
      }
      return fail(res, 404, 'Route inconnue.');
    }

    /* ---- flux temps réel ---- */
    if (p === '/api/stream') {
      if (!need('logs.view')) return;
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache',
                           'connection': 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 5000\n\n');
      const client = { res, cats: me.cats, space: me.spaceId };
      streams.add(client);
      req.on('close', () => streams.delete(client));
      return;
    }
    return fail(res, 404, 'Route inconnue.');
  }

  if (method !== 'GET') return fail(res, 405, 'Méthode non autorisée.');
  return serveStatic(req, res, p);
}

/* ---------- démarrage ---------- */
const server = http.createServer((req, res) => {
  route(req, res).catch(err => {
    console.error('[erreur]', req.method, req.url, '-', err.message);
    if (!res.headersSent) fail(res, 500, 'Erreur interne.');
  });
});
server.listen(CFG.port, CFG.host, () => {
  bootstrapSpace();
  const staffCount = DB.row(db.prepare('SELECT COUNT(*) n FROM staff').get()).n;
  const espaces = db.prepare('SELECT COUNT(*) n FROM spaces').get().n;
  console.log(`\n  Origin Roleplay — API des journaux`);
  console.log(`  ├─ écoute        http://${CFG.host}:${CFG.port}`);
  console.log(`  ├─ base          ${CFG.dbFile}`);
  console.log(`  ├─ panneau       ${CFG.panelDir}`);
  console.log(`  ├─ rétention     ${CFG.retention} jours`);
  console.log(`  ├─ espaces       ${espaces}`);
  console.log(`  └─ comptes staff ${staffCount}`);
  if (!staffCount) console.log(`\n  Aucun compte : créez le vôtre avec  node staff.js add <pseudo> fondateur\n`);
  else console.log('');
  purge();
});
setInterval(purge, 6 * 3600 * 1000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  console.log('\n  Arrêt propre…'); server.close(); try { db.close(); } catch {} process.exit(0);
});

module.exports = { server, db, CFG };
