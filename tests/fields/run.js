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
        // 18px matches the Availability Calendar's filter row (item 6). The
        // assertion above is the one that matters functionally; this one keeps
        // the two plugins looking like one site.
        check(`${sel} font-size matches the calendar's 18px`, m.fontSize, 18);

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

    /* --- Item 6: the cap, and the half of it that is easy to forget. -----
       At phone width the cap must be INERT — that is the whole reason it is
       360px and not 320px. At desktop width it must bind, and the WRAPPER must
       come with it: cap the field alone and the dead strip 0.13.0 removed
       comes straight back. ------------------------------------------------ */
    const phone = await page.$eval('#mphb_first_name', el => ({
        field: Math.round(el.getBoundingClientRect().width),
        row:   Math.round(el.closest('p').getBoundingClientRect().width),
    }));
    check('phone: the 360px cap does not bite at 390px wide',
          String(phone.field === phone.row), 'true');
    atLeast('phone: the field is still the full row', phone.field, 340);

    const desk = await context.newPage();
    await desk.setViewportSize({ width: 1280, height: 900 });
    await desk.goto('file://' + path.join(__dirname, 'fields.html'));
    const wide = await desk.$eval('#mphb_first_name', (el) => {
        const r = el.getBoundingClientRect();
        const p = el.closest('p').getBoundingClientRect();
        return {
            field: Math.round(r.width),
            row:   Math.round(p.width),
            left:  Math.round(r.left - p.left),
            right: Math.round(p.right - r.right),
        };
    });
    check('desktop: the field is capped at 360px', String(wide.field), '360');
    check('desktop: THE WRAPPER IS CAPPED TOO — no dead strip beside the field',
          String(wide.row), '360');
    atMost('desktop: no dead strip on the left', Math.abs(wide.left), 1);
    atMost('desktop: no dead strip on the right', Math.abs(wide.right), 1);
    await desk.close();

    /* --- The label must not underline the guest's typed text (v0.12.0),
           re-asserted here because the kit rule is reproduced. ---------- */
    const labelDeco = await page.$eval('#mphb_first_name',
        el => getComputedStyle(el).textDecorationLine);
    check('typed value is not underlined', labelDeco, 'none');

    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
