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

  function renderMedia(stopId) {
    const items = mediaByStop[stopId] || [];
    if (!items.length) {
      return '<div class="dcc-tour-placeholder" style="margin-top:1rem;">Photos coming soon.</div>';
    }
    const html = items.map(item => {
      if (item.type === 'youtube') {
        return '<iframe loading="lazy" allowfullscreen ' +
          'style="grid-column: 1 / -1; height:220px; border:0; border-radius:6px;" ' +
          'src="https://www.youtube-nocookie.com/embed/' + escapeAttr(item.id) + '"></iframe>';
      }
      if (item.type === 'self_hosted') {
        return '<video src="' + escapeAttr(resolveUrl(item.url)) + '" controls preload="metadata"></video>';
      }
      // photo
      const src = item.src || item.url;
      return '<img loading="lazy" src="' + escapeAttr(resolveUrl(src)) + '" alt="" />';
    }).join('');
    return '<div class="dcc-tour-media">' + html + '</div>';
  }

  function resolveUrl(p) {
    if (/^https?:/i.test(p)) return p;
    return baseURL + p.replace(/^\.?\//, '');
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
