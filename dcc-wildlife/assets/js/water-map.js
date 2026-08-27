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

	/* DCC palette. Deliberately not Croatia's. */
	var C = {
		navy: '#0a3d62',
		coral: '#e8604f',
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
		ramp: '#e8604f',
		rampClosed: '#8a97a0',
		home: '#0a3d62'
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
		return n.toFixed(typeof dp === 'number' ? dp : 2).replace(/\.?0+$/, '');
	}

	function ageWords(days, i18n) {
		if (typeof days !== 'number') { return i18n.noReading || 'no recent reading'; }
		if (days < 45) { return days + 'd'; }
		if (days < 730) { return Math.round(days / 30) + 'mo'; }
		return Math.round(days / 365) + 'y';
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
		if (best < 60) { return C.fresh; }
		if (best < 730) { return C.months; }
		return C.years;
	}

	var MODES = {
		clarity: colourClarity,
		level: colourLevel,
		fresh: colourFresh
	};

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
			line(box, 'Clarity:', cl);
			line(box, (i18n.sampled || 'sampled') + ':', w.clarity.date || '');
		}

		if (w.level) {
			if (w.level.stale) {
				// Do not state an old elevation as a current condition.
				line(box, 'Level:', (i18n.staleLevel || 'level reading is old') +
					(w.level.date ? ' — ' + w.level.date : ''));
			} else if (typeof w.level.inches === 'number') {
				var dir = w.level.inches > 0 ? 'above' : 'below';
				line(box, 'Level:', Math.abs(Math.round(w.level.inches)) + ' in ' + dir +
					' its monthly norm' + (w.level.date ? ' — ' + w.level.date : ''));
			}
		}

		if (typeof w.miles === 'number') {
			line(box, 'Distance:', w.miles + ' ' + (i18n.milesAway || 'mi, straight line'));
		}

		if (w.depthMap && w.depthMap.url) {
			var a = el('a', 'dccwl-pop-link', i18n.depthMap || 'Depth map (PDF)');
			a.href = w.depthMap.url;
			a.target = '_blank';
			a.rel = 'noopener nofollow';
			box.appendChild(a);
		}
		if (w.clarity && w.clarity.url) {
			var s = el('a', 'dccwl-pop-link', 'Station ' + (w.clarity.station || ''));
			s.href = w.clarity.url;
			s.target = '_blank';
			s.rel = 'noopener nofollow';
			box.appendChild(s);
		}
		return box;
	}

	function rampPopup(r, i18n) {
		var box = el('div', 'dccwl-pop');
		box.appendChild(el('h4', 'dccwl-pop-title', r.name || 'Boat ramp'));

		// Status is honoured loudly: a guest towing a boat to a closed ramp
		// is exactly the error this module exists to prevent.
		if (r.status && /closed/i.test(r.status)) {
			var warn = el('p', 'dccwl-pop-closed', i18n.closed || 'CLOSED');
			box.appendChild(warn);
		}
		line(box, 'Water:', r.water || '');
		line(box, 'City:', r.city || '');
		if (typeof r.lanes === 'number') { line(box, 'Lanes:', String(r.lanes)); }
		if (r.fee) { line(box, 'Fee:', r.fee); }
		if (r.restroom) { line(box, 'Restrooms:', r.restroom); }
		if (r.status) { line(box, 'Status:', r.status); }
		if (typeof r.miles === 'number') {
			line(box, 'Distance:', r.miles + ' ' + (i18n.milesAway || 'mi, straight line'));
		}
		box.appendChild(el('p', 'dccwl-pop-src', 'Source: FWC boat ramp inventory'));
		return box;
	}

	/* ---- build ------------------------------------------------------- */

	function init(shell, data, cfg, i18n) {
		var L = window.L;
		shell.textContent = '';

		var canvas = el('div', 'dccwl-map-canvas');
		shell.appendChild(canvas);

		var map = L.map(canvas, { scrollWheelZoom: false });
		L.tileLayer(cfg.tileUrl, {
			attribution: cfg.tileAttrib || '',
			maxZoom: 18
		}).addTo(map);

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

		function recolour(mode) {
			var fn = MODES[mode] || MODES.clarity;
			waterMarkers.forEach(function (x) {
				x.marker.setStyle({ fillColor: fn(x.water) });
			});
		}
		recolour('clarity');

		shell.appendChild(buildBar(map, groups, recolour, shell, i18n));
		setTimeout(function () { map.invalidateSize(); }, 60);
	}

	/* ---- the control bar --------------------------------------------- */

	function buildBar(map, groups, recolour, shell, i18n) {
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
