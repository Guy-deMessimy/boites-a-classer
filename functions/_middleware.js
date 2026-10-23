// Passe avant chaque requête du site :
// - quand un admin a arrêté le site (serveur/maintenance.js), tout répond par la page « Boîtes à classer revient dans
//   peu de temps… », sauf la page d'administration et ce dont elle a besoin pour le rouvrir ;
// - les pages HTML partent habillées du thème du site (serveur/theme.js : décor, bandeau, nom du site), sauf les clips
//   des événements (site/halloween/, site/noel/), qui ont le leur.

import { maintenanceActive, PAGE_MAINTENANCE } from '../serveur/maintenance.js';
import { lireTheme, habiller } from '../serveur/theme.js';

const TOUJOURS_OUVERT = [
  /^\/admin(\/|$)/, // page d'administration (connexion et bouton de réouverture)
  /^\/api\/(admin|compte)\//,
  /^\/polices\//, /^\/fond-sciences\.svg$/, /^\/icone\.png$/, // utilisés par la page de maintenance
];
const SANS_THEME = /^\/(api|halloween|noel)\//;
const PAGE = /(\/|\.html|\/[^./]+)$/; // adresse d'une page (et non d'un script, d'une image…)
const CONDITIONS = ['If-None-Match', 'If-Modified-Since'];

export async function onRequest({ request, env, next }) {
  const chemin = new URL(request.url).pathname;
  if (TOUJOURS_OUVERT.some((r) => r.test(chemin)) || !(await maintenanceActive(env))) return habillee(request, env, next, chemin);
  if (chemin.startsWith('/api/')) {
    return new Response(JSON.stringify({ erreur: 'site arrêté pour le moment' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Retry-After': '600' },
    });
  }
  return habiller(new Response(PAGE_MAINTENANCE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '600' },
  }), await lireTheme(env));
}

async function habillee(request, env, next, chemin) {
  if (SANS_THEME.test(chemin) || !PAGE.test(chemin) || !['GET', 'HEAD'].includes(request.method)) return next();
  // Le navigateur qui a déjà la page la redemande en entier : le fichier n'a pas changé, mais le thème peut-être.
  let demande = request;
  if (CONDITIONS.some((h) => request.headers.has(h))) {
    const entetes = new Headers(request.headers);
    CONDITIONS.forEach((h) => entetes.delete(h));
    demande = new Request(request, { headers: entetes });
  }
  const reponse = await next(demande);
  if (!/^text\/html/.test(reponse.headers.get('Content-Type') || '')) return reponse;
  return habiller(reponse, await lireTheme(env));
}
