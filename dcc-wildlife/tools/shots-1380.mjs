/**
 * The screenshots Rob asked for with 1.38.0, at 390px with touch and 1280px
 * with a mouse, on the real stylesheets. NOT a suite — it asserts nothing and
 * lives outside tools/tests so the runner never counts it as one.
 *
 *   node tools/shots-1380.mjs <out-dir>
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, widgetPage, buildPage, rendered, asset } from './tests/lib.mjs';

const OUT = process.argv[2] || '.';
const browser = await launch();
if (!browser) { console.log('no chromium'); process.exit(1); }

const CONDITIONS = {
  enabled: true,
  facts: [
    { label: 'Water level', key: 'level', value: 'about 2 in. below normal', tier: 'live',
      group: 'primary', sourceName: 'Lake County Water Atlas', date: '2026-09-28',
      dateLabel: 'reading', datePrecision: 'day' },
    { label: 'Water clarity', key: 'clarity', value: '3.6 ft', tier: 'published',
      group: 'primary', sourceName: 'Water Atlas, sampled September 2026', date: '2026-09-02',
      dateLabel: 'sampled', datePrecision: 'day' },
    { label: 'Wind', key: 'wind', value: 'NE 5 to 10 mph', tier: 'live', group: 'primary',
      sourceName: 'NWS forecast', date: '2026-10-04T12:00:00Z', dateLabel: 'forecast',
      datePrecision: 'minute' },
  ],
  wind: { dir: 'NE', speed: '5 to 10 mph', source: 'National Weather Service forecast',
          sourceShort: 'NWS forecast' },
};

const MAP_DATA = {
  enabled: true,
  waters: [
    { id: '1', name: 'Lake Dora', lat: 28.8003, lon: -81.6706, clarity: { value: 1.1, units: 'm', median: 1.0, ratio: 1.1, date: '2026-08-01', age: 20, station: 'Dora station', url: '' }, level: null, depthMap: null, ageDays: 20 },
    { id: '2', name: 'Lake Harris', lat: 28.7419, lon: -81.8069, clarity: null, level: { value: 62.5, units: 'ft', norm: 62.0, inches: 6, datum: 'NAVD88' }, depthMap: null, ageDays: 40 },
    { id: '3', name: 'Lake Eustis', lat: 28.8489, lon: -81.7317, clarity: null, level: null, depthMap: null, ageDays: null },
    { id: '4', name: 'Lake Griffin', lat: 28.8797, lon: -81.8836, clarity: null, level: null, depthMap: null, ageDays: null },
  ],
  stations: [{ id: 'S1', name: 'Dora station', lat: 28.7992, lon: -81.6689, reading: '1.1 m', url: '' }],
  ramps: [{ name: 'Gilbert Park Ramp', lat: 28.8047, lon: -81.6425 }],
  property: { lat: 28.8045, lon: -81.745 },
  wind: CONDITIONS.wind,
};

async function waterPage(width, touch, mapToo) {
  const fx = rendered('water', '--enable');
  const css = ['assets/css/app.css', 'assets/css/water.css'];
  const head = mapToo ? '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">' : '';
  if (mapToo) { css.push('assets/vendor/leaflet/leaflet.css'); }
  const page = await buildPage(browser, {
    width, height: mapToo ? 900 : 1200, touch, sitekit: true, css, head,
    body:
      `<script>window.__f=${JSON.stringify(mapToo ? MAP_DATA : CONDITIONS)};` +
      `window.__c=${JSON.stringify(CONDITIONS)};</script>` +
      fx.html + `<script>${fx.config}</script>`,
  });
  await page.route('**/*.png', (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  if (mapToo) {
    await page.addScriptTag({ content: asset('assets/vendor/leaflet/leaflet.js') });
    await page.addScriptTag({ content: asset('assets/js/water-map.js') });
  }
  await page.evaluate(() => {
    window.fetch = function (url) {
      const map = String(url).indexOf('/map') > -1;
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve(map ? window.__f : window.__c) });
    };
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(800);
  return page;
}

async function shot(page, name, el) {
  const file = join(OUT, name);
  const buf = el ? await el.screenshot() : await page.screenshot({ fullPage: false });
  writeFileSync(file, buf);
  console.log('wrote', file);
}

for (const [w, touch] of [[390, true], [1280, false]]) {
  const tag = `${w}px`;

  /* 1 — the Water Map tab, with its three stat tiles. */
  let page = await waterPage(w, touch, false);
  await shot(page, `Wildlife - 1.38.0 Water Map tab ${tag}.png`,
    await page.$('[data-dccwl-water-root]'));
  await page.close();

  /* 2 — an open map popup over the wind badge and the controls. */
  page = await waterPage(w, touch, true);
  const open = await page.$('[data-dccwl-map-open]');
  if (touch) { await open.tap(); } else { await open.click(); }
  await page.waitForTimeout(1300);
  for (const m of await page.$$('.dccwl-map-canvas .leaflet-interactive')) {
    if (touch) { await m.tap(); } else { await m.click(); }
    await page.waitForTimeout(400);
    if (await page.$('.leaflet-popup')) { break; }
  }
  await shot(page, `Wildlife - 1.38.0 Map popup over the controls ${tag}.png`,
    await page.$('.dccwl-sheet-body-map'));
  await page.close();

  /* 3 + 4 — the Wildlife toolbar closed and open, and a selected button
   * straight after a tap. */
  const h = await widgetPage(browser, 'canal', { width: w, height: 1100, sitekit: true, touch });
  page = h.page;
  await page.evaluate(() => { const g = document.querySelector('.dccwl-hub-tile'); if (g) { g.click(); } });
  await page.waitForTimeout(900);
  const panel = await page.$('.dccwl-panel-species') || await page.$('.dccwl-guide');
  await shot(page, `Wildlife - 1.38.0 Toolbar closed ${tag}.png`, panel);

  const vis = async (sel) => {
    for (const el of await page.$$(sel)) { if (await el.isVisible()) { return el; } }
    return null;
  };
  const pill = await vis('[data-dccwl-subnav] [data-dccwl-pick-btn]');
  if (touch) { await pill.tap(); } else { await pill.click(); }
  await page.waitForTimeout(300);
  await shot(page, `Wildlife - 1.38.0 Toolbar open ${tag}.png`, panel);

  // Choose a category by tap, then photograph the row with the pill labelled.
  const birds = await page.$('.dccwl-pick-opt[data-dccwl-browse="birds"]');
  if (touch) { await birds.tap(); } else { await birds.click(); }
  await page.waitForTimeout(600);

  // A selected button straight after a tap: the tab keeps :hover and :focus.
  const tab = await vis('.dccwl-tab:not([aria-pressed="true"])');
  if (touch) { await tab.tap(); } else { await tab.click(); }
  await page.waitForTimeout(250);
  await shot(page, `Wildlife - 1.38.0 Selected after a tap ${tag}.png`,
    await page.$('.dccwl-tabs'));
  await page.close();
}

await browser.close();
