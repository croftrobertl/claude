'use strict';
/**
 * The booking sheet's estimate block, as rendered.
 *
 * TWO THINGS THE STYLESHEET MUST DO AND THE PORTAL BREAKS. The sheet is moved
 * to <body> when the popup opens, so any .mphbac-root-scoped rule stops
 * matching at exactly the moment the block becomes visible — every rule here
 * is class-doubled for that reason. And `hidden` must actually hide: the UA
 * stylesheet's [hidden]{display:none} loses to any author display rule, which
 * this project has already shipped a live bug over.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const code = H.cssCode(), js = H.js();

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async (w = 393) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, isMobile: w < 800, hasTouch: w < 800 });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    // PORTALED, as live: the sheet sits outside .mphbac-root.
    await p.setContent(H.page({ body: H.filtersHtml(), sheet: H.sheetHtml() }));
    return { ctx, p };
  };

  console.log('-- hidden really hides, and unhiding really shows --');
  {
    const { ctx, p } = await open();
    const st = await p.evaluate(() => {
      const est = document.querySelector('.mphbac-sheet-estimate');
      est.hidden = true;
      const hidden = { attr: est.hidden, display: getComputedStyle(est).display,
                       h: est.getBoundingClientRect().height };
      est.hidden = false;
      const shown = { display: getComputedStyle(est).display, h: est.getBoundingClientRect().height };
      return { hidden, shown };
    });
    check('with [hidden] set, the COMPUTED display is none and it occupies no height',
      st.hidden.attr === true && st.hidden.display === 'none' && st.hidden.h === 0, st.hidden);
    check('without it, the block lays out', st.shown.display !== 'none' && st.shown.h > 0, st.shown);
    check('the markup ships it hidden, so nothing flashes before a price arrives',
      /<p class="mphbac-sheet-estimate"[^>]*\shidden/.test(H.php()));
  }

  console.log('\n-- it is announced, and it is centred --');
  {
    const { ctx, p } = await open();
    const m = await p.evaluate(() => {
      const est = document.querySelector('.mphbac-sheet-estimate');
      est.hidden = false;
      const c = getComputedStyle(est);
      return { live: est.getAttribute('aria-live'), align: c.textAlign, basis: c.flexBasis,
               noteDisplay: getComputedStyle(est.querySelector('.mphbac-estimate-note')).display,
               portaled: !est.closest('.mphbac-root') };
    });
    check('aria-live=polite, so a price change is announced without stealing focus',
      m.live === 'polite', m.live);
    check('THE BLOCK IS PORTALED in this fixture (instrument check)', m.portaled === true);
    check('...and it is still centred there — the rule is class-doubled, not root-scoped',
      m.align === 'center', m.align);
    check('it spans the sheet\'s flex row rather than sharing a line with a date field',
      m.basis === '100%', m.basis);
    check('the note renders on its own line beneath the amount',
      m.noteDisplay === 'block', m.noteDisplay);
  }

  console.log('\n-- the label sits on its own row --');
  {
    const { ctx, p } = await open();
    await p.addScriptTag({ content: js });
    const rows = await p.evaluate(() => {
      const line = document.querySelector('.mphbac-estimate-line');
      line.innerHTML = '<strong class="mphbac-estimate-label">Estimated total:</strong> '
        + '<span><span class="mphbac-estimate-amount">$910</span> for 7 nights</span>';
      const label = line.querySelector('.mphbac-estimate-label');
      const amount = line.querySelector('.mphbac-estimate-amount');
      return { labelDisplay: getComputedStyle(label).display,
               labelTop: Math.round(label.getBoundingClientRect().top),
               amountTop: Math.round(amount.getBoundingClientRect().top) };
    });
    check('the label is a block, so the amount falls to the next line',
      rows.labelDisplay === 'block', rows.labelDisplay);
    check('...and it measurably does', rows.amountTop > rows.labelTop, rows);
  }

  console.log('\n-- the estimate never blocks the booking --');
  {
    check('a price of zero or a failure hides the row rather than showing $0',
      /price\s*<=\s*0|!d\.priceHtml|d\.price\s*>\s*0/.test(js),
      'estimate is advisory only');
    check('the Confirm flow does not wait on the estimate',
      !/await[\s\S]{0,80}scheduleEstimate/.test(js));
    check('the request is debounced and last-write-wins, so a quick date change coalesces',
      /AbortController/.test(js) && /setTimeout/.test(js));
  }

  console.log('\n-- every rule here survives the portal --');
  {
    // A .mphbac-root-scoped rule for any of these selectors would stop
    // matching the moment the popup opens — which is the only moment they
    // are visible.
    const scoped = (code.match(/\.mphbac-root[^{]*\.mphbac-(sheet-estimate|estimate-line|estimate-note|estimate-label)[^{]*\{/g) || []);
    check('no estimate rule depends on a .mphbac-root ancestor', scoped.length === 0, scoped);
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
