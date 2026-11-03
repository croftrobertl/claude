/**
 * What does a symmetric reserve have to be? (v0.27.2)
 *
 * Surveys the lead and tail of EVERY title row on both live pages at every
 * width in the brief, so the reserve is picked from the host's own content
 * rather than from the one section I happened to look at.
 *
 *   node tools/title-sides.js [shipped|working]
 */
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const MODE = process.argv[2] || 'shipped';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const all = [];
    for (const which of ['guest', 'test']) {
        for (const width of [320, 390, 768, 1440]) {
            const { ctx, page } = await openLive(browser, {
                width, height: 900, page: which, keepReal: true, inject: MODE === 'working',
            });
            const keys = await page.$$eval('.dccgg-tile-wrap', (els) =>
                els.map((e) => e.dataset.sectionKey).filter(Boolean));
            for (const key of keys) {
                const tile = await page.$(`.dccgg-tile[data-key="${key}"]`);
                if (!tile) { continue; }
                await tile.click();
                await page.waitForTimeout(450);
                const rows = await page.$$eval(
                    `.dccgg-detail[data-key="${key}"] .dccgg-item-title`, (els) => els.map((row) => {
                        const t = row.querySelector('.dccgg-item-title-text');
                        const lead = row.querySelector('.dccgg-item-title-lead');
                        const tail = row.querySelector('.dccgg-item-title-tail');
                        if (!t || !t.getClientRects().length) { return null; }
                        const w = (el) => (el && el.getClientRects().length
                            ? Math.ceil(el.getBoundingClientRect().width) : 0);
                        return { t: (t.textContent || '').trim(), lead: w(lead), tail: w(tail) };
                    }).filter(Boolean));
                rows.forEach((r) => all.push({ page: which, width, section: key, ...r }));
                await page.keyboard.press('Escape');
                await page.waitForTimeout(350);
            }
            await ctx.close();
        }
    }
    const leads = all.map((r) => r.lead), tails = all.map((r) => r.tail);
    const top = (arr, k) => [...new Set(arr)].sort((a, b) => b - a).slice(0, k);
    console.log(MODE.toUpperCase(), `— ${all.length} title rows`);
    console.log('  lead widths seen:', top(leads, 8).join(', '));
    console.log('  tail widths seen:', top(tails, 8).join(', '));
    console.log('  MAX lead', Math.max(...leads), ' MAX tail', Math.max(...tails));
    const worst = all.slice().sort((a, b) => Math.abs(b.lead - b.tail) - Math.abs(a.lead - a.tail))[0];
    console.log('  biggest lead/tail gap:', JSON.stringify(worst));
    // what the widest row demands
    const byLead = all.slice().sort((a, b) => b.lead - a.lead)[0];
    const byTail = all.slice().sort((a, b) => b.tail - a.tail)[0];
    console.log('  widest lead:', JSON.stringify(byLead));
    console.log('  widest tail:', JSON.stringify(byTail));
    await browser.close();
})();
