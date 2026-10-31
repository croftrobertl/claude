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

const MARKUP = { app: emit('app'), 'app-public': emit('app-public'), grid: emit('all-on') };

/** The live theme's ground: html 700, and the kit's button reset. */
const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;line-height:50px;padding:0 18px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,.elementor-kit-331 button:active{background-color:#F08080}
 .dccgg-item-report .fas{display:inline-block;width:14px}`;
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
<div class="elementor-widget ${markup === MARKUP.grid ? 'dccgg-layout-grid' : 'dccgg-layout-app'}" data-id="2afb24b">${markup}</div></div></div></div>
${chunkBootTag(SRC)}<script>${JS}</script></body></html>`;

const freezeClock = (ms) => `(() => {
  const F = ${ms}, R = Date;
  const D = function (...a) { return a.length ? new R(...a) : new R(F); };
  D.now = () => F; D.UTC = R.UTC; D.parse = R.parse; D.prototype = R.prototype;
  window.Date = D;
})();`;

const AT = (iso) => Date.parse(iso);

/** A confirmed stay: Thu 18 June 2026 to Sun 21 June 2026, Cottage 34. */
const STAY = {
    cottage: 'Cottage 34', checkIn: '2026-06-18', checkOut: '2026-06-21',
    timeIn: '14:00', timeOut: '11:00',
};
/** Mid-stay, 3pm Eastern on the Friday. June is EDT, UTC-4. */
const MIDSTAY = AT('2026-06-19T19:00:00Z');

const WEATHER = {
    current: { temperature_2m: 78.4, wind_speed_10m: 7.2 },
    daily: { sunset: ['2026-06-18T20:28', '2026-06-19T20:28', '2026-06-20T20:29'] },
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
        stay = null, weather = WEATHER, width = 390, height = 844,
    } = {}) => {
        const ctx = await browser.newContext({ viewport: { width, height },
            isMobile: width < 700, hasTouch: width < 700, timezoneId: tz });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.addInitScript(freezeClock(now));
        await routeChunks(page, A, SRC);
        const seen = { stayToken: null, posts: 0 };
        await page.route('**/admin-ajax.php*', (r) => {
            const url = r.request().url();
            if (r.request().method() === 'POST') { seen.posts++; }
            let body = { success: true, data: {} };
            if (/action=dccgg_stay/.test(url)) {
                seen.stayToken = new URL(url).searchParams.get('t');
                body = { success: true, data: { stay } };
            } else if (/action=dccgg_weather/.test(url)) {
                body = weather ? { success: true, data: weather } : { success: false, data: {} };
            }
            r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.route('https://dccgg.test/g**', (r) =>
            r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(MARKUP[markup]) }));
        await page.goto('https://dccgg.test/g' + query, { waitUntil: 'load' });
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
        check('with no token the welcome stays plain', await text(v.page, '[data-dccgg-welcome]') === 'Welcome');
        check('…the dates are not shown', !(await shown(v.page, '[data-dccgg-dates]')));
        check('…the progress bar is not shown', !(await shown(v.page, '[data-dccgg-progress]')));
        check('…and the server is never asked', v.seen.stayToken === null);
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
    {
        const v = await open({ query: '?t=4242.abcdef0123456789abcd', stay: STAY });
        check('the token on the link is the one sent', v.seen.stayToken === '4242.abcdef0123456789abcd');
        check('the welcome names the cottage',
            await text(v.page, '[data-dccgg-welcome]') === 'Welcome to Cottage 34');
        check('check-in reads "Thu 2:00 PM"', await text(v.page, '[data-dccgg-in]') === 'Thu 2:00 PM');
        check('check-out reads "Sun 11:00 AM"', await text(v.page, '[data-dccgg-out]') === 'Sun 11:00 AM');
        check('the dates are shown now', await shown(v.page, '[data-dccgg-dates]'));
        const pct = await v.page.$eval('[data-dccgg-progress-fill]', (e) => parseFloat(e.style.width));
        // Thu 2pm to Sun 11am is 69 hours; 3pm Friday is 25 of them, 36.2%.
        check('the progress bar is part way through the stay, not at either end',
            Math.abs(pct - 36.2) < 0.5, 'pct=' + pct);
        check('…and it tells a screen reader what it shows',
            /%$/.test(await v.page.$eval('[data-dccgg-progress]', (e) => e.getAttribute('aria-label') || '')));
        await shut(v);
    }
    {
        // A token the server will not vouch for: the same as no token.
        const v = await open({ query: '?t=9.deadbeefdeadbeefdead', stay: null });
        check('an unresolvable token shows the plain welcome, not a guess',
            await text(v.page, '[data-dccgg-welcome]') === 'Welcome'
            && !(await shown(v.page, '[data-dccgg-dates]')));
        await shut(v);
    }
    {
        // Before check-in and after check-out: clamped, never negative or >100.
        for (const [label, when, want] of [
            ['before arrival', AT('2026-06-17T12:00:00Z'), 0],
            ['after departure', AT('2026-06-25T12:00:00Z'), 100],
        ]) {
            const v = await open({ now: when, query: '?t=1.aaaaaaaaaaaaaaaaaaaa', stay: STAY });
            const pct = await v.page.$eval('[data-dccgg-progress-fill]', (e) => parseFloat(e.style.width));
            check(`${label}: the bar reads ${want}%, not out of range`, pct === want, 'pct=' + pct);
            await shut(v);
        }
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
        // past_days=1 is in the request, so index 0 is YESTERDAY. Picking by
        // position would print last night's sunset all day.
        const v = await open({ weather: { current: {},
            daily: { sunset: ['2026-06-18T20:00', '2026-06-19T20:28'] } } });
        check('sunset is picked by today\'s date, not by its position in the array',
            await text(v.page, '[data-dccgg-now-rows]') === 'Sunset 8:28 PM',
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
        const v = await open({ query: '?t=1.aaaaaaaaaaaaaaaaaaaa', stay: STAY });
        await v.page.tap('.dccgg-tile[data-key="checkout"]');
        await v.page.waitForTimeout(650);
        const total = await v.page.$$eval(
            '.dccgg-detail[data-key="checkout"] .dccgg-item[data-checkable="1"]', (e) => e.length);
        check('the sheet names the day, the time and the count',
            await text(v.page, '[data-dccgg-due]') === `Sunday by 11:00 AM · 0 of ${total} done`,
            await text(v.page, '[data-dccgg-due]'));
        await v.page.tap('.dccgg-detail[data-key="checkout"] .dccgg-item[data-checkable="1"] .dccgg-item-check');
        await v.page.waitForTimeout(350);
        check('…and keeps up as the guest ticks',
            await text(v.page, '[data-dccgg-due]') === `Sunday by 11:00 AM · 1 of ${total} done`,
            await text(v.page, '[data-dccgg-due]'));
        await v.page.tap('.dccgg-detail[data-key="checkout"] .dccgg-checklist-reset');
        await v.page.waitForTimeout(350);
        check('…and Reset puts it back', await text(v.page, '[data-dccgg-due]')
            === `Sunday by 11:00 AM · 0 of ${total} done`);
        check('nothing was sent to the server', v.seen.posts === 0);
        await shut(v);
    }
    {
        const v = await open();
        await v.page.tap('.dccgg-tile[data-key="checkout"]');
        await v.page.waitForTimeout(650);
        const due = await text(v.page, '[data-dccgg-due]');
        check('with no stay it counts but names no day', /^\d+ of \d+ done$/.test(due), due);
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

        await v.page.tap('.dccgg-tile[data-key="internet"]');
        await v.page.waitForTimeout(650);
        const inSheet = await text(v.page,
            '.dccgg-detail[data-key="internet"] .dccgg-report-pill--section .dccgg-report-pill-label');
        check('the pill inside a section names that section',
            inSheet === 'Internet Not Working? Tell the Front Desk', inSheet);
        check('…and carries the section as the report\'s context',
            await v.page.$eval('.dccgg-detail[data-key="internet"] .dccgg-report-pill--section',
                (e) => e.dataset.reportSection) === 'Internet');
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
