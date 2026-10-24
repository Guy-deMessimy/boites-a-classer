// Fabrique toutes les icônes à partir des deux dessins icone/icone.svg (carré arrondi) et icone/icone-plein.svg
// (fond à fond perdu, pour l'écran d'accueil d'iOS et les icônes « maskable » d'Android).
// Usage : node outils/icones.mjs   (Chrome installé ; iconutil de macOS pour icone.icns), puis ./build.sh.
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const RONDE = readFileSync('icone/icone.svg', 'utf8');
const PLEIN = readFileSync('icone/icone-plein.svg', 'utf8');
const nav = await chromium.launch({ channel: 'chrome' });
const page = await nav.newPage();

// Dessine le SVG dans un canvas de la taille voulue (plus net qu'une réduction d'un grand PNG).
async function png(svg, taille, sortie) {
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const donnees = await page.evaluate(async ([url, t]) => {
    const img = new Image(t, t); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = t;
    c.getContext('2d').drawImage(img, 0, 0, t, t);
    return c.toDataURL('image/png').split(',')[1];
  }, [url, taille]);
  writeFileSync(sortie, Buffer.from(donnees, 'base64'));
}

await png(RONDE, 1024, 'icone/icone-1024.png');
await png(RONDE, 256, 'icone/icone-256.png');
await png(RONDE, 256, 'app/icone.png');
await png(RONDE, 192, 'app/icone-192.png');
await png(RONDE, 512, 'app/icone-512.png');
await png(PLEIN, 180, 'app/icone-apple.png');
await png(PLEIN, 512, 'app/icone-maskable.png');

// Icône de l'app macOS : toutes les tailles d'un .iconset, assemblées par iconutil.
const jeu = join(tmpdir(), 'boites-a-classer.iconset');
rmSync(jeu, { recursive: true, force: true });
mkdirSync(jeu);
for (const t of [16, 32, 128, 256, 512]) {
  await png(RONDE, t, join(jeu, `icon_${t}x${t}.png`));
  await png(RONDE, t * 2, join(jeu, `icon_${t}x${t}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', jeu, '-o', 'icone/icone.icns']);
rmSync(jeu, { recursive: true, force: true });
await nav.close();
console.log('Icônes refaites : icone/ et app/ (lancer ./build.sh pour les copier dans site/).');
