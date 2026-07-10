// Croatia trip — day-by-day archive. Reads trip.json (a flat list of every
// photo/video/clip, each with its OWN place label + timestamp, grouped into
// days). Primary view is the day-by-day story; a secondary map shows where that
// day's shots were taken, with dynamic clustering. Works standalone (static
// host) and embedded in the WordPress/Elementor loader. Vanilla JS, no build.

(function () {
  'use strict';

  const scriptEl = document.currentScript ||
                   [...document.scripts].find(s => /bundle\.js(?:\?|$)/.test(s.src));
  const baseURL = scriptEl ? new URL('./', scriptEl.src).href : './';
  const root = document.getElementById('dcc-tour') || document.querySelector('.dcc-tour-root');
  if (!root) { console.warn('[dcc-tour] no mount element'); return; }

  let map = null, clusterGroup = null;
  let DATA = null, curDay = 0;
  let lightboxFulls = [], lightboxIdx = -1;
  const markersByPlace = {};

  fetch(baseURL + 'trip.json').then(r => r.json()).then(data => {
    DATA = data;
    buildShell();
    initMap();
    selectDay(0);
  }).catch(err => {
    console.error('[dcc-tour] load failed', err);
    root.innerHTML = '<div class="dcc-tour-placeholder">Tour data could not be loaded.</div>';
  });

  // ---- layout ----
  function buildShell() {
    const t = DATA.trip || {};
    root.innerHTML = '';
    root.classList.add('dcc-tour-flat');
    const header = el('header', 'dcc-tour-header',
      '<h1 class="dcc-tour-title">' + escapeHtml(t.name || 'Our trip') + '</h1>' +
      '<p class="dcc-tour-subtitle">' + escapeHtml(t.subtitle || '') + '</p>' +
      tripStatsHTML());
    const nav = el('nav', 'dcc-tour-daynav');
    nav.setAttribute('aria-label', 'Days');
    DATA.days.forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'dcc-tour-daychip';
      b.dataset.day = i;
      b.innerHTML = '<span class="d-n">Day ' + d.index + '</span>' +
                    '<span class="d-d">' + escapeHtml(d.short) + '</span>' +
                    '<span class="d-c">' + d.count + '</span>';
      b.addEventListener('click', () => selectDay(i));
      nav.appendChild(b);
    });
    const body = el('div', 'dcc-tour-body');
    const story = el('section', 'dcc-tour-story');
    story.setAttribute('aria-live', 'polite');
    const mapwrap = el('aside', 'dcc-tour-mapwrap');
    const mapdiv = document.createElement('div');
    mapdiv.className = 'dcc-tour-map';
    mapdiv.setAttribute('role', 'application');
    mapdiv.setAttribute('aria-label', 'Map of the day');
    mapwrap.appendChild(mapdiv);
    body.appendChild(story); body.appendChild(mapwrap);
    const overview = el('div', 'dcc-tour-overview', overviewHTML());
    root.appendChild(header); root.appendChild(nav); root.appendChild(overview); root.appendChild(body);
    root._story = story; root._mapdiv = mapdiv; root._nav = nav;
    overview.querySelectorAll('.tread').forEach(r =>
      r.addEventListener('click', () => selectDay(+r.getAttribute('data-day'))));
  }

  function fmt(n) { return Math.round(n).toLocaleString(); }
  function tripStatsHTML() {
    const h = DATA.health; if (!h) return '';
    const srd = (h.climb_m / 412).toFixed(1);       // Mount Srđ = 412 m
    const eiffel = (h.climb_m / 330).toFixed(1);    // Eiffel Tower = 330 m
    return '<div class="dcc-tour-tripstats">' +
      tile(fmt(h.steps), 'steps', h.watch) +
      tile(h.dist + ' ' + (h.dist_unit || ''), 'walked', 'across ' + DATA.day_count + ' days') +
      tile('≈' + fmt(h.flights) + ' flights', 'climbed', 'like Mount Srđ ×' + srd + ' · Eiffel ×' + eiffel) +
      '</div>';
  }
  function tile(big, label, sub) {
    return '<div class="dcc-tour-tile"><span class="t-big">' + escapeHtml(big) + '</span>' +
      '<span class="t-lab">' + escapeHtml(label) + '</span>' +
      (sub ? '<span class="t-sub">' + escapeHtml(sub) + '</span>' : '') + '</div>';
  }
  function healthRibbonHTML(h) {
    if (!h) return '';
    const bits = [];
    if (h.steps) bits.push('<b>' + fmt(h.steps) + '</b> steps');
    if (h.dist) bits.push('<b>' + h.dist + '</b> ' + (DATA.health.dist_unit || ''));
    if (h.climb_m) bits.push('climbed <b>' + fmt(h.climb_m) + ' m</b>');
    if (h.alt_max != null) bits.push('up to <b>' + h.alt_max + ' m</b>');
    return bits.length ? '<p class="dcc-tour-health">' + bits.join(' &nbsp;·&nbsp; ') + '</p>' : '';
  }

  // ---- #3 signature climbs + #4 trip staircase ----
  function overviewHTML() {
    let html = '';
    const sc = DATA.signature_climbs || [];
    if (sc.length) {
      html += '<div class="dcc-tour-climbs"><span class="lab">Signature climbs</span>' +
        sc.map(c => '<span class="climb">' + escapeHtml(c.emoji) + ' ' + escapeHtml(c.name) +
          ' <b>' + c.max_alt + ' m</b></span>').join('') + '</div>';
    }
    html += staircaseHTML();
    return html;
  }
  function staircaseHTML() {
    const days = DATA.days, W = 900, H = 92, pad = 4;
    let cum = 0; const cums = days.map(d => (cum += (d.health && d.health.climb_m) || 0));
    const total = cum || 1;
    const bw = (W - pad * 2) / days.length;
    let steps = '', hit = '';
    days.forEach((d, i) => {
      const y0 = i ? cums[i-1] : 0, y1 = cums[i];
      const x = pad + i * bw;
      const yA = H - (y0 / total) * (H - 14), yB = H - (y1 / total) * (H - 14);
      steps += '<rect class="tread" x="' + x.toFixed(1) + '" y="' + yB.toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + (H - yB).toFixed(1) + '" data-day="' + i + '"></rect>';
      steps += '<line x1="' + x.toFixed(1) + '" y1="' + yB.toFixed(1) + '" x2="' + (x+bw).toFixed(1) +
        '" y2="' + yB.toFixed(1) + '" class="riser"/>';
    });
    return '<div class="dcc-tour-stair"><div class="cap">Climb over the trip · tap a step for that day · ' +
      Math.round(total) + ' m total</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="stair-svg">' + steps + hit + '</svg></div>';
  }
  function interp(curve, minute) {   // cumulative value at minute-of-day
    if (!curve || !curve.length) return null;
    if (minute <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) {
      if (minute <= curve[i][0]) return curve[i-1][1];
    }
    return curve[curve.length-1][1];
  }
  function cumClimb(elev, minute) {  // positive gain up to minute
    if (!elev) return 0; let c = 0, prev = null;
    for (const [m, a] of elev) { if (m > minute) break; if (prev != null && a - prev >= 5) c += a - prev; prev = a; }
    return Math.round(c);
  }
  // #6 elevation sparkline with a peak marker
  function elevSparkHTML(elev) {
    if (!elev || elev.length < 2) return '';
    const W = 320, H = 46, pad = 3;
    const xs = elev.map(p => p[0]), ys = elev.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), ymax = Math.max(...ys, 1);
    const X = m => pad + (x1 === x0 ? 0 : (m - x0) / (x1 - x0)) * (W - pad*2);
    const Y = a => H - pad - (a / ymax) * (H - pad*2);
    let d = '', dots = '';
    elev.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1) + ' '; });
    const peak = elev[ys.indexOf(ymax)];
    dots = '<circle cx="' + X(peak[0]).toFixed(1) + '" cy="' + Y(peak[1]).toFixed(1) + '" r="3" class="peak"/>';
    const area = 'M' + X(x0).toFixed(1) + ' ' + H + ' ' + d.replace(/^M/, 'L') + 'L' + X(x1).toFixed(1) + ' ' + H + 'Z';
    return '<div class="dcc-tour-spark"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<path class="a" d="' + area + '"/><path class="l" d="' + d + '"/>' + dots + '</svg>' +
      '<span class="pk">peak ' + peak[1] + ' m</span></div>';
  }

  function initMap() {
    if (!window.L || !root._mapdiv) return;
    map = L.map(root._mapdiv, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    clusterGroup = L.markerClusterGroup
      ? L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true, showCoverageOnHover: false })
      : L.layerGroup();
    map.addLayer(clusterGroup);
  }

  // ---- day selection ----
  function selectDay(i) {
    if (!DATA || i < 0 || i >= DATA.days.length) return;
    if (typeof stopReplay === 'function') stopReplay();
    curDay = i;
    root._nav.querySelectorAll('.dcc-tour-daychip').forEach((b, j) =>
      b.classList.toggle('active', j === i));
    const ov = root.querySelector('.dcc-tour-overview');
    if (ov) ov.querySelectorAll('.tread').forEach((r, j) => r.classList.toggle('on', j === i));
    const active = root._nav.querySelector('.dcc-tour-daychip.active');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    renderDay(DATA.days[i]);
    showDayOnMap(DATA.days[i]);
  }

  function renderDay(day) {
    const story = root._story;
    lightboxFulls = []; lightboxIdx = -1;
    for (const k in markersByPlace) delete markersByPlace[k];

    let html = '<div class="dcc-tour-dayhead">' +
      '<div class="dcc-tour-daynum">Day ' + day.index + ' / ' + DATA.day_count + '</div>' +
      '<h2>' + escapeHtml(day.label) + '</h2>' +
      (day.area ? '<p class="dcc-tour-area">' + escapeHtml(day.area) + '</p>' : '') +
      (day.story ? '<p class="dcc-tour-daystory">' + escapeHtml(day.story) + '</p>' : '') +
      '<p class="dcc-tour-daymeta">' + day.count + ' items · ' +
        day.kinds.photo + ' photos · ' + day.kinds.video + ' videos · ' + day.kinds.clip + ' clips</p>' +
      healthRibbonHTML(day.health) +
      (day.health && day.health.elev ? elevSparkHTML(day.health.elev) : '') +
      (day.health && (day.health.stepcurve || day.health.elev) ?
        '<button class="dcc-tour-chip dcc-tour-replay" id="dcc-replay">▶ Replay this day</button>' : '') +
      '</div>';

    const toMin = t => { const a = (t || '').split(':'); return a.length === 2 ? +a[0]*60 + +a[1] : null; };
    day.places.forEach((p, pi) => {
      const anchor = 'place-' + pi;
      const time = p.from === p.to ? p.from : (p.from + '–' + p.to);
      let cum = '';
      const mn = toMin(p.from);
      if (mn != null && day.health) {
        const st = interp(day.health.stepcurve, mn), cl = cumClimb(day.health.elev, mn);
        const bits = [];
        if (st != null) bits.push('≈' + fmt(st) + ' steps');
        if (cl) bits.push('↑' + cl + ' m');
        if (bits.length) cum = '<span class="dcc-tour-place-cum">' + bits.join(' · ') + ' by now</span>';
      }
      html += '<section class="dcc-tour-place" id="' + anchor + '">' +
        '<div class="dcc-tour-place-head">' +
          '<h3>' + escapeHtml(p.name) + '</h3>' +
          '<span class="dcc-tour-place-meta">' + escapeHtml(time) + ' · ' + p.count + cum + '</span>' +
        '</div>' +
        '<div class="dcc-tour-media">' + p.items.map(renderItem).join('') + '</div>' +
        '</section>';
    });

    html += '<div class="dcc-tour-daynavbtns">' +
      (curDay > 0 ? '<button class="dcc-tour-chip" id="dcc-prev">← ' + escapeHtml(DATA.days[curDay-1].short) + '</button>' : '<span></span>') +
      (curDay < DATA.day_count-1 ? '<button class="dcc-tour-chip" id="dcc-next">' + escapeHtml(DATA.days[curDay+1].short) + ' →</button>' : '<span></span>') +
      '</div>';

    story.innerHTML = html;
    story.scrollTop = 0;
    const prev = story.querySelector('#dcc-prev'), next = story.querySelector('#dcc-next');
    if (prev) prev.addEventListener('click', () => selectDay(curDay - 1));
    if (next) next.addEventListener('click', () => selectDay(curDay + 1));
    const rb = story.querySelector('#dcc-replay');
    if (rb) rb.addEventListener('click', () => startReplay(day));
  }

  // ---- #10 replay the day ----
  let replayTimer = null;
  function stopReplay() {
    if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
    const h = document.getElementById('dcc-hud'); if (h) h.remove();
    if (root._story) root._story.querySelectorAll('.replay-on').forEach(s => s.classList.remove('replay-on'));
  }
  function startReplay(day) {
    stopReplay();
    const places = day.places.filter(p => p.lat != null);
    if (!places.length || !map) return;
    const hud = document.createElement('div');
    hud.id = 'dcc-hud'; hud.className = 'dcc-tour-hud';
    hud.innerHTML = '<div class="hud-row"><b id="hud-time"></b><button id="hud-stop" aria-label="Stop">✕</button></div>' +
      '<div id="hud-place"></div><div class="hud-stats"><span id="hud-steps"></span><span id="hud-alt"></span></div>';
    root._mapdiv.parentNode.appendChild(hud);
    hud.querySelector('#hud-stop').addEventListener('click', stopReplay);
    let i = 0;
    const tick = () => {
      if (i >= places.length) { stopReplay(); return; }
      const p = places[i], pi = day.places.indexOf(p);
      map.flyTo([p.lat, p.lng], 16, { duration: 0.9 });
      root._story.querySelectorAll('.dcc-tour-place').forEach(s => s.classList.remove('replay-on'));
      const sec = root._story.querySelector('#place-' + pi);
      if (sec) { sec.classList.add('replay-on'); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      const mn = (p.from || '').split(':'), minute = mn.length === 2 ? +mn[0]*60 + +mn[1] : 0;
      const st = interp(day.health && day.health.stepcurve, minute);
      document.getElementById('hud-time').textContent = p.from;
      document.getElementById('hud-place').textContent = p.name;
      document.getElementById('hud-steps').textContent = st != null ? fmt(st) + ' steps' : '';
      document.getElementById('hud-alt').textContent = '↑' + cumClimb(day.health && day.health.elev, minute) + ' m';
      i++;
    };
    tick();
    replayTimer = setInterval(tick, 1700);
  }

  function renderItem(item) {
    if (item.type === 'drive') {
      return '<div class="dcc-tour-cell wide"><iframe loading="lazy" allowfullscreen allow="autoplay" ' +
        'src="https://drive.google.com/file/d/' + escapeAttr(item.id) + '/preview"></iframe>' + cap(item) + '</div>';
    }
    if (item.type === 'self_hosted') {
      if (!item.url && item.poster)
        return '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(resolveUrl(item.poster)) + '" alt="video" style="opacity:.85" />' + cap(item) + '</div>';
      if (!item.url) return '';
      const poster = item.poster ? ' poster="' + escapeAttr(resolveUrl(item.poster)) + '"' : '';
      return '<div class="dcc-tour-cell wide"><video src="' + escapeAttr(resolveUrl(item.url)) + '"' + poster +
             ' controls preload="none"></video>' + cap(item) + '</div>';
    }
    // photo
    const full = item.full ? ' data-full="' + escapeAttr(resolveUrl(item.full)) + '"' : '';
    if (item.full) lightboxFulls.push(resolveUrl(item.full));
    return '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(resolveUrl(item.src || item.full)) + '" alt=""' + full + ' />' + cap(item) + '</div>';
  }
  function cap(item) {
    const alt = item.alt != null ? ' · ' + item.alt + ' m' : '';
    return '<span class="dcc-tour-cell-time">' + escapeHtml((item.time || '') + alt) + '</span>';
  }

  // ---- map ----
  function showDayOnMap(day) {
    if (!map || !clusterGroup) return;
    clusterGroup.clearLayers();
    const pts = [];
    day.places.forEach((p, pi) => {
      if (p.lat == null) return;
      const m = L.marker([p.lat, p.lng], { title: p.name });
      m.on('click', () => {
        const sec = root._story.querySelector('#place-' + pi);
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      clusterGroup.addLayer(m);
      markersByPlace[pi] = m;
      pts.push([p.lat, p.lng]);
    });
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: false });
    else map.setView([42.64, 18.11], 11);
    setTimeout(() => map.invalidateSize(), 60);
  }

  function resolveUrl(p) {
    if (!p) return '';
    if (/^https?:/i.test(p)) return p;
    return baseURL + p.replace(/^\.?\//, '');
  }
  function el(tag, cls, html) {
    const e = document.createElement(tag); e.className = cls;
    if (html != null) e.innerHTML = html; return e;
  }

  // ===== Lightbox (photos) =====
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
