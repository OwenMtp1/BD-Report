'use strict';
/* ============================================================
   L'ÉQUIPE DE LA PLATEFORME — celle de l'éditeur, pas celle d'un client
   ============================================================
   ⚠️ DEUX ÉQUIPES QUI N'ONT RIEN À VOIR, et c'est tout l'objet de ce
   fichier. Le staff d'un ESPACE modère un serveur de jeu : il lit des
   logs, bannit, traite des reports, et ses droits viennent des rôles
   Discord de CE client. Le staff de la PLATEFORME, lui, ne modère
   personne : il crée des espaces, les facture, les dépanne, les ferme.
   Les deux catalogues de droits ne se recouvrent en rien — mélanger les
   deux donnerait un modérateur capable de supprimer l'espace qu'il
   modère, ou un commercial capable de bannir un joueur.

   Jusqu'ici l'administration de plateforme était un simple OUI/NON
   (`staff.platform_admin`). À deux personnes, cela suffisait. À une
   équipe, non : on veut qu'un commercial pose une formule sans pouvoir
   supprimer un espace, et qu'un support entre chez un client sans
   toucher aux tarifs.

   ⚠️ Les rôles vivent EN BASE, pas dans ce fichier : on ajuste un droit
   bien plus souvent qu'on ne redéploie. Ce qui est ici, c'est le
   CATALOGUE (la liste de ce qui existe) et les rôles d'origine.
   ============================================================ */

/* ---------- le catalogue des droits ----------
   ⚠️ Un droit absent ne masque pas seulement un bouton : l'API refuse la
   route. L'inverse — un bouton retiré mais la route ouverte — donnerait
   une protection d'apparence, celle qui tombe au premier curl. */
const GROUPES = [
  { id: 'supervision', label: 'Supervision' },
  { id: 'espaces',     label: 'Espaces clients' },
  { id: 'commerce',    label: 'Commerce' },
  { id: 'donnees',     label: 'Données' },
  { id: 'equipe',      label: 'Équipe de la plateforme' }
];

const PERMS = [
  { id:'plat.voir',            groupe:'supervision', label:'Voir la supervision et la liste des espaces' },
  { id:'plat.verifier',        groupe:'supervision', label:'Lancer la vérification des panneaux' },
  { id:'plat.journal',         groupe:'supervision', label:'Lire le journal d’administration' },

  { id:'plat.espace.creer',    groupe:'espaces', label:'Créer un espace client' },
  { id:'plat.espace.modifier', groupe:'espaces', label:'Modifier un espace (nom, Discord, rétention, propriétaire)' },
  { id:'plat.espace.fermer',   groupe:'espaces', label:'Fermer et rouvrir un espace' },
  { id:'plat.espace.supprimer',groupe:'espaces', label:'Supprimer un espace et tous ses journaux' },
  { id:'plat.espace.cle',      groupe:'espaces', label:'Régénérer la clé d’ingestion, délivrer une clé de bot' },
  { id:'plat.branchement',     groupe:'espaces', label:'Générer la commande d’installation' },
  { id:'plat.integration',     groupe:'espaces', label:'Scanner un serveur et régler ses raccordements' },
  { id:'plat.entrer',          groupe:'espaces', label:'Entrer dans l’espace d’un client' },

  { id:'plat.formules',        groupe:'commerce', label:'Composer les formules et leurs plafonds' },
  { id:'plat.facturation',     groupe:'commerce', label:'Poser une formule et une échéance sur un espace' },

  { id:'plat.sauvegardes',     groupe:'donnees', label:'Déclencher et télécharger les sauvegardes' },
  { id:'plat.restaurer',       groupe:'donnees', label:'Restaurer un espace depuis un export' },
  { id:'plat.export',          groupe:'donnees', label:'Exporter les journaux d’un espace' },

  { id:'plat.equipe.voir',     groupe:'equipe', label:'Voir l’équipe de la plateforme' },
  { id:'plat.equipe.gerer',    groupe:'equipe', label:'Attribuer un rôle plateforme, révoquer un accès' },
  { id:'plat.roles',           groupe:'equipe', label:'Composer les rôles de la plateforme (gouvernance)' }
];

const PERM_IDS = PERMS.map(p => p.id);

/* ---------- les rôles d'origine ----------
   ⚠️ « Direction » a TOUS LES DROITS EN DUR, jamais une liste enregistrée.
   Une liste se modifie ; le jour où quelqu'un décoche `plat.roles` sur le
   seul rôle qui pouvait le recocher, plus personne n'administre rien. */
const ROLES_DEFAUT = [
  { key:'direction', label:'Direction', rang:100, perms:'*', builtin:1,
    desc:'Tous les droits sur la plateforme, y compris la composition des rôles.' },
  { key:'technique', label:'Technique', rang:80, builtin:1,
    desc:'Met en service, dépanne, sauvegarde. Ne touche pas aux tarifs.',
    perms:['plat.voir','plat.verifier','plat.journal','plat.espace.creer','plat.espace.modifier',
           'plat.espace.cle','plat.branchement','plat.integration','plat.entrer',
           'plat.sauvegardes','plat.restaurer','plat.export','plat.equipe.voir'] },
  { key:'support', label:'Support', rang:60, builtin:1,
    desc:'Répond aux clients, entre chez eux pour comprendre. Ne crée ni ne supprime.',
    perms:['plat.voir','plat.verifier','plat.journal','plat.entrer','plat.branchement',
           'plat.integration','plat.equipe.voir'] },
  { key:'commercial', label:'Commercial', rang:50, builtin:1,
    desc:'Ouvre des comptes clients et pose les formules. N’entre pas dans leurs journaux.',
    perms:['plat.voir','plat.espace.creer','plat.espace.modifier','plat.facturation',
           'plat.formules','plat.branchement','plat.equipe.voir'] },
  { key:'observateur', label:'Observateur', rang:10, builtin:1,
    desc:'Lecture seule : l’état de la plateforme, sans aucune action.',
    perms:['plat.voir','plat.journal','plat.equipe.voir'] }
];

/* ---------- création idempotente ---------- */
function seed(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_roles(
    key     TEXT PRIMARY KEY,
    label   TEXT NOT NULL,
    rang    INTEGER NOT NULL DEFAULT 0,
    perms   TEXT NOT NULL DEFAULT '[]',
    builtin INTEGER NOT NULL DEFAULT 0,
    descr   TEXT
  )`);
  const existe = db.prepare('SELECT key FROM platform_roles WHERE key = ?');
  const ins = db.prepare('INSERT INTO platform_roles(key,label,rang,perms,builtin,descr) VALUES(?,?,?,?,?,?)');
  for (const r of ROLES_DEFAUT) {
    if (existe.get(r.key)) continue;
    ins.run(r.key, r.label, r.rang, JSON.stringify(r.perms === '*' ? PERM_IDS : r.perms),
            r.builtin || 0, r.desc || null);
  }
}

const parse = j => { try { const v = JSON.parse(j || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

function list(db) {
  return db.prepare('SELECT * FROM platform_roles ORDER BY rang DESC, label').all().map(r => ({
    key: r.key, label: r.label, rang: Number(r.rang), builtin: !!r.builtin,
    desc: r.descr || '', perms: r.key === 'direction' ? PERM_IDS.slice() : parse(r.perms)
  }));
}

const byKey = (db, key) => list(db).find(r => r.key === String(key || '')) || null;

/* ⚠️ Sans rôle, un compte marqué administrateur de plateforme reste
   « Direction ». Les comptes posés avant l'arrivée des rôles ne doivent
   pas se réveiller sans droits un matin : une migration qui retire des
   accès est pire que le désordre qu'elle corrige. */
function permsDe(db, roleKey) {
  const r = byKey(db, roleKey) || byKey(db, 'direction');
  return r ? r.perms : [];
}
const rangDe = (db, roleKey) => { const r = byKey(db, roleKey) || byKey(db, 'direction'); return r ? r.rang : 0; };

module.exports = { GROUPES, PERMS, PERM_IDS, ROLES_DEFAUT, seed, list, byKey, permsDe, rangDe };
