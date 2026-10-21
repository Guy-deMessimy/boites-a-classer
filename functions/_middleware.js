// Passe avant chaque requête du site : quand un admin a arrêté le site (serveur/maintenance.js), tout répond par la page
// « Boîtes à classer revient dans peu de temps… », sauf la page d'administration et ce dont elle a besoin pour le rouvrir.

import { maintenanceActive, PAGE_MAINTENANCE } from '../serveur/maintenance.js';

const TOUJOURS_OUVERT = [
  /^\/admin(\/|$)/, // page d'administration (connexion et bouton de réouverture)
  /^\/api\/(admin|compte)\//,
  /^\/api\/paypal\//, // webhooks de PayPal : les renouvellements et annulations comptent même site arrêté
  /^\/polices\//, /^\/fond-sciences\.svg$/, /^\/icone\.png$/, // utilisés par la page de maintenance
];

export async function onRequest({ request, env, next }) {
  const chemin = new URL(request.url).pathname;
  if (TOUJOURS_OUVERT.some((r) => r.test(chemin)) || !(await maintenanceActive(env))) return next();
  if (chemin.startsWith('/api/')) {
    return new Response(JSON.stringify({ erreur: 'site arrêté pour le moment' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Retry-After': '600' },
    });
  }
  return new Response(PAGE_MAINTENANCE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '600' },
  });
}
