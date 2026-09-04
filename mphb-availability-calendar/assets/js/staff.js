/**
 * Staff booking calendar (mphb-availability-calendar).
 *
 * Renders a month grid of all cottages showing each booking's check-IN and
 * check-OUT distinctly, and loads a booking's full detail lazily on tap.
 *
 * Every byte of guest data here arrives from the gated endpoints in
 * class-staff.php — nothing is embedded in the page. A 403 is treated as a
 * hard stop (session expired / not authorized), never as "render what we
 * have", so the UI cannot end up displaying stale PII after the gate closes.
 *
 * Vanilla ES5-style, no dependencies, matching widget.js house style.
 */
(function () {
    'use strict';

    function init(root) {
        if (!root || root.dataset.staffInit === '1') return;
        root.dataset.staffInit = '1';

        var config = {};
        try { config = JSON.parse(root.dataset.staffConfig || '{}'); } catch (e) { return; }
        var S = config.strings || {};
        var CAL = config.calendar || {};

        var gridEl   = root.querySelector('.mphbac-staff-grid');
        var monthEl  = root.querySelector('.mphbac-staff-month');
        var statusEl = root.querySelector('.mphbac-staff-status');
        var prevBtn  = root.querySelector('.mphbac-staff-prev');
        var nextBtn  = root.querySelector('.mphbac-staff-next');
        var overlay  = root.querySelector('.mphbac-staff-overlay');
        var sheet    = root.querySelector('.mphbac-staff-sheet');
        var sheetTitle = root.querySelector('.mphbac-staff-sheet-title');
        var sheetBody  = root.querySelector('.mphbac-staff-sheet-body');
        var closeBtn   = root.querySelector('.mphbac-staff-close');
        if (!gridEl) return;

        var month = config.month;          // 'YYYY-MM'
        var monthReq = 0;                  // last-write-wins guard
        var lastTrigger = null;
        var cache = {};                    // month -> payload (session only)

        // ---- networking -----------------------------------------------------

        function post(action, params) {
            var body = new URLSearchParams();
            body.append('action', action);
            body.append('nonce', config.nonce);
            Object.keys(params || {}).forEach(function (k) { body.append(k, params[k]); });
            return fetch(config.ajaxUrl, {
                method: 'POST',
                // The wp-postpass cookie IS the credential — it must be sent.
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' },
                body: body
            }).then(function (r) {
                if (r.status === 403) {
                    // Nonce staleness is the likely cause on a cached page, so
                    // say something the user can act on rather than "error".
                    var e = new Error('forbidden');
                    e.forbidden = true;
                    e.nonce = r.headers.get('X-MPHBAC-Staff') === 'nonce';
                    throw e;
                }
                return r.json();
            });
        }

        function say(msg, isError) {
            statusEl.textContent = msg || '';
            statusEl.classList.toggle('is-error', !!isError);
        }

        function handleFailure(err) {
            if (err && err.forbidden) {
                say(err.nonce ? (S.expired || 'Session expired.') : (S.denied || 'Not authorized.'), true);
            } else {
                say(S.error || 'Could not load bookings.', true);
            }
        }

        // ---- month grid -----------------------------------------------------

        function loadMonth() {
            var seq = ++monthReq;
            monthEl.textContent = monthName(month);
            if (cache[month]) { say(''); paint(cache[month]); return; }
            say(S.loading || 'Loading…');
            gridEl.setAttribute('aria-busy', 'true');
            post('mphbac_staff_month', { month: month }).then(function (json) {
                if (seq !== monthReq) return;              // superseded
                if (!json || !json.success || !json.data) { say(S.error, true); return; }
                cache[month] = json.data;
                say('');
                paint(json.data);
            }).catch(function (err) {
                if (seq !== monthReq) return;
                handleFailure(err);
            }).then(function () {
                if (seq === monthReq) gridEl.removeAttribute('aria-busy');
            });
        }

        function paint(data) {
            gridEl.textContent = '';

            // date -> roomTypeId -> [{booking, kind}]
            var byDay = {};
            (data.bookings || []).forEach(function (b) {
                (b.cottages || []).forEach(function (c) {
                    eachDate(b.checkin, b.checkout, function (d) {
                        var kind = d === b.checkin ? 'in' : (d === b.checkout ? 'out' : 'stay');
                        (byDay[d] = byDay[d] || {});
                        (byDay[d][c.roomTypeId] = byDay[d][c.roomTypeId] || []).push({ b: b, c: c, kind: kind });
                    });
                });
            });

            var days = monthDays(month);
            if (!days.length) return;

            var table = document.createElement('table');
            table.className = 'mphbac-staff-table';

            var thead = document.createElement('thead');
            var hr = document.createElement('tr');
            hr.appendChild(th(''));                       // date column
            (data.cottages || []).forEach(function (c) {
                var cell = th(c.number ? '#' + c.number : (c.abbrev || c.title));
                cell.title = c.title || '';
                hr.appendChild(cell);
            });
            thead.appendChild(hr);
            table.appendChild(thead);

            var tbody = document.createElement('tbody');
            days.forEach(function (d) {
                var tr = document.createElement('tr');
                if (d === data.today) tr.className = 'is-today';

                var dh = document.createElement('th');
                dh.scope = 'row';
                dh.className = 'mphbac-staff-date';
                dh.textContent = dayLabel(d);
                tr.appendChild(dh);

                (data.cottages || []).forEach(function (c) {
                    var td = document.createElement('td');
                    td.className = 'mphbac-staff-cell';
                    var entries = (byDay[d] && byDay[d][c.id]) || [];
                    entries.forEach(function (e) {
                        tr.classList.add('has-booking');
                        td.appendChild(chip(e, d, c));
                    });
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            gridEl.appendChild(table);

            if (!(data.bookings || []).length) say(S.empty || '');
        }

        function chip(e, date, cottage) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mphbac-staff-chip is-' + e.kind;
            btn.setAttribute('data-booking-id', String(e.b.id));
            var who = e.b.guestName || ('#' + e.b.id);
            var kindWord = e.kind === 'in' ? (S.checkIn || 'Check-in')
                         : e.kind === 'out' ? (S.checkOut || 'Check-out')
                         : (S.staying || 'Staying');
            btn.textContent = (e.kind === 'in' ? '→ ' : e.kind === 'out' ? '← ' : '') + who;
            // Screen readers get the full sentence; sighted users get the arrow.
            btn.setAttribute('aria-label',
                kindWord + ' — ' + who + ' — ' + (cottage.title || '') + ' — ' + date
                + (e.b.imported ? ' — ' + (e.b.source && e.b.source.ota ? e.b.source.ota : 'external') : ''));
            if (e.b.imported) btn.classList.add('is-imported');
            btn.addEventListener('click', function () { openDetail(e.b.id, btn); });
            return btn;
        }

        // ---- detail sheet ---------------------------------------------------

        var detailSeq = 0;

        function openDetail(bookingId, trigger) {
            lastTrigger = trigger || null;
            var seq = ++detailSeq;
            sheetTitle.textContent = S.detailTitle || 'Booking details';
            sheetBody.textContent = S.loading || 'Loading…';
            showSheet();
            post('mphbac_staff_booking', { booking_id: bookingId }).then(function (json) {
                if (seq !== detailSeq) return;
                if (!json || !json.success || !json.data) {
                    sheetBody.textContent = S.error || 'Could not load.';
                    return;
                }
                renderDetail(json.data);
            }).catch(function (err) {
                if (seq !== detailSeq) return;
                sheetBody.textContent = (err && err.forbidden)
                    ? (err.nonce ? (S.expired || '') : (S.denied || ''))
                    : (S.error || '');
            });
        }

        function renderDetail(d) {
            sheetBody.textContent = '';
            sheetTitle.textContent = (S.detailTitle || 'Booking details') + ' #' + d.id;

            if (d.imported) {
                var banner = document.createElement('p');
                banner.className = 'mphbac-staff-imported';
                banner.textContent = (d.source && d.source.ota ? d.source.ota : 'External') + ' — ' + (S.importedTip || '');
                sheetBody.appendChild(banner);
            }

            sheetBody.appendChild(rowsSection(S.secBooking, d.sections.booking));
            sheetBody.appendChild(roomsSection(S.secRooms, d.sections.rooms));
            sheetBody.appendChild(customerSection(S.secCustomer, d.sections.customer, d.id));
            sheetBody.appendChild(rowsSection(S.secNotes, d.sections.notes));
        }

        function section(title) {
            var s = document.createElement('section');
            s.className = 'mphbac-staff-section';
            var h = document.createElement('h3');
            h.textContent = title || '';
            s.appendChild(h);
            return s;
        }

        function rowsSection(title, rows) {
            var s = section(title);
            var dl = document.createElement('dl');
            (rows || []).forEach(function (r) {
                if (!r || r.value === '—' && !r.label) return;
                var dt = document.createElement('dt'); dt.textContent = r.label;
                var dd = document.createElement('dd'); dd.textContent = r.value;
                if (r.value === '—') dd.className = 'is-empty';
                dl.appendChild(dt); dl.appendChild(dd);
            });
            s.appendChild(dl);
            return s;
        }

        function roomsSection(title, rooms) {
            var s = section(title);
            (rooms || []).forEach(function (r) {
                var box = document.createElement('div');
                box.className = 'mphbac-staff-room';
                var h = document.createElement('h4');
                h.textContent = r.cottage + (r.unit && r.unit !== '—' ? ' · ' + r.unit : '');
                box.appendChild(h);

                var dl = document.createElement('dl');
                // OTA honesty: never print an imported occupancy as a number.
                var g = r.guests || {};
                var dt = document.createElement('dt'); dt.textContent = S.guests || 'Guests';
                var dd = document.createElement('dd');
                if (g.provided) {
                    var parts = [];
                    if (g.adults !== null && g.adults !== undefined) parts.push((S.adults || 'Adults') + ': ' + g.adults);
                    if (g.children !== null && g.children !== undefined) parts.push((S.children || 'Children') + ': ' + g.children);
                    dd.textContent = parts.length ? parts.join(' · ') : '—';
                } else {
                    dd.textContent = g.note || '—';
                    dd.className = 'is-unknown';
                    dd.title = S.importedTip || '';
                }
                dl.appendChild(dt); dl.appendChild(dd);

                addRow(dl, S.guestName || 'Guest name', r.guestName);
                addRow(dl, S.rate || 'Rate', r.rate);
                (r.services || []).forEach(function (x) { addRow(dl, S.services || 'Services', x.label + (x.price && x.price !== '\u2014' ? ' \u2014 ' + x.price : '')); });
                (r.fees || []).forEach(function (x) { addRow(dl, S.fees || 'Fees', x.label + (x.price && x.price !== '\u2014' ? ' \u2014 ' + x.price : '')); });
                addRowHtml(dl, S.total || 'Total', r.total);
                box.appendChild(dl);
                s.appendChild(box);
            });
            return s;
        }

        function customerSection(title, cust, bookingId) {
            var s = rowsSection(title, (cust && cust.fields) || []);
            var photo = cust && cust.photoId;
            if (photo) {
                var wrap = document.createElement('p');
                wrap.className = 'mphbac-staff-photo';
                var a = document.createElement('a');
                // Opaque, booking-scoped reference redeemed through the gated
                // proxy — never an /uploads/ URL.
                var u = new URL(config.ajaxUrl, window.location.origin);
                u.searchParams.set('action', 'mphbac_staff_photo');
                u.searchParams.set('nonce', config.nonce);
                u.searchParams.set('booking_id', String(bookingId));
                u.searchParams.set('field', photo.field);
                a.href = u.toString();
                a.target = '_blank';
                a.rel = 'noopener noreferrer nofollow';
                a.textContent = S.viewPhoto || 'View photo ID';
                wrap.appendChild(a);
                var note = document.createElement('span');
                note.className = 'mphbac-staff-photo-note';
                note.textContent = ' ' + (S.photoNote || '');
                wrap.appendChild(note);
                s.appendChild(wrap);
            }
            return s;
        }

        function addRow(dl, label, value) {
            if (value === undefined || value === null) return;
            var dt = document.createElement('dt'); dt.textContent = label;
            var dd = document.createElement('dd'); dd.textContent = value;
            if (value === '—') dd.className = 'is-empty';
            dl.appendChild(dt); dl.appendChild(dd);
        }

        // Money comes pre-formatted+sanitized from PHP (currency symbol is an
        // HTML entity); it is the ONLY value injected as HTML, into an element
        // that receives nothing else.
        function addRowHtml(dl, label, html) {
            if (!html) return;
            var dt = document.createElement('dt'); dt.textContent = label;
            var dd = document.createElement('dd'); dd.innerHTML = html;
            dl.appendChild(dt); dl.appendChild(dd);
        }

        // ---- sheet open/close + focus trap ---------------------------------

        function showSheet() {
            overlay.hidden = false;
            sheet.hidden = false;
            requestAnimationFrame(function () { requestAnimationFrame(function () {
                sheet.classList.add('is-open');
                overlay.classList.add('is-open');
                try { closeBtn.focus(); } catch (e) {}
            }); });
            document.addEventListener('keydown', onKeydown);
        }

        function hideSheet() {
            sheet.classList.remove('is-open');
            overlay.classList.remove('is-open');
            sheet.hidden = true;
            overlay.hidden = true;
            detailSeq++;                       // orphan any in-flight detail
            sheetBody.textContent = '';        // never leave PII in the DOM
            document.removeEventListener('keydown', onKeydown);
            if (lastTrigger && lastTrigger.focus) { try { lastTrigger.focus(); } catch (e) {} }
        }

        function onKeydown(e) {
            if (e.key === 'Escape') { hideSheet(); return; }
            if (e.key !== 'Tab') return;
            var f = focusables(sheet);
            if (!f.length) return;
            var first = f[0], last = f[f.length - 1];
            if (!sheet.contains(document.activeElement)) {
                e.preventDefault(); (e.shiftKey ? last : first).focus(); return;
            }
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }

        function focusables(box) {
            return [].slice.call(box.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(function (el) { return el.offsetParent !== null || el.getClientRects().length; });
        }

        overlay.addEventListener('click', hideSheet);
        closeBtn.addEventListener('click', hideSheet);

        // ---- nav ------------------------------------------------------------

        prevBtn.addEventListener('click', function () { month = shift(month, -1); loadMonth(); });
        nextBtn.addEventListener('click', function () { month = shift(month, 1); loadMonth(); });

        // ---- date helpers ---------------------------------------------------

        function shift(m, delta) {
            var d = new Date(m + '-01T00:00:00');
            d.setMonth(d.getMonth() + delta);
            return d.getFullYear() + '-' + pad(d.getMonth() + 1);
        }
        function monthDays(m) {
            var out = [], d = new Date(m + '-01T00:00:00'), mm = d.getMonth();
            while (d.getMonth() === mm) {
                out.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
                d.setDate(d.getDate() + 1);
            }
            return out;
        }
        function eachDate(from, to, fn) {
            if (!from || !to) return;
            var d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00'), guard = 0;
            while (d <= end && guard++ < 400) {
                fn(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
                d.setDate(d.getDate() + 1);
            }
        }
        function monthName(m) {
            var d = new Date(m + '-01T00:00:00');
            return ((CAL.months || [])[d.getMonth()] || '') + ' ' + d.getFullYear();
        }
        function dayLabel(dateStr) {
            var d = new Date(dateStr + 'T00:00:00');
            return ((CAL.weekdays || [])[d.getDay()] || '') + ' ' + d.getDate();
        }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function th(text) { var e = document.createElement('th'); e.scope = 'col'; e.textContent = text; return e; }

        loadMonth();
    }

    function boot() {
        document.querySelectorAll('.mphbac-staff').forEach(init);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}());
