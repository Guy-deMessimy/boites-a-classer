// Arrêt du site par un admin (page site/admin/, POST /api/admin/maintenance) : tant qu'il dure, functions/_middleware.js
// répond à toutes les adresses par la page ci-dessous, sauf à la page d'administration et à ce qu'il lui faut.

// Chaque instance du serveur garde l'état quelques secondes : une lecture de la base de moins à chaque requête.
// Après un changement, les autres instances suivent donc au plus DUREE_CACHE plus tard.
const DUREE_CACHE = 5000;
let cache = { actif: false, lu: 0 };

export async function maintenanceActive(env) {
  if (Date.now() - cache.lu < DUREE_CACHE) return cache.actif;
  let actif = false;
  try {
    const r = await env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind('maintenance').first();
    actif = !!r && r.valeur === '1';
  } catch (e) {
    actif = false; // table absente ou base injoignable : le site reste ouvert
  }
  cache = { actif, lu: Date.now() };
  return actif;
}

export async function changerMaintenance(env, actif) {
  await env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?1, ?2) ON CONFLICT (cle) DO UPDATE SET valeur = ?2')
    .bind('maintenance', actif ? '1' : '0').run();
  cache = { actif, lu: Date.now() };
}

// Même fond que la page d'accueil (papier millimétré + instruments de science), message en rouge. La page se recharge
// d'elle-même à la réouverture (functions/api/etat.js).
export const PAGE_MAINTENANCE = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Boîtes à classer revient bientôt</title>
  <link rel="icon" href="/icone.png">
  <style>
    @font-face {
      font-family: "Space Grotesk";
      font-weight: 300 700;
      font-display: swap;
      src: url(/polices/space-grotesk-latin.woff2) format("woff2");
    }
    :root {
      --fond: #f6f4ef;
      --degrade: linear-gradient(160deg, #eaf6f4 0%, #eef3fc 50%, #f3effb 100%);
      --grille: rgb(58 123 213 / .07);
      --grille-forte: rgb(58 123 213 / .14);
      --motif-opacite: .5;
      --voile: rgb(255 255 255 / .82);
      --ombre: 0 6px 18px rgb(58 110 170 / .14);
      --rouge: #d32f2f;
      --doux: #5f6675;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --fond: #15171c;
        --degrade: linear-gradient(160deg, #0f1f22 0%, #131b2c 50%, #1a1730 100%);
        --grille: rgb(120 165 235 / .06);
        --grille-forte: rgb(120 165 235 / .12);
        --motif-opacite: .22;
        --voile: rgb(24 22 38 / .82);
        --ombre: 0 6px 18px rgb(0 0 0 / .35);
        --rouge: #ff6b6b;
        --doux: #a3a8b4;
      }
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      display: grid;
      place-items: center;
      padding: 16px;
      background:
        linear-gradient(var(--grille-forte) 1px, transparent 1px) 0 0 / 120px 120px fixed,
        linear-gradient(90deg, var(--grille-forte) 1px, transparent 1px) 0 0 / 120px 120px fixed,
        linear-gradient(var(--grille) 1px, transparent 1px) 0 0 / 24px 24px fixed,
        linear-gradient(90deg, var(--grille) 1px, transparent 1px) 0 0 / 24px 24px fixed,
        var(--fond) var(--degrade) fixed;
      font: 17px/1.5 "Space Grotesk", system-ui, sans-serif;
      text-align: center;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      background: url(/fond-sciences.svg) 0 0 / 320px 320px;
      opacity: var(--motif-opacite);
      pointer-events: none;
    }
    main {
      max-width: 720px;
      padding: 32px 28px;
      background: var(--voile);
      border-radius: 22px;
      box-shadow: var(--ombre);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
    }
    img { width: 88px; height: 88px; }
    h1 { margin: 16px 0 8px; color: var(--rouge); font-size: clamp(1.8rem, 6vw, 3rem); line-height: 1.15; }
    p { margin: 0; color: var(--doux); }
  </style>
</head>
<body>
  <main>
    <img src="/icone.png" alt="">
    <h1 data-nom-site>Boîtes à classer revient dans peu de temps…</h1>
    <p>Le site est momentanément fermé. Ton travail est bien gardé : la page reviendra toute seule dès la réouverture.</p>
  </main>
  <script>
    // Dès que l'admin rouvre le site, /api/etat ne répond plus 503 : on recharge, et la vraie page revient.
    // (« attendre » d'une valeur qui ne correspond à aucun état : réponse immédiate, voir functions/api/etat.js.)
    setInterval(function () {
      fetch('/api/etat?v=4&attendre=arret', { cache: 'no-store' }).then(function (rep) { if (rep.ok) location.reload(); }).catch(function () {});
    }, 10000);
  </script>
</body>
</html>
`;
