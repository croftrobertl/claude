/**
 * 0.27.1: the Checkout sheet on BOTH live pages, at 390 and at 320.
 *
 * 390 is what the brief asks for. 320 is where the defect actually is —
 * every one of the host's overlapping titles was at 320 and none at 390 —
 * so a 390 pair alone would show two near-identical pictures and prove
 * nothing. Both widths, before and after, so the fix can be seen.
 *
 *   node tools/v271-stills.js <out-dir>
 *
 * The page's OWN markup, because this is about the host's real titles and
 * the fix is stylesheet-only — so keeping live's markup and overlaying the
 * working tree's CSS is exactly what a deploy does here.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/v271') + '/';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    for (const [which, label] of [['guest', 'guest-grid'], ['test', 'test-app-shell']]) {
        for (const width of [390, 320]) {
            for (const [mode, inject] of [['before', false], ['after', true]]) {
                const { ctx, page } = await openLive(browser, {
                    width, height: 900, page: which, keepReal: true, inject,
                });
                await page.click('.dccgg-tile[data-key="checkout"]');
                await page.waitForTimeout(1000);
                await page.screenshot({
                    path: `${OUT}Guest Guide - ${width}-checkout-${label}-${mode}.png`,
                    clip: { x: 0, y: 0, width, height: 900 },
                });
                await ctx.close();
            }
        }
    }
    await browser.close();
    console.log(fs.readdirSync(OUT).join('\n'));
})();
