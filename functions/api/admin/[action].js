// API d'administration (page site/admin/), réservée aux comptes dont la colonne « admin » vaut 1 (migrations/0003_admin.sql).
// Le jeton de session voyage comme pour les comptes, dans « Authorization: Bearer … ».
//
//   GET  /api/admin/comptes                   → { stats, comptes: [{ identifiant, admin, enseignant, nom, classe, de, cree, derniere, versions, date, taille }] }
//                                               (élève : nom = prénom, classe = nom de sa classe, de = identifiant de son enseignant)
//   GET  /api/admin/travail?identifiant=…     dernière version du travail d'un compte (gzip, en-têtes X-Version et X-Date) ; 404 s'il n'y en a pas
//   POST /api/admin/mot-de-passe { identifiant, secret }  nouveau mot de passe (secret dérivé par la page) ; ferme ses sessions → 204
//   POST /api/admin/suppression  { identifiant }          efface le compte, ses sessions et son travail (enseignant : aussi
//                                                         ses classes et ses élèves) → 204
//   POST /api/admin/enseignant   { identifiant, actif }   donne (true) ou retire (false) le rôle enseignant → 204
//   POST /api/admin/collection   { collection }           ajoute ou remplace une collection du site (functions/api/collections.js) → 204
//   POST /api/admin/collection-suppression { id }         retire une collection du site → 204
//   GET  /api/admin/maintenance                           → { active }  le site est-il arrêté ? (serveur/maintenance.js)
//   POST /api/admin/maintenance  { active }               arrête (true) ou rouvre (false) le site → { active }
//
// Un compte admin ne peut pas être modifié ni supprimé par cette API (y compris le sien) : réglages du compte dans le logiciel.

import { sessionValide, texte, sha256, hasard } from '../../../serveur/comptes.js';
import { maintenanceActive, changerMaintenance } from '../../../serveur/maintenance.js';
import { effacerCompte } from '../../../serveur/classes.js';

const FORME_IDENTIFIANT = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const FORME_SECRET = /^[A-Za-z0-9_-]{43}$/;
const FORME_ID_COLLECTION = /^site-[A-Za-z0-9_-]{1,55}$/;
const TAILLE_MAX_COLLECTION = 1900000; // une valeur D1 ne peut pas dépasser 2 Mo

const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'X-Version, X-Date',
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

// Compte visé par une action : { id, admin, classe } ou une réponse d'erreur ; avec « modifier », pas un compte admin.
async function compteVise(env, identifiant, modifier) {
  if (!FORME_IDENTIFIANT.test(identifiant || '')) return erreur('identifiant invalide', 400);
  const c = await env.DB.prepare('SELECT id, admin, classe FROM comptes WHERE identifiant = ?').bind(identifiant).first();
  if (!c) return erreur('compte introuvable', 404);
  if (modifier && c.admin) return erreur('un compte admin ne se modifie pas d\'ici', 403);
  return c;
}

const actions = {
  async comptes(request, env) {
    const [stats, liste] = await env.DB.batch([
      env.DB.prepare('SELECT '
        + '(SELECT count(*) FROM comptes) AS comptes, '
        + '(SELECT count(DISTINCT cle) FROM sauvegardes WHERE cle NOT LIKE \'compte:%\') AS codes, '
        + '(SELECT count(*) FROM sauvegardes) AS versions, '
        + '(SELECT COALESCE(sum(length(donnees)), 0) FROM sauvegardes) AS taille, '
        + '(SELECT count(*) FROM sessions) AS sessions, '
        + '(SELECT count(*) FROM comptes WHERE est_enseignant = 1) AS enseignants, '
        + '(SELECT count(*) FROM classes) AS classes, '
        + '(SELECT count(*) FROM comptes WHERE classe IS NOT NULL) AS eleves'),
      env.DB.prepare('SELECT c.identifiant, c.admin, c.est_enseignant AS enseignant, c.nom, cl.nom AS classe, p.identifiant AS de, '
        + 'c.cree, c.derniere, count(s.version) AS versions, max(s.date) AS date, '
        + '(SELECT length(donnees) FROM sauvegardes WHERE cle = \'compte:\' || c.id ORDER BY version DESC LIMIT 1) AS taille '
        + 'FROM comptes c LEFT JOIN sauvegardes s ON s.cle = \'compte:\' || c.id '
        + 'LEFT JOIN classes cl ON cl.id = c.classe LEFT JOIN comptes p ON p.id = cl.enseignant '
        + 'GROUP BY c.id ORDER BY c.derniere DESC LIMIT 2000'),
    ]);
    return json({ stats: stats.results[0], comptes: liste.results });
  },

  async travail(request, env) {
    const c = await compteVise(env, new URL(request.url).searchParams.get('identifiant'), false);
    if (c instanceof Response) return c;
    const ligne = await env.DB.prepare('SELECT version, date, donnees FROM sauvegardes WHERE cle = ? ORDER BY version DESC LIMIT 1')
      .bind('compte:' + c.id).first();
    if (!ligne) return erreur('aucun travail sauvegardé', 404);
    return new Response(new Uint8Array(ligne.donnees), {
      headers: { ...ENTETES, 'Content-Type': 'application/octet-stream', 'X-Version': String(ligne.version), 'X-Date': ligne.date },
    });
  },

  async 'mot-de-passe'(request, env) {
    const { identifiant, secret } = await lireCorps(request);
    if (!FORME_SECRET.test(secret || '')) return erreur('mot de passe invalide', 400);
    const c = await compteVise(env, identifiant, true);
    if (c instanceof Response) return c;
    if (c.classe) return erreur('un élève se connecte avec un code : son enseignant lui en donne un nouveau', 400);
    const sel = hasard(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE comptes SET sel = ?, empreinte = ? WHERE id = ?')
        .bind(sel.buffer, (await sha256(sel, texte(secret))).buffer, c.id),
      env.DB.prepare('DELETE FROM sessions WHERE compte = ?').bind(c.id),
    ]);
    return rien();
  },

  async suppression(request, env) {
    const { identifiant } = await lireCorps(request);
    const c = await compteVise(env, identifiant, true);
    if (c instanceof Response) return c;
    await env.DB.batch(effacerCompte(env, c.id));
    return rien();
  },

  async enseignant(request, env) {
    const { identifiant, actif } = await lireCorps(request);
    if (typeof actif !== 'boolean') return erreur('« actif » doit valoir true ou false', 400);
    const c = await compteVise(env, identifiant, true);
    if (c instanceof Response) return c;
    if (c.classe) return erreur('un compte d\'élève ne peut pas devenir enseignant', 400);
    await env.DB.prepare('UPDATE comptes SET est_enseignant = ? WHERE id = ?').bind(actif ? 1 : 0, c.id).run();
    return rien();
  },

  // Le logiciel envoie une collection déjà vérifiée (nettoyerCollection dans app/app.js) et la revérifie à la lecture :
  // ici, on contrôle seulement sa forme générale et sa taille.
  async collection(request, env) {
    const { collection: c } = await lireCorps(request);
    if (!c || typeof c !== 'object' || !FORME_ID_COLLECTION.test(c.id || '') || typeof c.nom !== 'string'
      || !Array.isArray(c.attributs) || !Array.isArray(c.etres)) return erreur('collection illisible', 400);
    const donnees = JSON.stringify({ id: c.id, nom: c.nom, attributs: c.attributs, etres: c.etres });
    if (donnees.length > TAILLE_MAX_COLLECTION) return erreur('collection trop grosse (trop de photos)', 413);
    await env.DB.prepare('INSERT INTO collections (id, donnees, date) VALUES (?1, ?2, ?3) '
      + 'ON CONFLICT (id) DO UPDATE SET donnees = ?2, date = ?3').bind(c.id, donnees, new Date().toISOString()).run();
    return rien();
  },

  async 'collection-suppression'(request, env) {
    const { id } = await lireCorps(request);
    if (!FORME_ID_COLLECTION.test(id || '')) return erreur('identifiant de collection invalide', 400);
    await env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(id).run();
    return rien();
  },

  async maintenance(request, env) {
    if (request.method === 'POST') {
      const { active } = await lireCorps(request);
      if (typeof active !== 'boolean') return erreur('« active » doit valoir true ou false', 400);
      await changerMaintenance(env, active);
    }
    return json({ active: await maintenanceActive(env) });
  },
};

const METHODES = {
  comptes: ['GET'], travail: ['GET'], 'mot-de-passe': ['POST'], suppression: ['POST'], enseignant: ['POST'],
  collection: ['POST'], 'collection-suppression': ['POST'], maintenance: ['GET', 'POST'],
};

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return rien();
  const action = params.action;
  if (!Object.hasOwn(actions, action)) return erreur('action inconnue', 404);
  if (!METHODES[action].includes(request.method)) return erreur('méthode non permise', 405);
  const s = await sessionValide(request, env);
  if (!s) return erreur('session expirée', 401);
  const moi = await env.DB.prepare('SELECT admin FROM comptes WHERE id = ?').bind(s.compte).first();
  if (!moi || !moi.admin) return erreur('réservé aux administrateurs', 403);
  return actions[action](request, env);
}
