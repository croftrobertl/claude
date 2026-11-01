/**
 * The 0.26.1 stills, taken on the REAL theme.
 *
 * Every one of these goes through tools/live-shell.js, which renders the
 * layout inside the cached live /guest/ document: the real Elementor kit,
 * the real Raleway, the real Font Awesome. v0.26.0's stills came from the
 * browser-suite harness, and three of the four faults the Director spotted
 * in them were properties of that harness and not of the guide.
 *
 *   node tools/app-stills.js <out-dir>
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/stills') + '/';
fs.mkdirSync(OUT, { recursive: true });
const PHOTO = 'data:image/png;base64,' + fs.readFileSync('/tmp/canal.png').toString('base64');
const HERO = `.dccgg-app-hero-photo{background-image:url('${PHOTO}')!important}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

    // 390 — the arrival screen, the checkout sheet, the map, the Front Desk.
    {
        const { ctx, page } = await openLive(browser, { width: 390, height: 900, extraCss: HERO });
        await page.screenshot({ path: OUT + 'Guest Guide - 390-home.png', clip: { x: 0, y: 0, width: 390, height: 900 } });
        await page.tap('.dccgg-tile[data-key="checkout"]');
        await page.waitForTimeout(900);
        const boxes = await page.$$('.dccgg-detail[data-key="checkout"] .dccgg-item-check');
        for (const b of boxes.slice(0, 2)) { await b.tap(); await page.waitForTimeout(200); }
        await page.waitForTimeout(400);
        await page.screenshot({ path: OUT + 'Guest Guide - 390-checkout-sheet.png', clip: { x: 0, y: 0, width: 390, height: 900 } });
        await page.keyboard.press('Escape'); await page.waitForTimeout(800);
        await page.tap('.dccgg-app-tab[data-app-tab-key="canal"]');
        await page.waitForTimeout(900);
        await page.screenshot({ path: OUT + 'Guest Guide - 390-canal.png', clip: { x: 0, y: 0, width: 390, height: 900 } });
        await page.keyboard.press('Escape'); await page.waitForTimeout(800);
        await page.tap('.dccgg-report-pill--hero');
        await page.waitForTimeout(900);
        await page.screenshot({ path: OUT + 'Guest Guide - 390-front-desk.png', clip: { x: 0, y: 0, width: 390, height: 900 } });
        await ctx.close();
    }

    // 768 and 1440 — Rob's pick, the centred column, as built.
    for (const [w, h] of [[768, 1024], [1440, 980]]) {
        const { ctx, page } = await openLive(browser, { width: w, height: h, extraCss: HERO });
        await page.screenshot({ path: OUT + `Guest Guide - ${w}-centered-column.png` });
        await ctx.close();
    }

    // A guide with nothing configured, which is how a fresh widget starts.
    {
        const { ctx, page } = await openLive(browser, { width: 390, height: 900, caseName: 'app-bare', extraCss: HERO });
        await page.screenshot({ path: OUT + 'Guest Guide - 390-nothing-configured.png', clip: { x: 0, y: 0, width: 390, height: 900 } });
        await ctx.close();
    }

    await browser.close();
    console.log(fs.readdirSync(OUT).join('\n'));
})();
