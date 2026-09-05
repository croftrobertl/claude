/**
 * Staff booking calendar (mphb-availability-calendar).
 *
 * Two presentations of the same gated month payload:
 *   - AGENDA  — one day's arrivals, departures and in-house guests as a list.
 *               The phone default: at the door the question is "who is
 *               arriving and leaving today", not "show me the month".
 *   - CHART   — the tape chart: rows are cottages, columns are days, a bar
 *               per booking. Cottage column and date header stay pinned while
 *               the days scroll. The desktop default.
 * Tapping a booking in either loads its full detail lazily into a dialog.
 *
 * SECURITY CONTRACT (do not relax):
 *   - Every byte of guest data arrives from the gated endpoints in
 *     class-staff.php — nothing is embedded in the page.
 *   - Every value is written with textContent. No HTML-injection API is
 *     used anywhere in this file, and the server sends PLAIN TEXT for that
 *     reason (Staff_Data strips markup from prices and log entries). A
 *     crafted guest name is therefore inert here.
 *   - A 403 is a hard stop (session expired / not authorized), never
 *     "render what we have", so stale PII cannot linger after the gate
 *     closes. The dialog body is emptied on close for the same reason.
 *
 * Vanilla ES5-style, no dependencies, matching widget.js house style.
 */
(function () {
    'use strict';

    var NARROW = '(max-width: 700px)';
    var PREF_KEY = 'mphbacStaffView';

    function init(root) {
        if (!root || root.dataset.staffInit === '1') return;
        root.dataset.staffInit = '1';

        var config = {};
        try { config = JSON.parse(root.dataset.staffConfig || '{}'); } catch (e) { return; }
        var S = config.strings || {};
        var CAL = config.calendar || {};

        var titleEl  = root.querySelector('.mphbac-staff-title');
        var prevBtn  = root.querySelector('.mphbac-staff-prev');
        var nextBtn  = root.querySelector('.mphbac-staff-next');
        var todayBtn = root.querySelector('.mphbac-staff-today');
        var viewBtns = [].slice.call(root.querySelectorAll('.mphbac-staff-view'));
        var legendEl = root.querySelector('.mphbac-staff-legend');
        var agendaEl = root.querySelector('.mphbac-staff-agenda');
        var gridEl   = root.querySelector('.mphbac-staff-grid');
        var statusEl = root.querySelector('.mphbac-staff-status');
        var overlay  = root.querySelector('.mphbac-staff-overlay');
        var sheet    = root.querySelector('.mphbac-staff-sheet');
        var sheetTitle = root.querySelector('.mphbac-staff-sheet-title');
        var sheetBody  = root.querySelector('.mphbac-staff-sheet-body');
        var closeBtn   = root.querySelector('.mphbac-staff-close');
        if (!gridEl || !agendaEl || !sheet || !overlay) return;

        var state = {
            view:  null,               // 'agenda' | 'chart'
            month: config.month,       // chart anchor, 'YYYY-MM'
            day:   config.today,       // agenda anchor, 'YYYY-MM-DD'
            req:   0,                  // last-write-wins guard for month loads
            cache: {}                  // month -> payload (session only)
        };
        var lastTrigger = null;
        var mq = window.matchMedia ? window.matchMedia(NARROW) : null;

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

        function failureText(err) {
            if (err && err.forbidden) {
                return err.nonce ? (S.expired || 'Session expired.') : (S.denied || 'Not authorized.');
            }
            return S.error || 'Could not load bookings.';
        }

        // ---- view switching -------------------------------------------------

        function savedView() {
            try {
                var v = window.localStorage.getItem(PREF_KEY);
                return (v === 'agenda' || v === 'chart') ? v : null;
            } catch (e) { return null; }
        }
        function autoView() {
            return (mq && mq.matches) ? 'agenda' : 'chart';
        }

        function setView(view, byUser) {
            if (view !== 'agenda' && view !== 'chart') return;
            if (state.view === 'agenda' && view === 'chart') {
                // Follow the day the list was showing.
                state.month = state.day.slice(0, 7);
            } else if (state.view === 'chart' && view === 'agenda') {
                // Stay on today if the chart is on this month, else on its 1st.
                if (state.day.slice(0, 7) !== state.month) {
                    state.day = (state.month === config.month) ? config.today : state.month + '-01';
                }
            }
            state.view = view;
            viewBtns.forEach(function (b) {
                b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false');
            });
            agendaEl.hidden = view !== 'agenda';
            gridEl.hidden = view !== 'chart';
            if (legendEl) legendEl.hidden = view !== 'chart';
            prevBtn.setAttribute('aria-label', view === 'agenda' ? (S.prevDay || 'Previous day') : (S.prevMonth || 'Previous month'));
            nextBtn.setAttribute('aria-label', view === 'agenda' ? (S.nextDay || 'Next day') : (S.nextMonth || 'Next month'));
            if (byUser) {
                try { window.localStorage.setItem(PREF_KEY, view); } catch (e) { /* private mode */ }
            }
            render();
        }

        viewBtns.forEach(function (b) {
            b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
        });
        if (mq) {
            var onMq = function () {
                // Only follow the breakpoint while the user has not chosen.
                if (!savedView()) setView(autoView(), false);
            };
            if (mq.addEventListener) mq.addEventListener('change', onMq);
            else if (mq.addListener) mq.addListener(onMq);
        }

        // ---- rendering dispatch ---------------------------------------------

        function render() {
            var wanted = (state.view === 'agenda') ? state.day.slice(0, 7) : state.month;
            renderTitle();
            if (todayBtn) {
                todayBtn.hidden = (state.view === 'agenda') ? (state.day === config.today) : (state.month === config.month);
            }
            ensureMonth(wanted, function (data) {
                if (state.view === 'agenda') renderAgenda(data);
                else renderChart(data);
            });
        }

        function ensureMonth(month, cb) {
            var seq = ++state.req;
            if (state.cache[month]) { say(''); cb(state.cache[month]); return; }
            say(S.loading || 'Loading…');
            gridEl.setAttribute('aria-busy', 'true');
            agendaEl.setAttribute('aria-busy', 'true');
            post('mphbac_staff_month', { month: month }).then(function (json) {
                if (seq !== state.req) return;              // superseded
                if (!json || !json.success || !json.data) { say(S.error, true); return; }
                state.cache[month] = json.data;
                say('');
                cb(json.data);
            }).catch(function (err) {
                if (seq !== state.req) return;
                say(failureText(err), true);
            }).then(function () {
                if (seq === state.req) {
                    gridEl.removeAttribute('aria-busy');
                    agendaEl.removeAttribute('aria-busy');
                }
            });
        }

        function renderTitle() {
            titleEl.textContent = '';
            if (state.view === 'agenda') {
                // Phones get the short form so the title stays on one line.
                titleEl.appendChild(document.createTextNode((mq && mq.matches) ? mediumDate(state.day) : longDate(state.day)));
                var sub = document.createElement('span');
                sub.className = 'mphbac-staff-title-sub';
                sub.textContent = (state.day === config.today) ? (S.today || 'Today') : monthName(state.day.slice(0, 7));
                titleEl.appendChild(sub);
            } else {
                titleEl.textContent = monthName(state.month);
            }
        }

        // ---- TAPE CHART -----------------------------------------------------

        function renderChart(data) {
            gridEl.textContent = '';

            var days = monthDays(state.month);
            var N = days.length;
            if (!N) return;
            var idx = {};
            days.forEach(function (d, i) { idx[d] = i; });
            var first = days[0], last = days[N - 1];

            // bars per cottage (room type id -> [bar])
            var barsByType = {};
            (data.bookings || []).forEach(function (b) {
                if (!b.checkin || !b.checkout) return;
                var contLeft = b.checkin < first;
                var contRight = b.checkout > last;
                // Half-day tracks: 0 = start of day 0, 2N = end of day N-1.
                var startHalf = contLeft ? 0 : (2 * idx[b.checkin] + 1);
                var endHalf = contRight ? 2 * N : (2 * idx[b.checkout] + 1);
                if (isNaN(startHalf) || isNaN(endHalf)) return;
                if (endHalf <= startHalf) endHalf = startHalf + 1;      // malformed 0-night
                (b.cottages || []).forEach(function (c) {
                    (barsByType[c.roomTypeId] = barsByType[c.roomTypeId] || []).push({
                        b: b, c: c, start: startHalf, end: endHalf, contLeft: contLeft, contRight: contRight
                    });
                });
            });

            var chart = document.createElement('div');
            chart.className = 'mphbac-staff-chart';
            chart.style.setProperty('--staff-halfdays', String(2 * N));

            // header row
            var corner = document.createElement('div');
            corner.className = 'mphbac-staff-corner';
            corner.textContent = S.cottage || 'Cottage';
            corner.style.gridRow = '1';
            corner.style.gridColumn = '1';
            chart.appendChild(corner);
            days.forEach(function (d, i) {
                var h = document.createElement('div');
                h.className = 'mphbac-staff-dayhead' + dayClasses(d, data.today);
                h.style.gridRow = '1';
                h.style.gridColumn = (2 + 2 * i) + ' / span 2';
                var wd = document.createElement('span');
                wd.textContent = weekdayShort(d);
                var num = document.createElement('span');
                num.className = 'mphbac-staff-daynum';
                num.textContent = String(parseInt(d.slice(8, 10), 10));
                h.appendChild(wd);
                h.appendChild(num);
                h.setAttribute('aria-label', longDate(d));
                chart.appendChild(h);
            });

            // cottage rows
            var row = 2;
            (data.cottages || []).forEach(function (c, ci) {
                var bars = barsByType[c.id] || [];
                var lanes = assignLanes(bars);

                var label = document.createElement('div');
                label.className = 'mphbac-staff-rowlabel' + (ci % 2 ? ' is-alt' : '');
                label.style.gridColumn = '1';
                label.style.gridRow = row + ' / span ' + lanes;
                label.title = c.title || '';
                var num = document.createElement('span');
                num.className = 'mphbac-staff-rownum';
                num.textContent = c.number ? '#' + c.number : (c.abbrev || c.title || '');
                label.appendChild(num);
                if (c.number && (c.abbrev || c.title)) {
                    var nm = document.createElement('span');
                    nm.className = 'mphbac-staff-rowname';
                    nm.textContent = c.abbrev || c.title;
                    label.appendChild(nm);
                }
                chart.appendChild(label);

                days.forEach(function (d, i) {
                    var cell = document.createElement('div');
                    cell.className = 'mphbac-staff-daycell' + dayClasses(d, data.today);
                    cell.style.gridColumn = (2 + 2 * i) + ' / span 2';
                    cell.style.gridRow = row + ' / span ' + lanes;
                    chart.appendChild(cell);
                });

                bars.forEach(function (bar) {
                    var el = barEl(bar, c);
                    el.style.gridColumn = (2 + bar.start) + ' / ' + (2 + bar.end);
                    el.style.gridRow = String(row + bar.lane);
                    chart.appendChild(el);
                });

                row += lanes;
            });

            gridEl.appendChild(chart);

            // Bring today into view (a little context to its left).
            var th = chart.querySelector('.mphbac-staff-dayhead.is-today');
            if (th) {
                gridEl.scrollLeft = Math.max(0, th.offsetLeft - label_w() - th.offsetWidth);
            } else {
                gridEl.scrollLeft = 0;
            }

            if (!(data.bookings || []).length) say(S.empty || '');
        }

        function label_w() {
            var v = parseFloat(getComputedStyle(root).getPropertyValue('--staff-label-w'));
            return isNaN(v) ? 96 : v;
        }

        // Greedy interval colouring: overlapping bookings in one cottage
        // (a pending double-booking, an overlapping import) each get their
        // own lane instead of painting over each other. Returns lane count.
        function assignLanes(bars) {
            bars.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
            var laneEnds = [];
            bars.forEach(function (bar) {
                var lane = -1;
                for (var i = 0; i < laneEnds.length; i++) {
                    if (laneEnds[i] <= bar.start) { lane = i; break; }
                }
                if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
                laneEnds[lane] = bar.end;
                bar.lane = lane;
            });
            return Math.max(1, laneEnds.length);
        }

        function barEl(bar, cottage) {
            var b = bar.b;
            var btn = document.createElement('button');
            btn.type = 'button';
            var nights = nightsBetween(b.checkin, b.checkout);
            var cls = 'mphbac-staff-bar';
            if (b.status && b.status !== 'confirmed') cls += ' is-pending';
            if (b.imported) cls += ' is-imported';
            if (bar.contLeft) cls += ' is-cont-left';
            if (bar.contRight) cls += ' is-cont-right';
            if (bar.end - bar.start > 2) cls += ' has-body';
            btn.className = cls;
            btn.setAttribute('data-booking-id', String(b.id));

            // Segments: the SAME state classes the legend swatches use.
            if (!bar.contLeft) btn.appendChild(seg('in'));
            btn.appendChild(seg('stay'));
            if (!bar.contRight) btn.appendChild(seg('out'));

            var label = document.createElement('span');
            label.className = 'mphbac-staff-bar-label';
            if (b.imported) label.appendChild(otaBadge(b));
            var text = document.createElement('span');
            text.className = 'mphbac-staff-bar-text';
            var who = b.guestName || ('#' + b.id);
            // Deliberate short forms by available width (title/aria carry the
            // full name; the dialog shows everything): 1 night = initials,
            // 2–3 nights = "First L.", 4+ nights = the full name.
            text.textContent = nights >= 4 ? who : (nights <= 1 ? initials(who) : shortName(who));
            label.appendChild(text);
            btn.appendChild(label);

            var desc = describe(b, cottage);
            btn.title = desc;
            btn.setAttribute('aria-label', desc);
            btn.addEventListener('click', function () { openDetail(b.id, btn); });
            return btn;
        }

        function seg(kind) {
            var s = document.createElement('span');
            s.className = 'mphbac-staff-seg is-' + kind;
            return s;
        }

        function otaBadge(b) {
            var s = document.createElement('span');
            s.className = 'mphbac-staff-otabadge';
            var ota = (b.source && b.source.ota) || '';
            s.textContent = ota ? ota.charAt(0).toUpperCase() : '!';
            s.title = ota;
            s.setAttribute('aria-hidden', 'true');
            return s;
        }

        // Full sentence for title/aria: name — cottage — dates (n nights) — status — via OTA
        function describe(b, cottage) {
            var parts = [b.guestName || ('#' + b.id)];
            if (cottage && cottage.title) parts.push(cottage.title);
            var n = nightsBetween(b.checkin, b.checkout);
            parts.push(shortDate(b.checkin) + ' → ' + shortDate(b.checkout) + ' (' + n + ' ' + (n === 1 ? (S.night || 'night') : (S.nights || 'nights')) + ')');
            if (b.statusLabel && b.status !== 'confirmed') parts.push(b.statusLabel);
            if (b.imported && b.source && b.source.ota) parts.push((S.via || 'via') + ' ' + b.source.ota);
            return parts.join(' — ');
        }

        // ---- AGENDA -----------------------------------------------------------

        function renderAgenda(data) {
            agendaEl.textContent = '';
            var day = state.day;
            var groups = { 'in': [], 'out': [], 'stay': [] };
            (data.bookings || []).forEach(function (b) {
                if (!b.checkin || !b.checkout) return;
                if (b.checkin === day) groups['in'].push(b);
                else if (b.checkout === day) groups['out'].push(b);
                else if (b.checkin < day && b.checkout > day) groups['stay'].push(b);
            });
            Object.keys(groups).forEach(function (k) { groups[k].sort(byCottage); });

            agendaEl.appendChild(group('in', S.arrivals || 'Arriving', groups['in'], S.noArrivals || ''));
            agendaEl.appendChild(group('out', S.departures || 'Departing', groups['out'], S.noDepartures || ''));
            agendaEl.appendChild(group('stay', S.inHouse || 'In house', groups['stay'], S.noInHouse || ''));
        }

        function byCottage(a, b) {
            var an = parseInt((a.cottages[0] || {}).number, 10) || 0;
            var bn = parseInt((b.cottages[0] || {}).number, 10) || 0;
            return an - bn || a.id - b.id;
        }

        function group(kind, title, items, emptyText) {
            var sec = document.createElement('section');
            sec.className = 'mphbac-staff-group is-' + kind;
            var head = document.createElement('div');
            head.className = 'mphbac-staff-group-head';
            head.appendChild(document.createTextNode(title));
            var count = document.createElement('span');
            count.className = 'mphbac-staff-group-count';
            count.textContent = String(items.length);
            head.appendChild(count);
            sec.appendChild(head);
            if (!items.length) {
                var p = document.createElement('p');
                p.className = 'mphbac-staff-group-empty';
                p.textContent = emptyText;
                sec.appendChild(p);
                return sec;
            }
            items.forEach(function (b) { sec.appendChild(item(b, kind)); });
            return sec;
        }

        function item(b, kind) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mphbac-staff-item';
            btn.setAttribute('data-booking-id', String(b.id));

            var cot = document.createElement('span');
            cot.className = 'mphbac-staff-item-cottage';
            var nums = (b.cottages || []).map(function (c) { return c.number ? '#' + c.number : (c.abbrev || ''); }).filter(Boolean);
            var n1 = document.createElement('span');
            n1.className = 'mphbac-staff-rownum';
            n1.textContent = nums.join(', ') || '—';
            cot.appendChild(n1);
            var c0 = (b.cottages || [])[0];
            if (c0 && (c0.abbrev || c0.title) && (b.cottages || []).length === 1) {
                var n2 = document.createElement('span');
                n2.className = 'mphbac-staff-rowname';
                n2.textContent = c0.abbrev || c0.title;
                cot.appendChild(n2);
            }
            btn.appendChild(cot);

            var main = document.createElement('span');
            main.className = 'mphbac-staff-item-main';
            var name = document.createElement('span');
            name.className = 'mphbac-staff-item-name';
            if (b.imported) name.appendChild(otaBadge(b));
            name.appendChild(document.createTextNode(b.guestName || ('#' + b.id)));
            main.appendChild(name);

            var meta = document.createElement('span');
            meta.className = 'mphbac-staff-item-meta';
            var n = nightsBetween(b.checkin, b.checkout);
            var bits = [n + ' ' + (n === 1 ? (S.night || 'night') : (S.nights || 'nights'))];
            if (kind === 'in') bits.push((S.until || 'until') + ' ' + shortDate(b.checkout));
            else if (kind === 'out') bits.push((S.since || 'since') + ' ' + shortDate(b.checkin));
            else bits.push(shortDate(b.checkin) + ' – ' + shortDate(b.checkout));
            meta.appendChild(document.createTextNode(bits.join(' · ')));
            if (b.status && b.status !== 'confirmed' && b.statusLabel) {
                meta.appendChild(document.createTextNode(' · '));
                var st = document.createElement('span');
                st.className = 'is-pending';
                st.textContent = b.statusLabel;
                meta.appendChild(st);
            }
            main.appendChild(meta);
            btn.appendChild(main);

            var chev = document.createElement('span');
            chev.className = 'mphbac-staff-item-chev';
            chev.textContent = '›';
            chev.setAttribute('aria-hidden', 'true');
            btn.appendChild(chev);

            btn.setAttribute('aria-label', describe(b, c0));
            btn.addEventListener('click', function () { openDetail(b.id, btn); });
            return btn;
        }

        // ---- detail dialog --------------------------------------------------

        var detailSeq = 0;
        var closeTimer = null;
        var sheetMarker = document.createComment('mphbac-staff-sheet');
        var overlayMarker = document.createComment('mphbac-staff-overlay');

        function openDetail(bookingId, trigger) {
            lastTrigger = trigger || null;
            var seq = ++detailSeq;
            sheetTitle.textContent = (S.detailTitle || 'Booking') + ' #' + bookingId;
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
                sheetBody.textContent = failureText(err);
            });
        }

        function renderDetail(d) {
            sheetBody.textContent = '';
            sheetTitle.textContent = (S.detailTitle || 'Booking') + ' #' + d.id;

            if (d.imported) {
                var banner = document.createElement('p');
                banner.className = 'mphbac-staff-imported';
                banner.textContent = (d.source && d.source.ota ? d.source.ota : 'External') + ' — ' + (S.importedTip || '');
                sheetBody.appendChild(banner);
            }
            var sec = d.sections || {};
            sheetBody.appendChild(rowsSection(S.secBooking, sec.booking));
            sheetBody.appendChild(roomsSection(S.secRooms, sec.rooms));
            sheetBody.appendChild(customerSection(S.secCustomer, sec.customer, d.id));
            sheetBody.appendChild(rowsSection(S.secNotes, sec.notes));
        }

        function section(title) {
            var s = document.createElement('section');
            s.className = 'mphbac-staff-section';
            var h = document.createElement('h3');
            h.textContent = title || '';
            s.appendChild(h);
            return s;
        }

        var MONEY_LABELS = {};
        [S.total, 'Total', 'Paid', 'Balance due'].forEach(function (l) { if (l) MONEY_LABELS[l] = true; });

        function rowsSection(title, rows) {
            var s = section(title);
            var dl = document.createElement('dl');
            (rows || []).forEach(function (r) {
                if (!r || !r.label) return;
                addRow(dl, r.label, r.value);
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
                h.textContent = (r.cottage || '') + (r.unit && r.unit !== '—' ? ' · ' + r.unit : '');
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
                (r.services || []).forEach(function (x) { addRow(dl, S.services || 'Services', x.label + (x.price && x.price !== '—' ? ' — ' + x.price : '')); });
                (r.fees || []).forEach(function (x) { addRow(dl, S.fees || 'Fees', x.label + (x.price && x.price !== '—' ? ' — ' + x.price : '')); });
                addRow(dl, S.total || 'Total', r.total);
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
                note.textContent = S.photoNote || '';
                wrap.appendChild(note);
                s.appendChild(wrap);
            }
            return s;
        }

        // The ONLY way a value reaches the dialog: textContent.
        function addRow(dl, label, value) {
            if (value === undefined || value === null) return;
            var dt = document.createElement('dt'); dt.textContent = label;
            var dd = document.createElement('dd'); dd.textContent = String(value);
            if (value === '—') dd.className = 'is-empty';
            else if (MONEY_LABELS[label]) dd.className = 'is-money';
            dl.appendChild(dt); dl.appendChild(dd);
        }

        // ---- dialog open/close, portal, focus trap ---------------------------

        function showSheet() {
            if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
            // Portal to <body>: position:fixed must measure the viewport, not
            // whichever Elementor ancestor carries a transform (which is what
            // made the old dialog open "high" and clip its own heading).
            if (sheet.parentNode !== document.body) {
                sheet.parentNode.insertBefore(sheetMarker, sheet);
                document.body.appendChild(sheet);
            }
            if (overlay.parentNode !== document.body) {
                overlay.parentNode.insertBefore(overlayMarker, overlay);
                document.body.appendChild(overlay);
            }
            overlay.hidden = false;
            sheet.hidden = false;
            sheetBody.scrollTop = 0;
            document.documentElement.classList.add('mphbac-staff-open');
            document.body.classList.add('mphbac-staff-open');
            requestAnimationFrame(function () { requestAnimationFrame(function () {
                sheet.classList.add('is-open');
                overlay.classList.add('is-open');
                try { closeBtn.focus(); } catch (e) { /* ignore */ }
            }); });
            document.addEventListener('keydown', onKeydown);
        }

        function hideSheet() {
            sheet.classList.remove('is-open');
            overlay.classList.remove('is-open');
            detailSeq++;                       // orphan any in-flight detail
            sheetBody.textContent = '';        // never leave PII in the DOM
            document.documentElement.classList.remove('mphbac-staff-open');
            document.body.classList.remove('mphbac-staff-open');
            document.removeEventListener('keydown', onKeydown);
            closeTimer = setTimeout(function () {
                closeTimer = null;
                sheet.hidden = true;
                overlay.hidden = true;
                // Put the nodes back where they came from so the shell stays
                // self-contained (and Elementor's editor can rebuild it).
                if (sheetMarker.parentNode) { sheetMarker.parentNode.insertBefore(sheet, sheetMarker); sheetMarker.parentNode.removeChild(sheetMarker); }
                if (overlayMarker.parentNode) { overlayMarker.parentNode.insertBefore(overlay, overlayMarker); overlayMarker.parentNode.removeChild(overlayMarker); }
            }, 220);
            if (lastTrigger && lastTrigger.focus) { try { lastTrigger.focus(); } catch (e) { /* ignore */ } }
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

        function step(delta) {
            if (state.view === 'agenda') state.day = shiftDay(state.day, delta);
            else state.month = shiftMonth(state.month, delta);
            render();
        }
        prevBtn.addEventListener('click', function () { step(-1); });
        nextBtn.addEventListener('click', function () { step(1); });
        if (todayBtn) {
            // Hidden while already on today / the current month so it never
            // sits there as a no-op button.
            todayBtn.addEventListener('click', function () {
                state.day = config.today;
                state.month = config.month;
                render();
            });
        }

        // ---- date helpers ---------------------------------------------------

        function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
        function shiftMonth(m, delta) {
            var d = new Date(m + '-01T00:00:00');
            d.setMonth(d.getMonth() + delta);
            return d.getFullYear() + '-' + pad(d.getMonth() + 1);
        }
        function shiftDay(s, delta) {
            var d = new Date(s + 'T00:00:00');
            d.setDate(d.getDate() + delta);
            return ymd(d);
        }
        function monthDays(m) {
            var out = [], d = new Date(m + '-01T00:00:00'), mm = d.getMonth();
            while (d.getMonth() === mm) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
            return out;
        }
        function nightsBetween(a, b) {
            var x = new Date(a + 'T00:00:00'), y = new Date(b + 'T00:00:00');
            return Math.max(0, Math.round((y - x) / 86400000));
        }
        function dayClasses(d, today) {
            var dt = new Date(d + 'T00:00:00');
            var c = '';
            if (d === today) c += ' is-today';
            else if (today && d < today) c += ' is-past';
            var wd = dt.getDay();
            if (wd === 0 || wd === 6) c += ' is-weekend';
            return c;
        }
        function monthName(m) {
            var d = new Date(m + '-01T00:00:00');
            return ((CAL.months || [])[d.getMonth()] || '') + ' ' + d.getFullYear();
        }
        function weekdayShort(s) {
            var d = new Date(s + 'T00:00:00');
            return ((CAL.weekdays || [])[d.getDay()] || '').slice(0, 2);
        }
        function shortDate(s) {
            if (!s) return '';
            var d = new Date(s + 'T00:00:00');
            return ((CAL.months || [])[d.getMonth()] || '').slice(0, 3) + ' ' + d.getDate();
        }
        function mediumDate(s) {
            var d = new Date(s + 'T00:00:00');
            return ((CAL.weekdays || [])[d.getDay()] || '') + ', ' + shortDate(s) + ', ' + d.getFullYear();
        }
        function longDate(s) {
            var d = new Date(s + 'T00:00:00');
            var wd = (CAL.weekdaysFull || CAL.weekdays || [])[d.getDay()] || '';
            return wd + ', ' + ((CAL.months || [])[d.getMonth()] || '') + ' ' + d.getDate() + ', ' + d.getFullYear();
        }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        // "Bob Jones" -> "BJ"; "#905" passes through.
        function initials(full) {
            var s = String(full || '').trim();
            if (!s || s.charAt(0) === '#') return s;
            var w = s.split(/\s+/);
            return (w[0].charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase();
        }
        // "Dock Buchanan" -> "Dock B."; booking numbers and single words pass through.
        function shortName(full) {
            var s = String(full || '').trim();
            if (!s || s.charAt(0) === '#') return s;
            var w = s.split(/\s+/);
            if (w.length < 2) return s;
            return w[0] + ' ' + w[w.length - 1].charAt(0).toUpperCase() + '.';
        }

        setView(savedView() || autoView(), false);
    }

    function boot() {
        ensureViewportFitCover();
        document.querySelectorAll('.mphbac-staff').forEach(init);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Lets the dialog's safe-area math see real inset values on iOS Safari.
    // Idempotent; same helper widget.js carries.
    function ensureViewportFitCover() {
        var meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;
        var content = meta.getAttribute('content') || '';
        if (content.indexOf('viewport-fit') >= 0) return;
        meta.setAttribute('content', content + (content ? ', ' : '') + 'viewport-fit=cover');
    }

    // The Elementor editor mounts widget markup AFTER DOMContentLoaded, so
    // boot()'s single sweep would leave the staff widget as a dead shell in
    // the editor preview (and would miss any late-mounted frontend instance).
    // init() is idempotent via the data-staff-init flag, and Elementor builds
    // a fresh node on each edit, so re-running is both safe and necessary.
    if (window.elementorFrontend && window.elementorFrontend.hooks) {
        window.elementorFrontend.hooks.addAction('frontend/element_ready/dccac_staff.default', function ($el) {
            if ($el && $el[0]) {
                var el = $el[0].querySelector('.mphbac-staff');
                if (el) init(el);
            }
        });
    }
}());
