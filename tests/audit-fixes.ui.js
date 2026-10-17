/**
 * DCC Guest Guide — the 2026-10-17 audit fixes, in a real browser (v0.24.3).
 *
 *   · focus lands INSIDE the section that just opened, for every section;
 *   · the read-aloud button has a 44×44 tap area without moving the layout;
 *   · the report dialog has an accessible name;
 *   · the report form carries a spam trap no guest can reach, and reports
 *     when it opened;
 *   · a remembered Wi-Fi reveal older than the window in force has expired.
 *
 *   node tests/audit-fixes.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/audit-fixes.ui.js
 *
 * BROWSER: Chromium. WebKit is not installed here and cannot be fetched (the
 * egress proxy refuses cdn.playwright.dev and the Microsoft mirror).
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
const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080;color:#FFF}`;
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331">${markup}<script>${JS}</script></body></html>`;

let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];
    const open = async (w, opts = {}) => {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: 780 }, isMobile: true, hasTouch: true }, opts));
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{"ok":true}}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit('live-sections')) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(400);
        return { ctx, page };
    };

    console.log('\nA. Opening a section puts focus inside it — every section');
    for (const w of [360, 390, 1280]) {
        const { ctx, page } = await open(w);
        const keys = await page.$$eval('.dccgg-tile-wrap', (ws) => ws.map((e) => e.dataset.sectionKey));
        const bad = [];
        for (const k of keys) {
            await page.click(`.dccgg-tile[data-key="${k}"]`); await page.waitForTimeout(650);
            const r = await page.evaluate((kk) => {
                const open = document.querySelector(`.dccgg-detail[data-key="${kk}"]:not([hidden])`);
                const a = document.activeElement;
                return { inside: !!(open && open.contains(a)), body: a === document.body,
                    visible: !!(a && a.getClientRects && a.getClientRects().length > 0),
                    what: a ? (a.className || a.tagName).toString().split(' ')[0] : 'none' };
            }, k);
            if (!r.inside || r.body || !r.visible) bad.push(`${k}:${r.what}${r.body ? '(body)' : ''}`);
            const back = await page.$('.dccgg-detail:not([hidden]) .dccgg-back');
            if (back) { await back.click(); await page.waitForTimeout(450); }
        }
        check(`${w}px: focus lands on a visible control inside all ${keys.length} sections`, bad.length === 0, bad.join(' '));
        await ctx.close();
    }

    console.log('\nB. The read-aloud button\'s tap area');
    for (const w of [360, 390]) {
        const { ctx, page } = await open(w);
        await page.click('.dccgg-tile[data-key="internet"]'); await page.waitForTimeout(650);
        const r = await page.evaluate(() => {
            const t = document.querySelector('.dccgg-detail:not([hidden]) .dccgg-item-tts');
            if (!t) return null;
            t.hidden = false;                       // revealed by JS only where speech exists
            const b = t.getBoundingClientRect();
            const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            const hits = {};
            for (const [n, dx, dy] of [['up', 0, -21], ['down', 0, 21], ['left', -21, 0], ['right', 21, 0]]) {
                const el = document.elementFromPoint(cx + dx, cy + dy);
                hits[n] = !!(el && (el === t || t.contains(el)));
            }
            const af = getComputedStyle(t, '::after');
            const title = t.closest('.dccgg-item-title');
            return { box: [Math.round(b.width), Math.round(b.height)], afterW: af.width, afterH: af.height,
                hits, titleH: title ? Math.round(title.getBoundingClientRect().height) : null };
        });
        check(`${w}px: the icon itself is still 28×28, so nothing moved`, r && r.box[0] === 28 && r.box[1] === 28, JSON.stringify(r && r.box));
        check(`${w}px: but its tap area is 44×44`, r && parseFloat(r.afterW) >= 44 && parseFloat(r.afterH) >= 44, `${r && r.afterW}×${r && r.afterH}`);
        check(`${w}px: and a finger 21px off-centre in any direction still hits it`,
            r && Object.values(r.hits).every(Boolean), JSON.stringify(r && r.hits));
        await ctx.close();
    }

    console.log('\nC. The report dialog: a name, and a trap');
    {
        const { ctx, page } = await open(390);
        await page.click('.dccgg-tile[data-key="internet"]'); await page.waitForTimeout(650);
        await page.click('.dccgg-detail:not([hidden]) .dccgg-more--direct'); await page.waitForTimeout(600);
        const r = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-report-dialog');
            const by = d.getAttribute('aria-labelledby');
            const head = by ? document.getElementById(by) : null;
            const hp = d.querySelector('.dccgg-report-hp');
            const trap = d.querySelector('.dccgg-report-trap');
            const tb = trap ? trap.getBoundingClientRect() : null;
            return { open: d.open, by, headText: head ? head.textContent.trim() : null,
                hpExists: !!hp, hpValue: hp ? hp.value : null, hpTab: hp ? hp.tabIndex : null,
                trapHidden: trap ? trap.getAttribute('aria-hidden') : null,
                trapOffscreen: tb ? (tb.right < 0 || tb.left > innerWidth) : null,
                hpFocusable: (() => { if (!hp) return null; hp.focus(); return document.activeElement === hp; })() };
        });
        check('the dialog is named by its own heading',
            !!r.by && r.headText === 'Report a problem', JSON.stringify({ by: r.by, head: r.headText }));
        check('a screen reader therefore announces more than just "dialog"', r.headText.length > 0);
        check('the trap field exists, is empty and is not in the tab order',
            r.hpExists && r.hpValue === '' && r.hpTab === -1, JSON.stringify(r));
        check('it is off-screen and hidden from assistive tech',
            r.trapOffscreen === true && r.trapHidden === 'true', JSON.stringify({ off: r.trapOffscreen, hidden: r.trapHidden }));
        // what the form actually sends
        const sent = [];
        await page.route('**/admin-ajax.php', (route) => {
            const b = route.request().postData() || '';
            if (b.includes('dccgg_report_problem')) sent.push(b);
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{"ok":true}}' });
        });
        await page.fill('.dccgg-report-desc', 'The tap drips.');
        const cat = await page.$('.dccgg-report-cat');
        if (cat) await page.selectOption('.dccgg-report-cat', { index: 1 });
        await page.waitForTimeout(3100);                 // past the dwell floor
        await page.click('.dccgg-report-dialog .dccgg-btn-send'); await page.waitForTimeout(500);
        const p = new URLSearchParams(sent[0] || '');
        check('the send carries an empty trap value and a dwell time', sent.length === 1
            && p.get('dccgg_hp') === '' && Number(p.get('elapsed_ms')) >= 3000,
            `hp="${p.get('dccgg_hp')}" elapsed=${p.get('elapsed_ms')}`);
        await ctx.close();
    }

    console.log('\nD. A remembered reveal expires under the window in force');
    {
        const { ctx, page } = await open(390);
        const H = 3600000;
        const res = await page.evaluate((H) => {
            const cfg = { widgetId: 'abc123', revealMemoryHours: 48 };
            const key = (r) => 'dccgg:secret:abc123:default:' + r;
            const now = Date.now();
            // as 0.24.2 and earlier wrote them: exp only, under the 168h window
            localStorage.setItem(key('id:old'), JSON.stringify({ v: 'OLD', exp: now + (168 - 49) * H }));
            localStorage.setItem(key('id:fresh'), JSON.stringify({ v: 'FRESH', exp: now + (168 - 1) * H }));
            // as 0.24.3 writes them
            localStorage.setItem(key('id:new49'), JSON.stringify({ v: 'N49', exp: now - H, t: now - 49 * H }));
            localStorage.setItem(key('id:new2'), JSON.stringify({ v: 'N2', exp: now + 46 * H, t: now - 2 * H }));
            return Object.keys(localStorage).filter((k) => k.indexOf('dccgg:secret:') === 0).length;
        }, H);
        check('four remembered copies are in place to start', res === 4, String(res));
        await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
        const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf('dccgg:secret:') === 0).map((k) => k.split(':').pop()).sort());
        check('a 49-hour-old copy is gone, a 2-hour-old one stays',
            !left.includes('old') && !left.includes('new49') && left.includes('fresh') && left.includes('new2'),
            left.join(','));
        await ctx.close();
    }
    check('no JS errors', errors.length === 0, errors[0]);

    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('Failures:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
