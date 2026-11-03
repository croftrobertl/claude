/**
 * How does Rob's content actually mark a paragraph break? (v0.27.5)
 *
 *   node tools/para-survey.js
 *
 * Reads the item bodies out of both live pages and classifies the markup,
 * because the gap has to appear however a break is marked and a single line
 * break inside a sentence must NOT become one.
 */
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const rows = [];
    for (const which of ['guest', 'test']) {
        const { ctx, page } = await openLive(browser, {
            width: 390, height: 900, page: which, keepReal: true,
        });
        const keys = await page.$$eval('.dccgg-tile-wrap', (els) =>
            els.map((e) => e.dataset.sectionKey).filter(Boolean));
        for (const key of keys) {
            const tile = await page.$(`.dccgg-tile[data-key="${key}"]`);
            if (!tile) { continue; }
            await tile.click();
            await page.waitForTimeout(450);
            const items = await page.$$eval(
                `.dccgg-detail[data-key="${key}"] .dccgg-item`, (els) => els.map((item) => {
                    const t = item.querySelector('.dccgg-item-title-text');
                    const body = item.querySelector('.dccgg-item-body');
                    if (!body) { return null; }
                    const html = body.innerHTML;
                    const ps = body.querySelectorAll('p');
                    const brs = body.querySelectorAll('br');
                    // consecutive <br><br> in the raw html
                    const doubleBr = (html.match(/<br\s*\/?>\s*<br\s*\/?>/gi) || []).length;
                    const singleBr = brs.length - doubleBr * 2;
                    // bare text nodes directly under the body with real text
                    const bareText = [...body.childNodes]
                        .filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
                    const lists = body.querySelectorAll('ul, ol').length;
                    const lis = body.querySelectorAll('li').length;
                    return {
                        title: (t ? t.textContent : '').trim(),
                        p: ps.length, br: brs.length, doubleBr, singleBr, bareText,
                        lists, lis,
                        // what the rendered gap between consecutive <p> is today
                        gap: ps.length > 1
                            ? Math.round(ps[1].getBoundingClientRect().top
                                       - ps[0].getBoundingClientRect().bottom)
                            : null,
                        pMargins: ps.length ? [...ps].slice(0, 2).map((p) => {
                            const cs = getComputedStyle(p);
                            return `${cs.marginTop}/${cs.marginBottom}`;
                        }) : [],
                    };
                }).filter(Boolean));
            items.forEach((i) => rows.push({ page: which, section: key, ...i }));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        }
        await ctx.close();
    }
    console.log(JSON.stringify(rows));
    await browser.close();
})();
