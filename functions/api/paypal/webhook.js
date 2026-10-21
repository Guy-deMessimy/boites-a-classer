// Webhook PayPal (à déclarer dans l'application PayPal, voir outils/paypal-plan.mjs) : renouvellement, annulation,
// suspension ou expiration d'un abonnement. Le contenu n'est pas cru tel quel : on n'en retient que l'identifiant de
// l'abonnement, qu'on relit chez PayPal (serveur/abonnements.js). Un faux appel ne peut donc rien changer.

import { FORME_ABONNEMENT, paypalPret, rafraichir } from '../../../serveur/abonnements.js';

export async function onRequestPost({ request, env }) {
  if (!paypalPret(env)) return new Response(null, { status: 204 });
  let e = {};
  try { e = await request.json(); } catch (err) { /* corps illisible */ }
  const r = (e && e.resource) || {};
  const id = String(e.event_type || '').startsWith('BILLING.SUBSCRIPTION.') ? r.id : r.billing_agreement_id;
  if (FORME_ABONNEMENT.test(id || '')) {
    const compte = await env.DB.prepare('SELECT id, abonnement FROM comptes WHERE abonnement = ?').bind(id).first();
    if (compte) {
      try { await rafraichir(env, compte); } catch (err) { return new Response(null, { status: 503 }); } // PayPal renverra
    }
  }
  return new Response(null, { status: 204 });
}
