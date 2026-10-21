// Outils communs aux comptes (functions/api/compte/[action].js) et à la sauvegarde en ligne (functions/api/sauvegarde.js).
// Ce dossier est hors de functions/ pour ne pas devenir une adresse du site.
//
// Une session est un jeton de 32 octets tiré au hasard, remis au logiciel à la connexion et renvoyé dans l'en-tête
// « Authorization: Bearer … ». Le serveur n'en garde que l'empreinte SHA-256. Une session (ou un compte) qui ne sert
// plus pendant un an est effacée.

import { estAbonne } from './abonnements.js';

export const DUREE_INACTIVITE = 365 * 24 * 3600 * 1000;
const UN_JOUR = 24 * 3600 * 1000;
const FORME_JETON = /^[A-Za-z0-9_-]{43}$/;
export const FORME_IDENTIFIANT = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const FORME_SECRET = /^[A-Za-z0-9_-]{43}$/; // secret dérivé du mot de passe par le logiciel (PBKDF2, 32 octets en base64url)
const SESSIONS_GARDEES = 20; // par compte : les plus anciennes sont fermées au-delà

export const texte = (t) => new TextEncoder().encode(t);
export const hex = (octets) => [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
export const sha256 = async (...morceaux) => {
  const tout = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  morceaux.reduce((n, m) => { tout.set(m, n); return n + m.length; }, 0);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', tout));
};
export const base64url = (octets) => btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const hasard = (n) => crypto.getRandomValues(new Uint8Array(n));

// Le serveur garde SHA-256(sel + secret) ; comparaison en temps constant.
export const empreinteSecret = (sel, secret) => sha256(new Uint8Array(sel), texte(secret));

export async function secretCorrect(ligne, secret) {
  if (!FORME_SECRET.test(secret || '')) return false;
  const calcule = await empreinteSecret(ligne.sel, secret);
  const garde = new Uint8Array(ligne.empreinte);
  return calcule.length === garde.length && crypto.subtle.timingSafeEqual(calcule, garde);
}

// Ouvre une session pour le compte : renvoie le jeton (à remettre au logiciel) et les requêtes à exécuter.
export async function nouvelleSession(env, compte) {
  const jeton = base64url(hasard(32));
  const requetes = [
    env.DB.prepare('INSERT INTO sessions (jeton, compte, derniere) VALUES (?, ?, ?)')
      .bind(hex(await sha256(texte(jeton))), compte, new Date().toISOString()),
    env.DB.prepare('DELETE FROM sessions WHERE compte = ?1 AND jeton NOT IN '
      + '(SELECT jeton FROM sessions WHERE compte = ?1 ORDER BY derniere DESC LIMIT ?2)').bind(compte, SESSIONS_GARDEES),
  ];
  return { jeton, requetes };
}

// Ce que le logiciel doit savoir d'un compte : { identifiant, admin, abonne, enseignant } (voir serveur/abonnements.js).
export async function etatCompte(env, id) {
  const c = await env.DB.prepare('SELECT c.*, e.identifiant AS nom_enseignant FROM comptes c '
    + 'LEFT JOIN comptes e ON e.id = c.enseignant WHERE c.id = ?').bind(id).first();
  if (!c) return null;
  return { identifiant: c.identifiant, admin: !!c.admin, abonne: await estAbonne(env, c), enseignant: c.nom_enseignant || null };
}

// Compte de la session indiquée par l'en-tête Authorization : { compte, jeton } ou null (absente, inconnue ou expirée).
export async function sessionValide(request, env) {
  const m = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!m || !FORME_JETON.test(m[1])) return null;
  const jeton = hex(await sha256(texte(m[1])));
  const s = await env.DB.prepare('SELECT compte, derniere FROM sessions WHERE jeton = ?').bind(jeton).first();
  const maintenant = new Date();
  if (!s || maintenant - new Date(s.derniere) > DUREE_INACTIVITE) return null;
  // La date de dernière utilisation n'est mise à jour qu'une fois par jour : une écriture de moins à chaque envoi.
  if (maintenant - new Date(s.derniere) > UN_JOUR) {
    const iso = maintenant.toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET derniere = ? WHERE jeton = ?').bind(iso, jeton),
      env.DB.prepare('UPDATE comptes SET derniere = ? WHERE id = ?').bind(iso, s.compte),
    ]);
  }
  return { compte: s.compte, jeton };
}

// Requêtes de ménage, lancées de temps en temps : sessions et comptes inutilisés depuis un an, compteurs expirés.
// Le travail d'un compte effacé l'est aussi par la règle « un an sans modification » de la sauvegarde.
export function menageComptes(env) {
  const avant = new Date(Date.now() - DUREE_INACTIVITE).toISOString();
  return [
    env.DB.prepare('DELETE FROM sessions WHERE derniere < ?').bind(avant),
    env.DB.prepare('DELETE FROM comptes WHERE derniere < ?').bind(avant),
    env.DB.prepare('DELETE FROM limites WHERE fin < ?').bind(new Date().toISOString()),
  ];
}
