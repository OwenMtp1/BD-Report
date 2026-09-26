// ============================================================
// Origin Roleplay — sauvegardes et poids des espaces
//
// À dix clients on copie le fichier .db à la main ; à cinquante on ne
// le fait plus, et le jour où la base s'abîme il n'y a rien à restaurer.
// D'où ce module : une sauvegarde DATÉE, prise toute seule, gardée en
// rotation, plus de quoi répondre à « combien pèse ce client ? ».
//
// ⚠️ On n'utilise PAS une copie de fichier : en WAL, le .db seul est un
// instantané incomplet (les dernières écritures vivent dans le -wal).
// « VACUUM INTO » demande à SQLite lui-même d'écrire une base COMPLÈTE et
// cohérente, pendant que l'API continue de servir.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 14));
// 0 = pas de sauvegarde automatique (on assume, mais le contrôle le dira).
const EVERY_H = Number(process.env.BACKUP_EVERY_HOURS || 24);

function dossier(dbFile) {
  const d = process.env.BACKUP_DIR || path.join(path.dirname(dbFile), 'backups');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const NOM = /^origin-logs-(\d{4}-\d{2}-\d{2}-\d{4})\.db$/;

function liste(dbFile) {
  const d = dossier(dbFile);
  return fs.readdirSync(d)
    .filter(f => NOM.test(f))
    .map(f => {
      let st = null; try { st = fs.statSync(path.join(d, f)); } catch (e) {}
      return { fichier: f, octets: st ? st.size : 0, le: st ? st.mtimeMs : 0 };
    })
    .sort((a, b) => b.le - a.le);
}

function horodatage(t) {
  const p = n => String(n).padStart(2, '0');
  const d = new Date(t);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Échappement SQL : le chemin part dans une chaîne littérale.
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";

function faire(db, dbFile) {
  const d = dossier(dbFile);
  let f = `origin-logs-${horodatage(Date.now())}.db`;
  // Deux sauvegardes dans la même minute ne doivent pas s'écraser
  // silencieusement : VACUUM INTO refuse un fichier existant.
  let n = 0;
  while (fs.existsSync(path.join(d, f)) && n < 60) {
    f = `origin-logs-${horodatage(Date.now() + ++n * 60000)}.db`;
  }
  const cible = path.join(d, f);
  db.exec(`VACUUM INTO ${lit(cible)}`);
  const octets = fs.statSync(cible).size;
  const jetees = rotation(dbFile);
  return { fichier: f, octets, le: Date.now(), jetees };
}

// On garde les KEEP plus récentes. Jeter la plus vieille est un geste sûr ;
// ne rien jeter remplit le disque, et un disque plein arrête l'API.
function rotation(dbFile) {
  const d = dossier(dbFile);
  const trop = liste(dbFile).slice(KEEP);
  for (const s of trop) { try { fs.unlinkSync(path.join(d, s.fichier)); } catch (e) {} }
  return trop.map(s => s.fichier);
}

function derniere(dbFile) { return liste(dbFile)[0] || null; }

function chemin(dbFile, fichier) {
  if (!NOM.test(String(fichier))) return null;   // jamais de nom venu du client
  return path.join(dossier(dbFile), String(fichier));
}

function supprimer(dbFile, fichier) {
  const c = chemin(dbFile, fichier);
  if (!c || !fs.existsSync(c)) return false;
  fs.unlinkSync(c); return true;
}

/* ---------- poids ----------
   SQLite ne sait pas dire « cet espace occupe tant d'octets » : ses pages
   mélangent les locataires. On mesure donc ce qui est mesurable — la
   longueur réelle des textes journalisés, qui est l'essentiel du volume,
   et la taille réelle des captures. C'est une approximation, et l'écran
   le dit : un chiffre approché qui évolue juste vaut mieux qu'un chiffre
   exact qu'on ne peut pas calculer. */
function poids(db, spaceId, screenDir) {
  const un = (sql, ...a) => {
    const r = db.prepare(sql).get(spaceId, ...a) || {};
    return Number(Object.values(r)[0] || 0);
  };
  const journaux = un(`SELECT COALESCE(SUM(
      LENGTH(msg) + LENGTH(search) + LENGTH(COALESCE(data,'')) + LENGTH(COALESCE(res,''))
      + LENGTH(COALESCE(actor_name,'')) + LENGTH(COALESCE(target_name,'')) + 64
    ), 0) o FROM events WHERE space_id = ?`);
  const captures = un('SELECT COALESCE(SUM(bytes),0) o FROM screens WHERE space_id = ?');
  let capturesDisque = 0;
  try {
    const d = path.join(screenDir, String(spaceId));
    for (const f of fs.readdirSync(d)) {
      try { capturesDisque += fs.statSync(path.join(d, f)).size; } catch (e) {}
    }
  } catch (e) {}
  return {
    journaux, captures: capturesDisque || captures,
    evenements: un('SELECT COUNT(*) n FROM events WHERE space_id = ?'),
    fichiers: un('SELECT COUNT(*) n FROM screens WHERE space_id = ?'),
    total: journaux + (capturesDisque || captures)
  };
}

function tailleFichier(f) { try { return fs.statSync(f).size; } catch (e) { return 0; } }

// Le fichier de base, plus ses compagnons WAL : c'est ce qui occupe
// vraiment le disque tant qu'un point de contrôle n'a pas eu lieu.
function tailleBase(dbFile) {
  return tailleFichier(dbFile) + tailleFichier(dbFile + '-wal') + tailleFichier(dbFile + '-shm');
}

module.exports = {
  KEEP, EVERY_H, dossier, liste, faire, rotation, derniere, chemin, supprimer,
  poids, tailleBase, tailleFichier
};
