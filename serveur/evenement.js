// Événement du site (Halloween…), déclenché par un admin (page site/admin/, POST /api/admin/evenement). Les pages le
// lisent dans GET /api/etat (site/arret.js, app/app.js) et chargent alors ses effets (site/halloween/hanter.js).
// Rangé dans la table reglages (migrations/0005_reglages.sql), clé « evenement » : { nom, depuis } en JSON, ou vide.

export const EVENEMENTS = ['halloween'];

// Même cache que serveur/maintenance.js : /api/etat est demandé toutes les 20 s par chaque page ouverte.
const DUREE_CACHE = 5000;
let cache = { valeur: null, lu: 0 };

export async function evenementEnCours(env) {
  if (Date.now() - cache.lu < DUREE_CACHE) return cache.valeur;
  let valeur = null;
  try {
    const r = await env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind('evenement').first();
    const e = r && r.valeur ? JSON.parse(r.valeur) : null;
    if (e && EVENEMENTS.includes(e.nom)) valeur = { nom: e.nom, depuis: String(e.depuis || '') };
  } catch (e) {
    valeur = null; // base injoignable ou valeur abîmée : pas d'événement
  }
  cache = { valeur, lu: Date.now() };
  return valeur;
}

// nom : un des EVENEMENTS, ou null pour arrêter. « depuis » change à chaque déclenchement : le clip d'intro est remontré.
export async function changerEvenement(env, nom) {
  const valeur = nom ? { nom, depuis: new Date().toISOString() } : null;
  await env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?1, ?2) ON CONFLICT (cle) DO UPDATE SET valeur = ?2')
    .bind('evenement', valeur ? JSON.stringify(valeur) : '').run();
  cache = { valeur, lu: Date.now() };
  return valeur;
}
