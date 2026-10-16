'use strict';
/**
 * 0.47.0 PROOF: THIS YEAR'S CALENDAR IS 0.46.7's, PIXEL FOR PIXEL, IN OFF AND
 * BEHIND — and no taller In Front.
 *
 *   git worktree add /tmp/v0467 7f7ab39            (0.46.7)
 *   ln -s "$PWD/tests/browser/node_modules" /tmp/v0467/tests/browser/node_modules
 *   node tests/browser/staff-lastyear-proof.js /tmp/v0467 [--out DIR]
 *
 * Each tree renders its OWN shell, stylesheet and shipped staff.js (through
 * its own staff-harness.js) from the same data — lastyear-fixture.js, in
 * Raleway, with Bravada's own <button> type added, which 0.46.7's ghosts
 * (plain <div>s) could never meet and 0.47.0's (<button>s) must ignore.
 * Monthly and Weekly at 360 / 390 / 1280:
 *   - Off: 0.46.7 with the switch off against 0.47.0 Off;
 *   - Behind: 0.46.7 with the switch on against 0.47.0 Behind;
 * the whole calendar (.mphbac-staff-grid) screenshotted and compared pixel
 * by pixel, plus every bar's and row's box and the calendar's height. In
 * Front the calendar's height and every row's are compared with 0.46.7's.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const NEW = require('./staff-harness.js');
const L = require('./lastyear-fixture.js');

const oldRoot = process.argv[2];
if (!oldRoot) { console.error('usage: node staff-lastyear-proof.js <0.46.7 checkout> [--out DIR]'); process.exit(2); }
const OLD = require(path.resolve(oldRoot, 'tests/browser/staff-harness.js'));
const outI = process.argv.indexOf('--out');
const OUT = outI > 0 ? process.argv[outI + 1] : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const head = NEW.raleway() + L.BRAVADA_BUTTON;
const opts = { today: L.TODAY, cottages: L.COTTAGES, bookings: L.BOOKINGS, details: L.DETAILS, bodyStyle: 'padding:0 16px', head };

async function shot(browser, H, w, period, state) {
  // Reduced motion and a fresh paint of the calendar's box before the shot,
  // the same for both trees: shoot.js's remedy for the rounded, shadowed
  // corner that otherwise anti-aliases a shade differently from one shot to
  // the next (it keeps a compositor layer from an earlier state).
  const ctx = await browser.newContext(Object.assign(w < 700 ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } }, { reducedMotion: 'reduce' }));
  const html = H.boardShell(opts);
  await ctx.route('http://staff.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://staff.test/');
  await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
  await p.evaluate(() => document.fonts.ready);
  if (period !== 'month') { await p.selectOption('.mphbac-staff-period', period); await p.waitForTimeout(300); }
  if (state !== 'off') {
    // 0.46.7: its checkbox; 0.47.0: the segment.
    if (await p.$('.mphbac-staff-ghosts')) await p.check('.mphbac-staff-ghosts');
    else await p.click(`.mphbac-staff-segbtn[data-ly="${state}"]`);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-ghost'));
  }
  await p.mouse.move(0, 0);
  await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await p.evaluate(() => { const g = document.querySelector('.mphbac-staff-grid'), x = g.scrollLeft; g.style.display = 'none'; void g.offsetHeight; g.style.display = ''; g.scrollLeft = x; });
  await p.waitForTimeout(400);
  const facts = await p.evaluate(() => {
    const g = document.querySelector('.mphbac-staff-grid'), c = g.firstChild;
    const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 100) / 100).join(','); };
    return { grid: box(g), chart: c.scrollHeight + 'x' + c.scrollWidth, rows: [...c.querySelectorAll('.mphbac-staff-rowlabel')].map(box),
      bars: [...c.querySelectorAll('.mphbac-staff-bar')].map(b => b.getAttribute('data-booking-id') + '@' + box(b)), ghosts: c.querySelectorAll('.mphbac-staff-ghost').length };
  });
  const png = await (await p.$('.mphbac-staff-grid')).screenshot({ animations: 'disabled' });
  await ctx.close();
  return { facts, png, errors };
}

async function diff(browser, a, b) {
  const p = await browser.newPage();
  const r = await p.evaluate(async ([a, b]) => {
    const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const [ia, ib] = [await load(a), await load(b)];
    if (ia.width !== ib.width || ia.height !== ib.height) return { n: -1, size: [ia.width, ia.height, ib.width, ib.height] };
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d');
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
    return { n, px: c.width * c.height };
  }, [a.toString('base64'), b.toString('base64')]);
  await p.close();
  return r;
}

(async () => {
  const browser = await chromium.launch(NEW.CHROMIUM);
  let bad = 0, n = 0;
  for (const w of [360, 390, 1280]) {
    for (const period of ['month', 'week']) {
      for (const [oldState, newState] of [['off', 'off'], ['on', 'behind'], ['off', 'front']]) {
        const a = await shot(browser, OLD, w, period, oldState), b = await shot(browser, NEW, w, period, newState);
        const label = `${w}px ${period} 0.46.7 ${oldState === 'on' ? 'switch on' : 'off'} vs 0.47.0 ${newState}`;
        n++;
        if (newState === 'front') {
          // In Front the boxes sit over the bars by design: the calendar's
          // height and every row's must still be 0.46.7's.
          const same = a.facts.grid.split(',')[3] === b.facts.grid.split(',')[3] && a.facts.chart.split('x')[0] === b.facts.chart.split('x')[0]
            && JSON.stringify(a.facts.rows) === JSON.stringify(b.facts.rows);
          if (!same) bad++;
          console.log(`${same ? 'SAME ' : 'DIFF '} ${label}: calendar ${b.facts.grid.split(',')[3]}px tall, chart ${b.facts.chart.split('x')[0]}px, ${b.facts.rows.length} rows${same ? '' : ' — 0.46.7: ' + JSON.stringify(a.facts)}`);
          continue;
        }
        const d = await diff(browser, a.png, b.png);
        const geo = JSON.stringify(a.facts) === JSON.stringify(b.facts);
        const ok = d.n === 0 && geo && !a.errors.length && !b.errors.length;
        if (!ok) bad++;
        console.log(`${ok ? 'SAME ' : 'DIFF '} ${label}: ${d.n} of ${d.px} pixels differ; bars, rows and height ${geo ? 'identical' : 'DIFFER'} (${b.facts.bars.length} bars, ${b.facts.ghosts} last-year boxes)`
          + (geo ? '' : '\n      0.46.7 ' + JSON.stringify(a.facts) + '\n      0.47.0 ' + JSON.stringify(b.facts)) + (a.errors.concat(b.errors).length ? ' ERRORS ' + a.errors.concat(b.errors) : ''));
        if (OUT) { const f = `${w}-${period}-${newState}`; fs.writeFileSync(path.join(OUT, f + '-0467.png'), a.png); fs.writeFileSync(path.join(OUT, f + '-0470.png'), b.png); }
      }
    }
  }
  console.log(`\n${n} comparisons, ${bad} differ`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
