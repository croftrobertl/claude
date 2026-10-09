'use strict';
/**
 * THE 0.44.0 BOARD, DRIVEN IN A REAL PAGE WITH THE REAL staff.js.
 *
 * Bars (Rob's option C), turnovers, the today tiles, the four filters, the
 * quick preview, the sheet's tap-to-call / text / email and Open in WP-Admin,
 * the 3-minute auto-refresh and the one-shot token reload. The shell is
 * EXTRACTED FROM THE PHP and fetch() is answered by staff-harness.js's
 * stand-in server; the fixture is board-fixture.js, "today" pinned to
 * Thursday 2026-10-08.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const F = require('./board-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'http://staff.test/';
const RGB = { direct: 'rgb(7, 135, 50)', airbnb: 'rgb(188, 0, 62)', booking: 'rgb(0, 46, 122)', vrbo: 'rgb(15, 109, 191)', other: 'rgb(51, 65, 85)' };

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const open = async ({ phone = false, inset = 0, clock = false, html = null, init = null } = {}) => {
    const ctx = await browser.newContext(phone
      ? { viewport: { width: 375, height: 900 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 1000 } });
    const page = html || S.boardShell({ today: F.TODAY, cottages: F.COTTAGES, bookings: F.BOOKINGS, details: F.DETAILS,
      bodyStyle: inset ? 'padding:0 ' + inset + 'px' : '' });
    let loads = 0;
    await ctx.route(ORIGIN + '**', r => { loads++; return r.fulfill({ body: page, contentType: 'text/html' }); });
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.__errors = [];
    p.on('pageerror', e => { p.__errors.push(e.message); console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    if (clock) await p.clock.install({ time: new Date('2026-10-08T09:00:00') });
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.waitForTimeout(120);
    p.loads = () => loads;
    return { ctx, p };
  };
  const bars = p => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].map(b => {
    const r = b.getBoundingClientRect(), t = b.querySelector('.mphbac-staff-bar-text');
    const kids = [...b.querySelectorAll('.mphbac-staff-bar-label > *')].map(k => k.getBoundingClientRect());
    return { id: +b.dataset.bookingId, cls: b.className, bg: getComputedStyle(b).backgroundColor,
      img: getComputedStyle(b).backgroundImage, text: t ? t.textContent : '',
      tags: [...b.querySelectorAll('.mphbac-staff-tag')].map(x => x.textContent),
      badge: (b.querySelector('.mphbac-staff-otabadge') || {}).textContent || '', paw: !!b.querySelector('svg.mphbac-staff-paw'),
      // Every piece of the label lies inside the bar: nothing is clipped. Bars
      // running off a scrolled chart are judged against their own box.
      inside: kids.every(k => k.width === 0 || (k.left >= r.left - 0.5 && k.right <= r.right + 0.5)),
      textClipped: !!t && t.scrollWidth > t.clientWidth + 0.5 };
  }));
  const byId = list => Object.fromEntries(list.map(b => [b.id, b]));
  const choose = async (p, v) => { await p.selectOption('.mphbac-staff-period', v); await p.waitForTimeout(80); };

  console.log('-- 1: bars — the whole bar is its source (Rob, option C) --');
  {
    const { ctx, p } = await open();
    const b = byId(await bars(p));
    for (const [id, src] of [[1, 'direct'], [2, 'airbnb'], [3, 'booking'], [4, 'vrbo'], [5, 'other']]) {
      check(`booking ${id} (${src}): the whole bar is ${RGB[src]}`, b[id] && b[id].bg === RGB[src] && b[id].cls.includes('is-src-' + src), b[id] && b[id].bg);
    }
    check('imports keep their letter badge (A / B / V); direct bookings carry none — the source never rests on colour alone',
      b[2].badge === 'A' && b[3].badge === 'B' && b[4].badge === 'V' && b[1].badge === '', [b[1].badge, b[2].badge, b[3].badge, b[4].badge]);
    check('a pending booking keeps its stripes, over the whole bar', b[6].img.includes('repeating-linear-gradient') && b[1].img === 'none', [b[6].img.slice(0, 40), b[1].img]);
    check('a booking that passes the pet rule carries the paw; others do not', b[1].paw && b[9].paw && !b[2].paw && !b[3].paw);
    check('IN and OUT tags on a stay that starts and ends in the month', b[2].tags.join() === 'IN,OUT', b[2].tags);
    check('...and on a 1-night bar at 44px days they shrink to ▸ / ◂ (or ▸ alone) instead of overlapping',
      (b[7].tags.join() === '▸,◂' || b[7].tags.join() === '▸') && b[7].cls.includes('is-compact'), b[7].tags);
    const all = Object.values(b);
    check('NO bar clips anything: every tag, badge, paw and name lies inside its bar', all.every(x => x.inside && !x.textClipped),
      all.filter(x => !x.inside || x.textClipped).map(x => x.id));
    console.log('      monthly 44px: ' + all.map(x => `#${x.id} ${x.tags.join('/')} "${x.text}"`).join(' | '));
    check('the name rule where it fits: 4+ nights the full name ("Bob Jones")', b[2].text === 'Bob Jones', b[2].text);
    check('...2–3 nights "First L." beside the tags ("Ann S.")', b[1].text === 'Ann S.', b[1].text);
    check('...on a short bar the NAME wins over word tags: "Hal P." beside ▸ / ◂', b[8].text === 'Hal P.' && b[8].tags.join() === '▸,◂', [b[8].text, b[8].tags]);
    const t = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].find(x => x.dataset.bookingId === '8').getAttribute('aria-label'));
    check('...the name is never lost: it is in the bar\'s description, with the source by name', /Hal Price/.test(t) && /Airbnb/.test(t), t);
    await ctx.close();
  }
  for (const [phone, inset, who] of [[false, 0, 'DESKTOP Weekly'], [true, 0, 'PHONE Weekly 375px'], [true, 27, 'PHONE Weekly, a 320px chart']]) {
    const { ctx, p } = await open({ phone, inset });
    await choose(p, 'week');
    const all = await bars(p);
    const dayW = await p.evaluate(() => Math.round(document.querySelector('.mphbac-staff-dayhead').getBoundingClientRect().width));
    check(`${who} (${dayW}px days): nothing clipped on any bar`, all.every(x => x.inside && !x.textClipped),
      all.filter(x => !x.inside || x.textClipped).map(x => [x.id, x.tags, x.text]));
    console.log(`      ${who} ${dayW}px: ` + all.map(x => `#${x.id} ${x.tags.join('/')} "${x.text}"`).join(' | '));
    const b = byId(all);
    if (!phone) {
      check(`${who}: with room, a 1-night bar gets initials beside word tags ("GL")`, b[7].text === 'GL' && b[7].tags.join() === 'IN,OUT', [b[7].text, b[7].tags]);
    }
    if (inset) {
      check(`${who}: the nights count where the name does not fit ("4n" for Bob Jones)`, b[2].text === '4n', b[2].text);
    }
    await ctx.close();
  }

  console.log('\n-- 3: turnovers — on the chart and first in Daily --');
  {
    const { ctx, p } = await open();
    const marks = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-turn')].map(m => ({
      day: m.dataset.day, row: m.style.gridRow, pe: getComputedStyle(m).pointerEvents, label: m.getAttribute('aria-label') })));
    check('two turnover marks: #22 on Oct 9 (Ann → Gus) and #23 on Oct 8 (Cy → Bob)',
      marks.length === 2 && marks.some(m => m.day === '2026-10-09' && /Ann Smith.*Gus Long/.test(m.label))
      && marks.some(m => m.day === '2026-10-08' && /Cy Lee.*Bob Jones/.test(m.label)), marks);
    check('...and they take no tap — the bars beneath keep theirs', marks.every(m => m.pe === 'none'));
    await choose(p, 'day');
    const g = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-group')].map(x => ({
      head: x.querySelector('.mphbac-staff-group-head').firstChild.textContent,
      lines: [...x.querySelectorAll('.mphbac-staff-turnline')].map(l => l.textContent),
      items: x.querySelectorAll('.mphbac-staff-item').length })));
    check('Daily: Turnovers is FIRST, one line per cottage', g[0].head === 'Turnovers' && g[0].lines.length === 1, g[0]);
    check('...reading "Cottage 23: Lee out → Jones in"', g[0].lines[0] === 'Cottage 23: Lee out → Jones in', g[0].lines);
    check('...and those guests are still listed under Arriving and Departing, so the counts match',
      g[1].head === 'Arriving' && g[1].items === 1 && g[2].head === 'Departing' && g[2].items === 1, g);
    const paw = await p.evaluate(() => !![...document.querySelectorAll('.mphbac-staff-item')].find(i => i.dataset.bookingId === '1').querySelector('svg.mphbac-staff-paw'));
    check('Daily: the pet booking carries its paw in the list too', paw);
    await ctx.close();
  }

  console.log('\n-- the legend says what a bar can carry --');
  {
    const { ctx, p } = await open();
    const l = await p.evaluate(() => ({
      keys: [...document.querySelectorAll('.mphbac-staff-legend .mphbac-staff-key')].map(k => k.textContent.trim()),
      sw: [...document.querySelectorAll('.mphbac-staff-legend .mphbac-staff-key[class*="is-src-"]')].map(k => getComputedStyle(k, '::before').backgroundColor) }));
    check('the five sources in their colours, then the tags, pending, turnover and pets',
      JSON.stringify(l.sw) === JSON.stringify(['direct', 'airbnb', 'booking', 'vrbo', 'other'].map(k => RGB[k]))
      && l.keys.some(k => /Check-in \/ check-out/.test(k)) && l.keys.includes('Pending') && l.keys.includes('Turnover') && l.keys.includes('Pets'), l);
    await ctx.close();
  }

  console.log('\n-- 4: today tiles — the real today; % booked follows the period; all respect the filters --');
  {
    const { ctx, p } = await open();
    const tiles = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mphbac-staff-tile')].map(t =>
      [t.className.replace('mphbac-staff-tile is-', ''), t.querySelector('.mphbac-staff-tile-num').textContent])));
    let t = await tiles();
    check('arriving 1 (Bob), leaving 1 (Cy), in house 2 (Ann, Ivy), turnovers 1 (#23)',
      t.arriving === '1' && t.leaving === '1' && t.inhouse === '2' && t.turnovers === '1', t);
    check('Booked for October: 52 cottage-nights of 8 × 31 = 21% — the block echoing Bob\'s nights counts ONCE', t.booked === '21%', t.booked);
    const tip = await p.evaluate(() => document.querySelector('.mphbac-staff-tile.is-booked').title);
    check('...and its tooltip says how it is counted', /Booked nights ÷ \(cottages × nights/.test(tip), tip);
    await p.click('.mphbac-staff-next');
    await p.waitForTimeout(80);
    t = await tiles();
    check('in November the TODAY tiles still mean today; Booked follows November (0%)',
      t.arriving === '1' && t.leaving === '1' && t.inhouse === '2' && t.turnovers === '1' && t.booked === '0%', t);
    await p.click('.mphbac-staff-today');
    await p.waitForTimeout(80);
    await p.click('.mphbac-staff-filters-toggle');
    await p.check('.mphbac-staff-filters input[name=source][value=airbnb]');
    await p.waitForTimeout(80);
    t = await tiles();
    check('Source = Airbnb: arriving 1, leaving 0, in house 0, turnovers 0, booked 6 of 248 nights = 2%',
      t.arriving === '1' && t.leaving === '0' && t.inhouse === '0' && t.turnovers === '0' && t.booked === '2%', t);
    await p.uncheck('.mphbac-staff-filters input[name=source][value=airbnb]');
    await p.check('.mphbac-staff-filters input[name=cottage][value="23"]');
    await p.waitForTimeout(80);
    t = await tiles();
    check('Cottage = #23: booked 7 of 31 nights = 23% (one cottage in the denominator, the block counted once)', t.booked === '23%', t.booked);
    await ctx.close();
  }
  {
    // Opened on a period that does NOT hold today: the tiles fetch today's month.
    const { ctx, p } = await open();
    await p.fill('.mphbac-staff-goto', '2027-03-10');
    await p.dispatchEvent('.mphbac-staff-goto', 'change');
    await p.waitForTimeout(150);
    const t = await p.evaluate(() => document.querySelector('.mphbac-staff-tile.is-arriving .mphbac-staff-tile-num').textContent);
    check('away from today, the tiles still count today', t === '1', t);
    await ctx.close();
  }

  console.log('\n-- 5: filters — Cottage, Source, Pets, Arrivals or departures only --');
  {
    const { ctx, p } = await open();
    const rows = () => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-rownum')].map(r => r.textContent));
    const ids = async () => (await bars(p)).map(b => b.id).sort((a, b) => a - b);
    await p.click('.mphbac-staff-filters-toggle');
    const labels = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-fgroup--cottage label')].map(l => l.textContent));
    check('the cottage list is built from the board\'s data: all eight', labels.length === 8 && labels[0] === '#22 Blue Heron', labels);
    // Within the chart's scroll range (1280px viewport, ~182px of scroll).
    const x0 = await p.evaluate(() => { const g = document.querySelector('.mphbac-staff-grid'); g.scrollLeft = 120; return g.scrollLeft; });
    await p.check('.mphbac-staff-filters input[name=cottage][value="22"]');
    await p.check('.mphbac-staff-filters input[name=cottage][value="23"]');
    await p.waitForTimeout(80);
    check('Cottage #22 + #23: only their rows', JSON.stringify(await rows()) === '["#22","#23"]', await rows());
    const x1 = await p.evaluate(() => document.querySelector('.mphbac-staff-grid').scrollLeft);
    check('...the chart keeps its scroll through a filter change', x0 === 120 && Math.abs(x1 - x0) <= 1, [x0, x1]);
    const n = await p.evaluate(() => document.querySelector('.mphbac-staff-filters-count').textContent);
    check('...and the toggle counts the active filters', n === '2', n);
    await p.click('.mphbac-staff-filters-clear');
    await p.waitForTimeout(80);
    check('Clear filters: every row back', (await rows()).length === 8);
    await p.check('.mphbac-staff-filters input[name=source][value=vrbo]');
    await p.waitForTimeout(80);
    check('Source = Vrbo: only Dee and Ivy', JSON.stringify(await ids()) === '[4,9]', await ids());
    await p.check('.mphbac-staff-filters input[name=source][value=other]');
    await p.waitForTimeout(80);
    check('Source = Vrbo + Other: Ed (the channel the plugin cannot name) joins', JSON.stringify(await ids()) === '[4,5,9]', await ids());
    await p.click('.mphbac-staff-filters-clear');
    await p.check('.mphbac-staff-filters input[name=pets]');
    await p.waitForTimeout(80);
    check('Pets only: Ann and Ivy', JSON.stringify(await ids()) === '[1,9]', await ids());
    await p.click('.mphbac-staff-filters-clear');
    await choose(p, 'week');
    await p.check('.mphbac-staff-filters input[name=moves]');
    await p.waitForTimeout(80);
    check('Arrivals or departures only, Oct 4–10: everyone arriving or leaving that week (Ed leaves Oct 4) — not Ivy, there all month',
      JSON.stringify(await ids()) === '[1,2,3,4,5,7,10]', await ids());
    await choose(p, 'month');
    check('filters survive a change of period (in memory)', await p.isChecked('.mphbac-staff-filters input[name=moves]'));
    const stored = await p.evaluate(() => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = 1; for (let i = 0; i < sessionStorage.length; i++) o['s:' + sessionStorage.key(i)] = 1; } catch (e) {} return Object.keys(o); });
    check('...and nothing is stored anywhere', stored.length === 0, stored);
    await ctx.close();
  }

  console.log('\n-- 6: quick preview — hover or long-press, never also the sheet --');
  {
    const { ctx, p } = await open();
    const barSel = id => `.mphbac-staff-bar[data-booking-id="${id}"]`;
    await p.hover(barSel(1));
    await p.waitForTimeout(400);
    let pv = await p.evaluate(() => { const e = document.querySelector('.mphbac-staff-preview'); return { shown: !e.hidden, text: e.innerText }; });
    check('hover: name, cottage, dates and nights, guests, source, pets',
      pv.shown && /Ann Smith/.test(pv.text) && /Oct 6 → Oct 9 · 3 nights/.test(pv.text) && /Guests: 3 \(2 adults, 1 child\)/.test(pv.text)
      && /Source: Direct/.test(pv.text) && /Pets/.test(pv.text), pv.text);
    await p.hover(barSel(2));
    await p.waitForTimeout(400);
    pv = await p.evaluate(() => document.querySelector('.mphbac-staff-preview').innerText);
    check('an import that carries only the default count shows NO guest line, as the sheet would', !/Guests/.test(pv) && /Source: Airbnb/.test(pv), pv);
    await p.mouse.move(5, 5);
    await p.waitForTimeout(80);
    check('leaving the bar hides it', await p.evaluate(() => document.querySelector('.mphbac-staff-preview').hidden));
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ phone: true });
    const press = (id, ms) => p.evaluate(async ([id, ms]) => {
      const b = document.querySelector(`.mphbac-staff-bar[data-booking-id="${id}"]`);
      b.scrollIntoView({ block: 'center', inline: 'center' });
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const t = new Touch({ identifier: 1, target: b, clientX: x, clientY: y });
      b.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true }));
      await new Promise(r => setTimeout(r, ms));
      b.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t], bubbles: true }));
      b.click();                                           // the click the tap produces
      await new Promise(r => setTimeout(r, 60));
      return { preview: !document.querySelector('.mphbac-staff-preview').hidden,
               sheet: !document.querySelector('.mphbac-staff-sheet').hidden };
    }, [id, ms]);
    let r = await press(1, 650);
    check('long-press: the preview opens, and the sheet does NOT', r.preview && !r.sheet, r);
    r = await press(1, 80);
    check('a plain tap after it opens the sheet, as always', r.sheet, r);
    await ctx.close();
  }

  console.log('\n-- 6: the sheet — tap to call / text / email, Open in WP-Admin --');
  {
    const { ctx, p } = await open();
    const sheetLinks = async id => {
      await p.evaluate(() => { const s = document.querySelector('.mphbac-staff-sheet'); if (!s.hidden) document.querySelector('.mphbac-staff-close').click(); });
      await p.waitForTimeout(300);
      await p.click(`.mphbac-staff-bar[data-booking-id="${id}"]`);
      await p.waitForTimeout(250);
      return p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-sheet a')].map(a => [a.className, a.getAttribute('href'), a.textContent, a.target]));
    };
    let l = await sheetLinks(1);
    check('the phone is a tel: link, with a Text (sms:) link beside it',
      l.some(a => a[0] === 'mphbac-staff-tel' && a[1] === 'tel:+15550104421' && a[2] === '+1 (555) 010-4421')
      && l.some(a => a[0] === 'mphbac-staff-sms' && a[1] === 'sms:+15550104421'), l);
    check('the email is a mailto: link', l.some(a => a[0] === 'mphbac-staff-mail' && a[1] === 'mailto:ann@example.com'), l);
    check('Open in WP-Admin, when the server sends it — same origin, a new tab',
      l.some(a => a[0] === 'mphbac-staff-adminlink' && a[1] === 'http://staff.test/wp-admin/post.php?post=1&action=edit' && a[3] === '_blank'), l);
    l = await sheetLinks(2);
    check('a hostile tel / email target becomes NO link — the text is shown as text', !l.some(a => /^(tel|sms|mailto|javascript):/i.test(a[1] || '')), l);
    const txt = await p.evaluate(() => document.querySelector('.mphbac-staff-sheet-body').innerHTML);
    check('...and nothing in it became markup', !/<img/i.test(txt), txt.slice(0, 120));
    check('no adminUrl from the server: no WP-Admin link', !l.some(a => a[0] === 'mphbac-staff-adminlink'));
    l = await sheetLinks(3);
    check('an adminUrl on ANOTHER origin is refused', !l.some(a => a[0] === 'mphbac-staff-adminlink'), l);
    const js = require('fs').readFileSync(require('path').join(S.ROOT, 'assets/js/staff.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    check('THE SECURITY CONTRACT: no HTML-injection API anywhere in staff.js', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(/.test(js));
    await ctx.close();
  }

  console.log('\n-- 7: auto-refresh every 3 minutes, keeping the view --');
  {
    const { ctx, p } = await open({ clock: true });
    const reqs = () => p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').length);
    await choose(p, 'week');
    await p.click('.mphbac-staff-filters-toggle');
    await p.check('.mphbac-staff-filters input[name=pets]');
    await choose(p, 'year');
    await p.evaluate(() => { document.querySelector('.mphbac-staff-grid').scrollLeft = 2000; });
    const before = { n: await reqs(), upd: await p.evaluate(() => document.querySelector('.mphbac-staff-updated').textContent) };
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    await p.waitForTimeout(150);
    const after = await p.evaluate(() => ({ period: document.querySelector('.mphbac-staff-period').value,
      x: document.querySelector('.mphbac-staff-grid').scrollLeft, pets: document.querySelector('.mphbac-staff-filters input[name=pets]').checked,
      upd: document.querySelector('.mphbac-staff-updated').textContent }));
    check('after 3 minutes the board fetched again', (await reqs()) > before.n, [before.n, await reqs()]);
    check('...keeping the period, the scroll position and the filters', after.period === 'year' && Math.abs(after.x - 2000) <= 1 && after.pets, after);
    check('..."Updated hh:mm" moved on', /^Updated \d\d:\d\d$/.test(after.upd) && after.upd !== before.upd, [before.upd, after.upd]);

    // A BUTTON with focus must not stop it (the Sync Watchdog bug).
    await p.focus('.mphbac-staff-today');
    let n0 = await reqs();
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    await p.waitForTimeout(150);
    check('a focused BUTTON does not stop the refresh', (await reqs()) > n0, [n0, await reqs()]);
    // The date picker with focus does.
    await p.focus('.mphbac-staff-goto');
    n0 = await reqs();
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    await p.waitForTimeout(150);
    check('the date picker with focus DOES skip it', (await reqs()) === n0, [n0, await reqs()]);
    await p.evaluate(() => document.activeElement.blur());
    await p.clock.fastForward(31 * 1000);
    await p.waitForTimeout(150);
    check('...and it runs once the field is left', (await reqs()) > n0, [n0, await reqs()]);
    // An open sheet does too.
    await p.click('.mphbac-staff-bar[data-booking-id="1"]');
    await p.waitForTimeout(250);
    n0 = await reqs();
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    await p.waitForTimeout(150);
    check('an open sheet skips it', (await reqs()) === n0, [n0, await reqs()]);
    await p.click('.mphbac-staff-close');
    await p.waitForTimeout(300);
    // Hidden: nothing; visible again after 3+ minutes: at once.
    await p.clock.fastForward(31 * 1000);
    await p.waitForTimeout(150);
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    n0 = await reqs();
    await p.clock.fastForward(10 * 60 * 1000);
    await p.waitForTimeout(150);
    check('a hidden tab is never refreshed', (await reqs()) === n0, [n0, await reqs()]);
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(150);
    check('...and refreshes the moment it is visible again, being overdue', (await reqs()) > n0, [n0, await reqs()]);
    await ctx.close();
  }

  console.log('\n-- 7: the expired token — ONE reload, the view kept, never a loop --');
  {
    const { ctx, p } = await open({ clock: true });
    await choose(p, 'week');
    await p.click('.mphbac-staff-filters-toggle');
    await p.check('.mphbac-staff-filters input[name=pets]');
    await p.click('.mphbac-staff-next');
    await p.waitForTimeout(80);
    await p.evaluate(() => { window.__nonceExpired = true; });
    const loads0 = p.loads();
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    await p.waitForFunction(n => window.__reqs !== undefined && document.readyState === 'complete', loads0);
    await p.waitForTimeout(400);
    const back = await p.evaluate(() => ({ period: document.querySelector('.mphbac-staff-period').value,
      from: (document.querySelector('.mphbac-staff-chart') || {}).dataset && document.querySelector('.mphbac-staff-chart').dataset.from,
      pets: document.querySelector('.mphbac-staff-filters input[name=pets]').checked, hash: location.hash,
      guard: (() => { try { return sessionStorage.getItem('mphbacStaffReload'); } catch (e) { return 'X'; } })(),
      storage: (() => { const o = []; for (let i = 0; i < sessionStorage.length; i++) o.push(sessionStorage.key(i)); for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); return o; })(),
      status: document.querySelector('.mphbac-staff-status').textContent }));
    check('the expired-token 403 reloaded the page ONCE', p.loads() === loads0 + 1, [loads0, p.loads()]);
    check('...and the board came back on the SAME view: Weekly, the next week, Pets on', back.period === 'week' && back.from === '2026-10-11' && back.pets, back);
    check('...the view fragment is gone from the address at once, so a reload by the user opens Monthly', back.hash === '', back.hash);
    check('...the guard cleared after a request that worked, and NOTHING else is stored', back.guard === null && back.storage.length === 0, back);
    await p.reload();
    await p.waitForTimeout(250);
    check('a reload by the USER opens on Monthly', await p.evaluate(() => document.querySelector('.mphbac-staff-period').value) === 'month');
    await ctx.close();
  }
  {
    // Every request expired, before and after the reload: it must stop.
    const { ctx, p } = await open({ init: () => { try { sessionStorage.setItem('__nonceExpired', '1'); } catch (e) {} } });
    await p.waitForTimeout(600);
    const s = await p.evaluate(() => ({ status: document.querySelector('.mphbac-staff-status').textContent,
      guard: sessionStorage.getItem('mphbacStaffReload') }));
    check('still expired after the one reload: it STOPS, with the existing message — never a loop',
      p.loads() === 2 && /expired/i.test(s.status) && s.guard !== null, [p.loads(), s]);
    await ctx.close();
  }
  {
    // A 403 WITHOUT the nonce header: the password itself expired — no reload.
    const html = S.boardShell({ today: F.TODAY, cottages: F.COTTAGES, bookings: F.BOOKINGS, details: F.DETAILS })
      .replace("return Promise.resolve(new Response('', { status: 403, headers: { 'X-MPHBAC-Staff': 'nonce' } }));",
               "return Promise.resolve(new Response('', { status: 403 }));");
    const { ctx, p } = await open({ html, init: () => { try { sessionStorage.setItem('__nonceExpired', '1'); } catch (e) {} } });
    await p.waitForTimeout(400);
    check('a 403 without the nonce header never reloads, and says Not authorized',
      p.loads() === 1 && /Not authorized/.test(await p.evaluate(() => document.querySelector('.mphbac-staff-status').textContent)), p.loads());
    await ctx.close();
  }
  {
    // Storage blocked: no guard is possible, so no reload.
    const { ctx, p } = await open({ init: () => {
      window.__nonceExpired = true;
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('blocked'); } });
    } });
    await p.waitForTimeout(400);
    check('storage blocked: no reload at all — the existing message instead',
      p.loads() === 1 && /expired/i.test(await p.evaluate(() => document.querySelector('.mphbac-staff-status').textContent)), p.loads());
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
