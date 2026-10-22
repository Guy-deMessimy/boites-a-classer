// Événement du site (Halloween, Noël), déclenché puis arrêté par un admin (page site/admin/, POST /api/admin/evenement).
// Les pages le lisent dans GET /api/etat (site/arret.js, app/app.js) et chargent alors ses effets
// (site/evenement.js). Pendant l'événement, chaque personnage attrapé (fantôme, lutin) par un compte rapporte un point
// (functions/api/evenement/[action].js, table scores_evenement) ; à l'arrêt, le classement est montré à tous.
// Quand tous les comptes ensemble en ont attrapé SEUIL_BOSS, le boss (Roi des fantômes, Père Noël) apparaît chez tout
// le monde (table boss_evenement) : chaque clic lui retire DEGATS PV ; celui qui a cliqué le plus (coups_boss) gagne les
// badges badgesBoss(nom) (colonne comptes.badges). Tout compte qui participe (un personnage attrapé ou un clic sur le
// boss) gagne le badge de participation (« participation-<nom> » : vampire 🧛, bonhomme de neige ⛄).
// Rangé dans la table reglages (migrations/0005_reglages.sql), clé « evenement » : { nom, depuis } pendant l'événement,
// { nom, depuis, fin } une fois arrêté (son classement reste consultable), ou vide.

export const EVENEMENTS = ['halloween', 'noel'];
export const SEUIL_BOSS = 30;
export const PV_BOSS = 100000;
export const DEGATS = 1000;
export const badgesBoss = (nom) => ['verifie', nom]; // « halloween » 🎃, « noel » 🎅
export const badgeParticipation = (nom) => 'participation-' + nom;

// Ajoute un badge aux comptes choisis par « ou » (condition SQL sur comptes.id, avec ses paramètres à partir de ?2),
// sans doublon. Renvoie le nombre de comptes qui l'ont reçu.
export async function donnerBadge(env, badge, ou, ...params) {
  const r = await env.DB.prepare('UPDATE comptes SET badges = json_insert(coalesce(badges, \'[]\'), \'$[#]\', ?1) '
    + `WHERE instr(coalesce(badges, ''), '"' || ?1 || '"') = 0 AND ${ou}`).bind(badge, ...params).run();
  return (r.meta && r.meta.changes) || 0;
}

// Tous ceux qui ont participé à un événement (points ou coups au boss).
export const participants = (env, e) => donnerBadge(env, badgeParticipation(e.nom),
  'id IN (SELECT compte FROM scores_evenement WHERE evenement = ?2 AND points > 0 UNION SELECT compte FROM coups_boss WHERE evenement = ?2)', e.depuis);

// Chaque instance du serveur garde l'état 2,5 s : les pages en attente sur /api/etat (functions/api/etat.js), qui
// relisent toutes les 3 s, partagent une seule lecture de la base par instance.
const DUREE_CACHE = 2500;
let cache = { valeur: { evenement: null, boss: null, total: 0 }, lu: 0 };

const DEPUIS = "CASE WHEN json_valid(r.valeur) THEN json_extract(r.valeur, '$.depuis') END";

// L'événement (en cours, sans « fin », ou arrêté, avec « fin »), son boss et le nombre de fantômes attrapés par tous.
export async function lireEtat(env) {
  if (Date.now() - cache.lu < DUREE_CACHE) return cache.valeur;
  let valeur = { evenement: null, boss: null, total: 0 };
  try {
    const r = await env.DB.prepare('SELECT r.valeur, b.pv, b.max, b.apparu, b.vaincu, g.identifiant AS g_identifiant, g.nom AS g_nom, g.classe AS g_classe, g.badges AS g_badges, g.avatar AS g_avatar, '
      + `(SELECT count(*) FROM coups_boss c WHERE c.evenement = ${DEPUIS}) AS chasseurs, `
      + `(SELECT coalesce(sum(points), 0) FROM scores_evenement s WHERE s.evenement = ${DEPUIS}) AS total `
      + `FROM reglages r LEFT JOIN boss_evenement b ON b.evenement = ${DEPUIS} LEFT JOIN comptes g ON g.id = b.gagnant WHERE r.cle = 'evenement'`).first();
    const e = r && r.valeur ? JSON.parse(r.valeur) : null;
    if (e && EVENEMENTS.includes(e.nom)) {
      valeur = {
        evenement: { nom: e.nom, depuis: String(e.depuis || ''), ...(e.fin ? { fin: String(e.fin) } : {}) },
        boss: r.pv === null || r.pv === undefined ? null : {
          pv: r.pv, max: r.max, apparu: r.apparu, vaincu: r.vaincu || null, chasseurs: r.chasseurs,
          gagnant: r.g_identifiant ? { nom: nomAffiche({ identifiant: r.g_identifiant, nom: r.g_nom, classe: r.g_classe, avatar: r.g_avatar }), badges: lireBadges(r.g_badges) } : null,
        },
        total: r.total || 0,
      };
    }
  } catch (e) {
    // base injoignable ou valeur abîmée : pas d'événement
  }
  cache = { valeur, lu: Date.now() };
  return valeur;
}

export async function lireEvenement(env) {
  return (await lireEtat(env)).evenement;
}

export async function evenementEnCours(env) {
  const e = await lireEvenement(env);
  return e && !e.fin ? e : null;
}

export const oublierCache = () => { cache.lu = 0; };

// nom : un des EVENEMENTS pour déclencher (« depuis » change à chaque fois : clip d'intro remontré, classement et boss
// remis à zéro), ou null pour arrêter (le classement est gardé jusqu'au prochain événement).
export async function changerEvenement(env, nom) {
  oublierCache();
  const avant = await lireEvenement(env);
  const requetes = [];
  let valeur;
  if (nom) {
    valeur = { nom, depuis: new Date().toISOString() };
    requetes.push(env.DB.prepare('DELETE FROM scores_evenement'), env.DB.prepare('DELETE FROM coups_boss'), env.DB.prepare('DELETE FROM boss_evenement'));
  } else {
    valeur = avant && !avant.fin ? { ...avant, fin: new Date().toISOString() } : avant;
  }
  requetes.push(env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?1, ?2) ON CONFLICT (cle) DO UPDATE SET valeur = ?2')
    .bind('evenement', valeur ? JSON.stringify(valeur) : ''));
  await env.DB.batch(requetes);
  oublierCache();
  // À l'arrêt : le badge de participation à tous ceux qui ont joué (ils l'ont d'habitude déjà, dès leur premier point).
  if (!nom && avant && !avant.fin) await participants(env, avant).catch(() => 0);
  return valeur;
}

export function lireBadges(texte) {
  try {
    const l = JSON.parse(texte || '[]');
    return Array.isArray(l) ? l.filter((b) => typeof b === 'string') : [];
  } catch (e) {
    return [];
  }
}

// Nom montré dans les classements : l'identifiant du compte, ou le prénom d'un élève (jamais sa classe ni son enseignant),
// précédé de sa photo de profil (emoji, migrations/0012_avatar.sql) s'il en a une.
export const nomAffiche = (c) => (c.avatar ? c.avatar + ' ' : '') + (c.classe ? c.nom || 'Élève' : c.identifiant);

// Classement d'un événement : les « combien » premiers, et la place d'un compte s'il est donné.
export async function classement(env, evenement, combien, compte) {
  const { results } = await env.DB.prepare('SELECT s.compte, s.points, c.identifiant, c.nom, c.classe, c.badges, c.avatar FROM scores_evenement s '
    + 'JOIN comptes c ON c.id = s.compte WHERE s.evenement = ? AND s.points > 0 ORDER BY s.points DESC, s.dernier ASC LIMIT ?')
    .bind(evenement, combien).all();
  const { n } = await env.DB.prepare('SELECT count(*) AS n FROM scores_evenement WHERE evenement = ? AND points > 0').bind(evenement).first();
  const res = { participants: n, top: results.map((r) => ({ nom: nomAffiche(r), eleve: !!r.classe, points: r.points, compte: r.compte, badges: lireBadges(r.badges) })) };
  if (compte) {
    const s = await env.DB.prepare('SELECT points, dernier FROM scores_evenement WHERE evenement = ? AND compte = ?').bind(evenement, compte).first();
    if (!s || !s.points) res.moi = { points: 0, rang: null };
    else {
      const { devant } = await env.DB.prepare('SELECT count(*) AS devant FROM scores_evenement WHERE evenement = ?1 AND (points > ?2 OR (points = ?2 AND dernier < ?3))')
        .bind(evenement, s.points, s.dernier).first();
      res.moi = { points: s.points, rang: devant + 1 };
    }
  }
  return res;
}

// Ceux qui ont porté le plus de coups au boss.
export async function chasseursBoss(env, evenement, combien) {
  const { results } = await env.DB.prepare('SELECT b.compte, b.coups, c.identifiant, c.nom, c.classe, c.badges, c.avatar FROM coups_boss b '
    + 'JOIN comptes c ON c.id = b.compte WHERE b.evenement = ? ORDER BY b.coups DESC, b.dernier ASC LIMIT ?').bind(evenement, combien).all();
  return results.map((r) => ({ compte: r.compte, nom: nomAffiche(r), coups: r.coups, badges: lireBadges(r.badges) }));
}

// Le boss vient de tomber : le gagnant reçoit ses badges (sans doublon, gardés après l'événement). e : { nom, depuis }.
export async function recompenser(env, e) {
  const [premier] = await chasseursBoss(env, e.depuis, 1);
  if (!premier) return null;
  const badges = [...new Set([...premier.badges, ...badgesBoss(e.nom)])];
  await env.DB.batch([
    env.DB.prepare('UPDATE boss_evenement SET gagnant = ? WHERE evenement = ?').bind(premier.compte, e.depuis),
    env.DB.prepare('UPDATE comptes SET badges = ? WHERE id = ?').bind(JSON.stringify(badges), premier.compte),
  ]);
  oublierCache();
  return { nom: premier.nom, badges };
}
