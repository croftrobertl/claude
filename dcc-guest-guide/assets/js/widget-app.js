/**
 * DCC Guest Guide — the app shell (v0.26.0).
 *
 * "A1 · Postcard Hero": the photo hero and its stay card, the live
 * "Tavares Now" strip, the bottom tab bar, the sheet gestures, and the
 * checkout sheet's "Sunday by 11:00 AM · 3 of 7 done" line.
 *
 * Loaded by core at init and ONLY when the page is in this layout — the gate
 * is `.dccgg-app-shell` on the root itself. Every other guide downloads none
 * of it.
 *
 * Three rules shape everything here:
 *
 *  1. NOTHING IS GUESSED. The greeting is the only thing this file invents,
 *     and it invents it from the clock. The cottage name and the dates come
 *     from a signed token resolved on the server, or they are absent. A
 *     weather row whose reading did not arrive is removed, not shown empty.
 *  2. THE PROPERTY'S CLOCK, not the phone's. Check-out is 11:00 AM in
 *     Florida whatever timezone the guest flew in from, so every date and
 *     every greeting is formatted in config.app.tz.
 *  3. OPENING AND CLOSING A SHEET IS CORE'S JOB. This file calls
 *     CORE.openDetail / CORE.closeDetail. It never portals, traps focus or
 *     locks scroll itself — there is one implementation of that and this is
 *     not it.
 */
(function () {
    'use strict';

    const CORE = window.DCCGG_CORE;
    if (!CORE) { return; }
    const { bindGlobal, dccggFetchGet, openDetail, closeDetail } = CORE;

    /** printf-style %s / %1$s / %1$d, the subset the PHP strings use. */
    function fmt(tpl, args) {
        let i = 0;
        return String(tpl == null ? '' : tpl).replace(/%(?:(\d+)\$)?[sd]/g, (m, n) => {
            const v = args[n ? (parseInt(n, 10) - 1) : i++];
            return v == null ? '' : String(v);
        });
    }

    /** Parts of an instant in the property's timezone, as a plain object. */
    function partsIn(tz, date, opts) {
        const out = {};
        try {
            new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: tz }, opts))
                .formatToParts(date)
                .forEach((p) => { out[p.type] = p.value; });
        } catch (_) { /* an unknown tz falls back to nothing, and callers cope */ }
        return out;
    }

    /**
     * A local wall-clock string ("2026-06-18T14:00") as a real instant in tz.
     *
     * Two passes, for the same reason endOfPropertyDay() in core takes two:
     * the UTC offset depends on the instant, so the first guess can land on
     * the wrong side of a DST boundary and the second corrects it.
     */
    function instantAt(tz, iso, hhmm) {
        const [y, mo, d] = iso.split('-').map(Number);
        const [h, mi] = (hhmm && /^\d{1,2}:\d{2}$/.test(hhmm) ? hhmm : '0:00').split(':').map(Number);
        const wall = Date.UTC(y, mo - 1, d, h, mi, 0);
        let guess = wall;
        for (let pass = 0; pass < 2; pass++) {
            const p = partsIn(tz, new Date(guess), {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false,
            });
            if (!p.year) { return new Date(wall); }
            const seen = Date.UTC(+p.year, +p.month - 1, +p.day,
                p.hour === '24' ? 0 : +p.hour, +p.minute, 0);
            guess = guess + (wall - seen);
        }
        return new Date(guess);
    }



    /** "11:00 AM" from "11:00". */
    function clock12(tz, hhmm) {
        if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) { return ''; }
        const t = partsIn(tz, instantAt(tz, '2000-01-01', hhmm),
            { hour: 'numeric', minute: '2-digit', hour12: true });
        return t.hour ? (t.hour + ':' + t.minute + ' ' + String(t.dayPeriod || '').toUpperCase()) : '';
    }

    // -- The hero ---------------------------------------------------------

    /**
     * The greeting, from the property's clock.
     *
     * Written here rather than on the server because this page is served from
     * a full-page cache: a server-rendered "Good morning" would still say so
     * at ten at night, to the very guest the whole design is for.
     */
    function paintGreeting(root, app) {
        const el = root.querySelector('[data-dccgg-greeting]');
        if (!el) { return; }
        const p = partsIn(app.tz, new Date(), { hour: 'numeric', hour12: false });
        const h = p.hour === undefined ? new Date().getHours() : (p.hour === '24' ? 0 : +p.hour);
        const S = app.strings || {};
        const text = h < 12 ? S.morning : (h < 18 ? S.afternoon : S.evening);
        if (!text) { return; }
        el.textContent = text;
        el.hidden = false;
    }

    /*
     * THE STAY CARD IS GONE, and so is everything that fed it.
     *
     * v0.26.0 resolved a signed `?t=` token to a booking and painted the
     * cottage name, the two dates and a progress bar. Rob's decision is that
     * no per-guest link will be sent, so there is no booking to name — and
     * the resolver, its endpoint and its secret were removed rather than left
     * idle, because an unused public endpoint backed by a secret is something
     * we would have to defend for nothing.
     *
     * What is left of it is the greeting above, which needs no guest.
     */

    // -- "Tavares Now" ----------------------------------------------------

    /**
     * Temperature, wind and sunset, from the proxy the conditions card
     * already uses. A reading that is not a finite number is not a reading:
     * its row is left out, and a strip with no rows stays hidden.
     */
    function wireNow(root, config, app) {
        const strip = root.querySelector('[data-dccgg-now]');
        const rows  = root.querySelector('[data-dccgg-now-rows]');
        if (!strip || !rows || !config.cottageLat || !config.cottageLng) { return; }
        dccggFetchGet(config, 'dccgg_weather', {
            lat: String(config.cottageLat), lng: String(config.cottageLng),
        })
            .then((r) => r.json())
            .then((j) => {
                const d = (j && j.success && j.data) || {};
                const cur = d.current || {};
                const out = [];
                const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;

                const temp = num(cur.temperature_2m);
                if (temp !== null) { out.push(Math.round(temp) + '°'); }

                const wind = num(cur.wind_speed_10m);
                if (wind !== null) { out.push(Math.round(wind) + ' mph'); }

                // v0.26.2: ONE source for the sun's times. The server picks
                // today's row out of the daily arrays — by date, since
                // past_days=1 means index 0 is yesterday — and the Conditions
                // card reads the same `sunToday`, so the two can no longer
                // disagree by a minute the way they did on staging.
                const sunset = d.sunToday && d.sunToday.sunset;
                if (/^\d{1,2}:\d{2}$/.test(sunset || '')) {
                    const c = clock12(app.tz, sunset);
                    const label = (app.strings && app.strings.sunset) || '';
                    if (c) { out.push(label ? (label + ' ' + c) : c); }
                }

                if (!out.length) { return; }
                rows.textContent = out.join(' · ');
                strip.hidden = false;
            })
            .catch(() => { /* no strip. Silence beats a wrong number. */ });
    }

    // -- The checkout line ------------------------------------------------

    /**
     * "Sunday by 11:00 AM · 3 of 7 done".
     *
     * The count is always true — it is read off the DOM, which is where the
     * ticks live. The deadline half appears only once a stay has resolved,
     * because without one there is no Sunday to name.
     */
    function paintDue(root, app) {
        const S = app.strings || {};
        // THE LIST IS HELD, NOT RE-QUERIED. The stage is moved to <body> the
        // moment a section opens, so root.querySelectorAll() finds nothing
        // from then on — measured: the line painted once and then froze at
        // "0 of 3" however many boxes the guest ticked. Same portal trap the
        // v0.25.1 body-copy rule fell into.
        (root.__dccggDues || []).forEach((el) => {
            const detail = el.closest('.dccgg-detail');
            if (!detail) { return; }
            const total = detail.querySelectorAll('.dccgg-item[data-checkable="1"]').length;
            const done  = detail.querySelectorAll('.dccgg-item[data-checkable="1"][data-checked="1"]').length;
            const parts = [];
            // "By 11:00 AM" and no weekday: the hour is the PROPERTY's and is
            // always true, while the day belonged to a booking this release
            // no longer resolves. Saying only what is known.
            const at = clock12(app.tz, app.timeOut || '');
            if (at) { parts.push(fmt(S.by, [at])); }
            if (total > 0) { parts.push(fmt(S.done, [done, total])); }
            el.textContent = parts.join(' · ');
        });
    }

    /**
     * Keep that line in step with the ticks.
     *
     * An observer rather than a second click listener: Reset clears the whole
     * list without a click on any row, and the order two document-level
     * listeners run in is not something a chunk should have to depend on.
     */
    function watchChecks(root, app) {
        const dues = Array.prototype.slice.call(root.querySelectorAll('[data-dccgg-due]'));
        root.__dccggDues = dues;
        if (!dues.length || typeof MutationObserver !== 'function') { return; }
        const obs = new MutationObserver(() => paintDue(root, app));
        dues.forEach((el) => {
            const detail = el.closest('.dccgg-detail');
            if (detail) {
                obs.observe(detail, { subtree: true, attributes: true, attributeFilter: ['data-checked'] });
            }
        });
        paintDue(root, app);
    }

    // -- The tab bar ------------------------------------------------------

    /**
     * Move the tab bar to <body>, and show it only while the guide is on
     * screen.
     *
     * TWO separate faults, both reported from Rob's phone on /test/.
     *
     * The bar is `position: fixed`, and on that page it rendered at y=5938
     * inside an 844px viewport — part-way up, with blank space beneath it.
     * Measured cause: `article.post-17685` carries a transform, which makes
     * it the containing block for every fixed descendant. A transform on a
     * theme's own article element is not ours to remove, so the bar leaves
     * the subtree instead. Its CSS is anchored on the bar itself for exactly
     * this reason — a `.dccgg-root …` rule would stop matching the moment it
     * moved, which is the same portal trap the stage has.
     *
     * And /test/ carries the Wildlife widget below the guide, so a bar fixed
     * to the viewport floated over it and read as one navigation shared by
     * two plugins that are strictly separate. It now shows only while the
     * guide root is intersecting the viewport.
     */
    function portalTabs(root) {
        const bar = root.querySelector('.dccgg-app-tabs');
        if (!bar || bar.__dccggPortaled) { return bar; }
        bar.__dccggPortaled = true;
        // The back-pointer every delegated handler uses to tell whose bar
        // this is once it is no longer inside the root.
        bar.__dccggRoot = root;
        const marker = document.createComment('dccgg-app-tabs-anchor');
        bar.parentNode.insertBefore(marker, bar);
        document.body.appendChild(bar);

        // Hidden until we know: a bar that flashes over the page below while
        // the observer makes up its mind is the complaint, in miniature.
        bar.dataset.dccggOffscreen = '1';
        const show = (on) => {
            if (on) { delete bar.dataset.dccggOffscreen; }
            else { bar.dataset.dccggOffscreen = '1'; }
        };
        let obs = null;
        if (typeof IntersectionObserver === 'function') {
            obs = new IntersectionObserver((entries) => {
                entries.forEach((e) => show(e.isIntersecting));
            });
            obs.observe(root);
        } else {
            show(true);   // no observer, no scoping — better than no bar.
        }

        (root.__dccggDisposers || (root.__dccggDisposers = [])).push(() => {
            if (obs) { obs.disconnect(); }
            if (marker.parentNode) { marker.parentNode.insertBefore(bar, marker); marker.remove(); }
            else if (bar.parentNode === document.body) { bar.remove(); }
        });
        return bar;
    }

    function wireTabs(root, config, app) {
        const bar = portalTabs(root);
        const tabs = (bar || root).querySelectorAll('.dccgg-app-tab');
        if (!tabs.length) { return; }
        const mark = (active) => tabs.forEach((t) => {
            if (t === active) { t.setAttribute('aria-current', 'page'); }
            else { t.removeAttribute('aria-current'); }
        });
        tabs.forEach((tab) => {
            const act = tab.dataset.appTab;
            // Front Desk is bound DIRECTLY now. It used to ride the guest
            // bundle's delegated .dccgg-more-report listener, and that
            // listener asks `root.contains(el)` — which stopped being true
            // the moment the bar moved to <body>. `__dccggOpenReport` is the
            // hook that bundle already publishes for exactly this kind of
            // caller (v0.9.7.21), so there is still ONE report dialog and one
            // way into it.
            if (act === 'report') {
                tab.addEventListener('click', () => {
                    if (typeof root.__dccggOpenReport === 'function') {
                        root.__dccggOpenReport('', '', tab);
                    }
                });
                return;
            }
            tab.addEventListener('click', () => {
                if (act === 'stay') {
                    // No "close the sheet" branch, deliberately. The bar is
                    // display:none while a sheet is open — the sheet owns the
                    // screen, as the approved mockup shows — so Stay is only
                    // ever pressed from the hub, and a close here could not be
                    // reached to be tested. Back, Escape, the overlay and the
                    // sheet's own Back button all close it.
                    try { root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                    catch (_) { root.scrollIntoView(); }
                    mark(tab);
                    return;
                }
                if (act === 'menu') {
                    // No section chosen: the Guide tab is the full list.
                    const menu = root.querySelector('.dccgg-menu');
                    if (menu) {
                        try { menu.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                        catch (_) { menu.scrollIntoView(); }
                    }
                    mark(tab);
                    return;
                }
                const key = tab.dataset.appTabKey;
                if (key) { openDetail(root, key); mark(tab); }
            });
        });
        // Closing a sheet by any route puts the bar back on Stay, so the bar
        // never claims the guest is somewhere they are not.
        root.__dccggAppOnClose = () => mark(tabs[0]);
    }

    // -- The sheet: swipe down, and the Back button -----------------------

    /**
     * Back closes the sheet.
     *
     * Observing the open class rather than wrapping open/close keeps this
     * decoupled from every route in and out — a tile, a tab, a search result,
     * Escape, the overlay and the Back button all end up here.
     *
     * `popping` is the guard that stops the two mechanisms chasing each
     * other: a close we performed ourselves rewinds the history entry, and
     * the popstate that produces must not then try to close again.
     */
    function wireSheetHistory(root, app) {
        if (typeof MutationObserver !== 'function' || !window.history || !history.pushState) { return; }
        // THE BROWSER MUST NOT RESTORE SCROLL FOR OUR OWN ENTRY.
        //
        // Closing a sheet rewinds the history entry the open pushed, and on a
        // history navigation the browser applies its own saved scroll offset
        // — which is not the one core just restored. Measured on live /test/
        // at 390: close from scrollY 756 and the page ends at 0, every time.
        // "Jumps to the top" is this, not only the theme's smooth scrolling.
        //
        // 'manual' says we own it, which we do: hideDetailModal() puts the
        // guest back where they were, instantly, in the same tick.
        try {
            if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }
        } catch (_) { /* some embedded webviews throw on the setter */ }
        let pushed = false;
        let popping = false;
        const isOpen = () => document.documentElement.classList.contains('dccgg-detail-open');

        const obs = new MutationObserver(() => {
            const open = isOpen();
            if (open && !pushed) {
                try { history.pushState({ dccggSheet: 1 }, ''); pushed = true; } catch (_) {}
            } else if (!open && pushed) {
                pushed = false;
                popping = true;
                try { history.back(); } catch (_) { popping = false; }
                if (typeof root.__dccggAppOnClose === 'function') { root.__dccggAppOnClose(); }
            }
        });
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        bindGlobal(root, window, 'popstate', () => {
            if (popping) { popping = false; return; }
            if (pushed && isOpen()) { pushed = false; closeDetail(root); }
        });
    }

    /*
     * SWIPE-DOWN IS NOT HERE, AND THAT IS THE POINT.
     *
     * The brief lists it as part of the sheet behaviour to build. Measured
     * first: core has had it since v0.12.5 — wireSheetDrag() in widget.js,
     * engaging below 600px within 60px of the sheet top, dismissing past
     * 140px or a flick over 0.5px/ms, and already handling the pointercancel
     * and Safari-touchmove cases that a second implementation would have to
     * rediscover. What v0.26.0 adds is the grab handle, so a guest can SEE
     * that the top of the sheet is grippable, and the Back button above.
     *
     * A second drag handler bound to the same stage would have fought the
     * first for the same gesture. Nothing to build.
     */

    /**
     * Answer the finger at once.
     *
     * v0.24.2 put the tap colour on touchEND on purpose: a finger that rests
     * and then scrolls cannot be told from a tap while it is still down. That
     * reasoning holds, so this adds a *separate* pressed state on touchstart
     * and takes it off again the moment the finger moves or the page scrolls.
     * The guest gets an answer immediately; a scroll still never paints one.
     */
    function wirePressFeedback(root) {
        let pressed = null;
        const release = () => {
            if (pressed) { pressed.classList.remove('is-pressing'); pressed = null; }
        };
        root.addEventListener('touchstart', (e) => {
            const tile = e.target.closest('.dccgg-tile');
            if (!tile || !root.contains(tile)) { return; }
            release();
            pressed = tile;
            tile.classList.add('is-pressing');
        }, { passive: true });
        ['touchmove', 'touchend', 'touchcancel'].forEach((type) => {
            root.addEventListener(type, release, { passive: true });
        });
        bindGlobal(root, window, 'scroll', release, { passive: true });
    }

    /**
     * Warm the first sheet while the guest is still reading the hub.
     *
     * Every panel is already in the DOM — the server renders them all and
     * hides them — so there is nothing to fetch. What is NOT done until the
     * first open is decoding the images inside them, on the main thread, at
     * the moment the guest is waiting. This does that in idle time instead.
     */
    function preloadFirstDetail(root) {
        const run = () => {
            root.querySelectorAll('.dccgg-detail img').forEach((img) => {
                if (img.decode) { img.decode().catch(() => {}); }
            });
        };
        if (typeof requestIdleCallback === 'function') { requestIdleCallback(run, { timeout: 4000 }); }
        else { setTimeout(run, 1200); }
    }

    // -- Entry point ------------------------------------------------------

    (window.DCCGG_CHUNK = window.DCCGG_CHUNK || {}).app = function (root, config) {
        if (root.__dccggAppWired) { return; }
        const app = config && config.app;
        if (!app) { return; }
        root.__dccggAppWired = true;
        app.tz = app.tz || 'America/New_York';
        // watchChecks FIRST: it is what collects the due lines, and the stay
        // fetch repaints them the moment it lands.
        watchChecks(root, app);
        paintGreeting(root, app);
        wireNow(root, config, app);
        wireTabs(root, config, app);
        wirePressFeedback(root);
        preloadFirstDetail(root);
        wireSheetHistory(root, app);
    };
}());
