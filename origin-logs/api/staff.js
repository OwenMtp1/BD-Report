#!/usr/bin/env node
// ============================================================
// Origin Roleplay — gestion des comptes staff en ligne de commande
//   node staff.js add <pseudo> <role> [motdepasse]
//   node staff.js list | passwd <pseudo> [mdp] | role <pseudo> <role>
//   node staff.js disable <pseudo> | enable <pseudo> | remove <pseudo>
// Le premier compte se crée forcément ici : il n'existe aucune page
// d'inscription, et c'est voulu.
// ============================================================
'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const DB = require('./db.js');
const AUTH = require('./auth.js');
const CAT = require('./catalogue.js');
const ROLESVC = require('./roles.js');

const db = DB.open(process.env.DB_FILE || path.join(__dirname, 'data', 'origin-logs.db'));
const [, , cmd, ...brut] = process.argv;
// --space=N : sur quel espace de logs on travaille (le premier par défaut).
const opt = brut.filter(a => a.startsWith('--'));
const args = brut.filter(a => !a.startsWith('--'));
const optVal = k => { const o = opt.find(x => x.startsWith('--' + k + '=')); return o ? o.split('=')[1] : null; };
const premierEspace = () => { const r = db.prepare('SELECT id FROM spaces ORDER BY id LIMIT 1').get(); return r ? r.id : 1; };
const SPACE = Number(optVal('space')) || premierEspace();
if (db.prepare('SELECT COUNT(*) n FROM spaces').get().n === 0) {
  // Première utilisation : l'espace naît ici plutôt que d'échouer.
  // La clé vient de .env quand il y en a une : le serveur l'alignera de
  // toute façon au démarrage, mais autant ne pas créer l'écart.
  let cle = process.env.SERVER_KEY;
  if (!cle) {
    try {
      const f = path.join(__dirname, '.env');
      if (fs.existsSync(f)) {
        const m = fs.readFileSync(f, 'utf8').match(/^SERVER_KEY=(.+)$/m);
        if (m) cle = m[1].trim();
      }
    } catch (e) {}
  }
  db.prepare(`INSERT INTO spaces(id,name,server_key,state,created_at,created_by)
              VALUES(1,?,?, 'actif', ?, 'staff.js')`)
    .run(process.env.SPACE_NAME || 'Origin Roleplay',
         cle || crypto.randomBytes(24).toString('hex'), Date.now());
}
ROLESVC.seed(db, SPACE);
const ROLES = ROLESVC.list(db, SPACE).map(r => r.key);
const labelOf = k => { const r = ROLESVC.byKey(db, SPACE, k); return r ? r.label : k; };
// ⚠️ Le pseudo n'est unique que DANS SON ESPACE : on cherche donc dans
// l'espace visé (--space=N), sans quoi `staff.js role Nyx …` toucherait
// le Nyx d'un autre serveur.
const find = p => DB.row(db.prepare('SELECT * FROM staff WHERE pseudo = ? COLLATE NOCASE AND space_id = ?').get(p, SPACE));
// Pour les commandes qui doivent parler de TOUS les espaces (list).
const findPartout = p => db.prepare('SELECT * FROM staff WHERE pseudo = ? COLLATE NOCASE').all(p).map(DB.row);
const genPass = () => crypto.randomBytes(12).toString('base64url');

function usage(msg) {
  if (msg) console.error('\n  ' + msg);
  console.error(`
  Comptes staff — Origin Roleplay

    node staff.js add <pseudo> <role> [motdepasse]
    node staff.js list
    node staff.js passwd <pseudo> [motdepasse]
    node staff.js role <pseudo> <role>
    node staff.js disable <pseudo> | enable <pseudo> | remove <pseudo>
    node staff.js platform <pseudo> on|off     (administration de la plateforme)
    node staff.js spaces

  Options : --space=<id> pour viser un autre espace de logs (défaut : ${SPACE})

  Rôles de l'espace ${SPACE} : ${ROLES.join(', ')}
`);
  process.exit(msg ? 1 : 0);
}

switch (cmd) {
  case 'add': {
    const [pseudo, role, pass] = args;
    if (!pseudo || !role) usage('Pseudo et rôle obligatoires.');
    if (!ROLES.includes(role)) usage(`Rôle inconnu : ${role}`);
    if (pseudo.length < 3) usage('Pseudo trop court (3 caractères minimum).');
    if (find(pseudo)) usage(`Ce pseudo existe déjà dans l'espace ${SPACE}.`);
    const mdp = pass || genPass();
    if (mdp.length < 10) usage('Mot de passe trop court (10 caractères minimum).');
    db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,created_at,space_id,source)
                VALUES(?,?,?,?,?,?, 'local')`)
      .run(pseudo, AUTH.hash(mdp), role, JSON.stringify([role]), Date.now(), SPACE);
    console.log(`\n  Compte créé : ${pseudo} (${labelOf(role)}) — espace ${SPACE}`);
    const ailleurs = findPartout(pseudo).filter(x => Number(x.space_id) !== Number(SPACE));
    if (ailleurs.length)
      console.log(`  ⚠ Ce pseudo existe aussi dans l'espace ${ailleurs.map(x => x.space_id).join(', ')} :\n` +
                  `    donnez-lui un mot de passe DIFFÉRENT, sinon la connexion ne saura pas\n` +
                  `    lequel des deux comptes ouvrir et les refusera tous les deux.`);
    if (!pass) console.log(`  Mot de passe : ${mdp}\n  Notez-le maintenant, il n'est stocké nulle part en clair.\n`);
    else console.log('');
    break;
  }
  case 'list': {
    const rows = db.prepare('SELECT * FROM staff ORDER BY role DESC, pseudo').all().map(DB.row);
    if (!rows.length) { console.log('\n  Aucun compte staff.\n'); break; }
    console.log('\n  ' + 'PSEUDO'.padEnd(20) + 'RÔLE'.padEnd(26) + 'ESP'.padEnd(5) + 'ÉTAT'.padEnd(12) + 'DERNIÈRE CONNEXION');
    for (const r of rows) {
      let rs = []; try { rs = JSON.parse(r.manual_roles || r.roles || '[]'); } catch (e) {}
      const libelle = (rs.length ? rs : [r.role]).map(k => {
        const x = ROLESVC.byKey(db, r.space_id || SPACE, k); return x ? x.label : k; }).join(' + ');
      console.log('  ' + r.pseudo.padEnd(20) + libelle.slice(0, 25).padEnd(26) +
        String(r.space_id || 1).padEnd(5) +
        (r.disabled ? 'désactivé' : (r.platform_admin ? 'PLATEFORME' : 'actif')).padEnd(12) +
        (r.last_login ? new Date(r.last_login).toLocaleString('fr-FR') : 'jamais'));
    }
    console.log('');
    break;
  }
  case 'passwd': {
    const [pseudo, pass] = args;
    const r = find(pseudo); if (!r) usage('Compte inconnu.');
    const mdp = pass || genPass();
    if (mdp.length < 10) usage('Mot de passe trop court (10 caractères minimum).');
    db.prepare('UPDATE staff SET pass=? WHERE id=?').run(AUTH.hash(mdp), r.id);
    db.prepare('DELETE FROM sessions WHERE staff_id=?').run(r.id);
    console.log(`\n  Mot de passe changé pour ${r.pseudo} — ses sessions ouvertes sont fermées.`);
    if (!pass) console.log(`  Nouveau mot de passe : ${mdp}\n`); else console.log('');
    break;
  }
  case 'role': {
    const [pseudo, role] = args;
    const r = find(pseudo); if (!r) usage('Compte inconnu.');
    if (!ROLES.includes(role)) usage(`Rôle inconnu : ${role}`);
    if (r.role === 'fondateur' && role !== 'fondateur' &&
        DB.row(db.prepare(`SELECT COUNT(*) n FROM staff WHERE role='fondateur' AND disabled=0`).get()).n <= 1)
      usage('Il doit rester au moins un fondateur.');
    // Posé à la main : la synchronisation Discord ne doit pas le défaire.
    db.prepare('UPDATE staff SET role=?, manual_roles=? WHERE id=?').run(role, JSON.stringify([role]), r.id);
    db.prepare('DELETE FROM sessions WHERE staff_id=?').run(r.id);
    console.log(`\n  ${r.pseudo} est désormais ${labelOf(role)} (attribution manuelle).\n`);
    break;
  }
  case 'disable': case 'enable': {
    const r = find(args[0]); if (!r) usage('Compte inconnu.');
    const off = cmd === 'disable' ? 1 : 0;
    db.prepare('UPDATE staff SET disabled=? WHERE id=?').run(off, r.id);
    if (off) db.prepare('DELETE FROM sessions WHERE staff_id=?').run(r.id);
    console.log(`\n  ${r.pseudo} : accès ${off ? 'désactivé' : 'réactivé'}.\n`);
    break;
  }
  case 'remove': {
    const r = find(args[0]); if (!r) usage('Compte inconnu.');
    db.prepare('DELETE FROM sessions WHERE staff_id=?').run(r.id);
    db.prepare('DELETE FROM staff WHERE id=?').run(r.id);
    console.log(`\n  Compte ${r.pseudo} supprimé.\n`);
    break;
  }
  case 'platform': {
    const r = find(args[0]); if (!r) usage('Compte inconnu.');
    const on = args[1] !== 'off';
    if (!on && DB.row(db.prepare('SELECT COUNT(*) n FROM staff WHERE platform_admin=1 AND id<>?').get(r.id)).n === 0)
      usage('Il doit rester au moins un administrateur de plateforme.');
    db.prepare('UPDATE staff SET platform_admin=? WHERE id=?').run(on ? 1 : 0, r.id);
    db.prepare('DELETE FROM sessions WHERE staff_id=?').run(r.id);
    console.log(`\n  ${r.pseudo} ${on ? 'administre désormais la plateforme' : 'n’administre plus la plateforme'}.\n`);
    break;
  }
  case 'spaces': {
    const rows = db.prepare('SELECT * FROM spaces ORDER BY id').all().map(DB.row);
    console.log('\n  ' + 'ID'.padEnd(5) + 'NOM'.padEnd(26) + 'ÉTAT'.padEnd(9) + 'MEMBRES'.padEnd(9) + 'CLÉ D’INGESTION');
    for (const sp of rows) {
      const m = DB.row(db.prepare('SELECT COUNT(*) n FROM staff WHERE space_id=?').get(sp.id)).n;
      console.log('  ' + String(sp.id).padEnd(5) + sp.name.slice(0, 25).padEnd(26) +
        sp.state.padEnd(9) + String(m).padEnd(9) + sp.server_key);
    }
    console.log('');
    break;
  }
  default: usage(cmd ? `Commande inconnue : ${cmd}` : null);
}
db.close();
