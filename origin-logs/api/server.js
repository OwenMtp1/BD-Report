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

/* ---------- configuration ---------- */
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
const qSession = db.prepare(`SELECT s.token, s.expires_at, t.id, t.pseudo, t.role, t.disabled
                             FROM sessions s JOIN staff t ON t.id = s.staff_id WHERE s.token = ?`);
const qDropSession = db.prepare('DELETE FROM sessions WHERE token = ?');

function whoami(req) {
  const tok = AUTH.parseCookies(req)['origin_sid'];
  if (!tok) return null;
  const r = DB.row(qSession.get(tok));
  if (!r) return null;
  if (r.expires_at < now() || r.disabled) { qDropSession.run(tok); return null; }
  return { id: r.id, pseudo: r.pseudo, role: r.role, token: tok,
           perms: CAT.permsOf(r.role), cats: CAT.catsOf(r.role) };
}
const iAudit = db.prepare('INSERT INTO audit(ts,staff_id,pseudo,action,detail,ip) VALUES(?,?,?,?,?,?)');
const audit = (me, action, detail, ip) =>
  iAudit.run(now(), me ? me.id : null, me ? me.pseudo : null, action, detail ? String(detail).slice(0, 400) : null, ip || null);

/* ---------- flux temps réel (SSE) ---------- */
const streams = new Set();
function broadcast(ev) {
  if (!streams.size) return;
  const payload = JSON.stringify(ev);
  for (const c of streams) {
    if (!c.cats.includes(ev.cat)) continue;      // un modérateur ne reçoit pas les logs admin
    try { c.res.write(`event: log\ndata: ${payload}\n\n`); } catch { streams.delete(c); }
  }
}
setInterval(() => {
  for (const c of streams) { try { c.res.write(': ping\n\n'); } catch { streams.delete(c); } }
}, 25000).unref();

/* ---------- ingestion ---------- */
const iEvent = db.prepare(`INSERT INTO events
  (ts,cat,sev,server,actor_key,actor_name,actor_sid,actor_staff,target_key,target_name,msg,data,res,search)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const uPlayer = db.prepare(`INSERT INTO players(key,name,sid,discord,steam,fivem,job,grade,first_seen,last_seen,events)
  VALUES(?,?,?,?,?,?,?,?,?,?,1)
  ON CONFLICT(key) DO UPDATE SET
    name=COALESCE(excluded.name,players.name), sid=COALESCE(excluded.sid,players.sid),
    discord=COALESCE(excluded.discord,players.discord), steam=COALESCE(excluded.steam,players.steam),
    fivem=COALESCE(excluded.fivem,players.fivem), job=COALESCE(excluded.job,players.job),
    grade=COALESCE(excluded.grade,players.grade), last_seen=excluded.last_seen,
    events=players.events+1`);
const iSanction = db.prepare(`INSERT INTO sanctions(player_key,name,type,reason,by_name,created_at,expires_at,active)
  VALUES(?,?,?,?,?,?,?,1)`);
const uLift = db.prepare(`UPDATE sanctions SET active=0, lifted_at=?, lifted_by=? WHERE player_key=? AND type='ban' AND active=1`);

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

function ingest(list, server) {
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const raw of list) {
      const e = normalize(raw, server);
      if (!e.msg) continue;
      const r = iEvent.run(e.ts, e.cat, e.sev, e.server, e.actor_key, e.actor_name, e.actor_sid,
                           e.actor_staff, e.target_key, e.target_name, e.msg, e.data, e.res, e.search);
      const id = DB.num(r.lastInsertRowid);
      if (e.actor_key) {
        const a = e._actor;
        uPlayer.run(e.actor_key, e.actor_name, e.actor_sid, S(a.discord), S(a.steam), S(a.fivem),
                    S(a.job), N(a.grade), e.ts, e.ts);
      }
      // Une sanction reçue du jeu doit exister comme sanction, pas seulement
      // comme ligne de log : c'est elle qui décide d'un refus de connexion.
      if ((e.cat === 'sanctions' || e.cat === 'bans') && e._data && e._data.type) {
        const d = e._data, key = S(d.cibleKey) || e.target_key;
        if (key) {
          if (d.type === 'unban') uLift.run(e.ts, e.actor_name, key);
          else if (['warn', 'kick', 'ban', 'mute'].includes(d.type))
            iSanction.run(key, S(d.cible) || e.target_name, d.type, S(d.motif), e.actor_name,
                          e.ts, N(d.expireAt));
        }
      }
      n++;
      broadcast(outEvent(Object.assign({ id }, e)));
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return n;
}

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
    actor: { name: r.actor_name || 'Système', sid: r.actor_sid, key: r.actor_key,
             staff: !!r.actor_staff, license: showIds ? r.actor_key : null },
    target: r.target_name ? { name: r.target_name, key: r.target_key } : null,
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
  const w = [], a = [];
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
  const base = `FROM events e WHERE e.cat IN ${IN} AND e.ts >= ? AND e.ts <= ?`;
  const A = [...cats, from, to];
  const one = (sql, ...extra) => DB.row(db.prepare(sql).get(...A, ...extra));

  const total    = one(`SELECT COUNT(*) n ${base}`).n;
  const uniques  = one(`SELECT COUNT(DISTINCT e.actor_key) n ${base} AND e.actor_key IS NOT NULL AND e.actor_staff=0`).n;
  const anticheat= one(`SELECT COUNT(*) n ${base} AND e.cat='anticheat'`).n;
  const acCrit   = one(`SELECT COUNT(*) n ${base} AND e.cat='anticheat' AND e.sev='critique'`).n;
  const sanctions= one(`SELECT COUNT(*) n ${base} AND e.cat='sanctions'`).n;
  const alerts   = DB.row(db.prepare(`SELECT COUNT(*) n FROM events e
      LEFT JOIN marks md ON md.event_id=e.id AND md.kind='done'
      WHERE e.cat IN ${IN} AND e.ts >= ? AND e.ts <= ? AND e.sev IN ('critique','alerte') AND md.at IS NULL`).get(...A)).n;

  const span = to - from;
  const prev = DB.row(db.prepare(`SELECT COUNT(*) n FROM events e WHERE e.cat IN ${IN} AND e.ts >= ? AND e.ts < ?`)
                      .get(...cats, from - span, from)).n;

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
      WHERE type='ban' AND active=1 AND (expires_at IS NULL OR expires_at > ?)`).get(now())).n;

  const split = {};
  for (const r of db.prepare(`SELECT e.cat, COUNT(*) n ${base} GROUP BY e.cat`).all(...A)) split[r.cat] = Number(r.n);

  const top = db.prepare(`SELECT e.actor_key k, e.actor_name name, MAX(e.actor_sid) sid, COUNT(*) n ${base}
                          AND e.actor_staff=0 AND e.actor_key IS NOT NULL
                          GROUP BY e.actor_key ORDER BY n DESC LIMIT 6`).all(...A)
              .map(r => ({ key: r.k, name: r.name, sid: r.sid, n: Number(r.n) }));

  const alertRows = db.prepare(`SELECT e.* ${MARKCOLS} FROM events e ${MARKJOIN}
      WHERE e.cat IN ${IN} AND e.ts >= ? AND e.ts <= ? AND e.sev IN ('critique','alerte') AND md.at IS NULL
      ORDER BY e.ts DESC LIMIT 7`).all(...A).map(r => outEvent(DB.row(r), me));

  return { from, to, bucketSize: size, total, prev, uniques, alerts, anticheat, acCrit, sanctions,
           bansActifs, series, seriesBySev, split, top, alertList: alertRows };
}

function playerFile(me, key) {
  const p = DB.row(db.prepare('SELECT * FROM players WHERE key = ?').get(key));
  if (!p) return null;
  const IN = `(${me.cats.map(() => '?').join(',')})`;
  const cnt = sql => DB.row(db.prepare(sql).get(...me.cats, key, key)).n;
  const stats = {
    events:  cnt(`SELECT COUNT(*) n FROM events WHERE cat IN ${IN} AND (actor_key=? OR target_key=?)`),
    sessions:cnt(`SELECT COUNT(*) n FROM events WHERE cat IN ${IN} AND json_extract(data,'$.kind')='join' AND (actor_key=? OR ?='')`),
    kills:   cnt(`SELECT COUNT(*) n FROM events WHERE cat IN ${IN} AND json_extract(data,'$.kind')='kill' AND (actor_key=? OR ?='')`),
    deaths:  cnt(`SELECT COUNT(*) n FROM events WHERE cat IN ${IN} AND ((json_extract(data,'$.kind')='kill' AND target_key=?) OR (json_extract(data,'$.kind')='death' AND actor_key=?))`),
    flags:   cnt(`SELECT COUNT(*) n FROM events WHERE cat IN ${IN} AND cat='anticheat' AND (actor_key=? OR ?='')`)
  };
  const sanctions = db.prepare(`SELECT * FROM sanctions WHERE player_key=? ORDER BY created_at DESC LIMIT 20`)
                      .all(key).map(DB.row);
  const last = db.prepare(`SELECT e.* ${MARKCOLS} FROM events e ${MARKJOIN}
      WHERE e.cat IN ${IN} AND (e.actor_key=? OR e.target_key=?) ORDER BY e.ts DESC LIMIT 20`)
      .all(...me.cats, key, key).map(r => outEvent(DB.row(r), me));
  const ids = me.perms.includes('players.identifiers');
  return {
    player: { key: ids ? p.key : '— masqué —', name: p.name, sid: p.sid, job: p.job, grade: p.grade,
              discord: ids ? p.discord : null, steam: ids ? p.steam : null, fivem: ids ? p.fivem : null,
              firstSeen: p.first_seen, lastSeen: p.last_seen, playtime: p.playtime, events: p.events },
    stats, sanctions, last,
    ban: DB.row(db.prepare(`SELECT * FROM sanctions WHERE player_key=? AND type='ban' AND active=1
                            AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`).get(key, now()))
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
const iAction = db.prepare(`INSERT INTO actions(type,target_key,target_name,target_sid,payload,reason,by_id,by_name,created_at)
                            VALUES(?,?,?,?,?,?,?,?,?)`);

function doAction(me, b, ip) {
  const type = String(b.type || '');
  if (!ACTION_PERM[type]) return { error: 'Action inconnue.' };
  if (!me.perms.includes(ACTION_PERM[type])) return { error: 'Votre rôle ne permet pas cette action.', code: 403 };
  const key = S(b.key), name = S(b.name) || 'Joueur inconnu';
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
  }], 'panel');

  const r = iAction.run(type, key, name, N(b.sid), JSON.stringify(payload), reason, me.id, me.pseudo, now());
  audit(me, 'action.' + type, `${name} (${key}) — ${reason}`, ip);
  return { ok: true, id: DB.num(r.lastInsertRowid), message: 'Action enregistrée et transmise au serveur.' };
}

/* ---------- entretien ---------- */
function purge() {
  const cut = now() - CFG.retention * 86400000;
  const n = db.prepare('DELETE FROM events WHERE ts < ?').run(cut);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  db.prepare(`DELETE FROM actions WHERE status IN ('done','failed') AND created_at < ?`).run(now() - 7 * 86400000);
  db.prepare('DELETE FROM audit WHERE ts < ?').run(now() - 180 * 86400000);
  if (DB.num(n.changes) > 0) {
    db.exec(`INSERT INTO events_fts(events_fts) VALUES('optimize')`);
    console.log(`[purge] ${DB.num(n.changes)} évènement(s) au-delà de ${CFG.retention} jours supprimés`);
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

const serverKeyOk = req => {
  const k = req.headers['x-origin-key'];
  return typeof k === 'string' && k.length === CFG.serverKey.length &&
         crypto.timingSafeEqual(Buffer.from(k), Buffer.from(CFG.serverKey));
};

async function route(req, res) {
  const u = url.parse(req.url, true);
  const p = u.pathname.replace(/\/+$/, '') || '/';
  const Q = u.query;
  const ip = clientIp(req);
  const method = req.method;

  /* ---- dépôt des logs par la ressource FiveM ---- */
  if (p === '/api/ingest' && method === 'POST') {
    if (!serverKeyOk(req)) return fail(res, 401, 'Clé serveur invalide.');
    const b = await readBody(req);
    const list = Array.isArray(b) ? b : (b.events || []);
    if (!Array.isArray(list)) return fail(res, 400, 'Attendu : un tableau d’évènements.');
    const n = ingest(list.slice(0, 500), S(b.server) || 'origin');
    return ok(res, { recus: n });
  }
  if (p === '/api/actions/pending' && method === 'GET') {
    if (!serverKeyOk(req)) return fail(res, 401, 'Clé serveur invalide.');
    const rows = db.prepare(`SELECT * FROM actions WHERE status='pending' ORDER BY created_at LIMIT 25`).all().map(DB.row);
    if (rows.length) {
      const mark = db.prepare(`UPDATE actions SET status='sent' WHERE id=?`);
      for (const r of rows) mark.run(r.id);
    }
    return ok(res, { actions: rows.map(r => ({ id: r.id, type: r.type, key: r.target_key,
      name: r.target_name, sid: r.target_sid, reason: r.reason, by: r.by_name,
      payload: r.payload ? JSON.parse(r.payload) : {} })) });
  }
  if (p === '/api/actions/ack' && method === 'POST') {
    if (!serverKeyOk(req)) return fail(res, 401, 'Clé serveur invalide.');
    const b = await readBody(req);
    db.prepare(`UPDATE actions SET status=?, result=?, done_at=? WHERE id=?`)
      .run(b.ok ? 'done' : 'failed', S(b.result), now(), Number(b.id) || 0);
    return ok(res, { ok: true });
  }
  if (p === '/api/ban-check' && method === 'GET') {
    if (!serverKeyOk(req)) return fail(res, 401, 'Clé serveur invalide.');
    const ids = [Q.key, Q.discord, Q.steam, Q.fivem].filter(Boolean).map(String);
    if (!ids.length) return ok(res, { ban: null });
    const keys = new Set(ids);
    for (const r of db.prepare(`SELECT key FROM players WHERE key IN (${ids.map(() => '?').join(',')})
        OR discord IN (${ids.map(() => '?').join(',')}) OR steam IN (${ids.map(() => '?').join(',')})`)
        .all(...ids, ...ids, ...ids)) keys.add(r.key);
    const list = [...keys];
    const ban = DB.row(db.prepare(`SELECT * FROM sanctions WHERE player_key IN (${list.map(() => '?').join(',')})
        AND type='ban' AND active=1 AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC LIMIT 1`).get(...list, now()));
    return ok(res, { ban });
  }

  /* ---- connexion ---- */
  if (p === '/api/auth/login' && method === 'POST') {
    const wait = AUTH.throttle(ip);
    if (wait) return send(res, 429, { error: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` });
    const b = await readBody(req);
    const pseudo = String(b.pseudo || '').trim();
    const row = DB.row(db.prepare('SELECT * FROM staff WHERE pseudo = ? COLLATE NOCASE').get(pseudo));
    if (!row || row.disabled || !AUTH.verify(String(b.password || ''), row.pass)) {
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
    return send(res, 200, {
      staff: { pseudo: row.pseudo, role: row.role, roleLabel: CAT.roleOf(row.role).label },
      perms: CAT.permsOf(row.role), cats: CAT.catsOf(row.role)
    }, { 'set-cookie': AUTH.cookieHeader('origin_sid', token, { maxAge: CFG.sessionDays * 86400, secure: CFG.secure }) });
  }

  const me = whoami(req);

  if (p === '/api/auth/logout' && method === 'POST') {
    if (me) { qDropSession.run(me.token); audit(me, 'auth.deconnexion', null, ip); }
    return send(res, 200, { ok: true }, { 'set-cookie': AUTH.cookieHeader('origin_sid', '', { clear: true, secure: CFG.secure }) });
  }
  if (p === '/api/auth/me') {
    if (!me) return fail(res, 401, 'Session expirée.');
    return ok(res, { staff: { pseudo: me.pseudo, role: me.role, roleLabel: CAT.roleOf(me.role).label },
                     perms: me.perms, cats: me.cats });
  }
  if (p === '/api/catalogue') {
    return ok(res, { cats: CAT.CATS, sevs: CAT.SEVS, groups: CAT.GROUPS, roles: CAT.ROLES, perms: CAT.PERMS,
                     retention: CFG.retention });
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
    if (p.startsWith('/api/players/') && method === 'GET') {
      if (!need('players.view')) return;
      const key = decodeURIComponent(p.slice('/api/players/'.length));
      const f = playerFile(me, key);
      if (!f) return fail(res, 404, 'Joueur inconnu.');
      audit(me, 'dossier.ouvert', key, ip);
      return ok(res, f);
    }
    if (p === '/api/bans' && method === 'GET') {
      if (!need('logs.view')) return;
      // Le registre n'est pas une relecture du flux : il dit qui est
      // banni MAINTENANT, ce qu'aucune liste d'évènements ne répond.
      const etat = ['actifs', 'expires', 'tous'].includes(Q.state) ? Q.state : 'actifs';
      const t = now();
      const encours = `(active=1 AND (expires_at IS NULL OR expires_at > ${t}))`;
      const filtre = etat === 'actifs' ? `WHERE type='ban' AND ${encours}`
                   : etat === 'expires' ? `WHERE type='ban' AND NOT ${encours}`
                   : `WHERE type='ban'`;
      const rows = db.prepare(`SELECT * FROM sanctions ${filtre} ORDER BY created_at DESC LIMIT 300`).all().map(DB.row);
      const ids = me.perms.includes('players.identifiers');
      const compte = k => DB.row(db.prepare(`SELECT COUNT(*) n FROM sanctions WHERE type='ban' AND ${k}`).get()).n;
      return ok(res, {
        bans: rows.map(b => Object.assign({}, b, {
          player_key: ids ? b.player_key : '— masqué —',
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
      const rows = db.prepare('SELECT * FROM actions ORDER BY created_at DESC LIMIT 100').all().map(DB.row);
      return ok(res, { actions: rows });
    }
    if (p === '/api/audit' && method === 'GET') {
      if (!need('audit.view')) return;
      return ok(res, { audit: db.prepare('SELECT * FROM audit ORDER BY ts DESC LIMIT 200').all().map(DB.row) });
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

    /* ---- comptes staff ---- */
    if (p === '/api/staff') {
      if (!need('accounts.manage')) return;
      if (method === 'GET')
        return ok(res, { staff: db.prepare('SELECT id,pseudo,role,discord,disabled,created_at,last_login FROM staff ORDER BY role DESC, pseudo').all().map(DB.row),
                         roles: Object.entries(CAT.ROLES).map(([id, r]) => ({ id, label: r.label, rank: r.rank })) });
      if (method === 'POST') {
        const b = await readBody(req);
        const pseudo = String(b.pseudo || '').trim();
        const pass = String(b.password || '');
        const role = CAT.ROLES[b.role] ? b.role : 'moderateur';
        if (pseudo.length < 3) return fail(res, 400, 'Pseudo trop court (3 caractères minimum).');
        if (pass.length < 10) return fail(res, 400, 'Mot de passe trop court (10 caractères minimum).');
        if (CAT.roleOf(role).rank > CAT.roleOf(me.role).rank) return fail(res, 403, 'Vous ne pouvez pas créer un rôle supérieur au vôtre.');
        if (DB.row(db.prepare('SELECT id FROM staff WHERE pseudo = ? COLLATE NOCASE').get(pseudo))) return fail(res, 409, 'Ce pseudo existe déjà.');
        db.prepare('INSERT INTO staff(pseudo,pass,role,discord,created_at) VALUES(?,?,?,?,?)')
          .run(pseudo, AUTH.hash(pass), role, S(b.discord), now());
        audit(me, 'staff.creation', `${pseudo} (${role})`, ip);
        return ok(res, { ok: true });
      }
    }
    if (p.startsWith('/api/staff/')) {
      if (!need('accounts.manage')) return;
      const id = Number(p.slice('/api/staff/'.length)) || 0;
      const target = DB.row(db.prepare('SELECT * FROM staff WHERE id=?').get(id));
      if (!target) return fail(res, 404, 'Compte inconnu.');
      if (CAT.roleOf(target.role).rank > CAT.roleOf(me.role).rank) return fail(res, 403, 'Ce compte est au-dessus de votre rôle.');
      if (method === 'PATCH') {
        const b = await readBody(req);
        if (b.role) {
          if (!CAT.ROLES[b.role] || CAT.roleOf(b.role).rank > CAT.roleOf(me.role).rank) return fail(res, 403, 'Rôle refusé.');
          if (target.role === 'fondateur' && b.role !== 'fondateur' &&
              DB.row(db.prepare(`SELECT COUNT(*) n FROM staff WHERE role='fondateur' AND disabled=0`).get()).n <= 1)
            return fail(res, 409, 'Il doit rester au moins un fondateur.');
          db.prepare('UPDATE staff SET role=? WHERE id=?').run(b.role, id);
        }
        if (b.password) {
          if (String(b.password).length < 10) return fail(res, 400, 'Mot de passe trop court (10 caractères minimum).');
          db.prepare('UPDATE staff SET pass=? WHERE id=?').run(AUTH.hash(String(b.password)), id);
          db.prepare('DELETE FROM sessions WHERE staff_id=?').run(id);   // on ferme ses sessions ouvertes
        }
        if (b.disabled !== undefined) {
          if (id === me.id) return fail(res, 400, 'Vous ne pouvez pas désactiver votre propre compte.');
          db.prepare('UPDATE staff SET disabled=? WHERE id=?').run(b.disabled ? 1 : 0, id);
          if (b.disabled) db.prepare('DELETE FROM sessions WHERE staff_id=?').run(id);
        }
        audit(me, 'staff.modification', target.pseudo, ip);
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

    /* ---- flux temps réel ---- */
    if (p === '/api/stream') {
      if (!need('logs.view')) return;
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache',
                           'connection': 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 5000\n\n');
      const client = { res, cats: me.cats };
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
  const staffCount = DB.row(db.prepare('SELECT COUNT(*) n FROM staff').get()).n;
  console.log(`\n  Origin Roleplay — API des journaux`);
  console.log(`  ├─ écoute        http://${CFG.host}:${CFG.port}`);
  console.log(`  ├─ base          ${CFG.dbFile}`);
  console.log(`  ├─ panneau       ${CFG.panelDir}`);
  console.log(`  ├─ rétention     ${CFG.retention} jours`);
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
