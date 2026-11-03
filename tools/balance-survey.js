/**
 * Which centred paragraphs are too long for the browser to balance? (v0.27.5)
 *
 *   node tools/balance-survey.js
 *
 * Chrome balances a block only up to a line threshold (six in current
 * versions) and leaves longer ones alone. That is a graceful degradation —
 * an unbalanced centred paragraph is what ships today — but Rob asked which
 * ones, and what they do instead.
 */
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const rows = [];
    for (const which of ['guest', 'test']) {
        for (const width of [320, 390]) {
            const { ctx, page } = await openLive(browser, {
                width, height: 900, page: which, keepReal: true, inject: true,
            });
            const keys = await page.$$eval('.dccgg-tile-wrap', (els) =>
                els.map((e) => e.dataset.sectionKey).filter(Boolean));
            for (const key of keys) {
                const tile = await page.$(`.dccgg-tile[data-key="${key}"]`);
                if (!tile) { continue; }
                await tile.click();
                await page.waitForTimeout(420);
                const got = await page.$$eval(
                    `.dccgg-detail[data-key="${key}"] .dccgg-item`, (els) => els.map((item) => {
                        const t = item.querySelector('.dccgg-item-title-text');
                        const ps = [...item.querySelectorAll('.dccgg-item-body p')]
                            .filter((p) => (p.textContent || '').trim() && p.getClientRects().length);
                        if (!ps.length) { return null; }
                        return {
                            title: (t ? t.textContent : '').trim(),
                            paras: ps.map((p) => {
                                const r = document.createRange();
                                r.selectNodeContents(p);
                                const lines = r.getClientRects().length;
                                const cs = getComputedStyle(p);
                                return { lines, wrap: cs.textWrap || cs.textWrapStyle || '',
                                         words: (p.textContent || '').trim().split(/\s+/).length };
                            }),
                        };
                    }).filter(Boolean));
                got.forEach((g) => rows.push({ page: which, width, section: key, ...g }));
                await page.keyboard.press('Escape');
                await page.waitForTimeout(300);
            }
            await ctx.close();
        }
    }
    console.log(JSON.stringify(rows));
    await browser.close();
})();
