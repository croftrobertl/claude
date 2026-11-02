/**
 * How long a tile tap takes to show something, on the real page (v0.27.0).
 *
 * Rob: "on a fresh load, tapping a tile did nothing for several seconds".
 * This measures it rather than guessing — cold cache, CPU and network
 * throttled to a phone, on /test/ as live serves it.
 *
 *   node tools/tap-timing.js [shipped|working] [runs]
 *
 * Two numbers per run, both from the instant of the tap:
 *   pressed — the tile shows the guest that the tap landed (v0.27.0's
 *             .is-pressing on touchstart, or 0.26.2's .is-tap on touchend).
 *   sheet   — the detail panel is on screen (the modal has its open class
 *             AND the panel has a non-zero box).
 *   content — the first item's text inside that panel is painted.
 */
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const MODE = process.argv[2] || 'shipped';
const RUNS = parseInt(process.argv[3] || '3', 10);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const rows = [];
    for (let i = 0; i < RUNS; i++) {
        const { ctx, page } = await openLive(browser, {
            width: 390, height: 844, page: 'test',
            // Either way the page keeps its OWN markup — this is about /test/
            // as it is, not a fixture. "shipped" runs the live 0.26.2 assets;
            // "working" overlays the working tree's CSS and JS on the same
            // markup, which is what a deploy would do.
            keepReal: true, inject: MODE === 'working',
            // A mid-range phone on a decent mobile connection.
            throttle: { cpu: 4, network: { latency: 150,
                downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 } },
        });
        // Load, then settle, the way a guest arriving at the page does.
        await page.waitForTimeout(2500);
        const tile = await page.$('.dccgg-tile');
        if (!tile) { console.log('no tile'); await ctx.close(); continue; }
        await tile.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);

        // The clock starts inside the page, on the real pointerdown, so no
        // round trip to the driver is counted against the guide.
        await page.evaluate(() => {
            window.__dccgg = { t0: null, pressed: null, sheet: null, content: null };
            document.addEventListener('pointerdown', (e) => {
                if (!window.__dccgg.t0 && e.target.closest('.dccgg-tile')) {
                    window.__dccgg.t0 = performance.now();
                    const tile = e.target.closest('.dccgg-tile');
                    const tick = () => {
                        const s = window.__dccgg;
                        if (s.pressed === null && tile
                            && (tile.classList.contains('is-pressing') || tile.classList.contains('is-tap'))) {
                            s.pressed = Math.round(performance.now() - s.t0);
                        }
                        const panel = document.querySelector('.dccgg-detail:not([hidden])');
                        const open = document.documentElement.classList.contains('dccgg-detail-open');
                        if (s.sheet === null && open && panel && panel.getClientRects().length) {
                            s.sheet = Math.round(performance.now() - s.t0);
                        }
                        if (s.sheet !== null && s.content === null && panel) {
                            const body = panel.querySelector('.dccgg-item-body, .dccgg-item-title');
                            if (body && body.getClientRects().length && (body.textContent || '').trim()) {
                                s.content = Math.round(performance.now() - s.t0);
                            }
                        }
                        if (s.content === null && performance.now() - s.t0 < 15000) {
                            requestAnimationFrame(tick);
                        }
                    };
                    requestAnimationFrame(tick);
                }
            }, true);
        });
        // A HELD press, not an instantaneous one. Playwright's tap() fires
        // touchstart and touchend in the same tick, which makes a pressed
        // state applied on touchEND look as fast as one applied on
        // touchSTART — so the harness would report no difference where a
        // real finger feels a clear one. A human press rests ~120ms.
        {
            const box = await tile.boundingBox();
            const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
            await page.waitForTimeout(120);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        }
        await page.waitForFunction(
            () => window.__dccgg.content !== null || (window.__dccgg.t0 && performance.now() - window.__dccgg.t0 > 14000),
            null, { timeout: 20000 }).catch(() => {});
        const r = await page.evaluate(() => ({ pressed: window.__dccgg.pressed,
            sheet: window.__dccgg.sheet, content: window.__dccgg.content }));
        rows.push(r);
        await ctx.close();
    }
    console.log(MODE, JSON.stringify(rows));
    await browser.close();
})();
