// ============================================================
// Origin Logs — configuration du bot
//
// ⚠️ PRESQUE RIEN NE SE RÈGLE ICI, et c'est voulu. Le jeton Discord, le
// serveur, le rôle mentionné, les rubriques suivies : tout cela vit DANS
// LE PANNEAU, réglé par chaque client depuis son propre écran. Ce fichier
// ne dit que deux choses — où est le panneau, et avec quelle clé.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ENV = path.join(__dirname, '..', '.env');
try {
  if (fs.existsSync(ENV) && typeof process.loadEnvFile === 'function') process.loadEnvFile(ENV);
} catch (e) { console.error('[.env] ignoré :', e.message); }

const bool = (v, def) => (v == null || v === '' ? def : /^(1|true|oui|on)$/i.test(String(v)));

const CFG = {
  panneau: String(process.env.PANEL_URL || 'http://127.0.0.1:8080').replace(/\/+$/, ''),

  // DEUX MODES, et le bot choisit tout seul.
  //
  // · TOUS LES ESPACES (BOT_KEY) — un seul processus sert tous les clients
  //   qui ont branché un bot. C'est le mode de l'éditeur : ajouter un
  //   client dans le panneau suffit, il n'y a rien à relancer.
  //
  // · UN SEUL ESPACE (RELAY_KEY) — le mode d'un serveur qui héberge son
  //   propre panneau. Il ne voit que le sien, et n'a pas besoin de la clé
  //   de l'éditeur.
  cleBot:    process.env.BOT_KEY || '',
  cleRelais: process.env.RELAY_KEY || '',

  // Cadence. 5 s suffit pour du « direct » ressenti.
  sondageMs: Math.max(2000, Number(process.env.POLL_MS || 5000)),
  parLot:    Math.max(1, Math.min(200, Number(process.env.BATCH || 100))),
  // À quelle fréquence on redemande la liste des espaces : c'est ce qui
  // fait qu'un client branché à 14 h est servi quelques minutes après,
  // sans redémarrage ni accès au serveur.
  // ⚠️ Plancher à 5 s, pas à 30 : la question « qui dois-je servir ? » est
  // une requête minuscule, et un client qui vient de coller son jeton
  // regarde son écran. Le faire attendre une demi-minute pour rien donne
  // l'impression que ça n'a pas marché — et il recommence.
  inventaireMs: Math.max(5000, Number(process.env.INVENTORY_MS || 120000)),

  etatFichier: process.env.STATE_FILE || path.join(__dirname, '..', 'data', 'etat.json'),
  verbeux:     bool(process.env.VERBOSE, false),

  // ⚠️ Repli pour un espace qui n'aurait pas encore réglé son Discord dans
  // le panneau : on accepte un jeton ici, en mode espace unique seulement.
  // C'est une commodité d'installation, pas le chemin normal.
  jetonSecours:  process.env.DISCORD_TOKEN || '',
  guildeSecours: process.env.DISCORD_GUILD_ID || ''
};

const multiEspaces = () => !!CFG.cleBot;

function verifier() {
  const manque = [];
  if (!CFG.cleBot && !CFG.cleRelais)
    manque.push('BOT_KEY (tous les espaces) ou RELAY_KEY (un seul espace) — voir bot/README.md');
  if (!CFG.panneau) manque.push('PANEL_URL');
  return manque;
}

module.exports = { CFG, verifier, multiEspaces };
