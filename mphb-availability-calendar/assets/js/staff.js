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
        var updatedEl = root.querySelector('.mphbac-staff-updated');
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
            lastRefresh: 0
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
            post('mphbac_staff_month', { from: from, to: to }).then(function (json) {
                if (seq !== state.req) return;              // superseded
                if (!json || !json.success || !json.data) { say(S.error, true); return; }
                state.cache[from + '|' + to] = json.data;
                say('');
                markUpdated();
                cb(json.data);
            }).catch(function (err) {
                if (seq !== state.req) return;
                if (tokenReload(err)) return;
                say(failureText(err), true);
            }).then(function () {
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

        function renderTitle(w) {
            titleEl.textContent = '';
            var p = state.period;
            if (p === 'day') {
                // The date alone (Rob, 0.43.3): the month/year line that sat
                // under it is gone in Daily. Phones get the short form
                // ("Sat, Oct 10, 2026") so it stays on one line.
                var day = state.anchor;
                titleEl.textContent = (mq && mq.matches) ? mediumDate(day) : longDate(day);
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
            gridEl.textContent = '';
            var shown = (data.bookings || []).slice();
            var turns = turnovers(shown);

            var period = state.period;
            var days = daysBetween(w.from, w.to);
            var N = days.length;
            if (!N) return;
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
            var barFont = getComputedStyle(gridEl).fontFamily || 'sans-serif';
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

            gridEl.appendChild(chart);
            measureBars(chart);

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
                name: nights >= 4 ? who : (nights <= 1 ? initials(who) : shortName(who)),
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
            var text = fits(f.name) ? f.name : (fits(f.count) ? f.count : '');
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
            agendaEl.textContent = '';
            var day = state.anchor;
            var groups = dayGroups(data.bookings || [], day);

            agendaEl.appendChild(turnGroup(groups.turn));
            agendaEl.appendChild(group('in', S.arrivals || 'Arriving', groups['in'], S.noArrivals || ''));
            agendaEl.appendChild(group('out', S.departures || 'Departing', groups['out'], S.noDepartures || ''));
            agendaEl.appendChild(group('stay', S.inHouse || 'In house', groups['stay'], S.noInHouse || ''));
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
                if (tokenReload(err)) return;
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
        var statsSpan = statsEl && statsEl.querySelector('.mphbac-staff-stats-span');
        var statsDate = statsEl && statsEl.querySelector('.mphbac-staff-stats-date');
        var statsFrom = statsEl && statsEl.querySelector('.mphbac-staff-stats-from');
        var statsTo   = statsEl && statsEl.querySelector('.mphbac-staff-stats-to');
        var statsNote = statsEl && statsEl.querySelector('.mphbac-staff-stats-note');
        var statsOut  = statsEl && statsEl.querySelector('.mphbac-staff-stats-out');
        var STATS_MAX_DAYS = 400;

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
                var d = /^\d{4}-\d{2}-\d{2}$/.test(statsDate.value) ? statsDate.value : config.today;
                w = windowOf(d, span === 'day' ? 'day' : span);
            }
            if (w.to < CAP_LO || w.from > CAP_HI) return { bad: true };
            if (w.from < CAP_LO || w.to > CAP_HI) {
                w = { from: w.from < CAP_LO ? CAP_LO : w.from, to: w.to > CAP_HI ? CAP_HI : w.to };
                notes.push('clamped');
            }
            w.span = span;
            w.notes = notes;
            return w;
        }

        function statsSay(text) {
            statsNote.textContent = text || '';
            statsNote.hidden = !text;
        }

        function renderStats() {
            if (!statsEl || !statsOut) return;
            var custom = statsSpan.value === 'custom';
            [].forEach.call(statsEl.querySelectorAll('.mphbac-staff-stats-custom'), function (el) { el.hidden = !custom; });
            [].forEach.call(statsEl.querySelectorAll('.mphbac-staff-stats-on'), function (el) { el.hidden = custom; });
            var w = statsWindow();
            if (w.bad) { statsOut.textContent = ''; statsSay(S.stBadRange || ''); return; }
            var notes = [];
            if (w.notes.indexOf('capped') >= 0) notes.push((S.stCapped || '').replace('{from}', mediumDay(w.from)).replace('{to}', mediumDay(w.to)));
            if (w.notes.indexOf('clamped') >= 0) notes.push((S.stClamped || '').replace('{from}', mediumDay(w.from)).replace('{to}', mediumDay(w.to)));
            statsSay(notes.join(' '));
            var seq = ++state.statsReq;
            var hit = cachedCovering(w.from, w.to);
            var draw = function (data) { if (seq === state.statsReq) drawStats(data, w); };
            if (hit) { draw(hit); return; }
            statsOut.textContent = S.loading || 'Loading…';
            post('mphbac_staff_month', { from: w.from, to: w.to }).then(function (json) {
                if (seq !== state.statsReq) return;
                if (!json || !json.success || !json.data) { statsOut.textContent = S.error || ''; return; }
                state.cache[w.from + '|' + w.to] = json.data;
                draw(json.data);
            }).catch(function (err) {
                if (seq !== state.statsReq) return;
                if (tokenReload(err)) return;
                statsOut.textContent = failureText(err);
            });
        }

        function statsNumbers(data, w) {
            var nights = daysBetween(w.from, w.to);
            var bookings = (data.bookings || []).filter(function (b) { return b.checkin && b.checkout; })
                .sort(function (a, b) { return a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : a.id - b.id; });
            var owner = {}, perCottage = {}, bySource = { direct: 0, airbnb: 0, booking: 0, vrbo: 0 }, booked = 0;
            bookings.forEach(function (b) {
                (b.cottages || []).forEach(function (c) {
                    nights.forEach(function (d) {
                        var k = c.roomTypeId + '|' + d;
                        if (d >= b.checkin && d < b.checkout && !owner[k]) {
                            owner[k] = b;
                            booked++;
                            perCottage[c.roomTypeId] = (perCottage[c.roomTypeId] || 0) + 1;
                            bySource[sourceOf(b)]++;
                        }
                    });
                });
            });
            var inRange = function (d) { return d >= w.from && d <= w.to; };
            var staying = bookings.filter(function (b) { return b.checkin <= w.to && b.checkout > w.from; });
            var turns = 0, t = turnovers(bookings);
            Object.keys(t).forEach(function (typeId) { Object.keys(t[typeId]).forEach(function (d) { if (inRange(d)) turns++; }); });
            var cots = data.cottages || [];
            return {
                nights: nights.length,
                cottages: cots,
                booked: booked,
                pct: cots.length && nights.length ? Math.round(100 * booked / (cots.length * nights.length)) : null,
                arrivals: bookings.filter(function (b) { return inRange(b.checkin); }).length,
                departures: bookings.filter(function (b) { return inRange(b.checkout); }).length,
                turnovers: turns,
                inHouse: w.span === 'day' ? dayGroups(bookings, w.from).stay.length : null,
                pets: staying.filter(function (b) { return b.pets; }).length,
                couch: staying.filter(function (b) { return b.couch; }).length,
                boat: staying.filter(function (b) { return b.boat; }).length,
                perCottage: perCottage,
                bySource: bySource
            };
        }

        function drawStats(data, w) {
            var n = statsNumbers(data, w);
            statsOut.textContent = '';
            var el = function (tag, cls, text) {
                var e = document.createElement(tag);
                if (cls) e.className = cls;
                if (text !== undefined) e.textContent = text;
                return e;
            };
            statsOut.appendChild(el('p', 'mphbac-staff-stats-range', w.from === w.to ? mediumDay(w.from) : mediumDay(w.from) + ' – ' + mediumDay(w.to)));

            var grid = el('dl', 'mphbac-staff-stats-kpis');
            var kpi = function (key, label, value, tip) {
                var box = el('div', 'mphbac-staff-kpi is-' + key);
                box.appendChild(el('dt', 'mphbac-staff-kpi-label', label || ''));
                box.appendChild(el('dd', 'mphbac-staff-kpi-num', String(value)));
                if (tip) box.title = tip;
                grid.appendChild(box);
            };
            kpi('booked', S.stBooked, n.pct === null ? '—' : n.pct + '%', S.stBookedTip);
            kpi('arrivals', S.stArrivals, n.arrivals);
            kpi('departures', S.stDepartures, n.departures);
            kpi('turnovers', S.stTurnovers, n.turnovers);
            if (n.inHouse !== null) kpi('inhouse', S.stInHouse, n.inHouse);
            kpi('pets', S.stWithPets, n.pets);
            kpi('couch', S.stWithCouch, n.couch);
            kpi('boat', S.stWithBoat, n.boat);
            statsOut.appendChild(grid);

            // Nights booked per cottage: a short horizontal bar each.
            var per = el('section', 'mphbac-staff-stats-block');
            per.appendChild(el('h3', 'mphbac-staff-stats-h', S.stPerCottage || ''));
            var list = el('ul', 'mphbac-staff-percot');
            n.cottages.forEach(function (c) {
                var v = n.perCottage[c.id] || 0;
                var li = el('li', 'mphbac-staff-percot-row');
                li.appendChild(el('span', 'mphbac-staff-percot-name', (c.number ? '#' + c.number + ' ' : '') + (c.abbrev || c.title || '')));
                var track = el('span', 'mphbac-staff-percot-track');
                var fill = el('span', 'mphbac-staff-percot-fill');
                fill.style.width = (n.nights ? Math.round(1000 * v / n.nights) / 10 : 0) + '%';
                track.appendChild(fill);
                li.appendChild(track);
                li.appendChild(el('span', 'mphbac-staff-percot-num', (v === 1 ? (S.stNight || '{n} night') : (S.stNights || '{n} nights')).replace('{n}', String(v))));
                list.appendChild(li);
            });
            per.appendChild(list);
            statsOut.appendChild(per);

            // Share of NIGHTS booked by source (Rob: nights, not bookings): an
            // inline SVG pie in the source colours, and the same numbers as
            // plain text for anyone not looking at the picture.
            var src = el('section', 'mphbac-staff-stats-block');
            src.appendChild(el('h3', 'mphbac-staff-stats-h', S.stBySource || ''));
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
                    li.appendChild(document.createTextNode(sourceName({ sourceKey: k }) + ' — ' + pctOf(v, n.booked) + '% ('
                        + (v === 1 ? (S.stNight || '{n} night') : (S.stNights || '{n} nights')).replace('{n}', String(v)) + ')'));
                    ul.appendChild(li);
                });
                wrap.appendChild(ul);
                src.appendChild(wrap);
            }
            statsOut.appendChild(src);
        }

        function pctOf(v, total) { return Math.round(100 * v / total); }

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
                // labelled in the list beside the pie only.
                if (frac >= 0.08) {
                    var mid = (at + end) / 2, lr = frac >= 0.9999 ? 0 : R * 0.62;
                    var t = document.createElementNS(NS, 'text');
                    t.setAttribute('x', (C + lr * Math.cos(mid)).toFixed(2));
                    t.setAttribute('y', (C + lr * Math.sin(mid)).toFixed(2));
                    t.setAttribute('class', 'mphbac-staff-pie-label');
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
            if (statsDate) statsDate.value = config.today;
            if (statsFrom) statsFrom.value = windowOf(config.today, 'month').from;
            if (statsTo) statsTo.value = windowOf(config.today, 'month').to;
            [statsDate, statsFrom, statsTo].forEach(function (i) { if (i) { i.min = CAP_LO; i.max = CAP_HI; } });
            statsEl.addEventListener('toggle', function () { if (statsEl.open) renderStats(); });
            [statsSpan, statsDate, statsFrom, statsTo].forEach(function (i) {
                if (i) i.addEventListener('change', function () { if (statsEl.open) renderStats(); });
            });
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
        function scheduleRefresh(ms) {
            clearTimeout(refreshT);
            refreshT = setTimeout(tick, ms);
        }
        function tick() {
            if (document.visibilityState === 'hidden') return;      // resumes on return
            if (busy()) { scheduleRefresh(REFRESH_RETRY_MS); return; }
            refresh();
        }
        function refresh() {
            // Emptying the cache is what makes this a refetch: every window
            // is then a miss, and today's month is fetched again for the tiles.
            state.cache = {};
            render({ keepScroll: true, quiet: true });
            if (statsEl && statsEl.open) renderStats();
        }
        function markUpdated() {
            state.lastRefresh = Date.now();
            scheduleRefresh(REFRESH_MS);
            if (!updatedEl) return;
            var d = new Date();
            updatedEl.textContent = (S.updated || 'Updated {time}').replace('{time}', pad(d.getHours()) + ':' + pad(d.getMinutes()));
        }
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible' || !state.lastRefresh) return;
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
