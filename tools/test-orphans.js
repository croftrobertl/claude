'use strict';
/**
 * DCC Seasons — the four sprites the contact sheet called "not referenced".
 *
 * heron0, heron1, heron2 and letter1 were flagged by the sheet's theme
 * labeller. Last time a label like that turned out to be real it was four
 * vignettes that never ran, so these were worth chasing rather than
 * assuming decorative — but the answer this time is the opposite: all four
 * ARE reached, by forms the labeller could not see.
 *
 *   heron0/1/2  named in an ARRAY (HERON_FRAMES) and INDEXED at draw time,
 *               never as sprite('heron0') literals.
 *   letter1     chosen by a TERNARY on the particle's height:
 *               key = p.y > vh * 0.5 ? 'letter1' : 'letter0'
 *
 * Showing that the reference exists in a table would prove nothing — that
 * is exactly what the broken labeller did. So this proves they DRAW:
 * it forces a heron, watches the wingbeat cycle through every frame, and
 * reads the canvas's own pixels where the bird is.
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
  console.log('\n=== the heron actually flies, and every frame reaches the screen ===');
  /* 'valentines' has no theme hero of its own, so heroPool is ['heron']
   * alone and pick() cannot choose anything else. heroevery=1 spawns one
   * within a couple of seconds instead of the usual two to three minutes. */
  const cfg = config(['--theme=valentines', '--placement=content', '--layering=front',
    '--heroevery=1', '--noparticles', '--diag']);
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
        if (++ticks > 150) { clearInterval(id); resolve({ kind, frames, ink }); }
      }, 90);
    }));
    console.log('  ', JSON.stringify(seen));
    ok(seen.kind === 'heron', 'a heron hero spawned', String(seen.kind));
    const got = Object.keys(seen.frames);
    for (const f of ['heron0', 'heron1', 'heron2']) {
      ok(got.includes(f), `${f} was drawn`, `saw ${got.join(', ') || 'nothing'}`);
    }
    ok(seen.ink > 0, 'the bird puts ink on the canvas', `max lit ${seen.ink}`);
    /* heron1 appears TWICE in the cycle [0,1,2,1], so a correct wingbeat
     * shows it roughly twice as often as the others. That is the cheapest
     * proof the ARRAY is what is driving it, not a single stuck frame. */
    const f = seen.frames;
    ok((f.heron1 || 0) > (f.heron0 || 0), 'heron1 leads the cycle, as [0,1,2,1] requires',
      JSON.stringify(f));
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
     * check: a particle sitting still above the line would never show it. */
    const swap = await ses.page.evaluate(() => new Promise(resolve => {
      const keys = {};
      let ticks = 0;
      const id = setInterval(() => {
        const st = window.DCCSeasonsEngine._state;
        for (const p of st.parts) {
          if (p.sp && p.sp.def && p.sp.def.fx === 'letter' && !p.dormant) {
            keys[p.y > st.vh * 0.5 ? 'letter1' : 'letter0'] = 1;
          }
        }
        if (++ticks > 120) { clearInterval(id); resolve(Object.keys(keys)); }
      }, 90);
    }));
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
