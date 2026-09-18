'use strict';
/**
 * Guards the nav row: 0.23.2 (spacing and the SVG chevrons), 0.23.5 (the
 * Today button), 0.23.9/0.27.0 (centring and hover), and the [hidden] rule.
 *
 * ASSERT COMPUTED STYLE, NEVER THE ATTRIBUTE. Reading `todayBtn.hidden`
 * instead of its computed display hid a live bug here for several releases:
 * `.mphbac-nav-btn { display: inline-flex }` is an author rule and outranks
 * the UA stylesheet's `[hidden] { display: none }`, so the attribute was set
 * and the button stayed on screen.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const php = H.php(), code = H.cssCode(), js = H.js();

const NAV = H.dephp(H.extractBlock(php, '<div class="mphbac-nav">'), {
  str_prev_month: 'Previous', str_next_month: 'Next',
  str_today: 'today', str_today_hint: 'Back to today',
});

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async (panel = '', w = 1280) => {
    const p = await browser.newPage({ viewport: { width: w, height: 700 } });
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ panel, body: NAV }));
    return p;
  };

  console.log('-- the arrows are stroked SVG, on the colour control --');
  {
    const p = await open(`${H.POST}${H.WRAPPER} .mphbac-root.mphbac-root .mphbac-nav-btn{--mphbac-color-nav-text:rgb(1,2,3);}`);
    const c = await p.evaluate(() => {
      const prev = document.querySelector('.mphbac-nav-prev');
      const svg = prev.querySelector('svg');
      const path = svg.querySelector('path');
      const s = getComputedStyle(svg), ps = getComputedStyle(path);
      const r = prev.getBoundingClientRect();
      const nr = document.querySelector('.mphbac-nav-next').getBoundingClientRect();
      return { hasSvg: !!svg, glyph: prev.textContent.trim(),
        fill: ps.fill, strokeW: path.getAttribute('stroke-width'),
        stroke: ps.stroke, w: s.width, h: s.height, display: s.display,
        ariaHidden: svg.getAttribute('aria-hidden'), focusable: svg.getAttribute('focusable'),
        label: prev.getAttribute('aria-label'), nextLabel: document.querySelector('.mphbac-nav-next').getAttribute('aria-label'),
        hit: { pw: r.width, ph: r.height, nw: nr.width, nh: nr.height } };
    });
    check('arrows are stroked SVG chevrons, not text glyphs',
      c.hasSvg && c.glyph === '' && c.fill === 'none' && c.strokeW === '2.25', c);
    check('20x20, block', c.w === '20px' && c.h === '20px' && c.display === 'block', [c.w, c.h, c.display]);
    check('the stroke follows currentColor, so the Nav text colour control drives it',
      c.stroke === 'rgb(1, 2, 3)', c.stroke);
    check('44x44 hit area on both arrows',
      c.hit.pw >= 44 && c.hit.ph >= 44 && c.hit.nw >= 44 && c.hit.nh >= 44, c.hit);
    check('the accessible name is on the BUTTON; the svg adds nothing to it',
      c.label === 'Previous' && c.nextLabel === 'Next' && c.ariaHidden === 'true' && c.focusable === 'false', c);
    await p.close();
  }

  console.log('\n-- the row is a centred cluster, not space-between --');
  {
    const p = await open();
    const g = await p.evaluate(() => {
      const nav = document.querySelector('.mphbac-nav');
      const s = getComputedStyle(nav);
      const kids = [...nav.children].filter(k => getComputedStyle(k).display !== 'none')
        .map(k => k.getBoundingClientRect());
      const gaps = kids.slice(1).map((k, i) => +(k.left - kids[i].right).toFixed(1));
      const navR = nav.getBoundingClientRect();
      return { justify: s.justifyContent, gap: s.columnGap, gaps,
        leftAir: +(kids[0].left - navR.left).toFixed(1),
        rightAir: +(navR.right - kids[kids.length - 1].right).toFixed(1) };
    });
    check('justify-content is center, not space-between', g.justify === 'center', g.justify);
    check('the controls sit at the declared gap, not pushed apart by slack',
      g.gaps.every(x => Math.abs(x - parseFloat(g.gap)) < 1.5), g);
    check('...so the air ends up OUTSIDE the cluster, roughly balanced',
      Math.abs(g.leftAir - g.rightAir) < 2 && g.leftAir > 50, g);
    await p.close();
  }

  console.log('\n-- the Today button: computed style, never the attribute --');
  {
    const p = await open();
    const st = await p.evaluate(() => {
      const b = document.querySelector('.mphbac-nav-today');
      const before = { attr: b.hidden, display: getComputedStyle(b).display, w: b.getBoundingClientRect().width };
      b.hidden = false;
      const shown = { display: getComputedStyle(b).display, w: b.getBoundingClientRect().width };
      return { before, shown, label: b.textContent.trim(), aria: b.getAttribute('aria-label') };
    });
    check('hidden: the attribute is set AND the computed display is none',
      st.before.attr === true && st.before.display === 'none' && st.before.w === 0, st.before);
    check('shown: it lays out as a real button with width',
      st.shown.display !== 'none' && st.shown.w >= 44, st.shown);
    check('it is a text label with its own accessible name',
      st.label !== '' && st.aria === 'Back to today', st);
    check('the [hidden] defence is in the stylesheet, not left to the UA sheet',
      /\[hidden\]/.test(code));
    check('JS drives it from the visible range, not from a click',
      /todayBtn\.hidden = !today \|\| \(today >= from && today <= to\)/.test(js));
    await p.close();
  }

  console.log('\n-- disabled and focus states --');
  {
    const p = await open();
    const d = await p.evaluate(() => {
      const b = document.querySelector('.mphbac-nav-prev');
      // getComputedStyle returns a LIVE declaration, not a snapshot. Holding
      // the object and reading it after changing the element reports the
      // element's CURRENT state — which here said a disabled button was fully
      // opaque, because it had already been re-enabled. Read the values out
      // while the state still holds.
      b.disabled = true;
      const dis = (c => ({ opacity: c.opacity, cursor: c.cursor }))(getComputedStyle(b));
      b.disabled = false;
      b.focus();
      const f = (c => ({ outline: c.outlineStyle }))(getComputedStyle(b));
      return { ...dis, focusVisible: b.matches(':focus-visible'), ...f };
    });
    check('a disabled arrow is dimmed and shows a not-allowed cursor',
      parseFloat(d.opacity) < 1 && d.cursor === 'not-allowed', d);
    check('programmatic focus still matches :focus-visible on a keyboard-reachable button',
      d.focusVisible === true, d);
    await p.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
