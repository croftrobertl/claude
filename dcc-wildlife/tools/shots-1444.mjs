/**
 * 1.44.4's surfaces, at 390px and 1280px, for Rob and the Director.
 *
 * NOT a suite: it asserts nothing, and it lives OUTSIDE tools/tests on
 * purpose — anything matching `ui-*.mjs` in that directory is run as a suite
 * and would fail, correctly, for asserting nothing.
 *
 * Run it against this tree for the AFTER shots and against a checkout of
 * 1.44.3 for the BEFORE ones; it only ever asks for things both versions
 * have, which is what makes the pair comparable.
 *
 * Shots, chosen as the places 1.44.4's strings are actually visible:
 *   water-map-colourmenu  the bar's button and the open menu — "Color By:
 *                         Clarity ▾", "Data Age", "Clarity", "Level"
 *   water-map-popup       a water's popup, with its "Depth Map (PDF)" link
 *   water-fishing         "Licenses & Keep-Limits — Florida FWC" and the
 *                         "FWC Licenses" link
 *   water-about           "Official Information" and "Local Reports &
 *                         Charters" headings
 *   wildlife-gray         the guide searched for "gray", which is the two
 *                         renamed species (Eastern Gray Squirrel, Gray Fox)
 */
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, buildPage, asset, rendered, openInlineMap } from './tests/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || '/tmp/claude-0/shots-1444';
mkdirSync(OUT, { recursive: true });

const php = (which) => JSON.parse(execFileSync(process.env.PHP_BIN || 'php',
  [join(HERE, 'tests', 'render-fixture.php'), which], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const MAP = php('map');
const FACTS = php('facts');

const browser = await launch();

async function explore(w, h) {
  const fx = rendered('canal', '--enable');
  const page = await buildPage(browser, {
    width: w, height: h, touch: 390 === w, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/canal.css', 'assets/css/water.css'],
    body:
      `<script>window.__m=${JSON.stringify(MAP)};window.__f=${JSON.stringify(FACTS)};` +
      `window.fetch=function(u){return Promise.resolve({ok:true,status:200,` +
      `json:function(){return Promise.resolve(String(u).indexOf('/map')>=0?window.__m:window.__f);}});};` +
      `</script>` + fx.html + `<script>${fx.config}</script>`,
  });
  await page.route('**/*.png', (r) => r.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js',
    'assets/js/water.js', 'assets/js/canal.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(900);
  return page;
}

const shot = async (page, name, w, full = false) => {
  const file = `${OUT}/${name}-${w}.png`;
  await page.screenshot({ path: file, fullPage: full });
  console.log(file);
};

/* Click where a tap would land, whichever the page is emulating. */
const press = async (page, handle, touch) => {
  if (touch) { await handle.tap(); } else { await handle.click(); }
};

for (const [w, h] of [[390, 900], [1280, 1000]]) {
  const touch = 390 === w;

  /* ---- the map's colour control, with its menu open ---- */
  let page = await explore(w, h);
  await openInlineMap(page).catch((e) => console.log('map:', e.message));
  /*
   * At 1280px the bar is the full six-control shape and the colouring is a
   * segmented control with no menu button (1.33.0, Rob's own pick), so the
   * label is on the bar itself. At 390px it collapses to the two menus. Both
   * are shot as they come: the point is the WORDS, and the shape is his.
   */
  const dropped = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.dccwl-drop-btn'))
      .find((x) => /Color|Colour/i.test(x.textContent));
    if (!b) { return false; }
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  });
  console.log(`  (${w}px: colour ${dropped ? 'menu opened' : 'is the segmented control — no menu at this width'})`);
  await page.waitForTimeout(300);
  await shot(page, 'water-map-colourmenu', w);
  await page.close();

  /* ---- a map popup, for the "Depth Map (PDF)" and "Station Page" links ---- */
  page = await explore(w, h);
  await openInlineMap(page).catch((e) => console.log('map:', e.message));
  let opened = '';
  for (const m of await page.$$('.dccwl-map-canvas .leaflet-interactive')) {
    await press(page, m, touch);
    await page.waitForTimeout(350);
    opened = await page.evaluate(() => {
      const p = document.querySelector('.leaflet-popup-content');
      return p ? p.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    if (/Depth|Station/i.test(opened)) { break; }
  }
  console.log(`  (${w}px popup: ${opened || 'none opened'})`);
  await shot(page, 'water-map-popup', w);
  await page.close();

  /* ---- Fishing: "Licenses & Keep-Limits" and the "FWC Licenses" link ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="fishing"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('.dccwl-fishing-h'))
      .find((x) => x.getClientRects().length);
    if (h) { h.scrollIntoView({ block: 'center' }); }
  });
  await page.waitForTimeout(200);
  await shot(page, 'water-fishing-licenses', w);
  await page.close();

  /* ---- the About fold: the two links headings ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('details.dccwl-fullguide'))
      .find((x) => /About/i.test(x.textContent));
    if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); }
  });
  await page.waitForTimeout(400);
  await shot(page, 'water-about-headings', w, true);
  await page.close();

  /* ---- the guide, searched for "gray": the two renamed species ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-viewtrigger]').click();
    document.querySelector('[data-dccwl-view="wildlife"]').click();
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const i = Array.from(document.querySelectorAll('[data-dccwl-search-input]'))
      .find((x) => x.getClientRects().length);
    if (i) {
      i.value = 'gray';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.scrollIntoView({ block: 'start' });
    }
  });
  await page.waitForTimeout(900);
  await shot(page, 'wildlife-gray', w);
  await page.close();
}

await browser.close();
