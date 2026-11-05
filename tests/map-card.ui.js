/**
 * DCC Guest Guide — the Property Map card and its full-screen layer (v0.27.8).
 *
 *   A. the swap: a card where the My Maps embed was, and NO iframe until asked;
 *   B. the request count, which is the whole point of the release;
 *   C. the layer: on <body>, never moved, iframe kept alive across reopens;
 *   D. close by X, by Esc, and by the back gesture;
 *   E. focus trapped, focus returned, page scroll locked;
 *   F. the two buttons: one row, equal height, no wrap, at 320;
 *   G. "Where to Launch" and the control iframes are untouched.
 *
 *   node tests/map-card.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/map-card.ui.js
 *
 * EVERY REQUEST IS COUNTED, NOT JUST THE ONES THAT SUCCEED. google.com is
 * refused by this container's proxy, so the embed can never load here — but
 * a stub cannot change the browser's DECISION to fetch, and that decision is
 * the thing under test. Requests are recorded and then fulfilled with a tiny
 * stub document so nothing hangs.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { frontEndJs, routeChunks } = require('./_bundles');

const TESTS = __dirname;
const PLUGIN = (process.env.DCCGG_PLUGIN_DIR || path.join(TESTS, '../dcc-guest-guide')).replace(/\/$/, '');
const A = PLUGIN + '/assets/';
const SRC = process.env.DCCGG_UI_SOURCE === '1';
const CSS = SRC ? fs.readFileSync(A + 'css/widget.css', 'utf8')
    : fs.readFileSync(A + 'css/widget.min.css', 'utf8') + fs.readFileSync(A + 'css/widget-guest.min.css', 'utf8');
const JS = frontEndJs(A, SRC);
const MARKUP = execFileSync('php', [path.join(TESTS, '_emit-guide.php'), 'all-on'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });

const KIT = `
 html{font-weight:700;line-height:1.8}
 body{margin:0;font-family:Raleway,system-ui,sans-serif}
 .elementor-kit-331 button{font-size:18px;font-weight:900;letter-spacing:1.5px;
   text-transform:capitalize;border-style:groove;border-width:0 0 0 0;border-radius:30px}
 .elementor-kit-331 a{color:#006BCF}
`;

const isMap = (u) => /google\.com\/maps/.test(u);
let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function openGuide(browser, width) {
    const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 },
        isMobile: width < 700, hasTouch: width < 700, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const reqs = [];
    page.on('request', (r) => reqs.push({ u: r.url(), t: Date.now() }));
    await routeChunks(page, A, SRC);
    await page.route('**/*', (r) => {
        const u = r.request().url();
        if (/^data:|^blob:/.test(u)) return r.continue();
        if (isMap(u)) {
            return r.fulfill({ status: 200, contentType: 'text/html',
                body: '<body style="margin:0;background:#dfe3e6">map</body>' });
        }
        return r.fulfill({ status: 200, contentType: 'image/gif',
            body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
    });
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width">
        <style>${KIT}</style><style>${CSS}</style></head><body class="elementor-kit-331">
        <div class="elementor-element elementor-element-2afb24b dccgg-layout-grid">${MARKUP}</div>
        <div style="height:2000px"></div></body></html>`, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: 'window.dccggChunks={base:"https://dccgg.test/a/",ver:"dev",min:false};' });
    await page.addScriptTag({ content: JS });
    await page.waitForTimeout(500);
    return { ctx, page, reqs, since: (t) => reqs.filter((r) => isMap(r.u) && r.t >= t).length };
}

/**
 * Click the VISIBLE map card button.
 *
 * There are two cards — Amenities Map and Property Map — and only the one
 * in the open section has a box. A plain page.click('.dccgg-mapcard-open')
 * resolves to the first in the DOM, which is usually the hidden one, and
 * waits 30s for it to become visible. Same reason the geometry below is
 * read from the visible pair rather than the first pair.
 */
async function clickVisibleOpen(page) {
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('.dccgg-mapcard-open'))
            .find((x) => x.getClientRects().length);
        if (!b) throw new Error('no visible .dccgg-mapcard-open');
        b.click();
    });
}

async function openSection(page, re) {
    const tiles = await page.$$('.dccgg-tile');
    for (const t of tiles) {
        const s = (await t.textContent()).replace(/\s+/g, ' ').trim();
        if (re.test(s)) { await t.click(); await page.waitForTimeout(500); return s; }
    }
    return null;
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

    console.log('\nA. The embed is swapped for a card');
    {
        const { ctx, page } = await openGuide(browser, 390);
        const s = await page.evaluate(() => ({
            cards: document.querySelectorAll('.dccgg-mapcard').length,
            embedIframes: Array.from(document.querySelectorAll('iframe'))
                .filter((f) => /maps\/d\/embed/.test(f.getAttribute('src') || '')).length,
            otherIframes: Array.from(document.querySelectorAll('iframe'))
                .filter((f) => !/maps\/d\/embed/.test(f.getAttribute('src') || '')).length,
            img: (() => { const i = document.querySelector('.dccgg-mapcard-img');
                return i ? { w: i.getAttribute('width'), h: i.getAttribute('height'),
                    loading: i.getAttribute('loading') } : null; })(),
            caption: (document.querySelector('.dccgg-mapcard-caption') || {}).textContent,
            openLabel: (document.querySelector('.dccgg-mapcard-open') || {}).textContent.trim(),
            extLabel: (document.querySelector('.dccgg-mapcard-ext') || {}).textContent.trim(),
            extHref: (document.querySelector('.dccgg-mapcard-ext') || {}).getAttribute('href'),
            extTarget: (document.querySelector('.dccgg-mapcard-ext') || {}).getAttribute('target'),
            extRel: (document.querySelector('.dccgg-mapcard-ext') || {}).getAttribute('rel'),
        }));
        check('two cards render (Amenities Map and Property Map)', s.cards === 2, String(s.cards));
        check('NO My Maps iframe exists before any tap', s.embedIframes === 0, String(s.embedIframes));
        check('other iframes in templates are untouched', s.otherIframes >= 2, String(s.otherIframes));
        check('the picture carries width, height and loading=lazy',
            s.img && s.img.w === '900' && s.img.h === '591' && s.img.loading === 'lazy', JSON.stringify(s.img));
        check('the caption reads "Property Map"', s.caption === 'Property Map', JSON.stringify(s.caption));
        check('the filled button is Title Case "Open Full Screen"',
            s.openLabel === 'Open Full Screen', JSON.stringify(s.openLabel));
        check('the outline button reads "Google Maps ↗"',
            /^Google Maps\s*↗$/.test(s.extLabel), JSON.stringify(s.extLabel));
        check('it points at the VIEWER url, not the embed',
            /maps\/d\/viewer\?mid=/.test(s.extHref || ''), String(s.extHref));
        check('and opens in a new tab, safely',
            s.extTarget === '_blank' && /noopener/.test(s.extRel || ''), `${s.extTarget} ${s.extRel}`);
        await ctx.close();
    }

    console.log('\nB. The request count — the point of the release');
    {
        const t0 = Date.now();
        const { ctx, page, since } = await openGuide(browser, 390);
        await page.waitForTimeout(900);
        check('0 map requests on page load', since(t0) === 0, String(since(t0)));
        let t = Date.now();
        await openSection(page, /^Internet/);
        check('0 after opening a section with no map in it', since(t) === 0, String(since(t)));
        t = Date.now();
        await page.evaluate(() => { const b = document.querySelector('.dccgg-back'); if (b) b.click(); });
        await page.waitForTimeout(500);
        check('0 after closing it', since(t) === 0, String(since(t)));
        t = Date.now();
        await openSection(page, /^Map/);
        check('0 after opening the Map section itself', since(t) === 0, String(since(t)));
        t = Date.now();
        await clickVisibleOpen(page);
        await page.waitForTimeout(900);
        check('exactly 1 on the first Open Full Screen', since(t) === 1, String(since(t)));
        t = Date.now();
        await page.evaluate(() => document.querySelector('.dccgg-maplayer-close').click());
        await page.waitForTimeout(500);
        await clickVisibleOpen(page);
        await page.waitForTimeout(900);
        check('0 on reopening — the iframe is kept alive', since(t) === 0, String(since(t)));
        await ctx.close();
    }

    console.log('\nC. The layer lives on <body> and is never moved');
    {
        const { ctx, page } = await openGuide(browser, 390);
        await openSection(page, /^Map/);
        await clickVisibleOpen(page);
        await page.waitForTimeout(700);
        const a = await page.evaluate(() => {
            const l = document.querySelector('.dccgg-maplayer');
            const cs = getComputedStyle(l);
            return { parent: l.parentElement.tagName, z: cs.zIndex, position: cs.position,
                height: cs.height, insetTop: cs.top,
                frames: l.querySelectorAll('iframe').length };
        });
        check('its parent is <body>', a.parent === 'BODY', a.parent);
        check('it is fixed and full-bleed', a.position === 'fixed' && a.insetTop === '0px', JSON.stringify(a));
        check('it sits above the sheet and the tab bar', Number(a.z) > 10010, a.z);
        check('it holds exactly one iframe', a.frames === 1, String(a.frames));
        // close and reopen, having moved the stage by opening another section
        await page.evaluate(() => document.querySelector('.dccgg-maplayer-close').click());
        await page.waitForTimeout(400);
        await page.evaluate(() => { const b = document.querySelector('.dccgg-back'); if (b) b.click(); });
        await page.waitForTimeout(400);
        await openSection(page, /^Amenities/);
        await clickVisibleOpen(page);
        await page.waitForTimeout(600);
        const b = await page.evaluate(() => {
            const l = document.querySelector('.dccgg-maplayer');
            return { parent: l.parentElement.tagName, frames: l.querySelectorAll('iframe').length,
                layers: document.querySelectorAll('.dccgg-maplayer').length };
        });
        check('after the stage has been portaled twice it is STILL on <body>',
            b.parent === 'BODY', b.parent);
        check('and there is still exactly one layer and one iframe',
            b.layers === 1 && b.frames === 1, JSON.stringify(b));
        await ctx.close();
    }

    console.log('\nD. Closing: the X, Esc, and the back gesture');
    for (const how of ['close button', 'Escape', 'back gesture']) {
        const { ctx, page } = await openGuide(browser, 390);
        await openSection(page, /^Map/);
        await clickVisibleOpen(page);
        await page.waitForTimeout(600);
        const openNow = await page.evaluate(() => !document.querySelector('.dccgg-maplayer').hidden);
        check(`${how}: the layer is open to begin with`, openNow);
        if (how === 'close button') { await page.evaluate(() => document.querySelector('.dccgg-maplayer-close').click()); }
        else if (how === 'Escape') { await page.keyboard.press('Escape'); }
        else { await page.goBack(); }
        await page.waitForTimeout(600);
        const closed = await page.evaluate(() => document.querySelector('.dccgg-maplayer').hidden);
        check(`${how}: it closes`, closed === true, String(closed));
        await ctx.close();
    }

    console.log('\nE. Focus and scroll');
    {
        const { ctx, page } = await openGuide(browser, 390);
        await openSection(page, /^Map/);
        const lockedBefore = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
        await clickVisibleOpen(page);
        await page.waitForTimeout(700);
        const s = await page.evaluate(() => ({
            focusInside: document.querySelector('.dccgg-maplayer').contains(document.activeElement),
            focusTag: document.activeElement.tagName + '.' + (document.activeElement.className || ''),
            lockClass: document.documentElement.classList.contains('dccgg-map-open'),
            htmlOverflow: getComputedStyle(document.documentElement).overflow,
            bodyOverflow: getComputedStyle(document.body).overflow,
            closeBox: (() => { const b = document.querySelector('.dccgg-maplayer-close').getBoundingClientRect();
                return [Math.round(b.width), Math.round(b.height)]; })(),
        }));
        check('focus moves into the layer', s.focusInside, s.focusTag);
        check('it lands on the title, not the close button',
            /dccgg-maplayer-title/.test(s.focusTag), s.focusTag);
        check('page scroll is locked while open',
            s.lockClass && s.htmlOverflow === 'hidden' && s.bodyOverflow === 'hidden',
            `${lockedBefore} -> ${s.htmlOverflow}/${s.bodyOverflow} class=${s.lockClass}`);
        check('the close button is at least 44x44',
            s.closeBox[0] >= 44 && s.closeBox[1] >= 44, JSON.stringify(s.closeBox));
        // Tab must not escape the layer. TWO presses was not enough to tell
        // a trap from no trap: without one, the first Tab lands on the close
        // button anyway and the second is still inside. Press it enough
        // times to walk out of a two-stop layer, and require that every
        // landing is still the close button — that is what cycling means.
        const walk = [];
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            walk.push(await page.evaluate(() => {
                const l = document.querySelector('.dccgg-maplayer');
                return l.contains(document.activeElement)
                    ? (document.activeElement.className || document.activeElement.tagName) : 'ESCAPED';
            }));
        }
        check('Tab never escapes the layer, however often it is pressed',
            walk.every((x) => x !== 'ESCAPED'), JSON.stringify(walk));
        check('and it keeps landing on the close button',
            walk.every((x) => /dccgg-maplayer-close/.test(x)), JSON.stringify(walk));
        await page.evaluate(() => document.querySelector('.dccgg-maplayer-close').click());
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => ({
            lockClass: document.documentElement.classList.contains('dccgg-map-open'),
            focus: document.activeElement.className || document.activeElement.tagName,
        }));
        // The SHEET is still open behind the layer and it locks scrolling
        // too, so the raw overflow stays hidden either way — the thing the
        // layer owns is its own class, and that is what must come off.
        check('the layer releases its own scroll lock on close', after.lockClass === false,
            String(after.lockClass));
        check('focus returns to the button that opened it',
            /dccgg-mapcard-open/.test(after.focus), String(after.focus));
        await ctx.close();
    }

    console.log('\nE2. Tapping the PICTURE opens the layer too');
    {
        // Rob asked for this explicitly, and nothing else in the suite
        // exercised it — every other case clicks the Open button, so a
        // handler that had dropped .dccgg-mapcard-shot passed unnoticed.
        const { ctx, page } = await openGuide(browser, 390);
        await openSection(page, /^Map/);
        await page.evaluate(() => {
            const s = Array.from(document.querySelectorAll('.dccgg-mapcard-shot'))
                .find((x) => x.getClientRects().length);
            if (s) s.click();
        });
        await page.waitForTimeout(800);
        const open = await page.evaluate(() => {
            const l = document.querySelector('.dccgg-maplayer');
            return !!l && !l.hidden;
        });
        check('tapping the picture opens the full-screen layer', open, String(open));
        await ctx.close();
    }

    console.log('\nF. The two buttons at 320: one row, equal height, no wrap');
    for (const width of [320, 390, 1440]) {
        const { ctx, page } = await openGuide(browser, width);
        await openSection(page, /^Map/);
        const g = await page.evaluate(() => {
            const vis = (el) => el.getClientRects().length > 0;
            const o = Array.from(document.querySelectorAll('.dccgg-mapcard-open')).find(vis);
            const e = Array.from(document.querySelectorAll('.dccgg-mapcard-ext')).find(vis);
            const ob = o.getBoundingClientRect(), eb = e.getBoundingClientRect();
            // A wrapped label makes the button TALLER; counting Range rects
            // counted the icon span as a second "line" at every width.
            const oneLine = (el) => {
                const cs = getComputedStyle(el);
                const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
                    + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
                return el.getBoundingClientRect().height - chrome
                    < parseFloat(cs.lineHeight) * 1.6;
            };
            return { oh: Math.round(ob.height), eh: Math.round(eb.height),
                sameRow: Math.abs(ob.top - eb.top) < 1,
                oFont: getComputedStyle(o).fontSize, eFont: getComputedStyle(e).fontSize,
                oTransform: getComputedStyle(o).textTransform,
                eBorder: getComputedStyle(e).borderTopWidth,
                oBorder: getComputedStyle(o).borderTopWidth,
                oOneLine: oneLine(o), eOneLine: oneLine(e),
                oScroll: o.scrollWidth - Math.round(ob.width),
                eScroll: e.scrollWidth - Math.round(eb.width),
            };
        });
        check(`@${width} both buttons are on one row`, g.sameRow, JSON.stringify(g));
        check(`@${width} they are exactly the same height`, g.oh === g.eh, `${g.oh} vs ${g.eh}`);
        check(`@${width} the kit's capitalize is neutralised`, g.oTransform === 'none', g.oTransform);
        check(`@${width} the outline button keeps its 2px border`, g.eBorder === '2px', g.eBorder);
        check(`@${width} the labels are 15px`, g.oFont === '15px' && g.eFont === '15px', `${g.oFont}/${g.eFont}`);
        check(`@${width} neither label wraps`, g.oOneLine && g.eOneLine,
            `open=${g.oOneLine} ext=${g.eOneLine} h=${g.oh}`);
        check(`@${width} neither label overflows its button`,
            g.oScroll <= 1 && g.eScroll <= 1, `${g.oScroll}/${g.eScroll}px`);
        await ctx.close();
    }

    console.log('\nG. Nothing else moved');
    {
        const { ctx, page } = await openGuide(browser, 390);
        const s = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.dccgg-item'));
            const byTitle = (t) => items.find((i) => i.getAttribute('data-item-title') === t);
            const wtl = byTitle('Where to Launch');
            const mapItems = ['Amenities Map', 'Property Map'].map(byTitle);
            return {
                parkingKeepsLink: (() => { const p = byTitle('Parking Map');
                    return !!(p && p.querySelector('.dccgg-map')); })(),
                parkingHasCard: (() => { const p = byTitle('Parking Map');
                    return !!(p && p.querySelector('.dccgg-mapcard')); })(),
                wtlHasMapLink: !!(wtl && wtl.querySelector('.dccgg-map')),
                wtlHref: wtl && wtl.querySelector('.dccgg-map') ? wtl.querySelector('.dccgg-map').getAttribute('href') : null,
                wtlHasCard: !!(wtl && wtl.querySelector('.dccgg-mapcard')),
                mapItemsKeepDuplicateLink: mapItems.filter((i) => i && i.querySelector('.dccgg-map')).length,
                totalMapLinks: document.querySelectorAll('.dccgg-map').length,
            };
        });
        check('"Where to Launch" keeps its own View in Maps button', s.wtlHasMapLink);
        check('...pointing at its maps SEARCH, unchanged',
            /maps\/search/.test(s.wtlHref || ''), String(s.wtlHref));
        check('...and it has no map card', !s.wtlHasCard);
        check('"Parking Map" has "Map" in its title but no card, and KEEPS its link',
            s.parkingKeepsLink && !s.parkingHasCard,
            `link=${s.parkingKeepsLink} card=${s.parkingHasCard}`);
        check('the two card items drop their duplicate link',
            s.mapItemsKeepDuplicateLink === 0, String(s.mapItemsKeepDuplicateLink));
        check('so exactly two View in Maps buttons are left in the guide',
            s.totalMapLinks === 2, String(s.totalMapLinks));
        await ctx.close();
    }

    await browser.close();
    console.log('');
    if (fail) { console.log(`FAILED (${fail}):`); failures.forEach((f) => console.log(`  - ${f}`)); }
    console.log(`${fail ? '✗' : '✓'} map-card: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
