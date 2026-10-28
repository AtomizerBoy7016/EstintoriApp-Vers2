/* Service worker: dopo la prima apertura l'app funziona anche senza internet.
   Per pubblicare un aggiornamento basta cambiare il numero di VERSIONE. */
const VERSIONE = 'v2.0';
const PREFISSO = 'estintori-v2-';
const CACHE = PREFISSO + VERSIONE;
const FILE = ['./', './index.html', './style.css', './lib.js', './db.js', './app.js',
  './xlsx.full.min.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chiavi => Promise.all(chiavi.filter(k => k.startsWith(PREFISSO) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const rete = fetch(e.request).then(r => {
      if (r && r.ok && new URL(e.request.url).origin === location.origin)
        caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => hit);
    return hit || rete;
  }));
});
