(() => {
  'use strict';

  const VERSION = '4.2.0';
  const FOURNIES = window.COLLECTIONS || [];
  const PALETTE = ['#2f7ed8', '#e4572e', '#29a35a', '#8e5bd0', '#e8a10c', '#d6457b',
    '#17a2b8', '#7a8b23', '#b5651d', '#5465ff', '#c0392b', '#16a085'];
  const GRIS = '#8a8f98';
  const ETRE = { l: 88, h: 76 }; // taille d'une carte sur le plan de travail (avant zoom)
  const BOITE_MIN = { l: 120, h: 80 };
  const ZOOM = { min: 0.35, max: 1.6 };
  const SEUIL = 5; // déplacement (px) avant qu'un appui devienne un glisser
  const MAX_XY = 20000; // coordonnée maximale acceptée depuis un fichier
  const HISTOIRE_MAX = 50; // étapes gardées pour « Annuler »

  const $ = (s) => document.querySelector(s);
  // Nom du site selon son thème (« Boîtes à hanter »… : serveur/theme.js), posé dans la barre par le serveur.
  const nomSite = () => $('.titre-long').textContent;
  const espace = $('#espace');
  const toile = $('#toile');
  const calque = $('#calque');
  const plateau = $('#plateau');
  const selColl = $('#collection');
  const info = $('#info');
  const bilan = $('#bilan');
  const bilanListe = $('#bilan-liste');
  const boutonEffacer = $('#effacer');
  const boutonFichier = $('#fichier');
  const boutonOutils = $('#outils');
  const niveauZoom = $('#zoom-niveau');
  let infoDefaut = info.textContent; // dépend de la matière (voir choisirCollection)
  const petitEcran = window.matchMedia('(max-width: 700px)');
  const tactile = window.matchMedia('(pointer: coarse)');

  let coll = null;
  let etat = null; // { boites: [{ id, x, y, w, h, attr, texte }], positions: { idEtre: { x, y } } }
  let histoire = { passe: [], futur: [], actuel: null }; // annuler / rétablir (états du plan de travail en JSON)
  let defi = null; // défi chronométré en cours : { collection, debut }
  let attrParId = new Map();
  let elBoites = new Map();
  let elEtres = new Map();
  let menu = null;
  let zoom = 1;
  let mesCollections = []; // collections créées ou importées, gardées dans le navigateur
  let collectionsSite = []; // collections publiées par un admin, proposées à tout le monde (functions/api/collections.js)

  /* ---------- Outils ---------- */

  const normaliser = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  const borne = (v, min, max) => Math.min(max, Math.max(min, v));
  const dansRect = (x, y, r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const contient = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  const englobe = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  const chevauche = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const centre = (p) => ({ x: p.x + ETRE.l / 2, y: p.y + ETRE.h / 2 });
  const borner = (p) => ({ x: borne(Math.round(p.x), 0, MAX_XY), y: borne(Math.round(p.y), 0, MAX_XY) });
  const nouvelId = (prefixe) => prefixe + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const toutes = () => [...FOURNIES, ...collectionsSite, ...mesCollections];
  // Matières des collections fournies (champ « matiere », sciences par défaut) : une partie par matière dans les listes.
  const MATIERES = window.MATIERES || [['sciences', '🔬 Sciences']]; // app/collections.js
  const matiere = (c) => (c && c.matiere) || 'sciences';
  // Ce qu'on classe : des êtres vivants en sciences, des « éléments » (mots, nombres, figures…) ailleurs.
  // Une collection peut le préciser (champ « elements », au masculin : ['aliment', 'aliments']).
  const elements = (c = coll) => (Array.isArray(c.elements) ? c.elements : matiere(c) === 'sciences' ? ['être vivant', 'êtres vivants'] : ['élément', 'éléments']);
  // Collections réussies (tout juste à la vérification) : cochées ✅ dans les listes. Clé sauvegardée en ligne avec le
  // reste du travail, pour retrouver sa progression sur un autre appareil.
  const cleReussie = (c) => 'boites-a-classer:reussi:' + c.id;
  const reussie = (c) => !!lire(cleReussie(c));
  // Réussie au niveau expert : un trophée 🏆 à la place de la coche (sauvegardé en ligne lui aussi).
  const cleExpert = (c) => 'boites-a-classer:expert:' + c.id;
  const reussieExpert = (c) => !!lire(cleExpert(c));
  const marqueReussite = (c) => (reussieExpert(c) ? '🏆 ' : reussie(c) ? '✅ ' : '');
  const estPerso = (c) => mesCollections.includes(c);
  const estSite = (c) => collectionsSite.includes(c);
  // Seul un admin crée et modifie des collections (le serveur le vérifie aussi pour celles du site).
  const estAdmin = () => !!jetonCompte() && lire(CLE_ADMIN) === '1';
  // Depuis la 3.13.0, un enseignant crée aussi des collections du site, et ne modifie que les siennes (modifiablesSite,
  // donné par le serveur dans GET /api/collections).
  const peutCreer = () => estAdmin() || (!!jetonCompte() && lire(CLE_ENSEIGNANT) === '1');
  let modifiablesSite = new Set();
  const modifiable = (c) => estSite(c) && (estAdmin() || modifiablesSite.has(c.id));

  const nomAttr = (id) => (attrParId.get(id) || { nom: id }).nom;
  const couleurBoite = (b) => (b.attr && attrParId.has(b.attr) ? attrParId.get(b.attr).couleur : GRIS);

  function trouverAttr(texte) {
    const t = normaliser(texte);
    if (!t) return null;
    for (const a of attrParId.values()) if (normaliser(a.nom) === t) return a;
    return null;
  }

  // Convertit une position à l'écran en coordonnées du plan de travail (zoom compris).
  function versCalque(clientX, clientY) {
    const r = toile.getBoundingClientRect();
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  }

  /* ---------- Sauvegarde (dans le navigateur) ---------- */

  const cle = () => 'boites-a-classer:' + coll.id;

  // Mémoire du navigateur, sauf en consultation (un admin regarde le travail d'un élève) : une mémoire temporaire
  // qui disparaît en quittant la page (voir ouvrirConsultation).
  let stockage = null;
  try { stockage = window.localStorage; } catch (e) { /* stockage indisponible */ }

  function lire(k) {
    try { return stockage.getItem(k); } catch (e) { return null; }
  }
  function ecrire(k, v) {
    try { stockage.setItem(k, v); } catch (e) { /* stockage indisponible */ }
    signalerChangement(k);
  }

  // Chaque enregistrement garde l'état d'avant pour « Annuler » (voir Annuler, rétablir).
  function sauver() {
    const s = JSON.stringify(etat);
    if (histoire.actuel !== null && s !== histoire.actuel) {
      histoire.passe.push(histoire.actuel);
      if (histoire.passe.length > HISTOIRE_MAX) {
        histoire.passe.shift();
        if (defi) defi.marque--;
      }
      histoire.futur = [];
    }
    histoire.actuel = s;
    ecrire(cle(), s);
    noterSuivi(); // jour d'activité, pour « Mon parcours »
    majBoutonsHistoire();
  }

  function charger() {
    try {
      const o = JSON.parse(lire(cle()));
      if (o && Array.isArray(o.boites) && o.positions && typeof o.positions === 'object') return accorder(o);
    } catch (e) { /* rien de sauvegardé */ }
    return { boites: [], positions: {} };
  }

  // Met un plan de travail en accord avec la collection courante.
  function accorder(o) {
    const ids = new Set(coll.etres.map((e) => e.id));
    for (const id of Object.keys(o.positions)) if (!ids.has(id)) delete o.positions[id];
    // La collection a pu être modifiée depuis : attribut renommé (on suit le nouveau nom) ou supprimé.
    for (const b of o.boites) {
      if (b.attr && attrParId.has(b.attr)) {
        if (normaliser(b.texte || '') !== normaliser(nomAttr(b.attr))) b.texte = nomAttr(b.attr);
      } else {
        const a = trouverAttr(b.texte || '');
        b.attr = a ? a.id : null;
      }
    }
    return o;
  }

  /* ---------- Réglages d'accessibilité ---------- */

  // Taille du texte et des cartes, contraste élevé, couleurs pour daltoniens (palette validée + un symbole par attribut),
  // police plus lisible (OpenDyslexic, licence OFL, téléchargée seulement si elle est choisie), moins d'animations.
  // Gardés avec le travail (sauvegarde en ligne), comme le niveau ; posés sur <html> pour app/style.css.
  const CLE_ACCES = 'boites-a-classer:reglage:acces';
  // Progression du mode aventure (app/aventure.js), synchronisée : { v: 1, niveaux: { idCollection: { e: 1..3, t: ms, d: date } },
  // regions: { matière: date } }. Tout ce qui arrive d'ailleurs est vérifié et borné ici.
  const CLE_AVENTURE = 'boites-a-classer:jeu:aventure';
  function aventurePropre(o) {
    const propre = { v: 1, niveaux: {}, regions: {} };
    const date = (d) => (typeof d === 'string' && /^[0-9TZ:.+-]{1,40}$/.test(d) ? d : '');
    if (o && o.niveaux && typeof o.niveaux === 'object') {
      for (const [id, n] of Object.entries(o.niveaux).slice(0, 500)) {
        if (!idSur(id) || !n || ![1, 2, 3].includes(n.e)) continue;
        propre.niveaux[id] = { e: n.e, t: Number.isInteger(n.t) && n.t > 0 ? Math.min(n.t, 864e5) : 0, d: date(n.d) };
      }
    }
    if (o && o.regions && typeof o.regions === 'object') {
      for (const [m, d] of Object.entries(o.regions).slice(0, 50)) if (idSur(m) && date(d)) propre.regions[m] = date(d);
    }
    return propre;
  }
  const TAILLES = ['normale', 'grande', 'tres-grande'];
  const ZOOM_TAILLE = { normale: 1, grande: 1.2, 'tres-grande': 1.4 }; // le plan de travail grandit avec le texte
  const accesPropre = (o) => ({
    taille: o && TAILLES.includes(o.taille) ? o.taille : 'normale',
    contraste: !!(o && o.contraste === true),
    daltonien: !!(o && o.daltonien === true),
    police: !!(o && o.police === true),
    calme: !!(o && o.calme === true),
  });
  function lireAcces() {
    try { return accesPropre(JSON.parse(lire(CLE_ACCES))); } catch (e) { return accesPropre(null); }
  }
  // Palette catégorielle de référence, vérifiée pour les trois daltonismes (écarts ≥ 8) en clair et en sombre.
  const PALETTE_DALTONIENS = {
    clair: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    sombre: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  };
  const SYMBOLES = ['●', '▲', '■', '◆', '★', '✚', '▼', '⬟', '⬢', '✖', '◀', '▶', '♥', '♣', '♠'];
  const sombre = window.matchMedia('(prefers-color-scheme: dark)');

  // Couleur et symbole de chaque attribut de la collection affichée.
  function calculerAttributs() {
    const daltonien = lireAcces().daltonien;
    const palette = PALETTE_DALTONIENS[sombre.matches ? 'sombre' : 'clair'];
    attrParId = new Map(coll.attributs.map((a, i) => [a.id, {
      ...a,
      couleur: daltonien ? palette[i % palette.length] : a.couleur || PALETTE[i % PALETTE.length],
      symbole: SYMBOLES[i % SYMBOLES.length],
    }]));
  }

  function appliquerAcces() {
    const r = lireAcces();
    const h = document.documentElement;
    h.dataset.taille = r.taille;
    h.classList.toggle('contraste', r.contraste);
    h.classList.toggle('daltonien', r.daltonien);
    h.classList.toggle('police-lisible', r.police);
    h.classList.toggle('calme', r.calme);
  }

  function changerAcces(modif) {
    const avant = lireAcces();
    const r = accesPropre({ ...avant, ...modif });
    ecrire(CLE_ACCES, JSON.stringify(r));
    appliquerAcces();
    if (r.daltonien !== avant.daltonien) { calculerAttributs(); rendre(); }
    if (r.taille !== avant.taille) changerZoom(zoom * ZOOM_TAILLE[r.taille] / ZOOM_TAILLE[avant.taille]);
    remplirReglages();
  }
  appliquerAcces(); // dès le chargement, avant le premier dessin
  sombre.addEventListener('change', () => { if (coll && lireAcces().daltonien) { calculerAttributs(); rendre(); } });

  const fenReglages = $('#fen-reglages');
  function remplirReglages() {
    const r = lireAcces();
    for (const radio of fenReglages.querySelectorAll('input[name="taille"]')) radio.checked = radio.value === r.taille;
    for (const cle of ['contraste', 'daltonien', 'police', 'calme']) $('#rg-' + cle).checked = r[cle];
    $('#rg-voix').checked = voixActive();
    $('#rg-voix-ligne').hidden = !voixPossible;
  }
  function ouvrirReglages() {
    fermerMenu();
    remplirReglages();
    fenReglages.showModal();
  }
  for (const radio of fenReglages.querySelectorAll('input[name="taille"]')) radio.addEventListener('change', () => changerAcces({ taille: radio.value }));
  for (const cle of ['contraste', 'daltonien', 'police', 'calme']) $('#rg-' + cle).addEventListener('change', (ev) => changerAcces({ [cle]: ev.target.checked }));
  $('#rg-voix').addEventListener('change', (ev) => { if (ev.target.checked !== voixActive()) basculerVoix(); });
  $('#rg-defaut').addEventListener('click', () => changerAcces(accesPropre(null)));
  $('#rg-ok').addEventListener('click', () => fenReglages.close());

  /* ---------- Niveaux ---------- */

  // 🌱 Facile : les attributs de chaque carte en pastilles (de la couleur de leur boîte), et une carte posée dans une
  // boîte devient verte ou rouge tout de suite. 🌿 Normal : attributs au survol, vérification à la demande.
  // 🌳 Expert : attributs cachés (survol, lecteur d'écran, tableau des caractères), bilan sans le pourquoi, et un
  // trophée 🏆 par collection réussie. Le niveau suit l'élève (sauvegardé en ligne avec son travail).
  const NIVEAUX = {
    facile: { ico: '🌱', nom: 'Facile', detail: 'les couleurs des attributs sont sur les cartes, et une carte posée dans une boîte devient tout de suite verte ou rouge.' },
    normal: { ico: '🌿', nom: 'Normal', detail: 'les attributs s\'affichent quand on survole une carte, et on vérifie quand on veut.' },
    expert: { ico: '🌳', nom: 'Expert', detail: 'les attributs sont cachés, à toi de les connaître ! La vérification dit combien de cartes sont mal placées, pas pourquoi. Un trophée 🏆 par collection réussie.' },
  };
  const CLE_NIVEAU = 'boites-a-classer:reglage:niveau'; // « : » : ne peut pas être le plan de travail d'une collection
  const niveauValide = (n) => n === 'facile' || n === 'normal' || n === 'expert';
  // Élève d'une classe : son enseignant peut imposer le niveau (page « Mes classes », serveur/classes.js).
  const niveauImpose = () => { const e = jetonCompte() && eleveConnecte(); return e && niveauValide(e.niveau) ? e.niveau : null; };
  const niveau = () => { const n = niveauImpose() || lire(CLE_NIVEAU); return niveauValide(n) ? n : 'normal'; };
  const boutonNiveau = $('#niveau');
  let niveauAffiche = null; // niveau avec lequel les cartes sont dessinées (voir rendre)

  // Appelée aussi quand le compte change (majBoutonCompte) : niveau imposé ou levé, connexion, déconnexion.
  function majBoutonNiveau() {
    const d = NIVEAUX[niveau()];
    const impose = !!niveauImpose();
    boutonNiveau.querySelector('.niveau-ico').textContent = d.ico;
    boutonNiveau.querySelector('.niveau-nom').textContent = d.nom;
    boutonNiveau.title = `Niveau ${d.nom.toLowerCase()} : ${d.detail}` + (impose ? ' (choisi par ton enseignant)' : ' (appuie pour changer)');
    boutonNiveau.setAttribute('aria-label', `Niveau ${d.nom.toLowerCase()}` + (impose ? ', choisi par ton enseignant' : ', changer de niveau'));
    boutonNiveau.classList.toggle('impose', impose);
    document.body.dataset.niveau = niveau();
    // Un défi commencé à un autre niveau ne compte plus : pas de record en passant en facile pour voir les erreurs.
    if (coll && niveauAffiche !== null && niveauAffiche !== niveau()) {
      if (defi) arreterDefi();
      fermerBilan();
      rendre();
      majInfoDefaut();
    }
  }

  // pourquoi : précision ajoutée au message (« choisi par le lien »).
  function choisirNiveau(n, pourquoi) {
    if (!niveauValide(n)) return;
    if (niveauImpose()) {
      info.textContent = `🔒 Ton enseignant a choisi le niveau ${NIVEAUX[niveau()].nom.toLowerCase()} pour ta classe.`;
      return;
    }
    const avant = niveau();
    ecrire(CLE_NIVEAU, n);
    majBoutonNiveau();
    if (n === avant) return;
    const d = NIVEAUX[n];
    info.textContent = `${d.ico} Niveau ${d.nom.toLowerCase()}${pourquoi ? ' ' + pourquoi : ''} : ${d.detail}`;
  }

  function ouvrirMenuNiveau() {
    afficherMenu(boutonNiveau, 'niveau', (m) => {
      const titre = document.createElement('div');
      titre.className = 'menu-titre';
      titre.textContent = 'Niveau';
      m.appendChild(titre);
      const impose = !!niveauImpose();
      if (impose) {
        const note = document.createElement('p');
        note.className = 'menu-note';
        note.textContent = '🔒 Ton enseignant a choisi ce niveau pour ta classe.';
        m.appendChild(note);
      }
      for (const [cle, d] of Object.entries(NIVEAUX)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu-niveau';
        b.setAttribute('role', 'menuitemradio');
        b.setAttribute('aria-checked', String(cle === niveau()));
        const ico = document.createElement('span');
        ico.className = 'niveau-ico';
        ico.textContent = d.ico;
        const nom = document.createElement('strong');
        nom.textContent = d.nom;
        const detail = document.createElement('small');
        detail.textContent = d.detail.charAt(0).toUpperCase() + d.detail.slice(1);
        const texte = document.createElement('span');
        texte.append(nom, detail);
        b.append(ico, texte);
        b.disabled = impose && cle !== niveau();
        b.addEventListener('click', () => { fermerMenu(); choisirNiveau(cle); });
        m.appendChild(b);
      }
    }, 'menu-niveaux');
  }

  // Niveau facile : une carte posée dans une boîte (qui a un attribut) est verte si elle est à sa place, rouge sinon.
  // Hors de toute boîte, elle reste neutre : on peut d'abord poser les cartes, puis faire les boîtes.
  function marquerEnDirect() {
    if (niveau() !== 'facile') return;
    const { fautifs } = analyser();
    for (const e of coll.etres) {
      const el = elEtres.get(e.id);
      const p = etat.positions[e.id];
      if (!el || !p) continue;
      const c = centre(p);
      const range = etat.boites.some((b) => b.attr && contient(b, c.x, c.y));
      el.classList.toggle('ok', range && !fautifs.has(e.id));
      el.classList.toggle('faux', range && fautifs.has(e.id));
    }
  }

  /* ---------- Affichage ---------- */

  // etatOuvert : plan de travail lu dans un fichier, qui remplace celui gardé dans le navigateur.
  function choisirCollection(id, etatOuvert) {
    coll = toutes().find((c) => c.id === id) || FOURNIES[0];
    selColl.value = coll.id;
    calculerAttributs();
    appliquerAcces(); // les réglages ont pu arriver avec la sauvegarde en ligne
    etat = etatOuvert ? accorder(etatOuvert) : charger();
    histoire = { passe: [], futur: [], actuel: null };
    if (etatOuvert) sauver();
    histoire.actuel = JSON.stringify(etat);
    majBoutonsHistoire();
    if (defi && defi.collection !== coll.id) arreterDefi();
    majInfoDefaut();
    majBoutonNiveau(); // le niveau a pu arriver avec la sauvegarde en ligne
    plateau.dataset.vide = `Tous les ${elements()[1]} sont placés.`;
    document.title = `${coll.nom} · ${nomSite()}`; // onglets et favoris
    ecrire('boites-a-classer:collection', coll.id);
    window.dispatchEvent(new CustomEvent('boites:collection', { detail: { collection: coll.id } })); // mode aventure
    fermerBilan();
    rendre();
  }

  function rendre() {
    fermerMenu();
    niveauAffiche = niveau();
    calque.replaceChildren();
    plateau.replaceChildren();
    elBoites = new Map();
    elEtres = new Map();

    // Les grandes boîtes derrière, les petites devant : une boîte posée dans une autre reste accessible.
    const ordre = [...etat.boites].sort((a, b) => b.w * b.h - a.w * a.h);
    ordre.forEach((b, i) => {
      const el = creerBoite(b);
      el.style.zIndex = String(i + 1);
      elBoites.set(b.id, el);
      calque.appendChild(el);
    });

    for (const e of coll.etres) {
      const el = creerEtre(e);
      elEtres.set(e.id, el);
      const p = etat.positions[e.id];
      if (p) { placer(el, p); calque.appendChild(el); } else plateau.appendChild(el);
    }
    ajusterToile();
    marquerEnDirect();
    const planVide = document.getElementById('plan-vide');
    if (planVide) planVide.hidden = !!(etat.boites.length || Object.keys(etat.positions).length);
  }

  // Ligne d'information quand rien n'est survolé : dépend de la matière et du niveau.
  function majInfoDefaut() {
    const ancienInfo = infoDefaut;
    infoDefaut = niveau() === 'expert'
      ? `Niveau expert : les attributs des ${elements()[1]} sont cachés, à toi de les connaître !`
      : `Touche ou survole un ${elements()[0]} pour voir ses caractéristiques.`;
    if (info.textContent === ancienInfo) info.textContent = infoDefaut;
  }

  function placer(el, p) {
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
  }

  function majPositions() {
    for (const b of etat.boites) {
      const el = elBoites.get(b.id);
      if (!el) continue;
      placer(el, b);
      el.style.width = b.w + 'px';
      el.style.height = b.h + 'px';
    }
    for (const [id, p] of Object.entries(etat.positions)) {
      const el = elEtres.get(id);
      if (el) placer(el, p);
    }
  }

  function etendue() {
    let w = 0, h = 0;
    for (const b of etat.boites) { w = Math.max(w, b.x + b.w); h = Math.max(h, b.y + b.h); }
    for (const p of Object.values(etat.positions)) { w = Math.max(w, p.x + ETRE.l); h = Math.max(h, p.y + ETRE.h); }
    return { w, h };
  }

  // La toile a la taille du contenu zoomé (plus une marge) : c'est elle qui fixe la zone de défilement.
  function ajusterToile() {
    const { w, h } = etendue();
    const W = Math.max(w + 160, Math.floor(espace.clientWidth / zoom));
    const H = Math.max(h + 160, Math.floor(espace.clientHeight / zoom));
    calque.style.width = W + 'px';
    calque.style.height = H + 'px';
    calque.style.transform = `scale(${zoom})`;
    toile.style.width = Math.floor(W * zoom) + 'px';
    toile.style.height = Math.floor(H * zoom) + 'px';
    niveauZoom.textContent = Math.round(zoom * 100) + ' %';
  }

  function colorer(el, b) {
    const c = couleurBoite(b);
    el.style.setProperty('--c', c);
    el.style.setProperty('--c-fond', rgba(c, 0.09));
    const symbole = el.querySelector('.boite-symbole'); // couleurs pour daltoniens : le symbole de l'attribut
    if (symbole) symbole.textContent = b.attr && attrParId.has(b.attr) ? attrParId.get(b.attr).symbole : '';
  }

  function creerBoite(b) {
    const el = document.createElement('div');
    el.className = 'boite';
    el.dataset.id = b.id;
    placer(el, b);
    el.style.width = b.w + 'px';
    el.style.height = b.h + 'px';
    colorer(el, b);

    const tete = document.createElement('div');
    tete.className = 'boite-tete';

    const poignee = document.createElement('span');
    poignee.className = 'poignee';
    poignee.textContent = '⠿';
    // Clavier : flèches pour déplacer la boîte (avec ce qu'elle contient), Alt + flèches pour l'agrandir ou la réduire.
    poignee.tabIndex = 0;
    poignee.setAttribute('role', 'button');
    poignee.setAttribute('aria-label', 'Déplacer la boîte avec les flèches (Alt + flèches : changer sa taille)');
    poignee.addEventListener('keydown', (ev) => boiteAuClavier(ev, b));

    const titre = document.createElement('input');
    titre.className = 'boite-titre';
    titre.placeholder = 'Attribut…';
    titre.setAttribute('aria-label', 'Attribut de la boîte');
    titre.value = b.texte || '';
    titre.title = b.texte || ''; // le nom entier au survol quand la boîte est étroite
    titre.addEventListener('input', () => {
      b.texte = titre.value;
      titre.title = titre.value;
      const a = trouverAttr(titre.value);
      b.attr = a ? a.id : null;
      colorer(el, b);
      oublierVerification();
    });
    titre.addEventListener('change', sauver);
    titre.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') titre.blur(); });

    const btnMenu = document.createElement('button');
    btnMenu.className = 'boite-menu ouvre-menu';
    btnMenu.textContent = '▾';
    btnMenu.title = 'Choisir un attribut';
    btnMenu.setAttribute('aria-label', 'Choisir un attribut');
    btnMenu.setAttribute('aria-haspopup', 'menu');
    btnMenu.addEventListener('click', (ev) => { ev.stopPropagation(); ouvrirMenu(btnMenu, b); });

    const btnSuppr = document.createElement('button');
    btnSuppr.className = 'boite-suppr';
    btnSuppr.textContent = '×';
    btnSuppr.title = 'Supprimer la boîte';
    btnSuppr.setAttribute('aria-label', 'Supprimer la boîte');
    btnSuppr.addEventListener('click', () => {
      etat.boites = etat.boites.filter((x) => x !== b);
      sauver();
      oublierVerification();
      rendre();
    });

    const symbole = document.createElement('span');
    symbole.className = 'boite-symbole';
    symbole.setAttribute('aria-hidden', 'true');
    tete.append(poignee, symbole, titre, btnMenu, btnSuppr);
    el.append(tete);
    colorer(el, b); // le symbole de l'attribut, maintenant que le bandeau existe

    // Souris : on saisit la boîte par son bandeau ou son fond.
    // Doigt : seulement par le bandeau (titre compris : un appui écrit, un glisser déplace),
    // pour que le fond de la boîte laisse défiler le plan de travail.
    el.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button, .boite-coin')) return;
      const doigt = ev.pointerType === 'touch';
      if (ev.target.closest('input')) {
        if (doigt) glisserBoite(ev, b, SEUIL);
        return;
      }
      if (doigt && !ev.target.closest('.boite-tete')) return;
      glisserBoite(ev, b, 0);
    });
    el.title = 'Glisser pour déplacer la boîte et son contenu';

    const coin = document.createElement('div');
    coin.className = 'boite-coin';
    coin.title = 'Glisser pour agrandir';
    coin.addEventListener('pointerdown', (ev) => redimensionner(ev, b, el));

    el.append(coin);
    return el;
  }

  function creerEtre(e) {
    const el = document.createElement('div');
    el.className = 'etre';
    el.dataset.id = e.id;

    const ico = document.createElement('span');
    ico.className = 'etre-ico';
    if (e.image) {
      const img = document.createElement('img');
      img.src = e.image;
      img.alt = '';
      img.draggable = false;
      ico.appendChild(img);
    } else {
      ico.textContent = e.emoji || '❓';
    }

    const nom = document.createElement('span');
    nom.className = 'etre-nom';
    nom.textContent = e.nom;

    el.append(ico, nom);
    // Niveau facile : une pastille par attribut, de la couleur de sa boîte.
    if (niveau() === 'facile' && e.attributs.length) {
      const attrs = document.createElement('span');
      attrs.className = 'etre-attrs';
      attrs.setAttribute('aria-hidden', 'true');
      for (const id of e.attributs) {
        const a = attrParId.get(id);
        if (!a) continue;
        const p = document.createElement('i');
        p.style.setProperty('--c', a.couleur);
        p.textContent = a.symbole; // affiché seulement avec les couleurs pour daltoniens (style.css)
        attrs.appendChild(p);
      }
      el.classList.add('avec-attrs');
      el.appendChild(attrs);
    }
    el.addEventListener('pointerenter', () => montrerInfo(e));
    el.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType === 'mouse') info.textContent = infoDefaut;
    });
    el.addEventListener('pointerdown', (ev) => glisserEtre(ev, el, e));
    // Clavier : Tab pour choisir une carte, Entrée pour la poser sur le plan (ou la remettre en bas), flèches pour la
    // déplacer (Maj + flèche : plus vite).
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', niveau() === 'expert' ? e.nom : `${e.nom} : ${e.attributs.map(nomAttr).join(', ')}`);
    el.addEventListener('focus', () => montrerInfo(e));
    el.addEventListener('keydown', (ev) => deplacerAuClavier(ev, e));
    return el;
  }

  function boiteAuClavier(ev, b) {
    const pas = ev.shiftKey ? 40 : 8;
    const fleches = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
    if (!fleches[ev.key]) return;
    ev.preventDefault();
    const [dx, dy] = fleches[ev.key];
    if (ev.altKey) {
      b.w = Math.max(BOITE_MIN.l, b.w + dx);
      b.h = Math.max(BOITE_MIN.h, b.h + dy);
    } else {
      const mx = Math.max(-b.x, dx), my = Math.max(-b.y, dy);
      for (const [id, p] of Object.entries(etat.positions)) {
        const c = centre(p);
        if (contient(b, c.x, c.y)) etat.positions[id] = { x: p.x + mx, y: p.y + my };
      }
      for (const c of etat.boites) if (c !== b && englobe(b, c)) { c.x += mx; c.y += my; }
      b.x += mx;
      b.y += my;
    }
    oublierVerification();
    sauver();
    rendre();
    const el = elBoites.get(b.id);
    if (el) el.querySelector('.poignee').focus();
  }

  function deplacerAuClavier(ev, e) {
    const pas = ev.shiftKey ? 40 : 8;
    const fleches = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
    const p = etat.positions[e.id];
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (p) delete etat.positions[e.id];
      else {
        // Au milieu de la partie visible du plan de travail.
        const r = espace.getBoundingClientRect();
        const c = versCalque(r.left + r.width / 2, r.top + r.height / 2);
        etat.positions[e.id] = borner({ x: c.x - ETRE.l / 2, y: c.y - ETRE.h / 2 });
      }
    } else if (fleches[ev.key] && p) {
      ev.preventDefault();
      const [dx, dy] = fleches[ev.key];
      etat.positions[e.id] = borner({ x: p.x + dx, y: p.y + dy });
    } else return;
    oublierVerification();
    sauver();
    rendre();
    const el = elEtres.get(e.id);
    if (el) el.focus({ preventScroll: !etat.positions[e.id] });
  }

  function montrerInfo(e) {
    if (niveau() === 'expert') {
      info.textContent = `${e.emoji || ''} ${e.nom} · 🌳 à toi de trouver ses attributs`.trim();
      dire(e.nom, coll.langue);
      return;
    }
    info.textContent = `${e.emoji || ''} ${e.nom} : ${e.attributs.map(nomAttr).join(', ')}`.trim();
    dire(`${e.nom} : ${e.attributs.map(nomAttr).join(', ')}`, coll.langue);
  }

  /* ---------- Glisser-déposer ---------- */

  // Suit le pointeur jusqu'au relâchement (souris, doigt ou stylet).
  function suivre(bouger, finir) {
    const fin = (ev) => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', fin);
      finir(ev);
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', fin);
  }

  function glisserEtre(ev, el, e) {
    if (ev.button !== 0) return;
    if (ev.pointerType !== 'touch') ev.preventDefault();
    montrerInfo(e);

    const r = el.getBoundingClientRect();
    const rx = (ev.clientX - r.left) / r.width;
    const ry = (ev.clientY - r.top) / r.height;
    let actif = false;

    // Le glisser ne commence qu'après un petit déplacement : un simple appui affiche les caractéristiques,
    // et dans la réserve un geste horizontal fait défiler la liste au lieu de saisir la carte.
    const bouger = (m) => {
      if (!actif) {
        if (Math.hypot(m.clientX - ev.clientX, m.clientY - ev.clientY) < SEUIL) return;
        actif = true;
        fermerMenu();
        oublierVerification();
        el.classList.add('en-main');
        el.style.transformOrigin = `${rx * 100}% ${ry * 100}%`;
        el.style.transform = `scale(${zoom})`;
        document.body.appendChild(el);
      }
      el.style.left = (m.clientX - rx * ETRE.l) + 'px';
      el.style.top = (m.clientY - ry * ETRE.h) + 'px';
    };

    suivre(bouger, (u) => {
      if (!actif) return;
      el.remove();
      if (u.type !== 'pointercancel') {
        if (dansRect(u.clientX, u.clientY, espace.getBoundingClientRect())) {
          const p = versCalque(u.clientX, u.clientY);
          etat.positions[e.id] = borner({ x: p.x - rx * ETRE.l, y: p.y - ry * ETRE.h });
        } else {
          delete etat.positions[e.id];
        }
        sauver();
      }
      rendre();
    });
  }

  function glisserBoite(ev, b, seuil) {
    if (ev.button !== 0) return;
    if (!seuil) ev.preventDefault();
    let actif = !seuil;
    if (actif) { fermerMenu(); oublierVerification(); }

    // La boîte emporte ce qu'elle contient : êtres vivants et boîtes intérieures.
    const etres = Object.entries(etat.positions)
      .filter(([, p]) => { const c = centre(p); return contient(b, c.x, c.y); })
      .map(([id, p]) => ({ id, x: p.x, y: p.y }));
    const boites = etat.boites.filter((c) => c !== b && englobe(b, c)).map((c) => ({ c, x: c.x, y: c.y }));
    const x0 = b.x, y0 = b.y;

    suivre((m) => {
      if (!actif) {
        if (Math.hypot(m.clientX - ev.clientX, m.clientY - ev.clientY) < seuil) return;
        actif = true;
        fermerMenu();
        oublierVerification();
        if (document.activeElement) document.activeElement.blur();
      }
      const dx = Math.max(-x0, Math.round((m.clientX - ev.clientX) / zoom));
      const dy = Math.max(-y0, Math.round((m.clientY - ev.clientY) / zoom));
      b.x = x0 + dx;
      b.y = y0 + dy;
      for (const o of boites) { o.c.x = o.x + dx; o.c.y = o.y + dy; }
      for (const o of etres) etat.positions[o.id] = { x: o.x + dx, y: o.y + dy };
      majPositions();
    }, () => { if (actif) { sauver(); rendre(); } });
  }

  function redimensionner(ev, b, el) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    fermerMenu();
    oublierVerification();
    const w0 = b.w, h0 = b.h;
    suivre((m) => {
      b.w = Math.max(BOITE_MIN.l, Math.round(w0 + (m.clientX - ev.clientX) / zoom));
      b.h = Math.max(BOITE_MIN.h, Math.round(h0 + (m.clientY - ev.clientY) / zoom));
      el.style.width = b.w + 'px';
      el.style.height = b.h + 'px';
    }, () => { sauver(); rendre(); });
  }

  /* ---------- Zoom ---------- */

  const zoomParDefaut = () => (petitEcran.matches ? 0.8 : 1);

  // Change le zoom en gardant immobile le point visé (par défaut, le centre du plan de travail).
  function changerZoom(z, point) {
    const re = espace.getBoundingClientRect();
    const px = point ? point.x : re.left + espace.clientWidth / 2;
    const py = point ? point.y : re.top + espace.clientHeight / 2;
    const vise = versCalque(px, py);
    zoom = borne(Math.round(z * 100) / 100, ZOOM.min, ZOOM.max);
    ecrire('boites-a-classer:zoom', String(zoom));
    ajusterToile();
    espace.scrollLeft = vise.x * zoom - (px - re.left);
    espace.scrollTop = vise.y * zoom - (py - re.top);
  }

  function toutVoir() {
    const { w, h } = etendue();
    if (!w || !h) { changerZoom(zoomParDefaut()); return; }
    zoom = borne(Math.min(espace.clientWidth / (w + 16), espace.clientHeight / (h + 16), 1.2), ZOOM.min, ZOOM.max);
    zoom = Math.floor(zoom * 100) / 100;
    ecrire('boites-a-classer:zoom', String(zoom));
    ajusterToile();
    espace.scrollLeft = 0;
    espace.scrollTop = 0;
  }

  $('#zoom-moins').addEventListener('click', () => changerZoom(zoom / 1.2));
  $('#zoom-plus').addEventListener('click', () => changerZoom(zoom * 1.2));
  $('#zoom-tout').addEventListener('click', toutVoir);
  // Ctrl + molette, ou pincement sur le pavé tactile d'un ordinateur portable.
  espace.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    changerZoom(zoom * Math.exp(-ev.deltaY / 300), { x: ev.clientX, y: ev.clientY });
  }, { passive: false });

  /* ---------- Export PDF ---------- */

  const POLICE = 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif';

  function bornes() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ajout = (x, y, l, h) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + l); y1 = Math.max(y1, y + h);
    };
    for (const b of etat.boites) ajout(b.x, b.y, b.w, b.h);
    for (const p of Object.values(etat.positions)) ajout(p.x, p.y, ETRE.l, ETRE.h);
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }

  function rectArrondi(g, x, y, l, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + l, y, x + l, y + h, r);
    g.arcTo(x + l, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + l, y, r);
    g.closePath();
  }

  // Raccourcit un texte (avec « … ») pour qu'il tienne dans la largeur donnée.
  function ajuster(g, texte, largeur) {
    if (g.measureText(texte).width <= largeur) return texte;
    let t = texte;
    while (t.length > 1 && g.measureText(t + '…').width > largeur) t = t.slice(0, -1);
    return t + '…';
  }

  function lignes(g, texte, largeur) {
    const mots = texte.split(' ');
    const res = [];
    let ligne = '';
    for (const m of mots) {
      const essai = ligne ? ligne + ' ' + m : m;
      if (ligne && g.measureText(essai).width > largeur) { res.push(ligne); ligne = m; } else ligne = essai;
    }
    if (ligne) res.push(ligne);
    return res;
  }

  // Images (photos) des êtres vivants placés, chargées avant de dessiner la page.
  function chargerImages() {
    const avecImage = coll.etres.filter((e) => e.image && etat.positions[e.id]);
    return Promise.all(avecImage.map((e) => new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok([e.id, img]);
      img.onerror = () => ok(null);
      img.src = e.image;
    }))).then((l) => new Map(l.filter(Boolean)));
  }

  // Dessine une page A4 (200 ppp) : titre, date, plan de travail mis à l'échelle, êtres vivants non placés.
  function dessinerPage(images) {
    const zoneContenu = bornes();
    const portrait = zoneContenu && (zoneContenu.y1 - zoneContenu.y0) > (zoneContenu.x1 - zoneContenu.x0) * 1.15;
    const P = portrait ? { l: 1654, h: 2339 } : { l: 2339, h: 1654 };
    const toileA4 = document.createElement('canvas');
    toileA4.width = P.l;
    toileA4.height = P.h;
    const g = toileA4.getContext('2d');
    const marge = 100;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, P.l, P.h);

    g.fillStyle = '#1f2430';
    g.font = `700 54px ${POLICE}`;
    g.fillText(ajuster(g, 'Boîtes à classer — ' + coll.nom, P.l - 2 * marge), marge, marge + 40);
    g.font = `400 32px ${POLICE}`;
    g.fillStyle = '#5f6675';
    g.fillText(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), marge, marge + 100);
    const nom = 'Nom : ..................................................';
    g.fillText(nom, P.l - marge - g.measureText(nom).width, marge + 100);
    g.fillStyle = '#1f2430';
    g.fillRect(marge, marge + 130, P.l - 2 * marge, 3);

    const restants = coll.etres.filter((e) => !etat.positions[e.id]);
    g.font = `400 30px ${POLICE}`;
    const texteRestants = restants.length
      ? lignes(g, 'Non placés : ' + restants.map((e) => e.nom).join(', '), P.l - 2 * marge)
      : [];
    const zone = { x: marge, y: marge + 175, l: P.l - 2 * marge };
    zone.h = P.h - zone.y - marge - texteRestants.length * 44;

    if (!zoneContenu) {
      g.fillStyle = '#5f6675';
      g.font = `400 36px ${POLICE}`;
      g.fillText('Aucune boîte ni aucun être vivant placé.', zone.x, zone.y + 60);
    } else {
      const l = zoneContenu.x1 - zoneContenu.x0, h = zoneContenu.y1 - zoneContenu.y0;
      const ech = Math.min(zone.l / l, zone.h / h, 2.6);
      g.save();
      g.translate(zone.x, zone.y);
      g.scale(ech, ech);
      g.translate(-zoneContenu.x0, -zoneContenu.y0);

      for (const b of [...etat.boites].sort((a, c) => c.w * c.h - a.w * a.h)) {
        const c = couleurBoite(b);
        rectArrondi(g, b.x, b.y, b.w, b.h, 10);
        g.fillStyle = rgba(c, 0.09);
        g.fill();
        g.save();
        g.clip();
        g.fillStyle = c;
        g.fillRect(b.x, b.y, b.w, 30);
        g.restore();
        rectArrondi(g, b.x, b.y, b.w, b.h, 10);
        g.lineWidth = 3;
        g.strokeStyle = c;
        g.stroke();
        g.fillStyle = '#ffffff';
        g.font = `700 15px ${POLICE}`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(ajuster(g, b.texte || '(sans attribut)', b.w - 20), b.x + 10, b.y + 16);
      }

      for (const e of coll.etres) {
        const p = etat.positions[e.id];
        if (!p) continue;
        rectArrondi(g, p.x, p.y, ETRE.l, ETRE.h, 10);
        g.fillStyle = '#ffffff';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#c9c2b2';
        g.stroke();
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#1f2430';
        g.font = `30px ${POLICE}`;
        const img = images.get(e.id);
        if (img) {
          const ech = Math.min(40 / img.naturalWidth, 40 / img.naturalHeight);
          const l = img.naturalWidth * ech, h = img.naturalHeight * ech;
          g.drawImage(img, p.x + (ETRE.l - l) / 2, p.y + 30 - h / 2, l, h);
        } else {
          g.fillText(e.emoji || '❓', p.x + ETRE.l / 2, p.y + 30);
        }
        g.font = `500 12px ${POLICE}`;
        g.fillText(ajuster(g, e.nom, ETRE.l - 6), p.x + ETRE.l / 2, p.y + 60);
      }
      g.restore();
    }

    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#5f6675';
    g.font = `400 30px ${POLICE}`;
    texteRestants.forEach((t, i) => g.fillText(t, marge, P.h - marge - (texteRestants.length - 1 - i) * 44));
    return { toileA4, portrait };
  }

  // Fabrique un PDF d'une page contenant l'image JPEG en pleine page.
  function pdfDepuisJpeg(jpeg, larg, haut, portrait) {
    const W = portrait ? 595.28 : 841.89;
    const H = portrait ? 841.89 : 595.28;
    const enc = new TextEncoder();
    const morceaux = [];
    const positions = [];
    let taille = 0;
    const ajouter = (x) => {
      const b = typeof x === 'string' ? enc.encode(x) : x;
      morceaux.push(b);
      taille += b.length;
    };
    const objet = (n, ...corps) => {
      positions[n] = taille;
      ajouter(`${n} 0 obj\n`);
      corps.forEach(ajouter);
      ajouter('\nendobj\n');
    };
    const dessin = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;

    ajouter('%PDF-1.4\n');
    ajouter(new Uint8Array([37, 226, 227, 207, 211, 10]));
    objet(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objet(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objet(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    objet(4, `<< /Type /XObject /Subtype /Image /Width ${larg} /Height ${haut} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream');
    objet(5, `<< /Length ${dessin.length} >>\nstream\n${dessin}\nendstream`);
    const debutXref = taille;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) xref += String(positions[i]).padStart(10, '0') + ' 00000 n \n';
    ajouter(`${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`);
    return new Blob(morceaux, { type: 'application/pdf' });
  }

  async function exporterPdf() {
    fermerMenu();
    info.textContent = 'Préparation du PDF…';
    try {
      const { toileA4, portrait } = dessinerPage(await chargerImages());
      const image = await new Promise((ok) => toileA4.toBlob(ok, 'image/jpeg', 0.9));
      const jpeg = new Uint8Array(await image.arrayBuffer());
      const pdf = pdfDepuisJpeg(jpeg, toileA4.width, toileA4.height, portrait);
      const nom = nomDeFichier(`Boîtes à classer - ${coll.nom} - ${new Date().toISOString().slice(0, 10)}`, 'pdf');
      const r = await enregistrerFichier(pdf, nom, { titre: 'Enregistrer en PDF', nom: 'PDF', extension: 'pdf' });
      info.textContent = r ? compteRendu(r, 'PDF') : infoDefaut;
    } catch (e) {
      info.textContent = 'Impossible de créer le PDF : ' + (e && e.message ? e.message : e);
    }
  }

  // Même page que le PDF, en image PNG (à coller dans un document ou à envoyer).
  async function exporterImage() {
    fermerMenu();
    info.textContent = 'Préparation de l\'image…';
    try {
      const { toileA4 } = dessinerPage(await chargerImages());
      const png = await new Promise((ok) => toileA4.toBlob(ok, 'image/png'));
      const nom = nomDeFichier(`Boîtes à classer - ${coll.nom} - ${new Date().toISOString().slice(0, 10)}`, 'png');
      const r = await enregistrerFichier(png, nom, { titre: 'Enregistrer en image', nom: 'Image PNG', extension: 'png' });
      info.textContent = r ? compteRendu(r, 'Fichier image') : infoDefaut;
    } catch (e) {
      info.textContent = 'Impossible de créer l\'image : ' + (e && e.message ? e.message : e);
    }
  }

  /* ---------- Fichiers : enregistrer, ouvrir ---------- */

  // Dans l'application de bureau (Neutralino), on passe par les fenêtres « Enregistrer sous » et « Ouvrir » du système.
  // build.sh ajoute à la page de bureau les scripts qui connectent Neutralino (desktop/neutralino-init.js).
  const natif = () => (window.Neutralino && window.NL_PRET ? window.Neutralino : null);
  const FORMAT = 'boites-a-classer';
  const EXTENSION = 'boites';
  const LIMITES = { attributs: 40, etres: 80, boites: 300, texte: 60, image: 300000, fichier: 20e6 };

  // Fenêtre ouverte au premier plan (l'éditeur s'ouvre par-dessus la liste des collections) : hors d'elle, tout est inactif.
  const fenetreActive = () => [...document.querySelectorAll('dialog[open]')].pop() || null;

  const nomDeFichier = (base, extension) => `${base.replace(/[\\/:*?"<>|]+/g, '-').trim()}.${extension}`;

  function compteRendu(r, quoi) {
    if (r.mode === 'enregistre') return `${quoi} enregistré : ${r.nom}`;
    if (r.mode === 'partage') return `${quoi} partagé.`;
    return `${quoi} téléchargé : ${r.nom}`;
  }

  // Bureau : « Enregistrer sous ». Téléphone : menu de partage s'il accepte ce type de fichier. Sinon : téléchargement.
  // Renvoie null si l'utilisateur a renoncé.
  async function enregistrerFichier(blob, nom, filtre) {
    const N = natif();
    if (N) {
      let dossier = '';
      try { dossier = await N.os.getPath('documents'); } catch (e) { /* dossier par défaut */ }
      const chemin = await N.os.showSaveDialog(filtre.titre, {
        defaultPath: dossier ? `${dossier}/${nom}` : nom,
        filters: [{ name: filtre.nom, extensions: [filtre.extension] }],
      });
      if (!chemin) return null;
      const fichier = chemin.toLowerCase().endsWith('.' + filtre.extension) ? chemin : `${chemin}.${filtre.extension}`;
      await N.filesystem.writeBinaryFile(fichier, await blob.arrayBuffer());
      return { mode: 'enregistre', nom: fichier };
    }

    const fichier = new File([blob], nom, { type: blob.type });
    if (tactile.matches && navigator.canShare && navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: nom });
        return { mode: 'partage', nom };
      } catch (e) {
        if (e.name === 'AbortError') return null;
        // Partage refusé : on télécharge à la place.
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    (fenetreActive() || document.body).appendChild(a); // hors de la fenêtre ouverte, le lien serait inactif
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { mode: 'telecharge', nom };
  }

  // Demande un fichier à l'utilisateur. Renvoie { nom, octets } ou null s'il renonce.
  // À appeler directement depuis un clic : le navigateur n'ouvre la fenêtre de choix qu'à cette condition.
  function ouvrirFichier({ titre, nom, extensions, accept }) {
    const N = natif();
    if (N) {
      return N.os.showOpenDialog(titre, { filters: [{ name: nom, extensions }, { name: 'Tous les fichiers', extensions: ['*'] }] })
        .then(async (chemins) => {
          if (!chemins || !chemins.length) return null;
          const octets = await N.filesystem.readBinaryFile(chemins[0]);
          if (octets.byteLength > LIMITES.fichier) throw new Error('fichier trop gros');
          return { nom: chemins[0].split(/[\\/]/).pop(), octets };
        });
    }
    return new Promise((ok, ko) => {
      const choix = document.createElement('input');
      choix.type = 'file';
      choix.hidden = true;
      if (accept) choix.accept = accept;
      choix.addEventListener('change', () => {
        const f = choix.files[0];
        choix.remove();
        if (!f) { ok(null); return; }
        if (f.size > LIMITES.fichier) { ko(new Error('fichier trop gros')); return; }
        f.arrayBuffer().then((octets) => ok({ nom: f.name, octets }), ko);
      });
      choix.addEventListener('cancel', () => { choix.remove(); ok(null); });
      (fenetreActive() || document.body).appendChild(choix);
      choix.click();
    });
  }

  /* Format des fichiers .boites (JSON) :
     { format: 'boites-a-classer', type: 'travail', version: 1, logiciel, date, collection, etat }
     { format: 'boites-a-classer', type: 'collection', version: 1, logiciel, collection }
     La collection est toujours incluse : le fichier s'ouvre même chez quelqu'un qui ne l'a pas.
     Ces fichiers circulent entre élèves et enseignants : tout ce qu'on y lit est vérifié et borné. */

  const idSur = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(v) && v !== '__proto__' ? v : '');
  const texteSur = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const IMAGE_SURE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

  function nettoyerCollection(c) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.attributs) || !Array.isArray(c.etres)) {
      throw new Error('la collection est illisible');
    }
    const attributs = [];
    const idsA = new Set();
    for (const a of c.attributs.slice(0, LIMITES.attributs)) {
      const id = idSur(a && a.id), nom = texteSur(a && a.nom, LIMITES.texte);
      if (!id || !nom || idsA.has(id)) continue;
      idsA.add(id);
      const o = { id, nom };
      if (typeof a.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(a.couleur)) o.couleur = a.couleur;
      attributs.push(o);
    }
    const etres = [];
    const idsE = new Set();
    for (const e of c.etres.slice(0, LIMITES.etres)) {
      const id = idSur(e && e.id), nom = texteSur(e && e.nom, LIMITES.texte);
      if (!id || !nom || idsE.has(id)) continue;
      idsE.add(id);
      const o = { id, nom };
      const emoji = texteSur(e.emoji, 16);
      if (emoji) o.emoji = emoji;
      if (typeof e.image === 'string' && e.image.length <= LIMITES.image && IMAGE_SURE.test(e.image)) o.image = e.image;
      o.attributs = Array.isArray(e.attributs) ? [...new Set(e.attributs.filter((x) => idsA.has(x)))] : [];
      etres.push(o);
    }
    if (!attributs.length || !etres.length) throw new Error('la collection est vide');
    const propre = { id: idSur(c.id) || nouvelId('perso-'), nom: texteSur(c.nom, LIMITES.texte) || 'Collection sans nom', attributs, etres };
    if (MATIERES.some(([m]) => m === c.matiere)) propre.matiere = c.matiere; // rangée avec sa matière dans la liste
    return propre;
  }

  function nettoyerEtat(o, c) {
    const res = { boites: [], positions: {} };
    if (!o || typeof o !== 'object') return res;
    const idsB = new Set();
    for (const b of Array.isArray(o.boites) ? o.boites.slice(0, LIMITES.boites) : []) {
      if (!b || typeof b !== 'object') continue;
      const [x, y, w, h] = [b.x, b.y, b.w, b.h].map(Number);
      if (![x, y, w, h].every(Number.isFinite)) continue;
      let id = idSur(b.id);
      if (!id || idsB.has(id)) id = nouvelId('b');
      idsB.add(id);
      res.boites.push({
        id,
        ...borner({ x, y }),
        w: borne(Math.round(w), BOITE_MIN.l, MAX_XY),
        h: borne(Math.round(h), BOITE_MIN.h, MAX_XY),
        attr: idSur(b.attr) || null,
        texte: texteSur(b.texte, LIMITES.texte),
      });
    }
    if (o.positions && typeof o.positions === 'object') {
      for (const e of c.etres) {
        const p = Object.prototype.hasOwnProperty.call(o.positions, e.id) ? o.positions[e.id] : null;
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) res.positions[e.id] = borner(p);
      }
    }
    return res;
  }

  function lireContenu(octets) {
    let o = null;
    try { o = JSON.parse(new TextDecoder().decode(octets)); } catch (e) { /* pas du JSON */ }
    if (!o || o.format !== FORMAT) throw new Error("ce n'est pas un fichier Boîtes à classer");
    if (o.type === 'sauvegarde') {
      if (!o.donnees || typeof o.donnees !== 'object') throw new Error('la sauvegarde est illisible');
      return { type: 'sauvegarde', donnees: o.donnees };
    }
    const collection = nettoyerCollection(o.collection);
    if (o.type === 'collection') return { type: 'collection', collection };
    if (o.type === 'travail') return { type: 'travail', collection, etat: nettoyerEtat(o.etat, collection) };
    throw new Error("ce n'est pas un fichier Boîtes à classer");
  }

  const copieCollection = (c) => JSON.parse(JSON.stringify({ id: c.id, nom: c.nom, matiere: c.matiere, attributs: c.attributs, etres: c.etres }));
  const signature = (c) => JSON.stringify([
    c.attributs.map((a) => [a.id, a.nom]),
    c.etres.map((e) => [e.id, e.nom, e.emoji || '', e.image || '', e.attributs]),
  ]);

  function nomLibre(nom, sauf) {
    const pris = new Set(toutes().filter((c) => c.id !== sauf).map((c) => normaliser(c.nom)));
    if (!pris.has(normaliser(nom))) return nom;
    for (let i = 2; ; i++) if (!pris.has(normaliser(`${nom} (${i})`))) return `${nom} (${i})`;
  }

  // Retrouve la collection d'un fichier parmi celles qu'on a déjà, ou l'ajoute à « Mes collections ».
  // Une collection différente de celle qu'on a sous le même identifiant est ajoutée à côté : rien n'est écrasé.
  function integrerCollection(c) {
    const fournie = FOURNIES.find((x) => x.id === c.id) || collectionsSite.find((x) => x.id === c.id);
    if (fournie) return fournie;
    const sig = signature(c);
    const deja = mesCollections.find((x) => x.id === c.id && signature(x) === sig)
      || mesCollections.find((x) => signature(x) === sig);
    if (deja) return deja;
    const libre = c.id.startsWith('perso-') && !mesCollections.some((x) => x.id === c.id);
    const nouvelle = { ...c, id: libre ? c.id : nouvelId('perso-'), nom: nomLibre(c.nom) };
    sauverMesCollections([...mesCollections, nouvelle]);
    return nouvelle;
  }

  async function enregistrerTravail() {
    const contenu = {
      format: FORMAT, type: 'travail', version: 1, logiciel: VERSION, date: new Date().toISOString(),
      collection: copieCollection(coll), etat,
    };
    const blob = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
    const nom = nomDeFichier(`${coll.nom} - ${new Date().toISOString().slice(0, 10)}`, EXTENSION);
    try {
      const r = await enregistrerFichier(blob, nom, { titre: 'Enregistrer mon travail', nom: 'Boîtes à classer', extension: EXTENSION });
      info.textContent = r ? compteRendu(r, 'Travail') : infoDefaut;
    } catch (e) {
      info.textContent = "Impossible d'enregistrer : " + (e && e.message ? e.message : e);
    }
  }

  async function exporterCollection(c) {
    const contenu = { format: FORMAT, type: 'collection', version: 1, logiciel: VERSION, collection: copieCollection(c) };
    const blob = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
    const r = await enregistrerFichier(blob, nomDeFichier(`Collection - ${c.nom}`, EXTENSION),
      { titre: 'Exporter la collection', nom: 'Boîtes à classer', extension: EXTENSION });
    return r && compteRendu(r, 'Fichier');
  }

  // Ouvre un fichier .boites : un travail (il remplace le plan de travail de sa collection) ou une collection.
  async function ouvrir() {
    try {
      const f = await ouvrirFichier({
        titre: 'Ouvrir un fichier Boîtes à classer',
        nom: 'Boîtes à classer',
        extensions: [EXTENSION, 'json'],
        accept: tactile.matches ? '' : `.${EXTENSION},.json,application/json`, // iPhone et iPad grisent les extensions qu'ils ne connaissent pas
      });
      if (!f) return;
      const lu = lireContenu(f.octets);
      if (lu.type === 'sauvegarde') {
        const n = importerSauvegarde(lu.donnees);
        fermerFenetres();
        choisirCollection(lire('boites-a-classer:collection') || coll.id);
        info.textContent = n
          ? `Sauvegarde récupérée : ${pluriel(n, 'élément', 'éléments')}.`
          : 'Rien de nouveau dans cette sauvegarde : tout était déjà là.';
        return;
      }
      // Un fichier de travail apporte sa collection ; un fichier de collection seule est réservé à l'admin.
      if (lu.type === 'collection' && !peutCreer()) throw new Error('seuls les enseignants et les administrateurs peuvent ajouter une collection');
      const c = integrerCollection(lu.collection);
      fermerFenetres();
      if (lu.type === 'travail') {
        choisirCollection(c.id, lu.etat);
        toutVoir();
        info.textContent = `Travail ouvert : ${f.nom}`;
      } else {
        choisirCollection(c.id);
        info.textContent = estPerso(c)
          ? `Collection « ${c.nom} » ajoutée à Mes collections.`
          : `Collection « ${c.nom} » ouverte.`;
      }
    } catch (e) {
      signaler("Impossible d'ouvrir ce fichier : " + (e && e.message ? e.message : e));
    }
  }

  // Message dans la fenêtre ouverte s'il y en a une (sinon il serait caché derrière), ou dans la barre d'information.
  function signaler(texte) {
    const zone = fenetreActive() && fenetreActive().querySelector('.message');
    if (zone) zone.textContent = texte; else info.textContent = texte;
  }

  /* ---------- Déménagement depuis l'ancienne adresse du site ---------- */

  // Le site était à l'adresse guy-demessimy.github.io/boites-a-classer. Le navigateur y garde ce qui a été fait,
  // et cette mémoire ne suit pas un changement d'adresse : l'ancienne adresse renvoie donc ici en joignant,
  // après « #transfert= », ce qu'elle avait gardé (voir redirection/demenagement.js). Le fragment n'est jamais envoyé au serveur.
  // Le même contenu peut aussi arriver dans un fichier « sauvegarde » quand il est trop gros pour l'adresse.

  // Récupère ces données sans jamais remplacer ce qui existe déjà ici, sauf avec « ecraser » (version reçue de la
  // sauvegarde en ligne, qui devient alors l'état de ce navigateur). Renvoie le nombre d'éléments récupérés.
  function importerSauvegarde(donnees, ecraser) {
    const PREFIXE = 'boites-a-classer:';
    // Progression (une date) : « reussi:<id> », « expert:<id> », « defi-fait:<id> », « avent:AAAA-MM-JJ ».
    // À côté, le cadre choisi et le niveau déjà fêté. Avant la 3.31.0, la progression était envoyée mais pas reprise :
    // une version reçue l'effaçait de ce navigateur. « cadre » et « niveau-vu » passent le filtre (ce sont des id simples)
    // mais aucune collection ne porte ce nom : sans branche à eux, ils n'étaient jamais écrits.
    const PROGRES = /^(reussi|expert|defi-fait):[A-Za-z0-9_-]{1,60}$|^avent:\d{4}-\d{2}-\d{2}$/;
    const CLE_CADRE = PREFIXE + 'cadre', CLE_VU = PREFIXE + 'niveau-vu';
    const entrees = Object.entries(donnees)
      .filter(([k, v]) => typeof v === 'string' && k.startsWith(PREFIXE)
        && (idSur(k.slice(PREFIXE.length)) || PROGRES.test(k.slice(PREFIXE.length)) || k === CLE_NIVEAU || k === CLE_SUIVI || k === CLE_ACCES || k === CLE_AVENTURE));
    const lireJSON = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };
    let n = 0;

    // 1. Collections personnelles : celles qu'on n'a pas encore, ou toute la liste reçue avec « ecraser ».
    const recues = entrees.find(([k]) => k === CLE_MES_COLLECTIONS);
    const liste = recues ? lireJSON(recues[1]) : null;
    const ajout = [];
    for (const c of Array.isArray(liste) ? liste : []) {
      try {
        const propre = nettoyerCollection(c);
        if (ecraser) {
          if (!ajout.some((x) => x.id === propre.id)) ajout.push(propre);
        } else if (!toutes().some((x) => x.id === propre.id) && !ajout.some((x) => x.id === propre.id)) {
          ajout.push({ ...propre, nom: nomLibre(propre.nom) });
        }
      } catch (e) { /* collection abîmée : ignorée */ }
    }
    if (ecraser) {
      if (JSON.stringify(ajout) !== JSON.stringify(mesCollections)) sauverMesCollections(ajout);
    } else if (ajout.length) {
      sauverMesCollections([...mesCollections, ...ajout]);
      n += ajout.length;
    }

    // 2. Plans de travail, collection choisie et zoom.
    for (const [k, v] of entrees) {
      if (k === CLE_MES_COLLECTIONS || (!ecraser && lire(k) !== null)) continue;
      if (k === PREFIXE + 'collection' || k === PREFIXE + 'zoom') { ecrire(k, v.slice(0, 80)); continue; }
      if (PROGRES.test(k.slice(PREFIXE.length))) { if (/^[0-9TZ:.+-]{1,40}$/.test(v)) ecrire(k, v); continue; }
      if (k === CLE_CADRE) { if (/^[a-z-]{1,20}$/.test(v)) ecrire(k, v); continue; }
      if (k === CLE_VU) {
        // Ne jamais redescendre : une fête « Niveau supérieur ! » déjà vue ne se rejoue pas sur cet appareil.
        const recu = parseInt(v, 10), deja = parseInt(lire(k), 10) || 0;
        if (recu >= 1 && recu <= 999) ecrire(k, String(Math.max(recu, deja)));
        continue;
      }
      if (k === CLE_NIVEAU) { if (niveauValide(v)) ecrire(k, v); continue; }
      if (k === CLE_ACCES) { try { ecrire(k, JSON.stringify(accesPropre(JSON.parse(v)))); } catch (e) { /* illisible */ } continue; }
      if (k === CLE_AVENTURE) { try { ecrire(k, JSON.stringify(aventurePropre(JSON.parse(v)))); } catch (e) { /* illisible */ } continue; }
      if (k === CLE_SUIVI) { try { ecrire(k, JSON.stringify(suiviPropre(JSON.parse(v)))); } catch (e) { /* illisible */ } continue; }
      const c = toutes().find((x) => PREFIXE + x.id === k);
      const o = lireJSON(v);
      if (!c || !o) continue;
      ecrire(k, JSON.stringify(nettoyerEtat(o, c)));
      n++;
    }

    // 3. Avec « ecraser » : absent de la version reçue, absent d'ici (plans, étoiles, défis, cadre…).
    if (ecraser) {
      const gardes = new Set(entrees.map(([k]) => k));
      for (const k of Object.keys(donneesLocales())) {
        if (k !== CLE_MES_COLLECTIONS && !gardes.has(k)) oublier(k);
      }
    }
    return n;
  }

  // Lit « #transfert=z… » (JSON compressé en gzip) ou « #transfert=j… » (JSON simple), en base64url.
  async function recevoirTransfert() {
    const m = /^#transfert=([zj])([A-Za-z0-9_-]+)$/.exec(location.hash);
    history.replaceState(null, '', location.pathname + location.search);
    if (!m) return 0;
    try {
      const binaire = atob(m[2].replace(/-/g, '+').replace(/_/g, '/'));
      const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
      const texte = m[1] === 'z'
        ? await new Response(new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(octets);
      const donnees = JSON.parse(texte);
      return donnees && typeof donnees === 'object' ? importerSauvegarde(donnees) : 0;
    } catch (e) {
      return 0;
    }
  }

  /* ---------- Mes collections ---------- */

  const CLE_MES_COLLECTIONS = 'boites-a-classer:mes-collections';

  function lireMesCollections() {
    try {
      const liste = JSON.parse(lire(CLE_MES_COLLECTIONS));
      if (!Array.isArray(liste)) return [];
      const res = [];
      for (const c of liste) {
        try { res.push(nettoyerCollection(c)); } catch (e) { /* collection abîmée : ignorée */ }
      }
      return res;
    } catch (e) {
      return [];
    }
  }

  // Lève une erreur si le navigateur refuse (mémoire pleine, navigation privée…).
  function sauverMesCollections(liste) {
    try {
      stockage.setItem(CLE_MES_COLLECTIONS, JSON.stringify(liste));
    } catch (e) {
      throw new Error('la mémoire du navigateur est pleine ou indisponible (essayez avec moins de photos)');
    }
    mesCollections = liste;
    remplirSelect();
    signalerChangement(CLE_MES_COLLECTIONS);
  }

  function remplirSelect() {
    selColl.replaceChildren();
    const groupe = (titre, liste) => {
      const g = document.createElement('optgroup');
      g.label = titre;
      for (const c of liste) g.appendChild(new Option(marqueReussite(c) + c.nom, c.id));
      selColl.appendChild(g);
    };
    // Élève : les exercices donnés par son enseignant d'abord (page site/classe/).
    const donnes = exercicesDonnes();
    if (donnes.length) groupe('📌 Donnés par ton enseignant', donnes);
    // Les collections du site qui ont une matière se rangent avec elle ; les autres restent à part.
    for (const [m, titre] of MATIERES) groupe(titre, [...FOURNIES.filter((c) => matiere(c) === m), ...collectionsSite.filter((c) => c.matiere && matiere(c) === m)]);
    const sansMatiere = collectionsSite.filter((c) => !c.matiere);
    if (sansMatiere.length) groupe('Collections du site', sansMatiere);
    if (mesCollections.length) groupe('Mes collections', mesCollections);
    if (coll) selColl.value = coll.id;
    majBoutonExercices();
  }

  const fenCollections = $('#fen-collections');
  const listeCollections = $('#liste-collections');

  function fermerFenetres() {
    fermerMenu();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  }

  function ouvrirCollections() {
    fermerMenu();
    remplirListeCollections();
    fenCollections.querySelector('.message').textContent = '';
    fenCollections.showModal();
  }

  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

  function remplirListeCollections() {
    const bouton = (texte, action, classe) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (classe ? ' ' + classe : '');
      b.textContent = texte;
      b.addEventListener('click', action);
      return b;
    };

    const admin = estAdmin();
    const createur = peutCreer();
    const ligne = (c) => {
      const perso = estPerso(c);
      const site = estSite(c);
      const el = document.createElement('div');
      el.className = 'coll' + (c === coll ? ' courante' : '');
      const infos = document.createElement('div');
      infos.className = 'coll-infos';
      const titre = document.createElement('strong');
      titre.textContent = c.nom;
      const detail = document.createElement('small');
      detail.textContent = `${pluriel(c.etres.length, ...elements(c))} · ${pluriel(c.attributs.length, 'attribut', 'attributs')}`
        + (reussieExpert(c) ? ' · 🏆 réussie en expert' : reussie(c) ? ' · ✅ réussie' : '') + (c === coll ? ' · en cours' : '');
      infos.append(titre, detail);

      const actions = document.createElement('div');
      actions.className = 'coll-actions';
      if (c !== coll) {
        actions.appendChild(bouton('Utiliser', () => { fermerFenetres(); choisirCollection(c.id); }));
      }
      if ((createur && perso) || modifiable(c)) {
        actions.appendChild(bouton('✎ Modifier', () => ouvrirEditeur(c, false)));
      } else if (createur) {
        actions.appendChild(bouton('Copier pour modifier', () => {
          const copie = copieCollection(c);
          copie.id = nouvelId('site-');
          copie.nom = nomLibre(`${c.nom} (copie)`);
          ouvrirEditeur(copie, true);
        }));
      }
      if (createur && perso) {
        actions.appendChild(bouton('☁️ Publier sur le site', async () => {
          const zone = fenCollections.querySelector('.message');
          try {
            await publierCollection({ ...copieCollection(c), id: nouvelId('site-'), nom: nomLibre(c.nom) });
            zone.textContent = `Collection « ${c.nom} » publiée : elle est proposée à tout le monde.`;
          } catch (e) {
            zone.textContent = 'Impossible de publier : ' + (e && e.message ? e.message : e);
          }
        }));
      }
      actions.appendChild(bouton('Exporter', async () => {
        const zone = fenCollections.querySelector('.message');
        try {
          const texte = await exporterCollection(c);
          if (texte) zone.textContent = texte;
        } catch (e) {
          zone.textContent = "Impossible d'exporter : " + (e && e.message ? e.message : e);
        }
      }));
      if (perso) {
        const suppr = bouton('', () => {
          if (!suppr.classList.contains('confirmer')) {
            suppr.classList.add('attention', 'confirmer');
            setTimeout(() => suppr.classList.remove('attention', 'confirmer'), 3000);
            return;
          }
          supprimerCollection(c);
        });
        suppr.innerHTML = '<span class="txt-normal">Supprimer</span><span class="txt-confirmer">Confirmer ?</span>';
        actions.appendChild(suppr);
      }
      if (modifiable(c)) {
        const retirer = bouton('', async () => {
          if (!retirer.classList.contains('confirmer')) {
            retirer.classList.add('attention', 'confirmer');
            setTimeout(() => retirer.classList.remove('attention', 'confirmer'), 3000);
            return;
          }
          const zone = fenCollections.querySelector('.message');
          try {
            await retirerCollection(c);
            zone.textContent = `Collection « ${c.nom} » retirée du site.`;
          } catch (e) {
            zone.textContent = 'Impossible de la retirer : ' + (e && e.message ? e.message : e);
          }
        });
        retirer.innerHTML = '<span class="txt-normal">Retirer du site</span><span class="txt-confirmer">Retirer pour tout le monde ?</span>';
        actions.appendChild(retirer);
      }
      el.append(infos, actions);
      return el;
    };

    const section = (titre, liste, vide) => {
      const s = document.createElement('section');
      s.className = 'coll-groupe';
      const h = document.createElement('h3');
      h.textContent = titre;
      s.appendChild(h);
      if (liste.length) s.append(...liste.map(ligne));
      else {
        const p = document.createElement('p');
        p.className = 'vide';
        p.textContent = vide;
        s.appendChild(p);
      }
      return s;
    };

    $('#coll-aide').textContent = admin
      ? 'Administrateur : les collections que vous créez ou modifiez ici sont publiées sur le site et proposées à tout le monde. Les collections fournies ne se modifient pas : copiez-en une pour l\'adapter.'
      : createur
        ? 'Enseignant : les collections que vous créez ici sont publiées sur le site (proposées à tout le monde, et à donner à vos classes) ; vous modifiez ou retirez les vôtres. Pour partir d\'une collection fournie : « Copier pour modifier ».'
        : 'Choisissez la collection à classer. Les enseignants et les administrateurs peuvent créer des collections.';
    $('#coll-nouvelle').hidden = !createur;
    const sections = [];
    if (createur || collectionsSite.length) {
      sections.push(section('Collections du site', collectionsSite, 'Aucune pour l\'instant : créez-en une, ou copiez une collection fournie.'));
    }
    if (mesCollections.length) sections.push(section('Mes collections (dans ce navigateur)', mesCollections, ''));
    for (const [m, titre] of MATIERES) sections.push(section(titre, FOURNIES.filter((c) => matiere(c) === m), ''));
    listeCollections.replaceChildren(...sections);
  }

  function supprimerCollection(c) {
    try {
      sauverMesCollections(mesCollections.filter((x) => x !== c));
    } catch (e) {
      signaler('Impossible de supprimer : ' + e.message);
      return;
    }
    try { stockage.removeItem('boites-a-classer:' + c.id); } catch (e) { /* stockage indisponible */ }
    signalerChangement('boites-a-classer:' + c.id);
    if (c === coll) choisirCollection(FOURNIES[0].id);
    remplirListeCollections();
    fenCollections.querySelector('.message').textContent = `Collection « ${c.nom} » supprimée.`;
  }

  /* ---------- Éditeur de collection ---------- */

  const DESSINS = [
    '🐇', '🦔', '🦇', '🐈', '🐕', '🐁', '🐿️', '🦊', '🐺', '🐻', '🦁', '🐯', '🦓', '🦒', '🐘', '🦏',
    '🐪', '🦘', '🐄', '🐖', '🐑', '🐐', '🐎', '🦌', '🐒', '🦦', '🐬', '🐋', '🦭',
    '🐦', '🐔', '🦆', '🦃', '🦅', '🦉', '🕊️', '🦜', '🦩', '🐧', '🦢',
    '🐢', '🦎', '🐊', '🐍', '🦕', '🦖', '🐸', '🐟', '🐠', '🐡', '🦈',
    '🐌', '🐛', '🦋', '🐜', '🐝', '🐞', '🦗', '🪲', '🦟', '🪰', '🕷️', '🦂', '🦀', '🦞', '🦐', '🦑', '🐙', '🦪', '🪱', '🐚',
    '🌱', '🌿', '☘️', '🍀', '🌾', '🌵', '🌲', '🌳', '🌴', '🎋', '🌷', '🌹', '🌻', '🌼', '🌸', '🍄', '🍁', '🍎', '🥕', '🥬', '🦠',
  ];

  const fenEditeur = $('#fen-editeur');
  const edNom = $('#ed-nom');
  const edAttributs = $('#ed-attributs');
  const edTableau = $('#ed-tableau');
  const edAlertes = $('#ed-alertes');
  const edAnnuler = $('#ed-annuler');
  let brouillon = null; // copie de travail de la collection modifiée
  let modifie = false;
  let tentative = false; // les erreurs ne s'affichent qu'après un premier essai d'enregistrement
  let attenteAnnuler = null;

  const attributVide = () => ({ id: nouvelId('a'), nom: '' });
  const etreVide = () => ({ id: nouvelId('e'), nom: '', emoji: '', attributs: [] });
  const etreRempli = (e) => e.nom.trim() || e.emoji || e.image || e.attributs.length;
  const couleurBrouillon = (a, i) => a.couleur || PALETTE[i % PALETTE.length];

  function ouvrirEditeur(c, nouvelle) {
    fermerMenu();
    brouillon = copieCollection(c);
    for (const e of brouillon.etres) e.emoji = e.emoji || '';
    if (!brouillon.attributs.length) brouillon.attributs.push(attributVide(), attributVide());
    if (!brouillon.etres.length) brouillon.etres.push(etreVide(), etreVide());
    modifie = false;
    tentative = false;
    remettreAnnuler();
    $('#titre-editeur').textContent = estPerso(c) || estSite(c) ? 'Modifier la collection'
      : c.id.startsWith('site-') ? 'Nouvelle collection du site' : 'Nouvelle collection';
    edNom.value = brouillon.nom;
    $('#ed-coller-message').textContent = '';
    $('#ed-coller-bloc').open = false;
    $('#ed-matiere').value = brouillon.matiere || 'sciences';
    rendreAttributs();
    rendreTableau();
    verifierBrouillon();
    fenEditeur.showModal();
    if (nouvelle && !brouillon.nom) edNom.focus();
  }

  /* Remplir à partir d'un tableur : le tableau copié dans Excel, LibreOffice ou Google Sheets arrive en texte, cases
     séparées par des tabulations (« ; » ou « , » pour un fichier CSV ouvert dans un éditeur de texte).
     1re ligne : une case libre (ou « Nom »), une colonne « Dessin » si on veut, puis les attributs.
     Ensuite une ligne par élément : son nom (un emoji devant si on veut : « 🐇 Lapin »), puis une marque (x, 1, oui…)
     sous chacun de ses attributs ; une case vide, 0, non, -, ✗ veulent dire « non ». */
  const EMOJI_DEVANT = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\u{FE0F}\u{200D}\p{Emoji_Modifier}\p{Regional_Indicator}]|\p{Extended_Pictographic})*)\s*(.*)$/u;
  const MARQUE_NON = /^(0|non|no|n|faux|false|-|✗|✘|❌)$/i;

  function lireTableur(texte) {
    const lignes = texte.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
    if (lignes.length < 2) throw new Error('il faut au moins deux lignes : les attributs, puis un élément');
    const sep = lignes[0].includes('\t') ? '\t' : lignes[0].includes(';') ? ';' : ',';
    const cases = (l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
    const tete = cases(lignes[0]);
    const dessin = /^(dessins?|emojis?|images?|ic[oô]nes?)$/i.test(tete[1] || '') ? 1 : 0;
    const debut = 1 + dessin;
    const attributs = tete.slice(debut).map((n) => n.slice(0, LIMITES.texte));
    if (!attributs.some(Boolean)) throw new Error('la première ligne doit donner les attributs, à partir de la 2e case');
    const etres = [];
    for (const c of lignes.slice(1).map(cases)) {
      let nom = c[0] || '';
      let emoji = dessin ? (c[1] || '') : '';
      const m = EMOJI_DEVANT.exec(nom);
      if (m && m[2]) { if (!emoji) emoji = m[1]; nom = m[2]; }
      if (!nom) continue;
      etres.push({
        nom: nom.slice(0, LIMITES.texte),
        emoji: [...emoji].length <= 8 ? emoji : '',
        marques: attributs.map((a, i) => !!a && !!c[debut + i] && !MARQUE_NON.test(c[debut + i])),
      });
    }
    if (!etres.length) throw new Error('aucun élément trouvé sous la première ligne');
    return { attributs, etres };
  }

  // Les attributs et éléments déjà là (même nom) sont mis à jour, les autres ajoutés, dans les limites d'une collection.
  function collerTableur() {
    const zone = $('#ed-coller-texte');
    const msg = $('#ed-coller-message');
    let t;
    try { t = lireTableur(zone.value); } catch (e) { msg.textContent = '⚠️ Tableau illisible : ' + e.message + '.'; return; }
    brouillon.attributs = brouillon.attributs.filter((a) => a.nom.trim());
    brouillon.etres = brouillon.etres.filter(etreRempli);
    let trop = 0;
    const ids = t.attributs.map((nom) => {
      if (!nom) return null;
      let a = brouillon.attributs.find((x) => normaliser(x.nom) === normaliser(nom));
      if (!a) {
        if (brouillon.attributs.length >= LIMITES.attributs) { trop++; return null; }
        a = attributVide();
        a.nom = nom;
        a.couleur = couleurLibre();
        brouillon.attributs.push(a);
      }
      return a.id;
    });
    let ajoutes = 0, majs = 0;
    for (const e of t.etres) {
      let cible = brouillon.etres.find((x) => normaliser(x.nom) === normaliser(e.nom));
      if (!cible) {
        if (brouillon.etres.length >= LIMITES.etres) { trop++; continue; }
        cible = etreVide();
        brouillon.etres.push(cible);
        ajoutes++;
      } else majs++;
      cible.nom = e.nom;
      if (e.emoji) { cible.emoji = e.emoji; delete cible.image; }
      cible.attributs = [...new Set([...cible.attributs.filter((id) => !ids.includes(id)), ...ids.filter((id, i) => id && e.marques[i])])];
    }
    if (!brouillon.attributs.length) brouillon.attributs.push(attributVide());
    if (!brouillon.etres.length) brouillon.etres.push(etreVide());
    rendreAttributs();
    rendreTableau();
    changement();
    zone.value = '';
    msg.textContent = `✅ ${pluriel(ids.filter(Boolean).length, 'attribut lu', 'attributs lus')}, ${pluriel(ajoutes, 'élément ajouté', 'éléments ajoutés')}`
      + (majs ? `, ${pluriel(majs, 'mis à jour', 'mis à jour')}` : '')
      + (trop ? ` (${trop} de trop : une collection a au plus ${LIMITES.attributs} attributs et ${LIMITES.etres} éléments)` : '')
      + '. Vérifie le tableau ci-dessous, puis enregistre.';
  }

  function changement() {
    modifie = true;
    remettreAnnuler();
    verifierBrouillon();
  }

  function boutonSuppr(titre, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suppr';
    b.textContent = '×';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    b.addEventListener('click', action);
    return b;
  }

  function rendreAttributs() {
    edAttributs.replaceChildren(...brouillon.attributs.map((a, i) => {
      const li = document.createElement('li');
      const pastille = document.createElement('span');
      pastille.className = 'pastille';
      pastille.style.setProperty('--c', couleurBrouillon(a, i));
      const champ = document.createElement('input');
      champ.type = 'text';
      champ.maxLength = LIMITES.texte;
      champ.value = a.nom;
      champ.placeholder = 'ex. plumes';
      champ.setAttribute('aria-label', `Attribut ${i + 1}`);
      champ.addEventListener('input', () => { a.nom = champ.value; majEntetes(); changement(); });
      champ.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); ajouterAttribut(); }
      });
      li.append(pastille, champ, boutonSuppr('Supprimer cet attribut', () => {
        brouillon.attributs.splice(brouillon.attributs.indexOf(a), 1);
        for (const e of brouillon.etres) e.attributs = e.attributs.filter((id) => id !== a.id);
        rendreAttributs();
        rendreTableau();
        changement();
      }));
      return li;
    }));
  }

  // Une couleur fixe, la première libre : supprimer un attribut ne change pas la couleur des autres.
  function couleurLibre() {
    const prises = new Set(brouillon.attributs.map(couleurBrouillon));
    return PALETTE.find((c) => !prises.has(c)) || PALETTE[brouillon.attributs.length % PALETTE.length];
  }

  function ajouterAttribut() {
    const a = attributVide();
    a.couleur = couleurLibre();
    brouillon.attributs.push(a);
    rendreAttributs();
    rendreTableau();
    changement();
    edAttributs.lastElementChild.querySelector('input').focus();
  }

  function majEntetes() {
    const entetes = edTableau.querySelectorAll('th.col-attr span');
    brouillon.attributs.forEach((a, i) => {
      if (!entetes[i]) return;
      entetes[i].textContent = a.nom.trim() || '…';
      entetes[i].title = a.nom;
    });
  }

  function majDessin(btn, e) {
    btn.replaceChildren();
    btn.classList.toggle('vide', !e.image && !e.emoji);
    if (e.image) {
      const img = document.createElement('img');
      img.src = e.image;
      img.alt = '';
      btn.appendChild(img);
    } else {
      btn.textContent = e.emoji || '＋';
    }
  }

  function rendreTableau() {
    const tete = document.createElement('tr');
    const thEtre = document.createElement('th');
    thEtre.className = 'col-etre';
    thEtre.textContent = 'Être vivant';
    tete.appendChild(thEtre);
    brouillon.attributs.forEach((a, i) => {
      const th = document.createElement('th');
      th.className = 'col-attr';
      th.style.setProperty('--c', couleurBrouillon(a, i));
      const span = document.createElement('span');
      th.appendChild(span);
      tete.appendChild(th);
    });
    tete.appendChild(document.createElement('th'));

    const corps = brouillon.etres.map((e) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.className = 'col-etre';
      const bloc = document.createElement('div');
      bloc.className = 'etre-ligne';
      const dessin = document.createElement('button');
      dessin.type = 'button';
      dessin.className = 'ed-dessin ouvre-menu';
      dessin.title = 'Choisir un dessin ou une photo';
      majDessin(dessin, e);
      dessin.addEventListener('click', () => ouvrirPalette(dessin, e));
      const champ = document.createElement('input');
      champ.type = 'text';
      champ.maxLength = LIMITES.texte;
      champ.value = e.nom;
      champ.placeholder = 'Nom';
      champ.setAttribute('aria-label', 'Nom de l\'être vivant');
      champ.addEventListener('input', () => { e.nom = champ.value; changement(); });
      champ.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); ajouterEtre(); }
      });
      bloc.append(dessin, champ);
      td.appendChild(bloc);
      tr.appendChild(td);

      brouillon.attributs.forEach((a, i) => {
        const cellule = document.createElement('td');
        const etiquette = document.createElement('label');
        etiquette.className = 'case';
        etiquette.style.setProperty('--c', couleurBrouillon(a, i));
        const coche = document.createElement('input');
        coche.type = 'checkbox';
        coche.checked = e.attributs.includes(a.id);
        coche.addEventListener('change', () => {
          e.attributs = coche.checked ? [...e.attributs, a.id] : e.attributs.filter((id) => id !== a.id);
          changement();
        });
        coche.setAttribute('aria-label', a.nom || `attribut ${i + 1}`);
        etiquette.appendChild(coche);
        cellule.appendChild(etiquette);
        tr.appendChild(cellule);
      });

      const tdSuppr = document.createElement('td');
      tdSuppr.appendChild(boutonSuppr('Supprimer cet être vivant', () => {
        brouillon.etres.splice(brouillon.etres.indexOf(e), 1);
        rendreTableau();
        changement();
      }));
      tr.appendChild(tdSuppr);
      return tr;
    });

    const thead = document.createElement('thead');
    thead.appendChild(tete);
    const tbody = document.createElement('tbody');
    tbody.append(...corps);
    edTableau.replaceChildren(thead, tbody);
    majEntetes();
  }

  function ajouterEtre() {
    brouillon.etres.push(etreVide());
    rendreTableau();
    changement();
    edTableau.querySelector('tbody tr:last-child input[type="text"]').focus();
  }

  function ouvrirPalette(ancre, e) {
    afficherMenu(ancre, 'dessin-' + e.id, (m) => {
      const grille = document.createElement('div');
      grille.className = 'palette-grille';
      for (const d of DESSINS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = d;
        b.addEventListener('click', () => {
          fermerMenu();
          e.emoji = d;
          delete e.image;
          majDessin(ancre, e);
          changement();
        });
        grille.appendChild(b);
      }

      const autre = document.createElement('label');
      autre.className = 'palette-autre';
      autre.textContent = 'Autre emoji : ';
      const champ = document.createElement('input');
      champ.type = 'text';
      champ.maxLength = 16;
      champ.value = e.image ? '' : e.emoji;
      champ.addEventListener('change', () => {
        const v = champ.value.trim();
        if (!v) return;
        e.emoji = v;
        delete e.image;
        majDessin(ancre, e);
        changement();
      });
      champ.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); champ.blur(); fermerMenu(); } });
      autre.appendChild(champ);

      m.appendChild(entreeMenu('🖼 Choisir une photo ou une image…', () => choisirImage(ancre, e)));
      if (e.image) {
        m.appendChild(entreeMenu("Retirer l'image", () => { delete e.image; majDessin(ancre, e); changement(); }));
      }
      m.append(document.createElement('hr'), grille, autre);
    }, 'palette');
  }

  async function choisirImage(ancre, e) {
    try {
      const f = await ouvrirFichier({ titre: 'Choisir une image', nom: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'], accept: 'image/*' });
      if (!f) return;
      e.image = await reduireImage(new Blob([f.octets]));
      majDessin(ancre, e);
      changement();
    } catch (err) {
      tentative = true;
      verifierBrouillon(["Cette image n'a pas pu être lue (" + (err && err.message ? err.message : err) + ').']);
    }
  }

  // Réduit une photo à 160 px de côté au plus (JPEG) : la collection reste légère dans le navigateur et dans les fichiers.
  async function reduireImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((ok, ko) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => ko(new Error('format non reconnu'));
        i.src = url;
      });
      const ech = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * ech));
      c.height = Math.max(1, Math.round(img.naturalHeight * ech));
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function problemesBrouillon() {
    const erreurs = [];
    const conseils = [];
    const attrs = brouillon.attributs.filter((a) => a.nom.trim());
    const etres = brouillon.etres.filter(etreRempli);

    if (!brouillon.nom.trim()) erreurs.push('Donnez un nom à la collection.');
    else if (toutes().some((c) => c.id !== brouillon.id && normaliser(c.nom) === normaliser(brouillon.nom))) {
      erreurs.push('Une autre collection porte déjà ce nom.');
    }
    if (!attrs.length) erreurs.push('Ajoutez au moins un attribut.');
    const vus = new Set();
    for (const a of attrs) {
      const n = normaliser(a.nom);
      if (vus.has(n)) erreurs.push(`L'attribut « ${a.nom.trim()} » est écrit deux fois.`);
      vus.add(n);
    }
    if (etres.length < 2) erreurs.push('Ajoutez au moins deux êtres vivants.');
    if (etres.some((e) => !e.nom.trim())) erreurs.push('Chaque être vivant doit avoir un nom.');

    // Conseils (on peut enregistrer quand même).
    const ids = new Set(attrs.map((a) => a.id));
    for (const e of etres) {
      if (e.nom.trim() && !e.attributs.some((id) => ids.has(id))) {
        conseils.push(`${e.nom.trim()} n'a aucun attribut coché : il ne pourra aller dans aucune boîte.`);
      }
    }
    // Deux attributs « se croisent » si des êtres vivants ont l'un, l'autre, et les deux : leurs boîtes ne peuvent pas s'emboîter.
    const porteurs = new Map(attrs.map((a) => [a, new Set(etres.filter((e) => e.attributs.includes(a.id)))]));
    const croisements = [];
    for (let i = 0; i < attrs.length; i++) {
      for (let j = i + 1; j < attrs.length; j++) {
        const A = porteurs.get(attrs[i]), B = porteurs.get(attrs[j]);
        const communs = [...A].filter((e) => B.has(e)).length;
        if (communs > 0 && communs < A.size && communs < B.size) croisements.push([attrs[i].nom.trim(), attrs[j].nom.trim()]);
      }
    }
    for (const [a, b] of croisements.slice(0, 3)) {
      conseils.push(`Les attributs « ${a} » et « ${b} » se croisent : certains êtres vivants ont les deux, d'autres un seul. Leurs boîtes ne pourront pas s'emboîter.`);
    }
    if (croisements.length > 3) conseils.push(`… et ${croisements.length - 3} autres croisements.`);
    return { erreurs, conseils };
  }

  function verifierBrouillon(enPlus) {
    const { erreurs, conseils } = problemesBrouillon();
    const lignes = [
      ...(enPlus || []).map((t) => ['erreur', t]),
      ...(tentative ? erreurs.map((t) => ['erreur', t]) : []),
      ...conseils.map((t) => ['conseil', t]),
    ];
    edAlertes.replaceChildren(...lignes.map(([type, texte]) => {
      const li = document.createElement('li');
      li.className = type;
      li.textContent = texte;
      return li;
    }));
    return erreurs;
  }

  async function enregistrerBrouillon() {
    tentative = true;
    const erreurs = verifierBrouillon();
    if (erreurs.length) {
      edAlertes.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const attributs = brouillon.attributs.filter((a) => a.nom.trim())
      .map((a) => ({ id: a.id, nom: a.nom.trim(), couleur: couleurBrouillon(a, brouillon.attributs.indexOf(a)) }));
    const ids = new Set(attributs.map((a) => a.id));
    const etres = brouillon.etres.filter(etreRempli).map((e) => {
      const o = { id: e.id, nom: e.nom.trim() };
      if (e.image) o.image = e.image; else if (e.emoji) o.emoji = e.emoji;
      o.attributs = e.attributs.filter((id) => ids.has(id));
      return o;
    });
    const c = { id: brouillon.id, nom: brouillon.nom.trim(), matiere: brouillon.matiere, attributs, etres };
    if (c.id.startsWith('site-')) {
      const bouton = $('#ed-enregistrer');
      bouton.disabled = true;
      try {
        await publierCollection(c);
      } catch (e) {
        verifierBrouillon(["Impossible de publier : " + (e && e.message ? e.message : e) + '.']);
        return;
      } finally {
        bouton.disabled = false;
      }
      modifie = false;
      fermerFenetres();
      choisirCollection(c.id);
      info.textContent = `Collection « ${c.nom} » publiée sur le site : elle est proposée à tout le monde.`;
      return;
    }
    const existe = mesCollections.some((x) => x.id === c.id);
    try {
      sauverMesCollections(existe ? mesCollections.map((x) => (x.id === c.id ? c : x)) : [...mesCollections, c]);
    } catch (e) {
      verifierBrouillon(["Impossible d'enregistrer : " + e.message + '.']);
      return;
    }
    modifie = false;
    fermerFenetres();
    choisirCollection(c.id);
    info.textContent = `Collection « ${c.nom} » enregistrée. Elle est dans Mes collections (bouton ✎).`;
  }

  function remettreAnnuler() {
    clearTimeout(attenteAnnuler);
    attenteAnnuler = null;
    edAnnuler.classList.remove('attention', 'confirmer');
  }

  // Fermer l'éditeur sans enregistrer : un second appui est demandé s'il y a des modifications.
  function annulerEditeur() {
    if (modifie && !attenteAnnuler) {
      edAnnuler.classList.add('attention', 'confirmer');
      attenteAnnuler = setTimeout(remettreAnnuler, 4000);
      return;
    }
    remettreAnnuler();
    fermerMenu();
    fenEditeur.close();
  }

  edNom.addEventListener('input', () => { brouillon.nom = edNom.value; changement(); });
  $('#ed-matiere').replaceChildren(...MATIERES.map(([m, titre]) => new Option(titre, m)));
  $('#ed-matiere').addEventListener('change', () => { brouillon.matiere = $('#ed-matiere').value; changement(); });
  $('#ed-ajout-attr').addEventListener('click', ajouterAttribut);
  $('#ed-ajout-etre').addEventListener('click', ajouterEtre);
  $('#ed-coller').addEventListener('click', collerTableur);
  $('#ed-enregistrer').addEventListener('click', enregistrerBrouillon);
  edAnnuler.addEventListener('click', annulerEditeur);
  fenEditeur.querySelector('.fermer').addEventListener('click', annulerEditeur);
  fenEditeur.addEventListener('cancel', (ev) => { // touche Échap
    ev.preventDefault();
    if (menu) fermerMenu(); else annulerEditeur();
  });
  fenEditeur.addEventListener('close', fermerMenu);

  fenCollections.querySelector('.fermer').addEventListener('click', () => fenCollections.close());
  fenCollections.addEventListener('close', fermerMenu);
  fenCollections.addEventListener('cancel', (ev) => { if (menu) { ev.preventDefault(); fermerMenu(); } });
  $('#coll-ouvrir').addEventListener('click', ouvrir);
  $('#coll-nouvelle').addEventListener('click', () => {
    ouvrirEditeur({ id: nouvelId('site-'), nom: '', attributs: [], etres: [] }, true);
  });

  /* ---------- Menus ---------- */

  // Ouvre un petit menu sous (ou au-dessus de) l'élément « ancre » ; un second appui sur la même ancre le referme.
  // Dans une fenêtre (dialog), le menu y est ajouté : hors d'elle, il serait inaccessible.
  function afficherMenu(ancre, cle, remplir, classe) {
    const dejaOuvert = menu && menu.dataset.cle === cle;
    fermerMenu();
    if (dejaOuvert) return;

    menu = document.createElement('div');
    menu.className = 'menu' + (classe ? ' ' + classe : '');
    menu.dataset.cle = cle;
    menu.setAttribute('role', 'menu');
    remplir(menu);
    for (const b of menu.querySelectorAll(':scope > button:not([role])')) b.setAttribute('role', 'menuitem');
    menu.addEventListener('keydown', clavierMenu);
    (ancre.closest('dialog') || document.body).appendChild(menu);
    ancreMenu = ancre;
    ancre.setAttribute('aria-expanded', 'true');

    // Toute la hauteur libre sous le bouton (sinon au-dessus, s'il y a plus de place) ; au-delà, le menu défile.
    const r = ancre.getBoundingClientRect();
    const dessous = r.bottom + 4;
    const placeDessous = window.innerHeight - dessous - 8, placeDessus = r.top - 12;
    const enHaut = menu.scrollHeight > placeDessous && placeDessus > placeDessous;
    menu.style.maxHeight = Math.max(160, enHaut ? placeDessus : placeDessous) + 'px';
    const larg = menu.offsetWidth;
    const haut = menu.offsetHeight;
    menu.style.left = borne(r.right - larg, 8, window.innerWidth - larg - 8) + 'px';
    menu.style.top = (enHaut ? Math.max(8, r.top - haut - 4) : dessous) + 'px';
    // Ouvert au clavier : le focus va au choix en cours (niveau) ou au premier.
    if (parClavier) {
      const premier = menu.querySelector('[aria-checked="true"]') || menu.querySelector('button:not(:disabled), input');
      if (premier) premier.focus();
    }
  }

  // Clavier dans un menu : ↑ ↓ (← → dans la grille des dessins), Début et Fin passent d'un choix à l'autre ; Échap
  // (plus bas) et Tab le referment en rendant le focus au bouton qui l'a ouvert.
  let parClavier = false;
  let ancreMenu = null;
  document.addEventListener('keydown', () => { parClavier = true; }, true);
  document.addEventListener('pointerdown', () => { parClavier = false; }, true);

  function clavierMenu(ev) {
    if (ev.key === 'Tab') { ev.preventDefault(); fermerMenu(); return; }
    if (ev.target.closest('input, textarea, select')) return;
    const choix = [...menu.querySelectorAll('button')].filter((b) => !b.disabled);
    const i = choix.indexOf(document.activeElement);
    const cible = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: choix.length - 1 }[ev.key];
    if (cible === undefined || !choix.length) return;
    ev.preventDefault();
    choix[(cible + choix.length) % choix.length].focus();
  }

  function entreeMenu(texte, action, couleur) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (couleur) {
      const pastille = document.createElement('span');
      pastille.className = 'pastille';
      pastille.style.setProperty('--c', couleur);
      btn.appendChild(pastille);
    }
    // L'emoji du début dans une colonne de largeur fixe : tous les textes du menu commencent au même endroit.
    const m = couleur ? null : EMOJI_DEVANT.exec(texte);
    if (m && m[2]) {
      const ico = document.createElement('span');
      ico.className = 'menu-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.textContent = m[1];
      btn.append(ico, document.createTextNode(m[2]));
    } else btn.appendChild(document.createTextNode(texte));
    btn.addEventListener('click', () => { fermerMenu(); action(); });
    return btn;
  }

  function ouvrirMenu(ancre, b) {
    afficherMenu(ancre, 'boite-' + b.id, (m) => {
      for (const a of attrParId.values()) {
        m.appendChild(entreeMenu((lireAcces().daltonien ? a.symbole + ' ' : '') + a.nom, () => {
          b.attr = a.id;
          b.texte = a.nom;
          sauver();
          oublierVerification();
          rendre();
        }, a.couleur));
      }
    }, 'menu-attr');
  }

  function ouvrirMenuFichier() {
    afficherMenu(boutonFichier, 'fichier', (m) => {
      m.append(
        entreeMenu('💾 Enregistrer mon travail', enregistrerTravail),
        entreeMenu('📂 Ouvrir un fichier…', ouvrir),
      );
      // En consultation (admin), la mémoire est temporaire : pas de compte ni de sauvegarde en ligne.
      if (!document.body.classList.contains('consultation')) {
        m.appendChild(entreeMenu(jetonCompte() ? `☁️ Compte : ${lire(CLE_IDENTIFIANT)}` : codeSauvegarde() ? '☁️ Sauvegarde en ligne (activée)' : '☁️ Compte et sauvegarde en ligne…', ouvrirSauvegarde));
      }
      m.append(
        document.createElement('hr'),
        entreeMenu('📄 Enregistrer en PDF', exporterPdf),
        entreeMenu('🖼 Enregistrer en image', exporterImage),
      );
      if (!petitEcran.matches) m.appendChild(entreeMenu('🖨 Imprimer', () => window.print()));
    });
  }

  function fermerMenu() {
    if (!menu) return;
    const avaitFocus = menu.contains(document.activeElement);
    menu.remove();
    menu = null;
    if (ancreMenu) {
      ancreMenu.setAttribute('aria-expanded', 'false');
      if (avaitFocus && ancreMenu.isConnected) ancreMenu.focus({ preventScroll: true });
      ancreMenu = null;
    }
  }

  document.addEventListener('pointerdown', (ev) => {
    if (menu && !ev.target.closest('.menu, .ouvre-menu')) fermerMenu();
  });

  /* ---------- Vérification ---------- */

  function oublierVerification() {
    for (const el of elEtres.values()) el.classList.remove('ok', 'faux');
    marquerEnDirect();
  }

  function fermerBilan() {
    bilan.hidden = true;
    oublierVerification();
  }

  // Analyse du plan de travail : lignes du bilan [type, texte, revele], êtres vivants mal placés, et « complet » quand
  // tout est placé sans aucune erreur. « revele » : la ligne dit un attribut d'un être vivant (cachée au niveau expert,
  // qui ne compte que ces êtres vivants-là, dans « parAttribut »).
  function analyser() {
    const lignes = [];
    const fautifs = new Set();
    const parAttribut = new Set();
    const places = coll.etres.filter((e) => etat.positions[e.id]);
    const centres = new Map(places.map((e) => [e.id, centre(etat.positions[e.id])]));
    const dans = (b, e) => centres.has(e.id) && contient(b, centres.get(e.id).x, centres.get(e.id).y);

    if (etat.boites.length === 0) {
      lignes.push(['info', 'Crée une boîte avec « ＋ », puis choisis un attribut.']);
    }

    for (const b of etat.boites) {
      if (!b.attr) {
        lignes.push(['erreur', b.texte
          ? `La boîte « ${b.texte} » n'a pas un attribut connu : choisis-le dans le menu ▾.`
          : 'Une boîte n\'a pas d\'attribut : choisis-le dans le menu ▾.']);
        continue;
      }
      const nom = nomAttr(b.attr);
      for (const e of coll.etres) {
        const possede = e.attributs.includes(b.attr);
        if (dans(b, e) && !possede) {
          fautifs.add(e.id);
          parAttribut.add(e.id);
          lignes.push(['erreur', `${e.nom} n'a pas l'attribut « ${nom} » : il ne doit pas être dans cette boîte.`, true]);
        } else if (!dans(b, e) && possede && centres.has(e.id)) {
          fautifs.add(e.id);
          parAttribut.add(e.id);
          lignes.push(['manque', `${e.nom} possède l'attribut « ${nom} » : il doit être dans cette boîte.`, true]);
        }
      }
    }

    for (let i = 0; i < etat.boites.length; i++) {
      for (let j = i + 1; j < etat.boites.length; j++) {
        const a = etat.boites[i], b = etat.boites[j];
        if (chevauche(a, b) && !englobe(a, b) && !englobe(b, a)) {
          lignes.push(['erreur', `Les boîtes « ${a.texte || '?'} » et « ${b.texte || '?'} » se chevauchent : une boîte doit être entièrement dans une autre, ou à côté.`]);
        }
      }
    }

    for (const e of places) {
      if (!etat.boites.some((b) => dans(b, e))) {
        fautifs.add(e.id);
        parAttribut.delete(e.id); // déjà dit autrement
        lignes.push(['manque', `${e.nom} n'est dans aucune boîte.`]);
      }
    }

    const restants = coll.etres.length - places.length;
    if (restants > 0) {
      lignes.push(['info', `Il reste ${pluriel(restants, ...elements())} à placer.`]);
    }

    const erreurs = lignes.some(([t]) => t === 'erreur' || t === 'manque');
    if (!erreurs && etat.boites.length > 0) {
      lignes.unshift(['bravo', restants > 0
        ? 'Bien joué : tout ce qui est placé est correct.'
        : 'Bravo ! Ta classification est correcte.']);
    }

    const complet = !erreurs && etat.boites.length > 0 && restants === 0;
    return { lignes, fautifs, parAttribut, places, complet };
  }

  function verifier() {
    noterSuivi('verifs');
    if (tuto) tuto.verifie = true;
    fermerMenu();
    oublierVerification();
    const analyse = analyser();
    const { fautifs, places, complet } = analyse;
    let { lignes } = analyse;
    if (niveau() === 'expert') {
      lignes = lignes.filter((l) => !l[2]);
      const n = analyse.parAttribut.size;
      if (n) lignes.unshift(['erreur', `${pluriel(n, 'carte est mal placée', 'cartes sont mal placées')} (en rouge) : à toi de trouver pourquoi !`]);
    }
    for (const e of places) elEtres.get(e.id).classList.add(fautifs.has(e.id) ? 'faux' : 'ok');
    // Pour le mode aventure (app/aventure.js) : une vérification avec des cartes mal placées compte comme une erreur.
    window.dispatchEvent(new CustomEvent('boites:verification', { detail: { collection: coll.id, complet, erreurs: fautifs.size } }));
    if (complet) {
      dire('Bravo ! Ta classification est correcte.');
      // Pour les défis qui attendent une collection réussie (calendrier de l'Avent, app/avent.js).
      window.dispatchEvent(new CustomEvent('boites:reussite', { detail: { collection: coll.id } }));
      confettis();
      if (!reussie(coll)) {
        ecrire(cleReussie(coll), new Date().toISOString());
        remplirSelect();
        const faites = toutes().filter(reussie).length;
        lignes.push(['bravo', `✅ Collection réussie ! Tu en as réussi ${faites} sur ${toutes().length}.`]);
        const donnes = exercicesDonnes();
        if (donnes.includes(coll)) {
          const restent = donnes.filter((c) => !reussie(c)).length;
          lignes.push(['bravo', restent
            ? `📌 Encore ${pluriel(restent, 'exercice', 'exercices')} de ton enseignant à faire (bouton 📌).`
            : '📌 Tu as réussi tous les exercices de ton enseignant !']);
        }
      }
      if (niveau() === 'expert' && !reussieExpert(coll)) {
        ecrire(cleExpert(coll), new Date().toISOString());
        remplirSelect();
        const trophees = toutes().filter(reussieExpert).length;
        lignes.push(['bravo', `🏆 Réussie au niveau expert : tu as ${pluriel(trophees, 'trophée', 'trophées')} sur ${toutes().length} collections !`]);
      }
      const fin = finirDefi();
      if (fin) lignes.splice(1, 0, ['bravo', fin]);
    }

    bilanListe.replaceChildren(...lignes.map(([type, texte]) => {
      const li = document.createElement('li');
      li.className = type;
      li.textContent = texte;
      return li;
    }));
    placerBilan();
    bilan.hidden = false;
  }

  // Une pluie de confettis quand tout est juste (rien si l'appareil demande moins d'animations).
  function confettis() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || lireAcces().calme) return;
    const pluie = document.createElement('div');
    pluie.className = 'confettis';
    pluie.setAttribute('aria-hidden', 'true');
    const formes = ['🎉', '⭐', '✨', '🟦', '🟨', '🟥', '🟩'];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('span');
      c.textContent = formes[i % formes.length];
      c.style.left = Math.random() * 100 + 'vw';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      c.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
      c.style.fontSize = 12 + Math.random() * 18 + 'px';
      pluie.appendChild(c);
    }
    document.body.appendChild(pluie);
    setTimeout(() => pluie.remove(), 3800);
  }

  // Sous la barre d'outils, qui peut tenir sur deux lignes : le bilan ne doit pas cacher ses boutons.
  function placerBilan() {
    bilan.style.top = petitEcran.matches ? '' : Math.round($('.barre').getBoundingClientRect().bottom + 8) + 'px'; // téléphone : en bas
  }
  window.addEventListener('resize', () => { if (!bilan.hidden) placerBilan(); });

  /* ---------- Annuler, rétablir ---------- */

  // sauver() garde l'état d'avant chaque changement : ↶ / Ctrl+Z (⌘Z) l'annule, ↷ / Ctrl+Y (⇧⌘Z) le rétablit.
  // L'historique est propre à la collection affichée et repart à zéro quand on en change.
  function majBoutonsHistoire() {
    $('#annuler').disabled = !histoire.passe.length;
    $('#retablir').disabled = !histoire.futur.length;
  }

  function deplacerHistoire(de, vers) {
    if (!de.length) return;
    vers.push(histoire.actuel);
    histoire.actuel = de.pop();
    etat = accorder(JSON.parse(histoire.actuel));
    ecrire(cle(), histoire.actuel);
    fermerBilan();
    rendre();
    majBoutonsHistoire();
    // Revenir avant le début d'un défi (son travail d'avant) l'annule : pas de record en reprenant une solution.
    if (defi && histoire.passe.length < defi.marque) {
      arreterDefi();
      info.textContent = '⏱ Défi annulé : tu es revenu à ton travail d\'avant.';
    }
  }
  function annuler() { deplacerHistoire(histoire.passe, histoire.futur); }
  function retablir() { deplacerHistoire(histoire.futur, histoire.passe); }

  document.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || document.querySelector('dialog[open]')) return;
    if (ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable]')) return; // annulation du texte
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); annuler(); }
    else if ((k === 'z' && ev.shiftKey) || k === 'y') { ev.preventDefault(); retablir(); }
  });

  /* ---------- Outils ---------- */

  function ouvrirMenuOutils() {
    // En groupes : comprendre, jouer, le plan de travail, imprimer et partager, réglages.
    afficherMenu(boutonOutils, 'outils', (m) => {
      const titre = (t) => { const h = document.createElement('div'); h.className = 'menu-titre'; h.textContent = t; return h; };
      m.append(
        titre('Comprendre'),
        entreeMenu('📈 Mon parcours', ouvrirParcours),
        entreeMenu('💡 Un indice', donnerIndice),
        entreeMenu('🌳 Voir ma classification en arbre', ouvrirArbre),
        entreeMenu('📊 Tableau des caractères', ouvrirTableau),
        titre('Jouer'),
        ...(window.aventure ? [entreeMenu('🗺️ L\'Aventure des boîtes', () => window.aventure.ouvrir())] : []),
        entreeMenu('🎲 Jeu « Qui suis-je ? »', ouvrirJeu),
        ...(window.avent && window.avent.actif() ? [entreeMenu('🎄 Calendrier de l\'Avent', window.avent.ouvrir)] : []),
        entreeMenu(defi ? '⏹ Arrêter le défi chronométré' : '⏱ Défi chronométré (repart de zéro)', () => (defi ? arreterDefi() : lancerDefi())),
        titre('Plan de travail'),
        ...(pleinEcranPossible() ? [entreeMenu(pleinEcran() ? '📺 Quitter le plein écran' : '📺 Plein écran (tableau de la classe)', basculerPleinEcran)] : []),
        entreeMenu('🧹 Tout ranger (tout remettre en bas)', () => { etat.positions = {}; sauver(); fermerBilan(); rendre(); }),
        ...(peutCreer() ? [entreeMenu('🧑‍🏫 Montrer la solution (enseignants)', montrerSolution)] : []),
        titre('Imprimer et partager'),
        entreeMenu('🖨 Cartes à découper (activité sur papier)', imprimerCartes),
        entreeMenu('🔗 Copier le lien de cet exercice', partagerExercice),
        titre('Aide'),
        entreeMenu('🎓 Tutoriel pas à pas', lancerTuto),
        entreeMenu('❓ Comment ça marche ?', ouvrirAide),
        entreeMenu('⚙️ Réglages (taille, contraste, couleurs…)', ouvrirReglages),
        // Événement en cours (site/evenement.js) : fantômes ou lutins peuvent gêner une séance de travail.
        ...(window.hanter && window.hanter.actif() ? [entreeMenu(window.hanter.libelleCalme()
          + (window.hanter.points() ? ` (${pluriel(window.hanter.points(), 'attrapé', 'attrapés')})` : ''), () => window.hanter.calme(!window.hanter.calme()))] : []),
      );
      if (voixPossible) m.appendChild(entreeMenu(voixActive() ? '🔇 Ne plus lire à voix haute' : '🔊 Lire les noms à voix haute', basculerVoix));
    });
  }

  // Plein écran, pour le tableau numérique de la classe (Safari sur iPad : préfixe webkit ; rien sur iPhone).
  const racine = document.documentElement;
  const pleinEcranPossible = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const pleinEcran = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function basculerPleinEcran() {
    fermerMenu();
    const p = pleinEcran()
      ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      : (racine.requestFullscreen || racine.webkitRequestFullscreen).call(racine);
    if (p && p.catch) p.catch(() => { info.textContent = 'Le plein écran n\'est pas possible ici : essaie la touche F11.'; });
  }
  for (const evt of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(evt, () => { if (pleinEcran()) setTimeout(toutVoir, 120); }); // tout le travail à l'écran

  /* Mon parcours : ce que l'élève a réussi, par matière, ses trophées, sa série de jours, ses records. */

  // Gardé avec le travail (sauvegarde en ligne) : indices demandés, vérifications, jours d'activité (série 🔥).
  // Les records du défi et du jeu, eux, restent propres à l'appareil (CLE_RECORD_DEFI, CLE_RECORD_JEU).
  const CLE_SUIVI = 'boites-a-classer:suivi:parcours';
  const entier = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(v, 1e7) : 0);
  const suiviPropre = (o) => ({
    indices: entier(o && o.indices),
    verifs: entier(o && o.verifs),
    jours: Array.isArray(o && o.jours) ? [...new Set(o.jours.filter((j) => typeof j === 'string' && /^\d{4}-\d\d-\d\d$/.test(j)))].sort().slice(-400) : [],
  });
  function lireSuivi() {
    try { return suiviPropre(JSON.parse(lire(CLE_SUIVI))); } catch (e) { return suiviPropre(null); }
  }
  const jourDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // quoi : 'indices' ou 'verifs' à compter ; sans rien, marque seulement le jour (une écriture par jour au plus).
  function noterSuivi(quoi) {
    if (document.body.classList.contains('consultation')) return; // regarder le travail d'un élève ne compte pas
    const s = lireSuivi();
    const jour = jourDe(new Date());
    const nouveauJour = s.jours[s.jours.length - 1] !== jour;
    if (!quoi && !nouveauJour) return;
    if (quoi) s[quoi]++;
    if (nouveauJour) s.jours = [...s.jours, jour].slice(-400);
    ecrire(CLE_SUIVI, JSON.stringify(s));
  }

  // Jours d'activité d'affilée, jusqu'à aujourd'hui (ou hier : la série tient encore tant que la journée n'est pas finie).
  function serieDeJours(jours) {
    const faits = new Set(jours);
    const d = new Date();
    if (!faits.has(jourDe(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (faits.has(jourDe(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // Records gardés sur cet appareil : « boites-a-classer-defi:<id>[:<niveau>] » (ms) et « boites-a-classer-jeu:<id> ».
  function recordsAppareil() {
    const defis = [], jeux = [];
    try {
      for (let i = 0; i < stockage.length; i++) {
        const k = stockage.key(i);
        const v = parseInt(stockage.getItem(k), 10);
        if (!k || !(v > 0)) continue;
        if (k.startsWith('boites-a-classer-defi:')) {
          const [id, niv] = k.slice('boites-a-classer-defi:'.length).split(':');
          const c = toutes().find((x) => x.id === id);
          if (c) defis.push({ c, temps: v, niveau: niveauValide(niv) ? niv : 'normal' });
        } else if (k.startsWith('boites-a-classer-jeu:')) {
          const c = toutes().find((x) => x.id === k.slice('boites-a-classer-jeu:'.length));
          if (c) jeux.push({ c, questions: v });
        }
      }
    } catch (e) { /* stockage indisponible */ }
    return { defis: defis.sort((a, b) => a.c.nom.localeCompare(b.c.nom)), jeux: jeux.sort((a, b) => a.c.nom.localeCompare(b.c.nom)) };
  }

  function ouvrirParcours() {
    fermerMenu();
    const el = (balise, classe, texte) => { const n = document.createElement(balise); if (classe) n.className = classe; if (texte !== undefined) n.textContent = texte; return n; };
    const liste = toutes();
    const faites = liste.filter(reussie);
    const trophees = liste.filter(reussieExpert);
    const suivi = lireSuivi();
    const serie = serieDeJours(suivi.jours);
    const qui = document.body.classList.contains('consultation') ? $('#consultation strong').textContent : '';
    $('#titre-parcours').textContent = qui ? `📈 Parcours de ${qui}` : '📈 Mon parcours';

    // Les chiffres du moment, en tuiles.
    const tuiles = el('div', 'parcours-tuiles');
    for (const [ico, nombre, texte] of [
      ['✅', faites.length, `collection${faites.length > 1 ? 's' : ''} réussie${faites.length > 1 ? 's' : ''} sur ${liste.length}`],
      ['🏆', trophees.length, `trophée${trophees.length > 1 ? 's' : ''} expert`],
      ['🔥', serie, serie > 1 ? 'jours de suite' : 'jour de suite'],
      ['💡', suivi.indices, `indice${suivi.indices > 1 ? 's' : ''} demandé${suivi.indices > 1 ? 's' : ''}`],
    ]) {
      const t = el('div', 'parcours-tuile');
      t.append(el('span', 'parcours-ico', ico), el('strong', 'parcours-nombre', String(nombre)), el('span', 'parcours-legende', texte));
      tuiles.appendChild(t);
    }

    // Une barre par matière : collections réussies sur le total, puis les collections (un appui en ouvre une).
    const groupes = [
      ...MATIERES.map(([m, titre]) => [titre, liste.filter((c) => !estPerso(c) && matiere(c) === m && (!estSite(c) || c.matiere))]),
      ['Collections du site', collectionsSite.filter((c) => !c.matiere)],
      ['Mes collections', mesCollections],
    ].filter(([, l]) => l.length);
    const matieres = el('div', 'parcours-matieres');
    for (const [titre, l] of groupes) {
      const n = l.filter(reussie).length;
      const x = l.filter(reussieExpert).length;
      const ligne = el('details', 'parcours-matiere');
      const tete = el('summary');
      const barre = el('span', 'parcours-barre');
      barre.setAttribute('role', 'img');
      barre.setAttribute('aria-label', `${n} réussie${n > 1 ? 's' : ''} sur ${l.length}`);
      const plein = el('span');
      plein.style.width = (100 * n / l.length) + '%';
      barre.appendChild(plein);
      tete.append(el('span', 'parcours-titre', titre), barre, el('span', 'parcours-compte', `${n} / ${l.length}` + (x ? ` · 🏆 ${x}` : '')));
      const colls = el('div', 'parcours-colls');
      for (const c of l) {
        const b = el('button', 'parcours-coll' + (reussie(c) ? ' faite' : ''), (marqueReussite(c) || '○ ') + c.nom);
        b.type = 'button';
        b.title = reussieExpert(c) ? 'Réussie au niveau expert' : reussie(c) ? 'Réussie' : 'Pas encore réussie : appuie pour la commencer';
        b.addEventListener('click', () => { $('#fen-parcours').close(); choisirCollection(c.id); });
        colls.appendChild(b);
      }
      ligne.append(tete, colls);
      matieres.appendChild(ligne);
    }

    // Niveau, dernière activité, vérifications, records de cet appareil.
    const d = NIVEAUX[niveau()];
    const dates = [...liste.map((c) => lire(cleReussie(c))), ...liste.map((c) => lire(cleExpert(c)))].filter(Boolean).sort();
    const derniere = suivi.jours[suivi.jours.length - 1] || (dates.length ? dates[dates.length - 1].slice(0, 10) : '');
    const infos = el('ul', 'parcours-infos');
    const point = (t) => infos.appendChild(el('li', '', t));
    point(`${d.ico} Niveau ${d.nom.toLowerCase()}` + (trophees.length ? ` · ${pluriel(trophees.length, 'collection réussie', 'collections réussies')} au niveau expert` : ''));
    if (derniere) point(`📅 Dernière activité : ${new Date(derniere + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}` + (suivi.jours.length > 1 ? ` · ${pluriel(suivi.jours.length, 'jour', 'jours')} d'activité en tout` : ''));
    if (suivi.verifs) point(`✔ ${pluriel(suivi.verifs, 'vérification', 'vérifications')}`);
    const { defis, jeux } = recordsAppareil();
    const records = el('div', 'parcours-records');
    if (defis.length || jeux.length) {
      records.appendChild(el('h3', '', '⏱ Mes records (sur cet appareil)'));
      const ul = el('ul', 'parcours-infos');
      for (const r of defis) ul.appendChild(el('li', '', `${r.c.nom} : défi en ${duree(r.temps)} ${NIVEAUX[r.niveau].ico}`));
      for (const r of jeux) ul.appendChild(el('li', '', `${r.c.nom} : « Qui suis-je ? » trouvé en ${pluriel(r.questions, 'question', 'questions')}`));
      records.appendChild(ul);
    }
    const aide = el('p', 'aide', faites.length
      ? 'Touche une matière pour voir ses collections ; touche une collection pour l\'ouvrir.'
      : 'Réussis une collection (tout juste à la vérification) pour remplir ton parcours ! Touche une matière pour voir ses collections.');
    $('#parcours').replaceChildren(tuiles, aide, matieres, infos, records);
    $('#fen-parcours').showModal();
  }
  $('#parcours-imprimer').addEventListener('click', () => {
    document.body.classList.add('imprime-parcours');
    for (const d of document.querySelectorAll('#parcours details')) d.open = true;
    window.addEventListener('afterprint', () => document.body.classList.remove('imprime-parcours'), { once: true });
    window.print();
  });

  // Aide : montrée d'elle-même à la toute première visite, puis dans 🧰 Outils.
  const CLE_AIDE = 'boites-a-classer-aide:vue';
  function ouvrirAide() {
    fermerMenu();
    $('#fen-aide').showModal();
  }
  $('#aide-ok').addEventListener('click', () => { ecrire(CLE_AIDE, '1'); $('#fen-aide').close(); });
  $('#fen-aide').addEventListener('close', () => ecrire(CLE_AIDE, '1'));
  $('#aide-tuto').addEventListener('click', () => { $('#fen-aide').close(); lancerTuto(); });

  /* Tutoriel pas à pas : une bulle guide la première partie (collection, boîte, attribut, carte, vérification). Elle
     se pose près de ce qu'il faut toucher (en haut ou en bas de l'écran sur un téléphone), un anneau l'entoure, et
     chaque étape passe toute seule quand c'est fait. Sautable, relancé par 🧰 Outils → Aide. Les animations suivent
     « Moins d'animations » ; le texte est lu à voix haute si la lecture est active. */
  let tuto = null; // { etape, boites (nombre au début de l'étape « boîte »), boite (id de la boîte du tutoriel), verifie, minuterie }
  const bulleTuto = $('#tuto');
  const anneauTuto = $('#tuto-anneau');
  const boiteDuTuto = () => tuto && etat.boites.find((b) => b.id === tuto.boite);
  // Une carte rangée dans une boîte qui a un attribut ?
  const carteRangee = () => coll.etres.some((e) => {
    const p = etat.positions[e.id];
    if (!p) return false;
    const c = centre(p);
    return etat.boites.some((b) => b.attr && contient(b, c.x, c.y));
  });
  const ETAPES_TUTO = [
    { texte: () => `👋 Bienvenue ! En cinq petites étapes, je te montre comment ranger des ${elements()[1]} dans des boîtes.`, bouton: 'Commencer' },
    { cible: () => selColl, texte: () => '📚 Ici, tu choisis ce que tu vas classer : des animaux, des mots, des nombres… Garde celle-ci pour essayer.', bouton: 'Suivant' },
    { cible: () => $('#nouvelle'), texte: () => '📦 Appuie sur « Nouvelle boîte » : une boîte apparaît sur le plan de travail.',
      debut: () => { tuto.boites = etat.boites.length; },
      fait: () => { if (etat.boites.length <= tuto.boites) return false; tuto.boite = etat.boites[etat.boites.length - 1].id; return true; } },
    { cible: () => { const el = tuto.boite && elBoites.get(tuto.boite); return el && el.querySelector('.boite-menu'); },
      texte: () => (tactile.matches && menu ? '🏷 Donne-lui un attribut : choisis-en un dans la liste.'
        : '🏷 Donne-lui un attribut : appuie sur ▾ et choisis-en un (tu peux aussi l\'écrire dans la boîte).'),
      fait: () => { const b = boiteDuTuto(); return !!(b && b.attr); }, retour: () => !boiteDuTuto() },
    { cible: () => plateau.querySelector('.etre'),
      texte: () => `✋ Glisse dans la boîte une carte qui possède cet attribut.${niveau() === 'expert' ? '' : ' Survole-la, ou touche-la, pour voir ses attributs.'}`,
      fait: carteRangee },
    { cible: () => $('#verifier'), texte: () => '✔ Appuie sur « Vérifier » : les cartes bien rangées deviennent vertes, les autres rouges.',
      debut: () => { tuto.verifie = false; }, fait: () => tuto.verifie },
    { cible: () => (bilan.hidden ? null : bilan), bouton: 'Terminer',
      texte: () => `🎉 Bravo ! Continue : une boîte par attribut, et range tous les ${elements()[1]}. Une boîte peut aller dans une autre. Le tutoriel revient quand tu veux : 🧰 Outils → Aide.` },
  ];

  function lancerTuto() {
    fermerMenu();
    if (tuto) arreterTuto(false);
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    tuto = { etape: 0, boites: 0, boite: null, verifie: false, minuterie: setInterval(suivreTuto, 250) };
    document.body.classList.add('tuto-actif');
    bulleTuto.hidden = false;
    montrerEtape();
  }

  // fini : tout vu ou passé ; dans les deux cas le tutoriel ne revient plus de lui-même.
  function arreterTuto(fini = true) {
    if (!tuto) return;
    clearInterval(tuto.minuterie);
    tuto = null;
    document.body.classList.remove('tuto-actif');
    bulleTuto.hidden = true;
    anneauTuto.hidden = true;
    if (fini) ecrire(CLE_AIDE, '1');
  }

  function montrerEtape() {
    const e = ETAPES_TUTO[tuto.etape];
    if (e.debut) e.debut();
    $('#tuto-compte').textContent = `Étape ${tuto.etape + 1} sur ${ETAPES_TUTO.length}`;
    const texte = e.texte();
    $('#tuto-texte').textContent = texte;
    const suivant = $('#tuto-suivant');
    suivant.hidden = !e.bouton;
    suivant.textContent = e.bouton || '';
    $('#tuto-passer').hidden = tuto.etape === ETAPES_TUTO.length - 1;
    placerTuto();
    if (e.bouton) suivant.focus({ preventScroll: true }); // sinon le focus reste là où l'élève travaille
    dire(texte.replace(/^\P{L}+/u, ''));
  }

  function avancerTuto(pas = 1) {
    tuto.etape = borne(tuto.etape + pas, 0, ETAPES_TUTO.length - 1);
    montrerEtape();
  }

  function suivreTuto() {
    if (!tuto) return;
    const e = ETAPES_TUTO[tuto.etape];
    if (e.retour && e.retour()) { avancerTuto(-1); return; } // la boîte du tutoriel a été supprimée
    if (e.fait && e.fait()) { avancerTuto(); return; }
    placerTuto();
  }

  // La bulle près de sa cible (dessous, sinon dessus ; toute la largeur sur un téléphone), ou au milieu de l'écran (en bas
  // sur un téléphone). Cachée pendant qu'une fenêtre est ouverte (elle passerait dessous).
  function placerTuto() {
    const e = ETAPES_TUTO[tuto.etape];
    const cible = e.cible ? e.cible() : null;
    const fenetre = !!document.querySelector('dialog[open]');
    bulleTuto.classList.toggle('cachee', fenetre);
    const r = cible && cible.isConnected ? cible.getBoundingClientRect() : null;
    const visible = r && r.width > 0 && r.height > 0 && !fenetre;
    anneauTuto.hidden = !visible;
    if (visible) {
      Object.assign(anneauTuto.style, { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' });
    }
    const l = bulleTuto.offsetWidth, h = bulleTuto.offsetHeight;
    let x, y, cote = '';
    if (visible) {
      // Juste sous la cible, sinon juste au-dessus : la bulle ne cache ni la cible ni le haut du plan de travail.
      x = petitEcran.matches ? 8 : borne(r.left + r.width / 2 - l / 2, 8, window.innerWidth - l - 8);
      if (r.bottom + 14 + h < window.innerHeight - 8) { y = r.bottom + 14; cote = 'haut'; } else { y = Math.max(8, r.top - 14 - h); cote = 'bas'; }
      bulleTuto.style.setProperty('--fleche', borne(r.left + r.width / 2 - x, 18, l - 18) + 'px');
    } else {
      x = (window.innerWidth - l) / 2;
      y = petitEcran.matches ? window.innerHeight - h - 8 : (window.innerHeight - h) / 2;
    }
    bulleTuto.dataset.fleche = cote;
    bulleTuto.style.left = Math.round(x) + 'px';
    bulleTuto.style.top = Math.round(y) + 'px';
  }
  window.addEventListener('resize', () => { if (tuto) placerTuto(); });
  $('#tuto-suivant').addEventListener('click', () => {
    if (tuto.etape === ETAPES_TUTO.length - 1) { arreterTuto(); info.textContent = '🎓 Tutoriel terminé. Il revient quand tu veux : 🧰 Outils → Aide.'; } else avancerTuto();
  });
  $('#tuto-passer').addEventListener('click', () => { arreterTuto(); info.textContent = '🎓 Tutoriel passé. Il revient quand tu veux : 🧰 Outils → Aide.'; });

  for (const f of ['#fen-aide', '#fen-arbre', '#fen-tableau', '#fen-jeu', '#fen-parcours', '#fen-reglages']) $(f).querySelector('.fermer').addEventListener('click', () => $(f).close());

  // Être vivant dessiné en petit (emoji ou photo), pour le tableau et le jeu.
  function icone(e) {
    const s = document.createElement('span');
    s.className = 'mini-ico';
    if (e.image) {
      const img = document.createElement('img');
      img.src = e.image;
      img.alt = '';
      s.appendChild(img);
    } else s.textContent = e.emoji || '❓';
    return s;
  }

  // Lien qui ouvre directement la collection affichée (à donner à une classe). Rien du travail n'y est mis.
  async function partagerExercice() {
    fermerMenu();
    // Hors du niveau normal, le lien emporte le niveau (#collection=…&niveau=…).
    const lien = 'https://boites-a-classer.pages.dev/app/#collection=' + encodeURIComponent(coll.id)
      + (niveau() === 'normal' ? '' : '&niveau=' + niveau());
    try {
      if (tactile.matches && navigator.share) await navigator.share({ title: `${nomSite()} : ${coll.nom}`, url: lien });
      else await navigator.clipboard.writeText(lien);
      info.textContent = `🔗 Lien de « ${coll.nom} » ${tactile.matches && navigator.share ? 'partagé' : 'copié'} : ${lien}`;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      info.textContent = `🔗 Lien de « ${coll.nom} » : ${lien}`;
    }
  }

  /* L'arbre : la classification emboîtée dessinée comme un arbre de parenté. */

  const aire = (b) => b.w * b.h;

  // Hiérarchie des boîtes : chaque boîte (et chaque être vivant placé) a pour parent la plus petite boîte qui l'englobe.
  // Les boîtes sans aucun être vivant sont laissées de côté.
  function hierarchie() {
    const boites = [...etat.boites].sort((a, b) => aire(a) - aire(b));
    const noeuds = new Map(boites.map((b) => [b.id, { boite: b, enfants: [] }]));
    const racine = { boite: null, enfants: [] };
    const plusPetite = (test) => boites.find(test) || null;
    // Parmi les boîtes plus grandes (plus loin dans la liste) : deux boîtes identiques ne s'englobent pas l'une l'autre.
    boites.forEach((b, i) => {
      const p = boites.find((q, j) => j > i && englobe(q, b));
      (p ? noeuds.get(p.id) : racine).enfants.push(noeuds.get(b.id));
    });
    const nonPlaces = [];
    for (const e of coll.etres) {
      const pos = etat.positions[e.id];
      if (!pos) { nonPlaces.push(e); continue; }
      const c = centre(pos);
      const p = plusPetite((q) => contient(q, c.x, c.y));
      (p ? noeuds.get(p.id) : racine).enfants.push({ etre: e });
    }
    const feuilles = (n) => (n.etre ? 1 : n.enfants.reduce((t, f) => t + feuilles(f), 0));
    const elaguer = (n) => { n.enfants = n.enfants.filter((f) => f.etre || feuilles(f) > 0); n.enfants.forEach((f) => { if (!f.etre) elaguer(f); }); };
    elaguer(racine);
    return { racine, nonPlaces, vides: boites.filter((b) => feuilles(noeuds.get(b.id)) === 0) };
  }

  function ouvrirArbre() {
    fermerMenu();
    const { racine, nonPlaces, vides } = hierarchie();
    const SVG = 'http://www.w3.org/2000/svg';
    const el = (nom, attrs, texte) => {
      const n = document.createElementNS(SVG, nom);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (texte !== undefined) n.textContent = texte;
      return n;
    };
    const PAS = 100, HAUT_FEUILLE = 92, ETAGE = 64, MARGE = 24;
    // Hauteur d'un nœud : 0 pour un être vivant, 1 de plus que son plus haut enfant pour une boîte.
    const hauteur = (n) => (n.etre ? 0 : 1 + Math.max(0, ...n.enfants.map(hauteur)));
    const H = hauteur(racine);
    let x = MARGE + PAS / 2;
    const traits = [], etiquettes = [], feuilles = [];
    // Place les êtres vivants de gauche à droite, puis chaque boîte sous le milieu de ses enfants.
    function placer(n) {
      if (n.etre) { n.x = x; x += PAS; n.y = MARGE + HAUT_FEUILLE; feuilles.push(n); return; }
      n.enfants.forEach(placer);
      n.x = n.enfants.length ? (n.enfants[0].x + n.enfants[n.enfants.length - 1].x) / 2 : x;
      n.y = MARGE + HAUT_FEUILLE + hauteur(n) * ETAGE;
      for (const f of n.enfants) traits.push(`M${f.x} ${f.y} V${n.y}`);
      if (n.enfants.length > 1) traits.push(`M${n.enfants[0].x} ${n.y} H${n.enfants[n.enfants.length - 1].x}`);
    }
    placer(racine);
    const largeur = Math.max(x - PAS / 2 + MARGE, 320);
    const bas = MARGE + HAUT_FEUILLE + (H + 0.6) * ETAGE;
    traits.push(`M${racine.x} ${racine.y} V${bas}`);
    // L'attribut d'une boîte est écrit sur la branche qui la porte, juste sous son nœud.
    (function noter(n) {
      if (n.etre) return;
      if (n.boite) etiquettes.push(n);
      n.enfants.forEach(noter);
    }(racine));

    const svg = el('svg', { viewBox: `0 0 ${largeur} ${bas + MARGE}`, width: largeur, height: bas + MARGE, role: 'img', 'aria-label': 'Arbre de la classification' });
    svg.appendChild(el('path', { d: traits.join(' '), class: 'branches', fill: 'none', stroke: '#5f6675', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    // Étiquette sur deux lignes au plus, pour tenir entre deux branches voisines (PAS).
    const decouper = (texte) => {
      const lignes = [''];
      for (const mot of texte.split(' ')) {
        const l = lignes[lignes.length - 1];
        if (!l || (l + ' ' + mot).length <= 11) lignes[lignes.length - 1] = l ? l + ' ' + mot : mot;
        else lignes.push(mot);
      }
      const garde = lignes.slice(0, 2).map((l) => (l.length > 12 ? l.slice(0, 11) + '…' : l));
      if (lignes.length > 2) garde[1] = garde[1].slice(0, 10) + '…';
      return garde;
    };
    for (const n of etiquettes) {
      const b = n.boite;
      const couleur = couleurBoite(b);
      const lignes = decouper(b.texte || '?');
      const l = Math.min(PAS - 8, 16 + Math.max(...lignes.map((t) => t.length)) * 7.2);
      const g = el('g', {});
      g.appendChild(el('rect', { x: n.x - l / 2, y: n.y + 6, width: l, height: 8 + lignes.length * 15, rx: 9, fill: couleur }));
      lignes.forEach((t, i) => g.appendChild(el('text', { x: n.x, y: n.y + 19 + i * 15, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12.5, 'font-weight': 600 }, t)));
      svg.appendChild(g);
      svg.appendChild(el('circle', { cx: n.x, cy: n.y, r: 5, fill: couleur }));
    }
    for (const f of feuilles) {
      const e = f.etre;
      if (e.image) svg.appendChild(el('image', { href: e.image, x: f.x - 24, y: MARGE, width: 48, height: 48, preserveAspectRatio: 'xMidYMid meet' }));
      else svg.appendChild(el('text', { x: f.x, y: MARGE + 40, 'text-anchor': 'middle', 'font-size': 36 }, e.emoji || '❓'));
      svg.appendChild(el('text', { x: f.x, y: MARGE + 70, 'text-anchor': 'middle', 'font-size': 13, fill: 'currentColor' }, e.nom.length > 13 ? e.nom.slice(0, 12) + '…' : e.nom));
    }

    const des = elements()[1];
    $('#arbre-aide').textContent = `Chaque boîte devient une branche : les ${des} au-dessus d'une branche partagent l'attribut écrit dessus.`
      + (matiere(coll) === 'sciences' ? ' Plus deux êtres vivants partagent de boîtes, plus ils sont proches : c\'est un arbre de parenté.' : '');
    const zone = $('#arbre');
    if (!feuilles.length) {
      const p = document.createElement('p');
      p.className = 'aide';
      p.textContent = `Place d'abord des ${des} dans des boîtes : l'arbre se dessinera ici.`;
      zone.replaceChildren(p);
    } else zone.replaceChildren(svg);
    const notes = [];
    if (nonPlaces.length) notes.push(`Pas encore placés : ${nonPlaces.map((e) => e.nom).join(', ')}.`);
    if (vides.length) notes.push(`Boîtes vides, laissées de côté : ${vides.map((b) => `« ${b.texte || '?'} »`).join(', ')}.`);
    if (racine.enfants.some((f) => f.etre)) notes.push(`Les ${des} posés hors de toute boîte partent directement du tronc.`);
    $('#arbre-notes').replaceChildren(...notes.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
    $('#arbre-titre').textContent = `${nomSite()} · ${coll.nom} · ma classification en arbre`;
    $('#fen-arbre').showModal();
  }

  /* Tableau des caractères : êtres vivants × attributs de la collection. */

  function ouvrirTableau() {
    fermerMenu();
    const [un, des] = elements();
    const cache = niveau() === 'expert'; // le tableau rempli serait la réponse
    $('#tableau-aide').textContent = cache
      ? `Niveau expert : le tableau est vide. Imprime-le pour le remplir (une coche quand l'${un} possède l'attribut), ou passe au niveau normal pour voir les coches.`
      : `Une coche quand l'${un} possède l'attribut. Les ${des} qui partagent un attribut vont dans la même boîte.`;
    $('#tableau-imprimer').hidden = cache;
    const t = $('#tableau');
    const tete = document.createElement('tr');
    tete.appendChild(document.createElement('th'));
    for (const a of attrParId.values()) {
      const th = document.createElement('th');
      th.scope = 'col';
      const s = document.createElement('span');
      s.className = 'pastille';
      s.style.setProperty('--c', a.couleur);
      th.append(s, (lireAcces().daltonien ? a.symbole + ' ' : '') + a.nom);
      tete.appendChild(th);
    }
    const lignes = coll.etres.map((e) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.append(icone(e), ' ' + e.nom);
      tr.appendChild(th);
      for (const a of attrParId.values()) {
        const td = document.createElement('td');
        if (!cache && e.attributs.includes(a.id)) { td.textContent = '✓'; td.className = 'oui'; td.style.setProperty('--c', a.couleur); }
        tr.appendChild(td);
      }
      return tr;
    });
    const thead = document.createElement('thead');
    thead.appendChild(tete);
    const tbody = document.createElement('tbody');
    tbody.append(...lignes);
    t.replaceChildren(thead, tbody);
    $('#tableau-titre').textContent = `${nomSite()} · ${coll.nom} · tableau des caractères`;
    $('#fen-tableau').showModal();
  }

  // Impression du seul tableau (fiche à remplir, ou corrigé avec les coches).
  function imprimerTableau(vide) {
    document.body.classList.add('imprime-tableau');
    document.body.classList.toggle('tableau-vide', vide);
    window.addEventListener('afterprint', () => document.body.classList.remove('imprime-tableau', 'tableau-vide'), { once: true });
    window.print();
  }
  $('#tableau-imprimer-vide').addEventListener('click', () => imprimerTableau(true));
  $('#tableau-imprimer').addEventListener('click', () => imprimerTableau(false));
  $('#arbre-imprimer').addEventListener('click', () => {
    document.body.classList.add('imprime-arbre');
    window.addEventListener('afterprint', () => document.body.classList.remove('imprime-arbre'), { once: true });
    window.print();
  });

  /* Jeu « Qui suis-je ? » : trouver l'être vivant choisi au hasard en posant des questions sur ses attributs. */

  let jeu = null; // { secret, reponses: Map(attr → oui/non), essais: Set(id), questions, fini }
  const CLE_RECORD_JEU = () => 'boites-a-classer-jeu:' + coll.id; // hors du préfixe sauvegardé : propre à l'appareil

  function ouvrirJeu() {
    fermerMenu();
    nouvellePartie();
    $('#fen-jeu').showModal();
  }

  function nouvellePartie() {
    jeu = { secret: coll.etres[Math.floor(Math.random() * coll.etres.length)], reponses: new Map(), essais: new Set(), questions: 0, fini: false };
    const record = parseInt(lire(CLE_RECORD_JEU()), 10);
    $('#jeu-proposer').textContent = `(appuie sur un ${elements()[0]} pour proposer ta réponse)`;
    $('#jeu-consigne').textContent = `J'ai choisi en secret un ${elements()[0]} de la collection « ${coll.nom} ». Pose des questions sur ses attributs pour le trouver, en le moins de questions possible.`
      + (record ? ` Ton record : ${pluriel(record, 'question', 'questions')}.` : '');
    $('#jeu-etat').textContent = '';
    $('#jeu-etat').className = 'jeu-etat';
    rendreJeu();
  }

  const compatible = (e) => [...jeu.reponses].every(([a, oui]) => e.attributs.includes(a) === oui) && !jeu.essais.has(e.id);

  function rendreJeu() {
    $('#jeu-questions').replaceChildren(...[...attrParId.values()].map((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.style.setProperty('--c', a.couleur);
      if (jeu.reponses.has(a.id)) {
        b.disabled = true;
        b.classList.add(jeu.reponses.get(a.id) ? 'oui' : 'non');
        b.textContent = `${a.nom} : ${jeu.reponses.get(a.id) ? 'oui ✓' : 'non ✗'}`;
      } else {
        b.textContent = `« ${a.nom} » ?`;
        b.disabled = jeu.fini;
        b.addEventListener('click', () => {
          const oui = jeu.secret.attributs.includes(a.id);
          jeu.reponses.set(a.id, oui);
          jeu.questions++;
          const reste = coll.etres.filter(compatible).length;
          dire(oui ? 'Oui' : 'Non');
          etatJeu(`${oui ? 'Oui' : 'Non'} ! Il reste ${pluriel(reste, 'possibilité', 'possibilités')}${reste === 1 ? ' : appuie dessus !' : '.'}`);
          rendreJeu();
        });
      }
      return b;
    }));
    $('#jeu-candidats').replaceChildren(...coll.etres.map((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jeu-carte';
      const possible = compatible(e) || (jeu.fini && e === jeu.secret);
      b.classList.toggle('ecarte', !possible);
      if (jeu.fini && e === jeu.secret) b.classList.add('trouve');
      b.disabled = jeu.fini || !possible;
      b.append(icone(e), e.nom);
      b.addEventListener('click', () => proposer(e));
      return b;
    }));
  }

  function etatJeu(texte, classe) {
    $('#jeu-etat').textContent = texte;
    $('#jeu-etat').className = 'jeu-etat' + (classe ? ' ' + classe : '');
  }

  function proposer(e) {
    jeu.questions++;
    if (e === jeu.secret) {
      jeu.fini = true;
      const record = parseInt(lire(CLE_RECORD_JEU()), 10);
      const nouveau = !record || jeu.questions < record;
      if (nouveau) ecrire(CLE_RECORD_JEU(), String(jeu.questions));
      etatJeu(`🎉 Bravo, c'était ${e.nom} ! Trouvé en ${pluriel(jeu.questions, 'coup', 'coups')}${nouveau ? ' : nouveau record !' : '.'}`, 'gagne');
      dire(`Bravo, c'était ${e.nom} !`);
    } else {
      jeu.essais.add(e.id);
      etatJeu(`Non, ce n'est pas ${e.nom}. Continue !`, 'rate');
      dire(`Non, ce n'est pas ${e.nom}.`);
    }
    rendreJeu();
  }
  $('#jeu-nouvelle').addEventListener('click', nouvellePartie);

  // Conseil : la question qui partage le mieux ce qui reste possible (le plus près de la moitié « oui », moitié « non »).
  $('#jeu-conseil').addEventListener('click', () => {
    if (!jeu || jeu.fini) return;
    const restants = coll.etres.filter(compatible);
    const utiles = [...attrParId.values()].filter((a) => !jeu.reponses.has(a.id)).map((a) => {
      const oui = restants.filter((e) => e.attributs.includes(a.id)).length;
      return { a, oui, ecart: Math.abs(restants.length / 2 - oui) };
    }).filter((x) => x.oui > 0 && x.oui < restants.length).sort((x, y) => x.ecart - y.ecart);
    if (restants.length === 1) etatJeu('Il ne reste qu\'une possibilité : appuie dessus !');
    else if (!utiles.length) etatJeu('Plus aucune question ne les sépare : il faut deviner parmi ceux qui restent !');
    else etatJeu(`💡 Essaie « ${utiles[0].a.nom} » : ${pluriel(utiles[0].oui, 'possibilité dit', 'possibilités disent')} oui, ${restants.length - utiles[0].oui} non. Une bonne question partage les possibilités en deux.`);
  });

  /* Solution (enseignants et admin) : les boîtes emboîtées correctes, dessinées toutes seules. ↩ annule. */

  function montrerSolution() {
    fermerMenu();
    const ens = (a) => new Set(coll.etres.filter((e) => e.attributs.includes(a.id)).map((e) => e.id));
    // Du plus grand ensemble au plus petit ; chaque attribut va dans la boîte de son plus petit sur-ensemble.
    const noeuds = [...attrParId.values()].map((a) => ({ a, ens: ens(a), enfants: [] })).filter((n) => n.ens.size)
      .sort((x, y) => y.ens.size - x.ens.size);
    noeuds.forEach((n, i) => {
      n.parent = noeuds.slice(0, i).filter((p) => [...n.ens].every((id) => p.ens.has(id))).pop() || null;
      if (n.parent) n.parent.enfants.push(n);
    });
    const profond = (e) => noeuds.filter((n) => n.ens.has(e.id)).pop() || null;
    const ESPACE = ETRE.l + 10, TETE = 46;
    function mesurer(n) {
      n.directs = coll.etres.filter((e) => profond(e) === n);
      n.enfants.forEach(mesurer);
      n.w = Math.max(BOITE_MIN.l + 40, 20 + n.directs.length * ESPACE + n.enfants.reduce((t, f) => t + f.w + 10, 0));
      n.h = TETE + 14 + Math.max(ETRE.h + 10, ...n.enfants.map((f) => f.h + 10));
    }
    const boites = [], positions = {};
    function poser(n, x, y) {
      boites.push({ id: nouvelId('b'), x, y, w: n.w, h: n.h, attr: n.a.id, texte: n.a.nom });
      let cx = x + 12;
      for (const e of n.directs) { positions[e.id] = { x: cx, y: y + TETE + 4 }; cx += ESPACE; }
      for (const f of n.enfants) { poser(f, cx, y + TETE); cx += f.w + 10; }
    }
    let x = 20;
    for (const n of noeuds.filter((m) => !m.parent)) { mesurer(n); poser(n, x, 20); x += n.w + 20; }
    // Ceux qui n'ont aucun attribut restent à côté, hors des boîtes.
    for (const e of coll.etres) if (!positions[e.id]) { positions[e.id] = { x, y: 20 }; x += ESPACE; }
    etat = { boites, positions };
    sauver();
    fermerBilan();
    rendre();
    toutVoir();
    info.textContent = '🧑‍🏫 Voici la solution. « ↩ Annuler » ramène le travail d\'avant.';
  }

  /* Cartes à découper : les éléments de la collection et ses attributs, pour classer sur papier. */

  function imprimerCartes() {
    fermerMenu();
    const zone = $('#impression-cartes');
    const titre = document.createElement('h1');
    titre.textContent = `Boîtes à classer · ${coll.nom}`;
    const cartes = document.createElement('div');
    cartes.className = 'cartes-papier';
    for (const e of coll.etres) {
      const c = document.createElement('div');
      c.className = 'carte-papier';
      const ico = document.createElement('div');
      ico.className = 'carte-papier-ico';
      if (e.image) { const img = document.createElement('img'); img.src = e.image; img.alt = ''; ico.appendChild(img); } else ico.textContent = e.emoji || '❓';
      const nom = document.createElement('div');
      nom.textContent = e.nom;
      c.append(ico, nom);
      cartes.appendChild(c);
    }
    const sous = document.createElement('h2');
    sous.textContent = 'Étiquettes des boîtes';
    const etiquettes = document.createElement('div');
    etiquettes.className = 'etiquettes-papier';
    for (const a of attrParId.values()) {
      const t = document.createElement('div');
      t.className = 'etiquette-papier';
      t.style.setProperty('--c', a.couleur);
      t.textContent = a.nom;
      etiquettes.appendChild(t);
    }
    zone.replaceChildren(titre, cartes, sous, etiquettes);
    document.body.classList.add('imprime-cartes');
    window.addEventListener('afterprint', () => { document.body.classList.remove('imprime-cartes'); zone.replaceChildren(); }, { once: true });
    window.print();
  }

  /* Indice : une piste, sans donner toute la solution. */

  function donnerIndice() {
    fermerMenu();
    const { lignes, fautifs, places, complet } = analyser();
    const tirer = (l) => l[Math.floor(Math.random() * l.length)];
    let texte;
    if (complet) texte = 'Tout est juste ! Appuie sur « ✔ Vérifier » pour le confirmer.';
    else if (!etat.boites.length) {
      // L'attribut partagé par le plus d'êtres vivants fait une bonne première boîte.
      const compte = (a) => coll.etres.filter((e) => e.attributs.includes(a.id)).length;
      const a = [...attrParId.values()].sort((x, y) => compte(y) - compte(x))[0];
      texte = a ? `Commence par une grande boîte pour un attribut que beaucoup partagent, par exemple « ${a.nom} ».` : 'Crée une boîte avec « ＋ ».';
    } else if (etat.boites.some((b) => !b.attr)) texte = 'Une boîte n\'a pas encore d\'attribut : choisis-le avec le petit menu ▾ de la boîte.';
    else if (lignes.some(([t, l]) => t === 'erreur' && /se chevauchent/.test(l))) texte = 'Deux boîtes se chevauchent : une boîte doit être entièrement dans une autre, ou à côté.';
    else if (fautifs.size) {
      const choisi = tirer([...fautifs]); // tiré une seule fois (pas à chaque essai de find)
      const e = coll.etres.find((x) => x.id === choisi);
      texte = `Regarde bien ${e.nom} : est-il dans toutes les bonnes boîtes, et seulement celles-là ?${niveau() === 'expert' ? '' : ' Survole-le pour revoir ses attributs.'}`;
      const carte = elEtres.get(e.id);
      carte.classList.remove('indice');
      void carte.offsetWidth;
      carte.classList.add('indice');
      setTimeout(() => carte.classList.remove('indice'), 3000);
    } else {
      const reste = coll.etres.filter((e) => !places.includes(e));
      texte = reste.length ? `Ce qui est placé est juste. Continue avec ${tirer(reste).nom}.` : 'Appuie sur « ✔ Vérifier ».';
    }
    info.textContent = '💡 ' + texte;
    noterSuivi('indices');
    window.dispatchEvent(new CustomEvent('boites:indice', { detail: { collection: coll.id } })); // mode aventure
    dire(texte);
  }

  /* Défi chronométré : tout recommencer, puis réussir la classification le plus vite possible. */

  let minuterieDefi = null;
  const CLE_RECORD_DEFI = () => 'boites-a-classer-defi:' + coll.id + (niveau() === 'normal' ? '' : ':' + niveau()); // un record par niveau
  const duree = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };

  function lancerDefi() {
    fermerMenu();
    etat = { boites: [], positions: {} };
    sauver(); // « ↶ Annuler » ramène le travail d'avant
    fermerBilan();
    rendre();
    defi = { collection: coll.id, debut: Date.now(), marque: histoire.passe.length };
    const chrono = $('#chrono');
    chrono.hidden = false;
    const tic = () => {
      const s = Math.floor((Date.now() - defi.debut) / 1000);
      chrono.querySelector('span').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tic();
    clearInterval(minuterieDefi);
    minuterieDefi = setInterval(tic, 1000);
    const record = parseInt(lire(CLE_RECORD_DEFI()), 10);
    info.textContent = `⏱ C'est parti ! Classe tous les ${elements()[1]}, puis appuie sur « ✔ Vérifier ».${record ? ' Ton record : ' + duree(record) + '.' : ''} (↶ pour retrouver ton travail d'avant.)`;
  }

  function arreterDefi() {
    clearInterval(minuterieDefi);
    defi = null;
    $('#chrono').hidden = true;
  }

  // Appelée quand la vérification trouve tout juste : texte à ajouter au bilan, ou null sans défi en cours.
  function finirDefi() {
    if (!defi || defi.collection !== coll.id) return null;
    const temps = Date.now() - defi.debut;
    arreterDefi();
    const record = parseInt(lire(CLE_RECORD_DEFI()), 10);
    if (!record || temps < record) {
      ecrire(CLE_RECORD_DEFI(), String(temps));
      return `⏱ Défi réussi en ${duree(temps)} : nouveau record !`;
    }
    return `⏱ Défi réussi en ${duree(temps)} (record : ${duree(record)}).`;
  }

  /* Lecture à voix haute (synthèse vocale du navigateur), pour les lecteurs débutants. */

  const voixPossible = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  const CLE_VOIX = 'boites-a-classer-voix';
  const voixActive = () => voixPossible && lire(CLE_VOIX) === '1';
  function dire(texte, langue) {
    if (!voixActive()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = langue === 'en' ? 'en-GB' : 'fr-FR'; // collection d'anglais : noms lus en anglais
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
  function basculerVoix() {
    if (voixActive()) { speechSynthesis.cancel(); ecrire(CLE_VOIX, '0'); info.textContent = '🔇 Lecture à voix haute arrêtée.'; return; }
    ecrire(CLE_VOIX, '1');
    info.textContent = `🔊 Lecture à voix haute : touche ou survole un ${elements()[0]} pour l'entendre.`;
    dire('Lecture à voix haute activée.');
  }

  /* ---------- Boutons ---------- */

  function nouvelleBoite() {
    const n = etat.boites.length;
    const visibleL = espace.clientWidth / zoom;
    const visibleH = espace.clientHeight / zoom;
    const b = {
      id: nouvelId('b'),
      x: Math.round(espace.scrollLeft / zoom + 16 + (n % 6) * 28),
      y: Math.round(espace.scrollTop / zoom + 16 + (n % 6) * 28),
      w: Math.round(Math.min(320, Math.max(BOITE_MIN.l, visibleL - 40))),
      h: Math.round(Math.min(220, Math.max(BOITE_MIN.h, visibleH - 40))),
      attr: null,
      texte: '',
    };
    etat.boites.push(b);
    sauver();
    oublierVerification();
    rendre();
    // Sur écran tactile, on propose directement la liste des attributs plutôt que le clavier.
    const el = elBoites.get(b.id);
    if (tactile.matches) ouvrirMenu(el.querySelector('.boite-menu'), b);
    else el.querySelector('.boite-titre').focus();
  }

  let attenteEffacer = null;
  function effacer() {
    if (!attenteEffacer) {
      boutonEffacer.classList.add('attention', 'confirmer');
      attenteEffacer = setTimeout(remettreEffacer, 3000);
      return;
    }
    remettreEffacer();
    etat = { boites: [], positions: {} };
    sauver();
    fermerBilan();
    rendre();
  }
  function remettreEffacer() {
    clearTimeout(attenteEffacer);
    attenteEffacer = null;
    boutonEffacer.classList.remove('attention', 'confirmer');
  }

  $('#nouvelle').addEventListener('click', nouvelleBoite);
  const videBoite = document.getElementById('vide-boite');
  const videTuto = document.getElementById('vide-tuto');
  if (videBoite) videBoite.addEventListener('click', nouvelleBoite);
  if (videTuto) videTuto.addEventListener('click', () => lancerTuto());
  $('#annuler').addEventListener('click', annuler);
  $('#retablir').addEventListener('click', retablir);
  boutonOutils.addEventListener('click', ouvrirMenuOutils);
  $('#chrono').addEventListener('click', arreterDefi);
  $('#verifier').addEventListener('click', verifier);

  boutonEffacer.addEventListener('click', effacer);
  boutonFichier.addEventListener('click', ouvrirMenuFichier);
  $('#gerer').addEventListener('click', ouvrirCollections);
  boutonNiveau.addEventListener('click', ouvrirMenuNiveau);
  $('#fermer-bilan').addEventListener('click', fermerBilan);
  selColl.addEventListener('change', () => choisirCollection(selColl.value));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) { fermerMenu(); fermerBilan(); }
  });
  window.addEventListener('resize', ajusterToile);

  /* ---------- Sauvegarde en ligne ---------- */

  // Avec un compte (identifiant + mot de passe) ou un code de quatre mots, ce que le logiciel garde dans le navigateur
  // (plans de travail, Mes collections) est aussi envoyé, compressé, au serveur du site (functions/api/sauvegarde.js)
  // quelques secondes après chaque changement. Sur un autre appareil, on se connecte (ou on tape le code) pour retrouver
  // son travail. Le serveur garde les 10 dernières versions.
  // Au démarrage (et au retour sur l'onglet), si le serveur a une version plus récente et que cet appareil n'a rien en attente,
  // on la prend ; sinon c'est cet appareil qui envoie la sienne (la précédente reste dans les versions du serveur).

  // Sur le site (https) ou avec « wrangler pages dev » (port 8788), l'API est à la même adresse ;
  // l'application de bureau (http://localhost:47821) et un fichier ouvert en local passent par le site.
  const RACINE_API = location.protocol === 'https:' || location.port === '8788' ? '/api' : 'https://boites-a-classer.pages.dev/api';
  const API = RACINE_API + '/sauvegarde';
  const API_COMPTE = RACINE_API + '/compte/';
  // Ces clés n'ont pas le préfixe « boites-a-classer: » : elles ne font pas partie de ce qu'on sauvegarde.
  const CLE_CODE = 'boites-a-classer-sauvegarde:code';
  const CLE_VERSION = 'boites-a-classer-sauvegarde:version';
  const CLE_DATE = 'boites-a-classer-sauvegarde:date';
  const CLE_ATTENTE = 'boites-a-classer-sauvegarde:attente';
  const CLE_JETON = 'boites-a-classer-compte:jeton'; // session ouverte (functions/api/compte/[action].js)
  const CLE_IDENTIFIANT = 'boites-a-classer-compte:identifiant';
  const CLE_ADMIN = 'boites-a-classer-compte:admin'; // « 1 » : lien vers la page d'administration (le serveur vérifie)
  const CLE_ENSEIGNANT = 'boites-a-classer-compte:enseignant'; // « 1 » : lien vers la page « Mes classes » (le serveur vérifie)
  const CLE_ELEVE = 'boites-a-classer-compte:eleve'; // élève : { classe, enseignant } en JSON (connecté avec un code)
  const CLE_BADGES = 'boites-a-classer-compte:badges'; // badges gagnés pendant les événements, en JSON (serveur/evenement.js)
  const CLE_AVATAR = 'boites-a-classer-compte:avatar'; // photo de profil (un emoji choisi par un admin), à la place de 👤
  const CLE_AVATAR_FOND = 'boites-a-classer-compte:avatar-fond'; // couleur de son rond (app/profil.css, [data-fond])
  // Quand cet appareil a vu chaque badge pour la première fois : { badge: date ISO, ou null s'il était déjà là } (« 🏅 Mes médailles »).
  const CLE_BADGES_VUS = 'boites-a-classer-compte:badges-vus';
  const CLES_COMPTE = [CLE_JETON, CLE_IDENTIFIANT, CLE_ADMIN, CLE_ENSEIGNANT, CLE_ELEVE, CLE_BADGES, CLE_AVATAR, CLE_AVATAR_FOND, CLE_BADGES_VUS];
  const SITE = RACINE_API.slice(0, -'/api'.length); // pages du site (« Mes classes »)
  const FORME_CODE_ELEVE = /^[A-HJKMNP-Z2-9]{8}$/; // code de connexion d'un élève (serveur/classes.js)
  const HORS_SAUVEGARDE = new Set(['boites-a-classer:zoom', 'boites-a-classer:collection']); // réglages propres à l'appareil
  const FORME_CODE = /^[a-z]{2,12}(-[a-z]{2,12}){3}$/;
  const FORME_IDENTIFIANT = /^[a-z0-9][a-z0-9._-]{2,29}$/;
  const MDP_MIN = 8;
  const TOURS_PBKDF2 = 600000;
  const TAILLE_MAX_EN_LIGNE = 1900000;
  const MOTS = (
    'abeille agneau aigle ane baleine bison castor chat chameau cheval chevre chien cigale cigogne crabe ' +
    'criquet cygne dauphin dinde faucon fourmi gazelle girafe gorille grillon hamster hibou homard jaguar ' +
    'koala lama lapin lezard lion loup loutre lynx marmotte merle mouette mouton panda paon phoque poney ' +
    'poule renard requin saumon singe souris tigre tortue truite vache zebre moineau pigeon canard ' +
    'blaireau chouette corbeau pie caille colibri toucan pelican flamant manchot morse otarie orque thon ' +
    'sardine carpe poulpe calmar meduse etoile oursin moule huitre crevette papillon libellule coccinelle ' +
    'scarabee guepe bourdon chenille escargot limace ver araignee scorpion pomme poire prune cerise ' +
    'fraise framboise myrtille banane ananas mangue citron orange kiwi melon raisin figue datte abricot ' +
    'peche carotte tomate radis navet poireau oignon chou salade courge potiron haricot mais ble riz ' +
    'chene sapin pin bouleau erable hetre saule tilleul olivier palmier bambou cactus fougere mousse ' +
    'lierre trefle rose tulipe lilas iris jonquille lavande menthe thym basilic persil nuage soleil lune ' +
    'pluie neige orage vent arc brume givre eclair comete planete galaxie riviere ruisseau lac mer ocean ' +
    'vague plage dune colline montagne volcan vallee foret prairie desert ile rocher caillou sable galet ' +
    'grotte source cascade glacier rouge bleu vert jaune violet blanc noir gris marron dore argent velo ' +
    'train bateau avion fusee ballon cerf tambour flute piano guitare violon trompette harpe livre crayon ' +
    'gomme cahier regle compas loupe boussole lampe bougie cle porte fenetre chaise table tapis coussin ' +
    'panier seau pelle rateau arrosoir brouette echelle corde bouton pain gateau tarte crepe biscuit miel ' +
    'confiture fromage beurre yaourt chocolat bonbon caramel'
  ).split(' '); // 256 mots : un octet de hasard par mot
  const enLignePossible = 'CompressionStream' in window && 'DecompressionStream' in window && 'fetch' in window
    && !!(window.crypto && crypto.subtle);
  let minuterieEnvoi = null;
  let envoiEnCours = false;
  let changements = 0; // compte les changements, pour savoir s'il en est arrivé pendant un envoi
  let enApplication = false; // pendant qu'on applique une version reçue : pas de renvoi
  let etatEnLigne = { texte: '', erreur: false };
  let derniereSynchro = 0;

  const codeSauvegarde = () => lire(CLE_CODE);
  const jetonCompte = () => lire(CLE_JETON);
  // Ce qui désigne le travail en ligne de cet appareil : « compte <jeton> », « code <code> », ou null.
  const identite = () => (jetonCompte() ? 'compte ' + jetonCompte() : codeSauvegarde() ? 'code ' + codeSauvegarde() : null);
  const entetesIdentite = (id) => (id.startsWith('compte ')
    ? { Authorization: 'Bearer ' + id.slice(7) }
    : { 'X-Code-Sauvegarde': id.slice(5) });
  const oublier = (k) => { try { stockage.removeItem(k); } catch (e) { /* stockage indisponible */ } };
  const sansAccents = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const normaliserCode = (t) => sansAccents(t).replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');
  const dateLisible = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function nouveauCode() {
    const hasard = crypto.getRandomValues(new Uint8Array(4));
    return [...hasard].map((o) => MOTS[o]).join('-');
  }

  function donneesLocales() {
    const d = {};
    try {
      for (let i = 0; i < stockage.length; i++) {
        const k = stockage.key(i);
        if (k && k.startsWith('boites-a-classer:') && !HORS_SAUVEGARDE.has(k)) d[k] = stockage.getItem(k);
      }
    } catch (e) { /* stockage indisponible */ }
    return d;
  }

  const compresser = async (texte) => new Uint8Array(await new Response(
    new Blob([new TextEncoder().encode(texte)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const decompresser = (octets) => new Response(new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

  // Appelé à chaque écriture dans la mémoire du navigateur (ecrire, sauverMesCollections, supprimerCollection).
  function signalerChangement(k) {
    if (enApplication || !k.startsWith('boites-a-classer:') || HORS_SAUVEGARDE.has(k) || !identite()) return;
    changements++;
    ecrire(CLE_ATTENTE, '1');
    clearTimeout(minuterieEnvoi);
    minuterieEnvoi = setTimeout(envoyer, 2500);
  }

  // Le serveur ne reconnaît plus la session (expirée, mot de passe changé ailleurs, compte supprimé) : on l'oublie.
  // Ce qui attendait d'être envoyé reste marqué « en attente » et partira à la prochaine connexion.
  // Même nettoyage qu'à la déconnexion (photo, couleur du rond, dates des médailles), sauf l'identifiant,
  // qui reste pré-rempli. Sinon, sur un poste partagé, le compte suivant hérite des dates « Gagnée le … ».
  function sessionExpiree() {
    if (lire(CLE_ELEVE)) oublier(CLE_IDENTIFIANT); // un prénom, pas un identifiant à proposer
    for (const k of CLES_COMPTE) if (k !== CLE_IDENTIFIANT) oublier(k);
    oublier(CLE_VERSION);
    oublier(CLE_DATE);
    remplirSelect();
    majBoutonCompte();
    if (fenSauvegarde.open) rendreSauvegarde();
    info.textContent = 'Ta session a expiré : reconnecte-toi (bouton 👤) pour continuer à sauvegarder en ligne.';
  }

  async function envoyer() {
    clearTimeout(minuterieEnvoi);
    const id = identite();
    // Rien en attente, ou envoi déjà en cours (s'il arrive un changement entre-temps, l'envoi en cours relancera).
    if (!id || !enLignePossible || !lire(CLE_ATTENTE) || envoiEnCours) return;
    envoiEnCours = true;
    const vus = changements;
    let relancer = false;
    majEtatEnLigne('Envoi en cours…');
    try {
      const corps = await compresser(JSON.stringify(donneesLocales()));
      if (corps.length > TAILLE_MAX_EN_LIGNE) {
        majEtatEnLigne('Trop de photos pour la sauvegarde en ligne (1,9 Mo au plus) : retire des photos, ou enregistre ton travail dans un fichier.', true);
        return;
      }
      const rep = await fetch(API, {
        method: 'PUT',
        headers: { ...entetesIdentite(id), 'Content-Type': 'application/octet-stream' },
        body: corps,
      });
      if (rep.status === 401 && identite() === id) { sessionExpiree(); return; }
      if (!rep.ok) throw new Error('serveur ' + rep.status);
      const r = await rep.json();
      if (identite() !== id) return; // sauvegarde arrêtée, déconnexion ou changement de compte pendant l'envoi
      ecrire(CLE_VERSION, String(r.version));
      ecrire(CLE_DATE, r.date);
      if (changements === vus) oublier(CLE_ATTENTE); else relancer = true;
      majEtatEnLigne('');
      if (fenSauvegarde.open && !$('#sv-suivi').hidden) chargerVersions();
    } catch (e) {
      majEtatEnLigne('Pas de connexion au serveur : ton travail sera envoyé dès que possible.', true);
      minuterieEnvoi = setTimeout(envoyer, 60000);
    } finally {
      envoiEnCours = false;
      if (relancer) envoyer();
    }
  }

  // Remplace ce que garde ce navigateur par une version reçue du serveur, puis réaffiche.
  function appliquerVersion(donnees, version, date) {
    enApplication = true;
    try {
      importerSauvegarde(donnees, true);
    } finally {
      enApplication = false;
    }
    if (version) {
      ecrire(CLE_VERSION, String(version));
      ecrire(CLE_DATE, date);
    }
    oublier(CLE_ATTENTE);
    choisirCollection(lire('boites-a-classer:collection') || coll.id);
  }

  async function lireVersion(id, version) {
    const rep = await fetch(API + (version ? '?version=' + version : ''), { headers: entetesIdentite(id) });
    if (rep.status === 404) return null;
    if (rep.status === 401) throw new Error('session expirée');
    if (!rep.ok) throw new Error('serveur ' + rep.status);
    const donnees = JSON.parse(await decompresser(new Uint8Array(await rep.arrayBuffer())));
    if (!donnees || typeof donnees !== 'object') throw new Error('sauvegarde illisible');
    return { donnees, version: rep.headers.get('X-Version'), date: rep.headers.get('X-Date') };
  }

  // Au démarrage et au retour sur l'onglet : prend la version du serveur si elle est plus récente.
  async function synchroniser() {
    const id = identite();
    if (!id || !enLignePossible || Date.now() - derniereSynchro < 20000) return;
    derniereSynchro = Date.now();
    if (lire(CLE_ATTENTE)) { envoyer(); return; } // cet appareil a du nouveau : il passe en premier
    try {
      const rep = await fetch(API, { headers: { ...entetesIdentite(id), 'X-Version-Connue': lire(CLE_VERSION) || '' } });
      if (rep.status === 204) return;
      if (rep.status === 401 && identite() === id) { sessionExpiree(); return; }
      if (rep.status === 404) { ecrire(CLE_ATTENTE, '1'); envoyer(); return; }
      if (!rep.ok) throw new Error('serveur ' + rep.status);
      if (lire(CLE_ATTENTE) || identite() !== id) return; // changement pendant la requête
      const donnees = JSON.parse(await decompresser(new Uint8Array(await rep.arrayBuffer())));
      appliquerVersion(donnees, rep.headers.get('X-Version'), rep.headers.get('X-Date'));
      info.textContent = 'Travail mis à jour depuis la sauvegarde en ligne.';
    } catch (e) {
      majEtatEnLigne('Pas de connexion au serveur.', true);
    }
  }

  /* Comptes */

  // Le mot de passe ne quitte pas l'appareil : on envoie un secret qui en est dérivé (PBKDF2-SHA256, sel tiré de
  // l'identifiant). Le serveur n'en garde qu'une empreinte (voir functions/api/compte/[action].js).
  async function secretDe(identifiant, mdp) {
    const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(mdp), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({
      name: 'PBKDF2', hash: 'SHA-256', iterations: TOURS_PBKDF2,
      salt: new TextEncoder().encode('boites-a-classer:compte:' + identifiant),
    }, cle, 256));
    return btoa(String.fromCharCode(...bits)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Appelle l'API des comptes : { statut, r } (r = réponse JSON, ou {}).
  async function appelCompte(action, corps, jeton) {
    const entetes = jeton ? { Authorization: 'Bearer ' + jeton } : {};
    const rep = await fetch(API_COMPTE + action, corps === undefined ? { headers: entetes } : {
      method: 'POST', headers: { ...entetes, 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    });
    let r = {};
    try { r = await rep.json(); } catch (e) { /* réponse vide */ }
    return { statut: rep.status, r };
  }

  const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const messageErreur = (statut, r) => (r && r.erreur ? majuscule(r.erreur) + '.' : 'Le serveur a répondu ' + statut + '.');

  // Bouton 👤 de la barre : nom du compte connecté, ou « Se connecter ».
  const boutonCompte = $('#compte');
  function majBoutonCompte() {
    majBoutonNiveau(); // niveau imposé par la classe : arrive ou part avec le compte
    const nom = jetonCompte() && lire(CLE_IDENTIFIANT);
    // Connecté : sa photo de profil, ou le rond à son initiale (app/profil.css) ; sinon 👤.
    if (nom) rondProfil($('#compte-avatar'), nom, lire(CLE_AVATAR), lire(CLE_AVATAR_FOND));
    else {
      $('#compte-avatar').textContent = '👤';
      $('#compte-avatar').classList.remove('avatar', 'defaut');
      delete $('#compte-avatar').dataset.fond;
    }
    $('#compte-nom').textContent = ' ' + (nom || 'Se connecter');
    if (nom) ajouterBadges($('#compte-nom'));
    boutonCompte.title = nom ? `Compte ${nom} : sauvegarde en ligne` : 'Se connecter pour sauvegarder son travail en ligne';
    boutonCompte.classList.toggle('connecte', !!nom);
    majBoutonExercices();
  }

  // Commence à sauvegarder sur ce compte (après une connexion ou une création de compte).
  // etat : ce que le serveur dit du compte (functions/api/compte/[action].js) : admin, enseignant, eleve.
  function ouvrirSession(identifiant, jeton, etat) {
    clearTimeout(minuterieEnvoi);
    for (const k of [CLE_CODE, CLE_VERSION, CLE_DATE]) oublier(k); // un code éventuel reste valable sur le serveur
    // Les dates des médailles restent sur l'appareil : un autre compte ne doit pas les reprendre (poste partagé).
    if (lire(CLE_IDENTIFIANT) !== identifiant) oublier(CLE_BADGES_VUS);
    ecrire(CLE_JETON, jeton);
    ecrire(CLE_IDENTIFIANT, identifiant);
    retenirDroits(etat);
    remplirSelect();
    chargerCollectionsSite(); // droits de modification des collections du site
    etatEnLigne = { texte: '', erreur: false };
    majBoutonCompte();
  }

  function retenirDroits(etat) {
    if (etat && etat.admin) ecrire(CLE_ADMIN, '1'); else oublier(CLE_ADMIN);
    if (etat && etat.enseignant) ecrire(CLE_ENSEIGNANT, '1'); else oublier(CLE_ENSEIGNANT);
    if (etat && etat.eleve) ecrire(CLE_ELEVE, JSON.stringify(etat.eleve)); else oublier(CLE_ELEVE);
    if (etat && Array.isArray(etat.badges) && etat.badges.length) ecrire(CLE_BADGES, JSON.stringify(etat.badges)); else oublier(CLE_BADGES);
    if (etat && Array.isArray(etat.badges)) noterBadgesVus(etat.badges);
    if (etat && typeof etat.avatar === 'string' && etat.avatar) ecrire(CLE_AVATAR, etat.avatar); else oublier(CLE_AVATAR);
    if (etat && etat.avatar && typeof etat.avatar_fond === 'string' && etat.avatar_fond) ecrire(CLE_AVATAR_FOND, etat.avatar_fond); else oublier(CLE_AVATAR_FOND);
  }

  // Badges du compte, à côté de son nom (site/evenement.js) : « vérifié par le site » ✔, boss d'Halloween 🎃, de Noël 🎅,
  // de Pâques 🐰, du printemps 🌷, du carnaval 👑, de l'été 🐙 ou de la rentrée 🎒, participation 🧛 ⛄ 🥚 🦋 🎊 🦀 ✏️.
  // Toujours dans cet ordre.
  const BADGES = {
    verifie: ['✔', 'Vérifié par le site', 'badge-verifie'],
    halloween: ['🎃', 'Badge Halloween', 'badge'],
    'participation-halloween': ['🧛', 'Participation à Halloween', 'badge'],
    noel: ['🎅', 'Badge Noël', 'badge'],
    'participation-noel': ['⛄', 'Participation à Noël', 'badge'],
    paques: ['🐰', 'Badge Pâques', 'badge'],
    'participation-paques': ['🥚', 'Participation à Pâques', 'badge'],
    printemps: ['🌷', 'Badge Printemps', 'badge'],
    'participation-printemps': ['🦋', 'Participation au printemps', 'badge'],
    carnaval: ['👑', 'Badge Carnaval', 'badge'],
    'participation-carnaval': ['🎊', 'Participation au carnaval', 'badge'],
    ete: ['🐙', 'Badge Été', 'badge'],
    'participation-ete': ['🦀', 'Participation à l\'été', 'badge'],
    rentree: ['🎒', 'Badge Rentrée', 'badge'],
    'participation-rentree': ['✏️', 'Participation à la rentrée', 'badge'],
  };
  function badgesCompte() {
    // Toujours dans le même ordre : celui de BADGES.
    try { const l = JSON.parse(lire(CLE_BADGES)) || []; return Object.keys(BADGES).filter((b) => l.includes(b)); } catch (e) { return []; }
  }
  function ajouterBadges(cible) {
    for (const b of badgesCompte()) {
      const s = document.createElement('span');
      [s.textContent, s.title, s.className] = BADGES[b];
      cible.appendChild(s);
    }
  }

  // Carte de profil (fenêtre du compte, app/profil.css) : chaque badge y devient une médaille, avec un nom court, une
  // précision et sa famille (couleur de l'anneau et du ruban).
  const MEDAILLES = {
    verifie: ['Vérifié', 'par le site', 'verifie'],
    halloween: ['Halloween', 'Roi des fantômes vaincu', 'or'],
    'participation-halloween': ['Participation', 'Halloween', 'argent'],
    noel: ['Noël', 'Père Noël vaincu', 'or'],
    'participation-noel': ['Participation', 'Noël', 'argent'],
    paques: ['Pâques', 'Lapin de Pâques attrapé', 'or'],
    'participation-paques': ['Participation', 'Pâques', 'argent'],
    printemps: ['Printemps', 'Reine des abeilles attrapée', 'or'],
    'participation-printemps': ['Participation', 'Printemps', 'argent'],
    carnaval: ['Carnaval', 'Géant couvert de confettis', 'or'],
    'participation-carnaval': ['Participation', 'Carnaval', 'argent'],
    ete: ['Été', 'Grande Pieuvre attrapée', 'or'],
    'participation-ete': ['Participation', 'Été', 'argent'],
    rentree: ['Rentrée', 'Cartable géant attrapé', 'or'],
    'participation-rentree': ['Participation', 'Rentrée', 'argent'],
  };
  // Teinte (0 à 359) tirée d'un nom : la même pour un même nom, d'un appareil à l'autre.
  function teinte(nom) {
    let h = 7;
    for (const c of nom) h = (h * 31 + c.codePointAt(0)) % 360;
    return h;
  }
  // Rond de la photo de profil, sur la couleur choisie par l'admin (fond) ; sans photo, l'initiale du nom sur un dégradé de sa teinte.
  function rondProfil(el, nom, avatar, fond) {
    el.classList.add('avatar');
    el.classList.toggle('defaut', !avatar);
    if (avatar && fond) el.dataset.fond = fond; else delete el.dataset.fond;
    el.style.setProperty('--teinte', teinte(nom || '?'));
    el.textContent = avatar || ([...(nom || '?')][0] || '?').toLocaleUpperCase('fr-FR');
    return el;
  }
  function rendreCarteProfil() {
    let carte = $('#sv-carte');
    if (!carte) { // index.html d'avant la carte : elle prend la place des anciennes lignes « Compte : … » et « Badges : … »
      carte = document.createElement('div');
      carte.id = 'sv-carte';
      carte.className = 'carte-profil';
      $('#sv-compte').prepend(carte);
    }
    for (const vieux of document.querySelectorAll('#sv-compte .sv-qui, #sv-badges')) vieux.remove();
    const nom = lire(CLE_IDENTIFIANT) || '';
    const eleve = eleveConnecte();
    const role = eleve ? ['eleve', 'Élève'] : lire(CLE_ADMIN) ? ['admin', 'Admin'] : lire(CLE_ENSEIGNANT) ? ['enseignant', 'Enseignant'] : null;
    const el = (balise, classe, texte) => {
      const e = document.createElement(balise);
      if (classe) e.className = classe;
      if (texte) e.textContent = texte;
      return e;
    };
    carte.style.setProperty('--teinte', teinte(nom || '?'));
    const identite = el('div', 'cp-identite');
    const rond = rondProfil(el('span', 'grand'), nom, lire(CLE_AVATAR), lire(CLE_AVATAR_FOND));
    if (rond.dataset.fond) carte.dataset.fond = rond.dataset.fond; else delete carte.dataset.fond; // le bandeau prend la couleur du rond
    rond.title = lire(CLE_AVATAR) ? 'Photo de profil (choisie par l\'administrateur)' : 'Pas encore de photo de profil : l\'administrateur peut en choisir une';
    if (badgesCompte().includes('verifie')) { rond.classList.add('verifie'); rond.title += ' · vérifié par le site'; }
    const qui = el('div', 'cp-qui');
    const n = el('strong', 'cp-nom', nom);
    n.title = nom;
    qui.append(n);
    if (role) qui.append(el('span', 'cp-role ' + role[0], role[1]));
    identite.append(rond, qui);
    const medailles = badgesCompte();
    const titre = el('p', 'cp-titre', medailles.length > 1 ? 'Mes médailles' : 'Ma médaille');
    let liste;
    if (medailles.length) {
      liste = el('ul', 'cp-medailles');
      liste.setAttribute('aria-label', 'Médailles');
      for (const b of medailles) {
        const [court, detail, famille] = MEDAILLES[b];
        const li = el('li', 'medaille ' + famille);
        li.title = BADGES[b][1];
        li.append(el('span', 'm-ruban'), el('span', 'm-disque', BADGES[b][0]), el('span', 'm-nom', court), el('span', 'm-detail', detail));
        liste.append(li);
      }
    } else {
      titre.textContent = 'Médailles';
      liste = el('p', 'cp-vide', 'Pas encore de médaille : on en gagne pendant les événements du site.');
    }
    carte.replaceChildren(el('div', 'cp-bandeau'), identite, titre, liste, toutesMedailles(medailles));
    carte.hidden = false;
  }
  // Le serveur ne garde pas la date des badges : l'appareil note quand il voit chacun pour la première fois. À la première
  // lecture (connexion, ou appareil d'avant la 3.40.0), ceux déjà là restent sans date : on ne sait pas quand ils ont été gagnés.
  function noterBadgesVus(badges) {
    let vus = null;
    try { vus = JSON.parse(lire(CLE_BADGES_VUS)); } catch (e) { /* illisible : on repart de zéro */ }
    const debut = !vus || typeof vus !== 'object' || Array.isArray(vus);
    if (debut) vus = {};
    let change = debut;
    for (const b of badges) {
      if (typeof b !== 'string' || Object.hasOwn(vus, b)) continue;
      vus[b] = debut ? null : new Date().toISOString();
      change = true;
    }
    if (change) ecrire(CLE_BADGES_VUS, JSON.stringify(vus));
  }
  function dateBadge(b) {
    try { const d = (JSON.parse(lire(CLE_BADGES_VUS)) || {})[b]; return typeof d === 'string' ? d : null; } catch (e) { return null; }
  }
  // Comment gagner chaque médaille (« 🏅 Mes médailles ») ; une médaille sans ligne ici le dit d'après son nom.
  const COMMENT_MEDAILLE = {
    verifie: 'Porter le plus de coups au boss d\'un événement',
    halloween: 'Porter le plus de coups au Roi des fantômes pendant Halloween',
    'participation-halloween': 'Attraper un fantôme ou frapper le boss pendant Halloween',
    noel: 'Porter le plus de coups au Père Noël pendant Noël',
    'participation-noel': 'Attraper un lutin ou frapper le Père Noël pendant Noël',
    paques: 'Attraper le plus de fois le Lapin de Pâques pendant Pâques',
    'participation-paques': 'Attraper un œuf ou le Lapin de Pâques pendant Pâques',
    printemps: 'Attraper le plus de fois la Reine des abeilles au printemps',
    'participation-printemps': 'Attraper un papillon ou la Reine des abeilles au printemps',
    carnaval: 'Lancer le plus de confettis au Géant du carnaval',
    'participation-carnaval': 'Attraper un masque ou lancer des confettis au Géant pendant le carnaval',
    ete: 'Attraper le plus de fois la Grande Pieuvre pendant l\'été',
    'participation-ete': 'Attraper un crabe ou la Grande Pieuvre pendant l\'été',
    rentree: 'Attraper le plus de fois le Cartable géant à la rentrée',
    'participation-rentree': 'Attraper un crayon ou le Cartable géant à la rentrée',
  };
  const commentMedaille = (b) => COMMENT_MEDAILLE[b]
    || (b.startsWith('participation-') ? 'Participer à l\'événement ' + MEDAILLES[b][1] : 'Vaincre le boss de l\'événement ' + MEDAILLES[b][0]);
  // Toutes les médailles du site, dans l'ordre de BADGES : gagnées en couleur (avec la date si l'appareil la connaît), les
  // autres grisées avec comment les gagner. Repliée par défaut ; reste ouverte d'un affichage à l'autre.
  let medaillesOuvertes = false;
  function toutesMedailles(gagnees) {
    const el = (balise, classe, texte) => {
      const e = document.createElement(balise);
      if (classe) e.className = classe;
      if (texte) e.textContent = texte;
      return e;
    };
    const toutes = Object.keys(BADGES).filter((b) => MEDAILLES[b]);
    const boite = el('details', 'cp-toutes');
    boite.open = medaillesOuvertes;
    boite.addEventListener('toggle', () => { medaillesOuvertes = boite.open; });
    boite.append(el('summary', '', `🏅 Toutes les médailles · ${gagnees.length} sur ${toutes.length}`));
    const grille = el('ul', 'cp-grille');
    for (const b of toutes) {
      const [court, detail, famille] = MEDAILLES[b];
      const a = gagnees.includes(b);
      const li = el('li', 'medaille ' + famille + (a ? '' : ' manquante'));
      li.title = BADGES[b][1] + (a ? '' : ' : pas encore gagnée');
      const quand = a && dateBadge(b);
      li.append(el('span', 'm-ruban'), el('span', 'm-disque', BADGES[b][0]), el('span', 'm-nom', court), el('span', 'm-detail', detail),
        a ? el('span', 'm-etat', '✓ Gagnée' + (quand ? ' le ' + new Date(quand).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''))
          : el('span', 'm-comment', commentMedaille(b)));
      grille.append(li);
    }
    boite.append(grille);
    return boite;
  }
  // Le compte vient de gagner des badges (site/evenement.js, victoire contre le boss).
  window.addEventListener('hanter:badges', () => rafraichirCompte());

  // Relit l'état du compte au démarrage et au retour sur l'onglet (une fois par minute au plus) : un rôle donné ou retiré
  // entre-temps, un prénom changé par l'enseignant, une photo de profil donnée par l'admin.
  let compteRelu = 0;
  async function rafraichirCompte() {
    compteRelu = Date.now();
    const jeton = jetonCompte();
    if (!jeton || !enLignePossible) return;
    try {
      const { statut, r } = await appelCompte('session', undefined, jeton);
      if (statut === 401 && jetonCompte() === jeton) { sessionExpiree(); return; }
      if (statut !== 200 || jetonCompte() !== jeton) return;
      if (r.identifiant) ecrire(CLE_IDENTIFIANT, r.identifiant);
      const avant = [lire(CLE_AVATAR), lire(CLE_AVATAR_FOND)];
      retenirDroits(r);
      remplirSelect(); // exercices donnés par l'enseignant
      annoncerExercices();
      majBoutonCompte();
      if (fenSauvegarde.open) rendreSauvegarde();
      // Photo (ou couleur du rond) changée par l'admin depuis la dernière lecture : pas à la connexion, qui l'a déjà retenue.
      if (lire(CLE_AVATAR) && (lire(CLE_AVATAR) !== avant[0] || lire(CLE_AVATAR_FOND) !== avant[1])) annoncerPhoto(lire(CLE_AVATAR) !== avant[0]);
    } catch (e) { /* hors connexion */ }
  }

  // Bulle sous le bouton du compte : « Nouvelle photo de profil ! » (app/profil.css, .annonce-photo). Part seule après
  // 8 secondes ; un appui ouvre la fenêtre du compte et sa carte.
  function annoncerPhoto(nouvelle) {
    // Une fenêtre (l'aide du premier lancement…) rendrait la bulle inerte : elle attend sa fermeture.
    const fenetre = document.querySelector('dialog:modal');
    if (fenetre) { fenetre.addEventListener('close', () => setTimeout(() => annoncerPhoto(nouvelle), 300), { once: true }); return; }
    for (const vieille of document.querySelectorAll('.annonce-photo')) vieille.remove();
    const bulle = document.createElement('button');
    bulle.type = 'button';
    bulle.className = 'annonce-photo';
    bulle.setAttribute('role', 'status');
    const rond = document.createElement('span');
    rond.className = 'ap-rond';
    const etincelle = () => { const s = document.createElement('span'); s.className = 'ap-etincelle'; s.textContent = '✨'; s.setAttribute('aria-hidden', 'true'); return s; };
    rond.append(rondProfil(document.createElement('span'), lire(CLE_IDENTIFIANT), lire(CLE_AVATAR), lire(CLE_AVATAR_FOND)), etincelle(), etincelle());
    const texte = document.createElement('span');
    texte.className = 'ap-texte';
    const titre = document.createElement('strong');
    titre.textContent = nouvelle ? 'Nouvelle photo de profil !' : 'Nouvelle couleur pour ta photo !';
    const detail = document.createElement('small');
    detail.textContent = 'Choisie par l\'administrateur. Touche pour voir ta carte.';
    texte.append(titre, detail);
    bulle.append(rond, texte);
    const r = boutonCompte.getBoundingClientRect();
    bulle.style.top = (r.height ? r.bottom + 10 : 12) + 'px';
    bulle.style.right = Math.max(12, r.height ? innerWidth - r.right : 12) + 'px';
    let partie = false;
    const partir = () => {
      if (partie) return;
      partie = true;
      bulle.classList.add('sortie');
      setTimeout(() => bulle.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
    };
    bulle.addEventListener('click', () => { partir(); ouvrirSauvegarde(); });
    document.body.append(bulle);
    setTimeout(partir, 8000);
    const barre = $('#compte-avatar');
    barre.classList.remove('nouvelle');
    void barre.offsetWidth; // relance l'onde si elle tournait encore
    barre.classList.add('nouvelle');
    barre.addEventListener('animationend', () => barre.classList.remove('nouvelle'), { once: true });
  }

  // Élève : rappelle les exercices donnés par l'enseignant qui ne sont pas encore réussis.
  function annoncerExercices() {
    if (info.textContent !== infoDefaut) return;
    const restent = exercicesDonnes().filter((c) => !reussie(c));
    if (restent.length) info.textContent = `📌 Ton enseignant t'a donné ${pluriel(restent.length, 'exercice', 'exercices')} à faire (${restent.map((c) => c.nom).join(', ')}) : bouton 📌 en haut.`;
  }

  // Élève : les collections données par son enseignant, dans l'ordre de la page « Mes classes ».
  function exercicesDonnes() {
    const eleve = jetonCompte() && eleveConnecte();
    return eleve && Array.isArray(eleve.exercices) ? eleve.exercices.map((id) => toutes().find((c) => c.id === id)).filter(Boolean) : [];
  }

  // Bouton 📌 de la barre (élève connecté seulement), avec le nombre d'exercices pas encore réussis.
  function majBoutonExercices() {
    const bouton = $('#exercices');
    const restent = exercicesDonnes().filter((c) => !reussie(c)).length;
    bouton.hidden = !(jetonCompte() && eleveConnecte());
    $('#exercices-nb').hidden = !restent;
    $('#exercices-nb').textContent = restent;
    bouton.setAttribute('aria-label', restent ? `Mes exercices : ${restent} à faire` : 'Mes exercices');
    if ($('#fen-exercices').open) remplirExercices();
  }

  function remplirExercices() {
    const eleve = jetonCompte() && eleveConnecte();
    const donnes = exercicesDonnes();
    const restent = donnes.filter((c) => !reussie(c));
    const faits = donnes.filter(reussie);
    const classe = eleve && eleve.classe ? ` (classe ${eleve.classe})` : '';
    $('#ex-aide').textContent = !donnes.length
      ? `Ton enseignant${classe} ne t'a pas encore donné d'exercice. En attendant, tu peux choisir une collection dans la liste en haut.`
      : restent.length
        ? `Les exercices donnés par ton enseignant${classe}. Un exercice est réussi quand « ✔ Vérifier » ne trouve plus d'erreur.`
        : `🎉 Bravo, tu as réussi tous les exercices de ton enseignant${classe} !`;
    const ligne = (c) => {
      const el = document.createElement('div');
      el.className = 'coll' + (c === coll ? ' courante' : '');
      const infos = document.createElement('div');
      infos.className = 'coll-infos';
      const titre = document.createElement('strong');
      titre.textContent = marqueReussite(c) + c.nom;
      const detail = document.createElement('small');
      const nomMatiere = (MATIERES.find(([m]) => m === matiere(c)) || [])[1];
      detail.textContent = [nomMatiere, pluriel(c.etres.length, ...elements(c)), c === coll ? 'en cours' : ''].filter(Boolean).join(' · ');
      infos.append(titre, detail);
      const actions = document.createElement('div');
      actions.className = 'coll-actions';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (reussie(c) ? '' : ' principal');
      b.textContent = c === coll ? 'Continuer' : reussie(c) ? 'Revoir' : 'Commencer';
      b.addEventListener('click', () => {
        fermerFenetres();
        if (c !== coll) choisirCollection(c.id);
      });
      actions.appendChild(b);
      el.append(infos, actions);
      return el;
    };
    const section = (titre, liste) => {
      const s = document.createElement('section');
      s.className = 'coll-groupe';
      const h = document.createElement('h3');
      h.textContent = titre;
      s.append(h, ...liste.map(ligne));
      return s;
    };
    const parties = [];
    if (restent.length) parties.push(section(`À faire (${restent.length})`, restent));
    if (faits.length) parties.push(section(`Réussis (${faits.length})`, faits));
    $('#liste-exercices').replaceChildren(...parties);
  }

  function ouvrirExercices() {
    fermerMenu();
    remplirExercices();
    $('#fen-exercices').showModal();
  }

  $('#exercices').addEventListener('click', ouvrirExercices);
  $('#fen-exercices').querySelector('.fermer').addEventListener('click', () => $('#fen-exercices').close());

  function eleveConnecte() {
    try { return JSON.parse(lire(CLE_ELEVE)) || null; } catch (e) { return null; }
  }

  // Deux contenus identiques, quel que soit l'ordre des clés ?
  const memesDonnees = (a, b) => {
    const ka = Object.keys(a).sort();
    return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
  };

  /* Collections du site */

  // Publiées par un admin, elles sont lues au démarrage (GET /api/collections) et gardées ici pour le hors-ligne.
  const CLE_COLLECTIONS_SITE = 'boites-a-classer-site:collections'; // hors du préfixe sauvegardé : propre à l'appareil

  function lireCollectionsSite(texte) {
    let liste = [];
    try { liste = JSON.parse(texte); } catch (e) { /* rien de gardé */ }
    const res = [];
    for (const c of Array.isArray(liste) ? liste : []) {
      try {
        const propre = nettoyerCollection(c);
        if (propre.id.startsWith('site-') && !res.some((x) => x.id === propre.id)) res.push(propre);
      } catch (e) { /* collection abîmée : ignorée */ }
    }
    return res;
  }

  function appliquerCollectionsSite(liste) {
    const avant = JSON.stringify(collectionsSite);
    collectionsSite = liste;
    ecrire(CLE_COLLECTIONS_SITE, JSON.stringify(liste));
    if (JSON.stringify(liste) === avant) return;
    remplirSelect();
    // La collection en cours a changé ou a été retirée : on la recharge (ou on revient à la première fournie).
    if (coll && coll.id.startsWith('site-')) choisirCollection(coll.id);
    if (fenCollections.open) remplirListeCollections();
  }

  async function chargerCollectionsSite() {
    try {
      const jeton = jetonCompte();
      const rep = await fetch(RACINE_API + '/collections', jeton ? { headers: { Authorization: 'Bearer ' + jeton } } : {});
      if (!rep.ok) return;
      const texte = await rep.text();
      try {
        modifiablesSite = new Set(JSON.parse(texte).filter((c) => c && c.modifiable).map((c) => c.id));
      } catch (e) { modifiablesSite = new Set(); }
      appliquerCollectionsSite(lireCollectionsSite(texte));
      if (fenCollections.open) remplirListeCollections(); // les droits de modification ont pu changer
    } catch (e) { /* hors connexion : on garde la copie de l'appareil */ }
  }

  async function appelCollections(methode, corps, id) {
    const rep = await fetch(RACINE_API + '/collections' + (id ? '?id=' + encodeURIComponent(id) : ''), {
      method: methode,
      headers: { Authorization: 'Bearer ' + jetonCompte(), 'Content-Type': 'application/json' },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    if (rep.status === 401) { sessionExpiree(); throw new Error('session expirée, reconnecte-toi'); }
    if (rep.status !== 204) {
      let r = {};
      try { r = await rep.json(); } catch (e) { /* réponse vide */ }
      throw new Error(r.erreur || 'serveur ' + rep.status);
    }
  }

  async function publierCollection(c) {
    const propre = nettoyerCollection(c);
    await appelCollections('POST', { collection: propre });
    modifiablesSite.add(propre.id);
    const existe = collectionsSite.some((x) => x.id === propre.id);
    appliquerCollectionsSite(existe ? collectionsSite.map((x) => (x.id === propre.id ? propre : x)) : [...collectionsSite, propre]);
  }

  async function retirerCollection(c) {
    await appelCollections('DELETE', null, c.id);
    appliquerCollectionsSite(collectionsSite.filter((x) => x.id !== c.id));
  }

  /* Fenêtre « Compte et sauvegarde en ligne » */

  const fenSauvegarde = $('#fen-sauvegarde');
  const svMessage = fenSauvegarde.querySelector('.message');
  const boutonRecuperer = $('#sv-recuperer');
  let creation = false; // formulaire de compte en mode « Créer un compte »
  let voirConnexion = false; // avec un code : formulaire de compte affiché (« Utiliser un compte à la place »)
  let enAttenteDeChoix = null; // connexion réussie, mais le compte et ce navigateur ont un travail différent

  function majEtatEnLigne(texte, erreur) {
    if (texte !== undefined) etatEnLigne = { texte, erreur: !!erreur };
    const el = $('#sv-etat');
    const date = lire(CLE_DATE);
    el.textContent = etatEnLigne.texte
      || (lire(CLE_ATTENTE) ? 'Envoi en attente…' : date ? `Dernière sauvegarde : ${dateLisible(date)}` : '');
    el.classList.toggle('erreur', etatEnLigne.erreur);
  }

  function ouvrirSauvegarde() {
    fermerMenu();
    svMessage.textContent = '';
    voirConnexion = false;
    enAttenteDeChoix = null;
    rendreSauvegarde();
    fenSauvegarde.showModal();
    if (!jetonCompte() && !codeSauvegarde() && enLignePossible) $('#sv-identifiant').focus();
  }

  function rendreSauvegarde() {
    const compte = !!jetonCompte();
    const code = !compte && codeSauvegarde();
    $('#sv-connexion').hidden = compte || (code && !voirConnexion);
    $('#sv-compte').hidden = !compte;
    $('#sv-inactive').hidden = compte || !!code || !!enAttenteDeChoix;
    $('#sv-active').hidden = !code;
    $('#sv-suivi').hidden = !compte && !code;
    $('#sv-arreter').hidden = !code;
    $('#sv-reglages').hidden = !compte;
    $('#sv-impossible').hidden = enLignePossible;
    $('#sv-activer').disabled = boutonRecuperer.disabled = $('#sv-entrer').disabled = $('#sv-bascule').disabled = !enLignePossible;
    $('#sv-form-compte').hidden = !!enAttenteDeChoix;
    $('#sv-choix').hidden = !enAttenteDeChoix;
    $('#sv-eleve').hidden = creation || !!enAttenteDeChoix;
    $('#sv-titre-connexion').textContent = creation ? 'Créer un compte' : 'Se connecter';
    $('#sv-champ-mdp2').hidden = !creation;
    $('#sv-mdp').autocomplete = creation ? 'new-password' : 'current-password';
    $('#sv-entrer').textContent = creation ? 'Créer mon compte' : 'Se connecter';
    $('#sv-bascule').textContent = creation ? 'J\'ai déjà un compte' : 'Créer un compte';
    if (!$('#sv-identifiant').value) $('#sv-identifiant').value = lire(CLE_IDENTIFIANT) || '';
    for (const b of [boutonRecuperer, $('#sv-arreter'), $('#sv-deconnecter'), $('#sv-supprimer')]) remettreConfirmation(b);
    if (compte) rendreCarteProfil();
    $('#sv-admin').hidden = !compte || !lire(CLE_ADMIN);
    const eleve = compte && eleveConnecte();
    $('#sv-enseignant').hidden = !compte || !lire(CLE_ENSEIGNANT);
    $('#sv-classe-eleve').hidden = !eleve;
    if (eleve) {
      $('#sv-classe-nom').textContent = eleve.classe || '';
      $('#sv-classe-enseignant').textContent = eleve.enseignant || '';
    }
    $('#sv-details-mdp').hidden = $('#sv-details-suppression').hidden = !!eleve; // un élève n'a pas de mot de passe
    // Élève (souvent sur un ordinateur de classe partagé) : en se déconnectant, son travail quitte ce navigateur par défaut
    // (il reste sur son compte).
    if (eleve && !$('#sv-effacer').dataset.touche) $('#sv-effacer').checked = true;
    $('#sv-suppression-classes').hidden = !lire(CLE_ENSEIGNANT);
    if (code) $('#sv-code-affiche').textContent = code;
    if (compte || code) {
      majEtatEnLigne();
      chargerVersions();
    }
  }

  // Boutons à double appui (« Confirmer ? ») : le premier arme, le second agit.
  function confirme(bouton) {
    if (bouton.classList.contains('confirmer')) { remettreConfirmation(bouton); return true; }
    bouton.classList.add('attention', 'confirmer');
    clearTimeout(bouton.minuterie);
    bouton.minuterie = setTimeout(() => remettreConfirmation(bouton), 4000);
    return false;
  }
  function remettreConfirmation(bouton) {
    clearTimeout(bouton.minuterie);
    bouton.classList.remove('confirmer');
    if (bouton.id !== 'sv-supprimer') bouton.classList.remove('attention');
  }

  async function chargerVersions() {
    const ul = $('#sv-versions');
    const ligne = (texte) => { const li = document.createElement('li'); li.textContent = texte; return li; };
    ul.replaceChildren(ligne('Chargement…'));
    try {
      const rep = await fetch(API + '?liste=1', { headers: entetesIdentite(identite()) });
      if (rep.status === 401 && jetonCompte()) { sessionExpiree(); return; }
      if (!rep.ok) throw new Error();
      const liste = await rep.json();
      if (!liste.length) { ul.replaceChildren(ligne('Aucune pour l\'instant.')); return; }
      ul.replaceChildren(...liste.map((v, i) => {
        const li = ligne(`${dateLisible(v.date)} · ${Math.max(1, Math.round(v.taille / 1024))} Ko`);
        if (i === 0) {
          li.append(' (la plus récente)');
        } else {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn';
          b.innerHTML = '<span class="txt-normal">Revenir à celle-ci</span><span class="txt-confirmer">Confirmer ?</span>';
          b.addEventListener('click', () => { if (confirme(b)) revenirA(v.version, v.date); });
          li.appendChild(b);
        }
        return li;
      }));
    } catch (e) {
      ul.replaceChildren(ligne('Impossible de joindre le serveur.'));
    }
  }

  async function revenirA(version, date) {
    try {
      const v = await lireVersion(identite(), version);
      if (!v) throw new Error('version introuvable');
      appliquerVersion(v.donnees, v.version, v.date);
      ecrire(CLE_ATTENTE, '1'); // elle devient la plus récente : les autres versions restent sur le serveur
      envoyer();
      fermerFenetres();
      info.textContent = `Travail remis comme le ${dateLisible(date)}.`;
    } catch (e) {
      svMessage.textContent = 'Impossible de revenir à cette version : ' + (e && e.message ? e.message : e);
    }
  }

  /* Connexion et création de compte */

  $('#sv-bascule').addEventListener('click', () => {
    creation = !creation;
    svMessage.textContent = '';
    rendreSauvegarde();
    $('#sv-identifiant').focus();
  });

  $('#sv-form-compte').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const champId = $('#sv-identifiant');
    const identifiant = sansAccents(champId.value.trim());
    const mdp = $('#sv-mdp').value;
    if (!FORME_IDENTIFIANT.test(identifiant)) {
      svMessage.textContent = 'L\'identifiant : de 3 à 30 lettres sans accent, chiffres, points, tirets ou _, sans espace (ex. lea.cm2).';
      champId.focus();
      return;
    }
    if (creation && mdp.length < MDP_MIN) { svMessage.textContent = `Choisis un mot de passe d'au moins ${MDP_MIN} caractères.`; return; }
    if (creation && mdp !== $('#sv-mdp2').value) { svMessage.textContent = 'Les deux mots de passe ne sont pas les mêmes.'; return; }
    if (!mdp) { svMessage.textContent = 'Écris ton mot de passe.'; return; }

    const bouton = $('#sv-entrer');
    bouton.disabled = true;
    svMessage.textContent = creation ? 'Création du compte…' : 'Connexion…';
    try {
      const secret = await secretDe(identifiant, mdp);
      const { statut, r } = await appelCompte(creation ? 'inscription' : 'connexion', { identifiant, secret });
      if (statut === 409) { svMessage.textContent = 'Cet identifiant est déjà pris : choisis-en un autre.'; return; }
      if (statut === 401) { svMessage.textContent = 'Identifiant ou mot de passe incorrect.'; return; }
      if (statut !== 200 || !r.jeton) { svMessage.textContent = messageErreur(statut, r); return; }
      $('#sv-mdp').value = $('#sv-mdp2').value = '';

      if (creation) {
        // Nouveau compte : le travail de ce navigateur devient sa première version.
        ouvrirSession(identifiant, r.jeton);
        ecrire(CLE_ATTENTE, '1');
        envoyer();
        creation = false;
        rendreSauvegarde();
        svMessage.textContent = 'Compte créé ! Ton travail est maintenant sauvegardé sur ce compte.';
        return;
      }

      await entrerDansCompte(identifiant, r);
    } catch (e) {
      svMessage.textContent = 'Impossible de joindre le serveur : ' + (e && e.message ? e.message : e);
    } finally {
      bouton.disabled = false;
    }
  });

  // Après une connexion (mot de passe ou code d'élève) : on regarde ce que le compte a déjà avant de toucher au travail
  // de ce navigateur.
  async function entrerDansCompte(identifiant, r) {
    const v = await lireVersion('compte ' + r.jeton);
    const local = donneesLocales();
    if (v && Object.keys(local).length && !memesDonnees(local, v.donnees)) {
      enAttenteDeChoix = { identifiant, jeton: r.jeton, etat: r, v };
      rendreSauvegarde();
      svMessage.textContent = '';
      return;
    }
    ouvrirSession(identifiant, r.jeton, r);
    if (v) {
      appliquerVersion(v.donnees, v.version, v.date);
      fermerFenetres();
      info.textContent = `Bonjour ${identifiant} ! Ton travail est récupéré (sauvegarde du ${dateLisible(v.date)}).`;
      if (r.eleve && Array.isArray(r.eleve.exercices) && r.eleve.exercices.length) {
        info.textContent += ` 📌 ${pluriel(r.eleve.exercices.length, 'exercice', 'exercices')} de ton enseignant : bouton 📌 en haut.`;
      }
    } else {
      ecrire(CLE_ATTENTE, '1');
      envoyer();
      rendreSauvegarde();
      svMessage.textContent = `Bonjour ${identifiant} ! Ton travail est maintenant sauvegardé sur ton compte.`;
    }
  }

  // Élève : connexion avec le code personnel donné par son enseignant (page site/classe/).
  $('#sv-form-eleve').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const champ = $('#sv-code-eleve');
    const code = champ.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!FORME_CODE_ELEVE.test(code)) {
      svMessage.textContent = 'Ton code a 8 lettres et chiffres, par exemple K7MP-Q3RX. Vérifie-le sur ta carte.';
      champ.focus();
      return;
    }
    const bouton = $('#sv-entrer-eleve');
    bouton.disabled = true;
    svMessage.textContent = 'Connexion…';
    try {
      const { statut, r } = await appelCompte('code', { code });
      if (statut === 401) { svMessage.textContent = 'Ce code ne marche pas : vérifie-le, ou demande à ton enseignant.'; return; }
      if (statut !== 200 || !r.jeton) { svMessage.textContent = messageErreur(statut, r); return; }
      champ.value = '';
      await entrerDansCompte(r.identifiant, r);
    } catch (e) {
      svMessage.textContent = 'Impossible de joindre le serveur : ' + (e && e.message ? e.message : e);
    } finally {
      bouton.disabled = false;
    }
  });

  $('#sv-prendre').addEventListener('click', () => {
    const { identifiant, jeton, etat, v } = enAttenteDeChoix;
    enAttenteDeChoix = null;
    ouvrirSession(identifiant, jeton, etat);
    appliquerVersion(v.donnees, v.version, v.date);
    fermerFenetres();
    info.textContent = `Bonjour ${identifiant} ! Ton travail est récupéré (sauvegarde du ${dateLisible(v.date)}).`;
  });

  $('#sv-garder').addEventListener('click', () => {
    const { identifiant, jeton, etat } = enAttenteDeChoix;
    enAttenteDeChoix = null;
    ouvrirSession(identifiant, jeton, etat);
    ecrire(CLE_ATTENTE, '1'); // devient la version la plus récente du compte
    envoyer();
    rendreSauvegarde();
    svMessage.textContent = 'Connecté au compte. Le travail de ce navigateur y est envoyé.';
  });

  $('#sv-vers-compte').addEventListener('click', () => {
    voirConnexion = true;
    svMessage.textContent = '';
    rendreSauvegarde();
    $('#sv-connexion').scrollIntoView({ block: 'nearest' });
    $('#sv-identifiant').focus();
  });

  /* Compte connecté */

  $('#sv-effacer').addEventListener('change', () => { $('#sv-effacer').dataset.touche = '1'; });
  $('#sv-deconnecter').addEventListener('click', async (ev) => {
    const bouton = ev.currentTarget;
    const effacer = $('#sv-effacer').checked;
    // Ce qui n'est pas encore parti est envoyé avant de fermer la session.
    if (lire(CLE_ATTENTE) && !bouton.classList.contains('confirmer')) {
      await envoyer();
      if (lire(CLE_ATTENTE)) {
        confirme(bouton);
        svMessage.textContent = effacer
          ? 'Tes derniers changements n\'ont pas pu être envoyés : en te déconnectant, ils seront perdus. Appuie encore pour confirmer.'
          : 'Tes derniers changements n\'ont pas pu être envoyés : ils restent dans ce navigateur. Appuie encore pour te déconnecter.';
        return;
      }
    }
    remettreConfirmation(bouton);
    const jeton = jetonCompte();
    clearTimeout(minuterieEnvoi);
    for (const k of [...CLES_COMPTE, CLE_VERSION, CLE_DATE, CLE_ATTENTE]) oublier(k);
    modifiablesSite = new Set();
    appelCompte('deconnexion', {}, jeton).catch(() => { /* la session expirera d'elle-même */ });
    if (effacer) appliquerVersion({});
    etatEnLigne = { texte: '', erreur: false };
    $('#sv-identifiant').value = '';
    $('#sv-effacer').checked = false;
    delete $('#sv-effacer').dataset.touche;
    remplirSelect();
    majBoutonCompte();
    rendreSauvegarde();
    svMessage.textContent = effacer
      ? 'Déconnecté. Le travail a été effacé de ce navigateur ; il reste sur ton compte.'
      : 'Déconnecté. Ton travail reste dans ce navigateur, et sur ton compte.';
  });

  $('#sv-form-mdp').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const actuel = $('#sv-mdp-actuel').value;
    const nouveau = $('#sv-mdp-nouveau').value;
    if (nouveau.length < MDP_MIN) { svMessage.textContent = `Le nouveau mot de passe doit avoir au moins ${MDP_MIN} caractères.`; return; }
    if (nouveau !== $('#sv-mdp-nouveau2').value) { svMessage.textContent = 'Les deux nouveaux mots de passe ne sont pas les mêmes.'; return; }
    const identifiant = lire(CLE_IDENTIFIANT);
    svMessage.textContent = 'Changement du mot de passe…';
    try {
      const [secret, secretNouveau] = await Promise.all([secretDe(identifiant, actuel), secretDe(identifiant, nouveau)]);
      const { statut, r } = await appelCompte('mot-de-passe', { secret, nouveau: secretNouveau }, jetonCompte());
      if (statut === 401) { sessionExpiree(); return; }
      if (statut === 403) { svMessage.textContent = 'Le mot de passe actuel est incorrect.'; return; }
      if (statut !== 200 || !r.jeton) { svMessage.textContent = messageErreur(statut, r); return; }
      ecrire(CLE_JETON, r.jeton);
      for (const id of ['#sv-mdp-actuel', '#sv-mdp-nouveau', '#sv-mdp-nouveau2']) $(id).value = '';
      ev.target.closest('details').open = false;
      svMessage.textContent = 'Mot de passe changé. Sur tes autres appareils, il faudra te reconnecter.';
    } catch (e) {
      svMessage.textContent = 'Impossible de joindre le serveur : ' + (e && e.message ? e.message : e);
    }
  });

  $('#sv-form-suppression').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const bouton = $('#sv-supprimer');
    const mdp = $('#sv-mdp-suppression').value;
    if (!mdp) { svMessage.textContent = 'Écris ton mot de passe pour supprimer le compte.'; return; }
    if (!confirme(bouton)) return;
    svMessage.textContent = 'Suppression…';
    try {
      const secret = await secretDe(lire(CLE_IDENTIFIANT), mdp);
      const { statut, r } = await appelCompte('suppression', { secret }, jetonCompte());
      if (statut === 401) { sessionExpiree(); return; }
      if (statut === 403) { svMessage.textContent = 'Mot de passe incorrect : le compte n\'a pas été supprimé.'; return; }
      if (statut !== 204) { svMessage.textContent = messageErreur(statut, r); return; }
      clearTimeout(minuterieEnvoi);
      for (const k of [...CLES_COMPTE, CLE_VERSION, CLE_DATE, CLE_ATTENTE]) oublier(k);
      modifiablesSite = new Set();
      $('#sv-mdp-suppression').value = $('#sv-identifiant').value = '';
      ev.target.closest('details').open = false;
      majBoutonCompte();
      rendreSauvegarde();
      svMessage.textContent = 'Compte supprimé, avec tout son travail sur le serveur. Ton travail reste dans ce navigateur.';
    } catch (e) {
      svMessage.textContent = 'Impossible de joindre le serveur : ' + (e && e.message ? e.message : e);
    }
  });

  /* Sans compte, avec un code */

  $('#sv-activer').addEventListener('click', () => {
    ecrire(CLE_CODE, nouveauCode());
    oublier(CLE_VERSION);
    oublier(CLE_DATE);
    ecrire(CLE_ATTENTE, '1');
    envoyer();
    rendreSauvegarde();
    svMessage.textContent = 'Sauvegarde en ligne activée. Note bien ton code !';
  });

  $('#sv-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const champ = $('#sv-code');
    const code = normaliserCode(champ.value);
    if (!FORME_CODE.test(code)) { svMessage.textContent = 'Un code est fait de quatre mots, par exemple lapin-tomate-nuage-velo.'; return; }
    // Ce qui est dans ce navigateur va être remplacé : un second appui est demandé s'il y a déjà du travail.
    const local = Object.keys(donneesLocales()).length > 0;
    if (local && !boutonRecuperer.classList.contains('confirmer')) {
      confirme(boutonRecuperer);
      svMessage.textContent = 'Le travail actuellement dans ce navigateur sera remplacé par celui du code. Appuie encore pour confirmer.';
      return;
    }
    remettreConfirmation(boutonRecuperer);
    boutonRecuperer.disabled = true;
    svMessage.textContent = 'Recherche…';
    try {
      const v = await lireVersion('code ' + code);
      if (!v) { svMessage.textContent = 'Aucune sauvegarde avec ce code : vérifie les quatre mots.'; return; }
      ecrire(CLE_CODE, code);
      appliquerVersion(v.donnees, v.version, v.date);
      champ.value = '';
      fermerFenetres();
      info.textContent = `Travail récupéré (sauvegarde du ${dateLisible(v.date)}). La sauvegarde en ligne continue avec ce code.`;
    } catch (e) {
      svMessage.textContent = 'Impossible de joindre le serveur : ' + (e && e.message ? e.message : e);
    } finally {
      boutonRecuperer.disabled = false;
    }
  });

  $('#sv-copier').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codeSauvegarde());
      svMessage.textContent = 'Code copié.';
    } catch (e) {
      const r = document.createRange();
      r.selectNodeContents($('#sv-code-affiche'));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      svMessage.textContent = 'Le code est sélectionné : copie-le avec Ctrl+C (ou ⌘C).';
    }
  });

  $('#sv-arreter').addEventListener('click', (ev) => {
    if (!confirme(ev.currentTarget)) return;
    clearTimeout(minuterieEnvoi);
    for (const k of [CLE_CODE, CLE_VERSION, CLE_DATE, CLE_ATTENTE]) oublier(k);
    etatEnLigne = { texte: '', erreur: false };
    rendreSauvegarde();
    svMessage.textContent = 'Sauvegarde en ligne arrêtée sur cet appareil. Ton travail reste dans ce navigateur, et sur le serveur avec ton code.';
  });

  fenSauvegarde.querySelector('.fermer').addEventListener('click', () => fenSauvegarde.close());
  boutonCompte.addEventListener('click', ouvrirSauvegarde);
  window.addEventListener('online', () => { if (lire(CLE_ATTENTE)) envoyer(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (lire(CLE_ATTENTE)) envoyer(); } else synchroniser();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - compteRelu > 60000 && !document.body.classList.contains('consultation')) rafraichirCompte();
  });

  $('#sv-lien-classes').href = SITE + '/classe/';

  /* ---------- Consultation (admin, enseignant) ---------- */

  // « #consulter=<identifiant> » (lien de la page site/admin/) : un admin ouvre le travail d'un compte ;
  // « #consulter-eleve=<id> » (lien de la page site/classe/) : un enseignant ouvre celui d'un de ses élèves. Il est
  // chargé dans une mémoire temporaire : on peut tout regarder et manipuler, rien n'est gardé ni envoyé, le travail de
  // l'admin ou de l'enseignant dans ce navigateur n'est pas touché.
  const CONSULTATIONS = {
    '#consulter=': { adresse: '/admin/travail?identifiant=', qui: 'un compte admin' },
    '#consulter-eleve=': { adresse: '/classe/travail?eleve=', qui: 'ton compte enseignant' },
  };
  const consultationDemandee = () => Object.keys(CONSULTATIONS).find((d) => location.hash.startsWith(d));

  async function ouvrirConsultation() {
    const sorte = CONSULTATIONS[consultationDemandee()];
    let identifiant = decodeURIComponent(location.hash.slice(consultationDemandee().length));
    history.replaceState(null, '', location.pathname + location.search);
    const jeton = jetonCompte();
    let donnees;
    try {
      if (!jeton) throw new Error(`connecte-toi d'abord avec ${sorte.qui}`);
      const rep = await fetch(RACINE_API + sorte.adresse + encodeURIComponent(identifiant), {
        headers: { Authorization: 'Bearer ' + jeton },
      });
      if (!rep.ok) {
        let r = {};
        try { r = await rep.json(); } catch (e) { /* réponse vide */ }
        throw new Error(r.erreur || 'serveur ' + rep.status);
      }
      if (rep.headers.get('X-Nom')) identifiant = decodeURIComponent(rep.headers.get('X-Nom')); // prénom de l'élève
      donnees = JSON.parse(await decompresser(new Uint8Array(await rep.arrayBuffer())));
      if (!donnees || typeof donnees !== 'object') throw new Error('travail illisible');
    } catch (e) {
      info.textContent = `Impossible d'ouvrir ce travail : ${e && e.message ? e.message : e}.`;
      return;
    }
    const memoire = new Map();
    stockage = {
      get length() { return memoire.size; },
      key: (i) => [...memoire.keys()][i] ?? null,
      getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
      setItem: (k, v) => { memoire.set(k, String(v)); },
      removeItem: (k) => { memoire.delete(k); },
    };
    for (const [k, v] of Object.entries(donnees)) if (typeof v === 'string') memoire.set(k, v);
    document.body.classList.add('consultation');
    const bandeau = $('#consultation');
    bandeau.querySelector('strong').textContent = identifiant;
    bandeau.hidden = false;
  }

  /* ---------- Démarrage ---------- */

  const zoomSauve = parseFloat(lire('boites-a-classer:zoom'));
  zoom = Number.isFinite(zoomSauve) ? borne(zoomSauve, ZOOM.min, ZOOM.max) : zoomParDefaut();

  function demarrer(recus) {
    majBoutonNiveau();
    mesCollections = lireMesCollections();
    collectionsSite = lireCollectionsSite(lire(CLE_COLLECTIONS_SITE));
    chargerCollectionsSite();
    remplirSelect();
    choisirCollection(lire('boites-a-classer:collection'));
    majBoutonCompte();
    if (!document.body.classList.contains('consultation')) rafraichirCompte();
    if (location.hash.startsWith('#collection=')) { // lien d'une matière de la page d'accueil, ou « Copier le lien »
      const lien = new URLSearchParams(location.hash.slice(1));
      const id = lien.get('collection');
      history.replaceState(null, '', location.pathname + location.search);
      if (toutes().some((c) => c.id === id)) choisirCollection(id);
      if (niveauValide(lien.get('niveau'))) choisirNiveau(lien.get('niveau'), 'choisi par le lien');
    }
    if (location.hash === '#compte') { // lien « Se connecter » de la page d'accueil
      history.replaceState(null, '', location.pathname + location.search);
      ouvrirSauvegarde();
    }
    // Toute première visite : le tutoriel pas à pas (« Comment ça marche ? » reste dans 🧰 Outils → Aide).
    if (!lire(CLE_AIDE) && !document.body.classList.contains('consultation') && !document.querySelector('dialog[open]')) lancerTuto();
    if (recus) info.textContent = `Le site a changé d'adresse : ton travail a suivi (${pluriel(recus, 'élément récupéré', 'éléments récupérés')}).`;
    synchroniser();
  }
  // Ce dont les modules à part ont besoin (calendrier de l'Avent, app/avent.js) : lire et écrire comme le logiciel (les
  // clés « boites-a-classer:… » partent avec la sauvegarde en ligne), ouvrir une collection, fêter une réussite.
  window.boitesApp = {
    lire, ecrire, choisirCollection, feter: confettis,
    collection: (id) => toutes().find((c) => c.id === id) || null,
    // Mode aventure (app/aventure.js).
    collectionCourante: () => (coll ? coll.id : null),
    reussie: (id) => !!lire('boites-a-classer:reussi:' + id),
    marquerReussie: (id) => { if (!lire('boites-a-classer:reussi:' + id)) { ecrire('boites-a-classer:reussi:' + id, new Date().toISOString()); remplirSelect(); } },
    viderPlan: () => { if (defi) arreterDefi(); etat = { boites: [], positions: {} }; sauver(); fermerBilan(); rendre(); }, // ↩ ramène l'ancien travail
    elements: (id) => elements(toutes().find((c) => c.id === id) || coll),
    message: (t) => { info.textContent = t; },
    dire: (t) => dire(t),
    calme: () => lireAcces().calme || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    avatar: () => (jetonCompte() && lire(CLE_AVATAR)) || '',
    // Même rond que la barre et la carte (photo, ou initiale sur la teinte du nom) : fête « Niveau supérieur ! ».
    rondProfil: (el, nom) => rondProfil(el, nom, lire(CLE_AVATAR), lire(CLE_AVATAR_FOND)),
    consultation: () => document.body.classList.contains('consultation'),
  };

  if (location.hash.startsWith('#transfert=')) recevoirTransfert().then(demarrer);
  else if (consultationDemandee()) ouvrirConsultation().then(() => demarrer(0));
  else demarrer(0);

  // Site arrêté par un admin (serveur/maintenance.js) : la page se recharge d'elle-même et devient « revient dans peu de
  // temps » (même chose que site/arret.js). Le travail reste dans le navigateur ; ce qui n'était pas encore envoyé
  // partira à la réouverture. L'application de bureau, elle, continue de marcher.
  // Même réponse : l'événement en cours (serveur/evenement.js), dont les effets viennent du site (site/evenement.js).
  // Le serveur garde la question jusqu'à ce que l'état change (24 s au plus, functions/api/etat.js) : tout arrive en
  // quelques secondes, sans recharger.
  if (location.protocol === 'https:' || location.port === '8788') {
    let hanterCharge = false;
    let connu = '?';
    let enCours = false;
    const suivreEvenement = (e, fini, r) => {
      if (window.hanter) { window.hanter.suivre(e, fini, r); return; }
      if (!e || hanterCharge || document.body.classList.contains('consultation')) return;
      hanterCharge = true;
      const s = document.createElement('script');
      s.src = SITE + '/evenement.js';
      s.onload = () => { if (window.hanter) window.hanter.suivre(e, fini, r); };
      document.head.appendChild(s);
    };
    // Thème du site changé par un admin (serveur/theme.js) : couleurs (data-theme, style.css) et nom du site.
    const suivreTheme = (theme, nom) => {
      if (!theme || !nom) return;
      if (theme === 'normal') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = theme;
      document.title = document.title.replace(nomSite(), nom);
      $('.titre-long').textContent = nom;
    };
    const ecouterSite = async () => {
      if (enCours || document.visibilityState !== 'visible') return;
      enCours = true;
      try {
        const rep = await fetch(RACINE_API + '/etat?v=4&attendre=' + encodeURIComponent(connu), { cache: 'no-store' });
        if (rep.status === 503) { location.reload(); return; }
        if (!rep.ok) throw new Error('serveur ' + rep.status);
        const r = await rep.json();
        connu = r.sig || '-';
        suivreTheme(r.theme, r.nomSite);
        suivreEvenement(r.evenement || null, r.fini || null, r); // boss, et à la fin de l'événement : son classement
        enCours = false;
        ecouterSite();
      } catch (e) {
        enCours = false; // hors connexion : on réessaie dans 20 s
        setTimeout(ecouterSite, 20000);
      }
    };
    ecouterSite();
    document.addEventListener('visibilitychange', ecouterSite);
  }

  // Service client (page site/aide/) : une pastille sur 👤 quand l'admin a répondu et que la réponse n'a pas été lue.
  $('#sv-lien-aide').href = SITE + '/aide/';
  $('#sv-lien-confidentialite').href = SITE + '/confidentialite/';
  async function reponsesSupport() {
    if (!enLignePossible || document.body.classList.contains('consultation')) return;
    const jeton = jetonCompte();
    // Admin : messages des visiteurs à lire (page d'administration, section 💬).
    if (jeton && lire(CLE_ADMIN) === '1') {
      try {
        const rep = await fetch(RACINE_API + '/admin/support-non-lus', { headers: { Authorization: 'Bearer ' + jeton } });
        const { nonLus } = rep.ok ? await rep.json() : { nonLus: 0 };
        boutonCompte.classList.toggle('reponse', nonLus > 0);
        $('#sv-admin-messages').hidden = !(nonLus > 0);
        $('#sv-admin-messages').textContent = `💬 ${pluriel(nonLus, 'message', 'messages')} à lire`;
        if (nonLus > 0) info.textContent = `💬 Service client : ${pluriel(nonLus, 'message', 'messages')} à lire (bouton 👤 → Administration).`;
      } catch (e) { /* hors connexion */ }
      return;
    }
    const support = lire('boites-a-classer-support:jeton'); // conversation sans compte (gardée par la page site/aide/)
    if (!jeton && !support) return;
    try {
      const rep = await fetch(RACINE_API + '/support/nouveau', { headers: jeton ? { Authorization: 'Bearer ' + jeton } : { 'X-Support-Jeton': support } });
      if (!rep.ok) return;
      const { nonLus } = await rep.json();
      boutonCompte.classList.toggle('reponse', nonLus > 0);
      $('#sv-aide-nouveau').hidden = !(nonLus > 0);
      if (nonLus > 0) info.textContent = '💬 Le service client t\'a répondu : bouton 👤 → Service client.';
    } catch (e) { /* hors connexion */ }
  }
  reponsesSupport();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reponsesSupport(); });

  // Version installable (écran d'accueil du téléphone) et utilisable hors connexion, seulement en ligne.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* pas de hors-ligne */ });
  }
})();
