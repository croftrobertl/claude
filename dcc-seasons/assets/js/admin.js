/* DCC Seasons — the settings page (4.18.0, Admin UI round 1).
 *
 * Everything here is a layer over the SAME form fields the page has always
 * posted: the year ribbon and its side sheet edit the schedule rows' own
 * inputs, the chips are the Show On checkboxes, the sliders and steppers are
 * the old number fields. So a save posts exactly what the old page posted
 * and the stored option keeps its shape (tools/test-admin.js proves it).
 * Dependency-free; admin only. */
(function () {
	'use strict';
	var D = document, W = window, CFG = W.DCCSeasonsAdmin || {};
	var S = CFG.strings || {};
	var MONTHS = CFG.months || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	var reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
	function $(sel, root) { return (root || D).querySelector(sel); }
	function $$(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }
	function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

	/* ---------------------------------------------------------------
	 * Toasts: the save's purge notice, and short confirmations.
	 * ------------------------------------------------------------- */
	var toasts = D.getElementById('dcc-toasts');
	function toast(msg, sticky, kind) {
		if (!toasts) { return; }
		var t = D.createElement('div');
		t.className = 'dcc-toast' + (kind ? ' dcc-toast-' + kind : '');
		var p = D.createElement('p'); p.textContent = msg; t.appendChild(p);
		var x = D.createElement('button'); x.type = 'button'; x.className = 'dcc-x';
		x.innerHTML = '<span aria-hidden="true">×</span><span class="screen-reader-text">Close</span>';
		x.addEventListener('click', function () { t.remove(); });
		t.appendChild(x);
		toasts.appendChild(t);
		if (!sticky) { setTimeout(function () { t.remove(); }, 8000); }
		return t;
	}
	$$('.dcc-toast-src').forEach(function (n) {
		toast(n.textContent.trim(), n.getAttribute('data-sticky') === '1', n.classList.contains('notice-warning') ? 'warn' : 'ok');
		n.remove();
	});

	/* ---------------------------------------------------------------
	 * ⓘ popovers. Fixed-positioned and clamped into the window, so
	 * opening one never moves the layout or scrolls the page sideways.
	 * ------------------------------------------------------------- */
	var openPop = null;
	function closePop(focus) {
		if (!openPop) { return; }
		openPop.pop.hidden = true;
		openPop.btn.setAttribute('aria-expanded', 'false');
		if (focus) { openPop.btn.focus(); }
		openPop = null;
	}
	function placePop(btn, pop) {
		var r = btn.getBoundingClientRect(), vw = D.documentElement.clientWidth, w = Math.min(380, vw - 24);
		pop.style.width = w + 'px';
		var left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, vw - w - 12));
		pop.style.left = left + 'px';
		var top = r.bottom + 8, h = pop.offsetHeight;
		if (top + h > W.innerHeight - 8 && r.top - h - 8 > 8) { top = r.top - h - 8; }
		pop.style.top = top + 'px';
	}
	D.addEventListener('click', function (e) {
		var btn = e.target.closest ? e.target.closest('.dcc-i') : null;
		if (btn) {
			var pop = D.getElementById(btn.getAttribute('aria-controls'));
			if (!pop) { return; }
			e.preventDefault();
			var was = openPop && openPop.btn === btn;
			closePop(false);
			if (was) { return; }
			pop.hidden = false;
			btn.setAttribute('aria-expanded', 'true');
			placePop(btn, pop);
			openPop = { btn: btn, pop: pop };
			return;
		}
		if (openPop && !openPop.pop.contains(e.target)) { closePop(false); }
	});
	D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openPop) { closePop(true); e.stopPropagation(); } }, true);
	W.addEventListener('resize', function () { closePop(false); });
	W.addEventListener('scroll', function () { closePop(false); }, true);

	var form = D.getElementById('dcc-seasons-form');
	if (!form) { return; }

	/* ---------------------------------------------------------------
	 * Sliders (live value) and steppers (− / +).
	 * ------------------------------------------------------------- */
	function syncOutputs() {
		$$('input[type="range"][data-dcc-output]', form).forEach(function (el) {
			var out = D.getElementById(el.getAttribute('data-dcc-output'));
			if (out) { out.textContent = el.value; }
		});
	}
	form.addEventListener('input', function (e) { if (e.target.type === 'range') { syncOutputs(); } });
	form.addEventListener('click', function (e) {
		var b = e.target.closest ? e.target.closest('.dcc-step') : null;
		if (!b) { return; }
		var inp = D.getElementById(b.getAttribute('aria-controls'));
		if (!inp) { return; }
		var v = (parseInt(inp.value, 10) || 0) + (+b.getAttribute('data-step'));
		v = Math.max(+inp.min, Math.min(+inp.max, v));
		inp.value = String(v);
		fire(inp, 'input'); fire(inp, 'change');
	});

	/* ---------------------------------------------------------------
	 * Tabs: the four panels share one form, so switching never loses an
	 * unsaved change. The URL and the save's return address follow.
	 * ------------------------------------------------------------- */
	var referer = form.querySelector('input[name="_wp_http_referer"]');
	function showPanel(name, push) {
		var panel = D.getElementById('dcc-panel-' + name);
		if (!panel) { return false; }
		$$('.dcc-panel', form).forEach(function (p) { p.hidden = p !== panel; });
		$$('.dcc-tab').forEach(function (a) {
			var on = a.getAttribute('data-panel') === name;
			a.classList.toggle('nav-tab-active', on);
			if (on) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
		});
		if (push && W.history && history.replaceState) {
			try {
				var u = new URL(location.href);
				if (name === 'schedule') { u.searchParams.delete('tab'); } else { u.searchParams.set('tab', name); }
				u.hash = '';
				history.replaceState(null, '', u.pathname + u.search);
			} catch (err) { /* an address the page cannot rewrite: the tab still switches */ }
		}
		if (referer) { referer.value = location.pathname + location.search; }
		if (name === 'schedule') { render(); }
		return true;
	}
	$$('.dcc-tab[data-panel]').forEach(function (a) {
		a.addEventListener('click', function (e) {
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) { return; }
			e.preventDefault();
			showPanel(a.getAttribute('data-panel'), true);
		});
	});

	/* ---------------------------------------------------------------
	 * The schedule resolver: class-schedule.php's resolve() and
	 * resolve_row(), as ambient.js carries them. The ribbon draws from
	 * these, and tools/test-admin.js holds them to the PHP table.
	 * ------------------------------------------------------------- */
	var ANCH = CFG.anchors || {};
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
	function easter(y) {
		var a = y % 19, b = (y / 100) | 0, c = y % 100, d = (b / 4) | 0, e = b % 4;
		var f = ((b + 8) / 25) | 0, g = ((b - f + 1) / 3) | 0, h = (19 * a + b - d - g + 15) % 30;
		var i2 = (c / 4) | 0, k = c % 4, l = (32 + 2 * e + 2 * i2 - h - k) % 7;
		var m = ((a + 11 * h + 22 * l) / 451) | 0, mo = ((h + l - 7 * m + 114) / 31) | 0;
		return [mo, ((h + l - 7 * m + 114) % 31) + 1];
	}
	function nthWeekday(y, m, wd, n) {
		if (n > 0) { return 1 + ((wd - new Date(y, m - 1, 1).getDay() + 7) % 7) + (n - 1) * 7; }
		var days = new Date(y, m, 0).getDate();
		return days - ((new Date(y, m - 1, days).getDay() - wd + 7) % 7);
	}
	function resolve(rule, y) {
		if (!rule) { return null; }
		var on = rule.on || 'fixed', off = rule.off | 0, m, d, a;
		if (on === 'fixed') {
			m = rule.m | 0; d = rule.d | 0;
			if (m < 1 || m > 12 || d < 1 || d > 31) { return null; }
			d = Math.min(d, new Date(y, m, 0).getDate());
		} else {
			a = ANCH[on];
			if (!a) { return null; }
			if (a.type === 'fixed') { m = a.m; d = a.d; }
			else if (a.type === 'nth') { m = a.m; d = nthWeekday(y, m, a.wd, a.n); }
			else { var ed = easter(y); m = ed[0]; d = ed[1]; off += a.off | 0; }
		}
		var dt = new Date(y, m - 1, d + off);
		return ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
	}
	function resolveRow(r, y) {
		if (r.year && r.year !== y) { return null; }
		var s = resolve(r.start, y), e = resolve(r.end, y);
		if (!s || !e) { return null; }
		if (e < s) { e = resolve(r.end, y + 1); }
		return [s, e];
	}
	function dn(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
	function fromDn(n) { var d = new Date(n * 864e5); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
	function mj(s) { var p = s.split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]); }
	/* Exactly the old table's cell: 'M j – M j, Y'. */
	function rangeText(rr) { return rr ? mj(rr[0]) + ' – ' + mj(rr[1]) + ', ' + rr[1].slice(0, 4) : (S.none || '—'); }
	function describe(rule) {
		var off = rule.off | 0, base;
		if (rule.on === 'fixed') { base = MONTHS[rule.m - 1] + ' ' + rule.d; }
		else { base = ANCH[rule.on] ? ANCH[rule.on].short : rule.on; }
		return off ? base + ' ' + (off > 0 ? '+' : '') + off + ' days' : base;
	}
	function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '±0'; }

	/* ---------------------------------------------------------------
	 * Rows: read from (and written to) each row's own inputs, as the
	 * server will sanitize them (Schedule::sanitize_row).
	 * ------------------------------------------------------------- */
	var rowsBox = D.getElementById('dcc-rows');
	var tpl = D.getElementById('dcc-seasons-row-template');
	var ribbon = D.getElementById('dcc-seasons-schedule');
	function ruleEls(el, which) {
		var fs = el.querySelector('.dcc-rule-fs[data-end="' + which + '"]');
		return { on: fs.querySelector('.dcc-seasons-on'), m: fs.querySelector('.dcc-m'), d: fs.querySelector('.dcc-d'), off: fs.querySelector('.dcc-seasons-off') };
	}
	function readRule(el, which) {
		var r = ruleEls(el, which), on = r.on.value;
		var off = Math.max(-60, Math.min(60, parseInt(r.off.value, 10) || 0));
		return on === 'fixed' ? { on: 'fixed', m: +r.m.value, d: +r.d.value, off: off } : { on: on, off: off };
	}
	function readRow(el) {
		var y = parseInt(el.querySelector('.dcc-r-year').value, 10) || 0;
		if (y && (y < 2000 || y > 2100)) { y = 0; }
		return {
			key: el.getAttribute('data-row'), el: el,
			theme: el.querySelector('.dcc-r-theme').value,
			label: el.querySelector('.dcc-r-label').value.trim(),
			start: readRule(el, 'start'), end: readRule(el, 'end'), year: y
		};
	}
	function rowEls() { return $$('.dcc-row', form).filter(function (el) { return !el.closest('template'); }); }
	function rowsInOrder() {
		/* DOM order of the rows box, with a row out in the sheet counted at
		 * its placeholder: the order is what the save posts. */
		var out = [];
		Array.prototype.forEach.call(rowsBox.childNodes, function (n) {
			if (n.nodeType === 1 && n.classList.contains('dcc-row')) { out.push(n); }
			else if (n.nodeType === 8 && sheetRow && n === sheetMark) { out.push(sheetRow); }
		});
		return out.map(readRow);
	}
	function themeOf(t) { return (CFG.themes || {})[t] || { label: t, color: '#565E6B' }; }
	function rowName(r) { return r.label || themeOf(r.theme).label; }

	/* ---------------------------------------------------------------
	 * The year ribbon (Rob's pick 1).
	 * ------------------------------------------------------------- */
	var years = CFG.years || [new Date().getFullYear(), new Date().getFullYear() + 1];
	var curYear = years[0];
	var phoneMq = W.matchMedia ? W.matchMedia('(max-width: 600px)') : null;
	var PILL = 3; /* a span of 3 days or fewer is a holiday pill above the seasons */
	function model(Y) {
		var base = dn(Y + '-01-01'), N = dn((Y + 1) + '-01-01') - base, rows = rowsInOrder(), segs = [];
		rows.forEach(function (r, i) {
			[Y - 1, Y].forEach(function (yy) {
				var rr = resolveRow(r, yy);
				if (!rr) { return; }
				var s0 = dn(rr[0]) - base, e0 = dn(rr[1]) - base;
				if (e0 < 0 || s0 > N - 1) { return; }
				segs.push({ r: r, i: i, yy: yy, rr: rr, s0: s0, e0: e0, s: Math.max(0, s0), e: Math.min(N - 1, e0), span: e0 - s0 + 1 });
			});
		});
		return { Y: Y, base: base, N: N, segs: segs, rows: rows };
	}
	function lanes(M, pxPerDay) {
		var minDays = Math.max(1, Math.ceil(22 / Math.max(pxPerDay, 0.01)));
		var pills = M.segs.filter(function (g) { return g.span <= PILL; });
		var bands = M.segs.filter(function (g) { return g.span > PILL; });
		function pack(list, ext) {
			var L = [];
			list.forEach(function (g) {
				var a = g.s, b = Math.max(g.e, g.s + ext - 1), k = 0;
				while (L[k] && L[k].some(function (x) { return !(b < x[0] || a > x[1]); })) { k++; }
				(L[k] = L[k] || []).push([a, b]);
				g.lane = k;
			});
			return L.length;
		}
		bands.sort(function (a, b) { return (b.span - a.span) || (a.i - b.i); });
		pills.sort(function (a, b) { return (a.s - b.s) || (a.i - b.i); });
		pills.forEach(function (g) { g.pill = true; });
		return { nb: pack(bands, 1), np: pack(pills, minDays), minDays: minDays };
	}
	function bandLabel(g) {
		var t = themeOf(g.r.theme);
		var only = g.r.year ? ' ' + (S.only || '(%d only)').replace('%d', g.r.year) : '';
		return rowName(g.r) + (g.r.label && g.r.label !== t.label ? ' (' + t.label + ')' : '') + only + ': ' + rangeText(g.rr) + '. ' + describe(g.r.start) + ' → ' + describe(g.r.end);
	}
	function bandEl(g, style, phone) {
		var b = D.createElement('button');
		b.type = 'button';
		b.className = 'dcc-band' + (g.pill ? ' is-pill' : '') + (g.s0 < g.s ? ' clip-l' : '') + (g.e0 > g.e ? ' clip-r' : '') + (g.span === 1 ? ' is-dot' : '');
		b.setAttribute('data-row', g.r.key);
		b.setAttribute('data-yy', String(g.yy));
		b.setAttribute('data-range', rangeText(g.rr));
		b.setAttribute('data-key', 'b:' + g.r.key + ':' + g.yy);
		b.setAttribute('data-s', String(g.s)); b.setAttribute('data-e', String(g.e));
		b.setAttribute('aria-label', bandLabel(g));
		b.title = bandLabel(g);
		b.tabIndex = -1;
		b.style.cssText = style + ';--c:' + themeOf(g.r.theme).color;
		var t = D.createElement('span'); t.className = 'dcc-band-t'; t.textContent = g.pill ? '' : rowName(g.r);
		b.appendChild(t);
		return b;
	}
	function handleEl(g, which, leftPct, M) {
		var h = D.createElement('span');
		h.className = 'dcc-hdl dcc-hdl-' + which;
		h.setAttribute('role', 'slider');
		h.tabIndex = -1;
		h.setAttribute('data-row', g.r.key); h.setAttribute('data-yy', String(g.yy)); h.setAttribute('data-which', which);
		h.setAttribute('data-key', 'h:' + g.r.key + ':' + g.yy + ':' + which);
		var day = which === 'start' ? g.s0 : g.e0;
		h.setAttribute('aria-valuemin', '0'); h.setAttribute('aria-valuemax', String(M.N - 1)); h.setAttribute('aria-valuenow', String(day));
		h.setAttribute('aria-valuetext', tipText(g.r, which, fromDn(M.base + day)));
		h.setAttribute('aria-label', rowName(g.r) + ' ' + (which === 'start' ? (S.starts || 'starts') : (S.ends || 'ends')));
		h.title = S.drag || '';
		h.style.left = leftPct + '%';
		return h;
	}
	function tipText(r, which, date) {
		var rule = which === 'start' ? r.start : r.end;
		if (rule.on === 'fixed') { return mj(date); }
		return (S.offset || '%1$s %2$s d').replace('%1$s', ANCH[rule.on] ? ANCH[rule.on].short : rule.on).replace('%2$s', signed(rule.off)) + ' · ' + mj(date);
	}

	var lastFocusKey = null;
	function render() {
		/* drawn only while the Schedule tab shows: a hidden ribbon has no width */
		if (!ribbon || D.getElementById('dcc-panel-schedule').hidden) { return; }
		var focusKey = D.activeElement && D.activeElement.getAttribute && D.activeElement.getAttribute('data-key');
		if (focusKey) { lastFocusKey = focusKey; }
		var M = model(curYear);
		var phone = !!(phoneMq && phoneMq.matches);
		var wrap = D.createElement('div');
		wrap.className = 'dcc-rb' + (phone ? ' is-phone' : '');
		wrap.setAttribute('role', 'group');
		wrap.setAttribute('aria-label', (S.ribbon || 'Schedule for %d').replace('%d', curYear));
		ribbon.innerHTML = '';
		ribbon.appendChild(wrap);
		var today = CFG.today || '', tdi = today.slice(0, 4) === String(curYear) ? dn(today) - M.base : -1;
		if (!phone) {
			var width = wrap.clientWidth || 1000;
			var L = lanes(M, width / M.N);
			var LH = 30, PH = 22;
			wrap.style.setProperty('--np', L.np); wrap.style.setProperty('--nb', L.nb);
			var head = D.createElement('div'); head.className = 'dcc-rb-months';
			var grid = D.createElement('div'); grid.className = 'dcc-rb-grid';
			for (var m = 0; m < 12; m++) {
				var a = dn(ymd(curYear, m + 1, 1)) - M.base, b = dn(m === 11 ? ymd(curYear + 1, 1, 1) : ymd(curYear, m + 2, 1)) - M.base;
				var sp = D.createElement('span'); sp.textContent = MONTHS[m];
				sp.style.left = (a / M.N * 100) + '%'; sp.style.width = ((b - a) / M.N * 100) + '%';
				head.appendChild(sp);
				var ln = D.createElement('i'); ln.style.left = (a / M.N * 100) + '%'; grid.appendChild(ln);
			}
			wrap.appendChild(head);
			var track = D.createElement('div'); track.className = 'dcc-rb-track';
			track.style.height = (L.np * PH + L.nb * LH + 8) + 'px';
			wrap.style.paddingBottom = '22px';
			track.appendChild(grid);
			M.segs.sort(function (x, y) { return (x.s - y.s) || (x.lane - y.lane); });
			M.segs.forEach(function (g) {
				var left = g.s / M.N * 100, w = (g.e - g.s + 1) / M.N * 100, top;
				if (g.pill) {
					top = g.lane * PH + 2;
					var pw = Math.max(w, L.minDays / M.N * 100 * 0.8);
					left = Math.max(0, Math.min(100 - pw, left + w / 2 - pw / 2));
					w = pw;
				} else {
					top = L.np * PH + (L.nb - 1 - g.lane) * LH + 4;
				}
				var el = bandEl(g, 'left:' + left + '%;width:' + w + '%;top:' + top + 'px', false);
				track.appendChild(el);
				if (!g.pill) {
					if (g.s0 === g.s) { track.appendChild(handleEl(g, 'start', g.s / M.N * 100, M)).style.top = top + 'px'; }
					if (g.e0 === g.e) { track.appendChild(handleEl(g, 'end', (g.e + 1) / M.N * 100, M)).style.top = top + 'px'; }
				} else {
					/* a pill's ends are its own: draggable only when it is wide enough to hold them */
				}
			});
			if (tdi >= 0) {
				var tl = D.createElement('div'); tl.className = 'dcc-rb-today';
				tl.style.left = ((tdi + 0.5) / M.N * 100) + '%';
				tl.innerHTML = '<span>' + (S.today || 'Today') + '</span>';
				track.appendChild(tl);
			}
			wrap.appendChild(track);
		} else {
			/* 390 px: a vertical month list with the same bands. */
			var Lp = lanes(M, 330 / 31);
			M.segs.sort(function (x, y) { return (x.s - y.s) || (x.lane - y.lane); });
			for (var mm = 0; mm < 12; mm++) {
				var ma = dn(ymd(curYear, mm + 1, 1)) - M.base, mdays = new Date(curYear, mm + 1, 0).getDate(), mb = ma + mdays - 1;
				var box = D.createElement('div'); box.className = 'dcc-rb-month';
				var hh = D.createElement('div'); hh.className = 'dcc-rb-mname'; hh.textContent = MONTHS[mm]; box.appendChild(hh);
				var tr = D.createElement('div'); tr.className = 'dcc-rb-mtrack';
				var inM = M.segs.filter(function (g) { return !(g.e < ma || g.s > mb); });
				var pl = [], bl = [];
				inM.forEach(function (g) { var arr = g.pill ? pl : bl; if (arr.indexOf(g.lane) < 0) { arr.push(g.lane); } });
				pl.sort(function (x, y) { return x - y; }); bl.sort(function (x, y) { return y - x; });
				tr.style.height = (pl.length * 22 + bl.length * 28 + 6) + 'px';
				inM.forEach(function (g) {
					var s = Math.max(g.s, ma) - ma, e = Math.min(g.e, mb) - ma;
					var left = s / mdays * 100, w = (e - s + 1) / mdays * 100, top;
					if (g.pill) { top = pl.indexOf(g.lane) * 22 + 2; var pw = Math.max(w, 9); left = Math.max(0, Math.min(100 - pw, left + w / 2 - pw / 2)); w = pw; }
					else { top = pl.length * 22 + bl.indexOf(g.lane) * 28 + 3; }
					var el = bandEl(g, 'left:' + left + '%;width:' + w + '%;top:' + top + 'px', true);
					if (g.s < ma) { el.classList.add('clip-l'); }
					if (g.e > mb) { el.classList.add('clip-r'); }
					tr.appendChild(el);
				});
				if (tdi >= ma && tdi <= mb) {
					var tl2 = D.createElement('div'); tl2.className = 'dcc-rb-today';
					tl2.style.left = ((tdi - ma + 0.5) / mdays * 100) + '%';
					tl2.innerHTML = '<span>' + (S.today || 'Today') + '</span>';
					tr.appendChild(tl2);
				}
				box.appendChild(tr);
				wrap.appendChild(box);
			}
		}
		/* roving focus: one band is the ribbon's tab stop */
		var bands = $$('.dcc-band', wrap);
		var target = lastFocusKey ? wrap.querySelector('[data-key="' + lastFocusKey + '"]') : null;
		var stop = target && target.classList.contains('dcc-band') ? target : (target ? bandFor(target) : bands[0]);
		if (stop) { setStop(stop); }
		if (target && focusKey) { target.focus({ preventScroll: true }); }
	}
	function bandFor(h) {
		return ribbon.querySelector('.dcc-band[data-row="' + h.getAttribute('data-row') + '"][data-yy="' + h.getAttribute('data-yy') + '"]');
	}
	function setStop(band) {
		$$('.dcc-band, .dcc-hdl', ribbon).forEach(function (x) { x.tabIndex = -1; });
		band.tabIndex = 0;
		$$('.dcc-hdl[data-row="' + band.getAttribute('data-row') + '"][data-yy="' + band.getAttribute('data-yy') + '"]', ribbon).forEach(function (h) { h.tabIndex = 0; });
	}

	/* Write a moved end back into the row's own inputs. A fixed end takes
	 * the new month/day (keeping its ± days); a holiday end keeps its
	 * holiday and takes a new ± days, clamped to ±60 as the save clamps. */
	function rowEl(key) { return form.querySelector('.dcc-row[data-row="' + CSS.escape(key) + '"]'); }
	function moveEnd(key, yy, which, newDay, M) {
		var el = rowEl(key);
		if (!el) { return; }
		var r = readRow(el), rule = which === 'start' ? r.start : r.end, inp = ruleEls(el, which);
		var date = fromDn(M.base + newDay);
		if (rule.on === 'fixed') {
			var b = fromDn(dn(date) - rule.off).split('-');
			inp.m.value = String(+b[1]); inp.d.value = String(+b[2]);
			fire(inp.m, 'change'); fire(inp.d, 'change');
		} else {
			var yr = yy;
			if (which === 'end') {
				var s = resolve(r.start, yy), e = resolve(r.end, yy);
				if (s && e && e < s) { yr = yy + 1; }
			}
			var base = resolve({ on: rule.on, off: 0 }, yr);
			if (!base) { return; }
			var off = Math.max(-60, Math.min(60, dn(date) - dn(base)));
			inp.off.value = String(off);
			fire(inp.off, 'input'); fire(inp.off, 'change');
		}
	}
	/* How far an end may go: never past its own other end. */
	function limits(g, which, M) {
		var lo = 0, hi = M.N - 1;
		if (which === 'start' && g.e0 <= M.N - 1) { hi = Math.min(hi, g.e0); }
		if (which === 'end' && g.s0 >= 0) { lo = Math.max(lo, g.s0); }
		/* a row that wraps the year shows twice: its halves never cross */
		M.segs.forEach(function (o) {
			if (o.r.key !== g.r.key || o.yy === g.yy) { return; }
			if (which === 'end' && o.s > g.e) { hi = Math.min(hi, o.s - 1); }
			if (which === 'start' && o.e < g.s) { lo = Math.max(lo, o.e + 1); }
		});
		return [lo, hi];
	}
	function segFor(M, key, yy) {
		for (var i = 0; i < M.segs.length; i++) { if (M.segs[i].r.key === key && M.segs[i].yy === yy) { return M.segs[i]; } }
		return null;
	}

	if (ribbon) {
		var drag = null, tip = null;
		ribbon.addEventListener('pointerdown', function (e) {
			var h = e.target.closest('.dcc-hdl');
			if (!h) { return; }
			e.preventDefault();
			var M = model(curYear), g = segFor(M, h.getAttribute('data-row'), +h.getAttribute('data-yy'));
			if (!g) { return; }
			var track = h.parentNode, rect = track.getBoundingClientRect();
			drag = { h: h, M: M, g: g, which: h.getAttribute('data-which'), rect: rect, lim: limits(g, h.getAttribute('data-which'), M), day: null, band: bandFor(h) };
			h.setPointerCapture && h.setPointerCapture(e.pointerId);
			h.classList.add('is-drag');
			tip = D.createElement('div'); tip.className = 'dcc-tip'; track.appendChild(tip);
		});
		ribbon.addEventListener('pointermove', function (e) {
			if (!drag) { return; }
			var x = (e.clientX - drag.rect.left) / drag.rect.width * drag.M.N;
			var day = Math.floor(x);
			day = Math.max(drag.lim[0], Math.min(drag.lim[1], day));
			if (day === drag.day) { return; }
			drag.day = day;
			moveEnd(drag.g.r.key, drag.g.yy, drag.which, day, drag.M);
			/* follow the pointer without rebuilding (that would drop the capture) */
			var M2 = model(curYear), g2 = segFor(M2, drag.g.r.key, drag.g.yy);
			if (g2) {
				var pct = (drag.which === 'start' ? g2.s : g2.e + 1) / M2.N * 100;
				drag.h.style.left = pct + '%';
				if (drag.band) { drag.band.style.left = (g2.s / M2.N * 100) + '%'; drag.band.style.width = ((g2.e - g2.s + 1) / M2.N * 100) + '%'; }
				tip.textContent = tipText(g2.r, drag.which, fromDn(M2.base + (drag.which === 'start' ? g2.s0 : g2.e0)));
				tip.style.left = pct + '%'; tip.style.top = drag.h.style.top;
			}
		});
		function endDrag() {
			if (!drag) { return; }
			lastFocusKey = drag.h.getAttribute('data-key');
			drag.h.classList.remove('is-drag');
			drag = null;
			if (tip) { tip.remove(); tip = null; }
			render();
			var h = ribbon.querySelector('[data-key="' + lastFocusKey + '"]');
			if (h) { h.focus({ preventScroll: true }); }
		}
		ribbon.addEventListener('pointerup', endDrag);
		ribbon.addEventListener('pointercancel', endDrag);
		ribbon.addEventListener('click', function (e) {
			var b = e.target.closest('.dcc-band');
			if (b) { openSheet(rowEl(b.getAttribute('data-row')), b.getAttribute('data-key'), false); }
		});
		ribbon.addEventListener('focusin', function (e) {
			var b = e.target.closest('.dcc-band');
			if (b) { setStop(b); lastFocusKey = b.getAttribute('data-key'); }
		});
		ribbon.addEventListener('keydown', function (e) {
			var t = e.target, k = e.key;
			if (t.classList.contains('dcc-hdl')) {
				if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') { return; }
				e.preventDefault();
				var M = model(curYear), g = segFor(M, t.getAttribute('data-row'), +t.getAttribute('data-yy')), w = t.getAttribute('data-which');
				if (!g) { return; }
				var step = (k === 'ArrowLeft' || k === 'ArrowDown' ? -1 : 1) * (e.shiftKey ? 7 : 1);
				var lim = limits(g, w, M), cur = w === 'start' ? g.s0 : g.e0;
				var day = Math.max(lim[0], Math.min(lim[1], cur + step));
				if (day === cur) { return; }
				lastFocusKey = t.getAttribute('data-key');
				moveEnd(g.r.key, g.yy, w, day, M);
				render();
				var nh = ribbon.querySelector('[data-key="' + lastFocusKey + '"]');
				if (nh) { nh.focus({ preventScroll: true }); }
				return;
			}
			if (!t.classList.contains('dcc-band')) { return; }
			var list = $$('.dcc-band', ribbon), i = list.indexOf(t), j = -1;
			if (k === 'ArrowRight' || k === 'ArrowDown') { j = Math.min(list.length - 1, i + 1); }
			else if (k === 'ArrowLeft' || k === 'ArrowUp') { j = Math.max(0, i - 1); }
			else if (k === 'Home') { j = 0; }
			else if (k === 'End') { j = list.length - 1; }
			if (j >= 0) { e.preventDefault(); setStop(list[j]); list[j].focus(); }
		});
		$$('.dcc-year').forEach(function (b) {
			b.addEventListener('click', function () {
				curYear = +b.getAttribute('data-year');
				$$('.dcc-year').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
				lastFocusKey = null;
				render();
			});
		});
		var rz = 0, lastW = W.innerWidth;
		W.addEventListener('resize', function () {
			if (W.innerWidth === lastW) { return; }
			lastW = W.innerWidth;
			clearTimeout(rz); rz = setTimeout(render, 120);
		});
	}

	/* ---------------------------------------------------------------
	 * The side sheet: the row's own inputs, moved in and back.
	 * ------------------------------------------------------------- */
	var sheet = D.getElementById('dcc-sheet'), scrim = D.getElementById('dcc-scrim');
	var sheetBody = D.getElementById('dcc-sheet-body'), sheetRow = null, sheetMark = null, sheetReturn = null;
	function sheetDates() {
		if (!sheetRow) { return; }
		var r = readRow(sheetRow);
		D.getElementById('dcc-sheet-dates').textContent = years.map(function (y) { return y + ': ' + rangeText(resolveRow(r, y)); }).join(' · ') + ' — ' + describe(r.start) + ' → ' + describe(r.end);
	}
	function openSheet(el, returnKey, isNew) {
		if (!el || !sheet) { return; }
		if (sheetRow) { closeSheet(false); }
		sheetMark = D.createComment('dcc-row');
		el.parentNode.insertBefore(sheetMark, el);
		sheetBody.appendChild(el);
		sheetRow = el;
		sheetReturn = returnKey;
		D.getElementById('dcc-sheet-h').textContent = isNew ? (S.add || 'New Row') : (S.edit || 'Edit Row');
		sheetDates();
		sheet.hidden = false; scrim.hidden = false;
		D.body.classList.add('dcc-sheet-open');
		var f = el.querySelector('select, input');
		if (f) { f.focus(); }
	}
	function closeSheet(focus) {
		if (!sheetRow) { return; }
		if (sheetMark && sheetMark.parentNode) { sheetMark.parentNode.insertBefore(sheetRow, sheetMark); sheetMark.remove(); }
		sheetRow = null; sheetMark = null;
		sheet.hidden = true; scrim.hidden = true;
		D.body.classList.remove('dcc-sheet-open');
		lastFocusKey = sheetReturn;
		render();
		if (focus !== false) {
			var b = sheetReturn && ribbon.querySelector('[data-key="' + sheetReturn + '"]');
			(b || $('.dcc-band', ribbon) || D.getElementById('dcc-seasons-add-row')).focus();
		}
	}
	if (sheet) {
		D.getElementById('dcc-sheet-close').addEventListener('click', function () { closeSheet(); });
		D.getElementById('dcc-sheet-done').addEventListener('click', function () { closeSheet(); });
		scrim.addEventListener('click', function () { closeSheet(); });
		D.getElementById('dcc-sheet-delete').addEventListener('click', function () {
			if (!sheetRow) { return; }
			var el = sheetRow;
			sheetRow = null;
			if (sheetMark) { sheetMark.remove(); sheetMark = null; }
			el.remove();
			sheet.hidden = true; scrim.hidden = true;
			D.body.classList.remove('dcc-sheet-open');
			lastFocusKey = null;
			render();
			update();
			toast(S.deleted || 'Row deleted.');
			var b = $('.dcc-band', ribbon); if (b) { b.focus(); }
		});
		sheet.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
			if (e.key !== 'Tab') { return; }
			var f = $$('button, select, input, textarea', sheet).filter(function (x) { return !x.hidden && x.offsetParent !== null; });
			if (!f.length) { return; }
			if (e.shiftKey && D.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
			else if (!e.shiftKey && D.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
		});
		sheet.addEventListener('input', function () { sheetDates(); render(); });
		sheet.addEventListener('change', function () { sheetDates(); render(); });
	}
	var addBtn = D.getElementById('dcc-seasons-add-row');
	if (addBtn && tpl && rowsBox) {
		addBtn.addEventListener('click', function () {
			var key = 'n' + Date.now() + '_' + rowEls().length;
			var holder = D.createElement('div');
			holder.innerHTML = tpl.innerHTML.replace(/__i__/g, key);
			var el = holder.firstElementChild;
			rowsBox.appendChild(el);
			render();
			update();
			openSheet(el, 'b:' + key + ':' + curYear, true);
		});
	}
	/* "Fixed date" shows month/day; a named holiday hides them. */
	function syncRule(sel) {
		var wrap = sel.closest('.dcc-seasons-rule');
		if (!wrap) { return; }
		var fixed = sel.value === 'fixed';
		$$('.dcc-seasons-md', wrap).forEach(function (el) { el.hidden = !fixed; });
		var pair = wrap.querySelector('.dcc-seasons-md-pair');
		if (pair) { pair.hidden = !fixed; }
	}
	form.addEventListener('change', function (e) { if (e.target.classList && e.target.classList.contains('dcc-seasons-on')) { syncRule(e.target); } });

	/* ---------------------------------------------------------------
	 * Show On chips (Rob's pick 4).
	 * ------------------------------------------------------------- */
	function field(key) { return form.querySelector('[name="dcc_seasons_options[' + key + ']"]'); }
	function lockOf(w) {
		var id = +w.getAttribute('data-id') || 0, slug = w.getAttribute('data-slug') || '';
		var bk = CFG.booking || { ids: [], slugs: [] }, gd = CFG.guide || { ids: [], slugs: [] };
		var eb = field('exclude_booking'), ge = field('guide_effects'), ei = field('exclude_ids'), ep = field('exclude_paths');
		if (eb && eb.checked && (bk.ids.indexOf(id) >= 0 || (slug && bk.slugs.indexOf(slug) >= 0))) { return 'booking'; }
		if (ge && !ge.checked && (gd.ids.indexOf(id) >= 0 || (slug && gd.slugs.indexOf(slug) >= 0))) { return 'guide'; }
		if (ei && id > 0 && ei.value.split(/[^0-9]+/).map(Number).indexOf(id) >= 0) { return 'ids'; }
		if (ep && slug) {
			var lines = ep.value.split(/[\r\n]+/);
			for (var i = 0; i < lines.length; i++) { if (lines[i].trim().replace(/^[\/\s]+|[\/\s]+$/g, '').toLowerCase() === slug.toLowerCase() && slug) { return 'paths'; } }
		}
		return '';
	}
	function syncLocks() {
		$$('.dcc-chip-w', form).forEach(function (w) {
			var k = lockOf(w), inp = w.querySelector('.dcc-chip-in'), btn = w.querySelector('.dcc-i-lock'), pop = w.querySelector('.dcc-pop-lock');
			w.classList.toggle('is-locked', !!k);
			if (k) { inp.setAttribute('aria-disabled', 'true'); inp.setAttribute('aria-describedby', pop.id); pop.textContent = (CFG.locks || {})[k] || ''; }
			else { inp.removeAttribute('aria-disabled'); inp.removeAttribute('aria-describedby'); }
			btn.hidden = !k;
		});
		syncGroups();
	}
	function groupMembers(g) {
		return $$(g === 'policy' ? '.dcc-chip-w[data-policy="1"]' : '.dcc-chip-w[data-group="' + g + '"]', form).filter(function (w) { return !w.classList.contains('is-locked'); });
	}
	function syncGroups() {
		$$('.dcc-group-t', form).forEach(function (b) {
			var m = groupMembers(b.getAttribute('data-group'));
			b.setAttribute('aria-pressed', m.length && m.every(function (w) { return w.querySelector('.dcc-chip-in').checked; }) ? 'true' : 'false');
			b.disabled = !m.length;
		});
	}
	form.addEventListener('click', function (e) {
		var inp = e.target.classList && e.target.classList.contains('dcc-chip-in') ? e.target : null;
		if (inp && inp.closest('.dcc-chip-w').classList.contains('is-locked')) { e.preventDefault(); return; }
		var g = e.target.closest ? e.target.closest('.dcc-group-t') : null;
		if (g) {
			var on = g.getAttribute('aria-pressed') !== 'true';
			groupMembers(g.getAttribute('data-group')).forEach(function (w) {
				var c = w.querySelector('.dcc-chip-in');
				if (c.checked !== on) { c.checked = on; fire(c, 'change'); }
			});
			syncGroups();
		}
	});
	form.addEventListener('change', function (e) { if (e.target.classList && e.target.classList.contains('dcc-chip-in')) { syncGroups(); } });
	['exclude_booking', 'guide_effects', 'exclude_ids', 'exclude_paths'].forEach(function (k) {
		var f = field(k);
		if (f) { f.addEventListener('input', syncLocks); f.addEventListener('change', syncLocks); }
	});
	var search = D.getElementById('dcc-chip-search');
	if (search) {
		search.addEventListener('input', function () {
			var q = search.value.trim().toLowerCase(), any = false;
			$$('.dcc-chip-w', form).forEach(function (w) {
				var hit = !q || w.getAttribute('data-search').indexOf(q) >= 0;
				w.hidden = !hit; any = any || hit;
			});
			$$('.dcc-chip-set', form).forEach(function (s) {
				var vis = $$('.dcc-chip-w', s).some(function (w) { return !w.hidden; });
				s.hidden = !vis;
				var h = s.previousElementSibling;
				if (h && h.classList.contains('dcc-chip-h')) { h.hidden = !vis; }
			});
			var none = $('.dcc-chip-none', form); if (none) { none.hidden = any; }
		});
	}

	/* ---------------------------------------------------------------
	 * The sticky save bar (Rob's pick 2).
	 * ------------------------------------------------------------- */
	var SKIP = /^(option_page|action|_wpnonce|_wp_http_referer)$/;
	function snap() {
		var map = {};
		new FormData(form).forEach(function (v, k) {
			if (SKIP.test(k) || k.indexOf('[__i__]') >= 0) { return; }
			var m = /\[schedule\]\[([^\]]+)\]/.exec(k), key;
			if (m) { key = 'row:' + m[1]; }
			else if (/\[show_on\]\[\]$/.test(k)) { key = 'show_on:' + v; }
			else { key = k; }
			(map[key] = map[key] || []).push(k + '=' + v);
		});
		Object.keys(map).forEach(function (k) { map[k] = map[k].sort().join('&'); });
		return map;
	}
	var initial = snap();
	var initialRows = rowsBox ? rowsBox.innerHTML : '';
	function changeCount() {
		var now = snap(), n = 0, seen = {};
		Object.keys(initial).forEach(function (k) { seen[k] = 1; if (initial[k] !== now[k]) { n++; } });
		Object.keys(now).forEach(function (k) { if (!seen[k]) { n++; } });
		return n;
	}
	var bar = D.getElementById('dcc-savebar'), countEl = bar && bar.querySelector('.dcc-sb-count'), dirty = 0, submitting = false;
	function update() {
		dirty = changeCount();
		if (!bar) { return; }
		bar.hidden = dirty === 0;
		D.body.classList.toggle('dcc-dirty', dirty > 0);
		countEl.textContent = dirty === 1 ? (S.one || '1 Unsaved Change') : (S.many || '%d Unsaved Changes').replace('%d', dirty);
	}
	form.addEventListener('input', update);
	form.addEventListener('change', update);
	D.getElementById('dcc-discard').addEventListener('click', function () {
		if (sheetRow) { closeSheet(false); }
		if (rowsBox) { rowsBox.innerHTML = initialRows; }
		form.reset();
		$$('select.dcc-seasons-on', form).forEach(syncRule);
		syncOutputs();
		syncLocks();
		if (search) { search.value = ''; fire(search, 'input'); }
		lastFocusKey = null;
		render();
		update();
		var t = $('.dcc-tab[aria-current]'); if (t) { t.focus(); }
	});
	form.addEventListener('submit', function () {
		if (sheetRow) { closeSheet(false); }
		submitting = true;
	});
	W.addEventListener('beforeunload', function (e) {
		if (dirty > 0 && !submitting) { e.preventDefault(); e.returnValue = S.leave || ''; return S.leave || ''; }
	});
	D.addEventListener('keydown', function (e) {
		if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
			e.preventDefault();
			if (form.requestSubmit) { form.requestSubmit(D.getElementById('dcc-save')); } else { form.submit(); }
		}
	});

	/* ---------------------------------------------------------------
	 * Start: the panel an old link or anchor points at.
	 * ------------------------------------------------------------- */
	if (location.hash.length > 1) {
		var target = D.getElementById(decodeURIComponent(location.hash.slice(1)));
		var panel = target && target.closest('.dcc-panel');
		if (panel) {
			showPanel(panel.getAttribute('data-panel'), false);
			var det = target.closest('details'); if (det) { det.open = true; }
			setTimeout(function () { target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); if (target.focus) { target.focus({ preventScroll: true }); } }, 0);
		}
	}
	syncOutputs();
	syncLocks();
	render();
	update();
	if (phoneMq && phoneMq.addEventListener) { phoneMq.addEventListener('change', render); }

	/* For tools/test-admin.js. */
	W.DCCSeasonsUI = {
		resolveRow: resolveRow, rows: rowsInOrder, count: changeCount, render: render,
		year: function () { return curYear; }, rangeText: rangeText
	};
})();
