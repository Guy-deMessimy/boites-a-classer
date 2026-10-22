// Jeu de l'événement (serveur/evenement.js) : chaque fantôme attrapé (site/halloween/hanter.js) rapporte un point au
// compte connecté. Le classement n'est montré qu'à la fin de l'événement.
//
//   POST /api/evenement/attrape     (Authorization: Bearer …) → { points, compte }   un point de plus, au plus un toutes
//                                    les 2,5 s (« compte » : false s'il est arrivé trop tôt) ; 409 sans événement en cours
//   GET  /api/evenement/classement  (Authorization facultative) → { evenement: { nom, depuis, fin } | null, participants,
//                                    top: [{ nom, eleve, points }] (10 premiers, seulement une fois l'événement arrêté),
//                                    moi: { points, rang } (compte connecté ; rang seulement à la fin) }

import { sessionValide } from '../../../serveur/comptes.js';
import { lireEvenement, classement } from '../../../serveur/evenement.js';

const RYTHME = 2500; // ms entre deux points comptés : un fantôme apparaît au plus toutes les 5 s sur une page
const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};
const json = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { ...ENTETES, 'Content-Type': 'application/json' } });
const erreur = (message, statut) => json({ erreur: message }, statut);

const actions = {
  async attrape(request, env) {
    const s = await sessionValide(request, env);
    if (!s) return erreur('connexion nécessaire', 401);
    const e = await lireEvenement(env);
    if (!e || e.fin) return erreur('pas d\'événement en cours', 409);
    const maintenant = Date.now();
    const r = await env.DB.prepare('INSERT INTO scores_evenement (evenement, compte, points, dernier) VALUES (?1, ?2, 1, ?3) '
      + 'ON CONFLICT (evenement, compte) DO UPDATE SET points = points + 1, dernier = ?3 WHERE ?3 - scores_evenement.dernier >= ?4 RETURNING points')
      .bind(e.depuis, s.compte, maintenant, RYTHME).first();
    if (r) return json({ points: r.points, compte: true });
    const deja = await env.DB.prepare('SELECT points FROM scores_evenement WHERE evenement = ? AND compte = ?').bind(e.depuis, s.compte).first();
    return json({ points: deja ? deja.points : 0, compte: false });
  },

  async classement(request, env) {
    const e = await lireEvenement(env);
    if (!e) return json({ evenement: null });
    const s = request.headers.has('Authorization') ? await sessionValide(request, env) : null;
    const c = await classement(env, e.depuis, 10, s && s.compte);
    const res = { evenement: e, participants: c.participants };
    if (e.fin) res.top = c.top.map(({ nom, eleve, points }) => ({ nom, eleve, points }));
    if (c.moi) res.moi = e.fin ? c.moi : { points: c.moi.points };
    return json(res);
  },
};

const METHODES = { attrape: 'POST', classement: 'GET' };

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
  const action = params.action;
  if (!Object.hasOwn(actions, action)) return erreur('action inconnue', 404);
  if (request.method !== METHODES[action]) return erreur('méthode non permise', 405);
  return actions[action](request, env);
}
