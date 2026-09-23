#!/usr/bin/env bash
# ============================================================
# Origin Logs — publier vers le dépôt de distribution
# ============================================================
#   bash origin-logs/maj/publier.sh            # pousse l'état actuel
#   bash origin-logs/maj/publier.sh v1.3       # …et publie une version
#
# ⚠️ CE DÉPÔT NE CONTIENT QUE CE PRODUIT. Celui-ci en porte un second
# (le SaaS BD Report) : une clé de déploiement posée dessus donnerait à
# la machine d'un client l'accès à l'autre. `git subtree split` extrait
# une histoire qui ne contient que les commits touchant origin-logs/,
# dossier remonté à la racine.
#
# ⚠️ LE `-f` EST NORMAL, et ce n'est pas une négligence : `subtree split`
# refabrique l'histoire à chaque fois, les identifiants de commit
# changent donc à chaque publication. C'est sans danger parce que
# PERSONNE NE TRAVAILLE dans ce dépôt — il ne sert qu'à distribuer, et
# les VPS y font `reset --hard`, jamais `pull`.
# ============================================================
set -euo pipefail

DEPOT=${DEPOT:-https://github.com/OwenMtp1/origin-logs}
DOSSIER=${DOSSIER:-origin-logs}
BRANCHE_TAMPON=origin-logs-seul
ETIQUETTE=${1:-}

cd "$(git rev-parse --show-toplevel)"

# Rien de ce qui n'est pas commité ne part : le dépôt de distribution
# doit refléter un état qu'on peut retrouver ici.
if [ -n "$(git status --porcelain -- "$DOSSIER")" ]; then
  echo "Des changements ne sont pas commités dans $DOSSIER/ — commitez d'abord." >&2
  git status --short -- "$DOSSIER" >&2
  exit 1
fi

git branch -D "$BRANCHE_TAMPON" >/dev/null 2>&1 || true
git subtree split -P "$DOSSIER" -b "$BRANCHE_TAMPON" >/dev/null
SHA=$(git rev-parse "$BRANCHE_TAMPON")

echo "→ $DEPOT"
echo "  $(git log --oneline -1 "$BRANCHE_TAMPON")"
git push -f "$DEPOT" "$BRANCHE_TAMPON:main"

if [ -n "$ETIQUETTE" ]; then
  # ⚠️ L'étiquette se pose sur le commit de l'histoire EXTRAITE, pas sur
  # celui d'ici : c'est celle-là que les VPS voient.
  git tag -f "$ETIQUETTE" "$SHA" >/dev/null
  git push -f "$DEPOT" "refs/tags/$ETIQUETTE"
  echo "  étiquette $ETIQUETTE publiée — les VPS réglés sur « etiquette » la prendront."
fi

git branch -D "$BRANCHE_TAMPON" >/dev/null
echo "  publié."
