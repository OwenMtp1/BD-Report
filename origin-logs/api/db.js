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

-- Ce que fait tourner le serveur de jeu d'un espace, et ce que son code
-- sait faire. Une ligne par espace, remplacée à chaque remontée : ce
-- n'est pas un historique, c'est une PHOTO — savoir qu'une ressource
-- tournait il y a trois mois n'aide personne à brancher celle d'aujourd'hui.
-- ⚠️ La colonne payload ne contient JAMAIS de code, seulement des noms :
-- beaucoup de ressources FiveM sont payantes et sous licence.
CREATE TABLE IF NOT EXISTS inventory(
  space_id INTEGER PRIMARY KEY,
  ts       INTEGER NOT NULL,
  payload  TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS scans(
  space_id INTEGER PRIMARY KEY,
  ts       INTEGER NOT NULL,
  payload  TEXT    NOT NULL
);

-- Les raccordements ACTIFS d'un espace : quels évènements du serveur de
-- jeu sont journalisés, et dans quelle rubrique.
-- ⚠️ Ce n'est PAS un fichier généré qu'on dépose chez le client. La
-- ressource vient lire cette table et pose ses écouteurs elle-même :
-- décocher un raccordement dans le panneau le coupe en une minute, sans
-- que personne n'ait à toucher au serveur de jeu. Un fichier, lui, aurait
-- demandé un aller-retour humain pour chaque correction — et c'est
-- exactement l'aller-retour qu'on cherche à supprimer.
-- ⚠️ Une colonne « active » plutôt qu'une suppression : un évènement décoché doit
-- RESTER visible, sinon le prochain scan le repropose comme une nouveauté
-- et on décoche en boucle ce qu'on a déjà refusé.
CREATE TABLE IF NOT EXISTS hooks(
  space_id  INTEGER NOT NULL,
  ev        TEXT    NOT NULL,
  cat       TEXT    NOT NULL,
  sev       TEXT    NOT NULL DEFAULT 'info',
  res       TEXT,
  source    TEXT,                          -- catalogue | indice | manuel
  active    INTEGER NOT NULL DEFAULT 1,
  vus       INTEGER NOT NULL DEFAULT 0,    -- combien de fois il s'est déclenché
  ts        INTEGER NOT NULL,
  PRIMARY KEY (space_id, ev)
);


-- FORMULES commerciales. Un espace de logs se vend : la formule borne ce
-- qu'il peut faire, et c'est la seule chose qui distingue un client d'un
-- autre. Elles vivent en base — pas dans le code — parce qu'on ajuste un
-- tarif ou un plafond bien plus souvent qu'on ne redéploie.
-- ⚠️ « max_* » à NULL veut dire « sans limite », pas « zéro » : une formule
-- sans plafond est un cas courant (l'offre haute), et le confondre avec
-- un plafond à zéro bloquerait tout.
CREATE TABLE IF NOT EXISTS plans(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT    NOT NULL UNIQUE,
  label         TEXT    NOT NULL,
  rang          INTEGER NOT NULL DEFAULT 0,      -- ordre d'affichage
  prix          TEXT,                            -- libellé libre : « 9 €/mois »
  max_staff     INTEGER,                         -- NULL = sans limite
  max_retention INTEGER,                         -- jours, NULL = sans limite
  screens       INTEGER NOT NULL DEFAULT 1,      -- captures d'écran autorisées
  screen_quota  INTEGER,                         -- Mo, NULL = plafond du serveur
  max_ingest    INTEGER,                         -- lots/minute, NULL = plafond du serveur
  notes         TEXT,
  builtin       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER
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

-- PRÉSENCE. Qui est sur le serveur EN CE MOMENT.
-- ⚠️ On ne la DÉDUIT PAS des évènements de connexion : un redémarrage du
-- serveur de jeu ne produit aucun « playerDropped », et tout le monde
-- resterait « en ligne » pour l'éternité. La ressource envoie donc la
-- liste complète à intervalle régulier, et ce qui n'a pas été revu depuis
-- deux battements est parti. Une photo, pas un journal.
CREATE TABLE IF NOT EXISTS presence(
  space_id   INTEGER NOT NULL,
  key        TEXT    NOT NULL,
  name       TEXT,
  sid        INTEGER,
  job        TEXT,
  ping       INTEGER,
  staff      INTEGER NOT NULL DEFAULT 0,   -- reconnu par son Discord
  staff_name TEXT,
  since      INTEGER,                      -- début de la session en cours
  seen_at    INTEGER NOT NULL,
  PRIMARY KEY(space_id, key)
);
CREATE INDEX IF NOT EXISTS idx_pr_seen ON presence(space_id, seen_at DESC);

-- NOTES DU STAFF SUR UN JOUEUR. « Déjà averti deux fois pour ça. »
CREATE TABLE IF NOT EXISTS player_notes(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id   INTEGER NOT NULL,
  player_key TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  by_id      INTEGER,
  by_name    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pn_player ON player_notes(space_id, player_key, created_at DESC);

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
  pseudo     TEXT NOT NULL,   -- unicité PAR ESPACE (cf. idx_staff_pseudo)
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
  // ⚠️ Le bot Discord n'est PAS le serveur de jeu : lui donner la clé
  // d'ingestion l'autoriserait à ÉCRIRE des journaux. Il a sa propre clé,
  // en lecture seule, qu'on peut lui retirer sans couper l'arrivée des
  // logs. Nulle par défaut : un espace sans bot n'a pas de porte ouverte.
  ensureColumn(db, 'spaces', 'relay_key', 'TEXT');
  /* ⚠️ UN BOT DISCORD PAR ESPACE, et son jeton vit DANS L'ESPACE.
     Un jeton unique dans un fichier de configuration aurait voulu dire un
     seul bot pour tous les clients : le même nom, le même avatar, et
     surtout la même application Discord dans dix serveurs différents. Un
     client qui la révoque les coupe tous. Chacun le sien, chacun son
     interrupteur. */
  ensureColumn(db, 'spaces', 'bot_token', 'TEXT');
  // Vide = le serveur Discord déjà relié pour la connexion (guild_id).
  // C'est le cas courant : on ne demande pas deux fois la même chose.
  ensureColumn(db, 'spaces', 'bot_guild', 'TEXT');
  ensureColumn(db, 'spaces', 'bot_opts',  'TEXT');
  // Ce que le bot a réellement trouvé en se présentant : son nom, celui du
  // serveur. Affiché au client pour qu'il VOIE que c'est branché, plutôt
  // que de le déduire d'une absence d'erreur.
  ensureColumn(db, 'spaces', 'bot_seen',  'TEXT');
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

  /* ---------- DÉFAUT : les comptes staff n'étaient PAS cloisonnés ----------
     `pseudo TEXT UNIQUE` et l'index unique sur `discord_id` étaient
     GLOBAUX. Deux conséquences, toutes deux contraires à l'idée même
     d'espaces indépendants :
       · un espace ne pouvait pas avoir son « Nyx » si un autre en avait
         un — et le refus révélait au passage l'existence d'un compte
         dans un espace qu'on n'administre pas ;
       · la MÊME personne ne pouvait pas être staff sur deux serveurs :
         la création de son second compte Discord échouait sur l'index.
     L'unicité devient donc (space_id, pseudo) et (space_id, discord_id).
     SQLite ne sait pas retirer une contrainte de colonne en place : on
     reconstruit la table en conservant toutes les lignes. */
  const st = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='staff'").get();
  if (st && /pseudo\s+TEXT\s+UNIQUE/i.test(String(st.sql))) {
    const cols = db.prepare('PRAGMA table_info(staff)').all().map(c => c.name);
    const liste = cols.join(',');
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE staff_v2(
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        pseudo           TEXT NOT NULL,
        pass             TEXT NOT NULL,
        role             TEXT NOT NULL,
        discord          TEXT,
        disabled         INTEGER NOT NULL DEFAULT 0,
        created_at       INTEGER NOT NULL,
        last_login       INTEGER,
        discord_id       TEXT,
        avatar           TEXT,
        roles            TEXT,
        source           TEXT NOT NULL DEFAULT 'local',
        roles_checked_at INTEGER,
        space_id         INTEGER NOT NULL DEFAULT 1,
        manual_roles     TEXT,
        platform_admin   INTEGER NOT NULL DEFAULT 0)`);
      db.exec(`INSERT INTO staff_v2(${liste}) SELECT ${liste} FROM staff`);
      db.exec('DROP TABLE staff');
      db.exec('ALTER TABLE staff_v2 RENAME TO staff');
      db.exec('COMMIT');
      console.log('[migration] comptes staff désormais propres à chaque espace');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  // Un espace porte sa formule et son échéance. `plan_key` plutôt qu'un
  // identifiant numérique : on lit l'état d'un espace sans jointure, et
  // supprimer une formule ne casse pas la ligne de l'espace.
  ensureColumn(db, 'spaces', 'plan_key', 'TEXT');
  ensureColumn(db, 'spaces', 'plan_until', 'INTEGER');   // échéance, NULL = sans fin
  // Branchement en une commande : le code transmis au client, sa péremption,
  // et la date à laquelle il a été consommé.
  // ⚠️ `enroll_at` ne se vide jamais : « ce serveur s'est branché un jour »
  // est un fait, et c'est lui qui distingue une installation EN ATTENTE
  // d'une installation faite puis refaite. Sans lui, un code réémis pour
  // changer de machine ferait retomber l'espace en « jamais branché ».
  ensureColumn(db, 'spaces', 'enroll_code', 'TEXT');
  ensureColumn(db, 'spaces', 'enroll_until', 'INTEGER');
  ensureColumn(db, 'spaces', 'enroll_at', 'INTEGER');
  // ⚠️ « Ne jamais effacer » est une DÉCISION, pas une durée très longue.
  // On aurait pu l'écrire `retention = 36500` : ç'aurait été un mensonge
  // qui expire dans cent ans, invisible dans l'interface comme dans les
  // exports, et impossible à distinguer d'une valeur saisie de travers.
  // Une colonne à part se lit, se coche, se décoche, et se raconte au
  // client dans les termes où il l'a demandée.
  ensureColumn(db, 'spaces', 'keep_forever', 'INTEGER');
  // ⚠️ L'ÉQUIPE DE LA PLATEFORME A SES PROPRES RÔLES, sans rapport avec
  // ceux d'un espace client. `platform_admin` disait seulement OUI/NON ;
  // `platform_role` dit LEQUEL — commercial, support, technique…
  // Les comptes déjà marqués administrateurs deviennent « Direction » :
  // une migration qui retire des accès est pire que le désordre qu'elle
  // corrige, et personne ne doit se réveiller sans droits.
  ensureColumn(db, 'staff', 'platform_role', 'TEXT');
  // Un rôle plateforme posé À LA MAIN est une décision : la
  // correspondance avec le Discord officiel ne doit pas la défaire à la
  // prochaine connexion. Même principe que `manual_roles` côté client.
  ensureColumn(db, 'staff', 'platform_role_manual', 'INTEGER');
  // ⚠️ UNE OFFRE DÉCIDE AUSSI DES RUBRIQUES, pas seulement des plafonds.
  // `cats` à NULL veut dire « toutes », comme `max_*` à NULL veut dire
  // « sans limite » : les formules déjà en service ne perdent donc aucun
  // onglet le jour de la migration. Une liste VIDE, elle, est un choix —
  // une offre qui n'ouvre aucune rubrique se vend peut-être, mais elle se
  // lit dans l'interface, et on ne l'a pas posée par accident.
  ensureColumn(db, 'plans', 'cats', 'TEXT');
  db.prepare("UPDATE staff SET platform_role = 'direction' WHERE platform_admin = 1 AND platform_role IS NULL").run();
  db.exec('CREATE INDEX IF NOT EXISTS idx_st_space ON staff(space_id)');
  // COLLATE NOCASE : « Nyx » et « nyx » sont le même compte pour qui se
  // connecte, donc le même compte pour l'index.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_pseudo ON staff(space_id, pseudo COLLATE NOCASE)');
  db.exec('DROP INDEX IF EXISTS idx_staff_discord');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_discord
           ON staff(space_id, discord_id) WHERE discord_id IS NOT NULL`);
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
