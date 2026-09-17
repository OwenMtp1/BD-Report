#!/usr/bin/env node
// ============================================================
// Origin Logs — bot Discord
//
// Il reporte les journaux du panneau dans Discord, un salon par rubrique.
//
//   node index.js              démarre
//   node index.js --verifier   contrôle la configuration et s'arrête
//   node index.js --salons     prépare les salons et s'arrête
//
// ⚠️ UN BOT PAR ESPACE, UN SEUL PROCESSUS. Chaque client branche SON
// application Discord depuis son propre panneau : son nom, son avatar, son
// jeton, son interrupteur. Le processus, lui, les sert tous — ajouter un
// client ne demande ni fichier ni redémarrage.
//
// ⚠️ IL N'ACCEPTE AUCUNE COMMANDE. Un bot qui ferait « !ban » devrait
// authentifier chaque personne dans Discord et refaire tout le système de
// rôles du panneau — qui existe déjà, et qui journalise chaque geste.
// Le bot rapporte ; le panneau décide.
// ============================================================
'use strict';
const { CFG, verifier, multiEspaces } = require('./lib/config.js');
const D = require('./lib/discord.js');
const P = require('./lib/panneau.js');
const ETAT = require('./lib/etat.js');
const R = require('./lib/rendu.js');

const L = (...a) => console.log(...a);
const arg = n => process.argv.includes(n);

let tout = ETAT.chargerTout(CFG.etatFichier);
let arret = false;
let espaces = [];                 // ce que le panneau nous dit de servir
const connus = new Map();         // id -> { catalogue, prets, panne }

/* ---------- l'inventaire ---------- */
async function recharger(premier) {
  if (!multiEspaces()) {
    // Mode espace unique : le panneau ne rend qu'un espace, et le Discord
    // peut venir du .env si le client ne l'a pas encore réglé.
    const b = await P.bonjour(CFG, CFG.cleRelais);
    espaces = [{
      id: b.espace.id, nom: b.espace.nom, relais: CFG.cleRelais,
      jeton: CFG.jetonSecours, guilde: CFG.guildeSecours,
      options: { prefixe:'', rolePing:'', pingSur:['critique'], rubriques:[], gravites:[],
                 maxParSalon: 8, creerSalons: true },
      _catalogue: { rubriques: b.rubriques, groupes: b.groupes }, _dernierId: b.dernierId
    }];
    if (!espaces[0].jeton)
      throw new Error('Aucun jeton Discord : réglez-le dans le panneau (Liaison Discord → Bot), ou posez DISCORD_TOKEN dans .env.');
    return;
  }
  const inv = await P.inventaire(CFG);
  const avant = new Set(espaces.map(e => e.id));
  espaces = inv.espaces;
  if (premier || CFG.verbeux) {
    for (const x of inv.incomplets || [])
      L(`  ⚠ « ${x.nom} » a un bot mais pas de ${x.manque} — il n’est pas servi.`);
  }
  // Un client qui vient d'être branché se signale : c'est le moment où
  // l'on veut savoir que ça a pris, sans relire les journaux du serveur.
  for (const e of espaces) if (!avant.has(e.id)) L(`  + « ${e.nom} » rejoint le bot.`);
  for (const id of avant) if (!espaces.some(e => e.id === id)) {
    L(`  − l’espace #${id} ne fait plus partie du bot.`);
    connus.delete(id);
  }
}

/* ---------- préparation des salons ----------
   ⚠️ Le bot ne crée QUE ce qui manque, et se souvient de ce qu'il a créé.
   Sans mémoire, un salon renommé par le staff serait recréé à côté à
   chaque démarrage — et l'on se retrouverait avec quatre « #anticheat ».
   ⚠️ Il ne supprime JAMAIS : un salon porte l'historique de modération du
   serveur, et c'est au staff d'en décider, pas à un programme. */
async function preparerSalons(esp, catalogue, etat) {
  const existants = await D.salons(esp.jeton, esp.guilde);
  const parId = new Map(existants.map(c => [c.id, c]));
  const parNom = new Map(existants.filter(c => c.type === D.TYPE_TEXTE).map(c => [c.name, c]));
  const parCat = new Map(existants.filter(c => c.type === D.TYPE_CATEGORIE).map(c => [c.name, c]));
  const o = esp.options || {};
  let crees = 0;

  for (const g of catalogue.groupes) {
    const nomCat = R.nomSalon('', g.label).replace(/-/g, ' ').toUpperCase();
    let cat = (etat.categories[g.id] && parId.get(etat.categories[g.id])) || parCat.get(nomCat);
    if (!cat && o.creerSalons !== false) {
      cat = await D.creerSalon(esp.jeton, esp.guilde, { name: nomCat, type: D.TYPE_CATEGORIE });
      L(`  [${esp.nom}] catégorie créée : ${nomCat}`); crees++;
    }
    if (cat) etat.categories[g.id] = cat.id;

    for (const r of catalogue.rubriques.filter(x => x.groupe === g.id)) {
      if ((o.rubriques || []).length && !o.rubriques.includes(r.id)) continue;
      const nom = R.nomSalon(o.prefixe, r.label);
      let sal = (etat.salons[r.id] && parId.get(etat.salons[r.id])) || parNom.get(nom);
      if (!sal && o.creerSalons !== false) {
        sal = await D.creerSalon(esp.jeton, esp.guilde, {
          name: nom, type: D.TYPE_TEXTE, parent_id: cat ? cat.id : undefined,
          topic: `${r.label} — ${esp.nom}. Reporté automatiquement par Origin Logs.`
        });
        L(`  [${esp.nom}] salon créé : #${nom}`); crees++;
        await D.dormir(400);       // Discord n'aime pas vingt créations d'affilée
      }
      if (sal) etat.salons[r.id] = sal.id;
    }
  }
  ETAT.enregistrer(CFG.etatFichier, tout);
  return crees;
}

/* ---------- présentation d'un espace ---------- */
async function preparer(esp) {
  const etat = ETAT.pour(tout, esp.id);
  const b = esp._catalogue ? { rubriques: esp._catalogue.rubriques, groupes: esp._catalogue.groupes,
                               dernierId: esp._dernierId }
                           : await P.bonjour(CFG, esp.relais);
  const catalogue = { rubriques: b.rubriques, groupes: b.groupes };

  const moi = await D.moi(esp.jeton);
  const g = await D.guilde(esp.jeton, esp.guilde);

  // ⚠️ REPÈRE DE DÉPART : le dernier id du panneau, PAS zéro. Un premier
  // lancement qui repartirait de zéro déverserait des mois de journaux
  // dans Discord, et atteindrait la limite de débit en dix secondes.
  if (etat.dernierId === null || etat.dernierId === undefined) {
    etat.dernierId = b.dernierId || 0;
    ETAT.enregistrer(CFG.etatFichier, tout);
  }
  // Changer de serveur Discord invalide les salons mémorisés.
  if (etat.guilde && etat.guilde !== esp.guilde) {
    L(`  [${esp.nom}] serveur Discord différent : les salons mémorisés sont oubliés.`);
    etat.salons = {}; etat.categories = {};
  }
  etat.guilde = esp.guilde;

  const crees = await preparerSalons(esp, catalogue, etat);
  const prets = Object.keys(etat.salons).length;
  L(`  ✓ ${esp.nom} — bot « ${moi.username} » sur « ${g.name} », ${prets} salon(s)`
    + (crees ? `, ${crees} créé(s)` : '') + `, repère #${etat.dernierId}`);
  if (!prets) L(`    ⚠ aucun salon : il manque la permission « Gérer les salons » au bot.`);
  connus.set(esp.id, { catalogue, prets });
  return catalogue;
}

/* ---------- un tour, pour un espace ---------- */
async function tour(esp) {
  const su = connus.get(esp.id);
  if (!su) return 0;
  const etat = ETAT.pour(tout, esp.id);
  const lot = await P.evenements(CFG, esp.relais, etat.dernierId, esp.options);
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
    const rubrique = su.catalogue.rubriques.find(r => r.id === catId)
      || { id: catId, code: catId.slice(0, 3).toUpperCase(), label: catId };
    if (!salon) { if (CFG.verbeux) L(`  [${esp.nom}] pas de salon pour « ${rubrique.label} »`); continue; }
    for (const msg of R.messages(groupe, rubrique, esp.nom, esp.options)) {
      try {
        await D.poster(esp.jeton, salon, msg);
      } catch (e) {
        // ⚠️ Un salon supprimé ou devenu interdit ne doit pas arrêter les
        // autres : on l'oublie et le prochain démarrage le recréera.
        if (e.code === 404 || e.code === 403) {
          L(`  [${esp.nom}] salon inaccessible pour « ${rubrique.label} » (${e.code}) — il sera recréé.`);
          delete etat.salons[catId];
        } else throw e;
      }
    }
  }

  // ⚠️ On n'avance le repère QU'APRÈS avoir posté. Le faire avant perdrait
  // en silence tout un lot si Discord refusait au milieu — et c'est
  // exactement le lot qu'on voudrait relire.
  etat.dernierId = lot.dernierId;
  ETAT.enregistrer(CFG.etatFichier, tout);
  return evs.length;
}

/* ---------- démarrage ---------- */
async function principal() {
  const manque = verifier();
  if (manque.length) {
    console.error('\n  Configuration incomplète — il manque :\n');
    for (const m of manque) console.error('    · ' + m);
    console.error('\n  Copiez .env.example en .env. Détail : bot/README.md\n');
    process.exit(1);
  }

  L('\n  Origin Logs — bot Discord');
  L('  ├─ panneau   ' + CFG.panneau);
  L('  ├─ mode      ' + (multiEspaces() ? 'tous les espaces (un bot par client)' : 'un seul espace'));

  try { await recharger(true); }
  catch (e) {
    console.error(`\n  Le panneau refuse : ${e.message}`);
    console.error(multiEspaces()
      ? '  Vérifiez PANEL_URL et BOT_KEY (la même valeur que dans api/.env).\n'
      : '  Vérifiez PANEL_URL et RELAY_KEY (panneau → Liaison Discord → Bot).\n');
    process.exit(1);
  }

  if (!espaces.length) {
    L('  └─ aucun espace à servir pour l’instant.');
    L('\n  Un client branche son bot depuis son panneau : Liaison Discord → Bot Discord.');
    L('  Le processus le verra tout seul, sans redémarrage.\n');
  } else L(`  └─ ${espaces.length} espace(s) à servir\n`);

  for (const esp of espaces) {
    try { await preparer(esp); }
    catch (e) { L(`  ✕ ${esp.nom} — ${e.message}`); }
  }
  if (arg('--salons')) { L('\n  Salons préparés. Arrêt demandé.\n'); return; }
  L('');

  let dernierInventaire = Date.now();
  const enPanne = new Map();

  while (!arret) {
    // La liste se rafraîchit toute seule : brancher un client dans le
    // panneau suffit à le faire apparaître ici.
    if (multiEspaces() && Date.now() - dernierInventaire > CFG.inventaireMs) {
      dernierInventaire = Date.now();
      try {
        await recharger(false);
        for (const esp of espaces) if (!connus.has(esp.id)) {
          try { await preparer(esp); } catch (e) { L(`  ✕ ${esp.nom} — ${e.message}`); }
        }
      } catch (e) { if (CFG.verbeux) L('  inventaire indisponible : ' + e.message); }
    }

    for (const esp of espaces) {
      if (arret) break;
      try {
        const n = await tour(esp);
        if (n && CFG.verbeux) L(`  [${esp.nom}] ${n} évènement(s) reportés`);
        if (enPanne.get(esp.id)) { L(`  [${esp.nom}] de nouveau joignable.`); enPanne.delete(esp.id); }
      } catch (e) {
        // ⚠️ Une panne sur UN espace ne doit pas arrêter les autres : dix
        // clients servis par un processus, c'est dix pannes possibles et
        // aucune qui ait le droit d'emporter les neuf autres.
        const n = (enPanne.get(esp.id) || 0) + 1;
        enPanne.set(esp.id, n);
        if (n === 1) L(`  [${esp.nom}] ${e.message} — on réessaie, sans perdre le repère.`);
      }
    }
    await D.dormir(CFG.sondageMs);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  arret = true;
  ETAT.enregistrer(CFG.etatFichier, tout);
  L('\n  Arrêt — repères enregistrés.\n');
  process.exit(0);
});

if (arg('--verifier')) {
  const m = verifier();
  if (m.length) { console.error('Incomplet :\n  · ' + m.join('\n  · ')); process.exit(1); }
  console.log('Configuration complète (' + (multiEspaces() ? 'tous les espaces' : 'un seul espace') + ').');
  process.exit(0);
}

principal().catch(e => { console.error('\n  ' + (e && e.stack || e) + '\n'); process.exit(1); });
