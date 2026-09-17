'use strict';
/**
 * Guards 0.27.0–0.31.1 on real phones, plus the multi-month grid.
 *
 * Widths are the owner's actual devices: 320, 360, 393. The Wildlife footnote
 * shipped broken because a harness measured 361px, and 0.26.0's popup overlap
 * reproduced at 360 but NOT at 393 — a handset that looks correct is how both
 * survived. Nothing here is asserted at a width he does not hold.
 *
 * ALWAYS SET AN EXPLICIT VIEWPORT. With a 0-width one the same probe returns
 * `grid-template-columns: 0px` and one month, which reads exactly like a
 * finding and is an artifact.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const code = H.cssCode(), js = H.js();
const PHONES = [320, 360, 393];

const months = n => `<div class="mphbac-grid-wrap"><div class="mphbac-months">${
  [...Array(n)].map((_, i) => `<div class="mphbac-monthbox"><div class="mphbac-grid mphbac-monthgrid mphbac-grid--single">
     <div class="mphbac-month-title">Month ${i + 1}</div>
     ${'<div class="mphbac-cell mphbac-cell-day"><span class="mphbac-d-dow">Mo</span><span class="mphbac-d-num">7</span></div>'.repeat(7)}
     ${'<div class="mphbac-cell mphbac-cell-status is-available"></div>'.repeat(35)}
   </div></div>`).join('')}</div></div>`;

/**
 * The cottage page starves the widget: a container with a DEFINITE width plus
 * justify-items:center shrink-wraps it. BOTH are needed — and so is the
 * Elementor widget wrapper between them, because that wrapper is the grid item
 * that shrink-wraps. With any one missing the starved case silently becomes
 * the healthy one and the bug vanishes.
 */
const monthsPage = (n, starved) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}
 .elementor-container{display:grid;${starved ? 'width:1000px;margin:0 auto;justify-items:center;' : ''}}</style>
<style>${H.css()}</style></head><body>
<div class="elementor-container"><div class="elementor-widget">
  <div class="mphbac-root mphbac-single" style="--mphbac-days:7">${months(n)}</div>
</div></div></body></html>`;

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);

  console.log('-- 6 + 11: the popup row and the filter row, PORTALED --');
  // Two DIFFERENT places. One screenshot showed both, and only the popup had
  // been fixed (0.27.0), which is how they read as one bug.
  for (const w of PHONES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ body: H.filtersHtml(), sheet: H.sheetHtml() }));
    const m = await p.evaluate(() => {
      const r = el => { const b = el.getBoundingClientRect(); return { t: Math.round(b.top), l: Math.round(b.left), r: +b.right.toFixed(2) }; };
      const grid = document.querySelector('.mphbac-filters');
      return {
        sheetR: +document.querySelector('.mphbac-sheet').getBoundingClientRect().right.toFixed(2),
        sf: [...document.querySelectorAll('.mphbac-sheet-field')].map(r),
        si: [...document.querySelectorAll('.mphbac-sheet-field .mphbac-input')].map(r),
        fl: [...document.querySelectorAll('.mphbac-filter-label')].map(r),
        fi: [...document.querySelectorAll('.mphbac-filters .mphbac-input')].map(r),
        actions: r(document.querySelector('.mphbac-filter-actions')),
        tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat),
        widths: [...document.querySelectorAll('.mphbac-filters .mphbac-input')].map(i => +i.getBoundingClientRect().width.toFixed(2)),
        hostRight: +grid.parentElement.getBoundingClientRect().right.toFixed(2),
        scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    check(`6: ${w}px — the popup's two fields share one row`, m.sf[0].t === m.sf[1].t, m.sf.map(x => x.t));
    check(`6: ${w}px — and do not overlap`, m.si[0].r <= m.si[1].l, [m.si[0].r, m.si[1].l]);
    check(`6: ${w}px — nor overflow the popup's right edge`, m.si.every(x => x.r <= m.sheetR + 0.5), [m.si[1].r, m.sheetR]);
    check(`11: ${w}px — both LABELS on one row and both FIELDS on the row beneath`,
      m.fl[0].t === m.fl[1].t && m.fi[0].t === m.fi[1].t && m.fi[0].t > m.fl[0].t,
      { labels: m.fl.map(x => x.t), fields: m.fi.map(x => x.t) });
    check(`11: ${w}px — two rows, not four: each label is above its own field`,
      m.fl[0].l < m.fl[1].l && m.fi[0].r <= m.fi[1].l, { labels: m.fl.map(x => x.l), fields: m.fi.map(x => [x.l, x.r]) });
    check(`11: ${w}px — the buttons sit below both rows, and nothing scrolls sideways`,
      m.actions.t > m.fi[0].t && !m.scrollX, { actions: m.actions.t, fields: m.fi[0].t, scrollX: m.scrollX });
    // B: against the GRANTED width, not merely "they do not overlap". The
    // 18px Elementor inset is what makes this visible at 320px: without it the
    // grid gets the whole viewport and the overflow disappears.
    check(`B: ${w}px — each field renders no wider than its track`,
      m.widths.every((x, i) => x <= m.tracks[i] + 0.5), { widths: m.widths, tracks: m.tracks });
    check(`B: ${w}px — and the row ends inside its container`,
      m.si[1].r <= m.sheetR + 0.5 && m.widths.length === 2 && m.fi[1].r <= m.hostRight + 0.5,
      { lastField: m.fi[1].r, container: m.hostRight });
    // Fitting the track is not fitting the CONTENT: an over-padded picker
    // indicator once clipped the date text in a field that measured perfectly.
    const clip = await p.evaluate(() => [...document.querySelectorAll('.mphbac-input')].map(el => {
      el.value = '2026-10-05';
      return { cls: el.className.split(' ')[1], over: el.scrollWidth > el.clientWidth };
    }));
    check(`B: ${w}px — a filled-in date is not clipped in any of the four fields`,
      clip.every(x => !x.over), clip.filter(x => x.over));
    await ctx.close();
  }

  console.log('\n-- 8: months across, 2x2 at >= 1024px --');
  for (const [label, w, n, across] of [
    ['320 phone', 320, 2, 1], ['360 phone', 360, 2, 1], ['393 phone', 393, 2, 1],
    ['768 tablet portrait', 768, 2, 1], ['1023 just below', 1023, 4, 1],
    ['1024 tablet LANDSCAPE', 1024, 4, 2], ['1280 desktop', 1280, 4, 2]]) {
    const p = await browser.newPage({ viewport: { width: w, height: 1000 } });
    await p.setContent(monthsPage(n, false));
    const g = await p.evaluate(() => {
      const b = [...document.querySelectorAll('.mphbac-monthbox')];
      const tops = [...new Set(b.map(x => Math.round(x.getBoundingClientRect().top)))];
      const d = document.querySelector('.mphbac-cell-status');
      return { perRow: b.length / tops.length, rows: tops.length,
        boxW: +b[0].getBoundingClientRect().width.toFixed(1),
        dayW: +d.getBoundingClientRect().width.toFixed(1),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check(`8: ${label} => ${across} month(s) across`, g.perRow === across, g);
    check(`8: ${label} => day cells >= 30px, no page overflow`, g.dayW >= 30 && !g.overflow, g);
    if (across === 2) check(`8: ${label} => exactly 2 ROWS, not one long row`, g.rows === 2, g.rows);
    await p.close();
  }
  {
    // The cause: auto-fit inside a fit-content box is circular, so it
    // collapsed to ONE column however wide the page was. Explicit tracks
    // break that, and the shrink-wrapped widget then sizes to two months.
    const p = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await p.setContent(monthsPage(4, true));
    const g = await p.evaluate(() => {
      const b = [...document.querySelectorAll('.mphbac-monthbox')];
      const tops = [...new Set(b.map(x => Math.round(x.getBoundingClientRect().top)))];
      return { perRow: b.length / tops.length, rows: tops.length,
        widgetW: +document.querySelector('.mphbac-root').getBoundingClientRect().width.toFixed(1),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check('8: in a SHRINK-WRAPPED container it is still 2 across with no overflow', g.perRow === 2 && !g.overflow, g);
    check('8: the tracks are written EXPLICITLY, not left to auto-fit',
      /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(code)
      && !/auto-fit/.test(code));
    await p.close();
  }

  console.log('\n-- 12: hover fill and the pointer guard --');
  {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await p.setContent(H.page({ body: '<button class="mphbac-btn mphbac-btn-apply">Show</button>' }));
    await p.hover('.mphbac-btn-apply'); await p.waitForTimeout(250);
    const c = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.mphbac-btn-apply')); return [s.backgroundColor, s.color]; });
    check('12: hover fill is #F08080 with white text', c[0] === 'rgb(240, 128, 128)' && c[1] === 'rgb(255, 255, 255)', c);
    const ratio = (() => {
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const a = lum([255, 255, 255]) + 0.05, b = lum([240, 128, 128]) + 0.05;
      return +(Math.max(a, b) / Math.min(a, b)).toFixed(2);
    })();
    check('12: the measured contrast is the 2.59:1 the owner knowingly accepted', ratio === 2.59, ratio);
    await p.close();
  }

  console.log('\n-- 14: protect the first-image fix (do not regress it) --');
  check('14: the clone rebuild is still conditional on the ACTIVE slide being a clone',
    /activeIsClone = !!\(active && active\.classList\.contains\('swiper-slide-duplicate'\)\)/.test(js)
    && /params\.loop && activeIsClone && sw\.loopDestroy/.test(js));
  check('14: ...and the slider is still landed on a REAL first slide',
    /slideToLoop\(0, 0, false\)/.test(js));
  check('14: ...and Elementor handlers are still re-bound once per element',
    /dataset\.mphbacRebound === '1'/.test(js) && /runReadyTrigger/.test(js));
  check('14: the popup still FORCES the arrows visible on every viewport',
    /\.mphbac-info-body \.swiper-button-prev[\s\S]{0,200}visibility: visible !important/.test(code));
  check('14: ...and no plugin hover rule gates a swiper button',
    !/swiper[^{]*:hover/i.test(code));

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
