#!/usr/bin/env bash
# ============================================================
# Origin Logs — mise à jour depuis le dépôt
# ============================================================
# Appelé par le minuteur systemd, ou à la main :
#     sudo /srv/origin-logs/maj/mise-a-jour.sh
#
# ⚠️ IL NE TOUCHE JAMAIS AUX DONNÉES. `api/.env` et `api/data/` sont
# ignorés par git : une mise à jour ne peut ni les écraser ni les lire.
# C'est ce qui permet de la lancer sans rien sauvegarder avant.
#
# ⚠️ ET IL SAIT REVENIR EN ARRIÈRE. Une mise à jour qui casse le panneau
# d'un client à trois heures du matin, personne ne la voit avant le
# lendemain : le script vérifie que le service répond APRÈS redémarrage,
# et remet la version précédente s'il ne répond pas. Un déploiement
# automatique sans retour arrière n'est pas un déploiement automatique,
# c'est une panne différée.
# ============================================================
set -euo pipefail

CONF=${MAJ_CONF:-/etc/origin-logs-maj.conf}
[ -f "$CONF" ] && . "$CONF"

DOSSIER=${DOSSIER:-/srv/origin-logs}
UTILISATEUR=${UTILISATEUR:-origin}
SERVICE=${SERVICE:-origin-logs}
SUIVRE=${SUIVRE:-branche}            # « branche » ou « etiquette »
BRANCHE=${BRANCHE:-main}
SANTE=${SANTE:-http://127.0.0.1:8080/api/auth/options}
TESTER=${TESTER:-1}
ATTENTE=${ATTENTE:-20}               # secondes accordées au service pour répondre

dire() { printf '[maj] %s\n' "$*"; }
gitc() { sudo -u "$UTILISATEUR" git -C "$DOSSIER" "$@"; }

cd "$DOSSIER"

# ---------- 1. ce qui existe là-haut ----------
gitc fetch --tags --prune --quiet

if [ "$SUIVRE" = "etiquette" ]; then
  # ⚠️ La plus RÉCENTE par numéro de version, pas par date : une
  # correction publiée sur une ancienne version (v1.2.1 après v1.3) ne
  # doit pas faire reculer un serveur déjà passé à la suivante.
  CIBLE=$(gitc tag --list 'v*' --sort=-version:refname | head -1)
  [ -n "$CIBLE" ] || { dire "aucune étiquette v* publiée — rien à faire."; exit 0; }
else
  CIBLE="origin/$BRANCHE"
fi

AVANT=$(gitc rev-parse HEAD)
APRES=$(gitc rev-parse "$CIBLE")

if [ "$AVANT" = "$APRES" ]; then
  dire "déjà à jour (${APRES:0:8}) — rien à faire."
  exit 0
fi

dire "mise à jour : ${AVANT:0:8} → ${APRES:0:8} ($CIBLE)"
gitc log --oneline "$AVANT..$APRES" 2>/dev/null | sed 's/^/[maj]   · /' || true

# ---------- 2. poser le nouveau code ----------
# `reset --hard` plutôt que `pull` : la machine d'un client ne doit rien
# porter en propre, et une modification locale faite « pour dépanner »
# ferait échouer toutes les mises à jour suivantes en silence.
gitc reset --hard --quiet "$APRES"
[ -f "$DOSSIER/build.sh" ] && sudo -u "$UTILISATEUR" bash "$DOSSIER/build.sh" >/dev/null

revenir() {
  dire "RETOUR ARRIÈRE vers ${AVANT:0:8}"
  gitc reset --hard --quiet "$AVANT"
  [ -f "$DOSSIER/build.sh" ] && sudo -u "$UTILISATEUR" bash "$DOSSIER/build.sh" >/dev/null
  systemctl restart "$SERVICE" || true
}

# ---------- 3. la suite de tests, avant de toucher au service ----------
# Elle monte ses propres serveurs sur d'autres ports et sa propre base :
# elle ne perturbe pas celui qui tourne, et elle attrape une bêtise
# AVANT qu'elle atteigne le client.
if [ "$TESTER" = "1" ] && [ -f "$DOSSIER/api/test/run.js" ]; then
  dire "vérification du code…"
  if ! sudo -u "$UTILISATEUR" sh -c "cd '$DOSSIER/api' && node test/run.js" >/tmp/origin-logs-maj-tests.log 2>&1; then
    dire "LES TESTS ÉCHOUENT — la mise à jour est annulée."
    tail -25 /tmp/origin-logs-maj-tests.log | sed 's/^/[maj]   /'
    revenir
    exit 1
  fi
  dire "tests au vert."
fi

# ---------- 4. redémarrer, puis VÉRIFIER ----------
dire "redémarrage de $SERVICE…"
systemctl restart "$SERVICE"

debout=0
for _ in $(seq 1 "$ATTENTE"); do
  sleep 1
  if curl -fs -m 3 -o /dev/null "$SANTE"; then debout=1; break; fi
done

if [ "$debout" != "1" ]; then
  dire "le service ne répond pas sur $SANTE après ${ATTENTE}s."
  revenir
  exit 1
fi

dire "à jour et debout — ${APRES:0:8}"
