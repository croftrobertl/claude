/**
 * DCC Guest Guide — the v0.25.1 sheet polish, in a real browser.
 *
 *   A. tap targets: the checklist row ticks from anywhere in its title, the
 *      read-aloud button accepts a finger 20px off its icon, and neither
 *      swallows the other;
 *   B. the checklist remembers ticks across a reload, and Reset still clears;
 *   C. the tile grid is four columns from 600px up, one on a phone;
 *   D. the ⌘K hint says ⌘K on a Mac, Ctrl K elsewhere, and nothing on touch;
 *   E. body copy is 400 and titles stay 700 — inside the POP-UP, which is
 *      where it was 700, because the stage is portaled out of .dccgg-root.
 *
 *   node tests/sheet-polish.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/sheet-polish.ui.js
 *
 * THE GROUND MATTERS MORE HERE THAN USUAL. Every one of these was reported
 * from the live site and three of them only exist under the theme: the body
 * weight comes from `html { font-weight: 700 }`, and the tile columns and the
 * row's tap area depend on the real page padding. The kit below is not
 * decoration — remove it and D and E pass against nothing.
 *
 * The widget is wrapped in `.elementor-widget.dccgg-layout-grid` because
 * Elementor's prefix_class puts the layout class on the WRAPPER, not on
 * .dccgg-root. Without it the menu is one column at every width and item C
 * measures a layout no visitor ever sees.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { frontEndJs, chunkBootTag, routeChunks } = require('./_bundles');

const TESTS = __dirname;
const PLUGIN = (process.env.DCCGG_PLUGIN_DIR || path.join(TESTS, '../dcc-guest-guide')).replace(/\/$/, '');
const A = PLUGIN + '/assets/';
const SRC = process.env.DCCGG_UI_SOURCE === '1';
const CSS = SRC ? fs.readFileSync(A + 'css/widget.css', 'utf8')
    : fs.readFileSync(A + 'css/widget.min.css', 'utf8') + fs.readFileSync(A + 'css/widget-guest.min.css', 'utf8');
const JS = frontEndJs(A, SRC);
const emit = (c) => execFileSync('php', [path.join(TESTS, '_emit-guide.php'), c],
    { encoding: 'utf8', env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });

const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;letter-spacing:1.5px;line-height:50px;text-transform:uppercase;padding:0 18px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080;color:#FFFFFF;border-radius:30px 30px 30px 30px}
 .elementor-kit-331 label{text-decoration:underline}
 /* Font Awesome is not loaded here, so an <i class="fas …"> has no glyph and
    collapses to zero. On live it is about 14px square, and without that the
    per-item report flag measures 12x8 and cannot be tapped — a property of
    this harness, not of the guide. Scoped to that one icon so nothing else
    is resized behind the measurements. */
 .dccgg-item-report .fas{display:inline-block;width:14px;height:14px}`;

/** platform: spoof navigator before the bundle runs, for item D. */
const pageFor = (markup, platform) => {
    const spoof = platform ? `<script>Object.defineProperty(navigator,'platform',{get:()=>${JSON.stringify(platform.platform)}});
Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(platform.ua)}});</script>` : '';
    return `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
<div class="elementor-widget dccgg-layout-grid" data-id="2afb24b">${markup}</div></div></div></div>
${spoof}
<script>window.SpeechRecognition=window.SpeechRecognition||function(){this.start=function(){};this.stop=function(){};};</script>
${chunkBootTag(SRC)}<script>${JS}</script></body></html>`;
};

let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];
    const open = async (w, { touch = w < 700, platform = null, kase = 'all-on' } = {}) => {
        const ctx = await browser.newContext(touch
            ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true }
            : { viewport: { width: w, height: 900 } });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await routeChunks(page, A, SRC);
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json',
            body: '{"success":true,"data":{"value":"DCC32586"}}' }));
        await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"current":{},"hourly":{},"daily":{}}' }));
        await page.route('https://waterservices.usgs.gov/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit(kase), platform) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(700);
        return { ctx, page };
    };
    const openSheet = async (page, key) => {
        await page.tap(`.dccgg-tile[data-key="${key}"]`);
        await page.waitForTimeout(700);
        await page.evaluate(() => document.querySelectorAll('.dccgg-item-tts').forEach((b) => { b.hidden = false; }));
    };
    const ticks = (page) => page.evaluate(() => [...document.querySelectorAll(
        '.dccgg-detail:not([hidden]) .dccgg-item[data-checkable="1"]')].map((i) => i.dataset.checked || '0'));

    console.log('\nA. Tap targets in the section sheets');
    for (const w of [390, 768, 1440]) {
        const { ctx, page } = await open(w, { touch: true });
        await openSheet(page, 'checkout');
        // Hit-tested, not measured: a box can be 44px and still be covered by
        // something else. 20px off centre is outside a 24px box and a 28px
        // icon, and inside a 44px target.
        const probes = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            const out = {};
            for (const [name, sel] of [['checkbox', '.dccgg-item-check'], ['readAloud', '.dccgg-item-tts']]) {
                const el = d.querySelector(sel);
                if (!el) { out[name] = null; continue; }
                const b = el.getBoundingClientRect();
                const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
                const hit = {};
                for (const [k, dx, dy] of [['up', 0, -20], ['down', 0, 20], ['left', -20, 0], ['right', 20, 0]]) {
                    const t = document.elementFromPoint(cx + dx, cy + dy);
                    hit[k] = !!(t && (t === el || el.contains(t) || (t.closest && t.closest(sel) === el)));
                }
                const af = getComputedStyle(el, '::after');
                out[name] = { w: Math.round(b.width), h: Math.round(b.height), hit,
                    afterW: parseFloat(af.width) || 0, afterH: parseFloat(af.height) || 0 };
            }
            return out;
        });
        for (const name of ['checkbox', 'readAloud']) {
            const r = probes[name];
            check(`${w}px: ${name} is present`, !!r);
            if (!r) continue;
            const reach = Math.max(r.w, r.afterW) >= 44 && Math.max(r.h, r.afterH) >= 44;
            check(`${w}px: ${name} reaches 44x44`, reach, `${r.w}x${r.h}, ::after ${r.afterW}x${r.afterH}`);
            check(`${w}px: ${name} takes a finger 20px off centre`,
                Object.values(r.hit).every(Boolean), JSON.stringify(r.hit));
        }
        // The row itself ticks.
        const start = await ticks(page);
        await page.tap('.dccgg-detail:not([hidden]) .dccgg-item-title-text');
        await page.waitForTimeout(250);
        const afterTitle = await ticks(page);
        check(`${w}px: tapping the title ticks the item`,
            start[0] === '0' && afterTitle[0] === '1', `${start} -> ${afterTitle}`);
        // …but the controls sharing the row are not swallowed.
        //
        // Read-aloud and the report flag reach this differently, and the
        // difference is worth knowing: read-aloud calls stopPropagation() in
        // its own handler, so it never reaches the document-level row handler
        // at all. The report flag does NOT, so the row's exclusion list is the
        // only thing standing between "flag this item" and "tick this item".
        // Both are checked; only the second can fail.
        const beforeTts = await ticks(page);
        await page.tap('.dccgg-detail:not([hidden]) .dccgg-item-tts');
        await page.waitForTimeout(250);
        check(`${w}px: tapping read-aloud does NOT tick`,
            JSON.stringify(beforeTts) === JSON.stringify(await ticks(page)), String(beforeTts));
        const flag = await page.$('.dccgg-detail:not([hidden]) .dccgg-item-report');
        check(`${w}px: the per-item report flag is in the row`, !!flag);
        if (flag) {
            const beforeFlag = await ticks(page);
            await flag.tap();
            await page.waitForTimeout(500);
            check(`${w}px: tapping the report flag does NOT tick`,
                JSON.stringify(beforeFlag) === JSON.stringify(await ticks(page)),
                `${beforeFlag} -> ${await ticks(page)}`);
            check(`${w}px: …and it still opens the Front Desk form`,
                !!(await page.$('.dccgg-report-dialog[open]')));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(350);
        }
        await ctx.close();
    }
    {
        // A non-checkable item must not respond to a tap on its row.
        const { ctx, page } = await open(390, { touch: true });
        await openSheet(page, 'internet');
        const before = await page.evaluate(() => document.querySelector('.dccgg-detail:not([hidden]) .dccgg-item').dataset.checked || '0');
        await page.tap('.dccgg-detail:not([hidden]) .dccgg-item-title-text');
        await page.waitForTimeout(250);
        const r = await page.evaluate(() => {
            const i = document.querySelector('.dccgg-detail:not([hidden]) .dccgg-item');
            return { checkable: i.dataset.checkable || '0', checked: i.dataset.checked || '0',
                cursor: getComputedStyle(i.querySelector('.dccgg-item-title')).cursor };
        });
        check('a non-checkable row ignores the tap', r.checkable === '0' && r.checked === before, JSON.stringify(r));
        check('…and does not claim to be tappable', r.cursor !== 'pointer', r.cursor);
        await ctx.close();
    }
    {
        const { ctx, page } = await open(390, { touch: true });
        await openSheet(page, 'checkout');
        const names = await page.$$eval('.dccgg-detail:not([hidden]) .dccgg-item-tts',
            (els) => els.map((e) => e.getAttribute('aria-label')));
        check('every read-aloud button is named after its own item',
            names.length > 1 && new Set(names).size === names.length, JSON.stringify(names));
        check('…and the name quotes the item title',
            names.every((n) => /^Read “.+” aloud$/.test(n)), JSON.stringify(names));
        await ctx.close();
    }

    console.log('\nB. The checklist remembers');
    // Ticks here go through the CHECKBOX, not the new row target. The host
    // reported the memory as broken; it was not, and keeping this section on
    // the control that existed before v0.25.1 is what lets it say so — every
    // assertion below passes on 0.25.0 as well.
    {
        const { ctx, page } = await open(390, { touch: true });
        await openSheet(page, 'checkout');
        await page.tap('.dccgg-detail:not([hidden]) .dccgg-item-check');
        await page.waitForTimeout(250);
        const stored = await page.evaluate(() => {
            const o = {};
            for (const k of Object.keys(localStorage)) if (k.indexOf('dccgg:check:') === 0) o[k] = localStorage.getItem(k);
            return o;
        });
        check('a tick is written to localStorage', Object.keys(stored).length === 1, JSON.stringify(stored));
        check('…under a key carrying the widget and the stay',
            Object.keys(stored)[0] === 'dccgg:check:2afb24b:default', Object.keys(stored)[0]);
        // Nothing about a tick goes to the server.
        let posted = 0;
        page.on('request', (r) => { if (r.url().indexOf('admin-ajax') !== -1) posted++; });
        await page.tap('.dccgg-detail:not([hidden]) .dccgg-item-check');
        await page.waitForTimeout(400);
        check('ticking sends nothing to the server', posted === 0, String(posted));

        await page.tap('.dccgg-detail:not([hidden]) .dccgg-item-check');
        await page.waitForTimeout(250);
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(700);
        await openSheet(page, 'checkout');
        const after = await ticks(page);
        check('the tick survives a reload', after[0] === '1', JSON.stringify(after));

        const reset = await page.$('.dccgg-detail:not([hidden]) .dccgg-checklist-reset');
        check('Reset is still there', !!reset);
        if (reset) {
            await reset.tap(); await page.waitForTimeout(300);
            check('Reset clears every tick', (await ticks(page)).every((t) => t === '0'), JSON.stringify(await ticks(page)));
            await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(700);
            await openSheet(page, 'checkout');
            check('…and the clearing survives a reload too',
                (await ticks(page)).every((t) => t === '0'), JSON.stringify(await ticks(page)));
        }
        await ctx.close();
    }

    console.log('\nC. Four columns from 600px up');
    for (const [w, want] of [[390, 1], [600, 4], [768, 4], [1024, 4], [1440, 4]]) {
        const { ctx, page } = await open(w, { kase: 'live-sections' });   // the live set of eight
        const r = await page.evaluate(() => {
            const g = document.querySelector('.dccgg-menu');
            const tiles = [...g.querySelectorAll('.dccgg-tile')];
            const tops = [...new Set(tiles.map((e) => Math.round(e.getBoundingClientRect().top)))];
            return { cols: getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length,
                tiles: tiles.length, rows: tops.length,
                lastRow: tiles.filter((e) => Math.round(e.getBoundingClientRect().top) === tops[tops.length - 1]).length,
                overflow: g.scrollWidth > g.clientWidth + 1 };
        });
        check(`${w}px: ${want} column(s)`, r.cols === want, `${r.cols} (${r.tiles} tiles)`);
        check(`${w}px: no sideways overflow`, !r.overflow);
        if (want === 4) {
            check(`${w}px: eight tiles make two full rows of four`,
                r.rows === 2 && r.lastRow === 4, `${r.rows} rows, last ${r.lastRow}`);
        }
        await ctx.close();
    }

    {
        // A phone in LANDSCAPE is under 600px wide but not portrait, so the
        // mobile portrait rule does not apply and the base auto-fit one does.
        // Without this case, widening the four-column rule all the way down to
        // 1px is invisible: portrait phones are covered by the mobile rule
        // either way.
        const ctx = await browser.newContext({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await routeChunks(page, A, SRC);
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{}}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit('live-sections'), null) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(600);
        const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.dccgg-menu'))
            .gridTemplateColumns.split(' ').filter(Boolean).length);
        check('568px landscape: still follows the tile width, not the four-column rule',
            cols === 2, String(cols));
        await ctx.close();
    }

    console.log('\nD. The keyboard hint');
    const PLATFORMS = [
        ['a Mac',     { platform: 'MacIntel', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }, '⌘K'],
        ['Windows',   { platform: 'Win32',    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },       'Ctrl K'],
        ['Linux',     { platform: 'Linux x86_64', ua: 'Mozilla/5.0 (X11; Linux x86_64)' },             'Ctrl K'],
    ];
    for (const [label, platform, want] of PLATFORMS) {
        const { ctx, page } = await open(1440, { touch: false, platform });
        const r = await page.evaluate(() => {
            const e = document.querySelector('.dccgg-search-kbd');
            return e ? { text: e.textContent.trim(), display: getComputedStyle(e).display } : null;
        });
        check(`${label}: the hint reads "${want}"`, !!r && r.text === want, r ? r.text : 'absent');
        check(`${label}: and is shown`, !!r && r.display !== 'none', r ? r.display : 'absent');
        await ctx.close();
    }
    for (const w of [390, 768]) {
        const { ctx, page } = await open(w, { touch: true });
        const r = await page.evaluate(() => {
            const e = document.querySelector('.dccgg-search-kbd');
            return e ? getComputedStyle(e).display : 'absent';
        });
        check(`${w}px touch: the hint is hidden — there is no shortcut to press`, r === 'none', r);
        await ctx.close();
    }

    console.log('\nE. Body copy weight inside the pop-up');
    for (const w of [390, 768, 1440]) {
        const { ctx, page } = await open(w, { touch: true });
        // Before opening, the stage is still inside .dccgg-root. This is the
        // state the v0.21.0 rule was written against, and it was never the
        // state a guest reads in.
        const closed = await page.evaluate(() => {
            const body = document.querySelector('.dccgg-item-body');
            const p = body && body.querySelector('p');
            return { inRoot: !!(body && body.closest('.dccgg-root')), weight: p ? getComputedStyle(p).fontWeight : '?' };
        });
        await openSheet(page, 'checkout');
        const open_ = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            const body = d.querySelector('.dccgg-item-body');
            const p = body && body.querySelector('p');
            const title = d.querySelector('.dccgg-item-title-text');
            const sheetTitle = d.querySelector('.dccgg-detail-title-text');
            return {
                portaled: document.querySelector('.dccgg-stage').parentElement.tagName === 'BODY',
                inRoot: !!(body && body.closest('.dccgg-root')),
                body: p ? getComputedStyle(p).fontWeight : '?',
                itemTitle: title ? getComputedStyle(title).fontWeight : '?',
                sheetTitle: sheetTitle ? getComputedStyle(sheetTitle).fontWeight : '?',
                sheetTitleAlign: sheetTitle ? getComputedStyle(sheetTitle.parentElement).textAlign : '?',
            };
        });
        check(`${w}px: the stage really is portaled out of .dccgg-root`,
            open_.portaled && !open_.inRoot, JSON.stringify(open_));
        check(`${w}px: body copy is 400 with the pop-up OPEN`, open_.body === '400', open_.body);
        check(`${w}px: …and was already 400 closed, so both hosts are covered`,
            closed.weight === '400' && closed.inRoot, JSON.stringify(closed));
        check(`${w}px: the item title stays bold`, open_.itemTitle === '700', open_.itemTitle);
        // Pasted copy arrives with style="font-weight:700" on the paragraph.
        // An inline style beats any author rule that is not !important, so the
        // root-level 400 cannot reach it — only the !important on
        // .dccgg-item-body can, and only if that rule names the stage host.
        const pasted = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            const p = [...d.querySelectorAll('.dccgg-item-body p')].find((e) => e.style.fontWeight);
            return p ? { inline: p.style.fontWeight, computed: getComputedStyle(p).fontWeight } : null;
        });
        check(`${w}px: a pasted inline bold is overridden too`,
            !!pasted && pasted.inline === '700' && pasted.computed === '400', JSON.stringify(pasted));
        // Text OUTSIDE .dccgg-item-body — the Wi-Fi value, the menu items —
        // is reached only by the weight declared on the hosts themselves. The
        // !important rule above covers item bodies and nothing else, so without
        // this the host rule could be deleted and no test would notice.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
        await openSheet(page, 'internet');
        const outside = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            const ssid = d.querySelector('.dccgg-wifi-ssid');
            const menuItem = d.querySelector('.dccgg-more-item');
            return { ssid: ssid ? getComputedStyle(ssid).fontWeight : null,
                     inBody: !!(ssid && ssid.closest('.dccgg-item-body')),
                     menuItem: menuItem ? getComputedStyle(menuItem).fontWeight : null };
        });
        check(`${w}px: the Wi-Fi value is 400, and it is not in an item body`,
            outside.ssid === '400' && outside.inBody === false, JSON.stringify(outside));
        check(`${w}px: a Front Desk menu item is 400 too`, outside.menuItem === '400', JSON.stringify(outside));
        check(`${w}px: the sheet title stays bold`, open_.sheetTitle === '700', open_.sheetTitle);
        check(`${w}px: the sheet title stays centred`, open_.sheetTitleAlign === 'center', open_.sheetTitleAlign);
        await ctx.close();
    }

    await browser.close();
    check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(fail ? 1 : 0);
})();
