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

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	var now = new Date();
	var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
	var row = null, i, sch = CFG.schedule || [];
	for (i = 0; i < sch.length; i++) {
		if (sch[i].start <= today && today <= sch[i].end) { row = sch[i]; break; }
	}
	var themeKey = row ? row.theme : null;
	var theme = themeKey && CFG.themes && CFG.themes[themeKey] ? CFG.themes[themeKey] : null;

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

	/* ---- Tap targets. The selector is a comma-separated list; bind EVERY
	 * visible match (Bravada renders #branding at 0px on this site, so
	 * skipping invisible nodes is what makes the egg reachable by humans).
	 * If nothing visible matches, fall back to #masthead. */
	function tapTargets() {
		var sels = String(CFG.tapSelector || '').split(',');
		sels.push(CFG.tapFallback || '#site-title');
		var seen = [];
		for (var k = 0; k < sels.length; k++) {
			var sel = sels[k].replace(/^\s+|\s+$/g, '');
			if (!sel) { continue; }
			var list;
			try { list = D.querySelectorAll(sel); } catch (e) { continue; }
			for (var j = 0; j < list.length; j++) {
				if (seen.indexOf(list[j]) < 0) { seen.push(list[j]); }
			}
		}
		var visible = [];
		for (k = 0; k < seen.length; k++) {
			var r = seen[k].getBoundingClientRect();
			if (r.width >= 10 && r.height >= 10) { visible.push(seen[k]); }
		}
		if (!visible.length) {
			var m = D.querySelector('#masthead');
			if (m) { visible.push(m); }
		}
		return visible;
	}

	/* ---- Easter egg: N taps (shared counter across all bound targets). */
	function egg() {
		if (!CFG.egg) { return; }
		if (theme && theme.egg === false) { return; } /* Patriot Day / MLK Day */
		var eggCfg = (theme && theme.egg) || (CFG.themes && CFG.themes.classic && CFG.themes.classic.egg);
		if (!eggCfg) { return; }

		var els = tapTargets();
		if (!els.length) { return; }

		var taps = [], lastTouch = 0, loading = false;
		var need = Math.max(2, CFG.tapCount || 5), win = CFG.tapWindow || 3000;

		function samePage(a) {
			return a && a.href && a.host === W.location.host &&
				a.pathname.replace(/\/$/, '') === W.location.pathname.replace(/\/$/, '');
		}
		function onTap(e) {
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
		for (var k = 0; k < els.length; k++) {
			els[k].addEventListener('touchstart', onTap, { passive: true });
			els[k].addEventListener('click', onTap, false);
		}

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

	function init() { ambient(); egg(); }
	if (D.readyState === 'loading') {
		D.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
