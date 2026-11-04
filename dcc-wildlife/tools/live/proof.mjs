/**
 * BEFORE / AFTER PROOF (1.48.0) — the Irwin audit's numbers, on live.
 *
 *   DCC_MODE=before node tools/live/proof.mjs > before.json   # live as served
 *   DCC_MODE=after  node tools/live/proof.mjs > after.json    # this build swapped in
 *
 * Every run: GET only, 4x CPU throttle from navigation, at 390 / 768 / 1440
 * on /explore/, /test/ and /wildlife-guide/. Per page it records
 *   - CLS for the load (every shift without recent input, map load included),
 *     LCP, the longest task and the sum of long tasks;
 *   - on /explore/ and /test/: Choose Wildlife (menu tap, item tap, and
 *     ms until a species tile is on screen), Open a Species, Type a Search;
 *   - on /wildlife-guide/: Open a Species, Type a Search, a pill, the scope.
 * A tap's figure is the Event Timing duration (input to next paint) — the
 * number INP is built from — taking the worst event in the interaction.
 * DCC_RUNS=n repeats each cell and reports the median and the worst.
 */
import { chromium as getChromium, installSwap, SITE } from './swap.mjs';

const MODE = process.env.DCC_MODE || 'before';
const RUNS = +(process.env.DCC_RUNS || 1);
const PAGES = (process.env.DCC_PAGES || 'explore,test,wildlife-guide').split(',');
const WIDTHS = (process.env.DCC_WIDTHS || '390,768,1440').split(',').map(Number);
const H = { 390: 844, 768: 1024, 1440: 900 };
const chromium = await getChromium();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });

const INIT = () => {
  window.__m = { cls: 0, shifts: [], lcp: 0, lt: [], ev: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__m.cls += e.value; if (e.value > 0.002) window.__m.shifts.push([Math.round(e.startTime), +e.value.toFixed(3), (e.sources || []).slice(0, 2).map((s) => s.node ? (s.node.className || s.node.nodeName).toString().split(' ')[0] : '?').join('+')]); } }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.ev.push([e.name, Math.round(e.duration)]); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
};

async function cell(p, w) {
  const mobile = w < 900;
  const ctx = await browser.newContext({ viewport: { width: w, height: H[w] || 900 }, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await installSwap(page, { mode: MODE });
  await page.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${SITE}/${p}/`, { waitUntil: 'load', timeout: 180000 });
  /* A guest who came for the widget scrolls straight to it. On /explore/ and
   * /test/ that is what brings the map into view and starts it loading, so
   * this is the scenario in which the map's jump is on screen to be counted
   * (a shift below the fold scores nothing). A script scroll is not "recent
   * input", so every shift after it still counts. */
  if ('wildlife-guide' !== p) {
    await page.evaluate(() => document.querySelector('.dccwl-canal').scrollIntoView({ block: 'start' }));
  }
  await page.waitForTimeout(8000); // the map, the conditions and every deferred job land
  const load = await page.evaluate(() => ({ cls: +window.__m.cls.toFixed(3), shifts: window.__m.shifts.slice(0, 6), lcp: Math.round(window.__m.lcp), longest: Math.max(0, ...window.__m.lt), ltSum: window.__m.lt.reduce((a, b) => a + b, 0), rootW: Math.round((document.querySelector('.dccwl-canal, [data-dccwl-gp]') || document.body).getBoundingClientRect().width) }));
  const taps = {};
  const tap = (sel) => (mobile ? page.tap(sel, { timeout: 10000 }) : page.click(sel, { timeout: 10000 }));
  const step = async (label, fn) => {
    await page.evaluate(() => { window.__m.ev = []; window.__m.lt = []; });
    let note;
    try { note = await fn(); } catch (e) { taps[label] = { failed: e.message.split('\n')[0].slice(0, 100) }; return; }
    await page.waitForTimeout(1200);
    /* `tap` is the worst pointer/click event, `keys` the worst keystroke
     * (keydown, keypress, input, keyup) — reported apart, because tapping
     * INTO the search box is a click (and pays the site's click handlers)
     * while typing in it is not. */
    const m = await page.evaluate(() => ({
      tap: Math.max(0, ...window.__m.ev.filter((e) => /click|pointer|touch|mouse/.test(e[0])).map((e) => e[1])),
      keys: Math.max(0, ...window.__m.ev.filter((e) => /key|input/.test(e[0])).map((e) => e[1])),
      longest: Math.max(0, ...window.__m.lt),
    }));
    taps[label] = note === undefined ? m : { ...m, ...note };
  };
  if ('wildlife-guide' !== p) {
    await page.evaluate(() => document.querySelector('.dccwl-canal').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(600);
    await step('Open View Menu', () => tap('[data-dccwl-viewtrigger]'));
    await step('Choose Wildlife', async () => {
      const t0 = Date.now();
      await tap('[data-dccwl-view="wildlife"]');
      await page.waitForFunction(() => [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile')].some((t) => t.getBoundingClientRect().width > 0 && t.textContent.trim()), null, { timeout: 30000 });
      return { tilesMs: Date.now() - t0 };
    });
    await page.evaluate(() => { const t = [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile')].find((x) => x.getBoundingClientRect().width > 0); t.setAttribute('data-proof', '1'); });
    await step('Open a Species', () => tap('[data-proof="1"]'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await page.evaluate(() => { const i = [...document.querySelectorAll('[data-dccwl-search-input]')].find((x) => x.getBoundingClientRect().width > 0); if (i) i.setAttribute('data-proof-s', '1'); });
    await step('Type a Search', async () => { await tap('[data-proof-s="1"]'); await page.keyboard.type('heron', { delay: 120 }); });
  } else {
    await step('Open a Species', () => tap('[data-dccwl-gp-item]:not([hidden]) .dccwl-gp-row'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await step('Type a Search', async () => { await tap('[data-dccwl-gp-search]'); await page.keyboard.type('heron', { delay: 120 }); });
    await step('Clear the Search', () => tap('[data-dccwl-gp-clear]'));
    await step('Tap Birds', () => tap('[data-dccwl-gp-group="birds"]'));
    await step('Tap Wider Florida', () => tap('[data-dccwl-gp-scope="wider"]'));
  }
  const swap = page.__swap;
  await ctx.close();
  return { load, taps, errs, swap: { js: swap.js, css: swap.css, patches: swap.patches, missed: swap.missed } };
}

const out = { mode: MODE, at: new Date().toISOString(), cpu: 4, cells: {} };
for (const p of PAGES) for (const w of WIDTHS) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await cell(p, w));
  out.cells[`${p}@${w}`] = runs;
  const r = runs[0];
  console.error(`${MODE} ${p}@${w} cls=${r.load.cls} lcp=${r.load.lcp} longest=${r.load.longest} ` + Object.entries(r.taps).map(([k, v]) => `${k}=${v.failed ? 'FAILED' : v.tap + 'ms' + (v.keys ? ' keys ' + v.keys + 'ms' : '') + (v.tilesMs ? ' tiles ' + v.tilesMs + 'ms' : '')}`).join(' ') + (r.swap.missed.length ? ` MISSED:${r.swap.missed}` : ''));
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
