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

		var uid = 'dccwl-' + (uidCounter += 1);
		var state = {
			month: new Date().getMonth(),
			openId: null,
			openCtx: null,
			opener: null
		};

		var titleEl = root.querySelector('.dccwl-title');
		var subEl = root.querySelector('.dccwl-sub');
		var strip = root.querySelector('.dccwl-spotlight-chips');
		var stripWrap = root.querySelector('.dccwl-strip-wrap');
		var slotSpot = root.querySelector('.dccwl-slot-spotlight');
		var slotGuide = root.querySelector('.dccwl-slot-guide');
		var updateStripFades = strip && stripWrap ? attachEdgeFades(strip, stripWrap) : null;

		/* ---------- shared detail panel ---------- */

		var panelId = uid + '-panel';
		var clip = el('div', 'dccwl-clip');
		var panel = el('div', 'dccwl-panel');
		panel.id = panelId;
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', CFG.i18n.details);
		var closeBtn = el('button', 'dccwl-panel-close');
		closeBtn.type = 'button';
		closeBtn.setAttribute('aria-label', CFG.i18n.close);
		closeBtn.innerHTML = ICON_CLOSE; // static trusted constant
		var panelBody = el('div', 'dccwl-panel-body');
		panel.appendChild(closeBtn);
		panel.appendChild(panelBody);
		clip.appendChild(panel);

		function allChips() {
			return root.querySelectorAll('.dccwl-chip');
		}

		function fillPanel(sp) {
			panelBody.textContent = '';
			var medallion = el('div', 'dccwl-medallion dccwl-medallion-' + (SCENES[sp.group] ? sp.group : 'critters'));
			medallion.innerHTML = SCENES[sp.group] || SCENES.critters; // static trusted constant
			medallion.appendChild(speciesArt(sp, 'dccwl-medallion-sprite', 'dccwl-medallion-emoji'));
			panelBody.appendChild(medallion);

			var text = el('div', 'dccwl-panel-text');
			var nameRow = el('p', 'dccwl-panel-name');
			nameRow.appendChild(el('strong', null, sp.name));
			if (sp.mascot) {
				nameRow.appendChild(el('span', 'dccwl-badge dccwl-badge-mascot', CFG.i18n.mascot));
			}
			if ((sp.months[state.month] || 0) >= 3) {
				nameRow.appendChild(el('span', 'dccwl-badge dccwl-badge-peak', CFG.i18n.peak));
			}
			text.appendChild(nameRow);
			text.appendChild(el('p', 'dccwl-fact', sp.fact));
			var meta = el('p', 'dccwl-cardmeta');
			meta.appendChild(el('span', 'dccwl-pill dccwl-pill-best', sp.best));
			if (sp.bestLabel) {
				meta.appendChild(el('span', 'dccwl-pill dccwl-pill-months', fmt(CFG.i18n.bestMonths, sp.bestLabel)));
			}
			text.appendChild(meta);
			text.appendChild(el('p', 'dccwl-where', CFG.i18n.where + ' ' + sp.where));
			panelBody.appendChild(text);
		}

		function setExpanded(chip) {
			allChips().forEach(function (c) {
				c.setAttribute('aria-expanded', c === chip ? 'true' : 'false');
			});
		}

		function closePanel(focusBack) {
			if (!state.openId) {
				return;
			}
			var slot = clip.parentNode;
			if (slot) {
				slot.classList.remove('dccwl-open');
			}
			setExpanded(null);
			state.openId = null;
			state.openCtx = null;
			if (focusBack && state.opener && root.contains(state.opener)) {
				state.opener.focus();
			}
			state.opener = null;
		}

		function openPanel(chip) {
			var id = chip.getAttribute('data-dccwl-species');
			var sp = speciesById[id];
			if (!sp) {
				return;
			}
			var ctx = chip.closest('.dccwl-guide') ? 'guide' : 'spot';
			if (state.openId === id && state.openCtx === ctx) {
				closePanel(false);
				return;
			}
			var targetSlot = ctx === 'guide' ? slotGuide : slotSpot;
			if (!targetSlot) {
				return;
			}

			var sameSlot = clip.parentNode === targetSlot && state.openId;
			if (sameSlot && !reducedMotion) {
				// Swap content in place with a quick crossfade.
				panelBody.classList.add('dccwl-fading');
				window.setTimeout(function () {
					fillPanel(sp);
					panelBody.classList.remove('dccwl-fading');
				}, 130);
			} else {
				if (clip.parentNode && clip.parentNode !== targetSlot) {
					clip.parentNode.classList.remove('dccwl-open');
				}
				fillPanel(sp);
				targetSlot.appendChild(clip);
				// Force a layout pass so the 0fr -> 1fr transition runs.
				void targetSlot.offsetHeight;
			}
			targetSlot.classList.add('dccwl-open');
			chip.setAttribute('aria-controls', panelId);
			setExpanded(chip);
			state.openId = id;
			state.openCtx = ctx;
			state.opener = chip;
		}

		function wireChip(chip) {
			chip.setAttribute('aria-controls', panelId);
			chip.addEventListener('click', function () {
				openPanel(chip);
			});
		}

		root.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && state.openId) {
				e.preventDefault();
				closePanel(true);
			}
		});
		closeBtn.addEventListener('click', function () {
			closePanel(true);
		});

		/* ---------- hero headline + subline ---------- */

		function updateHero() {
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

		/* ---------- spotlight chip strip ---------- */

		function buildChip(sp, value) {
			var li = el('li');
			var chip = el('button', 'dccwl-chip' + (sp.mascot ? ' dccwl-chip-mascot' : ''));
			chip.type = 'button';
			chip.setAttribute('data-dccwl-species', sp.id);
			chip.setAttribute('aria-expanded', 'false');
			chip.appendChild(speciesArt(sp, 'dccwl-chip-sprite', 'dccwl-chip-emoji'));
			chip.appendChild(el('span', 'dccwl-chip-name', sp.name));
			if (sp.mascot) {
				var mark = el('span', 'dccwl-chip-mark');
				mark.setAttribute('aria-hidden', 'true');
				mark.innerHTML = MASCOT_MARK; // static trusted constant
				chip.appendChild(mark);
				chip.appendChild(el('span', 'dccwl-sr', '— ' + CFG.i18n.mascot));
			}
			if (value >= 3) {
				var tick = el('span', 'dccwl-tick');
				tick.setAttribute('aria-hidden', 'true');
				chip.appendChild(tick);
				chip.appendChild(el('span', 'dccwl-sr', CFG.i18n.peak));
			}
			wireChip(chip);
			li.appendChild(chip);
			return li;
		}

		function renderSpotlight() {
			if (!strip) {
				return;
			}
			strip.textContent = '';
			var entries = speciesForMonth(state.month);
			if (!entries.length) {
				strip.appendChild(el('li', 'dccwl-empty', CFG.i18n.noSpotlight));
			}
			var items = entries.map(function (x) {
				return buildChip(x.s, x.v);
			});
			items.forEach(function (li) {
				strip.appendChild(li);
			});
			if (!reducedMotion && items.length) {
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
			if (updateStripFades) {
				updateStripFades();
			}
		}

		/* ---------- month nav ---------- */

		var monthButtons = [];

		function setMonth(m) {
			m = ((m % 12) + 12) % 12;
			if (m === state.month) {
				return;
			}
			state.month = m;
			if (state.openCtx === 'spot') {
				closePanel(false);
			}
			monthButtons.forEach(function (b, i) {
				b.setAttribute('aria-pressed', i === m ? 'true' : 'false');
			});
			centerMonthButton();
			updateHero();
			renderSpotlight();
		}

		function centerMonthButton() {
			var msWrap = root.querySelector('.dccwl-months');
			var btn = monthButtons[state.month];
			if (!msWrap || !btn || msWrap.scrollWidth <= msWrap.clientWidth) {
				return;
			}
			msWrap.scrollLeft = btn.offsetLeft - (msWrap.clientWidth - btn.offsetWidth) / 2;
		}

		function buildMonthNav() {
			var nav = root.querySelector('.dccwl-monthnav');
			if (!nav) {
				return;
			}
			var msWrap = nav.querySelector('.dccwl-months');
			CFG.months.forEach(function (abbrev, m) {
				var btn = el('button', 'dccwl-month-btn', abbrev);
				btn.type = 'button';
				btn.setAttribute('aria-label', CFG.monthsFull[m] || abbrev);
				btn.setAttribute('aria-pressed', m === state.month ? 'true' : 'false');
				btn.addEventListener('click', function () {
					setMonth(m);
				});
				msWrap.appendChild(btn);
				monthButtons.push(btn);
			});
			nav.querySelector('.dccwl-nav-prev').addEventListener('click', function () {
				setMonth(state.month - 1);
			});
			nav.querySelector('.dccwl-nav-next').addEventListener('click', function () {
				setMonth(state.month + 1);
			});
			attachEdgeFades(msWrap, nav);
			nav.hidden = false;
			centerMonthButton();
		}

		/* ---------- field guide tabs ---------- */

		function initGuide() {
			var guide = root.querySelector('.dccwl-guide');
			if (!guide) {
				return;
			}
			guide.querySelectorAll('.dccwl-chip').forEach(wireChip);
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
					if (state.openCtx === 'guide') {
						closePanel(false);
					}
				});
			});
		}

		/* ---------- boot this instance ---------- */

		updateHero();
		renderSpotlight();
		if (instance.browser) {
			buildMonthNav();
		}
		initGuide();
	}

	function initAll() {
		document.querySelectorAll('.dccwl-root').forEach(initRoot);
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
					}
				}
			);
		}
	});
})();
