/* DCC Seasons — deferred loader: picks the active theme from the visitor's
 * LOCAL date (cache-safe), binds the tap counter, and lazy-loads the two
 * engines — engine.js (ambient particles, after idle) and matrix.js (the
 * easter egg, only on the launching tap). Dependency-free. */
(function () {
	'use strict';
	var W = window, D = document, CFG = W.DCC_SEASONS;
	if (!CFG || !CFG.enabled) { return; }

	var mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
	function reduced() { return !!(mq && mq.matches); }

	/* The year-round base theme. Mirrors Schedule::BASE_THEME. */
	var BASE_THEME = 'florida_keys';

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
	var now = new Date();
	var today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());

	/* ---- Schedule rules → dates, resolved HERE from the visitor's local
	 * clock (cache-safe: the HTML never carries "today"). Mirrors
	 * class-schedule.php; the test suite cross-checks the two. ---- */
	var ANCH = CFG.anchors || {};
	function easter(y) { /* Gregorian computus */
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
	/* One rule for one year → 'YYYY-MM-DD', or null for a rule this build
	 * doesn't understand (a stale row must never throw on the front end). */
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
	/* The instance of a row that begins in year y → [start, end]; an end
	 * before its start belongs to the following year. */
	function resolveRow(r, y) {
		if (r.year && r.year !== y) { return null; }
		var s = resolve(r.start, y), e = resolve(r.end, y);
		if (!s || !e) { return null; }
		if (e < s) { e = resolve(r.end, y + 1); }
		return [s, e];
	}
	function days(s, e) { return Math.round((new Date(e) - new Date(s)) / 864e5); }
	/* Legacy rows (pre-3.7.0 Y-m-d strings) still match, for a cached page
	 * that carries an old config; the narrowest containing range wins. */
	function activeRow(rows, date) {
		var y = +date.slice(0, 4), best = null, span = 1e9, i, yy, r, rr;
		for (i = 0; i < rows.length; i++) {
			r = rows[i];
			if (typeof r.start === 'string') {
				if (r.start <= date && date <= r.end && days(r.start, r.end) < span) { span = days(r.start, r.end); best = r; }
				continue;
			}
			for (yy = y - 1; yy <= y; yy++) {
				rr = resolveRow(r, yy);
				if (rr && rr[0] <= date && date <= rr[1] && days(rr[0], rr[1]) < span) { span = days(rr[0], rr[1]); best = r; }
			}
		}
		return best;
	}
	var row = activeRow(CFG.schedule || [], today);
	var themeKey = row ? row.theme : null;
	var theme = themeKey && CFG.themes && CFG.themes[themeKey] ? CFG.themes[themeKey] : null;
	/* Nothing claims today: the year-round base theme is the baseline face
	 * of the site. The default schedule has a full-year row so this is only
	 * reached on a schedule the owner has cut a hole in. */
	if (!theme && CFG.themes && CFG.themes[BASE_THEME]) {
		themeKey = BASE_THEME;
		theme = CFG.themes[BASE_THEME];
	}

	/* Admin-only preview (?dcc_season=<key>|off). The flag is only present
	 * in the config when PHP verified manage_options server-side. */
	if (CFG.preview) {
		if (CFG.preview === 'off') {
			row = null; theme = null; themeKey = null;
		} else if (CFG.themes && CFG.themes[CFG.preview]) {
			themeKey = CFG.preview;
			theme = CFG.themes[themeKey];
			row = { theme: themeKey, label: CFG.previewLabel || themeKey };
		}
	}

	function loadScript(src, cb) {
		var sc = D.createElement('script');
		sc.src = src;
		sc.async = true;
		sc.onload = cb;
		(D.head || D.documentElement).appendChild(sc);
	}

	/* ---- Ambient engine (lazy, after idle — never in the critical path).
	 * Loads on themed days AND theme-less days: the heron hero is the
	 * plugin's year-round signature. Not loaded under reduced motion. */
	function ambient() {
		if (!CFG.ambient || reduced() || !CFG.engineSrc) { return; }
		var loading = false;
		function go() {
			if (loading) { return; }
			loading = true;
			loadScript(CFG.engineSrc, function () {
				if (W.DCCSeasonsEngine) {
					W.DCCSeasonsEngine.start({
						cfg: CFG,
						theme: theme,
						themeKey: themeKey,
						row: row,
						mq: mq
					});
				}
			});
		}
		if (W.requestIdleCallback) { W.requestIdleCallback(go, { timeout: 3000 }); }
		else { setTimeout(go, 1500); }
	}

	/* ---- Tap targets. The selector is a comma-separated list. Taps are
	 * counted by DELEGATION — one pair of listeners on the document that
	 * asks "did this tap land inside a target?" — rather than by binding
	 * each matching element. Two reasons, both bugs in the old approach:
	 *
	 *  1. Nested targets double-counted. The #masthead fallback was bound
	 *     unconditionally and it CONTAINS #site-title, so one physical tap
	 *     bubbled through both listeners and counted twice: with tap_count
	 *     4 the egg opened on the second tap (measured).
	 *  2. Targets were bound once at load. A theme that re-renders its
	 *     header (a sticky bar built on scroll, say) left the new element
	 *     unbound, so taps stopped counting after a scroll.
	 *
	 * Delegation counts each event exactly once and matches whatever is in
	 * the DOM at tap time. Only VISIBLE matches count (Bravada renders
	 * #branding at 0px on this site). The fallback is used only when the
	 * configured selectors have no visible match at all. */
	function validSelectors(list) {
		var out = [];
		for (var k = 0; k < list.length; k++) {
			var sel = String(list[k]).replace(/^\s+|\s+$/g, '');
			if (!sel) { continue; }
			try { D.querySelectorAll(sel); out.push(sel); } catch (e) {}
		}
		return out;
	}
	function visible(el) {
		var r = el.getBoundingClientRect();
		return r.width >= 10 && r.height >= 10;
	}
	function anyVisible(sel) {
		var list = D.querySelectorAll(sel);
		for (var k = 0; k < list.length; k++) { if (visible(list[k])) { return true; } }
		return false;
	}
	/* Three tiers, first with a VISIBLE match wins: the configured
	 * selectors, then the configured fallback, then #masthead as the last
	 * resort (the theme's header always exists, so the egg is always
	 * reachable). Only ONE tier is ever bound — nesting two would count a
	 * tap twice again. */
	function tapSelector() {
		var tiers = [String(CFG.tapSelector || '').split(','), [CFG.tapFallback || '#masthead'], ['#masthead']];
		var last = '';
		for (var k = 0; k < tiers.length; k++) {
			var sel = validSelectors(tiers[k]).join(',');
			if (!sel) { continue; }
			last = sel;
			if (anyVisible(sel)) { return sel; }
		}
		return last;
	}

	/* ---- Easter egg: N taps (one shared counter, one count per tap). */
	function egg() {
		if (!CFG.egg) { return; }
		if (theme && theme.egg === false) { return; } /* Patriot Day / MLK Day */
		var eggCfg = (theme && theme.egg) || (CFG.themes && CFG.themes.classic && CFG.themes.classic.egg);
		if (!eggCfg) { return; }

		var sel = tapSelector();
		if (!sel) { return; }

		var taps = [], lastTouch = 0, loading = false;
		var need = Math.max(2, CFG.tapCount || 5), win = CFG.tapWindow || 3000;

		function samePage(a) {
			return a && a.href && a.host === W.location.host &&
				a.pathname.replace(/\/$/, '') === W.location.pathname.replace(/\/$/, '');
		}
		function hit(e) {
			var t = e.target;
			if (!t || !t.closest) { return null; }
			var el = t.closest(sel);
			return el && visible(el) ? el : null;
		}
		function onTap(e) {
			if (!hit(e)) { return; }
			var t = Date.now();
			if (e.type === 'click') {
				/* Cancel the pointless self-reload when the tapped link
				 * points at the page we're on, so tap counting survives;
				 * links to OTHER pages still navigate normally. */
				var a = e.target && e.target.closest ? e.target.closest('a') : null;
				if (a && samePage(a)) { e.preventDefault(); }
				if (t - lastTouch < 700) { return; } /* ghost click after touch */
			} else {
				lastTouch = t;
			}
			taps.push(t);
			while (taps.length && t - taps[0] > win) { taps.shift(); }
			if (taps.length >= need) {
				taps = [];
				launch();
			}
		}
		D.addEventListener('touchstart', onTap, { passive: true });
		D.addEventListener('click', onTap, false);

		function open() {
			W.DCCSeasonsMatrix.launch({
				egg: eggCfg,
				label: (row && row.label) || '',
				reduced: reduced(),
				i18n: CFG.i18n || {}
			});
		}
		function launch() {
			if (W.DCCSeasonsMatrix) { open(); return; }
			if (loading || !CFG.matrixSrc) { return; }
			loading = true;
			loadScript(CFG.matrixSrc, function () {
				loading = false;
				if (W.DCCSeasonsMatrix) { open(); }
			});
		}
	}

	W.DCCSeasonsSchedule = { resolve: resolve, resolveRow: resolveRow, activeRow: activeRow, easter: easter, nthWeekday: nthWeekday };

	function init() { ambient(); egg(); }
	if (D.readyState === 'loading') {
		D.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
