'use strict';
/**
 * THE PERIOD MENU (0.43.0), DRIVEN IN A REAL PAGE WITH THE REAL staff.js.
 *
 * Until 0.43.0 no suite ran staff.js at all: staff-test.js checks the
 * board's CSS on static markup. The period menu is behaviour — which window
 * each period shows, where an arrow lands, what Today does, what a device
 * remembers, what a swipe may and may not take over — so it is proved here
 * by running the script against the shell EXTRACTED FROM THE PHP, with
 * fetch() answered by a stand-in that applies the server's own cap rules
 * (Staff::send_range(): clamp an overlapping window, refuse one wholly
 * outside, ±3 years around "today").
 *
 * "Today" is pinned to Thursday 2026-10-08 so every window is exact.
 *
 * 0.43.1: in the chart periods the nav label names the MONTH on screen and
 * follows the scroll, so it no longer identifies the window. The window is
 * read from the chart itself (data-from / data-to, set from the same
 * windowOf() the arrows use); Daily still names its day.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const { check, done } = H.reporter();

const TODAY = '2026-10-08';
const ORIGIN = 'http://staff.test/';

// The board's strings, read from the PHP rather than copied, so a renamed or
// reworded string cannot leave this suite asserting against a stale copy.
const STRINGS = (() => {
  const php = S.widgetPhp();
  const block = php.slice(php.indexOf("'strings' => ["), php.indexOf('],', php.indexOf("'strings' => [")));
  const out = {};
  const re = /'(\w+)'\s*=>\s*__\('((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].replace(/\\'/g, "'");
  return out;
})();

// EIGHT cottages, as live has — so the Yearly timing below is measured on
// the real row count, not a flattering two.
const COTTAGES = [
  { id: 22, title: 'Cottage 22: Blue Heron', abbrev: 'Blue Heron', number: '22' },
  { id: 23, title: 'Cottage 23: Kingfisher', abbrev: 'Kingfisher', number: '23' },
].concat([24, 25, 26, 27, 28, 29].map(n => ({ id: n, title: 'Cottage ' + n, abbrev: 'C' + n, number: String(n) })));
const bk = (id, ci, co, cottage, name) => ({ id, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co,
  guestName: name, imported: false, source: { imported: false, ota: '' },
  cottages: [{ roomTypeId: cottage, roomId: cottage * 10, title: '', abbrev: '', number: String(cottage) }] });
const BOOKINGS = [
  bk(1, '2026-10-06', '2026-10-09', 22, 'Ann Smith'),     // in house today
  bk(2, '2026-10-08', '2026-10-12', 23, 'Bob Jones'),     // arrives today
  bk(3, '2026-10-05', '2026-10-08', 23, 'Cy Lee'),        // departs today
  bk(4, '2026-03-14', '2026-03-18', 22, 'Dee March'),     // earlier this year
  bk(5, '2027-03-14', '2027-03-17', 22, 'Ed Future'),     // for Go to date
  bk(6, '2026-10-29', '2026-11-03', 24, 'Fay Cross'),     // a stay across the 1st
];

function shell(sow) {
  const config = {
    ajaxUrl: '/ajax', nonce: 'n', month: TODAY.slice(0, 7), today: TODAY,
    calendar: {
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      weekdaysFull: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      startOfWeek: sow,
    },
    strings: STRINGS,
  };
  const markup = S.dephp(S.extractBlock(S.widgetPhp(), '<div class="mphbac-staff" data-staff-config='))
    .replace('data-staff-config=""', "data-staff-config='" + JSON.stringify(config).replace(/'/g, '&#39;') + "'");
  const js = require('fs').readFileSync(require('path').join(S.ROOT, 'assets/js/staff.js'), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${S.THEME}</style>
<style>${S.css()}</style></head><body>
${markup}
<script>
  // The server, as far as the board can tell: Staff::send_range()'s rules.
  window.__reqs = [];
  var TODAY = ${JSON.stringify(TODAY)}, BOOKINGS = ${JSON.stringify(BOOKINGS)}, COTTAGES = ${JSON.stringify(COTTAGES)};
  function shiftY(s, n) { var d = new Date(s + 'T00:00:00'); d.setFullYear(d.getFullYear() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var LO = shiftY(TODAY, -3), HI = shiftY(TODAY, 3);
  window.fetch = function (url, opts) {
    var p = new URLSearchParams(opts.body.toString());
    var req = { action: p.get('action'), from: p.get('from'), to: p.get('to'), month: p.get('month') };
    window.__reqs.push(req);
    // window.__hold = true keeps the answer back until window.__release(), so
    // a test can look at the board WHILE a window is loading.
    if (window.__hold) {
      var self = this, a = arguments;
      return new Promise(function (res) { window.__release = function () { window.__hold = false; res(window.fetch.apply(self, a)); window.__reqs.pop(); }; });
    }
    if (req.to < LO || req.from > HI) {
      return Promise.resolve(new Response(JSON.stringify({ success: false, data: { message: 'Invalid date range.' } }), { status: 400 }));
    }
    var f = req.from < LO ? LO : req.from, t = req.to > HI ? HI : req.to;
    var bookings = BOOKINGS.filter(function (b) { return b.checkout >= f && b.checkin <= t; });
    return Promise.resolve(new Response(JSON.stringify({ success: true, data: {
      from: f, to: t, today: TODAY, cottages: COTTAGES, bookings: bookings, clamped: f !== req.from || t !== req.to } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
</script>
<script>${js}</script>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const open = async ({ phone = false, sow = 0, stored, blocked = false } = {}) => {
    const ctx = await browser.newContext(phone
      ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } });
    if (stored !== undefined) await ctx.addInitScript(v => { try { localStorage.setItem('mphbacStaffView', v); } catch (e) {} }, stored);
    if (blocked) await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
    });
    const html = shell(sow);
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.__errors = [];
    p.on('pageerror', e => { p.__errors.push(e.message); console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.waitForTimeout(80);
    return { ctx, p };
  };
  const st = p => p.evaluate(() => {
    const q = s => document.querySelector(s);
    const stored = (() => { try { return localStorage.getItem('mphbacStaffView'); } catch (e) { return 'BLOCKED'; } })();
    return {
      period: q('.mphbac-staff-period').value, title: q('.mphbac-staff-title').textContent,
      win: q('.mphbac-staff-chart') && !q('.mphbac-staff-grid').hidden
        ? q('.mphbac-staff-chart').dataset.from + '..' + q('.mphbac-staff-chart').dataset.to : null,
      scroll: q('.mphbac-staff-grid').scrollLeft,
      agenda: !q('.mphbac-staff-agenda').hidden, chart: !q('.mphbac-staff-grid').hidden,
      legend: !q('.mphbac-staff-legend').hidden, today: !q('.mphbac-staff-today').hidden,
      prev: q('.mphbac-staff-prev').getAttribute('aria-label'), prevDisabled: q('.mphbac-staff-prev').disabled,
      nextDisabled: q('.mphbac-staff-next').disabled, status: q('.mphbac-staff-status').textContent,
      heads: document.querySelectorAll('.mphbac-staff-dayhead').length, stored, reqs: window.__reqs.slice(),
    };
  });
  const choose = async (p, v) => { await p.selectOption('.mphbac-staff-period', v); await p.waitForTimeout(60); };
  const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(60); };

  console.log('-- every load: Monthly, on every device (Rob, 0.43.3) --');
  for (const phone of [false, true]) {
    const { ctx, p } = await open({ phone });
    const s = await st(p);
    const who = phone ? 'PHONE' : 'DESKTOP';
    check(`${who}: the board opens on Monthly`, s.period === 'month' && s.chart && !s.agenda, s);
    check(`${who}: ...this month`, s.title === 'October 2026', s.title);
    check(`${who}: ...in ONE request for exactly the month`, s.reqs.length === 1
      && s.reqs[0].from === '2026-10-01' && s.reqs[0].to === '2026-10-31', s.reqs);
    check(`${who}: Today is SHOWN even though this month holds today (0.43.1: always in the row)`, s.today);
    check(`${who}: opening the board stores nothing`, s.stored === null, s.stored);
    await ctx.close();
  }

  console.log('\n-- nothing is remembered any more, and the old key is removed --');
  /* 0.42.x - 0.43.2 reopened each device's last period from localStorage
     ('mphbacStaffView'); a 0.42.x "List" choice carried over as Daily, which
     is why Rob's phone opened on Daily. Since 0.43.3 every load is Monthly,
     whatever was stored, and the stored value is deleted so it cannot win
     again if this code ever changes back. */
  for (const stored of ['agenda', 'chart', 'day', 'week', 'year', 'nonsense']) {
    const { ctx, p } = await open({ phone: true, stored });
    const s = await st(p);
    check(`an old stored "${stored}" opens Monthly anyway, and the key is gone`, s.period === 'month' && s.stored === null, [s.period, s.stored]);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ blocked: true });
    const s = await st(p);
    check('storage BLOCKED: the board still opens, on Monthly, with no error',
      s.period === 'month' && s.title === 'October 2026' && p.__errors.length === 0, [s.period, p.__errors]);
    await choose(p, 'week');
    check('...and choosing a period still works', (await st(p)).period === 'week' && p.__errors.length === 0);
    await ctx.close();
  }
  {
    const { ctx, p } = await open();
    await choose(p, 'year');
    check('choosing a period stores NOTHING', (await st(p)).stored === null && (await st(p)).period === 'year', (await st(p)).stored);
    await p.reload();
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.waitForTimeout(80);
    check('...so a reload is back on Monthly — a choice lasts until the page is left or reloaded',
      (await st(p)).period === 'month', (await st(p)).period);
    await ctx.close();
  }

  console.log('\n-- the four windows --');
  {
    const { ctx, p } = await open();
    await choose(p, 'day');
    let s = await st(p);
    check('Daily: the list, not the chart, and no legend', s.agenda && !s.chart && !s.legend, s);
    check('Daily: the date ALONE — no month/year line under it (Rob, 0.43.3)', s.title === 'Thursday, October 8, 2026', s.title);
    check('...nothing nested in the label at all', await p.evaluate(() => document.querySelector('.mphbac-staff-title').children.length === 0));
    const groups = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-group')].map(g =>
      [g.querySelector('.mphbac-staff-group-head').firstChild.textContent, g.querySelectorAll('.mphbac-staff-item').length]));
    check("Daily: today's Arriving / Departing / In house, each with its one guest",
      JSON.stringify(groups) === JSON.stringify([['Arriving', 1], ['Departing', 1], ['In house', 1]]), groups);
    check('Daily: no new request — it reuses the month already loaded', s.reqs.length === 1, s.reqs.length);

    await choose(p, 'week');
    s = await st(p);
    check('Weekly: the calendar week holding today, Sunday-first (start_of_week = 0)', s.win === '2026-10-04..2026-10-10', s.win);
    check('Weekly: the label names the month on screen', s.title === 'October 2026', s.title);
    check('Weekly: seven day columns', s.heads === 7, s.heads);
    check('Weekly: the arrows say "week"', s.prev === STRINGS.prevWeek, s.prev);

    await choose(p, 'year');
    s = await st(p);
    check('Yearly: the calendar year', s.win === '2026-01-01..2026-12-31', s.win);
    check('Yearly: the label names the month on screen — opened on today, October', s.title === 'October 2026', s.title);
    check('Yearly: 365 day columns', s.heads === 365, s.heads);
    check('Yearly: ONE request for the whole year', s.reqs.slice(-1)[0].from === '2026-01-01' && s.reqs.slice(-1)[0].to === '2026-12-31', s.reqs.slice(-1));
    const marks = await p.evaluate(() => ({
      band: [...document.querySelectorAll('.mphbac-staff-monthband')].map(b => b.textContent),
      heads: document.querySelectorAll('.mphbac-staff-dayhead.is-month-start').length,
      lines: document.querySelectorAll('.mphbac-staff-monthline').length }));
    check('Yearly: the month band names all twelve months, in full',
      marks.band.length === 12 && marks.band[0] === 'January 2026' && marks.band[11] === 'December 2026', marks.band);
    check('Yearly: each 1st is ruled in the header and through the rows', marks.heads === 12 && marks.lines === 12, marks);
    const scroll = await p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid'), t = document.querySelector('.mphbac-staff-dayhead.is-today');
      return { left: g.scrollLeft, todayX: t.offsetLeft, view: g.clientWidth };
    });
    check('Yearly: opens scrolled to today', scroll.left > 0 && scroll.todayX >= scroll.left && scroll.todayX <= scroll.left + scroll.view, scroll);

    await ctx.close();
  }
  {
    /* THE YEAR SERVES ITS MONTHS AND WEEKS. Asserted on windows that were
       NEVER fetched on their own. The first version of this check switched
       to this month and this week after loading the year — but both had
       been fetched earlier in the same page, so they were exact cache hits
       either way, and a mutation that removed the reuse SURVIVED. */
    const { ctx, p } = await open();
    await choose(p, 'year');
    const n = (await st(p)).reqs.length;
    await p.fill('.mphbac-staff-goto', '2026-03-15');
    await p.dispatchEvent('.mphbac-staff-goto', 'change');
    await p.waitForTimeout(60);
    await choose(p, 'month');
    check('(instrument check) March was never fetched on its own',
      !(await st(p)).reqs.some(r => r.from === '2026-03-01'), (await st(p)).reqs);
    check('March, inside the loaded year, costs NO request', (await st(p)).win === '2026-03-01..2026-03-31'
      && (await st(p)).reqs.length === n, [(await st(p)).win, (await st(p)).reqs.length - n]);
    await choose(p, 'week');
    check('...nor does a week of it', (await st(p)).win === '2026-03-15..2026-03-21'
      && (await st(p)).reqs.length === n, [(await st(p)).win, (await st(p)).reqs.length - n]);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ sow: 1 });
    await choose(p, 'week');
    check('with "Week Starts On" = Monday the week is Mon–Sun — the setting is READ, not assumed',
      (await st(p)).win === '2026-10-05..2026-10-11', (await st(p)).win);
    await ctx.close();
  }

  console.log('\n-- the arrows step a whole period; Today comes back --');
  {
    const { ctx, p } = await open();
    // Daily is identified by its label; the chart periods by their window.
    const where = s => s.period === 'day' ? s.title : s.win;
    for (const [period, next, home] of [
      ['day', 'Friday, October 9, 2026', 'Thursday, October 8, 2026'],
      ['week', '2026-10-11..2026-10-17', '2026-10-04..2026-10-10'],
      ['month', '2026-11-01..2026-11-30', '2026-10-01..2026-10-31'],
      ['year', '2027-01-01..2027-12-31', '2026-01-01..2026-12-31']]) {
      await choose(p, period);
      await click(p, '.mphbac-staff-today');
      await click(p, '.mphbac-staff-next');
      const s = await st(p);
      check(`${period}: next steps one whole ${period}`, where(s).indexOf(next) === 0, where(s));
      check(`${period}: Today is in the row`, s.today);
      await click(p, '.mphbac-staff-today');
      const back = await st(p);
      check(`${period}: Today brings back the period holding today, and stays in the row`,
        where(back).indexOf(home) === 0 && back.today, [where(back), back.today]);
    }
    await choose(p, 'week');
    await click(p, '.mphbac-staff-prev');
    await click(p, '.mphbac-staff-prev');
    check('week: two steps back crosses the month cleanly', (await st(p)).win === '2026-09-20..2026-09-26', (await st(p)).win);
    await ctx.close();
  }

  console.log('\n-- Go to date --');
  {
    const { ctx, p } = await open();
    const go = async v => { await p.fill('.mphbac-staff-goto', v); await p.dispatchEvent('.mphbac-staff-goto', 'change'); await p.waitForTimeout(60); };
    await go('2027-03-15');
    check('Monthly: Go to date shows that date\'s month', (await st(p)).win === '2027-03-01..2027-03-31'
      && (await st(p)).title === 'March 2027', [(await st(p)).win, (await st(p)).title]);
    await choose(p, 'day');
    check('...and switching to Daily lands on that very day', /March 15, 2027/.test((await st(p)).title), (await st(p)).title);
    const before = (await st(p)).title;
    await go('2031-01-01');
    const s = await st(p);
    check('a date outside the ±3-year range is refused, and SAYS so', s.status === STRINGS.outOfRange && s.title === before, [s.status, s.title]);
    await ctx.close();
  }

  console.log('\n-- the ±3-year browsing cap --');
  {
    const { ctx, p } = await open();
    await choose(p, 'year');
    for (let i = 0; i < 3; i++) await click(p, '.mphbac-staff-prev');
    let s = await st(p);
    check('three years back: 2023 is shown, not refused', s.win === '2023-01-01..2023-12-31' && s.heads === 365, s.win);
    check('...with a note that part of it is outside the range', s.status === STRINGS.partial, s.status);
    check('...and the back arrow disabled — 2022 lies wholly outside', s.prevDisabled);
    for (let i = 0; i < 6; i++) await click(p, '.mphbac-staff-next');
    s = await st(p);
    check('three years ahead: 2029 shown, forward arrow disabled', s.win === '2029-01-01..2029-12-31' && s.nextDisabled, [s.win, s.nextDisabled]);
    check('no request was ever refused — the arrows never ask for one', !p.__errors.length && !/Could not/.test(s.status), s.status);
    await ctx.close();
  }

  console.log('\n-- Weekly fills the screen with the SAME cottage column as every period (Rob, 0.43.3) --');
  /* 0.43.0's phone-only 48px column wrapped "#22" to "#2 / 2" and
     "Cottages" to "Cott / ages" on Rob's iPhone. The days narrow instead.
     Measured three ways: a desktop, the 375px phone with no page margin, and
     a 320px chart — Rob's, from his screenshots (the live page's margins). */
  for (const [phone, inset, who] of [[false, 0, 'DESKTOP 1280px'], [true, 0, 'PHONE 375px'], [true, 27, 'PHONE, a 320px chart']]) {
    const { ctx, p } = await open({ phone });
    const monthly = await p.evaluate(() => Math.round(document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect().width));
    if (inset) await p.evaluate(px => { document.body.style.padding = '0 ' + px + 'px'; }, inset);
    await choose(p, 'week');
    const m = await p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid');
      const heads = [...document.querySelectorAll('.mphbac-staff-dayhead')], lab = document.querySelector('.mphbac-staff-rowlabel');
      const corner = document.querySelector('.mphbac-staff-corner'), num = lab.querySelector('.mphbac-staff-rownum');
      const name = lab.querySelector('.mphbac-staff-rowname');
      const lines = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects().length; };
      return { chart: Math.round(g.clientWidth), scrolls: g.scrollWidth > g.clientWidth + 1,
               day: +heads[0].getBoundingClientRect().width.toFixed(1),
               label: Math.round(lab.getBoundingClientRect().width),
               nameShown: !!name && getComputedStyle(name).display !== 'none',
               numLines: lines(num), cornerLines: lines(corner),
               headsFit: heads.every(h => h.scrollWidth <= h.clientWidth + 0.5) };
    });
    check(`${who}: the week never scrolls sideways`, !m.scrolls, m);
    check(`${who}: the cottage column is Monthly's — same width, number AND name`, m.label === monthly && m.nameShown, [m.label, monthly]);
    check(`${who}: "#22" stays on one line, and so does "Cottages"`, m.numLines === 1 && m.cornerLines === 1, m);
    check(`${who}: every day header fits its column`, m.headsFit, m);
    if (!phone) check(`${who}: days grow well past 44px, room for full names`, m.day > 120, m.day);
    console.log(`      ${who}: chart ${m.chart}px, cottage column ${m.label}px, day ${m.day}px`);
    await ctx.close();
  }

  console.log('\n-- 0.43.1: which month am I in? the band, the rule, the label, Today --');
  for (const phone of [false, true]) {
    const who = phone ? 'PHONE' : 'DESKTOP';
    const { ctx, p } = await open({ phone });
    const go = async v => { await p.fill('.mphbac-staff-goto', v); await p.dispatchEvent('.mphbac-staff-goto', 'change'); await p.waitForTimeout(60); };
    const scrollTo = async x => { await p.evaluate(x => { const g = document.querySelector('.mphbac-staff-grid'); g.scrollLeft = x; g.dispatchEvent(new Event('scroll')); }, x); await p.waitForTimeout(80); };
    // x of a day's column inside the scrolled chart
    const dayX = d => p.evaluate(d => document.querySelector('.mphbac-staff-dayhead[data-day="' + d + '"]').offsetLeft, d);
    const labelW = () => p.evaluate(() => document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect().width);

    // Monthly: one band cell, and the rule on the 1st.
    let b = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-monthband')].map(x => x.textContent));
    check(`${who} Monthly: the band names the month`, JSON.stringify(b) === '["October 2026"]', b);

    // Weekly across a month boundary: two band cells, one rule, label = the larger part.
    await choose(p, 'week');
    await go('2026-09-30');
    let s = await st(p);
    b = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-monthband')].map(x => [x.textContent, x.title]));
    check(`${who} Weekly Sep 27 – Oct 3: two band cells, September then October`,
      s.win === '2026-09-27..2026-10-03' && b.length === 2 && b[0][1] === 'September 2026' && b[1][1] === 'October 2026', [s.win, b]);
    check(`${who} Weekly: the label names the month with more of the week (4 days of September)`, s.title === 'September 2026', s.title);
    // The label while that week is still LOADING: mostOf() names the larger
    // part before there is a chart to measure. Asserted on a window never
    // fetched, with the answer held back.
    // Each held week follows a jump to a DIFFERENT, unrelated week, and the
    // instrument check is that a request is really waiting (__release set by
    // the stand-in), not merely that the hold flag was raised.
    const heldLabel = async (before, target) => {
      await go(before);
      await p.evaluate(() => { window.__release = null; window.__hold = true; });
      await go(target);
      const r = await p.evaluate(() => ({ t: document.querySelector('.mphbac-staff-title').textContent,
        pending: typeof window.__release === 'function' }));
      await p.evaluate(() => { window.__hold = false; if (window.__release) window.__release(); });
      await p.waitForTimeout(60);
      return r;
    };
    const held = await heldLabel('2026-06-10', '2026-08-04');
    check(`${who} (instrument check) a request really was held, and the loading label is the week's month`,
      held.pending && held.t === 'August 2026', held);
    const held2 = await heldLabel('2026-06-10', '2026-08-01');
    check(`${who} Weekly Jul 26 – Aug 1, while still loading: July, the larger part (6 days), not the anchor's August`,
      held2.pending && held2.t === 'July 2026', held2);
    await go('2026-09-30');
    const lines = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-monthline')].map(l => l.style.gridColumn));
    check(`${who} Weekly: one rule, on October 1st`, lines.length === 1, lines);

    // Yearly: the label follows the scroll.
    await choose(p, 'year');
    await click(p, '.mphbac-staff-today');
    const lw = await labelW();
    await scrollTo((await dayX('2026-03-10')) - lw);
    s = await st(p);
    check(`${who} Yearly: scrolled to mid-March, the label says March`, s.title === 'March 2026', s.title);
    await scrollTo((await dayX('2026-11-05')) - lw);
    check(`${who} Yearly: ...and November when scrolled there`, (await st(p)).title === 'November 2026', (await st(p)).title);

    // The month's name stays pinned while its month is on screen.
    const pin = await p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid').getBoundingClientRect();
      const lab = document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect();
      const nov = [...document.querySelectorAll('.mphbac-staff-monthband')].find(x => x.title === 'November 2026');
      const r = nov.querySelector('.mphbac-staff-monthname').getBoundingClientRect();
      const bandR = nov.getBoundingClientRect();
      return { nameLeft: Math.round(r.left), colRight: Math.round(lab.right), bandLeft: Math.round(bandR.left), visible: r.right <= g.right && r.left >= g.left };
    });
    check(`${who} Yearly: mid-November, its name is pinned beside the cottage column, not scrolled off with the 1st`,
      pin.visible && Math.abs(pin.nameLeft - pin.colRight) <= 1 && pin.bandLeft < pin.colRight, pin);

    // The rule on the 1st runs through the rows ABOVE a stay crossing it, and lets the tap through.
    await scrollTo((await dayX('2026-10-27')) - lw);
    const rule = await p.evaluate(() => {
      const bar = [...document.querySelectorAll('.mphbac-staff-bar')].find(x => x.dataset.bookingId === '6');
      const head = document.querySelector('.mphbac-staff-dayhead[data-day="2026-11-01"]').getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      const x = head.left + 1, y = br.top + br.height / 2;
      const line = [...document.querySelectorAll('.mphbac-staff-monthline')].find(l => {
        const r = l.getBoundingClientRect(); return Math.abs(r.left - head.left) < 1; });
      const lr = line.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.mphbac-staff-rowlabel')];
      return { x, y, hit: document.elementFromPoint(x, y) === bar || bar.contains(document.elementFromPoint(x, y)),
               lineTop: Math.round(lr.top), lineBottom: Math.round(lr.bottom), lineW: Math.round(lr.width),
               rowsTop: Math.round(rows[0].getBoundingClientRect().top), rowsBottom: Math.round(rows[rows.length - 1].getBoundingClientRect().bottom) };
    });
    check(`${who} the rule on Nov 1 runs from the first cottage row to the last`,
      Math.abs(rule.lineTop - rule.rowsTop) <= 1 && Math.abs(rule.lineBottom - rule.rowsBottom) <= 1 && rule.lineW === 3, rule);
    check(`${who} ...a tap on it still opens the stay underneath`, rule.hit, rule);
    const shot = await p.screenshot({ clip: { x: rule.x, y: rule.y, width: 1, height: 1 } });
    const px = await p.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d');
      g.drawImage(img, 0, 0); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
    }, shot.toString('base64'));
    check(`${who} ...and it is PAINTED above the bar (#0A50B2), not hidden under it`,
      Math.abs(px[0] - 10) <= 6 && Math.abs(px[1] - 80) <= 6 && Math.abs(px[2] - 178) <= 6, px);

    // Today, scrolled away inside the year holding it: scrolls back, no redraw.
    await scrollTo(0);
    const chartBefore = await p.evaluateHandle(() => document.querySelector('.mphbac-staff-chart'));
    const reqs = (await st(p)).reqs.length;
    await click(p, '.mphbac-staff-today');
    s = await st(p);
    const same = await p.evaluate(c => c === document.querySelector('.mphbac-staff-chart'), chartBefore);
    const tv = await p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid').getBoundingClientRect();
      const t = document.querySelector('.mphbac-staff-dayhead.is-today').getBoundingClientRect();
      return t.left >= g.left && t.right <= g.right;
    });
    check(`${who} Yearly scrolled to January: Today scrolls back to today`, tv && s.title === 'October 2026' && s.today, [tv, s.title]);
    check(`${who} ...without redrawing or fetching the year`, same && s.reqs.length === reqs, [same, s.reqs.length - reqs]);

    // Go to date inside the loaded year scrolls to that date.
    await go('2026-06-15');
    const gv = await p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid').getBoundingClientRect();
      const t = document.querySelector('.mphbac-staff-dayhead[data-day="2026-06-15"]').getBoundingClientRect();
      return t.left >= g.left && t.right <= g.right;
    });
    check(`${who} Yearly: Go to date in the same year scrolls to that date`, gv && (await st(p)).title === 'June 2026', [gv, (await st(p)).title]);
    await ctx.close();
  }

  console.log('\n-- swipe: header, period bar and Daily list only — NEVER the chart --');
  {
    const { ctx, p } = await open({ phone: true });
    const swipe = (sel, dx, dy) => p.evaluate(([s, dx, dy]) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(20, r.height / 2);
      const t0 = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      const t1 = new Touch({ identifier: 1, target: el, clientX: x + dx, clientY: y + dy });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t0], targetTouches: [t0], changedTouches: [t0], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t1], bubbles: true }));
    }, [sel, dx, dy]).then(() => p.waitForTimeout(60));
    await swipe('.mphbac-staff-title', -120, 4);
    check('swipe LEFT on the header: next month', (await st(p)).title === 'November 2026', (await st(p)).title);
    await swipe('.mphbac-staff-title', 120, 4);
    check('swipe RIGHT: back', (await st(p)).title === 'October 2026');
    await swipe('.mphbac-staff-grid', -150, 2);
    check('the SAME swipe on the chart changes nothing — its sideways scroll is its own', (await st(p)).title === 'October 2026', (await st(p)).title);
    await swipe('.mphbac-staff-title', -40, 2);
    check('a short drag is not a swipe', (await st(p)).title === 'October 2026');
    await swipe('.mphbac-staff-title', -90, 80);
    check('a mostly-vertical drag (a page scroll) is not a swipe', (await st(p)).title === 'October 2026');
    await choose(p, 'day');
    await swipe('.mphbac-staff-agenda', -120, 6);
    // A phone titles Daily in the short form ("Fri, Oct 9, 2026").
    check('Daily: a swipe on the list steps a day', /Oct 9, 2026/.test((await st(p)).title), (await st(p)).title);
    await ctx.close();
  }

  console.log('\n-- Yearly on a slow phone --');
  {
    const { ctx, p } = await open({ phone: true });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const ms = await p.evaluate(() => new Promise(res => {
      const sel = document.querySelector('.mphbac-staff-period');
      const t0 = performance.now();
      const ob = new MutationObserver(() => {
        if (document.querySelector('.mphbac-staff-chart.is-year')) { ob.disconnect(); res(Math.round(performance.now() - t0)); }
      });
      ob.observe(document.querySelector('.mphbac-staff-grid'), { childList: true });
      sel.value = 'year'; sel.dispatchEvent(new Event('change'));
    }));
    const nodes = await p.evaluate(() => document.querySelector('.mphbac-staff-chart').querySelectorAll('*').length);
    check('a year renders in under half a second at 4x CPU slowdown', ms < 500, ms + 'ms');
    console.log(`      Yearly at 4x CPU slowdown: ${ms}ms to render, ${nodes} elements`);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
