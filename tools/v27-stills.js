/**
 * The 0.27.0 stills and the open→Back clip, on the REAL /test/ page.
 *
 *   node tools/v27-stills.js <out-dir>
 *
 * /test/ is the page Rob tested: the app layout with the Wildlife widget
 * below it, which is the only place the tab-bar complaint shows at all. The
 * page, the theme, the Elementor kit and the Wildlife widget below are all
 * the real ones; the GUIDE is re-rendered from the working tree, because
 * three of these four stills are about markup the server no longer emits
 * and the live page is still serving 0.26.2's. Its content is therefore the
 * test fixture, not Rob's own Wi-Fi text.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/v27') + '/';
fs.mkdirSync(OUT, { recursive: true });
const HERO = ".dccgg-app-hero-photo{background-image:url('data:image/png;base64,"
    + fs.readFileSync('/tmp/canal.png').toString('base64') + "')!important}";

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const shot = (page, name, clip) => page.screenshot(Object.assign(
        { path: OUT + 'Guest Guide - ' + name + '.png' }, clip ? { clip } : { fullPage: false }));

    // --- a section sheet: no "Not Working?" pill, centred, plain Reset ---
    {
        const { ctx, page } = await openLive(browser, { width: 390, height: 844, page: 'test', extraCss: HERO });
        await page.tap('.dccgg-tile[data-key="internet"]');
        await page.waitForTimeout(1000);
        await shot(page, '390-section-no-pill', { x: 0, y: 0, width: 390, height: 844 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);

        await page.tap('.dccgg-tile[data-key="checkout"]');
        await page.waitForTimeout(1000);
        await shot(page, '390-checkout-plain-reset', { x: 0, y: 0, width: 390, height: 844 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);

        // the hub, centred tiles and cards
        await page.evaluate(() => {
            const g = document.querySelector('.dccgg-app-shell');
            window.scrollTo(0, g.getBoundingClientRect().top + window.scrollY - 8);
        });
        await page.waitForTimeout(500);
        await shot(page, '390-centered-tiles', { x: 0, y: 0, width: 390, height: 844 });

        // scrolled past the guide: no tab bar over the Wildlife widget
        await page.evaluate(() => {
            const g = document.querySelector('.dccgg-app-shell');
            window.scrollTo(0, g.getBoundingClientRect().bottom + window.scrollY + 500);
        });
        await page.waitForTimeout(900);
        await shot(page, '390-past-the-guide-no-tab-bar', { x: 0, y: 0, width: 390, height: 844 });
        await ctx.close();
    }
    await browser.close();
    console.log(fs.readdirSync(OUT).join('\n'));
})();
