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

for (const [which, scope] of [['canal', '.dccwl-canal'], ['month', '.dccwl-root'], ['water', '.dccwl-water']]) {
  section(`${which}: motion stops when the OS asks (scope ${scope})`);

  const warm = await widgetPage(browser, which, { width: 1280, height: 1000, sitekit: true, touch: false });
  const before = await animating(warm.page, scope);
  check(before.found, 'the surface rendered', scope);
  // The negative control: if this is near zero the measurement below is
  // meaningless, whatever it says.
  checkAtLeast(10, before.count, 'something animates with the setting OFF');
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

section('the hub tiles drop the lift as well as the transition');

const hub = await widgetPage(browser, 'canal', {
  width: 1280, height: 1000, sitekit: true, touch: false, reducedMotion: 'reduce',
});
const lift = await hub.page.evaluate(() => {
  const out = {};
  for (const sel of ['.dccwl-hub-tile', '.dccwl-month-tile']) {
    const n = document.querySelector(sel);
    if (!n) { out[sel] = 'absent'; continue; }
    // :hover cannot be forced from script, so read what the stylesheet
    // declares for it rather than what is computed on a resting element.
    let found = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      const walk = (list, inRM) => {
        for (const r of list) {
          if (r.media) { walk(r.cssRules, inRM || /prefers-reduced-motion/.test(r.conditionText || r.media.mediaText)); continue; }
          if (!inRM || !r.selectorText) { continue; }
          if (r.selectorText.includes(sel) && r.selectorText.includes(':hover')
              && r.style && r.style.transform) {
            found = r.style.transform;
          }
        }
      };
      walk(rules, false);
    }
    out[sel] = found;
  }
  return out;
});
note(JSON.stringify(lift));
checkSame('none', lift['.dccwl-hub-tile'], 'the hub door drops its hover lift');
checkSame('none', lift['.dccwl-month-tile'], 'the month tile drops its hover lift');
await hub.page.close();

await browser.close();
done();
