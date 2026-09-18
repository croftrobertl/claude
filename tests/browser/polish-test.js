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
    // The REAL markup, extracted from the PHP: loose hand-built buttons have
    // no .mphbac-filter-actions / .mphbac-sheet-actions row around them, so
    // the row-alignment selectors below would quietly match nothing and the
    // checks would pass on empty arrays.
    await p.setContent(H.page({
      body: H.filtersHtml() + `
        <div class="mphbac-nav"><button class="mphbac-nav-btn mphbac-nav-next" aria-label="Next">&gt;</button></div>
        <a class="mphbac-info-view-link" href="#">View</a>`,
      sheet: H.sheetHtml(),
    }));
    for (const sel of ['.mphbac-btn-apply', '.mphbac-nav-next', '.mphbac-sheet-close', '.mphbac-info-view-link']) {
      const before = await p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
      await p.hover(sel); await p.waitForTimeout(250);
      const after = await p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
      check(`ON TOUCH ${sel} keeps its resting fill — iOS would make a change stick`,
        after === before, { before, after });
    }
    const taps = await p.evaluate(() => {
      // A zero-width inline-block inside the control sits ON the text
      // baseline, so its bottom edge gives the baseline offset. Growing one
      // control's box is the classic way to knock a row out of alignment
      // with nothing reporting an error.
      const baseline = el => {
        const s = document.createElement('span');
        s.textContent = 'x';
        s.style.cssText = 'display:inline-block;width:0;overflow:hidden;font:inherit';
        el.appendChild(s);
        const bl = s.getBoundingClientRect().bottom;
        s.remove();
        return +bl.toFixed(2);
      };
      // How far the text's own line box sits from the centre of the control.
      // A row-relative baseline check cannot see a label that is no longer
      // vertically centred: if every button in the row shifts by the same
      // amount they stay aligned with each other while all of them are wrong.
      const offCentre = el => {
        const s = document.createElement('span');
        s.textContent = 'x';
        s.style.cssText = 'display:inline-block;width:0;overflow:hidden;font:inherit';
        el.appendChild(s);
        const sr = s.getBoundingClientRect(), er = el.getBoundingClientRect();
        s.remove();
        return +((sr.top + sr.bottom) / 2 - (er.top + er.bottom) / 2).toFixed(2);
      };
      const read = sel => [...document.querySelectorAll(sel)].map(el => {
        const r = el.getBoundingClientRect();
        return { sel, w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                 baseline: baseline(el), offCentre: offCentre(el) };
      });
      return {
        actions: [...read('.mphbac-filter-actions .mphbac-btn'), ...read('.mphbac-sheet-actions .mphbac-btn')],
        filterRow: read('.mphbac-filter-actions .mphbac-btn'),
        sheetRow: read('.mphbac-sheet-actions .mphbac-btn'),
        nav: read('.mphbac-nav-btn'),
        field: read('.mphbac-input-checkin'),
      };
    });
    /* 44px IS THE FLOOR, NOT THE TARGET. This assertion used to sit at 40,
     * which is why shipping the fix would not have broken it — a guard set
     * below the standard it exists to enforce sits green through the next
     * regression too. It is at 44 now, and the buttons are at 46 so a
     * sub-pixel rounding or an upstream font change has somewhere to go.
     * Measured before 0.34.0: 41.4px in the filter row, 36.8px in the
     * booking popup, which sits in a smaller font context. */
    const all = [...taps.actions, ...taps.nav, ...taps.field];
    check('every tappable control clears the 44px floor',
      all.length >= 5 && all.every(t => t.w >= 44 && t.h >= 44),
      all.filter(t => t.w < 44 || t.h < 44));
    check('...and the action buttons carry headroom above it rather than sitting on 44.0',
      taps.actions.every(t => t.h > 44), taps.actions.map(t => t.h));
    for (const [name, row] of [['filter', taps.filterRow], ['popup', taps.sheetRow]]) {
      // row.length === 2 is load-bearing: a selector that matches nothing
      // would otherwise satisfy `every()` and pass on an empty array.
      check(`the ${name} action buttons still share a baseline after growing`,
        row.length === 2 && Math.abs(row[0].baseline - row[1].baseline) < 0.5,
        { found: row.length, baselines: row.map(r => r.baseline) });
    }
    check('the label stays vertically centred in the taller box',
      taps.actions.every(t => Math.abs(t.offCentre) <= 1.5),
      taps.actions.map(t => t.offCentre));
    // min-height, not height: a label that wraps must grow, not clip.
    const wrap = await p.evaluate(() => {
      const b = [...document.querySelectorAll('.mphbac-sheet-actions .mphbac-btn')].pop();
      // Long enough to wrap at ANY width this suite runs at — a label that
      // happens to fit makes the check pass without exercising the wrap.
      b.textContent = 'Book Now for four guests across seven nights in Cottage 22';
      const r = b.getBoundingClientRect();
      return { h: +r.height.toFixed(1), clipped: b.scrollHeight > b.clientHeight + 1 };
    });
    check('a wrapping label grows the button instead of being clipped — min-height, not height',
      wrap.h > 46 && !wrap.clipped, wrap);
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
