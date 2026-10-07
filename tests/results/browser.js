/**
 * v0.30.1 (headings revised v0.30.2) — Add New Booking step 2, the results table, in real Chromium at
 * 1280 and 390. The markup is what tests/results/run.php prints through the
 * SHIPPED Results_Labels (the verbatim live template, MotoPress's hooks).
 * WordPress's admin CSS is not available here: the page REPRODUCES only the
 * two core rules that lay this table out (.widefat width 100%, table.fixed
 * table-layout fixed) — a stand-in, so the Director's read-only look at step 2
 * is the real check.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const form = which => execFileSync('php', [path.join(__dirname, 'run.php'), 'fixture', which], { encoding: 'utf8' });

let failures = 0, passes = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passes++; } else { failures++; }
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
    if (!ok) { console.log('      expected: ' + JSON.stringify(expected)); console.log('      actual:   ' + JSON.stringify(actual)); }
}
const page = html => `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;padding:0 10px;font:13px/1.4 -apple-system,sans-serif}.widefat{width:100%;border-spacing:0}
table.fixed{table-layout:fixed}.widefat td,.widefat th{padding:8px 10px;text-align:left;vertical-align:top}
.check-column{width:2.2em}</style></head><body><div class="wrap">${html}</div></body></html>`;

(async () => {
    const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
    for (const width of [1280, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        const pg = await ctx.newPage();
        await pg.setContent(page(form('live')));
        const read = await pg.evaluate(() => Array.from(document.querySelectorAll('table.widefat')).map(t => ({
            head: Array.from(t.querySelectorAll('thead th')).map(th => th.innerText.trim()),
            row: Array.from(t.querySelectorAll('tbody td')).slice(1).map(td => td.innerText.trim()),
        })));
        check(`${width}px: every table's headings read Title · Capacity · Total (minus taxes/fees)`,
            read.map(r => r.head), Array(3).fill(['', 'Title', 'Capacity', 'Total (minus taxes/fees)']));
        check(`${width}px: each row shows the cottage, how many it sleeps, the stay total`, read.map(r => r.row), [
            ['Cottage 32: Flamingo Bungalow', '4', '$700'], ['Cottage 22: The Boathouse', '4', '$800'], ['Cottage 33', '2', '$600']]);
        const geo = await pg.evaluate(() => ({
            page: document.documentElement.scrollWidth - window.innerWidth,
            heads: Array.from(document.querySelectorAll('thead th')).every(th => th.scrollWidth <= th.clientWidth + 1),
        }));
        check(`${width}px: no horizontal page scroll, and every heading fits its column (it wraps, it is not cut)`, [geo.page <= 0, geo.heads], [true, true]);
        check(`${width}px: the checkboxes still name their rooms (nothing in the form changed)`,
            await pg.$$eval('input[type=checkbox]', bs => bs.map(b => b.name + '=' + b.value)),
            ['mphb_rooms[1065][]=500', 'mphb_rooms[1071][]=501', 'mphb_rooms[1604][]=502']);
        await pg.setContent(page(form('children')));
        check(`${width}px: a cottage taking children shows the suffix`,
            await pg.$eval('tbody td:nth-child(3)', td => td.innerText.trim()), '6 · up to 2 children');
        await ctx.close();
    }
    await browser.close();
    console.log(failures ? `\n${failures} failing, ${passes} passing` : `\nall passing (${passes})`);
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
