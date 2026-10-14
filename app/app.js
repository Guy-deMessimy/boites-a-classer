(() => {
  'use strict';

  const COLLECTIONS = window.COLLECTIONS || [];
  const PALETTE = ['#2f7ed8', '#e4572e', '#29a35a', '#8e5bd0', '#e8a10c', '#d6457b',
    '#17a2b8', '#7a8b23', '#b5651d', '#5465ff', '#c0392b', '#16a085'];
  const GRIS = '#8a8f98';
  const ETRE = { l: 88, h: 76 }; // taille d'une carte sur le plan de travail (avant zoom)
  const BOITE_MIN = { l: 120, h: 80 };
  const ZOOM = { min: 0.35, max: 1.6 };
  const SEUIL = 5; // déplacement (px) avant qu'un appui devienne un glisser

  const $ = (s) => document.querySelector(s);
  const espace = $('#espace');
  const toile = $('#toile');
  const calque = $('#calque');
  const plateau = $('#plateau');
  const selColl = $('#collection');
  const info = $('#info');
  const bilan = $('#bilan');
  const bilanListe = $('#bilan-liste');
  const boutonEffacer = $('#effacer');
  const niveauZoom = $('#zoom-niveau');
  const infoDefaut = info.textContent;
  const petitEcran = window.matchMedia('(max-width: 700px)');
  const tactile = window.matchMedia('(pointer: coarse)');

  let coll = null;
  let etat = null; // { boites: [{ id, x, y, w, h, attr, texte }], positions: { idEtre: { x, y } } }
  let attrParId = new Map();
  let elBoites = new Map();
  let elEtres = new Map();
  let menu = null;
  let zoom = 1;

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
  const borner = (p) => ({ x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)) });

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

  function lire(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function ecrire(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ }
  }

  const sauver = () => ecrire(cle(), JSON.stringify(etat));

  function charger() {
    try {
      const o = JSON.parse(lire(cle()));
      if (o && Array.isArray(o.boites) && o.positions && typeof o.positions === 'object') {
        const ids = new Set(coll.etres.map((e) => e.id));
        for (const id of Object.keys(o.positions)) if (!ids.has(id)) delete o.positions[id];
        return o;
      }
    } catch (e) { /* rien de sauvegardé */ }
    return { boites: [], positions: {} };
  }

  /* ---------- Affichage ---------- */

  function choisirCollection(id) {
    coll = COLLECTIONS.find((c) => c.id === id) || COLLECTIONS[0];
    selColl.value = coll.id;
    attrParId = new Map(coll.attributs.map((a, i) =>
      [a.id, { ...a, couleur: a.couleur || PALETTE[i % PALETTE.length] }]));
    etat = charger();
    ecrire('boites-a-classer:collection', coll.id);
    fermerBilan();
    rendre();
  }

  function rendre() {
    fermerMenu();
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

    const titre = document.createElement('input');
    titre.className = 'boite-titre';
    titre.placeholder = 'Attribut…';
    titre.value = b.texte || '';
    titre.addEventListener('input', () => {
      b.texte = titre.value;
      const a = trouverAttr(titre.value);
      b.attr = a ? a.id : null;
      colorer(el, b);
      oublierVerification();
    });
    titre.addEventListener('change', sauver);
    titre.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') titre.blur(); });

    const btnMenu = document.createElement('button');
    btnMenu.className = 'boite-menu';
    btnMenu.textContent = '▾';
    btnMenu.title = 'Choisir un attribut';
    btnMenu.addEventListener('click', (ev) => { ev.stopPropagation(); ouvrirMenu(btnMenu, b); });

    const btnSuppr = document.createElement('button');
    btnSuppr.className = 'boite-suppr';
    btnSuppr.textContent = '×';
    btnSuppr.title = 'Supprimer la boîte';
    btnSuppr.addEventListener('click', () => {
      etat.boites = etat.boites.filter((x) => x !== b);
      sauver();
      oublierVerification();
      rendre();
    });

    tete.append(poignee, titre, btnMenu, btnSuppr);

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

    el.append(tete, coin);
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
    el.addEventListener('pointerenter', () => montrerInfo(e));
    el.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType === 'mouse') info.textContent = infoDefaut;
    });
    el.addEventListener('pointerdown', (ev) => glisserEtre(ev, el, e));
    return el;
  }

  function montrerInfo(e) {
    info.textContent = `${e.emoji || ''} ${e.nom} : ${e.attributs.map(nomAttr).join(', ')}`.trim();
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

  /* ---------- Menu des attributs ---------- */

  function ouvrirMenu(ancre, b) {
    const dejaOuvert = menu && menu.dataset.boite === b.id;
    fermerMenu();
    if (dejaOuvert) return;

    menu = document.createElement('div');
    menu.className = 'menu-attr';
    menu.dataset.boite = b.id;
    for (const a of attrParId.values()) {
      const btn = document.createElement('button');
      const pastille = document.createElement('span');
      pastille.className = 'pastille';
      pastille.style.setProperty('--c', a.couleur);
      btn.append(pastille, document.createTextNode(a.nom));
      btn.addEventListener('click', () => {
        b.attr = a.id;
        b.texte = a.nom;
        sauver();
        oublierVerification();
        rendre();
      });
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);

    const r = ancre.getBoundingClientRect();
    const larg = menu.offsetWidth;
    const haut = menu.offsetHeight;
    menu.style.left = borne(r.right - larg, 8, window.innerWidth - larg - 8) + 'px';
    const dessous = r.bottom + 4;
    menu.style.top = (dessous + haut > window.innerHeight - 8 ? Math.max(8, r.top - haut - 4) : dessous) + 'px';
  }

  function fermerMenu() {
    if (menu) { menu.remove(); menu = null; }
  }

  document.addEventListener('pointerdown', (ev) => {
    if (menu && !ev.target.closest('.menu-attr, .boite-menu')) fermerMenu();
  });

  /* ---------- Vérification ---------- */

  function oublierVerification() {
    for (const el of elEtres.values()) el.classList.remove('ok', 'faux');
  }

  function fermerBilan() {
    bilan.hidden = true;
    oublierVerification();
  }

  function verifier() {
    fermerMenu();
    oublierVerification();
    const lignes = [];
    const fautifs = new Set();
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
          lignes.push(['erreur', `${e.nom} n'a pas l'attribut « ${nom} » : il ne doit pas être dans cette boîte.`]);
        } else if (!dans(b, e) && possede && centres.has(e.id)) {
          fautifs.add(e.id);
          lignes.push(['manque', `${e.nom} possède l'attribut « ${nom} » : il doit être dans cette boîte.`]);
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
        lignes.push(['manque', `${e.nom} n'est dans aucune boîte.`]);
      }
    }

    const restants = coll.etres.length - places.length;
    if (restants > 0) {
      lignes.push(['info', restants === 1
        ? 'Il reste 1 être vivant à placer.'
        : `Il reste ${restants} êtres vivants à placer.`]);
    }

    const erreurs = lignes.some(([t]) => t === 'erreur' || t === 'manque');
    if (!erreurs && etat.boites.length > 0) {
      lignes.unshift(['bravo', restants > 0
        ? 'Bien joué : tout ce qui est placé est correct.'
        : 'Bravo ! Ta classification est correcte.']);
    }

    for (const e of places) elEtres.get(e.id).classList.add(fautifs.has(e.id) ? 'faux' : 'ok');

    bilanListe.replaceChildren(...lignes.map(([type, texte]) => {
      const li = document.createElement('li');
      li.className = type;
      li.textContent = texte;
      return li;
    }));
    bilan.hidden = false;
  }

  /* ---------- Boutons ---------- */

  function nouvelleBoite() {
    const n = etat.boites.length;
    const visibleL = espace.clientWidth / zoom;
    const visibleH = espace.clientHeight / zoom;
    const b = {
      id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
  $('#verifier').addEventListener('click', verifier);
  $('#ranger').addEventListener('click', () => { etat.positions = {}; sauver(); fermerBilan(); rendre(); });
  boutonEffacer.addEventListener('click', effacer);
  $('#imprimer').addEventListener('click', () => window.print());
  $('#fermer-bilan').addEventListener('click', fermerBilan);
  selColl.addEventListener('change', () => choisirCollection(selColl.value));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { fermerMenu(); fermerBilan(); }
  });
  window.addEventListener('resize', ajusterToile);

  /* ---------- Démarrage ---------- */

  const zoomSauve = parseFloat(lire('boites-a-classer:zoom'));
  zoom = Number.isFinite(zoomSauve) ? borne(zoomSauve, ZOOM.min, ZOOM.max) : zoomParDefaut();

  for (const c of COLLECTIONS) selColl.add(new Option(c.nom, c.id));
  choisirCollection(lire('boites-a-classer:collection'));

  // Version installable (écran d'accueil du téléphone) et utilisable hors connexion, seulement en ligne.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* pas de hors-ligne */ });
  }
})();
