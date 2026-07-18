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

  let map = null;
  let DATA = null, curDay = 0;
  let lightboxFulls = [], lightboxMeta = [], lightboxIdx = -1;
  const markersByPlace = {};

  fetch(baseURL + 'trip.json').then(r => r.json()).then(data => {
    DATA = data;
    const initialHash = location.hash;   // capture before selectDay/updateHash rewrites it
    buildShell();
    initMap();
    selectDay(0);
    if (initialHash.length > 1) applyHash(initialHash);
    window.addEventListener('hashchange', () => applyHash());  // pasted links in the same tab
    // if the window grows past the mobile breakpoint, bring the story map up
    const mq = window.matchMedia('(min-width: 801px)');
    const onMq = () => { if (mq.matches && !map) { initMap(); if (map) showDayOnMap(DATA.days[curDay]); } };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
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
      const cv = coverSrc(d);
      b.innerHTML = (cv ? '<img class="d-thumb" loading="lazy" src="' + escapeAttr(cv) + '" alt="">' : '') +
                    '<span class="d-n">Day ' + d.index + '</span>' +
                    '<span class="d-d">' + escapeHtml(d.short) + '</span>' +
                    '<span class="d-c">' + d.count + '</span>';
      b.addEventListener('click', () => { setView('story'); selectDay(i); });
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
    // trip overview (climbs + staircase): collapsed on mobile, open on desktop
    const overview = el('div', 'dcc-tour-overview');
    const ovd = document.createElement('details');
    ovd.className = 'dcc-tour-ovcollapse';
    if (window.matchMedia('(min-width:801px)').matches) ovd.open = true;
    ovd.innerHTML = '<summary>📈 Trip overview · climbs &amp; elevation</summary>' +
      '<div class="ov-body">' + overviewHTML() + '</div>';
    overview.appendChild(ovd);
    const controls = buildControls();
    const modeToggle = buildModeToggle();
    const mapmode = buildMapMode();
    root.appendChild(header); root.appendChild(modeToggle); root.appendChild(nav); root.appendChild(controls);
    root.appendChild(overview); root.appendChild(body); root.appendChild(mapmode);
    root._story = story; root._mapdiv = mapdiv; root._nav = nav; root._mapmode = mapmode;
    overview.querySelectorAll('.tread').forEach(r =>
      r.addEventListener('click', () => selectDay(+r.getAttribute('data-day'))));
    animateCounts(header);
    buildAppShell();
  }

  // ---- monoline icon set (editorial line-art; inherits currentColor) ----
  function svgIcon(name) {
    const s = {
      story:   '<circle cx="6" cy="6" r="1.7"/><circle cx="6" cy="18" r="1.7"/><line x1="6" y1="7.7" x2="6" y2="16.3"/><line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="18" x2="17" y2="18"/>',
      gallery: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M4 17l5-5 4 4 3-3 4 4"/>',
      map:     '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="20"/>',
      stats:   '<line x1="4" y1="20" x2="20" y2="20"/><line x1="7" y1="20" x2="7" y2="12"/><line x1="12" y1="20" x2="12" y2="7"/><line x1="17" y1="20" x2="17" y2="15"/>',
      dice:    '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.15" fill="currentColor" stroke="none"/>'
    }[name] || '';
    return '<svg class="dcc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + s + '</svg>';
  }

  // ---- Option B: native app shell (mobile) — bottom tabs, day top-bar, sheet, swipe ----
  function tabBtn(v, label) {
    return '<button class="dcc-tour-tabbtn" role="tab" aria-selected="' + (v === 'story') + '" data-view="' + v + '"><span class="ti">' + svgIcon(v) +
      '</span><span>' + label + '</span></button>';
  }
  function buildAppShell() {
    const tb = el('div', 'dcc-tour-topbar');
    tb.innerHTML =
      '<button class="tb-arrow tb-prev" aria-label="Previous day">‹</button>' +
      '<button class="tb-day" id="dcc-tb-day" aria-haspopup="dialog">' +
        '<span class="tb-daynum" id="dcc-tb-num"></span>' +
        '<span class="tb-daylabel" id="dcc-tb-lab"></span></button>' +
      '<button class="tb-arrow tb-next" aria-label="Next day">›</button>' +
      '<button class="tb-arrow tb-rand" aria-label="Random memory">' + svgIcon('dice') + '</button>';
    tb.querySelector('.tb-prev').addEventListener('click', () => { if (curDay > 0) selectDay(curDay - 1); });
    tb.querySelector('.tb-next').addEventListener('click', () => { if (curDay < DATA.day_count - 1) selectDay(curDay + 1); });
    tb.querySelector('.tb-rand').addEventListener('click', randomMemory);
    tb.querySelector('#dcc-tb-day').addEventListener('click', openDaySheet);

    const bar = el('nav', 'dcc-tour-tabbar');
    bar.setAttribute('aria-label', 'Sections');
    bar.setAttribute('role', 'tablist');
    bar.innerHTML = tabBtn('story', 'Timeline') + tabBtn('gallery', 'Photos') +
      tabBtn('map', 'Map') + tabBtn('stats', 'Stats');
    bar.querySelectorAll('.dcc-tour-tabbtn[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    const sheet = el('div', 'dcc-tour-sheet'); sheet.hidden = true;
    sheet.innerHTML = '<div class="sheet-bd"></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-label="Jump to a day or place"><div class="sheet-handle"></div>' +
      '<h4>Jump to a day or place</h4>' +
      '<input type="search" class="sheet-search" id="dcc-sheet-search" placeholder="Search places — Lokrum, Stradun…" autocomplete="off">' +
      '<div class="sheet-results" id="dcc-sheet-results" hidden></div>' +
      '<div class="sheet-days">' +
      DATA.days.map((d, i) => '<button class="sheet-day" data-day="' + i + '">' +
        (coverSrc(d) ? '<img class="sd-thumb" loading="lazy" src="' + escapeAttr(coverSrc(d)) + '" alt="">' : '') +
        '<span class="sd-txt"><b>Day ' + d.index + '</b>' +
        '<span>' + escapeHtml(d.short) + '</span><span class="sd-area">' + escapeHtml(d.area || '') + '</span></span>' +
        '<span class="sd-c">' + d.count + '</span></button>').join('') + '</div></div>';
    sheet.querySelector('.sheet-bd').addEventListener('click', closeDaySheet);
    sheet.querySelectorAll('.sheet-day').forEach(b => b.addEventListener('click', () => { closeDaySheet(); setView('story'); selectDay(+b.dataset.day); }));
    // in-sheet place search — the one discoverable search on mobile
    const ssearch = sheet.querySelector('#dcc-sheet-search');
    const sres = sheet.querySelector('#dcc-sheet-results');
    const sdays = sheet.querySelector('.sheet-days');
    ssearch.addEventListener('input', () => {
      const q = ssearch.value.trim().toLowerCase();
      if (!q) { sres.hidden = true; sres.innerHTML = ''; sdays.style.display = ''; return; }
      const hits = placeIndex().filter(x => x.key.includes(q)).slice(0, 20);
      sdays.style.display = 'none'; sres.hidden = false;
      sres.innerHTML = hits.length ? hits.map(h =>
        '<button class="sheet-result" data-di="' + h.di + '" data-pi="' + h.pi + '">' +
        '<span class="sr-name">' + escapeHtml(h.name) + '</span>' +
        '<span class="sr-meta">' + escapeHtml(h.short) + ' · ' + plur(h.count, 'shot') + '</span></button>').join('')
        : '<p class="sheet-noresult">No places match that search.</p>';
    });
    sres.addEventListener('click', e => {
      const b = e.target.closest('.sheet-result'); if (!b) return;
      closeDaySheet(); jumpToPlace(+b.dataset.di, +b.dataset.pi);
    });

    root.insertBefore(tb, root.firstChild); root.appendChild(bar); root.appendChild(sheet);
    root._topbar = tb; root._sheet = sheet;
    root.dataset.view = 'story';
    root.querySelector('.dcc-tour-tabbtn[data-view="story"]').classList.add('active');
    attachSwipe(root._story);
    updateTopbar();
  }
  function setView(v) {
    root.dataset.view = v;
    root.querySelectorAll('.dcc-tour-tabbtn, .dcc-tour-modebtn[data-view]')
      .forEach(b => {
        const on = b.dataset.view === v;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    if (v !== 'map') mmStopPlay();
    if (v === 'map') initMapMode();
    else if (v === 'stats') animateCounts(root);
    else if (v === 'gallery') buildGallery();
    else if (v === 'story') renderDay(DATA.days[curDay]);  // rebuild the day's own lightbox set
    updateHash();
    window.scrollTo({ top: 0 });
  }
  // ---- deep links: #d=<day>, #d=<day>&p=<place>, #d=<day>&ph=<guid>, #ph=<guid>, #v=map|stats|gallery ----
  function updateHash() {
    if (!DATA) return;
    const v = root.dataset.view || 'story';
    history.replaceState(null, '', v === 'story' ? '#d=' + (curDay + 1) : '#v=' + v);
  }
  function findDayByGuid(g) {
    for (let di = 0; di < DATA.days.length; di++)
      for (const p of DATA.days[di].places)
        for (const it of p.items)
          if (((it.full || it.src || it.url || it.poster || '') + (it.id || '')).includes(g)) return di;
    return -1;
  }
  function applyHash(hash) {
    const m = {};
    (hash || location.hash).slice(1).split('&').forEach(kv => {
      const i = kv.indexOf('='); if (i > 0) m[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (m.v && ['map', 'stats', 'gallery'].indexOf(m.v) >= 0) { setView(m.v); return; }
    let di = m.d ? Math.min(Math.max((parseInt(m.d, 10) || 1) - 1, 0), DATA.day_count - 1) : null;
    if (m.ph && di == null) { const f = findDayByGuid(m.ph); if (f >= 0) di = f; }
    if (di != null && di !== curDay) selectDay(di);
    if (m.p != null) setTimeout(() => {
      const sec = root._story.querySelector('#place-' + (+m.p));
      if (sec) { sec.scrollIntoView({ block: 'start' }); sec.classList.add('dcc-tour-flash'); setTimeout(() => sec.classList.remove('dcc-tour-flash'), 1600); }
    }, 150);
    if (m.ph) setTimeout(() => {
      const i = lightboxFulls.findIndex(u => u.indexOf(m.ph) >= 0);
      if (i >= 0) openLightbox(i);
    }, 250);
  }
  // ---- share helpers ----
  function shareUrl(extra) { return location.href.split('#')[0] + '#' + extra; }
  function doShare(url, title) {
    if (navigator.share) { navigator.share({ url: url, title: title || 'Croatia 2025' }).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(url).then(() => toast('Link copied ✓'), () => toast(url));
    else toast(url);
  }
  function toast(msg) {
    let t = document.getElementById('dcc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'dcc-toast'; t.className = 'dcc-tour-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }
  // ---- 🎲 random memory ----
  function randomMemory() {
    const pool = [];
    DATA.days.forEach((d, di) => d.places.forEach(p => p.items.forEach(it => { if (it.full) pool.push({ di, it }); })));
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setView('story');
    if (pick.di !== curDay) selectDay(pick.di);
    setTimeout(() => {
      const i = lightboxFulls.indexOf(resolveUrl(pick.it.full));
      if (i >= 0) openLightbox(i);
    }, 260);
  }
  function updateTopbar() {
    if (!root._topbar) return;
    const d = DATA.days[curDay];
    root._topbar.querySelector('#dcc-tb-num').textContent = 'Day ' + d.index + ' / ' + DATA.day_count;
    root._topbar.querySelector('#dcc-tb-lab').textContent = d.short + (d.area ? ' · ' + shortName(d.area) : '') + '  ▾';
    root._topbar.querySelector('.tb-prev').disabled = curDay <= 0;
    root._topbar.querySelector('.tb-next').disabled = curDay >= DATA.day_count - 1;
  }
  function openDaySheet() {
    const s = root._sheet; if (!s) return;
    // always open on the day list, not a stale search
    const q = s.querySelector('#dcc-sheet-search'); if (q) q.value = '';
    const sr = s.querySelector('#dcc-sheet-results'); if (sr) { sr.hidden = true; sr.innerHTML = ''; }
    const sd = s.querySelector('.sheet-days'); if (sd) sd.style.display = '';
    s.hidden = false; requestAnimationFrame(() => s.classList.add('open'));
  }
  function closeDaySheet() { const s = root._sheet; if (s) { s.classList.remove('open'); setTimeout(() => { s.hidden = true; }, 220); } }
  function attachSwipe(elm) {
    if (!elm) return; let x0 = null, y0 = null;
    elm.addEventListener('touchstart', e => {
      // don't hijack horizontally-scrolling strips
      if (e.target.closest('.dcc-tour-tripstats, .dcc-tour-superlatives')) { x0 = y0 = null; return; }
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY;
    }, { passive: true });
    elm.addEventListener('touchend', e => {
      if (x0 == null) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        if (dx < 0 && curDay < DATA.day_count - 1) selectDay(curDay + 1);
        else if (dx > 0 && curDay > 0) selectDay(curDay - 1);
      }
      x0 = y0 = null;
    }, { passive: true });
  }

  // ---- #7/#10/#11 Map Mode: full-trip interactive map ----
  function dayColor(i) { return 'hsl(' + Math.round(i * 360 / Math.max(DATA.day_count, 1)) + ' 72% 45%)'; }

  // ---- who shot it: four legible, editorial hues ----
  const PERSONS = ['Rob', 'Erica', 'Alice', 'GoPro'];
  const PERSON_COLORS = { Rob: '#3a7ca5', Erica: '#c76b6b', Alice: '#7a9e5e', GoPro: '#6b5b95' };
  const NO_COLOR = '#b0aaa2';
  function lerpHex(h1, h2, f) {
    const p = x => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
    const c1 = p(h1), c2 = p(h2), m = i => Math.round(c1[i] + (c2[i] - c1[i]) * f);
    return 'rgb(' + m(0) + ',' + m(1) + ',' + m(2) + ')';
  }
  const ALT_MAX = 412;  // Mount Srđ
  const ALT_STOPS = [[0, '#2b7a9b'], [0.5, '#6a9a5b'], [1, '#c9992e']];  // sea → hills → peak
  function altColor(m) {
    const t = Math.max(0, Math.min(1, (m || 0) / ALT_MAX));
    let a = ALT_STOPS[0], b = ALT_STOPS[ALT_STOPS.length - 1];
    for (let i = 0; i < ALT_STOPS.length - 1; i++) if (t >= ALT_STOPS[i][0] && t <= ALT_STOPS[i + 1][0]) { a = ALT_STOPS[i]; b = ALT_STOPS[i + 1]; break; }
    return lerpHex(a[1], b[1], b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]));
  }
  function placeDominantPerson(p) {
    const c = {}; p.items.forEach(it => { if (it.person) c[it.person] = (c[it.person] || 0) + 1; });
    let best = null, n = -1; for (const k in c) if (c[k] > n) { n = c[k]; best = k; }
    return best;
  }
  function placeMeanAlt(p) {
    const a = p.items.map(it => it.alt).filter(x => x != null);
    return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  }
  // circular mean of the camera headings at a place (which way people faced)
  function placeMeanHeading(p) {
    let sx = 0, sy = 0, n = 0;
    p.items.forEach(it => { if (it.heading != null) { const r = it.heading * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r); n++; } });
    if (!n) return null;
    let deg = Math.atan2(sy, sx) * 180 / Math.PI; return (deg + 360) % 360;
  }
  const PLAY_GLYPH = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>';
  const PAUSE_GLYPH = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>';
  let mmColorMode = 'day';   // 'day' | 'person' | 'alt'
  function placeColor(p, di) {
    if (mmColorMode === 'person') return PERSON_COLORS[placeDominantPerson(p)] || NO_COLOR;
    if (mmColorMode === 'alt') { const a = placeMeanAlt(p); return a != null ? altColor(a) : NO_COLOR; }
    return dayColor(di);
  }
  function buildModeToggle() {
    const w = el('div', 'dcc-tour-modes');
    w.setAttribute('role', 'tablist');
    w.innerHTML =
      '<button class="dcc-tour-modebtn active" role="tab" aria-selected="true" data-view="story">' + svgIcon('story') + '<span>Timeline</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="gallery">' + svgIcon('gallery') + '<span>Photos</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="map">' + svgIcon('map') + '<span>Map</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="stats">' + svgIcon('stats') + '<span>Stats</span></button>' +
      '<button class="dcc-tour-modebtn dcc-tour-modebtn-icon" id="dcc-random" title="Show me a random memory" aria-label="Random memory">' + svgIcon('dice') + '</button>';
    w.querySelectorAll('.dcc-tour-modebtn[data-view]').forEach(b =>
      b.addEventListener('click', () => setView(b.dataset.view)));
    w.querySelector('#dcc-random').addEventListener('click', randomMemory);
    return w;
  }
  function buildMapMode() {
    const w = el('section', 'dcc-tour-mapmode');
    const dayOpts = DATA.days.map((d, i) =>
      '<option value="' + i + '">' + escapeHtml('Day ' + d.index + ' · ' + d.short) + '</option>').join('');
    w.innerHTML =
      '<div class="dcc-tour-mm-bar">' +
        '<span class="dcc-tour-mm-colorby" role="group" aria-label="Color markers by">' +
          '<span class="mm-cb-lab">Color</span>' +
          '<button class="mm-cb active" data-mode="day">Day</button>' +
          '<button class="mm-cb" data-mode="person">Who</button>' +
          '<button class="mm-cb" data-mode="alt">Altitude</button>' +
        '</span>' +
        '<label class="dcc-tour-mm-tog"><input type="checkbox" id="mm-path" checked> Path</label>' +
        '<label class="dcc-tour-mm-tog"><input type="checkbox" id="mm-facing"> Facing</label>' +
        '<label class="dcc-tour-mm-tog"><input type="checkbox" id="mm-heat"> Heatmap</label>' +
        '<label class="dcc-tour-mm-tog"><input type="checkbox" id="mm-sat"> Satellite</label>' +
        '<span class="dcc-tour-mm-range">' +
          '<label class="mm-dl">From <select class="mm-daysel" id="mm-lo">' + dayOpts + '</select></label>' +
          '<label class="mm-dl">to <select class="mm-daysel" id="mm-hi">' + dayOpts + '</select></label>' +
        '</span>' +
        '<span class="dcc-tour-mm-stats" id="mm-range-stats"></span>' +
      '</div>' +
      '<div class="dcc-tour-mm-play">' +
        '<button class="dcc-tour-mm-playbtn" id="mm-play" aria-label="Play the whole trip" title="Play the whole trip">' + PLAY_GLYPH + '</button>' +
        '<input type="range" class="dcc-tour-mm-scrub" id="mm-scrub" min="0" max="0" value="0" step="1" aria-label="Scrub through the trip">' +
        '<span class="dcc-tour-mm-speeds" role="group" aria-label="Playback speed">' +
          '<button class="mm-spd active" data-spd="1">1×</button>' +
          '<button class="mm-spd" data-spd="2">2×</button>' +
          '<button class="mm-spd" data-spd="4">4×</button>' +
        '</span>' +
        '<span class="dcc-tour-mm-playlabel" id="mm-playlabel"></span>' +
      '</div>' +
      '<div class="dcc-tour-mm-wrap"><div class="dcc-tour-mm-map" id="dcc-mm-map"></div>' +
        '<figure class="dcc-tour-mm-moment" id="mm-moment" hidden></figure>' +
        '<aside class="dcc-tour-mm-side" id="dcc-mm-side" hidden></aside></div>' +
      '<div class="dcc-tour-mm-legend" id="mm-legend"></div>';
    return w;
  }
  let mmMap = null, mmMarkers = null, mmPathLayer = null, mmHeat = null, mmSat = null, mmInit = false;
  let mmRange = [0, 0];
  function initMapMode() {
    if (mmInit) { setTimeout(() => mmMap.invalidateSize(), 60); return; }
    mmInit = true;
    mmRange = [0, DATA.day_count - 1];
    mmMap = L.map('dcc-mm-map', { scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mmMap);
    mmSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' });
    mmMarkers = L.layerGroup().addTo(mmMap);
    mmPathLayer = L.layerGroup().addTo(mmMap);
    const m = root._mapmode;
    m.querySelector('#mm-path').addEventListener('change', renderMapMode);
    m.querySelector('#mm-heat').addEventListener('change', renderMapMode);
    m.querySelector('#mm-sat').addEventListener('change', e => { if (e.target.checked) mmSat.addTo(mmMap); else mmMap.removeLayer(mmSat); });
    const lo = m.querySelector('#mm-lo'), hi = m.querySelector('#mm-hi');
    hi.value = DATA.day_count - 1;
    const onRange = () => {
      let a = +lo.value, b = +hi.value; if (a > b) { const t = a; a = b; b = t; }
      mmRange = [a, b]; renderMapMode();
    };
    lo.addEventListener('change', onRange); hi.addEventListener('change', onRange);
    m.querySelector('#mm-facing').addEventListener('change', renderMapMode);
    // Color by: Day / Who / Altitude
    m.querySelectorAll('.mm-cb').forEach(b => b.addEventListener('click', () => {
      mmColorMode = b.dataset.mode;
      m.querySelectorAll('.mm-cb').forEach(x => x.classList.toggle('active', x === b));
      renderMapLegend(); renderMapMode();
    }));
    // Play / scrub the whole trip
    const scrub = m.querySelector('#mm-scrub');
    scrub.max = Math.max(0, buildPlaySeq().length - 1);
    scrub.addEventListener('input', () => { mmStopPlay(); mmRenderPlayhead(+scrub.value); });
    m.querySelector('#mm-play').addEventListener('click', () => { mmPlayTimer ? mmStopPlay() : mmStartPlay(); });
    m.querySelectorAll('.mm-spd').forEach(b => b.addEventListener('click', () => {
      mmPlaySpeed = +b.dataset.spd;
      m.querySelectorAll('.mm-spd').forEach(x => x.classList.toggle('active', x === b));
      if (mmPlayTimer) { mmStopPlay(); mmStartPlay(); }   // restart at the new speed, same spot
    }));
    renderMapLegend();
    renderMapMode(true);   // whole-trip bounds
    setTimeout(() => mmMap.invalidateSize(), 80);
  }
  // legend adapts to the color mode; also the day/person selector
  function renderMapLegend() {
    const el = root._mapmode.querySelector('#mm-legend');
    const lo = root._mapmode.querySelector('#mm-lo'), hi = root._mapmode.querySelector('#mm-hi');
    if (mmColorMode === 'day') {
      el.className = 'dcc-tour-mm-legend';
      el.innerHTML = DATA.days.map((d, i) =>
        '<button class="dcc-tour-legseg" data-day="' + i + '" title="' + escapeAttr(d.short + (d.area ? ' · ' + shortName(d.area) : '')) + '">' +
        '<span class="seg-sw" style="background:' + dayColor(i) + '"></span><span class="seg-n">' + d.index + '</span></button>').join('');
      el.querySelectorAll('.dcc-tour-legseg').forEach(c => c.addEventListener('click', () => {
        const di = +c.dataset.day; lo.value = di; hi.value = di; mmRange = [di, di];
        if (DATA.days[di].places.some(p => p.lat != null)) fitToDays(di, di);
        renderMapMode();
      }));
    } else if (mmColorMode === 'person') {
      el.className = 'dcc-tour-mm-legend mm-legend-person';
      el.innerHTML = PERSONS.map(pn =>
        '<span class="dcc-tour-legseg"><span class="seg-sw" style="background:' + PERSON_COLORS[pn] + '"></span>' +
        '<span class="seg-n">' + escapeHtml(pn) + '</span></span>').join('');
    } else {  // alt
      el.className = 'dcc-tour-mm-legend mm-legend-alt';
      el.innerHTML = '<span class="mm-altscale" style="background:linear-gradient(90deg,' +
        ALT_STOPS[0][1] + ',' + ALT_STOPS[1][1] + ',' + ALT_STOPS[2][1] + ')"></span>' +
        '<span class="mm-altlab">0 m (sea)</span><span class="mm-altlab">~200 m</span><span class="mm-altlab">' + ALT_MAX + ' m (Srđ)</span>';
    }
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
    const showFacing = root._mapmode.querySelector('#mm-facing').checked;
    const heatPts = [], allPts = [];
    // range readout (days · places · shots) + dim legend segments outside the range
    const rdays = daysInRange();
    let rPlaces = 0, rShots = 0;
    rdays.forEach(di => DATA.days[di].places.forEach(p => { rPlaces++; rShots += p.count; }));
    const statsEl = root._mapmode.querySelector('#mm-range-stats');
    if (statsEl) statsEl.textContent = rdays.length + ' days · ' + rPlaces + ' places · ' + fmt(rShots) + ' shots';
    root._mapmode.querySelectorAll('.dcc-tour-legseg').forEach(seg => {
      const i = +seg.dataset.day; seg.classList.toggle('out', i < mmRange[0] || i > mmRange[1]);
    });
    daysInRange().forEach(di => {
      const d = DATA.days[di], col = dayColor(di), line = [];
      d.places.forEach((p, pi) => {
        if (p.lat == null) return;
        allPts.push([p.lat, p.lng]); line.push([p.lat, p.lng]);
        const r = Math.min(20, 5 + Math.sqrt(p.count) * 1.6);
        const mk = L.circleMarker([p.lat, p.lng], { radius: r, color: '#fff', weight: 1.5, fillColor: placeColor(p, di), fillOpacity: 0.85 });
        mk.bindTooltip(escapeHtml(p.name) + ' · ' + d.short, { direction: 'top' });
        mk.on('click', () => openMapSidebar(di, pi));
        mmMarkers.addLayer(mk);
        p.items.forEach(it => { if (it.lat != null) heatPts.push([it.lat, it.lng, 0.6]); });
        // compass "facing" ray: which way the cameras pointed at this spot
        if (showFacing) {
          const h = placeMeanHeading(p);
          if (h != null) {
            const rad = h * Math.PI / 180, dd = 0.0011;
            const tip = [p.lat + dd * Math.cos(rad), p.lng + dd * Math.sin(rad) / Math.cos(p.lat * Math.PI / 180)];
            mmPathLayer.addLayer(L.polyline([[p.lat, p.lng], tip], { color: '#7d5411', weight: 2, opacity: 0.85 }));
            mmPathLayer.addLayer(L.circleMarker(tip, { radius: 2.6, weight: 0, fillColor: '#7d5411', fillOpacity: 0.9 }));
          }
        }
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
    lightboxFulls = []; lightboxMeta = []; const thumbs = [];
    p.items.forEach(it => {
      let img = null;
      if (it.full) { img = resolveUrl(it.src || it.full); lightboxFulls.push(resolveUrl(it.full)); lightboxMeta.push({ p: it.place || p.name, t: it.time }); thumbs.push('<img loading="lazy" src="' + escapeAttr(img) + '" data-full="' + escapeAttr(resolveUrl(it.full)) + '">'); }
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
    side.querySelector('[data-openday]').addEventListener('click', () => { setView('story'); selectDay(di); });
    mmMap.panTo([p.lat, p.lng], { animate: true });
  }

  // ---- Play / scrub the whole trip: a moving marker walks the chapters in order,
  //      pinning the current day·place and popping that moment's photo. (A + B) ----
  const MM_PLAY_MS = 90000;   // whole-trip run at 1× ≈ 90 s
  let mmSeq = null, mmPlayIdx = 0, mmPlayTimer = null, mmPlaySpeed = 1;
  let mmPlayLayer = null;
  function buildPlaySeq() {
    if (mmSeq) return mmSeq;
    const seq = [];
    DATA.days.forEach((d, di) => d.places.forEach((p, pi) => {
      if (p.lat == null) return;
      seq.push({ lat: p.lat, lng: p.lng, di, pi, p, day: d });
    }));
    mmSeq = seq; return seq;
  }
  function mmPlayGlyph(playing) {
    const btn = root._mapmode && root._mapmode.querySelector('#mm-play');
    if (!btn) return;
    btn.innerHTML = playing ? PAUSE_GLYPH : PLAY_GLYPH;
    btn.classList.toggle('playing', playing);
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play the whole trip');
  }
  function mmRenderPlayhead(idx) {
    const seq = buildPlaySeq(); if (!seq.length) return;
    mmPlayIdx = Math.max(0, Math.min(seq.length - 1, idx));
    const m = seq[mmPlayIdx];
    if (!mmPlayLayer) mmPlayLayer = L.layerGroup().addTo(mmMap);
    mmPlayLayer.clearLayers();
    // the trail travelled so far, then the glowing playhead on top
    const trail = seq.slice(0, mmPlayIdx + 1).map(s => [s.lat, s.lng]);
    if (trail.length > 1) mmPlayLayer.addLayer(L.polyline(trail, { color: '#b68235', weight: 3, opacity: 0.75 }));
    mmPlayLayer.addLayer(L.circleMarker([m.lat, m.lng], { radius: 10, color: '#7d5411', weight: 3, fillColor: '#f4da62', fillOpacity: 0.95, className: 'mm-playhead' }));
    // label + moment card (the photo that pops up)
    const lab = root._mapmode.querySelector('#mm-playlabel');
    if (lab) lab.textContent = 'Day ' + m.day.index + ' · ' + m.p.name + ' · ' + (m.p.from === m.p.to ? m.p.from : m.p.from + '–' + m.p.to);
    const mo = root._mapmode.querySelector('#mm-moment');
    if (mo) {
      const rep = m.p.items.find(it => it.full) || m.p.items.find(it => it.poster) || m.p.items[0];
      const img = rep && rep.full ? resolveUrl(rep.src || rep.full) : (rep && rep.poster ? resolveUrl(rep.poster) : '');
      mo.innerHTML = (img ? '<img src="' + escapeAttr(img) + '" alt="">' : '') +
        '<figcaption>' + escapeHtml(m.p.name) + ' · ' + plur(m.p.count, 'shot') + '</figcaption>';
      mo.hidden = false;
    }
    const scrub = root._mapmode.querySelector('#mm-scrub');
    if (scrub && +scrub.value !== mmPlayIdx) scrub.value = mmPlayIdx;
    // keep the playhead comfortably in view without fighting the user's zoom
    if (!mmMap.getBounds().pad(-0.2).contains([m.lat, m.lng])) mmMap.panTo([m.lat, m.lng], { animate: true });
  }
  function mmStopPlay() {
    if (mmPlayTimer) { clearInterval(mmPlayTimer); mmPlayTimer = null; }
    mmPlayGlyph(false);
  }
  function mmStartPlay() {
    const seq = buildPlaySeq(); if (!seq.length) return;
    if (mmPlayIdx >= seq.length - 1) mmPlayIdx = 0;   // replay from the start
    mmPlayGlyph(true);
    mmRenderPlayhead(mmPlayIdx);
    const per = Math.max(90, MM_PLAY_MS / seq.length / mmPlaySpeed);
    mmPlayTimer = setInterval(() => {
      if (mmPlayIdx >= seq.length - 1) { mmStopPlay(); return; }
      mmRenderPlayhead(mmPlayIdx + 1);
    }, per);
  }

  // ---- Gallery ("Photos") view: every item in one filterable, chunk-rendered grid ----
  let galItems = null, galCur = null, galRendered = 0;
  const galFilter = { kind: 'all', q: '' };
  function buildGallery() {
    if (!galItems) {
      galItems = [];
      DATA.days.forEach(d => d.places.forEach(p => p.items.forEach(it =>
        galItems.push({ it, short: d.short, place: it.place || p.name }))));
      const g = el('section', 'dcc-tour-gallery');
      g.innerHTML = '<div class="dcc-tour-gal-bar">' +
        [['all', 'All'], ['photo', 'Photos'], ['video', 'Videos'], ['clip', 'Clips']].map(k =>
          '<button class="dcc-tour-galchip' + (k[0] === 'all' ? ' active' : '') + '" data-kind="' + k[0] + '">' + k[1] + '</button>').join('') +
        '<input type="search" id="dcc-galq" placeholder="filter by place…" autocomplete="off">' +
        '<span class="dcc-tour-gal-count" id="dcc-galcount"></span></div>' +
        '<div class="dcc-tour-media dcc-tour-gal-grid" id="dcc-galgrid"></div>' +
        '<div id="dcc-galmore" class="dcc-tour-galmore">loading more…</div>';
      root.appendChild(g);
      g.querySelectorAll('.dcc-tour-galchip').forEach(b => b.addEventListener('click', () => {
        g.querySelectorAll('.dcc-tour-galchip').forEach(x => x.classList.toggle('active', x === b));
        galFilter.kind = b.dataset.kind; renderGallery();
      }));
      let deb = null;
      g.querySelector('#dcc-galq').addEventListener('input', e => {
        clearTimeout(deb); deb = setTimeout(() => { galFilter.q = e.target.value.trim().toLowerCase(); renderGallery(); }, 150);
      });
      if ('IntersectionObserver' in window)
        new IntersectionObserver(en => { if (en[0].isIntersecting) renderGalleryChunk(); })
          .observe(g.querySelector('#dcc-galmore'));
    }
    renderGallery();
  }
  function renderGallery() {
    galCur = galItems.filter(x => (galFilter.kind === 'all' || x.it.kind === galFilter.kind) &&
      (!galFilter.q || (x.place || '').toLowerCase().indexOf(galFilter.q) >= 0));
    galRendered = 0;
    lightboxFulls = []; lightboxMeta = [];   // gallery owns the lightbox set while open
    document.getElementById('dcc-galcount').textContent = galCur.length.toLocaleString() + ' items';
    document.getElementById('dcc-galgrid').innerHTML = '';
    renderGalleryChunk();
  }
  function renderGalleryChunk() {
    if (!galCur || root.dataset.view !== 'gallery') return;
    const grid = document.getElementById('dcc-galgrid');
    const end = Math.min(galRendered + 200, galCur.length);
    let html = '';
    for (let i = galRendered; i < end; i++) html += renderItem(galCur[i].it);
    grid.insertAdjacentHTML('beforeend', html);
    galRendered = end;
    document.getElementById('dcc-galmore').style.display = galRendered < galCur.length ? '' : 'none';
  }

  // shared place index + jump helper (used by desktop search AND the mobile sheet)
  let PLACE_INDEX = null;
  function placeIndex() {
    if (!PLACE_INDEX) {
      PLACE_INDEX = [];
      DATA.days.forEach((d, di) => d.places.forEach((p, pi) =>
        PLACE_INDEX.push({ di, pi, name: p.name, short: d.short, count: p.count, key: p.name.toLowerCase() })));
    }
    return PLACE_INDEX;
  }
  function jumpToPlace(di, pi) {
    setView('story');
    selectDay(di);
    setTimeout(() => {
      const sec = root._story.querySelector('#place-' + pi);
      if (!sec) return;
      setPlaceOpen(sec, true);   // reveal it if collapsed (mobile default)
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sec.classList.add('dcc-tour-flash');
      setTimeout(() => sec.classList.remove('dcc-tour-flash'), 1600);
    }, 90);
  }
  function plur(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  // day-card counts: only the kinds that exist, no redundant "N items" sum
  function dayCountLabel(day) {
    const k = day.kinds || {}, parts = [];
    if (k.photo) parts.push(plur(k.photo, 'photo'));
    if (k.video) parts.push(plur(k.video, 'video'));
    if (k.clip) parts.push(plur(k.clip, 'clip'));
    return parts.length ? parts.join(' · ') : plur(day.count || 0, 'item');
  }

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
      if (idx >= 0) { setView('story'); selectDay(idx); }
    });
    // place search across all days
    const idx = placeIndex();
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
      jumpToPlace(+b.dataset.di, +b.dataset.pi);
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
  // a representative "cover" thumbnail for a day (middle shot of its biggest place)
  function coverSrc(day) {
    let best = null, bestN = -1;
    (day.places || []).forEach(p => {
      const imgs = p.items.filter(it => it.full || it.poster);
      if (imgs.length > bestN) { bestN = imgs.length; best = imgs; }
    });
    if (best && best.length) { const it = best[Math.floor(best.length / 2)]; return resolveUrl(it.src || it.full || it.poster); }
    return '';
  }
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
    // a non-breaking space glues each number to its unit so a unit never orphans
    // onto their own line in the narrow mobile column
    if (h.steps) bits.push('<b>' + fmt(h.steps) + '</b> steps');
    if (day.walk_km) bits.push('<b>' + day.walk_km + ' km</b> traveled');
    if (h.climb_m) {
      const flights = Math.round(h.climb_m / 3);
      bits.push('climbed <b>' + fmt(h.climb_m) + ' m</b> ≈ ' + flights + ' flights');
    }
    if (h.alt_max != null) bits.push('up to <b>' + h.alt_max + ' m</b>');
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
    if (w.wind != null) bits.push('💨 ' + Math.round(w.wind) + ' km/h');
    if (w.precip) bits.push('💧 ' + w.precip + ' mm');
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
    if (map || !window.L || !root._mapdiv) return;
    if (root._mapdiv.offsetParent === null) return;   // hidden (mobile app shell) — skip until visible
    map = L.map(root._mapdiv, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map);
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
    if (typeof updateTopbar === 'function') updateTopbar();
    updateHash();
  }

  function renderDay(day) {
    const story = root._story;
    lightboxFulls = []; lightboxMeta = []; lightboxIdx = -1;
    for (const k in markersByPlace) delete markersByPlace[k];

    let html = '<div class="dcc-tour-dayhead">' +
      '<div class="dcc-tour-daynum">Day ' + day.index + ' / ' + DATA.day_count + '</div>' +
      '<h2>' + escapeHtml(day.label) + '</h2>' +
      (day.area ? '<p class="dcc-tour-area">' + escapeHtml(day.area) + '</p>' : '') +
      (day.story ? '<p class="dcc-tour-daystory">' + escapeHtml(day.story) + '</p>' : '') +
      '<p class="dcc-tour-daymeta">' + dayCountLabel(day) + '</p>' +
      weatherHTML(day.weather) +
      healthRibbonHTML(day) +
      (day.health && day.health.elev ? elevSparkHTML(day.health.elev) : '') +
      '<div class="dcc-tour-dayactions">' +
      (day.health && (day.health.stepcurve || day.health.elev) ?
        '<button class="dcc-tour-chip dcc-tour-replay" id="dcc-replay">▶ Replay this day</button>' : '') +
      '<button class="dcc-tour-chip" id="dcc-shareday">↗ Share this day</button>' +
      '</div></div>';

    // Places default collapsed on phones (a big single-column day then reads as
    // a tappable itinerary) and open on desktop. The index bar below is a table
    // of contents: each chip scrolls to and opens its place.
    const placesOpenDefault = !window.matchMedia('(max-width: 800px)').matches;
    if (day.places.length > 1) {
      html += '<nav class="dcc-tour-places-index" aria-label="Places this day">' +
        '<button type="button" class="dcc-tour-idx-all" data-allopen="' + (placesOpenDefault ? '1' : '0') + '">' +
          (placesOpenDefault ? 'Collapse all' : 'Expand all') + '</button>' +
        '<div class="dcc-tour-idx-chips">' +
        day.places.map((p, pi) => '<button type="button" class="dcc-tour-idx-chip" data-goto="' + pi + '">' +
          '<b>' + (pi + 1) + '</b> ' + escapeHtml(shortName(p.name)) + '</button>').join('') +
        '</div></nav>';
    }

    const toMin = t => { const a = (t || '').split(':'); return a.length === 2 ? +a[0]*60 + +a[1] : null; };
    day.places.forEach((p, pi) => {
      const anchor = 'place-' + pi;
      const time = p.from === p.to ? p.from : (p.from + '–' + p.to);
      let cum = '';
      const mn = toMin(p.from);
      if (mn != null && day.health) {
        const st = interp(day.health.stepcurve, mn), cl = cumClimb(day.health.elev, mn);
        const bits = [];
        if (st != null) bits.push('≈' + fmt(st) + ' steps');
        if (cl) bits.push('↑' + cl + ' m');
        if (bits.length) cum = ' <span class="dcc-tour-place-cum">· ' + bits.join(' · ') + ' by now</span>';
      }
      const spent = p.mins ? ' · ' + (p.mins >= 60 ? (p.mins/60).toFixed(1) + ' h' : p.mins + ' min') + ' here' : '';
      const openAttr = placesOpenDefault ? '1' : '0';
      html += '<section class="dcc-tour-place" id="' + anchor + '" data-open="' + openAttr + '">' +
        '<div class="dcc-tour-place-head" role="button" tabindex="0" aria-expanded="' + (openAttr === '1' ? 'true' : 'false') + '" aria-controls="media-' + pi + '">' +
          '<div class="dcc-tour-place-htext">' +
            '<h3>' + escapeHtml(p.name) + '</h3>' +
            '<span class="dcc-tour-place-meta">' + escapeHtml(time) + spent + ' · ' + plur(p.count, 'shot') + cum + ' ' + mapsLink(p.lat, p.lng, 'dcc-tour-maplink meta') + '</span>' +
          '</div>' +
          '<span class="dcc-tour-place-chevron" aria-hidden="true">▾</span>' +
        '</div>' +
        '<div class="dcc-tour-media" id="media-' + pi + '">' + p.items.map(renderItem).join('') + '</div>' +
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
    const sb = story.querySelector('#dcc-shareday');
    if (sb) sb.addEventListener('click', () => doShare(shareUrl('d=' + day.index), day.label));
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
    // GoPro clips (Drive): show a poster frame, load the player on tap
    if (item.type === 'drive') {
      const thumb = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(item.id) + '&sz=w400';
      return '<div class="dcc-tour-cell dcc-tour-play-cell" data-clip="' + escapeAttr(item.id) + '">' +
        '<img loading="lazy" src="' + escapeAttr(thumb) + '" alt="clip" onerror="this.classList.add(\'noimg\')">' +
        '<span class="dcc-tour-play">▶</span><span class="dcc-tour-badge">clip</span>' + cap(item) + extras + '</div>';
    }
    // self-hosted videos: show the poster frame, load the video on tap
    if (item.type === 'self_hosted') {
      const durb = '<span class="dcc-tour-badge">' + (item.dur ? fmtDur(item.dur) : 'video') + '</span>';
      const posterUrl = item.poster ? resolveUrl(item.poster) : '';
      if (!item.url)
        return posterUrl ? '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(posterUrl) + '" alt="video">' + durb + cap(item) + extras + '</div>' : '';
      return '<div class="dcc-tour-cell dcc-tour-play-cell" data-vsrc="' + escapeAttr(resolveUrl(item.url)) + '" data-poster="' + escapeAttr(posterUrl) + '">' +
        (posterUrl ? '<img loading="lazy" src="' + escapeAttr(posterUrl) + '" alt="video">' : '') +
        '<span class="dcc-tour-play">▶</span>' + durb + cap(item) + extras + '</div>';
    }
    // photo
    const full = item.full ? ' data-full="' + escapeAttr(resolveUrl(item.full)) + '"' : '';
    if (item.full) { lightboxFulls.push(resolveUrl(item.full)); lightboxMeta.push({ p: item.place, t: item.time }); }
    return '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(resolveUrl(item.src || item.full)) + '" alt=""' + full + ' />' + cap(item) + extras + '</div>';
  }
  function cap(item) {
    const alt = item.alt != null ? ' · ' + item.alt + ' m' : '';
    return '<span class="dcc-tour-cell-time">' + escapeHtml((item.time || '') + alt) + '</span>';
  }

  // ---- map: the day's route (numbered stops + connecting path) ----
  let dayLayer = null;
  function showDayOnMap(day) {
    if (!map) initMap();
    if (!map) return;   // story map hidden (mobile) — no work
    if (dayLayer) map.removeLayer(dayLayer);
    dayLayer = L.layerGroup().addTo(map);
    for (const k in markersByPlace) delete markersByPlace[k];
    const pts = [], line = [];
    day.places.forEach((p, pi) => {
      if (p.lat == null) return;
      pts.push([p.lat, p.lng]); line.push([p.lat, p.lng]);
      const icon = L.divIcon({ className: 'dcc-tour-numpin', html: String(pi + 1), iconSize: [26, 26], iconAnchor: [13, 13] });
      const m = L.marker([p.lat, p.lng], { title: p.name, icon });
      m.on('click', () => {
        const sec = root._story.querySelector('#place-' + pi);
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      m.addTo(dayLayer); markersByPlace[pi] = m;
    });
    if (line.length > 1) L.polyline(line, { color: '#7d5411', weight: 3, opacity: 0.6, dashArray: '3 6' }).addTo(dayLayer);
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

  // ---- collapsible place sections + jump-to-place index ----
  function setPlaceOpen(sec, open) {
    if (!sec) return;
    sec.dataset.open = open ? '1' : '0';
    const head = sec.querySelector('.dcc-tour-place-head');
    if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // ===== Lightbox (photos) + place navigation =====
  document.addEventListener('click', (e) => {
    if (e.target.closest('.dcc-tour-maplink')) return;
    // Expand all / Collapse all
    const idxAll = e.target.closest('.dcc-tour-idx-all');
    if (idxAll) {
      const open = idxAll.dataset.allopen !== '1';
      root._story.querySelectorAll('.dcc-tour-place').forEach(s => setPlaceOpen(s, open));
      idxAll.dataset.allopen = open ? '1' : '0';
      idxAll.textContent = open ? 'Collapse all' : 'Expand all';
      return;
    }
    // index chip → open that place and scroll to it
    const chip = e.target.closest('.dcc-tour-idx-chip');
    if (chip) {
      const sec = root._story.querySelector('#place-' + chip.dataset.goto);
      if (sec) { setPlaceOpen(sec, true); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    // tap a place header → toggle its photos
    const phead = e.target.closest('.dcc-tour-place-head');
    if (phead) {
      const sec = phead.closest('.dcc-tour-place');
      setPlaceOpen(sec, sec.dataset.open !== '1');
      return;
    }
    const cell = e.target.closest('.dcc-tour-play-cell');
    if (cell && !cell.dataset.activated) { activateMedia(cell); return; }
    const img = e.target.closest('.dcc-tour-media img[data-full]');
    if (img) { openLightbox(Math.max(0, lightboxFulls.indexOf(img.getAttribute('data-full')))); }
  });
  // keyboard: place headers are role=button, so activate on Enter/Space
  // (arrow-key day navigation already lives in the lightbox keydown handler)
  document.addEventListener('keydown', (e) => {
    const head = e.target.closest && e.target.closest('.dcc-tour-place-head');
    if (head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); head.click(); }
  });
  function activateMedia(cell) {
    cell.dataset.activated = '1';
    cell.classList.add('wide', 'activated');
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    if (cell.dataset.vsrc) {
      const v = document.createElement('video');
      v.src = cell.dataset.vsrc; if (cell.dataset.poster) v.poster = cell.dataset.poster;
      v.controls = true; v.autoplay = true; v.setAttribute('playsinline', '');
      cell.appendChild(v);
    } else if (cell.dataset.clip) {
      const f = document.createElement('iframe');
      f.src = 'https://drive.google.com/file/d/' + encodeURIComponent(cell.dataset.clip) + '/preview';
      f.allow = 'autoplay'; f.allowFullscreen = true;
      cell.appendChild(f);
    }
  }
  document.addEventListener('keydown', (e) => {
    if (lightboxIdx >= 0) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') showLightbox(lightboxIdx + 1);
      else if (e.key === 'ArrowLeft') showLightbox(lightboxIdx - 1);
      return;
    }
    // day navigation with arrow keys (when browsing the story, not typing)
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (DATA && (!root.dataset.view || root.dataset.view === 'story')) {
      if (e.key === 'ArrowRight' && curDay < DATA.day_count - 1) selectDay(curDay + 1);
      else if (e.key === 'ArrowLeft' && curDay > 0) selectDay(curDay - 1);
    }
  });
  function ensureLightboxEl() {
    let el = document.getElementById('dcc-tour-lightbox');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'dcc-tour-lightbox';
    el.className = 'dcc-tour-lightbox';
    el.innerHTML =
      '<button class="dcc-tour-lightbox-close" aria-label="Close">&times;</button>' +
      '<div class="dcc-tour-lightbox-count" aria-hidden="true"></div>' +
      '<div class="dcc-tour-lightbox-actions">' +
        '<a class="lb-act" id="dcc-lb-dl" download title="Download this photo">⬇</a>' +
        '<button class="lb-act" id="dcc-lb-share" title="Share this photo">↗</button></div>' +
      '<button class="dcc-tour-lightbox-nav prev" aria-label="Previous">&#8249;</button>' +
      '<img class="dcc-tour-lightbox-img" alt="" />' +
      '<button class="dcc-tour-lightbox-nav next" aria-label="Next">&#8250;</button>' +
      '<div class="dcc-tour-lightbox-cap"></div>';
    el.querySelector('#dcc-lb-share').addEventListener('click', () => {
      const u = lightboxFulls[lightboxIdx] || '';
      const g = (u.match(/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i) || [])[1];
      doShare(g ? shareUrl('ph=' + g) : u, 'A photo from Croatia 2025');
    });
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.classList.contains('dcc-tour-lightbox-close')) closeLightbox();
      else if (e.target.classList.contains('prev')) showLightbox(lightboxIdx - 1);
      else if (e.target.classList.contains('next')) showLightbox(lightboxIdx + 1);
    });
    // swipe (mobile) to move through photos
    let sx = null, sy = null;
    const img = el.querySelector('.dcc-tour-lightbox-img');
    img.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    img.addEventListener('touchend', e => {
      if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) showLightbox(lightboxIdx + (dx < 0 ? 1 : -1));
      sx = sy = null;
    }, { passive: true });
    document.body.appendChild(el);
    return el;
  }
  function openLightbox(idx) { if (lightboxFulls.length) { ensureLightboxEl(); showLightbox(idx); } }
  function showLightbox(idx) {
    if (!lightboxFulls.length) return;
    const n = lightboxFulls.length;
    lightboxIdx = ((idx % n) + n) % n;
    const el = ensureLightboxEl();
    const wasOpen = el.classList.contains('open');
    el.classList.add('open');
    el.querySelector('.dcc-tour-lightbox-img').src = lightboxFulls[lightboxIdx];
    const meta = lightboxMeta[lightboxIdx] || {};
    const cap = [meta.p, meta.t].filter(Boolean).join(' · ');
    el.querySelector('.dcc-tour-lightbox-cap').textContent = cap;
    el.querySelector('.dcc-tour-lightbox-count').textContent = (lightboxIdx + 1) + ' / ' + n;
    el.querySelector('#dcc-lb-dl').href = lightboxFulls[lightboxIdx];
    if (!wasOpen) { lbPrevFocus = document.activeElement; el.querySelector('.dcc-tour-lightbox-close').focus(); }
    document.body.classList.add('dcc-tour-noscroll');
  }
  let lbPrevFocus = null;
  function closeLightbox() {
    lightboxIdx = -1;
    const el = document.getElementById('dcc-tour-lightbox');
    if (el) el.classList.remove('open');
    document.body.classList.remove('dcc-tour-noscroll');
    if (lbPrevFocus && lbPrevFocus.focus) { try { lbPrevFocus.focus(); } catch (e) {} lbPrevFocus = null; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
