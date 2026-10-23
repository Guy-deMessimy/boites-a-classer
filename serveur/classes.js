// Enseignants, classes et élèves (2.9.0). Voir functions/api/classe/[action].js et migrations/0007_classes.sql.
//
// Le rôle enseignant est donné par un admin (page site/admin/) ; un admin peut aussi avoir des classes.
// Un élève est un compte sans mot de passe, créé par son enseignant dans une classe. Il se connecte avec un code
// personnel de 8 caractères (POST /api/compte/code) ; le serveur n'en garde que l'empreinte SHA-256 : l'enseignant le
// voit une seule fois, à la création, et en tire un nouveau si l'élève l'a perdu.

import { lireBadges } from './evenement.js';
import { texte, hex, sha256, hasard } from './comptes.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I/L, qui se confondent
export const FORME_CODE_ELEVE = /^[A-HJKMNP-Z2-9]{8}$/;
export const normaliserCodeEleve = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const empreinteCode = async (code) => hex(await sha256(texte('boites-a-classer:eleve:' + code)));

// Tirage sans biais : on écarte les octets au-delà du plus grand multiple de la taille de l'alphabet.
function tirer(n, alphabet) {
  let t = '';
  while (t.length < n) {
    for (const o of hasard(n * 2)) if (o < 256 - (256 % alphabet.length) && t.length < n) t += alphabet[o % alphabet.length];
  }
  return t;
}
export const nouveauCodeEleve = () => tirer(8, ALPHABET);
export const identifiantEleve = () => 'eleve.' + tirer(12, 'abcdefghijklmnopqrstuvwxyz0123456789');

// Exercices d'une classe (colonne JSON) : liste d'identifiants de collections, vide si illisible.
export const FORME_ID_COLLECTION = /^[A-Za-z0-9_-]{1,60}$/;
export function lireExercices(texte) {
  try {
    const l = JSON.parse(texte || '[]');
    return Array.isArray(l) ? l.filter((id) => typeof id === 'string' && FORME_ID_COLLECTION.test(id)).slice(0, 30) : [];
  } catch (e) {
    return [];
  }
}

// Ce que le logiciel doit savoir d'un compte : nom affiché, rôles, et pour un élève sa classe et son enseignant.
export async function etatCompte(env, id) {
  const c = await env.DB.prepare('SELECT c.identifiant, c.admin, c.est_enseignant, c.nom, c.badges, c.avatar, c.avatar_fond, cl.nom AS classe, cl.exercices, e.identifiant AS enseignant '
    + 'FROM comptes c LEFT JOIN classes cl ON cl.id = c.classe LEFT JOIN comptes e ON e.id = cl.enseignant WHERE c.id = ?').bind(id).first();
  if (!c) return null;
  return {
    identifiant: c.classe ? c.nom : c.identifiant,
    admin: !!c.admin,
    enseignant: !!(c.admin || c.est_enseignant),
    eleve: c.classe ? { classe: c.classe, enseignant: c.enseignant, exercices: lireExercices(c.exercices) } : null,
    badges: lireBadges(c.badges), // gagnés pendant les événements (serveur/evenement.js)
    avatar: c.avatar || null, // photo de profil (emoji), choisie par un admin
    avatar_fond: c.avatar && c.avatar_fond || null, // couleur de son rond (migrations/0013_avatar_fond.sql)
  };
}

// Requêtes qui effacent un compte, son travail, ses sessions, ses points d'événement et sa conversation avec le service client ; pour un
// enseignant, aussi ses classes et ses élèves.
export function effacerCompte(env, id) {
  const TOUS = 'SELECT ?1 AS id UNION SELECT e.id FROM comptes e JOIN classes cl ON cl.id = e.classe WHERE cl.enseignant = ?1';
  return [
    env.DB.prepare(`DELETE FROM support_messages WHERE fil IN (SELECT id FROM support_fils WHERE compte IN (${TOUS}))`).bind(id),
    env.DB.prepare(`DELETE FROM support_fils WHERE compte IN (${TOUS})`).bind(id),
    env.DB.prepare(`DELETE FROM sauvegardes WHERE cle IN (SELECT 'compte:' || id FROM (${TOUS}))`).bind(id),
    env.DB.prepare(`DELETE FROM sessions WHERE compte IN (${TOUS})`).bind(id),
    env.DB.prepare(`DELETE FROM scores_evenement WHERE compte IN (${TOUS})`).bind(id),
    env.DB.prepare(`DELETE FROM coups_boss WHERE compte IN (${TOUS})`).bind(id),
    env.DB.prepare(`DELETE FROM comptes WHERE id IN (${TOUS})`).bind(id),
    env.DB.prepare('DELETE FROM classes WHERE enseignant = ?').bind(id),
  ];
}

// Requêtes qui effacent une classe et ses élèves (comptes, travail, sessions).
export function effacerClasse(env, classe) {
  const ELEVES = 'SELECT id FROM comptes WHERE classe = ?1';
  return [
    env.DB.prepare(`DELETE FROM support_messages WHERE fil IN (SELECT id FROM support_fils WHERE compte IN (${ELEVES}))`).bind(classe),
    env.DB.prepare(`DELETE FROM support_fils WHERE compte IN (${ELEVES})`).bind(classe),
    env.DB.prepare(`DELETE FROM sauvegardes WHERE cle IN (SELECT 'compte:' || id FROM (${ELEVES}))`).bind(classe),
    env.DB.prepare(`DELETE FROM sessions WHERE compte IN (${ELEVES})`).bind(classe),
    env.DB.prepare(`DELETE FROM scores_evenement WHERE compte IN (${ELEVES})`).bind(classe),
    env.DB.prepare(`DELETE FROM coups_boss WHERE compte IN (${ELEVES})`).bind(classe),
    env.DB.prepare('DELETE FROM comptes WHERE classe = ?').bind(classe),
    env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(classe),
  ];
}
