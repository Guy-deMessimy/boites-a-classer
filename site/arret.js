// Les pages ouvertes suivent le site sans qu'on les recharge (functions/api/etat.js) : elles demandent /api/etat en
// disant ce qu'elles savent déjà, le serveur garde la question jusqu'à ce que ça change (24 s au plus), puis elles
// redemandent aussitôt, tant que l'onglet est visible.
// - Site arrêté par un admin (serveur/maintenance.js) : 503, la page se recharge et devient la page d'arrêt — sauf le
//   service client (/aide/), qui reste ouvert pendant l'arrêt : il redemande toutes les 20 s, sans recharger.
// - Événement déclenché (serveur/evenement.js : Halloween, Noël) : ses effets sont chargés (site/evenement.js), puis
//   retirés quand l'admin l'arrête ; son classement est alors montré (et reste annoncé sur l'accueil à son thème).
// - Thème du site changé par un admin (serveur/theme.js) : la page prend ses couleurs (data-theme) et le nom du site ;
//   l'accueil, dont le décor et le bandeau viennent du serveur, se recharge.
(function () {
  'use strict';
  if (window.top !== window) return; // dans un cadre (la pub de l'accueil) : la page autour s'en charge
  var charge = false, connu = '?', enCours = false;
  // r : toute la réponse (boss, fantômes attrapés par tous…).
  function suivreEvenement(e, fini, r) {
    if (window.hanter) { window.hanter.suivre(e, fini, r); return; }
    var accueil = fini && document.documentElement.classList.contains('theme-' + fini.nom);
    if ((!e && !accueil) || charge) return;
    charge = true;
    var s = document.createElement('script');
    s.src = '/evenement.js';
    s.onload = function () { if (window.hanter) window.hanter.suivre(e, fini, r); };
    document.head.appendChild(s);
  }
  var NOMS = /Boîtes à (classer|hanter|lutins|œufs|fleurs|masques|sable|crayons)/g;
  function suivreTheme(theme, nom) {
    var racine = document.documentElement;
    if (!theme || !nom || (racine.dataset.theme || 'normal') === theme) return;
    if (racine.hasAttribute('data-decor')) {
      // Quelques secondes : le temps que toutes les instances du serveur connaissent le nouveau thème.
      setTimeout(function () { location.reload(); }, 6000);
      return;
    }
    if (theme === 'normal') delete racine.dataset.theme;
    else racine.dataset.theme = theme;
    document.title = document.title.replace(NOMS, nom);
    Array.prototype.forEach.call(document.querySelectorAll('[data-nom-site]'), function (e) {
      ['content', 'title', 'aria-label'].forEach(function (a) { if (e.hasAttribute(a)) e.setAttribute(a, e.getAttribute(a).replace(NOMS, nom)); });
      var texte = e.textContent.replace(NOMS, nom);
      if (e.getAttribute('data-nom-site') !== 'attributs' && texte !== e.textContent) e.textContent = texte;
    });
  }
  function ecouter() {
    if (enCours || document.visibilityState !== 'visible') return;
    enCours = true;
    fetch('/api/etat?v=4&attendre=' + encodeURIComponent(connu), { cache: 'no-store' }).then(function (rep) {
      if (rep.status === 503) {
        if (/^\/aide(\/|$)/.test(location.pathname)) throw new Error('site arrêté');
        location.reload();
        return false;
      }
      if (!rep.ok) throw new Error('serveur ' + rep.status);
      return rep.json().then(function (r) {
        connu = (r && r.sig) || '-';
        suivreTheme(r && r.theme, r && r.nomSite);
        suivreEvenement((r && r.evenement) || null, (r && r.fini) || null, r || {});
        return true;
      });
    }).then(function (suite) {
      enCours = false;
      if (suite) ecouter();
    }).catch(function () {
      enCours = false; // hors connexion ou serveur en difficulté : on réessaie dans 20 s
      setTimeout(ecouter, 20000);
    });
  }
  ecouter();
  document.addEventListener('visibilitychange', ecouter);
})();
