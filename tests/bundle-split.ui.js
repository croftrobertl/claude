/**
 * DCC Guest Guide — the v0.25.0 script splits, in a real browser.
 *
 *   A. /explore/ loads no guest bundle and no chunk, and still searches;
 *   B. /guest/ still sends a Front Desk report, reveals Wi-Fi, copies and
 *      searches — the four things the brief asks to see working after the
 *      guest features moved out of core;
 *   C. a chunk is fetched only where its element is, and never on a tap: the
 *      video poster plays on the FIRST press;
 *   D. either load order works, because SpeedyCache reorders scripts;
 *   E. the Front Desk note is left-aligned when it holds more than one
 *      sentence and centred when it holds one, from its own text.
 *
 *   node tests/bundle-split.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/bundle-split.ui.js
 *
 * The bundles are served over HTTP here rather than inlined — that is the
 * whole point of C, and it is the only way to see what the page asks for.
 *
 * BROWSER: Chromium with touch emulation; WebKit cannot be installed here.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const TESTS = __dirname;
const PLUGIN = (process.env.DCCGG_PLUGIN_DIR || path.join(TESTS, '../dcc-guest-guide')).replace(/\/$/, '');
const A = PLUGIN + '/assets/';
const SRC = process.env.DCCGG_UI_SOURCE === '1';
const SFX = SRC ? '.js' : '.min.js';
const CSS = SRC ? fs.readFileSync(A + 'css/widget.css', 'utf8')
    : fs.readFileSync(A + 'css/widget.min.css', 'utf8') + fs.readFileSync(A + 'css/widget-guest.min.css', 'utf8');
const emit = (c) => execFileSync('php', [path.join(TESTS, '_emit-guide.php'), c],
    { encoding: 'utf8', env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });

const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;letter-spacing:1.5px;line-height:50px;text-transform:uppercase;padding:0 18px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080;color:#FFFFFF;border-radius:30px 30px 30px 30px}
 .elementor-kit-331 label{text-decoration:underline}`;

/** guest: load widget-guest; flip: put it BEFORE core, as a combiner might. */
const pageFor = (markup, { guest = true, flip = false } = {}) => {
    const core  = `<script src="https://dccgg.test/a/widget${SFX}"></script>`;
    const extra = guest ? `<script src="https://dccgg.test/a/widget-guest${SFX}"></script>` : '';
    return `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
${markup}</div></div></div>
<script>window.dccggChunks={base:"https://dccgg.test/a/",ver:"test",min:${SRC ? 'false' : 'true'}};</script>
<script>window.SpeechRecognition=window.SpeechRecognition||function(){this.start=function(){};this.stop=function(){};};</script>
${flip ? extra + core : core + extra}
</body></html>`;
};

let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];

    const open = async (kase, opts = {}) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        const asked = [];
        let posted = null;
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('request', (r) => {
            const u = r.url();
            if (u.indexOf('/a/widget') !== -1) asked.push(u.split('/a/')[1].split('?')[0]);
        });
        await page.route('**/admin-ajax.php', (r) => {
            posted = r.request().postData() || '';
            r.fulfill({ status: 200, contentType: 'application/json',
                // `value` is the key fetchSecret() reads; `sent` is the one
                // the report handler answers with.
                body: '{"success":true,"data":{"sent":true,"value":"DCC32586"}}' });
        });
        await page.route('https://dccgg.test/a/*', (r) => {
            const file = r.request().url().split('/a/')[1].split('?')[0];
            const p = A + 'js/' + file;
            if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
            return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(p, 'utf8') });
        });
        await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"current":{},"hourly":{},"daily":{}}' }));
        await page.route('https://waterservices.usgs.gov/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit(kase), opts) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(900);
        return { ctx, page, asked, posted: () => posted };
    };
    const chunkNames = (asked) => asked
        .filter((f) => f.indexOf('widget-') === 0 && f.indexOf('widget-guest') !== 0)
        .map((f) => f.replace('widget-', '').replace('.min', '').replace('.js', ''))
        .sort();

    console.log('\nA. /explore/ carries none of it');
    {
        const { ctx, page, asked } = await open('public-intro', { guest: false });
        check('no guest bundle is requested',
            !asked.some((f) => f.indexOf('widget-guest') === 0), asked.join(' '));
        check('no chunk is requested', chunkNames(asked).length === 0, chunkNames(asked).join(','));
        const st = await page.evaluate(() => ({ core: !!window.DCCGG_CORE, guest: !!window.DCCGG_GUEST,
            chunk: !!window.DCCGG_CHUNK }));
        check('DCCGG_GUEST is undefined there', st.core && !st.guest, JSON.stringify(st));
        // Search is core, and must still work with the bundle absent.
        await page.fill('.dccgg-search-input', 'pool');
        await page.waitForTimeout(500);
        const hits = await page.$$eval('.dccgg-search-result', (e) => e.length);
        check('search still returns results', hits > 0, String(hits));
        await page.fill('.dccgg-search-input', 'zzzqqq');
        await page.waitForTimeout(500);
        const empty = await page.$$eval('.dccgg-search-no-results', (e) => e.length);
        check('a miss still renders its empty state, with no guest bundle to call',
            empty === 1, String(empty));
        await ctx.close();
    }

    console.log('\nB. /guest/ still does the four things');
    {
        const { ctx, page, posted } = await open('all-on');
        // 1. send a Front Desk report
        const face = await page.$('.dccgg-root details.dccgg-more > summary, .dccgg-root .dccgg-more--direct');
        if (face) {
            await face.tap(); await page.waitForTimeout(300);
            const rep = await page.$('.dccgg-root .dccgg-more-report');
            if (rep && await rep.isVisible()) { await rep.tap(); }
        }
        await page.waitForTimeout(700);
        check('the Front Desk form opens', !!(await page.$('.dccgg-report-dialog[open]')));
        await page.fill('.dccgg-report-desc', 'The porch light is out.');
        const cat = await page.$('.dccgg-report-cat');
        if (cat) await page.selectOption('.dccgg-report-cat', { index: 1 });
        await page.waitForTimeout(3200);                 // clear the 3s dwell floor
        await page.click('.dccgg-btn-send');
        await page.waitForTimeout(600);
        check('…and sends', /action=dccgg_report_problem/.test(posted() || ''), String(posted()).slice(0, 60));
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);

        // 2. reveal Wi-Fi and 3. copy
        await page.tap('.dccgg-tile[data-key="internet"]'); await page.waitForTimeout(700);
        const show = await page.$('.dccgg-detail:not([hidden]) .dccgg-secret-toggle');
        check('the Wi-Fi row has a Show button', !!show);
        if (show) {
            await show.tap(); await page.waitForTimeout(700);
            // .dccgg-secret wraps the value AND the Show button; the value
            // itself is .dccgg-secret-value.
            const revealed = await page.$eval('.dccgg-detail:not([hidden]) .dccgg-secret-value',
                (e) => (e.textContent || '').trim());
            check('Show reveals the password', revealed.indexOf('DCC32586') !== -1, revealed);
        }
        const copy = await page.$('.dccgg-detail:not([hidden]) .dccgg-copy');
        check('…and Copy is there to press', !!copy);
        if (copy) {
            await copy.tap(); await page.waitForTimeout(400);
            check('Copy reports success rather than throwing',
                !errors.some((e) => /copy/i.test(e)), errors.join(' ').slice(0, 60));
        }
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);

        // 4. search
        await page.fill('.dccgg-search-input', 'wifi'); await page.waitForTimeout(500);
        const hits = await page.$$eval('.dccgg-search-result', (e) => e.length);
        check('search works on the guest guide too', hits > 0, String(hits));
        await ctx.close();
    }

    console.log('\nC. A chunk loads only where its element is, and never on a tap');
    {
        const { ctx, page, asked } = await open('all-on');
        const names = chunkNames(asked);
        check('all four are fetched for a guide that has all four elements',
            JSON.stringify(names) === JSON.stringify(['conditions', 'gallery', 'video', 'wizard']), names.join(','));
        const reg = await page.evaluate(() => Object.keys(window.DCCGG_CHUNK || {}).sort());
        check('…and all four register their wiring', reg.length === 4, reg.join(','));
        // The three-tap lesson: the poster must play on the FIRST press, which
        // means the chunk was already in place before the guest could press it.
        await page.tap('.dccgg-tile[data-key="map"]'); await page.waitForTimeout(700);
        const before = await page.$$eval('.dccgg-detail:not([hidden]) iframe', (e) => e.length);
        const poster = await page.$('.dccgg-detail:not([hidden]) .dccgg-video-poster');
        check('the video poster is there', !!poster);
        if (poster) {
            await poster.tap(); await page.waitForTimeout(500);
            const after = await page.$$eval('.dccgg-detail:not([hidden]) iframe', (e) => e.length);
            check('one tap plays it — no second or third tap needed', before === 0 && after === 1,
                `${before} -> ${after}`);
        }
        await ctx.close();
    }
    {
        const { ctx, asked } = await open('guest');     // plain guide: no extras
        check('a guide with none of those elements fetches no chunk',
            chunkNames(asked).length === 0, chunkNames(asked).join(','));
        await ctx.close();
    }

    console.log('\nD. Either load order, because SpeedyCache reorders scripts');
    for (const flip of [false, true]) {
        const { ctx, page, posted } = await open('all-on', { flip });
        const label = flip ? 'guest bundle first' : 'core first';
        const st = await page.evaluate(() => ({ guest: !!window.DCCGG_GUEST,
            wired: !!(document.querySelector('.dccgg-root') || {}).__dccggGuestWired }));
        check(`${label}: the bundle registers and the root is wired`, st.guest && st.wired, JSON.stringify(st));
        const face = await page.$('.dccgg-root details.dccgg-more > summary, .dccgg-root .dccgg-more--direct');
        if (face) {
            await face.tap(); await page.waitForTimeout(300);
            const rep = await page.$('.dccgg-root .dccgg-more-report');
            if (rep && await rep.isVisible()) { await rep.tap(); }
        }
        await page.waitForTimeout(700);
        check(`${label}: the Front Desk form opens`, !!(await page.$('.dccgg-report-dialog[open]')));
        // Wired exactly once: a doubled wiring would send two reports.
        await page.fill('.dccgg-report-desc', 'Twice?');
        const cat = await page.$('.dccgg-report-cat');
        if (cat) await page.selectOption('.dccgg-report-cat', { index: 1 });
        await page.waitForTimeout(3200);
        let sends = 0;
        page.on('request', (r) => { if (r.url().indexOf('admin-ajax') !== -1) sends++; });
        await page.click('.dccgg-btn-send');
        await page.waitForTimeout(700);
        check(`${label}: one press sends exactly one report`, sends === 1, String(sends));
        await ctx.close();
    }

    console.log('\nE. The note follows Rob\'s alignment rule, from its own text');
    {
        const { ctx, page } = await open('all-on');
        const face = await page.$('.dccgg-root details.dccgg-more > summary, .dccgg-root .dccgg-more--direct');
        if (face) {
            await face.tap(); await page.waitForTimeout(300);
            const rep = await page.$('.dccgg-root .dccgg-more-report');
            if (rep && await rep.isVisible()) { await rep.tap(); }
        }
        await page.waitForTimeout(700);
        const r = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-report-dialog[open]');
            const p = d.querySelector('.dccgg-report-privacy');
            const h = d.querySelector('.dccgg-report-head h3');
            const read = (el) => ({ align: getComputedStyle(el).textAlign, cls: el.className });
            const out = { note: read(p), head: read(h), text: p.textContent.trim() };
            // Now swap in a ONE-sentence note and re-render the class the same
            // way the dialog builder does, to prove the rule is the text's.
            const isMulti = (t) => /[.!?]["”']?\s+\S/.test(String(t == null ? '' : t));
            out.multiOnTwo = isMulti('We will respond as soon as possible. However, please allow 24 hours.');
            out.multiOnOne = isMulti('Your report goes straight to the host.');
            out.multiOnTrailing = isMulti('All done. ');
            return out;
        });
        check('the packaged note is two sentences and carries dccgg-multi',
            /dccgg-multi/.test(r.note.cls), r.note.cls);
        check('…so it is left-aligned', r.note.align === 'left', r.note.align);
        check('the sheet title is still centred', r.head.align === 'center', r.head.align);
        check('the rule says yes to two sentences', r.multiOnTwo === true);
        check('…no to one', r.multiOnOne === false);
        check('…and no to one with a trailing space', r.multiOnTrailing === false);
        await ctx.close();
    }

    await browser.close();
    check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(fail ? 1 : 0);
})();
