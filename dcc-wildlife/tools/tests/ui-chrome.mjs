/**
 * THE SHEET'S CHROME AND THE LEVEL BAR (1.36.0, Rob's 2026-10-02 list).
 *
 * Four things this holds, each of which has already gone wrong once:
 *
 *  - THE LEVEL BAR IS STICKY, AND NOTHING MAY REDECLARE ITS POSITION. A rule
 *    added in 1.34.0 to give the centred crumb a containing block set
 *    `position: relative` at equal specificity and later in the file, so the
 *    bar stopped sticking AND kept `top: var(--dccwl-sticky-offset)` — which
 *    on a relative element shifts it down without reserving space. On a theme
 *    with a sticky header that put the bar on top of the months row. The test
 *    sets a non-zero offset, because with the token at 0 the bug is invisible.
 *  - THE BAR NEVER OVERLAPS WHAT FOLLOWS IT, at any width, in either section.
 *  - THE SHEET CLOSES FROM THE RIGHT as well as the left: a × that closes it
 *    outright, 46px, with an accessible name and a visible focus ring.
 *  - THE SHEET'S CONTENT DOES NOT TOUCH ITS EDGES: 20px of side padding and
 *    24px at the foot, the Availability Calendar's 1.25em/1.5em.
 */
import {
  launch, widgetPage, check, checkSame, checkAtLeast, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no chromium'); }

/* ---- 1. the level bar ------------------------------------------------- */
section('the level bar is sticky and keeps its distance, at every width');

for (const w of [320, 390, 768, 1280, 1680]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 1000, sitekit: true });
  // A theme with a sticky header: the case that made the bug visible.
  await h.page.evaluate(() => document.documentElement.style.setProperty('--dccwl-sticky-offset', '72px'));
  await h.page.evaluate(() => { const g = document.querySelector('.dccwl-hub-tile'); if (g) { g.click(); } });
  await h.page.waitForTimeout(700);

  const m = await h.page.evaluate(() => {
    const bar = Array.from(document.querySelectorAll('.dccwl-canal .dccwl-levelbar'))
      .filter((n) => n.offsetParent !== null && n.getBoundingClientRect().width > 0)[0];
    if (!bar) { return null; }
    const next = bar.nextElementSibling;
    const br = bar.getBoundingClientRect();
    const nr = next ? next.getBoundingClientRect() : null;
    return {
      position: getComputedStyle(bar).position,
      gap: nr ? +(nr.top - br.bottom).toFixed(1) : null,
      offCentre: +((br.left + br.right) / 2 - window.innerWidth / 2).toFixed(1),
      width: Math.round(br.width),
    };
  });
  check(!!m, `${w}px: the species panel's level bar is on screen`);
  if (m) {
    note(`${w}px ${JSON.stringify(m)}`);
    checkSame('sticky', m.position, `${w}px: it is STILL position: sticky — nothing redeclared it`);
    checkAtLeast(8, m.gap, `${w}px: real space below it, never an overlap`);
    check(Math.abs(m.offCentre) <= 1, `${w}px: and it is centred`, String(m.offCentre));
  }
  await h.page.close();
}

/* ---- 2. the sheet's close button and padding -------------------------- */
section('the sheet closes from the right, and its content clears the edges');

for (const w of [390, 1280]) {
  const h = await widgetPage(browser, 'month', { width: w, height: 900, sitekit: true });
  await h.page.evaluate(() => { const t = document.querySelector('.dccwl-tile'); if (t) { t.click(); } });
  await h.page.waitForTimeout(600);

  const m = await h.page.evaluate(() => {
    const sheet = document.querySelector('.dccwl-sheet');
    const body = sheet && sheet.querySelector('.dccwl-sheet-body');
    const closeBtn = sheet && sheet.querySelector('.dccwl-sheet-close');
    const back = sheet && sheet.querySelector('.dccwl-sheet-back');
    const title = sheet && sheet.querySelector('.dccwl-sheet-title');
    if (!sheet || !body || !closeBtn) { return { ok: false, hasClose: !!closeBtn }; }
    const cs = getComputedStyle(body);
    const cb = closeBtn.getBoundingClientRect();
    const bb = back.getBoundingClientRect();
    const sr = sheet.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    const btn = getComputedStyle(closeBtn);
    const svg = closeBtn.querySelector('svg');
    const path = closeBtn.querySelector('path');
    return {
      ok: true,
      padX: cs.paddingLeft, padXr: cs.paddingRight, padBottom: cs.paddingBottom,
      size: [Math.round(cb.width), Math.round(cb.height)],
      bg: btn.backgroundColor, colour: btn.color, shadow: btn.boxShadow,
      transition: btn.transitionDuration,
      radius: btn.borderRadius,
      svg: svg ? [svg.getAttribute('width'), svg.getAttribute('height')] : null,
      stroke: path ? path.getAttribute('stroke-width') : null,
      label: closeBtn.getAttribute('aria-label'),
      // the × is to the RIGHT of the title, the ‹ to its left
      order: bb.right <= tr.left + 1 && cb.left >= tr.right - 1,
      // and the title sits between them
      titleCentred: Math.abs((tr.left + tr.right) / 2 - (sr.left + sr.right) / 2) <= 24,
    };
  });
  check(m.ok, `${w}px: the sheet has a close button`);
  if (m.ok) {
    note(`${w}px ${JSON.stringify(m)}`);
    checkSame([46, 46], m.size, `${w}px: 46px circle`);
    checkSame('rgb(231, 238, 247)', m.bg, `${w}px: on #E7EEF7`);
    checkSame('rgb(10, 80, 178)', m.colour, `${w}px: with a #0A50B2 cross`);
    checkSame('none', m.shadow, `${w}px: no shadow, like the Availability Calendar's`);
    checkSame('0s', m.transition, `${w}px: and no transition`);
    checkSame('50%', m.radius, `${w}px: a circle`);
    checkSame(['30', '30'], m.svg, `${w}px: the cross is drawn at 30px`);
    checkSame('2.75', m.stroke, `${w}px: stroke-width 2.75`);
    checkSame('Close', m.label, `${w}px: and it is named for a screen reader`);
    check(m.order, `${w}px: ‹ on the left, × on the right`);
    check(m.titleCentred, `${w}px: the title sits between them`);
    checkSame('20px', m.padX, `${w}px: 20px of side padding (1.25em)`);
    checkSame('20px', m.padXr, `${w}px: on both sides`);
    checkSame('24px', m.padBottom, `${w}px: and 24px at the foot (1.5em)`);
  }

  // the × really closes it
  await h.page.evaluate(() => document.querySelector('.dccwl-sheet-close').click());
  await h.page.waitForTimeout(400);
  const shut = await h.page.evaluate(() => {
    const host = document.querySelector('[data-dccwl-open]');
    return host ? host.getAttribute('data-dccwl-open') : 'missing';
  });
  checkSame('false', shut, `${w}px: pressing × closes the sheet outright`);
  await h.page.close();
}

/* ---- 3. the photograph is whole ---------------------------------------- */
section('the species photo shows whole, at its own aspect ratio');

const h = await widgetPage(browser, 'month', { width: 390, height: 900, sitekit: true });
await h.page.evaluate(() => { const t = document.querySelector('.dccwl-tile'); if (t) { t.click(); } });
await h.page.waitForTimeout(600);
const photo = await h.page.evaluate(() => {
  const img = document.querySelector('.dccwl-sheet .dccwl-photo');
  if (!img) { return null; }
  const r = img.getBoundingClientRect();
  return {
    fit: getComputedStyle(img).objectFit,
    natural: img.naturalWidth / img.naturalHeight,
    shown: r.width / r.height,
    credit: !!document.querySelector('.dccwl-sheet .dccwl-photo-credit'),
  };
});
check(!!photo, 'the sheet shows a photograph');
if (photo) {
  note(JSON.stringify(photo));
  check('cover' !== photo.fit, 'it is not cropped to fill a fixed box', photo.fit);
  check(Math.abs(photo.natural - photo.shown) < 0.02,
    'and it keeps its own aspect ratio', `${photo.natural.toFixed(3)} vs ${photo.shown.toFixed(3)}`);
  check(photo.credit, 'the credit line is still under it');
}
await h.page.close();

/* ---- 4. THE DIRECTOR'S REPRO: "snake" at 390px (1.37.1) ---------------- */
section('a search leaves no deck with an empty column — "snake" at 390px');

/*
 * The exact case he re-measured on a fresh load: Wildlife, type "snake", and
 * TWO decks show — the main guide deck (15 matches) and the Safety deck (3:
 * Eastern Diamondback, Dusky Pygmy Rattlesnake, Eastern Coral Snake). The
 * Safety deck had three rows and three matches, so it filled ONE column and
 * left the second empty. Three items in three rows IS one column; the row
 * count was the policy that had to change, not the grid.
 *
 * The bar this holds, in Rob's words: tiles always fill both columns. Stated
 * as something a test can ask — a deck showing two or more tiles, on a
 * viewport where two or more columns fit, must USE two or more columns.
 *
 * 1.37.2 adds his answer to how that should READ. A deck whose matches all
 * fit on screen stops being a deck: it wraps as an ordinary grid, left to
 * right and top to bottom, and its pager goes with the scroll it no longer
 * needs. So the three snakes must read Diamondback, Dusky Pygmy, Coral — the
 * order of the list — and not the column-major Diamondback, Coral, Dusky the
 * swipe deck produced.
 */
const sh = await widgetPage(browser, 'canal', { width: 390, height: 844, sitekit: true });
await sh.page.evaluate(() => { const g = document.querySelector('.dccwl-hub-tile'); if (g) { g.click(); } });
await sh.page.waitForTimeout(800);
await sh.page.evaluate(() => {
  const i = document.querySelector('.dccwl-search-input');
  i.value = 'snake';
  i.dispatchEvent(new Event('input', { bubbles: true }));
});
await sh.page.waitForTimeout(700);

const decks = await sh.page.evaluate(() => Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
  .filter((g) => g.offsetParent !== null)
  .map((g) => {
    const vis = Array.from(g.children).filter((li) => !li.hidden);
    if (!vis.length) { return null; }
    const byCol = new Map();
    vis.forEach((li) => {
      const x = Math.round(li.getBoundingClientRect().left);
      byCol.set(x, (byCol.get(x) || 0) + 1);
    });
    const w = vis[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
    const nav = g.nextElementSibling;
    return {
      group: g.getAttribute('data-dccwl-group'),
      n: vis.length,
      cols: [...byCol.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]),
      fits: Math.max(1, Math.floor((g.clientWidth + gap) / (w + gap))),
      wrapped: g.classList.contains('dccwl-deck-wrap'),
      overflows: g.scrollWidth > g.clientWidth + 4,
      navShown: nav && nav.classList.contains('dccwl-deck-nav') ? !nav.hidden : null,
      names: vis.map((li) => (li.textContent || '').trim().split('\n')[0].trim()),
      // what a guest reads: top to bottom, left to right within a row
      reading: vis.map((li) => {
        const r = li.getBoundingClientRect();
        return { t: (li.textContent || '').trim().split('\n')[0].trim(), x: Math.round(r.left), y: Math.round(r.top) };
      }).sort((a, b) => a.y - b.y || a.x - b.x).map((o) => o.t),
    };
  })
  .filter(Boolean));

note(JSON.stringify(decks.map((d) => ({ g: d.group, n: d.n, cols: d.cols }))));
checkAtLeast(2, decks.length, 'the search shows the guide deck AND the safety deck');

for (const d of decks) {
  if (d.n < 2 || d.fits < 2) { continue; }
  checkAtLeast(2, d.cols.length,
    `${d.group}: ${d.n} matches fill at least two columns, never one`, JSON.stringify(d.cols));
}

const safety = decks.filter((d) => 'safety' === d.group)[0];
check(!!safety, 'the safety deck is one of them');
if (safety) {
  checkSame(3, safety.n, 'it holds the three venomous snakes');
  checkSame([2, 1], safety.cols, 'laid out two then one — both columns in use');
  check(safety.wrapped, 'and as an ordinary grid, because they all fit on screen');
  checkSame(false, safety.overflows, 'so there is nothing to scroll sideways');
  checkSame(false, safety.navShown, 'and no pager, because there are no pages');
  /* HIS ORDER, NAMED. A looser check — "the three are present" — passed on
   * the column-major layout he rejected, which is why this one spells the
   * sequence out. */
  checkSame(
    ['Eastern Diamondback Rattlesnake', 'Dusky Pygmy Rattlesnake', 'Eastern Coral Snake'],
    safety.reading,
    'reading left to right, top to bottom, in list order'
  );
}

/* The deck that DOES overflow keeps being a deck. */
const guide = decks.filter((d) => 'animals' === d.group)[0];
if (guide) {
  checkSame(false, guide.wrapped, '15 matches do not fit, so that deck still swipes');
  checkSame(true, guide.navShown, 'and keeps its pager');
}
await sh.page.close();

await browser.close();
done();
