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
				/* The aria-label REPLACES the tile's text for a screen reader, so it
				 * must carry the count too — labelling it "Wildlife in January" alone
				 * hid the one thing the tile exists to say. */
				var prevText = monthPreview(m);
				t.setAttribute('aria-label',
					fmt(I18N.monthAria || '%s', name) + (prevText ? ', ' + prevText : ''));
				if (m === state.month) { t.classList.add('dccwl-month-tile-on'); }
				if (m === now) {
					t.classList.add('dccwl-month-tile-now');
				}

				t.appendChild(el('span', 'dccwl-month-name', name));
				if (prevText) { t.appendChild(el('span', 'dccwl-month-preview', prevText)); }

				/* The species that actually peak in this month, so the picker
				 * reads as THE CANAL YEAR rather than twelve numbers — you can
				 * see the rhythm and pick when to come. Decorative: the count
				 * above carries the meaning, so the art is aria-hidden. Same
				 * bundled calendar, same peakFor() the spotlight uses. */
				if (window.DCCWL_Widget) {
					var art = el('span', 'dccwl-month-art');
					art.setAttribute('aria-hidden', 'true');
					window.DCCWL_Widget.peakFor(m).slice(0, 3).forEach(function (sp) {
						if (!sp.sprite) { return; }
						art.appendChild(window.DCCWL_Widget.sprite(sp.id, 'dccwl-month-sprite'));
					});
					if (art.childNodes.length) { t.appendChild(art); }
				}

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

		/* "April and May are the canal's fullest months" — the one line that
		 * turns twelve tiles into a plan. Computed here from the same bundled
		 * calendar the tiles use (never server-rendered, so a cached page
		 * cannot state a stale month), and it stays silent rather than saying
		 * something useless when the year has no clear peak. */
		function fillYearNote() {
			var node = root.querySelector('[data-dccwl-year-note]');
			if (!node || !Array.isArray(wCfg.monthsFull)) { return; }

			var best = -1, months = [];
			for (var m = 0; m < 12; m++) {
				var c = monthCounts(m);
				if (!c) { return; }
				if (c.peak > best) { best = c.peak; months = [ m ]; }
				else if (c.peak === best) { months.push(m); }
			}
			// No peaks at all, or so many months tie that "fullest" means
			// nothing: say nothing.
			if (best <= 0 || !months.length || months.length > 3) { return; }

			var names = months.map(function (m) { return wCfg.monthsFull[m]; });
			var list = names.length === 1
				? names[0]
				: names.slice(0, -1).join(', ') + ' ' + (I18N.and || 'and') + ' ' + names[names.length - 1];

			node.textContent = fmt(
				months.length === 1
					? (I18N.yearBestOne || '%1$s is the fullest month — %2$d species at their peak.')
					: (I18N.yearBest || '%1$s are the fullest months — %2$d species at their peak.'),
				list, best
			);
		}

		/* "Right now on the canal" — the living line (v1.14.0).
		 *
		 * Reads the REAL sunrise and sunset for these coordinates (through
		 * window.DCCWL_Sky, the one astronomy implementation, which water.js
		 * owns) and turns the hour into a phrase, then names species that are
		 * BOTH at their peak this month AND active at this hour — matched on
		 * the species' own `best` field, so the pairing comes from the same
		 * verified data the rest of the guide uses rather than a hand-written
		 * table. It therefore changes through the day AND through the year.
		 *
		 * Computed here, never server-rendered: a cached page must not be able
		 * to state the wrong hour. No sky (the water module is off, so the
		 * maths is absent) → the line stays empty rather than guessing. */

		var NOW_KEYS = {
			night:      [ 'dark', 'night' ],
			firstLight: [ 'dawn', 'early morning', 'first light' ],
			morning:    [ 'morning', 'dawn' ],
			midday:     [ 'midday', 'all day' ],
			afternoon:  [ 'afternoon', 'all day' ],
			golden:     [ 'golden', 'dusk' ],
			dusk:       [ 'dusk', 'dark' ]
		};

		/* Minutes since midnight in CANAL time — the same rule as canalMonth(). */
		function canalMinutes(d) {
			try {
				var h = 0, mi = 0;
				new Intl.DateTimeFormat('en-US', {
					timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: false
				}).formatToParts(d).forEach(function (p) {
					if (p.type === 'hour') { h = parseInt(p.value, 10); }
					if (p.type === 'minute') { mi = parseInt(p.value, 10); }
				});
				return (h % 24) * 60 + mi;
			} catch (e) {
				return d.getHours() * 60 + d.getMinutes();
			}
		}

		function fillNowLine() {
			var node = root.querySelector('[data-dccwl-now-line]');
			if (!node) { return; }

			var sky = window.DCCWL_Sky;
			var coords = (window.DCC_WL_WATER || {}).coords;
			if (!sky || !sky.sun || !coords || coords.lat == null || coords.lon == null) { return; }

			var now = new Date();
			var s = sky.sun(now, +coords.lat, +coords.lon);
			if (!s || isNaN(s.sunrise.getTime()) || isNaN(s.sunset.getTime())) { return; }

			var t = canalMinutes(now), sr = canalMinutes(s.sunrise), ss = canalMinutes(s.sunset);
			var phase;
			if (t < sr - 40 || t > ss + 35) { phase = 'night'; }
			else if (t < sr + 55) { phase = 'firstLight'; }
			else if (t < 11 * 60) { phase = 'morning'; }
			else if (t < 15 * 60) { phase = 'midday'; }
			else if (t < ss - 70) { phase = 'afternoon'; }
			else if (t <= ss) { phase = 'golden'; }
			else { phase = 'dusk'; }

			var label = I18N[{
				night: 'nowNight', firstLight: 'nowFirstLight', morning: 'nowMorning',
				midday: 'nowMidday', afternoon: 'nowAfternoon', golden: 'nowGolden', dusk: 'nowDusk'
			}[phase]];
			if (!label) { return; }

			/* Species worth looking for this month whose own "best time" matches
			 * this hour. Candidates are the same threshold the spotlight uses
			 * (value >= 2, "good chance" and up) rather than peaks only —
			 * otherwise the after-dark line has nothing to say in a month when
			 * the limpkin is merely likely. Peaks sort first, so the strongest
			 * bet is always named first. */
			var mNow = canalMonth();
			var keys = NOW_KEYS[phase] || [];
			var matches = [];
			(wCfg.species || [])
				.map(function (sp) { return { sp: sp, v: (sp.months && sp.months[mNow]) || 0 }; })
				.filter(function (x) { return x.v >= 2; })
				.sort(function (a, b) { return b.v - a.v; })
				.forEach(function (x) {
					if (matches.length >= 3) { return; }
					var best = String(x.sp.best || '').toLowerCase();
					for (var i = 0; i < keys.length; i++) {
						if (best.indexOf(keys[i]) !== -1) { matches.push(x.sp); return; }
					}
				});

			/* Don't say the same species twice on one screen: the countdown
			 * directly below already features one. Defer to it — but only when
			 * something else matches this hour, so we never trade a real name
			 * for silence. */
			var cid = (window.DCCWL_Widget || {}).countdownId;
			var pruned = cid ? matches.filter(function (sp) { return sp.id !== cid; }) : matches;
			var names = (pruned.length ? pruned : matches).slice(0, 2).map(function (sp) { return sp.name; });

			node.textContent = names.length
				? fmt(I18N.nowLook || '%1$s — look for %2$s.', label,
					names.length === 1 ? names[0] : names[0] + ' ' + (I18N.and || 'and') + ' ' + names[1])
				: fmt(I18N.nowPlain || '%s.', label);
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
		fillYearNote();
		fillNowLine();
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
