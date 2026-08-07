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
  let viewerItems = [], viewerIdx = -1;   // unified list of ALL media (photos+videos+clips) in the active view
  const markersByPlace = {};

  // ---- units (task 8): default Imperial; a header toggle flips distance,
  //      elevation and temperature everywhere, live ----
  let unitSys = 'imperial';                 // 'imperial' | 'metric'
  const imp = () => unitSys === 'imperial';
  // distance is stored in the data two ways: km (walk_km / trip_walk_km) and mi
  // (the Apple Watch dist). Helpers below take the source unit and format for display.
  function distFromKm(km, dec) { dec = dec == null ? 1 : dec; return (imp() ? km * 0.621371 : km).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' ' + distUnit(); }
  function distNumFromKm(km, dec) { dec = dec == null ? 1 : dec; return +((imp() ? km * 0.621371 : km).toFixed(dec)); }
  function distNumFromMi(mi, dec) { dec = dec == null ? 1 : dec; return +((imp() ? mi : mi * 1.60934).toFixed(dec)); }
  function distUnit() { return imp() ? 'mi' : 'km'; }
  // elevation / altitude is stored in metres
  function elevNumFromM(m) { return Math.round(imp() ? m * 3.28084 : m); }
  function elevFromM(m) { return fmt(elevNumFromM(m)) + ' ' + elevUnit(); }
  function elevUnit() { return imp() ? 'ft' : 'm'; }
  // temperature is stored in °C
  function tempFromC(c) { return Math.round(imp() ? c * 9 / 5 + 32 : c) + '°' + (imp() ? 'F' : 'C'); }
  function windFromKmh(kmh) { return imp() ? Math.round(kmh * 0.621371) + ' mph' : Math.round(kmh) + ' km/h'; }
  function precipFromMm(mm) { return imp() ? (mm / 25.4).toFixed(2) + ' in' : mm + ' mm'; }
  const _WDIR = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function windDirName(deg) { return _WDIR[Math.round((deg % 360) / 45) % 8]; }
  function toggleUnits() { unitSys = imp() ? 'metric' : 'imperial'; applyUnits(); }
  function unitToggleHTML(cls) {
    return '<button class="dcc-unit-toggle ' + (cls || '') + '" id="dcc-units-' + (cls || 'x') + '" role="switch" ' +
      'aria-checked="' + (imp() ? 'false' : 'true') + '" title="Switch measurements (imperial / metric)" aria-label="Switch between imperial and metric units">' +
      '<span class="uni-opt uni-imp' + (imp() ? ' on' : '') + '">mi·ft·°F</span>' +
      '<span class="uni-opt uni-met' + (imp() ? '' : ' on') + '">km·m·°C</span></button>';
  }
  // re-render everything that shows a converted number after a units flip
  function applyUnits() {
    refreshHeaderStats();
    const ovb = root.querySelector('.dcc-tour-overview .ov-body');
    if (ovb) { ovb.innerHTML = overviewHTML(); bindClimbChart(root.querySelector('.dcc-tour-overview')); bindVizTimeline(root.querySelector('.dcc-tour-overview')); }
    const cur = curDay;
    if (root.querySelector('.dcc-tour-daychip.active')) {
      const ov = root.querySelector('.dcc-tour-overview');
      if (ov) ov.querySelectorAll('.tread').forEach((r, j) => r.classList.toggle('on', j === cur));
    }
    const v = root.dataset.view || 'story';
    if (v === 'story') renderDay(DATA.days[curDay]);
    else if (v === 'stats') { renderStatsViz(); animateCounts(root); }
    if (mmMap) { renderMapLegend(); renderMapMode(); }   // altitude legend carries m/ft — rebuild it too
    root.querySelectorAll('.dcc-unit-toggle').forEach(btn => {
      btn.setAttribute('aria-checked', imp() ? 'false' : 'true');
      const i = btn.querySelector('.uni-imp'), m = btn.querySelector('.uni-met');
      if (i) i.classList.toggle('on', imp()); if (m) m.classList.toggle('on', !imp());
    });
  }
  // ---- background music: two self-hosted, lazy-loaded songs ----
  // regular mode -> "Far Away Places" (manual only, via the play/pause button)
  // matrix mode  -> "Masters of the Universe" (auto-plays + loops while matrix is on)
  // A video/clip on screen suppresses whichever song is playing until it closes;
  // photos never suppress it. Files load only on first play (preload="none").
  const MUSIC = (function () {
    let regEl = null, mtxEl = null;
    let wantReg = false;    // user asked the regular song to play (play/pause button)
    let wantMtx = false;    // matrix song wanted (set true whenever matrix mode starts)
    let mtxMode = false;    // matrix easter-egg active
    let videoOpen = false;  // a video/clip is on screen -> mute music until it closes
    function make(file, vol) {
      const a = new Audio();
      a.src = baseURL + 'audio/' + file;
      a.loop = true; a.preload = 'none'; a.volume = vol;
      return a;
    }
    function activeEl() {
      return mtxMode ? (mtxEl || (mtxEl = make('masters-of-the-universe.mp3', 0.7)))
                     : (regEl || (regEl = make('far-away-places.mp3', 0.6)));
    }
    function want() { return mtxMode ? wantMtx : wantReg; }
    function updateBtns(playing) {
      root.querySelectorAll('.dcc-music-toggle').forEach(function (b) {
        b.classList.toggle('playing', !!playing);
        b.setAttribute('aria-pressed', playing ? 'true' : 'false');
        b.title = playing ? 'Pause music' : 'Play music';
      });
    }
    function sync() {
      const other = mtxMode ? regEl : mtxEl;        // pause the off-mode song
      if (other) other.pause();
      const shouldPlay = want() && !videoOpen;
      const a = activeEl();
      if (shouldPlay) a.play().catch(function () {}); else a.pause();
      updateBtns(shouldPlay);
    }
    return {
      // play/pause button: toggles intent for the current mode's song
      toggle: function () { if (mtxMode) wantMtx = !wantMtx; else wantReg = !wantReg; sync(); },
      // matrix on -> auto-play its song; matrix off -> fall back to regular intent
      setMatrix: function (on) { mtxMode = on; if (on) wantMtx = true; sync(); },
      // a video/clip opened (true) or closed (false)
      setVideoOpen: function (on) { if (videoOpen === on) return; videoOpen = on; sync(); }
    };
  })();
  function musicToggleHTML(cls) {
    // use the themed SVG play/pause glyphs (same as the map's player) so the icon
    // renders identically on every device — plain "▶/❚❚" text turns into off-theme
    // colour emoji on many phones, which is why the mobile button looked wrong.
    return '<button class="dcc-music-toggle ' + (cls || '') + '" type="button" aria-pressed="false" ' +
      'title="Play music" aria-label="Play or pause background music">' +
      '<span class="mus-ico" aria-hidden="true"><span class="mus-play">' + PLAY_GLYPH + '</span>' +
      '<span class="mus-pause">' + PAUSE_GLYPH + '</span></span></button>';
  }

  // ---- date labels (task 10): show the calendar date, never "Day N" ----
  const _MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const _DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function _ymd(d) { const a = (d.date || '').split('-').map(Number); return { y: a[0], m: a[1], dd: a[2] }; }
  function dDate(d) { const { m, dd } = _ymd(d); return (_MON[m - 1] || '') + ' ' + dd; }          // "Sep 10"
  function dWeekday(d) { const { y, m, dd } = _ymd(d); return _DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] || ''; }

  // ---- horizontal-scroll affordance (task 9): an ALWAYS-VISIBLE custom
  //      scrollbar (a real track + draggable thumb rendered under each strip),
  //      since native scrollbars auto-hide on mobile and the edge fade was too
  //      subtle. The rail shows only when the strip actually overflows. ----
  function updateRail(el) {
    const rail = el._rail; if (!rail) return;
    const over = el.scrollWidth - el.clientWidth > 2;
    rail.style.display = over ? 'block' : 'none';
    if (!over) return;
    const railW = rail.clientWidth || el.clientWidth || 1;
    const tw = Math.max(28, railW * el.clientWidth / el.scrollWidth);
    const maxScroll = el.scrollWidth - el.clientWidth;
    const tl = maxScroll > 0 ? (railW - tw) * (el.scrollLeft / maxScroll) : 0;
    rail._thumb.style.width = tw + 'px';
    rail._thumb.style.transform = 'translateX(' + tl.toFixed(1) + 'px)';
  }
  function enhanceHScroll(el, mount) {
    if (!el) return;
    el.classList.add('dcc-hscroll');
    mount = mount || el;
    if (!el._rail && mount.parentNode) {
      const rail = document.createElement('div'); rail.className = 'dcc-rail';
      const thumb = document.createElement('div'); thumb.className = 'dcc-rail-thumb';
      rail.appendChild(thumb); rail._thumb = thumb; el._rail = rail;
      mount.parentNode.insertBefore(rail, mount.nextSibling);
      el.addEventListener('scroll', () => updateRail(el), { passive: true });
      // drag the thumb (pointer capture keeps it tracking outside the rail; no leaked listeners)
      let sx = 0, sl = 0, drag = false;
      thumb.addEventListener('pointerdown', e => { drag = true; sx = e.clientX; sl = el.scrollLeft; thumb.setPointerCapture(e.pointerId); document.body.classList.add('dcc-rail-dragging'); e.preventDefault(); e.stopPropagation(); });
      thumb.addEventListener('pointermove', e => { if (!drag) return; const ratio = el.scrollWidth / (rail.clientWidth || 1); el.scrollLeft = sl + (e.clientX - sx) * ratio; });
      const end = e => { if (!drag) return; drag = false; try { thumb.releasePointerCapture(e.pointerId); } catch (_) {} document.body.classList.remove('dcc-rail-dragging'); };
      thumb.addEventListener('pointerup', end); thumb.addEventListener('pointercancel', end);
      // click the track to jump there
      rail.addEventListener('pointerdown', e => { if (e.target === thumb) return; const r = rail.getBoundingClientRect(); const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); el.scrollLeft = frac * (el.scrollWidth - el.clientWidth); });
    }
    requestAnimationFrame(() => updateRail(el));
  }
  function enhanceAllHScroll() {
    root.querySelectorAll('.dcc-tour-mm-legend, .dcc-tour-tripstats, .dcc-tour-superlatives, .wx-ribbon').forEach(el => enhanceHScroll(el));
    // idx-chips lives inside a flex row — mount its rail after that row so it sits below, full width
    root.querySelectorAll('.dcc-tour-idx-chips').forEach(el => enhanceHScroll(el, el.closest('.dcc-tour-places-index') || el));
  }

  fetch(baseURL + 'trip.json').then(r => r.json()).then(data => {
    DATA = data;
    // stamp each media item with its day's date so the viewer caption can show it
    (DATA.days || []).forEach(d => (d.places || []).forEach(p => (p.items || []).forEach(it => {
      it._date = d.date; it._dlabel = dDate(d);
    })));
    const initialHash = location.hash;   // capture before selectDay/updateHash rewrites it
    buildShell();
    initMap();
    selectDay(0);
    if (initialHash.length > 1) applyHash(initialHash);
    else setView('map');   // task 6: Map is the default tab
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
      '<p class="dcc-tour-subtitle">' + escapeHtml(t.subtitle || '') + '</p>');
    // trip-stat tiles live in their own strip BELOW the tab selector (Stats view only),
    // so the tab selector always sits right under the heading — same spot on every tab
    const tripstats = el('div', 'dcc-tour-tripstats-wrap', tripStatsHTML());
    const nav = el('nav', 'dcc-tour-daynav');
    nav.setAttribute('aria-label', 'Days');
    DATA.days.forEach((d, i) => {
      const b = document.createElement('button');
      b.className = 'dcc-tour-daychip';
      b.dataset.day = i;
      const cv = coverSrc(d);
      b.innerHTML = (cv ? '<img class="d-thumb" loading="lazy" src="' + escapeAttr(cv) + '" alt="">' : '') +
                    '<span class="d-n">' + escapeHtml(dDate(d)) + '</span>' +
                    '<span class="d-d">' + escapeHtml(dWeekday(d)) + '</span>' +
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
    // task 5: draggable divider so the reader can give the map more or less room
    const divider = el('div', 'dcc-tour-divider');
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    divider.setAttribute('tabindex', '0');
    divider.setAttribute('aria-label', 'Drag to resize the map column');
    divider.innerHTML = '<span class="dcc-tour-divgrip" aria-hidden="true"></span>';
    body.appendChild(story); body.appendChild(divider); body.appendChild(mapwrap);
    bindDivider(divider, body);
    // trip overview (climbs + staircase): collapsed on mobile, open on desktop
    const overview = el('div', 'dcc-tour-overview');
    const ovd = document.createElement('details');
    ovd.className = 'dcc-tour-ovcollapse';
    ovd.open = true;   // task 15: the overview only appears in Stats view (summary hidden there),
                       // so keep it open — a collapsed <details> was hiding the climb chart on mobile
    ovd.innerHTML = '<summary>📈 Trip overview · climbs &amp; elevation</summary>' +
      '<div class="ov-body">' + overviewHTML() + '</div>';
    overview.appendChild(ovd);
    const controls = buildControls();
    const modeToggle = buildModeToggle();
    const mapmode = buildMapMode();
    const statsviz = el('div', 'dcc-tour-statsviz');   // task 3: extra data-viz, Stats view only
    root.appendChild(header); root.appendChild(modeToggle); root.appendChild(tripstats); root.appendChild(nav); root.appendChild(controls);
    root.appendChild(overview); root.appendChild(statsviz); root.appendChild(body); root.appendChild(mapmode);
    root._story = story; root._mapdiv = mapdiv; root._nav = nav; root._mapmode = mapmode; root._statsviz = statsviz;
    bindClimbChart(overview);
    bindVizTimeline(overview);
    animateCounts(header); wireTips();
    buildAppShell();
    enhanceAllHScroll();
    window.addEventListener('resize', enhanceAllHScroll);
  }

  // task 5: drag (or arrow-key) the divider to set the map column width, stored
  // in the --dcc-map-w custom property the body grid reads. Desktop only.
  function bindDivider(divider, body) {
    const MIN = 240;                                  // never shrink the map below this
    const clampW = w => {
      const bw = body.getBoundingClientRect().width || 900;
      return Math.max(MIN, Math.min(bw - 320, w));    // and always leave room for the story
    };
    const setW = w => { root.style.setProperty('--dcc-map-w', clampW(w) + 'px'); if (map) setTimeout(() => map.invalidateSize(), 0); };
    let dragging = false;
    const move = e => {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      setW(body.getBoundingClientRect().right - x);
      e.preventDefault();
    };
    const up = () => { dragging = false; document.body.classList.remove('dcc-tour-resizing'); };
    divider.addEventListener('pointerdown', e => { dragging = true; document.body.classList.add('dcc-tour-resizing'); divider.setPointerCapture && divider.setPointerCapture(e.pointerId); });
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
    divider.addEventListener('pointercancel', up);
    divider.addEventListener('keydown', e => {
      const cur = parseFloat(getComputedStyle(root).getPropertyValue('--dcc-map-w')) ||
        body.querySelector('.dcc-tour-mapwrap').getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') { setW(cur + 40); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setW(cur - 40); e.preventDefault(); }
    });
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
      '<div class="tb-tools">' + unitToggleHTML('unit-mob') + musicToggleHTML('unit-mob') + '</div>';
    tb.querySelector('.tb-prev').addEventListener('click', () => { if (curDay > 0) selectDay(curDay - 1); });
    tb.querySelector('.tb-next').addEventListener('click', () => { if (curDay < DATA.day_count - 1) selectDay(curDay + 1); });
    tb.querySelector('.dcc-unit-toggle').addEventListener('click', toggleUnits);
    tb.querySelector('.dcc-music-toggle').addEventListener('click', () => MUSIC.toggle());
    tb.querySelector('#dcc-tb-day').addEventListener('click', openDaySheet);

    const bar = el('nav', 'dcc-tour-tabbar');
    bar.setAttribute('aria-label', 'Sections');
    bar.setAttribute('role', 'tablist');
    bar.innerHTML = tabBtn('story', 'Timeline') + tabBtn('gallery', 'Media') +
      tabBtn('map', 'Map') + tabBtn('stats', 'Stats');
    bar.querySelectorAll('.dcc-tour-tabbtn[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    const sheet = el('div', 'dcc-tour-sheet'); sheet.hidden = true;
    sheet.innerHTML = '<div class="sheet-bd"></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-label="Jump to a day"><div class="sheet-handle"></div>' +
      '<h4>Jump to a day</h4>' +
      '<div class="sheet-days">' +
      DATA.days.map((d, i) => '<button class="sheet-day" data-day="' + i + '">' +
        (coverSrc(d) ? '<img class="sd-thumb" loading="lazy" src="' + escapeAttr(coverSrc(d)) + '" alt="">' : '') +
        '<span class="sd-txt"><b>' + escapeHtml(dWeekday(d).slice(0, 3) + ' · ' + dDate(d)) + '</b></span>' +
        '<span class="sd-c">' + d.count + '</span></button>').join('') + '</div></div>';
    sheet.querySelector('.sheet-bd').addEventListener('click', closeDaySheet);
    sheet.querySelectorAll('.sheet-day').forEach(b => b.addEventListener('click', () => { closeDaySheet(); setView('story'); selectDay(+b.dataset.day); }));

    // place the sticky day-selector just BELOW the header (not above it), so the
    // site header leads the Timeline tab like it does on Photos/Map/Stats
    const hdr = root.querySelector('.dcc-tour-header');
    root.insertBefore(tb, hdr ? hdr.nextSibling : root.firstChild); root.appendChild(bar); root.appendChild(sheet);
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
    else if (v === 'stats') { renderStatsViz(); animateCounts(root); }
    else if (v === 'gallery') buildGallery();
    else if (v === 'story') {
      // under a person filter, don't land on a day they didn't shoot
      if (personOn() && dayVisibleCount(DATA.days[curDay]) === 0) {
        const j = DATA.days.findIndex(d => dayVisibleCount(d) > 0);
        if (j >= 0) { selectDay(j); return; }
      }
      renderDay(DATA.days[curDay]);  // rebuild the day's own lightbox set
    }
    updateHash();
    window.scrollTo({ top: 0 });
    // strips measured while their view was hidden read 0 width; recompute the
    // scroll-fade hints now that this view is visible
    requestAnimationFrame(enhanceAllHScroll);
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
    if (di != null) {
      // a day link always means the Timeline — switch views if the panel is hidden
      if (root.dataset.view && root.dataset.view !== 'story') setView('story');
      if (di !== curDay) selectDay(di);
    }
    if (m.p != null) setTimeout(() => {
      const sec = root._story.querySelector('#place-' + (+m.p));
      if (sec) { sec.scrollIntoView({ block: 'start' }); sec.classList.add('dcc-tour-flash'); setTimeout(() => sec.classList.remove('dcc-tour-flash'), 1600); }
    }, 150);
    if (m.ph) setTimeout(() => {
      const i = viewerItems.findIndex(v => (v.full || v.src || v.url || v.id || '').indexOf(m.ph) >= 0);
      if (i >= 0) openViewer(i);
    }, 250);
  }
  // ---- share helpers ----
  function shareUrl(extra) { return location.href.split('#')[0] + '#' + extra; }
  function doShare(url, title) {
    if (navigator.share) { navigator.share({ url: url, title: title || 'Crofts in Croatia' }).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(url).then(() => toast('Link copied ✓'), () => toast(url));
    else toast(url);
  }
  function toast(msg) {
    let t = document.getElementById('dcc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'dcc-toast'; t.className = 'dcc-tour-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function updateTopbar() {
    if (!root._topbar) return;
    const d = DATA.days[curDay];
    // weekday as the small eyebrow, the date once below — no duplicated day number, no (misleading) single area
    root._topbar.querySelector('#dcc-tb-num').textContent = dWeekday(d);
    root._topbar.querySelector('#dcc-tb-lab').textContent = dDate(d) + '  ▾';
    root._topbar.querySelector('.tb-prev').disabled = curDay <= 0;
    root._topbar.querySelector('.tb-next').disabled = curDay >= DATA.day_count - 1;
  }
  function openDaySheet() {
    const s = root._sheet; if (!s) return;
    s.hidden = false; requestAnimationFrame(() => s.classList.add('open'));
  }
  function closeDaySheet() { const s = root._sheet; if (s) { s.classList.remove('open'); setTimeout(() => { s.hidden = true; }, 220); } }
  function attachSwipe(elm) {
    if (!elm) return; let x0 = null, y0 = null;
    elm.addEventListener('touchstart', e => {
      // don't hijack horizontally-scrolling strips
      if (e.target.closest('.dcc-tour-tripstats, .dcc-tour-superlatives, .dcc-tour-places-index, .dcc-tour-idx-chips')) { x0 = y0 = null; return; }
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

  // ---- global photographer filter (multi-select): limit the whole app to chosen people ----
  let personFilter = new Set();            // empty = everyone; else any of 'Rob'|'Erica'|'Alice'|'GoPro'
  function personOn() { return personFilter.size > 0; }
  function personLabel() { return [...personFilter].join(', '); }
  function itemPasses(it) { return !personFilter.size || personFilter.has(it.person); }
  function placeItems(p) { return personFilter.size ? p.items.filter(itemPasses) : p.items; }
  function placeCount(p) { return personFilter.size ? placeItems(p).length : p.count; }
  function dayVisibleCount(d) { return personFilter.size ? d.places.reduce((s, p) => s + placeCount(p), 0) : d.count; }
  // toggle one person (null = clear all); then refresh every view
  function setPersonFilter(name) {
    if (!name) personFilter.clear();
    else if (personFilter.has(name)) personFilter.delete(name);
    else personFilter.add(name);
    applyPersonFilter();
  }
  function applyPersonFilter() {
    mmSeq = null;                           // rebuild the play sequence for the new scope
    syncFilterUI();
    refreshHeaderStats();                   // the trip-stat tiles live in the always-visible header
    const v = root.dataset.view || 'story';
    if (v === 'story') {
      // if the current day has nothing by these people, hop to the first day that does
      if (personOn() && dayVisibleCount(DATA.days[curDay]) === 0) {
        const j = DATA.days.findIndex(d => dayVisibleCount(d) > 0);
        if (j >= 0) { selectDay(j); return; }
      }
      renderDay(DATA.days[curDay]); showDayOnMap(DATA.days[curDay]);
    }
    else if (v === 'gallery') renderGallery();
    else if (v === 'map') { mmStopPlay(); if (mmMap) { const s = root._mapmode.querySelector('#mm-scrub'); if (s) s.max = Math.max(0, buildPlaySeq().length - 1); mmPlayIdx = 0; renderMapLegend(); renderMapMode(); if (mmPlayLayer) mmPlayLayer.clearLayers(); const mo = root._mapmode.querySelector('#mm-moment'); if (mo) mo.hidden = true; const lab = root._mapmode.querySelector('#mm-playlabel'); if (lab) lab.textContent = ''; } }
  }
  function refreshHeaderStats() {
    const hd = root.querySelector('.dcc-tour-header'); if (!hd) return;
    hd.innerHTML = '<h1 class="dcc-tour-title">' + escapeHtml((DATA.trip || {}).name || 'Our trip') + '</h1>' +
      '<p class="dcc-tour-subtitle">' + escapeHtml((DATA.trip || {}).subtitle || '') + '</p>';
    const ts = root.querySelector('.dcc-tour-tripstats-wrap');
    if (ts) { ts.innerHTML = tripStatsHTML(); animateCounts(ts); }
    enhanceAllHScroll();
  }
  // keep every person control (Photos dropdown + map legend + day rail) in sync
  function syncFilterUI() {
    root.querySelectorAll('.dcc-personopt input').forEach(cb => cb.checked = personFilter.has(cb.value));
    const pb = root.querySelector('#dcc-person-badge');
    if (pb) { pb.hidden = !personOn(); pb.textContent = personFilter.size; }
    root.querySelectorAll('.mm-legend-person .dcc-tour-legseg').forEach(seg =>
      seg.classList.toggle('sel', personFilter.has(seg.dataset.person)));
    if (root._nav) root._nav.querySelectorAll('.dcc-tour-daychip').forEach((b, i) => {
      const n = dayVisibleCount(DATA.days[i]);
      const c = b.querySelector('.d-c'); if (c) c.textContent = n;
      b.classList.toggle('dimmed', personOn() && n === 0);
    });
  }
  function lerpHex(h1, h2, f) {
    const p = x => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
    const c1 = p(h1), c2 = p(h2), m = i => Math.round(c1[i] + (c2[i] - c1[i]) * f);
    return 'rgb(' + m(0) + ',' + m(1) + ',' + m(2) + ')';
  }
  const ALT_MAX = 412;  // Mount Srđ
  const ALT_STOPS = [[0, '#2b7a9b'], [0.5, '#6a9a5b'], [1, '#c9992e']];  // sea → hills → peak
  // gamma < 1 stretches the low end so the stairs/hills/cliffs we actually climbed
  // (mostly < 100 m) spread across the ramp instead of all reading as sea-level blue
  const ALT_GAMMA = 0.42;
  function altColor(m) {
    const t = Math.pow(Math.max(0, Math.min(1, (m || 0) / ALT_MAX)), ALT_GAMMA);
    let a = ALT_STOPS[0], b = ALT_STOPS[ALT_STOPS.length - 1];
    for (let i = 0; i < ALT_STOPS.length - 1; i++) if (t >= ALT_STOPS[i][0] && t <= ALT_STOPS[i + 1][0]) { a = ALT_STOPS[i]; b = ALT_STOPS[i + 1]; break; }
    return lerpHex(a[1], b[1], b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]));
  }
  // dot colour in "Color by Who": the dominant shooter AMONG THE VISIBLE items, so
  // filtering to one person paints their dots that person's colour (a place has many
  // shooters; unfiltered, the dot still shows whoever shot the most there).
  function placeDominantPerson(p) {
    const c = {}; placeItems(p).forEach(it => { if (it.person) c[it.person] = (c[it.person] || 0) + 1; });
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
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="gallery">' + svgIcon('gallery') + '<span>Media</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="map">' + svgIcon('map') + '<span>Map</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="stats">' + svgIcon('stats') + '<span>Stats</span></button>' +
      '<span class="dcc-tour-modespacer"></span>' + unitToggleHTML('unit-desk') + musicToggleHTML('unit-desk');
    w.querySelectorAll('.dcc-tour-modebtn[data-view]').forEach(b =>
      b.addEventListener('click', () => setView(b.dataset.view)));
    w.querySelector('.dcc-unit-toggle').addEventListener('click', toggleUnits);
    w.querySelector('.dcc-music-toggle').addEventListener('click', () => MUSIC.toggle());
    return w;
  }
  function buildMapMode() {
    const w = el('section', 'dcc-tour-mapmode');
    const dayOpts = DATA.days.map((d, i) =>
      '<option value="' + i + '">' + escapeHtml(d.short) + '</option>').join('');
    // layer toggles collapse into one "Layers ▾" dropdown (facet styling, like Photos)
    const layerOpt = (id, label, checked, hid) =>
      '<label class="facet-opt"' + (hid ? ' id="' + hid + '" hidden' : '') + '><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="facet-lab">' + label + '</span></label>';
    w.innerHTML =
      '<div class="dcc-tour-mm-bar">' +
        '<span class="dcc-tour-mm-colorby" role="group" aria-label="Color markers by">' +
          '<span class="mm-cb-lab">Color by:</span>' +
          '<button class="mm-cb active" data-mode="day" aria-pressed="true">Day</button>' +
          '<button class="mm-cb" data-mode="person" aria-pressed="false">Who</button>' +
          '<button class="mm-cb" data-mode="alt" aria-pressed="false">Altitude</button>' +
        '</span>' +
        '<div class="dcc-tour-facet dcc-tour-mm-layers" data-facet="layers">' +
          '<button type="button" class="facet-btn" aria-expanded="false">Layers<span class="facet-caret" aria-hidden="true">▾</span></button>' +
          '<div class="facet-panel" hidden><div class="facet-list">' +
            layerOpt('mm-path', 'Path', false) +
            layerOpt('mm-facing', 'Facing', true) +
            layerOpt('mm-labels', 'Place labels', true) +
            layerOpt('mm-heat', 'Heatmap', false) +
            layerOpt('mm-sat', 'Satellite', true) +
            layerOpt('mm-track', 'GPS track', true, 'mm-track-opt') +
            layerOpt('mm-saved', 'Saved spots', false, 'mm-saved-opt') +
          '</div></div>' +
        '</div>' +
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
          '<button class="mm-spd active" data-spd="1" aria-pressed="true">1×</button>' +
          '<button class="mm-spd" data-spd="2" aria-pressed="false">2×</button>' +
          '<button class="mm-spd" data-spd="4" aria-pressed="false">4×</button>' +
        '</span>' +
        '<span class="dcc-tour-mm-playlabel" id="mm-playlabel"></span>' +
      '</div>' +
      '<div class="dcc-tour-mm-divider" aria-hidden="true"></div>' +      // task 10: separate controls from map/legend
      '<div class="dcc-tour-mm-legend" id="mm-legend"></div>' +          // task 8: legend above the map
      '<div class="dcc-tour-mm-wrap"><div class="dcc-tour-mm-map" id="dcc-mm-map"></div>' +
        '<button class="dcc-tour-mm-fs" id="mm-fs" type="button" title="Full screen" aria-label="Full screen">⛶</button>' +
        '<figure class="dcc-tour-mm-moment" id="mm-moment" hidden></figure>' +
        '<aside class="dcc-tour-mm-side" id="dcc-mm-side" hidden></aside></div>';
    return w;
  }
  let mmMap = null, mmMarkers = null, mmPathLayer = null, mmHeat = null, mmSat = null, mmLabelLayer = null, mmInit = false;
  let mmPts = [];
  // Overlapping spots (places we revisited sit at nearly the same point and can't
  // all be clicked): on click, gather every marker within ~22px and, if more than
  // one, show a menu to pick which one to open. Otherwise open it directly.
  function pickMarker(di, pi, clickLL) {
    const cp = mmMap.latLngToLayerPoint(clickLL);
    const near = mmPts.filter(o => mmMap.latLngToLayerPoint(o.ll).distanceTo(cp) <= 40);
    if (near.length <= 1) { openMapSidebar(di, pi); return; }
    const html = '<div class="mm-pick"><b>' + near.length + ' spots here</b>' +
      near.map((o, i) => '<button class="mm-pick-b" data-i="' + i + '">' +
        escapeHtml(o.p.name) + ' · ' + escapeHtml(o.d.short) + ' · ' + placeCount(o.p) + '</button>').join('') + '</div>';
    const pop = L.popup({ maxHeight: 240, className: 'mm-pick-pop' }).setLatLng(clickLL).setContent(html).openOn(mmMap);
    setTimeout(() => {
      pop.getElement().querySelectorAll('.mm-pick-b').forEach(b =>
        b.addEventListener('click', () => { const o = near[+b.dataset.i]; mmMap.closePopup(pop); openMapSidebar(o.di, o.pi); }));
    }, 0);
  }
  let mmRange = [0, 0];
  let mmIsolateDay = null;   // legend day-tap isolates one day (separate from the From/To range)
  function toggleMapFullscreen() {
    const wrap = root._mapmode.querySelector('.dcc-tour-mm-wrap');
    if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); return; }
    if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => { wrap.classList.toggle('mm-fs-fallback'); mmMap && setTimeout(() => mmMap.invalidateSize(), 120); });
    else { wrap.classList.toggle('mm-fs-fallback'); mmMap && setTimeout(() => mmMap.invalidateSize(), 120); }
  }
  function initMapMode() {
    if (mmInit) { setTimeout(() => mmMap.invalidateSize(), 60); return; }
    mmInit = true;
    mmRange = [0, DATA.day_count - 1];
    // cap zoom at 18 so Esri never serves its "Map data not yet available"
    // placeholder tile (its imagery/reference layers run out past ~18 here) — task 3
    mmMap = L.map('dcc-mm-map', { scrollWheelZoom: true, maxZoom: 21 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mmMap);
    // satellite = a hybrid (imagery + roads + place/boundary labels), ON by default (task 6)
    mmSat = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 18, attribution: 'Imagery &copy; Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 18 }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 18 }),
    ]).addTo(mmMap);
    mmLabelLayer = L.layerGroup().addTo(mmMap);   // curated place labels (below markers)
    mmMarkers = L.layerGroup().addTo(mmMap);
    mmPathLayer = L.layerGroup().addTo(mmMap);
    // task 6: hide the facing arrows when zoomed out (they clutter the whole-trip view)
    const FACE_MIN_ZOOM = 13;
    const syncFaceZoom = () => mmMap.getContainer().classList.toggle('mm-lowzoom', mmMap.getZoom() < FACE_MIN_ZOOM);
    mmMap.on('zoomend', () => { syncFaceZoom(); renderMapLabels(); }); syncFaceZoom();
    const m = root._mapmode;
    m.querySelector('#mm-path').addEventListener('change', renderMapMode);
    m.querySelector('#mm-heat').addEventListener('change', renderMapMode);
    m.querySelector('#mm-sat').addEventListener('change', e => { if (e.target.checked) mmSat.addTo(mmMap); else mmMap.removeLayer(mmSat); });
    m.querySelector('#mm-track').addEventListener('change', e => toggleTrack(e.target.checked));
    m.querySelector('#mm-saved').addEventListener('change', e => toggleSaved(e.target.checked));
    // reveal the optional-overlay toggles only when their data ships with the bundle
    loadJSON('track.json').then(d => { mmTrackData = d; m.querySelector('#mm-track-opt').hidden = false;
      if (m.querySelector('#mm-track').checked) toggleTrack(true); }).catch(() => {});
    loadJSON('saved.json').then(d => { mmSavedData = d; m.querySelector('#mm-saved-opt').hidden = false; }).catch(() => {});
    // Layers ▾ dropdown open/close
    const lf = m.querySelector('.dcc-tour-mm-layers'), lfb = lf.querySelector('.facet-btn'), lfp = lf.querySelector('.facet-panel');
    lfb.addEventListener('click', e => { e.stopPropagation(); const wc = lfp.hidden; lfp.hidden = !wc; lfb.setAttribute('aria-expanded', wc ? 'true' : 'false'); });
    lfp.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => { lfp.hidden = true; lfb.setAttribute('aria-expanded', 'false'); });
    m.querySelector('#mm-fs').addEventListener('click', toggleMapFullscreen);
    document.addEventListener('fullscreenchange', () => { if (mmMap) setTimeout(() => mmMap.invalidateSize(), 120); });
    const lo = m.querySelector('#mm-lo'), hi = m.querySelector('#mm-hi');
    hi.value = DATA.day_count - 1;
    // task 4: never offer an out-of-order range — disable "to" days before "from" (and vice-versa)
    const syncRangeBounds = () => {
      const a = +lo.value, b = +hi.value;
      hi.querySelectorAll('option').forEach(o => o.disabled = +o.value < a);
      lo.querySelectorAll('option').forEach(o => o.disabled = +o.value > b);
    };
    const onRange = () => {
      let a = +lo.value, b = +hi.value; if (a > b) { const t = a; a = b; b = t; }
      mmRange = [a, b]; mmIsolateDay = null; syncRangeBounds(); renderMapLegend(); renderMapMode();
    };
    lo.addEventListener('change', onRange); hi.addEventListener('change', onRange);
    syncRangeBounds();
    m.querySelector('#mm-facing').addEventListener('change', renderMapMode);
    m.querySelector('#mm-labels').addEventListener('change', renderMapLabels);
    // Color by: Day / Who / Altitude
    m.querySelectorAll('.mm-cb').forEach(b => b.addEventListener('click', () => {
      mmColorMode = b.dataset.mode;
      m.querySelectorAll('.mm-cb').forEach(x => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      renderMapLegend(); renderMapMode();
    }));
    // Play / scrub the whole trip
    const scrub = m.querySelector('#mm-scrub');
    scrub.max = Math.max(0, buildPlaySeq().length - 1);
    scrub.addEventListener('input', () => { mmStopPlay(); mmRenderPlayhead(+scrub.value); });
    m.querySelector('#mm-play').addEventListener('click', () => { mmPlayTimer ? mmStopPlay() : mmStartPlay(); });
    m.querySelectorAll('.mm-spd').forEach(b => b.addEventListener('click', () => {
      mmPlaySpeed = +b.dataset.spd;
      m.querySelectorAll('.mm-spd').forEach(x => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      if (mmPlayTimer) { mmStopPlay(); mmStartPlay(); }   // restart at the new speed, same spot
    }));
    renderMapLegend();
    renderMapMode(true);   // whole-trip bounds
    setTimeout(() => mmMap.invalidateSize(), 80);
  }
  function mmShowAll() {
    mmIsolateDay = null; personFilter.clear();
    syncFilterUI(); refreshHeaderStats();
    renderMapLegend(); renderMapMode(true);
  }
  // horizontal scroll strip above the map: a "Show all" reset + the colour key for the mode
  function renderMapLegend() {
    const el = root._mapmode.querySelector('#mm-legend');
    const showAll = '<button class="dcc-tour-legchip mm-showall" type="button">Show all</button>';
    if (mmColorMode === 'day') {
      el.className = 'dcc-tour-mm-legend';
      el.innerHTML = showAll + DATA.days.map((d, i) =>
        '<button class="dcc-tour-legseg" data-day="' + i + '" title="' + escapeAttr(d.short + (d.area ? ' · ' + shortName(d.area) : '')) + '">' +
        '<span class="seg-sw" style="background:' + dayColor(i) + '"></span><span class="seg-n">' + d.index + '</span></button>').join('');
      el.querySelectorAll('.dcc-tour-legseg[data-day]').forEach(c => c.addEventListener('click', () => {
        const di = +c.dataset.day;
        mmIsolateDay = (mmIsolateDay === di) ? null : di;   // tap again to un-isolate
        if (mmIsolateDay != null && DATA.days[di].places.some(p => p.lat != null)) fitToDays(di, di);
        renderMapMode(mmIsolateDay == null);
      }));
    } else if (mmColorMode === 'person') {
      el.className = 'dcc-tour-mm-legend mm-legend-person';
      el.innerHTML = showAll + PERSONS.map(pn =>
        '<button class="dcc-tour-legseg' + (personFilter.has(pn) ? ' sel' : '') + '" data-person="' + pn + '" title="Only ' + escapeAttr(pn) + '’s shots">' +
        '<span class="seg-sw" style="background:' + PERSON_COLORS[pn] + '"></span>' +
        '<span class="seg-n">' + escapeHtml(pn) + '</span></button>').join('');
      el.querySelectorAll('.dcc-tour-legseg[data-person]').forEach(seg =>
        seg.addEventListener('click', () => setPersonFilter(seg.dataset.person)));
    } else {  // alt
      el.className = 'dcc-tour-mm-legend mm-legend-alt';
      // sample altColor across elevation so the legend gradient matches the
      // gamma-stretched marker colours (axis stays linear in elevation)
      const grad = Array.from({ length: 9 }, (_, i) => { const f = i / 8; return altColor(f * ALT_MAX) + ' ' + (f * 100).toFixed(0) + '%'; }).join(',');
      el.innerHTML = showAll + '<span class="mm-altscale" style="background:linear-gradient(90deg,' + grad + ')"></span>' +
        '<span class="mm-altlab">0 ' + elevUnit() + ' (sea)</span><span class="mm-altlab">~' + elevFromM(200) + '</span><span class="mm-altlab">' + elevFromM(ALT_MAX) + ' (Srđ)</span>';
    }
    el.querySelector('.mm-showall').addEventListener('click', mmShowAll);
    enhanceHScroll(el);
    // saved-spots key (only while that overlay is on): ★ per wishlist
    if (mmSavedLayer && mmSavedData) {
      const present = SAVED_LISTS.filter(l => mmSavedData.some(s => s.l === l));
      el.insertAdjacentHTML('beforeend',
        '<span class="mm-saved-key">' + present.map(l =>
          '<span class="mm-saved-keyitem"><span class="mm-saved-star" style="color:' + SAVED_COLORS[l] + '">★</span>' +
          escapeHtml(l) + '</span>').join('') + '</span>');
    }
  }
  function daysInRange() {
    const out = [];
    for (let i = mmRange[0]; i <= mmRange[1]; i++) out.push(i);
    return out;
  }
  // days actually shown: a legend-isolated single day, else the From/To range
  function effectiveDays() { return mmIsolateDay != null ? [mmIsolateDay] : daysInRange(); }
  // the trip's Croatia footprint — used to keep the default/whole-trip map view
  // framed on Croatia even though the Orlando/London airport legs are now pinned
  const CRO_BOUNDS = { latMin: 42, latMax: 43.6, lngMin: 16, lngMax: 19.6 };
  const inCroatia = pt => pt[0] >= CRO_BOUNDS.latMin && pt[0] <= CRO_BOUNDS.latMax && pt[1] >= CRO_BOUNDS.lngMin && pt[1] <= CRO_BOUNDS.lngMax;
  // fit to the Croatia points when any exist (so the far airport pins don't blow the
  // view out to the Atlantic); if a selection is ONLY airports, fit to those.
  const fitPts = pts => { const cro = pts.filter(inCroatia); return cro.length ? cro : pts; };
  function fitToDays(a, b) {
    const pts = [];
    for (let i = a; i <= b; i++) DATA.days[i].places.forEach(p => { if (p.lat != null) pts.push([p.lat, p.lng]); });
    if (pts.length) mmMap.fitBounds(L.latLngBounds(fitPts(pts)).pad(0.15), { animate: true });
  }
  // curated place labels: fill the gaps Esri satellite leaves — bodies of water,
  // town neighbourhoods, islands, channels — plus English names for the old town,
  // ports and airport (we can't rewrite Esri's baked-in tile labels, only add ours).
  // Area anchors are the centroid of the places we visited there; a few features we
  // only passed through are hand-placed (approx.). Bigger features show first; the
  // finer ones fade in as you zoom. Toggle via the Layers "Place labels" checkbox.
  let MM_LABELS = null;
  function mapLabelFeatures() {
    if (MM_LABELS) return MM_LABELS;
    const pts = [];
    DATA.days.forEach(d => d.places.forEach(p => { if (p.lat != null) pts.push({ f: foldStr(p.name), lat: p.lat, lng: p.lng }); }));
    const centroid = tok => { const f = foldStr(tok), m = pts.filter(p => p.f.includes(f)); return m.length ? [m.reduce((s, p) => s + p.lat, 0) / m.length, m.reduce((s, p) => s + p.lng, 0) / m.length] : null; };
    const derived = [
      ['Old City (Stari Grad), Dubrovnik', 'Old City · Stari Grad', 'area', 12],
      ['Lapad', 'Lapad', 'area', 12], ['Gruž', 'Gruž', 'area', 13], ['Pile', 'Pile', 'area', 13],
      ['Ploče', 'Ploče', 'area', 13], ['Montovjerna', 'Montovjerna', 'area', 14],
      ['Cavtat', 'Cavtat', 'town', 11],
      ['Lokrum (Otok Lokrum)', 'Lokrum', 'island', 12], ['Šipan', 'Šipan', 'island', 11],
      ['Koločep', 'Koločep · Kalamota', 'island', 12], ['Lopud', 'Lopud', 'island', 12],
      ['Pile Bay', 'Pile Bay', 'water', 14], ['Old City Port', 'Old City Port', 'water', 14],
      ['Lokrum Channel', 'Lokrum Channel', 'water', 13], ['Tiha Bay', 'Tiha Bay', 'water', 13],
      ['Mount Srđ', 'Mount Srđ', 'peak', 12],
    ];
    const feats = [];
    for (const [tok, label, cls, minZoom] of derived) { const c = centroid(tok); if (c) feats.push({ lat: c[0], lng: c[1], label, cls, minZoom }); }
    for (const [lat, lng, label, cls, minZoom] of [
      [42.6625, 18.0610, 'Babin Kuk', 'area', 13],
      [42.6438, 18.1035, 'Pile-Kono', 'area', 14],
      [42.6560, 18.0470, 'Grebeni Reefs', 'water', 13],
      [42.5614, 18.2682, 'Dubrovnik Airport', 'poi', 11],
    ]) feats.push({ lat, lng, label, cls, minZoom });
    MM_LABELS = feats;
    return feats;
  }
  function renderMapLabels() {
    if (!mmLabelLayer) return;
    mmLabelLayer.clearLayers();
    const cb = root._mapmode.querySelector('#mm-labels');
    if (cb && !cb.checked) return;
    const z = mmMap.getZoom();
    mapLabelFeatures().forEach(f => {
      if (z < f.minZoom) return;
      const icon = L.divIcon({ className: 'mm-label mm-label-' + f.cls, html: '<span>' + escapeHtml(f.label) + '</span>' });
      mmLabelLayer.addLayer(L.marker([f.lat, f.lng], { icon, interactive: false, keyboard: false }));
    });
  }
  function renderMapMode(fit) {
    if (!mmMap) return;
    renderMapLabels();
    mmMarkers.clearLayers(); mmPathLayer.clearLayers(); mmPts = [];
    const showPath = root._mapmode.querySelector('#mm-path').checked;
    const showHeat = root._mapmode.querySelector('#mm-heat').checked;
    const showFacing = root._mapmode.querySelector('#mm-facing').checked;
    const heatPts = [], allPts = [];
    // range readout (days · places · shots) + reflect isolate/range in the legend
    const rdays = effectiveDays(), shownSet = new Set(rdays);
    let rShots = 0; const rPlaceSet = new Set();
    rdays.forEach(di => DATA.days[di].places.forEach(p => { const c = placeCount(p); if (c) { rPlaceSet.add(p.name); rShots += c; } }));
    const rPlaces = rPlaceSet.size;   // unique places, consistent with the "places" tile (not per-day stops)
    const statsEl = root._mapmode.querySelector('#mm-range-stats');
    if (statsEl) statsEl.textContent = plur(rdays.length, 'day') + ' · ' + plur(rPlaces, 'place') + ' · ' + fmt(rShots) + (rShots === 1 ? ' shot' : ' shots') + (personOn() ? ' · ' + escapeHtml(personLabel()) : '');
    root._mapmode.querySelectorAll('.dcc-tour-legseg[data-day]').forEach(seg => {
      const i = +seg.dataset.day;
      seg.classList.toggle('out', !shownSet.has(i));
      seg.classList.toggle('sel', mmIsolateDay === i);
    });
    rdays.forEach(di => {
      const d = DATA.days[di], col = dayColor(di), line = [];
      d.places.forEach((p, pi) => {
        if (p.lat == null) return;
        const pc = placeCount(p);
        if (personOn() && pc === 0) return;   // these people didn't shoot here
        allPts.push([p.lat, p.lng]); line.push([p.lat, p.lng]);
        const r = Math.min(20, 5 + Math.sqrt(pc) * 1.6);
        const mk = L.circleMarker([p.lat, p.lng], { radius: r, color: '#fff', weight: 1.5, fillColor: placeColor(p, di), fillOpacity: 0.85 });
        mk.bindTooltip(escapeHtml(p.name) + ' · ' + d.short, { direction: 'top' });
        mmPts.push({ di, pi, p, d, ll: [p.lat, p.lng] });
        mk.on('click', (e) => pickMarker(di, pi, e.latlng));
        mmMarkers.addLayer(mk);
        placeItems(p).forEach(it => { if (it.lat != null) heatPts.push([it.lat, it.lng, 0.6]); });
        // compass "facing": a high-contrast arrow INSIDE the circle pointing where the
        // cameras looked. Auto-hidden when zoomed out (CSS on .mm-lowzoom) to declutter. (task 6)
        if (showFacing) {
          // one arrow per individual photo/video/clip that recorded a compass
          // heading, at its own GPS point, so you can see each shot's direction
          const sz = 16;
          placeItems(p).forEach(it => {
            if (it.heading == null) return;
            const lat = it.lat != null ? it.lat : p.lat, lng = it.lng != null ? it.lng : p.lng;
            const icon = L.divIcon({ className: 'mm-face mm-face-item', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
              html: '<span class="mm-face-rot" style="transform:rotate(' + Math.round(it.heading) + 'deg)">' +
                '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" aria-hidden="true"><path d="M12 3 L18 20 L12 16 L6 20 Z"/></svg></span>' });
            mmPathLayer.addLayer(L.marker([lat, lng], { icon, interactive: false, keyboard: false }));
          });
        }
      });
      if (showPath && line.length > 1)
        mmPathLayer.addLayer(L.polyline(line, { color: col, weight: 2.5, opacity: 0.7, dashArray: '4 5' }));
    });
    if (mmHeat) { mmMap.removeLayer(mmHeat); mmHeat = null; }
    if (showHeat && window.L && L.heatLayer)
      mmHeat = L.heatLayer(heatPts, { radius: 22, blur: 18, maxZoom: 15 }).addTo(mmMap);
    if (mmTrackLayer) drawTrack();   // keep the GPS track clipped to the shown days (task 7)
    if (fit && allPts.length) mmMap.fitBounds(L.latLngBounds(fitPts(allPts)).pad(0.12), { animate: false });
  }
  function openMapSidebar(di, pi) {
    const d = DATA.days[di], p = d.places[pi];
    const side = root._mapmode.querySelector('#dcc-mm-side');
    viewerItems = []; const thumbs = [];
    const items = placeItems(p);
    // every media thumb is tappable via data-vi (index into the shared viewer list)
    items.forEach(it => {
      if (it.full) {
        const vi = viewerItems.length; viewerItems.push(viewerMeta(it, p.name));
        thumbs.push('<img loading="lazy" src="' + escapeAttr(resolveUrl(it.src || it.full)) + '" data-vi="' + vi + '">');
      } else if (it.type === 'self_hosted' && it.url) {
        const vi = viewerItems.length; viewerItems.push(viewerMeta(it, p.name));
        const poster = it.poster ? resolveUrl(it.poster) : '';
        thumbs.push('<span class="mm-play-wrap" data-vi="' + vi + '">' +
          (poster ? '<img loading="lazy" src="' + escapeAttr(poster) + '">' : '') + '<span class="mm-play-badge">▶</span></span>');
      } else if (it.type === 'drive' && it.id) {   // GoPro clip: Drive-generated frame + play badge
        const vi = viewerItems.length; viewerItems.push(viewerMeta(it, p.name));
        thumbs.push('<span class="mm-play-wrap" data-vi="' + vi + '">' +
          '<img loading="lazy" src="https://drive.google.com/thumbnail?id=' + escapeAttr(it.id) + '&sz=w400" onerror="this.closest(\'.mm-play-wrap\').remove()"><span class="mm-play-badge">▶</span></span>');
      } else if (it.poster) {
        thumbs.push('<img loading="lazy" src="' + escapeAttr(resolveUrl(it.poster)) + '" style="opacity:.85">');
      }
    });
    side.hidden = false;
    side.innerHTML = '<button class="dcc-tour-mm-close" aria-label="Close">&times;</button>' +
      '<h3>' + escapeHtml(p.name) + mapsLink(p.lat, p.lng, 'dcc-tour-maplink head') + '</h3>' +
      '<p class="dcc-tour-mm-meta">' + escapeHtml(d.label) + ' · ' + escapeHtml(p.from === p.to ? p.from : p.from + '–' + p.to) +
        ' · ' + items.length + ' shots' + (personOn() ? ' by ' + escapeHtml(personLabel()) : '') + '</p>' +
      '<div class="dcc-tour-media dcc-tour-mm-grid">' + thumbs.join('') + '</div>' +
      '<button class="dcc-tour-chip" data-openday="' + di + '">Open this day in Story →</button>';
    side.querySelector('.dcc-tour-mm-close').addEventListener('click', () => { side.hidden = true; });
    side.querySelector('[data-openday]').addEventListener('click', () => { setView('story'); selectDay(di); });
    side.querySelector('.dcc-tour-mm-grid').addEventListener('click', e => {
      const cell = e.target.closest('[data-vi]');
      if (cell) openViewer(+cell.dataset.vi);
    });
    mmMap.panTo([p.lat, p.lng], { animate: true });
  }

  // ---- Play / scrub the whole trip: a moving marker walks the chapters in order,
  //      pinning the current day·place and popping that moment's photo. (A + B) ----
  const MM_STEP_MS = 1900;   // 1× dwell per stop — slow enough to read the place & let tiles load
  let mmSeq = null, mmPlayIdx = 0, mmPlayTimer = null, mmPlaySpeed = 1;
  let mmPlayLayer = null;
  function buildPlaySeq() {
    if (mmSeq) return mmSeq;
    const seq = [];
    DATA.days.forEach((d, di) => d.places.forEach((p, pi) => {
      if (p.lat == null) return;
      if (personOn() && placeCount(p) === 0) return;   // walk only where these people shot
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
    // highlight the spot now being shown: a pulsing halo ring under an enlarged
    // glowing playhead, so the current place clearly stands out as it steps along
    mmPlayLayer.addLayer(L.circleMarker([m.lat, m.lng], { radius: 20, stroke: false, fillColor: '#f4da62', fillOpacity: 0.28, className: 'mm-playhalo', interactive: false }));
    mmPlayLayer.addLayer(L.circleMarker([m.lat, m.lng], { radius: 13, color: '#7d5411', weight: 3, fillColor: '#f4da62', fillOpacity: 0.98, className: 'mm-playhead' }));
    // label + moment card (the photo that pops up)
    // task 3: the verbose inline label overflowed on mobile — the moment card
    // below carries the same info (now incl. date + time), so keep the label empty
    const lab = root._mapmode.querySelector('#mm-playlabel');
    if (lab) lab.textContent = '';
    const mo = root._mapmode.querySelector('#mm-moment');
    if (mo) {
      const its = placeItems(m.p);
      const rep = its.find(it => it.full) || its.find(it => it.poster) || its[0];
      const img = rep && rep.full ? resolveUrl(rep.src || rep.full) : (rep && rep.poster ? resolveUrl(rep.poster) : '');
      const time = m.p.from === m.p.to ? m.p.from : m.p.from + '–' + m.p.to;
      mo.innerHTML = (img ? '<img src="' + escapeAttr(img) + '" alt="">' : '') +
        '<figcaption><b>' + escapeHtml(m.p.name) + '</b>' +
        '<span>' + escapeHtml(dDate(m.day) + ' · ' + time + ' · ' + plur(its.length, 'shot')) + '</span></figcaption>';
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
    const per = Math.max(320, MM_STEP_MS / mmPlaySpeed);   // 1×=1.9s, 2×≈0.95s, 4×≈0.48s per stop
    mmPlayTimer = setInterval(() => {
      if (mmPlayIdx >= seq.length - 1) { mmStopPlay(); return; }
      mmRenderPlayhead(mmPlayIdx + 1);
    }, per);
  }

  // ---- optional map overlays: the Google saved-place wishlist + the GPS breadcrumb ----
  const SAVED_LISTS = ['Want to go', 'Favorite places', 'Dubrovnik Pass – Free', 'Dubrovnik Pass – Discount'];
  const SAVED_COLORS = { 'Want to go': '#b68235', 'Favorite places': '#c0392b', 'Dubrovnik Pass – Free': '#2e8b57', 'Dubrovnik Pass – Discount': '#6b5b95' };
  let mmSavedData = null, mmSavedLayer = null, mmTrackData = null, mmTrackLayer = null;
  function loadJSON(name) { return fetch(baseURL + name).then(r => r.ok ? r.json() : Promise.reject(r.status)); }
  function toggleSaved(on) {
    if (!on) { if (mmSavedLayer) { mmMap.removeLayer(mmSavedLayer); mmSavedLayer = null; } renderMapLegend(); return; }
    const draw = () => {
      mmSavedLayer = L.layerGroup().addTo(mmMap);
      mmSavedData.forEach(s => {
        const col = SAVED_COLORS[s.l] || NO_COLOR;
        const icon = L.divIcon({ className: 'mm-saved-pin', html: '<span style="color:' + col + '">★</span>', iconSize: [16, 16], iconAnchor: [8, 8] });
        L.marker([s.lat, s.lng], { icon, title: s.n })
          .bindTooltip(escapeHtml(s.n) + (s.l ? ' · ' + escapeHtml(s.l) : ''), { direction: 'top' })
          .addTo(mmSavedLayer);
      });
      renderMapLegend();
    };
    if (mmSavedData) draw();
    else loadJSON('saved.json').then(d => { mmSavedData = d; draw(); })
      .catch(() => { const t = root._mapmode.querySelector('#mm-saved'); if (t) t.checked = false; });
  }
  function toggleTrack(on) {
    if (!on) { if (mmTrackLayer) { mmMap.removeLayer(mmTrackLayer); mmTrackLayer = null; } return; }
    if (mmTrackData) drawTrack();
    else loadJSON('track.json').then(d => { mmTrackData = d; drawTrack(); })
      .catch(() => { const t = root._mapmode.querySelector('#mm-track'); if (t) t.checked = false; });
  }
  // draw the GPS breadcrumb, clipped to the days currently shown (task 7)
  function drawTrack() {
    if (!mmTrackData || !mmMap) return;
    if (mmTrackLayer) mmMap.removeLayer(mmTrackLayer);
    mmTrackLayer = L.layerGroup().addTo(mmMap);
    const dates = new Set(effectiveDays().map(i => DATA.days[i].date));
    mmTrackData.forEach(d => {
      if (dates.has(d.date) && d.pts.length > 1)
        mmTrackLayer.addLayer(L.polyline(d.pts, { color: '#1f6f9c', weight: 2.5, opacity: 0.7 }));
    });
  }

  // ---- Gallery ("Photos") view: every item in one filterable, chunk-rendered grid ----
  let galItems = null, galCur = null, galRendered = 0, galEl = null;
  let galPlaceOpts = [], galCityOpts = [];   // [segment, count] facet options
  const galFilter = { kinds: new Set(), cities: new Set(), places: new Set() };   // kinds empty = all
  const galSort = { key: 'time', dir: { time: 1, alt: -1 } };   // direction folded into the Sort menu
  // Sort menu: [key, dir|null, label] — direction is baked in so there's no separate ↑/↓ button
  const GAL_SORTS = [
    ['time', 1, 'Time — oldest'], ['time', -1, 'Time — newest'],
    ['day', null, 'Day'], ['place', null, 'Place'], ['city', null, 'City'], ['person', null, 'Photographer'],
    ['alt', -1, 'Altitude — high'], ['alt', 1, 'Altitude — low'],
  ];
  const GAL_GROUPED = { day: 1, place: 1, city: 1, person: 1 };   // these render as accordions
  const galSortVal = s => s[1] == null ? s[0] : s[0] + (s[1] > 0 ? '-asc' : '-desc');
  // which comma-segments are real towns/islands/travel-cities (vs neighborhoods/venues) —
  // classified client-side so the City facet stays coarse while Place stays specific
  const CITY_SET = new Set(['Dubrovnik', 'Cavtat', 'Čilipi', 'Gruda', 'Srebreno', 'Plat', 'Kupari',
    'Lokrum (Otok Lokrum)', 'Šipan', 'Suđurađ', 'Lopud', 'Elaphiti Islands', 'Orlando', 'London']);
  function placeSegs(pl) { return (pl || '').split(',').map(s => s.trim()).filter(Boolean); }
  function cityOf(x) { for (const s of x.segs) if (CITY_SET.has(s)) return s; return x.it.city || '—'; }
  function tcmp(a, b) { a = a || ''; b = b || ''; return a < b ? -1 : a > b ? 1 : 0; }
  function cmpStr(a, b) { return String(a || '~').localeCompare(String(b || '~')); }
  function personOrder(pn) { const i = PERSONS.indexOf(pn); return i < 0 ? 99 : i; }
  function chrono(a, b) { return (a.di - b.di) || tcmp(a.it.time, b.it.time); }
  function galSortCmp(a, b) {
    const k = galSort.key;
    if (k === 'alt') {
      const av = a.it.alt, bv = b.it.alt;
      if (av == null && bv == null) return chrono(a, b);
      if (av == null) return 1; if (bv == null) return -1;   // no-altitude items sink to the end
      return galSort.dir.alt * (av - bv) || chrono(a, b);
    }
    if (k === 'place') return cmpStr(a.place, b.place) || chrono(a, b);
    if (k === 'city') return cmpStr(cityOf(a), cityOf(b)) || chrono(a, b);
    if (k === 'person') return (personOrder(a.it.person) - personOrder(b.it.person)) || chrono(a, b);
    if (k === 'time') return galSort.dir.time * chrono(a, b);
    return chrono(a, b);   // day
  }
  function galGroupKey(x) {
    switch (galSort.key) {
      case 'day': return 'd' + x.di;
      case 'place': return 'p:' + x.place;
      case 'city': return 'c:' + cityOf(x);
      case 'person': return 'w:' + (x.it.person || '');
    }
    return null;
  }
  function galGroupLabel(x) {
    switch (galSort.key) {
      case 'day': return x.dayLabel;
      case 'place': return x.place;
      case 'city': return cityOf(x);
      case 'person': return x.it.person || 'Unattributed';
    }
    return '';
  }
  // opts: [{v, n, label?, dot?}]. opt: {search, optClass, badgeId}
  function facetHTML(kind, label, opts, opt) {
    opt = opt || {};
    return '<div class="dcc-tour-facet" data-facet="' + kind + '">' +
      '<button type="button" class="facet-btn" aria-expanded="false">' + label +
        '<span class="facet-n"' + (opt.badgeId ? ' id="' + opt.badgeId + '"' : '') + ' hidden></span>' +
        '<span class="facet-caret" aria-hidden="true">▾</span></button>' +
      '<div class="facet-panel" hidden>' +
        (opt.search === false ? '' : '<input type="search" class="facet-search" placeholder="search ' + label.toLowerCase() + '…" autocomplete="off">') +
        '<div class="facet-list">' + opts.map(o =>
          '<label class="facet-opt' + (opt.optClass ? ' ' + opt.optClass : '') + '"><input type="checkbox" value="' + escapeAttr(o.v) + '">' +
          (o.dot ? '<span class="facet-dot" style="background:' + o.dot + '"></span>' : '') +
          '<span class="facet-lab">' + escapeHtml(o.label || o.v) + '</span><span class="facet-c">' + o.n + '</span></label>').join('') +
        '</div><div class="facet-foot"><button type="button" class="facet-clear">Clear</button></div>' +
      '</div></div>';
  }
  function facetSet(kind) {
    return kind === 'type' ? galFilter.kinds : kind === 'city' ? galFilter.cities : kind === 'place' ? galFilter.places : null;
  }
  function closeAllFacets() {
    if (!galEl) return;
    galEl.querySelectorAll('.facet-panel').forEach(p => p.hidden = true);
    galEl.querySelectorAll('.facet-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }
  function buildGallery() {
    if (!galItems) {
      galItems = [];
      DATA.days.forEach((d, di) => d.places.forEach(p => p.items.forEach(it => {
        const place = it.place || p.name;
        galItems.push({ it, di, dayLabel: d.label, place, segs: placeSegs(place) });
      })));
      // facet options: every segment for Place, the city-classified subset for City,
      // plus type + photographer counts
      const pc = new Map(), cc = new Map(), kindCount = {}, personCount = {};
      galItems.forEach(x => {
        kindCount[x.it.kind] = (kindCount[x.it.kind] || 0) + 1;
        if (x.it.person) personCount[x.it.person] = (personCount[x.it.person] || 0) + 1;
        x.segs.forEach(s => { pc.set(s, (pc.get(s) || 0) + 1); if (CITY_SET.has(s)) cc.set(s, (cc.get(s) || 0) + 1); });
      });
      galPlaceOpts = [...pc.entries()].sort((a, b) => cmpStr(a[0], b[0])).map(o => ({ v: o[0], n: o[1] }));
      galCityOpts = [...cc.entries()].sort((a, b) => cmpStr(a[0], b[0])).map(o => ({ v: o[0], n: o[1] }));
      const typeOpts = [['photo', 'Photos'], ['video', 'Videos'], ['clip', 'Clips']].map(k => ({ v: k[0], label: k[1], n: kindCount[k[0]] || 0 }));
      const personOpts = PERSONS.map(pn => ({ v: pn, n: personCount[pn] || 0, dot: PERSON_COLORS[pn] }));

      const g = el('section', 'dcc-tour-gallery'); galEl = g;
      g.innerHTML = '<div class="dcc-tour-gal-bar">' +
        facetHTML('type', 'Type', typeOpts, { search: false }) +
        facetHTML('person', 'Photographer', personOpts, { search: false, optClass: 'dcc-personopt', badgeId: 'dcc-person-badge' }) +
        '<span class="dcc-tour-gal-sep" aria-hidden="true"></span>' +
        facetHTML('city', 'City', galCityOpts) +
        facetHTML('place', 'Place', galPlaceOpts) +
        '<label class="dcc-tour-galsort">Sort by <select id="dcc-galsort">' +
          GAL_SORTS.map(s => '<option value="' + galSortVal(s) + '">' + s[2] + '</option>').join('') +
        '</select></label>' +
        '<button type="button" class="dcc-tour-galexpand" id="dcc-galexpand" hidden>Expand all</button>' +
        '<span class="dcc-tour-gal-count" id="dcc-galcount"></span></div>' +
        '<div class="dcc-tour-media dcc-tour-gal-grid" id="dcc-galgrid"></div>' +
        '<div id="dcc-galmore" class="dcc-tour-galmore">loading more…</div>';
      root.appendChild(g);
      // Type / Photographer / City / Place — all facet dropdowns (scroll list + multi-select)
      g.querySelectorAll('.dcc-tour-facet').forEach(fac => {
        const kind = fac.dataset.facet;
        const btn = fac.querySelector('.facet-btn'), panel = fac.querySelector('.facet-panel');
        const badge = fac.querySelector('.facet-n'), search = fac.querySelector('.facet-search');
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const wasClosed = panel.hidden; closeAllFacets();
          if (wasClosed) {
            panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
            panel.style.left = '0px';   // keep the panel inside the viewport on narrow screens
            const r = fac.getBoundingClientRect(), over = (r.left + panel.offsetWidth) - (document.documentElement.clientWidth - 8);
            if (over > 0) panel.style.left = (-Math.min(over, r.left - 8)) + 'px';
            if (search) search.focus();
          }
        });
        panel.addEventListener('click', e => e.stopPropagation());
        if (search) search.addEventListener('input', e => {
          const q = foldStr(e.target.value.trim());
          fac.querySelectorAll('.facet-opt').forEach(o =>
            o.style.display = fuzzyMatch(q, foldStr(o.querySelector('.facet-lab').textContent)) ? '' : 'none');
        });
        fac.querySelector('.facet-list').addEventListener('change', e => {
          if (e.target.type !== 'checkbox') return;
          if (kind === 'person') { setPersonFilter(e.target.value); return; }   // global; badge+checks synced elsewhere
          const set = facetSet(kind);
          if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
          badge.hidden = !set.size; badge.textContent = set.size; renderGallery();
        });
        fac.querySelector('.facet-clear').addEventListener('click', () => {
          if (kind === 'person') { setPersonFilter(null); return; }
          const set = facetSet(kind); set.clear();
          fac.querySelectorAll('.facet-opt input').forEach(c => c.checked = false);
          badge.hidden = true; renderGallery();
        });
      });
      document.addEventListener('click', closeAllFacets);
      g.querySelector('#dcc-galsort').addEventListener('change', e => {
        const val = e.target.value, key = val.replace(/-(asc|desc)$/, '');
        galSort.key = key;
        if (val.endsWith('-asc')) galSort.dir[key] = 1; else if (val.endsWith('-desc')) galSort.dir[key] = -1;
        renderGallery();
      });
      const grid = g.querySelector('#dcc-galgrid');
      grid.addEventListener('click', e => {
        const head = e.target.closest('.galacc-head'); if (!head) return;
        toggleAcc(head.closest('.galacc'));
      });
      g.querySelector('#dcc-galexpand').addEventListener('click', () => {
        const secs = [...grid.querySelectorAll('.galacc')];
        const open = secs.some(s => s.dataset.open !== '1');   // if any closed, expand all; else collapse all
        secs.forEach(s => setAcc(s, open));
        g.querySelector('#dcc-galexpand').textContent = open ? 'Collapse all' : 'Expand all';
      });
      if ('IntersectionObserver' in window)
        new IntersectionObserver(en => { if (en[0].isIntersecting) renderGalleryChunk(); })
          .observe(g.querySelector('#dcc-galmore'));
    }
    renderGallery();
  }
  function itemMatchesFacets(x) {
    if (galFilter.cities.size && !x.segs.some(s => galFilter.cities.has(s))) return false;
    if (galFilter.places.size && !x.segs.some(s => galFilter.places.has(s))) return false;
    return true;
  }
  function renderGallery() {
    galCur = galItems.filter(x => (!galFilter.kinds.size || galFilter.kinds.has(x.it.kind)) &&
      itemPasses(x.it) && itemMatchesFacets(x));
    galCur.sort(galSortCmp);
    // the viewer spans the whole filtered+sorted set — all photos, videos AND clips
    viewerItems = galCur.map((x, i) => { x._vi = i; return viewerMeta(x.it); });
    document.getElementById('dcc-galcount').textContent = galCur.length.toLocaleString() + ' items';
    const grid = document.getElementById('dcc-galgrid'), more = document.getElementById('dcc-galmore');
    const exp = document.getElementById('dcc-galexpand');
    if (GAL_GROUPED[galSort.key]) { more.style.display = 'none'; exp.hidden = false; exp.textContent = 'Expand all'; renderGalleryGrouped(grid); }
    else { exp.hidden = true; grid.className = 'dcc-tour-media dcc-tour-gal-grid'; grid.innerHTML = ''; galRendered = 0; renderGalleryChunk(); }
  }
  function renderGalleryChunk() {
    if (!galCur || root.dataset.view !== 'gallery' || GAL_GROUPED[galSort.key]) return;
    const grid = document.getElementById('dcc-galgrid');
    const end = Math.min(galRendered + 200, galCur.length);
    let html = '';
    for (let i = galRendered; i < end; i++) html += renderItem(galCur[i].it, i);
    grid.insertAdjacentHTML('beforeend', html);
    galRendered = end;
    document.getElementById('dcc-galmore').style.display = galRendered < galCur.length ? '' : 'none';
  }
  // grouped view: collapsible accordion sections, items rendered lazily on first open
  function renderGalleryGrouped(grid) {
    const groups = []; let cur = null;
    galCur.forEach(x => {
      const key = galGroupKey(x);
      if (!cur || cur.key !== key) { cur = { key, label: galGroupLabel(x), items: [] }; groups.push(cur); }
      cur.items.push(x);
    });
    grid._groups = groups;
    grid.className = 'dcc-tour-gal-acc';
    grid.innerHTML = groups.map((gp, gi) =>
      '<section class="galacc" data-open="0" data-gi="' + gi + '">' +
        '<button type="button" class="galacc-head" aria-expanded="false">' +
          '<span class="galacc-chev" aria-hidden="true">▸</span>' +
          '<span class="galacc-lab">' + escapeHtml(gp.label) + '</span>' +
          '<span class="galacc-n">' + gp.items.length + '</span></button>' +
        '<div class="galacc-body dcc-tour-media" hidden></div>' +
      '</section>').join('');
  }
  function setAcc(sec, open) {
    sec.dataset.open = open ? '1' : '0';
    sec.querySelector('.galacc-head').setAttribute('aria-expanded', open ? 'true' : 'false');
    const body = sec.querySelector('.galacc-body');
    if (open) {
      if (!body._rendered) {
        const grid = document.getElementById('dcc-galgrid');
        const gp = grid._groups[+sec.dataset.gi];
        body.innerHTML = gp.items.map(x => renderItem(x.it, x._vi)).join('');
        body._rendered = true;
      }
      body.hidden = false;
    } else body.hidden = true;
  }
  function toggleAcc(sec) { setAcc(sec, sec.dataset.open !== '1'); }

  // fold to an accent-stripped, lowercase form so Serbo-Croatian diacritics
  // (č,š,ž,ć,đ) US keyboards can't type still match — used by the Photos City/Place
  // filter search and the map place-label matching.
  // Levenshtein edit distance (typo tolerance / approximate string matching)
  function editDist(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // query chars appear in order within text (e.g. "dbrv" matches "dubrovnik")
  function isSubseq(q, t) { let i = 0; for (const c of t) { if (c === q[i]) i++; if (i === q.length) break; } return i === q.length; }
  // one forgiving matcher: diacritic-folded partial + subsequence + typo tolerance.
  // (q and t must already be foldStr'd, so accents and case don't matter.)
  function fuzzyMatch(q, t) {
    if (!q) return true;
    if (t.indexOf(q) >= 0) return true;                 // substring / partial match
    if (q.length < 3) return false;                     // don't over-match 1-2 char queries
    if (isSubseq(q, t)) return true;                    // approximate / ordered subsequence
    const tol = q.length <= 5 ? 1 : q.length <= 8 ? 2 : 3;   // allowed typos scale with length
    if (editDist(q, t) <= tol) return true;             // whole-string typo tolerance
    return t.split(/[^a-z0-9]+/).some(w => w.length >= 3 && editDist(q, w) <= tol);   // per-word
  }
  function foldStr(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip combining accents (č,š,ž,ć…)
      .replace(/đ/g, 'd').replace(/Đ/g, 'd')              // đ has no NFD decomposition
      .toLowerCase().trim();
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
      '<input type="date" id="dcc-datepick" min="' + first + '" max="' + last + '" value="' + first + '"></label>';
    // date jump
    wrap.querySelector('#dcc-datepick').addEventListener('change', e => {
      const idx = DATA.days.findIndex(d => d.date === e.target.value);
      if (idx >= 0) { setView('story'); selectDay(idx); }
    });
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
    // fallback for a day with only GoPro clips (e.g. Sep 10) — use a clip's Drive frame
    for (const p of (day.places || [])) {
      const clip = p.items.find(it => it.type === 'drive' && it.id);
      if (clip) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(clip.id) + '&sz=w400';
    }
    return '';
  }
  // media stats for the active photographer (recomputed from the filtered items)
  function personMediaStats() {
    let photos = 0, videos = 0, clips = 0, locs = 0, best = { count: -1 }, bestDay = { count: -1 };
    DATA.days.forEach(d => {
      let dc = 0;
      d.places.forEach(p => {
        const its = placeItems(p); if (!its.length) return;
        locs++;
        its.forEach(it => { if (it.kind === 'photo') photos++; else if (it.kind === 'video') videos++; else clips++; });
        if (its.length > best.count) best = { name: p.name, count: its.length };
        dc += its.length;
      });
      if (dc > bestDay.count) bestDay = { label: d.label, count: dc };
    });
    return { photos, videos, clips, locs, best, bestDay };
  }
  function tripStatsHTML() {
    const h = DATA.health; if (!h) return '';
    const s = DATA.stats || {};
    const srd = (h.climb_m / 412).toFixed(1);       // Mount Srđ = 412 m
    // per-photographer media stats override the baked-in trip totals when filtered
    const ps = personOn() ? personMediaStats() : null;
    const photos = ps ? ps.photos : s.photos, videos = ps ? ps.videos : s.videos, clips = ps ? ps.clips : s.clips;
    const totalLoc = ps ? ps.locs : s.total_locations;
    const busiest = ps ? ps.bestDay : s.most_active_day;
    const captured = ps ? ps.best : s.most_visited;
    let sup = '';
    if (busiest && busiest.count > 0) {
      sup = '<div class="dcc-tour-superlatives">' +
        '<span class="sup-tip" tabindex="0" data-tip="' + escapeAttr('The single day with the most photos, videos and clips taken.') + '">🔥 Busiest day <b>' + escapeHtml(busiest.label) + '</b> · ' + busiest.count + ' shots<span class="t-info" aria-hidden="true">ⓘ</span></span>' +
        (captured ? '<span class="sup-tip" tabindex="0" data-tip="' + escapeAttr('The place with the most photos and videos across the whole trip.') + '">📍 Most captured <b>' + escapeHtml(shortName(captured.name)) + '</b> · ' + captured.count + '<span class="t-info" aria-hidden="true">ⓘ</span></span>' : '') +
        (!personOn() && s.longest_walk_day ? '<span class="sup-tip" tabindex="0" data-tip="' + escapeAttr('The day we covered the most ground between photo spots: straight-line distances between consecutive geotagged shots, counting only hops under 3 km (so drives, boats and flights are skipped). A rough “how far we roamed” estimate from photo GPS — not on-foot miles. For actual walking, see the “walked” tile.') + '">🥾 Longest day <b>' + escapeHtml(s.longest_walk_day.label) + '</b> · ' + distFromKm(s.longest_walk_day.km) + '<span class="t-info" aria-hidden="true">ⓘ</span></span>' : '') +
        '</div>';
    }
    const note = personOn() ?
      '<p class="dcc-tour-statsnote">Photo &amp; place counts show only <b>' + escapeHtml(personLabel()) +
        '</b>’s shots. Steps, distance &amp; climb are trip-wide (from one watch).</p>' : '';
    return '<div class="dcc-tour-tripstats">' +
      statTile(h.steps, '', 'steps', '', 0,
        'Total steps recorded on ' + h.watch + ' across the whole trip (Apple Health).') +
      statTile(distNumFromMi(h.dist, 1), ' ' + distUnit(), 'walked', '', 1,
        'Walking + running distance from ' + h.watch + ' — the only truly sensor-measured distance here — summed over the trip.') +
      statTile(h.flights, '', 'flights climbed', '≈ Mount Srđ ×' + srd, 0,
        'Flights of stairs climbed, from ' + h.watch + '. For scale, that’s about ' + srd + '× the height of Mount Srđ, the hill above Dubrovnik.') +
      (totalLoc ? statTile(totalLoc, '', 'places', personOn() ? 'shot by ' + personLabel() : 'visited & named', 0,
        'How many distinct places we named across the trip — every geotagged photo and video was assigned to a location.') : '') +
      (!personOn() ? (() => { const tm = travelModes(), g = tm.ground || 1;
        return statTile(distNumFromKm(tm.ground, 0), ' ' + distUnit(), 'traveled on the ground',
          '🚌 ' + Math.round(tm.road / g * 100) + '% · 🥾 ' + Math.round(tm.walk / g * 100) + '% · ⛵ ' + Math.round(tm.boat / g * 100) + '%', 0,
          'Estimated total distance on the ground (flights excluded), split into bus/car vs walking vs boat. Inferred from place names, geography and the watch — only the walking share is sensor-measured.'); })() : '') +
      (photos != null ? statTile(photos + videos + clips, '', 'photos & videos',
        photos + ' photos · ' + videos + ' videos · ' + clips + ' clips', 0,
        'Every photo, video and GoPro clip placed in the archive. The two closing montage videos on the Conclusion day aren’t counted.') : '') +
      '</div>' + sup + note;
  }
  function statTile(num, suffix, label, sub, dec, tip) {
    num = num || 0; dec = dec || 0;
    const shown = dec ? Number(num).toFixed(dec) : fmt(num);
    return '<div class="dcc-tour-tile' + (tip ? ' has-tip' : '') + '"' +
      (tip ? ' tabindex="0" data-tip="' + escapeAttr(tip) + '"' : '') + '>' +
      '<span class="t-big" data-count="' + num + '" data-dec="' + dec +
      '" data-suffix="' + escapeAttr(suffix || '') + '">' + escapeHtml(shown) + escapeHtml(suffix || '') + '</span>' +
      '<span class="t-lab">' + escapeHtml(label) + (tip ? '<span class="t-info" aria-hidden="true">ⓘ</span>' : '') + '</span>' +
      (sub ? '<span class="t-sub">' + escapeHtml(sub) + '</span>' : '') + '</div>';
  }
  // Shared, JS-positioned tooltip popover (lives on <body> so the stats row's
  // horizontal scroll can't clip it). Shows on hover and on tap/click.
  let _tipsWired = false;
  function tipPop() {
    let p = document.querySelector('.dcc-tour-tip-pop');
    if (!p) { p = el('div', 'dcc-tour-tip-pop'); p.setAttribute('role', 'tooltip'); document.body.appendChild(p); }
    return p;
  }
  function showTip(target) {
    const txt = target.getAttribute('data-tip'); if (!txt) return;
    const p = tipPop(); p.textContent = txt; p.style.display = 'block';
    const r = target.getBoundingClientRect(), pr = p.getBoundingClientRect();
    let left = Math.max(8, Math.min(r.left + r.width / 2 - pr.width / 2, window.innerWidth - pr.width - 8));
    let top = r.top - pr.height - 8; if (top < 8) top = r.bottom + 8;
    p.style.left = left + 'px'; p.style.top = top + 'px'; p.classList.add('show');
  }
  function hideTip() { const p = document.querySelector('.dcc-tour-tip-pop'); if (p) { p.classList.remove('show'); p.style.display = 'none'; } }
  function wireTips() {
    if (_tipsWired) return; _tipsWired = true;
    document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (t) showTip(t); });
    document.addEventListener('mouseout', e => { const t = e.target.closest('[data-tip]'); if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hideTip(); });
    document.addEventListener('click', e => { const t = e.target.closest('[data-tip]'); if (t) showTip(t); else hideTip(); });
    window.addEventListener('scroll', hideTip, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
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
    if (day.walk_km) bits.push('<b>' + distFromKm(day.walk_km) + '</b> traveled');
    if (h.climb_m) {
      const flights = Math.round(h.climb_m / 3);
      bits.push('climbed <b>' + elevFromM(h.climb_m) + '</b> ≈ ' + flights + ' flights');
    }
    if (h.alt_max != null) bits.push('up to <b>' + elevFromM(h.alt_max) + '</b>');
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
    if (w.tmax != null) bits.push('🌡 ' + tempFromC(w.tmax) + (w.tmin != null ? ' / ' + tempFromC(w.tmin) : ''));
    if (w.wind != null) bits.push('💨 ' + (imp() ? Math.round(w.wind * 0.621371) + ' mph' : Math.round(w.wind) + ' km/h'));
    if (w.precip >= 0.1) bits.push('💧 ' + (imp() ? (w.precip / 25.4).toFixed(2) + ' in' : w.precip + ' mm'));
    return bits.length ? '<p class="dcc-tour-weather">' + bits.join(' &nbsp;·&nbsp; ') + '</p>' : '';
  }

  // ---- #3 signature climbs + #4 trip staircase ----
  function overviewHTML() {
    // the "adding up" running-total summary leads, above the climb chart (a more
    // specific stat) and the rest of the Stats view
    let html = vizTimelineHTML();
    const sc = DATA.signature_climbs || [];
    if (sc.length) {
      html += '<div class="dcc-tour-climbs"><span class="lab">Compare to</span>' +
        sc.map(c => '<span class="climb">' + escapeHtml(c.emoji) + ' ' + escapeHtml(c.name) +
          ' <b>' + elevFromM(c.max_alt) + '</b></span>').join('') + '</div>';
    }
    html += staircaseHTML();
    return html;
  }
  // Task 1: cumulative-climb bar chart with a labelled Y axis (elevation), an X
  // axis (dates) and a per-bar hover tooltip. Each bar's height is the running
  // total climbed through that day; the tooltip breaks out that day's own gain.
  function staircaseHTML() {
    const days = DATA.days;
    let cum = 0; const cums = days.map(d => (cum += (d.health && d.health.climb_m) || 0));
    const total = cum || 1;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ f, m: total * f }));
    const yaxis = ticks.map(t => '<span class="stair-ytick" style="bottom:' + (t.f * 100).toFixed(1) + '%">' + elevFromM(t.m) + '</span>').join('');
    const grid = ticks.map(t => '<span class="stair-gline" style="bottom:' + (t.f * 100).toFixed(1) + '%"></span>').join('');
    const bars = days.map((d, i) => {
      const hpct = (cums[i] / total) * 100, dayClimb = (d.health && d.health.climb_m) || 0;
      return '<button type="button" class="tread" data-day="' + i + '" data-date="' + escapeAttr(d.label) +
        '" data-climb="' + Math.round(dayClimb) + '" data-cum="' + Math.round(cums[i]) +
        '" style="height:' + hpct.toFixed(1) + '%" aria-label="' + escapeAttr(dDate(d) + ': ' + elevFromM(cums[i]) + ' climbed by now') + '"></button>';
    }).join('');
    const step = Math.max(1, Math.ceil(days.length / 6));
    const xaxis = days.map((d, i) => '<span class="stair-xtick">' + (i % step === 0 ? escapeHtml(dDate(d)) : '') + '</span>').join('');
    return '<div class="dcc-tour-stair">' +
      '<div class="cap">Climb over the trip · <b>' + elevFromM(total) + '</b> total · hover a day</div>' +
      '<div class="stair-grid">' +
        '<div class="stair-ylabel">Cumulative climb (' + elevUnit() + ')</div>' +
        '<div class="stair-yaxis">' + yaxis + '</div>' +
        '<div class="stair-area">' + grid + '<div class="stair-bars">' + bars + '</div>' +
          '<div class="stair-tip" hidden></div></div>' +
        '<div class="stair-corner"></div><div class="stair-xaxis">' + xaxis + '</div>' +
      '</div></div>';
  }
  function bindClimbChart(scope) {
    if (!scope) return;
    const tip = scope.querySelector('.stair-tip'), area = scope.querySelector('.stair-area');
    scope.querySelectorAll('.tread').forEach(r => {
      r.addEventListener('click', () => selectDay(+r.dataset.day));
      const show = () => {
        if (!tip || !area) return;
        tip.innerHTML = '<b>' + escapeHtml(r.dataset.date) + '</b>' +
          '<span>+' + elevFromM(+r.dataset.climb) + ' that day</span>' +
          '<span class="tip-cum">' + elevFromM(+r.dataset.cum) + ' total by now</span>';
        tip.hidden = false;
        const br = r.getBoundingClientRect(), ar = area.getBoundingClientRect();
        const tw = tip.offsetWidth || 120;
        let left = br.left - ar.left + br.width / 2 - tw / 2;
        tip.style.left = Math.max(2, Math.min(ar.width - tw - 2, left)) + 'px';
      };
      r.addEventListener('mouseenter', show);
      r.addEventListener('focus', show);
      r.addEventListener('mouseleave', () => { if (tip) tip.hidden = true; });
      r.addEventListener('blur', () => { if (tip) tip.hidden = true; });
    });
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

  // ============================================================
  //  Task 3 — extra Stats visualisations (all from data already in trip.json)
  // ============================================================
  let vizCumData = null;   // cumulative-per-day arrays for the synchronized timeline
  function renderStatsViz() {
    const host = root._statsviz; if (!host) return;
    // vizTimeline now leads the `overview` block (above the climb chart); the rest
    // of the specific visualisations render here, below it.
    host.innerHTML =
      vizTravelHTML() +
      '<div class="viz-grid2">' + vizWhoHTML() + vizClockHTML() + '</div>' +
      vizWeatherHTML() +
      vizCompassHTML();
    enhanceHScroll(host.querySelector('.wx-ribbon'));
  }
  // ---- 1) synchronized cumulative timeline (the flagship) ----
  function vizTimelineHTML() {
    const days = DATA.days;
    let cs = 0, cw = 0, ctr = 0, ccl = 0, cph = 0, cvi = 0, ccp = 0;
    const seenPlaces = new Set();   // unique places, so the running total matches the "places" tile (188, not 280 stops)
    vizCumData = days.map(d => {
      const h = d.health || {};
      cs += h.steps || 0; cw += h.dist || 0; ctr += d.walk_km || 0; ccl += h.climb_m || 0;
      let ph = 0, vi = 0, cp = 0;
      d.places.forEach(p => { if (p.items.length) seenPlaces.add(p.name); p.items.forEach(it => { if (it.kind === 'photo') ph++; else if (it.kind === 'video') vi++; else cp++; }); });
      cph += ph; cvi += vi; ccp += cp;
      return { steps: cs, walkMi: cw, travelKm: ctr, climbM: ccl, places: seenPlaces.size, photos: cph, videos: cvi, clips: ccp, label: d.label, area: d.area || '' };
    });
    const n = days.length, step = Math.max(1, Math.ceil(n / 4));
    const axis = days.map((d, i) => '<span class="tl-tick">' + (i % step === 0 || i === n - 1 ? 'Day ' + d.index : '') + '</span>').join('');
    return '<div class="viz-card viz-timeline">' +
      '<div class="viz-h"><h4>The trip, adding up</h4>' +
        '<span class="viz-sub">Drag across the days — every number is the running total up to that point.</span></div>' +
      '<div class="tl-day" id="tl-day"></div>' +
      '<div class="tl-readout" id="tl-readout"></div>' +
      '<input type="range" class="tl-scrub" id="tl-scrub" min="0" max="' + (n - 1) + '" value="' + (n - 1) + '" step="1" aria-label="Scrub through the trip by day">' +
      '<div class="tl-axis">' + axis + '</div></div>';
  }
  function bindVizTimeline(host) {
    host = host || root;
    const sc = host.querySelector('#tl-scrub'); if (!sc || !vizCumData) return;
    const upd = () => updateTimelineReadout(+sc.value);
    sc.addEventListener('input', upd);
    upd();
  }
  function updateTimelineReadout(idx) {
    if (!vizCumData) return;
    const c = vizCumData[Math.max(0, Math.min(vizCumData.length - 1, idx))];
    const dayEl = root.querySelector('#tl-day'), out = root.querySelector('#tl-readout');
    if (dayEl) dayEl.innerHTML = '<b>' + escapeHtml(c.label) + '</b>' + (c.area ? '<span> · ' + escapeHtml(c.area) + '</span>' : '');
    if (!out) return;
    const flights = Math.round(c.climbM / 3);
    const spf = (DATA.health && DATA.health.flights) ? (DATA.health.stair_steps / DATA.health.flights) : 16;
    const stairs = Math.round(flights * spf);
    const t = (v, l) => '<div class="tl-stat"><span class="tl-v">' + v + '</span><span class="tl-l">' + l + '</span></div>';
    out.innerHTML =
      t(fmt(c.steps), 'steps') +
      t(fmt(flights), 'flights climbed') +
      t(fmt(stairs), 'stairs') +
      t(distNumFromMi(c.walkMi, 1) + ' ' + distUnit(), 'walked (watch)') +
      t(distNumFromKm(c.travelKm, 0) + ' ' + distUnit(), 'traveled') +
      t(fmt(c.places), 'places') +
      t(fmt(c.photos), 'photos') +
      t(fmt(c.videos), 'videos') +
      t(fmt(c.clips), 'clips');
  }
  // ---- 2) who shot what — donut + per-day contribution ----
  function vizWhoHTML() {
    const days = DATA.days, tot = {}; PERSONS.forEach(p => tot[p] = 0);
    const perDay = days.map(d => { const c = {}; PERSONS.forEach(p => c[p] = 0);
      d.places.forEach(p => p.items.forEach(it => { if (c[it.person] != null) c[it.person]++; })); return c; });
    let grand = 0; PERSONS.forEach(p => grand += tot[p]);
    days.forEach((d, i) => PERSONS.forEach(p => { tot[p] += perDay[i][p]; }));
    grand = 0; PERSONS.forEach(p => grand += tot[p]); grand = grand || 1;
    const R = 42, C = 2 * Math.PI * R; let off = 0;
    const arcs = PERSONS.filter(p => tot[p] > 0).map(p => {
      const len = tot[p] / grand * C;
      const s = '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + PERSON_COLORS[p] + '" stroke-width="15" ' +
        'stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 60 60)"/>';
      off += len; return s;
    }).join('');
    const legend = PERSONS.filter(p => tot[p] > 0).map(p =>
      '<div class="who-leg"><span class="who-sw" style="background:' + PERSON_COLORS[p] + '"></span>' +
      '<span class="who-nm">' + escapeHtml(p) + '</span><span class="who-ct">' + fmt(tot[p]) +
      ' · ' + Math.round(tot[p] / grand * 100) + '%</span></div>').join('');
    const maxDay = Math.max(1, ...perDay.map(c => PERSONS.reduce((s, p) => s + c[p], 0)));
    const cols = days.map((d, i) => {
      const dt = PERSONS.reduce((s, p) => s + perDay[i][p], 0);
      const segs = PERSONS.filter(p => perDay[i][p] > 0).map(p =>
        '<span class="who-seg" style="flex:' + perDay[i][p] + ';background:' + PERSON_COLORS[p] + '"></span>').join('');
      return '<div class="who-col" title="' + escapeAttr(dDate(d) + ' · ' + dt + ' shots') + '">' +
        '<div class="who-stack" style="height:' + (dt / maxDay * 100).toFixed(1) + '%">' + segs + '</div></div>';
    }).join('');
    return '<div class="viz-card viz-who">' +
      '<div class="viz-h"><h4>Who shot what</h4><span class="viz-sub">' + fmt(grand) + ' photos, videos &amp; clips</span></div>' +
      '<div class="who-top"><svg class="who-donut" viewBox="0 0 120 120" aria-hidden="true">' + arcs +
        '<text x="60" y="56" class="who-c1">' + fmt(grand) + '</text><text x="60" y="72" class="who-c2">shots</text></svg>' +
        '<div class="who-legend">' + legend + '</div></div>' +
      '<div class="who-days">' + cols + '</div>' +
      '<div class="who-daysx"><span>' + escapeHtml(dDate(days[0])) + '</span><span>' + escapeHtml(dDate(days[days.length - 1])) + '</span></div>' +
      '</div>';
  }
  // ---- 3) time-of-day rhythm — when shots were taken ----
  function vizClockHTML() {
    const hours = new Array(24).fill(0);
    DATA.days.forEach(d => d.places.forEach(p => p.items.forEach(it => {
      const t = (it.time || '').split(':'); if (t.length === 2) { const h = +t[0]; if (h >= 0 && h < 24) hours[h]++; }
    })));
    const max = Math.max(1, ...hours), peak = hours.indexOf(max);
    const hl = h => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'a' : 'p');
    const bars = hours.map((v, h) =>
      '<div class="clk-col' + (h === peak ? ' peak' : '') + '" title="' + escapeAttr(hl(h) + ' · ' + v + ' shots') + '">' +
        '<div class="clk-bar" style="height:' + (v / max * 100).toFixed(1) + '%"></div>' +
        '<span class="clk-x">' + (h % 6 === 0 ? hl(h) : '') + '</span></div>').join('');
    return '<div class="viz-card viz-clock">' +
      '<div class="viz-h"><h4>Time of day</h4><span class="viz-sub">Busiest around <b>' + hl(peak) + 'm</b></span></div>' +
      '<div class="clk-bars">' + bars + '</div></div>';
  }
  // ---- 4) weather ribbon — daily conditions across the trip. Shows high (and
  //      low / precip / wind when those fields are present — see tools/fetch_weather.py) ----
  function vizWeatherHTML() {
    const days = DATA.days, ws = days.map(d => d.weather).filter(w => w && w.tmax != null);
    if (!ws.length) return '';
    const hasLow = ws.some(w => w.tmin != null), hasWind = ws.some(w => w.wind != null), hasRain = ws.some(w => w.precip >= 0.1);
    const lo = Math.min(...ws.map(w => w.tmin != null ? w.tmin : w.tmax)) - 1, hi = Math.max(...ws.map(w => w.tmax));
    const span = (hi - lo) || 1;
    const cells = days.map(d => {
      const w = d.weather;
      if (!w || w.tmax == null) return '<div class="wx-cell wx-empty"><span class="wx-d">' + escapeHtml(dDate(d)) + '</span></div>';
      const top = (w.tmax - lo) / span * 100;
      const bar = w.tmin != null
        ? '<div class="wx-range" style="top:' + (100 - top).toFixed(1) + '%;bottom:' + ((w.tmin - lo) / span * 100).toFixed(1) + '%"></div>'
        : '<div class="wx-fill" style="height:' + Math.max(6, top).toFixed(1) + '%"></div>';
      const extras =
        (w.precip >= 0.1 ? '<span class="wx-x">💧' + (imp() ? (w.precip / 25.4).toFixed(2) : w.precip) + '</span>' : '') +
        (w.wind != null ? '<span class="wx-x">💨' + (imp() ? Math.round(w.wind * 0.621371) : Math.round(w.wind)) + '</span>' : '');
      const detail = dWeekday(d).slice(0, 3) + ' · ' + dDate(d) + ' · ' + (w.desc || '') +
        ' · H ' + tempFromC(w.tmax) + (w.tmin != null ? ' / L ' + tempFromC(w.tmin) : '') +
        (w.wind != null ? ' · 💨 ' + windFromKmh(w.wind) + (w.winddir != null ? ' ' + windDirName(w.winddir) : '') : '') +
        (w.precip >= 0.1 ? ' · 💧 ' + precipFromMm(w.precip) : '');
      return '<div class="wx-cell" title="' + escapeAttr(detail) + '">' +
        '<span class="wx-ic">' + (w.icon || '') + '</span>' +
        '<span class="wx-hi">' + tempFromC(w.tmax) + '</span>' +
        (w.tmin != null ? '<span class="wx-lo">' + tempFromC(w.tmin) + '</span>' : '') +
        '<div class="wx-track">' + bar + '</div>' +
        (extras ? '<span class="wx-xs">' + extras + '</span>' : '') +
        '<span class="wx-d">' + escapeHtml(dDate(d)) + '</span></div>';
    }).join('');
    const bits = ['daily high' + (hasLow ? ' / low' : '') + (imp() ? ' (°F)' : ' (°C)')];
    if (hasRain) bits.push('💧 ' + (imp() ? 'in' : 'mm') + ' rain');
    if (hasWind) bits.push('💨 ' + (imp() ? 'mph' : 'km/h') + ' wind');
    return '<div class="viz-card viz-weather">' +
      '<div class="viz-h"><h4>Weather across the trip</h4><span class="viz-sub">' + bits.join(' · ') + '</span></div>' +
      '<div class="wx-ribbon">' + cells + '</div></div>';
  }
  // ---- 5) camera compass — which way the cameras pointed ----
  function vizCompassHTML() {
    const bins = 16, counts = new Array(bins).fill(0); let total = 0;
    DATA.days.forEach(d => d.places.forEach(p => p.items.forEach(it => {
      if (it.heading != null) { const b = ((Math.round(it.heading / (360 / bins)) % bins) + bins) % bins; counts[b]++; total++; }
    })));
    if (!total) return '';
    const max = Math.max(...counts), cx = 80, cy = 80, maxR = 62;
    const pt = (ang, r) => (cx + r * Math.sin(ang * Math.PI / 180)).toFixed(1) + ' ' + (cy - r * Math.cos(ang * Math.PI / 180)).toFixed(1);
    const petals = counts.map((v, b) => {
      if (!v) return '';
      const a = b * (360 / bins), half = (360 / bins) / 2 * 0.82, r = 10 + v / max * (maxR - 10);
      return '<path class="cmp-petal" d="M ' + pt(a, 0) + ' L ' + pt(a - half, r) + ' L ' + pt(a, r + 3) + ' L ' + pt(a + half, r) + ' Z"></path>';
    }).join('');
    const rings = [maxR, maxR * 0.66, maxR * 0.33].map(r => '<circle cx="80" cy="80" r="' + r.toFixed(1) + '" class="cmp-ring"/>').join('');
    const dirs = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([lab, a]) =>
      '<text class="cmp-dir" x="' + pt(a, maxR + 10).split(' ')[0] + '" y="' + pt(a, maxR + 10).split(' ')[1] + '">' + lab + '</text>').join('');
    return '<div class="viz-card viz-compass">' +
      '<div class="viz-h"><h4>Camera compass</h4><span class="viz-sub">' + fmt(total) + ' shots with a heading</span></div>' +
      '<svg class="cmp-svg" viewBox="0 0 160 160" aria-label="Directions the cameras faced">' +
        rings + petals + dirs + '</svg>' +
      '<p class="viz-note">Which way we pointed the lens — longer petals = more shots facing that way.</p></div>';
  }

  // ---- 6) how we got around — estimated distance by travel mode (Q10) ----
  //  Four buckets: plane (getting there) vs road (bus/car) / boat / walking
  //  (getting around). The GPS breadcrumb has no per-point timestamps, so this
  //  is a day/leg-level estimate from place names, geography and the watch —
  //  NOT a speed-based classification. Walking is the one real sensor (watch).
  const _AIR = { MCO: [28.4312, -81.3081], LGW: [51.1537, -0.1821], DBV: [42.5613, 18.2622] };
  const _HUB = [42.655, 18.081], _CAVTAT = [42.5797, 18.2119];
  const _OLDPORT = [42.6407, 18.1107], _LOKRUM = [42.6248, 18.1210], _GRUZ = [42.6626, 18.0857];
  function _hav(a, b) {
    const R = 6371, dl = (b[0] - a[0]) * Math.PI / 180, dg = (b[1] - a[1]) * Math.PI / 180,
      la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    const x = Math.sin(dl / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dg / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  let _travel = null;
  function travelModes() {
    if (_travel) return _travel;
    const ROADF = 1.25;   // roads wind ~25% longer than a straight line
    const plane = (_hav(_AIR.MCO, _AIR.LGW) + _hav(_AIR.LGW, _AIR.DBV)) * 2;   // there + back
    const cavtatDays = DATA.days.filter(d => /^Cavtat/.test(d.area || '')).length;
    const road = cavtatDays * _hav(_HUB, _CAVTAT) * ROADF * 2 + _hav(_AIR.DBV, _HUB) * ROADF * 2;
    let boat = 0;
    if (DATA.days.some(d => d.places.some(p => /Lokrum/.test(p.name || '')))) boat += _hav(_OLDPORT, _LOKRUM) * 2;
    const el = DATA.days.find(d => /Elaphiti/.test(d.area || ''));
    if (el) {   // one waypoint per island, in visit order, out from & back to Gruž
      const isl = n => { const m = (n || '').match(/Koločep|Lopud|Šipan|Suđurađ/); return m ? (/Suđurađ/.test(m[0]) ? 'Šipan' : m[0]) : null; };
      const order = [], acc = {};
      el.places.forEach(p => { if (p.lat == null) return; const is = isl(p.name); if (!is) return; if (!acc[is]) { acc[is] = [[], []]; order.push(is); } acc[is][0].push(p.lat); acc[is][1].push(p.lng); });
      const wp = order.map(is => [acc[is][0].reduce((a, b) => a + b, 0) / acc[is][0].length, acc[is][1].reduce((a, b) => a + b, 0) / acc[is][1].length]);
      const route = [_GRUZ, ...wp, _GRUZ];
      for (let i = 1; i < route.length; i++) boat += _hav(route[i - 1], route[i]);
    }
    const walk = (DATA.health && DATA.health.dist ? DATA.health.dist : 0) * 1.60934;
    _travel = { plane, road, boat, walk, ground: road + boat + walk, cavtatDays };
    return _travel;
  }
  const TRAVEL_META = {
    walk: { c: '#7a9e5e', ic: '🥾', label: 'Walking' },
    road: { c: '#c98a3a', ic: '🚌', label: 'Road (bus / car)' },
    boat: { c: '#3a7ca5', ic: '⛵', label: 'Boat' },
  };
  function vizTravelHTML() {
    const tm = travelModes(), g = tm.ground || 1;
    const order = ['walk', 'road', 'boat'].sort((a, b) => tm[b] - tm[a]);
    const bar = order.map(k => '<span class="tv-seg" style="flex:' + tm[k].toFixed(2) + ';background:' + TRAVEL_META[k].c + '" title="' + escapeAttr(TRAVEL_META[k].label + ' · ' + distFromKm(tm[k])) + '"></span>').join('');
    const legend = order.map(k =>
      '<div class="tv-leg"><span class="tv-sw" style="background:' + TRAVEL_META[k].c + '"></span>' +
      '<span class="tv-ic">' + TRAVEL_META[k].ic + '</span>' +
      '<span class="tv-nm">' + TRAVEL_META[k].label + '</span>' +
      '<span class="tv-val"><b>' + distFromKm(tm[k]) + '</b> · ' + Math.round(tm[k] / g * 100) + '%</span></div>').join('');
    return '<div class="viz-card viz-travel">' +
      '<div class="viz-h"><h4>How we got around</h4><span class="viz-sub">estimated distance by mode</span></div>' +
      '<div class="tv-there"><span class="tv-there-ic">✈️</span>' +
        '<div class="tv-there-tx"><b>Getting there</b>' +
        '<span>Orlando → London → Dubrovnik &amp; back · ~<b>' + distFromKm(tm.plane, 0) + '</b> round trip</span></div></div>' +
      '<div class="tv-around-lab">Getting around · <b>' + distFromKm(tm.ground, 0) + '</b> on the ground</div>' +
      '<div class="tv-bar">' + bar + '</div>' +
      '<div class="tv-legend">' + legend + '</div>' +
      '<p class="viz-note">Estimated from place names, geography and the watch (walking is watch-measured; there are no per-point GPS timestamps to read speed from). Short in-town bus hops that shadow a walked route aren’t split out separately.</p>' +
      '</div>';
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
      '<span class="pk">peak ' + elevFromM(peak[1]) + '</span></div>';
  }

  function initMap() {
    if (map || !window.L || !root._mapdiv) return;
    if (root._mapdiv.offsetParent === null) return;   // hidden (mobile app shell) — skip until visible
    map = L.map(root._mapdiv, { scrollWheelZoom: true });
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
    viewerItems = []; viewerIdx = -1;
    for (const k in markersByPlace) delete markersByPlace[k];

    let html = '<div class="dcc-tour-dayhead">' +
      '<div class="dcc-tour-daynum">' + escapeHtml(dWeekday(day)) + '</div>' +
      '<h2>' + escapeHtml(dDate(day)) + '</h2>' +
      (day.story ? '<p class="dcc-tour-daystory">' + escapeHtml(day.story) + '</p>' : '') +
      '<p class="dcc-tour-daymeta">' + (personOn() ? plur(dayVisibleCount(day), 'shot') + ' by ' + escapeHtml(personLabel()) : dayCountLabel(day)) + '</p>' +
      weatherHTML(day.weather) +
      healthRibbonHTML(day) +
      (day.health && day.health.elev ? elevSparkHTML(day.health.elev) : '') +
      '<div class="dcc-tour-dayactions">' +
      (day.health && (day.health.stepcurve || day.health.elev) ?
        '<button class="dcc-tour-chip dcc-tour-replay" id="dcc-replay">▶ Replay this day</button>' : '') +
      '</div></div>';

    // Places default collapsed on phones (a big single-column day then reads as
    // a tappable itinerary) and open on desktop. The index bar below is a table
    // of contents: each chip scrolls to and opens its place.
    const placesOpenDefault = !window.matchMedia('(max-width: 800px)').matches;
    // which places have anything to show under the current filter
    const shownPlaces = day.places.map((p, pi) => ({ p, pi })).filter(x => !personOn() || placeCount(x.p) > 0);
    if (personOn() && !shownPlaces.length) {
      html += '<p class="dcc-tour-empty">No shots by ' + escapeHtml(personLabel()) + ' on this day.</p>';
    }
    if (shownPlaces.length > 1) {
      html += '<nav class="dcc-tour-places-index" aria-label="Places this day">' +
        '<button type="button" class="dcc-tour-idx-all" data-allopen="' + (placesOpenDefault ? '1' : '0') + '">' +
          (placesOpenDefault ? 'Collapse all' : 'Expand all') + '</button>' +
        '<div class="dcc-tour-idx-chips">' +
        shownPlaces.map(({ p, pi }) => '<button type="button" class="dcc-tour-idx-chip" data-goto="' + pi + '">' +
          '<b>' + (pi + 1) + '</b> ' + escapeHtml(shortName(p.name)) + '</button>').join('') +
        '</div></nav>';
    }

    const toMin = t => { const a = (t || '').split(':'); return a.length === 2 ? +a[0]*60 + +a[1] : null; };
    shownPlaces.forEach(({ p, pi }) => {
      const anchor = 'place-' + pi;
      const its = placeItems(p);
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
            '<span class="dcc-tour-place-meta">' + escapeHtml(time) + spent + ' · ' + plur(its.length, 'shot') + cum + ' ' + mapsLink(p.lat, p.lng, 'dcc-tour-maplink meta') + '</span>' +
          '</div>' +
          '<span class="dcc-tour-place-chevron" aria-hidden="true">▾</span>' +
        '</div>' +
        '<div class="dcc-tour-media" id="media-' + pi + '">' + its.map(it => renderItem(it)).join('') + '</div>' +
        '</section>';
    });

    html += '<div class="dcc-tour-daynavbtns">' +
      (curDay > 0 ? '<button class="dcc-tour-chip" id="dcc-prev">← ' + escapeHtml(DATA.days[curDay-1].short) + '</button>' : '<span></span>') +
      (curDay < DATA.day_count-1 ? '<button class="dcc-tour-chip" id="dcc-next">' + escapeHtml(DATA.days[curDay+1].short) + ' →</button>' : '<span></span>') +
      '</div>';

    story.innerHTML = html;
    story.scrollTop = 0;
    { const ic = story.querySelector('.dcc-tour-idx-chips'); if (ic) enhanceHScroll(ic, ic.closest('.dcc-tour-places-index') || ic); }
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

  function renderItem(item, vi) {
    const extras = mapsLink(item.lat, item.lng, 'dcc-tour-maplink cell');
    // claim this item's slot in the shared viewer list: story builds it inline
    // (vi undefined), gallery pre-builds the list and passes the index.
    const viewable = (item.type === 'drive' && item.id) ||
                     (item.type === 'self_hosted' && item.url) ||
                     (item.type !== 'drive' && item.type !== 'self_hosted' && item.full);
    let idx = -1;
    if (viewable) { idx = (vi === undefined) ? viewerItems.push(viewerMeta(item)) - 1 : vi; }
    const viAttr = idx >= 0 ? ' data-vi="' + idx + '"' : '';
    // GoPro clips (Drive): show a poster frame, load the player on tap
    if (item.type === 'drive') {
      if (!item.id) return '';
      const thumb = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(item.id) + '&sz=w400';
      return '<div class="dcc-tour-cell dcc-tour-play-cell"' + viAttr + '>' +
        '<img loading="lazy" src="' + escapeAttr(thumb) + '" alt="clip" onerror="this.classList.add(\'noimg\')">' +
        '<span class="dcc-tour-play">▶</span><span class="dcc-tour-badge">clip</span>' + cap(item) + extras + '</div>';
    }
    // self-hosted videos: show the poster frame, load the video on tap
    if (item.type === 'self_hosted') {
      const durb = '<span class="dcc-tour-badge">' + (item.dur ? fmtDur(item.dur) : 'video') + '</span>';
      const posterUrl = item.poster ? resolveUrl(item.poster) : '';
      if (!item.url)
        return posterUrl ? '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(posterUrl) + '" alt="video">' + durb + cap(item) + extras + '</div>' : '';
      return '<div class="dcc-tour-cell dcc-tour-play-cell"' + viAttr + '>' +
        (posterUrl ? '<img loading="lazy" src="' + escapeAttr(posterUrl) + '" alt="video">' : '') +
        '<span class="dcc-tour-play">▶</span>' + durb + cap(item) + extras + '</div>';
    }
    // photo
    return '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(resolveUrl(item.src || item.full)) + '" alt=""' + viAttr + ' />' + cap(item) + extras + '</div>';
  }
  function cap(item) {
    const alt = item.alt != null ? ' · ' + elevFromM(item.alt) : '';
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
      if (personOn() && placeCount(p) === 0) return;   // hide places these people didn't shoot
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
  // one viewer entry per media item (photo/video/clip), carrying its day's date
  function viewerMeta(it, place) {
    return {
      kind: it.kind,
      full: it.full ? resolveUrl(it.full) : '',
      src: resolveUrl(it.src || it.full || it.poster || ''),
      url: it.url ? resolveUrl(it.url) : '',
      poster: it.poster ? resolveUrl(it.poster) : '',
      id: it.id || '',
      place: it.place || place || '',
      time: it.time || '',
      date: it._dlabel || (it._date ? dDate({ date: it._date }) : '')
    };
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
    // any media cell (photo/video/clip) opens the unified viewer at its index.
    // (the map sidebar has its own handler, so skip cells inside it here.)
    const media = e.target.closest('[data-vi]');
    if (media && !media.closest('#dcc-mm-side')) { openViewer(+media.dataset.vi); }
  });
  // keyboard: place headers are role=button, so activate on Enter/Space
  // (arrow-key day navigation already lives in the lightbox keydown handler)
  document.addEventListener('keydown', (e) => {
    const head = e.target.closest && e.target.closest('.dcc-tour-place-head');
    if (head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); head.click(); }
  });
  document.addEventListener('keydown', (e) => {
    if (viewerIdx >= 0) {
      if (e.key === 'Escape') closeViewer();
      else if (e.key === 'ArrowRight') showViewer(viewerIdx + 1);
      else if (e.key === 'ArrowLeft') showViewer(viewerIdx - 1);
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
  // crisp themed icons (emoji rendered inconsistently across phones)
  const ICON_DL = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3v11m0 0l-4.5-4.5M12 14l4.5-4.5M4.5 20h15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_SHARE = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7h14v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  // ---- video / clip viewer: opens the clip large in a full-screen overlay so the
  //      footage is actually visible; native controls have room and auto-hide during
  //      playback (tap the video to bring them back), instead of the cramped inline
  //      player where the control chrome blacked out the tiny frame. ----
  function ensureViewerEl() {
    let el = document.getElementById('dcc-tour-viewer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'dcc-tour-viewer';
    el.className = 'dcc-tour-lightbox';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Media viewer');
    el.innerHTML =
      '<button class="dcc-tour-lightbox-close" aria-label="Close">' + ICON_CLOSE + '</button>' +
      '<div class="dcc-tour-lightbox-count" aria-hidden="true"></div>' +
      '<div class="dcc-tour-lightbox-actions">' +
        '<a class="lb-act" id="dcc-v-dl" download aria-label="Download" title="Download">' + ICON_DL + '</a>' +
        '<button class="lb-act" id="dcc-v-share" aria-label="Share" title="Share">' + ICON_SHARE + '</button></div>' +
      '<button class="dcc-tour-lightbox-nav prev" aria-label="Previous">&#8249;</button>' +
      '<div class="dcc-tour-vstage"></div>' +
      '<button class="dcc-tour-lightbox-nav next" aria-label="Next">&#8250;</button>' +
      '<div class="dcc-tour-lightbox-cap"></div>';
    el.querySelector('#dcc-v-share').addEventListener('click', () => {
      const it = viewerItems[viewerIdx]; if (!it) return;
      const src = it.full || it.url || '';
      const g = (src.match(/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i) || [])[1];
      doShare(g ? shareUrl('ph=' + g) : (src || location.href), 'From Crofts in Croatia');
    });
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.dcc-tour-lightbox-close')) closeViewer();
      else if (e.target.closest('.prev')) showViewer(viewerIdx - 1);
      else if (e.target.closest('.next')) showViewer(viewerIdx + 1);
    });
    // swipe (mobile) to move through the whole media set
    let sx = null, sy = null;
    const stage = el.querySelector('.dcc-tour-vstage');
    stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) showViewer(viewerIdx + (dx < 0 ? 1 : -1));
      sx = sy = null;
    }, { passive: true });
    document.body.appendChild(el);
    return el;
  }
  function posterOverlay(url) {
    const ov = el('div', 'dcc-tour-vpo', '<span class="dcc-tour-vpo-play">▶</span>');
    if (url) ov.style.backgroundImage = 'url("' + String(url).replace(/["\\]/g, '') + '")';
    return ov;
  }
  function openViewer(idx) { if (viewerItems.length) { ensureViewerEl(); showViewer(idx); } }
  let vwPrevFocus = null;
  function showViewer(idx) {
    if (!viewerItems.length) return;
    const n = viewerItems.length;
    viewerIdx = ((idx % n) + n) % n;
    const it = viewerItems[viewerIdx];
    MUSIC.setVideoOpen(it.kind === 'video' || it.kind === 'clip');   // mute music on video/clip, not photos
    const el0 = ensureViewerEl();
    const wasOpen = el0.classList.contains('open');
    const stage = el0.querySelector('.dcc-tour-vstage');
    stage.innerHTML = '';
    const dl = el0.querySelector('#dcc-v-dl');
    dl.style.display = ''; dl.removeAttribute('target');
    if (it.kind === 'video' && it.url) {
      const v = document.createElement('video');
      v.src = it.url; v.controls = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.setAttribute('controlslist', 'nodownload noplaybackrate'); v.disablePictureInPicture = true;
      v.className = 'dcc-tour-vplayer';
      stage.appendChild(v);
      // custom poster/play overlay that hides the moment playback begins
      const ov = posterOverlay(it.poster); stage.appendChild(ov);
      const hide = () => ov.classList.add('hide');
      v.addEventListener('playing', hide); v.addEventListener('play', hide);
      ov.addEventListener('click', () => { v.play().catch(() => {}); });
      v.play().catch(() => {});
      dl.href = it.url;
    } else if (it.kind === 'clip' && it.id) {
      // load the Drive player inside the opening gesture so it can start itself;
      // the overlay hides as soon as the player is in.
      const ov = posterOverlay('https://drive.google.com/thumbnail?id=' + encodeURIComponent(it.id) + '&sz=w800');
      stage.appendChild(ov);
      const load = () => {
        if (stage.querySelector('iframe')) return;
        const f = document.createElement('iframe');
        f.src = 'https://drive.google.com/file/d/' + encodeURIComponent(it.id) + '/preview';
        f.allow = 'autoplay; fullscreen'; f.allowFullscreen = true;
        f.className = 'dcc-tour-vplayer dcc-tour-vplayer-iframe';
        stage.insertBefore(f, ov); ov.classList.add('hide');
      };
      ov.addEventListener('click', load); load();
      dl.href = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(it.id); dl.target = '_blank';
    } else {   // photo (or any still)
      const im = document.createElement('img'); im.className = 'dcc-tour-vphoto'; im.alt = '';
      im.src = it.full || it.src; stage.appendChild(im);
      dl.href = it.full || it.src;
      // warm the neighbouring photos so next/prev is instant
      [viewerIdx + 1, viewerIdx - 1].forEach(k => {
        const v = viewerItems[((k % n) + n) % n];
        if (v && v.kind === 'photo' && v.full && v.full !== it.full) { const p = new Image(); p.decoding = 'async'; p.src = v.full; }
      });
    }
    el0.querySelector('.dcc-tour-lightbox-cap').textContent = [it.place, it.date, it.time].filter(Boolean).join(' · ');
    el0.querySelector('.dcc-tour-lightbox-count').textContent = (viewerIdx + 1) + ' / ' + n;
    el0.classList.add('open');
    if (!wasOpen) { vwPrevFocus = document.activeElement; el0.querySelector('.dcc-tour-lightbox-close').focus(); }
    document.body.classList.add('dcc-tour-noscroll');
  }
  function closeViewer() {
    viewerIdx = -1;
    MUSIC.setVideoOpen(false);   // video/clip closed -> resume any suppressed song
    const el0 = document.getElementById('dcc-tour-viewer');
    if (el0) { el0.querySelector('.dcc-tour-vstage').innerHTML = ''; el0.classList.remove('open'); }   // detach player → stop playback
    document.body.classList.remove('dcc-tour-noscroll');
    if (vwPrevFocus && vwPrevFocus.focus) { try { vwPrevFocus.focus(); } catch (e) {} vwPrevFocus = null; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ===== hidden "Matrix rain" easter egg — falls BEHIND the content =====
  // toggle: tap the site title 5× quickly, or Ctrl+M on a desktop; Esc also exits.
  const MTX_GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾚﾛﾜﾝ0123456789'.split('');
  const MTX_F = 16;
  let mtxCanvas = null, mtxCtx = null, mtxRAF = 0, mtxDrops = [], mtxOn = false;
  function mtxResize() {
    if (!mtxCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mtxCanvas.width = Math.floor(innerWidth * dpr); mtxCanvas.height = Math.floor(innerHeight * dpr);
    mtxCanvas.style.width = innerWidth + 'px'; mtxCanvas.style.height = innerHeight + 'px';
    mtxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mtxDrops = Array.from({ length: Math.ceil(innerWidth / MTX_F) }, () => Math.floor(Math.random() * -40));
    mtxCtx.fillStyle = '#000'; mtxCtx.fillRect(0, 0, innerWidth, innerHeight);
  }
  function mtxStep() {
    const c = mtxCtx, w = innerWidth, h = innerHeight;
    c.fillStyle = 'rgba(0,0,0,0.075)'; c.fillRect(0, 0, w, h);          // fade previous frame → trails
    c.textAlign = 'center'; c.font = MTX_F + 'px monospace';
    for (let i = 0; i < mtxDrops.length; i++) {
      const x = i * MTX_F + MTX_F / 2, y = mtxDrops[i] * MTX_F;
      c.fillStyle = '#c9ffd0'; c.fillText(MTX_GLYPHS[(Math.random() * MTX_GLYPHS.length) | 0], x, y);            // bright leading glyph
      c.fillStyle = 'rgba(0,220,60,0.5)'; c.fillText(MTX_GLYPHS[(Math.random() * MTX_GLYPHS.length) | 0], x, y - MTX_F);
      if (y > h && Math.random() > 0.975) mtxDrops[i] = 0; else mtxDrops[i]++;
    }
    mtxRAF = requestAnimationFrame(mtxStep);
  }
  function mtxStart() {
    if (mtxOn) return; mtxOn = true;
    if (!mtxCanvas) {
      mtxCanvas = document.createElement('canvas'); mtxCanvas.id = 'dcc-matrix'; mtxCanvas.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(mtxCanvas, document.body.firstChild);
      mtxCtx = mtxCanvas.getContext('2d');
      window.addEventListener('resize', () => { if (mtxOn) mtxResize(); });
    }
    mtxCanvas.style.display = 'block';
    document.documentElement.classList.add('dcc-matrix-on');
    mtxResize(); mtxStep();
    MUSIC.setMatrix(true);    // auto-play + loop "Masters of the Universe"
  }
  function mtxStop() {
    if (!mtxOn) return; mtxOn = false;
    if (mtxRAF) { cancelAnimationFrame(mtxRAF); mtxRAF = 0; }
    document.documentElement.classList.remove('dcc-matrix-on');
    if (mtxCanvas) mtxCanvas.style.display = 'none';
    MUSIC.setMatrix(false);   // stop matrix song; regular stays off unless user toggled it
  }
  function mtxToggle() { mtxOn ? mtxStop() : mtxStart(); }
  let mtxTaps = 0, mtxTapT = 0;
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.dcc-tour-header')) return;   // title or subtitle
    const now = Date.now();
    mtxTaps = (now - mtxTapT < 1500) ? mtxTaps + 1 : 1; mtxTapT = now;
    if (mtxTaps >= 5) { mtxTaps = 0; mtxToggle(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); mtxToggle(); }
    else if (e.key === 'Escape' && mtxOn) mtxStop();
  });
})();
