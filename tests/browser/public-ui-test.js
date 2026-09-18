'use strict';
/**
 * The public widget's rendered grid: the cottage column, the header label and
 * the row structure.
 *
 * AND THE PORTAL SWEEP. Six tokens were consumed by rules that only match
 * inside the portaled popup, and none of them resolved there. That is not a
 * one-off: any token declared on .mphbac-root alone is invisible to the
 * booking and info popups the moment they open. This suite checks the whole
 * set rather than the instances that happened to be noticed.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const code = H.cssCode(), php = H.php();

const GRID = `
  <div class="mphbac-grid-wrap"><div class="mphbac-grid">
    <div class="mphbac-row mphbac-row-header">
      <div class="mphbac-cell mphbac-cell-label">Cottages</div>
      <div class="mphbac-cell mphbac-cell-day"><span class="mphbac-d-dow">Mo</span><span class="mphbac-d-num">7</span></div>
    </div>
    <div class="mphbac-row" style="--mphbac-row-i:0">
      <button class="mphbac-cell mphbac-cell-label mphbac-row-toggle mphbac-row-toggle--info">
        <span class="mphbac-label-num">#22</span><span class="mphbac-label-abbrev">Boathouse</span></button>
      <div class="mphbac-cell mphbac-cell-status is-available"><span class="mphbac-day-num">7</span></div>
    </div>
    <div class="mphbac-row mphbac-row-last" style="--mphbac-row-i:1">
      <button class="mphbac-cell mphbac-cell-label mphbac-row-toggle mphbac-row-toggle--info">
        <span class="mphbac-label-num">#31</span><span class="mphbac-label-abbrev">Hibiscus</span></button>
      <div class="mphbac-cell mphbac-cell-status is-booked"><span class="mphbac-day-num">8</span></div>
    </div>
  </div></div>`;

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async (w = 1280) => {
    const p = await browser.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ body: GRID, sheet: H.sheetHtml() }));
    return p;
  };

  console.log('-- the cottage column --');
  {
    const p = await open();
    const m = await p.evaluate(() => {
      const t = document.querySelector('.mphbac-row-toggle');
      const num = t.querySelector('.mphbac-label-num'), ab = t.querySelector('.mphbac-label-abbrev');
      return { numFirst: t.firstElementChild.className.includes('label-num'),
               numText: num.textContent, abText: ab.textContent,
               numDisplay: getComputedStyle(num).display, abDisplay: getComputedStyle(ab).display,
               clipped: t.scrollWidth > t.clientWidth + 1,
               header: document.querySelector('.mphbac-row-header .mphbac-cell-label').textContent };
    });
    check('the NUMBER span comes first in the DOM', m.numFirst, m);
    check('the number is rendered as "#22", not a bare 22', m.numText === '#22', m.numText);
    check('both lines render — the name is not hidden on any width since 0.23.5',
      m.numDisplay !== 'none' && m.abDisplay !== 'none', m);
    check('the label is not clipped at desktop width', !m.clipped, m);
    check('the header carries the configurable property label', m.header === 'Cottages', m.header);
    await p.close();
  }
  {
    // The header label is a STRING CONTROL, so it must not be baked in.
    check('the header label comes from a setting, not a literal in the markup',
      /str_property/.test(php) && !/>Cottages</.test(php));
  }

  console.log('\n-- row structure --');
  {
    const p = await open();
    const m = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.mphbac-row:not(.mphbac-row-header)')];
      return rows.map(r => ({ i: getComputedStyle(r).getPropertyValue('--mphbac-row-i').trim(),
                              last: r.classList.contains('mphbac-row-last') }));
    });
    check('each row publishes its index, which the scale stacking depends on',
      m.every(r => r.i !== ''), m);
    check('the last row is marked, so it can drop its overhang', m[m.length - 1].last === true, m);
    await p.close();
  }

  console.log('\n-- phone: the column keeps both lines --');
  {
    const p = await open(360);
    const m = await p.evaluate(() => {
      const t = document.querySelector('.mphbac-row-toggle');
      return { abDisplay: getComputedStyle(t.querySelector('.mphbac-label-abbrev')).display,
               overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check('the cottage NAME still renders at 360px', m.abDisplay !== 'none', m);
    check('...and the grid still does not scroll sideways', !m.overflow, m);
    await p.close();
  }

  console.log('\n-- THE PORTAL SWEEP: no rule inside a popup may depend on a root-only token --');
  {
    const p = await open();
    const bad = await p.evaluate(() => {
      const root = getComputedStyle(document.querySelector('.mphbac-root'));
      const sheet = getComputedStyle(document.querySelector('.mphbac-sheet'));
      return { root: Object.create(null), sheet: Object.create(null) };
    });
    // Compare token-by-token: anything the root resolves and the sheet does
    // not is a rule that silently does nothing once the popup opens.
    const names = [...new Set(code.match(/--(?:mphbac|dcc)-[\w-]+/g) || [])];
    const diff = await p.evaluate(ns => {
      const root = getComputedStyle(document.querySelector('.mphbac-root'));
      const sheet = getComputedStyle(document.querySelector('.mphbac-sheet'));
      return ns.filter(n => root.getPropertyValue(n).trim() !== '' && sheet.getPropertyValue(n).trim() === '');
    }, names);
    // Only the ones actually CONSUMED inside a popup matter; a token the
    // popup never reads is not a fault.
    const consumedInPopup = diff.filter(t => (code.match(new RegExp('[^{}]*\\{[^{}]*' + t + '[^{}]*\\}', 'g')) || [])
      .some(r => /mphbac-(sheet|info)/.test(r.slice(0, r.indexOf('{')))
        && !new RegExp('var\\(' + t + '\\s*,').test(r)));
    check('no token consumed inside the portaled popup fails to resolve there',
      consumedInPopup.length === 0, consumedInPopup);
    check('(instrument check) the sweep really found tokens to compare', names.length > 20, names.length);
    await p.close();
  }

  console.log('\n-- the layout properties did NOT follow the tokens onto the sheet --');
  {
    const p = await open();
    const m = await p.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.mphbac-sheet'));
      const r = getComputedStyle(document.querySelector('.mphbac-root'));
      return { sheetPosition: s.position, rootPosition: r.position,
               sheetWidth: s.width, rootWidth: r.width };
    });
    check('the sheet keeps its own positioning, not the root\'s',
      m.sheetPosition !== 'static' && m.sheetWidth !== m.rootWidth, m);
    await p.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
