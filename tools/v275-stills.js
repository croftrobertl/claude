/**
 * 0.27.5 stills: the 19 items Rob needs to approve, plus pick A at 320.
 *
 *   node tools/v275-stills.js <out-dir>
 *
 * The 19 are the union of two sets: the 14 whose alignment 0.27.4 changed
 * (all reverted here) and the items that gain a paragraph gap. Five items
 * are in the second set only.
 *
 * BEFORE is the live assets, which is 0.27.2 — what staging runs now and
 * what Rob is comparing against. 0.27.4 is not going live and is not the
 * baseline for anything.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/v275') + '/';
fs.mkdirSync(OUT, { recursive: true });

// page, section, title, why
const ALIGN = [
    ['guest', 'internet', 'Ethernet'], ['guest', 'canal', 'Fish Cleaning'],
    ['guest', 'canal', 'Where to Launch'], ['guest', 'checkout', 'Kitchenware'],
    ['guest', 'checkout', 'Key & Lock'], ['guest', 'rules', 'No Pets'],
    ['guest', 'rules', 'No Children'], ['guest', 'rules', 'Fish Cleaning'],
    ['guest', 'rules', "Don't Feed Wildlife"], ['guest', 'rules', 'Maximum Guests'],
    ['guest', 'rules', 'Trash Pickup'], ['guest', 'rules', 'Cleaning Tools'],
    ['test', 'canal', 'Where to Launch'], ['test', 'rules', 'No Children'],
];
const GAP = [
    ['guest', 'amenities', 'Roku TV'], ['guest', 'canal', 'Fish Cleaning'],
    ['guest', 'canal', 'Where to Launch'], ['guest', 'checkout', 'Kitchenware'],
    ['guest', 'checkout', 'Key & Lock'], ['guest', 'rules', 'No Children'],
    ['test', 'amenities', 'Roku TV'], ['test', 'canal', 'Fish Cleaning'],
    ['test', 'canal', 'Where to Launch'], ['test', 'checkout', 'Kitchenware'],
    ['test', 'checkout', 'Key & Lock'], ['test', 'rules', 'No Children'],
];
const key = (t) => t.join('|');
const ALL = [];
[...ALIGN, ...GAP].forEach((t) => { if (!ALL.some((x) => key(x) === key(t))) { ALL.push(t); } });

const safe = (s) => s.replace(/[^A-Za-z0-9 &]/g, '').trim();

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const made = [];
    // --- the 19 items, cropped, at 390 ---
    for (const [mode, inject] of [['before', false], ['after', true]]) {
        for (const which of ['guest', 'test']) {
            const mine = ALL.filter((t) => t[0] === which);
            if (!mine.length) { continue; }
            const { ctx, page } = await openLive(browser, {
                width: 390, height: 1400, page: which, keepReal: true, inject,
            });
            for (const section of [...new Set(mine.map((t) => t[1]))]) {
                const tile = await page.$(`.dccgg-tile[data-key="${section}"]`);
                if (!tile) { continue; }
                await tile.click();
                await page.waitForTimeout(700);
                for (const [, , title] of mine.filter((t) => t[1] === section)) {
                    const h = await page.evaluateHandle(({ section, title }) => {
                        const items = [...document.querySelectorAll(
                            `.dccgg-detail[data-key="${section}"] .dccgg-item`)];
                        return items.find((it) => {
                            const t = it.querySelector('.dccgg-item-title-text');
                            return t && t.textContent.trim() === title;
                        }) || null;
                    }, { section, title });
                    const el = h.asElement();
                    if (!el) { console.log(`  MISSING ${which}/${section}/${title}`); continue; }
                    await el.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(220);
                    const f = `${OUT}Guest Guide - item-${which}-${section}-${safe(title)}-${mode}.png`;
                    await el.screenshot({ path: f });
                    made.push(f);
                }
                await page.keyboard.press('Escape');
                await page.waitForTimeout(350);
            }
            await ctx.close();
        }
    }
    // --- pick A at 320, Checkout and Rules, both pages, before and after ---
    for (const [mode, inject] of [['before', false], ['after', true]]) {
        for (const which of ['guest', 'test']) {
            for (const section of ['checkout', 'rules']) {
                const { ctx, page } = await openLive(browser, {
                    width: 320, height: 1000, page: which, keepReal: true, inject,
                });
                const tile = await page.$(`.dccgg-tile[data-key="${section}"]`);
                if (!tile) { await ctx.close(); continue; }
                await tile.click();
                await page.waitForTimeout(800);
                const f = `${OUT}Guest Guide - pickA-320-${section}-${which === 'guest' ? 'guest-grid' : 'test-app-shell'}-${mode}.png`;
                await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 320, height: 1000 } });
                made.push(f);
                await ctx.close();
            }
        }
    }
    console.log(`${made.length} stills, ${ALL.length} items`);
    await browser.close();
})();
