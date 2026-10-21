// Prépare PayPal pour l'abonnement à 3 €/mois : crée le produit, le plan mensuel et le webhook du site, puis affiche
// les réglages à mettre dans Cloudflare (voir serveur/abonnements.js). À lancer une fois par environnement :
//   PAYPAL_API=https://api-m.sandbox.paypal.com PAYPAL_CLIENT_ID=… PAYPAL_SECRET=… node outils/paypal-plan.mjs   (essais)
//   PAYPAL_API=https://api-m.paypal.com         PAYPAL_CLIENT_ID=… PAYPAL_SECRET=… node outils/paypal-plan.mjs   (réel)
// L'identifiant et le secret viennent de developer.paypal.com → Apps & Credentials → l'application du site.
const { PAYPAL_API, PAYPAL_CLIENT_ID, PAYPAL_SECRET } = process.env;
const SITE = process.env.SITE || 'https://boites-a-classer.pages.dev';
if (!PAYPAL_API || !PAYPAL_CLIENT_ID || !PAYPAL_SECRET) throw new Error('il faut PAYPAL_API, PAYPAL_CLIENT_ID et PAYPAL_SECRET');

const { access_token: jeton } = await (await fetch(PAYPAL_API + '/v1/oauth2/token', {
  method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(PAYPAL_CLIENT_ID + ':' + PAYPAL_SECRET).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
})).json();
if (!jeton) throw new Error('PayPal refuse ces identifiants');

async function appel(chemin, corps) {
  const rep = await fetch(PAYPAL_API + chemin, {
    method: 'POST', headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(corps),
  });
  const r = await rep.json();
  if (!rep.ok) throw new Error(chemin + ' : ' + JSON.stringify(r));
  return r;
}

const produit = await appel('/v1/catalogs/products', {
  name: 'Boîtes à classer – abonnement', description: 'Créer ses collections et suivre sa classe', type: 'SERVICE', category: 'EDUCATIONAL_AND_TEXTBOOKS', home_url: SITE,
});
const plan = await appel('/v1/billing/plans', {
  product_id: produit.id,
  name: 'Abonnement mensuel',
  description: '3 € par mois, sans engagement',
  status: 'ACTIVE',
  billing_cycles: [{ frequency: { interval_unit: 'MONTH', interval_count: 1 }, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: '3.00', currency_code: 'EUR' } } }],
  payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
});
const webhook = await appel('/v1/notifications/webhooks', {
  url: SITE + '/api/paypal/webhook',
  event_types: ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED',
    'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.RE-ACTIVATED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'PAYMENT.SALE.COMPLETED'].map((name) => ({ name })),
});

console.log(`\nPayPal est prêt (produit ${produit.id}, webhook ${webhook.id}).\nRéglages à mettre dans Cloudflare Pages → boites-a-classer → Settings → Variables and Secrets :`
  + `\n  PAYPAL_API        ${PAYPAL_API}\n  PAYPAL_CLIENT_ID  ${PAYPAL_CLIENT_ID}\n  PAYPAL_PLAN_ID    ${plan.id}\n  PAYPAL_SECRET     (le secret, en type « Secret »)\n`);
