// « Le site est-il ouvert, et quel événement est en cours ? » (serveur/maintenance.js, serveur/evenement.js)
// Site arrêté : functions/_middleware.js répond 503 avant d'arriver ici, et la page se recharge en « revient dans peu
// de temps… ». Sinon : 200 et { evenement: { nom, depuis } | null, fini: { nom, depuis, fin } | null } (« fini » :
// dernier événement arrêté, dont le classement est à montrer).
//
// GET /api/etat?attendre=<ce que la page connaît>  (site/arret.js, app/app.js, page de maintenance)
//   Le serveur garde la question jusqu'à 24 s et répond dès que l'événement change (ou que le site est arrêté) : les
//   pages ouvertes voient l'événement 3 à 5 s après le clic de l'admin, sans qu'on les recharge, avec une seule
//   requête toutes les 24 s par page. « attendre » vaut signature(evenement) ; toute autre valeur répond tout de suite.
// GET /api/etat  (pages d'avant la 3.25.2, qui ne savent pas attendre et, avant la 3.25.0, ignorent les événements)
//   Pendant un événement : 503, qui les fait se recharger une fois et prendre le nouveau code.

import { lireEvenement } from '../../serveur/evenement.js';
import { maintenanceActive } from '../../serveur/maintenance.js';

const ATTENTE = 24000;
const PAS = 3000;
const ENTETES = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

const signature = (e) => (e ? e.nom + '@' + e.depuis : '-');
const reponse = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: ENTETES });
const enCours = (v) => (v && !v.fin ? v : null);
const etat = (v) => ({ evenement: enCours(v), fini: v && v.fin ? v : null });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequest({ request, env }) {
  const attendre = new URL(request.url).searchParams.get('attendre');
  let v = await lireEvenement(env);
  if (attendre === null) return enCours(v) ? reponse({ erreur: 'à recharger' }, 503) : reponse(etat(v));
  const fin = Date.now() + ATTENTE;
  while (signature(enCours(v)) === attendre && Date.now() + PAS <= fin) {
    await pause(PAS);
    if (await maintenanceActive(env)) return reponse({ erreur: 'site arrêté pour le moment' }, 503);
    v = await lireEvenement(env);
  }
  return reponse(etat(v));
}
