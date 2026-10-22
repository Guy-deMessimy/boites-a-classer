// API des classes (page site/classe/), réservée aux enseignants (comptes.est_enseignant, donné par un admin) et aux admins.
// Voir serveur/classes.js. Un enseignant ne voit et ne modifie que ses classes et leurs élèves.
//
//   GET  /api/classe/liste                       → { classes: [{ id, nom, cree, eleves, exercices }] }
//   POST /api/classe/creer         { nom }       → { id, nom }
//   POST /api/classe/renommer      { classe, nom } → 204
//   POST /api/classe/exercices     { classe, ids: [id de collection…] } exercices donnés à la classe (30 au plus) → 204
//   POST /api/classe/suppression   { classe }    efface la classe, les comptes de ses élèves et leur travail → 204
//   GET  /api/classe/eleves?classe=…             → { classe: { id, nom }, eleves: [{ id, nom, avatar, badges, cree, derniere, versions, date }] }
//   POST /api/classe/ajouter       { classe, noms: [prénom…] } → { eleves: [{ id, nom, code }] }   codes montrés une seule fois
//   POST /api/classe/nouveau-code  { eleve }     → { id, nom, code }   l'ancien code ne marche plus, ses appareils sont déconnectés
//   POST /api/classe/nouveaux-codes { classe }   → { eleves: [{ id, nom, code }] }   la même chose pour toute la classe
//   POST /api/classe/nom-eleve     { eleve, nom } → 204
//   POST /api/classe/deplacer      { eleve, classe } l'élève passe dans une autre de ses classes (code et travail gardés) → 204
//   POST /api/classe/retirer       { eleve }     efface le compte de l'élève et son travail → 204
//   GET  /api/classe/travail?eleve=…             dernière version du travail (gzip, en-têtes X-Version, X-Date, X-Nom) ; 404 s'il n'y en a pas

import { sessionValide, hasard } from '../../../serveur/comptes.js';
import { lireBadges } from '../../../serveur/evenement.js';
import { nouveauCodeEleve, identifiantEleve, empreinteCode, effacerCompte, effacerClasse, lireExercices, FORME_ID_COLLECTION } from '../../../serveur/classes.js';

const CLASSES_MAX = 30; // par enseignant
const ELEVES_MAX = 60; // par classe
const FORME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'X-Version, X-Date, X-Nom',
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

// Nom de classe ou prénom : sans caractères de contrôle ni espaces en trop, 40 caractères au plus.
const nomPropre = (t) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : '');

// Une classe (ou un élève) de l'enseignant connecté, ou une réponse d'erreur.
async function maClasse(env, moi, id) {
  if (!FORME_ID.test(id || '')) return erreur('classe introuvable', 404);
  const c = await env.DB.prepare('SELECT id, nom FROM classes WHERE id = ? AND enseignant = ?').bind(id, moi).first();
  return c || erreur('classe introuvable', 404);
}
async function monEleve(env, moi, id) {
  if (!FORME_ID.test(id || '')) return erreur('élève introuvable', 404);
  const e = await env.DB.prepare('SELECT e.id, e.nom, e.classe FROM comptes e JOIN classes c ON c.id = e.classe '
    + 'WHERE e.id = ? AND c.enseignant = ?').bind(id, moi).first();
  return e || erreur('élève introuvable', 404);
}

// Nouveaux codes pour des élèves : requêtes à exécuter et codes à montrer. Changer le code ferme les sessions de l'élève.
async function nouveauxCodes(env, eleves) {
  const requetes = [];
  const codes = [];
  for (const e of eleves) {
    const code = nouveauCodeEleve();
    codes.push({ id: e.id, nom: e.nom, code });
    requetes.push(env.DB.prepare('UPDATE comptes SET code_eleve = ? WHERE id = ?').bind(await empreinteCode(code), e.id),
      env.DB.prepare('DELETE FROM sessions WHERE compte = ?').bind(e.id));
  }
  return { requetes, codes };
}

// Deux codes identiques sont presque impossibles (31⁸ possibilités) ; l'index unique les refuserait : on retente.
async function avecCodes(fabriquer) {
  for (let essai = 1; ; essai++) {
    try {
      return await fabriquer();
    } catch (e) {
      if (essai >= 3 || !/UNIQUE/i.test(String(e && e.message))) throw e;
    }
  }
}

const actions = {
  async liste(request, env, moi) {
    const { results } = await env.DB.prepare('SELECT c.id, c.nom, c.cree, c.exercices, count(e.id) AS eleves FROM classes c '
      + 'LEFT JOIN comptes e ON e.classe = c.id WHERE c.enseignant = ? GROUP BY c.id ORDER BY c.nom COLLATE NOCASE').bind(moi).all();
    return json({ classes: results.map((c) => ({ ...c, exercices: lireExercices(c.exercices) })) });
  },

  async creer(request, env, moi) {
    const nom = nomPropre((await lireCorps(request)).nom);
    if (!nom) return erreur('donne un nom à la classe', 400);
    const { n } = await env.DB.prepare('SELECT count(*) AS n FROM classes WHERE enseignant = ?').bind(moi).first();
    if (n >= CLASSES_MAX) return erreur(`${CLASSES_MAX} classes au plus`, 409);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO classes (id, enseignant, nom, cree) VALUES (?, ?, ?, ?)').bind(id, moi, nom, new Date().toISOString()).run();
    return json({ id, nom });
  },

  async renommer(request, env, moi) {
    const corps = await lireCorps(request);
    const c = await maClasse(env, moi, corps.classe);
    if (c instanceof Response) return c;
    const nom = nomPropre(corps.nom);
    if (!nom) return erreur('donne un nom à la classe', 400);
    await env.DB.prepare('UPDATE classes SET nom = ? WHERE id = ?').bind(nom, c.id).run();
    return rien();
  },

  async exercices(request, env, moi) {
    const corps = await lireCorps(request);
    const c = await maClasse(env, moi, corps.classe);
    if (c instanceof Response) return c;
    if (!Array.isArray(corps.ids) || corps.ids.length > 30 || !corps.ids.every((id) => typeof id === 'string' && FORME_ID_COLLECTION.test(id))) {
      return erreur('liste d\'exercices invalide (30 au plus)', 400);
    }
    await env.DB.prepare('UPDATE classes SET exercices = ? WHERE id = ?').bind(JSON.stringify([...new Set(corps.ids)]), c.id).run();
    return rien();
  },

  async suppression(request, env, moi) {
    const c = await maClasse(env, moi, (await lireCorps(request)).classe);
    if (c instanceof Response) return c;
    await env.DB.batch(effacerClasse(env, c.id));
    return rien();
  },

  async eleves(request, env, moi) {
    const c = await maClasse(env, moi, new URL(request.url).searchParams.get('classe'));
    if (c instanceof Response) return c;
    const { results } = await env.DB.prepare('SELECT e.id, e.nom, e.avatar, e.badges, e.cree, e.derniere, count(s.version) AS versions, max(s.date) AS date '
      + 'FROM comptes e LEFT JOIN sauvegardes s ON s.cle = \'compte:\' || e.id '
      + 'WHERE e.classe = ? GROUP BY e.id ORDER BY e.nom COLLATE NOCASE').bind(c.id).all();
    return json({ classe: c, eleves: results.map((e) => ({ ...e, badges: lireBadges(e.badges) })) });
  },

  async ajouter(request, env, moi) {
    const corps = await lireCorps(request);
    const c = await maClasse(env, moi, corps.classe);
    if (c instanceof Response) return c;
    const noms = (Array.isArray(corps.noms) ? corps.noms : []).map(nomPropre).filter(Boolean);
    if (!noms.length) return erreur('écris au moins un prénom', 400);
    const { n } = await env.DB.prepare('SELECT count(*) AS n FROM comptes WHERE classe = ?').bind(c.id).first();
    if (n + noms.length > ELEVES_MAX) return erreur(`${ELEVES_MAX} élèves au plus par classe (il reste ${Math.max(0, ELEVES_MAX - n)} places)`, 409);

    const eleves = await avecCodes(async () => {
      const date = new Date().toISOString();
      const requetes = [];
      const crees = [];
      for (const nom of noms) {
        const id = crypto.randomUUID();
        const code = nouveauCodeEleve();
        crees.push({ id, nom, code });
        // Pas de mot de passe : une empreinte tirée au hasard, qu'aucun mot de passe ne peut reproduire.
        requetes.push(env.DB.prepare('INSERT INTO comptes (id, identifiant, sel, empreinte, cree, derniere, nom, classe, code_eleve) '
          + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, identifiantEleve(), hasard(16).buffer, hasard(32).buffer, date, date, nom, c.id, await empreinteCode(code)));
      }
      await env.DB.batch(requetes);
      return crees;
    });
    return json({ eleves });
  },

  async 'nouveau-code'(request, env, moi) {
    const e = await monEleve(env, moi, (await lireCorps(request)).eleve);
    if (e instanceof Response) return e;
    const [code] = await avecCodes(async () => {
      const r = await nouveauxCodes(env, [e]);
      await env.DB.batch(r.requetes);
      return r.codes;
    });
    return json(code);
  },

  async 'nouveaux-codes'(request, env, moi) {
    const c = await maClasse(env, moi, (await lireCorps(request)).classe);
    if (c instanceof Response) return c;
    const { results } = await env.DB.prepare('SELECT id, nom FROM comptes WHERE classe = ? ORDER BY nom COLLATE NOCASE').bind(c.id).all();
    const eleves = await avecCodes(async () => {
      const r = await nouveauxCodes(env, results);
      if (r.requetes.length) await env.DB.batch(r.requetes);
      return r.codes;
    });
    return json({ eleves });
  },

  async 'nom-eleve'(request, env, moi) {
    const corps = await lireCorps(request);
    const e = await monEleve(env, moi, corps.eleve);
    if (e instanceof Response) return e;
    const nom = nomPropre(corps.nom);
    if (!nom) return erreur('écris un prénom', 400);
    await env.DB.prepare('UPDATE comptes SET nom = ? WHERE id = ?').bind(nom, e.id).run();
    return rien();
  },

  async deplacer(request, env, moi) {
    const corps = await lireCorps(request);
    const e = await monEleve(env, moi, corps.eleve);
    if (e instanceof Response) return e;
    const c = await maClasse(env, moi, corps.classe);
    if (c instanceof Response) return c;
    const { n } = await env.DB.prepare('SELECT count(*) AS n FROM comptes WHERE classe = ?').bind(c.id).first();
    if (c.id !== e.classe && n >= ELEVES_MAX) return erreur(`la classe « ${c.nom} » a déjà ${ELEVES_MAX} élèves`, 409);
    await env.DB.prepare('UPDATE comptes SET classe = ? WHERE id = ?').bind(c.id, e.id).run();
    return rien();
  },

  async retirer(request, env, moi) {
    const e = await monEleve(env, moi, (await lireCorps(request)).eleve);
    if (e instanceof Response) return e;
    await env.DB.batch(effacerCompte(env, e.id));
    return rien();
  },

  async travail(request, env, moi) {
    const e = await monEleve(env, moi, new URL(request.url).searchParams.get('eleve'));
    if (e instanceof Response) return e;
    const ligne = await env.DB.prepare('SELECT version, date, donnees FROM sauvegardes WHERE cle = ? ORDER BY version DESC LIMIT 1')
      .bind('compte:' + e.id).first();
    if (!ligne) return erreur('aucun travail sauvegardé', 404);
    return new Response(new Uint8Array(ligne.donnees), {
      headers: {
        ...ENTETES, 'Content-Type': 'application/octet-stream',
        'X-Version': String(ligne.version), 'X-Date': ligne.date, 'X-Nom': encodeURIComponent(e.nom),
      },
    });
  },
};

const LECTURES = ['liste', 'eleves', 'travail'];

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return rien();
  const action = params.action;
  if (!Object.hasOwn(actions, action)) return erreur('action inconnue', 404);
  if (request.method !== (LECTURES.includes(action) ? 'GET' : 'POST')) return erreur('méthode non permise', 405);
  const s = await sessionValide(request, env);
  if (!s) return erreur('session expirée', 401);
  const moi = await env.DB.prepare('SELECT admin, est_enseignant FROM comptes WHERE id = ?').bind(s.compte).first();
  if (!moi || !(moi.admin || moi.est_enseignant)) return erreur('réservé aux enseignants', 403);
  return actions[action](request, env, s.compte);
}
