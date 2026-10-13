'use strict';
/**
 * DCC Seasons — the Halloween corner web (4.10.3, Rob: "make it medium").
 *
 * The web accent is 96px wide (1.5x the old 64px), in the top-right
 * corner, at opacity .5, and its lines scale with it (never thinner than
 * the 64px web's 1.6px). It must never take a tap: a header/menu button
 * placed right under it still gets the click, at 320, 390 and 1280, in
 * front and behind layering.
 *
 * Usage: node tools/test-accents.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}

(async () => {
  for (const layer of ['front', 'behind']) {
    for (const w of [320, 390, 1280]) {
      console.log(`\n  --- Halloween corner web, ${layer} layering, ${w}px ---`);
      const cfg = config(['--theme=halloween', '--placement=content', `--layering=${layer}`, '--density=16', '--noparticles', '--diag']);
      cfg.heroEvery = [9999, 10000]; cfg.vigFirst = 1e9; cfg.heroFirst = [9999, 10000];
      const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: w, height: w < 768 ? 844 : 800 } });
      try {
        await ses.page.waitForFunction(() => document.querySelector('.dcc-seasons-accent') && window.DCCSeasonsEngine, null, { timeout: 15000 });
        await ses.page.waitForTimeout(1500);
        /* a menu-style button in the very corner, under the web (z-index
         * 8000: above the page's header, below the front accent's 9000 —
         * the worst case), counting its clicks */
        await ses.page.evaluate(() => {
          /* the fixture's test weather banner sits above everything (by
           * design, z 10000) across the top; out of the way here */
          const st = document.createElement('style'); st.textContent = '.dcc-wx-banner{display:none!important}'; document.head.appendChild(st);
          const b = document.createElement('button');
          b.id = 'corner-btn'; b.textContent = '≡';
          b.style.cssText = 'position:fixed;top:6px;right:6px;width:44px;height:44px;z-index:8000;margin:0';
          window.cornerClicks = 0; b.addEventListener('click', () => { window.cornerClicks++; });
          document.body.appendChild(b);
        });
        const r = await ses.page.evaluate(() => {
          const els = document.querySelectorAll('.dcc-seasons-accent'), a = els[0], svg = a && a.querySelector('svg');
          const box = a.getBoundingClientRect(), sb = svg.getBoundingClientRect(), cs = getComputedStyle(a);
          const path = svg.querySelector('path'), m = path.getScreenCTM();
          const lineW = parseFloat(getComputedStyle(path.parentNode).strokeWidth) * Math.hypot(m.a, m.b);
          /* every point of the web's box: nothing there is the accent */
          let hits = 0, n = 0;
          for (let y = box.top + 2; y < box.bottom; y += 6) {
            for (let x = box.left + 2; x < box.right; x += 6) {
              const e = document.elementFromPoint(x, y); n++;
              if (e && a.contains(e)) { hits++; }
            }
          }
          return { count: els.length, w: sb.width, h: sb.height, right: window.innerWidth - box.right, top: box.top,
            op: parseFloat(cs.opacity), pe: cs.pointerEvents, svgPe: getComputedStyle(svg).pointerEvents, lineW, hits, n,
            under: document.elementFromPoint(window.innerWidth - 28, 28).id, vw: window.innerWidth };
        });
        ok(r.count === 1, 'one corner accent (the web)', String(r.count));
        ok(Math.abs(r.w - 96) < 0.5 && Math.abs(r.h - 96) < 0.5, `it is 96 × 96 px (${r.w.toFixed(1)} × ${r.h.toFixed(1)})`, `${r.w} ${r.h}`);
        if (layer === 'front') { ok(Math.abs(r.right) < 0.5 && Math.abs(r.top) < 0.5, 'it sits in the top-right corner of the screen', `right ${r.right} top ${r.top}`); }
        else { ok(r.right > -0.5 && r.right < 40, `it sits at the right, inside the screen (${r.right.toFixed(0)} px from the edge; behind, it follows its host)`, `right ${r.right} top ${r.top}`); }
        ok(Math.abs(r.op - 0.5) < 1e-6, 'its opacity is .5, as before', String(r.op));
        ok(Math.abs(r.lineW - 2.4) < 0.05, `its lines scale with it: ${r.lineW.toFixed(2)} px (the 64px web drew 1.60)`, String(r.lineW));
        ok(r.pe === 'none' && r.svgPe === 'none', 'pointer-events: none on the web and its drawing', `${r.pe} ${r.svgPe}`);
        ok(r.hits === 0, `no point of its box hit-tests to the web (${r.n} points)`, `${r.hits} hits`);
        ok(r.under === 'corner-btn', 'a button under the web is what a tap there finds', r.under);
        await ses.page.mouse.click(r.vw - 28, 28);
        const clicks = await ses.page.evaluate(() => window.cornerClicks);
        ok(clicks === 1, 'a click on that button, through the web, reaches it', String(clicks));
      } finally { await ses.close(); }
    }
  }
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
