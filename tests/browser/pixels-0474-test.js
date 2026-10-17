'use strict';
/**
 * 0.47.4 WITH LIVE'S RULES IS 0.47.3, PIXEL FOR PIXEL (the WD's requirement).
 *
 * Live's MotoPress rules on 2026-10-17: one 2-night minimum for every cottage
 * and season, nothing else — the widget's own minimum is 2 as well. So on
 * live nothing a guest sees may change. Every public instance in the export
 * (the two overview calendars and the eight cottage pages) is rendered by
 * 0.47.3 (git e515faf, its own shipped .min files) and by this checkout, at
 * 360px and 1280px, each talking to its OWN endpoint over the same site
 * (site-0474.js, fixture mode "live"): the opening view, one page on, the
 * booking popup, and (overview) the cottage info popup. Every pair must be
 * byte-identical PNGs; the first difference fails with its size and box.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness.js');
const site = require('./site-0474.js');
const { pixelDiff } = require('../render/shoot.js');
const { check, done } = H.reporter();

const OUT = process.env.PIXELS_OUT || '';
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'mphbac-0473-'));
execSync(`git archive e515faf mphb-availability-calendar | tar -x -C ${OLD}`, { cwd: path.resolve(__dirname, '../..') });
const OLD_DIR = path.join(OLD, 'mphb-availability-calendar');

async function drive(p, state, v1) {
  await p.mouse.move(0, 0);
  if (state === 'next') await p.click('.mphbac-nav-next');
  if (state === 'booking') await p.click('.mphbac-cell-status.is-available.is-clickable');
  if (state === 'info') await p.click('.mphbac-row-toggle--info');
  await p.mouse.move(0, 0);
  await p.waitForTimeout(state === 'open' ? 300 : 1200);
  await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  // Repaint from scratch, the same for both versions: the grid's rounded,
  // shadowed box (shoot.js's reason) and — found here — the filter fields'
  // rounded borders, whose top row could anti-alias up to 12/765 apart
  // between two pages of the same build when a layer was left from loading.
  await p.evaluate(() => document.querySelectorAll('.mphbac-grid-wrap, .mphbac-input').forEach(g => { g.style.display = 'none'; void g.offsetHeight; g.style.display = ''; }));
  await p.waitForTimeout(300);
  void v1;
}

(async () => {
  const live = JSON.parse(fs.readFileSync(site.LIVE, 'utf8'));
  const cases = live.widgets.filter(w => w.widget_type !== 'dccac_staff').map(w => [w.post_id + ':' + w.widget_id, w.widget_type]);
  check('(instrument check) every public instance on live: 2 overview calendars and 8 cottage pages',
    cases.filter(c => c[1] === 'mphbac_calendar').length === 2 && cases.filter(c => c[1] === 'dccac_single').length === 8, cases);
  const browser = await chromium.launch(H.CHROMIUM);
  let n = 0, same = 0;
  const only = process.env.PIXELS_ONLY ? process.env.PIXELS_ONLY.split(',') : null;   // for iterating; a filtered run proves less
  for (const [cas, type] of cases) {
    if (only && !only.includes(cas)) continue;
    const states = type === 'mphbac_calendar' ? ['open', 'next', 'booking', 'info'] : ['open', 'next', 'booking'];
    for (const width of [360, 1280]) {
      for (const state of states) {
        const shot = async dir => {
          const { ctx, p } = await site.open(browser, { mode: 'live', cas, width, dir, touch: false });
          await drive(p, state, type === 'mphbac_calendar');
          const facts = await p.evaluate(() => ({ cells: document.querySelectorAll('.mphbac-cell-status').length,
            sheet: !!document.querySelector('.mphbac-sheet.is-open'), co: (document.querySelector('.mphbac-sheet-checkout') || {}).value || '' }));
          const png = await p.screenshot({ fullPage: true, animations: 'disabled' });
          const errors = p.__errors.slice();
          await ctx.close();
          return { png, facts, errors };
        };
        const a = await shot(OLD_DIR);
        const b = await shot(site.HERE);
        n++;
        const eq = a.png.equals(b.png);
        if (eq) same++;
        const d = eq ? null : await pixelDiff(browser, a.png, b.png);
        check(`${cas.padEnd(13)} ${String(width).padStart(4)}px ${state.padEnd(7)} identical to 0.47.3`
          + ` (${b.facts.cells} cells${b.facts.sheet ? ', popup open, check-out ' + b.facts.co : ''})`,
          eq && !a.errors.length && !b.errors.length && JSON.stringify(a.facts) === JSON.stringify(b.facts),
          eq ? { errors: [a.errors, b.errors] } : { px: d.n, box: d.box || d.size });
        if (OUT && (!eq || state === 'booking')) {
          fs.mkdirSync(OUT, { recursive: true });
          const f = `${cas.replace(':', '_')}_${width}_${state}`;
          fs.writeFileSync(path.join(OUT, f + '_0473.png'), a.png);
          fs.writeFileSync(path.join(OUT, f + '_0474.png'), b.png);
        }
      }
    }
  }
  console.log(`\n${same} of ${n} screenshot pairs identical`);
  check('(instrument check) the comparison covered 10 instances × 2 widths × their states (64 pairs)', n === 64, n);
  await browser.close();
  fs.rmSync(OLD, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(OLD, { recursive: true, force: true }); process.exit(2); });
