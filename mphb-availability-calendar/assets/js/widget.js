(function () {
    'use strict';

    var SWIPE_THRESHOLD = 40;
    var REQUEST_THROTTLE_MS = 250;

    function init(root) {
        if (!root || root.dataset.mphbacInit === '1') return;
        root.dataset.mphbacInit = '1';

        var config = {};
        try { config = JSON.parse(root.dataset.config || '{}'); } catch (e) { config = {}; }

        if (config.visibleDays === 'auto') {
            root.setAttribute('data-responsive', 'auto');
        }

        var state = {
            from: config.from,
            to: config.to,
            onlyAvailable: false,
            lastRequest: 0,
            pending: null
        };

        wireFilters(root, config, state);
        wireNav(root, config, state);
        wireRowToggle(root);
        wireSwipe(root, config, state);
        if (config.popupEnabled) {
            wirePopup(root, config, state);
        }
    }

    function wireFilters(root, config, state) {
        var checkin = root.querySelector('.mphbac-input-checkin');
        var checkout = root.querySelector('.mphbac-input-checkout');
        var onlyAvail = root.querySelector('.mphbac-input-only-available');
        var apply = root.querySelector('.mphbac-btn-apply');
        var reset = root.querySelector('.mphbac-btn-reset');
        var resetEmpty = root.querySelector('.mphbac-btn-reset-empty');

        function doApply() {
            var from = checkin && checkin.value ? checkin.value : config.from;
            var to = checkout && checkout.value ? checkout.value : config.to;
            state.from = from;
            state.to = to;
            state.onlyAvailable = !!(onlyAvail && onlyAvail.checked);
            request(root, config, state);
        }

        function doReset() {
            if (checkin) checkin.value = '';
            if (checkout) checkout.value = '';
            if (onlyAvail) onlyAvail.checked = false;
            state.from = config.from;
            state.to = config.to;
            state.onlyAvailable = false;
            request(root, config, state);
        }

        if (apply) apply.addEventListener('click', doApply);
        if (reset) reset.addEventListener('click', doReset);
        if (resetEmpty) resetEmpty.addEventListener('click', doReset);

        if (onlyAvail) onlyAvail.addEventListener('change', doApply);

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
        if (prev) prev.addEventListener('click', function () { shiftMonth(root, config, state, -1); });
        if (next) next.addEventListener('click', function () { shiftMonth(root, config, state, 1); });
    }

    function shiftMonth(root, config, state, direction) {
        state.from = addDays(state.from, direction * 30);
        state.to = addDays(state.to, direction * 30);
        request(root, config, state);
    }

    function wireRowToggle(root) {
        var isNumberOnly = root.classList.contains('mphbac-label-number');
        root.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('.mphbac-row-toggle');
            if (!btn) return;
            var row = btn.parentNode;
            if (!row) return;
            var expanded = row.classList.toggle('is-expanded');
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            var actions = row.nextElementSibling;
            if (actions && actions.classList.contains('mphbac-row-actions')) {
                actions.hidden = !expanded;
                actions.classList.toggle('is-expanded', expanded);
            }
            if (isNumberOnly) showTooltip(root, btn, btn.getAttribute('title') || '');
        });
    }

    function showTooltip(root, anchor, text) {
        if (!text) return;
        var tip = root.querySelector('.mphbac-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'mphbac-tooltip';
            tip.setAttribute('role', 'tooltip');
            root.appendChild(tip);
        }
        tip.textContent = text;
        var rootRect = root.getBoundingClientRect();
        var rect = anchor.getBoundingClientRect();
        tip.style.left = (rect.left - rootRect.left) + 'px';
        tip.style.top = (rect.bottom - rootRect.top + 4) + 'px';
        tip.classList.add('is-visible');
        clearTimeout(tip._mphbacHide);
        tip._mphbacHide = setTimeout(function () { tip.classList.remove('is-visible'); }, 2200);
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
        body.append('nonce', config.nonce || '');
        body.append('from', state.from);
        body.append('to', state.to);
        body.append('only_available', state.onlyAvailable ? '1' : '0');
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
            renderGrid(root, json.data, state);
        }).catch(function () {
            root.classList.remove('is-loading');
            showError(root);
        });
    }

    function showError(root) {
        var empty = root.querySelector('.mphbac-empty');
        if (empty) empty.hidden = false;
    }

    function renderGrid(root, data, state) {
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
            updateRange(root, from, to);
            return;
        }
        if (empty) empty.hidden = true;

        var days = buildDayList(from, to);
        var grid = document.createElement('div');
        grid.className = 'mphbac-grid';
        grid.style.setProperty('--mphbac-days', String(days.length));
        grid.setAttribute('role', 'table');

        var header = document.createElement('div');
        header.className = 'mphbac-row mphbac-row-header';
        header.setAttribute('role', 'row');
        header.appendChild(buildLabelCell('', '', true));
        days.forEach(function (day) {
            header.appendChild(buildDayHeader(day));
        });
        grid.appendChild(header);

        rooms.forEach(function (room) {
            var row = document.createElement('div');
            row.className = 'mphbac-row';
            row.setAttribute('role', 'row');
            row.setAttribute('data-room-type-id', String(room.id));

            var labelBtn = document.createElement('button');
            labelBtn.type = 'button';
            labelBtn.className = 'mphbac-cell mphbac-cell-label mphbac-row-toggle';
            labelBtn.setAttribute('aria-expanded', 'false');
            labelBtn.title = room.title || '';
            labelBtn.innerHTML =
                '<span class="mphbac-label-abbrev"></span>' +
                '<span class="mphbac-label-num"></span>';
            labelBtn.querySelector('.mphbac-label-abbrev').textContent = room.abbrev || '';
            labelBtn.querySelector('.mphbac-label-num').textContent = room.number ? '#' + room.number : '';
            row.appendChild(labelBtn);

            var roomAvail = availability[room.id] || {};
            days.forEach(function (day) {
                var status = roomAvail[day] || 'booked';
                var cell = document.createElement('div');
                cell.className = 'mphbac-cell mphbac-cell-status is-' + status;
                cell.setAttribute('role', 'cell');
                cell.setAttribute('data-date', day);
                cell.setAttribute('data-status', status);
                cell.setAttribute('aria-label', day + ' — ' + status);
                row.appendChild(cell);
            });
            grid.appendChild(row);
        });

        wrap.innerHTML = '';
        wrap.appendChild(grid);
        updateRange(root, from, to);
    }

    function buildLabelCell(abbrev, num, isHeader) {
        var el = document.createElement('div');
        el.className = 'mphbac-cell mphbac-cell-label';
        if (isHeader) {
            el.setAttribute('role', 'columnheader');
            el.innerHTML = '&nbsp;';
        }
        return el;
    }

    function buildDayHeader(day) {
        var d = new Date(day + 'T00:00:00');
        var dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
        var el = document.createElement('div');
        el.className = 'mphbac-cell mphbac-cell-day';
        el.setAttribute('role', 'columnheader');
        el.innerHTML = '<span class="mphbac-d-dow"></span><span class="mphbac-d-num"></span>';
        el.querySelector('.mphbac-d-dow').textContent = dow;
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

    function updateRange(root, from, to) {
        var label = root.querySelector('.mphbac-nav-range');
        if (!label) return;
        var f = new Date(from + 'T00:00:00');
        var t = new Date(to + 'T00:00:00');
        var fmt = function (d) {
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        };
        label.textContent = fmt(f) + ' – ' + fmt(t) + ', ' + t.getFullYear();
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

        root.addEventListener('click', function (e) {
            var cell = e.target.closest && e.target.closest('.mphbac-cell-status.is-available.is-clickable');
            if (cell) {
                var row = cell.parentNode;
                var typeId = row ? parseInt(row.getAttribute('data-room-type-id'), 10) : 0;
                var date = cell.getAttribute('data-date') || '';
                openSheet(typeId, date, addDays(date, 1), cell);
                return;
            }
            var bookBtn = e.target.closest && e.target.closest('.mphbac-btn-book');
            if (bookBtn) {
                var btnTypeId = parseInt(bookBtn.getAttribute('data-room-type-id'), 10);
                var filterCheckin = root.querySelector('.mphbac-input-checkin');
                var filterCheckout = root.querySelector('.mphbac-input-checkout');
                var ci = (filterCheckin && filterCheckin.value) || config.today;
                var co = (filterCheckout && filterCheckout.value) || addDays(ci, 1);
                openSheet(btnTypeId, ci, co, bookBtn);
            }
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
            sheet.hidden = false;
            overlay.hidden = false;
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
            confirmBtn.disabled = true;
            verifyAndSubmit(ci, co);
        });

        function verifyAndSubmit(ci, co) {
            var body = new URLSearchParams();
            body.append('action', config.action || 'mphbac_query');
            body.append('nonce', config.nonce || '');
            body.append('from', ci);
            body.append('to', addDays(co, -1));
            body.append('only_available', '0');
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
            form.submit();
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Re-init when Elementor frontend rebuilds the DOM (e.g. preview, lazy-loaded sections).
    if (window.elementorFrontend && window.elementorFrontend.hooks) {
        window.elementorFrontend.hooks.addAction('frontend/element_ready/mphbac_calendar.default', function ($el) {
            if ($el && $el[0]) init($el[0].querySelector('.mphbac-root'));
        });
    }
}());
