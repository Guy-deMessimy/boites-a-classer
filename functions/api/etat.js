// « Le site est-il ouvert ? » : demandé toutes les 20 secondes par les pages ouvertes (site/arret.js, app/app.js) et par
// la page « revient dans peu de temps » (serveur/maintenance.js). Site ouvert : 200 et l'événement en cours
// ({ evenement: { nom, depuis } | null }, serveur/evenement.js). Site arrêté : functions/_middleware.js répond 503 avant
// d'arriver ici. Les deux réglages sont gardés en cache quelques secondes : peu de lectures de la base.

import { evenementEnCours } from '../../serveur/evenement.js';

export async function onRequest({ env }) {
  return new Response(JSON.stringify({ evenement: await evenementEnCours(env) }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
}
