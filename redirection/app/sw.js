// Ancien service worker de la version installable : il s'efface, avec son cache, pour laisser place à la redirection.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.map((k) => caches.delete(k))))
    .then(() => self.registration.unregister()));
});
