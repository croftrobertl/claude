/**
 * DCC Wildlife — the Canal hub (v1.10.0).
 *
 * Stage navigation for hub → month → species (→ sheet) and hub → water.
 * Presentation and routing only: every number and string it shows comes
 * from data the page already had — the bundled species calendar, or facts
 * the water module's existing /conditions call returned under its own
 * truth gate. This file fetches nothing.
 *
 * HISTORY IS STATE-DRIVEN, NOT "GO UP ON ANY POP".
 * assets/js/sheet.js pushes its own entry when a sheet opens and pops it on
 * close, and it must not be touched. So this file pushes {dccwlNav: level}
 * per drill-down and, on popstate, sets the level FROM the state it landed
 * on rather than stepping. That composes correctly in every order:
 *   - back with a sheet open → lands on the sheet's underlying nav state,
 *     so the level does not move and the sheet's own handler closes it;
 *   - Escape closes the sheet, which calls history.back() itself → the same
 *     nav state → again no level change (the bug a "step up" design has);
 *   - back with no sheet → lands on the parent level, which is where we go.
 */
(function () {
	'use strict';

	var CFG = window.DCC_WL_CANAL || {};
	var I18N = CFG.i18n || {};

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text !== undefined && text !== null) { n.textContent = text; }
		return n;
	}

	function fmt(template) {
		var args = Array.prototype.slice.call(arguments, 1);
		var auto = 0;
		return String(template).replace(/%(\d+\$)?[sd]/g, function (m, pos) {
			var idx = pos ? parseInt(pos, 10) - 1 : auto++;
			return String(args[idx]);
		});
	}

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

	/* Species counts for a month, straight from the bundled calendar. */
	function monthCounts(m) {
		var w = window.DCC_WL_CFG;
		if (!w || !Array.isArray(w.species)) { return null; }
		var peak = 0, spot = 0;
		w.species.forEach(function (s) {
			var v = (s.months && s.months[m]) || 0;
			if (v >= 2) { spot += 1; }
			if (v >= 3) { peak += 1; }
		});
		return { peak: peak, spot: spot };
	}

	function monthPreview(m) {
		var c = monthCounts(m);
		if (!c) { return ''; }
		if (c.peak > 0) { return fmt(I18N.atPeak || '%d at peak', c.peak); }
		if (c.spot > 0) { return fmt(I18N.toSpot || '%d to spot', c.spot); }
		return I18N.quiet || '';
	}

	/* The water module announces its facts once, whenever its existing
	 * fetch resolves — which can land either side of a canal initialising.
	 * So listen at module level, keep the last announcement, and replay it
	 * to any canal that shows up afterwards. Order-independent by
	 * construction rather than by luck. */
	var lastWaterFacts = null;
	var waterListeners = [];

	document.addEventListener('dccwl:water-facts', function (e) {
		lastWaterFacts = (e.detail && e.detail.facts) || [];
		waterListeners.forEach(function (fn) { fn(lastWaterFacts); });
	});

	function initCanal(root) {
		if (root.getAttribute('data-dccwl-canal-init')) { return; }
		root.setAttribute('data-dccwl-canal-init', '1');

		var panels = {};
		root.querySelectorAll('[data-dccwl-panel]').forEach(function (p) {
			panels[p.getAttribute('data-dccwl-panel')] = p;
		});
		if (!panels.hub) { return; }

		var speciesRoot = panels.species ? panels.species.querySelector('.dccwl-root') : null;
		var wCfg = window.DCC_WL_CFG || {};
		var state = { level: 'hub', month: canalMonth(), opener: null };

		/* ---------- level switching ---------- */

		function show(level, focusIt) {
			if (!panels[level]) { level = 'hub'; }
			Object.keys(panels).forEach(function (k) {
				panels[k].hidden = k !== level;
			});
			state.level = level;

			// The timeline cannot centre itself while its panel is hidden
			// (offsetLeft is 0), so nudge it once it is on screen.
			if (level === 'species' && speciesRoot && window.DCCWL_Widget) {
				window.DCCWL_Widget.recenter(speciesRoot);
			}

			if (focusIt !== false) {
				// Focus the panel itself: a screen reader then reads its
				// heading, and Tab from there lands on the back control.
				panels[level].focus();
			}
		}

		function go(level, opener) {
			if (level === state.level) { return; }
			if (level !== 'hub') { state.opener = opener || document.activeElement; }
			try {
				window.history.pushState({ dccwlNav: level }, '');
			} catch (err) { /* file:// and the like */ }
			show(level);
		}

		function back() {
			// Let the browser drive, so our state and its stack cannot drift.
			try {
				window.history.back();
			} catch (err) {
				show(parentOf(state.level));
			}
		}

		function parentOf(level) {
			return level === 'species' ? 'month' : 'hub';
		}

		window.addEventListener('popstate', function (e) {
			var st = e.state;

			// A sheet entry sits ABOVE a nav entry; sheet.js owns it. Do not
			// move the level for it in either direction.
			if (st && st.dccwlSheet !== undefined) { return; }

			var level = st && st.dccwlNav ? st.dccwlNav : 'hub';

			var returning = level !== state.level;
			show(level, false);

			// Coming back up, focus belongs on whatever opened the level we
			// just left; otherwise on the panel.
			if (returning && state.opener && document.contains(state.opener)) {
				state.opener.focus();
				state.opener = null;
			} else if (returning) {
				panels[level].focus();
			}
		});

		/* ---------- the month picker ---------- */

		var monthTiles = [];

		function setMonth(m, drive) {
			state.month = m;
			monthTiles.forEach(function (t, i) {
				t.setAttribute('aria-pressed', i === m ? 'true' : 'false');
				t.classList.toggle('dccwl-month-tile-on', i === m);
			});
			// The existing widget owns every month behaviour — headline,
			// spotlight, timeline, guide chips. Drive it; never re-implement.
			if (drive !== false && speciesRoot && window.DCCWL_Widget) {
				window.DCCWL_Widget.setMonth(speciesRoot, m);
			}
		}

		function buildMonths() {
			var list = root.querySelector('[data-dccwl-month-tiles]');
			if (!list || !Array.isArray(wCfg.monthsFull)) { return; }
			var now = canalMonth();

			wCfg.monthsFull.forEach(function (name, m) {
				var li = el('li');
				var t = el('button', 'dccwl-month-tile');
				t.type = 'button';
				t.setAttribute('aria-pressed', m === state.month ? 'true' : 'false');
				t.setAttribute('aria-label', fmt(I18N.monthAria || '%s', name));
				if (m === state.month) { t.classList.add('dccwl-month-tile-on'); }
				if (m === now) {
					t.classList.add('dccwl-month-tile-now');
				}

				t.appendChild(el('span', 'dccwl-month-name', name));
				var prev = monthPreview(m);
				if (prev) { t.appendChild(el('span', 'dccwl-month-preview', prev)); }
				if (m === now) {
					t.appendChild(el('span', 'dccwl-month-now', I18N.now || 'now'));
				}

				t.addEventListener('click', function () {
					setMonth(m);
					go('species', t);
				});
				li.appendChild(t);
				list.appendChild(li);
				monthTiles.push(t);
			});
		}

		/* ---------- hub previews ---------- */

		function fillWildlifePreview() {
			var node = root.querySelector('[data-dccwl-preview="wildlife"]');
			if (!node || !Array.isArray(wCfg.species)) { return; }
			var m = canalMonth();
			var c = monthCounts(m);
			var i = wCfg.i18n || {};
			var phrase = c.peak > 1 ? fmt(i.subPeak, c.peak)
				: c.peak === 1 ? i.subPeakOne
					: fmt(i.subSpot, c.spot);
			node.textContent = fmt(I18N.hubMonth || '%1$s in %2$s', phrase, wCfg.monthsFull[m]);

			// Show the species the line is counting. Decorative — the sentence
			// above carries the meaning, so the art is aria-hidden — but it
			// gives the tile something to look at besides a number.
			var art = root.querySelector('[data-dccwl-hub-art="wildlife"]');
			if (!art || !window.DCCWL_Widget) { return; }
			art.textContent = '';
			var peak = window.DCCWL_Widget.peakFor(m).slice(0, 5);
			peak.forEach(function (sp) {
				if (!sp.sprite) { return; }
				art.appendChild(window.DCCWL_Widget.sprite(sp.id, 'dccwl-hub-sprite'));
			});
		}

		/* The Water preview is built ONLY from facts the water module already
		 * passed its own gate — label + value, nothing derived, nothing
		 * invented. No facts (fetch failed, everything stale-gated, nothing
		 * sourced) leaves the tile showing its name alone, which is the same
		 * silence the module itself keeps. */
		function fillWaterPreview(facts) {
			var node = root.querySelector('[data-dccwl-preview="water"]');
			var tile = root.querySelector('[data-dccwl-water-tile]');
			if (!node) { return; }

			var usable = (facts || []).filter(function (f) {
				return f && f.label && f.value && f.sourceName && f.group !== 'chain';
			});
			if (!usable.length) {
				node.textContent = '';
				// A live-only water section that got nothing has no content to
				// show, so the tile would be a dead end: drop it.
				if (tile && panels.water && panels.water.querySelector('[data-dccwl-water-root]') &&
					panels.water.querySelector('[data-dccwl-water-root]').hidden) {
					var li = tile.parentNode;
					if (li && li.parentNode) { li.parentNode.removeChild(li); }
				}
				return;
			}
			var shown = usable.slice(0, 2);
			node.textContent = shown.map(function (f) { return f.value; }).join(' · ');

			// Provenance at a glance, exactly as the water cards do it: the
			// source name and how old the reading is. Nothing derived.
			var art = root.querySelector('[data-dccwl-hub-art="water"]');
			if (!art) { return; }
			art.textContent = '';
			shown.forEach(function (f) {
				var chip = el('span', 'dccwl-metachip dccwl-hub-chip');
				chip.appendChild(el('span', 'dccwl-hub-chip-src', f.sourceName));
				var age = ageWords(f.date, f.datePrecision);
				if (age) {
					chip.appendChild(el('span', 'dccwl-card-dot', '·'));
					chip.appendChild(el('span', 'dccwl-card-age', age));
				}
				art.appendChild(chip);
			});
		}

		/* Age in chip-sized words, from the MEASUREMENT date the fact carried.
		 * Mirrors water.js so the hub and the cards can never disagree; returns
		 * '' when the date will not parse rather than guessing. */
		function ageWords(iso, precision) {
			if (!iso) { return ''; }
			var bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
			var then = bare ? new Date(+bare[1], +bare[2] - 1, +bare[3]) : new Date(iso);
			if (isNaN(then.getTime())) { return ''; }
			var days = Math.floor((Date.now() - then.getTime()) / 86400000);
			if (days < 0) { return ''; }
			var w = (window.DCC_WL_WATER && window.DCC_WL_WATER.i18n) || {};
			if (days === 0) { return w.ageToday || 'today'; }
			if (days < 45) { return days + (w.ageDays || 'd'); }
			if (days < 730) { return Math.round(days / 30) + (w.ageMonths || 'mo'); }
			return Math.round(days / 365) + (w.ageYears || 'y');
		}

		// water.js announces what its existing fetch returned; this file
		// never calls the REST route itself.
		waterListeners.push(fillWaterPreview);
		if (lastWaterFacts) { fillWaterPreview(lastWaterFacts); }

		/* ---------- wiring ---------- */

		root.querySelectorAll('[data-dccwl-go]').forEach(function (btn) {
			btn.addEventListener('click', function () {
				go(btn.getAttribute('data-dccwl-go'), btn);
			});
		});
		root.querySelectorAll('[data-dccwl-back]').forEach(function (btn) {
			btn.addEventListener('click', back);
		});

		buildMonths();
		fillWildlifePreview();
		setMonth(state.month);
		show('hub', false);
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
