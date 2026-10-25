// Vérifie que importerSauvegarde (app/app.js) ne perd plus, à la réception d'une sauvegarde
// en ligne (« ecraser »), les étoiles du calendrier, les défis réussis, le cadre choisi
// ni le niveau déjà fêté. La fonction exécutée est celle du fichier, pas une copie.
// Usage : node outils/verifier-synchro.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function echouer(message) {
  console.error('✗ ' + message);
  process.exit(1);
}
function trier(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
function egal(obtenu, attendu, message) {
  const a = JSON.stringify(trier(obtenu)), b = JSON.stringify(trier(attendu));
  if (a !== b) echouer(message + '\n  obtenu : ' + a + '\n  attendu : ' + b);
}

const racine = path.resolve(__dirname, '..');
const lireFichier = (rel) => fs.readFileSync(path.join(racine, rel), 'utf8');
const source = lireFichier('app/app.js');
if (source !== lireFichier('site/app/app.js')) echouer('site/app/app.js diffère de app/app.js');
if (lireFichier('app/niveau.js') !== lireFichier('site/app/niveau.js')) echouer('site/app/niveau.js diffère de app/niveau.js');

const debut = source.indexOf('function importerSauvegarde(donnees, ecraser) {');
const fin = source.indexOf('\n  async function recevoirTransfert', debut);
if (debut < 0 || fin < 0) echouer('importerSauvegarde introuvable dans app/app.js');

const idSur = source.match(/^  const idSur = .+$/m);
const hors = source.match(/^  const HORS_SAUVEGARDE = new Set\(\[[^\]]+\]\);/m);
if (!idSur || !hors) echouer('idSur ou HORS_SAUVEGARDE introuvable');

const constantes = {
  CLE_NIVEAU: 'boites-a-classer:reglage:niveau',
  CLE_SUIVI: 'boites-a-classer:suivi:parcours',
  CLE_ACCES: 'boites-a-classer:reglage:acces',
  CLE_AVENTURE: 'boites-a-classer:jeu:aventure',
  CLE_MES_COLLECTIONS: 'boites-a-classer:mes-collections',
};
for (const [nom, valeur] of Object.entries(constantes)) {
  if (!source.includes(`const ${nom} = '${valeur}'`)) echouer('constante introuvable : ' + nom);
}

// Mémoire à la place du localStorage. Le nettoyage des collections et de l'Aventure est un
// relais : la vérification porte sur les clés gardées, écrites ou effacées.
const mem = new Map();
const sandbox = { mem };
const decl = Object.entries(constantes).map(([nom, valeur]) => `const ${nom} = ${JSON.stringify(valeur)};`).join('\n');
vm.runInNewContext(`'use strict';
${idSur[0]}
${hors[0]}
${decl}
let mesCollections = [];
function lire(k) { return mem.has(k) ? mem.get(k) : null; }
function ecrire(k, v) { mem.set(k, String(v)); }
function oublier(k) { mem.delete(k); }
function toutes() { return mesCollections; }
function nettoyerCollection(c) { return c; }
function sauverMesCollections(liste) { mesCollections = liste; }
function nomLibre(nom) { return nom; }
function niveauValide(n) { return n === 'facile' || n === 'normal' || n === 'expert'; }
function accesPropre(o) { return o; }
function aventurePropre(o) { return o; }
function suiviPropre(o) { return o; }
function nettoyerEtat(o) { return o; }
function donneesLocales() {
  const d = {};
  for (const [k, v] of mem) if (k.startsWith('boites-a-classer:') && !HORS_SAUVEGARDE.has(k)) d[k] = v;
  return d;
}
${source.slice(debut, fin)}
this.importerSauvegarde = importerSauvegarde;
this.donneesLocales = donneesLocales;
`, sandbox);

const importerSauvegarde = sandbox.importerSauvegarde;
const ISO = '2025-12-04T18:30:00.000Z';
const P = 'boites-a-classer:';

function charger(entrees) {
  mem.clear();
  for (const [k, v] of Object.entries(entrees)) mem.set(k, v);
}
const etat = () => trier(Object.fromEntries(mem));

// L'appareil B a déjà une étoile, un défi, un cadre et un niveau fêté.
// La version reçue en ajoute, change le cadre et monte le niveau déjà vu.
charger({
  [P + 'avent:2025-12-03']: ISO,
  [P + 'defi-fait:plantes']: ISO,
  [P + 'cadre']: 'aucun',
  [P + 'niveau-vu']: '2',
  [P + 'zoom']: '1.2',
});
importerSauvegarde({
  [P + 'reussi:plantes']: ISO,
  [P + 'avent:2025-12-03']: ISO,
  [P + 'avent:2025-12-04']: ISO,
  [P + 'defi-fait:plantes']: ISO,
  [P + 'cadre']: 'or',
  [P + 'niveau-vu']: '10',
}, true);
egal(etat(), {
  [P + 'avent:2025-12-03']: ISO,
  [P + 'avent:2025-12-04']: ISO,
  [P + 'cadre']: 'or',
  [P + 'defi-fait:plantes']: ISO,
  [P + 'niveau-vu']: '10',
  [P + 'reussi:plantes']: ISO,
  [P + 'zoom']: '1.2',
}, 'réception : étoiles, défi, cadre et niveau-vu');

// niveau-vu ne redescend pas (une fête déjà vue ne se rejoue pas). Une valeur illisible non plus.
charger({ [P + 'niveau-vu']: '10', [P + 'cadre']: 'arc-en-ciel' });
importerSauvegarde({ [P + 'niveau-vu']: '4', [P + 'cadre']: 'or' }, true);
egal(etat(), { [P + 'cadre']: 'or', [P + 'niveau-vu']: '10' }, 'niveau-vu ne redescend pas');

charger({ [P + 'niveau-vu']: '10', [P + 'cadre']: 'or' });
importerSauvegarde({ [P + 'niveau-vu']: '1000', [P + 'cadre']: 'Or<script>' }, true);
egal(etat(), { [P + 'cadre']: 'or', [P + 'niveau-vu']: '10' }, 'cadre ou niveau-vu illisible : on garde l\'appareil');

// Aller-retour : ce qui part avec la sauvegarde revient à l'identique sur un autre appareil.
const depart = {
  [P + 'reussi:plantes']: ISO,
  [P + 'expert:plantes']: ISO,
  [P + 'avent:2025-12-03']: ISO,
  [P + 'avent:2025-12-04']: ISO,
  [P + 'defi-fait:plantes']: ISO,
  [P + 'cadre']: 'arc-en-ciel',
  [P + 'niveau-vu']: '10',
  [P + 'reglage:niveau']: 'expert',
  [P + 'jeu:aventure']: JSON.stringify({ v: 1, niveaux: { plantes: { e: 2, t: 1000, d: ISO } }, regions: { sciences: ISO } }),
  [P + 'zoom']: '0.8',
  [P + 'collection']: 'plantes',
};
charger(depart);
const envoye = sandbox.donneesLocales();
if (envoye[P + 'zoom'] || envoye[P + 'collection']) echouer('le zoom et la collection choisie ne partent pas');
charger({
  [P + 'avent:1999-01-01']: ISO,
  [P + 'defi-fait:autre']: ISO,
  [P + 'cadre']: 'aucun',
  [P + 'niveau-vu']: '1',
  [P + 'reussi:ancienne']: ISO,
});
importerSauvegarde(envoye, true);
egal(sandbox.donneesLocales(), envoye, 'aller-retour : rien ne se perd, le reste de l\'appareil part');

// Sans « ecraser » (fichier, déménagement) : on ajoute, on ne remplace pas, on n'efface pas.
charger({ [P + 'cadre']: 'aucun', [P + 'niveau-vu']: '5', [P + 'avent:2025-12-01']: ISO });
importerSauvegarde({
  [P + 'cadre']: 'or',
  [P + 'niveau-vu']: '9',
  [P + 'avent:2025-12-04']: ISO,
  [P + 'defi-fait:plantes']: ISO,
}, false);
egal(etat(), {
  [P + 'avent:2025-12-01']: ISO,
  [P + 'avent:2025-12-04']: ISO,
  [P + 'cadre']: 'aucun',
  [P + 'defi-fait:plantes']: ISO,
  [P + 'niveau-vu']: '5',
}, 'sans ecraser : rien n\'est remplacé ni effacé');

console.log('✓ importerSauvegarde : étoiles, défis, cadre et niveau-vu survivent à la synchro');
