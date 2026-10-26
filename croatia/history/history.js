/* Balkans History — interactive map of 2,500 years of borders, with Ragusa/Dubrovnik in focus.
   Vanilla JS, no dependencies. Usage:
     BalkansHistory.mount(el, { dataUrl: 'history/history-data.json' })   // or { data: obj }
   Options: start (era slug, e.g. '1453'), hash (true = read/write location.hash), onChange(frame, slug). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const ERAS = [['Greek', -500, -146, '#4d8fd6'], ['Roman', -146, 476, '#9b72c4'], ['Medieval', 476, 1453, '#5d8c3c'],
                ['Ottoman', 1453, 1878, '#3f9a78'], ['Modern', 1878, 2026, '#d8bf55']];
  const T0 = -500, T1 = 2026;
  const TICKS = [[-500, '500 BC'], [1, '1 AD'], [500, '500'], [1000, '1000'], [1500, '1500'], [1800, '1800'], [2026, 'Today']];
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
    const go = d => { api = build(root, d, opts); if (queued != null) { api.show(queued); queued = null; } };
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
    let cur = 0, playing = null, sel = null, scale = 1, tx = 0, ty = 0, libertasShown = null;

    // ---------- markup ----------
    root.innerHTML = '';
    const layout = el('div', 'bh-layout');
    const main = el('div', 'bh-main');
    const head = el('header', 'bh-head');
    head.innerHTML = '<div class="bh-kicker">History · The Balkans, 500 BC to today</div>' +
      '<div class="bh-yearline"><div class="bh-year" aria-live="polite"></div><div class="bh-title"></div></div>' +
      '<p class="bh-caption"></p>';
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
    const ragDot = svg('circle', { cx: RAG[0], cy: RAG[1], r: 10, fill: 'var(--bh-gold)', stroke: '#201f1d', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
    map.appendChild(ragDot);
    const labels = el('div', 'bh-labels');
    stage.append(map, labels); vp.append(tilesEl, stage);
    const zoomUI = el('div', 'bh-zoom');
    zoomUI.innerHTML = '<button type="button" class="bh-btn" data-z="in" aria-label="Zoom in">+</button>' +
      '<button type="button" class="bh-btn" data-z="out" aria-label="Zoom out">−</button>' +
      '<button type="button" class="bh-btn" data-z="ragusa" aria-label="Zoom in to Ragusa" title="Zoom in to Ragusa">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg></button>' +
      '<button type="button" class="bh-btn" data-z="reset" aria-label="Show the whole map">⤢</button>' +
      '<button type="button" class="bh-btn bh-satbtn" data-z="sat" aria-pressed="false" aria-label="Satellite view" title="Satellite view">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></svg></button>';
    const attrib = el('div', 'bh-attrib');
    plate.append(vp, zoomUI, attrib);

    const tl = el('div', 'bh-timeline');
    const track = el('div', 'bh-track');
    const pct = t => ((t - T0) / (T1 - T0) * 100);
    ERAS.forEach(([name, a, b, c]) => {
      const band = el('div', 'bh-era'); band.style.left = pct(a) + '%'; band.style.width = (pct(b) - pct(a)) + '%'; band.style.background = c;
      track.appendChild(band);
      if (pct(b) - pct(a) > 9) { const nm = el('div', 'bh-era-name', name.toUpperCase()); nm.style.left = ((pct(a) + pct(b)) / 2) + '%'; track.appendChild(nm); }
    });
    track.appendChild(el('div', 'bh-axis'));
    const prog = el('div', 'bh-progress'); track.appendChild(prog);
    const dots = F.map((f, i) => {
      const b = el('button', 'bh-dot'); b.type = 'button'; b.style.left = pct(f.tpos) + '%';
      b.setAttribute('aria-label', f.label + ': ' + f.title); b.title = f.label + ' · ' + f.title;
      b.addEventListener('click', () => { stop(); show(i); });
      track.appendChild(b); return b;
    });
    const gap = el('div', 'bh-gap'); track.appendChild(gap);
    const ticks = el('div', 'bh-ticks'); TICKS.forEach(([t, l]) => { const s = el('span', t === 1800 ? 'bh-t-narrow' : null, l); s.style.left = pct(t) + '%'; ticks.appendChild(s); });
    track.appendChild(ticks);
    const transport = el('div', 'bh-transport');
    transport.innerHTML =
      '<button type="button" class="bh-btn" data-a="prev" aria-label="Previous era">‹</button>' +
      '<button type="button" class="bh-btn bh-playbtn" data-a="play" aria-pressed="false" aria-label="Play through the eras" title="Play through the eras">' + PLAY_SVG + '</button>' +
      '<button type="button" class="bh-btn" data-a="next" aria-label="Next era">›</button>' +
      `<input class="bh-range" id="bh-range" type="range" min="0" max="${N - 1}" step="1" value="0" aria-label="Era">`;
    const toggles = el('div', 'bh-toggles');
    toggles.innerHTML =
      '<label class="bh-toggle"><input type="checkbox" id="bh-t-caps" checked><span>Capitals</span></label>' +
      '<label class="bh-toggle"><input type="checkbox" id="bh-t-trails" checked><span>Earlier capitals</span></label>' +
      '<label class="bh-toggle"><input type="checkbox" id="bh-t-borders" checked><span>Today\'s borders</span></label>';
    tl.append(track, transport, toggles);
    main.append(head, plate, tl);

    const side = el('aside', 'bh-side');
    const info = el('div', 'bh-info');
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
      '<span>- - today\'s borders</span><span>· · · earlier capitals</span>';
    const sources = el('div', 'bh-sources');
    sources.innerHTML = 'Borders: <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a> ' +
      'and <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>, hand-corrected by era. ' +
      'Ragusa: <a href="https://en.wikipedia.org/wiki/Republic_of_Ragusa" target="_blank" rel="noopener">Republic of Ragusa</a>. ' +
      'Borders before 1900 are approximate.';
    side.append(info, rag, legend, sources);
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
    function drawMap(i, animate) {
      const f = F[i];
      const g = svg('g', { class: 'bh-layer' });
      f.feats.forEach((ft, k) => {
        const p = svg('path', { d: ft.d, fill: ft.c, class: 'bh-poly' + (sel && ft.n === sel ? ' bh-sel' : ''), 'data-k': k });
        g.appendChild(p);
        if (ft.h) g.appendChild(svg('path', { d: ft.d, fill: hatch(ft.h), 'pointer-events': 'none' }));
      });
      if (animate && !reduced()) f.feats.forEach(ft => { if (ft.chg && ft.n) g.appendChild(svg('path', { d: ft.d, class: 'bh-chg' })); });
      const old = [...layers.children];
      if (animate && !reduced()) {
        g.style.opacity = 0; layers.appendChild(g);
        requestAnimationFrame(() => requestAnimationFrame(() => { g.style.opacity = 1; }));
        old.forEach(o => { setTimeout(() => o.remove(), 600); });
      } else { old.forEach(o => o.remove()); layers.appendChild(g); }
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
      if (R.parts.length) add(R.parts.map(k => P[k]).join(''), 'bh-rt-rag');
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
        const t = svg('text', { x: 850, y: 100, class: 'bh-ilabel', 'text-anchor': 'middle' }); t.textContent = 'ceded 1699'; ilabG.appendChild(t);
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
        if (n === 'Sutorina' && !(y >= 1426 && y < 1699)) return;
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

    function renderInfo() {
      const f = F[cur];
      const ft = sel && f.feats.find(x => x.n === sel);
      if (!ft) {
        info.innerHTML = '<div class="bh-info-label">On this map</div><div class="bh-info-note">Tap any region to name it and see how long it lasts on the map. Drag or pinch to zoom.</div>';
        return;
      }
      const idx = spans[ft.n] || [cur];
      const first = F[idx[0]].label, last = F[idx[idx.length - 1]].label;
      const notes = [];
      if (ft.t) notes.push('Peoples without a recorded state on this map.');
      if (ft.h) notes.push('Hatched: a vassal state or territory under occupation.');
      if (ft.chg && cur > 0) notes.push('Changed hands since the previous map.');
      notes.push(idx.length === 1 ? `Appears only on the ${first} map.` : `On ${idx.length} of ${N} maps, from ${first} to ${last}.`);
      info.innerHTML = `<div class="bh-info-label">Selected</div><div class="bh-info-name"><i class="bh-swatch" style="background:${ft.c}"></i>${esc(ft.n)}</div>` +
        `<div class="bh-info-note">${notes.map(esc).join(' ')}</div>`;
    }

    function show(i, animate = true) {
      i = Math.max(0, Math.min(N - 1, i));
      const prev = cur; cur = i;
      const f = F[i];
      head.querySelector('.bh-year').textContent = f.label;
      head.querySelector('.bh-title').textContent = f.title;
      head.querySelector('.bh-caption').textContent = f.caption;
      vp.setAttribute('aria-label', `Map of the Balkans, ${f.label}: ${f.title}`);
      drawMap(i, animate && prev !== i);
      placeLabels(i);
      drawInset(i);
      drawRagTerr(i);
      libertas(f.tpos);
      dots.forEach((d, k) => { d.classList.toggle('bh-past', k < i); d.classList.toggle('bh-cur', k === i); d.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      prog.style.width = pct(f.tpos) + '%';
      transport.querySelector('.bh-range').value = i;
      if (animate && prev !== i) {
        const g = Math.round(Math.abs(f.tpos - F[prev].tpos));
        gap.textContent = (f.tpos >= F[prev].tpos ? '+' : '−') + (g < 1 ? '' : g) + (g === 1 ? ' year' : g < 1 ? 'same year' : ' years');
        gap.style.left = pct(f.tpos) + '%'; gap.classList.add('bh-show');
        clearTimeout(gap._t); gap._t = setTimeout(() => gap.classList.remove('bh-show'), 1600);
      }
      renderInfo();
      if (opts.hash !== false) { try { history.replaceState(null, '', '#' + slug(f.label)); } catch (e) { /* sandboxed */ } }
      if (opts.onChange) opts.onChange(f, slug(f.label));
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
    transport.querySelector('.bh-range').addEventListener('input', e => { stop(); show(+e.target.value); });
    root.addEventListener('keydown', e => {
      if (e.target.matches('input[type=range]')) return;
      if (e.key === 'ArrowRight') { stop(); show(cur + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { stop(); show(cur - 1); e.preventDefault(); }
    });
    toggles.addEventListener('change', () => {
      root.classList.toggle('bh-hide-caps', !toggles.querySelector('#bh-t-caps').checked);
      root.classList.toggle('bh-hide-trails', !toggles.querySelector('#bh-t-trails').checked);
      root.classList.toggle('bh-hide-borders', !toggles.querySelector('#bh-t-borders').checked);
    });

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
      mainPatterns.forEach(([p, bar, size]) => sizePattern(p, bar, size));
      // un-zoomed, a vertical finger drag scrolls the page (touch-action: pan-y); zoomed, every drag pans the map
      vp.classList.toggle('bh-zoomed', scale > 1);
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
      if (z === 'reset') zoomTo(VW / 2, VH / 2, 1);
      else if (z === 'sat') setSat(!sat);
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
    let tileWant = new Set(), tileT = 0, tileFails = 0;
    // street map (OpenStreetMap) or satellite (Esri World Imagery); the choice is remembered on this device
    let sat = false;
    try { sat = localStorage.getItem('bh-sat') === '1'; } catch (e) { /* storage blocked */ }
    function setSat(on) {
      sat = on;
      root.classList.toggle('bh-sat', on);
      const b = zoomUI.querySelector('[data-z=sat]');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? 'Street map view' : 'Satellite view'; b.setAttribute('aria-label', b.title);
      attrib.innerHTML = (on ? 'Imagery © Esri' : 'Today’s map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>') + ' · old borders approximate';
      tileImgs.forEach(im => im.remove()); tileImgs.clear(); tileWant = new Set(); tileFails = 0;
      try { localStorage.setItem('bh-sat', on ? '1' : '0'); } catch (e) { /* storage blocked */ }
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
        pic.onload = () => { im._done = true; im.classList.add('bh-in'); tileFails = 0; sweep(); };
        pic.onerror = () => {
          im._done = true;
          tileFails++; im.remove(); tileImgs.delete(key);
          if (tileFails >= 8) {   // no map underneath after all (offline or blocked): back out to where the era shapes still read
            root.classList.remove('bh-tiles-on');
            if (scale > 40) zoomAt(40 / scale, vp.clientWidth / 2, vp.clientHeight / 2);
          }
          sweep();
        };
        pic.src = sat ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x
          : 'https://tile.openstreetmap.org/' + key + '.png';
        placeTile(im, w, h); tilesEl.appendChild(im); tileImgs.set(key, im);
      }
      tileWant = want;
      sweep();
    }
    // tiles from the previous view stay under the new ones until those have loaded
    function sweep() {
      const ready = [...tileWant].every(k => { const im = tileImgs.get(k); return !im || im._done; });
      tileImgs.forEach((im, k) => {
        if (tileWant.has(k)) { im.style.zIndex = 1; return; }
        if (ready || tileImgs.size > 200) { im.remove(); tileImgs.delete(k); } else im.style.zIndex = 0;
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
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const k = hit && hit.closest && hit.closest('.bh-poly') ? +hit.closest('.bh-poly').dataset.k : null;
        const ft = k != null ? F[cur].feats[k] : null;
        sel = ft && ft.n ? (sel === ft.n ? null : ft.n) : null;
        layers.lastChild && layers.lastChild.querySelectorAll('.bh-poly').forEach(p => {
          const f2 = F[cur].feats[+p.dataset.k]; p.classList.toggle('bh-sel', !!(sel && f2.n === sel));
        });
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
    root.tabIndex = -1;
    return { show: k => show(typeof k === 'number' ? k : F.findIndex(f => slug(f.label) === slug(k))), frames: F };
  }

  window.BalkansHistory = { mount };
})();
