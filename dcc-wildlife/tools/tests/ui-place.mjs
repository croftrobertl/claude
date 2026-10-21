/**
 * "PICK A PLACE" — the Now tab's place picker (1.44.0, Rob's pick A).
 *
 * WHAT THIS REPLACED, AND WHY BOTH HALVES HAD TO GO. The Now tab held "All
 * readings" (a fold over the canal's own cards) and "Across the Harris Chain"
 * (a second list of every other water's clarity). Rob: "they overlap". Lake
 * Dora appeared in both, and a guest read two lists to answer one question.
 *
 * THE FOUR CLAIMS UNDER TEST, each a rule rather than a preference:
 *
 *  1. The menu is SERVER-RENDERED and the readings are not. A water's name is
 *     an owner-edited setting and cache-safe; a reading is time-sensitive and
 *     must never reach SpeedyCache-served HTML. So the whole menu is in the
 *     page for a crawler and for a guest whose script has not arrived.
 *  2. A place with no reading says "No Recent Reading" — Rob's own wording,
 *     and "never a blank or a false zero".
 *  3. Wind, the forecast and rain are ONE row labelled for the whole chain,
 *     shown once and never repeated per lake. That is 1.35.0 holding: nothing
 *     that does not vary across the water may be drawn as though it does.
 *  4. Choosing a place FETCHES NOTHING. Rob ruled out new per-water Atlas
 *     calls, and the payload already carries every water's clarity.
 *
 * THE FIXTURE IS DELIBERATELY ASYMMETRIC: one other lake has a reading and
 * the rest have none. A fixture where every lake had one could only ever
 * confirm the happy path — this repository's own lesson from 1.39.1, where
 * the single timestamp shape that broke was the one shape no fixture had.
 */

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, buildPage, asset, rendered,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const browser = await launch();

/* The facts come from PHP, through Water_Fact's own gate and formatter.
 * Hand-writing them would mean hand-writing the thing under test. */
const facts = JSON.parse(execFileSync(process.env.PHP_BIN || 'php',
  [join(HERE, 'render-fixture.php'), 'facts'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

async function nowTab(width, touch) {
  const fx = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height: 2200, touch, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css'],
    body:
      `<script>window.__calls=0;window.__f=${JSON.stringify(facts)};` +
      `window.fetch=function(){window.__calls+=1;return Promise.resolve({ok:true,status:200,` +
      `json:function(){return Promise.resolve(window.__f);}});};</script>` +
      fx.html + `<script>${fx.config}</script>`,
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="now"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(400);
  return page;
}

const read = () => ({
  label: (document.querySelector('[data-dccwl-placelabel]') || {}).textContent.trim(),
  menuHidden: document.querySelector('[data-dccwl-placemenu]').hidden,
  options: Array.from(document.querySelectorAll('[data-dccwl-place]'))
    .map((o) => o.textContent.trim()),
  chosen: Array.from(document.querySelectorAll('li[aria-selected="true"] > [data-dccwl-place]'))
    .map((o) => o.getAttribute('data-dccwl-place')),
  cards: Array.from(document.querySelectorAll('[data-dccwl-water-facts] > li'))
    .map((li) => ({
      label: ((li.querySelector('.dccwl-card-label') || {}).textContent || '').trim(),
      value: ((li.querySelector('.dccwl-card-value') || {}).textContent || '').trim(),
      none: li.classList.contains('dccwl-water-fact-none'),
      src: !!li.querySelector('.dccwl-card-src'),
    })),
  whole: {
    hidden: document.querySelector('[data-dccwl-water-whole-wrap]').hidden,
    heading: ((document.querySelector('[data-dccwl-water-whole-wrap] .dccwl-water-sub') || {})
      .textContent || '').trim(),
    cards: Array.from(document.querySelectorAll('[data-dccwl-water-whole] > li'))
      .map((li) => ((li.querySelector('.dccwl-card-label') || {}).textContent || '').trim()),
  },
  /* The two lists this replaced must be GONE, not merely hidden: a fold
   * nobody opens is still markup, and "they overlap" was the complaint. */
  oldFold: document.querySelectorAll('.dccwl-water-allreadings').length,
  oldChain: document.querySelectorAll('[data-dccwl-chain]').length,
  calls: window.__calls,
});

for (const [w, touch] of [[390, true], [1280, false]]) {
  section(`${w}px — the picker opens on our own canal`);
  const page = await nowTab(w, touch);

  const start = await page.evaluate(read);
  note(`${w}px start ${JSON.stringify(start)}`);

  /* 1 — the control, and the two lists it replaced. */
  checkSame(0, start.oldFold, `${w}px: the "All readings" fold is gone from the markup`);
  checkSame(0, start.oldChain, `${w}px: and the "Across the Harris Chain" list with it`);
  check(/^Our Canal · /.test(start.label),
    `${w}px: the chip opens on "Our Canal · <our water>"`, start.label);
  checkSame(true, start.menuHidden, `${w}px: with its menu closed`);
  checkAtLeast(10, start.options.length,
    `${w}px: every configured chain water is an option, rendered by PHP`);
  checkSame(1, start.chosen.length, `${w}px: exactly one place is chosen`);

  /* 2 — our own canal shows its own readings, and NOT the chain's. */
  const labels = start.cards.map((c) => c.label);
  note(`${w}px our canal: ${labels.join(' | ')}`);
  check(labels.some((l) => /level/i.test(l)), `${w}px: our canal shows its level`, labels.join(' | '));
  check(labels.some((l) => /clarity/i.test(l)), `${w}px: and its clarity`, labels.join(' | '));
  check(!labels.includes('Lake Eustis'),
    `${w}px: another lake's reading is NOT in our canal's cards`, labels.join(' | '));
  checkSame([], start.cards.filter((c) => c.none).map((c) => c.label),
    `${w}px: and nothing says "No Recent Reading" where there IS one`);

  /* 3 — the whole-chain row: one row, labelled, with the three that cover it. */
  checkSame(false, start.whole.hidden, `${w}px: the whole-chain row is shown`);
  checkSame('Whole Chain · NWS Forecast', start.whole.heading,
    `${w}px: labelled as covering the chain, in Title Case (items 3 and 7)`);
  note(`${w}px whole chain: ${start.whole.cards.join(' | ')}`);
  checkSame(3, start.whole.cards.length,
    `${w}px: holding exactly wind, rain and the forecast`, start.whole.cards.join(' | '));
  check(!labels.some((l) => start.whole.cards.includes(l)),
    `${w}px: and NONE of the three is repeated in the place cards (1.35.0)`);

  /*
   * 3b — THE DIRECTOR'S CONFIRMATION (1.44.2): the place chip and its menu
   * got the Cottage Selector's chip treatment with everything else in 1.44.1.
   *
   * He asked for it confirmed rather than assumed, so it is measured: the
   * chip component moved to app.css that release and the water section
   * carries `.dccwl-app`, which is the whole reason it reaches this chip —
   * but "the rule exists" has been wrong here often enough that the reading
   * is what counts. The menu rows keep their own treatment (they are listbox
   * options, not chips), so what is asserted of them is the 44px target and
   * the chosen row's coral, below.
   */
  const placeSkin = await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-placebtn]');
    const cs = getComputedStyle(b);
    const span = b.querySelector('.dccwl-chip-label');
    return {
      bg: cs.backgroundColor,
      fg: cs.color,
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      radius: cs.borderTopLeftRadius,
      weight: cs.fontWeight,
      labelWeight: span ? getComputedStyle(span).fontWeight : null,
      h: Math.round(b.getBoundingClientRect().height),
    };
  });
  note(`${w}px place chip ${JSON.stringify(placeSkin)}`);
  checkSame('rgb(255, 255, 255)', placeSkin.bg, `${w}px: the place chip is the Selector's white`);
  checkSame('rgb(0, 0, 0)', placeSkin.fg, `${w}px: with its black ink`);
  checkSame('1px rgb(244, 218, 98)', placeSkin.border, `${w}px: its 1px gold edge`);
  checkSame('30px', placeSkin.radius, `${w}px: its 30px radius`);
  checkSame('600', placeSkin.weight, `${w}px: and weight 600`);
  checkSame('600', placeSkin.labelWeight,
    `${w}px: the LABEL SPAN carries that weight too (item 8, 1.44.1)`);
  checkAtLeast(44, placeSkin.h, `${w}px: still a 44px target`);

  /* 4 — a REAL TAP opens the menu; the open state only exists after one. */
  const btn = await page.$('[data-dccwl-placebtn]');
  if (touch) { await btn.tap(); } else { await btn.click(); }
  await page.waitForTimeout(200);
  const opened = await page.evaluate(() => {
    const list = document.querySelector('[data-dccwl-placemenu]');
    const rows = Array.from(list.querySelectorAll('[data-dccwl-place]'));
    const r = list.getBoundingClientRect();
    const b = document.querySelector('[data-dccwl-placebtn]').getBoundingClientRect();
    return {
      hidden: list.hidden,
      expanded: document.querySelector('[data-dccwl-placebtn]').getAttribute('aria-expanded'),
      role: list.getAttribute('role'),
      below: r.top >= b.bottom - 2,
      shortest: Math.round(Math.min(...rows.map((x) => x.getBoundingClientRect().height))),
      focused: !!(document.activeElement && document.activeElement.getAttribute('data-dccwl-place')),
    };
  });
  note(`${w}px opened ${JSON.stringify(opened)}`);
  checkSame(false, opened.hidden, `${w}px: a real tap opens the menu`);
  checkSame('true', opened.expanded, `${w}px: and says so to a screen reader`);
  checkSame('listbox', opened.role, `${w}px: it is a listbox, like the guide's chips`);
  check(opened.below, `${w}px: it drops directly under the chip`);
  checkAtLeast(44, opened.shortest, `${w}px: every option is one of Rob's 44px targets`);
  check(opened.focused, `${w}px: and focus lands inside it`);

  /* 5 — A LAKE THAT HAS A READING. */
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-place="7985"]').click();
  });
  await page.waitForTimeout(350);
  const eustis = await page.evaluate(read);
  note(`${w}px Eustis ${JSON.stringify(eustis.cards.map((c) => c.label + (c.none ? ' (none)' : '')))}`);
  checkSame('Lake Eustis', eustis.label, `${w}px: the chip reads the place it is showing`);
  checkSame(['7985'], eustis.chosen, `${w}px: and the menu marks it`);
  checkSame(2, eustis.cards.length,
    `${w}px: two cards — level and clarity, which is all the feed has per water`);
  check(eustis.cards.some((c) => !c.none && /4\.27/.test(c.value)),
    `${w}px: its clarity is the Atlas's own reading`,
    eustis.cards.map((c) => c.value).join(' | '));
  check(eustis.cards.some((c) => c.none && /level/i.test(c.label)),
    `${w}px: and its level says "No Recent Reading" rather than nothing`,
    eustis.cards.map((c) => `${c.label}:${c.none}`).join(' | '));
  checkSame(false, eustis.whole.hidden,
    `${w}px: the whole-chain row is unchanged by the choice — it is not about a place`);
  checkSame(3, eustis.whole.cards.length, `${w}px: still exactly three`);

  /* 6 — A LAKE WITH NOTHING, which must still answer. */
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-placebtn]');
    b.click();
    document.querySelector('[data-dccwl-place="7999"]').click();
  });
  await page.waitForTimeout(350);
  const harris = await page.evaluate(read);
  note(`${w}px Harris ${JSON.stringify(harris.cards)}`);
  checkSame(2, harris.cards.length, `${w}px: a lake with no reading still shows two cards`);
  checkSame(2, harris.cards.filter((c) => c.none).length,
    `${w}px: both say "No Recent Reading" — never a blank and never a zero`);
  checkSame([], harris.cards.filter((c) => c.src).map((c) => c.label),
    `${w}px: and neither invents a source, because there is nothing to attribute`);
  check(harris.cards.every((c) => /no recent reading/i.test(c.value)),
    `${w}px: in Rob's own words`, harris.cards.map((c) => c.value).join(' | '));

  /* 7 — AND NOT ONE EXTRA REQUEST FOR ANY OF IT. */
  checkSame(start.calls, harris.calls,
    `${w}px: three changes of place cost ZERO new fetches (Rob: no new per-water Atlas calls)`,
    `${start.calls} → ${harris.calls}`);

  /* 8 — back to our own canal, which must restore its own readings. */
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-placebtn]');
    b.click();
    document.querySelectorAll('[data-dccwl-place]')[0].click();
  });
  await page.waitForTimeout(350);
  const back = await page.evaluate(read);
  check(/^Our Canal · /.test(back.label), `${w}px: our canal comes back`, back.label);
  checkSame(start.cards.length, back.cards.length,
    `${w}px: with the same cards it started with`);
  checkSame([], back.cards.filter((c) => c.none).map((c) => c.label),
    `${w}px: and none of them claiming a missing reading`);

  /* 9 — nothing overflows at either width. */
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  checkAtMost(1, over, `${w}px: no horizontal scroll`);

  await page.close();
}

/* ---------------------------------------------------------------------------
 * WITH NO JAVASCRIPT the menu is still the whole list, in the page.
 *
 * This is claim 1 proved rather than asserted from the markup: the suite
 * loads the rendered HTML and NO scripts at all, and requires every chain
 * water to be readable text. A crawler and a guest on one bar of signal meet
 * the same list a guest with a working script does.
 * ------------------------------------------------------------------------- */
section('with no JavaScript the place list is still in the page');
{
  const fx = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width: 390, height: 2200, touch: true, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css'],
    body: fx.html + `<script>${fx.config}</script>`,
  });
  await page.waitForTimeout(200);
  const names = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-dccwl-place]')).map((o) => o.textContent.trim()));
  note(`server-rendered options: ${names.join(' | ')}`);
  checkAtLeast(10, names.length, 'every chain water is an option in the HTML');
  check(names.some((n) => /Lake Dora/.test(n)), 'including our own water', names.join(' | '));
  check(names.some((n) => /Lake Eustis/.test(n)), 'and the chain lakes by name');
  /* AND NO READING IS IN THE HTML. The other half of the same rule: the page
   * is cached, so a measurement in the markup could be served stale for
   * hours. The names are settings; the numbers are not. */
  const txt = await page.evaluate(() => {
    let out = '';
    const walk = (n) => {
      if (n.nodeType === 3) { out += n.textContent; return; }
      if (/^(SCRIPT|STYLE)$/.test(n.nodeName)) { return; }
      Array.from(n.childNodes).forEach(walk);
    };
    walk(document.body);
    return out;
  });
  check(!/4\.27 ft/.test(txt), 'and not one reading is server-rendered beside them');
  await page.close();
}

await browser.close();
done();
