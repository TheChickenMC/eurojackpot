// Die Browser-Version gibt es nicht mehr. Dieser Service Worker ersetzt den alten: Er löscht alle gespeicherten
// Dateien, meldet sich ab und lädt offene Fenster neu – danach zeigen sie die Download-Seite.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    await self.registration.unregister();
    for (const fenster of await self.clients.matchAll({ type: 'window' })) fenster.navigate(fenster.url).catch(() => {});
  })());
});
