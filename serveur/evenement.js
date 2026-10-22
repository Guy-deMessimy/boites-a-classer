// Événement du site (Halloween…), déclenché puis arrêté par un admin (page site/admin/, POST /api/admin/evenement).
// Les pages le lisent dans GET /api/etat (site/arret.js, app/app.js) et chargent alors ses effets
// (site/halloween/hanter.js). Pendant l'événement, chaque fantôme attrapé par un compte rapporte un point
// (functions/api/evenement/[action].js, table scores_evenement) ; à l'arrêt, le classement est montré à tous.
// Rangé dans la table reglages (migrations/0005_reglages.sql), clé « evenement » : { nom, depuis } pendant l'événement,
// { nom, depuis, fin } une fois arrêté (son classement reste consultable), ou vide.

export const EVENEMENTS = ['halloween'];

// Chaque instance du serveur garde la valeur 2,5 s : les pages en attente sur /api/etat (functions/api/etat.js), qui
// relisent toutes les 3 s, partagent une seule lecture de la base par instance.
const DUREE_CACHE = 2500;
let cache = { valeur: null, lu: 0 };

// Le dernier événement : en cours (sans « fin ») ou arrêté (avec « fin »), ou null.
export async function lireEvenement(env) {
  if (Date.now() - cache.lu < DUREE_CACHE) return cache.valeur;
  let valeur = null;
  try {
    const r = await env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind('evenement').first();
    const e = r && r.valeur ? JSON.parse(r.valeur) : null;
    if (e && EVENEMENTS.includes(e.nom)) valeur = { nom: e.nom, depuis: String(e.depuis || ''), ...(e.fin ? { fin: String(e.fin) } : {}) };
  } catch (e) {
    valeur = null; // base injoignable ou valeur abîmée : pas d'événement
  }
  cache = { valeur, lu: Date.now() };
  return valeur;
}

export async function evenementEnCours(env) {
  const e = await lireEvenement(env);
  return e && !e.fin ? e : null;
}

// nom : un des EVENEMENTS pour déclencher (« depuis » change à chaque fois : clip d'intro remontré, classement remis
// à zéro), ou null pour arrêter (le classement est gardé jusqu'au prochain événement).
export async function changerEvenement(env, nom) {
  cache.lu = 0;
  const avant = await lireEvenement(env);
  const requetes = [];
  let valeur;
  if (nom) {
    valeur = { nom, depuis: new Date().toISOString() };
    requetes.push(env.DB.prepare('DELETE FROM scores_evenement'));
  } else {
    valeur = avant && !avant.fin ? { ...avant, fin: new Date().toISOString() } : avant;
  }
  requetes.push(env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?1, ?2) ON CONFLICT (cle) DO UPDATE SET valeur = ?2')
    .bind('evenement', valeur ? JSON.stringify(valeur) : ''));
  await env.DB.batch(requetes);
  cache = { valeur, lu: Date.now() };
  return valeur;
}

// Nom montré dans le classement : l'identifiant du compte, ou le prénom d'un élève (jamais sa classe ni son enseignant).
const nomAffiche = (c) => (c.classe ? c.nom || 'Élève' : c.identifiant);

// Classement d'un événement : les « combien » premiers, et la place d'un compte s'il est donné.
export async function classement(env, evenement, combien, compte) {
  const { results } = await env.DB.prepare('SELECT s.compte, s.points, c.identifiant, c.nom, c.classe FROM scores_evenement s '
    + 'JOIN comptes c ON c.id = s.compte WHERE s.evenement = ? AND s.points > 0 ORDER BY s.points DESC, s.dernier ASC LIMIT ?')
    .bind(evenement, combien).all();
  const { n } = await env.DB.prepare('SELECT count(*) AS n FROM scores_evenement WHERE evenement = ? AND points > 0').bind(evenement).first();
  const res = { participants: n, top: results.map((r) => ({ nom: nomAffiche(r), eleve: !!r.classe, points: r.points, compte: r.compte })) };
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
