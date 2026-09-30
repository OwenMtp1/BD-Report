// ============================================================
// Origin Logs — la mémoire du bot
//
// ⚠️ SANS ÉTAT, UN REDÉMARRAGE REJOUE TOUT. C'est le pire démarrage
// possible : des mois de journaux déversés d'un coup dans Discord, des
// salons illisibles, et une limite de débit atteinte en dix secondes.
// On retient donc le dernier id traité, et la correspondance
// rubrique → salon, pour ne pas recréer vingt salons à chaque lancement.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/* ⚠️ UN ÉTAT PAR ESPACE, dans un seul fichier. Un processus qui sert dix
   serveurs ne peut pas avoir UN repère : chacun avance à son rythme, et un
   repère partagé ferait sauter à l'un ce que l'autre a déjà lu. */
function chargerTout(fichier) {
  try {
    const v = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    // Ancien format (un seul espace) : on le reprend sous la clé de son
    // espace plutôt que de le jeter — sinon la mise à jour du bot
    // rejouerait l'historique dans Discord.
    if (v && (v.salons || v.dernierId !== undefined) && !v.espaces)
      return { espaces: { '1': unEtat(v) } };
    return { espaces: (v && v.espaces && typeof v.espaces === 'object') ? v.espaces : {} };
  } catch (e) { return { espaces: {} }; }
}

const pour = (tout, id) => (tout.espaces[String(id)] = unEtat(tout.espaces[String(id)]));

function unEtat(v) {
  v = v || {};
  return {
      // ⚠️ `null` ET `0` NE VEULENT PAS DIRE LA MÊME CHOSE, et les
      // confondre coûtait des évènements. `null` = « je n'ai jamais
      // démarré, dis-moi où commencer » ; `0` = « j'ai démarré sur un
      // journal vide, et je veux tout ce qui viendra ». Avec un simple
      // `Number(...) || 0`, un bot dont on venait de créer les salons sur
      // un serveur calme repartait du DERNIER évènement au lancement
      // suivant — et sautait en silence tout ce qui s'était passé entre
      // les deux.
      dernierId: (v.dernierId === null || v.dernierId === undefined) ? null : (Number(v.dernierId) || 0),
      salons: (v.salons && typeof v.salons === 'object') ? v.salons : {},
      categories: (v.categories && typeof v.categories === 'object') ? v.categories : {},
      guilde: v.guilde || null
    };
}

let enCours = null;
function enregistrer(fichier, etat) {
  // Écriture atomique : une coupure au mauvais moment laisserait sinon un
  // fichier tronqué, et le bot repartirait de zéro au redémarrage suivant.
  try {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    const tmp = fichier + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(etat, null, 2));
    fs.renameSync(tmp, fichier);
  } catch (e) { if (enCours !== e.message) { enCours = e.message; console.error('[état]', e.message); } }
}

module.exports = { chargerTout, pour, enregistrer };
