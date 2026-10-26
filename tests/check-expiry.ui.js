/**
 * DCC Guest Guide — checklist ticks expire, matched to the stay (v0.25.2).
 *
 *   A. no stay: ticks go 48 hours after the LAST tick, not after each one;
 *   B. a stay with a checkout date: ticks live until the end of the day AFTER
 *      checkout, in the property's timezone — so a seven-night guest does not
 *      lose them on their third morning;
 *   C. the property clock is Eastern whatever the phone is set to, across a
 *      daylight-saving boundary;
 *   D. a tick stored by an older version is kept, not discarded;
 *   E. Reset still works, and none of this reaches the server.
 *
 *   node tests/check-expiry.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/check-expiry.ui.js
 *
 * THE CLOCK IS STUBBED, and it has to be: every assertion here is about a
 * boundary hours or days away. Date is replaced before any script runs, so
 * widget.js reads the frozen instant through Date.now() and new Date() alike.
 * Intl still does real timezone maths on that instant, which is the point —
 * the Eastern conversion is exercised, not mocked.
 *
 * The browser's own timezone is set to something that is NOT Eastern in every
 * case. A guest reads this guide from wherever they live, and checkout is a
 * time in Florida; if any of these passed only because the device agreed with
 * the property, they would be testing nothing.
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

const KIT = `html{font-weight:700}
 body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0;padding:0 16px}
 .elementor-kit-331 button{font-family:Pavanam,sans-serif;font-size:18px;font-weight:900;line-height:50px;padding:0 18px}`;
const pageFor = (markup) => `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><style>${KIT}</style></head>
<body class="elementor-kit-331"><div class="site"><div class="content"><div class="entry">
<div class="elementor-widget dccgg-layout-grid" data-id="2afb24b">${markup}</div></div></div></div>
${chunkBootTag(SRC)}<script>${JS}</script></body></html>`;

/** Replace Date before any page script runs, so the guide sees a fixed now. */
const freezeClock = (ms) => `(() => {
  const F = ${ms}, R = Date;
  const D = function (...a) { return a.length ? new R(...a) : new R(F); };
  D.now = () => F; D.UTC = R.UTC; D.parse = R.parse; D.prototype = R.prototype;
  window.Date = D;
})();`;

const AT = (iso) => Date.parse(iso);
const KEY = (stay) => 'dccgg:check:2afb24b:' + stay;

let pass = 0, fail = 0; const failures = [];
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium') });
    const errors = [];

    /**
     * Seed a stored set, open the Checkout sheet at a frozen instant, and
     * report what survived. `tz` is the DEVICE timezone, never Eastern.
     */
    const visit = async ({ query = '', now, seed = null, tz = 'Europe/Berlin' }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 900 },
            isMobile: true, hasTouch: true, timezoneId: tz });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.addInitScript(freezeClock(now));
        await routeChunks(page, A, SRC);
        let posted = 0;
        await page.route('**/admin-ajax.php', (r) => { posted++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{}}' }); });
        await page.route('https://dccgg.test/g/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: pageFor(emit('all-on')) }));
        await page.goto('https://dccgg.test/g/' + query, { waitUntil: 'domcontentloaded' });
        if (seed) await page.evaluate((s) => { localStorage.setItem(s.k, JSON.stringify(s.v)); }, seed);
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(550);
        await page.tap('.dccgg-tile[data-key="checkout"]');
        await page.waitForTimeout(650);
        const r = await page.evaluate(() => ({
            ticks: [...document.querySelectorAll('.dccgg-detail:not([hidden]) .dccgg-item[data-checkable="1"]')]
                .map((i) => i.dataset.checked || '0'),
            store: Object.keys(localStorage).filter((k) => k.indexOf('dccgg:check') === 0)
                .reduce((o, k) => (o[k] = JSON.parse(localStorage.getItem(k) || '{}'), o), {}),
        }));
        return { ctx, page, kept: r.ticks[0] === '1', entries: Object.values(r.store)[0] || {}, posted: () => posted };
    };
    const done = async (v) => { await v.ctx.close(); };

    console.log('\nA. No stay: 48 hours after the last tick');
    for (const [label, tickedAt, want] of [
        ['one hour ago',        '2026-06-10T11:00:00Z', true],
        ['47 hours ago',        '2026-06-08T13:00:00Z', true],
        ['exactly 48 hours ago','2026-06-08T12:00:00Z', true],
        ['49 hours ago',        '2026-06-08T11:00:00Z', false],
    ]) {
        const v = await visit({ now: AT('2026-06-10T12:00:00Z'),
            seed: { k: KEY('default'), v: { 'checkout:c1': { t: AT(tickedAt) } } } });
        check(`ticked ${label}: ${want ? 'kept' : 'dropped'}`, v.kept === want,
            `kept=${v.kept} entries=${JSON.stringify(v.entries)}`);
        if (!want) check(`…and the stored set is emptied, not left behind`,
            Object.keys(v.entries).length === 0, JSON.stringify(v.entries));
        await done(v);
    }
    {
        // "After the LAST tick" — a fresh tick keeps older ones alive.
        const v = await visit({ now: AT('2026-06-10T12:00:00Z'), seed: { k: KEY('default'), v: {
            'checkout:c1': { t: AT('2026-06-08T11:00:00Z') },   // 49h, would go alone
            'checkout:c2': { t: AT('2026-06-10T11:00:00Z') },   // 1h, keeps the set alive
        } } });
        check('an old tick survives beside a recent one', v.kept === true,
            JSON.stringify(v.entries));
        check('…and both are still stored', Object.keys(v.entries).length === 2, JSON.stringify(v.entries));
        await done(v);
    }

    console.log('\nB. A stay with a checkout date: the end of the day after checkout');
    const STAY = 'jane-2026-06-14';   // checkout on the 14th
    for (const [label, nowISO, want] of [
        ['checkout day, 09:00 ET',          '2026-06-14T13:00:00Z', true],
        ['the day after, 23:00 ET',         '2026-06-16T03:00:00Z', true],
        ['two days after, 00:30 ET',        '2026-06-16T04:30:00Z', false],
    ]) {
        const v = await visit({ query: '?stay=' + STAY, now: AT(nowISO),
            seed: { k: KEY(STAY), v: { 'checkout:c1': { t: AT('2026-06-12T10:00:00Z') } } } });
        check(`${label}: ${want ? 'kept' : 'dropped'}`, v.kept === want,
            `kept=${v.kept} entries=${JSON.stringify(v.entries)}`);
        await done(v);
    }
    {
        // The reason this rule exists: a flat 48 hours would erase a long
        // stay's ticks partway through it.
        const v = await visit({ query: '?stay=' + STAY, now: AT('2026-06-10T12:00:00Z'),
            seed: { k: KEY(STAY), v: { 'checkout:c1': { t: AT('2026-06-08T11:00:00Z') } } } });
        check('a seven-night guest keeps a 49-hour-old tick mid-stay', v.kept === true,
            JSON.stringify(v.entries));
        await done(v);
    }
    {
        // ?out= is the parameter to add to a guest link: it carries the date
        // without changing ?stay=, which is part of the STORAGE KEY — changing
        // that would discard every tick the guest had already made.
        // The tick is 30 MINUTES old, so the 48-hour rule would keep it. Only
        // the checkout date drops it — which is what makes this case prove the
        // ?out= branch is read at all. An older tick would have been dropped
        // either way and the assertion would have been worthless.
        const v = await visit({ query: '?stay=jane-june&out=2026-06-14', now: AT('2026-06-16T04:30:00Z'),
            seed: { k: KEY('jane-june'), v: { 'checkout:c1': { t: AT('2026-06-16T04:00:00Z') } } } });
        check('?out= supplies the date when ?stay= has none', v.kept === false,
            JSON.stringify(v.entries));
        const v2 = await visit({ query: '?stay=jane-june', now: AT('2026-06-16T04:30:00Z'),
            seed: { k: KEY('jane-june'), v: { 'checkout:c1': { t: AT('2026-06-16T04:00:00Z') } } } });
        check('…and without it a dated-looking stay falls back to 48 hours', v2.kept === true,
            JSON.stringify(v2.entries));
        await done(v); await done(v2);
    }

    console.log('\nC. The property clock, not the phone\'s');
    for (const tz of ['Europe/Berlin', 'Asia/Tokyo', 'America/Los_Angeles']) {
        const v = await visit({ query: '?stay=' + STAY, now: AT('2026-06-16T03:00:00Z'), tz,
            seed: { k: KEY(STAY), v: { 'checkout:c1': { t: AT('2026-06-12T10:00:00Z') } } } });
        check(`device in ${tz}: still kept at 23:00 Eastern`, v.kept === true, JSON.stringify(v.entries));
        await done(v);
        const v2 = await visit({ query: '?stay=' + STAY, now: AT('2026-06-16T04:30:00Z'), tz,
            seed: { k: KEY(STAY), v: { 'checkout:c1': { t: AT('2026-06-12T10:00:00Z') } } } });
        check(`device in ${tz}: dropped at 00:30 Eastern`, v2.kept === false, JSON.stringify(v2.entries));
        await done(v2);
    }
    {
        // US clocks go back on 1 November 2026, so that Eastern day is 25 hours
        // long. A naive UTC offset lands an hour out, on the wrong side of the
        // boundary — which is the whole reason the offset is resolved twice.
        const DST = 'sam-2026-10-31';
        const v = await visit({ query: '?stay=' + DST, now: AT('2026-11-02T04:30:00Z'),
            seed: { k: KEY(DST), v: { 'checkout:c1': { t: AT('2026-10-30T10:00:00Z') } } } });
        check('across the DST change: 23:30 on the 25-hour day is still inside', v.kept === true,
            JSON.stringify(v.entries));
        await done(v);
        const v2 = await visit({ query: '?stay=' + DST, now: AT('2026-11-02T05:30:00Z'),
            seed: { k: KEY(DST), v: { 'checkout:c1': { t: AT('2026-10-30T10:00:00Z') } } } });
        check('…and 00:30 the next day is outside', v2.kept === false, JSON.stringify(v2.entries));
        await done(v2);
    }

    console.log('\nD. A tick from an older version');
    {
        // Pre-v0.25.2 entries are a bare `true`. Discarding them would cost a
        // guest mid-stay the ticks they had already made, for nothing.
        const v = await visit({ now: AT('2026-06-10T12:00:00Z'),
            seed: { k: KEY('default'), v: { 'checkout:c1': true } } });
        check('a legacy `true` is kept', v.kept === true, JSON.stringify(v.entries));
        check('…and stamped with a time, so it can expire later',
            !!(v.entries['checkout:c1'] && typeof v.entries['checkout:c1'].t === 'number'),
            JSON.stringify(v.entries));
        await done(v);
    }
    {
        const v = await visit({ now: AT('2026-06-10T12:00:00Z'),
            seed: { k: KEY('default'), v: { 'checkout:c1': 'nonsense' } } });
        check('a value of the wrong shape is discarded rather than trusted',
            v.kept === false && Object.keys(v.entries).length === 0, JSON.stringify(v.entries));
        await done(v);
    }

    console.log('\nE. Ticking, Reset, and the server');
    {
        const v = await visit({ now: AT('2026-06-10T12:00:00Z') });
        await v.page.tap('.dccgg-detail:not([hidden]) .dccgg-item-title-text');
        await v.page.waitForTimeout(300);
        let r = await v.page.evaluate(() => JSON.parse(localStorage.getItem('dccgg:check:2afb24b:default') || '{}'));
        check('a new tick stores a timestamp', typeof (Object.values(r)[0] || {}).t === 'number', JSON.stringify(r));
        check('…and it is the frozen clock, not the wall clock',
            Object.values(r)[0].t === AT('2026-06-10T12:00:00Z'), JSON.stringify(r));
        // Unticking must REMOVE the entry: a false one would keep its
        // timestamp and go on holding the whole set alive.
        await v.page.tap('.dccgg-detail:not([hidden]) .dccgg-item-title-text');
        await v.page.waitForTimeout(300);
        r = await v.page.evaluate(() => JSON.parse(localStorage.getItem('dccgg:check:2afb24b:default') || '{}'));
        check('unticking removes the entry rather than storing false',
            Object.keys(r).length === 0, JSON.stringify(r));

        await v.page.tap('.dccgg-detail:not([hidden]) .dccgg-item-title-text');
        await v.page.waitForTimeout(300);
        const reset = await v.page.$('.dccgg-detail:not([hidden]) .dccgg-checklist-reset');
        check('Reset is still there', !!reset);
        if (reset) {
            await reset.tap(); await v.page.waitForTimeout(300);
            r = await v.page.evaluate(() => JSON.parse(localStorage.getItem('dccgg:check:2afb24b:default') || '{}'));
            check('Reset clears the store', Object.keys(r).length === 0, JSON.stringify(r));
        }
        check('none of this reached the server', v.posted() === 0, String(v.posted()));
        await done(v);
    }

    await browser.close();
    check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | '));
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(fail ? 1 : 0);
})();
