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
  { id:'accounts.manage',      label:'Gérer les comptes staff' }
];
const PERM_IDS = PERMS.map(p => p.id);

// Les catégories qu'un rôle NE voit pas sont filtrées côté serveur, dans la
// requête SQL : un modérateur ne peut pas les obtenir en forgeant une requête.
const ROLES = {
  moderateur: {
    label:'Modérateur', rank:1,
    perms:['logs.view','logs.mark','logs.export','players.view','actions.warn','actions.kick'],
    cats: CATS.map(c => c.id).filter(id => !['admin','whitelist','systeme'].includes(id))
  },
  admin: {
    label:'Administrateur', rank:2,
    perms:['logs.view','logs.mark','logs.export','players.view','players.identifiers',
           'actions.warn','actions.kick','actions.ban','actions.unban','actions.give','audit.view'],
    cats:'*'
  },
  fondateur: {
    label:'Fondateur', rank:3,
    perms:'*',
    cats:'*'
  }
};

const roleOf   = r => ROLES[r] || ROLES.moderateur;
const permsOf  = r => { const x = roleOf(r); return x.perms === '*' ? PERM_IDS.slice() : x.perms.slice(); };
const catsOf   = r => { const x = roleOf(r); return x.cats  === '*' ? CATS.map(c => c.id) : x.cats.slice(); };
const hasPerm  = (r, p) => permsOf(r).includes(p);
const canSeeCat = (r, c) => catsOf(r).includes(c);

const CAT_IDS = CATS.map(c => c.id);
const SEV_IDS = SEVS.map(s => s.id);

module.exports = { CATS, SEVS, GROUPS, CAT_IDS, SEV_IDS, PERMS, PERM_IDS, ROLES,
                   roleOf, permsOf, catsOf, hasPerm, canSeeCat };
