// ============================================================
// Origin Roleplay — export et restauration d'UN espace
//
// La sauvegarde du fichier .db protège la plateforme entière ; elle ne
// sait rien rendre à UN client. Or c'est la demande courante : « rendez-moi
// mes journaux », « recréez l'espace tel qu'il était lundi », « je pars,
// donnez-moi mes données ». D'où ce format, lisible et autonome.
//
// ⚠️ Le fichier contient les EMPREINTES des mots de passe et la clé
// d'ingestion de l'espace : il vaut un accès. Il ne sort que pour un
// administrateur de plateforme, et l'export laisse une trace.
// ⚠️ Les IMAGES ne sont pas dans le fichier (elles pèseraient cent fois le
// reste). Les captures sont restaurées si leur fichier est encore sur le
// disque, et le compte rendu dit combien ne l'étaient plus.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMAT = 1;

// Tables portant space_id, dans l'ordre où on peut les réécrire.
const TABLES = ['roles', 'staff', 'players', 'events', 'marks', 'sanctions', 'actions', 'screens', 'audit'];

const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map(r => String(r.name));

function exporter(db, sp) {
  const tables = {};
  for (const t of TABLES) {
    if (t === 'marks') {
      tables.marks = db.prepare(`SELECT m.* FROM marks m
        JOIN events e ON e.id = m.event_id WHERE e.space_id = ?`).all(sp.id);
    } else {
      tables[t] = db.prepare(`SELECT * FROM ${t} WHERE space_id = ?`).all(sp.id);
    }
  }
  return {
    format: FORMAT,
    panneau: 'origin-logs',
    exporteLe: Date.now(),
    espaceId: sp.id,
    espace: {
      nom: sp.name, guildId: sp.guild_id, staffRoleId: sp.staff_role_id,
      serverKey: sp.server_key, etat: sp.state, retention: sp.retention,
      planKey: sp.plan_key, planUntil: sp.plan_until,
      creeLe: sp.created_at, creePar: sp.created_by
    },
    tables
  };
}

function verifier(doc) {
  if (!doc || typeof doc !== 'object') return 'Fichier illisible.';
  if (Number(doc.format) !== FORMAT) return 'Format d’export inconnu (attendu : ' + FORMAT + ').';
  if (doc.panneau !== 'origin-logs') return 'Ce fichier ne vient pas d’un panneau Origin.';
  if (!doc.espace || !doc.espace.nom) return 'L’espace exporté n’a pas de nom.';
  if (!doc.tables || typeof doc.tables !== 'object') return 'Aucune table dans le fichier.';
  return null;
}

// Restaurer crée TOUJOURS un espace neuf. Écraser un espace en service
// sur la foi d'un fichier serait le geste le plus destructeur du panneau,
// et aucune confirmation ne le rendrait sûr : on préfère deux espaces à
// zéro donnée perdue, le doublon se supprime en un clic.
function restaurer(db, doc, opts) {
  const o = opts || {};
  const nom = String(o.nom || doc.espace.nom).trim().slice(0, 60);
  const now = Date.now();
  const cle = crypto.randomBytes(24).toString('hex');
  const compte = {};
  let capturesOrphelines = 0, comptes = 0;

  db.exec('BEGIN');
  try {
    const r = db.prepare(`INSERT INTO spaces(name,guild_id,staff_role_id,server_key,state,retention,
                                             created_at,created_by,plan_key,plan_until)
                          VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(nom, doc.espace.guildId || null, doc.espace.staffRoleId || null, cle,
           'actif', doc.espace.retention || null, now, o.par || 'restauration',
           doc.espace.planKey || null, doc.espace.planUntil || null);
    const sid = Number(r.lastInsertRowid);

    // Les identifiants repartent de zéro : deux espaces ne peuvent pas
    // se partager un id d'évènement. On garde donc la correspondance
    // ancien → nouveau, pour que les marques et les captures retombent
    // sur le bon évènement.
    const idEv = new Map(), idAc = new Map();

    for (const t of TABLES) {
      const lignes = Array.isArray(doc.tables[t]) ? doc.tables[t] : [];
      if (!lignes.length) { compte[t] = 0; continue; }
      const dispo = new Set(cols(db, t));
      let n = 0;
      for (const l0 of lignes) {
        const l = Object.assign({}, l0);
        if (t === 'marks') {
          const ne = idEv.get(Number(l.event_id));
          if (!ne) continue;
          l.event_id = ne;
        } else {
          l.space_id = sid;
          if (t !== 'players') delete l.id;           // players a une clé composite
          // ⚠️ DÉFAUT TROUVÉ À L'ESSAI, ET IL VERROUILLAIT TOUT LE PANNEAU.
          // Restaurer un export dont l'original vit encore recrée ses
          // comptes à l'identique — même pseudo, même empreinte. La
          // connexion, qui cherche le compte dans TOUS les espaces, en
          // trouvait alors DEUX et refusait de choisir : plus personne ne
          // se connectait, pas même celui qui venait de restaurer.
          // Les comptes reviennent donc SUSPENDUS. Dans une reprise après
          // incident, les rendre est un geste voulu et visible ; dans une
          // copie de travail, c'est ce qui évite le verrou. Ce qu'on ne
          // veut à aucun prix, c'est qu'un fichier posé par erreur rende
          // la main à des comptes qu'on avait retirés depuis.
          if (t === 'staff') { l.disabled = 1; comptes++; }
          if (t === 'screens') {
            l.event_id = l.event_id ? (idEv.get(Number(l.event_id)) || null) : null;
            l.action_id = l.action_id ? (idAc.get(Number(l.action_id)) || null) : null;
            const f = o.screenDir ? path.join(o.screenDir, String(doc.espaceId || ''), String(l.file || '')) : null;
            if (!f || !fs.existsSync(f)) { capturesOrphelines++; continue; }
            // Le fichier est recopié sous le nouvel espace : l'ancien
            // dossier peut disparaître sans emporter l'image.
            try {
              const dst = path.join(o.screenDir, String(sid));
              fs.mkdirSync(dst, { recursive: true });
              fs.copyFileSync(f, path.join(dst, String(l.file)));
            } catch (e) { capturesOrphelines++; continue; }
          }
        }
        const noms = Object.keys(l).filter(k => dispo.has(k));
        if (!noms.length) continue;
        const ins = db.prepare(`INSERT OR IGNORE INTO ${t}(${noms.join(',')})
                                VALUES(${noms.map(() => '?').join(',')})`)
          .run(...noms.map(k => l[k]));
        if (t === 'events' && l0.id) idEv.set(Number(l0.id), Number(ins.lastInsertRowid));
        if (t === 'actions' && l0.id) idAc.set(Number(l0.id), Number(ins.lastInsertRowid));
        n++;
      }
      compte[t] = n;
    }
    db.exec('COMMIT');
    return { id: sid, nom, cle, compte, capturesOrphelines, comptesSuspendus: comptes };
  } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) {} throw e; }
}

module.exports = { FORMAT, TABLES, exporter, verifier, restaurer };
