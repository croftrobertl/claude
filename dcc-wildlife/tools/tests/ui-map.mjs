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
  ],
  ramps: [
    { name: 'Gilbert Park Ramp', lat: 28.8047, lon: -81.6425 },
    { name: 'Venetian Gardens', lat: 28.8556, lon: -81.7269 },
    { name: 'Herlong Park', lat: 28.7431, lon: -81.7914 },
  ],
  property: { lat: 28.8045, lon: -81.745 },
};

/** All coordinates the map is meant to have in view. */
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

  const btn = await page.$('[data-dccwl-map-open]');
  if (!btn) {
    check(false, 'the map button is present in the rendered water section');
    return { page, opened: false };
  }
  await btn.click();

  // Wait for a map instance to exist and for its container to have real size.
  await page.waitForFunction(() => window.__maps && window.__maps.length > 0, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
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

const state = await page.evaluate((points) => {
  const m = (window.__maps || [])[0];
  if (!m) return { error: 'no map instance' };
  const c = m.getContainer();
  const cr = c.getBoundingClientRect();
  const b = m.getBounds();
  const inView = points.filter((p) => b.contains(p)).length;

  // Where each marker actually sits, relative to the canvas.
  const markers = Array.from(c.querySelectorAll('.leaflet-marker-icon, path.leaflet-interactive'));
  let visible = 0;
  for (const el of markers) {
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (cx >= cr.x && cx <= cr.x + cr.width && cy >= cr.y && cy <= cr.y + cr.height) visible += 1;
  }

  return {
    zoom: m.getZoom(),
    canvas: { w: Math.round(cr.width), h: Math.round(cr.height) },
    centre: { lat: +m.getCenter().lat.toFixed(4), lon: +m.getCenter().lng.toFixed(4) },
    pointsInView: inView,
    pointsTotal: points.length,
    markers: markers.length,
    markersVisible: visible,
    tileZooms: Array.from(new Set((window.__tiles || []).map((u) => {
      const mm = u.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
      return mm ? +mm[1] : null;
    }).filter((z) => z !== null))),
  };
}, ALL_POINTS);

note(`canvas ${state.canvas?.w}x${state.canvas?.h}  zoom ${state.zoom}  centre ${state.centre?.lat},${state.centre?.lon}`);
note(`markers ${state.markersVisible}/${state.markers} visible; ${state.pointsInView}/${state.pointsTotal} coordinates in bounds`);
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

checkSame(state.pointsTotal, state.pointsInView, 'every water, station, ramp and the cottages are inside the visible bounds');
// Secondary guards. Note that BOTH of these also passed while the bug was
// live — Leaflet only renders markers near the viewport, so counting visible
// ones cannot see the failure. The zoom and the bounds above are the proof;
// these two only catch a marker that is drawn and then positioned off canvas.
checkAtLeast(11, state.markers ?? 0, 'a marker is drawn for every water, ramp and the cottages');
checkSame(state.markers, state.markersVisible, 'no drawn marker sits outside the canvas');

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
section('nothing in the map sheet is unreachable on a short phone');

// The failure this guards against: the sheet body is a flex column with
// overflow:hidden, the canvas carries a fixed 240px floor, and the control bar
// and legend both wrap. On a 320x568 phone that pushed the legend clean out of
// the bottom of a container that could not scroll, so the colour key simply
// could not be read. Measured live as 141px of legend past the edge.
for (const [w, h] of [[320, 568], [390, 844], [390, 500]]) {
  ({ page, opened } = await openMap(w, h));

  const fit = await page.evaluate(() => {
    const body = document.querySelector('.dccwl-sheet-body-map');
    if (!body) return { error: 'no map sheet body' };
    const br = body.getBoundingClientRect();
    const cs = getComputedStyle(body);
    const canvas = body.querySelector('.dccwl-map-canvas');
    const legend = body.querySelector('.dccwl-map-legend');
    const bar = body.querySelector('.dccwl-map-bar');
    const past = (el) => (el ? Math.round(el.getBoundingClientRect().bottom - br.bottom) : null);
    return {
      overflowY: cs.overflowY,
      clipped: Math.round(body.scrollHeight - body.clientHeight),
      canvasH: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
      legendPast: past(legend),
      barPast: past(bar),
      hasLegend: !!legend,
      hasBar: !!bar,
    };
  });

  note(`${w}x${h}: canvas ${fit.canvasH}px, content past the body ${fit.clipped}px, legend bottom ${fit.legendPast}px past, overflow-y ${fit.overflowY}`);

  check(!fit.error, `${w}x${h}: the map sheet body exists`, fit.error || '');
  check(fit.hasBar && fit.hasLegend, `${w}x${h}: the control bar and the legend are both rendered`);

  // Either everything fits, or the body can be scrolled to reach it. What is
  // not acceptable is content past the edge of a container that cannot scroll.
  const reachable = fit.clipped <= 1 || ['auto', 'scroll'].includes(fit.overflowY);
  check(reachable, `${w}x${h}: nothing is cut off inside a container that cannot scroll`,
    `${fit.clipped}px of content past a body with overflow-y:${fit.overflowY}`);

  // A map squeezed to nothing is not a fix.
  checkAtLeast(120, fit.canvasH, `${w}x${h}: the map canvas stays usable`);

  await page.close();
}

/* ------------------------------------------------------------------------ */
section('the map still drags, now that the sheet body can scroll');

// Making the body scrollable is what guarantees the legend is reachable, but
// it introduces a risk: a finger dragged across the map could scroll the sheet
// instead of panning. Leaflet cancels those gestures itself; this proves it.
({ page, opened } = await openMap(390, 500));

// Driven with REAL browser input, not synthetic events: a dispatched
// PointerEvent does not satisfy Leaflet's drag handler, and a test that
// "passes" because nothing moved at all would be worthless here.
const start = await page.evaluate(() => {
  const m = (window.__maps || [])[0];
  const body = document.querySelector('.dccwl-sheet-body-map');
  if (!m || !body) return { error: 'no map or body' };
  const c = m.getContainer().getBoundingClientRect();
  return {
    lat: m.getCenter().lat,
    scroll: body.scrollTop,
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
    const body = document.querySelector('.dccwl-sheet-body-map');
    return {
      before,
      after: { lat: m.getCenter().lat, scroll: body.scrollTop },
    };
  }, { lat: start.lat, scroll: start.scroll });
}

check(!drag.error, 'the map and its sheet body are both present', drag.error || '');
if (!drag.error) {
  const moved = Math.abs(drag.after.lat - drag.before.lat) > 1e-6;
  note(`drag: centre ${drag.before.lat.toFixed(4)} -> ${drag.after.lat.toFixed(4)}, body scrollTop ${drag.before.scroll} -> ${drag.after.scroll}`);
  check(moved, 'a vertical drag on the canvas pans the map');
  checkSame(drag.before.scroll, drag.after.scroll, 'and does not scroll the sheet body instead');
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
await (await page.$('[data-dccwl-map-open]')).click();
await page.waitForTimeout(700);

const withoutFs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.dccwl-map-bar button')).map((b) => (b.textContent || '').trim())
);
note(`bar buttons without fullscreen support: ${JSON.stringify(withoutFs)}`);
checkSame(false, withoutFs.some((t) => /fullscreen/i.test(t)), 'it is NOT offered where requestFullscreen is missing');
checkAtLeast(1, withoutFs.length, 'the rest of the control bar is still there');

await page.close();
await browser.close();
done();
