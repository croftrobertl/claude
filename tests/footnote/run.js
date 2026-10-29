/**
 * ITEM 4 — opening the tax footnote must not change the widget's width.
 *
 *   cd tests/footnote && npm install && npm test
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function chromiumPath() {
    if (process.env.DCC_CHROMIUM) { return process.env.DCC_CHROMIUM; }
    const root = '/opt/pw-browsers';
    if (fs.existsSync(root)) {
        for (const dir of fs.readdirSync(root)) {
            for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
                const bin = path.join(root, dir, rel);
                if (fs.existsSync(bin)) { return bin; }
            }
        }
    }
    return undefined;
}

let failures = 0;
function check(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) { failures++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) { console.log(`      expected: ${expected}\n      actual:   ${actual}`); }
}

const width = (page, sel) => page.$eval(sel,
    el => Math.round(el.getBoundingClientRect().width));

(async () => {
    const browser = await chromium.launch({ executablePath: chromiumPath() });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto('file://' + path.join(__dirname, 'footnote.html'));

    const closed = await width(page, '#widget');
    await page.$eval('#note', el => el.classList.remove('dcc_checkout-section-hidden'));
    const open = await width(page, '#widget');

    check('the widget is the same width with the footnote open', open, closed);

    // And the note is still readable — width:0 must not be what it RENDERS at.
    const note = await width(page, '#note');
    check('the footnote still fills the widget it sits in', note, closed);

    // The guard that makes the pair work. width:100% alone looks identical in
    // the file and reintroduces the defect.
    const declared = await page.$eval('#note', el => {
        const cs = getComputedStyle(el);
        return `${cs.minWidth !== '0px'}`;
    });
    check('min-width is what gives it its rendered width', declared, 'true');

    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
