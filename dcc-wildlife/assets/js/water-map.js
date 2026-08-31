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
		var base = buildBaseLayers(map, canvas, cfg, i18n);

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

			// The station that produced the reading, as its own layer, so a
			// guest can see exactly where each figure comes from.
			['clarity', 'level'].forEach(function (k) {
				var r = w[k];
				if (!r || !r.station) { return; }
				var sm = L.circleMarker([w.lat, w.lon], {
					radius: 5, weight: 1, color: '#fff', fillOpacity: 1, fillColor: C.navy
				});
				sm.bindPopup(waterPopup(w, i18n));
				sm.addTo(groups.stations);
			});
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

		if (bounds.length) {
			map.fitBounds(bounds, { padding: [30, 30] });
		} else {
			map.setView([28.8045, -81.7450], 11);
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

		shell.appendChild(buildBar(map, groups, recolour, shell, i18n, base));
		shell.appendChild(legend.node);
		setTimeout(function () { map.invalidateSize(); }, 60);
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
		var onChange = null;

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
			if (onChange) { onChange(null); }
		}

		function setBase(name) {
			if (!layers[name] || failed[name]) { return; }
			if (current && layers[current]) { map.removeLayer(layers[current]); }
			layers[name].addTo(map);
			current = name;
			if (onChange) { onChange(name); }
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
			onChange: function (fn) { onChange = fn; }
		};
	}

	/* ---- the control bar --------------------------------------------- */

	function buildBar(map, groups, recolour, shell, i18n, base) {
		var bar = el('div', 'dccwl-map-bar');

		// Colour by — segmented control.
		var seg = el('div', 'dccwl-seg');
		seg.setAttribute('role', 'group');
		seg.appendChild(el('span', 'dccwl-seg-label', i18n.colorBy || 'Colour by:'));
		[
			['clarity', i18n.byClarity || 'Clarity'],
			['level', i18n.byLevel || 'Level'],
			['fresh', i18n.byFresh || 'Data age']
		].forEach(function (pair, i) {
			var b = el('button', 'dccwl-seg-btn', pair[1]);
			b.type = 'button';
			b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
			b.addEventListener('click', function () {
				seg.querySelectorAll('.dccwl-seg-btn').forEach(function (o) {
					o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
				});
				recolour(pair[0]);
			});
			seg.appendChild(b);
		});
		bar.appendChild(seg);

		// Layers — dropdown of checkboxes.
		var drop = el('div', 'dccwl-drop');
		var toggle = el('button', 'dccwl-drop-btn', (i18n.layers || 'Layers') + ' ▾');
		toggle.type = 'button';
		toggle.setAttribute('aria-expanded', 'false');
		var panel = el('div', 'dccwl-drop-panel');
		panel.hidden = true;

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
		toggle.addEventListener('click', function () {
			panel.hidden = !panel.hidden;
			toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
		});
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

		// Fullscreen.
		var fs = el('button', 'dccwl-drop-btn', i18n.fullscreen || 'Fullscreen');
		fs.type = 'button';
		fs.addEventListener('click', function () {
			if (document.fullscreenElement) {
				document.exitFullscreen();
			} else if (shell.requestFullscreen) {
				shell.requestFullscreen();
			}
			setTimeout(function () { map.invalidateSize(); }, 200);
		});
		bar.appendChild(fs);

		return bar;
	}

	window.DCCWL_Map = { init: init };
})();
