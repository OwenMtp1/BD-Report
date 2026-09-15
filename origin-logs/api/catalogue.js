// ============================================================
// Origin Roleplay — catalogue partagé
// Source unique des catégories, gravités, rôles et permissions.
// L'API le sert sur GET /api/catalogue : le panneau l'adopte au
// lieu de sa copie interne, pour qu'un ajout ici se voie partout
// sans retoucher l'interface.
// ============================================================
'use strict';

// Les catégories sont rangées par MÉTIER : le groupe porte la couleur,
// la catégorie porte le nom. Dix-neuf sigles à plat ne se lisaient pas.
const GROUPS = [
  { id:'moderation', label:'Modération',      fam:'var(--f-surv)'  },
  { id:'joueurs',    label:'Joueurs',         fam:'var(--f-play)'  },
  { id:'biens',      label:'Argent & biens',  fam:'var(--f-bien)'  },
  { id:'boutique',   label:'Boutique',        fam:'var(--f-shop)'  },
  { id:'rp',         label:'Activités RP',    fam:'var(--f-monde)' },
  { id:'serveur',    label:'Staff & serveur', fam:'var(--f-staff)' }
];

const CATS = [
  { id:'bans',              code:'BAN', label:'Bannissement',              group:'moderation', desc:'Bannissements prononcés, levés et refus de connexion.' },
  { id:'sanctions',         code:'AVT', label:'Avertissement',             group:'moderation', desc:'Avertissements, expulsions et rappels à l’ordre.' },
  { id:'anticheat',         code:'ACH', label:'Anticheat',                 group:'moderation', desc:'Détections automatiques et évènements réseau suspects.' },

  { id:'connexions',        code:'CNX', label:'Connexion',                 group:'joueurs',    desc:'Arrivées sur le serveur, file d’attente et refus.' },
  { id:'deconnexion',       code:'DCX', label:'Déconnexion',               group:'joueurs',    desc:'Départs, crashs et coupures de connexion.' },
  { id:'ecran_joueur',      code:'ECR', label:'Écran du joueur',           group:'joueurs',    desc:'Ce que le joueur a sous les yeux : menus, interactions, HUD.' },
  { id:'combat',            code:'MRT', label:'Mort joueur',               group:'joueurs',    desc:'Décès, éliminations, réanimations EMS.' },

  { id:'inventaire',        code:'TRX', label:'Transactions et coffres',   group:'biens',      desc:'Échanges entre joueurs, coffres, stockage et retraits.' },
  { id:'items_sol',         code:'SOL', label:'Items au sol',              group:'biens',      desc:'Objets jetés, ramassés et disparus au sol.' },
  { id:'proprietes',        code:'IMM', label:'Immobilier',                group:'biens',      desc:'Achats, ventes, loyers, clés partagées et coffres de logement.' },

  { id:'boutique_caisse',   code:'BQC', label:'Boutique : caisse',         group:'boutique',   desc:'Paiements encaissés, remboursements et échecs de transaction.' },
  { id:'boutique_monnaie',  code:'BQM', label:'Boutique : monnaie et grades', group:'boutique', desc:'Monnaie de boutique créditée ou dépensée, grades accordés.' },
  { id:'boutique_produits', code:'BQP', label:'Boutique : produits',       group:'boutique',   desc:'Produits livrés, stocks, prix et mises en vente.' },

  { id:'jobs',              code:'ENT', label:'Entreprise et crew',        group:'rp',         desc:'Embauches, grades, prises de service, comptes société et crews.' },
  { id:'casino',            code:'CAS', label:'Casino',                    group:'rp',         desc:'Mises, gains, pertes et jetons échangés.' },
  { id:'facture_ems',       code:'EMS', label:'Facture EMS',               group:'rp',         desc:'Prises en charge médicales facturées et soins payés.' },

  { id:'admin',             code:'STF', label:'Action staff',              group:'serveur',    desc:'Actions du staff en jeu : noclip, spawn, téléportation, revive, don.' }
];

const CAT_IDS = CATS.map(c => c.id);

const SEVS = [
  { id:'critique', label:'Critique',   c:'var(--crit)'  },
  { id:'alerte',   label:'Alerte',     c:'var(--warn)'  },
  { id:'notice',   label:'À vérifier', c:'var(--check)' },
  { id:'info',     label:'Info',       c:'var(--ok)'    }
];

// Droits atomiques. Un droit absent ne masque pas seulement un bouton :
// l'API refuse la route correspondante (cf. requirePerm dans server.js).
const PERMS = [
  { id:'logs.view',            label:'Lire les journaux' },
  { id:'logs.mark',            label:'Épingler et marquer traité' },
  { id:'logs.export',          label:'Exporter en CSV (réservé au Fondateur)' },
  { id:'players.view',         label:'Ouvrir un dossier joueur' },
  { id:'players.identifiers',  label:'Voir les identifiants (license, Discord, Steam)' },
  { id:'actions.warn',         label:'Avertir un joueur' },
  { id:'actions.kick',         label:'Expulser un joueur' },
  { id:'actions.ban',          label:'Bannir un joueur' },
  { id:'actions.unban',        label:'Lever un bannissement' },
  { id:'actions.give',         label:'Rendre un item ou de l’argent' },
  { id:'screens.request',      label:'Demander une capture de l’écran d’un joueur' },
  { id:'audit.view',           label:'Consulter le journal du panneau' },
  { id:'accounts.manage',      label:'Gérer les comptes staff' },
  { id:'settings.discord',     label:'Configurer la liaison Discord et les rôles' },
  { id:'roles.manage',         label:'Créer les rôles et régler leurs accès' }
];
const PERM_IDS = PERMS.map(p => p.id);

// Raccourcis de catégories, par groupe : un rôle se décrit par les
// métiers qu'il couvre, pas par une liste de dix-neuf identifiants.
const G = Object.fromEntries(GROUPS.map(g =>
  [g.id, CATS.filter(c => c.group === g.id).map(c => c.id)]));
const P = {
  // ⚠️ `logs.export` NE FAIT PLUS PARTIE DU SOCLE DE LECTURE.
  // Lire un journal à l'écran et en sortir une copie qui vit ensuite hors
  // du panneau sont deux gestes différents : le second emporte des
  // identifiants, des adresses et des montants dans un fichier que plus
  // personne ne trace. Seul le Fondateur l'a — et c'est un droit comme un
  // autre, donc il peut l'accorder à un rôle depuis « Rôles & accès ».
  lire:    ['logs.view', 'logs.mark', 'players.view'],
  moderer: ['actions.warn', 'actions.kick'],
  bannir:  ['actions.ban', 'actions.unban']
};
const u = (...l) => [...new Set([].concat(...l))];

/* ============================================================
   RÔLES STAFF
   Chaque rôle porte ce qu'il a le DROIT de faire et ce qu'il a le
   droit de VOIR. Les deux comptent : un gérant d'animation n'a rien
   à faire dans les journaux d'anticheat, et l'inverse est vrai aussi.
   `rank` décide qui peut gérer qui.
   Chacun se relie à un rôle Discord (table `settings`, écran
   « Liaison Discord ») : c'est l'ID du rôle qui accorde les droits.
   ============================================================ */
const ROLES = {
  fondateur: {
    label:'Fondateur', rank:100, perms:'*', cats:'*',
    desc:'Tous les droits, y compris la liaison Discord et les comptes.'
  },
  administrateur: {
    label:'Administrateur', rank:90,
    perms: PERM_IDS.filter(x => !['settings.discord', 'roles.manage', 'logs.export'].includes(x)), cats:'*',
    desc:'Tout sauf la liaison Discord, la composition des rôles et l’export.'
  },
  developpeur: {
    label:'Développeur', rank:80,
    perms: u(P.lire, ['audit.view']), cats:'*',
    desc:'Lecture complète, y compris les journaux techniques du serveur.'
  },
  gerant_anticheat: {
    label:'Gérant Brigade Anti-Cheat', rank:70,
    perms: u(P.lire, P.moderer, P.bannir, ['players.identifiers', 'audit.view', 'screens.request']),
    cats: u(G.moderation, G.joueurs, G.rp),
    desc:'Pilote la lutte contre la triche : détections, bannissements, appels.'
  },
  responsable_remboursement: {
    label:'Responsable Remboursement', rank:65,
    perms: u(P.lire, ['players.identifiers', 'actions.give', 'actions.warn']),
    cats: u(G.biens, G.boutique, G.joueurs, ['bans', 'sanctions']),
    desc:'Instruit les demandes de remboursement et rend les biens perdus.'
  },
  gerant_legal: {
    label:'Gérant Légal', rank:60,
    perms: u(P.lire, ['actions.warn']),
    cats: u(G.biens, G.rp, G.joueurs),
    desc:'Suit les entreprises, les emplois et les propriétés.'
  },
  gerant_illegal: {
    label:'Gérant Illégal', rank:60,
    perms: u(P.lire, ['actions.warn']),
    cats: u(G.rp, G.biens, G.joueurs),
    desc:'Suit les organisations, les braquages et les trafics.'
  },
  gerant_animation: {
    label:'Gérant Animation', rank:60,
    perms: u(P.lire, ['actions.give']),
    cats: u(G.joueurs, G.rp, G.boutique),
    desc:'Prépare les events et dédommage les participants.'
  },
  gerant_communication: {
    label:'Gérant Communication', rank:60,
    perms: u(P.lire, []),
    cats: u(G.joueurs),
    desc:'Suit les annonces, les candidatures et les retours joueurs.'
  },
  moderateur: {
    label:'Modérateur', rank:50,
    perms: u(P.lire, P.moderer),
    cats: u(G.moderation, G.joueurs, G.rp, G.biens),
    desc:'Traite les signalements du quotidien : avertir, expulser.'
  },
  anticheat: {
    label:'Brigade Anti-Cheat', rank:45,
    perms: u(P.lire, P.moderer, ['actions.ban', 'screens.request']),
    cats: u(['anticheat', 'bans', 'sanctions'], G.joueurs),
    desc:'Traite les détections et bannit les tricheurs (sans lever).'
  },
  helper: {
    label:'Helper', rank:30,
    perms: u(['logs.view', 'players.view'], ['actions.warn']),
    cats: u(G.joueurs),
    desc:'Accompagne les joueurs et remonte ce qui dépasse.'
  },
  animateur: {
    label:'Animateur', rank:25,
    perms: ['logs.view', 'players.view'],
    cats: u(G.joueurs, G.rp),
    desc:'Anime les events, en lecture seule sur les journaux.'
  },
  communication: {
    label:'Communication', rank:25,
    perms: ['logs.view'],
    cats: u(G.joueurs),
    desc:'Rédige et relaie, sans pouvoir de modération.'
  }
};

// Les bases déjà en service portent les anciens identifiants : les
// renommer sans passerelle aurait dégradé tout le monde en silence.
const ALIAS = { admin: 'administrateur', modo: 'moderateur' };
const canon = r => (ROLES[r] ? r : (ALIAS[r] || 'moderateur'));

/* ---------- catégories retirées ----------
   Le catalogue a été refait sur les rubriques réellement voulues par le
   serveur. Les scripts d'une version précédente peuvent encore émettre
   un ancien identifiant : on le rattache à la rubrique la plus proche
   plutôt que de le laisser tomber dans le fourre-tout. Ce qui n'a PAS
   d'équivalent (chat de proximité, véhicules, craft, drogue, braquages,
   organisations, whitelist) n'est plus journalisé : c'est un choix de
   périmètre, pas un oubli — retirer la rubrique et continuer d'en
   remplir la table aurait donné des journaux que personne ne lit.
   CAT_FALLBACK reçoit tout le reste : une catégorie inconnue est une
   faute de frappe dans un script, et elle doit se VOIR quelque part. */
const CAT_ALIAS = {
  economie:  'inventaire',      // virements, salaires, factures
  staff:     'admin',           // reports et tickets : ce que fait le staff
  systeme:   'admin',
  whitelist: 'connexions',
  chat:      'ecran_joueur'
};
const CAT_FALLBACK = 'admin';
const canonCat = c => (CAT_IDS.includes(c) ? c : (CAT_ALIAS[c] || CAT_FALLBACK));

const ROLE_IDS = Object.keys(ROLES);
const roleOf = r => ROLES[canon(r)];

/* ---------- résolution MULTI-RÔLES ----------
   Une personne cumule souvent plusieurs rôles Discord (Modérateur ET
   Animateur). Prendre le premier trouvé lui retirerait des droits
   qu'elle a : on fait l'UNION des droits et des catégories, et le rang
   retenu est le plus haut. */
const expandPerms = r => (roleOf(r).perms === '*' ? PERM_IDS.slice() : roleOf(r).perms.slice());
const expandCats  = r => (roleOf(r).cats  === '*' ? CATS.map(c => c.id) : roleOf(r).cats.slice());

const permsOfRoles = ids => u(...(ids || []).filter(Boolean).map(expandPerms));
const catsOfRoles  = ids => {
  const all = CATS.map(c => c.id);
  const set = u(...(ids || []).filter(Boolean).map(expandCats));
  return all.filter(c => set.includes(c));      // toujours dans l'ordre du catalogue
};
const rankOfRoles  = ids => Math.max(0, ...(ids || []).filter(Boolean).map(r => roleOf(r).rank));
const mainRole     = ids => (ids || []).filter(Boolean)
  .sort((a, b) => roleOf(b).rank - roleOf(a).rank)[0] || 'moderateur';

// Compatibilité mono-rôle (staff.js, comptes créés à la main).
const permsOf  = r => permsOfRoles([r]);
const catsOf   = r => catsOfRoles([r]);
const rankOf   = r => roleOf(r).rank;
const hasPerm  = (r, p) => permsOf(r).includes(p);
const canSeeCat = (r, c) => catsOf(r).includes(c);

// déclaré plus haut pour canonCat

const SEV_IDS = SEVS.map(s => s.id);

module.exports = { CATS, SEVS, GROUPS, CAT_IDS, SEV_IDS, canonCat, CAT_ALIAS, CAT_FALLBACK, PERMS, PERM_IDS, ROLES, ROLE_IDS,
                   roleOf, canon, permsOf, catsOf, rankOf, hasPerm, canSeeCat,
                   permsOfRoles, catsOfRoles, rankOfRoles, mainRole };
