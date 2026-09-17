'use strict';
/**
 * Guards 0.28.0–0.30.0: the DCC field standard, the iOS zoom floor, the
 * native-control reset and the focus ring.
 *
 * THE KIT SPECIFICITY IS THE TEST. PROJECT-NOTES records Bravada resetting
 * inputs at (0,3,1). The field rules lived at (0,2,0) until 0.28.0 — BELOW
 * that — so only properties the kit did not set were ever landing, while a
 * fixture modelling the kit at (0,1,1) said the pill was fine. harness.js
 * carries both forms; the stronger one decides.
 *
 * WHAT THIS FILE CANNOT DO: iOS refuses to shrink a native date control below
 * its intrinsic width and simply overflows. Chromium shrinks the same control
 * without complaint, so no width measurement here can see that fault. The
 * PROPERTY assertions in section A are the only guard for it, and they hold in
 * any engine. A `min-width: … !important` simulation is worthless — min-width
 * is applied after max-width by spec, so nothing can clamp it and the fixed
 * build fails too.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const php = H.php(), css = H.css(), code = H.cssCode();
const FSEL = H.constOf('FSEL');

const BODY = H.filtersHtml();

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async ({ panel = '', w = 1280, touch = false } = {}) => {
    const ctx = await browser.newContext(touch
      ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true }
      : { viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ panel, body: BODY, sheet: H.sheetHtml() }));
    return { ctx, p };
  };
  const fields = p => p.evaluate(() => [...document.querySelectorAll('.mphbac-input')].map(el => {
    const c = getComputedStyle(el), r = el.getBoundingClientRect();
    return { cls: el.className.split(' ').find(x => x.endsWith('checkin') || x.endsWith('checkout')) || el.className,
      type: el.type, bg: c.backgroundColor, border: c.border, radius: c.borderRadius,
      minH: c.minHeight, pad: c.padding, align: c.textAlign, color: c.color,
      lh: c.lineHeight, size: c.fontSize, family: c.fontFamily, weight: c.fontWeight,
      box: c.boxSizing, minW: c.minWidth, maxW: c.maxWidth,
      appearance: c.appearance, wk: c.webkitAppearance,
      h: +r.height.toFixed(2), w: +r.width.toFixed(2),
      portaled: !el.closest('.mphbac-root') };
  }));

  console.log('-- A: the native-control reset (the only guard for the iOS fault) --');
  {
    const { ctx, p } = await open();
    const f = await fields(p);
    check('A: all four fields are type=date — the premise of this fix',
      f.length === 4 && f.every(x => x.type === 'date'), f.map(x => x.type));
    check('A: appearance AND -webkit-appearance compute to none on every field',
      f.every(x => x.appearance === 'none' && x.wk === 'none'), f.map(x => [x.cls, x.appearance]));
    check('A: min-width 0 on every field, so nothing re-inflates the track',
      f.every(x => x.minW === '0px'), f.map(x => [x.cls, x.minW]));
    check('A: max-width caps the used width whatever the intrinsic width is',
      f.every(x => x.maxW !== 'none'), f.map(x => [x.cls, x.maxW]));
    check('A: border-box, so padding cannot push past the granted width',
      f.every(x => x.box === 'border-box'));
    check('A: the 0.20.2 8.5em floor is gone and must not come back',
      !/min-width:\s*8\.5em/.test(code));
    check('A: at least one field really is PORTALED in this fixture (instrument check)',
      f.some(x => x.portaled), f.map(x => [x.cls, x.portaled]));
    await ctx.close();
  }

  console.log('\n-- 1: the pill, in the root AND portaled, against the (0,3,1) kit --');
  {
    const { ctx, p } = await open();
    const f = await fields(p);
    for (const x of f) {
      const where = x.portaled ? 'portaled ' + x.cls : 'in-root ' + x.cls;
      check(`1: ${where} — white ground, 2px gold border, 30px radius`,
        x.bg === 'rgb(255, 255, 255)' && x.border === '2px solid rgb(244, 218, 98)' && x.radius === '30px',
        [x.bg, x.border, x.radius]);
      check(`1: ${where} — 44px tap target, 10px/12px or 10px/20px padding, centred, #000 value`,
        x.minH === '44px' && x.h >= 44 && /^10px (12|20)px$/.test(x.pad)
        && x.align === 'center' && x.color === 'rgb(0, 0, 0)',
        [x.minH, x.h, x.pad, x.align, x.color]);
      check(`1: ${where} — line-height survives the kit's 1px reset`,
        x.lh !== '1px' && parseFloat(x.lh) > 10, x.lh);
    }
    check('1: the field rules sit at (0,4,0), above the kit and below the panel',
      /\.mphbac-input\.mphbac-input\.mphbac-input\.mphbac-input\s*\{/.test(code));
    await ctx.close();
  }

  console.log('\n-- 2: the iOS zoom guard --');
  {
    const { ctx, p } = await open();
    const f = await fields(p);
    check('2: every field computes >= 16px, popup included — Safari zooms below that',
      f.every(x => parseFloat(x.size) >= 16), f.map(x => [x.cls, x.size]));
    check('2: the floor is expressed as max(16px, 1em), not a literal 16px',
      /font-size:\s*max\(16px,\s*1em\)/.test(code));
    check('2: ...because plain inherit gives 15.2px in the popup (0.95em of the theme 16px)',
      /0\.95em/.test(code));
    await ctx.close();
  }

  console.log('\n-- 2: the typography pin stays open --');
  {
    const { ctx, p } = await open();
    const bare = await fields(p);
    check('2: with no panel control, family and size come from the widget, not the kit',
      bare.every(x => !/Pavanam/.test(x.family)), bare.map(x => x.family));
    await ctx.close();

    const SEL = H.constOf('SEL').replace('{{WRAPPER}}', H.WRAPPER);
    const panel = `${H.POST}${SEL}${FSEL} { font-family: "PanelFace", serif; font-size: 22px; font-weight: 300; }`;
    const { ctx: c2, p: p2 } = await open({ panel });
    const f2 = await fields(p2);
    const inRoot = f2.find(x => !x.portaled);
    check('2: the Elementor typography control still owns family, size and weight',
      /PanelFace/.test(inRoot.family) && inRoot.size === '22px' && inRoot.weight === '300',
      [inRoot.family, inRoot.size, inRoot.weight]);
    check('2: ...and the standard\'s non-font properties are not disturbed by it',
      inRoot.radius === '30px' && inRoot.border === '2px solid rgb(244, 218, 98)' && inRoot.align === 'center');
    await c2.close();
  }

  console.log('\n-- 3: the focus ring, including the popup that had none --');
  {
    const { ctx, p } = await open();
    const ring = await p.evaluate(() => {
      const out = {};
      for (const [k, s] of [['root', '.mphbac-input-checkin'], ['portaled', '.mphbac-sheet-checkin'],
                            ['button', '.mphbac-btn-apply']]) {
        const el = document.querySelector(s);
        if (!el) { out[k] = null; continue; }
        el.focus();
        const c = getComputedStyle(el);
        out[k] = { matches: el.matches(':focus-visible'),
          outline: c.outlineColor + ' ' + c.outlineWidth + ' ' + c.outlineStyle, offset: c.outlineOffset };
      }
      return out;
    });
    check('3: field focus ring is the standard\'s 3px blue, offset 2px',
      ring.root.outline === 'rgb(0, 107, 207) 3px solid' && ring.root.offset === '2px', ring.root);
    check('3: the PORTALED popup field has a ring too — it had none before 0.28.0',
      ring.portaled && ring.portaled.outline === 'rgb(0, 107, 207) 3px solid', ring.portaled);
    check('3: buttons keep a gold OUTLINE and no fill — white on #f08080 is 2.59:1',
      /244, 218, 98/.test(ring.button.outline)
      && !/\.mphbac-btn(\.mphbac-btn)?:focus-visible[^}]*background/.test(code), ring.button);
    await ctx.close();
  }

  console.log('\n-- 4: empty vs typed, the ::placeholder mapping --');
  {
    const { ctx, p } = await open();
    await p.addScriptTag({ content: H.js() });
    const st = await p.evaluate(() => {
      const empty = document.querySelector('.mphbac-input-checkin');
      empty.value = ''; empty.dispatchEvent(new Event('change', { bubbles: true }));
      const typed = document.querySelector('.mphbac-input-checkout');
      typed.value = '2026-10-05'; typed.dispatchEvent(new Event('change', { bubbles: true }));
      return { emptyHas: empty.classList.contains('mphbac-input--empty'),
               typedHas: typed.classList.contains('mphbac-input--empty') };
    });
    check('4: the empty field is marked and the typed one is not', st.emptyHas && !st.typedHas, st);
    // getComputedStyle cannot read ::-webkit-datetime-edit, so compare pixels.
    const a = (await p.locator('.mphbac-input-checkin').screenshot()).toString('base64');
    await p.evaluate(() => document.querySelector('.mphbac-input-checkin').classList.remove('mphbac-input--empty'));
    const b = (await p.locator('.mphbac-input-checkin').screenshot()).toString('base64');
    check('4: --empty visibly repaints the field (pixel-compared, since the pseudo is unreadable)', a !== b);
    check('4: the standard\'s ::placeholder rule is kept verbatim, inert on a date input',
      /\.mphbac-input::placeholder\s*\{[^}]*--dcc-muted/.test(code));
    check('4: Blink\'s own empty text is hidden, not muted, and only while unfocused',
      /--empty:not\(:focus\)::-webkit-datetime-edit\s*\{\s*color:\s*transparent/.test(code));
    await ctx.close();
  }

  console.log('\n-- 5: tokens resolve on the portaled popup, and follow a site layer --');
  {
    const { ctx, p } = await open();
    const tok = await p.evaluate(() => ({
      root: getComputedStyle(document.querySelector('.mphbac-root')).getPropertyValue('--dcc-gold').trim(),
      sheet: getComputedStyle(document.querySelector('.mphbac-sheet')).getPropertyValue('--dcc-gold').trim(),
    }));
    check('5: --dcc-gold resolves on .mphbac-sheet as well as .mphbac-root',
      tok.root === '#f4da62' && tok.sheet === '#f4da62', tok);
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx2.newPage();
    await p2.setContent(H.page({ body: BODY, sheet: H.sheetHtml() })
      .replace('<body class="elementor-1005', '<body style="--dcc-site-gold:#123456" class="elementor-1005'));
    const f2 = await fields(p2);
    check('5: a future shared --dcc-site-* layer flows through with no edit to the file',
      f2.every(x => x.border === '2px solid rgb(18, 52, 86)'), f2.map(x => [x.cls, x.border]));
    await ctx2.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
