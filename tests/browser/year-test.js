'use strict';
/**
 * TWO-DIGIT YEARS AND DATES THAT CANNOT BE USED (0.43.4).
 *
 * The hint reads "mm/dd/yy". On a desktop a guest following it types
 * 1 0 1 2 2 6, and Chromium stores the year 26 AD — 0026-10-12. The Website
 * Director set exactly that on staging and pressed Show: the field was
 * invalid against min, the calendar did not move, and nothing was said.
 *
 *   Rob decided: a year below 100 becomes 20YY when the value commits — the
 *   field losing focus — in all four fields, and then the existing rules
 *   apply unchanged.
 *   The WD added: when Show (or the booking step) meets a date that is still
 *   unusable — before today, or unreadable because the digits landed in the
 *   year segment — say "Please check the dates." instead of doing nothing.
 *
 * Driven with REAL KEYSTROKES in Chromium against the real widget.js, with
 * fetch() recorded so "Show works" means the request asked for the corrected
 * window. Dates are next year's, so this suite does not go stale.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();

const Y = new Date().getFullYear() + 1, YY = String(Y).slice(2);
const CELL = `<div class="mphbac-grid"><div class="mphbac-row" data-room-type-id="22">
  <div class="mphbac-cell mphbac-cell-status is-available is-clickable" data-date="${Y}-06-10">10</div></div></div>`;

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async ({ w = 1280 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    const sheet = H.sheetHtml().replace('<div class="mphbac-sheet"', '<div class="mphbac-sheet" hidden');
    await p.setContent(H.page({ body: H.filtersHtml() + CELL + sheet + '<div class="mphbac-sheet-overlay" hidden></div>' }));
    await p.evaluate(() => {
      window.__reqs = [];
      window.fetch = (u, o) => { window.__reqs.push(Object.fromEntries(new URLSearchParams(String(o && o.body || '')))); return new Promise(() => {}); };
      document.querySelector('.mphbac-root').dataset.config = JSON.stringify({
        ajaxUrl: '/ajax', popupEnabled: true, minNights: 2, strings: { checkDates: 'Please check the dates.' } });
    });
    await p.addScriptTag({ content: H.js() });
    await p.waitForTimeout(80);
    return { ctx, p };
  };
  const type = async (p, keys) => { for (const k of keys) await p.keyboard.press(k); };
  const val = (p, s) => p.$eval(s, i => i.value);
  const err = p => p.evaluate(() => { const e = document.querySelector('.mphbac-filter-error');
    return { shown: !e.hidden && getComputedStyle(e).display !== 'none', text: e.textContent, role: e.getAttribute('role') }; });
  const ci = '.mphbac-input-checkin', co = '.mphbac-input-checkout';

  console.log('-- 1: the filter fields, typed by hand: 20YY on leaving the field, and Show works --');
  {
    const { ctx, p } = await open();
    await p.focus(ci);                                        // the start of an empty field, as Tab lands
    await type(p, ['1', '0', '1', '2', YY[0], YY[1]]);
    check(`(instrument check) while still in the field Chromium holds the year 00${YY}`, (await val(p, ci)) === `00${YY}-10-12`, await val(p, ci));
    await p.keyboard.press('Tab');
    check(`check-in: 1 0 1 2 ${YY[0]} ${YY[1]}, Tab → ${Y}-10-12`, (await val(p, ci)) === `${Y}-10-12`, await val(p, ci));
    check('check-out, auto-set from the 00YY check-in, is corrected with it', (await val(p, co)) === `${Y}-10-14`, await val(p, co));
    const quiet = await p.evaluate(() => ({ moved: document.querySelector('.mphbac-input-checkout').classList.contains('mphbac-input--just-changed'),
      status: document.querySelector('.mphbac-filter-status').textContent }));
    check('...and it is NOT reported as "moved" — both were corrected before the rules ran', !quiet.moved && quiet.status === '', quiet);
    check('the check-in is valid against min now', await p.$eval(ci, i => i.validity.valid));
    await p.focus(co);
    await p.keyboard.press('Control+a').catch(() => {});
    await type(p, ['1', '0', '1', '6', YY[0], YY[1]]);
    await p.keyboard.press('Tab');
    check(`check-out: 1 0 1 6 ${YY[0]} ${YY[1]}, Tab → ${Y}-10-16`, (await val(p, co)) === `${Y}-10-16`, await val(p, co));
    await p.click('.mphbac-btn-apply');
    await p.waitForTimeout(350);
    const reqs = await p.evaluate(() => window.__reqs);
    const last = reqs[reqs.length - 1] || {};
    check(`Show asks for the corrected window, ${Y}-10-12 → ${Y}-10-16`, last.from === `${Y}-10-12` && last.to === `${Y}-10-16`, last);
    check('...and says nothing — there is nothing wrong', !(await err(p)).shown);
    await ctx.close();
  }
  {
    const { ctx, p } = await open();
    await p.focus(ci);
    await type(p, ['0', '3', '0', '1', '9', '9']);
    await p.keyboard.press('Tab');
    check('99 → 2099: every year below 100 is this century', (await val(p, ci)) === '2099-03-01', await val(p, ci));
    await p.focus(ci);
    // A four-digit year OUTSIDE this decade, so a rewrite by the last two
    // digits (2130 -> 2030) cannot pass for "left alone".
    await type(p, ['0', '3', '0', '1', '2', '1', '3', '0']);
    await p.keyboard.press('Tab');
    check('a four-digit year is left exactly as typed (2130 stays 2130)', (await val(p, ci)) === '2130-03-01', await val(p, ci));
    // Committed by LEAVING with the mouse, no key pressed.
    await p.focus(co);
    await type(p, ['0', '4', '0', '1', YY[0], YY[1]]);
    await p.mouse.click(5, 5);
    check('leaving the field with a click commits it too', (await val(p, co)) === `${Y}-04-01`, await val(p, co));
    await ctx.close();
  }

  console.log('\n-- 2: a date that cannot be used SAYS so, instead of nothing happening --');
  {
    const { ctx, p } = await open();
    const rowH = () => p.evaluate(() => document.querySelector('.mphbac-filters').getBoundingClientRect().height);
    const h0 = await rowH();
    const h1 = await p.evaluate(() => { const e = document.querySelector('.mphbac-filter-error'), par = e.parentNode, nx = e.nextSibling;
      e.remove(); const h = document.querySelector('.mphbac-filters').getBoundingClientRect().height; par.insertBefore(e, nx); return h; });
    check('no layout shift while there is nothing to say: the filter row is the same height with the message as without it', h0 === h1, [h0, h1]);

    // The year-segment trap: a click at the CENTRE of an empty field lands in the year.
    const r = await p.$eval(ci, i => { const b = i.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await p.mouse.click(r[0], r[1]);
    await type(p, ['1', '0', '1', '2', YY[0], YY[1]]);
    const n0 = (await p.evaluate(() => window.__reqs.length));
    await p.click('.mphbac-btn-apply');
    await p.waitForTimeout(350);
    check('(instrument check) a centre click put the digits in the year: the value is empty and unreadable',
      await p.$eval(ci, i => i.value === '' && i.validity.badInput));
    let e = await err(p);
    check('Show says "Please check the dates." next to the fields, as an alert', e.shown && e.text === 'Please check the dates.' && e.role === 'alert', e);
    check('...and asks for nothing', (await p.evaluate(() => window.__reqs.length)) === n0);
    await p.click('.mphbac-btn-reset');
    check('Reset clears the message', !(await err(p)).shown);

    await p.focus(ci);
    await type(p, ['0', '1', '0', '5', '2', '0', '2', '0']);       // 2020-01-05: before today
    await p.keyboard.press('Tab');
    const n1 = (await p.evaluate(() => window.__reqs.length));
    await p.click('.mphbac-btn-apply');
    await p.waitForTimeout(350);
    e = await err(p);
    check('a date before today: Show says so too, and asks for nothing', e.shown && (await p.evaluate(() => window.__reqs.length)) === n1, e);
    await p.focus(ci);
    await type(p, ['1', '0', '1', '2', YY[0], YY[1]]);
    await p.keyboard.press('Tab');
    check('correcting the date clears the message', !(await err(p)).shown);
    await ctx.close();
  }
  {
    const js = H.js();
    const fn = js.slice(js.indexOf('function showFilterError'), js.indexOf('function hideFilterError'));
    check('the message is written with textContent — no HTML-injection API', /textContent\s*=/.test(fn) && !/innerHTML|insertAdjacentHTML/.test(fn), fn.slice(0, 80));
  }
  for (const w of [375]) {
    const { ctx, p } = await open({ w });
    await p.evaluate(() => { document.querySelector('.mphbac-filter-error').hidden = false;
      document.querySelector('.mphbac-filter-error').textContent = 'Please check the dates.'; });
    const m = await p.evaluate(() => { const e = document.querySelector('.mphbac-filter-error').getBoundingClientRect();
      const f = document.querySelector('.mphbac-filters').getBoundingClientRect(); return { e: Math.round(e.width), f: Math.round(f.width) }; });
    check(`${w}px: the message spans the filter row`, Math.abs(m.e - m.f) <= 1, m);
    await ctx.close();
  }

  console.log('\n-- the booking popup: the same correction and the same message --');
  {
    const { ctx, p } = await open();
    // A direct click(): fetch never answers here, so the widget stays in its
    // loading state, whose overlay would take a pointer click.
    await p.$eval('.mphbac-cell-status.is-clickable', c => c.click());
    await p.waitForFunction(() => !document.querySelector('.mphbac-sheet').hidden);
    await p.waitForTimeout(150);
    await p.evaluate(() => ['.mphbac-sheet-checkin', '.mphbac-sheet-checkout'].forEach(s => {
      const i = document.querySelector(s); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); }));
    await p.focus('.mphbac-sheet-checkin');
    // Tab, Tab: in Chrome the first Tab after the year goes to the field's own
    // calendar icon (the year is committed THERE), the second to the next field.
    await type(p, ['0', '6', '1', '2', YY[0], YY[1]]);
    await p.keyboard.press('Tab');
    check('popup: corrected on the FIRST Tab, while focus is still inside the field (on its icon)',
      (await val(p, '.mphbac-sheet-checkin')) === `${Y}-06-12`
      && await p.evaluate(() => document.activeElement === document.querySelector('.mphbac-sheet-checkin')),
      await val(p, '.mphbac-sheet-checkin'));
    await p.keyboard.press('Tab');
    await type(p, ['0', '6', '1', '5', YY[0], YY[1]]);
    await p.keyboard.press('Tab');
    await p.keyboard.press('Tab');
    await p.waitForTimeout(50);
    const m = await p.evaluate(() => ({ ci: document.querySelector('.mphbac-sheet-checkin').value,
      co: document.querySelector('.mphbac-sheet-checkout').value,
      err: !document.querySelector('.mphbac-sheet-error').hidden, book: !document.querySelector('.mphbac-sheet-confirm').disabled }));
    check(`popup: typed 2-digit years become ${Y}`, m.ci === `${Y}-06-12` && m.co === `${Y}-06-15`, m);
    check('popup: no message, and Book Now is live', !m.err && m.book, m);

    // Still typing is not an error: clear the month of a full date while the
    // field has focus — unreadable, but the guest is not finished.
    await p.focus('.mphbac-sheet-checkin');
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(30);
    const mid = await p.evaluate(() => ({ bad: document.querySelector('.mphbac-sheet-checkin').validity.badInput,
      shown: !document.querySelector('.mphbac-sheet-error').hidden }));
    check('popup: no message while the guest is still in the field', mid.bad && !mid.shown, mid);
    await p.evaluate(() => { const i = document.querySelector('.mphbac-sheet-checkin'); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); });
    const r = await p.$eval('.mphbac-sheet-checkin', i => { const b = i.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await p.mouse.click(r[0], r[1]);
    await type(p, ['0', '6', '1', '2']);
    await p.keyboard.press('Tab');                    // the icon, still inside the field
    await p.keyboard.press('Tab');                    // out of it
    await p.waitForTimeout(50);
    const e = await p.evaluate(() => ({ text: document.querySelector('.mphbac-sheet-error').textContent,
      shown: !document.querySelector('.mphbac-sheet-error').hidden, book: !document.querySelector('.mphbac-sheet-confirm').disabled,
      bad: document.querySelector('.mphbac-sheet-checkin').validity.badInput }));
    check('popup: an unreadable date says "Please check the dates." on leaving the field, and Book Now stays off',
      e.bad && e.shown && e.text === 'Please check the dates.' && !e.book, e);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
