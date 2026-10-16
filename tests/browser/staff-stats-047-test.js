'use strict';
/**
 * 0.47.0 PART B — STATS (Rob's picks of 2026-10-16), DRIVEN IN A REAL PAGE
 * WITH THE SHIPPED (minified) staff.js, in Raleway, against Elementor's own
 * table rules and a theme `dt` at 14px (what live's tile labels measured):
 *
 *   B1  the eight counting-rule lines gone from every tip and from the
 *       strings; the lines that say what a figure means kept; no tip empty,
 *       no empty list, the joined text still reading as sentences.
 *   B2  every Stats size +2px; line boxes that grow with the type; headings
 *       balanced and never broken inside a word at 360; desktop widths kept;
 *       a pie slice too thin for its 15px label left unlabelled.
 *   B3  Nights by Cottage a real table — Cottage | Nights | Occupancy |
 *       vs <year> — on one grid: every figure's right edge within 1px of its
 *       label's at 360 / 390 / 1280; each figure read with its column; ▲▼ in
 *       occupancy points against the SAME DATES LAST YEAR ("—" without data),
 *       "vs 2025–26" across New Year; no request of its own, none per cottage.
 *   B4  the seven new section names.
 * Nothing scrolls sideways at 360 / 390 / 1280.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const X = require('./stats-047-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'http://staff.test/';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const REMOVED = {
  stTipOnce: 'A stay that Airbnb, Booking.com or Vrbo also blocks counts once.',
  stTipNightOnce: 'A night counts once, even if Airbnb, Booking.com or Vrbo also blocks it.',
  stBySourceOnce: 'A night booked twice counts once, for the stay that arrived first.',
  stWeekdaysSame: 'The same stays as the Arrivals and Departures tiles: each counts once.',
  stTipDock: 'Dock blocks are left out.',
  stBookedDock: 'Dock blocks are not counted as booked, but their nights stay in the total.',
  stTurnoversOnce: 'One per cottage per day.',
  stLeadAfter: 'Bookings made after their check-in are left out.',
};
const NAMES = ['Nights by Cottage', 'Nights by Source', 'Stays by Length', 'Arrivals & Departures by Day',
  'Days Booked Ahead by Source', 'Upcoming Nights vs Last Year', 'Nights Booked in 2026'];

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const shell = (opts = {}) => S.boardShell(Object.assign({ today: X.TODAY, cottages: X.COTTAGES, bookings: X.BOOKINGS,
    // The theme's dt rule at the kit's weight (0,1,1), above the tile label's
    // own (0,1,0): what made live's labels 14px.
    bodyStyle: 'padding:0 16px', head: S.raleway() + X.ELEMENTOR_TABLE + '<style>.elementor-kit-331 dt { font-size: 14px; }</style>' }, opts));
  const open = async ({ w = 1280, html = shell() } = {}) => {
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-percot'));
    await p.waitForTimeout(150);
    return { ctx, p };
  };
  const settle = p => p.waitForTimeout(250);
  const decJan = async p => {
    await p.selectOption('.mphbac-staff-stats-span', 'week');
    await p.fill('.mphbac-staff-stats-date', '2026-12-30'); await p.dispatchEvent('.mphbac-staff-stats-date', 'change'); await settle(p);
  };
  const table = p => p.evaluate(() => {
    const head = [...document.querySelectorAll('.mphbac-staff-percot-h')].map(h => h.textContent);
    const rows = [...document.querySelectorAll('.mphbac-staff-percot-row')].map(r => ({
      id: r.getAttribute('data-cottage'), name: r.querySelector('.mphbac-staff-percot-name').textContent, nights: r.querySelector('.mphbac-staff-percot-num').textContent,
      occ: r.querySelector('.mphbac-staff-percot-pct').textContent, seen: r.querySelector('.mphbac-staff-percot-delta [aria-hidden]').textContent,
      said: r.querySelector('.mphbac-staff-percot-delta .mphbac-sr-only').textContent, bar: r.querySelector('.mphbac-staff-percot-fill').style.width }));
    return { head, rows };
  });
  const pct = (n, of) => Math.round(100 * n / of);
  const arrow = d => d === null ? '—' : d === 0 ? '±0' : (d > 0 ? '▲' : '▼') + Math.abs(d);

  console.log('\n-- B4: the section names --');
  {
    const { ctx, p } = await open();
    const heads = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-h')].map(h => h.textContent));
    check('Nights by Cottage, Nights by Source, Stays by Length, Arrivals & Departures by Day, Days Booked Ahead by Source, Upcoming Nights vs Last Year, Nights Booked in 2026',
      JSON.stringify(heads) === JSON.stringify(NAMES), heads);
    const tips = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-hrow .mphbac-staff-tip')].map(b => b.getAttribute('aria-label')));
    check('...and each ⓘ is named from its new heading ("About Nights by Cottage" …)', JSON.stringify(tips) === JSON.stringify(NAMES.map(n => 'About ' + n)), tips);
    const src = S.widgetPhp() + fs.readFileSync(S.ROOT + '/assets/js/staff.js', 'utf8');
    const old = ['Nights Booked by Cottage', 'Nights Booked by Source', "'Length of Stay'", 'Arrivals and Departures by Weekday', 'How Far Ahead They Book',
      "__('Pace'", 'Cottages Booked Each Night'];
    check('...no old name left in the strings or the script', old.every(o => !src.includes(o)), old.filter(o => src.includes(o)));
    await p.selectOption('.mphbac-staff-stats-span', 'year'); await p.selectOption('.mphbac-staff-stats-year', '2025'); await settle(p);
    const y = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-h')].pop().textContent);
    check('...the year in "Nights Booked in <year>" is the period\'s, computed (2025 here)', y === 'Nights Booked in 2025', y);
    await ctx.close();
  }

  console.log('\n-- B1: the tips say what a figure means, not how it is counted --');
  {
    const strings = S.boardStrings();
    check('the eight counting-rule strings are gone from the strings table', Object.keys(REMOVED).every(k => !(k in strings)), Object.keys(REMOVED).filter(k => k in strings));
    const js = fs.readFileSync(S.ROOT + '/assets/js/staff.js', 'utf8');
    check('...and the script names none of them', Object.keys(REMOVED).every(k => !js.includes('S.' + k)), Object.keys(REMOVED).filter(k => js.includes('S.' + k)));
    const { ctx, p } = await open();
    const read = () => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tipbox')].map(b => ({
      k: b.previousElementSibling ? null : null, key: document.querySelector('[aria-controls="' + b.id + '"]').getAttribute('data-tip'),
      lead: (b.querySelector('.mphbac-staff-tiplead') || {}).textContent || '', items: [...b.querySelectorAll('li')].map(li => li.textContent),
      uls: b.querySelectorAll('ul').length, empty: [...b.querySelectorAll('ul')].some(u => !u.children.length), text: b.textContent })));
    let tips = await read();
    await p.selectOption('.mphbac-staff-stats-span', 'day'); await settle(p);
    tips = tips.concat((await read()).filter(t => t.key === 'inhouse'));
    const all = tips.map(t => t.text).join(' ');
    check(`none of the eight lines in any of the ${tips.length} tips (Month, and Day's In House)`, Object.values(REMOVED).every(l => !all.includes(l))
      && !/[Dd]ock block|counts? once|left out/.test(all), Object.values(REMOVED).filter(l => all.includes(l)));
    const by = Object.fromEntries(tips.map(t => [t.key, t]));
    const kept = {
      'every tile\'s ▲▼ line': ['bookings', 'booked', 'length', 'arrivals', 'departures', 'turnovers', 'inhouse'].every(k => by[k].items.some(i => /^▲▼ compare with the same dates last year/.test(i))),
      'Length: the whole stay counts (stLengthWhole)': by.length.items.includes(strings.stLengthWhole),
      'In House: arrivals and departures on the day not included (stInHouseNot)': by.inhouse.items.includes(strings.stInHouseNot),
      'Upcoming Nights: last year a little low, and fixed (stPaceLow, stPaceFixed)': by.pace.items.includes(strings.stPaceLow) && by.pace.items.includes(strings.stPaceFixed),
      'the heat map\'s outline and tap lines': by.heat.items.includes(strings.stHeatOutline) && by.heat.items.includes(strings.stHeatTap),
      'Nights by Cottage: its ▲▼ line, now the same dates last year': by.percot.items.some(i => /^▲▼ compare with the same dates last year \(Oct 1 – 31, 2025\), in % occupancy\.$/.test(i)),
    };
    for (const [label, ok] of Object.entries(kept)) check('kept: ' + label, ok, tips.map(t => [t.key, t.items]));
    check('every tip leads with its sentence — none empty', tips.every(t => t.lead.length > 10 && /\.$/.test(t.lead)), tips.map(t => [t.key, t.lead]));
    check('...and no empty list anywhere in Stats: a tip with no points has no <ul> (Nights by Source, Stays by Length, Arrivals & Departures, Days Booked Ahead)',
      tips.every(t => !t.empty && (t.items.length ? t.uls === 1 : t.uls === 0)) && ['source', 'mix', 'weekdays', 'lead'].every(k => by[k].uls === 0)
      && await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out ul')].every(u => u.children.length)), tips.map(t => [t.key, t.uls, t.items.length]));
    check('the joined text still reads as sentences: never a full stop, colon or bracket against the next word',
      tips.every(t => !/[.:)][A-Z▲a-z]/.test(t.text.replace(/Booking\.com/g, 'Bookingcom'))), tips.map(t => t.text));
    await ctx.close();
  }

  console.log('\n-- B2: every size two steps up --');
  for (const w of [360, 390, 1280]) {
    const { ctx, p } = await open({ w });
    // Open one tip so its type can be read.
    await p.evaluate(() => document.querySelector('.mphbac-staff-stats-hrow .mphbac-staff-tip').click());
    const m = await p.evaluate(() => {
      const fs = s => { const e = document.querySelector('.mphbac-staff-stats-out ' + s); return e ? getComputedStyle(e).fontSize : null; };
      const h = [...document.querySelectorAll('.mphbac-staff-stats-h')];
      const wordBroken = h.some(el => { const r = document.createRange(); let broken = false;
        const walk = n => { if (n.nodeType === 3) { const re = /\S+/g; let m; while ((m = re.exec(n.data))) { r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
          const rects = [...r.getClientRects()].filter(x => x.width > 0); if (new Set(rects.map(x => Math.round(x.top))).size > 1) broken = true; } } else n.childNodes.forEach(walk); };
        walk(el); return broken; });
      return {
        heading: fs('.mphbac-staff-stats-h'), balance: getComputedStyle(h[0]).textWrap, clipped: h.some(e => e.scrollHeight > e.clientHeight + 1),
        lh: parseFloat(getComputedStyle(h[0]).lineHeight), wordBroken,
        tileNum: fs('.mphbac-staff-kpi-num'), tileLabel: fs('.mphbac-staff-kpi-label'), tileDelta: fs('.mphbac-staff-kpi-delta'),
        cottage: fs('.mphbac-staff-percot-name'), cottageNum: fs('.mphbac-staff-percot-num'), cottageDelta: fs('.mphbac-staff-percot-delta'), mix: fs('.mphbac-staff-mix-row'),
        pieLabel: fs('.mphbac-staff-pie-label'), pieKey: fs('.mphbac-staff-pie-list'),
        wkNum: fs('.mphbac-staff-wk-num'), wkName: fs('.mphbac-staff-wk-name'), wkKey: fs('.mphbac-staff-wk-key'),
        lead: fs('.mphbac-staff-lead'), pace: fs('.mphbac-staff-pace'), paceDelta: fs('.mphbac-staff-pace-delta'),
        heatName: fs('.mphbac-staff-heat-name'), heatKey: fs('.mphbac-staff-heat-key'), tip: fs('.mphbac-staff-tipbox'),
        widths: ['.mphbac-staff-percot', '.mphbac-staff-mix', '.mphbac-staff-lead', '.mphbac-staff-wk'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().width)),
        hscroll: document.documentElement.scrollWidth > innerWidth,
        out: (() => { const o = document.querySelector('.mphbac-staff-stats-out').getBoundingClientRect();
          return [...document.querySelectorAll('.mphbac-staff-stats-out *')].filter(e => !e.closest('.mphbac-staff-tipbox, .mphbac-sr-only') && e.getClientRects().length)
            .filter(e => { const r = e.getBoundingClientRect(); return r.right > o.right + 0.5 || r.left < o.left - 0.5; }).map(e => e.className.baseVal !== undefined ? 'svg' : e.className).slice(0, 5); })(),
      };
    });
    const want = { heading: '16px', tileNum: '24px', tileLabel: '16px', tileDelta: '14px', cottage: '15px', cottageNum: '15px', cottageDelta: '15px', mix: '15px',
      pieLabel: '15px', pieKey: '16px', wkNum: '13px', wkName: '14px', wkKey: '15px', lead: '16px', pace: '16px', paceDelta: '15px', heatName: '14px', heatKey: '14px', tip: '15px' };
    const off = Object.keys(want).filter(k => m[k] !== want[k]);
    check(`${w}px: every size +2 — headings 16, rows 15, tiles 24 / 16 / 14, pie 15 / 16, weekdays 13 / 14 / 15, lists 16 (▲▼ 15), heat map 14, tips 15`, !off.length, off.map(k => k + ' ' + m[k]));
    check(`${w}px: the tile label 16px even under a theme's \`dt { font-size: 14px }\` (live measured 14)`, m.tileLabel === '16px', m.tileLabel);
    check(`${w}px: headings balanced, their line box grown with the type (${m.lh}px ≥ 16 × 1.3), nothing clipped, no word broken across lines`,
      m.balance === 'balance' && m.lh >= 20.8 && !m.clipped && !m.wordBroken, m);
    check(`${w}px: nothing in Stats crosses its edges, and the page never scrolls sideways`, !m.hscroll && !m.out.length, m.out);
    if (w === 1280) check('1280px: the desktop widths kept — the table and Stays by Length 560px, Days Booked Ahead 440px, the weekdays 520px',
      JSON.stringify(m.widths) === '[560,560,440,520]', m.widths);
    await ctx.close();
  }
  {
    const { ctx, p } = await open();
    // October 2026 by source: Direct 35, Airbnb 25, Booking.com 12, Vrbo 1 — of 73.
    const pie = await p.evaluate(() => ({ labels: [...document.querySelectorAll('.mphbac-staff-pie-label')].map(t => t.classList[1].replace('is-src-', '') + ' ' + t.textContent),
      key: [...document.querySelectorAll('.mphbac-staff-pie-item')].map(li => li.textContent) }));
    check('a slice too thin for its 15px label (Vrbo, 1 night of 73) carries none; the three others do',
      JSON.stringify(pie.labels) === '["direct 48%","airbnb 34%","booking 16%"]', pie.labels);
    check('...and the key below still names it: "Vrbo — 1% (1 night)"', pie.key.includes('Vrbo — 1% (1 night)') && pie.key.length === 4, pie.key);
    const fit = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-pie-label')].map(t => { const b = t.getBBox(); return b.width; }));
    check('...each label that is drawn is 15px type inside a slice wide enough for it', fit.every(x => x > 0), fit);
    await ctx.close();
  }

  console.log('\n-- B3: Nights by Cottage, a real table --');
  {
    const { ctx, p } = await open();
    const t = await table(p);
    check('the header: Cottage, Nights, Occupancy, vs 2025 — the year computed from the dates compared',
      JSON.stringify(t.head) === '["Cottage","Nights","Occupancy","vs 2025"]', t.head);
    // The expected figures, worked out here from the fixture alone.
    const exp = X.COTTAGES.map((c, i) => { const n = X.nightsIn(c.id, '2026-10-01', '2026-10-31'), ly = X.nightsIn(c.id, '2025-10-01', '2025-10-31');
      return { i, name: '#' + c.number + ' ' + c.abbrev, nights: String(n), occ: pct(n, 31) + '%', seen: arrow(pct(n, 31) - pct(ly, 31)), n }; })
      .sort((a, b) => b.n - a.n || a.i - b.i);
    check('busiest first, ties in cottage order: #23, #36, #35, #31, #22, #32, #33, #34',
      JSON.stringify(t.rows.map(r => r.name)) === JSON.stringify(exp.map(e => e.name)), t.rows.map(r => r.name));
    check('Nights and Occupancy (booked nights ÷ the period\'s 31): #23 29 94%, #36 14 45%, #32 1 3%',
      t.rows.every((r, i) => r.nights === exp[i].nights && r.occ === exp[i].occ), t.rows.map(r => [r.name, r.nights, r.occ]));
    check('...and each bar shows that same Occupancy %', t.rows.every(r => r.bar === r.occ), t.rows.map(r => [r.occ, r.bar]));
    check('vs 2025 is OCCUPANCY POINTS AGAINST THE SAME DATES LAST YEAR, as the tiles: #23 ▲62 (94 − 32), #36 ±0, #35 ▲39, #22 ▼42 (23 − 65), #32 ▼7 (3 − 10)',
      t.rows.every((r, i) => r.seen === exp[i].seen) && t.rows[0].seen === '▲62' && t.rows.find(r => r.id === '22').seen === '▼42', t.rows.map(r => [r.name, r.seen]));
    check('...read out "up 62 points vs the same dates in 2025"', t.rows[0].said === 'up 62 points vs the same dates in 2025' && t.rows[1].said === 'no change vs the same dates in 2025'
      && t.rows.find(r => r.id === '22').said === 'down 42 points vs the same dates in 2025', t.rows.map(r => r.said));
    // The tiles agree: Booked's ▲▼ is the same arithmetic on all cottages.
    const booked = await p.evaluate(() => document.querySelector('.mphbac-staff-kpi.is-booked .mphbac-staff-kpi-delta [aria-hidden]').textContent);
    const all = c => X.COTTAGES.reduce((s, x) => s + X.nightsIn(x.id, c[0], c[1]), 0);
    check(`...the same comparison the Booked tile makes (${booked} = ${pct(all(['2026-10-01', '2026-10-31']), 248)} − ${pct(all(['2025-10-01', '2025-10-31']), 248)})`,
      booked === arrow(pct(all(['2026-10-01', '2026-10-31']), 248) - pct(all(['2025-10-01', '2025-10-31']), 248)), booked);
    // No request of its own: the tiles' last-year data, and nothing for the previous timeframe.
    const reqs = await p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').map(r => r.from + '|' + r.to));
    check('no request of its own: last year\'s October is the tiles\' (asked for once), and September 2026 — the old comparison — is never asked for',
      reqs.filter(r => r === '2025-10-01|2025-10-31').length <= 1 && reqs.some(r => r.startsWith('2025-10-01')) && !reqs.some(r => r.startsWith('2026-09')), reqs);
    await ctx.close();
    // Twice the cottages, the same requests.
    const many = X.COTTAGES.concat(X.COTTAGES.map(c => Object.assign({}, c, { id: c.id + 100, number: String(+c.number + 20) })));
    const m2 = await open({ html: shell({ cottages: many }) });
    const reqs2 = await m2.p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').map(r => r.from + '|' + r.to));
    check(`no request per cottage: 16 cottages ask exactly what 8 do (${reqs2.length} requests)`, JSON.stringify(reqs2.slice().sort()) === JSON.stringify(reqs.slice().sort()), [reqs, reqs2]);
    await m2.ctx.close();
  }
  {
    const { ctx, p } = await open();
    await p.selectOption('.mphbac-staff-stats-month', '2025-10'); await settle(p);
    const t = await table(p);
    check('October 2025: last year (Oct 2024) is before "Records complete from" — every cottage "—", read "no comparison"; the header still "vs 2024"',
      t.rows.every(r => r.seen === '—' && r.said === 'no comparison') && t.head[3] === 'vs 2024', [t.head, t.rows.map(r => r.seen)]);
    await decJan(p);
    const d = await table(p);
    const exp = X.COTTAGES.map((c, i) => { const n = X.nightsIn(c.id, '2026-12-27', '2027-01-02'), ly = X.nightsIn(c.id, '2025-12-27', '2026-01-02');
      return { i, n, seen: arrow(pct(n, 7) - pct(ly, 7)) }; }).sort((a, b) => b.n - a.n || a.i - b.i);
    check('the week of Dec 27, 2026 – Jan 2, 2027 compares with Dec 27, 2025 – Jan 2, 2026: the header reads "vs 2025–26"', d.head[3] === 'vs 2025–26', d.head);
    check('...#22 ▼14 (86 − 100), #35 ▲57, #33 ▼29 — and read "… vs the same dates in 2025–26"',
      d.rows.every((r, i) => r.seen === exp[i].seen) && d.rows.find(r => r.id === '22').seen === '▼14' && d.rows.find(r => r.id === '33').seen === '▼29'
      && d.rows.find(r => r.id === '22').said === 'down 14 points vs the same dates in 2025–26', d.rows.map(r => [r.id, r.seen, r.said]));
    await ctx.close();
  }
  for (const w of [360, 390, 1280]) {
    for (const per of ['oct', 'decjan']) {
      const { ctx, p } = await open({ w });
      if (per === 'decjan') await decJan(p);
      const a = await p.evaluate(() => {
        const R = el => { const r = document.createRange(); r.selectNodeContents(el); const rs = [...r.getClientRects()].filter(x => x.width); return rs.length ? rs[rs.length - 1].right : el.getBoundingClientRect().right; };
        const heads = [...document.querySelectorAll('.mphbac-staff-percot-h')];
        const cols = ['num', 'pct', 'delta'].map((k, i) => {
          const hr = R(heads[i + 1]);
          const cells = [...document.querySelectorAll('.mphbac-staff-percot-' + k)].map(c => R(k === 'delta' ? c.querySelector('[aria-hidden]') : c));
          return { k, head: +hr.toFixed(2), worst: +Math.max(...cells.map(x => Math.abs(x - hr))).toFixed(2) };
        });
        const names = [...document.querySelectorAll('.mphbac-staff-percot-name')].map(n => ({ t: n.textContent, whole: n.scrollWidth <= n.clientWidth + 0.5,
          oneLine: n.getBoundingClientRect().height < parseFloat(getComputedStyle(n).lineHeight) * 1.5 }));
        const nameL = [...document.querySelectorAll('.mphbac-staff-percot-name')].map(n => n.getBoundingClientRect().left);
        const tbl = document.querySelector('.mphbac-staff-percot').getBoundingClientRect(), o = document.querySelector('.mphbac-staff-stats-out').getBoundingClientRect();
        const bars = [...document.querySelectorAll('.mphbac-staff-percot .mphbac-staff-percot-track')].map(t => Math.round(t.getBoundingClientRect().width));
        const h0 = heads[0].getBoundingClientRect().left;
        return { cols, names, alignedLeft: nameL.every(x => Math.abs(x - h0) < 1), bars: [...new Set(bars)], tblW: Math.round(tbl.width),
          inside: tbl.left >= o.left - 0.5 && tbl.right <= o.right + 0.5, hscroll: document.documentElement.scrollWidth > innerWidth,
          ls: getComputedStyle(heads[1]).letterSpacing, gap: getComputedStyle(document.querySelector('.mphbac-staff-percot')).columnGap,
          align: heads.map(h => getComputedStyle(h).textAlign).join('|'),
          cellAlign: ['name', 'num', 'pct', 'delta'].map(k => getComputedStyle(document.querySelector('.mphbac-staff-percot-row .mphbac-staff-percot-' + k)).textAlign).join('|') };
      });
      const label = `${w}px, ${per === 'oct' ? 'Oct 2026' : 'Dec 27 – Jan 2'}`;
      check(`${label}: every figure's right edge within 1px of its column label's — Nights, Occupancy, vs ${per === 'oct' ? '2025' : '2025–26'}`,
        a.cols.every(c => c.worst <= 1), a.cols);
      check(`${label}: ...because labels and figures are both right-aligned (not by luck of widths); the names and "Cottage" left`, a.align === 'left|right|right|right' && a.cellAlign === 'left|right|right|right', a);
      check(`${label}: every name in full and on one line ("#23 Lighthouse", "#35 Blue Heron"), left-aligned under "Cottage"; no column dropped`,
        a.names.length === 8 && a.names.every(n => n.whole && n.oneLine) && a.alignedLeft && a.cols.length === 3, a.names.filter(n => !n.whole || !n.oneLine));
      check(`${label}: each bar the table's full width (${a.bars.join()}px of ${a.tblW}), the table inside Stats, no sideways scroll`,
        a.bars.length === 1 && Math.abs(a.bars[0] - a.tblW) <= 1 && a.inside && !a.hscroll, a);
      console.log(`   ${label}: header letter-spacing ${a.ls}, column gap ${a.gap}`);
      await ctx.close();
    }
  }
  {
    // A name longer than live's (to be safe): at 360, in a Dec–Jan week, the
    // name breaks between its words; it is never cut, and the table never
    // runs past Stats.
    const cots = X.COTTAGES.map(c => c.id === 33 ? Object.assign({}, c, { abbrev: 'Pineapple Paradise Point' }) : c);
    const { ctx, p } = await open({ w: 360, html: shell({ cottages: cots }) });
    await decJan(p);
    const r = await p.evaluate(() => { const n = [...document.querySelectorAll('.mphbac-staff-percot-name')].find(x => /Pineapple/.test(x.textContent));
      const t = document.querySelector('.mphbac-staff-percot').getBoundingClientRect(), o = document.querySelector('.mphbac-staff-stats-out').getBoundingClientRect();
      const heads = [...document.querySelectorAll('.mphbac-staff-percot-h')].map(h => h.getBoundingClientRect().right);
      return { whole: n.scrollWidth <= n.clientWidth + 0.5, lines: Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)),
        inside: t.right <= o.right + 0.5 && Math.max(...heads) <= t.right + 0.5, hscroll: document.documentElement.scrollWidth > innerWidth }; });
    check('360px, a longer name ("#33 Pineapple Paradise Point") with "vs 2025–26": it breaks between words onto a second line, whole; every column stays inside the table',
      r.whole && r.lines === 2 && r.inside && !r.hscroll, r);
    await ctx.close();
  }
  {
    // The previous timeframe is never asked for. For most months the year's
    // own request covers it anyway; January's (December before) is not.
    const { ctx, p } = await open();
    await p.selectOption('.mphbac-staff-stats-month', '2028-01'); await settle(p);
    const reqs = await p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month').map(r => r.from + '|' + r.to));
    check('January 2028: no request reaches into December 2027 (the old previous timeframe)', !reqs.some(r => r.slice(0, 7) === '2027-12' || (r.slice(0, 10) <= '2027-12-31' && r.slice(11) >= '2027-12-01' && r.slice(0, 4) === '2027' && r.slice(11, 15) === '2028')), reqs);
    await ctx.close();
  }
  {
    const { ctx, p } = await open();
    // What a screen reader is given: the browser's own accessibility tree.
    const cdp = await ctx.newCDPSession(p);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map(n => [n.nodeId, n]));
    const kids = n => (n.childIds || []).map(id => byId.get(id)).filter(Boolean).flatMap(c => c.ignored ? kids(c) : [c]);
    const tableNode = nodes.find(n => !n.ignored && n.role && n.role.value === 'table');
    const rows = [];
    const collect = n => kids(n).forEach(c => { if (c.role.value === 'row') rows.push(c); else if (c.role.value === 'rowgroup' || c.role.value === 'generic') collect(c); });
    if (tableNode) collect(tableNode);
    const shape = rows.map(r => kids(r).map(c => c.role.value + ':' + ((c.name && c.name.value) || '')));
    check('the browser exposes a TABLE: a header row of four column headers, then one row a cottage — its row header and three cells, the bar not among them',
      !!tableNode && shape.length === 9 && JSON.stringify(shape[0]) === '["columnheader:Cottage","columnheader:Nights","columnheader:Occupancy","columnheader:vs 2025"]'
      && shape.slice(1).every(r => r.length === 4 && /^rowheader:#/.test(r[0]) && r.slice(1).every(c => /^cell:/.test(c))), shape.slice(0, 3));
    await p.addScriptTag({ content: AXE });
    const ax = await p.evaluate(async () => {
      const r = await window.axe.run('.is-percot', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] } });
      return { v: r.violations.map(v => v.id + ':' + v.nodes.length), checked: r.passes.map(x => x.id).filter(id => /table|th-|td-|scope/.test(id)) };
    });
    check('...and axe-core finds nothing wrong with it (its table rules among those that pass)', !ax.v.length && ax.checked.length >= 2, ax);
    const sr = await p.evaluate(() => { const r = document.querySelector('.mphbac-staff-percot-row'); const d = r.querySelector('.mphbac-staff-percot-delta');
      return { headers: [...document.querySelectorAll('.mphbac-staff-percot-h')].map(h => h.getAttribute('scope') + '/' + h.getAttribute('role')), rowh: r.querySelector('th').getAttribute('scope'),
        seenHidden: d.querySelector('[aria-hidden]').getAttribute('aria-hidden'), bar: r.querySelector('.mphbac-staff-percot-barcell').getAttribute('aria-hidden') }; });
    check('...in the markup: th scope="col" / columnheader, the name th scope="row", the ▲ hidden behind its sentence, the bar aria-hidden',
      sr.headers.every(h => h === 'col/columnheader') && sr.rowh === 'row' && sr.seenHidden === 'true' && sr.bar === 'true', sr);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
