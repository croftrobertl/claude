/**
 * DCC Guest Guide — the app shell in a browser (v0.26.0).
 *
 *   A. the Postcard Hero: the greeting from the PROPERTY's clock, the plain
 *      welcome with no token, and the stay card only once a token resolves;
 *   B. "Tavares Now": every reading that arrived and not one that did not;
 *   C. the phone layout: two tiles up, 44px targets, 14px tab labels, and
 *      the grab handle only where the gesture it advertises exists;
 *   D. the tab bar: Guide, Canal full screen with the real My Maps link, and
 *      Stay closing the sheet;
 *   E. the Back button closes the sheet instead of leaving the page;
 *   F. "Sunday by 11:00 AM · 1 of 3 done", and what it says with no stay;
 *   G. the Front Desk pill, under the hero and inside a section;
 *   H. the public app shell: no pill, no Front Desk tab, no password;
 *   I. 768 and 1440 render, and nothing is posted to the server.
 *
 *   node tests/app-shell.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/app-shell.ui.js
 *
 * THE DEVICE TIMEZONE IS NEVER EASTERN. Check-out is 11:00 AM in Florida
 * whatever the guest's phone is set to, and a case that passed only because
 * the two happened to agree would be testing nothing. The clock is frozen
 * before any script runs for the same reason the expiry suite freezes it:
 * "Good evening" at 10pm is the whole point of the design and cannot be
 * waited for.
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

const MARKUP = { app: emit('app-a1'), 'app-public': emit('app-public'),
    grid: emit('all-on'), bare: emit('app-bare') };

/**
 * The live theme's ground — and v0.26.1 widened it, because the old block
 * was a MODEL of the kit and missed the two rules that actually bit.
 * Measured in the real combined stylesheet on 2026-11-01:
 *
 *   .elementor-kit-331 h2 { font-size: 20px }      (0,1,1)
 *   .elementor-kit-331 button { border-width: 0 }  (0,1,1)
 *
 * v0.27.0 adds `html { scroll-behavior: smooth }`, which the theme also sets
 * and which is half of why closing a sheet used to animate back down the
 * page. Without it in here, a restore that animates looks instant.
 *
 * The first rendered the hero's welcome at 20px instead of the intended
 * size, and the second stripped the tiles' border so they read as flat
 * icons on a white page. Both beat a single plugin class, and neither was
 * in this block, so the suite passed while the real page was wrong.
 */
const KIT = `html{font-weight:700;scroll-behavior:smooth}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 h1,.elementor-kit-331 h2,.elementor-kit-331 h3{font-size:20px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;line-height:50px;padding:0 18px;border-width:0}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080}
 .dccgg-item-report .fas{display:inline-block;width:14px}`;
const pageFor = (markup, spacer = 0) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div style="height:${spacer}px"></div><div class="site"><div class="content"><div class="entry">
<div class="elementor-widget ${markup === MARKUP.grid ? 'dccgg-layout-grid' : 'dccgg-layout-app'}" data-id="2afb24b">${markup}</div></div></div></div>
${chunkBootTag(SRC)}<script>${JS}</script></body></html>`;

const freezeClock = (ms) => `(() => {
  const F = ${ms}, R = Date;
  const D = function (...a) { return a.length ? new R(...a) : new R(F); };
  D.now = () => F; D.UTC = R.UTC; D.parse = R.parse; D.prototype = R.prototype;
  window.Date = D;
})();`;

const AT = (iso) => Date.parse(iso);

/** 3pm Eastern on a Friday in June. EDT, UTC-4. */
const MIDSTAY = AT('2026-06-19T19:00:00Z');

/**
 * The proxy's reply. `sunToday` is resolved SERVER-side since v0.26.2 — by
 * date, because past_days=1 means index 0 is yesterday — so the app strip and
 * the Conditions card read one value instead of working the sun out twice and
 * disagreeing by a minute.
 */
const WEATHER = {
    current: { temperature_2m: 78.4, wind_speed_10m: 7.2 },
    daily: { time: ['2026-06-18', '2026-06-19', '2026-06-20'],
        sunrise: ['2026-06-18T06:28', '2026-06-19T06:28', '2026-06-20T06:29'],
        sunset: ['2026-06-18T20:28', '2026-06-19T20:28', '2026-06-20T20:29'] },
    sunToday: { sunrise: '06:28', sunset: '20:28' },
};

let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];

    /**
     * Open the app shell. `stay` null means the endpoint answers "nobody",
     * which is what it does for a link with no token — and the hero must
     * look the same either way.
     */
    const open = async ({
        markup = 'app', now = MIDSTAY, tz = 'Asia/Tokyo', query = '',
        weather = WEATHER, width = 390, height = 844, extraCss = '', spacer = 0,
    } = {}) => {
        const ctx = await browser.newContext({ viewport: { width, height },
            isMobile: width < 700, hasTouch: width < 700, timezoneId: tz });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.addInitScript(freezeClock(now));
        await routeChunks(page, A, SRC);
        const seen = { stayAsked: false, posts: 0 };
        await page.route('**/admin-ajax.php*', (r) => {
            const url = r.request().url();
            if (r.request().method() === 'POST') { seen.posts++; }
            let body = { success: true, data: {} };
            if (/action=dccgg_stay/.test(url)) {
                seen.stayAsked = true;     // nothing should ever ask again
            } else if (/action=dccgg_weather/.test(url)) {
                body = weather ? { success: true, data: weather } : { success: false, data: {} };
            }
            r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.route('https://dccgg.test/g**', (r) =>
            r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(MARKUP[markup], spacer) }));
        await page.goto('https://dccgg.test/g' + query, { waitUntil: 'load' });
        if (extraCss) { await page.addStyleTag({ content: extraCss }); }
        await page.waitForTimeout(700);
        // Playwright's pointer stays where it last clicked, so a later read
        // would be a :hover read. Park it out of the way first.
        await page.mouse.move(1, 1);
        return { ctx, page, seen };
    };
    const shut = async (v) => { await v.ctx.close(); };

    const text = (page, sel) => page.$eval(sel, (e) => (e.textContent || '').trim()).catch(() => null);
    const box = (page, sel) => page.$eval(sel, (e) => {
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    }).catch(() => null);
    const shown = (page, sel) => page.$eval(sel, (e) => e.getClientRects().length > 0).catch(() => false);

    console.log('\nA. The Postcard Hero');
    {
        const v = await open();
        check('the welcome names the property, not a guest',
            await text(v.page, '[data-dccgg-welcome]') === 'Welcome to Dora Canal Court',
            await text(v.page, '[data-dccgg-welcome]'));
        // Rob's pick: the live conditions inside the frosted card.
        check('…and the conditions sit inside the card with it',
            await v.page.$eval('[data-dccgg-now]', (e) => !!e.closest('.dccgg-app-stay')));
        check('there is no stay card left to fill',
            (await v.page.$$('[data-dccgg-dates]')).length === 0
            && (await v.page.$$('[data-dccgg-progress]')).length === 0);
        check('…and nothing is asked of the server about one', v.seen.stayAsked === false);
        // The kit renders every h2 at 20px and beat this in v0.26.0.
        const size = await v.page.$eval('.dccgg-app-welcome', (e) => parseFloat(getComputedStyle(e).fontSize));
        check('the welcome beats the kit\'s 20px heading rule', size > 22, 'got ' + size + 'px');
        await shut(v);
    }
    for (const [label, when, want] of [
        ['09:00 Eastern', AT('2026-06-19T13:00:00Z'), 'Good morning'],
        ['15:00 Eastern', AT('2026-06-19T19:00:00Z'), 'Good afternoon'],
        ['22:00 Eastern', AT('2026-06-20T02:00:00Z'), 'Good evening'],
        ['11:59 Eastern', AT('2026-06-19T15:59:00Z'), 'Good morning'],
        ['12:00 Eastern', AT('2026-06-19T16:00:00Z'), 'Good afternoon'],
        ['17:59 Eastern', AT('2026-06-19T21:59:00Z'), 'Good afternoon'],
        ['18:00 Eastern', AT('2026-06-19T22:00:00Z'), 'Good evening'],
    ]) {
        // Tokyo is +9 and Honolulu −10, so neither ever agrees with Eastern.
        const v = await open({ now: when, tz: label.length % 2 ? 'Asia/Tokyo' : 'Pacific/Honolulu' });
        const got = await text(v.page, '[data-dccgg-greeting]');
        check(`${label} on a phone set elsewhere greets "${want}"`, got === want, 'got ' + got);
        await shut(v);
    }

    console.log('\nB. "Tavares Now"');
    {
        const v = await open();
        check('the strip shows temperature, wind and sunset',
            await text(v.page, '[data-dccgg-now-rows]') === '78° · 7 mph · Sunset 8:28 PM',
            await text(v.page, '[data-dccgg-now-rows]'));
        check('…and is labelled', await text(v.page, '.dccgg-app-now-label') === 'Tavares Now');
        await shut(v);
    }
    {
        const v = await open({ weather: { current: { temperature_2m: 78.4 }, daily: {} } });
        check('a missing wind reading is left out, not shown empty',
            await text(v.page, '[data-dccgg-now-rows]') === '78°');
        await shut(v);
    }
    {
        const v = await open({ weather: { current: {}, daily: {} } });
        check('nothing to show hides the whole strip', !(await shown(v.page, '[data-dccgg-now]')));
        await shut(v);
    }
    {
        const v = await open({ weather: null });
        check('a failed weather call hides it too, rather than erroring',
            !(await shown(v.page, '[data-dccgg-now]')));
        await shut(v);
    }
    {
        // The strip no longer scans the daily array: it reads the one value
        // the server resolved, so it cannot disagree with the Conditions card.
        const v = await open({ weather: { current: {},
            daily: { time: ['2026-06-18'], sunset: ['2026-06-18T20:00'] },
            sunToday: { sunrise: '06:28', sunset: '20:28' } } });
        check('sunset comes from the server-resolved field, not from the array',
            await text(v.page, '[data-dccgg-now-rows]') === 'Sunset 8:28 PM',
            await text(v.page, '[data-dccgg-now-rows]'));
        await shut(v);
    }
    {
        // No resolved field, no row — silence beats a wrong number, and this
        // is also what a payload cached before v0.26.2 looks like.
        const v = await open({ weather: { current: { temperature_2m: 78.4 },
            daily: { time: ['2026-06-18'], sunset: ['2026-06-18T20:28'] } } });
        check('a reply with no resolved sun shows the other readings and no sunset',
            await text(v.page, '[data-dccgg-now-rows]') === '78°',
            await text(v.page, '[data-dccgg-now-rows]'));
        await shut(v);
    }

    console.log('\nC. The phone layout');
    {
        const v = await open();
        const rows = await v.page.$$eval('.dccgg-tile-wrap', (els) =>
            [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].length);
        const perRow = await v.page.$$eval('.dccgg-tile-wrap', (els) => {
            const top = Math.round(els[0].getBoundingClientRect().top);
            return els.filter((e) => Math.round(e.getBoundingClientRect().top) === top).length;
        });
        check('tiles are two up at 390', perRow === 2, 'perRow=' + perRow);
        check('…over several rows, so nothing is hidden', rows >= 4, 'rows=' + rows);
        const tile = await box(v.page, '.dccgg-tile');
        check('a tile is a generous target', tile.h >= 100 && tile.w >= 150, JSON.stringify(tile));
        // The kit's `button { border-width: 0 }` is (0,1,1) and strips the
        // border `.dccgg-tile` draws, which on a white page leaves a white
        // card with no edge — "flat icons with no card", as staging showed.
        const edge = await v.page.$eval('.dccgg-tile', (e) => {
            const cs = getComputedStyle(e);
            return { w: parseFloat(cs.borderTopWidth), c: cs.borderTopColor };
        });
        check('…and it has a visible card edge, which the kit tries to strip',
            edge.w >= 1 && !/rgba\(0, 0, 0, 0\)|transparent/.test(edge.c), JSON.stringify(edge));
        const labels = await v.page.$$eval('.dccgg-app-tab-label', (els) =>
            els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
        check('every tab label is at least 14px', labels.length > 1 && labels.every((s) => s >= 14),
            JSON.stringify(labels));
        const tabs = await v.page.$$eval('.dccgg-app-tab', (els) =>
            els.map((e) => Math.round(e.getBoundingClientRect().height)));
        check('every tab is at least 44 tall', tabs.every((h) => h >= 44), JSON.stringify(tabs));
        const bar = await box(v.page, '.dccgg-app-tabs');
        check('the tab bar is on screen from the top of the guide, not only at its end',
            bar.y + bar.h <= 844 && bar.y > 600, JSON.stringify(bar));
        check('…and a tap lands on the bar, not on a tile behind it',
            await v.page.evaluate(() => {
                const r = document.querySelector('.dccgg-app-tabs').getBoundingClientRect();
                const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return !!(el && el.closest('.dccgg-app-tabs'));
            }));
        // The hub's round ⋯ Front Desk button already overflows 390 by 25px on
        // the GRID layout, in this harness, before any of this release. The
        // guarantee worth pinning is therefore that the shell adds nothing to
        // it, not an absolute figure that would be measuring an older bug.
        const over = await v.page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await shut(v);
        const g = await open({ markup: 'grid' });
        const gridOver = await g.page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await shut(g);
        check('the app shell adds no horizontal overflow of its own at 390',
            over <= gridOver, `app=${over} grid=${gridOver}`);
    }
    {
        const v = await open();
        await v.page.tap('.dccgg-tile[data-key="internet"]');
        await v.page.waitForTimeout(650);
        // The guide's own handle, on the sticky header since v0.9.7.26 —
        // there is no second one, and an earlier draft of this release added
        // one before anybody looked.
        check('the open sheet shows ONE grab handle, the guide\'s own',
            await v.page.$eval('.dccgg-detail[data-key="internet"] .dccgg-detail-header',
                (e) => getComputedStyle(e, '::before').height) === '4px'
            && (await v.page.$$('.dccgg-sheet-handle')).length === 0);
        check('…and the tab bar steps aside rather than floating over the sheet',
            !(await shown(v.page, '.dccgg-app-tabs')));
        await shut(v);
    }
    {
        const v = await open({ width: 1440, height: 900 });
        await v.page.click('.dccgg-tile[data-key="internet"]');
        await v.page.waitForTimeout(650);
        check('the grab handle is gone where the gesture is not offered',
            await v.page.$eval('.dccgg-detail[data-key="internet"] .dccgg-detail-header',
                (e) => getComputedStyle(e, '::before').content) === 'none');
        await shut(v);
    }

    console.log('\nC2. The column count follows the container, not the viewport');
    {
        // Rob's pick caps the shell at 460px, so in practice the hub is always
        // two up — but the thing he asked for is that the COUNT follow the
        // container, and that only shows when the container is wide inside a
        // narrow window and narrow inside a wide one. Both, measured.
        const perRow = async (page) => page.$$eval('.dccgg-tile-wrap', (els) => {
            const top = Math.round(els[0].getBoundingClientRect().top);
            return els.filter((e) => Math.round(e.getBoundingClientRect().top) === top).length;
        });
        const wide = await open({ width: 1440, height: 900,
            extraCss: '.dccgg-root.dccgg-root.dccgg-app-shell{max-width:1100px}' });
        check('a wide hub goes to four across inside the same 1440 window',
            await perRow(wide.page) === 4, 'perRow=' + await perRow(wide.page));
        await shut(wide);
        const narrow = await open({ width: 1440, height: 900,
            extraCss: '.dccgg-root.dccgg-root.dccgg-app-shell{max-width:420px}' });
        check('…and a narrow one stays two, in that same window',
            await perRow(narrow.page) === 2, 'perRow=' + await perRow(narrow.page));
        await shut(narrow);
    }

    console.log('\nD. The tab bar');
    {
        const v = await open();
        const names = await v.page.$$eval('.dccgg-app-tab-label', (e) => e.map((x) => x.textContent.trim()));
        check('the four tabs are Stay, Guide, Canal and Front Desk',
            names.join(' · ') === 'Stay · Guide · Canal · Front Desk', names.join(' · '));
        check('Stay starts current',
            await v.page.$eval('.dccgg-app-tab', (e) => e.getAttribute('aria-current')) === 'page');

        await v.page.tap('.dccgg-app-tab[data-app-tab-key="amenities"]');
        await v.page.waitForTimeout(650);
        check('Guide opens its section',
            await v.page.$eval('.dccgg-detail[data-key="amenities"]', (e) => !e.hidden));
        check('…and the bar follows',
            await v.page.$eval('.dccgg-app-tab[data-app-tab-key="amenities"]',
                (e) => e.getAttribute('aria-current')) === 'page');

        // The bar is gone while the sheet is up — the sheet owns the screen,
        // as the mockup shows — so the way back is the sheet's own Back.
        check('…and the bar is not floating over the open sheet',
            !(await shown(v.page, '.dccgg-app-tabs')));
        await v.page.tap('.dccgg-detail:not([hidden]) .dccgg-back');
        await v.page.waitForTimeout(800);
        check('closing the sheet brings the bar back',
            await shown(v.page, '.dccgg-app-tabs'));
        check('…with Stay current again, so it never claims a section the guest left',
            await v.page.$eval('.dccgg-app-tab', (e) => e.getAttribute('aria-current')) === 'page');

        await v.page.tap('.dccgg-app-tab[data-app-tab-key="canal"]');
        await v.page.waitForTimeout(650);
        check('Canal opens full screen',
            await v.page.$eval('.dccgg-detail[data-key="canal"]',
                (e) => !e.hidden && e.classList.contains('dccgg-detail--fullscreen')));
        const href = await v.page.$eval('.dccgg-detail[data-key="canal"] .dccgg-app-maps', (e) => e.href);
        check('…with Rob\'s own My Maps link, not a redrawn map',
            href === 'https://www.google.com/maps/d/viewer?mid=TEST', href);
        check('…opening in a new tab',
            await v.page.$eval('.dccgg-detail[data-key="canal"] .dccgg-app-maps',
                (e) => e.target === '_blank' && /noopener/.test(e.rel)));
        await shut(v);
    }

    console.log('\nE. The Back button');
    {
        const v = await open();
        await v.page.tap('.dccgg-tile[data-key="internet"]');
        await v.page.waitForTimeout(650);
        check('a tile opens its sheet',
            await v.page.evaluate(() => document.documentElement.classList.contains('dccgg-detail-open')));
        await v.page.goBack();
        await v.page.waitForTimeout(650);
        check('Back closes the sheet',
            !(await v.page.evaluate(() => document.documentElement.classList.contains('dccgg-detail-open'))));
        check('…and stays on the guide rather than leaving it',
            /dccgg\.test\/g/.test(v.page.url()), v.page.url());
        // And closing by other means must not strand a history entry: open and
        // close with the Back BUTTON in the sheet, then goBack should leave.
        await v.page.tap('.dccgg-tile[data-key="internet"]');
        await v.page.waitForTimeout(650);
        await v.page.tap('.dccgg-detail:not([hidden]) .dccgg-back');
        await v.page.waitForTimeout(700);
        check('closing from inside the sheet also rewinds its history entry',
            !(await v.page.evaluate(() => document.documentElement.classList.contains('dccgg-detail-open'))));
        await shut(v);
    }

    console.log('\nF. The checkout line');
    {
        const v = await open();
        await v.page.tap('.dccgg-tile[data-key="checkout"]');
        await v.page.waitForTimeout(650);
        const total = await v.page.$$eval(
            '.dccgg-detail[data-key="checkout"] .dccgg-item[data-checkable="1"]', (e) => e.length);
        // "By 11:00 AM" and no weekday: the hour belongs to the property and
        // is always true; the day belonged to a booking nothing resolves now.
        check('the sheet names the property\'s hour and the count',
            await text(v.page, '[data-dccgg-due]') === `By 11:00 AM · 0 of ${total} done`,
            await text(v.page, '[data-dccgg-due]'));
        // ONE count. The bar used to carry "0 / 3" beside Reset while the due
        // line said something else, and the two could disagree.
        check('…and it is the only count on screen',
            !(await shown(v.page, '.dccgg-detail[data-key="checkout"] .dccgg-checklist-progress-label')));
        check('…while the bar keeps its fill and its Reset',
            (await shown(v.page, '.dccgg-detail[data-key="checkout"] .dccgg-checklist-progress-fill'))
            && (await shown(v.page, '.dccgg-detail[data-key="checkout"] .dccgg-checklist-reset')));
        await v.page.tap('.dccgg-detail[data-key="checkout"] .dccgg-item[data-checkable="1"] .dccgg-item-check');
        await v.page.waitForTimeout(350);
        check('…and keeps up as the guest ticks',
            await text(v.page, '[data-dccgg-due]') === `By 11:00 AM · 1 of ${total} done`,
            await text(v.page, '[data-dccgg-due]'));
        await v.page.tap('.dccgg-detail[data-key="checkout"] .dccgg-checklist-reset');
        await v.page.waitForTimeout(350);
        check('…and Reset puts it back',
            await text(v.page, '[data-dccgg-due]') === `By 11:00 AM · 0 of ${total} done`);
        check('nothing was sent to the server', v.seen.posts === 0);
        await shut(v);
    }

    console.log('\nF2. A guide with nothing configured');
    {
        // The staging state: no section roles, no tab targets, no nouns.
        const v = await open({ markup: 'bare' });
        const names = await v.page.$$eval('.dccgg-app-tab-label', (e) => e.map((x) => x.textContent.trim()));
        check('the bar still has four tabs, not the two staging showed',
            names.join(' · ') === 'Stay · Guide · Canal · Front Desk', names.join(' · '));
        await v.page.tap('.dccgg-app-tab[data-app-tab="section"]');
        await v.page.waitForTimeout(650);
        check('Canal opens the map section it found for itself',
            await v.page.$eval('.dccgg-detail[data-key="map"]', (e) => !e.hidden));
        await v.page.tap('.dccgg-detail:not([hidden]) .dccgg-back');
        await v.page.waitForTimeout(700);
        await v.page.tap('.dccgg-app-tab[data-app-tab="menu"]');
        await v.page.waitForTimeout(500);
        check('the Guide tab goes to the tiles rather than doing nothing',
            await v.page.$eval('.dccgg-app-tab[data-app-tab="menu"]',
                (e) => e.getAttribute('aria-current')) === 'page'
            && !(await v.page.evaluate(() => document.documentElement.classList.contains('dccgg-detail-open'))));
        const sums = await v.page.$$eval('.dccgg-tile-summary', (e) => e.map((x) => x.textContent.trim()));
        check('the Checkout tile carries the property clock and counts steps',
            sums.some((t) => /^11:00 AM · \d+ steps?$/.test(t)), sums.join(' | '));
        await shut(v);
    }

    console.log('\nG. The Front Desk pill');
    {
        const v = await open();
        const pill = await box(v.page, '.dccgg-report-pill--hero');
        check('the hero pill is a full-width target', pill.h >= 48 && pill.w > 300, JSON.stringify(pill));
        check('…and sits under the hero, above the tiles',
            pill.y > (await box(v.page, '.dccgg-app-stay')).y
            && pill.y < (await box(v.page, '.dccgg-tile')).y);
        const bg = await v.page.$eval('.dccgg-report-pill--hero', (e) => getComputedStyle(e).backgroundColor);
        check('the pill is orange, and the kit\'s coral has not taken it',
            bg === 'rgb(217, 72, 15)', bg);
        await v.page.tap('.dccgg-report-pill--hero');
        await v.page.waitForTimeout(500);
        check('it opens the Front Desk report', await shown(v.page, '.dccgg-report-dialog'));
        await v.page.keyboard.press('Escape');
        await v.page.waitForTimeout(300);

        // v0.27.0: no pill inside a section any more. Rob's words — tacky,
        // and it invites a guest to ask before they look for the answer
        // already on the screen.
        await v.page.tap('.dccgg-tile[data-key="internet"]');
        await v.page.waitForTimeout(650);
        check('a section carries no Front Desk pill of its own',
            (await v.page.$$('.dccgg-detail[data-key="internet"] .dccgg-report-pill')).length === 0);
        check('…and the whole guide has exactly one, under the hero',
            (await v.page.$$('.dccgg-report-pill')).length === 1);
        await shut(v);
    }

    console.log('\nG2. The tab bar belongs to the guide, not to the page');
    {
        const v = await open();
        // It is moved to <body>: a transformed ancestor on the host page
        // makes `position: fixed` resolve against that ancestor instead of
        // the viewport, which on live /test/ put the bar at y=5938 in an
        // 844px window. Measured there 2026-11-02.
        check('the bar is lifted out of the widget, to <body>',
            await v.page.$eval('.dccgg-app-tabs', (e) => e.parentElement.tagName) === 'BODY');
        check('…and still sits on the bottom edge of the viewport',
            await v.page.$eval('.dccgg-app-tabs', (e) => {
                const r = e.getBoundingClientRect();
                return Math.abs(r.bottom - window.innerHeight) < 2;
            }));
        check('…and is on screen while the guide is', await shown(v.page, '.dccgg-app-tabs'));

        // Put something tall below the guide, the way /test/ carries the
        // Wildlife widget, and scroll past it.
        await v.page.evaluate(() => {
            const after = document.createElement('div');
            after.style.height = '2400px';
            after.id = 'below-the-guide';
            document.querySelector('.elementor-widget').after(after);
        });
        await v.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await v.page.waitForTimeout(600);
        check('…and gone once the guest has scrolled past the guide',
            !(await shown(v.page, '.dccgg-app-tabs')));
        await v.page.evaluate(() => window.scrollTo(0, 0));
        await v.page.waitForTimeout(600);
        check('…and back when the guide is again', await shown(v.page, '.dccgg-app-tabs'));

        // The Front Desk tab lost its delegated listener when the bar moved
        // out of the root; it is bound directly now and must still open the
        // one report dialog.
        await v.page.tap('.dccgg-app-tab[data-app-tab="report"]');
        await v.page.waitForTimeout(600);
        check('the Front Desk tab still opens the report from outside the root',
            await shown(v.page, '.dccgg-report-dialog'));
        await shut(v);
    }

    console.log('\nG3. Centred, and no second border round Reset');
    {
        const v = await open();
        check('a tile centres its content',
            await v.page.$eval('.dccgg-tile', (e) => getComputedStyle(e).textAlign) === 'center');
        check('…and a tab label is centred on one line',
            await v.page.$eval('.dccgg-app-tab-label',
                (e) => getComputedStyle(e).whiteSpace) === 'nowrap');
        const labels = await v.page.$$eval('.dccgg-app-tab-label',
            (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
        check('…so every tab label is the same height, none wrapped to two lines',
            new Set(labels).size === 1, JSON.stringify(labels));
        await v.page.tap('.dccgg-tile[data-key="checkout"]');
        await v.page.waitForTimeout(700);
        const bar = await v.page.$eval('.dccgg-detail[data-key="checkout"] .dccgg-checklist-progress',
            (e) => { const c = getComputedStyle(e); return { b: c.borderTopWidth, bg: c.backgroundColor }; });
        check('Reset has no second pill drawn round it',
            parseFloat(bar.b) === 0 && /rgba\(0, 0, 0, 0\)|transparent/.test(bar.bg),
            JSON.stringify(bar));
        // Measured as GEOMETRY, not as a property that happens to read
        // "center": the title sits in the centre track of a 1fr/auto/1fr
        // grid and has done since v0.24.x, so a computed-style assertion
        // here would be testing a rule that does not exist.
        check('…and the item titles in the sheet are centred',
            await v.page.$eval('.dccgg-detail[data-key="checkout"] .dccgg-item-title', (row) => {
                const t = row.querySelector('.dccgg-item-title-text');
                const a = t.getBoundingClientRect(), b = row.getBoundingClientRect();
                return Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 2;
            }));
        const paras = await v.page.$$eval('.dccgg-detail[data-key="checkout"] .dccgg-item-body p',
            (ps) => ps.map((p) => ({ multi: p.classList.contains('dccgg-multi'),
                align: getComputedStyle(p).textAlign, t: p.textContent.trim().slice(0, 30) })));
        // The fixture HAS a multi-sentence paragraph, deliberately: without
        // one this pair could only ever pass.
        check('a paragraph of more than one sentence is marked as one',
            paras.filter((p) => p.multi).length === 1, JSON.stringify(paras));
        check('…and reads left while the single-sentence ones stay centred',
            paras.every((p) => p.align === (p.multi ? 'left' : 'center')), JSON.stringify(paras));
        await shut(v);
    }

    console.log('\nG4. The guarantees the first mutation run found untested');
    {
        // --- no jump on Back ---------------------------------------------
        // Measured as a LANDMARK's position frame by frame. window.scrollY
        // reads 0 for the whole time the body is pinned, so it reports a
        // jump where nothing visible moved and success where it has not.
        const v = await open({ height: 700 });
        await v.page.evaluate(() => { document.body.style.paddingBottom = '2000px'; });
        await v.page.evaluate(() => window.scrollTo(0, 300));
        await v.page.waitForTimeout(400);
        await v.page.tap('.dccgg-tile[data-key="checkout"]');
        await v.page.waitForTimeout(800);
        const drift = await v.page.evaluate(() => new Promise((resolve) => {
            const mark = document.querySelector('.dccgg-app-shell');
            const seen = [];
            const t0 = performance.now();
            const tick = () => {
                seen.push(Math.round(mark.getBoundingClientRect().top));
                if (performance.now() - t0 < 1500) { requestAnimationFrame(tick); }
                else { resolve(Math.max(...seen) - Math.min(...seen)); }
            };
            requestAnimationFrame(tick);
            document.querySelector('.dccgg-detail:not([hidden]) .dccgg-back').click();
        }));
        check('closing a sheet moves nothing the guest can see', drift === 0, 'drift=' + drift + 'px');
        check('…and the guide owns scroll restoration, so the browser cannot override it',
            await v.page.evaluate(() => history.scrollRestoration) === 'manual');
        await shut(v);
    }
    {
        // --- the pressed state, and its release ---------------------------
        const v = await open();
        const tile = await v.page.$('.dccgg-tile');
        const box = await tile.boundingBox();
        const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
        const cdp = await v.page.context().newCDPSession(v.page);
        const pressing = () => v.page.$eval('.dccgg-tile', (e) => e.classList.contains('is-pressing'));

        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
        await v.page.waitForTimeout(60);
        check('a tile answers the finger while it is still down', await pressing());
        // Sideways, and with the page pinned so it cannot scroll. A finger
        // dragged UP scrolls the page, which fires the scroll listener and
        // releases the tile anyway — so the first version of this case
        // passed with the touchmove handler deleted, testing the other
        // branch by accident.
        await v.page.evaluate(() => { document.documentElement.style.overflow = 'hidden'; });
        const scrollBefore = await v.page.evaluate(() => window.scrollY);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
            touchPoints: [{ x: pt[0].x + 40, y: pt[0].y }] });
        await v.page.waitForTimeout(80);
        check('…and lets go the moment the finger moves, with no scroll to do it',
            !(await pressing()) && (await v.page.evaluate(() => window.scrollY)) === scrollBefore);
        await v.page.evaluate(() => { document.documentElement.style.overflow = ''; });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await v.page.waitForTimeout(400);

        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
        await v.page.waitForTimeout(60);
        await v.page.evaluate(() => window.scrollBy(0, 40));
        await v.page.waitForTimeout(120);
        check('…and lets go when the page scrolls under it', !(await pressing()));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

        check('a tile does not wait on the browser\'s double-tap delay',
            await v.page.$eval('.dccgg-tile', (e) => getComputedStyle(e).touchAction) === 'manipulation');
        await shut(v);
    }
    {
        // --- the bar must not flash before the observer has decided -------
        // The guide starts BELOW THE FOLD, so the observer's first answer is
        // "not on screen". Scrolling it out of view after load would not test
        // this at all: by then the bar has been shown once already, and the
        // mutant that starts it visible would pass.
        //
        // Sampled every frame from before the chunk runs, because what is
        // wrong with starting visible is a flash, and a flash is gone by the
        // time anything asks.
        const v = await open({ height: 600, spacer: 2000 });
        const everFlashed = await v.page.evaluate(() => new Promise((resolve) => {
            const t0 = performance.now();
            let flashed = false;
            const tick = () => {
                const bar = document.querySelector('.dccgg-app-tabs');
                const root = document.querySelector('.dccgg-app-shell');
                if (bar && root) {
                    const r = root.getBoundingClientRect();
                    const offscreen = r.bottom < 0 || r.top > window.innerHeight;
                    if (offscreen && bar.getClientRects().length) { flashed = true; }
                }
                if (performance.now() - t0 < 1500) { requestAnimationFrame(tick); }
                else { resolve(flashed); }
            };
            requestAnimationFrame(tick);
        }));
        check('the bar never paints while the guide is off screen', !everFlashed);
        await shut(v);
    }

    console.log('\nH. The public app shell');
    {
        const v = await open({ markup: 'app-public' });
        check('no Front Desk pill', (await v.page.$$('.dccgg-report-pill')).length === 0);
        check('no Front Desk tab', (await v.page.$$('[data-app-tab="report"]')).length === 0);
        check('the tab bar is still there', await shown(v.page, '.dccgg-app-tabs'));
        check('the Wi-Fi password is nowhere in the page',
            !(await v.page.content()).includes('DCC32586'));
        await shut(v);
    }

    console.log('\nI. The other two widths, and the ground rules');
    for (const w of [768, 1440]) {
        const v = await open({ width: w, height: 900 });
        const over = await v.page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${w}: nothing overflows the width`, over <= 0, 'over=' + over);
        // Rob's pick: the phone shell centred, not a second layout.
        const shell = await box(v.page, '.dccgg-app-shell');
        check(`${w}: the shell is a centred column, not full width`,
            shell.w <= 470 && Math.abs((shell.x + shell.w / 2) - w / 2) < 20, JSON.stringify(shell));
        const bar = await box(v.page, '.dccgg-app-tabs');
        check(`${w}: the tab bar is centred on the same column`,
            Math.abs(bar.w - shell.w) < 24 && Math.abs((bar.x + bar.w / 2) - w / 2) < 20,
            JSON.stringify(bar));
        // The column is 460px inside a 1440px window: a VIEWPORT rule would
        // ask for four tiles across and clip every label, which is what
        // Option B's picture showed. The count follows the container now.
        const perRow = await v.page.$$eval('.dccgg-tile-wrap', (els) => {
            const top = Math.round(els[0].getBoundingClientRect().top);
            return els.filter((e) => Math.round(e.getBoundingClientRect().top) === top).length;
        });
        check(`${w}: the tiles stay two up, because the count follows the container`,
            perRow === 2, 'perRow=' + perRow);
        check(`${w}: the hero, the tiles and the tab bar all render`,
            (await shown(v.page, '.dccgg-app-hero'))
            && (await shown(v.page, '.dccgg-tile'))
            && (await shown(v.page, '.dccgg-app-tabs')));
        const body = await v.page.$eval('.dccgg-app-welcome', (e) => getComputedStyle(e).fontWeight);
        check(`${w}: the welcome is bold on purpose, not by inheritance`, body === '700');
        await shut(v);
    }
    {
        const v = await open();
        const weight = await v.page.$eval('.dccgg-app-greeting', (e) => getComputedStyle(e).fontWeight);
        check('the greeting is NOT bolded by the theme\'s html{font-weight:700}', weight === '400', weight);
        await shut(v);
    }

    check('no JS errors anywhere', errors.length === 0, errors.join(' | '));

    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (failures.length) {
        console.log('\nFailures:');
        failures.forEach((f) => console.log('  - ' + f));
    }
    process.exit(fail === 0 ? 0 : 1);
})();
