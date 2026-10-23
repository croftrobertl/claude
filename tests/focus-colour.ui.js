/**
 * DCC Guest Guide — focus must never paint a button coral (v0.24.4).
 *
 *   A. Opening a section by TAP: focus lands inside the sheet, on the section
 *      title, and nothing in the sheet is coral or ringed.
 *   B. Opening it with the KEYBOARD still lands on Back, with the ring.
 *   C. Tapping Show, Copy and read-aloud leaves no coral behind.
 *   D. With the kit's rule forced on through :focus, :hover and :active, every
 *      button the guide actually renders keeps its own resting fill — the audit
 *      enumerates what is in the DOM rather than a list someone maintains.
 *   E. The Tab trap still holds with focus on the title, which is a focus
 *      target but not a Tab stop.
 *
 *   node tests/focus-colour.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/focus-colour.ui.js
 *
 * BROWSER: Chromium with touch emulation. WebKit is not installed here and
 * cannot be fetched — the egress proxy refuses cdn.playwright.dev and the
 * Microsoft mirror by policy. So these runs reproduce the DOM and CSS
 * behaviour, not Safari's own focus-visible heuristic; the iPhone itself is the
 * check that matters for that.
 *
 * ONE THING TO KNOW BEFORE WRITING A CASE HERE: a scripted element.click()
 * reports detail 0, the same as Enter on a focused button, so the guide reads
 * it as a pointer activation only because it also checks isTrusted. Drive these
 * cases with page.tap() / page.click() / page.keyboard, never with an
 * in-page .click() — that is how the 0.24.3 audit came to report a ringed Back
 * button that a finger never produces.
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
const { frontEndJs, chunkBootTag, routeChunks } = require('./_bundles');
// v0.25.0: core AND the guest-only bundle — a visitor on the full guide
// runs both, and the Front Desk form now lives in the second one.
const JS = frontEndJs(A, SRC);
const emit = (c) => execFileSync('php', [path.join(TESTS, '_emit-guide.php'), c],
    { encoding: 'utf8', env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });

// The host's ground. The coral on :hover/:focus/:active is the rule the audit
// blamed; it has to be present or the fix is being tested against nothing.
const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px;-webkit-tap-highlight-color:rgba(0,0,0,.18)}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;letter-spacing:1.5px;line-height:50px;text-transform:uppercase;padding:0 18px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080;color:#FFFFFF;border-radius:30px 30px 30px 30px}
 .site .content .entry button{text-transform:uppercase;border-radius:3px}`;
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
${markup}</div></div></div>${chunkBootTag(SRC)}<script>${JS}</script></body></html>`;

const CORAL = 'rgb(240, 128, 128)';
let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];
    const open = async (w, kase = 'all-on') => {
        const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await routeChunks(page, A, SRC);
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit(kase)) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(400);
        return { ctx, page };
    };
    /** What is focused, and what does it look like. */
    const focusLook = (page) => page.evaluate(() => {
        const a = document.activeElement;
        if (!a) return { what: 'none' };
        const cs = getComputedStyle(a);
        const d = a.closest('.dccgg-detail:not([hidden])');
        return { what: (a.className || a.tagName).toString().split(' ').filter((c) => /^dccgg/.test(c)).join('.') || a.tagName,
            tag: a.tagName, bg: cs.backgroundColor, outline: cs.outlineStyle === 'none' ? 'none' : cs.outlineWidth + ' ' + cs.outlineStyle,
            insideSheet: !!d, sheetKey: d ? d.dataset.key : null };
    });
    /** Anything coral, or wearing a ring, inside the open sheet. */
    const sheetPaint = (page) => page.evaluate((coral) => {
        const d = document.querySelector('.dccgg-detail:not([hidden])');
        if (!d) return { none: true };
        const coralEls = [], ringed = [];
        for (const el of d.querySelectorAll('*')) {
            if (!el.getClientRects().length) continue;
            // The Review Us section's sticker IS this coral — it is the colour
            // Rob picked for it, and v0.24.2 already keeps that section's card
            // white on tap so the circle does not vanish into it. A sticker
            // carrying its own palette colour is not the bug being tested.
            if (el.matches('.dccgg-tile-icon, .dccgg-detail-title-icon')) continue;
            const cs = getComputedStyle(el);
            const name = (el.className || el.tagName).toString().split(' ')[0];
            if (cs.backgroundColor === coral) coralEls.push(name);
            if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ringed.push(name);
        }
        return { coralEls, ringed };
    }, CORAL);

    console.log('\nA. Opening a section by tap: focus is inside, and nothing is lit');
    for (const w of [360, 390]) {
        const { ctx, page } = await open(w);
        const keys = await page.$$eval('.dccgg-tile-wrap', (ws) => ws.map((e) => e.dataset.sectionKey));
        const notInside = [], coral = [], ringed = [], notTitle = [];
        for (const k of keys) {
            await page.tap(`.dccgg-tile[data-key="${k}"]`);
            await page.waitForTimeout(650);
            const f = await focusLook(page);
            const p = await sheetPaint(page);
            if (!f.insideSheet || f.sheetKey !== k) notInside.push(`${k}:${f.what}`);
            if (f.what !== 'dccgg-detail-title') notTitle.push(`${k}:${f.what}`);
            if (f.outline !== 'none') ringed.push(`${k}:${f.what}=${f.outline}`);
            if (p.coralEls && p.coralEls.length) coral.push(`${k}:${p.coralEls.join(',')}`);
            if (p.ringed && p.ringed.length) ringed.push(`${k}:${p.ringed.join(',')}`);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(450);
        }
        check(`${w}px: focus lands in the sheet that opened, for all ${keys.length} sections`, notInside.length === 0, notInside.join(' '));
        check(`${w}px: and it lands on the section TITLE, not on Back`, notTitle.length === 0, notTitle.join(' '));
        check(`${w}px: nothing in the sheet is coral`, coral.length === 0, coral.join(' '));
        check(`${w}px: and nothing in the sheet wears a focus ring`, ringed.length === 0, ringed.join(' '));
        await ctx.close();
    }

    console.log('\nB. Opening it with the keyboard still lands on Back, ringed');
    for (const w of [360, 390]) {
        const { ctx, page } = await open(w);
        const keys = await page.$$eval('.dccgg-tile-wrap', (ws) => ws.map((e) => e.dataset.sectionKey));
        const wrong = [], unringed = [];
        for (const k of keys) {
            await page.$eval(`.dccgg-tile[data-key="${k}"]`, (t) => t.focus());
            await page.keyboard.press('Enter');
            await page.waitForTimeout(650);
            const f = await focusLook(page);
            if (f.what !== 'dccgg-btn.dccgg-back' || f.sheetKey !== k) wrong.push(`${k}:${f.what}`);
            if (f.outline === 'none') unringed.push(k);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(450);
        }
        check(`${w}px: Back takes focus on an Enter open, for all ${keys.length} sections`, wrong.length === 0, wrong.join(' '));
        check(`${w}px: and it shows its ring`, unringed.length === 0, unringed.join(' '));
        await ctx.close();
    }

    console.log('\nC. Tapping Show, Copy and read-aloud leaves no coral');
    for (const w of [360, 390]) {
        const { ctx, page } = await open(w);
        await page.tap('.dccgg-tile[data-key="internet"]');
        await page.waitForTimeout(650);
        await page.evaluate(() => document.querySelectorAll('.dccgg-item-tts').forEach((b) => { b.hidden = false; }));
        for (const [label, sel] of [['Show', '.dccgg-secret-toggle'], ['Copy', '.dccgg-copy'], ['read-aloud', '.dccgg-item-tts']]) {
            const full = `.dccgg-detail:not([hidden]) ${sel}`;
            const el = await page.$(full);
            if (!el) { check(`${w}px: ${label} is present to tap`, false, 'not rendered'); continue; }
            const before = await page.$eval(full, (e) => getComputedStyle(e).backgroundColor);
            await el.tap();
            await page.waitForTimeout(260);
            const after = await page.$eval(full, (e) => getComputedStyle(e).backgroundColor);
            const outline = await page.$eval(full, (e) => getComputedStyle(e).outlineStyle);
            check(`${w}px: ${label} is not coral after the tap`, after !== CORAL, after);
            check(`${w}px: ${label} keeps the fill it had before the tap`, after === before, `${before} -> ${after}`);
            check(`${w}px: ${label} shows no ring after the tap`, outline === 'none', outline);
        }
        await ctx.close();
    }

    console.log('\nD. With the kit forced on, every rendered button keeps its own fill');
    {
        const { ctx, page } = await open(390);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        const seen = new Map();
        /** Measure every visible button under the three hosts, in all three states. */
        const sweep = async (where) => {
            await page.mouse.move(1, 1);   // park the virtual pointer: a resting
            await page.evaluate(() => {    // read under it would be a :hover read
                document.querySelectorAll('[data-dccgg-probe]').forEach((e) => e.removeAttribute('data-dccgg-probe'));
                document.querySelectorAll('.dccgg-item-tts, .dccgg-sos-fab').forEach((b) => { b.hidden = false; });
            });
            const list = await page.evaluate(() => {
                const out = []; const got = new Set();
                for (const h of document.querySelectorAll('.dccgg-root, .dccgg-stage, .dccgg-report-dialog')) {
                    for (const b of h.querySelectorAll('button')) {
                        if (got.has(b)) continue; got.add(b);
                        const r = b.getBoundingClientRect(); if (!r.width && !r.height) continue;
                        const cs = getComputedStyle(b);
                        b.setAttribute('data-dccgg-probe', out.length);
                        out.push({ i: out.length,
                            host: h.classList.contains('dccgg-root') ? 'hub' : h.classList.contains('dccgg-stage') ? 'popup' : 'dialog',
                            cls: (b.className || '').toString().split(' ').filter((c) => /^dccgg/.test(c)).join('.') || '(bare)',
                            bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius });
                    }
                }
                return out;
            });
            const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
            for (const row of list) {
                const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-dccgg-probe="${row.i}"]` });
                if (!nodeId) continue;
                const states = {};
                for (const st of ['focus', 'hover', 'active']) {
                    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [st] });
                    states[st] = await page.evaluate((i) => {
                        const b = document.querySelector(`[data-dccgg-probe="${i}"]`); const cs = getComputedStyle(b);
                        return { bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius };
                    }, row.i);
                }
                await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
                const key = row.host + ' ' + row.cls;
                if (seen.has(key)) continue;
                const moved = Object.entries(states).filter(([, v]) =>
                    v.bg !== row.bg || v.color !== row.color || v.radius !== row.radius).map(([n]) => n);
                seen.set(key, { where, moved, rest: row, states });
            }
        };
        await sweep('hub');
        const keys = await page.$$eval('.dccgg-tile-wrap', (ws) => ws.map((e) => e.dataset.sectionKey));
        for (const k of keys) {
            await page.tap(`.dccgg-tile[data-key="${k}"]`); await page.waitForTimeout(600);
            await sweep('popup ' + k);
            const d = await page.$('.dccgg-detail:not([hidden]) details.dccgg-more');
            if (d) {
                await page.tap('.dccgg-detail:not([hidden]) details.dccgg-more > summary');
                await page.waitForTimeout(300); await sweep('menu ' + k);
            }
            await page.keyboard.press('Escape'); await page.waitForTimeout(450);
        }
        await page.fill('.dccgg-search-input', 'wifi'); await page.waitForTimeout(500); await sweep('search hit');
        await page.fill('.dccgg-search-input', 'zzzqqq'); await page.waitForTimeout(500); await sweep('search miss');
        // The "did you mean" chips need a query of TWO words where the whole
        // phrase misses but one word hits — renderEmptyState only builds them
        // when qToks.length > 1. A single nonsense word gives the "still
        // stuck" row and no chip, which is how this control went unmeasured.
        await page.fill('.dccgg-search-input', ''); await page.waitForTimeout(200);
        await page.fill('.dccgg-search-input', 'password zzzqqq'); await page.waitForTimeout(500); await sweep('search near-miss');
        await page.fill('.dccgg-search-input', ''); await page.waitForTimeout(200);
        // The hub's ⋯ / Front Desk, then Report, so the dialog's own buttons are
        // swept too. Three slots are configured, so it is the <details> shape.
        const hubMore = await page.$('.dccgg-root details.dccgg-more > summary, .dccgg-root .dccgg-more--direct');
        if (hubMore) {
            await hubMore.tap(); await page.waitForTimeout(300);
            const rep = await page.$('.dccgg-root .dccgg-more-report');
            if (rep && await rep.isVisible()) { await rep.tap(); await page.waitForTimeout(500); }
            await sweep('report dialog');
        }

        const moved = [...seen].filter(([, v]) => v.moved.length);
        check(`the audit reached a useful number of real buttons (${seen.size})`, seen.size >= 25, String(seen.size));
        check('no rendered button changes fill, text colour or radius on focus, hover or press',
            moved.length === 0, moved.map(([k, v]) => `${k}[${v.moved.join('/')}]`).join(' '));
        // Named explicitly, because these eight are the ones v0.24.4 fixed and a
        // future edit to the selector groups would show up here first.
        for (const name of ['hub dccgg-more-item.dccgg-more-report', 'hub dccgg-sos-fab',
            'hub dccgg-search-result', 'hub dccgg-search-still-stuck', 'hub dccgg-search-dym-chip',
            'popup dccgg-btn-text.dccgg-read-more', 'popup dccgg-gallery-thumb',
            'popup dccgg-video-poster', 'popup dccgg-more-item.dccgg-more-report']) {
            const v = seen.get(name);
            check(`covered, and quiet in all three states: ${name}`, !!v && v.moved.length === 0,
                v ? v.moved.join('/') : 'never rendered — the case may have changed');
        }
        // And the one the audit reported, which was already protected.
        const back = seen.get('popup dccgg-btn.dccgg-back');
        check('Back keeps its resting #006BCF with :focus forced on',
            !!back && back.states.focus.bg === 'rgb(0, 107, 207)', back ? back.states.focus.bg : 'not found');
        await ctx.close();
    }

    console.log('\nE. The Tab trap holds with focus on the title');
    {
        const { ctx, page } = await open(390);
        await page.tap('.dccgg-tile[data-key="internet"]');
        await page.waitForTimeout(650);
        const start = await focusLook(page);
        check('a tap open leaves focus on the title', start.what === 'dccgg-detail-title', start.what);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(120);
        const fwd = await focusLook(page);
        check('Tab from the title stays in the sheet', fwd.insideSheet, fwd.what);
        await page.$eval('.dccgg-detail:not([hidden]) .dccgg-detail-title', (h) => h.focus());
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(120);
        const back = await focusLook(page);
        check('Shift+Tab from the title stays in the sheet too', back.insideSheet, back.what);
        // The title must not be a Tab stop: tabbing round the sheet never returns to it.
        const stops = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            return Array.from(d.querySelectorAll('[tabindex]')).filter((e) => e.getAttribute('tabindex') !== '-1')
                .map((e) => (e.className || e.tagName).toString().split(' ')[0]);
        });
        check('the title is not in the tab order', !stops.includes('dccgg-detail-title'), stops.join(','));
        await ctx.close();
    }

    console.log('\nF. A programmatic open is quiet too');
    {
        const { ctx, page } = await open(390);
        // Deep links, the search chips and the SOS button all reach openDetail
        // without a trusted click. None of them is a keyboard press, so none of
        // them may ring a button — which is why the intent tracker tests
        // isTrusted as well as detail. A scripted click reports detail 0, the
        // same as Enter, so without that test this path would ring.
        await page.evaluate(() => document.querySelector('.dccgg-tile[data-key="amenities"]').click());
        await page.waitForTimeout(700);
        const f = await focusLook(page);
        const paint = await sheetPaint(page);
        check('a scripted open lands on the title, not Back', f.what === 'dccgg-detail-title', f.what);
        check('and shows no ring', f.outline === 'none' && !(paint.ringed || []).length,
            f.outline + ' ' + (paint.ringed || []).join(','));
        check('and nothing in that sheet is coral', !(paint.coralEls || []).length, (paint.coralEls || []).join(','));
        await ctx.close();
    }

    console.log('\nG. On a touch device a forced :hover leaves no tint behind');
    {
        // iOS applies :hover on finger-down and leaves it applied after the tap,
        // so any hover tint that is not behind the pointer guard sticks. This
        // forces :hover on a touch context and requires the fill not to move.
        //
        // What this CANNOT test is the hybrid case — (hover: hover) with
        // (pointer: coarse), a touchscreen laptop — which is the case the
        // `pointer: fine` half of the guard exists for. Measured here:
        // Emulation.setEmulatedMedia's hover and pointer features are ignored
        // by this Chromium; both values simply follow the context's hasTouch,
        // giving hover/fine together or none/coarse together and never the mix.
        // The matching mutant is listed as unreachable in the runner rather
        // than counted as a pass.
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await routeChunks(page, A, SRC);
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit('all-on')) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(400);
        const cdp = await ctx.newCDPSession(page);
        const media = await page.evaluate(() => ({
            hover: matchMedia('(hover: hover)').matches,
            coarse: matchMedia('(pointer: coarse)').matches,
        }));
        check('the touch media state is what a phone reports', !media.hover && media.coarse, JSON.stringify(media));
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        await page.fill('.dccgg-search-input', 'wifi'); await page.waitForTimeout(500);
        const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
        for (const [label, sel] of [['a search row', '.dccgg-search-result'],
                                    ['a Front Desk menu item', '.dccgg-more-item']]) {
            const has = await page.$(sel);
            if (!has) {
                if (sel === '.dccgg-more-item') {
                    const sum = await page.$('.dccgg-root details.dccgg-more > summary');
                    if (sum) { await sum.tap(); await page.waitForTimeout(300); }
                }
            }
            const el = await page.$(sel);
            if (!el) { check(`${label} is present to measure`, false, 'not rendered'); continue; }
            await page.$eval(sel, (e) => e.setAttribute('data-dccgg-hyb', ''));
            const rest = await page.$eval(sel, (e) => getComputedStyle(e).backgroundColor);
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-dccgg-hyb]' });
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
            const hov = await page.$eval(sel, (e) => getComputedStyle(e).backgroundColor);
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
            await page.$eval(sel, (e) => e.removeAttribute('data-dccgg-hyb'));
            check(`${label}: a forced :hover leaves its fill alone, so a tap cannot stick`,
                hov === rest, `${rest} -> ${hov}`);
        }
        await ctx.close();
    }

    await browser.close();
    check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(fail ? 1 : 0);
})();
