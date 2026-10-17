'use strict';
/**
 * THE 0.47.4 SCREENSHOTS (for the report): each rule as a guest meets it, on
 * the staging fixture through the real endpoint (site-0474.js), at 360px
 * (a phone: the cottage page) and 1280px (the homepage overview).
 *
 *   node tests/browser/shots-0474.js <out_dir>
 *
 * Writes, per width, one sheet of captioned frames:
 *   Availability Calendar - 0.47.4 rules in the booking pop-up <w>px.png
 *   Availability Calendar - 0.47.4 no check-in days and buffer nights <w>px.png
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const H = require('./harness.js');
const site = require('./site-0474.js');

const OUT = process.argv[2] || '.';
const dow = d => new Date(d + 'T12:00:00').getDay();
const add = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const cellSel = (d, row) => (row ? `.mphbac-row[data-room-type-id="${row}"] ` : '') + `.mphbac-cell-status[data-date="${d}"]`;

async function sheet(browser, width, cas, row, ci, co, mode = 'fixture') {
  const { ctx, p } = await site.open(browser, { mode, cas, width, scale: 2, height: width < 600 ? 760 : 820 });
  // The overview shows 28 days: page on until the check-in is on screen, so
  // the popup is judged from the rules the page holds.
  for (let i = 0; i < 4 && !(await p.$(cellSel(ci, row))); i++) {
    await p.click('.mphbac-nav-next');
    await p.waitForTimeout(900);
  }
  // Open the popup from the first bookable day on screen, then type the
  // dates — some frames' check-in is a day that (rightly) cannot open it.
  await p.click((row ? `.mphbac-row[data-room-type-id="${row}"] ` : '') + '.mphbac-cell-status.is-clickable');
  await p.waitForTimeout(500);
  await p.fill('.mphbac-sheet-checkin', ci);
  await p.fill('.mphbac-sheet-checkout', co);
  await p.waitForTimeout(300);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.waitForTimeout(200);
  const png = await p.screenshot();
  const err = await p.evaluate(() => { const e = document.querySelector('.mphbac-sheet-error'); return e && !e.hidden ? e.textContent : ''; });
  await ctx.close();
  return { png, err };
}

async function tapped(browser, width, cas, row, d, clip) {
  const { ctx, p } = await site.open(browser, { mode: 'fixture', cas, width, scale: 2, height: width < 600 ? 900 : 760 });
  if (d) {
    await p.click(cellSel(d, row), { force: true });
    await p.waitForTimeout(250);
  }
  const box = await p.locator('.mphbac-root').boundingBox();
  const png = await p.screenshot({ clip: clip ? { x: 0, y: box.y - 8, width, height: Math.min(box.height + 16, clip) } : undefined, fullPage: !clip });
  const tip = d ? await p.evaluate(sel => (document.querySelector(sel + ' .mphbac-cell-tip') || {}).textContent, cellSel(d, row)) : '';
  await ctx.close();
  return { png, err: tip };
}

async function compose(browser, title, frames, width, file) {
  const cols = width < 600 ? 3 : 2;
  const w = width < 600 ? 380 : 900;
  const body = frames.map(f => `<figure><figcaption>${f.cap}${f.err ? `<span>${f.err.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>` : ''}</figcaption>
<img src="data:image/png;base64,${f.png.toString('base64')}"></figure>`).join('');
  const html = `<style>body{margin:0;font:15px/1.35 system-ui;background:#fff;color:#111}h1{font-size:22px;margin:18px 20px 4px}
p{margin:0 20px 14px;color:#555}.g{display:grid;grid-template-columns:repeat(${cols},${w}px);gap:22px;padding:0 20px 20px}
figure{margin:0}figcaption{font-weight:600;margin:0 0 6px}figcaption span{display:block;font-weight:400;color:#a33}
img{width:${w}px;border:1px solid #ccc;display:block}</style><h1>${title}</h1>
<p>Staging fixture through the real endpoint: no check-in on Tuesdays · a season (today+30 … +60) with a 3-night minimum, 2 elsewhere · 14-night maximum · 1-day buffer · 1-day minimum advance. Chromium${width < 600 ? ' with touch emulation (WebKit cannot be installed here)' : ''}, ${width}px.</p>
<div class="g">${body}</div>`;
  const p = await browser.newPage({ viewport: { width: cols * (w + 22) + 40, height: 600 } });
  await p.setContent(html);
  await p.waitForTimeout(300);
  fs.writeFileSync(path.join(OUT, file), await p.screenshot({ fullPage: true }));
  await p.close();
}

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const today = site.day(0);
  const tue = (() => { for (let n = 1; ; n++) { const d = site.day(n); if (dow(d) === 2 && (n < 9 || n > 14)) return d; } })();
  const inSeason = (() => { for (let n = 31; ; n++) { const d = site.day(n); if (dow(d) !== 2) return d; } })();
  const tueSeason = (() => { for (let n = 31; ; n++) { const d = site.day(n); if (dow(d) === 2) return d; } })();
  const mon = (() => { for (let n = 15; ; n++) { const d = site.day(n); if (dow(d) === 1 && n + 3 < 30) return d; } })();
  for (const width of [360, 1280]) {
    const cas = width < 600 ? '3043:8e23564' : '620:b7318c3';
    const row = width < 600 ? null : 1071;
    const frames = [];
    frames.push({ cap: '1. No check-in on Tuesdays: check-in moved to ' + tueSeason, ...await sheet(browser, width, cas, row, tueSeason, add(tueSeason, 4)) });
    frames.push({ cap: '2. Seasonal 3-night minimum: ' + inSeason + ' for 2 nights', ...await sheet(browser, width, cas, row, inSeason, add(inSeason, 2)) });
    frames.push({ cap: '3. 14-night maximum: ' + inSeason + ' for 15 nights', ...await sheet(browser, width, cas, row, inSeason, add(inSeason, 15)) });
    frames.push({ cap: '4. Buffer day: ' + site.day(7) + ' – ' + site.day(10) + ' takes the night of ' + site.day(9) + ', the buffer before a booking', ...await sheet(browser, width, cas, row, site.day(7), site.day(10)) });
    frames.push({ cap: '5. 1-day minimum advance: check-in today', ...await sheet(browser, width, cas, row, today, add(today, 2)) });
    frames.push({ cap: '6. The same range, all rules met: no message, Book Now live', ...await sheet(browser, width, cas, row, inSeason, add(inSeason, 3)) });
    frames.push({ cap: '7. (Beyond the list) no check-out on Wednesdays', ...await sheet(browser, width, cas, row, mon, add(mon, 2), 'checkout') });
    await compose(browser, `0.47.4 — MotoPress's rules in the booking pop-up, ${width}px`, frames, width,
      `Availability Calendar - 0.47.4 rules in the booking pop-up ${width}px.png`);

    const grid = [];
    const clip = width < 600 ? 0 : 760;
    grid.push({ cap: 'At load: striped "No Check-In" days, nothing said; buffer nights booked', ...await tapped(browser, width, cas, row, null, clip) });
    grid.push({ cap: 'Tap a Tuesday: why, and no pop-up', ...await tapped(browser, width, cas, row, tue, clip) });
    grid.push({ cap: 'Tap today (1-day minimum advance)', ...await tapped(browser, width, cas, row, today, clip) });
    await compose(browser, `0.47.4 — no check-in days and buffer nights, ${width}px`, grid, width,
      `Availability Calendar - 0.47.4 no check-in days and buffer nights ${width}px.png`);
    console.log(width, frames.map(f => f.err), grid.map(f => f.err));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
