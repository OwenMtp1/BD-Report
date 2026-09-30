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
<style>:root{color-scheme:dark}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
HEAD
  cat panel.html
  printf '</body>\n</html>\n'
} > index.html
echo "index.html régénéré ($(wc -c < index.html) octets)"
