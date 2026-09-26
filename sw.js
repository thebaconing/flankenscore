/* Flankenscore – Service Worker für die Offline-Nutzung als Web-App (GitHub Pages / iPad).
 * Liefert sofort aus dem Cache und lädt im Hintergrund nach; Änderungen sind damit
 * beim nächsten Start aktiv. Bei neuen Dateien in APP_FILES die VERSION erhöhen. */
var VERSION = 'flankenscore-v2';
var APP_FILES = [
  './', 'index.html', 'css/style.css', 'js/logic.js', 'js/store.js', 'js/app.js',
  'regelwerk.html', 'manifest.webmanifest', 'assets/flankenscore-logo.svg',
  'assets/icons/apple-touch-icon.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(APP_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (cached) {
      var fresh = fetch(e.request).then(function (res) {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      });
      if (cached) { e.waitUntil(fresh.catch(function () { /* offline */ })); return cached; }
      return fresh;
    });
  }));
});
