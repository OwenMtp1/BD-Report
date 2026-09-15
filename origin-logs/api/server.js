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
  maxBody:    2 * 1024 * 1024,
  // Les captures d'écran sont plus lourdes que tout le reste : elles ont
  // leur propre plafond, et leur propre dossier.
  screenDir:  process.env.SCREEN_DIR || path.join(__dirname, 'data', 'screens'),
  maxScreen:  Number(process.env.MAX_SCREEN_MB || 6) * 1024 * 1024,
  screenDays: Number(process.env.SCREEN_DAYS || 0),   // 0 = même rétention que les journaux
  // Espace disque maximal occupé par les captures d'UN espace.
  screenQuotaMb: Number(process.env.SCREEN_QUOTA_MB || 2048),
  // Derrière le reverse proxy du guide : TRUST_PROXY=1. Sinon l'API lirait
  // une adresse que le client choisit lui-même (cf. clientIp).
  trustProxy: process.env.TRUST_PROXY === '1',
  // Adresse publique du panneau, si vous la connaissez : elle fige l'URL
  // de retour OAuth et la vérification d'origine (ex. https://logs.mon-rp.fr).
  publicUrl: String(process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  // Plafonds de dépôt, par espace et par minute.
  maxIngestMin: Number(process.env.MAX_INGEST_PER_MIN || 120),
  maxScreenMin: Number(process.env.MAX_SCREENS_PER_MIN || 20),
  // Revérification automatique des accès Discord, en tâche de fond.
  sweepMin:   Number(process.env.ACCESS_SWEEP_MIN || 30)
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

/* ⚠️ `Host` et `X-Forwarded-*` viennent du CLIENT. On s'en sert pour
   fabriquer l'URL de retour OAuth et pour vérifier l'origine d'une
   écriture : un en-tête forgé pouvait donc influencer les deux.
   · PUBLIC_URL, quand elle est renseignée, tranche la question une fois
     pour toutes — c'est le réglage à privilégier en production ;
   · les en-têtes du proxy ne sont lus que si TRUST_PROXY=1 ;
   · à défaut, l'en-tête Host, qui reste ce que le navigateur envoie
     réellement pour joindre la machine. */
function originOf(req) {
  if (CFG.publicUrl) return CFG.publicUrl;
  const proto = (CFG.trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0])
             || (CFG.secure ? 'https' : 'http');
  const host = (CFG.trustProxy && req.headers['x-forwarded-host'])
            || req.headers.host || ('localhost:' + CFG.port);
  return proto + '://' + host;
}
const redirectUriOf = (c, req) => c.redirectUri || (originOf(req) + '/api/auth/discord/callback');

/* ---------- réponses ---------- */
const SEC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
};

const JSONH = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
function send(res, code, obj, extra) {
  const body = JSON.stringify(obj);
  // Les en-têtes de sécurité ne servaient qu'aux fichiers : une réponse
  // JSON ouverte directement dans un onglet repartait sans `nosniff` ni
  // `frame-ancestors`. Ils s'appliquent partout — c'est une réponse de la
  // même application.
  res.writeHead(code, Object.assign({}, JSONH, SEC_HEADERS, extra || {}));
  res.end(body);
}
const ok   = (res, o) => send(res, 200, o);
const fail = (res, code, msg) => send(res, code, { error: msg });

/* ⚠️ `X-Forwarded-For` EST UN EN-TÊTE, donc une donnée fournie par le
   client. S'y fier sans condition rendait le frein anti-force-brute
   décoratif : il suffisait de changer l'en-tête à chaque tentative pour
   repartir de zéro. On ne le lit donc QUE si TRUST_PROXY=1 le dit — à
   mettre quand l'API est derrière le reverse proxy du guide, qui écrase
   l'en-tête au lieu de le compléter. Par défaut : l'adresse de la
   socket, la seule que le client ne choisit pas. */
function clientIp(req) {
  if (CFG.trustProxy) {
    const f = req.headers['x-forwarded-for'];
    if (f) return String(f).split(',')[0].trim();
  }
  return (req.socket.remoteAddress || '').trim();
}

/* ---------- limites de débit ----------
   ⚠️ Une clé d'ingestion qui fuite ne doit pas pouvoir remplir le disque.
   Le dépôt de journaux et celui des captures n'avaient AUCUNE limite :
   la seule chose qui les freinait était la purge, toutes les six heures.
   Compteur glissant par espace, en mémoire — il n'a pas à survivre à un
   redémarrage, il a à tenir pendant une rafale. */
const seaux = new Map();
function debit(cle, max, fenetreMs) {
  const t = now();
  let e = seaux.get(cle);
  if (!e || t - e.debut > fenetreMs) { e = { debut: t, n: 0 }; seaux.set(cle, e); }
  e.n++;
  if (seaux.size > 5000) for (const [k, v] of seaux) if (t - v.debut > fenetreMs) seaux.delete(k);
  return e.n <= max ? 0 : Math.ceil((e.debut + fenetreMs - t) / 1000);
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

/* ============================================================
   CAPTURES D'ÉCRAN
   Le panneau ne commande jamais le serveur de jeu : il dépose une
   tâche, la ressource vient la chercher, prend la capture et la
   RENVOIE ici. L'image finit sur le disque, jamais dans la base —
   une image en base64 dans SQLite gonfle chaque sauvegarde et
   chaque requête qui la survole.
   ============================================================ */
function screenPath(spaceId, nom) { return path.join(CFG.screenDir, String(spaceId), nom); }

// Corps binaire : la capture arrive telle quelle, sans enveloppe JSON
// (un JPEG encodé en base64 dans du JSON pèse un tiers de plus, pour rien).
function readBinary(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) { reject(new Error('capture trop volumineuse')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Le type se lit dans les premiers octets, pas dans l'en-tête annoncé :
// un client peut se tromper, et on ne sert que ce qu'on a reconnu.
function typeImage(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0,4).toString() === 'RIFF' && buf.slice(8,12).toString() === 'WEBP') return 'image/webp';
  return null;
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
  // ⚠️ L'ADMINISTRATION DE PLATEFORME N'A AUCUN ESPACE PAR DÉFAUT.
  // Elle surveille des espaces, elle n'en habite aucun : le compte a beau
  // être né dans l'espace 1, s'y trouver « déjà » à la connexion lui ferait
  // lire un flux de modération qui n'est pas son travail, et modérer un
  // serveur client sans l'avoir décidé. Son espace courant est donc
  // EXACTEMENT celui qu'elle a demandé (la visite), et rien sinon.
  // Pour tous les autres, l'espace du compte reste l'espace courant.
  const spaceId = r.visite ? Number(r.visite) : (platform ? null : Number(r.space_id || 1));
  const esp = spaceId ? DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId)) : null;
  if (r.source === 'discord' && !manuels.length) refreshRolesSoon(r);

  // Hors espace, les rôles de l'espace 1 ne veulent rien dire : on résout
  // sur l'espace courant quand il y en a un, et on s'en passe sinon —
  // l'administration de plateforme tient ses droits de son statut, pas
  // d'un rôle emprunté à un client.
  const res = spaceId ? ROLESVC.resolve(db, spaceId, roles)
                      : { keys: [], labels: [], perms: [], cats: [], rank: 0, main: null };
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
           spaceId, space: esp,
           // Un administrateur de plateforme est TOUJOURS en visite : il
           // n'a pas d'espace à lui, seulement celui où il est entré.
           visiting: platform ? !!r.visite : (!!r.visite && Number(r.visite) !== Number(r.space_id)),
           homeSpaceId: platform ? null : Number(r.space_id || 1),
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
      audit(null, 'discord.revocation', `${r.pseudo} — ${v.raison}`, null, Number(r.space_id || 1));
      console.log(`[discord] ${r.pseudo} a perdu son accès (${v.raison}) — sessions fermées`);
      return;
    }
    const avant = r.roles || '[]';
    const apres = JSON.stringify(v.roles);
    if (avant !== apres) {
      db.prepare('UPDATE staff SET roles = ?, role = ? WHERE id = ?').run(apres, v.roles[0], r.id);
      audit(null, 'discord.roles', `${r.pseudo} → ${v.roles.join(', ')}`, null, Number(r.space_id || 1));
    }
  }).catch(e => console.error('[discord] revérification impossible :', e.message))
    .finally(() => enVol.delete(r.id));
}
const iAudit = db.prepare('INSERT INTO audit(ts,staff_id,pseudo,action,detail,ip,space_id) VALUES(?,?,?,?,?,?,?)');
// space_id = 0 : geste posé AU-DESSUS des espaces, par l'administration de
// la plateforme hors de tout espace. Le rattacher d'office à l'espace 1
// ferait lire « chez Origin Roleplay » une décision qui ne le concernait
// pas. La colonne est NOT NULL depuis l'origine, d'où le 0 plutôt qu'un NULL.
const audit = (me, action, detail, ip, spaceId) =>
  iAudit.run(now(), me ? me.id : null, me ? me.pseudo : null, action,
             detail ? String(detail).slice(0, 400) : null, ip || null,
             Number(spaceId != null ? spaceId : (me && me.spaceId) || 0));

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

/* ============================================================
   REVÉRIFICATION AUTOMATIQUE DES ACCÈS
   ⚠️ LA REVÉRIFICATION À LA DEMANDE NE SUFFIT PAS. `refreshRolesSoon`
   ne part que lorsque la personne fait une requête : quelqu'un qui a
   perdu son rôle staff sur Discord et qui n'ouvre plus le panneau
   gardait un compte actif indéfiniment — et une session valide sept
   jours durant, prête à servir. C'est exactement le cas qu'on veut
   fermer : celui de la personne qui part.
   Ce balayage passe donc en revue TOUS les comptes venus de Discord,
   qu'ils se connectent ou non.
   ============================================================ */
const SWEEP = { enCours: false, dernier: 0, verifies: 0, retires: 0, erreurs: 0, duree: 0, prochain: 0 };

async function balayerAcces(raison) {
  if (SWEEP.enCours) return SWEEP;
  if (!discordGlobalOk()) { SWEEP.dernier = now(); SWEEP.erreurs = 0; return SWEEP; }
  SWEEP.enCours = true;
  const debut = now();
  let verifies = 0, retires = 0, erreurs = 0;
  try {
    for (const sp of db.prepare("SELECT * FROM spaces WHERE state = 'actif'").all().map(DB.row)) {
      const c = dconfFor(sp);
      // Sans serveur Discord ni rôle staff, il n'y a rien à vérifier —
      // et surtout rien à conclure : on ne retire l'accès de personne
      // au prétexte qu'un espace n'est pas encore relié.
      if (!c.guildId || !c.staffRoleId || !c.botToken) continue;
      const comptes = db.prepare(`SELECT * FROM staff WHERE space_id = ? AND source = 'discord'
                                  AND disabled = 0 AND discord_id IS NOT NULL`).all(sp.id).map(DB.row);
      for (const r of comptes) {
        try {
          const v = await verdictEspace(c, sp, r.discord_id);
          verifies++;
          if (!v.ok) {
            db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(r.id);
            db.prepare('UPDATE staff SET disabled = 1, roles_checked_at = ? WHERE id = ?').run(now(), r.id);
            audit(null, 'discord.revocation', `${r.pseudo} — ${v.raison} (balayage ${raison})`, null, sp.id);
            console.log(`[acces] ${r.pseudo} a perdu son accès (${v.raison}) — sessions fermées`);
            retires++;
            continue;
          }
          // Toujours là, mais peut-être plus avec les mêmes rôles : on
          // reporte le changement au lieu de le découvrir à sa prochaine
          // connexion. Les rôles posés À LA MAIN sont une décision, et le
          // balayage ne les défait pas.
          const manuels = parseRoles(r.manual_roles);
          const apres = JSON.stringify(v.roles);
          if (!manuels.length && (r.roles || '[]') !== apres) {
            db.prepare('UPDATE staff SET roles = ?, role = ? WHERE id = ?').run(apres, v.roles[0], r.id);
            audit(null, 'discord.roles', `${r.pseudo} → ${v.roles.join(', ')} (balayage)`, null, sp.id);
          }
          db.prepare('UPDATE staff SET roles_checked_at = ? WHERE id = ?').run(now(), r.id);
        } catch (e) {
          // Discord injoignable : on NE RETIRE RIEN. Confondre « le bot
          // n'a pas répondu » avec « cette personne n'est plus staff »
          // couperait toute l'équipe à la première panne réseau.
          erreurs++;
          console.error(`[acces] ${r.pseudo} : vérification impossible — ${e.message}`);
        }
        await new Promise(r2 => setTimeout(r2, 120));   // on ménage l'API Discord
      }
    }
  } finally {
    Object.assign(SWEEP, { enCours: false, dernier: now(), verifies, retires, erreurs,
                           duree: now() - debut, prochain: now() + CFG.sweepMin * 60000 });
  }
  if (verifies) console.log(`[acces] balayage ${raison} : ${verifies} compte(s) vérifié(s), ${retires} retiré(s)` +
                            (erreurs ? `, ${erreurs} non vérifiable(s)` : ''));
  return SWEEP;
}

/* ---------- comptes issus de Discord ----------
   Le pseudo affiché vient de Discord ; en cas de collision avec un
   compte local, on suffixe plutôt que d'écraser le compte de quelqu'un. */
function pseudoLibre(base, discordId, spaceId) {
  const propre = String(base || 'staff').replace(/\s+/g, ' ').trim().slice(0, 28) || 'staff';
  // ⚠️ La collision ne se juge que DANS L'ESPACE : suffixer parce qu'un
  // autre serveur a déjà un « Nyx » affublerait quelqu'un d'un numéro à
  // cause d'une équipe qu'il ne connaît pas — et le lui apprendrait.
  const pris = p => DB.row(db.prepare(`SELECT id FROM staff WHERE pseudo = ? COLLATE NOCASE
    AND space_id = ? AND (discord_id IS NULL OR discord_id <> ?)`).get(p, spaceId, discordId));
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
      .run(pseudoLibre(nom, user.id, spaceId), S(user.avatar), roles, principal, now(), now(),
           'discord:' + user.id, existant.id);
    return DB.row(db.prepare('SELECT * FROM staff WHERE id = ?').get(existant.id));
  }
  // Le mot de passe est volontairement inutilisable : ce compte
  // n'entre que par Discord, et AUTH.verify refuse cette valeur.
  const r = db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,discord,discord_id,avatar,source,created_at,roles_checked_at,last_login,space_id)
                        VALUES(?,?,?,?,?,?,?, 'discord', ?,?,?,?)`)
    .run(pseudoLibre(nom, user.id, spaceId), 'discord', principal, roles,
         'discord:' + user.id, user.id, S(user.avatar), now(), now(), now(), spaceId);
  return DB.row(db.prepare('SELECT * FROM staff WHERE id = ?').get(DB.num(r.lastInsertRowid)));
}
function ouvrirSession(res, compte, req) {
  const token = AUTH.newToken(), exp = now() + CFG.sessionDays * 86400000;
  // La visite reste VIDE pour l'administration de plateforme : entrer dans
  // un espace est un geste, y compris quand on arrive par Discord.
  const visite = compte.platform_admin ? null : (compte.space_id || 1);
  db.prepare('INSERT INTO sessions(token,staff_id,created_at,expires_at,ua,space_id) VALUES(?,?,?,?,?,?)')
    .run(token, compte.id, now(), exp, String(req.headers['user-agent'] || '').slice(0, 200), visite);
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
  const cat = CAT.canonCat(raw.cat);
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
                      unban:'actions.unban', give:'actions.give',
                      // Regarder l'écran de quelqu'un est une action de
                      // modération comme une autre : elle porte un motif,
                      // elle s'inscrit au journal, et elle est traçable.
                      screenshot:'screens.request' };
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
    type === 'screenshot' ? `${me.pseudo} a demandé une capture de l’écran de ${name} — ${reason}` :
    type === 'warn'  ? `${me.pseudo} a averti ${name} — ${reason}` :
    type === 'kick'  ? `${me.pseudo} a expulsé ${name} — ${reason}` :
    type === 'ban'   ? `${me.pseudo} a banni ${name} ${days ? 'pour ' + days + ' jour(s)' : 'définitivement'} — ${reason}` :
    type === 'unban' ? `${me.pseudo} a levé le bannissement de ${name}` :
                       `${me.pseudo} a rendu ${payload.label || 'un objet'} à ${name}`;

  ingest([{
    ts: now(),
    cat: type === 'screenshot' ? 'ecran_joueur' : type === 'give' ? 'admin'
       : (type === 'ban' || type === 'unban') ? 'bans' : 'sanctions',
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
  // Les captures suivent la même rétention, et leur FICHIER part avec la
  // ligne : effacer l'une sans l'autre laisserait soit des images que rien
  // ne référence, soit des vignettes qui ne s'ouvrent plus.
  for (const sp of db.prepare('SELECT id, retention FROM spaces').all()) {
    const jours = CFG.screenDays || Number(sp.retention) || CFG.retention;
    const vieilles = db.prepare('SELECT id, file FROM screens WHERE space_id = ? AND taken_at < ?')
      .all(sp.id, now() - jours * 86400000).map(DB.row);
    for (const sc of vieilles) {
      try { fs.unlinkSync(screenPath(sp.id, sc.file)); } catch (e) {}
      db.prepare('DELETE FROM screens WHERE id = ?').run(sc.id);
    }
    if (vieilles.length) console.log(`[purge] ${vieilles.length} capture(s) d'écran supprimée(s) — espace ${sp.id}`);
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
    if (!esp) {
      // Une clé fausse coûte quand même une lecture en base : on freine
      // aussi celui qui en essaie beaucoup.
      if (debit('cle:' + ip, 30, 60000)) return fail(res, 429, 'Trop de tentatives.');
      return fail(res, 401, 'Clé serveur invalide ou espace fermé.');
    }
    // ⚠️ AVANT de lire le corps : refuser après l'avoir absorbé aurait
    // quand même fait passer deux mégaoctets par la machine à chaque coup.
    const attente = debit('ingest:' + esp.id, CFG.maxIngestMin, 60000);
    if (attente) {
      res.setHeader('retry-after', String(attente));
      return fail(res, 429, `Trop de dépôts pour cet espace. Réessayez dans ${attente} s.`);
    }
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
  /* ---- dépôt d'une capture par la ressource FiveM ---- */
  if (p === '/api/screens' && method === 'POST') {
    const esp = spaceFromKey(req);
    if (!esp) {
      if (debit('cle:' + ip, 30, 60000)) return fail(res, 429, 'Trop de tentatives.');
      return fail(res, 401, 'Clé serveur invalide ou espace fermé.');
    }
    const att = debit('screens:' + esp.id, CFG.maxScreenMin, 60000);
    if (att) {
      res.setHeader('retry-after', String(att));
      return fail(res, 429, `Trop de captures pour cet espace. Réessayez dans ${att} s.`);
    }
    // ⚠️ Un plafond par minute ne protège pas d'une accumulation lente :
    // vingt captures par minute finissent par remplir un disque. Le quota,
    // lui, borne le TOTAL — et il REFUSE plutôt que d'effacer d'anciennes
    // captures, qui sont peut-être justement celles d'une enquête.
    const occupe = DB.row(db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM screens WHERE space_id = ?').get(esp.id)).n;
    if (occupe >= CFG.screenQuotaMb * 1048576)
      return fail(res, 507, `Quota de captures atteint pour cet espace (${CFG.screenQuotaMb} Mo). ` +
                            `Baissez la rétention ou augmentez SCREEN_QUOTA_MB.`);
    let buf;
    try { buf = await readBinary(req, CFG.maxScreen); }
    catch (e) { return fail(res, 413, 'Capture trop volumineuse (plafond ' + Math.round(CFG.maxScreen / 1048576) + ' Mo).'); }
    // La ressource envoie du base64 : c'est ce que screenshot-basic rend
    // (une data-uri), et le décoder ici évite d'écrire un analyseur de
    // multipart pour transporter un seul fichier.
    if (String(req.headers['x-screen-encoding'] || '').toLowerCase() === 'base64') {
      const txt = buf.toString('ascii').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
      buf = Buffer.from(txt, 'base64');
    }
    const mime = typeImage(buf);
    if (!mime) return fail(res, 415, 'Ce n’est pas une image JPEG, PNG ou WebP.');

    // Le contexte voyage en en-têtes : le corps, lui, n'est que l'image.
    const H = n => S(req.headers[n]);
    const actionId = Number(H('x-screen-action')) || null;
    const a = actionId ? DB.row(db.prepare('SELECT * FROM actions WHERE id=? AND space_id=?').get(actionId, esp.id)) : null;
    const key  = a ? a.target_key  : S(H('x-screen-key'));
    const nom  = a ? a.target_name : (S(H('x-screen-name')) || 'Joueur inconnu');
    const sid  = a ? a.target_sid  : (Number(H('x-screen-sid')) || null);
    const par  = a ? a.by_name     : 'serveur de jeu';
    const motif= a ? a.reason      : S(H('x-screen-reason'));

    const dossier = path.join(CFG.screenDir, String(esp.id));
    // ⚠️ L'écran d'un joueur est une donnée personnelle : le dossier et
    // les fichiers sont lisibles par le SEUL compte qui fait tourner
    // l'API. Par défaut, umask laisserait tout le monde les lire sur la
    // machine — y compris un autre service mal isolé.
    try { fs.mkdirSync(dossier, { recursive: true, mode: 0o700 }); } catch (e) {}
    try { fs.chmodSync(dossier, 0o700); } catch (e) {}
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const nomFichier = now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
    try { fs.writeFileSync(path.join(dossier, nomFichier), buf, { mode: 0o600 }); }
    catch (e) { return fail(res, 500, 'Écriture impossible : ' + e.message); }

    const r = db.prepare(`INSERT INTO screens(space_id,action_id,player_key,player_name,player_sid,
                            asked_by,reason,asked_at,taken_at,mime,bytes,width,height,file)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(esp.id, actionId, key || null, nom, sid, par, motif || null,
           a ? a.created_at : null, now(), mime, buf.length,
           Number(H('x-screen-width')) || null, Number(H('x-screen-height')) || null, nomFichier);
    const id = DB.num(r.lastInsertRowid);

    // La capture devient un ÉVÈNEMENT : sans cela elle n'existerait que
    // dans une table que personne ne regarde.
    ingest([{
      ts: now(), cat: 'ecran_joueur', sev: 'notice',
      actor: { name: nom, key: key || undefined, sid },
      msg: `Capture de l’écran de ${nom}` + (par ? ` — demandée par ${par}` : ''),
      res: 'screenshot-basic',
      data: { kind: 'screenshot', capture: id, demandePar: par || null, motif: motif || null,
              poids: Math.round(buf.length / 1024) + ' Ko', format: mime,
              dimensions: (Number(H('x-screen-width')) || '?') + '×' + (Number(H('x-screen-height')) || '?') }
    }], 'panel', esp.id);
    if (actionId) db.prepare(`UPDATE actions SET status='done', result=?, done_at=? WHERE id=? AND space_id=?`)
      .run('capture #' + id, now(), actionId, esp.id);
    return ok(res, { ok: true, id });
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
    const b = await readBody(req);
    const pseudo = String(b.pseudo || '').trim();
    // ⚠️ Deux freins, pas un. Par IP seule, il suffit de changer d'adresse
    // (ou, API exposée en direct, d'en-tête) pour repartir de zéro ; par
    // COMPTE, l'essai en force sur un pseudo connu ralentit quoi qu'il
    // arrive, d'où que viennent les tentatives.
    const wait = Math.max(AUTH.throttle(ip), AUTH.throttle('compte:' + pseudo.toLowerCase()));
    if (wait) return send(res, 429, { error: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` });
    // ⚠️ LE PSEUDO N'EST PLUS UNIQUE QUE DANS SON ESPACE : deux serveurs
    // peuvent chacun avoir leur « Nyx ». La connexion doit donc départager
    // les candidats — et n'accepter QUE si le mot de passe en désigne
    // exactement un. Prendre le premier qui correspond ouvrirait la porte
    // du mauvais espace à qui partage un pseudo ET un mot de passe.
    const candidats = db.prepare(`SELECT * FROM staff WHERE pseudo = ? COLLATE NOCASE
                                  ORDER BY id LIMIT 8`).all(pseudo).map(DB.row);
    const bons = candidats.filter(c => !c.disabled && c.source !== 'discord'
                                       && AUTH.verify(String(b.password || ''), c.pass));
    if (bons.length > 1) {
      AUTH.noteFail(ip); AUTH.noteFail('compte:' + pseudo.toLowerCase());
      audit(null, 'auth.ambigu', pseudo, ip, Number(bons[0].space_id || 1));
      return fail(res, 409, 'Ce pseudo existe dans plusieurs espaces avec ce mot de passe. ' +
                            'Demandez à votre administration un pseudo ou un mot de passe distinct.');
    }
    const row = bons[0];
    if (!row) {
      AUTH.noteFail(ip); AUTH.noteFail('compte:' + pseudo.toLowerCase());
      // On ne dit pas si le pseudo existe : un refus qui distingue
      // « inconnu » de « mauvais mot de passe » énumère les comptes — et,
      // entre espaces, révèle qui est staff ailleurs.
      audit(null, 'auth.echec', pseudo, ip, Number((candidats[0] && candidats[0].space_id) || 1));
      return fail(res, 401, 'Pseudo ou mot de passe incorrect.');
    }
    AUTH.clearFails(ip); AUTH.clearFails('compte:' + pseudo.toLowerCase());
    const token = AUTH.newToken(), exp = now() + CFG.sessionDays * 86400000;
    db.prepare('INSERT INTO sessions(token,staff_id,created_at,expires_at,ua) VALUES(?,?,?,?,?)')
      .run(token, row.id, now(), exp, String(req.headers['user-agent'] || '').slice(0, 200));
    db.prepare('UPDATE staff SET last_login=? WHERE id=?').run(now(), row.id);
    audit({ id: row.id, pseudo: row.pseudo }, 'auth.connexion', null, ip, Number(row.space_id || 1));
    const manuels = parseRoles(row.manual_roles);
    const sesRoles = manuels.length ? manuels : (parseRoles(row.roles).length ? parseRoles(row.roles) : [CAT.canon(row.role)]);
    const platform = !!row.platform_admin;
    const spId = Number(row.space_id || 1);
    const rr = ROLESVC.resolve(db, spId, sesRoles);
    // Même règle qu'à la reprise de session : l'administration de plateforme
    // se connecte HORS de tout espace. La session naît donc sans visite.
    const esp = platform ? null : DB.row(db.prepare('SELECT * FROM spaces WHERE id = ?').get(spId));
    return send(res, 200, {
      staff: { pseudo: row.pseudo, role: rr.main ? rr.main.key : sesRoles[0],
               roleLabel: rr.main ? rr.main.label : sesRoles[0],
               roles: rr.labels, source: row.source || 'local',
               manuel: manuels.length > 0, plateforme: platform },
      espace: esp ? { id: esp.id, nom: esp.name, etat: esp.state, visite: false, monEspace: esp.id } : null,
      plateforme: platform,
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
    // ⚠️ SANS SESSION, AUCUN RÔLE. La page de connexion a besoin des
    // rubriques et des gravités pour s'afficher, pas de votre
    // organigramme : livrer les rôles de l'espace 1 à un visiteur
    // anonyme lui apprenait vos grades, leurs droits et leurs rangs.
    const sp = me ? me.spaceId : 0;
    return ok(res, {
      cats: CAT.CATS, sevs: CAT.SEVS, groups: CAT.GROUPS, perms: CAT.PERMS,
      roles: sp ? ROLESVC.list(db, sp).map(r => ({ id: r.key, label: r.label, rank: r.rank,
        desc: r.desc, perms: r.perms, cats: r.cats })) : [],
      espace: me && me.space ? { id: me.space.id, nom: me.space.name, etat: me.space.state } : null,
      retention: (me && me.space && me.space.retention) || CFG.retention });
  }

  if (p.startsWith('/api/')) {
    if (!me) return fail(res, 401, 'Connexion requise.');
    // ⚠️ `SameSite=Lax` bloque déjà l'écriture depuis un autre site, mais
    // c'était la SEULE couche : un navigateur ancien, une extension, un
    // sous-domaine compromis, et la protection tombait avec elle. Une
    // écriture doit venir de notre propre page — l'origine le dit, et
    // elle ne peut pas être forgée par un script tiers.
    if (method !== 'GET' && method !== 'HEAD') {
      const o = req.headers.origin;
      // ⚠️ On refuse ce qui vient d'AILLEURS, pas ce qui n'emprunte pas
      // l'adresse canonique. `PUBLIC_URL` sert à composer des liens ; s'en
      // servir seule ici couperait toute écriture faite depuis
      // « http://127.0.0.1:8080 » ou depuis l'IP de la machine — c'est-à-dire
      // pendant l'installation, et à chaque fois qu'on ouvre le panneau
      // autrement que par le domaine.
      const hote = (CFG.secure ? 'https://' : 'http://') + (req.headers.host || '');
      const admis = [CFG.publicUrl, hote, 'http://' + (req.headers.host || ''),
                     'https://' + (req.headers.host || '')].filter(Boolean);
      if (o && !admis.includes(o)) {
        audit(me, 'securite.origine', `${method} ${p} depuis ${o}`, ip);
        return fail(res, 403, 'Origine refusée.');
      }
    }
    // ⚠️ SANS ESPACE COURANT, LES ROUTES D'ESPACE N'ONT PAS DE RÉPONSE.
    // Un administrateur de plateforme qui n'est entré nulle part n'a ni
    // flux, ni joueurs, ni registre : ce ne sont pas des données vides,
    // c'est une question sans sujet. Se replier sur l'espace 1 aurait
    // servi les journaux d'un client au hasard. Seules restent la
    // supervision, l'identité et la déconnexion.
    if (!me.spaceId && !p.startsWith('/api/platform') && !p.startsWith('/api/auth'))
      return fail(res, 409, 'Entrez d’abord dans un espace de logs.');
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

    /* ---- captures d'écran ---- */
    if (p === '/api/screens' && method === 'GET') {
      if (!need('logs.view')) return;
      // Une capture appartient à la rubrique « Écran du joueur » : un rôle
      // qui ne la voit pas dans le flux ne la verra pas non plus ici.
      if (!me.cats.includes('ecran_joueur')) return fail(res, 403, 'Votre rôle ne donne pas accès à « Écran du joueur ».');
      const w = ['space_id = ?'], a = [me.spaceId];
      if (Q.key)  { w.push('player_key = ?'); a.push(resolveKey(S(Q.key), me.spaceId)); }
      if (Q.q)    { w.push('(player_name LIKE ? OR asked_by LIKE ? OR reason LIKE ?)');
                    const t = '%' + S(Q.q) + '%'; a.push(t, t, t); }
      const limite = Math.min(200, Math.max(1, N(Q.limit) || 60));
      const rows = db.prepare(`SELECT * FROM screens WHERE ${w.join(' AND ')}
                               ORDER BY taken_at DESC LIMIT ?`).all(...a, limite).map(DB.row);
      const ids = me.perms.includes('players.identifiers');
      return ok(res, {
        captures: rows.map(r => ({ id: r.id, joueur: r.player_name, sid: r.player_sid,
          cle: r.player_key ? (ids ? r.player_key : aliasOf(r.player_key)) : null,
          par: r.asked_by, motif: r.reason, demandeeA: r.asked_at, priseA: r.taken_at,
          poids: r.bytes, largeur: r.width, hauteur: r.height,
          delai: r.asked_at ? r.taken_at - r.asked_at : null })),
        total: DB.row(db.prepare(`SELECT COUNT(*) n FROM screens WHERE ${w.join(' AND ')}`).get(...a)).n
      });
    }
    if (p.startsWith('/api/screens/') && method === 'GET') {
      if (!need('logs.view')) return;
      if (!me.cats.includes('ecran_joueur')) return fail(res, 403, 'Votre rôle ne donne pas accès à « Écran du joueur ».');
      const id = Number(p.slice('/api/screens/'.length)) || 0;
      const r = DB.row(db.prepare('SELECT * FROM screens WHERE id=? AND space_id=?').get(id, me.spaceId));
      if (!r) return fail(res, 404, 'Capture introuvable.');
      let buf;
      try { buf = fs.readFileSync(screenPath(r.space_id, r.file)); }
      catch (e) { return fail(res, 410, 'Le fichier de cette capture n’est plus sur le disque.'); }
      // Consulter l'écran de quelqu'un se trace, même en lecture : c'est
      // le seul moyen de répondre à « qui a regardé, et quand ? ».
      audit(me, 'screen.vue', `capture #${id} — ${r.player_name}`, ip);
      // ⚠️ On sert une image DÉPOSÉE PAR UN TIERS : `nosniff` empêche le
      // navigateur de la réinterpréter comme autre chose, et
      // `Content-Disposition: inline` avec un nom neutre évite qu'un nom
      // de fichier choisi ailleurs se retrouve dans le téléchargement.
      res.writeHead(200, Object.assign({}, SEC_HEADERS, {
        'content-type': r.mime, 'content-length': buf.length,
        'content-disposition': `inline; filename="capture-${id}.${(r.mime.split('/')[1] || 'jpg')}"`,
        'cache-control': 'private, no-store' }));
      return res.end(buf);
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
      // ⚠️ La recherche se fait en SQL, pas sur les 300 lignes rendues :
      // un registre plus long que la fenêtre d'affichage laisserait
      // introuvable ce qui n'y tient pas — et c'est justement quand il est
      // long qu'on cherche.
      const terme = String(Q.q || '').trim().slice(0, 120);
      const rech = terme ? ` AND (name LIKE ? OR reason LIKE ? OR by_name LIKE ? OR player_key LIKE ?)` : '';
      const argsRech = terme ? Array(4).fill('%' + terme + '%') : [];
      const rows = db.prepare(`SELECT * FROM sanctions ${filtre}${rech} ORDER BY created_at DESC LIMIT 300`)
                     .all(me.spaceId, ...argsRech).map(DB.row);
      const ids = me.perms.includes('players.identifiers');
      const compte = k => DB.row(db.prepare(`SELECT COUNT(*) n FROM sanctions WHERE space_id=? AND type='ban' AND ${k}`).get(me.spaceId)).n;
      return ok(res, {
        bans: rows.map(b => Object.assign({}, b, {
          player_key: keyFor(me, b.player_key),
          encours: b.active === 1 && (!b.expires_at || b.expires_at > t)
        })),
        // Les compteurs des onglets restent ceux du REGISTRE ENTIER : ils
        // disent combien de bannissements existent, pas combien la
        // recherche en cours laisse passer. `trouves` porte le second.
        counts: { actifs: compte(encours), expires: compte('NOT ' + encours), tous: compte('1=1') },
        recherche: terme || null, trouves: rows.length
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
        const role = ROLESVC.byKey(db, me.spaceId, b.role) ? b.role : ROLESVC.basRole(db, me.spaceId);
        if (!role) return fail(res, 409, 'Cet espace n’a aucun rôle : créez-en un avant d’ajouter un compte.');
        if (pseudo.length < 3) return fail(res, 400, 'Pseudo trop court (3 caractères minimum).');
        if (pass.length < 10) return fail(res, 400, 'Mot de passe trop court (10 caractères minimum).');
        const r = ROLESVC.byKey(db, me.spaceId, role);
        if (r.rank >= me.plafond) return fail(res, 403, 'Vous ne pouvez pas créer un rôle supérieur ou égal au vôtre.');
        if (DB.row(db.prepare('SELECT id FROM staff WHERE pseudo = ? COLLATE NOCASE AND space_id = ?')
              .get(pseudo, me.spaceId)))
          return fail(res, 409, 'Ce pseudo existe déjà dans cet espace.');
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

      /* ---- tableau de bord de la plateforme ----
         L'administration ne modère pas un serveur de jeu : elle SUIT
         des espaces. Ce qu'elle regarde, ce sont des signes de vie,
         pas des messages de proximité. */
      if (p === '/api/platform/overview' && method === 'GET') {
        const spaces = db.prepare('SELECT * FROM spaces ORDER BY state, name').all().map(DB.row);
        const d24 = now() - 86400000;
        const parEspace = spaces.map(sp => {
          const un = (sql, ...a) => DB.row(db.prepare(sql).get(sp.id, ...a)).n;
          const dernier = DB.row(db.prepare('SELECT MAX(ts) t FROM events WHERE space_id = ?').get(sp.id));
          const relies = ROLESVC.list(db, sp.id).filter(r => r.discordRoleId).length;
          return {
            id: sp.id, nom: sp.name, etat: sp.state,
            evenements24: un('SELECT COUNT(*) n FROM events WHERE space_id = ? AND ts >= ?', d24),
            evenements: un('SELECT COUNT(*) n FROM events WHERE space_id = ?'),
            membres: un('SELECT COUNT(*) n FROM staff WHERE space_id = ? AND disabled = 0'),
            suspendus: un('SELECT COUNT(*) n FROM staff WHERE space_id = ? AND disabled = 1'),
            bannis: un(`SELECT COUNT(*) n FROM sanctions WHERE space_id = ? AND type='ban' AND active=1
                        AND (expires_at IS NULL OR expires_at > ?)`, now()),
            alertes: DB.row(db.prepare(`SELECT COUNT(*) n FROM events e
              LEFT JOIN marks md ON md.event_id = e.id AND md.kind = 'done'
              WHERE e.space_id = ? AND e.sev IN ('critique','alerte') AND md.at IS NULL AND e.ts >= ?`)
              .get(sp.id, d24)).n,
            actionsEnAttente: un(`SELECT COUNT(*) n FROM actions WHERE space_id = ? AND status IN ('pending','sent')`),
            dernierEvenement: dernier ? dernier.t : null,
            rolesRelies: relies, proprietaire: sp.owner_id
              ? (DB.row(db.prepare('SELECT pseudo FROM staff WHERE id = ?').get(sp.owner_id)) || {}).pseudo : null,
            discordPret: !!(sp.guild_id && sp.staff_role_id), retention: sp.retention || CFG.retention
          };
        });
        const somme = k => parEspace.reduce((a, x) => a + (x[k] || 0), 0);
        return ok(res, {
          espaces: parEspace,
          total: {
            espaces: spaces.length, actifs: spaces.filter(x => x.state === 'actif').length,
            fermes: spaces.filter(x => x.state !== 'actif').length,
            evenements24: somme('evenements24'), evenements: somme('evenements'),
            membres: somme('membres'), bannis: somme('bannis'), alertes: somme('alertes')
          },
          // Activité cumulée des 24 h, pour voir d'un coup si l'ensemble
          // de la plateforme respire.
          serie: (() => {
            const n = 24, taille = 3600000, debut = now() - n * taille;
            const t = new Array(n).fill(0);
            for (const r of db.prepare(`SELECT CAST((ts - ?) / ? AS INTEGER) b, COUNT(*) n
                                        FROM events WHERE ts >= ? GROUP BY b`).all(debut, taille, debut)) {
              const i = Number(r.b); if (i >= 0 && i < n) t[i] = Number(r.n);
            }
            return { debut, taille, valeurs: t };
          })(),
          discordGlobal: discordGlobalOk()
        });
      }

      /* ---- journal d'administration ----
         Pas les journaux du jeu : QUI A CHANGÉ QUOI dans les panneaux.
         C'est la seule trace qui explique pourquoi un espace ne se
         comporte plus comme la veille. */
      if (p === '/api/platform/journal' && method === 'GET') {
        const w = [], a = [];
        if (N(Q.space)) { w.push('a.space_id = ?'); a.push(N(Q.space)); }
        if (Q.action)   { w.push('a.action LIKE ?'); a.push(String(Q.action) + '%'); }
        if (Q.q) { w.push('(a.pseudo LIKE ? OR a.detail LIKE ? OR a.action LIKE ?)');
                   const t = '%' + String(Q.q) + '%'; a.push(t, t, t); }
        const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
        const limite = Math.min(500, Math.max(1, N(Q.limit) || 200));
        const rows = db.prepare(`SELECT a.*, s.name AS espace FROM audit a
          LEFT JOIN spaces s ON s.id = a.space_id ${where}
          ORDER BY a.ts DESC LIMIT ?`).all(...a, limite).map(DB.row);
        return ok(res, {
          entrees: rows,
          total: DB.row(db.prepare(`SELECT COUNT(*) n FROM audit a ${where}`).get(...a)).n,
          // Les familles d'action servent de filtres : elles disent ce
          // qu'on peut chercher sans le deviner.
          familles: db.prepare(`SELECT substr(action, 1, instr(action || '.', '.') - 1) f, COUNT(*) n
                                FROM audit GROUP BY f ORDER BY n DESC`).all().map(DB.row),
          espaces: db.prepare('SELECT id, name FROM spaces ORDER BY name').all().map(DB.row)
        });
      }

      /* ============================================================
         VÉRIFICATION DE TOUS LES PANNEAUX
         Un espace tombe en panne de plusieurs façons, et chacune se
         répare autrement : le serveur de jeu n'écrit plus, le bot n'est
         plus sur le Discord, aucun rôle n'est relié… On les distingue,
         et chaque constat porte SON remède. Sans cela, « il y a un
         problème » envoie chercher au mauvais endroit.
         ============================================================ */
      if (p === '/api/platform/check' && method === 'GET') {
        const delai = (pr, ms) => Promise.race([pr,
          new Promise((_, rej) => setTimeout(() => rej(new Error('Discord n’a pas répondu en ' + (ms / 1000) + ' s.')), ms))]);
        const C = (niveau, titre, detail, remede) => ({ niveau, titre, detail, remede });
        const pire = l => l.some(x => x.niveau === 'probleme') ? 'probleme'
                        : l.some(x => x.niveau === 'attention') ? 'attention' : 'ok';

        /* ---- plateforme ---- */
        const plat = [];
        const c0 = dconf();
        if (!c0.clientId || !c0.clientSecret || !c0.botToken)
          plat.push(C('probleme', 'Application Discord incomplète',
            [!c0.clientId && 'identifiant d’application', !c0.clientSecret && 'DISCORD_CLIENT_SECRET',
             !c0.botToken && 'DISCORD_BOT_TOKEN'].filter(Boolean).join(', ') + ' manquant.',
            'Renseignez-les dans api/.env (les deux secrets) et dans « Liaison Discord » (l’identifiant), puis relancez l’API.'));
        else plat.push(C('ok', 'Application Discord', 'Identifiant et secrets en place.', null));

        try {
          const q = db.prepare('PRAGMA quick_check').get();
          const v = Object.values(q)[0];
          plat.push(v === 'ok' ? C('ok', 'Intégrité de la base', 'Aucune anomalie détectée.', null)
            : C('probleme', 'Base de données abîmée', String(v),
                'Arrêtez l’API et restaurez la dernière sauvegarde du fichier .db.'));
        } catch (e) { plat.push(C('attention', 'Intégrité de la base', e.message, null)); }

        try {
          const t = fs.statSync(CFG.dbFile).size;
          plat.push(C(t > 4e9 ? 'attention' : 'ok', 'Taille de la base',
            (t / 1048576).toFixed(0) + ' Mo.',
            t > 4e9 ? 'Réduisez la rétention des espaces les plus bavards, ou archivez.' : null));
        } catch (e) {}

        if (!discordGlobalOk())
          plat.push(C('attention', 'Revérification des accès à l’arrêt',
            'Sans liaison Discord, personne ne peut être vérifié ni retiré automatiquement.',
            'Renseignez l’application Discord et le jeton du bot, puis relancez l’API.'));
        else if (CFG.sweepMin <= 0)
          plat.push(C('probleme', 'Revérification des accès désactivée',
            'ACCESS_SWEEP_MIN vaut 0 : un staff qui perd son rôle Discord garde son accès.',
            'Remettez une valeur en minutes dans api/.env (30 par défaut), puis relancez l’API.'));
        else if (!SWEEP.dernier)
          plat.push(C('attention', 'Accès jamais revérifiés depuis ce démarrage',
            'Le premier balayage part 20 s après le lancement.', null));
        else if (SWEEP.erreurs)
          plat.push(C('attention', SWEEP.erreurs + ' compte(s) non vérifiable(s)',
            'Discord n’a pas répondu pour eux au dernier balayage — aucun accès n’a été retiré à tort.',
            'Vérifiez que le bot est toujours sur le serveur et que son jeton est valide.'));
        else
          plat.push(C('ok', 'Revérification des accès',
            `${SWEEP.verifies} compte(s) vérifié(s) il y a ${Math.round((now() - SWEEP.dernier) / 60000)} min` +
            (SWEEP.retires ? `, ${SWEEP.retires} retiré(s)` : '') + `, toutes les ${CFG.sweepMin} min.`, null));

        const admins = DB.row(db.prepare('SELECT COUNT(*) n FROM staff WHERE platform_admin = 1 AND disabled = 0').get()).n;
        plat.push(admins >= 2 ? C('ok', 'Administration de la plateforme', admins + ' administrateurs.', null)
          : C('attention', 'Un seul administrateur de plateforme',
              'Si ce compte est perdu, plus personne ne peut créer ni rouvrir un espace.',
              'Ajoutez-en un second : node staff.js platform <pseudo> on'));

        /* ---- espaces ---- */
        const espaces = db.prepare('SELECT * FROM spaces ORDER BY state, name').all().map(DB.row);
        const rapport = [];
        for (const sp of espaces) {
          const l = [];
          const actif = sp.state === 'actif';
          const dernier = (DB.row(db.prepare('SELECT MAX(ts) t FROM events WHERE space_id = ?').get(sp.id)) || {}).t;

          if (actif) {
            const age = dernier ? now() - dernier : null;
            if (!dernier) l.push(C('probleme', 'Aucun journal reçu',
              'Cet espace n’a jamais rien reçu du serveur de jeu.',
              'Vérifiez que Config.ServerKey dans resource/config.lua vaut la clé de CET espace, et que « ensure origin_logs » est bien dans server.cfg.'));
            else if (age > 6 * 3600000) l.push(C('probleme', 'Le serveur de jeu n’écrit plus',
              'Dernier évènement il y a ' + Math.round(age / 3600000) + ' h.',
              'La ressource est arrêtée, l’API est injoignable depuis le serveur de jeu, ou la clé d’ingestion a changé sans être recopiée.'));
            else if (age > 45 * 60000) l.push(C('attention', 'Journaux clairsemés',
              'Dernier évènement il y a ' + Math.round(age / 60000) + ' min.',
              'Normal si le serveur est vide ; à surveiller sinon.'));
            else l.push(C('ok', 'Ingestion', 'Journaux reçus il y a ' + Math.round((age || 0) / 60000) + ' min.', null));
          } else {
            l.push(C('ok', 'Espace fermé', 'Ni entrée ni ingestion — c’est voulu.', null));
          }

          if (!sp.guild_id || !sp.staff_role_id)
            l.push(C(actif ? 'probleme' : 'attention', 'Liaison Discord incomplète',
              !sp.guild_id ? 'Aucun serveur Discord renseigné.' : 'Aucun rôle staff renseigné.',
              'Écran « Liaison Discord », après être entré dans cet espace.'));
          else if (c0.botToken) {
            try {
              const roles = await delai(DISCORD.guildRoles(dconfFor(sp)), 6000);
              const staff = roles.find(r => r.id === sp.staff_role_id);
              if (!staff) l.push(C('probleme', 'Rôle staff introuvable sur Discord',
                'L’identifiant renseigné ne correspond à aucun rôle du serveur.',
                'Le rôle a été supprimé ou recréé : choisissez-le à nouveau dans « Liaison Discord ».'));
              else l.push(C('ok', 'Discord', 'Le bot voit le serveur ; rôle staff « ' + staff.name +' ».', null));
            } catch (e) {
              l.push(C('probleme', 'Le bot ne voit pas ce serveur Discord', e.message,
                'Invitez le bot sur ce serveur, ou corrigez l’identifiant du serveur.'));
            }
          }

          const roles = ROLESVC.list(db, sp.id);
          const relies = roles.filter(r => r.discordRoleId);
          if (!relies.length) l.push(C(actif ? 'probleme' : 'attention', 'Aucun rôle relié à Discord',
            'Le staff aura le rôle staff mais aucun rôle du panneau : il sera refusé à la connexion.',
            'Reliez au moins un rôle dans « Liaison Discord ».'));
          else l.push(C('ok', 'Rôles reliés', relies.length + ' rôle(s) sur ' + roles.length + '.', null));

          if (!sp.owner_id) l.push(C('attention', 'Aucun propriétaire',
            'Personne ne peut nommer un second fondateur dans cet espace.',
            'Désignez-en un depuis « Espaces de logs » → Changer le propriétaire.'));

          const membres = DB.row(db.prepare('SELECT COUNT(*) n FROM staff WHERE space_id = ? AND disabled = 0').get(sp.id)).n;
          if (actif && !membres) l.push(C('probleme', 'Aucun membre actif',
            'Plus personne ne peut ouvrir cet espace.',
            'Ajoutez un compte, ou reliez les rôles Discord pour que le staff entre de lui-même.'));

          const bloquees = DB.row(db.prepare(`SELECT COUNT(*) n FROM actions
            WHERE space_id = ? AND status IN ('pending','sent') AND created_at < ?`).get(sp.id, now() - 900000)).n;
          if (bloquees) l.push(C('probleme', bloquees + ' sanction(s) non exécutée(s)',
            'Déposées depuis plus de 15 minutes, jamais reprises par le serveur de jeu.',
            'La ressource origin_logs ne tourne plus, ou n’atteint plus l’API : les bannissements décidés ici ne s’appliquent pas en jeu.'));

          const vieilles = DB.row(db.prepare(`SELECT COUNT(*) n FROM events e
            LEFT JOIN marks md ON md.event_id = e.id AND md.kind = 'done'
            WHERE e.space_id = ? AND e.sev IN ('critique','alerte') AND md.at IS NULL AND e.ts < ?`)
            .get(sp.id, now() - 7 * 86400000)).n;
          if (vieilles > 20) l.push(C('attention', vieilles + ' alertes jamais traitées',
            'Ouvertes depuis plus de sept jours.',
            'La file d’alertes n’est pas suivie : rappelez la consigne, ou soldez-les.'));

          if (String(sp.server_key || '').length < 24) l.push(C('attention', 'Clé d’ingestion courte',
            'Elle protège l’écriture des journaux de cet espace.',
            'Régénérez-la depuis « Espaces de logs », puis recopiez-la dans config.lua.'));

          rapport.push({ id: sp.id, nom: sp.name, etat: sp.state, verdict: pire(l), controles: l });
        }

        const tous = plat.concat(...rapport.map(r => r.controles));
        return ok(res, {
          fait: now(), verdict: pire(tous),
          resume: { ok: tous.filter(x => x.niveau === 'ok').length,
                    attention: tous.filter(x => x.niveau === 'attention').length,
                    probleme: tous.filter(x => x.niveau === 'probleme').length },
          plateforme: plat, espaces: rapport
        });
      }

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
          monEspace: me.spaceId, discordGlobal: discordGlobalOk(),
          // L'adresse que le SERVEUR DE JEU du client devra viser. Le
          // panneau s'en sert pour composer la fiche d'installation : sans
          // elle, on livrerait une clé sans dire où l'envoyer.
          adresse: originOf(req), adressePublique: !!CFG.publicUrl
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
      if (p === '/api/platform/acces' && (method === 'GET' || method === 'POST')) {
        if (method === 'POST') { await balayerAcces('manuel'); audit(me, 'acces.balayage', null, ip); }
        return ok(res, {
          actif: CFG.sweepMin > 0, intervalleMin: CFG.sweepMin, discordPret: discordGlobalOk(),
          enCours: SWEEP.enCours, dernier: SWEEP.dernier || null, prochain: SWEEP.prochain || null,
          verifies: SWEEP.verifies, retires: SWEEP.retires, erreurs: SWEEP.erreurs, duree: SWEEP.duree,
          // Les comptes déjà retirés : c'est la preuve que le balayage sert
          // à quelque chose, et la liste qu'on relit quand quelqu'un dit
          // « je n'arrive plus à me connecter ».
          retraits: db.prepare(`SELECT a.ts, a.detail, s.name AS espace FROM audit a
                                LEFT JOIN spaces s ON s.id = a.space_id
                                WHERE a.action = 'discord.revocation'
                                ORDER BY a.ts DESC LIMIT 30`).all().map(DB.row)
        });
      }
      if (p === '/api/platform/enter' && method === 'POST') {
        const b = await readBody(req);
        const sid = Number(b.spaceId) || 0;
        // spaceId absent ou 0 = RESSORTIR. Entrer sans pouvoir ressortir
        // aurait fait de la visite un aller simple : l'administration se
        // serait retrouvée coincée dans le panneau d'un client jusqu'à la
        // déconnexion, alors que son écran est la supervision.
        if (!sid) {
          db.prepare('UPDATE sessions SET space_id = NULL WHERE token = ?').run(me.token);
          audit(me, 'plateforme.sortie', me.space ? me.space.name : null, ip, me.spaceId);
          return ok(res, { ok: true, espace: null });
        }
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
  console.log(`  ├─ comptes staff ${staffCount}`);
  console.log(`  └─ accès         revérifiés toutes les ${CFG.sweepMin} min` +
              (discordGlobalOk() ? '' : ' (en attente de la liaison Discord)'));
  if (!staffCount) console.log(`\n  Aucun compte : créez le vôtre avec  node staff.js add <pseudo> fondateur\n`);
  else console.log('');
  purge();
  // Un premier balayage peu après le démarrage : un redémarrage est
  // justement le moment où l'on ignore ce qui s'est passé pendant l'arrêt.
  setTimeout(() => balayerAcces('démarrage').catch(e => console.error('[acces]', e.message)), 20000).unref();
});
setInterval(purge, 6 * 3600 * 1000).unref();
if (CFG.sweepMin > 0)
  setInterval(() => balayerAcces('périodique').catch(e => console.error('[acces]', e.message)),
              CFG.sweepMin * 60000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  console.log('\n  Arrêt propre…'); server.close(); try { db.close(); } catch {} process.exit(0);
});

module.exports = { server, db, CFG };
