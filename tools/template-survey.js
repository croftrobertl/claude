/**
 * Every template item on both live pages, and what the default text rule
 * would do to it. (v0.27.6 — survey before building, as instructed.)
 *
 *   node tools/template-survey.js
 *
 * A template item is one whose content area holds a rendered Elementor
 * template instead of the plugin's own .dccgg-item-body. The plugin owns the
 * chrome of such an item and, from this release, its TEXT — but not the
 * things inside it that are not text.
 */
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const rows = [];
    for (const which of ['guest', 'test']) {
        const { ctx, page } = await openLive(browser, {
            width: 390, height: 1200, page: which, keepReal: true,
        });
        const keys = await page.$$eval('.dccgg-tile-wrap', (els) =>
            els.map((e) => e.dataset.sectionKey).filter(Boolean));
        for (const key of keys) {
            const tile = await page.$(`.dccgg-tile[data-key="${key}"]`);
            if (!tile) { continue; }
            await tile.click();
            await page.waitForTimeout(600);
            const items = await page.$$eval(
                `.dccgg-detail[data-key="${key}"] .dccgg-item`, (els) => els.map((item) => {
                    const t = item.querySelector('.dccgg-item-title-text');
                    const wrap = item.querySelector('.dccgg-item-content-wrap');
                    if (!wrap) { return null; }
                    const body = wrap.querySelector('.dccgg-item-body');
                    const tpl = wrap.querySelector('.elementor');
                    if (!tpl || body) { return null; }   // not a template item
                    const vis = (el) => el.getClientRects().length > 0;
                    const ps = [...tpl.querySelectorAll('p')]
                        .filter((p) => (p.textContent || '').trim() && vis(p));
                    const lists = [...tpl.querySelectorAll('ul, ol')].filter(vis);
                    const lis = [...tpl.querySelectorAll('li')].filter(vis);
                    const risky = {
                        iframes: tpl.querySelectorAll('iframe').length,
                        forms: tpl.querySelectorAll('form').length,
                        tables: tpl.querySelectorAll('table').length,
                        buttons: tpl.querySelectorAll('a.elementor-button, button, .elementor-button').length,
                        images: tpl.querySelectorAll('img').length,
                        maps: tpl.querySelectorAll('[class*="map"], iframe[src*="map"]').length,
                        videos: tpl.querySelectorAll('video, [class*="video"]').length,
                        widgets: [...new Set([...tpl.querySelectorAll('[class*="elementor-widget-"]')]
                            .map((w) => (w.className.match(/elementor-widget-([a-z0-9-]+)/) || [])[1])
                            .filter(Boolean))],
                    };
                    return {
                        title: (t ? t.textContent : '').trim(),
                        paras: ps.map((p) => ({
                            text: (p.textContent || '').trim().slice(0, 44),
                            align: getComputedStyle(p).textAlign,
                            wrap: getComputedStyle(p).textWrap
                                || getComputedStyle(p).textWrapStyle || '',
                            marginTop: Math.round(parseFloat(getComputedStyle(p).marginTop)),
                            inlineStyle: p.getAttribute('style') || '',
                            inList: !!p.closest('li'),
                            inButton: !!p.closest('a, button, .elementor-button'),
                        })),
                        listCount: lists.length,
                        liCount: lis.length,
                        liAlign: lis.map((li) => getComputedStyle(li).textAlign),
                        listStyle: lists.map((l) => getComputedStyle(l).listStylePosition),
                        risky,
                    };
                }).filter(Boolean));
            items.forEach((i) => rows.push({ page: which, section: key, ...i }));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(350);
        }
        await ctx.close();
    }
    console.log(JSON.stringify(rows));
    await browser.close();
})();
