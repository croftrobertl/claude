/**
 * 1.44.5's one surface, at 390px and 1280px: the About panel, opened.
 *
 * NOT a suite — it asserts nothing, and it lives OUTSIDE tools/tests because
 * anything matching `ui-*.mjs` in that directory is run as one and would
 * fail, correctly, for asserting nothing.
 *
 * Run it against this tree for the AFTER shots and against a checkout of
 * 1.44.4 for the BEFORE ones. It prints the panel's measured content-box
 * width beside each shot, because that number IS the defect: the Director
 * measured 520px inside a 390px screen on live, and a screenshot of clipped
 * content looks merely cropped unless the figure is beside it.
 */
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, buildPage, asset, rendered } from './tests/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || '/tmp/claude-0/shots-1445';
mkdirSync(OUT, { recursive: true });

const php = (which) => JSON.parse(execFileSync(process.env.PHP_BIN || 'php',
  [join(HERE, 'tests', 'render-fixture.php'), which], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const MAP = php('map');
const FACTS = php('facts');

const browser = await launch();

for (const [w, h] of [[390, 1100], [1280, 1000]]) {
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

  const m = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('details.dccwl-fullguide'))
      .find((x) => /About/i.test(x.textContent));
    if (!d) { return null; }
    d.open = true;
    d.scrollIntoView({ block: 'start' });
    const b = d.querySelector('.dccwl-fullguide-body');
    const r = b.getBoundingClientRect();
    const row = document.querySelector('.dccwl-footnotes');
    return {
      panel: Math.round(r.width * 10) / 10,
      vw: document.documentElement.clientWidth,
      row: Array.from(row.querySelectorAll('.dccwl-fullguide-h')).map((x) => x.textContent.trim()).join(' · '),
      /* The whole footnotes BLOCK, open panel included — not the link
       * row on its own. Printed to show the row's labels, not its height. */
      blockH: row ? Math.round(row.getBoundingClientRect().height) : 0,
    };
  });
  console.log(`  (${w}px: panel ${m.panel}px in ${m.vw}px · footer "${m.row}" ${m.blockH}px block)`);
  await page.waitForTimeout(250);
  const file = `${OUT}/about-open-${w}.png`;
  await page.screenshot({ path: file });
  console.log(file);
  await page.close();
}

await browser.close();
