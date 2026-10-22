// Les pages ouvertes suivent le site sans qu'on les recharge (functions/api/etat.js) : elles demandent /api/etat en
// disant ce qu'elles savent déjà, le serveur garde la question jusqu'à ce que ça change (24 s au plus), puis elles
// redemandent aussitôt, tant que l'onglet est visible.
// - Site arrêté par un admin (serveur/maintenance.js) : 503, la page se recharge et devient « … revient dans peu de
//   temps… ».
// - Événement déclenché (serveur/evenement.js) : ses effets sont chargés (site/halloween/hanter.js), puis retirés quand
//   l'admin l'arrête ; son classement est alors montré (et reste annoncé sur l'accueil).
(function () {
  'use strict';
  if (window.top !== window) return; // dans un cadre (la pub de l'accueil) : la page autour s'en charge
  var charge = false, connu = '?', enCours = false;
  function suivreEvenement(e, fini) {
    if (window.hanter) { window.hanter.suivre(e, fini); return; }
    var accueil = document.documentElement.classList.contains('theme-halloween');
    if ((!e && !(fini && accueil)) || charge) return;
    charge = true;
    var s = document.createElement('script');
    s.src = '/halloween/hanter.js';
    s.onload = function () { if (window.hanter) window.hanter.suivre(e, fini); };
    document.head.appendChild(s);
  }
  function ecouter() {
    if (enCours || document.visibilityState !== 'visible') return;
    enCours = true;
    fetch('/api/etat?v=2&attendre=' + encodeURIComponent(connu), { cache: 'no-store' }).then(function (rep) {
      if (rep.status === 503) { location.reload(); return false; }
      if (!rep.ok) throw new Error('serveur ' + rep.status);
      return rep.json().then(function (r) {
        var e = (r && r.evenement) || null;
        connu = e ? e.nom + '@' + e.depuis : '-';
        suivreEvenement(e, (r && r.fini) || null);
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
