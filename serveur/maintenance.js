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

// Même fond que la page d'accueil (papier millimétré + instruments de science). Un petit clip (une quinzaine de secondes)
// rassure d'abord le visiteur (pas de panique, grosse mise à jour en préparation, travail gardé), puis la page reste
// sur « Défaut majeur » avec un lien vers le service client, ouvert pendant l'arrêt. « Moins d'animations » : la fin
// directement. La page se recharge d'elle-même à la réouverture (functions/api/etat.js).
export const PAGE_MAINTENANCE = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Défaut majeur · Boîtes à classer</title>
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
    [hidden] { display: none !important; }
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
    h2 { margin: 14px 0 6px; font-size: clamp(1.4rem, 5vw, 2.2rem); line-height: 1.2; }
    p { margin: 0; color: var(--doux); }
    .clip { display: grid; place-items: center; min-height: 330px; }
    .scene { display: none; }
    .scene.visible { display: block; animation: entree .7s cubic-bezier(.2, 1.4, .4, 1) both; }
    .gros { font-size: clamp(3.5rem, 14vw, 5.5rem); line-height: 1.1; }
    .secoue { display: inline-block; animation: secoue .5s ease-in-out 3; }
    .rebond span { display: inline-block; font-size: clamp(2.6rem, 10vw, 4rem); animation: rebond 1.1s ease-in-out infinite; }
    .rebond span:nth-child(2) { animation-delay: .15s; }
    .rebond span:nth-child(3) { animation-delay: .3s; }
    .rangement { position: relative; height: 110px; width: 240px; margin: 0 auto; font-size: 2.6rem; }
    .rangement .caisse { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); font-size: 4rem; }
    .rangement .carte { position: absolute; bottom: 30px; animation: vol 1.4s ease-in both; }
    .rangement .c1 { left: 0; }
    .rangement .c2 { left: 45%; bottom: 80px; animation-delay: .5s; }
    .rangement .c3 { right: 0; animation-delay: 1s; }
    .titre-41 strong { display: inline-block; color: #2f6fde; animation: pulse 1.2s ease-in-out infinite; }
    .etincelles { font-size: clamp(3rem, 12vw, 4.5rem); animation: tourne 3s linear infinite; display: inline-block; }
    .rassure { margin: 4px 0 12px; font-weight: 600; color: var(--doux); }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 18px; }
    .bouton { display: inline-block; padding: .6rem 1.2rem; border: 0; border-radius: 999px; background: #2f6fde; color: #fff;
      font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
    .bouton.second { background: rgb(47 111 222 / .12); color: #2f6fde; }
    .passer { position: fixed; right: 16px; bottom: 16px; }
    @keyframes entree { from { opacity: 0; transform: scale(.85) translateY(14px); } to { opacity: 1; transform: none; } }
    @keyframes secoue { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-12deg); } 75% { transform: rotate(12deg); } }
    @keyframes rebond { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
    @keyframes vol { from { opacity: 0; transform: translateY(-60px) rotate(-20deg); } 60% { opacity: 1; } to { opacity: 0; transform: translate(0, 40px) scale(.4); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
    @keyframes tourne { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .scene.visible, .scene * { animation: none !important; } }
  </style>
</head>
<body>
  <main>
    <div class="clip" aria-live="polite">
      <div class="scene" data-duree="3000">
        <img class="secoue" src="/icone.png" alt="">
        <h1>Défaut majeur ?</h1>
      </div>
      <div class="scene" data-duree="3200">
        <div class="gros">😌</div>
        <h2>Pas de panique !</h2>
        <p>Rien n'est cassé : le site est fermé exprès.</p>
      </div>
      <div class="scene" data-duree="3800">
        <div class="rebond"><span>🧰</span><span>📦</span><span>🛠️</span></div>
        <h2>On prépare une énorme mise à jour</h2>
        <p>Des nouveautés comme vous n'en avez jamais vu…</p>
      </div>
      <div class="scene" data-duree="3800">
        <div class="rangement"><span class="carte c1">🐸</span><span class="carte c2">🌻</span><span class="carte c3">🦊</span><span class="caisse">🗃️</span></div>
        <h2>Ton travail est bien gardé 💾</h2>
        <p>Rien n'est perdu : tout sera là à la réouverture.</p>
      </div>
      <div class="scene" data-duree="4200">
        <div class="etincelles">✨</div>
        <h2 class="titre-41">Boîtes à classer <strong>4.1</strong></h2>
        <p>Arrive très bientôt. Préparez-vous à être surpris !</p>
      </div>
      <div class="scene">
        <img src="/icone.png" alt="">
        <h1>Défaut majeur</h1>
        <p class="rassure">Pas de panique : le site est fermé le temps de préparer la mise à jour 4.1.</p>
        <p>Ton travail est bien gardé : la page reviendra toute seule dès la réouverture.</p>
        <p class="actions">
          <a class="bouton" href="/aide/">💬 Poser une question au service client</a>
          <button type="button" class="bouton second" id="revoir">↻ Revoir le message</button>
        </p>
      </div>
    </div>
    <button type="button" class="bouton second passer" id="passer">Passer ⏭</button>
  </main>
  <script>
    (function () {
      // Le clip : chaque scène reste data-duree millisecondes, la dernière reste affichée.
      var scenes = [].slice.call(document.querySelectorAll('.scene'));
      var calme = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      var minuterie = null;
      function montrer(i) {
        scenes.forEach(function (s, j) { s.classList.toggle('visible', j === i); });
        var finie = i === scenes.length - 1;
        document.getElementById('passer').hidden = finie;
        var duree = Number(scenes[i].getAttribute('data-duree'));
        if (!finie && duree) minuterie = setTimeout(function () { montrer(i + 1); }, duree);
      }
      function jouer(depuis) { clearTimeout(minuterie); montrer(depuis); }
      document.getElementById('passer').addEventListener('click', function () { jouer(scenes.length - 1); });
      document.getElementById('revoir').addEventListener('click', function () { jouer(0); });
      jouer(calme ? scenes.length - 1 : 0);
    }());
    // Dès que l'admin rouvre le site, /api/etat ne répond plus 503 : on recharge, et la vraie page revient.
    // (« attendre » d'une valeur qui ne correspond à aucun état : réponse immédiate, voir functions/api/etat.js.)
    setInterval(function () {
      fetch('/api/etat?v=4&attendre=arret', { cache: 'no-store' }).then(function (rep) { if (rep.ok) location.reload(); }).catch(function () {});
    }, 10000);
  </script>
</body>
</html>
`;
