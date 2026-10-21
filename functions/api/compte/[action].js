// API des comptes de la sauvegarde en ligne (Cloudflare Pages Functions + base D1 « DB », tables dans migrations/0002_comptes.sql).
// Un compte = un identifiant (3 à 30 caractères : lettres sans accent, chiffres, . _ -) et un mot de passe.
// Le mot de passe ne quitte pas l'appareil : le logiciel en dérive un « secret » (PBKDF2-SHA256, 600 000 tours, sel tiré
// de l'identifiant) et n'envoie que lui. Le serveur garde SHA-256(sel au hasard + secret) : même avec la base, retrouver un
// mot de passe demande de refaire les 600 000 tours pour chaque essai.
//
//   POST /api/compte/inscription   { identifiant, secret }   → { identifiant, jeton }   409 si l'identifiant est déjà pris
//   POST /api/compte/connexion     { identifiant, secret }   → { identifiant, admin, abonne, enseignant, jeton }   401 si incorrect, 429 si trop d'essais
//   GET  /api/compte/session       (jeton)                   → { identifiant, admin, abonne, enseignant }   401 si la session n'est plus valable
//   GET  /api/compte/disponible?identifiant=…               → { disponible }   (page d'abonnement, avant de payer)
//   POST /api/compte/deconnexion   (jeton)                   → 204
//   POST /api/compte/mot-de-passe  (jeton) { secret, nouveau } → { jeton }  les autres sessions du compte sont fermées
//   POST /api/compte/suppression   (jeton) { secret }        → 204          efface le compte, ses sessions et son travail
//
// Le jeton voyage dans l'en-tête « Authorization: Bearer … » (voir serveur/comptes.js).

import {
  sessionValide, texte, hex, sha256, hasard, FORME_IDENTIFIANT, FORME_SECRET, empreinteSecret, secretCorrect, nouvelleSession, etatCompte,
} from '../../../serveur/comptes.js';

const QUART_HEURE = 15 * 60 * 1000;
// Une classe entière partage souvent la même adresse IP : les limites par adresse sont larges.
const LIMITES = {
  echecCompte: { max: 10, duree: QUART_HEURE },
  echecAdresse: { max: 100, duree: QUART_HEURE },
  inscriptionAdresse: { max: 100, duree: 4 * QUART_HEURE },
};

const ENTETES = {
  'Access-Control-Allow-Origin': '*', // l'application de bureau (http://localhost:47821) appelle aussi cette API
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

const json = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { ...ENTETES, 'Content-Type': 'application/json' } });
const rien = () => new Response(null, { status: 204, headers: ENTETES });
const erreur = (message, statut) => json({ erreur: message }, statut);

async function lireCorps(request) {
  try {
    const o = await request.json();
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

/* Compteurs anti-abus (table limites) */

const cleLimite = async (nom, valeur) => hex(await sha256(texte(nom + ':' + valeur)));
const adresse = (request) => request.headers.get('CF-Connecting-IP') || 'locale';

async function limiteAtteinte(env, nom, valeur) {
  const l = await env.DB.prepare('SELECT nombre FROM limites WHERE cle = ? AND fin > ?')
    .bind(await cleLimite(nom, valeur), new Date().toISOString()).first();
  return !!l && l.nombre >= LIMITES[nom].max;
}

async function compter(env, nom, valeur) {
  const maintenant = new Date();
  const fin = new Date(+maintenant + LIMITES[nom].duree).toISOString();
  return env.DB.prepare('INSERT INTO limites (cle, nombre, fin) VALUES (?1, 1, ?2) ON CONFLICT (cle) DO UPDATE SET '
    + 'nombre = CASE WHEN fin > ?3 THEN nombre + 1 ELSE 1 END, fin = CASE WHEN fin > ?3 THEN fin ELSE ?2 END')
    .bind(await cleLimite(nom, valeur), fin, maintenant.toISOString());
}

/* Actions */

async function inscription(request, env) {
  const { identifiant, secret } = await lireCorps(request);
  if (!FORME_IDENTIFIANT.test(identifiant || '')) return erreur('identifiant invalide', 400);
  if (!FORME_SECRET.test(secret || '')) return erreur('mot de passe invalide', 400);
  const ip = adresse(request);
  if (await limiteAtteinte(env, 'inscriptionAdresse', ip)) return erreur('trop de comptes créés, réessaie plus tard', 429);

  const id = crypto.randomUUID();
  const sel = hasard(16);
  const date = new Date().toISOString();
  const { jeton, requetes } = await nouvelleSession(env, id);
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO comptes (id, identifiant, sel, empreinte, cree, derniere) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, identifiant, sel.buffer, (await empreinteSecret(sel, secret)).buffer, date, date),
      ...requetes,
      await compter(env, 'inscriptionAdresse', ip),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return erreur('identifiant déjà pris', 409);
    throw e;
  }
  return json({ identifiant, jeton });
}

async function connexion(request, env) {
  const { identifiant, secret } = await lireCorps(request);
  if (!FORME_IDENTIFIANT.test(identifiant || '')) return erreur('identifiant ou mot de passe incorrect', 401);
  const ip = adresse(request);
  if (await limiteAtteinte(env, 'echecCompte', identifiant) || await limiteAtteinte(env, 'echecAdresse', ip)) {
    return erreur('trop d\'essais, réessaie dans un quart d\'heure', 429);
  }
  const ligne = await env.DB.prepare('SELECT id, sel, empreinte, admin FROM comptes WHERE identifiant = ?').bind(identifiant).first();
  if (!ligne || !(await secretCorrect(ligne, secret))) {
    await env.DB.batch([await compter(env, 'echecCompte', identifiant), await compter(env, 'echecAdresse', ip)]);
    return erreur('identifiant ou mot de passe incorrect', 401);
  }
  const { jeton, requetes } = await nouvelleSession(env, ligne.id);
  await env.DB.batch([
    ...requetes,
    env.DB.prepare('UPDATE comptes SET derniere = ? WHERE id = ?').bind(new Date().toISOString(), ligne.id),
  ]);
  return json({ ...(await etatCompte(env, ligne.id)), jeton });
}

// Actions qui demandent une session ouverte.
const avecSession = {
  async session(request, env, s) {
    const etat = await etatCompte(env, s.compte);
    return etat ? json(etat) : erreur('session expirée', 401);
  },

  async deconnexion(request, env, s) {
    await env.DB.prepare('DELETE FROM sessions WHERE jeton = ?').bind(s.jeton).run();
    return rien();
  },

  async 'mot-de-passe'(request, env, s) {
    const { secret, nouveau } = await lireCorps(request);
    if (!FORME_SECRET.test(nouveau || '')) return erreur('nouveau mot de passe invalide', 400);
    const ligne = await env.DB.prepare('SELECT sel, empreinte FROM comptes WHERE id = ?').bind(s.compte).first();
    if (!ligne) return erreur('session expirée', 401);
    if (!(await secretCorrect(ligne, secret))) return erreur('mot de passe actuel incorrect', 403);
    const sel = hasard(16);
    const { jeton, requetes } = await nouvelleSession(env, s.compte);
    await env.DB.batch([
      env.DB.prepare('UPDATE comptes SET sel = ?, empreinte = ? WHERE id = ?')
        .bind(sel.buffer, (await empreinteSecret(sel, nouveau)).buffer, s.compte),
      env.DB.prepare('DELETE FROM sessions WHERE compte = ?').bind(s.compte), // toutes, y compris celle-ci
      ...requetes,
    ]);
    return json({ jeton });
  },

  async suppression(request, env, s) {
    const { secret } = await lireCorps(request);
    const ligne = await env.DB.prepare('SELECT sel, empreinte FROM comptes WHERE id = ?').bind(s.compte).first();
    if (!ligne) return erreur('session expirée', 401);
    if (!(await secretCorrect(ligne, secret))) return erreur('mot de passe incorrect', 403);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sauvegardes WHERE cle = ?').bind('compte:' + s.compte),
      env.DB.prepare('DELETE FROM sessions WHERE compte = ?').bind(s.compte),
      env.DB.prepare('UPDATE comptes SET enseignant = NULL WHERE enseignant = ?').bind(s.compte),
      env.DB.prepare('DELETE FROM comptes WHERE id = ?').bind(s.compte),
    ]);
    return rien();
  },
};

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return rien();
  const action = params.action;
  if (!['inscription', 'connexion', 'disponible'].includes(action) && !Object.hasOwn(avecSession, action)) return erreur('action inconnue', 404);
  if (request.method !== (action === 'session' || action === 'disponible' ? 'GET' : 'POST')) return erreur('méthode non permise', 405);
  if (action === 'inscription') return inscription(request, env);
  if (action === 'connexion') return connexion(request, env);
  if (action === 'disponible') {
    const id = new URL(request.url).searchParams.get('identifiant') || '';
    if (!FORME_IDENTIFIANT.test(id)) return erreur('identifiant invalide', 400);
    return json({ disponible: !(await env.DB.prepare('SELECT 1 FROM comptes WHERE identifiant = ?').bind(id).first()) });
  }
  const s = await sessionValide(request, env);
  if (!s) return erreur('session expirée', 401);
  return avecSession[action](request, env, s);
}
