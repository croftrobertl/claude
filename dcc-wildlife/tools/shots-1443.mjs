/**
 * 1.44.2 surfaces, at 390px and 1280px, for Rob and the Director.
 *
 * NOT a suite: it asserts nothing, and it lives OUTSIDE tools/tests on
 * purpose — anything matching `ui-*.mjs` in that directory is run as a suite
 * and would fail, correctly, for asserting nothing.
 *
 * Run it against this tree for the AFTER shots and against a checkout of the
 * previous release for the BEFORE ones; the file is written so both work,
 * which is why it only ever asks for things both versions have.
 *
 * Shots: Water › Map (what the switch sits above, and the map's own key),
 * Water › Now, Wildlife's chip row, and the view dropdown open.
 */
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, buildPage, asset, rendered, openInlineMap } from './tests/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || '/tmp/claude-0/shots-1443';
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

  /* ---- Wildlife: the chip row ---- */
  page = await explore(w, h);
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-viewtrigger]').click();
    document.querySelector('[data-dccwl-view="wildlife"]').click();
  });
  await page.waitForTimeout(1400);
  /* THE LIVE CONTAINER'S WIDTH, not the viewport's: the Director measured
   * the Elementor column at 334px on a 390px phone, and that is the width
   * the chip row actually has to fit in. The shot is of the thing he
   * measured, so the before/after is comparable with his own figures. */
  const rowW = await page.evaluate((px) => {
    const rows = Array.from(document.querySelectorAll('.dccwl-chiprow'))
      .filter((r) => r.getClientRects().length);
    const row = rows[0];
    if (!row) { return null; }
    if (px) {
      /* On the ROW, not on its parent: the parent differs between the
       * fixtures this script can build, and a squeeze that silently did
       * nothing produced a "before" shot of the wrong width once already. */
      row.style.maxWidth = px + 'px';
      row.style.marginLeft = 'auto';
      row.style.marginRight = 'auto';
    }
    row.scrollIntoView({ block: 'center' });
    return Math.round(row.getBoundingClientRect().width);
  }, 390 === w ? 334 : 0);
  if (390 === w) { console.log(`  (chip row measured ${rowW}px — the live container)`); }
  await page.waitForTimeout(250);
  await shot(page, 'wildlife-chiprow', w);

  /* ---- ...and the view dropdown open, over it ---- */
  await page.evaluate(() => {
    const t = document.querySelector('[data-dccwl-viewtrigger]');
    if (t) { t.scrollIntoView({ block: 'center' }); t.click(); }
  });
  await page.waitForTimeout(250);
  await shot(page, 'viewmenu', w);
  await page.close();
}

await browser.close();
