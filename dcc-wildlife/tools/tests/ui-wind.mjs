/**
 * THE WIND BADGE on the chain map (1.35.0 — the owner chose option C).
 *
 * What this suite exists to hold:
 *
 *  - THE BADGE IS NOT PER-LAKE DATA. One National Weather Service forecast
 *    covers the whole chain, so nothing wind-related may be drawn on the
 *    water. The negative assertion — no wind marks inside the canvas — is
 *    the one that stops a future "nicer" version putting arrows on the lakes.
 *  - THE SPEED STRING IS PRINTED WHOLE. "5 to 10 mph" is how the forecast
 *    words it; a badge showing "7 mph", or "5-10", would be inventing
 *    precision the source did not give.
 *  - THE ARROW IS THE SECTOR AND NOTHING FINER. Rotation must be the 16-point
 *    bearing plus 180, because a direction says where the wind comes FROM and
 *    an arrow shows where it goes.
 *  - AN UNKNOWN DIRECTION DRAWS NO ARROW. The reading still shows; the
 *    compass does not guess. Same rule as everywhere else in this module —
 *    an absent field is absent, never filled in.
 *  - IT NEVER EATS A DRAG. A guest panning the map from the corner must pan
 *    the map, so the badge takes no pointer events.
 *  - IT SITS ON THE MAP, NOT IN THE SHEET HEADER. It first shipped anchored
 *    to the whole sheet and landed over the title; "pinned to the map corner"
 *    is a claim about the canvas.
 */
import {
  launch, buildPage, rendered, asset,
  check, checkSame, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no chromium'); }

const MAP_DATA = {
  enabled: true,
  waters: [
    { id: '1', name: 'Lake Dora', lat: 28.8003, lon: -81.6706, clarity: { value: 1.1, units: 'm', median: 1.0, ratio: 1.1, date: '2026-09-01', age: 20, station: 'A', url: '' }, level: null, depthMap: null, ageDays: 20 },
    { id: '2', name: 'Lake Harris', lat: 28.7419, lon: -81.8069, clarity: null, level: { value: 62.5, units: 'ft', norm: 62.0, inches: 6, datum: 'NAVD88' }, depthMap: null, ageDays: 40 },
  ],
  stations: [], ramps: [],
  property: { lat: 28.7936, lon: -81.6431, name: 'Dora Canal Court' },
};

const SOURCE = 'National Weather Service forecast';

async function openMap(width, wind) {
  const fixture = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height: width < 600 ? 844 : 800,
    css: ['assets/css/app.css', 'assets/css/water.css', 'assets/vendor/leaflet/leaflet.css'],
    head: '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">',
    body: fixture.html + `<script>${fixture.config}</script>`,
  });
  await page.route('**/*.png', (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.addScriptTag({ content: asset('assets/vendor/leaflet/leaflet.js') });
  await page.addScriptTag({ content: asset('assets/js/water-map.js') });
  await page.evaluate(([m, c]) => {
    window.fetch = (u) => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(String(u).indexOf('map') >= 0 ? m : c),
    });
  }, [MAP_DATA, { enabled: true, facts: [], wind }]);
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(350);
  await page.click('[data-dccwl-map-open]');
  await page.waitForTimeout(1100);
  return page;
}

const read = (page) => page.evaluate(() => {
  const b = document.querySelector('.dccwl-wind-badge');
  if (!b) { return { badge: false }; }
  const r = b.getBoundingClientRect();
  const canvas = document.querySelector('.dccwl-map-canvas').getBoundingClientRect();
  const g = b.querySelector('g[transform]');
  const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return {
    badge: true,
    dir: (b.querySelector('.dccwl-wind-dir') || {}).textContent || '',
    speed: (b.querySelector('.dccwl-wind-speed') || {}).textContent || '',
    src: (b.querySelector('.dccwl-wind-src') || {}).textContent || '',
    aria: b.getAttribute('aria-label'),
    arrows: b.querySelectorAll('.dccwl-wind-arrow').length,
    rot: g ? g.getAttribute('transform') : null,
    onCanvas: r.top >= canvas.top - 1 && r.bottom <= canvas.bottom + 1 && r.right <= canvas.right + 1,
    widthShare: +(r.width / canvas.width).toFixed(2),
    hitsBadge: !!(hit && b.contains(hit)),
    // Nothing wind-related may be drawn among the map's own layers.
    marksOnWater: document.querySelectorAll('.leaflet-pane .dccwl-wind-arrow, .leaflet-pane .dccwl-wind-badge').length,
  };
});

/* ---- 1. the badge, from the conditions call ---------------------------- */
section('the badge draws the forecast the page already had');

let page = await openMap(390, { dir: 'NE', speed: '5 to 10 mph', source: SOURCE });
let m = await read(page);
note(JSON.stringify(m));
check(m.badge, 'the badge is on the map');
checkSame('NE', m.dir, 'the compass sector is the forecast\'s own word');
checkSame('5 to 10 mph', m.speed, 'and the speed string is printed WHOLE, range and all');
checkSame(SOURCE, m.src, 'the source is named, as every reading in this module is');
checkSame('Wind NE at 5 to 10 mph', m.aria, 'and a screen reader gets one sentence');
checkSame('rotate(225)', m.rot, 'NE (45) + 180: the arrow shows where the wind GOES');
check(m.onCanvas, 'it sits inside the canvas, not in the sheet header');
check(m.widthShare <= 0.65, 'and takes no more than two thirds of the map width', String(m.widthShare));
checkSame(false, m.hitsBadge, 'a tap in the corner reaches the map, not the badge');
checkSame(0, m.marksOnWater, 'NOTHING wind-related is drawn among the map layers — one forecast is not per-lake data');
await page.close();

/* ---- 2. every sector maps to its own bearing -------------------------- */
section('each compass sector points its own way');

for (const [dir, rot] of [['N', 'rotate(180)'], ['E', 'rotate(270)'], ['SSW', 'rotate(22.5)'], ['WNW', 'rotate(112.5)']]) {
  page = await openMap(390, { dir, speed: '10 mph', source: SOURCE });
  m = await read(page);
  checkSame(rot, m.rot, `${dir} rotates to ${rot}`);
  await page.close();
}

/* ---- 3. an unknown direction does not guess --------------------------- */
section('an unknown or absent direction shows the speed and no arrow');

for (const dir of ['', 'VAR', 'north-east-ish']) {
  page = await openMap(390, { dir, speed: '15 mph', source: SOURCE });
  m = await read(page);
  check(m.badge, `"${dir}": the reading still shows`);
  checkSame(0, m.arrows, `"${dir}": and no arrow is drawn`);
  checkSame('15 mph', m.speed, `"${dir}": with the speed intact`);
  await page.close();
}

/* ---- 4. no wind, no badge --------------------------------------------- */
section('no forecast, no badge — never an empty one');

for (const wind of [null, { dir: 'NE', speed: '' }]) {
  page = await openMap(390, wind);
  m = await read(page);
  checkSame(false, m.badge, `${JSON.stringify(wind)} draws nothing at all`);
  await page.close();
}

/* ---- 5. desktop ------------------------------------------------------- */
section('and the same on a desktop canvas');

page = await openMap(1280, { dir: 'SW', speed: '5 to 10 mph', source: SOURCE });
m = await read(page);
checkSame('rotate(45)', m.rot, 'SW (225) + 180 wraps to 45');
check(m.onCanvas, 'still on the canvas at 1280px');
check(m.widthShare <= 0.35, 'and a smaller share of a wider map', String(m.widthShare));
await page.close();

await browser.close();
done();
