// ============================================================
// Origin Roleplay — rôles d'un espace
// Les rôles ne vivent plus dans le code : le catalogue ne donne que
// les valeurs de DÉPART, la base fait foi. Un fondateur peut donc
// renommer, recomposer, créer et supprimer — y compris les rubriques
// auxquelles chaque rôle a accès.
// ============================================================
'use strict';
const CAT = require('./catalogue.js');

const cache = new Map();                       // spaceId -> [rôles]
const invalidate = id => (id == null ? cache.clear() : cache.delete(Number(id)));

const parse = (j, repli) => { try { const v = JSON.parse(j); return Array.isArray(v) ? v : repli; } catch (e) { return repli; } };

function seed(db, spaceId) {
  const existe = db.prepare('SELECT COUNT(*) n FROM roles WHERE space_id = ?').get(spaceId).n;
  if (existe) return;
  const ins = db.prepare(`INSERT INTO roles(space_id,key,label,rank,perms,cats,builtin,created_at)
                          VALUES(?,?,?,?,?,?,1,?)`);
  for (const key of CAT.ROLE_IDS) {
    const r = CAT.ROLES[key];
    ins.run(spaceId, key, r.label, r.rank,
            JSON.stringify(CAT.permsOf(key)), JSON.stringify(CAT.catsOf(key)), Date.now());
  }
  invalidate(spaceId);
}

function list(db, spaceId) {
  const id = Number(spaceId);
  if (cache.has(id)) return cache.get(id);
  const rows = db.prepare('SELECT * FROM roles WHERE space_id = ? ORDER BY rank DESC, label').all(id)
    .map(r => ({
      key: r.key, label: r.label, rank: Number(r.rank),
      perms: parse(r.perms, []), cats: parse(r.cats, []),
      discordRoleId: r.discord_role_id || '', builtin: !!r.builtin,
      desc: (CAT.ROLES[r.key] || {}).desc || ''
    }));
  cache.set(id, rows);
  return rows;
}
const byKey = (db, spaceId, key) => list(db, spaceId).find(r => r.key === key) || null;

/* ============================================================
   RATTRAPAGE D'UNE RUBRIQUE AJOUTÉE APRÈS COUP
   ⚠️ `seed` ne tourne que pour un espace VIERGE — c'est ce qui permet à un
   fondateur de recomposer ses rôles sans qu'un redémarrage les remette
   comme au premier jour. Conséquence : une rubrique ajoutée au catalogue
   n'apparaît chez AUCUN espace déjà livré, pas même pour son fondateur,
   dont le « tous les accès » a été écrit en LISTE au moment du semis. La
   rubrique existerait alors dans le code et pour personne à l'écran.

   On ne l'accorde pas pour autant à tout le monde : les rubriques d'un
   rôle sont un CHOIX, et en ajouter une d'autorité, c'est élargir un accès
   sans que personne l'ait décidé. Deux cas, et deux seulement :

   · le rôle porte TOUTES les autres rubriques du catalogue — il disait
     « tout », il continue de dire « tout » ;
   · le rôle est un rôle INTÉGRÉ que personne n'a retouché (sa liste est
     exactement celle du catalogue, à la nouvelle rubrique près) ET le
     catalogue la lui donne aujourd'hui. On applique alors la valeur de
     départ, comme l'aurait fait une installation neuve.

   ⚠️ Le second cas remplace une règle plus large — « le rôle porte tout le
   groupe » — qui se trompait : la Brigade Anti-Cheat porte bans, sanctions
   et anticheat, donc TOUTE la modération, et recevait les tickets alors
   qu'une installation neuve les lui refuse. Un rattrapage qui accorde plus
   que le catalogue ne rattrape pas, il dérive.

   ⚠️ Un rôle RETOUCHÉ n'est jamais élargi, même intégré : sa liste est une
   décision, et une décision ne se complète pas toute seule.

   ⚠️ Le repère se pose UNE FOIS, côté appelant. Sans lui, un fondateur qui
   retire la rubrique la verrait revenir au redémarrage suivant — il n'y a
   rien de pire qu'un réglage qui se défait tout seul. */
function backfillCat(db, catId, dejaFait, marquer) {
  const cat = CAT.CATS.find(c => c.id === catId);
  if (!cat || dejaFait) return { fait: false, touches: 0 };
  const ordre = CAT.CATS.map(c => c.id);
  const autres = ordre.filter(c => c !== catId);
  const memeJeu = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const maj = db.prepare('UPDATE roles SET cats = ? WHERE space_id = ? AND key = ?');
  let touches = 0;
  for (const r of db.prepare('SELECT space_id, key, cats, builtin FROM roles').all()) {
    const cats = parse(r.cats, []);
    if (cats.includes(catId)) continue;
    const disaitTout = autres.every(c => cats.includes(c));
    let intact = false;
    if (!disaitTout && r.builtin && CAT.ROLES[r.key]) {
      const defaut = CAT.catsOf(r.key);
      intact = defaut.includes(catId) && memeJeu(cats, defaut.filter(c => c !== catId));
    }
    if (!disaitTout && !intact) continue;
    maj.run(JSON.stringify(ordre.filter(c => cats.includes(c) || c === catId)), r.space_id, r.key);
    touches++;
  }
  if (typeof marquer === 'function') marquer();
  invalidate();
  return { fait: true, touches };
}

/* ⚠️ Le rôle de repli d'un espace est LE SIEN — le plus bas de sa
   hiérarchie — et jamais « moderateur » codé en dur. Un espace qui a
   renommé ou supprimé ce rôle se serait retrouvé avec des comptes
   portant une clé qui n'existe pas chez lui : `resolve` n'aurait alors
   rendu aucun droit, et l'écran serait resté vide sans dire pourquoi. */
function basRole(db, spaceId) {
  const tous = list(db, spaceId);
  if (!tous.length) return null;
  return tous.slice().sort((a, b) => a.rank - b.rank)[0].key;
}

/* Cumul : une personne porte souvent plusieurs rôles. Les droits
   s'AJOUTENT, le rang retenu est le plus haut, et les rubriques sont
   rendues dans l'ordre du catalogue pour que le rail reste stable. */
function resolve(db, spaceId, keys) {
  const tous = list(db, spaceId);
  const pris = tous.filter(r => (keys || []).includes(r.key));
  const ordre = CAT.CATS.map(c => c.id);
  // ⚠️ On DÉPLIE les anciens droits groupés (accounts.manage, players.gdpr)
  // AVANT de filtrer : une base pas encore migrée ne doit rien perdre.
  const perms = CAT.expandAliasPerms([].concat(...pris.map(r => r.perms)))
    .filter(p => CAT.PERM_IDS.includes(p));
  const cats = ordre.filter(c => pris.some(r => r.cats.includes(c)));
  return {
    keys: pris.map(r => r.key),
    perms, cats,
    rank: pris.length ? Math.max(...pris.map(r => r.rank)) : 0,
    main: pris.slice().sort((a, b) => b.rank - a.rank)[0] || null,
    labels: pris.slice().sort((a, b) => b.rank - a.rank).map(r => ({ id: r.key, label: r.label }))
  };
}

// Traduction des rôles Discord : c'est l'ID renseigné sur le rôle du
// panneau qui décide, jamais le nom.
const fromDiscord = (db, spaceId, discordRoleIds) => {
  const porte = new Set(discordRoleIds || []);
  return list(db, spaceId).filter(r => r.discordRoleId && porte.has(r.discordRoleId)).map(r => r.key);
};

// Un identifiant stable, lisible, et qui ne heurte pas un rôle existant.
function makeKey(db, spaceId, label) {
  const base = String(label || 'role').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28) || 'role';
  const pris = new Set(list(db, spaceId).map(r => r.key));
  if (!pris.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!pris.has(base + '_' + i)) return base + '_' + i;
  return base + '_' + Date.now().toString(36);
}

/* ⚠️ MIGRATION UNE FOIS : déplier les anciens droits groupés dans la base.
   « accounts.manage » et « players.gdpr » deviennent leurs droits fins sur
   chaque rôle qui les portait, tous espaces confondus. Idempotent — un rôle
   qui ne porte aucun ancien identifiant est laissé tel quel. Appelé par
   `migrate()` (server.js), sous un drapeau `settings`. */
function backfillPerms(db) {
  const roles = db.prepare('SELECT space_id, key, perms FROM roles').all();
  const maj = db.prepare('UPDATE roles SET perms = ? WHERE space_id = ? AND key = ?');
  let touches = 0;
  for (const r of roles) {
    let liste; try { liste = JSON.parse(r.perms || '[]'); } catch { liste = []; }
    if (!Array.isArray(liste)) continue;
    if (!liste.some(p => CAT.PERM_ALIAS[p])) continue;   // rien d'ancien ici
    const deplie = CAT.expandAliasPerms(liste).filter(p => CAT.PERM_IDS.includes(p));
    maj.run(JSON.stringify(deplie), r.space_id, r.key);
    touches++;
  }
  if (touches) invalidate();
  return touches;
}

module.exports = { seed, list, byKey, basRole, backfillCat, backfillPerms, resolve, fromDiscord, makeKey, invalidate };
