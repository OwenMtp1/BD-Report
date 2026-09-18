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
    '',
    '# --- Connexion Discord (facultative) ---',
    '# Seuls ces DEUX SECRETS vivent ici. Le serveur, le rôle staff et les',
    '# rôles du panneau se règlent dans le panneau (écran « Liaison Discord »),',
    '# pour qu\'un fondateur puisse les changer sans toucher au fichier.',
    '#DISCORD_CLIENT_SECRET=',
    '#DISCORD_BOT_TOKEN=',
    '',
    '# --- Bot Discord des clients (facultatif) ---',
    '# ⚠️ Ce n\'est PAS un jeton Discord : c\'est la clé qui permet AU',
    '# PROCESSUS du bot de voir la liste des espaces à servir. Chaque client',
    '# branche SON application Discord depuis son propre panneau ; celle-ci',
    '# n\'appartient qu\'à vous. Recopiez-la dans bot/.env (BOT_KEY).',
    'BOT_KEY=' + crypto.randomBytes(24).toString('hex'),
    ''
  ].join('\n'), { mode: 0o600 });
}

const db = DB.open(DBF);
// L'espace 1 est celui que crée cette installation : le pseudo n'étant
// unique que par espace, on ne cherche que là.
const existe = DB.row(db.prepare('SELECT id FROM staff WHERE pseudo = ? COLLATE NOCASE AND space_id = 1').get(pseudo));
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
L('     2. Copier le dossier « resource » dans les ressources du serveur');
L('        de jeu, sous le nom origin_logs, puis dans server.cfg :');
L('');
L(`        set origin_logs_url "http://127.0.0.1:${process.env.PORT || 8080}"`);
L(`        set origin_logs_key "${cle}"`);
L('        ensure baseevents          # sinon pas de morts journalisées');
L('        ensure screenshot-basic    # facultatif : captures d\'écran');
L('        ensure origin_logs');
L('');
L('        ⚠ La clé va dans server.cfg, PAS dans config.lua : ce fichier');
L('        est « shared », donc téléchargé par chaque joueur. Et « set »,');
L('        pas « setr » — setr la répliquerait chez les clients.');
L('');
L('     Pour brancher la connexion Discord (facultatif) :');
L('        a. Application sur discord.com/developers → OAuth2 : ajoutez');
L('           l\'URL de redirection affichée par le panneau.');
L('        b. Créez un bot, invitez-le sur votre serveur (aucune permission');
L('           particulière : il ne fait que LIRE les membres et les rôles).');
L('        c. Collez CLIENT_SECRET et BOT_TOKEN dans api/.env, relancez,');
L('           puis ouvrez « Liaison Discord » dans le panneau pour relier');
L('           le rôle staff et chaque rôle du panneau.');
L('');
L('     Pour voir le panneau se remplir sans serveur de jeu :');
L(`        SERVER_KEY=${cle} node seed-demo.js 600`);
L('');
