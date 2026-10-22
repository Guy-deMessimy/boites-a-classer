// Événement d'Halloween (serveur/evenement.js), chargé par site/arret.js et app/app.js quand un admin l'a déclenché
// (page site/admin/) :
// - accueil (classe « theme-halloween » sur <html>) : le fond s'anime (étoiles, lune, chauves-souris, brume, éclairs,
//   citrouilles) et le clip d'intro (site/halloween/index.html) passe une fois par déclenchement ;
// - partout : des fantômes traversent la page ; sur les pages du site, un clic les fait fuir. « 👻 Chasser les
//   fantômes » les renvoie (choix gardé dans le navigateur ; dans le logiciel, l'entrée est dans 🧰 Outils).
// Si l'appareil demande moins d'animations : ni fond animé, ni fantômes, ni clip automatique.
(function () {
  'use strict';
  if (window.hanter) return;
  var BASE = ((document.currentScript && document.currentScript.src) || '/halloween/hanter.js').replace(/[^/]*$/, '');
  var CLE_CALME = 'boites-a-classer-halloween:calme';
  var CLE_INTRO = 'boites-a-classer-halloween:intro'; // date du déclenchement dont le clip a été vu
  var racine = document.documentElement;
  var accueil = racine.classList.contains('theme-halloween');
  var logiciel = /\/app\//.test(location.pathname);
  var reduit = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var en = null; // événement en cours : { nom, depuis }
  var fond = null, troupe = null, bouton = null, intro = null, minuteur = null, annonce = null;

  var FANTOME = '<svg viewBox="0 0 100 124" aria-hidden="true">'
    + '<path d="M50 4C24 4 10 24 10 50v62l13-11 13 11 14-11 14 11 13-11 13 11V50C90 24 76 4 50 4z" fill="#f8f5ff" stroke="#cdbff2" stroke-width="2"/>'
    + '<path d="M11 62q-9 4-8 14q6-1 9-6M89 62q9 4 8 14q-6-1-9-6" fill="#f8f5ff" stroke="#cdbff2" stroke-width="2"/>'
    + '<ellipse cx="36" cy="46" rx="7" ry="9" fill="#2a1840"/><ellipse cx="64" cy="46" rx="7" ry="9" fill="#2a1840"/>'
    + '<circle cx="38" cy="43" r="2.2" fill="#fff"/><circle cx="66" cy="43" r="2.2" fill="#fff"/>'
    + '<ellipse cx="50" cy="70" rx="7" ry="9" fill="#2a1840"/>'
    + '<ellipse cx="25" cy="60" rx="6" ry="3.5" fill="#ffb3cf" opacity=".8"/><ellipse cx="75" cy="60" rx="6" ry="3.5" fill="#ffb3cf" opacity=".8"/></svg>';
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
    '.hanter-troupe.attrapable svg{pointer-events:auto;cursor:pointer}',
    '.hanter-fantome.pouf>div{animation:hanter-pouf .55s ease-out forwards}',
    '.hanter-fantome.pouf .hanter-bulle{animation:none;opacity:1}',
    '@keyframes hanter-pouf{to{transform:scale(1.5) rotate(12deg);opacity:0}}',
    '.hanter-bouton{position:fixed;left:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483001;padding:.55rem .95rem;border:1px solid rgb(255 255 255 / .25);border-radius:999px;background:rgb(25 15 40 / .92);color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgb(0 0 0 / .4);cursor:pointer}',
    '.hanter-bouton:focus-visible,.hanter-passer:focus-visible,.hanter-revoir:focus-visible{outline:3px solid #ff8c1a;outline-offset:2px}',
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
    if (!logiciel) f.addEventListener('click', function () { faireFuir(f); });
    troupe.appendChild(f);
  }

  function faireFuir(f) {
    if (f.classList.contains('pouf')) return;
    if (!f.querySelector('.hanter-bulle')) f.firstChild.appendChild(el('span', 'hanter-bulle', 'Bouh !'));
    f.classList.add('pouf');
    setTimeout(function () { f.remove(); }, 600);
  }

  // Un fantôme de temps en temps : souvent sur les pages du site, rarement dans le logiciel (on y travaille).
  function prochainFantome(vite) {
    clearTimeout(minuteur);
    if (!en || reduit || calme() || intro) return;
    var attente = vite ? 1200 : logiciel ? hasard(25000, 45000) : hasard(5000, 10000);
    minuteur = setTimeout(function () { lacher(); prochainFantome(false); }, attente);
  }

  function calme(v) {
    if (v === undefined) return lire(CLE_CALME) === '1';
    ecrire(CLE_CALME, v ? '1' : null);
    if (v && troupe) Array.prototype.slice.call(troupe.children).forEach(faireFuir);
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
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && intro) fermerIntro(); });

  // Bandeau de l'accueil : « prochainement » devient « a commencé », avec de quoi revoir le clip.
  function changerAnnonce() {
    var p = document.querySelector('.annonce p');
    if (!p) return;
    if (!annonce) annonce = Array.prototype.slice.call(p.childNodes).map(function (n) { return n.cloneNode(true); });
    var revoir = el('button', 'hanter-revoir');
    revoir.type = 'button';
    revoir.textContent = "▶ Revoir l'intro";
    revoir.addEventListener('click', montrerIntro);
    p.replaceChildren(document.createTextNode("🎃 L'événement d'Halloween a commencé ! Les fantômes hantent le site… "), revoir);
  }
  function remettreAnnonce() {
    var p = document.querySelector('.annonce p');
    if (p && annonce) p.replaceChildren.apply(p, annonce);
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
    troupe = el('div', 'hanter-troupe' + (logiciel ? '' : ' attrapable'));
    troupe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(troupe);
    if (!logiciel && !reduit) {
      bouton = el('button', 'hanter-bouton');
      bouton.type = 'button';
      bouton.addEventListener('click', function () { calme(!calme()); });
      document.body.appendChild(bouton);
      majBouton();
    }
    if (accueil) changerAnnonce();
    if (accueil && !reduit && lire(CLE_INTRO) !== e.depuis) montrerIntro();
    else prochainFantome(true);
  }

  function arreter() {
    if (!en) return;
    en = null;
    clearTimeout(minuteur);
    fermerIntro(true);
    [fond, troupe, bouton].forEach(function (x) { if (x) x.remove(); });
    fond = troupe = bouton = null;
    racine.classList.remove('hanter-en-cours');
    remettreAnnonce();
  }

  window.hanter = {
    demarrer: demarrer,
    arreter: arreter,
    actif: function () { return !!en; },
    calme: calme,
    intro: montrerIntro,
  };
})();
