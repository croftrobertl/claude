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

	/* Render an ISO instant in the visitor's locale. Falls back to the raw
	 * string rather than inventing a format we cannot verify. */
	function readingTime(iso) {
		if (!iso) { return ''; }
		var d = new Date(iso);
		if (isNaN(d.getTime())) { return String(iso); }
		try {
			return d.toLocaleString(undefined, {
				month: 'short', day: 'numeric',
				hour: 'numeric', minute: '2-digit'
			});
		} catch (e) {
			return d.toISOString();
		}
	}

	function buildRow(f) {
		// Belt and braces: the server already dropped unsourced facts.
		if (!f || !f.label || !f.value || !f.sourceName) { return null; }

		var li = el('li', 'dccwl-water-fact dccwl-water-tier-' + (f.tier || 'live'));
		li.appendChild(el('span', 'dccwl-water-label', f.label));
		li.appendChild(el('span', 'dccwl-water-value', f.value));

		var attr = el('span', 'dccwl-water-attr');
		if (f.sourceUrl) {
			var a = el('a', null, f.sourceName);
			a.href = f.sourceUrl;
			a.rel = 'noopener nofollow';
			a.target = '_blank';
			attr.appendChild(a);
		} else {
			attr.appendChild(document.createTextNode(f.sourceName));
		}

		var when = readingTime(f.date);
		if (when) {
			// The wording comes from the fact: a gauge is "read", a lab
			// sample is "sampled", a survey is "surveyed". Falls back to the
			// generic word rather than asserting the wrong one.
			var prefix = f.dateLabel || (CFG.i18n && CFG.i18n.asOf) || 'reading';
			attr.appendChild(el('span', 'dccwl-water-date', prefix + ' ' + when));
		}
		if (f.note) {
			attr.appendChild(el('span', 'dccwl-water-note', f.note));
		}
		li.appendChild(attr);
		return li;
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
			var row = buildRow(f);
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
		shown += chainShown;

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

	function init() {
		var roots = document.querySelectorAll('[data-dccwl-water-live]');
		if (!roots.length) { return; }

		window.fetch(CFG.endpoint, { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (data) {
				if (!data || !data.enabled || !Array.isArray(data.facts) || !data.facts.length) {
					return;
				}
				roots.forEach(function (root) { fill(root, data.facts); });
			})
			.catch(function () { /* guests see the almanac; never an error */ });
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
		var shell = wrap.querySelector('[data-dccwl-map-shell]');
		if (!btn || !shell) { return; }

		btn.addEventListener('click', function () {
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
					shell.hidden = false;
					btn.parentNode.removeChild(btn);
					window.DCCWL_Map.init(shell, data, cfg, CFG.i18n || {});
				})
				.catch(function () {
					btn.disabled = false;
					btn.textContent = (CFG.i18n && CFG.i18n.mapFailed) || 'Map unavailable';
				});
		});
	}

	function boot() {
		init();
		initMap();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
