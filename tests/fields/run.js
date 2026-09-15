/**
 * Measures the checkout's FIELD GEOMETRY at phone width, in Chromium.
 *
 *   cd tests/fields && npm install && npm test
 *
 * WHY THIS EXISTS
 * The owner needs 3-4 taps to operate anything on /submit-booking/ on his
 * phone. His tap log showed nearly every press targeting the <p> wrapper or
 * the <section> rather than an input: the presses that reached an input were
 * at x 261-277 on a 390px screen, and the presses that hit nothing were at
 * x 339-374. Tapping a <p> does nothing at all, so the tap is simply lost.
 *
 * The cause was that this plugin never styled MotoPress's own text inputs —
 * only `select` and its own injected pet fields — while the standard it
 * publishes as "Custom Checkout - Field Standard.css" had declared the full
 * pill all along. The export and its source had diverged.
 *
 * These assertions are written in the owner's own coordinates, so they fail
 * against the release he was using and pass against the fix.
 */
const fs   = require('fs');
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
function atLeast(name, actual, min) {
    const ok = actual >= min;
    if (!ok) { failures++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) { console.log(`      wanted >= ${min}, got ${actual}`); }
}
function atMost(name, actual, max) {
    const ok = actual <= max;
    if (!ok) { failures++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) { console.log(`      wanted <= ${max}px, got ${actual}px`); }
}

// The controls the owner actually taps, by the ids in his log.
const FIELDS = ['#mphb_first_name', '#mphb_last_name', '#mphb_email', '#mphb_phone',
                '#mphb_address1', '#mphb_apartment_units', '#mphb_country', '#mphb_note'];

(async () => {
    const browser = await chromium.launch({ executablePath: chromiumPath() });
    // The owner's phone: 390x844, coarse pointer, touch enabled.
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true, isMobile: true, deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    await page.goto('file://' + path.join(__dirname, 'fields.html'));

    for (const sel of FIELDS) {
        const m = await page.$eval(sel, (el) => {
            const cs = getComputedStyle(el);
            const r  = el.getBoundingClientRect();
            const p  = el.closest('p');
            const pc = getComputedStyle(p);
            const pr = p.getBoundingClientRect();
            // The wrapper's CONTENT box — the strip the guest reads as "the
            // field's row". Anything inside it that is not the control is dead.
            const left  = pr.left  + parseFloat(pc.paddingLeft);
            const right = pr.right - parseFloat(pc.paddingRight);
            return {
                fontSize:  parseFloat(cs.fontSize),
                boxSizing: cs.boxSizing,
                height:    Math.round(r.height),
                deadLeft:  Math.round(r.left - left),
                deadRight: Math.round(right - r.right),
            };
        });

        // 44px is the smallest comfortable target; the plugin already holds
        // its own injected fields and the asterisk to it.
        atLeast(`${sel} is at least 44px tall`, m.height, 44);

        // Under 16px, iOS Safari zooms the whole page when the field takes
        // focus — a page-wide movement, right under the finger. Not cosmetic.
        atLeast(`${sel} font-size is 16px or more (iOS does not zoom)`, m.fontSize, 16);

        check(`${sel} is border-box`, m.boxSizing, 'border-box');

        // The dead strip. 1px of rounding is tolerable; 50px is what the owner
        // was tapping into.
        atMost(`${sel} has no dead strip on the left`, Math.abs(m.deadLeft), 1);
        atMost(`${sel} has no dead strip on the right`, Math.abs(m.deadRight), 1);
    }

    /* --- The symptom itself, in the owner's coordinates. ----------------
       x 339-374 is where his presses landed on a <p> and nothing happened.
       Ask the browser what is actually at those points now. ------------- */
    // 373, not the 374 in his log: this fixture's section padding puts the
    // content edge at exactly x=374, and elementFromPoint on the boundary
    // pixel belongs to the parent by definition. The dead-strip assertions
    // above are the precise statement; these three are the symptom itself.
    for (const x of [339, 361, 373]) {
        const hit = await page.evaluate((x) => {
            const input = document.querySelector('#mphb_apartment_units');
            const r = input.getBoundingClientRect();
            const el = document.elementFromPoint(x, Math.round(r.top + r.height / 2));
            return el ? (el.id || el.tagName.toLowerCase()) : 'none';
        }, x);
        check(`x=${x} on the Apartment row hits the input, not its <p>`,
              hit, 'mphb_apartment_units');
    }

    /* --- The label must not underline the guest's typed text (v0.12.0),
           re-asserted here because the kit rule is reproduced. ---------- */
    const labelDeco = await page.$eval('#mphb_first_name',
        el => getComputedStyle(el).textDecorationLine);
    check('typed value is not underlined', labelDeco, 'none');

    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
