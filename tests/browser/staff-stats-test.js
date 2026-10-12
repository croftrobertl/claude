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
    // (10+3+2+31+4+7)/6 = 9.5; arrivals 6 (the echo counts), departures 6;
    // one turnover (#23 on Oct 5: Cal out, Ben in).
    // Oct 2025: 21 nights (7+2+10+2) = 8%; 4 bookings; Length 21/4 = 5.25;
    // 4 arrivals, 4 departures, no turnover.
    check('Bookings 6 ▲2', k.bookings[0] === '6' && k.bookings[1] === '▲2', k.bookings);
    check('Booked 14% ▲6 — in POINTS (14 − 8)', k.booked[0] === '14%' && k.booked[1] === '▲6', k.booked);
    check('Length 9.5 nights ▲4.3 — in NIGHTS (9.5 − 5.25)', k.length[0] === '9.5 nights' && k.length[1] === '▲4.3', k.length);
    check('Arrivals 6 ▲2, Departures 6 ▲2, Turnovers 1 ▲1 — counts',
      k.arrivals.slice(0, 2).join() === '6,▲2' && k.departures.slice(0, 2).join() === '6,▲2' && k.turnovers.slice(0, 2).join() === '1,▲1', k);
    check('...each read as a sentence: "up 6 on the same dates a year earlier"', k.booked[2] === 'up 6 on the same dates a year earlier', k.booked[2]);
    const tipText = await p.evaluate(() => document.querySelector('.mphbac-staff-kpi.is-bookings .mphbac-staff-tipbox').textContent);
    check('...and the tip names the dates compared: Oct 1 – 31, 2025', /same dates a year earlier \(Oct 1 – 31, 2025\)/.test(tipText), tipText);

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
    check('...its tip: the share of its 31 nights, and the previous timeframe named (Sep 1 – 30, 2026)', /share of its 31 nights/.test(tip) && /previous timeframe \(Sep 1 – 30, 2026\)/.test(tip), tip);

    // C16 stay-length mix: the Bookings set — 2 (Cal), 3 (Ben), 4 (Eli),
    // 7 (Fay), 10 (Amy), 31 (Dot).
    const mix = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-mix-row')].map(r => r.textContent));
    check('Length of Stay: 1–2 1 (17%), 3–6 2 (33%), 7–27 2 (33%), 28+ 1 (17%) — the six bookings Bookings counts',
      JSON.stringify(mix) === JSON.stringify(['1–2 nights1 (17%)', '3–6 nights2 (33%)', '7–27 nights2 (33%)', '28+ nights1 (17%)']), mix);

    // C12 weekday chart. Oct 1 2026 is a Thursday. In: Thu 1 (Amy), Sat 3
    // (Cal), Mon 5 (Ben + the echo), Wed 14 (Fay), Tue 20 (Dot). Out: Fri 2
    // (Eli), Mon 5 (Cal), Thu 8 (Ben + echo), Sun 11 (Amy), Wed 21 (Fay).
    const wk = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-wk-day')].map(d =>
      [d.querySelector('.mphbac-staff-wk-name').textContent, d.querySelector('.is-in .mphbac-staff-wk-num').textContent, d.querySelector('.is-out .mphbac-staff-wk-num').textContent]));
    check('Arrivals and Departures by Weekday, Sunday to Saturday',
      JSON.stringify(wk) === JSON.stringify([['Sun', '0', '1'], ['Mon', '2', '1'], ['Tue', '1', '0'], ['Wed', '1', '1'], ['Thu', '1', '2'], ['Fri', '0', '1'], ['Sat', '1', '0']]), wk);
    check('...adding up to the tiles (6 and 6)', wk.reduce((t, d) => t + +d[1], 0) === 6 && wk.reduce((t, d) => t + +d[2], 0) === 6);
    const wkSr = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-block.is-weekdays ul.mphbac-sr-only').textContent);
    check('...and as text for a screen reader ("Monday: 2 arrivals, 1 departures")', /Monday: 2 arrivals, 1 departures/.test(wkSr), wkSr);

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
    check('...its tip says the year-ago figure is slightly low (cancellations are not kept)', /Cancelled bookings are not kept, so the year-ago figure is slightly low/.test(paceTip), paceTip);

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
    const state = () => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tipwrap')].filter(w => !w.lastChild.hidden)
      .map(w => [w.getAttribute('data-tip'), w.firstChild.getAttribute('aria-expanded')]));
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
    const after = await p.evaluate(() => [document.activeElement.parentNode.getAttribute('data-tip'), document.querySelectorAll('.mphbac-staff-tipbox:not([hidden])').length]);
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
      cut.per.every(x => x === '—') && cut.tile === '—' && /outside the board's ±3-year range/.test(cut.tip), cut);
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
    check('...and its tip says why: "No complete records before Oct 2025."', /No complete records before Oct 2025\./.test(tip), tip);
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
      pace.every(x => x === '— vs a year ago') && /No complete records before Nov 15, 2025\./.test(tip), [pace, tip]);
    const reqs = await p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').map(r => r.from + '|' + r.to));
    check('...and a comparison that cannot be shown is not even fetched (nothing from 2025)', reqs.every(r => r >= '2026'), reqs);
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
    const sw = await p.evaluate(() => { const s = document.querySelector('.mphbac-staff-ghosts'), f = s.closest('.mphbac-staff-fields');
      return { checked: s.checked, role: s.getAttribute('role'), label: s.closest('label').textContent.trim(), inFields: !!f,
        afterShow: s.closest('label').previousElementSibling.querySelector('.mphbac-staff-period') !== null }; });
    check('a "Last year" switch beside Show (role="switch"), OFF on load, no ghosts', !sw.checked && sw.role === 'switch' && sw.label === 'Last year' && sw.afterShow && (await g()).length === 0, sw);
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
  {
    const { ctx, p } = await open({ phone: true, stats: false });
    const m = await p.evaluate(() => { const f = document.querySelector('.mphbac-staff-ghostfield').getBoundingClientRect(), s = document.querySelector('.mphbac-staff-period').getBoundingClientRect(),
      q = document.querySelector('.mphbac-staff-search').getBoundingClientRect(), sw = document.querySelector('.mphbac-staff-ghosts').getBoundingClientRect();
      return { below: f.top >= s.bottom, above: f.bottom <= q.top, inside: f.left >= 0 && f.right <= innerWidth, centred: Math.abs((f.left + f.right) / 2 - innerWidth / 2) < 2, sw: [sw.width, sw.height] }; });
    check('375px: the switch on its own centred line under Show / Go to date, above Search', m.below && m.above && m.inside && m.centred, m);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ stats: false });
    const m = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-fields .mphbac-staff-field-label')].map(l => [l.textContent, Math.round(l.getBoundingClientRect().top * 10) / 10]));
    check('desktop: Show | Last year | Go to date in one row, the labels level', m.length === 3 && m[1][0] === 'Last year' && m.every(x => x[1] === m[0][1]), m);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
