// Jeu de l'événement (serveur/evenement.js) : chaque personnage attrapé (site/evenement.js) rapporte un point au
// compte connecté. Quand tous les comptes ensemble en ont attrapé SEUIL_BOSS, le boss apparaît : chaque coup lui retire
// DEGATS PV, et celui qui a cliqué le plus gagne les badges badgesBoss(nom). Le classement n'est montré qu'à la fin.
//
//   POST /api/evenement/attrape     (Authorization: Bearer …) → { points, compte, total, badge? }   un point de plus, au plus
//                                    un toutes les 2,5 s (« compte » : false s'il est arrivé trop tôt) ; 409 sans événement.
//                                    « badge » : le badge de participation vient d'être gagné (premier point ou premier coup)
//   GET  /api/evenement/classement  (Authorization facultative) → { evenement: { nom, depuis, fin } | null, participants,
//                                    top: [{ nom, avatar, avatar_fond, eleve, points, badges }] (10 premiers, seulement une fois l'événement
//                                    arrêté), moi: { points, rang } (compte connecté ; rang seulement à la fin),
//                                    boss: { pv, max, vaincu, chasseurs, gagnant: { nom, avatar, avatar_fond, badges } } | null }
//   POST /api/evenement/boss        (Authorization: Bearer …) → { boss, compte, coups, badge? }   un coup au boss, au plus un
//                                    toutes les 0,5 s ; 409 sans boss à combattre
//   GET  /api/evenement/boss        (Authorization facultative) → { boss, top: [{ nom, avatar, avatar_fond, coups, badges }] (5 premiers),
//                                    moi: { coups, gagnant } }

import { sessionValide } from '../../../serveur/comptes.js';
import { lireEvenement, lireEtat, oublierCache, classement, chasseursBoss, recompenser, donnerBadge, badgeParticipation, SEUIL_BOSS, PV_BOSS, DEGATS } from '../../../serveur/evenement.js';

const RYTHME = 2500; // ms entre deux points comptés : un fantôme apparaît au plus toutes les 5 s sur une page
const RYTHME_BOSS = 500; // ms entre deux coups comptés au boss, par compte
const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};
const json = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { ...ENTETES, 'Content-Type': 'application/json' } });
const erreur = (message, statut) => json({ erreur: message }, statut);

const etatBoss = (b) => b && { pv: b.pv, max: b.max, vaincu: b.vaincu || null };

// Première participation à l'événement : le badge de participation, s'il ne l'a pas déjà.
async function participer(env, e, compte, res) {
  if (await donnerBadge(env, badgeParticipation(e.nom), 'id = ?2', compte)) res.badge = badgeParticipation(e.nom);
  return res;
}

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
    const { total } = await env.DB.prepare('SELECT coalesce(sum(points), 0) AS total FROM scores_evenement WHERE evenement = ?').bind(e.depuis).first();
    if (r && total >= SEUIL_BOSS) {
      // Le boss n'apparaît qu'une fois par événement (clé primaire).
      const nouveau = await env.DB.prepare('INSERT OR IGNORE INTO boss_evenement (evenement, pv, max, apparu) VALUES (?, ?, ?, ?)')
        .bind(e.depuis, PV_BOSS, PV_BOSS, new Date().toISOString()).run();
      if (nouveau.meta && nouveau.meta.changes) oublierCache();
    }
    if (r) return json(r.points === 1 ? await participer(env, e, s.compte, { points: 1, compte: true, total }) : { points: r.points, compte: true, total });
    const deja = await env.DB.prepare('SELECT points FROM scores_evenement WHERE evenement = ? AND compte = ?').bind(e.depuis, s.compte).first();
    return json({ points: deja ? deja.points : 0, compte: false, total });
  },

  async classement(request, env) {
    const e = await lireEvenement(env);
    if (!e) return json({ evenement: null });
    const s = request.headers.has('Authorization') ? await sessionValide(request, env) : null;
    const c = await classement(env, e.depuis, 10, s && s.compte);
    const res = { evenement: e, participants: c.participants, boss: (await lireEtat(env)).boss };
    if (e.fin) res.top = c.top.map(({ nom, avatar, avatar_fond, eleve, points, badges }) => ({ nom, avatar, avatar_fond, eleve, points, badges }));
    if (c.moi) res.moi = e.fin ? c.moi : { points: c.moi.points };
    return json(res);
  },

  async boss(request, env) {
    const e = await lireEvenement(env);
    if (request.method === 'GET') {
      if (!e) return json({ boss: null });
      const etat = await lireEtat(env);
      const s = request.headers.has('Authorization') ? await sessionValide(request, env) : null;
      const top = await chasseursBoss(env, e.depuis, 5);
      const res = { boss: etat.boss, top: top.map(({ nom, avatar, avatar_fond, coups, badges }) => ({ nom, avatar, avatar_fond, coups, badges })) };
      if (s) {
        const m = await env.DB.prepare('SELECT c.coups, b.gagnant FROM boss_evenement b LEFT JOIN coups_boss c ON c.evenement = b.evenement AND c.compte = ?2 '
          + 'WHERE b.evenement = ?1').bind(e.depuis, s.compte).first();
        res.moi = { coups: (m && m.coups) || 0, gagnant: !!(m && m.gagnant === s.compte) };
      }
      return json(res);
    }
    const s = await sessionValide(request, env);
    if (!s) return erreur('connexion nécessaire', 401);
    if (!e || e.fin) return erreur('pas d\'événement en cours', 409);
    const maintenant = Date.now();
    // Le coup ne compte que si le boss est encore debout et que ce compte n'a pas frappé il y a moins de RYTHME_BOSS.
    const coup = await env.DB.prepare('INSERT INTO coups_boss (evenement, compte, coups, dernier) '
      + 'SELECT ?1, ?2, 1, ?3 WHERE EXISTS (SELECT 1 FROM boss_evenement WHERE evenement = ?1 AND vaincu IS NULL AND pv > 0) '
      + 'ON CONFLICT (evenement, compte) DO UPDATE SET coups = coups + 1, dernier = ?3 WHERE ?3 - coups_boss.dernier >= ?4 RETURNING coups')
      .bind(e.depuis, s.compte, maintenant, RYTHME_BOSS).first();
    if (!coup) {
      const b = await env.DB.prepare('SELECT pv, max, vaincu FROM boss_evenement WHERE evenement = ?').bind(e.depuis).first();
      if (!b) return erreur('pas de boss à combattre', 409);
      return json({ boss: etatBoss(b), compte: false });
    }
    const vaincu = new Date().toISOString();
    const b = await env.DB.prepare('UPDATE boss_evenement SET pv = max(0, pv - ?2), vaincu = CASE WHEN pv - ?2 <= 0 THEN ?3 END '
      + 'WHERE evenement = ?1 AND vaincu IS NULL RETURNING pv, max, vaincu').bind(e.depuis, DEGATS, vaincu).first();
    oublierCache();
    if (!b) { // un autre coup l'a achevé juste avant
      const fin = await env.DB.prepare('SELECT pv, max, vaincu FROM boss_evenement WHERE evenement = ?').bind(e.depuis).first();
      return json({ boss: etatBoss(fin), compte: false, coups: coup.coups - 1 });
    }
    const res = { boss: etatBoss(b), compte: true, coups: coup.coups };
    if (coup.coups === 1) await participer(env, e, s.compte, res);
    if (b.vaincu === vaincu) res.gagnant = await recompenser(env, e); // ce coup l'a achevé
    return json(res);
  },
};

const METHODES = { attrape: ['POST'], classement: ['GET'], boss: ['GET', 'POST'] };

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
  const action = params.action;
  if (!Object.hasOwn(actions, action)) return erreur('action inconnue', 404);
  if (!METHODES[action].includes(request.method)) return erreur('méthode non permise', 405);
  return actions[action](request, env);
}
