/**
 * Mobile layout, measured in a real browser at real phone widths.
 *
 * iPhone is the design target, so 390x844 is the default and 320x568 is the
 * floor. Every number here is read off a laid-out document — the whole point
 * is that CSS intent and CSS result are different things.
 */

import {
  launch, widgetPage, boxOf, boxesOf, styleOf, horizontalOverflow,
  check, checkAtLeast, checkAtMost, checkSame, section, note, done,
} from './lib.mjs';

const browser = await launch();

/* ------------------------------------------------------------------ 390px */
section('the guide at 390px, the iPhone target');

let { page } = await widgetPage(browser, 'month', { width: 390, height: 844 });

checkSame(0, await horizontalOverflow(page), 'the page does not scroll sideways at 390px');

const tabs = await boxesOf(page, '.dccwl-tab');
/* THREE SINCE 1.44.0, PINNED RATHER THAN LOOSENED. The row was Animals ·
 * Plants · Safety · Peak Now; Peak Now moved into the Month menu as "This
 * Month", where it reads as the month question it always was. Pinned at the
 * exact number because the claim is that the row holds the three SECTIONS
 * `Species::sections()` defines — `checkAtLeast` would pass on two. */
checkSame(3, tabs.length, 'the three section tabs are present');
const shortTab = Math.min(...tabs.map((t) => t.h));
checkAtLeast(44, shortTab, 'every tab meets the 44px touch minimum');

// The tab row is nowrap with no ellipsis, so overflow is silent. Measure it.
const tabRow = await boxOf(page, '.dccwl-tabs');
const rowRight = Math.max(...tabs.map((t) => t.x + t.w));
checkAtMost(tabRow.x + tabRow.w + 1, rowRight, 'no tab spills past the tab row');
checkAtMost(390, rowRight, 'the last tab ends inside the viewport');

// Every interactive control in the widget, not just the ones we remembered.
//
// A link sitting inside a sentence is EXEMPT, and deliberately so: WCAG 2.5.8
// excludes a target "in a sentence or whose size is otherwise constrained by
// the line-height of non-target text", because padding it to 44px would break
// the line it sits in. The exemption is applied narrowly — the anchor must
// compute to display:inline AND its parent must hold text besides the link —
// so a standalone control can never slip through it.
const targets = await page.evaluate(() => {
  const sel = 'button, a[href], input, select, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  return Array.from(document.querySelectorAll(`.dccwl-root ${sel}`))
    .filter((el) => el.offsetParent !== null || el.getClientRects().length)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const own = (el.textContent || '').trim();
      const parentText = (el.parentElement ? el.parentElement.textContent || '' : '').trim();
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.className.toString().slice(0, 44),
        w: Math.round(r.width),
        h: Math.round(r.height),
        inlineInSentence: cs.display === 'inline' && parentText.length > own.length + 4,
      };
    })
    .filter((b) => b.w > 0 && b.h > 0);
});

const tooSmall = targets.filter((b) => !b.inlineInSentence && (b.w < 44 || b.h < 44));
for (const s of tooSmall) note(`under 44px: <${s.tag}> ${s.cls} ${s.w}x${s.h}`);
checkSame(0, tooSmall.length, 'every standalone control is at least 44x44');

const exempt = targets.filter((b) => b.inlineInSentence);
note(`inline-in-sentence links exempted: ${exempt.length}`);
checkAtLeast(1, targets.length - exempt.length, 'the check saw real standalone controls, so it is not vacuous');

section('type is legible and the theme cannot shrink it');

const body = await styleOf(page, '.dccwl-app', ['font-size', 'font-weight']);
checkAtLeast(16, parseFloat(body['font-size']), 'body copy is at least 16px');

await page.close();

/* -------------------------------------------- 390px under the theme trap */
section('the same page under the Bravada trap (20px root, weight 700)');

({ page } = await widgetPage(browser, 'month', { width: 390, height: 844, hostile: true }));

const trapped = await styleOf(page, '.dccwl-app', ['font-size', 'font-weight']);
checkSame('400', trapped['font-weight'], 'the plugin resets weight to 400 despite html{font-weight:700}');
checkAtLeast(16, parseFloat(trapped['font-size']), 'body copy stays at least 16px under a 20px root');
checkSame(0, await horizontalOverflow(page), 'the trap does not introduce sideways scroll');

const trappedTabs = await boxesOf(page, '.dccwl-tab');
checkAtMost(390, Math.max(...trappedTabs.map((t) => t.x + t.w)), 'the tab row still fits under the trap');

await page.close();

/* ------------------------------------------------------------------ 320px */
section('the 320px floor');

({ page } = await widgetPage(browser, 'month', { width: 320, height: 568 }));

const overflow320 = await horizontalOverflow(page);
note(`horizontal overflow at 320px: ${overflow320}px`);
checkSame(0, overflow320, 'the page does not scroll sideways at 320px');

const tabs320 = await boxesOf(page, '.dccwl-tab');
const right320 = Math.max(...tabs320.map((t) => t.x + t.w));
note(`tab row ends at ${Math.round(right320)}px of 320px`);
checkAtMost(320, right320, 'the tab row fits at 320px');
checkAtLeast(44, Math.min(...tabs320.map((t) => t.h)), 'tabs keep their 44px height at 320px');

await page.close();

/* ------------------------------------------------------- reduced motion */
section('prefers-reduced-motion is honoured');

({ page } = await widgetPage(browser, 'month', { width: 390, height: 844 }));
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForTimeout(80);

const moving = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.dccwl-root *')) {
    const cs = getComputedStyle(el);
    const dur = (cs.transitionDuration || '0s').split(',').map((v) => parseFloat(v) || 0);
    const props = (cs.transitionProperty || '').split(',').map((v) => v.trim());
    // A colour-only transition does not move anything, so it is allowed.
    const travels = props.some((p) => /transform|top|left|margin|width|height|all/.test(p));
    if (travels && Math.max(...dur) > 0) {
      out.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 36)} ${cs.transitionProperty}`);
    }
  }
  return out.slice(0, 8);
});
for (const m of moving) note(`still travels: ${m}`);
checkSame(0, moving.length, 'nothing in the widget travels under reduced motion');

await page.close();

/* ------------------------------------------------------- the tab row's font */
section('the tab labels cannot spill, whatever face the theme serves');

// The trap this guards: the base rule is white-space:nowrap, which does not
// shrink a label that will not fit — it spills it, with no ellipsis to show for
// it. And this sandbox has no Raleway, so text measures NARROWER here than on
// the site. "Peak Now" had 14% headroom inside its share of a 320px row
// locally while live reported the row overflowing below about 335px.
//
// THE ROW HOLDS THREE TABS SINCE 1.44.0, not four: Peak Now moved into the
// Month menu as "This Month". That is slack, not licence — this suite is
// unchanged and must stay unchanged, because the longest label a tab can
// carry is still derived from the registry ("Reptiles & Amphibians" is a
// CATEGORY, but the section labels come from Species::sections() and a
// future section name is not bounded by anything this file knows).
//
// So rather than assert it merely fits at the widths we can measure, the font
// is inflated to stand in for a wider face, and the row must still hold.
// Raleway measured about 21% wider than this sandbox's fallback face on the
// 1.28.0 footnote row, so 125% is the case that must hold. 150% is carried as a
// margin probe: it records where the design finally runs out of room, without
// pretending a 50%-wider face is a requirement.
const TAB_CASES = [
  [390, 1, true], [360, 1, true], [335, 1, true], [320, 1, true],
  [320, 1.25, true], [300, 1.25, true],
  [320, 1.5, false],
];

for (const [w, inflate, required] of TAB_CASES) {
  ({ page } = await widgetPage(browser, 'month', { width: w, height: 800 }));

  if (inflate !== 1) {
    await page.addStyleTag({
      content: `.dccwl-root .dccwl-tab.dccwl-tab { font-size: ${(0.78 * inflate).toFixed(3)}rem !important; }`,
    });
    await page.waitForTimeout(60);
  }

  const m = await page.evaluate(() => {
    let spill = -1e6;
    let which = '';
    let minH = 1e6;
    for (const el of document.querySelectorAll('.dccwl-tab')) {
      const r = document.createRange();
      r.selectNodeContents(el);
      // For wrapped text this is the width of the WIDEST LINE, which is
      // exactly what has to fit.
      const textW = r.getBoundingClientRect().width;
      const cs = getComputedStyle(el);
      /*
       * THE CONTENT BOX, FRACTIONALLY (1.44.3). This read `el.clientWidth`,
       * which is an INTEGER, against a fractional text width — so it
       * manufactured up to a pixel of phantom spill the moment a segment was
       * sized to its own label (item 1): a 78.3px box reports 78, and a
       * 54.5px label inside 12px padding "spilled" 0.5px that does not
       * exist. It never showed before because every segment used to be far
       * wider than its text. Both sides are fractional now.
       */
      const box = el.getBoundingClientRect().width;
      const inner = box
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      const s = textW - inner;
      if (s > spill) { spill = s; which = (el.textContent || '').trim(); }
      minH = Math.min(minH, Math.round(el.getBoundingClientRect().height));
    }
    return { spill: +spill.toFixed(1), which, minH };
  });

  const label = inflate === 1 ? `${w}px` : `${w}px at ${Math.round(inflate * 100)}% label font`;
  note(`${label}: tightest "${m.which}" spills ${m.spill}px, shortest tab ${m.minH}px tall`);

  if (required) {
    checkAtMost(0, m.spill, `${label}: no tab label spills out of its box`);
    checkAtLeast(44, m.minH, `${label}: tabs keep their 44px height`);
    checkSame(0, await horizontalOverflow(page), `${label}: no sideways page scroll`);
  } else {
    note(`${label}: margin probe only — not a requirement`);
    checkSame(0, await horizontalOverflow(page), `${label}: even here the page does not scroll sideways`);
  }

  await page.close();
}

/* ------------------------------------------------- the peak threshold */
section('changing the peak threshold changes what the page counts');

/*
 * 1.32.0 sent this number to the browser and then compared against a literal 3
 * in six places, so the settings page described behaviour the code did not have.
 * A source lint catches a literal coming back; this catches the number failing
 * to arrive somewhere that matters, which a lint cannot see.
 */
async function peakCount(peakScore) {
  const extra = peakScore === null ? [] : [`guide:peak_score=${peakScore}`];
  const { page: pg } = await widgetPage(browser, 'month', { width: 390, height: 900 }, ...extra);
  const n = await pg.evaluate(() => {
    /*
     * CHOOSE "This Month" AND COUNT WHAT IT SHOWS.
     *
     * This read the fourth tab (`data-dccwl-group="__peak"`) until 1.44.0.
     * Peak Now is an option in the Month menu now, so the control changed
     * and the question did not: does the peak_score setting actually reach
     * the filter, or is it merely carried in the config (1.32.1)?
     *
     * The menu is opened with a real click, because the option is inside a
     * list that ships `hidden` — clicking an element in a hidden list is
     * the kind of thing that "works" in a test and not in a browser.
     */
    document.querySelector('[data-dccwl-monthbtn]').click();
    document.querySelector('[data-dccwl-month="now"]').click();
    return new Promise((resolve) => setTimeout(() => {
      const grids = Array.from(document.querySelectorAll('.dccwl-guide-grid'));
      let n = 0;
      for (const g of grids) {
        if (g.hidden) continue;
        n += Array.from(g.children).filter((li) => !li.hidden).length;
      }
      resolve(n);
    }, 250));
  });
  await pg.close();
  return n;
}

const atThree = await peakCount(null);
const atTwo = await peakCount(2);
const atOne = await peakCount(1);
note(`"This Month" tiles at threshold 3: ${atThree}, at 2: ${atTwo}, at 1: ${atOne}`);

checkAtLeast(1, atThree, '"This Month" shows something at the default threshold');
check(atTwo > atThree, 'lowering the threshold to 2 shows MORE species', `${atTwo} vs ${atThree}`);
check(atOne >= atTwo, 'and lowering it to 1 shows at least as many again', `${atOne} vs ${atTwo}`);

await browser.close();
done();
