// Croatia tour PWA service worker. Caches the app shell + tour data so the
// installed home-screen version works offline. Photos cache lazily as the user
// views them. Bump CACHE_VERSION whenever bundle.js/css or stops.json change in
// a way that needs an immediate refresh.

const CACHE_VERSION = 'dcc-tour-v8';
const SHELL = [
  './',
  'index.html',
  'bundle.js',
  'bundle.css',
  'trip.json',
  'manifest.webmanifest',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'vendor/leaflet.markercluster.js',
  'vendor/MarkerCluster.css',
  'vendor/MarkerCluster.Default.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      cache.addAll(SHELL.map(p => new Request(p, { credentials: 'omit' })))
        .catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for JSON so updated stops/media show up quickly when online.
  if (/\.json($|\?)/.test(req.url)) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for everything else (shell + photos).
  event.respondWith(
    caches.match(req).then(cached => cached ||
      fetch(req).then(res => {
        if (res.ok && (req.url.startsWith(self.location.origin) || req.url.startsWith('https://unpkg.com/'))) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
