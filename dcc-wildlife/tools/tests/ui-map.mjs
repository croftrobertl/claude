/**
 * The chain map must be looking at the Harris Chain when it opens.
 *
 * This suite exists because of a specific bug: DCCWL_Map.init ran inside the
 * sheet's build callback, which the sheet invokes while its host is still
 * `hidden`. A hidden element has no layout, so the canvas was 0x0, and
 * fitBounds against a zero-sized viewport made Leaflet clamp to its maximum
 * zoom at a meaningless centre. Every marker was off screen.
 *
 * So the assertions are deliberately about the RESULT, never the call:
 *   - the canvas has a real size by the time the map is fitted
 *   - the final zoom is a chain-sized zoom, not the max
 *   - every marker lands inside the visible canvas
 *
 * "fitBounds was called" was true the whole time the bug existed.
 */

import {
  openInlineMap,
  launch, buildPage, rendered, asset,
  check, checkAtLeast, checkAtMost, checkSame, section, note, done,
} from './lib.mjs';

const browser = await launch();

/** Payload shaped exactly like /wp-json/dcc-wildlife/v1/map, over the real chain. */
const MAP_DATA = {
  enabled: true,
  waters: [
    { id: '1', name: 'Lake Dora', lat: 28.8003, lon: -81.6706, clarity: { value: 1.1, units: 'm', median: 1.0, ratio: 1.1, date: '2026-08-01', age: 20, station: 'A', url: '' }, level: null, depthMap: null, ageDays: 20 },
    { id: '2', name: 'Lake Harris', lat: 28.7419, lon: -81.8069, clarity: null, level: { value: 62.5, units: 'ft', norm: 62.0, inches: 6, datum: 'NAVD88' }, depthMap: null, ageDays: 40 },
    { id: '3', name: 'Lake Eustis', lat: 28.8489, lon: -81.7317, clarity: null, level: null, depthMap: null, ageDays: null },
    { id: '4', name: 'Lake Griffin', lat: 28.8797, lon: -81.8836, clarity: null, level: null, depthMap: null, ageDays: null },
    { id: '5', name: 'Lake Yale', lat: 28.9256, lon: -81.7639, clarity: null, level: null, depthMap: null, ageDays: null },
    { id: '6', name: 'Lake Beauclair', lat: 28.7856, lon: -81.6483, clarity: null, level: null, depthMap: null, ageDays: null },
    { id: '7', name: 'Lake Carlton', lat: 28.7719, lon: -81.6389, clarity: null, level: null, depthMap: null, ageDays: null },
  ],
  stations: [
    { id: 'S1', name: 'Dora station', lat: 28.7992, lon: -81.6689, reading: '1.1 m', url: '' },
    { id: 'S2', name: 'Griffin station', lat: 28.8801, lon: -81.8822, reading: null, url: '' },
    /*
     * ITEM 7 (1.44.1) — AN OUTLIER, BECAUSE THE FIXTURE COULD NOT SHOW THE
     * DEFECT WITHOUT ONE.
     *
     * Every station and ramp above sits inside the chain waters' own box, so
     * fitting to "every marker" and fitting to "the chain waters and the
     * cottages" gave the SAME view here while live opened on the whole
     * county. That is this repository's oldest trap in its purest form: a
     * hand-written fixture can only confirm what its author already believed.
     *
     * The real payload reaches much further. USGS keeps gauges well down the
     * Ocklawaha leg, north of the chain, and `discover_gauges()` sweeps from
     * a bounding box — so this row stands for one of those.
     */
    { id: 'S3', name: 'Ocklawaha leg gauge', lat: 29.1800, lon: -81.9000, reading: null, url: '' },
  ],
  ramps: [
    { name: 'Gilbert Park Ramp', lat: 28.8047, lon: -81.6425 },
    { name: 'Venetian Gardens', lat: 28.8556, lon: -81.7269 },
    { name: 'Herlong Park', lat: 28.7431, lon: -81.7914 },
    /* The same point, from the other direction: a public ramp on a water the
     * chain list does not hold (Lake Apopka, south of the chain). */
    { name: 'Apopka ramp', lat: 28.6000, lon: -81.6100 },
  ],
  property: { lat: 28.8045, lon: -81.745 },
};

/**
 * WHAT THE OPENING VIEW MUST HOLD (item 7, Rob's Director): "the chain waters
 * the plugin already lists (the place menu's list), with the cottages in
 * view". Stations and ramps are drawn, and reachable by panning, but they do
 * not decide the view.
 */
const FIT_POINTS = [
  ...MAP_DATA.waters.map((w) => [w.lat, w.lon]),
  [MAP_DATA.property.lat, MAP_DATA.property.lon],
];

/** Every coordinate in the payload, including the two outliers. */
const ALL_POINTS = [
  ...MAP_DATA.waters.map((w) => [w.lat, w.lon]),
  ...MAP_DATA.stations.map((s) => [s.lat, s.lon]),
  ...MAP_DATA.ramps.map((r) => [r.lat, r.lon]),
  [MAP_DATA.property.lat, MAP_DATA.property.lon],
];

async function openMap(width, height) {
  const fixture = rendered('water', '--enable');

  const page = await buildPage(browser, {
    width,
    height,
    css: ['assets/css/app.css', 'assets/css/water.css', 'assets/vendor/leaflet/leaflet.css'],
    // A link carrying the flag water.js looks for, so loadCss resolves at once.
    head: '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">',
    body: fixture.html + `<script>${fixture.config}</script>`,
  });

  // Tiles would need the network. Serve a transparent pixel and record the
  // zoom each request asks for — an independent read on the final zoom.
  await page.route('**/*.png', async (route) => {
    const u = route.request().url();
    await page.evaluate((url) => { (window.__tiles = window.__tiles || []).push(url); }, u).catch(() => {});
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
    });
  });

  // Leaflet and the map module are pre-loaded, so water.js's loaders resolve
  // immediately (loadScript short-circuits when its readiness test passes).
  await page.addScriptTag({ content: asset('assets/vendor/leaflet/leaflet.js') });

  // Capture every map instance Leaflet builds. This wraps the LIBRARY, not the
  // plugin, so the code under test is untouched.
  await page.evaluate(() => {
    const orig = window.L.map;
    window.L.map = function (...args) {
      const m = orig.apply(this, args);
      (window.__maps = window.__maps || []).push(m);
      return m;
    };
  });

  await page.addScriptTag({ content: asset('assets/js/water-map.js') });

  // The map payload comes from a fetch; answer it without a network.
  await page.evaluate((data) => {
    window.fetch = function (url) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
    };
  }, MAP_DATA);

  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(150);

  /*
   * THE BUTTON IS GONE (1.44.0). Rob's item 2: the section "opens on Water ›
   * Map, with the map already showing (no 'Open the chain map' button),
   * loaded when the section scrolls into view". So what this suite asserts
   * first is that there is no button to press and the map arrives anyway.
   */
  const btn = await page.$('[data-dccwl-map-open]');
  checkSame(null, btn, 'there is no "Open the chain map" button any more');
  const host = await page.$('[data-dccwl-map-host]');
  if (!host) {
    check(false, 'the inline map host is present in the rendered water section');
    return { page, opened: false };
  }

  /*
   * 1.34.0 REVERSES the 1.33.0 arrangement. Rob chose map-first (item 3,
   * option B), so the map has its own tab, that tab is FIRST, and the panel
   * opens on it — which means the button a guest presses to open the map is
   * visible without choosing anything. The suite asserts the new arrangement
   * rather than clicking its way back to the old one: the tabs are still
   * doing something (Now and Fishing are hidden), and what changed is which
   * of the three a guest meets.
   */
  const tabbed = await page.$('[data-dccwl-water-tab-btn="map"]');
  if (tabbed) {
    checkSame(true, await host.isVisible(),
      'the map host is visible at once, because the panel opens on Map');
    checkSame(false, await (await page.$('[data-dccwl-water-tab="now"]')).isVisible(),
      'and the other tabs are hidden, so the tab bar is still doing its job');
  }

  /* Drive the REAL path: select the pane, scroll the host into view, wait
   * for the canvas. Nothing here presses anything a guest cannot. */
  await openInlineMap(page);
  await page.waitForFunction(() => window.__maps && window.__maps.length > 0, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { page, opened: true };
}

/* ------------------------------------------------------------------------ */
section('the map opens onto the Harris Chain at 390x844');

let { page, opened } = await openMap(390, 844);

if (!opened) {
  await page.close();
  await browser.close();
  done();
}

const state = await page.evaluate((arg) => {
  const m = (window.__maps || [])[0];
  if (!m) return { error: 'no map instance' };
  const c = m.getContainer();
  const cr = c.getBoundingClientRect();
  const b = m.getBounds();
  const inView = arg.fit.filter((p) => b.contains(p)).length;

  // Where each marker actually sits, relative to the canvas.
  const markers = Array.from(c.querySelectorAll('.leaflet-marker-icon, path.leaflet-interactive'));
  let visible = 0;
  for (const el of markers) {
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (cx >= cr.x && cx <= cr.x + cr.width && cy >= cr.y && cy <= cr.y + cr.height) visible += 1;
  }

  /*
   * THE TWO ZOOMS, ASKED OF LEAFLET ITSELF. `getBoundsZoom` is the exact
   * answer to "what zoom would fit this box in this canvas", so comparing
   * the real zoom against both boxes is a measurement rather than a
   * threshold someone guessed. Fitting to every marker is a LOWER zoom
   * number (further out) than fitting to the chain.
   */
  const box = (pts) => pts.reduce((acc, p) => acc.extend(p), window.L.latLngBounds(pts[0], pts[0]));
  /* WITH THE SAME PADDING THE CODE USES. Asked without it, both boxes
   * rounded to zoom 10 on a 374x506 canvas and the comparison could not
   * tell them apart — the padding is 60px of the 374, which is a whole
   * zoom step here. */
  const PAD = window.L.point(30, 30);
  const zoomFor = (pts) => m.getBoundsZoom(box(pts), false, PAD);

  return {
    zoom: m.getZoom(),
    zoomForChain: zoomFor(arg.fit),
    zoomForEverything: zoomFor(arg.all),
    outliersInView: arg.out.filter((p) => b.contains(p)).length,
    canvas: { w: Math.round(cr.width), h: Math.round(cr.height) },
    centre: { lat: +m.getCenter().lat.toFixed(4), lon: +m.getCenter().lng.toFixed(4) },
    pointsInView: inView,
    pointsTotal: arg.fit.length,
    markers: markers.length,
    markersVisible: visible,
    tileZooms: Array.from(new Set((window.__tiles || []).map((u) => {
      const mm = u.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
      return mm ? +mm[1] : null;
    }).filter((z) => z !== null))),
  };
}, {
  fit: FIT_POINTS,
  all: ALL_POINTS,
  out: [[29.18, -81.9], [28.6, -81.61]],
});

note(`canvas ${state.canvas?.w}x${state.canvas?.h}  zoom ${state.zoom}  centre ${state.centre?.lat},${state.centre?.lon}`);
note(`markers ${state.markersVisible}/${state.markers} visible; ${state.pointsInView}/${state.pointsTotal} chain coordinates in bounds`);
note(`zoom ${state.zoom}; chain box would be ${state.zoomForChain}, every marker ${state.zoomForEverything}; ` +
  `${state.outliersInView} of 2 outliers in view`);
note(`tile zooms requested: ${JSON.stringify(state.tileZooms)}`);

check(!state.error, 'a Leaflet map was created', state.error || '');

// The canvas must have had real size when the fit happened. A 0x0 canvas is
// the whole bug.
checkAtLeast(200, state.canvas?.w ?? 0, 'the map canvas has a real width');
checkAtLeast(150, state.canvas?.h ?? 0, 'the map canvas has a real height');

// Leaflet's max zoom here is 18. Clamping to it is the failure signature.
checkAtMost(13, state.zoom ?? 99, 'the zoom is a chain-sized zoom, not clamped to the maximum');
checkAtLeast(7, state.zoom ?? 0, 'nor zoomed out to the whole world');

// The centre must be on the chain, not at a nonsense point.
check(
  typeof state.centre?.lat === 'number' && state.centre.lat > 28.5 && state.centre.lat < 29.2,
  'the centre latitude is on the Harris Chain',
  JSON.stringify(state.centre)
);
check(
  typeof state.centre?.lon === 'number' && state.centre.lon > -82.1 && state.centre.lon < -81.4,
  'the centre longitude is on the Harris Chain',
  JSON.stringify(state.centre)
);

checkSame(state.pointsTotal, state.pointsInView,
  'every chain water and the cottages are inside the visible bounds');

/*
 * ITEM 7 — AND IT IS THE CHAIN'S BOX, NOT THE COUNTY'S.
 *
 * Through 1.44.0 every marker went into the fit, so one gauge down the
 * Ocklawaha and one ramp on Lake Apopka opened the map on the county. These
 * two assertions are the pair: the zoom is the one Leaflet would choose for
 * the chain box, and it is TIGHTER than the one it would choose for every
 * marker. Without the second, a change that quietly widened the box again
 * would still pass the first.
 */
checkSame(state.zoomForChain, state.zoom ?? 0,
  'the zoom is exactly what the chain box and its padding allow',
  `zoom ${state.zoom}, chain box ${state.zoomForChain}`);
check((state.zoom ?? 0) > state.zoomForEverything,
  'and tighter than fitting every marker would give — the county view is gone',
  `zoom ${state.zoom} against ${state.zoomForEverything}`);

// Secondary guard. Note that this also passed while the 0x0-canvas bug was
// live — Leaflet only renders markers near the viewport, so counting visible
// ones cannot see that failure. The zoom and the bounds above are the proof.
checkAtLeast(11, state.markers ?? 0, 'a marker is drawn for every water, ramp and the cottages');

await page.close();

/* ------------------------------------------------------------------------ */
section('and on a short phone, 320x568');

({ page, opened } = await openMap(320, 568));

const small = await page.evaluate(() => {
  const m = (window.__maps || [])[0];
  if (!m) return { error: 'no map instance' };
  const cr = m.getContainer().getBoundingClientRect();
  return { zoom: m.getZoom(), w: Math.round(cr.width), h: Math.round(cr.height) };
});
note(`320px: canvas ${small.w}x${small.h} zoom ${small.zoom}`);
check(!small.error, 'a map is created at 320px too', small.error || '');
checkAtMost(13, small.zoom ?? 99, 'the zoom is sane at 320px as well');
checkAtLeast(150, small.w ?? 0, 'the canvas has real width at 320px');

await page.close();

/* ------------------------------------------------------------------------ */
section('nothing on the inline map is unreachable on a short phone');

/*
 * THE SAME CLAIM, AGAINST A DIFFERENT CONTAINER (1.44.0).
 *
 * What it guarded in the SHEET: the body was a flex column with
 * overflow: hidden, the canvas carried a fixed 240px floor, and the control
 * bar and the legend both wrap. On a 320x568 phone that pushed the legend
 * clean out of the bottom of a container that could not scroll, so the
 * colour key could not be read at all — measured live as 141px past the
 * edge.
 *
 * INLINE the container is the page, which always scrolls, so "unreachable"
 * can only happen one way now: the HOST clipping its own children. That is
 * not hypothetical — the first version of the inline CSS put `min-height`
 * and `overflow: hidden` on the host, and this section caught the bar and
 * the legend being cut off in the run it was written. The host grows to its
 * content and only an EMPTY host holds the space open.
 *
 * So: the bar and the legend are rendered, both sit INSIDE the host's own
 * box, and the canvas is still a usable size at every height.
 */
for (const [w, h] of [[320, 568], [390, 844], [390, 500]]) {
  ({ page, opened } = await openMap(w, h));

  const fit = await page.evaluate(() => {
    const host = document.querySelector('[data-dccwl-map-host]');
    if (!host) return { error: 'no inline map host' };
    const hr = host.getBoundingClientRect();
    const cs = getComputedStyle(host);
    const canvas = host.querySelector('.dccwl-map-canvas');
    const legend = host.querySelector('.dccwl-map-legend');
    const bar = host.querySelector('.dccwl-map-bar');
    const past = (el) => (el ? Math.round(el.getBoundingClientRect().bottom - hr.bottom) : null);
    return {
      overflowY: cs.overflowY,
      clipped: Math.round(host.scrollHeight - host.clientHeight),
      canvasH: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
      legendPast: past(legend),
      barPast: past(bar),
      hasLegend: !!legend,
      hasBar: !!bar,
    };
  });

  note(`${w}x${h}: canvas ${fit.canvasH}px, content past the host ${fit.clipped}px, ` +
    `legend bottom ${fit.legendPast}px past, bar ${fit.barPast}px past, overflow-y ${fit.overflowY}`);

  check(!fit.error, `${w}x${h}: the inline map host exists`, fit.error || '');
  check(fit.hasBar && fit.hasLegend, `${w}x${h}: the control bar and the legend are both rendered`);

  /* NOT CLIPPED, which inline means: the host either grows past them or does
   * not hide what it cannot fit. A positive `legendPast` with
   * overflow-y: hidden is the exact defect. */
  const clipping = 'hidden' === fit.overflowY || 'clip' === fit.overflowY;
  check(!clipping || fit.clipped <= 1,
    `${w}x${h}: the host does not hide its own bar and legend`,
    `${fit.clipped}px of content past a host with overflow-y:${fit.overflowY}`);
  checkAtMost(1, Math.max(fit.legendPast ?? 0, fit.barPast ?? 0),
    `${w}x${h}: both sit inside the host's own box`,
    `legend ${fit.legendPast}px, bar ${fit.barPast}px`);

  // A map squeezed to nothing is not a fix.
  checkAtLeast(120, fit.canvasH, `${w}x${h}: the map canvas stays usable`);

  /*
   * ITEM 12 (1.44.1) — THE LEGEND'S WORDING AND ITS ALIGNMENT.
   *
   * The Director gave the four clarity rows verbatim and found them
   * left-aligned on live. Both halves are asked here: the exact strings, and
   * that each wrapped LINE of them is centred on the map — which is a
   * geometry question, not a `justify-content` read, because the rows are
   * flex items and only their boxes say where they ended up.
   */
  const leg = await page.evaluate(() => {
    const box = document.querySelector('.dccwl-map-legend');
    if (!box) { return { error: 'no legend' }; }
    const items = Array.from(box.querySelectorAll('.dccwl-leg-item'));
    const br = box.getBoundingClientRect();
    /* Group the items into the lines the wrap produced, then compare each
     * line's own centre with the legend's. */
    const lines = {};
    items.forEach((it) => {
      const r = it.getBoundingClientRect();
      const key = Math.round(r.top);
      lines[key] = lines[key] || { left: Infinity, right: -Infinity };
      lines[key].left = Math.min(lines[key].left, r.left);
      lines[key].right = Math.max(lines[key].right, r.right);
    });
    const boxMid = br.left + br.width / 2;
    return {
      labels: items.map((it) => it.textContent.replace(/\s+/g, ' ').trim()),
      offsets: Object.keys(lines).map((k) => Math.round(
        ((lines[k].left + lines[k].right) / 2) - boxMid)),
    };
  });
  note(`${w}x${h}: legend ${JSON.stringify(leg.labels)} line offsets ${JSON.stringify(leg.offsets)}`);
  check(!leg.error, `${w}x${h}: the legend has its rows`, leg.error || '');
  checkSame(
    ['Clearer Than Usual', 'Near Usual', 'Murkier Than Usual', 'No Current Reading'],
    leg.labels,
    `${w}x${h}: the clarity legend reads the Director's own four strings`);
  check((leg.offsets || []).every((o) => Math.abs(o) <= 2),
    `${w}x${h}: every line of it is centred on the map, not left-aligned`,
    JSON.stringify(leg.offsets));

  await page.close();
}

/* ------------------------------------------------------------------------ */
section('the map still drags, and does not scroll the page instead');

/*
 * THE SAME RISK, AGAINST A BIGGER CONTAINER (1.44.0).
 *
 * In the sheet the danger was a finger dragging the map and scrolling the
 * sheet body instead. Inline it is worse, not better: the container is the
 * PAGE, which always scrolls and is far more likely to steal the gesture —
 * and the map now sits in the middle of a long document rather than in a
 * modal. Leaflet cancels those gestures itself; this proves it still does.
 *
 * Driven with REAL browser input, not synthetic events: a dispatched
 * PointerEvent does not satisfy Leaflet's drag handler, and a test that
 * "passes" because nothing moved at all would be worthless here.
 */
({ page, opened } = await openMap(390, 500));

// Driven with REAL browser input, not synthetic events: a dispatched
// PointerEvent does not satisfy Leaflet's drag handler, and a test that
// "passes" because nothing moved at all would be worthless here.
const start = await page.evaluate(() => {
  const m = (window.__maps || [])[0];
  if (!m) return { error: 'no map' };
  const c = m.getContainer().getBoundingClientRect();
  return {
    lat: m.getCenter().lat,
    scroll: window.scrollY || document.documentElement.scrollTop || 0,
    x: Math.round(c.x + c.width / 2),
    y: Math.round(c.y + c.height / 2),
  };
});

let drag = { error: start.error };
if (!start.error) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(start.x, start.y - i * 12);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);

  drag = await page.evaluate((before) => {
    const m = (window.__maps || [])[0];
    return {
      before,
      after: {
        lat: m.getCenter().lat,
        scroll: window.scrollY || document.documentElement.scrollTop || 0,
      },
    };
  }, { lat: start.lat, scroll: start.scroll });
}

check(!drag.error, 'the map is present and draggable', drag.error || '');
if (!drag.error) {
  const moved = Math.abs(drag.after.lat - drag.before.lat) > 1e-6;
  note(`drag: centre ${drag.before.lat.toFixed(4)} -> ${drag.after.lat.toFixed(4)}, page scrollY ${drag.before.scroll} -> ${drag.after.scroll}`);
  check(moved, 'a vertical drag on the canvas pans the map');
  checkSame(drag.before.scroll, drag.after.scroll, 'and does not scroll the PAGE instead');
}

await page.close();

/* ------------------------------------------------------------------------ */
section("Leaflet's own controls meet the same 44px floor as ours");

({ page, opened } = await openMap(390, 844));

const zoom = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('.dccwl-map-canvas .leaflet-bar a'));
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    return { cls: el.className.toString().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
  });
});
for (const z of zoom) note(`${z.cls}: ${z.w}x${z.h}`);
checkAtLeast(1, zoom.length, 'the zoom control is rendered');
checkAtLeast(44, Math.min(...zoom.map((z) => z.w)), 'every Leaflet control is at least 44px wide');
checkAtLeast(44, Math.min(...zoom.map((z) => z.h)), 'and at least 44px tall');

await page.close();

/* ------------------------------------------------------------------------ */
section('the fullscreen button is only offered where it can work');

({ page, opened } = await openMap(390, 844));
const withFs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.dccwl-map-bar button')).map((b) => (b.textContent || '').trim())
);
note(`bar buttons with fullscreen available: ${JSON.stringify(withFs)}`);
check(withFs.some((t) => /fullscreen/i.test(t)), 'it IS offered in a browser that supports it');
await page.close();

// iPhone Safari implements requestFullscreen for <video> only, so on the
// owner's own phone the button rendered and did nothing at all.
const fixture = rendered('water', '--enable');
page = await buildPage(browser, {
  width: 390,
  height: 844,
  css: ['assets/css/app.css', 'assets/css/water.css', 'assets/vendor/leaflet/leaflet.css'],
  head: '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">',
  body: fixture.html + `<script>${fixture.config}</script>`,
});
// Remove the capability BEFORE the map module is loaded, the way a phone that
// never had it would look.
await page.evaluate(() => {
  delete Element.prototype.requestFullscreen;
  delete Element.prototype.webkitRequestFullscreen;
});
await page.route('**/*.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
await page.addScriptTag({ content: asset('assets/vendor/leaflet/leaflet.js') });
await page.addScriptTag({ content: asset('assets/js/water-map.js') });
await page.evaluate((data) => {
  window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
}, MAP_DATA);
for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
  await page.addScriptTag({ content: asset(f) });
}
await page.waitForTimeout(150);
// The map has its own tab since 1.34.0, and the panel opens on it, so the
// button needs no tab press to reach.

await openInlineMap(page);
await page.waitForTimeout(700);

const withoutFs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.dccwl-map-bar button')).map((b) => (b.textContent || '').trim())
);
note(`bar buttons without fullscreen support: ${JSON.stringify(withoutFs)}`);
checkSame(false, withoutFs.some((t) => /fullscreen/i.test(t)), 'it is NOT offered where requestFullscreen is missing');
checkAtLeast(1, withoutFs.length, 'the rest of the control bar is still there');

await page.close();


/* ------------------------------------------------------------------------ */
/*
 * NOTHING MAP-RELATED LOADS BEFORE THE HOST IS IN VIEW (1.44.0).
 *
 * This is the 1.31.0 rule — "the map loads NOTHING external until opened: no
 * Leaflet, no tiles, no data" — re-pointed at the new trigger. Rob removed
 * the button, so "until opened" became "until it scrolls into view", and the
 * rule is now easier to break by accident: an observer with too much margin,
 * or a visibility check that answers yes for a host 3,000px down the page,
 * and every guest pays for a map they never reach.
 *
 * SO THIS SECTION LOADS NOTHING IN ADVANCE, unlike every other section in
 * this file: no Leaflet, no water-map.js, no pre-resolved stylesheet link.
 * water.js's own loaders must be the thing that fetches them, and the only
 * way to see that is to let them try. The requests are counted by route, so
 * what is measured is what the browser actually asked for.
 *
 * `CLAUDE.md` has claimed since 1.31.0 that "a test asserts zero external
 * requests before the click". There was no such test. Written now, because
 * the claim is load-bearing and because an undocumented absence is worse
 * than a documented one.
 */
section('nothing map-related loads until the host comes into view');
{
  const fixture = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width: 390, height: 700, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css'],
    /* A TALL SPACER, so the host starts well below the fold — past the 200px
     * of lead the loader allows itself. Without it the host is on screen at
     * load and the question cannot be asked. */
    body: '<div style="height:2400px"></div>' + fixture.html + `<script>${fixture.config}</script>`,
  });

  /*
   * COUNTED WITH `page.on('request')`, NOT WITH `page.route`.
   *
   * The first version of this used routes, and it reported that Leaflet was
   * never requested while the map plainly built — because buildPage already
   * routes everything under the plugin's assets path, and which of two
   * matching handlers wins is a detail of the runner rather than a fact
   * about the page. The request event sees every request whatever serves
   * it, which is the question actually being asked.
   */
  const asked = [];
  page.on('request', (req) => {
    asked.push(req.url().replace(/^https?:\/\/[^/]+/, ''));
  });

  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(900);

  const before = asked.slice();
  note(`before scrolling: ${before.length ? before.join(', ') : 'nothing'}`);
  /* The /conditions call is NOT part of this claim and is excluded by name:
   * it fills the Now tab's cards and has run on load since 1.5.0, long
   * before the map existed. What must not have happened is Leaflet, its
   * stylesheet, water-map.js or the /map payload. */
  const mapish = before.filter((u) => /leaflet|water-map|v1\/map/.test(u));
  checkSame([], mapish,
    'with the host below the fold, not one map asset is requested', before.join(', '));

  const built = await page.evaluate(() => !!document.querySelector('.dccwl-map-canvas'));
  checkSame(false, built, 'and no canvas exists');

  /* Now scroll to it, exactly as a guest would. */
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-map-host]').scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(1200);

  const after = asked.filter((u) => /leaflet|water-map|v1\/map/.test(u));
  note(`after scrolling: ${after.join(', ') || 'nothing'}`);
  check(after.length > 0,
    'scrolling to it starts the load', `${mapish.length} -> ${after.length}`);
  check(after.some((u) => /leaflet/.test(u)),
    'Leaflet is one of the things it asks for', after.join(', '));

  /* AND THE ORDER IS STILL RIGHT: the payload is fetched LAST, after the
   * library is in. A fetch that races the script is how 1.31.0's own
   * sequence was built, and reversing it would mean holding a payload with
   * nothing able to draw it. */
  const leafletAt = after.findIndex((u) => /leaflet\.js/.test(u));
  const dataAt = after.findIndex((u) => /v1\/map/.test(u));
  if (leafletAt >= 0 && dataAt >= 0) {
    check(leafletAt < dataAt, 'and asks for the library before the payload',
      `leaflet at ${leafletAt}, payload at ${dataAt}`);
  } else {
    note(`order not observable here (leaflet ${leafletAt}, payload ${dataAt})`);
  }

  await page.close();
}

await browser.close();
done();
