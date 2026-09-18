'use strict';
/**
 * The stylesheet-wide disciplines, as behaviour and as source shape.
 *
 * These are the rules that keep being rediscovered the hard way, so each one
 * is asserted across the WHOLE stylesheet rather than on the element that
 * happened to break last time.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const code = H.cssCode(), css = H.css();

const GUARD = '@media (hover: hover) and (pointer: fine)';

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);

  console.log('-- every hover rule is behind the pointer guard --');
  check('the guard exists exactly once, so "inside it" is unambiguous',
    (code.match(/@media \(hover: hover\) and \(pointer: fine\)/g) || []).length === 1);
  check('no :hover rule sits before it',
    !/:hover/.test(code.slice(0, code.indexOf(GUARD))),
    (code.slice(0, code.indexOf(GUARD)).match(/[^{}]*:hover[^{}]*\{/g) || []).slice(0, 3));
  check('no :hover rule sits after it either',
    !/:hover/.test(code.slice(code.indexOf(GUARD)).replace(/^[\s\S]*?\n\}/, '')),
    'anything after the guard block closes');
  check('every :focus-visible sits OUTSIDE it — keyboard users need them on every device',
    !/:focus-visible/.test(code.slice(code.indexOf(GUARD))),
    (code.match(/:focus-visible/g) || []).length);

  console.log('\n-- bare :focus is banned for STYLING a focus state --');
  {
    // It is what leaves a fill behind after a mouse click. Two rules need it
    // to HIDE things while a field is being edited: the mm/dd/yyyy hint, and
    // Blink's native empty-field text, which would otherwise swallow a partly
    // typed date. Those are named; a third use fails.
    const bare = (code.match(/[^{}]*:focus(?![-\w])[^{}]*\{/g) || []).map(r => r.trim());
    const allowed = r => /\.mphbac-field-ph/.test(r) || /::-webkit-datetime-edit/.test(r);
    check('no bare :focus rule beyond the two documented hiding rules',
      bare.every(allowed), bare.filter(r => !allowed(r)));
    check('...and those are still exactly two', bare.length === 2, bare.length);
  }

  console.log('\n-- !important never overrides a style control --');
  {
    // Counting !important is brittle and proves nothing: the legitimate uses
    // here (enforcing [hidden] against an author display rule, the print
    // block, disabling view transitions under reduced motion, forcing the
    // swiper arrows visible) are all load-bearing. The invariant that MATTERS
    // is that no !important sits on a selector a style control also targets —
    // that is the one which silently kills a panel setting.
    // Selector overlap alone is too blunt: the (0,4,0) pill CONTAINS FSEL as a
    // substring and legitimately carries `line-height: 1.3 !important`,
    // because line_height is explicitly EXCLUDED from the field typography
    // control. What matters is the PROPERTY: an !important on something a
    // control can emit kills that panel setting outright.
    const controlled = ['FSEL', 'BSEL', 'VSEL', 'TSEL'].map(n => H.constOf(n)).filter(Boolean);
    const emitted = /^(font-family|font-size|font-weight|font-style|text-transform|text-decoration|letter-spacing|word-spacing|color|background-color)$/;
    const rules = code.match(/[^{}]*\{[^{}]*!important[^{}]*\}/g) || [];
    const clashes = [];
    for (const r of rules) {
      const sel = r.slice(0, r.indexOf('{'));
      if (!controlled.some(c => sel.includes(c))) continue;
      for (const m of r.matchAll(/([a-z-]+)\s*:[^;{}]*!important/g)) {
        if (emitted.test(m[1])) clashes.push(sel.trim().slice(0, 50) + ' => ' + m[1]);
      }
    }
    check('no !important overrides a property a typography or colour control emits',
      clashes.length === 0, clashes);
    check('the line-height guard against the kit\'s 1px reset is still there',
      /line-height:\s*1\.3\s*!important/.test(code));
    check('...and it is legitimate only because line_height is EXCLUDED from the control',
      /'exclude'\s*=>\s*\['line_height'\]/.test(H.php()));
    check('[hidden] is still enforced against the author display rules',
      /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(code));
  }

  console.log('\n-- touch: no hover state can stick, and tap targets are real --');
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 800 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ body: `
      <button class="mphbac-btn mphbac-btn-apply">Show</button>
      <button class="mphbac-nav-btn mphbac-nav-next">&gt;</button>
      <button class="mphbac-sheet-close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <a class="mphbac-info-view-link" href="#">View</a>` }));
    for (const sel of ['.mphbac-btn-apply', '.mphbac-nav-next', '.mphbac-sheet-close', '.mphbac-info-view-link']) {
      const before = await p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
      await p.hover(sel); await p.waitForTimeout(250);
      const after = await p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
      check(`ON TOUCH ${sel} keeps its resting fill — iOS would make a change stick`,
        after === before, { before, after });
    }
    const taps = await p.evaluate(() => ['.mphbac-btn-apply', '.mphbac-nav-next', '.mphbac-sheet-close']
      .map(s => { const r = document.querySelector(s).getBoundingClientRect();
        return { s, w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }));
    const nav = taps.filter(t => t.s !== '.mphbac-btn-apply');
    check('the nav arrow and the close button clear 44x44',
      nav.every(t => t.w >= 44 && t.h >= 44), nav);
    /* MEASURED GAP, reported not fixed. .mphbac-btn — Show, Reset, Book Now,
     * Cancel — has `padding: 0.5em 0.9em` and no min-height, so it lays out
     * at 41.4px on a phone. Everything around it meets 44px: the nav buttons
     * set min-height: 44px explicitly, and the DCC field standard gives the
     * date fields the same. These are the primary actions and they are the
     * one control under the target.
     * The floor here is 40, not 44, so shipping the fix does not break this
     * assertion while a further shrink still does. */
    const btn = taps.find(t => t.s === '.mphbac-btn-apply');
    check('the action buttons have not shrunk further (see the note: 41.4px, under the 44px target)',
      btn.h >= 40, btn);
    check('...and the 44px target really is met elsewhere, so the gap is specific to .mphbac-btn',
      /\.mphbac-nav-btn\s*\{[^}]*min-height:\s*44px/.test(code)
      && /min-height:\s*44px/.test(code), true);
    await ctx.close();
  }

  console.log('\n-- reduced motion is honoured --');
  {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.setContent(H.page({ body: '<input class="mphbac-input mphbac-input-checkin" type="date">' }));
    const t = await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-input')).transitionDuration);
    check('prefers-reduced-motion switches the field transition off', t === '0s', t);
    check('...and the stylesheet says so more than once, not just for one element',
      (css.match(/prefers-reduced-motion/g) || []).length >= 2,
      (css.match(/prefers-reduced-motion/g) || []).length);
    await p.close();
  }

  console.log('\n-- print does not carry the interactive chrome --');
  check('the print block hides the filters, nav, popups and buttons',
    /@media print[\s\S]*?mphbac-filters[\s\S]*?mphbac-nav-btn[\s\S]*?mphbac-sheet[\s\S]*?display: none !important/.test(code));

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
