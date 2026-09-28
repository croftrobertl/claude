/**
 * The water panel's three tabs and its folded source chips (1.33.0).
 *
 * Both are owner decisions, and both have a property that is easy to lose in
 * a later tidy-up: THE PANEL OPENS ON NOW EVERY TIME, not just the first, and
 * A FOLDED SOURCE IS NEVER A MISSING ONE. The second is the fact gate: this
 * module's whole promise is that no value appears without its source, so a
 * chip that hides the attribution must still be able to show it, and a guest
 * with no JavaScript must see it in plain sight.
 */

import {
  launch, buildPage, asset, rendered,
  check, checkSame, checkAtLeast, section, note, done,
} from './lib.mjs';

/* A realistic /conditions payload. Without it the Now tab has nothing in it
 * and every measurement below would be of an empty box. */
const FACTS = {
  enabled: true,
  facts: [
    { label: 'Water level', value: '62.4 ft', sourceName: 'USGS',
      sourceUrl: 'https://waterdata.usgs.gov/monitoring-location/02237700/',
      date: '2026-09-28', dateLabel: 'reading', datePrecision: 'day',
      tier: 'live', group: 'primary', note: 'Apopka-Beauclair Canal near Astatula' },
    { label: 'Water temperature', value: '81.3 °F', sourceName: 'USGS',
      sourceUrl: 'https://waterdata.usgs.gov/monitoring-location/02238000/',
      date: '2026-09-28', dateLabel: 'reading', datePrecision: 'instant',
      tier: 'live', group: 'primary', note: '' },
    { label: 'Lake Dora', value: 'Clearer than its normal', sourceName: 'Water Atlas',
      sourceUrl: 'https://lake.wateratlas.usf.edu/', date: '2026-08-14',
      dateLabel: 'sampled', datePrecision: 'day', tier: 'chain', group: 'chain', note: '' },
  ],
};

const browser = await launch();

async function panel(width, opts = {}) {
  const fixture = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height: 2400, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css'],
    body:
      `<script>window.__f=${JSON.stringify(FACTS)};` +
      (opts.noFetch ? '' : `window.fetch=function(){return Promise.resolve({json:function(){return Promise.resolve(window.__f);}});};`) +
      `</script>` + fixture.html + `<script>${fixture.config}</script>`,
  });
  if (!opts.noScript) {
    for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
      await page.addScriptTag({ content: asset(f) });
    }
    await page.waitForTimeout(600);
  }
  return page;
}

/* ---- 1. it opens on Now ---------------------------------------------- */
section('the panel opens on Now');

let page = await panel(390);

const state = () => page.evaluate(() => ({
  pressed: Array.from(document.querySelectorAll('[data-dccwl-water-tab-btn]'))
    .filter((b) => 'true' === b.getAttribute('aria-pressed'))
    .map((b) => b.getAttribute('data-dccwl-water-tab-btn')),
  shown: Array.from(document.querySelectorAll('[data-dccwl-water-tab]'))
    .filter((p) => !p.hidden).map((p) => p.getAttribute('data-dccwl-water-tab')),
  barHidden: (document.querySelector('[data-dccwl-water-tabs]') || {}).hidden,
}));

checkSame(false, (await state()).barHidden, 'the tab bar is revealed by the script');
checkSame(['now'], (await state()).pressed, 'Now is the pressed tab');
checkSame(['now'], (await state()).shown, 'and the only visible pane');

/* ---- 2. ...EVERY time, not just the first ---------------------------- */
section('and returns to Now whenever the hub re-opens it');

await page.evaluate(() => document.querySelector('[data-dccwl-water-tab-btn="about"]').click());
await page.waitForTimeout(200);
checkSame(['about'], (await state()).shown, 'choosing About switches the pane');

await page.evaluate(() => {
  const bar = document.querySelector('[data-dccwl-water-tabs]');
  const target = bar.closest('.dccwl-panel') || bar.closest('[data-dccwl-water-root]');
  target.dispatchEvent(new CustomEvent('dccwl:panel-shown', { bubbles: true, detail: { level: 'water' } }));
});
await page.waitForTimeout(200);
checkSame(['now'], (await state()).shown,
  'the hub re-opening the panel puts it back on Now — the owner\'s rule, every time');

/* ---- 3. the sources fold, and unfold ---------------------------------- */
section('every source folds into its chip, and folds back out');

await page.evaluate(() => document.querySelector('[data-dccwl-water-tab-btn="now"]').click());
await page.waitForTimeout(200);

const folded = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.dccwl-card'));
  return cards.map((c) => {
    const btn = c.querySelector('.dccwl-card-src-toggle');
    const attr = c.querySelector('.dccwl-water-attr');
    return {
      label: (c.querySelector('.dccwl-card-label') || {}).textContent,
      isButton: !!btn && 'BUTTON' === btn.tagName,
      expanded: btn && btn.getAttribute('aria-expanded'),
      controls: btn && btn.getAttribute('aria-controls'),
      attrId: attr && attr.id,
      attrHidden: attr && attr.hidden,
      chipText: btn && btn.textContent.replace(/\s+/g, ' ').trim(),
      ariaLabel: btn && btn.getAttribute('aria-label'),
    };
  });
});
checkAtLeast(3, folded.length, 'there are cards to fold');
note(folded.map((f) => `${f.label}: ${f.chipText}`).join('   '));
for (const f of folded) {
  check(f.isButton, `${f.label}: the chip is a button`);
  checkSame('false', f.expanded, `${f.label}: it starts collapsed`);
  checkSame(true, f.attrHidden, `${f.label}: and the attribution is hidden`);
  checkSame(f.attrId, f.controls, `${f.label}: aria-controls points at the attribution`);
  check(!!f.ariaLabel && f.ariaLabel !== f.chipText,
    `${f.label}: the accessible name says what pressing it does`, String(f.ariaLabel));
}

const after = await page.evaluate(() => {
  const btn = document.querySelector('.dccwl-card-src-toggle');
  btn.click();
  const attr = document.getElementById(btn.getAttribute('aria-controls'));
  return { expanded: btn.getAttribute('aria-expanded'), hidden: attr.hidden,
           text: attr.textContent.replace(/\s+/g, ' ').trim(),
           href: (attr.querySelector('a') || {}).href };
});
checkSame('true', after.expanded, 'pressing it expands the source');
checkSame(false, after.hidden, 'and the attribution is shown');
check(after.text.includes('USGS'), 'which names the source', after.text);
check(/^https:\/\//.test(String(after.href)), 'and links to it', String(after.href));

/* ---- 4. the chip is a thumb target ------------------------------------ */
section('the chip is a real target, not a 20px pill');

/* Only the chips ON SCREEN. A chip in a hidden pane measures 0x0, which is
 * not a tap-target failure — it is a pane that is not open. Measuring it
 * anyway would make this assertion fail for the feature it is testing. */
const sizes = await page.evaluate(() => Array.from(document.querySelectorAll('.dccwl-card-src-toggle'))
  .map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter((s) => s.w > 0));
note(sizes.map((s) => `${s.w}x${s.h}`).join(' '));
checkAtLeast(2, sizes.length, 'there are visible chips to measure');
check(sizes.every((s) => s.h >= 44), 'every visible source chip is at least 44px tall',
  JSON.stringify(sizes));

/* ---- 5. and the host kit has not repainted it -------------------------- */
section('the chip stays a quiet chip under the site kit');

const chipStyle = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.dccwl-card-src-toggle'));
  return { bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius };
});
note(JSON.stringify(chipStyle));
check(/rgba\(0, 0, 0, 0\)|transparent/.test(chipStyle.bg),
  'it is NOT painted solid by the kit button reset', chipStyle.bg);
checkSame('rgb(17, 17, 17)', chipStyle.color, 'and it carries the plugin text colour');

await page.close();

/* ---- 6. WITHOUT JAVASCRIPT, NOTHING IS HIDDEN -------------------------- */
section('with no JavaScript the whole panel is readable in one scroll');

page = await panel(390, { noScript: true });
const noJs = await page.evaluate(() => ({
  panes: Array.from(document.querySelectorAll('[data-dccwl-water-tab]'))
    .filter((p) => !p.hidden).map((p) => p.getAttribute('data-dccwl-water-tab')),
  barHidden: (document.querySelector('[data-dccwl-water-tabs]') || {}).hidden,
  attrsVisible: Array.from(document.querySelectorAll('.dccwl-water-attr')).filter((a) => !a.hidden).length,
  attrsTotal: document.querySelectorAll('.dccwl-water-attr').length,
}));
note(JSON.stringify(noJs));
checkSame(['now', 'fishing', 'about'], noJs.panes, 'every pane is visible');
checkSame(true, noJs.barHidden, 'and the tab bar stays hidden, so no button is dead');
checkSame(noJs.attrsTotal, noJs.attrsVisible,
  'every source line is in plain sight — a folded source must never be a missing one');
checkAtLeast(1, noJs.attrsTotal, 'and there is at least one to see');
await page.close();

await browser.close();
done();
