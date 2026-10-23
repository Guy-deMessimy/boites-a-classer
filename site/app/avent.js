// Calendrier de l'Avent, pendant le thème Noël du site (serveur/theme.js : <html data-theme="noel">). Du 1er au 24 décembre
// (heure de Paris), une case s'ouvre chaque jour avec un petit défi : une collection à réussir, ou une devinette « Qui
// suis-je ? ». Une case réussie gagne sa ⭐ (clé « boites-a-classer:avent:AAAA-12-JJ », qui part avec la sauvegarde en
// ligne comme les collections réussies). Les cases à venir restent fermées ; celles des jours passés se rattrapent tant
// que dure le thème (en janvier, c'est le calendrier de décembre).
// - logiciel (app/index.html, après app.js et son window.boitesApp) : bouton 🎄 dans la barre, entrée d'Outils → Jouer,
//   fenêtre du calendrier ; « #avent=<jour> » dans l'adresse ouvre la case ;
// - accueil (site/index.html : section .avent, envoyée seulement au thème Noël) : la grille ; chaque case ouverte mène à
//   sa case dans le logiciel.
// Essais en local seulement : date simulée dans localStorage, clé « boites-a-classer-avent:date » (« AAAA-MM-JJ »).
(function () {
  'use strict';
  const app = window.boitesApp || null;
  const racine = document.documentElement;
  const CLE = 'boites-a-classer:avent:';
  const CLE_DEFI = 'boites-a-classer-avent:defi'; // défi « collection » commencé, dans cet onglet (sessionStorage)
  const CLE_DATE = 'boites-a-classer-avent:date';
  const PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }); // « AAAA-MM-JJ »
  const enLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const lire = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lireDefi = () => { try { return JSON.parse(sessionStorage.getItem(CLE_DEFI)); } catch (e) { return null; } };
  const garderDefi = (d) => { try { if (d) sessionStorage.setItem(CLE_DEFI, JSON.stringify(d)); else sessionStorage.removeItem(CLE_DEFI); } catch (e) { /* stockage indisponible */ } };

  // Un défi par jour : { collection } (une collection fournie, app/collections.js) ou { qui: { indices, choix, bonne } }.
  const QUI = (indices, choix, bonne) => ({ qui: { indices, choix, bonne } });
  const DEFIS = [
    QUI(['Je suis un mammifère qui vit dans le Grand Nord.', 'Mes bois tombent et repoussent chaque année.', 'On dit que je tire le traîneau du Père Noël.'],
      ['un ours polaire', 'un renne', 'un loup', 'un phoque'], 1),
    { collection: 'vertebres' },
    QUI(['Je suis un arbre qui garde ses aiguilles en hiver.', 'Mes graines sont cachées dans des cônes.', 'En décembre, on me décore de boules et de guirlandes.'],
      ['un chêne', 'un pommier', 'un sapin', 'un bouleau'], 2),
    { collection: 'maths-figures' },
    QUI(["Je suis de l'eau, mais à l'état solide.", 'Je tombe du ciel en flocons à six branches.', 'Avec moi, on fait des bonshommes et des batailles.'],
      ['la pluie', 'la neige', 'le brouillard', 'la rosée'], 1),
    { collection: 'systeme-solaire' },
    QUI(['Je suis un petit mammifère couvert de piquants.', "Quand j'ai peur, je me roule en boule.", "L'hiver, je dors sous un tas de feuilles : j'hiberne."],
      ['un hérisson', 'un écureuil', 'une taupe', 'un lapin'], 0),
    { collection: 'musique-instruments' },
    QUI(['Je suis un oiseau, mais je ne sais pas voler.', "Je nage très bien dans l'eau glacée.", 'Je vis en Antarctique, près du pôle Sud.'],
      ['une mouette', 'un manchot', 'un cygne', 'un hibou'], 1),
    { collection: 'maths-solides' },
    QUI(['Je tourne autour de la Terre en un mois environ.', 'Je ne fais pas de lumière : je renvoie celle du Soleil.', 'Des astronautes ont marché sur moi en 1969.'],
      ['le Soleil', 'Mars', 'la Lune', "l'étoile Polaire"], 2),
    { collection: 'plantes' },
    QUI(['Je suis une figure plane, fermée, faite de segments.', "J'ai six côtés et six sommets.", 'On me retrouve dans les alvéoles des abeilles et dans les flocons de neige.'],
      ['un pentagone', 'un hexagone', 'un octogone', 'un losange'], 1),
    { collection: 'anglais-corps' },
    QUI(['Je suis une planète du système solaire.', 'Je suis la plus grosse de toutes.', 'Une immense tempête, la Grande Tache rouge, tourne sur moi.'],
      ['Jupiter', 'Mercure', 'Vénus', 'la Terre'], 0),
    { collection: 'histoire-personnages' },
    QUI(['Je suis un petit instrument de la famille des percussions.', "Je suis une petite boule de métal avec une bille à l'intérieur.", 'En anglais, on me chante : « Jingle bells » !'],
      ['un tambour', 'un violon', 'un grelot', 'une flûte'], 2),
    { collection: 'marins' },
    QUI(['En anglais, je m\'appelle « snowman ».', '« Snow » veut dire « neige » et « man » veut dire « homme ».', "J'ai souvent une carotte à la place du nez."],
      ['un bonhomme de neige', 'un skieur', 'un Père Noël', 'un ours blanc'], 0),
    { collection: 'geographie-paysages' },
    QUI(['Je suis un roi des Francs, né il y a plus de 1 200 ans.', "J'ai été couronné empereur le jour de Noël de l'an 800.", "On raconte que j'ai fait ouvrir beaucoup d'écoles."],
      ['Clovis', 'Louis XIV', 'Charlemagne', 'Napoléon'], 2),
    { collection: 'francais-genre' },
    { collection: 'ferme' },
    QUI(['Je porte un manteau rouge et une grande barbe blanche.', 'Mon traîneau est tiré par des rennes.', 'Cette nuit, je passe par la cheminée !'],
      ['un lutin', 'le Père Noël', 'un bonhomme de neige', 'un renne'], 1),
  ];

  const actif = () => racine.dataset.theme === 'noel';
  function aujourdhui() {
    const simule = enLocal && lire(CLE_DATE);
    return simule && /^\d{4}-\d{2}-\d{2}$/.test(simule) ? simule : PARIS.format(new Date());
  }
  // Le calendrier du moment : celui de décembre de cette année (en janvier, celui du mois de décembre d'avant).
  function calendrier() {
    const jour = aujourdhui(), an = +jour.slice(0, 4);
    return { jour, annee: jour.slice(5, 7) === '01' ? an - 1 : an };
  }
  const dateCase = (c, d) => c.annee + '-12-' + String(d).padStart(2, '0');
  const ouverte = (c, d) => dateCase(c, d) <= c.jour;
  const reussie = (c, d) => !!lire(CLE + dateCase(c, d));
  const etoiles = (c) => DEFIS.filter((x, i) => reussie(c, i + 1)).length;

  function phrase(c) {
    if (c.jour < dateCase(c, 1)) return "Le calendrier s'ouvre le 1er décembre : une case par jour jusqu'à Noël !";
    if (c.jour <= dateCase(c, 24)) return 'Une case par jour jusqu\'à Noël : réussis son défi pour gagner une ⭐. Les jours passés se rattrapent.';
    return 'Toutes les cases sont ouvertes : rattrape celles qui te manquent !';
  }

  // Les 24 cases ; enLien : des liens vers le logiciel (accueil), sinon des boutons (fenêtre du logiciel).
  function remplirGrille(grille, enLien) {
    const c = calendrier();
    grille.replaceChildren(...DEFIS.map((x, i) => {
      const d = i + 1, ouv = ouverte(c, d), ok = ouv && reussie(c, d);
      const e = document.createElement(!ouv ? 'span' : enLien ? 'a' : 'button');
      e.className = 'avent-case' + (ok ? ' reussie' : '') + (ouv ? '' : ' fermee') + (dateCase(c, d) === c.jour ? ' aujourdhui' : '');
      const num = document.createElement('span'), etat = document.createElement('span');
      num.className = 'num';
      num.textContent = d;
      etat.className = 'etat';
      etat.setAttribute('aria-hidden', 'true');
      etat.textContent = ok ? '⭐' : ouv ? (x.qui ? '❓' : '📦') : '🔒';
      e.append(num, etat);
      e.setAttribute('aria-label', 'Case ' + d + (ok ? ', réussie' : ouv ? (x.qui ? ', devinette' : ', collection') : ", s'ouvre le " + d + ' décembre'));
      if (ouv && enLien) e.href = 'app/index.html#avent=' + d;
      if (ouv && !enLien) {
        e.type = 'button';
        e.addEventListener('click', () => montrerCase(d));
      }
      return e;
    }));
    return c;
  }

  /* Accueil */
  if (!app) {
    const section = document.querySelector('section.avent');
    if (!section || !actif()) return;
    const c = remplirGrille(section.querySelector('.avent-grille'), true);
    section.querySelector('.avent-texte').textContent = phrase(c) + ' ⭐ ' + etoiles(c) + ' / 24';
    section.hidden = false;
    return;
  }

  /* Logiciel */
  let fen = null, toast = null;
  const bouton = document.createElement('button');
  bouton.id = 'avent-bouton';
  bouton.type = 'button';
  bouton.className = 'btn';
  bouton.title = "Calendrier de l'Avent";
  bouton.hidden = true;
  bouton.setAttribute('aria-label', "Calendrier de l'Avent");
  bouton.innerHTML = '<span class="avent-ico" aria-hidden="true">🎄</span><span class="compteur" hidden>1</span>'; // la barre est pleine : l'icône seule
  bouton.addEventListener('click', () => ouvrir());
  const voisin = document.getElementById('exercices');
  if (voisin) voisin.after(bouton);

  // Le bouton n'existe qu'au thème Noël ; sa pastille dit que la case du jour attend.
  function majBouton() {
    bouton.hidden = !actif();
    if (bouton.hidden) { if (fen && fen.open) fen.close(); return; }
    const c = calendrier(), jour = DEFIS.findIndex((x, i) => dateCase(c, i + 1) === c.jour) + 1;
    bouton.querySelector('.compteur').hidden = !(jour && !reussie(c, jour));
  }
  new MutationObserver(majBouton).observe(racine, { attributes: true, attributeFilter: ['data-theme'] });

  function fenetre() {
    if (fen) return fen;
    fen = document.createElement('dialog');
    fen.id = 'fen-avent';
    fen.className = 'fenetre';
    fen.setAttribute('aria-labelledby', 'titre-avent');
    fen.innerHTML = '<div class="fenetre-tete"><h2 id="titre-avent">🎄 Calendrier de l\'Avent</h2>'
      + '<button type="button" class="fermer" aria-label="Fermer">×</button></div>'
      + '<div class="fenetre-corps"><p class="aide avent-texte"></p><div class="avent-grille"></div><div class="avent-defi" hidden></div></div>';
    fen.querySelector('.fermer').addEventListener('click', () => fen.close());
    document.body.appendChild(fen);
    return fen;
  }

  function ouvrir() {
    if (!actif()) return;
    const f = fenetre();
    const c = remplirGrille(f.querySelector('.avent-grille'), false);
    f.querySelector('.avent-texte').textContent = phrase(c) + ' ⭐ ' + etoiles(c) + ' / 24';
    f.querySelector('.avent-grille').hidden = false;
    f.querySelector('.avent-defi').hidden = true;
    if (!f.open) f.showModal();
  }

  function gagner(c, d) {
    if (!reussie(c, d)) app.ecrire(CLE + dateCase(c, d), new Date().toISOString());
    majBouton();
  }

  // Une case ouverte : sa devinette, ou sa collection à commencer.
  function montrerCase(d) {
    const c = calendrier(), x = DEFIS[d - 1];
    if (!x || !ouverte(c, d)) return false;
    const f = fenetre(), zone = f.querySelector('.avent-defi');
    if (!f.open) f.showModal();
    f.querySelector('.avent-grille').hidden = true;
    const retour = document.createElement('button');
    retour.type = 'button';
    retour.className = 'btn';
    retour.textContent = '← Toutes les cases';
    retour.addEventListener('click', ouvrir);
    const titre = document.createElement('h3'), message = document.createElement('p');
    message.className = 'avent-message';
    message.setAttribute('aria-live', 'polite');
    const deja = reussie(c, d);
    if (x.qui) {
      titre.textContent = 'Case ' + d + ' · Qui suis-je ?' + (deja ? ' ⭐' : '');
      const indices = document.createElement('ol');
      indices.append(...x.qui.indices.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
      const choix = document.createElement('div');
      choix.className = 'avent-choix';
      choix.append(...x.qui.choix.map((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.textContent = t;
        b.addEventListener('click', () => {
          if (i !== x.qui.bonne) {
            b.classList.add('faux');
            b.disabled = true;
            message.textContent = "Non, ce n'est pas ça… Essaie encore !";
            return;
          }
          b.classList.add('juste');
          choix.querySelectorAll('button').forEach((y) => { y.disabled = true; });
          message.textContent = '⭐ Bravo ! Je suis ' + t + '. La case ' + d + ' est réussie.';
          gagner(c, d);
          app.feter();
        });
        return b;
      }));
      zone.replaceChildren(titre, indices, choix, message, retour);
    } else {
      const coll = app.collection(x.collection);
      titre.textContent = 'Case ' + d + ' · Classe « ' + (coll ? coll.nom : x.collection) + ' »' + (deja ? ' ⭐' : '');
      const aide = document.createElement('p');
      aide.textContent = 'Range toutes les cartes dans les bonnes boîtes, puis clique sur « Vérifier ». Quand tout est juste, la case gagne sa ⭐.';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'btn principal';
      go.textContent = deja ? 'Rejouer' : 'Commencer';
      go.disabled = !coll;
      go.addEventListener('click', () => {
        garderDefi({ annee: c.annee, jour: d, collection: x.collection });
        app.choisirCollection(x.collection);
        f.close();
        afficher('🎄 Case ' + d + ' : range la collection, puis « Vérifier » !');
      });
      if (!coll) message.textContent = "Cette collection n'est pas disponible ici.";
      zone.replaceChildren(titre, aide, go, message, retour);
    }
    zone.hidden = false;
    return true;
  }

  function afficher(texte) {
    if (toast) toast.remove();
    const t = toast = document.createElement('div');
    t.className = 'avent-toast';
    t.setAttribute('role', 'status');
    t.textContent = texte;
    document.body.appendChild(t);
    setTimeout(() => { t.remove(); if (toast === t) toast = null; }, 5000);
  }

  // Une collection réussie (app.js, verifier) : c'est peut-être le défi d'une case.
  window.addEventListener('boites:reussite', (ev) => {
    const defi = lireDefi();
    if (!defi || !ev.detail || ev.detail.collection !== defi.collection) return;
    garderDefi(null);
    gagner({ annee: defi.annee }, defi.jour);
    afficher('⭐ Case ' + defi.jour + " du calendrier de l'Avent réussie !");
  });

  window.avent = { actif, ouvrir };
  majBouton();
  // « #avent » ou « #avent=<jour> » dans l'adresse (lien d'une case de l'accueil), à l'ouverture ou en cours de route.
  function suivreLien() {
    const lien = /^#avent(?:=(\d{1,2}))?$/.exec(location.hash);
    if (!lien) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (actif()) setTimeout(() => { if (!lien[1] || !montrerCase(+lien[1])) ouvrir(); }, 0);
  }
  suivreLien();
  window.addEventListener('hashchange', suivreLien);
})();
