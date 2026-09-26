'use strict';
/**
 * DCC Seasons — Layer 1 (the subtle layer) actually renders, and stays subtle.
 *
 * An exit code is not a test result, so this reads the CANVAS'S OWN PIXELS.
 * Two things have to be true at once and they pull against each other:
 *
 *   it must DRAW          — pixels change between frames, and the layer's
 *                           own pixels are there when the sprites are not;
 *   it must stay SUBTLE   — coverage and opacity stay low. An effect that
 *                           passes "it renders" by painting half the screen
 *                           has failed the actual requirement.
 *
 * Sprites are silenced with density=0 so what is measured is Layer 1 alone,
 * and each effect is pinned rather than left to today's date, or the suite
 * would test something different every week.
 *
 * Usage: node tools/test-subtle.js [--sheet]
 */
const fs = require('fs');
const path = require('path');
const { config, open, settle } = require('./harness');
const { page: fixture } = require('./fixture');

const EFFECTS = ['leaves', 'snow', 'blossom', 'dragonheat', 'hearts', 'confetti', 'embers', 'sparks', 'bokeh'];
const SHEET = process.argv.includes('--sheet');
const OUT = path.resolve(__dirname, '..', 'build');

let pass = 0, fail = 0;
const problems = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}

/** Ink on the canvas: fraction of sampled pixels with any alpha, and the
 *  mean alpha of those that have some. Read from the canvas itself. */
const INK = () => {
  const cv = document.querySelector('canvas.dcc-seasons-canvas');
  if (!cv) return null;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const w = cv.width, h = cv.height;
  let d;
  try { d = g.getImageData(0, 0, w, h).data; } catch (e) { return { error: String(e) }; }
  let lit = 0, sum = 0, n = 0;
  // Stride the buffer — a full scan of a 2000px canvas is slow — but only
  // lightly. At stride 7 a nine-particle field could fall between samples
  // and report an empty canvas on a build that was drawing correctly.
  for (let i = 3; i < d.length; i += 4 * 2) {
    n++;
    if (d[i] > 2) { lit++; sum += d[i]; }
  }
  return { sampled: n, litPct: +(lit / n * 100).toFixed(2), meanAlpha: lit ? +(sum / lit).toFixed(1) : 0 };
};

async function one(effect) {
  console.log(`\n  --- ${effect} ---`);
  /* --noparticles AND richness=minimal leave Layer 1 alone on the canvas.
   * Neither alone is enough, and the obvious lever is a trap: --density=0
   * yields TEN sprites, not none, because the engine reads
   * `CFG.density || 10`. richness=minimal drops the heroes and vignettes
   * but not the sprites, and the year-round heron is opaque, so it
   * dominated the mean-alpha reading and made effects look like failures
   * when the numbers were measuring a heron. */
  const cfg = config([`--subtle=${effect}`, '--theme=florida_keys', '--placement=content',
    '--noparticles', '--richness=minimal', '--diag']);
  const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width: 1280, height: 900 } });
  try {
    await settle(ses.page);
    await ses.page.evaluate(() => window.scrollTo(0, 600));
    await ses.page.waitForTimeout(900);

    const st = await ses.page.evaluate(() => {
      const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
      return s ? s.subtle : null;
    });
    console.log('    state:', JSON.stringify(st));
    ok(!!st && st.on, 'effect is active', JSON.stringify(st));
    ok(!!st && st.n >= 3, 'seeded at least 3 particles', st ? `n=${st.n}` : 'no state');

    /* Take the best of three: a sparse field plus a strided read is a
     * sampling process, and one unlucky read is not evidence of a broken
     * layer. The ceilings below are still applied to the WORST case. */
    const reads = [];
    for (let i = 0; i < 3; i++) {
      reads.push(await ses.page.evaluate(INK));
      await ses.page.waitForTimeout(220);
    }
    const a = reads[0], b = reads[reads.length - 1];
    const best = reads.reduce((m, r) => (r && !r.error && r.litPct > m.litPct ? r : m), { litPct: 0, meanAlpha: 0 });
    console.log('    ink:', JSON.stringify(a), '->', JSON.stringify(b));

    /* Motion is asked of the PARTICLES, not of the pixels: positions are
     * exact, ink is a sample. */
    const moved = await ses.page.evaluate((before) => {
      const s = window.DCCSeasonsEngine._state.subtle;
      return s.pos.some((p, i) => !before[i] || p.x !== before[i].x || p.y !== before[i].y);
    }, st ? st.pos : []);
    ok(moved, 'the layer animates', 'no particle moved between samples');

    if (a && !a.error && b) {
      ok(best.litPct > 0.005, 'the layer puts ink on the canvas', `best of 3 reads lit ${best.litPct}%`);
      /* Subtle means subtle. Bokeh is the widest of the set by design
       * (large soft discs), so the ceiling has to clear it while still
       * failing anything that reads as a second sprite show. */
      ok(best.litPct < 25, 'the layer stays sparse', `lit ${best.litPct}% of the canvas`);
      ok(best.meanAlpha === 0 || best.meanAlpha < 190, 'the layer stays translucent', `mean alpha ${best.meanAlpha}/255`);
    } else {
      ok(false, 'canvas pixels readable', a ? a.error : 'no canvas');
    }

    if (SHEET) {
      fs.mkdirSync(OUT, { recursive: true });
      /* Screenshot the VIEWPORT, not the canvas element. The canvas is
       * transparent except where the layer paints, so a canvas-only capture
       * is a PNG of mostly nothing and tells you nothing about how the
       * effect reads over the page it actually sits behind. */
      await ses.page.screenshot({ path: path.join(OUT, `Seasons - subtle ${effect}.png`) });
    }
    return st;
  } finally { await ses.close(); }
}

(async () => {
  /* Off must mean off: the switch is a real switch, not a dimmer. */
  console.log('\n  --- off ---');
  {
    const cfg = config(['--subtle=off', '--theme=florida_keys', '--placement=content',
      '--noparticles', '--richness=minimal', '--diag']);
    const ses = await open(fixture({ kind: 'bravada', config: cfg }));
    try {
      await settle(ses.page);
      const st = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
        return s ? s.subtle : null;
      });
      console.log('    state:', JSON.stringify(st));
      ok(!!st && !st.on && st.n === 0, 'subtle=off renders nothing', JSON.stringify(st));
    } finally { await ses.close(); }
  }

  /* Intensity 0 must mean off too. The alpha curve has a deliberate floor
   * and the count is floored at 3, so before 4.1.3 a slider dragged to zero
   * still drew three particles at over half strength. */
  console.log('\n  --- intensity 0 ---');
  {
    const cfg = config(['--subtle=leaves', '--intensity=0', '--theme=florida_keys', '--placement=content',
      '--noparticles', '--richness=minimal', '--diag']);
    const ses = await open(fixture({ kind: 'bravada', config: cfg }));
    try {
      await settle(ses.page);
      const st = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
        return s ? s.subtle : null;
      });
      console.log('    state:', JSON.stringify(st));
      ok(!!st && !st.on && st.n === 0, 'intensity 0 renders nothing', JSON.stringify(st));
    } finally { await ses.close(); }
  }

  for (const e of EFFECTS) { await one(e); }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (SHEET) { console.log(`contact sheets in ${OUT}/`); }
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
