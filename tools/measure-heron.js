'use strict';
/**
 * DCC Seasons — what one heron crossing costs the main thread (4.9.0).
 *
 *   node tools/measure-heron.js [--width=390] [--dsf=3] [--throttle=4] [--runs=3]
 *   DCC_ASSETS=/path/to/old/assets/js node tools/measure-heron.js …   (a previous build)
 *
 * Valentine's Day (the heron is its only hero), no sprites, no background
 * layer, no scenes: the heron is the only thing on the canvas. Each run
 * measures Chrome's own main-thread busy time (Performance.getMetrics
 * TaskDuration) over the crossing, from the hero's start to its end in the
 * engine's log, and counts the page's frames with rAF. A second run with
 * NO hero over the same length of time gives the floor (the page and the
 * paced engine idling), so "crossing − floor" is what the bird costs.
 * Also reports the one-off pre-draw of the poses (4.9.0 only).
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const W = +(argv.width || 390), DSF = +(argv.dsf || 3), THR = +(argv.throttle || 4), RUNS = +(argv.runs || 3);

async function run(withHero, dur) {
  const cfg = config(['--theme=valentines', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--subtle=off', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.vigGap = 1e9; cfg.heroOnly = 'heron'; cfg.heronLand = 0;
  cfg.heroFirst = withHero ? [3, 3.05] : [1e6, 1e6 + 1];
  const ses = await open('<!doctype html><title>x</title>', { viewport: { width: W, height: W < 768 ? 844 : 900 }, dsf: DSF });
  try {
    const cdp = await ses.page.context().newCDPSession(ses.page);
    if (THR > 1) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR }); }
    await ses.page.route('http://dcc.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture({ kind: 'bravada', config: cfg }) }));
    await ses.page.addInitScript(() => { window.__fr = 0; const f = () => { window.__fr++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await ses.page.goto('http://dcc.test/', { waitUntil: 'load' });
    await cdp.send('Performance.enable');
    const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 30000 });
    let a, b, fa, fb, t0, t1;
    if (withHero) {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.heroLog.length, null, { timeout: 60000, polling: 20 });
      a = await m(); fa = await ses.page.evaluate(() => window.__fr); t0 = Date.now();
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.heroLog[0].end > 0, null, { timeout: 60000, polling: 20 });
      b = await m(); fb = await ses.page.evaluate(() => window.__fr); t1 = Date.now();
    } else {
      await ses.page.waitForTimeout(4000);
      a = await m(); fa = await ses.page.evaluate(() => window.__fr); t0 = Date.now();
      await ses.page.waitForTimeout(dur * 1000);
      b = await m(); fb = await ses.page.evaluate(() => window.__fr); t1 = Date.now();
    }
    const pre = await ses.page.evaluate(() => { const h = window.DCCSeasonsEngine._state.heron; return h ? h.stats : null; });
    const secs = (t1 - t0) / 1000, busy = (b.TaskDuration - a.TaskDuration) * 1000;
    return { secs, msPerSec: busy / secs, frames: fb - fa, msPerFrame: busy / Math.max(1, fb - fa), pre };
  } finally { await ses.close(); }
}

(async () => {
  const hs = [], ls = [];
  for (let i = 0; i < RUNS; i++) {
    const h = await run(true); hs.push(h);
    ls.push(await run(false, h.secs));
  }
  const med = xs => xs.slice().sort((x, y) => x - y)[xs.length >> 1];
  const r = {
    build: process.env.DCC_ASSETS || 'working tree', width: W, dsf: DSF, throttle: THR, runs: RUNS,
    crossingSecs: +med(hs.map(x => x.secs)).toFixed(2),
    crossingMsPerSec: +med(hs.map(x => x.msPerSec)).toFixed(1), floorMsPerSec: +med(ls.map(x => x.msPerSec)).toFixed(1),
    heronMsPerSec: +(med(hs.map(x => x.msPerSec)) - med(ls.map(x => x.msPerSec))).toFixed(1),
    crossingFps: +med(hs.map(x => x.frames / x.secs)).toFixed(1),
    predraw: hs[0].pre
  };
  r.heronMsPerFrame = +(r.heronMsPerSec / r.crossingFps).toFixed(2);
  console.log(JSON.stringify(r));
})().catch(e => { console.error(e); process.exit(1); });
