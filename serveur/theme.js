// Thème du site, choisi par un admin (page site/admin/, POST /api/admin/theme) : Halloween, Noël, Pâques, Printemps,
// Carnaval, Été, Rentrée ou normal (sciences).
// Il donne le décor de l'accueil (classe theme-<nom> de <html> et site/<nom>/theme.css, sur les pages dont le <html>
// porte data-decor), son bandeau (éléments data-theme-seul), les couleurs du logiciel (attribut data-theme de <html>,
// app/style.css) et le nom du site (THEMES ; dans <title> et dans les éléments data-nom-site : texte et attributs
// content, title, aria-label). Indépendant de l'événement (serveur/evenement.js) : pendant un événement, l'accueil prend
// le thème de l'événement le temps qu'il dure (site/evenement.js).
// functions/_middleware.js habille les pages au moment de les envoyer (les fichiers gardent le nom « Boîtes à classer »
// et le thème sciences, comme l'application de bureau) ; GET /api/etat donne le thème aux pages ouvertes, qui le suivent
// (site/arret.js, app/app.js).
// Un admin peut aussi le programmer par périodes (« Noël du 1er décembre au 6 janvier », jours compris, heure de Paris) :
// pendant une période, son thème remplace le thème choisi, qui revient tout seul à la fin, sans republier.
// Rangé dans la table reglages (migrations/0005_reglages.sql) : clé « theme » (le thème choisi) et clé
// « programme-theme » ([{ theme, du, au }] en JSON, du et au en « AAAA-MM-JJ », triées par début).

import { jourParis, dateValide, lireListe, PERIODES_MAX } from './programme.js';

export const THEMES = {
  halloween: { nom: 'Boîtes à hanter' },
  noel: { nom: 'Boîtes à lutins' },
  paques: { nom: 'Boîtes à œufs' },
  printemps: { nom: 'Boîtes à fleurs' },
  carnaval: { nom: 'Boîtes à masques' },
  ete: { nom: 'Boîtes à sable' },
  rentree: { nom: 'Boîtes à crayons' },
  normal: { nom: 'Boîtes à classer' },
};
export const THEME_DEFAUT = 'normal';
const NOMS = /Boîtes à (classer|hanter|lutins|œufs|fleurs|masques|sable|crayons)/g;

// Chaque instance du serveur garde les réglages quelques secondes (ils sont lus à chaque page envoyée) ; le thème du
// jour, lui, est recalculé à chaque fois : il change à minuit (Paris) sans attendre.
const DUREE_CACHE = 5000;
let cache = { reglage: { choisi: THEME_DEFAUT, programme: [] }, lu: 0 };

// Le thème choisi et le programme.
export async function lireReglageTheme(env) {
  if (Date.now() - cache.lu < DUREE_CACHE) return cache.reglage;
  const reglage = { choisi: THEME_DEFAUT, programme: [] };
  try {
    const { results } = await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle IN ('theme', 'programme-theme')").all();
    for (const r of results) {
      if (r.cle === 'theme' && Object.hasOwn(THEMES, r.valeur)) reglage.choisi = r.valeur;
      if (r.cle === 'programme-theme') reglage.programme = verifierProgramme(lireListe(r.valeur)) || [];
    }
  } catch (e) {
    // base injoignable : thème par défaut
  }
  cache = { reglage, lu: Date.now() };
  return reglage;
}

// La période du programme en cours ce jour-là, s'il y en a une (la première, si elles se chevauchent).
export const periodeDuJour = (programme, jour = jourParis()) => programme.find((p) => p.du <= jour && jour <= p.au) || null;

// Le thème du site en ce moment.
export async function lireTheme(env) {
  const { choisi, programme } = await lireReglageTheme(env);
  const p = periodeDuJour(programme);
  return p ? p.theme : choisi;
}

async function ecrire(env, cle, valeur) {
  await env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?1, ?2) ON CONFLICT (cle) DO UPDATE SET valeur = ?2')
    .bind(cle, valeur).run();
  cache.lu = 0;
}

export const changerTheme = (env, theme) => ecrire(env, 'theme', theme);

// Programme envoyé par la page admin : la liste rangée par début, ou null s'il est mal formé.
export function verifierProgramme(liste) {
  if (!Array.isArray(liste) || liste.length > PERIODES_MAX) return null;
  const propre = [];
  for (const p of liste) {
    if (!p || !Object.hasOwn(THEMES, p.theme) || !dateValide(p.du) || !dateValide(p.au) || p.au < p.du) return null;
    propre.push({ theme: p.theme, du: p.du, au: p.au });
  }
  return propre.sort((a, b) => (a.du < b.du ? -1 : a.du > b.du ? 1 : 0));
}

export const changerProgramme = (env, programme) => ecrire(env, 'programme-theme', JSON.stringify(programme));

// Remplace le nom du site dans un texte coupé en morceaux (HTMLRewriter) : les morceaux sont gardés jusqu'au dernier.
// Le texte est celui du fichier (entités HTML comprises), d'où « html: true » pour le remettre tel quel.
function renommer(nom) {
  let texte = '';
  return {
    text(t) {
      texte += t.text;
      if (!t.lastInTextNode) { t.remove(); return; }
      t.replace(texte.replace(NOMS, nom), { html: true });
      texte = '';
    },
  };
}

// La page HTML « reponse », habillée du thème : décor, bandeau et nom du site.
export function habiller(reponse, theme) {
  const nom = THEMES[theme].nom;
  let decor = false;
  const entetes = new Headers(reponse.headers);
  // La même adresse change de contenu quand le thème change : pas de « rien n'a changé » (304) du navigateur.
  entetes.delete('ETag');
  entetes.delete('Last-Modified');
  return new HTMLRewriter()
    .on('html', {
      element(e) {
        if (theme !== 'normal') e.setAttribute('data-theme', theme);
        if (theme === 'normal' || !e.hasAttribute('data-decor')) return;
        decor = true;
        e.setAttribute('class', ((e.getAttribute('class') || '') + ' theme-' + theme).trim());
      },
    })
    .on('head', {
      element(e) {
        if (decor) e.append(`<link rel="stylesheet" href="/${theme}/theme.css">`, { html: true });
      },
    })
    .on('[data-theme-seul]', {
      element(e) {
        if (!e.getAttribute('data-theme-seul').split(/\s+/).includes(theme)) e.remove();
      },
    })
    .on('title', renommer(nom))
    .on('[data-nom-site]', {
      element(e) {
        ['content', 'title', 'aria-label'].forEach((a) => {
          const v = e.getAttribute(a);
          if (v) e.setAttribute(a, v.replace(NOMS, nom));
        });
      },
    })
    // data-nom-site="attributs" : seulement les attributs (un élément qui en contient d'autres marqués).
    .on('[data-nom-site]:not([data-nom-site="attributs"])', renommer(nom))
    .transform(new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes }));
}
