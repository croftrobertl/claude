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
  check, checkSame, checkAtLeast, section, note, done, skipSuite,
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
/* 1.35.1: the badge shows the short form and a screen reader is given the
 * full name. The short form travels WITH the reading — the client never
 * abbreviates a source it was handed. */
const SHORT = 'NWS forecast';

async function openMap(width, wind) {
  const fixture = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height: width < 600 ? 844 : 800,
    css: ['assets/css/app.css', 'assets/css/water.css', 'assets/vendor/leaflet/leaflet.css'],
    head: '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">',
    body: fixture.html + `<script>${fixture.config}</script>`,
  });
  /* EVERY tile host, not just the PNG glob. Esri's template ends in
   * /{z}/{y}/{x} with no extension, so a PNG-only route let those requests
   * fail — six errors, and the map fell back to OpenStreetMap, which made a
   * test about the Esri rule quietly test the fallback instead. */
  const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  for (const pat of ['**/*.png', '**/server.arcgisonline.com/**', '**/tile.openstreetmap.org/**']) {
    await page.route(pat, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  }
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

let page = await openMap(390, { dir: 'NE', speed: '5 to 10 mph', source: SOURCE, sourceShort: SHORT });
let m = await read(page);
note(JSON.stringify(m));
check(m.badge, 'the badge is on the map');
checkSame('NE', m.dir, 'the compass sector is the forecast\'s own word');
checkSame('5 to 10 mph', m.speed, 'and the speed string is printed WHOLE, range and all');
checkSame(SHORT, m.src, 'the source is named SHORT on the badge (1.35.1)');
checkSame('Wind NE at 5 to 10 mph — ' + SOURCE, m.aria,
  'and a screen reader still gets the full name');
checkSame('rotate(225)', m.rot, 'NE (45) + 180: the arrow shows where the wind GOES');
check(m.onCanvas, 'it sits inside the canvas, not in the sheet header');
check(m.widthShare <= 0.5, 'and the short form keeps the badge under half the map width', String(m.widthShare));
checkSame(false, m.hitsBadge, 'a tap in the corner reaches the map, not the badge');
checkSame(0, m.marksOnWater, 'NOTHING wind-related is drawn among the map layers — one forecast is not per-lake data');
await page.close();

/* ---- 1b. a payload cached before 1.35.1 ------------------------------- */
section('with no short form, the full source still shows — never no source');

page = await openMap(390, { dir: 'NE', speed: '5 to 10 mph', source: SOURCE });
m = await read(page);
checkSame(SOURCE, m.src, 'it falls back to the full name rather than going blank');
await page.close();

/* ---- 2. every sector maps to its own bearing -------------------------- */
section('each compass sector points its own way');

for (const [dir, rot] of [['N', 'rotate(180)'], ['E', 'rotate(270)'], ['SSW', 'rotate(22.5)'], ['WNW', 'rotate(112.5)']]) {
  page = await openMap(390, { dir, speed: '10 mph', source: SOURCE, sourceShort: SHORT });
  m = await read(page);
  checkSame(rot, m.rot, `${dir} rotates to ${rot}`);
  await page.close();
}

/* ---- 3. an unknown direction does not guess --------------------------- */
section('an unknown or absent direction shows the speed and no arrow');

for (const dir of ['', 'VAR', 'north-east-ish']) {
  page = await openMap(390, { dir, speed: '15 mph', source: SOURCE, sourceShort: SHORT });
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

page = await openMap(1280, { dir: 'SW', speed: '5 to 10 mph', source: SOURCE, sourceShort: SHORT });
m = await read(page);
checkSame('rotate(45)', m.rot, 'SW (225) + 180 wraps to 45');
check(m.onCanvas, 'still on the canvas at 1280px');
check(m.widthShare <= 0.35, 'and a smaller share of a wider map', String(m.widthShare));
await page.close();

/* ---- 5b. the credit is an ⓘ, and each provider's rule holds (1.37.0) --- */
section('the map credit collapses behind an ⓘ, by each provider\'s rule');

page = await openMap(390, { dir: 'NE', speed: '5 to 10 mph', source: SOURCE, sourceShort: SHORT });
let credit = await page.evaluate(() => {
  const canvas = document.querySelector('.dccwl-map-canvas');
  const btn = canvas.querySelector('.dccwl-map-credit-btn');
  const attr = canvas.querySelector('.leaflet-control-attribution');
  const br = btn && btn.getBoundingClientRect();
  const cr = canvas.getBoundingClientRect();
  return {
    hasBtn: !!btn,
    label: btn && btn.getAttribute('aria-label'),
    // bottom-right, clear of the badge (top-right) and the zoom (top-left)
    corner: br ? (cr.bottom - br.bottom < 40 && cr.right - br.right < 40) : null,
    open: canvas.classList.contains('dccwl-credit-open'),
    attrText: attr ? attr.textContent.replace(/\s+/g, ' ').trim() : null,
    attrShown: attr ? 'none' !== getComputedStyle(attr).display : null,
    // Leaflet's own flag/logo is off
    prefix: attr ? /Leaflet/i.test(attr.textContent) : null,
  };
});
note(JSON.stringify(credit));
check(credit.hasBtn, 'there is an ⓘ on the map');
checkSame('Map credits', credit.label, 'named for a screen reader');
check(credit.corner, 'in the BOTTOM-RIGHT corner, clear of the badge and the zoom');
checkSame(false, credit.open, 'the satellite (Esri) layer starts collapsed, which its terms allow');
checkSame(false, credit.attrShown, 'so the permanent credit line is gone from the map');
checkSame(false, credit.prefix, "and Leaflet's own flag and logo are dropped");
check(/Powered by Esri/.test(credit.attrText || ''),
  'the Esri credit carries the required "Powered by Esri"', credit.attrText);

await page.evaluate(() => document.querySelector('.dccwl-map-credit-btn').click());
await page.waitForTimeout(250);
credit = await page.evaluate(() => {
  const canvas = document.querySelector('.dccwl-map-canvas');
  const attr = canvas.querySelector('.leaflet-control-attribution');
  const ar = attr.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.round(ar.left + 4), Math.round(ar.top + ar.height / 2));
  return { shown: 'none' !== getComputedStyle(attr).display,
           reachable: !!(hit && (attr === hit || attr.contains(hit))) };
});
check(credit.shown, 'pressing the ⓘ shows the credit');
check(credit.reachable, 'and nothing of ours covers it');
await page.close();

/* The OpenStreetMap rule: shown first, then collapsed on a pan, a tap or five
 * seconds. This is a LICENCE condition, not a preference. */
section('the OpenStreetMap layer shows its credit first, then collapses');

page = await openMap(390, { dir: 'NE', speed: '5 to 10 mph', source: SOURCE, sourceShort: SHORT });
await page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('input[type="radio"]'))
    .find((x) => /street/i.test(x.value || '') || /street/i.test((x.parentElement || {}).textContent || ''));
  if (r) { r.click(); }
});
await page.waitForTimeout(300);
const osmOpen = await page.evaluate(() => ({
  open: document.querySelector('.dccwl-map-canvas').classList.contains('dccwl-credit-open'),
  text: (document.querySelector('.leaflet-control-attribution') || {}).textContent || '',
}));
note(JSON.stringify(osmOpen));
check(osmOpen.open, 'choosing the street layer shows its credit at once');
check(/OpenStreetMap/i.test(osmOpen.text), 'and the credit names OpenStreetMap', osmOpen.text.slice(0, 80));

// a pan collapses it
await page.evaluate(() => {
  const canvas = document.querySelector('.dccwl-map-canvas');
  canvas.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(250);
checkSame(false, await page.evaluate(() => document.querySelector('.dccwl-map-canvas')
  .classList.contains('dccwl-credit-open')), 'and the guest\'s first touch collapses it');
await page.close();

/* ---- 6. a popup closes when a guest taps away (item 3, 1.36.0) --------- */
section('a marker popup closes on a tap anywhere outside it');

page = await openMap(390, { dir: 'NE', speed: '5 to 10 mph', source: SOURCE, sourceShort: SHORT });
const popupState = () => page.evaluate(() => ({
  open: document.querySelectorAll('.leaflet-popup').length,
}));

// Open one the way a guest does: by pressing a water marker.
await page.evaluate(() => {
  const m = document.querySelector('.leaflet-interactive');
  if (m) { m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }
});
await page.waitForTimeout(400);
checkAtLeast(1, (await popupState()).open, 'pressing a marker opens its popup');

// A tap on the map bar is "outside", and Leaflet's own handler never hears it.
await page.evaluate(() => {
  const bar = document.querySelector('.dccwl-map-bar') || document.body;
  bar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
});
await page.waitForTimeout(350);
checkSame(0, (await popupState()).open, 'a tap on the control bar closes it');

// And the popup does not close on a click INSIDE itself.
await page.evaluate(() => {
  const m = document.querySelector('.leaflet-interactive');
  if (m) { m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const p = document.querySelector('.leaflet-popup');
  if (p) { p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }
});
await page.waitForTimeout(300);
checkAtLeast(1, (await popupState()).open, 'but a tap inside the popup leaves it open');

/* ITEM 3 (1.37.0): and while it is open it is ABOVE everything else in the
 * sheet. Rob's screenshot had the wind badge over the popup's title and the
 * credit line through its last row. "Is it on top" is not a question about
 * z-index values — it is a question about what a tap would hit, so that is
 * what this asks, at three points down the popup. */
const stack = await page.evaluate(() => {
  const pop = document.querySelector('.leaflet-popup');
  if (!pop) { return null; }
  const r = pop.getBoundingClientRect();
  const probe = (y) => {
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(y));
    return !!(el && pop.contains(el));
  };
  return {
    top: probe(r.top + 6),
    middle: probe(r.top + r.height / 2),
    bottom: probe(r.bottom - 6),
    overlapsBadge: (() => {
      const b = document.querySelector('.dccwl-wind-badge');
      if (!b) { return false; }
      const br = b.getBoundingClientRect();
      return !(br.right < r.left || br.left > r.right || br.bottom < r.top || br.top > r.bottom);
    })(),
  };
});
check(!!stack, 'the popup is on screen to test');
if (stack) {
  note(JSON.stringify(stack));
  check(stack.top, 'the popup owns its own title row — nothing is painted over it');
  check(stack.middle, 'and its middle');
  check(stack.bottom, 'and its last line, where the credit used to run');
}
await page.close();

await browser.close();
done();
