// « Le site est-il ouvert ? » : demandé toutes les 20 secondes par les pages ouvertes (site/arret.js, app/app.js) et par
// la page « revient dans peu de temps » (serveur/maintenance.js). Site ouvert : 204. Site arrêté : functions/_middleware.js
// répond 503 avant d'arriver ici. Rien n'est lu dans la base ici (le middleware garde l'état en cache quelques secondes).
export const onRequest = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
