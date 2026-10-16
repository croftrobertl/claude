'use strict';
/**
 * 0.47.1 (Rob, 2026-10-16): "UPDATED HH:MM" IS GONE; THE REFRESH IS NOT.
 *
 * In 0.47.0 the time of the last refresh sat beside the Compare to Last Year
 * control and, on a phone, dropped under it. Rob had it removed. Held here,
 * in a real page with the shipped staff.js, in Raleway:
 *   - no "Updated" text and no .mphbac-staff-updated element, at 360, 390
 *     and 1280, before and after a refresh;
 *   - the control's row back to one 44px row at 360 and 390;
 *   - the 3-minute refresh still fires (a fake clock), fetches again and
 *     redraws the chart — twice, so it keeps rescheduling itself;
 *   - a refresh that fails still says so in the status line, through
 *     say() / failureText(), for a refused answer and for a network error.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const L = require('./lastyear-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'http://staff.test/';
const STR = S.boardStrings();

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const html = S.boardShell({ today: L.TODAY, cottages: L.COTTAGES, bookings: L.BOOKINGS, bodyStyle: 'padding:0 16px', head: S.raleway() });
  const open = async (w, clock = false) => {
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    if (clock) await p.clock.install({ time: new Date(L.TODAY + 'T09:00:00') });
    await p.goto(ORIGIN);
    if (clock) await p.clock.runFor(500);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
    await p.evaluate(() => document.fonts.ready);
    return { ctx, p };
  };
  const noStamp = p => p.evaluate(() => ({ el: document.querySelectorAll('.mphbac-staff-updated').length,
    text: /Updated/i.test(document.body.innerText) || /Updated/i.test(document.querySelector('.mphbac-staff').textContent) }));
  const reqs = p => p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').length);
  const advance = async p => { await p.clock.fastForward(3 * 60 * 1000 + 1000); for (let i = 0; i < 10; i++) await p.clock.runFor(50); };

  console.log('\n-- no "Updated hh:mm", and the switch row one 44px row --');
  check('the string is gone from the strings the board is sent', !('updated' in STR) && !Object.values(STR).some(v => /^Updated/.test(v)));
  check('...and from the shell and the stylesheet', !/mphbac-staff-updated/.test(S.widgetPhp()) && !/mphbac-staff-updated/.test(S.cssCode()));
  for (const w of [360, 390, 1280]) {
    const { ctx, p } = await open(w, true);
    let n = await noStamp(p);
    check(`${w}px: no "Updated" text and no .mphbac-staff-updated on load`, n.el === 0 && !n.text, n);
    await advance(p);
    n = await noStamp(p);
    check(`${w}px: ...nor after the 3-minute refresh`, n.el === 0 && !n.text, n);
    const row = await p.evaluate(() => { const u = document.querySelector('.mphbac-staff-under').getBoundingClientRect(), f = document.querySelector('.mphbac-staff-ghostfield').getBoundingClientRect();
      return { under: Math.round(u.height * 100) / 100, field: Math.round(f.height), kids: document.querySelector('.mphbac-staff-under').children.length }; });
    check(`${w}px: the row under the calendar is the switch alone, ONE 44px row`, row.under === 44 && row.field === 44 && row.kids === 1, row);
    await ctx.close();
  }

  console.log('\n-- the 3-minute refresh is unchanged --');
  {
    const { ctx, p } = await open(390, true);
    const chart0 = await p.evaluate(() => { window.__c0 = document.querySelector('.mphbac-staff-chart'); return true; });
    const n0 = await reqs(p);
    await p.clock.fastForward(2 * 60 * 1000);
    for (let i = 0; i < 5; i++) await p.clock.runFor(50);
    const early = await reqs(p);
    check('nothing at 2 minutes', early === n0, [n0, early]);
    await advance(p);
    const n1 = await reqs(p);
    const redrawn = await p.evaluate(() => document.querySelector('.mphbac-staff-chart') !== window.__c0 && !!document.querySelector('.mphbac-staff-bar'));
    check('at 3 minutes it fetches again and redraws the chart', chart0 && n1 > n0 && redrawn, [n0, n1, redrawn]);
    await advance(p);
    check('...and again 3 minutes later: it still reschedules itself', (await reqs(p)) > n1, [n1, await reqs(p)]);
    await ctx.close();
  }

  console.log('\n-- a failed refresh still says so --');
  for (const [how, fail] of [
    ['the server refuses (success: false)', `window.fetch = function () { window.__reqs.push({ action: 'mphbac_staff_month' }); return Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })); };`],
    ['the network fails', `window.fetch = function () { window.__reqs.push({ action: 'mphbac_staff_month' }); return Promise.reject(new TypeError('Failed to fetch')); };`],
  ]) {
    const { ctx, p } = await open(390, true);
    const ok = await p.evaluate(() => document.querySelector('.mphbac-staff-status').textContent);
    await p.evaluate(fail);
    await advance(p);
    const st = await p.evaluate(() => { const s = document.querySelector('.mphbac-staff-status'); return { text: s.textContent, err: s.classList.contains('is-error'), shown: getComputedStyle(s).display !== 'none' }; });
    check(`${how}: the status line shows "${STR.error}", as an error, where it showed nothing`, ok === '' && st.text === STR.error && st.err && st.shown, st);
    await ctx.close();
  }
  {
    // With Stats open, a failed refresh is QUIET there (0.45.3): the figures
    // on screen stay; the error is the status line's alone.
    const { ctx, p } = await open(390, true);
    await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
    for (let i = 0; i < 10; i++) await p.clock.runFor(50);
    const before = await p.evaluate(() => document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-kpi').length);
    await p.evaluate(() => { window.fetch = function () { return Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })); }; });
    await advance(p);
    const after = await p.evaluate(() => ({ kpis: document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-kpi').length,
      out: document.querySelector('.mphbac-staff-stats-out').textContent.slice(0, 60), status: document.querySelector('.mphbac-staff-status').textContent }));
    check('Stats open: after a failed refresh its figures stay on screen, and the error is in the status line', before > 0 && after.kpis === before && after.status === STR.error, [before, after]);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
