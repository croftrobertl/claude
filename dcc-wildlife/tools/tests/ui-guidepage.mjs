/**
 * /wildlife-guide/ MEASURED BY ITS RESULT, NEVER BY ITS SELECTOR (1.44.0).
 *
 * WHY THIS SUITE EXISTS, in the Director's words: "this is the fifth time
 * this pattern has bitten, so it needs a guard that can't pass when the rule
 * silently matches nothing."
 *
 * The pattern: a rule written for the wrong parent is invisible, and the
 * thing it was meant to govern keeps doing what it always did. The five —
 * 1.23.0 (deck layout scoped to .dccwl-tiles), 1.39.0 (the disclosure marker
 * in the wrong stylesheet), 1.40.0 (the wind badge keyed to the canvas when
 * it is appended to the shell), 1.40.1 (the fold component), and 1.44.0's
 * own: `.dccwl-app .dccwl-guidepage` is a DESCENDANT selector and the
 * container carries BOTH classes, so the reading measure never applied and
 * the prose ran about 1,950px per line on live.
 *
 * A suite that greps the stylesheet for a selector would have passed
 * throughout. So nothing here reads CSS. Every assertion measures the
 * rendered page:
 *
 *  - the line length in CHARACTERS, which is what a reading measure is, and
 *    which is independent of this sandbox having no Raleway;
 *  - that the measure STOPS GROWING between 1280 and 1920, because a cap
 *    that is merely large would satisfy a character count at one width;
 *  - the computed scroll-margin-top on a species heading, which was under
 *    the same dead selector and was equally not in force.
 *
 * The 1920 assertion is the negative control: without a working cap the
 * paragraph fills the viewport and the character count runs far past 72.
 */
import {
  launch, widgetPage,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no browser'); }

/** Measure one width: characters per line, and the anchor's scroll margin. */
async function measure(w) {
  const { page } = await widgetPage(browser, 'guide', {
    width: w, height: 900, sitekit: true, touch: w < 700,
  });
  const m = await page.evaluate(() => {
    /*
     * 1.46.0: THE ENTRY IS INSIDE A CLOSED <details> UNTIL SOMEBODY OPENS
     * IT, so it has no box and no measure. Opening the first one is the
     * no-JavaScript reading path — exactly what a visitor without the
     * script gets — and it is the path this measure governs.
     */
    const fold = document.querySelector('[data-dccwl-gp-details]');
    if (fold) { fold.open = true; }
    const para = document.querySelector('article.dccwl-fg .dccwl-fg-fact');
    const art = document.querySelector('article.dccwl-fg');
    if (!para || !art) { return null; }
    const cs = getComputedStyle(para);

    /*
     * Characters, from the font ACTUALLY RENDERING. A pixel width would be
     * a claim about Raleway, which this container does not have — the
     * standing trap. The "0" advance is what `ch` means, so this measures
     * the same thing the stylesheet asks for.
     */
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(100);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
    probe.style.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
    document.body.appendChild(probe);
    const ch = probe.getBoundingClientRect().width / 100;
    probe.remove();

    const paraW = para.getBoundingClientRect().width;
    return {
      chars: ch > 0 ? Math.round(paraW / ch) : null,
      px: Math.round(paraW),
      scrollMargin: Math.round(parseFloat(getComputedStyle(art).scrollMarginTop) || 0),
      viewport: window.innerWidth,
    };
  });
  await page.close();
  return m;
}

section('the reading measure, in characters, on the rendered page');

const at390 = await measure(390);
const at1280 = await measure(1280);
const at1920 = await measure(1920);
/*
 * 2400 IS THE NEGATIVE CONTROL'S NEW HOME (1.46.0). The page is two
 * columns from 900px up, so the 70ch-per-column cap does not bind until
 * about 1640px — below that the VIEWPORT is the limit and a pair of equal
 * widths would prove nothing about the cap. Measured where it binds.
 */
const at2400 = await measure(2400);

check(!!at390 && !!at1280 && !!at1920 && !!at2400, 'the guide page rendered at all four widths');
if (!at390 || !at1280 || !at1920 || !at2400) {
  await browser.close();
  done();
}

[[390, at390], [1280, at1280], [1920, at1920], [2400, at2400]].forEach(([w, m]) => {
  note(`${w}px -> ${m.chars} characters (${m.px}px), scroll-margin-top ${m.scrollMargin}px`);
});

/*
 * A PHONE IS NARROWER THAN THE MEASURE, so the viewport caps it there and
 * the number is small. Asserted as a RANGE rather than a figure: the exact
 * count moves with the face, and pinning it would make this suite fail on a
 * container that happened to have a different fallback.
 */
checkAtLeast(20, at390.chars, '390px: the phone line is at least 20 characters');
checkAtMost(45, at390.chars, '390px: and not more than 45 — the viewport is the limit here');

/*
 * THE DESKTOP MEASURE, re-stated for a page that is TWO columns from 900px
 * (1.46.0, Rob's pick: the list on the left, the species on the right).
 *
 * The Director's 68-72 characters was a target for a single column of
 * prose and it still is — at 1920 and beyond, where the cap binds. At 1280
 * each column gets about half of a 1280px viewport, so the honest floor
 * there is "a readable column", not the full measure: a two-column layout
 * cannot give both columns 70 characters on a 1280px screen, and the
 * alternative — one column of prose beside nothing — is the page he
 * replaced.
 */
checkAtLeast(45, at1280.chars, '1280px: each column is at least 45 characters');
checkAtMost(78, at1280.chars, '1280px: and at most 78 — never a full-width line');
checkAtLeast(60, at1920.chars, '1920px: the full measure, at least 60 characters');
checkAtMost(78, at1920.chars, '1920px: and at most 78');

/*
 * THE NEGATIVE CONTROL, and it is the assertion the dead selector failed
 * in 1.44.0. With no cap in force the paragraph fills whatever it is
 * given, so 2400 would be about 1.25x the 1920 line. Equal widths prove a
 * cap is actually holding rather than the viewport merely being generous.
 */
checkSame(at1920.px, at2400.px,
  'the column STOPS GROWING between 1920 and 2400 — a cap is in force',
  `${at1920.px}px vs ${at2400.px}px`);

section('an anchored species heading clears a sticky header');

/*
 * Also under the dead selector until 1.44.0, so also never in force. The
 * value is the sticky-offset token plus a gutter; the token is 0 in this
 * container, so what is asserted is that the declaration REACHES the
 * element, not a site-specific pixel count.
 */
checkAtLeast(8, at1280.scrollMargin,
  'scroll-margin-top is applied to a species article', `${at1280.scrollMargin}px`);
checkSame(at1280.scrollMargin, at390.scrollMargin,
  'and it is the same at phone width');

await browser.close();
done();
