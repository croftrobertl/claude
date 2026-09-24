'use strict';
/**
 * DCC Seasons — the MINIFIED build is the one that ships, so prove it runs.
 *
 * A stale .min.js has already cost this project a round: engine.js was
 * edited, only the readable file was copied into the fixtures, and a
 * working change was photographed as a regression. The minified build also
 * compiles out __DCC_DEBUG__, so it takes a different path through the
 * engine than every other suite exercises.
 *
 * Usage: node tools/test-min.js
 */
const { config, open, settle } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0;
function ok(c, label, detail) {
  if (c) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  for (const placement of ['content', 'footer']) {
    console.log(`\n=== minified build — placement: ${placement} ===`);
    const cfg = config(['--min', `--placement=${placement}`, '--theme=halloween']);
    const ses = await open(fixture({ kind: 'elementor', config: cfg }));
    try {
      await settle(ses.page);
      const r = await ses.page.evaluate(() => {
        const cv = document.querySelector('canvas.dcc-seasons-canvas');
        if (!cv) return { canvas: false };
        const g = cv.getContext('2d', { willReadFrequently: true });
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let lit = 0;
        for (let i = 3; i < d.length; i += 4 * 9) { if (d[i] > 2) lit++; }
        const cs = getComputedStyle(cv);
        return { canvas: true, lit, pe: cs.pointerEvents, engine: !!window.DCCSeasonsEngine,
                 state: !!(window.DCCSeasonsEngine && window.DCCSeasonsEngine._state) };
      });
      console.log('  ', JSON.stringify(r));
      ok(r.canvas, 'the minified engine mounts a canvas');
      ok(r.engine, 'DCCSeasonsEngine is exported');
      ok(r.pe === 'none', 'canvas is pointer-events:none');
      ok(r.lit > 0, 'something is drawn', `lit=${r.lit}`);
      /* __DCC_DEBUG__ is compiled out, so _state must NOT exist: its
       * presence would mean the debug build shipped. */
      ok(!r.state, '_state is compiled out of the shipping build');
      const errs = ses.logs.filter(l => /pageerror|error:/i.test(l));
      ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));
    } finally { await ses.close(); }
  }
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
