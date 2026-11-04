/**
 * 0.27.6: what the text rule does inside template items. (Approval stills.)
 *
 *   node tools/v276-stills.js <out-dir>
 *
 * Surveyed first: five distinct template items, and only ONE holds any text.
 * The other four are photographed too, before and after, as the evidence
 * that an allow-list leaves a map, an embed and a button alone.
 *
 * For the one that changes there are two comparisons, because the Director
 * balanced that paragraph by hand in the template today:
 *   -as-is     the inline style still there. Nothing should move; this is
 *              the no-regression pair.
 *   -plain     the inline style stripped in the browser, which is the state
 *              the page will be in once they remove it. This is where the
 *              release earns its place.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/v276') + '/';
fs.mkdirSync(OUT, { recursive: true });

const ITEMS = [
    ['amenities', 'User Manuals', true],
    ['amenities', 'Amenities Map', false],
    ['clubhouse', 'Tour Video', false],
    ['map', 'Property Map', false],
    ['review', 'Google', false],
];
const safe = (s) => s.replace(/[^A-Za-z0-9 &]/g, '').trim();

const shoot = async (page, section, title, file) => {
    const h = await page.evaluateHandle(({ section, title }) => {
        const items = [...document.querySelectorAll(
            `.dccgg-detail[data-key="${section}"] .dccgg-item`)];
        return items.find((it) => {
            const t = it.querySelector('.dccgg-item-title-text');
            return t && t.textContent.trim() === title;
        }) || null;
    }, { section, title });
    const el = h.asElement();
    if (!el) { console.log(`  MISSING ${section}/${title}`); return false; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await el.screenshot({ path: file });
    return true;
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    let n = 0;
    for (const [mode, inject] of [['before', false], ['after', true]]) {
        for (const which of ['guest', 'test']) {
            for (const [section, title, hasText] of ITEMS) {
                for (const width of hasText ? [390, 320] : [390]) {
                    for (const variant of hasText ? ['as-is', 'plain'] : ['as-is']) {
                        if (variant === 'plain' && width === 390 && false) { continue; }
                        const { ctx, page } = await openLive(browser, {
                            width, height: 1400, page: which, keepReal: true, inject,
                        });
                        const tile = await page.$(`.dccgg-tile[data-key="${section}"]`);
                        if (!tile) { await ctx.close(); continue; }
                        await tile.click();
                        await page.waitForTimeout(800);
                        if (variant === 'plain') {
                            await page.evaluate(() => {
                                const p = [...document.querySelectorAll('p')].find((x) =>
                                    /menu below to view user manuals/i.test(x.textContent || ''));
                                if (p) { p.removeAttribute('style'); }
                            });
                            await page.waitForTimeout(350);
                        }
                        const f = `${OUT}Guest Guide - tpl-${which}-${section}-${safe(title)}`
                            + `-${width}-${variant}-${mode}.png`;
                        if (await shoot(page, section, title, f)) { n++; }
                        await ctx.close();
                    }
                }
            }
        }
    }
    console.log(`${n} stills`);
    await browser.close();
})();
