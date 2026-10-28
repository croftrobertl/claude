'use strict';
/**
 * DCC Seasons — the Untouched test's pixel half: play every theme on the
 * mocked clock with a SEEDED Math.random and a pinned Date, and print a
 * hash of what the canvases hold at fixed moments. Run it once per build
 * (DCC_ASSETS= points the harness at another build's js folder) and compare
 * the two outputs: a theme whose hashes differ draws differently.
 *
 *   node tools/untouched-hash.js [--themes=a,b] [--width=390] [--secs=24]
 *   DCC_ASSETS=<old js folder> node tools/untouched-hash.js …
 */
const crypto = require('crypto');
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('width', 390), SECS = +arg('secs', 24);
/* the moments sampled, in simulated seconds: the field settling, the first
 * scene (6-10 s in), and after it */
const AT = [2, 5, 8, 11, 14, 18, 24].filter(s => s <= SECS);
const INIT = `(() => {
  /* no real frame ever runs: the engine is driven by the mocked clock alone
   * (real frames between start and manual() ran a varying number of times,
   * and the hashes at 2 s and 5 s differed run to run in ONE build) */
  const RAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { return window.__free ? RAF(cb) : 0; };
  let a = 0x9E3779B9;
  Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const T0 = Date.UTC(2026, 9, 14, 16, 0, 0), RD = Date;
  function D(...x) { return x.length ? new RD(...x) : new RD(T0); }
  D.now = () => T0; D.UTC = RD.UTC; D.parse = RD.parse; D.prototype = RD.prototype;
  window.Date = D;
})();`;

(async () => {
  const all = Object.keys(config(['--diag']).themes || {});
  const themes = arg('themes', '') ? arg('themes').split(',') : all;
  const out = {};
  for (const th of themes) {
    const cfg = config(['--theme=' + th, '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), {
      viewport: { width: W, height: W < 768 ? 700 : 800 }, dsf: 2, init: INIT,
    });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000, polling: 100 });   /* rAF is held */
      /* the mount's settled pass (1200 ms) and the open map are real-time
       * timers: let them run before the clock starts */
      await ses.page.waitForTimeout(2500);
      await ses.page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
      const hs = [];
      let t = 0;
      for (const s of AT) {
        const n = Math.round((s - t) * 30); t = s;
        const shot = await ses.page.evaluate(n => {
          const st = window.DCCSeasonsEngine._state;
          for (let i = 0; i < n; i++) { st.tick(1000 / 30, 1); }
          const cvs = [...document.querySelectorAll('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky')];
          return { px: cvs.map(c => c.toDataURL('image/png')), vig: st.vig || '', hero: st.hero ? String(st.hero.kind || st.hero) : '' };
        }, n);
        hs.push(s + 's ' + crypto.createHash('sha1').update(shot.px.join('|')).digest('hex').slice(0, 12) + (shot.vig ? ' ' + shot.vig : '') + (shot.hero ? ' hero:' + shot.hero : ''));
      }
      out[th] = hs;
      const errs = ses.logs.filter(l => l.startsWith('pageerror'));
      if (errs.length) { out[th].push('ERR ' + errs.join(' | ')); }
    } finally { await ses.close(); }
    process.stderr.write(th + ' ');
  }
  process.stderr.write('\n');
  console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
