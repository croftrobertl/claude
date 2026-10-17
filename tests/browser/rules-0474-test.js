'use strict';
/**
 * 0.47.4 — THE PUBLIC CALENDAR FOLLOWS MOTOPRESS'S BOOKING RULES (Rob's pick).
 *
 * End to end: the page is rendered by the plugin and every request it makes
 * is answered by the plugin's own endpoint, over MotoPress 6.4.0's rule
 * engine and the staging fixture (tests/render/fixture-0474.php, through
 * site-0474.js). Chromium with touch emulation stands in for Safari on a
 * phone: Playwright's WebKit cannot be installed in this environment.
 *
 * The fixture, as the WD will build it on staging: no check-in on Tuesdays;
 * a season (today+30 … today+60) with a 3-night minimum, 2 nights elsewhere;
 * a 14-night maximum; a 1-day buffer; a 1-day minimum advance. The Boathouse
 * (the cottage page under test) is booked today+10 … today+13.
 *
 * What Rob asked for, checked here:
 *   - a day that cannot START a stay looks it from the start (the striped
 *     "No Check-In" look, his option C) and says nothing at load;
 *   - a tap on it says why — and only then; the popup does not open;
 *   - it carries aria-disabled and its reason in its accessible name;
 *   - the popup applies MotoPress's minimum and maximum and its arrival and
 *     departure days, with the existing "too short" message at MotoPress's
 *     minimum;
 *   - buffer nights show as booked, and no rule ever shows a booked night
 *     as open;
 *   - when MotoPress cannot be read, the calendar is 0.47.3's.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const H = require('./harness.js');
const site = require('./site-0474.js');
const { check, done } = H.reporter();
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const V2 = '3043:8e23564';   // the Boathouse page (single-cottage, month grid)
const V1 = '620:b7318c3';    // the homepage overview (every cottage, day strip)
const BOATHOUSE = 1071;
const dow = d => new Date(d + 'T12:00:00').getDay();
const cell = d => `.mphbac-cell-status[data-date="${d}"]`;
const sheetState = p => p.evaluate(() => {
  const s = document.querySelector('.mphbac-sheet');
  const e = document.querySelector('.mphbac-sheet-error');
  const b = document.querySelector('.mphbac-sheet-confirm');
  return { open: !!s && s.classList.contains('is-open') && !s.hidden,
    ci: (document.querySelector('.mphbac-sheet-checkin') || {}).value || '',
    co: (document.querySelector('.mphbac-sheet-checkout') || {}).value || '',
    error: e && !e.hidden ? e.textContent : '', bookDisabled: b ? b.disabled : null };
});
const setDates = async (p, ci, co) => {
  if (ci !== null) await p.fill('.mphbac-sheet-checkin', ci);
  if (co !== null) await p.fill('.mphbac-sheet-checkout', co);
  await p.waitForTimeout(80);
};
const tipOf = (p, d) => p.evaluate(sel => {
  const c = document.querySelector(sel);
  const t = c && c.querySelector('.mphbac-cell-tip');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  const live = document.querySelector('.mphbac-rule-status');
  return { open: c.classList.contains('is-tip-open'), opacity: getComputedStyle(t).opacity, text: t.textContent,
    left: r.left, right: r.right, vw: document.documentElement.clientWidth, live: live ? live.textContent : null };
}, cell(d));

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const today = site.day(0);
  const inSeason = (() => { for (let n = 31; ; n++) { const d = site.day(n); if (dow(d) !== 2) return d; } })();
  const outSeason = (() => { for (let n = 15; ; n++) { const d = site.day(n); if (dow(d) !== 2 && dow(site.day(n + 2)) !== 2) return d; } })();
  const tuesday = (() => { for (let n = 1; ; n++) { const d = site.day(n); if (dow(d) === 2 && (n < 9 || n > 14)) return d; } })();
  const add = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

  console.log('-- 1. the Boathouse page at 360px (touch): what shows at load --');
  {
    const { ctx, p } = await site.open(browser, { mode: 'fixture', cas: V2, width: 360 });
    const load = await p.evaluate(() => ({
      open: [...document.querySelectorAll('.is-tip-open')].length,
      shownTips: [...document.querySelectorAll('.mphbac-cell-tip')].filter(t => getComputedStyle(t).opacity !== '0').length,
      alerts: [...document.querySelectorAll('[role="alert"]')].filter(a => !a.hidden && a.textContent.trim()).map(a => a.textContent),
      live: document.querySelector('.mphbac-rule-status'),
      sheet: !!document.querySelector('.mphbac-sheet.is-open'),
      legend: [...document.querySelectorAll('.mphbac-legend-item')].filter(x => !x.hidden).map(x => x.textContent.trim()),
    }));
    check('NO MESSAGE AT LOAD: no tip shown, no alert, no rule message in any live region, no popup',
      load.open === 0 && load.shownTips === 0 && load.alerts.length === 0 && load.live === null && !load.sheet, load);
    check('the legend names the new look, between Available and Booked: "No Check-In" (Title Case)',
      JSON.stringify(load.legend) === '["Available","No Check-In","Booked","Past"]', load.legend);

    const days = await p.evaluate(() => [...document.querySelectorAll('.mphbac-cell-status')].map(c => ({
      d: c.dataset.date, cls: c.className, label: c.getAttribute('aria-label'), dis: c.getAttribute('aria-disabled'), tab: c.tabIndex,
      bg: getComputedStyle(c).backgroundImage })));
    const nci = days.filter(x => /\bis-no-checkin\b/.test(x.cls));
    const tues = days.filter(x => dow(x.d) === 2 && /\bis-available\b/.test(x.cls));
    check('EVERY open Tuesday is a no-check-in day, and nothing else is but today (too soon)',
      tues.length >= 4 && tues.every(x => /\bis-no-checkin\b/.test(x.cls)) && nci.every(x => dow(x.d) === 2 || x.d === today),
      nci.map(x => x.d));
    check('...each is striped (a gradient over the available colour), not the red or grey of booked and past',
      nci.length > 0 && nci.every(x => /repeating-linear-gradient/.test(x.bg)), nci.map(x => x.bg.slice(0, 40)));
    check('...each carries aria-disabled="true", stays reachable (tabindex 0), and is NOT a check-in (no is-clickable)',
      nci.every(x => x.dis === 'true' && x.tab === 0 && !/\bis-clickable\b/.test(x.cls)), nci);
    check('...and its reason ends its accessible name: "No check-in on this day." — today: "Too soon to book this day."',
      nci.every(x => x.label === (x.d === today ? `${+x.d.slice(8)} — Too soon to book this day.` : `${+x.d.slice(8)} — No check-in on this day.`)),
      nci.map(x => x.label));
    check('ordinary open days are unchanged: is-clickable, no aria-disabled, "— Available"',
      days.filter(x => /\bis-available\b/.test(x.cls) && !/no-checkin/.test(x.cls)).every(x => /\bis-clickable\b/.test(x.cls) && x.dis === null && /— Available$/.test(x.label)));

    // NO RULE MAKES A BOOKED NIGHT OPEN — against the endpoint's own answer.
    const from = days[0].d, to = days[days.length - 1].d;
    const ans = JSON.parse(site.ajax(site.HERE, `action=mphbac_query&from=${from}&to=${to}&room_type_ids[]=${BOATHOUSE}`, 'fixture')).data;
    const bad = days.filter(x => ans.availability[BOATHOUSE][x.d] === 'booked' && !/\bis-booked\b/.test(x.cls));
    check('NO BOOKED NIGHT SHOWS OPEN: every night the endpoint calls booked is drawn booked (' + days.length + ' days)', bad.length === 0, bad);
    const buf = [site.day(9), site.day(13)];
    check('BUFFER DAYS SHOW BOOKED: the night before the stay (today+9) and the night it ends (today+13)',
      buf.every(d => /\bis-booked\b/.test((days.find(x => x.d === d) || {}).cls || '')), buf);
    const plain = JSON.parse(site.ajax(site.HERE, `action=mphbac_query&from=${from}&to=${to}&room_type_ids[]=${BOATHOUSE}`, 'throw')).data;
    check('...(instrument check) which without the rules are open — 0.47.3 showed them free',
      buf.every(d => plain.availability[BOATHOUSE][d] === 'available'), buf.map(d => plain.availability[BOATHOUSE][d]));
    check('...and the stay\'s own nights (today+10 … today+12) are booked either way',
      [10, 11, 12].every(n => ans.availability[BOATHOUSE][site.day(n)] === 'booked' && plain.availability[BOATHOUSE][site.day(n)] === 'booked'));

    console.log('\n-- 2. a tap on a day that cannot start a stay --');
    await p.tap(cell(tuesday), { force: true });   // Playwright counts aria-disabled as disabled; a browser does not
    await p.waitForTimeout(150);
    let t = await tipOf(p, tuesday);
    let s = await sheetState(p);
    check('TAP A TUESDAY: its tip opens with the reason, "No check-in on this day."',
      t.open && t.opacity === '1' && t.text === 'No check-in on this day.', t);
    check('...the same words reach the polite live region, for a screen reader', t.live === 'No check-in on this day.', t.live);
    check('...the popup does NOT open — the day cannot be picked as a check-in', !s.open, s);
    check('...and the tip stays on the screen (inside 0 … ' + t.vw + 'px)', t.left >= 0 && t.right <= t.vw, [t.left, t.right]);
    await p.waitForTimeout(4200);
    t = await tipOf(p, tuesday);
    check('...it closes by itself after a few seconds', !t.open && t.opacity === '0', t);
    await p.tap(cell(today), { force: true });
    await p.waitForTimeout(150);
    t = await tipOf(p, today);
    check('TAP TODAY (1-day minimum advance): "Too soon to book this day.", and no popup',
      t.open && t.text === 'Too soon to book this day.' && t.live === 'Too soon to book this day.' && !(await sheetState(p)).open, t);
    // Every open Tuesday on screen sits at an edge column? Not at 360: the
    // month grid's Tuesday is the third column. The edge clamp is proven at
    // 1280 below, where the strip's last day is at the right edge.

    console.log('\n-- 3. the popup: MotoPress\'s minimum, maximum and arrival day --');
    await p.tap(cell(outSeason));
    await p.waitForTimeout(400);
    s = await sheetState(p);
    check(`TAP ${outSeason} (outside the season): the popup opens with ${add(outSeason, 2)} — MotoPress's 2 nights — and no message`,
      s.open && s.ci === outSeason && s.co === add(outSeason, 2) && s.error === '' && s.bookDisabled === false, s);
    await p.click('.mphbac-sheet-cancel');
    await p.waitForTimeout(400);
    await p.tap(cell(inSeason));
    await p.waitForTimeout(400);
    s = await sheetState(p);
    check(`TAP ${inSeason} (in the season): check-out proposed at ${add(inSeason, 3)} — THE SEASON'S 3 NIGHTS — and no message`,
      s.open && s.ci === inSeason && s.co === add(inSeason, 3) && s.error === '' && s.bookDisabled === false, s);
    await setDates(p, null, add(inSeason, 2));
    s = await sheetState(p);
    check('2 nights in the season: the existing "too short" message, at MotoPress\'s minimum — "Must be a minimum of 3 nights. Please select new dates."',
      s.error === 'Must be a minimum of 3 nights. Please select new dates.' && s.bookDisabled === true, s);
    await setDates(p, null, add(inSeason, 14));
    s = await sheetState(p);
    check('14 nights: allowed (the maximum is 14)', s.error === '' && s.bookDisabled === false, s);
    await setDates(p, null, add(inSeason, 15));
    s = await sheetState(p);
    check('15 nights: "Must be a maximum of 14 nights. Please select new dates."',
      s.error === 'Must be a maximum of 14 nights. Please select new dates.' && s.bookDisabled === true, s);
    const tue2 = (() => { for (let n = 0; ; n++) { const d = add(inSeason, n); if (dow(d) === 2) return d; } })();
    await setDates(p, tue2, add(tue2, 4));
    s = await sheetState(p);
    check(`check-in moved to a Tuesday (${tue2}): "No check-in on that day. Please select new dates."`,
      s.error === 'No check-in on that day. Please select new dates.' && s.bookDisabled === true, s);
    await setDates(p, today, add(today, 3));
    s = await sheetState(p);
    check('check-in moved to today: "That check-in is too soon. Please select new dates."',
      s.error === 'That check-in is too soon. Please select new dates.' && s.bookDisabled === true, s);
    await setDates(p, inSeason, add(inSeason, 4));
    s = await sheetState(p);
    check('...and back to a good range: the message goes and Book Now is live again', s.error === '' && s.bookDisabled === false, s);
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  console.log('\n-- 4. the homepage overview at 1280px (mouse, keyboard) --');
  {
    const { ctx, p } = await site.open(browser, { mode: 'fixture', cas: V1, width: 1280 });
    const n = await p.evaluate(() => ({ nci: document.querySelectorAll('.is-no-checkin').length,
      rows: document.querySelectorAll('.mphbac-row[data-room-type-id]').length }));
    check('every cottage row has its Tuesdays and today striped (8 cottages)', n.rows === 8 && n.nci >= 8 * 3, n);
    const tue = `.mphbac-row[data-room-type-id="1071"] ${cell(tuesday)}`;
    await p.hover(tue, { force: true });
    await p.waitForTimeout(250);
    const hov = await p.evaluate(sel => getComputedStyle(document.querySelector(sel + ' .mphbac-cell-tip')).opacity, tue);
    check('a mouse over a no-check-in day shows its reason in the tip, as every cell shows its status', hov === '1', hov);
    await p.mouse.move(0, 0);
    await p.focus(tue);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(150);
    const k = await p.evaluate(sel => {
      const c = document.querySelector(sel);
      return { open: c.classList.contains('is-tip-open'), live: (document.querySelector('.mphbac-rule-status') || {}).textContent,
        sheet: !!document.querySelector('.mphbac-sheet.is-open') };
    }, tue);
    check('KEYBOARD: Enter on a focused no-check-in day says why, and opens no popup',
      k.open && k.live === 'No check-in on this day.' && !k.sheet, k);
    await p.addScriptTag({ content: AXE });
    const ax = await p.evaluate(async () => {
      const r = await window.axe.run(document.querySelector('.mphbac-grid'), { runOnly: { type: 'rule',
        values: ['aria-allowed-attr', 'aria-required-parent', 'aria-required-children', 'aria-valid-attr-value', 'label-content-name-mismatch'] } });
      return { v: r.violations.map(v => v.id + ':' + v.nodes.length), passes: r.passes.map(v => v.id) };
    });
    check('axe-core 4.14.0 on the striped grid: aria-disabled is allowed on these gridcells, names match what they show — no violation',
      ax.v.length === 0 && ax.passes.includes('aria-allowed-attr'), ax);
    // The edge clamp: the strip's LAST column is at the card's right edge.
    const last = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('.mphbac-row[data-room-type-id] .is-no-checkin')];
      return cs.length ? cs[cs.length - 1].dataset.date : null;
    });
    const edge = await p.evaluate(() => {
      const c = [...document.querySelectorAll('.mphbac-row[data-room-type-id="1071"] .mphbac-cell-status')].pop();
      c.classList.add('is-no-checkin'); c.classList.remove('is-clickable');
      c.querySelector('.mphbac-cell-tip').textContent = 'Too far ahead to book this day.';
      return c.dataset.date;
    });
    await p.click(`.mphbac-row[data-room-type-id="1071"] ${cell(edge)}`, { force: true });
    await p.waitForTimeout(150);
    const e = await tipOf(p, edge);
    check('a tip at the right edge is kept on the screen (shifted, not cut off)', e.open && e.right <= e.vw - 3, [e.left, e.right, e.vw, last]);
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  console.log('\n-- 4b. Book Now asks the server again: dates beyond the loaded window --');
  {
    // The overview loads 28 days; the season (today+30 …) is past it, so the
    // page holds no rules for these dates and says nothing while they are
    // typed. Book Now re-asks the endpoint, through the check-out day, and
    // its answer decides.
    const { ctx, p } = await site.open(browser, { mode: 'fixture', cas: V1, width: 1280 });
    const tueFar = (() => { for (let n = 31; ; n++) { const d = site.day(n); if (dow(d) === 2) return d; } })();
    const book = async (ci, co) => {
      await p.click('.mphbac-row[data-room-type-id="1071"] .mphbac-cell-status.is-clickable');
      await p.waitForTimeout(400);
      await setDates(p, ci, co);
      const before = await sheetState(p);
      const n = p.__ajax.length;
      await p.click('.mphbac-sheet-confirm');
      await p.waitForTimeout(1200);
      const asked = p.__ajax.slice(n).map(a => a.body).filter(b => b.startsWith('action=mphbac_query'));
      const after = p.isClosed() ? null : await sheetState(p).catch(() => null);
      return { before, asked, after };
    };
    let r = await book(tueFar, add(tueFar, 4));
    check(`a Tuesday in the season (${tueFar}) typed in: no message yet — the page has no rules that far out`,
      r.before.error === '' && r.before.bookDisabled === false, r.before);
    check('...Book Now asks the endpoint through the CHECK-OUT day', r.asked.length === 1 && r.asked[0].includes('to=' + add(tueFar, 4)), r.asked);
    check('...and its answer stops it: "No check-in on that day. Please select new dates." — nothing sent to checkout',
      r.after && r.after.error === 'No check-in on that day. Please select new dates.' && p.__sent.length === 0, [r.after, p.__sent]);
    await p.click('.mphbac-sheet-cancel');
    await p.waitForTimeout(400);
    r = await book(add(tueFar, 1), add(tueFar, 3));
    check('two nights in the season, beyond the window: Book Now is stopped by the season\'s 3-night minimum — in numbers, though this'
      + ' page\'s own wording says "two nights" (live\'s; right only for the widget\'s minimum)',
      r.after && r.after.error === 'Must be a minimum of 3 nights. Please select new dates.' && p.__sent.length === 0, [r.after, p.__sent]);
    await p.click('.mphbac-sheet-cancel');
    await p.waitForTimeout(400);
    r = await book(add(tueFar, 1), add(tueFar, 4));
    const sent = p.__sent.filter(x => x.method === 'POST');
    check('three nights there: every rule met, so Book Now goes on to MotoPress\'s checkout with those dates',
      sent.length === 1 && sent[0].body.includes('mphb_check_in_date=' + add(tueFar, 1)) && sent[0].body.includes('mphb_check_out_date=' + add(tueFar, 4)), sent);
    await ctx.close();
  }

  console.log('\n-- 5. departure days and "too far ahead" (beyond the WD\'s list) --');
  {
    const { ctx, p } = await site.open(browser, { mode: 'checkout', cas: V2, width: 390 });
    // A Monday outside the season: +2 nights lands on a Wednesday, which may
    // not end a stay, so the proposal runs on to Thursday.
    const mon = (() => { for (let n = 15; ; n++) { const d = site.day(n); if (dow(d) === 1 && n + 3 < 30) return d; } })();
    await p.tap(cell(mon));
    await p.waitForTimeout(400);
    let s = await sheetState(p);
    check(`TAP Monday ${mon}: 2 nights would end on a Wednesday, so check-out is proposed for Thursday ${add(mon, 3)}, with no message`,
      s.open && s.co === add(mon, 3) && s.error === '', s);
    await setDates(p, null, add(mon, 2));
    s = await sheetState(p);
    check('check-out set to the Wednesday: "No check-out on that day. Please select new dates."',
      s.error === 'No check-out on that day. Please select new dates.' && s.bookDisabled === true, s);
    await p.click('.mphbac-sheet-cancel');
    await p.waitForTimeout(400);
    // Days past the 60-day window: in the third month.
    await p.click('.mphbac-nav-next');
    await p.waitForTimeout(800);
    const far = await p.evaluate(() => [...document.querySelectorAll('.is-no-checkin')].map(c => [c.dataset.date, c.getAttribute('aria-label')]));
    const limit = site.day(60);
    const after = far.filter(([d]) => d > limit);
    check(`past the 60-day maximum advance (after ${limit}) every open day says "Too far ahead to book this day."`,
      after.length > 5 && after.every(([, l]) => / — Too far ahead to book this day\.$/.test(l)), after.slice(0, 3));
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  console.log('\n-- 6. MotoPress cannot be read: the calendar is 0.47.3\'s --');
  {
    const { ctx, p } = await site.open(browser, { mode: 'throw', cas: V2, width: 360 });
    const f = await p.evaluate(() => ({ nci: document.querySelectorAll('.is-no-checkin, [aria-disabled]').length,
      legend: [...document.querySelectorAll('.mphbac-legend-item')].filter(x => !x.hidden).map(x => x.textContent.trim()) }));
    check('no day is striped or disabled, and the legend is the old three', f.nci === 0 && JSON.stringify(f.legend) === '["Available","Booked","Past"]', f);
    check('the endpoint sent no `rules` (the field is optional) — the page asked it: ' + p.__ajax.length + ' request(s)',
      p.__ajax.every(a => a.json.success && !('rules' in a.json.data)), p.__ajax.map(a => Object.keys(a.json.data)));
    const buf = await p.evaluate(sel => (document.querySelector(sel) || {}).className, cell(site.day(9)));
    check('buffer nights are not added (0.47.3 had none): today+9 is open', /\bis-available\b/.test(buf || ''), buf);
    await p.tap(cell(tuesday));
    await p.waitForTimeout(400);
    const s = await sheetState(p);
    check('a Tuesday opens the popup, with the WIDGET\'s minimum (2 nights) — as 0.47.3', s.open && s.co === add(tuesday, 2) && s.error === '', s);
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
