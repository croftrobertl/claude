/**
 * Measures the checkout button against the site button spec, in Chromium.
 *
 *   cd tests/button && npm install && npm test
 *
 * This exists because /submit-booking/ only renders with a live reservation in
 * the session, and nobody should create a booking on a live booking site to
 * read a font size. button.html reproduces the theme and Elementor-kit rules
 * that compete with the plugin's, so the cascade is real even though the page
 * is not.
 */
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Use the Chromium already on the machine rather than downloading one: the
// pinned playwright build and the pre-installed browser build often differ.
function chromiumPath() {
    if (process.env.DCC_CHROMIUM) { return process.env.DCC_CHROMIUM; }
    const roots = ['/opt/pw-browsers'];
    for (const root of roots) {
        if (!fs.existsSync(root)) { continue; }
        for (const dir of fs.readdirSync(root)) {
            for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
                const bin = path.join(root, dir, rel);
                if (fs.existsSync(bin)) { return bin; }
            }
        }
    }
    return undefined; // Let playwright find its own.
}

// The site button spec: the "Send Message" button at /contact/.
const SPEC = {
    fontFamily:    'Raleway, -apple-system, "system-ui", "Segoe UI", Arial, sans-serif',
    fontSize:      '20px',
    fontWeight:    '500',
    lineHeight:    '50px',
    letterSpacing: '0.5px',
    textTransform: 'none',
    color:         'rgb(255, 255, 255)',
    backgroundColor: 'rgb(0, 107, 207)',
    borderTopWidth:  '0px',
    borderRadius:  '30px',
    boxShadow:     'none',
};
const HOVER = { backgroundColor: 'rgb(240, 128, 128)', color: 'rgb(255, 255, 255)' };

let failures = 0;
function check(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) { failures++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) { console.log(`      expected: ${expected}\n      actual:   ${actual}`); }
}

const read = (page, sel, props) => page.$eval(sel, (el, props) => {
    const cs = getComputedStyle(el);
    const out = {};
    props.forEach(p => { out[p] = cs[p]; });
    out._width = Math.round(el.getBoundingClientRect().width);
    out._height = Math.round(el.getBoundingClientRect().height);
    return out;
}, props);

(async () => {
    const browser = await chromium.launch({ executablePath: chromiumPath() });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto('file://' + path.join(__dirname, 'button.html'));

    /* --- Resting: the spec, against the theme and kit fighting it. ------ */
    const rest = await read(page, '#submit-desktop', Object.keys(SPEC));
    for (const [prop, want] of Object.entries(SPEC)) {
        check(`resting ${prop}`, rest[prop], want);
    }
    check('resting height is the 50px line-height', String(rest._height), '50');

    /* --- Hover: the trap. A hover rule losing to its own resting rule
           fails silently and still reads correctly in the file. ---------- */
    await page.hover('#submit-desktop');
    // The spec transitions background-color over .15s, so an immediate read
    // catches the animation at t=0 and reports the RESTING colour. Wait for it
    // to settle, or this asserts nothing. (First run of this harness did
    // exactly that and reported a false failure.)
    await page.waitForTimeout(400);
    const hov = await read(page, '#submit-desktop', Object.keys(HOVER));
    for (const [prop, want] of Object.entries(HOVER)) {
        check(`hover ${prop}`, hov[prop], want);
    }
    await page.mouse.move(0, 0);

    /* --- The asterisk must not have become a pill. ---------------------- */
    const star = await read(page, '#asterisk',
        ['backgroundColor', 'fontSize', 'borderRadius', 'color']);
    check('asterisk has no button fill', star.backgroundColor, 'rgba(0, 0, 0, 0)');
    check('asterisk is not 20px button type', star.fontSize !== '20px', true);
    check('asterisk keeps a >=44px touch target', star._height >= 44, true);
    check('asterisk did not inherit the 30px pill radius', star.borderRadius, '0px');

    /* --- 375px: still a button, still inside the viewport. -------------- */
    await page.setViewportSize({ width: 375, height: 800 });
    const narrow = await read(page, '#submit-narrow', ['fontSize', 'backgroundColor']);
    check('375px: still the spec type', narrow.fontSize, '20px');
    check('375px: still the spec fill', narrow.backgroundColor, 'rgb(0, 107, 207)');
    check('375px: fits inside the 375px column', narrow._width <= 343, true);
    console.log(`\n      measured at 375px: ${narrow._width}px wide x ${narrow._height}px tall`);
    console.log(`      measured at 1280px: ${rest._width}px wide x ${rest._height}px tall`);

    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
