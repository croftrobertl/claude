/**
 * THE ⓘ, CLOSED AND OPEN, ON LIVE (1.48.1) — stills for Rob at 390.
 *
 *   DCC_OUT=/dir node tools/live/info-stills.mjs
 *
 * Live pages with this build swapped in (swap.mjs, `after` mode, GET only —
 * every non-GET is aborted). For each of three ⓘ a guest meets on a phone —
 * a species sheet's photo credit on /explore/, a water reading's source on
 * /explore/, and an entry's record on /wildlife-guide/ — it saves the screen
 * with the ⓘ closed, then after a real tap with it open. DPR 2, because a
 * person looks at these.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium as getChromium, installSwap, SITE } from './swap.mjs';

const OUT = process.env.DCC_OUT || '.';
mkdirSync(OUT, { recursive: true });
const chromium = await getChromium();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });

async function phone(path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await installSwap(page, { mode: 'after' });
  await page.goto(`${SITE}${path}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

async function pair(page, btnSel, name) {
  const btn = page.locator(btnSel).first();
  await btn.scrollIntoViewIfNeeded();
  await page.evaluate((s) => {
    const b = document.querySelector(s);
    const r = b.getBoundingClientRect();
    /* Leave room under the ⓘ for its panel. */
    if (r.top > innerHeight * 0.45) { scrollBy(0, r.top - innerHeight * 0.3); }
  }, btnSel);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}-closed.png`) });
  await btn.tap();
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => {
    const p = document.querySelector('.dccwl-info-pop:popover-open');
    return p ? p.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  await page.screenshot({ path: join(OUT, `${name}-open.png`) });
  console.log(`${name}: ${open ? 'open — ' + open : 'DID NOT OPEN'}`);
  return open;
}

/* 1. /explore/ — a species sheet's photo credit. */
{
  const { ctx, page } = await phone('/explore/');
  await page.tap('[data-dccwl-viewtrigger]');
  await page.tap('[data-dccwl-view="wildlife"]');
  await page.waitForSelector('.dccwl-panel-species .dccwl-tile:not(.dccwl-tile-ph)', { timeout: 60000 });
  await page.locator('.dccwl-panel-species .dccwl-tile:not(.dccwl-tile-ph)').first().tap();
  await page.waitForSelector('.dccwl-sheet .dccwl-info-onphoto .dccwl-info-btn', { timeout: 30000 });
  await page.waitForTimeout(600);
  await pair(page, '.dccwl-sheet .dccwl-info-onphoto .dccwl-info-btn', 'explore-photo-credit');
  await ctx.close();
}

/* 2. /explore/ — a water reading's source. */
{
  const { ctx, page } = await phone('/explore/');
  await page.tap('[data-dccwl-viewtrigger]');
  await page.tap('[data-dccwl-view="water"]');
  await page.waitForTimeout(800);
  await page.tap('[data-dccwl-water-tab-btn="now"]');
  await page.waitForSelector('[data-dccwl-water-tab="now"] .dccwl-card .dccwl-info-btn', { timeout: 60000 });
  await page.waitForTimeout(600);
  await pair(page, '[data-dccwl-water-tab="now"] .dccwl-card:not(.dccwl-card-skel) .dccwl-info-btn', 'explore-reading-source');
  await ctx.close();
}

/* 3. /wildlife-guide/ — an entry's record, in its sheet. */
{
  const { ctx, page } = await phone('/wildlife-guide/');
  await page.locator('[data-dccwl-gp-item] .dccwl-gp-row').first().tap();
  await page.waitForSelector('.dccwl-sheet .dccwl-info-btn', { timeout: 30000 });
  await page.waitForTimeout(600);
  await pair(page, '.dccwl-sheet [data-k="local"] .dccwl-info-btn', 'guide-record-source');
  await ctx.close();
}

await browser.close();
