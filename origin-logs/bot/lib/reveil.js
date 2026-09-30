// ============================================================
// Origin Logs — réveil du bot en temps réel (sans rien perdre)
// ------------------------------------------------------------
// ⚠️ ON NE REMPLACE PAS LE SONDAGE, ON LE RÉVEILLE. panneau.js explique
// pourquoi on lit « ce qui est arrivé après l'id N » plutôt que de
// s'abonner : un flux qui se coupe perd ce qui passe pendant la coupure,
// et sur un journal de modération la ligne manquante est celle qu'on
// cherchera. Ce module garde donc CET invariant : le sondage reste la
// source de vérité (il reprend toujours au même N), et le SSE ne fait
// qu'une chose — dire « du neuf est arrivé, va voir tout de suite » —
// pour supprimer la latence sans risquer un trou. Si le SSE tombe, le
// sondage de repli rattrape tout ; le pire cas est un peu de retard,
// jamais une perte.
// ============================================================
'use strict';
const http = require('node:http');
const https = require('node:https');

// Une connexion SSE à /api/relay/stream pour UNE clé de relais. Elle se
// rouvre toute seule si elle tombe. `onWake` est appelé à chaque « nouveaux ».
function connecter(base, cle, onWake) {
  const url = base + '/api/relay/stream';
  const mod = url.startsWith('https') ? https : http;
  let stop = false, req = null;
  const ouvrir = () => {
    if (stop) return;
    req = mod.get(url, { headers: { 'x-origin-relay': cle } }, res => {
      if (res.statusCode !== 200) { res.resume(); return rejouer(); }
      res.setEncoding('utf8');
      // Le serveur envoie « event: nouveaux » ; les « : ping » gardent la
      // connexion vivante et ne déclenchent rien.
      res.on('data', chunk => { if (chunk.indexOf('event: nouveaux') !== -1) onWake(); });
      res.on('end', rejouer);
      res.on('close', rejouer);
    });
    req.on('error', rejouer);
    // Pas de timeout : c'est une connexion volontairement longue.
    req.setTimeout(0);
  };
  let prevu = false;
  const rejouer = () => {
    if (stop || prevu) return;
    prevu = true;
    // Une seule reprise programmée, 3 s plus tard. `.unref()` pour ne pas
    // retenir le processus si tout le reste s'est arrêté.
    const minu = setTimeout(() => { prevu = false; if (!stop) ouvrir(); }, 3000);
    if (minu.unref) minu.unref();
  };
  ouvrir();
  return () => { stop = true; try { req && req.destroy(); } catch (e) {} };
}

// Gère l'ensemble des connexions (une par clé de relais servie) et offre
// une attente « jusqu'au prochain réveil, ou au plus tard dans N ms ».
function creerReveil(cfg) {
  const conns = new Map();     // clé de relais -> fonction d'arrêt
  let resolveur = null;        // l'attente en cours, s'il y en a une
  let enAttentePendant = false;// un réveil est arrivé alors que personne n'attendait
  const reveiller = () => {
    if (resolveur) { const r = resolveur; resolveur = null; r(); }
    else enAttentePendant = true;   // on ne le perd pas : la prochaine attente rend la main tout de suite
  };
  return {
    // Ouvre/ferme les connexions pour coller à la liste d'espaces servis.
    sync(espaces) {
      const voulus = new Set((espaces || []).map(e => e.relais).filter(Boolean));
      for (const [cle, arr] of conns) if (!voulus.has(cle)) { arr(); conns.delete(cle); }
      for (const cle of voulus) if (!conns.has(cle)) conns.set(cle, connecter(cfg.panneau, cle, reveiller));
    },
    connecte() { return conns.size > 0; },
    // Rend la main dès qu'un réveil arrive, ou après `ms` (le filet).
    attendre(ms) {
      if (enAttentePendant) { enAttentePendant = false; return Promise.resolve(); }
      return new Promise(r => {
        resolveur = r;
        setTimeout(() => { if (resolveur === r) { resolveur = null; r(); } }, ms);
      });
    },
    fermer() { for (const [, arr] of conns) arr(); conns.clear(); }
  };
}

module.exports = { creerReveil };
