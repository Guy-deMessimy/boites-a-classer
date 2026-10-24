// Niveaux et expérience (4.1). L'XP n'est pas un compteur : elle se calcule à partir de ce que la sauvegarde synchronisée
// garde déjà (« boites-a-classer:… »), donc elle est la même sur tous les appareils, ne compte jamais deux fois et ne
// demande rien au serveur :
//   collection réussie « reussi:<id> » 100 · trophée expert « expert:<id> » +150 · étoile du calendrier « avent:<jour> » 50
//   · défi chronométré réussi « defi-fait:<id> » 40 (recopié ici depuis les records de l'appareil, qui ne partent pas)
//   · mode Aventure « jeu:aventure » (JSON de app/aventure.js : { niveaux: { <collection>: { e: 1 à 3 } }, regions: { <matière>:
//   date } }) : 30 par étoile (meilleur score de chaque niveau), 150 par région conquise.
// Niveau n atteint à 50·n·(n−1) XP ; un titre tous les quelques niveaux ; un cadre de photo débloqué à certains niveaux.
// - Logiciel (app/index.html, après app.js et son window.boitesApp) : niveau, titre, barre d'XP et choix du cadre sur la
//   carte de profil (#sv-carte, complétée après chaque rendu), pastille de niveau et cadre sur le rond du bouton du compte,
//   écran « Niveau supérieur ! » quand le niveau monte (« niveau-vu » synchronisée : rien ne se rejoue ailleurs, et rien
//   pour les niveaux déjà acquis à l'arrivée de la 4.1). Écoute « boites:reussite » et les écritures de boitesApp.ecrire.
// - « Mes classes » (site/classe/, qui charge ../app/niveau.js) : window.BoitesNiveau calcule le niveau de chaque élève à
//   partir de son travail et donne la pastille, le bloc de la carte et le cadre.
// Dessin : app/profil.css (« Niveaux, XP et cadres »).
(function () {
  'use strict';
  const PREFIXE = 'boites-a-classer:';
  const XP = { reussi: 100, expert: 150, avent: 50, defi: 40, etoile: 30, region: 150 };
  const TITRES = [[1, 'Apprenti classeur'], [3, 'Petit trieur'], [5, 'Classeur curieux'], [7, 'Explorateur des boîtes'],
    [10, 'Expert des tiroirs'], [13, 'Grand classificateur'], [16, 'Savant des collections'], [20, 'Maître des boîtes']];
  // Cadres de la photo : id (data-cadre), nom, niveau qui le débloque.
  const CADRES = [['aucun', 'Sans cadre', 1], ['simple', 'Liseré', 2], ['bronze', 'Bronze', 4], ['argent', 'Argent', 7],
    ['or', 'Or', 10], ['emeraude', 'Émeraude', 13], ['arc-en-ciel', 'Arc-en-ciel', 16], ['galaxie', 'Galaxie', 20]];
  const CLE_CADRE = PREFIXE + 'cadre';
  const CLE_VU = PREFIXE + 'niveau-vu';
  const seuil = (n) => 50 * n * (n - 1);
  const nombre = (n) => n.toLocaleString('fr-FR');

  // donnees : { clé: valeur } (le travail sauvegardé d'un compte, ou ce que garde cet appareil).
  function calculer(donnees) {
    const d = { collections: 0, trophees: 0, etoiles: 0, defis: 0, aventure: 0, regions: 0 };
    for (const k of Object.keys(donnees || {})) {
      if (!k.startsWith(PREFIXE)) continue;
      const r = k.slice(PREFIXE.length);
      if (r.startsWith('reussi:')) d.collections++;
      else if (r.startsWith('expert:')) d.trophees++;
      else if (r.startsWith('avent:')) d.etoiles++;
      else if (r.startsWith('defi-fait:')) d.defis++;
      else if (r === 'jeu:aventure') {
        try {
          const a = JSON.parse(donnees[k]) || {};
          for (const n of Object.values(a.niveaux || {})) d.aventure += Math.max(0, Math.min(3, parseInt(n && n.e, 10) || 0));
          d.regions = Object.keys(a.regions || {}).length;
        } catch (e) { /* valeur illisible : rien */ }
      }
    }
    const xp = d.collections * XP.reussi + d.trophees * XP.expert + d.etoiles * XP.avent + d.defis * XP.defi
      + d.aventure * XP.etoile + d.regions * XP.region;
    let niveau = 1;
    while (niveau < 99 && xp >= seuil(niveau + 1)) niveau++;
    const debloques = CADRES.filter((c) => niveau >= c[2]).map((c) => c[0]);
    const choisi = donnees && donnees[CLE_CADRE];
    return {
      xp, niveau, detail: d, debut: seuil(niveau), fin: seuil(niveau + 1), debloques,
      titre: TITRES.filter((t) => niveau >= t[0]).pop()[1],
      cadre: debloques.includes(choisi) ? choisi : debloques[debloques.length - 1],
      prochainCadre: CADRES.find((c) => c[2] > niveau) || null,
    };
  }
  const titreDe = (n) => TITRES.filter((t) => n >= t[0]).pop()[1];
  const nomCadre = (id) => (CADRES.find((c) => c[0] === id) || CADRES[0])[1];

  function el(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }
  function appliquerCadre(rond, cadre) {
    if (cadre && cadre !== 'aucun') rond.dataset.cadre = cadre; else delete rond.dataset.cadre;
    return rond;
  }
  // Pastille « Niv. 5 » (Mes classes, à côté du prénom).
  function pastille(nv) {
    const p = el('span', 'niv-pastille', 'Niv. ' + nv.niveau);
    p.title = nv.titre + ' · ' + nombre(nv.xp) + ' XP';
    return p;
  }
  // Ce que montre la carte de profil : niveau, titre, barre d'XP (qui se remplit), d'où vient l'XP. moi : la carte du
  // compte connecté (« Encore … pour », et le choix du cadre est ajouté par le logiciel).
  function bloc(nv, moi) {
    const b = el('div', 'cp-niveau');
    const tete = el('div', 'cpn-tete');
    tete.append(el('span', 'cpn-badge', 'Niv. ' + nv.niveau), el('strong', 'cpn-titre', nv.titre), el('span', 'cpn-xp', nombre(nv.xp) + ' XP'));
    const barre = el('div', 'cpn-barre');
    const part = Math.max(0, Math.min(1, (nv.xp - nv.debut) / (nv.fin - nv.debut)));
    barre.setAttribute('role', 'progressbar');
    barre.setAttribute('aria-label', 'Expérience vers le niveau ' + (nv.niveau + 1));
    barre.setAttribute('aria-valuemin', String(nv.debut));
    barre.setAttribute('aria-valuemax', String(nv.fin));
    barre.setAttribute('aria-valuenow', String(nv.xp));
    const rempli = el('i');
    barre.append(rempli);
    // Elle part de zéro et se remplit (sauf si les animations sont réduites, app/profil.css).
    requestAnimationFrame(() => requestAnimationFrame(() => { rempli.style.width = (part * 100).toFixed(1) + '%'; }));
    const reste = nv.fin - nv.xp;
    const suite = (moi ? 'Encore ' : 'Plus que ') + nombre(reste) + ' XP pour le niveau ' + (nv.niveau + 1)
      + (nv.prochainCadre ? ' · prochain cadre : ' + nv.prochainCadre[1] + ' (niveau ' + nv.prochainCadre[2] + ')' : '');
    const d = nv.detail, gains = [];
    if (d.collections) gains.push('✅ ' + d.collections);
    if (d.trophees) gains.push('🏆 ' + d.trophees);
    if (d.etoiles + d.aventure) gains.push('⭐ ' + (d.etoiles + d.aventure));
    if (d.defis) gains.push('⏱ ' + d.defis);
    if (d.regions) gains.push('🗺 ' + d.regions);
    const g = el('p', 'cpn-gains', gains.length ? gains.join('   ') : (moi ? 'Réussis une collection pour gagner tes premiers XP !' : 'Pas encore d\'XP.'));
    g.title = 'XP : collection réussie 100, trophée 🏆 150, étoile ⭐ du calendrier 50, défi chronométré ⏱ 40, étoile du mode Aventure 30, région 🗺 conquise 150';
    b.append(tete, barre, el('p', 'cpn-suite', suite), g);
    return b;
  }

  window.BoitesNiveau = { calculer, bloc, pastille, appliquerCadre, titreDe, nomCadre, CADRES };

  // ---------- Logiciel ----------
  const app = window.boitesApp;
  if (!app || !document.getElementById('compte')) return;
  const reduire = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connecte = () => !!app.lire('boites-a-classer-compte:jeton');

  function donneesAppareil() {
    const d = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIXE)) d[k] = localStorage.getItem(k);
      }
    } catch (e) { /* stockage indisponible */ }
    return d;
  }
  // Les records des défis chronométrés restent sur l'appareil (« boites-a-classer-defi:<id>[:<niveau>] ») : la réussite,
  // elle, est recopiée dans une clé synchronisée pour compter partout.
  function recopierDefis() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('boites-a-classer-defi:')) continue;
        const id = k.slice('boites-a-classer-defi:'.length).split(':')[0];
        if (id && !app.lire(PREFIXE + 'defi-fait:' + id)) ecrireOriginal(PREFIXE + 'defi-fait:' + id, new Date().toISOString());
      }
    } catch (e) { /* stockage indisponible */ }
  }

  // Rond du bouton du compte : cadre et pastille de niveau (seulement connecté, comme la carte).
  function majBarre(nv) {
    const rond = document.getElementById('compte-avatar');
    if (!rond) return;
    const voulu = connecte() && rond.classList.contains('avatar');
    const cadre = voulu ? nv.cadre : 'aucun', niveau = voulu ? String(nv.niveau) : '';
    if ((rond.dataset.cadre || 'aucun') !== cadre) appliquerCadre(rond, cadre);
    if ((rond.dataset.niveau || '') !== niveau) { if (niveau) rond.dataset.niveau = niveau; else delete rond.dataset.niveau; }
  }
  // Carte de profil : le bloc du niveau sous l'identité, le cadre sur la grande photo, le choix du cadre.
  function majCarte(nv) {
    const carte = document.getElementById('sv-carte');
    if (!carte || !carte.querySelector('.cp-identite')) return;
    const ancien = carte.querySelector('.cp-niveau');
    if (ancien && ancien.dataset.cle === nv.xp + ':' + nv.cadre) return;
    const b = bloc(nv, true);
    b.dataset.cle = nv.xp + ':' + nv.cadre;
    const grand = carte.querySelector('.avatar.grand');
    if (grand) appliquerCadre(grand, nv.cadre);
    const choix = el('details', 'cpn-cadres');
    choix.open = !!(ancien && ancien.querySelector('.cpn-cadres[open]'));
    choix.append(el('summary', '', '🖼 Cadre de ta photo · ' + nomCadre(nv.cadre)));
    const liste = el('div', 'cpn-choix');
    for (const [id, nom, n] of CADRES) {
      const ok = nv.debloques.includes(id);
      const bt = el('button', 'cpn-cadre' + (id === nv.cadre ? ' actuel' : ''));
      bt.type = 'button';
      bt.disabled = !ok;
      bt.setAttribute('aria-pressed', String(id === nv.cadre));
      bt.title = ok ? nom : nom + ' : débloqué au niveau ' + n;
      const apercu = grand ? grand.cloneNode(true) : el('span', 'avatar', '⭐');
      apercu.classList.remove('grand', 'verifie');
      apercu.removeAttribute('title');
      apercu.setAttribute('aria-hidden', 'true');
      appliquerCadre(apercu, id);
      bt.append(apercu, el('span', 'cpn-nom', ok ? nom : '🔒 Niv. ' + n));
      bt.addEventListener('click', () => { ecrireOriginal(CLE_CADRE, id); majTout(); });
      liste.append(bt);
    }
    choix.append(liste);
    b.append(choix);
    if (ancien) ancien.replaceWith(b); else carte.querySelector('.cp-identite').after(b);
  }

  let fete = null;
  // « Niveau supérieur ! » : plein écran, rayons qui tournent, la photo qui monte avec son nouveau cadre, le compteur.
  function feter(avant, nv) {
    if (fete) fete.remove();
    const f = el('div', 'niveau-fete');
    f.setAttribute('role', 'dialog');
    f.setAttribute('aria-modal', 'true');
    f.setAttribute('aria-label', 'Niveau supérieur : niveau ' + nv.niveau + ', ' + nv.titre);
    const contenu = el('div', 'nf-contenu');
    const rond = el('span', 'avatar nf-avatar');
    const photo = connecte() && app.lire('boites-a-classer-compte:avatar');
    const nom = app.lire('boites-a-classer-compte:identifiant') || '';
    if (photo) {
      rond.textContent = photo;
      const fond = app.lire('boites-a-classer-compte:avatar-fond');
      if (fond) rond.dataset.fond = fond;
    } else if (connecte() && nom) {
      rond.classList.add('defaut');
      rond.textContent = ([...nom][0] || '?').toLocaleUpperCase('fr-FR');
    } else rond.textContent = '⭐';
    appliquerCadre(rond, nv.cadre);
    const compteur = el('span', 'nf-nombre', String(avant));
    const niveau = el('p', 'nf-niveau');
    niveau.append('Niveau ', compteur);
    const titre = el('p', 'nf-titre');
    titre.append(nv.titre !== titreDe(avant) ? 'Nouveau titre : ' : 'Toujours ', el('strong', '', nv.titre));
    const nouveaux = CADRES.filter((c) => c[2] > avant && c[2] <= nv.niveau);
    const ok = el('button', 'nf-ok', 'Super !');
    ok.type = 'button';
    contenu.append(el('p', 'nf-sur', 'Niveau supérieur !'), el('span', 'nf-rond'), niveau, titre);
    contenu.querySelector('.nf-rond').append(rond);
    if (nouveaux.length) contenu.append(el('p', 'nf-cadre', '🖼 Nouveau cadre débloqué : ' + nouveaux.map((c) => c[1]).join(', ')));
    contenu.append(ok);
    f.append(el('div', 'nf-rayons'), contenu);
    const fermer = () => { if (!fete) return; fete.classList.add('sortie'); const x = fete; fete = null; setTimeout(() => x.remove(), reduire() ? 0 : 250); };
    ok.addEventListener('click', fermer);
    f.addEventListener('click', (ev) => { if (ev.target === f) fermer(); });
    f.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fermer(); });
    document.body.append(f);
    fete = f;
    ok.focus({ preventScroll: true });
    // Le compteur monte jusqu'au nouveau niveau, puis les confettis du logiciel.
    let n = avant;
    const pas = () => {
      if (!fete || n >= nv.niveau) return;
      n++;
      compteur.textContent = String(n);
      compteur.classList.remove('saut');
      void compteur.offsetWidth;
      compteur.classList.add('saut');
      setTimeout(pas, 380);
    };
    setTimeout(pas, reduire() ? 0 : 700);
    if (app.feter && !reduire()) setTimeout(() => app.feter(), 900);
  }

  let derniere = null;
  function majTout() {
    recopierDefis();
    const nv = calculer(donneesAppareil());
    derniere = nv;
    majBarre(nv);
    majCarte(nv);
    // Niveau monté depuis la dernière fois (sur n'importe quel appareil) : la fête ; à la toute première lecture, rien.
    const vu = parseInt(app.lire(CLE_VU), 10);
    if (!(vu >= 1)) ecrireOriginal(CLE_VU, String(nv.niveau));
    else if (nv.niveau > vu) {
      ecrireOriginal(CLE_VU, String(nv.niveau));
      if (!document.body.classList.contains('consultation')) feter(vu, nv);
    }
    return nv;
  }
  let minuterie = null;
  const bientot = (ms = 80) => { clearTimeout(minuterie); minuterie = setTimeout(majTout, ms); };

  // Les écritures des modules à part (calendrier, Aventure…) passent par boitesApp.ecrire : on les suit.
  const ecrireOriginal = app.ecrire;
  app.ecrire = function (k, v) {
    const r = ecrireOriginal.apply(this, arguments);
    if (typeof k === 'string' && k.startsWith(PREFIXE) && k !== CLE_VU && k !== CLE_CADRE) bientot();
    return r;
  };
  // La réussite d'une collection est annoncée avant d'être écrite : on relit juste après.
  window.addEventListener('boites:reussite', () => bientot(120));
  window.addEventListener('boites:aventure-etoiles', () => bientot(120)); // app/aventure.js, après l'écriture de « jeu:aventure »
  // La carte et le bouton du compte sont redessinés par le logiciel : on les complète à chaque fois.
  const observer = new MutationObserver(() => { if (derniere) { majBarre(derniere); majCarte(derniere); } });
  const carte = document.getElementById('sv-carte');
  if (carte) observer.observe(carte, { childList: true });
  observer.observe(document.getElementById('compte-avatar'), { attributes: true, attributeFilter: ['class'], childList: true });
  // Ce qui arrive de la sauvegarde en ligne (un autre appareil) : relu de temps en temps, et au retour sur l'onglet.
  setInterval(() => { if (document.visibilityState === 'visible') majTout(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') bientot(); });
  bientot(300);
})();
