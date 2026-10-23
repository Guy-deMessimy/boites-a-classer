// Les pages ouvertes suivent le site sans qu'on les recharge (functions/api/etat.js) : elles demandent /api/etat en
// disant ce qu'elles savent déjà, le serveur garde la question jusqu'à ce que ça change (24 s au plus), puis elles
// redemandent aussitôt, tant que l'onglet est visible.
// - Site arrêté par un admin (serveur/maintenance.js) : 503, la page se recharge et devient « … revient dans peu de
//   temps… ».
// - Événement déclenché (serveur/evenement.js : Halloween, Noël) : ses effets sont chargés (site/evenement.js), puis
//   retirés quand l'admin l'arrête ; son classement est alors montré (et reste annoncé sur l'accueil à son thème).
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
  function ecouter() {
    if (enCours || document.visibilityState !== 'visible') return;
    enCours = true;
    fetch('/api/etat?v=4&attendre=' + encodeURIComponent(connu), { cache: 'no-store' }).then(function (rep) {
      if (rep.status === 503) { location.reload(); return false; }
      if (!rep.ok) throw new Error('serveur ' + rep.status);
      return rep.json().then(function (r) {
        connu = (r && r.sig) || '-';
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
