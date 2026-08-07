// Croatia tour PWA service worker. Caches the app shell + tour data so the
// installed home-screen version works offline. Photos cache lazily as the user
// views them. Bump CACHE_VERSION whenever bundle.js/css or the vendor list change in
// a way that needs an immediate refresh.

const CACHE_VERSION = 'dcc-tour-v79';
const SHELL = [
  './',
  'index.html',
  'bundle.js',
  'bundle.css',
  'trip.json',
  'manifest.webmanifest',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'vendor/leaflet-heat.js',
  // self-hosted Classical fonts (Cormorant Garamond + Lora) — cached so the
  // editorial type survives offline and never hits a CDN
  'vendor/fonts/cormorant-600-latin.woff2',
  'vendor/fonts/cormorant-600-latinext.woff2',
  'vendor/fonts/cinzel-latin.woff2',
  'vendor/fonts/cinzel-latinext.woff2',
  'vendor/fonts/lora-400-latin.woff2',
  'vendor/fonts/lora-400-latinext.woff2',
  'vendor/fonts/lora-italic-400-latin.woff2',
  'vendor/fonts/lora-italic-400-latinext.woff2',
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

  // Network-first for the app shell (navigations + HTML/JS/CSS/manifest) and JSON,
  // so code + data updates appear as soon as you're online — no more stale cached
  // UI after "clear cache" fails to evict the service worker. Falls back to cache
  // when offline. (Previously the shell was cache-first, which pinned old builds.)
  const shell = req.mode === 'navigate' || /\.(?:html|js|css|webmanifest|json)(?:$|\?)/.test(req.url);
  if (shell) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
    );
    return;
  }

  // Cache-first for heavy immutable assets (photos, fonts, vendor libs) — fast + offline.
  event.respondWith(
    caches.match(req).then(cached => cached ||
      fetch(req).then(res => {
        if (res.ok && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error())
    )
  );
});
