/**
 * Render the app shell inside the REAL doracanalcourt.com page, for measuring
 * and for stills (v0.26.1).
 *
 * Not a test and not in the suite: it needs the network, and a suite that can
 * fail because a site is slow is a suite nobody trusts. It exists because the
 * harness's synthetic kit block is a MODEL of the theme and this is the theme
 * — and v0.26.0 shipped a header that the model said was 1.6em and the real
 * Elementor kit rendered at 20px.
 *
 * It takes the cached live /guest/ document, swaps the guide widget's markup
 * for a freshly rendered one, appends the working copy of widget.css after
 * the site's own combined bundle (which is what a deploy does), and runs the
 * real front-end scripts.
 *
 *   node tools/live-shell.js measure            # computed styles, who wins
 *   node tools/live-shell.js shot <w> <file>    # a still at that width
 *   node tools/live-shell.js headers <dir>      # the header options
 *
 * Refresh the cache with tools/live-fetch.sh.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const A = ROOT + '/dcc-guest-guide/assets/';
const CACHE = '/tmp/live';
const { frontEndJs, chunkBootTag, routeChunks } = require(ROOT + '/tests/_bundles');

const LIVE_HTML = fs.readFileSync(CACHE + '/guest.html', 'utf8');
const CSS = fs.readFileSync(A + 'css/widget.css', 'utf8');
const JS = frontEndJs(A, true);

/** The widget element on the live page, by its Elementor id. */
const WIDGET_SEL = '.elementor-element-2afb24b';

function markup(caseName) {
    return execFileSync('php', [ROOT + '/tests/_emit-guide.php', caseName],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/**
 * The live page with the guide replaced. The swap happens in the browser
 * rather than in the HTML string because .dccgg-root is deeply nested and a
 * regex that matches a balanced div is a regex that will one day not.
 */
async function openLive(browser, { width = 390, height = 844, caseName = 'app-a1', extraCss = '', stay = null, weather = WX, keepReal = false } = {}) {
    const ctx = await browser.newContext({
        viewport: { width, height }, isMobile: width < 700, hasTouch: width < 700,
        deviceScaleFactor: 2, timezoneId: 'America/Chicago',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // Registered FIRST on purpose: Playwright matches the most recently
    // registered route first, so everything specific below overrides this.
    // It exists so a still cannot be held up by a third party.
    await page.route('**/*', (r) => {
        const u = r.request().url();
        if (u.startsWith('https://dccgg.test/a/')) {
            const f = u.split('/a/')[1].split('?')[0];
            const p2 = A + 'js/' + f;
            return /^widget-[a-z]+\.js$/.test(f) && fs.existsSync(p2)
                ? r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(p2, 'utf8') })
                : r.fulfill({ status: 404, body: '' });
        }
        if (u.startsWith('https://doracanalcourt.com/wp-content/cache/speedycache/') && u.endsWith('.css')) {
            return r.fulfill({ status: 200, contentType: 'text/css',
                body: fs.readFileSync(CACHE + '/combined.css', 'utf8') });
        }
        if (u === 'https://doracanalcourt.com/guest/') {
            return r.fulfill({ status: 200, contentType: 'text/html', body: LIVE_HTML });
        }
        const local = CACHE + '/assets/' + Buffer.from(u).toString('base64url').slice(0, 60);
        if (fs.existsSync(local)) {
            return r.fulfill({ status: 200, body: fs.readFileSync(local) });
        }
        // Real fonts, from the real site: a still in a fallback serif is not a
        // still of this page. Everything else heavy is stubbed.
        if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u) || /fonts\.(googleapis|gstatic)\.com/.test(u)) {
            return r.continue();
        }
        if (/\.(png|jpe?g|webp|gif|svg|eot)(\?|$)/i.test(u)) {
            return r.fulfill({ status: 200, contentType: 'image/gif',
                body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
        }
        return r.fulfill({ status: 204, body: '' });
    });
    await routeChunks(page, A, true);
    await page.route('**/admin-ajax.php*', (r) => {
        const u = r.request().url();
        let body = { success: true, data: {} };
        if (/dccgg_stay/.test(u)) { body = { success: true, data: { stay } }; }
        else if (/dccgg_weather/.test(u)) { body = weather ? { success: true, data: weather } : { success: false, data: {} }; }
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    // The site's own assets come from the cache; everything else is blocked so
    // a still cannot be held up by a third party.
    await page.goto('https://doracanalcourt.com/guest/', { waitUntil: 'domcontentloaded' });

    // Swap in a freshly rendered guide, in the app layout. keepReal leaves the
    // page's OWN guide markup alone, which is how the live content's own
    // components — the conditions card, the section arrows, the host's real
    // icons — get measured rather than a fixture's.
    if (!keepReal) await page.evaluate(({ html, sel }) => {
        const el = document.querySelector(sel);
        if (!el) { throw new Error('widget element not found on the live page'); }
        el.className = el.className.replace(/dccgg-layout-\w+/, 'dccgg-layout-app');
        el.innerHTML = html;
    }, { html: markup(caseName), sel: WIDGET_SEL });

    // The plugin's working copy, after the site's bundle — what a deploy does.
    await page.addStyleTag({ content: CSS });
    if (extraCss) { await page.addStyleTag({ content: extraCss }); }
    await page.addScriptTag({ content: 'window.dccggChunks={base:"https://dccgg.test/a/",ver:"dev",min:false};' });
    await page.addScriptTag({ content: JS });
    await page.waitForTimeout(900);
    await page.mouse.move(1, 1);
    try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (_) {}
    // Put the guide at the top of the shot: the page's own hero banner is a
    // screenful of theme above it and nobody is reviewing that here.
    await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) { window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8); }
    }, WIDGET_SEL);
    await page.waitForTimeout(500);
    return { ctx, page, errors };
}

/**
 * What the weather proxy returns. `sunToday` is resolved SERVER-side since
 * v0.26.2 — see Plugin::with_sun_today() — and both the app strip and the
 * Conditions card read it, so a mock without it shows no sunset at all.
 * That is exactly how the first 0.26.2 still came out, before this was fixed.
 */
const WX = {
    current: { temperature_2m: 76.1, wind_speed_10m: 10.4 },
    daily: {
        time: [new Date(Date.now() - 864e5).toISOString().slice(0, 10),
            new Date().toISOString().slice(0, 10)],
        sunrise: [new Date(Date.now() - 864e5).toISOString().slice(0, 10) + 'T07:38',
            new Date().toISOString().slice(0, 10) + 'T07:39'],
        sunset: [new Date(Date.now() - 864e5).toISOString().slice(0, 10) + 'T18:42',
            new Date().toISOString().slice(0, 10) + 'T18:41'],
    },
    sunToday: { sunrise: '07:39', sunset: '18:41' },
};

module.exports = { openLive, markup, WIDGET_SEL, CSS, JS, WX };

if (require.main === module) {
    (async () => {
        const cmd = process.argv[2] || 'measure';
        const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
        if (cmd === 'measure') {
            const { ctx, page, errors } = await openLive(browser, { width: 390 });
            const out = await page.evaluate(() => {
                const pick = (sel, props) => {
                    const el = document.querySelector(sel);
                    if (!el) { return [sel, 'MISSING']; }
                    const cs = getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    return [sel, props.map((p) => p + '=' + cs[p]).join(' ')
                        + ` box=${Math.round(r.width)}x${Math.round(r.height)}`];
                };
                return [
                    pick('.dccgg-app-welcome', ['fontSize', 'fontWeight', 'fontFamily', 'color']),
                    pick('.dccgg-app-greeting', ['fontSize', 'fontWeight']),
                    pick('.dccgg-app-date-value', ['fontSize', 'fontWeight', 'whiteSpace']),
                    pick('.dccgg-tile', ['backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'padding']),
                    pick('.dccgg-tile-title', ['fontSize', 'fontWeight', 'color']),
                    pick('.dccgg-tile-summary', ['fontSize', 'fontWeight', 'letterSpacing', 'color']),
                    pick('.dccgg-app-now-label', ['fontSize', 'fontWeight']),
                    pick('.dccgg-app-tab-label', ['fontSize', 'fontWeight']),
                    pick('.dccgg-app-tab', ['backgroundColor']),
                    pick('.dccgg-report-pill', ['backgroundColor', 'fontSize', 'minHeight']),
                    pick('.dccgg-app-hero', ['minHeight']),
                ];
            });
            out.forEach(([s, v]) => console.log(s.padEnd(26), v));
            const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            console.log('horizontal overflow at 390:', over);
            if (errors.length) { console.log('JS ERRORS:', errors.join(' | ')); }
            await ctx.close();
        }
        await browser.close();
    })();
}
