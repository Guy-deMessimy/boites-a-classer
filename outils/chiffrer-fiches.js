// Chiffre les fiches de « fiche à imprimer/ » dans site/enseignant/ pour l'espace enseignant du site.
// Le code d'accès sert de clé : il n'est écrit nulle part, ni dans le site ni dans le dépôt.
// Usage : npm run chiffrer   (le code est demandé ; ou CODE=... npm run chiffrer)
// Format : index.bin = sel (16 o) + iv (12 o) + liste chiffrée ; chaque .bin = iv (12 o) + PDF chiffré (AES-GCM).
// Doit rester accordé avec le déchiffrement de site/index.html (PBKDF2-SHA-256, ITERATIONS).
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { subtle } = globalThis.crypto;
const getRandomValues = (t) => globalThis.crypto.getRandomValues(t);

const ITERATIONS = 600000;
const racine = path.join(__dirname, '..');
const source = path.join(racine, 'fiche à imprimer');
const sortie = path.join(racine, 'site', 'enseignant');

function demanderCode() {
  if (process.env.CODE) return Promise.resolve(process.env.CODE);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((ok) => rl.question('Code d’accès enseignant : ', (r) => { rl.close(); ok(r.trim()); }));
}

function slug(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function chiffrer(cle, donnees) {
  const iv = getRandomValues(new Uint8Array(12));
  const chiffre = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, cle, donnees));
  return Buffer.concat([iv, chiffre]);
}

(async () => {
  const code = await demanderCode();
  if (!code) throw new Error('Code vide.');

  const sel = getRandomValues(new Uint8Array(16));
  const base = await subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  const cle = await subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);

  fs.rmSync(sortie, { recursive: true, force: true });
  fs.mkdirSync(sortie, { recursive: true });

  // Regroupe « <collection> - fiche élève.pdf » et « <collection> - corrigé.pdf ».
  const collections = new Map();
  for (const nom of fs.readdirSync(source).filter((f) => f.endsWith('.pdf')).sort()) {
    const m = nom.normalize('NFC').match(/^(.*) - (fiche élève|corrigé)\.pdf$/);
    if (!m) continue;
    const type = m[2] === 'corrigé' ? 'corrige' : 'eleve';
    const fichier = `${slug(m[1])}-${type}.bin`;
    fs.writeFileSync(path.join(sortie, fichier), await chiffrer(cle, fs.readFileSync(path.join(source, nom))));
    if (!collections.has(m[1])) collections.set(m[1], { titre: m[1] });
    collections.get(m[1])[type] = { fichier, nom: m[0] };
  }

  const liste = [...collections.values()];
  const index = await chiffrer(cle, new TextEncoder().encode(JSON.stringify(liste)));
  fs.writeFileSync(path.join(sortie, 'index.bin'), Buffer.concat([sel, index]));
  console.log(`${liste.length} collections chiffrées dans site/enseignant/`);
})().catch((e) => { console.error(e.message); process.exit(1); });
