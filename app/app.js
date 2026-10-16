(() => {
  'use strict';

  const VERSION = '2.0.0';
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
  const toutes = () => [...FOURNIES, ...mesCollections];
  const estPerso = (c) => mesCollections.includes(c);

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
    const fournie = FOURNIES.find((x) => x.id === c.id);
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

  // Récupère ces données sans jamais remplacer ce qui existe déjà ici. Renvoie le nombre d'éléments récupérés.
  function importerSauvegarde(donnees) {
    const PREFIXE = 'boites-a-classer:';
    const entrees = Object.entries(donnees)
      .filter(([k, v]) => typeof v === 'string' && k.startsWith(PREFIXE) && idSur(k.slice(PREFIXE.length)));
    const lireJSON = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };
    let n = 0;

    // 1. Collections personnelles qu'on n'a pas encore.
    const recues = entrees.find(([k]) => k === CLE_MES_COLLECTIONS);
    const liste = recues ? lireJSON(recues[1]) : null;
    const ajout = [];
    for (const c of Array.isArray(liste) ? liste : []) {
      try {
        const propre = nettoyerCollection(c);
        if (!toutes().some((x) => x.id === propre.id) && !ajout.some((x) => x.id === propre.id)) {
          ajout.push({ ...propre, nom: nomLibre(propre.nom) });
        }
      } catch (e) { /* collection abîmée : ignorée */ }
    }
    if (ajout.length) {
      sauverMesCollections([...mesCollections, ...ajout]);
      n += ajout.length;
    }

    // 2. Plans de travail, collection choisie et zoom.
    for (const [k, v] of entrees) {
      if (k === CLE_MES_COLLECTIONS || lire(k) !== null) continue;
      if (k === PREFIXE + 'collection' || k === PREFIXE + 'zoom') { ecrire(k, v.slice(0, 80)); continue; }
      const c = toutes().find((x) => PREFIXE + x.id === k);
      const o = lireJSON(v);
      if (!c || !o) continue;
      ecrire(k, JSON.stringify(nettoyerEtat(o, c)));
      n++;
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
      localStorage.setItem(CLE_MES_COLLECTIONS, JSON.stringify(liste));
    } catch (e) {
      throw new Error('la mémoire du navigateur est pleine ou indisponible (essayez avec moins de photos)');
    }
    mesCollections = liste;
    remplirSelect();
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

    const ligne = (c) => {
      const perso = estPerso(c);
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
      if (perso) {
        actions.appendChild(bouton('✎ Modifier', () => ouvrirEditeur(c, false)));
      } else {
        actions.appendChild(bouton('Copier pour modifier', () => {
          const copie = copieCollection(c);
          copie.id = nouvelId('perso-');
          copie.nom = nomLibre(`${c.nom} (copie)`);
          ouvrirEditeur(copie, true);
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

    listeCollections.replaceChildren(
      section('Mes collections', mesCollections, 'Aucune pour l\'instant : créez-en une, copiez une collection fournie, ou ouvrez un fichier de collection reçu.'),
      section('Collections fournies', FOURNIES, ''),
    );
  }

  function supprimerCollection(c) {
    try {
      sauverMesCollections(mesCollections.filter((x) => x !== c));
    } catch (e) {
      signaler('Impossible de supprimer : ' + e.message);
      return;
    }
    try { localStorage.removeItem('boites-a-classer:' + c.id); } catch (e) { /* stockage indisponible */ }
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
    $('#titre-editeur').textContent = estPerso(c) ? 'Modifier la collection' : 'Nouvelle collection';
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

  function enregistrerBrouillon() {
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
    ouvrirEditeur({ id: nouvelId('perso-'), nom: '', attributs: [], etres: [] }, true);
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

  /* ---------- Démarrage ---------- */

  const zoomSauve = parseFloat(lire('boites-a-classer:zoom'));
  zoom = Number.isFinite(zoomSauve) ? borne(zoomSauve, ZOOM.min, ZOOM.max) : zoomParDefaut();

  mesCollections = lireMesCollections();
  function demarrer(recus) {
    remplirSelect();
    choisirCollection(lire('boites-a-classer:collection'));
    if (recus) info.textContent = `Le site a changé d'adresse : ton travail a suivi (${pluriel(recus, 'élément récupéré', 'éléments récupérés')}).`;
  }
  if (location.hash.startsWith('#transfert=')) recevoirTransfert().then(demarrer); else demarrer(0);

  // Version installable (écran d'accueil du téléphone) et utilisable hors connexion, seulement en ligne.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* pas de hors-ligne */ });
  }
})();
