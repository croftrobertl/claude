/**
 * THE MAP LOADING, ON VIDEO (1.48.0) — for Rob, before he approves.
 *
 *   DCC_MODE=before DCC_OUT=/dir node tools/live/map-clip.mjs   # live as served
 *   DCC_MODE=after  DCC_OUT=/dir node tools/live/map-clip.mjs   # this build
 *
 * Opens /explore/ (or DCC_PAGE) at 390 x 844, a phone, with the CPU slowed
 * 4x, scrolls straight to the widget the moment the page has loaded — the
 * guest who came for it — and records twelve seconds while the map loads.
 * GET only, as every live tool. Writes <page>-<mode>.webm into DCC_OUT and,
 * per 250 ms, the height of the map box and the top of the content below it,
 * so the clip and the numbers describe the same run.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium as getChromium, installSwap, SITE } from './swap.mjs';

const MODE = process.env.DCC_MODE || 'before';
const OUT = process.env.DCC_OUT || '.';
const PAGE = process.env.DCC_PAGE || 'explore';
mkdirSync(OUT, { recursive: true });

const chromium = await getChromium();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});
const page = await ctx.newPage();
await installSwap(page, { mode: MODE });
await page.addInitScript(() => {
  window.__trace = []; window.__cls = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__cls += e.value; } }).observe({ type: 'layout-shift', buffered: true });
  const tick = () => {
    const h = document.querySelector('[data-dccwl-map-host]');
    const f = document.querySelector('.dccwl-canal .dccwl-footnotes');
    if (h) {
      window.__trace.push([Math.round(performance.now()), Math.round(h.getBoundingClientRect().height),
        f ? Math.round(f.getBoundingClientRect().top + scrollY) : null, (h.textContent || '').trim().slice(0, 20), +window.__cls.toFixed(3)]);
    }
    setTimeout(tick, 250);
  };
  addEventListener('DOMContentLoaded', tick);
});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(`${SITE}/${PAGE}/`, { waitUntil: 'load', timeout: 180000 });
await page.evaluate(() => document.querySelector('.dccwl-canal').scrollIntoView({ block: 'start' }));
await page.waitForTimeout(12000);
const trace = await page.evaluate(() => window.__trace);
const video = page.video();
await ctx.close();
const file = join(OUT, `${PAGE}-${MODE}.webm`);
renameSync(await video.path(), file);
/* Keep only the rows where something changed. */
const changes = trace.filter((r, i) => !i || r[1] !== trace[i - 1][1] || r[2] !== trace[i - 1][2] || r[3] !== trace[i - 1][3]);
writeFileSync(join(OUT, `${PAGE}-${MODE}.json`), JSON.stringify({ mode: MODE, page: PAGE, cls: trace.length ? trace[trace.length - 1][4] : null, changes }, null, 1));
console.log(`${MODE} ${PAGE}: ${file}\n  ms: map box height / content below at y / box text / CLS so far`);
for (const r of changes) console.log(`  ${r.join(' / ')}`);
await browser.close();
