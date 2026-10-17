/**
 * DCC Guest Guide — the three iPhone fixes (v0.24.2), in a real browser.
 *
 *   1. nothing clips the pop-up title's mini tile, so its shadow is a shadow
 *      and not a hard grey square;
 *   2. the sticky header keeps its own white between the Back row and the
 *      content that scrolls under it;
 *   3. a tile's card goes coral on a real tap only — never on a touch that
 *      turns into a scroll, never stuck afterwards, and never on Review Us,
 *      whose own sticker is that same coral.
 *
 *   node tests/phone-fixes.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/phone-fixes.ui.js
 *
 * BROWSER: Chromium with touch emulation. WebKit is not installed in this
 * container and cannot be fetched — the egress proxy refuses cdn.playwright.dev
 * and the Microsoft mirror by policy. So these runs reproduce the DOM and CSS
 * behaviour, not Safari's own touch quirks; the iPhone itself is the check
 * that matters for those.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const TESTS = __dirname;
const PLUGIN = (process.env.DCCGG_PLUGIN_DIR || path.join(TESTS, '../dcc-guest-guide')).replace(/\/$/, '');
const A = PLUGIN + '/assets/';
const SRC = process.env.DCCGG_UI_SOURCE === '1';
const CSS = SRC ? fs.readFileSync(A + 'css/widget.css', 'utf8')
    : fs.readFileSync(A + 'css/widget.min.css', 'utf8') + fs.readFileSync(A + 'css/widget-guest.min.css', 'utf8');
const JS = fs.readFileSync(A + (SRC ? 'js/widget.js' : 'js/widget.min.js'), 'utf8');
const emit = (c) => execFileSync('php', [path.join(TESTS, '_emit-guide.php'), c],
    { encoding: 'utf8', env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });

// The host's ground. The kit's coral on :hover/:focus/:active is the rule that
// made a scrolling finger turn a tile coral — it has to be present, or the
// fix is being tested against nothing.
const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px;-webkit-tap-highlight-color:rgba(0,0,0,.18)}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;letter-spacing:1.5px;line-height:50px;text-transform:uppercase;padding:0 18px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080;color:#FFFFFF;border-radius:30px 30px 30px 30px}
 .site .content .entry button{text-transform:uppercase;border-radius:3px}`;
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
${markup}</div></div></div><script>${JS}</script></body></html>`;

const CORAL = 'rgb(240, 128, 128)';
let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];
    const open = async (w, opts = {}) => {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true }, opts));
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit('live-sections')) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(400);
        return { ctx, page };
    };
    /** A finger: down, optional drag, up. */
    const finger = async (page, x, y, drag) => {
        const pt = (cx, cy) => ([{ identifier: 1, clientX: cx, clientY: cy, pageX: cx, pageY: cy }]);
        const fire = (type, cx, cy) => page.evaluate(({ type, cx, cy }) => {
            const el = document.elementFromPoint(cx, cy) || document.body;
            const t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy, pageX: cx, pageY: cy });
            el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true,
                touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
        }, { type, cx, cy });
        await fire('touchstart', x, y);
        return { move: async (dx, dy) => fire('touchmove', x + dx, y + dy), end: async (dx = 0, dy = 0) => fire('touchend', x + dx, y + dy) };
    };
    const bg = (page, sel) => page.$eval(sel, (e) => getComputedStyle(e).backgroundColor);

    console.log('\nA. The mini tile is not clipped, and its shadow is a shadow');
    for (const w of [360, 390, 1280]) {
        const { ctx, page } = await open(w);
        await page.click('.dccgg-tile[data-key="canal"]'); await page.waitForTimeout(650);
        const r = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            const m = d.querySelector('.dccgg-detail-title-icon');
            const clippers = []; let n = m.parentElement, depth = 0;
            while (n && depth < 5) {
                const c = getComputedStyle(n);
                if (c.overflow !== 'visible' || c.contain !== 'none' || c.clipPath !== 'none') {
                    clippers.push(`${n.tagName}.${(n.className || '').toString().split(' ')[0]}:${c.overflow}/${c.contain}/${c.clipPath}`);
                }
                n = n.parentElement; depth++;
            }
            const h2 = getComputedStyle(d.querySelector('.dccgg-detail-title'));
            const tx = getComputedStyle(d.querySelector('.dccgg-detail-title-text'));
            return { clippers, h2Overflow: h2.overflow, h2MinW: h2.minWidth,
                txOverflow: tx.overflow, txEllipsis: tx.textOverflow, txWrap: tx.whiteSpace,
                shadow: getComputedStyle(m).boxShadow,
                bar: Math.round(d.querySelector('.dccgg-detail-header-titlebar').getBoundingClientRect().height) };
        });
        // the heading itself must not clip; the stage is the scroll container
        // and is expected to.
        const headingClips = r.clippers.filter((c) => /dccgg-detail-title/.test(c));
        check(`${w}px: the heading no longer clips its own mini tile`, headingClips.length === 0, r.clippers.join(' | '));
        check(`${w}px: the ellipsis lives on the title TEXT instead`,
            r.txOverflow === 'hidden' && r.txEllipsis === 'ellipsis' && r.txWrap === 'nowrap' && r.h2Overflow === 'visible',
            JSON.stringify({ h2: r.h2Overflow, tx: r.txOverflow }));
        check(`${w}px: the heading can still shrink, so the button keeps its column`, r.h2MinW === '0px');
        check(`${w}px: the sticker still carries its soft shadow`, /0px 5px 10px/.test(r.shadow), r.shadow);
        // the shadow must actually PAINT outside the tile's own box
        const painted = await page.evaluate(() => {
            const m = document.querySelector('.dccgg-detail:not([hidden]) .dccgg-detail-title-icon');
            const b = m.getBoundingClientRect();
            // a point just below the tile, inside the shadow's reach
            const el = document.elementFromPoint(b.left + b.width / 2, b.bottom + 4);
            return !!el && !!el.closest('.dccgg-detail-header-titlebar');
        });
        check(`${w}px: the area just under the sticker belongs to the title bar, not a clipped box`, painted);
        // and no overlap with the button
        const over = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            const t = d.querySelector('.dccgg-detail-title').getBoundingClientRect();
            const m = d.querySelector('.dccgg-detail-header-titlebar .dccgg-more').getBoundingClientRect();
            return Math.round(t.right - m.left);
        });
        check(`${w}px: "Boating / Fishing" still stops before the Front Desk button`, over <= 0, `+${over}px`);
        check(`${w}px: and the title bar is still 48px or less`, r.bar <= 48, String(r.bar));
        await ctx.close();
    }

    console.log('\nB. Space between the Back row and the content');
    for (const w of [360, 390, 1280]) {
        const { ctx, page } = await open(w);
        await page.click('.dccgg-tile[data-key="canal"]'); await page.waitForTimeout(650);
        const r = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            const hdr = d.querySelector('.dccgg-detail-header');
            const acts = d.querySelector('.dccgg-detail-header-actions');
            const body = d.querySelector('.dccgg-detail-layout') || d.querySelector('.dccgg-detail-items');
            const cs = getComputedStyle(hdr);
            return { pad: cs.paddingBottom, bgOwn: cs.backgroundColor,
                headerBelowActions: Math.round(hdr.getBoundingClientRect().bottom - acts.getBoundingClientRect().bottom),
                toContent: Math.round(body.getBoundingClientRect().top - acts.getBoundingClientRect().bottom) };
        });
        check(`${w}px: at least 10px between the Back row and the content`, r.toContent >= 10, `${r.toContent}px`);
        check(`${w}px: and it is the header's OWN background, 10px of it`,
            r.headerBelowActions >= 10 && r.pad === '10px' && /rgb/.test(r.bgOwn),
            JSON.stringify(r));
        await ctx.close();
    }

    console.log('\nC. The tile tap colour');
    {
        const { ctx, page } = await open(390);
        const T = '.dccgg-tile[data-key="internet"]';
        const at = await page.$eval(T, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
        check('a tile is white at rest, with no grey tap wash',
            (await bg(page, T)) !== CORAL && (await page.$eval(T, (e) => getComputedStyle(e).webkitTapHighlightColor)) === 'rgba(0, 0, 0, 0)');
        // Hold a pointer down on it: that is :hover + :active together, the
        // two kit states that turned the card coral under a resting finger.
        {
            const b = await page.$eval(T, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
            await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.waitForTimeout(220);
            const held = await bg(page, T);
            const active = await page.$eval(T, (e) => e.matches(':active'));
            await page.mouse.move(2, 2); await page.mouse.up(); await page.waitForTimeout(250);
            const after = await bg(page, T);
            check('a pointer held on a tile does not turn it coral (:hover and :active neutralised)',
                held !== CORAL && active, `${held}, :active=${active}`);
            check('and it is not left coral by :focus afterwards', after !== CORAL, after);
        }
        check('the card colour is NOT in the tile transition, so it cannot fade',
            !(await page.$eval(T, (e) => getComputedStyle(e).transitionProperty)).split(',').map((x) => x.trim()).includes('background'),
            await page.$eval(T, (e) => getComputedStyle(e).transitionProperty));

        // --- a touch that becomes a scroll: never coral, at any point
        let f = await finger(page, at.x, at.y);
        const seen = [];
        for (let i = 0; i < 6; i++) { seen.push(await bg(page, T)); await page.waitForTimeout(25); }
        await f.move(0, -14);
        for (let i = 0; i < 8; i++) { seen.push(await bg(page, T)); await page.waitForTimeout(25); }
        await f.end(0, -40);
        for (let i = 0; i < 10; i++) { seen.push(await bg(page, T)); await page.waitForTimeout(30); }
        check('a touch that turns into a scroll never shows coral, at any point',
            !seen.includes(CORAL), seen.filter((x) => x === CORAL).length + ' of ' + seen.length + ' samples coral');

        // --- a real tap: coral the moment the finger lifts, with no fade
        f = await finger(page, at.x, at.y);
        await page.waitForTimeout(120);
        await f.end();
        check('a real tap turns the card coral the instant the finger lifts',
            (await bg(page, T)) === CORAL, await bg(page, T));
        await page.waitForTimeout(500);
        check('and it is gone again shortly after', (await bg(page, T)) !== CORAL, await bg(page, T));

        // --- a very quick tap, under the time a scroll takes to start
        f = await finger(page, at.x, at.y);
        await f.end();
        check('a very quick tap shows it too', (await bg(page, T)) === CORAL, await bg(page, T));
        await page.waitForTimeout(400);

        // --- a tiny wobble is still a tap, not a scroll
        f = await finger(page, at.x, at.y);
        await f.move(0, -3);
        await f.end(0, -3);
        check('a 3px wobble still counts as a tap', (await bg(page, T)) === CORAL, await bg(page, T));
        await page.waitForTimeout(400);

        // --- Review Us keeps a white card
        const R = '.dccgg-tile[data-key="review"]';
        await page.$eval(R, (e) => e.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(250);
        const rAt = await page.$eval(R, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
        const rf = await finger(page, rAt.x, rAt.y);
        await rf.end();
        const rBg = await bg(page, R);
        const sticker = await page.$eval(R + ' .dccgg-tile-icon', (e) => getComputedStyle(e).backgroundColor);
        check('Review Us stays white on tap, so its coral sticker stays visible',
            rBg !== CORAL && sticker === CORAL, `card ${rBg}, sticker ${sticker}`);
        check('and it is marked by COLOUR, not by name',
            await page.$eval('.dccgg-tile-wrap[data-section-key="review"]', (e) => e.hasAttribute('data-sticker-coral'))
            && (await page.$$('.dccgg-tile-wrap[data-sticker-coral]')).length === 1);
        await page.waitForTimeout(400);
        await ctx.close();
    }
    {
        // --- nothing stays coral after a pop-up closes
        const { ctx, page } = await open(390);
        // Put a tile into the tapped state and leave it there, as a tap whose
        // hold is still running when the guest opens a section would.
        await page.$eval('.dccgg-tile[data-key="internet"]', (e) => e.classList.add('is-tap'));
        await page.click('.dccgg-tile[data-key="internet"]'); await page.waitForTimeout(650);
        check('the tile is still marked while the pop-up is open',
            (await page.$$('.dccgg-tile.is-tap')).length === 1);
        await page.click('.dccgg-detail:not([hidden]) .dccgg-back'); await page.waitForTimeout(700);
        const any = await page.$$eval('.dccgg-tile', (ts) => ts.filter((t) => getComputedStyle(t).backgroundColor === 'rgb(240, 128, 128)').map((t) => t.dataset.key));
        check('no tile is coral after the pop-up closes', any.length === 0, any.join(','));
        check('and none is left carrying the tap class',
            (await page.$$('.dccgg-tile.is-tap')).length === 0);
        // the theme's own three states are neutralised, which is what made it stick
        const states = await page.evaluate(() => {
            const t = document.querySelector('.dccgg-tile');
            t.focus();
            return getComputedStyle(t).backgroundColor;
        });
        check('a focused tile is not coral either — the kit\'s :focus is neutralised', states !== CORAL, states);
        await ctx.close();
    }
    {
        // --- reduced motion
        const { ctx, page } = await open(390, { reducedMotion: 'reduce' });
        const T = '.dccgg-tile[data-key="internet"]';
        check('reduced motion: the tile animates nothing',
            (await page.$eval(T, (e) => getComputedStyle(e).transitionDuration)) === '0s');
        const at = await page.$eval(T, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
        const f = await finger(page, at.x, at.y);
        await f.end();
        check('...but a tap still turns it coral at once', (await bg(page, T)) === CORAL, await bg(page, T));
        await ctx.close();
    }
    check('no JS errors', errors.length === 0, errors[0]);

    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('Failures:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
