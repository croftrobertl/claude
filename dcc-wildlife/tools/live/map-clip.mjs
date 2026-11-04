/**
 * THE MAP LOADING, ON VIDEO (1.48.0) — for Rob, before he approves.
 *
 *   DCC_MODE=before DCC_OUT=/dir node tools/live/map-clip.mjs   # live as served
 *   DCC_MODE=after  DCC_OUT=/dir node tools/live/map-clip.mjs   # this build
 *
 * Opens /explore/ (or DCC_PAGE) at 390 x 844, a phone, with the CPU slowed
 * 4x, scrolls straight to the widget the moment the page has loaded — the
 * guest who came for it — and records twelve seconds while the map loads.
 * GET only, as every live tool. Writes <page>-<mode>.mp4 into DCC_OUT, starting at the scroll, and,
 * per 250 ms, the height of the map box and the top of the content below it,
 * so the clip and the numbers describe the same run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium as getChromium, installSwap, SITE } from './swap.mjs';

const MODE = process.env.DCC_MODE || 'before';
const OUT = process.env.DCC_OUT || '.';
const PAGE = process.env.DCC_PAGE || 'explore';
mkdirSync(OUT, { recursive: true });

const chromium = await getChromium();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
/* Frames come from Chrome's own screencast (CDP), not Playwright's video
 * recorder, which needs an ffmpeg build this container does not have; the
 * system ffmpeg assembles them, each frame held for as long as it was on
 * screen, so the clip runs in real time. */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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
const FR = join(OUT, `${PAGE}-${MODE}-frames`);
mkdirSync(FR, { recursive: true });
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  const n = frames.length;
  writeFileSync(join(FR, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
  frames.push(f.metadata.timestamp);
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
await page.goto(`${SITE}/${PAGE}/`, { waitUntil: 'load', timeout: 180000 });
const scrollAt = Date.now() / 1000;
await page.evaluate(() => document.querySelector('.dccwl-canal').scrollIntoView({ block: 'start' }));
await page.waitForTimeout(12000);
const trace = await page.evaluate(() => window.__trace);
await cdp.send('Page.stopScreencast').catch(() => {});
await ctx.close();
/* An ffconcat list holding each frame for its real on-screen time. */
/* The clip STARTS at the scroll, so a before and an after line up on the
 * moment the widget comes into view, whatever each page's load took; the
 * last frame is held 2.5s so the settled page is seen. */
let list = 'ffconcat version 1.0\n';
let first = frames.findIndex((t) => t >= scrollAt);
first = first < 1 ? 0 : first - 1;
frames.forEach((t, i) => {
  if (i < first) { return; }
  const from = i === first ? Math.max(t, scrollAt) : t;
  const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1] - from) : 2.5;
  list += `file 'f${String(i).padStart(5, '0')}.jpg'\nduration ${d.toFixed(3)}\n`;
});
writeFileSync(join(FR, 'list.txt'), list);
const file = join(OUT, `${PAGE}-${MODE}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(FR, 'list.txt'),
  '-vf', 'fps=30,scale=390:-2,format=yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', file]);
/* Keep only the rows where something changed. */
const changes = trace.filter((r, i) => !i || r[1] !== trace[i - 1][1] || r[2] !== trace[i - 1][2] || r[3] !== trace[i - 1][3]);
writeFileSync(join(OUT, `${PAGE}-${MODE}.json`), JSON.stringify({ mode: MODE, page: PAGE, cls: trace.length ? trace[trace.length - 1][4] : null, changes }, null, 1));
console.log(`${MODE} ${PAGE}: ${file}\n  ms: map box height / content below at y / box text / CLS so far`);
for (const r of changes) console.log(`  ${r.join(' / ')}`);
await browser.close();
