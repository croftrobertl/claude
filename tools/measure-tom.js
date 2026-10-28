'use strict';
/**
 * DCC Seasons — 4.13.2: Thanksgiving's frame cost on the SHIPPED build
 * (engine.min.js) at the Director's bar — 390 wide, DPR 3, 4x CPU — with
 * NO warm-up excluded: every frame from the engine's very first, so the
 * first draw of every new sprite (the tom's 21 poses and the poults' 16,
 * the redrawn pieces, the cornucopia, the cranes and the moon) is inside
 * the window, and so is the tom's pre-draw.
 *
 * A guest's load: the page loads, they start scrolling 300 ms later (which
 * is what makes the loader fetch the engine, 4.12.1) and keep scrolling in
 * small steps for 4 s, then read. Timed:
 *  - every requestAnimationFrame callback (the engine's whole frame);
 *  - every idle callback (the tom's and the cranes' pre-draw run there),
 *    each with its own duration and the scroll it was nearest;
 *  - every long task (> 50 ms) the browser reports.
 * The tom is put on screen by the seed (14: he is mid-screen at 390 and
 * walks right across it for ~14 s), not by a debug knob, so the shipped
 * file runs untouched.
 *
 *   node tools/measure-tom.js [--width=390] [--dsf=3] [--throttle=4] [--seconds=24] [--seed=14] [--noscroll] [--nooffscreen]
 *
 * --noworker deletes Worker; --nooffscreen gives the worker no
 * OffscreenCanvas, as on iOS before 16.4. Either way the pre-draw takes
 * its fallback, on the page's thread.
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : d; };
const W = arg('width', 390), DSF = arg('dsf', 3), THR = arg('throttle', 4), SEC = arg('seconds', 24), SEED = arg('seed', 14);
const SCROLL = !process.argv.includes('--noscroll');

const INIT = `(function () {
  var a = ${SEED};
  Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  var raf = window.requestAnimationFrame.bind(window), ric = window.requestIdleCallback && window.requestIdleCallback.bind(window);
  var F = window.__frames = [], I = window.__idle = [], L = window.__long = [], S = window.__scrolls = [];
  window.requestAnimationFrame = function (cb) {
    return raf(function (ts) { var t = performance.now(); if (window.__note) { window.__note(); } cb(ts); F.push([t, performance.now() - t, window.__note ? window.__note() : '']); });
  };
  if (ric) {
    window.requestIdleCallback = function (cb, o) {
      return ric(function (dl) { var t = performance.now(), left = dl.timeRemaining(); cb(dl); I.push([t, performance.now() - t, left, dl.didTimeout]); }, o);
    };
  }
  addEventListener('scroll', function () { S.push(performance.now()); }, { passive: true, capture: true });
  /* the scene's first draw onto the sky canvas, and which frames drew the tom */
  window.__sky = 0;
  var di = CanvasRenderingContext2D.prototype.drawImage;
  var seen = new WeakSet(), note = '';
  CanvasRenderingContext2D.prototype.drawImage = function (src) {
    if (!window.__sky && this.canvas && this.canvas.className === 'dcc-seasons-sky') { window.__sky = performance.now(); }
    var t = performance.now(), r = di.apply(this, arguments), d = performance.now() - t;
    if (src && typeof src === 'object' && !seen.has(src) && this.canvas && /dcc-seasons/.test(this.canvas.className)) {
      seen.add(src); note += (src instanceof ImageBitmap ? 'bitmap' : src.tagName || '?') + ' ' + src.width + 'x' + src.height + ' ' + d.toFixed(1) + 'ms; ';
    } else if (d > 2) { note += 'draw ' + (src && src.width) + 'x' + (src && src.height) + ' ' + d.toFixed(1) + 'ms; '; }
    return r;
  };
  window.__note = function () { var n = note; note = ''; return n; };
  /* the two fallbacks: no Worker at all, or a worker without OffscreenCanvas
   * (iOS before 16.4), whose first pose throws there and errors the worker */
  if (${process.argv.includes('--noworker') ? 1 : 0}) { delete window.Worker; }
  if (${process.argv.includes('--nooffscreen') ? 1 : 0}) {
    var RW = window.Worker, RB = window.Blob;
    window.Blob = function (parts, o) { return new RB(['delete self.OffscreenCanvas;'].concat(parts), o); };
    window.Worker = RW;
  }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { L.push([e.startTime, e.duration]); }); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
})();`;

(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--min']);
  const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), {
    viewport: { width: W, height: W < 768 ? 844 : 900 }, dsf: DSF, init: INIT, throttle: THR,
  });
  const pg = ses.page;
  try {
    await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
    const tLoad = await pg.evaluate(() => performance.now());
    if (SCROLL) {
      await pg.waitForTimeout(300);
      for (let i = 0; i < 40; i++) { await pg.mouse.wheel(0, i < 20 ? 18 : -18); await pg.waitForTimeout(100); }
    }
    await pg.waitForFunction(() => !!window.DCCSeasonsEngine, null, { timeout: 30000 });
    await pg.waitForTimeout(SEC * 1000);
    const r = await pg.evaluate(() => ({ sky: window.__sky, F: window.__frames, I: window.__idle, L: window.__long, S: window.__scrolls,
      eng: performance.getEntriesByType('resource').filter(e => /engine/.test(e.name)).map(e => [e.startTime, e.responseEnd]) }));
    /* the engine's frames: from its first callback on (ambient's own rAFs, if any, are before it) */
    const engAt = r.eng.length ? r.eng[0][1] : 0;
    const fr = r.F.filter(f => f[0] >= engAt);
    const worst = fr.reduce((m, f) => f[1] > m[1] ? f : m, [0, 0]);
    const sorted = fr.map(f => f[1]).sort((a, b) => a - b);
    const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const idle = r.I.filter(i => i[0] >= engAt && i[1] > 0.5);
    const firstScroll = r.S.length ? r.S[0] : null, lastScroll = r.S.length ? r.S[r.S.length - 1] : null;
    const out = {
      width: W, dsf: DSF, throttle: THR, seconds: SEC,
      loadAt: +tLoad.toFixed(0), engineFetched: r.eng.length ? [+r.eng[0][0].toFixed(0), +r.eng[0][1].toFixed(0)] : null,
      sceneFirstDraw: r.sky ? +(r.sky - engAt).toFixed(0) : null,
      firstScroll: firstScroll && +firstScroll.toFixed(0), lastScroll: lastScroll && +lastScroll.toFixed(0),
      frames: fr.length, worstFrame: [+worst[1].toFixed(2), +(worst[0] - engAt).toFixed(0)], p50: +q(0.5).toFixed(2), p99: +q(0.99).toFixed(2),
      over8: fr.filter(f => f[1] >= 8).map(f => [+(f[0] - engAt).toFixed(0), +f[1].toFixed(1), f[2]]),
      firstDraws: fr.filter(f => f[2]).map(f => [+(f[0] - engAt).toFixed(0), +f[1].toFixed(1), f[2].slice(0, 300)]),
      idleSlices: idle.map(i => ({ at: +(i[0] - engAt).toFixed(0), ms: +i[1].toFixed(1), left: +i[2].toFixed(1), forced: i[3],
        duringScroll: firstScroll != null && i[0] >= firstScroll && i[0] <= lastScroll + 100 })),
      longTasks: r.L.filter(l => l[0] >= engAt).map(l => [+(l[0] - engAt).toFixed(0), +l[1].toFixed(0)]),
    };
    console.log(JSON.stringify(out, null, 1));
  } finally { await ses.close(); }
})().catch(e => { console.error(e); process.exit(1); });
