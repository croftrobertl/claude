/* Balkans History — interactive map of 2,500 years of borders, with Ragusa/Dubrovnik in focus.
   Vanilla JS, no dependencies. Usage:
     BalkansHistory.mount(el, { dataUrl: 'history/history-data.json' })   // or { data: obj }
   Options: start (era slug, e.g. '1453'), hash (true = read/write location.hash), onChange(frame, slug),
   fix (d → d, corrections applied to the data before it is drawn),
   pins ({ label, get() → [{ id, lat, lng }], card(id) → { name, note, acts: [[key, label]] }, act(id, key) }:
   the host's own places, shown close in when the viewer switches them on in Layers). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const ERAS = [['Greek', -500, -146, '#4d8fd6'], ['Roman', -146, 476, '#9b72c4'], ['Medieval', 476, 1453, '#5d8c3c'],
                ['Ottoman', 1453, 1878, '#3f9a78'], ['Modern', 1878, 2026, '#d8bf55']];
  const T0 = -500, T1 = 2026;
  const TICKS = [[-500, '500 BC'], [1, '1 AD'], [500, '500'], [1000, '1000'], [1500, '1500'], [1800, '1800'], [1900, '1900'], [2026, 'Today']];
  const slug = l => String(l).toLowerCase().replace(/\s+/g, '');
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wrapName = (n, w) => {
    if (n.length <= w) return esc(n);
    const words = n.split(' '); const lines = ['']; for (const word of words) {
      const cur = lines[lines.length - 1];
      if (cur && (cur + ' ' + word).length > w) lines.push(word); else lines[lines.length - 1] = cur ? cur + ' ' + word : word;
    }
    return lines.map(esc).join('<br>');
  };

  function mount(root, opts) {
    opts = opts || {};
    root.classList.add('bh-root');
    root.innerHTML = '<p class="bh-caption">Loading the map…</p>';
    // the map is built only once the data arrives, so return a handle that works
    // straight away: a show() made before then is applied as soon as it's ready
    let api = null, queued = null;
    const go = d => { if (opts.fix) d = opts.fix(d) || d; api = build(root, d, opts); if (queued != null) { api.show(queued); queued = null; } };
    if (opts.data) go(opts.data);
    else fetch(opts.dataUrl || 'history-data.json').then(r => r.json()).then(go).catch(err => {
      console.error('[balkans-history]', err);
      root.innerHTML = '<p class="bh-caption">The history map could not be loaded. Check that history-data.json sits next to history.js.</p>';
    });
    return {
      show: k => { if (api) api.show(k); else queued = k; },
      get frames() { return api ? api.frames : null; }
    };
  }

  const PLAY_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>';
  const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>';

  function build(root, D, opts) {
    const F = D.frames, N = F.length, VW = D.view.w, VH = D.view.h;
    // the walled city itself (Stradun, 42.6413° N 18.1083° E) in map units; the data's ragusaPt sits
    // about 1 km west — invisible at overview size, but the deep zoom puts today's streets underneath
    const RAG = [(18.1083 - 12) * 100, (48.4 - 42.6413) * 132.7];
    const RAG_SEL = '§ragusa', PIN_SEL = '§pin:';   // selection keys for Ragusa's own card and the host's places
    let cur = 0, playing = null, sel = null, scale = 1, tx = 0, ty = 0, libertasShown = null, pickTop = true;

    // ---------- markup ----------
    root.innerHTML = '';
    const layout = el('div', 'bh-layout');
    const main = el('div', 'bh-main');
    // the era's year and name sit on the map as a badge (with how far the last step jumped), so the
    // map can start near the top of the page; the era's description follows the timeline
    const head = el('header', 'bh-head');
    head.innerHTML = '<h2 class="bh-kicker">History · The Balkans, 500 BC to today</h2>' +
      '<div class="bh-yearline"><div class="bh-year" aria-live="polite"></div><div class="bh-title"></div></div>' +
      '<div class="bh-gap" aria-hidden="true"></div>';
    const caption = el('p', 'bh-caption');
    const plate = el('div', 'bh-plate');
    const vp = el('div', 'bh-viewport');
    vp.setAttribute('role', 'img');
    const tilesEl = el('div', 'bh-tiles');   // today's map (OpenStreetMap) fades in underneath once zoomed in
    const stage = el('div', 'bh-stage');
    const map = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const defs = svg('defs'); map.appendChild(defs);
    map.appendChild(svg('rect', { x: 0, y: 0, width: VW, height: VH, fill: 'var(--bh-sea)', class: 'bh-seafill' }));
    map.appendChild(svg('path', { d: D.land, fill: 'var(--bh-land)', class: 'bh-landfill' }));
    const layers = svg('g'); map.appendChild(layers);
    const chgG = svg('g'); map.appendChild(chgG);   // the "just changed hands" outlines, drawn fresh each step
    // Ragusa's own territory, from the much finer coast-map shapes, placed on the main map through
    // the coast map's box; shown once zoomed in (CSS: .bh-tiles-on .bh-ragterr)
    const ibx = D.inset.box;
    const ragTerr = svg('g', { class: 'bh-ragterr', transform: `translate(${ibx[0]} ${ibx[1]}) scale(${ibx[2] / D.inset.w} ${ibx[3] / D.inset.h})` });
    map.appendChild(ragTerr);
    const borders = svg('path', { d: D.borders, class: 'bh-borders' }); map.appendChild(borders);
    const trailsG = svg('g'); map.appendChild(trailsG);
    const ib = D.inset.box;
    map.appendChild(svg('rect', { x: ib[0], y: ib[1], width: ib[2], height: ib[3], class: 'bh-inbox' }));
    const ring = svg('circle', { cx: RAG[0], cy: RAG[1], r: 24, class: 'bh-ragusa-ring' }); map.appendChild(ring);
    const ragDot = svg('circle', { cx: RAG[0], cy: RAG[1], r: 10, class: 'bh-ragdot', fill: 'var(--bh-gold)', stroke: '#201f1d', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
    map.appendChild(ragDot);
    const pinsG = svg('g', { class: 'bh-pins' }); map.appendChild(pinsG);
    const labels = el('div', 'bh-labels');
    stage.append(map, labels); vp.append(tilesEl, stage);
    // the controls on the map: zoom, one button that goes to Ragusa (or back out to the whole map
    // once you're in close), and Layers, which holds everything else the map can show
    const zoomUI = el('div', 'bh-zoom');
    zoomUI.innerHTML = '<button type="button" class="bh-btn" data-z="in" aria-label="Zoom in">+</button>' +
      '<button type="button" class="bh-btn" data-z="out" aria-label="Zoom out">−</button>' +
      '<button type="button" class="bh-btn bh-focus" data-z="ragusa"></button>' +
      '<button type="button" class="bh-btn bh-layersbtn" data-z="layers" aria-expanded="false" aria-controls="bh-pop" aria-label="Map layers and key" title="Map layers and key">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></svg></button>';
    const FOCUS_IN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>';
    const focusBtn = zoomUI.querySelector('.bh-focus');
    const setFocus = out => {
      if (focusBtn.dataset.z === (out ? 'reset' : 'ragusa') && focusBtn.innerHTML) return;
      focusBtn.dataset.z = out ? 'reset' : 'ragusa';
      focusBtn.innerHTML = out ? '<span aria-hidden="true">⤢</span>' : FOCUS_IN;
      focusBtn.title = out ? 'Show the whole map' : 'Zoom in to Ragusa'; focusBtn.setAttribute('aria-label', focusBtn.title);
    };
    setFocus(false);
    const attrib = el('div', 'bh-attrib');
    // tap a region: its name and how long it lasts, on the map itself
    const info = el('div', 'bh-pick'); info.hidden = true; info.setAttribute('aria-live', 'polite');
    // Layers: street map or satellite (for close up), what to draw, and the key to the colours
    const pop = el('div', 'bh-pop'); pop.id = 'bh-pop'; pop.hidden = true;
    pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Map layers and key');
    plate.append(vp, head, zoomUI, attrib, info, pop);

    const tl = el('div', 'bh-timeline');
    const track = el('div', 'bh-track');
    // Each era gets an equal slot rather than a width in years: 35 eras in 2,500 years crowd the last
    // century into a few pixels otherwise. Ages are as wide as their eras; years are placed between.
    const at = i => (i + 0.5) / N * 100;
    const yearAt = t => {
      if (t <= F[0].tpos) return at(0);
      for (let i = 1; i < N; i++) if (F[i].tpos >= t) return at(i - 1) + (at(i) - at(i - 1)) * (t - F[i - 1].tpos) / ((F[i].tpos - F[i - 1].tpos) || 1);
      return at(N - 1);
    };
    ERAS.forEach(([name, a, b, c]) => {
      const i0 = F.findIndex(f => f.tpos >= a), i1 = F.length - 1 - [...F].reverse().findIndex(f => f.tpos < b);
      if (i0 < 0 || i1 < i0) return;
      const l = i0 / N * 100, w = (i1 + 1 - i0) / N * 100;
      const band = el('div', 'bh-era'); band.style.left = l + '%'; band.style.width = w + '%'; band.style.background = c;
      track.appendChild(band);
      const nm = el('div', 'bh-era-name', name.toUpperCase()); nm.style.left = (l + w / 2) + '%'; nm.dataset.from = a; track.appendChild(nm);
    });
    track.appendChild(el('div', 'bh-axis'));
    const prog = el('div', 'bh-progress'); track.appendChild(prog);
    const life = el('div', 'bh-life'); life.setAttribute('aria-hidden', 'true'); track.appendChild(life);   // a tapped region's lifetime
    const dots = F.map((f, i) => { const b = el('span', 'bh-dot'); b.style.left = at(i) + '%'; track.appendChild(b); return b; });
    const gap = head.querySelector('.bh-gap');
    const bubble = el('div', 'bh-bubble'); bubble.setAttribute('aria-hidden', 'true'); track.appendChild(bubble);
    track.setAttribute('role', 'slider'); track.tabIndex = 0; track.setAttribute('aria-label', 'Era');
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(N - 1));
    const ticks = el('div', 'bh-ticks'); TICKS.forEach(([t, l]) => { const s = el('span', t === 1 ? 'bh-t-narrow' : null, l); s.style.left = yearAt(t) + '%'; ticks.appendChild(s); });
    track.appendChild(ticks);
    const transport = el('div', 'bh-transport');
    transport.innerHTML =
      '<button type="button" class="bh-btn" data-a="prev" aria-label="Previous era">‹</button>' +
      '<button type="button" class="bh-btn bh-playbtn" data-a="play" aria-pressed="false" aria-label="Play through the eras" title="Play through the eras">' + PLAY_SVG + '</button>' +
      '<button type="button" class="bh-btn" data-a="next" aria-label="Next era">›</button>';
    const toggles = el('div', 'bh-toggles');
    toggles.innerHTML =
      '<label class="bh-toggle"><input type="checkbox" id="bh-t-caps" checked><span>Capitals</span></label>' +
      '<label class="bh-toggle"><input type="checkbox" id="bh-t-trails" checked><span>Earlier capitals</span></label>' +
      '<label class="bh-toggle"><input type="checkbox" id="bh-t-borders" checked><span>Today\'s borders</span></label>' +
      (opts.pins ? '<label class="bh-toggle bh-toggle-pins"><input type="checkbox" id="bh-t-pins"><span><i class="bh-pin-key" aria-hidden="true"></i>' + esc(opts.pins.label) + '</span></label>' : '');
    tl.append(track, transport, caption);
    main.append(plate, tl);

    const side = el('aside', 'bh-side');
    const rag = el('section', 'bh-ragusa');
    rag.innerHTML = '<div class="bh-ragusa-head"><span class="bh-ragusa-name">RAGUSA · DUBROVNIK</span><span class="bh-libertas"></span></div>' +
      '<div class="bh-ragusa-status"></div>';
    const IW = D.inset.w, IH = D.inset.h;
    const isvg = svg('svg', { viewBox: `0 0 ${IW} ${IH}`, role: 'img', 'aria-label': 'Map of the Dubrovnik coast' });
    const idefs = svg('defs'); isvg.appendChild(idefs);
    const landG = svg('g'); isvg.appendChild(landG);
    const ilands = D.inset.land.map(d => { const p = svg('path', { d, 'fill-opacity': .86, stroke: '#3c3730', 'stroke-opacity': .35, 'stroke-width': 1 }); landG.appendChild(p); return p; });
    const ragG = svg('g'); isvg.appendChild(ragG);
    const ilabG = svg('g'); isvg.appendChild(ilabG);
    const ragBody = el('p', 'bh-ragusa-body');
    rag.append(isvg, ragBody);
    const legend = el('div', 'bh-legend');
    legend.innerHTML =
      '<span>★ capital</span>' +
      '<span><i class="bh-key" style="background:repeating-linear-gradient(135deg,#d8bf55 0 4px,#3f9a78 4px 6px)"></i>vassal or occupied</span>' +
      '<span><i class="bh-key" style="background:#f2c230"></i>Ragusa</span>' +
      '<span><i class="bh-key" style="background:transparent;border:2px solid #d9a22b"></i>just changed hands</span>' +
      '<span>- - today\'s borders</span><span>· · · earlier capitals</span>' +
      (opts.pins ? '<span><i class="bh-pin-key" aria-hidden="true"></i>' + esc(opts.pins.label.toLowerCase()) + '</span>' : '');
    const sources = el('div', 'bh-sources');
    sources.innerHTML = 'Borders: <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a> ' +
      'and <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>, hand-corrected by era. ' +
      'Ragusa: <a href="https://en.wikipedia.org/wiki/Republic_of_Ragusa" target="_blank" rel="noopener">Republic of Ragusa</a>. ' +
      'Borders before 1900 are approximate.';
    side.append(rag);
    pop.innerHTML = '<div class="bh-pop-k">Close up, show</div>' +
      '<div class="bh-seg" role="group" aria-label="Map underneath"><button type="button" data-base="street" aria-pressed="true">Street map</button>' +
      '<button type="button" data-base="sat" aria-pressed="false">Satellite</button></div>' +
      '<div class="bh-pop-k">On the map</div>';
    pop.append(toggles);
    const keyK = el('div', 'bh-pop-k', 'Key'); pop.append(keyK, legend, sources);
    layout.append(main, side);
    root.appendChild(layout);

    // hatch patterns, one per colour
    const patterns = {};
    function hatch(color, host) {
      const key = (host === idefs ? 'i' : 'm') + color;
      if (patterns[key]) return patterns[key];
      const id = 'bh-h' + Object.keys(patterns).length + Math.random().toString(36).slice(2, 6);
      const size = host === idefs ? 46 : 18;
      const p = svg('pattern', { id, patternUnits: 'userSpaceOnUse', width: size, height: size, patternTransform: 'rotate(45)' });
      const bar = svg('rect', { x: 0, y: 0, width: size * .38, height: size, fill: color, 'fill-opacity': .75 });
      p.appendChild(bar);
      (host || defs).appendChild(p);
      if (host !== idefs) { mainPatterns.push([p, bar, size]); sizePattern(p, bar, size); }
      return (patterns[key] = `url(#${id})`);
    }

    // ---------- names across time (for the info card) ----------
    const spans = {};
    F.forEach((f, i) => f.feats.forEach(ft => { if (ft.n) (spans[ft.n] = spans[ft.n] || []).push(i); }));

    // ---------- rendering ----------
    const layerCache = new Map();
    function eraLayer(i) {
      if (layerCache.has(i)) return layerCache.get(i);
      const g = svg('g', { class: 'bh-layer' });
      F[i].feats.forEach((ft, k) => {
        g.appendChild(svg('path', { d: ft.d, fill: ft.c, class: 'bh-poly', 'data-k': k }));
        if (ft.h) g.appendChild(svg('path', { d: ft.d, fill: hatch(ft.h), 'pointer-events': 'none' }));
      });
      layerCache.set(i, g);
      return g;
    }
    function drawMap(i, animate) {
      const f = F[i];
      const g = eraLayer(i);
      chgG.innerHTML = '';
      if (animate && !reduced()) f.feats.forEach(ft => { if (ft.chg && ft.n) chgG.appendChild(svg('path', { d: ft.d, class: 'bh-chg' })); });
      // At most two layers at once: the one on screen and the one fading in over it. (Stacking a
      // layer per step while the slider was dragged piled up a dozen translucent maps, darkening
      // the land and, on phones, making today's map underneath drop out.)
      const old = [...layers.children].filter(o => o !== g);
      g.remove(); g.style.opacity = '';
      clearTimeout(drawMap._t);
      if (animate && !reduced()) {
        old.slice(0, -1).forEach(o => o.remove());
        const under = old[old.length - 1];
        g.style.opacity = 0; layers.appendChild(g);
        requestAnimationFrame(() => requestAnimationFrame(() => { g.style.opacity = 1; }));
        drawMap._t = setTimeout(() => { if (under) under.remove(); }, 600);
      } else { old.forEach(o => o.remove()); layers.appendChild(g); }
      markSel();
      // trails
      trailsG.innerHTML = '';
      f.trails.forEach(t => trailsG.appendChild(svg('polyline', { points: t.map(c => c[1] + ',' + c[2]).join(' '), class: 'bh-trail' })));
      const founded = f.ragusa.founded;
      ring.style.display = ragDot.style.display = founded ? '' : 'none';
    }

    function placeLabels(i) {
      const f = F[i];
      labels.innerHTML = '';
      const capNames = new Set(f.caps.map(c => c[0]));
      const lab = [];
      f.feats.filter(ft => ft.n && ft.a >= 0.3 && !capNames.has(ft.n)).sort((a, b) => b.a - a.a).forEach(ft => {
        const fs = Math.max(10, Math.min(15, 8 + 2.1 * Math.sqrt(ft.a)));
        const d = el('div', 'bh-lab' + (ft.t ? ' bh-tribal' : ''), wrapName(ft.n, fs < 12 ? 14 : 18));
        d.style.left = (ft.l[0] / VW * 100) + '%'; d.style.top = (ft.l[1] / VH * 100) + '%'; d.style.fontSize = fs + 'px';
        labels.appendChild(d); lab.push(d);
      });
      const nearCap = (x, y) => f.caps.some(c => Math.abs(c[1] - x) < 20 && Math.abs(c[2] - y) < 20);
      f.trails.forEach(t => t.slice(0, -1).forEach(c => {
        if (capNames.has(c[0]) || nearCap(c[1], c[2])) return;
        const d = el('div', 'bh-oldcap', esc(c[0])); d.style.left = (c[1] / VW * 100) + '%'; d.style.top = (c[2] / VH * 100) + '%';
        labels.appendChild(d);
      }));
      f.caps.forEach(([n, x, y]) => {
        const inside = x > 0 && x < VW && y > 0 && y < VH;
        const d = el('div', 'bh-cap' + (inside ? (x > VW * 0.84 ? ' bh-capl' : '') : ' bh-edge'));
        if (inside) { d.textContent = n; d.style.left = (x / VW * 100) + '%'; d.style.top = (y / VH * 100) + '%'; }
        else {
          const cx = Math.min(Math.max(x, 30), VW - 30), cy = Math.min(Math.max(y, 30), VH - 30);
          d.textContent = (x < 0 ? '← ' : '') + n + (x > VW ? ' →' : '') + (y > VH && x <= VW ? ' ↓' : '');
          d.style.top = (cy / VH * 100) + '%';
          if (x > VW) { d.style.right = '6px'; d.style.left = 'auto'; d.style.transform = 'translateY(-50%)'; }
          else { d.style.left = (cx / VW * 100) + '%'; }
        }
        labels.appendChild(d);
      });
      const rl = el('div', 'bh-raglab', f.ragusa.founded ? (f.year < 1918 ? 'RAGUSA' : 'DUBROVNIK') : (f.year > -230 ? 'Epidaurum' : 'Epidauros'));
      rl.style.left = (RAG[0] / VW * 100) + '%'; rl.style.top = (RAG[1] / VH * 100) + '%';
      labels.appendChild(rl);
      requestAnimationFrame(() => declutter(lab.concat([...labels.querySelectorAll('.bh-oldcap')]), [...labels.querySelectorAll('.bh-cap,.bh-raglab')]));
    }
    // greedy: bigger polities first; hide a label that would overlap one already shown or a capital
    function declutter(lab, fixed) {
      const boxes = fixed.map(e => e.getBoundingClientRect());
      const vr = vp.getBoundingClientRect();
      lab.forEach(d => {
        d.classList.remove('bh-off');
        const r = d.getBoundingClientRect();
        const out = r.left < vr.left + 2 || r.right > vr.right - 2 || r.top < vr.top || r.bottom > vr.bottom;
        const hit = boxes.some(b => !(r.right < b.left - 2 || r.left > b.right + 2 || r.bottom < b.top - 1 || r.top > b.bottom + 1));
        if (out || hit) d.classList.add('bh-off'); else boxes.push(r);
      });
    }

    function drawRagTerr(i) {
      const R = F[i].ragusa, P = D.inset.parts;
      ragTerr.innerHTML = '';
      const add = (d, cls) => ragTerr.appendChild(svg('path', { d, class: 'bh-rt ' + cls }));
      if (R.parts.length) add(R.parts.map(k => P[k]).join(''), 'bh-rt-rag' + (sel === RAG_SEL ? ' bh-sel' : ''));
      else if (R.former && D.inset.former) add(D.inset.former, 'bh-rt-former');
      if (R.ceded) add(P.neum + P.sutorina, 'bh-rt-ceded');
      if (R.siege) add(P.konavle, 'bh-rt-siege');
    }
    function drawInset(i) {
      const R = F[i].ragusa;
      R.icol.forEach((c, k) => ilands[k].setAttribute('fill', c));
      ragG.innerHTML = ''; ilabG.innerHTML = '';
      const P = D.inset.parts;
      if (R.parts.length) {
        const d = R.parts.map(k => P[k]).join('');
        ragG.appendChild(svg('path', { d, fill: '#f2c230', stroke: '#201f1d', 'stroke-width': 1.2 }));
      } else if (R.former) {
        ragG.appendChild(svg('path', { d: D.inset.former, fill: hatch('#b68235', idefs), stroke: '#b68235', 'stroke-width': 1.2 }));
      }
      if (R.ceded) {
        ragG.appendChild(svg('path', { d: P.neum + P.sutorina, fill: hatch('#b68235', idefs), stroke: '#7d5411', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }));
        const t = svg('text', { x: 850, y: 100, class: 'bh-ilabel', 'text-anchor': 'middle' }); t.textContent = 'Ottoman corridors 1699'; ilabG.appendChild(t);
      }
      if (R.siege) {
        ragG.appendChild(svg('path', { d: P.konavle, fill: hatch('#c0392b', idefs), stroke: '#c0392b', 'stroke-width': 1.4 }));
        ragG.appendChild(svg('circle', { cx: D.inset.ragusa[0], cy: D.inset.ragusa[1], r: 150, fill: 'none', stroke: '#c0392b', 'stroke-width': 3 }));
        const t = svg('text', { x: 1330, y: 905, class: 'bh-ilabel', 'text-anchor': 'middle' }); t.textContent = 'occupied 1991–92'; ilabG.appendChild(t);
      }
      if (R.bridge) {
        const [a, b] = D.inset.bridge;
        ragG.appendChild(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#201f1d', 'stroke-width': 11, 'stroke-linecap': 'round' }));
        ragG.appendChild(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#f2c230', 'stroke-width': 6, 'stroke-linecap': 'round' }));
        const t = svg('text', { x: a[0] - 40, y: a[1] + 20, class: 'bh-ilabel', 'text-anchor': 'end' }); t.textContent = 'Pelješac Bridge'; ilabG.appendChild(t);
      }
      const y = F[i].year;
      D.inset.places.forEach(([n, x, yy, side]) => {
        if (n === 'Sutorina' && !R.ceded) return;
        if (n === 'Neum' && y < 1399) return;
        if (R.siege && n === 'Konavle') return;
        const o = { r: [34, 20, 'start'], l: [-34, 20, 'end'], b: [0, 82, 'middle'], c: [0, 20, 'middle'] }[side] || [0, 20, 'middle'];
        if (side !== 'c') ilabG.appendChild(svg('circle', { cx: x, cy: yy, r: 13, fill: '#201f1d' }));
        const t = svg('text', { x: x + o[0], y: yy + o[1], class: 'bh-ilabel', 'text-anchor': o[2], 'font-style': side === 'c' ? 'italic' : 'normal' });
        t.textContent = n; ilabG.appendChild(t);
      });
      const [rx, ry] = R.founded ? D.inset.ragusa : D.inset.cavtat;
      ilabG.appendChild(svg('circle', { cx: rx, cy: ry, r: 40, fill: '#f2c230', stroke: '#201f1d', 'stroke-width': 2 }));
      const t = svg('text', { x: rx, y: ry - 70, class: 'bh-ilabel bh-big', 'text-anchor': 'middle' });
      t.textContent = R.founded ? (y < 1918 ? 'RAGUSA' : 'DUBROVNIK') : (y > -230 ? 'Epidaurum' : 'Epidauros');
      ilabG.appendChild(t);
      rag.querySelector('.bh-ragusa-status').textContent = R.status;
      ragBody.textContent = R.body;
    }

    function libertas(year) {
      const tgt = year < 1358 ? null : Math.min(year, 1808) - 1358;
      const node = rag.querySelector('.bh-libertas');
      const fmt = v => v == null ? '' : (year >= 1808 ? 'LIBERTAS · free 1358–1808' : `LIBERTAS · ${Math.round(v)} years free`);
      if (tgt == null || libertasShown == null || reduced()) { node.textContent = fmt(tgt); libertasShown = tgt; return; }
      const from = libertasShown, t0 = performance.now();
      const step = now => { const u = Math.min(1, (now - t0) / 700); node.textContent = fmt(from + (tgt - from) * u * (2 - u)); if (u < 1) requestAnimationFrame(step); };
      libertasShown = tgt; requestAnimationFrame(step);
    }

    // Ragusa's own card: its territory is drawn from the finer coast map, not as one of the era's
    // regions, so it gets a card of its own, in the same form, for the eras it held land
    const ragEras = F.map((f, i) => f.ragusa.founded && !f.ragusa.former && f.ragusa.parts.length ? i : -1).filter(i => i >= 0);
    function ragusaCard() {
      const f = F[cur], R = f.ragusa;
      if (!R.founded || R.former || !R.parts.length) return null;
      const free = f.year >= 1358;
      return { n: free ? 'Republic of Ragusa' : 'Ragusa', c: 'var(--bh-gold)', idx: ragEras,
        notes: [R.status + '.', R.body, `On ${ragEras.length} of ${N} maps, ${F[ragEras[0]].label} – ${F[ragEras[ragEras.length - 1]].label}.`] };
    }
    function renderInfo() {
      const f = F[cur];
      pinsG.querySelectorAll('.bh-pin').forEach(g => g.classList.toggle('bh-sel', sel === PIN_SEL + g.dataset.pin));
      if (pinsOn) sizePins();
      if (sel && sel.indexOf(PIN_SEL) === 0) {
        const id = sel.slice(PIN_SEL.length), pc = opts.pins && opts.pins.card(id);
        if (!pc) { sel = null; }
        else {
          info.hidden = false;
          info.classList.toggle('bh-at-bottom', pickTop);
          life.innerHTML = '';
          info.innerHTML = `<div class="bh-info-name"><i class="bh-swatch bh-pin-swatch"></i>${esc(pc.name)}</div>` +
            `<div class="bh-info-note">${esc(pc.note)}</div>` +
            (pc.acts && pc.acts.length ? '<div class="bh-info-acts">' + pc.acts.map(([k, l]) => `<button type="button" class="bh-info-act" data-pin-act="${esc(k)}">${esc(l)}</button>`).join('') + '</div>' : '') +
            '<button type="button" class="bh-pick-x" aria-label="Close">×</button>';
          return;
        }
      }
      if (sel === RAG_SEL) {
        const rc = ragusaCard();
        if (!rc) { sel = null; }
        else {
          info.hidden = false;
          info.classList.toggle('bh-at-bottom', pickTop);
          const runs = []; rc.idx.forEach(k => { const r = runs[runs.length - 1]; if (r && r[1] === k - 1) r[1] = k; else runs.push([k, k]); });
          life.innerHTML = runs.map(([a, b]) => `<i style="left:${a / N * 100}%;width:${(b + 1 - a) / N * 100}%;background:${rc.c}"></i>`).join('');
          info.innerHTML = `<div class="bh-info-name"><i class="bh-swatch" style="background:${rc.c}"></i>${esc(rc.n)}</div>` +
            `<div class="bh-info-note">${rc.notes.map(esc).join(' ')}</div>` +
            '<button type="button" class="bh-pick-x" aria-label="Close">×</button>';
          return;
        }
      }
      const ft = sel && f.feats.find(x => x.n === sel);
      if (!ft) { info.hidden = true; info.innerHTML = ''; life.innerHTML = ''; return; }
      info.hidden = false;
      info.classList.toggle('bh-at-bottom', pickTop);
      // the eras it appears in, lit up on the ribbon
      const runs = []; (spans[ft.n] || [cur]).forEach(k => { const r = runs[runs.length - 1]; if (r && r[1] === k - 1) r[1] = k; else runs.push([k, k]); });
      life.innerHTML = runs.map(([a, b]) => `<i style="left:${a / N * 100}%;width:${(b + 1 - a) / N * 100}%;background:${ft.c}"></i>`).join('');
      const idx = spans[ft.n] || [cur];
      const first = F[idx[0]].label, last = F[idx[idx.length - 1]].label;
      const notes = [];
      if (ft.t) notes.push('Peoples without a recorded state on this map.');
      if (ft.h) notes.push('A vassal state or occupied.');
      if (ft.chg && cur > 0) notes.push('Just changed hands.');
      notes.push(idx.length === 1 ? `Only on the ${first} map.` : `On ${idx.length} of ${N} maps, ${first} – ${last}.`);
      info.innerHTML = `<div class="bh-info-name"><i class="bh-swatch" style="background:${ft.c}"></i>${esc(ft.n)}</div>` +
        `<div class="bh-info-note">${notes.map(esc).join(' ')}</div>` +
        '<button type="button" class="bh-pick-x" aria-label="Close">×</button>';
    }

    // Two speeds. While a finger drags the ribbon only the map, the year and the ribbon change
    // (quick); the labels, the coast map, the panels below and the page address follow once the
    // finger pauses or lifts (settle). Each step used to redraw all of it, 100–190 ms on a phone.
    let settled = 0, settleT = 0, scrub = null;
    function show(i, animate = true, quick = false) {
      i = Math.max(0, Math.min(N - 1, i));
      const prev = cur; cur = i;
      const f = F[i];
      head.querySelector('.bh-year').textContent = f.label;
      head.querySelector('.bh-title').textContent = f.title;
      caption.textContent = f.caption;
      drawMap(i, animate && prev !== i);
      dots.forEach((d, k) => { d.classList.toggle('bh-past', k < i); d.classList.toggle('bh-cur', k === i); });
      prog.style.width = at(i) + '%';
      track.setAttribute('aria-valuenow', String(i)); track.setAttribute('aria-valuetext', f.label + ': ' + f.title);
      if (bubble.classList.contains('bh-show')) placeBubble();
      clearTimeout(settleT);
      if (quick) { root.classList.add('bh-quick'); settleT = setTimeout(settle, 160); return; }
      settle();
    }
    function settle() {
      clearTimeout(settleT);
      root.classList.remove('bh-quick');
      const f = F[cur];
      vp.setAttribute('aria-label', `Map of the Balkans, ${f.label}: ${f.title}`);
      placeLabels(cur);
      drawInset(cur);
      drawRagTerr(cur);
      libertas(f.tpos);
      // how far that step (or the whole drag) went, on the badge
      if (settled !== cur && !scrub) {
        const g = Math.round(Math.abs(f.tpos - F[settled].tpos));
        gap.textContent = (f.tpos >= F[settled].tpos ? '+' : '−') + (g < 1 ? '' : g) + (g === 1 ? ' year' : g < 1 ? 'same year' : ' years');
        gap.classList.add('bh-show');
        clearTimeout(gap._t); gap._t = setTimeout(() => gap.classList.remove('bh-show'), 1800);
      }
      if (!scrub) settled = cur;
      renderInfo();
      if (opts.hash !== false) { try { history.replaceState(null, '', '#' + slug(f.label)); } catch (e) { /* sandboxed or rate-limited */ } }
      if (opts.onChange) opts.onChange(f, slug(f.label));
    }
    // the bubble over the handle names the era; it stays inside the ribbon at both ends, its arrow
    // still pointing at the handle
    function placeBubble() {
      bubble.textContent = F[cur].label;
      const w = track.clientWidth, x = at(cur) / 100 * w, bw = bubble.offsetWidth;
      const cx = Math.max(bw / 2, Math.min(w - bw / 2, x));
      bubble.style.left = cx + 'px'; bubble.style.setProperty('--ax', (x - cx) + 'px');
    }

    // ---------- playback ----------
    const playBtn = transport.querySelector('[data-a="play"]');
    const playLabel = on => { playBtn.innerHTML = on ? PAUSE_SVG : PLAY_SVG; playBtn.title = on ? 'Pause' : 'Play through the eras'; playBtn.setAttribute('aria-label', playBtn.title); };
    function stop() { if (playing) { clearInterval(playing); playing = null; playLabel(false); playBtn.setAttribute('aria-pressed', 'false'); } }
    function play() {
      if (cur === N - 1) show(0);
      playLabel(true); playBtn.setAttribute('aria-pressed', 'true');
      playing = setInterval(() => { if (cur >= N - 1) stop(); else show(cur + 1); }, 4200);
    }
    transport.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'play') { playing ? stop() : play(); return; }
      stop(); show(cur + (a.dataset.a === 'next' ? 1 : -1));
    });
    // The ribbon is the slider. A tap picks the nearest era (an age's name, the start of that
    // age); a sideways drag scrubs through them, swapping eras instantly with a bubble naming the
    // one under your finger; an up-and-down drag is left to scroll the page.
    const nearest = x => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(N - 1, Math.floor((x - r.left) / r.width * N))); };
    const ageStart = from => F.findIndex(f => f.tpos >= from);

    const bubbleOn = on => { bubble.classList.toggle('bh-show', on); track.classList.toggle('bh-scrubbing', on); if (on) placeBubble(); };
    track.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      scrub = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, name: e.target.closest('.bh-era-name') };
      // a mouse can't mean "scroll", so it scrubs straight away
      if (e.pointerType === 'mouse') { scrub.on = true; stop(); track.setPointerCapture(e.pointerId); bubbleOn(true); if (!scrub.name) show(nearest(e.clientX), false, true); }
    });
    track.addEventListener('pointermove', e => {
      if (!scrub || e.pointerId !== scrub.id) return;
      if (!scrub.on) {
        const dx = Math.abs(e.clientX - scrub.x), dy = Math.abs(e.clientY - scrub.y);
        if (dx < 6 || dx < dy) return;
        scrub.on = true; stop(); try { track.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
        bubbleOn(true);
      }
      scrub.moved = true;
      const k = nearest(e.clientX); if (k !== cur) show(k, false, true);
    });
    const scrubEnd = e => {
      if (!scrub || e.pointerId !== scrub.id) return;
      const s0 = scrub; scrub = null;
      bubbleOn(false);
      if (e.type === 'pointercancel' || s0.moved) { settle(); return; }
      stop();
      const k = s0.name ? ageStart(+s0.name.dataset.from) : nearest(e.clientX);
      if (k !== cur) show(k); else settle();
    };
    track.addEventListener('pointerup', scrubEnd); track.addEventListener('pointercancel', scrubEnd);
    track.addEventListener('keydown', e => {
      const ages = ERAS.map(a => ageStart(a[1]));
      let k = null;
      if (e.key === 'Home') k = 0; else if (e.key === 'End') k = N - 1;
      else if (e.key === 'PageDown') k = ages.find(a => a > cur);
      else if (e.key === 'PageUp') k = [...ages].reverse().find(a => a < cur);
      if (k == null) return;
      e.preventDefault(); stop(); show(k);
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !pop.hidden) { layersOpen(false); zoomUI.querySelector('[data-z=layers]').focus(); return; }
      if (e.target.closest('.bh-pop')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' && e.target === track) { stop(); show(cur + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' && e.target === track) { stop(); show(cur - 1); e.preventDefault(); }
    });
    info.addEventListener('click', e => {
      if (e.target.closest('.bh-pick-x')) { sel = null; markSel(); renderInfo(); return; }
      const a = e.target.closest('[data-pin-act]');
      if (a && sel && sel.indexOf(PIN_SEL) === 0) opts.pins.act(sel.slice(PIN_SEL.length), a.dataset.pinAct);
    });
    function markSel() {
      ragTerr.querySelectorAll('.bh-rt-rag').forEach(p => p.classList.toggle('bh-sel', sel === RAG_SEL));
      layers.lastChild && layers.lastChild.querySelectorAll('.bh-poly').forEach(p => {
        const f2 = F[cur].feats[+p.dataset.k]; p.classList.toggle('bh-sel', !!(sel && f2.n === sel));
      });
    }
    // Layers opens over the map; a tap anywhere else closes it
    function layersOpen(on) {
      pop.hidden = !on;
      zoomUI.querySelector('[data-z=layers]').setAttribute('aria-expanded', on ? 'true' : 'false');
      zoomUI.querySelector('[data-z=layers]').classList.toggle('bh-on', on);
    }
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !e.target.closest('.bh-pop, [data-z=layers]')) layersOpen(false); });
    pop.addEventListener('click', e => { const b = e.target.closest('[data-base]'); if (b) setSat(b.dataset.base === 'sat'); });
    toggles.addEventListener('change', () => {
      root.classList.toggle('bh-hide-caps', !toggles.querySelector('#bh-t-caps').checked);
      root.classList.toggle('bh-hide-trails', !toggles.querySelector('#bh-t-trails').checked);
      root.classList.toggle('bh-hide-borders', !toggles.querySelector('#bh-t-borders').checked);
      const pt = toggles.querySelector('#bh-t-pins');
      if (pt && pt.checked !== pinsOn) setPins(pt.checked, true);
    });

    // ---------- the host's own places (here: where the trip's photos, videos and clips were taken) ----------
    // Off unless switched on in Layers; the choice is remembered on this device. They show once the map is
    // zoomed in close enough for today's streets, and switching them on from far out flies there.
    let pinsOn = false, pinList = null;
    const pinXY = (lat, lng) => [(lng - 12) * 100, (48.4 - lat) * 132.7];   // the map's projection (see tiles below)
    function drawPins() {
      pinsG.innerHTML = '';
      if (!pinsOn) return;
      if (!pinList) pinList = (opts.pins.get() || []).filter(q => q.lat > 38 && q.lat < 47 && q.lng > 12 && q.lng < 30);
      pinList.forEach(q => {
        const [x, y] = pinXY(q.lat, q.lng);
        const g = svg('g', { class: 'bh-pin' + (sel === PIN_SEL + q.id ? ' bh-sel' : ''), 'data-pin': q.id });
        g.appendChild(svg('circle', { cx: x, cy: y, class: 'bh-pin-hit' }));
        g.appendChild(svg('circle', { cx: x, cy: y, class: 'bh-pin-dot' }));
        pinsG.appendChild(g);
      });
      sizePins();
    }
    function sizePins() {
      pinsG.querySelectorAll('.bh-pin-hit').forEach(c => c.setAttribute('r', (17 / scale).toFixed(6)));
      pinsG.querySelectorAll('.bh-pin-dot').forEach(c => c.setAttribute('r', (c.parentNode.classList.contains('bh-sel') ? 9 : 7) / scale));
    }
    function setPins(on, fromToggle) {
      pinsOn = !!on;
      const pt = toggles.querySelector('#bh-t-pins'); if (pt) pt.checked = pinsOn;
      root.classList.toggle('bh-pins-on', pinsOn);
      if (!pinsOn && sel && sel.indexOf(PIN_SEL) === 0) { sel = null; renderInfo(); }
      drawPins();
      if (fromToggle) {
        try { localStorage.setItem('bh-pins', pinsOn ? '1' : '0'); } catch (e) { /* storage blocked */ }
        if (pinsOn && scale < TILE_MIN) { layersOpen(false); zoomTo(RAG[0], RAG[1], Math.min(40, maxScale())); }
      }
    }

    // ---------- pan / zoom / tap ----------
    // Zoom redraws the SVG through its viewBox, so shapes and lines stay sharp at any zoom (scaling a
    // picture of the map made it blurry); labels sit in a box the size of the zoomed map, so their
    // text is never stretched either. Markers and hatching keep their on-screen size.
    const MAX_SCALE = 6000;   // street level: about 200 m across on a phone
    const mainPatterns = [];
    function sizePattern(p, bar, size) {
      const z = size / scale;
      p.setAttribute('width', z); p.setAttribute('height', z); bar.setAttribute('width', z * .38); bar.setAttribute('height', z);
    }
    function apply() {
      const w = vp.clientWidth, h = vp.clientHeight;
      if (!w || !h) return;
      tx = Math.min(0, Math.max(w - w * scale, tx)); ty = Math.min(0, Math.max(h - h * scale, ty));
      map.setAttribute('viewBox', (-tx / (w * scale) * VW).toFixed(6) + ' ' + (-ty / (h * scale) * VH).toFixed(6) + ' ' +
        (VW / scale).toFixed(6) + ' ' + (VH / scale).toFixed(6));
      labels.style.width = (w * scale) + 'px'; labels.style.height = (h * scale) + 'px';
      labels.style.transform = `translate(${tx}px, ${ty}px)`;
      ring.setAttribute('r', (24 / scale).toFixed(6)); ragDot.setAttribute('r', (10 / scale).toFixed(6));
      if (pinsOn) sizePins();
      root.classList.toggle('bh-close', scale >= TILE_MIN);
      mainPatterns.forEach(([p, bar, size]) => sizePattern(p, bar, size));
      // un-zoomed, a vertical finger drag scrolls the page (touch-action: pan-y); zoomed, every drag pans the map
      vp.classList.toggle('bh-zoomed', scale > 1);
      setFocus(scale > 3);
      // deep in, dashed lines run to millions of dashes and stall every frame: draw them solid instead
      root.classList.toggle('bh-deep', scale > 8);
      tiles(w, h);
      clearTimeout(apply._t);
      apply._t = setTimeout(() => declutter([...labels.querySelectorAll('.bh-lab,.bh-oldcap')], [...labels.querySelectorAll('.bh-cap,.bh-raglab')]), 120);
    }
    // without today's map underneath (offline), the era shapes are too coarse to be worth more than 40×
    const maxScale = () => (tileFails >= 8 || navigator.onLine === false) ? 40 : MAX_SCALE;
    function zoomAt(f, cx, cy) {
      const ns = Math.max(1, Math.min(maxScale(), scale * f)); const k = ns / scale;
      tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; scale = ns; apply();
    }
    // glide so that map point (X, Y) sits in the middle at zoom s
    function zoomTo(X, Y, s) {
      const w = vp.clientWidth, h = vp.clientHeight, s0 = scale;
      const cx0 = (w / 2 - tx) / (w * scale) * VW, cy0 = (h / 2 - ty) / (h * scale) * VH;
      const steps = reduced() ? 1 : 32; let i = 0;
      const step = () => {
        i++;
        const u = i / steps, e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        scale = Math.exp(Math.log(s0) + (Math.log(s) - Math.log(s0)) * e);
        const cx = cx0 + (X - cx0) * e, cy = cy0 + (Y - cy0) * e;
        tx = w / 2 - cx / VW * w * scale; ty = h / 2 - cy / VH * h * scale;
        apply();
        if (i < steps) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    zoomUI.addEventListener('click', e => {
      const b = e.target.closest('[data-z]'); if (!b) return;
      const w = vp.clientWidth / 2, h = vp.clientHeight / 2, z = b.dataset.z;
      if (z === 'layers') { layersOpen(pop.hidden); return; }
      if (z === 'reset') zoomTo(VW / 2, VH / 2, 1);
      else if (z === 'ragusa') zoomTo(RAG[0], RAG[1], Math.min(900, maxScale()));   // the Old Town and Lokrum
      else zoomAt(z === 'in' ? 2 : 1 / 2, w, h);
    });
    vp.addEventListener('dblclick', e => { const r = vp.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); });

    // ---------- today's map underneath, once zoomed in ----------
    // The era shapes are drawn for the whole Balkans and are coarse up close, so past a modest zoom
    // OpenStreetMap tiles fade in beneath them (the shapes turn translucent). Each tile is placed by
    // its corners through the map's projection, x = (lon − 12)·100, y = (48.4 − lat)·132.7
    // (source/export_data.py) — within a tile the difference from web-map projection is negligible.
    const TILE_MIN = 2.5, tileImgs = new Map();
    let tileWant = new Set(), tileT = 0, tileFails = 0, tileGen = 0;
    // street map (OpenStreetMap) or satellite (Esri World Imagery); the choice is remembered on this device
    let sat = false;
    try { sat = localStorage.getItem('bh-sat') === '1'; } catch (e) { /* storage blocked */ }
    function setSat(on, auto) {
      sat = on;
      root.classList.toggle('bh-sat', on);
      pop.querySelectorAll('[data-base]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.base === 'sat') === on)));
      attrib.innerHTML = (on ? 'Imagery © Esri, Maxar, Earthstar Geographics' : 'Today’s map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>') + ' · old borders approximate';
      tileImgs.forEach(dropTile); tileImgs.clear(); tileWant = new Set(); tileFails = 0; tileGen++;
      // a switch made because street tiles failed isn't remembered as the viewer's choice
      if (!auto) { try { localStorage.setItem('bh-sat', on ? '1' : '0'); } catch (e) { /* storage blocked */ } }
      loadTiles();
    }
    const tLon = (x, n) => x / n * 360 - 180;
    const tLat = (y, n) => { const k = Math.PI - 2 * Math.PI * y / n; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))); };
    function placeTile(im, w, h) {
      const [z, x, y] = im._k, n = 2 ** z, kx = w * scale / VW, ky = h * scale / VH;
      const X0 = (tLon(x, n) - 12) * 100, X1 = (tLon(x + 1, n) - 12) * 100;
      const Y0 = (48.4 - tLat(y, n)) * 132.7, Y1 = (48.4 - tLat(y + 1, n)) * 132.7;
      im.style.left = (tx + X0 * kx) + 'px'; im.style.top = (ty + Y0 * ky) + 'px';
      im.style.width = ((X1 - X0) * kx + 0.6) + 'px'; im.style.height = ((Y1 - Y0) * ky + 0.6) + 'px';
    }
    function tiles(w, h) {
      const on = scale >= TILE_MIN && tileFails < 8 && navigator.onLine !== false;
      root.classList.toggle('bh-tiles-on', on);
      if (!on) return;
      tileImgs.forEach(im => placeTile(im, w, h));            // follow the gesture straight away
      clearTimeout(tileT); tileT = setTimeout(() => loadTiles(), 140);   // fetch the right set once it pauses
    }
    function loadTiles() {
      const w = vp.clientWidth, h = vp.clientHeight;
      if (!w || scale < TILE_MIN) return;
      const x0 = -tx / (w * scale) * VW, x1 = x0 + VW / scale, y0 = -ty / (h * scale) * VH, y1 = y0 + VH / scale;
      const lonW = 12 + x0 / 100, lonE = 12 + x1 / 100, latN = 48.4 - y0 / 132.7, latS = 48.4 - y1 / 132.7;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const z = Math.max(4, Math.min(sat ? 18 : 19, Math.ceil(Math.log2(360 * w * dpr / (256 * (lonE - lonW))))));
      const n = 2 ** z, col = lon => Math.floor((lon + 180) / 360 * n);
      const row = lat => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
      const c0 = col(lonW), c1 = col(lonE), r0 = row(latN), r1 = row(latS);
      if ((c1 - c0 + 1) * (r1 - r0 + 1) > 140) return;
      const want = new Set();
      for (let x = c0; x <= c1; x++) for (let y = r0; y <= r1; y++) {
        const key = z + '/' + x + '/' + y;
        want.add(key);
        if (tileImgs.has(key)) continue;
        // satellite: the imagery plus Esri's road and place-name layers on top (as on the Map tab)
        const pic = new Image(), im = sat ? document.createElement('div') : pic;
        pic.alt = ''; pic.decoding = 'async'; pic.draggable = false;
        im._k = [z, x, y]; im.className = 'bh-tile';
        if (sat) {
          im.appendChild(pic);
          ['Reference/World_Transportation', 'Reference/World_Boundaries_and_Places'].forEach(l => {
            const r = new Image(); r.alt = ''; r.decoding = 'async'; r.draggable = false; r.onerror = () => r.remove();
            r.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/' + l + '/MapServer/tile/' + z + '/' + y + '/' + x;
            im.appendChild(r);
          });
        }
        im._done = false;
        const gen = tileGen;   // a tile from before a street/satellite switch no longer counts
        pic.onload = () => { im._done = true; im.classList.add('bh-in'); if (gen === tileGen) tileFails = 0; sweep(); };
        pic.onerror = () => {
          im._done = true;
          dropTile(im);
          const current = tileImgs.get(key) === im;   // not a newer tile for the same spot, nor one already swept away
          if (current) tileImgs.delete(key);
          if (!current || gen !== tileGen) return;
          tileFails++;
          if (tileFails >= 8 && !sat) { setSat(true, true); return; }   // street tiles refused: satellite comes from elsewhere
          if (tileFails >= 8) {   // no map underneath after all (offline or blocked): back out to where the era shapes still read
            root.classList.remove('bh-tiles-on');
            if (scale > 40) zoomAt(40 / scale, vp.clientWidth / 2, vp.clientHeight / 2);
          }
          sweep();
        };
        if (sat) pic.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
        else osmTile(key).then(u => { if (im.isConnected) { im._url = u; pic.src = u; } else URL.revokeObjectURL(u); }, () => pic.onerror());
        placeTile(im, w, h); tilesEl.appendChild(im); tileImgs.set(key, im);
      }
      tileWant = want;
      sweep();
    }
    // OpenStreetMap tiles are fetched rather than set as an <img> src, so a refusal (its "Access
    // blocked" picture comes back as an ordinary image with a 403) counts as a failure. The site
    // sends no Referer, and OSM refuses tile requests without one, so these send the site's origin.
    // A refusal is retried once past the browser cache, in case an old blocked tile was saved.
    function osmTile(key) {
      const url = 'https://tile.openstreetmap.org/' + key + '.png';
      const get = cache => fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin', cache })
        .then(r => r.ok ? r.blob() : Promise.reject(r.status));
      return get('default').catch(st => st === 403 ? get('reload') : Promise.reject(st)).then(b => URL.createObjectURL(b));
    }
    // back online after the map gave up on tiles: try again (street map first, unless satellite was chosen)
    window.addEventListener('online', () => {
      if (tileFails < 8) return;
      let want = false; try { want = localStorage.getItem('bh-sat') === '1'; } catch (e) { /* storage blocked */ }
      if (want !== sat) setSat(want, true); else { tileFails = 0; tileGen++; }
      tiles(vp.clientWidth, vp.clientHeight);
    });
    function dropTile(im) {
      im.remove();
      if (im._url) { URL.revokeObjectURL(im._url); im._url = null; }
    }
    // tiles from the previous view stay under the new ones until those have loaded
    function sweep() {
      const ready = [...tileWant].every(k => { const im = tileImgs.get(k); return !im || im._done; });
      tileImgs.forEach((im, k) => {
        if (tileWant.has(k)) { im.style.zIndex = 1; return; }
        if (ready || tileImgs.size > 200) { dropTile(im); tileImgs.delete(k); } else im.style.zIndex = 0;
      });
    }
    vp.addEventListener('wheel', e => {
      e.preventDefault(); const r = vp.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    const pts = new Map(); let moved = 0, pinch0 = null;
    // with pan-y the browser may claim a two-finger gesture as a page scroll; keep pinches for the map
    vp.addEventListener('touchmove', e => { if (e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });
    vp.addEventListener('pointerdown', e => {
      if (e.target.closest('.bh-zoom')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale }; }
    });
    window.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1 && scale > 1) { tx += dx; ty += dy; vp.classList.add('bh-dragging'); apply(); }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch0) {
        const [a, b] = [...pts.values()]; const r = vp.getBoundingClientRect();
        const target = pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d;
        zoomAt(target / scale, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId); vp.classList.remove('bh-dragging');
      if (pts.size < 2) pinch0 = null;
      if (moved < 8 && e.type === 'pointerup') {
        const vr = vp.getBoundingClientRect(); pickTop = e.clientY < vr.top + vr.height / 2;
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const k = hit && hit.closest && hit.closest('.bh-poly') ? +hit.closest('.bh-poly').dataset.k : null;
        const ft = k != null ? F[cur].feats[k] : null;
        // Ragusa's own land (close in) or its gold dot (further out) opens Ragusa's card
        const onRag = hit && hit.closest && hit.closest('.bh-rt-rag, .bh-ragdot, .bh-ragusa-ring') && ragusaCard();
        const pin = hit && hit.closest && hit.closest('.bh-pin');
        sel = pin ? (sel === PIN_SEL + pin.dataset.pin ? null : PIN_SEL + pin.dataset.pin)
          : onRag ? (sel === RAG_SEL ? null : RAG_SEL) : ft && ft.n ? (sel === ft.n ? null : ft.n) : null;
        markSel();
        renderInfo();
      }
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => { apply(); });

    // ---------- start ----------
    let start = 0;
    const want = opts.start || (opts.hash !== false ? (location.hash || '').slice(1) : '');
    if (want) { const k = F.findIndex(f => slug(f.label) === slug(want)); if (k >= 0) start = k; }
    setSat(sat);
    show(start, false);
    settled = cur;
    if (opts.pins) { let on = false; try { on = localStorage.getItem('bh-pins') === '1'; } catch (e) { /* storage blocked */ } if (on) setPins(true); }
    let nudged = false; try { nudged = localStorage.getItem('bh-nudged') === '1'; } catch (e) { nudged = true; }
    if (!nudged && !reduced() && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        if (!es.some(x => x.isIntersecting)) return;
        io.disconnect();
        setTimeout(() => {
          const d = dots[cur]; if (!d || scrub) return;
          d.style.setProperty('--nudge', Math.min(track.clientWidth / N * 1.6, 24) + 'px');
          d.classList.add('bh-nudge'); setTimeout(() => d.classList.remove('bh-nudge'), 1700);
          try { localStorage.setItem('bh-nudged', '1'); } catch (e) { /* storage blocked */ }
        }, 900);
      }, { threshold: 0.9 });
      io.observe(track);
    }
    root.tabIndex = -1;
    return { show: k => show(typeof k === 'number' ? k : F.findIndex(f => slug(f.label) === slug(k))), frames: F };
  }

  window.BalkansHistory = { mount };
})();
