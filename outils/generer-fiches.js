// Génère les fiches PDF (élève et corrigé) de chaque collection dans « fiche à imprimer/ ».
// Usage : npm install   puis   npm run fiches      (nécessite Google Chrome)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright-core');

const racine = path.resolve(__dirname, '..');
const sortie = path.join(racine, 'fiche à imprimer');
const source = 'file://' + path.join(__dirname, 'fiches.html');

// Lit la liste des collections dans app/collections.js
const bac = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(racine, 'app', 'collections.js'), 'utf8'), bac);
const collections = bac.window.COLLECTIONS;

(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const navigateur = await chromium.launch({ channel: 'chrome' });
  const page = await navigateur.newPage();
  for (const c of collections) {
    for (const [version, libelle] of [['eleve', 'fiche élève'], ['corrige', 'corrigé']]) {
      await page.goto(`${source}?collection=${encodeURIComponent(c.id)}&version=${version}`);
      await page.waitForSelector('body[data-pret="1"]');
      const fichier = path.join(sortie, `${c.nom} - ${libelle}.pdf`);
      await page.pdf({ path: fichier, preferCSSPageSize: true, printBackground: true });
      console.log('✓', path.relative(racine, fichier));
    }
  }
  await navigateur.close();
})();
