// API de la sauvegarde en ligne (Cloudflare Pages Functions + base D1 « DB », voir wrangler.toml).
// Le logiciel envoie tout ce qu'il garde dans le navigateur, compressé (gzip), sous un code de quatre mots tiré au hasard
// (ex. lapin-tomate-nuage-velo). Le serveur ne lit pas ce contenu : il le range sous l'empreinte SHA-256 du code
// (le code n'est jamais stocké) et garde les 10 dernières versions. Une sauvegarde non modifiée depuis un an est effacée.
//
//   GET /api/sauvegarde              dernière version ; 204 si c'est déjà celle indiquée par X-Version-Connue ; 404 s'il n'y en a pas
//   GET /api/sauvegarde?version=N    une version précise
//   GET /api/sauvegarde?liste=1      les versions gardées : [{ version, date, taille }]
//   PUT /api/sauvegarde              enregistre une nouvelle version (corps : gzip, 1,9 Mo au plus) → { version, date }
//
// Le code voyage dans l'en-tête X-Code-Sauvegarde, jamais dans l'adresse (qui peut finir dans des journaux).

const VERSIONS_GARDEES = 10;
const TAILLE_MAX = 1900000; // une valeur D1 ne peut pas dépasser 2 Mo
const DUREE_MAX = 365 * 24 * 3600 * 1000;
const FORME_CODE = /^[a-z]{2,12}(-[a-z]{2,12}){3}$/;

const ENTETES = {
  'Access-Control-Allow-Origin': '*', // l'application de bureau (http://localhost:47821) appelle aussi cette API
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Code-Sauvegarde, X-Version-Connue',
  'Access-Control-Expose-Headers': 'X-Version, X-Date',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

const reponse = (corps, statut, plus) => new Response(corps, { status: statut, headers: { ...ENTETES, ...plus } });
const json = (o, statut = 200) => reponse(JSON.stringify(o), statut, { 'Content-Type': 'application/json' });

async function cle(request) {
  const code = (request.headers.get('X-Code-Sauvegarde') || '').trim().toLowerCase();
  if (!FORME_CODE.test(code)) return null;
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

export const onRequestOptions = () => reponse(null, 204);

export async function onRequestGet({ request, env }) {
  const c = await cle(request);
  if (!c) return json({ erreur: 'code invalide' }, 400);
  const params = new URL(request.url).searchParams;

  if (params.has('liste')) {
    const { results } = await env.DB
      .prepare('SELECT version, date, length(donnees) AS taille FROM sauvegardes WHERE cle = ? ORDER BY version DESC')
      .bind(c).all();
    return json(results);
  }

  const demandee = Number.parseInt(params.get('version'), 10);
  const ligne = Number.isInteger(demandee)
    ? await env.DB.prepare('SELECT version, date, donnees FROM sauvegardes WHERE cle = ? AND version = ?').bind(c, demandee).first()
    : await env.DB.prepare('SELECT version, date, donnees FROM sauvegardes WHERE cle = ? ORDER BY version DESC LIMIT 1').bind(c).first();
  if (!ligne) return json({ erreur: 'aucune sauvegarde' }, 404);

  const entetes = { 'X-Version': String(ligne.version), 'X-Date': ligne.date };
  if (!Number.isInteger(demandee) && request.headers.get('X-Version-Connue') === String(ligne.version)) {
    return reponse(null, 204, entetes);
  }
  return reponse(new Uint8Array(ligne.donnees), 200, { ...entetes, 'Content-Type': 'application/octet-stream' });
}

export async function onRequestPut({ request, env }) {
  const c = await cle(request);
  if (!c) return json({ erreur: 'code invalide' }, 400);
  const donnees = new Uint8Array(await request.arrayBuffer());
  if (donnees.length > TAILLE_MAX) return json({ erreur: 'sauvegarde trop grosse' }, 413);
  if (donnees.length < 18 || donnees[0] !== 0x1f || donnees[1] !== 0x8b) return json({ erreur: 'sauvegarde illisible' }, 400);

  const date = new Date().toISOString();
  // Numéro de version calculé dans la même requête que l'insertion : deux envois simultanés ne se marchent pas dessus.
  const { version } = await env.DB
    .prepare('INSERT INTO sauvegardes (cle, version, date, donnees) '
      + 'SELECT ?1, COALESCE(MAX(version), 0) + 1, ?2, ?3 FROM sauvegardes WHERE cle = ?1 RETURNING version')
    .bind(c, date, donnees.buffer).first();
  const menage = [env.DB.prepare('DELETE FROM sauvegardes WHERE cle = ? AND version <= ?').bind(c, version - VERSIONS_GARDEES)];
  // De temps en temps, on efface ce qui n'a pas bougé depuis un an.
  if (Math.random() < 0.01) {
    menage.push(env.DB.prepare('DELETE FROM sauvegardes WHERE date < ?').bind(new Date(Date.now() - DUREE_MAX).toISOString()));
  }
  await env.DB.batch(menage);
  return json({ version, date });
}
