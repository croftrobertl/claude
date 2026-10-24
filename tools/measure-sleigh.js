'use strict';
/**
 * DCC Seasons — 4.14.0: the Christmas scene's frame cost, on the SHIPPED
 * build (engine.min.js), at the Director's bar: 390 wide, DPR 3, 4x CPU
 * throttle, the worst frame after warm-up under 8 ms, over 10 seconds.
 *
 * Every requestAnimationFrame callback is timed (the engine's whole frame:
 * its script and its canvas calls — the page's raster and composite happen
 * after, off this clock, and are what the GPU-pacing suites watch). The
 * window opens on the scene's first draw onto the sky canvas and runs 10 s, the full Christmas field on screen throughout.
 *
 *   node tools/measure-sleigh.js [--width=390] [--dsf=3] [--throttle=4] [--seconds=10] [--debug]
 *
 * --debug runs the readable build with the scene repeating back to back
 * (vigGap), so all 10 s are scene; the default is the shipped file, where
 * the scene comes at 6-10 s of its own accord, as a guest would see it.
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : d; };
const W = arg('width', 390), DSF = arg('dsf', 3), THR = arg('throttle', 4), SEC = arg('seconds', 10), DEBUG = process.argv.includes('--debug');

const INIT = `(function () {
  /* the window opens on the scene's FIRST draw onto the sky canvas (the
   * pre-draw makes that canvas early, in idle time, and draws nothing on
   * it); each frame records whether the scene drew in it */
  var raf = window.requestAnimationFrame.bind(window), log = window.__frames = [], drew = false;
  var di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function () {
    if (this.canvas && this.canvas.className === 'dcc-seasons-sky') { drew = true; if (!window.__t0) { window.__t0 = performance.now(); } }
    return di.apply(this, arguments);
  };
  window.__t0 = 0;
  window.requestAnimationFrame = function (cb) {
    return raf(function (ts) {
      drew = false;
      var a = performance.now(); cb(ts); var d = performance.now() - a;
      if (window.__t0) { log.push([a - window.__t0, d, drew]); }
    });
  };
})();`;;

(async () => {
  const flags = ['--theme=' + (process.env.THEME || 'christmas'), '--placement=content', '--layering=front', '--density=16'];
  if (DEBUG) { flags.push('--diag'); } else { flags.push('--min'); }
  const cfg = config(flags);
  if (DEBUG) { cfg.vigOnly = process.env.SCENE || 'sleighmoon'; cfg.vigFirst = 4000; cfg.vigGap = 200; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; }
  const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), {
    viewport: { width: W, height: W < 768 ? 844 : 900 }, dsf: DSF, init: INIT, throttle: THR,
  });
  const pg = ses.page;
  try {
    await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
    await pg.waitForFunction(() => window.__t0 > 0, null, { timeout: 120000 });
    await pg.waitForFunction(s => window.__frames.length && window.__frames[window.__frames.length - 1][0] > s * 1000, SEC, { timeout: (SEC + 60) * 1000 });
    const fr = (await pg.evaluate(() => window.__frames)).filter(f => f[0] <= SEC * 1000);
    const warm = fr.filter(f => f[0] > 500);   /* after the first half second of the scene */
    const ds = fr.map(f => f[1]).sort((a, b) => a - b), dw = warm.map(f => f[1]).sort((a, b) => a - b);
    const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    const worst = fr.reduce((m, f) => f[1] > m[1] ? f : m, [0, 0]);
    console.log(`${DEBUG ? 'readable build, scene back to back' : 'SHIPPED build (engine.min.js)'} · ${W}px · DPR ${DSF} · CPU x${THR} · ${SEC} s from the scene's start`);
    console.log(`  ${fr.length} frames (${(fr.length / SEC).toFixed(1)}/s)`);
    console.log(`  frame time: median ${q(ds, 0.5).toFixed(2)} ms · p95 ${q(ds, 0.95).toFixed(2)} · p99 ${q(ds, 0.99).toFixed(2)} · worst ${worst[1].toFixed(2)} ms at ${(worst[0] / 1000).toFixed(2)} s`);
    console.log(`  after warm-up (from 0.5 s): median ${q(dw, 0.5).toFixed(2)} ms · worst ${dw[dw.length - 1].toFixed(2)} ms`);
    console.log(`  frames over 8 ms after warm-up: ${warm.filter(f => f[1] > 8).length}`);
    const sc = fr.filter(f => f[2]).map(f => f[1]).sort((a, b) => a - b);
    if (sc.length) { console.log(`  the scene's own frames (${sc.length}, warm-up included): median ${q(sc, 0.5).toFixed(2)} ms · p95 ${q(sc, 0.95).toFixed(2)} · worst ${sc[sc.length - 1].toFixed(2)} ms`); }
  } finally { await ses.close(); }
})().catch(e => { console.error(e); process.exit(1); });
