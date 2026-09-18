'use strict';
/**
 * The /staff/ panel's button-like controls, matched to the public widget.
 *
 * THIS SUITE REPRODUCES ELEMENTOR'S PER-POST CASCADE. That is not a detail —
 * it is the only way to see the faults here at all. The staff nav's colours
 * live in _elementor_css at (0,7,0) (this site prints Elementor CSS
 * "internal", so it is inline in the page), while staff.css is (0,2,0). A
 * stylesheet-only assertion cannot see either of the two traps below:
 *   - a rest colour emitted as a paint property out-specifies the hover rule;
 *   - a :hover emitted by a control is outside this plugin's stylesheet, so
 *     the (hover: hover) guard cannot reach it and the iOS sticky-hover bug
 *     survives a fix meant to remove it.
 * staff-harness.js builds that CSS from the control source, with the post and
 * element ids read off live page 18102.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const { check, done } = H.reporter();
const php = S.php(), code = S.cssCode();

const GUARD = '@media (hover: hover) and (pointer: fine)';
const SALMON = 'rgb(240, 128, 128)';
const BUTTONLIKE = [
  ['nav', '.mphbac-staff-prev'],
  ['view (unselected)', '.mphbac-staff-view[aria-pressed="false"]'],
  ['close', '.mphbac-staff-close'],
  ['photo link', '.mphbac-staff-photo a'],
];

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const open = async touch => {
    const ctx = await browser.newContext(touch
      ? { viewport: { width: 393, height: 860 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(S.page({ body: S.TOOLS, sheet: S.SHEET }));
    return { ctx, p };
  };
  const hoverRead = async (p, sel) => {
    await p.mouse.move(0, 0); await p.waitForTimeout(80);
    const rest = await p.evaluate(s => { const c = getComputedStyle(document.querySelector(s));
      return { bg: c.backgroundColor, fg: c.color }; }, sel);
    await p.hover(sel, { force: true }); await p.waitForTimeout(400);
    const hov = await p.evaluate(s => { const e = document.querySelector(s), c = getComputedStyle(e);
      return { hovering: e.matches(':hover'), bg: c.backgroundColor, fg: c.color, filter: c.filter }; }, sel);
    return { rest, hov };
  };

  console.log('-- the controls write TOKENS, never :hover and never a paint property --');
  check('no staff control emits a :hover selector', !/:hover'/.test(php),
    (php.match(/.{0,40}:hover'/g) || []).slice(0, 3));
  check('nav_btn_hover_bg writes --staff-nav-hover',
    /--staff-nav-hover: \{\{VALUE\}\}/.test(php));
  check('nav_btn_bg writes --staff-nav-bg, so the rest colour cannot out-specify the hover',
    /--staff-nav-bg: \{\{VALUE\}\}/.test(php));
  check('nav_btn_text writes --staff-nav-text', /--staff-nav-text: \{\{VALUE\}\}/.test(php));
  check('the hover default is the salmon, matching the public widget',
    /'default'\s*=>\s*'#f08080'/i.test(php));
  {
    const hoverable = ['nav_btn_bg', 'nav_btn_text', 'nav_btn_hover_bg'];
    const offenders = hoverable.filter(c => {
      const i = php.indexOf("add_control('" + c + "'");
      return /=>\s*'(background-color|color): \{\{VALUE\}\}/.test(php.slice(i, php.indexOf(']);', i)));
    });
    check('no control on a hoverable staff element emits a paint property', offenders.length === 0, offenders);
  }

  console.log('\n-- every hover rule in staff.css sits inside the pointer guard --');
  check('the guard exists exactly once', (code.match(/@media \(hover: hover\) and \(pointer: fine\)/g) || []).length === 1);
  check('no :hover rule sits before it',
    !/:hover/.test(code.slice(0, code.indexOf(GUARD))),
    (code.slice(0, code.indexOf(GUARD)).match(/[^{}]*:hover[^{}]*\{/g) || []).slice(0, 5));
  check('THE SPLIT: :focus-visible stays OUTSIDE the guard',
    !/:focus-visible/.test(code.slice(code.indexOf(GUARD))));
  check('...and the nav focus background is still declared, ungated',
    /\.mphbac-staff-nav:focus-visible\s*\{[^}]*--staff-nav-hover/.test(code.slice(0, code.indexOf(GUARD))));

  console.log('\n-- DESKTOP: all four button-like controls go salmon --');
  {
    const { ctx, p } = await open(false);
    for (const [label, sel] of BUTTONLIKE) {
      const r = await hoverRead(p, sel);
      check(`${label}: the pointer really is over it (instrument check)`, r.hov.hovering === true);
      check(`${label}: hovers to the shared salmon`, r.hov.bg === SALMON, { rest: r.rest.bg, hover: r.hov.bg });
    }
    // The selected tab is deliberately untouched.
    const sel = await hoverRead(p, '.mphbac-staff-view[aria-pressed="true"]');
    check('the SELECTED tab is deliberately unchanged on hover — it is the only signal of the active view',
      sel.hov.bg === sel.rest.bg, sel);
    // Surfaces keep their own treatment.
    const bar = await hoverRead(p, '.mphbac-staff-bar');
    const item = await hoverRead(p, '.mphbac-staff-item');
    check('the booking bar keeps its brightness treatment, not the salmon',
      /brightness/.test(bar.hov.filter) && bar.hov.bg !== SALMON, bar.hov);
    check('the room row keeps its background swap, not the salmon',
      item.hov.bg !== item.rest.bg && item.hov.bg !== SALMON, item.hov);
    await ctx.close();
  }

  console.log('\n-- TOUCH: nothing hovers, but focus still works --');
  {
    const { ctx, p } = await open(true);
    check('the touch context really reports hover:none (instrument check)',
      await p.evaluate(() => matchMedia('(hover: none)').matches));
    for (const [label, sel] of [...BUTTONLIKE, ['booking bar', '.mphbac-staff-bar'], ['room row', '.mphbac-staff-item']]) {
      const r = await hoverRead(p, sel);
      check(`ON TOUCH ${label} does not change — no iOS linger`,
        r.hov.bg === r.rest.bg && r.hov.fg === r.rest.fg && r.hov.filter === 'none',
        { rest: r.rest.bg, after: r.hov.bg, filter: r.hov.filter });
    }
    const f = await p.evaluate(() => { const e = document.querySelector('.mphbac-staff-prev'); e.focus();
      const c = getComputedStyle(e);
      return { fv: e.matches(':focus-visible'), bg: c.backgroundColor, outline: c.outlineColor }; });
    check('THE SPLIT, as behaviour: focus-visible keeps its background on a TOUCH device',
      f.fv === true && f.bg === SALMON, f);
    check('...and the focus OUTLINE is untouched — it is not a hover state',
      f.outline === 'rgb(15, 109, 191)', f.outline);
    await ctx.close();
  }

  console.log('\n-- tap targets and transitions --');
  {
    const { ctx, p } = await open(true);
    const m = await p.evaluate(() => {
      const read = s => { const e = document.querySelector(s), c = getComputedStyle(e), r = e.getBoundingClientRect();
        return { s, w: +r.width.toFixed(1), h: +r.height.toFixed(1), dur: c.transitionDuration,
                 minH: c.minHeight, height: c.height }; };
      return ['.mphbac-staff-prev', '.mphbac-staff-view', '.mphbac-staff-close', '.mphbac-staff-photo a'].map(read);
    });
    check('every button-like staff control clears the 44px floor',
      m.every(x => x.w >= 44 && x.h >= 44), m.filter(x => x.w < 44 || x.h < 44));
    check('the two that were raised carry headroom above it',
      m.filter(x => /view|close/.test(x.s)).every(x => x.h >= 46),
      m.filter(x => /view|close/.test(x.s)).map(x => [x.s, x.h]));
    check('the close button is square, so the circle is still a circle',
      (x => x.w === x.h)(m.find(x => /close/.test(x.s))), m.find(x => /close/.test(x.s)));
    check('the close button uses min-height, not a fixed height that would clip the glyph',
      /\.mphbac-staff-close\s*\{[^}]*min-height:\s*46px/.test(code)
      && !/\.mphbac-staff-close\s*\{[^}]*\sheight:\s*4\dpx/.test(code));
    check('no transition survives on any of the four — a fade reads as a flicker',
      m.every(x => x.dur === '0s'), m.map(x => [x.s, x.dur]));
    // The theme's 0.75s really is in this fixture, so the pass is not vacuous.
    const bare = await p.evaluate(() => { const b = document.createElement('button');
      document.body.appendChild(b); const d = getComputedStyle(b).transitionDuration; b.remove(); return d; });
    check('(instrument check) the fixture carries the theme\'s 0.75s button fade', bare === '0.75s', bare);
    await ctx.close();
  }

  console.log('\n-- the declared type actually renders (0.36.0) --');
  {
    // ASSERTED ON COMPUTED STYLE, NOT ON THE DECLARATION. The whole fault was
    // a declaration that reads correctly in the file and never applies:
    // `.mphbac-staff button { font: inherit }` at (0,1,1) outranked every
    // per-control rule at (0,1,0), and the shorthand resets every longhand it
    // does not name. A test reading the stylesheet would have reproduced the
    // bug it exists to catch.
    const { ctx, p } = await open(false);
    const m = await p.evaluate(() => {
      const read = s => { const c = getComputedStyle(document.querySelector(s));
        return { size: c.fontSize, weight: c.fontWeight }; };
      return { nav: read('.mphbac-staff-prev'), today: read('.mphbac-staff-today'),
               view: read('.mphbac-staff-view'), close: read('.mphbac-staff-close'),
               bar: read('.mphbac-staff-bar'), item: read('.mphbac-staff-item') };
    });
    check('the nav renders its declared 16px (was 15px/700)', m.nav.size === '16px', m.nav);
    check('Today renders its declared 13px / 600', m.today.size === '13px' && m.today.weight === '600', m.today);
    check('the view switcher renders its declared 14px / 600', m.view.size === '14px' && m.view.weight === '600', m.view);
    // Route B — replacing the shorthand with family+size longhands — would
    // ALSO have dropped these three from 700 to 400, a restyle nobody asked
    // for. They must not move.
    check('the bar, the row and the close button are NOT reweighted as a side effect',
      m.bar.weight === '700' && m.item.weight === '700' && m.close.weight === '700',
      { bar: m.bar, item: m.item, close: m.close });
    check('the shorthand is still there doing its job — deleting it drops buttons to the UA font',
      /\.mphbac-staff button \{[^}]*font:\s*inherit/.test(code));
    await ctx.close();
  }

  console.log('\n-- the fade is gone from the bar and the row, the sheet still animates --');
  {
    const { ctx, p } = await open(false);
    const t = await p.evaluate(() => {
      const d = s => getComputedStyle(document.querySelector(s)).transitionDuration;
      return { bar: d('.mphbac-staff-bar'), item: d('.mphbac-staff-item'),
               sheet: d('.mphbac-staff-sheet'), overlay: d('.mphbac-staff-sheet-body') };
    });
    check('no transition survives on the booking bar or the room row', t.bar === '0s' && t.item === '0s', t);
    check('THE SHEET STILL ANIMATES — a blanket transition: none would have killed it',
      t.sheet !== '0s' && t.sheet !== '', t);
    // Only the ROW visibly faded: the theme transitions `background`, and the
    // bar's hover is filter: brightness(), which that never animated.
    check('(recorded) the theme rule really is background-only, so the bar never visibly faded',
      /transition:\s*background\s/.test(S.THEME));
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
