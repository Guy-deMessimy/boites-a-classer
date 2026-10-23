// Thème du site, choisi par un admin (page site/admin/, POST /api/admin/theme) : Halloween, Noël ou normal (sciences).
// Il donne le décor de l'accueil (classe theme-<nom> de <html> et site/<nom>/theme.css, sur les pages dont le <html>
// porte data-decor), son bandeau (éléments data-theme-seul), les couleurs du logiciel (attribut data-theme de <html>,
// app/style.css) et le nom du site (THEMES ; dans <title> et dans les éléments data-nom-site : texte et attributs
// content, title, aria-label). Indépendant de l'événement (serveur/evenement.js) : pendant un événement, l'accueil prend
// le thème de l'événement le temps qu'il dure (site/evenement.js).
// functions/_middleware.js habille les pages au moment de les envoyer (les fichiers gardent le nom « Boîtes à classer »
// et le thème sciences, comme l'application de bureau) ; GET /api/etat donne le thème aux pages ouvertes, qui le suivent
// (site/arret.js, app/app.js).
// Rangé dans la table reglages (migrations/0005_reglages.sql), clé « theme » : le nom du thème.

export const THEMES = {
  halloween: { nom: 'Boîtes à hanter' },
  noel: { nom: 'Boîtes à lutins' },
  normal: { nom: 'Boîtes à classer' },
};
export const THEME_DEFAUT = 'normal';
const NOMS = /Boîtes à (classer|hanter|lutins)/g;

// Chaque instance du serveur garde le thème quelques secondes (il est lu à chaque page envoyée).
const DUREE_CACHE = 5000;
let cache = { theme: THEME_DEFAUT, lu: 0 };

export async function lireTheme(env) {
  if (Date.now() - cache.lu < DUREE_CACHE) return cache.theme;
  let theme = THEME_DEFAUT;
  try {
    const r = await env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind('theme').first();
    if (r && Object.hasOwn(THEMES, r.valeur)) theme = r.valeur;
  } catch (e) {
    // base injoignable : thème par défaut
  }
  cache = { theme, lu: Date.now() };
  return theme;
}

export async function changerTheme(env, theme) {
  await env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?1, ?2) ON CONFLICT (cle) DO UPDATE SET valeur = ?2')
    .bind('theme', theme).run();
  cache = { theme, lu: Date.now() };
  return theme;
}

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
