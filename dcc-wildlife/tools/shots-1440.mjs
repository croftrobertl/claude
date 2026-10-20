/**
 * 1.44.0's surfaces, at 390px and 1280px, for Rob and the Director.
 *
 * NOT a suite: it asserts nothing, and it lives OUTSIDE tools/tests on
 * purpose — anything matching `ui-*.mjs` in that directory is run as a suite
 * and would fail, correctly, for asserting nothing.
 *
 * Shots, per the brief: Water › Map, Now with the place menu open, Fishing,
 * Wildlife with the Month menu open, Wildlife with the Badges popover open,
 * and the footer.
 */
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, buildPage, asset, rendered, openInlineMap } from './tests/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || '/tmp/claude-0/shots-1440';
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

for (const [w, h] of [[390, 900], [1280, 1000]]) {
  /* ---- Water › Map, with the layer chips ---- */
  let page = await explore(w, h);
  await openInlineMap(page).catch((e) => console.log('map:', e.message));
  await shot(page, 'water-map', w);
  await page.close();

  /* ---- Water › Now, with the place menu open ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="now"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-placebtn]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(300);
  await shot(page, 'water-now-placemenu', w);
  await page.close();

  /* ---- Water › Fishing ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="fishing"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(500);
  await shot(page, 'water-fishing', w);
  await page.close();

  /* ---- Wildlife, with the Month menu open ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-viewtrigger]').click();
    document.querySelector('[data-dccwl-view="wildlife"]').click();
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-monthbtn]');
    if (b) { b.scrollIntoView({ block: 'center' }); b.click(); }
  });
  await page.waitForTimeout(300);
  await shot(page, 'wildlife-monthmenu', w);

  /* ---- ...and with the Badges popover open ---- */
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-monthbtn]');
    if (b) { b.click(); }
    const g = document.querySelector('[data-dccwl-badges]');
    if (g) { g.scrollIntoView({ block: 'center' }); g.click(); }
  });
  await page.waitForTimeout(300);
  await shot(page, 'wildlife-badges', w);
  await page.close();

  /* ---- the footer links ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-viewtrigger]').click();
    document.querySelector('[data-dccwl-view="wildlife"]').click();
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const row = document.querySelector('.dccwl-footnotes');
    if (row) { row.scrollIntoView({ block: 'center' }); }
  });
  await page.waitForTimeout(250);
  await shot(page, 'footer', w);
  await page.close();
}

await browser.close();
