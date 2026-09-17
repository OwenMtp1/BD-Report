// ============================================================
// Origin Logs — le côté panneau
//
// ⚠️ ON SONDE, ON NE S'ABONNE PAS. Un flux SSE se coupe sans prévenir —
// un proxy qui recycle, un redémarrage, une coupure réseau — et il
// reprend en ayant PERDU ce qui est passé pendant l'interruption. Sur un
// journal de modération, c'est précisément ce qu'on ne peut pas se
// permettre : la ligne manquante est toujours celle qu'on cherchera.
// On demande « ce qui est arrivé après l'id N ». Si le bot tombe, il
// reprend au même N, et rien ne manque.
// ============================================================
'use strict';

class ErreurPanneau extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

async function lire(cfg, route) {
  const r = await fetch(cfg.panneau + route, { headers: { 'x-origin-relay': cfg.cleRelais } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ErreurPanneau(r.status, (j && j.error) || ('HTTP ' + r.status));
  return j;
}

// Ce que le bot a besoin de savoir pour préparer ses salons : le nom de
// l'espace et le catalogue des rubriques. Il n'en invente aucune.
const bonjour = cfg => lire(cfg, '/api/relay/hello');

function evenements(cfg, depuis) {
  const q = new URLSearchParams({ since: String(depuis), limit: String(cfg.parLot) });
  if (cfg.rubriques.length) q.set('cat', cfg.rubriques.join(','));
  if (cfg.gravites.length)  q.set('sev', cfg.gravites.join(','));
  return lire(cfg, '/api/relay/events?' + q.toString());
}

module.exports = { bonjour, evenements, ErreurPanneau };
