// Service client, côté visiteur (page site/aide/). L'admin lit et répond depuis la page site/admin/ (functions/api/admin/).
// Tables dans migrations/0008_support.sql.
//
// La page affiche d'abord un message d'accueil (« Bonjour, veuillez décliner votre problème »), qui n'est pas gardé.
// Au premier message d'une conversation (ou au premier après qu'elle a été marquée résolue), le serveur ajoute la
// réponse automatique REPONSE_AUTO (auteur 'auto') ; la conversation attend ensuite l'administrateur.
//
// Chacun a une seule conversation : celle de son compte s'il est connecté (Authorization: Bearer …), sinon celle de son
// navigateur, reconnue par un jeton tiré au hasard par la page et envoyé dans l'en-tête X-Support-Jeton (le serveur
// n'en garde que l'empreinte SHA-256).
//
//   GET  /api/support/fil                → { messages: [{ auteur: 'client'|'admin'|'auto', texte, date }], resolu }  (les réponses deviennent lues)
//   GET  /api/support/nouveau            → { nonLus }   réponses de l'admin pas encore lues (pastille du logiciel)
//   POST /api/support/envoyer { texte }  → { messages, resolu }   429 si trop de messages

import { sessionValide, texte as octets, hex, sha256 } from '../../../serveur/comptes.js';

const TEXTE_MAX = 2000;
const MESSAGES_GARDES = 200; // par conversation : les plus anciens sont effacés au-delà
const PAR_HEURE = 20; // messages envoyés par adresse IP
const FORME_JETON = /^[A-Za-z0-9_-]{43}$/;
const REPONSE_AUTO = 'Je vous transfère au service client.\nMerci';

const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Support-Jeton',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};
const json = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { ...ENTETES, 'Content-Type': 'application/json' } });
const erreur = (message, statut) => json({ erreur: message }, statut);

// Qui écrit : { compte } ou { cle }, ou une réponse d'erreur (session expirée : 401, pour que la page s'en rende compte).
async function qui(request, env) {
  if (request.headers.has('Authorization')) {
    const s = await sessionValide(request, env);
    return s ? { compte: s.compte } : erreur('session expirée', 401);
  }
  const jeton = request.headers.get('X-Support-Jeton') || '';
  if (!FORME_JETON.test(jeton)) return erreur('jeton de conversation manquant', 400);
  return { cle: hex(await sha256(octets('boites-a-classer:support:' + jeton))) };
}

const filDe = (env, q) => (q.compte
  ? env.DB.prepare('SELECT * FROM support_fils WHERE compte = ?').bind(q.compte)
  : env.DB.prepare('SELECT * FROM support_fils WHERE cle = ?').bind(q.cle)).first();

async function messages(env, fil) {
  if (!fil) return { messages: [], resolu: false };
  const { results } = await env.DB.prepare('SELECT auteur, texte, date FROM support_messages WHERE fil = ? ORDER BY id').bind(fil.id).all();
  if (fil.non_lus_client) await env.DB.prepare('UPDATE support_fils SET non_lus_client = 0 WHERE id = ?').bind(fil.id).run();
  return { messages: results, resolu: !!fil.resolu };
}

// Limite par adresse IP (table limites des comptes, clé à part).
async function tropDeMessages(env, request) {
  const cle = hex(await sha256(octets('support:' + (request.headers.get('CF-Connecting-IP') || 'locale'))));
  const maintenant = new Date();
  const l = await env.DB.prepare('INSERT INTO limites (cle, nombre, fin) VALUES (?1, 1, ?2) ON CONFLICT (cle) DO UPDATE SET '
    + 'nombre = CASE WHEN fin > ?3 THEN nombre + 1 ELSE 1 END, fin = CASE WHEN fin > ?3 THEN fin ELSE ?2 END RETURNING nombre')
    .bind(cle, new Date(+maintenant + 3600 * 1000).toISOString(), maintenant.toISOString()).first();
  return l.nombre > PAR_HEURE;
}

const actions = {
  async fil(request, env, q) {
    return json(await messages(env, await filDe(env, q)));
  },

  async nouveau(request, env, q) {
    const fil = await filDe(env, q);
    return json({ nonLus: fil ? fil.non_lus_client : 0 });
  },

  async envoyer(request, env, q) {
    let corps = {};
    try { corps = await request.json(); } catch (e) { /* corps illisible */ }
    const t = typeof corps.texte === 'string' ? corps.texte.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
    if (!t) return erreur('écris ton message', 400);
    if (t.length > TEXTE_MAX) return erreur(`message trop long (${TEXTE_MAX} caractères au plus)`, 413);
    if (await tropDeMessages(env, request)) return erreur('trop de messages envoyés : réessaie dans une heure', 429);

    const date = new Date().toISOString();
    let fil = await filDe(env, q);
    const premier = !fil || !!fil.resolu; // nouvelle conversation, ou reprise après « résolu »
    if (!fil) {
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO support_fils (id, compte, cle, cree, maj) VALUES (?, ?, ?, ?, ?)')
        .bind(id, q.compte || null, q.cle || null, date, date).run();
      fil = { id };
    }
    await env.DB.batch([
      env.DB.prepare('INSERT INTO support_messages (fil, auteur, texte, date) VALUES (?, \'client\', ?, ?)').bind(fil.id, t, date),
      ...(premier ? [env.DB.prepare('INSERT INTO support_messages (fil, auteur, texte, date) VALUES (?, \'auto\', ?, ?)').bind(fil.id, REPONSE_AUTO, date)] : []),
      // Un nouveau message rouvre une conversation marquée « résolue ».
      env.DB.prepare('UPDATE support_fils SET maj = ?, resolu = 0, non_lus_admin = non_lus_admin + 1 WHERE id = ?').bind(date, fil.id),
      env.DB.prepare('DELETE FROM support_messages WHERE fil = ?1 AND id NOT IN '
        + '(SELECT id FROM support_messages WHERE fil = ?1 ORDER BY id DESC LIMIT ?2)').bind(fil.id, MESSAGES_GARDES),
    ]);
    return json(await messages(env, await filDe(env, q)));
  },
};

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
  const action = params.action;
  if (!Object.hasOwn(actions, action)) return erreur('action inconnue', 404);
  if (request.method !== (action === 'envoyer' ? 'POST' : 'GET')) return erreur('méthode non permise', 405);
  const q = await qui(request, env);
  if (q instanceof Response) return q;
  return actions[action](request, env, q);
}
