'use strict';
/**
 * DCC Seasons 4.17.0: the tom's ink outline for tkFitPlan (TK_TOP): the top
 * of his ink in 24 columns across his box, the highest over every pre-drawn
 * pose, at 1440 DPR 2 (416 px poses), rounded up by 2 rows. Also prints his
 * lowest ink row (TK_SOLEF). Re-run when his drawing changes.
 *
 *   node tools/tom-top.js
 */
const { config, open } = require('./harness'); const rt = require('./real-theme');
(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']); cfg.forceHour = 12;
  const ses = await open(rt.page({ config: cfg }), { ...rt.opts(1440), viewport: { width: 1440, height: 900 }, dsf: 2 });
  ses.page.on('pageerror', e => console.log('ERR', e.message));
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 90000, polling: 200 });
  const r = await ses.page.evaluate(() => {
    const C = window.DCCSeasonsEngine._state.tom.cache, N = 24, top = new Array(N).fill(1), keys = Object.keys(C); let low = 0, H = 0;
    for (const k of keys) { const b = C[k].c, c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d'); g.drawImage(b, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; H = c.height;
      for (let x = 0; x < c.width; x++) { const bin = Math.min(N - 1, Math.floor(x / c.width * N)); for (let y = 0; y < c.height; y++) { if (d[(y * c.width + x) * 4 + 3] > 8) { top[bin] = Math.min(top[bin], y / c.height); break; } } }
      for (let y = c.height - 1; y >= 0; y--) { let f = false; for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { f = true; break; } if (f) { low = Math.max(low, (y + 1) / c.height); break; } } }
    return { keys, top: top.map(v => Math.max(0, Math.floor(v * 1000 - 2) / 1000)), low };
  });
  console.log(JSON.stringify(r));
  await ses.close();
})();
