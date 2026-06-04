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

    function init(root) {
        if (!root || root.dataset.mphbacInit === '1') return;
        root.dataset.mphbacInit = '1';

        var config = {};
        try { config = JSON.parse(root.dataset.config || '{}'); } catch (e) { config = {}; }

        var state = {
            from: null,
            to: null,
            filtered: false,
            bucket: deviceBucket(),
            lastRequest: 0,
            pending: null
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

        request(root, config, state); // initial client-side render
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
        // minimum stay (two nights) unless the guest already picked a valid one.
        if (checkin && checkout) {
            checkin.addEventListener('change', function () {
                if (!checkin.value) return;
                var minN = Math.max(1, parseInt(config.minNights, 10) || 2);
                checkout.min = addDays(checkin.value, minN);
                if (!checkout.value || checkout.value <= checkin.value) {
                    checkout.value = addDays(checkin.value, minN);
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

    // When we copy a cottage's Elementor template into the popup via
    // innerHTML, the cloned .elementor-widget nodes have no event handlers —
    // innerHTML doesn't run scripts and Elementor only fires its
    // frontend/element_ready action once, on the original (hidden) nodes.
    // This walks the popup and dispatches that action for each widget so
    // Elementor's handler system rebinds onto the copy.
    function reinitElementorWidgets(container) {
        if (!container || !window.elementorFrontend ||
            !window.elementorFrontend.hooks || !window.jQuery) {
            return;
        }
        var widgets = container.querySelectorAll('.elementor-widget[data-widget_type]');
        widgets.forEach(function (widget) {
            var widgetType = widget.getAttribute('data-widget_type');
            if (!widgetType) return;
            var $widget = window.jQuery(widget);
            try {
                window.elementorFrontend.hooks.doAction(
                    'frontend/element_ready/global', $widget, window.jQuery
                );
                window.elementorFrontend.hooks.doAction(
                    'frontend/element_ready/' + widgetType, $widget, window.jQuery
                );
            } catch (e) { /* third-party handler threw; keep going */ }
        });
    }

    function wireInfoPopup(root, config) {
        var sheet = root.querySelector('.mphbac-info-sheet');
        var overlay = root.querySelector('.mphbac-info-overlay');
        if (!sheet || !overlay) return; // no cottage info popups configured

        var titleEl = sheet.querySelector('.mphbac-sheet-title');
        var bodyEl = sheet.querySelector('.mphbac-info-body');
        var closeBtn = sheet.querySelector('.mphbac-info-close');
        var lastTrigger = null;

        // Apply the configured desktop max-width as a CSS variable on the
        // popup itself. This honors the Elementor "Info popup max width"
        // control without needing a server-rendered <style> block.
        if (config.infoPopupMaxWidth) {
            sheet.style.setProperty('--mphbac-info-max-width', config.infoPopupMaxWidth + 'px');
        }

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
            titleEl.textContent = (config.roomTitles && config.roomTitles[typeId]) || '';
            bodyEl.innerHTML = content.innerHTML;
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
                // Re-fire Elementor's element_ready hooks for every widget we
                // just cloned via innerHTML, so widget handlers (e.g. the
                // pricing-table switcher) bind to the popup copy. We do this
                // inside rAF so the popup is on-screen first — handlers like
                // the pricing table's indicator measure element offsets.
                reinitElementorWidgets(bodyEl);
            });
            document.addEventListener('keydown', onKeydown);
        }

        function closeInfo() {
            sheet.classList.remove('is-open');
            overlay.classList.remove('is-open');
            document.documentElement.classList.remove('mphbac-info-open');
            document.body.classList.remove('mphbac-info-open');
            setTimeout(function () {
                sheet.hidden = true;
                overlay.hidden = true;
                // Clear the popup body so any body-level overlays a
                // third-party widget appended (carousel pagination, lightbox
                // controls, etc.) get torn down with their DOM owner. On
                // next open we re-clone the cottage's pristine source.
                bodyEl.innerHTML = '';
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

        function onKeydown(e) {
            if (e.key === 'Escape') closeInfo();
        }

        overlay.addEventListener('click', closeInfo);
        if (closeBtn) closeBtn.addEventListener('click', closeInfo);
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

    function request(root, config, state) {
        var now = Date.now();
        if (now - state.lastRequest < REQUEST_THROTTLE_MS) {
            clearTimeout(state.pending);
            state.pending = setTimeout(function () { request(root, config, state); }, REQUEST_THROTTLE_MS);
            return;
        }
        state.lastRequest = now;

        root.classList.add('is-loading');

        var body = new URLSearchParams();
        body.append('action', config.action || 'mphbac_query');
        body.append('from', state.from);
        body.append('to', state.to);
        (config.roomTypeIds || []).forEach(function (id) {
            body.append('room_type_ids[]', String(id));
        });

        fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            body: body,
            headers: { 'Accept': 'application/json' }
        }).then(function (r) {
            return r.json();
        }).then(function (json) {
            root.classList.remove('is-loading');
            if (!json || !json.success || !json.data) {
                showError(root);
                return;
            }
            renderGrid(root, json.data, state, config);
        }).catch(function () {
            root.classList.remove('is-loading');
            showError(root);
        });
    }

    function showError(root) {
        // Clear the "Loading availability…" placeholder so it isn't left
        // dangling above the empty-state message on a request failure.
        var wrap = root.querySelector('.mphbac-grid-wrap');
        if (wrap) wrap.innerHTML = '';
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
            wrap.innerHTML = '';
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
                if (config && config.today === day) cell.classList.add('is-today');
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

        wrap.innerHTML = '';
        var hint = buildAvailabilityHint(rooms, availability, days, strings, customLabels);
        if (hint) wrap.appendChild(hint);
        wrap.appendChild(grid);
        updateRange(root, from, to, config);
    }

    // Smart empty-window hint. If the visible window starts with one or more
    // days where NO cottage is available, surface that fact and (when there
    // IS an opening later in the window) point the visitor at the first
    // available date and the cottage opening then. Quietly returns null
    // when the window's first day has any availability, which is the
    // overwhelmingly common case.
    function buildAvailabilityHint(rooms, availability, days, strings, customLabels) {
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
        hintEl.className = 'mphbac-availability-hint';
        hintEl.setAttribute('role', 'status');

        var throughDay = firstAvailIdx > 0 ? days[firstAvailIdx - 1] : days[days.length - 1];
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

        var context = { roomTypeId: 0, lastTrigger: null };
        var minNights = Math.max(1, parseInt(config.minNights, 10) || 2);

        root.addEventListener('click', function (e) {
            var cell = e.target.closest && e.target.closest('.mphbac-cell-status.is-available.is-clickable');
            if (!cell) return;
            var row = cell.parentNode;
            var typeId = row ? parseInt(row.getAttribute('data-room-type-id'), 10) : 0;
            var date = cell.getAttribute('data-date') || '';
            openSheet(typeId, date, addDays(date, minNights), cell);
        });

        function openSheet(typeId, checkin, checkout, trigger) {
            if (!typeId) return;
            context.roomTypeId = typeId;
            context.lastTrigger = trigger || null;
            var title = (config.strings && config.strings.bookHeading) ? config.strings.bookHeading : 'Book';
            var roomTitle = (config.roomTitles && config.roomTitles[typeId]) || '';
            titleEl.textContent = roomTitle ? (title + ' ' + roomTitle) : title;
            checkinEl.value = checkin || '';
            checkoutEl.value = checkout || '';
            errorEl.hidden = true;
            errorEl.textContent = '';
            // Anchor the popup's top edge to the widget's current top — so it
            // opens out of the calendar rather than floating at viewport
            // center / sticking to the page bottom. Clamp >= 0 in case the
            // user has scrolled past the widget.
            var rect = root.getBoundingClientRect();
            sheet.style.setProperty('--mphbac-sheet-top', Math.max(0, Math.round(rect.top)) + 'px');
            withViewTransition(function () {
                sheet.hidden = false;
                overlay.hidden = false;
            });
            requestAnimationFrame(function () {
                sheet.classList.add('is-open');
                overlay.classList.add('is-open');
            });
            setTimeout(function () { checkinEl.focus(); }, 50);
            document.addEventListener('keydown', onKeydown);
        }

        function closeSheet() {
            sheet.classList.remove('is-open');
            overlay.classList.remove('is-open');
            setTimeout(function () {
                sheet.hidden = true;
                overlay.hidden = true;
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
            var focusable = sheet.querySelectorAll('input, button');
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

            fetch(config.ajaxUrl, {
                method: 'POST',
                credentials: 'same-origin',
                body: body,
                headers: { 'Accept': 'application/json' }
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
        document.querySelectorAll('.mphbac-root').forEach(init);
        // The Elementor editor preview iframe injects widget markup AFTER
        // DOMContentLoaded and does not reliably fire frontend/element_ready,
        // so a MutationObserver catches the .mphbac-root when it appears (and
        // re-inits when the editor rebuilds the widget after a setting change).
        setupObserver();
    }

    function setupObserver() {
        if (!document.body || !window.MutationObserver) return;
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
