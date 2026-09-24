#!/usr/bin/env node
// ============================================================
// Origin Roleplay — vérification du panneau de logs
//   node test/run.js            toutes les suites
//   node test/run.js discord    seulement celles dont le nom contient « discord »
//
// ⚠️ CHAQUE SUITE PART D'UNE BASE NEUVE, et c'est tout l'intérêt.
// Ces tests écrivent : ils créent des espaces, ferment, bannissent,
// relient des rôles. Rejoués sur la base laissée par la fois d'avant,
// ils échouaient sur des faits qui n'étaient plus vrais — « 14 rôles
// d'origine » quand il y en avait 16, un espace déjà fermé, une liaison
// Discord déjà posée. Une suite qu'on ne peut pas relancer ne dit rien
// le jour où on en a besoin.
//
// Aucune dépendance : node:http, node:child_process, et l'API elle-même.
// ============================================================
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const RACINE = path.join(__dirname, '..');
const TRAVAIL = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-logs-test-'));
const CLE = 'cle-de-verification-0123456789';
const FAUX_PORT = 8911;

// Les comptes que les suites attendent. Ils sont posés ici, pas par la
// suite : un test qui crée ses propres fondateurs ne teste plus la
// création de comptes, il la présuppose deux fois.
const SUITES = [
  { nom: 'api',     fichier: 'api.test.mjs',     port: 8901, discord: false,
    comptes: [['Nyx', 'fondateur', 'motdepassetest123'], ['Kaleb', 'moderateur', 'motdepassetest456']] },
  { nom: 'espaces', fichier: 'espaces.test.mjs', port: 8902, discord: true,
    comptes: [['Owen', 'fondateur', 'motdepasseowen123', { plateforme: true }]] },
  // « Sup » administre la plateforme : c'est lui qui déclenche le balayage
  // des accès à la fin de la suite. Nyx reste un fondateur ordinaire —
  // c'est avec lui qu'on vérifie la liaison, depuis DANS l'espace.
  { nom: 'discord', fichier: 'discord.test.mjs', port: 8903, discord: true,
    comptes: [['Nyx', 'fondateur', 'motdepassetest123'],
              ['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }]] },
  { nom: 'captures', fichier: 'captures.test.mjs', port: 8904, discord: true,
    comptes: [['Nyx', 'fondateur', 'motdepassetest123', { plateforme: true }]] },
  { nom: 'cloisonnement', fichier: 'cloisonnement.test.mjs', port: 8905, discord: false,
    comptes: [['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }]] },
  { nom: 'securite', fichier: 'securite.test.mjs', port: 8906, discord: false,
    comptes: [['Nyx', 'fondateur', 'motdepassetest123']] },
  { nom: 'commerce', fichier: 'commerce.test.mjs', port: 8907, discord: false,
    comptes: [['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }]] },
  { nom: 'exploitation', fichier: 'exploitation.test.mjs', port: 8908, discord: false,
    comptes: [['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }],
              ['Nyx', 'fondateur', 'motdepassetest123']] },
  { nom: 'ressource', fichier: 'ressource.test.mjs', port: 8909, discord: false,
    comptes: [['Nyx', 'fondateur', 'motdepassetest123']] },
  { nom: 'reports', fichier: 'reports.test.mjs', port: 8910, discord: false,
    comptes: [['Nyx', 'fondateur', 'motdepassetest123']] },
  { nom: 'interface', fichier: 'interface.test.mjs', port: 8912, discord: false,
    comptes: [['Nyx', 'fondateur', 'motdepassetest123']] },
  { nom: 'plateforme', fichier: 'plateforme.test.mjs', port: 8916, discord: false,
    comptes: [['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }]] },
  { nom: 'integration', fichier: 'integration.test.mjs', port: 8915, discord: false,
    comptes: [['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }],
              ['Nyx', 'fondateur', 'motdepassetest123']] },
  { nom: 'branchement', fichier: 'branchement.test.mjs', port: 8914, discord: false,
    comptes: [['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }],
              ['Nyx', 'fondateur', 'motdepassetest123']] },
  { nom: 'equipe', fichier: 'equipe.test.mjs', port: 8913, discord: false,
    botKey: 'cle-du-bot-de-test-0123456789',
    comptes: [['Nyx', 'fondateur', 'motdepassetest123', { discord: '777000111222333444' }],
              ['Kaleb', 'moderateur', 'motdepassetest456']] },
  // Activation signée : le serveur démarre avec la clé PUBLIQUE de
  // l'éditeur (verrou actif) ; le test reçoit la clé PRIVÉE pour signer.
  { nom: 'licence', fichier: 'licence.test.mjs', port: 8917, discord: false, licence: true,
    comptes: [['Sup', 'fondateur', 'motdepassesup12345', { plateforme: true }]] }
];

const filtre = process.argv.slice(2).filter(a => !a.startsWith('-'));
const choisies = filtre.length
  ? SUITES.filter(s => filtre.some(f => s.nom.includes(f) || s.fichier.includes(f)))
  : SUITES;

if (!choisies.length) {
  console.error('Aucune suite ne correspond. Disponibles : ' + SUITES.map(s => s.nom).join(', '));
  process.exit(2);
}

/* ---------- semis d'une base neuve ---------- */
function semer(fichierDb, comptes) {
  // On passe par les modules de l'API plutôt que par staff.js : c'est le
  // même chemin de code, sans dépendre de l'ordre des arguments d'une CLI.
  const DB = require(path.join(RACINE, 'db.js'));
  const AUTH = require(path.join(RACINE, 'auth.js'));
  const ROLESVC = require(path.join(RACINE, 'roles.js'));
  const db = DB.open(fichierDb);
  db.prepare(`INSERT INTO spaces(id,name,server_key,relay_key,state,created_at,created_by)
              VALUES(1,'Origin Roleplay',?,?, 'actif', ?, 'test')`)
    .run(CLE, 'relais-de-test-0123456789abcd', Date.now());
  ROLESVC.seed(db, 1);
  for (const [pseudo, role, mdp, o] of comptes) {
    // Un Discord pour chacun : c'est lui qui fait reconnaître le staff EN JEU.
    db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,created_at,space_id,source,platform_admin,discord_id)
                VALUES(?,?,?,?,?,1,'local',?,?)`)
      .run(pseudo, AUTH.hash(mdp), role, JSON.stringify([role]), Date.now(),
           o && o.plateforme ? 1 : 0, (o && o.discord) || null);
  }
  db.close();
}

/* ---------- attente d'un port qui répond ---------- */
async function attendre(url, limiteMs = 15000) {
  const fin = Date.now() + limiteMs;
  for (;;) {
    try { if ((await fetch(url)).ok) return true; } catch (e) {}
    if (Date.now() > fin) return false;
    await new Promise(r => setTimeout(r, 150));
  }
}

function lancer(cmd, args, env, silencieux) {
  const p = spawn(cmd, args, { cwd: RACINE, env: { ...process.env, ...env },
                               stdio: silencieux ? 'ignore' : 'inherit' });
  return p;
}

(async () => {
  const faux = require('./faux-discord.js').creer();
  await new Promise(r => faux.listen(FAUX_PORT, r));

  const resultats = [];
  for (const s of choisies) {
    const fichierDb = path.join(TRAVAIL, s.nom + '.db');
    semer(fichierDb, s.comptes);

    const base = 'http://127.0.0.1:' + s.port;
    // Pour la suite « licence » : une paire de clés éphémère. Le serveur
    // ne reçoit que la PUBLIQUE (il vérifie) ; le test reçoit la PRIVÉE
    // (il signe), exactement comme l'éditeur et le VPS en production.
    let licPub = '', licPriv = '';
    if (s.licence) {
      const kp = crypto.generateKeyPairSync('ed25519');
      licPub = kp.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
      licPriv = kp.privateKey.export({ format: 'pem', type: 'pkcs8' });
    }
    const env = {
      PORT: String(s.port), SERVER_KEY: CLE, DB_FILE: fichierDb,
      PANEL_DIR: path.join(RACINE, '..'),
      SCREEN_DIR: path.join(TRAVAIL, s.nom + '-screens'),
      ...(s.botKey ? { BOT_KEY: s.botKey } : {}),
      ...(s.licence ? { LICENCE_PUBKEY: licPub } : {}),
      ...(s.discord ? {
        FAUX_DISCORD: 'http://127.0.0.1:' + FAUX_PORT,
        DISCORD_SITE: 'http://127.0.0.1:' + FAUX_PORT,
        DISCORD_API_BASE: 'http://127.0.0.1:' + FAUX_PORT + '/api/v10',
        DISCORD_CLIENT_SECRET: 'secret-de-test',
        DISCORD_BOT_TOKEN: 'jeton-bot-test'
      } : {})
    };
    const api = lancer(process.execPath, ['server.js'], env, true);

    if (!await attendre(base + '/api/catalogue')) {
      console.log(`\n── ${s.nom} ` + '─'.repeat(Math.max(0, 50 - s.nom.length)));
      console.log('  ÉCHEC l’API n’a pas démarré sur ' + base);
      api.kill('SIGKILL');
      resultats.push([s.nom, 1]);
      continue;
    }

    console.log(`\n── ${s.nom} ` + '─'.repeat(Math.max(0, 50 - s.nom.length)));
    const code = await new Promise(r => {
      const t = lancer(process.execPath, [path.join(__dirname, s.fichier)],
        { BASE: base, KEY: CLE, ...(s.licence ? { LICENCE_PUBKEY: licPub, LIC_PRIV: licPriv } : {}) });
      t.on('exit', c => r(c === null ? 1 : c));
    });
    api.kill('SIGKILL');
    resultats.push([s.nom, code]);
  }

  faux.close();
  fs.rmSync(TRAVAIL, { recursive: true, force: true });

  const echecs = resultats.filter(([, c]) => c !== 0);
  console.log('\n' + '═'.repeat(56));
  for (const [nom, c] of resultats) console.log(`  ${c === 0 ? '✓' : '✕'}  ${nom}`);
  console.log(echecs.length ? `\n  ${echecs.length} suite(s) en échec.\n`
                            : `\n  ${resultats.length} suite(s) au vert.\n`);
  process.exit(echecs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
