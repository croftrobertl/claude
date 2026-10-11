'use strict';
/**
 * DCC Seasons — sprites a labeller once called "not referenced", and the
 * heron that replaced three of them.
 *
 * heron0, heron1, heron2 and letter1 were flagged by the sheet's theme
 * labeller in 4.1.0. All four WERE drawn, by forms the labeller could not
 * see: the heron frames from an ARRAY indexed at draw time, letter1 by a
 * TERNARY on the particle's height (key = p.y > vh * 0.5 ? 'letter1' :
 * 'letter0').
 *
 * 4.9.0 retired the three heron sprites: the heron is drawn in code (Rob's
 * style A) and pre-drawn as pose canvases. Its pose keys (b0-b23 beat,
 * g1-g6 glide) are computed, never written as literals, so the same rule
 * applies — prove it DRAWS: force a heron, watch the wingbeat run through
 * its poses, and read the canvas's own pixels where the bird is.
 *
 * Usage: node tools/test-orphans.js
 */
const { config, open, settle } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0;
const problems = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; problems.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

/* ------------------------------------------------- the heron flyover */
async function heron() {
  console.log('\n=== the heron actually flies, and its wingbeat reaches the screen ===');
  /* 'valentines' has no theme hero of its own, so heroPool is ['heron']
   * alone and pick() cannot choose anything else. heroFirst puts the first
   * one a second in (since 4.9.0 it would otherwise follow the first
   * scene), heroevery=1 the next ones a second after each leaves. */
  const cfg = config(['--theme=valentines', '--placement=content', '--layering=front',
    '--heroevery=1', '--noparticles', '--diag']);
  cfg.heroFirst = [1, 1.5]; cfg.heronLand = 0;
  const ses = await open(fixture({ kind: 'bravada', config: cfg }));
  try {
    await settle(ses.page);
    const seen = await ses.page.evaluate(() => new Promise(resolve => {
      const frames = {};
      let kind = null, ticks = 0, ink = 0;
      const cv = document.querySelector('canvas.dcc-seasons-canvas');
      const g = cv.getContext('2d', { willReadFrequently: true });
      const id = setInterval(() => {
        const st = window.DCCSeasonsEngine._state;
        if (st.hero) {
          kind = st.hero;
          if (st.heroFrame) { frames[st.heroFrame] = (frames[st.heroFrame] || 0) + 1; }
          /* Canvas ink: with --noparticles and the subtle layer the only
           * large opaque thing on the canvas is the bird. */
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          let lit = 0;
          for (let i = 3; i < d.length; i += 4 * 11) { if (d[i] > 40) lit++; }
          ink = Math.max(ink, lit);
        }
        if (++ticks > 150) { clearInterval(id); resolve({ kind, frames, ink, cached: window.DCCSeasonsEngine._state.heron.cached }); }
      }, 90);
    }));
    console.log('  ', JSON.stringify(seen));
    ok(seen.kind === 'heron', 'a heron hero spawned', String(seen.kind));
    const got = Object.keys(seen.frames), beats = got.filter(k => /^b\d+$/.test(k));
    /* a continuous wingbeat: sampled every 90 ms at two beats a second,
     * the crossing shows a good spread of the 24 beat poses */
    ok(beats.length >= 12, 'the wingbeat runs through at least 12 of its 24 poses', `saw ${got.join(', ') || 'nothing'}`);
    ok(seen.ink > 0, 'the bird puts ink on the canvas', `max lit ${seen.ink}`);
    ok(seen.cached >= 26, 'the poses were pre-drawn (beat, glide, flare, standing)', `cached ${seen.cached}`);
  } finally { await ses.close(); }
}

/* ---------------------------------------------------------- letter1 */
async function letters() {
  console.log('\n=== letter1 is drawn: the envelope swaps art by height ===');
  /* valentines carries the fx:'letter' particle. The swap is
   * key = p.y > vh*0.5 ? 'letter1' : 'letter0', so BOTH keys are reachable
   * within one field as the letters fall past the midline. */
  const cfg = config(['--theme=valentines', '--placement=content', '--layering=front',
    '--density=16', '--diag']);
  const ses = await open(fixture({ kind: 'bravada', config: cfg }));
  try {
    await settle(ses.page);
    /* The letter is one weighted entry among several, so a single field
     * need not contain one. Re-seed until it does rather than calling a
     * weighted miss a failure. */
    await ses.page.evaluate(() => {
      const st = window.DCCSeasonsEngine._state;
      for (let i = 0; i < 40; i++) {
        if (st.parts.some(p => p.sp && p.sp.def && p.sp.def.fx === 'letter')) { break; }
        st.reseed(true);
      }
    });
    const r = await ses.page.evaluate(() => {
      const st = window.DCCSeasonsEngine._state;
      /* The spec lives at p.sp.def, not p.def — p.def is undefined, so a
       * probe reading it finds nothing and reports a false negative. */
      const lets = st.parts.filter(p => p.sp && p.sp.def && p.sp.def.fx === 'letter');
      return {
        letterParticles: lets.length,
        vh: st.vh,
        /* Which key each one would resolve to right now. */
        above: lets.filter(p => p.y <= st.vh * 0.5).length,
        below: lets.filter(p => p.y > st.vh * 0.5).length,
      };
    });
    console.log('  ', JSON.stringify(r));
    ok(r.letterParticles > 0, 'the valentines field carries fx:"letter" particles',
      `found ${r.letterParticles}`);

    /* Now watch one cross the midline, which is the only thing that makes
     * letter1 appear. Sampling the resolved key over time is the honest
     * check: a particle sitting still above the line would never show it.
     * On the MOCKED clock (90 simulated seconds): sampling 11 s of wall
     * time failed on a loaded machine that ran too few frames for a slow
     * letter to fall that far — the same trap as test-v21's bass check. */
    const swap = await ses.page.evaluate(() => {
      const st = window.DCCSeasonsEngine._state, keys = {};
      st.manual(true);
      for (let i = 0; i < 90 * 10; i++) {
        st.tick(1000 / 60, 6);
        for (const p of st.parts) {
          if (p.sp && p.sp.def && p.sp.def.fx === 'letter' && !p.dormant) {
            keys[p.y > st.vh * 0.5 ? 'letter1' : 'letter0'] = 1;
          }
        }
        if (keys.letter0 && keys.letter1) { break; }
      }
      return Object.keys(keys).sort();
    });
    console.log('   resolved keys over time:', JSON.stringify(swap));
    ok(swap.includes('letter1'), 'letter1 is the key a falling letter resolves to below the midline',
      JSON.stringify(swap));
  } finally { await ses.close(); }
}

(async () => {
  await heron();
  await letters();
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
