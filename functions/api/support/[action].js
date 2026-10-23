// Service client, côté visiteur (page site/aide/). L'admin lit et répond depuis la page site/admin/ (functions/api/admin/).
// Tables dans migrations/0008_support.sql.
//
// Robot (serveur/robot.js) : quand il est en service, il répond tout de suite à chaque message, sauf si la conversation
// est passée à l'administrateur (dernier message hors visiteur = réponse de l'admin ou note de transfert) et pas
// marquée résolue depuis. Il transmet lui-même quand il faut une personne ; le visiteur peut aussi le demander
// (POST /api/support/humain). Les messages du robot ont l'auteur 'robot', les notes de transfert l'auteur 'note' ; seuls
// les messages qui attendent l'admin comptent dans ses non-lus.
//
// Chacun a une seule conversation : celle de son compte s'il est connecté (Authorization: Bearer …), sinon celle de son
// navigateur, reconnue par un jeton tiré au hasard par la page et envoyé dans l'en-tête X-Support-Jeton (le serveur
// n'en garde que l'empreinte SHA-256).
//
//   GET  /api/support/fil                → { messages: [{ auteur: 'client'|'admin'|'robot'|'note', texte, date }], resolu, robot, humain }
//                                          (les réponses deviennent lues ; robot : le robot est en service ; humain : la
//                                          conversation attend l'administrateur)
//   GET  /api/support/nouveau            → { nonLus }   réponses de l'admin pas encore lues (pastille du logiciel)
//   POST /api/support/envoyer { texte }  → comme fil, avec la réponse du robot s'il répond   429 si trop de messages
//   POST /api/support/humain             → comme fil : la conversation passe à l'administrateur

import { sessionValide, texte as octets, hex, sha256 } from '../../../serveur/comptes.js';
import { robotActif, repondre, NOTE_TRANSFERT, NOTE_DEMANDE, NOTE_PANNE } from '../../../serveur/robot.js';

const TEXTE_MAX = 2000;
const MESSAGES_GARDES = 200; // par conversation : les plus anciens sont effacés au-delà
const PAR_HEURE = 20; // messages envoyés par adresse IP
const FORME_JETON = /^[A-Za-z0-9_-]{43}$/;

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

// La conversation attend-elle l'administrateur ? (dernier message hors visiteur : réponse de l'admin ou note de transfert)
async function avecHumain(env, id) {
  const m = await env.DB.prepare('SELECT auteur FROM support_messages WHERE fil = ? AND auteur != \'client\' ORDER BY id DESC LIMIT 1')
    .bind(id).first();
  return !!m && (m.auteur === 'admin' || m.auteur === 'note');
}

async function messages(env, fil) {
  const robot = await robotActif(env);
  if (!fil) return { messages: [], resolu: false, robot, humain: false };
  const { results } = await env.DB.prepare('SELECT auteur, texte, date FROM support_messages WHERE fil = ? ORDER BY id').bind(fil.id).all();
  if (fil.non_lus_client) await env.DB.prepare('UPDATE support_fils SET non_lus_client = 0 WHERE id = ?').bind(fil.id).run();
  return { messages: results, resolu: !!fil.resolu, robot, humain: !fil.resolu && await avecHumain(env, fil.id) };
}

async function nouveauFil(env, q, date) {
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO support_fils (id, compte, cle, cree, maj) VALUES (?, ?, ?, ?, ?)')
    .bind(id, q.compte || null, q.cle || null, date, date).run();
  return { id };
}

// Note de transfert : la conversation passe à l'administrateur, qui la voit en non lue.
const noter = (env, id, texte, date) => [
  env.DB.prepare('INSERT INTO support_messages (fil, auteur, texte, date) VALUES (?, \'note\', ?, ?)').bind(id, texte, date),
  env.DB.prepare('UPDATE support_fils SET maj = ?, resolu = 0, non_lus_admin = non_lus_admin + 1 WHERE id = ?').bind(date, id),
];

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
    // Le robot répond si la conversation est nouvelle, résolue (elle repart de zéro) ou déjà entre ses mains.
    const parRobot = await robotActif(env) && (!fil || !!fil.resolu || !await avecHumain(env, fil.id));
    if (!fil) fil = await nouveauFil(env, q, date);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO support_messages (fil, auteur, texte, date) VALUES (?, \'client\', ?, ?)').bind(fil.id, t, date),
      // Un nouveau message rouvre une conversation marquée « résolue ». Il n'attend l'admin que si le robot ne répond pas.
      env.DB.prepare('UPDATE support_fils SET maj = ?, resolu = 0, non_lus_admin = non_lus_admin + ? WHERE id = ?').bind(date, parRobot ? 0 : 1, fil.id),
      env.DB.prepare('DELETE FROM support_messages WHERE fil = ?1 AND id NOT IN '
        + '(SELECT id FROM support_messages WHERE fil = ?1 ORDER BY id DESC LIMIT ?2)').bind(fil.id, MESSAGES_GARDES),
    ]);

    if (parRobot) {
      let r = null;
      try {
        r = await repondre(env, fil.id, q.compte);
      } catch (e) {
        console.error('robot du service client :', e);
      }
      const apres = new Date().toISOString();
      const ecritures = [];
      if (r && r.texte) {
        ecritures.push(
          env.DB.prepare('INSERT INTO support_messages (fil, auteur, texte, date) VALUES (?, \'robot\', ?, ?)').bind(fil.id, r.texte, apres),
          env.DB.prepare('UPDATE support_fils SET maj = ? WHERE id = ?').bind(apres, fil.id),
        );
      }
      // Pas de réponse (panne, limite) ou transfert demandé par le robot : l'admin prend le relais.
      if (!r) ecritures.push(...noter(env, fil.id, NOTE_PANNE, apres));
      else if (r.transfere) ecritures.push(...noter(env, fil.id, NOTE_TRANSFERT, apres));
      if (ecritures.length) await env.DB.batch(ecritures);
    }
    return json(await messages(env, await filDe(env, q)));
  },

  // « Parler à une personne » : la conversation passe à l'administrateur sans attendre le robot.
  async humain(request, env, q) {
    const date = new Date().toISOString();
    const fil = await filDe(env, q) || await nouveauFil(env, q, date);
    if (!await avecHumain(env, fil.id) || fil.resolu) await env.DB.batch(noter(env, fil.id, NOTE_DEMANDE, date));
    return json(await messages(env, await filDe(env, q)));
  },
};

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
  const action = params.action;
  if (!Object.hasOwn(actions, action)) return erreur('action inconnue', 404);
  if (request.method !== (action === 'envoyer' || action === 'humain' ? 'POST' : 'GET')) return erreur('méthode non permise', 405);
  const q = await qui(request, env);
  if (q instanceof Response) return q;
  return actions[action](request, env, q);
}
