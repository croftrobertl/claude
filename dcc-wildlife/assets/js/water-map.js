/**
 * DCC Wildlife — the chain map.
 *
 * Loaded ON DEMAND only: this file, Leaflet, its stylesheet, the tiles and
 * the map data are all fetched when a guest presses "Open the chain map"
 * and never before. A guest who never opens it pays nothing.
 *
 * Layout follows the owner's own Croatia map — bottom control bar, a
 * "Colour by" segmented control, a "Layers" dropdown of checkboxes and a
 * fullscreen button — but the palette is DCC's, not Croatia's, and the
 * type and tap targets are sized for fishermen, boaters and retirees
 * reading a phone in sunlight.
 *
 * Everything drawn here comes from the same cached readings as the text
 * above it, so the map can never disagree with the page. All dynamic text
 * is inserted with textContent.
 */
(function () {
	'use strict';

	/* DCC palette — the Guest Guide's, not Croatia's (1.9.1). The colour-by
	 * ramps below are data encoding rather than brand, so they are left
	 * alone: they exist to keep clear/usual/murky and fresh/stale
	 * distinguishable, which is a different job from matching the Guide. */
	var C = {
		navy: '#0f6dbf',
		coral: '#f08080',
		clear: '#2b7bb9',   // clearer than its own median
		usual: '#4d7d86',   // about its own median
		murky: '#b07d3a',   // murkier than its own median
		high: '#2b7bb9',
		near: '#4d7d86',
		low: '#b07d3a',
		fresh: '#2e7d5b',
		months: '#b07d3a',
		years: '#8a97a0',
		stale: '#9aa7ae',   // any reading too old to state as current
		ramp: '#f08080',
		rampClosed: '#8a97a0',
		home: '#0f6dbf'
	};

	/* Thresholds mirror the PHP side so map and text agree. */
	var CLEARER = 1.5, MURKIER = 0.67, LEVEL_NEAR_IN = 2;

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text !== undefined && text !== null) { n.textContent = text; }
		return n;
	}

	/* ==================================================================
	 * THE WIND BADGE (1.35.0, Rob's option C)
	 *
	 * One National Weather Service forecast for the property's grid square,
	 * pinned to the corner of the canvas. What it may and may not claim:
	 *
	 * - NOT PER-LAKE. There is one reading for the whole chain, so nothing is
	 *   drawn on the water. A field of arrows over the lakes would be the
	 *   convention for data that varies across space, and this does not vary.
	 * - THE SPEED STRING IS PRINTED WHOLE. NWS issues "5 to 10 mph" as often
	 *   as "10 mph"; reducing a range to one number would invent precision.
	 * - THE ARROW IS A 16-POINT SECTOR, which is exactly what the API gives.
	 *   An unrecognised or absent direction draws NO arrow rather than a
	 *   guessed one — the reading still shows, as a speed alone.
	 * - THE SOURCE IS VISIBLE. Every other reading in this module names its
	 *   source beside it, and a number without provenance is the one thing
	 *   this module does not ship.
	 *
	 * Meteorological convention: a direction is where the wind comes FROM, so
	 * the arrow points the opposite way — the way it blows.
	 * ================================================================== */
	var SECTORS = {
		N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
		S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
	};

	function svgNode(tag, attrs) {
		var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
		Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
		return n;
	}

	function windBadge(wind, i18n) {
		if (!wind || !wind.speed) { return null; }
		var dir = String(wind.dir || '').toUpperCase();
		var box = el('div', 'dccwl-wind-badge');

		if (Object.prototype.hasOwnProperty.call(SECTORS, dir)) {
			var svg = svgNode('svg', {
				viewBox: '-30 -30 60 60', width: '44', height: '44',
				'aria-hidden': 'true', focusable: 'false'
			});
			svg.setAttribute('class', 'dccwl-wind-rose');
			svg.appendChild(svgNode('circle', { r: '27', class: 'dccwl-wind-dial' }));
			var n = svgNode('text', { y: '-17', 'text-anchor': 'middle', class: 'dccwl-wind-n' });
			n.textContent = i18n.windNorth || 'N';
			svg.appendChild(n);
			/* +180: the sector says where it comes FROM; the arrow shows where
			 * it goes. Wrapped to 0-359 — rotate(405) draws identically to
			 * rotate(45), but a value nobody can read at a glance is a value
			 * nobody can check. */
			var g = svgNode('g', { transform: 'rotate(' + ((SECTORS[dir] + 180) % 360) + ')' });
			g.appendChild(svgNode('path', {
				d: 'M0 17 L0 -17 M0 -17 l-7 9 M0 -17 l7 9', class: 'dccwl-wind-arrow'
			}));
			svg.appendChild(g);
			box.appendChild(svg);
		}

		var txt = el('span', 'dccwl-wind-text');
		if (dir) { txt.appendChild(el('b', 'dccwl-wind-dir', dir)); }
		txt.appendChild(el('span', 'dccwl-wind-speed', wind.speed));
		/* The short form on screen, the full name to a screen reader (1.35.1).
		 * Falls back to the full name when a payload cached before 1.35.1 has
		 * no short form — a long source line beats no source line. */
		var srcShort = wind.sourceShort || wind.source;
		if (srcShort) { txt.appendChild(el('span', 'dccwl-wind-src', srcShort)); }
		box.appendChild(txt);

		box.setAttribute('role', 'group');
		box.setAttribute('aria-label', (i18n.windAria || 'Wind %1$s at %2$s — %3$s')
			.replace('%1$s', dir || '').replace('%2$s', wind.speed)
			.replace('%3$s', wind.source || srcShort || ''));
		return box;
	}

	function fmt(n, dp) {
		if (typeof n !== 'number' || isNaN(n)) { return ''; }
		// Strip trailing zeros only AFTER a decimal point — a bare /\.?0+$/
		// would turn fmt(60, 0) into "6".
		return n.toFixed(typeof dp === 'number' ? dp : 2)
			.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
	}

	function ageWords(days, i18n) {
		if (typeof days !== 'number') { return i18n.noReading || 'no recent reading'; }
		if (days < 45) { return days + (i18n.ageDays || 'd'); }
		if (days < 730) { return Math.round(days / 30) + (i18n.ageMonths || 'mo'); }
		return Math.round(days / 365) + (i18n.ageYears || 'y');
	}

	/* Substitute the one placeholder in a translated template. */
	function tpl(template, value) {
		return String(template).replace('%s', String(value));
	}

	/* ---- colour-by strategies ---------------------------------------- */

	function colourClarity(w) {
		var c = w.clarity;
		if (!c || typeof c.ratio !== 'number') { return C.stale; }
		if (c.ratio >= CLEARER) { return C.clear; }
		if (c.ratio <= MURKIER) { return C.murky; }
		return C.usual;
	}

	function colourLevel(w) {
		var l = w.level;
		// A stale level is greyed rather than coloured: Griffin's reading is
		// from 2008 and Yale's from 2025, and neither may read as current.
		if (!l || l.stale || typeof l.inches !== 'number') { return C.stale; }
		if (l.inches > LEVEL_NEAR_IN) { return C.high; }
		if (l.inches < -LEVEL_NEAR_IN) { return C.low; }
		return C.near;
	}

	function colourFresh(w) {
		var ages = [];
		if (w.clarity && typeof w.clarity.age === 'number') { ages.push(w.clarity.age); }
		if (w.level && typeof w.level.age === 'number') { ages.push(w.level.age); }
		if (!ages.length) { return C.stale; }
		var best = Math.min.apply(null, ages);
		// 45 days — the same cutoff the PHP staleness guards and ageWords()
		// use, so "fresh" here never disagrees with the text.
		if (best < 45) { return C.fresh; }
		if (best < 730) { return C.months; }
		return C.years;
	}

	var MODES = {
		clarity: colourClarity,
		level: colourLevel,
		fresh: colourFresh
	};

	/* ---- legend (1.8.0) ----------------------------------------------
	 * The colours are the module's honesty machinery — grey means "too old
	 * to state as current" — and colours without a decoder are noise, so
	 * each colour-by mode shows its own legend. Rows are [palette key,
	 * i18n key, English fallback]; the swatch colour always comes from C so
	 * legend and markers can never disagree. */

	var LEGEND = {
		clarity: [
			['clear', 'legClearer', 'Clearer than its own median'],
			['usual', 'legUsual', 'Near its median'],
			['murky', 'legMurkier', 'Murkier than its median'],
			['stale', 'legStale', 'No current reading']
		],
		level: [
			['high', 'legAbove', 'Above its monthly norm'],
			['near', 'legNear', 'Near its norm'],
			['low', 'legBelow', 'Below its norm'],
			['stale', 'legStale', 'No current reading']
		],
		fresh: [
			['fresh', 'legFresh', 'Reading under 45 days old'],
			['months', 'legMonths', 'Months old'],
			['years', 'legYears', 'Years old'],
			['stale', 'legStale', 'No current reading']
		]
	};

	function buildLegend(i18n) {
		var box = el('div', 'dccwl-map-legend');
		function show(mode) {
			box.textContent = '';
			(LEGEND[mode] || LEGEND.clarity).forEach(function (row) {
				var item = el('span', 'dccwl-leg-item');
				var swatch = el('span', 'dccwl-leg-swatch');
				swatch.style.backgroundColor = C[row[0]];
				item.appendChild(swatch);
				item.appendChild(document.createTextNode(i18n[row[1]] || row[2]));
				box.appendChild(item);
			});
		}
		show('clarity');
		return { node: box, show: show };
	}

	/* ---- popups ------------------------------------------------------ */

	function line(parent, label, value) {
		if (!value) { return; }
		var p = el('p', 'dccwl-pop-line');
		p.appendChild(el('strong', null, label + ' '));
		p.appendChild(document.createTextNode(value));
		parent.appendChild(p);
	}

	function waterPopup(w, i18n) {
		var box = el('div', 'dccwl-pop');
		box.appendChild(el('h4', 'dccwl-pop-title', w.name));

		if (w.clarity) {
			var cl = fmt(w.clarity.value) + (w.clarity.units ? ' ' + w.clarity.units : '');
			if (typeof w.clarity.median === 'number') {
				cl += ' (' + (i18n.median || 'median') + ' ' + fmt(w.clarity.median) + ')';
			}
			line(box, i18n.lblClarity || 'Clarity:', cl);
			line(box, (i18n.sampled || 'sampled') + ':', w.clarity.date || '');
		}

		if (w.level) {
			if (w.level.stale) {
				// Do not state an old elevation as a current condition.
				line(box, i18n.lblLevel || 'Level:', (i18n.staleLevel || 'level reading is old') +
					(w.level.date ? ' — ' + w.level.date : ''));
			} else if (typeof w.level.inches === 'number') {
				var inches = Math.abs(Math.round(w.level.inches));
				var levelText = w.level.inches > 0
					? tpl(i18n.levelAbove || '%s in above its monthly norm', inches)
					: tpl(i18n.levelBelow || '%s in below its monthly norm', inches);
				line(box, i18n.lblLevel || 'Level:', levelText +
					(w.level.date ? ' — ' + w.level.date : ''));
			}
		}

		if (typeof w.miles === 'number') {
			line(box, i18n.lblDistance || 'Distance:', w.miles + ' ' + (i18n.milesAway || 'mi, straight line'));
		}

		if (w.depthMap && w.depthMap.url) {
			var a = el('a', 'dccwl-pop-link', i18n.depthMap || 'Depth map (PDF)');
			a.href = w.depthMap.url;
			a.target = '_blank';
			a.rel = 'noopener nofollow';
			box.appendChild(a);
		}
		if (w.clarity && w.clarity.url) {
			var s = el('a', 'dccwl-pop-link', (i18n.station || 'Station') + ' ' + (w.clarity.station || ''));
			s.href = w.clarity.url;
			s.target = '_blank';
			s.rel = 'noopener nofollow';
			box.appendChild(s);
		}
		return box;
	}

	/* A station's own card (1.23.0). The fact gate applies exactly as it does
	 * everywhere else in this module: a station with no usable reading says
	 * so. It never prints a zero, and a reading past its staleness limit is
	 * shown as old rather than dressed up as current. */
	function stationPopup(s, i18n) {
		var box = el('div', 'dccwl-pop');
		var kindName = 'level' === s.kind ? (i18n.lblLevel || 'Level:') : (i18n.lblClarity || 'Clarity:');
		box.appendChild(el('h4', 'dccwl-pop-title',
			tpl(i18n.stationTitle || 'Station %s', s.id || '')));
		line(box, i18n.lblWater || 'Water:', s.water || '');

		var r = s.reading;
		if (!r) {
			box.appendChild(el('p', 'dccwl-pop-none', i18n.stationNone || 'No current reading from this station.'));
		} else if ('level' === s.kind && r.stale) {
			line(box, kindName, (i18n.staleLevel || 'level reading is old') + (r.date ? ' — ' + r.date : ''));
		} else if ('level' === s.kind && typeof r.inches === 'number') {
			var inches = Math.abs(Math.round(r.inches));
			line(box, kindName, (r.inches > 0
				? tpl(i18n.levelAbove || '%s in above its monthly norm', inches)
				: tpl(i18n.levelBelow || '%s in below its monthly norm', inches)) + (r.date ? ' — ' + r.date : ''));
		} else if (typeof r.value === 'number') {
			line(box, kindName, fmt(r.value) + (r.units ? ' ' + r.units : ''));
			line(box, (i18n.sampled || 'sampled') + ':', r.date || '');
		} else {
			box.appendChild(el('p', 'dccwl-pop-none', i18n.stationNone || 'No current reading from this station.'));
		}

		if (typeof s.miles === 'number') {
			line(box, i18n.lblDistance || 'Distance:', s.miles + ' ' + (i18n.milesAway || 'mi, straight line'));
		}
		if (s.url) {
			var a = el('a', 'dccwl-pop-link', i18n.stationPage || 'Station page');
			a.href = s.url;
			a.target = '_blank';
			a.rel = 'noopener nofollow';
			box.appendChild(a);
		}
		if (s.source) { box.appendChild(el('p', 'dccwl-pop-src', s.source)); }
		return box;
	}

	function rampPopup(r, i18n) {
		var box = el('div', 'dccwl-pop');
		box.appendChild(el('h4', 'dccwl-pop-title', r.name || i18n.rampName || 'Boat ramp'));

		// Status is honoured loudly: a guest towing a boat to a closed ramp
		// is exactly the error this module exists to prevent.
		if (r.status && /closed/i.test(r.status)) {
			var warn = el('p', 'dccwl-pop-closed', i18n.closed || 'CLOSED');
			box.appendChild(warn);
		}
		line(box, i18n.lblWater || 'Water:', r.water || '');
		line(box, i18n.lblCity || 'City:', r.city || '');
		if (typeof r.lanes === 'number') { line(box, i18n.lblLanes || 'Lanes:', String(r.lanes)); }
		if (r.fee) { line(box, i18n.lblFee || 'Fee:', r.fee); }
		if (r.restroom) { line(box, i18n.lblRestrooms || 'Restrooms:', r.restroom); }
		if (r.status) { line(box, i18n.lblStatus || 'Status:', r.status); }
		if (typeof r.miles === 'number') {
			line(box, i18n.lblDistance || 'Distance:', r.miles + ' ' + (i18n.milesAway || 'mi, straight line'));
		}
		box.appendChild(el('p', 'dccwl-pop-src', i18n.fwcSource || 'Source: FWC boat ramp inventory'));
		return box;
	}

	/* ---- build ------------------------------------------------------- */

	function init(shell, data, cfg, i18n) {
		var L = window.L;
		shell.textContent = '';

		var canvas = el('div', 'dccwl-map-canvas');
		shell.appendChild(canvas);

		var map = L.map(canvas, { scrollWheelZoom: false });

		/*
		 * ITEM 4 (1.37.0) — THE CREDIT IS AN ⓘ, AND EACH PROVIDER'S RULE IS
		 * KEPT. The permanent line ran across the bottom of every map and, in
		 * Rob's screenshot, across the last line of an open popup.
		 *
		 * LEAFLET STILL RENDERS THE CREDIT. Its attribution control holds the
		 * markup — including the providers' own links — so this code never
		 * builds that string, never inserts it as HTML, and cannot drop a link
		 * a licence requires. All that changed is when it is on screen: the
		 * control is collapsed by CSS and the ⓘ shows it.
		 *
		 * `setPrefix(false)` drops Leaflet's own logo and flag, which are
		 * optional and are not a credit anyone is owed.
		 *
		 * ESRI (the satellite layer, and the default): a credit behind a
		 * button is allowed, so this starts collapsed — but it must be
		 * discoverable and never covered, which is what the ⓘ and its
		 * z-index are for. The required wording, "Powered by Esri" with the
		 * source line, lives in the setting that feeds the control.
		 *
		 * OPENSTREETMAP (chosen, or the fallback when satellite fails): a
		 * collapsed credit is allowed only if it shows FIRST and then
		 * collapses on the guest's first pan, zoom or tap, or after five
		 * seconds. openForOsm() does exactly that, and it runs on every
		 * switch to that layer including the automatic one.
		 */
		map.attributionControl.setPrefix(false);
		var creditTimer = null;

		function creditOpen(on) {
			canvas.classList.toggle('dccwl-credit-open', !!on);
			if (creditBtn) { creditBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); }
		}

		function disarmCredit() {
			if (creditTimer) { window.clearTimeout(creditTimer); creditTimer = null; }
			map.off('movestart zoomstart click', collapseCredit);
			canvas.removeEventListener('touchstart', collapseCredit, true);
		}

		function collapseCredit() {
			disarmCredit();
			creditOpen(false);
		}

		/* The OpenStreetMap rule: on screen first, then out of the way on the
		 * first interaction or after five seconds — whichever comes first. */
		function openForOsm() {
			disarmCredit();
			creditOpen(true);
			map.on('movestart zoomstart click', collapseCredit);
			canvas.addEventListener('touchstart', collapseCredit, true);
			creditTimer = window.setTimeout(collapseCredit, 5000);
		}

		var creditBtn = el('button', 'dccwl-map-credit-btn');
		creditBtn.type = 'button';
		creditBtn.textContent = 'i';
		creditBtn.setAttribute('aria-expanded', 'false');
		creditBtn.setAttribute('aria-label', i18n.creditLabel || 'Map credits');
		creditBtn.addEventListener('click', function (ev) {
			ev.stopPropagation();
			disarmCredit();
			creditOpen(!canvas.classList.contains('dccwl-credit-open'));
		});
		/* Inside the map container, so a press must not also start a drag or
		 * reach the map's own click handling. */
		if (L.DomEvent && L.DomEvent.disableClickPropagation) {
			L.DomEvent.disableClickPropagation(creditBtn);
		}
		canvas.appendChild(creditBtn);

		/*
		 * ITEM 3 (1.36.0) — A POPUP CLOSES WHEN A GUEST TAPS AWAY FROM IT.
		 *
		 * Leaflet's own closePopupOnClick only hears clicks on the MAP, so a
		 * tap on the control bar, the legend, the sheet around the map or the
		 * page behind it left the popup open with no way out but its ×. This
		 * listens on the document instead, which is where "anywhere outside"
		 * actually lives.
		 *
		 * Two things it must not do: close the popup on the very click that
		 * opened it (a marker is .leaflet-interactive, so those are left to
		 * Leaflet), and outlive its map — the sheet empties its body on
		 * close, which orphans this canvas, so the listener removes itself
		 * the first time it notices.
		 */
		function closeAway(ev) {
			if (!document.contains(canvas)) {
				document.removeEventListener('click', closeAway, true);
				document.removeEventListener('touchend', closeAway, true);
				return;
			}
			var t = ev.target;
			if (!t || !t.closest) { return; }
			if (t.closest('.leaflet-popup') || t.closest('.leaflet-interactive')) { return; }
			map.closePopup();
		}
		document.addEventListener('click', closeAway, true);
		document.addEventListener('touchend', closeAway, true);
		map.on('unload', function () {
			document.removeEventListener('click', closeAway, true);
			document.removeEventListener('touchend', closeAway, true);
		});
		var base = buildBaseLayers(map, canvas, cfg, i18n);

		/* The OpenStreetMap credit rule, on every arrival at that layer — a
		 * guest choosing it, and the automatic fallback when satellite is
		 * blocked. Esri's layer leaves the credit collapsed behind the ⓘ,
		 * which its terms allow. Called once for the layer the map opened on,
		 * because buildBaseLayers chooses that before anything can listen. */
		function creditRuleFor(name) {
			if ('streets' === name) { openForOsm(); } else { collapseCredit(); }
		}
		base.onChange(creditRuleFor);
		creditRuleFor(base.currentName());

		var groups = {
			waters: L.layerGroup(),
			stations: L.layerGroup(),
			ramps: L.layerGroup(),
			property: L.layerGroup()
		};
		var bounds = [];
		var waterMarkers = [];

		(data.waters || []).forEach(function (w) {
			if (typeof w.lat !== 'number' || typeof w.lon !== 'number') { return; }
			var m = L.circleMarker([w.lat, w.lon], {
				radius: 11, weight: 2, color: '#fff', fillOpacity: 0.9, fillColor: C.usual
			});
			m.bindPopup(waterPopup(w, i18n));
			m.addTo(groups.waters);
			waterMarkers.push({ marker: m, water: w });
			bounds.push([w.lat, w.lon]);

			// Stations are drawn from data.stations below, at their OWN
			// coordinates. They used to be drawn here, on top of the
			// waterbody's dot and showing the waterbody's popup — a marker
			// that could only ever repeat what was already under it.
		});

		(data.stations || []).forEach(function (s) {
			if (typeof s.lat !== 'number' || typeof s.lon !== 'number') { return; }
			var live = !!(s.reading && ('level' !== s.kind || !s.reading.stale));
			var sm = L.circleMarker([s.lat, s.lon], {
				radius: 6, weight: 2, color: '#fff', fillOpacity: 1,
				// A station with nothing current to say is drawn quiet rather
				// than hidden: it is still where the number would come from.
				fillColor: live ? C.navy : C.usual
			});
			sm.bindPopup(stationPopup(s, i18n));
			sm.addTo(groups.stations);
			bounds.push([s.lat, s.lon]);
		});

		(data.ramps || []).forEach(function (r) {
			var closed = r.status && /closed/i.test(r.status);
			var m = L.circleMarker([r.lat, r.lon], {
				radius: 7, weight: 2, color: '#fff', fillOpacity: 1,
				fillColor: closed ? C.rampClosed : C.ramp
			});
			m.bindPopup(rampPopup(r, i18n));
			m.addTo(groups.ramps);
			bounds.push([r.lat, r.lon]);
		});

		if (data.property) {
			var home = L.circleMarker([data.property.lat, data.property.lon], {
				radius: 9, weight: 3, color: '#fff', fillOpacity: 1, fillColor: C.home
			});
			home.bindPopup(el('div', 'dccwl-pop', i18n.lyrProperty || 'The cottages'));
			home.addTo(groups.property);
			bounds.push([data.property.lat, data.property.lon]);
		}

		groups.waters.addTo(map);
		groups.ramps.addTo(map);
		groups.property.addTo(map);

		/* ---- fitting the view, AFTER there is a viewport to fit it to -----
		 * The sheet calls its build() callback while the host is still
		 * hidden, so at this point the canvas is 0x0. Fitting bounds to a
		 * zero-sized viewport does not fail — it succeeds nonsensically:
		 * Leaflet clamps to maxZoom (18) at an arbitrary centre, and every
		 * marker ends up off screen. That shipped, and "fitBounds was
		 * called" was true the whole time, which is why the test for this
		 * asserts the resulting zoom and bounds instead.
		 *
		 * So the fit waits for real layout. It runs once, on the first
		 * non-zero size, and then stops watching: a later resize wants
		 * invalidateSize(), which the bar and the fullscreen control already
		 * do, but it must NOT yank the view out from under someone who has
		 * panned somewhere. */
		var fitted = false;

		function fitView() {
			if (fitted) { return true; }
			var r = canvas.getBoundingClientRect();
			if (!r.width || !r.height) { return false; }

			map.invalidateSize();
			if (bounds.length) {
				map.fitBounds(bounds, { padding: [30, 30] });
			} else {
				map.setView([28.8045, -81.7450], 11);
			}
			fitted = true;
			return true;
		}

		function fitWhenLaid() {
			if (fitView()) { return; }

			if (window.ResizeObserver) {
				var ro = new window.ResizeObserver(function () {
					if (fitView()) { ro.disconnect(); }
				});
				ro.observe(canvas);
				// Belt and braces: an observer that never fires (a canvas
				// that stays hidden) must not leave the map unfitted for
				// ever, and it must not keep observing after we give up.
				window.setTimeout(function () { fitView(); ro.disconnect(); }, 1200);
				return;
			}

			// No ResizeObserver: retry on a short ladder, then stop.
			[0, 60, 160, 320, 640, 1200].forEach(function (ms) {
				window.setTimeout(fitView, ms);
			});
		}

		var legend = buildLegend(i18n);

		function recolour(mode) {
			var fn = MODES[mode] || MODES.clarity;
			waterMarkers.forEach(function (x) {
				x.marker.setStyle({ fillColor: fn(x.water) });
			});
			legend.show(mode);
		}
		recolour('clarity');

		shell.appendChild(buildBar(map, groups, recolour, shell, i18n, base, cfg && cfg.colour));
		shell.appendChild(legend.node);

		// The wind badge, when the conditions call returned one (1.35.0).
		var badge = windBadge(cfg && cfg.wind, i18n);
		if (badge) { shell.appendChild(badge); }

		// Everything is in the DOM; now wait for it to have a size and fit.
		fitWhenLaid();
	}

	/* ---- base layers -------------------------------------------------
	 * Two providers, each carrying its OWN required attribution — Leaflet's
	 * attribution control swaps the credit with the layer, which is why each
	 * gets its own `attribution` option rather than one hardcoded line.
	 *
	 * MIND THE COORDINATE ORDER in the templates: Esri is {z}/{y}/{x} and
	 * OSM is {z}/{x}/{y}. They come from settings verbatim; getting them
	 * backwards produces a map that renders perfectly and shows the wrong
	 * place. Both are settings so a provider swap is a paste, not a release.
	 *
	 * Failure here is operational, not theoretical: providers throttle and
	 * block by referrer and volume, and the symptom would be a grid of grey
	 * squares on the Guest Guide. So a failing layer falls back to the other,
	 * and if both fail the imagery is dropped entirely and the markers stay
	 * on a plain background. The data is the valuable part.
	 * ---------------------------------------------------------------- */

	function buildBaseLayers(map, canvas, cfg, i18n) {
		var layers = {};
		var failed = {};
		var current = null;
		var notice = null;
		/* A LIST, not a slot (1.37.0). The Layers radio rows registered the
		 * one callback there was; the OpenStreetMap credit rule needs to hear
		 * the same event, and a second `onChange(fn)` would silently have
		 * replaced the first. */
		var listeners = [];
		function onChange(name) { listeners.forEach(function (fn) { fn(name); }); }

		function make(url, attribution, maxZoom) {
			return window.L.tileLayer(url, {
				attribution: attribution || '',
				maxZoom: maxZoom
			});
		}

		if (cfg.satUrl) { layers.satellite = make(cfg.satUrl, cfg.satAttrib, 18); }
		if (cfg.tileUrl) { layers.streets = make(cfg.tileUrl, cfg.tileAttrib, 19); }

		function dropImagery() {
			if (current && layers[current]) { map.removeLayer(layers[current]); }
			current = null;
			canvas.classList.add('dccwl-map-noimagery');
			if (!notice) {
				notice = el('p', 'dccwl-map-notice', i18n.noImagery || '');
				canvas.parentNode.insertBefore(notice, canvas);
			}
			onChange(null);
		}

		function setBase(name) {
			if (!layers[name] || failed[name]) { return; }
			if (current && layers[current]) { map.removeLayer(layers[current]); }
			layers[name].addTo(map);
			current = name;
			onChange(name);
		}

		Object.keys(layers).forEach(function (name) {
			var errors = 0;
			layers[name].on('tileerror', function () {
				errors += 1;
				// A few misses are normal at the edge of coverage; a wall of
				// them means the provider is refusing us.
				if (errors < 6 || failed[name]) { return; }
				failed[name] = true;
				var alt = 'satellite' === name ? 'streets' : 'satellite';
				if (layers[alt] && !failed[alt]) {
					setBase(alt);
				} else {
					dropImagery();
				}
			});
		});

		var want = cfg.baseLayer && layers[cfg.baseLayer] ? cfg.baseLayer : Object.keys(layers)[0];
		if (want) { setBase(want); } else { dropImagery(); }

		return {
			names: Object.keys(layers),
			set: setBase,
			currentName: function () { return current; },
			onChange: function (fn) { listeners.push(fn); }
		};
	}

	/* ---- the control bar --------------------------------------------- */

	/* ---- the control bar ---------------------------------------------
	 *
	 * ONE BAR, TWO SHAPES, CHOSEN BY MEASUREMENT (1.33.0).
	 *
	 * The owner's decision, and the reason for the shape of this function:
	 * where the full six-control bar fits on one row it stays EXACTLY as it
	 * was — the "Colour by:" label and the three-button segmented control are
	 * the pattern from his Croatia template and he wants them where they fit.
	 * Where it does not fit, the three colour buttons collapse into a "Colour"
	 * menu and Fullscreen moves inside the Layers menu.
	 *
	 * The switch is a MEASUREMENT, not a width. There is no breakpoint in
	 * here and none in water.css for this: the bar lays itself out nowrap for
	 * one frame, asks whether it overflowed, and picks a shape from the
	 * answer. That is the only thing that stays true when the sheet is
	 * narrower than the window, when the font is scaled up, when a translation
	 * makes "Data age" three words long, or when the phone is turned.
	 *
	 * BOTH shapes drive ONE piece of state. setColour() is the only path that
	 * changes the colouring, and it updates the segmented buttons, the radio
	 * rows and the menu button's label together, so switching shape mid-session
	 * can never show two different answers.
	 */

	function buildBar(map, groups, recolour, shell, i18n, base, want) {
		var bar = el('div', 'dccwl-map-bar');
		var COLOURS = [
			['clarity', i18n.byClarity || 'Clarity'],
			['level', i18n.byLevel || 'Level'],
			['fresh', i18n.byFresh || 'Data age']
		];
		var colourLabel = i18n.colorBy || 'Colour by:';
		// The menu button says which colouring is on. The label above ends in
		// a colon because it introduces the buttons beside it; on the button
		// it would read "Colour by:: Clarity", so strip it.
		var colourWord = colourLabel.replace(/\s*:\s*$/, '');
		/* 1.34.0: the opener may ask for a colouring — a Map-tab stat tile
		 * opens the map already coloured by its own reading. An unknown or
		 * absent request falls back to the map's own default, so the caller
		 * can never put the bar into a state it has no button for. */
		var current = COLOURS[0][0];
		COLOURS.forEach(function (pair) { if (pair[0] === want) { current = want; } });

		/* ---- full shape: label + segmented control ---------------------- */

		var seg = el('div', 'dccwl-seg');
		seg.setAttribute('role', 'group');
		seg.setAttribute('aria-label', colourWord);
		seg.appendChild(el('span', 'dccwl-seg-label', colourLabel));
		var segBtns = {};
		COLOURS.forEach(function (pair) {
			var b = el('button', 'dccwl-seg-btn', pair[1]);
			b.type = 'button';
			b.setAttribute('aria-pressed', pair[0] === current ? 'true' : 'false');
			b.addEventListener('click', function () { setColour(pair[0]); });
			segBtns[pair[0]] = b;
			seg.appendChild(b);
		});
		bar.appendChild(seg);

		/* ---- compact shape: a Colour menu ------------------------------- */

		var colourDrop = el('div', 'dccwl-drop');
		var colourBtn = el('button', 'dccwl-drop-btn', '');
		colourBtn.type = 'button';
		colourBtn.setAttribute('aria-expanded', 'false');
		colourBtn.setAttribute('aria-haspopup', 'true');
		var colourPanel = el('div', 'dccwl-drop-panel');
		colourPanel.hidden = true;
		colourPanel.setAttribute('aria-label', colourWord);
		/* Radios, not a new marking style: the Layers menu already shows a
		 * one-of-several choice this way for the base map, and the owner asked
		 * for the two menus to agree. */
		colourPanel.appendChild(el('p', 'dccwl-drop-head', colourWord));
		var colourRadios = {};
		COLOURS.forEach(function (pair) {
			var lab = el('label', 'dccwl-drop-row');
			var rb = document.createElement('input');
			rb.type = 'radio';
			rb.name = 'dccwl-colour';
			rb.checked = pair[0] === current;
			rb.addEventListener('change', function () {
				if (rb.checked) { setColour(pair[0]); closeMenus(); }
			});
			colourRadios[pair[0]] = rb;
			lab.appendChild(rb);
			lab.appendChild(document.createTextNode(' ' + pair[1]));
			colourPanel.appendChild(lab);
		});
		colourDrop.appendChild(colourBtn);
		colourDrop.appendChild(colourPanel);
		bar.appendChild(colourDrop);

		/** The one path that changes the colouring. Both shapes call it. */
		function setColour(key) {
			current = key;
			COLOURS.forEach(function (pair) {
				segBtns[pair[0]].setAttribute('aria-pressed', pair[0] === key ? 'true' : 'false');
				colourRadios[pair[0]].checked = (pair[0] === key);
				if (pair[0] === key) {
					/* translators are served by i18n.colorBy; this is a
					 * composition of two already-translated strings. */
					colourBtn.textContent = colourWord + ': ' + pair[1] + ' ▾';
					colourBtn.setAttribute('aria-label', colourWord + ': ' + pair[1]);
				}
			});
			recolour(key);
		}

		/* ---- Layers menu: in both shapes, built once -------------------- */

		var drop = el('div', 'dccwl-drop');
		var toggle = el('button', 'dccwl-drop-btn', (i18n.layers || 'Layers') + ' ▾');
		toggle.type = 'button';
		toggle.setAttribute('aria-expanded', 'false');
		toggle.setAttribute('aria-haspopup', 'true');
		var panel = el('div', 'dccwl-drop-panel');
		panel.hidden = true;
		panel.setAttribute('aria-label', i18n.layers || 'Layers');

		// Base map first — satellite is one tap from streets and vice versa.
		if (base && base.names.length > 1) {
			panel.appendChild(el('p', 'dccwl-drop-head', i18n.baseMap || 'Base map'));
			var radios = {};
			base.names.forEach(function (nm) {
				var lab = el('label', 'dccwl-drop-row');
				var rb = document.createElement('input');
				rb.type = 'radio';
				rb.name = 'dccwl-base';
				rb.checked = nm === base.currentName();
				rb.addEventListener('change', function () { base.set(nm); });
				radios[nm] = rb;
				lab.appendChild(rb);
				lab.appendChild(document.createTextNode(' ' + (i18n[nm] || nm)));
				panel.appendChild(lab);
			});
			// Keep the control honest if a layer falls back on its own.
			base.onChange(function (nm) {
				Object.keys(radios).forEach(function (k) { radios[k].checked = (k === nm); });
			});
			panel.appendChild(el('hr', 'dccwl-drop-sep'));
		}
		[
			['ramps', i18n.lyrRamps || 'Boat ramps', true],
			['waters', i18n.lyrWaters || 'Chain waters', true],
			['stations', i18n.lyrStations || 'Monitoring stations', false],
			['property', i18n.lyrProperty || 'The cottages', true]
		].forEach(function (row) {
			var lab = el('label', 'dccwl-drop-row');
			var cb = document.createElement('input');
			cb.type = 'checkbox';
			cb.checked = row[2];
			cb.addEventListener('change', function () {
				if (cb.checked) { groups[row[0]].addTo(map); } else { map.removeLayer(groups[row[0]]); }
			});
			lab.appendChild(cb);
			lab.appendChild(document.createTextNode(' ' + row[1]));
			panel.appendChild(lab);
		});
		drop.appendChild(toggle);
		drop.appendChild(panel);
		bar.appendChild(drop);

		/* ---- Fullscreen, but ONLY where it can actually happen -----------
		 *
		 * iPhone Safari implements requestFullscreen for <video> and nothing
		 * else, so on the owner's own phone this button rendered, took up a
		 * 44px slot in a bar that is already tight at 320px, and did nothing
		 * whatsoever when tapped. A control that cannot work should not be
		 * offered: feature-detect on the element we would actually ask.
		 *
		 * Where it IS offered it exists twice — as a bar button in the full
		 * shape, as a row inside the Layers menu in the compact one — and both
		 * call the same handler. */
		var fsBtn = null;
		var fsRow = null;
		if (typeof shell.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
			var fsText = i18n.fullscreen || 'Fullscreen';
			fsBtn = el('button', 'dccwl-drop-btn dccwl-bar-action', fsText);
			fsBtn.type = 'button';
			fsBtn.addEventListener('click', toggleFullscreen);
			bar.appendChild(fsBtn);

			fsRow = el('hr', 'dccwl-drop-sep');
			var fsLink = el('button', 'dccwl-drop-action', fsText);
			fsLink.type = 'button';
			fsLink.addEventListener('click', function () { toggleFullscreen(); closeMenus(); });
			panel.appendChild(fsRow);
			panel.appendChild(fsLink);
			fsRow = [fsRow, fsLink];
		}
		function toggleFullscreen() {
			if (document.fullscreenElement) {
				document.exitFullscreen();
			} else {
				shell.requestFullscreen();
			}
			setTimeout(function () { map.invalidateSize(); fit(); }, 200);
		}

		/* ---- menu plumbing: open, close, Escape, click-away -------------- */

		function setOpen(btn, pnl, open) {
			pnl.hidden = !open;
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
		}
		function closeMenus() {
			setOpen(toggle, panel, false);
			setOpen(colourBtn, colourPanel, false);
		}
		function wire(btn, pnl) {
			btn.addEventListener('click', function () {
				var willOpen = pnl.hidden;
				closeMenus();
				setOpen(btn, pnl, willOpen);
			});
		}
		wire(toggle, panel);
		wire(colourBtn, colourPanel);
		/* The sheet owns Escape and closes on it. When one of these menus is
		 * open, THIS layer owns it instead — see the `dccwl:escape` contract in
		 * sheet.js. Claiming it by calling preventDefault() is what stops a
		 * guest losing the whole map because they dismissed a menu. */
		function claimEscape(e) {
			if (panel.hidden && colourPanel.hidden) { return; }
			var inColour = colourPanel.contains(document.activeElement);
			var openBtn = colourPanel.hidden ? toggle : (inColour ? colourBtn : (panel.hidden ? colourBtn : toggle));
			closeMenus();
			// Focus would otherwise be stranded on a node that is now hidden.
			if (bar.contains(document.activeElement) || document.activeElement === document.body) {
				openBtn.focus();
			}
			e.preventDefault();
		}
		bar.addEventListener('dccwl:escape', claimEscape);
		bar.addEventListener('keydown', function (e) {
			// Standalone use, where there is no sheet above us to ask.
			if (e.key === 'Escape' || e.keyCode === 27) {
				if (panel.hidden && colourPanel.hidden) { return; }
				claimEscape(e);
				e.stopPropagation();
			}
		});
		document.addEventListener('click', function (e) {
			if (!bar.contains(e.target)) { closeMenus(); }
		});

		/* ---- which shape? ask the bar, do not guess ---------------------- */

		var compact = null;   // null = not decided yet

		/* IDEMPOTENT ON PURPOSE. fit() below flips the bar to its full shape to
		 * measure it and then flips it back, so apply() is called twice in a
		 * row with the same argument as a matter of course. An early return on
		 * "no change" made the second call a no-op and left the bar showing
		 * the shape that was only ever meant to be measured. */
		function apply(wantCompact) {
			compact = wantCompact;
			closeMenus();
			seg.hidden = wantCompact;
			colourDrop.hidden = !wantCompact;
			if (fsBtn) { fsBtn.hidden = wantCompact; }
			if (fsRow) { fsRow[0].hidden = !wantCompact; fsRow[1].hidden = !wantCompact; }
			bar.classList.toggle('dccwl-map-bar--compact', wantCompact);
		}

		function fit() {
			if (!bar.isConnected || !bar.clientWidth) { return; }
			/* Measure the FULL shape laid out on ONE line and ask whether it
			 * overflowed.
			 *
			 * The segmented control has its own flex-wrap, so pinning only the
			 * BAR to nowrap measured nothing: the three colour buttons simply
			 * wrapped inside .dccwl-seg, the bar grew a second row, and
			 * scrollWidth never exceeded clientWidth. Both levels have to be
			 * pinned, or the question being asked is "does it fit in any
			 * number of rows", to which the answer is always yes. */
			var wasCompact = compact;
			var prevBar = bar.style.flexWrap;
			var prevSeg = seg.style.flexWrap;
			apply(false);
			bar.style.flexWrap = 'nowrap';
			seg.style.flexWrap = 'nowrap';
			var overflows = bar.scrollWidth > bar.clientWidth + 1;
			bar.style.flexWrap = prevBar;
			seg.style.flexWrap = prevSeg;
			apply(overflows);
			return { overflows: overflows, wasCompact: wasCompact };
		}

		setColour(current);
		apply(false);

		/* First measurement once the bar has a width; then on every change of
		 * one. ResizeObserver catches the case window.resize cannot: the map
		 * sheet changing size while the window does not. */
		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(fit);
		} else {
			setTimeout(fit, 0);
		}
		if (typeof ResizeObserver === 'function') {
			var ro = new ResizeObserver(function () { fit(); });
			ro.observe(bar);
		} else {
			var t = null;
			window.addEventListener('resize', function () {
				clearTimeout(t);
				t = setTimeout(fit, 120);
			});
		}

		bar.dccwlFit = fit;   // the suites drive this directly
		return bar;
	}

	window.DCCWL_Map = { init: init };
})();
