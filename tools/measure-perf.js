'use strict';
/**
 * DCC Seasons — what the plugin costs a page's main thread.
 *
 *   node tools/measure-perf.js [--ambient=0] [--subtle=1] [--theme=halloween]
 *                              [--widths=390,1280] [--throttle390=4] [--throttle1280=1]
 *   DCC_ASSETS=/path/to/old/assets/js node tools/measure-perf.js …   (a previous build)
 *
 * The Bravada homepage fixture, live-like settings (density 16, content
 * placement, front layering), at 390px and 1280px. Two windows, from
 * Chrome's own counters (Performance.getMetrics, TaskDuration = main-thread
 * busy time): LOAD = the load event to +5s (includes the idle-time engine
 * fetch and parse), BUSY = +5s to +35s (the first-page hero crossing and
 * the first scene), QUIET = +40s to +100s (the background layer alone).
 * Page frame rate is counted with rAF; canvas repaints by counting the
 * engine's full-canvas clears. Headless and unthrottled, so read the numbers as a
 * before/after comparison, not as a phone's absolute cost.
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const theme = argv.theme || 'halloween';
(async () => {
  const out = [];
  const widths = (argv.widths || '390,1280').split(',').map(Number);
  for (const w of widths) {
    /* CPU throttling as Chrome's DevTools applies it (a 4x-slower phone CPU). */
    const thr = +(argv['throttle' + w] || 1);
    const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16']);
    cfg.ambient = argv.ambient !== '0';
    cfg.subtle = Object.assign({}, cfg.subtle, { on: argv.subtle !== '0' });
    const html = fixture({ kind: 'bravada', config: cfg });
    /* the throttle must be on BEFORE the page loads, or the load window
     * is measured on a fast CPU — so open a blank page first */
    const ses = await open('<!doctype html><title>x</title>', { viewport: { width: w, height: w < 768 ? 844 : 900 } });
    const cdp = await ses.page.context().newCDPSession(ses.page);
    if (thr > 1) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr }); }
    await ses.page.route('http://dcc.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    /* How often the CANVAS is repainted, as opposed to the page's frame
     * rate: the engine clears its canvas once per drawn frame. */
    await ses.page.addInitScript(() => {
      const orig = CanvasRenderingContext2D.prototype.clearRect;
      window.__clears = 0;
      CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
        /* one count per DRAWN FRAME: a frame's clears (one full one, or a
         * few small dirty boxes) all land within a few ms of each other */
        if (this.canvas && this.canvas.classList && this.canvas.classList.contains('dcc-seasons-canvas')) {
          const now = performance.now();
          if (!(now - (window.__lastClear || 0) < 5)) { window.__clears++; }
          window.__lastClear = now;
        }
        return orig.apply(this, arguments);
      };
    });
    await ses.page.goto('http://dcc.test/', { waitUntil: 'load' });
    await cdp.send('Performance.enable');
    const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const t0 = await m();
    await ses.page.waitForTimeout(5000);
    const t1 = await m();
    /* The PAGE frame rate is sampled over the last 3s of each window only:
     * a rAF counter running throughout would itself make the browser
     * produce 60 frames a second and bill them to the page. */
    const fpsSample = async ms => ses.page.evaluate(ms => new Promise(res => {
      let n = 0; const end = performance.now() + ms;
      (function f(t) { n++; if (t < end) { requestAnimationFrame(f); } else { res(n / (ms / 1000)); } })(performance.now());
    }), ms);
    await ses.page.evaluate(() => { window.__c0 = window.__clears; });
    await ses.page.waitForTimeout(27000);
    const t2 = await m();   /* busy-time windows end BEFORE the fps sample */
    const fpsBusy = await fpsSample(3000);
    const f2 = await ses.page.evaluate(() => [0, window.__clears - window.__c0]);
    await ses.page.waitForTimeout(2000);
    const t3 = await m();
    const f3 = await ses.page.evaluate(() => [0, window.__clears - window.__c0]);
    await ses.page.waitForTimeout(57000);
    const t4 = await m();
    const fpsQuiet = await fpsSample(3000);
    const f4 = await ses.page.evaluate(() => [0, window.__clears - window.__c0]);
    const engine = await ses.page.evaluate(() => !!(window.DCCSeasonsEngine) && !!document.querySelector('canvas.dcc-seasons-canvas'));
    const win = (a, b, fa, fb, sec) => ({
      busyMsPerSec: +(((b.TaskDuration - a.TaskDuration) * 1000) / sec).toFixed(1),
      scriptMsPerSec: +(((b.ScriptDuration - a.ScriptDuration) * 1000) / sec).toFixed(1),
      layoutStyleMsPerSec: +((((b.LayoutDuration - a.LayoutDuration) + (b.RecalcStyleDuration - a.RecalcStyleDuration)) * 1000) / sec).toFixed(1),
      canvasRepaintsPerSec: +((fb[1] - fa[1]) / sec).toFixed(1),
    });
    const row = {
      width: w, cpuThrottle: thr, engineLoaded: engine,
      loadBusyMs: Math.round((t1.TaskDuration - t0.TaskDuration) * 1000),
      /* +5s..+35s: a first-page hero crossing and the first scene fall here */
      busy: Object.assign(win(t1, t2, [0, 0], f2, 30), { pageFps: +fpsBusy.toFixed(1) }),
      /* +40s..+100s: no hero (next one 2-3 min later) and no scene (next
       * 1.5-2.5 min later): the background layer alone, which is how the
       * page spends most of a visit */
      quiet: Object.assign(win(t3, t4, f3, f4, 60), { pageFps: +fpsQuiet.toFixed(1) }),
      heapMB: +(t4.JSHeapUsedSize / 1048576).toFixed(1),
    };
    out.push(row);
    console.log(JSON.stringify(row));
    await ses.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
