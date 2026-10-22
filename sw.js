// Offline support. Every app file is downloaded into a cache named after VERSION when this worker
// installs, and the app is then served ONLY from that cache. An update therefore arrives
// all-or-nothing: old and new files are never mixed, which would break the ES module imports.
//
// RELEASE RULE: bump VERSION whenever any app file changes. The browser only notices an update
// when sw.js itself changes. New files must also be added to SHELL.
// The update downloads in the background and is used from the next launch after that.
const VERSION = 'v5';
const CACHE = `solitaire-${VERSION}`;
const SHELL = [
  './',
  './preview.html',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/game.js',
  './js/celebrate.js',
  './js/choreography.js',
  './js/celebration-geometry.js',
  './js/celebration-stage.js',
  './js/dancer.js',
  './js/dancer-cards.js',
  './js/dancer-figure.js',
  './js/dancer-motion.js',
  './vendor/three.module.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the browser's HTTP cache so we never store a stale copy.
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return fetch(req);
  })());
});
