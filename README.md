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

Limites : n'importe qui connaissant un code peut lire et modifier le travail correspondant ; il n'y a pas de limite du nombre d'envois (offre gratuite Cloudflare : 100 000 requêtes par jour, 5 Go de base). Navigateurs trop anciens (sans `CompressionStream`, par exemple iOS 15) : la sauvegarde en ligne n'est pas proposée.

## Abonnement à 3 €/mois et classes (depuis la 2.5.0)

Page `site/abonnement/` (lien « S'abonner » de l'accueil et de la fenêtre 👤). Paiement par **PayPal** (abonnements PayPal) :

1. Sans compte : on choisit identifiant et mot de passe (disponibilité vérifiée, `GET /api/compte/disponible`), puis on paie ; connecté : le compte du logiciel devient abonné.
2. Le bouton PayPal (SDK `www.paypal.com/sdk/js`, `intent=subscription`) renvoie l'identifiant d'abonnement `I-…` ; la page l'envoie à `POST /api/abonnement/activer`, qui **relit l'abonnement chez PayPal** (plan, statut, dates) avant de créer le compte abonné ou de passer le compte connecté abonné. Un abonnement ne sert qu'à un compte. S'il y a un souci après le paiement (identifiant pris, réseau), l'identifiant d'abonnement est gardé dans le navigateur (`boites-a-classer-abonnement:attente`) pour réessayer.
3. Droits jusqu'à `comptes.abonne_jusqua` : prochain prélèvement + 3 jours si l'abonnement est actif ; fin du mois payé s'il est annulé, suspendu ou expiré. Passé cette date, l'abonnement est relu chez PayPal (au plus une fois par heure). Le webhook `POST /api/paypal/webhook` (renouvellements, annulations) ne fait que déclencher cette relecture : un faux appel ne change rien. Résiliation par l'abonné dans son compte PayPal.

Un **abonné** (`serveur/abonnements.js`, `estAbonne`) :
- crée et publie des collections pour tout le monde, et ne modifie ou retire que les siennes (`collections.auteur`), au plus 30 ; un admin les gère toutes. Les collections passent par `GET/POST/DELETE /api/collections` (avec une session, le GET marque `modifiable` celles que l'on peut modifier) ;
- a une **classe** : un code de 6 caractères (`comptes.code_classe`) que les élèves saisissent dans 👤 → Ma classe (`POST /api/classe/rejoindre`) ; en le faisant, l'élève accepte que l'enseignant voie son travail. Page `site/classe/` : code (et « Changer de code »), date de fin d'abonnement, lien PayPal pour résilier, liste des élèves avec « Voir le travail » (consultation dans le logiciel, par `/api/classe/travail`), « Nouveau mot de passe » et « Retirer de la classe ». Un élève a une classe au plus et peut la quitter. Sans abonnement valable, la page et les collections sont refusées ; les collections déjà publiées restent.

Mise en route de PayPal (une fois) :
1. Compte PayPal **Business** (titulaire majeur ; encaisser demande un statut, par exemple auto-entrepreneur, et des factures/TVA à votre charge), puis sur developer.paypal.com → Apps & Credentials, une application (identifiant + secret), d'abord en « Sandbox » pour essayer.
2. `PAYPAL_API=https://api-m.sandbox.paypal.com PAYPAL_CLIENT_ID=… PAYPAL_SECRET=… node outils/paypal-plan.mjs` : crée le produit, le plan à 3 €/mois et le webhook, et affiche les réglages.
3. Cloudflare Pages → boites-a-classer → Settings → Variables and Secrets : `PAYPAL_API`, `PAYPAL_CLIENT_ID`, `PAYPAL_PLAN_ID` (texte) et `PAYPAL_SECRET` (secret), puis republier. Tant qu'ils manquent, la page affiche « Bientôt disponible ». Recommencer avec `https://api-m.paypal.com` et l'application « Live » pour les vrais paiements.

Essais en local : `.dev.vars` (non suivi par Git) donne ces réglages à `wrangler pages dev` ; on peut y mettre un faux PayPal (`PAYPAL_API=http://localhost:…`).

## Collections du site et réservées à l'admin (depuis la 2.4.0)

Seul un compte admin (et, depuis la 2.5.0, un abonné pour ses propres collections) crée et modifie des collections. Ce qu'il enregistre dans l'éditeur est **publié sur le site** (table `collections`, `migrations/0004_collections.sql`) et proposé à tout le monde dans le groupe « Collections du site », en lecture seule comme les collections fournies. Identifiants `site-…`. Le logiciel les lit au démarrage (`GET /api/collections`, `functions/api/collections.js`) et en garde une copie sous `boites-a-classer-site:collections` pour le hors-ligne (hors de ce qui est sauvegardé en ligne). Publier, modifier, retirer : `POST` et `DELETE /api/collections` (droits vérifiés par le serveur ; taille au plus 1,9 Mo).

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
