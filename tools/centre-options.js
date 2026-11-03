/**
 * Item 2: four ways to put every title on one centre line at 320, without
 * touching font family, size or weight. OPTIONS ONLY — none of this ships.
 *
 *   node tools/centre-options.js <out-dir>
 *
 * Each option is injected as a stylesheet over the LIVE page, on top of the
 * shipped 0.27.2 assets, so what is measured and photographed is Rob's own
 * content in the real theme.
 *
 * The constraint, measured in 0.27.2: the lead (checkbox + emoji) runs to
 * 76px and the tail (read-aloud) to 32px. Dead centre needs both sides equal,
 * which costs the middle column 44px — and at 320 that breaks a word. Every
 * option below buys those 44px back somewhere else.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

const OUT = (process.argv[2] || '/tmp/v273-opts') + '/';
fs.mkdirSync(OUT, { recursive: true });

// Every option is narrow-widths-only; 390 is rendered too, to show it is
// untouched there.
const NARROW = '@media (max-width: 389.98px)';
const SIDE = '.dccgg-item-title-lead.dccgg-item-title-lead, .dccgg-item-title-tail.dccgg-item-title-tail';

const OPTIONS = {
    // Shipped 0.27.2, for the before column.
    base: '',

    // A. Emoji above the title, centred; checkbox left, speaker right.
    //    display:contents dissolves the lead box so the checkbox and the
    //    emoji become grid items of the title row itself — otherwise a
    //    grid-area on the emoji does nothing, because its parent is the
    //    lead flexbox and not the grid. (That was my first attempt and it
    //    measured a 26px overlap: the lead still held both, in a 44px
    //    column.)
    A: `${NARROW} {
        .dccgg-item-title.dccgg-item-title {
            grid-template-areas: "lead emoji tail" "lead title tail";
            grid-template-columns: minmax(44px, 1fr) minmax(0, auto) minmax(44px, 1fr);
            row-gap: 0;
        }
        .dccgg-item-title-lead.dccgg-item-title-lead { display: contents; }
        .dccgg-item-title-lead .dccgg-item-check { grid-area: lead; justify-self: start; align-self: center; }
        .dccgg-item-title-lead .dccgg-emoji-icon { grid-area: emoji; justify-self: center; }
        .dccgg-item-title-tail.dccgg-item-title-tail { grid-area: tail; min-width: 44px; justify-self: end; }
        .dccgg-item-title-text.dccgg-item-title-text { grid-area: title; }
    }`,

    // B. A smaller emoji, narrow widths only. 14px is the answer to "what
    //    size makes the lead fit": the tracks at 320 are 76/152/32 with 6px
    //    gaps, so a symmetric reserve R leaves the title 260 - 2R, and
    //    "Kitchenware" needs 152 -> R <= 54. The lead is 24 (checkbox) + 8
    //    (gap) + 36 (emoji) = 76 incl. padding, so the emoji has to give up
    //    22px: 36 -> 14.
    B: `${NARROW} {
        .dccgg-item-title-lead .dccgg-emoji-icon {
            font-size: 14px; width: 14px; height: 14px; min-width: 14px;
        }
        ${SIDE} { min-width: 54px; }
    }`,

    // C. The speaker joins the checkbox on the lead side. Reported for
    //    completeness: it is the one option the arithmetic rules out before
    //    any CSS is written. Everything on one side makes the lead
    //    24 + 8 + 36 + 8 + 32 = 108, so the mirror on the right is 108 too
    //    and the title is left 260 - 216 = 44px. Measured below.
    C: `${NARROW} {
        .dccgg-item-title-tail.dccgg-item-title-tail {
            grid-column: 1; grid-row: 1; justify-self: start;
            min-width: 0; margin-left: 76px;
        }
        .dccgg-item-title-lead.dccgg-item-title-lead { min-width: 0; }
        .dccgg-item-title.dccgg-item-title {
            grid-template-columns: minmax(108px, 1fr) minmax(0, auto) minmax(108px, 1fr);
        }
    }`,

    // D. The title on its own full-width line, controls on the row above.
    D: `${NARROW} {
        .dccgg-item-title.dccgg-item-title {
            grid-template-areas: "lead tail" "title title";
            grid-template-columns: auto auto;
            justify-content: space-between;
            row-gap: 0;
        }
        .dccgg-item-title-lead.dccgg-item-title-lead { grid-area: lead; min-width: 0; }
        .dccgg-item-title-tail.dccgg-item-title-tail { grid-area: tail; min-width: 0; }
        .dccgg-item-title-text.dccgg-item-title-text { grid-area: title; }
    }`,

    // E (mine). One row still, but the CHECKBOX leaves the title's three
    //    slots and sits in the row's own padding. It can: since v0.25.1 the
    //    whole title row ticks the item, so the checkbox is a marker more
    //    than a target. The lead is then the 36px emoji alone, against a
    //    32px tail — 2px apart, and the title keeps 188px.
    //    Padding on BOTH sides, or the row's centre moves and the title
    //    looks off by half the padding (my first attempt measured 19px).
    E: `${NARROW} {
        .dccgg-item--checkable .dccgg-item-title {
            position: relative; padding-left: 32px; padding-right: 32px;
        }
        .dccgg-item-title-lead .dccgg-item-check {
            position: absolute; left: 0; top: 50%; transform: translateY(-50%); margin: 0;
        }
        ${SIDE} { min-width: 36px; }
    }`,
};

const measure = async (page, section) => page.$$eval(
    `.dccgg-detail[data-key="${section}"] .dccgg-item-title`, (rows) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:fixed;left:-9999px;white-space:pre;visibility:hidden';
        document.body.appendChild(probe);
        let off = 0, overlap = 0, split = 0, worstWord = '', rowH = 0;
        rows.forEach((row) => {
            const t = row.querySelector('.dccgg-item-title-text');
            if (!t || !t.getClientRects().length) { return; }
            const a = t.getBoundingClientRect(), b = row.getBoundingClientRect();
            off = Math.max(off, Math.round(Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2)));
            rowH = Math.max(rowH, Math.round(b.height));
            ['lead', 'tail'].forEach((side) => {
                const el = row.querySelector(`.dccgg-item-title-${side}`);
                if (!el || !el.getClientRects().length) { return; }
                const c = el.getBoundingClientRect();
                // only count a horizontal clash on the same line
                const sameLine = !(c.bottom <= a.top + 1 || c.top >= a.bottom - 1);
                if (!sameLine) { return; }
                const d = Math.round(side === 'tail' ? a.right - c.left : c.right - a.left);
                if (d > overlap) { overlap = d; }
            });
            const cs = getComputedStyle(t);
            probe.style.fontWeight = cs.fontWeight; probe.style.fontSize = cs.fontSize;
            probe.style.fontFamily = cs.fontFamily; probe.style.letterSpacing = cs.letterSpacing;
            (t.textContent || '').trim().split(/\s+/).forEach((w) => {
                probe.textContent = w;
                const o = Math.ceil(probe.getBoundingClientRect().width) - t.clientWidth;
                if (o > split) { split = o; worstWord = w; }
            });
        });
        probe.remove();
        // smallest tap target among the row's controls
        let tap = Infinity, which = '';
        rows.forEach((row) => {
            row.querySelectorAll('button, .dccgg-item-check').forEach((el) => {
                if (!el.getClientRects().length) { return; }
                const r = el.getBoundingClientRect();
                let w = r.width, h = r.height;
                const after = getComputedStyle(el, '::after');
                const aw = parseFloat(after.width), ah = parseFloat(after.height);
                if (!isNaN(aw) && aw > w) { w = aw; }
                if (!isNaN(ah) && ah > h) { h = ah; }
                const m = Math.round(Math.min(w, h));
                if (m < tap) { tap = m; which = el.className.split(' ')[0]; }
            });
        });
        return { off, overlap, split, worstWord, rowH, tap: tap === Infinity ? null : tap, tapOn: which };
    });

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const rows = [];
    for (const [name, css] of Object.entries(OPTIONS)) {
        for (const which of ['guest', 'test']) {
            for (const section of ['checkout', 'rules']) {
                for (const width of [320, 390]) {
                    const { ctx, page } = await openLive(browser, {
                        width, height: 1000, page: which, keepReal: true, inject: true,
                    });
                    if (css) { await page.addStyleTag({ content: css }); }
                    const tile = await page.$(`.dccgg-tile[data-key="${section}"]`);
                    if (!tile) { await ctx.close(); continue; }
                    await tile.click();
                    await page.waitForTimeout(800);
                    const m = await measure(page, section);
                    rows.push({ option: name, page: which, section, width, ...m });
                    if (section === 'checkout' || section === 'rules') {
                        await page.screenshot({
                            path: `${OUT}Guest Guide - opt${name}-${width}-${section}-${which === 'guest' ? 'guest-grid' : 'test-app-shell'}.png`,
                            clip: { x: 0, y: 0, width, height: 1000 },
                        });
                    }
                    await ctx.close();
                }
            }
        }
    }
    fs.writeFileSync(`${OUT}measurements.json`, JSON.stringify(rows, null, 1));
    console.log(JSON.stringify(rows));
    await browser.close();
})();
