// Version de bureau uniquement (ajouté par build.sh juste après js/neutralino.js, que le serveur complète avec ses variables).
// Le jeton de connexion n'est fourni qu'une fois et ne reste pas disponible : on se connecte tout de suite.
(function () {
  var jeton = window.NL_TOKEN;
  try { jeton = jeton || sessionStorage.getItem('NL_TOKEN'); } catch (e) { /* stockage indisponible */ }
  if (!jeton || !window.Neutralino) return;
  try { sessionStorage.setItem('NL_TOKEN', jeton); } catch (e) { /* idem */ }
  window.Neutralino.init();
  window.NL_PRET = true;
})();
