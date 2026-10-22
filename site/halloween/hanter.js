// Événement d'Halloween (serveur/evenement.js), chargé par site/arret.js et app/app.js quand un admin l'a déclenché
// (page site/admin/) :
// - accueil (classe « theme-halloween » sur <html>) : le fond s'anime (étoiles, lune, chauves-souris, brume, éclairs,
//   citrouilles) et le clip d'intro (site/halloween/index.html) passe une fois par déclenchement ;
// - partout : des fantômes traversent la page ; un clic les attrape, et chaque fantôme attrapé par un compte connecté
//   rapporte un point (functions/api/evenement/[action].js). « 👻 Chasser les fantômes » les renvoie (choix gardé
//   dans le navigateur ; dans le logiciel, l'entrée est dans 🧰 Outils) ;
// - quand tous ensemble ont attrapé 30 fantômes, le Roi des fantômes apparaît chez tout le monde : chaque coup (compte
//   connecté) lui retire 1 000 PV, la barre de PV suit les coups de tous ; celui qui a porté le plus de coups gagne
//   les badges « vérifié par le site » et « Halloween » (écran de victoire, une fois) ;
// - à la fin de l'événement : le classement, une fois, sur les pages ouvertes et sur l'accueil (puis avec le bandeau).
// Si l'appareil demande moins d'animations : ni fond animé, ni fantômes, ni clip automatique.
(function () {
  'use strict';
  if (window.hanter) return;
  var BASE = ((document.currentScript && document.currentScript.src) || '/halloween/hanter.js').replace(/[^/]*$/, '');
  var CLE_CALME = 'boites-a-classer-halloween:calme';
  var CLE_INTRO = 'boites-a-classer-halloween:intro'; // date du déclenchement dont le clip a été vu
  var CLE_CLASSEMENT = 'boites-a-classer-halloween:classement'; // date du déclenchement dont le classement a été vu
  var CLE_JETON = 'boites-a-classer-compte:jeton'; // session du compte (app/app.js)
  var RACINE = BASE.replace(/halloween\/$/, ''); // adresse du site
  var racine = document.documentElement;
  var accueil = racine.classList.contains('theme-halloween');
  var logiciel = /\/app\//.test(location.pathname);
  var reduit = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var en = null; // événement en cours : { nom, depuis }
  var fond = null, troupe = null, bouton = null, intro = null, minuteur = null, annonce = null;
  var puce = null, toast = null, classement = null;
  var CLE_BOSS = 'boites-a-classer-halloween:boss'; // date du déclenchement dont la victoire sur le boss a été vue
  var bossZone = null, bossEl = null, barre = null, bossEtat = null, recharge = 0, victoire = null, total = 0, seuil = 30;
  var points = null, file = 0, envoi = false, prevu = false, dernierEnvoi = 0, conseil = false;

  var FANTOME = '<svg viewBox="0 0 100 124" aria-hidden="true">'
    + '<path d="M50 4C24 4 10 24 10 50v62l13-11 13 11 14-11 14 11 13-11 13 11V50C90 24 76 4 50 4z" fill="#f8f5ff" stroke="#cdbff2" stroke-width="2"/>'
    + '<path d="M11 62q-9 4-8 14q6-1 9-6M89 62q9 4 8 14q-6-1-9-6" fill="#f8f5ff" stroke="#cdbff2" stroke-width="2"/>'
    + '<ellipse cx="36" cy="46" rx="7" ry="9" fill="#2a1840"/><ellipse cx="64" cy="46" rx="7" ry="9" fill="#2a1840"/>'
    + '<circle cx="38" cy="43" r="2.2" fill="#fff"/><circle cx="66" cy="43" r="2.2" fill="#fff"/>'
    + '<ellipse cx="50" cy="70" rx="7" ry="9" fill="#2a1840"/>'
    + '<ellipse cx="25" cy="60" rx="6" ry="3.5" fill="#ffb3cf" opacity=".8"/><ellipse cx="75" cy="60" rx="6" ry="3.5" fill="#ffb3cf" opacity=".8"/></svg>';
  var BOSS = '<svg viewBox="0 0 200 240" aria-hidden="true">'
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

  var STYLE = [
    '@font-face{font-family:"Creepster";font-display:swap;src:url(' + BASE + '../polices/creepster-latin.woff2) format("woff2")}',
    '.hanter-en-cours .panneau{-webkit-backdrop-filter:none;backdrop-filter:none}', // le flou suivrait chaque image du fond animé
    '.hanter-fond{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}',
    '.hanter-etoiles{position:absolute;inset:0 0 30% 0;animation:hanter-scintille 2.6s ease-in-out infinite alternate}',
    '.hanter-etoiles.b{animation-delay:-1.3s}',
    '@keyframes hanter-scintille{from{opacity:.2}to{opacity:1}}',
    '.hanter-lune{position:absolute;left:86%;top:11%;width:320px;height:320px;margin:-160px 0 0 -160px;border-radius:50%;background:radial-gradient(circle,rgb(255 236 170 / .45) 0 18%,rgb(255 220 140 / .14) 38%,transparent 68%);animation:hanter-lune 4.5s ease-in-out infinite alternate}',
    '@keyframes hanter-lune{from{transform:scale(.88);opacity:.55}to{transform:scale(1.12);opacity:1}}',
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
    '.hanter-troupe{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden}',
    '.hanter-fantome{position:absolute;left:0;top:var(--y);width:var(--t);animation:hanter-traverse var(--d) linear forwards;will-change:transform}',
    '.hanter-fantome.gauche{animation-name:hanter-traverse-g}',
    '@keyframes hanter-traverse{from{transform:translateX(-110%)}to{transform:translateX(calc(100vw + 10%))}}',
    '@keyframes hanter-traverse-g{from{transform:translateX(calc(100vw + 10%))}to{transform:translateX(-110%)}}',
    '.hanter-fantome>div{position:relative;animation:hanter-onde 2.3s ease-in-out infinite alternate}',
    '@keyframes hanter-onde{from{transform:translateY(-16px) rotate(-6deg)}to{transform:translateY(16px) rotate(6deg)}}',
    '.hanter-fantome svg{display:block;width:100%;opacity:.92;filter:drop-shadow(0 0 14px rgb(225 215 255 / .65))}',
    '.hanter-fantome.gauche svg{transform:scaleX(-1)}',
    '.hanter-fantome.coucou{top:auto;bottom:0;left:var(--x);animation:hanter-coucou 5s ease-in-out forwards}',
    '.hanter-fantome.coucou>div{animation-duration:1.2s}',
    '@keyframes hanter-coucou{0%{transform:translateY(110%)}25%,70%{transform:translateY(22%)}100%{transform:translateY(110%)}}',
    '.hanter-bulle{position:absolute;bottom:100%;left:50%;margin-bottom:6px;padding:.2em .6em;border-radius:1em;background:#fff;color:#2a1840;font:22px/1.2 "Creepster",fantasy,system-ui;letter-spacing:.04em;white-space:nowrap;transform:translateX(-50%);box-shadow:0 3px 10px rgb(0 0 0 / .35);opacity:0}',
    '.coucou .hanter-bulle{animation:hanter-bulle 5s forwards}',
    '@keyframes hanter-bulle{0%,32%{opacity:0}38%,64%{opacity:1}70%,100%{opacity:0}}',
    '.hanter-troupe svg{pointer-events:auto;cursor:pointer}',
    '.hanter-fantome.pouf>div{animation:hanter-pouf .55s ease-out forwards}',
    '.hanter-fantome.pouf .hanter-bulle{animation:none;opacity:1}',
    '@keyframes hanter-pouf{to{transform:scale(1.5) rotate(12deg);opacity:0}}',
    '.hanter-bouton{position:fixed;left:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483001;padding:.55rem .95rem;border:1px solid rgb(255 255 255 / .25);border-radius:999px;background:rgb(25 15 40 / .92);color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgb(0 0 0 / .4);cursor:pointer}',
    '.hanter-bouton:focus-visible,.hanter-passer:focus-visible,.hanter-revoir:focus-visible{outline:3px solid #ff8c1a;outline-offset:2px}',
    '.hanter-puce{position:fixed;left:12px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 48px);z-index:2147483001;padding:.35rem .85rem;border-radius:999px;background:#ff8c1a;color:#1b0f02;font:700 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgb(0 0 0 / .4)}',
    '.hanter-puce[hidden]{display:none}',
    '.hanter-toast{position:fixed;left:50%;bottom:96px;z-index:2147483500;width:max-content;max-width:min(92vw,440px);padding:.75rem 1.1rem;border-radius:14px;background:rgb(25 15 40 / .96);color:#fff;font:600 15px/1.4 system-ui,sans-serif;text-align:center;transform:translateX(-50%);box-shadow:0 6px 20px rgb(0 0 0 / .45)}',
    '.hanter-classement{position:fixed;inset:0;z-index:2147483550;display:grid;place-items:center;padding:16px;background:rgb(8 4 16 / .8)}',
    '.hanter-classement>div{width:min(100%,460px);max-height:calc(100vh - 32px);overflow:auto;padding:22px 20px 18px;border:1px solid #46325f;border-radius:22px;background:linear-gradient(180deg,#22123a,#140b24);color:#f4eefc;font:16px/1.45 "Space Grotesk",system-ui,sans-serif;box-shadow:0 12px 40px rgb(0 0 0 / .6)}',
    '.hanter-classement h2{margin:0 0 4px;font:400 32px/1.1 "Creepster",fantasy,system-ui;letter-spacing:.04em;color:#ff9a2e;text-align:center;text-shadow:0 0 14px rgb(255 120 0 / .45)}',
    '.hanter-classement .sous{margin:0 0 14px;color:#cbbfdf;font-size:14px;text-align:center}',
    '.hanter-classement ol{margin:0;padding:0;list-style:none}',
    '.hanter-classement li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px}',
    '.hanter-classement li:nth-child(-n+3){background:rgb(255 140 26 / .13);font-weight:700}',
    '.hanter-classement li.moi{outline:2px solid #b98cff}',
    '.hanter-classement .place{width:2em;font-size:20px;text-align:center}',
    '.hanter-classement .nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.hanter-classement .pts{font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.hanter-classement .moi-texte{margin:14px 0 0;color:#ffd2a1;text-align:center}',
    '.hanter-classement button{display:block;margin:16px auto 0;padding:.55rem 1.4rem;border:0;border-radius:999px;background:#ff8c1a;color:#1b0f02;font:700 16px/1.2 system-ui,sans-serif;cursor:pointer}',
    '.hanter-classement button:focus-visible{outline:3px solid #fff;outline-offset:2px}',
    '.hanter-verifie{display:inline-grid;place-items:center;width:1.1em;height:1.1em;margin-left:.3em;border-radius:50%;background:#1d9bf0;color:#fff;font:900 .7em/1 system-ui,sans-serif;vertical-align:.1em}',
    '.hanter-badge{margin-left:.25em}',
    '.hanter-boss-zone{position:fixed;inset:0;z-index:2147483100;pointer-events:none;overflow:hidden}',
    '.hanter-boss-zone.cache{display:none}',
    '.hanter-boss-barre{position:relative;left:50%;width:max(100%,250px);margin-bottom:8px;padding:6px 12px 8px;border:1px solid #6d52a0;border-radius:14px;background:rgb(20 10 34 / .93);color:#fff;font:600 13px/1.3 system-ui,sans-serif;text-align:center;transform:translateX(-50%);box-shadow:0 6px 22px rgb(0 0 0 / .5)}',
    '.hanter-boss-barre b{display:block;color:#c58bff;font:400 21px/1.1 "Creepster",fantasy,system-ui;letter-spacing:.05em}',
    '.hanter-boss-barre .jauge{display:block;height:14px;margin:6px 0 5px;border-radius:99px;background:rgb(255 255 255 / .15);overflow:hidden}',
    '.hanter-boss-barre .jauge i{display:block;width:100%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff4d4d,#ff8c1a,#7bd88f);transition:width .4s}',
    '.hanter-boss{position:absolute;left:50%;top:56%;width:min(44vw,44vh,320px);transform:translate(-50%,-50%);animation:hanter-boss-derive 14s ease-in-out infinite alternate}',
    '.hanter-boss .corps{animation:hanter-onde 2.6s ease-in-out infinite alternate}',
    '.hanter-boss svg{display:block;width:100%;pointer-events:auto;cursor:crosshair;filter:drop-shadow(0 0 28px rgb(190 120 255 / .85))}',
    '.hanter-boss.touche svg{animation:hanter-touche .25s}',
    '@keyframes hanter-touche{35%{transform:scale(.93) rotate(-4deg);filter:drop-shadow(0 0 28px rgb(255 70 70 / .95)) brightness(1.35)}}',
    '@keyframes hanter-boss-derive{0%{transform:translate(-85%,-60%)}33%{transform:translate(-20%,-42%)}66%{transform:translate(-70%,-35%)}100%{transform:translate(-25%,-62%)}}',
    '.hanter-degat{position:absolute;color:#ff5d5d;font:400 30px/1 "Creepster",fantasy,system-ui;text-shadow:0 2px 0 #3a0000,0 0 10px rgb(255 0 0 / .6);pointer-events:none;transform:translate(-50%,-50%);animation:hanter-degat .9s ease-out forwards}',
    '.hanter-degat.rate{color:#bbb;text-decoration:line-through}',
    '@keyframes hanter-degat{to{transform:translate(-50%,-170%);opacity:0}}',
    '.hanter-boss-zone.vaincu .hanter-boss{animation:hanter-boss-fin 1.5s ease-in forwards}',
    '.hanter-boss-zone.vaincu .hanter-boss svg{pointer-events:none}',
    '@keyframes hanter-boss-fin{to{transform:translate(-50%,-50%) scale(1.8) rotate(25deg);opacity:0;filter:brightness(3) blur(4px)}}',
    '.hanter-classement .gagnant{margin:0 0 12px;padding:10px 12px;border-radius:14px;background:rgb(255 211 77 / .14);color:#ffe7a3;text-align:center}',
    '@media (prefers-reduced-motion:reduce){.hanter-boss,.hanter-boss .corps{animation:none}}',
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

  function styler() {
    if (document.getElementById('hanter-style')) return;
    var s = el('style');
    s.id = 'hanter-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
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

  // Fond animé de l'accueil, par-dessus le fond fixe du thème (theme.css) et derrière le contenu.
  function creerFond() {
    var f = el('div', 'hanter-fond');
    f.setAttribute('aria-hidden', 'true');
    f.append(etoiles('hanter-etoiles'), etoiles('hanter-etoiles b'), el('div', 'hanter-lune'));
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
    return f;
  }

  function lacher() {
    if (!troupe || document.visibilityState !== 'visible') return;
    if (troupe.children.length >= (logiciel ? 1 : 3)) return;
    var f = el('div', 'hanter-fantome', '<div>' + FANTOME + '</div>');
    f.style.setProperty('--t', (logiciel ? hasard(56, 80) : hasard(64, 130)) + 'px');
    if (!logiciel && Math.random() < .3) {
      f.classList.add('coucou'); // monte du bas de l'écran, dit « Bouh ! » et redescend
      f.style.setProperty('--x', hasard(5, 82) + 'vw');
      f.firstChild.appendChild(el('span', 'hanter-bulle', 'Bouh !'));
    } else {
      if (Math.random() < .5) f.classList.add('gauche');
      f.style.setProperty('--y', hasard(8, 68) + 'vh');
      f.style.setProperty('--d', (logiciel ? hasard(9, 13) : hasard(10, 18)) + 's');
    }
    f.addEventListener('animationend', function (ev) { if (ev.target === f) f.remove(); });
    f.addEventListener('click', function () { faireFuir(f, true); });
    troupe.appendChild(f);
  }

  // parClic : attrapé par le visiteur (un point s'il est connecté), sinon renvoyé par « Chasser les fantômes ».
  function faireFuir(f, parClic) {
    if (f.classList.contains('pouf')) return;
    var b = f.querySelector('.hanter-bulle');
    if (!b) f.firstChild.appendChild(b = el('span', 'hanter-bulle'));
    b.textContent = parClic ? compter() : 'Bouh !';
    f.classList.add('pouf');
    setTimeout(function () { f.remove(); }, 600);
  }

  /* Points : un par fantôme attrapé, envoyés un par un, au plus un toutes les 3 s (le serveur refuse plus rapide). */
  function jeton() { return lire(CLE_JETON); }
  function pluriel(n, un, plusieurs) { return n + ' ' + (n > 1 ? plusieurs : un); }
  function majPoints(n) {
    points = n;
    if (!puce) return;
    puce.hidden = !n;
    puce.textContent = '👻 ' + pluriel(n, 'attrapé', 'attrapés');
  }
  function compter() {
    if (!jeton()) {
      if (!conseil) { conseil = true; dire('Connecte-toi (bouton 👤 du logiciel) pour compter tes fantômes et entrer dans le classement 🏆'); }
      return 'Bouh !';
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
    fetch(RACINE + 'api/evenement/attrape', { method: 'POST', headers: { Authorization: 'Bearer ' + jeton() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) {
        if (!r || typeof r.points !== 'number') return;
        majPoints(r.points);
        if (r.badge) badgeGagne(r.badge);
        if (typeof r.total === 'number' && r.total > total) { total = r.total; majCollectif(); }
        if (!r.compte && file < 3) file++; // arrivé trop tôt (un autre onglet vient de compter) : il repart dans 3 s
      })
      .catch(function () { /* hors connexion : ce fantôme ne compte pas */ })
      .then(function () { envoi = false; envoyer(); });
  }
  function chargerPoints() {
    var t = jeton();
    if (!t) return;
    fetch(RACINE + 'api/evenement/classement', { cache: 'no-store', headers: { Authorization: 'Bearer ' + t } })
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

  // Nom et badges (« vérifié par le site » ✔, « Halloween » 🎃, participation 🧛). Les noms viennent des comptes :
  // toujours en textContent.
  var BADGES = { verifie: ['✔', 'Vérifié par le site', 'hanter-verifie'], halloween: ['🎃', 'Badge Halloween', 'hanter-badge'],
    'participation-halloween': ['🧛', 'Participation Halloween', 'hanter-badge'] };
  function nomBadges(cible, nom, badges) {
    cible.textContent = nom;
    Object.keys(BADGES).forEach(function (b) { // toujours dans le même ordre : ✔, 🎃, 🧛
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
    ecrire(CLE_CLASSEMENT, fini.depuis);
    styler();
    classement = el('div', 'hanter-classement');
    classement.setAttribute('role', 'dialog');
    classement.setAttribute('aria-modal', 'true');
    classement.setAttribute('aria-label', "Classement de l'événement d'Halloween");
    var carte = el('div'), titre = el('h2'), sous = el('p', 'sous'), liste = el('ol'), moi = el('p', 'moi-texte'), fermer = el('button');
    titre.textContent = '🏆 Classement';
    sous.textContent = "Les meilleurs chasseurs de fantômes de l'événement d'Halloween";
    moi.textContent = 'Chargement…';
    fermer.type = 'button';
    fermer.textContent = 'Fermer';
    fermer.addEventListener('click', fermerClassement);
    classement.addEventListener('click', function (ev) { if (ev.target === classement) fermerClassement(); });
    carte.append(titre, sous, liste, moi, fermer);
    classement.appendChild(carte);
    document.body.appendChild(classement);
    fermer.focus();
    var t = jeton();
    fetch(RACINE + 'api/evenement/classement', { cache: 'no-store', headers: t ? { Authorization: 'Bearer ' + t } : {} })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        var top = r.top || [], MEDAILLES = ['🥇', '🥈', '🥉'];
        if (r.boss && r.boss.gagnant) {
          var g = el('p', 'gagnant');
          g.append('👑 Roi des fantômes vaincu ! Le plus de coups : ', nomBadges(el('strong'), r.boss.gagnant.nom, r.boss.gagnant.badges));
          carte.insertBefore(g, liste);
        }
        top.forEach(function (j, i) {
          var li = el('li'), place = el('span', 'place'), nom = el('span', 'nom'), pts = el('span', 'pts');
          if (r.moi && r.moi.rang === i + 1) li.className = 'moi';
          place.textContent = MEDAILLES[i] || String(i + 1);
          nomBadges(nom, j.nom, j.badges);
          pts.textContent = j.points + ' 👻';
          li.append(place, nom, pts);
          liste.appendChild(li);
        });
        if (!top.length) { moi.textContent = "Personne n'a attrapé de fantôme… Ils courent toujours ! 👻"; return; }
        sous.textContent = pluriel(r.participants, 'chasseur', 'chasseurs') + " de fantômes pendant l'événement d'Halloween";
        moi.textContent = !t || !r.moi ? 'Connecte-toi la prochaine fois pour entrer dans le classement !'
          : !r.moi.points ? "Tu n'as attrapé aucun fantôme cette fois-ci."
          : 'Toi : ' + pluriel(r.moi.points, 'fantôme', 'fantômes') + ', ' + (r.moi.rang === 1 ? '1er' : r.moi.rang + 'e')
            + ' sur ' + r.participants + (r.moi.rang <= 3 ? ' 🎉' : '');
      })
      .catch(function () { moi.textContent = "Le classement n'a pas pu être chargé."; });
  }
  function fermerClassement() {
    if (!classement) return;
    classement.remove();
    classement = null;
  }

  /* Le Roi des fantômes : apparaît chez tout le monde au même moment, ses PV suivent les coups de tous (/api/etat). */
  var bossDebout = function () { return !!(bossEtat && !bossEtat.vaincu); };
  var fmt = function (n) { return n.toLocaleString('fr-FR'); };

  function majBoss(b) {
    if (!en) return;
    if (b && bossEtat) b = Object.assign({}, bossEtat, b); // la réponse d'un coup n'a ni les chasseurs ni le gagnant
    bossEtat = b;
    if (!b) return;
    if (!b.vaincu) {
      if (!bossZone) apparaitreBoss();
      afficherPv();
    } else if (bossZone) vaincreBoss();
    else if (lire(CLE_BOSS) !== en.depuis) montrerVictoire();
  }

  function apparaitreBoss() {
    styler();
    clearTimeout(minuteur); // les petits fantômes laissent la place
    bossZone = el('div', 'hanter-boss-zone' + (calme() ? ' cache' : ''));
    barre = el('div', 'hanter-boss-barre'); // accrochée au boss : elle le suit et ne cache pas le haut de la page
    barre.setAttribute('role', 'status');
    barre.innerHTML = '<b>👑 Le Roi des fantômes</b><span class="jauge"><i></i></span><small></small>';
    bossEl = el('div', 'hanter-boss');
    bossEl.append(barre, el('div', 'corps', BOSS));
    bossEl.querySelector('svg').addEventListener('click', frapper);
    bossZone.appendChild(bossEl);
    document.body.appendChild(bossZone);
    majCollectif();
    dire(jeton() ? "👑 Le Roi des fantômes est apparu ! Tout le monde à l'attaque : clique dessus !"
      : "👑 Le Roi des fantômes est apparu ! Connecte-toi (bouton 👤 du logiciel) pour l'attaquer avec les autres.");
  }

  function afficherPv() {
    if (!barre || !bossEtat) return;
    barre.querySelector('i').style.width = (100 * bossEtat.pv / bossEtat.max) + '%';
    barre.querySelector('small').textContent = bossEtat.vaincu ? 'Vaincu !'
      : fmt(bossEtat.pv) + ' / ' + fmt(bossEtat.max) + ' PV' + (bossEtat.chasseurs ? ' · ⚔️ ' + pluriel(bossEtat.chasseurs, 'chasseur', 'chasseurs') : '');
  }

  function frapper(ev) {
    if (!bossDebout()) return;
    if (!jeton()) { dire("Connecte-toi (bouton 👤 du logiciel) pour attaquer le Roi des fantômes avec les autres !"); return; }
    var maintenant = Date.now();
    if (maintenant < recharge) return;
    recharge = maintenant + 600; // le serveur ne compte pas plus d'un coup toutes les 0,5 s
    bossEl.classList.remove('touche');
    void bossEl.offsetWidth;
    bossEl.classList.add('touche');
    var degat = el('span', 'hanter-degat');
    degat.textContent = '-1 000';
    degat.style.left = ev.clientX + 'px';
    degat.style.top = ev.clientY + 'px';
    bossZone.appendChild(degat);
    setTimeout(function () { degat.remove(); }, 900);
    fetch(RACINE + 'api/evenement/boss', { method: 'POST', headers: { Authorization: 'Bearer ' + jeton() } })
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
    setTimeout(function () {
      z.remove();
      if (bossZone === z) bossZone = bossEl = barre = null;
      if (!en) return;
      majCollectif();
      if (lire(CLE_BOSS) !== en.depuis) montrerVictoire();
      prochainFantome(true);
    }, 1600);
  }

  // Écran de victoire, une fois par événement : le gagnant et ses badges, les meilleurs chasseurs, mes coups.
  function montrerVictoire() {
    if (victoire || classement || !en) return;
    ecrire(CLE_BOSS, en.depuis);
    styler();
    victoire = el('div', 'hanter-classement');
    victoire.setAttribute('role', 'dialog');
    victoire.setAttribute('aria-modal', 'true');
    victoire.setAttribute('aria-label', 'Le Roi des fantômes est vaincu');
    var carte = el('div'), titre = el('h2'), sous = el('p', 'sous'), gagnant = el('p', 'gagnant'), liste = el('ol'), moi = el('p', 'moi-texte'), fermer = el('button');
    titre.textContent = '👑 Victoire !';
    sous.textContent = 'Le Roi des fantômes est vaincu.';
    gagnant.textContent = 'Chargement…';
    fermer.type = 'button';
    fermer.textContent = 'Fermer';
    fermer.addEventListener('click', fermerVictoire);
    victoire.addEventListener('click', function (ev) { if (ev.target === victoire) fermerVictoire(); });
    carte.append(titre, sous, gagnant, liste, moi, fermer);
    victoire.appendChild(carte);
    document.body.appendChild(victoire);
    fermer.focus();
    var t = jeton();
    fetch(RACINE + 'api/evenement/boss', { cache: 'no-store', headers: t ? { Authorization: 'Bearer ' + t } : {} })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        var b = r.boss || {}, top = r.top || [];
        if (b.chasseurs) sous.textContent = 'Le Roi des fantômes est vaincu par ' + pluriel(b.chasseurs, 'chasseur', 'chasseurs') + ' ensemble !';
        if (b.gagnant) {
          gagnant.textContent = '';
          gagnant.append('🏆 ', nomBadges(el('strong'), b.gagnant.nom, b.gagnant.badges),
            ' a porté le plus de coups : vérifié par le site ✔ et badge Halloween 🎃 !');
        } else gagnant.remove();
        top.forEach(function (j, i) {
          var li = el('li'), place = el('span', 'place'), nom = el('span', 'nom'), pts = el('span', 'pts');
          place.textContent = ['🥇', '🥈', '🥉'][i] || String(i + 1);
          nomBadges(nom, j.nom, j.badges);
          pts.textContent = pluriel(j.coups, 'coup', 'coups');
          li.append(place, nom, pts);
          liste.appendChild(li);
        });
        moi.textContent = !t || !r.moi ? 'Connecte-toi la prochaine fois pour combattre le boss !'
          : r.moi.gagnant ? "🎉 C'est toi ! Ton compte est vérifié par le site et tu as le badge Halloween."
          : r.moi.coups ? 'Toi : ' + pluriel(r.moi.coups, 'coup porté', 'coups portés') + '.'
          : "Tu n'as pas combattu le boss cette fois-ci.";
        if (r.moi && r.moi.gagnant) window.dispatchEvent(new CustomEvent('hanter:badges')); // le logiciel relit le compte
      })
      .catch(function () { gagnant.textContent = "Les résultats n'ont pas pu être chargés."; });
  }
  function fermerVictoire() {
    if (!victoire) return;
    victoire.remove();
    victoire = null;
  }

  // Un fantôme de temps en temps : souvent sur les pages du site, rarement dans le logiciel (on y travaille).
  // Pas pendant le combat contre le boss.
  function prochainFantome(vite) {
    clearTimeout(minuteur);
    if (!en || reduit || calme() || intro || bossDebout()) return;
    var attente = vite ? 1200 : logiciel ? hasard(25000, 45000) : hasard(5000, 10000);
    minuteur = setTimeout(function () { lacher(); prochainFantome(false); }, attente);
  }

  function calme(v) {
    if (v === undefined) return lire(CLE_CALME) === '1';
    ecrire(CLE_CALME, v ? '1' : null);
    if (v && troupe) Array.prototype.slice.call(troupe.children).forEach(faireFuir);
    if (bossZone) bossZone.classList.toggle('cache', !!v);
    majBouton();
    prochainFantome(true);
    return v;
  }

  function majBouton() {
    if (bouton) bouton.textContent = calme() ? '👻 Rappeler les fantômes' : '👻 Chasser les fantômes';
  }

  function montrerIntro() {
    if (intro || !en) return;
    clearTimeout(minuteur);
    intro = el('div', 'hanter-intro');
    intro.setAttribute('role', 'dialog');
    intro.setAttribute('aria-label', "Clip d'intro de l'événement d'Halloween");
    var cadre = el('iframe');
    cadre.src = BASE + '?integre=1';
    cadre.title = "Clip d'intro de l'événement d'Halloween";
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
    if (en) ecrire(CLE_INTRO, en.depuis);
    if (!sansSuite) prochainFantome(true);
  }

  window.addEventListener('message', function (ev) {
    var cadre = intro && intro.querySelector('iframe');
    if (cadre && ev.source === cadre.contentWindow && ev.data && ev.data.halloween === 'fin') fermerIntro();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (intro) fermerIntro();
    else if (victoire) fermerVictoire();
    else if (classement) fermerClassement();
  });

  // Bandeau de l'accueil : « prochainement » devient « a commencé » (avec la progression vers le boss), avec de quoi
  // revoir le clip.
  function majCollectif() {
    if (!accueil || !en) return;
    changerAnnonce(bossDebout() ? "👑 Le Roi des fantômes est là : tout le monde à l'attaque ! "
      : bossEtat && bossEtat.vaincu ? '🎃 Le Roi des fantômes est vaincu' + (bossEtat.gagnant ? ' (le plus de coups : ' + bossEtat.gagnant.nom + ')' : '') + ' ! Les fantômes reviennent… '
      : "🎃 L'événement d'Halloween a commencé ! Fantômes attrapés par tous : " + Math.min(total, seuil) + ' / ' + seuil + ' avant le boss… ');
  }
  function changerAnnonce(texte) {
    var p = document.querySelector('.annonce p');
    if (!p) return;
    if (!annonce) annonce = Array.prototype.slice.call(p.childNodes).map(function (n) { return n.cloneNode(true); });
    var revoir = el('button', 'hanter-revoir');
    revoir.type = 'button';
    revoir.textContent = "▶ Revoir l'intro";
    revoir.addEventListener('click', montrerIntro);
    delete p.dataset.fini;
    p.replaceChildren(document.createTextNode(texte || "🎃 L'événement d'Halloween a commencé ! Attrape les fantômes… "), revoir);
  }
  function annonceFini(fini) {
    var p = document.querySelector('.annonce p');
    if (!p || p.dataset.fini === fini.depuis) return;
    if (!annonce) annonce = Array.prototype.slice.call(p.childNodes).map(function (n) { return n.cloneNode(true); });
    styler();
    var voir = el('button', 'hanter-revoir');
    voir.type = 'button';
    voir.textContent = '🏆 Voir le classement';
    voir.addEventListener('click', function () { montrerClassement(fini); });
    p.dataset.fini = fini.depuis;
    p.replaceChildren(document.createTextNode("🎃 L'événement d'Halloween est terminé ! "), voir);
  }
  function remettreAnnonce() {
    var p = document.querySelector('.annonce p');
    if (p && annonce) { p.replaceChildren.apply(p, annonce); delete p.dataset.fini; }
    annonce = null;
  }

  // Appelée à chaque réponse de /api/etat (toutes les 20 s) : ne fait rien tant que c'est le même déclenchement.
  function demarrer(e) {
    if (!e || !e.nom) return;
    if (en && en.depuis === e.depuis) return;
    if (en) arreter();
    en = e;
    styler();
    racine.classList.add('hanter-en-cours');
    if (accueil && !reduit) document.body.appendChild(fond = creerFond());
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
    if (accueil) changerAnnonce();
    if (accueil && !reduit && lire(CLE_INTRO) !== e.depuis) montrerIntro();
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
  }

  // Appelée à chaque réponse de /api/etat : e = événement en cours, fini = dernier événement arrêté (ou null),
  // r = toute la réponse (boss, total des fantômes attrapés, seuil du boss).
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
    if (accueil) annonceFini(fini);
    // Le classement s'ouvre une fois : sur les pages ouvertes à la fin de l'événement, et sur l'accueil.
    if (((avant && avant.depuis === fini.depuis) || accueil) && lire(CLE_CLASSEMENT) !== fini.depuis) montrerClassement(fini);
  }

  window.hanter = {
    suivre: suivre,
    demarrer: demarrer,
    arreter: arreter,
    actif: function () { return !!en; },
    calme: calme,
    points: function () { return points; },
    intro: montrerIntro,
    classement: montrerClassement,
  };
})();
