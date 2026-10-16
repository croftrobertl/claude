'use strict';
/**
 * 0.47.2 (Rob, 2026-10-16): A FAILED REFRESH KEEPS TRYING.
 *
 * Until 0.47.1 a refresh that failed scheduled nothing: the board waited for
 * the tab to be shown again. Now a failure for a passing reason — a refused
 * answer (success: false), a server error, a network error — schedules the
 * next attempt on the same 3-minute rhythm as a success. The gate's own
 * refusal (an empty 403 with no "nonce" header: the staff password no longer
 * valid, the fail-closed path) stops every retry.
 *
 * Driven on a fake clock, in a real page with the shipped staff.js. The
 * page's long timers (≥ 30s: the refresh's and its retry's — nothing else in
 * staff.js is that long) are counted as they are set and cleared, and the
 * board's month requests as they go out and come back, so "one timer, one
 * request" is measured, not assumed.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const L = require('./lastyear-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'http://staff.test/';
const STR = S.boardStrings();
const MIN3 = 3 * 60 * 1000;

// Counts the long timers; installed after the fake clock, so it wraps it.
const TIMERS = `(() => {
  const st = window.setTimeout, ct = window.clearTimeout, live = new Set();
  window.__maxTimers = 0; window.__liveTimers = () => live.size;
  window.setTimeout = function (fn, ms) {
    if (!(ms >= 30000)) return st.apply(window, arguments);
    const args = [].slice.call(arguments, 2);
    const id = st(function () { live.delete(id); return fn.apply(this, args); }, ms);
    live.add(id); window.__maxTimers = Math.max(window.__maxTimers, live.size);
    return id;
  };
  window.clearTimeout = function (id) { live.delete(id); return ct(id); };
})();`;
// The board's month requests, answered as window.__mode says, 300ms late.
const NET = `(() => {
  const orig = window.fetch;
  window.__mode = 'ok'; window.__inflight = 0; window.__maxInflight = 0; window.__month = 0;
  window.fetch = function (url, opts) {
    const p = new URLSearchParams(opts.body.toString());
    if (p.get('action') !== 'mphbac_staff_month') return orig(url, opts);
    window.__month++; window.__inflight++; window.__maxInflight = Math.max(window.__maxInflight, window.__inflight);
    const m = window.__mode;
    const late = (ok, v) => new Promise((res, rej) => setTimeout(() => (ok ? res(v) : rej(v)), 300));
    const r = m === 'refuse' ? late(true, new Response('{"success":false}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : m === 'server' ? late(true, new Response('<html>Internal Server Error</html>', { status: 500, headers: { 'Content-Type': 'text/html' } }))
      : m === 'net' ? late(false, new TypeError('Failed to fetch'))
      : m === 'gate' ? late(true, new Response('', { status: 403 }))
      : late(true, null).then(() => orig(url, opts));
    return r.then(x => { window.__inflight--; return x; }, e => { window.__inflight--; throw e; });
  };
  // The tab's visibility, set by the test.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis || 'visible' });
  window.__show = v => { window.__vis = v; document.dispatchEvent(new Event('visibilitychange')); };
})();`;

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const html = S.boardShell({ today: L.TODAY, cottages: L.COTTAGES, bookings: L.BOOKINGS, bodyStyle: 'padding:0 16px', head: S.raleway() });
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.clock.install({ time: new Date(L.TODAY + 'T09:00:00') });
    await p.addInitScript(TIMERS);
    await p.goto(ORIGIN);
    await p.clock.runFor(500);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
    await p.evaluate(NET);
    await p.evaluate(() => { window.__maxTimers = window.__liveTimers(); window.__c = document.querySelector('.mphbac-staff-chart'); });
    return { ctx, p };
  };
  const run = async (p, ms) => { await p.clock.runFor(ms); };
  const state = p => p.evaluate(() => ({ month: window.__month, timers: window.__liveTimers(), maxTimers: window.__maxTimers, maxInflight: window.__maxInflight,
    status: document.querySelector('.mphbac-staff-status').textContent, err: document.querySelector('.mphbac-staff-status').classList.contains('is-error'),
    redrawn: document.querySelector('.mphbac-staff-chart') !== window.__c, bars: document.querySelectorAll('.mphbac-staff-bar').length }));

  console.log('\n-- a failure is retried 3 minutes later --');
  for (const mode of ['refuse', 'server', 'net']) {
    // A fresh page for each kind of failure, so each starts on the rhythm.
    const { ctx, p } = await open();
    check(`${mode}: (instrument) after the first load, one refresh timer pending`, (await state(p)).timers === 1, await state(p));
    {
      await p.evaluate(m => { window.__mode = m; window.__month = 0; }, mode);
      await run(p, MIN3 + 500);                         // the refresh fires and fails
      let s = await state(p);
      check(`${mode}: the refresh went out and failed — "${STR.error}" shown, and the NEXT attempt is already pending (one timer)`,
        s.month === 1 && s.status === STR.error && s.err && s.timers === 1, s);
      await run(p, MIN3 - 1500);                        // just short of 3 minutes later
      s = await state(p);
      check(`${mode}: nothing at 2 m 59 s after the failure`, s.month === 1, s);
      await run(p, 2000);
      s = await state(p);
      check(`${mode}: the next attempt fires at 3 minutes, on the success rhythm`, s.month === 2, s);
      await run(p, 500);
    }
    await ctx.close();
  }

  console.log('\n-- three failures, then a success: the error clears, the calendar redraws --');
  {
    const { ctx, p } = await open();
    const seen = [];
    for (const mode of ['refuse', 'net', 'server']) {
      await p.evaluate(m => { window.__mode = m; }, mode);
      await run(p, MIN3 + 500);
      seen.push(await state(p));
    }
    check('three failures in a row: the error line stays each time, one timer each time', seen.every(s => s.status === STR.error && s.err && s.timers === 1), seen);
    check('...and the calendar still shows what it had (no blank, nothing redrawn from a failure)', seen.every(s => !s.redrawn && s.bars > 0), seen.map(s => [s.redrawn, s.bars]));
    await p.evaluate(() => { window.__mode = 'ok'; });
    await run(p, MIN3 + 500);
    const s = await state(p);
    check('the 4th attempt succeeds: the error line clears, the calendar redraws in place, the rhythm goes on (one timer)',
      s.status === '' && !s.err && s.redrawn && s.bars > 0 && s.timers === 1, s);
    check('...never more than one refresh timer, never two board requests at once, through it all', s.maxTimers === 1 && s.maxInflight === 1, s);
    await ctx.close();
  }

  console.log('\n-- one timer, one request: hiding and showing the tab, navigating, switching last year, mid-streak --');
  {
    const { ctx, p } = await open();
    await p.evaluate(() => { window.__mode = 'net'; });
    await run(p, MIN3 + 500);                           // failure 1
    // Hidden: no refresh while hidden, however long.
    await p.evaluate(() => { window.__show('hidden'); window.__month = 0; });
    await run(p, 3 * MIN3);
    const hidden = await state(p);
    check('hidden for 9 minutes: no request at all', hidden.month === 0, hidden);
    await p.evaluate(() => window.__show('visible'));
    await run(p, 500);
    const back = await state(p);
    check('...shown again: exactly one attempt at once (it is overdue), and one timer after it', back.month === 1 && back.timers === 1, back);
    // Hidden and shown again quickly: no extra attempt, still one timer.
    await p.evaluate(() => { window.__month = 0; window.__show('hidden'); window.__show('visible'); window.__show('hidden'); window.__show('visible'); });
    await run(p, 1000);
    const flick = await state(p);
    check('...hidden and shown twice within a second: no extra request, one timer', flick.month === 0 && flick.timers === 1, flick);
    // Navigate between attempts (its load fails too), and switch last year.
    await p.evaluate(() => { window.__month = 0; });
    await p.click('.mphbac-staff-next'); await run(p, 500);
    await p.click('.mphbac-staff-segbtn[data-ly="behind"]'); await run(p, 500);
    await p.click('.mphbac-staff-segbtn[data-ly="front"]'); await run(p, 500);
    await p.click('.mphbac-staff-segbtn[data-ly="off"]'); await run(p, 500);
    await p.click('.mphbac-staff-prev'); await run(p, 500);
    const nav = await state(p);
    check('navigating ‹ › and switching Off · Behind · In Front during the streak: still exactly one refresh timer', nav.timers === 1, nav);
    await p.evaluate(() => { window.__month = 0; window.__mode = 'ok'; });
    await run(p, MIN3 + 500);
    const end = await state(p);
    check('...then the next attempt — one request — succeeds and clears the error', end.month === 1 && end.status === '' && end.timers === 1, end);
    check('never more than one refresh timer, never two board requests at once, across all of it', end.maxTimers === 1 && end.maxInflight === 1, end);
    await ctx.close();
  }
  {
    // A slow answer still on its way when the refresh is due: the refresh
    // waits rather than send a second request on top.
    const { ctx, p } = await open();
    await p.evaluate(() => { window.__mode = 'net'; });
    await run(p, MIN3 + 500);
    await p.evaluate(() => { window.__mode = 'ok'; window.__fetchDelay = 0; });
    // Hold the next board answer for 5 minutes — across the time the
    // refresh is due (3 minutes after the failure).
    // (In 25s steps, so the hold is not itself counted as a long timer.)
    await p.evaluate(() => { const f = window.fetch; window.fetch = function (u, o) { const r = f(u, o);
      return new Promise(res => { let left = 12; const step = () => (--left ? setTimeout(step, 25000) : res(r)); setTimeout(step, 25000); }); }; });
    await p.evaluate(() => { window.__month = 0; });
    await p.click('.mphbac-staff-next');                 // a navigation, answered 5 minutes late
    await run(p, MIN3 + 500);
    const s = await state(p);
    check('a refresh due while a board request is still on its way waits (30s at a time): never two at once', s.month === 1 && s.maxInflight === 1 && s.timers === 1, s);
    await run(p, 3 * 60 * 1000);
    const s2 = await state(p);
    check('...and once that answer is in, the rhythm goes on: one timer, still never two at once', s2.maxInflight === 1 && s2.timers === 1 && !s2.err && s2.redrawn, s2);
    await ctx.close();
  }

  console.log('\n-- the gate\'s own refusal (password no longer valid) stops retrying --');
  {
    const { ctx, p } = await open();
    await p.evaluate(() => { window.__mode = 'gate'; window.__month = 0; });
    await run(p, MIN3 + 500);
    const s1 = await state(p);
    check(`the refresh meets an empty 403 (no "nonce" header): "${STR.denied}" shown, and NO timer pending`, s1.month === 1 && s1.status === STR.denied && s1.err && s1.timers === 0, s1);
    await run(p, 4 * MIN3);
    await p.evaluate(() => { window.__show('hidden'); window.__show('visible'); });
    await run(p, MIN3);
    const s2 = await state(p);
    check('...no further attempt — not after 12 more minutes, not when the tab is shown again', s2.month === 1 && s2.timers === 0, s2);
    await ctx.close();
  }

  console.log('\n-- Stats open: fail, fail, succeed --');
  {
    const { ctx, p } = await open();
    await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
    await run(p, 1000);
    const tiles = () => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-kpi-num')].map(e => e.textContent).join('|'));
    const t0 = await tiles();
    await p.evaluate(() => { window.__mode = 'refuse'; });
    await run(p, MIN3 + 500);
    const t1 = await tiles();
    await p.evaluate(() => { window.__mode = 'net'; });
    await run(p, MIN3 + 500);
    const t2 = await tiles();
    check('two failed refreshes with Stats open: its figures stay on screen, unchanged', t0 && t1 === t0 && t2 === t0, [t0, t1, t2]);
    // A new booking appears on the server before the next attempt.
    await p.evaluate(() => { BOOKINGS.push({ id: 99, status: 'confirmed', statusLabel: 'Confirmed', checkin: '2026-11-20', checkout: '2026-11-23', guestName: 'New Guest',
      imported: false, source: { key: 'direct' }, sourceKey: 'direct', pets: false, guests: '2', madeOn: '2026-11-06',
      cottages: [{ roomTypeId: 34, roomId: 340, title: '', abbrev: '', number: '34' }] }); window.__mode = 'ok'; });
    await run(p, MIN3 + 1500);
    const t3 = await tiles(), s = await state(p);
    check('the next one succeeds: the figures update (Bookings 6 → 7), the error line clears', t3 !== t0 && t3.split('|')[0] === String(+t0.split('|')[0] + 1) && s.status === '', [t0, t3, s.status]);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
