// Classes : un abonné (serveur/abonnements.js) donne son code de classe à ses élèves ; un élève qui le saisit rejoint sa classe
// et accepte que cet enseignant voie son travail et puisse lui redonner un mot de passe. Un élève a une classe au plus.
// Toutes les actions demandent une session (Authorization: Bearer …).
//
// Pour l'élève (tout compte) :
//   POST /api/classe/rejoindre  { code }  → { enseignant }   404 si aucun abonné n'a ce code
//   POST /api/classe/quitter              → 204
// Pour l'abonné :
//   GET  /api/classe/eleves               → { code, abonne_jusqua, eleves: [{ identifiant, cree, derniere, versions, date, taille }] }
//   GET  /api/classe/travail?identifiant=…  dernière version du travail d'un de ses élèves (gzip, X-Version, X-Date)
//   POST /api/classe/mot-de-passe { identifiant, secret }  nouveau mot de passe pour un de ses élèves → 204
//   POST /api/classe/retirer { identifiant }  l'élève quitte sa classe → 204
//   POST /api/classe/nouveau-code         → { code }   l'ancien code ne marche plus (les élèves déjà inscrits restent)

import { sessionValide, FORME_IDENTIFIANT, FORME_SECRET, texte, sha256, hasard } from '../../../serveur/comptes.js';
import { estAbonne, nouveauCodeClasse } from '../../../serveur/abonnements.js';

const FORME_CODE = /^[A-Z0-9]{6}$/;
const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'X-Version, X-Date',
  'Cache-Control': 'no-store',
};
const json = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { ...ENTETES, 'Content-Type': 'application/json' } });
const erreur = (message, statut) => json({ erreur: message }, statut);
const rien = () => new Response(null, { status: 204, headers: ENTETES });

async function lireCorps(request) {
  try {
    const o = await request.json();
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

// Un élève de la classe de « moi » : { id } ou réponse d'erreur. Un admin ou un abonné ne se gère pas d'ici.
async function monEleve(env, moi, identifiant) {
  if (!FORME_IDENTIFIANT.test(identifiant || '')) return erreur('identifiant invalide', 400);
  const e = await env.DB.prepare('SELECT id, admin, abonne_jusqua FROM comptes WHERE identifiant = ? AND enseignant = ?')
    .bind(identifiant, moi.id).first();
  if (!e) return erreur('cet élève n\'est pas dans ta classe', 404);
  return e;
}

const pourEleve = {
  async rejoindre(request, env, moi) {
    const code = String((await lireCorps(request)).code || '').trim().toUpperCase();
    if (!FORME_CODE.test(code)) return erreur('un code de classe a 6 lettres ou chiffres', 400);
    const prof = await env.DB.prepare('SELECT * FROM comptes WHERE code_classe = ?').bind(code).first();
    if (!prof || !(await estAbonne(env, prof))) return erreur('aucune classe avec ce code', 404);
    if (prof.id === moi.id) return erreur('c\'est ton propre code de classe', 400);
    await env.DB.prepare('UPDATE comptes SET enseignant = ? WHERE id = ?').bind(prof.id, moi.id).run();
    return json({ enseignant: prof.identifiant });
  },

  async quitter(request, env, moi) {
    await env.DB.prepare('UPDATE comptes SET enseignant = NULL WHERE id = ?').bind(moi.id).run();
    return rien();
  },
};

const pourAbonne = {
  async eleves(request, env, moi) {
    const { results } = await env.DB.prepare('SELECT c.identifiant, c.cree, c.derniere, '
      + 'count(s.version) AS versions, max(s.date) AS date, '
      + '(SELECT length(donnees) FROM sauvegardes WHERE cle = \'compte:\' || c.id ORDER BY version DESC LIMIT 1) AS taille '
      + 'FROM comptes c LEFT JOIN sauvegardes s ON s.cle = \'compte:\' || c.id '
      + 'WHERE c.enseignant = ? GROUP BY c.id ORDER BY c.identifiant LIMIT 500').bind(moi.id).all();
    // estAbonne a pu relire l'abonnement chez PayPal : on relit le code et la date à jour.
    const a = await env.DB.prepare('SELECT code_classe, abonne_jusqua FROM comptes WHERE id = ?').bind(moi.id).first();
    return json({ code: a.code_classe, abonne_jusqua: a.abonne_jusqua, eleves: results });
  },

  async travail(request, env, moi) {
    const e = await monEleve(env, moi, new URL(request.url).searchParams.get('identifiant'));
    if (e instanceof Response) return e;
    const ligne = await env.DB.prepare('SELECT version, date, donnees FROM sauvegardes WHERE cle = ? ORDER BY version DESC LIMIT 1')
      .bind('compte:' + e.id).first();
    if (!ligne) return erreur('aucun travail sauvegardé', 404);
    return new Response(new Uint8Array(ligne.donnees), {
      headers: { ...ENTETES, 'Content-Type': 'application/octet-stream', 'X-Version': String(ligne.version), 'X-Date': ligne.date },
    });
  },

  async 'mot-de-passe'(request, env, moi) {
    const { identifiant, secret } = await lireCorps(request);
    if (!FORME_SECRET.test(secret || '')) return erreur('mot de passe invalide', 400);
    const e = await monEleve(env, moi, identifiant);
    if (e instanceof Response) return e;
    if (e.admin || (e.abonne_jusqua && Date.parse(e.abonne_jusqua) > Date.now())) return erreur('ce compte ne se modifie pas d\'ici', 403);
    const sel = hasard(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE comptes SET sel = ?, empreinte = ? WHERE id = ?').bind(sel.buffer, (await sha256(sel, texte(secret))).buffer, e.id),
      env.DB.prepare('DELETE FROM sessions WHERE compte = ?').bind(e.id),
    ]);
    return rien();
  },

  async retirer(request, env, moi) {
    const e = await monEleve(env, moi, (await lireCorps(request)).identifiant);
    if (e instanceof Response) return e;
    await env.DB.prepare('UPDATE comptes SET enseignant = NULL WHERE id = ?').bind(e.id).run();
    return rien();
  },

  async 'nouveau-code'(request, env, moi) {
    const code = nouveauCodeClasse();
    await env.DB.prepare('UPDATE comptes SET code_classe = ? WHERE id = ?').bind(code, moi.id).run();
    return json({ code });
  },
};

const GET = new Set(['eleves', 'travail']);

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return rien();
  const action = params.action;
  const liste = Object.hasOwn(pourEleve, action) ? pourEleve : Object.hasOwn(pourAbonne, action) ? pourAbonne : null;
  if (!liste) return erreur('action inconnue', 404);
  if (request.method !== (GET.has(action) ? 'GET' : 'POST')) return erreur('méthode non permise', 405);
  const s = await sessionValide(request, env);
  if (!s) return erreur('session expirée', 401);
  const moi = await env.DB.prepare('SELECT * FROM comptes WHERE id = ?').bind(s.compte).first();
  if (!moi) return erreur('session expirée', 401);
  if (liste === pourAbonne && !(await estAbonne(env, moi))) return erreur('réservé aux abonnés', 403);
  return liste[action](request, env, moi);
}
