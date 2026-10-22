// Collections du site, proposées à tout le monde dans le logiciel (en plus des collections fournies dans app/collections.js).
// Elles sont créées et modifiées par un admin (functions/api/admin/[action].js : collection, collection-suppression).
//
//   GET /api/collections   → [{ id, nom, attributs, etres }, …] dans l'ordre de création

const ENTETES = {
  'Access-Control-Allow-Origin': '*', // l'application de bureau (http://localhost:47821) appelle aussi cette API
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT donnees FROM collections ORDER BY rowid').all();
  return new Response('[' + results.map((r) => r.donnees).join(',') + ']', { headers: ENTETES });
}
