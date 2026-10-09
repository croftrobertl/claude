'use strict';
/**
 * THE DATE HINT SITS EXACTLY WHERE THE DATE WILL (0.43.3).
 *
 * The hint (.mphbac-field-ph) is drawn by the plugin over an empty date field
 * because iOS paints nothing there under appearance: none. Two faults, both
 * found on live:
 *
 *   SIZE (the Website Director): the input's 18px comes from the Filter
 *   Fields typography control, which targets the input alone. The hint's 1em
 *   resolved inside the theme's 19px label, so it computed 19px against the
 *   value's 18px and jumped when a date was filled in.
 *
 *   CENTRE (Rob, on his iPhone): the hint reserved a fixed 1.15em on the
 *   right for Chrome's picker icon. iOS paints no icon, so the hint sat
 *   ~11px left of centre there.
 *
 * widget.js now copies the input's computed type onto the hint and MEASURES
 * the icon per field. This suite proves both on all four fields, with the
 * Filter Fields control emitting live's values, in two engines' worth of
 * geometry: Chromium as it is (icon painted), and Chromium with the icon
 * switched off, which is the iOS case. There is no WebKit here; Rob checks
 * the real thing on his iPhone on staging.
 *
 * Centring against the VALUE is compared by PAINTED PIXELS: the date's text
 * lives in a shadow tree no DOM API can measure, so the field is
 * screenshotted empty (hint) and filled (date) and the ink's centres
 * compared, with the icon cropped out of both.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();

// Live's Filter Fields control values (Raleway 18px / 300) and the theme's
// 19px label, as the Website Director measured them on /cottages/.
const LIVE = `.mphbac-input.mphbac-input{font-family:Raleway,Georgia,serif;font-size:18px;font-weight:300}
 .mphbac-root .mphbac-filter{font-size:19px}`;
const NO_ICON = '<style>.mphbac-input::-webkit-calendar-picker-indicator{display:none!important}</style>';
const CELL = `<div class="mphbac-grid"><div class="mphbac-row" data-room-type-id="22">
  <div class="mphbac-cell mphbac-cell-status is-available is-clickable" data-date="2026-10-20">20</div></div></div>`;

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async ({ w = 375, noIcon = false, script = true } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    // The booking popup INSIDE the root and hidden, as the page ships it, so
    // it is fitted by the real open path rather than by the page load.
    const sheet = H.sheetHtml().replace('<div class="mphbac-sheet"', '<div class="mphbac-sheet" hidden');
    let html = H.page({ panel: LIVE, body: H.filtersHtml() + CELL + sheet + '<div class="mphbac-sheet-overlay" hidden></div>' });
    if (noIcon) html = html.replace('</head>', NO_ICON + '</head>');
    await p.setContent(html);
    await p.evaluate(() => { document.querySelector('.mphbac-root').dataset.config =
      JSON.stringify({ popupEnabled: true, minNights: 2, today: '2026-10-09', strings: {} }); });
    if (script) { await p.addScriptTag({ content: H.js() }); await p.waitForTimeout(80); }
    return { ctx, p };
  };
  // Geometry of one field: the pill, the hint's TEXT box, the type of both.
  const geo = (p, sel) => p.evaluate(sel => {
    const i = document.querySelector(sel), ph = i.nextElementSibling;
    const ir = i.getBoundingClientRect(), ic = getComputedStyle(i), pc = getComputedStyle(ph);
    const shown = pc.display !== 'none';
    const r = document.createRange(); r.selectNodeContents(ph); const tr = r.getBoundingClientRect();
    return { shown, pill: (ir.left + ir.right) / 2, hint: (tr.left + tr.right) / 2, hintRight: tr.right,
      area: ir.right - parseFloat(ic.borderRightWidth) - parseFloat(ic.paddingRight),
      pickerW: parseFloat(pc.getPropertyValue('--mphbac-picker-w')) || 0, padR: pc.paddingRight,
      box: [ir.left, ir.top, ir.width, ir.height], border: parseFloat(ic.borderLeftWidth),
      i: { size: ic.fontSize, weight: ic.fontWeight, family: ic.fontFamily, style: ic.fontStyle },
      h: { size: pc.fontSize, weight: pc.fontWeight, family: pc.fontFamily, style: pc.fontStyle } };
  }, sel);
  // Horizontal centre of the dark ink inside [x0, x1) of the field. "Dark"
  // is an RGB sum under 450: black and the muted hint grey (349) count, the
  // gold border (560) — whose rounded ends reach inside any crop — does not.
  const inkCentre = async (p, g, x1) => {
    const [x, y, , h] = g.box, b = g.border + 2;
    const shot = await p.screenshot({ clip: { x: x + b, y: y + b, width: x1 - x - b, height: h - 2 * b } });
    return p.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let lo = 1e9, hi = -1;
      for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
        const k = (yy * c.width + xx) * 4;
        if (d[k] + d[k + 1] + d[k + 2] < 450) { if (xx < lo) lo = xx; if (xx > hi) hi = xx; }
      }
      return hi < 0 ? null : (lo + hi + 1) / 2;
    }, shot.toString('base64')).then(c => c === null ? null : x + b + c);
  };
  /* Where the ICON'S GLYPH starts, by painted pixels: the reserved strip
     (--mphbac-picker-w) is the icon PLUS its left margin, and "clear of the
     icon" means clear of what is drawn, not of the margin. The hint is
     hidden for the shot; an empty unfocused field paints nothing else. */
  const iconInkLeft = async (p, sel, g) => {
    await p.evaluate(s => { document.querySelector(s).nextElementSibling.style.visibility = 'hidden'; }, sel);
    const [x, y, w, h] = g.box, b = g.border + 2;
    const shot = await p.screenshot({ clip: { x: x + b, y: y + b, width: w - 2 * b, height: h - 2 * b } });
    await p.evaluate(s => { document.querySelector(s).nextElementSibling.style.visibility = ''; }, sel);
    return p.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let lo = 1e9;
      for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
        const k = (yy * c.width + xx) * 4;
        if (d[k] + d[k + 1] + d[k + 2] < 450 && xx < lo) lo = xx;
      }
      return lo === 1e9 ? null : lo;
    }, shot.toString('base64')).then(v => v === null ? null : x + b + v);
  };
  const FIELDS = ['.mphbac-input-checkin', '.mphbac-input-checkout'];
  const openPopup = async p => {
    await p.click('.mphbac-cell-status.is-clickable');
    await p.waitForFunction(() => { const s = document.querySelector('.mphbac-sheet'); return s && !s.hidden; });
    await p.waitForTimeout(150);
    // Empty both so their hints show; markEmpty runs on the change event.
    await p.evaluate(() => ['.mphbac-sheet-checkin', '.mphbac-sheet-checkout'].forEach(s => {
      const i = document.querySelector(s); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); }));
  };

  console.log('-- 4: the hint reads "mm/dd/yy" in all four fields (0.43.3) --');
  {
    const { ctx, p } = await open({ w: 1280 });
    const t = await p.evaluate(() => [...document.querySelectorAll('.mphbac-field-ph')].map(x => x.textContent.trim()));
    check('two filter fields and two popup fields, every one "mm/dd/yy"', t.length === 4 && t.every(x => x === 'mm/dd/yy'), t);
    await ctx.close();
  }

  console.log('\n-- 6 (WD): the hint is the input\'s size and type, in all four fields --');
  for (const w of [375, 1280]) {
    const { ctx, p } = await open({ w });
    const all = [];
    for (const s of FIELDS) all.push([s, await geo(p, s)]);
    await openPopup(p);
    for (const s of ['.mphbac-sheet-checkin', '.mphbac-sheet-checkout']) all.push([s, await geo(p, s)]);
    for (const [s, g] of all) {
      check(`${w}px ${s}: the hint computes the input's size, weight, family and style`,
        g.h.size === g.i.size && g.h.weight === g.i.weight && g.h.family === g.i.family && g.h.style === g.i.style, [g.h, g.i]);
    }
    check(`${w}px (instrument check) the input really is 18px / 300 here, against a 19px label`,
      all[0][1].i.size === '18px' && all[0][1].i.weight === '300'
      && await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-filter')).fontSize) === '19px');
    await ctx.close();
  }
  {
    const { ctx, p } = await open({ script: false });
    const g = await geo(p, FIELDS[0]);
    check('(recorded) WITHOUT the script the hint is the 19px live had — the fault being fixed, reproduced',
      g.h.size === '19px' && g.i.size === '18px', [g.h.size, g.i.size]);
    check('...but never BOLD before the script runs — this site sets html{font-weight:700}, and the CSS pins 300',
      g.h.weight === '300', g.h.weight);
    check('...and it is centred over the whole field — right for iOS, the phones that need it',
      g.padR === '0px' && Math.abs(g.hint - g.pill) <= 1, g);
    await ctx.close();
  }

  {
    /* THE TYPE IS COPIED, NOT ASSUMED. Live's control sets 300, which is also
       the CSS fallback, so a page at live's values cannot tell copying from
       not copying. A field control at 500 / italic can. */
    const ctx = await browser.newContext({ viewport: { width: 375, height: 860 } });
    const p = await ctx.newPage();
    await p.setContent(H.page({ panel: LIVE + ' .mphbac-input.mphbac-input{font-weight:500;font-style:italic;font-size:17px}', body: H.filtersHtml() }));
    await p.addScriptTag({ content: H.js() }); await p.waitForTimeout(80);
    const g = await geo(p, FIELDS[0]);
    check('a field control at 500 / italic / 17px: the hint follows it exactly',
      g.h.weight === '500' && g.h.style === 'italic' && g.h.size === '17px' && g.i.weight === '500', [g.h, g.i]);
    await ctx.close();
  }

  console.log('\n-- 5: no picker icon painted (the iOS case): centred on the pill, within 1px --');
  for (const w of [375, 1280]) {
    const { ctx, p } = await open({ w, noIcon: true });
    for (const s of FIELDS) {
      const g = await geo(p, s);
      check(`${w}px ${s}: no icon is measured, so nothing is reserved`, g.pickerW === 0 && g.shown, g);
      check(`${w}px ${s}: the hint's centre is within 1px of the pill's`, Math.abs(g.hint - g.pill) <= 1,
        { off: +(g.hint - g.pill).toFixed(2) });
    }
    await openPopup(p);
    for (const s of ['.mphbac-sheet-checkin', '.mphbac-sheet-checkout']) {
      const g = await geo(p, s);
      check(`${w}px popup ${s}: centred within 1px too`, g.shown && Math.abs(g.hint - g.pill) <= 1,
        { off: +(g.hint - g.pill).toFixed(2), shown: g.shown });
    }
    await ctx.close();
  }

  console.log('\n-- 5: Chrome on a desktop paints an icon: the hint sits where the DATE sits, clear of it --');
  for (const w of [1280, 375]) {
    const { ctx, p } = await open({ w });
    for (const s of FIELDS) {
      // Both empty and unfocused: a check-in change auto-fills the check-out.
      await p.evaluate(() => document.querySelectorAll('.mphbac-input').forEach(i => {
        i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); }));
      const g = await geo(p, s);
      check(`${w}px ${s}: the icon is measured, not assumed`, g.pickerW > 10 && g.pickerW < 40, g.pickerW);
      const icon = await iconInkLeft(p, s, g);
      check(`${w}px ${s}: the hint's text stays at least 2px clear of the icon as drawn`,
        icon !== null && g.hintRight <= icon - 2, { hintRight: +g.hintRight.toFixed(1), icon });
      // THE SAME STRING IN BOTH STATES. Different glyphs have different side
      // bearings — a "1" carries a wide blank left edge — so "mm/dd/yy" and
      // "10/12/2026" put their ink ~1.5px apart even when their boxes line up.
      // The hint is drawn as the date for this measurement, then restored.
      const cut = g.area - g.pickerW;
      const text = await p.evaluate(s => { const ph = document.querySelector(s).nextElementSibling;
        const t = ph.textContent; ph.textContent = '10/12/2026'; return t; }, s);
      const hintInk = await inkCentre(p, g, cut);
      await p.evaluate(([s, t]) => { const i = document.querySelector(s); i.nextElementSibling.textContent = t;
        i.value = '2026-10-12'; i.dispatchEvent(new Event('change', { bubbles: true })); }, [s, text]);
      await p.waitForTimeout(30);
      const dateInk = await inkCentre(p, g, cut);
      await p.evaluate(s => { const i = document.querySelector(s); i.value = '';
        i.dispatchEvent(new Event('change', { bubbles: true })); }, s);
      check(`${w}px ${s}: empty and filled read as one field — hint and date centred within 1px`,
        hintInk !== null && dateInk !== null && Math.abs(hintInk - dateInk) <= 1,
        { hint: hintInk && +hintInk.toFixed(1), date: dateInk && +dateInk.toFixed(1) });
    }
    await ctx.close();
  }

  console.log('\n-- 5: the booking popup\'s two fields are measured when it opens (hidden, they measure 0) --');
  for (const w of [1280, 375]) {
    const { ctx, p } = await open({ w });
    await openPopup(p);
    for (const s of ['.mphbac-sheet-checkin', '.mphbac-sheet-checkout']) {
      const g = await geo(p, s);
      check(`${w}px popup ${s}: the icon is measured on open`, g.pickerW > 10 && g.pickerW < 40, g.pickerW);
      const icon = await iconInkLeft(p, s, g);
      check(`${w}px popup ${s}: the hint's text stays at least 2px clear of the icon as drawn`,
        g.shown && icon !== null && g.hintRight <= icon - 2, { hintRight: +g.hintRight.toFixed(1), icon, shown: g.shown });
    }
    await ctx.close();
  }

  console.log('\n-- the popup tracks its own fields\' empty state after the portal --');
  {
    const { ctx, p } = await open({ w: 1280 });
    await openPopup(p);
    const m = await p.evaluate(() => {
      const i = document.querySelector('.mphbac-sheet-checkout');
      const portaled = !i.closest('.mphbac-root');
      const emptyAfterClear = i.classList.contains('mphbac-input--empty');
      i.value = '2026-10-25'; i.dispatchEvent(new Event('change', { bubbles: true }));
      const ph = getComputedStyle(i.nextElementSibling).display;
      return { portaled, emptyAfterClear, emptyAfterPick: i.classList.contains('mphbac-input--empty'), hint: ph };
    });
    check('(instrument check) the popup really is outside the widget root', m.portaled, m);
    check('a date cleared in the popup marks it empty, so the hint shows', m.emptyAfterClear, m);
    check('a date picked into an empty popup field clears the mark — the date shows, the hint goes',
      !m.emptyAfterPick && m.hint === 'none', m);
    await ctx.close();
  }

  console.log('\n-- the measurement leaves nothing behind --');
  {
    const { ctx, p } = await open({ w: 1280 });
    const m = await p.evaluate(() => ({
      inputs: document.querySelectorAll('input[type=date]').length,
      probes: document.querySelectorAll('.mphbac-picker-probe--bare').length,
      named: [...document.querySelectorAll('input[type=date]')].filter(i => i.name).length }));
    check('no probe field is left in the page, and none was ever submittable', m.probes === 0 && m.inputs === 4 && m.named === 4, m);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
