/**
 * DCC Wildlife — live water conditions.
 *
 * The page HTML is served from SpeedyCache and may be hours old, so nothing
 * time-sensitive is rendered by PHP. This script calls the plugin's REST
 * route (which serves a server-side transient) and fills the strip after
 * paint.
 *
 * Two rules mirrored from the PHP side:
 *   1. A row renders ONLY if it carries a source name. No source, no row —
 *      the same gate Water_Fact enforces server-side.
 *   2. The time shown is the MEASUREMENT time from the upstream payload,
 *      never the time we fetched it.
 *
 * All text is inserted with textContent. Nothing here parses the page's own
 * markup, so SpeedyCache's inline-JS minification on cached pages is
 * irrelevant to it.
 */
(function () {
	'use strict';

	var CFG = window.DCC_WL_WATER;
	if (!CFG || !CFG.endpoint) {
		return;
	}

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text !== undefined && text !== null) { n.textContent = text; }
		return n;
	}

	/* Does this value carry a clock worth printing?
	 *
	 * A lab sample dated to the day arrives as a midnight instant — the
	 * Atlas sends 2026-05-28T04:00:00Z, which is midnight in Florida — and
	 * USGS daily values carry no clock at all. Rendering either as
	 * "sampled May 28, 12:00 AM" claims a precision the source does not
	 * have, which is the wrong kind of detail on this module in particular.
	 *
	 * The producing code normally says so via datePrecision. This inference
	 * is the fallback for almanac rows and anything added through the
	 * filter: a bare date has no clock, and an instant landing exactly on
	 * midnight UTC or midnight Florida time is a date wearing a timestamp. */
	function hasRealTime(iso, precision) {
		if (precision === 'day') { return false; }
		if (precision === 'minute') { return true; }
		if (!/\d{2}:\d{2}/.test(String(iso))) { return false; }
		var d = new Date(iso);
		if (isNaN(d.getTime())) { return false; }
		var minutesUtc = d.getUTCHours() * 60 + d.getUTCMinutes();
		// 00:00 UTC, or 00:00 at UTC-4 (EDT) / UTC-5 (EST).
		return !(minutesUtc === 0 || minutesUtc === 240 || minutesUtc === 300);
	}

	/* The calendar date the SOURCE meant, not whatever it becomes in the
	 * viewer's timezone.
	 *
	 * This matters more than it looks. `new Date('2026-08-22')` parses as
	 * midnight UTC, so a viewer anywhere west of UTC would have seen
	 * "Aug 21" for an Aug 22 reading — the wrong date, on a module whose
	 * whole point is not misstating what is known. Same for the Atlas's
	 * midnight-in-Florida instants. So a date-only value is reduced to its
	 * own year/month/day and rebuilt locally, never converted.
	 *
	 * @return {Array|null} [year, month, day]
	 */
	function dateOnlyParts(iso) {
		var bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
		if (bare) { return [ +bare[1], +bare[2], +bare[3] ]; }

		var d = new Date(iso);
		if (isNaN(d.getTime())) { return null; }
		// Shift back to the source's own midnight (UTC, EDT or EST), then
		// read the date off that.
		var minutesUtc = d.getUTCHours() * 60 + d.getUTCMinutes();
		var atMidnight = new Date(d.getTime() - minutesUtc * 60000);
		return [ atMidnight.getUTCFullYear(), atMidnight.getUTCMonth() + 1, atMidnight.getUTCDate() ];
	}

	/* Render an ISO instant in the visitor's locale. Falls back to the raw
	 * string rather than inventing a format we cannot verify. */
	function readingTime(iso, precision) {
		if (!iso) { return ''; }
		var d = new Date(iso);
		if (isNaN(d.getTime())) { return String(iso); }
		try {
			if (!hasRealTime(iso, precision)) {
				var parts = dateOnlyParts(iso);
				if (!parts) { return String(iso); }
				// The year is shown too: these run months or years old, and
				// "May 28" alone hides which May.
				return new Date(parts[0], parts[1] - 1, parts[2])
					.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
			}
			return d.toLocaleString(undefined, {
				month: 'short', day: 'numeric',
				hour: 'numeric', minute: '2-digit'
			});
		} catch (e) {
			return d.toISOString();
		}
	}

	/* How old is this reading, in words short enough for a chip?
	 *
	 * Computed from the MEASUREMENT date the payload carried, never from
	 * when we fetched it, and read in the source's own frame so a date-only
	 * value cannot slip a day. Returns '' when the date will not parse —
	 * the card then shows its attribution line without an age claim rather
	 * than guessing one. */
	function ageWords(iso, precision, i18n) {
		if (!iso) { return ''; }
		var then;
		if (!hasRealTime(iso, precision)) {
			var parts = dateOnlyParts(iso);
			if (!parts) { return ''; }
			then = new Date(parts[0], parts[1] - 1, parts[2]);
		} else {
			then = new Date(iso);
		}
		if (isNaN(then.getTime())) { return ''; }

		var days = Math.floor((Date.now() - then.getTime()) / 86400000);
		if (days < 0) { return ''; }          // clock skew: say nothing
		if (days === 0) { return i18n.ageToday || 'today'; }
		if (days < 45) { return days + (i18n.ageDays || 'd'); }
		if (days < 730) { return Math.round(days / 30) + (i18n.ageMonths || 'mo'); }
		return Math.round(days / 365) + (i18n.ageYears || 'y');
	}

	/* One reading = one data card.
	 *
	 * The gate is unchanged and still absolute: no source name, no card.
	 * 1.9.0 adds the source+age CHIP so provenance is legible at a glance;
	 * the full source name and measurement date stay printed beneath it, so
	 * the chip summarises the attribution rather than replacing it. */
	function buildCard(f) {
		// Belt and braces: the server already dropped unsourced facts.
		if (!f || !f.label || !f.value || !f.sourceName) { return null; }

		var i18n = CFG.i18n || {};
		var li = el('li', 'dccwl-card dccwl-water-fact dccwl-water-tier-' + (f.tier || 'live'));

		var head = el('div', 'dccwl-card-head');
		head.appendChild(el('span', 'dccwl-card-label', f.label));

		// Source + age chip.
		var age = ageWords(f.date, f.datePrecision, i18n);
		var chip = el('span', 'dccwl-metachip dccwl-card-src');
		chip.appendChild(el('span', 'dccwl-card-srcname', f.sourceName));
		if (age) {
			chip.appendChild(el('span', 'dccwl-card-dot', '·'));
			chip.appendChild(el('span', 'dccwl-card-age', age));
		}
		head.appendChild(chip);
		li.appendChild(head);

		li.appendChild(el('p', 'dccwl-card-value', f.value));

		// Full attribution: the source (linked where there is a URL) and the
		// measurement time, worded by the fact itself.
		var attr = el('p', 'dccwl-water-attr');
		if (f.sourceUrl) {
			var a = el('a', null, f.sourceName);
			a.href = f.sourceUrl;
			a.rel = 'noopener nofollow';
			a.target = '_blank';
			attr.appendChild(a);
		} else {
			attr.appendChild(document.createTextNode(f.sourceName));
		}

		var when = readingTime(f.date, f.datePrecision);
		if (when) {
			// The wording comes from the fact: a gauge is "read", a lab
			// sample is "sampled", a survey is "surveyed". Falls back to the
			// generic word rather than asserting the wrong one.
			var prefix = f.dateLabel || i18n.asOf || 'reading';
			attr.appendChild(el('span', 'dccwl-water-date', prefix + ' ' + when));
		}
		if (f.note) {
			attr.appendChild(el('span', 'dccwl-water-note', f.note));
		}
		li.appendChild(attr);
		return li;
	}

	/* ------------------------------------------------------------------
	 * FOLD THE SOURCE LINE INTO THE CHIP (1.33.0, owner's request)
	 *
	 * Every fact card carried its source twice: a chip summarising it, and a
	 * two-to-three-line attribution under the value. On a phone that is most
	 * of the panel's height, repeated for every reading.
	 *
	 * The chip becomes the control and the attribution becomes its panel. Done
	 * HERE rather than in the markup, and to server-rendered and client-built
	 * cards alike, so there is one implementation and the two cannot drift —
	 * and so that with no JavaScript the card still prints its full
	 * attribution in plain sight, which is what the fact gate requires. A
	 * folded source must never be a missing one.
	 * ------------------------------------------------------------------ */
	var srcSeq = 0;

	function foldSources(scope) {
		(scope || document).querySelectorAll('.dccwl-card').forEach(function (card) {
			if (card.getAttribute('data-dccwl-src-folded')) { return; }
			var chip = card.querySelector('.dccwl-card-src');
			var attr = card.querySelector('.dccwl-water-attr');
			if (!chip || !attr || 'BUTTON' === chip.tagName) { return; }
			card.setAttribute('data-dccwl-src-folded', '1');

			var i18n = CFG.i18n || {};
			srcSeq += 1;
			var id = 'dccwl-src-' + srcSeq;
			attr.id = id;
			attr.hidden = true;

			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = chip.className + ' dccwl-card-src-toggle';
			btn.setAttribute('aria-controls', id);
			btn.setAttribute('aria-expanded', 'false');
			// The chip already reads as "USGS · 3d"; the accessible name says
			// what pressing it does, which the visible text does not.
			var chipWords = chip.textContent.replace(/\s+/g, ' ').trim();
			btn.setAttribute('aria-label',
				String(i18n.srcToggle || 'Source: %s — show where this reading came from')
					.replace('%s', chipWords));
			while (chip.firstChild) { btn.appendChild(chip.firstChild); }
			var caret = el('span', 'dccwl-card-src-caret');
			caret.setAttribute('aria-hidden', 'true');
			caret.textContent = '\u25be';
			btn.appendChild(caret);
			chip.parentNode.replaceChild(btn, chip);

			btn.addEventListener('click', function () {
				var open = 'true' === btn.getAttribute('aria-expanded');
				btn.setAttribute('aria-expanded', open ? 'false' : 'true');
				attr.hidden = open;
			});
		});
	}

	/* ITEM 3 (1.34.0, pick B) — the Map tab's three stat tiles.
	 *
	 * Filled from the SAME gated facts the Now tab renders: a tile can only
	 * ever show a number a source returned, with that source named under it.
	 * A tile with no fact stays hidden, which is the same rule the whole
	 * module follows — an absent reading is absent, never "unknown". */
	var STAT_KEYS = { level: 1, clarity: 1, wind: 1 };

	function fillStats(section, facts) {
		var wrap = section && section.querySelector('[data-dccwl-water-stats]');
		if (!wrap) { return; }
		var shown = 0;
		facts.forEach(function (f) {
			if (!f || !f.key || !STAT_KEYS[f.key] || !f.value || !f.sourceName) { return; }
			if (f.group === 'chain') { return; }
			var li = wrap.querySelector('[data-dccwl-stat="' + f.key + '"]');
			if (!li) { return; }
			var v = li.querySelector('[data-dccwl-stat-value]');
			var sub = li.querySelector('[data-dccwl-stat-sub]');
			if (v) { v.textContent = f.value; }
			if (sub) { sub.textContent = f.sourceName; }
			li.hidden = false;
			shown += 1;
		});
		if (shown > 0) { wrap.hidden = false; }
	}

	function fill(root, facts) {
		var list = root.querySelector('[data-dccwl-water-facts]');
		if (!list) { return; }
		list.textContent = '';

		// Chain comparison rows render in their own list beneath the primary
		// water's conditions — same gate, different section.
		var chainList = root.querySelector('[data-dccwl-water-chain]');
		var chainWrap = root.querySelector('[data-dccwl-chain]');
		if (chainList) { chainList.textContent = ''; }

		var shown = 0;
		var chainShown = 0;
		facts.forEach(function (f) {
			var row = buildCard(f);
			if (!row) { return; }
			if (f.group === 'chain' && chainList) {
				chainList.appendChild(row);
				chainShown += 1;
			} else {
				list.appendChild(row);
				shown += 1;
			}
		});
		if (chainWrap && chainShown > 0) { chainWrap.hidden = false; }
		fillStats(root.closest('[data-dccwl-water-root]') || document, facts);
		shown += chainShown;

		/* The same deck the species tiles use (1.23.0), on the lists that just
		 * received cards. Attached after filling, because a deck measures what
		 * is in it; refreshed as well as attached, since a later /conditions
		 * refresh replaces these cards wholesale. */
		if (window.DCCWL_Deck) {
			[ [ list, shown - chainShown ], [ chainList, chainShown ] ].forEach(function (pair) {
				if (!pair[0] || pair[1] < 1) { return; }
				window.DCCWL_Deck.attach(pair[0], CFG.i18n || {});
				window.DCCWL_Deck.refresh(pair[0], CFG.i18n || {});
			});
		}

		// Nothing usable: leave the strip hidden rather than showing an
		// empty box or an error. The almanac below stands on its own.
		if (shown > 0) {
			root.hidden = false;
			// When the module has no static content it was emitted hidden
			// entirely, so a failed fetch leaves the page clean. Real
			// readings arrived, so reveal it.
			var section = root.closest('[data-dccwl-water-root]');
			if (section) { section.hidden = false; }
		}
	}

	/* Tell anything listening what the conditions call returned. Detail is
	 * the gated facts themselves — no derived claims travel with it. */
	function announce(facts) {
		try {
			document.dispatchEvent(new CustomEvent('dccwl:water-facts', {
				detail: { facts: facts || [] }
			}));
		} catch (e) { /* very old browsers: the strip still fills */ }
	}

	/* The wind as its parts, straight from the conditions call (1.35.0). The
	 * map badge is drawn from this; nothing fetches it again, and a map that
	 * is never opened costs nothing for it. */
	var windParts = null;

	function init() {
		var roots = document.querySelectorAll('[data-dccwl-water-live]');
		if (!roots.length) { return; }

		window.fetch(CFG.endpoint, { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (data) {
				var facts = (data && data.enabled && Array.isArray(data.facts)) ? data.facts : [];
				/* A payload cached before 1.35.0 has no wind block; the badge
				 * simply does not draw until that cache turns over. */
				windParts = (data && data.wind && data.wind.speed) ? data.wind : null;
				// Announce what this ONE existing call returned, so the 1.10.0
				// hub can show a preview without a second request. Fired even
				// when empty: "nothing sourced" is the signal the hub needs in
				// order to stay silent.
				announce(facts);
				if (!facts.length) { return; }
				roots.forEach(function (root) { fill(root, facts); foldSources(root); });
			})
			.catch(function () {
				announce([]);   // guests see the almanac; never an error
			});
	}

	/* ------------------------------------------------------------------
	 * Map: nothing external loads until a guest presses the button.
	 *
	 * Leaflet, its stylesheet, the tiles and the map data are ALL fetched
	 * on demand. A guest who never opens the map pays nothing for it —
	 * which is the whole reason this is a button and not an embed.
	 * ---------------------------------------------------------------- */

	function loadCss(href) {
		return new Promise(function (resolve, reject) {
			if (!href) { resolve(); return; }
			if (document.querySelector('link[data-dccwl-leaflet]')) { resolve(); return; }
			var l = document.createElement('link');
			l.rel = 'stylesheet';
			l.href = href;
			l.setAttribute('data-dccwl-leaflet', '1');
			l.onload = resolve;
			l.onerror = reject;
			document.head.appendChild(l);
		});
	}

	function loadScript(src, test) {
		return new Promise(function (resolve, reject) {
			if (test && test()) { resolve(); return; }
			if (!src) { reject(); return; }
			var sc = document.createElement('script');
			sc.src = src;
			sc.async = true;
			sc.onload = resolve;
			sc.onerror = reject;
			document.head.appendChild(sc);
		});
	}

	function initMap() {
		var wrap = document.querySelector('[data-dccwl-map-wrap]');
		var cfg = CFG.map;
		if (!wrap || !cfg) { return; }

		var btn = wrap.querySelector('[data-dccwl-map-open]');
		if (!btn) { return; }
		/* One listener per button, ever. initMap() queries the whole document,
		 * so an Elementor re-render of ONE widget would otherwise re-bind the
		 * map buttons of every other widget on the page — two listeners, two
		 * sheets, two REST calls. (1.33.0) */
		if (btn.getAttribute('data-dccwl-map-init')) { return; }
		btn.setAttribute('data-dccwl-map-init', '1');

		// A live-only section is emitted hidden and normally revealed when
		// readings arrive — but the map is served independently of the
		// conditions strip (cached ramps and readings can be available while
		// the strip is empty), so a section that offers a map must not stay
		// unreachable behind an empty strip.
		var section = wrap.closest('[data-dccwl-water-root]');
		if (section) { section.hidden = false; }

		// Fetched once and kept: reopening the sheet must not re-hit the
		// REST route, and through it the upstream APIs.
		var mapData = null;
		var label = btn.textContent;
		/* Which colouring the map should open on. A stat tile sets it before
		 * it presses this button; the button on its own leaves it empty and
		 * the map keeps its own default. One variable, read at open time, so
		 * the map never holds a stale request. */
		var wantColour = '';

		function openSheet() {
			window.DCCWL_Sheet.open({
				title: (CFG.i18n && CFG.i18n.mapTitle) || label,
				appClasses: (CFG.appClasses || 'dccwl-app'),
				closeLabel: (CFG.i18n && CFG.i18n.mapClose) || 'Close',
				closeAllLabel: (CFG.i18n && CFG.i18n.closeAll) || 'Close',
				opener: btn,
				tall: true,
				build: function (body) {
					// The map wants the whole sheet: no padding, no scroll of
					// its own — Leaflet handles panning inside the canvas.
					body.classList.add('dccwl-sheet-body-map');
					var mapCfg = cfg;
					if (wantColour || windParts) {
						mapCfg = {};
						Object.keys(cfg).forEach(function (k) { mapCfg[k] = cfg[k]; });
						if (wantColour) { mapCfg.colour = wantColour; }
						if (windParts) { mapCfg.wind = windParts; }
					}
					window.DCCWL_Map.init(body, mapData, mapCfg, (CFG.i18n || {}));
				},
				onClose: function () {
					btn.textContent = label;
				}
			});
		}

		/* The stat tiles are the other way in. Each asks for the map coloured
		 * by its own reading where the map has that colouring (Level,
		 * Clarity); Wind has none, so its tile opens the map plain rather
		 * than inventing a colouring the data cannot support. */
		var statWrap = (section || document).querySelector('[data-dccwl-water-stats]');
		if (statWrap && !statWrap.getAttribute('data-dccwl-stats-init')) {
			statWrap.setAttribute('data-dccwl-stats-init', '1');
			statWrap.addEventListener('click', function (ev) {
				var t = ev.target.closest ? ev.target.closest('[data-dccwl-stat-colour]') : null;
				if (!t) { return; }
				wantColour = t.getAttribute('data-dccwl-stat-colour') || '';
				btn.click();
			});
		}

		btn.addEventListener('click', function (ev) {
			if (!window.DCCWL_Sheet) { return; }
			// A press of the button ITSELF asks for no particular colouring;
			// only a stat tile's synthetic press carries one.
			if (ev && ev.isTrusted) { wantColour = ''; }
			if (mapData) {
				// Already loaded once — straight back to the sheet.
				openSheet();
				return;
			}

			btn.disabled = true;
			btn.textContent = (CFG.i18n && CFG.i18n.mapLoading) || 'Loading…';

			loadCss(cfg.leafletCss)
				.then(function () {
					return loadScript(cfg.leafletJs, function () { return !!window.L; });
				})
				.then(function () {
					return loadScript(cfg.script, function () { return !!window.DCCWL_Map; });
				})
				.then(function () {
					if (!window.L || !window.DCCWL_Map) { throw new Error('map deps'); }
					return window.fetch(cfg.endpoint, { credentials: 'same-origin' })
						.then(function (r) { return r.json(); });
				})
				.then(function (data) {
					if (!data || !data.enabled) { throw new Error('map disabled'); }
					mapData = data;
					btn.disabled = false;
					btn.textContent = label;
					openSheet();
				})
				.catch(function () {
					btn.disabled = false;
					btn.textContent = (CFG.i18n && CFG.i18n.mapFailed) || 'Map unavailable';
				});
		});
	}

	/* ------------------------------------------------------------------
	 * "Tonight on the canal" — the moon (v1.12.0).
	 *
	 * Pure astronomy, ZERO network: Meeus' phase-angle formula, computed at
	 * the visitor's load time (a moon phase is a global instant, so no
	 * timezone is needed — and computing it client-side keeps it out of the
	 * SpeedyCache HTML, same doctrine as every other time-sensitive value
	 * here). The disk is drawn geometrically with createElementNS; every
	 * string comes from CFG.i18n.moon and is inserted with textContent. It
	 * ties tonight's sky to the FWC full-moon fishing facts and the canal's
	 * after-dark wildlife.
	 * ---------------------------------------------------------------- */

	var MOON_D2R = Math.PI / 180, MOON_DEG_PER_DAY = 12.190749117;
	function moonNorm(x) { x = x % 360; return x < 0 ? x + 360 : x; }

	function computeMoon(date) {
		var jd = date.getTime() / 86400000 + 2440587.5;   // JS epoch → Julian Day
		var d  = jd - 2451545.0;                           // days since J2000
		var D  = moonNorm(297.8501921 + MOON_DEG_PER_DAY * d);  // mean elongation
		var M  = moonNorm(357.5291092 + 0.98560028 * d);        // Sun mean anomaly
		var Mp = moonNorm(134.9633964 + 13.064992297 * d);      // Moon mean anomaly
		var i  = 180 - D
			- 6.289 * Math.sin(Mp * MOON_D2R)
			+ 2.100 * Math.sin(M * MOON_D2R)
			- 1.274 * Math.sin((2 * D - Mp) * MOON_D2R)
			- 0.658 * Math.sin(2 * D * MOON_D2R)
			- 0.214 * Math.sin(2 * Mp * MOON_D2R)
			- 0.110 * Math.sin(D * MOON_D2R);
		return {
			illum: (1 + Math.cos(i * MOON_D2R)) / 2,
			waxing: D < 180,
			toFull: moonNorm(180 - D) / MOON_DEG_PER_DAY,
			sinceFull: moonNorm(D - 180) / MOON_DEG_PER_DAY,
			nearestFull: Math.min(moonNorm(180 - D), moonNorm(D - 180)) / MOON_DEG_PER_DAY
		};
	}

	function moonPhaseKey(m) {
		var k = m.illum, wax = m.waxing;
		if (k < 0.015) { return 'new'; }
		if (k > 0.985) { return 'full'; }
		if (Math.abs(k - 0.5) < 0.06) { return wax ? 'firstQuarter' : 'lastQuarter'; }
		if (k < 0.5) { return wax ? 'waxingCrescent' : 'waningCrescent'; }
		return wax ? 'waxingGibbous' : 'waningGibbous';
	}

	/* The moon, drawn: a dark disk with the lit region on top. All geometry,
	 * no data — safe to build in the SVG namespace. */
	function moonDisk(R, k, wax) {
		var NS = 'http://www.w3.org/2000/svg', size = R * 2 + 8, c = size / 2;
		var svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
		svg.setAttribute('width', size); svg.setAttribute('height', size);
		svg.setAttribute('class', 'dccwl-moon-disk');
		svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
		function disc(r, fill, stroke) {
			var e = document.createElementNS(NS, 'circle');
			e.setAttribute('cx', c); e.setAttribute('cy', c); e.setAttribute('r', r);
			if (fill) { e.setAttribute('fill', fill); }
			if (stroke) { e.setAttribute('fill', 'none'); e.setAttribute('stroke', stroke); e.setAttribute('stroke-width', '1'); }
			return e;
		}
		svg.appendChild(disc(R, '#1b3a44'));
		k = Math.max(0, Math.min(1, k));
		if (k > 0.004) {
			var f = 2 * k - 1, rt = (R * Math.abs(f)).toFixed(3);
			var outer = wax ? 1 : 0, term = wax ? (f >= 0 ? 1 : 0) : (f >= 0 ? 0 : 1);
			var p = document.createElementNS(NS, 'path');
			p.setAttribute('d', 'M' + c + ',' + (c - R) + ' A' + R + ',' + R + ' 0 0 ' + outer + ' ' + c + ',' + (c + R) +
				' A' + rt + ',' + R + ' 0 0 ' + term + ' ' + c + ',' + (c - R) + ' Z');
			p.setAttribute('fill', '#eef3f0');
			svg.appendChild(p);
		}
		svg.appendChild(disc(R, null, 'rgba(255,255,255,.14)'));
		return svg;
	}

	function moonLine(m, t) {
		function nights(n) { n = Math.round(n); return n + ' ' + (n === 1 ? (t.night || 'night') : (t.nights || 'nights')); }
		var key = moonPhaseKey(m), pct = Math.round(m.illum * 100);
		if (key === 'full' || m.nearestFull < 0.6) { return t.lineFull || ''; }
		if (m.waxing && m.toFull <= 7) { return (t.lineToFull || '%s').replace('%s', nights(m.toFull)); }
		if (!m.waxing && m.sinceFull <= 7) { return (t.lineSinceFull || '%s').replace('%s', nights(m.sinceFull)); }
		if (m.illum < 0.10) { return t.lineDark || ''; }
		return (t.lineGeneric || '%1$s %2$d%').replace('%1$s', (t[key] || '').toLowerCase()).replace('%2$d', pct);
	}

	/* Sunrise/sunset for the canal's own coordinates — the standard sunrise
	 * equation. Returns UTC instants; the caller renders them in canal time.
	 * Dawn and dusk are the canal's most active wildlife hours, so this is the
	 * "best light" companion to the moon. */
	function sunTimes(date, lat, lonEast) {
		var rad = Math.PI / 180, lw = -lonEast;               // west longitude positive
		var jd = date.getTime() / 86400000 + 2440587.5;
		var n  = Math.round(jd - 2451545.0 - 0.0009 - lw / 360);
		var Js = 2451545.0 + 0.0009 + lw / 360 + n;           // approx solar noon (west lon → later UTC)
		var M  = ((357.5291 + 0.98560028 * (Js - 2451545.0)) % 360) * rad;
		var C  = 1.9148 * Math.sin(M) + 0.0200 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M);
		var lam = (M / rad + C + 180 + 102.9372) % 360 * rad;
		var Jt = Js + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * lam);
		var dec = Math.asin(Math.sin(lam) * Math.sin(23.4397 * rad));
		var cosO = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) /
			(Math.cos(lat * rad) * Math.cos(dec));
		if (cosO > 1 || cosO < -1) { return null; }           // sun up/down all day
		var O = Math.acos(cosO) / rad / 360;
		function toDate(J) { return new Date((J - 2440587.5) * 86400000); }
		return { sunrise: toDate(Jt - O), sunset: toDate(Jt + O) };
	}
	function fmtCanalTime(d) {
		try {
			return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
		} catch (e) {
			return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
		}
	}

	/* ONE astronomy implementation, shared. The moon card here uses it, and the
	 * canal hub's "right now" line reads it through this handle rather than
	 * carrying a second copy of the maths. Exposed only once water.js actually
	 * runs, so a page without the water module simply has no sky — and the hub
	 * stays silent rather than guessing. */
	window.DCCWL_Sky = {
		moon: computeMoon,
		phase: moonPhaseKey,
		sun: sunTimes,
		time: fmtCanalTime
	};

	function initMoon() {
		var host = document.querySelector('[data-dccwl-moon]');
		if (!host) { return; }
		var t = (CFG.i18n && CFG.i18n.moon) || {};
		var m = computeMoon(new Date());
		var key = moonPhaseKey(m);
		host.textContent = '';
		// A quiet reward for being here on a full-moon night: the card glows.
		host.classList.toggle('dccwl-moon-full', key === 'full');
		host.appendChild(moonDisk(30, m.illum, m.waxing));
		var txt = el('div', 'dccwl-moon-text');
		txt.appendChild(el('p', 'dccwl-moon-label', t.label || 'Tonight on the canal'));
		txt.appendChild(el('p', 'dccwl-moon-phase', (t[key] || '') + ' · ' + Math.round(m.illum * 100) + '%'));
		var why = moonLine(m, t);
		if (why) { txt.appendChild(el('p', 'dccwl-moon-why', why)); }
		// Best light — sunrise & sunset in canal time, the most active hours.
		var co = CFG.coords;
		if (co && co.lat != null && co.lon != null) {
			var sun = sunTimes(new Date(), +co.lat, +co.lon);
			if (sun && !isNaN(sun.sunrise.getTime()) && !isNaN(sun.sunset.getTime())) {
				txt.appendChild(el('p', 'dccwl-moon-light',
					(t.light || 'First light %1$s · last light %2$s')
						.replace('%1$s', fmtCanalTime(sun.sunrise))
						.replace('%2$s', fmtCanalTime(sun.sunset))));
			}
		}
		host.appendChild(txt);
		host.hidden = false;
		var section = host.closest('[data-dccwl-water-root]');
		if (section) { section.hidden = false; }
	}

	/* ------------------------------------------------------------------
	 * NOW / FISHING / ABOUT (1.33.0, owner's decision)
	 *
	 * The control is server-rendered HIDDEN and unhidden here, and the panels
	 * are all visible until this runs. With no JavaScript the guest gets the
	 * whole panel in one scroll, exactly as before — never two thirds of it
	 * behind buttons that do nothing.
	 *
	 * THE PANEL OPENS ON NOW EVERY TIME, not just the first: the hub fires
	 * `dccwl:panel-shown` whenever it reveals a panel, and that resets the
	 * choice. A guest who went Water → About → back → Water was otherwise
	 * returned to About, which is not where a water panel should start.
	 * ------------------------------------------------------------------ */
	function initWaterTabs(scope) {
		(scope || document).querySelectorAll('[data-dccwl-water-tabs]').forEach(function (bar) {
			var root = bar.closest('[data-dccwl-water-root]') || document;
			var btns = [].slice.call(bar.querySelectorAll('[data-dccwl-water-tab-btn]'));
			var panes = [].slice.call(root.querySelectorAll('[data-dccwl-water-tab]'));
			if (!btns.length || !panes.length) { return; }

			function select(slug) {
				var known = btns.some(function (b) { return b.getAttribute('data-dccwl-water-tab-btn') === slug; });
				if (!known) { slug = btns[0].getAttribute('data-dccwl-water-tab-btn'); }
				btns.forEach(function (b) {
					b.setAttribute('aria-pressed',
						b.getAttribute('data-dccwl-water-tab-btn') === slug ? 'true' : 'false');
				});
				panes.forEach(function (p) {
					p.hidden = p.getAttribute('data-dccwl-water-tab') !== slug;
				});
				/* The deck inside a pane measured zero while the pane was
				 * hidden and decided it had nothing to page through. Tell it
				 * to look again now that it has a size. */
				if (window.DCCWL_Deck) {
					panes.forEach(function (p) {
						if (p.hidden) { return; }
						p.querySelectorAll('[data-dccwl-deck-init]').forEach(function (d) {
							window.DCCWL_Deck.refreshSoon(d, (CFG.i18n || {}));
						});
					});
				}
			}

			if (bar.getAttribute('data-dccwl-tabs-init')) { return; }
			bar.setAttribute('data-dccwl-tabs-init', '1');
			bar.hidden = false;
			btns.forEach(function (b) {
				b.addEventListener('click', function () {
					select(b.getAttribute('data-dccwl-water-tab-btn'));
				});
			});
			/* The FIRST tab in the bar, never a named one. 1.34.0 made Map
			 * first (item 3) and this line still said 'now', so the bar read
			 * Map · Now · Fishing and opened on Now — the order and the
			 * default disagreeing, which is exactly what naming a tab here
			 * invites. The order is now the only place the default lives. */
			select(btns[0].getAttribute('data-dccwl-water-tab-btn'));

			// Re-opened from the hub: back to the first tab, every time.
			var panel = bar.closest('.dccwl-panel') || root;
			if (panel && panel.addEventListener) {
				/* Back to the first tab, whatever it is — since 1.34.0 that is
				 * Map. Naming a tab here would quietly disagree with the bar
				 * the moment the order changes, which is exactly what it did. */
				panel.addEventListener('dccwl:panel-shown', function () {
					select(btns[0].getAttribute('data-dccwl-water-tab-btn'));
				});
			}
		});
	}

	/* ITEM 10 (1.34.0, pick A) — the season picker.
	 *
	 * Rendered hidden with every season visible, so a guest with no
	 * JavaScript reads the whole year in one scroll instead of meeting four
	 * dead buttons. Here it is unhidden and the CURRENT season opened —
	 * worked out in canal time from the months each row declares, never
	 * server-side, because the page is cached. A row that declares no months
	 * (an owner wrote a label this locale's month names are not in) simply
	 * never wins, and the first season opens. */
	function canalMonth() {
		try {
			var p = new Date().toLocaleDateString('en-US', {
				timeZone: 'America/New_York', month: 'numeric'
			});
			var m = parseInt(p, 10);
			if (m >= 1 && m <= 12) { return m; }
		} catch (e) { /* fall through */ }
		return new Date().getMonth() + 1;
	}

	function initFishSeasons(scope) {
		(scope || document).querySelectorAll('[data-dccwl-fish-seasons]').forEach(function (bar) {
			var wrap = bar.closest('[data-dccwl-fishing]') || document;
			var btns = [].slice.call(bar.querySelectorAll('[data-dccwl-fish-season-btn]'));
			var panes = [].slice.call(wrap.querySelectorAll('[data-dccwl-fish-season]'));
			if (!btns.length || !panes.length) { return; }

			function select(idx) {
				btns.forEach(function (b) {
					b.setAttribute('aria-pressed',
						b.getAttribute('data-dccwl-fish-season-btn') === idx ? 'true' : 'false');
				});
				panes.forEach(function (p) {
					p.hidden = p.getAttribute('data-dccwl-fish-season') !== idx;
				});
			}

			if (!bar.getAttribute('data-dccwl-fish-init')) {
				bar.setAttribute('data-dccwl-fish-init', '1');
				bar.addEventListener('click', function (ev) {
					var b = ev.target.closest ? ev.target.closest('[data-dccwl-fish-season-btn]') : null;
					if (b) { select(b.getAttribute('data-dccwl-fish-season-btn')); }
				});
			}

			var now = canalMonth();
			var want = panes[0].getAttribute('data-dccwl-fish-season');
			panes.forEach(function (p) {
				var months = (p.getAttribute('data-dccwl-fish-months') || '').split(',');
				if (months.indexOf(String(now)) >= 0) {
					want = p.getAttribute('data-dccwl-fish-season');
				}
			});
			bar.hidden = false;
			select(want);
		});
	}

	function boot() {
		initMoon();
		init();
		initMap();
		// Server-rendered cards (the almanac, "About the water") are here from
		// the first paint; the live ones fold as they are built, in fill().
		foldSources(document);
		initWaterTabs(document);
		initFishSeasons(document);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}

	/* Elementor's editor re-renders a widget after page load when you edit it,
	 * so DOMContentLoaded has long gone by the time the new markup exists.
	 * widget.js and canal.js have had this hook since the editor preview was
	 * first wired up; the water panel never did, which is why an edited water
	 * widget sat inert in the editor until the page was reloaded. (1.33.0)
	 *
	 * boot() queries the whole document rather than the re-rendered scope, so
	 * the one part that attaches a listener — the map button — carries a
	 * per-node guard. initMoon() rebuilds its card from scratch each time and
	 * init() refills whatever live roots exist, both of which are safe to
	 * repeat; only the listener was not. */
	window.addEventListener('elementor/frontend/init', function () {
		if (!window.elementorFrontend || !window.elementorFrontend.hooks) { return; }
		window.elementorFrontend.hooks.addAction(
			'frontend/element_ready/dccwl_water.default',
			function () { boot(); }
		);
	});
})();
