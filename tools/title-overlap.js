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
 * It also reports a SPLIT WORD, which is a different fault with the same
 * cause and none of the same symptoms: breaking mid-word neither overlaps
 * anything nor overflows anything, so the comparison above cannot see it —
 * yet "Kitchenwar / e" is what the first attempt at this fix shipped. It
 * lives here rather than in the browser suite because the suite's harness
 * lays the title out at 82px in 20px type where the live page gives it 151px
 * in 25px, so no fixture word sits at the real boundary.
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
    const splits = [];
    const offs = [];
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
                        // Does any single word want more than the track?
                        // Laid out in the title's own font, in a detached
                        // span, so it measures the word and not the wrap.
                        const probe = document.createElement('span');
                        probe.style.cssText =
                            'position:fixed;left:-9999px;top:0;white-space:pre;visibility:hidden';
                        const cs = getComputedStyle(t);
                        probe.style.fontWeight = cs.fontWeight;
                        probe.style.fontSize = cs.fontSize;
                        probe.style.fontFamily = cs.fontFamily;
                        probe.style.letterSpacing = cs.letterSpacing;
                        document.body.appendChild(probe);
                        out.split = 0; out.word = '';
                        out.textContent = (t.textContent || '').trim();
                        out.textContent.split(/\s+/).forEach((w) => {
                            if (!w) { return; }
                            probe.textContent = w;
                            const over = Math.ceil(probe.getBoundingClientRect().width) - t.clientWidth;
                            if (over > out.split) { out.split = over; out.word = w; }
                        });
                        probe.remove();
                        // v0.27.2: how far the title's own centre sits from
                        // the ROW's centre. This is the thing Rob picked, and
                        // it is measured on the text box rather than on the
                        // track, because a centred track holding a left-aligned
                        // box would still read off centre.
                        const rowBox = row.getBoundingClientRect();
                        out.off = Math.round(Math.abs(
                            (a.left + a.right) / 2 - (rowBox.left + rowBox.right) / 2));
                        return out;
                    }).filter(Boolean));
                rows.filter((r) => r.over > 0).forEach((r) => {
                    found.push({ page: which, width, section: key, title: r.t, overlap: r.over, side: r.side });
                });
                // 2px, not 0: the detached probe lands within a pixel or two
                // of the real line box. A genuine split costs far more.
                rows.filter((r) => r.split > 2).forEach((r) => {
                    splits.push({ page: which, width, section: key, title: r.t, word: r.word, over: r.split });
                });
                rows.forEach((r) => offs.push({ page: which, width, off: r.off, title: r.t }));
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
    if (!splits.length) { console.log('  no word split in any title'); }
    splits.forEach((f) => console.log(
        `  ${f.page.padEnd(5)} ${String(f.width).padStart(4)}  ${f.section.padEnd(10)} ` +
        `SPLIT "${f.word}" by ${f.over}px  in "${f.title}"`));
    console.log('  off centre, worst per page and width:');
    [...new Set(offs.map((o) => `${o.page} ${o.width}`))].forEach((k) => {
        const [pg, w] = k.split(' ');
        const rows = offs.filter((o) => o.page === pg && String(o.width) === w);
        const worst = rows.reduce((m, o) => (o.off > m.off ? o : m), rows[0]);
        console.log(`    ${pg.padEnd(5)} ${w.padStart(4)}  ${String(worst.off).padStart(3)}px` +
            (worst.off ? `  "${worst.title}"` : ''));
    });
    await browser.close();
})();
