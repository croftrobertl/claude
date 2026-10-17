/**
 * Browser coverage for the 2026-10-17 audit fixes 7, 8 and 9.
 *
 *   node dcc-contact-form/tests/browser-test.js
 *
 * ENGINE NOTE: Playwright's WebKit build cannot be installed in this
 * environment — the download host is blocked by the network policy
 * (403 "no rule or allowlist entry allows host
 * playwright.download.prss.microsoft.com"). These tests therefore run on
 * CHROMIUM WITH TOUCH EMULATION, which does make `(hover: none)` and
 * `(pointer: coarse)` match and so exercises the media queries fix 7 turns on.
 * It is not WebKit: the final word on iOS tap behaviour is Rob's iPhone.
 *
 * Not shipped in the plugin zip.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.join(__dirname, '..');
const BLUE = 'rgb(0, 107, 207)';   /* #006bcf, the resting brand blue */
const CORAL = 'rgb(240, 128, 128)'; /* #F08080, hover + keyboard focus */

let pass = 0;
let fail = 0;
function check(label, got, want) {
    if (got === want) { pass++; console.log(`  ok   ${label}`); return; }
    fail++;
    console.log(`  FAIL ${label}\n         got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}
function section(t) { console.log(`\n=== ${t} ===`); }

/**
 * Force CSS pseudo-classes on an element through CDP, the way DevTools' own
 * ":hov" panel does. Returns a setter so the state can be changed again.
 */
async function forcePseudo(page, selector, classes) {
    const client = await page.context().newCDPSession(page);
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    const { root } = await client.send('DOM.getDocument');
    const { nodeId } = await client.send('DOM.querySelector', {
        nodeId: root.nodeId, selector
    });

    const set = async (forcedPseudoClasses) => {
        await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses });
    };
    await set(classes);
    return set;
}

const TYPES = {
    '.html': 'text/html', '.css': 'text/css',
    '.js': 'application/javascript', '.svg': 'image/svg+xml'
};

function serve() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const rel = decodeURIComponent(req.url.split('?')[0]);
            const file = path.join(ROOT, rel);
            if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404); res.end('not found'); return;
            }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
            res.end(fs.readFileSync(file));
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

(async () => {
    const server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    const url = `${base}/tests/fixture.html`;

    const browser = await chromium.launch();

    /* ============================================================== */
    section('FIX 7. the submit button does not stick coral after a tap (touch)');

    const touch = await browser.newContext({
        viewport: { width: 390, height: 844 },   /* iPhone-ish */
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3
    });
    let page = await touch.newPage();
    await page.goto(url);

    /* The emulation has to actually produce a touch-like environment, or the
       media queries under test are never evaluated and this proves nothing. */
    const mq = await page.evaluate(() => ({
        hoverNone: matchMedia('(hover: none)').matches,
        coarse: matchMedia('(pointer: coarse)').matches,
        hoverHover: matchMedia('(hover: hover) and (pointer: fine)').matches
    }));
    check('emulation reports (hover: none)', mq.hoverNone, true);
    check('emulation reports (pointer: coarse)', mq.coarse, true);
    check('emulation does NOT report a fine pointer', mq.hoverHover, false);

    const btn = page.locator('.dcc-submit');
    const bg = () => btn.evaluate((el) => getComputedStyle(el).backgroundColor);

    check('resting button is brand blue', await bg(), BLUE);

    await btn.tap();
    /* Longer than the 0.15s background-color transition, or the colour read
       back is a blend mid-animation rather than the settled value. */
    await page.waitForTimeout(500);

    check('after a tap it is STILL blue (not stuck coral)', await bg(), BLUE);

    /* Proof the tap actually reached the button: the form is empty, so the
       submit handler ran and marked the first required field invalid. (It
       deliberately does not submit — which is why this, not a fetch, is the
       signal that the handler fired.) */
    check('the tap really did reach the button',
        await page.evaluate(() => document.querySelector('.dcc-field--name')
            .classList.contains('dcc-has-error')), true);

    /* Tap elsewhere and back: the old bug latched :hover until another tap. */
    await page.locator('.dcc-field--email .dcc-input').tap();
    await page.waitForTimeout(400);
    check('still blue after tapping away', await bg(), BLUE);

    await btn.tap();
    await page.waitForTimeout(500);
    check('still blue after a second tap', await bg(), BLUE);

    /* The theme's forced uppercase must still be beaten. */
    check('label is not forced to ALL CAPS',
        await btn.evaluate((el) => getComputedStyle(el).textTransform), 'none');

    /* ---- The cascade itself, with :hover FORCED -------------------------
       Chromium's synthetic tap does not latch :hover the way iOS Safari does,
       so the emulated tap above cannot actually reproduce the reported bug —
       the mutation run proved it, reporting "the hover rule escapes its media
       query" as escaping. Forcing the pseudo-class over CDP reproduces the
       latched state directly, which is the real condition on the iPhone, and
       tests the only thing that actually decides the colour: the cascade. */
    const forced = await forcePseudo(page, '.dcc-submit', ['hover']);
    await page.waitForTimeout(400);
    check('with :hover FORCED in a touch context it is still blue',
        await bg(), BLUE);

    await forced(['focus']);
    await page.waitForTimeout(400);
    check('with :focus FORCED in a touch context it is still blue',
        await bg(), BLUE);

    await forced(['hover', 'focus']);
    await page.waitForTimeout(400);
    check('with both FORCED it is still blue', await bg(), BLUE);

    /* The touch re-assert is (0,4,1) rather than leaning on the resting rule's
       (0,3,1). This is what that buys: a competing rule at (0,3,1) loading
       AFTER our stylesheet — a kit update, another plugin — still loses. */
    await page.addStyleTag({
        content: `body.elementor-kit-331 button.dcc-submit:hover,
                  body.elementor-kit-331 button.dcc-submit:focus {
                      background-color: #F08080;
                  }`
    });
    await page.waitForTimeout(400);
    check('a later (0,3,1) coral rule still loses on touch', await bg(), BLUE);

    await touch.close();

    /* ============================================================== */
    section('FIX 7. hover still works where there IS a pointer');

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await desktop.newPage();
    await page.goto(url);

    const dbtn = page.locator('.dcc-submit');
    check('resting is blue', await dbtn.evaluate((el) => getComputedStyle(el).backgroundColor), BLUE);

    await dbtn.hover();
    await page.waitForTimeout(500);   /* past the 0.15s transition */
    check('hover turns it coral', await dbtn.evaluate((el) => getComputedStyle(el).backgroundColor), CORAL);

    /* Keyboard focus lives OUTSIDE both media queries and must carry the ring. */
    await page.evaluate(() => {
        document.querySelector('.dcc-field--email .dcc-input').focus();
        document.querySelector('.dcc-submit').focus();
    });
    await page.waitForTimeout(500);
    const focusState = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('.dcc-submit'));
        return { bg: s.backgroundColor, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
    });
    check('keyboard focus is coral', focusState.bg, CORAL);
    check('keyboard focus keeps its 3px outline', focusState.outlineWidth, '3px');
    check('keyboard focus keeps its separation ring',
        focusState.boxShadow.includes('rgb(255, 255, 255)'), true);

    await desktop.close();

    /* ============================================================== */
    section('FIX 8. reCAPTCHA loads on first focus, not on page load');

    const ctx8 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await ctx8.newPage();

    const requested = [];
    page.on('request', (r) => {
        if (r.url().includes('recaptcha')) { requested.push(r.url()); }
    });

    await page.goto(url);
    await page.waitForTimeout(400);

    check('nothing reCAPTCHA-shaped is fetched on load', requested.length, 0);
    check('grecaptcha is absent on load',
        await page.evaluate(() => typeof window.grecaptcha), 'undefined');

    await page.locator('.dcc-field--email .dcc-input').focus();
    await page.waitForFunction(() => typeof window.grecaptcha !== 'undefined', null, { timeout: 3000 });

    check('focusing a field loads it', requested.length, 1);
    check('grecaptcha is now available',
        await page.evaluate(() => typeof window.grecaptcha), 'object');

    /* Focusing other fields must not load it again. */
    await page.locator('.dcc-field--tel .dcc-input').focus();
    await page.locator('.dcc-textarea').focus();
    await page.waitForTimeout(200);
    check('it is not loaded a second time', requested.length, 1);

    await ctx8.close();

    /* ============================================================== */
    section('FIX 8 + 1. autofill then instant send still carries a token');

    const ctx8b = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await ctx8b.newPage();
    await page.goto(url);

    /* Fill by script and submit immediately, never focusing anything — the
       autofill-plus-Enter case. The submit itself must trigger the load. */
    await page.evaluate(() => {
        document.querySelector('#dcc-fixture-f1-first').value = 'Jane';
        document.querySelector('#dcc-fixture-f1-last').value = 'Guest';
        document.querySelector('#dcc-fixture-f2').value = 'jane@example.com';
        document.querySelector('#dcc-fixture-f4').value = 'Instant send, no focus.';
        document.querySelector('.dcc-contact-form').requestSubmit();
    });
    await page.waitForFunction(() => window.__dccFetches.length > 0, null, { timeout: 6000 });

    const sent = await page.evaluate(() => window.__dccFetches[0]);
    check('the submission went out', typeof sent.url, 'string');
    check('…carrying the token the late load produced', sent.token, 'STUB_TOKEN');
    check('…and an elapsed-time value', sent.ts !== null && sent.ts !== '', true);

    await ctx8b.close();

    /* ============================================================== */
    section('FIX 8 + 1. a BLOCKED script does not lose the message');

    const ctx8c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await ctx8c.newPage();
    /* Simulate an ad blocker or an offline third party. */
    await page.route('**/recaptcha-stub.js', (route) => route.abort());
    await page.goto(url);

    await page.locator('.dcc-field--email .dcc-input').focus();
    await page.evaluate(() => {
        document.querySelector('#dcc-fixture-f1-first').value = 'Jane';
        document.querySelector('#dcc-fixture-f1-last').value = 'Guest';
        document.querySelector('#dcc-fixture-f2').value = 'jane@example.com';
        document.querySelector('#dcc-fixture-f4').value = 'Script blocked here.';
    });
    await page.locator('.dcc-submit').click();
    await page.waitForFunction(() => window.__dccFetches.length > 0, null, { timeout: 8000 });

    const blocked = await page.evaluate(() => window.__dccFetches[0]);
    check('the submission STILL goes out', typeof blocked.url, 'string');
    check('…with an empty token, which the server treats as Unverified',
        blocked.token, '');
    check('…and the guest is shown the confirmation',
        await page.evaluate(() => {
            const c = document.querySelector('.dcc-form-confirmation');
            return !c.hidden && c.textContent.includes('Thank you');
        }), true);

    await ctx8c.close();

    /* ============================================================== */
    section('FIX 9. the copy row has a 44px tap area that hits nothing else');

    const ctx9 = await browser.newContext({
        viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true
    });
    page = await ctx9.newPage();
    await page.goto(url);

    const geom = await page.evaluate(() => {
        const label = document.querySelector('.dcc-copy-label');
        const box = label.getBoundingClientRect();
        const after = getComputedStyle(label, '::after');

        /* The hit area is the union of the label box and its ::after
           extension, which is centred on the label. */
        const extH = parseFloat(after.height) || 0;
        const centre = box.top + box.height / 2;
        const hitTop = Math.min(box.top, centre - extH / 2);
        const hitBottom = Math.max(box.bottom, centre + extH / 2);

        const at = (x, y) => {
            const el = document.elementFromPoint(x, y);
            if (!el) { return 'none'; }
            if (el === label || label.contains(el)) { return 'label'; }
            const field = el.closest('.dcc-field');
            if (field) { return 'field:' + field.dataset.field; }
            if (el.classList.contains('dcc-submit')) { return 'submit'; }
            return el.tagName.toLowerCase();
        };

        const x = box.left + Math.min(20, box.width / 2);

        /* The extension spans the full row, so probe its right-hand end too —
           a full-width band has more chance of reaching a neighbour. */
        const xRight = box.right - 2;
        const xMid = box.left + box.width / 2;

        return {
            atTopRight: at(xRight, hitTop + 0.5),
            atBottomRight: at(xRight, hitBottom - 0.5),
            atTopMid: at(xMid, hitTop + 0.5),
            atBottomMid: at(xMid, hitBottom - 0.5),
            aboveRight: at(xRight, hitTop - 2),
            belowRight: at(xRight, hitBottom + 2),
            visibleHeight: Math.round(box.height),
            extensionHeight: Math.round(extH),
            hitHeight: Math.round(hitBottom - hitTop),
            /* 0.5px inside each extreme of the hit area */
            atTop: at(x, hitTop + 0.5),
            atBottom: at(x, hitBottom - 0.5),
            atCentre: at(x, centre),
            /* Just outside: these SHOULD belong to someone else */
            aboveHit: at(x, hitTop - 2),
            belowHit: at(x, hitBottom + 2)
        };
    });

    check('the visible row is still the small one (nothing grew)',
        geom.visibleHeight < 44, true);
    check('the invisible extension is 44px', geom.extensionHeight, 44);
    check('the tap area is at least 44px', geom.hitHeight >= 44, true);
    check('a tap at the TOP of the extension hits the copy label', geom.atTop, 'label');
    check('a tap at the BOTTOM of the extension hits the copy label', geom.atBottom, 'label');
    check('a tap in the middle hits the copy label', geom.atCentre, 'label');
    check('the extension does not swallow the field above',
        geom.aboveHit !== 'label', true);
    check('the extension does not swallow the button below',
        geom.belowHit !== 'label', true);

    /* The band is full-width, so its right-hand end matters as much as its left. */
    check('the right-hand end of the extension also hits the label (top)',
        geom.atTopRight, 'label');
    check('the right-hand end of the extension also hits the label (bottom)',
        geom.atBottomRight, 'label');
    check('mid-row top hits the label', geom.atTopMid, 'label');
    check('mid-row bottom hits the label', geom.atBottomMid, 'label');
    check('nothing above the right-hand end is swallowed',
        geom.aboveRight !== 'label', true);
    check('nothing below the right-hand end is swallowed',
        geom.belowRight !== 'label', true);

    /* And the extension must actually WORK: a tap on it toggles the box. */
    const toggled = await page.evaluate(async () => {
        const label = document.querySelector('.dcc-copy-label');
        const cb = document.querySelector('#dcc-fixture-copy');
        const box = label.getBoundingClientRect();
        const before = cb.checked;
        /* Click at the very top of the 44px extension, above the visible row. */
        const y = box.top + box.height / 2 - 21;
        const el = document.elementFromPoint(box.left + 20, y);
        if (el) { el.click(); }
        return { before, after: cb.checked };
    });
    check('a tap in the top extension really ticks the box',
        toggled.before === false && toggled.after === true, true);

    /* What sits immediately above and below, for the record. */
    console.log(`       (neighbour above the hit area: ${geom.aboveHit}; below: ${geom.belowHit})`);

    await ctx9.close();
    await browser.close();
    server.close();

    console.log(`\n${fail === 0 ? `ALL ${pass} CHECKS PASS` : `${pass} passed, ${fail} FAILED`}`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
