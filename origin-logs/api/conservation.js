'use strict';
/* ============================================================
   Combien de temps un espace garde ses journaux
   ============================================================
   ⚠️ UN SEUL endroit répond à cette question. Elle se pose dans la purge,
   dans la supervision, dans la fiche du client, dans l'export et dans le
   pied de page de l'application ; tant que chacun la recalculait, « 30
   jours » pouvait s'afficher quelque part pendant que la purge appliquait
   le plafond d'une formule.

   ⚠️ `jours: null` veut dire « on n'efface JAMAIS ». C'est une valeur de
   retour distincte, pas un très grand nombre : écrire l'illimité en
   `retention = 36500` aurait été un mensonge qui expire dans cent ans,
   indiscernable d'une saisie de travers et invisible à la lecture. Ici,
   l'appelant DOIT traiter le cas — sinon il finit par le traiter mal.
   ============================================================ */

/* @param sp      la ligne `spaces` (retention, keep_forever)
   @param plan    la formule effective (maxRetention: nombre ou null)
   @param defaut  la rétention du serveur, quand l'espace n'en fixe pas */
function pour(sp, plan, defaut) {
  const max = plan && plan.maxRetention != null ? Number(plan.maxRetention) : null;
  const demande = !!Number(sp && sp.keep_forever);
  // ⚠️ « Ne jamais effacer » ne passe pas au-dessus du plafond de la
  // formule : une case cochée ne s'achète pas. Sans cette règle, la
  // formule Starter (7 jours) donnait l'illimité d'un clic, et le
  // plafond ne bornait plus rien.
  if (demande && max == null) return { jours: null, illimite: true, bride: false };
  let jours = Number(sp && sp.retention) || Number(defaut) || 30;
  // La formule BORNE la rétention, elle ne la fixe pas : un client qui
  // choisit 7 jours en formule Illimité garde 7 jours. C'est le plafond
  // qui descend, jamais la demande qui monte.
  if (max != null) jours = Math.min(jours, max);
  return { jours, illimite: false, bride: demande };
}

/* Le même verdict, en français, pour l'écran comme pour l'export. */
function texte(c) {
  if (c.illimite) return 'conservation illimitée';
  if (c.bride) return `${c.jours} jours (plafond de la formule)`;
  return `${c.jours} jours`;
}

module.exports = { pour, texte };
