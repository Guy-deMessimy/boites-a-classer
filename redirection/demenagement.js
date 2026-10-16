// Ancienne adresse du site (GitHub Pages) : renvoie vers la nouvelle, avec ce que le navigateur gardait ici.
// La mémoire du navigateur (localStorage) est propre à chaque adresse : sans ce transfert, le travail resterait ici.
// Les données voyagent dans le fragment de l'adresse (#transfert=…), qui n'est jamais envoyé à aucun serveur ;
// app/app.js les récupère là-bas sans rien remplacer de ce qui y existe déjà.
(function () {
  'use strict';
  var NOUVELLE = 'https://boites-a-classer.pages.dev';
  var BASE = '/boites-a-classer';
  var LIMITE = 900000; // caractères : au-delà, certains navigateurs refusent l'adresse
  var chemin = location.pathname.indexOf(BASE) === 0 ? location.pathname.slice(BASE.length) : '';
  var cible = NOUVELLE + (chemin || '/') + location.search;

  var donnees = {};
  var n = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('boites-a-classer:') === 0) { donnees[k] = localStorage.getItem(k); n++; }
    }
  } catch (e) { /* stockage indisponible */ }
  if (!n) { location.replace(cible + location.hash); return; }

  function base64url(octets) {
    var b = '';
    for (var j = 0; j < octets.length; j += 0x8000) b += String.fromCharCode.apply(null, octets.subarray(j, j + 0x8000));
    return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  var json = new TextEncoder().encode(JSON.stringify(donnees));
  var pret = window.CompressionStream
    ? new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
      .then(function (t) { return 'z' + base64url(new Uint8Array(t)); })
    : Promise.resolve('j' + base64url(json));

  pret.then(function (charge) {
    if (charge.length <= LIMITE) {
      location.replace(NOUVELLE + '/app/index.html#transfert=' + charge);
      return;
    }
    // Trop gros pour une adresse (beaucoup de photos) : on propose un fichier à rouvrir là-bas.
    var fichier = new Blob([JSON.stringify({ format: 'boites-a-classer', type: 'sauvegarde', version: 1, donnees: donnees })], { type: 'application/json' });
    var lien = document.getElementById('sauvegarde');
    lien.href = URL.createObjectURL(fichier);
    lien.download = 'Sauvegarde Boîtes à classer.boites';
    document.getElementById('gros').hidden = false;
  }).catch(function () { location.replace(cible); });
})();
