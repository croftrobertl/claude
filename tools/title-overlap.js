/**
 * Does any item title run under its trailing controls? (v0.27.1)
 *
 *   node tools/title-overlap.js [shipped|working]
 *
 * Measures Rob's REAL content on both live pages — /guest/ (grid) and
 * /test/ (app shell) — at every width in the brief, by opening each section
 * and comparing the title text's box against the lead and tail boxes in the
 * same row. A positive number is an overlap in pixels.
 *
 * The page keeps its own markup throughout: this is about the host's titles,
 * not a fixture's.
 */
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const MODE = process.argv[2] || 'shipped';
const WIDTHS = [320, 390, 768, 1440];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const found = [];
    for (const which of ['guest', 'test']) {
        for (const width of WIDTHS) {
            const { ctx, page } = await openLive(browser, {
                width, height: 900, page: which, keepReal: true,
                inject: MODE === 'working',
            });
            const keys = await page.$$eval('.dccgg-tile-wrap', (els) =>
                els.map((e) => e.dataset.sectionKey).filter(Boolean));
            for (const key of keys) {
                const tile = await page.$(`.dccgg-tile[data-key="${key}"]`);
                if (!tile) { continue; }
                await tile.click();
                await page.waitForTimeout(500);
                const rows = await page.$$eval(
                    `.dccgg-detail[data-key="${key}"] .dccgg-item-title`, (els) => els.map((row) => {
                        const t = row.querySelector('.dccgg-item-title-text');
                        const lead = row.querySelector('.dccgg-item-title-lead');
                        const tail = row.querySelector('.dccgg-item-title-tail');
                        if (!t) { return null; }
                        const a = t.getBoundingClientRect();
                        const out = { t: (t.textContent || '').trim(), over: 0, side: '' };
                        if (tail && tail.getClientRects().length) {
                            const c = tail.getBoundingClientRect();
                            const d = Math.round(a.right - c.left);
                            if (d > out.over) { out.over = d; out.side = 'tail'; }
                        }
                        if (lead && lead.getClientRects().length) {
                            const c = lead.getBoundingClientRect();
                            const d = Math.round(c.right - a.left);
                            if (d > out.over) { out.over = d; out.side = 'lead'; }
                        }
                        return out;
                    }).filter(Boolean));
                rows.filter((r) => r.over > 0).forEach((r) => {
                    found.push({ page: which, width, section: key, title: r.t, overlap: r.over, side: r.side });
                });
                await page.keyboard.press('Escape');
                await page.waitForTimeout(400);
            }
            await ctx.close();
        }
    }
    console.log(MODE.toUpperCase());
    if (!found.length) { console.log('  no overlapping title anywhere'); }
    found.forEach((f) => console.log(
        `  ${f.page.padEnd(5)} ${String(f.width).padStart(4)}  ${f.section.padEnd(10)} ` +
        `${String(f.overlap).padStart(3)}px over the ${f.side}  "${f.title}"`));
    await browser.close();
})();
