#!/usr/bin/env node
// ============================================================
// Origin Roleplay — mise en route
// Une seule commande : génère la clé serveur, écrit .env, crée le
// premier compte fondateur et affiche ce qu'il reste à faire.
//   node setup.js <votre-pseudo>
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DB = require('./db.js');
const AUTH = require('./auth.js');
const CAT = require('./catalogue.js');

const pseudo = (process.argv[2] || '').trim();
if (!pseudo || pseudo.length < 3) {
  console.error(`
  Mise en route — Origin Roleplay

    node setup.js <votre-pseudo>

  Le pseudo est celui avec lequel vous vous connecterez au panneau.
  Trois caractères minimum.
`);
  process.exit(1);
}

const ENV = path.join(__dirname, '.env');
const DBF = process.env.DB_FILE || path.join(__dirname, 'data', 'origin-logs.db');

// On ne régénère JAMAIS une clé déjà en service : la ressource FiveM
// la porte de son côté, et la changer ici couperait l'arrivée des logs.
let cle = null, dejaLa = false;
if (fs.existsSync(ENV)) {
  const m = fs.readFileSync(ENV, 'utf8').match(/^SERVER_KEY=(.+)$/m);
  if (m) { cle = m[1].trim(); dejaLa = true; }
}
if (!cle) {
  cle = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(ENV, [
    '# Origin Roleplay — configuration de l\'API',
    '# Cette clé est partagée avec resource/config.lua. Ne la publiez pas.',
    'SERVER_KEY=' + cle,
    'PORT=8080',
    'RETENTION_DAYS=30',
    '# Passez à 1 dès que le site est servi en HTTPS :',
    'SECURE_COOKIE=0',
    ''
  ].join('\n'), { mode: 0o600 });
}

const db = DB.open(DBF);
const existe = DB.row(db.prepare('SELECT id FROM staff WHERE pseudo = ? COLLATE NOCASE').get(pseudo));
let mdp = null;
if (existe) {
  console.log(`\n  Le compte « ${pseudo} » existe déjà — il est conservé tel quel.`);
} else {
  mdp = crypto.randomBytes(12).toString('base64url');
  db.prepare('INSERT INTO staff(pseudo,pass,role,created_at) VALUES(?,?,?,?)')
    .run(pseudo, AUTH.hash(mdp), 'fondateur', Date.now());
}
const total = DB.row(db.prepare('SELECT COUNT(*) n FROM staff').get()).n;
db.close();

const L = s => console.log(s);
L('');
L('  ┌─ Origin Roleplay — journal serveur');
L('  │');
L(`  │  Clé serveur   ${dejaLa ? '(déjà en place, conservée)' : '(nouvelle)'}`);
L(`  │  ${cle}`);
L('  │');
if (mdp) {
  L(`  │  Compte fondateur   ${pseudo}`);
  L(`  │  Mot de passe       ${mdp}`);
  L('  │  Notez-le maintenant : il n\'est stocké nulle part en clair.');
} else {
  L(`  │  Comptes staff      ${total}`);
}
L('  │');
L('  └─ Il reste deux choses à faire :');
L('');
L('     1. Démarrer l\'API            npm start');
L('        puis ouvrir               http://localhost:8080');
L('');
L('     2. Dans resource/config.lua, coller la clé ci-dessus :');
L(`        Config.ServerKey = '${cle}'`);
L('        puis, dans server.cfg :   ensure baseevents');
L('                                  ensure origin_logs');
L('');
L('     Pour voir le panneau se remplir sans serveur de jeu :');
L(`        SERVER_KEY=${cle} node seed-demo.js 600`);
L('');
