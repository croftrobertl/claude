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

    /** "Thu 2:00 PM", or "Thu" when the property keeps no time for it. */
    function dayTime(tz, iso, hhmm) {
        const at = instantAt(tz, iso, hhmm || '12:00');
        const p = partsIn(tz, at, { weekday: 'short' });
        const day = p.weekday || '';
        if (!hhmm) { return day; }
        const t = partsIn(tz, at, { hour: 'numeric', minute: '2-digit', hour12: true });
        const clock = t.hour ? (t.hour + ':' + t.minute + ' ' + String(t.dayPeriod || '').toUpperCase()) : '';
        return clock ? (day + ' ' + clock) : day;
    }

    /** "Sunday" — the full weekday, for the checkout line. */
    function weekdayLong(tz, iso) {
        return partsIn(tz, instantAt(tz, iso, '12:00'), { weekday: 'long' }).weekday || '';
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

    /** The token on the link, or ''. */
    function stayToken() {
        try { return (new URLSearchParams(window.location.search).get('t') || '').trim(); }
        catch (_) { return ''; }
    }

    /**
     * Fill the stay card from a resolved booking.
     *
     * Called only with a stay the server vouched for. With no token, a bad
     * token or an unresolvable one, this never runs and the card keeps the
     * plain welcome it was rendered with — which is the whole specification
     * for that case: show the plain welcome and never guess.
     */
    function paintStay(root, app, stay) {
        const S = app.strings || {};
        if (stay.cottage && S.welcomeTo) {
            const h = root.querySelector('[data-dccgg-welcome]');
            if (h) { h.textContent = fmt(S.welcomeTo, [stay.cottage]); }
        }
        const inEl  = root.querySelector('[data-dccgg-in]');
        const outEl = root.querySelector('[data-dccgg-out]');
        const dates = root.querySelector('[data-dccgg-dates]');
        if (inEl && outEl && dates) {
            inEl.textContent  = dayTime(app.tz, stay.checkIn,  stay.timeIn);
            outEl.textContent = dayTime(app.tz, stay.checkOut, stay.timeOut);
            dates.hidden = false;
        }
        // How far through the stay they are. Clamped, so an early arrival
        // reads empty rather than negative and a late checkout reads full.
        const start = instantAt(app.tz, stay.checkIn,  stay.timeIn  || '15:00').getTime();
        const end   = instantAt(app.tz, stay.checkOut, stay.timeOut || '11:00').getTime();
        const bar   = root.querySelector('[data-dccgg-progress]');
        const fill  = root.querySelector('[data-dccgg-progress-fill]');
        if (bar && fill && end > start) {
            const pct = Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
            fill.style.width = pct.toFixed(1) + '%';
            bar.hidden = false;
            bar.setAttribute('role', 'img');
            bar.setAttribute('aria-label', Math.round(pct) + '%');
        }
        root.__dccggStay = stay;
        paintDue(root, app);
    }

    function wireStay(root, config, app) {
        paintGreeting(root, app);
        const token = stayToken();
        if (!token) { return; }
        dccggFetchGet(config, 'dccgg_stay', { t: token })
            .then((r) => r.json())
            .then((j) => {
                const stay = j && j.success && j.data && j.data.stay;
                if (stay && stay.checkIn && stay.checkOut) { paintStay(root, app, stay); }
            })
            .catch(() => { /* no stay details, same as no token. Never a guess. */ });
    }

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

                const sunsets = (d.daily && d.daily.sunset) || [];
                // past_days=1 is in the request, so index 0 is YESTERDAY.
                // Pick by date instead of by position, or the strip shows last
                // night's sunset all day.
                const today = partsIn(app.tz, new Date(),
                    { year: 'numeric', month: '2-digit', day: '2-digit' });
                const todayISO = today.year ? (today.year + '-' + today.month + '-' + today.day) : '';
                const hit = sunsets.find((v) => typeof v === 'string' && v.slice(0, 10) === todayISO);
                if (hit) {
                    const c = clock12(app.tz, hit.slice(11, 16));
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
            const stay = root.__dccggStay;
            if (stay && stay.checkOut) {
                const day = weekdayLong(app.tz, stay.checkOut);
                const at  = clock12(app.tz, stay.timeOut || app.timeOut || '');
                if (day && at) { parts.push(fmt(S.by, [day, at])); }
                else if (day)  { parts.push(day); }
            }
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

    function wireTabs(root, config, app) {
        const tabs = root.querySelectorAll('.dccgg-app-tab');
        if (!tabs.length) { return; }
        const mark = (active) => tabs.forEach((t) => {
            if (t === active) { t.setAttribute('aria-current', 'page'); }
            else { t.removeAttribute('aria-current'); }
        });
        tabs.forEach((tab) => {
            const act = tab.dataset.appTab;
            // Front Desk is NOT handled here. It carries .dccgg-more-report,
            // and the guest bundle's delegated listener opens the one report
            // dialog — the same flow as every other way in.
            if (act === 'report') { return; }
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
        wireStay(root, config, app);
        wireNow(root, config, app);
        wireTabs(root, config, app);
        wireSheetHistory(root, app);
    };
}());
