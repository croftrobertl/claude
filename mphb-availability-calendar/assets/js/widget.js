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
        var span = daysBetween(state.from, state.to) + 1;
        var nextFrom = addDays(state.to, 1);
        var nextTo = addDays(state.to, span);
        var prevFrom = addDays(state.from, -span);
        var prevTo = addDays(state.from, -1);
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
        if (!windowHasAvail) {
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

    function init(root) {
        if (!root || root.dataset.mphbacInit === '1') return;
        root.dataset.mphbacInit = '1';

        var config = {};
        try { config = JSON.parse(root.dataset.config || '{}'); } catch (e) { config = {}; }

        // The page (and its data-config) may be served from a full-page cache
        // for hours, so the server-baked "today" can be stale — wrong is-today
        // highlight, default window starting a day early, and date pickers
        // allowing a past check-in. Recompute today in the property timezone
        // client-side; fall back to the baked value if Intl or the timezone
        // lookup is unavailable. 'en-CA' formats as YYYY-MM-DD.
        try {
            var tzToday = new Intl.DateTimeFormat('en-CA', {
                timeZone: config.tz || 'America/New_York',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
            if (/^\d{4}-\d{2}-\d{2}$/.test(tzToday)) config.today = tzToday;
        } catch (e) { /* keep the server-baked value */ }
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

    function applyDefaultWindow(config, state) {
        state.filtered = false;
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
            state.from = hasCi ? checkin.value : baseFrom(config);
            state.to = hasCo ? checkout.value : addDays(state.from, deviceDays(config) - 1);
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
            window.jQuery(checkin).datepicker({ dateFormat: 'yy-mm-dd' });
            window.jQuery(checkout).datepicker({ dateFormat: 'yy-mm-dd' });
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
            requestAnimationFrame(function () {
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
            });
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
            setTimeout(function () {
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

        // Local-cache fast path: if this exact window was prefetched (or
        // recently fetched), render it immediately — no spinner, no network.
        // Entries are at most PREFETCH_TTL_MS old, well inside the server's
        // own 15-minute cache window, so freshness is equivalent to an AJAX
        // hit. Skipped for silent revalidates, whose entire job is to check
        // the server.
        if (!silent) {
            var cacheHit = prefetchCache[prefetchKey(config, state.from, state.to)];
            if (cacheHit && Date.now() - cacheHit.ts < PREFETCH_TTL_MS) {
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
        // so the visitor can retry. Abort with a TimeoutError-named
        // DOMException so the .catch below can distinguish "timeout"
        // (show empty-state) from "superseded by next request" (silent).
        var timeoutMs = 15000;
        var timeoutHandle = setTimeout(function () {
            if (state.controller !== controller) return;
            try {
                controller.abort(new DOMException('Request timed out', 'TimeoutError'));
            } catch (e) {
                try { controller.abort(); } catch (_) { /* ignore */ }
            }
        }, timeoutMs);

        if (!silent) {
            root.classList.add('is-loading');
            setStatus(root, (config.strings && config.strings.loading) || 'Loading availability…');
        }

        var body = new URLSearchParams();
        body.append('action', config.action || 'mphbac_query');
        body.append('from', state.from);
        body.append('to', state.to);
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
            root.classList.remove('is-loading');
            setStatus(root, '');
            if (!json || !json.success || !json.data) {
                // A failed SILENT revalidate keeps the already-painted
                // embedded grid — flipping to the error state would replace
                // good (≤15-min-old) data with nothing.
                if (!silent) showError(root);
                return;
            }
            prefetchCache[prefetchKey(config, state.from, state.to)] = { data: json.data, ts: Date.now() };
            trimPrefetchCache();
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
            if (err && err.name === 'AbortError') return; // expected — newer request superseded this one
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
        var grid = document.createElement('div');
        grid.className = 'mphbac-grid';
        grid.style.setProperty('--mphbac-days', String(days.length));
        grid.setAttribute('role', 'table');

        var strings = (config && config.strings) || {};
        var customLabels = (config && config.customLabels) || {};

        var header = document.createElement('div');
        header.className = 'mphbac-row mphbac-row-header';
        header.setAttribute('role', 'row');
        var corner = document.createElement('div');
        corner.className = 'mphbac-cell mphbac-cell-label';
        corner.setAttribute('role', 'columnheader');
        corner.textContent = strings.property || '';
        header.appendChild(corner);
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
        var hint = buildAvailabilityHint(rooms, availability, days, strings, customLabels, data.bookedThrough);
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

    // Smart empty-window hint. If the visible window starts with one or more
    // days where NO cottage is available, surface that fact and (when there
    // IS an opening later in the window) point the visitor at the first
    // available date and the cottage opening then. Quietly returns null
    // when the window's first day has any availability, which is the
    // overwhelmingly common case.
    function buildAvailabilityHint(rooms, availability, days, strings, customLabels, bookedThrough) {
        if (!rooms.length || !days.length) return null;
        if (!strings || !strings.allBooked) return null;

        function dayHasAvail(day) {
            for (var i = 0; i < rooms.length; i++) {
                if ((availability[rooms[i].id] || {})[day] === 'available') return true;
            }
            return false;
        }

        if (dayHasAvail(days[0])) return null; // normal case — bail

        var firstAvailIdx = -1;
        for (var i = 1; i < days.length; i++) {
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
        var fmt = function (d) {
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        };
        label.textContent = fmt(f) + ' – ' + fmt(t) + ', ' + t.getFullYear();

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

        var context = { roomTypeId: 0, lastTrigger: null, focusRaf: 0, isOpen: false };
        var minNights = Math.max(1, parseInt(config.minNights, 10) || 2);

        // Portal anchors — same pattern as the info popup. Without this,
        // a transformed Elementor ancestor becomes the containing block for
        // position:fixed and the popup ends up centered to the widget
        // instead of the viewport.
        var sheetOrigParent = sheet.parentNode;
        var sheetMarker = document.createComment('mphbac-sheet');
        var overlayOrigParent = overlay.parentNode;
        var overlayMarker = document.createComment('mphbac-sheet-overlay');

        function openSheetFromCell(cell) {
            var row = cell.parentNode;
            var typeId = row ? parseInt(row.getAttribute('data-room-type-id'), 10) : 0;
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
            if (context.focusRaf) {
                cancelAnimationFrame(context.focusRaf);
                context.focusRaf = 0;
            }
            sheet.classList.remove('is-open');
            overlay.classList.remove('is-open');
            setTimeout(function () {
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
                showError((config.strings && config.strings.bookMinNights) ||
                    'Must be a minimum of two nights. Please select new dates.');
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
        window.elementorFrontend.hooks.addAction('frontend/element_ready/mphbac_calendar.default', function ($el) {
            if ($el && $el[0]) init($el[0].querySelector('.mphbac-root'));
        });
    }
}());
