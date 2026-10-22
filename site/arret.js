// Quand un admin arrête le site (page admin, serveur/maintenance.js), les pages déjà ouvertes le voient sans qu'on les
// recharge à la main : au chargement puis toutes les 20 secondes, tant que l'onglet est visible, on demande /api/etat.
// Le serveur répond 503 quand le site est arrêté : la page se recharge et devient « Boîtes à classer revient dans peu
// de temps… ». Sinon, il dit si un événement est en cours (serveur/evenement.js) : ses effets sont chargés
// (site/halloween/hanter.js), puis retirés quand l'admin l'arrête.
(function () {
  'use strict';
  if (window.top !== window) return; // dans un cadre (la pub de l'accueil) : la page autour s'en charge
  var charge = false;
  function suivreEvenement(e) {
    if (window.hanter) { if (e) window.hanter.demarrer(e); else window.hanter.arreter(); return; }
    if (!e || charge) return;
    charge = true;
    var s = document.createElement('script');
    s.src = '/halloween/hanter.js';
    s.onload = function () { if (window.hanter) window.hanter.demarrer(e); };
    document.head.appendChild(s);
  }
  function verifier() {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/etat', { cache: 'no-store' }).then(function (rep) {
      if (rep.status === 503) { location.reload(); return; }
      if (rep.ok) return rep.json().then(function (r) { suivreEvenement(r && r.evenement); });
    }).catch(function () { /* hors connexion : on réessaiera */ });
  }
  verifier();
  setInterval(verifier, 20000);
  document.addEventListener('visibilitychange', verifier);
})();
