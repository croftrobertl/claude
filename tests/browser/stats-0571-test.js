'use strict';
/**
 * 0.57.1 — ROB'S PICKS ON STATS (the Website Director, 2026-11-04), in a real
 * page with the shipped (minified) staff.js, on LIVE-SHAPED sample data
 * (stats-0571-fixture.js: November 2026 as of Nov 4, built to the WD's hand
 * check — 66 nights, 11 bookings; last year by Nov 4: 43 nights, 9 bookings).
 *
 *   1  "11 Bookings" over "All Sources (10 stays)" made plain: the Bookings
 *      tip says it includes stays that began earlier, and a line under Days
 *      Booked Ahead says "10 of 11 bookings counted: 1 arrived before Nov 1."
 *   2  WHILE A PERIOD IS UNDER WAY every ▲▼ — the six tiles, the headline
 *      pill, Nights by Cottage — compares with what was on the books for the
 *      same dates ON THIS DATE last year (madeOn ≤ yearBack(today), own()'s
 *      ownership), and says so ("vs this date last year", the tips); a
 *      finished period compares final with final ("vs Oct 2025"). Every
 *      figure checked against an oracle written here from the definitions.
 *   4  the tiles' figures 22px, ▲▼ 16px, "nights" 14px; at 320 / 375 / 390 /
 *      1440 no figure or unit touches its ⓘ, the figure on one line
 *   5  dock blocks are never turnovers: not on the board (◇), not in the
 *      Daily list's Turnovers, not in Stats — and guest → guest beside one
 *      still is
 * STILLS_OUT=<dir>: before (0.57.0, git 9911a2d) / after, the whole Stats
 * panel for November 2026 (under way) and October 2026 (finished), the board,
 * at 320 / 390 / 1440.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const L = require('./stats-0571-fixture.js');
const { check, done } = H.reporter();
const OUT = process.env.STILLS_OUT || '';

// ---- the oracle: own() from its definition, and the as-of filter ---------
const nightsOf = (from, to) => { const out = []; for (let d = from; d <= to; d = L.day(d, 1)) out.push(d); return out; };
function own(list, nights) {
  const sorted = list.filter(b => b.checkin && b.checkout).sort((a, b) => a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : a.id - b.id);
  const owner = {}, perCottage = {}; let booked = 0; const mine = new Set();
  for (const b of sorted) for (const c of b.cottages) for (const d of nights) {
    const k = c.roomTypeId + '|' + d;
    if (d >= b.checkin && d < b.checkout && !owner[k]) { owner[k] = b; if (b.notStay) continue; booked++; mine.add(b); perCottage[c.roomTypeId] = (perCottage[c.roomTypeId] || 0) + 1; }
  }
  return { booked, perCottage, bookings: mine.size, mine: [...mine] };
}
const within = (from, to) => L.BOOKINGS.filter(b => b.checkout >= from && b.checkin <= to);
const month = (from, to, asOf) => own(within(from, to).filter(b => !asOf || (b.madeOn && b.madeOn <= asOf)), nightsOf(from, to));
const pct = (v, of) => Math.round(100 * v / of);
const arrow = d => d === 0 ? '±0' : (d > 0 ? '▲' : '▼') + Math.abs(d);

// A 15-night average stay, and counts in three figures, for the tiles.
const LONG = [L.bk('2026-11-01', '2026-11-16', 22, 'direct', '2026-09-01'), L.bk('2026-11-03', '2026-11-18', 23, 'airbnb', '2026-09-02')];
const MANY = [];
for (let i = 0; i < 8 * 28; i++) { const ci = L.day('2026-11-01', Math.floor(i / 8)); MANY.push(L.bk(ci, L.day(ci, 1), [22, 23, 31, 32, 33, 34, 35, 36][i % 8], 'direct', '2026-10-01')); }

const REPO = path.resolve(__dirname, '../..');
let S_OLD = null, OLD = null;
if (OUT) {
  OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-0571-'));
  execSync(`git -C ${REPO} archive 9911a2d | tar -x -C ${OLD}`);
  fs.symlinkSync(path.join(__dirname, 'node_modules'), path.join(OLD, 'tests/browser/node_modules'));
  fs.symlinkSync(path.join(REPO, 'tools/node_modules'), path.join(OLD, 'tools/node_modules'));
  S_OLD = require(path.join(OLD, 'tests/browser/staff-harness.js'));
}

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const open = async ({ w = 390, bookings = L.BOOKINGS, harness = S, scale = 1, stats = true } = {}) => {
    const html = harness.boardShell({ today: L.TODAY, cottages: L.COTTAGES, bookings, bodyStyle: 'padding:0 16px', head: harness.raleway() });
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true, deviceScaleFactor: scale } : { viewport: { width: w, height: 900 }, deviceScaleFactor: scale });
    await ctx.route('https://staff.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.__errors = [];
    p.on('pageerror', e => p.__errors.push(e.message));
    await p.goto('https://staff.test/');
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.evaluate(() => document.fonts.ready);
    if (stats) {
      await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
      await p.waitForSelector('.mphbac-staff-kpi');
      await p.waitForTimeout(400);
    }
    return { ctx, p };
  };
  const statsOf = p => p.evaluate(() => {
    const tile = k => { const t = document.querySelector('.mphbac-staff-kpi.is-' + k); return { num: t.querySelector('.mphbac-staff-kpi-num').textContent, seen: t.querySelector('.mphbac-staff-kpi-delta [aria-hidden]').textContent,
      said: t.querySelector('.mphbac-staff-kpi-delta .mphbac-sr-only').textContent, tip: t.querySelector('.mphbac-staff-tipbox').textContent }; };
    const pill = document.querySelector('.mphbac-staff-stats-pill');
    return { bookings: tile('bookings'), booked: tile('booked'), length: tile('length'), arrivals: tile('arrivals'), departures: tile('departures'), turnovers: tile('turnovers'),
      headline: document.querySelector('.mphbac-staff-stats-headline').textContent,
      pill: pill && { seen: pill.querySelector('[aria-hidden]').textContent + pill.querySelector('.mphbac-staff-stats-pillvs').textContent, said: pill.querySelector('.mphbac-sr-only').textContent },
      percot: [...document.querySelectorAll('.mphbac-staff-percot-row')].map(r => ({ id: r.getAttribute('data-cottage'), nights: +r.querySelector('.mphbac-staff-percot-num').textContent,
        seen: r.querySelector('.mphbac-staff-percot-delta [aria-hidden]').textContent, said: r.querySelector('.mphbac-staff-percot-delta .mphbac-sr-only').textContent })),
      percotTip: document.querySelector('.mphbac-staff-stats-block.is-percot .mphbac-staff-tipbox').textContent,
      leadAll: (document.querySelector('.mphbac-staff-lead-row.is-all .mphbac-staff-lead-count') || {}).textContent,
      leadNote: (document.querySelector('.mphbac-staff-lead-note') || {}).textContent || null };
  });

  console.log('-- 2. November 2026, under way: the same date last year --');
  const NOV = { from: '2026-11-01', to: '2026-11-30' }, LYN = { from: '2025-11-01', to: '2025-11-30' }, ASOF = '2025-11-04';
  const now = month(NOV.from, NOV.to), byThen = month(LYN.from, LYN.to, ASOF), final = month(LYN.from, LYN.to);
  console.log(`   oracle: Nov 2026 now ${now.booked} nights / ${now.bookings} bookings; Nov 2025 by ${ASOF} ${byThen.booked} / ${byThen.bookings}; Nov 2025 final ${final.booked} / ${final.bookings}`);
  check('(fixture) the WD\'s live figures reproduced: 66 nights / 11 bookings now; 43 / 9 by this date last year; 66 / 17 final',
    now.booked === 66 && now.bookings === 11 && byThen.booked === 43 && byThen.bookings === 9 && final.booked === 66 && final.bookings === 17);
  {
    const { ctx, p } = await open();
    const m = await statsOf(p);
    check('headline "November Is 28% Booked"', m.headline === 'November Is 28% Booked', m.headline);
    check(`the pill "▲10 vs this date last year" (28% vs 18%) — 0.57.0 read "±0 vs Nov 2025", final vs now`, m.pill && m.pill.seen === '▲10 vs this date last year' && m.pill.said === 'up 10 points vs this date last year', m.pill);
    check(`Bookings "11 ▲2" (11 vs 9) — 0.57.0 read ▼6 (vs 17 final)`, m.bookings.num === '11' && m.bookings.seen === '▲2' && m.bookings.said === 'up 2 vs this date last year', m.bookings);
    check('Booked "28% ▲10"', m.booked.num === '28%' && m.booked.seen === '▲10', m.booked);
    const pc = m.percot.reduce((t, r) => t + r.nights, 0);
    check(`Nights by Cottage sums to ${pc} (the WD's 66)`, pc === 66, pc);
    const wantDelta = id => arrow(pct(now.perCottage[id] || 0, 30) - pct(byThen.perCottage[id] || 0, 30));
    check('every cottage\'s ▲▼ against what was on its books by Nov 4, 2025 (oracle)', m.percot.every(r => r.seen === wantDelta(r.id) && r.said.endsWith('vs this date last year')), m.percot.map(r => [r.id, r.seen, wantDelta(r.id)]));
    check('the tips say which comparison: "…Nov 1 – 30, 2025 as booked by Nov 4, 2025"', [m.bookings.tip, m.booked.tip, m.length.tip, m.percotTip].every(t => /Nov\s1\s–\s30, 2025 as booked by Nov\s4, 2025/.test(t)), [m.bookings.tip, m.percotTip]);
    check('…the Booked and Nights by Cottage tips still in occupancy percentage points', /occupancy percentage points vs Nov/.test(m.booked.tip) && /occupancy percentage points vs Nov/.test(m.percotTip));

    console.log('\n-- 1. Bookings 11, All Sources 10: said on the page --');
    check('the Bookings tip says it includes stays that began before the period', /including stays that began before it\./.test(m.bookings.tip), m.bookings.tip);
    check('All Sources counts the 10 arriving: "(10 stays)"', /\(10 stays\)/.test(m.leadAll || ''), m.leadAll);
    check('…and the line under it: "10 of 11 bookings counted: 1 arrived before Nov 1."', m.leadNote === '10 of 11 bookings counted: 1 arrived before Nov 1.', m.leadNote);

    console.log('\n-- 5. dock blocks are never turnovers --');
    check('Stats: Turnovers 1 (the guest → guest one on #33, Nov 10)', m.turnovers.num === '1', m.turnovers);
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ w: 1440, stats: false });
    const marks = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-turn')].map(m => m.getAttribute('data-day') + ' ' + m.title));
    check('the board: one ◇ in November — Nov 10, "Out Nov 10 → In Nov 10"; none where a dock block ends or starts (#31 Nov 6, #32 Nov 5, #33 Nov 14)',
      marks.length === 1 && /^2026-11-10 .*Out Nov 10 → In Nov 10$/.test(marks[0]) && !marks.some(t => /Dock Block/.test(t)), marks);
    await p.selectOption('.mphbac-staff-period', 'day');
    const daily = {};
    for (const d of ['2026-11-05', '2026-11-06', '2026-11-10', '2026-11-14']) {
      await p.fill('.mphbac-staff-goto', d); await p.dispatchEvent('.mphbac-staff-goto', 'change'); await p.waitForTimeout(200);
      daily[d] = await p.evaluate(() => ({ n: document.querySelector('.mphbac-staff-group.is-turn .mphbac-staff-group-count').textContent,
        lines: [...document.querySelectorAll('.mphbac-staff-turnline')].map(l => l.textContent) }));
    }
    check('the Daily list: Turnovers 0 on Nov 5, Nov 6 and Nov 14 (dock blocks), 1 on Nov 10 (guest → guest)',
      daily['2026-11-05'].n === '0' && daily['2026-11-06'].n === '0' && daily['2026-11-14'].n === '0' && daily['2026-11-10'].n === '1' && /^Cottage 33: .+ out → .+ in$/.test(daily['2026-11-10'].lines[0] || ''), daily);
    await ctx.close();
  }

  console.log('\n-- 2. October 2026, finished: final against final --');
  {
    const { ctx, p } = await open();
    await p.selectOption('.mphbac-staff-stats-month', '2026-10');
    await p.waitForFunction(() => /October/.test(document.querySelector('.mphbac-staff-stats-headline').textContent));
    await p.waitForTimeout(300);
    const m = await statsOf(p);
    const o = month('2026-10-01', '2026-10-31'), f = month('2025-10-01', '2025-10-31');
    const d = pct(o.booked, 8 * 31) - pct(f.booked, 8 * 31);
    check(`the pill "${arrow(d)} vs Oct 2025" — the final figure, as before`, m.pill && m.pill.seen === arrow(d) + ' vs Oct 2025', m.pill);
    check(`Bookings ${o.bookings} ${arrow(o.bookings - f.bookings)} (final ${f.bookings}), read "on the same dates a year earlier"`, m.bookings.seen === arrow(o.bookings - f.bookings) && /on the same dates a year earlier$/.test(m.bookings.said), m.bookings);
    check('the tips say the same dates last year, with no "by" date', /▲▼ compare with the same dates last year \(Oct\s1\s–\s31, 2025\)\./.test(m.bookings.tip) && !/ by Nov/.test(m.bookings.tip), m.bookings.tip);
    check('…Booked and Nights by Cottage: "▲▼ are occupancy percentage points vs the same dates last year (Oct 1 – 31, 2025)."',
      /▲▼ are occupancy percentage points vs the same dates last year \(Oct\s1\s–\s31, 2025\)\./.test(m.booked.tip) && /▲▼ are occupancy percentage points vs the same dates last year \(Oct\s1\s–\s31, 2025\)\./.test(m.percotTip), [m.booked.tip, m.percotTip]);
    await ctx.close();
  }

  console.log('\n-- 4. the tiles: 22 / 16 / 14, nothing in the ⓘ\'s corner --');
  for (const [label, set] of [['"15.0 nights"', LONG], ['three-figure counts', MANY], ['the live-shaped month', L.BOOKINGS]]) {
    for (const w of [320, 375, 390, 1440]) {
      const { ctx, p } = await open({ w, bookings: set });
      const r = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-kpi')].map(t => {
        const rect = e => e.getBoundingClientRect();
        const num = t.querySelector('.mphbac-staff-kpi-num'), unit = num.querySelector('.mphbac-staff-kpi-unit'), icon = rect(t.querySelector('.mphbac-staff-tip svg')), tb = rect(t);
        const glyphs = e => { const rg = document.createRange(); rg.selectNodeContents(e); return [...rg.getClientRects()].filter(x => x.width && x.height); };
        const fig = [...num.childNodes].filter(n => n.nodeType === 3).flatMap(n => { const rg = document.createRange(); rg.selectNodeContents(n); return [...rg.getClientRects()]; });
        const all = glyphs(num);
        return { label: t.querySelector('.mphbac-staff-kpi-label').textContent, num: num.textContent,
          touch: all.filter(x => x.right > icon.left - 1 && x.left < icon.right + 1 && x.bottom > icon.top - 1 && x.top < icon.bottom + 1).length,
          figLines: new Set(fig.map(x => Math.round(x.top))).size, belowIcon: all.every(x => x.top >= icon.bottom - 0.5), unitBelow: unit ? glyphs(unit)[0].top >= Math.max(...fig.map(x => x.bottom)) - 1 : null,
          inside: all.every(x => x.left >= tb.left - 0.5 && x.right <= tb.right + 0.5),
          size: getComputedStyle(num).fontSize, delta: getComputedStyle(t.querySelector('.mphbac-staff-kpi-delta')).fontSize, unitSize: unit && getComputedStyle(unit).fontSize };
      }));
      // On a phone the ⓘ's corner is RESERVED (the WD's pick): the figure starts
      // below the ⓘ, not merely beside it.
      const bad = r.filter(t => t.touch || t.figLines !== 1 || !t.inside || (w < 600 && (t.unitBelow === false || !t.belowIcon)));
      check(`${label} @${w}: figures 22px, ▲▼ 16px${r.some(t => t.unitSize) ? ', "nights" 14px' : ''}; none touches its ⓘ, one line, inside its tile${w < 600 ? ', below the ⓘ, "nights" under the figure' : ''}`,
        r.length === 6 && !bad.length && r.every(t => t.size === '22px' && t.delta === '16px' && (!t.unitSize || t.unitSize === '14px')), bad.length ? bad : r.map(t => t.label + ' ' + t.num));
      await ctx.close();
    }
  }

  console.log('\n-- 6. 320px: the names in Nights by Cottage --');
  {
    const { ctx, p } = await open({ w: 320 });
    const r = await p.evaluate(() => {
      const t = document.querySelector('.mphbac-staff-percot');
      const names = [...t.querySelectorAll('.mphbac-staff-percot-name')].map(n => { const w0 = n.getBoundingClientRect().width; n.style.whiteSpace = 'nowrap'; const need = n.scrollWidth; n.style.whiteSpace = ''; return [n.textContent, Math.round(w0), need]; });
      return { cols: getComputedStyle(t).gridTemplateColumns, names };
    });
    const over = r.names.filter(x => x[2] > x[1] + 0.5).map(x => x[0]);
    check('320px (≤340: gaps 2px): every cottage name on one line but "#31 Hibiscus Hut" (127px, which wrapped in 0.56.0 too)', JSON.stringify(over) === '["#31 Hibiscus Hut"]', [r.cols, r.names]);
    await ctx.close();
  }

  if (OUT) {
    const shot = async (when, harness, w, monthPick, file) => {
      const { ctx, p } = await open({ w, harness, scale: w < 700 ? 2 : 1 });
      if (monthPick) { await p.selectOption('.mphbac-staff-stats-month', monthPick); await p.waitForTimeout(500); }
      await p.evaluate(() => window.scrollTo(0, 0));
      await (await p.$('.mphbac-staff-stats')).screenshot({ path: path.join(OUT, file) });
      await ctx.close();
    };
    for (const w of [320, 390, 1440]) {
      for (const [when, harness] of [['BEFORE', S_OLD], ['AFTER', S]]) {
        await shot(when, harness, w, null, `Availability Calendar - 0.57.1 ${when} Stats Nov 2026 under way ${w}px.png`);
        await shot(when, harness, w, '2026-10', `Availability Calendar - 0.57.1 ${when} Stats Oct 2026 finished ${w}px.png`);
      }
    }
    for (const [when, harness] of [['BEFORE', S_OLD], ['AFTER', S]]) {
      const { ctx, p } = await open({ w: 1440, harness, stats: false });
      await (await p.$('.mphbac-staff-chart')).screenshot({ path: path.join(OUT, `Availability Calendar - 0.57.1 ${when} board turnovers Nov 2026 1440px.png`) });
      await ctx.close();
    }
  }

  await browser.close();
  if (OLD) fs.rmSync(OLD, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); if (OLD) fs.rmSync(OLD, { recursive: true, force: true }); process.exit(1); });
