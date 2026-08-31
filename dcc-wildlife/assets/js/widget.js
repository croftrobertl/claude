/**
 * DCC Wildlife — front-end behavior. Vanilla JS, no jQuery.
 *
 * The month shown is chosen HERE from the visitor's local date (never baked
 * into cached HTML by PHP). All dynamic/user text is inserted via
 * textContent; innerHTML is used ONLY for the static, trusted SVG scene
 * constants below — never for anything derived from data or user input.
 */
(function () {
	'use strict';

	var CFG = window.DCC_WL_CFG;
	if (!CFG || !Array.isArray(CFG.species)) {
		return;
	}

	var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	var speciesById = {};
	CFG.species.forEach(function (s) {
		speciesById[s.id] = s;
	});

	/* Static, trusted SVG scene vignettes — one per group, reused across
	 * species. Flat-illustration style in the site's deep teals. */
	var SCENES = {
		critters:
			'<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
			'<rect width="120" height="120" fill="#2b5a66"/>' +
			'<path d="M0 68 Q30 62 60 68 T120 68 V120 H0 Z" fill="#234b56"/>' +
			'<ellipse cx="60" cy="88" rx="30" ry="7" fill="none" stroke="#4d7d86" stroke-width="2"/>' +
			'<ellipse cx="60" cy="88" rx="16" ry="4" fill="none" stroke="#6da3ae" stroke-width="1.5"/>' +
			'<path d="M13 102 a13 8 0 1 1 26 0 l-13 -3 z" fill="#2e7d5b"/>' +
			'<path d="M96 99 a10 6 0 1 1 20 0 l-10 -2.4 z" fill="#27604a"/>' +
			'<circle cx="98" cy="26" r="2.5" fill="#6da3ae"/>' +
			'<circle cx="22" cy="20" r="2" fill="#4d7d86"/>' +
			'<circle cx="34" cy="34" r="1.5" fill="#4d7d86"/>' +
			'</svg>',
		birds:
			'<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
			'<rect width="120" height="120" fill="#f6d7b8"/>' +
			'<rect y="36" width="120" height="30" fill="#efc6a4"/>' +
			'<circle cx="88" cy="26" r="12" fill="#f9e6cd"/>' +
			'<path d="M0 76 10 66 14 76 22 60 30 76 38 68 44 76 54 56 62 76 72 64 80 76 90 60 98 76 108 68 114 76 120 71 V120 H0 Z" fill="#46707a"/>' +
			'<path d="M0 94 Q30 90 60 94 T120 94 V120 H0 Z" fill="#1c3a43"/>' +
			'<path d="M20 26 q4 -4 8 0 q4 -4 8 0" fill="none" stroke="#d8a986" stroke-width="2" stroke-linecap="round"/>' +
			'<path d="M42 16 q3 -3 6 0 q3 -3 6 0" fill="none" stroke="#d8a986" stroke-width="1.8" stroke-linecap="round"/>' +
			'</svg>',
		plants:
			'<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
			'<rect width="120" height="120" fill="#e9e3d0"/>' +
			'<path d="M0 78 Q30 72 60 78 T120 78 V120 H0 Z" fill="#2e5d46"/>' +
			'<path d="M0 102 Q30 98 60 102 T120 102 V120 H0 Z" fill="#1c3a43"/>' +
			'<line x1="36" y1="100" x2="36" y2="42" stroke="#5d3f28" stroke-width="2.5"/>' +
			'<rect x="32.5" y="26" width="7" height="18" rx="3.5" fill="#8a5a3b"/>' +
			'<line x1="52" y1="100" x2="52" y2="58" stroke="#5d3f28" stroke-width="2"/>' +
			'<rect x="49" y="44" width="6" height="15" rx="3" fill="#8a5a3b"/>' +
			'<path d="M68 102 C74 74 88 62 98 56" fill="none" stroke="#3e7257" stroke-width="3" stroke-linecap="round"/>' +
			'<path d="M78 104 C86 86 100 80 108 78" fill="none" stroke="#356a50" stroke-width="3" stroke-linecap="round"/>' +
			'<path d="M22 102 C18 82 10 74 4 70" fill="none" stroke="#3e7257" stroke-width="3" stroke-linecap="round"/>' +
			'</svg>'
	};

	var ICON_CLOSE =
		'<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
		'<path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

	var MASCOT_MARK =
		'<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">' +
		'<path d="M6 1 C8.5 2.5 10 5 9.5 8 L6 11 L2.5 8 C2 5 3.5 2.5 6 1 Z" fill="#e8604f"/>' +
		'<path d="M6 3.2 V9.4" stroke="#f8ded9" stroke-width="1" stroke-linecap="round"/></svg>';

	function el(tag, cls, text) {
		var node = document.createElement(tag);
		if (cls) {
			node.className = cls;
		}
		if (text !== undefined && text !== null) {
			node.textContent = text;
		}
		return node;
	}

	/* <svg><use> reference to the server-printed sprite symbol sheet.
	 * Built with createElementNS (no innerHTML), so species ids from the
	 * filterable config can never inject markup. */
	function spriteUse(id, cls) {
		var NS = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', cls);
		svg.setAttribute('viewBox', '0 0 48 48');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('focusable', 'false');
		var use = document.createElementNS(NS, 'use');
		use.setAttribute('href', '#dccwl-sp-' + id);
		use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#dccwl-sp-' + id);
		svg.appendChild(use);
		return svg;
	}

	/* Species art: bespoke sprite when the registry has one, emoji fallback
	 * for filter-added species without a sprite. */
	function speciesArt(sp, spriteCls, emojiCls) {
		if (sp.sprite) {
			return spriteUse(sp.id, spriteCls);
		}
		var emoji = el('span', emojiCls, sp.emoji);
		emoji.setAttribute('aria-hidden', 'true');
		return emoji;
	}

	function fmt(template) {
		var args = Array.prototype.slice.call(arguments, 1);
		var auto = 0;
		return String(template).replace(/%(\d+\$)?[sd]/g, function (m, pos) {
			var idx = pos ? parseInt(pos, 10) - 1 : auto++;
			return String(args[idx]);
		});
	}

	function speciesForMonth(month) {
		return CFG.species
			.map(function (s, i) {
				return { s: s, v: (s.months && s.months[month]) || 0, i: i };
			})
			.filter(function (x) {
				return x.v >= 2;
			})
			.sort(function (a, b) {
				if (b.v !== a.v) {
					return b.v - a.v;
				}
				// The heron (our mascot) leads among ties.
				var am = a.s.mascot ? 1 : 0;
				var bm = b.s.mascot ? 1 : 0;
				if (bm !== am) {
					return bm - am;
				}
				return a.i - b.i;
			});
	}

	/* Toggle edge-fade cue classes on a horizontal scroller's wrapper. */
	function attachEdgeFades(scroller, wrap) {
		function update() {
			var max = scroller.scrollWidth - scroller.clientWidth;
			wrap.classList.toggle('dccwl-fade-l', scroller.scrollLeft > 4);
			wrap.classList.toggle('dccwl-fade-r', max > 4 && scroller.scrollLeft < max - 4);
		}
		scroller.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		update();
		return update;
	}

	var uidCounter = 0;

	function initRoot(root) {
		if (root.getAttribute('data-dccwl-init')) {
			return;
		}
		root.setAttribute('data-dccwl-init', '1');

		var instance = {};
		try {
			instance = JSON.parse(root.getAttribute('data-dccwl') || '{}');
		} catch (err) {
			instance = {};
		}

		var state = { month: new Date().getMonth(), openId: null, opener: null };

		var titleEl = root.querySelector('.dccwl-title');
		var subEl = root.querySelector('.dccwl-sub');
		var strip = root.querySelector('.dccwl-spotlight-tiles');

		/* ---------- the detail sheet ----------
		 * Species open in the SAME sliding sheet the chain map uses, so the
		 * two widgets share one motion and one focus-trap implementation
		 * (assets/js/sheet.js). Everything below inserts text with
		 * textContent — species data passes through a public filter. */

		function likelihoodStrip(sp) {
			var wrap = el('div', 'dccwl-like');
			wrap.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.likelihood));

			var row = el('ul', 'dccwl-like-row');
			var names = [CFG.i18n.likeRare, CFG.i18n.likePossible, CFG.i18n.likeGood, CFG.i18n.likePeak];
			(sp.months || []).forEach(function (v, m) {
				var level = Math.max(0, Math.min(3, v | 0));
				var cell = el('li', 'dccwl-like-cell dccwl-like-' + level);
				var bar = el('span', 'dccwl-like-bar');
				bar.setAttribute('aria-hidden', 'true');
				cell.appendChild(bar);
				cell.appendChild(el('span', 'dccwl-like-m', CFG.months[m]));
				if (m === state.month) {
					cell.classList.add('dccwl-like-now');
				}
				// The bars are decoration; this is the actual reading of it.
				cell.appendChild(el('span', 'dccwl-sr',
					(CFG.monthsFull[m] || CFG.months[m]) + ': ' + (names[level] || '')));
				row.appendChild(cell);
			});
			wrap.appendChild(row);
			return wrap;
		}

		function buildDetail(body, sp) {
			var medallion = el('div', 'dccwl-medallion dccwl-medallion-' + (SCENES[sp.group] ? sp.group : 'critters'));
			medallion.innerHTML = SCENES[sp.group] || SCENES.critters; // static trusted constant
			medallion.appendChild(speciesArt(sp, 'dccwl-medallion-sprite', 'dccwl-medallion-emoji'));
			body.appendChild(medallion);

			var badges = el('p', 'dccwl-detail-badges');
			if (sp.mascot) {
				badges.appendChild(el('span', 'dccwl-badge dccwl-badge-mascot', CFG.i18n.mascot));
			}
			if ((sp.months[state.month] || 0) >= 3) {
				badges.appendChild(el('span', 'dccwl-badge dccwl-badge-peak', CFG.i18n.peak));
			}
			if (badges.childNodes.length) {
				body.appendChild(badges);
			}

			body.appendChild(el('p', 'dccwl-fact', sp.fact));

			// Where to look + best time: the two questions a guest on the
			// dock actually has, given their own headings in the drawer.
			if (sp.where) {
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.where));
				body.appendChild(el('p', 'dccwl-detail-p', sp.where));
			}
			if (sp.best) {
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.bestTime));
				var bestP = el('p', 'dccwl-detail-p', sp.best);
				body.appendChild(bestP);
				if (sp.bestLabel) {
					var chips = el('p', 'dccwl-detail-chips');
					chips.appendChild(el('span', 'dccwl-metachip', fmt(CFG.i18n.bestMonths, sp.bestLabel)));
					body.appendChild(chips);
				}
			}

			body.appendChild(likelihoodStrip(sp));
		}

		function allTiles() {
			return root.querySelectorAll('.dccwl-tile');
		}

		function markOpen(tile) {
			allTiles().forEach(function (t) {
				t.setAttribute('aria-expanded', t === tile ? 'true' : 'false');
			});
		}

		function openDetail(tile) {
			var id = tile.getAttribute('data-dccwl-species');
			var sp = speciesById[id];
			if (!sp || !window.DCCWL_Sheet) {
				return;
			}
			state.openId = id;
			markOpen(tile);
			window.DCCWL_Sheet.open({
				title: sp.name,
				appClasses: root.className.replace('dccwl-root', '').trim(),
				closeLabel: CFG.i18n.close,
				opener: tile,
				build: function (body) { buildDetail(body, sp); },
				onClose: function () {
					state.openId = null;
					markOpen(null);
				}
			});
		}

		function wireTile(tile) {
			tile.addEventListener('click', function () {
				openDetail(tile);
			});
		}

		/* ---------- headline + subline ---------- */

		function updateHead() {
			var m = state.month;
			var entries = speciesForMonth(m);
			var peaks = entries.filter(function (x) { return x.v >= 3; }).length;
			var phrase = peaks > 1 ? fmt(CFG.i18n.subPeak, peaks)
				: peaks === 1 ? CFG.i18n.subPeakOne
					: fmt(CFG.i18n.subSpot, entries.length);
			if (instance.customTitle) {
				if (subEl) {
					subEl.textContent = fmt(CFG.i18n.monthSub, CFG.monthsFull[m], phrase);
				}
			} else {
				if (titleEl) {
					titleEl.textContent = fmt(CFG.i18n.headline, CFG.monthsFull[m]);
				}
				if (subEl) {
					subEl.textContent = phrase;
				}
			}
		}

		/* ---------- spotlight tiles ---------- */

		function buildTile(sp, value) {
			var li = el('li');
			var tile = el('button', 'dccwl-tile' + (sp.mascot ? ' dccwl-tile-mascot' : ''));
			tile.type = 'button';
			tile.setAttribute('data-dccwl-species', sp.id);
			tile.setAttribute('aria-haspopup', 'dialog');
			tile.setAttribute('aria-expanded', 'false');

			var icon = el('span', 'dccwl-tile-icon');
			icon.appendChild(speciesArt(sp, 'dccwl-chip-sprite', 'dccwl-tile-emoji'));
			tile.appendChild(icon);
			tile.appendChild(el('span', 'dccwl-tile-name', sp.name));

			if (value >= 3) {
				tile.appendChild(el('span', 'dccwl-tile-sub dccwl-tile-peak', CFG.i18n.peakShort));
			} else if (sp.bestLabel) {
				tile.appendChild(el('span', 'dccwl-tile-sub', sp.bestLabel));
			}
			if (sp.mascot) {
				var mark = el('span', 'dccwl-tile-mark');
				mark.setAttribute('aria-hidden', 'true');
				mark.innerHTML = MASCOT_MARK; // static trusted constant
				tile.appendChild(mark);
				tile.appendChild(el('span', 'dccwl-sr', '— ' + CFG.i18n.mascot));
			}

			wireTile(tile);
			li.appendChild(tile);
			return li;
		}

		/* The right-edge fade cues "there is more"; at the end there is not. */
		function updateStripEnd() {
			if (!strip) { return; }
			var max = strip.scrollWidth - strip.clientWidth;
			strip.classList.toggle('dccwl-at-end', max <= 4 || strip.scrollLeft >= max - 4);
		}

		function renderSpotlight() {
			if (!strip) {
				return;
			}
			strip.textContent = '';
			var entries = speciesForMonth(state.month);
			if (!entries.length) {
				strip.appendChild(el('li', 'dccwl-empty', CFG.i18n.noSpotlight));
				return;
			}
			var items = entries.map(function (x) {
				return buildTile(x.s, x.v);
			});
			items.forEach(function (li) {
				strip.appendChild(li);
			});
			if (!reducedMotion) {
				// Quick staggered fade-in (~40ms apart, capped).
				items.forEach(function (li, i) {
					li.classList.add('dccwl-in');
					li.style.transitionDelay = Math.min(i * 40, 320) + 'ms';
				});
				window.requestAnimationFrame(function () {
					window.requestAnimationFrame(function () {
						items.forEach(function (li) {
							li.classList.remove('dccwl-in');
						});
					});
				});
				window.setTimeout(function () {
					items.forEach(function (li) {
						li.style.transitionDelay = '';
					});
				}, 700);
			}
			strip.scrollLeft = 0;
			updateStripEnd();
		}

		/* ---------- month timeline ---------- */

		var monthButtons = [];

		function setMonth(m) {
			m = ((m % 12) + 12) % 12;
			if (m === state.month) {
				return;
			}
			state.month = m;
			monthButtons.forEach(function (b, i) {
				b.setAttribute('aria-pressed', i === m ? 'true' : 'false');
				b.classList.toggle('dccwl-month-on', i === m);
			});
			centerMonth();
			updateHead();
			renderSpotlight();
		}

		function centerMonth() {
			var track = root.querySelector('.dccwl-timeline-track');
			var btn = monthButtons[state.month];
			if (!track || !btn || track.scrollWidth <= track.clientWidth) {
				return;
			}
			track.scrollLeft = btn.offsetLeft - (track.clientWidth - btn.offsetWidth) / 2;
		}

		function buildTimeline() {
			var nav = root.querySelector('.dccwl-timeline');
			if (!nav) {
				return;
			}
			var track = nav.querySelector('.dccwl-timeline-track');
			CFG.months.forEach(function (abbrev, m) {
				var btn = el('button', 'dccwl-month' + (m === state.month ? ' dccwl-month-on' : ''), abbrev);
				btn.type = 'button';
				btn.setAttribute('aria-label', CFG.monthsFull[m] || abbrev);
				btn.setAttribute('aria-pressed', m === state.month ? 'true' : 'false');
				btn.addEventListener('click', function () {
					setMonth(m);
				});
				track.appendChild(btn);
				monthButtons.push(btn);
			});
			nav.querySelector('.dccwl-timeline-prev').addEventListener('click', function () {
				setMonth(state.month - 1);
			});
			nav.querySelector('.dccwl-timeline-next').addEventListener('click', function () {
				setMonth(state.month + 1);
			});
			attachEdgeFades(track, nav);
			nav.hidden = false;
			centerMonth();
		}

		/* ---------- field guide tabs ---------- */

		function initGuide() {
			var guide = root.querySelector('.dccwl-guide');
			if (!guide) {
				return;
			}
			guide.querySelectorAll('.dccwl-tile').forEach(wireTile);
			var tabs = guide.querySelectorAll('.dccwl-tab');
			var grids = guide.querySelectorAll('.dccwl-guide-grid');
			tabs.forEach(function (tab) {
				tab.addEventListener('click', function () {
					var group = tab.getAttribute('data-dccwl-group');
					tabs.forEach(function (t) {
						t.setAttribute('aria-pressed', t === tab ? 'true' : 'false');
					});
					grids.forEach(function (g) {
						g.hidden = g.getAttribute('data-dccwl-group') !== group;
					});
				});
			});
		}

		/* ---------- boot this instance ---------- */

		if (strip) {
			strip.addEventListener('scroll', updateStripEnd, { passive: true });
			window.addEventListener('resize', updateStripEnd);
		}

		updateHead();
		renderSpotlight();
		if (instance.browser) {
			buildTimeline();
		}
		initGuide();
	}

	/* ------------------------------------------------------------------
	 * Season countdown (absorbed from the dcc-wildlife-countdown mu-plugin
	 * in 1.8.0 — same markup, same logic). The day count is computed HERE,
	 * never baked into cached HTML, and in CANAL time, not the visitor's:
	 * "manatee season" is a fact about Florida. Reads the same species
	 * calendar the field guide ships, so it can never disagree with it.
	 * ---------------------------------------------------------------- */

	function canalToday() {
		try {
			var parts = new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric'
			}).formatToParts(new Date());
			var got = {};
			parts.forEach(function (p) { got[p.type] = parseInt(p.value, 10); });
			return new Date(got.year, got.month - 1, got.day);
		} catch (e) { return new Date(); }
	}

	/* The next month where a species rises TO peak (3) from below it. A
	 * species at peak all year (the heron) never rises and is skipped rather
	 * than reported as 0 days out. */
	function nextRise(scores, today) {
		var PEAK = 3, DAY = 86400000, cur = today.getMonth();
		for (var off = 0; off <= 12; off++) {
			var m = (cur + off) % 12;
			var prev = (m + 11) % 12;
			if (scores[m] === PEAK && scores[prev] < PEAK) {
				if (off === 0) { return { days: 0, here: true, month: m }; }
				var first = new Date(today.getFullYear() + Math.floor((cur + off) / 12), m, 1);
				return { days: Math.max(0, Math.round((first - today) / DAY)), here: false, month: m };
			}
		}
		return null;
	}

	/* Fill a countdown div: emoji span + text, with the day count in its own
	 * styled span. Built with createElement/textContent throughout — the
	 * species list passes through a filter, so nothing here may be innerHTML. */
	function fillCountdown(node, best, i18n) {
		node.textContent = '';
		node.classList.add('dccwl-hero-stat');

		// Icon: the species' own sprite, at hero scale.
		var icon = el('span', 'dccwl-hero-icon');
		icon.appendChild(speciesArt(best.s, 'dccwl-hero-sprite', 'dccwl-hero-emoji'));
		node.appendChild(icon);

		var textWrap = el('div', 'dccwl-hero-text');

		// "Manatee season" — the label, quiet above the number.
		textWrap.appendChild(el('p', 'dccwl-hero-label',
			fmt(i18n.cdLabel || '%s season', best.s.name)));

		var value = el('p', 'dccwl-hero-value');
		if (best.here) {
			value.appendChild(el('span', 'dccwl-hero-now', i18n.cdNow || 'is here now'));
		} else {
			value.appendChild(el('span', 'dccwl-hero-num', String(best.days)));
			value.appendChild(el('span', 'dccwl-hero-unit',
				best.days === 1 ? (i18n.cdDay || 'day') : (i18n.cdDays || 'days')));
		}
		textWrap.appendChild(value);

		// One line of reason, so the number is never a bare assertion.
		var monthName = (CFG.monthsFull && CFG.monthsFull[best.month]) || '';
		var why = best.here
			? fmt(i18n.cdWhyNow || 'Peak sightings run through %s.', monthName)
			: fmt(i18n.cdWhy || 'Peak sightings begin in %s.', monthName);
		textWrap.appendChild(el('p', 'dccwl-hero-why', why));

		node.appendChild(textWrap);
		node.hidden = false;
	}

	function initCountdown() {
		// While the old mu-plugin exists, PHP sets countdown:false and emits
		// no shell here — its own script keeps rendering, exactly once.
		if (!CFG.countdown) { return; }
		var shells = document.querySelectorAll('[data-dccwl-countdown]');
		if (!shells.length) { return; }

		var today = canalToday(), best = null;
		CFG.species.forEach(function (s) {
			if (!Array.isArray(s.months)) { return; }
			var rise = nextRise(s.months, today);
			if (!rise) { return; }
			if (!best || rise.days < best.days) {
				best = { days: rise.days, here: rise.here, month: rise.month, s: s };
			}
		});
		if (!best) { return; }

		Array.prototype.forEach.call(shells, function (node) {
			fillCountdown(node, best, CFG.i18n || {});
		});
	}

	function initAll() {
		document.querySelectorAll('.dccwl-root').forEach(initRoot);
		initCountdown();
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
				'frontend/element_ready/dccwl_month.default',
				function ($scope) {
					var scope = $scope && $scope[0] ? $scope[0] : $scope;
					if (scope && scope.querySelectorAll) {
						scope.querySelectorAll('.dccwl-root').forEach(initRoot);
						initCountdown();
					}
				}
			);
			// Standalone countdown widget (1.8.1): fill its shell when the
			// editor/preview re-renders it.
			window.elementorFrontend.hooks.addAction(
				'frontend/element_ready/dccwl_countdown.default',
				function () { initCountdown(); }
			);
		}
	});
})();
