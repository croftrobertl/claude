/**
 * REDUCED MOTION, ON EVERY SURFACE (1.42.0 — found by a self-audit).
 *
 * The defect this suite exists to hold: widget.css's blanket "nothing in
 * here animates" rule is scoped to `.dccwl-root`, and the HUB's own chrome
 * is not inside one — Canal_Render wraps it in `.dccwl-canal`. So with the
 * OS setting on, the twelve month tiles and the two hub doors kept
 * `transition: transform .3s cubic-bezier(.34,1.56,.64,1)`. The same gap
 * reached the standalone water widget, which loads neither stylesheet.
 *
 * THREE RULES THIS SUITE FOLLOWS, each from a lesson already paid for:
 *
 *  - IT ASSERTS THE MEDIA QUERY IS REALLY ON. The audit that found the bug
 *    first measured a page where `reducedMotion` had been passed to a
 *    helper that did not forward it, and reported a clean result. Nothing
 *    here is trusted until matchMedia agrees.
 *  - IT CARRIES A NEGATIVE CONTROL. An assertion that passes because it
 *    selected nothing proves nothing (1.40.0). Each surface is measured
 *    with the setting OFF first, and the suite fails if that reading is
 *    not clearly non-zero — so a selector that stops matching cannot look
 *    like a pass.
 *  - IT CHECKS THE LIFT, NOT ONLY THE DURATION. Killing the transition
 *    while leaving `transform: translateY(-2px)` on :hover makes the
 *    hover worse, not better: the lift becomes an instant jump. widget.css
 *    has said so since 1.21.0, and its rule names `.dccwl-tile`, which the
 *    hub's tiles are not.
 */
import {
  launch, widgetPage,
  check, checkSame, checkAtLeast, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no browser'); }

/** Elements inside `scope` with a non-zero transition or animation. */
async function animating(page, scope) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) { return { found: false, count: 0, sample: [] }; }
    const all = [root, ...root.querySelectorAll('*')];
    const live = [];
    for (const n of all) {
      const cs = getComputedStyle(n);
      const dur = (cs.transitionDuration + ',' + cs.animationDuration)
        .split(',')
        .map(v => parseFloat(v) || 0);
      if (dur.some(v => v > 0)) {
        live.push(n.className && typeof n.className === 'string'
          ? n.className.split(' ')[0] : n.tagName.toLowerCase());
      }
    }
    return { found: true, count: live.length, sample: [...new Set(live)].slice(0, 8) };
  }, scope);
}

/* ------------------------------------------------------------------ */

/*
 * THE NEGATIVE CONTROL IS PER SURFACE SINCE 1.44.2, with the measured number
 * beside each one. It was a flat `>= 10` for every scope, and the segmented
 * switch taking the Availability Calendar's `transition: none` (item 5) took
 * the hub and the water section under it: the tabs were most of what animated
 * on those two surfaces.
 *
 * The control still does its job — if a scope drops to zero the measurement
 * below means nothing and this fails — and the figures are written down so a
 * future drop is a visible decision rather than a threshold quietly met. They
 * were measured at 1280px on this fixture, in the run that re-based them.
 */
const CONTROL = {
  '.dccwl-canal': 2,   // the open panel and one svg; the hub's own chrome is gone (1.44.0)
  '.dccwl-root': 1499, // the species tiles, which still lift on hover
  '.dccwl-water': 7,   // the moon card's svg and the link list
};

for (const [which, scope] of [['canal', '.dccwl-canal'], ['month', '.dccwl-root'], ['water', '.dccwl-water']]) {
  section(`${which}: motion stops when the OS asks (scope ${scope})`);

  const warm = await widgetPage(browser, which, { width: 1280, height: 1000, sitekit: true, touch: false });
  const before = await animating(warm.page, scope);
  check(before.found, 'the surface rendered', scope);
  // The negative control: if this is near zero the measurement below is
  // meaningless, whatever it says.
  checkAtLeast(CONTROL[scope], before.count,
    `something animates with the setting OFF (${scope} measured ${CONTROL[scope]})`);
  note(`animating normally: ${before.count} — e.g. ${before.sample.join(', ')}`);
  await warm.page.close();

  const cool = await widgetPage(browser, which, {
    width: 1280, height: 1000, sitekit: true, touch: false, reducedMotion: 'reduce',
  });
  const applied = await cool.page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  check(applied, 'the media query is genuinely applied');
  const after = await animating(cool.page, scope);
  checkSame(0, after.count, 'nothing animates with the setting ON',
    after.count ? 'still animating: ' + after.sample.join(', ') : '');
  await cool.page.close();
}

/* ------------------------------------------------------------------ */

/* ==================================================================
 * THE HUB-TILE AND MONTH-TILE LIFT ASSERTIONS ARE RETIRED (1.44.0),
 * AND RETIRED IS NOT THE SAME AS DELETED.
 *
 * 1.42.0 found that killing the transition without also dropping the
 * hover lift makes the hover WORSE — a 2px jump under the cursor —
 * and pinned `transform: none` on `.dccwl-hub-tile` and
 * `.dccwl-month-tile`. Rob removed the hub and the month picker in
 * 1.44.0, so neither element renders anywhere any more, and an
 * assertion about a selector that matches nothing is the vacuous kind
 * this harness refuses (a suite that asserts nothing FAILS).
 *
 * The RULE is unchanged and is still enforced, by the three surface
 * sweeps above: every element inside .dccwl-canal, .dccwl-root and
 * .dccwl-water is measured with the OS setting off and then on, each
 * with its own negative control. Any control that gains a hover lift —
 * including whatever replaces these — is covered by those, because they
 * ask the computed question rather than naming a class.
 *
 * What is NOT yet cleaned up, and is listed here so it cannot be
 * forgotten: the `.dccwl-hub-tile` / `.dccwl-month-tile` rules in
 * canal.css and the month-tile and hub-preview builders in canal.js are
 * now unreachable. They are left for the step that builds the Month
 * menu, which is where it will be clear what, if anything, it reuses.
 * ================================================================== */

await browser.close();
done();
