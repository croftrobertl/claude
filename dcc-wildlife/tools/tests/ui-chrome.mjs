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

await browser.close();
done();
