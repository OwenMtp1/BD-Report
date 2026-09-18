// ============================================================
// Origin Roleplay — formules commerciales
// Un espace de logs se vend. La formule est la SEULE chose qui
// distingue commercialement un client d'un autre : elle borne ce que
// son espace peut faire, et elle porte une échéance.
//
// ⚠️ UNE LIMITE À NULL VEUT DIRE « SANS LIMITE », PAS « ZÉRO ».
// L'offre haute n'a souvent aucun plafond, et confondre les deux
// bloquerait précisément le client qui paie le plus.
// ============================================================
'use strict';

const cache = { liste: null };
const invalidate = () => { cache.liste = null; };

// Formules de départ. Elles vivent en base ensuite : on ajuste un tarif
// ou un plafond bien plus souvent qu'on ne redéploie.
const DEPART = [
  { key: 'starter', label: 'Starter', rang: 10, prix: 'offert',
    maxStaff: 5, maxRetention: 7, screens: 0, screenQuota: 0, maxIngest: 60,
    notes: 'Pour essayer : une petite équipe, une semaine d’historique, sans captures d’écran.' },
  { key: 'pro', label: 'Pro', rang: 20, prix: '9 €/mois',
    maxStaff: 25, maxRetention: 30, screens: 1, screenQuota: 512, maxIngest: 120,
    notes: 'Le serveur qui tourne : un mois d’historique, les captures d’écran, une vraie équipe.' },
  { key: 'illimite', label: 'Illimité', rang: 30, prix: '29 €/mois',
    maxStaff: null, maxRetention: null, screens: 1, screenQuota: null, maxIngest: null,
    notes: 'Aucun plafond. Pour les serveurs qui journalisent beaucoup et gardent longtemps.' }
];

function seed(db) {
  const n = db.prepare('SELECT COUNT(*) n FROM plans').get().n;
  if (n) return;
  const ins = db.prepare(`INSERT INTO plans(key,label,rang,prix,max_staff,max_retention,
                            screens,screen_quota,max_ingest,notes,builtin,created_at)
                          VALUES(?,?,?,?,?,?,?,?,?,?,1,?)`);
  for (const p of DEPART)
    ins.run(p.key, p.label, p.rang, p.prix, p.maxStaff, p.maxRetention,
            p.screens, p.screenQuota, p.maxIngest, p.notes, Date.now());
  invalidate();
}

const ligne = r => ({
  key: r.key, label: r.label, rang: Number(r.rang), prix: r.prix || '',
  maxStaff: r.max_staff == null ? null : Number(r.max_staff),
  maxRetention: r.max_retention == null ? null : Number(r.max_retention),
  screens: !!r.screens,
  screenQuota: r.screen_quota == null ? null : Number(r.screen_quota),
  maxIngest: r.max_ingest == null ? null : Number(r.max_ingest),
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
                 screens: true, screenQuota: null, maxIngest: null, notes: '', builtin: false };

function forSpace(db, sp) {
  if (!sp || !sp.plan_key) return AUCUNE;
  return byKey(db, sp.plan_key) || AUCUNE;
}

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

module.exports = { seed, list, byKey, forSpace, echeance, fermerExpires, invalidate, AUCUNE, DEPART };
