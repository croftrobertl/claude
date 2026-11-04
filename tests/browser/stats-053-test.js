'use strict';
/**
 * 0.53.0 — /staff/ STATS, ROB'S VISUAL PICKS OF 2026-11-02, driven in a real
 * page with the shipped (minified) staff.js, in Raleway:
 *
 *   1  the headline "November Is N% Booked" (the Booked tile's figure) and
 *      its pill "▲n vs Nov 2025" (the tile's ▲▼); no pill without a
 *      comparison.
 *   1b the pace line: EVERY day's value, this year and last, read through
 *      the slider and checked against a brute-force paceNights() written
 *      here from its definition (own() over the bookings made on or before
 *      the day); "Today: N nights"; a drag and a tap read a day; the keys.
 *   2  Nights by Cottage's header renders "vs 2025" (innerText, which
 *      applies text-transform); the tip says "occupancy percentage points".
 *   3  Nights by Source: one stacked bar, Direct first, widths to the night;
 *      "Direct 41% · 28 nights" lines; the screen-reader list word for word
 *      the 0.47 one; no pie left.
 *   4  Days Booked Ahead: mean, median and mode against the fixture's hand
 *      sums (5, 12, 12, 40, 200 → 54, 12, 12), the "—" mode read as "none",
 *      the tie to the smaller, an even count's median; each figure on one
 *      line at 320.
 *   5  every ⓘ on the page opened in turn: nothing paints over its box.
 *   6  the page's foot clear of an iPhone's home bar (safe area emulated
 *      through CDP, with viewport-fit=cover); none without the inset.
 * No sideways scroll at 320 / 390 / 1280.
 * STILLS_OUT=<dir> also writes the stills.
 */
const path = require('path');
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const X = require('./stats-053-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'http://staff.test/';
const OUT = process.env.STILLS_OUT || '';
const still = async (p, name, el) => {
  if (!OUT) return;
  const file = path.join(OUT, 'Availability Calendar - 0.53.0 ' + name + '.png');
  if (el) await (await p.$(el)).screenshot({ path: file }); else await p.screenshot({ path: file });
};

// ---- the oracle: own() and paceNights() from their definitions ----------
const nightsOf = (from, to) => { const out = []; for (let d = from; d <= to; d = X.day(d, 1)) out.push(d); return out; };
function own(list, nights) {
  const sorted = list.filter(b => b.checkin && b.checkout).sort((a, b) => a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : a.id - b.id);
  const owner = {}; let booked = 0; const bySource = {}; const mine = new Set();
  for (const b of sorted) for (const c of b.cottages) for (const d of nights) {
    const k = c.roomTypeId + '|' + d;
    if (d >= b.checkin && d < b.checkout && !owner[k]) {
      owner[k] = b;
      if (b.notStay) continue;
      booked++; bySource[b.sourceKey] = (bySource[b.sourceKey] || 0) + 1; mine.add(b);
    }
  }
  return { booked, bySource, mine: [...mine] };
}
const overlapping = (from, to) => X.BOOKINGS.filter(b => b.checkout >= from && b.checkin <= to);
const paceAt = (from, to, asOf) => own(overlapping(from, to).filter(b => b.madeOn && b.madeOn <= asOf), nightsOf(from, to)).booked;
const yearBack = d => (+d.slice(0, 4) - 1) + d.slice(4);
const pct = (v, of) => Math.round(100 * v / of);

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const shell = (opts = {}) => S.boardShell(Object.assign({ today: X.TODAY, cottages: X.COTTAGES, bookings: X.BOOKINGS,
    bodyStyle: 'padding:0 16px', head: S.raleway() }, opts));
  const open = async ({ w = 390, h = 900, html = shell(), mobile = w < 700, safe = null } = {}) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    if (safe) { const c = await ctx.newCDPSession(p); await c.send('Emulation.setSafeAreaInsetsOverride', { insets: safe }); }
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-stats-top'));
    await p.waitForTimeout(150);
    return { ctx, p };
  };
  const noSideScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const NOV = { from: '2026-11-01', to: '2026-11-30' }, LY = { from: '2025-11-01', to: '2025-11-30' };
  const now = own(overlapping(NOV.from, NOV.to), nightsOf(NOV.from, NOV.to));
  const ago = own(overlapping(LY.from, LY.to), nightsOf(LY.from, LY.to));
  const P = pct(now.booked, 8 * 30), PL = pct(ago.booked, 8 * 30);

  console.log('\n-- 1: the headline and its pill --');
  {
    const { ctx, p } = await open();
    const top = await p.evaluate(() => {
      const t = document.querySelector('.mphbac-staff-stats-top');
      const pill = t.querySelector('.mphbac-staff-stats-pill');
      const h = t.querySelector('.mphbac-staff-stats-headline');
      const kpi = document.querySelector('.mphbac-staff-kpi.is-booked');
      return { h: h.textContent, wrap: getComputedStyle(h).textWrap || getComputedStyle(h).textWrapStyle, align: getComputedStyle(h).textAlign,
        pillSeen: pill && pill.querySelector('[aria-hidden]').textContent + pill.querySelector('.mphbac-staff-stats-pillvs').textContent,
        pillSaid: pill && pill.querySelector('.mphbac-sr-only').textContent, pillCls: pill && pill.className,
        tile: kpi.querySelector('.mphbac-staff-kpi-num').textContent, tileDelta: kpi.querySelector('.mphbac-staff-kpi-delta [aria-hidden]').textContent,
        before: t.nextElementSibling && t.nextElementSibling.className };
    });
    check('the headline reads "November Is ' + P + '% Booked"', top.h === 'November Is ' + P + '% Booked', top.h);
    check('…the Booked tile\'s own figure', top.tile === P + '%', top.tile);
    check('…centred, text-wrap: balance', top.align === 'center' && /balance/.test(top.wrap), top.align + ' ' + top.wrap);
    const d = P - PL, arrow = d === 0 ? '±0' : (d > 0 ? '▲' : '▼') + Math.abs(d);
    check('the pill reads "' + arrow + ' vs Nov 2025" — the tile\'s ▲▼', top.pillSeen === arrow + ' vs Nov 2025' && top.tileDelta === arrow, top.pillSeen + ' / tile ' + top.tileDelta);
    check('…read as a sentence', top.pillSaid === (d > 0 ? 'up ' : 'down ') + Math.abs(d) + (Math.abs(d) === 1 ? ' point' : ' points') + ' vs Nov 2025', top.pillSaid);
    check('…in the ▲ colours (is-up / is-down)', /is-(up|down|same)/.test(top.pillCls), top.pillCls);
    // 0.57.0 (Rob's pick C): Booking Pace, its own section, sits between.
    check('Booking Pace comes straight after it, then the six tiles', /is-curve/.test(top.before) && /mphbac-staff-stats-kpis/.test(await p.evaluate(() => document.querySelector('.mphbac-staff-stats-block.is-curve').nextElementSibling.className)), top.before);
    const bt = await p.evaluate(() => document.querySelector('.mphbac-staff-kpi.is-booked .mphbac-staff-tipbox').textContent);
    check('0.53.1: the Booked tile\'s ⓘ says its ▲▼ are occupancy percentage points vs the same dates last year', /▲▼ are occupancy percentage points vs the same dates last year \(Nov\s1\s–\s30, 2025\)\./.test(bt) && !/% booked\./.test(bt), bt);
    // October 2025 cannot be compared (records complete from Oct 1, 2025, and
    // its year-earlier dates are before it): the tile shows "—", no pill.
    await p.selectOption('.mphbac-staff-stats-month', '2025-10');
    await p.waitForFunction(() => /October 2025/.test(document.querySelector('.mphbac-staff-stats-headline').textContent));
    const oct = await p.evaluate(() => ({ h: document.querySelector('.mphbac-staff-stats-headline').textContent,
      pill: !!document.querySelector('.mphbac-staff-stats-pill'), tile: document.querySelector('.mphbac-staff-kpi.is-booked .mphbac-staff-kpi-delta').className }));
    check('no comparison (Oct 2025): no pill, the tile shows "—"', !oct.pill && /is-none/.test(oct.tile), JSON.stringify(oct));
    check('…a month of another year is named with its year', /^October 2025 Is \d+% Booked$/.test(oct.h), oct.h);
    for (const [span, want] of [['year', /^2026 Is \d+% Booked$/], ['week', /^Week of Nov 1 Is \d+% Booked$/], ['day', /^Nov 3 Is \d+% Booked$/]]) {
      await p.selectOption('.mphbac-staff-stats-span', span);
      if (span === 'year') await p.selectOption('.mphbac-staff-stats-year', '2026');
      if (span === 'week' || span === 'day') { await p.fill('.mphbac-staff-stats-date', '2026-11-03'); await p.dispatchEvent('.mphbac-staff-stats-date', 'change'); }
      await p.waitForTimeout(250);
      const h = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-headline').textContent);
      check(span + ': "' + h + '"', want.test(h), h);
    }
    await ctx.close();
  }

  console.log('\n-- 1b: the pace line, every day against the oracle --');
  for (const w of [390, 320]) {
    const { ctx, p } = await open({ w });
    const read = await p.evaluate(() => {
      const plot = document.querySelector('.mphbac-staff-curve-plot');
      const out = [], N = +plot.getAttribute('aria-valuemax') + 1;
      const first = plot.getAttribute('aria-valuetext');
      plot.focus();
      plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      for (let i = 0; i < N; i++) {
        out.push(plot.getAttribute('aria-valuetext'));
        plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      return { N, first, out, role: plot.getAttribute('role'), tag: (document.querySelector('.mphbac-staff-curve-tag') || {}).textContent,
        ends: plot.getAttribute('aria-valuenow'), key: document.querySelector('.mphbac-staff-curve-key').textContent,
        paths: [...document.querySelectorAll('.mphbac-staff-curve-svg path')].map(e => e.getAttribute('class') + ':' + getComputedStyle(e).stroke + ':' + getComputedStyle(e).strokeDasharray) };
    });
    const dates = nightsOf(X.day(NOV.from, -90), X.TODAY);
    if (w === 390) {
      check('the domain: 90 days out → today (' + dates.length + ' days)', read.N === dates.length, read.N);
      check('a slider to a screen reader', read.role === 'slider');
      let bad = [];
      dates.forEach((d, i) => {
        const a = paceAt(NOV.from, NOV.to, d), b = paceAt(LY.from, LY.to, yearBack(d));
        const nt = v => v + (v === 1 ? ' night' : ' nights');
        const off = d < NOV.from ? Math.round((new Date(NOV.from) - new Date(d)) / 864e5) : null;
        const when = off === null ? 'night ' + (Math.round((new Date(d) - new Date(NOV.from)) / 864e5) + 1) : off + (off === 1 ? ' day out' : ' days out');
        const md = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+d.slice(5, 7) - 1] + ' ' + +d.slice(8);
        const want = md + ' · ' + when + ': ' + nt(a) + ' this year, ' + nt(b) + ' last year';
        if (read.out[i] !== want) bad.push(i + ' ' + read.out[i] + ' ≠ ' + want);
      });
      check('every one of the ' + dates.length + ' days, both years, equals paceNights() by definition', !bad.length, bad.slice(0, 3).join(' | '));
      const today = paceAt(NOV.from, NOV.to, X.TODAY);
      check('"Today: ' + today + ' nights" on this year\'s line', read.tag === 'Today: ' + today + ' nights', read.tag);
      check('…and the reading starts on today', read.first === read.out[read.N - 1], read.first);
      check('the echo is one night, not two (own()\'s rule): today\'s value is the booked nights made by today', today === now.booked - 2, today + ' vs ' + now.booked);
      const rising = read.out.map(t => +/: (\d+) night/.exec(t)[1]);
      check('…and the line never falls (no cancellations in the data)', rising.every((v, i) => !i || v >= rising[i - 1]));
      check('legend: "Blue this year, dashed last year."', read.key === 'Blue this year, dashed last year.', read.key);
      check('this year solid #0A50B2, last year dashed grey', read.paths.some(s => /curve-now:rgb\(10, 80, 178\):none/.test(s)) && read.paths.some(s => /curve-ly:rgb\(117, 117, 117\):6px, 4px/.test(s)), read.paths.join(' '));
    }
    // A drag along the line reads the day under the finger, both years.
    const box = await p.$eval('.mphbac-staff-curve-plot', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: box.y + box.h / 2 }] });
    await touch('touchStart', box.x + box.w * 0.2);
    for (let k = 1; k <= 8; k++) await touch('touchMove', box.x + box.w * (0.2 + 0.05 * k));
    const mid = await p.evaluate(() => {
      const plot = document.querySelector('.mphbac-staff-curve-plot');
      return { i: +plot.getAttribute('aria-valuenow'), N: +plot.getAttribute('aria-valuemax') + 1, read: plot.getAttribute('aria-valuetext'),
        seen: document.querySelector('.mphbac-staff-curve-read').innerText,
        guide: !document.querySelector('.mphbac-staff-curve-guide').hidden, dots: [...document.querySelectorAll('.mphbac-staff-curve-dot.is-now,.mphbac-staff-curve-dot.is-ly')].filter(e => !e.hidden).length };
    });
    check(w + 'px: a drag to 60% reads that day (' + mid.read + ')', Math.abs(mid.i - Math.round(0.6 * (mid.N - 1))) <= 1 && /this year, .* last year$/.test(mid.read) && mid.guide && mid.dots === 2, JSON.stringify(mid));
    check(w + 'px: …shown in two lines, the day then both years', mid.seen === mid.read.replace(': ', '\n'), JSON.stringify(mid.seen));
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await still(p, 'pace line with drag ' + w + 'px', '.mphbac-staff-stats-top');
    await touch('touchEnd');
    check(w + 'px: no sideways scroll', await noSideScroll(p));
    const fit = await p.evaluate(() => {
      const r = document.querySelector('.mphbac-staff-stats-top').getBoundingClientRect();
      const q = document.querySelector('.mphbac-staff-curve-plot').getBoundingClientRect();
      const within = (sel, o) => [...document.querySelectorAll(sel)].every(e => { const b = e.getBoundingClientRect(); return b.left >= o.left - 0.5 && b.right <= o.right + 0.5; });
      const inside = within('.mphbac-staff-curve-tag, .mphbac-staff-curve-tick', q) && within('.mphbac-staff-stats-pill, .mphbac-staff-curve-read', r);
      const ticks = [...document.querySelectorAll('.mphbac-staff-curve-tick')].map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      return { inside, overlap: ticks.some((t, i) => i && t.left < ticks[i - 1].right + 2) };
    });
    check(w + 'px: the tag, ticks, pill and reading stay inside the block; no two ticks collide', fit.inside && !fit.overlap, JSON.stringify(fit));
    await ctx.close();
  }

  console.log('\n-- 2: Nights by Cottage header --');
  {
    const { ctx, p } = await open();
    const h = await p.evaluate(() => {
      const th = document.querySelector('.mphbac-staff-percot-h.is-delta');
      const span = th.querySelector('.mphbac-staff-percot-as-typed');
      return { text: th.textContent, seen: th.innerText, aria: th.getAttribute('aria-label'), others: [...document.querySelectorAll('.mphbac-staff-percot-h:not(.is-delta)')].map(e => e.innerText),
        tt: getComputedStyle(th).textTransform, spanTt: span && getComputedStyle(span).textTransform,
        tip: document.querySelector('.mphbac-staff-stats-block.is-percot .mphbac-staff-tipbox').textContent };
    });
    check('it renders "vs 2025" (innerText, after text-transform)', h.seen === 'vs 2025' && h.text === 'vs 2025', JSON.stringify(h.seen));
    // 0.57.0 (Rob's pick C: no uppercase micro-labels): the row in Title Case.
    check('…CHANGED (0.57.0): the row in Title Case, no capitals at all', h.tt === 'none' && h.spanTt === 'none' && h.others.join('|') === 'Cottage|Nights|Occupancy', h.others.join('|'));
    check('…named "vs 2025" to a screen reader, as before', h.aria === 'vs 2025');
    check('the tip says the figures are occupancy percentage points', /▲▼ are occupancy percentage points vs the same dates last year/.test(h.tip), h.tip);
    await still(p, 'Nights by Cottage header 390px', '.mphbac-staff-stats-block.is-percot');
    await ctx.close();
  }

  console.log('\n-- 3: Nights by Source, one stacked bar --');
  for (const w of [390, 320]) {
    const { ctx, p } = await open({ w });
    const s = await p.evaluate(() => {
      const sec = document.querySelector('.mphbac-staff-stats-block.is-source');
      const bar = sec.querySelector('.mphbac-staff-srcbar');
      const bw = bar.getBoundingClientRect().width;
      return { svg: !!sec.querySelector('svg.mphbac-staff-pie, .mphbac-staff-pie-slice'),
        segs: [...bar.children].map(e => ({ k: e.getAttribute('data-source'), w: e.getBoundingClientRect().width / bw, bg: getComputedStyle(e).backgroundColor })),
        lines: [...sec.querySelectorAll('.mphbac-staff-srcbar-item')].map(e => e.textContent),
        said: [...sec.querySelectorAll('ul.mphbac-sr-only li')].map(e => e.textContent),
        hidden: bar.getAttribute('aria-hidden') + sec.querySelector('.mphbac-staff-srcbar-list').getAttribute('aria-hidden'),
        swatch: [...sec.querySelectorAll('.mphbac-staff-srcbar-item .mphbac-staff-pie-swatch')].map(e => getComputedStyle(e).backgroundColor),
        oneLine: [...sec.querySelectorAll('.mphbac-staff-srcbar-item')].every(e => e.getBoundingClientRect().height < 30) };
    });
    const order = ['direct', 'airbnb', 'booking', 'vrbo'].filter(k => now.bySource[k]);
    const name = { direct: 'Direct', airbnb: 'Airbnb', booking: 'Booking.com', vrbo: 'Vrbo' };
    const nt = v => v + (v === 1 ? ' night' : ' nights');
    if (w === 390) {
      check('no pie left', !s.svg);
      check('one bar, Direct first, then Airbnb, Booking.com, Vrbo', s.segs.map(x => x.k).join() === order.join(), s.segs.map(x => x.k).join());
      check('each segment\'s width is its share of the nights', s.segs.every(x => Math.abs(x.w - now.bySource[x.k] / now.booked) < 0.01), JSON.stringify(s.segs.map(x => x.w.toFixed(3))));
      check('a line a source: "Direct 41% · 28 nights" form', s.lines.join('|') === order.map(k => name[k] + ' ' + pct(now.bySource[k], now.booked) + '% · ' + nt(now.bySource[k])).join('|'), s.lines.join(' | '));
      check('the screen reader hears the 0.47 list, word for word', s.said.join('|') === order.map(k => name[k] + ' — ' + pct(now.bySource[k], now.booked) + '% (' + nt(now.bySource[k]) + ')').join('|'), s.said.join(' | '));
      check('the bar and the lines are its picture (aria-hidden)', s.hidden === 'truetrue');
      check('each line\'s swatch is its segment\'s colour', s.swatch.join() === s.segs.map(x => x.bg).join(), s.swatch.join(' '));
    }
    check(w + 'px: every line on one line; no sideways scroll', s.oneLine && await noSideScroll(p));
    await still(p, 'Nights by Source bar ' + w + 'px', '.mphbac-staff-stats-block.is-source');
    await ctx.close();
  }

  console.log('\n-- 4: Days Booked Ahead, mean · median · mode --');
  for (const w of [320, 390, 1280]) {
    const { ctx, p } = await open({ w });
    const rows = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-lead-row')].map(r => ({
      k: r.getAttribute('data-source'), name: r.querySelector('.mphbac-staff-lead-name').textContent, count: r.querySelector('.mphbac-staff-lead-count').textContent,
      figs: [...r.querySelectorAll('.mphbac-staff-lead-fig')].map(f => f.querySelector('.mphbac-staff-lead-label').textContent + '=' + f.querySelector('.mphbac-staff-lead-num').textContent),
      seen: [...r.querySelectorAll('.mphbac-staff-lead-num')].map(n => [...n.childNodes].filter(c => !(c.classList && c.classList.contains('mphbac-sr-only'))).map(c => c.textContent).join('')),
      one: [...r.querySelectorAll('.mphbac-staff-lead-num, .mphbac-staff-lead-label')].every(n => n.getClientRects().length === 1 && n.getBoundingClientRect().height < 26),
      text: r.textContent })));
    const want = {
      direct: ['54 days', '12 days', '12 days', 5], airbnb: ['11 days', '9 days', null, 3], booking: ['9 days', '9 days', '3 days', 5],
      vrbo: ['27 days', '26 days', null, 4], all: ['27 days', '12 days', '3 days', 17] };
    if (w === 390) {
      check('rows: Direct, Airbnb, Booking.com, Vrbo, All Sources', rows.map(r => r.k).join() === 'direct,airbnb,booking,vrbo,all', rows.map(r => r.k).join());
      for (const r of rows) {
        const [mean, median, mode, n] = want[r.k];
        const figs = ['Mean=' + mean, 'Median=' + median, 'Mode=' + (mode || '—none')];
        check(r.name + ' ' + r.count + ': ' + r.seen.join(' · '), r.figs.join() === figs.join() && r.count === ' (' + n + ' stays)', r.figs.join());
      }
      check('Direct by hand: 5, 12, 12, 40, 200 → mean 54 (53.8), median 12, mode 12', rows[0].seen.join() === '54 days,12 days,12 days');
      check('Airbnb 3, 9, 20: no value twice → mode shown "—", read "none"', rows[1].seen[2] === '—' && /Mode none/.test(rows[1].text.replace(/—/g, '')), rows[1].text);
      check('Booking.com 3, 3, 9, 9, 20: a tie → the smaller, 3', rows[2].seen[2] === '3 days');
      check('Vrbo 10, 20, 31, 45: even count → median (20 + 31) / 2 = 25.5 → 26', rows[3].seen[1] === '26 days');
      check('All 17: a three-way tie (3, 9, 20 three times each) → 3', rows[4].seen[2] === '3 days');
      const tip = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-block.is-lead .mphbac-staff-tipbox').textContent);
      check('the ⓘ says it in plain words', ['Mean is the average.', 'Median is the middle booking: half booked sooner, half later.', 'Mode is the most common number of days.',
        'One very early booking pulls the mean up; the median doesn\'t move.'].every(t => tip.includes(t)), tip);
    }
    check(w + 'px: every label and figure on one line', rows.every(r => r.one), rows.filter(r => !r.one).map(r => r.k).join());
    check(w + 'px: no sideways scroll', await noSideScroll(p));
    if (w !== 1280) await still(p, 'Days Booked Ahead ' + w + 'px', '.mphbac-staff-stats-block.is-lead');
    await ctx.close();
  }

  console.log('\n-- 5: an open ⓘ: nothing shows through --');
  for (const w of [390, 1280]) {
    const { ctx, p } = await open({ w });
    const n = await p.evaluate(() => document.querySelectorAll('.mphbac-staff .mphbac-staff-tip').length);
    const bad = [];
    for (let i = 0; i < n; i++) {
      const r = await p.evaluate(async i => {
        const btn = document.querySelectorAll('.mphbac-staff .mphbac-staff-tip')[i];
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const box = btn._box || document.getElementById(btn.getAttribute('aria-controls'));
        const b = box.getBoundingClientRect();
        const over = [];
        for (let x = 1; x < 10; x++) for (let y = 1; y < 10; y++) {
          const px = b.left + b.width * x / 10, py = b.top + b.height * y / 10;
          if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) continue;
          const at = document.elementFromPoint(px, py);
          if (!box.contains(at)) over.push((at && at.className && at.className.baseVal !== undefined ? at.className.baseVal : at && at.className) + '');
        }
        const key = btn.getAttribute('data-tip');
        btn.click(); btn.click();   // pinned → closed
        document.body.click();
        return { key, over: [...new Set(over)] };
      }, i);
      if (r.over.length) bad.push(r.key + ': ' + r.over.join(','));
    }
    check(w + 'px: all ' + n + ' ⓘ opened in turn, nothing painted over any of them', n >= 12 && !bad.length, n + ' ' + bad.join(' | '));
    if (w === 390) {
      // The 0.52.0 fault, kept as the still: the Bookings tile's tip over the
      // next tiles' ⓘ.
      await p.evaluate(() => { const b = document.querySelector('.mphbac-staff-kpi.is-bookings .mphbac-staff-tip'); b.scrollIntoView({ block: 'center' }); b.click(); });
      await p.waitForTimeout(100);
      await still(p, 'open tip no show-through 390px', '.mphbac-staff-stats-kpis');
    }
    await ctx.close();
  }

  console.log('\n-- 6: the foot of the page and the home bar (0.53.1: /staff/\'s own viewport tag) --');
  {
    // LIVE'S <head> ORDER: the theme's viewport tag first (live's, read
    // 2026-11-03), then — on the staff page only — the plugin's, exactly as
    // Staff::viewport_meta() prints it (the constant read from the PHP).
    const THEME = '<meta name="viewport" content="width=device-width, user-scalable=yes, initial-scale=1.0">';
    const VP = /public const VIEWPORT = '([^']+)'/.exec(require('fs').readFileSync(S.ROOT + '/includes/class-staff.php', 'utf8'))[1];
    const PLUGIN = '<meta name="viewport" content="' + VP + '">';
    const live = (withPlugin) => shell().replace('<meta name="viewport" content="width=device-width,initial-scale=1">', THEME + (withPlugin ? '\n' + PLUGIN : ''));
    check('the plugin\'s tag is the theme\'s values plus viewport-fit=cover', VP === 'width=device-width, user-scalable=yes, initial-scale=1.0, viewport-fit=cover', VP);
    // An iPhone 14 viewport (390 × 844, home indicator 34px).
    const SAFE = { top: 47, bottom: 34, left: 0, right: 0 };
    const { ctx, p } = await open({ w: 390, h: 844, html: live(true), safe: SAFE });
    const r = await p.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const root = document.querySelector('.mphbac-staff');
      const items = [...root.querySelectorAll('.mphbac-staff-heat-key, .mphbac-staff-heat')];
      const last = items[items.length - 1].getBoundingClientRect();
      return { pad: getComputedStyle(root).paddingBottom, side: getComputedStyle(root).paddingLeft + ' ' + getComputedStyle(root).paddingRight, lastBottom: last.bottom, vh: innerHeight,
        metas: document.querySelectorAll('meta[name="viewport"]').length };
    });
    check('theme tag, then the plugin\'s (two tags, the last one used): the shell\'s foot padded 34px', r.pad === '34px' && r.metas === 2, r.pad + ' / ' + r.metas + ' tags');
    check('…the last line ends above the home bar (' + Math.round(r.lastBottom) + ' ≤ ' + (r.vh - 34) + ')', r.lastBottom <= r.vh - 34 + 0.5, JSON.stringify(r));
    check('…portrait: no side insets, so no side padding', r.side === '0px 0px', r.side);
    // For the still only: the home indicator drawn where iOS draws it, in
    // the 34px the inset reserves.
    await p.evaluate(() => {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:34px;background:rgba(0,0,0,.06);z-index:99999;pointer-events:none';
      bar.innerHTML = '<div style="position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:#000"></div>';
      document.body.appendChild(bar);
    });
    await still(p, 'page bottom iPhone safe area 390px');
    if (OUT) {
      const fs = require('fs');
      const from = path.join(OUT, 'Availability Calendar - 0.53.0 page bottom iPhone safe area 390px.png');
      fs.renameSync(from, path.join(OUT, 'Availability Calendar - 0.53.1 page bottom iPhone safe area 390px.png'));
    }
    await ctx.close();
    // Sideways (844 × 390): the notch's 47px on the left is the page's now.
    const { ctx: c3, p: p3 } = await open({ w: 844, h: 390, mobile: true, html: live(true), safe: { top: 0, bottom: 21, left: 47, right: 47 } });
    const side = await p3.evaluate(() => { const root = document.querySelector('.mphbac-staff'); return { pad: getComputedStyle(root).paddingLeft + ' ' + getComputedStyle(root).paddingRight, left: document.querySelector('.mphbac-staff-chart, .mphbac-staff-grid').getBoundingClientRect().left }; });
    check('sideways: the shell keeps clear of the notch (47px each side)', side.pad === '47px 47px' && side.left >= 47, JSON.stringify(side));
    await c3.close();
    // THE LAST TAG IS THE ONE USED. Chromium reports an emulated inset
    // whatever viewport-fit says (iOS applies it only with cover), so it
    // cannot show the theme's tag alone ignoring it — that is proved where
    // it happens, in staff-robots-test.php: no other page gets a second
    // tag. What a browser CAN show is the mechanism the fix rests on: of two
    // viewport tags, the later governs. A first tag of width=980 followed by
    // the plugin's: the page is laid out at the device's 390, not 980.
    const two = shell().replace('<meta name="viewport" content="width=device-width,initial-scale=1">', '<meta name="viewport" content="width=980">\n' + PLUGIN);
    const { ctx: c2, p: p2 } = await open({ w: 390, h: 844, html: two });
    const iw = await p2.evaluate(() => innerWidth);
    check('of two viewport tags the later one is used (width=980 then the plugin\'s → laid out at ' + iw + 'px)', iw === 390, iw);
    await c2.close();
    const one = shell().replace('<meta name="viewport" content="width=device-width,initial-scale=1">', '<meta name="viewport" content="width=980">');
    const { ctx: c4, p: p4 } = await open({ w: 390, h: 844, html: one });
    const iw1 = await p4.evaluate(() => innerWidth);
    check('…control: the width=980 tag alone does govern (laid out at ' + iw1 + 'px)', iw1 === 980, iw1);
    await c4.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(1); });
