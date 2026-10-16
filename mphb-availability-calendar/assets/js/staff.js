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
 * Every load opens on Monthly, on every device (Rob, 0.43.3); a period
 * picked from the menu lasts until the page is left or reloaded. Tapping a
 * booking loads its full detail lazily into a dialog.
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
    // The key 0.42.x - 0.43.2 remembered a device's period under. Nothing is
    // remembered since 0.43.3 (Rob: always open on Monthly), so the key is
    // only ever REMOVED — an old stored value can never win again. Rob's
    // phone opened on Daily because of exactly that: a 0.42.x "List" choice
    // carried over as Daily.
    var OLD_PREF_KEY = 'mphbacStaffView';
    var PERIODS = ['day', 'week', 'month', 'year'];
    var SWIPE_MIN_PX = 60;
    // 0.44.0
    var SOURCES = ['direct', 'airbnb', 'booking', 'vrbo'];
    var REFRESH_MS = 3 * 60 * 1000;           // auto-refresh while visible
    var REFRESH_RETRY_MS = 30 * 1000;         // a skipped refresh tries again
    var LONG_PRESS_MS = 500;
    var HOVER_DELAY_MS = 250;
    // The one-shot token-reload guard: the ONLY thing this board keeps in
    // sessionStorage, and only a timestamp. Never guest data.
    var RELOAD_GUARD = 'mphbacStaffReload';
    var RELOAD_GUARD_MS = 10 * 60 * 1000;
    // The view carried across that one reload, in the URL fragment — not in
    // storage — and removed the moment it is read back, so a reload the USER
    // makes still opens on Monthly.
    var VIEW_HASH = 'mphbac-view=';
    // ⓘ bubbles' ids (0.46.0), unique on the page.
    var TIP_SEQ = 0;
    // The site-drawn lists' ids (0.46.0).
    var PICK_SEQ = 0;

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
        var statsEl  = root.querySelector('.mphbac-staff-stats');
        // Compare to Last Year (0.47.0): Off · Behind · In Front.
        var lyGroup  = root.querySelector('.mphbac-staff-ghostfield');
        var lySegs   = lyGroup ? [].slice.call(lyGroup.querySelectorAll('.mphbac-staff-segbtn')) : [];
        var previewEl = root.querySelector('.mphbac-staff-preview');
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
            cache: {},                 // 'from|to' -> payload (session only)
            statsReq: 0,               // last-write-wins guard for the Stats section
            lastRefresh: 0,            // the last board fetch that came back (or failed, 0.47.2)
            inFlight: 0,               // board fetches on their way (0.47.2)
            stopped: false             // the gate said no: no more refreshes (0.47.2)
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
                return r.json().then(function (json) {
                    // A request that worked: any earlier token reload did its
                    // job, so the next expiry (a day later) may reload again.
                    if (json && json.success) clearReloadGuard();
                    return json;
                });
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

        function forgetOldPeriod() {
            try { window.localStorage.removeItem(OLD_PREF_KEY); } catch (e) { /* storage blocked: nothing to forget */ }
        }

        function setPeriod(period) {
            if (PERIODS.indexOf(period) < 0) return;
            state.period = period;
            if (periodSel && periodSel.value !== period) periodSel.value = period;
            var isDay = period === 'day';
            agendaEl.hidden = !isDay;
            gridEl.hidden = isDay;
            if (legendEl) legendEl.hidden = isDay;
            // Last year's ghosts ride on the chart's bars; Daily has none.
            // The choice is kept, and comes back on leaving Daily.
            lySegs.forEach(function (b) { b.disabled = isDay; });
            if (lyGroup) {
                if (isDay) lyGroup.setAttribute('aria-disabled', 'true');
                else lyGroup.removeAttribute('aria-disabled');
            }
            var cap = period.charAt(0).toUpperCase() + period.slice(1);
            prevBtn.setAttribute('aria-label', S['prev' + cap] || 'Previous');
            nextBtn.setAttribute('aria-label', S['next' + cap] || 'Next');
            render();
        }

        if (periodSel) {
            periodSel.addEventListener('change', function () { setPeriod(periodSel.value); });
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

        function render(opts) {
            opts = opts || {};
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
                if (state.period === 'day') {
                    renderAgenda(data);
                    applyHighlight();
                    if (state.restoreScroll) { window.scrollTo(0, state.restoreScroll.y); state.restoreScroll = null; }
                } else {
                    renderChart(data, w, opts);
                    applyHighlight();
                }
                // Judged against what is ON SCREEN, not the payload's own flag:
                // a week served from a cached, clamped year may itself be
                // entirely inside the cap.
                if ((data.from && w.from < data.from) || (data.to && w.to > data.to)) {
                    say(S.partial || '');
                }
            }, opts);
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

        function ensureRange(from, to, cb, opts) {
            opts = opts || {};
            var seq = ++state.req;
            var hit = cachedCovering(from, to);
            if (hit) { say(''); cb(hit); return; }
            // An auto-refresh is silent: no "Loading…" flash every 3 minutes.
            if (!opts.quiet) say(S.loading || 'Loading…');
            gridEl.setAttribute('aria-busy', 'true');
            agendaEl.setAttribute('aria-busy', 'true');
            state.inFlight++;
            post('mphbac_staff_month', { from: from, to: to }).then(function (json) {
                if (seq !== state.req) return;              // superseded
                // A refusal for a passing reason (success: false): say so,
                // and try again on the 3-minute rhythm (0.47.2, Rob).
                if (!json || !json.success || !json.data) { say(S.error, true); markFetched(); return; }
                state.cache[from + '|' + to] = json.data;
                say('');                                    // a success clears the error line
                markFetched();
                cb(json.data);
            }).catch(function (err) {
                if (seq !== state.req) return;
                if (tokenReload(err)) return;
                say(failureText(err), true);
                // KEEP TRYING (0.47.2, Rob) — after a network error, a server
                // error or an answer that is not JSON, exactly as after a
                // success. NOT after the gate's own refusal (an empty 403 with
                // no "nonce" header: the staff password is no longer valid,
                // the fail-closed path): that stops every retry, as Staff::
                // is_authorized() means it to. A stale token (403 + "nonce")
                // keeps its one reload above, and otherwise its message.
                if (err && err.forbidden) { if (!err.nonce) stopRefresh(); return; }
                markFetched();
            }).then(function () {
                state.inFlight--;
                if (seq === state.req) {
                    gridEl.removeAttribute('aria-busy');
                    agendaEl.removeAttribute('aria-busy');
                }
            });
        }

        // ---- sources, turnovers, measuring ---------------------------------------

        // The source as the board shows it (0.44.1): Direct, Airbnb,
        // Booking.com or Vrbo. A channel nobody recognises shows in the Direct
        // colour (Rob); the sheet still names where it came from.
        function sourceOf(b) {
            var k = b.sourceKey || (b.imported ? 'other' : 'direct');
            return (k === 'airbnb' || k === 'booking' || k === 'vrbo') ? k : 'direct';
        }

        // TURNOVERS (0.44.0): a day on which one booking checks out of a
        // cottage and another checks in. Returns roomTypeId -> date -> {out, in}.
        function turnovers(bookings) {
            var outs = {}, ins = {}, out = {};
            bookings.forEach(function (b) {
                (b.cottages || []).forEach(function (c) {
                    ((outs[c.roomTypeId] = outs[c.roomTypeId] || {})[b.checkout] = outs[c.roomTypeId][b.checkout] || []).push(b);
                    ((ins[c.roomTypeId] = ins[c.roomTypeId] || {})[b.checkin] = ins[c.roomTypeId][b.checkin] || []).push(b);
                });
            });
            Object.keys(outs).forEach(function (t) {
                Object.keys(outs[t]).forEach(function (d) {
                    var o = outs[t][d], i = (ins[t] || {})[d];
                    if (!i) return;
                    var a = o.filter(function (x) { return i.some(function (y) { return y.id !== x.id; }); });
                    if (!a.length) return;
                    (out[t] = out[t] || {})[d] = { out: a[0], 'in': i.filter(function (y) { return y.id !== a[0].id; })[0] };
                });
            });
            return out;
        }

        // Text widths for the short-bar rule, measured in the board's own face.
        var measureCtx = null;
        function textW(str, font) {
            if (!measureCtx) {
                var c = document.createElement('canvas');
                measureCtx = c.getContext && c.getContext('2d');
                if (!measureCtx) return str.length * 8;
            }
            measureCtx.font = font;
            return measureCtx.measureText(str).width;
        }

        // THE DATE LINE SHOWS THE DAYS ON SCREEN (0.46.0, Rob), in every
        // period: "Oct 12 – Nov 8, 2026", "Dec 20, 2026 – Jan 16, 2027", or one
        // day, "Oct 12, 2026". Daily shows its day; a chart shows its window
        // until it is drawn, then followScroll() keeps it to the days in view.
        function renderTitle(w) {
            if (state.period === 'day') setRange(state.anchor, state.anchor, false);
            else setRange(w.from, w.to, false);
        }

        // Writes only on a change, and fitted to its space (fitTitle). The
        // title is aria-live for a period change (an arrow, Today, Show); a
        // SCROLL changes it a day at a time, so those writes are not announced.
        function setRange(from, to, quiet) {
            var t = rangeLabel(from, to);
            if (titleEl.textContent === t) return;
            titleEl.setAttribute('aria-live', quiet ? 'off' : 'polite');
            titleEl.textContent = t;
            fitTitle();
        }

        // ONE LINE, NEVER CUT (Rob's condition). Its full CSS size, stepped
        // down only as far as the space between ‹ and Today needs — the stats
        // line's rule (fitRange). Measured at 375px (0.46.0): the longest,
        // "Dec 28, 2026 – Jan 24, 2027", fits at 12.5px; 13.5px at 390px.
        function fitTitle() {
            titleEl.style.fontSize = '';
            var size = parseFloat(getComputedStyle(titleEl).fontSize) || 15;
            while (size > 9 && titleEl.scrollWidth > titleEl.clientWidth + 0.5) {
                size -= 0.5;
                titleEl.style.fontSize = size + 'px';
            }
        }
        window.addEventListener('resize', function () { if (titleEl.textContent) fitTitle(); });

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
            // The days ON SCREEN: more than half of a day's column in view.
            var first = null, last = null;
            for (var i = 0; i < heads.length; i++) {
                var h = heads[i], a = h.offsetLeft, b = a + h.offsetWidth;
                var seen = Math.min(b, hi) - Math.max(a, lo);
                if (seen * 2 <= (b - a)) continue;
                var d = h.getAttribute('data-day');
                if (first === null) first = d;
                last = d;
            }
            if (first) setRange(first, last, true);
            stickLabels();
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

        function renderChart(data, w, opts) {
            opts = opts || {};
            // A refresh keeps the reader exactly where they were (0.44.0).
            var keepX = gridEl.scrollLeft, keepY = gridEl.scrollTop;
            // THE NEW CHART IS BUILT OFF THE PAGE AND SWAPPED IN ONE STEP
            // (0.45.3, Rob: "the page jumps to the footer, then comes back"):
            // nothing may lay the page out while the grid is empty.
            var shown = (data.bookings || []).slice();
            var turns = turnovers(shown);

            var period = state.period;
            var days = daysBetween(w.from, w.to);
            var N = days.length;
            if (!N) { gridEl.textContent = ''; return; }
            var idx = {};
            days.forEach(function (d, i) { idx[d] = i; });
            var first = days[0], last = days[N - 1];

            // bars per cottage (room type id -> [bar])
            var barsByType = {};
            shown.forEach(function (b) {
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
            var rowOf = {};                  // room type id -> its first grid row (the ghosts')
            var barFont = getComputedStyle(gridEl).fontFamily || 'sans-serif';
            (data.cottages || []).forEach(function (c, ci) {
                var bars = barsByType[c.id] || [];
                var lanes = assignLanes(bars);
                rowOf[c.id] = row;

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
                    var el = barEl(bar, c, dayW, barFont);
                    el.style.gridColumn = (2 + bar.start) + ' / ' + (2 + bar.end);
                    el.style.gridRow = String(row + bar.lane);
                    chart.appendChild(el);
                });

                // The turnover mark (0.44.0): on the day one guest leaves this
                // cottage and the next arrives — where, with whole-bar source
                // colours, nothing else marks the hand-over any more.
                var t = turns[c.id] || {};
                Object.keys(t).forEach(function (d) {
                    if (idx[d] === undefined) return;
                    var m = document.createElement('div');
                    m.className = 'mphbac-staff-turn';
                    m.setAttribute('data-day', d);
                    var tip = (S.turnoverTip || 'Turnover') + ' — ' + (t[d].out.guestName || ('#' + t[d].out.id))
                        + ' → ' + ((t[d]['in'] || {}).guestName || '');
                    m.title = tip;
                    m.setAttribute('aria-label', tip);
                    m.setAttribute('role', 'img');
                    m.style.gridColumn = (2 + 2 * idx[d]) + ' / span 2';
                    m.style.gridRow = row + ' / span ' + lanes;
                    chart.appendChild(m);
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

            // Last year's mode is the chart's from the start (0.47.0): set
            // before the swap, so an In Front chart never shows a frame of
            // this year's bars at full strength.
            chart._rows = rowOf;
            chart._days = days;
            chart._dayW = dayW;
            chart._font = barFont;
            applyLy(chart);
            gridEl.textContent = '';
            gridEl.appendChild(chart);
            measureBars(chart);
            if (lyMode !== 'off') drawGhosts(chart);

            if (state.restoreScroll) {
                // Back from the one token reload: exactly where the reader was.
                gridEl.scrollLeft = state.restoreScroll.x;
                window.scrollTo(0, state.restoreScroll.y);
                state.restoreScroll = null;
                followScroll();
            } else if (opts.keepScroll) {
                gridEl.scrollLeft = keepX;
                gridEl.scrollTop = keepY;
                followScroll();
            } else {
                // Open on the anchor: today when the period holds it, else the
                // date the board was sent to (Go to date) or the period's start.
                scrollToDay(state.anchor);
            }

            if (!shown.length) say(S.empty || '');
        }

        // WEEKLY FILLS THE SCREEN (Rob's choice, 2026-10-08). Seven days share
        // whatever width the board has after the cottage column, so on a
        // desktop they grow wide enough for full names; never wider than the
        // screen, so a week never scrolls sideways.
        // THE SAME COTTAGE COLUMN AS EVERY OTHER PERIOD (Rob, 0.43.3): number
        // and name, same width. The phone-only 48px column of 0.43.0 wrapped
        // "#22" to "#2 / 2" and "Cottages" to "Cott / ages" on his iPhone;
        // the DAYS narrow instead (~32px at a 320px chart).
        function sizeWeek(chart) {
            var avail = gridEl.clientWidth || 0;
            var dayW = avail ? Math.floor((avail - label_w() - 1) / 7) : 44;
            chart.style.setProperty('--staff-day-w', Math.max(24, dayW) + 'px');
        }

        function label_w() {
            var v = parseFloat(getComputedStyle(root).getPropertyValue('--staff-label-w'));
            return isNaN(v) ? 96 : v;
        }
        // The cottage column as drawn on a chart.
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

        // THE BAR (0.44.0 option C, reworked in 0.44.1 by Rob). The WHOLE bar is
        // the source's colour; its own start and end show arrival and
        // departure (no IN / OUT tags, no letter badge any more); pending keeps
        // its stripes. Three facts ride on it as thin white outline icons
        // (Tabler, MIT): Pets, Couch, Boat.
        //
        // WHAT FITS IS MEASURED (canvas, the board's own face), never an
        // ellipsis. The name rule — 1 night initials, 2–3 "First L.", 4+ the
        // full name — beside the icons; else the nights count; else the icons
        // alone. Then, if even the icons do not fit, they drop one at a time:
        // Boat first, then Couch, Pets last. Pets goes last because it is the
        // one with a fee and a cleaning consequence on every arrival; Boat is
        // a planning fact for busy check-in days, and Stats and the Daily list
        // carry it too. The preview, the sheet and the bar's description
        // always list all three.
        var ICON_ORDER = ['pets', 'couch', 'boat'];
        var ICON_W = 18, ICON_GAP = 4, LABEL_PAD = 6;
        function barEl(bar, cottage, dayW, family) {
            var b = bar.b;
            var btn = document.createElement('button');
            btn.type = 'button';
            var nights = nightsBetween(b.checkin, b.checkout);
            var cls = 'mphbac-staff-bar is-src-' + sourceOf(b);
            if (b.status && b.status !== 'confirmed') cls += ' is-pending';
            if (b.imported) cls += ' is-imported';
            if (bar.contLeft) cls += ' is-cont-left';
            if (bar.contRight) cls += ' is-cont-right';
            btn.className = cls;
            btn.setAttribute('data-booking-id', String(b.id));

            var label = document.createElement('span');
            label.className = 'mphbac-staff-bar-label';
            btn.appendChild(label);
            var who = b.guestName || ('#' + b.id);
            btn._fit = {
                b: b,
                label: label,
                icons: ICON_ORDER.filter(function (k) { return !!b[k]; }),
                name: barName(b),
                // NAME, THEN INITIALS, then nights (0.46.0, Rob): a 2–3-night
                // stay used to jump from "Dock B." straight to "2n". Only a
                // named guest has initials; "#19674" goes on to nights as before.
                initials: b.guestName ? initials(who) : '',
                count: (S.nightsShort || '{n}n').replace('{n}', String(nights)),
                textFont: '600 13px ' + family,
                key: ''
            };
            fitLabel(btn, (bar.end - bar.start) * (dayW || 44) / 2 - 2);   // the bar's margins

            // The preview carries the detail on hover, so the native title
            // tooltip would only repeat it (the WD); the accessible name stays.
            btn.setAttribute('aria-label', describe(b, cottage));
            btn.addEventListener('click', function (e) {
                // A long-press opened the preview; that tap must not ALSO open
                // the sheet (the brief: "a long-press must not also open it").
                if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
                openDetail(b.id, btn);
            });
            bindPreview(btn, b, cottage);
            return btn;
        }

        // THE NAME A BAR LEADS WITH: 1 night initials, 2–3 "First L.", 4+
        // the full name. Last year's In Front tags (0.47.0) use it too, so a
        // stay is named the same way in both years.
        function barName(b) {
            var who = b.guestName || ('#' + b.id);
            var nights = nightsBetween(b.checkin, b.checkout);
            return nights >= 4 ? who : (nights <= 1 ? initials(who) : shortName(who));
        }

        // What a bar's label shows in `px` of width — the fit rule above —
        // rebuilt only when the outcome changes. Called at render with the
        // bar's whole width, and on scroll with its VISIBLE width (0.45.0).
        function fitLabel(btn, px) {
            var f = btn._fit;
            if (!f) return;
            var room = px - 2 * LABEL_PAD;
            var icons = f.icons.slice();
            var iconsW = function (list) { return list.length * (ICON_W + ICON_GAP); };
            var fits = function (t) { return textW(t, f.textFont) <= room - iconsW(icons); };
            var text = fits(f.name) ? f.name
                : (f.initials && f.initials !== f.name && fits(f.initials)) ? f.initials
                : (fits(f.count) ? f.count : '');
            if (!text) {
                // Icons alone; drop from the end of the order until they fit.
                while (icons.length && iconsW(icons) - ICON_GAP > room) icons.pop();
            }
            var key = icons.join(',') + '|' + text;
            if (key === f.key) return;
            f.key = key;
            f.label.textContent = '';
            icons.forEach(function (k) { f.label.appendChild(icon(k)); });
            var tx = document.createElement('span');
            tx.className = 'mphbac-staff-bar-text';
            tx.textContent = text;
            f.label.appendChild(tx);
        }

        // THE LABEL FOLLOWS THE VISIBLE LEFT EDGE (0.45.0, the Website
        // Director's spec). Monthly and Yearly open scrolled to today, so a
        // long stay that began before the visible days drew a BLANK bar: its
        // name and icons sat at its start, off-screen to the left (#28 in the
        // fixture, a 30-night Vrbo stay). Now, for as long as any part of a
        // bar is on screen, its label starts just right of the pinned cottage
        // column, stays inside the bar, and is fitted to the bar's VISIBLE
        // width. Driven from followScroll()'s rAF; the bars' geometry is read
        // ONCE per render (barGeo), so a scroll frame only does arithmetic and
        // rebuilds a label only when what it shows changes.
        // Sticky labels (0.45.2): where the browser can, staff.css holds
        // the label at the column's edge itself and this only refits it.
        var STICKY = !!(window.CSS && CSS.supports && CSS.supports('overflow', 'clip'));
        var barGeo = [];
        function measureBars(chart) {
            barGeo = [].map.call(chart.querySelectorAll('.mphbac-staff-bar'), function (el) {
                return { el: el, left: el.offsetLeft, width: el.offsetWidth, shift: 0 };
            });
        }
        function stickLabels() {
            if (!barGeo.length) return;
            var chart = gridEl.firstChild;
            var visL = gridEl.scrollLeft + (chart ? chartLabelW(chart) : 0);
            var visR = gridEl.scrollLeft + gridEl.clientWidth;
            barGeo.forEach(function (g) {
                var start = Math.max(g.left, visL), end = Math.min(g.left + g.width, visR);
                if (end <= start) return;                       // not on screen: leave it
                var shift = STICKY ? 0 : Math.round(start - g.left);
                if (shift !== g.shift) {
                    g.shift = shift;
                    g.el._fit.label.style.left = shift ? shift + 'px' : '';
                }
                fitLabel(g.el, end - start);
            });
        }

        // THE ICONS: Tabler's outline paw, sofa and speedboat (MIT, Paweł
        // Kuna), path for path; drawn with DOM APIs, never markup in a string.
        // staff.css draws the legend's from the SAME paths as masks, and
        // staff-board-test.js asserts the two copies agree.
        var ICONS = {
            pets: ['M14.7 13.5c-1.1 -2 -1.441 -2.5 -2.7 -2.5c-1.259 0 -1.736 .755 -2.836 2.747c-.942 1.703 -2.846 1.845 -3.321 3.291c-.097 .265 -.145 .677 -.143 .962c0 1.176 .787 2 1.8 2c1.259 0 3 -1 4.5 -1s3.241 1 4.5 1c1.013 0 1.8 -.823 1.8 -2c0 -.285 -.049 -.697 -.146 -.962c-.475 -1.451 -2.512 -1.835 -3.454 -3.538',
                   'M20.188 8.082a1.039 1.039 0 0 0 -.406 -.082h-.015c-.735 .012 -1.56 .75 -1.993 1.866c-.519 1.335 -.28 2.7 .538 3.052c.129 .055 .267 .082 .406 .082c.739 0 1.575 -.742 2.011 -1.866c.516 -1.335 .273 -2.7 -.54 -3.052l-.001 0',
                   'M9.474 9c.055 0 .109 0 .163 -.011c.944 -.128 1.533 -1.346 1.32 -2.722c-.203 -1.297 -1.047 -2.267 -1.932 -2.267c-.055 0 -.109 0 -.163 .011c-.944 .128 -1.533 1.346 -1.32 2.722c.204 1.293 1.048 2.267 1.933 2.267',
                   'M16.456 6.733c.214 -1.376 -.375 -2.594 -1.32 -2.722a1.164 1.164 0 0 0 -.162 -.011c-.885 0 -1.728 .97 -1.93 2.267c-.214 1.376 .375 2.594 1.32 2.722c.054 .007 .108 .011 .162 .011c.885 0 1.73 -.974 1.93 -2.267',
                   'M5.69 12.918c.816 -.352 1.054 -1.719 .536 -3.052c-.436 -1.124 -1.271 -1.866 -2.009 -1.866c-.14 0 -.277 .027 -.407 .082c-.816 .352 -1.054 1.719 -.536 3.052c.436 1.124 1.271 1.866 2.009 1.866c.14 0 .277 -.027 .407 -.082'],
            couch: ['M4 11a2 2 0 0 1 2 2v1h12v-1a2 2 0 1 1 4 0v5a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-5a2 2 0 0 1 2 -2',
                    'M4 11v-3a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v3',
                    'M12 5v9'],
            boat: ['M2 17h14.4a3 3 0 0 0 2.5 -1.34l3.1 -4.66h-6.23a4 4 0 0 0 -1.49 .29l-3.56 1.42a4 4 0 0 1 -1.49 .29h-5.73l-1.5 4',
                   'M6 13l1.5 -5',
                   'M6 8h8l2 3']
        };
        function icon(kind) {
            var NS = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('class', 'mphbac-staff-ico is-' + kind);
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            (ICONS[kind] || []).forEach(function (d) {
                var p = document.createElementNS(NS, 'path');
                p.setAttribute('d', d);
                svg.appendChild(p);
            });
            return svg;
        }

        // Pets / Couch / Boat as words, for the description, preview and list.
        function facts(b) {
            var out = [];
            if (b.pets) out.push(S.pets || 'Pets');
            if (b.couch) out.push(S.couch || 'Couch');
            if (b.boat) out.push(S.boat || 'Boat');
            return out;
        }

        // The source by name, from the stable key — never colour alone.
        function sourceName(b) {
            var k = sourceOf(b);
            return S['src' + k.charAt(0).toUpperCase() + k.slice(1)] || k;
        }


        // Full sentence for title/aria: name — cottage — dates (n nights) — status — via OTA
        function describe(b, cottage) {
            var parts = [b.guestName || ('#' + b.id)];
            if (cottage && cottage.title) parts.push(cottage.title);
            var n = nightsBetween(b.checkin, b.checkout);
            parts.push(shortDate(b.checkin) + ' → ' + shortDate(b.checkout) + ' (' + n + ' ' + (n === 1 ? (S.night || 'night') : (S.nights || 'nights')) + ')');
            if (b.statusLabel && b.status !== 'confirmed') parts.push(b.statusLabel);
            parts.push(sourceName(b));
            facts(b).forEach(function (f) { parts.push(f); });
            return parts.join(' — ');
        }

        // ---- AGENDA -----------------------------------------------------------

        // The day's lists — shared with Stats' "Day", so the section and the
        // list can never disagree.
        function dayGroups(bookings, day) {
            var groups = { 'in': [], 'out': [], 'stay': [] };
            bookings.forEach(function (b) {
                if (!b.checkin || !b.checkout) return;
                if (b.checkin === day) groups['in'].push(b);
                else if (b.checkout === day) groups['out'].push(b);
                else if (b.checkin < day && b.checkout > day) groups['stay'].push(b);
            });
            Object.keys(groups).forEach(function (k) { groups[k].sort(byCottage); });
            groups.turn = dayTurnovers(groups, day);
            return groups;
        }

        // Turnovers on one day, one entry per cottage. Its guests stay listed
        // under Arriving and Departing too, so the counts match the lists.
        function dayTurnovers(groups, day) {
            var t = turnovers(groups['in'].concat(groups['out'])), out = [];
            Object.keys(t).forEach(function (typeId) {
                if (t[typeId][day]) out.push({ typeId: typeId, out: t[typeId][day].out, 'in': t[typeId][day]['in'] });
            });
            return out.sort(function (a, b) { return byCottage(a.out, b.out); });
        }

        function renderAgenda(data) {
            var day = state.anchor;
            var groups = dayGroups(data.bookings || [], day);
            // Built off the page, swapped in one step (0.45.3), as the chart.
            var frag = document.createDocumentFragment();
            frag.appendChild(turnGroup(groups.turn));
            frag.appendChild(group('in', S.arrivals || 'Arriving', groups['in'], S.noArrivals || ''));
            frag.appendChild(group('out', S.departures || 'Departing', groups['out'], S.noDepartures || ''));
            frag.appendChild(group('stay', S.inHouse || 'In House', groups['stay'], S.noInHouse || ''));
            agendaEl.textContent = '';
            agendaEl.appendChild(frag);
        }

        // "Cottage 22: Smith out → Jones in" — plain text, built from the
        // payload with textContent.
        function turnGroup(turns) {
            var sec = document.createElement('section');
            sec.className = 'mphbac-staff-group is-turn';
            var head = document.createElement('div');
            head.className = 'mphbac-staff-group-head';
            head.appendChild(document.createTextNode(S.turnovers || 'Turnovers'));
            var count = document.createElement('span');
            count.className = 'mphbac-staff-group-count';
            count.textContent = String(turns.length);
            head.appendChild(count);
            sec.appendChild(head);
            if (!turns.length) {
                var p = document.createElement('p');
                p.className = 'mphbac-staff-group-empty';
                p.textContent = S.noTurnovers || '';
                sec.appendChild(p);
                return sec;
            }
            turns.forEach(function (t) {
                var c = (t.out.cottages || []).filter(function (x) { return String(x.roomTypeId) === String(t.typeId); })[0] || {};
                var line = document.createElement('p');
                line.className = 'mphbac-staff-turnline';
                line.textContent = (S.turnoverLine || '{cottage}: {out} out → {in} in')
                    .replace('{cottage}', c.number ? (S.cottageWord || 'Cottage') + ' ' + c.number : (c.title || ''))
                    .replace('{out}', lastName(t.out.guestName || ('#' + t.out.id)))
                    .replace('{in}', lastName((t['in'] || {}).guestName || ('#' + (t['in'] || {}).id)));
                sec.appendChild(line);
            });
            return sec;
        }

        // "Ann Smith" -> "Smith"; a single word or a booking number passes through.
        function lastName(full) {
            var w = String(full || '').trim().split(/\s+/);
            return w.length > 1 && w[0].charAt(0) !== '#' ? w[w.length - 1] : w[0];
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
            btn.className = 'mphbac-staff-item is-src-' + sourceOf(b);
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
            // 0.44.1: a small dot in the source colour (no letter — the WD's
            // suggestion, as the bars dropped theirs), then the name, then the
            // same three icons as the bars (Rob).
            var dot = document.createElement('span');
            dot.className = 'mphbac-staff-dot';
            dot.setAttribute('aria-hidden', 'true');
            name.appendChild(dot);
            name.appendChild(document.createTextNode(b.guestName || ('#' + b.id)));
            ICON_ORDER.forEach(function (k) { if (b[k]) name.appendChild(icon(k)); });
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

        // LAST YEAR'S SHEET (0.47.0, Rob): a last-year box opens the SAME
        // sheet, through the same gated endpoint, with full details — under
        // a grey "Last Year · 2025" heading, first in the body and part of
        // the dialog's name, so it can never be taken for a current booking.
        var sheetLabel = sheet.getAttribute('aria-labelledby') || '';
        var sheetLy = '';
        function sheetText(text) {
            sheetBody.textContent = '';
            if (sheetLy) {
                var k = document.createElement('p');
                k.className = 'mphbac-staff-sheet-ly';
                k.id = sheet.id ? sheet.id + '-ly' : 'mphbac-staff-sheet-ly';
                k.textContent = (S.lyHead || 'Last Year · {year}').replace('{year}', sheetLy);
                sheetBody.appendChild(k);
            }
            if (text) sheetBody.appendChild(document.createTextNode(text));
        }

        function openDetail(bookingId, trigger, lyYear) {
            lastTrigger = trigger || null;
            sheetLy = lyYear || '';
            if (!sheet.id) sheet.id = 'mphbac-staff-sheet-' + Math.random().toString(36).slice(2, 9);
            sheet.setAttribute('aria-labelledby', sheetLy ? (sheet.id + '-ly ' + sheetLabel).trim() : sheetLabel);
            var seq = ++detailSeq;
            sheetTitle.textContent = (S.detailTitle || 'Booking') + ' #' + bookingId;
            sheetText(S.loading || 'Loading…');
            showSheet();
            post('mphbac_staff_booking', { booking_id: bookingId }).then(function (json) {
                if (seq !== detailSeq) return;
                if (!json || !json.success || !json.data) {
                    sheetText(S.error || 'Could not load.');
                    return;
                }
                renderDetail(json.data);
            }).catch(function (err) {
                if (seq !== detailSeq) return;
                if (tokenReload(err)) return;
                sheetText(failureText(err));
            });
        }

        function renderDetail(d) {
            sheetText('');
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
            // OPEN IN WP-ADMIN (0.44.0): the server sends the link ONLY to a
            // logged-in visitor with the staff capability who may edit this
            // booking; its absence is the decision. Same-origin http(s) only.
            var admin = safeUrl(d.adminUrl);
            if (admin) {
                var p = document.createElement('p');
                p.className = 'mphbac-staff-admin';
                var a = document.createElement('a');
                a.className = 'mphbac-staff-adminlink';
                a.href = admin;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = S.openAdmin || 'Open in WP-Admin';
                p.appendChild(a);
                sheetBody.appendChild(p);
            }
        }

        function safeUrl(u) {
            if (typeof u !== 'string' || !u) return '';
            try {
                var x = new URL(u, window.location.href);
                return (x.origin === window.location.origin && /^https?:$/.test(x.protocol)) ? x.href : '';
            } catch (e) { return ''; }
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
            a.textContent = S.viewPhoto || 'View Photo ID';
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
            var dd = document.createElement('dd');
            // TAP TO CALL / TEXT / EMAIL (0.44.0). The server sends a cleaned
            // target beside the text as entered; it is checked again here and
            // the links are built with DOM APIs. Anything else stays text.
            var tel = flags && typeof flags.tel === 'string' && /^\+?\d{7,15}$/.test(flags.tel) ? flags.tel : '';
            var mail = flags && typeof flags.email === 'string' && /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/.test(flags.email) ? flags.email : '';
            if (tel) {
                var call = document.createElement('a');
                call.className = 'mphbac-staff-tel';
                call.href = 'tel:' + tel;
                call.textContent = String(value);
                dd.appendChild(call);
                var sms = document.createElement('a');
                sms.className = 'mphbac-staff-sms';
                sms.href = 'sms:' + tel;
                sms.textContent = S.text || 'Text';
                dd.appendChild(sms);
            } else if (mail) {
                var m = document.createElement('a');
                m.className = 'mphbac-staff-mail';
                m.href = 'mailto:' + mail;
                m.textContent = String(value);
                dd.appendChild(m);
            } else {
                dd.textContent = String(value);
            }
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
                // Focus the TITLE, not the ✕ (0.45.2). The theme's
                // `button:focus` turns a focused button coral, and the ✕ now
                // takes it like the public X does — so focusing it here made
                // every sheet OPEN with a coral ✕, a state that reads as its
                // resting colour (what 0.24.0 removed from the public popup).
                // The public booking popup focuses its first field, not its X;
                // this sheet has no field, so its title. Tab goes on to the ✕.
                try { sheetTitle.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
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
            if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetTitle)) { e.preventDefault(); last.focus(); }
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

        // ---- STATS (0.44.1, Rob) ------------------------------------------------
        // One section BELOW the calendar, closed on every load, with its own
        // timeframe — Day / Week / Month / Year around a date, or Custom
        // from–to — independent of the calendar. Fetched only when opened,
        // through the same gated range endpoint (same gate, ±3-year cap); a
        // Custom range past the endpoint's 400 days is cut to 400 and says so.
        //
        // Every cottage-night counts ONCE, and belongs to the booking that
        // reaches it first (earliest check-in, then lowest id) — so a channel
        // block echoing a booking neither inflates "% booked" nor takes a
        // slice of the pie.
        //
        // 0.46.0 (Rob, from a list; the WD's spec): a ⓘ on every tile and
        // block; the cottages ranked by % booked with ▲ ▼ against the previous
        // timeframe; ‹ › arrows round the date line; the tiles against the
        // same dates a year earlier; and five new blocks — length of stay,
        // arrivals by weekday, how far ahead they book, pace, and the year
        // as a heat map. Every figure is an AGGREGATE: no element here
        // carries a guest's name.
        var statsSpan = statsEl && statsEl.querySelector('.mphbac-staff-stats-span');
        var statsDate = statsEl && statsEl.querySelector('.mphbac-staff-stats-date');
        var statsFrom = statsEl && statsEl.querySelector('.mphbac-staff-stats-from');
        var statsTo   = statsEl && statsEl.querySelector('.mphbac-staff-stats-to');
        var statsNote = statsEl && statsEl.querySelector('.mphbac-staff-stats-note');
        var statsOut  = statsEl && statsEl.querySelector('.mphbac-staff-stats-out');
        var statsMonth = statsEl && statsEl.querySelector('.mphbac-staff-stats-month');
        var statsYear  = statsEl && statsEl.querySelector('.mphbac-staff-stats-year');
        var statsOnLabel = statsEl && statsEl.querySelector('.mphbac-staff-stats-on-label');
        var statsRange = statsEl && statsEl.querySelector('.mphbac-staff-stats-range');
        var statsPrev  = statsEl && statsEl.querySelector('.mphbac-staff-stats-prev');
        var statsNext  = statsEl && statsEl.querySelector('.mphbac-staff-stats-next');
        var STATS_MAX_DAYS = 400;
        // RECORDS COMPLETE FROM (0.46.0, Rob: a missing figure beats a false
        // one). A plugin setting, default 2025-10-01: no comparison — vs last
        // year, vs the previous timeframe, pace — reaches before it. The heat
        // map, the weekday chart and every other figure show what the site
        // holds for any period.
        var RECORDS_FROM = /^\d{4}-\d{2}-\d{2}$/.test(String(config.recordsFrom || '')) ? config.recordsFrom : '';
        // THE PERIOD THE STATS ARE IN (0.45.3): one day, carried across a
        // Timeframe switch — Month "Mar 2025" → Year 2025 → back to Month is
        // still March; Day → Week is that day's week. Each second box reads
        // and writes this, never a value of its own.
        var statsAnchor = config.today;
        var statsLastSpan = 'month';

        function statsWindow() {
            var span = statsSpan ? statsSpan.value : 'month';
            var notes = [];
            var w;
            if (span === 'custom') {
                var f = statsFrom.value, t = statsTo.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t) || t < f) return { bad: true };
                if (daysBetween(f, t).length > STATS_MAX_DAYS) {
                    t = shiftDay(f, STATS_MAX_DAYS - 1);
                    notes.push('capped');
                }
                w = { from: f, to: t };
            } else {
                w = windowOf(statsAnchor, span);
            }
            if (w.to < CAP_LO || w.from > CAP_HI) return { bad: true };
            if (w.from < CAP_LO || w.to > CAP_HI) {
                w = clampCap(w);
                notes.push('clamped');
            }
            w.span = span;
            w.notes = notes;
            w.clamped = notes.indexOf('clamped') >= 0;
            return w;
        }
        function clampCap(r) {
            return { from: r.from < CAP_LO ? CAP_LO : r.from, to: r.to > CAP_HI ? CAP_HI : r.to };
        }

        // ‹ › (0.46.0, Rob): one whole timeframe on — the period's own step,
        // and a Custom range by its own length.
        function statsStepAnchor(span, delta) {
            var a = statsAnchor;
            if (span === 'day') return shiftDay(a, delta);
            if (span === 'week') return shiftDay(windowOf(a, 'week').from, 7 * delta);
            if (span === 'month') return shiftMonth(a.slice(0, 7), delta) + '-01';
            return (parseInt(a.slice(0, 4), 10) + delta) + '-01-01';
        }
        function statsStepWindow(w, delta) {
            if (w.span === 'custom') {
                var n = daysBetween(w.from, w.to).length * delta;
                return { from: shiftDay(w.from, n), to: shiftDay(w.to, n) };
            }
            return windowOf(statsStepAnchor(w.span, delta), w.span);
        }
        // Disabled where the next timeframe lies wholly outside the ±3-year
        // window — the board's own arrows' rule.
        function statsArrows(w) {
            if (!statsPrev || !statsNext) return;
            var bad = !w || w.bad;
            statsPrev.disabled = bad || statsStepWindow(w, -1).to < CAP_LO;
            statsNext.disabled = bad || statsStepWindow(w, 1).from > CAP_HI;
            var span = bad ? 'custom' : w.span;
            var cap = span === 'custom' ? 'Range' : span.charAt(0).toUpperCase() + span.slice(1);
            statsPrev.setAttribute('aria-label', S['prev' + cap] || 'Previous');
            statsNext.setAttribute('aria-label', S['next' + cap] || 'Next');
        }
        function statsStep(delta) {
            var w = statsWindow();
            if (w.bad) return;
            if (w.span === 'custom') {
                var s = statsStepWindow(w, delta);
                statsFrom.value = s.from;
                statsTo.value = s.to;
            } else {
                statsAnchor = statsClamp(statsStepAnchor(w.span, delta));
            }
            renderStats();
        }

        // The same dates a year earlier; a 29 February is the 28th.
        function yearBack(d) {
            return d.slice(5) === '02-29' ? (parseInt(d.slice(0, 4), 10) - 1) + '-02-28' : shiftYears(d, -1);
        }
        // WHETHER A COMPARISON CAN BE TRUE: never reaching before "Records
        // complete from", never outside the ±3-year window, never against a
        // timeframe that was itself cut short. '' = it can.
        function comparable(w, c) {
            if (w.clamped) return 'range';
            if (c.from < CAP_LO || c.to > CAP_HI) return 'range';
            if (RECORDS_FROM && c.from < RECORDS_FROM) return 'records';
            return '';
        }
        function noCompareText(why) {
            if (why === 'records') {
                var d = RECORDS_FROM.slice(8) === '01' ? shortMonth(RECORDS_FROM) + ' ' + RECORDS_FROM.slice(0, 4) : mediumDay(RECORDS_FROM);
                return (S.stNoRecords || '').replace('{date}', d);
            }
            return S.stNoCompare || '';
        }

        function statsSay(text) {
            statsNote.textContent = text || '';
            statsNote.hidden = !text;
        }

        // ---- fetching -------------------------------------------------------

        function fetchRange(r) {
            var hit = cachedCovering(r.from, r.to);
            if (hit) return Promise.resolve(hit);
            return post('mphbac_staff_month', { from: r.from, to: r.to }).then(function (json) {
                if (!json || !json.success || !json.data) throw new Error('stats');
                state.cache[r.from + '|' + r.to] = json.data;
                return json.data;
            });
        }
        // EVERY RANGE THE STATS NEED, IN AS FEW REQUESTS AS THE ENDPOINT
        // ALLOWS: what the session already holds is not asked for again, and
        // ranges that touch (a month and the month before it) go as one, up
        // to the endpoint's 400 days. Resolves to one payload per range, in
        // order (null for a range not asked for). A refresh may empty the
        // cache mid-flight, so the answers are kept here, not looked up again.
        function fetchAll(ranges) {
            var have = ranges.map(function (r) { return r ? cachedCovering(r.from, r.to) : null; });
            var need = ranges.filter(function (r, i) { return r && !have[i]; })
                .map(function (r) { return { from: r.from, to: r.to }; })
                .sort(function (a, b) { return a.from < b.from ? -1 : (a.from > b.from ? 1 : 0); });
            var merged = [];
            need.forEach(function (r) {
                var m = merged[merged.length - 1];
                if (m && r.from <= shiftDay(m.to, 1)) {
                    var to = r.to > m.to ? r.to : m.to;
                    if (daysBetween(m.from, to).length <= STATS_MAX_DAYS) { m.to = to; return; }
                }
                merged.push(r);
            });
            return Promise.all(merged.map(fetchRange)).then(function (got) {
                return ranges.map(function (r, i) {
                    if (!r) return null;
                    if (have[i]) return have[i];
                    for (var j = 0; j < merged.length; j++) {
                        if (merged[j].from <= r.from && merged[j].to >= r.to) return got[j];
                    }
                    return null;
                });
            });
        }

        // What one timeframe's figures need besides its own data. Since
        // 0.47.0 nothing compares with the previous timeframe (Nights by
        // Cottage's ▲▼ is against the same dates last year, as the tiles'),
        // so its range is never asked for: the slot stays, empty.
        function statsPlan(w) {
            var lyW = { from: yearBack(w.from), to: yearBack(w.to), span: w.span };
            var y = w.from.slice(0, 4);
            var agoDay = yearBack(config.today);
            var plan = {
                ly: { w: lyW, why: comparable(w, lyW) },
                year: { y: y, w: clampCap({ from: y + '-01-01', to: y + '-12-31' }) },
                pace: { now: { from: config.today, to: shiftDay(config.today, 89) },
                        ago: { from: agoDay, to: shiftDay(agoDay, 89) }, asOf: agoDay }
            };
            plan.pace.why = comparable({}, plan.pace.ago);
            plan.ranges = [w, null, plan.ly.why ? null : lyW, plan.year.w,
                plan.pace.now, plan.pace.why ? null : plan.pace.ago];
            return plan;
        }

        function renderStats(opts) {
            if (!statsEl || !statsOut) return;
            // QUIET = the 3-minute refresh (0.45.3). The figures on screen stay
            // until the new ones are ready and then change in one step. Since
            // 0.46.0 that holds for EVERY redraw that has figures to keep — an
            // arrow, a picker — so the section never collapses to "Loading…"
            // and back, which moved the page.
            var quiet = !!(opts && opts.quiet);
            statsSync();
            var w = statsWindow();
            statsArrows(w);
            if (w.bad) {
                ++state.statsReq;
                statsOut.textContent = '';
                if (statsRange) statsRange.textContent = '';
                statsSay(S.stBadRange || '');
                return;
            }
            var notes = [];
            if (w.notes.indexOf('capped') >= 0) notes.push((S.stCapped || '').replace('{from}', mediumDay(w.from)).replace('{to}', mediumDay(w.to)));
            if (w.clamped) notes.push((S.stClamped || '').replace('{from}', mediumDay(w.from)).replace('{to}', mediumDay(w.to)));
            statsSay(notes.join(' '));
            if (statsRange) {
                statsRange.textContent = rangeLabel(w.from, w.to);
                fitRange(statsRange);
            }
            var plan = statsPlan(w);
            var seq = ++state.statsReq;
            if (!quiet && !statsOut.querySelector('.mphbac-staff-stats-kpis')) statsOut.textContent = S.loading || 'Loading…';
            statsOut.setAttribute('aria-busy', 'true');
            fetchAll(plan.ranges).then(function (got) {
                if (seq !== state.statsReq) return;
                statsOut.removeAttribute('aria-busy');
                if (!got[0]) throw new Error('stats');
                drawStats(got, w, plan);
            }).catch(function (err) {
                if (seq !== state.statsReq) return;
                statsOut.removeAttribute('aria-busy');
                if (tokenReload(err)) return;
                if (!quiet) statsOut.textContent = failureText(err);
            });
        }

        // ---- the numbers ------------------------------------------------------

        // WHO OWNS EACH COTTAGE-NIGHT. Every cottage-night counts ONCE, and
        // belongs to the booking that reaches it first (earliest check-in,
        // then lowest id): a channel block echoing a booking is not a second
        // night. Returns the count, per cottage, per source, per night (=
        // cottages booked that night), and the bookings owning ≥1 night.
        function own(list, nights) {
            var bookings = list.filter(function (b) { return b.checkin && b.checkout; })
                .sort(function (a, b) { return a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : a.id - b.id; });
            var owner = {}, perCottage = {}, perNight = {}, counted = {}, booked = 0;
            var bySource = { direct: 0, airbnb: 0, booking: 0, vrbo: 0 };
            bookings.forEach(function (b) {
                (b.cottages || []).forEach(function (c) {
                    nights.forEach(function (d) {
                        var k = c.roomTypeId + '|' + d;
                        if (d >= b.checkin && d < b.checkout && !owner[k]) {
                            owner[k] = b;
                            // A DOCK BLOCK (0.46.1, Rob: "Leave them out")
                            // still owns its nights — so a channel's echo of
                            // it cannot count either — but they are not booked
                            // nights and it is not a booking. The night stays
                            // in the total (the denominator), as Rob asked.
                            if (b.notStay) return;
                            counted[b.id] = b;
                            booked++;
                            perCottage[c.roomTypeId] = (perCottage[c.roomTypeId] || 0) + 1;
                            perNight[d] = (perNight[d] || 0) + 1;
                            bySource[sourceOf(b)]++;
                        }
                    });
                });
            });
            return {
                sorted: bookings, booked: booked, perCottage: perCottage, perNight: perNight, bySource: bySource,
                mine: Object.keys(counted).map(function (k) { return counted[k]; })
            };
        }

        // EACH STAY ONCE (0.46.1, Rob). A stay is a booking that owns at
        // least one night of its OWN stay — the nights' rule above, over the
        // whole stay, not just the timeframe — so a channel block repeating a
        // booking (or a dock block) is not a second arrival, departure or
        // guest in house. Dock blocks are never stays.
        function staysOf(sorted) {
            var owner = {}, keep = {};
            sorted.forEach(function (b) {
                (b.cottages || []).forEach(function (c) {
                    for (var d = b.checkin; d < b.checkout; d = shiftDay(d, 1)) {
                        var k = c.roomTypeId + '|' + d;
                        if (owner[k]) continue;
                        owner[k] = b;
                        if (!b.notStay) keep[b.id] = b;
                    }
                });
            });
            return sorted.filter(function (b) { return keep[b.id] === b; });
        }

        function statsNumbers(data, w) {
            var nights = daysBetween(w.from, w.to);
            var o = own(data.bookings || [], nights);
            var bookings = o.sorted;
            var inRange = function (d) { return d >= w.from && d <= w.to; };
            // BOOKINGS and LENGTH (0.45.3, Rob): the bookings that own at least
            // one cottage-night in the timeframe — the same ownership as the
            // nights, so a channel block echoing a booking is not a second
            // booking — and the average of their WHOLE stays, nights outside
            // the timeframe included.
            var mine = o.mine;
            var stayNights = mine.reduce(function (t, b) { return t + nightsBetween(b.checkin, b.checkout); }, 0);
            var stays = staysOf(bookings);
            var turns = 0, t = turnovers(stays);
            Object.keys(t).forEach(function (typeId) { Object.keys(t[typeId]).forEach(function (d) { if (inRange(d)) turns++; }); });
            // ARRIVALS / DEPARTURES: each stay once (0.46.1, Rob — until then
            // every booking, channel blocks included). The weekday chart uses
            // the same stays, so its bars add up to the tiles.
            var ins = stays.filter(function (b) { return inRange(b.checkin); });
            var outs = stays.filter(function (b) { return inRange(b.checkout); });
            var byDay = function (list, key) {
                var a = [0, 0, 0, 0, 0, 0, 0];
                list.forEach(function (b) { a[new Date(b[key] + 'T00:00:00').getDay()]++; });
                return a;
            };
            var cots = data.cottages || [];
            return {
                nights: nights.length,
                cottages: cots,
                booked: o.booked,
                pct: cots.length && nights.length ? Math.round(100 * o.booked / (cots.length * nights.length)) : null,
                arrivals: ins.length,
                departures: outs.length,
                inByDay: byDay(ins, 'checkin'),
                outByDay: byDay(outs, 'checkout'),
                turnovers: turns,
                inHouse: w.span === 'day' ? dayGroups(stays, w.from).stay.length : null,
                bookings: mine.length,
                mine: mine,
                length: mine.length ? stayNights / mine.length : null,
                perCottage: o.perCottage,
                bySource: o.bySource
            };
        }

        // STAY-LENGTH MIX (0.46.0): the Bookings set by whole-stay length.
        var MIX = [[1, 2], [3, 6], [7, 27], [28, Infinity]];
        function stayMix(mine) {
            var out = MIX.map(function () { return 0; });
            mine.forEach(function (b) {
                var n = nightsBetween(b.checkin, b.checkout);
                for (var i = 0; i < MIX.length; i++) if (n >= MIX[i][0] && n <= MIX[i][1]) { out[i]++; break; }
            });
            return out;
        }

        // HOW FAR AHEAD THEY BOOK (0.46.0): whole days from the day a booking
        // was made (madeOn, its post_date in the site's timezone) to its
        // check-in, averaged by source, for the stays ARRIVING in the
        // timeframe — taken from the Bookings set, so a channel block echoing
        // a booking is not a second stay. Left out: a booking made AFTER its
        // own check-in (13 on live, the WD) and one with no made-on date.
        function leadTimes(mine, w) {
            var by = { all: { n: 0, days: 0 } };
            mine.forEach(function (b) {
                if (b.checkin < w.from || b.checkin > w.to || !b.madeOn || b.madeOn > b.checkin) return;
                var k = sourceOf(b), d = nightsBetween(b.madeOn, b.checkin);
                by[k] = by[k] || { n: 0, days: 0 };
                by[k].n++; by[k].days += d;
                by.all.n++; by.all.days += d;
            });
            return by;
        }

        // PACE (0.46.0, Rob): cottage-nights on the books for the k nights
        // from `start`. With `asOf`, only what was on the books ON THAT DATE —
        // made on or before it — so a booking made after its own check-in
        // counts from the day it was made, and one with no made-on date is
        // not counted. Cancelled bookings are not in the data at all, so a
        // year-ago figure is slightly low (said in the tip).
        function paceNights(data, start, k, asOf) {
            var list = (data.bookings || []).filter(function (b) { return !asOf || (b.madeOn && b.madeOn <= asOf); });
            return own(list, daysBetween(start, shiftDay(start, k - 1))).booked;
        }

        // ---- drawing ----------------------------------------------------------

        function el(tag, cls, text) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            if (text !== undefined) e.textContent = text;
            return e;
        }
        function nightsText(v) { return (v === 1 ? (S.stNight || '{n} night') : (S.stNights || '{n} nights')).replace('{n}', String(v)); }

        // ▲8 / ▼3 / ±0 / —. What is SEEN is the arrow; what is READ is a
        // sentence, "up 8 points on the same dates a year earlier".
        function deltaEl(tag, cls, v, decimals, vs, unit) {
            var e = el(tag, cls);
            var seen = el('span', '');
            seen.setAttribute('aria-hidden', 'true');
            var said = el('span', 'mphbac-sr-only');
            if (v === null || v === undefined || isNaN(v)) {
                e.className += ' is-none';
                seen.textContent = '—';
                said.textContent = S.stSrNone || '';
            } else {
                var f = Math.pow(10, decimals || 0), r = Math.round(v * f) / f;
                var abs = Math.abs(r).toFixed(decimals || 0);
                if (r === 0) {
                    e.className += ' is-same';
                    seen.textContent = '±0';
                    said.textContent = (S.stSrSame || '').replace('{vs}', vs || '');
                } else {
                    e.className += r > 0 ? ' is-up' : ' is-down';
                    seen.textContent = (r > 0 ? '▲' : '▼') + abs;
                    // "up 1 point", "down 3 points", "up 0.4 nights" (0.46.1:
                    // it read "up 1 points").
                    var amount = unit === 'point' ? ((abs === '1' ? S.stPoint : S.stPoints) || '{n}').replace('{n}', abs)
                        : unit === 'night' ? ((abs === '1' ? S.stNight : S.stNights) || '{n}').replace('{n}', abs) : abs;
                    said.textContent = ((r > 0 ? S.stSrUp : S.stSrDown) || '').replace('{n}', amount).replace('{vs}', vs || '');
                }
            }
            e.appendChild(seen);
            e.appendChild(said);
            return e;
        }

        // The year the ▲▼ compare with: "2025", or "2025–26" for dates that
        // run across New Year (0.47.0) — always from the dates, never typed.
        function lyLabel(r) {
            var a = r.from.slice(0, 4), b = r.to.slice(0, 4);
            return a === b ? a : a + '–' + b.slice(2);
        }
        // A date range inside a tip: "Oct 1 – 31" held together, so a line
        // never ends on the dash (0.46.2).
        function tipRange(from, to) { return rangeLabel(from, to).replace(/ – /g, '\u00a0–\u00a0').replace(/^(\w+) (\d)/, '$1\u00a0$2'); }

        // A SECTION'S HEADING (0.46.2, Rob: centred, every one): the ⓘ right
        // after the text — held to the LAST WORD, so a heading that wraps
        // takes it along — and the bubble under the heading.
        function blockHead(sec, key, title, lead, bullets) {
            var row = el('div', 'mphbac-staff-stats-hrow');
            var h = el('h3', 'mphbac-staff-stats-h');
            var words = String(title || '').split(' ');
            var last = words.pop();
            if (words.length) h.appendChild(document.createTextNode(words.join(' ') + ' '));
            var tail = el('span', 'mphbac-staff-stats-hlast', last);
            var t = tipParts(key, title || '', lead, bullets);
            tail.appendChild(t.btn);
            h.appendChild(tail);
            row.appendChild(h);
            row.appendChild(t.box);
            sec.appendChild(row);
        }

        function drawStats(got, w, plan) {
            var data = got[0];
            var n = statsNumbers(data, w);
            var ly = got[2] ? statsNumbers(got[2], plan.ly.w) : null;
            // A pinned tip (or a focused ⓘ) survives the 3-minute refresh.
            var keepTip = tipOpen && tipOpen.pinned ? tipOpen.key : null;
            var focusTip = document.activeElement && document.activeElement.classList.contains('mphbac-staff-tip')
                && statsOut.contains(document.activeElement) ? document.activeElement.getAttribute('data-tip') : null;
            closeTip();
            // Built off the page and swapped in one step (0.45.3): see renderStats.
            var out = document.createDocumentFragment();

            // THE TILES, each with its ⓘ and ▲ ▼ against the same dates a year
            // earlier (0.46.0): points for %, nights for Length, counts for the
            // rest.
            // ▲ ▼'s line in each tile's tip: what it compares with, in what.
            var vsLine = function (str) {
                return plan.ly.why ? noCompareText(plan.ly.why) : (str || '').replace('{range}', tipRange(plan.ly.w.from, plan.ly.w.to));
            };
            var grid = el('dl', 'mphbac-staff-stats-kpis');
            var minus = function (a, b) {
                return (!ly || a === null || a === undefined || b === null || b === undefined) ? null : a - b;
            };
            var kpi = function (key, label, value, tip, delta, decimals, unit) {
                // tip: [lead, bullet, bullet, …]
                var box = el('div', 'mphbac-staff-kpi is-' + key);
                box.appendChild(el('dt', 'mphbac-staff-kpi-label', label || ''));
                box.appendChild(el('dd', 'mphbac-staff-kpi-num', String(value)));
                box.appendChild(deltaEl('dd', 'mphbac-staff-kpi-delta', delta, decimals, S.stVsYearSr, unit));
                var more = el('dd', 'mphbac-staff-kpi-more');
                var t = tipParts(key, label || '', tip[0], tip.slice(1));
                more.appendChild(t.btn);
                more.appendChild(t.box);
                box.appendChild(more);
                grid.appendChild(box);
            };
            // Order (WD): two full rows of three on a phone.
            // TIPS SAY WHAT A FIGURE MEANS, not how it is kept true (0.47.0,
            // Rob): the counting rules — a night or stay counted once, dock
            // blocks left out — are unchanged, and no longer repeated here.
            kpi('bookings', S.stBookings, n.bookings, [S.stBookingsTip, vsLine(S.stTipVs)], minus(n.bookings, ly && ly.bookings));
            kpi('booked', S.stBooked, n.pct === null ? '—' : n.pct + '%', [S.stBookedTip, vsLine(S.stTipVsPct)], minus(n.pct, ly && ly.pct), 0, 'point');
            kpi('length', S.stLength, n.length === null ? '—' : (S.stNights || '{n} nights').replace('{n}', n.length.toFixed(1)), [S.stLengthTip, S.stLengthWhole, vsLine(S.stTipVsNights)],
                minus(n.length, ly && ly.length), 1, 'night');
            // "nights" in a smaller size, so the figure fits a phone's tile;
            // the text still reads "4.2 nights".
            (function (dd) {
                var m = n.length === null ? null : /^([\d.]+)(\s.*)$/.exec(dd.textContent);
                if (!m) return;
                dd.textContent = m[1];
                dd.appendChild(el('span', 'mphbac-staff-kpi-unit', m[2]));
            })(grid.lastChild.querySelector('.mphbac-staff-kpi-num'));
            kpi('arrivals', S.stArrivals, n.arrivals, [S.stArrivalsTip, vsLine(S.stTipVs)], minus(n.arrivals, ly && ly.arrivals));
            kpi('departures', S.stDepartures, n.departures, [S.stDeparturesTip, vsLine(S.stTipVs)], minus(n.departures, ly && ly.departures));
            kpi('turnovers', S.stTurnovers, n.turnovers, [S.stTurnoversTip, vsLine(S.stTipVs)], minus(n.turnovers, ly && ly.turnovers));
            if (n.inHouse !== null) kpi('inhouse', S.stInHouse, n.inHouse, [S.stInHouseTip, S.stInHouseNot, vsLine(S.stTipVs)], minus(n.inHouse, ly && ly.inHouse));
            out.appendChild(grid);

            // NIGHTS BY COTTAGE (0.46.0, Rob; a real table since 0.47.0, Rob's
            // pick "bar under each name"): Cottage | Nights | Occupancy |
            // vs 2025, each cottage on two lines — its name and three
            // figures, then its occupancy as a full-width bar. Busiest first,
            // ties in cottage order. Occupancy is booked nights ÷ the
            // period's nights, and the bar shows that same %. ▲▼ IS AGAINST
            // THE SAME DATES LAST YEAR, in occupancy points, as the tiles'
            // (until 0.47.0: the previous timeframe) — from the last-year data
            // the tiles already load, so no request of its own; "—" when that
            // cannot be compared. A real <table> with the roles said outright,
            // because the CSS grid that aligns it would otherwise cost it its
            // table semantics: each figure is read with its column's name.
            var per = el('section', 'mphbac-staff-stats-block is-percot');
            blockHead(per, 'percot', S.stPerCottage, (S.stPerCottageTip || '').replace('{n}', String(n.nights)), [
                plan.ly.why ? noCompareText(plan.ly.why)
                    : (S.stTipVsOcc || '').replace('{range}', tipRange(plan.ly.w.from, plan.ly.w.to))]);
            var lyYear = lyLabel(plan.ly.w);
            var pct = function (v, of) { return of ? Math.round(100 * v / of) : 0; };
            var table = el('table', 'mphbac-staff-percot');
            table.setAttribute('role', 'table');
            var thead = el('thead');
            thead.setAttribute('role', 'rowgroup');
            var hr = el('tr', 'mphbac-staff-percot-head');
            hr.setAttribute('role', 'row');
            [['name', S.stColCottage], ['num', S.stColNights], ['pct', S.stColOcc], ['delta', (S.stColVs || 'vs {year}').replace('{year}', lyYear)]].forEach(function (c) {
                var th = el('th', 'mphbac-staff-percot-h is-' + c[0], c[1] || '');
                th.setAttribute('scope', 'col');
                th.setAttribute('role', 'columnheader');
                // Drawn in capitals by CSS; named in its own case.
                th.setAttribute('aria-label', c[1] || '');
                hr.appendChild(th);
            });
            thead.appendChild(hr);
            table.appendChild(thead);
            var tbody = el('tbody');
            tbody.setAttribute('role', 'rowgroup');
            var vsSr = (S.stVsDatesSr || '{year}').replace('{year}', lyYear);
            n.cottages.map(function (c, i) { return { c: c, i: i, v: n.perCottage[c.id] || 0 }; })
                .sort(function (a, b) { return b.v - a.v || a.i - b.i; })
                .forEach(function (r) {
                    var c = r.c, v = r.v, p = pct(v, n.nights);
                    var tr = el('tr', 'mphbac-staff-percot-row');
                    tr.setAttribute('role', 'row');
                    tr.setAttribute('data-cottage', String(c.id));
                    var name = el('th', 'mphbac-staff-percot-name', (c.number ? '#' + c.number + ' ' : '') + (c.abbrev || c.title || ''));
                    name.setAttribute('scope', 'row');
                    name.setAttribute('role', 'rowheader');
                    tr.appendChild(name);
                    var num = el('td', 'mphbac-staff-percot-num', String(v));
                    num.setAttribute('role', 'cell');
                    tr.appendChild(num);
                    var occ = el('td', 'mphbac-staff-percot-pct', p + '%');
                    occ.setAttribute('role', 'cell');
                    tr.appendChild(occ);
                    var d = deltaEl('td', 'mphbac-staff-percot-delta', ly ? p - pct(ly.perCottage[c.id] || 0, ly.nights) : null, 0, vsSr, 'point');
                    d.setAttribute('role', 'cell');
                    tr.appendChild(d);
                    // The second line: the bar, a picture of the Occupancy
                    // figure, so it is not read a second time.
                    var bar = el('td', 'mphbac-staff-percot-barcell');
                    bar.setAttribute('aria-hidden', 'true');
                    var track = el('span', 'mphbac-staff-percot-track');
                    var fill = el('span', 'mphbac-staff-percot-fill');
                    fill.style.width = p + '%';
                    track.appendChild(fill);
                    bar.appendChild(track);
                    tr.appendChild(bar);
                    tbody.appendChild(tr);
                });
            table.appendChild(tbody);
            per.appendChild(table);
            out.appendChild(per);

            // Share of NIGHTS booked by source (Rob: nights, not bookings): an
            // inline SVG pie in the source colours, and the same numbers as
            // plain text for anyone not looking at the picture.
            var src = el('section', 'mphbac-staff-stats-block is-source');
            blockHead(src, 'source', S.stBySource, S.stBySourceTip, []);
            if (!n.booked) {
                src.appendChild(el('p', 'mphbac-staff-stats-empty', S.stNoNights || ''));
            } else {
                var wrap = el('div', 'mphbac-staff-pie-wrap');
                wrap.appendChild(pie(n.bySource, n.booked));
                var ul = el('ul', 'mphbac-staff-pie-list');
                SOURCES.forEach(function (k) {
                    var v = n.bySource[k];
                    if (!v) return;
                    var li = el('li', 'mphbac-staff-pie-item is-src-' + k);
                    li.appendChild(el('span', 'mphbac-staff-pie-swatch'));
                    li.appendChild(document.createTextNode(sourceName({ sourceKey: k }) + ' — ' + pctOf(v, n.booked) + '% (' + nightsText(v) + ')'));
                    ul.appendChild(li);
                });
                wrap.appendChild(ul);
                src.appendChild(wrap);
            }
            out.appendChild(src);

            out.appendChild(drawMix(n));
            out.appendChild(drawWeekdays(n));
            out.appendChild(drawLead(n, w));
            out.appendChild(drawPace(got[4], got[5], plan));
            out.appendChild(drawHeat(got[3], plan.year, w, n.cottages.length));

            statsOut.textContent = '';
            statsOut.appendChild(out);
            if (keepTip || focusTip) {
                var again = statsOut.querySelector('.mphbac-staff-tip[data-tip="' + (keepTip || focusTip) + '"]');
                if (again && keepTip) openTip(again, true);
                if (again && focusTip) again.focus();
            }
        }

        // LENGTH OF STAY (0.46.0): 1–2, 3–6, 7–27 and 28+ nights.
        function drawMix(n) {
            var sec = el('section', 'mphbac-staff-stats-block is-mix');
            blockHead(sec, 'mix', S.stMix, S.stMixTip, []);
            if (!n.bookings) {
                sec.appendChild(el('p', 'mphbac-staff-stats-empty', S.stNoStays || ''));
                return sec;
            }
            var counts = stayMix(n.mine);
            var ul = el('ul', 'mphbac-staff-mix');
            counts.forEach(function (v, i) {
                var li = el('li', 'mphbac-staff-mix-row');
                li.appendChild(el('span', 'mphbac-staff-mix-name', S['stMix' + i] || ''));
                var track = el('span', 'mphbac-staff-percot-track');
                var fill = el('span', 'mphbac-staff-percot-fill');
                fill.style.width = pctOf(v, n.bookings) + '%';
                track.appendChild(fill);
                li.appendChild(track);
                li.appendChild(el('span', 'mphbac-staff-mix-num', v + ' (' + pctOf(v, n.bookings) + '%)'));
                ul.appendChild(li);
            });
            sec.appendChild(ul);
            return sec;
        }

        // ARRIVALS AND DEPARTURES BY WEEKDAY (0.46.0), Sunday to Saturday.
        function drawWeekdays(n) {
            var sec = el('section', 'mphbac-staff-stats-block is-weekdays');
            blockHead(sec, 'weekdays', S.stWeekdays, S.stWeekdaysTip, []);
            var max = Math.max.apply(null, n.inByDay.concat(n.outByDay).concat([1]));
            var chart = el('div', 'mphbac-staff-wk');
            chart.setAttribute('aria-hidden', 'true');
            var said = el('ul', 'mphbac-sr-only');
            for (var d = 0; d < 7; d++) {
                var col = el('div', 'mphbac-staff-wk-day');
                var bars = el('div', 'mphbac-staff-wk-bars');
                [['in', n.inByDay[d]], ['out', n.outByDay[d]]].forEach(function (k) {
                    var c = el('span', 'mphbac-staff-wk-col is-' + k[0]);
                    c.appendChild(el('span', 'mphbac-staff-wk-num', String(k[1])));
                    var bar = el('span', 'mphbac-staff-wk-bar');
                    bar.style.height = Math.round(72 * k[1] / max) + 'px';
                    c.appendChild(bar);
                    bars.appendChild(c);
                });
                col.appendChild(bars);
                col.appendChild(el('span', 'mphbac-staff-wk-name', ((CAL.weekdays || [])[d] || '').slice(0, 3)));
                chart.appendChild(col);
                said.appendChild(el('li', '', (S.stWeekdaySr || '').replace('{day}', (CAL.weekdaysFull || CAL.weekdays || [])[d] || '')
                    .replace('{in}', ((n.inByDay[d] === 1 ? S.stArrival1 : S.stArrivalN) || '{n}').replace('{n}', String(n.inByDay[d])))
                    .replace('{out}', ((n.outByDay[d] === 1 ? S.stDeparture1 : S.stDepartureN) || '{n}').replace('{n}', String(n.outByDay[d])))));
            }
            var key = el('p', 'mphbac-staff-wk-key');
            key.setAttribute('aria-hidden', 'true');
            [['in', S.stArrivals], ['out', S.stDepartures]].forEach(function (k) {
                var s = el('span', 'mphbac-staff-wk-keyitem is-' + k[0]);
                s.appendChild(el('span', 'mphbac-staff-wk-swatch'));
                s.appendChild(document.createTextNode(k[1] || ''));
                key.appendChild(s);
            });
            sec.appendChild(chart);
            sec.appendChild(key);
            sec.appendChild(said);
            return sec;
        }

        // HOW FAR AHEAD THEY BOOK (0.46.0), by source, then all together.
        function drawLead(n, w) {
            var sec = el('section', 'mphbac-staff-stats-block is-lead');
            blockHead(sec, 'lead', S.stLead, S.stLeadTip, []);
            var by = leadTimes(n.mine, w);
            if (!by.all.n) {
                sec.appendChild(el('p', 'mphbac-staff-stats-empty', S.stNoLead || ''));
                return sec;
            }
            var ul = el('ul', 'mphbac-staff-lead');
            SOURCES.concat(['all']).forEach(function (k) {
                var v = by[k];
                if (!v || !v.n) return;
                var days = Math.round(v.days / v.n);
                var li = el('li', 'mphbac-staff-lead-row' + (k === 'all' ? ' is-all' : ' is-src-' + k));
                li.setAttribute('data-source', k);
                if (k !== 'all') li.appendChild(el('span', 'mphbac-staff-pie-swatch'));
                li.appendChild(el('span', 'mphbac-staff-lead-name', k === 'all' ? (S.stAllSources || '') : sourceName({ sourceKey: k })));
                li.appendChild(el('span', 'mphbac-staff-lead-num',
                    ((days === 1 ? S.stDay : S.stDays) || '{n} days').replace('{n}', String(days))
                    + ' (' + ((v.n === 1 ? S.stStay : S.stStays) || '{n} stays').replace('{n}', String(v.n)) + ')'));
                ul.appendChild(li);
            });
            sec.appendChild(ul);
            return sec;
        }

        // PACE (0.46.0): the next 30 / 60 / 90 nights from tonight, against
        // what was on the books on this date a year ago for the same nights a
        // year earlier. It does not follow the timeframe.
        function drawPace(nowData, agoData, plan) {
            var sec = el('section', 'mphbac-staff-stats-block is-pace');
            blockHead(sec, 'pace', S.stPace, S.stPaceTip, [plan.pace.why ? noCompareText(plan.pace.why) : S.stPaceVs, S.stPaceLow, S.stPaceFixed]);
            var ul = el('ul', 'mphbac-staff-pace');
            [30, 60, 90].forEach(function (k) {
                var now = paceNights(nowData, plan.pace.now.from, k, null);
                var ago = agoData ? paceNights(agoData, plan.pace.ago.from, k, plan.pace.asOf) : null;
                var li = el('li', 'mphbac-staff-pace-row');
                li.setAttribute('data-days', String(k));
                li.appendChild(el('span', 'mphbac-staff-pace-name', (S.stPaceNext || '').replace('{n}', String(k))));
                li.appendChild(el('span', 'mphbac-staff-pace-num', (S.stPaceNights || '{n} nights booked').replace('{n}', String(now))));
                var d = deltaEl('span', 'mphbac-staff-pace-delta', ago === null ? null : now - ago, 0, S.stVsAgo, 'night');
                var vs = el('span', 'mphbac-staff-pace-vs', ' ' + (S.stVsAgo || ''));
                vs.setAttribute('aria-hidden', 'true');
                d.insertBefore(vs, d.lastChild);
                li.appendChild(d);
                ul.appendChild(li);
            });
            sec.appendChild(ul);
            return sec;
        }

        // THE YEAR AS A HEAT MAP (0.46.0): one square a night of the calendar
        // year holding the timeframe, shaded by how many cottages were booked
        // that night — nine steps of the site's button blue, #0A50B2 — with
        // the timeframe outlined. Tapping a night opens the board on it.
        function drawHeat(data, year, w, total) {
            var sec = el('section', 'mphbac-staff-stats-block is-heat');
            var title = (S.stHeat || '{year}').replace('{year}', year.y);
            blockHead(sec, 'heat', title, (S.stHeatTip || '').replace('{year}', year.y).replace('{n}', String(total)), [S.stHeatOutline, S.stHeatTap]);
            var nights = daysBetween(year.w.from, year.w.to);
            var per = data ? own(data.bookings || [], nights).perNight : {};
            var grid = el('div', 'mphbac-staff-heat');
            var inW = function (d) { return !!d && d >= w.from && d <= w.to; };
            for (var m = 1; m <= 12; m++) {
                var ym = year.y + '-' + pad(m);
                var mon = el('div', 'mphbac-staff-heat-month');
                mon.appendChild(el('span', 'mphbac-staff-heat-name', shortMonth(ym + '-01')));
                var days = el('div', 'mphbac-staff-heat-days');
                var lead = (new Date(ym + '-01T00:00:00').getDay() - SOW + 7) % 7;
                for (var i = 0; i < lead; i++) days.appendChild(el('span', 'mphbac-staff-heat-pad'));
                var md = monthDays(ym);
                md.forEach(function (d, i) {
                    var cell = el('span', 'mphbac-staff-heat-day');
                    if (d < year.w.from || d > year.w.to || !data) {
                        cell.className += ' is-none';
                    } else {
                        var v = Math.min(total, per[d] || 0);
                        var lvl = !v ? 0 : Math.max(1, Math.round(8 * v / Math.max(1, total)));
                        cell.className += ' is-l' + lvl;
                        cell.setAttribute('data-day', d);
                        cell.setAttribute('data-n', String(v));
                        cell.title = (S.stHeatDay || '').replace('{date}', mediumDay(d)).replace('{n}', String(v)).replace('{total}', String(total));
                        cell.setAttribute('role', 'button');
                        cell.setAttribute('aria-label', cell.title);
                        cell.tabIndex = -1;
                    }
                    // The outline: only the timeframe's OUTER edges in this
                    // month's 7-column grid, so it reads as one shape.
                    if (inW(d)) {
                        var p = lead + i, e = ' is-in';
                        if (!inW(md[i - 7])) e += ' is-et';
                        if (!inW(md[i + 7])) e += ' is-eb';
                        if (p % 7 === 0 || !inW(md[i - 1])) e += ' is-el';
                        if (p % 7 === 6 || !inW(md[i + 1])) e += ' is-er';
                        cell.className += e;
                    }
                    days.appendChild(cell);
                });
                mon.appendChild(days);
                grid.appendChild(mon);
            }
            // THE KEYBOARD (0.46.1, the WD): ONE tab stop — the timeframe's
            // first night, else the year's first — and the arrows from there:
            // ← → a night, ↑ ↓ a week, Home / End the month's first and last;
            // Enter or Space opens the board on it, as a tap does.
            grid.setAttribute('role', 'group');
            grid.setAttribute('aria-label', (S.stHeatNav || '').replace('{year}', year.y));
            var stop = grid.querySelector('.mphbac-staff-heat-day.is-in[data-day]') || grid.querySelector('.mphbac-staff-heat-day[data-day]');
            if (stop) stop.tabIndex = 0;
            grid.addEventListener('click', function (e) {
                var c = e.target.closest ? e.target.closest('.mphbac-staff-heat-day[data-day]') : null;
                if (c) jumpBoard(c.getAttribute('data-day'));
            });
            grid.addEventListener('keydown', function (e) {
                var c = e.target.closest ? e.target.closest('.mphbac-staff-heat-day[data-day]') : null;
                if (!c) return;
                var d = c.getAttribute('data-day'), k = e.key, to = null;
                if (k === 'Enter' || k === ' ') { e.preventDefault(); jumpBoard(d, true); return; }
                if (k === 'ArrowRight') to = shiftDay(d, 1);
                else if (k === 'ArrowLeft') to = shiftDay(d, -1);
                else if (k === 'ArrowDown') to = shiftDay(d, 7);
                else if (k === 'ArrowUp') to = shiftDay(d, -7);
                else if (k === 'Home') to = d.slice(0, 8) + '01';
                else if (k === 'End') { var md = monthDays(d.slice(0, 7)); to = md[md.length - 1]; }
                else return;
                e.preventDefault();
                var t = grid.querySelector('.mphbac-staff-heat-day[data-day="' + to + '"]');
                if (!t) return;
                c.tabIndex = -1;
                t.tabIndex = 0;
                t.focus();
            });
            sec.appendChild(grid);
            var key = el('p', 'mphbac-staff-heat-key');
            key.setAttribute('aria-hidden', 'true');
            key.appendChild(el('span', 'mphbac-staff-heat-keylabel', '0'));
            for (var l = 0; l <= 8; l++) key.appendChild(el('span', 'mphbac-staff-heat-day is-l' + l));
            key.appendChild(el('span', 'mphbac-staff-heat-keylabel', (S.stHeatAll || '{n}').replace('{n}', String(total))));
            sec.appendChild(key);
            return sec;
        }

        // The board, sent to a night from the heat map — in whatever period
        // it shows — and brought into view.
        function jumpBoard(d, byKey) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < CAP_LO || d > CAP_HI) return;
            state.anchor = d;
            render();
            var top = root.querySelector('.mphbac-staff-topbar') || gridEl;
            if (top.scrollIntoView) top.scrollIntoView({ block: 'start' });
            // From the keyboard, focus goes with it: to the chart (a
            // keyboard-reachable region) — Daily's list has no tab stop.
            if (byKey && state.period !== 'day') { try { gridEl.focus({ preventScroll: true }); } catch (e) { gridEl.focus(); } }
        }

        // ---- ⓘ TIPS (0.46.0, Rob) ----------------------------------------------
        // A real button on every tile and block: tap or click opens its bubble,
        // tapping anywhere else (or Escape) closes it, and one is open at a
        // time. On a computer, hovering shows it too; a click then keeps it.
        // aria-expanded says which is open, and the bubble follows its button
        // in reading order. The text is the server's, written with textContent.
        var tipOpen = null;
        var FINE = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
        // THE TIP (0.46.2, Rob: "complete sentences or bullet points"): one
        // lead sentence, then the facts as a real list. The button and its
        // bubble are returned apart, so a heading can carry the ⓘ beside its
        // last word while the bubble sits under the heading.
        function tipParts(key, name, lead, bullets) {
            var btn = el('button', 'mphbac-staff-tip');
            btn.type = 'button';
            btn.setAttribute('data-tip', key);
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('aria-label', (S.stAbout || '{name}').replace('{name}', name));
            btn.appendChild(infoIcon());
            var box = el('div', 'mphbac-staff-tipbox');
            box.id = 'mphbac-staff-tip-' + (++TIP_SEQ);
            box.hidden = true;
            box.appendChild(el('p', 'mphbac-staff-tiplead', lead || ''));
            var items = (bullets || []).filter(Boolean);
            if (items.length) {
                // A space between the parts too, so the text never reads
                // "counts once.Dock blocks" to anything that joins it up.
                box.appendChild(document.createTextNode(' '));
                var ul = el('ul', 'mphbac-staff-tiplist');
                items.forEach(function (t, n) {
                    if (n) ul.appendChild(document.createTextNode(' '));
                    ul.appendChild(el('li', '', t));
                });
                box.appendChild(ul);
            }
            btn.setAttribute('aria-controls', box.id);
            btn._box = box;
            btn.addEventListener('click', function () {
                if (tipOpen && tipOpen.btn === btn) {
                    if (tipOpen.pinned) closeTip(); else tipOpen.pinned = true;
                } else {
                    openTip(btn, true);
                }
            });
            btn.addEventListener('mouseenter', function () {
                if (FINE && FINE.matches && !(tipOpen && tipOpen.pinned)) openTip(btn, false);
            });
            var leave = function (e) {
                var to = e.relatedTarget;
                if (tipOpen && tipOpen.btn === btn && !tipOpen.pinned && !(to && (btn.contains(to) || box.contains(to)))) closeTip();
            };
            btn.addEventListener('mouseleave', leave);
            box.addEventListener('mouseleave', leave);
            // A tap on the bubble closes it too: on a phone it covers the
            // tiles under it, and a tap there means "done with this".
            box.addEventListener('click', function () { closeTip(); });
            return { btn: btn, box: box };
        }
        function infoIcon() {
            var NS = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 8h.01M11 12h1v4h1' }]].forEach(function (s) {
                var e = document.createElementNS(NS, s[0]);
                Object.keys(s[1]).forEach(function (a) { e.setAttribute(a, String(s[1][a])); });
                svg.appendChild(e);
            });
            return svg;
        }
        function openTip(btn, pinned) {
            if (tipOpen && tipOpen.btn !== btn) closeTip();
            btn._box.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            tipOpen = { btn: btn, box: btn._box, pinned: pinned, key: btn.getAttribute('data-tip') };
            placeTip(btn);
        }
        function closeTip() {
            if (!tipOpen) return;
            tipOpen.box.hidden = true;
            tipOpen.btn.setAttribute('aria-expanded', 'false');
            tipOpen = null;
        }
        // Under its button, and kept inside the Stats section's width.
        function placeTip(btn) {
            var box = btn._box;
            box.style.left = '0px';
            box.style.top = '0px';
            var par = (box.offsetParent || statsOut).getBoundingClientRect();
            var lim = statsOut.getBoundingClientRect();
            var b = btn.getBoundingClientRect(), bw = box.offsetWidth;
            var left = Math.max(lim.left, Math.min(b.left + b.width / 2 - bw / 2, lim.right - bw));
            box.style.left = Math.round(left - par.left) + 'px';
            box.style.top = Math.round(b.bottom - par.top + 6) + 'px';
        }
        document.addEventListener('click', function (e) {
            if (tipOpen && !tipOpen.btn.contains(e.target) && !tipOpen.box.contains(e.target)) closeTip();
        }, true);
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || !tipOpen) return;
            var b = tipOpen.btn;
            closeTip();
            b.focus();
        });
        window.addEventListener('resize', function () { if (tipOpen) placeTip(tipOpen.btn); });

        // ---- LAST YEAR'S GHOSTS (0.46.0, Rob) -----------------------------------
        // Last year's bookings, by calendar date, on this year's chart.
        //
        // OFF · BEHIND · IN FRONT (0.47.0, Rob's picks of 2026-10-16). Off on
        // every load, and again on a back/forward-cache restore.
        //   BEHIND is the 0.46.0 ghost, unchanged: a faint dashed outline
        //   behind the bars — aria-hidden, no tab stop, no taps
        //   (pointer-events: none), no name and no source colour; nothing on
        //   it reads as a booking.
        //   IN FRONT brings the same boxes above everything of this year's:
        //   striped in two pale tints of the booking's own source colour, a
        //   solid edge in that colour, and a white "2025 · Amy A." tag. Each
        //   is a button named "Last year: …", and opens the booking's sheet
        //   under a "Last Year · 2025" heading. This year's bars fade to 22%
        //   and take no taps or focus; every other way to a current booking —
        //   search, the Daily list — is untouched.
        // ONE SET OF BOXES. They are drawn once per chart, from one fetch;
        // Behind ↔ In Front is a class on the chart and each box's
        // attributes, never a refetch or a redraw. The data is held for the
        // session (lyHeld), so a chart redrawn by navigation or the 3-minute
        // refresh gets its boxes in the same step as its bars: no flicker, no
        // second request, and drawGhosts never draws a chart's boxes twice.
        // A fetch that comes back after navigation or Off is dropped (lySeq).
        var LY_MODES = ['off', 'behind', 'front'];
        var lyMode = 'off';
        var lySeq = 0;
        var lyHeld = {};
        var lyFlight = {};
        function drawGhosts(chart) {
            var from = chart.getAttribute('data-from'), to = chart.getAttribute('data-to');
            // Once per chart: asked for (or drawn) already, nothing to do.
            if (!from || !to || !chart._rows || chart._lyState) return;
            var r = clampCap({ from: yearBack(from), to: yearBack(to) });
            if (r.from > r.to) return;
            var key = r.from + '|' + r.to, seq = ++lySeq;
            chart._lyState = 'pending';
            var draw = function (data) {
                if (seq !== lySeq || !chart.isConnected || lyMode === 'off' || chart.querySelector('.mphbac-staff-ghost')) return;
                chart._lyState = 'drawn';
                var days = chart._days, N = days.length, idx = {}, seen = {};
                days.forEach(function (d, i) { idx[d] = i; });
                var frag = document.createDocumentFragment();
                (data.bookings || []).forEach(function (b) {
                    if (!b.checkin || !b.checkout) return;
                    var ci = shiftYears(b.checkin, 1), co = shiftYears(b.checkout, 1);
                    if (co < from || ci > to) return;
                    var s = ci < from ? 0 : 2 * idx[ci] + 1;
                    var e = co > to ? 2 * N : 2 * idx[co] + 1;
                    if (isNaN(s) || isNaN(e) || e <= s) return;
                    (b.cottages || []).forEach(function (c) {
                        var row = chart._rows[c.roomTypeId], k = c.roomTypeId + '|' + ci + '|' + co;
                        if (!row || seen[k]) return;
                        seen[k] = 1;
                        var g = ghostEl(b, (e - s) * (chart._dayW || 44) / 2, chart._font);
                        g.style.gridColumn = (2 + s) + ' / ' + (2 + e);
                        g.style.gridRow = String(row);
                        frag.appendChild(g);
                    });
                });
                chart.appendChild(frag);
                applyLy(chart);
            };
            if (lyHeld[key]) { draw(lyHeld[key]); return; }
            // One request per range, however often the switch is flicked
            // while it is in flight.
            (lyFlight[key] = lyFlight[key] || fetchRange(r).then(function (data) {
                lyHeld[key] = data;
                delete lyFlight[key];
                return data;
            }, function (err) { delete lyFlight[key]; throw err; })).then(draw).catch(function (err) {
                if (seq !== lySeq) return;
                chart._lyState = null;             // the next switch may try again
                if (!tokenReload(err)) say(failureText(err), true);
            });
        }
        // One box. Built Behind (as 0.46.0 drew it); applyLy() makes it a
        // named button In Front. The tag is in the box from the start and
        // shown only In Front — the box carries nothing else.
        function ghostEl(b, px, family) {
            var g = document.createElement('button');
            g.type = 'button';
            g.className = 'mphbac-staff-ghost is-src-' + sourceOf(b);
            g.setAttribute('aria-hidden', 'true');
            g.tabIndex = -1;
            var year = b.checkin.slice(0, 4);        // the booking's own year (Dec–Jan: two)
            var tag = document.createElement('span');
            tag.className = 'mphbac-staff-ghost-tag';
            tag.textContent = lyTag(b, year, px, family);
            // The year alone gets the box's whole width (staff.css).
            if (tag.textContent === year) g.className += ' is-year-only';
            g.appendChild(tag);
            g._ly = { id: b.id, year: year, name: lyName(b, year) };
            return g;
        }
        // "2025 · Amy A.", clipped with an ellipsis by CSS; on a box too
        // narrow for even a name's first letter, the year alone. Measured in
        // the tag's own face: Raleway bold at the bar label's 13px. `px` is
        // the box's width; the box's margins and border, its padding and the
        // tag's are what the text cannot have.
        var LY_TAG_FONT = '700 13px ';
        function lyTag(b, year, px, family) {
            var full = (S.lyTag || '{year} · {name}').replace('{year}', year).replace('{name}', barName(b));
            var room = px - 2 - 4 - 8 - 12;
            var least = (S.lyTag || '{year} · {name}').replace('{year}', year).replace('{name}', barName(b).charAt(0) + '…');
            return textW(least, LY_TAG_FONT + (family || 'sans-serif')) <= room ? full : year;
        }
        // "Last year: Amy Archer, Oct 1 to Oct 11 2025, Direct" — and across
        // New Year, "Dec 28 2025 to Jan 3 2026".
        function lyName(b, year) {
            var y2 = b.checkout.slice(0, 4);
            var dates = (S.lyDates || '{from} to {to}')
                .replace('{from}', shortDate(b.checkin) + (y2 !== year ? ' ' + year : ''))
                .replace('{to}', shortDate(b.checkout) + ' ' + y2);
            return (S.lyName || 'Last year: {name}, {dates}, {source}')
                .replace('{name}', b.guestName || ('#' + b.id)).replace('{dates}', dates).replace('{source}', sourceName(b));
        }
        // THE MODE, ON ONE CHART: the class, then each box and each bar.
        function applyLy(chart) {
            if (!chart || !chart.classList) return;
            var front = lyMode === 'front';
            chart.classList.toggle('is-ly-front', front);
            [].forEach.call(chart.querySelectorAll('.mphbac-staff-ghost'), function (g) {
                if (front) {
                    g.removeAttribute('aria-hidden');
                    g.removeAttribute('tabindex');
                    g.setAttribute('aria-label', g._ly ? g._ly.name : '');
                } else {
                    g.setAttribute('aria-hidden', 'true');
                    g.tabIndex = -1;
                    g.removeAttribute('aria-label');
                }
            });
            // In Front, this year's bars take no taps (staff.css) and no
            // focus, and leave the accessibility tree while faded.
            [].forEach.call(chart.querySelectorAll('.mphbac-staff-bar'), function (bar) {
                bar.inert = front;
                if (front) bar.tabIndex = -1; else bar.removeAttribute('tabindex');
            });
        }
        function clearGhosts() {
            [].forEach.call(gridEl.querySelectorAll('.mphbac-staff-ghost'), function (g) { g.parentNode.removeChild(g); });
        }
        function setLy(mode) {
            if (LY_MODES.indexOf(mode) < 0) return;
            lyMode = mode;
            lySegs.forEach(function (b) {
                var on = b.getAttribute('data-ly') === mode;
                b.setAttribute('aria-checked', on ? 'true' : 'false');
                b.tabIndex = on ? 0 : -1;
            });
            var chart = gridEl.firstChild;
            if (mode === 'off') {
                lySeq++;                           // a fetch in flight draws nothing
                clearGhosts();
                if (chart) chart._lyState = null;
            } else if (chart && chart._rows) {
                drawGhosts(chart);                 // once per chart: Behind ↔ In Front draws nothing
            }
            applyLy(chart);
        }
        if (lyGroup) {
            // Named by its visible label.
            var lyCap = lyGroup.querySelector('.mphbac-staff-ghostlabel');
            if (lyCap) {
                if (!lyCap.id) lyCap.id = 'mphbac-staff-ly-' + Math.random().toString(36).slice(2, 9);
                lyGroup.setAttribute('aria-labelledby', lyCap.id);
            }
            lyGroup.addEventListener('click', function (e) {
                var b = e.target.closest ? e.target.closest('.mphbac-staff-segbtn') : null;
                if (b && !b.disabled) setLy(b.getAttribute('data-ly'));
            });
            // A radio group's keys: the arrows move the choice and the focus
            // together, round the ends; Home and End go to the first and last.
            lyGroup.addEventListener('keydown', function (e) {
                var i = lySegs.indexOf(document.activeElement), k = e.key, n = lySegs.length;
                if (i < 0) return;
                var to = k === 'ArrowRight' || k === 'ArrowDown' ? (i + 1) % n
                    : k === 'ArrowLeft' || k === 'ArrowUp' ? (i + n - 1) % n
                    : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
                if (to < 0) return;
                e.preventDefault();
                setLy(lySegs[to].getAttribute('data-ly'));
                lySegs[to].focus();
            });
            setLy('off');                         // off on every load
            // ...and on a page brought back from the back/forward cache,
            // which restores the script's state as it was left.
            window.addEventListener('pageshow', function (e) { if (e.persisted) setLy('off'); });
        }
        // ONE CLICK HANDLER FOR EVERY BOX, on the chart's scroller: a box
        // carries no listener of its own. Behind, a box takes no taps at all.
        gridEl.addEventListener('click', function (e) {
            var g = e.target.closest ? e.target.closest('.mphbac-staff-ghost') : null;
            if (!g || lyMode !== 'front' || !g._ly) return;
            openDetail(g._ly.id, g, g._ly.year);
        });

        // THE RANGE LINE IS BIG AND ONE LINE (0.45.3, Rob): it is what says
        // what the figures are for. It starts at its full CSS size and steps
        // down only as far as the width needs — never wrapping, never cut.
        // Since 0.46.0 it sits between ‹ and ›, so the width is what the
        // arrows leave it.
        function fitRange(p) {
            if (!p || !p.isConnected) return;
            p.style.fontSize = '';
            var size = parseFloat(getComputedStyle(p).fontSize) || 28;
            while (size > 12 && p.scrollWidth > p.clientWidth + 0.5) {
                size -= 1;
                p.style.fontSize = size + 'px';
            }
        }
        window.addEventListener('resize', function () { fitRange(statsRange); });

        // The second box follows Timeframe (0.45.3, Rob's design): its label
        // and kind, shown from the one period above.
        function statsSync() {
            var span = statsSpan.value;
            var show = function (sel, on) { [].forEach.call(statsEl.querySelectorAll(sel), function (e) { e.hidden = !on; }); };
            show('.mphbac-staff-stats-on', span === 'day' || span === 'week');
            show('.mphbac-staff-stats-monthfield', span === 'month');
            show('.mphbac-staff-stats-yearfield', span === 'year');
            show('.mphbac-staff-stats-custom', span === 'custom');
            statsEl.querySelector('.mphbac-staff-stats-pick').classList.toggle('is-custom', span === 'custom');
            if (statsOnLabel) statsOnLabel.textContent = span === 'week' ? (S.stWeekOf || 'Week Of') : (S.stDayLabel || 'Day');
            if (statsDate) statsDate.value = statsAnchor;
            if (statsMonth) statsMonth.value = statsAnchor.slice(0, 7);
            if (statsYear) statsYear.value = statsAnchor.slice(0, 4);
        }
        // A day inside the board's ±3-year window.
        function statsClamp(d) { return d < CAP_LO ? CAP_LO : (d > CAP_HI ? CAP_HI : d); }
        function statsOptions() {
            var opt = function (sel, value, text) { var o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); };
            if (statsMonth) {
                for (var m = CAP_LO.slice(0, 7); m <= CAP_HI.slice(0, 7);) {
                    opt(statsMonth, m, shortMonth(m + '-01') + ' ' + m.slice(0, 4));
                    var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1;
                    if (mo > 12) { mo = 1; y++; }
                    m = y + '-' + pad(mo);
                }
            }
            if (statsYear) {
                for (var yy = +CAP_LO.slice(0, 4); yy <= +CAP_HI.slice(0, 4); yy++) opt(statsYear, String(yy), String(yy));
            }
        }

        function pctOf(v, total) { return total ? Math.round(100 * v / total) : 0; }

        var PIE_FONT = '700 15px ' + (getComputedStyle(root).fontFamily || 'sans-serif');
        function pie(bySource, total) {
            var NS = 'http://www.w3.org/2000/svg';
            var R = 70, C = 80;
            var svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 160 160');
            svg.setAttribute('class', 'mphbac-staff-pie');
            svg.setAttribute('aria-hidden', 'true');
            var at = -Math.PI / 2;
            SOURCES.forEach(function (k) {
                var v = bySource[k];
                if (!v) return;
                var frac = v / total, end = at + frac * 2 * Math.PI, shape;
                if (frac >= 0.9999) {
                    shape = document.createElementNS(NS, 'circle');
                    shape.setAttribute('cx', C); shape.setAttribute('cy', C); shape.setAttribute('r', R);
                } else {
                    shape = document.createElementNS(NS, 'path');
                    var x1 = C + R * Math.cos(at), y1 = C + R * Math.sin(at);
                    var x2 = C + R * Math.cos(end), y2 = C + R * Math.sin(end);
                    shape.setAttribute('d', 'M' + C + ' ' + C + ' L' + x1.toFixed(2) + ' ' + y1.toFixed(2)
                        + ' A' + R + ' ' + R + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z');
                }
                shape.setAttribute('class', 'mphbac-staff-pie-slice is-src-' + k);
                shape.setAttribute('data-source', k);
                svg.appendChild(shape);
                // The label sits in its slice; one too thin to hold it is
                // labelled in the list beside the pie only. Since 0.47.0 (15px
                // labels) "too thin" is measured: the label, with 3px either
                // side, must fit across the slice where it sits.
                var mid = (at + end) / 2, lr = frac >= 0.9999 ? 0 : R * 0.62;
                var room = frac >= 0.5 ? Infinity : 2 * lr * Math.sin(Math.PI * frac);
                if (frac >= 0.9999 || room >= textW(pctOf(v, total) + '%', PIE_FONT) + 6) {
                    var t = document.createElementNS(NS, 'text');
                    t.setAttribute('x', (C + lr * Math.cos(mid)).toFixed(2));
                    t.setAttribute('y', (C + lr * Math.sin(mid)).toFixed(2));
                    t.setAttribute('class', 'mphbac-staff-pie-label is-src-' + k);   // its slice's ink (0.46.2)
                    t.setAttribute('text-anchor', 'middle');
                    t.setAttribute('dominant-baseline', 'central');
                    t.textContent = pctOf(v, total) + '%';
                    svg.appendChild(t);
                }
                at = end;
            });
            return svg;
        }

        if (statsEl) {
            statsAnchor = statsClamp(config.today);
            statsOptions();
            if (statsFrom) statsFrom.value = windowOf(config.today, 'month').from;
            if (statsTo) statsTo.value = windowOf(config.today, 'month').to;
            [statsDate, statsFrom, statsTo].forEach(function (i) { if (i) { i.min = CAP_LO; i.max = CAP_HI; } });
            statsSync();
            statsEl.addEventListener('toggle', function () { if (statsEl.open) renderStats(); });
            if (statsPrev) statsPrev.addEventListener('click', function () { statsStep(-1); });
            if (statsNext) statsNext.addEventListener('click', function () { statsStep(1); });
            var restat = function () { if (statsEl.open) renderStats(); else statsSync(); };
            statsSpan.addEventListener('change', function () {
                var to = statsSpan.value, from = statsLastSpan;
                if (from === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(statsFrom.value)) statsAnchor = statsClamp(statsFrom.value);
                if (to === 'custom' && from !== 'custom') {
                    // Custom opens on the period that was showing.
                    var pw = windowOf(statsAnchor, from);
                    statsFrom.value = statsClamp(pw.from);
                    statsTo.value = statsClamp(pw.to);
                }
                statsLastSpan = to;
                restat();
            });
            if (statsDate) statsDate.addEventListener('change', function () {
                if (/^\d{4}-\d{2}-\d{2}$/.test(statsDate.value)) statsAnchor = statsClamp(statsDate.value);
                restat();
            });
            if (statsMonth) statsMonth.addEventListener('change', function () {
                var m = statsMonth.value;
                if (statsAnchor.slice(0, 7) !== m) statsAnchor = statsClamp(m + '-01');
                restat();
            });
            if (statsYear) statsYear.addEventListener('change', function () {
                var y = statsYear.value;
                // The same month of that year if the period was in it already,
                // else its January (the WD).
                if (statsAnchor.slice(0, 4) !== y) statsAnchor = statsClamp(y + '-01-01');
                restat();
            });
            [statsFrom, statsTo].forEach(function (i) { if (i) i.addEventListener('change', restat); });
        }

        // ---- SEARCH (0.45.0) -------------------------------------------------
        // Live as you type from 2 characters, debounced, ONE mixed list, best
        // match first (Rob). The server does all the matching and returns
        // summary rows with a plain-text "why"; tapping one opens its sheet
        // through the gated booking endpoint, jumps the calendar to the stay
        // and highlights it. A stay outside the ±3-year range still opens its
        // sheet; the calendar stays put and says so. Nothing typed here is
        // kept anywhere — no storage, no history (WD).
        var searchEl = root.querySelector('.mphbac-staff-q');
        var clearBtn = root.querySelector('.mphbac-staff-qclear');
        var resultsEl = root.querySelector('.mphbac-staff-results');
        var resultsList = resultsEl && resultsEl.querySelector('.mphbac-staff-results-list');
        var resultsCount = resultsEl && resultsEl.querySelector('.mphbac-staff-results-count');
        var SEARCH_DEBOUNCE_MS = 250;
        var searchT = 0, searchSeq = 0;

        function clearResults() {
            if (!resultsEl) return;
            resultsEl.hidden = true;
            resultsList.textContent = '';
            resultsCount.textContent = '';
        }

        function runSearch() {
            var q = (searchEl.value || '').trim();
            var seq = ++searchSeq;
            if (q.length < 2) { clearResults(); return; }
            post('mphbac_staff_search', { q: q }).then(function (json) {
                if (seq !== searchSeq) return;              // superseded by a later keystroke
                if (!json || !json.success || !json.data) { clearResults(); return; }
                drawResults(json.data.results || []);
            }).catch(function (err) {
                if (seq !== searchSeq) return;
                if (tokenReload(err)) return;
                clearResults();
                say(failureText(err), true);
            });
        }

        function drawResults(rows) {
            resultsList.textContent = '';
            resultsCount.textContent = !rows.length ? (S.srchNone || '')
                : rows.length === 1 ? (S.srchOne || '1') : (S.srchCount || '{n}').replace('{n}', String(rows.length));
            resultsCount.classList.toggle('is-none', !rows.length);
            rows.forEach(function (r) {
                var li = document.createElement('li');
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mphbac-staff-result is-src-' + sourceOf({ sourceKey: r.sourceKey });
                btn.setAttribute('data-booking-id', String(r.id));
                var line = function (cls, text) {
                    var e = document.createElement('span');
                    e.className = cls;
                    e.textContent = text;
                    btn.appendChild(e);
                    return e;
                };
                var head = line('mphbac-staff-result-name', '');
                var dot = document.createElement('span');
                dot.className = 'mphbac-staff-dot';
                dot.setAttribute('aria-hidden', 'true');
                head.appendChild(dot);
                head.appendChild(document.createTextNode(r.name || ('#' + r.id)));
                if (r.status && r.status !== 'confirmed' && r.statusLabel) {
                    var st = document.createElement('span');
                    st.className = 'mphbac-staff-result-status';
                    st.textContent = r.statusLabel;
                    head.appendChild(st);
                }
                var n = nightsBetween(r.checkin, r.checkout);
                var cot = (r.cottages || []).map(function (c) { return c.number ? '#' + c.number : (c.abbrev || c.title || ''); }).join(', ');
                line('mphbac-staff-result-meta', [cot, mediumDay(r.checkin) + ' → ' + mediumDay(r.checkout),
                    n + ' ' + (n === 1 ? (S.night || 'night') : (S.nights || 'nights')), r.sourceName || ''].filter(Boolean).join(' · '));
                line('mphbac-staff-result-why', r.why || '');
                btn.addEventListener('click', function () { openResult(r, btn); });
                li.appendChild(btn);
                resultsList.appendChild(li);
            });
            resultsEl.hidden = false;
        }

        function openResult(r, btn) {
            openDetail(r.id, btn);
            // Outside the ±3-year range: the sheet opens, the calendar stays.
            if (!r.checkin || !r.checkout || r.checkout <= CAP_LO || r.checkin > CAP_HI) {
                say(S.srchOutside || '');
                return;
            }
            state.anchor = r.checkin < CAP_LO ? CAP_LO : r.checkin;
            state.highlight = r.id;
            render();
        }

        // The stay the board jumped to, picked out for a few seconds.
        var highlightT = 0;
        function applyHighlight() {
            if (!state.highlight) return;
            var id = String(state.highlight);
            state.highlight = null;
            clearTimeout(highlightT);
            var els = [].filter.call(root.querySelectorAll('.mphbac-staff-bar, .mphbac-staff-item'), function (e) {
                return e.getAttribute('data-booking-id') === id;
            });
            els.forEach(function (e) { e.classList.add('is-found'); });
            highlightT = setTimeout(function () { els.forEach(function (e) { e.classList.remove('is-found'); }); }, 4000);
        }

        if (searchEl) {
            searchEl.addEventListener('input', function () {
                clearTimeout(searchT);
                searchT = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
            });
            searchEl.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closeSearch(false);
            });
            // Enter on a phone's keyboard fires `search` too; only an empty
            // field closes the results.
            searchEl.addEventListener('search', function () { if (!searchEl.value) { searchSeq++; clearResults(); } });
        }
        // Clear, close and cancel in one: the field emptied, the results
        // closed, a search in flight ignored (searchSeq) — one still waiting
        // on its debounce reads the emptied field and sends nothing — and,
        // from the ✕, the field let go of so a phone's keyboard goes down:
        // the page is back in one tap.
        function closeSearch(letGo) {
            searchEl.value = '';
            searchSeq++;
            clearResults();
            if (letGo) {
                searchEl.blur();
                if (document.activeElement === clearBtn) clearBtn.blur();
            }
        }
        if (searchEl && clearBtn) {
            // A press on the ✕ never takes focus from the field, as on iOS
            // (which never focuses a tapped button): letting go is then always
            // the click handler's blur(), the same on every device.
            clearBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
            clearBtn.addEventListener('click', function () { closeSearch(true); });
        }

        // ---- quick preview (0.44.0) -------------------------------------------
        // Hover on a computer, long-press on a phone: name, cottage, dates,
        // guests, source — from the data already on the board, with
        // textContent. A long-press must not ALSO open the sheet.
        var suppressClick = false;
        var previewTimer = 0;
        var previewFor = null;
        var previewMarker = document.createComment('mphbac-staff-preview');
        if (previewEl && !previewEl.id) previewEl.id = 'mphbac-staff-preview-' + Math.random().toString(36).slice(2, 9);
        var finePointer = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;

        function bindPreview(btn, b, cottage) {
            btn.addEventListener('mouseenter', function () {
                if (!finePointer || !finePointer.matches) return;
                clearTimeout(previewTimer);
                previewTimer = setTimeout(function () { showPreview(btn, b, cottage); }, HOVER_DELAY_MS);
            });
            btn.addEventListener('mouseleave', function () {
                clearTimeout(previewTimer);
                if (previewFor === btn) hidePreview();
            });
            var x0 = 0, y0 = 0;
            btn.addEventListener('touchstart', function (e) {
                suppressClick = false;
                if (!e.touches || e.touches.length !== 1) return;
                x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
                clearTimeout(previewTimer);
                previewTimer = setTimeout(function () {
                    suppressClick = true;
                    showPreview(btn, b, cottage);
                }, LONG_PRESS_MS);
            }, { passive: true });
            btn.addEventListener('touchmove', function (e) {
                var t = e.touches && e.touches[0];
                if (t && (Math.abs(t.clientX - x0) > 10 || Math.abs(t.clientY - y0) > 10)) clearTimeout(previewTimer);
            }, { passive: true });
            ['touchend', 'touchcancel'].forEach(function (ev) {
                btn.addEventListener(ev, function () { clearTimeout(previewTimer); }, { passive: true });
            });
            // The long-press's own menu / callout would cover the preview.
            btn.addEventListener('contextmenu', function (e) { if (suppressClick) e.preventDefault(); });
        }

        function showPreview(btn, b, cottage) {
            if (!previewEl) return;
            previewEl.textContent = '';
            var line = function (cls, text) {
                if (!text) return;
                var d = document.createElement('div');
                d.className = cls;
                d.textContent = text;
                previewEl.appendChild(d);
            };
            var n = nightsBetween(b.checkin, b.checkout);
            line('mphbac-staff-preview-name', b.guestName || ('#' + b.id));
            line('mphbac-staff-preview-line', (cottage && cottage.title) || '');
            line('mphbac-staff-preview-line', shortDate(b.checkin) + ' → ' + shortDate(b.checkout) + ' · '
                + n + ' ' + (n === 1 ? (S.night || 'night') : (S.nights || 'nights')));
            if (b.guests) line('mphbac-staff-preview-line', (S.guests || 'Guests') + ': ' + b.guests);
            line('mphbac-staff-preview-line', (S.source || 'Source') + ': ' + sourceName(b));
            if (facts(b).length) line('mphbac-staff-preview-line', facts(b).join(' · '));
            if (b.status && b.status !== 'confirmed' && b.statusLabel) line('mphbac-staff-preview-line', b.statusLabel);

            // ANCHORED TO THE BAR (0.44.1). On Rob's phone it showed at the top-
            // left of the screen: position: fixed measures from the nearest
            // ancestor with a transform — an Elementor wrapper — not from the
            // screen. The fix is the sheet's own: move it to <body> while
            // shown. Then: directly ABOVE the bar, centred on the part of the
            // bar on screen, kept inside the screen; below only when there is
            // no room above.
            if (previewEl.parentNode !== document.body) {
                previewEl.parentNode.insertBefore(previewMarker, previewEl);
                document.body.appendChild(previewEl);
            }
            previewEl.hidden = false;
            previewFor = btn;
            btn.setAttribute('aria-describedby', previewEl.id);
            var r = btn.getBoundingClientRect(), p = previewEl.getBoundingClientRect();
            var vw = document.documentElement.clientWidth || window.innerWidth;
            var vh = window.innerHeight;
            var visL = Math.max(r.left, 0), visR = Math.min(r.right, vw);
            var centre = visR > visL ? (visL + visR) / 2 : r.left + r.width / 2;
            var left = Math.max(8, Math.min(centre - p.width / 2, vw - p.width - 8));
            var top = r.top - p.height - 8;
            var below = top < 8;
            if (below) top = Math.min(r.bottom + 8, vh - p.height - 8);
            previewEl.classList.toggle('is-below', below);
            previewEl.style.top = Math.round(top) + 'px';
            previewEl.style.left = Math.round(left) + 'px';
        }

        function hidePreview() {
            if (!previewEl || previewEl.hidden) return;
            previewEl.hidden = true;
            previewEl.textContent = '';
            if (previewFor) previewFor.removeAttribute('aria-describedby');
            previewFor = null;
            // Back where it came from, so the shell stays self-contained.
            if (previewMarker.parentNode) {
                previewMarker.parentNode.insertBefore(previewEl, previewMarker);
                previewMarker.parentNode.removeChild(previewMarker);
            }
        }
        gridEl.addEventListener('scroll', hidePreview, { passive: true });
        window.addEventListener('scroll', hidePreview, { passive: true });
        document.addEventListener('touchstart', function (e) {
            if (previewFor && !previewFor.contains(e.target)) hidePreview();
        }, { passive: true, capture: true });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hidePreview(); });

        // ---- auto-refresh (0.44.0) --------------------------------------------
        // Every 3 minutes while the board is visible, keeping the period, the
        // scroll position and the Stats section — all in memory. SKIPPED ONLY while
        // a text field (the date picker) has focus or the sheet / preview is
        // open; NEVER merely because a button has focus — the Sync Watchdog
        // stopped refreshing for exactly that reason after one tap.
        var refreshT = 0;
        function busy() {
            var a = document.activeElement;
            if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT'
                && !/^(checkbox|radio|button|submit|reset)$/i.test(a.type || '')))) return true;
            if (!sheet.hidden) return true;
            if (previewEl && !previewEl.hidden) return true;
            return false;
        }
        // ONE TIMER, ALWAYS (0.47.2): every schedule replaces the one before.
        function scheduleRefresh(ms) {
            clearTimeout(refreshT);
            if (state.stopped) return;
            refreshT = setTimeout(tick, ms);
        }
        function stopRefresh() {
            state.stopped = true;
            clearTimeout(refreshT);
        }
        function tick() {
            if (state.stopped) return;
            if (document.visibilityState === 'hidden') return;      // resumes on return
            if (busy()) { scheduleRefresh(REFRESH_RETRY_MS); return; }
            // Never a second board request on top of one still on its way
            // (a slow answer, a navigation): the refresh waits, as it does
            // for a focused field.
            if (state.inFlight) { scheduleRefresh(REFRESH_RETRY_MS); return; }
            refresh();
        }
        function refresh() {
            // Emptying the cache is what makes this a refetch: every window
            // is then a miss, and today's month is fetched again for the tiles.
            state.cache = {};
            render({ keepScroll: true, quiet: true });
            if (statsEl && statsEl.open) renderStats({ quiet: true });
        }
        // A fetch that came back — worked, or (0.47.2) failed for a passing
        // reason: the next refresh is due 3 minutes from now. (Until 0.47.1
        // this also wrote "Updated hh:mm"; Rob had the line removed.)
        function markFetched() {
            state.lastRefresh = Date.now();
            scheduleRefresh(REFRESH_MS);
        }
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible' || !state.lastRefresh || state.stopped) return;
            var due = REFRESH_MS - (Date.now() - state.lastRefresh);
            if (due <= 0) tick(); else scheduleRefresh(due);
        });

        // ---- the expired token (0.44.0) ----------------------------------------
        // A WordPress nonce lasts 12–24 hours, so a board left open meets a 403
        // with "X-MPHBAC-Staff: nonce" every day. On THAT response only, reload
        // ONCE for a fresh nonce: the staff password cookie lasts 15 days, so
        // the board simply comes back. The guard is a timestamp in
        // sessionStorage — the only thing stored — and while it is under 10
        // minutes old a second 403 stops with the existing message instead:
        // never a loop. No storage, no reload. A 403 WITHOUT the nonce header
        // (the password itself expired) never reloads.
        //
        // The view comes back with it — period, date, scroll — in the
        // URL fragment, which is not storage and carries no guest data, and is
        // removed the moment it is read, so a reload the USER makes still opens
        // on Monthly.
        function tokenReload(err) {
            if (!err || !err.forbidden || !err.nonce) return false;
            try {
                var t = parseInt(window.sessionStorage.getItem(RELOAD_GUARD), 10);
                if (t && Date.now() - t < RELOAD_GUARD_MS) return false;
                window.sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
            } catch (e) { return false; }
            var v = { p: state.period, a: state.anchor, x: Math.round(gridEl.scrollLeft || 0),
                      y: Math.round(window.scrollY || 0) };
            try { window.history.replaceState(null, '', '#' + VIEW_HASH + encodeURIComponent(JSON.stringify(v))); } catch (e) { /* ignore */ }
            window.location.reload();
            return true;
        }
        function clearReloadGuard() {
            try { window.sessionStorage.removeItem(RELOAD_GUARD); } catch (e) { /* ignore */ }
        }
        function restoreView() {
            var h = window.location.hash || '';
            var i = h.indexOf(VIEW_HASH);
            if (i < 0) return null;
            var v = null;
            try { v = JSON.parse(decodeURIComponent(h.slice(i + VIEW_HASH.length))); } catch (e) { v = null; }
            try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
            if (!v || PERIODS.indexOf(v.p) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(v.a)) || v.a < CAP_LO || v.a > CAP_HI) return null;
            return { period: v.p, anchor: v.a, x: +v.x || 0, y: +v.y || 0 };
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
        // "Oct 12, 2026"; "Oct 1 – 31, 2026"; "Oct 12 – Nov 8, 2026";
        // "Dec 20, 2026 – Jan 16, 2027" — short months, the year once (Rob).
        function rangeLabel(from, to) {
            if (!to || to === from) return mediumDay(from);
            var y1 = from.slice(0, 4), y2 = to.slice(0, 4);
            if (y1 !== y2) return mediumDay(from) + ' – ' + mediumDay(to);
            if (from.slice(0, 7) === to.slice(0, 7)) return shortDate(from) + ' – ' + (+to.slice(8, 10)) + ', ' + y1;
            return shortDate(from) + ' – ' + shortDate(to) + ', ' + y1;
        }
        function mediumDay(s) {
            var d = new Date(s + 'T00:00:00');
            return shortDate(s) + ', ' + d.getFullYear();
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

        // ---- THE LISTS, DRAWN BY THE SITE (0.46.0; Rob, via the WD) --------------
        // An OPENED <select> is drawn by the operating system, out of reach of
        // CSS: on Rob's computer it opened off-centre to the right, on his
        // iPhone fully left-aligned. So Show, Timeframe, Month and Year open a
        // list the board draws itself, "dropping down under the field" on
        // phones and computers alike — the Custom Checkout's list, value for
        // value: a rounded white list, 2px #F4DA62 border, the field's radius
        // and type, items centred, rows ≥ 44px, the choice bold #0A50B2 on
        // #E7EEF7, scrolling within a maximum height, opened at the current
        // choice, upward when there is no room below.
        //
        // THE CLOSED FIELD IS STILL THE <select> (Rob: "the closed pickers are
        // fine"), untouched. A transparent button lies over it and takes the
        // taps and the keyboard; the <select> stays the SOURCE OF TRUTH — a
        // choice sets it and fires its real input and change events, so every
        // handler on the board is the one that was there before. Anything
        // that sets the <select> (a period change, the Stats pickers following
        // an arrow, a rebuilt Month list) shows in the button's name at once.
        //
        // The button: aria-haspopup="listbox", aria-expanded, named "Show
        // Monthly" from the field's label and its value. The list: role
        // listbox, aria-activedescendant, role="option" items with
        // aria-selected. Keys: arrows, Home / End, Enter / Space, Escape, Tab,
        // and type-ahead. Focus returns to the field on close. The <select>
        // leaves the tab order and the accessibility tree; it is not removed.
        // "Go to date" and the Stats dates open a calendar, not a list: native.
        var openPick = null;
        var VALUE = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
        function pickList(sel) {
            if (!sel || sel.getAttribute('data-picker') === '1') return;
            sel.setAttribute('data-picker', '1');
            var n = ++PICK_SEQ, id = 'mphbac-staff-pick-' + n;
            var label = sel.closest('label');
            var cap = label && label.querySelector('.mphbac-staff-field-label');
            var wrap = el('span', 'mphbac-staff-pickwrap');
            sel.parentNode.insertBefore(wrap, sel);
            var btn = el('button', 'mphbac-staff-pickbtn');
            btn.type = 'button';
            btn.id = id;
            var said = el('span', 'mphbac-sr-only');
            said.id = id + '-v';
            btn.appendChild(said);
            if (cap) {
                if (!cap.id) cap.id = id + '-l';
                btn.setAttribute('aria-labelledby', cap.id + ' ' + said.id);
            }
            btn.setAttribute('aria-haspopup', 'listbox');
            btn.setAttribute('aria-expanded', 'false');
            var list = el('ul', 'mphbac-staff-picklist');
            list.id = id + '-list';
            list.setAttribute('role', 'listbox');
            list.tabIndex = -1;
            list.hidden = true;
            if (cap) list.setAttribute('aria-labelledby', cap.id);
            btn.setAttribute('aria-controls', list.id);
            wrap.appendChild(btn);
            wrap.appendChild(sel);
            wrap.appendChild(list);
            sel.tabIndex = -1;
            sel.setAttribute('aria-hidden', 'true');

            var active = -1, typed = '', typedT = 0;
            var sync = function () {
                var o = sel.options[sel.selectedIndex];
                said.textContent = o ? o.textContent : '';
            };
            // Every way the <select> changes reaches the button: a script
            // setting .value (the board does, a lot), a real change, and a
            // list rebuilt or re-selected.
            if (VALUE && VALUE.set) {
                Object.defineProperty(sel, 'value', {
                    configurable: true,
                    get: function () { return VALUE.get.call(this); },
                    set: function (v) { VALUE.set.call(this, v); sync(); }
                });
            }
            sel.addEventListener('change', sync);
            if (window.MutationObserver) new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true });
            sync();

            function setActive(i, centre) {
                var items = list.children;
                if (!items.length) return;
                i = Math.max(0, Math.min(items.length - 1, i));
                if (items[active]) items[active].classList.remove('is-active');
                active = i;
                var li = items[i];
                li.classList.add('is-active');
                list.setAttribute('aria-activedescendant', li.id);
                if (centre) {
                    list.scrollTop = Math.max(0, li.offsetTop - (list.clientHeight - li.offsetHeight) / 2);
                } else if (li.offsetTop < list.scrollTop) {
                    list.scrollTop = li.offsetTop;
                } else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) {
                    list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
                }
            }
            // Under the field; above it when the screen has no room below and
            // more above. The list scrolls inside whatever height it is given.
            function place() {
                wrap.classList.remove('is-up');
                list.style.maxHeight = '';
                var r = wrap.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
                var below = vh - r.bottom - 12, above = r.top - 12;
                var want = Math.min(list.scrollHeight, parseFloat(getComputedStyle(list).maxHeight) || 320);
                var up = below < want && above > below;
                if (up) wrap.classList.add('is-up');
                list.style.maxHeight = Math.max(132, Math.min(want, up ? above : below)) + 'px';
            }
            function open() {
                if (openPick && openPick.wrap !== wrap) openPick.close(false);
                var c = getComputedStyle(sel);
                list.style.fontFamily = c.fontFamily;
                list.style.fontSize = Math.max(16, parseFloat(c.fontSize) || 18) + 'px';
                list.textContent = '';
                [].forEach.call(sel.options, function (o, i) {
                    var li = el('li', 'mphbac-staff-pickopt' + (o.selected ? ' is-selected' : ''), o.textContent);
                    li.id = list.id + '-' + i;
                    li.setAttribute('role', 'option');
                    li.setAttribute('aria-selected', o.selected ? 'true' : 'false');
                    li.setAttribute('data-i', String(i));
                    list.appendChild(li);
                });
                list.hidden = false;
                btn.setAttribute('aria-expanded', 'true');
                openPick = api;
                active = -1;
                place();
                setActive(Math.max(0, sel.selectedIndex), true);
                try { list.focus({ preventScroll: true }); } catch (e) { list.focus(); }
            }
            function close(refocus) {
                if (list.hidden) return;
                list.hidden = true;
                btn.setAttribute('aria-expanded', 'false');
                list.removeAttribute('aria-activedescendant');
                if (openPick === api) openPick = null;
                if (refocus) { try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); } }
            }
            function choose(i) {
                var o = sel.options[i];
                close(true);
                if (!o || o.selected) return;
                sel.value = o.value;
                sel.dispatchEvent(new Event('input', { bubbles: true }));
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            var api = { wrap: wrap, close: close };

            btn.addEventListener('click', function () { if (list.hidden) open(); else close(true); });
            btn.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
            });
            list.addEventListener('click', function (e) {
                var li = e.target.closest ? e.target.closest('.mphbac-staff-pickopt') : null;
                if (li) choose(parseInt(li.getAttribute('data-i'), 10));
            });
            list.addEventListener('keydown', function (e) {
                var k = e.key, last = list.children.length - 1;
                if (k === 'ArrowDown') setActive(active + 1);
                else if (k === 'ArrowUp') setActive(active - 1);
                else if (k === 'Home') setActive(0);
                else if (k === 'End') setActive(last);
                else if (k === 'PageDown') setActive(active + 5);
                else if (k === 'PageUp') setActive(active - 5);
                else if (k === 'Enter' || k === ' ') choose(active);
                else if (k === 'Escape') { close(true); e.stopPropagation(); }
                else if (k === 'Tab') { close(false); return; }
                else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    // Type-ahead: the letters typed in the last moment, from
                    // the next option on ("o" again moves to the next "Oct").
                    clearTimeout(typedT);
                    typed += k.toLowerCase();
                    typedT = setTimeout(function () { typed = ''; }, 700);
                    var items = list.children, from = typed.length === 1 ? active + 1 : active;
                    for (var j = 0; j <= last; j++) {
                        var x = (from + j) % (last + 1);
                        if (items[x].textContent.toLowerCase().indexOf(typed) === 0) { setActive(x); break; }
                    }
                } else return;
                e.preventDefault();
            });
            list.addEventListener('focusout', function (e) {
                if (!list.hidden && e.relatedTarget && !wrap.contains(e.relatedTarget)) close(false);
            });
            // The field's label: a tap on its words focuses the field, and a
            // tap inside the list is the list's alone — neither may "click" the
            // label's control a second time.
            if (label) label.addEventListener('click', function (e) {
                if (btn.contains(e.target)) return;
                e.preventDefault();
                if (!list.contains(e.target)) btn.focus();
            });
        }
        document.addEventListener('pointerdown', function (e) {
            if (openPick && !openPick.wrap.contains(e.target)) openPick.close(false);
        }, true);
        [periodSel, statsSpan, statsMonth, statsYear].forEach(pickList);

        // Monthly on every load, every device (Rob, 0.43.3) — and the old
        // remembered choice is removed so it cannot come back.
        forgetOldPeriod();
        var back = restoreView();
        if (back) {
            state.anchor = back.anchor;
            state.restoreScroll = { x: back.x, y: back.y };
            setPeriod(back.period);
        } else {
            setPeriod('month');
        }
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
