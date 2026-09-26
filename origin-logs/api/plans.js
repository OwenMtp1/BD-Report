// ============================================================
// Origin Roleplay — formules commerciales
// Un espace de logs se vend. La formule est la SEULE chose qui
// distingue commercialement un client d'un autre : elle borne ce que
// son espace peut faire, et elle porte une échéance.
//
// ⚠️ UNE LIMITE À NULL VEUT DIRE « SANS LIMITE », PAS « ZÉRO ».
// L'offre haute n'a souvent aucun plafond, et confondre les deux
// bloquerait précisément le client qui paie le plus.
//
// ⚠️ UNE OFFRE NE PORTE PLUS AUCUN PLAFOND TECHNIQUE — ni quota
// d'images, ni débit d'écriture. Ce sont des protections de MACHINE,
// pas des arguments de vente : personne n'achète « 120 dépôts par
// minute », et les faire vivre dans une offre revenait à vendre au
// client une panne qu'on lui infligerait ensuite. Elles restent où
// elles ont un sens, dans la configuration du serveur
// (SCREEN_QUOTA_MB, MAX_INGEST_PER_MIN), les mêmes pour tous.
// Les colonnes `screen_quota` et `max_ingest` restent en base : une
// migration qui EFFACE est pire que deux colonnes qui dorment, et
// rien ne les lit plus.
// ============================================================
'use strict';

const CAT = require('./catalogue.js');

const cache = { liste: null };
const invalidate = () => { cache.liste = null; };

// Formules de départ. Elles vivent en base ensuite : on ajuste un tarif
// ou un plafond bien plus souvent qu'on ne redéploie.
// Les rubriques de l'offre d'entrée : de quoi modérer, et rien de plus.
// L'économie, la boutique et le casino sont ce qu'on vend au palier
// suivant — ce sont aussi les rubriques les plus volumineuses.
const CATS_STARTER = ['bans', 'sanctions', 'anticheat', 'reports',
                      'connexions', 'deconnexion', 'combat', 'admin'];
const CATS_PRO = CATS_STARTER.concat(['ecran_joueur', 'inventaire', 'items_sol',
                                      'proprietes', 'jobs', 'facture_ems']);

const DEPART = [
  { key: 'starter', label: 'Starter', rang: 10, prix: 'offert',
    maxStaff: 5, maxRetention: 7, screens: 0,
    cats: CATS_STARTER,
    notes: 'Pour essayer : une petite équipe, une semaine d’historique, sans captures d’écran.' },
  { key: 'pro', label: 'Pro', rang: 20, prix: '9 €/mois',
    maxStaff: 25, maxRetention: 30, screens: 1,
    cats: CATS_PRO,
    notes: 'Le serveur qui tourne : un mois d’historique, les captures d’écran, une vraie équipe.' },
  { key: 'illimite', label: 'Illimité', rang: 30, prix: '29 €/mois',
    maxStaff: null, maxRetention: null, screens: 1,
    cats: null,
    notes: 'Aucun plafond, toutes les rubriques. Pour les serveurs qui journalisent beaucoup.' }
];

function seed(db) {
  const n = db.prepare('SELECT COUNT(*) n FROM plans').get().n;
  if (n) return;
  const ins = db.prepare(`INSERT INTO plans(key,label,rang,prix,max_staff,max_retention,
                            screens,cats,notes,builtin,created_at)
                          VALUES(?,?,?,?,?,?,?,?,?,1,?)`);
  for (const p of DEPART)
    ins.run(p.key, p.label, p.rang, p.prix, p.maxStaff, p.maxRetention,
            p.screens, p.cats ? JSON.stringify(p.cats) : null, p.notes, Date.now());
  invalidate();
}

/* ⚠️ `cats` À NULL = TOUTES LES RUBRIQUES, jamais aucune. Une formule
   d'avant la mise en place des onglets n'a pas de liste : la lire comme
   une liste vide aurait vidé le panneau de tous ces clients d'un coup,
   au redémarrage suivant, sans que personne n'ait rien décidé.
   On garde aussi les rubriques inconnues du catalogue à l'écart : un id
   retiré du code ne doit pas voyager jusqu'aux requêtes SQL. */
function litCats(brut) {
  if (brut == null || brut === '') return null;
  let l; try { l = JSON.parse(brut); } catch (e) { return null; }
  if (!Array.isArray(l)) return null;
  return CAT.CAT_IDS.filter(id => l.includes(id));
}

const ligne = r => ({
  key: r.key, label: r.label, rang: Number(r.rang), prix: r.prix || '',
  maxStaff: r.max_staff == null ? null : Number(r.max_staff),
  maxRetention: r.max_retention == null ? null : Number(r.max_retention),
  screens: !!r.screens,
  cats: litCats(r.cats),
  notes: r.notes || '', builtin: !!r.builtin
});

function list(db) {
  if (cache.liste) return cache.liste;
  cache.liste = db.prepare('SELECT * FROM plans ORDER BY rang, label').all().map(ligne);
  return cache.liste;
}
const byKey = (db, key) => list(db).find(p => p.key === key) || null;

/* ---------- la formule d'un espace ----------
   ⚠️ Un espace SANS formule n'est pas bridé : c'est le vôtre, ou un
   client d'avant la mise en place des formules. Brider par défaut aurait
   coupé des espaces en service le jour de la migration. */
const AUCUNE = { key: null, label: 'Sans formule', prix: '', maxStaff: null, maxRetention: null,
                 screens: true, cats: null, notes: '', builtin: false };

function forSpace(db, sp) {
  if (!sp || !sp.plan_key) return AUCUNE;
  return byKey(db, sp.plan_key) || AUCUNE;
}

/* ---------- les rubriques qu'une formule ouvre ----------
   ⚠️ L'OFFRE BORNE, LE RÔLE DÉCOUPE — et jamais l'inverse. Le rôle dit
   ce qu'une PERSONNE a le droit de lire dans ce que le client a acheté ;
   l'offre dit ce que le client a acheté. On garde donc l'INTERSECTION :
   cocher une rubrique dans un rôle ne peut pas la faire apparaître si
   elle n'est pas vendue, et vendre une rubrique ne l'ouvre pas à qui
   n'en a pas le rôle. */
function catsFor(db, sp) {
  const p = forSpace(db, sp);
  return p.cats == null ? CAT.CAT_IDS.slice() : p.cats.slice();
}
const borner = (cats, plan) => {
  const permis = plan && plan.cats;
  return permis == null ? cats.slice() : cats.filter(c => permis.includes(c));
};

/* ---------- échéance ----------
   `plan_until` à NULL = sans fin. Sinon l'espace se ferme tout seul au
   passage de la date : c'est le geste qu'on ne veut surtout pas avoir à
   faire à la main quand un client cesse de payer. */
const JOUR = 86400000;
function echeance(sp) {
  if (!sp || !sp.plan_until) return { fin: null, reste: null, expire: false, bientot: false };
  const reste = Number(sp.plan_until) - Date.now();
  return { fin: Number(sp.plan_until), reste,
           expire: reste <= 0, bientot: reste > 0 && reste < 7 * JOUR };
}

/* Ferme les espaces dont l'échéance est passée. Idempotent, appelé au
   démarrage puis toutes les heures. Rend la liste de ce qui a changé,
   pour que l'appelant l'inscrive au journal. */
function fermerExpires(db) {
  const t = Date.now();
  const dus = db.prepare(`SELECT id, name, plan_until FROM spaces
                          WHERE state = 'actif' AND plan_until IS NOT NULL AND plan_until <= ?`).all(t);
  const maj = db.prepare(`UPDATE spaces SET state='ferme', closed_at=?, closed_reason=? WHERE id=?`);
  const faits = [];
  for (const sp of dus) {
    maj.run(t, 'Échéance de la formule dépassée', sp.id);
    faits.push({ id: sp.id, nom: sp.name, fin: Number(sp.plan_until) });
  }
  return faits;
}

module.exports = { seed, list, byKey, forSpace, catsFor, borner, litCats,
                   echeance, fermerExpires, invalidate, AUCUNE, DEPART };
