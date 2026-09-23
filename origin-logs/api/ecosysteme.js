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
  { id:'qb-banking',       label:'qb-banking',        cat:'boutique_caisse',
    hooks:[{ ev:'qb-banking:server:withdraw', msg:'Retrait au distributeur' },
           { ev:'qb-banking:server:deposit',  msg:'Dépôt au distributeur' }] },
  { id:'esx_banking',      label:'esx_banking',       cat:'boutique_caisse' },
  { id:'Renewed-Banking',  label:'Renewed-Banking',   cat:'boutique_caisse' },
  { id:'okokBanking',      label:'okokBanking',       cat:'boutique_caisse' },
  { id:'qb-garages',       label:'qb-garages',        cat:'proprietes' },
  { id:'cd_garage',        label:'cd_garage',         cat:'proprietes' },
  { id:'jg-advancedgarages', label:'JG Advanced Garages', cat:'proprietes' },
  { id:'qb-houses',        label:'qb-houses',         cat:'proprietes' },
  { id:'ps-housing',       label:'ps-housing',        cat:'proprietes' },
  { id:'qs-housing',       label:'qs-housing',        cat:'proprietes' },
  { id:'qb-shops',         label:'qb-shops',          cat:'boutique_produits' },
  { id:'ox_doorlock',      label:'ox_doorlock',       cat:'proprietes' },
  { id:'qb-ambulancejob',  label:'qb-ambulancejob',   cat:'facture_ems' },
  { id:'esx_ambulancejob', label:'esx_ambulancejob',  cat:'facture_ems' },
  { id:'qb-policejob',     label:'qb-policejob',      cat:'admin' },
  { id:'esx_policejob',    label:'esx_policejob',     cat:'admin' },
  { id:'qb-casino',        label:'qb-casino',         cat:'casino' },
  { id:'qb-adminmenu',     label:'qb-adminmenu',      cat:'admin' },
  { id:'txAdmin',          label:'txAdmin',           cat:'admin' },
  { id:'EasyAdmin',        label:'EasyAdmin',         cat:'admin' },
  { id:'qs-inventory',     label:'qs-inventory',      cat:'inventaire' },
  { id:'codem-inventory',  label:'codem-inventory',   cat:'inventaire' },
  { id:'origen_police',    label:'Origen Police',     cat:'admin' },
  { id:'tgiann-inventory', label:'tgiann-inventory',  cat:'inventaire' },
  { id:'qb-phone',         label:'qb-phone',          cat:'reports' },
  { id:'lb-phone',         label:'lb-phone',          cat:'reports' },
  { id:'qb-management',    label:'qb-management',     cat:'jobs' },
  { id:'esx_society',      label:'esx_society',       cat:'jobs' }
];

/* ---------- reconnaître un nom d'évènement inconnu ----------
   ⚠️ Ce sont des INDICES, pas des vérités : « transfer » peut désigner
   un virement comme un transfert de véhicule. C'est pourquoi rien ne se
   branche tout seul — le panneau propose, l'humain valide. Un mot-clé
   trop large produirait du bruit, et le bruit fait ignorer le reste. */
const INDICES = [
  { cat:'boutique_caisse',   mots:['bank','banque','atm','withdraw','deposit','retrait','virement','paycheck','salaire','salary','invoice','payment','paiement','pay','payer','cash','money','argent','wallet','compte'] },
  { cat:'boutique_monnaie',  mots:['coin','token','credit','donator','vip','grade','rank','boutique','webshop','tebex'] },
  { cat:'boutique_produits', mots:['shop','store','buy','sell','achat','vente','market','purchase'] },
  { cat:'inventaire',        mots:['inventory','inventaire','stash','coffre','item','give','trade','echange','transfer','drop'] },
  { cat:'items_sol',         mots:['pickup','ramasse','ground','sol','loot'] },
  { cat:'proprietes',        mots:['house','housing','maison','apartment','appart','garage','vehicle','vehicule','car','property','propriete','key','cle','impound','fourriere'] },
  { cat:'jobs',              mots:['job','metier','duty','service','society','societe','boss','entreprise','crew','gang','hire','fire','promote'] },
  { cat:'casino',            mots:['casino','poker','blackjack','roulette','slot','bet','mise','gamble'] },
  { cat:'jobs',              mots:['heist','braquage','robbery','robber'] },
  { cat:'facture_ems',       mots:['ems','ambulance','medic','heal','revive','soin','hopital','hospital','facture'] },
  { cat:'combat',            mots:['death','die','mort','kill','damage','shot','wound'] },
  { cat:'bans',              mots:['ban','unban','blacklist'] },
  { cat:'sanctions',         mots:['kick','warn','avertissement','mute','jail','prison'] },
  { cat:'anticheat',         mots:['cheat','anticheat','detect','exploit','injector','trigger'] },
  { cat:'admin',             mots:['admin','staff','noclip','godmode','spawn','teleport','tp','revive','setgroup'] },
  { cat:'reports',           mots:['report','signalement','ticket','helpme','support'] }
];

/* ⚠️ Un nom qui se déclenche à chaque image n'a rien à faire dans un
   journal : à 40 joueurs, un `hud:update` produit des millions de lignes
   par jour et rend le panneau illisible. On les écarte AVANT de les
   proposer — proposer puis compter sur la vigilance, c'est proposer. */
const BRUIT = ['hud', 'update', 'sync', 'tick', 'loop', 'draw', 'nui', 'ping',
               'heartbeat', 'refresh', 'position', 'coords', 'stress', 'hunger',
               'thirst', 'stamina', 'minimap', 'blip', 'marker', 'anim', 'progress'];

const normal = s => String(s || '').toLowerCase();

/* ⚠️ ON COMPARE DES MOTS, PAS DES MORCEAUX DE MOTS. Le premier jet
   cherchait le mot-clé n'importe où dans le nom : « draw » (du bruit
   d'affichage) reconnaissait « withdraw », et l'évènement de retrait
   bancaire — exactement celui qu'on veut — partait à la poubelle. Même
   piège dans l'autre sens : « cle » aurait reconnu « oracle », « tp »
   à peu près tout. On découpe donc le nom en mots, séparateurs ET
   casse mélangée comprises (`playerHudTick` → player, hud, tick). */
const mots = ev => normal(String(ev || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  .split(/[^a-z0-9]+/).filter(Boolean);

/* Un mot-clé court doit correspondre EXACTEMENT ; à partir de quatre
   lettres, un préfixe suffit (« bank » reconnaît « banking », « item »
   reconnaît « items »). Sans ce seuil, les mots de deux ou trois lettres
   rattraperaient la moitié du dictionnaire. */
const colle = (tk, mot) => tk === mot || (mot.length >= 4 && tk.startsWith(mot));
const estBruit = ev => { const t = mots(ev); return BRUIT.some(m => t.some(tk => colle(tk, m))); };

/* Deviner la rubrique d'un nom d'évènement. Renvoie null quand rien ne
   ressort : « je ne sais pas » est une réponse, et elle vaut mieux qu'un
   rangement au hasard que personne ne viendra corriger. */
function deviner(ev) {
  const t = mots(ev);
  let meilleur = null;
  for (const ind of INDICES) {
    for (const mot of ind.mots) {
      if (!t.some(tk => colle(tk, mot))) continue;
      // Le mot le plus long l'emporte : « banque » est plus parlant que
      // « bank » dans « banque_interne », et « vehicule » que « cle ».
      if (!meilleur || mot.length > meilleur.force) meilleur = { cat: ind.cat, force: mot.length, mot };
    }
  }
  return meilleur;
}

/* ---------- le verdict ---------- */
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
      const d = deviner(ev);
      // Une ressource connue impose SA rubrique : elle a été vérifiée à
      // la main, l'indice n'est qu'une approximation.
      const cat = connue ? connue.cat : (d ? d.cat : null);
      if (!cat) { ecartes.sansIndice++; continue; }
      candidats.push({ ressource: entree.nom, ev, cat,
                       sur: connue ? 'catalogue' : 'indice', mot: d ? d.mot : null });
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

module.exports = { NATIF, CONNUES, INDICES, BRUIT, deviner, estBruit, analyser, lua };
