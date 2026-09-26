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

	/*
	 * Tunables from the settings page (1.32.0).
	 *
	 * Each fallback is the value that was hard-coded before, so a page whose
	 * config predates this — a cached page served during an upgrade, say —
	 * behaves exactly as it did. `num()` also refuses a nonsensical value
	 * rather than letting a bad setting make the guide look empty: 0 is
	 * legitimate for a cap but never for a threshold.
	 */
	var SET = (CFG && CFG.set) || {};

	function setNum(key, fallback, min) {
		var v = parseInt(SET[key], 10);
		if (isNaN(v)) { return fallback; }
		if (typeof min === 'number' && v < min) { return fallback; }
		return v;
	}

	var SPOTLIGHT_MIN = setNum('spotlightMin', 2, 1);
	var PEAK_SCORE = setNum('peakScore', 3, 1);
	var SEARCH_SQUASH = setNum('searchSquash', 3, 1);
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
			'<rect width="120" height="120" fill="#3f7079"/>' +
			'<rect width="120" height="52" fill="#5a8d95"/>' +
			'<ellipse cx="60" cy="70" rx="48" ry="9" fill="none" stroke="#7aacb2" stroke-width="1.6" opacity="0.65"/>' +
			'<ellipse cx="60" cy="70" rx="28" ry="5.5" fill="none" stroke="#a2c9ce" stroke-width="1.3" opacity="0.65"/>' +
			'<path d="M0 98 H120 V120 H0 Z" fill="#2c5560"/>' +
			'<path d="M-2 100 q30 -6 60 0 t62 0" fill="none" stroke="#4d7d86" stroke-width="3" opacity="0.55"/>' +
			'<ellipse cx="22" cy="106" rx="15" ry="4.6" fill="#2e7d5b"/>' +
			'<ellipse cx="99" cy="100" rx="12" ry="4" fill="#27604a"/>' +
			'<g stroke="#3e7257" stroke-width="2.2" stroke-linecap="round"><line x1="9" y1="74" x2="9" y2="54"/><line x1="14" y1="74" x2="15" y2="58"/></g>' +
			'<circle cx="99" cy="24" r="2.4" fill="#a2c9ce"/><circle cx="24" cy="20" r="1.8" fill="#7aacb2"/>' +
			'</svg>',
		birds:
			'<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
			'<rect width="120" height="120" fill="#f7ddc0"/>' +
			'<rect y="40" width="120" height="80" fill="#f0d0ae"/>' +
			'<circle cx="60" cy="34" r="15" fill="#fcead6"/>' +
			'<path d="M0 62 q10 -6 20 -2 q10 4 20 -1 q10 -6 20 -1 q10 4 20 -2 q10 -6 20 0 q10 4 20 -1 V84 H0 Z" fill="#7aa3a9" opacity="0.4"/>' +
			'<rect y="80" width="120" height="40" fill="#4d7d86"/>' +
			'<rect y="80" width="120" height="5" fill="#7cabb3"/>' +
			'<g stroke="#c8e0e3" stroke-width="1.4" stroke-linecap="round" opacity="0.5"><line x1="14" y1="98" x2="34" y2="98"/><line x1="72" y1="106" x2="98" y2="106"/><line x1="46" y1="113" x2="62" y2="113"/></g>' +
			'<path d="M2 82 C-2 56 8 46 12 32 C17 46 25 60 20 82 Z" fill="#2f5a52"/>' +
			'<g stroke="#8aa994" stroke-width="1" stroke-linecap="round" opacity="0.75"><line x1="8" y1="48" x2="8" y2="62"/><line x1="13" y1="52" x2="13" y2="64"/></g>' +
			'<g stroke="#3e7257" stroke-width="2.2" stroke-linecap="round"><line x1="110" y1="82" x2="110" y2="60"/><line x1="115" y1="82" x2="116" y2="64"/><line x1="105" y1="82" x2="106" y2="66"/></g>' +
			'</svg>',
		plants:
			'<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
			'<rect width="120" height="120" fill="#e8e1ce"/>' +
			'<rect y="72" width="120" height="48" fill="#d0c7ac"/>' +
			'<rect x="28" y="0" width="9" height="120" fill="#6b4a30"/>' +
			'<rect x="84" y="0" width="7" height="120" fill="#7a5638"/>' +
			'<g stroke="#9aa77e" stroke-width="1.4" stroke-linecap="round" opacity="0.8"><line x1="32" y1="18" x2="32" y2="40"/><line x1="37" y1="24" x2="37" y2="46"/><line x1="87" y1="16" x2="87" y2="34"/><line x1="82" y1="22" x2="82" y2="40"/></g>' +
			'<path d="M0 80 C12 68 22 70 26 80" fill="none" stroke="#3e7257" stroke-width="3" stroke-linecap="round"/>' +
			'<path d="M120 84 C108 72 98 74 94 84" fill="none" stroke="#356a50" stroke-width="3" stroke-linecap="round"/>' +
			'<ellipse cx="60" cy="112" rx="52" ry="7" fill="#bcb392" opacity="0.55"/>' +
			'</svg>'
	};

	var ICON_CLOSE =
		'<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
		'<path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
	SCENES.safety = SCENES.critters;

	/* The safety group is a warning list, not a spotting list (1.19.0): it
	 * never drives the countdown, the counts, the spotlight or the art. */
	function isSpotting(s) { return s.group !== 'safety'; }

	/* A neutral GROUP glyph — what a tile shows with no vetted photo. */
	function glyphUse(group, cls) {
		var NS = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'dccwl-glyph ' + cls);
		svg.setAttribute('viewBox', '0 0 48 48');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('focusable', 'false');
		var use = document.createElementNS(NS, 'use');
		var ref = '#dccwl-gl-' + (SCENES[group] ? group : 'critters');
		use.setAttribute('href', ref);
		use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', ref);
		svg.appendChild(use);
		return svg;
	}

	/* A flag mark: coloured disc + shape, named for a screen reader. */
	function flagMark(flag) {
		var NS = 'http://www.w3.org/2000/svg';
		var names = CFG.i18n.flagNames || {};
		var span = el('span', 'dccwl-flag dccwl-flag-' + flag);
		span.setAttribute('role', 'img');
		span.setAttribute('aria-label', names[flag] || flag);
		var svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('focusable', 'false');
		var use = document.createElementNS(NS, 'use');
		use.setAttribute('href', '#dccwl-fl-' + flag);
		use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#dccwl-fl-' + flag);
		svg.appendChild(use);
		span.appendChild(svg);
		return span;
	}

	/* Photo-first tile face (1.19.0) — mirrors Render::tile_media(). */
	function tileMedia(sp) {
		var media = el('span', 'dccwl-tile-media');
		// 1.29.0: a resolved URL from the server, never a base plus a filename.
		// An empty one means "no photograph available" and falls through to
		// the drawing and then the glyph, exactly as the server does.
		if (sp.src && sp.src.thumb) {
			var img = document.createElement('img');
			img.className = 'dccwl-tile-photo';
			img.alt = '';
			img.width = 320;
			img.height = 240;
			img.loading = 'lazy';
			img.decoding = 'async';
			img.src = sp.src.thumb;
			media.appendChild(img);
		} else if (sp.sprite) {
			// The species' own drawing before the group glyph (1.23.0) —
			// mirrors Render::tile_media().
			media.appendChild(spriteUse(sp.id, 'dccwl-tile-sprite'));
		} else {
			media.appendChild(glyphUse(sp.group, 'dccwl-tile-glyph'));
		}
		if (sp.flags && sp.flags.length) {
			var flags = el('span', 'dccwl-tile-flags');
			sp.flags.forEach(function (f) { flags.appendChild(flagMark(f)); });
			media.appendChild(flags);
		}
		return media;
	}

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
	function speciesArt(sp, spriteCls) {
		if (sp.sprite) {
			return spriteUse(sp.id, spriteCls);
		}
		// 1.19.0: no sprite → the group glyph. Never an emoji, never a
		// drawing that might be the wrong animal.
		return glyphUse(sp.group, spriteCls);
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
				return x.v >= SPOTLIGHT_MIN && isSpotting(x.s);
			})
			.sort(function (a, b) {
				if (b.v !== a.v) {
					return b.v - a.v;
				}
				// Ties keep registry order, so the strip is stable month to
				// month. (Through 1.9.1 the heron jumped ties on a flag that
				// 1.9.2 removed along with the marker it drew.)
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

	/* Per-root handles, so the canal hub can drive an existing widget
	 * instance rather than duplicating its month logic. Keyed by the root
	 * element; see window.DCCWL_Widget at the foot of this file. */
	var roots = new WeakMap();

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

		// Canal time, not the visitor's: a guest in Tokyo on the evening of
		// the 30th must not be shown next month's canal (1.17.0 — the hub had
		// this right since 1.10.0; the standalone widget did not).
		var state = { month: canalToday().getMonth(), openId: null, opener: null };

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
			// The key (1.18.0): every bar height/colour above, named. The bars
			// were decoration with a screen-reader reading; sighted guests had
			// no way to know what a tall coral bar meant.
			var key = el('ul', 'dccwl-like-key');
			key.setAttribute('aria-label', CFG.i18n.likeKey || 'Key');
			names.forEach(function (name, level) {
				var item = el('li', 'dccwl-like-key-item');
				var sample = el('span', 'dccwl-like-cell dccwl-like-' + level + ' dccwl-like-sample');
				var sb = el('span', 'dccwl-like-bar');
				sb.setAttribute('aria-hidden', 'true');
				sample.appendChild(sb);
				item.appendChild(sample);
				item.appendChild(el('span', 'dccwl-like-key-name', name || ''));
				key.appendChild(item);
			});
			wrap.appendChild(key);
			return wrap;
		}

		function buildDetail(body, sp) {
			var medallion;
			if (sp.src && sp.src.full) {
				// A real, licensed photo leads the sheet where we have a vetted
				// one. Lazy — it loads only when a species is opened, one at a
				// time. src is set as an ATTRIBUTE (never innerHTML), and every
				// URL is resolved server-side from the media library.
				medallion = el('div', 'dccwl-medallion dccwl-medallion-photo');
				var img = document.createElement('img');
				img.className = 'dccwl-photo';
				img.loading = 'lazy';
				img.decoding = 'async';
				img.alt = sp.name;
				img.src = sp.src.full;
				/*
				 * 1.17.0: a 600px-wide variant beside each original. The hero
				 * is at most 720px wide, so 1x screens and small phones take
				 * the lighter file; high-DPR phones still get the full one.
				 *
				 * 1.29.0: THE SRCSET IS NO LONGER BUILT BY STRING SURGERY. It
				 * used to replace ".jpg" with "-600.jpg" on a base URL, which
				 * WordPress's filename dedupe would have broken silently the
				 * first time a fern.jpg already existed in that month folder.
				 * Both URLs are resolved attachments now, and either may be
				 * missing without taking the other down.
				 */
				if (sp.src.mid && sp.src.w) {
					img.srcset = sp.src.mid + ' ' + (sp.src.midW || 600) + 'w, ' +
						sp.src.full + ' ' + sp.src.w + 'w';
					img.sizes = '(max-width: 720px) 100vw, 720px';
				}
				medallion.appendChild(img);
			} else {
				// No photo for this species — the drawn scene + sprite still
				// carries it, so a wrong-species stock image can never appear.
				medallion = el('div', 'dccwl-medallion dccwl-medallion-' + (SCENES[sp.group] ? sp.group : 'critters'));
				medallion.innerHTML = SCENES[sp.group] || SCENES.critters; // static trusted constant
				medallion.appendChild(speciesArt(sp, 'dccwl-medallion-sprite'));
			}
			body.appendChild(medallion);

			// Scientific name, italicised under the common name in the sheet
			// head. Accuracy for the curious; the tile face stays plain.
			if (sp.sci) {
				body.appendChild(el('p', 'dccwl-sci', sp.sci));
			}

			// Quiet photo credit, only where a licensed photo is shown.
			// Per-photo since 1.24.0: sp.credit is set when this photo is not
			// the default Adobe one, and three of the Commons photos are CC BY,
			// which REQUIRES the photographer and the licence wherever the
			// image is shown. This sheet is where it is shown at size, so the
			// line is not decorative. Where a source page exists the credit
			// links to it — that is where the licence is actually stated.
			if (sp.src && sp.src.full) {
				var credit = el('p', 'dccwl-photo-credit');
				var text = sp.credit || CFG.i18n.photoCredit || 'Photo: Adobe Stock';
				// http(s) only: the credit map is filterable, so a site could
				// put anything in this field. A javascript: URL would be a
				// scripting hole, so an unrecognised scheme renders as plain
				// text rather than as a link.
				if (sp.creditUrl && /^https?:\/\//i.test(sp.creditUrl)) {
					var a = el('a', 'dccwl-photo-credit-link', text);
					a.href = sp.creditUrl;
					a.rel = 'noopener';
					credit.appendChild(a);
				} else {
					credit.textContent = text;
				}
				body.appendChild(credit);
			}

			// What this photograph's identification rests on, where that is
			// something other than what you can see in it (1.25.0). Only the
			// fish crow carries one today: fish and American crows are not
			// separable by sight, so the photo alone cannot establish the
			// species and the page says so rather than implying otherwise.
			if (sp.src && sp.src.full && sp.photoNote) {
				body.appendChild(el('p', 'dccwl-photo-note', sp.photoNote));
			}

			var badges = el('p', 'dccwl-detail-badges');
			if ((sp.months[state.month] || 0) >= 3) {
				badges.appendChild(el('span', 'dccwl-badge dccwl-badge-peak', CFG.i18n.peak));
			}
			// 1.19.0: the flags as badges (mark + name), then the odds.
			(sp.flags || []).forEach(function (f) {
				var b = el('span', 'dccwl-badge dccwl-badge-flag dccwl-badge-flag-' + f);
				b.appendChild(flagMark(f));
				b.appendChild(document.createTextNode((CFG.i18n.flagNames || {})[f] || f));
				badges.appendChild(b);
			});
			// 1.27.0: no odds badge. The guide does not offer probabilities —
			// "You will see one" is a guarantee the canal cannot make. The
			// `odds` value is still in the payload and still ranks species;
			// it just never becomes a sentence a guest can be disappointed by.

			if (badges.childNodes.length) {
				body.appendChild(badges);
			}

			body.appendChild(el('p', 'dccwl-fact', sp.fact));

			// "What to do" (1.19.0): for anything flagged, the plain
			// instruction right under the fact — the cottonmouth says give it
			// room before it says anything else about where to look.
			if (sp.safe) {
				var safe = el('div', 'dccwl-safe dccwl-safe-' + ((sp.flags && sp.flags[0]) || 'none'));
				safe.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.safe || 'What to do'));
				safe.appendChild(el('p', 'dccwl-detail-p', sp.safe));
				body.appendChild(safe);
			}

			// Where to look + best time: the two questions a guest on the
			// dock actually has, given their own headings in the drawer.
			if (sp.where) {
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.where));
				body.appendChild(el('p', 'dccwl-detail-p', sp.where));
			}
			// A day-trip species names its place (1.19.0; empty for the canal).
			if (sp.place) {
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.place || 'Where to go'));
				body.appendChild(el('p', 'dccwl-detail-p', sp.place));
			}
			// The canal is as much a sound as a sight. Only species with a
			// verified, distinctive voice carry one — absent renders nothing.
			if (sp.sound) {
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.listen || 'Listen for'));
				body.appendChild(el('p', 'dccwl-detail-p', sp.sound));
			}

			/* "Tell them apart" — the real question on a dock is not what lives
			 * here but WHICH ONE this is. Species that share a confusable group
			 * (the white waders, the dark waders, the two big fish-hunters) list
			 * each other with the one field mark that settles it. Informational
			 * only: no navigation, so the shared sheet's history contract is
			 * untouched. Absent group → nothing renders. */
			var others = sp.idgroup ? CFG.species.filter(function (o) {
				return o.idgroup === sp.idgroup && o.id !== sp.id && o.mark;
			}) : [];
			// 1.20.0: a species with a field mark but nothing here to confuse it
			// with (the white pelican, the fish crow) still gets its mark — it
			// used to render only in the prose guide, so the sheet was silent
			// about the one thing that identifies it.
			if (!others.length && sp.mark) {
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.tellApart || 'Tell it apart'));
				body.appendChild(el('p', 'dccwl-detail-p dccwl-mark-self',
					fmt(CFG.i18n.tellBy || 'Tell this one by %s.', sp.mark)));
			}
			if (sp.idgroup) {
				if (others.length) {
					body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.confused || 'Easily confused with'));
					if (sp.mark) {
						body.appendChild(el('p', 'dccwl-detail-p dccwl-mark-self',
							fmt(CFG.i18n.tellBy || 'Tell this one by %s.', sp.mark)));
					}
					var looks = el('ul', 'dccwl-lookalikes');
					others.forEach(function (o) {
						var li = el('li', 'dccwl-lookalike');
						var ic = el('span', 'dccwl-lookalike-icon');
						ic.appendChild(speciesArt(o, 'dccwl-chip-sprite'));
						li.appendChild(ic);
						var tx = el('span', 'dccwl-lookalike-text');
						tx.appendChild(el('span', 'dccwl-lookalike-name', o.name));
						// The name and the mark are separate blocks visually, but ran
						// together as one word for a screen reader ("White Ibisa long...").
						tx.appendChild(el('span', 'dccwl-sr', ' — '));
						tx.appendChild(el('span', 'dccwl-lookalike-mark', o.mark));
						li.appendChild(tx);
						looks.appendChild(li);
					});
					body.appendChild(looks);
				}
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
			// 1.27.0: the subline no longer says "%d species at their peak".
			// It counts what is worth looking for and leaves it at that.
			// The month is part of the phrase (1.29.0), so the count reads as
			// "what is out in September" rather than "how big the guide is".
			var phrase = fmt(CFG.i18n.subSpot, entries.length, (CFG.monthsFull && CFG.monthsFull[m]) || '');
			if (instance.customTitle) {
				if (subEl) {
					subEl.textContent = phrase;
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
			var tile = el('button', 'dccwl-tile');
			tile.type = 'button';
			tile.setAttribute('data-dccwl-species', sp.id);
			tile.setAttribute('aria-haspopup', 'dialog');
			tile.setAttribute('aria-expanded', 'false');

			tile.appendChild(tileMedia(sp));
			tile.appendChild(el('span', 'dccwl-tile-name', sp.name));

			// The tile face carries ONE signal only — the coral "Peak" flag when
			// the species is at its best this month. The month-range label that
			// used to sit here (and left the strip reading as busy, mismatched
			// cards) now lives in the detail sheet, where there is room for it.
			if (value >= 3) {
				tile.appendChild(el('span', 'dccwl-tile-sub dccwl-tile-peak', CFG.i18n.peakShort));
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

		/*
		 * `explicit` says a PERSON chose this month — a timeline button, an
		 * arrow, a month tile in the picker, or a month named in the URL. The
		 * canal-time month the page opens on is not a choice, and since 1.28.0
		 * that difference decides whether the category tabs filter at all. Set
		 * before the early return: choosing the month already shown is still
		 * choosing it, and the guide has to be refreshed either way.
		 */
		function setMonth(m, explicit) {
			m = ((m % 12) + 12) % 12;
			if (false !== explicit) { state.monthPicked = true; }
			if (m === state.month) {
				refreshGuide();
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
			annotateGuide();
		}

		/* A month label is either wholly visible or not shown at all.
		 *
		 * A fade stops a sliced label reading as broken, but it cannot make
		 * "ul" into a whole word — so any pill that does not fit entirely
		 * inside the track is hidden outright. visibility (not display)
		 * keeps it in the layout, so the scroll geometry and the arrows are
		 * unaffected; it simply never renders half a month name.
		 *
		 * Recomputed after the strip settles rather than during a drag, so a
		 * finger-scroll does not pop labels in and out mid-gesture; the edge
		 * fade covers that moment. */
		function trimPartialMonths() {
			var track = root.querySelector('.dccwl-timeline-track');
			if (!track) { return; }
			var r = track.getBoundingClientRect();
			monthButtons.forEach(function (btn) {
				var b = btn.getBoundingClientRect();
				var whole = b.left >= r.left - 0.5 && b.right <= r.right + 0.5;
				btn.classList.toggle('dccwl-month-cut', !whole);
			});
		}

		var trimTimer = null;
		function trimSoon() {
			window.clearTimeout(trimTimer);
			trimTimer = window.setTimeout(trimPartialMonths, 140);
		}

		function centerMonth() {
			var track = root.querySelector('.dccwl-timeline-track');
			var btn = monthButtons[state.month];
			if (!track || !btn || track.scrollWidth <= track.clientWidth) {
				return;
			}
			// Measure the pill against the SCROLL CONTAINER, not against
			// whatever happens to be its offsetParent. The track is
			// position:static, so btn.offsetLeft carried the track's own
			// offset within the page — a constant error that was invisible on
			// a wide desktop strip and left the selected pill 6px from the
			// edge on a 320px phone.
			var left = btn.getBoundingClientRect().left
				- track.getBoundingClientRect().left + track.scrollLeft;
			track.scrollLeft = left - (track.clientWidth - btn.offsetWidth) / 2;
			trimSoon();
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
					setMonth(m, true);
				});
				track.appendChild(btn);
				monthButtons.push(btn);
			});
			nav.querySelector('.dccwl-timeline-prev').addEventListener('click', function () {
				setMonth(state.month - 1, true);
			});
			nav.querySelector('.dccwl-timeline-next').addEventListener('click', function () {
				setMonth(state.month + 1, true);
			});
			attachEdgeFades(track, nav);
			track.addEventListener('scroll', trimSoon, { passive: true });
			window.addEventListener('resize', trimSoon);
			nav.hidden = false;
			centerMonth();
			trimPartialMonths();
		}

		/* ---------- field guide tabs ---------- */

		/* Annotate the (month-independent, server-rendered) guide tiles with
		 * the chosen month's likelihood. Client-side only: the grids' HTML
		 * stays cacheable, and this is the same data the spotlight uses.
		 *
		 * Only inside the canal hub (1.10.0). There the guide sits on a
		 * screen that IS a month, so a per-month chip is the point; on the
		 * flat legacy widget it is just an extra line on every tile, and it
		 * measured 41px of rendered height on a phone — over the budget that
		 * surface has kept since 1.1.0. */
		/* ---------- the guide: month, search and the cap (1.21.0) ----------
		 * One pass decides every tile's visibility, so the three filters cannot
		 * disagree with each other. Order: the tab (or, while searching, every
		 * group), then the month (hub only), then the cap. */
		/*
		 * GUIDE_CAP was here, at 12, with a "Show all" control under each
		 * section. REMOVED IN 1.28.0 by the owner's decision, and it is not
		 * coming back — unlike the season countdown there is no feature here
		 * to restore, so its tests were retired rather than inverted.
		 *
		 * The reasoning it failed on: the deck holds a section's tiles at a
		 * constant height, so the cap saved no vertical space — expanding it
		 * moved the page by under 120px, which the old suite asserted itself.
		 * What it did do was hide nineteen of thirty-one animals behind a tap.
		 * As two tabs, Critters and Birds showed twenty-one of the same set
		 * with no tap at all; merging them into Animals halved that.
		 */
		// Must match Render::PEAK_TAB. The tab row is server-rendered and this
		// reads the slug back off it, so the two have to agree.
		var PEAK_TAB = '__peak';
		var guide = { q: '', group: null };

		/* Lowercased, accent-folded, and cached on the species row. */
		function fold(v) {
			v = String(v == null ? '' : v).toLowerCase();
			return v.normalize ? v.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : v;
		}

		/* Name, scientific name, and the field mark — the three things a guest
		 * might have in mind. The mark is what makes "golden-yellow feet" or
		 * "red shield" find the right bird.
		 *
		 * Three rules, all of them predictable. There is no letters-in-order
		 * fallback: it looked clever and was wrong, because "coot" is a
		 * letters-in-order match for both COttonmOuTh and COrmORanT. A guest
		 * typing four letters of a bird's name and getting a pit viper has
		 * been failed by the search, however forgiving it was trying to be. */
		function speciesMatches(sp, q) {
			if (!q) { return true; }
			if (!sp.$hay) {
				sp.$hay = fold([ sp.name, sp.sci, sp.mark ].join(' \u2022 '));
				// The same text with punctuation and spaces dropped, so
				// "blackcrowned" finds the black-crowned night heron and
				// "nannopterumauritum" finds the cormorant.
				sp.$squash = sp.$hay.replace(/[^a-z0-9]+/g, '');
			}
			if (sp.$hay.indexOf(q) !== -1) { return true; }
			var toks = q.split(/\s+/).filter(Boolean);
			// Every word somewhere, in any order: "heron blue" finds the great blue.
			if (toks.length > 1 && toks.every(function (t) { return sp.$hay.indexOf(t) !== -1; })) { return true; }
			var squashed = q.replace(/[^a-z0-9]+/g, '');
			return squashed.length >= SEARCH_SQUASH && sp.$squash.indexOf(squashed) !== -1;
		}

		function refreshGuide() {
			var section = root.querySelector('.dccwl-guide');
			if (!section) { return; }
			var isCanal = !!root.closest('[data-dccwl-canal]');
			var q = guide.q, searching = q.length > 0;
			// Peak Now (1.27.0) is a filter, not a section: it cuts across
			// Animals, Plants and Safety at once and keeps whatever is at its
			// best in the month the VISITOR is in. state.month is canal time,
			// computed in the browser, so this can never be baked into a
			// cached page — which is why there is no server-rendered peak
			// grid and no peak count in the HTML.
			var peaking = guide.group === PEAK_TAB;
			var rows = [], i = 0;

			// 1. Who is eligible: the open group (or, while searching, every
			//    group), then the month, then the search.
			section.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
				var group = g.getAttribute('data-dccwl-group');
				// Searching looks in every group: at 51 species the answer to
				// "where is the coot?" must not depend on which tab is open.
				var groupOn = searching || peaking || null === guide.group || group === guide.group;
				g.querySelectorAll('.dccwl-tile').forEach(function (tile) {
					var sp = speciesById[tile.getAttribute('data-dccwl-species')];
					var old = tile.querySelector('.dccwl-tile-sub');
					if (old) { old.parentNode.removeChild(old); }
					var v = sp && sp.months ? (sp.months[state.month] || 0) : 0;
					var keep = groupOn;
					if (keep && sp) {
						if (searching) {
							// A search overrides the month: a guest looking for
							// a species out of season still deserves to find it.
							keep = speciesMatches(sp, q);
						} else if (peaking) {
							// At peak means at peak, in every section including
							// safety — a venomous snake at its most active is
							// exactly what a guest should be shown, not spared.
							keep = !!(sp.months && (sp.months[state.month] || 0) >= 3);
						} else if (isCanal && sp.months && state.monthPicked) {
							/*
							 * ONLY WHEN A MONTH WAS EXPLICITLY CHOSEN (1.28.0).
							 *
							 * The category tabs used to filter by the current
							 * month always, and silently — nothing on screen
							 * said a filter was on. In September that made
							 * seven species unreachable by browsing at all:
							 * the manatee, the bald eagle, the river otter,
							 * the white pelican, the wood stork, the coot and
							 * the pied-billed grebe, every one a winter
							 * species. A guest could not find the manatee.
							 *
							 * So the default browse shows everything in the
							 * section, and Peak Now — which says what it does
							 * in its own name — is where seasonality lives.
							 * Picking a month in the picker is still an
							 * explicit request to see that month, and still
							 * filters.
							 */
							keep = 'safety' === group || v >= SPOTLIGHT_MIN;
						}
					}
					if (isCanal && v >= 3) {
						tile.appendChild(el('span', 'dccwl-tile-sub dccwl-tile-peak', CFG.i18n.peakShort));
					}
					rows.push({ li: tile.closest('li'), grid: g, keep: keep, rank: isCanal ? v : 0, i: i++, show: false });
				});
			});

			// 2. Everything eligible is shown. No cap since 1.28.0 — see the
			//    note where GUIDE_CAP used to be.
			var kept = rows.filter(function (r) { return r.keep; });
			kept.forEach(function (r) { r.show = true; });

			// 3. Apply.
			var perGrid = {};
			rows.forEach(function (r) {
				if (r.li) { r.li.hidden = !r.show; }
				var g = r.grid.getAttribute('data-dccwl-group');
				perGrid[g] = (perGrid[g] || 0) + (r.show ? 1 : 0);
			});
			section.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
				var group = g.getAttribute('data-dccwl-group');
				var groupOn = searching || peaking || null === guide.group || group === guide.group;
				g.hidden = !groupOn || ((searching || peaking) && !perGrid[group]);

				/* A section's sub-navigation lives or dies with its grid. It is
				 * also withdrawn while SEARCHING or on Peak Now: those draw from
				 * every section at once, so "jump to Wading birds" would be
				 * offering to navigate a list that is not on screen. */
				var sub = section.querySelector('[data-dccwl-subnav="' + group + '"]');
				if (sub) { sub.hidden = g.hidden || searching || peaking; }
			});

			var eligible = kept.length;

			var note = section.querySelector('[data-dccwl-guide-empty]');
			if (note) {
				if (eligible) {
					note.hidden = true;
					note.textContent = '';
				} else {
					note.textContent = searching
						? fmt(CFG.i18n.searchNone || 'Nothing matches “%s”.', guide.raw || q)
						: fmt(CFG.i18n.guideEmpty || 'Nothing in this group is likely in %s.',
							(CFG.monthsFull && CFG.monthsFull[state.month]) || '');
					note.hidden = false;
				}
			}

			var status = section.querySelector('[data-dccwl-search-status]');
			if (status) {
				status.textContent = !searching ? ''
					: 1 === eligible ? (CFG.i18n.searchOne || '1 species matches')
						: fmt(CFG.i18n.searchCount || '%d species match', eligible);
			}
			section.querySelectorAll('.dccwl-tab').forEach(function (t) {
				t.setAttribute('aria-pressed', !searching && t.getAttribute('data-dccwl-group') === guide.group ? 'true' : 'false');
			});
			// Peak Now names no month in the markup, so say which one it means
			// where a guest can read it, and say plainly when nothing is at its
			// best rather than showing an empty page.
			if (peaking && !searching) {
				var pNote = section.querySelector('[data-dccwl-guide-empty]');
				if (pNote && !kept.length) {
					pNote.textContent = fmt(CFG.i18n.peakNone || 'Nothing is at its peak in %s.',
						(CFG.monthsFull && CFG.monthsFull[state.month]) || '');
					pNote.hidden = false;
				}
			}
			// The deck's controls describe what is actually in the deck, so they
			// are recomputed after every filter — month, search or cap.
			if (window.DCCWL_Deck) {
				section.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
					window.DCCWL_Deck.refresh(g, CFG.i18n);
				});
			}
		}

		// Kept as the old name so every existing caller still reads clearly.
		function annotateGuide() { refreshGuide(); }

		/* ---------- sub-navigation inside a long section (1.31.0) ----------
		 *
		 * Thirty-eight animals is six or seven swipes of the deck with only a
		 * counter for orientation. Three ways through, none of which replaces
		 * the deck and none of which can hide a species:
		 *
		 *  - CHIPS jump to a sub-group and double as a position indicator: the
		 *    pressed chip follows the deck as it scrolls, so the row always
		 *    says where you are as well as where you can go.
		 *  - A NATIVE <select> goes straight to one species by name.
		 *  - A COMPACT toggle swaps photo cards for short rows.
		 *
		 * Nothing here FILTERS. That is deliberate: the 1.28.0 lesson was that
		 * a filter nobody could see made seven winter species unreachable, and
		 * a sub-group that hid the other five sixths of the section would be
		 * the same mistake in a smaller box.
		 */
		function initBrowseNav(section) {
			section.querySelectorAll('[data-dccwl-subnav]').forEach(function (nav) {
				var slug = nav.getAttribute('data-dccwl-subnav');
				var grid = section.querySelector('.dccwl-guide-grid[data-dccwl-group="' + slug + '"]');
				if (!grid) { return; }

				var chipWrap = nav.querySelector('[data-dccwl-subchips]');
				var tools = nav.querySelector('[data-dccwl-subtools]');
				var chips = [].slice.call(nav.querySelectorAll('.dccwl-subchip'));
				var sel = nav.querySelector('[data-dccwl-jump]');
				var toggle = nav.querySelector('[data-dccwl-view]');
				var active = '';   // '' is the All chip

				/*
				 * A NOTE ON WHAT IS DELIBERATELY NOT HERE.
				 *
				 * The chips were briefly also a position indicator: a scroll
				 * handler moved the pressed chip to whichever group was at the
				 * left edge. It read well and was wrong, consistently, by one
				 * group — because a jump aligns the COLUMN holding the target
				 * tile, and the tile at the left edge of that column usually
				 * belongs to the PREVIOUS group. Pressing "Mammals" landed
				 * correctly and then relabelled itself "Reptiles".
				 *
				 * Two defensible definitions of "where am I" that disagree is
				 * not a bug to tune; it is a sign the second one should not
				 * exist. So a chip records the guest's CHOICE and nothing else.
				 * If the deck is later swiped clear of that group the position
				 * line says so by falling back to the deck's own count, which
				 * contextFor() already handles by returning null.
				 */

				// Revealed only now: without this script the grid is a plain
				// wrapping list with no deck to jump around in.
				if (chipWrap) { chipWrap.hidden = false; }
				if (tools) { tools.hidden = false; }

				function visible() {
					return [].filter.call(grid.children, function (li) { return !li.hidden; });
				}

				function membersOf(sub) {
					return visible().filter(function (li) {
						return li.getAttribute('data-dccwl-browse') === sub;
					});
				}

				function press(sub) {
					active = sub;
					chips.forEach(function (c) {
						c.setAttribute('aria-pressed', c.getAttribute('data-dccwl-browse') === sub ? 'true' : 'false');
					});
				}

				/* The position line for a sub-group: "Wading birds · 2/3".
				 * Returns null when the deck has scrolled clear of the group,
				 * which hands the line back to the deck's own "7–12 of 38" —
				 * saying "Wading birds" while showing ducks would be a lie. */
				function contextFor(sub, label) {
					return function (shownIdx, total) {
						var all = visible();
						var subs = membersOf(sub);
						if (!subs.length || !shownIdx.length) { return null; }
						var from = all.indexOf(subs[0]) + 1;
						var to = all.indexOf(subs[subs.length - 1]) + 1;
						var inside = shownIdx.filter(function (i) { return i >= from && i <= to; });
						if (!inside.length) { return null; }
						var perPage = Math.max(1, shownIdx.length);
						var pages = Math.max(1, Math.ceil(subs.length / perPage));
						var page = Math.min(pages, Math.floor((inside[0] - from) / perPage) + 1);
						return fmt(CFG.i18n.subPos || '%1$s · %2$d/%3$d', label, page, pages);
					};
				}

				function applyContext() {
					if (!window.DCCWL_Deck) { return; }
					if ('' === active) {
						window.DCCWL_Deck.setContext(grid, null);
						return;
					}
					var chip = chips.filter(function (c) { return c.getAttribute('data-dccwl-browse') === active; })[0];
					window.DCCWL_Deck.setContext(grid, contextFor(active, chip ? chip.textContent.trim() : active));
				}

				function jump(sub) {
					press(sub);
					var target = '' === sub ? visible()[0] : membersOf(sub)[0];
					if (target && window.DCCWL_Deck) { window.DCCWL_Deck.jumpTo(grid, target); }
					applyContext();
				}

				chips.forEach(function (c) {
					c.addEventListener('click', function () { jump(c.getAttribute('data-dccwl-browse')); });
				});

				/* While a sub-group is pressed the chip row follows the deck, so
				 * it reports position as well as offering it. The All chip is
				 * left alone — someone who asked for the whole section's count
				 * has not asked to be tracked. */
				if (sel) {
					sel.addEventListener('change', function () {
						var id = sel.value;
						if (!id) { return; }
						var li = grid.querySelector('[data-dccwl-species="' + id + '"]');
						li = li ? li.closest('li') : null;
						if (!li) { return; }
						var sub = li.getAttribute('data-dccwl-browse') || '';
						press(sub);
						if (window.DCCWL_Deck) { window.DCCWL_Deck.jumpTo(grid, li); }
						applyContext();
						// A jump with no visible change is indistinguishable from
						// a control that did nothing, so the tile says so.
						li.classList.remove('dccwl-flash');
						void li.offsetWidth;
						li.classList.add('dccwl-flash');
						// Reset, so choosing the same name twice works.
						sel.value = '';
					});
				}

				/* One function for the view, so the toggle and the owner's
				 * chosen default cannot drift apart. A default of 'compact'
				 * that only the button knew how to apply would be a setting
				 * that works for the second visitor and not the first. */
				function applyView(compact) {
					if (toggle) {
						toggle.setAttribute('data-dccwl-view', compact ? 'compact' : 'deck');
						toggle.setAttribute('aria-pressed', compact ? 'true' : 'false');
						toggle.textContent = compact
							? (CFG.i18n.viewPhotos || 'Photos')
							: (CFG.i18n.viewCompact || 'Compact');
					}
					grid.classList.toggle('dccwl-compact-list', compact);
					// The deck's controls are meaningless in a vertical list, and
					// its position line would describe a deck that is no longer
					// there.
					var deckNav = grid.nextElementSibling;
					if (deckNav && deckNav.classList.contains('dccwl-deck-nav')) {
						deckNav.hidden = compact;
					}
					if (chipWrap) { chipWrap.hidden = compact; }
					if (window.DCCWL_Deck && !compact) { window.DCCWL_Deck.refreshSoon(grid, CFG.i18n); }
				}

				if (toggle) {
					toggle.addEventListener('click', function () {
						applyView('compact' !== toggle.getAttribute('data-dccwl-view'));
					});
				}

				// The owner's chosen opening view. Applied even when the toggle
				// is switched off, so "open compact, no way back" is a coherent
				// configuration rather than an accident.
				var ownView = (instance && instance.set && instance.set.defaultView) || SET.defaultView;
				if ('compact' === ownView) { applyView(true); }
			});
		}

		function initGuide() {
			var section = root.querySelector('.dccwl-guide');
			if (!section) {
				return;
			}
			section.querySelectorAll('.dccwl-tile').forEach(wireTile);

			/* Rows per deck page, from the settings. Written as a property
			 * rather than an inline row count so the CSS keeps its own
			 * breakpoints — a wider screen still decides for itself. */
			var own = (instance && instance.set) || {};
			var rowsRaw = (own.deckRows !== undefined) ? own.deckRows : SET.deckRows;
			var rows = parseInt(rowsRaw, 10);
			if (isNaN(rows) || rows < 1) { rows = 3; }
			if (3 !== rows) { root.style.setProperty('--dccwl-deck-rows', String(rows)); }

			initBrowseNav(section);
			// One deck per group grid (1.23.0). Attaching per grid rather than
			// once for the section means the visible group is the one being
			// paged, and changing tab changes decks with it.
			if (window.DCCWL_Deck) {
				section.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
					window.DCCWL_Deck.attach(g, CFG.i18n);
				});
			}
			var tabs = section.querySelectorAll('.dccwl-tab');
			var first = section.querySelector('.dccwl-tab[aria-pressed="true"]') || tabs[0];
			guide.group = first ? first.getAttribute('data-dccwl-group') : null;
			var input = section.querySelector('[data-dccwl-search-input]');
			var clear = section.querySelector('[data-dccwl-search-clear]');

			function setQuery(raw) {
				guide.raw = String(raw || '').trim();
				guide.q = fold(guide.raw);
				if (clear) { clear.hidden = '' === guide.q; }
				refreshGuide();
			}

			tabs.forEach(function (tab) {
				tab.addEventListener('click', function () {
					guide.group = tab.getAttribute('data-dccwl-group');
					// Picking a group is a way of saying "not that search any more".
					if (input && input.value) { input.value = ''; }
					setQuery('');
				});
			});

			var wrap = section.querySelector('[data-dccwl-search]');
			if (wrap && input) {
				wrap.hidden = false;   // the control only exists where it can work
				input.addEventListener('input', function () { setQuery(input.value); });
				input.addEventListener('keydown', function (e) {
					if ('Escape' === e.key && input.value) {
						e.stopPropagation();   // clear the search, don't close the panel
						input.value = '';
						setQuery('');
					}
				});
				// A search field inside a form must never reload the page.
				input.addEventListener('keypress', function (e) { if ('Enter' === e.key) { e.preventDefault(); } });
			}
			if (clear && input) {
				clear.addEventListener('click', function () {
					input.value = '';
					setQuery('');
					input.focus();
				});
			}
			refreshGuide();
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
		initGuide();   // refreshes the guide itself

		// Expose this instance so an outer shell can set the month and
		// re-centre the strip after un-hiding a panel (offsetLeft is 0 while
		// hidden, so the timeline cannot centre itself until it is visible).
		roots.set(root, {
			setMonth: setMonth,
			recenter: centerMonth,
			month: function () { return state.month; }
		});
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
		var PEAK = PEAK_SCORE, DAY = 86400000, cur = today.getMonth();
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

	/* The peak run a species is in RIGHT NOW: how many months since it rose
	 * (0 = this month) and the last month of the run. null when it is not at
	 * peak now, or is at peak all year (a resident, not a season). */
	function peakRun(scores, cur) {
		var PEAK = PEAK_SCORE;
		if (scores[cur] !== PEAK) { return null; }
		var since = 0, m = cur;
		while (since < 12 && scores[(m + 11) % 12] === PEAK) { m = (m + 11) % 12; since++; }
		if (since >= 12) { return null; }
		var through = cur, ahead = 0;
		while (ahead < 12 && scores[(through + 1) % 12] === PEAK) { through = (through + 1) % 12; ahead++; }
		return { since: since, through: through };
	}

	/* Fill a countdown div: emoji span + text, with the day count in its own
	 * styled span. Built with createElement/textContent throughout — the
	 * species list passes through a filter, so nothing here may be innerHTML. */
	/* fillCountdown() was here. The season countdown card was retired in
	 * 1.27.0 — see Render::countdown_possible(), which is now hard-false and
	 * is the single gate every path ran through. Nothing stamps
	 * .dccwl-hero-stat any more, in any of its three states. Restoring the
	 * feature means restoring this function AND that gate AND the cd* strings.
	 */

	function initCountdown() {
		// While the old mu-plugin exists, PHP sets countdown:false and emits
		// no shell here — its own script keeps rendering, exactly once.
		if (!CFG.countdown) { return; }
		var shells = document.querySelectorAll('[data-dccwl-countdown]');
		if (!shells.length) { return; }

		var today = canalToday(), cur = today.getMonth(), rise = null, current = null;
		CFG.species.forEach(function (s) {
			if (!Array.isArray(s.months) || !isSpotting(s)) { return; }
			var r = nextRise(s.months, today);
			if (r && (!rise || r.days < rise.days)) {
				rise = { days: r.days, here: r.here, month: r.month, s: s };
			}
			// The season that is ON now: the most recent riser still at peak.
			var run = peakRun(s.months, cur);
			if (run && (!current || run.since < current.since)) {
				current = { s: s, since: run.since, through: run.through };
			}
		});
		var best;
		if (current && current.since === 0) {
			// Rose this month: "is here now", through the end of its run.
			best = { mode: 'now', here: true, days: 0, month: current.through, s: current.s, next: null };
		} else if (current) {
			// Rose earlier and still on (1.17.0). Through 1.16.2 this case fell
			// through to the next riser, so "Osprey is here now" on Dec 31
			// became "Snowy Egret 59 days away" on Jan 1 with osprey still at
			// peak until April. Keep the season; put the next rise underneath.
			best = { mode: 'through', here: false, days: 0, month: current.through, s: current.s,
				next: (rise && !rise.here) ? rise : null };
		} else if (rise) {
			best = { mode: rise.here ? 'now' : 'countdown', here: rise.here, days: rise.days, month: rise.month, s: rise.s, next: null };
		} else {
			return;
		}

		// Publish which species WOULD have been featured, so the hub's
		// "right now" line still avoids naming it twice on the same screen.
		// The card itself is retired (1.27.0); this value is read by canal.js
		// and costs nothing.
		if (window.DCCWL_Widget) { window.DCCWL_Widget.countdownId = best.s.id; }
	}

	window.DCCWL_Widget = {
		/* One <use> builder for the whole plugin — see spriteUse(). */
		sprite: function (id, cls) { return spriteUse(id, cls); },
		peakFor: function (m) {
			return speciesForMonth(m).filter(function (x) { return x.v >= 3; })
				.map(function (x) { return x.s; });
		},
		setMonth: function (root, m, explicit) {
			var h = roots.get(root);
			if (h) { h.setMonth(m, explicit); h.recenter(); }
		},
		recenter: function (root) {
			var h = roots.get(root);
			if (h) { h.recenter(); }
		},
		month: function (root) {
			var h = roots.get(root);
			return h ? h.month() : null;
		}
	};

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
