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
const DB = require('./db.js');
const AUTH = require('./auth.js');
const CAT = require('./catalogue.js');

const db = DB.open(process.env.DB_FILE || path.join(__dirname, 'data', 'origin-logs.db'));
const [, , cmd, ...args] = process.argv;
const ROLES = Object.keys(CAT.ROLES);
const find = p => DB.row(db.prepare('SELECT * FROM staff WHERE pseudo = ? COLLATE NOCASE').get(p));
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

  Rôles : ${ROLES.join(', ')}
`);
  process.exit(msg ? 1 : 0);
}

switch (cmd) {
  case 'add': {
    const [pseudo, role, pass] = args;
    if (!pseudo || !role) usage('Pseudo et rôle obligatoires.');
    if (!ROLES.includes(role)) usage(`Rôle inconnu : ${role}`);
    if (pseudo.length < 3) usage('Pseudo trop court (3 caractères minimum).');
    if (find(pseudo)) usage('Ce pseudo existe déjà.');
    const mdp = pass || genPass();
    if (mdp.length < 10) usage('Mot de passe trop court (10 caractères minimum).');
    db.prepare('INSERT INTO staff(pseudo,pass,role,created_at) VALUES(?,?,?,?)')
      .run(pseudo, AUTH.hash(mdp), role, Date.now());
    console.log(`\n  Compte créé : ${pseudo} (${CAT.roleOf(role).label})`);
    if (!pass) console.log(`  Mot de passe : ${mdp}\n  Notez-le maintenant, il n'est stocké nulle part en clair.\n`);
    else console.log('');
    break;
  }
  case 'list': {
    const rows = db.prepare('SELECT * FROM staff ORDER BY role DESC, pseudo').all().map(DB.row);
    if (!rows.length) { console.log('\n  Aucun compte staff.\n'); break; }
    console.log('\n  ' + 'PSEUDO'.padEnd(20) + 'RÔLE'.padEnd(18) + 'ÉTAT'.padEnd(12) + 'DERNIÈRE CONNEXION');
    for (const r of rows)
      console.log('  ' + r.pseudo.padEnd(20) + CAT.roleOf(r.role).label.padEnd(18) +
        (r.disabled ? 'désactivé' : 'actif').padEnd(12) +
        (r.last_login ? new Date(r.last_login).toLocaleString('fr-FR') : 'jamais'));
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
    db.prepare('UPDATE staff SET role=? WHERE id=?').run(role, r.id);
    console.log(`\n  ${r.pseudo} est désormais ${CAT.roleOf(role).label}.\n`);
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
  default: usage(cmd ? `Commande inconnue : ${cmd}` : null);
}
db.close();
