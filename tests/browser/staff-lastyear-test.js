'use strict';
/**
 * 0.47.0 PART A — LAST YEAR ON THE CALENDAR (Rob's picks of 2026-10-16),
 * DRIVEN IN A REAL PAGE WITH THE SHIPPED (minified) staff.js, the shell and
 * strings read from the PHP, and the site's face, Raleway, loaded so every
 * fit is measured as live draws it.
 *
 *   - The switch: Compare to Last Year · Off / Behind / In Front — a radio
 *     group named by its label, each segment named by its text, the arrow
 *     keys, W1's colours, 44px segments, one line at 360 / 390 / 1280, the
 *     row no taller than 0.46.x's, Bravada's button type kept out.
 *   - Behind: exactly 0.46.0's ghosts.
 *   - In Front: above the bars, the diamonds and the icons; the source's
 *     stripes and solid edge; the "<year> · <name>" tag; a named button that
 *     opens the sheet under "Last Year · <year>", focus coming back; this
 *     year's bars faded, untappable, out of the tab order; swiping the chart
 *     still scrolls it.
 *   - One fetch: no refetch on Behind ↔ In Front, one request however fast
 *     the switch is flicked, a stale answer dropped; Off on every load (a
 *     back/forward-cache restore included); disabled in Daily and restored
 *     after; kept across navigation and the 3-minute refresh with no
 *     duplicate and no frame without its boxes; the calendar never taller.
 *
 * The 0.46.7 pixel proof (this year's bars, rows and calendar unchanged in
 * Off and Behind) is staff-lastyear-proof.js, run against a 0.46.7 tree.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const L = require('./lastyear-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'http://staff.test/';
const RGB = { direct: 'rgb(7, 135, 50)', airbnb: 'rgb(188, 0, 62)', booking: 'rgb(255, 160, 0)', vrbo: 'rgb(107, 63, 184)' };
const BLUE = 'rgb(10, 80, 178)', CORAL = 'rgb(240, 128, 128)', WHITE = 'rgb(255, 255, 255)';

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const shell = (opts = {}) => S.boardShell(Object.assign({ today: L.TODAY, cottages: L.COTTAGES, bookings: L.BOOKINGS, details: L.DETAILS, search: L.SEARCH,
    bodyStyle: 'padding:0 16px', head: S.raleway() + L.BRAVADA_BUTTON }, opts));
  const open = async ({ w = 1280, phone = w < 700, html = shell(), clock = false, motion = null } = {}) => {
    const ctx = await browser.newContext(Object.assign(phone ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } },
      motion ? { reducedMotion: motion } : {}));
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
  const settle = p => p.waitForTimeout(250);
  const mode = (p, m) => p.click(`.mphbac-staff-segbtn[data-ly="${m}"]`);
  const boxes = p => p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-ghost')].map(g => {
    const c = getComputedStyle(g), r = g.getBoundingClientRect(), t = g.querySelector('.mphbac-staff-ghost-tag'), tc = t && getComputedStyle(t);
    return { cls: g.className, col: g.style.gridColumn, row: g.style.gridRow, tag: t ? t.textContent : null, tagShown: tc ? tc.display !== 'none' : false,
      aria: g.getAttribute('aria-hidden'), label: g.getAttribute('aria-label'), tab: g.tabIndex, pe: c.pointerEvents, z: c.zIndex,
      border: c.borderTopStyle, bcol: c.borderTopColor, bw: c.borderTopWidth, bg: c.backgroundColor, img: c.backgroundImage, radius: c.borderTopLeftRadius,
      touch: c.touchAction, cursor: c.cursor, attrs: [...g.attributes].map(a => a.name).sort(),
      x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }));
  const lyReqs = p => p.evaluate(() => window.__reqs.filter(r => r.action === 'mphbac_staff_month' && r.from < '2026').map(r => r.from + '|' + r.to));

  console.log('\n-- the switch: Compare to Last Year · Off / Behind / In Front --');
  {
    const { ctx, p } = await open();
    const g = await p.evaluate(() => {
      const grp = document.querySelector('.mphbac-staff-ghostfield');
      const lab = document.getElementById(grp.getAttribute('aria-labelledby'));
      return { role: grp.getAttribute('role'), label: lab && lab.textContent, inUnder: !!grp.closest('.mphbac-staff-under'),
        segs: [...grp.querySelectorAll('.mphbac-staff-segbtn')].map(b => ({ text: b.textContent, role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), tab: b.tabIndex, tag: b.tagName })),
        old: !!document.querySelector('.mphbac-staff-ghosts, input[role="switch"]') };
    });
    check('a radio group named by its visible label, "Compare to Last Year", where the switch was (under the calendar)',
      g.role === 'radiogroup' && g.label === 'Compare to Last Year' && g.inUnder && !g.old, g);
    check('three segments, real buttons with role radio, reading "Off", "Behind", "In Front" (Title Case)',
      JSON.stringify(g.segs.map(s => s.text)) === '["Off","Behind","In Front"]' && g.segs.every(s => s.role === 'radio' && s.tag === 'BUTTON'), g.segs);
    const named = await Promise.all(['Off', 'Behind', 'In Front'].map(n => p.getByRole('radio', { name: n, exact: true }).count()));
    const grpNamed = await p.getByRole('radiogroup', { name: 'Compare to Last Year', exact: true }).count();
    check('...each segment\'s accessible name IS its visible text, and the group\'s is its label', named.every(n => n === 1) && grpNamed === 1, [named, grpNamed]);
    check('OFF ON LOAD: Off checked and the one tab stop; no boxes', g.segs[0].checked === 'true' && g.segs[1].checked === 'false' && g.segs[2].checked === 'false'
      && g.segs.map(s => s.tab).join() === '0,-1,-1' && (await boxes(p)).length === 0, g.segs);
    // W1's look, at rest.
    const look = await p.evaluate(() => {
      const seg = document.querySelector('.mphbac-staff-seg'), ring = getComputedStyle(seg, '::after');
      const st = b => { const c = getComputedStyle(b); return { bg: c.backgroundColor, fg: c.color, h: b.getBoundingClientRect().height, ff: c.fontFamily, tt: c.textTransform, ls: c.letterSpacing, fs: c.fontSize, radius: c.borderTopLeftRadius }; };
      return { ring: [ring.borderTopWidth, ring.borderTopStyle, ring.borderTopColor, ring.borderTopLeftRadius], segH: seg.getBoundingClientRect().height, segBg: getComputedStyle(seg).backgroundColor,
        segs: [...seg.querySelectorAll('.mphbac-staff-segbtn')].map(st), board: getComputedStyle(document.querySelector('.mphbac-staff')).fontFamily };
    });
    check('W1: a 2px #0A50B2 ring, fully rounded', look.ring[0] === '2px' && look.ring[1] === 'solid' && look.ring[2] === BLUE && parseFloat(look.ring[3]) >= 22, look.ring);
    check('...the chosen segment filled #0A50B2 with white text; the others white with #0A50B2 text',
      look.segs[0].bg === BLUE && look.segs[0].fg === WHITE && look.segs.slice(1).every(s => s.bg === 'rgba(0, 0, 0, 0)' && s.fg === BLUE) && look.segBg === WHITE, look.segs);
    check('...every segment 44px tall, and the whole control 44px — the 0.46.x switch row\'s height', look.segs.every(s => s.h >= 44) && look.segH === 44, [look.segH, look.segs.map(s => s.h)]);
    check('...in the board\'s face (Raleway), not Bravada\'s button type: no Pavanam, no capitals, no letter-spacing, its own size',
      look.segs.every(s => s.ff === look.board && /Raleway/.test(s.ff) && s.tt === 'none' && s.ls === 'normal' && s.fs === '14px'), look.segs);
    // Hover (a computer only) and keyboard focus.
    await p.hover('.mphbac-staff-segbtn[data-ly="behind"]');
    const hov = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.mphbac-staff-segbtn[data-ly="behind"]')); return [c.backgroundColor, c.color, c.borderTopLeftRadius]; });
    check('hover: #F08080 with white text (the nav\'s coral)', hov[0] === CORAL && hov[1] === WHITE, hov);
    await p.mouse.move(0, 0);
    await p.focus('.mphbac-staff-segbtn[data-ly="off"]');
    await p.keyboard.press('ArrowRight');
    let k = await p.evaluate(() => ({ focus: document.activeElement.getAttribute('data-ly'), checked: [...document.querySelectorAll('.mphbac-staff-segbtn')].map(b => b.getAttribute('aria-checked')).join(),
      tabs: [...document.querySelectorAll('.mphbac-staff-segbtn')].map(b => b.tabIndex).join(), ring: getComputedStyle(document.activeElement).outlineStyle,
      ringC: getComputedStyle(document.activeElement).outlineColor, bg: getComputedStyle(document.activeElement).backgroundColor, r: getComputedStyle(document.activeElement).borderTopLeftRadius }));
    check('→ moves to Behind and chooses it; it becomes the tab stop', k.focus === 'behind' && k.checked === 'false,true,false' && k.tabs === '-1,0,-1', k);
    check('...the board\'s focus ring (2px #0f6dbf), and the kit\'s `button:focus` coral never reaches it', k.ring === 'solid' && k.ringC === 'rgb(15, 109, 191)' && k.bg === BLUE && k.r === '0px', k);
    await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
    k = await p.evaluate(() => document.activeElement.getAttribute('data-ly') + ' ' + document.querySelector('.mphbac-staff-segbtn[aria-checked="true"]').getAttribute('data-ly'));
    check('→ twice more wraps round to Off; End goes to In Front, Home to Off, ← from Off to In Front', k === 'off off', k);
    await p.keyboard.press('End');
    const e1 = await p.evaluate(() => document.activeElement.getAttribute('data-ly'));
    await p.keyboard.press('Home');
    const e2 = await p.evaluate(() => document.activeElement.getAttribute('data-ly'));
    await p.keyboard.press('ArrowLeft');
    const e3 = await p.evaluate(() => document.activeElement.getAttribute('data-ly'));
    check('...End, Home, ←', [e1, e2, e3].join() === 'front,off,front', [e1, e2, e3]);
    await ctx.close();
  }

  console.log('\n-- one line at 360 / 390 / 1280, never taller than 0.46.x\'s row --');
  for (const w of [360, 390, 1280]) {
    const { ctx, p } = await open({ w });
    const m = await p.evaluate(() => {
      const R = s => document.querySelector(s).getBoundingClientRect();
      const f = R('.mphbac-staff-ghostfield'), lab = R('.mphbac-staff-ghostlabel'), seg = R('.mphbac-staff-seg'), g = R('.mphbac-staff-grid');
      const btns = [...document.querySelectorAll('.mphbac-staff-segbtn')];
      return { oneLine: Math.abs((lab.top + lab.bottom) / 2 - (seg.top + seg.bottom) / 2) < 1 && seg.left >= lab.right, fieldH: Math.round(f.height),
        clipped: btns.filter(b => b.scrollWidth > b.clientWidth + 0.5).map(b => b.textContent), inside: seg.right <= g.right + 0.5 && f.left >= g.left - 0.5,
        pad: getComputedStyle(btns[0]).paddingLeft, under: Math.round(f.top - g.bottom), hscroll: document.documentElement.scrollWidth > innerWidth };
    });
    check(`${w}px: the label and its three segments on ONE line, inside the calendar's width, nothing clipped, no sideways scroll`,
      m.oneLine && !m.clipped.length && m.inside && !m.hscroll, m);
    check(`${w}px: the control's row is 44px — the 0.46.x switch row's height — directly under the calendar`, m.fieldH === 44 && m.under >= 0 && m.under <= 12, m);
    console.log(`   ${w}px: segment padding ${m.pad}`);
    await ctx.close();
  }

  console.log('\n-- Behind: exactly 0.46.0\'s ghosts --');
  {
    const { ctx, p } = await open();
    await mode(p, 'behind'); await settle(p);
    const bs = await boxes(p);
    // Nov 2025 a year on: Zed #22, Yan #23, Maximilian #31, Wes #32, Val #33.
    check('last November\'s 5 stays, in their cottages\' first rows, in the same columns as their dates a year on', bs.length === 5, bs.map(b => [b.row, b.col]));
    check('...grey and dashed, behind the bars (z-index 1), aria-hidden, no tab stop, no taps, NO name — no aria-label, no tag shown, no source colour',
      bs.every(b => b.border === 'dashed' && b.bcol === 'rgba(51, 65, 85, 0.55)' && b.bg === 'rgba(51, 65, 85, 0.06)' && b.img === 'none' && b.z === '1'
        && b.aria === 'true' && b.tab === -1 && b.pe === 'none' && b.label === null && !b.tagShown), bs);
    const hit = await p.evaluate(bs => bs.map(b => { const e = document.elementFromPoint(b.cx, b.cy); return e ? e.className : ''; }), bs);
    check('...a tap where a box is drawn lands on what is beneath — a bar or a day — never on the box', hit.every(c => !/ghost/.test(c)), hit);
    const bars = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].map(b => [getComputedStyle(b).opacity, b.inert, b.tabIndex]));
    check('...and this year\'s bars untouched: full strength, tappable, in the tab order', bars.every(b => b[0] === '1' && b[1] === false && b[2] === 0), bars);
    const reqs = await lyReqs(p);
    check('fetched once, through the same gated range endpoint: Nov 1 – 30, 2025', JSON.stringify(reqs) === '["2025-11-01|2025-11-30"]', reqs);
    await mode(p, 'front'); await settle(p); await mode(p, 'behind'); await settle(p);
    const again = await boxes(p);
    check('...and back to Behind from In Front: hidden, unnamed, out of the tab order and untappable again, the bars whole',
      again.length === 5 && again.every(b => b.aria === 'true' && b.label === null && b.tab === -1 && b.pe === 'none' && b.z === '1' && b.border === 'dashed' && !b.tagShown)
      && await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].every(b => !b.inert && b.tabIndex === 0 && getComputedStyle(b).opacity === '1')), again);
    await ctx.close();
  }

  console.log('\n-- In Front (Rob\'s pick T2) --');
  {
    const { ctx, p } = await open();
    await mode(p, 'front'); await settle(p);
    const bs = await boxes(p);
    const by = Object.fromEntries(bs.map(b => [b.label.split(':')[1].split(',')[0].trim(), b]));
    check('5 boxes, each a named button: "Last year: <name>, <check-in> to <check-out> <year>, <channel>"',
      bs.length === 5 && by['Zed Zane'].label === 'Last year: Zed Zane, Nov 2 to Nov 9 2025, Airbnb' && by['Yan Yu'].label === 'Last year: Yan Yu, Nov 5 to Nov 6 2025, Booking.com'
      && by['Wes West'].label === 'Last year: Wes West, Nov 1 to Nov 12 2025, Direct', bs.map(b => b.label));
    check('...not hidden, in the tab order, tappable, a pointer, and swiping across one still scrolls (touch-action: manipulation)',
      bs.every(b => b.aria === null && b.tab === 0 && b.pe === 'auto' && b.cursor === 'pointer' && b.touch === 'manipulation'), bs);
    check('...above this year\'s bars (z-index 2 and drawn after them), on the bars\' own top and height',
      await p.evaluate(() => { const b = document.querySelector('.mphbac-staff-bar[data-booking-id="1"]').getBoundingClientRect(), g = document.querySelector('.mphbac-staff-ghost').getBoundingClientRect();
        return Math.abs(b.top - g.top) < 0.5 && Math.abs(b.height - g.height) < 0.5; }) && bs.every(b => b.z === '2'));
    check('the CHANNEL\'S COLOUR, per source: a 2px SOLID edge in it, the bars\' 6px radius',
      bs.every(b => b.border === 'solid' && b.bw === '2px' && b.radius === '6px') && by['Zed Zane'].bcol === RGB.airbnb && by['Yan Yu'].bcol === RGB.booking
      && by['Maximilian Wolfeschlegelstein'].bcol === RGB.vrbo && by['Wes West'].bcol === RGB.direct, bs.map(b => [b.cls, b.bcol, b.border]));
    check('...fine 135° stripes of two pale tints of it, ~3px each, mixed from the source token (color-mix)',
      bs.every(b => /^repeating-linear-gradient\(135deg, /.test(b.img) && /0px, .* 3px, .* 3px, .* 6px\)$/.test(b.img)), bs.map(b => b.img));
    const code = S.cssCode();
    check('...and where color-mix() is missing, one flat pale tint of the same token (the rule before the @supports block)',
      /is-ly-front \.mphbac-staff-ghost\.mphbac-staff-ghost \{[^}]*background-color: var\(--staff-bar[^}]*background-image: linear-gradient\(rgba\(255, 255, 255, 0\.84\)/.test(code)
      && /@supports \(color: color-mix\(in srgb, red 50%, white\)\) \{\s*\.mphbac-staff \.mphbac-staff-chart\.is-ly-front \.mphbac-staff-ghost\.mphbac-staff-ghost \{\s*background-color: #ffffff;\s*background-image: repeating-linear-gradient\(135deg,\s*color-mix\(in srgb, var\(--staff-bar/.test(code));
    // Over EVERYTHING of this year's: a bar, a turnover diamond, an icon.
    // In Front they take no pointer events, so a hit test would pass them
    // by whatever is painted: for the measurement only, they take it back,
    // and the topmost thing at each point is the one painted there.
    await p.addStyleTag({ content: '.mphbac-staff-bar, .mphbac-staff-bar *, .mphbac-staff-turn { pointer-events: auto !important; }' });
    const over = await p.evaluate(() => {
      const at = el => { const r = el.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && e.closest('.mphbac-staff-ghost') ? 'box' : (e ? e.className.baseVal !== undefined ? 'svg' : e.className : ''); };
      return { bar: at(document.querySelector('.mphbac-staff-bar[data-booking-id="1"]')), turn: at(document.querySelector('.mphbac-staff-turn[data-day="2026-11-08"]')),
        icon: at(document.querySelector('.mphbac-staff-bar[data-booking-id="1"] .mphbac-staff-ico')) };
    });
    check('a point on Amy\'s bar, on the 8th\'s turnover diamond and on her paw icon each hits Zed\'s box — nothing of this year\'s is painted above it', over.bar === 'box' && over.turn === 'box' && over.icon === 'box', over);
    await p.evaluate(() => [...document.querySelectorAll('style')].pop().remove());
    // The tag.
    const tag = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-ghost-tag')].map(t => { const c = getComputedStyle(t);
      return { text: t.textContent, ff: c.fontFamily, fw: c.fontWeight, fs: c.fontSize, fg: c.color, bg: c.backgroundColor, ws: c.whiteSpace, to: c.textOverflow,
        clipped: t.scrollWidth > t.clientWidth + 0.5, inBox: t.getBoundingClientRect().right <= t.parentNode.getBoundingClientRect().right + 0.5, oneLine: t.getBoundingClientRect().height < 24 }; }));
    const barLabelFs = await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-staff-bar-label')).fontSize);
    check('the tag: "<year> · <name>" — the bars\' name rule ("Zed Zane", 7 nights, in full)', tag.some(t => t.text === '2025 · Zed Zane'), tag.map(t => t.text));
    check('...white, near-black Raleway BOLD at the bar label\'s size, one line that clips with an ellipsis, inside its box',
      tag.every(t => /Raleway/.test(t.ff) && t.fw === '700' && t.fs === barLabelFs && t.fg === 'rgb(17, 17, 17)' && t.bg === WHITE && t.ws === 'nowrap' && t.to === 'ellipsis' && t.oneLine && t.inBox), [barLabelFs, tag]);
    // This year: faded, untappable, out of the tab order — but still reachable every other way.
    const bars = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-bar')].map(b => ({ id: b.getAttribute('data-booking-id'), op: getComputedStyle(b).opacity,
      pe: getComputedStyle(b).pointerEvents, inert: b.inert, tab: b.tabIndex })));
    const turns = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-turn')].map(t => getComputedStyle(t).opacity));
    check('this year\'s bars (their labels and icons inside) and the turnover diamonds fade to 22%',
      bars.every(b => b.op === '0.22') && turns.length && turns.every(o => o === '0.22'), [bars, turns]);
    check('...take no taps and no focus (pointer-events none, inert, tabindex -1)', bars.every(b => b.pe === 'none' && b.inert && b.tab === -1), bars);
    const fay = await p.evaluate(() => { const r = document.querySelector('.mphbac-staff-bar[data-booking-id="6"]').getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e ? e.className : ''; });
    check('...a tap on a bar no box covers (Fay, #36) reaches nothing of hers', !/staff-bar/.test(fay), fay);
    await p.click('.mphbac-staff-bar[data-booking-id="6"]', { force: true }); await settle(p);
    check('...and opens no sheet', await p.evaluate(() => document.querySelector('.mphbac-staff-sheet').hidden));
    const tabs = [];
    await p.focus('.mphbac-staff-segbtn[data-ly="front"]');
    for (let i = 0; i < 12; i++) { await p.keyboard.press('Shift+Tab'); tabs.push(await p.evaluate(() => document.activeElement.className)); }
    check('...the keyboard meets the five boxes and never a bar', tabs.filter(c => /mphbac-staff-ghost/.test(c)).length === 5 && !tabs.some(c => /mphbac-staff-bar/.test(c)), tabs);
    // Search still opens a current booking.
    await p.fill('.mphbac-staff-q', 'amy'); await p.waitForSelector('.mphbac-staff-result'); await p.click('.mphbac-staff-result'); await settle(p);
    const viaSearch = await p.evaluate(() => ({ open: !document.querySelector('.mphbac-staff-sheet').hidden, title: document.querySelector('.mphbac-staff-sheet-title').textContent,
      ly: !!document.querySelector('.mphbac-staff-sheet-ly') }));
    check('...search still opens a current booking\'s sheet — "Booking #1", no "Last Year" heading', viaSearch.open && viaSearch.title === 'Booking #1' && !viaSearch.ly, viaSearch);
    await p.keyboard.press('Escape'); await settle(p);
    await ctx.close();
  }

  console.log('\n-- the sheet for a last-year booking --');
  {
    const { ctx, p } = await open();
    await mode(p, 'front'); await settle(p);
    const zed = '.mphbac-staff-ghost[aria-label^="Last year: Zed Zane"]';
    await p.click(zed); await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-section'); await settle(p);
    const sh = await p.evaluate(() => {
      const s = document.querySelector('.mphbac-staff-sheet'), k = s.querySelector('.mphbac-staff-sheet-ly');
      const ids = (s.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean);
      return { title: s.querySelector('.mphbac-staff-sheet-title').textContent, kicker: k && k.textContent, first: k && k === s.querySelector('.mphbac-staff-sheet-body').firstElementChild,
        grey: k && getComputedStyle(k).color, named: ids.map(i => (document.getElementById(i) || {}).textContent).join(' '),
        rows: [...s.querySelectorAll('dt')].map(d => d.textContent), req: window.__reqs.filter(r => r.action === 'mphbac_staff_booking').map(r => r.booking_id) };
    });
    check('tapping Zed\'s box opens THE SAME SHEET, from the same gated booking endpoint, for booking #11', sh.title === 'Booking #11' && JSON.stringify(sh.req) === '["11"]', sh);
    check('...under a grey "Last Year · 2025" heading, first in it, and part of the dialog\'s name', sh.kicker === 'Last Year · 2025' && sh.first && sh.grey === 'rgb(91, 100, 112)' && /^Last Year · 2025/.test(sh.named), sh);
    check('...with full details, as for a current booking (Rob\'s pick)', JSON.stringify(sh.rows) === '["Check-In","Check-Out","Status","Name","Phone"]', sh.rows);
    await p.click('.mphbac-staff-close'); await settle(p);
    const back = await p.evaluate(() => (document.activeElement.getAttribute('aria-label') || '') + '|' + document.activeElement.className);
    check('Close returns focus to the box', /^Last year: Zed Zane/.test(back) && /mphbac-staff-ghost/.test(back), back);
    await p.keyboard.press('Enter'); await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-section'); await settle(p);
    check('...and Enter on it opens it again (a real button)', await p.evaluate(() => document.querySelector('.mphbac-staff-sheet-title').textContent === 'Booking #11'));
    await p.keyboard.press('Escape'); await settle(p);
    // A current booking opened afterwards carries no "Last Year".
    await mode(p, 'off'); await settle(p);
    await p.click('.mphbac-staff-bar[data-booking-id="1"]'); await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-section'); await settle(p);
    const cur = await p.evaluate(() => ({ t: document.querySelector('.mphbac-staff-sheet-title').textContent, ly: !!document.querySelector('.mphbac-staff-sheet-ly'),
      named: document.querySelector('.mphbac-staff-sheet').getAttribute('aria-labelledby') }));
    check('...and this year\'s booking, opened next, has no "Last Year" heading in its sheet or its name', cur.t === 'Booking #1' && !cur.ly && !/-ly/.test(cur.named || ''), cur);
    await ctx.close();
  }

  console.log('\n-- the year on the tag is each booking\'s own: a Dec–Jan week --');
  {
    const { ctx, p } = await open();
    await p.selectOption('.mphbac-staff-period', 'week');
    await p.fill('.mphbac-staff-goto', '2026-12-30'); await p.dispatchEvent('.mphbac-staff-goto', 'change'); await settle(p);
    await mode(p, 'front'); await settle(p);
    const bs = await boxes(p);
    const title = await p.evaluate(() => document.querySelector('.mphbac-staff-title').textContent);
    check(`the week of ${title}: Una (Dec 2025) tagged 2025, Ola (Jan 2026) tagged 2026 — two years at once`,
      bs.length === 2 && bs.some(b => b.tag === '2025 · Una Upton' || b.tag.startsWith('2025 · Una')) && bs.some(b => b.tag.startsWith('2026 · Ola')), bs.map(b => [b.tag, b.label]));
    check('...named with their own years too', bs.some(b => b.label === 'Last year: Una Upton, Dec 28 to Dec 31 2025, Direct') && bs.some(b => b.label === 'Last year: Ola Orr, Jan 1 to Jan 3 2026, Airbnb'), bs.map(b => b.label));
    await ctx.close();
  }

  console.log('\n-- the tag at narrow widths: clipped with an ellipsis; the year alone on a box too narrow for a name --');
  for (const w of [360, 390]) {
    const { ctx, p } = await open({ w });
    await mode(p, 'front'); await settle(p);
    const t = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-ghost')].map(g => { const tg = g.querySelector('.mphbac-staff-ghost-tag');
      return { who: g.getAttribute('aria-label').split(',')[0], text: tg.textContent, clipped: tg.scrollWidth > tg.clientWidth + 0.5, to: getComputedStyle(tg).textOverflow,
        boxW: Math.round(g.getBoundingClientRect().width) }; }));
    const yan = t.find(x => /Yan Yu/.test(x.who)), max = t.find(x => /Maximilian/.test(x.who));
    check(`${w}px: Yan's one-night box (${yan.boxW}px) shows the year alone, "2025", whole`, yan.text === '2025' && !yan.clipped, yan);
    check(`${w}px: Maximilian's two-night box (${max.boxW}px) shows "2025 · Maximilian W.", clipped with an ellipsis inside it`,
      max.text === '2025 · Maximilian W.' && max.clipped && max.to === 'ellipsis', max);
    await ctx.close();
  }

  console.log('\n-- one fetch: Behind ↔ In Front never refetches or redraws --');
  {
    const { ctx, p } = await open();
    await mode(p, 'behind'); await settle(p);
    const first = await p.evaluate(() => { window.__boxes = [...document.querySelectorAll('.mphbac-staff-ghost')]; return window.__reqs.length; });
    for (const m of ['front', 'behind', 'front', 'behind', 'front']) { await mode(p, m); await p.waitForTimeout(40); }
    const after = await p.evaluate(() => ({ reqs: window.__reqs.length, same: [...document.querySelectorAll('.mphbac-staff-ghost')].every((g, i) => g === window.__boxes[i])
      && document.querySelectorAll('.mphbac-staff-ghost').length === window.__boxes.length }));
    check('five switches: no request, and the very same box elements (switched, never rebuilt)', after.reqs === first && after.same, [first, after]);
    await ctx.close();
  }
  {
    const { ctx, p } = await open();
    await p.evaluate(() => { window.__fetchDelay = 400; });
    await mode(p, 'behind'); await mode(p, 'front'); await mode(p, 'off'); await mode(p, 'behind'); await mode(p, 'front');
    await p.waitForTimeout(900);
    const reqs = await lyReqs(p), n = (await boxes(p)).length;
    check('flicked — Behind, In Front, Off, Behind, In Front — while the first answer is still on its way: ONE request for last year, and its boxes drawn once', reqs.length === 1 && n === 5, [reqs, n]);
    await mode(p, 'off'); await mode(p, 'behind'); await p.waitForTimeout(900);
    check('...Off and back after it has come: drawn again from what the page holds, no second request', (await lyReqs(p)).length === 1 && (await boxes(p)).length === 5, await lyReqs(p));
    await ctx.close();
  }

  console.log('\n-- a stale answer is dropped --');
  {
    const { ctx, p } = await open();
    await p.evaluate(() => { window.__fetchDelay = 500; });
    await mode(p, 'behind');
    await p.click('.mphbac-staff-next');               // December, before November 2025's answer is back
    await p.waitForTimeout(1500);
    const bs = await boxes(p);
    check('November\'s answer, back after the move to December, draws nothing: December shows only last December\'s box (Una)', bs.length === 1, bs.map(b => b.col));
    await ctx.close();
  }
  {
    // A fresh page, so last year's November is not yet held: its answer
    // really is still out when Off is chosen.
    const { ctx, p } = await open();
    await p.evaluate(() => { window.__fetchDelay = 500; });
    await mode(p, 'behind');
    await p.waitForTimeout(50);
    await mode(p, 'off');
    await p.waitForTimeout(1200);
    const n = (await boxes(p)).length, r = await lyReqs(p);
    check('...and one that comes back after Off draws nothing either', n === 0 && r.length === 1, [n, r]);
    await ctx.close();
  }

  console.log('\n-- Off on every load; disabled in Daily; kept across navigation and the refresh --');
  {
    const { ctx, p } = await open();
    await mode(p, 'front'); await settle(p);
    await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await settle(p);
    const bf = await p.evaluate(() => ({ on: document.querySelector('.mphbac-staff-segbtn[aria-checked="true"]').getAttribute('data-ly'), boxes: document.querySelectorAll('.mphbac-staff-ghost').length,
      front: document.querySelector('.mphbac-staff-chart').classList.contains('is-ly-front'), bars: [...document.querySelectorAll('.mphbac-staff-bar')].every(b => !b.inert && getComputedStyle(b).opacity === '1') }));
    check('a page brought back from the back/forward cache: Off, no boxes, this year\'s bars whole again', bf.on === 'off' && bf.boxes === 0 && !bf.front && bf.bars, bf);
    await mode(p, 'front'); await settle(p);
    await p.reload(); await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar')); await settle(p);
    check('...and a reload: Off again', await p.evaluate(() => document.querySelector('.mphbac-staff-segbtn[aria-checked="true"]').getAttribute('data-ly') === 'off' && !document.querySelector('.mphbac-staff-ghost')));
    // Daily.
    await mode(p, 'front'); await settle(p);
    await p.selectOption('.mphbac-staff-period', 'day'); await settle(p);
    const day = await p.evaluate(() => ({ dis: [...document.querySelectorAll('.mphbac-staff-segbtn')].every(b => b.disabled), grp: document.querySelector('.mphbac-staff-ghostfield').getAttribute('aria-disabled'),
      op: getComputedStyle(document.querySelector('.mphbac-staff-seg')).opacity, still: document.querySelector('.mphbac-staff-segbtn[aria-checked="true"]').getAttribute('data-ly') }));
    check('Daily (no bars): every segment disabled, the group too, faded — and In Front still the choice', day.dis && day.grp === 'true' && day.op === '0.4' && day.still === 'front', day);
    await p.selectOption('.mphbac-staff-period', 'month'); await settle(p);
    const back = await p.evaluate(() => ({ en: [...document.querySelectorAll('.mphbac-staff-segbtn')].every(b => !b.disabled), n: document.querySelectorAll('.mphbac-staff-ghost').length,
      front: document.querySelector('.mphbac-staff-chart').classList.contains('is-ly-front'), inert: [...document.querySelectorAll('.mphbac-staff-bar')].every(b => b.inert) }));
    check('...leaving Daily: In Front again, boxes and faded bars back', back.en && back.n === 5 && back.front && back.inert, back);
    // Navigation.
    await p.click('.mphbac-staff-next'); await settle(p);
    const dec = await boxes(p);
    await p.click('.mphbac-staff-prev'); await settle(p);
    const nov = await boxes(p);
    check('navigation keeps the mode: December\'s box In Front, then November\'s five again — none twice',
      dec.length === 1 && dec[0].label && nov.length === 5 && new Set(nov.map(b => b.row + b.col)).size === 5 && nov.every(b => b.tab === 0), [dec.length, nov.length]);
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ clock: true });
    await mode(p, 'front'); await p.clock.runFor(500);
    const before = await p.evaluate(() => ({ n: document.querySelectorAll('.mphbac-staff-ghost').length, reqs: window.__reqs.length,
      ly: window.__reqs.filter(r => r.from < '2026').length }));
    // Every chart the refresh swaps in must carry its boxes at that moment.
    await p.evaluate(() => { window.__swaps = []; new MutationObserver(() => { const c = document.querySelector('.mphbac-staff-grid').firstChild;
      if (c && c.classList) window.__swaps.push([c.querySelectorAll('.mphbac-staff-ghost').length, c.classList.contains('is-ly-front')]); })
      .observe(document.querySelector('.mphbac-staff-grid'), { childList: true }); });
    await p.clock.fastForward(3 * 60 * 1000 + 1000);
    for (let i = 0; i < 40; i++) await p.clock.runFor(50);
    const after = await p.evaluate(() => ({ n: document.querySelectorAll('.mphbac-staff-ghost').length, reqs: window.__reqs.length, ly: window.__reqs.filter(r => r.from < '2026').length,
      swaps: window.__swaps, on: document.querySelector('.mphbac-staff-segbtn[aria-checked="true"]').getAttribute('data-ly') }));
    check('the 3-minute refresh ran (this year fetched again) and kept In Front', after.reqs > before.reqs && after.on === 'front', [before, after]);
    check('...with the same 5 boxes — no duplicate — and no second request for last year', after.n === 5 && after.ly === before.ly, [before, after]);
    check('...and no flicker: the new chart came in WITH its boxes, In Front, in the same step', after.swaps.length >= 1 && after.swaps.every(s => s[0] === 5 && s[1]), after.swaps);
    await mode(p, 'front'); await p.clock.runFor(300);
    check('...and tapping In Front again on the refreshed chart still leaves 5 boxes, none twice', await p.evaluate(() => document.querySelectorAll('.mphbac-staff-ghost').length) === 5);
    await ctx.close();
  }

  console.log('\n-- the calendar never grows; swiping still scrolls it; the fade --');
  {
    const { ctx, p } = await open({ w: 390 });
    const h = async () => p.evaluate(() => [document.querySelector('.mphbac-staff-grid').getBoundingClientRect().height, document.querySelector('.mphbac-staff-chart').scrollHeight,
      [...document.querySelectorAll('.mphbac-staff-rowlabel')].map(r => r.getBoundingClientRect().height).join()].join('|'));
    const off = await h(); await mode(p, 'behind'); await settle(p); const behind = await h(); await mode(p, 'front'); await settle(p); const front = await h();
    check('the calendar\'s height, the chart\'s and every row\'s: identical in Off, Behind and In Front', off === behind && behind === front, [off, behind, front]);
    // A point on Wes's box (#32, Nov 1 – 12) where it is on screen, right
    // of the pinned cottage column.
    const pt = await p.evaluate(() => { const g = document.querySelector('.mphbac-staff-ghost[aria-label^="Last year: Wes West"]').getBoundingClientRect();
      const grid = document.querySelector('.mphbac-staff-grid').getBoundingClientRect(), lw = document.querySelector('.mphbac-staff-rowlabel').getBoundingClientRect().right;
      const x = Math.min(Math.max(g.left, lw) + 30, grid.right - 10), y = g.top + g.height / 2;
      const e = document.elementFromPoint(x, y); return { x, y, on: !!(e && e.closest('.mphbac-staff-ghost')) }; });
    const x0 = await p.evaluate(() => document.querySelector('.mphbac-staff-grid').scrollLeft);
    const cdp = await ctx.newCDPSession(p);
    const touch = x => [{ x: Math.round(x), y: Math.round(pt.y), id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(pt.x) });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(pt.x - 16 * i) }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(p);
    const x1 = await p.evaluate(() => document.querySelector('.mphbac-staff-grid').scrollLeft);
    const sheetShut = await p.evaluate(() => document.querySelector('.mphbac-staff-sheet').hidden);
    check('a touch swipe that STARTS ON a box (In Front) scrolls the chart sideways — and opens nothing', pt.on && x1 > x0 + 50 && sheetShut, [pt, x0, x1, sheetShut]);
    const tr = await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-staff-bar')).transition);
    check('...this year\'s bars fade over a short 0.15s', /opacity 0\.15s/.test(tr), tr);
    await ctx.close();
    const rm = await open({ motion: 'reduce' });
    const tr2 = await rm.p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-staff-bar')).transitionDuration);
    check('...and change at once under prefers-reduced-motion', tr2 === '0s', tr2);
    await rm.ctx.close();
  }

  console.log('\n-- privacy: nothing kept, nothing more on a box than its tag and its name --');
  {
    const { ctx, p } = await open();
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    for (const m of ['behind', 'front', 'off', 'front']) { await mode(p, m); await settle(p); }
    const st = await p.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length }));
    check('switching writes nothing to localStorage or sessionStorage', st.ls === 0 && st.ss === 0, st);
    const bs = await boxes(p);
    check('a box carries class, type, style and its name — no data-* attribute, no title, no booking number',
      bs.every(b => JSON.stringify(b.attrs) === '["aria-label","class","style","type"]'), bs.map(b => b.attrs));
    const text = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-ghost')].map(g => [g.textContent, g.querySelector('.mphbac-staff-ghost-tag').textContent]));
    check('...and no text but its tag', text.every(t => t[0] === t[1]), text);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
