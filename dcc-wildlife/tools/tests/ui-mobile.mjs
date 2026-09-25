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
checkAtLeast(4, tabs.length, 'the four category tabs are present');
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
await browser.close();
done();
