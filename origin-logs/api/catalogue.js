// ============================================================
// Origin Roleplay — catalogue partagé
// Source unique des catégories, gravités, rôles et permissions.
// L'API le sert sur GET /api/catalogue : le panneau l'adopte au
// lieu de sa copie interne, pour qu'un ajout ici se voie partout
// sans retoucher l'interface.
// ============================================================
'use strict';

const FAM = {
  social: 'var(--fam-social)',
  risque: 'var(--fam-risque)',
  biens:  'var(--fam-biens)',
  civil:  'var(--fam-civil)',
  staff:  'var(--fam-staff)'
};

const CATS = [
  { id:'connexions',    code:'CNX', label:'Connexions',           fam:FAM.social, desc:'Arrivées, départs, file d’attente et refus de whitelist.' },
  { id:'chat',          code:'CHT', label:'Chat & commandes',     fam:FAM.social, desc:'Proximité, OOC, /me, /do, Twitter et commandes joueur.' },
  { id:'combat',        code:'CBT', label:'Combat & morts',       fam:FAM.risque, desc:'Dégâts, éliminations, décès et réanimations EMS.' },
  { id:'economie',      code:'ECO', label:'Économie',             fam:FAM.biens,  desc:'Liquide, banque, virements, salaires, factures et amendes.' },
  { id:'inventaire',    code:'INV', label:'Inventaire',           fam:FAM.biens,  desc:'Échanges, sols, coffres, stockage et suppressions staff.' },
  { id:'vehicules',     code:'VEH', label:'Véhicules',            fam:FAM.biens,  desc:'Garages, fourrière, concession, effractions et destructions.' },
  { id:'jobs',          code:'JOB', label:'Jobs & entreprises',   fam:FAM.civil,  desc:'Embauches, grades, prises de service et comptes société.' },
  { id:'proprietes',    code:'IMM', label:'Propriétés',           fam:FAM.civil,  desc:'Achats, loyers, clés partagées et coffres de logement.' },
  { id:'braquages',     code:'BRQ', label:'Braquages',            fam:FAM.risque, desc:'Fleeca, Pacific, bijouterie, magasins : départ, butin, issue.' },
  { id:'drogue',        code:'DRG', label:'Drogue & labos',       fam:FAM.risque, desc:'Champs, récolte, transformation, revente et saisies.' },
  { id:'organisations', code:'ORG', label:'Organisations',        fam:FAM.civil,  desc:'Coffres d’orga, adhésions, grades, territoires et guerres.' },
  { id:'craft',         code:'CRF', label:'Craft & armes',        fam:FAM.biens,  desc:'Établis, composants, armes et munitions fabriquées.' },
  { id:'admin',         code:'ADM', label:'Administration',       fam:FAM.staff,  desc:'Actions staff en jeu : noclip, spawn, téléportation, revive.' },
  { id:'anticheat',     code:'ACH', label:'Anticheat',            fam:FAM.risque, desc:'Détections automatiques et évènements réseau suspects.' },
  { id:'sanctions',     code:'SNC', label:'Sanctions',            fam:FAM.risque, desc:'Kicks, avertissements, bannissements et levées.' },
  { id:'staff',         code:'RPT', label:'Reports & tickets',    fam:FAM.staff,  desc:'Signalements joueurs, prises en charge et clôtures.' },
  { id:'whitelist',     code:'WLT', label:'Whitelist',            fam:FAM.staff,  desc:'Candidatures Discord, entretiens, acceptations et refus.' },
  { id:'systeme',       code:'SYS', label:'Serveur',              fam:FAM.staff,  desc:'Redémarrages, erreurs de ressource, performance et sauvegardes.' }
];

const SEVS = [
  { id:'critique', label:'Critique',   c:'var(--sev-critique)' },
  { id:'alerte',   label:'Alerte',     c:'var(--sev-alerte)' },
  { id:'notice',   label:'À vérifier', c:'var(--sev-notice)' },
  { id:'info',     label:'Info',       c:'var(--sev-info)' }
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

module.exports = { CATS, SEVS, CAT_IDS, SEV_IDS, PERMS, PERM_IDS, ROLES,
                   roleOf, permsOf, catsOf, hasPerm, canSeeCat };
