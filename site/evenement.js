// Effets des événements du site (serveur/evenement.js : Halloween, Noël), chargés par site/arret.js et app/app.js
// quand un admin en a déclenché un (page site/admin/). Chaque événement a sa fiche dans THEMES (petits personnages à
// attraper, boss, textes, couleurs, décor). Préfixe « hanter » (classes, window.hanter) : historique, Halloween d'abord.
// - accueil : s'il ne porte pas déjà le thème de l'événement (classe « theme-<nom> » sur <html>,
//   site/<nom>/theme.css), il le prend le temps de l'événement puis retrouve le sien ; le fond s'anime et le clip
//   d'intro (site/<nom>/index.html) passe une fois par déclenchement ;
// - partout : les petits personnages (fantômes, lutins) traversent la page ; un clic les attrape, et chacun rapporte
//   un point à un compte connecté (functions/api/evenement/[action].js). « Chasser les … » les renvoie (choix gardé
//   dans le navigateur ; dans le logiciel, l'entrée est dans 🧰 Outils) ;
// - quand tous ensemble en ont attrapé 30, le boss (Roi des fantômes, Père Noël) apparaît chez tout le monde : chaque
//   clic (compte connecté) lui retire 1 000 PV, la barre suit les clics de tous ; celui qui a cliqué le plus gagne les
//   badges « vérifié par le site » et celui de l'événement (écran de victoire, une fois) ; tout participant gagne le
//   badge de participation ;
// - à la fin de l'événement : le classement, une fois, sur les pages ouvertes et sur l'accueil (puis avec le bandeau).
// Si l'appareil demande moins d'animations : ni fond animé, ni petits personnages, ni clip automatique.
(function () {
  'use strict';
  if (window.hanter) return;
  var BASE = ((document.currentScript && document.currentScript.src) || '/evenement.js').replace(/[^/]*$/, ''); // adresse du site
  var CLE = 'boites-a-classer-evenement:'; // + calme | intro | classement | boss
  var CLE_JETON = 'boites-a-classer-compte:jeton'; // session du compte (app/app.js)
  var racine = document.documentElement;
  var logiciel = /\/app\//.test(location.pathname);
  var pageAccueil = /^\/(index\.html)?$/.test(location.pathname);
  var themePrete = null; // { nom, classes, liens } : thème de l'événement prêté à l'accueil, et ce qu'il remplace
  var reduit = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var en = null; // événement en cours : { nom, depuis }
  var T = null; // sa fiche (THEMES)
  var fond = null, troupe = null, bouton = null, intro = null, minuteur = null, annonce = null, annonceCreee = null;
  var puce = null, toast = null, classement = null;
  var bossZone = null, bossEl = null, barre = null, bossEtat = null, recharge = 0, victoire = null, total = 0, seuil = 30;
  var points = null, file = 0, envoi = false, prevu = false, dernierEnvoi = 0, conseil = false;

  /* Dessins */
  var FANTOME = '<svg viewBox="0 0 100 124" aria-hidden="true">'
    + '<path d="M50 4C24 4 10 24 10 50v62l13-11 13 11 14-11 14 11 13-11 13 11V50C90 24 76 4 50 4z" fill="#f8f5ff" stroke="#cdbff2" stroke-width="2"/>'
    + '<path d="M11 62q-9 4-8 14q6-1 9-6M89 62q9 4 8 14q-6-1-9-6" fill="#f8f5ff" stroke="#cdbff2" stroke-width="2"/>'
    + '<ellipse cx="36" cy="46" rx="7" ry="9" fill="#2a1840"/><ellipse cx="64" cy="46" rx="7" ry="9" fill="#2a1840"/>'
    + '<circle cx="38" cy="43" r="2.2" fill="#fff"/><circle cx="66" cy="43" r="2.2" fill="#fff"/>'
    + '<ellipse cx="50" cy="70" rx="7" ry="9" fill="#2a1840"/>'
    + '<ellipse cx="25" cy="60" rx="6" ry="3.5" fill="#ffb3cf" opacity=".8"/><ellipse cx="75" cy="60" rx="6" ry="3.5" fill="#ffb3cf" opacity=".8"/></svg>';
  var ROI_FANTOMES = '<svg viewBox="0 0 200 240" aria-hidden="true">'
    + '<path d="M24 132q-20 6-18 32q13-2 21-13M176 132q20 6 18 32q-13-2-21-13" fill="#eee4ff" stroke="#9b7be0" stroke-width="4"/>'
    + '<path d="M100 34C52 34 24 70 24 116v110l22-18 22 18 22-18 20 18 22-18 22 18 22-18V116C176 70 148 34 100 34z" fill="#eee4ff" stroke="#9b7be0" stroke-width="4"/>'
    + '<path d="M60 46l8-32 19 21 13-27 13 27 19-21 8 32z" fill="#ffd34d" stroke="#b8860b" stroke-width="3" stroke-linejoin="round"/>'
    + '<circle cx="100" cy="34" r="5" fill="#ff4d6d"/><circle cx="78" cy="38" r="4" fill="#4dabff"/><circle cx="122" cy="38" r="4" fill="#4dabff"/>'
    + '<path d="M56 88l32 13M144 88l-32 13" stroke="#2a1840" stroke-width="7" stroke-linecap="round"/>'
    + '<ellipse cx="74" cy="110" rx="11" ry="13" fill="#2a1840"/><ellipse cx="126" cy="110" rx="11" ry="13" fill="#2a1840"/>'
    + '<circle cx="77" cy="112" r="4.5" fill="#ff4d4d"/><circle cx="123" cy="112" r="4.5" fill="#ff4d4d"/>'
    + '<path d="M68 150q32 26 64 0q-32 11-64 0z" fill="#2a1840"/><path d="M80 154l5 11 5-10M110 155l5 10 5-11" fill="#fff"/>'
    + '<ellipse cx="52" cy="132" rx="9" ry="5" fill="#d9a0ff" opacity=".6"/><ellipse cx="148" cy="132" rx="9" ry="5" fill="#d9a0ff" opacity=".6"/></svg>';
  var CHAUVE_SOURIS = '<svg viewBox="0 0 64 30" aria-hidden="true">'
    + '<path d="M32 10l-3-6-2 5C20 3 9 3 0 10c6 1 9 5 9 10 3-3 7-3 10 0 1-3 4-5 7-3 1-3 3-5 6-5s5 2 6 5c3-2 6 0 7 3 3-3 7-3 10 0 0-5 3-9 9-10-9-7-20-7-27-1l-2-5z" fill="#160c26" stroke="#7a5bb0" stroke-width=".8"/>'
    + '<circle cx="29.5" cy="11" r="1.2" fill="#ffd166"/><circle cx="34.5" cy="11" r="1.2" fill="#ffd166"/></svg>';
  var LUTIN = '<svg viewBox="0 0 100 124" aria-hidden="true">'
    + '<path d="M24 46C28 18 56 2 88 8c-12 4-20 12-24 22l-8 16z" fill="#2fa05a"/><circle cx="89" cy="9" r="7" fill="#fff"/>'
    + '<path d="M22 60l-15-12 6 20zM78 60l15-12-6 20z" fill="#f6c9a4"/>'
    + '<path d="M26 88h48l9 32H17z" fill="#2fa05a"/><path d="M30 88l8 8 6-8 6 8 6-8 6 8 8-8z" fill="#e8364f"/>'
    + '<rect x="21" y="102" width="58" height="7" fill="#3a2418"/><rect x="45" y="100" width="10" height="11" rx="1" fill="#ffd34d"/>'
    + '<ellipse cx="50" cy="66" rx="30" ry="23" fill="#fbd7b5"/>'
    + '<rect x="18" y="38" width="64" height="13" rx="6.5" fill="#e8364f"/>'
    + '<ellipse cx="40" cy="64" rx="3.6" ry="4.6" fill="#2a1840"/><ellipse cx="60" cy="64" rx="3.6" ry="4.6" fill="#2a1840"/>'
    + '<circle cx="41" cy="62.5" r="1.2" fill="#fff"/><circle cx="61" cy="62.5" r="1.2" fill="#fff"/>'
    + '<circle cx="31" cy="74" r="5" fill="#ff9aa8" opacity=".7"/><circle cx="69" cy="74" r="5" fill="#ff9aa8" opacity=".7"/>'
    + '<circle cx="50" cy="70" r="3.2" fill="#f2a98a"/><path d="M42 77q8 7 16 0" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
  var PERE_NOEL = '<svg viewBox="0 0 200 240" aria-hidden="true">'
    + '<path d="M46 160q-32 8-32 44" stroke="#d6334a" stroke-width="22" fill="none" stroke-linecap="round"/><circle cx="14" cy="208" r="12" fill="#2a1a12"/>'
    + '<path d="M154 160q34-4 36-46" stroke="#d6334a" stroke-width="22" fill="none" stroke-linecap="round"/><circle cx="190" cy="110" r="12" fill="#2a1a12"/>'
    + '<path d="M40 154q60-30 120 0l14 84H26z" fill="#d6334a"/><rect x="93" y="150" width="14" height="88" fill="#fff"/>'
    + '<rect x="30" y="196" width="140" height="16" fill="#2a1a12"/><rect x="87" y="191" width="26" height="26" rx="3" fill="none" stroke="#ffd34d" stroke-width="5"/>'
    + '<ellipse cx="100" cy="106" rx="38" ry="30" fill="#fbd7b5"/>'
    + '<path d="M60 114q4 58 40 66q36-8 40-66q-12 16-40 18q-28-2-40-18z" fill="#fff" stroke="#dfe6ef" stroke-width="2"/>'
    + '<path d="M100 118q-16-10-30 0q10 10 30 2q20 8 30-2q-14-10-30 0z" fill="#fff" stroke="#dfe6ef" stroke-width="2"/>'
    + '<path d="M92 128q8 6 16 0" stroke="#b5465a" stroke-width="4" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="86" cy="99" rx="4.5" ry="5.5" fill="#2a1a12"/><ellipse cx="114" cy="99" rx="4.5" ry="5.5" fill="#2a1a12"/>'
    + '<path d="M78 90q8-5 16 0M106 90q8-5 16 0" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>'
    + '<circle cx="74" cy="112" r="7" fill="#ff8f9c" opacity=".7"/><circle cx="126" cy="112" r="7" fill="#ff8f9c" opacity=".7"/><circle cx="100" cy="110" r="7" fill="#f29a86"/>'
    + '<path d="M52 76C58 32 88 12 124 16c22 3 34 18 40 40l-16 6c-4-12-10-20-20-22l8 36z" fill="#d6334a"/><circle cx="158" cy="64" r="11" fill="#fff"/>'
    + '<rect x="46" y="68" width="110" height="20" rx="10" fill="#fff"/></svg>';
  var TRAINEAU = '<svg viewBox="0 0 230 60" aria-hidden="true"><g fill="#0b1426">'
    + '<path d="M150 28h52q8 0 9-8l1-6h6l-1 8q-2 16-16 16h-51z"/><path d="M146 42h68q5 0 5 4v2h-73z"/>'
    + '<circle cx="178" cy="16" r="7"/><path d="M170 22h16l2 10h-20z"/><path d="M172 12l8-10 6 9z"/>'
    + '<path d="M88 34q2-9 12-9h14q5 0 7-5l3-7 2 1-2 7 6-5 1 2-7 6q-2 7-9 8l2 14h-4l-3-12h-12l-4 12h-4l2-14q-5 0-6 2z"/>'
    + '<path d="M28 34q2-9 12-9h14q5 0 7-5l3-7 2 1-2 7 6-5 1 2-7 6q-2 7-9 8l2 14h-4l-3-12h-12l-4 12h-4l2-14q-5 0-6 2z"/>'
    + '</g><path d="M66 26l36 2M124 22l26 8" stroke="#0b1426" stroke-width="1.6" fill="none"/></svg>';

  /* Fiches des événements : ce qui change d'un événement à l'autre. */
  var THEMES = {
    halloween: {
      emoji: '🎃', de: "d'Halloween", police: 'Creepster', site: 'Boîtes à hanter', // nom du site à son thème (serveur/theme.js)
      petit: { svg: FANTOME, emoji: '👻', un: 'fantôme', des: 'fantômes', attrape: 'Bouh !', coucou: 'Bouh !', vide: 'Ils courent toujours !',
        hauteur: [8, 68], duree: [10, 18] }, // ils flottent partout
      boss: { svg: ROI_FANTOMES, titre: '👑 Le Roi des fantômes', nom: 'le Roi des fantômes', Nom: 'Le Roi des fantômes', emoji: '⚔️',
        apparu: "👑 Le Roi des fantômes est apparu ! Tout le monde à l'attaque : clique dessus !", agir: "l'attaquer",
        vaincu: 'vaincu', victoire: '👑 Victoire !', coup: ['coup', 'coups'], coupPorte: ['coup porté', 'coups portés'], plus: 'a porté le plus de coups',
        rien: "Tu n'as pas combattu le boss cette fois-ci.", connecte: 'Connecte-toi la prochaine fois pour combattre le boss !',
        enCours: "👑 Le Roi des fantômes est là : tout le monde à l'attaque ! ", lePlus: 'le plus de coups' },
      badge: ['halloween', '🎃', 'badge Halloween'],
      couleurs: ['#ff8c1a', '#1b0f02', 'linear-gradient(180deg,#22123a,#140b24)', '#46325f', '#cbbfdf', '#ff9a2e', 'rgb(255 120 0 / .45)',
        'rgb(255 140 26 / .13)', '#b98cff', '#ffd2a1', 'rgb(25 15 40 / .94)', '#c58bff', '#6d52a0', 'rgb(190 120 255 / .85)', 'rgb(225 215 255 / .65)', '#2a1840', 'rgb(8 4 16 / .8)', 400],
      decor: decorHalloween,
    },
    noel: {
      emoji: '🎄', de: 'de Noël', police: 'Mountains of Christmas', site: 'Boîtes à lutins',
      petit: { svg: LUTIN, emoji: '🧝', un: 'lutin', des: 'lutins', attrape: 'Hop !', coucou: 'Coucou !', vide: 'Ils se cachent toujours !',
        hauteur: [38, 78], duree: [7, 12] }, // ils courent en sautillant dans le bas de l'écran
      boss: { svg: PERE_NOEL, titre: '🎅 Le Père Noël', nom: 'le Père Noël', Nom: 'Le Père Noël', emoji: '🎁',
        apparu: "🎅 Le Père Noël est arrivé ! Tout le monde l'attrape : clique dessus !", agir: "l'attraper",
        vaincu: 'attrapé', victoire: '🎁 Bravo !', coup: ['clic', 'clics'], coupPorte: ['clic', 'clics'], plus: "l'a attrapé le plus de fois",
        rien: "Tu n'as pas attrapé le Père Noël cette fois-ci.", connecte: 'Connecte-toi la prochaine fois pour attraper le Père Noël !',
        enCours: "🎅 Le Père Noël est là : tout le monde l'attrape ! ", lePlus: 'le plus de clics' },
      badge: ['noel', '🎅', 'badge Noël'],
      couleurs: ['#e8364f', '#ffffff', 'linear-gradient(180deg,#16305a,#0b1730)', '#2c4670', '#bccbe4', '#ffffff', 'rgb(255 255 255 / .35)',
        'rgb(232 54 79 / .16)', '#6fc3ff', '#ffe08a', 'rgb(12 25 50 / .94)', '#ff7a8a', '#2c4670', 'rgb(255 255 255 / .55)', 'rgb(255 255 255 / .5)', '#1f5d36', 'rgb(4 10 24 / .8)', 700],
      decor: decorNoel,
    },
  };
  var accueilDe = function (nom) { return racine.classList.contains('theme-' + nom); };
  var accueil = function () { return !!T && accueilDe(T.nom); };
  Object.keys(THEMES).forEach(function (k) { THEMES[k].nom = k; });

  // Couleurs de la fiche, en variables CSS sur <html> (data-evenement).
  function variables(t) {
    var c = t.couleurs, noms = ['accent', 'accent-encre', 'carte', 'bord', 'doux', 'titre', 'titre-ombre', 'surligne', 'moi', 'moi-texte',
      'sombre', 'barre-titre', 'barre-bord', 'aura-boss', 'aura-petit', 'bulle', 'voile', 'poids'];
    return ':root[data-evenement="' + t.nom + '"]{--ev-police:"' + t.police + '",fantasy,system-ui;'
      + noms.map(function (n, i) { return '--ev-' + n + ':' + c[i]; }).join(';') + '}';
  }

  var STYLE = [
    '@font-face{font-family:"Creepster";font-display:swap;src:url(' + BASE + 'polices/creepster-latin.woff2) format("woff2")}',
    '@font-face{font-family:"Mountains of Christmas";font-weight:700;font-display:swap;src:url(' + BASE + 'polices/mountains-of-christmas-latin.woff2) format("woff2")}',
    Object.keys(THEMES).map(function (k) { return variables(THEMES[k]); }).join('\n'),
    '.hanter-en-cours .panneau{-webkit-backdrop-filter:none;backdrop-filter:none}', // le flou suivrait chaque image du fond animé
    '.hanter-fond{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}',
    '.hanter-etoiles{position:absolute;inset:0 0 30% 0;animation:hanter-scintille 2.6s ease-in-out infinite alternate}',
    '.hanter-etoiles.b{animation-delay:-1.3s}',
    '@keyframes hanter-scintille{from{opacity:.2}to{opacity:1}}',
    '.hanter-lune{position:absolute;left:86%;top:11%;width:320px;height:320px;margin:-160px 0 0 -160px;border-radius:50%;background:radial-gradient(circle,rgb(255 236 170 / .45) 0 18%,rgb(255 220 140 / .14) 38%,transparent 68%);animation:hanter-lune 4.5s ease-in-out infinite alternate}',
    ':root[data-evenement="noel"] .hanter-lune{background:radial-gradient(circle,rgb(225 238 255 / .45) 0 18%,rgb(200 220 255 / .14) 38%,transparent 68%)}',
    '@keyframes hanter-lune{from{transform:scale(.88);opacity:.55}to{transform:scale(1.12);opacity:1}}',
    // Halloween : chauves-souris, brume, citrouilles, éclairs
    '.hanter-vol{position:absolute;left:0;top:var(--y);width:var(--t);animation:hanter-vol var(--d) linear var(--r) infinite;will-change:transform}',
    '.hanter-vol.retour{animation-direction:reverse}',
    '.hanter-vol>div{animation:hanter-vague 2.1s ease-in-out infinite alternate}',
    '.hanter-vol svg{display:block;width:100%;transform-origin:50% 40%;animation:hanter-ailes .2s ease-in-out infinite alternate}',
    '@keyframes hanter-vol{from{transform:translateX(-120%)}to{transform:translateX(calc(100vw + 20%))}}',
    '@keyframes hanter-vague{from{transform:translateY(-24px)}to{transform:translateY(24px)}}',
    '@keyframes hanter-ailes{from{transform:scaleY(1)}to{transform:scaleY(.35)}}',
    '.hanter-brume{position:absolute;left:-50%;bottom:-6vh;width:200%;height:34vh;filter:blur(8px);',
    'background:radial-gradient(ellipse 16% 42% at 12% 70%,rgb(205 185 255 / .26),transparent 70%),radial-gradient(ellipse 22% 46% at 42% 76%,rgb(205 185 255 / .2),transparent 70%),radial-gradient(ellipse 18% 40% at 70% 70%,rgb(205 185 255 / .26),transparent 70%),radial-gradient(ellipse 16% 40% at 92% 76%,rgb(205 185 255 / .2),transparent 70%);',
    'animation:hanter-brume 36s ease-in-out infinite alternate}',
    '.hanter-brume.b{bottom:5vh;opacity:.7;animation-duration:50s;animation-direction:alternate-reverse}',
    '@keyframes hanter-brume{from{transform:translateX(-12%)}to{transform:translateX(12%)}}',
    '.hanter-citrouille{position:absolute;bottom:1.5vh;font-size:clamp(34px,5vw,58px);line-height:1;animation:hanter-bougie 1.5s ease-in-out infinite alternate}',
    '@keyframes hanter-bougie{0%{filter:drop-shadow(0 0 5px rgb(255 140 26 / .45))}55%{filter:drop-shadow(0 0 18px rgb(255 165 40 / .95))}100%{filter:drop-shadow(0 0 9px rgb(255 120 20 / .7))}}',
    // Deux éclairs doux toutes les 13 s : bien en dessous de 3 flashs par seconde.
    '.hanter-eclair{position:absolute;inset:0;background:#d9ccff;opacity:0;animation:hanter-eclair 13s linear 4s infinite}',
    '@keyframes hanter-eclair{0%,88%,100%{opacity:0}89%{opacity:.2}90.5%{opacity:.03}92%{opacity:.14}94%{opacity:0}}',
    // Noël : neige, guirlande, traîneau
    '.hanter-neige{position:absolute;top:0;left:var(--x);width:var(--t);height:var(--t);border-radius:50%;background:#fff;opacity:var(--o);animation:hanter-neige var(--d) linear var(--r) infinite;will-change:transform}',
    '@keyframes hanter-neige{from{transform:translate(0,-6vh)}to{transform:translate(var(--dx),106vh)}}',
    '.hanter-guirlande{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-around;height:30px;background:linear-gradient(#123018,#123018) 0 5px/100% 2px no-repeat}',
    '.hanter-ampoule{width:9px;height:14px;margin-top:6px;border-radius:50% 50% 45% 45%;background:var(--c);box-shadow:0 0 10px 3px var(--c);animation:hanter-clignote 1.4s steps(2,jump-none) var(--r) infinite}',
    '@keyframes hanter-clignote{50%{opacity:.3;box-shadow:none}}',
    '.hanter-traineau{position:absolute;top:7%;left:0;width:min(30vw,230px);animation:hanter-traineau 20s linear 2s infinite}',
    '@keyframes hanter-traineau{0%{transform:translate(-110%,5vh)}35%{transform:translate(105vw,-2vh)}100%{transform:translate(105vw,-2vh)}}',
    '.hanter-traineau svg{display:block;width:100%}',
    // Petits personnages
    '.hanter-troupe{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden}',
    '.hanter-fantome{position:absolute;left:0;top:var(--y);width:var(--t);animation:hanter-traverse var(--d) linear forwards;will-change:transform}',
    '.hanter-fantome.gauche{animation-name:hanter-traverse-g}',
    '@keyframes hanter-traverse{from{transform:translateX(-110%)}to{transform:translateX(calc(100vw + 10%))}}',
    '@keyframes hanter-traverse-g{from{transform:translateX(calc(100vw + 10%))}to{transform:translateX(-110%)}}',
    '.hanter-fantome>div{position:relative;animation:hanter-onde 2.3s ease-in-out infinite alternate}',
    '@keyframes hanter-onde{from{transform:translateY(-16px) rotate(-6deg)}to{transform:translateY(16px) rotate(6deg)}}',
    '.hanter-fantome svg{display:block;width:100%;opacity:.95;filter:drop-shadow(0 0 14px var(--ev-aura-petit))}',
    ':root[data-evenement="noel"] .hanter-fantome:not(.coucou):not(.pouf)>div{animation:hanter-saut .42s cubic-bezier(.3,0,.7,1) infinite alternate}',
    '@keyframes hanter-saut{from{transform:translateY(0) rotate(-5deg)}to{transform:translateY(-30px) rotate(5deg)}}',
    '.hanter-fantome.gauche svg{transform:scaleX(-1)}',
    '.hanter-fantome.coucou{top:auto;bottom:0;left:var(--x);animation:hanter-coucou 5s ease-in-out forwards}',
    '.hanter-fantome.coucou>div{animation-duration:1.2s}',
    '@keyframes hanter-coucou{0%{transform:translateY(110%)}25%,70%{transform:translateY(22%)}100%{transform:translateY(110%)}}',
    '.hanter-bulle{position:absolute;bottom:100%;left:50%;margin-bottom:6px;padding:.2em .6em;border-radius:1em;background:#fff;color:var(--ev-bulle);font:var(--ev-poids) 22px/1.2 var(--ev-police);letter-spacing:.03em;white-space:nowrap;transform:translateX(-50%);box-shadow:0 3px 10px rgb(0 0 0 / .35);opacity:0}',
    '.coucou .hanter-bulle{animation:hanter-bulle 5s forwards}',
    '@keyframes hanter-bulle{0%,32%{opacity:0}38%,64%{opacity:1}70%,100%{opacity:0}}',
    '.hanter-troupe svg{pointer-events:auto;cursor:pointer}',
    '.hanter-fantome.pouf>div{animation:hanter-pouf .55s ease-out forwards}',
    '.hanter-fantome.pouf .hanter-bulle{animation:none;opacity:1}',
    '@keyframes hanter-pouf{to{transform:scale(1.5) rotate(12deg);opacity:0}}',
    '.hanter-bouton{position:fixed;left:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483001;padding:.55rem .95rem;border:1px solid rgb(255 255 255 / .25);border-radius:999px;background:var(--ev-sombre);color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgb(0 0 0 / .4);cursor:pointer}',
    '.hanter-bouton:focus-visible,.hanter-passer:focus-visible,.hanter-revoir:focus-visible{outline:3px solid var(--ev-accent);outline-offset:2px}',
    '.hanter-puce{position:fixed;left:12px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 48px);z-index:2147483001;padding:.35rem .85rem;border-radius:999px;background:var(--ev-accent);color:var(--ev-accent-encre);font:700 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgb(0 0 0 / .4)}',
    '.hanter-puce[hidden]{display:none}',
    '.hanter-toast{position:fixed;left:50%;bottom:96px;z-index:2147483500;width:max-content;max-width:min(92vw,440px);padding:.75rem 1.1rem;border-radius:14px;background:var(--ev-sombre);color:#fff;font:600 15px/1.4 system-ui,sans-serif;text-align:center;transform:translateX(-50%);box-shadow:0 6px 20px rgb(0 0 0 / .45)}',
    // Classement, victoire
    '.hanter-classement{position:fixed;inset:0;z-index:2147483550;display:grid;place-items:center;padding:16px;background:var(--ev-voile)}',
    '.hanter-classement>div{width:min(100%,460px);max-height:calc(100vh - 32px);overflow:auto;padding:22px 20px 18px;border:1px solid var(--ev-bord);border-radius:22px;background:var(--ev-carte);color:#f4f2fc;font:16px/1.45 "Space Grotesk",system-ui,sans-serif;box-shadow:0 12px 40px rgb(0 0 0 / .6)}',
    '.hanter-classement h2{margin:0 0 4px;font:var(--ev-poids) 32px/1.1 var(--ev-police);letter-spacing:.03em;color:var(--ev-titre);text-align:center;text-shadow:0 0 14px var(--ev-titre-ombre)}',
    '.hanter-classement .sous{margin:0 0 14px;color:var(--ev-doux);font-size:14px;text-align:center}',
    '.hanter-classement ol{margin:0;padding:0;list-style:none}',
    '.hanter-classement li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px}',
    '.hanter-classement li:nth-child(-n+3){background:var(--ev-surligne);font-weight:700}',
    '.hanter-classement li.moi{outline:2px solid var(--ev-moi)}',
    '.hanter-classement .place{width:2em;font-size:20px;text-align:center}',
    '.hanter-classement .nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.hanter-classement .pts{font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.hanter-classement .moi-texte{margin:14px 0 0;color:var(--ev-moi-texte);text-align:center}',
    '.hanter-classement button{display:block;margin:16px auto 0;padding:.55rem 1.4rem;border:0;border-radius:999px;background:var(--ev-accent);color:var(--ev-accent-encre);font:700 16px/1.2 system-ui,sans-serif;cursor:pointer}',
    '.hanter-classement button:focus-visible{outline:3px solid #fff;outline-offset:2px}',
    '.hanter-classement .gagnant{margin:0 0 12px;padding:10px 12px;border-radius:14px;background:rgb(255 211 77 / .14);color:#ffe7a3;text-align:center}',
    '.hanter-verifie{display:inline-grid;place-items:center;width:1.1em;height:1.1em;margin-left:.3em;border-radius:50%;background:#1d9bf0;color:#fff;font:900 .7em/1 system-ui,sans-serif;vertical-align:.1em}',
    '.hanter-badge{margin-left:.25em}',
    // Rond de la photo de profil dans les classements (comme .avatar de app/profil.css, en sombre)
    '.hanter-rond{display:inline-grid;place-items:center;width:28px;height:28px;margin-right:8px;border-radius:50%;background:rgb(255 255 255 / .12);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .18);font-size:16px;font-weight:400;line-height:1;vertical-align:middle}',
    '.hanter-rond.initiale{background:linear-gradient(140deg,hsl(var(--teinte) 78% 64%),hsl(calc(var(--teinte) + 38) 70% 46%));box-shadow:inset 0 -2px 0 rgb(0 0 0 / .14);color:#fff;font-size:13px;font-weight:700;text-shadow:0 1px 2px rgb(0 0 0 / .22)}',
    // Boss
    '.hanter-boss-zone{position:fixed;inset:0;z-index:2147483100;pointer-events:none;overflow:hidden}',
    '.hanter-boss-zone.cache{display:none}',
    '.hanter-boss-barre{position:relative;left:50%;width:max(100%,250px);margin-bottom:8px;padding:6px 12px 8px;border:1px solid var(--ev-barre-bord);border-radius:14px;background:var(--ev-sombre);color:#fff;font:600 13px/1.3 system-ui,sans-serif;text-align:center;transform:translateX(-50%);box-shadow:0 6px 22px rgb(0 0 0 / .5)}',
    '.hanter-boss-barre b{display:block;color:var(--ev-barre-titre);font:var(--ev-poids) 21px/1.1 var(--ev-police);letter-spacing:.03em}',
    '.hanter-boss-barre .jauge{display:block;height:14px;margin:6px 0 5px;border-radius:99px;background:rgb(255 255 255 / .15);overflow:hidden}',
    '.hanter-boss-barre .jauge i{display:block;width:100%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff4d4d,#ff8c1a,#7bd88f);transition:width .4s}',
    '.hanter-boss{position:absolute;left:50%;top:56%;width:min(44vw,44vh,320px);transform:translate(-50%,-50%);animation:hanter-boss-arrivee .9s cubic-bezier(.2,1.3,.4,1),hanter-boss-derive 14s ease-in-out .9s infinite alternate}',
    '@keyframes hanter-boss-arrivee{from{transform:translate(-50%,-160%) scale(.3);opacity:0}to{transform:translate(-50%,-50%)}}',
    '.hanter-boss .corps{animation:hanter-onde 2.6s ease-in-out infinite alternate}',
    '.hanter-boss svg{display:block;width:100%;pointer-events:auto;cursor:crosshair;filter:drop-shadow(0 0 28px var(--ev-aura-boss))}',
    '.hanter-boss.touche svg{animation:hanter-touche .25s}',
    '@keyframes hanter-touche{35%{transform:scale(.93) rotate(-4deg);filter:drop-shadow(0 0 28px rgb(255 70 70 / .95)) brightness(1.35)}}',
    '@keyframes hanter-boss-derive{0%{transform:translate(-85%,-60%)}33%{transform:translate(-20%,-42%)}66%{transform:translate(-70%,-35%)}100%{transform:translate(-25%,-62%)}}',
    '.hanter-degat{position:absolute;color:#ff5d5d;font:var(--ev-poids) 30px/1 var(--ev-police);text-shadow:0 2px 0 #3a0000,0 0 10px rgb(255 0 0 / .6);pointer-events:none;transform:translate(-50%,-50%);animation:hanter-degat .9s ease-out forwards}',
    '.hanter-degat.rate{color:#bbb;text-decoration:line-through}',
    '@keyframes hanter-degat{to{transform:translate(-50%,-170%);opacity:0}}',
    '.hanter-boss-zone.vaincu .hanter-boss{animation:hanter-boss-fin 1.5s ease-in forwards}',
    '.hanter-boss-zone.vaincu .hanter-boss svg{pointer-events:none}',
    '@keyframes hanter-boss-fin{to{transform:translate(-50%,-50%) scale(1.8) rotate(25deg);opacity:0;filter:brightness(3) blur(4px)}}',
    // Le Père Noël ne disparaît pas en fumée : il salue (« Ho ho ho ! ») et s'envole en laissant des cadeaux.
    ':root[data-evenement="noel"] .hanter-boss-zone.vaincu .hanter-boss{animation:hanter-pere-noel 1.6s cubic-bezier(.5,0,.8,.6) forwards}',
    '@keyframes hanter-pere-noel{25%{transform:translate(-50%,-55%) rotate(-6deg)}to{transform:translate(40vw,-110vh) scale(.35) rotate(-18deg);opacity:.4}}',
    '.hanter-boss .hanter-bulle{bottom:auto;top:18%;left:78%;font-size:26px;opacity:1}',
    '.hanter-cadeaux{position:fixed;inset:0;z-index:2147483090;pointer-events:none;overflow:hidden}',
    '.hanter-cadeau{position:absolute;top:-8vh;left:var(--x);font-size:var(--t);animation:hanter-cadeau var(--d) cubic-bezier(.4,0,.8,.6) var(--r) forwards}',
    '@keyframes hanter-cadeau{to{transform:translate(var(--dx),118vh) rotate(var(--a))}}',
    '@media (prefers-reduced-motion:reduce){.hanter-boss,.hanter-boss .corps{animation:none}.hanter-cadeaux{display:none}}',
    // Clip d'intro, bandeau
    '.hanter-intro{position:fixed;inset:0;z-index:2147483600;background:#000;opacity:0;transition:opacity .6s}',
    '.hanter-intro.visible{opacity:1}',
    '.hanter-intro iframe{display:block;width:100%;height:100%;border:0}',
    '.hanter-passer{position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;padding:.5rem 1rem;border:1px solid rgb(255 255 255 / .5);border-radius:999px;background:rgb(0 0 0 / .55);color:#fff;font:600 15px/1.2 system-ui,sans-serif;cursor:pointer}',
    '.hanter-revoir{padding:0;border:0;background:none;color:#fff;font:600 .95rem "Space Grotesk",system-ui,sans-serif;letter-spacing:0;text-decoration:underline;cursor:pointer;white-space:nowrap}',
  ].join('\n');

  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ecrire(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  function hasard(a, b) { return a + Math.random() * (b - a); }
  function el(balise, classe, html) {
    var e = document.createElement(balise);
    if (classe) e.className = classe;
    if (html) e.innerHTML = html;
    return e;
  }
  function pluriel(n, un, plusieurs) { return n + ' ' + (n > 1 ? plusieurs : un); }

  function styler() {
    if (document.getElementById('hanter-style')) return;
    var s = el('style');
    s.id = 'hanter-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }
  // La fiche de l'événement nom (et ses couleurs sur <html>).
  function choisir(nom) {
    T = THEMES[nom] || THEMES.halloween;
    racine.dataset.evenement = T.nom;
    styler();
  }

  function etoiles(classe) {
    var e = el('div', classe), g = [];
    for (var i = 0; i < 45; i++) {
      var r = Math.random() < .2 ? 2.2 : 1.3;
      g.push('radial-gradient(' + r + 'px ' + r + 'px at ' + hasard(0, 100).toFixed(1) + '% ' + hasard(0, 100).toFixed(1) + '%,#fff 50%,transparent 51%)');
    }
    e.style.backgroundImage = g.join(',');
    return e;
  }

  // Fonds animés de l'accueil, par-dessus le fond fixe du thème (site/<nom>/theme.css) et derrière le contenu.
  function decorHalloween(f) {
    for (var i = 0; i < 7; i++) {
      var c = el('div', 'hanter-vol' + (i % 3 === 0 ? ' retour' : ''), '<div>' + CHAUVE_SOURIS + '</div>');
      c.style.setProperty('--y', hasard(4, 55) + 'vh');
      c.style.setProperty('--t', hasard(26, 62) + 'px');
      var d = hasard(9, 17);
      c.style.setProperty('--d', d + 's');
      c.style.setProperty('--r', -hasard(0, d) + 's'); // déjà en vol au démarrage
      f.appendChild(c);
    }
    f.append(el('div', 'hanter-brume'), el('div', 'hanter-brume b'));
    var g = el('div', 'hanter-citrouille', '🎃');
    g.style.left = '3vw';
    var d2 = el('div', 'hanter-citrouille', '🎃');
    d2.style.right = '4vw';
    d2.style.animationDelay = '-.8s';
    f.append(g, d2, el('div', 'hanter-eclair'));
  }
  function decorNoel(f) {
    for (var i = 0; i < 70; i++) {
      var n = el('div', 'hanter-neige'), d = hasard(8, 18);
      n.style.setProperty('--x', hasard(0, 100) + 'vw');
      n.style.setProperty('--t', hasard(3, 8) + 'px');
      n.style.setProperty('--o', hasard(.5, .95).toFixed(2));
      n.style.setProperty('--dx', hasard(-8, 8) + 'vw');
      n.style.setProperty('--d', d + 's');
      n.style.setProperty('--r', -hasard(0, d) + 's'); // déjà en train de tomber
      f.appendChild(n);
    }
    var g = el('div', 'hanter-guirlande'), COULEURS = ['#ff4d6d', '#ffd34d', '#5be38a', '#6fc3ff', '#ff9a3d'];
    for (var j = 0; j < 24; j++) {
      var a = el('span', 'hanter-ampoule');
      a.style.setProperty('--c', COULEURS[j % COULEURS.length]);
      a.style.setProperty('--r', (j % 2 ? -.7 : 0) + 's');
      g.appendChild(a);
    }
    f.append(g, el('div', 'hanter-traineau', TRAINEAU));
  }
  function creerFond() {
    var f = el('div', 'hanter-fond');
    f.setAttribute('aria-hidden', 'true');
    f.append(etoiles('hanter-etoiles'), etoiles('hanter-etoiles b'), el('div', 'hanter-lune'));
    T.decor(f);
    return f;
  }

  function lacher() {
    if (!troupe || document.visibilityState !== 'visible') return;
    if (troupe.children.length >= (logiciel ? 1 : 3)) return;
    var f = el('div', 'hanter-fantome', '<div>' + T.petit.svg + '</div>');
    f.style.setProperty('--t', (logiciel ? hasard(56, 80) : hasard(64, 130)) + 'px');
    if (!logiciel && Math.random() < .3) {
      f.classList.add('coucou'); // monte du bas de l'écran, dit bonjour et redescend
      f.style.setProperty('--x', hasard(5, 82) + 'vw');
      f.firstChild.appendChild(el('span', 'hanter-bulle', T.petit.coucou));
    } else {
      if (Math.random() < .5) f.classList.add('gauche');
      f.style.setProperty('--y', hasard(T.petit.hauteur[0], T.petit.hauteur[1]) + 'vh');
      f.style.setProperty('--d', (logiciel ? hasard(9, 13) : hasard(T.petit.duree[0], T.petit.duree[1])) + 's');
    }
    f.addEventListener('animationend', function (ev) { if (ev.target === f) f.remove(); });
    f.addEventListener('click', function () { faireFuir(f, true); });
    troupe.appendChild(f);
  }

  // parClic : attrapé par le visiteur (un point s'il est connecté), sinon renvoyé par « Chasser les … ».
  function faireFuir(f, parClic) {
    if (f.classList.contains('pouf')) return;
    var b = f.querySelector('.hanter-bulle');
    if (!b) f.firstChild.appendChild(b = el('span', 'hanter-bulle'));
    b.textContent = parClic ? compter() : T.petit.attrape;
    f.classList.add('pouf');
    setTimeout(function () { f.remove(); }, 600);
  }

  /* Points : un par personnage attrapé, envoyés un par un, au plus un toutes les 3 s (le serveur refuse plus rapide). */
  function jeton() { return lire(CLE_JETON); }
  function majPoints(n) {
    points = n;
    if (!puce) return;
    puce.hidden = !n;
    puce.textContent = T.petit.emoji + ' ' + pluriel(n, 'attrapé', 'attrapés');
  }
  function compter() {
    if (!jeton()) {
      if (!conseil) { conseil = true; dire('Connecte-toi (bouton 👤 du logiciel) pour compter tes ' + T.petit.des + ' et entrer dans le classement 🏆'); }
      return T.petit.attrape;
    }
    if (file < 3) file++;
    envoyer();
    return '+1 !';
  }
  function envoyer() {
    if (envoi || prevu || !file || !en) return;
    var attente = dernierEnvoi + 3000 - Date.now();
    if (attente > 0) {
      prevu = true;
      setTimeout(function () { prevu = false; envoyer(); }, attente);
      return;
    }
    envoi = true;
    dernierEnvoi = Date.now();
    file--;
    fetch(BASE + 'api/evenement/attrape', { method: 'POST', headers: { Authorization: 'Bearer ' + jeton() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) {
        if (!r || typeof r.points !== 'number') return;
        majPoints(r.points);
        if (r.badge) badgeGagne(r.badge);
        if (typeof r.total === 'number' && r.total > total) { total = r.total; majCollectif(); }
        if (!r.compte && file < 3) file++; // arrivé trop tôt (un autre onglet vient de compter) : il repart dans 3 s
      })
      .catch(function () { /* hors connexion : celui-ci ne compte pas */ })
      .then(function () { envoi = false; envoyer(); });
  }
  function chargerPoints() {
    var t = jeton();
    if (!t) return;
    fetch(BASE + 'api/evenement/classement', { cache: 'no-store', headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) { if (r && r.moi && en) majPoints(r.moi.points); })
      .catch(function () {});
  }

  function dire(texte) {
    if (toast) toast.remove();
    var t = toast = el('div', 'hanter-toast');
    t.setAttribute('role', 'status');
    t.textContent = texte;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); if (toast === t) toast = null; }, 6000);
  }

  // Nom et badges, toujours dans le même ordre. Les noms viennent des comptes : toujours en textContent.
  var BADGES = {
    verifie: ['✔', 'Vérifié par le site', 'hanter-verifie'],
    halloween: ['🎃', 'Badge Halloween', 'hanter-badge'],
    'participation-halloween': ['🧛', 'Participation à Halloween', 'hanter-badge'],
    noel: ['🎅', 'Badge Noël', 'hanter-badge'],
    'participation-noel': ['⛄', 'Participation à Noël', 'hanter-badge'],
  };
  // Couleurs du rond choisies par l'admin (FONDS_AVATAR, functions/api/admin/[action].js), teintes sombres de app/profil.css.
  var FONDS = { bleu: '#213a63', vert: '#1d4430', jaune: '#4d4117', orange: '#55331b', rouge: '#56242a', rose: '#522443', violet: '#3a2b5c', nuit: '#0f0e22' };
  function teinte(nom) { // même calcul que teinte() dans app/app.js : la même couleur que dans son logiciel
    var h = 7;
    Array.from(nom).forEach(function (c) { h = (h * 31 + c.codePointAt(0)) % 360; });
    return h;
  }
  // qui : { avatar, avatar_fond } d'un classement ; sans photo, l'initiale du nom sur un dégradé de sa teinte.
  function rondProfil(nom, qui) {
    var r = el('span', 'hanter-rond');
    r.setAttribute('aria-hidden', 'true');
    if (qui && qui.avatar) {
      r.textContent = qui.avatar;
      if (FONDS[qui.avatar_fond]) r.style.background = FONDS[qui.avatar_fond];
    } else {
      r.classList.add('initiale');
      r.style.setProperty('--teinte', teinte(nom || '?'));
      r.textContent = (Array.from(nom || '?')[0] || '?').toLocaleUpperCase('fr-FR');
    }
    return r;
  }
  function nomBadges(cible, nom, badges, qui) {
    cible.textContent = nom;
    if (qui) cible.prepend(rondProfil(nom, qui));
    Object.keys(BADGES).forEach(function (b) {
      if ((badges || []).indexOf(b) < 0) return;
      var s = el('span', BADGES[b][2]);
      s.textContent = BADGES[b][0];
      s.title = BADGES[b][1];
      cible.appendChild(s);
    });
    return cible;
  }
  function badgeGagne(b) {
    if (!BADGES[b]) return;
    dire(BADGES[b][0] + ' Badge « ' + BADGES[b][1] + ' » gagné ! Il est maintenant à côté de ton nom.');
    window.dispatchEvent(new CustomEvent('hanter:badges')); // le logiciel relit le compte
  }

  /* Classement, à la fin de l'événement. */
  function montrerClassement(fini) {
    if (classement || !fini) return;
    choisir(fini.nom);
    ecrire(CLE + 'classement', fini.depuis);
    classement = el('div', 'hanter-classement');
    classement.setAttribute('role', 'dialog');
    classement.setAttribute('aria-modal', 'true');
    classement.setAttribute('aria-label', "Classement de l'événement " + T.de);
    var carte = el('div'), titre = el('h2'), sous = el('p', 'sous'), liste = el('ol'), moi = el('p', 'moi-texte'), fermer = el('button');
    titre.textContent = '🏆 Classement';
    sous.textContent = 'Les meilleurs chasseurs de ' + T.petit.des + " de l'événement " + T.de;
    moi.textContent = 'Chargement…';
    fermer.type = 'button';
    fermer.textContent = 'Fermer';
    fermer.addEventListener('click', fermerClassement);
    classement.addEventListener('click', function (ev) { if (ev.target === classement) fermerClassement(); });
    carte.append(titre, sous, liste, moi, fermer);
    classement.appendChild(carte);
    document.body.appendChild(classement);
    fermer.focus();
    var t = jeton(), th = T;
    fetch(BASE + 'api/evenement/classement', { cache: 'no-store', headers: t ? { Authorization: 'Bearer ' + t } : {} })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        var top = r.top || [], MEDAILLES = ['🥇', '🥈', '🥉'];
        if (r.boss && r.boss.gagnant) {
          var g = el('p', 'gagnant');
          g.append(th.boss.titre.split(' ')[0] + ' ' + th.boss.Nom + ' ' + th.boss.vaincu + ' ! ' + th.boss.lePlus.charAt(0).toUpperCase() + th.boss.lePlus.slice(1) + ' : ',
            nomBadges(el('strong'), r.boss.gagnant.nom, r.boss.gagnant.badges, r.boss.gagnant));
          carte.insertBefore(g, liste);
        }
        top.forEach(function (j, i) {
          var li = el('li'), place = el('span', 'place'), nom = el('span', 'nom'), pts = el('span', 'pts');
          if (r.moi && r.moi.rang === i + 1) li.className = 'moi';
          place.textContent = MEDAILLES[i] || String(i + 1);
          nomBadges(nom, j.nom, j.badges, j);
          pts.textContent = j.points + ' ' + th.petit.emoji;
          li.append(place, nom, pts);
          liste.appendChild(li);
        });
        if (!top.length) { moi.textContent = "Personne n'a attrapé de " + th.petit.un + '… ' + th.petit.vide + ' ' + th.petit.emoji; return; }
        sous.textContent = pluriel(r.participants, 'chasseur', 'chasseurs') + ' de ' + th.petit.des + " pendant l'événement " + th.de;
        moi.textContent = !t || !r.moi ? 'Connecte-toi la prochaine fois pour entrer dans le classement !'
          : !r.moi.points ? "Tu n'as attrapé aucun " + th.petit.un + ' cette fois-ci.'
          : 'Toi : ' + pluriel(r.moi.points, th.petit.un, th.petit.des) + ', ' + (r.moi.rang === 1 ? '1er' : r.moi.rang + 'e')
            + ' sur ' + r.participants + (r.moi.rang <= 3 ? ' 🎉' : '');
      })
      .catch(function () { moi.textContent = "Le classement n'a pas pu être chargé."; });
  }
  function fermerClassement() {
    if (!classement) return;
    classement.remove();
    classement = null;
  }

  /* Le boss : apparaît chez tout le monde au même moment, ses PV suivent les clics de tous (/api/etat). */
  var bossDebout = function () { return !!(bossEtat && !bossEtat.vaincu); };
  var fmt = function (n) { return n.toLocaleString('fr-FR'); };

  function majBoss(b) {
    if (!en) return;
    if (b && bossEtat) b = Object.assign({}, bossEtat, b); // la réponse d'un clic n'a ni les chasseurs ni le gagnant
    bossEtat = b;
    if (!b) return;
    if (!b.vaincu) {
      if (!bossZone) apparaitreBoss();
      afficherPv();
    } else if (bossZone) vaincreBoss();
    else if (lire(CLE + 'boss') !== en.depuis) montrerVictoire();
  }

  function apparaitreBoss() {
    clearTimeout(minuteur); // les petits personnages laissent la place
    bossZone = el('div', 'hanter-boss-zone' + (calme() ? ' cache' : ''));
    barre = el('div', 'hanter-boss-barre'); // accrochée au boss : elle le suit et ne cache pas le haut de la page
    barre.setAttribute('role', 'status');
    barre.innerHTML = '<b></b><span class="jauge"><i></i></span><small></small>';
    barre.querySelector('b').textContent = T.boss.titre;
    bossEl = el('div', 'hanter-boss');
    bossEl.append(barre, el('div', 'corps', T.boss.svg));
    bossEl.querySelector('svg').addEventListener('click', frapper);
    bossZone.appendChild(bossEl);
    document.body.appendChild(bossZone);
    majCollectif();
    dire(jeton() ? T.boss.apparu : T.boss.apparu.replace(/ Tout le monde.*$/, ' Connecte-toi (bouton 👤 du logiciel) pour ' + T.boss.agir + ' avec les autres.'));
  }

  function afficherPv() {
    if (!barre || !bossEtat) return;
    barre.querySelector('i').style.width = (100 * bossEtat.pv / bossEtat.max) + '%';
    barre.querySelector('small').textContent = bossEtat.vaincu ? T.boss.vaincu.charAt(0).toUpperCase() + T.boss.vaincu.slice(1) + ' !'
      : fmt(bossEtat.pv) + ' / ' + fmt(bossEtat.max) + ' PV' + (bossEtat.chasseurs ? ' · ' + T.boss.emoji + ' ' + pluriel(bossEtat.chasseurs, 'chasseur', 'chasseurs') : '');
  }

  function frapper(ev) {
    if (!bossDebout()) return;
    if (!jeton()) { dire('Connecte-toi (bouton 👤 du logiciel) pour ' + T.boss.agir + ' avec les autres !'); return; }
    var maintenant = Date.now();
    if (maintenant < recharge) return;
    recharge = maintenant + 600; // le serveur ne compte pas plus d'un clic toutes les 0,5 s
    bossEl.classList.remove('touche');
    void bossEl.offsetWidth;
    bossEl.classList.add('touche');
    var degat = el('span', 'hanter-degat');
    degat.textContent = '-1 000';
    degat.style.left = ev.clientX + 'px';
    degat.style.top = ev.clientY + 'px';
    bossZone.appendChild(degat);
    setTimeout(function () { degat.remove(); }, 900);
    fetch(BASE + 'api/evenement/boss', { method: 'POST', headers: { Authorization: 'Bearer ' + jeton() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) {
        if (!r || !r.boss || !en) return;
        if (!r.compte) degat.classList.add('rate');
        if (r.badge) badgeGagne(r.badge);
        if (r.gagnant) r.boss.gagnant = r.gagnant;
        majBoss(r.boss);
      })
      .catch(function () { degat.classList.add('rate'); });
  }

  function vaincreBoss() {
    if (!bossZone || bossZone.classList.contains('vaincu')) return;
    var z = bossZone;
    afficherPv();
    z.classList.add('vaincu');
    if (T.nom === 'noel') {
      bossEl.appendChild(el('span', 'hanter-bulle', 'Ho ho ho !'));
      if (!reduit) pluieDeCadeaux();
    }
    setTimeout(function () {
      z.remove();
      if (bossZone === z) bossZone = bossEl = barre = null;
      if (!en) return;
      majCollectif();
      if (lire(CLE + 'boss') !== en.depuis) montrerVictoire();
      prochainFantome(true);
    }, 1600);
  }

  function pluieDeCadeaux() {
    var p = el('div', 'hanter-cadeaux');
    p.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 18; i++) {
      var c = el('span', 'hanter-cadeau', ['🎁', '🎁', '🍬', '⭐', '🧸'][i % 5]);
      c.style.setProperty('--x', hasard(5, 92) + 'vw');
      c.style.setProperty('--t', hasard(26, 48) + 'px');
      c.style.setProperty('--dx', hasard(-12, 12) + 'vw');
      c.style.setProperty('--a', hasard(-200, 200) + 'deg');
      c.style.setProperty('--d', hasard(2.2, 3.4) + 's');
      c.style.setProperty('--r', hasard(0, .9) + 's');
      p.appendChild(c);
    }
    document.body.appendChild(p);
    setTimeout(function () { p.remove(); }, 4600);
  }

  // Écran de victoire, une fois par événement : le gagnant et ses badges, les meilleurs chasseurs, mes clics.
  function montrerVictoire() {
    if (victoire || classement || !en) return;
    ecrire(CLE + 'boss', en.depuis);
    victoire = el('div', 'hanter-classement');
    victoire.setAttribute('role', 'dialog');
    victoire.setAttribute('aria-modal', 'true');
    victoire.setAttribute('aria-label', T.boss.Nom + ' est ' + T.boss.vaincu);
    var carte = el('div'), titre = el('h2'), sous = el('p', 'sous'), gagnant = el('p', 'gagnant'), liste = el('ol'), moi = el('p', 'moi-texte'), fermer = el('button');
    titre.textContent = T.boss.victoire;
    sous.textContent = T.boss.Nom + ' est ' + T.boss.vaincu + '.';
    gagnant.textContent = 'Chargement…';
    fermer.type = 'button';
    fermer.textContent = 'Fermer';
    fermer.addEventListener('click', fermerVictoire);
    victoire.addEventListener('click', function (ev) { if (ev.target === victoire) fermerVictoire(); });
    carte.append(titre, sous, gagnant, liste, moi, fermer);
    victoire.appendChild(carte);
    document.body.appendChild(victoire);
    fermer.focus();
    var t = jeton(), th = T;
    fetch(BASE + 'api/evenement/boss', { cache: 'no-store', headers: t ? { Authorization: 'Bearer ' + t } : {} })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        var b = r.boss || {}, top = r.top || [];
        if (b.chasseurs) sous.textContent = th.boss.Nom + ' est ' + th.boss.vaincu + ' par ' + pluriel(b.chasseurs, 'chasseur', 'chasseurs') + ' ensemble !';
        if (b.gagnant) {
          gagnant.textContent = '';
          gagnant.append('🏆 ', nomBadges(el('strong'), b.gagnant.nom, b.gagnant.badges, b.gagnant),
            ' ' + th.boss.plus + ' : vérifié par le site ✔ et ' + th.badge[2] + ' ' + th.badge[1] + ' !');
        } else gagnant.remove();
        top.forEach(function (j, i) {
          var li = el('li'), place = el('span', 'place'), nom = el('span', 'nom'), pts = el('span', 'pts');
          place.textContent = ['🥇', '🥈', '🥉'][i] || String(i + 1);
          nomBadges(nom, j.nom, j.badges, j);
          pts.textContent = pluriel(j.coups, th.boss.coup[0], th.boss.coup[1]);
          li.append(place, nom, pts);
          liste.appendChild(li);
        });
        moi.textContent = !t || !r.moi ? th.boss.connecte
          : r.moi.gagnant ? "🎉 C'est toi ! Ton compte est vérifié par le site et tu as le " + th.badge[2] + '.'
          : r.moi.coups ? 'Toi : ' + pluriel(r.moi.coups, th.boss.coupPorte[0], th.boss.coupPorte[1]) + '.'
          : th.boss.rien;
        if (r.moi && r.moi.gagnant) window.dispatchEvent(new CustomEvent('hanter:badges')); // le logiciel relit le compte
      })
      .catch(function () { gagnant.textContent = "Les résultats n'ont pas pu être chargés."; });
  }
  function fermerVictoire() {
    if (!victoire) return;
    victoire.remove();
    victoire = null;
  }

  // Un personnage de temps en temps : souvent sur les pages du site, rarement dans le logiciel (on y travaille).
  // Pas pendant le combat contre le boss.
  function prochainFantome(vite) {
    clearTimeout(minuteur);
    if (!en || reduit || calme() || intro || bossDebout()) return;
    var attente = vite ? 1200 : logiciel ? hasard(25000, 45000) : hasard(5000, 10000);
    minuteur = setTimeout(function () { lacher(); prochainFantome(false); }, attente);
  }

  function calme(v) {
    if (v === undefined) return lire(CLE + 'calme') === '1';
    ecrire(CLE + 'calme', v ? '1' : null);
    if (v && troupe) Array.prototype.slice.call(troupe.children).forEach(function (f) { faireFuir(f); });
    if (bossZone) bossZone.classList.toggle('cache', !!v);
    majBouton();
    prochainFantome(true);
    return v;
  }

  // « 👻 Chasser les fantômes », « 🧝 Rappeler les lutins »… (bouton du site, entrée de 🧰 Outils du logiciel).
  function libelleCalme() {
    return T ? T.petit.emoji + (calme() ? ' Rappeler les ' : ' Chasser les ') + T.petit.des : '';
  }
  function majBouton() {
    if (bouton) bouton.textContent = libelleCalme();
  }

  function montrerIntro() {
    if (intro || !en) return;
    clearTimeout(minuteur);
    intro = el('div', 'hanter-intro');
    intro.setAttribute('role', 'dialog');
    intro.setAttribute('aria-label', "Clip d'intro de l'événement " + T.de);
    var cadre = el('iframe');
    cadre.src = BASE + T.nom + '/?integre=1';
    cadre.title = "Clip d'intro de l'événement " + T.de;
    cadre.allow = 'autoplay';
    var passer = el('button', 'hanter-passer');
    passer.type = 'button';
    passer.textContent = 'Passer ⏭';
    passer.addEventListener('click', function () { fermerIntro(); });
    intro.append(cadre, passer);
    document.body.appendChild(intro);
    racine.style.overflow = 'hidden';
    requestAnimationFrame(function () { if (intro) intro.classList.add('visible'); });
    passer.focus();
  }

  function fermerIntro(sansSuite) {
    if (!intro) return;
    var x = intro;
    intro = null;
    racine.style.overflow = '';
    x.classList.remove('visible');
    setTimeout(function () { x.remove(); }, 600);
    if (en) ecrire(CLE + 'intro', en.depuis);
    if (!sansSuite) prochainFantome(true);
  }

  window.addEventListener('message', function (ev) {
    var cadre = intro && intro.querySelector('iframe');
    if (cadre && ev.source === cadre.contentWindow && ev.data && (ev.data.evenement === 'fin' || ev.data.halloween === 'fin')) fermerIntro();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (intro) fermerIntro();
    else if (victoire) fermerVictoire();
    else if (classement) fermerClassement();
  });

  // Bandeau de l'accueil (créé s'il n'y en a pas) : l'événement a commencé (progression vers le boss), le boss est
  // là, il est vaincu ; de quoi revoir le clip ; puis l'événement est terminé, avec de quoi voir le classement.
  function majCollectif() {
    if (!accueil() || !en) return;
    var b = T.boss;
    changerAnnonce(bossDebout() ? b.enCours
      : bossEtat && bossEtat.vaincu ? T.emoji + ' ' + b.Nom + ' est ' + b.vaincu + (bossEtat.gagnant ? ' (' + b.lePlus + ' : ' + (bossEtat.gagnant.avatar ? bossEtat.gagnant.avatar + ' ' : '') + bossEtat.gagnant.nom + ')' : '') + ' ! Les ' + T.petit.des + ' reviennent… '
      : T.emoji + " L'événement " + T.de + ' a commencé ! ' + T.petit.des.charAt(0).toUpperCase() + T.petit.des.slice(1) + ' attrapés par tous : '
        + Math.min(total, seuil) + ' / ' + seuil + ' avant ' + b.nom + '… ');
  }
  function paragrapheAnnonce() {
    var p = document.querySelector('.annonce p');
    if (p) return p;
    var main = document.querySelector('main');
    if (!main) return null;
    annonceCreee = el('aside', 'annonce');
    annonceCreee.setAttribute('aria-label', 'Annonce');
    annonceCreee.appendChild(p = el('p'));
    main.insertBefore(annonceCreee, main.firstChild);
    return p;
  }
  function changerAnnonce(texte) {
    var p = paragrapheAnnonce();
    if (!p) return;
    if (!annonce) annonce = Array.prototype.slice.call(p.childNodes).map(function (n) { return n.cloneNode(true); });
    var revoir = el('button', 'hanter-revoir');
    revoir.type = 'button';
    revoir.textContent = "▶ Revoir l'intro";
    revoir.addEventListener('click', montrerIntro);
    delete p.dataset.fini;
    p.replaceChildren(document.createTextNode(texte || T.emoji + " L'événement " + T.de + ' a commencé ! Attrape les ' + T.petit.des + '… '), revoir);
  }
  function annonceFini(fini) {
    var p = paragrapheAnnonce();
    if (!p || p.dataset.fini === fini.depuis) return;
    if (!annonce) annonce = Array.prototype.slice.call(p.childNodes).map(function (n) { return n.cloneNode(true); });
    var voir = el('button', 'hanter-revoir');
    voir.type = 'button';
    voir.textContent = '🏆 Voir le classement';
    voir.addEventListener('click', function () { montrerClassement(fini); });
    p.dataset.fini = fini.depuis;
    p.replaceChildren(document.createTextNode(T.emoji + " L'événement " + T.de + ' est terminé ! '), voir);
  }
  function remettreAnnonce() {
    if (annonceCreee) { annonceCreee.remove(); annonceCreee = null; annonce = null; return; }
    var p = document.querySelector('.annonce p');
    if (p && annonce) { p.replaceChildren.apply(p, annonce); delete p.dataset.fini; }
    annonce = null;
  }

  // L'accueil prend le thème de l'événement le temps de l'événement (Noël déclenché pendant le mode Halloween, par
  // exemple) : sa classe theme-… et sa feuille sont mises de côté, puis rendues à la fin.
  function preterTheme(nom) {
    if (!pageAccueil || racine.classList.contains('theme-' + nom)) return;
    var classes = Array.prototype.filter.call(racine.classList, function (c) { return /^theme-/.test(c); });
    var liens = Array.prototype.filter.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) { return /\/theme\.css$/.test(l.getAttribute('href') || ''); });
    var lien = el('link');
    lien.rel = 'stylesheet';
    lien.href = BASE + nom + '/theme.css';
    document.head.appendChild(lien);
    liens.forEach(function (l) { l.disabled = true; });
    classes.forEach(function (c) { racine.classList.remove(c); });
    racine.classList.add('theme-' + nom);
    themePrete = { nom: nom, classes: classes, liens: liens, lien: lien, noms: [] };
    // Le nom du site suit le thème prêté (« Boîtes à lutins » pour Noël) le temps de l'événement.
    var h1 = document.querySelector('h1');
    [[h1, 'textContent'], [document, 'title']].forEach(function (x) {
      if (!x[0] || !/Boîtes à (classer|hanter|lutins)/.test(x[0][x[1]])) return;
      themePrete.noms.push([x[0], x[1], x[0][x[1]]]);
      x[0][x[1]] = x[0][x[1]].replace(/Boîtes à (classer|hanter|lutins)/g, THEMES[nom].site);
    });
  }
  function rendreTheme() {
    if (!themePrete) return;
    racine.classList.remove('theme-' + themePrete.nom);
    themePrete.classes.forEach(function (c) { racine.classList.add(c); });
    themePrete.liens.forEach(function (l) { l.disabled = false; });
    themePrete.lien.remove();
    themePrete.noms.forEach(function (x) { x[0][x[1]] = x[2]; });
    themePrete = null;
  }

  // Appelée à chaque réponse de /api/etat : ne fait rien tant que c'est le même déclenchement.
  function demarrer(e) {
    if (!e || !e.nom) return;
    if (en && en.depuis === e.depuis) return;
    if (en) arreter();
    en = e;
    choisir(e.nom);
    preterTheme(e.nom);
    racine.classList.add('hanter-en-cours');
    if (accueil() && !reduit) document.body.appendChild(fond = creerFond());
    troupe = el('div', 'hanter-troupe');
    troupe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(troupe);
    if (!logiciel && !reduit) {
      bouton = el('button', 'hanter-bouton');
      bouton.type = 'button';
      bouton.addEventListener('click', function () { calme(!calme()); });
      document.body.appendChild(bouton);
      majBouton();
      puce = el('div', 'hanter-puce');
      puce.hidden = true;
      document.body.appendChild(puce);
    }
    chargerPoints();
    if (accueil()) changerAnnonce();
    if (accueil() && !reduit && lire(CLE + 'intro') !== e.depuis) montrerIntro();
    else prochainFantome(true);
  }

  function arreter() {
    if (!en) return;
    en = null;
    clearTimeout(minuteur);
    fermerIntro(true);
    [fond, troupe, bouton, puce, toast, bossZone].forEach(function (x) { if (x) x.remove(); });
    fond = troupe = bouton = puce = toast = bossZone = bossEl = barre = bossEtat = null;
    total = 0;
    fermerVictoire();
    points = null;
    file = 0;
    racine.classList.remove('hanter-en-cours');
    remettreAnnonce();
    rendreTheme();
  }

  // Appelée à chaque réponse de /api/etat : e = événement en cours, fini = dernier événement arrêté (ou null),
  // r = toute la réponse (boss, total des personnages attrapés, seuil du boss).
  function suivre(e, fini, r) {
    var avant = en;
    r = r || {};
    if (e) {
      demarrer(e);
      if (typeof r.seuil === 'number') seuil = r.seuil;
      if (typeof r.total === 'number') total = r.total;
      majBoss(r.boss || null);
      majCollectif();
      return;
    }
    if (avant) arreter();
    if (!fini) return;
    choisir(fini.nom);
    if (accueil()) annonceFini(fini);
    // Le classement s'ouvre une fois : sur les pages ouvertes à la fin de l'événement, et sur l'accueil à son thème.
    if (((avant && avant.depuis === fini.depuis) || accueil()) && lire(CLE + 'classement') !== fini.depuis) montrerClassement(fini);
  }

  window.hanter = {
    suivre: suivre,
    demarrer: demarrer,
    arreter: arreter,
    actif: function () { return !!en; },
    calme: calme,
    libelleCalme: libelleCalme,
    points: function () { return points; },
    intro: montrerIntro,
    classement: montrerClassement,
  };
})();
