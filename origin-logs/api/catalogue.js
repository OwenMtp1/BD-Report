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
  { id:'rp',         label:'Activités RP',    fam:'var(--f-monde)' },
  { id:'serveur',    label:'Staff & serveur', fam:'var(--f-staff)' }
];

const CATS = [
  { id:'bans',         code:'BAN', label:'Bannissements',      group:'moderation', desc:'Bannissements prononcés, levés et refus de connexion.' },
  { id:'sanctions',    code:'SNC', label:'Sanctions',          group:'moderation', desc:'Avertissements, expulsions et coupures de vocal.' },
  { id:'anticheat',    code:'ACH', label:'Anticheat',          group:'moderation', desc:'Détections automatiques et évènements réseau suspects.' },
  { id:'staff',        code:'RPT', label:'Reports & tickets',  group:'moderation', desc:'Signalements joueurs, prises en charge et clôtures.' },

  { id:'connexions',   code:'CNX', label:'Connexions',         group:'joueurs',    desc:'Arrivées, départs, file d’attente et refus de whitelist.' },
  { id:'chat',         code:'CHT', label:'Chat & commandes',   group:'joueurs',    desc:'Proximité, OOC, /me, /do, Twitter et commandes joueur.' },
  { id:'combat',       code:'CBT', label:'Combat & morts',     group:'joueurs',    desc:'Dégâts, éliminations, décès et réanimations EMS.' },

  { id:'economie',     code:'ECO', label:'Économie',           group:'biens',      desc:'Liquide, banque, virements, salaires, factures et amendes.' },
  { id:'inventaire',   code:'INV', label:'Inventaire',         group:'biens',      desc:'Échanges, sols, coffres, stockage et suppressions staff.' },
  { id:'vehicules',    code:'VEH', label:'Véhicules',          group:'biens',      desc:'Garages, fourrière, concession, effractions et destructions.' },
  { id:'craft',        code:'CRF', label:'Craft & armes',      group:'biens',      desc:'Établis, composants, armes et munitions fabriquées.' },

  { id:'jobs',         code:'JOB', label:'Jobs & entreprises', group:'rp',         desc:'Embauches, grades, prises de service et comptes société.' },
  { id:'proprietes',   code:'IMM', label:'Propriétés',         group:'rp',         desc:'Achats, loyers, clés partagées et coffres de logement.' },
  { id:'organisations',code:'ORG', label:'Organisations',      group:'rp',         desc:'Coffres d’orga, adhésions, grades, territoires et guerres.' },
  { id:'braquages',    code:'BRQ', label:'Braquages',          group:'rp',         desc:'Fleeca, Pacific, bijouterie : départ, butin, issue.' },
  { id:'drogue',       code:'DRG', label:'Drogue & labos',     group:'rp',         desc:'Champs, récolte, transformation, revente et saisies.' },

  { id:'admin',        code:'ADM', label:'Administration',     group:'serveur',    desc:'Actions staff en jeu : noclip, spawn, téléportation, revive.' },
  { id:'whitelist',    code:'WLT', label:'Whitelist',          group:'serveur',    desc:'Candidatures Discord, entretiens, acceptations et refus.' },
  { id:'systeme',      code:'SYS', label:'Serveur',            group:'serveur',    desc:'Redémarrages, erreurs de ressource, performance et sauvegardes.' }
];

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
  { id:'logs.export',          label:'Exporter en CSV' },
  { id:'players.view',         label:'Ouvrir un dossier joueur' },
  { id:'players.identifiers',  label:'Voir les identifiants (license, Discord, Steam)' },
  { id:'actions.warn',         label:'Avertir un joueur' },
  { id:'actions.kick',         label:'Expulser un joueur' },
  { id:'actions.ban',          label:'Bannir un joueur' },
  { id:'actions.unban',        label:'Lever un bannissement' },
  { id:'actions.give',         label:'Rendre un item ou de l’argent' },
  { id:'audit.view',           label:'Consulter le journal du panneau' },
  { id:'accounts.manage',      label:'Gérer les comptes staff' },
  { id:'settings.discord',     label:'Configurer la liaison Discord et les rôles' },
  { id:'roles.manage',         label:'Créer les rôles et régler leurs accès' }
];
const PERM_IDS = PERMS.map(p => p.id);

// Raccourcis de catégories, par groupe : un rôle se décrit par les
// métiers qu'il couvre, pas par une liste de dix-neuf identifiants.
const G = {
  moderation: CATS.filter(c => c.group === 'moderation').map(c => c.id),
  joueurs:    CATS.filter(c => c.group === 'joueurs').map(c => c.id),
  biens:      CATS.filter(c => c.group === 'biens').map(c => c.id),
  rp:         CATS.filter(c => c.group === 'rp').map(c => c.id),
  serveur:    CATS.filter(c => c.group === 'serveur').map(c => c.id)
};
const P = {
  lire:    ['logs.view', 'logs.mark', 'logs.export', 'players.view'],
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
    perms: PERM_IDS.filter(x => !['settings.discord', 'roles.manage'].includes(x)), cats:'*',
    desc:'Tout sauf la liaison Discord et la composition des rôles.'
  },
  developpeur: {
    label:'Développeur', rank:80,
    perms: u(P.lire, ['audit.view']), cats:'*',
    desc:'Lecture complète, y compris les journaux techniques du serveur.'
  },
  gerant_anticheat: {
    label:'Gérant Brigade Anti-Cheat', rank:70,
    perms: u(P.lire, P.moderer, P.bannir, ['players.identifiers', 'audit.view']),
    cats: u(G.moderation, G.joueurs, G.rp),
    desc:'Pilote la lutte contre la triche : détections, bannissements, appels.'
  },
  responsable_remboursement: {
    label:'Responsable Remboursement', rank:65,
    perms: u(P.lire, ['players.identifiers', 'actions.give', 'actions.warn']),
    cats: u(G.biens, G.joueurs, ['staff', 'bans', 'sanctions']),
    desc:'Instruit les demandes de remboursement et rend les biens perdus.'
  },
  gerant_legal: {
    label:'Gérant Légal', rank:60,
    perms: u(P.lire, ['actions.warn']),
    cats: u(G.biens, G.rp, G.joueurs, ['staff']),
    desc:'Suit les entreprises, les emplois et les propriétés.'
  },
  gerant_illegal: {
    label:'Gérant Illégal', rank:60,
    perms: u(P.lire, ['actions.warn']),
    cats: u(G.rp, G.biens, G.joueurs, ['staff']),
    desc:'Suit les organisations, les braquages et les trafics.'
  },
  gerant_animation: {
    label:'Gérant Animation', rank:60,
    perms: u(P.lire, ['actions.give']),
    cats: u(G.joueurs, G.rp, ['systeme', 'staff']),
    desc:'Prépare les events et dédommage les participants.'
  },
  gerant_communication: {
    label:'Gérant Communication', rank:60,
    perms: u(P.lire, []),
    cats: u(G.joueurs, ['staff', 'whitelist']),
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
    perms: u(P.lire, P.moderer, ['actions.ban']),
    cats: u(['anticheat', 'bans', 'sanctions'], G.joueurs),
    desc:'Traite les détections et bannit les tricheurs (sans lever).'
  },
  helper: {
    label:'Helper', rank:30,
    perms: u(['logs.view', 'players.view'], ['actions.warn']),
    cats: u(G.joueurs, ['staff']),
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
    cats: u(G.joueurs, ['staff', 'whitelist']),
    desc:'Rédige et relaie, sans pouvoir de modération.'
  }
};

// Les bases déjà en service portent les anciens identifiants : les
// renommer sans passerelle aurait dégradé tout le monde en silence.
const ALIAS = { admin: 'administrateur', modo: 'moderateur' };
const canon = r => (ROLES[r] ? r : (ALIAS[r] || 'moderateur'));

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

const CAT_IDS = CATS.map(c => c.id);
const SEV_IDS = SEVS.map(s => s.id);

module.exports = { CATS, SEVS, GROUPS, CAT_IDS, SEV_IDS, PERMS, PERM_IDS, ROLES, ROLE_IDS,
                   roleOf, canon, permsOf, catsOf, rankOf, hasPerm, canSeeCat,
                   permsOfRoles, catsOfRoles, rankOfRoles, mainRole };
