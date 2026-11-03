/**
 * 390 before/after stills of every item whose alignment changes (v0.27.3).
 *
 *   node tools/align-stills.js <out-dir>
 *
 * Cropped to the item itself rather than the whole screen: the change is a
 * property of one block of copy, and a full phone screen buries it.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/v273') + '/';
fs.mkdirSync(OUT, { recursive: true });

// page, section, title — from tools/align-survey.js
const TARGETS = [
    ['guest', 'internet', 'Ethernet'],
    ['guest', 'canal', 'Fish Cleaning'],
    ['guest', 'canal', 'Where to Launch'],
    ['guest', 'checkout', 'Kitchenware'],
    ['guest', 'checkout', 'Key & Lock'],
    ['guest', 'rules', 'No Pets'],
    ['guest', 'rules', 'No Children'],
    ['guest', 'rules', 'Fish Cleaning'],
    ['guest', 'rules', "Don't Feed Wildlife"],
    ['guest', 'rules', 'Maximum Guests'],
    ['guest', 'rules', 'Trash Pickup'],
    ['guest', 'rules', 'Cleaning Tools'],
    ['test', 'canal', 'Where to Launch'],
    ['test', 'rules', 'No Children'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const made = [];
    for (const [mode, inject] of [['before', false], ['after', true]]) {
        for (const which of ['guest', 'test']) {
            const mine = TARGETS.filter((t) => t[0] === which);
            if (!mine.length) { continue; }
            const { ctx, page } = await openLive(browser, {
                width: 390, height: 1400, page: which, keepReal: true, inject,
            });
            const sections = [...new Set(mine.map((t) => t[1]))];
            for (const section of sections) {
                const tile = await page.$(`.dccgg-tile[data-key="${section}"]`);
                if (!tile) { continue; }
                await tile.click();
                await page.waitForTimeout(700);
                for (const [, , title] of mine.filter((t) => t[1] === section)) {
                    const handle = await page.evaluateHandle(({ section, title }) => {
                        const items = [...document.querySelectorAll(
                            `.dccgg-detail[data-key="${section}"] .dccgg-item`)];
                        return items.find((it) => {
                            const t = it.querySelector('.dccgg-item-title-text');
                            return t && t.textContent.trim() === title;
                        }) || null;
                    }, { section, title });
                    const el = handle.asElement();
                    if (!el) { console.log(`  MISSING ${which}/${section}/${title}`); continue; }
                    await el.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(250);
                    const safe = title.replace(/[^A-Za-z0-9 &]/g, '').trim();
                    const file = `${OUT}Guest Guide - align-${which}-${section}-${safe}-${mode}.png`;
                    await el.screenshot({ path: file });
                    made.push(file);
                }
                await page.keyboard.press('Escape');
                await page.waitForTimeout(400);
            }
            await ctx.close();
        }
    }
    console.log(`${made.length} stills`);
    await browser.close();
})();
