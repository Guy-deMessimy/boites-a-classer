// Révélation de la 4.1 : à la première visite après la mise à jour (accueil site/index.html et logiciel app/index.html),
// une animation plein écran (une boîte géante tremble, s'ouvre, et « 4.1 » en sort), une seule fois par navigateur (clé
// CLE), passable (bouton « Passer », Échap). Elle peut enchaîner sur la bande-annonce (site/lancement/, ?auto=1).
// « Moins d'animations » (réglage de l'appareil, ou celui du logiciel) : une simple carte, sans mouvement.
// Rien dans l'application de bureau (site/lancement/ n'existe que sur le site), ni dans un cadre, ni au tout premier
// lancement du logiciel (son tutoriel passe d'abord). Pour la revoir : ajouter #revelation à l'adresse.
// window.boitesRevelation.bandeAnnonce() ouvre la bande-annonce en plein écran (bouton de l'accueil).
(function () {
  'use strict';
  var CLE = 'boites-a-classer-revelation:4.1';
  var ICI = (document.currentScript && document.currentScript.src) || location.href;
  var LANCEMENT = new URL('../lancement/', ICI).href;
  var lire = function (c) { try { return localStorage.getItem(c); } catch (e) { return null; } };
  var bureau = typeof window.NL_OS !== 'undefined' || location.protocol === 'file:' || location.port === '47821';
  var logiciel = /\/app\//.test(location.pathname);
  function calme() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    try { return !!JSON.parse(lire('boites-a-classer:reglage:acces')).calme; } catch (e) { return false; }
  }

  var STYLE = [
    '.rev{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;color:#fff;font-family:"Space Grotesk",system-ui,sans-serif;background:radial-gradient(circle at 50% 42%,#1d3270 0%,#0a1024 62%,#04060f 100%);animation:rev-entree .45s ease-out both}',
    '.rev *{box-sizing:border-box}',
    '.rev-rayons{position:absolute;left:50%;top:42%;width:170vmax;height:170vmax;margin:-85vmax 0 0 -85vmax;border-radius:50%;background:repeating-conic-gradient(rgb(255 214 90 / .16) 0 9deg,transparent 9deg 22deg);-webkit-mask:radial-gradient(circle,#000 0 18%,transparent 62%);mask:radial-gradient(circle,#000 0 18%,transparent 62%);opacity:0;animation:rev-rayons-on .8s 1.75s ease-out forwards,rev-tourne 40s linear infinite}',
    '.rev-halo{position:absolute;left:50%;top:42%;width:10vmin;height:10vmin;margin:-5vmin 0 0 -5vmin;border-radius:50%;background:radial-gradient(circle,#fff 0,#ffe39a 30%,rgb(255 200 80 / 0) 70%);opacity:0;animation:rev-eclat 1.4s 1.7s ease-out forwards}',
    '.rev-centre{position:relative;display:flex;flex-direction:column;align-items:center;gap:2.2vmin;width:min(92vw,760px);text-align:center}',
    '.rev-boite{position:relative;width:min(38vmin,260px);height:min(28vmin,190px);margin-top:min(14vmin,110px);animation:rev-chute .9s cubic-bezier(.3,1.5,.5,1) both,rev-tremble .5s .95s ease-in-out 2,rev-range .8s 2.4s ease-in forwards}',
    '.rev-corps{position:absolute;inset:18% 4% 0;border-radius:6% 6% 14% 14%;background:linear-gradient(160deg,#4d8cf5,#2f6fde 45%,#1b4fb3);box-shadow:inset 0 -10px 0 rgb(0 0 0 / .15),0 18px 40px rgb(0 0 0 / .45);animation:rev-fuite 1s .9s ease-in forwards}',
    '.rev-corps::after{content:"";position:absolute;left:50%;top:22%;width:30%;height:22%;margin-left:-15%;border-radius:8px;background:#f5f7ff;box-shadow:0 2px 0 rgb(0 0 0 / .15)}',
    '.rev-couvercle{position:absolute;left:0;right:0;top:0;height:26%;border-radius:10px;background:linear-gradient(180deg,#6aa0ff,#3a78e6);box-shadow:0 6px 0 rgb(0 0 0 / .18);transform-origin:20% 100%;animation:rev-couvercle .75s 1.7s cubic-bezier(.3,.6,.4,1) forwards}',
    '.rev-chiffre{position:absolute;left:50%;top:min(18vmin,140px);font-weight:700;font-size:min(30vmin,230px);line-height:1;letter-spacing:-.04em;background:linear-gradient(180deg,#fff7d1 0%,#ffd75a 38%,#f5b301 62%,#c77700 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 22px rgb(255 190 40 / .55));transform:translate(-50%,40%) scale(.2);opacity:0;animation:rev-chiffre 1s 1.85s cubic-bezier(.2,1.4,.4,1) forwards}',
    '.rev-textes{display:flex;flex-direction:column;align-items:center;gap:1.6vmin;margin-top:min(6vmin,40px);opacity:0;animation:rev-monte .7s 2.75s ease-out forwards}',
    '.rev-textes h2{margin:0;font-size:clamp(1.6rem,5vmin,2.8rem);line-height:1.1}',
    '.rev-textes p{margin:0;max-width:34em;color:#d7def5;font-size:clamp(1rem,2.4vmin,1.2rem)}',
    '.rev-boutons{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:1vmin}',
    '.rev button{font:inherit;font-weight:600;cursor:pointer;border-radius:999px;padding:.75rem 1.3rem;font-size:1.05rem}',
    '.rev-voir{border:0;background:linear-gradient(135deg,#ffd75a,#f5b301);color:#2a1600;box-shadow:0 8px 24px rgb(245 179 1 / .4)}',
    '.rev-ok{border:2px solid rgb(255 255 255 / .7);background:transparent;color:#fff}',
    '.rev-passer{position:absolute;right:16px;top:16px;z-index:2;border:0;background:rgb(255 255 255 / .16);color:#fff;font-size:.95rem!important;padding:.5rem 1rem!important}',
    '.rev button:focus-visible{outline:3px solid #fff;outline-offset:3px}',
    '.rev-confetti{position:absolute;left:50%;top:42%;width:10px;height:14px;border-radius:2px;background:var(--c);opacity:0;animation:rev-confetti 2.4s var(--d) cubic-bezier(.15,.6,.4,1) forwards}',
    '.rev iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}',
    '.rev.calme,.rev.calme *{animation:none!important}',
    '.rev.calme .rev-chiffre{position:static;transform:none;opacity:1;font-size:min(22vmin,170px)}',
    '.rev.calme .rev-textes{opacity:1;margin-top:0}.rev.calme .rev-boite,.rev.calme .rev-rayons,.rev.calme .rev-halo{display:none}',
    '@keyframes rev-entree{from{opacity:0}}',
    '@keyframes rev-chute{from{transform:translateY(-75vh) rotate(-8deg)}}',
    '@keyframes rev-tremble{0%,100%{transform:none}20%{transform:translateX(-6px) rotate(-3deg)}40%{transform:translateX(6px) rotate(3deg)}60%{transform:translateX(-5px) rotate(-2deg)}80%{transform:translateX(4px) rotate(2deg)}}',
    '@keyframes rev-fuite{to{box-shadow:inset 0 -10px 0 rgb(0 0 0 / .15),0 18px 40px rgb(0 0 0 / .45),0 -10px 60px 10px rgb(255 214 90 / .85)}}',
    '@keyframes rev-couvercle{to{transform:translate(-55%,-170%) rotate(-38deg);opacity:0}}',
    '@keyframes rev-eclat{0%{opacity:0;transform:scale(.5)}35%{opacity:.85}100%{opacity:0;transform:scale(16)}}',
    '@keyframes rev-rayons-on{to{opacity:1}}',
    '@keyframes rev-tourne{to{rotate:1turn}}',
    '@keyframes rev-chiffre{to{transform:translate(-50%,-62%) scale(1);opacity:1}}',
    '@keyframes rev-range{to{transform:translateY(4vmin) scale(.7);opacity:.55}}',
    '@keyframes rev-monte{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}',
    '@keyframes rev-confetti{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(var(--x),var(--y)) rotate(var(--r))}}',
  ].join('\n');

  var ouvert = null;
  function fermer() {
    if (!ouvert) return;
    var o = ouvert;
    ouvert = null;
    window.removeEventListener('message', o.message);
    document.removeEventListener('keydown', o.touche, true);
    o.el.remove();
    document.documentElement.style.overflow = o.debordement;
    if (o.avant && o.avant.focus) try { o.avant.focus(); } catch (e) { /* élément disparu */ }
  }

  function bouton(classe, texte, action) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = texte;
    b.addEventListener('click', action);
    return b;
  }

  // Le plein écran (dialogue) et ce qui l'accompagne : Échap, focus gardé dedans, défilement de la page bloqué.
  function ouvrir(nom) {
    fermer();
    if (!document.getElementById('rev-style')) {
      var s = document.createElement('style');
      s.id = 'rev-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
    var el = document.createElement('div');
    el.className = 'rev';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', nom);
    ouvert = { el: el, avant: document.activeElement, debordement: document.documentElement.style.overflow };
    ouvert.message = function (e) {
      var f = el.querySelector('iframe');
      if (f && e.source === f.contentWindow && e.data && e.data.evenement === 'fin') fermer();
    };
    ouvert.touche = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); fermer(); return; }
      if (e.key !== 'Tab') return;
      var l = Array.prototype.slice.call(el.querySelectorAll('button, iframe'));
      if (!l.length) return;
      var i = l.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); l[l.length - 1].focus(); }
      else if (!e.shiftKey && i === l.length - 1) { e.preventDefault(); l[0].focus(); }
    };
    window.addEventListener('message', ouvert.message);
    document.addEventListener('keydown', ouvert.touche, true);
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(el);
    return el;
  }

  function bandeAnnonce() {
    var el = ouvrir('Bande-annonce de la 4.1');
    var f = document.createElement('iframe');
    f.src = LANCEMENT + '?auto=1';
    f.title = 'Bande-annonce de la 4.1';
    f.allow = 'autoplay';
    var passer = bouton('rev-passer', 'Passer ⏭', fermer);
    el.append(f, passer);
    passer.focus();
  }

  function montrer() {
    var tranquille = calme();
    var el = ouvrir('Nouveau : la mise à jour 4.1');
    if (tranquille) el.classList.add('calme');
    el.innerHTML = '<div class="rev-rayons"></div><div class="rev-halo"></div>'
      + '<div class="rev-centre"><div class="rev-boite"><div class="rev-corps"></div><div class="rev-couvercle"></div></div>'
      + '<div class="rev-chiffre">4.1</div><div class="rev-textes"><h2>La mise à jour 4.1 est arrivée !</h2>'
      + "<p>🗺️ L'Aventure des boîtes : sept îles à conquérir et des étoiles à décrocher. Et des niveaux, des cadres pour ta photo de profil… Tout est nouveau.</p>"
      + '<div class="rev-boutons"></div></div></div>';
    var boutons = el.querySelector('.rev-boutons');
    boutons.append(bouton('rev-voir', '▶ Voir la bande-annonce', bandeAnnonce), bouton('rev-ok', "C'est parti !", fermer));
    var passer = bouton('rev-passer', 'Passer ✕', fermer);
    el.appendChild(passer);
    if (!tranquille) {
      var COULEURS = ['#ffd75a', '#f5b301', '#ff6f91', '#5bc0ff', '#7ee08a', '#b48cff', '#ffffff'];
      for (var i = 0; i < 46; i++) {
        var c = document.createElement('i');
        c.className = 'rev-confetti';
        var angle = Math.random() * Math.PI * 2, loin = 20 + Math.random() * 38;
        c.style.setProperty('--c', COULEURS[i % COULEURS.length]);
        c.style.setProperty('--x', (Math.cos(angle) * loin).toFixed(1) + 'vmax');
        c.style.setProperty('--y', (Math.sin(angle) * loin * .8 + 12).toFixed(1) + 'vmax');
        c.style.setProperty('--r', Math.round(Math.random() * 900 - 450) + 'deg');
        c.style.setProperty('--d', (2.1 + Math.random() * .3).toFixed(2) + 's');
        el.insertBefore(c, el.firstChild.nextSibling);
      }
    }
    passer.focus();
  }

  window.boitesRevelation = { montrer: montrer, bandeAnnonce: bandeAnnonce };

  var force = /(^|#|&)revelation\b/.test(location.hash.slice(1)) || /[?&]revelation=1\b/.test(location.search);
  if (window.top !== window || bureau) return;
  if (!force && (lire(CLE) || (logiciel && !lire('boites-a-classer-aide:vue')))) return;
  // Attendre que le clip d'intro d'un événement (site/evenement.js) soit fini, s'il y en a un.
  var essais = 0;
  function lancer() {
    if (document.querySelector('.hanter-intro') && essais++ < 60) { setTimeout(lancer, 1500); return; }
    try { localStorage.setItem(CLE, new Date().toISOString()); } catch (e) { /* stockage indisponible : elle reviendra */ }
    montrer();
  }
  // Peu après l'affichage de la page, sans attendre ses images et ses cadres (la pub de l'accueil).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(lancer, 900); });
  else setTimeout(lancer, 900);
}());
