'use strict';
/**
 * 0.46.0 STATS (Rob, the WD's spec of 2026-10-12), DRIVEN IN A REAL PAGE WITH
 * THE SHIPPED (minified) staff.js: the ⓘ tips, Nights Booked by Cottage with
 * % / rank / ▲ ▼ against the previous timeframe, the ‹ › arrows, every tile
 * against a year earlier, length of stay, arrivals by weekday, how far ahead
 * they book, pace, the year's heat map, the "Records complete from" gate,
 * and last year's ghosts on the chart.
 *
 * THE FIXTURE IS SMALL ON PURPOSE: every figure below is worked out by hand
 * in the comment beside it. "Today" is Thursday 2026-10-08 (the board
 * fixture's); Records complete from is the shipped default, 2025-10-01.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const F = require('./board-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'http://staff.test/';
const TODAY = '2026-10-08';
const bk = (id, ci, co, cottage, src, madeOn, name = 'Guest ' + id) => ({
  id, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co, guestName: name,
  imported: src !== 'direct', source: { key: src }, sourceKey: src, pets: false, guests: '2', madeOn,
  cottages: [{ roomTypeId: cottage, roomId: cottage * 10, title: '', abbrev: '', number: String(cottage) }],
});
const BOOKINGS = [
  // ---- October 2026 (31 nights; 8 cottages = 248 cottage-nights) ----
  bk(101, '2026-10-01', '2026-10-11', 22, 'direct', '2026-09-01', 'Amy Archer'),   // 10 nights; lead 30
  bk(102, '2026-10-05', '2026-10-08', 23, 'airbnb', '2026-08-26', 'Ben Brook'),    // 3; lead 40
  bk(103, '2026-10-03', '2026-10-05', 23, 'booking', '2026-10-04', 'Cal Crane'),   // 2; MADE AFTER ITS CHECK-IN: no lead
  bk(104, '2026-10-20', '2026-11-20', 24, 'vrbo', '2026-06-22', 'Dot Drake'),      // 31 (12 in Oct); lead 120
  bk(105, '2026-09-28', '2026-10-02', 25, 'direct', '2026-09-01', 'Eli Earl'),     // 4 (1 in Oct, 3 in Sep); arrives in Sep
  bk(106, '2026-10-05', '2026-10-08', 23, 'airbnb', '2026-08-27', 'Reserved'),     // a channel block echoing 102: owns no night
  bk(107, '2026-10-14', '2026-10-21', 26, 'direct', '2026-10-07', 'Fay Fenn'),     // 7; lead 7
  // ---- September 2026 (the previous timeframe) ----
  bk(108, '2026-09-10', '2026-09-25', 22, 'direct', '2026-08-01', 'Gil Gray'),     // 15
  // ---- December 2026, for pace ----
  bk(109, '2026-12-01', '2026-12-11', 28, 'direct', '2026-10-01', 'Hal Hart'),     // 10
  // ---- October 2025 (a year earlier) and pace a year ago ----
  bk(201, '2025-10-02', '2025-10-09', 22, 'direct', '2025-07-01', 'Ida Ince'),     // 7
  bk(202, '2025-10-10', '2025-10-12', 27, 'airbnb', '2025-10-01', 'Jo Judd'),      // 2
  bk(203, '2025-11-01', '2025-11-11', 23, 'vrbo', '2025-10-20', 'Kit Kemp'),       // made AFTER 2025-10-08: not on the books a year ago
  bk(204, '2025-10-15', '2025-10-25', 24, 'booking', '2025-10-16', 'Lou Lark'),    // 10; made after its own check-in (and after 10-08)
  bk(205, '2025-12-20', '2026-01-03', 26, 'direct', '2025-09-15', 'Mo Mead'),      // 14, on the books a year ago
  bk(206, '2025-10-20', '2025-10-22', 25, 'direct', '', 'Ned Noon'),               // 2; NO made-on date
];
const NAMES = BOOKINGS.map(b => b.guestName).filter(n => n !== 'Reserved');
// DOCK BLOCKS (0.46.1, Rob: "Leave them out"): the owner's own closures,
// flagged notStay BY THE SERVER (staff-board-data-test.php proves the
// matching). One in every window Stats reads — this October (with a
// channel's echo of it, which must not count either), last September (the
// previous timeframe), last October (a year earlier), December (pace now)
// and November 2025 (pace a year ago).
const dock = (id, ci, co, cottage, src, madeOn, name = 'DOCK BLOCK') => Object.assign(bk(id, ci, co, cottage, src, madeOn, name), { notStay: name === 'DOCK BLOCK' });
const DOCKS = [
  dock(301, '2026-10-01', '2026-11-10', 29, 'direct', '2026-09-30'),
  dock(302, '2026-10-01', '2026-11-10', 29, 'airbnb', '2026-10-01', 'Reserved'),   // the channel's echo of the dock block
  dock(303, '2026-09-07', '2026-09-30', 28, 'direct', '2026-09-01'),
  dock(304, '2025-10-05', '2025-10-25', 29, 'direct', '2025-09-01'),
  dock(305, '2026-12-01', '2026-12-20', 27, 'direct', '2026-10-01'),
  dock(306, '2025-11-01', '2025-11-20', 27, 'direct', '2025-09-01'),
  dock(307, '2026-10-10', '2026-10-14', 26, 'direct', '2026-10-01'),   // ends the day Fay arrives in #26: no turnover
];

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const shell = (opts = {}) => S.boardShell(Object.assign({ today: TODAY, cottages: F.COTTAGES, bookings: BOOKINGS, bodyStyle: 'padding:0 16px' }, opts));
  const open = async ({ phone = false, w, html = shell(), stats = true } = {}) => {
    const ctx = await browser.newContext(phone ? { viewport: { width: w || 375, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: w || 1280, height: 1000 } });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    if (stats) {
      await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
      await p.waitForFunction(() => document.querySelector('.mphbac-staff-stats-kpis'));
      await p.waitForTimeout(100);
    }
    return { ctx, p };
  };
  const settle = p => p.waitForTimeout(200);
  const tiles = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mphbac-staff-kpi')].map(k =>
    [k.className.replace('mphbac-staff-kpi is-', ''), [k.querySelector('.mphbac-staff-kpi-num').textContent,
      k.querySelector('.mphbac-staff-kpi-delta [aria-hidden]').textContent, k.querySelector('.mphbac-staff-kpi-delta .mphbac-sr-only').textContent]])));
  const range = p => p.evaluate(() => document.querySelector('.mphbac-staff-stats-range').textContent);

  console.log('\n-- 0.46.0 B9 + C13: the tiles against a year earlier, the cottages ranked --');
  {
    const { ctx, p } = await open();
    const k = await tiles(p);
    // Oct 2026: 35 cottage-nights (22: 10, 23: 3+2, 24: 12, 25: 1, 26: 7) of
    // 248 = 14%; six bookings own a night (the echo owns none); Length
    // (10+3+2+31+4+7)/6 = 9.5; arrivals 5 and departures 5 — each STAY once
    // (0.46.1, Rob: the echo of Ben is not a second arrival); one turnover
    // (#23 on Oct 5: Cal out, Ben in). The dock blocks (#29) count nowhere.
    // Oct 2025: 21 nights (7+2+10+2) = 8%; 4 bookings; Length 21/4 = 5.25;
    // 4 arrivals, 4 departures, no turnover.
    check('Bookings 6 ▲2', k.bookings[0] === '6' && k.bookings[1] === '▲2', k.bookings);
    check('Booked 14% ▲6 — in POINTS (14 − 8)', k.booked[0] === '14%' && k.booked[1] === '▲6', k.booked);
    check('Length 9.5 nights ▲4.3 — in NIGHTS (9.5 − 5.25)', k.length[0] === '9.5 nights' && k.length[1] === '▲4.3', k.length);
    check('Arrivals 5 ▲1, Departures 5 ▲1 — each stay ONCE: Ben and the channel block echoing him are one arrival (0.46.1); Turnovers 1 ▲1',
      k.arrivals.slice(0, 2).join() === '5,▲1' && k.departures.slice(0, 2).join() === '5,▲1' && k.turnovers.slice(0, 2).join() === '1,▲1', k);
    check('...each read as a sentence: "up 6 points on the same dates a year earlier"; Length in nights; counts plain',
      k.booked[2] === 'up 6 points on the same dates a year earlier' && k.length[2] === 'up 4.3 nights on the same dates a year earlier'
      && k.arrivals[2] === 'up 1 on the same dates a year earlier', [k.booked[2], k.length[2], k.arrivals[2]]);
    const tipText = await p.evaluate(() => document.querySelector('.mphbac-staff-kpi.is-bookings .mphbac-staff-tipbox').textContent);
    check('...and the tip names the dates compared: Oct 1 – 31, 2025', /same dates last year \(Oct 1 – 31, 2025\)/.test(tipText), tipText);

    const per = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-percot-row')].map(r => [
      r.querySelector('.mphbac-staff-percot-name').textContent, r.querySelector('.mphbac-staff-percot-num').textContent,
      r.querySelector('.mphbac-staff-percot-pct').textContent, r.querySelector('.mphbac-staff-percot-delta [aria-hidden]').textContent,
      r.querySelector('.mphbac-staff-percot-fill').style.width]));
    // % of the timeframe's 31 nights; Sep (30 nights): #22 15 = 50%, #25 3 = 10%.
    check('RANKED by % booked, highest first; ties (0%) in cottage order',
      JSON.stringify(per.map(r => r[0])) === JSON.stringify(['#24 C24', '#22 Blue Heron', '#26 C26', '#23 Kingfisher', '#25 C25', '#27 C27', '#28 C28', '#29 C29']), per.map(r => r[0]));
    check('each row: nights, % of the timeframe\'s nights, its bar — #24 12 nights 39%, bar 38.7%',
      per[0][1] === '12 nights' && per[0][2] === '39%' && per[0][4] === '38.7%', per[0]);
    check('▲ ▼ in points against the PREVIOUS timeframe (Sep): #24 ▲39, #22 ▼18 (32 − 50), #25 ▼7 (3 − 10), #23 ▲16, #27 ±0',
      per[0][3] === '▲39' && per[1][3] === '▼18' && per[4][3] === '▼7' && per[3][3] === '▲16' && per[5][3] === '±0', per.map(r => r[3]));
    const tip = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-block.is-percot .mphbac-staff-tipbox').textContent);
    check('...its tip: the share of its 31 nights, and the previous timeframe named (Sep 1 – 30, 2026)', /share of this period's 31 nights/.test(tip) && /period before \(Sep 1 – 30, 2026\)/.test(tip), tip);

    // C16 stay-length mix: the Bookings set — 2 (Cal), 3 (Ben), 4 (Eli),
    // 7 (Fay), 10 (Amy), 31 (Dot).
    const mix = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-mix-row')].map(r => r.textContent));
    check('Length of Stay: 1–2 1 (17%), 3–6 2 (33%), 7–27 2 (33%), 28+ 1 (17%) — the six bookings Bookings counts',
      JSON.stringify(mix) === JSON.stringify(['1–2 nights1 (17%)', '3–6 nights2 (33%)', '7–27 nights2 (33%)', '28+ nights1 (17%)']), mix);

    // C12 weekday chart. Oct 1 2026 is a Thursday. In: Thu 1 (Amy), Sat 3
    // (Cal), Mon 5 (Ben — the echo is not a second stay), Wed 14 (Fay), Tue
    // 20 (Dot). Out: Fri 2 (Eli), Mon 5 (Cal), Thu 8 (Ben), Sun 11 (Amy), Wed
    // 21 (Fay).
    const wk = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-wk-day')].map(d =>
      [d.querySelector('.mphbac-staff-wk-name').textContent, d.querySelector('.is-in .mphbac-staff-wk-num').textContent, d.querySelector('.is-out .mphbac-staff-wk-num').textContent]));
    check('Arrivals and Departures by Weekday, Sunday to Saturday',
      JSON.stringify(wk) === JSON.stringify([['Sun', '0', '1'], ['Mon', '1', '1'], ['Tue', '1', '0'], ['Wed', '1', '1'], ['Thu', '1', '1'], ['Fri', '0', '1'], ['Sat', '1', '0']]), wk);
    check('...adding up to the tiles (5 and 5)', wk.reduce((t, d) => t + +d[1], 0) === 5 && wk.reduce((t, d) => t + +d[2], 0) === 5);
    const wkSr = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-block.is-weekdays ul.mphbac-sr-only').textContent);
    check('...and as text for a screen reader, singular for one ("Monday: 1 arrival, 1 departure"; "Sunday: 0 arrivals, 1 departure")',
      /Monday: 1 arrival, 1 departure/.test(wkSr) && /Sunday: 0 arrivals, 1 departure/.test(wkSr), wkSr);

    // C15 lead time: arrivals in Oct from the Bookings set — Amy 30, Ben 40,
    // Dot 120, Fay 7; Cal was made AFTER her check-in and is left out; the
    // echo is not in the set. Direct (30+7)/2 = 18.5 → 19.
    const lead = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-lead-row')].map(r => r.textContent));
    check('How Far Ahead They Book: Direct 19 days (2 stays), Airbnb 40 (1), Vrbo 120 (1), all 49 (4) — no Booking.com (Cal made after check-in)',
      JSON.stringify(lead) === JSON.stringify(['Direct19 days (2 stays)', 'Airbnb40 days (1 stay)', 'Vrbo120 days (1 stay)', 'All sources49 days (4 stays)']), lead);

    // C14 pace from tonight (Oct 8). Now: Amy 3 (8–10), Dot 18 / 31 / 31,
    // Fay 7, Hal 0 / 6 / 10 → 28 / 47 / 51. A year ago, as booked ON
    // 2025-10-08: Ida 1 (Oct 8), Jo 2; Mo 14 in the 90 only; Kit and Lou
    // were made later, Ned has no made-on date → 3 / 3 / 17.
    const pace = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-pace-row')].map(r =>
      [r.querySelector('.mphbac-staff-pace-num').textContent, [...r.querySelectorAll('.mphbac-staff-pace-delta [aria-hidden]')].map(x => x.textContent).join('')]));
    check('Pace: 28 / 47 / 51 nights booked, ▲25 / ▲44 / ▲34 vs a year ago',
      JSON.stringify(pace) === JSON.stringify([['28 nights booked', '▲25 vs a year ago'], ['47 nights booked', '▲44 vs a year ago'], ['51 nights booked', '▲34 vs a year ago']]), pace);
    const paceTip = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-block.is-pace .mphbac-staff-tipbox').textContent);
    check('...its tip says the year-ago figure is slightly low (cancellations are not kept)', /a little low: cancelled bookings are not kept/.test(paceTip), paceTip);

    // C11 the heat map: 2026, Oct outlined; Oct 5 has #22 and #23 (the echo
    // is the same cottage) = 2; Oct 20 #24 + #26 = 2; Oct 14 #26 = 1.
    const heat = await p.evaluate(() => {
      const c = d => document.querySelector('.mphbac-staff-heat-day[data-day="' + d + '"]');
      return { months: document.querySelectorAll('.mphbac-staff-heat-month').length, days: document.querySelectorAll('.mphbac-staff-heat-days .mphbac-staff-heat-day[data-day]').length,
        n5: c('2026-10-05').dataset.n, l5: c('2026-10-05').classList.contains('is-l2'), n14: c('2026-10-14').dataset.n, n20: c('2026-10-20').dataset.n,
        inOct: c('2026-10-01').classList.contains('is-in') && c('2026-10-31').classList.contains('is-in'), outSep: !c('2026-09-30').classList.contains('is-in'),
        edges: [c('2026-10-01').className, c('2026-10-15').className], full: getComputedStyle(document.querySelector('.mphbac-staff-heat-key .is-l8')).backgroundColor,
        title: c('2026-10-05').title, hidden: document.querySelector('.mphbac-staff-heat').getAttribute('aria-hidden') };
    });
    check('Heat map: twelve months, 365 nights of 2026', heat.months === 12 && heat.days === 365, heat);
    check('...shaded by cottages booked that night: Oct 5 = 2 (the echo is the same cottage), Oct 14 = 1, Oct 20 = 2', heat.n5 === '2' && heat.l5 && heat.n14 === '1' && heat.n20 === '2', heat);
    check('...the timeframe outlined (Oct 1–31 in, Sep 30 out), on its OUTER edges only',
      heat.inOct && heat.outSep && /is-et/.test(heat.edges[0]) && !/is-e[tbrl]/.test(heat.edges[1]), heat.edges);
    check('...in one hue: the site\'s button blue #0A50B2 at full', heat.full === 'rgb(10, 80, 178)', heat.full);
    check('...a night\'s hover text is a count, no name: "Oct 5, 2026: 2 of 8 cottages booked"', heat.title === 'Oct 5, 2026: 2 of 8 cottages booked', heat.title);

    // E: aggregate figures only. No guest's name anywhere in the section.
    const text = await p.evaluate(() => document.querySelector('.mphbac-staff-stats').textContent + [...document.querySelectorAll('.mphbac-staff-stats [title]')].map(e => e.title).join(' '));
    check('NO guest name anywhere in Stats (tiles, blocks, tips, hover text)', NAMES.every(n => !text.includes(n)), NAMES.filter(n => text.includes(n)));

    // Tapping a night jumps the board to it.
    await p.evaluate(() => document.querySelector('.mphbac-staff-period').value);
    await p.click('.mphbac-staff-heat-day[data-day="2026-11-14"]');
    await settle(p);
    const j = await p.evaluate(() => ({ go: document.querySelector('.mphbac-staff-goto').value, from: document.querySelector('.mphbac-staff-chart').getAttribute('data-from'),
      top: Math.round(document.querySelector('.mphbac-staff-topbar').getBoundingClientRect().top), title: document.querySelector('.mphbac-staff-title').textContent }));
    check('tapping Nov 14 on the heat map opens the board on it (Monthly → November) and brings the board into view',
      j.go === '2026-11-14' && j.from === '2026-11-01' && j.top >= -1 && j.top < 200, j);
    await ctx.close();
  }

  console.log('\n-- 0.46.0 B8: the ⓘ tips --');
  for (const phone of [false, true]) {
    const DEV = phone ? '375px phone' : 'desktop';
    const { ctx, p } = await open({ phone });
    const all = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tip')].map(b => ({
      tag: b.tagName, type: b.type, exp: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'),
      ctl: !!document.getElementById(b.getAttribute('aria-controls')), hidden: document.getElementById(b.getAttribute('aria-controls')).hidden,
      text: document.getElementById(b.getAttribute('aria-controls')).textContent, tab: b.tabIndex })));
    check(`${DEV}: a real <button> ⓘ on every tile (6) and block (7), collapsed, each controlling its own hidden bubble`,
      all.length === 13 && all.every(b => b.tag === 'BUTTON' && b.type === 'button' && b.exp === 'false' && b.ctl && b.hidden && b.tab === 0 && b.text.length > 20), all.length);
    check(`${DEV}: ...named for what it explains ("About Booked")`, all.some(b => b.label === 'About Booked'), all.map(b => b.label));
    if (!phone) {
      console.log('   EVERY TIP\'S TEXT (for the check list):');
      all.forEach(b => console.log('   · ' + b.label.replace('About ', '') + ': ' + b.text));
    }
    const state = () => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tip')].filter(b => !document.getElementById(b.getAttribute('aria-controls')).hidden)
      .map(b => [b.getAttribute('data-tip'), b.getAttribute('aria-expanded')]));
    await p.click('.mphbac-staff-kpi.is-booked .mphbac-staff-tip');
    let s = await state();
    check(`${DEV}: tap / click opens it — aria-expanded true`, JSON.stringify(s) === '[["booked","true"]]', s);
    const box = await p.evaluate(() => { const b = document.querySelector('.mphbac-staff-kpi.is-booked .mphbac-staff-tipbox').getBoundingClientRect(),
      t = document.querySelector('.mphbac-staff-kpi.is-booked .mphbac-staff-tip'), c = getComputedStyle(t);
      return { l: b.left, r: b.right, w: innerWidth, top: b.top, btn: t.getBoundingClientRect().bottom, bg: c.backgroundColor, radius: c.borderRadius, size: [t.offsetWidth, t.offsetHeight] }; });
    check(`${DEV}: ...the bubble under its button, wholly on screen`, box.l >= 0 && box.r <= (phone ? 375 : 1280) && box.w === (phone ? 375 : 1280) && box.top > box.btn, box);
    check(`${DEV}: ...the ⓘ stays an icon after the tap: no theme coral (button:focus), 24px target`, box.bg === 'rgba(0, 0, 0, 0)' && box.size.join() === '24,24', box);
    await p.click('.mphbac-staff-stats-block.is-source .mphbac-staff-tip');
    s = await state();
    check(`${DEV}: ONE at a time — opening Nights Booked by Source closes Booked`, JSON.stringify(s) === '[["source","true"]]', s);
    await p.click('.mphbac-staff-stats-block.is-source .mphbac-staff-tip');
    s = await state();
    check(`${DEV}: tapping the same ⓘ again closes it`, s.length === 0, s);
    await p.click('.mphbac-staff-kpi.is-booked .mphbac-staff-tip');
    await p.click('.mphbac-staff-kpi.is-booked .mphbac-staff-tipbox');
    s = await state();
    check(`${DEV}: a tap on the bubble itself closes it (on a phone it covers the tiles below)`, s.length === 0, s);
    await p.click('.mphbac-staff-stats-block.is-pace .mphbac-staff-tip');
    await p.click('.mphbac-staff-stats-range');
    s = await state();
    check(`${DEV}: tapping anywhere else closes it`, s.length === 0, s);
    // The keyboard: Tab reaches it, Enter opens, Escape closes and returns focus.
    await p.focus('.mphbac-staff-kpi.is-length .mphbac-staff-tip');
    await p.keyboard.press('Enter');
    s = await state();
    await p.keyboard.press('Escape');
    const after = await p.evaluate(() => [document.activeElement.getAttribute('data-tip'), document.querySelectorAll('.mphbac-staff-tipbox:not([hidden])').length]);
    check(`${DEV}: keyboard — Enter opens, Escape closes and leaves focus on the ⓘ`, JSON.stringify(s) === '[["length","true"]]' && after[0] === 'length' && after[1] === 0, [s, after]);
    if (!phone) {
      await p.hover('.mphbac-staff-kpi.is-turnovers .mphbac-staff-tip');
      s = await state();
      await p.mouse.move(5, 5);
      const gone = await state();
      check('desktop: HOVER shows it, and moving away hides it', JSON.stringify(s) === '[["turnovers","true"]]' && gone.length === 0, [s, gone]);
      await p.hover('.mphbac-staff-kpi.is-turnovers .mphbac-staff-tip');
      await p.click('.mphbac-staff-kpi.is-turnovers .mphbac-staff-tip');
      await p.mouse.move(5, 5);
      s = await state();
      check('desktop: a click while hovering keeps it open after the mouse leaves', JSON.stringify(s) === '[["turnovers","true"]]', s);
      // A refresh (quiet) keeps a pinned tip open.
      await p.evaluate(() => { document.querySelector('.mphbac-staff-stats-span').dispatchEvent(new Event('change')); });
      await settle(p);
      s = await state();
      check('desktop: a redraw of the figures keeps the open tip open', JSON.stringify(s) === '[["turnovers","true"]]', s);
    } else {
      await p.tap('.mphbac-staff-kpi.is-turnovers .mphbac-staff-tip');
      s = await state();
      check('phone: a TAP opens it (no hover on a touch screen)', JSON.stringify(s) === '[["turnovers","true"]]', s);
      const edge = await p.evaluate(() => { const b = document.querySelector('.mphbac-staff-kpi.is-turnovers .mphbac-staff-tipbox').getBoundingClientRect(),
        t = document.querySelector('.mphbac-staff-kpi.is-turnovers .mphbac-staff-tip').getBoundingClientRect();
        return { l: b.left, r: b.right, w: innerWidth, btnRight: t.right }; });
      // Against the PHONE's 375, not innerWidth: a mobile page that overflows
      // widens its own layout viewport, and innerWidth grows with the spill.
      check('phone: the right-hand tile\'s bubble is kept on screen (it would spill past the edge centred under its ⓘ)', edge.l >= 0 && edge.r <= 375 && edge.w === 375, edge);
    }
    await ctx.close();
  }

  console.log('\n-- 0.46.0 B10: ‹ › round the date line --');
  {
    const { ctx, p } = await open();
    const look = () => p.evaluate(() => ({ range: document.querySelector('.mphbac-staff-stats-range').textContent,
      month: document.querySelector('.mphbac-staff-stats-month').value, year: document.querySelector('.mphbac-staff-stats-year').value,
      date: document.querySelector('.mphbac-staff-stats-date').value, from: document.querySelector('.mphbac-staff-stats-from').value, to: document.querySelector('.mphbac-staff-stats-to').value,
      prev: document.querySelector('.mphbac-staff-stats-prev').disabled, next: document.querySelector('.mphbac-staff-stats-next').disabled,
      pl: document.querySelector('.mphbac-staff-stats-prev').getAttribute('aria-label') }));
    let v = await look();
    check('"‹ Oct 1 – 31, 2026 ›" — the date line between the two arrows, in Rob\'s style', v.range === 'Oct 1 – 31, 2026' && !v.prev && !v.next && v.pl === 'Previous month', v);
    await p.click('.mphbac-staff-stats-prev'); await settle(p);
    v = await look();
    check('‹ steps back one Month — the Month picker follows', v.range === 'Sep 1 – 30, 2026' && v.month === '2026-09', v);
    const k = await tiles(p);
    check('...and the figures with it (September: Bookings 2 — Gil, Eli)', k.bookings[0] === '2', k.bookings);
    await p.click('.mphbac-staff-stats-next'); await p.click('.mphbac-staff-stats-next'); await settle(p);
    v = await look();
    check('› › forward two: November', v.range === 'Nov 1 – 30, 2026' && v.month === '2026-11', v);
    await p.selectOption('.mphbac-staff-stats-span', 'week'); await settle(p);
    await p.click('.mphbac-staff-stats-next'); await settle(p);
    v = await look();
    check('Week: › steps a week (Sun–Sat), the "Week of" picker follows', v.range === 'Nov 8 – 14, 2026' && v.date === '2026-11-08' && v.pl === 'Previous week', v);
    await p.selectOption('.mphbac-staff-stats-span', 'day'); await settle(p);
    await p.click('.mphbac-staff-stats-prev'); await settle(p);
    v = await look();
    check('Day: ‹ steps a day', v.range === 'Nov 7, 2026' && v.date === '2026-11-07', v);
    await p.selectOption('.mphbac-staff-stats-span', 'custom');
    await p.fill('.mphbac-staff-stats-from', '2026-10-03'); await p.fill('.mphbac-staff-stats-to', '2026-10-09');
    await p.dispatchEvent('.mphbac-staff-stats-to', 'change'); await settle(p);
    await p.click('.mphbac-staff-stats-next'); await settle(p);
    v = await look();
    check('Custom: › steps by the range\'s OWN length (7 days), and From / To follow', v.range === 'Oct 10 – 16, 2026' && v.from === '2026-10-10' && v.to === '2026-10-16' && v.pl === 'Previous timeframe', v);
    await p.selectOption('.mphbac-staff-stats-span', 'year'); await settle(p);
    await p.selectOption('.mphbac-staff-stats-year', '2029'); await settle(p);
    v = await look();
    check('Year 2029, the last in the ±3-year window: › is disabled, ‹ is not', v.next && !v.prev && v.range === 'Jan 1 – Oct 8, 2029', v);
    const cut = await p.evaluate(() => ({ per: [...document.querySelectorAll('.mphbac-staff-percot-delta [aria-hidden]')].map(d => d.textContent),
      tile: document.querySelector('.mphbac-staff-kpi.is-bookings .mphbac-staff-kpi-delta [aria-hidden]').textContent,
      tip: document.querySelector('.mphbac-staff-kpi.is-bookings .mphbac-staff-tipbox').textContent }));
    check('...a timeframe CUT at the window\'s edge is compared with nothing: "—", and the tip says why',
      cut.per.every(x => x === '—') && cut.tile === '—' && /outside the calendar's 3-year range/.test(cut.tip), cut);
    await p.selectOption('.mphbac-staff-stats-span', 'month');
    await p.selectOption('.mphbac-staff-stats-month', '2028-02'); await settle(p);
    const leap = await p.evaluate(() => document.querySelector('.mphbac-staff-kpi.is-bookings .mphbac-staff-tipbox').textContent);
    check('Feb 2028 (29 days) against a year earlier: Feb 1 – 28, 2027 — a 29 February is the 28th', /\(Feb 1 – 28, 2027\)/.test(leap), leap);
    await p.selectOption('.mphbac-staff-stats-span', 'year');
    await p.selectOption('.mphbac-staff-stats-year', '2029'); await settle(p);
    await p.selectOption('.mphbac-staff-stats-year', '2023'); await settle(p);
    v = await look();
    check('Year 2023, the first: ‹ disabled', v.prev && !v.next, v);
    await p.click('.mphbac-staff-stats-next'); await settle(p);
    v = await look();
    check('...› from there: 2024, the Year picker follows', v.year === '2024' && v.range === 'Jan 1 – Dec 31, 2024', v);
    await ctx.close();
  }
  // Rob: ONE row on a phone, the arrows proper tap targets, measured at 375
  // (and 320, 390, 430) with the longest custom range there is.
  for (const w of [320, 375, 390, 430]) {
    const { ctx, p } = await open({ phone: true, w });
    await p.selectOption('.mphbac-staff-stats-span', 'custom');
    await p.fill('.mphbac-staff-stats-from', '2026-12-28'); await p.fill('.mphbac-staff-stats-to', '2027-01-24');
    await p.dispatchEvent('.mphbac-staff-stats-to', 'change'); await settle(p);
    const m = await p.evaluate(() => { const e = document.querySelector('.mphbac-staff-stats-range'), r = e.getBoundingClientRect(), c = getComputedStyle(e);
      const a = document.querySelector('.mphbac-staff-stats-prev').getBoundingClientRect(), b = document.querySelector('.mphbac-staff-stats-next').getBoundingClientRect();
      return { text: e.textContent, size: parseFloat(c.fontSize), lines: Math.round(r.height / parseFloat(c.lineHeight)), fits: e.scrollWidth <= e.clientWidth + 0.5,
        row: Math.abs(a.top - b.top) < 1 && a.right <= r.left && r.right <= b.left && a.left >= 0 && b.right <= innerWidth, arrows: [a.width, a.height],
        board: (q => [q.width, q.height])(document.querySelector('.mphbac-staff-prev').getBoundingClientRect()) }; });
    check(`${w}px: "${m.text}" — ‹ line › on ONE row, whole, at ${m.size}px (≥ 12), arrows ${m.arrows.join('×')}`,
      m.text === 'Dec 28, 2026 – Jan 24, 2027' && m.lines === 1 && m.fits && m.row && m.size >= 12 && m.arrows.every(x => x >= 44), m);
    check(`${w}px: ...the same 44×44 circles as the board's own ‹ ›`, m.arrows.join() === m.board.join() && m.board.join() === '44,44', [m.arrows, m.board]);
    if (w === 375) console.log('   MEASURED (item 10, 375px): the longest range fits at ' + m.size + 'px between two 44px arrows');
    await ctx.close();
  }

  console.log('\n-- 0.46.0 D: "Records complete from" — a comparison reaching before it shows "—" --');
  {
    const { ctx, p } = await open();
    await p.selectOption('.mphbac-staff-stats-month', '2025-10'); await settle(p);
    let k = await tiles(p);
    let per = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-percot-delta [aria-hidden]')].map(d => d.textContent));
    let tip = await p.evaluate(() => document.querySelector('.mphbac-staff-kpi.is-booked .mphbac-staff-tipbox').textContent);
    check('Oct 2025: vs last year (Oct 2024) reaches before Oct 2025 — every tile shows "—"', Object.values(k).every(t => t[1] === '—' && t[2] === 'no comparison'), k);
    check('...and its tip says why: "No comparison: records before Oct 2025 are not complete."', /records before Oct 2025 are not complete\./.test(tip), tip);
    check('...the cottages\' ▲ ▼ against Sep 2025, also before it: "—"', per.length === 8 && per.every(x => x === '—'), per);
    check('...but the figures themselves still show (what the site holds): Bookings 4', k.bookings[0] === '4', k.bookings);
    await p.selectOption('.mphbac-staff-stats-month', '2025-11'); await settle(p);
    per = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-percot-delta [aria-hidden]')].map(d => d.textContent));
    k = await tiles(p);
    check('Nov 2025: the previous timeframe (Oct 2025) is complete — the cottages get ▲ ▼; vs Nov 2024 still "—"',
      per.every(x => x !== '—') && k.bookings[1] === '—', [per, k.bookings]);
    await ctx.close();
  }
  {
    // Pace a year ago (from 2025-10-08) needs records from before Nov 2025.
    const { ctx, p } = await open({ html: shell({ recordsFrom: '2025-11-15' }) });
    const pace = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-pace-row')].map(r => [...r.querySelectorAll('.mphbac-staff-pace-delta [aria-hidden]')].map(x => x.textContent).join('')));
    const tip = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-block.is-pace .mphbac-staff-tipbox').textContent);
    check('setting at 2025-11-15: pace shows "—" vs a year ago, and the tip says "No complete records before Nov 15, 2025."',
      pace.every(x => x === '— vs a year ago') && /records before Nov 15, 2025 are not complete\./.test(tip), [pace, tip]);
    const reqs = await p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').map(r => r.from + '|' + r.to));
    check('...and a comparison that cannot be shown is not even fetched (nothing from 2025)', reqs.every(r => r >= '2026'), reqs);
    await ctx.close();
  }

  console.log('\n-- 0.46.1: dock blocks are not stays — every Stats figure leaves them out --');
  {
    // Every figure, on every view: the page WITH the dock blocks must read
    // exactly as the page without them — tiles, ▲ ▼, cottages, sources,
    // length, weekdays, lead time, pace and every heat-map night.
    const sig = p => p.evaluate(() => {
      const o = document.querySelector('.mphbac-staff-stats-out');
      return o.textContent + '|' + [...o.querySelectorAll('.mphbac-staff-heat-day[data-day]')].map(c => c.dataset.n).join('')
        + '|' + [...o.querySelectorAll('.mphbac-staff-percot-fill, .mphbac-staff-wk-bar')].map(f => f.style.width + f.style.height).join(',');
    });
    const views = async p => {
      const out = {};
      out.month = await sig(p);
      await p.selectOption('.mphbac-staff-stats-span', 'day'); await p.fill('.mphbac-staff-stats-date', '2026-10-06');
      await p.dispatchEvent('.mphbac-staff-stats-date', 'change'); await settle(p); out.day = await sig(p);
      out.dayTiles = await tiles(p);
      await p.selectOption('.mphbac-staff-stats-span', 'week'); await settle(p); out.week = await sig(p);
      await p.selectOption('.mphbac-staff-stats-span', 'year'); await p.selectOption('.mphbac-staff-stats-year', '2026'); await settle(p); out.year = await sig(p);
      await p.selectOption('.mphbac-staff-stats-span', 'month'); await p.selectOption('.mphbac-staff-stats-month', '2025-11'); await settle(p); out.nov25 = await sig(p);
      return out;
    };
    const plain = await open();
    const without = await views(plain.p);
    await plain.ctx.close();
    const docked = await open({ html: shell({ bookings: BOOKINGS.concat(DOCKS) }) });
    const withDocks = await views(docked.p);
    for (const v of ['month', 'day', 'week', 'year', 'nov25']) {
      check(`${v}: with seven dock blocks (and a channel's echo of one) every figure is IDENTICAL to the page without them`, withDocks[v] === without[v],
        withDocks[v] === without[v] ? v : [withDocks[v].slice(0, 300), without[v].slice(0, 300)]);
    }
    check('...including Booked\'s denominator: still all 248 cottage-nights (#29 sits at 0%, not left out of the total)',
      /#29 C290 nights0%/.test(withDocks.month) && /14%/.test(withDocks.month), withDocks.month.slice(0, 200));
    // Each stay once, in house: Oct 6 — Amy and Ben; the echo of Ben is not a third guest.
    check('Day Oct 6: In house 2 (Amy, Ben — the channel block echoing Ben is not a third)', withDocks.dayTiles.inhouse[0] === '2', withDocks.dayTiles);
    const tip = await docked.p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tipbox')].map(b => b.textContent));
    check('every ⓘ says dock blocks are left out', tip.length >= 13 && tip.every(t => /Dock blocks (are left out|are not counted as booked)/.test(t)), tip.length);
    const tips2 = await docked.p.evaluate(() => ['arrivals', 'departures'].map(k => document.querySelector('.mphbac-staff-kpi.is-' + k + ' .mphbac-staff-tipbox').textContent));
    check('Arrivals and Departures say each stay counts once', tips2.every(t => /counts once/.test(t)), tips2);
    // The BOARD still draws them, and last year's outlines are unchanged.
    await docked.p.evaluate(() => scrollTo(0, 0));
    await docked.p.selectOption('.mphbac-staff-period', 'month'); await settle(docked.p);
    const bar = await docked.p.evaluate(() => !!document.querySelector('.mphbac-staff-bar[data-booking-id="301"]'));
    check('the board still draws this October\'s dock block as a bar', bar);
    await docked.p.check('.mphbac-staff-ghosts'); await settle(docked.p);
    const ghosts = await docked.p.evaluate(() => document.querySelectorAll('.mphbac-staff-ghost').length);
    check('...and last year\'s outlines include last October\'s dock block (5: the four stays and the dock block)', ghosts === 5, ghosts);
    await docked.ctx.close();
  }

  console.log('\n-- 0.46.1: the heat map by keyboard; "1 point" --');
  {
    const { ctx, p } = await open();
    const st = () => p.evaluate(() => ({ stops: [...document.querySelectorAll('.mphbac-staff-heat-day[tabindex="0"]')].map(c => c.dataset.day),
      focus: document.activeElement.dataset ? document.activeElement.dataset.day : null, role: document.activeElement.getAttribute('role'),
      label: document.activeElement.getAttribute('aria-label'), group: document.querySelector('.mphbac-staff-heat').getAttribute('role'),
      hidden: document.querySelector('.mphbac-staff-heat').getAttribute('aria-hidden') }));
    let k = await st();
    check('ONE tab stop in the heat map — the timeframe\'s first night (Oct 1) — in a labelled group, no longer hidden',
      JSON.stringify(k.stops) === '["2026-10-01"]' && k.group === 'group' && k.hidden === null, k);
    await p.focus('.mphbac-staff-heat-day[tabindex="0"]');
    await p.keyboard.press('ArrowRight'); k = await st(); const a1 = k.focus;
    await p.keyboard.press('ArrowDown'); k = await st(); const a2 = k.focus;
    await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); k = await st(); const a3 = k.focus;
    await p.keyboard.press('End'); k = await st(); const a4 = k.focus;
    await p.keyboard.press('Home'); k = await st(); const a5 = k.focus;
    check('arrows move a night (→ Oct 2) and a week (↓ Oct 9, ← Oct 8, ↑ Oct 1); End / Home the month\'s last and first',
      [a1, a2, a3, a4, a5].join() === '2026-10-02,2026-10-09,2026-10-01,2026-10-31,2026-10-01', [a1, a2, a3, a4, a5]);
    check('...each night a button named by its count ("Oct 1, 2026: 2 of 8 cottages booked"), and still ONE tab stop',
      k.role === 'button' && k.label === 'Oct 1, 2026: 2 of 8 cottages booked' && JSON.stringify(k.stops) === '["2026-10-01"]', k);
    await p.keyboard.press('End'); await p.keyboard.press('Enter'); await settle(p);
    const j = await p.evaluate(() => ({ go: document.querySelector('.mphbac-staff-goto').value, focus: document.activeElement.className }));
    check('Enter opens the board on that night (Oct 31), and focus goes to the chart', j.go === '2026-10-31' && /mphbac-staff-grid/.test(j.focus), j);
    await ctx.close();
  }
  {
    // A cottage one point down on the previous timeframe: #27 two nights in
    // October (6%) against two in September (7%).
    const { ctx, p } = await open({ html: shell({ bookings: BOOKINGS.concat([bk(401, '2026-10-25', '2026-10-27', 27, 'direct', '2026-10-01'), bk(402, '2026-09-15', '2026-09-17', 27, 'direct', '2026-09-01')]) }) });
    const r = await p.evaluate(() => { const row = document.querySelector('.mphbac-staff-percot-row[data-cottage="27"]');
      return [row.querySelector('.mphbac-staff-percot-delta [aria-hidden]').textContent, row.querySelector('.mphbac-staff-percot-delta .mphbac-sr-only').textContent]; });
    check('one point is "1 point": ▼1 is read "down 1 point on the previous timeframe" (was "down 1 points")', r[0] === '▼1' && r[1] === 'down 1 point on the previous timeframe', r);
    await ctx.close();
  }

  console.log('\n-- 0.46.2: the source colours (Rob: "four blues" — Booking.com citrus, Vrbo purple), each with its own ink --');
  {
    // WCAG 2 contrast of two computed colours.
    const contrastFn = `(function () {
      const lum = c => { const m = c.match(/[\\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
      return (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    })()`;
    // A pending Booking.com stay with all three icons, on the board and in Stats.
    const extra = [Object.assign(bk(501, '2026-10-22', '2026-10-30', 28, 'booking', '2026-10-01', 'Pat Pine'), { status: 'mphb-pending', statusLabel: 'Pending', pets: true, couch: true, boat: true })];
    const { ctx, p } = await open({ phone: true, html: shell({ bookings: BOOKINGS.concat(extra) }) });
    const want = { direct: ['rgb(7, 135, 50)', 'rgb(255, 255, 255)'], airbnb: ['rgb(188, 0, 62)', 'rgb(255, 255, 255)'],
                   booking: ['rgb(255, 160, 0)', 'rgb(17, 17, 17)'], vrbo: ['rgb(107, 63, 184)', 'rgb(255, 255, 255)'] };
    const bars = await p.evaluate(fn => { const contrast = eval(fn);
      return Object.fromEntries(['direct', 'airbnb', 'booking', 'vrbo'].map(k => {
        const b = document.querySelector('.mphbac-staff-bar.is-src-' + k), c = getComputedStyle(b), ico = b.querySelector('svg.mphbac-staff-ico');
        const key = getComputedStyle(document.querySelector('.mphbac-staff-key.is-src-' + k), '::before').backgroundColor;
        return [k, { bg: c.backgroundColor, ink: c.color, ratio: +contrast(c.backgroundColor, c.color).toFixed(2), key, ico: ico ? getComputedStyle(ico).stroke : null }];
      })); }, contrastFn);
    for (const k of Object.keys(want)) {
      check(`${k}: its bar is ${want[k][0]} with ${want[k][1]} ink — contrast ${bars[k].ratio}:1 (≥ 4.5), and its legend chip the same colour`,
        bars[k].bg === want[k][0] && bars[k].ink === want[k][1] && bars[k].ratio >= 4.5 && bars[k].key === want[k][0], bars[k]);
    }
    const icos = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar[data-booking-id="501"] svg.mphbac-staff-ico')].map(i => getComputedStyle(i).stroke));
    check('...the Pets / Couch / Boat icons on a Booking.com bar are drawn in its DARK ink, not white', icos.length === 3 && icos.every(c => c === 'rgb(17, 17, 17)'), icos);
    const pend = await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-staff-bar[data-booking-id="501"]')).backgroundImage);
    check('...a PENDING Booking.com bar keeps its stripes, dark ones that show on citrus', /rgba\(17, 17, 17, 0\.14\)/.test(pend), pend);
    const blues = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].map(b => getComputedStyle(b).backgroundColor).filter(c => c === 'rgb(0, 46, 122)' || c === 'rgb(15, 109, 191)'));
    check('no bar is either of the old blues (#002e7a, #0f6dbf); the board\'s own #0A50B2 band stays',
      blues.length === 0 && await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-staff-monthband')).backgroundColor) === 'rgb(10, 80, 178)', blues);
    // Stats: the pie, its labels in each slice's ink, the lead-time swatches.
    const pie = await p.evaluate(fn => { const contrast = eval(fn);
      return [...document.querySelectorAll('.mphbac-staff-pie-label')].map(t => { const k = (t.getAttribute('class').match(/is-src-(\w+)/) || [])[1];
        const slice = document.querySelector('.mphbac-staff-pie-slice.is-src-' + k);
        return { k, label: getComputedStyle(t).fill, slice: getComputedStyle(slice).fill, ratio: +contrast(getComputedStyle(t).fill, getComputedStyle(slice).fill).toFixed(2) }; }); }, contrastFn);
    check('Nights Booked by Source: every % drawn ON a slice is in that slice\'s ink, ≥ 4.5:1 (Booking.com\'s dark)',
      pie.length >= 3 && pie.every(x => x.slice === want[x.k][0] && x.label === want[x.k][1] && x.ratio >= 4.5) && pie.some(x => x.k === 'booking'), pie);
    const sw = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-pie-item, .mphbac-staff-lead-row[data-source]:not(.is-all)')].map(li => [li.className.match(/is-src-(\w+)/)[1], getComputedStyle(li.querySelector('.mphbac-staff-pie-swatch')).backgroundColor]));
    check('...its list and How Far Ahead\'s swatches in the new colours', sw.length >= 6 && sw.every(([k, c]) => c === want[k][0]), sw);
    await ctx.close();
  }

  console.log('\n-- 0.46.2: the Stats dates centred on their arrows (Rob\'s iPhone: they sat above) --');
  for (const [w, phone] of [[320, true], [375, true], [390, true], [1280, false]]) {
    // A stand-in for a theme's paragraph spacing — an Elementor kit's
    // `p { margin-block-end }` at (0,1,1) — the likely lift on Rob's phone.
    const { ctx, p } = await open({ phone, w, html: shell({ head: '<style>.elementor-kit-331 p { margin-block-end: 20px; }</style>' }) });
    await p.selectOption('.mphbac-staff-stats-span', 'custom');
    await p.fill('.mphbac-staff-stats-from', '2026-12-28'); await p.fill('.mphbac-staff-stats-to', '2027-01-24');
    await p.dispatchEvent('.mphbac-staff-stats-to', 'change'); await settle(p);
    const m = await p.evaluate(() => { const e = document.querySelector('.mphbac-staff-stats-range'), r = e.getBoundingClientRect(), c = getComputedStyle(e),
      a = document.querySelector('.mphbac-staff-stats-prev').getBoundingClientRect(), b = document.querySelector('.mphbac-staff-stats-next').getBoundingClientRect();
      return { text: e.textContent, dy: +(((r.top + r.bottom) / 2) - ((a.top + a.bottom) / 2)).toFixed(2), dyb: +(((b.top + b.bottom) / 2) - ((a.top + a.bottom) / 2)).toFixed(2),
        size: parseFloat(c.fontSize), lines: Math.round(r.height / parseFloat(c.lineHeight)), fits: e.scrollWidth <= e.clientWidth + 0.5 }; });
    check(`${w}px: "${m.text}" — its centre line within 1px of the arrows' (${m.dy}px), one line, whole (${m.size}px)`,
      Math.abs(m.dy) <= 1 && Math.abs(m.dyb) <= 1 && m.lines === 1 && m.fits && m.size >= 12, m);
    await ctx.close();
  }

  console.log('\n-- 0.46.2: Nights Booked by Cottage — names in full, "100%" on one line --');
  {
    // Rob's screenshot: Feb 2027, "#35 Blue Heron" cut, "100" over "%".
    // Rob's three longest names (the WD): "#23 Lighthouse", "#33 Pineapple", "#35 Blue Heron".
    const cots = F.COTTAGES.map(c => c.id === 22 ? Object.assign({}, c, { number: '35', abbrev: 'Blue Heron' })
      : c.id === 23 ? Object.assign({}, c, { number: '23', abbrev: 'Lighthouse' }) : c.id === 24 ? Object.assign({}, c, { number: '33', abbrev: 'Pineapple' }) : c);
    const full = bk(601, '2027-02-01', '2027-03-01', 22, 'direct', '2026-10-01');
    for (const w of [320, 375, 390]) {
      const { ctx, p } = await open({ phone: true, w, html: shell({ cottages: cots, bookings: BOOKINGS.concat([full]) }) });
      await p.selectOption('.mphbac-staff-stats-month', '2027-02'); await settle(p);
      const rows = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-percot-row')].map(r => {
        const n = r.querySelector('.mphbac-staff-percot-name'), pc = r.querySelector('.mphbac-staff-percot-pct'), t = r.querySelector('.mphbac-staff-percot-track');
        const lh = parseFloat(getComputedStyle(pc).lineHeight) || parseFloat(getComputedStyle(pc).fontSize) * 1.3;
        const parts = [...r.children].filter(x => !x.classList.contains('mphbac-staff-percot-track'));
        const fits = parts.every(x => x.scrollWidth <= x.clientWidth + 0.5 && x.getBoundingClientRect().height < (parseFloat(getComputedStyle(x).lineHeight) || 17) * 1.5);
        const d = r.querySelector('.mphbac-staff-percot-delta [aria-hidden]');
        return { name: n.textContent, whole: n.scrollWidth <= n.clientWidth + 0.5 && n.getBoundingClientRect().width >= n.scrollWidth - 0.5, pct: pc.textContent, fits, delta: d.textContent,
          oneLine: pc.getBoundingClientRect().height < lh * 1.5, track: Math.round(t.getBoundingClientRect().width), inside: r.getBoundingClientRect().right <= innerWidth + 0.5 }; }));
      const top = rows[0];
      check(`${w}px: Feb 2027 — "${top.name}" ${top.pct} ${top.delta}: the %, and a three-digit change, each on ONE line`, top.name === '#35 Blue Heron' && top.pct === '100%' && top.delta === '▲100' && top.oneLine && top.fits, top);
      check(`${w}px: "#23 Lighthouse", "#33 Pineapple" and "#35 Blue Heron" in full; in every row nothing overflows or wraps`,
        ['#23 Lighthouse', '#33 Pineapple', '#35 Blue Heron'].every(nm => rows.some(r => r.name === nm && r.whole)) && rows.length === 8 && rows.every(r => r.fits), rows.filter(r => !r.fits || !r.whole));
      check(`${w}px: every cottage name in full ("#35 Blue Heron", "#34 Great Egret", "#23 Kingfisher"…), every figure on one line, the bar still there (≥ 24px)`,
        rows.every(r => r.whole && r.oneLine && r.track >= 24 && r.inside), rows.filter(r => !(r.whole && r.oneLine && r.track >= 24 && r.inside)).concat([rows.map(r => r.track).join(',')]));
      check(`${w}px: ...and every bar the same length, as the rows share their columns`, new Set(rows.map(r => r.track)).size === 1, rows.map(r => r.track));
      await ctx.close();
    }
  }

  console.log('\n-- 0.46.2: everything in Stats centred (Rob) — headings and blocks within 1px of the section\'s centre --');
  for (const [w, phone] of [[320, true], [375, true], [390, true], [1280, false]]) {
    const { ctx, p } = await open({ phone, w });
    const m = await p.evaluate(() => {
      const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
      const union = els => { const r = els.map(e => e.getBoundingClientRect()).filter(x => x.width || x.height);
        return r.length ? { l: Math.min(...r.map(x => x.left)), r: Math.max(...r.map(x => x.right)) } : null; };
      const mid = u => u ? (u.l + u.r) / 2 : NaN;
      const out = document.querySelector('.mphbac-staff-stats-out').getBoundingClientRect();
      const res = [];
      // The tiles, as one block.
      res.push({ s: 'tiles', head: 0, block: +(mid(union([...document.querySelectorAll('.mphbac-staff-kpi')])) - (out.left + out.right) / 2).toFixed(1) });
      document.querySelectorAll('.mphbac-staff-stats-block').forEach(sec => {
        const c = (sec.getBoundingClientRect().left + sec.getBoundingClientRect().right) / 2;
        const h = sec.querySelector('.mphbac-staff-stats-h'), rg = document.createRange(); rg.selectNodeContents(h);
        const hr = rg.getBoundingClientRect();
        // The block: every LEAF that shows, outside the heading and the tip.
        const own = e => !e.closest('.mphbac-staff-stats-hrow') && !e.closest('.mphbac-sr-only') && visible(e);
        // A picture (the pie) counts as one shape, its own box.
        const leaves = [...sec.querySelectorAll('*')].filter(e => own(e) && (e.tagName.toLowerCase() === 'svg' || (!e.closest('svg') && !e.children.length)));
        // ...and the TEXT itself, where it sits beside an element (the pie's list).
        const texts = [...sec.querySelectorAll('*')].filter(own).flatMap(e => [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim() && e.children.length)
          .map(n => { const r = document.createRange(); r.selectNodeContents(n); return { getBoundingClientRect: () => r.getBoundingClientRect() }; }));
        res.push({ s: sec.className.replace('mphbac-staff-stats-block is-', ''), head: +((hr.left + hr.right) / 2 - c).toFixed(1), block: +(mid(union(leaves.concat(texts))) - c).toFixed(1),
          tipAfter: (() => { const t = h.querySelector('.mphbac-staff-tip').getBoundingClientRect(), last = h.querySelector('.mphbac-staff-stats-hlast');
            const rr = document.createRange(); rr.selectNodeContents(last.firstChild); const lw = rr.getBoundingClientRect();
            return t.left >= lw.right - 0.5 && t.left - lw.right <= 8 && Math.abs((t.top + t.bottom) / 2 - (lw.top + lw.bottom) / 2) < 6; })() });
      });
      return res;
    });
    check(`${w}px: every section heading centred (±1px): ${m.filter(x => x.s !== 'tiles').map(x => x.s + ' ' + x.head).join(', ')}`, m.every(x => Math.abs(x.head) <= 1), m);
    check(`${w}px: every section's content centred as a block (±1px): ${m.map(x => x.s + ' ' + x.block).join(', ')}`, m.every(x => Math.abs(x.block) <= 1), m);
    check(`${w}px: every heading's ⓘ sits right after its last word, on its line`, m.filter(x => x.s !== 'tiles').every(x => x.tipAfter), m.filter(x => x.tipAfter === false));
    await ctx.close();
  }
  {
    // A heading that wraps (a narrow window) takes its ⓘ along with the last word.
    const { ctx, p } = await open({ phone: true, w: 320 });
    const r = await p.evaluate(() => { const h = document.querySelector('.mphbac-staff-stats-block.is-weekdays .mphbac-staff-stats-h');
      h.style.width = '150px'; h.style.margin = '0 auto';
      const last = h.querySelector('.mphbac-staff-stats-hlast'), t = h.querySelector('.mphbac-staff-tip');
      const rr = document.createRange(); rr.selectNodeContents(last.firstChild); const lw = rr.getBoundingClientRect(), tb = t.getBoundingClientRect();
      const first = document.createRange(); first.selectNodeContents(h.firstChild); const f = first.getClientRects()[0];
      return { wrapped: lw.top > f.top + 5, sameLine: Math.abs((tb.top + tb.bottom) / 2 - (lw.top + lw.bottom) / 2) < 6 && tb.left >= lw.right - 0.5 }; });
    check('a heading that wraps keeps its ⓘ with its last word', r.wrapped && r.sameLine, r);
    await ctx.close();
  }

  console.log('\n-- 0.46.2: every ⓘ rewritten — a lead sentence, then a real list; no run-together sentences; within its lines at 375 --');
  {
    const { ctx, p } = await open({ phone: true, w: 375 });
    const keys = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tip')].map(b => b.getAttribute('data-tip')));
    const res = [];
    for (const k of keys) {
      await p.evaluate(k => { const b = document.querySelector('.mphbac-staff-tip[data-tip="' + k + '"]'); b.scrollIntoView({ block: 'center' }); b.click(); }, k);
      res.push(await p.evaluate(k => {
        const box = document.getElementById(document.querySelector('.mphbac-staff-tip[data-tip="' + k + '"]').getAttribute('aria-controls'));
        const lh = parseFloat(getComputedStyle(box).lineHeight);
        const lines = e => Math.round(e.getBoundingClientRect().height / lh);
        const lead = box.querySelector('.mphbac-staff-tiplead'), items = [...box.querySelectorAll('ul.mphbac-staff-tiplist > li')];
        const r = box.getBoundingClientRect();
        return { k, lead: lead.textContent, items: items.map(li => li.textContent), leadLines: lines(lead), itemLines: items.map(lines), total: Math.round(r.height / lh),
          text: box.textContent, list: !!box.querySelector('ul > li'), on: r.left >= 0 && r.right <= 375 };
      }, k));
      await p.evaluate(() => document.querySelector('.mphbac-staff-stats-range').click());
    }
    check(`all ${res.length} tips: a lead sentence and a real <ul> list`, res.length === 13 && res.every(t => t.lead.length > 10 && /[.]$/.test(t.lead) && t.list), res.map(t => [t.k, t.lead]));
    check('...every line a complete sentence ending in a full stop', res.every(t => t.items.every(i => /[.]$/.test(i) && /^[A-Z▲]/.test(i))), res.map(t => t.items));
    check('...nothing run together ("counts once.Dock blocks"): never a full stop, colon or bracket straight against the next word',
      res.every(t => !/[.:)][A-Z▲a-z]/.test(t.text.replace(/Booking\.com/g, 'Bookingcom'))), res.filter(t => /[.:)][A-Z▲a-z]/.test(t.text.replace(/Booking\.com/g, 'Bookingcom'))).map(t => t.text));
    check('...none of the old jargon ("timeframe", "points", "echo", "channel block")', res.every(t => !/timeframe|points|echo|channel block/i.test(t.text)), res.filter(t => /timeframe|points|echo|channel block/i.test(t.text)).map(t => t.k));
    check('...at 375: the lead at most 2 lines, each point at most 2, the whole bubble on screen',
      res.every(t => t.leadLines <= 2 && t.itemLines.every(n => n <= 2) && t.on), res.map(t => [t.k, t.leadLines, t.itemLines.join('+'), t.total]));
    console.log('   LINES AT 375 (lead + points = total): ' + res.map(t => t.k + ' ' + t.leadLines + '+' + t.itemLines.join('+') + '=' + t.total).join(' · '));
    console.log('   EVERY TIP (the check list):');
    res.forEach(t => console.log('   · ' + t.k + ': ' + t.lead + ' | ' + t.items.join(' | ')));
    await ctx.close();
  }

  console.log('\n-- 0.46.0 C17: last year\'s ghosts --');
  {
    const { ctx, p } = await open({ stats: false });
    const g = () => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-ghost')].map(e => {
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return { col: e.style.gridColumn, row: e.style.gridRow, aria: e.getAttribute('aria-hidden'), pe: c.pointerEvents, text: e.textContent, kids: e.children.length,
        title: e.getAttribute('title'), z: c.zIndex, border: c.borderStyle, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }));
    const sw = await p.evaluate(() => { const s = document.querySelector('.mphbac-staff-ghosts');
      return { checked: s.checked, role: s.getAttribute('role'), label: s.closest('label').textContent.trim(), inFields: !!s.closest('.mphbac-staff-fields, .mphbac-staff-tools'),
        underGrid: s.closest('.mphbac-staff-under') !== null && s.closest('.mphbac-staff-under').previousElementSibling.matches('.mphbac-staff-status')
          && s.closest('.mphbac-staff-under').previousElementSibling.previousElementSibling.matches('.mphbac-staff-grid') }; });
    const named = await p.getByRole('switch', { name: 'Compare to Last Year', exact: true }).count();
    // 0.46.2 (Rob): moved under the calendar and renamed, exactly "Compare to Last Year".
    check('a "Compare to Last Year" switch (role="switch", named exactly that) UNDER the calendar, not in the Show / Go to date row; OFF on load, no ghosts',
      !sw.checked && sw.role === 'switch' && sw.label === 'Compare to Last Year' && named === 1 && !sw.inFields && sw.underGrid && (await g()).length === 0, [sw, named]);
    await p.check('.mphbac-staff-ghosts'); await settle(p);
    let gs = await g();
    // Oct 2025 shifted a year: Ida #22, Jo #27, Lou #24, Ned #25 (Kit is November).
    check('on: last October\'s 4 stays as outlines on THIS October, in their cottages\' rows', gs.length === 4, gs);
    check('...dashed, behind the bars (z-index 1), aria-hidden, NO taps (pointer-events: none), no text, no name, no title',
      gs.every(x => x.border === 'dashed' && x.z === '1' && x.aria === 'true' && x.pe === 'none' && x.text === '' && x.kids === 0 && x.title === null), gs);
    const hit = await p.evaluate(gs => gs.map(x => { const e = document.elementFromPoint(x.cx, x.cy); return e ? e.className : ''; }), gs);
    check('...a tap where a ghost is drawn lands on the cell beneath, never on the ghost', hit.every(c => !/ghost/.test(c)), hit);
    const reqs = await p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').map(r => r.from + '|' + r.to));
    check('...fetched through the same gated range endpoint: Oct 1 – 31, 2025', reqs.includes('2025-10-01|2025-10-31'), reqs);
    await p.click('.mphbac-staff-next'); await settle(p);
    gs = await g();
    check('...they follow the chart: November shows last November\'s (Kit #23)', gs.length === 1, gs);
    await p.selectOption('.mphbac-staff-period', 'day'); await settle(p);
    check('Daily (no bars): the switch is disabled', await p.evaluate(() => document.querySelector('.mphbac-staff-ghosts').disabled));
    await p.selectOption('.mphbac-staff-period', 'month'); await settle(p);
    await p.uncheck('.mphbac-staff-ghosts'); await settle(p);
    check('off again: every ghost gone', (await g()).length === 0);
    await p.check('.mphbac-staff-ghosts'); await settle(p);
    await p.reload(); await p.waitForTimeout(300);
    check('a reload: OFF again, whatever the browser would restore', await p.evaluate(() => !document.querySelector('.mphbac-staff-ghosts').checked && !document.querySelector('.mphbac-staff-ghost')));
    await ctx.close();
  }
  // Where it sits (0.46.2): left-aligned under the calendar; "Updated hh:mm"
  // where it was, on the right; never overlapping, at 320 / 375 / 390 and
  // on a computer. And the Show / Go to date row, now two again, balanced.
  for (const [w, phone] of [[320, true], [375, true], [390, true], [1280, false]]) {
    const { ctx, p } = await open({ phone, w, stats: false });
    const m = await p.evaluate(() => {
      const R = s => document.querySelector(s).getBoundingClientRect();
      const g = R('.mphbac-staff-grid'), f = R('.mphbac-staff-ghostfield'), u = R('.mphbac-staff-updated'), sh = R('.mphbac-staff-period'), go = R('.mphbac-staff-goto'), tools = R('.mphbac-staff-fields');
      const overlap = !(f.right <= u.left || u.right <= f.left || f.bottom <= u.top || u.bottom <= f.top);
      const ue = document.querySelector('.mphbac-staff-updated');
      return { left: Math.round(f.left - g.left), under: Math.round(f.top - g.bottom), updRight: Math.round(g.right - u.right), updText: ue.textContent,
        updOneLine: u.height < (parseFloat(getComputedStyle(ue).lineHeight) || 16) * 1.5,
        overlap, tap: Math.round(f.height), fieldsW: [Math.round(sh.width), Math.round(go.width)], tops: Math.abs(sh.top - go.top),
        centre: +(((sh.left + go.right) / 2) - ((tools.left + tools.right) / 2)).toFixed(1), inside: sh.left >= 0 && go.right <= innerWidth };
    });
    check(`${w}px: the switch is LEFT-ALIGNED under the calendar (its left edge on the calendar's), a 44px tap target`,
      Math.abs(m.left) <= 1 && m.under >= 0 && m.under <= 12 && m.tap >= 44, m);
    check(`${w}px: "${m.updText}" stays right-aligned under the calendar on one line, and the two never overlap`, /^Updated \d\d:\d\d$/.test(m.updText) && Math.abs(m.updRight) <= 1 && !m.overlap && m.updOneLine, m);
    check(`${w}px: Show / Go to date, two again: the same width, level, the pair centred, on screen`,
      m.fieldsW[0] === m.fieldsW[1] && m.tops < 0.5 && Math.abs(m.centre) <= 1 && m.inside, m);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
