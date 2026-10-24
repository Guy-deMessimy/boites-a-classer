// L'Aventure des boîtes (4.1) : une carte du monde avec une île par matière ; chaque île est un chemin de niveaux (les
// collections fournies de sa matière, de la plus simple à la plus dure), débloqués l'un après l'autre. Un niveau se
// joue sur le plan de travail habituel, à partir d'un plan vide (↩ ramène l'ancien travail) ; réussi, il donne de 1 à
// 3 étoiles (★★★ sans erreur ni indice et dans le temps, ★★ avec au plus deux erreurs ou indices). Les étoiles
// débloquent les îles suivantes ; une île dont tous les niveaux sont réussis est « conquise ».
// - progression : clé « boites-a-classer:jeu:aventure » (synchronisée, vérifiée à l'import par aventurePropre dans
//   app.js) : { v: 1, niveaux: { id: { e: 1..3, t: meilleur temps en ms, d: date } }, regions: { matière: date } } ;
// - partie en cours : sessionStorage « boites-a-classer-aventure:partie » (survit à un rechargement de l'onglet) ;
// - événements reçus d'app.js : boites:verification, boites:indice, boites:reussite, boites:collection ; émis :
//   boites:aventure-etoiles { collection, region, etoiles, meilleur, gagnees, total } ;
// - sons synthétisés (Web Audio, aucun fichier), coupables (clé de l'appareil « boites-a-classer-aventure:son ») ;
//   « Moins d'animations » et prefers-reduced-motion coupent les animations (aventure.css et app.calme()).
(function () {
  'use strict';
  const app = window.boitesApp;
  if (!app || !window.COLLECTIONS) return;
  const $ = (s, dans = document) => dans.querySelector(s);
  const SVG = 'http://www.w3.org/2000/svg';
  const CLE = 'boites-a-classer:jeu:aventure';
  const CLE_SON = 'boites-a-classer-aventure:son';
  const CLE_VU = 'boites-a-classer-aventure:vu';
  const CLE_PARTIE = 'boites-a-classer-aventure:partie';

  const local = {
    lire: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    ecrire: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
  };
  const session = {
    lire: () => { try { return JSON.parse(sessionStorage.getItem(CLE_PARTIE)); } catch (e) { return null; } },
    ecrire: (p) => { try { if (p) sessionStorage.setItem(CLE_PARTIE, JSON.stringify(p)); else sessionStorage.removeItem(CLE_PARTIE); } catch (e) { /* rien */ } },
  };

  /* ---------- Le monde ---------- */

  // Une île par matière (window.MATIERES) ; « seuil » : étoiles qu'il faut avoir en tout pour y aborder.
  const REGIONS = [
    { matiere: 'sciences', nom: 'Archipel des Savants', ico: '🔬', deco: ['🌴', '🍄', '🐞', '🌿', '🦋'], terre: '#79c267', fonce: '#2f7d32', seuil: 0 },
    { matiere: 'francais', nom: 'Île des Mots', ico: '📜', deco: ['🌴', '📚', '✒️', '🔤', '📖'], terre: '#b39be6', fonce: '#6a3fb5', seuil: 2 },
    { matiere: 'maths', nom: 'Montagnes des Nombres', ico: '🔺', deco: ['⛰️', '📐', '🔢', '🧮', '🌲'], terre: '#86b7ec', fonce: '#2f63b3', seuil: 5 },
    { matiere: 'histoire', nom: 'Île du Temps', ico: '🏰', deco: ['🏺', '⚔️', '🗿', '🌴', '⏳'], terre: '#e6b874', fonce: '#9a6114', seuil: 8 },
    { matiere: 'geographie', nom: 'Terre des Explorateurs', ico: '🧭', deco: ['🗺️', '🏔️', '🌋', '🌴', '⛺'], terre: '#66cbc4', fonce: '#16807a', seuil: 12 },
    { matiere: 'anglais', nom: 'Royaume d\'Outre-Manche', ico: '💂', deco: ['☕', '🎡', '🏰', '🌳', '☂️'], terre: '#f19a90', fonce: '#b23a30', seuil: 16 },
    { matiere: 'musique', nom: 'Île des Mélodies', ico: '🎵', deco: ['🎹', '🎻', '🥁', '🎺', '🌴'], terre: '#f3a6cf', fonce: '#b8457f', seuil: 20 },
  ].filter((r) => !window.MATIERES || window.MATIERES.some(([m]) => m === r.matiere));

  // Les niveaux d'une île : collections fournies de sa matière, de la plus simple à la plus dure (éléments + attributs),
  // l'ordre du fichier départageant les égalités.
  function niveauxDe(r) {
    return window.COLLECTIONS.map((c, i) => ({ c, i }))
      .filter(({ c }) => (c.matiere || 'sciences') === r.matiere)
      .sort((a, b) => (a.c.etres.length + a.c.attributs.length) - (b.c.etres.length + b.c.attributs.length) || a.i - b.i)
      .map(({ c }) => c);
  }
  const regionDe = (id) => REGIONS.find((r) => niveauxDe(r).some((c) => c.id === id)) || null;
  // Temps des trois étoiles : 15 s par carte, une minute au moins.
  const limite = (c) => Math.max(60, 15 * c.etres.length) * 1000;

  /* ---------- Progression ---------- */

  function lireProgres() {
    let o = null;
    try { o = JSON.parse(app.lire(CLE)); } catch (e) { o = null; }
    const p = { v: 1, niveaux: {}, regions: {} };
    if (o && o.niveaux && typeof o.niveaux === 'object') for (const [id, n] of Object.entries(o.niveaux)) if (n && [1, 2, 3].includes(n.e)) p.niveaux[id] = n;
    if (o && o.regions && typeof o.regions === 'object') p.regions = { ...o.regions };
    return p;
  }
  const etoiles = (p, id) => (p.niveaux[id] ? p.niveaux[id].e : 0);
  const total = (p) => Object.entries(p.niveaux).reduce((t, [id, n]) => t + (window.COLLECTIONS.some((c) => c.id === id) ? n.e : 0), 0);
  const totalPossible = () => REGIONS.reduce((t, r) => t + 3 * niveauxDe(r).length, 0);
  const ouverte = (p, r) => total(p) >= r.seuil;
  const niveauOuvert = (p, r, i) => ouverte(p, r) && (i === 0 || etoiles(p, niveauxDe(r)[i - 1].id) > 0);
  const conquise = (p, r) => niveauxDe(r).length > 0 && niveauxDe(r).every((c) => etoiles(p, c.id) > 0);
  const etoilesRegion = (p, r) => niveauxDe(r).reduce((t, c) => t + etoiles(p, c.id), 0);

  /* ---------- Sons (Web Audio, synthétisés) ---------- */

  let audio = null;
  const sonActif = () => local.lire(CLE_SON) !== '0';
  function note(freq, debut, duree, type = 'triangle', volume = 0.16) {
    if (!sonActif()) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime + debut;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + duree + 0.05);
    } catch (e) { /* pas de son ici */ }
  }
  function souffle(debut, duree, volume = 0.08) { // bruit filtré : vague, tambour
    if (!sonActif()) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + debut;
      const n = Math.floor(audio.sampleRate * duree);
      const tampon = audio.createBuffer(1, n, audio.sampleRate);
      const d = tampon.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = audio.createBufferSource();
      s.buffer = tampon;
      const f = audio.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(1800, t);
      f.frequency.exponentialRampToValueAtTime(300, t + duree);
      const g = audio.createGain();
      g.gain.value = volume;
      s.connect(f).connect(g).connect(audio.destination);
      s.start(t);
    } catch (e) { /* pas de son ici */ }
  }
  const SONS = {
    clic: () => note(740, 0, 0.07, 'sine', 0.1),
    ile: () => { souffle(0, 0.5, 0.06); [523, 659, 784].forEach((f, i) => note(f, 0.05 + i * 0.07, 0.18, 'sine', 0.1)); },
    verrou: () => { note(220, 0, 0.12, 'square', 0.05); note(196, 0.1, 0.16, 'square', 0.05); },
    etoile: (n) => { const f = [784, 988, 1319][n] || 784; note(f, 0, 0.35, 'triangle', 0.2); note(f * 2, 0.02, 0.2, 'sine', 0.06); },
    depart: () => [392, 523, 659, 784].forEach((f, i) => note(f, i * 0.06, 0.14, 'triangle', 0.12)),
    victoire: () => {
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.24, 'triangle', 0.17));
      [523, 659, 784].forEach((f) => note(f, 0.55, 0.7, 'triangle', 0.08));
    },
    conquete: () => {
      const air = [[392, 0], [392, 0.14], [392, 0.28], [523, 0.42], [659, 0.7], [784, 0.98], [659, 1.12], [784, 1.3], [1047, 1.5]];
      air.forEach(([f, t]) => note(f, t, 0.3, 'triangle', 0.17));
      [523, 659, 784, 1047].forEach((f) => note(f, 1.5, 1.4, 'sine', 0.07));
      [0, 0.42, 0.98, 1.5].forEach((t) => souffle(t, 0.18, 0.09));
    },
    debloque: () => { souffle(0, 0.6, 0.05); [659, 880, 1175].forEach((f, i) => note(f, 0.15 + i * 0.09, 0.3, 'sine', 0.12)); },
  };

  /* ---------- Fenêtre de l'aventure ---------- */

  const fen = document.createElement('dialog');
  fen.className = 'av';
  fen.setAttribute('aria-label', 'L\'Aventure des boîtes');
  fen.innerHTML = `
    <header class="av-tete">
      <button type="button" class="av-btn av-retour" hidden aria-label="Carte du monde">←<span class="av-long"> Carte du monde</span></button>
      <h2 class="av-titre">🗺️ L'Aventure des boîtes</h2>
      <span class="av-total" title="Étoiles gagnées"></span>
      <button type="button" class="av-btn av-son" aria-pressed="true"></button>
      <button type="button" class="av-btn av-fermer" aria-label="Fermer l'aventure">✕</button>
    </header>
    <div class="av-scene"></div>
    <div class="av-bulle" role="status" aria-live="polite"></div>
    <section class="av-panneau av-fiche" hidden></section>
    <section class="av-panneau av-victoire" hidden aria-live="polite"></section>
    <div class="av-feu" aria-hidden="true"></div>`;
  document.body.appendChild(fen);
  const scene = $('.av-scene', fen);
  let vue = { type: 'monde', region: null };

  const el = (balise, classe, texte) => { const n = document.createElement(balise); if (classe) n.className = classe; if (texte !== undefined) n.textContent = texte; return n; };
  const sv = (nom, attrs = {}, texte) => {
    const n = document.createElementNS(SVG, nom);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (texte !== undefined) n.textContent = texte;
    return n;
  };
  const portrait = () => window.innerWidth < window.innerHeight * 0.95;
  const duree = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
  const pluriel = (n, un, des) => `${n} ${n > 1 ? des : un}`;

  // Contour d'île : une forme ronde irrégulière (toujours la même pour une île), en courbes de Bézier.
  function contour(cx, cy, rx, ry, graine, bosses = 11) {
    let s = graine * 9301 + 49297;
    const hasard = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const pts = [];
    for (let i = 0; i < bosses; i++) {
      const a = (i / bosses) * Math.PI * 2;
      const k = 0.82 + hasard() * 0.3;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }

  // Fond commun : océan en dégradé, vagues qui glissent, nuages qui passent.
  function ocean(svg, L, H) {
    const defs = sv('defs');
    defs.innerHTML = `
      <radialGradient id="av-mer" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#4aa3e8"/><stop offset=".55" stop-color="#1f6fb2"/><stop offset="1" stop-color="#0b3d6b"/></radialGradient>
      <pattern id="av-vagues" width="90" height="46" patternUnits="userSpaceOnUse"><path d="M6 23q11-9 22 0t22 0" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2.5" stroke-linecap="round"/><path d="M52 6q8-6 16 0t16 0" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2" stroke-linecap="round"/></pattern>
      <radialGradient id="av-or" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#f5b301"/><stop offset="1" stop-color="#c47f00"/></radialGradient>
      <filter id="av-ombre" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#06223d" flood-opacity=".45"/></filter>`;
    svg.appendChild(defs);
    svg.appendChild(sv('rect', { x: 0, y: 0, width: L, height: H, fill: 'url(#av-mer)' }));
    const vagues = sv('g', { class: 'av-vagues' });
    vagues.appendChild(sv('rect', { x: -90, y: -46, width: L + 180, height: H + 92, fill: 'url(#av-vagues)' }));
    svg.appendChild(vagues);
    const nuages = sv('g', { class: 'av-nuages', 'aria-hidden': 'true' });
    [[0.12, 0.1, 1], [0.62, 0.06, 0.8], [0.4, 0.86, 0.9]].forEach(([x, y, k], i) => {
      const n = sv('g', { class: 'av-nuage', style: `--d:${38 + i * 9}s;--r:${-i * 11}s`, transform: `translate(${x * L} ${y * H}) scale(${k})` });
      n.innerHTML = '<ellipse cx="0" cy="0" rx="46" ry="18" fill="#fff" opacity=".85"/><ellipse cx="-26" cy="4" rx="26" ry="14" fill="#fff" opacity=".85"/><ellipse cx="28" cy="5" rx="30" ry="13" fill="#fff" opacity=".85"/>';
      nuages.appendChild(n);
    });
    return nuages;
  }

  // Rose des vents, dans un coin.
  function rose(svg, x, y) {
    const g = sv('g', { transform: `translate(${x} ${y})`, class: 'av-rose', 'aria-hidden': 'true' });
    g.innerHTML = '<circle r="34" fill="#0b3d6b" opacity=".35"/><polygon points="0,-30 6,-6 30,0 6,6 0,30 -6,6 -30,0 -6,-6" fill="#f4e1b5" stroke="#9a6114" stroke-width="1.5"/>'
      + '<polygon points="0,-30 6,-6 0,0 -6,-6" fill="#e34948"/><text y="-36" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">N</text>';
    svg.appendChild(g);
  }

  function emoji(g, x, y, taille, texte, classe) {
    g.appendChild(sv('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': taille, class: classe || '' }, texte));
  }

  // Un bouton dans le SVG (île, niveau) : souris, doigt et clavier.
  function bouton(g, etiquette, action) {
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', etiquette);
    g.addEventListener('click', action);
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); action(); } });
  }

  /* La carte du monde. */

  function placesMonde(n, L, H) {
    // Zigzag de gauche à droite (paysage) ou de bas en haut (portrait).
    return Array.from({ length: n }, (_, i) => (portrait()
      ? { x: i % 2 ? L * 0.7 : L * 0.3, y: H - 110 - i * ((H - 220) / Math.max(1, n - 1)) }
      : { x: 110 + i * ((L - 220) / Math.max(1, n - 1)), y: i % 2 ? H * 0.34 : H * 0.66 }));
  }

  function dessinerMonde(animer) {
    vue = { type: 'monde', region: null };
    const p = lireProgres();
    const [L, H] = portrait() ? [600, 1000] : [1000, 620];
    const svg = sv('svg', { viewBox: `0 0 ${L} ${H}`, class: 'av-carte' + (animer ? ' av-entree' : ''), preserveAspectRatio: 'xMidYMid meet' });
    const nuages = ocean(svg, L, H);
    const places = placesMonde(REGIONS.length, L, H);
    const R = portrait() ? 78 : 74;
    // Routes maritimes : brillantes jusqu'aux îles ouvertes, pâles ensuite.
    for (let i = 1; i < places.length; i++) {
      const a = places[i - 1], b = places[i];
      const mx = (a.x + b.x) / 2 + (portrait() ? (i % 2 ? 60 : -60) : 0), my = (a.y + b.y) / 2 + (portrait() ? 0 : (i % 2 ? -50 : 50));
      svg.appendChild(sv('path', { d: `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`, class: 'av-route' + (ouverte(p, REGIONS[i]) ? ' ouverte' : ''), fill: 'none' }));
    }
    REGIONS.forEach((r, i) => {
      const { x, y } = places[i];
      const ouv = ouverte(p, r);
      const niv = niveauxDe(r);
      const g = sv('g', { class: 'av-ile' + (ouv ? '' : ' fermee') + (conquise(p, r) ? ' conquise' : ''), style: `--i:${i}` });
      const ile = sv('g', { class: 'av-ile-forme' });
      ile.appendChild(sv('path', { d: contour(x, y, R * 1.32, R * 1.18, i + 3), fill: '#9ee0f5', opacity: '.35' }));
      ile.appendChild(sv('path', { d: contour(x, y, R * 1.08, R * 0.98, i + 7), fill: '#f4e1b5', filter: 'url(#av-ombre)' }));
      ile.appendChild(sv('path', { d: contour(x, y - 4, R * 0.9, R * 0.78, i + 11), fill: r.terre }));
      ile.appendChild(sv('path', { d: contour(x - R * 0.15, y - R * 0.18, R * 0.45, R * 0.36, i + 17), fill: r.fonce, opacity: '.35' }));
      g.appendChild(ile);
      emoji(g, x, y - 10, 46, r.ico, 'av-repere');
      // Bannière : nom, étoiles.
      const nom = sv('g', { class: 'av-banniere' });
      const larg = Math.min(200, 26 + r.nom.length * 8.2);
      nom.appendChild(sv('rect', { x: x - larg / 2, y: y + R * 0.62, width: larg, height: 40, rx: 12, fill: '#fffdf6', stroke: r.fonce, 'stroke-width': 2 }));
      nom.appendChild(sv('text', { x, y: y + R * 0.62 + 16, 'text-anchor': 'middle', 'font-size': 13.5, 'font-weight': 700, fill: '#2b2112' }, r.nom));
      nom.appendChild(sv('text', { x, y: y + R * 0.62 + 32, 'text-anchor': 'middle', 'font-size': 11.5, fill: '#6b5a3a' },
        ouv ? `⭐ ${etoilesRegion(p, r)} / ${3 * niv.length}${conquise(p, r) ? ' · 🏆' : ''}` : `🔒 ${r.seuil} ⭐ pour aborder`));
      g.appendChild(nom);
      if (!ouv) {
        g.appendChild(sv('circle', { cx: x, cy: y - 8, r: R * 0.62, fill: '#0b2440', opacity: '.45' }));
        emoji(g, x, y - 10, 34, '🔒');
      } else if (conquise(p, r)) emoji(g, x + R * 0.72, y - R * 0.62, 30, '🏆', 'av-trophee');
      bouton(g, `${r.nom} (${r.ico}) : ${ouv ? `${etoilesRegion(p, r)} étoiles sur ${3 * niv.length}, ${pluriel(niv.length, 'niveau', 'niveaux')}` : `fermée, il faut ${r.seuil} étoiles`}`, () => {
        if (!ouv) {
          SONS.verrou();
          g.classList.remove('secoue'); void g.getBBox(); g.classList.add('secoue');
          bulle(`🔒 ${r.nom} : encore ${pluriel(r.seuil - total(p), 'étoile', 'étoiles')} à gagner pour y aborder.`);
          return;
        }
        SONS.ile();
        allerVers(svg, x, y, () => dessinerIle(r, true));
      });
      svg.appendChild(g);
    });
    svg.appendChild(nuages); // les nuages passent au-dessus des îles
    rose(svg, portrait() ? L - 60 : 56, portrait() ? 60 : H - 56);
    scene.replaceChildren(svg);
    majTete();
  }

  // Zoom vers un point de la carte, puis la vue suivante (sans animation si l'élève en demande moins).
  function allerVers(svg, x, y, ensuite) {
    if (app.calme()) { ensuite(); return; }
    const [L, H] = svg.getAttribute('viewBox').split(' ').slice(2).map(Number);
    svg.style.transformOrigin = `${(x / L) * 100}% ${(y / H) * 100}%`;
    svg.classList.add('av-plonge');
    setTimeout(ensuite, 420);
  }

  /* Une île : le chemin de ses niveaux. */

  function placesIle(n, L, H) {
    // Serpentin : rangées de 5 (paysage) ou de 3 (portrait), de bas en haut, un sens sur deux.
    const parRangee = portrait() ? 3 : 5;
    const rangees = Math.ceil(n / parRangee);
    const [x0, x1] = portrait() ? [130, L - 130] : [210, L - 210];
    const [y0, y1] = portrait() ? [H - 190, 220] : [H - 150, 175];
    return Array.from({ length: n }, (_, i) => {
      const r = Math.floor(i / parRangee), k = i % parRangee;
      const dansRangee = Math.min(parRangee, n - r * parRangee);
      const t = dansRangee === 1 ? 0.5 : k / (parRangee - 1);
      const x = x0 + (r % 2 ? 1 - t : t) * (x1 - x0);
      const y = rangees === 1 ? (y0 + y1) / 2 : y0 + (r / (rangees - 1)) * (y1 - y0);
      return { x, y: y + (k % 2 ? -18 : 18) };
    });
  }

  function dessinerIle(r, animer) {
    vue = { type: 'ile', region: r.matiere };
    const p = lireProgres();
    const niv = niveauxDe(r);
    const [L, H] = portrait() ? [600, 1000] : [1000, 620];
    const svg = sv('svg', { viewBox: `0 0 ${L} ${H}`, class: 'av-carte av-vue-ile' + (animer ? ' av-sortie' : ''), preserveAspectRatio: 'xMidYMid meet' });
    const nuages = ocean(svg, L, H);
    const [cx, cy, rx, ry] = portrait() ? [L / 2, H / 2 + 20, L * 0.47, H * 0.42] : [L / 2, H / 2 + 12, L * 0.44, H * 0.42];
    const graine = REGIONS.indexOf(r) + 3;
    svg.appendChild(sv('path', { d: contour(cx, cy, rx * 1.12, ry * 1.12, graine, 14), fill: '#9ee0f5', opacity: '.35' }));
    svg.appendChild(sv('path', { d: contour(cx, cy, rx, ry, graine + 4, 14), fill: '#f4e1b5', filter: 'url(#av-ombre)' }));
    svg.appendChild(sv('path', { d: contour(cx, cy - 6, rx * 0.88, ry * 0.84, graine + 8, 14), fill: r.terre }));
    svg.appendChild(sv('path', { d: contour(cx - rx * 0.3, cy - ry * 0.25, rx * 0.32, ry * 0.26, graine + 12), fill: r.fonce, opacity: '.25' }));
    svg.appendChild(sv('path', { d: contour(cx + rx * 0.35, cy + ry * 0.3, rx * 0.26, ry * 0.2, graine + 15), fill: r.fonce, opacity: '.2' }));
    // Décor sur les bords de l'île.
    r.deco.forEach((d, i) => {
      const a = (i / r.deco.length) * Math.PI * 2 + 0.6;
      emoji(svg, cx + Math.cos(a) * rx * 0.86, cy + Math.sin(a) * ry * 0.82, 30, d, 'av-deco');
    });
    const places = placesIle(niv.length, L, H);
    // Le sentier : pointillés, en or jusqu'au dernier niveau réussi.
    if (places.length > 1) {
      let d = `M${places[0].x} ${places[0].y}`;
      for (let i = 1; i < places.length; i++) {
        const a = places[i - 1], b = places[i];
        d += ` Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + (i % 2 ? -26 : 26)} ${b.x} ${b.y}`;
      }
      svg.appendChild(sv('path', { d, class: 'av-sentier', fill: 'none' }));
    }
    let courant = niv.findIndex((c, i) => niveauOuvert(p, r, i) && !etoiles(p, c.id));
    if (courant < 0) courant = niv.length - 1;
    niv.forEach((c, i) => {
      const { x, y } = places[i];
      const e = etoiles(p, c.id);
      const ouv = niveauOuvert(p, r, i);
      const g = sv('g', { class: 'av-niveau' + (ouv ? '' : ' ferme') + (e ? ' fait' : '') + (i === courant && ouv && !e ? ' courant' : ''), style: `--i:${i}` });
      if (i === courant && ouv && !e) g.appendChild(sv('circle', { cx: x, cy: y, r: 40, class: 'av-pouls' }));
      g.appendChild(sv('circle', { cx: x, cy: y, r: 31, fill: e ? 'url(#av-or)' : ouv ? '#fffdf6' : '#9aa3b2', stroke: e ? '#9a6114' : r.fonce, 'stroke-width': 3.5, filter: 'url(#av-ombre)' }));
      const dessin = c.etres[0] && (c.etres[0].emoji || '');
      if (ouv && dessin) emoji(g, x, y + 1, 28, dessin);
      else if (ouv) g.appendChild(sv('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 22, 'font-weight': 800, fill: r.fonce }, String(i + 1)));
      else emoji(g, x, y + 1, 22, '🔒');
      // Numéro du niveau.
      g.appendChild(sv('circle', { cx: x - 24, cy: y - 24, r: 11, fill: r.fonce }));
      g.appendChild(sv('text', { x: x - 24, y: y - 23.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 11.5, 'font-weight': 800, fill: '#fff' }, String(i + 1)));
      // Étoiles gagnées.
      for (let k = 0; k < 3; k++) {
        g.appendChild(sv('text', { x: x - 20 + k * 20, y: y + 46, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 17, class: k < e ? 'av-etoile pleine' : 'av-etoile' }, '★'));
      }
      const nom = c.nom.length > 22 ? c.nom.slice(0, 21) + '…' : c.nom;
      g.appendChild(sv('text', { x, y: y + 66, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, class: 'av-nom-niveau' }, nom));
      bouton(g, `Niveau ${i + 1} : ${c.nom}, ${ouv ? (e ? pluriel(e, 'étoile', 'étoiles') : 'à jouer') : 'fermé'}`, () => {
        if (!ouv) { SONS.verrou(); bulle('🔒 Réussis d\'abord le niveau précédent.'); return; }
        SONS.clic();
        ouvrirFiche(r, i);
      });
      svg.appendChild(g);
    });
    // Le pion de l'élève, au-dessus du niveau en cours.
    if (niv.length) {
      const { x, y } = places[courant];
      emoji(svg, x, y - 54, 30, app.avatar() || '🧭', 'av-pion');
    }
    svg.appendChild(nuages);
    // Titre de l'île.
    const titre = sv('g', { class: 'av-titre-ile' });
    const texte = `${r.ico} ${r.nom}`;
    const larg = 60 + texte.length * 10;
    titre.appendChild(sv('rect', { x: L / 2 - larg / 2, y: 16, width: larg, height: 46, rx: 23, fill: '#fffdf6', stroke: r.fonce, 'stroke-width': 3 }));
    titre.appendChild(sv('text', { x: L / 2, y: 40, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 20, 'font-weight': 800, fill: '#2b2112' }, texte));
    svg.appendChild(titre);
    scene.replaceChildren(svg);
    majTete(r);
  }

  /* En-tête, bulle d'information. */

  function majTete(r) {
    const p = lireProgres();
    $('.av-total', fen).textContent = `⭐ ${total(p)} / ${totalPossible()}`;
    $('.av-retour', fen).hidden = !r;
    $('.av-titre', fen).textContent = r ? `${r.ico} ${r.nom}` : '🗺️ L\'Aventure des boîtes';
    const son = $('.av-son', fen);
    son.textContent = sonActif() ? '🔊' : '🔇';
    son.setAttribute('aria-pressed', String(sonActif()));
    son.setAttribute('aria-label', sonActif() ? 'Couper les sons' : 'Remettre les sons');
  }
  let minuterieBulle = null;
  function bulle(texte) {
    const b = $('.av-bulle', fen);
    b.textContent = texte;
    b.classList.add('visible');
    clearTimeout(minuterieBulle);
    minuterieBulle = setTimeout(() => b.classList.remove('visible'), 3200);
  }

  /* Fiche d'un niveau : ce qu'il faut faire, le meilleur score, Jouer. */

  function ouvrirFiche(r, i) {
    const p = lireProgres();
    const c = niveauxDe(r)[i];
    const n = p.niveaux[c.id];
    const f = $('.av-fiche', fen);
    const [un, des] = app.elements(c.id);
    f.replaceChildren(
      el('div', 'av-fiche-dessin', (c.etres[0] && c.etres[0].emoji) || r.ico),
      el('p', 'av-fiche-sur', `${r.ico} ${r.nom} · niveau ${i + 1}`),
      el('h3', '', c.nom),
      el('p', 'av-fiche-quoi', `${pluriel(c.etres.length, un, des)} à ranger, ${pluriel(c.attributs.length, 'attribut', 'attributs')}.`),
      el('p', 'av-fiche-score', n ? `Ton meilleur score : ${'★'.repeat(n.e)}${'☆'.repeat(3 - n.e)}${n.t ? ' en ' + duree(n.t) : ''}` : 'Pas encore réussi : à toi de jouer !'),
      el('p', 'av-fiche-regle', `★★★ : sans erreur à la vérification, sans indice, en moins de ${duree(limite(c)).replace(' 00 s', '')}. ★★ : au plus deux erreurs ou indices.`),
    );
    const boutons = el('div', 'av-boutons');
    const jouer = el('button', 'av-btn av-principal', n ? (n.e < 3 ? '▶ Rejouer pour ★★★' : '▶ Rejouer') : '▶ Jouer');
    jouer.type = 'button';
    jouer.addEventListener('click', () => lancer(c.id));
    const fermer = el('button', 'av-btn', 'Plus tard');
    fermer.type = 'button';
    fermer.addEventListener('click', () => { f.hidden = true; });
    boutons.append(fermer, jouer);
    f.appendChild(boutons);
    f.hidden = false;
    jouer.focus();
  }

  /* Une partie. */

  let partie = session.lire();
  const hud = el('div', 'av-hud');
  hud.hidden = true;
  hud.setAttribute('role', 'status');
  (document.getElementById('zone') || document.body).appendChild(hud);
  let minuterieHud = null;

  function lancer(id) {
    const c = window.COLLECTIONS.find((x) => x.id === id);
    const r = regionDe(id);
    if (!c || !r) return;
    SONS.depart();
    partie = { collection: id, region: r.matiere, debut: Date.now(), erreurs: 0, indices: 0 };
    session.ecrire(partie);
    $('.av-fiche', fen).hidden = true;
    const fin = () => {
      fen.close();
      app.choisirCollection(id);
      app.viderPlan();
      const i = niveauxDe(r).indexOf(c);
      app.message(`🗺️ ${r.nom}, niveau ${i + 1} : range toutes les cartes dans des boîtes, puis appuie sur « Vérifier ». (↩ ramène ton travail d'avant.)`);
      montrerHud();
    };
    if (app.calme()) fin();
    else { fen.classList.add('av-depart'); setTimeout(() => { fen.classList.remove('av-depart'); fin(); }, 380); }
  }

  function montrerHud() {
    if (!partie) { hud.hidden = true; clearInterval(minuterieHud); return; }
    const c = window.COLLECTIONS.find((x) => x.id === partie.collection);
    const r = REGIONS.find((x) => x.matiere === partie.region);
    if (!c || !r) { abandonner(); return; }
    const i = niveauxDe(r).indexOf(c);
    hud.style.setProperty('--fonce', r.fonce);
    const maj = () => {
      if (!partie) return;
      const t = Date.now() - partie.debut;
      const s = Math.floor(t / 1000);
      hud.querySelector('.av-hud-temps').textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      hud.querySelector('.av-hud-temps').classList.toggle('depasse', t > limite(c));
      hud.querySelector('.av-hud-erreurs').textContent = `✗ ${partie.erreurs}`;
      hud.querySelector('.av-hud-indices').textContent = `💡 ${partie.indices}`;
      hud.querySelector('.av-hud-etoiles').textContent = '★'.repeat(estimer(c)) + '☆'.repeat(3 - estimer(c));
    };
    hud.replaceChildren(
      el('span', 'av-hud-lieu', `${r.ico} Niveau ${i + 1}`),
      el('span', 'av-hud-etoiles'),
      el('span', 'av-hud-temps'),
      el('span', 'av-hud-erreurs'),
      el('span', 'av-hud-indices'),
    );
    const carte = el('button', 'av-hud-carte', '🗺️ Carte');
    carte.type = 'button';
    carte.title = 'Revenir à la carte (la partie continue)';
    carte.addEventListener('click', () => ouvrir(r.matiere));
    const quitter = el('button', 'av-hud-quitter', '✕');
    quitter.type = 'button';
    quitter.title = 'Abandonner ce niveau';
    quitter.setAttribute('aria-label', 'Abandonner ce niveau');
    quitter.addEventListener('click', () => { abandonner(); app.message('🗺️ Niveau abandonné. L\'aventure t\'attend : 🗺️ dans la barre.'); });
    hud.append(carte, quitter);
    hud.hidden = false;
    maj();
    clearInterval(minuterieHud);
    minuterieHud = setInterval(maj, 1000);
  }

  // Étoiles que donnerait une réussite maintenant (affichées pendant la partie).
  function estimer(c) {
    const fautes = partie.erreurs + partie.indices;
    if (!fautes && Date.now() - partie.debut <= limite(c)) return 3;
    return fautes <= 2 ? 2 : 1;
  }

  function abandonner() {
    partie = null;
    session.ecrire(null);
    montrerHud();
  }

  window.addEventListener('boites:verification', (ev) => {
    if (partie && ev.detail.collection === partie.collection && !ev.detail.complet && ev.detail.erreurs > 0) {
      partie.erreurs++;
      session.ecrire(partie);
      montrerHud();
    }
  });
  window.addEventListener('boites:indice', (ev) => {
    if (partie && ev.detail.collection === partie.collection) { partie.indices++; session.ecrire(partie); montrerHud(); }
  });
  window.addEventListener('boites:collection', (ev) => {
    if (partie && ev.detail.collection !== partie.collection) {
      abandonner();
      app.message('🗺️ Tu as changé de collection : le niveau de l\'aventure est abandonné.');
    }
  });
  window.addEventListener('boites:reussite', (ev) => {
    if (!partie || ev.detail.collection !== partie.collection) return;
    const c = window.COLLECTIONS.find((x) => x.id === partie.collection);
    const r = REGIONS.find((x) => x.matiere === partie.region);
    const temps = Date.now() - partie.debut;
    const gagne = estimer(c);
    const fautes = { erreurs: partie.erreurs, indices: partie.indices };
    abandonner(); // la partie est finie
    if (!c || !r) return;
    // Meilleur score, île conquise, îles ouvertes par ces étoiles.
    const p = lireProgres();
    const avant = { total: total(p), ancien: etoiles(p, c.id), conquise: conquise(p, r), ouvertes: REGIONS.filter((x) => ouverte(p, x)).map((x) => x.matiere) };
    const n = p.niveaux[c.id];
    if (!n || gagne > n.e || (gagne === n.e && (!n.t || temps < n.t))) p.niveaux[c.id] = { e: Math.max(gagne, n ? n.e : 0), t: !n || gagne >= n.e ? temps : n.t, d: new Date().toISOString() };
    const nouvelleConquete = !avant.conquise && conquise(p, r);
    if (nouvelleConquete) p.regions[r.matiere] = new Date().toISOString();
    app.ecrire(CLE, JSON.stringify(p));
    app.marquerReussie(c.id);
    const apres = total(p);
    const nouvelles = REGIONS.filter((x) => ouverte(p, x) && !avant.ouvertes.includes(x.matiere));
    window.dispatchEvent(new CustomEvent('boites:aventure-etoiles', { detail: { collection: c.id, region: r.matiere, etoiles: gagne, meilleur: etoiles(p, c.id), gagnees: apres - avant.total, total: apres } }));
    // L'écran de victoire, après les confettis du logiciel.
    setTimeout(() => victoire(r, c, gagne, temps, fautes, avant.ancien, nouvelleConquete, nouvelles), app.calme() ? 300 : 1100);
  });

  /* Écrans de victoire. */

  function victoire(r, c, gagne, temps, fautes, ancien, nouvelleConquete, nouvelles) {
    ouvrir(r.matiere, true);
    const v = $('.av-victoire', fen);
    v.className = 'av-panneau av-victoire';
    const etoilesG = el('div', 'av-grandes-etoiles');
    for (let k = 0; k < 3; k++) etoilesG.appendChild(el('span', 'av-grande-etoile', '★'));
    const niv = niveauxDe(r);
    const i = niv.indexOf(c);
    const mots = ['Réussi !', 'Bravo !', 'Parfait !'];
    const details = [`⏱ ${duree(temps)}`, `✗ ${pluriel(fautes.erreurs, 'erreur', 'erreurs')}`, `💡 ${pluriel(fautes.indices, 'indice', 'indices')}`];
    v.replaceChildren(
      el('p', 'av-fiche-sur', `${r.ico} ${r.nom} · niveau ${i + 1}`),
      el('h3', 'av-victoire-titre', mots[gagne - 1]),
      etoilesG,
      el('p', 'av-victoire-nom', c.nom),
      el('p', 'av-victoire-details', details.join(' · ')),
    );
    if (gagne > ancien && ancien) v.appendChild(el('p', 'av-record', `🎉 Nouveau record : ${gagne - ancien} étoile${gagne - ancien > 1 ? 's' : ''} de plus !`));
    if (gagne < 3) v.appendChild(el('p', 'av-conseil', gagne === 2 ? '★★★ : rejoue sans erreur ni indice, et dans le temps !' : 'Rejoue ce niveau pour gagner plus d\'étoiles.'));
    for (const x of nouvelles) v.appendChild(el('p', 'av-debloque', `🔓 Nouvelle île débloquée : ${x.ico} ${x.nom} !`));
    const boutons = el('div', 'av-boutons');
    const suivant = niv[i + 1];
    const btn = (texte, action, principal) => {
      const b = el('button', 'av-btn' + (principal ? ' av-principal' : ''), texte);
      b.type = 'button';
      b.addEventListener('click', action);
      boutons.appendChild(b);
      return b;
    };
    btn('🗺️ Voir l\'île', () => { v.hidden = true; dessinerIle(r); });
    let premier;
    if (nouvelleConquete) premier = btn('🏆 Continuer', () => conquete(r, nouvelles), true);
    else if (suivant) premier = btn(`▶ Niveau ${i + 2}`, () => { v.hidden = true; lancer(suivant.id); }, true);
    else premier = btn('🔁 Rejouer', () => { v.hidden = true; lancer(c.id); }, true);
    v.appendChild(boutons);
    v.hidden = false;
    premier.focus();
    // Les étoiles s'allument une à une, avec un son qui monte.
    const grandes = [...etoilesG.children];
    grandes.forEach((s, k) => {
      if (k >= gagne) return;
      const allumer = () => { s.classList.add('allumee'); SONS.etoile(k); };
      if (app.calme()) allumer(); else setTimeout(allumer, 450 + k * 420);
    });
    setTimeout(() => SONS.victoire(), app.calme() ? 0 : 450 + gagne * 420);
    app.dire(`${mots[gagne - 1]} ${pluriel(gagne, 'étoile', 'étoiles')}.`);
    if (gagne === 3) feu(1);
  }

  function conquete(r, nouvelles) {
    const v = $('.av-victoire', fen);
    v.className = 'av-panneau av-victoire av-conquete';
    v.replaceChildren(
      el('div', 'av-conquete-ile', r.ico),
      el('h3', 'av-victoire-titre', '🏆 Île conquise !'),
      el('p', 'av-victoire-nom', `Tu as réussi tous les niveaux de ${r.nom}.`),
      el('p', 'av-victoire-details', `⭐ ${etoilesRegion(lireProgres(), r)} / ${3 * niveauxDe(r).length} sur cette île`),
    );
    for (const x of nouvelles) v.appendChild(el('p', 'av-debloque', `🔓 Nouvelle île débloquée : ${x.ico} ${x.nom} !`));
    const prochaine = REGIONS.find((x) => ouverte(lireProgres(), x) && !conquise(lireProgres(), x));
    const boutons = el('div', 'av-boutons');
    const b = el('button', 'av-btn av-principal', prochaine ? `⛵ Cap sur ${prochaine.nom}` : '🗺️ Carte du monde');
    b.type = 'button';
    b.addEventListener('click', () => { v.hidden = true; dessinerMonde(true); });
    boutons.appendChild(b);
    v.appendChild(boutons);
    v.hidden = false;
    b.focus();
    SONS.conquete();
    if (nouvelles.length) setTimeout(SONS.debloque, 2200);
    app.dire(`Île conquise ! Tu as réussi tous les niveaux de ${r.nom}.`);
    feu(3);
  }

  // Feu d'artifice : des étincelles en CSS, sur quelques secondes (rien avec « Moins d'animations »).
  function feu(salves) {
    if (app.calme()) return;
    const zone = $('.av-feu', fen);
    const couleurs = ['#f5b301', '#e34948', '#2a78d6', '#1baf7a', '#e87ba4', '#9085e9', '#fff'];
    for (let s = 0; s < salves * 3; s++) {
      setTimeout(() => {
        const x = 15 + Math.random() * 70, y = 15 + Math.random() * 45;
        for (let k = 0; k < 26; k++) {
          const e = el('span', 'av-etincelle');
          const a = (k / 26) * Math.PI * 2, d = 70 + Math.random() * 80;
          e.style.cssText = `left:${x}%;top:${y}%;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;background:${couleurs[(s + k) % couleurs.length]}`;
          zone.appendChild(e);
          setTimeout(() => e.remove(), 1500);
        }
        souffle(0, 0.25, 0.05);
      }, s * 420);
    }
  }

  /* Ouvrir, fermer. */

  function ouvrir(matiere, sansAnimation) {
    if (app.consultation()) return;
    for (const d of document.querySelectorAll('dialog[open]')) if (d !== fen) d.close();
    $('.av-fiche', fen).hidden = true;
    $('.av-victoire', fen).hidden = true;
    const r = matiere && REGIONS.find((x) => x.matiere === matiere && ouverte(lireProgres(), x));
    if (r) dessinerIle(r, !sansAnimation); else dessinerMonde(!sansAnimation);
    if (!fen.open) fen.showModal();
    if (!local.lire(CLE_VU) && !r) intro();
  }

  // Première visite : une page de titre.
  function intro() {
    local.ecrire(CLE_VU, '1');
    const v = $('.av-victoire', fen);
    v.className = 'av-panneau av-victoire av-intro';
    v.replaceChildren(
      el('div', 'av-conquete-ile', '🧭'),
      el('h3', 'av-victoire-titre', 'L\'Aventure des boîtes'),
      el('p', 'av-victoire-nom', `Sept îles à conquérir, ${totalPossible() / 3} niveaux, trois étoiles à décrocher à chaque fois !`),
      el('p', 'av-victoire-details', 'Classe sans erreur, sans indice et vite pour gagner ★★★. Tes étoiles ouvrent les îles suivantes.'),
    );
    const boutons = el('div', 'av-boutons');
    const b = el('button', 'av-btn av-principal', '⛵ En route !');
    b.type = 'button';
    b.addEventListener('click', () => { v.hidden = true; SONS.ile(); });
    boutons.appendChild(b);
    v.appendChild(boutons);
    v.hidden = false;
    b.focus();
    SONS.debloque();
  }

  $('.av-fermer', fen).addEventListener('click', () => fen.close());
  $('.av-retour', fen).addEventListener('click', () => { SONS.clic(); dessinerMonde(true); });
  $('.av-son', fen).addEventListener('click', () => { local.ecrire(CLE_SON, sonActif() ? '0' : '1'); majTete(vue.type === 'ile' ? REGIONS.find((x) => x.matiere === vue.region) : null); SONS.clic(); });
  // Échap : d'abord la fiche ou l'écran de victoire, puis l'île, puis l'aventure.
  fen.addEventListener('cancel', (ev) => {
    const panneau = [...fen.querySelectorAll('.av-panneau')].find((x) => !x.hidden);
    if (panneau) { ev.preventDefault(); panneau.hidden = true; return; }
    if (vue.type === 'ile') { ev.preventDefault(); dessinerMonde(true); }
  });
  let minuterieTaille = null;
  window.addEventListener('resize', () => {
    if (!fen.open) return;
    clearTimeout(minuterieTaille);
    minuterieTaille = setTimeout(() => {
      const r = vue.type === 'ile' ? REGIONS.find((x) => x.matiere === vue.region) : null;
      if (r) dessinerIle(r); else dessinerMonde();
    }, 200);
  });

  // Bouton de la barre.
  const barre = document.getElementById('aventure');
  if (barre) barre.addEventListener('click', () => ouvrir(partie && partie.region));
  if (partie) montrerHud(); // partie reprise après un rechargement

  window.aventure = { ouvrir: (m) => ouvrir(m), regions: () => REGIONS.map((r) => ({ ...r, niveaux: niveauxDe(r).map((c) => c.id) })) };
}());
