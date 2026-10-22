// Collections du site, proposées à tout le monde dans le logiciel (en plus des collections fournies dans app/collections.js).
// Un admin les gère toutes ; un enseignant (rôle donné par un admin, depuis la 3.13.0) crée les siennes et ne modifie
// que celles-là (colonne collections.auteur, migrations/0006). Les actions « collection » de l'API admin restent valables.
//
//   GET    /api/collections            → [{ id, nom, attributs, etres }, …] dans l'ordre de création ;
//                                        avec une session, chaque collection que l'on peut modifier porte « modifiable: true »
//   POST   /api/collections            { collection } ajoute ou remplace une collection → 204   (admin ou enseignant)
//   DELETE /api/collections?id=site-…  retire une collection → 204                              (admin ou son auteur)

import { sessionValide } from '../../serveur/comptes.js';

const FORME_ID = /^site-[A-Za-z0-9_-]{1,55}$/;
const TAILLE_MAX = 1900000; // une valeur D1 ne peut pas dépasser 2 Mo
const MAX_PAR_ENSEIGNANT = 30;

const ENTETES = {
  'Access-Control-Allow-Origin': '*', // l'application de bureau (http://localhost:47821) appelle aussi cette API
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};
const json = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { ...ENTETES, 'Content-Type': 'application/json' } });
const erreur = (message, statut) => json({ erreur: message }, statut);
const rien = () => new Response(null, { status: 204, headers: ENTETES });

// Qui fait la demande : { id, admin, enseignant } ou null.
async function qui(request, env) {
  const s = await sessionValide(request, env);
  if (!s) return null;
  const c = await env.DB.prepare('SELECT id, admin, est_enseignant FROM comptes WHERE id = ?').bind(s.compte).first();
  return c ? { id: c.id, admin: !!c.admin, enseignant: !!c.est_enseignant } : null;
}

const peutModifier = (moi, ligne) => moi.admin || (moi.enseignant && (!ligne || ligne.auteur === moi.id));

export const onRequestOptions = () => rien();

export async function onRequestGet({ request, env }) {
  const { results } = await env.DB.prepare('SELECT donnees, auteur FROM collections ORDER BY rowid').all();
  const moi = request.headers.has('Authorization') ? await qui(request, env) : null;
  if (!moi) return new Response('[' + results.map((r) => r.donnees).join(',') + ']', { headers: { ...ENTETES, 'Content-Type': 'application/json' } });
  return json(results.map((r) => ({ ...JSON.parse(r.donnees), ...(peutModifier(moi, r) ? { modifiable: true } : {}) })));
}

// Le logiciel envoie une collection déjà vérifiée (nettoyerCollection dans app/app.js) et la revérifie à la lecture :
// ici, on contrôle seulement sa forme générale et sa taille.
export async function onRequestPost({ request, env }) {
  const moi = await qui(request, env);
  if (!moi) return erreur('session expirée', 401);
  if (!moi.admin && !moi.enseignant) return erreur('réservé aux enseignants et aux administrateurs', 403);
  let c = null;
  try { ({ collection: c } = await request.json()); } catch (e) { /* corps illisible */ }
  if (!c || typeof c !== 'object' || !FORME_ID.test(c.id || '') || typeof c.nom !== 'string'
    || !Array.isArray(c.attributs) || !Array.isArray(c.etres)) return erreur('collection illisible', 400);
  const donnees = JSON.stringify({ id: c.id, nom: c.nom, attributs: c.attributs, etres: c.etres });
  if (donnees.length > TAILLE_MAX) return erreur('collection trop grosse (trop de photos)', 413);

  const ligne = await env.DB.prepare('SELECT auteur FROM collections WHERE id = ?').bind(c.id).first();
  if (!peutModifier(moi, ligne)) return erreur('cette collection appartient à quelqu\'un d\'autre', 403);
  if (!ligne && !moi.admin) {
    const { n } = await env.DB.prepare('SELECT count(*) AS n FROM collections WHERE auteur = ?').bind(moi.id).first();
    if (n >= MAX_PAR_ENSEIGNANT) return erreur(`${MAX_PAR_ENSEIGNANT} collections au plus par enseignant`, 403);
  }
  // L'auteur ne change pas quand un admin modifie la collection d'un enseignant.
  await env.DB.prepare('INSERT INTO collections (id, donnees, date, auteur) VALUES (?1, ?2, ?3, ?4) '
    + 'ON CONFLICT (id) DO UPDATE SET donnees = ?2, date = ?3').bind(c.id, donnees, new Date().toISOString(), moi.id).run();
  return rien();
}

export async function onRequestDelete({ request, env }) {
  const moi = await qui(request, env);
  if (!moi) return erreur('session expirée', 401);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!FORME_ID.test(id)) return erreur('identifiant de collection invalide', 400);
  const ligne = await env.DB.prepare('SELECT auteur FROM collections WHERE id = ?').bind(id).first();
  if (!ligne) return rien();
  if (!peutModifier(moi, ligne)) return erreur('cette collection appartient à quelqu\'un d\'autre', 403);
  await env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(id).run();
  return rien();
}
