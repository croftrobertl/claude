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
      b.addEventListener('click', () => { setMode('story'); selectDay(i); });
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
    const controls = buildControls();
    const modeToggle = buildModeToggle();
    const mapmode = buildMapMode();
    root.appendChild(header); root.appendChild(modeToggle); root.appendChild(nav); root.appendChild(controls);
    root.appendChild(overview); root.appendChild(body); root.appendChild(mapmode);
    root._story = story; root._mapdiv = mapdiv; root._nav = nav; root._mapmode = mapmode;
    overview.querySelectorAll('.tread').forEach(r =>
      r.addEventListener('click', () => selectDay(+r.getAttribute('data-day'))));
    animateCounts(header);
  }

  // ---- #7/#10/#11 Map Mode: full-trip interactive map ----
  function dayColor(i) { return 'hsl(' + Math.round(i * 360 / Math.max(DATA.day_count, 1)) + ' 72% 45%)'; }
  let curMode = 'story';
  function setMode(m) {
    curMode = m;
    root.classList.toggle('dcc-tour-mapmode-on', m === 'map');
    root.querySelectorAll('.dcc-tour-modebtn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    if (m === 'map') initMapMode();
  }
  function buildModeToggle() {
    const w = el('div', 'dcc-tour-modes');
    w.innerHTML =
      '<button class="dcc-tour-modebtn active" data-mode="story">📖 Story</button>' +
      '<button class="dcc-tour-modebtn" data-mode="map">🗺 Map</button>';
    w.querySelectorAll('.dcc-tour-modebtn').forEach(b =>
      b.addEventListener('click', () => setMode(b.dataset.mode)));
    return w;
  }
  function buildMapMode() {
    const w = el('section', 'dcc-tour-mapmode');
    const legend = DATA.days.map((d, i) =>
      '<button class="dcc-tour-legchip" data-day="' + i + '"><span style="background:' + dayColor(i) + '"></span>' +
      escapeHtml(d.short) + '</button>').join('');
    w.innerHTML =
      '<div class="dcc-tour-mm-bar">' +
        '<label class="dcc-tour-mm-tog"><input type="checkbox" id="mm-path" checked> Path</label>' +
        '<label class="dcc-tour-mm-tog"><input type="checkbox" id="mm-heat"> Heatmap</label>' +
        '<button class="dcc-tour-chip" id="mm-boat">⛵ Play the Elaphiti boat day</button>' +
        '<span class="dcc-tour-mm-range"><span id="mm-range-lab"></span>' +
          '<input type="range" id="mm-lo" min="0" max="' + (DATA.day_count-1) + '" value="0">' +
          '<input type="range" id="mm-hi" min="0" max="' + (DATA.day_count-1) + '" value="' + (DATA.day_count-1) + '"></span>' +
      '</div>' +
      '<div class="dcc-tour-mm-wrap"><div class="dcc-tour-mm-map" id="dcc-mm-map"></div>' +
        '<aside class="dcc-tour-mm-side" id="dcc-mm-side" hidden></aside></div>' +
      '<div class="dcc-tour-mm-legend">' + legend + '</div>';
    return w;
  }
  let mmMap = null, mmMarkers = null, mmPathLayer = null, mmHeat = null, mmInit = false;
  let mmRange = [0, 0];
  function initMapMode() {
    if (mmInit) { setTimeout(() => mmMap.invalidateSize(), 60); return; }
    mmInit = true;
    mmRange = [0, DATA.day_count - 1];
    mmMap = L.map('dcc-mm-map', { scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mmMap);
    mmMarkers = L.layerGroup().addTo(mmMap);
    mmPathLayer = L.layerGroup().addTo(mmMap);
    const m = root._mapmode;
    m.querySelector('#mm-path').addEventListener('change', renderMapMode);
    m.querySelector('#mm-heat').addEventListener('change', renderMapMode);
    m.querySelector('#mm-boat').addEventListener('click', mmPlayBoat);
    const lo = m.querySelector('#mm-lo'), hi = m.querySelector('#mm-hi');
    const onSlide = () => {
      let a = +lo.value, b = +hi.value; if (a > b) { const t = a; a = b; b = t; }
      mmRange = [a, b]; renderMapMode();
    };
    lo.addEventListener('input', onSlide); hi.addEventListener('input', onSlide);
    m.querySelectorAll('.dcc-tour-legchip').forEach(c => c.addEventListener('click', () => {
      const di = +c.dataset.day; lo.value = di; hi.value = di; onSlide();
      const d = DATA.days[di]; if (d.places.some(p => p.lat != null)) fitToDays(di, di);
    }));
    // whole-trip bounds
    renderMapMode(true);
    setTimeout(() => mmMap.invalidateSize(), 80);
  }
  function daysInRange() {
    const out = [];
    for (let i = mmRange[0]; i <= mmRange[1]; i++) out.push(i);
    return out;
  }
  function fitToDays(a, b) {
    const pts = [];
    for (let i = a; i <= b; i++) DATA.days[i].places.forEach(p => { if (p.lat != null) pts.push([p.lat, p.lng]); });
    if (pts.length) mmMap.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: true });
  }
  function renderMapMode(fit) {
    if (!mmMap) return;
    mmMarkers.clearLayers(); mmPathLayer.clearLayers();
    const showPath = root._mapmode.querySelector('#mm-path').checked;
    const showHeat = root._mapmode.querySelector('#mm-heat').checked;
    const heatPts = [], allPts = [];
    root._mapmode.querySelector('#mm-range-lab').textContent =
      DATA.days[mmRange[0]].short + ' – ' + DATA.days[mmRange[1]].short;
    daysInRange().forEach(di => {
      const d = DATA.days[di], col = dayColor(di), line = [];
      d.places.forEach((p, pi) => {
        if (p.lat == null) return;
        allPts.push([p.lat, p.lng]); line.push([p.lat, p.lng]);
        const r = Math.min(20, 5 + Math.sqrt(p.count) * 1.6);
        const mk = L.circleMarker([p.lat, p.lng], { radius: r, color: '#fff', weight: 1.5, fillColor: col, fillOpacity: 0.85 });
        mk.bindTooltip(escapeHtml(p.name) + ' · ' + d.short, { direction: 'top' });
        mk.on('click', () => openMapSidebar(di, pi));
        mmMarkers.addLayer(mk);
        p.items.forEach(it => { if (it.lat != null) heatPts.push([it.lat, it.lng, 0.6]); });
      });
      if (showPath && line.length > 1)
        mmPathLayer.addLayer(L.polyline(line, { color: col, weight: 2.5, opacity: 0.7, dashArray: '4 5' }));
    });
    if (mmHeat) { mmMap.removeLayer(mmHeat); mmHeat = null; }
    if (showHeat && window.L && L.heatLayer)
      mmHeat = L.heatLayer(heatPts, { radius: 22, blur: 18, maxZoom: 15 }).addTo(mmMap);
    if (fit && allPts.length) mmMap.fitBounds(L.latLngBounds(allPts).pad(0.12), { animate: false });
  }
  function openMapSidebar(di, pi) {
    const d = DATA.days[di], p = d.places[pi];
    const side = root._mapmode.querySelector('#dcc-mm-side');
    lightboxFulls = []; const thumbs = [];
    p.items.forEach(it => {
      let img = null;
      if (it.full) { img = resolveUrl(it.src || it.full); lightboxFulls.push(resolveUrl(it.full)); thumbs.push('<img loading="lazy" src="' + escapeAttr(img) + '" data-full="' + escapeAttr(resolveUrl(it.full)) + '">'); }
      else if (it.poster) thumbs.push('<img loading="lazy" src="' + escapeAttr(resolveUrl(it.poster)) + '" style="opacity:.85">');
    });
    side.hidden = false;
    side.innerHTML = '<button class="dcc-tour-mm-close" aria-label="Close">&times;</button>' +
      '<h3>' + escapeHtml(p.name) + mapsLink(p.lat, p.lng, 'dcc-tour-maplink head') + '</h3>' +
      '<p class="dcc-tour-mm-meta">' + escapeHtml(d.label) + ' · ' + escapeHtml(p.from === p.to ? p.from : p.from + '–' + p.to) +
        ' · ' + p.count + ' shots</p>' +
      '<div class="dcc-tour-media dcc-tour-mm-grid">' + thumbs.join('') + '</div>' +
      '<button class="dcc-tour-chip" data-openday="' + di + '">Open this day in Story →</button>';
    side.querySelector('.dcc-tour-mm-close').addEventListener('click', () => { side.hidden = true; });
    side.querySelector('[data-openday]').addEventListener('click', () => { setMode('story'); selectDay(di); });
    mmMap.panTo([p.lat, p.lng], { animate: true });
  }
  function mmPlayBoat() {
    const di = DATA.days.findIndex(d => /elaphiti/i.test(d.area || '') || d.date === '2025-09-20');
    if (di < 0) return;
    const d = DATA.days[di];
    const seq = [];
    d.places.forEach((p, pi) => p.items.forEach(it => { if (it.lat != null) seq.push({ lat: it.lat, lng: it.lng, t: it.time, name: p.name, pi }); }));
    seq.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
    if (!seq.length) return;
    mmRange = [di, di]; root._mapmode.querySelector('#mm-lo').value = di; root._mapmode.querySelector('#mm-hi').value = di;
    renderMapMode();
    const trace = L.polyline([], { color: dayColor(di), weight: 4 }).addTo(mmPathLayer);
    const dot = L.circleMarker(seq[0], { radius: 8, color: '#fff', weight: 2, fillColor: dayColor(di), fillOpacity: 1 }).addTo(mmPathLayer);
    let i = 0;
    if (mmBoatTimer) clearInterval(mmBoatTimer);
    mmMap.setView([seq[0].lat, seq[0].lng], 12);
    mmBoatTimer = setInterval(() => {
      if (i >= seq.length) { clearInterval(mmBoatTimer); mmBoatTimer = null; return; }
      const s = seq[i]; trace.addLatLng([s.lat, s.lng]); dot.setLatLng([s.lat, s.lng]);
      dot.bindTooltip(escapeHtml(s.name) + ' · ' + escapeHtml(s.t || ''), { direction: 'top' }).openTooltip();
      mmMap.panTo([s.lat, s.lng], { animate: true, duration: 0.4 });
      i++;
    }, 550);
  }
  let mmBoatTimer = null;

  // ---- #6 date search + location filter ----
  function buildControls() {
    const wrap = el('div', 'dcc-tour-controls');
    const first = DATA.days[0].date, last = DATA.days[DATA.days.length - 1].date;
    wrap.innerHTML =
      '<label class="dcc-tour-ctl"><span>Jump to date</span>' +
      '<input type="date" id="dcc-datepick" min="' + first + '" max="' + last + '" value="' + first + '"></label>' +
      '<label class="dcc-tour-ctl dcc-tour-ctl-search"><span>Find a place</span>' +
      '<input type="search" id="dcc-placesearch" placeholder="e.g. Lokrum, Stradun, Cavtat…" autocomplete="off"></label>' +
      '<div class="dcc-tour-results" id="dcc-results" hidden></div>';
    // date jump
    wrap.querySelector('#dcc-datepick').addEventListener('change', e => {
      const idx = DATA.days.findIndex(d => d.date === e.target.value);
      if (idx >= 0) { setMode('story'); selectDay(idx); }
    });
    // place search across all days
    const idx = [];
    DATA.days.forEach((d, di) => d.places.forEach((p, pi) =>
      idx.push({ di, pi, name: p.name, short: d.short, count: p.count, key: p.name.toLowerCase() })));
    const inp = wrap.querySelector('#dcc-placesearch');
    const res = wrap.querySelector('#dcc-results');
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { res.hidden = true; res.innerHTML = ''; return; }
      const hits = idx.filter(x => x.key.includes(q)).slice(0, 12);
      res.hidden = !hits.length;
      res.innerHTML = hits.map(h =>
        '<button class="dcc-tour-result" data-di="' + h.di + '" data-pi="' + h.pi + '">' +
        escapeHtml(h.name) + ' <span>' + escapeHtml(h.short) + ' · ' + h.count + '</span></button>').join('');
    });
    res.addEventListener('click', e => {
      const b = e.target.closest('.dcc-tour-result'); if (!b) return;
      res.hidden = true; inp.value = '';
      setMode('story'); selectDay(+b.dataset.di);
      setTimeout(() => {
        const sec = root._story.querySelector('#place-' + b.dataset.pi);
        if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); sec.classList.add('dcc-tour-flash'); setTimeout(() => sec.classList.remove('dcc-tour-flash'), 1600); }
      }, 80);
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) res.hidden = true; });
    return wrap;
  }
  function fmtDur(s) {
    if (!s && s !== 0) return '';
    const m = Math.floor(s / 60), ss = Math.round(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  }
  function mapsLink(lat, lng, cls) {
    if (lat == null || lng == null) return '';
    return '<a class="' + (cls || 'dcc-tour-maplink') + '" href="https://www.google.com/maps?q=' +
      lat + ',' + lng + '" target="_blank" rel="noopener" title="Open in Google Maps" ' +
      'onclick="event.stopPropagation()">📍</a>';
  }

  function fmt(n) { return Math.round(n).toLocaleString(); }
  function shortName(s) { return String(s || '').split(/[,(]/)[0].trim(); }
  function tripStatsHTML() {
    const h = DATA.health; if (!h) return '';
    const s = DATA.stats || {};
    const srd = (h.climb_m / 412).toFixed(1);       // Mount Srđ = 412 m
    let sup = '';
    if (s.most_active_day) {
      sup = '<div class="dcc-tour-superlatives">' +
        '<span>🔥 Busiest day <b>' + escapeHtml(s.most_active_day.label) + '</b> · ' + s.most_active_day.count + ' shots</span>' +
        '<span>📍 Most captured <b>' + escapeHtml(shortName(s.most_visited.name)) + '</b> · ' + s.most_visited.count + '</span>' +
        (s.longest_walk_day ? '<span>🥾 Longest day <b>' + escapeHtml(s.longest_walk_day.label) + '</b> · ' + s.longest_walk_day.km + ' km</span>' : '') +
        '</div>';
    }
    return '<div class="dcc-tour-tripstats">' +
      statTile(h.steps, '', 'steps', h.watch) +
      statTile(parseFloat(h.dist), ' ' + (h.dist_unit || ''), 'walked', 'by watch · ' + DATA.day_count + ' days', 1) +
      statTile(h.flights, '', 'flights climbed', '≈ Mount Srđ ×' + srd) +
      (s.total_locations ? statTile(s.total_locations, '', 'places', 'visited & named') : '') +
      (s.trip_walk_km ? statTile(s.trip_walk_km, ' km', 'traveled', 'foot · boat · road', 1) : '') +
      (s.photos != null ? statTile(s.photos + s.videos + s.clips, '', 'photos & videos',
        s.photos + ' photos · ' + s.videos + ' videos · ' + s.clips + ' clips') : '') +
      '</div>' + sup;
  }
  function statTile(num, suffix, label, sub, dec) {
    num = num || 0; dec = dec || 0;
    const shown = dec ? Number(num).toFixed(dec) : fmt(num);
    return '<div class="dcc-tour-tile"><span class="t-big" data-count="' + num + '" data-dec="' + dec +
      '" data-suffix="' + escapeAttr(suffix || '') + '">' + escapeHtml(shown) + escapeHtml(suffix || '') + '</span>' +
      '<span class="t-lab">' + escapeHtml(label) + '</span>' +
      (sub ? '<span class="t-sub">' + escapeHtml(sub) + '</span>' : '') + '</div>';
  }
  function tile(big, label, sub) {
    return '<div class="dcc-tour-tile"><span class="t-big">' + escapeHtml(big) + '</span>' +
      '<span class="t-lab">' + escapeHtml(label) + '</span>' +
      (sub ? '<span class="t-sub">' + escapeHtml(sub) + '</span>' : '') + '</div>';
  }
  // count-up animation for the hero numbers
  function animateCounts(scope) {
    (scope || document).querySelectorAll('.t-big[data-count]').forEach(elm => {
      const target = parseFloat(elm.getAttribute('data-count')) || 0;
      const dec = +elm.getAttribute('data-dec') || 0;
      const suffix = elm.getAttribute('data-suffix') || '';
      if (target <= 0) return;
      const dur = 900, t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        const v = target * e;
        elm.textContent = (dec ? v.toFixed(dec) : fmt(v)) + suffix;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function healthRibbonHTML(day) {
    const h = day.health || {};
    const bits = [];
    if (h.steps) bits.push('<b>' + fmt(h.steps) + '</b> steps');
    if (day.walk_km) bits.push('<b>' + day.walk_km + ' km</b> traveled');
    if (h.climb_m) {
      const flights = Math.round(h.climb_m / 3);
      bits.push('climbed <b>' + fmt(h.climb_m) + ' m</b> ≈ ' + flights + ' flights');
    }
    if (h.alt_max != null) bits.push('up to <b>' + h.alt_max + ' m</b>');
    let out = bits.length ? '<p class="dcc-tour-health">' + bits.join(' &nbsp;·&nbsp; ') + '</p>' : '';
    // stairs-as-a-story
    if (h.climb_m && h.climb_m >= 40) {
      const srd = (h.climb_m / 412);
      const tale = srd >= 0.25
        ? 'That\'s like climbing <b>Mount Srđ ×' + srd.toFixed(srd < 1 ? 2 : 1) + '</b> — on foot.'
        : 'About <b>' + Math.round(h.climb_m / 3) + ' flights</b> of stairs.';
      out += '<p class="dcc-tour-stairtale">🪜 ' + tale + '</p>';
    }
    return out;
  }
  function weatherHTML(w) {
    if (!w) return '';
    const bits = [];
    if (w.icon || w.desc) bits.push((w.icon || '') + ' ' + escapeHtml(w.desc || ''));
    if (w.tmax != null) bits.push('🌡 ' + Math.round(w.tmax) + '°' + (w.tmin != null ? ' / ' + Math.round(w.tmin) + '°' : '') + 'C');
    if (w.wind != null) bits.push('💨 ' + Math.round(w.wind) + ' km/h');
    if (w.precip) bits.push('💧 ' + w.precip + ' mm');
    return bits.length ? '<p class="dcc-tour-weather">' + bits.join(' &nbsp;·&nbsp; ') + '</p>' : '';
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
      weatherHTML(day.weather) +
      healthRibbonHTML(day) +
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
        if (bits.length) cum = ' <span class="dcc-tour-place-cum">· ' + bits.join(' · ') + ' by now</span>';
      }
      const spent = p.mins ? ' · ' + (p.mins >= 60 ? (p.mins/60).toFixed(1) + ' h' : p.mins + ' min') + ' here' : '';
      html += '<section class="dcc-tour-place" id="' + anchor + '">' +
        '<div class="dcc-tour-place-head">' +
          '<h3>' + escapeHtml(p.name) + mapsLink(p.lat, p.lng, 'dcc-tour-maplink head') + '</h3>' +
          '<span class="dcc-tour-place-meta">' + escapeHtml(time) + spent + ' · ' + p.count + ' shots' + cum + '</span>' +
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
    const extras = mapsLink(item.lat, item.lng, 'dcc-tour-maplink cell');
    if (item.type === 'drive') {
      return '<div class="dcc-tour-cell wide"><iframe loading="lazy" allowfullscreen allow="autoplay" ' +
        'src="https://drive.google.com/file/d/' + escapeAttr(item.id) + '/preview"></iframe>' +
        '<span class="dcc-tour-badge">▶ clip</span>' + cap(item) + extras + '</div>';
    }
    if (item.type === 'self_hosted') {
      const durb = item.dur ? '<span class="dcc-tour-badge">▶ ' + fmtDur(item.dur) + '</span>' : '<span class="dcc-tour-badge">▶ video</span>';
      if (!item.url && item.poster)
        return '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(resolveUrl(item.poster)) + '" alt="video" style="opacity:.85" />' + durb + cap(item) + extras + '</div>';
      if (!item.url) return '';
      const poster = item.poster ? ' poster="' + escapeAttr(resolveUrl(item.poster)) + '"' : '';
      return '<div class="dcc-tour-cell wide"><video src="' + escapeAttr(resolveUrl(item.url)) + '"' + poster +
             ' controls preload="none"></video>' + durb + cap(item) + extras + '</div>';
    }
    // photo
    const full = item.full ? ' data-full="' + escapeAttr(resolveUrl(item.full)) + '"' : '';
    if (item.full) lightboxFulls.push(resolveUrl(item.full));
    return '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(resolveUrl(item.src || item.full)) + '" alt=""' + full + ' />' + cap(item) + extras + '</div>';
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
