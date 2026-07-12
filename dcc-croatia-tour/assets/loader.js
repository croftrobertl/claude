/*!
 * DCC Croatia Tour — WP loader
 * Finds every .dcc-tour-root on the page, reads its data-dcc-tour-config bundleUrl,
 * and pulls Leaflet + the standalone bundle.js / bundle.css from that origin so the
 * same app renders inside WordPress and at the GitHub Pages standalone URL.
 */
(function () {
  'use strict';

  const loadedBundles = new Set();

  function mount(root) {
    if (root.dataset.dccTourMounted === '1') return;
    root.dataset.dccTourMounted = '1';

    let cfg = {};
    try { cfg = JSON.parse(root.dataset.dccTourConfig || '{}'); } catch (e) {}
    const bundleUrl = (cfg.bundleUrl || '').replace(/\/?$/, '/');
    if (!bundleUrl) {
      root.innerHTML = '<div class="dcc-tour-placeholder">Tour bundle URL not configured.</div>';
      return;
    }

    // The bundle expects to find its mount via #dcc-tour or .dcc-tour-root. The WP
    // shell only sets the class, not the id — bundle.js handles both.
    // Everything (incl. Leaflet + plugins) loads from the bundle's own vendor/
    // folder so the widget is self-contained and survives a private-hosting move.
    Promise.all([
      loadCSS(bundleUrl + 'bundle.css'),
      loadCSS(bundleUrl + 'vendor/leaflet.css'),
      loadJS(bundleUrl + 'vendor/leaflet.js'),
    ]).then(() =>
      loadJS(bundleUrl + 'vendor/leaflet-heat.js')   // needs L — load after leaflet.js
    ).then(() => {
      // bundle.js mounts into the first .dcc-tour-root once, on script load. Loading it
      // a second time would double-mount, so guard per bundleUrl. Known limitation: only
      // one tour instance per page — fine for a single-page family site.
      if (loadedBundles.has(bundleUrl)) return;
      loadedBundles.add(bundleUrl);
      return loadJS(bundleUrl + 'bundle.js');
    }).catch(err => {
      console.error('[dcc-tour] failed to load bundle from', bundleUrl, err);
      root.innerHTML = '<div class="dcc-tour-placeholder">Tour could not be loaded.</div>';
    });
  }

  function loadCSS(href) {
    return new Promise((resolve) => {
      if ([...document.styleSheets].some(s => s.href === href)) return resolve();
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }
  function loadJS(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src === src);
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', reject);
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function mountAll() {
    document.querySelectorAll('.dcc-tour-root').forEach(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
