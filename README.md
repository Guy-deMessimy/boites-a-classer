# Boîtes à classer

Logiciel pour apprendre à classer les êtres vivants dans des boîtes emboîtées, à partir des attributs qu'ils partagent.

## Organisation

| Dossier | Contenu |
|---|---|
| `app/` | Le programme (HTML, CSS, JavaScript, sans dépendance). S'ouvre directement dans un navigateur. |
| `app/collections.js` | Les collections fournies (êtres vivants et attributs) : c'est ici qu'on en ajoute. Les collections créées dans le logiciel sont, elles, gardées dans le navigateur (voir Mes collections). |
| `desktop/` | Configuration Neutralino, qui transforme `app/` en logiciel de bureau. |
| `icone/` | Icône (source `icone.svg`, déclinaisons PNG et `.icns`). |
| `site/` | Le site à mettre en ligne : page de téléchargement (avec l’annonce de la prochaine version en haut et la pub `pub/` intégrée), `app/` (version en ligne) et `telechargements/`. |
| `build.sh` | Reconstruit les versions de bureau et met à jour `site/`. |
| `functions/`, `serveur/`, `migrations/`, `wrangler.toml` | Sauvegarde en ligne, comptes et administration (page `site/admin/`) : API Cloudflare Pages Functions et base D1 (voir Sauvegarde en ligne). |
| `redirection/` | Archive : pages qui redirigeaient l'ancienne adresse (GitHub Pages, supprimée) vers la nouvelle. |
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

Du 14 au 16/10/2026, le site était à https://guy-demessimy.github.io/boites-a-classer/. Cette adresse est supprimée depuis le 16/10/2026 (branche `gh-pages` effacée) : elle répond « 404 ». Le dossier `redirection/` garde les pages qui y redirigeaient vers la nouvelle adresse en transférant le travail gardé dans le navigateur (non publiées ; `app/app.js` sait toujours recevoir ce transfert et les fichiers de sauvegarde).

## Version mobile

`app/` est aussi une application web installable (PWA) : `manifest.webmanifest` et `sw.js` (fonctionnement hors connexion). À chaque publication d'une nouvelle version, augmenter `VERSION` dans `app/sw.js` pour que les téléphones récupèrent la mise à jour. `site/qr-mobile.svg` est un QR code vers https://boites-a-classer.pages.dev/app/index.html (à refaire si l'adresse change : `npx qrcode@1.5.4 -t svg -q 1 -o site/qr-mobile.svg "<adresse>"`).

## Enregistrer et ouvrir (fichiers `.boites`)

Le menu « Fichier » propose : Enregistrer mon travail, Ouvrir un fichier, Enregistrer en PDF et Imprimer (pas sur téléphone).

Un fichier `.boites` est du JSON : `{ format: "boites-a-classer", type: "travail" | "collection", version: 1, logiciel, collection, etat }`. La collection y est toujours recopiée, si bien qu'un travail fait sur une collection personnelle s'ouvre aussi chez l'enseignant qui ne l'a pas encore. À l'ouverture :

- un **travail** remplace le plan de travail de sa collection (il est aussi gardé dans le navigateur) ;
- une **collection** s'ajoute à « Mes collections » ; si on l'a déjà à l'identique, elle est simplement choisie ; si on a une version différente sous le même identifiant, la nouvelle est ajoutée à côté (rien n'est écrasé).

Ces fichiers circulent entre élèves : tout ce qui est lu est vérifié et borné (`nettoyerCollection`, `nettoyerEtat` dans `app.js`), les images ne sont acceptées qu'en `data:image/png|jpeg|webp|gif`, et rien n'est jamais inséré comme HTML.

## Sauvegarde en ligne

Bouton « 👤 Se connecter » de la barre (ou menu « Fichier → Compte et sauvegarde en ligne », ou lien « Se connecter ou créer un compte » de la page d'accueil, qui ouvre `app/index.html#compte`). Deux façons de sauvegarder en ligne : avec un **compte**, ou sans compte avec un **code**.

### Avec un compte (depuis la 2.2.0)

Un compte = un identifiant (3 à 30 caractères : lettres sans accent, chiffres, `.`, `_`, `-` ; majuscules et accents ramenés en minuscules sans accent) et un mot de passe (8 caractères au moins). Aucune adresse e-mail n'est demandée : un mot de passe oublié ne peut pas être récupéré (il faut recréer un compte).

- Créer un compte envoie le travail du navigateur comme première version. Se connecter sur un autre appareil récupère le travail du compte ; si le navigateur a déjà un travail différent, l'élève choisit lequel garder (« Celui de ce navigateur » l'envoie sur le compte, dont l'ancien travail reste dans les versions gardées).
- Ensuite tout fonctionne comme avec un code (envoi 2,5 s après chaque changement, 10 versions, « Revenir à celle-ci »).
- « Se déconnecter » envoie d'abord ce qui attend ; la case « Effacer aussi mon travail de ce navigateur » est pour les ordinateurs partagés. « Changer de mot de passe » ferme les sessions des autres appareils. « Supprimer mon compte » (mot de passe redemandé) efface le compte et son travail sur le serveur, pas dans le navigateur.
- Se connecter alors qu'un code est actif arrête le code sur cet appareil (il reste valable sur le serveur).

Sécurité : le mot de passe ne quitte jamais l'appareil. Le logiciel en dérive un secret (PBKDF2-SHA256, 600 000 tours, sel = `boites-a-classer:compte:<identifiant>`, ~0,1 s sur un ordinateur) et n'envoie que lui ; le serveur garde SHA-256(sel aléatoire + secret) et compare en temps constant. Ce découpage évite de faire tourner PBKDF2 sur Cloudflare (10 ms de calcul par requête dans l'offre gratuite). La connexion remet un jeton de session (32 octets au hasard, gardé dans le navigateur sous `boites-a-classer-compte:jeton`, hors de ce qui est sauvegardé) ; il voyage dans `Authorization: Bearer …` et le serveur n'en garde que l'empreinte. Au plus 20 sessions par compte ; une session ou un compte inutilisé pendant un an est effacé. Limites : 10 mots de passe faux par identifiant et 100 par adresse IP en 15 minutes, 100 créations de compte par adresse IP et par heure (une classe partage souvent la même adresse). Le service worker ne met jamais `/api/` en cache.

Côté serveur : `functions/api/compte/[action].js` (inscription, connexion, session, deconnexion, mot-de-passe, suppression ; détail en tête du fichier), `serveur/comptes.js` (sessions, ménage ; hors de `functions/` pour ne pas devenir une adresse), tables `comptes`, `sessions`, `limites` dans `migrations/0002_comptes.sql`. Le travail d'un compte est rangé dans `sauvegardes` sous la clé `compte:<id>` ; `functions/api/sauvegarde.js` accepte le jeton à la place du code et répond 401 si la session n'est plus valable (le logiciel oublie alors le jeton et demande de se reconnecter, le travail en attente part à la reconnexion).

Le mot de passe minimal (8 caractères) n'est vérifié que par le logiciel : le serveur ne voit que le secret dérivé.

### Administration (depuis la 2.3.0)

Page `site/admin/` (https://boites-a-classer.pages.dev/admin/, non indexée), réservée aux comptes dont la colonne `admin` vaut 1 (`migrations/0003_admin.sql`). On s'y rend en se connectant dans le logiciel avec un compte admin : bouton 👤 → « 🛠 Administration » (la page reprend le jeton gardé par le logiciel, même adresse). Le serveur vérifie le droit d'admin à chaque appel (`functions/api/admin/[action].js`).

- **Chiffres** : comptes, sauvegardes avec un code, versions gardées, place utilisée, sessions ouvertes ; **liste des comptes** (création, dernière utilisation, dernière sauvegarde, taille) avec recherche.
- **Nouveau mot de passe** (élève qui a oublié le sien) : la page tire un mot de passe facile à dicter (3 mots + 2 chiffres), en dérive le secret comme le logiciel et l'envoie ; les sessions de l'élève sont fermées. Le mot de passe s'affiche une seule fois, sous la ligne.
- **Voir le travail** : ouvre `app/index.html#consulter=<identifiant>`. Le logiciel charge le dernier travail du compte dans une mémoire temporaire (variable `stockage` dans `app.js`) : tout se regarde et se manipule, rien n'est gardé ni envoyé, le travail de l'admin dans ce navigateur n'est pas touché. « Quitter » recharge le logiciel normal.
- **Supprimer** (double appui) : le compte, ses sessions et son travail.

- **Arrêter le site** (bouton rouge en haut, double appui) : toutes les adresses du site répondent « Boîtes à classer revient dans peu de temps… » en rouge sur le fond de l'accueil (code 503), l'API aussi (503), sauf la page d'administration, la connexion et ce que la page de maintenance affiche. « Rouvrir le site » (un appui) rétablit tout. Fait par `functions/_middleware.js` (passe avant chaque requête) et `serveur/maintenance.js` (page, état dans la table `reglages`, `migrations/0005_reglages.sql`, gardé 5 s par instance du serveur : quelques secondes de délai pour tout le monde). L'application de bureau, qui tourne sur l'ordinateur, continue de marcher sans la sauvegarde en ligne.

La page se connecte elle-même (identifiant et mot de passe, même dérivation que le logiciel), pour pouvoir rouvrir le site quand le logiciel est fermé ; le jeton est rangé aux mêmes clés que le logiciel. Un compte admin ne peut être ni modifié ni supprimé depuis cette page (même le sien : réglages du compte dans le logiciel). Donner ou retirer le droit d'admin : `npx wrangler d1 execute boites-a-classer --remote --command "UPDATE comptes SET admin = 1 WHERE identifiant = '…'"` (0 pour retirer). Le compte doit d'abord être créé normalement dans le logiciel ; se reconnecter ensuite pour voir le lien. Ou d'un coup : `node outils/creer-admin.mjs [identifiant]` crée le compte sur le site avec un mot de passe tiré au hasard, le passe admin et affiche le mot de passe (écrit nulle part).

### Sans compte, avec un code

En activant la sauvegarde avec un code, l'élève reçoit un code de quatre mots tirés au hasard parmi 256 (`MOTS` dans `app.js`, environ 4 milliards de codes), par exemple `lapin-tomate-nuage-velo`. Tout ce que le logiciel garde dans le navigateur (plans de travail et Mes collections, mais pas le zoom ni la collection choisie) est alors envoyé, compressé en gzip, 2,5 secondes après chaque changement. Sur un autre appareil, « J'ai déjà un code » remplace le travail du navigateur par celui du code (un second appui est demandé s'il y avait déjà du travail), et la sauvegarde continue avec ce code.

- Au démarrage et au retour sur l'onglet, si le serveur a une version plus récente et que l'appareil n'a rien en attente, elle est prise ; sinon l'appareil envoie la sienne. Hors connexion, l'envoi attend le retour du réseau.
- Le serveur garde les 10 dernières versions de chaque code ; « Revenir à celle-ci » rétablit une version, qui devient la plus récente.
- « Arrêter sur cet appareil » oublie le code ; le travail reste dans le navigateur et sur le serveur.

Côté serveur (Cloudflare) : `functions/api/sauvegarde.js` (Pages Functions) et la base D1 `boites-a-classer` (`wrangler.toml`, créée avec `--jurisdiction eu` : données gardées dans l'Union européenne ; table dans `migrations/`). Le serveur ne lit pas le contenu, le range sous l'empreinte SHA-256 du code (le code n'est pas stocké), refuse plus de 1,9 Mo (limite d'une valeur D1) et efface ce qui n'a pas été modifié depuis un an. Le code passe dans l'en-tête `X-Code-Sauvegarde`, jamais dans l'adresse. L'API accepte les appels d'autres origines (CORS) pour l'application de bureau, qui l'appelle à l'adresse du site.

Tester en local : `npx wrangler d1 migrations apply boites-a-classer --local`, copier `app/` dans `site/app/` (fait par `./build.sh`), puis `npx wrangler pages dev` (http://localhost:8788, base locale). Modifier la table : nouveau fichier dans `migrations/`, puis `npx wrangler d1 migrations apply boites-a-classer --remote`.

`migrations/0006_abonnements.sql` vient de l’abonnement de la 2.5.0, retiré dans la 2.6.0 : ses colonnes existent en production mais ne servent plus.

Limites : n'importe qui connaissant un code peut lire et modifier le travail correspondant ; il n'y a pas de limite du nombre d'envois (offre gratuite Cloudflare : 100 000 requêtes par jour, 5 Go de base). Navigateurs trop anciens (sans `CompressionStream`, par exemple iOS 15) : la sauvegarde en ligne n'est pas proposée.

## Enseignants, classes et élèves (depuis la 2.9.0)

Le **rôle enseignant** est donné par un admin, dans la page `site/admin/` (« 🎓 Rendre enseignant », colonne `comptes.est_enseignant`, `migrations/0007_classes.sql`) ; un admin a aussi ce rôle. Un enseignant connecté voit « 🎓 Mes classes » dans la fenêtre 👤 du logiciel : page `site/classe/` (API `functions/api/classe/[action].js`, outils `serveur/classes.js`).

- Il crée des **classes** (30 au plus), puis y ajoute ses **élèves** en collant leurs prénoms (un par ligne, 60 élèves au plus par classe). Chaque élève devient un compte sans mot de passe (`comptes.classe`, `comptes.nom`, identifiant interne `eleve.…`).
- Chaque élève reçoit un **code personnel de 8 caractères** (sans 0/O ni 1/I/L, montré `K7MP-Q3RX`). Le serveur n'en garde que l'empreinte SHA-256 (`comptes.code_eleve`) : les codes ne s'affichent qu'à leur création, sous forme de cartes à imprimer et découper. Code perdu : « 🔑 Nouveau code » (l'ancien ne marche plus, les appareils de l'élève sont déconnectés), ou « Nouveaux codes pour toute la classe ».
- L'élève se connecte dans le logiciel : 👤 → « 🎒 Je suis élève, j'ai un code » (`POST /api/compte/code`, mêmes limites d'essais que les mots de passe). Son travail est ensuite sauvegardé sur son compte comme pour tout compte ; il ne peut ni changer de mot de passe ni supprimer son compte.
- L'enseignant voit pour chaque élève la dernière connexion et la dernière sauvegarde, ouvre son travail en consultation (`app/index.html#consulter-eleve=<id>`, rien n'est modifié), change son prénom ou le retire (compte et travail effacés). Supprimer une classe efface ses élèves ; supprimer le compte d'un enseignant efface ses classes et ses élèves. Retirer le rôle garde les classes (elles reviennent si le rôle est redonné).

Avant de publier cette version : `npx wrangler d1 migrations apply boites-a-classer --remote` (migration 0007).

Depuis la 3.9.0, l'enseignant coche aussi des **exercices** pour chaque classe (colonne `classes.exercices`, JSON d'identifiants, `migrations/0009_exercices.sql`, `POST /api/classe/exercices`) : l'état du compte d'un élève les renvoie (`eleve.exercices`) et le logiciel les met en tête de la liste, dans « 📌 Donnés par ton enseignant ».

## Photo de profil (depuis la 3.29.1)

Un admin donne à n'importe quel compte (élèves et admins compris) une photo de profil, qui est seulement un emoji : page `site/admin/`, « 🖼 Photo de profil » (20 emojis proposés, ou un autre, ou « Enlever la photo »). `POST /api/admin/avatar { identifiant, avatar | null }` n'accepte que des emojis (`FORME_AVATAR`), colonne `comptes.avatar` (`migrations/0012_avatar.sql`). L'état du compte la renvoie (`avatar`) : le logiciel la montre à la place de 👤 et dans la fenêtre du compte (relue à l'ouverture), et `nomAffiche` (`serveur/evenement.js`) la met devant le nom dans les classements et l'écran de victoire.

Depuis la 3.30.1 : la photo est dans un rond (classe `.avatar`, `.avatar.grand` dans la fenêtre du compte) ; le logiciel relit le compte au retour sur l'onglet (une fois par minute au plus), donc une nouvelle photo arrive sans recharger ; « Mes classes » montre la photo des élèves (`GET /api/classe/eleves` renvoie `avatar`) et le service client de l'admin la met devant le nom. Choix de l'admin rangé en trois groupes (Événements, Animaux, Autres).

Depuis la 3.30.5, **carte de profil** (`app/profil.css`, à part de `style.css`) : dans la fenêtre du compte, `rendreCarteProfil()` (`app/app.js`) remplit `#sv-carte` : bandeau en papier millimétré teinté d'après le nom (`teinte()`), grande photo, nom, étiquette du rôle (Élève, Enseignant, Admin), badges en médailles (`MEDAILLES` : nom court, précision, famille bleu/or/argent ; ordre fixe de `BADGES`). Sans photo, `rondProfil()` met l'initiale du nom sur un dégradé de sa teinte (aussi dans la barre, rond de 22 px). « Mes classes » charge `../app/profil.css` et montre une petite carte par élève (`miniProfil`, même calcul de teinte ; `GET /api/classe/eleves` renvoie aussi `badges`).

Depuis la 3.36.0 :
- **Couleur du rond** : l'admin choisit aussi la couleur derrière l'emoji (ligne « 🖼 Photo de profil » : une pastille par couleur, chacune montre la photo sur sa couleur). Huit couleurs, `FONDS_AVATAR` dans `functions/api/admin/[action].js` (bleu, vert, jaune, orange, rouge, rose, violet, nuit), dessinées en clair et en sombre par `app/profil.css` (`[data-fond]`, variable `--avatar-fond` ; le bandeau de la carte la reprend). Colonne `comptes.avatar_fond` (`migrations/0013_avatar_fond.sql`) ; `POST /api/admin/avatar` prend `avatar_fond` (facultatif : sans lui la couleur reste ; enlever la photo efface la couleur) ; l'état du compte, `GET /api/admin/comptes` et `GET /api/classe/eleves` la renvoient (`avatar_fond`).
- **Photos en série** (page admin, « 🖼 Photos de profil en série ») : pour tous les comptes, tous les élèves ou une classe, seulement ceux sans photo sauf si « remplacer » est coché, jamais les admins ; emoji au hasard (toutes les propositions ou un de leurs groupes : chacun en reçoit un différent tant qu'il en reste) ou le même pour tous ; couleur au hasard, aucune ou une seule. Le tirage est fait dans la page et l'aperçu montre exactement ce qui part (« 🎲 Retirer au sort » pour un autre) : `POST /api/admin/avatars { photos: [{ identifiant, avatar, avatar_fond }] }`, 500 au plus par appel, tout est vérifié avant d'écrire. « Enlever la photo » fait l'inverse pour les comptes choisis qui en ont une (aperçu barré, second appui demandé). Dans la liste des comptes, un compte sans photo a le rond à son initiale, de la même teinte que dans son logiciel (`rondCompte`, même calcul que `teinte()`). Dans les classements des événements (fin d'événement, écran de victoire, page admin), la photo est dans un rond devant le nom, sur sa couleur, ou l'initiale sans photo : `nomAffiche` (`serveur/evenement.js`) ne met plus l'emoji dans le nom, `photo()` ajoute `avatar` et `avatar_fond` à chaque ligne et au gagnant du boss, `rondProfil()` de `site/evenement.js` les dessine. À droite des choix de la photo, l'aperçu de sa carte de profil (`carteProfil`, mêmes classes que `rendreCarteProfil()`) montre l'emoji ou la couleur survolés avant de cliquer.
- **Annonce** : quand le logiciel relit le compte (ouverture, retour sur l'onglet) et que la photo ou sa couleur a changé depuis la dernière lecture, une bulle « Nouvelle photo de profil ! » (ou « Nouvelle couleur pour ta photo ! ») apparaît sous le bouton du compte, dont le rond fait une onde ; un appui ouvre la fenêtre du compte, sinon elle part seule après 8 secondes (`annoncerPhoto` dans `app/app.js`, `.annonce-photo` dans `app/profil.css`). Pas d'annonce à la connexion ni quand la photo est enlevée ; si une fenêtre est ouverte (aide du premier lancement…), la bulle attend sa fermeture.

Avant de publier la 3.36.0 : `npx wrangler d1 migrations apply boites-a-classer --remote` (migration 0013).

## Matières (depuis la 3.1.0)

Les collections fournies (`app/collections.js`) sont rangées par matière : champ `matiere` (sciences par défaut), liste des matières dans `window.MATIERES` du même fichier — c'est là qu'on ajoute une matière, le logiciel, l'accueil et la page « Mes classes » la reprennent. Sept matières : sciences (êtres vivants, aliments, matériaux, système solaire, régimes alimentaires), français, maths (dont figures et solides dessinés en SVG), histoire, géographie, anglais (`langue: 'en'` : lecture à voix haute en anglais) et musique. Champ `elements` : ce qu'on classe, au masculin (`['aliment', 'aliments']`) ; sinon « êtres vivants » en sciences et « éléments » ailleurs.

Règle pour une nouvelle collection : deux attributs ne doivent jamais se croiser (emboîtés ou séparés) et chaque élément a au moins un attribut. Sur l'accueil, la liste et le nombre des collections sont calculés depuis `app/collections.js` ; seuls les boutons des cartes « Une partie par matière » (liens `app/index.html#collection=<id>`) s'ajoutent à la main. Journal pour les utilisateurs : `site/nouveautes/`.

## Outils (depuis la 3.0.0)

Dans le logiciel, en plus des boîtes (tout est dans `app/app.js`, sections « Annuler, rétablir » et « Outils ») :
- **↶ ↷ Annuler / rétablir** (Ctrl+Z, Ctrl+Y ou ⇧⌘Z) : `sauver()` garde jusqu'à 50 états d'avant, pour la collection affichée.
- **🧰 Outils** : **🌳 arbre** (la classification emboîtée dessinée en arbre de parenté, en SVG : chaque boîte devient une branche portant son attribut, les boîtes vides sont laissées de côté), **📊 tableau des caractères** (êtres vivants × attributs), **🎲 jeu « Qui suis-je ? »** (deviner l'être vivant secret par questions oui/non, record par collection), **💡 indice** (une piste sur une seule erreur, sans la solution ; l'être vivant concerné clignote), **⏱ défi chronométré** (repart de zéro, ↶ ramène le travail d'avant ; le temps s'arrête quand « ✔ Vérifier » trouve tout juste, record par collection), **🔊 lecture à voix haute** (synthèse vocale du navigateur, en français).
- **Fichier → 🖼 Enregistrer en image** : la même page que le PDF, en PNG.

Depuis : aide « Comment ça marche ? » à la première visite (`boites-a-classer-aide:vue`), thème sombre (variables CSS, `@media screen and (prefers-color-scheme: dark)`), progression ✅ (`boites-a-classer:reussi:<id>`, sauvegardée en ligne avec le travail), confettis à la réussite, lien direct vers un exercice (🔗), impression du tableau des caractères (à remplir ou corrigé) et de l'arbre, cartes et boîtes au clavier (Tab, Entrée, flèches ; Alt + flèches pour la taille d'une boîte).

Records et réglage de la voix sont gardés dans le navigateur, hors de la sauvegarde en ligne (`boites-a-classer-jeu:…`, `boites-a-classer-defi:…`, `boites-a-classer-voix`).

## Thème du site (depuis la 3.33.0)

Choisi dans la page admin (« 🎨 Thème », `POST /api/admin/theme { theme }`, `serveur/theme.js`, clé `theme` de la table `reglages`, pas de migration ; sans réglage : `normal`) :

| Thème | Nom du site | Accueil |
|---|---|---|
| `normal` | Boîtes à classer | thème sciences, pas de bandeau |
| `halloween` | Boîtes à hanter | `site/halloween/theme.css`, bandeau « 🎃 Événement d'Halloween prochainement… » |
| `noel` | Boîtes à lutins | `site/noel/theme.css`, bandeau « 🎄 Événement de Noël prochainement… » |

- Les fichiers gardent le nom « Boîtes à classer » et le thème sciences (c'est aussi ce que montre l'application de bureau). `functions/_middleware.js` habille chaque page HTML en l'envoyant (sauf les clips `site/halloween/` et `site/noel/`) : `data-theme` sur `<html>` (couleurs du logiciel, `app/style.css`), classe `theme-<nom>` et `<link>` du décor sur une page dont le `<html>` porte `data-decor` (l'accueil), retrait des éléments `data-theme-seul` d'un autre thème (bandeaux de l'accueil), nom du site dans `<title>` et dans les éléments `data-nom-site` (texte et attributs `content`, `title`, `aria-label` ; `data-nom-site="attributs"` : attributs seulement). Pas d'`ETag` sur ces pages : le navigateur les redemande en entier.
- `GET /api/etat` renvoie `theme` et `nomSite` : le logiciel (`app/app.js`) et les pages du site (`site/arret.js`) les suivent sans recharger ; l'accueil se recharge 6 s après le changement.
- Pour ajouter un nom ailleurs : écrire « Boîtes à classer » dans le fichier et marquer l'élément `data-nom-site` (dans le logiciel, `nomSite()`). Ne pas marquer le JSON-LD, le manifest, les noms de fichiers ni les cartes imprimées.
- Pendant un événement, l'accueil prend le thème de l'événement et son nom (« Boîtes à lutins » pour Noël) le temps qu'il dure, quel que soit le thème du site.
- **Programme** (depuis la 3.34.1) : dans la même carte, « 📅 Thèmes programmés » (`POST /api/admin/theme { programme: [{ theme, du, au }] }`, clé `programme-theme`) : pendant une période (jours compris, heure de Paris), son thème remplace le thème choisi, qui revient tout seul à la fin. `/api/etat` et le middleware donnent le thème du jour (le changement de minuit est vu par les pages ouvertes).
- **Événements programmés** (depuis la 3.34.1) : carte de l'événement, « 📅 Événements programmés » (`POST /api/admin/evenement { programme: [{ evenement, debut, fin }] }`, « AAAA-MM-JJTHH:MM » à Paris, clé `programme-evenement`). Pas d'horloge côté serveur : `lireEtat` (`serveur/evenement.js`, `appliquerProgramme`, toutes les 10 s au plus par instance) déclenche ou arrête l'événement à la première lecture de l'état après l'heure dite (pages ouvertes, ou premier visiteur). Chaque ligne garde `lance` / `arrete` ; le programme n'est réécrit que s'il n'a pas changé entre-temps (une seule instance agit). Une plage passée sans aucune visite est marquée faite sans déclenchement. Déclencher remet le classement à zéro et remplace l'événement en cours ; à la fin, l'événement n'est arrêté que s'il est toujours celui du programme (même nom).

## Noël (depuis la 3.29.0)

Même mécanique qu'Halloween (voir plus bas), avec sa propre fiche dans `site/evenement.js` (moteur commun des événements, qui remplace `site/halloween/hanter.js` ; classes `hanter-…` et `window.hanter` gardées) :
- **Thème** de l'accueil : `site/noel/theme.css` (nuit d'hiver, lune, motif `fond-noel.svg`, village enneigé `scene-noel.svg`, titres en Mountains of Christmas, `site/polices/mountains-of-christmas-latin.woff2`, licence Apache 2.0). Pas de bandeau avant l'événement : pendant et après, le moteur en crée un (progression, boss, « Voir le classement »).
- **Événement** : dans la page admin, choisir « 🎄 Noël » dans la liste puis « ✨ Déclencher l'événement » (`POST /api/admin/evenement { nom: "noel" }`). Fond animé (neige, guirlande, traîneau), lutins 🧝 à attraper, clip d'intro `site/noel/index.html` (air de « Jingle Bells », domaine public), boss 🎅 le Père Noël (100 000 PV, −1 000 par clic), classement, badges : 🎅 `noel` + ✔ `verifie` pour celui qui a cliqué le plus sur le Père Noël, ⛄ `participation-noel` pour tous les participants. `VERSION_PAGES` = 4.
- Avant et après Noël : thème du site (page admin) sur « Noël » ou « Normal ».

## Halloween (3.25.0 à 3.27.2, archivé depuis la 3.28.0)

Remis en mode Halloween (accueil, nom « Boîtes à hanter ») de la 3.30.0 à la 3.30.5, puis retour à la normale en 3.30.6 (même procédure qu'en 3.28.0).

Tout est gardé dans le dépôt (repère Git `halloween-2026` = dernier état actif) mais désactivé depuis la 3.28.0 : site renommé « Boîtes à classer », thème sciences sur l'accueil, bandeau habituel. Les badges gagnés restent sur les comptes et s'affichent toujours ; l'événement, ses points, le boss et le bouton admin marchent encore (le déclencher sans le thème : fantômes et boss partout, mais ni fond animé, ni clip, ni bandeau sur l'accueil).

Pour le réactiver (Halloween prochain) : depuis la 3.33.0, choisir le thème « Halloween » dans la page admin (accueil, bandeau et nom « Boîtes à hanter » ; voir § Thème du site), puis déclencher l'événement (cela remet points et boss à zéro).

Détail de ce qui a été fait :

- **Thème** de l'accueil : `site/halloween/theme.css` (nuit, lune, motif `fond-halloween.svg`, silhouettes `scene-halloween.svg`, titres en Creepster, `site/polices/creepster-latin.woff2`, licence OFL). Pour revenir au thème sciences : retirer la classe `theme-halloween` de `<html>` et le `<link>` dans `site/index.html`, et remettre un bandeau `.annonce` ordinaire.
- **Nom** : pendant Halloween, le site s'appelait « Boîtes à hanter » (titres des pages, accueil, pub, logiciel, page de maintenance ; pas l'adresse, ni les noms de fichiers, ni les cartes imprimées). Depuis la 3.33.0, c'est le thème du site qui le donne. Le clip d'intro, lui, montre « classer » qui devient « hanter ».
- **Événement** : bouton « 🎃 Déclencher l'événement » de la page admin (aujourd'hui : choisir « 🎃 Halloween » dans la liste ; `POST /api/admin/evenement { nom: "halloween" | null }`, `serveur/evenement.js`, table `reglages`, pas de migration). `GET /api/etat` renvoie `{ evenement }` ; `site/arret.js` et `app/app.js` (version web) chargent alors `site/halloween/hanter.js` : fond animé sur l'accueil, fantômes sur toutes les pages (on les attrape d'un clic sur le site ; dans le logiciel ils ne gênent pas les clics et 🧰 Outils → « Chasser les fantômes »), bandeau « a commencé », clip d'intro une fois par déclenchement (`site/halloween/index.html`, animation HTML de 18 s avec son Web Audio, aussi visible à https://boites-a-classer.pages.dev/halloween/). Les pages ouvertes attendent la réponse de `/api/etat?attendre=…` jusqu'à ce que l'état change : déclencher ou arrêter l'événement (ou le site) se voit en 3 à 5 s, sans recharger ; les pages d'avant la 3.25.2 reçoivent un 503 pendant l'événement et se rechargent une fois. Mouvements réduits demandés par l'appareil : ni fond animé, ni fantômes, ni clip automatique.
- **Classement** (depuis la 3.26.0, migration 0010) : chaque fantôme attrapé d'un clic par un compte connecté rapporte un point (`POST /api/evenement/attrape`, un toutes les 2,5 s au plus, table `scores_evenement`). Arrêter l'événement le marque « fini » (`{ nom, depuis, fin }`) : `/api/etat` renvoie `fini`, et les pages ouvertes puis l'accueil montrent une fois le classement (`GET /api/evenement/classement`, 10 premiers ; identifiant, ou prénom pour un élève). La page admin le montre en direct. Redéclencher remet les points à zéro (second appui demandé).
- **Boss** (depuis la 3.27.0, migration 0011) : quand la somme des points de tous atteint `SEUIL_BOSS` (30), `POST /api/evenement/attrape` crée le boss (`boss_evenement`, 100 000 PV). `/api/etat` envoie son état et un `sig` qui change à chaque coup : la barre de PV suit les coups de tous (3 s au plus). `POST /api/evenement/boss` : −1 000 PV par coup (compte connecté, un toutes les 0,5 s, table `coups_boss`). Le coup qui l'achève donne au compte qui a porté le plus de coups (ex aequo : arrivé le premier) les badges `verifie` et `halloween` (colonne `comptes.badges`, gardés après l'événement ; affichés dans le logiciel à côté du nom, dans les classements et dans la liste admin). Écran de victoire une fois par événement. Badge de participation `participation-halloween` (🧛) : donné dès le premier point ou le premier coup au boss (réponse `badge`, message et relecture du compte dans la page), et à l'arrêt de l'événement à tous ceux qui ont joué. Pendant le combat, plus de petits fantômes ; « Chasser les fantômes » cache aussi le boss.

## Service client (depuis la 2.10.0)

Page `site/aide/` (« 💬 Service client » sur l'accueil, dans la fenêtre 👤 du logiciel et sur « Mes classes ») : chacun écrit à l'administrateur du site, qui répond depuis la page `site/admin/` (liste des conversations, non lus, « Marquer résolu », suppression). Une seule conversation par compte connecté (retrouvée sur tous ses appareils), ou par navigateur pour un visiteur sans compte (jeton tiré au hasard, gardé sous `boites-a-classer-support:jeton`, le serveur n'en garde que l'empreinte). Les réponses arrivent sans recharger (toutes les 20 s, 30 s côté admin) ; le logiciel met une pastille sur 👤 quand une réponse n'est pas lue. API `functions/api/support/[action].js` (visiteur) et `functions/api/admin/[action].js` (admin), tables dans `migrations/0008_support.sql` ; 2 000 caractères par message, 20 messages par heure et par adresse, 200 messages gardés par conversation, effacée après un an sans message ou avec le compte.

## Collections du site et réservées à l'admin (depuis la 2.4.0)

Depuis la 3.13.0, un **enseignant** crée aussi des collections du site et ne modifie ou retire que les siennes (`collections.auteur`, 30 au plus) : `GET/POST/DELETE /api/collections` (`functions/api/collections.js`) ; avec une session, le GET marque `modifiable` celles que l'on peut modifier. Un admin les gère toutes (et garde les actions `collection` de son API).

Seul un compte admin crée et modifie des collections. Ce qu'il enregistre dans l'éditeur est **publié sur le site** (table `collections`, `migrations/0004_collections.sql`) et proposé à tout le monde dans le groupe « Collections du site », en lecture seule comme les collections fournies. Identifiants `site-…`. Le logiciel les lit au démarrage (`GET /api/collections`, `functions/api/collections.js`) et en garde une copie sous `boites-a-classer-site:collections` pour le hors-ligne (hors de ce qui est sauvegardé en ligne). Publier, modifier, retirer : `POST /api/admin/collection` et `/api/admin/collection-suppression` (droit d'admin vérifié par le serveur ; taille au plus 1,9 Mo).

Dans la fenêtre « ✎ Collections », l'admin a « ＋ Nouvelle collection », « Copier pour modifier » (collections fournies), « ✎ Modifier » et « Retirer du site » (collections du site), et « ☁️ Publier sur le site » pour une collection de « Mes collections ». Les autres n'ont plus ni création, ni copie, ni modification : leurs collections personnelles d'avant la 2.4.0 restent utilisables, exportables et supprimables. Ouvrir un fichier de **collection** seule est réservé à l'admin ; un fichier de **travail** s'ouvre toujours, avec la collection qu'il contient. Retirer une collection du site la fait disparaître chez tout le monde (le travail fait dessus reste gardé, mais n'est plus affiché).

L'éditeur et les règles ci-dessous (« Mes collections ») restent valables pour l'admin.

## Mes collections

Le bouton « ✎ Collections » ouvre la liste des collections : utiliser, copier une collection fournie pour la modifier, créer, modifier, exporter en `.boites` ou supprimer. L'éditeur présente les attributs puis un tableau à double entrée (êtres vivants × attributs) à cocher ; chaque être vivant a un emoji (palette ou saisie libre) ou une photo, réduite à 160 px (JPEG) pour rester légère. Il signale ce qui empêcherait une classification emboîtée : un être vivant sans attribut, ou deux attributs qui « se croisent ».

Les collections personnelles sont gardées dans le stockage du navigateur (clé `boites-a-classer:mes-collections`), propre à chaque navigateur et à l'application de bureau : pour les garder à l'abri ou les donner à la classe, les exporter. Si une boîte porte un attribut qu'on renomme, elle suit le nouveau nom ; si l'attribut est supprimé, elle redevient sans attribut.

## Export PDF

Le bouton « PDF » dessine le plan de travail sur une page A4 (canvas) et fabrique le PDF lui-même, sans bibliothèque. Navigateur : téléchargement ; téléphone : menu de partage ; version de bureau : fenêtre « Enregistrer sous » via l'API native de Neutralino. `build.sh` ajoute à la page de bureau `js/neutralino.js` (que le serveur complète avec le jeton de connexion, à usage unique) et `desktop/neutralino-init.js` (connexion immédiate). Les mêmes fenêtres natives servent pour les fichiers `.boites` et les photos. Seules `os.getPath`, `os.showSaveDialog`, `os.showOpenDialog`, `filesystem.writeBinaryFile` et `filesystem.readBinaryFile` sont autorisées (`nativeAllowList`).

## Fiches à imprimer

Les fiches ne concernent que les collections fournies. Après avoir modifié `app/collections.js`, régénérer les fiches avec `npm install` (une seule fois) puis `npm run fiches` (Google Chrome requis). On peut aussi ouvrir `outils/fiches.html?collection=jardin&version=corrige` dans un navigateur et l'imprimer en A4 paysage.

## Espace enseignant

Depuis le 21/10/2026, la page d'accueil n'a plus de bouton « Je suis enseignant » (remplacé par « Se connecter ou créer un compte ») : les fichiers chiffrés restent publiés dans `site/enseignant/` mais plus aucune page ne les ouvre (la fenêtre de déchiffrement est dans l'historique Git, commit 3fdd934 et avant, `site/index.html`). Avant, ce bouton demandait un code d'accès puis proposait les fiches élève et les corrigés. Les PDF sont publiés **chiffrés** dans `site/enseignant/` (AES-GCM, clé dérivée du code par PBKDF2) : le code n'est écrit nulle part, ni dans le site ni dans le dépôt, et sans lui les fichiers sont illisibles. Le dossier `fiche à imprimer/` (PDF en clair) n'est pas envoyé sur GitHub.

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
