(function () {
    'use strict';

    var SWIPE_THRESHOLD = 40;
    var REQUEST_THROTTLE_MS = 250;
    var WARM_HOVER_DELAY_MS = 60;

    // Run a DOM mutation inside a same-document View Transition when supported,
    // falling back to the bare call so legacy browsers see today's behavior.
    // Also skip the transition entirely when the user has requested reduced
    // motion — saves the transition setup cost and avoids any flicker.
    function withViewTransition(fn) {
        if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
            var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!reduceMotion) {
                try {
                    document.startViewTransition(fn);
                    return;
                } catch (e) { /* fall through to direct call */ }
            }
        }
        fn();
    }

    var FOCUSABLE_SELECTOR =
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
        'select:not([disabled]), textarea:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

    // Mobile swipe-to-close gesture for the bottom-sheet popups. Touch must
    // start at the top of the sheet (header zone) AND the sheet's body
    // must be scrolled to the top — both conditions ensure swiping doesn't
    // hijack content scroll. Closes on threshold (~80px) or fast flick.
    // No-op on devices without touch and skipped if reduced-motion is on
    // (the snap-back animation is the only motion source).
    function wireSwipeToClose(sheet, closeFn) {
        if (!sheet || !closeFn) return;
        if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;

        var startY = 0;
        var startX = 0;
        var startTime = 0;
        var dragging = false;
        var TOP_ZONE_PX = 80;     // touch must start here to engage drag
        var CLOSE_DELTA_PX = 80;  // straight-distance threshold
        var FLICK_VELOCITY = 0.5; // px/ms — alternative threshold

        sheet.addEventListener('touchstart', function (e) {
            if (!e.touches || !e.touches[0]) return;
            // Skip if the sheet is scrolled — let the browser handle scroll.
            if (sheet.scrollTop > 0) return;
            var rect = sheet.getBoundingClientRect();
            var y = e.touches[0].clientY;
            if (y - rect.top > TOP_ZONE_PX) return;
            startY = y;
            startX = e.touches[0].clientX;
            startTime = Date.now();
            dragging = true;
        }, { passive: true });

        sheet.addEventListener('touchmove', function (e) {
            if (!dragging || !e.touches || !e.touches[0]) return;
            var dx = e.touches[0].clientX - startX;
            var dy = e.touches[0].clientY - startY;
            // Cancel if horizontal sweep dominates (probably a swipe gesture
            // intended for something else).
            if (Math.abs(dx) > Math.abs(dy)) { dragging = false; return; }
            // Only follow the finger downward — upward should let the browser
            // do whatever it normally does.
            if (dy <= 0) return;
            sheet.style.transition = 'none';
            sheet.style.transform = 'translateY(' + dy + 'px)';
            sheet.classList.add('is-dragging');
        }, { passive: true });

        sheet.addEventListener('touchend', function (e) {
            if (!dragging) return;
            dragging = false;
            sheet.classList.remove('is-dragging');
            var touch = (e.changedTouches && e.changedTouches[0]) || null;
            var dy = touch ? touch.clientY - startY : 0;
            var dt = Math.max(1, Date.now() - startTime);
            var v = dy / dt;
            sheet.style.transition = '';
            sheet.style.transform = '';
            if (dy > CLOSE_DELTA_PX || v > FLICK_VELOCITY) {
                closeFn();
            }
        });

        sheet.addEventListener('touchcancel', function () {
            if (!dragging) return;
            dragging = false;
            sheet.classList.remove('is-dragging');
            sheet.style.transition = '';
            sheet.style.transform = '';
        });
    }

    function collectFocusables(container) {
        if (!container) return [];
        var nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            // offsetParent === null catches display:none ancestors. Width/
            // height check catches visibility:hidden. Doesn't matter that we
            // miss `position: fixed` w/ display:none ancestors — Tab order
            // already excludes those.
            if (n.offsetParent !== null || n.getClientRects().length > 0) {
                out.push(n);
            }
        }
        return out;
    }

    // Render a "Cottage NN: Name" title as two rows split at the first
    // colon. textContent + createElement keep this XSS-safe regardless of
    // what's in the post_title or override field. With no colon, falls back
    // to a single text node.
    function renderSplitTitle(parent, text) {
        parent.textContent = '';
        var idx = text.indexOf(':');
        if (idx < 0) {
            parent.appendChild(document.createTextNode(text));
            return;
        }
        var head = text.slice(0, idx + 1);
        var tail = text.slice(idx + 1).replace(/^\s+/, '');
        parent.appendChild(document.createTextNode(head));
        if (tail !== '') {
            parent.appendChild(document.createElement('br'));
            parent.appendChild(document.createTextNode(tail));
        }
    }

    // Track which cottages we've already warmed so rapid mouse-overs don't
    // re-issue the same image fetches.
    var warmedInfoIds = Object.create(null);

    function warmInfoPopup(root, typeId) {
        if (!typeId || warmedInfoIds[typeId]) return;
        var content = root.querySelector('.mphbac-info-content[data-room-type-id="' + typeId + '"]');
        if (!content) return;
        warmedInfoIds[typeId] = true;
        // Force fetch of every image referenced by the (hidden) popup content
        // into the browser HTTP cache. By the time the visitor taps to open
        // the popup, the cottage's photos are already on disk.
        var imgs = content.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) {
            var src = imgs[i].getAttribute('src');
            var srcset = imgs[i].getAttribute('srcset');
            if (src) { var w = new Image(); if (srcset) w.srcset = srcset; w.src = src; }
        }
        var sources = content.querySelectorAll('picture source');
        for (var j = 0; j < sources.length; j++) {
            var ss = sources[j].getAttribute('srcset');
            if (ss) { var ws = new Image(); ws.srcset = ss; }
        }
    }

    // Client-side availability cache. Filled two ways: every AJAX response is
    // stored on arrival, and scheduleAdjacentPrefetch() quietly fetches the
    // next/previous nav windows during idle time. A nav click whose window is
    // already here renders instantly with no spinner. TTL is kept well under
    // the server's 15-min transient TTL so entries can't outlive the data
    // they mirror by much.
    var prefetchCache = Object.create(null); // key -> { data, ts }
    var PREFETCH_TTL_MS = 5 * 60 * 1000;
    var PREFETCH_MAX_ENTRIES = 16;

    // Speculative prefetch only pays off when the endpoint is quick.
    // admin-ajax.php boots WordPress and every active plugin on every call; on
    // shared hosting that can run into seconds, and firing two extra requests
    // for a nav the visitor may never perform would then cost far more server
    // time than it saves. So latency is measured on every real request and
    // prefetching stays disabled until the endpoint demonstrates it is fast.
    // Starts at null (unknown) = off, so a slow site never pays the cost.
    var PREFETCH_MAX_LATENCY_MS = 800;
    var lastLatencyMs = null;

    // Add ?mphbac_debug=1 to any page URL to have the endpoint return its
    // internal timing breakdown, logged to the browser console. Off by default
    // so normal visitors never carry the extra payload.
    var DEBUG = (function () {
        try {
            return window.location.search.indexOf('mphbac_debug=1') >= 0;
        } catch (e) { return false; }
    }());

    function prefetchKey(config, from, to) {
        return (config.roomTypeIds || []).join(',') + '|' + from + '|' + to;
    }

    function trimPrefetchCache() {
        var keys = Object.keys(prefetchCache);
        if (keys.length <= PREFETCH_MAX_ENTRIES) return;
        keys.sort(function (a, b) { return prefetchCache[a].ts - prefetchCache[b].ts; });
        while (keys.length > PREFETCH_MAX_ENTRIES) {
            delete prefetchCache[keys.shift()];
        }
    }

    // Content signature of a grid payload. Used to skip the re-render when a
    // silent revalidate returns byte-identical data (the common case), so the
    // instant first paint isn't followed by a pointless DOM rebuild. The
    // server sorts type IDs and iterates days ascending, making key order
    // deterministic on both the embedded and AJAX paths.
    function dataSig(data) {
        return JSON.stringify([data.rooms, data.availability, data.from, data.to, data.bookedThrough || null]);
    }

    function fetchAvailability(config, from, to) {
        var body = new URLSearchParams();
        body.append('action', config.action || 'mphbac_query');
        body.append('from', from);
        body.append('to', to);
        (config.roomTypeIds || []).forEach(function (id) {
            body.append('room_type_ids[]', String(id));
        });
        return fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            body: body,
            headers: { 'Accept': 'application/json' }
        }).then(function (r) { return r.json(); }).then(function (json) {
            return (json && json.success && json.data) ? json.data : null;
        });
    }

    function prefetchWindow(config, from, to) {
        var key = prefetchKey(config, from, to);
        var hit = prefetchCache[key];
        if (hit && Date.now() - hit.ts < PREFETCH_TTL_MS) return;
        fetchAvailability(config, from, to).then(function (data) {
            if (data) {
                prefetchCache[key] = { data: data, ts: Date.now() };
                trimPrefetchCache();
            }
        }).catch(function () { /* prefetch is best-effort */ });
    }

    // After a grid renders, warm the two adjacent nav windows during idle so
    // arrow clicks / swipes paint from local cache with zero wait. Skipped for
    // filtered views — custom ranges rarely repeat, so prefetching them would
    // be wasted requests.
    function scheduleAdjacentPrefetch(config, state) {
        if (state.filtered) return;
        // Unknown or slow endpoint — don't speculate. (See lastLatencyMs.)
        if (lastLatencyMs === null || lastLatencyMs > PREFETCH_MAX_LATENCY_MS) return;
        var nextFrom, nextTo, prevFrom, prevTo;
        if (isMonthMode(config)) {
            // The windows prev/next actually navigate to: the whole N-month
            // span slid by one month either way. Must match shiftMonth()'s
            // arithmetic exactly or the cache keys never hit.
            var nMonths = deviceMonths(config);
            nextFrom = shiftMonthStr(state.from, 1);
            nextTo = monthWindowEnd(nextFrom, nMonths);
            prevFrom = shiftMonthStr(state.from, -1);
            prevTo = monthWindowEnd(prevFrom, nMonths);
        } else {
            var span = daysBetween(state.from, state.to) + 1;
            nextFrom = addDays(state.to, 1);
            nextTo = addDays(state.to, span);
            prevFrom = addDays(state.from, -span);
            prevTo = addDays(state.from, -1);
        }
        var run = function () {
            prefetchWindow(config, nextFrom, nextTo);
            prefetchWindow(config, prevFrom, prevTo);
        };
        if (window.requestIdleCallback) {
            window.requestIdleCallback(run, { timeout: 3000 });
        } else {
            setTimeout(run, 800);
        }
    }

    // Instant first paint from the availability the server embedded in
    // data-config. Slices the device's window out of the (larger) embedded
    // range and corrects "past" locally — a page served from a stale
    // full-page cache carries yesterday's notion of today. Returns true when
    // it painted; the caller then still fires a SILENT revalidate so a stale
    // embed (booking landed after the page was cached) self-corrects within
    // a second, without flashing the skeleton first.
    function tryRenderEmbedded(root, config, state) {
        var ini = config.initial;
        if (!ini || !ini.rooms || !ini.availability || !ini.from || !ini.to) return false;
        if (state.filtered) return false;
        if (!(ini.from <= state.from && state.to <= ini.to)) return false; // cache too stale to cover today's window
        var days = buildDayList(state.from, state.to);
        var today = config.today || '';
        var avail = {};
        var ok = true;
        Object.keys(ini.availability).forEach(function (tid) {
            var src = ini.availability[tid];
            var out = {};
            days.forEach(function (day) {
                var s = src[day];
                if (!s) { ok = false; return; }
                out[day] = (today && day < today) ? 'past' : s;
            });
            avail[tid] = out;
        });
        if (!ok) return false;
        // Hint parity with the AJAX path: bookedThrough is null unless the
        // sliced window is entirely booked (matching Ajax::handle()'s gate —
        // this must mirror it exactly or the revalidate's signature never
        // matches and every load re-renders). When it IS all booked, find the
        // first opening in the REST of the embedded range so the "booked
        // through" date reflects reality, not the slice edge; past the
        // embedded range, fall back to the server's forward-scan result.
        var bookedThrough = null;
        var windowHasAvail = days.some(function (day) {
            return Object.keys(avail).some(function (tid) { return avail[tid][day] === 'available'; });
        });
        // any_future mirror: a window of only past days must not compute a
        // bookedThrough (matches the server's gate in Ajax::handle()).
        var windowHasFuture = days.some(function (day) {
            return Object.keys(avail).some(function (tid) { return avail[tid][day] !== 'past'; });
        });
        if (!windowHasAvail && windowHasFuture) {
            bookedThrough = ini.bookedThrough || null;
            var rest = buildDayList(addDays(state.to, 1), ini.to);
            for (var i = 0; i < rest.length; i++) {
                var anyAvail = false;
                for (var t = 0; t < ini.rooms.length; t++) {
                    if ((ini.availability[ini.rooms[t].id] || {})[rest[i]] === 'available') { anyAvail = true; break; }
                }
                if (anyAvail) { bookedThrough = addDays(rest[i], -1); break; }
            }
        }
        var data = {
            rooms: ini.rooms,
            availability: avail,
            from: state.from,
            to: state.to,
            bookedThrough: bookedThrough
        };
        state.lastSig = dataSig(data);
        renderGrid(root, data, state, config);
        return true;
    }

    // The page-embedded availability is only trustworthy without a revalidate
    // when BOTH the data was fresh when it was baked in AND the HTML itself is
    // recent. Full-page caching (SpeedyCache) can serve identical markup for
    // hours, so page age is measured against the visitor's clock — a negative
    // result means the two clocks disagree, and we revalidate rather than
    // guess. Total staleness = age of the data at bake time + age of the page.
    var EMBED_FRESH_MAX_S = 300;

    function embedIsFresh(config) {
        var ini = config.initial;
        if (!ini || typeof ini.renderedAt !== 'number') return false;
        var ttl = typeof ini.ttl === 'number' ? ini.ttl : 900;
        var dataAge = typeof ini.dataAge === 'number' ? ini.dataAge : ttl;
        var pageAge = (Date.now() / 1000) - ini.renderedAt;
        if (!(pageAge >= 0)) return false;
        return (dataAge + pageAge) < Math.min(EMBED_FRESH_MAX_S, ttl);
    }

    // Run fn once the widget is at (or near) the viewport. On a homepage where
    // the calendar sits below the fold this keeps its admin-ajax traffic off
    // the critical path entirely — the request happens only if the visitor
    // actually scrolls down to it. rootMargin starts the fetch slightly early
    // so data is usually in place by the time the grid is on screen.
    // IntersectionObserver fires immediately for an already-visible element,
    // so an above-the-fold calendar is not delayed. A display:none widget
    // never fires, which is the behavior we want — no fetch for a hidden grid.
    function whenVisible(el, fn) {
        if (!window.IntersectionObserver) { fn(); return; }
        var fired = false;
        var obs = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (!entries[i].isIntersecting) continue;
                if (fired) return;
                fired = true;
                try { obs.disconnect(); } catch (e) { /* ignore */ }
                fn();
                return;
            }
        }, { rootMargin: '300px 0px' });
        obs.observe(el);
    }

    // Recompute config.today in the property timezone from the visitor's
    // clock. The page (and its data-config) may be served from a full-page
    // cache for hours, so the server-baked "today" can be stale — wrong
    // is-today highlight, default window starting a day early, date pickers
    // allowing a past check-in. Called at init AND before every request so a
    // tab left open across midnight ET rolls over too. Falls back to the
    // baked value if Intl or the timezone lookup is unavailable. 'en-CA'
    // formats as YYYY-MM-DD.
    function refreshToday(config) {
        try {
            var tzToday = new Intl.DateTimeFormat('en-CA', {
                timeZone: config.tz || 'America/New_York',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
            if (/^\d{4}-\d{2}-\d{2}$/.test(tzToday)) config.today = tzToday;
        } catch (e) { /* keep the current value */ }
    }

    function init(root) {
        if (!root || root.dataset.mphbacInit === '1') return;
        root.dataset.mphbacInit = '1';

        var config = {};
        try { config = JSON.parse(root.dataset.config || '{}'); } catch (e) { config = {}; }

        refreshToday(config);
        refreshDateMins(root, config);

        var state = {
            from: null,
            to: null,
            filtered: false,
            bucket: deviceBucket(),
            lastRequest: 0,
            pending: null,
            lastSig: null
        };
        applyDefaultWindow(config, state);

        wireFilters(root, config, state);
        wireNav(root, config, state);
        wireInfoPopup(root, config);
        wireSwipe(root, config, state);
        if (config.popupEnabled) {
            wirePopup(root, config, state);
        }
        wireResize(root, config, state);

        // Instant first paint from the server-embedded availability, which
        // costs no network at all — so it runs immediately even for a calendar
        // far below the fold.
        var painted = tryRenderEmbedded(root, config, state);

        // Everything past this point may hit admin-ajax.php, which on shared
        // hosting boots all of WordPress per call. So: skip it outright when
        // the embed is provably fresh, and otherwise defer until the widget is
        // near the viewport. A below-the-fold calendar that is never scrolled
        // to now issues zero requests.
        if (painted && embedIsFresh(config)) {
            return; // zero network on load
        }
        whenVisible(root, function () {
            request(root, config, state, painted ? { silent: true } : null);
        });
    }

    // Re-stamp the date inputs' min attributes from the (possibly corrected)
    // config.today — the server-baked values go stale under full-page caching.
    // The booking-sheet checkout min mirrors the server-side "+minNights" offset.
    function refreshDateMins(root, config) {
        var today = config.today;
        if (!today) return;
        var minN = Math.max(1, parseInt(config.minNights, 10) || 2);
        [['.mphbac-input-checkin', today], ['.mphbac-input-checkout', today],
         ['.mphbac-sheet-checkin', today], ['.mphbac-sheet-checkout', addDays(today, minN)]]
            .forEach(function (pair) {
                var el = root.querySelector(pair[0]);
                if (el) el.min = pair[1];
            });
    }

    function deviceBucket() {
        var w = window.innerWidth;
        if (w <= 600) return 'mobile';
        if (w <= 1024) return 'tablet';
        return 'desktop';
    }

    function deviceDays(config) {
        var bucket = deviceBucket();
        var n = bucket === 'mobile' ? config.daysMobile
              : bucket === 'tablet' ? config.daysTablet
              : config.daysDesktop;
        return Math.max(1, parseInt(n, 10) || 31);
    }

    function baseFrom(config) {
        return config.showPast ? addDays(config.today, -1) : config.today;
    }

    // ---- Month-grid helpers -------------------------------------------------
    // All operate on 'YYYY-MM-DD' strings and go through the same local-midnight
    // Date construction the strip already uses, so DST never shifts a boundary.

    function isMonthMode(config) {
        return !!(config && config.monthMode);
    }

    function monthStart(dateStr) {
        return dateStr.slice(0, 7) + '-01';
    }

    function monthEnd(dateStr) {
        var d = new Date(dateStr + 'T00:00:00');
        // Day 0 of the NEXT month is the last day of this one.
        var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return last.getFullYear() + '-' +
            String(last.getMonth() + 1).padStart(2, '0') + '-' +
            String(last.getDate()).padStart(2, '0');
    }

    // Step whole calendar months. Anchored on the 1st so month lengths never
    // cause the classic Jan-31 + 1 month => Mar-03 overflow.
    function shiftMonthStr(dateStr, delta) {
        var d = new Date(monthStart(dateStr) + 'T00:00:00');
        d.setMonth(d.getMonth() + delta);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    }

    // How many months this device shows side by side (Months shown control,
    // defaults 3/2/1). Same bucket logic as deviceDays.
    function deviceMonths(config) {
        var bucket = deviceBucket();
        var n = bucket === 'mobile' ? config.monthsMobile
              : bucket === 'tablet' ? config.monthsTablet
              : config.monthsDesktop;
        n = parseInt(n, 10);
        if (!(n >= 1)) n = 1;
        return Math.min(4, n);
    }

    // Last day of an N-month window that starts at the month containing
    // fromStr. The single source of window-end truth for month mode — nav,
    // defaults, filters, and prefetch all use it so their cache keys agree.
    function monthWindowEnd(fromStr, n) {
        return monthEnd(shiftMonthStr(fromStr, Math.max(1, n) - 1));
    }

    function applyDefaultWindow(config, state) {
        state.filtered = false;
        if (isMonthMode(config)) {
            // The window is the current month plus this device's following
            // months. render() embeds the LARGEST per-device span, so first
            // paint needs no request on any device.
            state.from = monthStart(config.today);
            state.to = monthWindowEnd(state.from, deviceMonths(config));
            return;
        }
        state.from = baseFrom(config);
        state.to = addDays(state.from, deviceDays(config) - 1);
    }

    function wireResize(root, config, state) {
        var timer = null;
        window.addEventListener('resize', function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                var bucket = deviceBucket();
                if (bucket === state.bucket) return;
                state.bucket = bucket;
                if (isMonthMode(config)) {
                    // Months shown is per-device (3/2/1), so crossing a
                    // breakpoint changes the window LENGTH. Keep the current
                    // first month as the anchor — don't yank the visitor back
                    // to today — and re-request with the new span.
                    state.to = monthWindowEnd(state.from, deviceMonths(config));
                    request(root, config, state);
                    return;
                }
                if (state.filtered) return; // keep an explicit filter range
                applyDefaultWindow(config, state);
                request(root, config, state);
            }, 200);
        });
    }

    function wireFilters(root, config, state) {
        var checkin = root.querySelector('.mphbac-input-checkin');
        var checkout = root.querySelector('.mphbac-input-checkout');
        var apply = root.querySelector('.mphbac-btn-apply');
        var reset = root.querySelector('.mphbac-btn-reset');
        var resetEmpty = root.querySelector('.mphbac-btn-reset-empty');

        function doApply() {
            var hasCi = checkin && checkin.value;
            var hasCo = checkout && checkout.value;
            state.filtered = !!(hasCi || hasCo);
            if (isMonthMode(config)) {
                // A month grid shows exactly one month, so a filter range
                // can't be the window. Jump to the month containing the
                // chosen check-in (or check-out if that's all they set) and
                // show that whole month; Reset returns to the current month.
                var anchor = (hasCi && checkin.value) || (hasCo && checkout.value) || config.today;
                state.from = monthStart(anchor);
                state.to = monthWindowEnd(state.from, deviceMonths(config));
                request(root, config, state);
                return;
            }
            state.from = hasCi ? checkin.value : baseFrom(config);
            state.to = hasCo ? checkout.value : addDays(state.from, deviceDays(config) - 1);
            // Typed dates bypass the min attribute (keyboard entry), so a
            // checkout before the window start can arrive here. An inverted
            // range 400s server-side and breaks nav spans — clamp instead.
            if (state.to < state.from) {
                state.to = state.from;
            }
            request(root, config, state);
        }

        function doReset() {
            if (checkin) checkin.value = '';
            if (checkout) checkout.value = '';
            applyDefaultWindow(config, state);
            request(root, config, state);
        }

        if (apply) apply.addEventListener('click', doApply);
        if (reset) reset.addEventListener('click', doReset);
        if (resetEmpty) resetEmpty.addEventListener('click', doReset);

        // When a check-in is chosen, default the check-out to check-in + the
        // minimum stay (two nights) unless the guest already picked a valid
        // one. If we have to FORCE the checkout (the user's choice is now
        // invalid), give visual + screen-reader feedback so the change isn't
        // silent.
        var filterStatus = root.querySelector('.mphbac-filter-status');
        var filterStatusTimer = null;
        if (checkin && checkout) {
            checkin.addEventListener('change', function () {
                if (!checkin.value) return;
                var minN = Math.max(1, parseInt(config.minNights, 10) || 2);
                var newMin = addDays(checkin.value, minN);
                checkout.min = newMin;
                var hadValue = !!checkout.value;
                var wasInvalid = hadValue && checkout.value <= checkin.value;
                if (!hadValue || wasInvalid) {
                    checkout.value = newMin;
                    if (wasInvalid) {
                        // Brief visual highlight (CSS handles the fade-out).
                        checkout.classList.add('mphbac-input--just-changed');
                        setTimeout(function () {
                            checkout.classList.remove('mphbac-input--just-changed');
                        }, 1500);
                        // Screen-reader announce. Clear-then-set so the same
                        // text on consecutive forced moves still announces.
                        if (filterStatus) {
                            clearTimeout(filterStatusTimer);
                            filterStatus.textContent = '';
                            requestAnimationFrame(function () {
                                var tmpl = (config.strings && config.strings.checkoutMoved)
                                    || 'Checkout date moved to {date}.';
                                filterStatus.textContent = tmpl.replace('{date}', newMin);
                                filterStatusTimer = setTimeout(function () {
                                    filterStatus.textContent = '';
                                }, 3000);
                            });
                        }
                    }
                }
            });
        }

        // Native date input fallback: if browser does not support type=date, use jQuery UI datepicker if available.
        var probe = document.createElement('input');
        probe.type = 'date';
        if (probe.type !== 'date' && window.jQuery && window.jQuery.fn && window.jQuery.fn.datepicker) {
            // Guarded: the single-cottage widget can omit the filter bar
            // entirely (Show date filters off), so these inputs may not exist.
            if (checkin) window.jQuery(checkin).datepicker({ dateFormat: 'yy-mm-dd' });
            if (checkout) window.jQuery(checkout).datepicker({ dateFormat: 'yy-mm-dd' });
        }
    }

    function wireNav(root, config, state) {
        var prev = root.querySelector('.mphbac-nav-prev');
        var next = root.querySelector('.mphbac-nav-next');
        var today = root.querySelector('.mphbac-nav-today');
        if (prev) prev.addEventListener('click', function () { shiftMonth(root, config, state, -1); });
        if (next) next.addEventListener('click', function () { shiftMonth(root, config, state, 1); });
        if (today) today.addEventListener('click', function () {
            applyDefaultWindow(config, state);
            request(root, config, state);
        });
    }

    function shiftMonth(root, config, state, direction) {
        if (isMonthMode(config)) {
            // SLIDE the window by one calendar month (Aug-Sep-Oct becomes
            // Sep-Oct-Nov), year boundaries included — setMonth rolls the
            // year over on its own.
            var next = shiftMonthStr(state.from, direction);
            state.from = next;
            state.to = monthWindowEnd(next, deviceMonths(config));
            state.filtered = false;
            request(root, config, state);
            return;
        }
        // Page by one screenful of days.
        var span = daysBetween(state.from, state.to) + 1;
        state.from = addDays(state.from, direction * span);
        state.to = addDays(state.to, direction * span);
        request(root, config, state);
    }

    function daysBetween(a, b) {
        return Math.round(
            (new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000
        );
    }

    // After v0.8.9 mounts the original .mphbac-info-content into the popup
    // body, any Swiper instance that initialized against the source div
    // while it was display:none has stale measurements: container width was
    // 0, slidesPerView resolved to a weird number, navigation arrows ended
    // up disabled. dispatchEvent('resize') alone updates size but doesn't
    // re-evaluate navigation enable/disable state or trigger lazy-loads, so
    // we kick the Swiper APIs explicitly. Idempotent — safe to call every
    // open. el.swiper is the canonical Swiper-attaches-instance pattern
    // (works on Swiper 6+, which is what current Elementor ships).
    function refreshSwipers(container) {
        if (!container) return;
        var swiperEls = container.querySelectorAll('.swiper, .swiper-container');
        swiperEls.forEach(function (el) {
            var sw = el.swiper;
            if (!sw) return;
            try {
                // Full re-measure sequence: a slider (Stratum Advanced Slider,
                // Elementor carousel) that initialized while the popup content
                // was display:none has a 0-width layout, stale nav state, and a
                // stale active index. updateSize/updateSlides/updateSlidesClasses
                // recompute geometry; navigation.update fixes the disappearing
                // prev arrow (#6); slideTo(activeIndex, 0) re-syncs the index so
                // the first slide's click/lightbox binding fires on first tap (#7).
                if (sw.updateSize) sw.updateSize();
                if (sw.updateSlides) sw.updateSlides();
                if (sw.updateSlidesClasses) sw.updateSlidesClasses();
                sw.update();
                if (sw.navigation && sw.navigation.update) {
                    sw.navigation.update();
                }
                if (sw.pagination && sw.pagination.update) {
                    sw.pagination.update();
                }
                if (sw.lazy && sw.lazy.load) {
                    sw.lazy.load();
                }
                if (typeof sw.activeIndex === 'number' && sw.slideTo) {
                    sw.slideTo(sw.activeIndex, 0);
                }
            } catch (e) { /* swiper threw on update — ignore, next one */ }
        });
    }

    // Heavier, class-agnostic repair for sliders (Stratum Advanced Slider and
    // any Swiper) that initialized while the popup was display:none at zero
    // width. Run ONCE after the popup is fully open and full width.
    //
    //  - navigation.destroy()+init(): re-attaches Swiper's OWN prev/next
    //    element refs and recomputes their disabled/hidden/lock state in the
    //    now-correct width. This is why targeting arrow *class names* in CSS
    //    failed — Swiper drives visibility off internal element refs, not a
    //    class we can predict. Re-initing the module is the reliable fix for
    //    the "back arrow vanishes after a second" bug.
    //  - loopDestroy()+loopCreate(): rebuilds loop-mode clone slides in the
    //    correct geometry and puts a REAL (non-clone) slide in the first
    //    visible position. The first slide's lightbox/click binding lives on
    //    the original slide, not its clone, so this is what makes the first
    //    photo enlarge on the first tap instead of needing a prior interaction.
    function reinitSwipers(container) {
        if (!container) return;
        var swiperEls = container.querySelectorAll('.swiper, .swiper-container');
        swiperEls.forEach(function (el) {
            var sw = el.swiper;
            if (!sw) return;
            try {
                if (sw.params && sw.params.loop && sw.loopDestroy && sw.loopCreate) {
                    sw.loopDestroy();
                    sw.loopCreate();
                }
                if (sw.navigation && sw.navigation.destroy && sw.navigation.init) {
                    sw.navigation.destroy();
                    sw.navigation.init();
                    if (sw.navigation.update) sw.navigation.update();
                }
                sw.update();
                // Land on the first real slide so its (original, bound) DOM is
                // the one showing — resolves the dead-first-photo case.
                if (sw.params && sw.params.loop && sw.slideToLoop) {
                    sw.slideToLoop(0, 0, false);
                } else if (sw.slideTo) {
                    sw.slideTo(sw.activeIndex || 0, 0, false);
                }
            } catch (e) { /* slider refused re-init — leave it as-is */ }
        });
    }

    function wireInfoPopup(root, config) {
        var sheet = root.querySelector('.mphbac-info-sheet');
        var overlay = root.querySelector('.mphbac-info-overlay');
        if (!sheet || !overlay) return; // no cottage info popups configured

        var titleEl = sheet.querySelector('.mphbac-sheet-title');
        var bodyEl = sheet.querySelector('.mphbac-info-body');
        var closeBtn = sheet.querySelector('.mphbac-info-close');
        var viewBtn = sheet.querySelector('.mphbac-info-view-link');
        var scrollbar = sheet.querySelector('.mphbac-info-scrollbar');
        var scrollTrack = sheet.querySelector('.mphbac-info-scrollbar-track');
        var scrollThumb = sheet.querySelector('.mphbac-info-scrollbar-thumb');
        var SCROLLBAR_INSET = 8; // px gap top/bottom so the thumb doesn't touch edges

        // Size + position the custom always-visible scrollbar. iOS Safari hides
        // native scrollbars and ignores their styling, so we draw our own: the
        // sheet is the scroll container, and we map scrollTop/scrollHeight onto
        // a sticky right-edge track + thumb. Hidden when the content fits (no
        // scroll needed). Indicator only — scrolling itself is untouched.
        function updateScrollbar() {
            if (!scrollbar || !scrollThumb) return;
            var ch = sheet.clientHeight;
            var sh = sheet.scrollHeight;
            var st = sheet.scrollTop;
            if (sh - ch <= 2) { scrollbar.hidden = true; return; }
            scrollbar.hidden = false;
            var trackH = Math.max(0, ch - SCROLLBAR_INSET * 2);
            var thumbH = Math.max(28, Math.round(trackH * ch / sh));
            var frac = st / (sh - ch);
            if (frac < 0) { frac = 0; } else if (frac > 1) { frac = 1; }
            var offset = SCROLLBAR_INSET + frac * (trackH - thumbH);
            if (scrollTrack) {
                scrollTrack.style.height = trackH + 'px';
                scrollTrack.style.transform = 'translateY(' + SCROLLBAR_INSET + 'px)';
            }
            scrollThumb.style.height = thumbH + 'px';
            scrollThumb.style.transform = 'translateY(' + offset + 'px)';
        }
        sheet.addEventListener('scroll', updateScrollbar, { passive: true });
        window.addEventListener('resize', updateScrollbar);

        var lastTrigger = null;
        var closeTimer = null; // pending 200ms close cleanup; cancelled on reopen
        // When the popup opens we MOVE (not clone) the cottage's hidden
        // .mphbac-info-content node into the popup body. Same DOM identity
        // means Elementor's frontend init that ran at page-load keeps its
        // bindings — third-party widget handlers (the features_and_amenities
        // accordion, Swiper carousel, pricing-table switcher) stay alive.
        // closeInfo() moves the node back to its original slot.
        var movedContent = null;
        var movedContentOrigParent = null;

        // Portal anchors. The popup is rendered inside .mphbac-root by PHP
        // (so its hidden content and Elementor template CSS enqueue
        // correctly), but Elementor / Bravada ancestors often have
        // transform or overflow:hidden set, which would constrain a
        // position:fixed popup to the widget container width and clip the
        // close button off-screen. On open we move the sheet + overlay to
        // document.body and remember the original slots; on close we
        // restore. Markers preserve insertion order across multiple opens.
        var sheetOrigParent = sheet.parentNode;
        var sheetMarker = document.createComment('mphbac-info-sheet');
        var overlayOrigParent = overlay.parentNode;
        var overlayMarker = document.createComment('mphbac-info-overlay');

        root.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('.mphbac-row-toggle');
            if (!btn) return;
            var row = btn.parentNode;
            var typeId = row ? row.getAttribute('data-room-type-id') : '';
            if (!typeId) return;
            var content = root.querySelector('.mphbac-info-content[data-room-type-id="' + typeId + '"]');
            if (!content) return; // this cottage has no info popup
            openInfo(typeId, content, btn);
        });

        // Predictive prefetch: warm the cottage's popup images on hover (with a
        // debounce so pointer sweeps don't fire) or instantly on touchstart so
        // mobile taps still get the head start.
        var hoverTimer = null;
        root.addEventListener('pointerenter', function (e) {
            if (e.pointerType === 'touch') return; // handled by touchstart below
            var btn = e.target.closest && e.target.closest('.mphbac-row-toggle');
            if (!btn) return;
            var row = btn.parentNode;
            var typeId = row ? row.getAttribute('data-room-type-id') : '';
            if (!typeId) return;
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () { warmInfoPopup(root, typeId); }, WARM_HOVER_DELAY_MS);
        }, true);
        root.addEventListener('pointerleave', function () {
            clearTimeout(hoverTimer);
        }, true);
        root.addEventListener('touchstart', function (e) {
            var btn = e.target.closest && e.target.closest('.mphbac-row-toggle');
            if (!btn) return;
            var row = btn.parentNode;
            var typeId = row ? row.getAttribute('data-room-type-id') : '';
            if (typeId) warmInfoPopup(root, typeId);
        }, { passive: true });

        function openInfo(typeId, content, trigger) {
            // A close may still be mid-flight (200ms slide-out). Cancel its
            // cleanup so it can't hide the sheet we're about to show; the
            // portal / movedContent checks below handle whichever state the
            // interrupted close left behind.
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            lastTrigger = trigger || null;
            // Per-cottage popup title override from the cottage_info
            // repeater's ci_title field, falling back to the MotoPress
            // cottage name when the override is empty.
            var titleOverride = config.infoTitles && (config.infoTitles[typeId] || config.infoTitles[String(typeId)]);
            var titleText = titleOverride
                || (config.roomTitles && config.roomTitles[typeId])
                || '';
            // Per-cottage title link (defaults to the accommodation page
            // permalink server-side; per-row override via ci_title_url).
            // Empty string / missing => render as plain text.
            var titleUrl = config.infoTitleUrls && (config.infoTitleUrls[typeId] || config.infoTitleUrls[String(typeId)]);
            if (titleUrl) {
                titleEl.textContent = '';
                var titleLink = document.createElement('a');
                titleLink.href = titleUrl;
                titleLink.target = '_blank';
                titleLink.rel = 'noopener noreferrer';
                titleLink.className = 'mphbac-sheet-title-link';
                renderSplitTitle(titleLink, titleText);
                titleEl.appendChild(titleLink);
                if (viewBtn) { viewBtn.href = titleUrl; viewBtn.hidden = false; }
            } else {
                renderSplitTitle(titleEl, titleText);
                if (viewBtn) { viewBtn.hidden = true; }
            }
            // Move the original .mphbac-info-content into the popup body.
            // If a previous cottage's content is still mounted (rapid open
            // without close), restore it first so we never orphan a node.
            if (movedContent && movedContent !== content) {
                restoreMovedContent();
            }
            if (content !== movedContent) {
                movedContentOrigParent = content.parentNode;
                bodyEl.innerHTML = '';
                bodyEl.appendChild(content);
                content.hidden = false;
                movedContent = content;
            }
            // In full-viewport mode, anchor the popup's top to the widget's
            // current top position so it grows out of the calendar rather
            // than covering the page above. Clamp to >= 0 in case the user
            // has scrolled past the widget — then the popup just covers the
            // visible viewport, which is the sensible fallback.
            if (sheet.classList.contains('mphbac-info-sheet--full')) {
                var rect = root.getBoundingClientRect();
                var topPx = Math.max(0, Math.round(rect.top));
                sheet.style.setProperty('--mphbac-info-sheet-top', topPx + 'px');
                // Per-device gutter from the Elementor responsive control.
                // Falls back to the CSS media-query default if no value is
                // configured (e.g. installs upgraded from < 0.7.3).
                if (config.infoPopupSideMargin) {
                    var side = config.infoPopupSideMargin[deviceBucket()];
                    if (typeof side === 'number') {
                        sheet.style.setProperty('--mphbac-info-side', side + 'px');
                    }
                }
            }
            // Per-device max-width from the responsive Elementor control.
            // Applies only in non-full mode (the --mphbac-info-max-width var
            // isn't read in full-mode CSS), but we set it unconditionally so
            // that a user toggling full-mode off mid-session sees the value
            // immediately. Accepts both the new {desktop,tablet,mobile} object
            // shape and the legacy single-int shape from < 0.8.5.
            if (config.infoPopupMaxWidth) {
                var mw = (typeof config.infoPopupMaxWidth === 'object')
                    ? config.infoPopupMaxWidth[deviceBucket()]
                    : config.infoPopupMaxWidth;
                if (mw) sheet.style.setProperty('--mphbac-info-max-width', mw + 'px');
            }
            // Portal out of the widget so transformed / overflow-hidden
            // Elementor ancestors can't constrain the popup.
            if (sheet.parentNode !== document.body) {
                sheetOrigParent.insertBefore(sheetMarker, sheet);
                document.body.appendChild(sheet);
            }
            if (overlay.parentNode !== document.body) {
                overlayOrigParent.insertBefore(overlayMarker, overlay);
                document.body.appendChild(overlay);
            }
            document.documentElement.classList.add('mphbac-info-open');
            document.body.classList.add('mphbac-info-open');
            withViewTransition(function () {
                sheet.hidden = false;
                overlay.hidden = false;
            });
            // Double rAF, matching the booking sheet: under View Transitions
            // a single animation-frame callback runs BEFORE the transition's
            // update callback, i.e. while sheet.hidden is still true — so a
            // single-rAF focus() was a silent no-op (keyboard focus never
            // entered the dialog) and is-open landed on a hidden element,
            // killing the slide-in transition.
            requestAnimationFrame(function () { requestAnimationFrame(function () {
                sheet.classList.add('is-open');
                overlay.classList.add('is-open');
                // Surgically re-measure every Swiper inside the moved
                // content. resize alone updates size but doesn't re-eval
                // navigation arrow state or trigger lazy-load — both bit
                // us on the v0.8.9 carousel.
                refreshSwipers(bodyEl);
                // Keep the resize dispatch as a belt-and-braces nudge for
                // any non-Swiper third-party ResizeObserver that may also
                // have cached zero-dimension state in the hidden source.
                try { window.dispatchEvent(new Event('resize')); } catch (e) {}
                // Move focus inside the dialog so Tab cycling has a
                // defined starting point and the trap below activates.
                if (closeBtn) { try { closeBtn.focus(); } catch (e) { /* ignore */ } }
            }); });
            // Once the slide-in transition settles and the popup is at full
            // width, do the heavier slider repair. refreshSwipers above runs
            // mid-transition (still wrong width), so a slider that initialized
            // while hidden needs a real re-init here: reinitSwipers re-attaches
            // nav + rebuilds loop clones, fixing the disappearing back arrow
            // and the dead first photo. Then size the custom scrollbar now that
            // content height is final.
            var settled = false;
            var settle = function () {
                if (settled) return;
                settled = true;
                refreshSwipers(bodyEl);
                reinitSwipers(bodyEl);
                try { window.dispatchEvent(new Event('resize')); } catch (e) {}
                updateScrollbar();
            };
            sheet.addEventListener('transitionend', function te(e) {
                if (e.target === sheet && (e.propertyName === 'transform' || e.propertyName === 'opacity')) {
                    sheet.removeEventListener('transitionend', te);
                    settle();
                }
            });
            setTimeout(settle, 380);
            // Images finishing load change the scroll height — keep the
            // scrollbar in sync as they arrive.
            bodyEl.querySelectorAll('img').forEach(function (img) {
                if (img.complete) return;
                img.addEventListener('load', updateScrollbar, { once: true });
                img.addEventListener('error', updateScrollbar, { once: true });
            });
            document.addEventListener('keydown', onKeydown);
        }

        function closeInfo() {
            sheet.classList.remove('is-open');
            overlay.classList.remove('is-open');
            if (scrollbar) scrollbar.hidden = true;
            document.documentElement.classList.remove('mphbac-info-open');
            document.body.classList.remove('mphbac-info-open');
            // Tracked so a reopen within the 200ms slide-out can cancel it —
            // otherwise the timer fires mid-open, hides the just-shown sheet,
            // and yanks the content back to its hidden slot.
            closeTimer = setTimeout(function () {
                closeTimer = null;
                sheet.hidden = true;
                overlay.hidden = true;
                // Move the cottage's content node back to its original
                // hidden slot. Same DOM identity is preserved across opens
                // so widget JS state (accordion open/closed, carousel
                // position, etc.) survives between popups.
                restoreMovedContent();
                // Restore the portaled elements to their original DOM slots
                // so subsequent re-renders / re-inits work against the
                // original tree.
                if (sheetMarker.parentNode) {
                    sheetMarker.parentNode.insertBefore(sheet, sheetMarker);
                    sheetMarker.parentNode.removeChild(sheetMarker);
                }
                if (overlayMarker.parentNode) {
                    overlayMarker.parentNode.insertBefore(overlay, overlayMarker);
                    overlayMarker.parentNode.removeChild(overlayMarker);
                }
            }, 200);
            document.removeEventListener('keydown', onKeydown);
            if (lastTrigger && lastTrigger.focus) {
                try { lastTrigger.focus(); } catch (e) { /* ignore */ }
            }
        }

        function restoreMovedContent() {
            if (movedContent && movedContentOrigParent) {
                movedContent.hidden = true;
                movedContentOrigParent.appendChild(movedContent);
            }
            movedContent = null;
            movedContentOrigParent = null;
        }

        function onKeydown(e) {
            if (e.key === 'Escape') closeInfo();
            if (e.key === 'Tab') trapFocus(e);
        }

        function trapFocus(e) {
            // Re-collect on every Tab so nested Elementor widgets (carousel
            // arrows, accordion toggles, etc.) that get mounted/unmounted
            // inside the popup are picked up. Filter out hidden / disabled.
            var focusable = collectFocusables(sheet);
            if (!focusable.length) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            // Focus escaped the dialog (clicked non-interactive popup text,
            // or the initial focus was lost): pull Tab back inside instead
            // of letting it walk the page behind the overlay.
            if (!sheet.contains(document.activeElement)) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
                return;
            }
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        }

        overlay.addEventListener('click', closeInfo);
        if (closeBtn) closeBtn.addEventListener('click', closeInfo);
        wireSwipeToClose(sheet, closeInfo);
    }

    function wireSwipe(root, config, state) {
        var wrap = root.querySelector('.mphbac-grid-wrap');
        if (!wrap) return;
        var startX = 0;
        var startY = 0;

        wrap.addEventListener('touchstart', function (e) {
            if (!e.touches || !e.touches[0]) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });

        wrap.addEventListener('touchend', function (e) {
            if (!e.changedTouches || !e.changedTouches[0]) return;
            var dx = e.changedTouches[0].clientX - startX;
            var dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) < SWIPE_THRESHOLD) return;
            if (Math.abs(dy) > Math.abs(dx)) return;
            shiftMonth(root, config, state, dx < 0 ? 1 : -1);
        }, { passive: true });
    }

    function addDays(dateStr, delta) {
        var d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + delta);
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    function setStatus(root, message) {
        // The live region for screen readers — toggling text triggers an
        // announce. Mutating to the same string can be silent in some SRs,
        // so callers clear-then-set on each new load.
        var status = root.querySelector('.mphbac-grid-wrap .mphbac-sr-only');
        if (status) status.textContent = message || '';
    }

    function request(root, config, state, opts) {
        var silent = !!(opts && opts.silent);
        // Keep "today" honest for tabs left open across midnight ET — the
        // renderGrid past-day normalization and is-today highlight read it.
        refreshToday(config);

        // Local-cache fast path: if this exact window was prefetched (or
        // recently fetched), render it immediately — no spinner, no network.
        // Entries are at most PREFETCH_TTL_MS old, well inside the server's
        // own 15-minute cache window, so freshness is equivalent to an AJAX
        // hit. Skipped for silent revalidates, whose entire job is to check
        // the server.
        // The window this call is FOR, captured at dispatch. Everything
        // downstream — the cache write, the stale check, the render — keys
        // off these, never off state.from/to, which rapid navigation can
        // move while the response is in flight. Reading state at response
        // time both rendered the wrong window and poisoned the prefetch
        // cache under the new window's key.
        var reqFrom = state.from;
        var reqTo = state.to;

        if (!silent) {
            var cacheHit = prefetchCache[prefetchKey(config, reqFrom, reqTo)];
            if (cacheHit && Date.now() - cacheHit.ts < PREFETCH_TTL_MS) {
                clearTimeout(state.pending);
                state.pending = null;
                if (state.controller) {
                    try { state.controller.abort(); } catch (e) { /* ignore */ }
                    state.controller = null;
                }
                root.classList.remove('is-loading');
                setStatus(root, '');
                state.lastSig = dataSig(cacheHit.data);
                renderGrid(root, cacheHit.data, state, config);
                scheduleAdjacentPrefetch(config, state);
                return;
            }
        }

        var now = Date.now();
        if (now - state.lastRequest < REQUEST_THROTTLE_MS) {
            clearTimeout(state.pending);
            state.pending = setTimeout(function () { request(root, config, state, opts); }, REQUEST_THROTTLE_MS);
            return;
        }
        state.lastRequest = now;
        // This call is going through — a leftover throttle retry for an older
        // window would only abort this fetch and re-issue it, so drop it.
        clearTimeout(state.pending);
        state.pending = null;

        // Abort any in-flight fetch so the latest nav wins. Throttling above
        // coalesces rapid triggers within 250ms; AbortController handles the
        // case where a slower network leaves an older fetch outstanding when
        // a newer one is issued.
        if (state.controller) {
            try { state.controller.abort(); } catch (e) { /* ignore */ }
        }
        var controller = new AbortController();
        state.controller = controller;

        // Ceiling on how long we'll wait for the AJAX response. A hung
        // MotoPress / SpeedyCache misconfig would otherwise leave the
        // spinner running indefinitely. The empty-state has a reset button
        // so the visitor can retry. Timeout is signalled via the timedOut
        // flag, NOT via an abort reason: engines that predate
        // AbortController.abort(reason) ignore the argument, and the old
        // reason-based check then misread every timeout as "superseded" and
        // left the spinner up forever.
        var timedOut = false;
        var timeoutMs = 15000;
        var timeoutHandle = setTimeout(function () {
            if (state.controller !== controller) return;
            timedOut = true;
            try { controller.abort(); } catch (e) { /* ignore */ }
        }, timeoutMs);

        if (!silent) {
            root.classList.add('is-loading');
            setStatus(root, (config.strings && config.strings.loading) || 'Loading availability…');
        }

        var body = new URLSearchParams();
        body.append('action', config.action || 'mphbac_query');
        body.append('from', reqFrom);
        body.append('to', reqTo);
        (config.roomTypeIds || []).forEach(function (id) {
            body.append('room_type_ids[]', String(id));
        });
        if (DEBUG) body.append('debug', '1');

        var startedAt = Date.now();
        fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            body: body,
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        }).then(function (r) {
            // Round-trip latency gates the speculative prefetch below.
            lastLatencyMs = Date.now() - startedAt;
            return r.json();
        }).then(function (json) {
            if (controller !== state.controller) return; // superseded
            if (json && json.data && json.data.timing && window.console) {
                // Only present when profiling was requested (POST debug=1 or
                // WP_DEBUG). bootMs >> queryMs means the cost is the WordPress
                // bootstrap, not this plugin's query.
                console.log('[mphbac] server timing', json.data.timing,
                    'roundTripMs', lastLatencyMs);
            }
            if (!json || !json.success || !json.data) {
                // A failed SILENT revalidate keeps the already-painted
                // embedded grid — flipping to the error state would replace
                // good (≤15-min-old) data with nothing.
                root.classList.remove('is-loading');
                setStatus(root, '');
                if (!silent) showError(root);
                return;
            }
            // Cache under the window this response is actually FOR.
            prefetchCache[prefetchKey(config, reqFrom, reqTo)] = { data: json.data, ts: Date.now() };
            trimPrefetchCache();
            if (reqFrom !== state.from || reqTo !== state.to) {
                // State moved on while we were in flight (throttled rapid
                // nav): don't paint an old window over the new one. The
                // pending throttle retry fetches the current window — and
                // this response is banked in the cache should it land there.
                return;
            }
            root.classList.remove('is-loading');
            setStatus(root, '');
            var sig = dataSig(json.data);
            if (silent && sig === state.lastSig) {
                // Revalidate confirmed the embedded paint — nothing to redraw.
                scheduleAdjacentPrefetch(config, state);
                return;
            }
            state.lastSig = sig;
            renderGrid(root, json.data, state, config);
            scheduleAdjacentPrefetch(config, state);
        }).catch(function (err) {
            if (err && err.name === 'AbortError' && !timedOut) return; // superseded by a newer request
            if (controller !== state.controller) return;
            root.classList.remove('is-loading');
            setStatus(root, '');
            if (!silent) showError(root);
        }).finally(function () {
            clearTimeout(timeoutHandle);
        });
    }

    // Wipe the grid-wrap's contents but preserve the .mphbac-sr-only live
    // region so the next loading announce can target it. Without this,
    // renderGrid's `wrap.innerHTML = ''` would remove the span, and screen
    // readers would never re-announce subsequent loads.
    function clearWrapPreservingStatus(wrap) {
        if (!wrap) return;
        var status = wrap.querySelector('.mphbac-sr-only');
        wrap.innerHTML = '';
        if (status) wrap.appendChild(status);
    }

    function showError(root) {
        // Clear the "Loading availability…" placeholder so it isn't left
        // dangling above the empty-state message on a request failure.
        clearWrapPreservingStatus(root.querySelector('.mphbac-grid-wrap'));
        var empty = root.querySelector('.mphbac-empty');
        if (empty) empty.hidden = false;
    }

    function renderGrid(root, data, state, config) {
        var rooms = data.rooms || [];
        var availability = data.availability || {};
        var from = data.from || state.from;
        var to = data.to || state.to;

        // Normalize past days on EVERY render path, not just the embedded
        // one: server transients (15-min TTL) and the client prefetch cache
        // (5-min TTL) both bake "past" in at compute time, so data crossing
        // midnight ET could otherwise render yesterday as green and
        // clickable for up to 15 minutes. Rebuilt (not mutated) so cached
        // entries and dataSig() inputs stay untouched.
        var todayStr = (config && config.today) || '';
        if (todayStr) {
            var normalized = {};
            Object.keys(availability).forEach(function (tid) {
                var src = availability[tid];
                var out = {};
                Object.keys(src).forEach(function (day) {
                    out[day] = (day < todayStr && src[day] !== 'past') ? 'past' : src[day];
                });
                normalized[tid] = out;
            });
            availability = normalized;
        }

        var empty = root.querySelector('.mphbac-empty');
        var wrap = root.querySelector('.mphbac-grid-wrap');
        if (!wrap) return;

        if (rooms.length === 0) {
            if (empty) empty.hidden = false;
            clearWrapPreservingStatus(wrap);
            updateRange(root, from, to, config);
            return;
        }
        if (empty) empty.hidden = true;

        var days = buildDayList(from, to);

        // Month-grid layout: same data, same status classes, same CSS custom
        // properties — only the arrangement differs (month title bar, weekday
        // header, 7 columns of week rows, blanks outside the month).
        if (isMonthMode(config)) {
            clearWrapPreservingStatus(wrap);
            // Hint is computed once over the WHOLE visible span, shared by
            // all months — one nav, one legend, one hint.
            var mHint = buildAvailabilityHint(config, rooms, availability, days, strings0(config), (config && config.customLabels) || {}, data.bookedThrough);
            if (mHint) {
                wrap.appendChild(mHint);
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () { mHint.classList.add('mphbac-hint--shown'); });
                });
            }
            // Split the window into whole calendar months, one box each. The
            // window always starts on a month boundary (every month-mode path
            // goes through monthStart), so the split is exact.
            var monthsWrap = document.createElement('div');
            monthsWrap.className = 'mphbac-months';
            var lastDay = days[days.length - 1];
            var mFrom = days[0];
            while (mFrom <= lastDay) {
                var mTo = monthEnd(mFrom);
                if (mTo > lastDay) mTo = lastDay;
                monthsWrap.appendChild(
                    buildMonthGrid(rooms, availability, buildDayList(mFrom, mTo), state, config)
                );
                mFrom = shiftMonthStr(mFrom, 1);
            }
            wrap.appendChild(monthsWrap);
            updateRange(root, from, to, config);
            return;
        }

        // Single-cottage variant: the host page already identifies the
        // cottage, so the row-label column is omitted entirely and the day
        // cells take the full width. Dropping the cells (rather than hiding
        // them) also removes the .mphbac-row-toggle that opens the cottage
        // info popup, which is exactly what that variant wants.
        var single = !!(config && config.singleMode);
        var grid = document.createElement('div');
        grid.className = 'mphbac-grid' + (single ? ' mphbac-grid--single' : '');
        grid.style.setProperty('--mphbac-days', String(days.length));
        grid.setAttribute('role', 'table');

        var strings = (config && config.strings) || {};
        var customLabels = (config && config.customLabels) || {};

        var header = document.createElement('div');
        header.className = 'mphbac-row mphbac-row-header';
        header.setAttribute('role', 'row');
        if (!single) {
            var corner = document.createElement('div');
            corner.className = 'mphbac-cell mphbac-cell-label';
            corner.setAttribute('role', 'columnheader');
            corner.textContent = strings.property || '';
            header.appendChild(corner);
        }
        days.forEach(function (day, idx) {
            var dh = buildDayHeader(day);
            if (config && config.today === day) dh.classList.add('is-today');
            if (idx > 0 && day.slice(0, 7) !== days[idx - 1].slice(0, 7)) {
                dh.classList.add('is-month-start');
            }
            header.appendChild(dh);
        });
        grid.appendChild(header);

        var statusLabels = (config && config.statusLabels) || {};
        var infoIds = {};
        root.querySelectorAll('.mphbac-info-content').forEach(function (el) {
            infoIds[el.getAttribute('data-room-type-id')] = true;
        });

        rooms.forEach(function (room, index) {
            var hasInfo = !!infoIds[String(room.id)];
            var row = document.createElement('div');
            row.className = 'mphbac-row'
                + (index % 2 === 1 ? ' mphbac-row-alt' : '')
                + (hasInfo ? ' mphbac-has-info' : '');
            row.setAttribute('role', 'row');
            row.setAttribute('data-room-type-id', String(room.id));

            if (!single) {
                var labelBtn = document.createElement('button');
                labelBtn.type = 'button';
                labelBtn.className = 'mphbac-cell mphbac-cell-label mphbac-row-toggle'
                    + (hasInfo ? ' mphbac-row-toggle--info' : '');
                labelBtn.title = room.title || '';
                var custom = customLabels[room.id];
                if (custom === undefined) custom = customLabels[String(room.id)];
                if (typeof custom === 'string' && custom.trim() !== '') {
                    labelBtn.innerHTML = '<span class="mphbac-label-custom"></span>';
                    labelBtn.querySelector('.mphbac-label-custom').textContent = custom.trim();
                } else {
                    labelBtn.innerHTML =
                        '<span class="mphbac-label-abbrev"></span>' +
                        '<span class="mphbac-label-num"></span>';
                    labelBtn.querySelector('.mphbac-label-abbrev').textContent = room.abbrev || '';
                    labelBtn.querySelector('.mphbac-label-num').textContent = room.number ? '#' + room.number : '';
                }
                row.appendChild(labelBtn);
            }

            var roomAvail = availability[room.id] || {};
            days.forEach(function (day, idx) {
                var status = roomAvail[day] || 'booked';
                var clickable = status === 'available';
                var tip = statusLabels[status] || status;
                var cell = document.createElement('div');
                cell.className = 'mphbac-cell mphbac-cell-status is-' + status + (clickable ? ' is-clickable' : '');
                var dowJ = new Date(day + 'T00:00:00').getDay();
                if (dowJ === 0 || dowJ === 6) cell.classList.add('is-weekend');
                if (idx > 0 && day.slice(0, 7) !== days[idx - 1].slice(0, 7)) {
                    cell.classList.add('is-month-start');
                }
                cell.setAttribute('role', clickable ? 'button' : 'cell');
                cell.setAttribute('data-date', day);
                cell.setAttribute('data-status', status);
                cell.setAttribute('aria-label', day + ' — ' + tip);
                if (clickable) cell.setAttribute('tabindex', '0');
                var tipEl = document.createElement('span');
                tipEl.className = 'mphbac-cell-tip';
                tipEl.textContent = tip;
                cell.appendChild(tipEl);
                row.appendChild(cell);
            });
            grid.appendChild(row);
        });

        clearWrapPreservingStatus(wrap);
        var hint = buildAvailabilityHint(config, rooms, availability, days, strings, customLabels, data.bookedThrough);
        if (hint) {
            wrap.appendChild(hint);
            // Trigger the fade-in transition on the next frame so the
            // browser registers the initial state (.mphbac-hint--enter,
            // opacity 0) before flipping to the shown state.
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { hint.classList.add('mphbac-hint--shown'); });
            });
        }
        wrap.appendChild(grid);
        updateRange(root, from, to, config);
    }

    // Unique ids for month-title aria-labelledby wiring (multiple widgets
    // can coexist on one page).
    var monthTitleSeq = 0;

    function localMonthName(dateStr, config) {
        var d = new Date(dateStr + 'T00:00:00');
        var names = (config && config.calendar && config.calendar.months) || [];
        return names[d.getMonth()] || d.toLocaleDateString(undefined, { month: 'long' });
    }

    // Nav label for the month view. One month: "September 2026". A span in
    // one year: "August – October 2026". Across a year boundary:
    // "November 2026 – January 2027". Month names come from WP's locale via
    // config.calendar so they translate with the site.
    function monthRangeLabel(from, to, config) {
        var f = new Date(from + 'T00:00:00');
        var t = new Date(to + 'T00:00:00');
        var fName = localMonthName(from, config);
        if (f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()) {
            return fName + ' ' + f.getFullYear();
        }
        var tName = localMonthName(to, config);
        if (f.getFullYear() === t.getFullYear()) {
            return fName + ' – ' + tName + ' ' + f.getFullYear();
        }
        return fName + ' ' + f.getFullYear() + ' – ' + tName + ' ' + t.getFullYear();
    }

    function strings0(config) {
        return (config && config.strings) || {};
    }

    // Fill `parent` from a "{token}"-style template. Plain-string values
    // become text nodes; {html:...} values are injected via innerHTML into a
    // dedicated span — used ONLY for the server-formatted price, which
    // arrives sanitized from PHP (mphb_format_price emits the currency
    // symbol as an HTML entity) and never has user input concatenated in.
    function renderTemplate(parent, tmpl, values) {
        parent.textContent = '';
        String(tmpl).split(/(\{[a-zA-Z]+\})/).forEach(function (part) {
            var m = part.match(/^\{([a-zA-Z]+)\}$/);
            if (!m) {
                if (part !== '') parent.appendChild(document.createTextNode(part));
                return;
            }
            var v = values[m[1]];
            if (v === undefined || v === null) return;
            if (typeof v === 'object' && v.html !== undefined) {
                var span = document.createElement('span');
                span.className = 'mphbac-estimate-amount';
                span.innerHTML = v.html;
                parent.appendChild(span);
            } else {
                parent.appendChild(document.createTextNode(String(v)));
            }
        });
    }

    // Compose the "Estimated total: $910 for 7 nights ($130/night avg)" line
    // into lineEl. Average only when nights > 1 and the server provided it.
    function renderEstimateLine(lineEl, strings, nights, priceHtml, avgHtml) {
        lineEl.textContent = '';
        var label = document.createElement('strong');
        label.textContent = (strings.priceLabel || 'Estimated total:');
        lineEl.appendChild(label);
        lineEl.appendChild(document.createTextNode(' '));
        var amount = document.createElement('span');
        var tmpl = nights === 1
            ? (strings.priceOneNight || '{price} for 1 night')
            : (strings.priceForNights || '{price} for {nights} nights');
        renderTemplate(amount, tmpl, { price: { html: priceHtml }, nights: nights });
        lineEl.appendChild(amount);
        if (nights > 1 && avgHtml) {
            lineEl.appendChild(document.createTextNode(' '));
            var avg = document.createElement('span');
            renderTemplate(avg, strings.priceAvg || '({avg}/night avg)', { avg: { html: avgHtml } });
            lineEl.appendChild(avg);
        }
    }

    // Build one calendar month: title bar, weekday header, then week rows of
    // seven cells. Day cells reuse the strip's exact classes and markup
    // (.mphbac-cell-status is-<status>, .mphbac-cell-tip, is-weekend,
    // is-clickable) so every existing colour/typography/spacing control and
    // CSS custom property keeps driving them — this is arrangement only.
    // Cells outside the month are inert placeholders: no number, no status,
    // no tabindex, hidden from assistive tech.
    function buildMonthGrid(rooms, availability, days, state, config) {
        var cal = (config && config.calendar) || {};
        var weekdayNames = cal.weekdays || ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        var startOfWeek = typeof cal.startOfWeek === 'number' ? cal.startOfWeek : 0;
        var statusLabels = (config && config.statusLabels) || {};
        var room = rooms[0] || null;
        var roomAvail = room ? (availability[room.id] || {}) : {};
        var todayStr = (config && config.today) || '';

        // One month = one .mphbac-monthbox (title + grid). The multi-month
        // wrapper lays these side by side; a box is self-contained so N=1 and
        // N=3 use identical markup per month.
        var out = document.createElement('div');
        out.className = 'mphbac-monthbox';

        // Month title bar. Kept OUTSIDE the role="grid" element — a grid may
        // only contain rows — and wired as the grid's accessible name, so
        // screen readers announce "September 2026" when entering the grid.
        var first = new Date(days[0] + 'T00:00:00');
        var titleText = localMonthName(days[0], config) + ' ' + first.getFullYear();
        var titleId = 'mphbac-month-' + (++monthTitleSeq);
        var title = document.createElement('div');
        title.className = 'mphbac-month-title';
        title.id = titleId;
        title.textContent = titleText;
        out.appendChild(title);

        var grid = document.createElement('div');
        grid.className = 'mphbac-grid mphbac-monthgrid';
        grid.setAttribute('role', 'grid');
        grid.setAttribute('aria-labelledby', titleId);
        if (room && room.title) grid.setAttribute('aria-description', room.title);

        // Weekday header, rotated to honour WP's start_of_week.
        var head = document.createElement('div');
        head.className = 'mphbac-row mphbac-row-header';
        head.setAttribute('role', 'row');
        for (var c = 0; c < 7; c++) {
            var dow = (startOfWeek + c) % 7;
            var hc = document.createElement('div');
            hc.className = 'mphbac-cell mphbac-cell-day'
                + (dow === 0 || dow === 6 ? ' is-weekend' : '');
            hc.setAttribute('role', 'columnheader');
            hc.textContent = weekdayNames[dow] || '';
            head.appendChild(hc);
        }
        grid.appendChild(head);

        // Leading blanks: how far the 1st sits from the first column.
        var lead = (first.getDay() - startOfWeek + 7) % 7;
        var cells = [];
        for (var b = 0; b < lead; b++) cells.push(null);
        days.forEach(function (day) { cells.push(day); });
        while (cells.length % 7 !== 0) cells.push(null); // trailing blanks

        for (var i = 0; i < cells.length; i += 7) {
            var row = document.createElement('div');
            row.className = 'mphbac-row';
            row.setAttribute('role', 'row');
            if (room) row.setAttribute('data-room-type-id', String(room.id));

            for (var j = 0; j < 7; j++) {
                var day = cells[i + j];
                if (!day) {
                    var blank = document.createElement('div');
                    blank.className = 'mphbac-cell mphbac-cell-blank';
                    blank.setAttribute('role', 'presentation');
                    blank.setAttribute('aria-hidden', 'true');
                    row.appendChild(blank);
                    continue;
                }
                var status = roomAvail[day] || 'booked';
                var clickable = status === 'available';
                var tip = statusLabels[status] || status;
                var d = new Date(day + 'T00:00:00');
                var dowJ = d.getDay();

                var cell = document.createElement('div');
                cell.className = 'mphbac-cell mphbac-cell-status is-' + status
                    + (clickable ? ' is-clickable' : '')
                    + (dowJ === 0 || dowJ === 6 ? ' is-weekend' : '')
                    + (todayStr === day ? ' is-today' : '');
                cell.setAttribute('role', 'gridcell');
                cell.setAttribute('data-date', day);
                cell.setAttribute('data-status', status);
                // Carried on the CELL because the parent row here is a week,
                // not a cottage row; openSheetFromCell() reads it from either.
                if (room) cell.setAttribute('data-room-type-id', String(room.id));
                cell.setAttribute('aria-label', day + ' — ' + tip);
                if (clickable) cell.setAttribute('tabindex', '0');

                var num = document.createElement('span');
                num.className = 'mphbac-day-num';
                num.textContent = String(d.getDate());
                cell.appendChild(num);

                var tipEl = document.createElement('span');
                tipEl.className = 'mphbac-cell-tip';
                tipEl.textContent = tip;
                cell.appendChild(tipEl);

                row.appendChild(cell);
            }
            grid.appendChild(row);
        }
        out.appendChild(grid);
        return out;
    }

    // Smart empty-window hint. If the visible window starts with one or more
    // days where NO cottage is available, surface that fact and (when there
    // IS an opening later in the window) point the visitor at the first
    // available date and the cottage opening then. Quietly returns null
    // when the window's first day has any availability, which is the
    // overwhelmingly common case.
    function buildAvailabilityHint(config, rooms, availability, days, strings, customLabels, bookedThrough) {
        // Explicit opt-out, checked FIRST. The single-cottage widget sets
        // availabilityHint:false because "All cottages booked through …" is
        // unknowable from one room type's data and misleads a guest reading
        // it on that cottage's page. A named flag rather than an empty
        // strings entry, so repopulating strings can't resurrect the
        // sentence. Strict === false: a page cached before 0.20.1 has no such
        // key and keeps its previous behavior until purged.
        if (config && config.availabilityHint === false) return null;
        if (!rooms.length || !days.length) return null;
        if (!strings || !strings.allBooked) return null;

        function dayHasAvail(day) {
            for (var i = 0; i < rooms.length; i++) {
                if ((availability[rooms[i].id] || {})[day] === 'available') return true;
            }
            return false;
        }
        function dayIsPast(day) {
            for (var i = 0; i < rooms.length; i++) {
                if ((availability[rooms[i].id] || {})[day] !== 'past') return false;
            }
            return true;
        }

        // Anchor on the first NON-PAST day. Past days can never be
        // "available", so judging from days[0] made the hint fire for any
        // window that merely starts in the past — including fully past
        // months, which showed a bogus "all booked through X" over a month
        // that wasn't booked at all.
        var startIdx = -1;
        for (var s = 0; s < days.length; s++) {
            if (!dayIsPast(days[s])) { startIdx = s; break; }
        }
        if (startIdx < 0) return null;                 // window is entirely past
        if (dayHasAvail(days[startIdx])) return null;  // normal case — bail

        var firstAvailIdx = -1;
        for (var i = startIdx + 1; i < days.length; i++) {
            if (dayHasAvail(days[i])) { firstAvailIdx = i; break; }
        }

        var hintEl = document.createElement('div');
        hintEl.className = 'mphbac-availability-hint mphbac-hint--enter';
        hintEl.setAttribute('role', 'status');

        // Through-day priority: an in-window opening wins (we know exactly when
        // it lands), else the server's forward-scan result, else the last
        // visible day as a fallback.
        var throughDay;
        if (firstAvailIdx > 0) {
            throughDay = days[firstAvailIdx - 1];
        } else if (bookedThrough) {
            throughDay = bookedThrough;
        } else {
            throughDay = days[days.length - 1];
        }
        hintEl.textContent = strings.allBooked.replace('{through}', throughDay);

        if (firstAvailIdx > 0 && strings.nextOpening) {
            var openDay = days[firstAvailIdx];
            var openRoom = null;
            for (var j = 0; j < rooms.length; j++) {
                if ((availability[rooms[j].id] || {})[openDay] === 'available') {
                    openRoom = rooms[j];
                    break;
                }
            }
            if (openRoom) {
                var label = (customLabels && (customLabels[openRoom.id] || customLabels[String(openRoom.id)]))
                    || openRoom.title
                    || ((openRoom.abbrev || '') + (openRoom.number ? ' #' + openRoom.number : '')).trim();
                hintEl.textContent += ' ' + strings.nextOpening
                    .replace('{date}', openDay)
                    .replace('{cottage}', label);
            }
        }

        return hintEl;
    }

    function buildDayHeader(day) {
        var d = new Date(day + 'T00:00:00');
        var di = d.getDay();
        var el = document.createElement('div');
        el.className = 'mphbac-cell mphbac-cell-day';
        if (di === 0 || di === 6) el.classList.add('is-weekend');
        el.setAttribute('role', 'columnheader');
        // Both abbreviations are rendered; CSS (driven by the responsive
        // "Day-of-week format" control) shows the right one per device.
        el.innerHTML =
            '<span class="mphbac-d-dow">' +
                '<span class="mphbac-d-dow-long"></span>' +
                '<span class="mphbac-d-dow-short"></span>' +
            '</span>' +
            '<span class="mphbac-d-num"></span>';
        el.querySelector('.mphbac-d-dow-long').textContent =
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][di];
        el.querySelector('.mphbac-d-dow-short').textContent =
            ['S', 'M', 'T', 'W', 'T', 'F', 'S'][di];
        el.querySelector('.mphbac-d-num').textContent = String(d.getDate());
        el.title = d.toDateString();
        return el;
    }

    function buildDayList(from, to) {
        var days = [];
        var start = new Date(from + 'T00:00:00');
        var end = new Date(to + 'T00:00:00');
        while (start <= end) {
            var m = String(start.getMonth() + 1).padStart(2, '0');
            var day = String(start.getDate()).padStart(2, '0');
            days.push(start.getFullYear() + '-' + m + '-' + day);
            start.setDate(start.getDate() + 1);
        }
        return days;
    }

    function updateRange(root, from, to, config) {
        var label = root.querySelector('.mphbac-nav-range');
        if (!label) return;
        var f = new Date(from + 'T00:00:00');
        var t = new Date(to + 'T00:00:00');
        if (isMonthMode(config)) {
            label.textContent = monthRangeLabel(from, to, config);
        } else {
            var fmt = function (d) {
                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            };
            label.textContent = fmt(f) + ' – ' + fmt(t) + ', ' + t.getFullYear();
        }

        // Back-to-today button shows only when today is OUTSIDE the current
        // visible range. YYYY-MM-DD strings compare lexically, so straight
        // string comparison gives the right answer.
        var todayBtn = root.querySelector('.mphbac-nav-today');
        if (todayBtn) {
            var today = (config && config.today) || '';
            todayBtn.hidden = !today || (today >= from && today <= to);
        }
    }

    function wirePopup(root, config, state) {
        var sheet = root.querySelector('.mphbac-sheet');
        var overlay = root.querySelector('.mphbac-sheet-overlay');
        if (!sheet || !overlay) return;

        var titleEl = sheet.querySelector('.mphbac-sheet-title');
        var checkinEl = sheet.querySelector('.mphbac-sheet-checkin');
        var checkoutEl = sheet.querySelector('.mphbac-sheet-checkout');
        var errorEl = sheet.querySelector('.mphbac-sheet-error');
        var confirmBtn = sheet.querySelector('.mphbac-sheet-confirm');
        var cancelBtn = sheet.querySelector('.mphbac-sheet-cancel');
        var closeBtn = sheet.querySelector('.mphbac-sheet-close');

        var context = { roomTypeId: 0, lastTrigger: null, focusRaf: 0, isOpen: false, closeTimer: null };
        var minNights = Math.max(1, parseInt(config.minNights, 10) || 2);

        // ---- Price estimate (0.20.0) --------------------------------------
        // Informative only: it never gates the Confirm flow. Debounced so
        // date-picker scrubbing doesn't spam admin-ajax; a sequence counter
        // plus AbortController make the LAST request win (a superseded
        // response can never paint a stale estimate); any failure or a
        // price of 0 simply hides the row.
        var estimateEl = sheet.querySelector('.mphbac-sheet-estimate');
        var estimateLineEl = sheet.querySelector('.mphbac-estimate-line');
        var estimateNoteEl = sheet.querySelector('.mphbac-estimate-note');
        var ESTIMATE_DEBOUNCE_MS = 400;
        var estTimer = null;
        var estSeq = 0;
        var estController = null;

        function hideEstimate() {
            estSeq++; // orphan any in-flight response
            clearTimeout(estTimer);
            estTimer = null;
            if (estController) {
                try { estController.abort(); } catch (e) { /* ignore */ }
                estController = null;
            }
            if (estimateEl) estimateEl.hidden = true;
        }

        function scheduleEstimate() {
            if (!estimateEl || !estimateLineEl) return;
            clearTimeout(estTimer);
            estTimer = setTimeout(fetchEstimate, ESTIMATE_DEBOUNCE_MS);
        }

        function fetchEstimate() {
            var ci = checkinEl.value;
            var co = checkoutEl.value;
            // Only estimate ranges the sheet itself would accept.
            if (!context.roomTypeId || !ci || !co || co <= ci || nightsBetween(ci, co) < minNights) {
                hideEstimate();
                return;
            }
            var seq = ++estSeq;
            if (estController) {
                try { estController.abort(); } catch (e) { /* ignore */ }
            }
            estController = new AbortController();

            // Subtle in-flight state; the disclaimer only accompanies a real
            // number, not the spinner text.
            estimateEl.hidden = false;
            estimateLineEl.textContent = strings0(config).priceEstimating || 'Estimating…';
            if (estimateNoteEl) estimateNoteEl.hidden = true;

            var body = new URLSearchParams();
            body.append('action', config.priceAction || 'mphbac_price');
            body.append('room_type_id', String(context.roomTypeId));
            body.append('checkin', ci);
            body.append('checkout', co);

            fetch(config.ajaxUrl, {
                method: 'POST',
                credentials: 'same-origin',
                body: body,
                headers: { 'Accept': 'application/json' },
                signal: estController.signal
            }).then(function (r) {
                return r.json();
            }).then(function (json) {
                if (seq !== estSeq) return; // superseded — a newer range owns the row
                var d = json && json.success && json.data;
                if (!d || !(d.price > 0) || !d.priceHtml) {
                    // No rate configured (price 0) or malformed reply: no
                    // estimate, no error — the sheet works exactly as before.
                    if (estimateEl) estimateEl.hidden = true;
                    return;
                }
                renderEstimateLine(estimateLineEl, strings0(config), d.nights, d.priceHtml, d.avgHtml || null);
                if (estimateNoteEl) estimateNoteEl.hidden = false;
                estimateEl.hidden = false;
            }).catch(function () {
                if (seq !== estSeq) return;
                if (estimateEl) estimateEl.hidden = true;
            });
        }

        if (checkinEl && checkoutEl) {
            // change fires on picker selection; input covers keyboard editing.
            ['change', 'input'].forEach(function (ev) {
                checkinEl.addEventListener(ev, scheduleEstimate);
                checkoutEl.addEventListener(ev, scheduleEstimate);
            });
        }

        // Portal anchors — same pattern as the info popup. Without this,
        // a transformed Elementor ancestor becomes the containing block for
        // position:fixed and the popup ends up centered to the widget
        // instead of the viewport.
        var sheetOrigParent = sheet.parentNode;
        var sheetMarker = document.createComment('mphbac-sheet');
        var overlayOrigParent = overlay.parentNode;
        var overlayMarker = document.createComment('mphbac-sheet-overlay');

        function openSheetFromCell(cell) {
            // Strip layout: the cottage id lives on the parent row. Month
            // layout: rows are weeks, so the id is on the cell itself.
            var own = cell.getAttribute('data-room-type-id');
            var row = cell.parentNode;
            var raw = own || (row ? row.getAttribute('data-room-type-id') : '');
            var typeId = parseInt(raw, 10) || 0;
            var date = cell.getAttribute('data-date') || '';
            openSheet(typeId, date, addDays(date, minNights), cell);
        }

        root.addEventListener('click', function (e) {
            var cell = e.target.closest && e.target.closest('.mphbac-cell-status.is-available.is-clickable');
            if (!cell) return;
            openSheetFromCell(cell);
        });
        // Keyboard parity: Enter or Space on a focused available cell opens
        // the booking popup. Without this, cells get `tabindex="0"` and
        // appear focusable but do nothing on key press — keyboard users hit
        // a dead end.
        root.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
            var cell = e.target.closest && e.target.closest('.mphbac-cell-status.is-available.is-clickable');
            if (!cell) return;
            e.preventDefault();
            openSheetFromCell(cell);
        });

        function openSheet(typeId, checkin, checkout, trigger) {
            if (!typeId) return;
            // Cancel a mid-flight close so its 200ms cleanup can't hide the
            // sheet we're about to show.
            if (context.closeTimer) {
                clearTimeout(context.closeTimer);
                context.closeTimer = null;
            }
            context.roomTypeId = typeId;
            context.lastTrigger = trigger || null;
            var title = (config.strings && config.strings.bookHeading) ? config.strings.bookHeading : 'Book';
            var roomTitle = (config.roomTitles && config.roomTitles[typeId]) || '';
            // Split at the first colon (e.g. "Book Cottage 32: Flamingo
            // Bungalow" → "Book Cottage 32:" / "Flamingo Bungalow") so the
            // cottage proper name wraps to its own row on narrow viewports.
            renderSplitTitle(titleEl, roomTitle ? (title + ' ' + roomTitle) : title);
            checkinEl.value = checkin || '';
            checkoutEl.value = checkout || '';
            // Opening from a day cell prefills a valid range — estimate it
            // right away (still debounced, so a quick date change coalesces).
            scheduleEstimate();
            errorEl.hidden = true;
            errorEl.textContent = '';
            // Portal sheet + overlay to document.body so position:fixed
            // anchors to the viewport, not a transformed Elementor ancestor.
            if (sheet.parentNode !== document.body) {
                sheetOrigParent.insertBefore(sheetMarker, sheet);
                document.body.appendChild(sheet);
            }
            if (overlay.parentNode !== document.body) {
                overlayOrigParent.insertBefore(overlayMarker, overlay);
                document.body.appendChild(overlay);
            }
            withViewTransition(function () {
                sheet.hidden = false;
                overlay.hidden = false;
            });
            context.isOpen = true;
            requestAnimationFrame(function () {
                sheet.classList.add('is-open');
                overlay.classList.add('is-open');
                // Focus after the popup is fully attached + painted. Double
                // rAF lets the slide-in transition start before focus moves,
                // avoiding the iOS Safari quirk where focusing during a
                // transform causes a flash. Tracked so close can cancel.
                context.focusRaf = requestAnimationFrame(function () {
                    if (context.isOpen) {
                        try { checkinEl.focus(); } catch (e) { /* ignore */ }
                    }
                });
            });
            document.addEventListener('keydown', onKeydown);
        }

        function closeSheet() {
            context.isOpen = false;
            // Reset the estimate: cancel timers/in-flight fetch and hide the
            // row so the next open starts clean.
            hideEstimate();
            if (context.focusRaf) {
                cancelAnimationFrame(context.focusRaf);
                context.focusRaf = 0;
            }
            sheet.classList.remove('is-open');
            overlay.classList.remove('is-open');
            // Tracked so a reopen within the 200ms slide-out can cancel it
            // (same double-tap hazard as the info popup's closeTimer).
            context.closeTimer = setTimeout(function () {
                context.closeTimer = null;
                sheet.hidden = true;
                overlay.hidden = true;
                // Restore the portaled nodes to their original DOM slots so
                // subsequent re-inits find the popup where they expect it.
                if (sheetMarker.parentNode) {
                    sheetMarker.parentNode.insertBefore(sheet, sheetMarker);
                    sheetMarker.parentNode.removeChild(sheetMarker);
                }
                if (overlayMarker.parentNode) {
                    overlayMarker.parentNode.insertBefore(overlay, overlayMarker);
                    overlayMarker.parentNode.removeChild(overlayMarker);
                }
            }, 200);
            document.removeEventListener('keydown', onKeydown);
            if (context.lastTrigger && context.lastTrigger.focus) {
                try { context.lastTrigger.focus(); } catch (e) { /* ignore */ }
            }
        }

        function onKeydown(e) {
            if (e.key === 'Escape') closeSheet();
            if (e.key === 'Tab') trapFocus(e);
        }

        function trapFocus(e) {
            // Re-collect on every Tab so nested Elementor widgets (carousel
            // arrows, accordion toggles, etc.) that get mounted/unmounted
            // inside the popup are picked up. Filter out hidden / disabled.
            var focusable = collectFocusables(sheet);
            if (!focusable.length) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            // Focus escaped the dialog (clicked non-interactive popup text,
            // or the initial focus was lost): pull Tab back inside instead
            // of letting it walk the page behind the overlay.
            if (!sheet.contains(document.activeElement)) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
                return;
            }
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        }

        overlay.addEventListener('click', closeSheet);
        cancelBtn.addEventListener('click', closeSheet);
        closeBtn.addEventListener('click', closeSheet);
        wireSwipeToClose(sheet, closeSheet);

        confirmBtn.addEventListener('click', function () {
            errorEl.hidden = true;
            var ci = checkinEl.value;
            var co = checkoutEl.value;
            if (!ci || !co || co <= ci) {
                showError((config.strings && config.strings.bookInvalid) || 'Invalid date range.');
                return;
            }
            if (nightsBetween(ci, co) < minNights) {
                // {nights} tracks the configurable Minimum nights setting —
                // the old default hard-coded "two nights" and lied for any
                // other value. No-op for strings without the placeholder.
                showError(((config.strings && config.strings.bookMinNights) ||
                    'Must be a minimum of {nights} nights. Please select new dates.')
                    .replace('{nights}', String(minNights)));
                return;
            }
            confirmBtn.disabled = true;
            verifyAndSubmit(ci, co);
        });

        function nightsBetween(ci, co) {
            var a = new Date(ci + 'T00:00:00');
            var b = new Date(co + 'T00:00:00');
            return Math.round((b - a) / 86400000);
        }

        function verifyAndSubmit(ci, co) {
            var body = new URLSearchParams();
            body.append('action', config.action || 'mphbac_query');
            body.append('from', ci);
            body.append('to', addDays(co, -1));
            body.append('room_type_ids[]', String(context.roomTypeId));

            // Same 15s ceiling as the grid request() — without it a stalled
            // connection never rejects, and the confirm button (disabled by
            // the click handler) stays dead until the visitor reloads. The
            // abort lands in .catch below, which re-enables the button and
            // shows the unavailable message.
            var controller = new AbortController();
            var timeoutHandle = setTimeout(function () {
                try { controller.abort(); } catch (e) { /* ignore */ }
            }, 15000);

            fetch(config.ajaxUrl, {
                method: 'POST',
                credentials: 'same-origin',
                body: body,
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            }).then(function (r) {
                return r.json();
            }).then(function (json) {
                confirmBtn.disabled = false;
                if (!json || !json.success || !json.data) {
                    showError((config.strings && config.strings.bookUnavail) || 'Unavailable.');
                    return;
                }
                var availability = (json.data.availability || {})[context.roomTypeId] || {};
                var ok = true;
                var cursor = new Date(ci + 'T00:00:00');
                var end = new Date(co + 'T00:00:00');
                while (cursor < end) {
                    var key = cursor.getFullYear() + '-' +
                              String(cursor.getMonth() + 1).padStart(2, '0') + '-' +
                              String(cursor.getDate()).padStart(2, '0');
                    if (availability[key] !== 'available') { ok = false; break; }
                    cursor.setDate(cursor.getDate() + 1);
                }
                if (!ok) {
                    showError((config.strings && config.strings.bookUnavail) || 'Unavailable.');
                    return;
                }
                submitToMotoPress(context.roomTypeId, ci, co);
            }).catch(function () {
                confirmBtn.disabled = false;
                showError((config.strings && config.strings.bookUnavail) || 'Unavailable.');
            }).finally(function () {
                clearTimeout(timeoutHandle);
            });
        }

        function submitToMotoPress(typeId, ci, co) {
            var form = document.createElement('form');
            form.method = 'POST';
            form.action = config.checkoutUrl;
            form.style.display = 'none';
            appendInput(form, 'mphb_room_type_id', String(typeId));
            appendInput(form, 'mphb_check_in_date', ci);
            appendInput(form, 'mphb_check_out_date', co);
            appendInput(form, 'mphb_rooms_details[' + typeId + ']', '1');
            appendInput(form, 'mphb_is_direct_booking', '1');
            document.body.appendChild(form);
            withViewTransition(function () { form.submit(); });
        }

        function appendInput(form, name, value) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value;
            form.appendChild(input);
        }

        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.hidden = false;
        }
    }

    function boot() {
        ensureViewportFitCover();
        document.querySelectorAll('.mphbac-root').forEach(init);
        // The Elementor editor preview iframe injects widget markup AFTER
        // DOMContentLoaded and does not reliably fire frontend/element_ready,
        // so a MutationObserver catches the .mphbac-root when it appears (and
        // re-inits when the editor rebuilds the widget after a setting change).
        setupObserver();
    }

    // Append `viewport-fit=cover` to the document's viewport meta if it isn't
    // already present, so env(safe-area-inset-bottom) returns a real value on
    // iOS Safari. Without this, our bottom-anchored popup's `bottom:
    // env(safe-area-inset-bottom, 0px)` evaluates to 0 and the popup's bottom
    // edge stays behind the Safari toolbar overlay — the exact bug we're
    // fixing in 0.9.6. Idempotent (no-op if the directive is already in the
    // meta content). Site-wide effect, but the only practical implication is
    // that the page can now address the safe-area insets via env() — which is
    // what we want.
    function ensureViewportFitCover() {
        var meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;
        var content = meta.getAttribute('content') || '';
        if (content.indexOf('viewport-fit') >= 0) return;
        meta.setAttribute('content', content + (content ? ', ' : '') + 'viewport-fit=cover');
    }

    function setupObserver() {
        if (!document.body || !window.MutationObserver) return;
        // The observer exists ONLY to catch widget markup that the Elementor
        // editor preview iframe injects post-DOMContentLoaded without firing
        // frontend/element_ready reliably. On the live frontend, boot()'s
        // initial querySelectorAll covers existing instances and the
        // elementor/frontend/element_ready/mphbac_calendar.default hook
        // (registered below) covers any late-mounted ones. Observing
        // document.body { subtree: true } there would mean a callback on
        // EVERY DOM mutation across the page — measurable cost on heavy
        // Elementor pages. Gate by an editor-preview signal so frontend
        // pages get zero observer overhead.
        //
        // Detection priority:
        //   1. URL has `elementor-preview=` — the preview-iframe URL pattern.
        //      Bulletproof and available BEFORE elementor-frontend.js runs,
        //      so we don't race the script-load order on DOMContentLoaded.
        //   2. body.elementor-edit-mode — the class elementor-frontend.js
        //      adds to the preview iframe body once it boots.
        //   3. body.elementor-editor-active — the class on the TOP-LEVEL
        //      editor body (outside the iframe). Our widget shouldn't live
        //      there, but covers the edge case.
        //
        // v0.9.4 only checked elementor-editor-active, which is the
        // top-level body — never set inside the preview iframe — so the
        // calendar failed to re-init after Elementor rebuilt the widget on
        // every setting change. Fixed in v0.9.5.
        var inEditorPreview =
            (window.location && window.location.search &&
                window.location.search.indexOf('elementor-preview=') >= 0) ||
            document.body.classList.contains('elementor-edit-mode') ||
            document.body.classList.contains('elementor-editor-active');
        if (!inEditorPreview) return;
        var observer = new MutationObserver(function () {
            var roots = document.querySelectorAll('.mphbac-root');
            if (roots.length === 0) return;
            roots.forEach(init);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    if (window.elementorFrontend && window.elementorFrontend.hooks) {
        // One hook per registered widget name — Elementor namespaces
        // element_ready by widget slug, so the single-cottage variant needs
        // its own registration or it would only ever be initialised by
        // boot()'s initial sweep (and would miss late/edited mounts).
        ['mphbac_calendar', 'dccac_single'].forEach(function (name) {
            window.elementorFrontend.hooks.addAction('frontend/element_ready/' + name + '.default', function ($el) {
                if ($el && $el[0]) init($el[0].querySelector('.mphbac-root'));
            });
        });
    }
}());
