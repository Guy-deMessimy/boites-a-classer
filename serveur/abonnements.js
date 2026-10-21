// Abonnements à 3 €/mois, payés avec PayPal (abonnements PayPal « Subscriptions »).
//
// Un abonné crée et publie ses propres collections et gère les élèves de sa classe (functions/api/classe/[action].js).
// Le serveur ne croit que PayPal : l'identifiant d'abonnement (I-…) reçu du navigateur ou d'un webhook sert seulement à
// relire l'abonnement chez PayPal (GET /v1/billing/subscriptions/{id}), qui dit s'il est actif et jusqu'à quand.
// Les droits durent jusqu'à comptes.abonne_jusqua ; passé cette date, l'abonnement est relu (au plus une fois par heure).
//
// Réglages (Cloudflare Pages → Settings → Variables and Secrets, ou wrangler.toml [vars]) :
//   PAYPAL_API        https://api-m.paypal.com (réel) ou https://api-m.sandbox.paypal.com (essais)
//   PAYPAL_CLIENT_ID  identifiant de l'application PayPal (public : la page d'abonnement l'utilise)
//   PAYPAL_PLAN_ID    plan à 3 €/mois (P-…), créé par outils/paypal-plan.mjs
//   PAYPAL_SECRET     secret de l'application PayPal (secret chiffré, jamais dans le dépôt)

const UNE_HEURE = 3600 * 1000;
const UN_JOUR = 24 * UNE_HEURE;
const GRACE = 3 * UN_JOUR; // marge après la date de prélèvement, le temps que PayPal encaisse
const FORME_CODE_CLASSE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I/L

export const FORME_ABONNEMENT = /^I-[A-Z0-9]{6,40}$/;
export const paypalPret = (env) => !!(env.PAYPAL_API && env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET && env.PAYPAL_PLAN_ID);

export function nouveauCodeClasse() {
  const h = crypto.getRandomValues(new Uint8Array(6));
  return [...h].map((o) => FORME_CODE_CLASSE[o % FORME_CODE_CLASSE.length]).join('');
}

// Jeton d'accès à l'API PayPal (valable quelques heures), gardé par l'instance du serveur.
let acces = { jeton: null, fin: 0 };
async function jetonPaypal(env) {
  if (acces.jeton && Date.now() < acces.fin) return acces.jeton;
  const rep = await fetch(env.PAYPAL_API + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_SECRET), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!rep.ok) throw new Error('PayPal refuse la connexion (' + rep.status + ')');
  const r = await rep.json();
  acces = { jeton: r.access_token, fin: Date.now() + Math.max(60, (r.expires_in || 3600) - 300) * 1000 };
  return acces.jeton;
}

export async function lireAbonnementPaypal(env, id) {
  const rep = await fetch(env.PAYPAL_API + '/v1/billing/subscriptions/' + encodeURIComponent(id), {
    headers: { Authorization: 'Bearer ' + (await jetonPaypal(env)) },
  });
  if (rep.status === 404) return null;
  if (!rep.ok) throw new Error('PayPal ne répond pas (' + rep.status + ')');
  return rep.json();
}

// Jusqu'à quand un abonnement PayPal donne les droits (ISO), ou null.
// Actif : jusqu'au prochain prélèvement (+ marge). Annulé, suspendu ou expiré : jusqu'à la fin du mois déjà payé.
export function validite(env, a) {
  if (!a || a.plan_id !== env.PAYPAL_PLAN_ID) return null;
  const info = a.billing_info || {};
  const date = (iso, plus) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(Date.parse(iso) + plus).toISOString() : null);
  if (a.status === 'ACTIVE') return date(info.next_billing_time, GRACE) || new Date(Date.now() + 31 * UN_JOUR).toISOString();
  if (a.status === 'APPROVED') return new Date(Date.now() + UN_JOUR).toISOString(); // accepté, premier prélèvement en cours
  if (['CANCELLED', 'SUSPENDED', 'EXPIRED'].includes(a.status)) {
    const fin = date(info.last_payment && info.last_payment.time, 31 * UN_JOUR);
    return fin && Date.parse(fin) > Date.now() ? fin : null;
  }
  return null;
}

// Relit l'abonnement d'un compte chez PayPal et met à jour ses droits. Renvoie la nouvelle date de fin (ou null).
export async function rafraichir(env, compte) {
  const a = await lireAbonnementPaypal(env, compte.abonnement);
  const jusqua = validite(env, a);
  await env.DB.prepare('UPDATE comptes SET abonne_jusqua = ?, abonnement_verifie = ?, code_classe = COALESCE(code_classe, ?) WHERE id = ?')
    .bind(jusqua, new Date().toISOString(), jusqua ? nouveauCodeClasse() : null, compte.id).run();
  return jusqua;
}

// Le compte (ligne de la table comptes) est-il abonné en ce moment ?
export async function estAbonne(env, compte) {
  if (!compte) return false;
  if (compte.abonne_jusqua && Date.parse(compte.abonne_jusqua) > Date.now()) return true;
  if (!compte.abonnement || !paypalPret(env)) return false;
  if (compte.abonnement_verifie && Date.now() - Date.parse(compte.abonnement_verifie) < UNE_HEURE) return false;
  try {
    const jusqua = await rafraichir(env, compte);
    return !!jusqua && Date.parse(jusqua) > Date.now();
  } catch (e) {
    return false; // PayPal injoignable : on réessaiera
  }
}
