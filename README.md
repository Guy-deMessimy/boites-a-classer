# Boîtes à classer

Logiciel pour apprendre à classer les êtres vivants dans des boîtes emboîtées, à partir des attributs qu'ils partagent.

## Organisation

| Dossier | Contenu |
|---|---|
| `app/` | Le programme (HTML, CSS, JavaScript, sans dépendance). S'ouvre directement dans un navigateur. |
| `app/collections.js` | Les collections fournies (êtres vivants et attributs) : c'est ici qu'on en ajoute. Les collections créées dans le logiciel sont, elles, gardées dans le navigateur (voir Mes collections). |
| `desktop/` | Configuration Neutralino, qui transforme `app/` en logiciel de bureau. |
| `icone/` | Icône (source `icone.svg`, déclinaisons PNG et `.icns`). |
| `site/` | Le site à mettre en ligne : page de téléchargement, `app/` (version en ligne) et `telechargements/`. |
| `build.sh` | Reconstruit les versions de bureau et met à jour `site/`. |
| `redirection/` | Pages publiées à l'ancienne adresse (GitHub Pages) : renvoient vers la nouvelle avec le travail gardé dans le navigateur. |
| `fiche à imprimer/` | Fiches PDF (élève et corrigé) de chaque collection : tableau à double entrée, tableau à double tri, boîtes emboîtées. Non publié (voir Espace enseignant). |
| `outils/` | Générateur des fiches (`fiches.html` + `generer-fiches.js`). |

## Modifier puis publier

1. Modifier `app/` (par exemple ajouter une collection dans `collections.js`) et tester en ouvrant `app/index.html` dans un navigateur.
2. Pour une nouvelle version, changer `version` dans `desktop/neutralino.config.json`, `VERSION` en haut de `app/app.js` et dans le pied de `site/index.html`.
3. Lancer `./build.sh` (Node.js requis ; sur un Mac pour signer l'application macOS).
4. Lancer `./publier.sh "Ce qui a changé"` : le code part sur GitHub et le site se met à jour sur Cloudflare.

Le site est en ligne à l'adresse https://boites-a-classer.pages.dev/ (Cloudflare Pages, projet `boites-a-classer`, contenu de `site/` envoyé par `npx wrangler pages deploy`). Code source : https://github.com/Guy-deMessimy/boites-a-classer

`publier.sh` utilise wrangler (installé dans le projet par `npm install`) : il faut l'avoir relié une fois au compte Cloudflare avec `npx wrangler login`.

### Ancienne adresse (GitHub Pages)

Jusqu'au 16/10/2026, le site était à https://guy-demessimy.github.io/boites-a-classer/. La branche `gh-pages` contient désormais le dossier `redirection/` : chaque page (et `404.html` pour toutes les autres adresses) renvoie vers la même page à la nouvelle adresse. Comme la mémoire du navigateur est propre à chaque adresse, `redirection/demenagement.js` joint au passage ce qui y était gardé (clés `boites-a-classer:*`, compressées, dans le fragment `#transfert=…` que les serveurs ne reçoivent pas) ; `app/app.js` le récupère sans rien écraser. Si c'est trop gros pour une adresse, la page propose un fichier de sauvegarde à rouvrir avec « Fichier → Ouvrir un fichier ». `redirection/app/sw.js` efface l'ancien service worker des versions installées.

Pour modifier cette redirection : `git subtree split --prefix redirection -b redirection-pages` puis `git push -f origin redirection-pages:gh-pages`.

## Version mobile

`app/` est aussi une application web installable (PWA) : `manifest.webmanifest` et `sw.js` (fonctionnement hors connexion). À chaque publication d'une nouvelle version, augmenter `VERSION` dans `app/sw.js` pour que les téléphones récupèrent la mise à jour. `site/qr-mobile.svg` est un QR code vers https://boites-a-classer.pages.dev/app/index.html (à refaire si l'adresse change : `npx qrcode@1.5.4 -t svg -q 1 -o site/qr-mobile.svg "<adresse>"`).

## Enregistrer et ouvrir (fichiers `.boites`)

Le menu « Fichier » propose : Enregistrer mon travail, Ouvrir un fichier, Enregistrer en PDF et Imprimer (pas sur téléphone).

Un fichier `.boites` est du JSON : `{ format: "boites-a-classer", type: "travail" | "collection", version: 1, logiciel, collection, etat }`. La collection y est toujours recopiée, si bien qu'un travail fait sur une collection personnelle s'ouvre aussi chez l'enseignant qui ne l'a pas encore. À l'ouverture :

- un **travail** remplace le plan de travail de sa collection (il est aussi gardé dans le navigateur) ;
- une **collection** s'ajoute à « Mes collections » ; si on l'a déjà à l'identique, elle est simplement choisie ; si on a une version différente sous le même identifiant, la nouvelle est ajoutée à côté (rien n'est écrasé).

Ces fichiers circulent entre élèves : tout ce qui est lu est vérifié et borné (`nettoyerCollection`, `nettoyerEtat` dans `app.js`), les images ne sont acceptées qu'en `data:image/png|jpeg|webp|gif`, et rien n'est jamais inséré comme HTML.

## Mes collections

Le bouton « ✎ Collections » ouvre la liste des collections : utiliser, copier une collection fournie pour la modifier, créer, modifier, exporter en `.boites` ou supprimer. L'éditeur présente les attributs puis un tableau à double entrée (êtres vivants × attributs) à cocher ; chaque être vivant a un emoji (palette ou saisie libre) ou une photo, réduite à 160 px (JPEG) pour rester légère. Il signale ce qui empêcherait une classification emboîtée : un être vivant sans attribut, ou deux attributs qui « se croisent ».

Les collections personnelles sont gardées dans le stockage du navigateur (clé `boites-a-classer:mes-collections`), propre à chaque navigateur et à l'application de bureau : pour les garder à l'abri ou les donner à la classe, les exporter. Si une boîte porte un attribut qu'on renomme, elle suit le nouveau nom ; si l'attribut est supprimé, elle redevient sans attribut.

## Export PDF

Le bouton « PDF » dessine le plan de travail sur une page A4 (canvas) et fabrique le PDF lui-même, sans bibliothèque. Navigateur : téléchargement ; téléphone : menu de partage ; version de bureau : fenêtre « Enregistrer sous » via l'API native de Neutralino. `build.sh` ajoute à la page de bureau `js/neutralino.js` (que le serveur complète avec le jeton de connexion, à usage unique) et `desktop/neutralino-init.js` (connexion immédiate). Les mêmes fenêtres natives servent pour les fichiers `.boites` et les photos. Seules `os.getPath`, `os.showSaveDialog`, `os.showOpenDialog`, `filesystem.writeBinaryFile` et `filesystem.readBinaryFile` sont autorisées (`nativeAllowList`).

## Fiches à imprimer

Les fiches ne concernent que les collections fournies. Après avoir modifié `app/collections.js`, régénérer les fiches avec `npm install` (une seule fois) puis `npm run fiches` (Google Chrome requis). On peut aussi ouvrir `outils/fiches.html?collection=jardin&version=corrige` dans un navigateur et l'imprimer en A4 paysage.

## Espace enseignant

Le bouton « Je suis enseignant » de la page d'accueil demande un code d'accès puis propose les fiches élève et les corrigés. Les PDF sont publiés **chiffrés** dans `site/enseignant/` (AES-GCM, clé dérivée du code par PBKDF2) : le code n'est écrit nulle part, ni dans le site ni dans le dépôt, et sans lui les fichiers sont illisibles. Le dossier `fiche à imprimer/` (PDF en clair) n'est pas envoyé sur GitHub.

Après avoir régénéré les fiches, ou pour changer de code : `npm run chiffrer` (le code est demandé), puis `./publier.sh`. Les fichiers d'avant le 15/10/2026 restent dans l'historique Git du dépôt public.

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
- Les emojis récents (🪰, 🪱, 🪲…) s'affichent comme un carré vide sur les systèmes anciens.
- Double-cliquer sur un fichier `.boites` n'ouvre pas le logiciel : il faut passer par « Fichier → Ouvrir un fichier ».
- Sur Android, « Enregistrer mon travail » télécharge le fichier (Chrome ne propose pas le menu de partage pour ce type de fichier).

## Licence

Logiciel libre sous licence GNU GPL v3 (voir `LICENSE`).
