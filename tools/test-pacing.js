'use strict';
/**
 * DCC Seasons — the lighter frame loop (4.6.0, Rob 2026-10-06: "make it
 * lighter, keep the look exactly as it is"). On the REAL rAF loop, not the
 * mocked clock, because pacing is exactly what the mocked clock bypasses.
 *
 *   - background layer alone → ~30 repaints a second, and the partial
 *     clears leave NO trail: after every sampled frame, no painted pixel
 *     lies outside the boxes of the particles just drawn (six effects);
 *   - nothing to draw → no repaints at all, yet a hero still starts on time
 *     and is drawn at full rate;
 *   - hidden tab → no repaints, resumes when shown;
 *   - footer canvas scrolled off-screen → no repaints, resumes on screen;
 *   - a removed canvas is still put back (the loop must not stop for it);
 *   - reduced motion → no engine, as before.
 *
 * Usage: node tools/test-pacing.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
/* one count per drawn frame (a frame's clears land within a few ms) */
const COUNTER = () => {
  const orig = CanvasRenderingContext2D.prototype.clearRect;
  window.__frames = 0; window.__full = 0;
  CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
    if (this.canvas && this.canvas.classList && this.canvas.classList.contains('dcc-seasons-canvas')) {
      const now = performance.now();
      if (!(now - (window.__lc || 0) < 5)) { window.__frames++; }
      window.__lc = now;
      if (x === 0 && y === 0 && w >= this.canvas.clientWidth - 1) { window.__full++; }
    }
    return orig.apply(this, arguments);
  };
};
async function boot(args, tweak, opts = {}) {
  const cfg = config(['--layering=front', '--placement=content', '--density=16', '--diag', ...args]);
  if (tweak) { tweak(cfg); }
  const html = fixture({ kind: 'bravada', config: cfg });
  const ses = await open('<!doctype html><title>x</title>', { viewport: opts.viewport || { width: 390, height: 844 }, reducedMotion: opts.reducedMotion });
  await ses.page.addInitScript(COUNTER);
  /* a LATER page of the visit, so no first-page hero crosses at 3-5 s */
  if (!opts.firstPage) { await ses.page.addInitScript(() => { try { sessionStorage.setItem('dcc_seasons_visit', '1'); } catch (e) { /* blocked */ } }); }
  await ses.page.route('http://dcc.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await ses.page.goto('http://dcc.test/', { waitUntil: 'load' });
  return ses;
}
const S = () => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
const framesIn = (page, ms) => page.evaluate(ms => new Promise(r => { const a = window.__frames; setTimeout(() => r(window.__frames - a), ms); }), ms);
const QUIET = c => { c.heroEvery = [9999, 10000]; c.vigFirst = 1e9; };

(async () => {
  console.log('\n  --- background layer alone: 30 repaints a second, and no trails ---');
  /* Each effect pinned on Halloween (--subtle=<effect>): New Year's and
   * July 4 run fireworks, which keep the full rate by design. */
  for (const effect of ['embers', 'confetti', 'sparks', 'bokeh', 'leaves', 'dragonheat']) {
    const ses = await boot(['--theme=halloween', '--ambient=0', `--subtle=${effect}`], QUIET);
    try {
      await ses.page.waitForFunction(S, null, { timeout: 15000 });
      await ses.page.waitForTimeout(2500);
      const n = await framesIn(ses.page, 3000);
      /* sample right after a frame: in the next rAF callback, before ours */
      const trail = await ses.page.evaluate(async () => {
        const s = window.DCCSeasonsEngine._state, cv = document.querySelector('canvas.dcc-seasons-canvas');
        const g = cv.getContext('2d'), W = cv.width, H = cv.height, k = W / cv.clientWidth;
        let worst = 0, samples = 0;
        for (let i = 0; i < 12; i++) {
          await new Promise(r => setTimeout(r, 140));
          const st = s.subtle; if (!st.on) { return { off: true }; }
          const d = g.getImageData(0, 0, W, H).data;
          const boxes = st.pos.map(p => { const h = ((p.r || 6) * 4 + 4) * k; return [p.x * k - h, p.y * k - h, p.x * k + h, p.y * k + h]; });
          if (st.shimmer) { const base = (s.waterY || cv.clientHeight * 0.92) * k; boxes.push([0, base - 40 * k, W, base + 12 * k]); }
          let stray = 0;
          for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
            if (d[(y * W + x) * 4 + 3] < 8) { continue; }
            if (!boxes.some(b => x >= b[0] - 1 && x <= b[2] + 1 && y >= b[1] - 1 && y <= b[3] + 1)) { stray++; }
          }
          worst = Math.max(worst, stray); samples++;
        }
        return { worst, samples, key: s.subtle.key };
      });
      ok(n >= 75 && n <= 100, `${effect}: ${(n / 3).toFixed(1)} repaints/s (target 30)`, `${n} in 3 s`);
      ok(!trail.off && trail.worst === 0, `${effect}: no painted pixel outside the drawn particles' boxes (${trail.samples} samples)`, JSON.stringify(trail));
    } finally { await ses.close(); }
  }

  console.log('\n  --- nothing to draw: no repaints, and the hero still comes ---');
  {
    const ses = await boot(['--theme=earth_day', '--ambient=0', '--subtle=off'], c => { c.heroEvery = [6, 7]; c.vigFirst = 1e9; });
    try {
      await ses.page.waitForFunction(S, null, { timeout: 15000 });
      await ses.page.waitForTimeout(800);
      const quiet = await framesIn(ses.page, 2500);
      ok(quiet === 0, 'before the hero: no repaints at all', `${quiet} frames`);
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.hero, null, { timeout: 20000 });
      const during = await framesIn(ses.page, 1000);
      ok(during >= 45, `the hero is drawn at full rate (${during}/s)`, `${during}`);
    } finally { await ses.close(); }
  }

  console.log('\n  --- hidden tab: stop, then resume ---');
  {
    const ses = await boot(['--theme=halloween', '--ambient=0'], QUIET);
    try {
      await ses.page.waitForFunction(S, null, { timeout: 15000 });
      await ses.page.waitForTimeout(1500);
      const hide = h => ses.page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
      await hide(true);
      await ses.page.waitForTimeout(200);
      const hidden = await framesIn(ses.page, 2000);
      await hide(false);
      await ses.page.waitForTimeout(200);
      const shown = await framesIn(ses.page, 2000);
      ok(hidden === 0, 'hidden: no repaints', `${hidden}`);
      ok(shown >= 45, `shown again: repainting (${shown} in 2 s)`, `${shown}`);
    } finally { await ses.close(); }
  }

  console.log('\n  --- footer canvas scrolled off-screen: stop, then resume ---');
  {
    const ses = await boot(['--theme=halloween', '--ambient=0', '--placement=footer'], QUIET);
    try {
      await ses.page.waitForFunction(S, null, { timeout: 15000 });
      await ses.page.waitForTimeout(1500);
      const away = await framesIn(ses.page, 2000);
      await ses.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await ses.page.waitForTimeout(400);
      const seen = await framesIn(ses.page, 2000);
      await ses.page.evaluate(() => window.scrollTo(0, 0));
      await ses.page.waitForTimeout(400);
      const away2 = await framesIn(ses.page, 2000);
      ok(away === 0 && away2 === 0, 'footer below the fold: no repaints (before and after a visit)', `${away}, ${away2}`);
      ok(seen >= 45, `footer on screen: repainting (${seen} in 2 s)`, `${seen}`);
    } finally { await ses.close(); }
  }

  console.log('\n  --- a removed canvas is still put back ---');
  {
    const ses = await boot(['--theme=halloween', '--ambient=0', '--layering=behind'], QUIET);
    try {
      await ses.page.waitForFunction(S, null, { timeout: 15000 });
      await ses.page.waitForTimeout(1500);
      await ses.page.evaluate(() => { const c = document.querySelector('canvas.dcc-seasons-canvas'); c.parentNode.removeChild(c); });
      await ses.page.waitForTimeout(2500);
      const back = await ses.page.evaluate(() => !!document.querySelector('canvas.dcc-seasons-canvas') && document.body.contains(document.querySelector('canvas.dcc-seasons-canvas')));
      ok(back, 're-mounted after removal', '');
    } finally { await ses.close(); }
  }

  console.log('\n  --- reduced motion: as before, no engine ---');
  {
    const ses = await boot(['--theme=halloween', '--ambient=0'], QUIET, { reducedMotion: 'reduce' });
    try {
      await ses.page.waitForTimeout(3000);
      const r = await ses.page.evaluate(() => ({ eng: !!window.DCCSeasonsEngine, canvas: !!document.querySelector('canvas.dcc-seasons-canvas'), frames: window.__frames }));
      ok(!r.canvas && !r.frames, 'no canvas, no repaints', JSON.stringify(r));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { console.log(problems.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
