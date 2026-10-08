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
      agenda: !q('.mphbac-staff-agenda').hidden, chart: !q('.mphbac-staff-grid').hidden,
      legend: !q('.mphbac-staff-legend').hidden, today: !q('.mphbac-staff-today').hidden,
      prev: q('.mphbac-staff-prev').getAttribute('aria-label'), prevDisabled: q('.mphbac-staff-prev').disabled,
      nextDisabled: q('.mphbac-staff-next').disabled, status: q('.mphbac-staff-status').textContent,
      heads: document.querySelectorAll('.mphbac-staff-dayhead').length, stored, reqs: window.__reqs.slice(),
    };
  });
  const choose = async (p, v) => { await p.selectOption('.mphbac-staff-period', v); await p.waitForTimeout(60); };
  const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(60); };

  console.log('-- first visit: Monthly, on every device --');
  for (const phone of [false, true]) {
    const { ctx, p } = await open({ phone });
    const s = await st(p);
    const who = phone ? 'PHONE' : 'DESKTOP';
    check(`${who}: a device that has never chosen opens on Monthly`, s.period === 'month' && s.chart && !s.agenda, s);
    check(`${who}: ...this month`, s.title === 'October 2026', s.title);
    check(`${who}: ...in ONE request for exactly the month`, s.reqs.length === 1
      && s.reqs[0].from === '2026-10-01' && s.reqs[0].to === '2026-10-31', s.reqs);
    check(`${who}: Today is hidden — this month already holds today`, !s.today);
    check(`${who}: opening the board stores NOTHING — only a deliberate choice does`, s.stored === null, s.stored);
    await ctx.close();
  }

  console.log('\n-- the remembered choice, carried over from 0.42.x --');
  for (const [stored, want] of [['agenda', 'day'], ['chart', 'month'], ['week', 'week'], ['year', 'year'], ['nonsense', 'month']]) {
    const { ctx, p } = await open({ phone: true, stored });
    const s = await st(p);
    check(`stored "${stored}" opens ${want}`, s.period === want, s.period);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ blocked: true });
    const s = await st(p);
    check('storage BLOCKED: the board still opens, on Monthly, with no error',
      s.period === 'month' && s.title === 'October 2026' && p.__errors.length === 0, [s.period, p.__errors]);
    await choose(p, 'week');
    check('...and choosing a period still works, it just is not remembered', (await st(p)).period === 'week' && p.__errors.length === 0);
    await ctx.close();
  }
  {
    const { ctx, p } = await open();
    await choose(p, 'year');
    check('choosing a period stores its NAME, and nothing else', (await st(p)).stored === 'year');
    await ctx.close();
  }

  console.log('\n-- the four windows --');
  {
    const { ctx, p } = await open();
    await choose(p, 'day');
    let s = await st(p);
    check('Daily: the list, not the chart, and no legend', s.agenda && !s.chart && !s.legend, s);
    check('Daily: today, titled as such', /Thursday, October 8, 2026/.test(s.title) && /Today/.test(s.title), s.title);
    const groups = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-group')].map(g =>
      [g.querySelector('.mphbac-staff-group-head').firstChild.textContent, g.querySelectorAll('.mphbac-staff-item').length]));
    check("Daily: today's Arriving / Departing / In house, each with its one guest",
      JSON.stringify(groups) === JSON.stringify([['Arriving', 1], ['Departing', 1], ['In house', 1]]), groups);
    check('Daily: no new request — it reuses the month already loaded', s.reqs.length === 1, s.reqs.length);

    await choose(p, 'week');
    s = await st(p);
    check('Weekly: the calendar week holding today, Sunday-first (start_of_week = 0)', s.title === 'Oct 4 – 10, 2026', s.title);
    check('Weekly: seven day columns', s.heads === 7, s.heads);
    check('Weekly: the arrows say "week"', s.prev === STRINGS.prevWeek, s.prev);

    await choose(p, 'year');
    s = await st(p);
    check('Yearly: the calendar year', s.title === '2026', s.title);
    check('Yearly: 365 day columns', s.heads === 365, s.heads);
    check('Yearly: ONE request for the whole year', s.reqs.slice(-1)[0].from === '2026-01-01' && s.reqs.slice(-1)[0].to === '2026-12-31', s.reqs.slice(-1));
    const marks = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-dayhead.is-month-start')].map(h => h.textContent));
    check('Yearly: each month is marked in the header, by name', marks.length === 12 && /^Jan/.test(marks[0]) && /^Dec/.test(marks[11]), marks);
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
    check('March, inside the loaded year, costs NO request', (await st(p)).title === 'March 2026'
      && (await st(p)).reqs.length === n, [(await st(p)).title, (await st(p)).reqs.length - n]);
    await choose(p, 'week');
    check('...nor does a week of it', (await st(p)).title === 'Mar 15 – 21, 2026'
      && (await st(p)).reqs.length === n, [(await st(p)).title, (await st(p)).reqs.length - n]);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ sow: 1 });
    await choose(p, 'week');
    check('with "Week Starts On" = Monday the week is Mon–Sun — the setting is READ, not assumed',
      (await st(p)).title === 'Oct 5 – 11, 2026', (await st(p)).title);
    await ctx.close();
  }

  console.log('\n-- the arrows step a whole period; Today comes back --');
  {
    const { ctx, p } = await open();
    const seq = [];
    for (const [period, steps] of [['day', ['Friday, October 9, 2026']], ['week', ['Oct 11 – 17, 2026']],
                                   ['month', ['November 2026']], ['year', ['2027']]]) {
      await choose(p, period);
      await click(p, '.mphbac-staff-today').catch(() => {});
      await click(p, '.mphbac-staff-next');
      const s = await st(p);
      seq.push([period, s.title, s.today]);
      check(`${period}: next steps one whole ${period}`, s.title.indexOf(steps[0]) === 0, s.title);
      check(`${period}: Today appears once today is off screen`, s.today);
      await click(p, '.mphbac-staff-today');
      const back = await st(p);
      check(`${period}: Today brings back the period holding today, and hides again`, !back.today, back.title);
    }
    await choose(p, 'week');
    await click(p, '.mphbac-staff-prev');
    await click(p, '.mphbac-staff-prev');
    check('week: two steps back crosses the month cleanly', (await st(p)).title === 'Sep 20 – 26, 2026', (await st(p)).title);
    await ctx.close();
  }

  console.log('\n-- Go to date --');
  {
    const { ctx, p } = await open();
    const go = async v => { await p.fill('.mphbac-staff-goto', v); await p.dispatchEvent('.mphbac-staff-goto', 'change'); await p.waitForTimeout(60); };
    await go('2027-03-15');
    check('Monthly: Go to date shows that date\'s month', (await st(p)).title === 'March 2027', (await st(p)).title);
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
    check('three years back: 2023 is shown, not refused', s.title === '2023' && s.heads === 365, s.title);
    check('...with a note that part of it is outside the range', s.status === STRINGS.partial, s.status);
    check('...and the back arrow disabled — 2022 lies wholly outside', s.prevDisabled);
    for (let i = 0; i < 6; i++) await click(p, '.mphbac-staff-next');
    s = await st(p);
    check('three years ahead: 2029 shown, forward arrow disabled', s.title === '2029' && s.nextDisabled, [s.title, s.nextDisabled]);
    check('no request was ever refused — the arrows never ask for one', !p.__errors.length && !/Could not/.test(s.status), s.status);
    await ctx.close();
  }

  console.log('\n-- Weekly fills the screen; on a phone the cottage column shrinks --');
  for (const phone of [false, true]) {
    const { ctx, p } = await open({ phone });
    await choose(p, 'week');
    const m = await p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid'), c = document.querySelector('.mphbac-staff-chart');
      const head = document.querySelector('.mphbac-staff-dayhead'), lab = document.querySelector('.mphbac-staff-rowlabel');
      const name = document.querySelector('.mphbac-staff-rowname');
      return { scrolls: g.scrollWidth > g.clientWidth + 1, day: Math.round(head.getBoundingClientRect().width),
               label: Math.round(lab.getBoundingClientRect().width), compact: c.classList.contains('is-compact'),
               nameShown: !!name && getComputedStyle(name).display !== 'none' };
    });
    const who = phone ? 'PHONE 375px' : 'DESKTOP 1280px';
    check(`${who}: the week never scrolls sideways`, !m.scrolls, m);
    if (phone) {
      check(`${who}: the cottage column shrinks to its number (≈48px)`, m.compact && m.label === 48 && !m.nameShown, m);
      check(`${who}: which leaves days no narrower than 44px — wider than the 40px a full column would leave`, m.day >= 44, m.day);
    } else {
      check(`${who}: days grow well past 44px, room for full names`, m.day > 120 && m.label === 96 && m.nameShown, m);
    }
    console.log(`      ${who}: cottage column ${m.label}px, day ${m.day}px`);
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
