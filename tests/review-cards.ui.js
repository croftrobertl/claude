/**
 * DCC Guest Guide — the Review Us cards (v0.27.9).
 *
 *   A. one heading only, the intro line, three cards in order;
 *   B. every link: destination, target, rel;
 *   C. the look — sizes, weights, border, radius, height, no green chrome;
 *   D. the desktop cap and the centred column with left-aligned text;
 *   E. states: press, focus ring, and hover ONLY on hover devices;
 *   F. the thank-you tick, including with storage blocked;
 *   G. accessible names, before and after the tick;
 *   H. the marks are inline and cost no request.
 *
 *   node tests/review-cards.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/review-cards.ui.js
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

// The theme's coral, which is the thing the (0,4,0) rules have to retire.
const KIT = `
 html{font-weight:700;line-height:1.8}
 body{margin:0;font-family:Raleway,system-ui,sans-serif}
 .elementor-kit-331 a{color:#006BCF}
 .elementor-kit-331 a:hover,.elementor-kit-331 a:focus,.elementor-kit-331 a:active{
   background-color:#F08080;color:#FFF}
 .elementor-kit-331 button{font-weight:900;text-transform:capitalize;border-width:0}
`;

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function open(browser, width, { hover = false, blockStorage = false } = {}) {
    const ctx = await browser.newContext({
        viewport: { width, height: width >= 768 ? 900 : 844 },
        isMobile: !hover && width < 700, hasTouch: !hover && width < 700,
        deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    if (blockStorage) {
        // A guest with site data blocked: every localStorage access throws,
        // which is what Safari does in Lockdown/private configurations.
        await page.addInitScript(() => {
            const boom = () => { throw new DOMException('denied', 'SecurityError'); };
            Object.defineProperty(window, 'localStorage', {
                get() { return { getItem: boom, setItem: boom, removeItem: boom }; },
            });
        });
    }
    await routeChunks(page, A, SRC);
    await page.route('**/*', (r) => {
        if (r.request().url().startsWith('https://dccgg.test/g/')) return r.fallback();
        return r.fulfill({ status: 200, contentType: 'image/gif',
            body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
    });
    await page.route('https://dccgg.test/g/**', (r) => r.fulfill({
        status: 200, contentType: 'text/html',
        body: `<!doctype html><html><head><meta name="viewport" content="width=device-width">
        <style>${KIT}</style><style>${CSS}</style></head><body class="elementor-kit-331">
        <div class="elementor-element elementor-element-2afb24b dccgg-layout-grid">${MARKUP}</div>
        </body></html>` }));
    await page.goto('https://dccgg.test/g/review', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: 'window.dccggChunks={base:"https://dccgg.test/a/",ver:"dev",min:false};' });
    await page.addScriptTag({ content: JS });
    await page.waitForTimeout(450);
    return { ctx, page, requests };
}

async function openReview(page) {
    // The panel may already be open: after a reload the guide reopens the
    // section the guest left from (brief item 10), and the tile behind it
    // is then not clickable. The first version of this always clicked and
    // timed out — on its own feature working.
    if (await page.evaluate(() => !!document.querySelector('.dccgg-detail:not([hidden])'))) return true;
    const tiles = await page.$$('.dccgg-tile');
    for (const t of tiles) {
        const s = (await t.textContent()).replace(/\s+/g, ' ').trim();
        if (/^Review/.test(s)) { await t.click(); await page.waitForTimeout(600); return true; }
    }
    return false;
}

const READ = () => {
    const panel = document.querySelector('.dccgg-detail:not([hidden])');
    if (!panel) return { noPanel: true, cards: [], headings: [], weights: [] };
    const cards = Array.from(panel.querySelectorAll('.dccgg-rev-card'));
    const cs = (e, p) => getComputedStyle(e)[p];
    const rect = (e) => e.getBoundingClientRect();
    const wrap = panel.querySelector('.dccgg-rev');
    const intro = panel.querySelector('.dccgg-rev-intro');
    return {
        headings: Array.from(panel.querySelectorAll('h2, h3'))
            .filter((h) => h.getClientRects().length)
            .map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
        introText: intro ? intro.textContent.trim() : null,
        introAlign: intro ? cs(intro, 'textAlign') : null,
        introWrap: intro ? cs(intro, 'textWrap') : null,
        wrapWidth: wrap ? Math.round(rect(wrap).width) : null,
        panelWidth: Math.round(rect(panel).width),
        wrapCentred: wrap ? (() => {
            const p = wrap.parentElement.getBoundingClientRect(); const w = rect(wrap);
            return Math.abs((w.left - p.left) - (p.right - w.right)) <= 1;
        })() : null,
        cards: cards.map((c) => {
            const name = c.querySelector('.dccgg-rev-name');
            const sub = c.querySelector('.dccgg-rev-sub');
            const mark = c.querySelector('.dccgg-rev-mark');
            const arrow = c.querySelector('.dccgg-rev-arrow');
            return {
                key: c.getAttribute('data-dccgg-review'),
                href: c.getAttribute('href'),
                target: c.getAttribute('target'),
                rel: c.getAttribute('rel'),
                label: c.getAttribute('aria-label'),
                name: name ? name.textContent.trim() : null,
                sub: sub ? sub.textContent.trim() : null,
                subHidden: sub ? sub.getAttribute('aria-hidden') === 'true' : null,
                arrowHidden: arrow ? arrow.getAttribute('aria-hidden') === 'true' : null,
                markHidden: mark ? mark.getAttribute('aria-hidden') === 'true' : null,
                h: Math.round(rect(c).height),
                textAlign: cs(c, 'textAlign'),
                border: cs(c, 'borderTopWidth') + ' ' + cs(c, 'borderTopColor'),
                radius: cs(c, 'borderTopLeftRadius'),
                nameFont: name ? cs(name, 'fontSize') + '/' + cs(name, 'fontWeight') : null,
                subFont: sub ? cs(sub, 'fontSize') + '/' + cs(sub, 'fontWeight') : null,
                markSize: mark ? Math.round(rect(mark).width) + 'x' + Math.round(rect(mark).height) : null,
                markInk: mark ? cs(mark, 'backgroundColor') : null,
                arrowColour: arrow ? cs(arrow, 'color') : null,
                arrowInlineSvg: !!(arrow && arrow.querySelector('svg')),
                reviewed: c.getAttribute('data-dccgg-reviewed'),
            };
        }),
        weights: Array.from(panel.querySelectorAll('.dccgg-rev *'))
            .map((e) => cs(e, 'fontWeight')).filter((w) => Number(w) >= 800),
    };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

    console.log('\nA. One heading, one intro line, three cards in order');
    {
        const { ctx, page } = await open(browser, 390);
        await openReview(page);
        const r = await page.evaluate(READ);
        check('the section heading is the ONLY heading in the panel',
            r.headings.length === 1 && /Review Us/.test(r.headings[0]), JSON.stringify(r.headings));
        check('the intro line reads as asked',
            r.introText === 'Pick wherever you usually leave reviews.', JSON.stringify(r.introText));
        check('it is centred and balanced',
            r.introAlign === 'center' && r.introWrap === 'balance', `${r.introAlign}/${r.introWrap}`);
        check('three cards, in the order Google / Tripadvisor / Yelp',
            JSON.stringify(r.cards.map((c) => c.key)) === '["google","tripadvisor","yelp"]',
            JSON.stringify(r.cards.map((c) => c.key)));
        check('the old green Click To Review button is gone',
            !/Click To Review/i.test(await page.content()));
        await ctx.close();
    }

    console.log('\nB. Every link');
    {
        const { ctx, page } = await open(browser, 390);
        await openReview(page);
        const r = await page.evaluate(READ);
        const want = {
            google: 'https://g.page/r/CXzCQFqIBRlPEBk/review',
            tripadvisor: 'https://www.tripadvisor.com/UserReviewEdit-g34681-d33118630-Dora_Canal_Court-Tavares_Lake_County_Florida.html',
            yelp: 'https://www.yelp.com/writeareview/biz/QB_o9zAgu-JcKiTvXCx4VA',
        };
        r.cards.forEach((c) => {
            check(`${c.key}: the destination is right`, c.href === want[c.key], String(c.href));
            check(`${c.key}: opens in a new tab, safely`,
                c.target === '_blank' && /noopener/.test(c.rel || ''), `${c.target} ${c.rel}`);
        });
        await ctx.close();
    }

    console.log('\nC. The look');
    {
        const { ctx, page } = await open(browser, 390);
        await openReview(page);
        const r = await page.evaluate(READ);
        r.cards.forEach((c) => {
            check(`${c.key}: name 16px/700`, c.nameFont === '16px/700', String(c.nameFont));
            check(`${c.key}: sub-line 13px/500`, c.subFont === '13px/500', String(c.subFont));
            check(`${c.key}: at least 56px tall`, c.h >= 56, `${c.h}px`);
            const bw = parseFloat(c.border);
            check(`${c.key}: border colour is #dbe3ee`,
                /rgb\(219, 227, 238\)/.test(c.border), String(c.border));
            check(`${c.key}: border is hairline (1-1.5px used)`,
                bw >= 1 && bw <= 1.5, String(c.border));
            check(`${c.key}: 16px radius`, c.radius === '16px', String(c.radius));
            check(`${c.key}: arrow is site blue #0A57C2`,
                c.arrowColour === 'rgb(10, 87, 194)', String(c.arrowColour));
            check(`${c.key}: text is left-aligned in the card`, c.textAlign === 'left', String(c.textAlign));
            check(`${c.key}: the mark is ~34px`, c.markSize === '34x34', String(c.markSize));
        });
        // ...and the RULE really says 1.5px, which the used value above
        // cannot show: Chromium snaps a fractional border to the device
        // pixel, so at dpr 1 it reports 1px however the sheet is written.
        check('the stylesheet declares a 1.5px border',
            /\.dccgg-rev-card[^{]*\{[^}]*border:\s*1\.5px solid #dbe3ee/.test(CSS)
            || /border:1\.5px solid #dbe3ee/.test(CSS), 'not found in the stylesheet');
        check('nothing in the section is 800 weight or heavier',
            r.weights.length === 0, JSON.stringify(r.weights));
        await ctx.close();
    }

    console.log('\nD. The desktop cap');
    for (const width of [390, 1440]) {
        const { ctx, page } = await open(browser, width);
        await openReview(page);
        const r = await page.evaluate(READ);
        check(`@${width} the card column never exceeds 420px`,
            r.wrapWidth <= 420, `${r.wrapWidth}px`);
        check(`@${width} and it is centred in the panel`, r.wrapCentred === true);
        if (width === 1440) {
            check('@1440 the panel really is wider than the cap, so the cap bites',
                r.panelWidth > 500, `${r.panelWidth}px`);
        }
        await ctx.close();
    }

    console.log('\nE. States');
    {
        // A touch device: the hover rule must NOT apply, or a tapped card
        // stays looking selected for the rest of the visit.
        const { ctx, page } = await open(browser, 390);
        await openReview(page);
        const touch = await page.evaluate(() => {
            const c = document.querySelector('.dccgg-detail:not([hidden]) .dccgg-rev-card');
            return { hoverMatches: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
                border: getComputedStyle(c).borderTopColor };
        });
        check('a touch device does not match the hover query', touch.hoverMatches === false);
        check('and its card border is the resting grey',
            touch.border === 'rgb(219, 227, 238)', touch.border);
        await ctx.close();
    }
    {
        const { ctx, page } = await open(browser, 1440, { hover: true });
        await openReview(page);
        const sel = '.dccgg-detail:not([hidden]) .dccgg-rev-card';
        const before = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).borderTopColor, sel);
        await page.hover(sel);
        await page.waitForTimeout(120);
        const after = await page.evaluate((s) => ({
            border: getComputedStyle(document.querySelector(s)).borderTopColor,
            bg: getComputedStyle(document.querySelector(s)).backgroundColor,
        }), sel);
        check('a pointer device DOES get the hover border',
            after.border === 'rgb(10, 87, 194)', `${before} -> ${after.border}`);
        check('and the theme coral never reaches the card',
            after.bg !== 'rgb(240, 128, 128)', after.bg);
        // A REAL Tab, not el.focus(): :focus-visible deliberately does not
        // match programmatic focus in Chromium, so the first version of this
        // reported "none 0px" on a rule that works.
        await page.evaluate((s) => {
            const c = document.querySelector(s);
            const prev = document.createElement('a');
            prev.href = '#'; prev.tabIndex = 0;
            c.parentElement.insertBefore(prev, c);
            prev.focus();
        }, sel);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(120);
        const focus = await page.evaluate((s) => {
            const cs = getComputedStyle(document.querySelector(s));
            return { outline: cs.outlineStyle + ' ' + cs.outlineWidth, bg: cs.backgroundColor };
        }, sel);
        check('a keyboard focus ring is visible',
            /solid/.test(focus.outline) && parseFloat(focus.outline.split(' ')[1]) >= 2, focus.outline);
        check('and focus does not turn it coral either',
            focus.bg !== 'rgb(240, 128, 128)', focus.bg);
        await ctx.close();
    }

    console.log('\nF. The thank-you tick');
    {
        const { ctx, page } = await open(browser, 390);
        await openReview(page);
        await page.evaluate(() => {
            const c = document.querySelector('.dccgg-detail:not([hidden]) .dccgg-rev-card');
            c.addEventListener('click', (e) => e.preventDefault(), { once: true });
            c.click();
        });
        await page.waitForTimeout(300);
        const r = await page.evaluate(READ);
        const g = r.cards.find((c) => c.key === 'google');
        check('the tapped card shows a tick and Thank You!',
            /✓/.test(g.sub) && /Thank You!/.test(g.sub), JSON.stringify(g.sub));
        check('it is marked as reviewed', g.reviewed === '1');
        check('the other two are untouched',
            r.cards.filter((c) => c.key !== 'google').every((c) => /^Opens /.test(c.sub)),
            JSON.stringify(r.cards.map((c) => c.sub)));
        check('the card is still a live link',
            g.href && g.target === '_blank', `${g.href} ${g.target}`);
        // ...and it survives a reload, on this device only
        // A REAL reload, which only became possible once the page had an
        // origin: the first version used setContent, whose about:blank has
        // no usable localStorage at all — so the persistence path was never
        // exercised and the "storage blocked" case passed for the wrong
        // reason, because storage was blocked in every case.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ content: 'window.dccggChunks={base:"https://dccgg.test/a/",ver:"dev",min:false};' });
        await page.addScriptTag({ content: JS });
        await page.waitForTimeout(500);
        // ...and item 10: it should already BE open, without being asked.
        const reopened = await page.evaluate(() => {
            const d = document.querySelector('.dccgg-detail:not([hidden])');
            return d ? d.getAttribute('data-key') : null;
        });
        check('coming back reopens the same section, not the top of the guide',
            reopened === 'review', String(reopened));
        await openReview(page);
        const again = await page.evaluate(READ);
        const g2 = again.cards.find((c) => c.key === 'google');
        check('and it is still there after a reload', g2 && g2.reviewed === '1', JSON.stringify(g2 && g2.sub));
        await ctx.close();
    }
    {
        // Storage blocked: no throw, no tick persisted, card still works.
        const { ctx, page } = await open(browser, 390, { blockStorage: true });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await openReview(page);
        await page.evaluate(() => {
            const c = document.querySelector('.dccgg-detail:not([hidden]) .dccgg-rev-card');
            c.addEventListener('click', (e) => e.preventDefault(), { once: true });
            c.click();
        });
        await page.waitForTimeout(300);
        const r = await page.evaluate(READ);
        const g = r.cards.find((c) => c.key === 'google');
        check('with storage blocked nothing throws', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
        check('the tick still shows for this visit', /Thank You!/.test(g.sub || ''), JSON.stringify(g.sub));
        check('and the card is still a live link', g.href && g.target === '_blank');
        await ctx.close();
    }

    console.log('\nG. Accessible names');
    {
        const { ctx, page } = await open(browser, 390);
        await openReview(page);
        let r = await page.evaluate(READ);
        r.cards.forEach((c) => {
            check(`${c.key}: name is "${c.name}, opens in a new tab"`,
                c.label === `${c.name}, opens in a new tab`, String(c.label));
            check(`${c.key}: the sub-line is hidden from screen readers`, c.subHidden === true);
            check(`${c.key}: so are the mark and the arrow`,
                c.markHidden === true && c.arrowHidden === true);
        });
        await page.evaluate(() => {
            const c = document.querySelector('.dccgg-detail:not([hidden]) .dccgg-rev-card');
            c.addEventListener('click', (e) => e.preventDefault(), { once: true });
            c.click();
        });
        await page.waitForTimeout(250);
        r = await page.evaluate(READ);
        const g = r.cards.find((c) => c.key === 'google');
        check('after the tick the name becomes "Google, thank you, opens in a new tab"',
            g.label === 'Google, thank you, opens in a new tab', String(g.label));
        await ctx.close();
    }

    console.log('\nH. The marks cost no request');
    {
        const { ctx, page, requests } = await open(browser, 390);
        await openReview(page);
        const r = await page.evaluate(READ);
        const external = requests.filter((u) =>
            /google|tripadvisor|yelp|gstatic|googleusercontent/i.test(u));
        check('no request is made to Google, Tripadvisor or Yelp',
            external.length === 0, JSON.stringify(external.slice(0, 3)));
        check('the arrow is an inline svg', r.cards.every((c) => c.arrowInlineSvg));
        check('each mark carries its own colour',
            new Set(r.cards.map((c) => c.markInk)).size === 3,
            JSON.stringify(r.cards.map((c) => c.markInk)));
        await ctx.close();
    }

    await browser.close();
    console.log('');
    if (fail) { console.log(`FAILED (${fail}):`); failures.forEach((f) => console.log(`  - ${f}`)); }
    console.log(`${fail ? '✗' : '✓'} review-cards: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
