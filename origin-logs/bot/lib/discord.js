// ============================================================
// Origin Logs — le strict nécessaire de l'API Discord
//
// Aucune bibliothèque : le bot ne fait que LIRE la liste des salons, en
// CRÉER au besoin, et POSTER des messages. Une dépendance de cinquante
// mégaoctets pour trois routes serait une dette, pas un gain.
//
// ⚠️ ON N'OUVRE PAS LA PASSERELLE (le WebSocket). Le bot n'écoute rien,
// ne répond à aucune commande : il rapporte. La passerelle demanderait des
// « intents », une reconnexion à tenir, et un traitement d'évènements dont
// on n'a que faire.
// ============================================================
'use strict';
// L'adresse est surchargeable pour que le bot puisse être MIS À L'ÉPREUVE
// contre un Discord de contrôle. En service, elle ne bouge pas.
const BASE = String(process.env.DISCORD_API || 'https://discord.com/api/v10').replace(/\/+$/, '');

const TYPE_CATEGORIE = 4;
const TYPE_TEXTE     = 0;

class ErreurDiscord extends Error {
  constructor(code, corps, route) {
    super(`Discord ${code} sur ${route}` + (corps && corps.message ? ` — ${corps.message}` : ''));
    this.code = code; this.corps = corps; this.route = route;
  }
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

/* ⚠️ LES LIMITES DE DÉBIT NE SONT PAS UNE ERREUR, C'EST LE PROTOCOLE.
   Discord répond 429 avec le délai à attendre ; s'entêter fait basculer la
   limite au niveau du BOT ENTIER (« global »), et là plus rien ne part,
   pour tous les salons à la fois. On attend ce qu'il demande, et on
   recommence — au plus quatre fois, sinon un salon bloqué retiendrait
   toute la file. */
async function appel(jeton, route, methode = 'GET', corps = null, essai = 0) {
  const r = await fetch(BASE + route, {
    method: methode,
    headers: Object.assign(
      { 'authorization': 'Bot ' + jeton, 'user-agent': 'OriginLogs (https://github.com/OwenMtp1, 1.0)' },
      corps ? { 'content-type': 'application/json' } : {}),
    body: corps ? JSON.stringify(corps) : undefined
  });

  if (r.status === 429) {
    const j = await r.json().catch(() => ({}));
    const attente = Math.min(60, Number(j.retry_after) || 1);
    if (essai >= 4) throw new ErreurDiscord(429, j, route);
    await dormir(attente * 1000 + 120);
    return appel(jeton, route, methode, corps, essai + 1);
  }
  // 5xx : Discord a des ratés, ce n'est pas notre faute et ça repasse.
  if (r.status >= 500 && essai < 3) {
    await dormir(800 * (essai + 1));
    return appel(jeton, route, methode, corps, essai + 1);
  }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ErreurDiscord(r.status, j, route);
  return j;
}

const salons     = (jeton, guilde) => appel(jeton, `/guilds/${guilde}/channels`);
const moi        = (jeton) => appel(jeton, '/users/@me');
const guilde     = (jeton, id) => appel(jeton, `/guilds/${id}`);
const creerSalon = (jeton, g, corps) => appel(jeton, `/guilds/${g}/channels`, 'POST', corps);
const poster     = (jeton, salon, corps) => appel(jeton, `/channels/${salon}/messages`, 'POST', corps);

module.exports = { appel, salons, moi, guilde, creerSalon, poster,
                   TYPE_CATEGORIE, TYPE_TEXTE, ErreurDiscord, dormir };
