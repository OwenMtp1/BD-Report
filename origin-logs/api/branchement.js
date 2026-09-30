'use strict';
/* ============================================================
   Branchement d'un serveur de jeu — en une commande
   ============================================================
   Poser la ressource à la main tient en trois gestes, mais ces trois
   gestes se font sur la machine d'un CLIENT, par quelqu'un qui n'a
   souvent jamais ouvert un terminal. Chaque installation devenait une
   conversation : où est `resources`, pourquoi « setr » ne marche pas,
   pourquoi la clé ne doit pas aller dans `config.lua`. À dix clients
   c'est pénible ; à cinquante, c'est le métier qui change.

   On livre donc un SCRIPT, et on ne transmet plus une clé mais un CODE :

       bash <(curl -fsSL https://…/install) ORG-4F2K-9BQX

   ⚠️ **Un code, PAS la clé d'ingestion.** Cette ligne-là voyage : elle
   est collée dans un Discord, elle reste dans l'historique du terminal,
   elle traîne dans un ticket. Un code est à USAGE UNIQUE et périme en
   quelques heures — la clé, elle, ouvre les journaux jusqu'à ce qu'on
   la révoque. Le script échange le code contre la clé une seule fois,
   en HTTPS, et la pose directement dans un fichier à 0600.

   ⚠️ Le code dit aussi QUAND le client a branché : la supervision montre
   « en attente » tant que personne ne l'a consommé. Une installation qui
   n'avance pas se voit, au lieu de se découvrir en cherchant pourquoi un
   espace reste vide.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Sans I, L, O, U, 0 ni 1 : un code se dicte au téléphone et se recopie
// à la main. Les caractères qu'on confond sont ceux qui coûtent un
// aller-retour de support.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const VALIDITE_H = 6;

function code() {
  const brut = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[brut[i] % ALPHABET.length];
  return 'ORG-' + s.slice(0, 4) + '-' + s.slice(4);
}

const normaliser = v => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/* Émettre un code pour un espace. Un seul code valide à la fois : en
   émettre un nouveau annule le précédent, sinon deux serveurs de jeu
   pourraient se brancher sur le même espace sans qu'on l'ait voulu. */
function emettre(db, sid, heures) {
  const c = code();
  const jusqua = Date.now() + Math.max(1, Math.min(168, Number(heures) || VALIDITE_H)) * 3600000;
  db.prepare('UPDATE spaces SET enroll_code = ?, enroll_until = ? WHERE id = ?').run(c, jusqua, sid);
  return { code: c, expire: jusqua };
}

function annuler(db, sid) {
  db.prepare('UPDATE spaces SET enroll_code = NULL, enroll_until = NULL WHERE id = ?').run(sid);
}

/* Consommer un code. Comparaison à temps constant, comme pour les clés
   d'ingestion : un code court se devine d'autant mieux qu'on mesure les
   réponses. Un espace fermé refuse — c'est justement l'état où l'on ne
   veut plus qu'un serveur de jeu écrive. */
function consommer(db, brut) {
  const donne = Buffer.from(normaliser(brut));
  if (donne.length < 8) return null;
  const maintenant = Date.now();
  for (const sp of db.prepare("SELECT * FROM spaces WHERE enroll_code IS NOT NULL").all()) {
    const attendu = Buffer.from(normaliser(sp.enroll_code));
    if (attendu.length !== donne.length) continue;
    if (!crypto.timingSafeEqual(attendu, donne)) continue;
    if (sp.state !== 'actif') return { erreur: 'Cet espace est fermé.' };
    if (!sp.enroll_until || sp.enroll_until < maintenant) return { erreur: 'Ce code a expiré. Demandez-en un nouveau.' };
    db.prepare('UPDATE spaces SET enroll_code = NULL, enroll_until = NULL, enroll_at = ? WHERE id = ?')
      .run(maintenant, sp.id);
    return { space: sp };
  }
  return null;
}

/* ---------- inventaire de la ressource ----------
   Le script télécharge les fichiers un par un plutôt qu'une archive :
   ni tar ni zip dans Node sans dépendance, et surtout une archive cache
   ce qu'elle dépose. Ici la liste est lisible avant d'être suivie. */
let cacheListe = { a: 0, v: [] };
function fichiers(racine) {
  if (Date.now() - cacheListe.a < 60000) return cacheListe.v;
  const out = [];
  const marcher = (dir, prefixe) => {
    let entrees = [];
    try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entrees.sort((x, y) => x.name.localeCompare(y.name))) {
      if (e.name.startsWith('.')) continue;
      const rel = prefixe ? prefixe + '/' + e.name : e.name;
      if (e.isDirectory()) marcher(path.join(dir, e.name), rel);
      // Le code de la ressource, et rien d'autre : la documentation se
      // lit dans le panneau, l'installer à côté du Lua n'apprend rien
      // et fait télécharger des fichiers qu'aucun `ensure` ne lira.
      else if (/\.(lua|json)$/i.test(e.name)) out.push(rel);
    }
  };
  marcher(racine, '');
  cacheListe = { a: Date.now(), v: out };
  return out;
}

/* ---------- le script ----------
   ⚠️ Il s'écrit ici, pas dans un fichier à part, parce qu'il doit porter
   l'adresse RÉELLE du panneau — celle que le client vise. Un script
   statique obligerait à l'y écrire à la main, soit l'étape qu'on
   cherche justement à supprimer. */
function script(origine) {
  const url = String(origine).replace(/\/+$/, '');
  return `#!/usr/bin/env bash
# ============================================================
#  origin_logs — branchement d'un serveur FiveM
#  Usage :  bash <(curl -fsSL ${url}/install) VOTRE-CODE [/chemin/server.cfg]
# ============================================================
set -euo pipefail

PANNEAU="${url}"
CODE="\${1:-}"
CFG="\${2:-}"

rouge() { printf '\\033[31m%s\\033[0m\\n' "\$*" >&2; }
vert()  { printf '\\033[32m%s\\033[0m\\n' "\$*"; }
info()  { printf '  %s\\n' "\$*"; }

[ -n "\$CODE" ] || { rouge "Il manque le code d'installation."
  info "Exemple :  bash <(curl -fsSL \$PANNEAU/install) ORG-4F2K-9BQX"; exit 1; }
command -v curl >/dev/null || { rouge "curl est introuvable. Installez-le : apt install -y curl"; exit 1; }

# ---------- 1. retrouver server.cfg ----------
if [ -z "\$CFG" ]; then
  echo "  Recherche de server.cfg…"
  mapfile -t TROUVES < <(find / -maxdepth 7 -name server.cfg -not -path '*/node_modules/*' \\
                              -not -path '/proc/*' -not -path '/sys/*' 2>/dev/null || true)
  if [ "\${#TROUVES[@]}" -eq 0 ]; then
    rouge "Aucun server.cfg trouvé."
    info "Relancez la commande en ajoutant son chemin à la fin."
    exit 1
  elif [ "\${#TROUVES[@]}" -gt 1 ]; then
    rouge "Plusieurs server.cfg trouvés — je ne devine pas lequel est le bon :"
    for f in "\${TROUVES[@]}"; do info "  \$f"; done
    info ""
    info "Relancez en ajoutant le bon à la fin de la commande, par exemple :"
    info "  bash <(curl -fsSL \$PANNEAU/install) \$CODE \${TROUVES[0]}"
    exit 1
  fi
  CFG="\${TROUVES[0]}"
fi
[ -f "\$CFG" ] || { rouge "\$CFG n'existe pas."; exit 1; }
BASE="\$(cd "\$(dirname "\$CFG")" && pwd)"
RES="\$BASE/resources"
[ -d "\$RES" ] || { rouge "Pas de dossier resources à côté de \$CFG."
  info "Vérifiez que \$CFG est bien celui de votre serveur FiveM."; exit 1; }
vert "✓ Serveur trouvé : \$BASE"

# ---------- 2. échanger le code contre la clé ----------
REP="\$(curl -fsS -X POST "\$PANNEAU/api/enroll" -H 'content-type: application/json' \\
        -d "{\\"code\\":\\"\$CODE\\"}" || true)"
[ -n "\$REP" ] || { rouge "Le panneau n'a pas répondu (\$PANNEAU)."; exit 1; }
lire() { printf '%s' "\$REP" | sed -n "s/.*\\"\$1\\":\\"\\([^\\"]*\\)\\".*/\\1/p"; }
ERREUR="\$(lire error)"
[ -z "\$ERREUR" ] || { rouge "\$ERREUR"; exit 1; }
CLE="\$(lire cle)"; NOM="\$(lire nom)"; ADRESSE="\$(lire url)"
[ -n "\$CLE" ] || { rouge "Réponse inattendue du panneau."; exit 1; }
vert "✓ Code accepté — espace « \$NOM »"

# ---------- 3. poser la ressource ----------
DEST="\$RES/origin_logs"
mkdir -p "\$DEST"
LISTE="\$(printf '%s' "\$REP" | sed -n 's/.*"fichiers":\\[\\([^]]*\\)\\].*/\\1/p' | tr -d '"' | tr ',' ' ')"
[ -n "\$LISTE" ] || { rouge "Le panneau n'a pas donné la liste des fichiers."; exit 1; }
N=0
for f in \$LISTE; do
  mkdir -p "\$DEST/\$(dirname "\$f")"
  curl -fsSL "\$PANNEAU/resource/\$f" -o "\$DEST/\$f" || { rouge "Échec du téléchargement de \$f"; exit 1; }
  N=\$((N+1))
done
vert "✓ Ressource installée (\$N fichiers) : \$DEST"

# ---------- 4. la clé, dans un fichier à part ----------
# ⚠️ Jamais dans config.lua : ce fichier est téléchargé par chaque joueur.
# ⚠️ « set » et non « setr » : setr réplique la valeur chez les clients.
SECRETS="\$BASE/secrets.cfg"
TMP="\$(mktemp)"
if [ -f "\$SECRETS" ]; then grep -v '^set origin_logs_' "\$SECRETS" > "\$TMP" || true; fi
{
  echo "set origin_logs_url  \\"\$ADRESSE\\""
  echo "set origin_logs_key  \\"\$CLE\\""
  echo "set origin_logs_name \\"\$NOM\\""
} >> "\$TMP"
mv "\$TMP" "\$SECRETS"
chmod 600 "\$SECRETS"
vert "✓ Clé écrite dans \$SECRETS (lisible par vous seul)"

# ---------- 5. brancher dans server.cfg ----------
ajouter() { grep -qxF "\$1" "\$CFG" || { printf '%s\\n' "\$1" >> "\$CFG"; info "ajouté : \$1"; }; }
cp "\$CFG" "\$CFG.origin-logs.bak"
printf '\\n# --- origin_logs ---\\n' >> "\$CFG"
ajouter 'exec secrets.cfg'
ajouter 'ensure baseevents'
ajouter 'ensure origin_logs'
vert "✓ server.cfg complété (copie de sécurité : \$CFG.origin-logs.bak)"

# ---------- 6. et voilà ----------
echo
vert "Terminé."
info "1. Redémarrez votre serveur FiveM."
info "2. Dans sa console, tapez :  origin_logs_test"
info "3. La ligne doit apparaître dans le panneau, rubrique « Action staff »."
echo
info "Si vous versionnez votre serveur, ajoutez secrets.cfg à votre .gitignore."
echo
`;
}

module.exports = { code, emettre, annuler, consommer, fichiers, script, VALIDITE_H };
