/**
 * The water panel's three tabs (1.33.0) and its sources behind ⓘ (1.48.1).
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
      date: '2026-09-28', dateText: '09/28/2026', dateLabel: 'reading', datePrecision: 'day',
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
    for (const f of ['assets/js/info.js', 'assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
      await page.addScriptTag({ content: asset(f) });
    }
    await page.waitForTimeout(600);
  }
  return page;
}

/* ---- 1. it opens on MAP ----------------------------------------------- */
/* 1.34.0 REVERSES the 1.33.0 rule that this panel opens on Now. Rob chose
 * "map first" (item 3, option B) on 2026-10-01, so the panel opens on the
 * first tab in the bar and that tab is Map. The assertion is rewritten rather
 * than loosened: the OLD rule and the new one are both one named tab, and a
 * suite that stopped caring which would no longer be testing his decision. */
section('the panel opens on Map, which is the first tab');

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
checkSame(['map'], (await state()).pressed, 'Map is the pressed tab');
checkSame(['map'], (await state()).shown, 'and the only visible pane');
checkSame(['map', 'now', 'fishing'], await page.evaluate(() => Array.from(
  document.querySelectorAll('[data-dccwl-water-tab-btn]')
).map((b) => b.getAttribute('data-dccwl-water-tab-btn'))),
  'the bar reads Map · Now · Fishing — About is no longer a tab (item 4)');

/* ---- 2. ...EVERY time, not just the first ---------------------------- */
section('and returns to the first tab whenever the hub re-opens it');

await page.evaluate(() => document.querySelector('[data-dccwl-water-tab-btn="fishing"]').click());
await page.waitForTimeout(200);
checkSame(['fishing'], (await state()).shown, 'choosing Fishing switches the pane');

await page.evaluate(() => {
  const bar = document.querySelector('[data-dccwl-water-tabs]');
  const target = bar.closest('.dccwl-panel') || bar.closest('[data-dccwl-water-root]');
  target.dispatchEvent(new CustomEvent('dccwl:panel-shown', { bubbles: true, detail: { level: 'water' } }));
});
await page.waitForTimeout(200);
checkSame(['map'], (await state()).shown,
  'the hub re-opening the panel puts it back on the first tab — every time');

/* ---- 3. every source sits behind its card's ⓘ (1.48.1) --------------- */
/* Rob, 2026-11-04: "all credit and source lines go behind an ⓘ tooltip —
 * one ⓘ pattern everywhere." The 1.33.0 chip that folded the attribution is
 * gone; what has to stay true is the same fact gate: a folded source is
 * never a missing one, and it opens by touch, by mouse and by keyboard. */
section('every source sits behind its card\'s ⓘ, and comes back out');

await page.evaluate(() => document.querySelector('[data-dccwl-water-tab-btn="now"]').click());
await page.waitForTimeout(200);

const infos = await page.evaluate(() => Array.from(
  document.querySelectorAll('[data-dccwl-water-tab="now"] .dccwl-card')
).filter((c) => c.getBoundingClientRect().height > 0).map((c) => {
  const btn = c.querySelector('.dccwl-card-head .dccwl-info-btn');
  const pop = btn && document.getElementById(btn.getAttribute('popovertarget'));
  return {
    label: (c.querySelector('.dccwl-card-label') || {}).textContent,
    isButton: !!btn && 'BUTTON' === btn.tagName && 'button' === btn.type,
    lastInHead: !!btn && btn.parentElement === btn.parentElement.parentElement.lastElementChild,
    popAuto: !!pop && 'auto' === pop.getAttribute('popover'),
    popIsSibling: !!pop && pop.parentElement === btn.parentElement,
    closed: !!pop && !pop.matches(':popover-open'),
    src: pop ? (pop.querySelector('.dccwl-water-src') || {}).textContent : null,
    ariaLabel: btn && btn.getAttribute('aria-label'),
    faceText: c.textContent.replace(pop ? pop.textContent : '', ''),
  };
}));
checkAtLeast(2, infos.length, 'there are reading cards to check');
for (const f of infos) {
  check(f.isButton, `${f.label}: the ⓘ is a real button`);
  check(f.lastInHead, `${f.label}: at the END of the card's heading row`);
  check(f.popAuto && f.popIsSibling, `${f.label}: naming a popover="auto" panel beside it`);
  check(f.closed, `${f.label}: closed until asked`);
  check(!!f.src && f.src.trim().length > 0, `${f.label}: the panel names the source`, String(f.src));
  checkSame(`Source of ${f.label}`, f.ariaLabel, `${f.label}: the accessible name says whose source it is`);
  check(!/USGS|Water Atlas/.test(f.faceText), `${f.label}: and no source is left inline on the card face`, f.faceText);
}

/* A REAL click — the browser's own popover machinery, not a .click(). */
const first = page.locator('[data-dccwl-water-tab="now"] .dccwl-card .dccwl-info-btn').first();
await first.click();
await page.waitForTimeout(100);
const opened = await page.evaluate(() => {
  const pop = document.querySelector('.dccwl-info-pop:popover-open');
  if (!pop) { return null; }
  const r = pop.getBoundingClientRect();
  const b = document.querySelector(`[popovertarget="${pop.id}"]`).getBoundingClientRect();
  return { text: pop.textContent.replace(/\s+/g, ' ').trim(), href: (pop.querySelector('a') || {}).href,
           inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
           besideBtn: Math.abs(r.top - b.bottom) < 12 || Math.abs(r.bottom - b.top) < 12,
           expanded: document.querySelector(`[popovertarget="${pop.id}"]`).matches('[aria-expanded="true"]') };
});
check(!!opened, 'a tap opens the panel');
check(!!opened && opened.text.includes('USGS'), 'which names the source', opened && opened.text);
check(!!opened && /^https:\/\//.test(String(opened.href)), 'and links to it', opened && String(opened.href));
check(!!opened && /reading 09\/28\/2026/.test(opened.text), 'with its date and its wording kept', opened && opened.text);
check(!!opened && opened.inView, 'drawn inside the screen at 390');
check(!!opened && opened.besideBtn, 'beside its ⓘ, not in the middle of the page');

await page.mouse.click(5, 5);
await page.waitForTimeout(100);
checkSame(0, await page.evaluate(() => document.querySelectorAll('.dccwl-info-pop:popover-open').length),
  'a tap outside closes it');

await first.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
checkSame(1, await page.evaluate(() => document.querySelectorAll('.dccwl-info-pop:popover-open').length),
  'Enter on the focused ⓘ opens it');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
checkSame(0, await page.evaluate(() => document.querySelectorAll('.dccwl-info-pop:popover-open').length),
  'Esc closes it');
check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('dccwl-info-btn')),
  'and focus is back on the ⓘ');
await page.keyboard.press('Space');
await page.waitForTimeout(100);
checkSame(1, await page.evaluate(() => document.querySelectorAll('.dccwl-info-pop:popover-open').length),
  'Space opens it too');
await page.keyboard.press('Escape');

/* ---- 4. the ⓘ is a thumb target ----------------------------------------- */
section('the ⓘ is a real target, not a 20px glyph');

const sizes = await page.evaluate(() => Array.from(document.querySelectorAll('.dccwl-card .dccwl-info-btn'))
  .map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter((s) => s.w > 0));
note(sizes.map((s) => `${s.w}x${s.h}`).join(' '));
checkAtLeast(2, sizes.length, 'there are visible ⓘ buttons to measure');
check(sizes.every((s) => s.h >= 44 && s.w >= 44), 'every visible ⓘ is at least 44x44', JSON.stringify(sizes));

/* ---- 5. and the host kit has not repainted it -------------------------- */
section('the ⓘ stays quiet under the site kit');

const btnStyle = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.dccwl-card .dccwl-info-btn'));
  const probe = document.createElement('span');
  probe.style.color = 'var(--dccwl-primary)';
  document.querySelector('.dccwl-card').appendChild(probe);
  const want = getComputedStyle(probe).color;
  probe.remove();
  return { bg: cs.backgroundColor, color: cs.color, want };
});
note(JSON.stringify(btnStyle));
check(/rgba\(0, 0, 0, 0\)|transparent/.test(btnStyle.bg), 'it is NOT painted solid by the kit button reset', btnStyle.bg);
checkSame(btnStyle.want, btnStyle.color, 'and it carries the plugin\'s own primary blue');

await page.close();

/* ---- 6. WITHOUT JAVASCRIPT, NOTHING IS LOST ---------------------------- */
/* The server prints the almanac cards' ⓘ, and popovertarget is HTML: with
 * scripting off it still opens. A source that only a script could reveal
 * would be a missing source for a guest on one bar of signal. */
section('with no JavaScript every source is still one tap away');

page = await panel(390, { noScript: true });
const noJs = await page.evaluate(() => ({
  panes: Array.from(document.querySelectorAll('[data-dccwl-water-tab]'))
    .filter((p) => !p.hidden).map((p) => p.getAttribute('data-dccwl-water-tab')),
  barHidden: (document.querySelector('[data-dccwl-water-tabs]') || {}).hidden,
  infos: document.querySelectorAll('.dccwl-info-btn[popovertarget]').length,
  paired: Array.from(document.querySelectorAll('.dccwl-info-btn[popovertarget]'))
    .every((b) => { const p = document.getElementById(b.getAttribute('popovertarget')); return p && p.textContent.trim(); }),
  inline: document.querySelectorAll('.dccwl-water-attr, .dccwl-fishing-src').length,
}));
note(JSON.stringify(noJs));
checkSame(['now', 'fishing', 'map'], noJs.panes,
  'every pane is visible — in source order, which the tab order no longer has to match');
checkSame(true, noJs.barHidden, 'and the tab bar stays hidden, so no button is dead');
checkAtLeast(1, noJs.infos, 'the server prints its ⓘ buttons');
check(noJs.paired, 'each names a panel with text in it');
checkSame(0, noJs.inline, 'and no source line is left inline');
const nb = page.locator('.dccwl-info-btn[popovertarget]').first();
await nb.scrollIntoViewIfNeeded();
await nb.click();
await page.waitForTimeout(100);
checkSame(1, await page.evaluate(() => document.querySelectorAll('.dccwl-info-pop:popover-open').length),
  'and a tap opens one with no script on the page at all');
await page.close();

await browser.close();
done();
