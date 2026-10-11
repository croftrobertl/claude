'use strict';
/**
 * THE 0.44.0 BOARD, DRIVEN IN A REAL PAGE WITH THE REAL staff.js.
 *
 * 0.44.1: bars in their source colour with Pets / Couch / Boat icons (no
 * tags, no badges), turnovers, the legend, Stats below the calendar, the
 * quick preview anchored to its bar, the theme's button states held off the
 * bars, the sheet's tap-to-call / text / email and Open in WP-Admin, the
 * 3-minute auto-refresh and the one-shot token reload. No filters, no tiles. The shell is
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
    const page = html || S.boardShell({ today: F.TODAY, cottages: F.COTTAGES, bookings: F.BOOKINGS, details: F.DETAILS, search: F.SEARCH,
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
      icons: [...b.querySelectorAll('svg.mphbac-staff-ico')].map(x => x.getAttribute('class').replace('mphbac-staff-ico is-', '')),
      iconStroke: b.querySelector('svg.mphbac-staff-ico') ? getComputedStyle(b.querySelector('svg.mphbac-staff-ico')).stroke : null,
      iconFill: b.querySelector('svg.mphbac-staff-ico') ? getComputedStyle(b.querySelector('svg.mphbac-staff-ico')).fill : null,
      // Every piece of the label lies inside the bar: nothing is clipped. Bars
      // running off a scrolled chart are judged against their own box.
      inside: kids.every(k => k.width === 0 || (k.left >= r.left - 0.5 && k.right <= r.right + 0.5)),
      textClipped: !!t && t.scrollWidth > t.clientWidth + 0.5 };
  }));
  const byId = list => Object.fromEntries(list.map(b => [b.id, b]));
  const choose = async (p, v) => { await p.selectOption('.mphbac-staff-period', v); await p.waitForTimeout(80); };

  console.log('-- 5: the order, top to bottom (Rob, 0.44.1) --');
  {
    const { ctx, p } = await open();
    const o = await p.evaluate(() => {
      const top = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; };
      return { fields: top('.mphbac-staff-fields'), nav: top('.mphbac-staff-topbar'), legend: top('.mphbac-staff-legend'),
        chart: top('.mphbac-staff-grid'), stats: top('.mphbac-staff-stats'),
        statsOpen: document.querySelector('.mphbac-staff-stats').open,
        gone: ['.mphbac-staff-filters', '.mphbac-staff-tiles', '.mphbac-staff-tile', '.mphbac-staff-tag', '.mphbac-staff-otabadge']
          .filter(s => document.querySelector(s)) };
    });
    check('Show / Go to date, then the navigation row, then the legend, then the calendar, then Stats',
      o.fields < o.nav && o.nav < o.legend && o.legend < o.chart && o.chart < o.stats, o);
    check('Stats is closed on load', o.statsOpen === false);
    check('no Filters, no tiles above the calendar, no IN / OUT tags, no letter badges anywhere', o.gone.length === 0, o.gone);
    await ctx.close();
  }

  console.log('\n-- 1: bars — the source colour, and three facts as icons --');
  {
    const { ctx, p } = await open();
    const b = byId(await bars(p));
    for (const [id, src] of [[1, 'direct'], [2, 'airbnb'], [3, 'booking'], [4, 'vrbo']]) {
      check(`booking ${id} (${src}): the whole bar is ${RGB[src]}`, b[id] && b[id].bg === RGB[src] && b[id].cls.includes('is-src-' + src), b[id] && b[id].bg);
    }
    check('"Other" is gone: a channel nobody recognises shows in the Direct colour (Ed)', b[5].bg === RGB.direct && b[5].cls.includes('is-src-direct'), b[5].bg);
    check('a pending booking keeps its stripes, over the whole bar', b[6].img.includes('repeating-linear-gradient') && b[1].img === 'none', [b[6].img.slice(0, 40), b[1].img]);
    check('Ann (pets, couch, boat): all three icons, in that order, beside "Ann S."',
      JSON.stringify(b[1].icons) === '["pets","couch","boat"]' && b[1].text === 'Ann S.', [b[1].icons, b[1].text]);
    check('Fay (couch only): just the sofa', JSON.stringify(b[6].icons) === '["couch"]', b[6].icons);
    check('Dee, one night with all three: the icons drop BOAT first, then COUCH — the paw stays',
      JSON.stringify(b[4].icons) === '["pets"]', b[4].icons);
    check('the icons are thin WHITE outlines', b[1].iconStroke === 'rgb(255, 255, 255)' && b[1].iconFill === 'none', [b[1].iconStroke, b[1].iconFill]);
    const all = Object.values(b);
    check('NO bar clips anything: every icon and name lies inside its bar', all.every(x => x.inside && !x.textClipped),
      all.filter(x => !x.inside || x.textClipped).map(x => x.id));
    console.log('      monthly 44px: ' + all.map(x => `#${x.id} [${x.icons}] "${x.text}"`).join(' | '));
    check('the name rule where it fits: 4+ nights the full name ("Bob Jones")', b[2].text === 'Bob Jones', b[2].text);
    const desc = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].find(x => x.dataset.bookingId === '4').getAttribute('aria-label'));
    check('...and what a bar cannot show is in its description: Vrbo, Pets, Couch, Boat', /Vrbo/.test(desc) && /Pets/.test(desc) && /Couch/.test(desc) && /Boat/.test(desc), desc);
    const titles = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].filter(x => x.hasAttribute('title')).length);
    check('no bar carries a title attribute — the preview replaces the native tooltip (the WD)', titles === 0, titles);
    await ctx.close();
  }
  for (const [phone, inset, who] of [[false, 0, 'DESKTOP Weekly'], [true, 0, 'PHONE Weekly 375px'], [true, 27, 'PHONE Weekly, a 320px chart']]) {
    const { ctx, p } = await open({ phone, inset });
    await choose(p, 'week');
    const all = await bars(p);
    const dayW = await p.evaluate(() => Math.round(document.querySelector('.mphbac-staff-dayhead').getBoundingClientRect().width));
    check(`${who} (${dayW}px days): nothing clipped on any bar`, all.every(x => x.inside && !x.textClipped),
      all.filter(x => !x.inside || x.textClipped).map(x => [x.id, x.icons, x.text]));
    console.log(`      ${who} ${dayW}px: ` + all.map(x => `#${x.id} [${x.icons}] "${x.text}"`).join(' | '));
    const b = byId(all);
    if (!phone) check(`${who}: with room, a 1-night bar gets initials ("GL")`, b[7].text === 'GL', b[7].text);
    if (!phone) check(`${who}: a half-day sliver (Dee, arriving on the week's last day) still holds all three icons`,
      JSON.stringify(b[4].icons) === '["pets","couch","boat"]', b[4].icons);
    if (inset) check(`${who}: the nights count where the name does not fit ("1n" for Gus at 31px)`, b[7].text === '1n', b[7].text);
    await ctx.close();
  }
  {
    // The icon paths: the bars' (staff.js) and the legend's (CSS masks) are one set.
    const fs = require('fs'), path = require('path');
    const js = fs.readFileSync(path.join(S.ROOT, 'assets/js/staff.js'), 'utf8');
    // Decode only the data: URLs — the rest of the stylesheet has bare "%".
    const cssText = fs.readFileSync(path.join(S.ROOT, 'assets/css/staff.css'), 'utf8')
      .replace(/url\("(data:[^"]+)"\)/g, (m, u) => 'url("' + decodeURIComponent(u) + '")');
    const block = js.slice(js.indexOf('var ICONS = {'), js.indexOf('function icon(kind)'));
    const same = ['pets', 'couch', 'boat'].every(k => {
      const m = block.match(new RegExp(k + ':\\s*\\[([\\s\\S]*?)\\]'));
      const paths = (m ? m[1].match(/'([^']+)'/g) : []).map(x => x.slice(1, -1));
      const rule = cssText.slice(cssText.indexOf('.mphbac-staff-ico.is-' + k + '::before'));
      const line = rule.slice(0, rule.indexOf('}'));
      return paths.length > 0 && paths.every(d => line.includes("d='" + d + "'"));
    });
    check('the legend\'s icons are drawn from the SAME Tabler paths as the bars\'', same);
    check('...Tabler\'s paw, sofa and speedboat, credited (MIT)', /Tabler/.test(block + js) && /MIT/.test(js));
  }

  console.log('\n-- 6 (WD): a bar keeps its colour and shape under the theme\'s button states --');
  {
    const { ctx, p } = await open();
    // The theme also fades every button's background over 0.75s, so the
    // instrument switches that off before reading — else it reads the fade's
    // first frame and the check proves nothing. (The bars have no fade.)
    const kit = await p.evaluate(() => { const b = document.createElement('button'); b.textContent = 'x'; b.style.transition = 'none';
      document.body.appendChild(b); b.focus(); const c = getComputedStyle(b).backgroundColor; b.remove(); return c; });
    check('(instrument check) the kit rule is live here: a focused plain button turns coral', kit === 'rgb(240, 128, 128)', kit);
    const sel = '.mphbac-staff-bar[data-booking-id="2"]';
    const look = () => p.evaluate(s => { const c = getComputedStyle(document.querySelector(s)); return [c.backgroundColor, c.borderTopLeftRadius, c.color]; }, sel);
    await p.hover(sel);
    const hov = await look();
    await p.focus(sel);
    const foc = await look();
    await p.mouse.move(5, 5);
    await p.evaluate(s => document.querySelector(s).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })), sel);
    check('hover: still Airbnb red, still its 6px shape — not coral, not a pill', hov[0] === RGB.airbnb && hov[1] === '6px', hov);
    check('focus (a tapped bar on a phone keeps focus): still Airbnb red, 6px', foc[0] === RGB.airbnb && foc[1] === '6px' && foc[2] === 'rgb(255, 255, 255)', foc);
    await p.selectOption('.mphbac-staff-period', 'day');
    await p.waitForTimeout(80);
    await p.focus('.mphbac-staff-item');
    const row = await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-staff-item')).backgroundColor);
    check('a Daily row keeps its white ground when focused', row === 'rgb(255, 255, 255)', row);
    await ctx.close();
  }

  console.log('\n-- 3: turnovers — on the chart and first in Daily (kept) --');
  {
    const { ctx, p } = await open();
    const marks = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-turn')].map(m => ({
      day: m.dataset.day, pe: getComputedStyle(m).pointerEvents, label: m.getAttribute('aria-label') })));
    check('two turnover marks: #22 on Oct 9 (Ann → Gus) and #23 on Oct 8 (Cy → Bob)',
      marks.length === 2 && marks.some(m => m.day === '2026-10-09' && /Ann Smith.*Gus Long/.test(m.label))
      && marks.some(m => m.day === '2026-10-08' && /Cy Lee.*Bob Jones/.test(m.label)), marks);
    check('...and they take no tap — the bars beneath keep theirs', marks.every(m => m.pe === 'none'));
    await choose(p, 'day');
    const g = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-group')].map(x => ({
      head: x.querySelector('.mphbac-staff-group-head').firstChild.textContent,
      lines: [...x.querySelectorAll('.mphbac-staff-turnline')].map(l => l.textContent),
      items: x.querySelectorAll('.mphbac-staff-item').length })));
    check('Daily: Turnovers is FIRST, "Cottage 23: Lee out → Jones in"', g[0].head === 'Turnovers' && g[0].lines[0] === 'Cottage 23: Lee out → Jones in', g[0]);
    check('...those guests still under Arriving and Departing', g[1].head === 'Arriving' && g[1].items === 1 && g[2].head === 'Departing' && g[2].items === 1, g);
    const ann = await p.evaluate(() => { const i = [...document.querySelectorAll('.mphbac-staff-item')].find(x => x.dataset.bookingId === '1');
      const dot = i.querySelector('.mphbac-staff-dot');
      return { dot: dot ? getComputedStyle(dot).backgroundColor : null, icons: [...i.querySelectorAll('svg.mphbac-staff-ico')].map(x => x.getAttribute('class').replace('mphbac-staff-ico is-', '')),
               bob: getComputedStyle([...document.querySelectorAll('.mphbac-staff-item')].find(x => x.dataset.bookingId === '2').querySelector('.mphbac-staff-dot')).backgroundColor }; });
    check('Daily: a dot in the source colour, no letter (Direct green, Airbnb red)', ann.dot === RGB.direct && ann.bob === RGB.airbnb, ann);
    check('Daily: the same three icons beside the name', JSON.stringify(ann.icons) === '["pets","couch","boat"]', ann.icons);
    await ctx.close();
  }

  console.log('\n-- 1: the legend — Direct · Airbnb · Booking.com · Vrbo · Pending · Turnover · Pets · Couch · Boat --');
  {
    const { ctx, p } = await open();
    const l = await p.evaluate(() => ({
      keys: [...document.querySelectorAll('.mphbac-staff-legend .mphbac-staff-key')].map(k => k.textContent.trim()),
      sw: [...document.querySelectorAll('.mphbac-staff-legend .mphbac-staff-key[class*="is-src-"]')].map(k => getComputedStyle(k, '::before').backgroundColor),
      ico: [...document.querySelectorAll('.mphbac-staff-legend span.mphbac-staff-ico')].map(i => [getComputedStyle(i).backgroundColor, getComputedStyle(i, '::before').backgroundColor]) }));
    check('exactly those nine, in that order', JSON.stringify(l.keys) === JSON.stringify(['Direct', 'Airbnb', 'Booking.com', 'Vrbo', 'Pending', 'Turnover', 'Pets', 'Couch', 'Boat']), l.keys);
    check('the four sources in their colours', JSON.stringify(l.sw) === JSON.stringify(['direct', 'airbnb', 'booking', 'vrbo'].map(k => RGB[k])), l.sw);
    check('each icon WHITE on the neutral slate (#334155), never a source colour (WD)',
      l.ico.length === 3 && l.ico.every(([bg, fg]) => bg === 'rgb(51, 65, 85)' && fg === 'rgb(255, 255, 255)'), l.ico);
    await ctx.close();
  }

  console.log('\n-- 4: the quick preview — directly above its bar, centred, on screen --');
  {
    const { ctx, p } = await open();
    // An Elementor-like wrapper WITH A TRANSFORM, the cause of "random places":
    // position: fixed measures from it unless the preview leaves for <body>.
    await p.evaluate(() => { const st = document.querySelector('.mphbac-staff'); const w = document.createElement('div');
      w.style.transform = 'translateX(0)'; w.style.marginTop = '40px'; st.parentNode.insertBefore(w, st); w.appendChild(st); });
    const at = async id => {
      await p.hover(`.mphbac-staff-bar[data-booking-id="${id}"]`);
      await p.waitForTimeout(400);
      return p.evaluate(id => {
        const b = document.querySelector(`.mphbac-staff-bar[data-booking-id="${id}"]`).getBoundingClientRect();
        const e = document.querySelector('.mphbac-staff-preview'), r = e.getBoundingClientRect();
        return { shown: !e.hidden, onBody: e.parentNode === document.body, text: e.innerText,
          gapAbove: b.top - r.bottom, centreOff: Math.abs((r.left + r.right) / 2 - (Math.max(b.left, 0) + Math.min(b.right, innerWidth)) / 2),
          inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
          described: document.querySelector(`.mphbac-staff-bar[data-booking-id="${id}"]`).getAttribute('aria-describedby') === e.id };
      }, id);
    };
    let r = await at(2);
    check('it opens on <body> — out of reach of a transformed wrapper', r.shown && r.onBody, r);
    check('...directly ABOVE the bar (8px gap)', Math.abs(r.gapAbove - 8) <= 1, r.gapAbove);
    check('...horizontally centred on it, and on screen', r.centreOff <= 1 && r.inside, r);
    check('...and the bar is described by it while it shows', r.described, r);
    r = await at(1);
    check('it lists Pets · Couch · Boat, and the guests, when they apply', /Pets · Couch · Boat/.test(r.text) && /Guests: 3/.test(r.text), r.text);
    await p.mouse.move(5, 5);
    await p.waitForTimeout(80);
    const back = await p.evaluate(() => { const e = document.querySelector('.mphbac-staff-preview'); return { hidden: e.hidden, home: !!e.closest('.mphbac-staff') }; });
    check('leaving the bar hides it and puts it back in the board', back.hidden && back.home, back);
    // No room above: the bar at the very top of the screen (room added below
    // the board so the page can scroll that far).
    await p.evaluate(() => { document.body.style.paddingBottom = '2000px';
      const b = document.querySelector('.mphbac-staff-bar[data-booking-id="2"]'); window.scrollTo(0, window.scrollY + b.getBoundingClientRect().top - 2); });
    r = await at(2);
    check('no room above: it flips BELOW the bar, still on screen', r.gapAbove < 0 && r.inside, r);
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
      const pv = document.querySelector('.mphbac-staff-preview'), pr = pv.getBoundingClientRect(), br = b.getBoundingClientRect();
      const placed = { above: br.top - pr.bottom, inside: pr.left >= 0 && pr.right <= innerWidth && pr.top >= 0 };
      b.click();                                           // the click the tap produces
      await new Promise(r => setTimeout(r, 60));
      return { preview: !pv.hidden || placed.above !== undefined && false, shownBefore: pr.height > 0, placed,
               sheet: !document.querySelector('.mphbac-staff-sheet').hidden };
    }, [id, ms]);
    let r = await press(1, 650);
    check('phone long-press: the preview opens above the bar, on screen — and the sheet does NOT', r.shownBefore && Math.abs(r.placed.above - 8) <= 1 && r.placed.inside && !r.sheet, r);
    r = await press(1, 80);
    check('a plain tap after it opens the sheet, as always', r.sheet, r);
    await ctx.close();
  }

  console.log('\n-- 2: Stats — below the calendar, closed, its own timeframe --');
  {
    const { ctx, p } = await open();
    const reqs = () => p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').map(r => r.from + '|' + r.to));
    const kpis = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mphbac-staff-kpi')].map(k =>
      [k.className.replace('mphbac-staff-kpi is-', ''), k.querySelector('.mphbac-staff-kpi-num').textContent])));
    const n0 = (await reqs()).length;
    await p.click('.mphbac-staff-stats-toggle');
    await p.waitForTimeout(150);
    let k = await kpis();
    check('opened: this month by default — the month already loaded, so no request', (await reqs()).length === n0, await reqs());
    check('October: booked 21% (52 of 248 cottage-nights, the echoing block counted once)', k.booked === '21%', k);
    check('...arrivals 10, departures 10, turnovers 2', k.arrivals === '10' && k.departures === '10' && k.turnovers === '2', k);
    check('...with pets 3, with couch 3, with boat 2 — no "in house" outside Day', k.pets === '3' && k.couch === '3' && k.boat === '2' && !('inhouse' in k), k);
    const per = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mphbac-staff-percot-row')].map(r =>
      [r.querySelector('.mphbac-staff-percot-name').textContent, [r.querySelector('.mphbac-staff-percot-num').textContent, r.querySelector('.mphbac-staff-percot-fill').style.width]])));
    check('nights booked per cottage: #28 30 nights (96.8%), #23 7 (the block counted once), #29 none',
      per['#28 C28'][0] === '30 nights' && per['#28 C28'][1] === '96.8%' && per['#23 Kingfisher'][0] === '7 nights' && per['#29 C29'][0] === '0 nights', per);
    const pie = await p.evaluate(() => ({
      slices: [...document.querySelectorAll('.mphbac-staff-pie-slice')].map(x => [x.dataset.source, getComputedStyle(x).fill]),
      labels: [...document.querySelectorAll('.mphbac-staff-pie-label')].map(x => x.textContent),
      list: [...document.querySelectorAll('.mphbac-staff-pie-item')].map(x => x.textContent) }));
    check('the pie: Direct, Airbnb, Booking.com, Vrbo in their colours', JSON.stringify(pie.slices) === JSON.stringify([['direct', RGB.direct], ['airbnb', RGB.airbnb], ['booking', RGB.booking], ['vrbo', RGB.vrbo]]), pie.slices);
    check('...share of NIGHTS: Direct 23% (12), Airbnb 12% (6), Booking.com 6% (3), Vrbo 60% (31) — as text too',
      JSON.stringify(pie.list) === JSON.stringify(['Direct — 23% (12 nights)', 'Airbnb — 12% (6 nights)', 'Booking.com — 6% (3 nights)', 'Vrbo — 60% (31 nights)']), pie.list);
    check('...labelled with % where the slice holds it', pie.labels.includes('60%') && pie.labels.includes('23%'), pie.labels);
    const blank = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-out').innerHTML.includes('<script'));
    check('(textContent only) nothing in Stats became markup', !blank);

    await p.selectOption('.mphbac-staff-stats-span', 'day');
    await p.waitForTimeout(150);
    k = await kpis();
    check('Day: today by default — arriving 1, leaving 1, turnovers 1, IN HOUSE 2 (only for Day)',
      k.arrivals === '1' && k.departures === '1' && k.turnovers === '1' && k.inhouse === '2', k);
    await p.selectOption('.mphbac-staff-stats-span', 'year');
    await p.waitForTimeout(200);
    check('Year: one request for Jan 1 – Dec 31 (the same gated range endpoint)', (await reqs()).includes('2026-01-01|2026-12-31'), await reqs());
    await p.selectOption('.mphbac-staff-stats-span', 'custom');
    await p.fill('.mphbac-staff-stats-from', '2026-01-01');
    await p.fill('.mphbac-staff-stats-to', '2027-12-31');
    await p.dispatchEvent('.mphbac-staff-stats-to', 'change');
    await p.waitForTimeout(200);
    let note = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-note').textContent);
    check('Custom over 400 days: capped to 400, and it SAYS so', (await reqs()).includes('2026-01-01|2027-02-04') && /limited to 400 days/.test(note), [note, (await reqs()).slice(-1)]);
    await p.fill('.mphbac-staff-stats-to', '2025-12-01');
    await p.dispatchEvent('.mphbac-staff-stats-to', 'change');
    await p.waitForTimeout(100);
    note = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-note').textContent);
    check('Custom with To before From: "Please check the dates."', note === 'Please check the dates.', note);
    await p.fill('.mphbac-staff-stats-from', '2023-01-01');
    await p.fill('.mphbac-staff-stats-to', '2023-12-31');
    await p.dispatchEvent('.mphbac-staff-stats-to', 'change');
    await p.waitForTimeout(150);
    note = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-note').textContent);
    const range = await p.evaluate(() => document.querySelector('.mphbac-staff-stats-range').textContent);
    check('Custom reaching past the ±3-year range: clamped to Oct 8 – Dec 31, 2023, and it says so',
      /±3-year range: showing Oct 8, 2023 – Dec 31, 2023/.test(note) && range === 'Oct 8, 2023 – Dec 31, 2023', [note, range]);
    await p.reload();
    await p.waitForTimeout(250);
    check('Stats is closed again after a reload', await p.evaluate(() => !document.querySelector('.mphbac-staff-stats').open));
    await ctx.close();
  }

  console.log('\n-- 0.45.0: a long stay that began off-screen keeps its name in view --');
  for (const phone of [false, true]) {
    const who = phone ? 'PHONE' : 'DESKTOP';
    const { ctx, p } = await open({ phone });
    const ivy = () => p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid'), gr = g.getBoundingClientRect();
      const col = document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect();
      const bar = document.querySelector('.mphbac-staff-bar[data-booking-id="9"]'), br = bar.getBoundingClientRect();
      const kids = [...bar.querySelectorAll('.mphbac-staff-bar-label > *')].filter(k => k.getBoundingClientRect().width > 0).map(k => k.getBoundingClientRect());
      const text = bar.querySelector('.mphbac-staff-bar-text').textContent;
      const first = kids.length ? kids[0] : null;
      return { scroll: g.scrollLeft, barLeft: Math.round(br.left), colRight: Math.round(col.right), text,
        firstLeft: first ? Math.round(first.left) : null,
        inView: kids.every(k => k.left >= col.right - 0.5 && k.right <= gr.right + 0.5),
        inBar: kids.every(k => k.left >= br.left - 0.5 && k.right <= br.right + 0.5),
        icons: bar.querySelectorAll('svg.mphbac-staff-ico').length };
    });
    let v = await ivy();
    check(`${who} Monthly opens scrolled to today: Ivy's 30-night bar starts OFF-screen (instrument check)`, v.scroll > 0 && v.barLeft < v.colRight, v);
    check(`${who} ...and yet her name and paw are in view, just right of the cottage column`,
      v.text === 'Ivy Moss' && v.icons === 1 && v.inView && v.firstLeft >= v.colRight && v.firstLeft <= v.colRight + 8, v);
    check(`${who} ...inside her bar`, v.inBar, v);
    await p.evaluate(() => { const g = document.querySelector('.mphbac-staff-grid'); g.scrollLeft = 0; g.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(120);
    v = await ivy();
    check(`${who} scrolled back to the 1st: the label returns to the bar's own start`, v.scroll === 0 && Math.abs(v.firstLeft - v.barLeft - 6) <= 1, v);
    // A bar with only a sliver left on screen: fitted to what is visible,
    // never clipped. In Yearly, which scrolls far enough on any screen.
    await choose(p, 'year');
    await p.evaluate(() => { const g = document.querySelector('.mphbac-staff-grid');
      const b = document.querySelector('.mphbac-staff-bar[data-booking-id="1"]');
      const col = document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect().width;
      g.scrollLeft = b.offsetLeft + b.offsetWidth - col - 30; g.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(120);
    const ann = await p.evaluate(() => {
      const g = document.querySelector('.mphbac-staff-grid').getBoundingClientRect();
      const col = document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect();
      const bar = document.querySelector('.mphbac-staff-bar[data-booking-id="1"]'), br = bar.getBoundingClientRect();
      const kids = [...bar.querySelectorAll('.mphbac-staff-bar-label > *')].filter(k => k.getBoundingClientRect().width > 0).map(k => k.getBoundingClientRect());
      return { visible: Math.round(br.right - col.right), text: bar.querySelector('.mphbac-staff-bar-text').textContent,
        icons: bar.querySelectorAll('svg.mphbac-staff-ico').length,
        ok: kids.every(k => k.left >= col.right - 0.5 && k.right <= br.right + 0.5) };
    });
    check(`${who} Ann's bar with ~30px left on screen: refitted to the visible width (no name, fewer icons) and nothing clipped`,
      ann.ok && ann.text === '' && ann.icons < 3, ann);
    await ctx.close();
  }

  console.log('\n-- 0.45.2: a browser without overflow: clip (Safari before 16) — the script still moves the label --');
  for (const phone of [false, true]) {
    const who = phone ? 'PHONE' : 'DESKTOP';
    // As such a browser sees the board: CSS.supports says no, and the
    // @supports block does not apply (restated here as 0.45.0's rules).
    const { ctx, p } = await open({ phone, init: () => {
      const real = CSS.supports.bind(CSS);
      CSS.supports = (a, b) => (a === 'overflow' && b === 'clip') ? false : real(a, b);
      document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style');
        st.textContent = '.mphbac-staff .mphbac-staff-bar.mphbac-staff-bar { overflow: hidden; } .mphbac-staff .mphbac-staff-bar .mphbac-staff-bar-label { position: absolute; top: 0; right: 0; bottom: 0; }';
        document.head.appendChild(st); });
    } });
    const v = await p.evaluate(() => {
      const col = document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect();
      const bar = document.querySelector('.mphbac-staff-bar[data-booking-id="9"]'), br = bar.getBoundingClientRect();
      const lab = bar.querySelector('.mphbac-staff-bar-label'), first = lab.firstElementChild.getBoundingClientRect();
      return { sticky: getComputedStyle(lab).position, barLeft: Math.round(br.left), colRight: Math.round(col.right), firstLeft: Math.round(first.left), left: lab.style.left };
    });
    check(`${who}: (instrument check) the label is the old absolute one here, and Ivy's bar starts off-screen`, v.sticky === 'absolute' && v.barLeft < v.colRight, v);
    check(`${who}: ...and the script has moved her name just right of the cottage column`, v.firstLeft >= v.colRight && v.firstLeft <= v.colRight + 8 && v.left !== '', v);
    await ctx.close();
  }

  console.log('\n-- 0.45.2: the label tracks the scroll itself — sampled MID-scroll, not at rest --');
  /* Rob's iPhone: the label lagged a flick, slid under the cottage column
     ("OCK BLOCK") and jumped. iOS sends scroll events sparsely, and 0.45.0
     moved the label from one. (1) Sample with NO scroll event let through:
     set the position and measure in the same task, many times — what the
     browser lays out, before any script could react, as on a phone between
     two late events. (2) A real wheel scroll, sampled every frame AFTER the
     board's own frame work: every label on screen, all bars. */
  for (const phone of [false, true]) {
    const who = phone ? 'PHONE' : 'DESKTOP';
    for (const period of ['month', 'year']) {
      const { ctx, p } = await open({ phone });
      if (period === 'year') await choose(p, 'year');
      const r = await p.evaluate(async () => {
        const g = document.querySelector('.mphbac-staff-grid');
        const colR = () => document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect().right;
        const max = g.scrollWidth - g.clientWidth;
        // Settle at the left end first (let the board react), then sweep
        // RIGHT — later days, bars moving left — which is the direction a
        // late label is dragged under the column. (Monthly opens at its
        // right end, so a sweep from the opening position only ever moved
        // the other way and could not fail.)
        g.scrollLeft = 0;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        let samples = 0, stuck = 0, bad = [];
        for (let x = 0; x <= max; x += 9) {
          g.scrollLeft = x;                       // no scroll event runs before the reads below
          const cr = colR();
          for (const bar of document.querySelectorAll('.mphbac-staff-bar')) {
            const br = bar.getBoundingClientRect(), lab = bar.querySelector('.mphbac-staff-bar-label');
            const kids = [...lab.children].filter(k => k.getBoundingClientRect().width > 0);
            if (!kids.length) continue;
            // What is DRAWN — the name and icons — not the label's box (in
            // 0.45.0 that box stretched to the bar's end).
            const first = kids[0].getBoundingClientRect(), last = kids[kids.length - 1].getBoundingClientRect();
            const drawn = last.right - first.left + 12;          // + the label's 6px padding each side
            // Only while what is drawn FITS what is visible of its bar — the
            // refit to a narrower label is the script's, a frame later.
            if (br.left >= cr || br.right - cr < drawn) continue;
            samples++;
            if (first.left < cr - 0.5) bad.push({ x, id: bar.getAttribute('data-booking-id'), drawn: Math.round(first.left), col: Math.round(cr) }); else stuck++;
          }
        }
        return { samples, stuck, bad: bad.slice(0, 4), nbad: bad.length };
      });
      check(`${who} ${period}: (instrument check) bars that began off-screen were sampled mid-scroll`, r.samples >= 10, r);
      check(`${who} ${period}: with no scroll event yet, every such label is already right of the cottage column`, r.nbad === 0, r);
      await ctx.close();
    }
  }
  {
    const { ctx, p } = await open();
    await choose(p, 'year');
    await p.evaluate(() => {
      window.__under = []; window.__frames = 0;
      const g = document.querySelector('.mphbac-staff-grid');
      // Registered AFTER the board's listener, so this frame callback runs
      // after the board's (the refit) — what is painted that frame.
      g.addEventListener('scroll', () => requestAnimationFrame(() => {
        window.__frames++;
        const cr = document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect().right;
        for (const bar of document.querySelectorAll('.mphbac-staff-bar')) {
          const br = bar.getBoundingClientRect();
          if (br.right <= cr) continue;
          for (const k of bar.querySelectorAll('.mphbac-staff-bar-label > *')) {
            const kr = k.getBoundingClientRect();
            if (kr.width > 0 && kr.left < cr - 0.5) window.__under.push([bar.getAttribute('data-booking-id'), Math.round(kr.left), Math.round(cr), g.scrollLeft]);
          }
        }
      }), { passive: true });
    });
    const gb = await p.locator('.mphbac-staff-grid').boundingBox();
    await p.mouse.move(gb.x + gb.width / 2, gb.y + 60);
    for (let i = 0; i < 40; i++) { await p.mouse.wheel(37, 0); await p.waitForTimeout(16); }
    for (let i = 0; i < 25; i++) { await p.mouse.wheel(-53, 0); await p.waitForTimeout(16); }
    await p.waitForTimeout(150);
    const w = await p.evaluate(() => ({ frames: window.__frames, under: window.__under.slice(0, 5), n: window.__under.length }));
    check('DESKTOP year, a real wheel scroll: (instrument check) frames were sampled while it moved', w.frames >= 20, w);
    check('DESKTOP year, a real wheel scroll: no label, icon or name, is ever under the cottage column', w.n === 0, w);
    await ctx.close();
  }

  console.log('\n-- 0.45.0: search — live from 2 characters, one list, tap to open and jump --');
  {
    const { ctx, p } = await open();
    const reqs = () => p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_search').map(r => r.q));
    await p.click('.mphbac-staff-q');
    await p.keyboard.type('s');
    await p.waitForTimeout(400);
    check('one character: no request, no list', (await reqs()).length === 0 && await p.evaluate(() => document.querySelector('.mphbac-staff-results').hidden));
    await p.keyboard.type('mi', { delay: 40 });
    await p.waitForTimeout(400);
    check('typing on: ONE request, debounced, for the whole word ("smi")', JSON.stringify(await reqs()) === '["smi"]', await reqs());
    await p.fill('.mphbac-staff-q', 'sm');
    await p.dispatchEvent('.mphbac-staff-q', 'input');
    await p.waitForTimeout(400);
    const list = await p.evaluate(() => ({
      count: document.querySelector('.mphbac-staff-results-count').textContent,
      rows: [...document.querySelectorAll('.mphbac-staff-result')].map(b => [b.querySelector('.mphbac-staff-result-name').textContent,
        b.querySelector('.mphbac-staff-result-meta').textContent, b.querySelector('.mphbac-staff-result-why').textContent,
        getComputedStyle(b.querySelector('.mphbac-staff-dot')).backgroundColor]) }));
    check('"sm": the rows in the server\'s order (best first), counted', list.count === '2 bookings' && list.rows[0][0] === 'Hal Price' && list.rows[1][0] === 'Ann Smith', list);
    check('...each with cottage, dates, nights and source, and WHY it matched',
      list.rows[1][1] === '#22 · Oct 6, 2026 → Oct 9, 2026 · 3 nights · Direct' && list.rows[1][2] === 'Last Name: Smith', list.rows[1]);
    check('...and a dot in its source colour', list.rows[0][3] === RGB.airbnb && list.rows[1][3] === RGB.direct, list.rows.map(r => r[3]));

    await p.fill('.mphbac-staff-q', 'nov');
    await p.dispatchEvent('.mphbac-staff-q', 'input');
    await p.waitForTimeout(400);
    await p.click('.mphbac-staff-result');
    await p.waitForTimeout(400);
    const jump = await p.evaluate(() => ({ sheet: !document.querySelector('.mphbac-staff-sheet').hidden,
      sheetReq: window.__reqs.some(r => r.action === 'mphbac_staff_booking' && r.booking_id === '11'),
      from: document.querySelector('.mphbac-staff-chart').dataset.from, period: document.querySelector('.mphbac-staff-period').value,
      found: (document.querySelector('.mphbac-staff-bar[data-booking-id="11"]') || { classList: { contains: () => false } }).classList.contains('is-found') }));
    check('tapping a result opens its sheet through the gated booking endpoint', jump.sheet && jump.sheetReq, jump);
    check('...jumps the calendar to the stay (November, same period) and highlights it', jump.from === '2026-11-01' && jump.period === 'month' && jump.found, jump);
    await p.click('.mphbac-staff-close');
    await p.waitForTimeout(300);

    await p.fill('.mphbac-staff-q', 'old');
    await p.dispatchEvent('.mphbac-staff-q', 'input');
    await p.waitForTimeout(400);
    const before = await p.evaluate(() => document.querySelector('.mphbac-staff-chart').dataset.from);
    await p.click('.mphbac-staff-result');
    await p.waitForTimeout(400);
    const out = await p.evaluate(() => ({ sheet: !document.querySelector('.mphbac-staff-sheet').hidden,
      from: document.querySelector('.mphbac-staff-chart').dataset.from, status: document.querySelector('.mphbac-staff-status').textContent }));
    check('a stay outside the ±3-year range: the sheet still opens, the calendar stays, and it SAYS so',
      out.sheet && out.from === before && out.status === "Outside the board's ±3-year range.", out);
    await p.click('.mphbac-staff-close');
    await p.waitForTimeout(300);

    await p.fill('.mphbac-staff-q', 'evil');
    await p.dispatchEvent('.mphbac-staff-q', 'input');
    await p.waitForTimeout(400);
    const evil = await p.evaluate(() => ({ pwned: !!window.__pwned, imgs: document.querySelectorAll('.mphbac-staff-results img, .mphbac-staff-results b').length,
      text: document.querySelector('.mphbac-staff-result-name').textContent }));
    check('a hostile name or why is shown as text — nothing becomes markup', !evil.pwned && evil.imgs === 0 && /<img/.test(evil.text), evil);
    await p.focus('.mphbac-staff-q');
    await p.keyboard.press('Escape');
    check('Escape clears the field and the list', await p.evaluate(() => document.querySelector('.mphbac-staff-q').value === '' && document.querySelector('.mphbac-staff-results').hidden));
    const stored = await p.evaluate(() => { const o = []; for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); for (let i = 0; i < sessionStorage.length; i++) o.push(sessionStorage.key(i)); return o; });
    check('nothing typed is kept: no storage at all', stored.length === 0, stored);
    await ctx.close();
  }

  console.log('\n-- 0.45.2: the ✕ that closes search (Rob: iOS draws none) --');
  for (const phone of [false, true]) {
    const who = phone ? 'PHONE' : 'DESKTOP';
    const { ctx, p } = await open({ phone, inset: phone ? 27 : 0 });
    const reqs = () => p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_search').map(r => r.q));
    const st = () => p.evaluate(() => {
      const q = document.querySelector('.mphbac-staff-q'), x = document.querySelector('.mphbac-staff-qclear');
      const c = getComputedStyle(x), r = x.getBoundingClientRect(), qr = q.getBoundingClientRect(), qc = getComputedStyle(q);
      return { value: q.value, shown: c.display !== 'none', w: r.width, h: r.height, label: x.getAttribute('aria-label'), qname: q.getAttribute('aria-label'),
        open: !document.querySelector('.mphbac-staff-results').hidden, focused: document.activeElement === q, xfocused: document.activeElement === x,
        padL: parseFloat(qc.paddingLeft), padR: parseFloat(qc.paddingRight), under: qr.right - r.left, bg: c.backgroundColor, radius: c.borderRadius,
        inside: r.left >= qr.left && r.right <= qr.right && r.top >= qr.top - 0.5 && r.bottom <= qr.bottom + 0.5 };
    });
    const tapX = async () => { if (phone) await p.tap('.mphbac-staff-qclear'); else await p.click('.mphbac-staff-qclear'); };
    let s0 = await st();
    check(`${who}: no ✕ while the field is empty`, !s0.shown && s0.value === '', s0);
    if (phone) await p.tap('.mphbac-staff-q'); else await p.click('.mphbac-staff-q');
    await p.keyboard.type('smi', { delay: 30 });
    await p.waitForTimeout(450);
    s0 = await st();
    check(`${who}: with text, the ✕ shows inside the pill — a 44px target, "Clear search"; the field's own name stays "Search"`,
      s0.shown && s0.inside && s0.w >= 44 && s0.h >= 44 && s0.label === 'Clear search' && s0.qname === 'Search' && s0.open, s0);
    check(`${who}: symmetric padding, and the text area ends before the ✕`, s0.padL === s0.padR && s0.padR >= s0.under, s0);
    await tapX();
    await p.waitForTimeout(100);
    s0 = await st();
    check(`${who}: ONE tap — the field empty, the results closed, the field let go of (keyboard down), the ✕ gone`,
      s0.value === '' && !s0.open && !s0.focused && !s0.shown, s0);
    const before = (await reqs()).length;
    if (phone) await p.tap('.mphbac-staff-q'); else await p.click('.mphbac-staff-q');
    await p.keyboard.type('sm');
    await tapX();                                  // inside the 250ms debounce
    await p.waitForTimeout(500);
    s0 = await st();
    check(`${who}: a search still waiting on its debounce is cancelled — no request, no list`,
      (await reqs()).length === before && !s0.open && s0.value === '', { reqs: await reqs(), s0 });
    /* Its states are the public X's — see the parity section below, which
       supersedes the "never coral" this check asserted earlier in 0.45.2. */
    await p.fill('.mphbac-staff-q', 'sm');
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.mouse.move(1, 1).catch(() => {});
    /* The sheet's ✕, scaled: the same mark, ink and ground. */
    const look = await p.evaluate(() => {
      const a = document.querySelector('.mphbac-staff-qclear'), b = document.querySelector('.mphbac-staff-close');
      const ca = getComputedStyle(a), cb = getComputedStyle(b);
      return { same: a.querySelector('path').getAttribute('d') === b.querySelector('path').getAttribute('d'),
        ink: [ca.color, cb.color], stroke: [getComputedStyle(a.querySelector('path')).strokeWidth, getComputedStyle(b.querySelector('path')).strokeWidth] };
    });
    check(`${who}: it is the booking sheet's ✕ — the same mark, ink and stroke`, look.same && look.ink[0] === look.ink[1] && look.stroke[0] === look.stroke[1], look);
    if (!phone) {
      await p.fill('.mphbac-staff-q', 'smi');
      await p.waitForTimeout(450);
      await p.focus('.mphbac-staff-q');
      await p.keyboard.press('Escape');
      s0 = await st();
      check(`${who}: Escape still clears the field and closes the results`, s0.value === '' && !s0.open, s0);
      /* Chrome clears a search field on Escape by itself (and fires
         'search'); the board's own handler is for browsers that do not. A
         synthetic keydown has no default action, so only the handler acts. */
      await p.fill('.mphbac-staff-q', 'smi');
      await p.waitForTimeout(450);
      await p.evaluate(() => document.querySelector('.mphbac-staff-q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      s0 = await st();
      check(`${who}: ...by the board's own handler, not only the browser's`, s0.value === '' && !s0.open, s0);
    }
    /* NO NATIVE CANCEL BUTTON. Chrome paints one at the end of the text area
       of a focused search field with text. Measured as ink, in the strip
       where it would sit, with our ✕ made invisible — and the instrument
       proven by putting the native one back. */
    const nativeInk = async () => {
      await p.fill('.mphbac-staff-q', 'ab');
      await p.focus('.mphbac-staff-q');
      await p.evaluate(() => { document.querySelector('.mphbac-staff-qclear').style.visibility = 'hidden'; });
      await p.waitForTimeout(100);
      const box = await p.evaluate(() => { const q = document.querySelector('.mphbac-staff-q'), r = q.getBoundingClientRect(), c = getComputedStyle(q);
        const right = r.right - parseFloat(c.borderRightWidth) - parseFloat(c.paddingRight);
        return { x: right - 26, y: r.top + 6, width: 26, height: r.height - 12 }; });
      const shot = await p.screenshot({ clip: box, scale: 'css' });
      return p.evaluate(async u => {
        const img = new Image(); await new Promise(r => { img.onload = r; img.src = u; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 600) n++;
        return n;
      }, 'data:image/png;base64,' + shot.toString('base64'));
    };
    const none = await nativeInk();
    await p.addStyleTag({ content: '.mphbac-staff .mphbac-staff-q.mphbac-staff-q::-webkit-search-cancel-button { -webkit-appearance: searchfield-cancel-button !important; appearance: auto !important; display: block !important; }' });
    const back = await nativeInk();
    check(`${who}: (instrument check) with the native cancel button put back, the strip shows its ink`, back > 20, back);
    check(`${who}: no native cancel button — never two ✕`, none === 0, { none, back });
    await ctx.close();
  }

  console.log('\n-- 0.45.2: the board\'s buttons ARE the public calendar\'s buttons, in every state --');
  {
    /* Rob: "make the buttons' styles / colours / states match what we already
       set up for the availability calendar on the home page and the cottages
       pages". The two widgets, side by side, with the theme's kit button rule
       (in the staff harness) and the live public nav radius (30px, from its
       panel): every state on a desktop, the state a tap leaves on a phone.
       Pairs: ‹ › and Today ↔ .mphbac-nav-btn; the sheet ✕ and the search ✕
       ↔ .mphbac-sheet-close; Photo ID / Text / WP-Admin ↔ the public "View"
       pill (.mphbac-info-view-link). Bars are not buttons here (Rob, 0.44.1). */
    const KIT = S.THEME.match(/\.elementor-kit-9 button:hover[^}]*}/)[0];
    const LIVE_PANEL = `${H.POST}${H.WRAPPER} .mphbac-root.mphbac-root .mphbac-nav-btn{border-radius:30px}`;
    const pubHtml = H.page({ panel: LIVE_PANEL, body: H.dephp(H.extractBlock(H.php(), '<div class="mphbac-nav">')) + H.filtersHtml()
      + '<p><a class="mphbac-info-view-link" href="#v">View</a></p>', sheet: H.sheetHtml() }).replace('</head>', `<style>${KIT}</style></head>`);
    const details = JSON.parse(JSON.stringify(F.DETAILS));
    details[1].sections.customer.push({ label: 'Photo ID', value: 'id.jpg', photo: { field: 'upload_id' } });
    const PROPS = ['backgroundColor', 'color', 'borderTopLeftRadius', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'opacity', 'cursor'];
    const read = (p, sel) => p.evaluate(([s2, props]) => { const e = document.querySelector(s2); e.style.transition = 'none';
      const c = getComputedStyle(e); const o = {}; for (const k of props) o[k] = c[k]; return o; }, [sel, PROPS]);
    const states = async (p, sel, phone) => {
      const out = {};
      await p.evaluate(s2 => { const e = document.querySelector(s2); e.hidden = false;
        // A press must not close the sheet or change the period: what is
        // measured is the state the press LEAVES the button in.
        window.addEventListener('click', ev => { if (ev.target.closest(s2)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true); }, sel);
      await p.mouse.move(1, 1).catch(() => {});
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      out.rest = await read(p, sel);
      const bb = await p.locator(sel).first().boundingBox();
      // FOCUSED BY SCRIPT after a pointer interaction — how both popups put
      // focus on their ✕ when a tap or a click opens them (0.45.2, asked by
      // the Website Director after measuring the public one on live).
      const scriptFocus = () => p.evaluate(s2 => { const e = document.querySelector(s2); e.blur(); e.focus(); }, sel);
      if (phone) { await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(80); out.tapped = await read(p, sel);
        await scriptFocus(); out.scriptFocus = await read(p, sel); return out; }
      await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); out.hover = await read(p, sel);
      await p.mouse.down(); out.pressed = await read(p, sel); await p.mouse.up(); out.clicked = await read(p, sel);
      await p.mouse.move(1, 1); out.clickedAway = await read(p, sel);
      await scriptFocus(); out.scriptFocus = await read(p, sel);
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await p.keyboard.press('Shift'); await p.evaluate(s2 => document.querySelector(s2).focus(), sel); out.keyboard = await read(p, sel);
      await p.evaluate(s2 => { const e = document.querySelector(s2); e.blur(); e.disabled = true; }, sel); out.disabled = await read(p, sel);
      return out;
    };
    const measured = {};
    for (const phone of [false, true]) {
      const dev = phone ? 'PHONE' : 'DESKTOP';
      const opts = phone ? { viewport: { width: 375, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } };
      for (const [k, sel, sheet] of [['nav', '.mphbac-nav-prev'], ['today', '.mphbac-nav-today'], ['close', '.mphbac-sheet .mphbac-sheet-close', 1], ['view', '.mphbac-info-view-link']]) {
        const ctx = await browser.newContext(opts); const p = await ctx.newPage();
        await p.setContent(pubHtml);
        if (sheet) {
          await p.evaluate(() => { for (const e of document.querySelectorAll('.mphbac-sheet, .mphbac-sheet-overlay')) { e.hidden = false; e.classList.add('is-open'); e.style.cssText += ';display:flex;opacity:1;transform:none;visibility:visible'; } });
          await p.waitForTimeout(700);                   // its open animation moves the button
        }
        measured[dev + ' public ' + k] = await states(p, sel, phone);
        await ctx.close();
      }
      for (const [k, sel, sheet] of [['nav', '.mphbac-staff-prev'], ['today', '.mphbac-staff-today'], ['close', '.mphbac-staff-close', 1], ['qclear', '.mphbac-staff-qclear'],
        ['photo', '.mphbac-staff-photo a', 1], ['sms', '.mphbac-staff-sms', 1], ['admin', '.mphbac-staff-adminlink', 1]]) {
        const html = S.boardShell({ today: F.TODAY, cottages: F.COTTAGES, bookings: F.BOOKINGS, details, search: F.SEARCH, bodyStyle: phone ? 'padding:0 27px' : '' });
        const ctx = await browser.newContext(opts);
        await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
        const p = await ctx.newPage(); await p.goto(ORIGIN); await p.waitForTimeout(300);
        if (k === 'qclear') await p.fill('.mphbac-staff-q', 'sm');
        if (sheet) { await p.click('.mphbac-staff-bar[data-booking-id="1"]'); await p.waitForTimeout(400); }
        measured[dev + ' staff ' + k] = await states(p, sel, phone);
        await ctx.close();
      }
    }
    const inst = measured['DESKTOP public nav'];
    check('(instrument check) the kit rule reaches the PUBLIC nav: coral on hover, and still coral after a click', inst.hover.backgroundColor === 'rgb(240, 128, 128)'
      && inst.clickedAway.backgroundColor === 'rgb(240, 128, 128)' && inst.rest.backgroundColor === 'rgb(10, 80, 178)', inst);
    check('(instrument check) a tap on the PUBLIC nav leaves it coral on a phone', measured['PHONE public nav'].tapped.backgroundColor === 'rgb(240, 128, 128)', measured['PHONE public nav']);
    for (const dev of ['DESKTOP', 'PHONE']) {
      for (const [pub, staff, label] of [['nav', 'nav', '‹ ›'], ['today', 'today', 'Today'], ['close', 'close', 'the sheet ✕'], ['close', 'qclear', 'the search ✕'],
        ['view', 'photo', 'View Photo ID'], ['view', 'sms', 'Text'], ['view', 'admin', 'Open in WP-Admin']]) {
        const A = measured[dev + ' public ' + pub], B = measured[dev + ' staff ' + staff], diffs = [];
        for (const st of Object.keys(A)) {
          // The search ✕ never keeps focus (a press leaves it in the field,
          // so blur() puts a phone's keyboard away) and a click empties the
          // field, which hides it: its "after a click" state is never seen,
          // and no script ever focuses it.
          if (staff === 'qclear' && (st === 'clickedAway' || st === 'scriptFocus')) continue;
          for (const k of PROPS) if (A[st][k] !== B[st][k]) diffs.push(`${st}.${k}: public ${A[st][k]} / staff ${B[st][k]}`);
        }
        check(`${dev}: ${label} looks and behaves exactly like its public twin — ${Object.keys(A).join(', ')}`, diffs.length === 0, diffs);
      }
    }
  }

  console.log('\n-- 0.45.2: the sheet opens with focus on its title, so the ✕ does not open coral --');
  for (const phone of [false, true]) {
    const who = phone ? 'PHONE' : 'DESKTOP';
    const { ctx, p } = await open({ phone });
    if (phone) await p.tap('.mphbac-staff-bar[data-booking-id="1"]'); else await p.click('.mphbac-staff-bar[data-booking-id="1"]');
    await p.waitForTimeout(500);
    const st = () => p.evaluate(() => { const x = document.querySelector('.mphbac-staff-close'); x.style.transition = 'none';
      const a = document.activeElement, sh = document.querySelector('.mphbac-staff-sheet');
      return { on: a === document.querySelector('.mphbac-staff-sheet-title') ? 'title' : a === x ? 'close' : (sh.contains(a) ? 'inside' : 'OUTSIDE'),
        bg: getComputedStyle(x).backgroundColor }; });
    let v = await st();
    check(`${who}: opened, focus is in the sheet, on its title`, v.on === 'title', v);
    check(`${who}: ...so the ✕ opens at its resting tint, not the theme's coral`, v.bg !== 'rgb(240, 128, 128)' && /color\(srgb|231, 238, 247/.test(v.bg), v);
    if (!phone) {
      await p.keyboard.press('Tab');
      v = await st();
      check(`${who}: Tab from the title reaches the ✕ (which then shows the public X's keyboard focus)`, v.on === 'close' && v.bg === 'rgb(240, 128, 128)', v);
      await p.evaluate(() => document.querySelector('.mphbac-staff-sheet-title').focus());
      await p.keyboard.press('Shift+Tab');
      v = await st();
      check(`${who}: Shift+Tab from the title stays inside the sheet`, v.on !== 'OUTSIDE', v);
    }
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
    await choose(p, 'year');
    await p.click('.mphbac-staff-stats-toggle');
    await p.waitForTimeout(100);
    await p.evaluate(() => { document.querySelector('.mphbac-staff-grid').scrollLeft = 2000; });
    const before = { n: await reqs(), upd: await p.evaluate(() => document.querySelector('.mphbac-staff-updated').textContent) };
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    await p.waitForTimeout(150);
    const after = await p.evaluate(() => ({ period: document.querySelector('.mphbac-staff-period').value,
      x: document.querySelector('.mphbac-staff-grid').scrollLeft, stats: document.querySelector('.mphbac-staff-stats').open
        && document.querySelectorAll('.mphbac-staff-kpi').length > 0,
      upd: document.querySelector('.mphbac-staff-updated').textContent }));
    check('after 3 minutes the board fetched again', (await reqs()) > before.n, [before.n, await reqs()]);
    check('...keeping the period, the scroll position, and Stats open and filled', after.period === 'year' && Math.abs(after.x - 2000) <= 1 && after.stats, after);
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
    await p.click('.mphbac-staff-next');
    await p.waitForTimeout(80);
    await p.evaluate(() => { window.__nonceExpired = true; });
    const loads0 = p.loads();
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    await p.waitForFunction(n => window.__reqs !== undefined && document.readyState === 'complete', loads0);
    await p.waitForTimeout(400);
    const back = await p.evaluate(() => ({ period: document.querySelector('.mphbac-staff-period').value,
      from: (document.querySelector('.mphbac-staff-chart') || {}).dataset && document.querySelector('.mphbac-staff-chart').dataset.from,
      hash: location.hash,
      guard: (() => { try { return sessionStorage.getItem('mphbacStaffReload'); } catch (e) { return 'X'; } })(),
      storage: (() => { const o = []; for (let i = 0; i < sessionStorage.length; i++) o.push(sessionStorage.key(i)); for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); return o; })(),
      status: document.querySelector('.mphbac-staff-status').textContent }));
    check('the expired-token 403 reloaded the page ONCE', p.loads() === loads0 + 1, [loads0, p.loads()]);
    check('...and the board came back on the SAME view: Weekly, the next week', back.period === 'week' && back.from === '2026-10-11', back);
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
