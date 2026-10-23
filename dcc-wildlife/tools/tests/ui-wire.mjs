/**
 * The wire split, in a browser: the sheet with its detail, and without it.
 *
 * The split is only safe if BOTH halves of the story hold. With the fetch
 * working, the sheet must be exactly what it was before anything moved off
 * the page. With the fetch failing — a guest offline, or behind something
 * that eats REST — the sheet must still open, still be useful, and never
 * render an error where a fact should be.
 *
 * The second half is the one that rots quietly, because nobody tests the
 * network being broken.
 */

import {
  launch, widgetPage, check, checkSame, checkAtLeast,
  section, note, done,
} from './lib.mjs';

const browser = await launch();

async function sheet(page, id = 'cottonmouth') {
  await page.evaluate((s) => {
    const t = document.querySelector(`.dccwl-tile[data-dccwl-species="${s}"]`);
    (t || document.querySelector('.dccwl-tile')).click();
  }, id);
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const body = document.querySelector('.dccwl-sheet-body');
    if (!body) { return null; }
    const text = body.textContent.replace(/\s+/g, ' ').trim();
    return {
      title: (document.querySelector('.dccwl-sheet-title') || {}).textContent,
      hasPhoto: !!body.querySelector('.dccwl-medallion img, img.dccwl-photo, .dccwl-sheet-body img'),
      hasStrip: !!body.querySelector('.dccwl-likestrip, [class*="likelihood"], .dccwl-monthstrip'),
      headings: Array.from(body.querySelectorAll('.dccwl-detail-h')).map((h) => h.textContent.trim()),
      lookalikes: body.querySelectorAll('.dccwl-lookalike').length,
      text,
      len: text.length,
    };
  });
}

/* ---- 1. with the detail served: the whole sheet ----------------------- */
section('with the detail fetched, the sheet is complete');

let { page } = await widgetPage(browser, 'month', { width: 390, height: 2600, sitekit: true });
const full = await sheet(page);
check(!!full, 'the sheet opens');
note(`headings: ${full.headings.join(' / ')}   ${full.len} chars`);
checkSame('Florida Cottonmouth', String(full.title).trim(), 'on the species that was tapped');
check(full.headings.includes('What To Do'), 'the what-to-do line is there');
check(full.headings.includes('Where To Look'), 'so is where to look');
check(full.headings.includes('Best Time'), 'and the best time');
checkAtLeast(3, full.lookalikes, 'and the look-alikes, which need idgroup from the detail');
check(full.text.includes('venomous'), 'the fact itself is rendered', full.text.slice(0, 80));

/*
 * ITEM 11 (1.45.0) — THE WAY OUT OF THE SHEET AND INTO THE PROSE GUIDE.
 *
 * Checked on the RENDERED link rather than on the config, because two
 * halves have to agree for it to work: the href the sheet builds and the
 * anchor the guide page renders. test-1450.php pins the second half from
 * PHP; this is the first.
 */
const more = await page.evaluate(() => {
  const p = document.querySelector('.dccwl-sheet-body .dccwl-detail-more');
  const a = p && p.querySelector('a');
  if (!a) { return null; }
  const cs = getComputedStyle(p);
  const as = getComputedStyle(a);
  const r = a.getBoundingClientRect();
  return {
    text: a.textContent.replace(/\s+/g, ' ').trim(),
    href: a.getAttribute('href'),
    align: cs.textAlign,
    underline: as.textDecorationLine,
    height: Math.round(r.height),
    /* The arrow must be hidden from a screen reader: it is punctuation. */
    arrowHidden: (() => {
      const g = a.querySelector('.dccwl-detail-more-arrow');
      return !!g && 'true' === g.getAttribute('aria-hidden');
    })(),
    /* Last thing in the sheet: it is the way out, not an interruption. */
    isLast: p === p.parentNode.lastElementChild,
  };
});
note(`full-entry link ${JSON.stringify(more)}`);
check(!!more, 'the sheet carries a link to the full entry');
if (more) {
  check(/^See The Full Entry/.test(more.text), 'in Rob\'s Title Case', more.text);
  /*
   * 1.46.0: `#dccwl-fl-<key>`, the Director's own scheme, now that the
   * guide page's ROWS carry that id and answer it by opening the species.
   * 1.45.0 used the bare id because that was the anchor the page had then;
   * both ends moved in the same release, and test-1460.php pins the other
   * one. The prefix is never typed in two places — it comes from
   * Guide_Page::ANCHOR_PREFIX through the config.
   */
  checkSame('/wildlife-guide/#dccwl-fl-cottonmouth', more.href,
    'pointing at THIS species\' row on the guide page');
  checkSame('center', more.align, 'centred, per the standing alignment rule');
  check(/underline/.test(more.underline), 'and marked as a link by more than colour');
  checkAtLeast(44, more.height, "with Rob's 44px tap target");
  check(more.arrowHidden, 'the arrow is aria-hidden — punctuation, not a word');
  check(more.isLast, 'and it sits at the foot of the sheet');
}
await page.close();

/* ---- 2. with the fetch failing: still a sheet, never an error --------- */
section('with the fetch failing, the sheet degrades and says nothing false');

({ page } = await widgetPage(browser, 'month', { width: 390, height: 2600, sitekit: true }));
// Break the route AFTER the page is built, exactly as a flaky network would.
await page.route('**/wp-json/dcc-wildlife/v1/species*', (route) => route.abort());
await page.evaluate(() => { window.__dccwlBroken = true; });
const bare = await sheet(page, 'limpkin');
check(!!bare, 'the sheet still opens');
note(`headings: ${bare.headings.join(' / ') || '(none)'}   ${bare.len} chars`);
checkSame('Limpkin', String(bare.title).trim(), 'with the right species in the header');
check(bare.len > 0, 'and something in the body');
check(bare.hasPhoto, 'the photograph, which rides in the index');

/*
 * The one thing it must never do. A missing fact renders NOTHING — no
 * placeholder, no "unavailable", no error. That is the same rule the fact
 * gate sets for the water module: no source, no claim.
 */
for (const shout of ['undefined', 'null', 'NaN', 'Error', 'error', '[object']) {
  check(!bare.text.includes(shout), `the body contains no "${shout}"`, bare.text.slice(0, 120));
}
const errors = await page.evaluate(() =>
  document.querySelectorAll('.dccwl-sheet-body .dccwl-error, .dccwl-sheet-body [role="alert"]').length);
checkSame(0, errors, 'and shows no error element');
await page.close();

/* ---- 3. the fetch happens once, not once per sheet -------------------- */
section('the detail is fetched once for the whole page');

({ page } = await widgetPage(browser, 'month', { width: 390, height: 2600, sitekit: true }));
let hits = 0;
await page.route('**/wp-json/dcc-wildlife/v1/species*', async (route) => {
  hits += 1;
  await route.continue();
});
for (const id of ['cottonmouth', 'limpkin', 'alligator']) {
  await page.evaluate((s) => {
    const t = document.querySelector(`.dccwl-tile[data-dccwl-species="${s}"]`);
    if (t) { t.click(); }
  }, id);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const b = document.querySelector('.dccwl-sheet-back, [data-dccwl-sheet-close]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(250);
}
note(`requests for the detail payload: ${hits}`);
checkAtLeast(0, hits, 'the counter ran');
check(hits <= 1, 'three sheets, at most one request', `hits=${hits}`);
await page.close();

await browser.close();
done();
