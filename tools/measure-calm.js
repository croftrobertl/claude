'use strict';
/**
 * DCC Seasons — Calmer Seasons' frame cost (4.15.0), on the SHIPPED build
 * (engine.min.js), at the Director's bar: 390 wide, DPR 3, 4x CPU, the
 * worst engine frame after warm-up under 8 ms, over 10 s.
 *
 * Every requestAnimationFrame callback is timed (the engine's whole frame,
 * the occluder clip included). The occluders are measured in idle time and
 * are NOT in these frames; their build time is reported beside them.
 *
 *   node tools/measure-calm.js --page=contact|cottages|quiz|typing [--theme=thanksgiving] [--width=390] [--seconds=10]
 *
 * contact: /contact/, the form in view, pieces drifting behind it.
 * cottages: the Cottage Selector on its landing, its buttons in view.
 * quiz: the selector's quiz open (the pieces paused, the tom walking off).
 * typing: /contact/ with the message box focused and typed into.
 */
const { config, open } = require('./harness');
const rt = require('./real-theme');
const cp = require('./calm-pages');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const PAGE = arg('page', 'contact'), THEME = arg('theme', 'thanksgiving'), W = +arg('width', 390), SEC = +arg('seconds', 10), DSF = +arg('dsf', 3), THR = +arg('throttle', 4);
const INIT = `(function () {
  var raf = window.requestAnimationFrame.bind(window), log = window.__frames = [];
  window.__t0 = 0;
  window.requestAnimationFrame = function (cb) {
    return raf(function (ts) {
      var a = performance.now(); cb(ts); var d = performance.now() - a;
      if (window.__t0) { log.push([a - window.__t0, d]); }
    });
  };
})();`;

(async () => {
  const cfg = config(['--theme=' + THEME, '--placement=content', '--layering=front', '--density=16', '--min']);
  const make = PAGE === 'contact' || PAGE === 'typing' ? cp.contact : cp.cottages;
  const ses = await open(make({ config: cfg, extraHead: '<style>.dcc-wx-banner{display:none!important}</style>' }), { ...rt.opts(W), viewport: { width: W, height: W < 768 ? 844 : 900 }, dsf: DSF, init: INIT, throttle: THR });
  const pg = ses.page;
  try {
    await pg.waitForFunction(() => window.DCCSeasonsEngine, null, { timeout: 60000 });
    if (PAGE === 'quiz') { await cp.openQuiz(pg); }
    else if (PAGE === 'cottages') { await pg.evaluate(() => document.querySelector('.dccs-root').scrollIntoView({ block: 'center' })); }
    else { await pg.evaluate(() => document.querySelector('.dcc-contact-form').scrollIntoView({ block: 'center' })); }
    if (PAGE === 'typing') { await pg.focus('#dcc-f-message'); }
    await pg.waitForTimeout(3000);   /* settle: the occluders built, the tom's poses drawn */
    await pg.evaluate(() => { window.__t0 = performance.now(); });
    const typing = PAGE === 'typing' ? (async () => { const end = Date.now() + SEC * 1000; while (Date.now() < end) { await pg.keyboard.type('the canal ', { delay: 60 }); } })() : null;
    await pg.waitForFunction(s => window.__frames.length && window.__frames[window.__frames.length - 1][0] > s * 1000, SEC, { timeout: (SEC + 90) * 1000, polling: 500 });
    if (typing) { await typing; }
    const fr = (await pg.evaluate(() => window.__frames)).filter(f => f[0] <= SEC * 1000);
    const warm = fr.filter(f => f[0] > 500), ds = fr.map(f => f[1]).sort((a, b) => a - b);
    const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    const worst = fr.reduce((m, f) => f[1] > m[1] ? f : m, [0, 0]);
    console.log(`SHIPPED build · ${PAGE} · ${THEME} · ${W}px · DPR ${DSF} · CPU x${THR} · ${SEC} s`);
    console.log(`  ${fr.length} frames (${(fr.length / SEC).toFixed(1)}/s) · median ${q(ds, 0.5).toFixed(2)} ms · p95 ${q(ds, 0.95).toFixed(2)} · worst ${worst[1].toFixed(2)} ms at ${(worst[0] / 1000).toFixed(2)} s`);
    console.log(`  frames over 8 ms after warm-up: ${warm.filter(f => f[1] > 8).length}`);
    warm.filter(f => f[1] > 8).forEach(f => console.log(`  SLOW ${f[1].toFixed(1)} ms at ${(f[0] / 1000).toFixed(2)} s`));
  } finally { await ses.close(); }
})().catch(e => { console.error(e); process.exit(1); });
