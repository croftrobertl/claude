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
