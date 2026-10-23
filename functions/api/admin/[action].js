// API d'administration (page site/admin/), réservée aux comptes dont la colonne « admin » vaut 1 (migrations/0003_admin.sql).
// Le jeton de session voyage comme pour les comptes, dans « Authorization: Bearer … ».
//
//   GET  /api/admin/comptes                   → { stats, comptes: [{ identifiant, admin, enseignant, nom, badges, avatar, avatar_fond, classe, de, cree, derniere, versions, date, taille }] }
//                                               (élève : nom = prénom, classe = nom de sa classe, de = identifiant de son enseignant)
//   GET  /api/admin/travail?identifiant=…     dernière version du travail d'un compte (gzip, en-têtes X-Version et X-Date) ; 404 s'il n'y en a pas
//   POST /api/admin/mot-de-passe { identifiant, secret }  nouveau mot de passe (secret dérivé par la page) ; ferme ses sessions → 204
//   POST /api/admin/suppression  { identifiant }          efface le compte, ses sessions et son travail (enseignant : aussi
//                                                         ses classes et ses élèves) → 204
//   POST /api/admin/enseignant   { identifiant, actif }   donne (true) ou retire (false) le rôle enseignant → 204
//   POST /api/admin/avatar       { identifiant, avatar, avatar_fond }  photo de profil : un emoji, ou null pour l'enlever (aussi
//                                                         pour un compte admin) → 204  (migrations/0012_avatar.sql) ; avatar_fond, facultatif :
//                                                         couleur du rond (FONDS_AVATAR, null = par défaut, migrations/0013_avatar_fond.sql),
//                                                         gardée s'il manque, effacée avec la photo
//   POST /api/admin/avatars      { photos: [{ identifiant, avatar, avatar_fond }] }  la même chose pour 1 à 500 comptes d'un
//                                                         coup (tout est vérifié avant d'écrire) → { changes }  comptes modifiés
//   GET  /api/admin/collections               → { collections: [{ id, nom, auteur, date, elements }] }  collections du site et leur auteur
//   POST /api/admin/collection   { collection }           ajoute ou remplace une collection du site (functions/api/collections.js) → 204
//   POST /api/admin/collection-suppression { id }         retire une collection du site → 204
//   GET  /api/admin/support                    → { fils: [{ id, qui, detail, anonyme, resolu, maj, non_lus, dernier }] }  service client
//   GET  /api/admin/support-non-lus           → { nonLus }   messages des visiteurs pas encore lus (pastille du logiciel)
//   GET  /api/admin/support-fil?id=…           → { messages: [{ auteur, texte, date }] }   (les messages du visiteur deviennent lus)
//   POST /api/admin/support-reponse { id, texte } répond au visiteur → { messages }
//   POST /api/admin/support-resolu  { id, resolu } marque la conversation résolue (ou non) → 204
//   POST /api/admin/support-suppression { id }  efface la conversation → 204
//   GET  /api/admin/maintenance                           → { active }  le site est-il arrêté ? (serveur/maintenance.js)
//   POST /api/admin/maintenance  { active }               arrête (true) ou rouvre (false) le site → { active }
//   GET  /api/admin/evenement                             → { evenement: { nom, depuis } | null, fini: { nom, depuis, fin } | null,
//                                                         boss: { pv, max, vaincu, chasseurs, gagnant } | null, total, seuil }
//                                                         + programme [{ evenement, debut, fin, lance, arrete }], maintenant (Paris)
//   POST /api/admin/evenement    { nom }                  déclenche l'événement (« halloween », classement remis à zéro) ou
//                                                         l'arrête (null, classement gardé) → comme GET  (serveur/evenement.js)
//   POST /api/admin/evenement    { programme }            événements à déclencher et arrêter tout seuls (debut et fin en
//                                                         « AAAA-MM-JJTHH:MM », heure de Paris) → comme GET
//   GET  /api/admin/theme                                 → { theme, nom, choisi, programme, periode, jour, themes }  thème du
//                                                         site en ce moment (serveur/theme.js), thème choisi hors des périodes
//                                                         programmées, programme [{ theme, du, au }], période en cours, jour à Paris
//   POST /api/admin/theme        { theme } | { programme } « halloween », « noel » ou « normal » : décor de l'accueil, couleurs du
//                                                         logiciel et nom du site, suivis par les pages ouvertes ; ou le
//                                                         programme entier (dates « AAAA-MM-JJ », jours compris) → comme GET
//   GET  /api/admin/classement                            → { participants, top: [{ nom, avatar, avatar_fond, identifiant, eleve, points }] }
//                                                         classement du dernier événement (en direct pendant l'événement)
//
// Un compte admin ne peut pas être modifié ni supprimé par cette API (y compris le sien) : réglages du compte dans le logiciel.

import { sessionValide, texte, sha256, hasard } from '../../../serveur/comptes.js';
import { maintenanceActive, changerMaintenance } from '../../../serveur/maintenance.js';
import { EVENEMENTS, lireEtat, changerEvenement, classement, oublierCache, SEUIL_BOSS, lireProgrammeEvenements, changerProgrammeEvenements } from '../../../serveur/evenement.js';
import { effacerCompte } from '../../../serveur/classes.js';
import { THEMES, lireReglageTheme, periodeDuJour, changerTheme, verifierProgramme, changerProgramme } from '../../../serveur/theme.js';
import { jourParis, minuteParis } from '../../../serveur/programme.js';

const FORME_IDENTIFIANT = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const FORME_SECRET = /^[A-Za-z0-9_-]{43}$/;
const FORME_ID_COLLECTION = /^site-[A-Za-z0-9_-]{1,55}$/;
const FORME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Un seul emoji (avec sa teinte de peau, ou fait de plusieurs joints comme 🧑‍🏫) : jamais de texte libre.
const FORME_AVATAR = /^(?=.{1,24}$)\p{Extended_Pictographic}\ufe0f?\p{Emoji_Modifier}?(\u200d\p{Extended_Pictographic}\ufe0f?\p{Emoji_Modifier}?)*$/u;
// Couleurs du rond de la photo (dessin\u00e9es par app/profil.css, [data-fond], et propos\u00e9es par site/admin/).
const FONDS_AVATAR = ['bleu', 'vert', 'jaune', 'orange', 'rouge', 'rose', 'violet', 'nuit'];
const PHOTOS_MAX = 500;
const TEXTE_MAX = 2000;
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

// Photo de profil envoyée par la page : { avatar, avatar_fond } ; renvoie le défaut trouvé, ou null.
function photoInvalide({ avatar, avatar_fond: fond }) {
  if (avatar !== null && !FORME_AVATAR.test(avatar || '')) return 'la photo de profil doit être un emoji';
  if (fond !== undefined && fond !== null && !FONDS_AVATAR.includes(fond)) return 'couleur du rond inconnue';
  return null;
}
// Sans photo, pas de couleur ; avatar_fond absent : la couleur d'avant reste.
const majPhoto = (env, { identifiant, avatar, avatar_fond: fond }) => env.DB.prepare('UPDATE comptes SET avatar = ?1, '
  + 'avatar_fond = CASE WHEN ?1 IS NULL THEN NULL WHEN ?2 = 1 THEN ?3 ELSE avatar_fond END WHERE identifiant = ?4')
  .bind(avatar, fond === undefined ? 0 : 1, fond === undefined ? null : fond, identifiant);

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
        + '(SELECT count(*) FROM comptes WHERE classe IS NOT NULL) AS eleves, '
        + '(SELECT COALESCE(sum(non_lus_admin), 0) FROM support_fils) AS support_non_lus'),
      env.DB.prepare('SELECT c.identifiant, c.admin, c.est_enseignant AS enseignant, c.nom, c.badges, c.avatar, c.avatar_fond, cl.nom AS classe, p.identifiant AS de, '
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

  async avatar(request, env) {
    const photo = await lireCorps(request);
    const faux = photoInvalide(photo);
    if (faux) return erreur(faux, 400);
    const c = await compteVise(env, photo.identifiant, false);
    if (c instanceof Response) return c;
    await majPhoto(env, photo).run();
    oublierCache(); // classements et gagnant du boss
    return rien();
  },

  // Plusieurs comptes d'un coup (page admin : « Photos en série »). Un identifiant inconnu est passé sans erreur.
  async avatars(request, env) {
    const { photos } = await lireCorps(request);
    if (!Array.isArray(photos) || !photos.length || photos.length > PHOTOS_MAX) return erreur(`envoie de 1 à ${PHOTOS_MAX} photos`, 400);
    for (const p of photos) {
      const faux = !p || typeof p !== 'object' ? 'photo illisible' : !FORME_IDENTIFIANT.test(p.identifiant || '') ? 'identifiant invalide' : photoInvalide(p);
      if (faux) return erreur(faux + (p && typeof p.identifiant === 'string' ? ' (' + p.identifiant.slice(0, 30) + ')' : ''), 400);
    }
    const resultats = await env.DB.batch(photos.map((p) => majPhoto(env, p)));
    oublierCache();
    return json({ changes: resultats.reduce((n, r) => n + (r.meta && r.meta.changes || 0), 0) });
  },

  // Le logiciel envoie une collection déjà vérifiée (nettoyerCollection dans app/app.js) et la revérifie à la lecture :
  // ici, on contrôle seulement sa forme générale et sa taille.
  async collection(request, env) {
    const { collection: c } = await lireCorps(request);
    if (!c || typeof c !== 'object' || !FORME_ID_COLLECTION.test(c.id || '') || typeof c.nom !== 'string'
      || !Array.isArray(c.attributs) || !Array.isArray(c.etres)) return erreur('collection illisible', 400);
    const donnees = JSON.stringify({ id: c.id, nom: c.nom, ...(typeof c.matiere === 'string' && /^[a-z]{2,20}$/.test(c.matiere) ? { matiere: c.matiere } : {}),
      attributs: c.attributs, etres: c.etres });
    if (donnees.length > TAILLE_MAX_COLLECTION) return erreur('collection trop grosse (trop de photos)', 413);
    await env.DB.prepare('INSERT INTO collections (id, donnees, date) VALUES (?1, ?2, ?3) '
      + 'ON CONFLICT (id) DO UPDATE SET donnees = ?2, date = ?3').bind(c.id, donnees, new Date().toISOString()).run();
    return rien();
  },

  async collections(request, env) {
    const { results } = await env.DB.prepare('SELECT c.id, c.date, c.donnees, a.identifiant AS auteur FROM collections c '
      + 'LEFT JOIN comptes a ON a.id = c.auteur ORDER BY c.date DESC LIMIT 500').all();
    return json({
      collections: results.map((c) => {
        let d = {};
        try { d = JSON.parse(c.donnees); } catch (e) { /* illisible */ }
        return { id: c.id, nom: d.nom || c.id, auteur: c.auteur || null, date: c.date, elements: Array.isArray(d.etres) ? d.etres.length : 0 };
      }),
    });
  },

  async 'collection-suppression'(request, env) {
    const { id } = await lireCorps(request);
    if (!FORME_ID_COLLECTION.test(id || '')) return erreur('identifiant de collection invalide', 400);
    await env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(id).run();
    return rien();
  },

  async support(request, env) {
    const { results } = await env.DB.prepare('SELECT f.id, f.compte, f.resolu, f.maj, f.non_lus_admin AS non_lus, '
      + 'c.identifiant, c.nom, c.avatar, cl.nom AS classe, p.identifiant AS de, '
      + '(SELECT texte FROM support_messages WHERE fil = f.id ORDER BY id DESC LIMIT 1) AS dernier, '
      + '(SELECT auteur FROM support_messages WHERE fil = f.id ORDER BY id DESC LIMIT 1) AS dernier_auteur '
      + 'FROM support_fils f LEFT JOIN comptes c ON c.id = f.compte LEFT JOIN classes cl ON cl.id = c.classe '
      + 'LEFT JOIN comptes p ON p.id = cl.enseignant ORDER BY f.resolu, f.maj DESC LIMIT 500').all();
    return json({
      fils: results.map((f) => ({
        id: f.id,
        anonyme: !f.compte,
        qui: f.compte ? (f.avatar ? f.avatar + ' ' : '') + (f.classe ? f.nom : f.identifiant) : 'Visiteur sans compte n° ' + f.id.slice(0, 4),
        detail: f.classe ? `élève · ${f.classe} (${f.de || '?'})` : '',
        resolu: !!f.resolu, maj: f.maj, non_lus: f.non_lus,
        dernier: (f.dernier_auteur === 'admin' ? 'Vous : ' : '') + String(f.dernier || '').slice(0, 140),
      })),
    });
  },

  async 'support-non-lus'(request, env) {
    const r = await env.DB.prepare('SELECT COALESCE(sum(non_lus_admin), 0) AS n FROM support_fils').first();
    return json({ nonLus: r.n });
  },

  async 'support-fil'(request, env) {
    const id = new URL(request.url).searchParams.get('id');
    if (!FORME_ID.test(id || '')) return erreur('conversation introuvable', 404);
    const { results } = await env.DB.prepare('SELECT auteur, texte, date FROM support_messages WHERE fil = ? ORDER BY id').bind(id).all();
    await env.DB.prepare('UPDATE support_fils SET non_lus_admin = 0 WHERE id = ?').bind(id).run();
    return json({ messages: results });
  },

  async 'support-reponse'(request, env) {
    const { id, texte } = await lireCorps(request);
    if (!FORME_ID.test(id || '')) return erreur('conversation introuvable', 404);
    const t = typeof texte === 'string' ? texte.replace(/\r\n?/g, '\n').trim() : '';
    if (!t || t.length > TEXTE_MAX) return erreur(`réponse vide ou trop longue (${TEXTE_MAX} caractères au plus)`, 400);
    const date = new Date().toISOString();
    const [, maj] = await env.DB.batch([
      env.DB.prepare('INSERT INTO support_messages (fil, auteur, texte, date) SELECT id, \'admin\', ?, ? FROM support_fils WHERE id = ?').bind(t, date, id),
      env.DB.prepare('UPDATE support_fils SET maj = ?, non_lus_client = non_lus_client + 1, non_lus_admin = 0 WHERE id = ?').bind(date, id),
    ]);
    if (!maj.meta.changes) return erreur('conversation introuvable', 404);
    const { results } = await env.DB.prepare('SELECT auteur, texte, date FROM support_messages WHERE fil = ? ORDER BY id').bind(id).all();
    return json({ messages: results });
  },

  async 'support-resolu'(request, env) {
    const { id, resolu } = await lireCorps(request);
    if (!FORME_ID.test(id || '') || typeof resolu !== 'boolean') return erreur('demande invalide', 400);
    await env.DB.prepare('UPDATE support_fils SET resolu = ? WHERE id = ?').bind(resolu ? 1 : 0, id).run();
    return rien();
  },

  async 'support-suppression'(request, env) {
    const { id } = await lireCorps(request);
    if (!FORME_ID.test(id || '')) return erreur('conversation introuvable', 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM support_messages WHERE fil = ?').bind(id),
      env.DB.prepare('DELETE FROM support_fils WHERE id = ?').bind(id),
    ]);
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

  async evenement(request, env) {
    if (request.method === 'POST') {
      const corps = await lireCorps(request);
      if ('programme' in corps) {
        if (!(await changerProgrammeEvenements(env, corps.programme))) {
          return erreur('programme invalide : [{ evenement, debut, fin }], dates « AAAA-MM-JJTHH:MM », debut < fin, 20 au plus', 400);
        }
      } else {
        if (corps.nom !== null && !EVENEMENTS.includes(corps.nom)) return erreur('« nom » doit valoir ' + EVENEMENTS.join(', ') + ' ou null', 400);
        await changerEvenement(env, corps.nom);
      }
    }
    const { evenement: v, boss, total } = await lireEtat(env);
    return json({ evenement: v && !v.fin ? v : null, fini: v && v.fin ? v : null, boss, total, seuil: SEUIL_BOSS,
      programme: await lireProgrammeEvenements(env), maintenant: minuteParis() });
  },

  async theme(request, env) {
    if (request.method === 'POST') {
      const corps = await lireCorps(request);
      if ('programme' in corps) {
        const programme = verifierProgramme(corps.programme);
        if (!programme) return erreur('programme invalide : [{ theme, du, au }], dates « AAAA-MM-JJ », du ≤ au, 20 périodes au plus', 400);
        await changerProgramme(env, programme);
      } else {
        if (!Object.hasOwn(THEMES, corps.theme || '')) return erreur('« theme » doit valoir ' + Object.keys(THEMES).join(', '), 400);
        await changerTheme(env, corps.theme);
      }
    }
    const { choisi, programme } = await lireReglageTheme(env);
    const jour = jourParis(), periode = periodeDuJour(programme, jour), theme = periode ? periode.theme : choisi;
    return json({ theme, nom: THEMES[theme].nom, choisi, programme, periode, jour, themes: THEMES });
  },

  async classement(request, env) {
    const v = (await lireEtat(env)).evenement;
    if (!v) return json({ participants: 0, top: [] });
    const c = await classement(env, v.depuis, 50);
    const ids = c.top.map((t) => t.compte);
    const { results } = ids.length
      ? await env.DB.prepare(`SELECT id, identifiant FROM comptes WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()
      : { results: [] };
    const identifiants = new Map(results.map((r) => [r.id, r.identifiant]));
    return json({ participants: c.participants, top: c.top.map((t) => ({ nom: t.nom, avatar: t.avatar, avatar_fond: t.avatar_fond, identifiant: identifiants.get(t.compte), eleve: t.eleve, points: t.points })) });
  },
};

const METHODES = {
  comptes: ['GET'], travail: ['GET'], 'mot-de-passe': ['POST'], suppression: ['POST'], enseignant: ['POST'], avatar: ['POST'], avatars: ['POST'],
  support: ['GET'], 'support-non-lus': ['GET'], 'support-fil': ['GET'], 'support-reponse': ['POST'], 'support-resolu': ['POST'], 'support-suppression': ['POST'],
  collection: ['POST'], 'collection-suppression': ['POST'], collections: ['GET'], maintenance: ['GET', 'POST'],
  evenement: ['GET', 'POST'], theme: ['GET', 'POST'], classement: ['GET'],
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
