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
/* The info popup, EXTRACTED FROM THE PHP so the floating X's real markup —
   classes and all — is what gets measured. A hand-written copy is how the
   staff fixture went on measuring a glyph the page no longer rendered. */
const INFO_SHEET = (() => {
  const btn = H.php().match(/<button[^>]*mphbac-info-close--floating[\s\S]*?<\/button>/);
  if (!btn) throw new Error('staff-test: the floating close button is not in class-widget.php');
  return '<div class="mphbac-info-sheet"><div class="mphbac-info-body">'
    + H.dephp(btn[0]) + '<p style="height:600px">photos</p></div></div>';
})();
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

  console.log('\n-- THE TWO POPUP CLOSE BUTTONS ARE ONE CONTROL (0.38.0) --');
  {
    /* THE PUBLIC X AND THE STAFF X ARE MEASURED SIDE BY SIDE, WITH ONE
       INSTRUMENT, because "they must not drift" is a claim about both panels
       and neither harness alone can make it. The glyph is compared by PAINTED
       PIXELS rather than by declarations: one was an SVG and the other the
       &times; CHARACTER, whose ink depends on whichever font loads, so any
       assertion about width or font-size would have compared two things that
       are not the same kind of thing. The screenshot is reloaded into a
       canvas to read it — there is no PNG decoder in this tree. */
    const ink = async (p, sheetSel, closeSel) => {
      await p.evaluate(s => { document.querySelector(s).style.cssText +=
        ';transform:none;opacity:1;left:20px;top:20px;right:auto;bottom:auto;'; }, sheetSel);
      // The sheets animate their transform; measuring inside the ramp reads a
      // blank clip and calls it "no glyph".
      await p.waitForTimeout(500);
      const el = await p.$(closeSel);
      /* THE BOX COMES FROM LAYOUT, NOT FROM THE SCREENSHOT. The floating X
         sits at a fractional x (its -0.25em right margin), so its 46px box
         spans 47 screenshot columns — a rounding artefact that reads as a
         1px difference between two buttons that are the same size. The
         clip is the right instrument for INK and for the ground; it is the
         wrong one for the box. */
      const rect = await p.evaluate(s2 => { const r = document.querySelector(s2).getBoundingClientRect();
        return [+r.width.toFixed(2), +r.height.toFixed(2)]; }, closeSel);
      const shot = await el.screenshot({ scale: 'css' });
      const url = 'data:image/png;base64,' + shot.toString('base64');
      return await p.evaluate(async u => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = u; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const tally = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const k = d[i] + ',' + d[i+1] + ',' + d[i+2];
          tally.set(k, (tally.get(k) || 0) + 1);
        }
        let ground = null, best = -1;
        for (const [k, n] of tally) if (n > best) { best = n; ground = k; }
        const [gr, gg, gb] = ground.split(',').map(Number);
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
        for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
          const i = (yy * c.width + xx) * 4;
          if (d[i+3] < 8) continue;
          if (Math.abs(d[i]-gr) + Math.abs(d[i+1]-gg) + Math.abs(d[i+2]-gb) > 120) {
            n++; if (xx<x0)x0=xx; if (xx>x1)x1=xx; if (yy<y0)y0=yy; if (yy>y1)y1=yy;
          }
        }
        return { clip: [c.width, c.height], ground, inkW: x1-x0+1, inkH: y1-y0+1, inkPx: n };
      }, url).then(r => ({ ...r, box: rect }));
    };

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pub = await ctx.newPage();
    await pub.setContent(H.page({ sheet: H.sheetHtml() }));
    const inf = await ctx.newPage();
    await inf.setContent(H.page({ sheet: INFO_SHEET }));
    const stf = await ctx.newPage();
    await stf.setContent(S.page({ body: S.TOOLS, sheet: S.SHEET }));

    // THREE, not two, since 0.39.0: the info popup's floating X joined.
    const m = {
      public: await ink(pub, '.mphbac-sheet', '.mphbac-sheet-close'),
      floating: await ink(inf, '.mphbac-info-sheet', '.mphbac-info-close--floating'),
      staff: await ink(stf, '.mphbac-staff-sheet', '.mphbac-staff-close'),
    };
    const all = Object.values(m), a = m.public;
    const same = k => all.every(x => String(x[k]) === String(a[k]));
    check('all three X\'s sit in the same 46px box',
      all.every(x => String(x.box) === '46,46'),
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.box])));
    check('all three X\'s paint the same ground', same('ground'),
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.ground])));
    check('all three X\'s paint the same glyph, to the pixel',
      same('inkW') && same('inkH') && same('inkPx'),
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [v.inkW, v.inkH, v.inkPx]])));
    check('the glyph FILLS the box rather than reading as punctuation — it was 27% and 22%',
      all.every(x => x.inkW / x.box[0] >= 0.35),
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +(v.inkW / v.box[0]).toFixed(2)])));
    /* THE FROSTED PILL IS GONE, NOT JUST OUTRANKED. It never rendered, so a
       runtime check cannot tell "deleted" from "still there and losing"; the
       stylesheet is what has to say it. */
    check('the frosted-pill declarations are deleted from the stylesheet, not left dead',
      !/backdrop-filter/.test(H.cssCode()) && !/rgba\(60, 60, 60, 0\.45\)/.test(H.cssCode()));
    check('and no rule scopes the floating X out of the shared treatment any more',
      !/:not\(\.mphbac-info-close--floating\)/.test(H.cssCode()));

    /* THE SENTINEL. The owner's requirement is not "these two are blue today",
       it is "a future --dcc-site-* palette moves them both". Declaring the
       site layer on :root and re-reading is the only assertion that can tell
       those apart — and :root is deliberately where a portaled popup can
       still see it, which is the whole reason the token layer exists. */
    const paint = (p, sel) => p.evaluate(s => { const c = getComputedStyle(document.querySelector(s));
      return { bg: c.backgroundColor, fg: c.color }; }, sel);
    const repaint = async (p, sel) => {
      await p.evaluate(() => {
        document.documentElement.style.setProperty('--dcc-site-button-bg', 'rgb(1, 2, 3)');
        document.documentElement.style.setProperty('--dcc-site-button-hover-bg', 'rgb(4, 5, 6)');
        document.documentElement.style.setProperty('--dcc-site-button-hover-fg', 'rgb(7, 8, 9)');
      });
      await p.waitForTimeout(60);
      const rest = await paint(p, sel);
      await p.hover(sel, { force: true }); await p.waitForTimeout(200);
      const hov = await paint(p, sel);
      await p.mouse.move(0, 0);
      return { rest, hov };
    };
    const pubT = await repaint(pub, '.mphbac-sheet-close');
    const infT = await repaint(inf, '.mphbac-info-close--floating');
    const stfT = await repaint(stf, '.mphbac-staff-close');
    for (const [label, r] of [['public', pubT], ['floating', infT], ['staff', stfT]]) {
      check(label + ': the REST mark follows --dcc-site-button-bg', r.rest.fg === 'rgb(1, 2, 3)', r.rest);
      check(label + ': the REST ground is mixed from that same token, not a literal',
        /color\(srgb/.test(r.rest.bg) && r.rest.bg !== 'rgb(231, 238, 247)', r.rest.bg);
      check(label + ': the HOVER pair follows --dcc-site-button-hover-*',
        r.hov.bg === 'rgb(4, 5, 6)' && r.hov.fg === 'rgb(7, 8, 9)', r.hov);
    }
    await ctx.close();
  }

  console.log('\n-- the close buttons\' focus is an OUTLINE, never a fill --');
  {
    /* SPLIT FROM THE HOVER CHECK ON PURPOSE. White on #f08080 is 2.59:1, a
       knowingly accepted ratio, so focus must not be readable only as a fill.
       FOCUSED WITH A REAL Tab: a programmatic .focus() matches :focus-visible
       while the painted background has not been recomputed, so it reports a
       fill as absent whether or not one is declared. That instrument would
       have passed this test before the fill was removed. */
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    for (const [label, mk, sheetSel, closeSel] of [
      ['public', () => H.page({ sheet: H.sheetHtml() }), '.mphbac-sheet', '.mphbac-sheet-close'],
      ['floating', () => H.page({ sheet: INFO_SHEET }), '.mphbac-info-sheet', '.mphbac-info-close--floating'],
      ['staff', () => S.page({ body: S.TOOLS, sheet: S.SHEET }), '.mphbac-staff-sheet', '.mphbac-staff-close'],
    ]) {
      const p = await ctx.newPage();
      await p.setContent(mk());
      await p.evaluate(s => { document.querySelector(s).style.cssText +=
        ';transform:none;opacity:1;left:20px;top:20px;right:auto;bottom:auto;'; }, sheetSel);
      await p.waitForTimeout(400);
      const rest = await p.evaluate(s => { const c = getComputedStyle(document.querySelector(s));
        return { bg: c.backgroundColor, fg: c.color }; }, closeSel);
      let landed = false;
      for (let i = 0; i < 60 && !landed; i++) {
        await p.keyboard.press('Tab');
        landed = await p.evaluate(s => document.activeElement === document.querySelector(s), closeSel);
      }
      check(label + ': (instrument check) a real Tab reached the close button', landed);
      const f = await p.evaluate(s => { const e = document.querySelector(s), c = getComputedStyle(e);
        return { fv: e.matches(':focus-visible'), bg: c.backgroundColor, fg: c.color,
                 w: c.outlineWidth, style: c.outlineStyle, off: c.outlineOffset }; }, closeSel);
      check(label + ': (instrument check) the browser really is in focus-visible mode', f.fv);
      check(label + ': focus paints NO fill — the ground and the mark do not move',
        f.bg === rest.bg && f.fg === rest.fg, { rest, focus: { bg: f.bg, fg: f.fg } });
      check(label + ': focus IS a 2px outline, held clear of the round edge',
        f.w === '2px' && f.style === 'solid' && f.off === '2px', f);
      await p.close();
    }
    await ctx.close();
  }

  console.log('\n-- what a runtime check cannot see: the source, on both sides --');
  {
    const pubCode = H.cssCode(), pubPhp = H.php(), stfPhp = S.widgetPhp();
    /* THE PRE-color-mix() FALLBACK CANNOT BE OBSERVED IN THIS BROWSER, which
       understands color-mix and therefore always takes the second
       declaration. A browser that does not drops it at parse time and keeps
       whatever came before — so the literal must come FIRST, and the only
       place to check that is the source. Get it backwards and those browsers
       get no ground at all: an X floating on white, which is the exact bug
       the fill was added to fix. */
    for (const [label, css] of [['widget.css', pubCode], ['staff.css', code]]) {
      const m = css.match(/background:\s*#E7EEF7;\s*background:\s*color-mix\(/);
      check(label + ': the literal ground is declared BEFORE the color-mix() that replaces it', !!m);
      check(label + ': ...and no color-mix() is left without one in front of it',
        (css.match(/color-mix\(/g) || []).length === (css.match(/#E7EEF7;\s*background:\s*color-mix\(/g) || []).length,
        (css.match(/.{60}color-mix\(/g) || []));
    }
    /* ONE SNIPPET, TWO PANELS. The staff X carried &times; until 0.38.0; a
       character and an SVG cannot be kept identical by a stylesheet. */
    const MARK = '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.25"';
    check('the staff close renders the same SVG mark as the public one, not a character',
      stfPhp.includes(MARK) && !/mphbac-staff-close[\s\S]{0,200}&times;/.test(stfPhp));
    check('the public booking close still renders it too', pubPhp.includes(MARK));
    /* THE STROKE IS DECIDED IN CSS, not in the two copies of the markup —
       otherwise "the same weight on both" depends on two files agreeing. */
    check('both stylesheets set the stroke themselves, outranking the attribute',
      /svg path\s*\{\s*stroke-width:\s*2\.75/.test(pubCode) && /svg path\s*\{\s*stroke-width:\s*2\.75/.test(code));
  }

  console.log('\n-- a long booking title must stop before the close button (0.39.0) --');
  {
    /* PRE-EXISTING, since the close button was raised to 46px in 0.36.0. The
       X is absolutely positioned at right: 12px and is 46px wide, so it owns
       the first 58px from the right edge; the header reserved 56px on
       desktop and 52px on a phone, so a title long enough to fill its line
       ran 2px and 6px underneath it.

       THE TITLE HAS TO BE LONG ENOUGH TO REACH THE EDGE. A short one is
       centred with slack on both sides and clears the button at any padding,
       so it would pass against the broken value — which is exactly the trap.
       This one wraps to several lines at every width tested.

       THE BOX IS WHAT IS ASSERTED, not the painted ink: the ink of a wrapped
       line stops wherever the last word happens to end, so an ink-only check
       passes or fails on the sentence rather than on the padding. */
    const LONG = 'Rose Cottage — Mr &amp; Mrs Fotherington-Smythe-Wallington, '
               + '14 nights, 2 dogs, late arrival';
    for (const w of [320, 360, 393, 1280]) {
      const ctx = await browser.newContext(w < 600
        ? { viewport: { width: w, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
        : { viewport: { width: w, height: 900 } });
      const p = await ctx.newPage();
      await p.setContent(S.page({ body: S.TOOLS,
        sheet: S.SHEET.replace('class="mphbac-staff-sheet-title" id=""></div>',
                               'class="mphbac-staff-sheet-title" id="">' + LONG + '</div>') }));
      await p.evaluate(() => { document.querySelector('.mphbac-staff-sheet')
        .style.cssText += ';transform:translate(-50%,-50%);opacity:1;'; });
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const t = document.querySelector('.mphbac-staff-sheet-title');
        const tr = t.getBoundingClientRect();
        const c = document.querySelector('.mphbac-staff-close').getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(t);
        const lines = [...range.getClientRects()];
        return { lines: lines.length, gap: +(c.left - tr.right).toFixed(1),
                 inkGap: +(c.left - Math.max(...lines.map(l => l.right))).toFixed(1) };
      });
      check(`${w}px: (instrument check) the title is long enough to wrap and reach the edge`,
        r.lines >= 2, r);
      check(`${w}px: the title's box stops before the X, with room to spare`,
        r.gap >= 6, r);
      await ctx.close();
    }
    /* AND THE VALUE IS WRITTEN AS THE ARITHMETIC, so moving the button
       cannot silently re-open the gap without moving the padding with it. */
    check('the padding states the button\'s offset + width + breathing room, not a bare number',
      (code.match(/padding: \d+px calc\(12px \+ 46px \+ 8px\)/g) || []).length === 2,
      (code.match(/\.mphbac-staff-sheet-head \{[^}]*padding:[^;]*/g) || []));
  }

  console.log('\n-- the info popup portals too, so its tokens must survive the move --');
  {
    /* CONFIRMED RATHER THAN ASSUMED, which is what the owner asked for.
       .mphbac-info-sheet is moved to <body> when the popup opens, exactly
       like .mphbac-sheet, so the --dcc-* layer has to be declared on it. */
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.setContent(H.page({ sheet: INFO_SHEET }));
    const r = await p.evaluate(() => {
      const sheet = document.querySelector('.mphbac-info-sheet');
      document.body.appendChild(sheet);          // what widget.js does on open
      const c = getComputedStyle(document.querySelector('.mphbac-info-close--floating'));
      const tok = n => c.getPropertyValue(n).trim();
      return { outside: !sheet.closest('.mphbac-root'),
               bg: tok('--dcc-button-bg'), hb: tok('--dcc-button-hover-bg'),
               hf: tok('--dcc-button-hover-fg'), ring: tok('--mphbac-color-today-outline') };
    });
    check('(instrument check) the info sheet really is outside .mphbac-root', r.outside);
    check('every token the floating X consumes still resolves after the move',
      r.bg && r.hb && r.hf && r.ring, r);
    /* The position is all that is left of its own rule, and it is still its
       own: sticky over the photos, above the carousel's stacking contexts. */
    const pos = await p.evaluate(() => { const c = getComputedStyle(
      document.querySelector('.mphbac-info-close--floating'));
      return { position: c.position, z: c.zIndex, mb: c.marginBottom }; });
    check('...and it keeps the position that makes it a FLOATING close',
      pos.position === 'sticky' && pos.z === '10' && pos.mb === '-28px', pos);
    await ctx.close();
  }

  console.log('\n-- the portal cannot strand either X (0.37.0 for the public sheet, 0.38.0 for the staff one) --');
  {
    /* staff.js moves .mphbac-staff-sheet to <body>. Every token the dialog
       consumes must therefore be declared ON the dialog, not only on
       .mphbac-staff — and a literal fallback is not the same thing, because
       a fallback cannot follow a palette. Asserted by reading the tokens
       from a dialog that really has been moved. */
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.setContent(S.page({ body: S.TOOLS, sheet: S.SHEET }));
    const r = await p.evaluate(() => {
      const sheet = document.querySelector('.mphbac-staff-sheet');
      document.body.appendChild(sheet);           // exactly what staff.js does
      const c = getComputedStyle(document.querySelector('.mphbac-staff-close'));
      const tok = n => c.getPropertyValue(n).trim();
      return { outside: !sheet.closest('.mphbac-staff'),
               bg: tok('--dcc-button-bg'), hb: tok('--dcc-button-hover-bg'),
               hf: tok('--dcc-button-hover-fg'), focus: tok('--staff-focus') };
    });
    check('(instrument check) the dialog really is outside .mphbac-staff', r.outside);
    check('every token the dialog consumes still resolves after the move',
      r.bg && r.hb && r.hf && r.focus, r);
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
    /* THE PREMISE, NOT THE VALUE. The nav's font-size governs nothing
     * rendered: prev/next contain only an <svg>, sized in px, stroked at a
     * fixed width, coloured through currentColor — which takes `color`, not
     * font-weight. Measured: pixel-identical at 4px, 16px and 40px. So the
     * rule is symmetry with the two below, and no font-weight is declared
     * because there is nothing for it to change.
     * Asserting the 16px alone would let a word appear in those buttons
     * without anything noticing — and that is the moment the missing weight
     * would start to matter. This fails then, and points at the comment. */
    const svgOnly = await p.evaluate(() => ['.mphbac-staff-prev', '.mphbac-staff-next'].map(s => {
      const e = document.querySelector(s);
      return e ? { s, textNodes: [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length,
                   svgs: e.querySelectorAll('svg').length } : { s, missing: true };
    }));
    check('the nav arrows carry NO text node, so their font rules govern nothing visible',
      svgOnly.every(x => !x.missing && x.textNodes === 0 && x.svgs === 1), svgOnly);
    check('...and Today, the one nav button with a word in it, is matched exactly',
      m.today.size === '13px' && m.today.weight === '600', m.today);
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
