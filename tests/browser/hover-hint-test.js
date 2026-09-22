'use strict';
/**
 * Guards 0.31.0 and 0.31.1: the hover tokens, the (0,6,0) cascade trap, and
 * the mm/dd/yyyy hint.
 *
 * REBUILT 2026-09-17 after the scratchpad harnesses were lost. Every
 * assertion here has a matching entry in tests/mutate.php; nothing counts as
 * coverage until it has been seen to fail.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const php = H.php(), code = H.cssCode();
const S = H.SENTINEL;

// Derived from the source, never hand-written.
const PANEL = [
  ['nav_btn_bg', S.navRest], ['nav_btn_hover_bg', S.navHover],
  ['button_bg_color', S.btnRest], ['button_bg_color_hover', S.btnHover],
  ['button_text_color', S.btnText], ['button_text_color_hover', S.btnTextHover],
  ['view_bg_color', S.viewRest], ['view_bg_color_hover', S.viewHover],
].map(([c, v]) => H.emit(c, v)).join('\n');

const BODY = H.filtersHtml() + `
  <button class="mphbac-nav-btn mphbac-nav-next" aria-label="Next">&gt;</button>
  <a class="mphbac-info-view-link" href="#">View Cottage Page</a>`;

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async ({ touch = false, w = 1280, panel = PANEL, sheetCss = null } = {}) => {
    const ctx = await browser.newContext(touch
      ? { viewport: { width: w, height: 820 }, isMobile: true, hasTouch: true }
      : { viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ panel, body: BODY, sheet: H.sheetHtml(), sheetCss }));
    return { ctx, p };
  };

  console.log('-- 2a: no control may emit :hover --');
  check('no control selector in the source contains :hover', !/:hover'/.test(php),
    (php.match(/.{0,40}:hover'/g) || []).slice(0, 3));
  for (const [ctl, prop] of [
    ['nav_btn_hover_bg', '--mphbac-color-nav-hover'],
    ['button_bg_color_hover', '--mphbac-color-btn-hover'],
    ['button_text_color_hover', '--mphbac-color-btn-hover-text'],
    ['view_bg_color_hover', '--mphbac-color-view-hover'],
    ['view_text_color_hover', '--mphbac-color-view-hover-text'],
  ]) {
    const i = php.indexOf("add_control('" + ctl + "'");
    const block = i > -1 ? php.slice(i, php.indexOf(']);', i)) : '';
    check(`${ctl} writes ${prop}`, block.includes(prop + ': {{VALUE}}'));
  }
  check('every :hover rule in the stylesheet sits inside the pointer guard',
    !/:hover/.test(code.slice(0, code.indexOf('@media (hover: hover) and (pointer: fine)'))));
  check('...and every :focus-visible sits OUTSIDE it — keyboard users need them everywhere',
    !/:focus-visible/.test(code.slice(code.indexOf('@media (hover: hover) and (pointer: fine)'))));

  console.log('\n-- 3: rest AND hover both resolve in widget.css --');
  {
    const { ctx, p } = await open();
    check('the desktop context really is a hover context (instrument check)',
      await p.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches));
    const read = async sel => {
      await p.mouse.move(0, 0); await p.waitForTimeout(120);
      const rest = await p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
      await p.hover(sel); await p.waitForTimeout(250);
      return { rest, ...await p.evaluate(s => {
        const e = document.querySelector(s), c = getComputedStyle(e);
        return { hovering: e.matches(':hover'), bg: c.backgroundColor, color: c.color };
      }, sel) };
    };
    for (const [label, sel, rest, hov] of [
      ['nav arrow', '.mphbac-nav-next', S.navRest, S.navHover],
      ['Show/Reset', '.mphbac-btn-apply', S.btnRest, S.btnHover],
      ['View link', '.mphbac-info-view-link', S.viewRest, S.viewHover],
    ]) {
      const r = await read(sel);
      check(`${label}: the pointer really is over it (instrument check)`, r.hovering === true);
      check(`${label}: the panel's REST colour reaches it`, r.rest === rest, { got: r.rest, want: rest });
      check(`${label}: and the panel's HOVER colour wins over it`, r.bg === hov, { got: r.bg, want: hov });
    }
    /* The popup X takes no panel colour — it has no control — so it is
       checked against the shared --dcc- pair the staff X also consumes,
       rather than against a sentinel. */
    await p.evaluate(() => { document.querySelector('.mphbac-sheet').style.cssText +=
      ';transform:none;opacity:1;left:0;top:0;right:auto;bottom:auto;'; });
    await p.waitForTimeout(400);
    await p.mouse.move(0, 0); await p.waitForTimeout(120);
    await p.hover('.mphbac-sheet-close', { force: true }); await p.waitForTimeout(250);
    const x = await p.evaluate(() => { const e = document.querySelector('.mphbac-sheet-close'),
      c = getComputedStyle(e); return { over: e.matches(':hover'), bg: c.backgroundColor, fg: c.color }; });
    check('popup X: the pointer really is over it (instrument check)', x.over === true);
    check('popup X: hovers to the shared salmon, white on it',
      x.bg === 'rgb(240, 128, 128)' && x.fg === 'rgb(255, 255, 255)', x);
    await ctx.close();
  }

  console.log('\n-- 3: the trap, reproduced so the reason is not lost --');
  {
    const LEGACY = PANEL + `\n${H.POST}${H.WRAPPER} .mphbac-root.mphbac-root .mphbac-nav-btn { background-color: rgb(99, 99, 99); }`;
    const { ctx, p } = await open({ panel: LEGACY });
    await p.hover('.mphbac-nav-next'); await p.waitForTimeout(250);
    const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-nav-next')).backgroundColor);
    check('a REST colour emitted as a paint property at (0,6,0) still beats the (0,2,0) hover',
      bg === 'rgb(99, 99, 99)', { got: bg, note: 'this is what the nav arrows did in 0.31.0' });
    await ctx.close();
  }
  {
    const hoverable = ['nav_btn_bg', 'nav_btn_text', 'button_bg_color', 'button_text_color',
                       'view_bg_color', 'view_text_color'];
    const offenders = hoverable.filter(c => {
      const i = php.indexOf("add_control('" + c + "'");
      return /=>\s*'(background-color|color): \{\{VALUE\}\}/.test(php.slice(i, php.indexOf(']);', i)));
    });
    check('every rest control on a hoverable element writes a token, not a paint property',
      offenders.length === 0, offenders);
  }

  console.log('\n-- 2a: on TOUCH nothing changes on hover, but focus still works --');
  {
    const { ctx, p } = await open({ touch: true, w: 393 });
    check('the touch context really reports hover:none (instrument check)',
      await p.evaluate(() => matchMedia('(hover: none)').matches));
    /* The booking popup's X joined this sweep in 0.38.0. It was the one
       control whose hover rule no assertion here could reach: the "no :hover
       before the guard" check above only sees rules that escape UPWARDS, and
       a rule that escapes by closing the guard early lands below it, where
       that check is blind. A mutation doing exactly that SURVIVED until this
       selector was added. The popup ships translated off-screen, so it is
       parked first — otherwise the hover silently never lands and the
       assertion passes because nothing moved. */
    for (const sel of ['.mphbac-nav-next', '.mphbac-btn-apply', '.mphbac-sheet-close']) {
      // The popup is parked only when its own turn comes: parked first, it
      // covers the widget and every earlier hover lands on the sheet instead.
      if (sel === '.mphbac-sheet-close') {
        await p.evaluate(() => { document.querySelector('.mphbac-sheet').style.cssText +=
          ';transform:none;opacity:1;left:0;top:0;right:auto;bottom:auto;'; });
        await p.waitForTimeout(400);
      }
      const rest = await p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
      await p.hover(sel, { force: true }); await p.waitForTimeout(300);
      const r = await p.evaluate(s => { const e = document.querySelector(s);
        return { over: e.matches(':hover'), bg: getComputedStyle(e).backgroundColor }; }, sel);
      check(`(instrument check) the pointer really reached ${sel}`, r.over === true);
      check(`ON TOUCH ${sel} does not change on hover — no iOS linger`, r.bg === rest, { rest, after: r.bg });
    }
    const f = await p.evaluate(() => {
      const el = document.querySelector('.mphbac-nav-next'); el.focus();
      return { visible: el.matches(':focus-visible'), bg: getComputedStyle(el).backgroundColor };
    });
    check('focus-visible keeps the panel hover colour even in a touch context',
      f.bg === S.navHover, { ...f, want: S.navHover });
    await ctx.close();
  }

  console.log('\n-- 2b: the theme 0.75s fade --');
  {
    const { ctx, p } = await open();
    const t = await p.evaluate(() => ['.mphbac-nav-next', '.mphbac-btn-apply'].map(s => {
      const c = getComputedStyle(document.querySelector(s));
      return { sel: s, transition: c.transition, dur: c.transitionDuration };
    }));
    check('no background transition survives on the nav arrow or the buttons',
      t.every(x => x.dur === '0s' || x.transition === 'none' || /all 0s/.test(x.transition)), t);
    const bare = await p.evaluate(() => {
      const b = document.createElement('button');
      b.textContent = 'x'; document.body.appendChild(b);
      const d = getComputedStyle(b).transitionDuration; b.remove(); return d;
    });
    check('(instrument check) the fixture\'s theme rule really is 0.75s', bare === '0.75s', bare);
    await ctx.close();
  }

  console.log('\n-- 1: the mm/dd/yyyy hint --');
  for (const w of [320, 360, 393]) {
    const { ctx, p } = await open({ touch: true, w });
    await p.addScriptTag({ content: H.js() });
    const m = await p.evaluate(() => {
      const inp = document.querySelector('.mphbac-input-checkin');
      const ph = inp.parentElement.querySelector('.mphbac-field-ph');
      const vis = el => { const c = getComputedStyle(el); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0; };
      const cs = getComputedStyle(ph);
      const before = { text: ph.textContent.trim(), shown: vis(ph), color: cs.color,
        align: cs.justifyContent, position: cs.position, weight: cs.fontWeight,
        size: cs.fontSize, valueSize: getComputedStyle(inp).fontSize,
        aria: ph.getAttribute('aria-hidden'), pe: cs.pointerEvents,
        htmlWeight: getComputedStyle(document.documentElement).fontWeight,
        fieldW: +inp.getBoundingClientRect().width.toFixed(2) };
      inp.value = '2026-10-05';
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      const after = { shown: vis(ph), fieldW: +inp.getBoundingClientRect().width.toFixed(2) };
      inp.value = ''; inp.dispatchEvent(new Event('change', { bubbles: true }));
      return { before, after, back: vis(ph) };
    });
    check(`1: ${w}px — reads exactly "mm/dd/yyyy"`, m.before.text === 'mm/dd/yyyy', m.before.text);
    check(`1: ${w}px — shown while empty, gone the moment a value is set, back when cleared`,
      m.before.shown && !m.after.shown && m.back, m);
    check(`1: ${w}px — NOT bold, despite html{font-weight:700} on this site`,
      m.before.weight !== '700' && m.before.htmlWeight === '700',
      { hint: m.before.weight, html: m.before.htmlWeight });
    check(`1: ${w}px — matches the value's weight and size`,
      m.before.weight === '300' && m.before.size === m.before.valueSize, m.before);
    check(`1: ${w}px — out of flow, so it cannot widen the field`,
      m.before.position === 'absolute' && m.before.fieldW === m.after.fieldW, m);
    check(`1: ${w}px — muted, centred, aria-hidden and not tappable`,
      m.before.color === 'rgb(107, 114, 128)' && m.before.align === 'center'
      && m.before.aria === 'true' && m.before.pe === 'none', m.before);
    await ctx.close();
  }
  {
    const inputs = php.match(/<input type="date" class="mphbac-input[^>]*>/g) || [];
    check('1: all four date fields are wrapped and carry a hint span',
      inputs.length === 4 && (php.match(/class="mphbac-field-ph"/g) || []).length === 4
      && (php.match(/class="mphbac-field"/g) || []).length === 4);
    check('1: the two FILTER fields carry --empty from the server, so the hint is right with no JS',
      inputs.filter(x => x.includes('mphbac-input--empty')).length === 2);
    check('1: the hint text is translatable rather than a bare literal',
      /esc_html__\('mm\/dd\/yyyy', 'mphb-availability-calendar'\)/.test(php));
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
