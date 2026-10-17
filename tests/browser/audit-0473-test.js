'use strict';
/**
 * 0.47.3 — THE WD'S AUDIT, IN THE BROWSER (fixes 3, 6 and 10).
 *
 *   6  The page's viewport meta is the page's: neither script adds
 *      viewport-fit=cover to it any more — checked on the public calendar
 *      (every pop-up opened) and the staff board (the sheet opened).
 *   10 At 360px every tappable target this release touched answers taps over
 *      a full 44px and LOOKS EXACTLY AS IT DID: the gallery's ‹ › arrows (36px
 *      discs), the Stats ⓘ (24px), "More Info" (37px), the sheet's phone
 *      link (18px) and "Text" pill (36px). "As it did" is measured: the same
 *      page with this release's hit-area rules taken back out (the 0.47.2
 *      arrows restored) is screenshotted and compared pixel for pixel.
 *   3  The board, answered the endpoint's new error for a failed query (500,
 *      success: false), says "Could not load bookings. Please try again." —
 *      never "No bookings in this period".
 * Real pages: the public widget through tests/render (the plugin's PHP and
 * shipped widget.min.js), the staff board through staff-harness.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const S = require('./staff-harness.js');
const SH = require('../render/shoot.js');
const L = require('./lastyear-fixture.js');
const { check, done } = H.reporter();
const PLUGIN = require('path').resolve(__dirname, '../../mphb-availability-calendar');

// Elementor's image-carousel arrows exactly as live serves them (its
// frontend CSS, read off the live page for this release), and the markup.
const EL_SWIPER_CSS = `<style>.elementor-swiper-button{color:hsl(0 0% 93% / .9);cursor:pointer;display:inline-flex;font-size:25px;position:absolute;top:50%;transform:translateY(-50%);z-index:1}
.elementor-swiper-button-prev{left:10px}.elementor-swiper-button-next{right:10px}.elementor-swiper-button{top:calc(50% - 30px / 2)}.elementor-swiper-button-prev{left:0}.elementor-swiper-button-next{right:0}</style>`;
const SWIPER = `<div class="t-car swiper" style="position:relative;height:200px;background:#9ab">
 <div class="elementor-swiper-button elementor-swiper-button-prev" role="button" tabindex="0" aria-label="Previous"><svg width="10" height="10"></svg></div>
 <div class="elementor-swiper-button elementor-swiper-button-next" role="button" tabindex="0" aria-label="Next"><svg width="10" height="10"></svg></div></div>`;
// This release's hit-area rules, taken back out — the 0.47.2 look.
const UNDO = `<style id="t-undo">
@media (max-width: 600px) { .mphbac-info-body .elementor-swiper-button::after { content: none !important; } }
.mphbac-staff-kpi-more { z-index: auto !important; }
.mphbac-info-view-link.mphbac-info-view-link::after, .mphbac-staff .mphbac-staff-tip.mphbac-staff-tip::after,
.mphbac-staff-sheet.mphbac-staff-sheet .mphbac-staff-tel::after, .mphbac-staff-sheet.mphbac-staff-sheet .mphbac-staff-sms::after { content: none !important; }
</style>`;

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const pixels = async (page, a, b) => page.evaluate(async ([a, b]) => {
    const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const [x, y] = [await load(a), await load(b)];
    if (x.width !== y.width || x.height !== y.height) return -1;
    const c = document.createElement('canvas'); c.width = x.width; c.height = x.height; const g = c.getContext('2d');
    g.drawImage(x, 0, 0); const p = g.getImageData(0, 0, c.width, c.height).data; g.clearRect(0, 0, c.width, c.height); g.drawImage(y, 0, 0); const q = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) n++; return n;
  }, [a.toString('base64'), b.toString('base64')]);
  // Does a tap at each point land on el (or inside it)?
  const reach = (page, sel, pts) => page.evaluate(([sel, pts]) => {
    const el = document.querySelector(sel), r = el.getBoundingClientRect();
    return pts.map(([dx, dy]) => { const x = r.left + r.width / 2 + dx, y = r.top + r.height / 2 + dy; const e = document.elementFromPoint(x, y); return !!(e && (e === el || el.contains(e))); });
  }, [sel, pts]);

  console.log('\n-- the public calendar at 360px: the page\'s viewport meta; the pop-ups\' targets --');
  {
    const r = SH.render(PLUGIN, '1005:5f8802c', 'live');
    // The CURRENT source, built as it ships — not the committed .min files
    // pageFor() reads — so what is tested is what this tree would send.
    const fs = require('fs'), path = require('path');
    const minCss = fs.readFileSync(path.join(PLUGIN, 'assets/css/widget.min.css'), 'utf8');
    const minJs = fs.readFileSync(path.join(PLUGIN, 'assets/js/widget.min.js'), 'utf8');
    let html = SH.pageFor(r, PLUGIN);
    html = html.split(minCss).join(H.css()).split(minJs).join(H.jsShipped());
    html = html.replace('</head>', EL_SWIPER_CSS + '</head>');
    const p = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await p.clock.setFixedTime(SH.CLOCK);
    await p.setContent(html);
    const meta0 = await p.evaluate(() => (document.querySelector('meta[name="viewport"]') || {}).content);
    await p.waitForTimeout(800);
    await p.click('.mphbac-cell-status.is-available.is-clickable'); await p.waitForTimeout(500);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.click('.mphbac-row-toggle--info'); await p.waitForTimeout(700);
    const meta1 = await p.evaluate(() => (document.querySelector('meta[name="viewport"]') || {}).content);
    check(`the viewport meta is exactly as the page served it ("${meta0}") after loading and opening both pop-ups — no viewport-fit added`,
      !!meta0 && meta1 === meta0 && !/viewport-fit/.test(meta1), [meta0, meta1]);
    await p.evaluate(sw => { const b = document.querySelector('.mphbac-info-sheet.is-open .mphbac-info-body') || document.querySelector('.mphbac-info-body'); b.insertAdjacentHTML('afterbegin', sw); }, SWIPER);
    await p.waitForTimeout(200);
    const m = await p.evaluate(() => ['prev', 'next'].map(k => { const e = document.querySelector('.elementor-swiper-button-' + k), r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after');
      return { disc: [Math.round(r.width), Math.round(r.height)], area: [Math.round(r.width + parseFloat(a.left) * -2), Math.round(r.height + parseFloat(a.top) * -2)] }; }));
    check('the gallery\'s ‹ › at 360px: the same 36px disc, with a 44×44 tap area round it', m.every(x => x.disc[0] === 36 && x.disc[1] === 36 && x.area[0] === 44 && x.area[1] === 44), m);
    const prev = await reach(p, '.elementor-swiper-button-prev', [[0, 21], [0, -21], [21, 0], [-21, 0], [15, 15]]);
    const next = await reach(p, '.elementor-swiper-button-next', [[0, 21], [0, -21], [21, 0], [-21, 0], [-15, -15]]);
    check('...a tap 21px from the centre — outside the disc, inside 44px — reaches it, all round', prev.every(Boolean) && next.every(Boolean), [prev, next]);
    const more = await reach(p, '.mphbac-info-sheet.is-open .mphbac-info-view-link', [[0, 21], [0, -21]]);
    const mh = await p.evaluate(() => Math.round(document.querySelector('.mphbac-info-sheet.is-open .mphbac-info-view-link').getBoundingClientRect().height));
    check(`"More Info" (${mh}px tall): a tap 21px above or below its centre reaches it`, mh < 44 && more.every(Boolean), [mh, more]);
    const sheet = await p.$('.mphbac-info-sheet.is-open');
    const now = await sheet.screenshot();
    await p.evaluate(u => document.head.insertAdjacentHTML('beforeend', u), UNDO);
    await p.waitForTimeout(100);
    const was = await sheet.screenshot();
    const n = await pixels(p, now, was);
    check('...and the pop-up looks EXACTLY as with the 0.47.2 rules (36px arrows, no extensions): 0 pixels differ', n === 0, n);
    await p.close();
  }

  console.log('\n-- the staff board at 360px --');
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const html = S.boardShell({ today: L.TODAY, cottages: L.COTTAGES, bookings: L.BOOKINGS, details: L.DETAILS, bodyStyle: 'padding:0 16px', head: S.raleway() });
    await ctx.route('http://staff.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    await p.goto('http://staff.test/');
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
    const meta0 = await p.evaluate(() => document.querySelector('meta[name="viewport"]').content);
    await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
    await p.waitForSelector('.mphbac-staff-stats-out .mphbac-staff-tip'); await p.waitForTimeout(300);
    const tips = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tip')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    const reachTips = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tip')].map(b => {
      b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return [[0, 21], [0, -21], [21, 0], [-21, 0]].every(([dx, dy]) => { const e = document.elementFromPoint(cx + dx, cy + dy); return !!e && (e === b || b.contains(e)); }); }));
    check(`all ${tips.length} Stats ⓘ: still 24×24, and a tap 21px from the centre in any direction reaches each`, tips.length === 13 && tips.every(t => t[0] === 24 && t[1] === 24) && reachTips.every(Boolean), [tips[0], reachTips]);
    await p.evaluate(() => window.scrollTo(0, 0));
    const stats = await p.$('.mphbac-staff-stats');
    const now = await stats.screenshot();
    await p.evaluate(u => document.head.insertAdjacentHTML('beforeend', u), UNDO);
    const was = await stats.screenshot();
    check('...and Stats looks exactly as without the extensions: 0 pixels differ', (await pixels(p, now, was)) === 0);
    await p.evaluate(() => document.getElementById('t-undo').remove());
    await p.click('.mphbac-staff-bar[data-booking-id="1"]');
    await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-tel'); await p.waitForTimeout(400);
    const tel = await reach(p, '.mphbac-staff-sheet .mphbac-staff-tel', [[0, 21], [0, -21]]);
    const sms = await reach(p, '.mphbac-staff-sheet .mphbac-staff-sms', [[0, 21], [0, -21]]);
    const sz = await p.evaluate(() => ['tel', 'sms'].map(k => Math.round(document.querySelector('.mphbac-staff-sheet .mphbac-staff-' + k).getBoundingClientRect().height)));
    check(`the sheet's phone link (${sz[0]}px) and "Text" pill (${sz[1]}px): a tap 21px above or below the centre reaches each`, sz.every(h => h < 44) && tel.every(Boolean) && sms.every(Boolean), [sz, tel, sms]);
    const sheetEl = await p.$('.mphbac-staff-sheet');
    const s1 = await sheetEl.screenshot();
    await p.evaluate(u => document.head.insertAdjacentHTML('beforeend', u), UNDO);
    const s2 = await sheetEl.screenshot();
    check('...and the sheet looks exactly as without them: 0 pixels differ', (await pixels(p, s1, s2)) === 0);
    const meta1 = await p.evaluate(() => document.querySelector('meta[name="viewport"]').content);
    check(`the staff page's viewport meta is untouched ("${meta0}") after the board, Stats and the sheet`, meta1 === meta0 && !/viewport-fit/.test(meta1), [meta0, meta1]);
    await ctx.close();
  }

  console.log('\n-- 3. the board, answered the failed-query error --');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const html = S.boardShell({ today: L.TODAY, cottages: L.COTTAGES, bookings: L.BOOKINGS, bodyStyle: 'padding:0 16px' });
    await ctx.route('http://staff.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    // The endpoint's answer for a failed read (Staff::view_or_fail), from the first request.
    await p.addInitScript(() => { window.__fail500 = true; });
    await p.route('http://staff.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await p.goto('http://staff.test/');
    await p.evaluate(() => {});
    await p.evaluate(() => { const f = window.fetch; window.fetch = function (u, o) { const a = new URLSearchParams(o.body.toString()).get('action');
      if (a === 'mphbac_staff_month') return Promise.resolve(new Response(JSON.stringify({ success: false, data: { message: 'Could not load bookings. Please try again.' } }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
      return f(u, o); }; });
    await p.click('.mphbac-staff-next'); await p.waitForTimeout(400);
    const st = await p.evaluate(() => ({ text: document.querySelector('.mphbac-staff-status').textContent, err: document.querySelector('.mphbac-staff-status').classList.contains('is-error') }));
    check('the board says "Could not load bookings. Please try again." (as an error) — never "No bookings in this period"',
      st.text === 'Could not load bookings. Please try again.' && st.err && !/No bookings/.test(st.text), st);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
