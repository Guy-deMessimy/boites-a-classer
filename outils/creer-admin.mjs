// Crée un compte administrateur sur le site en ligne et affiche son mot de passe (tiré au hasard, écrit nulle part).
// Usage : node outils/creer-admin.mjs [identifiant]        (par défaut « admin »)
// Il faut avoir appliqué migrations/0003_admin.sql (--remote) et être relié à Cloudflare (npx wrangler login).
// Le compte est créé comme un compte normal (même dérivation du mot de passe que app/app.js), puis passé admin dans la base.
import { webcrypto as crypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SITE = 'https://boites-a-classer.pages.dev';
const identifiant = (process.argv[2] || 'admin').toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(identifiant)) throw new Error('identifiant invalide : ' + identifiant);

// 20 caractères sans caractères ambigus (0/O, 1/l/I), environ 115 bits.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const motDePasse = [...crypto.getRandomValues(new Uint8Array(20))].map((o) => ALPHABET[o % ALPHABET.length]).join('');

const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({
  name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: new TextEncoder().encode('boites-a-classer:compte:' + identifiant),
}, cle, 256);
const secret = Buffer.from(bits).toString('base64url');

const rep = await fetch(SITE + '/api/compte/inscription', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant, secret }),
});
if (rep.status !== 200) throw new Error(`création refusée (${rep.status}) : ${(await rep.json().catch(() => ({}))).erreur || ''}`);

execFileSync('npx', ['wrangler', 'd1', 'execute', 'boites-a-classer', '--remote',
  '--command', `UPDATE comptes SET admin = 1 WHERE identifiant = '${identifiant}'`], { stdio: 'ignore' });

console.log(`\nCompte administrateur créé sur ${SITE}\n  Identifiant  : ${identifiant}\n  Mot de passe : ${motDePasse}\n`
  + `\nSe connecter : ${SITE}/app/index.html#compte, puis 👤 → 🛠 Administration (${SITE}/admin/).\n`
  + 'Ce mot de passe n\'est enregistré nulle part : le noter maintenant (il peut être changé dans 👤 → Changer de mot de passe).\n');
