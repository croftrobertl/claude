// Croatia trip — venue-level map app. Reads places.json (196 GPS venue
// clusters + narrative chapters), renders every place as a Leaflet marker in a
// clustering group so pins merge when zoomed out and break into individual
// venues as you zoom in. Clicking a place shows its photos/videos + the
// chapter's story in the side panel. Works standalone (GitHub Pages) and
// embedded in the WordPress loader. Vanilla JS, no build step.

(function () {
  'use strict';

  const scriptEl = document.currentScript ||
                   [...document.scripts].find(s => /bundle\.js(?:\?|$)/.test(s.src));
  const baseURL = scriptEl ? new URL('./', scriptEl.src).href : './';
  const root = document.getElementById('dcc-tour') || document.querySelector('.dcc-tour-root');
  if (!root) { console.warn('[dcc-tour] no mount element'); return; }

  const titleEl = root.querySelector('.dcc-tour-title');
  const subtitleEl = root.querySelector('.dcc-tour-subtitle');
  const panelEl = root.querySelector('.dcc-tour-panel') || root.querySelector('#dcc-tour-panel');
  const mapEl = root.querySelector('.dcc-tour-map') || root.querySelector('#dcc-tour-map');

  let map = null, clusterGroup = null;
  let chaptersById = {};
  let lightboxFulls = [], lightboxIdx = -1;

  fetch(baseURL + 'places.json').then(r => r.json()).then(data => {
    if (titleEl && data.trip) titleEl.textContent = data.trip.name || 'Trip';
    if (subtitleEl && data.trip) subtitleEl.textContent = data.trip.subtitle || '';
    (data.chapters || []).forEach(c => { chaptersById[c.id] = c; });
    initMap(data.places || []);
    renderIntro(data);
  }).catch(err => {
    console.error('[dcc-tour] load failed', err);
    if (panelEl) panelEl.innerHTML = '<div class="dcc-tour-placeholder">Tour data could not be loaded.</div>';
  });

  function initMap(places) {
    if (!window.L || !mapEl) return;
    map = L.map(mapEl, { scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    clusterGroup = L.markerClusterGroup
      ? L.markerClusterGroup({ maxClusterRadius: 45, spiderfyOnMaxZoom: true, showCoverageOnHover: false })
      : L.layerGroup();

    const latlngs = [];
    places.forEach(place => {
      const label = place.venue || (place.city + ' · a spot we stopped');
      const m = L.marker([place.lat, place.lng], { title: label });
      m.on('click', () => selectPlace(place));
      clusterGroup.addLayer(m);
      latlngs.push([place.lat, place.lng]);
    });
    map.addLayer(clusterGroup);
    if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs).pad(0.1));
    else map.setView([42.64, 18.11], 11);
  }

  function renderIntro(data) {
    if (!panelEl) return;
    const named = data.named_count || 0;
    const total = (data.places || []).length;
    const chapters = (data.chapters || []).filter(c => c.summary)
      .map(c => '<li><button class="dcc-tour-chip" data-chapter="' + escapeAttr(c.id) + '">' +
                escapeHtml(c.name) + '</button></li>').join('');
    panelEl.innerHTML =
      '<div class="dcc-tour-stop-card">' +
        '<h2>' + escapeHtml(data.trip ? data.trip.name : 'The trip') + '</h2>' +
        '<p class="dcc-tour-stop-subtitle">' + escapeHtml(data.trip ? data.trip.subtitle : '') + '</p>' +
        '<p>Tap any pin on the map to see the photos and videos taken there. ' +
        'Pins cluster when you zoom out and split into individual spots as you zoom in — ' +
        total + ' places in all. Jump to a chapter:</p>' +
        '<ul class="dcc-tour-chapters">' + chapters + '</ul>' +
      '</div>';
    panelEl.querySelectorAll('.dcc-tour-chip').forEach(btn => {
      btn.addEventListener('click', () => flyToChapter(btn.getAttribute('data-chapter')));
    });
  }

  function flyToChapter(id) {
    const c = chaptersById[id];
    if (c && c.geo && map) {
      map.flyTo(c.geo, 15, { duration: 0.8 });
      renderChapterCard(c);
    }
  }

  function renderChapterCard(c) {
    if (!panelEl) return;
    panelEl.innerHTML =
      '<article class="dcc-tour-stop-card">' +
        '<h2>' + escapeHtml(c.name) + '</h2>' +
        (c.subtitle ? '<p class="dcc-tour-stop-subtitle">' + escapeHtml(c.subtitle) + '</p>' : '') +
        (c.summary ? '<p>' + escapeHtml(c.summary) + '</p>' : '') +
        '<p class="dcc-tour-hint">Tap the pins in this area to open each spot’s photos.</p>' +
      '</article>';
  }

  function selectPlace(place) {
    if (!panelEl) return;
    if (map) map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    const ch = chaptersById[place.chapter];
    const heading = place.venue || (place.city || 'A stop on the trip');
    const sub = place.venue ? escapeHtml(place.city) : ('near ' + place.lat.toFixed(4) + ', ' + place.lng.toFixed(4));
    const chapterLine = ch ? '<p class="dcc-tour-chapter-tag">' + escapeHtml(ch.name) + '</p>' : '';
    const media = renderMedia(place.media || []);
    panelEl.innerHTML =
      '<article class="dcc-tour-stop-card">' +
        chapterLine +
        '<h2>' + escapeHtml(heading) + '</h2>' +
        '<p class="dcc-tour-stop-subtitle">' + sub + ' · ' + (place.count || 0) + ' item' + (place.count === 1 ? '' : 's') + '</p>' +
        media +
        '<p><button class="dcc-tour-chip" id="dcc-back">← Back to overview</button></p>' +
      '</article>';
    const back = panelEl.querySelector('#dcc-back');
    if (back) back.addEventListener('click', () => fetch(baseURL + 'places.json').then(r => r.json()).then(renderIntro));
  }

  function renderMedia(items) {
    lightboxFulls = items.filter(i => !i.type && (i.full || i.src)).map(i => resolveUrl(i.full || i.src));
    lightboxIdx = -1;
    if (!items.length) return '<div class="dcc-tour-placeholder" style="margin-top:1rem;">No media here.</div>';
    const html = items.map(item => {
      if (item.type === 'drive') {
        return '<iframe loading="lazy" allowfullscreen allow="autoplay" ' +
          'style="grid-column:1/-1;height:220px;border:0;border-radius:6px;" ' +
          'src="https://drive.google.com/file/d/' + escapeAttr(item.id) + '/preview"></iframe>';
      }
      if (item.type === 'youtube') {
        return '<iframe loading="lazy" allowfullscreen ' +
          'style="grid-column:1/-1;height:220px;border:0;border-radius:6px;" ' +
          'src="https://www.youtube-nocookie.com/embed/' + escapeAttr(item.id) + '"></iframe>';
      }
      if (item.type === 'self_hosted') {
        if (!item.url && item.poster) {
          return '<img loading="lazy" src="' + escapeAttr(resolveUrl(item.poster)) + '" alt="video preview" style="opacity:.85;" />';
        }
        if (!item.url) return '';
        const poster = item.poster ? ' poster="' + escapeAttr(resolveUrl(item.poster)) + '"' : '';
        return '<video src="' + escapeAttr(resolveUrl(item.url)) + '"' + poster +
               ' controls preload="metadata" style="grid-column:1/-1;height:auto;max-height:360px;background:#000;"></video>';
      }
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
  document.addEventListener('click', (e) => {
    const img = e.target.closest('.dcc-tour-media img[data-full]');
    if (!img) return;
    const idx = lightboxFulls.indexOf(img.getAttribute('data-full'));
    openLightbox(idx >= 0 ? idx : 0);
  });
  document.addEventListener('keydown', (e) => {
    if (lightboxIdx < 0) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') showLightbox(lightboxIdx + 1);
    else if (e.key === 'ArrowLeft') showLightbox(lightboxIdx - 1);
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
      if (e.target === el || e.target.classList.contains('dcc-tour-lightbox-close')) closeLightbox();
      else if (e.target.classList.contains('prev')) showLightbox(lightboxIdx - 1);
      else if (e.target.classList.contains('next')) showLightbox(lightboxIdx + 1);
    });
    document.body.appendChild(el);
    return el;
  }
  function openLightbox(idx) { if (lightboxFulls.length) { ensureLightboxEl(); showLightbox(idx); } }
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

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
