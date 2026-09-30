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

async function lire(cfg, route, entete) {
  const r = await fetch(cfg.panneau + route, { headers: entete });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ErreurPanneau(r.status, (j && j.error) || ('HTTP ' + r.status));
  return j;
}

const avecRelais = cle => ({ 'x-origin-relay': cle });

/* L'inventaire des espaces à servir — le mode « tous les espaces ».
   ⚠️ Il rend les JETONS DISCORD de chaque client : c'est la seule route
   du produit qui le fasse, elle a sa propre clé, et cette clé est celle de
   l'éditeur — jamais celle d'un client. */
const inventaire = cfg => lire(cfg, '/api/relay/spaces', { 'x-origin-bot': cfg.cleBot });

// Ce que le bot a besoin de savoir pour préparer ses salons : le nom de
// l'espace et le catalogue des rubriques. Il n'en invente aucune.
const bonjour = (cfg, cleRelais) => lire(cfg, '/api/relay/hello', avecRelais(cleRelais));

function evenements(cfg, cleRelais, depuis, options) {
  const o = options || {};
  const q = new URLSearchParams({ since: String(depuis), limit: String(cfg.parLot) });
  if ((o.rubriques || []).length) q.set('cat', o.rubriques.join(','));
  if ((o.gravites || []).length)  q.set('sev', o.gravites.join(','));
  return lire(cfg, '/api/relay/events?' + q.toString(), avecRelais(cleRelais));
}

module.exports = { bonjour, evenements, inventaire, ErreurPanneau };
