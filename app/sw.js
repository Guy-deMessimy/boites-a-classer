// Garde le logiciel en cache pour qu'il fonctionne sans connexion une fois installé.
// Changer VERSION à chaque publication pour que les appareils récupèrent la nouvelle version.
const VERSION = 'boites-a-classer-3.8.0';
const FICHIERS = [
  './', './index.html', './style.css', './app.js', './collections.js', './manifest.webmanifest',
  './icone.png', './icone-apple.png', './icone-192.png', './icone-512.png', './icone-maskable.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord (pour avoir la dernière version), cache si hors connexion.
// « no-cache » oblige à revérifier auprès du serveur au lieu de reprendre une copie gardée par le navigateur.
self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  // L'API (sauvegarde en ligne, comptes) n'est jamais mise en cache : elle dépend de qui est connecté.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  ev.respondWith(fetch(req, { cache: 'no-cache' })
    .then((rep) => {
      if (rep.ok) { const copie = rep.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); }
      return rep;
    })
    .catch(() => caches.match(req, { ignoreSearch: true })));
});
