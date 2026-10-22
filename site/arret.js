// Quand un admin arrête le site (page admin, serveur/maintenance.js), les pages déjà ouvertes le voient sans qu'on les
// recharge à la main : toutes les 20 secondes, tant que l'onglet est visible, on demande /api/etat. Le serveur répond
// 503 quand le site est arrêté : la page se recharge et devient « Boîtes à classer revient dans peu de temps… ».
(function () {
  'use strict';
  if (window.top !== window) return; // dans un cadre (la pub de l'accueil) : la page autour s'en charge
  function verifier() {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/etat', { cache: 'no-store' }).then(function (rep) {
      if (rep.status === 503) location.reload();
    }).catch(function () { /* hors connexion : on réessaiera */ });
  }
  setInterval(verifier, 20000);
  document.addEventListener('visibilitychange', verifier);
})();
