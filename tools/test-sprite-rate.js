'use strict';
/**
 * DCC Seasons — the falling sprites paint at 30 fps, whatever the display
 * does (4.12.2, Rob's pick from the 4.12.1 side-by-side).
 *
 * The pacing is TIME-based, not frame-counting, and this suite is the proof.
 * Each case replaces requestAnimationFrame with a shim driven at a fixed
 * interval — a mocked display — and counts the engine's own canvas clears:
 *
 *   60 Hz   the ordinary case: 30, every second frame;
 *   120 Hz  an iPhone Pro: 30, NOT 60 (frame-skipping would give 60);
 *   30 Hz   a phone in Low Power Mode, whose rAF is already throttled: ~30,
 *           NOT 15 (the cap must not stack on the throttle);
 *   75 Hz   13.3 ms against a 33.3 ms period, so the period is not a whole
 *           number of frames: the carried remainder must still average 30
 *           rather than settling on the next whole multiple (25).
 *
 * It also proves a flyer keeps the full rate on a 120 Hz display, and that
 * a sprite covers the same distance in three seconds whether that time
 * arrives in 60 steps or 30 — the motion step reads real elapsed time, so
 * only the moment of painting changed.
 *
 *   node tools/test-sprite-rate.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}

/* One count per drawn frame of either canvas, as test-pacing.js counts. */
const COUNTER = () => {
  const orig = CanvasRenderingContext2D.prototype.clearRect;
  window.__frames = 0;
  CanvasRenderingContext2D.prototype.clearRect = function () {
    const c = this.canvas;
    if (c && c.classList && (c.classList.contains('dcc-seasons-canvas') || c.classList.contains('dcc-seasons-sky'))) {
      const now = performance.now();
      if (!(now - (window.__lc || 0) < 5)) { window.__frames++; }
      window.__lc = now;
    }
    return orig.apply(this, arguments);
  };
};

/* A display of exactly HZ, in place of the real one. A CONTINUOUS ticker,
 * not a timer started per request: a real display hands out frames on its
 * own grid, and a shim that starts counting from each request would hide a
 * build that paced itself by asking late. */
const DISPLAY = hz => `(() => {
  var I = 1000 / ${hz}, q = [];
  setInterval(function () {
    if (!q.length) { return; }
    var run = q; q = [];
    var t = performance.now();
    for (var i = 0; i < run.length; i++) { try { run[i](t); } catch (e) {} }
  }, I);
  window.requestAnimationFrame = function (fn) { q.push(fn); return q.length; };
  window.cancelAnimationFrame = function () {};
})();`;

const SPRITES_ONLY = c => {
  c.heroEvery = [9999, 10000]; c.heroFirst = [9999, 10000];
  c.vigFirst = 1e9; c.vigGap = 1e9; c.forceHour = 12;
};

async function boot(args, tweak, opts = {}) {
  const cfg = config(['--layering=front', '--placement=content', '--density=16', '--diag', ...args]);
  if (tweak) { tweak(cfg); }
  const html = fixture({ kind: 'bravada', config: cfg, banner: true });
  const ses = await open('<!doctype html><title>x</title>', {
    viewport: opts.viewport || { width: 390, height: 844 }, dsf: opts.dsf,
  });
  await ses.page.addInitScript(COUNTER);
  /* A seeded Math.random makes the FIELD identical between two runs. The
   * speed check compares two builds, and each sprite draws its own speed
   * and size at random: a median over seven random sprites differs by ~14%
   * between unseeded runs of the SAME build, which reads as a regression
   * that is not there (measured). */
  if (opts.seed) {
    await ses.page.addInitScript({ content: `(() => { let a = ${opts.seed} >>> 0; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();` });
  }
  if (opts.hz) { await ses.page.addInitScript({ content: DISPLAY(opts.hz) }); }
  /* a LATER page of the visit, so no first-page flyer crosses */
  await ses.page.addInitScript(() => { try { sessionStorage.setItem('dcc_seasons_visit', '1'); } catch (e) {} });
  await ses.page.route('http://dcc.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await ses.page.goto('http://dcc.test/', { waitUntil: 'load' });
  return ses;
}
const S = () => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
const framesIn = (page, ms) => page.evaluate(ms => new Promise(r => { const a = window.__frames; setTimeout(() => r(window.__frames - a), ms); }), ms);

/* How far each live sprite TRAVELS over a stretch of simulated time, on the
 * mocked clock, in steps of a chosen length. Path length, not net
 * displacement: a bat's net displacement over three seconds depends on
 * where it is in its wiggle, and sampling that wiggle at 30 instead of 60
 * made it read 19 px against 36 — an artefact of the path, not a change of
 * speed (measured). Path length is wiggle-proof and agrees to 0.02%.
 *
 * A respawn teleports a sprite, so a step longer than 60 px is not travel. */
const TRAVEL = (page, step, n) => page.evaluate(([step, n]) => {
  const s = window.DCCSeasonsEngine._state;
  s.manual(true);
  const key = p => (p.sp && (p.sp.s || '')) + '';
  const live = () => s.parts.filter(p => !p.dormant).map(p => ({ k: key(p), x: p.x, y: p.y }));
  let prev = live();
  const path = prev.map(() => 0);
  for (let i = 0; i < n; i++) {
    s.tick(step, 1);
    const now = live();
    for (let j = 0; j < Math.min(prev.length, now.length); j++) {
      if (prev[j].k !== now[j].k) { continue; }
      const d = Math.hypot(now[j].x - prev[j].x, now[j].y - prev[j].y);
      if (d < 60) { path[j] += d; }
    }
    prev = now;
  }
  return prev.map((p, j) => ({ k: p.k, d: +path[j].toFixed(3) }));
}, [step, n]);

(async () => {
  /* ---- the rate, on four displays, at two widths ---- */
  for (const [hz, note] of [[60, 'the ordinary display'], [120, 'an iPhone Pro'], [30, 'Low Power Mode (rAF already throttled)'], [75, 'a period that is not a whole number of frames']]) {
    console.log(`\n  --- ${hz} Hz — ${note} ---`);
    for (const width of [390, 1280]) {
      const ses = await boot(['--theme=halloween', '--subtle=off'], SPRITES_ONLY, { hz, viewport: { width, height: width < 768 ? 844 : 800 } });
      try {
        await ses.page.waitForFunction(S, null, { timeout: 20000 });
        await ses.page.waitForTimeout(2500);
        const n = await framesIn(ses.page, 4000);
        const st = await ses.page.evaluate(() => {
          const s = window.DCCSeasonsEngine._state;
          return { live: s.live, ripples: s.ripples, hero: s.hero, vig: s.vig, subtle: s.subtle.on };
        });
        const fps = n / 4;
        ok(st.live > 0 && !st.hero && !st.vig && !st.ripples && !st.subtle,
          `${width}px: ${st.live} sprites moving and nothing else on the canvas`, JSON.stringify(st));
        ok(fps >= 28 && fps <= 32, `${width}px: ${fps.toFixed(1)} sprite repaints/s (target 30 ±2)`, `${n} in 4 s at ${hz} Hz`);
      } finally { await ses.close(); }
    }
  }

  /* ---- a flyer keeps the full rate, even on a 120 Hz display ---- */
  console.log('\n  --- a flyer keeps its own rate at 120 Hz ---');
  for (const [theme, kind, where] of [['fall_fishing', 'bass', 'the page canvas'], ['halloween', 'witch', 'the header picture']]) {
    const ses = await boot([`--theme=${theme}`, '--subtle=off'], c => { SPRITES_ONLY(c); c.heroOnly = kind; c.heroFirst = [3, 3.2]; }, { hz: 120 });
    try {
      await ses.page.waitForFunction(S, null, { timeout: 20000 });
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.hero, null, { timeout: 30000 });
      const n = await framesIn(ses.page, 700);
      const r = await ses.page.evaluate(() => ({ kind: window.DCCSeasonsEngine._state.hero, sky: window.DCCSeasonsEngine._state.sky.heroSky }));
      const fps = n / 0.7;
      ok(r.kind === kind, `the ${kind} is flying (${r.kind}), on ${where}${r.sky ? ' (sky canvas)' : ''}`, JSON.stringify(r));
      ok(fps >= 90, `and it is drawn at the display's rate, not 30 (${fps.toFixed(0)}/s)`, `${n} in 0.7 s`);
    } finally { await ses.close(); }
  }

  /* ---- the sprites move at the same speed, however the time is sliced ---- */
  console.log('\n  --- sprite speed in px per second is unchanged ---');
  /* The motion step reads REAL elapsed time, so the same stretch of time
   * must produce the same travel whether it arrives in 60 steps a second or
   * 30. Measured on the mocked clock with a seeded field, which makes this
   * exact rather than a comparison of two noisy samples. */
  {
    const runs = {};
    for (const [label, step, n] of [['60 fps', 1000 / 60, 180], ['30 fps', 1000 / 30, 90]]) {
      const ses = await boot(['--theme=halloween', '--subtle=off'], SPRITES_ONLY, { seed: 11 });
      try {
        await ses.page.waitForFunction(S, null, { timeout: 20000 });
        runs[label] = await TRAVEL(ses.page, step, n);
      } finally { await ses.close(); }
    }
    const a = runs['60 fps'], b = runs['30 fps'];
    const sum = x => x.reduce((n, o) => n + o.d, 0);
    ok(a.length > 0 && a.length === b.length, `the same ${a.length} sprites in both runs`, JSON.stringify([a.length, b.length]));
    const worst = a.reduce((w, o, i) => {
      if (!b[i] || b[i].k !== o.k || !o.d) { return w; }
      const d = Math.abs(o.d - b[i].d) / o.d;
      return d > w.d ? { d, k: o.k, a: o.d, b: b[i].d } : w;
    }, { d: 0, k: '' });
    ok(worst.d <= 0.01, `every sprite travels the same distance in 3 s either way (worst ${worst.k || 'n/a'}: ${(worst.d * 100).toFixed(2)}%)`, JSON.stringify(worst));
    const drift = Math.abs(sum(a) - sum(b)) / sum(a);
    ok(drift <= 0.005, `3 s of travel: ${sum(a).toFixed(1)} px at 60 steps, ${sum(b).toFixed(1)} px at 30 (${(drift * 100).toFixed(2)}%)`,
      JSON.stringify({ a: sum(a), b: sum(b) }));
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
