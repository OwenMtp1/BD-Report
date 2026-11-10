'use strict';
/* ============================================================
   Ce que fait tourner le serveur d'un client, et ce qu'on en tire
   ============================================================
   `origin_logs` s'adapte déjà à ESX, QBCore, QBox, ox_inventory,
   baseevents et screenshot-basic. Mais un serveur FiveM tourne avec 80 à
   150 ressources, dont la moitié achetées ou écrites sur mesure : chez
   un client donné, la moitié des rubriques du panneau restait vide, et
   la seule issue était qu'un humain ouvre EXEMPLES.md et ajoute des
   lignes à la main. C'est exactement ce que personne ne fait.

   Deux niveaux, et ils ne répondent pas à la même question :

   · L'INVENTAIRE dit « qu'est-ce qui tourne ici ? ». Une liste de noms,
     comparée à ce catalogue. Il ne trouve rien de neuf, mais il dit
     POURQUOI la rubrique Banque est vide chez ce client — et c'est la
     question qu'on se posait à chaque livraison.

   · Le SCAN dit « qu'est-ce que ce code sait faire ? ». Il lit les
     scripts serveur des autres ressources et en extrait les NOMS des
     évènements, exports et commandes.

   ⚠️ **Le code ne quitte JAMAIS la machine du client.** Seuls des noms
   remontent. Beaucoup de ressources FiveM sont payantes et sous licence :
   envoyer leur source vers un panneau tiers serait un problème juridique
   et commercial, pas un détail d'implémentation.

   ⚠️ **Ce catalogue GROSSIT au fil des clients.** C'est sa raison d'être :
   la vingtième installation reconnaît ce que les dix-neuf précédentes ont
   appris. Ajouter une entrée ici suffit — rien d'autre à toucher.
   ============================================================ */

const CAT = require('./catalogue.js');
const CLASSEUR = require('./classeur.js');

/* ---------- ce que la ressource gère DÉJÀ toute seule ----------
   Une entrée ici veut dire : présente, elle est branchée sans rien
   écrire. Le dire est aussi utile que de signaler un manque — sinon on
   ajoute un raccordement en double, et chaque évènement est journalisé
   deux fois. */
const NATIF = [
  { id:'es_extended',     label:'ESX',              donne:['jobs'] },
  { id:'qb-core',         label:'QBCore',           donne:['jobs','inventaire'] },
  { id:'qbx_core',        label:'QBox',             donne:['jobs','inventaire'] },
  { id:'ox_inventory',    label:'ox_inventory',     donne:['inventaire','items_sol'] },
  { id:'baseevents',      label:'baseevents',       donne:['combat','deconnexion'],
    requis:true, sans:'Sans elle, aucune mort de joueur n’est journalisée.' },
  { id:'screenshot-basic',label:'screenshot-basic', donne:['ecran_joueur'],
    sans:'Sans elle, la rubrique « Écran du joueur » reste vide.' }
];

/* ---------- ressources connues, à raccorder ----------
   `hooks` porte des évènements RÉELS, vérifiés dans la documentation ou
   le code public de la ressource. Ce qu'on ne sait pas, on ne l'invente
   pas : une entrée sans `hooks` sert quand même — elle dit « on connaît
   cette ressource, voilà la rubrique qu'elle alimente ». */
const CONNUES = [
  // ⚠️ UNE BANQUE EN JEU N'EST PAS LA CAISSE DE LA BOUTIQUE. Ces quatre
  // ressources étaient rangées en « Boutique : caisse » — la rubrique des
  // paiements en EUROS (Tebex) : chez un client, chaque retrait au
  // distributeur s'affichait à côté des achats de grade VIP.
  { id:'qb-banking',       label:'qb-banking',        cat:'inventaire',
    hooks:[{ ev:'qb-banking:server:withdraw', msg:'Retrait au distributeur' },
           { ev:'qb-banking:server:deposit',  msg:'Dépôt au distributeur' }] },
  { id:'esx_banking',      label:'esx_banking',       cat:'inventaire' },
  { id:'Renewed-Banking',  label:'Renewed-Banking',   cat:'inventaire' },
  { id:'okokBanking',      label:'okokBanking',       cat:'inventaire' },
  { id:'qb-garages',       label:'qb-garages',        cat:'proprietes' },
  { id:'cd_garage',        label:'cd_garage',         cat:'proprietes' },
  { id:'jg-advancedgarages', label:'JG Advanced Garages', cat:'proprietes' },
  { id:'qb-houses',        label:'qb-houses',         cat:'proprietes' },
  { id:'ps-housing',       label:'ps-housing',        cat:'proprietes' },
  { id:'qs-housing',       label:'qs-housing',        cat:'proprietes' },
  { id:'qb-shops',         label:'qb-shops',          cat:'inventaire' },      // magasin EN JEU : une transaction
  { id:'ox_doorlock',      label:'ox_doorlock',       cat:'proprietes' },
  { id:'qb-ambulancejob',  label:'qb-ambulancejob',   cat:'facture_ems' },
  { id:'esx_ambulancejob', label:'esx_ambulancejob',  cat:'facture_ems' },
  // La police est un MÉTIER tenu par des joueurs, pas le staff du serveur.
  { id:'qb-policejob',     label:'qb-policejob',      cat:'jobs' },
  { id:'esx_policejob',    label:'esx_policejob',     cat:'jobs' },
  { id:'qb-casino',        label:'qb-casino',         cat:'casino' },
  { id:'qb-adminmenu',     label:'qb-adminmenu',      cat:'admin' },
  { id:'txAdmin',          label:'txAdmin',           cat:'admin' },
  { id:'EasyAdmin',        label:'EasyAdmin',         cat:'admin' },
  { id:'qs-inventory',     label:'qs-inventory',      cat:'inventaire' },
  { id:'codem-inventory',  label:'codem-inventory',   cat:'inventaire' },
  { id:'origen_police',    label:'Origen Police',     cat:'jobs' },
  { id:'tgiann-inventory', label:'tgiann-inventory',  cat:'inventaire' },
  // Un téléphone n'est pas un ticket : messages, appels et annonces sont ce
  // que le joueur a sous les yeux.
  { id:'qb-phone',         label:'qb-phone',          cat:'ecran_joueur' },
  { id:'lb-phone',         label:'lb-phone',          cat:'ecran_joueur' },
  { id:'qb-management',    label:'qb-management',     cat:'jobs' },
  { id:'esx_society',      label:'esx_society',       cat:'jobs' }
];

/* ---------- reconnaître un nom d'évènement inconnu ----------
   Le dictionnaire, la notation et les pièges vivent dans `classeur.js` :
   un seul endroit où ajouter un mot. Ce qui suit n'en est que la porte
   d'entrée pour le scan.
   ⚠️ Ce sont des INDICES, pas des vérités. Un rangement fait à la main
   dans le panneau l'emporte toujours, et n'est jamais défait. */
const INDICES = Object.entries(CLASSEUR.DICO).map(([cat, n]) => ({
  cat, mots: [].concat(n.forts || [], n.moyens || [], n.faibles || []) }));
const BRUIT = CLASSEUR.BRUIT;
const normal = s => String(s || '').toLowerCase();
const estBruit = ev => CLASSEUR.estBruit(ev);

/* Deviner la rubrique d'un nom d'évènement — avec le nom de la ressource
   quand on le connaît : `jg-advancedgarages` range ses évènements même
   quand leur nom ne dit rien. Renvoie null quand rien ne ressort : « je
   ne sais pas » vaut mieux qu'un rangement au hasard. */
function deviner(ev, ressource) {
  const r = CLASSEUR.classer({ ressource: ressource || '', evenement: ev });
  return r ? { cat: r.cat, force: r.score, mot: r.mot, accord: r.accord } : null;
}

/* ---------- le verdict ---------- */
/* ============================================================
   LES CAPACITÉS D'ACTION — « où sont les systèmes qui exécutent
   les gestes du panneau ? »
   ⚠️ Réanimer et voir l'inventaire NE SONT PAS UNIVERSELS : ils
   dépendent du système d'inventaire et du métier ambulancier que CE
   serveur fait tourner. On les repère dans la liste des ressources déjà
   reçue (l'inventaire de niveau 1) : le staff sait ainsi, avant même
   d'essayer, si « Voir l'inventaire » a une chance d'aboutir ici, et
   avec quelle ressource.
   Le premier reconnu gagne — l'ordre va du plus répandu au plus rare. */
const CAPACITES = [
  { geste:'inventaire', label:'Voir l’inventaire', ressources:[
      { id:'ox_inventory', label:'ox_inventory' },
      { id:'qb-inventory', label:'qb-inventory' },
      { id:'qs-inventory', label:'qs-inventory' },
      { id:'origen_inventory', label:'origen_inventory' },
      { id:'codem-inventory', label:'codem-inventory' } ] },
  { geste:'reanimation', label:'Réanimer', ressources:[
      { id:'esx_ambulancejob', label:'esx_ambulancejob' },
      { id:'qb-ambulancejob', label:'qb-ambulancejob' },
      { id:'qbx_ambulancejob', label:'qbx_ambulancejob' },
      { id:'wasabi_ambulance', label:'wasabi_ambulance' },
      { id:'ars_ambulancejob', label:'ars_ambulancejob' } ] }
];

// ⚠️ Les gestes UNIVERSELS n'ont pas besoin de détection : soigner,
// geler, écrire un message et expulser/bannir sont des natives ou des
// décisions du panneau. On le DIT, pour qu'un « non détecté » sur
// l'inventaire ne laisse pas croire que tout est en panne.
const GESTES_UNIVERSELS = ['Soigner', 'Geler / dégeler', 'Envoyer un message',
                           'Avertir', 'Expulser', 'Bannir'];

function capacites(res, presente) {
  const framework = res.length; // inutile ici, gardé lisible
  return CAPACITES.map(c => {
    const trouve = c.ressources.find(r => {
      const p = presente(r.id);
      return p && p.etat === 'started';
    });
    return { geste:c.geste, label:c.label,
             // Le nom exact de la ressource qui l'assure, ou null : c'est
             // ce qui distingue « prêt » de « à confirmer sur le serveur ».
             ressource: trouve ? trouve.label : null,
             candidats: c.ressources.map(r => r.label) };
  });
}

function analyser(inventaire, scan) {
  const res = (inventaire && inventaire.ressources) || [];
  const parNom = new Map(res.map(r => [normal(r.nom), r]));
  const presente = id => parNom.get(normal(id));

  const natives = NATIF.map(n => {
    const r = presente(n.id);
    return { id:n.id, label:n.label, donne:n.donne, requis:!!n.requis, sans:n.sans || '',
             etat: r ? (r.etat === 'started' ? 'branche' : 'arretee') : 'absente' };
  });

  const connues = CONNUES.filter(c => presente(c.id)).map(c => ({
    id:c.id, label:c.label, cat:c.cat, hooks:c.hooks || [],
    etat: presente(c.id).etat === 'started' ? 'a_brancher' : 'arretee'
  }));

  const idsConnus = new Set([...NATIF, ...CONNUES].map(x => normal(x.id)));
  const inconnues = res.filter(r => !idsConnus.has(normal(r.nom)));

  /* Les candidats du scan. Un évènement déjà couvert par un raccordement
     natif n'est pas proposé : le journaliser une seconde fois doublerait
     chaque ligne, et c'est le genre de doublon qu'on ne remarque qu'au
     bout d'un mois. */
  const dejaVus = new Set();
  for (const n of NATIF) if (presente(n.id)) dejaVus.add(normal(n.id));

  const candidats = [], ecartes = { bruit: 0, sansIndice: 0, natif: 0 };
  for (const entree of (scan && scan.ressources) || []) {
    if (dejaVus.has(normal(entree.nom))) { ecartes.natif += (entree.evenements || []).length; continue; }
    const connue = CONNUES.find(c => normal(c.id) === normal(entree.nom));
    for (const ev of entree.evenements || []) {
      if (estBruit(ev)) { ecartes.bruit++; continue; }
      const d = deviner(ev, entree.nom);
      /* ⚠️ UNE RESSOURCE CONNUE DONNE LA RUBRIQUE PAR DÉFAUT, PAS LA
         RUBRIQUE DE TOUT. Elle imposait la sienne à chacun de ses
         évènements : `qb-adminmenu` rangeait un bannissement en « Action
         staff », hors du registre où on le cherche. Un mot FORT dans le
         nom de l'évènement (ban, kick, report…) l'emporte désormais ; à
         défaut, la ressource décide comme avant. */
      const net = d && d.force >= 15 && connue && d.cat !== connue.cat;
      const cat = net ? d.cat : (connue ? connue.cat : (d ? d.cat : null));
      if (!cat) { ecartes.sansIndice++; continue; }
      candidats.push({ ressource: entree.nom, ev, cat,
                       sur: connue && !net ? 'catalogue' : 'indice', mot: d ? d.mot : null });
    }
  }
  // Le plus sûr en premier : ce qui vient du catalogue, puis l'indice le
  // plus parlant. Une liste de deux cents lignes ne se lit que par le haut.
  candidats.sort((a, b) => (a.sur === b.sur ? 0 : a.sur === 'catalogue' ? -1 : 1)
                        || a.ressource.localeCompare(b.ressource));

  return {
    quand: inventaire ? inventaire.ts : null,
    quandScan: scan ? scan.ts : null,
    framework: (inventaire && inventaire.framework) || null,
    total: res.length,
    natives, connues,
    inconnues: inconnues.map(r => ({ nom:r.nom, etat:r.etat, version:r.version || '' })),
    protegees: (scan && scan.protegees) || [],
    candidats, ecartes,
    // Ce que le panneau peut EXÉCUTER ici, et par quelle ressource.
    capacites: capacites(res, presente),
    gestesUniversels: GESTES_UNIVERSELS,
    rubriquesCouvertes: [...new Set(natives.filter(n => n.etat === 'branche')
      .flatMap(n => n.donne).concat(candidats.map(c => c.cat)))]
  };
}

/* ---------- le fichier à déposer chez le client ----------
   ⚠️ JAMAIS de `RegisterNetEvent` ici, et ce n'est pas un détail de
   style. Enregistrer en « net » un évènement qui ne l'était pas le rend
   déclenchable PAR LES CLIENTS : n'importe quel joueur pourrait alors
   appeler le gestionnaire d'origine — celui qui donne l'argent. On
   ajoute donc seulement un écouteur ; si l'évènement est déjà net, le
   nôtre se déclenche aussi, et s'il est interne, il se déclenche sur le
   TriggerEvent. Dans les deux cas on écoute, on n'ouvre rien. */
function lua(choix, nomEspace) {
  const lignes = [
    '-- ============================================================',
    '-- origin_logs — raccordements propres à ce serveur',
    '-- Généré par le panneau' + (nomEspace ? ' — ' + String(nomEspace).replace(/[\r\n]/g, ' ') : ''),
    '-- ============================================================',
    '-- À déposer dans  resources/origin_logs/server/sur_mesure/  ',
    '-- (créez le dossier) : le fxmanifest le charge par motif, donc il',
    '-- n’y a rien à déclarer, et une mise à jour de la ressource ne',
    '-- l’écrase pas — le script d’installation ne télécharge que ses',
    '-- propres fichiers.',
    '--',
    '-- ⚠️ Ce fichier n’utilise QUE AddEventHandler, jamais',
    '--    RegisterNetEvent : enregistrer en « net » un évènement qui ne',
    '--    l’était pas le rendrait déclenchable par les joueurs.',
    '--',
    '-- ⚠️ Les arguments d’un évènement inconnu ne sont pas interprétés :',
    '--    on les journalise tels quels. Quand vous aurez vu passer de',
    '--    vraies lignes, remplacez le message par une vraie phrase.',
    '-- ============================================================',
    ''
  ];
  const vus = new Set();
  for (const c of choix) {
    const ev = String(c.ev || '');
    // Un nom d'évènement vient d'un fichier du client : il entre dans une
    // chaîne Lua, donc il se valide au lieu de se faire confiance.
    if (!/^[A-Za-z0-9_.:\-\[\]/]{2,120}$/.test(ev)) continue;
    if (vus.has(ev)) continue;
    vus.add(ev);
    const cat = CAT.CAT_IDS.includes(c.cat) ? c.cat : 'admin';
    const sev = ['critique', 'alerte', 'notice', 'info'].includes(c.sev) ? c.sev : 'info';
    const titre = (c.msg && String(c.msg).replace(/['\r\n]/g, ' ').slice(0, 80)) || ev;
    lignes.push(
      `-- ${c.ressource || 'sur mesure'}`,
      `AddEventHandler('${ev}', function(...)`,
      `  local src = source`,
      `  exports['origin_logs']:Log({`,
      `    cat = '${cat}', sev = '${sev}', actor = src > 0 and src or nil,`,
      `    msg = '${titre}',`,
      `    data = { kind = 'auto', evenement = '${ev}', args = { ... } },`,
      `    res = '${String(c.ressource || '').replace(/'/g, '')}'`,
      `  })`,
      `end)`,
      ''
    );
  }
  if (vus.size === 0) lignes.push('-- Aucun raccordement retenu.');
  return lignes.join('\n');
}

module.exports = { NATIF, CONNUES, INDICES, BRUIT, CAPACITES, deviner, estBruit, analyser, lua };
