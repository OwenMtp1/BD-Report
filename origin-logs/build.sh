#!/usr/bin/env bash
# Assemble la version autonome (index.html) à partir de la source panel.html.
# panel.html est écrit au format Artifact (pas de <html>/<head>/<body>) :
# c'est la coquille ci-dessous qui en fait une page ouvrable en local.
set -euo pipefail
cd "$(dirname "$0")"
{
  cat <<'HEAD'
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
HEAD
  # ⚠️ Le <title> et les <link> de la source vont DANS <head>. Recopiés
  # tels quels dans <body>, ils donnaient un document invalide : les
  # polices se chargeaient quand même, mais le titre n'était pris que par
  # indulgence du navigateur.
  sed -n '1,/^<style>$/p' panel.html | sed '$d'
  printf '</head>\n<body>\n'
  sed -n '/^<style>$/,$p' panel.html
  printf '</body>\n</html>\n'
} > index.html
echo "index.html régénéré ($(wc -c < index.html) octets)"
