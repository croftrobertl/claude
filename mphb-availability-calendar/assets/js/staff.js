/**
 * Staff booking calendar (mphb-availability-calendar).
 *
 * Four periods (0.43.0), chosen from a menu, over two presentations:
 *   - DAILY   — the AGENDA: one day's arrivals, departures and in-house
 *               guests as a list.
 *   - WEEKLY, MONTHLY, YEARLY — the tape CHART at three widths: rows are
 *               cottages, columns are days, a bar per booking. Weekly fills
 *               the screen; Monthly and Yearly scroll sideways with the
 *               cottage column and date header pinned.
 * Every device opens on Monthly until it chooses; after that it reopens its
 * last period. Tapping a booking loads its full detail lazily into a dialog.
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
    // The key 0.42.x stored 'agenda' / 'chart' under. Reused, so a device's
    // old choice carries over (agenda -> Daily, chart -> Monthly) and no
    // orphaned key is left behind. Only a period NAME is ever stored here.
    var PREF_KEY = 'mphbacStaffView';
    var PERIODS = ['day', 'week', 'month', 'year'];
    var SWIPE_MIN_PX = 60;

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
        var periodSel = root.querySelector('.mphbac-staff-period');
        var gotoEl   = root.querySelector('.mphbac-staff-goto');
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

        var SOW = Math.max(0, Math.min(6, parseInt(CAL.startOfWeek, 10) || 0));   // WordPress "Week Starts On"
        // The ±3-year browsing cap, mirrored from Staff::send_range() so the
        // arrows and the date picker never ask for a window it would refuse.
        var CAP_LO = shiftYears(config.today, -3);
        var CAP_HI = shiftYears(config.today, 3);
        var state = {
            period: null,              // 'day' | 'week' | 'month' | 'year'
            anchor: config.today,      // a date inside the window, 'YYYY-MM-DD'
            req:   0,                  // last-write-wins guard for month loads
            cache: {}                  // 'from|to' -> payload (session only)
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

        // ---- periods: Daily / Weekly / Monthly / Yearly ---------------------

        function savedPeriod() {
            try {
                var v = window.localStorage.getItem(PREF_KEY);
                if (v === 'agenda') return 'day';      // 0.42.x "List"
                if (v === 'chart') return 'month';     // 0.42.x "Chart"
                return PERIODS.indexOf(v) >= 0 ? v : null;
            } catch (e) { return null; }               // storage blocked: Monthly
        }

        function setPeriod(period, byUser) {
            if (PERIODS.indexOf(period) < 0) return;
            state.period = period;
            if (periodSel && periodSel.value !== period) periodSel.value = period;
            var isDay = period === 'day';
            agendaEl.hidden = !isDay;
            gridEl.hidden = isDay;
            if (legendEl) legendEl.hidden = isDay;
            var cap = period.charAt(0).toUpperCase() + period.slice(1);
            prevBtn.setAttribute('aria-label', S['prev' + cap] || 'Previous');
            nextBtn.setAttribute('aria-label', S['next' + cap] || 'Next');
            // Written ONLY on a deliberate choice, never on load, so a device
            // that has never chosen keeps opening on Monthly.
            if (byUser) {
                try { window.localStorage.setItem(PREF_KEY, period); } catch (e) { /* private mode */ }
            }
            render();
        }

        if (periodSel) {
            periodSel.addEventListener('change', function () { setPeriod(periodSel.value, true); });
        }
        if (gotoEl) {
            gotoEl.min = CAP_LO;
            gotoEl.max = CAP_HI;
            gotoEl.addEventListener('change', function () {
                var v = gotoEl.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                // min/max are advisory in some browsers when a date is typed.
                if (v < CAP_LO || v > CAP_HI) { say(S.outOfRange || '', true); return; }
                state.anchor = v;
                render();
            });
        }

        // The window a period shows around a date. Weeks start on WordPress's
        // own "Week Starts On" setting rather than a hard-coded Sunday.
        function windowOf(a, period) {
            if (period === 'day') return { from: a, to: a };
            if (period === 'week') {
                var back = (new Date(a + 'T00:00:00').getDay() - SOW + 7) % 7;
                var from = shiftDay(a, -back);
                return { from: from, to: shiftDay(from, 6) };
            }
            if (period === 'month') {
                var md = monthDays(a.slice(0, 7));
                return { from: md[0], to: md[md.length - 1] };
            }
            var y = a.slice(0, 4);
            return { from: y + '-01-01', to: y + '-12-31' };
        }

        // Where an arrow lands: one whole period on. It lands ON today when
        // the new window holds today, else on the window's first day — so
        // switching to Daily afterwards shows a day inside what was on screen.
        function stepAnchor(delta) {
            var p = state.period, a = state.anchor, n;
            if (p === 'day') n = shiftDay(a, delta);
            else if (p === 'week') n = shiftDay(windowOf(a, 'week').from, 7 * delta);
            else if (p === 'month') n = shiftMonth(a.slice(0, 7), delta) + '-01';
            else n = (parseInt(a.slice(0, 4), 10) + delta) + '-01-01';
            var w = windowOf(n, p);
            return (config.today >= w.from && config.today <= w.to) ? config.today : n;
        }

                // ---- rendering dispatch ---------------------------------------------

        function render() {
            var w = windowOf(state.anchor, state.period);
            renderTitle(w);
            // An arrow whose next window lies wholly outside the cap would
            // only fetch a refusal; it is disabled instead.
            prevBtn.disabled = windowOf(stepAnchor(-1), state.period).to < CAP_LO;
            nextBtn.disabled = windowOf(stepAnchor(1), state.period).from > CAP_HI;
            if (gotoEl) gotoEl.value = state.anchor;
            // Daily reads the whole month around its day, so stepping a day at
            // a time is a cache hit rather than a request per tap.
            var load = (state.period === 'day') ? windowOf(state.anchor, 'month') : w;
            ensureRange(load.from, load.to, function (data) {
                if (state.period === 'day') renderAgenda(data);
                else renderChart(data, w);
                // Judged against what is ON SCREEN, not the payload's own flag:
                // a week served from a cached, clamped year may itself be
                // entirely inside the cap.
                if ((data.from && w.from < data.from) || (data.to && w.to > data.to)) {
                    say(S.partial || '');
                }
            });
        }

        // A cached payload covering the whole window serves it: bookings
        // overlapping a sub-window are a subset of those overlapping the
        // window that was fetched. So a week inside a loaded month, or any
        // month of a loaded year, costs no request.
        function cachedCovering(from, to) {
            for (var k in state.cache) {
                if (!Object.prototype.hasOwnProperty.call(state.cache, k)) continue;
                var p = k.split('|');
                if (p[0] <= from && p[1] >= to) return state.cache[k];
            }
            return null;
        }

        function ensureRange(from, to, cb) {
            var seq = ++state.req;
            var hit = cachedCovering(from, to);
            if (hit) { say(''); cb(hit); return; }
            say(S.loading || 'Loading…');
            gridEl.setAttribute('aria-busy', 'true');
            agendaEl.setAttribute('aria-busy', 'true');
            post('mphbac_staff_month', { from: from, to: to }).then(function (json) {
                if (seq !== state.req) return;              // superseded
                if (!json || !json.success || !json.data) { say(S.error, true); return; }
                state.cache[from + '|' + to] = json.data;
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

        function renderTitle(w) {
            titleEl.textContent = '';
            var p = state.period;
            if (p === 'day') {
                var day = state.anchor;
                // Phones get the short form so the title stays on one line.
                titleEl.appendChild(document.createTextNode((mq && mq.matches) ? mediumDate(day) : longDate(day)));
                var sub = document.createElement('span');
                sub.className = 'mphbac-staff-title-sub';
                sub.textContent = (day === config.today) ? (S.today || 'Today') : monthName(day.slice(0, 7));
                titleEl.appendChild(sub);
            } else {
                // A chart period names a MONTH (0.43.1, Rob's option C): the
                // one filling most of what is on screen, kept current by
                // followScroll() once the chart is drawn. Until then, the
                // month that will fill it — the week's larger part, or the
                // anchor's month for a month or a year.
                setLabel(p === 'week' ? mostOf(w.from, w.to) : state.anchor.slice(0, 7));
            }
        }

        // Writes only on a change: the label is aria-live, and a scroll that
        // stays inside one month must not re-announce it on every frame.
        function setLabel(m) {
            var t = monthName(m);
            if (titleEl.textContent !== t) titleEl.textContent = t;
        }

        // The month holding the most days of [from, to]; the earlier on a tie.
        function mostOf(from, to) {
            var n = {}, best = null;
            daysBetween(from, to).forEach(function (d) {
                var m = d.slice(0, 7);
                n[m] = (n[m] || 0) + 1;
                if (best === null || n[m] > n[best]) best = m;
            });
            return best || from.slice(0, 7);
        }

        // THE LABEL FOLLOWS THE SCROLL. The visible days are those between
        // the pinned cottage column's right edge and the grid's right edge;
        // each month is weighed by how many PIXELS of it are in that span,
        // so a month half-scrolled in counts by half.
        function followScroll() {
            if (state.period === 'day') return;
            var chart = gridEl.firstChild;
            var heads = chart ? chart.querySelectorAll('.mphbac-staff-dayhead') : [];
            if (!heads.length) return;
            var lw = chartLabelW(chart);
            var lo = gridEl.scrollLeft + lw, hi = gridEl.scrollLeft + gridEl.clientWidth;
            var px = {}, best = null;
            for (var i = 0; i < heads.length; i++) {
                var h = heads[i], a = h.offsetLeft, b = a + h.offsetWidth;
                var seen = Math.min(b, hi) - Math.max(a, lo);
                if (seen <= 0) continue;
                var m = h.getAttribute('data-day').slice(0, 7);
                px[m] = (px[m] || 0) + seen;
                if (best === null || px[m] > px[best]) best = m;
            }
            if (best) setLabel(best);
        }
        var scrollRaf = 0;
        gridEl.addEventListener('scroll', function () {
            if (scrollRaf) return;
            scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; followScroll(); });
        }, { passive: true });

        // Bring a day into view with a day's context to its left.
        function scrollToDay(d) {
            var chart = gridEl.firstChild;
            var th = chart && chart.querySelector('.mphbac-staff-dayhead[data-day="' + d + '"]');
            gridEl.scrollLeft = th ? Math.max(0, th.offsetLeft - chartLabelW(chart) - th.offsetWidth) : 0;
            followScroll();
        }

                // ---- TAPE CHART -----------------------------------------------------

        function renderChart(data, w) {
            gridEl.textContent = '';

            var period = state.period;
            var days = daysBetween(w.from, w.to);
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
            chart.className = 'mphbac-staff-chart is-' + period;
            chart.style.setProperty('--staff-halfdays', String(2 * N));
            if (period === 'week') sizeWeek(chart);

            // header row
            chart.setAttribute('data-from', first);
            chart.setAttribute('data-to', last);
            var corner = document.createElement('div');
            corner.className = 'mphbac-staff-corner';
            corner.textContent = S.cottage || 'Cottages';
            corner.style.gridRow = '1 / span 2';
            corner.style.gridColumn = '1';
            chart.appendChild(corner);

            // Row 1: the month band, one cell per month (or part of one) in
            // the window, named as fully as its width allows.
            var dayW = (period === 'week')
                ? (parseFloat(chart.style.getPropertyValue('--staff-day-w')) || 44)
                : (parseFloat(getComputedStyle(root).getPropertyValue('--staff-day-w')) || 44);
            var segStart = 0;
            days.forEach(function (d, i) {
                if (i < N - 1 && days[i + 1].slice(0, 7) === d.slice(0, 7)) return;
                var len = i - segStart + 1, startDay = days[segStart];
                var band = document.createElement('div');
                band.className = 'mphbac-staff-monthband' + (startDay.slice(8, 10) === '01' ? ' is-month-start' : '');
                band.style.gridRow = '1';
                band.style.gridColumn = (2 + 2 * segStart) + ' / span ' + (2 * len);
                var name = document.createElement('span');
                name.className = 'mphbac-staff-monthname';
                var w = len * dayW;
                name.textContent = w >= 130 ? monthName(d.slice(0, 7)) : (w >= 40 ? shortMonth(d) : '');
                band.title = monthName(d.slice(0, 7));
                band.appendChild(name);
                chart.appendChild(band);
                segStart = i + 1;
            });

            // Row 2: the days.
            var starts = [];
            days.forEach(function (d, i) {
                var h = document.createElement('div');
                var isFirst = d.slice(8, 10) === '01';
                h.className = 'mphbac-staff-dayhead' + dayClasses(d, data.today) + (isFirst ? ' is-month-start' : '');
                h.setAttribute('data-day', d);
                h.style.gridRow = '2';
                h.style.gridColumn = (2 + 2 * i) + ' / span 2';
                var wd = document.createElement('span');
                var num = document.createElement('span');
                num.className = 'mphbac-staff-daynum';
                num.textContent = String(parseInt(d.slice(8, 10), 10));
                wd.textContent = weekdayShort(d);
                h.appendChild(wd);
                h.appendChild(num);
                h.setAttribute('aria-label', longDate(d));
                chart.appendChild(h);
                if (isFirst) starts.push(i);
            });

            // cottage rows
            var row = 3;
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

            // The rule down each 1st, through every cottage row and above the
            // bars (appended after them, at the same z-index).
            if (row > 3) {
                starts.forEach(function (i) {
                    var line = document.createElement('div');
                    line.className = 'mphbac-staff-monthline';
                    line.setAttribute('aria-hidden', 'true');
                    line.style.gridColumn = String(2 + 2 * i);
                    line.style.gridRow = '3 / ' + row;
                    chart.appendChild(line);
                });
            }

            gridEl.appendChild(chart);

            // Open on the anchor: today when the period holds it, else the
            // date the board was sent to (Go to date) or the period's start.
            scrollToDay(state.anchor);

            if (!(data.bookings || []).length) say(S.empty || '');
        }

        // WEEKLY FILLS THE SCREEN (Rob's choice, 2026-10-08). Seven days share
        // whatever width the board has, so on a desktop the columns grow wide
        // enough for full names. A phone cannot give a week more than its own
        // width, so there the cottage column shrinks to its number (about
        // 48px), leaving roughly 47px a day rather than the ~40 a 96px column
        // would leave. Never below the 44px the other periods use on a phone
        // that is wide enough; never wider than the screen, so a week never
        // scrolls sideways.
        function sizeWeek(chart) {
            var compact = !!(mq && mq.matches);
            var labelW = compact ? 48 : label_w();
            var avail = gridEl.clientWidth || 0;
            var dayW = avail ? Math.floor((avail - labelW - 1) / 7) : 44;
            chart.style.setProperty('--staff-day-w', Math.max(24, dayW) + 'px');
            if (compact) {
                chart.classList.add('is-compact');
                chart.style.setProperty('--staff-label-w', labelW + 'px');
            }
        }

        function label_w() {
            var v = parseFloat(getComputedStyle(root).getPropertyValue('--staff-label-w'));
            return isNaN(v) ? 96 : v;
        }
        // The cottage column as drawn — compact Weekly narrows it on the chart.
        function chartLabelW(chart) {
            var v = parseFloat(getComputedStyle(chart).getPropertyValue('--staff-label-w'));
            return isNaN(v) ? label_w() : v;
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
            var day = state.anchor;
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
            [[S.secBooking, sec.booking], [S.secCustomer, sec.customer], [S.secNotes, sec.notes]]
                .forEach(function (pair) {
                    var el = rowsSection(pair[0], pair[1], d.id);
                    if (el) sheetBody.appendChild(el);
                });
        }

        function section(title) {
            var s = document.createElement('section');
            s.className = 'mphbac-staff-section';
            var h = document.createElement('h3');
            h.textContent = title || '';
            s.appendChild(h);
            return s;
        }

        // Every section is label/value rows. A row the server marked with a
        // `photo` reference becomes the gated-proxy link instead; a row it
        // marked `muted` (an OTA-defaulted guest count) is greyed and italic
        // so it can never be mistaken for a fact.
        //
        // The server has already dropped every empty field, so anything that
        // arrives here has a value. A section with nothing in it is omitted
        // outright rather than left as a bare heading.
        function rowsSection(title, rows, bookingId) {
            if (!rows || !rows.length) return null;
            var s = section(title);
            var dl = document.createElement('dl');
            rows.forEach(function (r) {
                if (!r || !r.label) return;
                if (r.photo) { photoRow(dl, r, bookingId); return; }
                addRow(dl, r.label, r.value, r);
            });
            s.appendChild(dl);
            return s;
        }

        function photoRow(dl, r, bookingId) {
            var dt = document.createElement('dt'); dt.textContent = r.label;
            var dd = document.createElement('dd');
            var a = document.createElement('a');
            // Opaque, booking-scoped reference redeemed through the gated
            // proxy — never an /uploads/ URL.
            var u = new URL(config.ajaxUrl, window.location.origin);
            u.searchParams.set('action', 'mphbac_staff_photo');
            u.searchParams.set('nonce', config.nonce);
            u.searchParams.set('booking_id', String(bookingId));
            u.searchParams.set('field', r.photo.field);
            a.href = u.toString();
            a.target = '_blank';
            a.rel = 'noopener noreferrer nofollow';
            a.textContent = S.viewPhoto || 'View photo ID';
            dd.appendChild(a);
            var note = document.createElement('span');
            note.className = 'mphbac-staff-photo-note';
            note.textContent = S.photoNote || '';
            dd.appendChild(note);
            dd.className = 'mphbac-staff-photo';
            dl.appendChild(dt); dl.appendChild(dd);
        }

        // The ONLY way a value reaches the dialog: textContent.
        function addRow(dl, label, value, flags) {
            if (value === undefined || value === null || value === '') return;
            var dt = document.createElement('dt'); dt.textContent = label;
            var dd = document.createElement('dd'); dd.textContent = String(value);
            if (flags && flags.muted) {
                dd.className = 'is-unknown';
                dd.title = S.importedTip || '';
            } else if (flags && flags.money) {
                dd.className = 'is-money';
            }
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
            state.anchor = stepAnchor(delta);
            render();
        }
        prevBtn.addEventListener('click', function () { step(-1); });
        nextBtn.addEventListener('click', function () { step(1); });
        if (todayBtn) {
            // ALWAYS SHOWN (0.43.1). Keeps the period. When the period on
            // screen already holds today — a year scrolled to March, say — it
            // scrolls back to today rather than redrawing; otherwise it
            // moves to the period holding today.
            todayBtn.addEventListener('click', function () {
                var w = windowOf(state.anchor, state.period);
                var here = state.period !== 'day' && config.today >= w.from && config.today <= w.to
                    && gridEl.firstChild && gridEl.firstChild.getAttribute('data-from') === w.from;
                state.anchor = config.today;
                if (here) {
                    if (gotoEl) gotoEl.value = config.today;
                    scrollToDay(config.today);
                } else {
                    render();
                }
            });
        }

        // PHONE SWIPE (0.43.0): left = next period, right = previous. Bound to
        // the header, the period bar and the Daily list ONLY — never to the
        // chart, whose own sideways scroll is how Weekly, Monthly and Yearly
        // are read on a phone and must never be taken over. Passive, never
        // preventDefault(): a vertical page scroll is untouched. A gesture
        // counts only when it is clearly horizontal (at least 60px across and
        // twice as far across as down) and quick (under 0.7s).
        function bindSwipe(el) {
            if (!el) return;
            var x0 = 0, y0 = 0, t0 = 0, on = false;
            el.addEventListener('touchstart', function (e) {
                if (!e.touches || e.touches.length !== 1) { on = false; return; }
                x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); on = true;
            }, { passive: true });
            el.addEventListener('touchend', function (e) {
                if (!on) return;
                on = false;
                var t = e.changedTouches && e.changedTouches[0];
                if (!t) return;
                var dx = t.clientX - x0, dy = t.clientY - y0;
                if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - t0 > 700) return;
                var btn = dx < 0 ? nextBtn : prevBtn;
                if (!btn.disabled) step(dx < 0 ? 1 : -1);
            }, { passive: true });
            el.addEventListener('touchcancel', function () { on = false; }, { passive: true });
        }
        bindSwipe(root.querySelector('.mphbac-staff-topbar'));
        bindSwipe(root.querySelector('.mphbac-staff-tools'));
        bindSwipe(agendaEl);

        // Weekly's column width follows the board's width, so a rotation or a
        // resized window re-fits it. Served from the cache: no request.
        var resizeT = 0;
        window.addEventListener('resize', function () {
            if (state.period !== 'week') return;
            clearTimeout(resizeT);
            resizeT = setTimeout(render, 150);
        });

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
        function shiftYears(s, delta) {
            var d = new Date(s + 'T00:00:00');
            d.setFullYear(d.getFullYear() + delta);
            return ymd(d);
        }
        function daysBetween(from, to) {
            var out = [], d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00');
            while (d <= end) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
            return out;
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
        function shortMonth(s) {
            return ((CAL.months || [])[new Date(s + 'T00:00:00').getMonth()] || '').slice(0, 3);
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

        // Monthly for any device that has never chosen — phones included, by
        // Rob's decision (2026-10-08); 0.42.x opened phones on the list.
        setPeriod(savedPeriod() || 'month', false);
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
