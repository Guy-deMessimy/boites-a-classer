#!/bin/sh
# Envoie les modifications sur GitHub et met à jour le site (branche gh-pages).
# Usage : ./publier.sh "Description de la modification"
# Penser à lancer ./build.sh avant si le programme a changé.
set -eu
cd "$(dirname "$0")"
AIDE='!gh auth git-credential'
git add -A
git diff --cached --quiet || git commit -q -m "${1:-Mise à jour}"
git -c credential.helper= -c credential.helper="$AIDE" push -q origin main
git subtree split -q --prefix site -b gh-pages
git -c credential.helper= -c credential.helper="$AIDE" push -q -f origin gh-pages
echo "Publié : https://guy-demessimy.github.io/boites-a-classer/ (en ligne d'ici une minute)"
