#!/bin/sh
# Envoie les modifications sur GitHub (code source) et met le site en ligne sur Cloudflare Pages.
# Usage : ./publier.sh "Description de la modification"
# Penser à lancer ./build.sh avant si le programme a changé.
set -eu
cd "$(dirname "$0")"
AIDE='!gh auth git-credential'
git add -A
git diff --cached --quiet || git commit -q -m "${1:-Mise à jour}"
git -c credential.helper= -c credential.helper="$AIDE" push -q origin main
npx wrangler pages deploy site --project-name boites-a-classer --branch main --commit-dirty=true
echo "Publié : https://boites-a-classer.pages.dev/"
