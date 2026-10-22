(() => {
  'use strict';

  const VERSION = '2.9.0';
  const FOURNIES = window.COLLECTIONS || [];
  const PALETTE = ['#2f7ed8', '#e4572e', '#29a35a', '#8e5bd0', '#e8a10c', '#d6457b',
    '#17a2b8', '#7a8b23', '#b5651d', '#5465ff', '#c0392b', '#16a085'];
  const GRIS = '#8a8f98';
  const ETRE = { l: 88, h: 76 }; // taille d'une carte sur le plan de travail (avant zoom)
  const BOITE_MIN = { l: 120, h: 80 };
  const ZOOM = { min: 0.35, max: 1.6 };
  const SEUIL = 5; // déplacement (px) avant qu'un appui devienne un glisser
  const MAX_XY = 20000; // coordonnée maximale acceptée depuis un fichier

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
  const boutonFichier = $('#fichier');
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
  const estPerso = (c) => mesCollections.includes(c);
  const estSite = (c) => collectionsSite.includes(c);
  // Seul un admin crée et modifie des collections (le serveur le vérifie aussi pour celles du site).
  const estAdmin = () => !!jetonCompte() && lire(CLE_ADMIN) === '1';

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

  const sauver = () => ecrire(cle(), JSON.stringify(etat));

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

  /* ---------- Affichage ---------- */

  // etatOuvert : plan de travail lu dans un fichier, qui remplace celui gardé dans le navigateur.
  function choisirCollection(id, etatOuvert) {
    coll = toutes().find((c) => c.id === id) || FOURNIES[0];
    selColl.value = coll.id;
    attrParId = new Map(coll.attributs.map((a, i) =>
      [a.id, { ...a, couleur: a.couleur || PALETTE[i % PALETTE.length] }]));
    etat = etatOuvert ? accorder(etatOuvert) : charger();
    if (etatOuvert) sauver();
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
    btnMenu.className = 'boite-menu ouvre-menu';
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
    return { id: idSur(c.id) || nouvelId('perso-'), nom: texteSur(c.nom, LIMITES.texte) || 'Collection sans nom', attributs, etres };
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

  const copieCollection = (c) => JSON.parse(JSON.stringify({ id: c.id, nom: c.nom, attributs: c.attributs, etres: c.etres }));
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
      if (lu.type === 'collection' && !estAdmin()) throw new Error('seul un administrateur peut ajouter une collection');
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
    const entrees = Object.entries(donnees)
      .filter(([k, v]) => typeof v === 'string' && k.startsWith(PREFIXE) && idSur(k.slice(PREFIXE.length)));
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
      const c = toutes().find((x) => PREFIXE + x.id === k);
      const o = lireJSON(v);
      if (!c || !o) continue;
      ecrire(k, JSON.stringify(nettoyerEtat(o, c)));
      n++;
    }

    // 3. Avec « ecraser » : les plans de travail absents de la version reçue disparaissent aussi d'ici.
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
      for (const c of liste) g.appendChild(new Option(c.nom, c.id));
      selColl.appendChild(g);
    };
    groupe('Collections fournies', FOURNIES);
    if (collectionsSite.length) groupe('Collections du site', collectionsSite);
    if (mesCollections.length) groupe('Mes collections', mesCollections);
    if (coll) selColl.value = coll.id;
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
      detail.textContent = `${pluriel(c.etres.length, 'être vivant', 'êtres vivants')} · ${pluriel(c.attributs.length, 'attribut', 'attributs')}`
        + (c === coll ? ' · en cours' : '');
      infos.append(titre, detail);

      const actions = document.createElement('div');
      actions.className = 'coll-actions';
      if (c !== coll) {
        actions.appendChild(bouton('Utiliser', () => { fermerFenetres(); choisirCollection(c.id); }));
      }
      if (admin && (perso || site)) {
        actions.appendChild(bouton('✎ Modifier', () => ouvrirEditeur(c, false)));
      } else if (admin) {
        actions.appendChild(bouton('Copier pour modifier', () => {
          const copie = copieCollection(c);
          copie.id = nouvelId('site-');
          copie.nom = nomLibre(`${c.nom} (copie)`);
          ouvrirEditeur(copie, true);
        }));
      }
      if (admin && perso) {
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
      if (admin && site) {
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
      : 'Choisissez la collection à classer. Seul un administrateur peut créer ou modifier des collections.';
    $('#coll-nouvelle').hidden = !admin;
    const sections = [];
    if (admin || collectionsSite.length) {
      sections.push(section('Collections du site', collectionsSite, 'Aucune pour l\'instant : créez-en une, ou copiez une collection fournie.'));
    }
    if (mesCollections.length) sections.push(section('Mes collections (dans ce navigateur)', mesCollections, ''));
    sections.push(section('Collections fournies', FOURNIES, ''));
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
    rendreAttributs();
    rendreTableau();
    verifierBrouillon();
    fenEditeur.showModal();
    if (nouvelle && !brouillon.nom) edNom.focus();
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

  function ajouterAttribut() {
    // Une couleur fixe, la première libre : supprimer un attribut ne change pas la couleur des autres.
    const prises = new Set(brouillon.attributs.map(couleurBrouillon));
    const a = attributVide();
    a.couleur = PALETTE.find((c) => !prises.has(c)) || PALETTE[brouillon.attributs.length % PALETTE.length];
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
    const c = { id: brouillon.id, nom: brouillon.nom.trim(), attributs, etres };
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
  $('#ed-ajout-attr').addEventListener('click', ajouterAttribut);
  $('#ed-ajout-etre').addEventListener('click', ajouterEtre);
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
    remplir(menu);
    (ancre.closest('dialog') || document.body).appendChild(menu);

    const r = ancre.getBoundingClientRect();
    const larg = menu.offsetWidth;
    const haut = menu.offsetHeight;
    menu.style.left = borne(r.right - larg, 8, window.innerWidth - larg - 8) + 'px';
    const dessous = r.bottom + 4;
    menu.style.top = (dessous + haut > window.innerHeight - 8 ? Math.max(8, r.top - haut - 4) : dessous) + 'px';
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
    btn.appendChild(document.createTextNode(texte));
    btn.addEventListener('click', () => { fermerMenu(); action(); });
    return btn;
  }

  function ouvrirMenu(ancre, b) {
    afficherMenu(ancre, 'boite-' + b.id, (m) => {
      for (const a of attrParId.values()) {
        m.appendChild(entreeMenu(a.nom, () => {
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
      );
      if (!petitEcran.matches) m.appendChild(entreeMenu('🖨 Imprimer', () => window.print()));
    });
  }

  function fermerMenu() {
    if (menu) { menu.remove(); menu = null; }
  }

  document.addEventListener('pointerdown', (ev) => {
    if (menu && !ev.target.closest('.menu, .ouvre-menu')) fermerMenu();
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
  $('#verifier').addEventListener('click', verifier);
  $('#ranger').addEventListener('click', () => { etat.positions = {}; sauver(); fermerBilan(); rendre(); });
  boutonEffacer.addEventListener('click', effacer);
  boutonFichier.addEventListener('click', ouvrirMenuFichier);
  $('#gerer').addEventListener('click', ouvrirCollections);
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
  const CLES_COMPTE = [CLE_JETON, CLE_IDENTIFIANT, CLE_ADMIN, CLE_ENSEIGNANT, CLE_ELEVE];
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
  function sessionExpiree() {
    if (lire(CLE_ELEVE)) oublier(CLE_IDENTIFIANT); // un prénom, pas un identifiant à proposer
    for (const k of [CLE_JETON, CLE_ADMIN, CLE_ENSEIGNANT, CLE_ELEVE]) oublier(k);
    oublier(CLE_VERSION);
    oublier(CLE_DATE);
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
    const nom = jetonCompte() && lire(CLE_IDENTIFIANT);
    $('#compte-nom').textContent = ' ' + (nom || 'Se connecter');
    boutonCompte.title = nom ? `Compte ${nom} : sauvegarde en ligne` : 'Se connecter pour sauvegarder son travail en ligne';
    boutonCompte.classList.toggle('connecte', !!nom);
  }

  // Commence à sauvegarder sur ce compte (après une connexion ou une création de compte).
  // etat : ce que le serveur dit du compte (functions/api/compte/[action].js) : admin, enseignant, eleve.
  function ouvrirSession(identifiant, jeton, etat) {
    clearTimeout(minuterieEnvoi);
    for (const k of [CLE_CODE, CLE_VERSION, CLE_DATE]) oublier(k); // un code éventuel reste valable sur le serveur
    ecrire(CLE_JETON, jeton);
    ecrire(CLE_IDENTIFIANT, identifiant);
    retenirDroits(etat);
    etatEnLigne = { texte: '', erreur: false };
    majBoutonCompte();
  }

  function retenirDroits(etat) {
    if (etat && etat.admin) ecrire(CLE_ADMIN, '1'); else oublier(CLE_ADMIN);
    if (etat && etat.enseignant) ecrire(CLE_ENSEIGNANT, '1'); else oublier(CLE_ENSEIGNANT);
    if (etat && etat.eleve) ecrire(CLE_ELEVE, JSON.stringify(etat.eleve)); else oublier(CLE_ELEVE);
  }

  // Relit l'état du compte au démarrage : un rôle donné ou retiré entre-temps, un prénom changé par l'enseignant.
  async function rafraichirCompte() {
    const jeton = jetonCompte();
    if (!jeton || !enLignePossible) return;
    try {
      const { statut, r } = await appelCompte('session', undefined, jeton);
      if (statut === 401 && jetonCompte() === jeton) { sessionExpiree(); return; }
      if (statut !== 200 || jetonCompte() !== jeton) return;
      if (r.identifiant) ecrire(CLE_IDENTIFIANT, r.identifiant);
      retenirDroits(r);
      majBoutonCompte();
      if (fenSauvegarde.open) rendreSauvegarde();
    } catch (e) { /* hors connexion */ }
  }

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
      const rep = await fetch(RACINE_API + '/collections');
      if (rep.ok) appliquerCollectionsSite(lireCollectionsSite(await rep.text()));
    } catch (e) { /* hors connexion : on garde la copie de l'appareil */ }
  }

  async function appelAdmin(action, corps) {
    const rep = await fetch(RACINE_API + '/admin/' + action, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + jetonCompte(), 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
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
    await appelAdmin('collection', { collection: propre });
    const existe = collectionsSite.some((x) => x.id === propre.id);
    appliquerCollectionsSite(existe ? collectionsSite.map((x) => (x.id === propre.id ? propre : x)) : [...collectionsSite, propre]);
  }

  async function retirerCollection(c) {
    await appelAdmin('collection-suppression', { id: c.id });
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
    if (compte) $('#sv-identifiant-affiche').textContent = lire(CLE_IDENTIFIANT) || '';
    $('#sv-admin').hidden = !compte || !lire(CLE_ADMIN);
    const eleve = compte && eleveConnecte();
    $('#sv-enseignant').hidden = !compte || !lire(CLE_ENSEIGNANT);
    $('#sv-classe-eleve').hidden = !eleve;
    if (eleve) {
      $('#sv-classe-nom').textContent = eleve.classe || '';
      $('#sv-classe-enseignant').textContent = eleve.enseignant || '';
    }
    $('#sv-details-mdp').hidden = $('#sv-details-suppression').hidden = !!eleve; // un élève n'a pas de mot de passe
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
    appelCompte('deconnexion', {}, jeton).catch(() => { /* la session expirera d'elle-même */ });
    if (effacer) appliquerVersion({});
    etatEnLigne = { texte: '', erreur: false };
    $('#sv-identifiant').value = '';
    $('#sv-effacer').checked = false;
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
    mesCollections = lireMesCollections();
    collectionsSite = lireCollectionsSite(lire(CLE_COLLECTIONS_SITE));
    chargerCollectionsSite();
    remplirSelect();
    choisirCollection(lire('boites-a-classer:collection'));
    majBoutonCompte();
    if (!document.body.classList.contains('consultation')) rafraichirCompte();
    if (location.hash === '#compte') { // lien « Se connecter » de la page d'accueil
      history.replaceState(null, '', location.pathname + location.search);
      ouvrirSauvegarde();
    }
    if (recus) info.textContent = `Le site a changé d'adresse : ton travail a suivi (${pluriel(recus, 'élément récupéré', 'éléments récupérés')}).`;
    synchroniser();
  }
  if (location.hash.startsWith('#transfert=')) recevoirTransfert().then(demarrer);
  else if (consultationDemandee()) ouvrirConsultation().then(() => demarrer(0));
  else demarrer(0);

  // Version installable (écran d'accueil du téléphone) et utilisable hors connexion, seulement en ligne.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* pas de hors-ligne */ });
  }
})();
