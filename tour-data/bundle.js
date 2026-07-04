// Croatia trip — vanilla-JS app. Mounts into #dcc-tour, fetches stops.json +
// media-manifest.json (paths resolved relative to the script's own URL), draws a
// Leaflet map with one pin per stop, and renders a side panel with the active stop.
// Works standalone at the GitHub Pages URL and embedded inside the WP plugin's div.

(function () {
  'use strict';

  // Resolve own base URL so the same bundle works at /tour-data/ AND when
  // injected into a WordPress page where document.baseURI is something else.
  const scriptEl = document.currentScript ||
                   [...document.scripts].find(s => /bundle\.js(?:\?|$)/.test(s.src));
  const baseURL = scriptEl ? new URL('./', scriptEl.src).href : './';
  const root = document.getElementById('dcc-tour') || document.querySelector('.dcc-tour-root');
  if (!root) { console.warn('[dcc-tour] no mount element found'); return; }

  const titleEl = root.querySelector('.dcc-tour-title');
  const subtitleEl = root.querySelector('.dcc-tour-subtitle');
  const panelEl = root.querySelector('.dcc-tour-panel') || root.querySelector('#dcc-tour-panel');
  const mapEl = root.querySelector('.dcc-tour-map') || root.querySelector('#dcc-tour-map');

  let map = null;
  let markers = {};
  let activeId = null;
  let mediaByStop = {};

  Promise.all([
    fetch(baseURL + 'stops.json').then(r => r.json()),
    fetch(baseURL + 'media-manifest.json').then(r => r.json()).catch(() => ({ by_stop: {} })),
  ]).then(([data, manifest]) => {
    mediaByStop = manifest.by_stop || {};
    if (titleEl && data.trip) titleEl.textContent = data.trip.name || 'Trip';
    if (subtitleEl && data.trip) subtitleEl.textContent = data.trip.subtitle || '';
    initMap(data.stops);
    if (data.stops && data.stops.length) selectStop(data.stops[0]);
  }).catch(err => {
    console.error('[dcc-tour] load failed', err);
    if (panelEl) {
      panelEl.innerHTML = '<div class="dcc-tour-placeholder">Tour data could not be loaded.</div>';
    }
  });

  function initMap(stops) {
    if (!window.L || !mapEl) return;
    // Filter to Croatia-area stops for default view; flight bookends are pinned but not framed.
    const croatiaStops = stops.filter(s => !s.is_bookend);
    const focusStops = croatiaStops.length ? croatiaStops : stops;

    map = L.map(mapEl, { scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const bounds = L.latLngBounds(focusStops.map(s => s.geo));
    map.fitBounds(bounds.pad(0.18));

    stops.forEach(stop => {
      const m = L.marker(stop.geo, { title: stop.name });
      m.addTo(map);
      m.on('click', () => selectStop(stop));
      markers[stop.id] = m;
    });
  }

  function selectStop(stop) {
    activeId = stop.id;
    Object.entries(markers).forEach(([id, m]) => {
      const icon = m._icon;
      if (icon) icon.classList.toggle('dcc-tour-pin-active', id === stop.id);
    });
    renderPanel(stop);
  }

  function renderPanel(stop) {
    if (!panelEl) return;
    const venues = (stop.venues || []).map(v => {
      const note = v.note ? ' — ' + escapeHtml(v.note) : '';
      return '<li>' + escapeHtml(v.name) + note + '</li>';
    }).join('');
    const dateLabel = formatDateRange(stop.date_start, stop.date_end);
    const media = renderMedia(stop.id);
    const ext = stop.external_url
      ? '<p><a href="' + escapeAttr(stop.external_url) + '" target="_blank" rel="noopener">More info →</a></p>'
      : '';

    panelEl.innerHTML =
      '<article class="dcc-tour-stop-card">' +
        '<h2>' + escapeHtml(stop.name) + '</h2>' +
        '<p class="dcc-tour-stop-subtitle">' + escapeHtml(stop.subtitle || '') +
        (dateLabel ? ' · ' + escapeHtml(dateLabel) : '') + '</p>' +
        (stop.summary ? '<p>' + escapeHtml(stop.summary) + '</p>' : '') +
        (venues ? '<ul class="dcc-tour-venues">' + venues + '</ul>' : '') +
        ext +
        media +
      '</article>';
  }

  // Lightbox state: list of full-size photo URLs currently in the active stop's panel,
  // plus the index being shown. We rebuild it whenever a stop renders.
  let lightboxFulls = [];
  let lightboxIdx = -1;

  function renderMedia(stopId) {
    const items = mediaByStop[stopId] || [];
    // Refresh the lightbox source list each time a stop renders.
    // Only untyped entries are photos; typed ones (self_hosted/drive/youtube) are videos.
    lightboxFulls = items
      .filter(i => !i.type && (i.full || i.src))
      .map(i => resolveUrl(i.full || i.src));
    lightboxIdx = -1;
    if (!items.length) {
      return '<div class="dcc-tour-placeholder" style="margin-top:1rem;">Photos coming soon.</div>';
    }
    const html = items.map(item => {
      if (item.type === 'youtube') {
        return '<iframe loading="lazy" allowfullscreen ' +
          'style="grid-column: 1 / -1; height:220px; border:0; border-radius:6px;" ' +
          'src="https://www.youtube-nocookie.com/embed/' + escapeAttr(item.id) + '"></iframe>';
      }
      if (item.type === 'drive') {
        // Google Drive's built-in player; the file must be shared "anyone with the link".
        return '<iframe loading="lazy" allowfullscreen allow="autoplay" ' +
          'style="grid-column: 1 / -1; height:220px; border:0; border-radius:6px;" ' +
          'src="https://drive.google.com/file/d/' + escapeAttr(item.id) + '/preview"></iframe>';
      }
      if (item.type === 'self_hosted') {
        // If url isn't yet linked (transitional state during media buildout),
        // degrade to the poster as a still image rather than a broken <video>.
        if (!item.url && item.poster) {
          return '<img loading="lazy" src="' + escapeAttr(resolveUrl(item.poster)) +
                 '" alt="video preview" style="opacity:0.85;" />';
        }
        if (!item.url) return '';
        const poster = item.poster ? ' poster="' + escapeAttr(resolveUrl(item.poster)) + '"' : '';
        return '<video src="' + escapeAttr(resolveUrl(item.url)) + '"' + poster +
               ' controls preload="metadata" style="grid-column: 1 / -1; height:auto; max-height:360px; background:#000;"></video>';
      }
      // photo — src=thumb for the grid, full kept on data-full for future lightbox
      const src = item.src || item.url;
      const full = item.full ? ' data-full="' + escapeAttr(resolveUrl(item.full)) + '"' : '';
      return '<img loading="lazy" src="' + escapeAttr(resolveUrl(src)) + '" alt=""' + full + ' />';
    }).join('');
    return '<div class="dcc-tour-media">' + html + '</div>';
  }

  function resolveUrl(p) {
    if (/^https?:/i.test(p)) return p;
    return baseURL + p.replace(/^\.?\//, '');
  }

  // ===== Lightbox =====
  // Delegated click handler: any <img> with data-full inside the panel opens the lightbox.
  document.addEventListener('click', (e) => {
    const img = e.target.closest('.dcc-tour-media img[data-full]');
    if (!img) return;
    const url = img.getAttribute('data-full');
    const idx = lightboxFulls.indexOf(url);
    openLightbox(idx >= 0 ? idx : 0);
  });
  document.addEventListener('keydown', (e) => {
    if (lightboxIdx < 0) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') showLightbox(lightboxIdx + 1);
    else if (e.key === 'ArrowLeft')  showLightbox(lightboxIdx - 1);
  });

  function ensureLightboxEl() {
    let el = document.getElementById('dcc-tour-lightbox');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'dcc-tour-lightbox';
    el.className = 'dcc-tour-lightbox';
    el.innerHTML =
      '<button class="dcc-tour-lightbox-close" aria-label="Close">&times;</button>' +
      '<button class="dcc-tour-lightbox-nav prev" aria-label="Previous">&#8249;</button>' +
      '<img class="dcc-tour-lightbox-img" alt="" />' +
      '<button class="dcc-tour-lightbox-nav next" aria-label="Next">&#8250;</button>';
    el.addEventListener('click', (e) => {
      if (e.target === el) closeLightbox();
      else if (e.target.classList.contains('dcc-tour-lightbox-close')) closeLightbox();
      else if (e.target.classList.contains('prev')) showLightbox(lightboxIdx - 1);
      else if (e.target.classList.contains('next')) showLightbox(lightboxIdx + 1);
    });
    document.body.appendChild(el);
    return el;
  }
  function openLightbox(idx) {
    if (!lightboxFulls.length) return;
    ensureLightboxEl();
    showLightbox(idx);
  }
  function showLightbox(idx) {
    if (!lightboxFulls.length) return;
    const n = lightboxFulls.length;
    lightboxIdx = ((idx % n) + n) % n;
    const el = ensureLightboxEl();
    el.classList.add('open');
    el.querySelector('.dcc-tour-lightbox-img').src = lightboxFulls[lightboxIdx];
    document.body.classList.add('dcc-tour-noscroll');
  }
  function closeLightbox() {
    lightboxIdx = -1;
    const el = document.getElementById('dcc-tour-lightbox');
    if (el) el.classList.remove('open');
    document.body.classList.remove('dcc-tour-noscroll');
  }

  function formatDateRange(startISO, endISO) {
    if (!startISO) return '';
    const s = new Date(startISO), e = endISO ? new Date(endISO) : null;
    const opts = { month: 'short', day: 'numeric' };
    if (!e || sameDay(s, e)) return s.toLocaleDateString(undefined, opts);
    return s.toLocaleDateString(undefined, opts) + ' – ' + e.toLocaleDateString(undefined, opts);
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
