// API de l'abonnement à 3 €/mois (page site/abonnement/). Voir serveur/abonnements.js.
//
//   GET  /api/abonnement/config   → { pret, clientId, planId }   ce dont la page a besoin pour afficher le bouton PayPal
//   POST /api/abonnement/activer  { abonnement, identifiant?, secret? }
//        Appelé par la page juste après le paiement, avec l'identifiant d'abonnement PayPal (I-…).
//        Avec une session (Authorization) : le compte connecté devient abonné.
//        Sans session : un compte abonné est créé avec l'identifiant et le mot de passe choisis avant de payer.
//        → { identifiant, jeton?, abonne_jusqua, code_classe }
//        402 si PayPal ne confirme pas le paiement, 409 si l'abonnement est déjà relié à un autre compte ou l'identifiant pris.

import { sessionValide, FORME_IDENTIFIANT, FORME_SECRET, empreinteSecret, nouvelleSession, hasard } from '../../../serveur/comptes.js';
import { paypalPret, FORME_ABONNEMENT, lireAbonnementPaypal, validite, nouveauCodeClasse } from '../../../serveur/abonnements.js';

const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};
const json = (o, statut = 200) => new Response(JSON.stringify(o), { status: statut, headers: { ...ENTETES, 'Content-Type': 'application/json' } });
const erreur = (message, statut) => json({ erreur: message }, statut);

async function activer(request, env) {
  if (!paypalPret(env)) return erreur('l\'abonnement n\'est pas encore disponible', 503);
  let corps = {};
  try { corps = await request.json(); } catch (e) { /* corps illisible */ }
  const { abonnement, identifiant, secret } = corps;
  if (!FORME_ABONNEMENT.test(abonnement || '')) return erreur('abonnement invalide', 400);

  const s = await sessionValide(request, env);
  const deja = await env.DB.prepare('SELECT id, identifiant FROM comptes WHERE abonnement = ?').bind(abonnement).first();
  if (deja && (!s || deja.id !== s.compte)) {
    return erreur(`cet abonnement est déjà relié au compte « ${deja.identifiant} » : connecte-toi avec ce compte`, 409);
  }
  if (!s) {
    if (!FORME_IDENTIFIANT.test(identifiant || '')) return erreur('identifiant invalide', 400);
    if (!FORME_SECRET.test(secret || '')) return erreur('mot de passe invalide', 400);
  }

  // Seul PayPal dit si l'abonnement est payé, pour quel plan et jusqu'à quand.
  let a;
  try {
    a = await lireAbonnementPaypal(env, abonnement);
  } catch (e) {
    return erreur('PayPal ne répond pas, réessaie dans un instant', 502);
  }
  const jusqua = validite(env, a);
  if (!jusqua) return erreur('PayPal ne confirme pas ce paiement', 402);
  const maintenant = new Date().toISOString();
  const code = nouveauCodeClasse();

  if (s) {
    await env.DB.prepare('UPDATE comptes SET abonnement = ?, abonne_jusqua = ?, abonnement_verifie = ?, '
      + 'code_classe = COALESCE(code_classe, ?) WHERE id = ?').bind(abonnement, jusqua, maintenant, code, s.compte).run();
    const c = await env.DB.prepare('SELECT identifiant, code_classe FROM comptes WHERE id = ?').bind(s.compte).first();
    return json({ identifiant: c.identifiant, abonne_jusqua: jusqua, code_classe: c.code_classe });
  }

  // Nouveau compte, créé automatiquement avec l'identifiant et le mot de passe choisis sur la page.
  const id = crypto.randomUUID();
  const sel = hasard(16);
  const session = await nouvelleSession(env, id);
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO comptes (id, identifiant, sel, empreinte, cree, derniere, abonnement, abonne_jusqua, abonnement_verifie, code_classe) '
        + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, identifiant, sel.buffer, (await empreinteSecret(sel, secret)).buffer, maintenant, maintenant, abonnement, jusqua, maintenant, code),
      ...session.requetes,
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return erreur('cet identifiant est déjà pris : choisis-en un autre (ton paiement est bien gardé)', 409);
    throw e;
  }
  return json({ identifiant, jeton: session.jeton, abonne_jusqua: jusqua, code_classe: code });
}

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
  if (params.action === 'config' && request.method === 'GET') {
    return json(paypalPret(env)
      ? { pret: true, clientId: env.PAYPAL_CLIENT_ID, planId: env.PAYPAL_PLAN_ID, sandbox: env.PAYPAL_API.includes('sandbox') }
      : { pret: false });
  }
  if (params.action === 'activer' && request.method === 'POST') return activer(request, env);
  return erreur('action inconnue', 404);
}
