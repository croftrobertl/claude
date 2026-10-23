/**
 * DCC Guest Guide — the Front Desk form after v0.24.5, in a real browser.
 *
 *   A. opening it by TAP leaves focus on the form's own heading — not in a
 *      text field, which is what opened the iPhone keyboard over the form —
 *      and the heading shows no ring;
 *   B. its six labels are Title Case, and the heading is centred, per Rob's
 *      standing alignment rule;
 *   C. the Voice Search mic keeps its 28px icon and gains a 44x44 tap area;
 *   D. the guide still paints in the site blue and nowhere in the old one.
 *
 *   node tests/front-desk-form.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/front-desk-form.ui.js
 *
 * BROWSER: Chromium with touch emulation. WebKit is not installed here and
 * cannot be fetched — the egress proxy refuses cdn.playwright.dev and the
 * Microsoft mirror. The keyboard-over-the-form symptom is iOS's own and
 * cannot be reproduced at all; what IS checked is the cause, namely that no
 * text field takes focus when the form opens.
 *
 * The mic only renders where SpeechRecognition exists, which headless
 * Chromium does not provide, so a stub is installed before init.
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

// The host's ground, including the kit's label underline — the dialog nests
// each field inside its label, so that rule is part of this form's reality.
const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;letter-spacing:1.5px;line-height:50px;text-transform:uppercase;padding:0 18px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080;color:#FFFFFF;border-radius:30px 30px 30px 30px}
 .site .content .entry button{text-transform:uppercase;border-radius:3px}
 .elementor-kit-331 label{text-decoration:underline}`;
// SpeechRecognition is stubbed BEFORE the bundle runs, because wireSearchMic
// bails at init when the API is missing and never creates the button.
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
${markup}</div></div></div>
<script>window.SpeechRecognition = window.SpeechRecognition || function () {
  this.start = function () {}; this.stop = function () {}; };</script>
${chunkBootTag(SRC)}<script>${JS}</script></body></html>`;

const OLD_BLUE = ['rgb(15, 109, 191)', '#0f6dbf'];
let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];
    const open = async (w) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await routeChunks(page, A, SRC);
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit('all-on')) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(450);
        return { ctx, page };
    };
    /** Open the Front Desk form the way a guest does: by tapping. */
    const openForm = async (page) => {
        const face = await page.$('.dccgg-root details.dccgg-more > summary, .dccgg-root .dccgg-more--direct');
        if (!face) return false;
        await face.tap();
        await page.waitForTimeout(300);
        const rep = await page.$('.dccgg-root .dccgg-more-report');
        if (rep && await rep.isVisible()) { await rep.tap(); }
        await page.waitForTimeout(700);
        return !!(await page.$('.dccgg-report-dialog[open]'));
    };

    console.log('\nA. Opening the form by tap lands on its heading, not in a field');
    for (const w of [360, 390]) {
        const { ctx, page } = await open(w);
        check(`${w}px: the form opens`, await openForm(page));
        const r = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-report-dialog[open]');
            const a = document.activeElement;
            const h = d && d.querySelector('.dccgg-report-head h3');
            const cs = h ? getComputedStyle(h) : null;
            const FIELD = 'input, textarea, select';
            return {
                onHeading: !!(h && a === h),
                what: a ? (a.className || a.tagName).toString().split(' ')[0] : 'none',
                inAField: !!(a && a.matches && a.matches(FIELD)),
                outline: cs && cs.outlineStyle === 'none' ? 'none' : (cs ? cs.outlineWidth + ' ' + cs.outlineStyle : '?'),
                tabindex: h ? h.getAttribute('tabindex') : null,
            };
        });
        check(`${w}px: focus is on the form's heading`, r.onHeading, r.what);
        // This is the cause of the iPhone symptom: a focused text input opens
        // the on-screen keyboard, which covered the form the guest just opened.
        check(`${w}px: no text field has focus, so no keyboard is summoned`, !r.inAField, r.what);
        check(`${w}px: the heading shows no ring`, r.outline === 'none', r.outline);
        check(`${w}px: the heading is a focus target, not a Tab stop`, r.tabindex === '-1', String(r.tabindex));
        await ctx.close();
    }

    console.log('\nB. Its labels are Title Case, and the heading is centred');
    {
        const { ctx, page } = await open(390);
        await openForm(page);
        const r = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-report-dialog[open]');
            return {
                labels: [...d.querySelectorAll('.dccgg-report-label')].map((e) => e.textContent.trim()),
                headAlign: getComputedStyle(d.querySelector('.dccgg-report-head h3')).textAlign,
                headText: d.querySelector('.dccgg-report-head h3').textContent.trim(),
            };
        });
        const expected = ["What's the Issue?", 'Your Name (Optional)', 'Which Cottage Are You Staying In?',
            'Phone (Optional)', 'Email to Reach You Back (Optional)', 'Describe the Problem'];
        check('all six labels render exactly as specified',
            JSON.stringify(r.labels) === JSON.stringify(expected), JSON.stringify(r.labels));
        // Title Case here means: no label begins a word in lower case other
        // than the short joining words a Title Case style keeps down.
        const SMALL = new Set(['a', 'an', 'the', 'of', 'or', 'and', 'to', 'in', 'on', 'for']);
        const offenders = [];
        for (const label of r.labels) {
            const words = label.replace(/[?()]/g, ' ').trim().split(/\s+/);
            words.forEach((word, i) => {
                if (!word) return;
                const lower = word.toLowerCase();
                if (/^[a-z]/.test(word) && !(SMALL.has(lower) && i > 0)) offenders.push(label + ' → ' + word);
            });
        }
        check('no label word is left in sentence case', offenders.length === 0, offenders.join(', '));
        check('"(Optional)" kept its brackets and its capital',
            r.labels.filter((l) => /\(Optional\)/.test(l)).length === 3,
            r.labels.filter((l) => /\(optional\)/i.test(l)).join(' | '));
        // Rob's standing rule: every title, section heading and sheet title is
        // centred; only multi-sentence paragraphs are left-aligned.
        check('the sheet title is centred', r.headAlign === 'center', r.headAlign);
        await ctx.close();
    }

    console.log('\nC. The Voice Search mic');
    for (const w of [360, 390]) {
        const { ctx, page } = await open(w);
        const r = await page.evaluate(() => {
            const m = document.querySelector('.dccgg-search-mic');
            if (!m) return null;
            const b = m.getBoundingClientRect();
            const af = getComputedStyle(m, '::after');
            const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            const hits = {};
            // 20px above and below centre is outside a 28px-tall icon and
            // inside a 44px-tall target.
            for (const [n, dx, dy] of [['up', 0, -20], ['down', 0, 20], ['left', -16, 0], ['right', 16, 0]]) {
                const el = document.elementFromPoint(cx + dx, cy + dy);
                hits[n] = !!(el && (el === m || m.contains(el)));
            }
            const cs = getComputedStyle(m);
            const input = document.querySelector('.dccgg-search-input').getBoundingClientRect();
            return { box: [Math.round(b.width), Math.round(b.height)], after: [af.width, af.height], hits,
                position: cs.position, right: cs.right,
                insideBar: b.top >= input.top - 1 && b.bottom <= input.bottom + 1 };
        });
        check(`${w}px: the mic renders`, r !== null);
        if (!r) { await ctx.close(); continue; }
        check(`${w}px: its visible icon is unchanged (28px tall)`, r.box[1] === 28, JSON.stringify(r.box));
        check(`${w}px: its tap area is 44x44`,
            parseFloat(r.after[0]) >= 44 && parseFloat(r.after[1]) >= 44, r.after.join('x'));
        check(`${w}px: a finger 20px above or below centre still hits it`,
            Object.values(r.hits).every(Boolean), JSON.stringify(r.hits));
        // The tap area must not have cost the mic its placement: it is
        // absolutely positioned inside the search bar, and a `position:
        // relative` added for the ::after would have dropped it out.
        check(`${w}px: it is still absolutely placed inside the search bar`,
            r.position === 'absolute' && r.insideBar, `${r.position} ${r.right} inside=${r.insideBar}`);
        await ctx.close();
    }

    console.log('\nD. The site blue, as painted');
    {
        const { ctx, page } = await open(390);
        const hub = await page.evaluate(() => {
            const root = document.querySelector('.dccgg-root');
            const cs = getComputedStyle(root);
            const out = { primary: cs.getPropertyValue('--dccgg-primary').trim(),
                btnBg: cs.getPropertyValue('--dccgg-btn-bg').trim(), painted: [] };
            for (const el of document.querySelectorAll('.dccgg-root *')) {
                if (!el.getClientRects().length) continue;
                const c = getComputedStyle(el);
                for (const v of [c.backgroundColor, c.color, c.borderTopColor, c.outlineColor]) {
                    if (/rgb\(\s*15,\s*109,\s*191/.test(v)) out.painted.push((el.className || el.tagName).toString().split(' ')[0] + ':' + v);
                }
            }
            return out;
        });
        check('the --dccgg-primary token resolves to the site blue',
            /#006bcf/i.test(hub.primary), hub.primary);
        check('the button fill matches it, so the guide is one blue',
            hub.btnBg.toLowerCase().replace(/\s/g, '') === hub.primary.toLowerCase().replace(/\s/g, ''),
            `${hub.primary} vs ${hub.btnBg}`);
        check('nothing on the hub paints in the old blue', hub.painted.length === 0, hub.painted.slice(0, 4).join(' '));

        await openForm(page);
        const inForm = await page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll('.dccgg-report-dialog[open] *')) {
                if (!el.getClientRects().length) continue;
                const c = getComputedStyle(el);
                for (const v of [c.backgroundColor, c.color, c.borderTopColor]) {
                    if (/rgb\(\s*15,\s*109,\s*191/.test(v)) out.push((el.className || el.tagName).toString().split(' ')[0]);
                }
            }
            const send = document.querySelector('.dccgg-report-dialog[open] .dccgg-btn-send');
            return { old: out, sendBg: getComputedStyle(send).backgroundColor };
        });
        check('nothing in the Front Desk form paints in the old blue', inForm.old.length === 0, inForm.old.join(' '));
        check('Send is the site blue', inForm.sendBg === 'rgb(0, 107, 207)', inForm.sendBg);
        await ctx.close();
    }

    // The old blue must not survive anywhere in what the page downloaded.
    check('neither bundle contains the old blue',
        !OLD_BLUE.some((c) => CSS.toLowerCase().includes(c.toLowerCase()) || JS.toLowerCase().includes(c.toLowerCase())));

    await browser.close();
    check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(fail ? 1 : 0);
})();
