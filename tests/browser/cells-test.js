'use strict';
/**
 * Guards the grid: day-number contrast (0.23.3), the cottage column's scale
 * and divider looks (0.23.9/0.24.0), the state colours, and the cell tooltip.
 *
 * THE DAY NUMBER SITS ON THE STATE FILL, so its contrast has to hold against
 * every one of them AND against their weekend variants, which composite a
 * 3.5% black overlay on top. Measured on live at 14px #7A7A7A it failed AA on
 * all three (2.61 / 1.49 / 2.41). White is NOT the fix — it is ~3.1:1 on the
 * coral.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const code = H.cssCode();

const lum = ([r, g, b]) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const ratio = (a, b) => {
  const x = lum(rgb(a)) + 0.05, y = lum(rgb(b)) + 0.05;
  return +(Math.max(x, y) / Math.min(x, y)).toFixed(2);
};

const row = (i, state, extra = '') =>
  `<div class="mphbac-row${i === 'h' ? ' mphbac-row-header' : ''}" style="--mphbac-row-i:${i === 'h' ? 0 : i}">
     <button class="mphbac-cell mphbac-cell-label mphbac-row-toggle"><span class="mphbac-label-num">#2${i}</span><span class="mphbac-label-abbrev">Cottage</span></button>
     ${i === 'h'
       ? `<div class="mphbac-cell mphbac-cell-day"><span class="mphbac-d-dow">Mo</span><span class="mphbac-d-num">7</span></div>`
       : `<div class="mphbac-cell mphbac-cell-status ${state} ${extra}"><span class="mphbac-day-num">7</span>
            <span class="mphbac-cell-tip">tip</span></div>`}
   </div>`;

const grid = variant => `<div class="mphbac-grid-wrap"><div class="mphbac-grid">
  ${row('h', '')}
  ${row(0, 'is-available')}
  ${row(1, 'is-booked')}
  ${row(2, 'is-past')}
  ${row(3, 'is-available is-weekend')}
  ${row(4, 'is-booked is-weekend')}
</div></div>`;

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async (variant = 'mphbac-namecol-scales') => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ body: grid() }).replace('class="mphbac-root"', `class="mphbac-root ${variant}"`));
    return p;
  };

  console.log('-- the day number reads on every state, weekend variants included --');
  {
    const p = await open();
    const m = await p.evaluate(() => [...document.querySelectorAll('.mphbac-cell-status')].map(cell => {
      const n = cell.querySelector('.mphbac-day-num');
      return { state: cell.className.replace('mphbac-cell mphbac-cell-status ', '').trim(),
               fill: getComputedStyle(cell).backgroundColor,
               num: getComputedStyle(n).color };
    }));
    check('there are states to check (instrument check)', m.length === 5, m.length);
    for (const c of m) {
      const r = ratio(c.num, c.fill);
      check(`day number on ${c.state} clears AA 4.5:1`, r >= 4.5, { ratio: r, num: c.num, fill: c.fill });
    }
    check('the number has its OWN token, so re-tinting a fill cannot drag it',
      /--mphbac-color-day-num/.test(code)
      && /\.mphbac-day-num\.mphbac-day-num\s*\{[^}]*--mphbac-color-day-num/.test(code));
    check('...and white is not used, which would be ~3.1:1 on the coral',
      !/\.mphbac-day-num\.mphbac-day-num\s*\{[^}]*#fff/i.test(code));
    await p.close();
  }

  console.log('-- the three states are visually distinct --');
  {
    const p = await open();
    const fills = await p.evaluate(() => ['is-available', 'is-booked', 'is-past'].map(s => {
      const el = [...document.querySelectorAll('.mphbac-cell-status')].find(x => x.classList.contains(s) && !x.classList.contains('is-weekend'));
      return { s, bg: getComputedStyle(el).backgroundColor };
    }));
    check('available, booked and past are three different fills',
      new Set(fills.map(f => f.bg)).size === 3, fills);
    /* CONTRAST RATIO IS THE WRONG TOOL HERE and the first version of this
     * check used it. It measures LUMINANCE only, so available #7BDCB5 against
     * past #bdc3c7 scores 1.08 — two colours that differ in hue, not in
     * lightness, and are perfectly distinguishable. Contrast ratio is the
     * right tool for text ON a fill, which is what the block above uses it
     * for; separation BETWEEN fills needs a distance that includes hue.
     * Euclidean RGB distance is a rough proxy and sufficient to catch two
     * fills collapsing towards each other. */
    const dist = (a, b) => {
      const [x, y] = [rgb(a), rgb(b)];
      return +Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]).toFixed(1);
    };
    for (let i = 0; i < fills.length; i++)
      for (let j = i + 1; j < fills.length; j++)
        check(`${fills[i].s} vs ${fills[j].s} are distinguishable, not near-identical`,
          dist(fills[i].bg, fills[j].bg) > 40,
          { distance: dist(fills[i].bg, fills[j].bg),
            luminanceRatio: ratio(fills[i].bg, fills[j].bg) });
    await p.close();
  }

  console.log('-- the cottage column: scales overlap DOWNWARD --');
  {
    const p = await open('mphbac-namecol-scales');
    const z = await p.evaluate(() => [...document.querySelectorAll('.mphbac-row:not(.mphbac-row-header) .mphbac-cell-label')]
      .map(el => {
        const before = getComputedStyle(el, '::before');
        return { zIndex: getComputedStyle(el).zIndex, tile: before.content,
                 tileBg: before.backgroundColor, overflow: getComputedStyle(el).overflow };
      }));
    check('each row sits BELOW the one above it, so a scale overlaps downward',
      z.every((r, i) => i === 0 || Number(r.zIndex) < Number(z[i - 1].zIndex)),
      z.map(r => r.zIndex));
    check('the tile is a ::before with real content, and the cell lets it overhang',
      z.every(r => r.tile !== 'none' && r.overflow === 'visible'), z[0]);
    // getComputedStyle(el, '::before') needs the pseudo argument — a local
    // helper like `cs = el => getComputedStyle(el)` silently drops it and
    // returns the ELEMENT's style, so the tile looks unstyled. This project
    // has been caught by that once already. Prove the two reads DIFFER, so a
    // dropped argument could not pass unnoticed.
    const pseudoReadWorks = await p.evaluate(() => {
      const el = document.querySelector('.mphbac-row:not(.mphbac-row-header) .mphbac-cell-label');
      return { element: getComputedStyle(el).content, pseudo: getComputedStyle(el, '::before').content };
    });
    check('(instrument check) reading ::before differs from reading the element',
      pseudoReadWorks.element !== pseudoReadWorks.pseudo, pseudoReadWorks);
    await p.close();
  }

  console.log('-- the dividers variant is a different look, not the same one --');
  {
    const a = await open('mphbac-namecol-scales');
    const scales = await a.evaluate(() => {
      const el = document.querySelector('.mphbac-row:not(.mphbac-row-header) .mphbac-cell-label');
      return { before: getComputedStyle(el, '::before').content, bg: getComputedStyle(el).backgroundColor };
    });
    await a.close();
    const b = await open('mphbac-namecol-dividers');
    const dividers = await b.evaluate(() => {
      const el = document.querySelector('.mphbac-row:not(.mphbac-row-header) .mphbac-cell-label');
      return { before: getComputedStyle(el, '::before').content, bg: getComputedStyle(el).backgroundColor };
    });
    await b.close();
    check('the two cottage-column variants render differently',
      JSON.stringify(scales) !== JSON.stringify(dividers), { scales, dividers });
    check('the separator has its own token, chosen against BOTH row grounds',
      /--mphbac-color-namecol-sep/.test(code));
  }

  console.log('-- the cell tooltip is hidden until hover, and hover is guarded --');
  {
    const p = await open();
    const t = await p.evaluate(() => {
      const tip = document.querySelector('.mphbac-cell-tip');
      return { opacity: getComputedStyle(tip).opacity, position: getComputedStyle(tip).position };
    });
    check('the tooltip starts hidden and is positioned out of flow',
      parseFloat(t.opacity) === 0 && t.position === 'absolute', t);
    check('its reveal sits inside the pointer guard, like every other hover',
      code.indexOf('.mphbac-cell-status:hover .mphbac-cell-tip')
        > code.indexOf('@media (hover: hover) and (pointer: fine)'));
    await p.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
