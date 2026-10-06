'use strict';
/**
 * DCC Seasons — what the plugin costs a page's main thread.
 *
 *   node tools/measure-perf.js [--ambient=0] [--subtle=1] [--theme=halloween]
 *   DCC_ASSETS=/path/to/old/assets/js node tools/measure-perf.js …   (a previous build)
 *
 * The Bravada homepage fixture, live-like settings (density 16, content
 * placement, front layering), at 390px and 1280px. Two windows, from
 * Chrome's own counters (Performance.getMetrics, TaskDuration = main-thread
 * busy time): LOAD = the load event to +5s (includes the idle-time engine
 * fetch and parse), STEADY = +5s to +35s (a first-page hero crossing falls
 * in it; a scene may start from +20s). Frame rate is counted with rAF over
 * the steady window. Headless and unthrottled, so read the numbers as a
 * before/after comparison, not as a phone's absolute cost.
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const theme = argv.theme || 'halloween';
(async () => {
  const out = [];
  for (const w of [390, 1280]) {
    const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16']);
    cfg.ambient = argv.ambient !== '0';
    cfg.subtle = Object.assign({}, cfg.subtle, { on: argv.subtle !== '0' });
    const html = fixture({ kind: 'bravada', config: cfg });
    const ses = await open(html, { viewport: { width: w, height: w < 768 ? 844 : 900 } });
    const cdp = await ses.page.context().newCDPSession(ses.page);
    await cdp.send('Performance.enable');
    const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const t0 = await m();
    await ses.page.waitForTimeout(5000);
    const t1 = await m();
    await ses.page.evaluate(() => { window.__f = 0; (function f() { window.__f++; requestAnimationFrame(f); })(); });
    await ses.page.waitForTimeout(30000);
    const t2 = await m();
    const frames = await ses.page.evaluate(() => window.__f);
    const engine = await ses.page.evaluate(() => !!(window.DCCSeasonsEngine) && !!document.querySelector('canvas.dcc-seasons-canvas'));
    const row = {
      width: w, engineLoaded: engine,
      loadBusyMs: Math.round((t1.TaskDuration - t0.TaskDuration) * 1000),
      loadScriptMs: Math.round((t1.ScriptDuration - t0.ScriptDuration) * 1000),
      steadyBusyMsPerSec: +(((t2.TaskDuration - t1.TaskDuration) * 1000) / 30).toFixed(1),
      steadyScriptMsPerSec: +(((t2.ScriptDuration - t1.ScriptDuration) * 1000) / 30).toFixed(1),
      fps: +(frames / 30).toFixed(1),
      heapMB: +(t2.JSHeapUsedSize / 1048576).toFixed(1),
    };
    out.push(row);
    console.log(JSON.stringify(row));
    await ses.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
