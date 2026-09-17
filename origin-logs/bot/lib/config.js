// ============================================================
// Origin Logs — configuration du bot
// Même principe que l'API : un .env à côté, aucune dépendance.
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
  // Le panneau, et la clé de RELAIS (pas celle du serveur de jeu).
  panneau:   String(process.env.PANEL_URL || 'http://127.0.0.1:8080').replace(/\/+$/, ''),
  cleRelais: process.env.RELAY_KEY || '',

  // Discord
  jeton:   process.env.DISCORD_TOKEN || '',
  guilde:  process.env.DISCORD_GUILD_ID || '',
  // Le bot range ses salons sous ce préfixe : on retrouve les siens, et on
  // ne touche jamais à ceux du serveur.
  prefixe: process.env.CHANNEL_PREFIX || '',
  // Rôle à mentionner sur les évènements critiques. Vide = aucun ping.
  // ⚠️ Mentionner sur tout revient à ne mentionner sur rien : au bout de
  // trois jours, plus personne ne regarde.
  rolePing: process.env.PING_ROLE_ID || '',
  pingSur:  (process.env.PING_SEVERITIES || 'critique').split(',').map(x => x.trim()).filter(Boolean),

  // Rythme. 5 s suffit pour du « direct » ressenti, et laisse le panneau
  // tranquille : c'est 12 requêtes par minute, loin du plafond du relais.
  sondageMs: Math.max(2000, Number(process.env.POLL_MS || 5000)),
  parLot:    Math.max(1, Math.min(200, Number(process.env.BATCH || 100))),

  // Rubriques et gravités retenues. Vide = tout.
  rubriques: (process.env.CATEGORIES || '').split(',').map(x => x.trim()).filter(Boolean),
  gravites:  (process.env.SEVERITIES || '').split(',').map(x => x.trim()).filter(Boolean),

  // ⚠️ Une rubrique bavarde (le HUD, les objets au sol) noie un salon
  // Discord en quelques minutes. On peut la plafonner sans l'éteindre :
  // au-delà, le bot résume au lieu de détailler.
  maxParSalon: Math.max(1, Number(process.env.MAX_PER_CHANNEL || 8)),

  creerSalons: bool(process.env.CREATE_CHANNELS, true),
  etatFichier: process.env.STATE_FILE || path.join(__dirname, '..', 'data', 'etat.json'),
  verbeux:     bool(process.env.VERBOSE, false)
};

function verifier() {
  const manque = [];
  if (!CFG.cleRelais) manque.push('RELAY_KEY (Supervision → la carte de l’espace → « Clé du bot »)');
  if (!CFG.jeton)     manque.push('DISCORD_TOKEN (portail développeur Discord → Bot → Token)');
  if (!CFG.guilde)    manque.push('DISCORD_GUILD_ID (clic droit sur le serveur → Copier l’identifiant)');
  return manque;
}

module.exports = { CFG, verifier };
