/**
 * 0.27.1: the Checkout sheet at 390 on BOTH live pages.
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
        for (const [mode, inject] of [['before', false], ['after', true]]) {
            const { ctx, page } = await openLive(browser, {
                width: 390, height: 900, page: which, keepReal: true, inject,
            });
            await page.click('.dccgg-tile[data-key="checkout"]');
            await page.waitForTimeout(1000);
            await page.screenshot({
                path: `${OUT}Guest Guide - 390-checkout-${label}-${mode}.png`,
                clip: { x: 0, y: 0, width: 390, height: 900 },
            });
            await ctx.close();
        }
    }
    await browser.close();
    console.log(fs.readdirSync(OUT).join('\n'));
})();
