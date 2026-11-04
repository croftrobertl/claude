'use strict';
/**
 * 0.56.0 — THE BOOKING POP-UP, "SUMMARY ON TOP" (Rob's layout C), in a real
 * page with the shipped (minified) staff.js, every answer the real server's
 * (popup-0560-fixture.js). Sample bookings only.
 *
 *   1  the summary: the cottage(s) unlabelled, centred, bold ~20px; Check-In
 *      · Check-Out · Nights as "Fri, Nov 6", the year only when it is not this
 *      year, Nights = check-out − check-in; at 320px no tile wraps or clips
 *      (the longest date, "Wed, Sep 30"); chips: the channel of an import
 *      (never a direct booking's), "Guest Count Not Sent" — and no banner
 *   2  Booking Information: what is left, under today's heading, or no
 *      heading; the confirmed count kept as a row, never a chip
 *   3  every other label as today (no merged names, headings re-cased only
 *      by CSS as before); the label column sized to its words
 *   4  notes: a box each, no date or author, Copy on the right level with
 *      the first line (and still at 320), "From Guest" on the guest's only,
 *      the new names; a tap copies the text alone
 *   5  Open in WP-Admin as in 0.55.0; nothing new asked of the server
 *   6  the customer rows and the admin link, markup identical to 0.55.0's
 * STILLS_OUT=<dir>: before/after stills at 320, 390, 1440 and a manifest.
 * NOT TESTABLE HERE: Safari on a real iPhone (fonts, the clipboard on the
 * first tap, the pop-up's scrolling). Chromium with touch stands in.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const X = require('./popup-0560-fixture.js');
const { check, done } = H.reporter();

fs.symlinkSync(path.join(__dirname, 'node_modules'), path.join(X.OLD_DIR, 'tests/browser/node_modules'));
fs.symlinkSync(path.resolve(__dirname, '../../tools/node_modules'), path.join(X.OLD_DIR, 'tools/node_modules'));
const S_OLD = require(path.join(X.OLD_DIR, 'tests/browser/staff-harness.js'));
const OUT = process.env.STILLS_OUT || '';

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const open = async ({ w = 390, id, old = false, tall = false } = {}) => {
    const harness = old ? S_OLD : S;
    const html = harness.boardShell({ today: X.TODAY, cottages: X.COTTAGES, bookings: X.BOOKINGS, details: old ? X.DETAILS_OLD : X.DETAILS_NEW, head: harness.raleway() });
    const h = tall ? 2400 : 844;
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: OUT ? 2 : 1 } : { viewport: { width: w, height: tall ? 2400 : 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: X.ORIGIN.slice(0, -1) });
    await ctx.route(X.ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.__errors = [];
    p.on('pageerror', e => p.__errors.push(e.message));
    await p.goto(X.ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
    await p.evaluate(() => document.fonts.ready);
    await p.click(`.mphbac-staff-bar[data-booking-id="${id}"]`);
    await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-sheet-body > *');
    await p.waitForTimeout(900);
    return { ctx, p };
  };
  const read = p => p.evaluate(() => {
    const sheet = document.querySelector('.mphbac-staff-sheet');
    const q = (s, r = sheet) => [...r.querySelectorAll(s)];
    const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const lh = e => parseFloat(getComputedStyle(e).lineHeight);
    return {
      cottages: q('.mphbac-staff-sum-cottage').map(e => ({ text: e.textContent, align: getComputedStyle(e).textAlign, weight: getComputedStyle(e).fontWeight, size: getComputedStyle(e).fontSize })),
      tiles: q('.mphbac-staff-sum-tile').map(t => { const v = t.querySelector('.mphbac-staff-sum-value'), y = t.querySelector('.mphbac-staff-sum-year');
        return { label: t.querySelector('.mphbac-staff-sum-label').textContent, value: v.textContent, year: y ? y.textContent : '', yearSeen: y ? [...y.childNodes].filter(n => !(n.classList && n.classList.contains('mphbac-sr-only'))).map(n => n.textContent).join('') : '',
          srHidden: y ? [...y.querySelectorAll('.mphbac-sr-only')].every(e => { const b = e.getBoundingClientRect(); return b.width <= 1 && b.height <= 1 && getComputedStyle(e).position === 'absolute'; }) : true, w: box(t).w,
          oneLine: v.getClientRects().length === 1 && box(v).h < lh(v) * 1.5, fits: v.scrollWidth <= v.clientWidth + 0.5 && box(v).l >= box(t).l - 0.5 && box(v).r <= box(t).r + 0.5,
          bg: getComputedStyle(t).backgroundColor, radius: getComputedStyle(t).borderRadius }; }),
      chips: q('.mphbac-staff-chip').map(c => ({ text: c.textContent, muted: c.classList.contains('is-muted') })),
      banner: q('.mphbac-staff-imported').length + (sheet.textContent.includes('came from an external channel') ? 1 : 0) + (/count not provided/.test(sheet.textContent) ? 1 : 0),
      heads: q('.mphbac-staff-section > h3').map(h => ({ text: h.textContent, tt: getComputedStyle(h).textTransform })),
      sections: q('.mphbac-staff-section').map(s => ({ head: s.querySelector('h3').textContent, labels: q('dt', s).map(d => d.textContent), values: q('dd', s).map(d => d.textContent) })),
      allLabels: q('dt').map(d => d.textContent),
      cols: q('dl').map(dl => { const dt = q('dt', dl), dd = q('dd', dl);
        // The longest label's own words, unwrapped: a Range over a clone set nowrap.
        const words = Math.max(...dt.map(d => { const c = d.cloneNode(true); c.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;width:auto;min-width:0'; dl.appendChild(c); const r = document.createRange(); r.selectNodeContents(c); const w = r.getBoundingClientRect().width; c.remove(); return w; }));
        const floor = 4.5 * parseFloat(getComputedStyle(dt[0]).fontSize);
        return { dl: box(dl).w, col: box(dt[0]).w, words, floor, dtMax: Math.max(...dt.map(d => box(d).w)), ddLeft: Math.min(...dd.map(d => box(d).l)), dtRight: Math.max(...dt.map(d => box(d).r)), cssCols: getComputedStyle(dl).gridTemplateColumns }; }),
      notes: q('.mphbac-staff-note').map(n => { const t = n.querySelector('.mphbac-staff-note-text'), b = n.querySelector('.mphbac-staff-copy');
        const first = t.getClientRects()[0];
        return { text: t.textContent, tag: (n.querySelector('.mphbac-staff-note-tag') || {}).textContent || '', guest: n.classList.contains('is-guest'), weight: getComputedStyle(t).fontWeight,
          align: getComputedStyle(t).textAlign, aria: b && b.getAttribute('aria-label'), label: b && b.textContent, right: b && box(b).l >= box(t).r - 0.5, sameRow: b && box(b).t < first.bottom && box(b).b > first.top,
          topAligned: b && Math.abs(box(b).t - box(n.querySelector('.mphbac-staff-note-body')).t) <= 2, bg: getComputedStyle(n).backgroundColor, radius: getComputedStyle(n).borderRadius,
          inDt: !!b.closest('dt'), boxText: n.textContent }; }),
      notesText: (sheet.querySelector('.mphbac-staff-section.is-notes') || {}).textContent || '',
      admin: (a => a && { href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent })(sheet.querySelector('.mphbac-staff-adminlink')),
      hscroll: q('*').some(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && !e.matches('.mphbac-staff-sheet-body, .mphbac-sr-only')),
      overflow: (() => { const body = box(sheet.querySelector('.mphbac-staff-sheet-body')); return q('.mphbac-staff-sheet-body *').filter(e => e.getClientRects().length && !e.closest('.mphbac-sr-only') && (box(e).r > body.r + 0.5 || box(e).l < body.l - 0.5)).map(e => e.className).slice(0, 4); })(),
      copyLook: (() => { const k = ['height', 'padding-left', 'padding-right', 'border-radius', 'background-color', 'color', 'font-size', 'font-weight']; const look = e => k.map(x => getComputedStyle(e).getPropertyValue(x)).join(';');
        const sms = sheet.querySelector('.mphbac-staff-sms'), cp = q('.mphbac-staff-copy'); return { sms: sms && look(sms), copy: cp.map(look) }; })(),
      reqs: window.__reqs.map(r => r.action),
    };
  });

  console.log('-- 1. the summary on top --');
  for (const w of [320, 390, 1440]) {
    for (const [id] of X.CASES) {
      const { ctx, p } = await open({ w, id });
      const m = await read(p);
      const sum = X.NEW.details[id].summary;
      const tag = `${w}px, ${id}`;
      check(`${tag}: the cottage(s) unlabelled, centred, bold, ~20px: ${m.cottages.map(c => c.text).join(' / ')}`,
        m.cottages.map(c => c.text).join('|') === sum.cottages.join('|') && m.cottages.every(c => c.align === 'center' && +c.weight >= 700 && Math.abs(parseFloat(c.size) - 20) <= 1)
        && !m.allLabels.some(l => /^(Accommodation Type|Cottage|Unit)$/.test(l)), m.cottages);
      check(`${tag}: three tiles, equal, shaded and rounded: ${m.tiles.map(t => t.label + ' ' + t.value + (t.year ? ' ' + t.year : '')).join(' · ')}`,
        m.tiles.map(t => t.label).join() === 'Check-In,Check-Out,Nights' && Math.max(...m.tiles.map(t => t.w)) - Math.min(...m.tiles.map(t => t.w)) < 1
        && m.tiles.every(t => t.bg !== 'rgba(0, 0, 0, 0)' && parseFloat(t.radius) >= 6), m.tiles);
      check(`${tag}: every tile's value on one line, nothing clipped`, m.tiles.every(t => t.oneLine && t.fits), m.tiles.map(t => [t.value, t.oneLine, t.fits]));
      check(`${tag}: nothing in the pop-up wider than it; no sideways scroll`, !m.overflow.length && !m.hscroll, m.overflow);
      if (w === 390) {
        const want = { 801: ['Fri, Nov 6', 'Mon, Nov 9', '3'], 802: ['Wed, Sep 30', 'Sun, Oct 4', '4'], 809: ['Wed, Dec 30', 'Sat, Jan 2', '3'] }[id];
        if (want) check(`${id}: "${want[0]}" → "${want[1]}", ${want[2]} nights (weekday, month, day; check-out − check-in)`, m.tiles.map(t => t.value).join('|') === want.join('|'), m.tiles.map(t => t.value));
        if (id === 809) check('809 across New Year: no year on Dec 30 (this year), "2027" on Jan 2 — seen as "2027", read as "Sat, Jan 2, 2027"',
          m.tiles[0].year === '' && m.tiles[1].yearSeen === '2027' && m.tiles[1].srHidden && m.tiles[1].value + m.tiles[1].year === 'Sat, Jan 2, 2027', m.tiles.map(t => [t.year, t.yearSeen, t.srHidden]));
        const chips = m.chips.map(c => (c.muted ? '~' : '') + c.text).join('|');
        const wantChips = { 802: 'Booking.com|~Guest Count Not Sent', 803: 'Airbnb', 805: 'Vrbo|~Guest Count Not Sent' }[id] || '';
        check(`${id}: chips "${wantChips || '(none)'}"${X.NEW.details[id].imported ? '' : ' — a direct booking has no source chip'}`, chips === wantChips, chips);
        check(`${id}: no banner, no "count not provided" row`, m.banner === 0, m.banner);
      }
      await ctx.close();
    }
  }

  console.log('\n-- 2/3. Booking Information, the other labels, the label column --');
  for (const [id] of X.CASES) {
    const { ctx, p } = await open({ w: 390, id });
    const m = await read(p);
    const book = m.sections.find(s => s.head === 'Booking Information');
    const left = X.NEW.details[id].sections.booking;
    check(`${id}: Booking Information holds only ${left.length ? left.map(r => r.label).join(', ') : 'nothing — and its heading is not shown'}`,
      left.length ? !!book && book.labels.join() === left.map(r => r.label).join() : !book, book);
    if (id === 803) check('803: the confirmed count is a row, "4 (3 adults, 1 child)", not a chip', book && book.values[0] === '4 (3 adults, 1 child)' && !m.chips.some(c => /Guest/.test(c.text)), book);
    check(`${id}: headings as today: Booking Information / Customer Information / Notes in capitals by CSS`, m.heads.every(h => /^(Booking Information|Customer Information|Notes)$/.test(h.text) && h.tt === 'uppercase'), m.heads);
    check(`${id}: every label exactly as 0.55.0 sent it (no merged names, no new wording)`, m.allLabels.join('|') === [...X.NEW.details[id].sections.booking, ...X.NEW.details[id].sections.customer].map(r => r.label).join('|'), m.allLabels);
    check(`${id}: the label column sized to its words — as wide as its longest label (or the floor), never past 42%, the values right beside it`,
      m.cols.every(c => c.dtMax <= c.dl * 0.42 + 1 && c.ddLeft >= c.dtRight && c.ddLeft - c.dtRight <= 14
        && Math.abs(c.col - Math.min(Math.max(c.words, c.floor), c.dl * 0.42)) <= 1.5), m.cols.map(c => [Math.round(c.col), Math.round(c.words), Math.round(c.dl * 0.42)]));
    await ctx.close();
  }

  console.log('\n-- 4. notes: a box each, Copy on the right --');
  for (const w of [320, 390, 1440]) {
    const { ctx, p } = await open({ w, id: 804 });
    const m = await read(p);
    check(`${w}px, 804: three boxes, the guest's first with "From Guest", the staff notes with none`, m.notes.length === 3 && m.notes[0].tag === 'From Guest' && m.notes[0].guest && !m.notes[1].tag && !m.notes[2].tag, m.notes.map(n => n.tag));
    check(`${w}px, 804: no date and no author anywhere in Notes`, !/November|2026|am ·|pm ·|Rob Croft|Dana Admin|Customer Note/.test(m.notesText), m.notesText);
    check(`${w}px, 804: each Copy in its note's box, to the right of the text, level with its first line — not in a label column`, m.notes.every(n => n.right && n.sameRow && n.topAligned && !n.inDt), m.notes.map(n => [n.right, n.sameRow, n.topAligned]));
    check(`${w}px, 804: the text left-aligned, plain weight, its line breaks kept; shaded rounded boxes`, m.notes.every(n => n.align === 'left' && n.weight === '400' && n.bg !== 'rgba(0, 0, 0, 0)' && parseFloat(n.radius) >= 6)
      && m.notes[0].text === 'Arriving late, around 9pm.\nPlease leave the porch light on.', m.notes.map(n => [n.align, n.weight]));
    check(`${w}px, 804: named "Copy guest's note 1 of 3", "Copy note 2 of 3", "Copy note 3 of 3"`, m.notes.map(n => n.aria).join('|') === "Copy guest's note 1 of 3|Copy note 2 of 3|Copy note 3 of 3", m.notes.map(n => n.aria));
    check(`${w}px, 804: Copy the Text pill's twin`, m.copyLook.copy.length === 3 && m.copyLook.copy.every(c => c === m.copyLook.sms), [m.copyLook.sms, m.copyLook.copy[0]]);
    if (w === 390) {
      await (await p.$$('.mphbac-staff-copy'))[2].tap();
      await p.waitForTimeout(150);
      const clip = await p.evaluate(async () => { const it = (await navigator.clipboard.read())[0]; return { types: it.types, text: await (await it.getType('text/plain')).text() }; });
      check('a tap on note 3 copies its text alone, plain: ' + JSON.stringify(clip.text), clip.text === 'Guest asked about kayaks.\nTold them: life jackets in the shed.' && clip.types.join() === 'text/plain', clip);
      check('…and says "Copied"', (await p.evaluate(() => document.querySelectorAll('.mphbac-staff-copy')[2].textContent)) === 'Copied');
    }
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ w: 390, id: 805 });
    const m = await read(p);
    check('805, no notes: no Notes section at all', !m.heads.some(h => h.text === 'Notes') && m.notes.length === 0);
    await ctx.close();
  }

  console.log('\n-- 5/6. unchanged: Open in WP-Admin, the customer rows; no new request --');
  for (const [id] of X.CASES) {
    const a = await open({ w: 390, id }), b = await open({ w: 390, id, old: true });
    const [m, o] = [await read(a.p), await read(b.p)];
    const cust = async pp => pp.evaluate(() => { const s = [...document.querySelectorAll('.mphbac-staff-sheet .mphbac-staff-section')].find(x => x.querySelector('h3').textContent === 'Customer Information'); return s ? s.querySelector('dl').outerHTML : ''; });
    const adm = async pp => pp.evaluate(() => (document.querySelector('.mphbac-staff-admin') || {}).outerHTML || '');
    check(`${id}: Customer Information's rows and Open in WP-Admin, markup identical to 0.55.0's`, (await cust(a.p)) === (await cust(b.p)) && (await adm(a.p)) === (await adm(b.p)) && !!m.admin, m.admin);
    check(`${id}: the same requests as 0.55.0 (one booking answer, nothing new)`, m.reqs.join() === o.reqs.join() && m.reqs.filter(r => r === 'mphbac_staff_booking').length === 1, m.reqs);
    check(`${id}: no page errors`, a.p.__errors.length === 0, a.p.__errors);
    await a.ctx.close(); await b.ctx.close();
  }

  if (OUT) {
    const manifest = { release: '0.56.0', title: 'Booking pop-up: Summary on Top (layout C)', note: 'Sample bookings only (invented guests). BEFORE = 0.55.0, AFTER = 0.56.0, each fed by its own server code. Chromium, not a real iPhone.', items: [] };
    for (const [id, what] of X.CASES) {
      for (const w of [320, 390, 1440]) {
        const files = {};
        for (const [when, old] of [['BEFORE', true], ['AFTER', false]]) {
          const { ctx, p } = await open({ w, id, old, tall: true });
          const name = `Availability Calendar - 0.56.0 ${when} ${id} ${what.replace(/'/g, '')} ${w}px.png`;
          await (await p.$('.mphbac-staff-sheet')).screenshot({ path: path.join(OUT, name) });
          files[when.toLowerCase()] = name;
          await ctx.close();
        }
        manifest.items.push({ booking: id, case: what, width: w, before: files.before, after: files.after });
      }
    }
    fs.writeFileSync(path.join(OUT, 'Availability Calendar - 0.56.0 approval manifest.json'), JSON.stringify(manifest, null, 2));
  }

  await browser.close();
  X.cleanup();
  done();
})().catch(e => { console.error(e); X.cleanup(); process.exit(1); });
