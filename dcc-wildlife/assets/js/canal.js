/**
 * DCC Wildlife — the Canal hub (v1.10.0).
 *
 * Stage navigation for hub → month → species (→ sheet) and hub → water.
 * Presentation and routing only: every number and string it shows comes
 * from data the page already had — the bundled species calendar, or facts
 * the water module's existing /conditions call returned under its own
 * truth gate. This file fetches nothing.
 *
 * THIS FILE TOUCHES HISTORY NO LONGER (1.44.0), AND THAT IS A CHANGE WORTH
 * READING BEFORE EDITING IT.
 *
 * From 1.10.0 to 1.43.0 the app was four stacked LEVELS and this file
 * pushed {dccwlNav: level} per drill-down, reading the level back out of
 * popstate rather than stepping — which is what made Back, Escape and a
 * sheet compose correctly in every order.
 *
 * Rob removed the hub and the Back bar (1.44.0). Water and Wildlife are
 * SIBLINGS now, switched by one dropdown, and a tab does not push history.
 * So the push, the popstate handler and parentOf() are all gone, and Back
 * leaves /explore/ rather than walking up to a hub that no longer exists.
 *
 * WHAT THAT DID NOT CHANGE: sheet.js still pushes its own entry on open and
 * pops it on close, and it must still not be touched. The sheet contract was
 * never part of the level machinery — which is why Escape, the scrim, the
 * back affordance and the Android back button all still close a sheet and
 * leave the view exactly where it was. If levels ever return, restore the
 * state-driven reader above rather than a "step up on any pop" design: that
 * passes the first case and fails the second.
 */
(function () {
	'use strict';

	var CFG = window.DCC_WL_CANAL || {};

	/*
	 * THE HUB'S TUNABLES AND ITS DOM HELPERS ARE BOTH GONE (1.44.0).
	 *
	 * `monthArtMax`, `hubPreviewMax` and `nowNamesMax` sized the month
	 * tiles' sprite art and the two hub preview lines; `el()` and `fmt()`
	 * built them, and `cap()` read them. Rob removed the hub, so this file
	 * builds no elements and composes no sentences — it switches two panels
	 * and reads one deep link. The three caps are retired in Guide_Data
	 * rather than left readable here: a cap with nothing to cap is a setting
	 * that does nothing.
	 *
	 * `SET` stays, because `stickyOffset` is still a real setting.
	 */
	var SET = CFG.set || {};

	/* Canal time, not the visitor's — the same rule the countdown follows.
	 * A guest in Berlin looking at a Florida canal wants Florida's month. */
	function canalMonth() {
		try {
			return new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/New_York', month: 'numeric'
			}).formatToParts(new Date()).reduce(function (acc, p) {
				return p.type === 'month' ? parseInt(p.value, 10) - 1 : acc;
			}, new Date().getMonth());
		} catch (e) {
			return new Date().getMonth();
		}
	}

	function initCanal(root) {
		if (root.getAttribute('data-dccwl-canal-init')) { return; }
		root.setAttribute('data-dccwl-canal-init', '1');

		// This placement's own overrides, if it set any.
		var own = {};
		try { own = JSON.parse(root.getAttribute('data-dccwl-canal') || '{}') || {}; } catch (e) { own = {}; }


		var panels = {};
		root.querySelectorAll('[data-dccwl-panel]').forEach(function (p) {
			panels[p.getAttribute('data-dccwl-panel')] = p;
		});
		if (!panels.species) { return; }
		/* The view a fresh load opens on: the first panel PHP did not hide.
		 * Water when the module renders, Wildlife when it does not — nothing
		 * names a default, which is the same mechanism the water tab bar uses
		 * for Map. */
		var DEFAULT_VIEW = panels.water ? 'water' : 'species';

		var speciesRoot = panels.species ? panels.species.querySelector('.dccwl-root') : null;
		var wCfg = window.DCC_WL_CFG || {};
		var state = { level: DEFAULT_VIEW, month: canalMonth(), opener: null };

		/* ---------- level switching ---------- */

		function show(level, focusIt) {
			if (!panels[level]) { level = DEFAULT_VIEW; }
			Object.keys(panels).forEach(function (k) {
				panels[k].hidden = k !== level;
			});
			state.level = level;

			/* Tell the panel it is on screen. The water panel resets to its
			 * "Now" tab on this, because the owner's rule is that it opens on
			 * Now EVERY time — not just the first. Dispatched rather than
			 * called, so the hub does not have to know what water.js does with
			 * it, and so a panel that does nothing with it costs nothing.
			 * (1.33.0) */
			try {
				panels[level].dispatchEvent(new CustomEvent('dccwl:panel-shown', {
					bubbles: true, detail: { level: level }
				}));
			} catch (err) { /* very old browsers: the panel just keeps its tab */ }

			/* THE RECENTRE NUDGE IS GONE WITH THE STRIP IT EXISTED FOR.
			 * The twelve-month strip could not centre its chosen pill while
			 * its panel was hidden (offsetLeft reads 0), so this called
			 * recenter() on every show. Month is a MENU now — there is
			 * nothing to centre, and `centerMonth` was also the single
			 * biggest cost in a profiled tap (419 ms). See widget.js. */

			if (focusIt !== false) {
				// Focus the panel itself: a screen reader then reads its
				// heading, and Tab from there lands on the back control.
				panels[level].focus();
			}
		}

		/*
		 * SWITCHING VIEWS PUSHES NO HISTORY, AND THAT IS THE POINT.
		 *
		 * Through 1.43.0 these were LEVELS: every drill-down pushed an entry
		 * and a Back bar walked up. Rob removed the Back bar and the hub, so
		 * Water and Wildlife are siblings — tabs — and a tab does not add a
		 * history entry. Back therefore leaves /explore/ instead of walking
		 * up to a hub that no longer exists.
		 *
		 * `parentOf()` and the nav popstate handler are DELETED rather than
		 * left inert: there is no parent to compute. sheet.js's own contract
		 * (push on open, pop on close) is untouched — it was never part of
		 * the level machinery, which is why Escape and the Android back
		 * button still close a sheet and leave the view alone.
		 */
		function go(level, opener) {
			if (level === state.level) { return; }
			state.opener = opener || document.activeElement;
			show(level);
			syncViewLabel();
		}

		/* ---------- wiring ---------- */

		/* ---------- the view dropdown (1.44.0) ---------- */

		var vSel = root.querySelector('[data-dccwl-viewselect]');
		var vTrigger = vSel ? vSel.querySelector('[data-dccwl-viewtrigger]') : null;
		var vList = vSel ? vSel.querySelector('[data-dccwl-viewlist]') : null;
		var vLabel = vSel ? vSel.querySelector('[data-dccwl-viewlabel]') : null;

		/** The trigger always reads the view you are LOOKING AT. */
		function syncViewLabel() {
			if (!vLabel || !vList) { return; }
			var want = state.level === 'species' ? 'species' : 'water';
			var item = vList.querySelector('[data-dccwl-view="' + want + '"]')
				|| vList.querySelector('[data-dccwl-view="wildlife"]');
			if (item) { vLabel.textContent = item.textContent; }
		}

		function closeViewMenu(focusTrigger) {
			if (!vList || vList.hidden) { return; }
			vList.hidden = true;
			if (vTrigger) { vTrigger.setAttribute('aria-expanded', 'false'); }
			if (focusTrigger && vTrigger) { vTrigger.focus(); }
		}

		function openViewMenu() {
			if (!vList || !vList.hidden) { return; }
			vList.hidden = false;
			if (vTrigger) { vTrigger.setAttribute('aria-expanded', 'true'); }
			var first = vList.querySelector('[data-dccwl-view]');
			if (first) { first.focus(); }
		}

		if (vTrigger && vList) {
			vTrigger.addEventListener('click', function () {
				if (vList.hidden) { openViewMenu(); } else { closeViewMenu(true); }
			});

			/* Down or Enter from the trigger opens and lands on the first row,
			 * which is what a menu button does. */
			vTrigger.addEventListener('keydown', function (e) {
				if ('ArrowDown' === e.key || 'Down' === e.key) { e.preventDefault(); openViewMenu(); }
			});

			vList.addEventListener('click', function (e) {
				var item = e.target.closest ? e.target.closest('[data-dccwl-view]') : null;
				if (!item) { return; }
				var want = item.getAttribute('data-dccwl-view');
				closeViewMenu(false);
				go('wildlife' === want ? 'species' : want, vTrigger);
			});

			vList.addEventListener('keydown', function (e) {
				var items = Array.prototype.slice.call(vList.querySelectorAll('[data-dccwl-view]'));
				var i = items.indexOf(document.activeElement);
				if ('Escape' === e.key || 'Esc' === e.key) {
					e.preventDefault();
					closeViewMenu(true);
					return;
				}
				if ('ArrowDown' === e.key || 'Down' === e.key) {
					e.preventDefault();
					items[(i + 1) % items.length].focus();
				} else if ('ArrowUp' === e.key || 'Up' === e.key) {
					e.preventDefault();
					items[(i - 1 + items.length) % items.length].focus();
				} else if ('Home' === e.key) {
					e.preventDefault();
					items[0].focus();
				} else if ('End' === e.key) {
					e.preventDefault();
					items[items.length - 1].focus();
				}
			});

			/* An outside tap closes it. Listened on the document because the
			 * tap that closes may land anywhere, and removed never — one
			 * dropdown per root, bound once, like the map button's guard. */
			document.addEventListener('click', function (e) {
				if (!vSel.contains(e.target)) { closeViewMenu(false); }
			});

			syncViewLabel();
		}

		/* `[data-dccwl-go]` and `[data-dccwl-back]` ARE GONE WITH THE HUB.
		 * They drove the two hub doors and the Back bar. `back` itself was
		 * deleted with the level machinery, so the second of these bound an
		 * identifier that no longer existed — harmless only because the
		 * selector matched nothing. The view dropdown above is the whole of
		 * the navigation now. */

		/* ---------- sticky offset (1.18.1) ----------
		 * The level bar is position: sticky; top: var(--dccwl-sticky-offset).
		 * Rob's theme header is sticky too, and on the phone it sat exactly
		 * over the bar. Measure whatever fixed or sticky element owns the top
		 * edge of the viewport — a theme header, the WP admin bar — and push
		 * the bar down below it. A theme that sets --dccwl-sticky-offset
		 * itself keeps its value: this only runs while the token is 0. */
		/* A NUMBER IN THE SETTINGS WINS OUTRIGHT (1.32.0).
		 *
		 * The automatic probe is good but it is a guess about someone else's
		 * theme, and a guess needs an override. A non-zero setting is written
		 * straight onto the root and the probe never runs; zero means "work it
		 * out", which is what it has always done. */
		var stickyFixed = (function () {
			var v = parseInt(own.stickyOffset !== undefined ? own.stickyOffset : SET.stickyOffset, 10);
			return isNaN(v) || v <= 0 ? 0 : v;
		})();
		if (stickyFixed) {
			root.style.setProperty('--dccwl-sticky-offset', stickyFixed + 'px');
		}

		var stickyAuto = !stickyFixed && (function () {
			var v = '';
			try { v = String(getComputedStyle(root).getPropertyValue('--dccwl-sticky-offset') || ''); } catch (e) { return false; }
			return '' === v.trim() || parseFloat(v) === 0;
		})();
		var stickyLast = -1, stickyQueued = false;

		// The bottom edge of the fixed/sticky bar covering (x, y), or 0.
		function barBottomAt(x, y, h) {
			var top = document.elementFromPoint(x, y);
			if (!top || root.contains(top)) { return 0; }
			for (var e = top; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
				var pos = getComputedStyle(e).position;
				if (pos !== 'fixed' && pos !== 'sticky') { continue; }
				var r = e.getBoundingClientRect();
				// Covers this point, and is a bar, not a full-screen overlay.
				return (r.top <= y && r.bottom > y && r.bottom < h * 0.4) ? Math.ceil(r.bottom) : 0;
			}
			return 0;
		}

		function coveringHeight() {
			var w = window.innerWidth || 0, h = window.innerHeight || 0, best = 0;
			if (!w || !h || !document.elementFromPoint) { return 0; }
			[0.5, 0.08, 0.92].forEach(function (fx) {
				// Bars stack: the admin bar over a theme header that starts
				// below it. Walk down through whatever covers the top edge
				// until the point is on ordinary page content (at most four
				// bars — nobody stacks more than that).
				var x = Math.round(w * fx), y = 1, n = 0, b;
				while (n++ < 4 && (b = barBottomAt(x, y, h)) > y) { y = b + 1; }
				best = Math.max(best, y - 1);
			});
			return best;
		}

		function applySticky() {
			stickyQueued = false;
			var px = coveringHeight();
			if (px === stickyLast) { return; }
			stickyLast = px;
			root.style.setProperty('--dccwl-sticky-offset', px + 'px');
		}

		function queueSticky() {
			if (stickyQueued) { return; }
			stickyQueued = true;
			(window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(applySticky);
		}

		if (stickyAuto) {
			window.addEventListener('scroll', queueSticky, { passive: true });
			window.addEventListener('resize', queueSticky);
			window.addEventListener('load', queueSticky);
			queueSticky();
		}

		/* A month named in the URL still lands on that month (1.23.0).
		 * READ ONLY, and read here rather than on the server: the page is
		 * cached, so PHP must never see a month. Accepts a number (1-12) or a
		 * month name, in the hash or the query:
		 *     /explore/#canal-month=4      /explore/?canal-month=april
		 * Nothing writes it back — the level navigation already owns history,
		 * and a second writer there would fight the Back button. */
		function monthFromUrl() {
			var raw = '';
			try {
				var m1 = (location.hash || '').match(/canal-month=([^&]+)/i);
				var m2 = (location.search || '').match(/[?&]canal-month=([^&]+)/i);
				raw = decodeURIComponent((m1 || m2 || [])[1] || '').trim();
			} catch (e) { return null; }
			if (!raw) { return null; }
			if (/^\d{1,2}$/.test(raw)) {
				var n = parseInt(raw, 10);
				return n >= 1 && n <= 12 ? n - 1 : null;
			}
			var want = raw.toLowerCase();
			var names = Array.isArray(wCfg.monthsFull) ? wCfg.monthsFull : [];
			for (var i = 0; i < names.length; i++) {
				var full = String(names[i]).toLowerCase();
				if (full === want || full.slice(0, 3) === want) { return i; }
			}
			return null;
		}

		/* A month named in the URL IS an explicit choice, and it still lands
		 * on that month — the Month ▾ chip in widget.js is what shows it now,
		 * and widget.js syncs the chip's label from setMonth(), so one deep
		 * link sets the filter and the label together. The default month is
		 * not a choice and does not filter (1.28.0). */
		/*
		 * A MONTH IN THE URL OPENS WILDLIFE, NOT WATER.
		 *
		 * The default view is Water (1.44.0, Rob's pick). A link that names a
		 * month is asking for the species list in that month, so it has to
		 * override the default — otherwise `#canal-month=april` lands on the
		 * chain map and the month it asked for is three taps away, filtered
		 * but invisible. The Director's brief states this directly: "A link
		 * to a month or a flag opens Wildlife with that filter applied."
		 *
		 * READ ONLY, and read HERE rather than on the server: the page is
		 * cached, so PHP must never see a month (the oldest rule in this
		 * plugin). Nothing writes it back — the view switch owns no history
		 * now, and a second writer there fought the Back button in 1.23.0.
		 */
		var deep = monthFromUrl();
		if (null !== deep && speciesRoot && window.DCCWL_Widget) {
			state.month = deep;
			window.DCCWL_Widget.setMonth(speciesRoot, deep, true);
		}
		show(null === deep ? DEFAULT_VIEW : 'species', false);
		syncViewLabel();
	}

	function initAll() {
		document.querySelectorAll('[data-dccwl-canal]').forEach(initCanal);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initAll);
	} else {
		initAll();
	}

	// Elementor editor/preview renders widgets after page load.
	window.addEventListener('elementor/frontend/init', function () {
		if (window.elementorFrontend && window.elementorFrontend.hooks) {
			window.elementorFrontend.hooks.addAction(
				'frontend/element_ready/dccwl_canal.default',
				function ($scope) {
					var scope = $scope && $scope[0] ? $scope[0] : $scope;
					if (scope && scope.querySelectorAll) {
						scope.querySelectorAll('[data-dccwl-canal]').forEach(initCanal);
					}
				}
			);
		}
	});
})();
