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
      history: '<line x1="6" y1="3" x2="18" y2="3"/><line x1="6" y1="21" x2="18" y2="21"/><path d="M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9"/><path d="M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9"/>',
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
      tabBtn('map', 'Map') + tabBtn('stats', 'Stats') + tabBtn('history', 'History');
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
    if (v !== 'map') { mmStopPlay(); thenStop(); }
    if (v !== 'history') historyLeave();
    if (v === 'map') initMapMode();
    else if (v === 'stats') { renderStatsViz(); animateCounts(root); }
    else if (v === 'gallery') buildGallery();
    else if (v === 'history') { histPlace = histPlaceNext; histPlaceNext = null; showHistory(); }
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
  // ---- deep links: #d=<day>, #d=<day>&p=<place>, #d=<day>&ph=<guid>, #ph=<guid>,
  //      #v=map|stats|gallery, #v=map&then=<era>, #v=history&era=<slug>[&ch=<strand>][&e=<entry>][&pl=<place>] ----
  function updateHash() {
    if (!DATA) return;
    const v = root.dataset.view || 'story';
    // switching tabs adds a browser-history entry, so Back returns to the tab (and day) you came
    // from; changes inside a tab (day, era, map overlay) just update the current one
    const st = history.state, push = !!(st && st.dccView && st.dccView !== v);
    history[push ? 'pushState' : 'replaceState']({ dccView: v }, '', v === 'story' ? '#d=' + (curDay + 1)
      : '#v=' + v + (v === 'map' && thenOn && thenIdx >= 0 && thenData ? '&then=' + encodeURIComponent(histSlugOf(thenData.frames[thenIdx].label)) : '') + (v === 'history' ? (histSlug ? '&era=' + encodeURIComponent(histSlug) : '') + (chronStrand !== 'ragusa' ? '&ch=' + chronStrand : '') +
        (chronActive ? '&e=' + encodeURIComponent(chronActive) : '') + (histPlace ? '&pl=' + encodeURIComponent(histPlace) : '') : ''));
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
    if (m.v && ['map', 'stats', 'gallery'].indexOf(m.v) >= 0) { if (m.v === 'map' && m.then) thenWant = m.then; setView(m.v); return; }
    if (m.v === 'history') { histWant = m.era || null; histLink = m.ch || m.e ? { ch: m.ch, e: m.e } : null; histPlaceNext = m.pl || null; setView('history'); return; }
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
  // ---- History tab: BalkansHistory (history/history.js), 35 eras of Balkan borders.
  //      Its script + stylesheet load on the first visit through the bundle URL (so the
  //      Elementor embed works too), and the component mounts once. ----
  let histEl = null, histHandle = null, histLoading = false, histWant = null, histSlug = null, histLink = null;
  const histSlugOf = l => String(l).toLowerCase().replace(/\s+/g, '');
  const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const scrollBehavior = () => reducedMotion() ? 'auto' : 'smooth';
  function showHistory() {
    if (!histEl) {
      histEl = el('section', 'dcc-tour-history');
      histEl.innerHTML =
        '<div class="dcc-hist-top"><div class="dcc-hist-bar">' +
          '<button class="dcc-hist-film" type="button"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span><span class="dcc-jl">Watch the 60-second film</span><span class="dcc-js">Film</span></button>' +
          '<nav class="dcc-hist-jump" aria-label="On this page">' +
            '<button type="button" data-jump="map">Map</button><button type="button" data-jump="trip">Your trip</button>' +
            '<button type="button" data-jump="street" title="See this era on today’s street map"><span class="dcc-jl">On today’s map</span><span class="dcc-js">Streets</span></button><button type="button" data-jump="chron">Chronicle</button><button type="button" data-jump="records" aria-label="Family records"><span class="dcc-jl">Family records</span><span class="dcc-js">Family</span></button></nav></div>' +
          '<div class="dcc-hist-otd" hidden></div>' +
        '</div>' +
        '<div class="dcc-hist-mount"><p class="dcc-hist-msg">Loading the history map…</p></div>' +
        '<section class="dcc-chron" aria-labelledby="dcc-chron-h"></section>';
      histEl.querySelector('.dcc-hist-film').addEventListener('click', playHistoryFilm);
      histEl.querySelector('.dcc-hist-jump').addEventListener('click', e => {
        const b = e.target.closest('[data-jump]');
        if (!b) return;
        const j = b.dataset.jump;
        if (j === 'street') { thenWant = histSlug || '1453'; setView('map'); return; }
        if (j === 'records') setStrand('records', false);
        const t = histEl.querySelector({ map: '.bh-head', trip: '.dcc-hist-trip', chron: '.dcc-chron', records: '.dcc-chron' }[j]);
        if (t) { storyLock(1600); t.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); }
      });
      root.appendChild(histEl);
    }
    if (histHandle) {
      // ignore unknown era slugs rather than letting show() clamp to 500 BC
      const f = histHandle.frames;
      if (histWant && f && f.some(fr => histSlugOf(fr.label) === histSlugOf(histWant))) histHandle.show(histWant);
      histWant = null;
      applyChronLink();
      renderHistPlace();
      return;
    }
    if (histWant) histSlug = histWant;   // keep the era in the URL while the map loads
    if (histLoading) return;
    histLoading = true;
    const mountNow = () => {
      histHandle = window.BalkansHistory.mount(histEl.querySelector('.dcc-hist-mount'), {
        dataUrl: resolveUrl('history/history-data.json'), data: thenData && thenData.view ? thenData : undefined,   // already loaded by the Map tab
        hash: false, start: histWant || undefined,
        onChange: (f, slug) => { histSlug = slug; if (root.dataset.view === 'history') updateHash(); histQueue(f); }
      });
      histWant = null;
      renderHistPlace();
    };
    loadChronicle();
    if (window.BalkansHistory) { mountNow(); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = resolveUrl('history/history.css');
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = resolveUrl('history/history.js');
    s.onload = mountNow;
    s.onerror = () => {
      histLoading = false;
      histEl.querySelector('.dcc-hist-mount').innerHTML = '<p class="dcc-hist-msg">The History tab could not be loaded.</p>';
    };
    document.head.appendChild(s);
  }
  // leaving the tab: no stray "back" pill or Ragusa playback waiting when you return
  function historyLeave() {
    if (!histEl) return;
    showChronBack(false);
    stopGrow();
    stopListen();
    const play = histEl.querySelector('.bh-transport [data-a="play"][aria-pressed="true"]');
    if (play) play.click();
  }
  // every era change runs the panels once per frame — dragging the slider fires many changes
  let histPending = null, histRaf = 0;
  function histQueue(f) {
    histPending = f;
    if (histRaf) return;
    histRaf = requestAnimationFrame(() => {
      histRaf = 0;
      const fr = histPending; histPending = null;
      renderTripThen(fr); timeMachine(fr);
      if (chron && !chronShown) chronFirstRender();
      chronicleNow(histSlugOf(fr.label)); storyUpdate(fr);
      renderHistPlace();   // no-op once drawn; the first time, it waits for the map's eras
    });
  }
  // the 60-second film plays in the shared media viewer (poster + play button, no autoplay)
  function playHistoryFilm() {
    viewerItems = [{ kind: 'video', url: resolveUrl('history/balkans-highlights.mp4'), full: '', src: '', id: '',
      poster: resolveUrl('history/balkans-highlights-poster.jpg'),
      place: 'The Balkans in 60 seconds', date: '', time: '' }];
    openViewer(0);
  }

  // ---- Time Machine: jump-to-age chips under the timeline, the neighbouring eras named on the
  //      step buttons, a year bubble on the slider, and swipe-to-step on the map (only while
  //      it isn't zoomed, so panning still works). The ages match the timeline's own bands. ----
  const TM_AGES = [['Greek', -500, '#4d8fd6'], ['Roman', -146, '#9b72c4'], ['Medieval', 476, '#5d8c3c'],
                   ['Ottoman', 1453, '#3f9a78'], ['Modern', 1878, '#d8bf55']];
  let histIdx = 0;
  function timeMachine(f) {
    const F = histHandle && histHandle.frames, bh = histEl && histEl.querySelector('.bh-root');
    if (!F || !bh) return;
    histIdx = F.indexOf(f);
    let bar = bh.querySelector('.dcc-tm');
    if (!bar) {
      const tl = bh.querySelector('.bh-timeline');
      if (!tl) return;
      bar = el('div', 'dcc-tm');
      bar.innerHTML = '<div class="dcc-tm-ages" role="group" aria-label="Jump to an age">' + TM_AGES.map(([n, t, c]) =>
          '<button type="button" class="dcc-tm-age" data-k="' + F.findIndex(fr => fr.tpos >= t) + '" aria-pressed="false">' +
          '<i style="background:' + c + '"></i>' + n + '</button>').join('') + '</div>' +
        '<span class="dcc-tm-hint">Swipe the map or use ← → to step through time</span>';
      tl.appendChild(bar);
      bar.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) histHandle.show(+b.dataset.k); });
      wireSwipe(bh);
      wireBubble(bh, F);
    }
    let act = 0;
    TM_AGES.forEach(([, t], i) => { if (f.tpos >= t) act = i; });
    bar.querySelectorAll('.dcc-tm-age').forEach((b, i) => b.setAttribute('aria-pressed', String(i === act)));
    const step = (sel, k, arrow, word) => {
      const b = bh.querySelector('.bh-transport [data-a="' + sel + '"]');
      if (!b) return;
      const fr = F[k];
      b.textContent = fr ? (sel === 'prev' ? arrow + ' ' + fr.label : fr.label + ' ' + arrow) : arrow;
      b.classList.add('dcc-tm-step');
      // aria-disabled, not disabled: a disabled button would drop keyboard focus at the ends
      b.setAttribute('aria-disabled', String(!fr));
      b.setAttribute('aria-label', fr ? word + ' era: ' + fr.label : word + ' era');
    };
    step('prev', histIdx - 1, '‹', 'Previous');
    step('next', histIdx + 1, '›', 'Next');
  }
  function wireSwipe(bh) {
    const vp = bh.querySelector('.bh-viewport'), stage = bh.querySelector('.bh-stage');
    if (!vp || !stage) return;
    let s0 = null;
    // a second finger (pinch) or a non-primary mouse button cancels the swipe
    vp.addEventListener('pointerdown', e => {
      s0 = e.isPrimary && !(e.pointerType === 'mouse' && e.button !== 0) ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    });
    window.addEventListener('pointerup', e => {
      if (!s0 || !e.isPrimary) return;
      const dx = e.clientX - s0.x, dy = e.clientY - s0.y, dt = e.timeStamp - s0.t;
      s0 = null;
      if (vp.classList.contains('bh-zoomed')) return;   // zoomed in: the drag was a pan
      if (dt > 700 || Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
      histHandle.show(histIdx + (dx < 0 ? 1 : -1));
    });
  }
  // a bubble over the slider thumb names the era while you drag
  function wireBubble(bh, F) {
    const range = bh.querySelector('.bh-range');
    if (!range) return;
    const bub = el('span', 'dcc-tm-bubble');
    bub.setAttribute('aria-hidden', 'true');
    range.parentNode.appendChild(bub);
    let hide = 0;
    const place = () => {
      const max = +range.max || 1, v = +range.value, th = 18;
      bub.textContent = F[v] ? F[v].label : '';
      bub.style.left = (range.offsetLeft + th / 2 + (range.offsetWidth - th) * v / max) + 'px';
      bub.style.top = range.offsetTop + 'px';
      bub.classList.add('on');
      clearTimeout(hide);
    };
    const out = () => { clearTimeout(hide); hide = setTimeout(() => bub.classList.remove('on'), 500); };
    range.addEventListener('input', place);
    range.addEventListener('pointerdown', place);
    ['pointerup', 'pointercancel', 'change', 'blur'].forEach(ev => range.addEventListener(ev, out));
  }

  // ---- The Chronicle (history/chronicle.json): Ragusa, Konavle and Dalmatia, every entry with
  //      the sources it was checked against and how strong they are. Entries link to the map era
  //      that shows them, show your own photos from the spot, and drive the map as you read
  //      (story mode). Deep links: #v=history&era=…&ch=<strand>&e=<entry>. ----
  let chron = null, chronLoading = false, chronShown = false, chronStrand = 'ragusa', chronFrom = null, chronActive = null;
  // entries you've settled on, per device, for "You've read 12 of 28"
  let chronRead = new Set();
  try { chronRead = new Set(JSON.parse(localStorage.getItem('dcc-chron-read') || '[]')); } catch (e) { /* storage blocked */ }
  function chronFirstRender() { chronShown = true; renderChronicle(); renderOnThisDay(); applyChronLink(); }
  const CHRON_TAGS = { tradition: 'Tradition', debated: 'Debated' };
  // how strong an entry's best source is
  const EV_TIERS = [
    [4, 'Scholarly & archival', /hrcak\.srce\.hr|pubmed|researchgate|jas-center\.eu/],
    [3, 'Encyclopedias & institutions', /enciklopedija\.hr|lzmk\.hr|unesco\.org|irb\.hr|\/\/db\.hr|migk\.hr|matica\.hr|tzdubrovnik\.hr|britannica\.com|topostext/],
    [2, 'Wikipedia & press', /wikipedia\.org|ebsco\.com|narod\.hr|tportal\.hr|dubrovniktimes|total-croatia-news|archaeologymag|dulist\.hr|dubrovniknet\.hr/],
    [1, 'Travel guides & blogs', /./]
  ];
  const evidenceOf = src => EV_TIERS.find(t => src.some(([, u]) => t[2].test(u))) || EV_TIERS[3];
  const chronId = t => String(t).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function loadChronicle() {
    if (chron || chronLoading) return;
    chronLoading = true;
    try { const v = localStorage.getItem('dcc-chron-strand'); if (v) chronStrand = v; } catch (e) { /* storage blocked */ }
    fetch(resolveUrl('history/chronicle.json')).then(r => r.json()).then(d => {
      chron = d;
      chron.strands.forEach(st => st.events.forEach(ev => { ev.id = chronId(ev.title); }));
      // the map comes first: the chronicle (and its photos) renders once the map has drawn
      if (histHandle && histHandle.frames) chronFirstRender();
    }).catch(() => { chronLoading = false; });
  }
  // the map era that shows an event: the one named in the entry, else the first map on or after its year
  function chronFrame(sort, era) {
    const F = histHandle && histHandle.frames;
    if (!F) return null;
    return (era && F.find(fr => histSlugOf(fr.label) === era)) || F.find(fr => fr.year >= sort) || F[F.length - 1];
  }
  function chronSrcHtml(src) {
    const t = evidenceOf(src);
    return '<details class="dcc-chron-srcs"><summary>' +
      '<span class="dcc-ev dcc-ev-' + t[0] + '" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
      escapeHtml(t[1]) + ' · ' + src.length + (src.length === 1 ? ' source' : ' sources') + '</summary>' +
      '<div class="dcc-chron-src">' + src.map(([l, u]) =>
        '<a href="' + escapeAttr(u) + '" target="_blank" rel="noopener">' + escapeHtml(l) + '</a>').join('') + '</div></details>';
  }
  // your own photos from the places an entry is about
  const chronPhotoSets = {};
  function chronPhotos(ev) {
    if (!ev.places || !DATA) return null;
    if (ev.id in chronPhotoSets) return chronPhotoSets[ev.id];
    const re = new RegExp(ev.places), items = [], days = [];
    DATA.days.forEach((d, di) => (d.places || []).forEach((p, pi) => {
      if (!re.test(p.name || '')) return;
      (p.items || []).forEach(it => {
        if (!it.full) return;
        items.push({ it, p, di, pi });
        if (days.indexOf(di) < 0) days.push(di);
      });
    }));
    return (chronPhotoSets[ev.id] = items.length ? { items, days } : null);
  }
  function chronPhotosHtml(ev) {
    const ph = chronPhotos(ev);
    if (!ph) return '';
    const n = ph.items.length, k = Math.min(4, n), pick = [];
    for (let i = 0; i < k; i++) pick.push(Math.floor(i * n / k));   // spread across days and places
    const quiet = ev.tone === 'sombre';
    return '<div class="dcc-chron-you' + (quiet ? ' quiet' : '') + '"><div class="dcc-chron-you-k">' + (quiet ? 'Your photos from here' : 'You stood here') + ' · ' + escapeHtml(dayRanges(ph.days)) + '</div>' +
      '<div class="dcc-chron-thumbs">' + pick.map((j, i) =>
        '<button type="button" data-ph="' + escapeAttr(ev.id) + '" data-i="' + j + '" aria-label="Open your photo from ' + escapeAttr(ph.items[j].p.name) + '">' +
        '<img alt="" data-src="' + escapeAttr(resolveUrl(ph.items[j].it.src || ph.items[j].it.full)) + '">' +
        (i === k - 1 && n > k ? '<span>+' + (n - k) + '</span>' : '') + '</button>').join('') + '</div></div>';
  }
  // thumbnails get their src only when they come within 200px of the screen
  let thumbIO = null;
  function observeThumbs(box) {
    const imgs = box.querySelectorAll('img[data-src]');
    if (!('IntersectionObserver' in window)) { imgs.forEach(im => { im.src = im.dataset.src; }); return; }
    if (thumbIO) thumbIO.disconnect();
    thumbIO = new IntersectionObserver(es => es.forEach(x => {
      if (!x.isIntersecting) return;
      x.target.src = x.target.dataset.src; x.target.removeAttribute('data-src'); thumbIO.unobserve(x.target);
    }), { rootMargin: '200px 0px' });
    imgs.forEach(im => thumbIO.observe(im));
  }
  function openChronPhotos(id, i) {
    const ev = chronEvent(id), ph = ev && chronPhotos(ev);
    if (!ph) return;
    viewerItems = ph.items.map(x => {
      const m = viewerMeta(x.it, x.p.name);
      m.mapRef = { di: x.di, pi: x.pi, place: x.p.name, count: placeCount(x.p) };
      return m;
    });
    openViewer(i);
  }
  function chronEvent(id) {
    for (const st of (chron ? chron.strands : [])) { const ev = st.events.find(e => e.id === id); if (ev) return ev; }
    return null;
  }
  function renderChronicle() {
    const box = histEl && histEl.querySelector('.dcc-chron');
    if (!box || !chron) return;
    const tabs = chron.strands.map(st => [st.id, st.name]).concat([['records', 'Family records']]);
    if (!tabs.some(t => t[0] === chronStrand)) chronStrand = 'ragusa';
    const st = chron.strands.find(x => x.id === chronStrand);
    const n = chron.strands.reduce((s, x) => s + x.events.length, 0);
    box.innerHTML =
      '<div class="dcc-chron-head"><div class="dcc-chron-k">' + svgIcon('history') + '<span>The chronicle · ' + n + ' entries</span></div>' +
        '<h2 id="dcc-chron-h">Ragusa, Konavle &amp; Dalmatia</h2>' +
        '<p>Every entry shows how strong its sources are. As you read, the map follows the story.</p>' +
        '<button type="button" class="dcc-chron-print">Print the chronicle</button></div>' +
      '<div class="dcc-chron-tabs" role="tablist" aria-label="Chronicle">' + tabs.map(([id, nm]) =>
        '<button type="button" role="tab" id="dcc-chron-t-' + id + '" aria-controls="dcc-chron-panel" aria-selected="' + (id === chronStrand) + '"' +
        ' tabindex="' + (id === chronStrand ? 0 : -1) + '" data-strand="' + id + '">' + escapeHtml(nm) + '</button>').join('') + '</div>' +
      '<div class="dcc-chron-body' + (st ? '' : ' dcc-chron-solo') + '">' + (st ? storyHtml() : '') +
        '<div class="dcc-chron-panel" id="dcc-chron-panel" role="tabpanel" aria-labelledby="dcc-chron-t-' + chronStrand + '">' +
          (st ? chronStrandHtml(st) : chronRootsHtml(chron.records)) + '</div></div>';
    if (!box._wired) {
      box._wired = true;
      box.addEventListener('click', chronClick);
      box.addEventListener('input', rootsInput);
      box.addEventListener('submit', rootsSubmit);
      box.addEventListener('change', e => {
        rootsInput(e);
        if (!e.target.matches('.dcc-story-follow input')) return;
        storyFollow = e.target.checked;
        try { localStorage.setItem('dcc-story-follow', storyFollow ? '1' : '0'); } catch (err) { /* storage blocked */ }
      });
      box.addEventListener('keydown', e => {
        const t = e.target.closest('[role="tab"]');
        if (!t || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        const all = [...box.querySelectorAll('[role="tab"]')], i = all.indexOf(t);
        setStrand(all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].dataset.strand, true, true);
        e.preventDefault();
      });
    }
    chronicleNow(histSlug);
    observeStory();
    observeThumbs(box);
    if (histHandle && histHandle.frames) { const F = histHandle.frames, f = F.find(fr => histSlugOf(fr.label) === histSlug); if (f) storyUpdate(f); }
  }
  function chronClick(e) {
    const t = e.target.closest('[data-strand]');
    if (t) { setStrand(t.dataset.strand, true); return; }
    if (rootsClick(e)) return;
    if (e.target.closest('.dcc-skip')) { const end = histEl.querySelector('.dcc-chron-end'); if (end) end.focus(); return; }
    const ph = e.target.closest('[data-ph]');
    if (ph) { openChronPhotos(ph.dataset.ph, +ph.dataset.i); return; }
    const go = e.target.closest('.dcc-chron-go');
    if (go && go.dataset.era && histHandle) {
      chronFrom = go.closest('li');
      storyLock(1800);
      histHandle.show(go.dataset.era);
      const head = histEl.querySelector('.bh-head');
      if (head) head.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      showChronBack(true);
      return;
    }
    const sh = e.target.closest('.dcc-chron-share');
    if (sh) {
      const li = sh.closest('li'), era = (li.querySelector('.dcc-chron-go') || {}).dataset || {};
      doShare(shareUrl('v=history' + (era.era ? '&era=' + era.era : '') + '&ch=' + chronStrand + '&e=' + li.dataset.id),
        li.querySelector('h3').textContent.replace(/\s*(Tradition|Debated)$/, ''));
      return;
    }
    if (e.target.closest('.dcc-story-grow')) { growTimer ? stopGrow() : startGrow(); return; }
    if (e.target.closest('.dcc-story-exp') || e.target.closest('.dcc-story-mini')) {
      storyOpen(!histEl.querySelector('.dcc-story').classList.contains('open'));
      return;
    }
    if (e.target.closest('.dcc-story-listen')) { listening ? stopListen() : startListen(); return; }
    const pc = e.target.closest('.dcc-chron-postcard');
    if (pc) { openPostcard(pc.closest('li').dataset.id, 0); return; }
    const gl = e.target.closest('.dcc-gl');
    if (gl) { showGloss(gl); return; }
    if (e.target.closest('.dcc-chron-print')) printChronicle();
  }
  function setStrand(id, save, focus) {
    if (id !== chronStrand) { stopGrow(); stopListen(); chronActive = null; }
    chronStrand = id;
    if (save) { try { localStorage.setItem('dcc-chron-strand', id); } catch (e) { /* storage blocked */ } }
    renderChronicle();
    if (root.dataset.view === 'history') updateHash();
    if (focus) { const t = histEl.querySelector('#dcc-chron-t-' + id); if (t) t.focus(); }
  }
  function chronStrandHtml(st) {
    return '<p class="dcc-chron-intro"><span>' + escapeHtml(st.kicker) + '</span>' + escapeHtml(st.intro) + '</p>' +
      '<p class="dcc-chron-now"></p>' +
      '<button type="button" class="dcc-skip">Skip past these entries</button>' +
      '<ol class="dcc-chron-list">' + st.events.map(ev =>
        '<li data-id="' + escapeAttr(ev.id) + '" data-sort="' + ev.sort + '"' + (ev.era ? ' data-era="' + escapeAttr(ev.era) + '"' : '') + '>' +
          '<div class="dcc-chron-y">' + escapeHtml(ev.y) + '</div>' +
          '<div class="dcc-chron-b">' +
            '<h3>' + escapeHtml(ev.title) + (ev.tag ? ' <span class="dcc-chron-tag">' + CHRON_TAGS[ev.tag] + '</span>' : '') + '</h3>' +
            '<p>' + glossHtml(ev.text) + '</p>' +
            famLinesHtml(ev) +
            chronPhotosHtml(ev) +
            '<div class="dcc-chron-acts"><button type="button" class="dcc-chron-go">See it on the map ›</button>' +
              (chronPhotos(ev) && ev.tone !== 'sombre' ? '<button type="button" class="dcc-chron-postcard">Postcard</button>' : '') +
              '<button type="button" class="dcc-chron-share" aria-label="Share this entry">Share</button></div>' +
            chronSrcHtml(ev.src) +
          '</div></li>').join('') + '</ol><span class="dcc-chron-end" tabindex="-1"></span>';
  }
  // mark the entries that belong to the era on the map, and name each entry's map
  function chronicleNow(slug) {
    const panel = histEl && histEl.querySelector('.dcc-chron-panel'), F = histHandle && histHandle.frames;
    if (!panel || !F) return;
    let n = 0;
    panel.querySelectorAll('li[data-sort]').forEach(li => {
      const f = chronFrame(+li.dataset.sort, li.dataset.era), era = f && histSlugOf(f.label), on = era === slug;
      li.classList.toggle('now', on);
      if (on) n++;
      const b = li.querySelector('.dcc-chron-go');
      if (b && f) {
        b.dataset.era = era;
        const txt = on ? 'On the map now' : 'See it on the map of ' + f.label + ' ›';
        if (b.textContent !== txt) b.textContent = txt;
        b.disabled = on;
      }
    });
    panel.querySelectorAll('.dcc-chron-list > li').forEach(li => li.classList.toggle('read', chronRead.has(li.dataset.id)));
    chronNowLine();
  }
  // after a jump to the map, a pill takes you back to the entry you came from; it goes away on
  // its own once that entry is back on screen
  let chronBackIO = null;
  function showChronBack(on) {
    if (!histEl) return;
    let b = histEl.querySelector('.dcc-chron-back');
    if (!b) {
      if (!on) return;
      b = el('button', 'dcc-chron-back', '↓ Back to the chronicle');
      b.type = 'button';
      b.addEventListener('click', () => {
        storyLock(1600);
        if (chronFrom && chronFrom.isConnected) chronFrom.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
        showChronBack(false);
      });
      histEl.appendChild(b);
    }
    b.classList.toggle('on', on);
    if (chronBackIO) { chronBackIO.disconnect(); chronBackIO = null; }
    if (on && chronFrom && 'IntersectionObserver' in window) {
      let armed = false;   // ignore the first report (the entry is still on screen as the jump starts)
      chronBackIO = new IntersectionObserver(es => {
        if (!armed) { armed = true; return; }
        if (es.some(x => x.isIntersecting)) showChronBack(false);
      }, { threshold: 0.6 });
      chronBackIO.observe(chronFrom);
    }
  }
  // deep link into the chronicle: #…&ch=<strand>&e=<entry>
  function applyChronLink() {
    if (!histLink || !chron || !histEl || !chronShown) return;
    const { ch, e } = histLink;
    if (ch && ch !== chronStrand && (ch === 'records' || chron.strands.some(s => s.id === ch))) { chronStrand = ch; chronActive = null; renderChronicle(); }
    histLink = null;
    if (!e) return;
    setTimeout(() => {
      const li = histEl.querySelector('.dcc-chron-list li[data-id="' + CSS.escape(e) + '"]');
      if (!li) return;
      storyLock(1600);
      li.scrollIntoView({ behavior: 'auto', block: 'center' });
      chronActive = li.dataset.id;
      if (root.dataset.view === 'history') updateHash();
      li.classList.add('dcc-tour-flash');
      setTimeout(() => li.classList.remove('dcc-tour-flash'), 1600);
    }, 300);
  }

  // ---- Story mode: a sticky card beside the chronicle (a slim bar on phones) shows the era and
  //      a live copy of the Ragusa coast map. As an entry stays in the middle of the screen the
  //      map turns to its era; "Watch Ragusa grow" plays the Republic's growth on the card. ----
  let storyFollow = true, storyIO = null, storyDwell = 0, storyLockUntil = 0, growTimer = 0, growCap = '';
  try { storyFollow = localStorage.getItem('dcc-story-follow') !== '0'; } catch (e) { /* storage blocked */ }
  const storyLock = ms => { storyLockUntil = Date.now() + ms; clearTimeout(storyDwell); };
  function storyHtml() {
    return '<aside class="dcc-story" aria-label="The map, following the chronicle">' +
      '<div class="dcc-story-top">' +
        '<div class="dcc-story-mini" aria-hidden="true"></div>' +
        '<div class="dcc-story-txt"><span class="dcc-story-k">The map now</span><span class="dcc-story-y"></span><span class="dcc-story-s"></span></div>' +
        '<button type="button" class="dcc-story-exp" aria-expanded="false" aria-label="Show the coast map">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>' +
      '<div class="dcc-story-more">' +
        '<div class="dcc-story-map" aria-hidden="true"></div>' +
        '<p class="dcc-story-cap"></p>' +
        '<div class="dcc-story-ctl">' +
          '<button type="button" class="dcc-story-grow" aria-pressed="false"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span><span>Watch Ragusa grow</span></button>' +
          (canListen() ? '<button type="button" class="dcc-story-listen" aria-pressed="false">' + LISTEN_ICON + '<span>Listen</span></button>' : '') +
          '<label class="dcc-story-follow"><input type="checkbox"' + (storyFollow ? ' checked' : '') + '> Map follows as you read</label>' +
        '</div></div></aside>';
  }
  function storyUpdate(f) {
    const card = histEl && histEl.querySelector('.dcc-story');
    if (!card || !f) return;
    const yEl = card.querySelector('.dcc-story-y');
    if (yEl.textContent && yEl.textContent !== f.label && !reducedMotion()) {
      yEl.classList.remove('tick'); void yEl.offsetWidth; yEl.classList.add('tick');   // the new year rolls in
    }
    yEl.textContent = f.label;
    card.querySelector('.dcc-story-s').textContent = f.ragusa.status;
    card.querySelector('.dcc-story-cap').textContent = growTimer && growCap ? growCap : f.ragusa.body;
    // a live copy of the component's coast map (territory, labels, your stops)
    const src = histEl.querySelector('.bh-ragusa svg');
    if (src) ['.dcc-story-map', '.dcc-story-mini'].forEach(sel => {
      const host = card.querySelector(sel), c = src.cloneNode(true);
      // the copies use the original's hatch patterns; dropping their <defs> avoids duplicate ids
      c.querySelectorAll('defs').forEach(x => x.remove());
      c.removeAttribute('role'); c.removeAttribute('aria-label'); c.setAttribute('aria-hidden', 'true'); c.setAttribute('focusable', 'false');
      host.replaceChildren(c);
    });
  }
  function observeStory() {
    if (storyIO) storyIO.disconnect();
    if (!('IntersectionObserver' in window)) return;
    const lis = histEl.querySelectorAll('.dcc-chron-list > li');
    if (!lis.length) return;
    storyIO = new IntersectionObserver(es => {
      if (!es.some(x => x.isIntersecting)) return;
      clearTimeout(storyDwell);
      // only an entry you settle on (not one scrolled past) turns the map: the one under the
      // reading line once scrolling has paused
      storyDwell = setTimeout(() => {
        const y = window.innerHeight * 0.45;
        const li = [...lis].find(x => { const r = x.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
        if (li) storyActivate(li);
      }, 450);
    }, { rootMargin: '-42% 0px -52% 0px' });
    lis.forEach(li => storyIO.observe(li));
  }
  function storyActivate(li) {
    if (!li.isConnected || root.dataset.view !== 'history') return;
    if (listening || Date.now() < storyLockUntil) return;   // a jump or read-aloud is moving the page
    histEl.querySelectorAll('.dcc-chron-list > li.active').forEach(x => x.classList.remove('active'));
    li.classList.add('active');
    markRead(li);
    if (!storyFollow || growTimer || !histHandle) return;
    const f = chronFrame(+li.dataset.sort, li.dataset.era), era = f && histSlugOf(f.label);
    if (era && era !== histSlug) histHandle.show(era);
  }
  // the eras where Ragusa's territory changes, straight from the map data, until the Republic ends
  function growSteps() {
    const out = []; let prev = null;
    for (const fr of histHandle.frames) {
      const R = fr.ragusa;
      if (!R.founded) continue;
      const key = R.former ? 'gone' : R.parts.join(',') + (R.ceded ? '+ceded' : '');
      if (key !== prev) { out.push(fr); prev = key; }
      if (R.former) break;
    }
    return out;
  }
  function growCaption(fr) {
    const st = chron && chron.strands.find(s => s.id === 'ragusa'), slug = histSlugOf(fr.label);
    const evs = st ? st.events.filter(ev => { const f = chronFrame(ev.sort, ev.era); return f && histSlugOf(f.label) === slug; }) : [];
    return evs.length ? evs.slice(0, 3).map(ev => ev.y + ': ' + ev.title).join(' · ') : fr.ragusa.body;
  }
  // the phone's story bar opens on demand and folds itself away once you scroll on (unless it's playing)
  let storyOpenY = 0;
  function storyOpen(open) {
    const s = histEl && histEl.querySelector('.dcc-story');
    if (!s) return;
    s.classList.toggle('open', open);
    s.querySelector('.dcc-story-exp').setAttribute('aria-expanded', String(open));
    storyOpenY = window.scrollY;
    if (!storyOpen._wired) {
      storyOpen._wired = true;
      window.addEventListener('scroll', () => {
        const c = histEl.querySelector('.dcc-story.open');
        if (c && !growTimer && !listening && Math.abs(window.scrollY - storyOpenY) > 160 &&
            getComputedStyle(c.querySelector('.dcc-story-exp')).display !== 'none') storyOpen(false);
      }, { passive: true });
    }
  }
  function startGrow() {
    if (!histHandle || !histHandle.frames) return;
    stopListen();
    const steps = growSteps(), card = histEl.querySelector('.dcc-story'), btn = card && card.querySelector('.dcc-story-grow');
    if (!steps.length || !btn) return;
    storyOpen(true);
    card.classList.add('growing');
    btn.setAttribute('aria-pressed', 'true'); btn.lastChild.textContent = 'Stop';
    let i = 0;
    const tick = () => {
      if (i >= steps.length) { stopGrow(); return; }
      growCap = growCaption(steps[i]);
      histHandle.show(histSlugOf(steps[i].label));
      i++;
      growTimer = setTimeout(tick, 3200);
    };
    growTimer = 1; tick();
  }
  function stopGrow() {
    if (!growTimer) return;
    clearTimeout(growTimer); growTimer = 0; growCap = '';
    histEl.querySelectorAll('.dcc-chron-list > li.active').forEach(x => x.classList.remove('active'));
    const card = histEl && histEl.querySelector('.dcc-story');
    if (!card) return;
    card.classList.remove('growing');
    const btn = card.querySelector('.dcc-story-grow');
    btn.setAttribute('aria-pressed', 'false'); btn.lastChild.textContent = 'Watch Ragusa grow';
  }

  // ---- On this day: the nearest anniversary in the chronicle (today, the last ten days, or the
  //      next one coming), as a banner at the top of the History tab ----
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function renderOnThisDay() {
    const box = histEl && histEl.querySelector('.dcc-hist-otd');
    if (!box || !chron) return;
    const now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), all = [];
    chron.strands.forEach(st => st.events.forEach(ev => (ev.days || []).forEach(([md, yr, line]) => {
      const [m, d] = md.split('-').map(Number);
      let diff = Math.round((new Date(now.getFullYear(), m - 1, d) - t0) / 864e5);
      if (diff < -182) diff += 365; else if (diff > 182) diff -= 365;
      all.push({ diff, m, d, yr, line, st, ev });
    })));
    const pick = all.find(c => c.diff === 0) ||
      all.filter(c => c.diff < 0 && c.diff >= -10).sort((a, b) => b.diff - a.diff)[0] ||
      all.filter(c => c.diff > 0).sort((a, b) => a.diff - b.diff)[0];
    if (!pick) return;
    const k = pick.diff === 0 ? 'On this day' : pick.diff === -1 ? 'Yesterday' : pick.diff < 0 ? (-pick.diff) + ' days ago' :
      pick.diff === 1 ? 'Tomorrow' : 'In ' + pick.diff + ' days';
    box.innerHTML = '<button type="button" class="dcc-otd" data-ch="' + pick.st.id + '" data-e="' + escapeAttr(pick.ev.id) + '">' +
      '<span class="dcc-otd-k">' + escapeHtml(k) + '</span>' +
      '<span class="dcc-otd-d">' + pick.d + ' ' + MONTHS[pick.m - 1] + (pick.yr ? ' ' + pick.yr : '') + '</span>' +
      '<span class="dcc-otd-l">' + escapeHtml(pick.line) + ' ›</span></button>';
    box.hidden = false;
    if (!box._wired) {
      box._wired = true;
      box.addEventListener('click', e => {
        const b = e.target.closest('.dcc-otd');
        if (!b) return;
        histLink = { ch: b.dataset.ch, e: b.dataset.e };
        applyChronLink();
      });
    }
  }

  // ---- Print: the whole chronicle (all strands, family records, every source written out)
  //      as a keepsake, laid out by the print stylesheet ----
  function printChronicle() {
    if (!chron) return;
    document.querySelectorAll('.dcc-print').forEach(x => x.remove());
    const ent = ev => '<div class="dcc-pr-ev"><div class="dcc-pr-y">' + escapeHtml(ev.y) + '</div><div>' +
      '<h3>' + escapeHtml(ev.title) + (ev.tag ? ' <em>(' + CHRON_TAGS[ev.tag] + ')</em>' : '') + '</h3>' +
      '<p>' + escapeHtml(ev.text) + '</p>' +
      (famLines(ev).length ? '<p class="dcc-pr-fam">' + famLines(ev).join(' · ') + '</p>' : '') +
      '<p class="dcc-pr-src">' + escapeHtml(evidenceOf(ev.src)[1]) + ': ' + ev.src.map(([l, u]) => escapeHtml(l) + ' — ' + escapeHtml(u)).join('; ') + '</p></div></div>';
    const pr = el('div', 'dcc-print',
      '<h1>Ragusa, Konavle &amp; Dalmatia</h1><p class="dcc-pr-sub">A family chronicle · Crofts in Croatia · printed ' +
        escapeHtml(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })) + '</p>' +
      chron.strands.map(st => '<section><h2>' + escapeHtml(st.name) + '</h2><p class="dcc-pr-intro">' + escapeHtml(st.intro) + '</p>' +
        st.events.map(ent).join('') + '</section>').join('') +
      (famLoad().length ? '<section><h2>Our family</h2><ul>' + famLoad().map(p => '<li>' + escapeHtml(p.n) + ' · ' + p.b + (p.d ? '–' + p.d : '') +
        (p.v ? ' · ' + escapeHtml(p.v) : '') + '</li>').join('') + '</ul></section>' : '') +
      '<section><h2>' + escapeHtml(chron.records.title) + '</h2><ul>' + chron.records.points.map(p => '<li>' + escapeHtml(p) + '</li>').join('') + '</ul>' +
        '<p class="dcc-pr-src">' + chron.records.src.map(([l, u]) => escapeHtml(l) + ' — ' + escapeHtml(u)).join('; ') + '</p></section>');
    document.body.appendChild(pr);
    document.body.classList.add('dcc-printing');
    const done = () => { document.body.classList.remove('dcc-printing'); pr.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    // no timer: on phones print() returns before the dialog has read the page. The printout is
    // hidden on screen anyway, and a later print replaces it.
    window.print();
  }

  // ---- Glossary: the first mention of a few historical terms in an entry is a tappable word
  //      with a one-line explanation ----
  const GLOSSARY = [
    ['De Administrando Imperio', 'A handbook on the empire’s neighbours written for the Byzantine emperor Constantine VII around 950 — the earliest written account of Ragusa’s founding.'],
    ['Theme of Dalmatia', 'A Byzantine province of the Dalmatian coastal towns (about 870–1060), governed from Zadar.'],
    ['Independent State of Croatia', 'The NDH: an Axis puppet state set up in 1941 under Ante Pavelić, which lasted until 1945.'],
    ['Great Council', 'The assembly of all adult male nobles of Ragusa. It elected the officials and voted on the laws the Senate proposed.'],
    ['Kanalites', 'The Slavs of Konavle (“Kanali”), as Constantine VII’s handbook calls them.'],
    ['Travunia', 'A medieval Slav principality around Trebinje, inland from Dubrovnik. Konavle belonged to it.'],
    ['perpers', 'Ragusa’s own unit of money (the perpera), used for prices, tribute and fines.'],
    ['ducats', 'Gold coins, first struck in Venice in 1284, that were the trading money of the Mediterranean.'],
    ['castellan', 'The commander of a castle — at Sokol Grad, a young Ragusan noble serving six months at a time.'],
    ['rector', 'The Republic’s head of state. He presided over the councils but had little power of his own; Konavle had its own rector at Pridvorje.'],
    ['Laus', 'The rocky islet where, by tradition, the first Ragusa was built; the city’s name is linked to it.'],
    ['ban', 'A ruler’s title in Bosnia and Croatia, roughly “lord” or “viceroy”.']
  ];
  // escape the text and turn the first mention of each glossary term into a button
  function glossHtml(text) {
    const hits = [];
    GLOSSARY.forEach(([term], gi) => {
      const m = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').exec(text);
      if (m && !hits.some(h => m.index < h.end && m.index + m[0].length > h.start)) hits.push({ start: m.index, end: m.index + m[0].length, gi });
    });
    hits.sort((a, b) => a.start - b.start);
    let out = '', at = 0;
    hits.forEach(h => {
      out += escapeHtml(text.slice(at, h.start)) +
        '<button type="button" class="dcc-gl" data-g="' + h.gi + '" aria-expanded="false">' + escapeHtml(text.slice(h.start, h.end)) + '</button>';
      at = h.end;
    });
    return out + escapeHtml(text.slice(at));
  }
  function showGloss(btn) {
    let pop = document.querySelector('.dcc-gl-pop');
    const open = pop && pop.classList.contains('on') && pop._for === btn;
    if (pop) { pop.classList.remove('on'); if (pop._for) pop._for.setAttribute('aria-expanded', 'false'); pop._for = null; }
    if (open) return;
    if (!pop) {
      pop = el('div', 'dcc-gl-pop'); pop.id = 'dcc-gl-pop'; pop.setAttribute('role', 'tooltip');
      document.body.appendChild(pop);
      const close = () => { if (pop._for) { pop._for.setAttribute('aria-expanded', 'false'); pop._for = null; } pop.classList.remove('on'); };
      document.addEventListener('click', e => { if (!e.target.closest('.dcc-gl') && !e.target.closest('.dcc-gl-pop')) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
      window.addEventListener('scroll', () => { if (pop._for && Math.abs(window.scrollY - pop._y) > 60) close(); }, { passive: true });
    }
    const [term, def] = GLOSSARY[+btn.dataset.g];
    pop.innerHTML = '<b>' + escapeHtml(term) + '</b> ' + escapeHtml(def);
    pop._for = btn; pop._y = window.scrollY; btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-describedby', 'dcc-gl-pop');
    pop.classList.add('on');
    const r = btn.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 32);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2)) + 'px';
    const below = r.bottom + 8, h = pop.offsetHeight;
    pop.style.top = (below + h > window.innerHeight - 70 ? r.top - h - 8 : below) + 'px';
  }

  // ---- Reading progress: entries you settle on count as read (on this device) ----
  function markRead(li) {
    if (!li) return;
    // the URL follows the entry you're on, so a reload comes back to it
    if (chronActive !== li.dataset.id) { chronActive = li.dataset.id; if (root.dataset.view === 'history') updateHash(); }
    if (chronRead.has(li.dataset.id)) return;
    chronRead.add(li.dataset.id);
    li.classList.add('read');
    try { localStorage.setItem('dcc-chron-read', JSON.stringify([...chronRead])); } catch (e) { /* storage blocked */ }
    chronNowLine();
  }
  function chronNowLine() {
    const panel = histEl && histEl.querySelector('.dcc-chron-panel'), now = panel && panel.querySelector('.dcc-chron-now');
    const F = histHandle && histHandle.frames;
    if (!now || !F) return;
    const lis = [...panel.querySelectorAll('.dcc-chron-list > li')], n = lis.filter(li => li.classList.contains('now')).length;
    const read = lis.filter(li => chronRead.has(li.dataset.id)).length, cur = F.find(fr => histSlugOf(fr.label) === histSlug);
    now.innerHTML = (cur ? 'The map shows ' + escapeHtml(cur.label) + (n ? ' · ' + n + (n === 1 ? ' entry' : ' entries') + ' marked below' : '') : '') +
      '<span class="dcc-chron-prog"><i style="width:' + Math.round(read / Math.max(1, lis.length) * 100) + '%"></i></span>' +
      '<span class="dcc-chron-progt">You’ve read ' + read + ' of ' + lis.length + '</span>';
  }

  // ---- Listen: the phone reads the strand aloud, entry by entry, while the map follows ----
  const canListen = () => 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  const LISTEN_ICON = '<svg class="dcc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/></svg>';
  let listening = false, listenTimer = 0;
  function setListenBtn(on) {
    const b = histEl && histEl.querySelector('.dcc-story-listen');
    if (!b) return;
    b.setAttribute('aria-pressed', String(on));
    b.lastChild.textContent = on ? 'Stop' : 'Listen';
    histEl.querySelector('.dcc-story').classList.toggle('listening', on);
  }
  function startListen() {
    if (!canListen() || !histEl) return;
    stopGrow();
    const lis = [...histEl.querySelectorAll('.dcc-chron-list > li')];
    if (!lis.length) return;
    let i = Math.max(0, lis.findIndex(li => li.classList.contains('active')));
    listening = true; setListenBtn(true);
    const voice = (speechSynthesis.getVoices() || []).find(v => /^en(-|_)GB/i.test(v.lang)) ||
                  (speechSynthesis.getVoices() || []).find(v => /^en/i.test(v.lang));
    const next = () => {
      clearTimeout(listenTimer);
      if (!listening) return;
      if (i >= lis.length) { stopListen(); return; }
      const li = lis[i++];
      histEl.querySelectorAll('.dcc-chron-list > li.active, .dcc-chron-list > li.speaking').forEach(x => x.classList.remove('active', 'speaking'));
      li.classList.add('active', 'speaking');
      markRead(li);
      storyLock(2500);
      li.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      const f = chronFrame(+li.dataset.sort, li.dataset.era);
      if (f && histHandle && histSlugOf(f.label) !== histSlug) histHandle.show(histSlugOf(f.label));
      const h3 = li.querySelector('h3');
      const text = li.querySelector('.dcc-chron-y').textContent + '. ' + (h3.firstChild ? h3.firstChild.textContent : h3.textContent) + '. ' +
        li.querySelector('.dcc-chron-b > p').textContent;
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = 0.97;
      let finished = false;
      const done = () => { if (finished) return; finished = true; li.classList.remove('speaking'); if (listening) listenTimer = setTimeout(next, 600); };
      u.onend = done; u.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      // some browsers never report the end of an utterance: move on after a generous estimate
      listenTimer = setTimeout(done, text.length * 95 + 4000);
    };
    next();
  }
  function stopListen() {
    if (!listening) return;
    listening = false;
    clearTimeout(listenTimer);
    try { speechSynthesis.cancel(); } catch (e) { /* not supported */ }
    setListenBtn(false);
    if (histEl) histEl.querySelectorAll('.dcc-chron-list > li.speaking').forEach(x => x.classList.remove('speaking'));
  }

  // ---- Postcards: an entry with your photos becomes a shareable 1080×1350 card — your photo,
  //      the year and the story, and the coast map of that moment ----
  const loadImg = src => new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
  async function postcardMap() {
    const src = histEl && histEl.querySelector('.bh-ragusa svg');
    if (!src) return null;
    const c = src.cloneNode(true), NS = 'http://www.w3.org/2000/svg';
    c.querySelectorAll('text').forEach(t => t.remove());
    c.querySelectorAll('.dcc-hist-stops circle').forEach(ci => { ci.setAttribute('fill', '#fff'); ci.setAttribute('stroke', '#201f1d'); ci.setAttribute('stroke-width', '7'); });
    const vb = (c.getAttribute('viewBox') || '0 0 1870 979').split(/\s+/).map(Number);
    const sea = document.createElementNS(NS, 'rect');
    sea.setAttribute('width', vb[2]); sea.setAttribute('height', vb[3]); sea.setAttribute('fill', '#d6e0e2');
    c.insertBefore(sea, c.firstChild);
    c.setAttribute('xmlns', NS); c.setAttribute('width', vb[2]); c.setAttribute('height', vb[3]);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' }));
    try { return await loadImg(url); } catch (e) { return null; } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
  }
  function wrapText(g, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,.;:—-]*\S*$/, '') + '…'; }
    return lines;
  }
  async function makePostcard(ev, x) {
    const W = 1080, H = 1350, PH = 760, M = 64;
    // the card's coast map shows the entry's own era: turn the map there first (story mode would anyway)
    const fr = chronFrame(ev.sort, ev.era);
    if (fr && histHandle && histSlugOf(fr.label) !== histSlug) histHandle.show(histSlugOf(fr.label));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    try { await Promise.all(['600 60px "Cormorant Garamond"', '600 40px Cinzel', '400 30px Lora'].map(f => document.fonts.load(f))); } catch (e) { /* system fonts */ }
    g.fillStyle = '#f6f1e7'; g.fillRect(0, 0, W, H);
    const img = await loadImg(resolveUrl(x.it.full || x.it.src));
    const s = Math.max(W / img.naturalWidth, PH / img.naturalHeight), iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    g.save(); g.beginPath(); g.rect(0, 0, W, PH); g.clip(); g.drawImage(img, (W - iw) / 2, (PH - ih) / 2, iw, ih); g.restore();
    g.fillStyle = '#b68235'; g.fillRect(0, PH, W, 8);
    const map = await postcardMap();
    if (map) {
      const mw = 380, mh = Math.round(mw * map.height / map.width), mx = W - M - mw, my = PH + 52;
      g.drawImage(map, mx, my, mw, mh);
      g.strokeStyle = '#b68235'; g.lineWidth = 3; g.strokeRect(mx, my, mw, mh);
      g.fillStyle = '#7d5411'; g.font = '600 20px Cinzel, Georgia, serif';
      if (fr) g.fillText('THE COAST IN ' + fr.label.toUpperCase(), mx, my + mh + 30);
    }
    const textW = map ? W - 2 * M - 380 - 36 : W - 2 * M;
    g.fillStyle = '#7d5411'; g.font = '600 24px Cinzel, Georgia, serif';
    g.fillText('CROFTS IN CROATIA · WE STOOD HERE', M, PH + 64);
    g.fillStyle = '#201f1d'; g.font = '600 92px "Cormorant Garamond", Georgia, serif';
    g.fillText(ev.y, M, PH + 160, textW);
    g.font = '600 38px Cinzel, Georgia, serif';
    let y = PH + 220;
    wrapText(g, ev.title.toUpperCase(), textW, 2).forEach(l => { g.fillText(l, M, y); y += 48; });
    g.fillStyle = '#2b2926'; g.font = '400 29px Lora, Georgia, serif';
    y = Math.max(y + 10, PH + 330);
    wrapText(g, ev.text, W - 2 * M, Math.max(2, Math.floor((H - 90 - y) / 42))).forEach(l => { g.fillText(l, M, y); y += 42; });
    g.fillStyle = '#6d6964'; g.font = '400 23px Lora, Georgia, serif';
    const d = DATA.days[x.di];
    g.fillText(x.p.name.split(',')[0] + ' · Day ' + (x.di + 1) + (d ? ' · ' + dDate(d) + ', 2025' : ''), M, H - 46);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('no image')), 'image/jpeg', 0.9));
  }
  let pcBlob = null;
  async function openPostcard(id, k) {
    const ev = chronEvent(id), ph = ev && chronPhotos(ev);
    if (!ph) return;
    k = ((k % ph.items.length) + ph.items.length) % ph.items.length;
    let ov = document.querySelector('.dcc-pc');
    if (!ov) {
      ov = el('div', 'dcc-pc');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Postcard');
      document.body.appendChild(ov);
      ov.addEventListener('click', e => {
        const a = e.target.closest('[data-pc]');
        if (!a) { if (e.target === ov) closePostcard(); return; }
        const act = a.dataset.pc;
        if (act === 'close') closePostcard();
        else if (act === 'prev' || act === 'next') openPostcard(ov.dataset.id, +ov.dataset.k + (act === 'next' ? 1 : -1));
        else if (act === 'share') sharePostcard(ov.dataset.id);
      });
      ov.addEventListener('keydown', e => { if (e.key === 'Escape') closePostcard(); });
    }
    ov.dataset.id = id; ov.dataset.k = k;
    ov.innerHTML = '<div class="dcc-pc-box"><div class="dcc-pc-img"><p>Making your postcard…</p></div>' +
      '<div class="dcc-pc-acts">' + (ph.items.length > 1 ? '<button type="button" data-pc="prev" aria-label="Previous photo">‹</button>' +
        '<span class="dcc-pc-n">Photo ' + (k + 1) + ' of ' + ph.items.length + '</span><button type="button" data-pc="next" aria-label="Next photo">›</button>' : '') +
        '<button type="button" data-pc="share" class="dcc-pc-main">' + (navigator.share ? 'Share' : 'Save') + '</button>' +
        '<button type="button" data-pc="close" class="dcc-pc-x" aria-label="Close">×</button></div></div>';
    ov.classList.add('open');
    ov.querySelector('[data-pc="share"]').focus();
    pcBlob = null;
    try {
      const blob = await makePostcard(ev, ph.items[k]);
      if (ov.dataset.id !== id || +ov.dataset.k !== k) return;   // a newer card was asked for
      pcBlob = blob;
      const url = URL.createObjectURL(blob), box = ov.querySelector('.dcc-pc-img');
      box.innerHTML = '<img alt="Postcard: ' + escapeAttr(ev.y + ', ' + ev.title) + '" src="' + url + '">';
    } catch (e) {
      ov.querySelector('.dcc-pc-img').innerHTML = '<p>The postcard couldn’t be made here — try again when online.</p>';
    }
  }
  function closePostcard() { const ov = document.querySelector('.dcc-pc'); if (ov) ov.classList.remove('open'); }
  function sharePostcard(id) {
    if (!pcBlob) return;
    const file = new File([pcBlob], 'crofts-' + id + '.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'We stood here' }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(pcBlob); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Postcard saved ✓');
  }

  // ---- Where's my village? Every Konavle village and the other parts of the old Republic, with
  //      who held them in each era of the map (same rules as "Your trip, then") ----
  const KONAVLE_VILLAGES = ['Brotnice', 'Cavtat', 'Čilipi', 'Drvenik', 'Duba Konavoska', 'Dubravka', 'Dunave', 'Gabrili', 'Gruda',
    'Jasenice', 'Komaji', 'Kuna Konavoska', 'Lovorno', 'Ljuta', 'Mihanići', 'Mikulići', 'Močići', 'Molunat', 'Obod', 'Palje Brdo',
    'Pločice', 'Poljice', 'Popovići', 'Pridvorje', 'Radovčići', 'Stravča', 'Šilješki', 'Uskoplje', 'Vitaljina', 'Vodovađa', 'Zastolje', 'Zvekovica'];
  const VILLAGES = [
    { n: 'Dubrovnik — the walled city', parts: ['city', 'core'], kind: 'main' },
    { n: 'Gruž, Lapad & Ploče (Dubrovnik)', parts: ['core'], kind: 'main' },
    { n: 'Župa dubrovačka (Mlini, Srebreno, Kupari)', parts: ['core'], kind: 'main' },
    { n: 'Lokrum', parts: ['core'], kind: 'isle' },
    { n: 'Koločep', parts: ['elaph'], kind: 'isle' },
    { n: 'Lopud', parts: ['elaph'], kind: 'isle' },
    { n: 'Šipan', parts: ['elaph'], kind: 'isle' },
    { n: 'Lastovo', parts: ['lastovo'], kind: 'other', joined: 'by 1272', italy1920: true },
    { n: 'Mljet', parts: ['mljet'], kind: 'other', joined: '1345', italy1941: true },
    { n: 'Ston', parts: ['pel'], kind: 'other', joined: '1333' },
    { n: 'Pelješac (Orebić, Janjina, Trpanj)', parts: ['pel'], kind: 'other', joined: '1333' },
    { n: 'Slano & Dubrovačko primorje', parts: ['prim'], kind: 'other', joined: '1399' }
  ].concat(KONAVLE_VILLAGES.map(n => ({ n: n + ' (Konavle)', parts: ['konavle'], kind: 'konavle', joined: '1419–26',
    epidaurum: n === 'Cavtat', italy1941: n === 'Gruda', line1942: n !== 'Cavtat' && n !== 'Gruda' })));
  const villageByName = q => {
    const k = String(q || '').trim().toLowerCase();
    return k ? VILLAGES.find(v => v.n.toLowerCase() === k || v.n.toLowerCase().replace(/ \(konavle\)$/, '') === k) : null;
  };
  // the village's story as runs of eras with the same ruler
  function villageRuns(v) {
    const F = histHandle && histHandle.frames, runs = [];
    if (!F) return runs;
    F.forEach(f => {
      const s = placeStatus(v, f), last = runs[runs.length - 1];
      if (last && last.t === s.t) last.to = f; else runs.push({ from: f, to: f, t: s.t, cls: s.cls || '' });
    });
    return runs;
  }
  function villageHtml(v) {
    if (!v) return '';
    const runs = villageRuns(v), rag = runs.filter(r => r.cls === 'rag');
    const fam = famVillage() === v.n;
    return '<div class="dcc-vt-head"><b>' + escapeHtml(v.n) + '</b>' +
        (v.joined ? '<span>Ragusan from ' + escapeHtml(v.joined) + ' to 1808</span>' : rag.length ? '<span>Ragusan from ' + escapeHtml(rag[0].from.label) + ' to 1808</span>' : '') +
        '<button type="button" class="dcc-vt-fam" aria-pressed="' + fam + '">' + (fam ? '★ Our family’s village' : '☆ Make this our family’s village') + '</button></div>' +
      '<ol class="dcc-vt">' + runs.map(r =>
        '<li class="' + r.cls + '"><button type="button" data-vt="' + escapeAttr(histSlugOf(r.from.label)) + '">' +
          '<span class="dcc-vt-y">' + escapeHtml(r.from.label) + (r.to !== r.from ? ' – ' + escapeHtml(r.to.label) : '') + '</span>' +
          '<span class="dcc-vt-t">' + escapeHtml(r.t) + '</span></button></li>').join('') + '</ol>' +
      '<p class="dcc-vt-note">Each line is one or more of the map’s eras; tap one to see that map. Konavle’s villages share Konavle’s story; in 1941–43 the Axis line between the Croatian puppet state and Italy ran through Konavle.</p>';
  }
  function famVillage() { try { return localStorage.getItem('dcc-fam-village') || ''; } catch (e) { return ''; } }

  // ---- Your family's thread: people you add (on this device) appear in the chronicle with their
  //      age at each event, and in the printed chronicle ----
  function famLoad() { try { return JSON.parse(localStorage.getItem('dcc-family') || '[]').filter(p => p && p.n && isFinite(p.b)); } catch (e) { return []; } }
  function famSave(list) { try { localStorage.setItem('dcc-family', JSON.stringify(list)); } catch (e) { /* storage blocked */ } }
  // the entry's own year: the first year it names ("1427–1672" → 1427), else its sort year
  const evYear = ev => { const m = /(\d{3,4})/.exec(ev.y); return m ? (/BC/.test(ev.y) ? -m[1] : +m[1]) : ev.sort; };
  function famLines(ev) {
    const y = evYear(ev);
    return famLoad().map(p => {
      const age = y - p.b, end = isFinite(p.d) && p.d ? p.d : p.b + 100;
      if (age < 0 || y > end) return null;
      return escapeHtml(p.n) + (age === 0 ? ' was born that year' : ' was ' + age) + (y === p.d ? ' and died that year' : '');
    }).filter(Boolean);
  }
  function famLinesHtml(ev) {
    const l = famLines(ev);
    return l.length ? '<p class="dcc-chron-fam">' + svgIcon('history') + '<span>' + l.join(' · ') + '</span></p>' : '';
  }
  function famHtml() {
    const list = famLoad();
    return '<ul class="dcc-fam-list">' + (list.length ? list.map((p, i) =>
        '<li><b>' + escapeHtml(p.n) + '</b><span>' + p.b + (p.d ? '–' + p.d : '') + (p.v ? ' · ' + escapeHtml(p.v) : '') + '</span>' +
        '<button type="button" data-fam-del="' + i + '" aria-label="Remove ' + escapeAttr(p.n) + '">Remove</button></li>').join('')
      : '<li class="dcc-fam-empty">No one added yet.</li>') + '</ul>';
  }
  function chronRootsHtml(r) {
    const fv = famVillage();
    return '<section class="dcc-roots-sec"><h3 class="dcc-chron-rech">Where’s my village?</h3>' +
        '<p class="dcc-roots-p">Pick a Konavle village or a part of the old Republic to see who held it in every era.</p>' +
        '<label class="dcc-village-pick"><span>Village or area</span><input type="search" list="dcc-villages" autocomplete="off" placeholder="e.g. Čilipi" value="' + escapeAttr(fv) + '">' +
        '<datalist id="dcc-villages">' + VILLAGES.map(v => '<option value="' + escapeAttr(v.n) + '">').join('') + '</datalist></label>' +
        '<div class="dcc-village-out" aria-live="polite" data-v="' + escapeAttr(villageByName(fv) ? villageByName(fv).n : '') + '">' + villageHtml(villageByName(fv)) + '</div></section>' +
      '<section class="dcc-roots-sec"><h3 class="dcc-chron-rech">Your family’s thread</h3>' +
        '<p class="dcc-roots-p">Add the people you know of. Every chronicle entry then shows how old each of them was — saved on this device only.</p>' +
        '<form class="dcc-fam-form"><label><span>Name</span><input name="n" required maxlength="60" autocomplete="off"></label>' +
          '<label><span>Born</span><input name="b" required inputmode="numeric" pattern="-?[0-9]{1,4}" placeholder="1452"></label>' +
          '<label><span>Died</span><input name="d" inputmode="numeric" pattern="-?[0-9]{1,4}" placeholder="optional"></label>' +
          '<label class="dcc-fam-v"><span>Village</span><input name="v" list="dcc-villages" autocomplete="off" placeholder="optional"></label>' +
          '<button type="submit">Add</button></form>' +
        famHtml() + '</section>' +
      '<section class="dcc-roots-sec"><h3 class="dcc-chron-rech">' + escapeHtml(r.title) + '</h3>' +
        '<ul class="dcc-chron-rec">' + r.points.map(p => '<li>' + escapeHtml(p) + '</li>').join('') + '</ul>' + chronSrcHtml(r.src) + '</section>';
  }
  function rootsInput(e) {
    const inp = e.target.closest('.dcc-village-pick input');
    if (!inp) return;
    const v = villageByName(inp.value), out = inp.closest('.dcc-roots-sec').querySelector('.dcc-village-out'), key = v ? v.n : '';
    // only when the village changes: the blur 'change' would otherwise swap a button out mid-tap
    if ((v || !inp.value) && out.dataset.v !== key) { out.dataset.v = key; out.innerHTML = villageHtml(v); }
  }
  function rootsClick(e) {
    const vt = e.target.closest('[data-vt]');
    if (vt && histHandle) {
      chronFrom = vt.closest('li');
      storyLock(1800);
      histHandle.show(vt.dataset.vt);
      const head = histEl.querySelector('.bh-head');
      if (head) head.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      showChronBack(true);
      return true;
    }
    const fb = e.target.closest('.dcc-vt-fam');
    if (fb) {
      const name = fb.closest('.dcc-village-out').querySelector('.dcc-vt-head b').textContent, on = famVillage() !== name;
      try { if (on) localStorage.setItem('dcc-fam-village', name); else localStorage.removeItem('dcc-fam-village'); } catch (err) { /* storage blocked */ }
      fb.closest('.dcc-village-out').innerHTML = villageHtml(villageByName(name));
      tripFamLine();
      return true;
    }
    const del = e.target.closest('[data-fam-del]');
    if (del) {
      const list = famLoad(); list.splice(+del.dataset.famDel, 1); famSave(list);
      del.closest('.dcc-roots-sec').querySelector('.dcc-fam-list').outerHTML = famHtml();
      return true;
    }
    return false;
  }
  function rootsSubmit(e) {
    const form = e.target.closest('.dcc-fam-form');
    if (!form) return;
    e.preventDefault();
    const n = form.n.value.trim(), b = parseInt(form.b.value, 10), d = parseInt(form.d.value, 10), v = form.v.value.trim();
    if (!n || !isFinite(b)) return;
    const list = famLoad();
    list.push({ n, b, d: isFinite(d) ? d : null, v: v || null });
    list.sort((x, y) => x.b - y.b);
    famSave(list);
    form.reset();
    form.closest('.dcc-roots-sec').querySelector('.dcc-fam-list').outerHTML = famHtml();
    toast(n + ' added to the chronicle ✓');
  }
  // the family village as an extra line in "Your trip, then"
  function tripFamLine(f) {
    const panel = histEl && histEl.querySelector('.dcc-hist-trip');
    if (!panel) return;
    f = f || (histHandle && histHandle.frames && histHandle.frames.find(fr => histSlugOf(fr.label) === histSlug));
    const v = villageByName(famVillage());
    let line = panel.querySelector('.dcc-hist-trip-fam');
    if (!v || !f) { if (line) line.remove(); return; }
    if (!line) {
      line = el('p', 'dcc-hist-trip-fam');
      panel.querySelector('.dcc-hist-trip-list').after(line);
    }
    const s = placeStatus(v, f);
    line.innerHTML = '<span class="dcc-hist-trip-famk">★ Your family’s village</span><b>' + escapeHtml(v.n) + '</b>' +
      '<span class="dcc-hist-trip-v' + (s.cls ? ' ' + s.cls : '') + '">' + escapeHtml(s.t) + '</span>';
  }

  // ---- "Your trip, then": the trip's stops on the Ragusa coast map, and what each one was in
  //      the era on screen. The status comes from that era's Ragusa territory list in
  //      history-data.json; TRIP_STOPS only says which piece of territory each stop lies in. ----
  const TRIP_STOPS = [
    { name: 'Dubrovnik Old Town', re: /Old City \(Stari grad\), Dubrovnik$|^Fort Lovrijenac/, parts: ['city', 'core'], kind: 'main' },
    { name: 'Lapad & Gruž',       re: /, (Lapad|Gruž), Dubrovnik$/,  parts: ['core'], kind: 'main' },
    { name: 'Mount Srđ',          re: /, Mount Srđ, Dubrovnik$/,     parts: ['core'], kind: 'main' },
    { name: 'Lokrum',             re: /Lokrum \(Otok Lokrum\)$/,     parts: ['core'], kind: 'isle' },
    { name: 'Šipan',              re: /, Šipan, Elaphiti Islands$/,  parts: ['elaph'], kind: 'isle' },
    { name: 'Lopud',              re: /(^|, )Lopud, Elaphiti Islands$/, parts: ['elaph'], kind: 'isle' },
    { name: 'Cavtat',             re: /, Cavtat$/, minLng: 18.15,    parts: ['konavle'], kind: 'konavle', epidaurum: true },
    { name: 'Čilipi airport',     re: /Čilipi$/,                     parts: ['konavle'], kind: 'konavle', line1942: true }
  ];
  const STOP_SKIP = /^(Adriatic Sea|Adriatic Highway|In-flight)|Channel|\bto\b/;
  let tripStops = null;
  function getTripStops() {
    if (tripStops) return tripStops;
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    tripStops = TRIP_STOPS.map(st => {
      const days = [], lat = [], lng = [];
      DATA.days.forEach((d, di) => (d.places || []).forEach(p => {
        if (!p.name || STOP_SKIP.test(p.name) || !st.re.test(p.name) || p.lat == null) return;
        if (st.minLng && p.lng < st.minLng) return;
        if (days.indexOf(di) < 0) days.push(di);
        lat.push(p.lat); lng.push(p.lng);
      }));
      return days.length ? Object.assign({}, st, { days, lat: med(lat), lng: med(lng) }) : null;
    }).filter(Boolean);
    return tripStops;
  }
  // "Day 4" · "Days 6–7, 13–16"
  function dayRanges(days) {
    const n = days.map(d => d + 1).sort((a, b) => a - b), out = [];
    n.forEach((v, i) => { if (i && v === n[i - 1] + 1) out[out.length - 1][1] = v; else out.push([v, v]); });
    return (n.length === 1 ? 'Day ' : 'Days ') + out.map(r => r[0] === r[1] ? r[0] : r[0] + '–' + r[1]).join(', ');
  }
  // What a stop belonged to in each era. Whether it lay inside Ragusa comes from the era's
  // territory list in history-data.json, and Ragusa's own status before 1358 is the map's
  // status line; these labels name everything else (sources in the panel's "How we know").
  // ERA_ALL: every stop shares one ruler. ERA_OUTSIDE: stops outside Ragusa, by kind of place.
  const ERA_ALL = {
    '500bc': 'Illyrian lands', '323bc': 'Illyrian lands', '300bc': 'Illyrian lands', '200bc': 'Illyrian kingdom',
    '100bc': 'Roman Republic (Illyricum)', '14ad': 'Roman Empire', '200ad': 'Roman Empire (Dalmatia)',
    '300ad': 'Roman Empire (Dalmatia)', '400ad': 'Western Roman Empire', '500ad': 'Ostrogothic Kingdom',
    '1810': 'Illyrian Provinces (France)', '1832': 'Austrian Empire', 'mar1878': 'Austria-Hungary',
    'jul1878': 'Austria-Hungary', '1913': 'Austria-Hungary', '1920': 'Kingdom of Serbs, Croats & Slovenes',
    '1938': 'Kingdom of Yugoslavia', '1942': 'Independent State of Croatia (Axis)', '1960': 'Yugoslavia (SR Croatia)',
    '1992': 'Croatia', '1995': 'Croatia', '2026': 'Croatia'
  };
  const ERA_OUTSIDE = {
    '650ad':  { main: 'Slav-settled mainland', isle: 'Byzantine Dalmatia', konavle: 'Slav-settled mainland' },
    '700ad':  { main: 'Slav-settled mainland', isle: 'Byzantine Dalmatia', konavle: 'Slav-settled mainland' },
    '900ad':  { konavle: 'Travunia (Slav principality)' },
    '1000':   { konavle: 'Travunia (Slav principality)' },
    '1100':   { konavle: 'Travunia (Slav principality)' },
    '1210':   { konavle: 'Grand Principality of Serbia' },
    '1300':   { konavle: 'Kingdom of Serbia' },
    '1355':   { konavle: 'Serbian Empire' }
  };
  const TRIP_SOURCES = [
    ['Proleksis enciklopedija: Konavle', 'https://proleksis.lzmk.hr/32039/'],
    ['Kanalites (Konavle in De Administrando Imperio)', 'https://en.wikipedia.org/wiki/Kanalites'],
    ['Dalmatia (theme)', 'https://en.wikipedia.org/wiki/Dalmatia_(theme)'],
    ['Konavle in the Second World War (Konavle museums)', 'https://blog.migk.hr/2024/05/07/konavle-u-drugom-svjetskom-ratu/'],
    ['Dubrovnik Republic (1991–1992)', 'https://en.wikipedia.org/wiki/Dubrovnik_Republic_(1991-1992)']
  ];
  // what a place belonged to in an era; `pl` is a trip stop or a village (parts, kind, flags)
  function placeStatus(pl, f) {
    const R = f.ragusa, slug = histSlugOf(f.label), kind = pl.kind;
    if (!R.founded) {
      const t = ERA_ALL[slug] || 'before Ragusa';
      return { t: pl.epidaurum ? t + ' · ' + (f.year > -230 ? 'Epidaurum' : 'Epidauros') : t };
    }
    if (R.former) {
      if (R.siege && kind === 'konavle') return { t: 'Croatia · occupied 1991–92', cls: 'war' };
      // Lastovo went to Italy at Rapallo (1920–47); in 1941 Italy annexed Mljet and eastern Konavle around Gruda,
      // while western Konavle with Cavtat went to the Croatian puppet state — the line ran through Konavle
      if (pl.italy1920 && (slug === '1920' || slug === '1938' || slug === '1942')) return { t: 'Kingdom of Italy (from 1920)' };
      if (slug === '1942' && pl.italy1941) return { t: 'Kingdom of Italy (annexed 1941)' };
      if (slug === '1942' && pl.line1942) return { t: 'Axis-occupied (the NDH–Italy line ran through Konavle)' };
      return { t: ERA_ALL[slug] || 'once Ragusan' };
    }
    if (R.parts.some(k => pl.parts.indexOf(k) >= 0)) {
      const s = String(R.status || '');
      return { t: f.year < 1358 ? 'Ragusa · ' + s.replace(/^(Under|Founded)\b/, w => w.toLowerCase()) : 'Republic of Ragusa', cls: 'rag' };
    }
    return { t: (ERA_OUTSIDE[slug] || {})[kind] || (pl.joined ? 'not yet Ragusan · joined ' + pl.joined : 'outside Ragusa') };
  }
  const stopStatus = placeStatus;
  // the coast map's own projection (history/source/export_data.py): x = (lon − 16.75)·1000, y = (43.08 − lat)·1360
  const insetXY = (lat, lng) => [(lng - 16.75) * 1000, (43.08 - lat) * 1360];
  function renderTripThen(f) {
    if (!histEl || !DATA || !f) return;
    const stops = getTripStops();
    if (!stops.length) return;
    const svgEl = histEl.querySelector('.bh-ragusa svg');
    if (svgEl && !svgEl.querySelector('.dcc-hist-stops')) {
      const NS = 'http://www.w3.org/2000/svg', g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'dcc-hist-stops');
      const vb = (svgEl.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      stops.forEach((st, i) => {
        const [x, y] = insetXY(st.lat, st.lng);
        if (!(x >= 0 && y >= 0 && x <= (vb[2] || 1870) && y <= (vb[3] || 980))) return;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('r', 22);
        c.setAttribute('data-stop', i);
        g.appendChild(c);
      });
      // under the labels (the last group), above the territory fills
      svgEl.insertBefore(g, svgEl.lastElementChild);
    }
    let panel = histEl.querySelector('.dcc-hist-trip');
    if (!panel) {
      // built once; each era change only rewrites the text that changes
      panel = el('section', 'dcc-hist-trip');
      panel.setAttribute('aria-label', 'Your trip, then');
      panel.innerHTML =
        '<div class="dcc-hist-trip-k">' + svgIcon('history') + '<span></span></div>' +
        '<p class="dcc-hist-trip-sum"><span></span> <span class="dcc-hist-trip-key"><i></i>your stops on the coast map</span></p>' +
        '<button type="button" class="dcc-hist-street">See this era over today’s streets ›</button>' +
        '<ul class="dcc-hist-trip-list">' + stops.map((st, i) =>
          '<li><a href="#d=' + (st.days[0] + 1) + '" data-stop="' + i + '">' +
            '<i class="dcc-hist-trip-dot" aria-hidden="true"></i>' +
            '<span class="dcc-hist-trip-name"><b>' + escapeHtml(st.name) + ' <small>· ' + escapeHtml(dayRanges(st.days)) + '</small></b>' +
              '<span class="dcc-hist-trip-v"></span></span>' +
          '</a></li>').join('') + '</ul>' +
        '<details class="dcc-chron-srcs dcc-hist-trip-how"><summary>How we know</summary><div class="dcc-hist-trip-howb">' +
          '<p>Whether a place lay inside Ragusa comes from the map’s own territory data for each era. Elsewhere: Konavle was part of Travunia, then Serbian, Bosnian from 1377–78 and Ragusan from 1419–26; around 650–700 Byzantium still held the islands while Slavs settled the mainland. In 1941 Konavle was split — the west with Cavtat went to the Axis Independent State of Croatia, the east to Italy — and Čilipi lay near that line.</p>' +
          '<div class="dcc-chron-src">' + TRIP_SOURCES.map(([l, u]) => '<a href="' + escapeAttr(u) + '" target="_blank" rel="noopener">' + escapeHtml(l) + '</a>').join('') + '</div>' +
        '</div></details>';
      const rag = histEl.querySelector('.bh-ragusa');
      if (rag) rag.after(panel); else histEl.querySelector('.dcc-hist-mount').appendChild(panel);
      panel.querySelector('.dcc-hist-street').addEventListener('click', () => { thenWant = histSlug || '1453'; setView('map'); });
      const hl = (e, on) => {
        const a = e.target.closest && e.target.closest('[data-stop]'), svgNow = histEl.querySelector('.bh-ragusa svg');
        if (!a || !svgNow) return;
        const c = svgNow.querySelector('.dcc-hist-stops [data-stop="' + a.dataset.stop + '"]');
        if (c) c.classList.toggle('on', on);
      };
      panel.addEventListener('mouseover', e => hl(e, true));
      panel.addEventListener('mouseout', e => hl(e, false));
      panel.addEventListener('focusin', e => hl(e, true));
      panel.addEventListener('focusout', e => hl(e, false));
    }
    const R = f.ragusa, vs = panel.querySelectorAll('.dcc-hist-trip-v');
    let nRag = 0;
    stops.forEach((st, i) => {
      const s = stopStatus(st, f), v = vs[i];
      if (s.cls === 'rag') nRag++;
      if (v.textContent !== s.t) v.textContent = s.t;
      v.className = 'dcc-hist-trip-v' + (s.cls ? ' ' + s.cls : '');
    });
    panel.querySelector('.dcc-hist-trip-k span').textContent = 'Your trip, then · ' + f.label;
    tripFamLine(f);
    panel.querySelector('.dcc-hist-trip-sum span').textContent = R.founded && !R.former
      ? nRag + ' of ' + stops.length + ' places you went ' + (nRag === 1 ? 'was' : 'were') + ' Ragusan in ' + f.label + '.'
      : !R.founded ? 'Ragusa had not been founded yet.' : 'The Republic was gone by ' + f.label + '.';
  }

  // ---- "On this spot": short history notes on Timeline place cards. The full note sits on the
  //      first day you were at that spot; later days get a one-line chip that opens it. The link
  //      opens the History tab at that era. ----
  const PLACE_HISTORY = [
    { re: /^Fort Lovrijenac/, era: '1600', short: 'LIBERTAS over the gate', text: '“Non bene pro toto libertas venditur auro” is carved over the gate: freedom is not sold for all the gold in the world.' },
    { re: /^Stradun, /, era: '1100', short: 'the channel that may never have been', text: 'By tradition this was a sea channel between the islet of Laus and the mainland town, filled in to join them; digs under the street have found a natural sandy shore instead. Its matching stone houses went up after the 1667 earthquake.' },
    { re: /^Fort Imperial/, era: '1810', short: 'Napoleon’s fort, held in 1991', text: 'Built by Napoleon’s French between 1806 and 1812. Its defenders held it on 6 December 1991, and it now houses the Homeland War museum.' },
    { re: /^Mount Srđ Cross/, era: '1992', short: 'pulled down 1991, raised again 1997', text: 'The cross was pulled down during the 1991 attack on Dubrovnik and put back up in 1997.' },
    { re: /^Benedictine Monastery of St\. Mary, Lokrum/, era: '1000', short: 'monks here since 1023', text: 'Benedictine monks are first recorded on Lokrum in 1023.' },
    { re: /^Maximilian's Pleasure Gardens/, era: '1832', short: 'a future emperor’s garden', text: 'From 1859 Lokrum belonged to Archduke Maximilian of Austria, later Emperor of Mexico, who laid out these gardens.' },
    { re: /^Onofrio's Large Fountain/, era: '1453', short: 'spring water since 1438', text: 'Built in 1438–40 at the end of an aqueduct that carried spring water about 12 km from Šumet into the city.' },
    { re: /^Orlando's Column/, era: '1453', short: 'the Ragusan ell', text: 'Set up in stone in 1419. The knight’s forearm is said to have fixed the Ragusan ell, the city’s measure of length.' },
    { re: /^Fort Minčeta/, era: '1453', short: 'the great round tower', text: 'Rebuilt as a great round tower in the 1460s, as Ottoman power closed in after the fall of Constantinople.' },
    { re: /^Pile Gate/, era: '1600', short: 'St. Blaise on guard', text: 'St. Blaise, patron saint of the Republic, watches over the gate.' },
    { re: /^Dubrovnik Bell Tower/, era: '1453', short: 'the green men strike the hours', text: 'First built in 1444. Left leaning by the 1667 earthquake, it was rebuilt to the same design in 1929; the bronze “green men” still strike the hours.' },
    { re: /^Church of St\. Blaise/, era: '1700', short: 'rebuilt after the fire of 1706', text: 'Rebuilt in 1706–15 after a fire destroyed the medieval church; the silver statue of the saint survived.' },
    { re: /^Cathedral of the Assumption/, era: '1700', short: 'risen after the 1667 earthquake', text: 'The medieval cathedral fell in the 1667 earthquake; this Baroque one replaced it.' },
    { re: /^Fort Revelin/, era: '1526', short: 'guarding the land gate', text: 'Built in the 1460s against the Ottoman threat, and strengthened in 1538–49.' },
    { re: /(Luka Cavtat|Žal)\b.*, Cavtat$/, era: '14 AD', short: 'ancient Epidaurum', text: 'Cavtat stands on ancient Epidaurum. By tradition, its people fled to the islet of Laus in the 600s and founded Ragusa.' },
    { re: /^Skočibuha Summer Residence/, era: '1600', short: 'a shipowner’s summer house', text: 'Summer estate of the Skočibuha family, Ragusan shipowners; its 16th-century tower guarded against pirates.' },
    { re: /Ruđer Bošković Airport/, era: '1700', short: 'named for Bošković', text: 'Named for Ruđer Bošković (1711–1787), the Ragusan-born physicist and astronomer.' }
  ];
  // ---- "This place in history": every photo, video and clip from the Dubrovnik area links to the
  //      History tab for the spot it was taken (#v=history&pl=<place name>). The other tabs carry
  //      only that link; the History tab works out which part of the old Republic the spot is in
  //      (history/street.json) and shows who held it in every era, the "On this spot" note, and
  //      what was built close by. ----
  // histPlaceNext: the place a link asked for; any other way into the History tab starts without one
  let placeGeoMap = null, histPlace = null, histPlaceNext = null;
  function placeGeo(name) {
    if (!placeGeoMap) {
      placeGeoMap = new Map();
      DATA.days.forEach((d, di) => (d.places || []).forEach(p => {
        if (p.lat == null || !p.name) return;
        const g = placeGeoMap.get(p.name) || { lat: p.lat, lng: p.lng, days: [] };
        if (g.days.indexOf(di) < 0) g.days.push(di);
        placeGeoMap.set(p.name, g);
      }));
    }
    return placeGeoMap.get(name) || null;
  }
  // only spots on the Dubrovnik coast (not flights or the drive between two places)
  function histPlaceOk(name) {
    const g = name && !/^In-flight|\bto\b/.test(name) ? placeGeo(name) : null;
    return !!g && g.lat > 42.35 && g.lat < 43.1 && g.lng > 16.75 && g.lng < 18.65;
  }
  const histPlaceHref = name => '#v=history&pl=' + encodeURIComponent(name);
  function openPlaceHistory(name) { histPlaceNext = name; setView('history'); }
  function histPlaceLink(name) {
    return histPlaceOk(name) ? '<a class="dcc-tour-histlink" href="' + escapeAttr(histPlaceHref(name)) + '" onclick="event.stopPropagation()">' +
      svgIcon('history') + '<span>History of this place ›</span></a>' : '';
  }
  let streetLoading = null;
  function streetLoad() {
    if (!streetLoading) streetLoading = fetch(resolveUrl('history/street.json')).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(s => (thenStreet = s)).catch(e => { streetLoading = null; throw e; });
    return streetLoading;
  }
  // the part of the old Republic a spot lies in (or, at sea, the nearest one within 4 km)
  function placePart(lat, lng) {
    const S = thenStreet;
    if (thenInPolys(lat, lng, S.parts.city)) return { k: 'core', city: true };
    for (const k of THEN_ORDER) if (k !== 'city' && thenInPolys(lat, lng, S.parts[k] || [])) return { k };
    let best = null, bd = 4;
    const cx = Math.cos(lat * Math.PI / 180);
    THEN_ORDER.forEach(k => k !== 'city' && (S.parts[k] || []).forEach(p => p[0].forEach(q => {
      const d = Math.hypot((q[1] - lng) * cx, q[0] - lat) * 111.2;
      if (d < bd) { bd = d; best = k; }
    })));
    return best ? { k: best, sea: bd > 0.15 } : null;   // within 150 m: the outlines are simplified to ~10 m, so call it the shore
  }
  // the place as placeStatus() wants it: a named village where we have one, else its part
  function placeSubject(name, pp) {
    const P = THEN_PART[pp.k];
    const v = VILLAGES.find(v => {
      const n = v.n.replace(/ \(Konavle\)$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return v.kind !== 'main' && v.parts.indexOf(pp.k) >= 0 && new RegExp('(^|[ ,(])' + n + '([ ,)]|$)').test(name);
    });
    if (v) return { subj: v, area: v.n.replace(/ \(Konavle\)$/, '') + (v.kind === 'konavle' ? ', Konavle' : '') };
    return { subj: Object.assign({}, P, { parts: pp.city ? ['city', 'core'] : [pp.k] }), area: pp.city ? 'the walled city of Dubrovnik' : P.name };
  }
  function renderHistPlace() {
    if (!histEl) return;
    let sec = histEl.querySelector('.dcc-hist-place');
    if (!histPlace || !histHandle || !DATA) { if (sec) sec.remove(); return; }
    if (!histHandle.frames || !histHandle.frames.length) return;   // the map's eras are still loading (onChange calls back)
    const name = histPlace, g = placeGeo(name);
    if (!sec) {
      sec = el('section', 'dcc-hist-place');
      sec.setAttribute('aria-label', 'This place in history');
      sec.addEventListener('click', histPlaceClick);
      histEl.querySelector('.dcc-hist-top').after(sec);
    }
    if (sec.dataset.pl === name) return;
    sec.dataset.pl = name;
    const closeBtn = '<button type="button" class="dcc-hp-x" aria-label="Close this place" title="Close">×</button>';
    if (!g) { sec.innerHTML = closeBtn + '<p class="dcc-hist-msg">That place isn’t in the trip.</p>'; return; }
    sec.innerHTML = '<p class="dcc-hist-msg">Finding ' + escapeHtml(shortName(name)) + ' on the old maps…</p>';
    streetLoad().then(() => {
      if (sec.dataset.pl !== name) return;
      const pp = placePart(g.lat, g.lng);
      if (!pp) {
        sec.innerHTML = closeBtn + '<h2 class="dcc-hp-h">' + escapeHtml(shortName(name)) + '</h2>' +
          '<p class="dcc-hp-sub">This spot is outside the lands of the old Republic, so there’s no place history for it yet.</p>';
        return;
      }
      const { subj, area } = placeSubject(name, pp);
      const runs = villageRuns(subj);
      const note = PLACE_HISTORY.find(h => h.re.test(name));
      const cx = Math.cos(g.lat * Math.PI / 180);
      const near = THEN_MARKS.map(m => ({ m, d: Math.hypot((m.ll[1] - g.lng) * cx, m.ll[0] - g.lat) * 111200 }))
        .filter(x => x.d < 260).sort((a, b) => a.d - b.d).slice(0, 4);
      sec.innerHTML = closeBtn +
        '<div class="dcc-hist-trip-k">' + svgIcon('history') + '<span>This place in history</span></div>' +
        '<h2 class="dcc-hp-h">' + escapeHtml(shortName(name)) + '</h2>' +
        '<p class="dcc-hp-sub">' + (pp.sea ? 'Off the coast of ' : 'In ') + escapeHtml(area) + ' · you were here on ' + escapeHtml(dayRanges(g.days).replace(/^D/, 'd')) + '</p>' +
        (note ? '<aside class="dcc-hist-note"><div class="dcc-hist-note-k">' + svgIcon('history') + '<span>On this spot</span></div><p>' + escapeHtml(note.text) + '</p>' +
          '<button type="button" class="dcc-hist-note-a" data-vt="' + escapeAttr(histSlugOf(note.era)) + '">See the map of ' + escapeHtml(note.era) + ' ›</button></aside>' : '') +
        (near.length ? '<h3 class="dcc-hp-k">Built close by</h3><ul class="dcc-hp-marks">' + near.map(({ m }) =>
          '<li><i class="dcc-hp-by-' + m.by + '" aria-hidden="true"></i><div><b>' + escapeHtml(m.t) + '</b> <span>' + escapeHtml(m.s) + ' · ' + THEN_BY[m.by] + '</span>' +
            '<p>' + escapeHtml(m.x) + '</p></div></li>').join('') + '</ul>' : '') +
        '<h3 class="dcc-hp-k">Who held it</h3>' +
        '<ol class="dcc-vt">' + runs.map(r =>
          '<li class="' + r.cls + '"><button type="button" data-vt="' + escapeAttr(histSlugOf(r.from.label)) + '">' +
            '<span class="dcc-vt-y">' + escapeHtml(r.from.label) + (r.to !== r.from ? ' – ' + escapeHtml(r.to.label) : '') + '</span>' +
            '<span class="dcc-vt-t">' + escapeHtml(r.t) + '</span></button></li>').join('') + '</ol>' +
        '<p class="dcc-vt-note">Each line is one or more of the map’s eras; tap one to see that map.' + (pp.sea ? ' Out at sea, this follows the nearest coast.' : '') + '</p>' +
        '<button type="button" class="dcc-hist-street dcc-hp-street">See this spot over today’s streets ›</button>';
    }).catch(() => { sec.innerHTML = closeBtn + '<p class="dcc-hist-msg">The place history couldn’t load — try again when you’re online.</p>'; });
  }
  function histPlaceClick(e) {
    const vt = e.target.closest('[data-vt]');
    if (vt && histHandle) {
      histHandle.show(vt.dataset.vt);
      const head = histEl.querySelector('.bh-head');
      if (head) { storyLock(1600); head.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); }
      return;
    }
    if (e.target.closest('.dcc-hp-x')) { histPlace = null; renderHistPlace(); updateHash(); return; }
    if (e.target.closest('.dcc-hp-street')) {
      const g = placeGeo(histPlace);
      // the era on the History map, unless that's before Ragusa was founded
      const f = histHandle && histHandle.frames && histHandle.frames.find(x => histSlugOf(x.label) === histSlug);
      thenWant = f && f.year >= 614 ? histSlug : '1453'; thenWantLL = g ? [g.lat, g.lng] : null;
      setView('map');
    }
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
  // OpenStreetMap street tiles, fetched rather than set as an <img> src so that a refusal counts as
  // a failure: OSM answers refused requests with an "Access blocked" picture that would otherwise
  // load like any tile. The page sends no Referer (meta referrer, for the Drive thumbnails), and OSM
  // refuses tile requests without one, so these send just the site's origin. A refusal is retried
  // once past the browser cache (an old blocked tile may be saved); after 8 failures `onBroken` runs.
  function osmLayer(opts, onBroken) {
    let fails = 0;
    const Layer = L.TileLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement('img');
        tile.alt = ''; tile.setAttribute('role', 'presentation');
        const url = this.getTileUrl(coords);
        const get = cache => fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin', cache })
          .then(r => r.ok ? r.blob() : Promise.reject(new Error('tile ' + r.status)));
        get('default').catch(e => /403/.test(e.message) ? get('reload') : Promise.reject(e))
          .then(b => {
            const u = URL.createObjectURL(b);
            tile.onload = () => { URL.revokeObjectURL(u); fails = 0; done(null, tile); };
            tile.onerror = e => { URL.revokeObjectURL(u); done(e, tile); };
            tile.src = u;
          })
          .catch(e => { if (++fails >= 8 && onBroken) onBroken(); done(e, tile); });   // onBroken must be safe to repeat
        return tile;
      }
    });
    const layer = new Layer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts);
    layer.retry = () => { if (fails >= 8) { fails = 0; layer.redraw(); } };   // try the refused tiles again
    return layer;
  }
  const PLAY_GLYPH = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>';
  const PAUSE_GLYPH = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>';
  let mmColorMode = 'day';   // 'day' | 'person' | 'alt'
  function buildModeToggle() {
    const w = el('div', 'dcc-tour-modes');
    w.setAttribute('role', 'tablist');
    w.innerHTML =
      '<button class="dcc-tour-modebtn active" role="tab" aria-selected="true" data-view="story">' + svgIcon('story') + '<span>Timeline</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="gallery">' + svgIcon('gallery') + '<span>Media</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="map">' + svgIcon('map') + '<span>Map</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="stats">' + svgIcon('stats') + '<span>Stats</span></button>' +
      '<button class="dcc-tour-modebtn" role="tab" aria-selected="false" data-view="history">' + svgIcon('history') + '<span>History</span></button>' +
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
            layerOpt('mm-then', 'Old borders (Then)', false) +
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
        thenMarkup() +
        '<figure class="dcc-tour-mm-moment" id="mm-moment" hidden></figure>' +
        '<aside class="dcc-tour-mm-side" id="dcc-mm-side" hidden></aside></div>';
    return w;
  }
  let mmOsm = null, mmMap = null, mmMarkers = null, mmPathLayer = null, mmHeat = null, mmSat = null, mmLabelLayer = null, mmInit = false;
  let mmSpiderLayer = null, mmSpiderKey = null, mmAllItems = [];
  // per-ITEM colour, so each
  // photo/video/clip dot follows the current Color-by mode
  function mmItemColor(it, di) {
    if (mmColorMode === 'person') return PERSON_COLORS[it.person] || NO_COLOR;
    if (mmColorMode === 'alt') return it.alt != null ? altColor(it.alt) : NO_COLOR;
    return dayColor(di);
  }
  // ---- per-item pins with pixel-grid clustering + tap-to-fan-out ----
  // one pin per photo/video/clip at its own GPS point (colour = Color-by, plus a
  // direction arrow when Facing is on); nearby pins collapse into a count bubble,
  // tapping a bubble fans its pins out in a ring so you can tap the exact one.
  function mmPinIcon(rec, showFacing) {
    const arrow = (showFacing && rec.heading != null)
      ? '<span class="mm-pin-arrow" style="transform:rotate(' + Math.round(rec.heading) + 'deg)">' +
        '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M12 2 L18 20 L12 15 L6 20 Z"/></svg></span>' : '';
    return L.divIcon({ className: 'mm-pin' + (rec.it.kind && rec.it.kind !== 'photo' ? ' mm-pin-vid' : ''),
      iconSize: [26, 26], iconAnchor: [13, 13],
      html: '<span class="mm-pin-dot" style="background:' + rec.color + '"></span>' + arrow });
  }
  function mmItemMarker(rec, ll, showFacing) {
    const mk = L.marker(ll, { icon: mmPinIcon(rec, showFacing), keyboard: false,
      title: (rec.it.time || '') + ' · ' + rec.p.name });
    mk.on('click', (e) => { if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent); openDayItem(rec.di, rec.pi, rec.it); });
    return mk;
  }
  function mmDominantColor(group) {
    const c = {}; group.forEach(r => c[r.color] = (c[r.color] || 0) + 1);
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || NO_COLOR;
  }
  const MM_FAN_MAX = 12;   // clusters bigger than this open a thumbnail grid, not a ring
  function mmClusterBubble(group, centerLL) {
    const n = group.length, sz = n < 10 ? 34 : n < 50 ? 40 : n < 200 ? 48 : 56;
    const icon = L.divIcon({ className: 'mm-cl', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
      html: '<span class="mm-cl-inner" style="background:' + mmDominantColor(group) + ';width:' + sz + 'px;height:' + sz + 'px">' + fmt(n) + '</span>' });
    const mk = L.marker(centerLL, { icon, keyboard: false });
    const key = centerLL[0].toFixed(5) + ',' + centerLL[1].toFixed(5);
    mk.on('click', (e) => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      if (group.length > MM_FAN_MAX) { mmCloseFan(); mmOpenClusterGrid(group); return; }
      if (mmSpiderKey === key) mmCloseFan();          // tap the same bubble again -> close
      else mmSpiderfy(group, centerLL, key);
    });
    return mk;
  }
  function mmCloseFan() { if (mmSpiderLayer) mmSpiderLayer.clearLayers(); mmSpiderKey = null; }
  // fan a group's pins out in a ring around the centre, with connector legs
  function mmSpiderfy(group, centerLL, key) {
    if (!mmSpiderLayer) return;
    mmSpiderLayer.clearLayers();
    const showFacing = root._mapmode.querySelector('#mm-facing').checked;
    const cpt = mmMap.latLngToContainerPoint(centerLL);
    const n = group.length, rad = Math.min(150, 34 + n * 5.5);
    group.forEach((rec, i) => {
      const ang = (2 * Math.PI * i / n) - Math.PI / 2;
      const ll = mmMap.containerPointToLatLng(L.point(cpt.x + rad * Math.cos(ang), cpt.y + rad * Math.sin(ang)));
      mmSpiderLayer.addLayer(L.polyline([centerLL, ll], { color: '#666', weight: 1, opacity: 0.55, interactive: false }));
      mmSpiderLayer.addLayer(mmItemMarker(rec, ll, showFacing));
    });
    mmSpiderKey = key || true;
  }
  // big-cluster alternative: a scrollable thumbnail grid (like the place popup),
  // seeded so tapping a thumb previews it with prev/next across the cluster
  function mmOpenClusterGrid(group) {
    const side = root._mapmode.querySelector('#dcc-mm-side');
    viewerItems = []; const thumbs = [];
    group.forEach(rec => {
      const it = rec.it, vi = viewerItems.length;
      const meta = viewerMeta(it, rec.p.name);
      meta.mapRef = { di: rec.di, pi: rec.pi, place: rec.p.name, count: placeCount(rec.p) };
      viewerItems.push(meta);
      if (it.full) thumbs.push('<img loading="lazy" src="' + escapeAttr(resolveUrl(it.src || it.full)) + '" data-vi="' + vi + '">');
      else if (it.type === 'self_hosted' && it.url) thumbs.push('<span class="mm-play-wrap" data-vi="' + vi + '">' + (it.poster ? '<img loading="lazy" src="' + escapeAttr(resolveUrl(it.poster)) + '">' : '') + '<span class="mm-play-badge"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span></span></span>');
      else if (it.type === 'drive' && it.id) thumbs.push('<span class="mm-play-wrap" data-vi="' + vi + '"><img loading="lazy" src="https://drive.google.com/thumbnail?id=' + escapeAttr(it.id) + '&sz=w400" onerror="this.closest(\'.mm-play-wrap\').remove()"><span class="mm-play-badge"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span></span></span>');
      else if (it.poster) thumbs.push('<img loading="lazy" src="' + escapeAttr(resolveUrl(it.poster)) + '" style="opacity:.85">');
    });
    const days = []; group.forEach(r => { if (days.indexOf(r.d.short) < 0) days.push(r.d.short); });
    side.hidden = false;
    side.innerHTML = '<button class="dcc-tour-mm-close" aria-label="Close">&times;</button>' +
      '<h3>' + group.length + ' shots here</h3>' +
      '<p class="dcc-tour-mm-meta">' + escapeHtml(days.length === 1 ? days[0] : days.length + ' days') + ' · tap any to view</p>' +
      '<div class="dcc-tour-media dcc-tour-mm-grid">' + thumbs.join('') + '</div>';
    side.querySelector('.dcc-tour-mm-close').addEventListener('click', () => { side.hidden = true; });
    side.querySelector('.dcc-tour-mm-grid').addEventListener('click', e => {
      const cell = e.target.closest('[data-vi]'); if (cell) openViewer(+cell.dataset.vi);
    });
  }
  // grid-accelerated pixel clustering of mmAllItems at the current zoom
  function mmRenderMarkers() {
    if (!mmMap || !mmMarkers || !mmMap._loaded) return;
    mmMarkers.clearLayers(); if (mmSpiderLayer) mmSpiderLayer.clearLayers(); mmSpiderKey = null;
    const showFacing = root._mapmode.querySelector('#mm-facing').checked;
    const R = 40, recs = mmAllItems.map(o => { const pt = mmMap.latLngToContainerPoint([o.lat, o.lng]); o._x = pt.x; o._y = pt.y; o._used = false; return o; });
    const cells = new Map();
    recs.forEach(o => { o._gx = Math.floor(o._x / R); o._gy = Math.floor(o._y / R); const k = o._gx + ':' + o._gy; let a = cells.get(k); if (!a) { a = []; cells.set(k, a); } a.push(o); });
    recs.forEach(o => {
      if (o._used) return; o._used = true; const group = [o];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const a = cells.get((o._gx + dx) + ':' + (o._gy + dy)); if (!a) continue;
        a.forEach(q => { if (q._used) return; if (Math.hypot(q._x - o._x, q._y - o._y) <= R) { q._used = true; group.push(q); } });
      }
      // viewport culling: skip groups more than ~a screen outside the view, so a
      // deep zoom doesn't build thousands of off-screen DOM markers (pan/zoom
      // re-renders via moveend, so culled pins appear as they scroll into view)
      const size = mmMap.getSize(), pad = Math.max(size.x, size.y);
      if (o._x < -pad || o._y < -pad || o._x > size.x + pad || o._y > size.y + pad) return;
      if (group.length === 1) mmMarkers.addLayer(mmItemMarker(o, [o.lat, o.lng], showFacing));
      else {
        let sx = 0, sy = 0; group.forEach(g => { sx += g.lat; sy += g.lng; });
        mmMarkers.addLayer(mmClusterBubble(group, [sx / group.length, sy / group.length]));
      }
    });
  }
  // open a tapped item in the media viewer, seeded with that whole DAY's media
  // (time order) so prev/next walks the day; keep a ref for the "all shots here" link
  function openDayItem(di, pi, it) {
    const d = DATA.days[di]; viewerItems = []; let idx = 0;
    d.places.forEach((pp, ppi) => {
      (personOn() ? placeItems(pp) : pp.items).forEach(m => {
        const viewable = m.full || (m.type === 'self_hosted' && m.url) || (m.type === 'drive' && m.id) || m.poster;
        if (!viewable) return;
        if (m === it) idx = viewerItems.length;
        const meta = viewerMeta(m, pp.name); meta.mapRef = { di: di, pi: ppi, place: pp.name, count: placeCount(pp) };
        viewerItems.push(meta);
      });
    });
    if (viewerItems.length) openViewer(idx);
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
    if (mmInit) { setTimeout(() => mmMap.invalidateSize(), 60); thenApplyWant(); return; }
    mmInit = true;
    mmRange = [0, DATA.day_count - 1];
    // cap zoom at 18 so Esri never serves its "Map data not yet available"
    // placeholder tile (its imagery/reference layers run out past ~18 here) — task 3
    mmMap = L.map('dcc-mm-map', { scrollWheelZoom: true, maxZoom: 21 });
    // the page sends no Referer (meta referrer), but OpenStreetMap's tile servers refuse requests
    // without one ("Access blocked" tiles), so its tiles send just the site's origin
    mmOsm = osmLayer({ maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap' }, () => {
      // the street map is refused or unreachable: fall back to the satellite view
      const cb = root._mapmode.querySelector('#mm-sat');
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); toast('Street map unavailable — showing satellite'); }
    }).addTo(mmMap);
    // satellite = a hybrid (imagery + roads + place/boundary labels), ON by default (task 6)
    mmSat = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 18, attribution: 'Imagery &copy; Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 18 }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 18 }),
    ]).addTo(mmMap);
    mmLabelLayer = L.layerGroup().addTo(mmMap);   // curated place labels (below markers)
    mmPathLayer = L.layerGroup().addTo(mmMap);    // day-route lines (below the pins)
    mmMarkers = L.layerGroup().addTo(mmMap);      // item pins + cluster bubbles
    mmSpiderLayer = L.layerGroup().addTo(mmMap);  // fanned-out pins + their legs (on top)
    // re-cluster the pins whenever the view changes; collapse any open fan first
    mmMap.on('movestart zoomstart', () => { if (mmSpiderLayer) mmSpiderLayer.clearLayers(); mmSpiderKey = null; });
    mmMap.on('moveend zoomend', () => { if (mmMap && root.dataset.view === 'map') mmRenderMarkers(); });
    // tap empty map (not a pin/cluster — those stopPropagation) closes an open fan
    mmMap.on('click', () => { if (mmSpiderKey) mmCloseFan(); });
    mmMap.on('zoomend', renderMapLabels);
    const m = root._mapmode;
    m.querySelector('#mm-path').addEventListener('change', renderMapMode);
    m.querySelector('#mm-heat').addEventListener('change', renderMapMode);
    m.querySelector('#mm-sat').addEventListener('change', e => { if (e.target.checked) mmSat.addTo(mmMap); else { mmMap.removeLayer(mmSat); mmOsm.retry(); } });
    m.querySelector('#mm-track').addEventListener('change', e => toggleTrack(e.target.checked));
    m.querySelector('#mm-then').addEventListener('change', e => thenToggle(e.target.checked, null, e.target.checked && mmMap.getZoom() < 9));
    m.querySelector('.dcc-then-btn').addEventListener('click', () => thenToggle(!thenOn, null, !thenOn && mmMap.getZoom() < 9));
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
    thenApplyWant();
  }
  // a #v=map&then=<era> link, or the History tab's "On today's map"
  function thenApplyWant() {
    if (!thenWant) return;
    const w = thenWant, ll = thenWantLL; thenWant = null; thenWantLL = null;
    if (thenOn && thenData && !ll) {
      const i = thenData.frames.findIndex(x => histSlugOf(x.label) === histSlugOf(w));
      if (i >= 0 && i !== thenIdx) thenShow(i);
      return;
    }
    setTimeout(() => thenToggle(true, w, ll || true), 120);
  }
  // ---- "Then": the History tab's eras laid over the Map tab's street map and satellite.
  //      Zoomed out it shows the era's empires (the History map's own shapes); from zoom 9
  //      it switches to street-accurate outlines of Ragusa's lands (history/street.json:
  //      OpenStreetMap municipal boundaries cut at the coast map's part lines), the
  //      frontier lines that are still borders today, and dated landmarks. ----
  const THEN_PART = {
    city:     { parts: ['city'], name: 'Laus, the first town', kind: 'main' },
    core:     { parts: ['core'], name: 'Dubrovnik & Župa', kind: 'main' },
    elaph:    { parts: ['elaph'], name: 'Elaphiti Islands', kind: 'isle' },
    lastovo:  { parts: ['lastovo'], name: 'Lastovo', kind: 'other', joined: 'by 1272', italy1920: true },
    pel:      { parts: ['pel'], name: 'Ston & Pelješac', kind: 'other', joined: '1333' },
    mljet:    { parts: ['mljet'], name: 'Mljet', kind: 'other', joined: '1345', italy1941: true },
    prim:     { parts: ['prim'], name: 'Primorje', kind: 'other', joined: '1399' },
    neum:     { parts: ['neum'], name: 'Neum & Klek', kind: 'other', ceded: 'bih' },
    konavle:  { parts: ['konavle'], name: 'Konavle', kind: 'konavle', joined: '1419–26', line1942: true },
    sutorina: { parts: ['sutorina'], name: 'Sutorina', kind: 'other', ceded: 'mne' }
  };
  const THEN_ORDER = ['core', 'elaph', 'lastovo', 'pel', 'mljet', 'prim', 'neum', 'konavle', 'sutorina', 'city'];   // the first town on top
  const THEN_LAB = { core: [42.6555, 18.118], elaph: [42.7277, 17.8803] };
  // the two 1699 corridors after Ragusa handed them to the Ottomans
  const CEDED_STATUS = {
    'mar1878': 'Ottoman Empire', 'jul1878': 'Bosnia (Austro-Hungarian)', '1913': 'Austria-Hungary',
    '1920': 'Kingdom of Serbs, Croats & Slovenes', '1938': 'Kingdom of Yugoslavia', '1942': 'Axis-occupied'
  };
  const CEDED_BY = {
    bih: { '1960': 'Yugoslavia (SR Bosnia and Herzegovina)', '1992': 'Bosnia and Herzegovina (at war)', '1995': 'Bosnia and Herzegovina', '2026': 'Bosnia and Herzegovina' },
    mne: { '1960': 'Yugoslavia (SR Montenegro, from 1947)', '1992': 'FR Yugoslavia (Montenegro)', '1995': 'FR Yugoslavia (Montenegro)', '2026': 'Montenegro' }
  };
  // street-level landmarks: shown from the year they were built. Coordinates are OpenStreetMap's
  // (or the trip's own geotags); facts are the same as the Timeline's "On this spot" notes.
  const THEN_MARKS = [
    { ll: [42.5814, 18.2177], from: 14, until: 613, by: 'rome', t: 'Epidaurum', s: 'Roman colony', x: 'A Roman colony on the coastal road, where Cavtat stands today. By tradition its people fled to the islet of Laus in the 600s and founded Ragusa.' },
    { ll: [42.625, 18.1213], from: 1023, by: 'church', t: 'Benedictine monastery, Lokrum', s: '1023', x: 'Benedictine monks are first recorded on Lokrum in 1023.' },
    { ll: [42.6408, 18.10423], from: 1301, by: 'rag', t: 'Fort Lovrijenac', s: 'recorded 1301', x: 'First recorded in 1301. Legend says Ragusa raised it in three months to beat Venice to the rock. Over its gate: “Freedom is not sold for all the gold in the world.”' },
    { ll: [42.64297, 18.10843], from: 1319, by: 'rag', t: 'Fort Minčeta', s: '1319 · round 1460s', x: 'Begun as a square tower in 1319; rebuilt as the great round tower in the 1460s, as Ottoman power closed in.' },
    { ll: [42.6398468, 18.112383], from: 1346, by: 'rag', t: 'Fort St. John', s: '1346', x: 'Its first tower, guarding the harbour mouth, dates from 1346.' },
    { ll: [42.6417295, 18.1068385], from: 1460, by: 'rag', t: 'Pile Gate', s: '1460 · outer 1537', x: 'The inner gate dates from 1460, the outer Renaissance gate and its bridge from 1537. St. Blaise, patron saint of the Republic, watches over both.' },
    { ll: [42.640938, 18.1061244], from: 1461, by: 'rag', t: 'Fort Bokar', s: '1461–1570', x: 'Begun in 1461 to designs by the Florentine Michelozzo to guard the Pile Gate from the sea, and finished in 1570.' },
    { ll: [42.6420229, 18.1127296], from: 1628, by: 'rag', t: 'Ploče Gate', s: 'outer gate 1628', x: 'The eastern land gate, towards the Ottoman caravan road; its outer gate was built in 1628 by Mihajlo Hranjac.' },
    { ll: [42.83693, 17.69676], from: 1358, by: 'rag', t: 'Walls of Ston', s: 'begun 1358', x: 'Begun in 1358 to guard the peninsula Ragusa bought in 1333, and its salt pans.' },
    { ll: [42.641106, 18.110278], from: 1419, by: 'rag', t: 'Orlando’s Column', s: '1419', x: 'Set up in stone in 1419. The knight’s forearm is said to have fixed the Ragusan ell, the city’s measure of length.' },
    { ll: [42.64032, 18.11073], from: 1435, by: 'rag', t: 'Rector’s Palace', s: 'rebuilt 1435', x: 'Seat of the Rector and the Republic’s councils. Rebuilt after a gunpowder blast in 1435, and again after a second in 1463.' },
    { ll: [42.64155, 18.1073], from: 1438, by: 'rag', t: 'Onofrio’s Fountain', s: '1438', x: 'Built in 1438–40 at the end of an aqueduct that carried spring water about 12 km from Šumet into the city.' },
    { ll: [42.6409, 18.1104], from: 1444, by: 'rag', t: 'Bell Tower', s: '1444', x: 'First built in 1444. Left leaning by the 1667 earthquake, it was rebuilt to the same design in 1929.' },
    { ll: [42.64232, 18.11258], from: 1462, by: 'rag', t: 'Fort Revelin', s: '1460s', x: 'Built in the 1460s against the Ottoman threat, and strengthened in 1538–49.' },
    { ll: [42.64124, 18.11056], from: 1516, by: 'rag', t: 'Sponza Palace', s: '1516–22', x: 'Customs house and mint, built 1516–22. It came through the 1667 earthquake.' },
    { ll: [42.64167, 18.11472], from: 1590, by: 'rag', t: 'Lazareti', s: '1590–1642', x: 'Quarantine houses outside the Ploče gate, built from 1590 and finished in 1642. Travellers and goods from plague-hit lands waited here before entering the city — the Republic had made the earliest known quarantine law in 1377.' },
    { ll: [42.6403, 18.110381], from: 1667, by: 'rag', t: 'Cathedral', s: 'after 1667', x: 'The medieval cathedral fell in the 1667 earthquake; this Baroque one replaced it.' },
    { ll: [42.640629, 18.109978], from: 1706, by: 'rag', t: 'St. Blaise', s: '1706–15', x: 'Rebuilt in 1706–15 after a fire destroyed the medieval church; the silver statue of the saint survived.' },
    { ll: [42.64991, 18.11065], from: 1806, by: 'fra', t: 'Fort Imperial', s: 'France, 1806–12', x: 'Built by Napoleon’s French between 1806 and 1812, looking down on the whole city. Its defenders held it on 6 December 1991; it now houses the Homeland War museum.' },
    { ll: [42.62997, 18.11674], from: 1806, by: 'fra', t: 'Fort Royal, Lokrum', s: 'France, 1806', x: 'Begun by the French in 1806 on Lokrum’s highest point; the Austrians later enlarged it.' },
    { ll: [42.6242, 18.1201], from: 1859, by: 'aus', t: 'Maximilian’s gardens', s: 'Austria, 1859', x: 'From 1859 Lokrum belonged to Archduke Maximilian of Austria, later Emperor of Mexico, who laid out these gardens.' },
    { ll: [42.64274, 18.10492], from: 1897, by: 'aus', t: 'Grand Hotel Imperial', s: '1897', x: 'Dubrovnik’s first modern hotel, opened in 1897 under Habsburg rule. It was shelled in 1991.' },
    { ll: [42.649189, 18.111862], from: 1991, by: 'cro', t: 'Mount Srđ Cross', s: '1991 · 1997', x: 'Pulled down during the 1991 attack on Dubrovnik and put back up in 1997.' }
  ];
  const THEN_BY = { rome: 'Rome', church: 'the Church', rag: 'Ragusa', fra: 'France', aus: 'Austria', cro: 'Croatia' };
  let thenScrub = false, thenOn = false, thenData = null, thenStreet = null, thenIdx = -1, thenWant = null, thenWantLL = null, thenLoading = null;
  let thenWide = null, thenNear = null, thenTop = null, thenPlay = null, thenCmp = 0.5, thenCmpOn = false, thenRW = null, thenRN = null, thenRB = null;
  const thenRingsCache = new Map();
  const thenLL = (x, y) => [48.4 - y / 132.7, 12 + x / 100];   // the History map's own projection, inverted
  function thenRings(d) {
    let r = thenRingsCache.get(d);
    if (!r) {
      r = d.split('M').filter(s => s.trim()).map(s => s.replace(/Z/g, '').trim().split(/\s+/)
        .map(p => { const c = p.split(','); return thenLL(+c[0], +c[1]); }));
      thenRingsCache.set(d, r);
    }
    return r;
  }
  function thenLoad() {
    const fr = histHandle && histHandle.frames;   // the History map already has them
    if (!thenLoading) thenLoading = Promise.all([
      fr ? Promise.resolve({ frames: fr }) : fetch(resolveUrl('history/history-data.json')).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      streetLoad()
    ]).then(([d]) => { thenData = d; }).catch(e => { thenLoading = null; throw e; });
    return thenLoading;
  }
  // ray-cast point-in-ring on [lat, lng] rings
  function thenPip(lat, lng, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[0] > lat) !== (b[0] > lat) && lng < a[1] + (lat - a[0]) * (b[1] - a[1]) / (b[0] - a[0])) c = !c;
    }
    return c;
  }
  const thenInPolys = (lat, lng, polys) => polys.some(p => thenPip(lat, lng, p[0]) && !p.slice(1).some(h => thenPip(lat, lng, h)));
  // the era's colour for a ruler's name, matched against the History map's own legend
  function thenColor(f, name) {
    const n = String(name || '').replace(/\s*\(.*\)\s*$/, '').toLowerCase();
    if (!n) return '#8f8a80';
    const ft = f.feats.find(x => String(x.n || '').toLowerCase() === n) ||
      f.feats.find(x => String(x.n || '').replace(/\s*\(.*\)\s*$/, '').toLowerCase() === n) ||
      f.feats.find(x => String(x.n || '').toLowerCase().indexOf(n) === 0);
    return ft ? ft.c : '#8f8a80';
  }
  // who held the land just inland of Ragusa (the History map's shapes, sampled at Trebinje)
  function thenInland(f) {
    for (const ft of f.feats) if (thenRings(ft.d).some(r => thenPip(42.711, 18.344, r))) return ft.n;
    return '';
  }
  // what one of Ragusa's parts was in an era: { t: text, cls: rag|out|ceded|split|war|era, c: colour }
  function thenPartStatus(k, f) {
    const P = THEN_PART[k], R = f.ragusa, slug = histSlugOf(f.label);
    if (P.ceded && R.founded && f.year >= 1699 && R.parts.indexOf(k) < 0) {
      const t = f.year < 1878 ? 'Ottoman Empire' : (CEDED_BY[P.ceded][slug] || CEDED_STATUS[slug] || 'Ottoman Empire');
      return { t: (f.year < 1878 ? t + ' · ceded 1699' : t), cls: 'ceded', c: thenColor(f, t) };
    }
    const s = placeStatus(P, f);
    if (s.cls === 'rag') return { t: s.t, cls: 'rag', c: '#f2c230' };
    if (s.cls === 'war') return { t: s.t, cls: 'war', c: '#c0392b' };
    if (slug === '1942' && (P.line1942 || P.italy1941 || P.italy1920)) return { t: s.t, cls: P.line1942 ? 'split' : 'era', c: thenColor(f, P.line1942 ? 'Independent State of Croatia' : 'Italy') };
    if (P.italy1920 && /Italy/.test(s.t)) return { t: s.t, cls: 'era', c: thenColor(f, 'Italy') };
    return { t: s.t, cls: R.founded && !R.former ? 'out' : 'era', c: thenColor(f, s.t) };
  }
  function thenLineInfo(k, f) {
    const R = f.ragusa, slug = histSlugOf(f.label), today = f.year >= 1992;
    if (k === 'frontier') {
      if (!R.founded || (!R.former && R.parts.indexOf('konavle') < 0)) return null;
      if (!R.former) return { t: 'Ragusa’s land frontier with the ' + (thenInland(f) || 'inland powers'), s: 'Still the Croatia–Bosnia border today.' };
      const ph = f.year < 1878 ? 'the border with the Ottoman Empire' : f.year < 1920 ? 'the line between Dalmatia and Austro-Hungarian Bosnia'
        : slug === '1942' ? 'an internal line inside the Axis-run Independent State of Croatia'
        : today ? 'the Croatia–Bosnia and Herzegovina border' : 'an internal line inside Yugoslavia';
      return { t: 'The old Ragusan frontier: ' + ph, s: today ? 'It follows Ragusa’s frontier closely.' : 'Today it is the Croatia–Bosnia border.' };
    }
    if (!R.founded || f.year < 1699) return null;
    if (k === 'neum') return { t: '1699: Ragusa hands Neum and Klek to the Ottomans', s: today ? 'A buffer against Venice that is still Bosnia and Herzegovina’s only coast.' : 'A buffer strip to keep Venice from reaching Ragusa by land.' };
    return { t: '1699: Ragusa hands Sutorina to the Ottomans', s: today ? 'The southern buffer; since 1947 Montenegro’s, and this is now the Croatia–Montenegro border.' : 'The southern buffer, matching Neum in the north.' };
  }
  // a line's story: a tooltip on hover, and a popup on tap or click (touch screens have no hover)
  function thenStory(layer, html) {
    layer.bindTooltip(html, { sticky: true, className: 'dcc-then-tip' });
    layer.bindPopup('<div class="dcc-then-pop dcc-then-pop-line">' + html + '</div>',
      { className: 'dcc-then-popup', maxWidth: 260, autoPanPaddingTopLeft: L.point(60, 60), autoPanPaddingBottomRight: L.point(20, 210) });
    layer.on('popupopen', () => layer.closeTooltip());
    return layer;
  }
  function thenInit() {
    if (thenTop) return;
    mmMap.createPane('dccThenWide').style.zIndex = 360;
    mmMap.createPane('dccThenBih').style.zIndex = 365;   // the neighbours' land: drawn solid, the whole layer translucent (CSS)
    mmMap.createPane('dccThen').style.zIndex = 370;
    mmMap.createPane('dccThenTop').style.zIndex = 610;   // landmarks above the trip's pins
    thenWide = L.layerGroup().addTo(mmMap);
    thenNear = L.layerGroup().addTo(mmMap);
    thenTop = L.layerGroup().addTo(mmMap);
    thenRW = L.svg({ pane: 'dccThenWide' }); thenRN = L.svg({ pane: 'dccThen' }); thenRB = L.svg({ pane: 'dccThenBih' });
    const wrap = root._mapmode.querySelector('.dcc-tour-mm-wrap'), ui = wrap.querySelector('.dcc-then');
    const frames = thenData.frames, rng = ui.querySelector('.dcc-then-rng');
    rng.max = frames.length - 1;
    let rngRaf = 0;
    rng.addEventListener('input', () => {
      thenStop(); thenScrub = true;
      cancelAnimationFrame(rngRaf); rngRaf = requestAnimationFrame(() => thenShow(+rng.value));
    });
    rng.addEventListener('change', () => { thenScrub = false; });
    ui.querySelector('[data-a=prev]').addEventListener('click', () => { thenStop(); thenShow(Math.max(0, thenIdx - 1)); });
    ui.querySelector('[data-a=next]').addEventListener('click', () => { thenStop(); thenShow(Math.min(frames.length - 1, thenIdx + 1)); });
    ui.querySelector('[data-a=play]').addEventListener('click', () => thenPlay ? thenStop() : thenStart());
    ui.querySelector('[data-a=cmp]').addEventListener('click', () => thenCompare(!thenCmpOn));
    ui.querySelector('[data-a=hist]').addEventListener('click', () => { histWant = histSlugOf(frames[thenIdx].label); setView('history'); });
    ui.querySelector('[data-a=close]').addEventListener('click', () => thenToggle(false));
    // the Then|Now divider: drag it across the map
    const sw = ui.querySelector('.dcc-then-swipe');
    sw.addEventListener('pointerdown', e => {
      e.preventDefault(); sw.setPointerCapture(e.pointerId);
      const move = ev => { const b = mmMap.getContainer().getBoundingClientRect(); thenCmp = Math.min(0.96, Math.max(0.04, (ev.clientX - b.left) / b.width)); thenClip(); };
      const up = () => { sw.removeEventListener('pointermove', move); sw.removeEventListener('pointerup', up); sw.removeEventListener('pointercancel', up); };
      sw.addEventListener('pointermove', move); sw.addEventListener('pointerup', up); sw.addEventListener('pointercancel', up);
    });
    sw.addEventListener('keydown', e => {
      const d = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
      if (d) { e.preventDefault(); thenCmp = Math.min(0.96, Math.max(0.04, thenCmp + d)); thenClip(); }
    });
    mmMap.on('zoomend', () => { if (thenOn) { thenZoomClass(); thenDrawTop(); thenHere(); } });
    mmMap.on('moveend', () => { if (thenOn) { thenHere(); thenDeclutter(); } });
    mmMap.on('move zoom resize', () => { if (thenOn && thenCmpOn) thenClip(); });
  }
  function thenZoomClass() {
    const z = mmMap.getZoom(), c = mmMap.getContainer();
    c.classList.toggle('dcc-then-wide', z <= 8);
    c.classList.toggle('dcc-then-near', z >= 9);
    c.classList.toggle('dcc-then-street', z >= 13);
    c.classList.toggle('dcc-then-close', z >= 16);
  }
  // one era: the empires (zoomed out), Ragusa's parts and the corridors (zoomed in)
  function thenShow(i) {
    const frames = thenData.frames, f = frames[i], prev = frames[i - 1];
    if (!f) return;
    const changed = i !== thenIdx;
    thenIdx = i;
    const ui = root._mapmode.querySelector('.dcc-then'), R = f.ragusa;
    ui.querySelector('.dcc-then-rng').value = i;
    ui.querySelector('.dcc-then-rng').setAttribute('aria-valuetext', f.label + ', ' + f.title);
    ui.querySelector('.dcc-then-yr').textContent = f.label;
    ui.querySelector('.dcc-then-t').textContent = f.title;
    ui.querySelector('.dcc-then-s').textContent = 'Ragusa · ' + R.status + ' — ' + R.body;
    ui.querySelector('[data-a=prev]').disabled = i === 0;
    ui.querySelector('[data-a=next]').disabled = i === frames.length - 1;
    if (!changed && thenNear.getLayers().length) return;
    // cross-fade: the new era is drawn into fresh groups that fade in while the old ones fade out
    const oldW = thenWide, oldN = thenNear;
    thenWide = L.layerGroup().addTo(mmMap); thenNear = L.layerGroup().addTo(mmMap);
    // zoomed out: the History map's empires
    f.feats.forEach(ft => {
      thenWide.addLayer(L.polygon(thenRings(ft.d), { renderer: thenRW, pane: 'dccThenWide', interactive: false,
        color: ft.chg ? '#d9a22b' : ft.c, weight: ft.chg ? 1.5 : 1, opacity: ft.chg ? 0.8 : 0.6, fillColor: ft.c, fillOpacity: 0.4,
        className: ft.chg ? 'dcc-then-chg' : '' }));
      if (ft.l && ft.n && ft.a > 1.5) thenWide.addLayer(L.marker(thenLL(ft.l[0], ft.l[1]), { pane: 'dccThenWide', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'dcc-then-elab', html: '<span>' + escapeHtml(ft.n) + '</span>', iconSize: null }) }));
    });
    // zoomed in: neighbours, then Ragusa's parts on today's outlines
    const S = thenStreet, inl = thenInland(f);
    // solid shapes with a matching outline: separately mapped municipalities leave hairline gaps
    // where their borders don't quite meet, and the outline closes them without darkening the seams
    thenNear.addLayer(L.polygon(S.bih, { renderer: thenRB, pane: 'dccThenBih', interactive: false,
      color: thenColor(f, inl), weight: 3, opacity: 1, fillColor: thenColor(f, inl), fillOpacity: 1, className: 'dcc-then-bih' }));
    THEN_ORDER.forEach(k => {
      if (k === 'city' && R.parts.indexOf('city') < 0) return;
      const st = thenPartStatus(k, f), polys = S.parts[k];
      if (!polys || !polys.length) return;
      const was = prev && k !== 'city' ? thenPartStatus(k, prev).cls : null;
      const gained = st.cls === 'rag' && was && was !== 'rag', lost = was === 'rag' && st.cls !== 'rag';
      const rag = st.cls === 'rag';
      thenNear.addLayer(L.polygon(polys, { renderer: thenRN, pane: 'dccThen', interactive: false,
        color: rag ? '#7d5411' : st.cls === 'war' ? '#c0392b' : '#3b3934', weight: rag || gained || lost ? 2 : 1, opacity: rag ? 0.9 : 0.5,
        dashArray: st.cls === 'out' || st.cls === 'ceded' || st.cls === 'split' || k === 'city' ? '5 5' : null,
        fillColor: st.c, fillOpacity: rag ? 0.45 : 0.3,
        className: 'dcc-then-part dcc-then-' + st.cls + (gained ? ' dcc-then-gain' : lost ? ' dcc-then-lost' : '') }));
      const lab = THEN_LAB[k] || S.lab[k];
      const tag = gained ? '<em>new in ' + escapeHtml(f.label) + '</em>' : lost ? '<em>lost</em>' : '';
      thenNear.addLayer(L.marker(lab, { pane: 'dccThenTop', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'dcc-then-plab dcc-then-plab-' + st.cls + (k === 'city' ? ' dcc-then-plab-city' : ''),
          html: '<div><b>' + escapeHtml(THEN_PART[k].name) + '</b><span>' + escapeHtml(st.t) + '</span>' + tag + '</div>', iconSize: null }) }));
    });
    // the frontier and the two 1699 corridors, on today's border lines
    ['frontier', 'neum', 'sutorina'].forEach(k => {
      const info = thenLineInfo(k, f), lines = S.lines[k];
      if (!info || !lines) return;
      thenNear.addLayer(L.polyline(lines, { renderer: thenRN, pane: 'dccThen', color: '#fff', weight: 8, opacity: 0.55, interactive: false, lineCap: 'round' }));   // a halo so the line reads on satellite
      const pl = L.polyline(lines, { renderer: thenRN, pane: 'dccThen', color: k === 'frontier' ? '#6b4508' : '#a3271b', weight: 4, opacity: 1,
        dashArray: k === 'frontier' ? '10 6' : '3 6', lineCap: 'round', className: 'dcc-then-line' });
      thenStory(pl, '<b>' + escapeHtml(info.t) + '</b><br>' + escapeHtml(info.s));
      thenNear.addLayer(pl);
      const longest = lines.reduce((a, b) => b.length > a.length ? b : a), mid = longest[longest.length >> 1];
      thenNear.addLayer(L.marker(mid, { pane: 'dccThenTop', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'dcc-then-llab' + (k === 'frontier' ? '' : ' dcc-then-llab-1699'), html: '<span>' + escapeHtml(k === 'frontier' ? (R.former ? 'old frontier' : 'frontier') : '1699 line') + '</span>', iconSize: null }) }));
    });
    // 1941–43: the Italy–NDH line through Konavle, on today's village boundaries
    const K41 = S.konavle41;
    if (histSlugOf(f.label) === '1942' && K41) {
      const it = thenColor(f, 'Italy'), tip = '<b>The 1941 line through Konavle</b><br>The Rome Agreements (May 1941) split Konavle along the Popovići–Lovorno line: east of it was annexed by Italy, the rest went to the Axis puppet Independent State of Croatia. In 1942 Italy also took Kuna and Pridvorje. Drawn on today’s village boundaries, so approximate.';
      thenNear.addLayer(L.polygon(K41.italy41, { renderer: thenRN, pane: 'dccThen', interactive: false, color: '#a3271b', weight: 1, opacity: 0.5, fillColor: it, fillOpacity: 0.5 }));
      thenNear.addLayer(L.polygon(K41.italy42, { renderer: thenRN, pane: 'dccThen', interactive: false, color: '#a3271b', weight: 1, opacity: 0.6, dashArray: '4 4', fillColor: it, fillOpacity: 0.35 }));
      thenNear.addLayer(L.polygon(K41.lovorno, { renderer: thenRN, pane: 'dccThen', interactive: false, color: '#a3271b', weight: 1, opacity: 0.6, dashArray: '2 5', fillColor: it, fillOpacity: 0.2 }));
      thenNear.addLayer(thenStory(L.polyline(K41.line41, { renderer: thenRN, pane: 'dccThen', color: '#a3271b', weight: 2.5, opacity: 0.9, dashArray: '6 5' }), tip));
      thenNear.addLayer(L.polyline(K41.line42, { renderer: thenRN, pane: 'dccThen', color: '#fff', weight: 7, opacity: 0.55, interactive: false }));
      thenNear.addLayer(thenStory(L.polyline(K41.line42, { renderer: thenRN, pane: 'dccThen', color: '#a3271b', weight: 3.5, opacity: 1 }), tip));
      thenNear.addLayer(L.marker(K41.lab41, { pane: 'dccThenTop', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'dcc-then-plab dcc-then-plab-it', html: '<div><b>Annexed by Italy</b><span>1941–43 · line approximate</span></div>', iconSize: null }) }));
    }
    // Dubrovnik's walls: land towers and gates from OSM, the sea walls along today's shore
    if (R.founded && f.year >= 1300 && S.dbkWalls) {
      thenNear.addLayer(L.polyline(S.dbkWalls.line, { renderer: thenRN, pane: 'dccThen', color: '#fff', weight: 7, opacity: 0.6, interactive: false, lineJoin: 'round' }));
      const dw = L.polyline(S.dbkWalls.line, { renderer: thenRN, pane: 'dccThen', color: '#7d5411', weight: 3.5, opacity: 1, lineJoin: 'round', className: 'dcc-then-wall' });
      thenStory(dw, '<b>The city walls</b><br>Built up from the 13th century and finished in the 1600s. Drawn between the towers and gates on today’s map, with the sea walls along the shore, so the line is approximate.');
      thenNear.addLayer(dw);
    }
    // the walls of Ston, tower to tower (begun 1358, still standing)
    if (R.founded && f.year >= 1358 && S.ston) {
      thenNear.addLayer(L.polyline(S.ston.lines, { renderer: thenRN, pane: 'dccThen', color: '#fff', weight: 7, opacity: 0.6, interactive: false, lineCap: 'round', lineJoin: 'round' }));
      const sw = L.polyline(S.ston.lines, { renderer: thenRN, pane: 'dccThen', color: '#7d5411', weight: 3.5, opacity: 1, lineCap: 'round', lineJoin: 'round', className: 'dcc-then-wall' });
      thenStory(sw, '<b>Walls of Ston, begun 1358</b><br>Drawn tower to tower, so the line is approximate: round the town, up to Pozvizd on the hill, and along the isthmus to Mali Ston.');
      thenNear.addLayer(sw);
      S.ston.towers.forEach(t => thenNear.addLayer(L.circleMarker([t[1], t[2]], { renderer: thenRN, pane: 'dccThen', radius: 4, color: '#fff', weight: 1.5, fillColor: '#7d5411', fillOpacity: 1, className: 'dcc-then-tower' })
        .bindTooltip(escapeHtml(t[0]), { className: 'dcc-then-tip', direction: 'top' }).bindPopup('<div class="dcc-then-pop"><small>Tower of the walls of Ston</small><b>' + escapeHtml(t[0]) + '</b></div>', { className: 'dcc-then-popup' })));
    }
    // the Stradun: a sea channel by tradition until the town and the islet were joined
    if (R.founded && f.year <= 1100) {
      const ch = L.polyline(S.stradun, { renderer: thenRN, pane: 'dccThen', color: '#2f7f9c', weight: 6, opacity: 0.8, dashArray: '2 8', lineCap: 'round' });
      thenStory(ch, '<b>The Stradun as a sea channel?</b><br>By tradition, water ran here between the islet of Laus and the mainland settlement until they were joined. Digs under the street have found a natural sandy shore instead.');
      thenNear.addLayer(ch);
    }
    const fade = (g, cls) => g.eachLayer(l => { const e = l._path || l._icon; if (e) e.classList.add(cls); });
    const quick = reducedMotion() || thenScrub || !oldN.getLayers().length;
    if (!quick) { fade(thenWide, 'dcc-then-in'); fade(thenNear, 'dcc-then-in'); fade(oldW, 'dcc-then-out'); fade(oldN, 'dcc-then-out'); }
    setTimeout(() => { mmMap.removeLayer(oldW); mmMap.removeLayer(oldN); }, quick ? 0 : 520);
    thenDrawTop();
    thenHere();
    if (thenCmpOn) thenClip();
    updateHash();
  }
  // landmarks that stood by this era (street zoom only)
  function thenDrawTop() {
    thenTop.clearLayers();
    if (!thenData || thenIdx < 0 || mmMap.getZoom() < 13) return;
    const f = thenData.frames[thenIdx], prev = thenData.frames[thenIdx - 1], y = f.year;
    THEN_MARKS.forEach(m => {
      if (y < m.from || (m.until != null && y > m.until)) return;
      const fresh = prev && prev.year < m.from;
      const mk = L.marker(m.ll, { pane: 'dccThenTop', keyboard: true, title: m.t,
        icon: L.divIcon({ className: 'dcc-then-mark dcc-then-by-' + m.by + (fresh ? ' dcc-then-fresh' : ''), iconSize: null,
          html: '<i aria-hidden="true"></i><span><b>' + escapeHtml(m.t) + '</b> ' + escapeHtml(m.s) + '</span>' }) });
      mk.bindPopup('<div class="dcc-then-pop"><small>' + escapeHtml(m.s) + ' · built by ' + THEN_BY[m.by] + '</small><b>' + escapeHtml(m.t) + '</b><p>' + escapeHtml(m.x) + '</p></div>',
        { className: 'dcc-then-popup', maxWidth: 260, autoPanPaddingTopLeft: L.point(60, 60), autoPanPaddingBottomRight: L.point(20, 210) });
      thenTop.addLayer(mk);
    });
    requestAnimationFrame(thenDeclutter);
  }
  // landmark labels at street zoom: where two would overlap, the one nearer the middle of the map
  // (or just built in this era) keeps its label; the other keeps its diamond, which still opens it
  function thenDeclutter() {
    if (!thenTop || !mmMap.getContainer().classList.contains('dcc-then-close')) return;
    const c = mmMap.getSize().divideBy(2), items = [];
    thenTop.eachLayer(l => {
      const ic = l._icon;
      if (!ic || !ic.classList.contains('dcc-then-mark')) return;
      ic.classList.remove('dcc-then-nolab');
      const pt = mmMap.latLngToContainerPoint(l.getLatLng());
      items.push({ ic, d: pt.distanceTo(c) - (ic.classList.contains('dcc-then-fresh') ? 1e4 : 0) });
    });
    items.sort((a, b) => a.d - b.d);
    const kept = [];
    items.forEach(it => {
      const r = it.ic.querySelector('span').getBoundingClientRect();
      if (kept.some(k => r.left < k.right + 4 && r.right > k.left - 4 && r.top < k.bottom + 2 && r.bottom > k.top - 2)) it.ic.classList.add('dcc-then-nolab');
      else kept.push(r);
    });
  }
  // "Here in 1453": what the land under the middle of the map was, at street zoom
  function thenHere() {
    const ui = root._mapmode.querySelector('.dcc-then-here');
    if (!ui || !thenData || thenIdx < 0) return;
    const f = thenData.frames[thenIdx], c = mmMap.getCenter(), z = mmMap.getZoom();
    let txt = '';
    if (z >= 10) {
      const S = thenStreet, K41 = S.konavle41;
      const inland = thenInPolys(c.lat, c.lng, S.bih), pp = inland ? null : placePart(c.lat, c.lng);
      const k = pp && (pp.city ? (f.ragusa.parts.indexOf('city') >= 0 ? 'city' : 'core') : pp.k), sea = pp && pp.sea;
      const ww2 = histSlugOf(f.label) === '1942' && k === 'konavle' && K41
        ? thenInPolys(c.lat, c.lng, K41.lovorno) ? 'on the Italy–NDH line; Lovorno changed hands'
        : thenInPolys(c.lat, c.lng, K41.italy41) ? 'Kingdom of Italy (annexed 1941)'
        : thenInPolys(c.lat, c.lng, K41.italy42) ? 'Kingdom of Italy (taken in 1942)' : 'Independent State of Croatia (Axis)' : null;
      if (k) txt = (sea ? 'Off <b>' : '<b>') + escapeHtml(THEN_PART[k].name) + '</b> in ' + escapeHtml(f.label) + ': ' + escapeHtml((!sea && ww2) || thenPartStatus(k, f).t);
      else if (inland) { const n = thenInland(f); if (n) txt = '<b>Inland</b> in ' + escapeHtml(f.label) + ': ' + escapeHtml(n); }
    }
    ui.innerHTML = txt ? '<span class="dcc-then-x" aria-hidden="true">+</span>' + txt : '';
    ui.hidden = !txt;
  }
  function thenClip() {
    const panes = ['dccThenWide', 'dccThenBih', 'dccThen', 'dccThenTop'].map(n => mmMap.getPane(n));
    const sw = root._mapmode.querySelector('.dcc-then-swipe');
    if (!thenCmpOn) { panes.forEach(p => { p.style.clipPath = ''; }); sw.hidden = true; return; }
    const size = mmMap.getSize(), x = Math.round(size.x * thenCmp);
    const nw = mmMap.containerPointToLayerPoint([0, 0]), se = mmMap.containerPointToLayerPoint(size), cx = nw.x + x;
    const poly = 'polygon(' + nw.x + 'px ' + nw.y + 'px, ' + cx + 'px ' + nw.y + 'px, ' + cx + 'px ' + se.y + 'px, ' + nw.x + 'px ' + se.y + 'px)';
    panes.forEach(p => { p.style.clipPath = poly; });
    sw.hidden = false; sw.style.left = (thenCmp * 100) + '%';
    sw.setAttribute('aria-valuenow', Math.round(thenCmp * 100));
  }
  function thenCompare(on) {
    thenCmpOn = on;
    const b = root._mapmode.querySelector('.dcc-then [data-a=cmp]');
    b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('active', on);
    thenClip();
  }
  function thenStart() {
    const frames = thenData.frames, b = root._mapmode.querySelector('.dcc-then [data-a=play]');
    if (thenIdx >= frames.length - 1) thenShow(0);
    b.innerHTML = PAUSE_GLYPH; b.setAttribute('aria-label', 'Pause'); b.title = 'Pause'; b.classList.add('playing');
    thenPlay = setInterval(() => { if (thenIdx >= frames.length - 1) thenStop(); else thenShow(thenIdx + 1); }, reducedMotion() ? 3500 : 2400);
  }
  function thenStop() {
    if (!thenPlay) return;
    clearInterval(thenPlay); thenPlay = null;
    const b = root._mapmode.querySelector('.dcc-then [data-a=play]');
    if (b) { b.innerHTML = PLAY_GLYPH; b.setAttribute('aria-label', 'Play through the eras'); b.title = 'Play through the eras'; b.classList.remove('playing'); }
  }
  // turn the overlay on/off; `slug` picks the era (default: the History tab's, else 1453)
  function thenToggle(on, slug, fly) {
    const m = root._mapmode, ui = m.querySelector('.dcc-then'), btn = m.querySelector('.dcc-then-btn'), cb = m.querySelector('#mm-then');
    thenOn = on;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.classList.toggle('active', on);
    if (cb) cb.checked = on;
    m.querySelector('.dcc-tour-mm-wrap').classList.toggle('mm-then-on', on);
    if (!on) {
      thenStop(); ui.hidden = true;
      if (thenTop) { mmMap.removeLayer(thenWide); mmMap.removeLayer(thenNear); mmMap.removeLayer(thenTop); }
      const c = mmMap.getContainer(); c.classList.remove('dcc-then-wide', 'dcc-then-near', 'dcc-then-street', 'dcc-then-close');
      if (thenCmpOn) thenCompare(false);
      updateHash();
      return;
    }
    ui.hidden = false;
    ui.querySelector('.dcc-then-s').textContent = 'Loading the eras…';
    // on a phone the bottom of the map can sit under the fixed tab bar; bring the era bar into view
    requestAnimationFrame(() => {
      const r = m.querySelector('.dcc-tour-mm-wrap').getBoundingClientRect(), tb = document.querySelector('.dcc-tour-tabbar');
      const limit = innerHeight - (tb && getComputedStyle(tb).display !== 'none' ? tb.offsetHeight : 0);   // it's position: fixed, so no offsetParent
      if (r.bottom > limit && r.top - (r.bottom - limit) > -r.height / 2) window.scrollBy({ top: r.bottom - limit + 6, behavior: scrollBehavior() });
    });
    thenLoad().then(() => {
      if (!thenOn) return;
      thenInit();
      [thenWide, thenNear, thenTop].forEach(g => { if (!mmMap.hasLayer(g)) g.addTo(mmMap); });
      thenZoomClass();
      const fr = thenData.frames, want = slug || (thenIdx < 0 ? histSlug || '1453' : null);
      let i = want ? fr.findIndex(x => histSlugOf(x.label) === histSlugOf(want)) : thenIdx;
      if (i < 0) i = fr.findIndex(x => histSlugOf(x.label) === '1453');
      thenIdx = -1; thenShow(i);
      if (fly) mmMap.flyTo(Array.isArray(fly) ? fly : [42.652, 18.098], Array.isArray(fly) ? 16 : 12, { duration: reducedMotion() ? 0 : 1.2 });
    }).catch(() => { ui.querySelector('.dcc-then-s').textContent = 'The eras could not load — try again when you’re online.'; });
  }
  function thenMarkup() {
    return '<button class="dcc-then-btn" type="button" aria-pressed="false" aria-label="Then: old borders on this map" title="See the old borders on this map">' + svgIcon('history') + '<span>Then</span></button>' +
      '<div class="dcc-then" hidden>' +
        '<div class="dcc-then-here" hidden></div>' +
        '<div class="dcc-then-swipe" role="slider" tabindex="0" aria-label="Then and now divider" aria-valuemin="0" aria-valuemax="100" hidden><span>Then</span><i></i><span>Now</span></div>' +
        '<div class="dcc-then-bar" role="group" aria-label="Era">' +
          '<div class="dcc-then-k" aria-live="polite"><b class="dcc-then-yr"></b><span class="dcc-then-t"></span>' +
            '<button type="button" class="dcc-then-x2" data-a="close" aria-label="Close the old borders" title="Close">×</button></div>' +
          '<div class="dcc-then-row">' +
            '<button type="button" data-a="play" aria-label="Play through the eras" title="Play through the eras">' + PLAY_GLYPH + '</button>' +
            '<button type="button" data-a="prev" aria-label="Earlier era" title="Earlier era">‹</button>' +
            '<input type="range" class="dcc-then-rng" min="0" max="0" value="0" step="1" aria-label="Era">' +
            '<button type="button" data-a="next" aria-label="Later era" title="Later era">›</button>' +
          '</div>' +
          '<p class="dcc-then-s"></p>' +
          '<div class="dcc-then-row2">' +
            '<button type="button" class="dcc-then-pill" data-a="cmp" aria-pressed="false">Then | Now</button>' +
            '<button type="button" class="dcc-then-pill" data-a="hist">This era’s story</button>' +
            '<span class="dcc-then-src">Old borders approximate · outlines © OpenStreetMap</span>' +
          '</div>' +
        '</div>' +
      '</div>';
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
      ['Old City (Stari grad), Dubrovnik', 'Old City · Stari grad', 'area', 12],
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
    mmMarkers.clearLayers(); mmPathLayer.clearLayers(); if (mmSpiderLayer) mmSpiderLayer.clearLayers();
    const showPath = root._mapmode.querySelector('#mm-path').checked;
    const showHeat = root._mapmode.querySelector('#mm-heat').checked;
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
    // build the flat per-item list (each photo/video/clip at its own GPS point),
    // plus the day-route lines; the pins themselves are drawn by mmRenderMarkers()
    mmAllItems = [];
    rdays.forEach(di => {
      const d = DATA.days[di], col = dayColor(di), line = [];
      d.places.forEach((p, pi) => {
        if (p.lat == null) return;
        if (personOn() && placeCount(p) === 0) return;   // these people didn't shoot here
        allPts.push([p.lat, p.lng]); line.push([p.lat, p.lng]);
        placeItems(p).forEach(it => {
          const viewable = it.full || (it.type === 'self_hosted' && it.url) || (it.type === 'drive' && it.id) || it.poster;
          if (!viewable) return;
          const lat = it.lat != null ? it.lat : p.lat, lng = it.lng != null ? it.lng : p.lng;
          heatPts.push([lat, lng, 0.6]);
          mmAllItems.push({ it: it, p: p, d: d, di: di, pi: pi, lat: lat, lng: lng, heading: it.heading, color: mmItemColor(it, di) });
        });
      });
      if (showPath && line.length > 1)
        mmPathLayer.addLayer(L.polyline(line, { color: col, weight: 2.5, opacity: 0.7, dashArray: '4 5' }));
    });
    // set the view BEFORE projecting pins — latLngToContainerPoint needs a map
    // that already has a centre/zoom. (fitBounds fires moveend -> mmRenderMarkers,
    // but we also render directly so a no-fit re-render still repaints.)
    if (fit && allPts.length) mmMap.fitBounds(L.latLngBounds(fitPts(allPts)).pad(0.12), { animate: false });
    if (mmMap._loaded) mmRenderMarkers();
    if (mmHeat) { mmMap.removeLayer(mmHeat); mmHeat = null; }
    if (showHeat && window.L && L.heatLayer)
      mmHeat = L.heatLayer(heatPts, { radius: 22, blur: 18, maxZoom: 15 }).addTo(mmMap);
    if (mmTrackLayer) drawTrack();   // keep the GPS track clipped to the shown days (task 7)
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
          (poster ? '<img loading="lazy" src="' + escapeAttr(poster) + '">' : '') + '<span class="mm-play-badge"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span></span></span>');
      } else if (it.type === 'drive' && it.id) {   // GoPro clip: Drive-generated frame + play badge
        const vi = viewerItems.length; viewerItems.push(viewerMeta(it, p.name));
        thumbs.push('<span class="mm-play-wrap" data-vi="' + vi + '">' +
          '<img loading="lazy" src="https://drive.google.com/thumbnail?id=' + escapeAttr(it.id) + '&sz=w400" onerror="this.closest(\'.mm-play-wrap\').remove()"><span class="mm-play-badge"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span></span></span>');
      } else if (it.poster) {
        thumbs.push('<img loading="lazy" src="' + escapeAttr(resolveUrl(it.poster)) + '" style="opacity:.85">');
      }
    });
    side.hidden = false;
    side.innerHTML = '<button class="dcc-tour-mm-close" aria-label="Close">&times;</button>' +
      '<h3>' + escapeHtml(p.name) + mapsLink(p.lat, p.lng, 'dcc-tour-maplink head') + '</h3>' + histPlaceLink(p.name) +
      '<p class="dcc-tour-mm-meta">' + [escapeHtml(d.label), escapeHtml(p.from === p.to ? p.from : p.from + '–' + p.to),
        items.length + (items.length === 1 ? ' shot' : ' shots') + (personOn() ? ' by ' + escapeHtml(personLabel()) : '')].filter(Boolean).join(' · ') + '</p>' +
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
      if (p.items.length && p.items.every(it => it.nonstat)) return;   // keepsake outliers (e.g. Belgium) stay out of the trip replay
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
        '<span>' + escapeHtml([dDate(m.day), time, plur(its.length, 'shot')].filter(Boolean).join(' · ')) + '</span></figcaption>';
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
    'Lokrum (Otok Lokrum)', 'Šipan', 'Suđurađ', 'Lopud', 'Elaphiti Islands', 'Orlando', 'London', 'The Matrix']);
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
        const its = placeItems(p).filter(it => !it.nonstat); if (!its.length) return;
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
      d.places.forEach(p => { const si = p.items.filter(it => !it.nonstat); if (si.length) seenPlaces.add(p.name); si.forEach(it => { if (it.kind === 'photo') ph++; else if (it.kind === 'video') vi++; else cp++; }); });
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
      d.places.forEach(p => p.items.forEach(it => { if (!it.nonstat && c[it.person] != null) c[it.person]++; })); return c; });
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
      if (it.nonstat) return;
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
      if (!it.nonstat && it.heading != null) { const b = ((Math.round(it.heading / (360 / bins)) % bins) + bins) % bins; counts[b]++; total++; }
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
    let satBackup = null;
    osmLayer({ maxZoom: 19, attribution: '&copy; OpenStreetMap' }, () => {
      if (!satBackup) satBackup = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagery &copy; Esri' }).addTo(map);
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
            '<span class="dcc-tour-place-meta">' + [escapeHtml(time) + spent.replace(/^ · /, escapeHtml(time) ? ' · ' : ''), plur(its.length, 'shot')].filter(Boolean).join(' · ') + cum + ' ' + mapsLink(p.lat, p.lng, 'dcc-tour-maplink meta') + '</span>' +
            histPlaceLink(p.name) +
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
        '<span class="dcc-tour-play"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span></span><span class="dcc-tour-badge">clip</span>' + cap(item) + extras + '</div>';
    }
    // self-hosted videos: show the poster frame, load the video on tap
    if (item.type === 'self_hosted') {
      const durb = '<span class="dcc-tour-badge">' + (item.dur ? fmtDur(item.dur) : 'video') + '</span>';
      const posterUrl = item.poster ? resolveUrl(item.poster) : '';
      if (!item.url)
        return posterUrl ? '<div class="dcc-tour-cell"><img loading="lazy" src="' + escapeAttr(posterUrl) + '" alt="video">' + durb + cap(item) + extras + '</div>' : '';
      return '<div class="dcc-tour-cell dcc-tour-play-cell"' + viAttr + '>' +
        (posterUrl ? '<img loading="lazy" src="' + escapeAttr(posterUrl) + '" alt="video">' : '') +
        '<span class="dcc-tour-play"><span class="dcc-pbtn">' + PLAY_GLYPH + '</span></span>' + durb + cap(item) + extras + '</div>';
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
    const ov = el('div', 'dcc-tour-vpo', '<span class="dcc-tour-vpo-play dcc-pbtn">' + PLAY_GLYPH + '</span>');
    if (url) ov.style.backgroundImage = 'url("' + String(url).replace(/["\\]/g, '') + '")';
    return ov;
  }
  function openViewer(idx) { if (viewerItems.length) { ensureViewerEl(); showViewer(idx); } }
  let vwPrevFocus = null;
  function showViewer(idx) {
    if (!viewerItems.length) return;
    const n = viewerItems.length;
    // a lone item: prev/next/swipe/arrow keys would just rebuild it (and stop a playing video)
    if (n === 1 && viewerIdx === 0) return;
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
      // do NOT autoplay: only buffer/stream once the user taps play (poster shows first)
      v.src = it.url; v.controls = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.setAttribute('controlslist', 'nodownload noplaybackrate'); v.disablePictureInPicture = true;
      v.preload = 'none'; v.className = 'dcc-tour-vplayer';
      stage.appendChild(v);
      // poster + play button; hides the moment playback actually begins
      const ov = posterOverlay(it.poster); stage.appendChild(ov);
      const hide = () => ov.classList.add('hide');
      v.addEventListener('playing', hide); v.addEventListener('play', hide);
      ov.addEventListener('click', () => { v.play().catch(() => {}); });
      dl.href = it.url;
    } else if (it.kind === 'clip' && it.id) {
      // show the poster + play button; the Drive player is only injected (and thus
      // only starts streaming) when the user taps play — no autoplay on open
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
      ov.addEventListener('click', load);
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
    const cap = el0.querySelector('.dcc-tour-lightbox-cap');
    cap.textContent = [it.place, it.date, it.time].filter(Boolean).join(' · ');
    // one link to the History tab for the spot this was taken
    if (it.place && histPlaceOk(it.place)) {
      const a = document.createElement('button');
      a.className = 'dcc-tour-lb-place dcc-tour-lb-hist'; a.type = 'button';
      a.innerHTML = svgIcon('history') + '<span>History of this place ›</span>';
      a.addEventListener('click', e => { e.stopPropagation(); const n = it.place; closeViewer(); openPlaceHistory(n); });
      cap.appendChild(a);
    }
    // map-opened items get a link to that place's full popup (all shots + Open day)
    if (it.mapRef) {
      const a = document.createElement('button');
      a.className = 'dcc-tour-lb-place'; a.type = 'button';
      a.textContent = '▦ See all ' + it.mapRef.count + (it.mapRef.count === 1 ? ' shot' : ' shots') + ' here';
      a.addEventListener('click', (e) => { e.stopPropagation(); const r = it.mapRef; closeViewer(); openMapSidebar(r.di, r.pi); });
      cap.appendChild(a);
    }
    el0.querySelector('.dcc-tour-lightbox-count').textContent = (viewerIdx + 1) + ' / ' + n;
    // nothing to step through with a single item: hide the arrows and the "1 / 1" counter
    el0.querySelectorAll('.dcc-tour-lightbox-nav, .dcc-tour-lightbox-count').forEach(x => { x.style.display = n === 1 ? 'none' : ''; });
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
