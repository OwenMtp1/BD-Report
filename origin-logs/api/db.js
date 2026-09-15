// ============================================================
// Origin Roleplay — stockage
// SQLite intégré à Node (node:sqlite) : aucune dépendance, aucun
// service à installer. Le fichier .db se sauvegarde en le copiant.
// ============================================================
'use strict';
// node:sqlite est marqué « expérimental » par Node et le crie à chaque
// démarrage. L'API est stable dans la version que nous ciblons ; on tait
// ce seul avertissement pour ne pas noyer les vrais messages du serveur.
const _warn = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  if (String(w).includes('SQLite is an experimental')) return;
  return _warn.call(process, w, ...rest);
};
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- Un ESPACE DE LOGS = un serveur de jeu + son serveur Discord + son
-- équipe. Tout ce qui suit lui appartient : un espace ne voit jamais
-- les journaux d'un autre, et sa clé d'ingestion n'ouvre que le sien.
CREATE TABLE IF NOT EXISTS spaces(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  guild_id      TEXT,
  staff_role_id TEXT,
  server_key    TEXT    NOT NULL UNIQUE,
  owner_id      INTEGER,
  state         TEXT    NOT NULL DEFAULT 'actif',   -- actif | ferme
  retention     INTEGER,
  created_at    INTEGER NOT NULL,
  created_by    TEXT,
  closed_at     INTEGER,
  closed_reason TEXT
);

-- Les rôles vivent en base, pas dans le code : un fondateur doit pouvoir
-- en créer, renommer, changer les droits ET les rubriques accessibles.
-- Le catalogue ne fournit plus que les valeurs de DÉPART.
CREATE TABLE IF NOT EXISTS roles(
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id        INTEGER NOT NULL,
  key             TEXT    NOT NULL,
  label           TEXT    NOT NULL,
  rank            INTEGER NOT NULL DEFAULT 10,
  perms           TEXT    NOT NULL DEFAULT '[]',
  cats            TEXT    NOT NULL DEFAULT '[]',
  discord_role_id TEXT,
  builtin         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER,
  UNIQUE(space_id, key)
);
CREATE INDEX IF NOT EXISTS idx_roles_space ON roles(space_id, rank DESC);

CREATE TABLE IF NOT EXISTS events(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  cat         TEXT    NOT NULL,
  sev         TEXT    NOT NULL,
  server      TEXT,
  actor_key   TEXT,
  actor_name  TEXT,
  actor_sid   INTEGER,
  actor_staff INTEGER NOT NULL DEFAULT 0,
  target_key  TEXT,
  target_name TEXT,
  msg         TEXT    NOT NULL,
  data        TEXT,
  res         TEXT,
  search      TEXT    NOT NULL,
  space_id    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_ev_ts        ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ev_cat_ts    ON events(cat, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ev_sev_ts    ON events(sev, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ev_actor_ts  ON events(actor_key, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ev_target_ts ON events(target_key, ts DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts
  USING fts5(search, content='events', content_rowid='id',
             tokenize="unicode61 remove_diacritics 2");
CREATE TRIGGER IF NOT EXISTS ev_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, search) VALUES (new.id, new.search);
END;
CREATE TRIGGER IF NOT EXISTS ev_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, search) VALUES ('delete', old.id, old.search);
END;

CREATE TABLE IF NOT EXISTS players(
  key        TEXT PRIMARY KEY,
  name       TEXT,
  sid        INTEGER,
  discord    TEXT,
  steam      TEXT,
  fivem      TEXT,
  ip_hash    TEXT,
  job        TEXT,
  grade      INTEGER,
  first_seen INTEGER,
  last_seen  INTEGER,
  playtime   INTEGER NOT NULL DEFAULT 0,
  events     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pl_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_pl_seen ON players(last_seen DESC);

CREATE TABLE IF NOT EXISTS sanctions(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_key TEXT NOT NULL,
  name       TEXT,
  type       TEXT NOT NULL,          -- warn | kick | ban | mute
  reason     TEXT,
  by_name    TEXT,
  by_id      INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,                -- NULL = définitif
  lifted_at  INTEGER,
  lifted_by  TEXT,
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sa_player ON sanctions(player_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sa_active ON sanctions(active, type);

CREATE TABLE IF NOT EXISTS actions(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,         -- warn | kick | ban | unban | give
  target_key  TEXT,
  target_name TEXT,
  target_sid  INTEGER,
  payload     TEXT,
  reason      TEXT,
  by_id       INTEGER,
  by_name     TEXT,
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | done | failed
  result      TEXT,
  done_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ac_status ON actions(status, created_at);

-- Captures de l'écran d'un joueur, prises EN JEU sur demande du staff.
-- Le fichier vit sur le disque (data/screens/), pas dans la base : une
-- image en base64 dans SQLite gonfle chaque sauvegarde et chaque requête
-- qui la survole. La ligne, elle, porte tout ce qui rend la capture
-- opposable — qui l'a demandée, quand, pour quel motif, et sur qui.
CREATE TABLE IF NOT EXISTS screens(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id    INTEGER NOT NULL,
  action_id   INTEGER,
  player_key  TEXT,
  player_name TEXT,
  player_sid  INTEGER,
  asked_by    TEXT,
  reason      TEXT,
  asked_at    INTEGER,
  taken_at    INTEGER NOT NULL,
  mime        TEXT NOT NULL DEFAULT 'image/jpeg',
  bytes       INTEGER NOT NULL DEFAULT 0,
  width       INTEGER,
  height      INTEGER,
  file        TEXT NOT NULL,
  event_id    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sc_space ON screens(space_id, taken_at DESC);

CREATE TABLE IF NOT EXISTS marks(
  event_id INTEGER NOT NULL,
  kind     TEXT    NOT NULL,          -- pin | done
  by_id    INTEGER,
  by_name  TEXT,
  at       INTEGER NOT NULL,
  PRIMARY KEY(event_id, kind)
);

CREATE TABLE IF NOT EXISTS staff(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo     TEXT UNIQUE NOT NULL,
  pass       TEXT NOT NULL,
  role       TEXT NOT NULL,
  discord    TEXT,
  disabled   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);

-- Réglages modifiables depuis le panneau (liaison Discord, IDs de rôles).
-- En base plutôt qu'en fichier : un fondateur doit pouvoir les changer
-- sans accès SSH, et chaque changement laisse une trace.
CREATE TABLE IF NOT EXISTS settings(
  k          TEXT PRIMARY KEY,
  v          TEXT,
  updated_at INTEGER,
  by_name    TEXT
);

CREATE TABLE IF NOT EXISTS sessions(
  token      TEXT PRIMARY KEY,
  staff_id   INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ua         TEXT
);
CREATE INDEX IF NOT EXISTS idx_se_staff ON sessions(staff_id);

-- Un panneau de logs se journalise lui-même : qui a ouvert quel dossier,
-- qui a exporté, qui a sanctionné. Sans cela, la surveillance n'est
-- surveillée par personne.
CREATE TABLE IF NOT EXISTS audit(
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  staff_id INTEGER,
  pseudo   TEXT,
  action   TEXT NOT NULL,
  detail   TEXT,
  ip       TEXT
);
CREATE INDEX IF NOT EXISTS idx_au_ts ON audit(ts DESC);
`;

// Les bases déjà en service n'ont pas les colonnes Discord : on les
// ajoute au démarrage plutôt que d'exiger une migration manuelle.
function ensureColumn(db, table, name, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`);
}

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  ensureColumn(db, 'staff', 'discord_id',       'TEXT');
  ensureColumn(db, 'staff', 'avatar',           'TEXT');
  ensureColumn(db, 'staff', 'roles',            'TEXT');      // JSON : plusieurs rôles cumulés
  ensureColumn(db, 'staff', 'source',           "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, 'staff', 'roles_checked_at', 'INTEGER');
  // Multi-espaces : tout ce qui est daté appartient à un espace.
  for (const t of ['events', 'players', 'sanctions', 'actions', 'staff', 'audit'])
    ensureColumn(db, t, 'space_id', 'INTEGER NOT NULL DEFAULT 1');
  // Un fondateur peut figer les rôles d'un membre à la main : la
  // resynchronisation Discord ne doit pas défaire sa décision.
  ensureColumn(db, 'staff', 'manual_roles', 'TEXT');
  ensureColumn(db, 'staff', 'platform_admin', 'INTEGER NOT NULL DEFAULT 0');
  // Un administrateur de plateforme visite un espace sans changer le
  // sien : la visite vit sur la SESSION, pas sur le compte.
  ensureColumn(db, 'sessions', 'space_id', 'INTEGER');
  // DÉFAUT TROUVÉ À L'AUDIT : la clé d'un joueur était unique GLOBALEMENT.
  // Deux espaces partageant un même joueur (même licence) se seraient
  // écrasés l'un l'autre à l'ingestion. La clé primaire devient
  // (space_id, key) ; SQLite ne sait pas la changer en place, on
  // reconstruit la table en conservant les lignes.
  const pk = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='players'").get();
  if (pk && !/PRIMARY KEY\s*\(\s*space_id/i.test(String(pk.sql))) {
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE players_v2(
        key TEXT NOT NULL, space_id INTEGER NOT NULL DEFAULT 1, name TEXT, sid INTEGER,
        discord TEXT, steam TEXT, fivem TEXT, ip_hash TEXT, job TEXT, grade INTEGER,
        first_seen INTEGER, last_seen INTEGER, playtime INTEGER NOT NULL DEFAULT 0,
        events INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(space_id, key))`);
      db.exec(`INSERT INTO players_v2(key,space_id,name,sid,discord,steam,fivem,ip_hash,job,grade,first_seen,last_seen,playtime,events)
               SELECT key,COALESCE(space_id,1),name,sid,discord,steam,fivem,ip_hash,job,grade,first_seen,last_seen,playtime,events FROM players`);
      db.exec('DROP TABLE players');
      db.exec('ALTER TABLE players_v2 RENAME TO players');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pl_name ON players(name)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pl_seen ON players(last_seen DESC)');
      db.exec('COMMIT');
      console.log('[migration] clé des joueurs désormais propre à chaque espace');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_ev_space_ts ON events(space_id, ts DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_pl_space ON players(space_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sa_space ON sanctions(space_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ac_space ON actions(space_id, status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_st_space ON staff(space_id)');

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_discord ON staff(discord_id) WHERE discord_id IS NOT NULL');
  return db;
}

/* ---------- recherche ----------
   FTS5 refuse les caractères de sa syntaxe. On réduit la saisie à des
   jetons et on cherche en préfixe ; si rien d'exploitable n'en sort
   (« 3 495 $ »), on retombe sur un LIKE plutôt que de ne rien répondre. */
function ftsQuery(q) {
  const toks = String(q).toLowerCase().match(/[\p{L}\p{N}_:.-]{2,}/gu);
  if (!toks || !toks.length) return null;
  return toks.slice(0, 8).map(t => '"' + t.replace(/"/g, '') + '"*').join(' AND ');
}

const num = v => (typeof v === 'bigint' ? Number(v) : v);
const row = r => (r ? Object.assign({}, r) : null);

module.exports = { open, ftsQuery, num, row, SCHEMA };
