/**
 * DCC Guest Guide — Front Desk button, in a real browser (v0.24.0).
 *
 * The same properties scenario AE asserts inside tests/popup.test.js, as a
 * standalone run so the mutation runner can point it at a broken copy of the
 * plugin: tests/front-desk.mutations.py needs a browser to see a label wrap, a
 * label turning white, or focus failing to come back.
 *
 *   node tests/front-desk.ui.js
 *   DCCGG_PLUGIN_DIR=/path/to/dcc-guest-guide node tests/front-desk.ui.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const TESTS = __dirname;
const PLUGIN = (process.env.DCCGG_PLUGIN_DIR || path.join(TESTS, '../dcc-guest-guide')).replace(/\/$/, '');
const A = PLUGIN + '/assets/';
// By default this runs against the MINIFIED pair, which is what the site
// serves. DCCGG_UI_SOURCE=1 reads the sources instead: the mutation runner
// sets it so a change to widget.css or widget.js is visible without a rebuild
// (minifying needs terser from the network, which a mutant copy cannot rely on).
const SRC = process.env.DCCGG_UI_SOURCE === '1';
const CSS = SRC
    ? fs.readFileSync(A + 'css/widget.css', 'utf8')
    : fs.readFileSync(A + 'css/widget.min.css', 'utf8') + fs.readFileSync(A + 'css/widget-guest.min.css', 'utf8');
const JS = fs.readFileSync(A + (SRC ? 'js/widget.js' : 'js/widget.min.js'), 'utf8');
const emit = (c) => execFileSync('php', [path.join(TESTS, '_emit-guide.php'), c],
    { encoding: 'utf8', env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });

// The host's real ground: Raleway body text, html{font-weight:700}, and the
// theme's own rules for a bare <button> — including the (0,3,1) one that
// reaches the hub but not the portaled popup header.
const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;letter-spacing:1.5px;
   line-height:50px;text-transform:uppercase;padding:0 18px;background:#444;color:#fff;border:2px solid #222;border-radius:3px}
 .elementor-kit-331 summary{font-family:Pavanam,sans-serif;text-transform:uppercase;letter-spacing:1.5px}
 .site .content .entry button{text-transform:uppercase;background:#444;color:#fff}`;
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
${markup}</div></div></div><script>${JS}</script></body></html>`;

const axName = (el) => {
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    const walk = (n) => {
        if (n.nodeType === 3) return n.textContent;
        if (n.nodeType !== 1) return '';
        if (n.getAttribute('aria-hidden') === 'true' || n.hidden) return '';
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return '';
        return [...n.childNodes].map(walk).join('');
    };
    return walk(el).replace(/\s+/g, ' ').trim();
};

let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};
const HUB = '.dccgg-toolbar .dccgg-more--direct';

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];
    const open = async (kase, w, touch) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: 880 }, isMobile: touch, hasTouch: touch });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit(kase)) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(350);
        return { ctx, page };
    };

    console.log('\nA. The face, under the theme');
    for (const w of [390, 1280]) {
        const { ctx, page } = await open('guest-fd', w, w === 390);
        const m = await page.$eval(HUB, (el) => {
            const c = getComputedStyle(el), i = getComputedStyle(el.querySelector('.dccgg-fd-icon'));
            const lEl = el.querySelector('.dccgg-fd-label'), l = getComputedStyle(lEl);
            const lr = lEl.getBoundingClientRect(), r = el.getBoundingClientRect();
            return { font: c.fontFamily.split(',')[0].replace(/"/g, ''), bg: c.backgroundColor, pad: c.padding,
                border: c.borderTopStyle, tt: c.textTransform, ls: c.letterSpacing,
                w: Math.round(r.width), h: Math.round(r.height),
                iw: Math.round(parseFloat(i.width)), ih: Math.round(parseFloat(i.height)), ir: i.borderTopLeftRadius,
                ibg: i.backgroundColor, ibd: i.borderTopWidth + ' ' + i.borderTopColor, isize: i.fontSize,
                ilh: i.lineHeight, ifont: i.fontFamily.split(',')[0].replace(/"/g, ''),
                lfont: l.fontFamily.split(',')[0].replace(/"/g, ''), lsize: l.fontSize, lweight: l.fontWeight,
                lwrap: l.whiteSpace, ltt: l.textTransform, llines: Math.round(lr.height / parseFloat(l.lineHeight)) };
        });
        check(`${w}px: the theme's font, fill, padding, border, caps and tracking stay out`,
            m.font === 'Raleway' && m.bg === 'rgba(0, 0, 0, 0)' && m.pad === '0px' && m.border === 'none'
            && m.tt === 'none' && m.ls === 'normal', JSON.stringify(m));
        check(`${w}px: a 48px white circle, 2px #006BCF edge`,
            m.iw === 48 && m.ih === 48 && m.ir === '50%' && m.ibg === 'rgb(255, 255, 255)' && m.ibd === '2px rgb(0, 107, 207)', JSON.stringify(m));
        check(`${w}px: the emoji is 24px on an emoji stack, line-height 1`,
            m.isize === '24px' && m.ilh === '24px' && /Emoji/.test(m.ifont), m.ifont + ' ' + m.ilh);
        check(`${w}px: the label is Raleway 12px/700, Title Case, ONE line`,
            m.lfont === 'Raleway' && m.lsize === '12px' && m.lweight === '700' && m.lwrap === 'nowrap'
            && m.ltt === 'none' && m.llines === 1, JSON.stringify(m));
        check(`${w}px: the tap target is at least 48px`, m.w >= 48 && m.h >= 48, `${m.w}x${m.h}`);
        check(`${w}px: the accessible name is the visible label`, (await page.$eval(HUB, axName)) === 'Front Desk',
            await page.$eval(HUB, axName));
        check(`${w}px: one on the hub, one in each of the 3 section headers`, (await page.$$('.dccgg-more--direct')).length === 4);

        const circle = () => page.$eval(HUB + ' .dccgg-fd-icon', (e) => getComputedStyle(e).backgroundColor);
        const labelCol = () => page.$eval(HUB + ' .dccgg-fd-label', (e) => getComputedStyle(e).color);
        await page.hover(HUB); await page.waitForTimeout(350);
        if (w === 390) {
            check('390px: no hover fill on a touch device', (await circle()) === 'rgb(255, 255, 255)', await circle());
        } else {
            check('1280px: hover fills the circle #f08080, label stays dark',
                (await circle()) === 'rgb(240, 128, 128)' && (await labelCol()) === 'rgb(17, 17, 17)',
                (await circle()) + ' / ' + (await labelCol()));
        }
        await page.mouse.move(1, 1); await page.waitForTimeout(250);
        // Pressed, held: this is the only fill a touch guest ever sees, so it
        // must live outside the (hover:hover) guard.
        const bb = await page.$eval(HUB, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; });
        await page.mouse.move(bb.x, bb.y); await page.mouse.down(); await page.waitForTimeout(350);
        check(`${w}px: holding the button down fills the circle`, (await circle()) === 'rgb(240, 128, 128)', await circle());
        // Release AWAY from the button: letting go on it is a click, which opens
        // the dialog and takes the focus this next check is about.
        await page.mouse.move(1, 1); await page.mouse.up(); await page.waitForTimeout(250);
        // A key press first: after a pointer interaction Chromium will not call
        // a programmatic focus "visible", and :focus-visible is what draws the ring.
        await page.keyboard.press('Shift');
        await page.$eval(HUB, (e) => e.focus()); await page.waitForTimeout(300);
        const f = await page.$eval(HUB, (e) => { const c = getComputedStyle(e); return { w: c.outlineWidth, s: c.outlineStyle }; });
        check(`${w}px: focus draws a 3px ring and fills the circle`,
            parseFloat(f.w) >= 3 && f.s === 'solid' && (await circle()) === 'rgb(240, 128, 128)', JSON.stringify(f));
        check(`${w}px: the label never takes the fill colour`, (await labelCol()) === 'rgb(17, 17, 17)');
        await ctx.close();
    }

    console.log('\nB. One tap, straight to the Support Report');
    {
        const { ctx, page } = await open('guest-fd', 390, true);
        check('the hub control is a BUTTON, not a details popover',
            (await page.$$eval('.dccgg-toolbar .dccgg-more', (e) => e.map((x) => x.tagName))).join() === 'BUTTON');
        await page.click(HUB); await page.waitForTimeout(500);
        let st = await page.evaluate(() => { const d = document.querySelector('.dccgg-report-dialog');
            return { open: !!(d && d.open), section: d && d.dataset.section, inside: !!(d && d.contains(document.activeElement)),
                     popover: !!document.querySelector('.dccgg-more[open]') }; });
        check('one tap opens the dialog, with no popover in between', st.open && !st.popover, JSON.stringify(st));
        check('the hub reports no section', st.section === '', String(st.section));
        check('focus moves into the dialog', st.inside);
        await page.click('.dccgg-report-dialog .dccgg-btn-cancel'); await page.waitForTimeout(400);
        check('closing returns focus to the button that opened it',
            await page.evaluate((s) => document.activeElement === document.querySelector(s), HUB));

        await page.click('.dccgg-tile[data-key="wifi"]'); await page.waitForTimeout(600);
        const inPop = '.dccgg-detail:not([hidden]) .dccgg-detail-header-titlebar .dccgg-more--direct';
        check('the popup header carries the same control, inside the portaled stage',
            await page.$eval(inPop, (e) => e.closest('.dccgg-root') === null && !!e.querySelector('.dccgg-fd-icon')));
        await page.click(inPop); await page.waitForTimeout(500);
        st = await page.evaluate(() => { const d = document.querySelector('.dccgg-report-dialog');
            return { open: !!(d && d.open), section: d && d.dataset.section }; });
        check('it reports THAT section, as the popover item did', st.open && st.section === 'wifi', JSON.stringify(st));
        await page.click('.dccgg-report-dialog .dccgg-btn-cancel'); await page.waitForTimeout(400);
        check('and focus returns to the popup header button',
            await page.evaluate((s) => document.activeElement === document.querySelector(s), inPop));
        await ctx.close();
    }

    console.log('\nC. The other single-item actions, and focus with an unfocused tap');
    {
        // A single Print item: the delegated branch added for the direct
        // button, since the popover's own Print listener never sees it.
        const { ctx, page } = await open('guest-fd-print-only', 390, true);
        await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
        check('a single Print item renders one direct button', (await page.$$(HUB)).length === 1);
        await page.click(HUB); await page.waitForTimeout(400);
        check('tapping it prints the guide straight away', (await page.evaluate(() => window.__printed)) === 1,
            String(await page.evaluate(() => window.__printed)));
        await ctx.close();
    }
    {
        // Safari does not focus a button on tap. Simulated by clicking through
        // the DOM, which fires the click without moving focus: the dialog must
        // still hand focus back to the button it came from.
        const { ctx, page } = await open('guest-fd', 390, true);
        await page.evaluate((s) => { document.body.focus(); document.querySelector(s).click(); }, HUB);
        await page.waitForTimeout(500);
        check('a tap that focuses nothing still opens the dialog',
            await page.evaluate(() => { const d = document.querySelector('.dccgg-report-dialog'); return !!(d && d.open); }));
        await page.click('.dccgg-report-dialog .dccgg-btn-cancel'); await page.waitForTimeout(400);
        check('and closing it still puts focus on that button',
            await page.evaluate((s) => document.activeElement === document.querySelector(s), HUB));
        await ctx.close();
    }

    console.log('\nD. Two items keep the popover; none renders nothing');
    {
        const { ctx, page } = await open('guest-more', 390, true);
        check('two items render a details popover wearing the same circle',
            (await page.$$eval('.dccgg-toolbar .dccgg-more', (e) => e.map((x) => x.tagName))).join() === 'DETAILS'
            && !!(await page.$('.dccgg-toolbar .dccgg-more-summary--fd .dccgg-fd-icon')));
        check('named by its label', (await page.$eval('.dccgg-toolbar .dccgg-more > summary', axName)) === 'Front Desk');
        await page.click('.dccgg-toolbar .dccgg-more > summary'); await page.waitForTimeout(400);
        check('tapping opens it and fills the circle',
            await page.evaluate(() => !!document.querySelector('.dccgg-more[open]')
                && getComputedStyle(document.querySelector('.dccgg-toolbar .dccgg-fd-icon')).backgroundColor === 'rgb(240, 128, 128)'));
        check('with both items inside', (await page.$$('.dccgg-toolbar .dccgg-more-item')).length === 2);
        await ctx.close();
    }
    {
        const { ctx, page } = await open('guest', 390, true);
        check('reporting off: no button anywhere', (await page.$$('.dccgg-more')).length === 0);
        await ctx.close();
    }

    console.log('\nE. Print still hides it, and the hub row is where it is');
    {
        const { ctx, page } = await open('guest-fd', 390, true);
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);
        check('the button is hidden when the guide is printed',
            await page.$eval(HUB, (e) => getComputedStyle(e).display === 'none'));
        await page.emulateMedia({ media: 'screen' }); await page.waitForTimeout(200);
        const pos = await page.evaluate(() => ({
            search: Math.round(document.querySelector('.dccgg-search').getBoundingClientRect().top),
            tiles: Math.round(document.querySelector('.dccgg-menu').getBoundingClientRect().top) }));
        // RECORDED, not a budget met: 0.23.5 with the live settings put these at
        // 100 and 169. The owner asked to be told rather than have anything shrunk.
        check(`the search bar sits at ${pos.search} (0.23.5: 100) and the tiles at ${pos.tiles} (0.23.5: 169)`,
            pos.search === 133 && pos.tiles === 202, JSON.stringify(pos));
        await ctx.close();
    }
    check('no JS errors', errors.length === 0, errors[0]);

    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('Failures:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
