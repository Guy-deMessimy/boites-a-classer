# Boîtes à classer

Logiciel pour apprendre à classer les êtres vivants dans des boîtes emboîtées, à partir des attributs qu'ils partagent.

## Organisation

| Dossier | Contenu |
|---|---|
| `app/` | Le programme (HTML, CSS, JavaScript, sans dépendance). S'ouvre directement dans un navigateur. |
| `app/collections.js` | Les collections d'êtres vivants et leurs attributs : c'est ici qu'on en ajoute. |
| `desktop/` | Configuration Neutralino, qui transforme `app/` en logiciel de bureau. |
| `icone/` | Icône (source `icone.svg`, déclinaisons PNG et `.icns`). |
| `site/` | Le site à mettre en ligne : page de téléchargement, `app/` (version en ligne) et `telechargements/`. |
| `build.sh` | Reconstruit les versions de bureau et met à jour `site/`. |
| `fiche à imprimer/` | Fiches PDF (élève et corrigé) de chaque collection : tableau à double entrée, tableau à double tri, boîtes emboîtées. |
| `outils/` | Générateur des fiches (`fiches.html` + `generer-fiches.js`). |

## Modifier puis publier

1. Modifier `app/` (par exemple ajouter une collection dans `collections.js`) et tester en ouvrant `app/index.html` dans un navigateur.
2. Pour une nouvelle version, changer `version` dans `desktop/neutralino.config.json` et dans le pied de `site/index.html`.
3. Lancer `./build.sh` (Node.js requis ; sur un Mac pour signer l'application macOS).
4. Lancer `./publier.sh "Ce qui a changé"` : le code part sur GitHub et le site se met à jour.

Le site est en ligne à l'adresse https://guy-demessimy.github.io/boites-a-classer/ (GitHub Pages, branche `gh-pages` = contenu de `site/`). Code source : https://github.com/Guy-deMessimy/boites-a-classer

## Version mobile

`app/` est aussi une application web installable (PWA) : `manifest.webmanifest` et `sw.js` (fonctionnement hors connexion). À chaque publication d'une nouvelle version, augmenter `VERSION` dans `app/sw.js` pour que les téléphones récupèrent la mise à jour. `site/qr-mobile.svg` est un QR code vers https://guy-demessimy.github.io/boites-a-classer/app/index.html (à refaire si l'adresse change).

## Export PDF

Le bouton « PDF » dessine le plan de travail sur une page A4 (canvas) et fabrique le PDF lui-même, sans bibliothèque. Navigateur : téléchargement ; téléphone : menu de partage ; version de bureau : fenêtre « Enregistrer sous » via l'API native de Neutralino. `build.sh` ajoute à la page de bureau `js/neutralino.js` (que le serveur complète avec le jeton de connexion, à usage unique) et `desktop/neutralino-init.js` (connexion immédiate). Seules `os.getPath`, `os.showSaveDialog` et `filesystem.writeBinaryFile` sont autorisées (`nativeAllowList`).

## Fiches à imprimer

Après avoir modifié `app/collections.js`, régénérer les fiches avec `npm install` (une seule fois) puis `npm run fiches` (Google Chrome requis). On peut aussi ouvrir `outils/fiches.html?collection=jardin&version=corrige` dans un navigateur et l'imprimer en A4 paysage.

## Fichiers produits

| Fichier | Système |
|---|---|
| `boites-a-classer-windows.zip` | Windows 10/11, 64 bits (WebView2, déjà présent) |
| `boites-a-classer-macos.zip` | macOS 10.15+, Intel et Apple Silicon (signature ad hoc, non notarisée) |
| `boites-a-classer-linux-x64.tar.gz` | Linux PC (WebKitGTK requis) |
| `boites-a-classer-linux-arm64.tar.gz` | Linux ARM 64 bits (Raspberry Pi) |

## Limites connues

- L'application macOS n'est pas notarisée : au premier lancement, il faut l'autoriser dans Réglages Système. Pour l'éviter, il faut un compte Apple Developer (99 €/an).
- Windows peut afficher SmartScreen pour la même raison (pas de certificat de signature de code).
- Le fichier `.exe` garde l'icône par défaut de Neutralino (la changer demande l'outil `rcedit` sous Windows).
- Le bouton « Imprimer » n'a pas été testé dans les versions de bureau ; il fonctionne dans un navigateur.
- Les dessins des êtres vivants sont des emojis : leur apparence change d'un système à l'autre. On peut les remplacer par des images (`image: "images/lapin.png"` dans `collections.js`).

## Licence

Logiciel libre sous licence GNU GPL v3 (voir `LICENSE`).
