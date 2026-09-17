#!/usr/bin/env node
// ============================================================
// Origin Logs — bot Discord
//
// Il fait UNE chose : reporter les journaux du panneau dans Discord, un
// salon par rubrique, rangés par métier comme dans le panneau.
//
//   node index.js            démarre
//   node index.js --verifier contrôle la configuration et s'arrête
//   node index.js --salons   crée les salons manquants et s'arrête
//
// ⚠️ IL NE SAIT RIEN FAIRE D'AUTRE, et c'est voulu. Un bot qui accepterait
// des commandes (« !ban »), donc qui écrirait dans le panneau, devrait
// authentifier chaque personne dans Discord et refaire tout le système de
// rôles. Le panneau le fait déjà, et mieux : le bot lit, le panneau décide.
// ============================================================
'use strict';
const { CFG, verifier } = require('./lib/config.js');
const D = require('./lib/discord.js');
const P = require('./lib/panneau.js');
const ETAT = require('./lib/etat.js');
const R = require('./lib/rendu.js');

const L = (...a) => console.log(...a);
const arg = n => process.argv.includes(n);

let etat = ETAT.charger(CFG.etatFichier);
let catalogue = null;        // rubriques et groupes, tels que le panneau les donne
let espace = 'Origin Logs';
let arret = false;

/* ---------- préparation des salons ----------
   ⚠️ Le bot ne crée QUE ce qui manque, et se souvient de ce qu'il a créé.
   Sans mémoire, un salon renommé par le staff serait recréé à côté à
   chaque démarrage — et l'on se retrouverait avec quatre « #anticheat ».
   ⚠️ Il ne supprime JAMAIS : un salon porte l'historique de modération du
   serveur, et c'est au staff d'en décider, pas à un programme. */
async function preparerSalons(existants) {
  const parId = new Map(existants.map(c => [c.id, c]));
  const parNom = new Map(existants.filter(c => c.type === D.TYPE_TEXTE).map(c => [c.name, c]));
  const categoriesParNom = new Map(existants.filter(c => c.type === D.TYPE_CATEGORIE).map(c => [c.name, c]));
  let crees = 0;

  for (const g of catalogue.groupes) {
    const nomCat = R.nomSalon('', g.label).replace(/-/g, ' ').toUpperCase();
    let cat = (etat.categories[g.id] && parId.get(etat.categories[g.id])) || categoriesParNom.get(nomCat);
    if (!cat && CFG.creerSalons) {
      cat = await D.creerSalon(CFG.jeton, CFG.guilde, { name: nomCat, type: D.TYPE_CATEGORIE });
      L(`  catégorie créée : ${nomCat}`); crees++;
    }
    if (cat) etat.categories[g.id] = cat.id;

    for (const r of catalogue.rubriques.filter(x => x.groupe === g.id)) {
      if (CFG.rubriques.length && !CFG.rubriques.includes(r.id)) continue;
      const nom = R.nomSalon(CFG.prefixe, r.label);
      let sal = (etat.salons[r.id] && parId.get(etat.salons[r.id])) || parNom.get(nom);
      if (!sal && CFG.creerSalons) {
        sal = await D.creerSalon(CFG.jeton, CFG.guilde, {
          name: nom, type: D.TYPE_TEXTE, parent_id: cat ? cat.id : undefined,
          topic: `${r.label} — ${espace}. Reporté automatiquement par Origin Logs.`
        });
        L(`  salon créé : #${nom}`); crees++;
        // Discord n'aime pas qu'on crée vingt salons d'affilée.
        await D.dormir(400);
      }
      if (sal) etat.salons[r.id] = sal.id;
    }
  }
  ETAT.enregistrer(CFG.etatFichier, etat);
  return crees;
}

/* ---------- un tour ---------- */
async function tour() {
  const lot = await P.evenements(CFG, etat.dernierId);
  const evs = lot.evenements || [];
  if (!evs.length) return 0;

  // Groupés par rubrique : c'est le salon qui commande, pas l'ordre
  // d'arrivée. Un salon = un sujet, c'est tout l'intérêt du découpage.
  const parRubrique = new Map();
  for (const e of evs) {
    if (!parRubrique.has(e.cat)) parRubrique.set(e.cat, []);
    parRubrique.get(e.cat).push(e);
  }

  for (const [catId, groupe] of parRubrique) {
    const salon = etat.salons[catId];
    const rubrique = catalogue.rubriques.find(r => r.id === catId)
      || { id: catId, code: catId.slice(0, 3).toUpperCase(), label: catId };
    if (!salon) {
      if (CFG.verbeux) L(`  (pas de salon pour « ${rubrique.label} » — ignoré)`);
      continue;
    }
    for (const msg of R.messages(groupe, rubrique, espace, CFG)) {
      try {
        await D.poster(CFG.jeton, salon, msg);
      } catch (e) {
        // ⚠️ Un salon supprimé ou devenu interdit ne doit pas arrêter les
        // autres : on l'oublie et le prochain démarrage le recréera.
        if (e.code === 404 || e.code === 403) {
          L(`  salon inaccessible pour « ${rubrique.label} » (${e.code}) — il sera recréé au prochain démarrage.`);
          delete etat.salons[catId];
        } else throw e;
      }
    }
  }

  // ⚠️ On n'avance le repère QU'APRÈS avoir posté. Le faire avant perdrait
  // en silence tout un lot si Discord refusait au milieu — et c'est
  // exactement le lot qu'on voudrait relire.
  etat.dernierId = lot.dernierId;
  ETAT.enregistrer(CFG.etatFichier, etat);
  return evs.length;
}

/* ---------- démarrage ---------- */
async function principal() {
  const manque = verifier();
  if (manque.length) {
    console.error('\n  Configuration incomplète — il manque :\n');
    for (const m of manque) console.error('    · ' + m);
    console.error('\n  Copiez .env.example en .env et remplissez-le. Détail : bot/README.md\n');
    process.exit(1);
  }

  L('\n  Origin Logs — bot Discord');
  L('  ├─ panneau   ' + CFG.panneau);

  const bonjour = await P.bonjour(CFG).catch(e => {
    console.error(`\n  Le panneau refuse le relais : ${e.message}`);
    console.error('  Vérifiez PANEL_URL et RELAY_KEY (Supervision → la carte de l’espace → « Clé du bot »).\n');
    process.exit(1);
  });
  catalogue = { rubriques: bonjour.rubriques, groupes: bonjour.groupes };
  espace = bonjour.espace.nom;
  L('  ├─ espace    ' + espace + ` (${catalogue.rubriques.length} rubriques)`);

  const identite = await D.moi(CFG.jeton).catch(e => {
    console.error(`\n  Discord refuse le jeton : ${e.message}`);
    console.error('  Portail développeur → votre application → Bot → Reset Token.\n');
    process.exit(1);
  });
  L('  ├─ bot       ' + identite.username);

  const g = await D.guilde(CFG.jeton, CFG.guilde).catch(e => {
    console.error(`\n  Serveur Discord introuvable : ${e.message}`);
    console.error('  Le bot est-il invité sur ce serveur ? DISCORD_GUILD_ID est-il le bon ?\n');
    process.exit(1);
  });
  L('  ├─ serveur   ' + g.name);

  // ⚠️ REPÈRE DE DÉPART : le dernier id du panneau, PAS zéro. Un premier
  // lancement qui repartirait de zéro déverserait des mois de journaux
  // dans Discord — et atteindrait la limite de débit en dix secondes.
  if (etat.dernierId === null || etat.dernierId === undefined) {
    etat.dernierId = bonjour.dernierId || 0;
    ETAT.enregistrer(CFG.etatFichier, etat);   // la décision est prise UNE fois
    L(`  ├─ départ    à l’évènement #${etat.dernierId} (l’historique n’est pas rejoué)`);
  } else L(`  ├─ reprise   à l’évènement #${etat.dernierId}`);

  // Changer de serveur Discord invalide les salons mémorisés.
  if (etat.guilde && etat.guilde !== CFG.guilde) {
    L('  ├─ serveur Discord différent : les salons mémorisés sont oubliés.');
    etat.salons = {}; etat.categories = {};
  }
  etat.guilde = CFG.guilde;

  const existants = await D.salons(CFG.jeton, CFG.guilde);
  const crees = await preparerSalons(existants);
  const prets = Object.keys(etat.salons).length;
  L(`  ├─ salons    ${prets} reliés` + (crees ? `, ${crees} créés` : ''));
  if (!prets) {
    L('  │  ⚠ Aucun salon : donnez au bot le droit « Gérer les salons », ou');
    L('  │    créez-les à la main et relancez (CREATE_CHANNELS=0).');
  }
  L(`  └─ sondage   toutes les ${Math.round(CFG.sondageMs / 1000)} s`);
  if (arg('--salons')) { L('\n  Salons préparés. Arrêt demandé.\n'); return; }
  L('');

  let enPanne = 0;
  while (!arret) {
    try {
      const n = await tour();
      if (n && CFG.verbeux) L(`  ${n} évènement(s) reportés — repère #${etat.dernierId}`);
      if (enPanne) { L('  Panneau de nouveau joignable.'); enPanne = 0; }
    } catch (e) {
      // ⚠️ Une panne ne doit pas remplir la console d'une ligne toutes les
      // cinq secondes : on le dit une fois, puis on se tait jusqu'au retour.
      if (!enPanne) console.error('  ' + e.message + ' — nouvelle tentative en continu, sans perdre le repère.');
      enPanne++;
      await D.dormir(Math.min(60000, CFG.sondageMs * Math.min(8, enPanne)));
      continue;
    }
    await D.dormir(CFG.sondageMs);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  arret = true;
  ETAT.enregistrer(CFG.etatFichier, etat);
  L('\n  Arrêt — repère enregistré à #' + etat.dernierId + '.\n');
  process.exit(0);
});

if (arg('--verifier')) {
  const m = verifier();
  if (m.length) { console.error('Incomplet :\n  · ' + m.join('\n  · ')); process.exit(1); }
  console.log('Configuration complète.'); process.exit(0);
}

principal().catch(e => { console.error('\n  ' + (e && e.stack || e) + '\n'); process.exit(1); });
