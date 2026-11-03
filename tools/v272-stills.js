/**
 * 0.27.2: Checkout AND Rules, on BOTH live pages, at 320 and 390.
 *
 *   node tools/v272-stills.js <out-dir>
 *
 * Rules is in the set because it is where the second-worst overlap was in
 * 0.27.1's survey ("Don't Feed Wildlife", 15px) and because its titles are
 * the longest in the guide — if the symmetric reserve costs anything, it
 * shows there before it shows in Checkout.
 *
 * "Before" is the live 0.27.1 assets; "after" is the working stylesheet over
 * the same live markup, which is what a deploy does for a CSS-only change.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/v272') + '/';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    for (const [which, label] of [['guest', 'guest-grid'], ['test', 'test-app-shell']]) {
        for (const section of ['checkout', 'rules']) {
            for (const width of [390, 320]) {
                for (const [mode, inject] of [['before', false], ['after', true]]) {
                    const { ctx, page } = await openLive(browser, {
                        width, height: 900, page: which, keepReal: true, inject,
                    });
                    const tile = await page.$(`.dccgg-tile[data-key="${section}"]`);
                    if (!tile) { console.log(`  (no ${section} tile on ${which})`); await ctx.close(); continue; }
                    await tile.click();
                    await page.waitForTimeout(1000);
                    await page.screenshot({
                        path: `${OUT}Guest Guide - ${width}-${section}-${label}-${mode}.png`,
                        clip: { x: 0, y: 0, width, height: 900 },
                    });
                    await ctx.close();
                }
            }
        }
    }
    await browser.close();
    console.log(fs.readdirSync(OUT).join('\n'));
})();
