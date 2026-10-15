// Service Worker: hält die App offline bereit. Die Seite selbst kommt aus dem Speicher (schnell, auch ohne Netz) und wird
// bei jeder neuen Version komplett ersetzt; die Ziehungen holt er zuerst aus dem Netz und nur ohne Netz aus dem Speicher.
const VERSION = '2.11';
const SPEICHER = 'eurojackpot-' + VERSION;
const DATEIEN = ['./', 'index.html', 'app.css', 'app.js', 'rechner.js', 'rechner-kern.js', 'manifest.webmanifest',
  'symbol-180.png', 'symbol-192.png', 'symbol-512.png', 'symbol-maskiert-512.png', 'ziehungen.csv'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SPEICHER).then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n.startsWith('eurojackpot-') && n !== SPEICHER).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'jetzt') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // KI-Anbieter usw. gehen direkt
  if (url.pathname.endsWith('/ziehungen.csv')) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
      if (r.ok) {
        const kopie = r.clone();
        caches.open(SPEICHER).then((c) => c.put('ziehungen.csv', kopie));
      }
      return r;
    }).catch(() => caches.match('ziehungen.csv', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
