/**
 * Which items change alignment under the per-item rule? (v0.27.3)
 *
 *   node tools/align-survey.js [shipped|working]
 *
 * Opens every section on both live pages and reports, per item, how its
 * paragraphs are aligned as rendered. Run it against both to diff.
 */
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const MODE = process.argv[2] || 'shipped';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const out = [];
    for (const which of ['guest', 'test']) {
        const { ctx, page } = await openLive(browser, {
            width: 390, height: 900, page: which, keepReal: true, inject: MODE === 'working',
        });
        const keys = await page.$$eval('.dccgg-tile-wrap', (els) =>
            els.map((e) => e.dataset.sectionKey).filter(Boolean));
        for (const key of keys) {
            const tile = await page.$(`.dccgg-tile[data-key="${key}"]`);
            if (!tile) { continue; }
            await tile.click();
            await page.waitForTimeout(500);
            const items = await page.$$eval(
                `.dccgg-detail[data-key="${key}"] .dccgg-item`, (els) => els.map((item) => {
                    const t = item.querySelector('.dccgg-item-title-text');
                    const body = item.querySelector('.dccgg-item-body');
                    if (!body) { return null; }
                    const parts = [...body.querySelectorAll('p, li')]
                        .filter((el) => (el.textContent || '').trim());
                    if (!parts.length) { return null; }
                    return {
                        title: (t ? t.textContent : '').trim(),
                        aligns: parts.map((el) => getComputedStyle(el).textAlign),
                        texts: parts.map((el) => (el.textContent || '').trim().slice(0, 28)),
                    };
                }).filter(Boolean));
            items.forEach((i) => out.push({ page: which, section: key, ...i }));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(350);
        }
        await ctx.close();
    }
    console.log(JSON.stringify(out));
    await browser.close();
})();
