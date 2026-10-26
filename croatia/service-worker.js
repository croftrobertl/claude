// Croatia tour PWA service worker. Caches the app shell + tour data so the
// installed home-screen version works offline. Photos cache lazily as the user
// views them. Bump CACHE_VERSION whenever bundle.js/css or the vendor list change in
// a way that needs an immediate refresh.

const CACHE_VERSION = 'dcc-tour-v97';
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
  // History tab (component + data). The 60-second film is deliberately NOT here:
  // video streams natively and is never cached.
  'history/history.js',
  'history/history.css',
  'history/history-data.json',
  'history/chronicle.json',
  'history/street.json',
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

// Photos, fonts and other cache-first assets live in their own cache that survives
// version bumps (a new CACHE_VERSION used to wipe every photo saved for offline).
const MEDIA_CACHE = 'dcc-tour-media';
const SHELL_RE = /\.(?:html|js|css|webmanifest|json)(?:$|\?)/;

// Install fetches every shell file on its own. A file that fails (flaky mobile network)
// keeps its last good copy from the previous version, so offline never ends up empty.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(SHELL.map(async p => {
      const req = new Request(p, { credentials: 'omit' });
      try {
        const res = await fetch(req, { cache: 'no-cache' });   // revalidates: an unchanged file is a cheap 304
        if (!res.ok) throw new Error(res.status);
        await cache.put(req, res);
      } catch (e) {
        const old = await caches.match(req);
        if (old) await cache.put(req, old);
      }
    }));
    await self.skipWaiting();
  })());
});

// Old version caches go. One that still holds photos (saved before the media cache existed) is
// kept and only pruned of its out-of-date app files — copying hundreds of photos here would hold
// up every request until it finished. caches.match() still finds those photos.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k === CACHE_VERSION || k === MEDIA_CACHE) continue;
      const old = await caches.open(k), reqs = await old.keys();
      const media = reqs.filter(r => !(SHELL_RE.test(r.url) || r.url.endsWith('/')));
      if (!media.length) { await caches.delete(k); continue; }
      await Promise.all(reqs.filter(r => media.indexOf(r) < 0).map(r => old.delete(r)));
    }
    await self.clients.claim();
  })());
});

// Network-first that gives up after `ms` when a saved copy exists (the fetch still finishes
// and refreshes the cache); with no saved copy it simply waits for the network.
function networkFirst(req, ms) {
  const net = fetch(req).then(res => {
    if (res.ok && req.url.startsWith(self.location.origin)) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, copy));
    }
    return res;
  });
  const saved = () => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const timer = ms ? setTimeout(() => saved().then(finish), ms) : 0;
    net.then(r => { clearTimeout(timer); finish(r); })
       .catch(() => { clearTimeout(timer); saved().then(m => { finish(m || Response.error()); }); });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never intercept VIDEO (or any Range request): let the browser stream natively
  // with proper HTTP Range support — the SW cache-first path can't store 206
  // partials and made playback slow/stuttery. Audio (the two theme mp3s) is small
  // and deliberately NOT bypassed, so it still caches lazily for offline music.
  if (/\.(?:mp4|m4v|mov|webm|ogv)(?:$|\?)/i.test(req.url) || req.headers.has('range')) return;

  // Network-first for the app shell (navigations + HTML/JS/CSS/manifest) and JSON,
  // so code + data updates appear as soon as you're online. Data JSON (the trip and the
  // history map, the big files) falls back to its saved copy after 4 s on a slow network.
  if (req.mode === 'navigate' || SHELL_RE.test(req.url)) {
    event.respondWith(networkFirst(req, /\.json(?:$|\?)/.test(req.url) ? 4000 : 0));
    return;
  }

  // Cache-first for heavy immutable assets (photos, fonts, vendor libs) — fast + offline.
  event.respondWith(
    caches.match(req).then(cached => cached ||
      fetch(req).then(res => {
        if (res.ok && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(MEDIA_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error())
    )
  );
});
