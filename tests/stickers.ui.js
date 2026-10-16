/**
 * DCC Guest Guide — section stickers in a real browser (v0.24.1).
 *
 * Reads the rendered colours and shapes rather than the stylesheet, so the
 * mutation runner can see a tile take the wrong colour, lose its rim or
 * animate under reduced motion.
 *
 *   node tests/stickers.ui.js
 *   DCCGG_PLUGIN_DIR=/path/to/dcc-guest-guide DCCGG_UI_SOURCE=1 node tests/stickers.ui.js
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

const PALETTE = { internet: 'rgb(14, 154, 175)', amenities: 'rgb(255, 160, 0)', clubhouse: 'rgb(225, 99, 122)',
    canal: 'rgb(7, 135, 50)', checkout: 'rgb(10, 80, 178)', rules: 'rgb(196, 58, 58)',
    map: 'rgb(77, 176, 234)', review: 'rgb(240, 128, 128)' };
const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-weight:900;text-transform:uppercase;background:#444;color:#fff;border:2px solid #222;border-radius:3px}
 .site .content .entry button{text-transform:uppercase;background:#444;color:#fff}`;
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
${markup}</div></div></div><script>${JS}</script></body></html>`;

let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];
    const requests = [];
    const open = async (kase, w, opts = {}) => {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: 900 } }, opts));
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
        page.on('request', (r) => requests.push(r.url()));
        await page.route('**/admin-ajax.php', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit(kase)) }));
        await page.goto('https://dccgg.test/g/', { waitUntil: 'load' });
        await page.waitForTimeout(400);
        return { ctx, page };
    };

    console.log('\nA. Every section wears its own colour, hub and title alike');
    for (const w of [360, 390, 1280]) {
        const { ctx, page } = await open('live-sections', w);
        const hub = await page.$$eval('.dccgg-tile-wrap', (ws) => ws.map((el) => {
            const ic = el.querySelector('.dccgg-tile-icon'), c = getComputedStyle(ic), r = ic.getBoundingClientRect();
            return { key: el.dataset.sectionKey, bg: c.backgroundColor, border: c.borderTopWidth + ' ' + c.borderTopColor,
                shadow: c.boxShadow, radius: c.borderTopLeftRadius, w: Math.round(r.width), h: Math.round(r.height) };
        }));
        check(`${w}px: eight hub stickers, each its own colour`,
            hub.length === 8 && hub.every((t) => t.bg === PALETTE[t.key]),
            hub.filter((t) => t.bg !== PALETTE[t.key]).map((t) => t.key + '=' + t.bg).join(' '));
        check(`${w}px: each is a circle with a 3px white rim and the two-part shadow`,
            hub.every((t) => t.radius === '50%' && t.border === '3px rgb(255, 255, 255)'
                && /rgba\(0, 0, 0, 0.06\) 0px 0px 0px 2px/.test(t.shadow) && /rgba\(0, 0, 0, 0.18\) 0px 5px 10px/.test(t.shadow)),
            JSON.stringify(hub[0]));
        const titles = await page.$$eval('.dccgg-detail', (ds) => ds.map((el) => {
            const ic = el.querySelector('.dccgg-detail-title-icon'); if (!ic) return null;
            const c = getComputedStyle(ic);
            return { key: el.dataset.key, bg: c.backgroundColor, border: c.borderTopWidth, w: c.width, h: c.height };
        }).filter(Boolean));
        check(`${w}px: every popup title carries the SAME colour as its hub tile`,
            titles.length === 8 && titles.every((t) => t.bg === PALETTE[t.key]),
            titles.filter((t) => t.bg !== PALETTE[t.key]).map((t) => t.key + '=' + t.bg).join(' '));
        check(`${w}px: the mini tile is 34px with a 2px rim`,
            titles.every((t) => t.w === '34px' && t.h === '34px' && t.border === '2px'), JSON.stringify(titles[0]));
        // the glyph: white, from currentColor, scaled where the set says so
        const glyphs = await page.$$eval('.dccgg-tile-icon .dccgg-glyph', (gs) => gs.map((g) => {
            const c = getComputedStyle(g);
            return { cls: g.className.baseVal || g.getAttribute('class'), fill: c.fill, filter: c.filter,
                tf: c.transform, use: !!g.querySelector('use') };
        }));
        check(`${w}px: all eight glyphs are white, from currentColor, with the drop-shadow`,
            glyphs.length === 8 && glyphs.every((g) => g.fill === 'rgb(255, 255, 255)' && /drop-shadow/.test(g.filter) && g.use),
            JSON.stringify(glyphs[0]));
        check(`${w}px: the Material washer is trimmed, the Phosphor seven are not`,
            glyphs.filter((g) => /laundry/.test(g.cls)).every((g) => g.tf !== 'none')
            && glyphs.filter((g) => /devices|fish|gavel/.test(g.cls)).every((g) => g.tf === 'none' || g.tf === 'matrix(1, 0, 0, 1, 0, 0)'),
            glyphs.map((g) => g.cls.split(' ')[1] + ':' + g.tf).join(' '));
        await ctx.close();
    }

    console.log('\nAB. The title never runs under the Front Desk button');
    for (const w of [360, 390, 1280]) {
        const { ctx, page } = await open('live-sections', w);
        const keys = await page.$$eval('.dccgg-tile-wrap', (ws) => ws.map((d) => d.dataset.sectionKey));
        const bad = [];
        let maxBar = 0;
        for (const k of keys) {
            await page.click(`.dccgg-tile[data-key="${k}"]`); await page.waitForTimeout(420);
            const r = await page.evaluate((kk) => {
                const d = document.querySelector(`.dccgg-detail[data-key="${kk}"]:not([hidden])`);
                const t = d.querySelector('.dccgg-detail-title');
                const m = d.querySelector('.dccgg-detail-header-titlebar .dccgg-more');
                const bar = d.querySelector('.dccgg-detail-header-titlebar');
                return { over: Math.round(t.getBoundingClientRect().right - m.getBoundingClientRect().left),
                         bar: Math.round(bar.getBoundingClientRect().height),
                         mini: !!d.querySelector('.dccgg-detail-title-icon') };
            }, k);
            if (r.over > 0 || !r.mini) bad.push(`${k}:+${r.over}${r.mini ? '' : ' no-tile'}`);
            maxBar = Math.max(maxBar, r.bar);
            const back = await page.$('.dccgg-detail:not([hidden]) .dccgg-back');
            if (back) { await back.click(); await page.waitForTimeout(350); }
        }
        check(`${w}px: no section title overlaps the button, and all 8 carry a mini tile`, bad.length === 0, bad.join(' '));
        check(`${w}px: every title bar is 48px or less (tallest ${maxBar})`, maxBar <= 48, String(maxBar));
        await ctx.close();
    }

    console.log('\nB. One sprite, no outside request');
    {
        requests.length = 0;
        const { ctx, page } = await open('live-sections', 390);
        const sprite = await page.evaluate(() => ({
            sprites: document.querySelectorAll('.dccgg-sprite').length,
            symbols: document.querySelectorAll('.dccgg-sprite symbol').length,
            uses: document.querySelectorAll('use[href^="#dccgg-sym-"]').length,
            unresolved: [...document.querySelectorAll('use[href^="#dccgg-sym-"]')]
                .filter((u) => !document.getElementById(u.getAttribute('href').slice(1))).length,
            // The ELEMENT having a box proves nothing: a symbol whose viewBox
            // origin disagrees with the wrapper's renders off-viewport and the
            // <svg> still measures full size. Ask where the ink actually is,
            // inside the wrapper's own coordinate system.
            painted: [...document.querySelectorAll('.dccgg-tile-icon .dccgg-glyph')].filter((g) => {
                const u = g.querySelector('use'); if (!u) return false;
                let bb; try { bb = u.getBBox(); } catch (e) { return false; }
                const vb = g.viewBox.baseVal;
                return bb.width > 0 && bb.height > 0
                    && bb.x + bb.width > vb.x && bb.x < vb.x + vb.width
                    && bb.y + bb.height > vb.y && bb.y < vb.y + vb.height;
            }).length,
        }));
        check('one sprite, eight symbols, sixteen uses, none unresolved',
            sprite.sprites === 1 && sprite.symbols === 8 && sprite.uses === 16 && sprite.unresolved === 0, JSON.stringify(sprite));
        check('and all eight hub glyphs actually paint', sprite.painted === 8, String(sprite.painted));
        // Pixels, not geometry: every sticker must actually show white ink.
        const ink = [];
        for (const key of Object.keys(PALETTE)) {
            const el = await page.$(`.dccgg-tile-wrap[data-section-key="${key}"] .dccgg-tile-icon`);
            const shot = (await el.screenshot()).toString('base64');
            const white = await page.evaluate(async (b64) => {
                const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
                const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
                const g = c.getContext('2d'); g.drawImage(img, 0, 0);
                // the middle half, so the white RIM cannot be mistaken for ink
                const x0 = Math.round(img.width * 0.25), y0 = Math.round(img.height * 0.25);
                const d = g.getImageData(x0, y0, Math.round(img.width * 0.5), Math.round(img.height * 0.5)).data;
                let n = 0;
                for (let i = 0; i < d.length; i += 4) { if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235 && d[i + 3] > 200) n++; }
                return n;
            }, shot);
            if (white < 30) ink.push(`${key}=${white}px`);
        }
        check('every sticker actually shows its white glyph', ink.length === 0, ink.join(' '));
        const outside = requests.filter((u) => !/^https:\/\/dccgg\.test\//.test(u) && !/^data:/.test(u));
        check('the page fetches nothing from any outside host', outside.length === 0, outside.slice(0, 3).join(' '));
        check('no icon font and no Google Fonts', !requests.some((u) => /fonts\.g|\.woff|\.ttf|cdn/i.test(u)),
            requests.filter((u) => /fonts\.g|\.woff|\.ttf|cdn/i.test(u)).slice(0, 2).join(' '));
        await ctx.close();
    }

    console.log('\nC. Hover, focus and reduced motion');
    {
        const { ctx, page } = await open('live-sections', 1280);
        const read = (sel) => page.$eval(sel, (e) => getComputedStyle(e).boxShadow);
        const sel = '.dccgg-tile-wrap[data-section-key="review"] .dccgg-tile-icon';
        const rest = await read(sel);
        await page.hover('.dccgg-tile-wrap[data-section-key="review"] .dccgg-tile');
        await page.waitForTimeout(400);
        const hov = await read(sel);
        const bg = await page.$eval(sel, (e) => getComputedStyle(e).backgroundColor);
        check('hover deepens the shadow', hov !== rest && /0px 8px 16px/.test(hov), hov);
        check('and does NOT recolour — Review Us stays its own coral', bg === PALETTE.review, bg);
        // Every tile, not just that one: a coral hover would be invisible on
        // Review Us precisely because Review Us is already coral.
        const drift = [];
        for (const key of Object.keys(PALETTE)) {
            const t = `.dccgg-tile-wrap[data-section-key="${key}"]`;
            await page.hover(t + ' .dccgg-tile'); await page.waitForTimeout(260);
            const c = await page.$eval(t + ' .dccgg-tile-icon', (e) => getComputedStyle(e).backgroundColor);
            if (c !== PALETTE[key]) drift.push(`${key}=${c}`);
        }
        check('no tile changes colour on hover', drift.length === 0, drift.join(' '));
        await page.mouse.move(1, 1); await page.waitForTimeout(250);
        await page.mouse.move(1, 1); await page.waitForTimeout(250);
        await page.keyboard.press('Shift');
        await page.$eval('.dccgg-tile-wrap[data-section-key="review"] .dccgg-tile', (e) => e.focus());
        await page.waitForTimeout(300);
        const foc = await read(sel);
        check('keyboard focus adds a ring outside the white rim', /rgba?\(15, 109, 191[^)]*\) 0px 0px 0px (5\.9|6)/.test(foc), foc);
        await ctx.close();
    }
    {
        const { ctx, page } = await open('live-sections', 1280, { reducedMotion: 'reduce' });
        const tr = await page.$eval('.dccgg-tile-icon', (e) => getComputedStyle(e).transitionDuration);
        check('under reduced motion the sticker does not animate', tr === '0s', tr);
        await page.hover('.dccgg-tile');
        await page.waitForTimeout(300);
        const anim = await page.$eval('.dccgg-tile-icon', (e) => getComputedStyle(e).animationName);
        check('and the wiggle does not run', anim === 'none', anim);
        await ctx.close();
    }

    console.log('\nD. A guide still on Font Awesome, and print');
    {
        const { ctx, page } = await open('live-sections-fa', 390);
        check('no sprite, because no bundled glyph was used',
            await page.evaluate(() => document.querySelectorAll('.dccgg-sprite').length === 0));
        check('but the stickers are all there',
            await page.evaluate((P) => [...document.querySelectorAll('.dccgg-tile-wrap')]
                .every((el) => getComputedStyle(el.querySelector('.dccgg-tile-icon')).backgroundColor === P[el.dataset.sectionKey]), PALETTE));
        await ctx.close();
    }
    {
        const { ctx, page } = await open('live-sections', 390);
        const before = await page.$eval('.dccgg-menu', (e) => getComputedStyle(e).display);
        await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(200);
        const after = await page.$eval('.dccgg-menu', (e) => getComputedStyle(e).display);
        check(`print: the tile grid is ${after === 'none' ? 'hidden, as before' : 'shown, as before'}`,
            before === 'grid' && after === 'none', `${before} -> ${after}`);
        await ctx.close();
    }
    check('no JS errors and nothing logged to the console', errors.length === 0, errors[0]);

    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('Failures:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
