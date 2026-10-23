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

	/*
	 * 1.32.1: these are now read EVERYWHERE the number is meant, not just in
	 * one or two places.
	 *
	 * 1.32.0 carried both into the config and then left six literal 3s and a
	 * literal 2 in place, so the settings page described behaviour the code did
	 * not have: PEAK_SCORE reached only nextRise() and peakRun(), both of which
	 * belong to the retired countdown, and canal.js hard-coded its own 2 so the
	 * hub tile and the panel header would have disagreed the moment anyone
	 * changed the threshold. A setting that describes something it does not do
	 * is the same defect as a control that does nothing.
	 */
	var SPOTLIGHT_MIN = setNum('spotlightMin', 2, 1);
	var PEAK_SCORE = setNum('peakScore', 3, 1);
	var SEARCH_SQUASH = setNum('searchSquash', 3, 1);
	if (!CFG || !Array.isArray(CFG.species)) {
		return;
	}

	var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	var speciesById = {};
	function indexSpecies() {
		speciesById = {};
		CFG.species.forEach(function (s) {
			speciesById[s.id] = s;
		});
	}
	indexSpecies();

	/* ------------------------------------------------------------------
	 * THE SHEET-ONLY HALF, FETCHED ONCE (1.33.0)
	 *
	 * The page carries an index — see Species::WIRE_INDEX for what is in it
	 * and why. Everything a sheet shows and nothing else shows travels on
	 * demand: at four hundred species that is 78 KB nobody pays for until
	 * they open a species, against 103 KB every guest used to pay on every
	 * page view.
	 *
	 * Same origin, no third party, no key, and the payload is a constant
	 * baked into the plugin's own PHP — this is the site talking to itself,
	 * not a broadening of the "no external services" rule.
	 *
	 * IT IS ALSO ALLOWED TO FAIL. A guest offline, or behind something that
	 * eats REST, still gets a sheet: the index carries the name, the
	 * scientific name, the photograph, the field mark and the twelve-month
	 * strip. What is missing is missing, and nothing renders an error where a
	 * fact should be.
	 * ------------------------------------------------------------------ */
	var detail = { state: 'idle', promise: null };

	function mergeDetail(map) {
		Object.keys(map || {}).forEach(function (id) {
			var sp = speciesById[id];
			if (!sp) { return; }
			var d = map[id];
			Object.keys(d).forEach(function (k) { sp[k] = d[k]; });
		});
	}

	function ensureDetail() {
		if (detail.promise) { return detail.promise; }
		if (!CFG.detailUrl || !window.fetch) {
			detail.state = 'unavailable';
			detail.promise = Promise.resolve(false);
			return detail.promise;
		}
		detail.state = 'loading';
		detail.promise = window.fetch(CFG.detailUrl, { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (data) {
				if (!data || !data.species) { throw new Error('no species'); }
				/*
				 * ITEM 3 (1.45.0): the INDEX arrives here too on a page that
				 * deferred it, and it has to be taken first — mergeDetail()
				 * writes into the rows `speciesById` holds, so merging the
				 * detail half into an empty index would silently drop every
				 * field of it.
				 */
				if (CFG.indexDeferred && Array.isArray(data.index) && data.index.length) {
					CFG.species = data.index;
					indexSpecies();
				}
				mergeDetail(data.species);
				detail.state = 'ready';
				return true;
			})
			.catch(function () {
				// Deliberately silent. The sheet degrades; it does not shout.
				detail.state = 'failed';
				return false;
			});
		return detail.promise;
	}

	/* Warm it on the first sign of interest rather than on load, so it never
	 * competes with the first paint. Any of these means a guest is using the
	 * guide, and a sheet is usually the next tap. */
	function warmDetail() {
		ensureDetail();
	}

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
	/* Spottable = not a hazard. `haz` is decided once, server-side, by
	 * Species::is_hazard(); asking `group !== 'safety'` here was the same
	 * question asked worse, and it missed the alligator. See the note on that
	 * method for the 2026-09-28 reversal this implements. */
	function isSpotting(s) { return !s.haz; }

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
	/*
	 * Mirrors Render::TILE_SIZES, which carries the measurements that
	 * produced it. Changing one without the other makes the server-
	 * rendered tiles and the client-rendered tiles disagree.
	 */
	var TILE_SIZES = '(max-width: 700px) 40vw, (max-width: 1000px) 23vw, 17vw';

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
			/*
			 * THE TILE'S srcset (1.42.0) — in step with
			 * Render::tile_srcset() and TILE_SIZES. Keep them together:
			 * this builds the tiles the client re-renders on a month or
			 * filter change, and the server builds the ones in the cached
			 * HTML, so a guest would otherwise see two different pictures
			 * of the same species depending on which drew it.
			 *
			 * Guarded exactly as the sheet's is: the mid rendition may be
			 * absent (the photo pack or the media import may not have run)
			 * and then the tile renders as it always did.
			 */
			if (sp.src.mid && sp.src.mid !== sp.src.thumb) {
				img.srcset = sp.src.thumb + ' 320w, ' +
					sp.src.mid + ' ' + (sp.src.midW || 600) + 'w';
				img.sizes = TILE_SIZES;
			}
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
	/*
	 * A SPECIES' OWN PICTURE, in the plugin's documented order: the vetted
	 * PHOTOGRAPH first, then its own drawing, then the group glyph.
	 *
	 * 1.33.0 — the photograph rung was missing here, and only here. The tile
	 * face has always followed all three; this function, which draws the
	 * icons in "Easily confused with" and the hub's preview art, went
	 * straight from sprite to glyph. Twenty-seven of fifty-one species have a
	 * photograph and no drawing, so the ID helper showed a PAW PRINT beside
	 * the Brown Watersnake and the Florida Green Watersnake — next to the one
	 * field mark that is supposed to tell them apart. Seventeen of the
	 * twenty-seven are in a look-alike group.
	 *
	 * The thumb rendition is the 320px face, hand-cropped onto the animal, so
	 * it is the right rung for a 40px well.
	 */
	function speciesArt(sp, spriteCls) {
		var thumb = sp.src && sp.src.thumb;
		if (thumb) {
			var img = document.createElement('img');
			img.className = 'dccwl-art-photo ' + (spriteCls || '');
			img.src = thumb;
			img.alt = '';
			img.setAttribute('aria-hidden', 'true');
			img.loading = 'lazy';
			img.decoding = 'async';
			img.width = 320;
			img.height = 240;
			return img;
		}
		if (sp.sprite) {
			return spriteUse(sp.id, spriteCls);
		}
		// 1.19.0: no photograph and no drawing → the group glyph. Never an
		// emoji, never a drawing that might be the wrong animal.
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

	/*
	 * `attachEdgeFades` IS GONE WITH THE TWELVE-MONTH STRIP (1.44.0). It
	 * toggled the left/right "there is more this way" cues on a horizontal
	 * scroller, and the month strip was its only caller — Month is a MENU
	 * now, which does not scroll sideways. The `.dccwl-fade-*` rules went
	 * with it.
	 */

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

				/*
				 * AND THE FULL LIST, ONE TAP AWAY (1.43.0).
				 *
				 * The credits panel left /explore/ this release — 108,284
				 * bytes of it — and lives on /wildlife-guide/. The
				 * Director's condition for allowing that was that the
				 * Credits entry stays visible and one tap away on /explore/
				 * AND on every species sheet, so here it is.
				 *
				 * This is IN ADDITION to the line above, never instead of
				 * it: the sheet is where a photograph is shown at size, so
				 * its own attribution belongs beside it (1.24.0), and a
				 * sheet printing the wrong credit is a licence breach rather
				 * than a typo. The link is the rest of the list.
				 */
				if (CFG.creditsUrl) {
					var all = el('p', 'dccwl-photo-credit dccwl-photo-credit-all');
					var allLink = el('a', 'dccwl-photo-credit-link',
						CFG.i18n.allCredits || 'Photo Credits');
					allLink.href = CFG.creditsUrl;
					all.appendChild(allLink);
					body.appendChild(all);
				}
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
			if ((sp.months[state.month] || 0) >= PEAK_SCORE) {
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
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.place || 'Where To Go'));
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
				body.appendChild(el('h4', 'dccwl-detail-h', CFG.i18n.tellApart || 'Tell It Apart'));
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

			/*
			 * ITEM 11 (1.45.0) — THE WAY OUT OF THE SHEET AND INTO THE GUIDE.
			 *
			 * The sheet holds the species as a card; /wildlife-guide/ holds
			 * it as prose, with everything the card trims. Until now the two
			 * were joined in one direction only — the guide links back to
			 * /explore/ — so a guest who wanted the longer entry had to find
			 * the Guide link in the footnote row and then find the species
			 * again in a page of 402.
			 *
			 * THE ANCHOR IS `#dccwl-fl-<key>` SINCE 1.46.0, which is what
			 * the rebuilt guide page writes on every row — and the rows
			 * answer it by OPENING that species, not merely by being
			 * scrolled to. 1.45.0 shipped the bare id because that was the
			 * anchor the page carried then; both halves moved together.
			 *
			 * Neither half is composed by hand: `guideUrl` and
			 * `guideAnchor` both come from Guide_Page, the one definition of
			 * where that page is and what its rows are called, so this link
			 * cannot drift from the ids on the other end.
			 *
			 * CENTRED, per Rob's standing alignment rule — it is a title-like
			 * affordance, not a paragraph. The arrow is a separate
			 * aria-hidden span so no translator has to carry a glyph and no
			 * screen reader reads one.
			 */
			if (CFG.guideUrl && sp.id) {
				var more = el('p', 'dccwl-detail-more');
				var moreLink = el('a', 'dccwl-detail-more-link',
					CFG.i18n.fullEntry || 'See The Full Entry');
				moreLink.href = CFG.guideUrl + '#' + (CFG.guideAnchor || '') + encodeURIComponent(sp.id);
				var arrow = el('span', 'dccwl-detail-more-arrow', '\u2192');
				arrow.setAttribute('aria-hidden', 'true');
				moreLink.appendChild(arrow);
				more.appendChild(moreLink);
				body.appendChild(more);
			}
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
				closeAllLabel: CFG.i18n.closeAll,
				opener: tile,
				build: function (body) {
					buildDetail(body, sp);
					/*
					 * Built twice only when it has to be. Warmed on the first
					 * interaction, the detail is almost always here already
					 * and 'ready' short-circuits this. When it is not, the
					 * sheet opens NOW with what the index has — name,
					 * photograph, field mark, the twelve-month strip — and
					 * fills in when the rest lands, provided the guest is
					 * still looking at the same species.
					 */
					if ('ready' === detail.state) { return; }
					ensureDetail().then(function (ok) {
						if (!ok || state.openId !== id) { return; }
						body.textContent = '';
						buildDetail(body, sp);
					});
				},
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
			/* Warm on the first hover or touch of any tile: by the time the
			 * tap completes the sheet's half is usually already here. */
			tile.addEventListener('pointerenter', warmDetail, { once: true });
			tile.addEventListener('touchstart', warmDetail, { once: true, passive: true });
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
			if (value >= PEAK_SCORE) {
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
			if (false !== explicit) {
				state.monthPicked = true;
				/* A DEEP LINK IS A CHOICE, SO IT MOVES THE CHIP. `#canal-month=4`
				 * has landed on April since 1.23.0 and still does; what
				 * changed is that the control showing it is the Month menu,
				 * so the label and the filter are set by one call and cannot
				 * disagree. The canal-time month the page opens on is NOT a
				 * choice (1.28.0) and leaves the chip reading "Any Month". */
				guide.month = m;
			}
			if (m === state.month) {
				syncMonthChip();
				refreshGuide();
				return;
			}
			state.month = m;
			syncMonthChip();
			updateHead();
			renderSpotlight();
			annotateGuide();
		}

		/*
		 * `centerMonth`, `trimPartialMonths`, `trimSoon` AND `buildTimeline`
		 * ARE ALL DELETED (1.44.0), AND THAT IS THE RELEASE'S BIGGEST SINGLE
		 * PERFORMANCE FIX RATHER THAN A TIDY-UP.
		 *
		 * The twelve-month strip kept its chosen pill centred, hid any pill
		 * sliced by the track's edge, and re-did both after every scroll and
		 * resize. Between them those three functions took six LAYOUT READS
		 * — scrollWidth, clientWidth, two getBoundingClientRect(), scrollLeft,
		 * offsetWidth — interleaved with class writes across 409 tiles, so
		 * each read forced a synchronous layout of a 9,000-node tree. A CPU
		 * profile at 4x throttling put 419 ms of ONE tap inside centerMonth
		 * alone, with 515 ms of browser style and layout behind it. The node
		 * count did not change on that tap, which is what ruled out DOM
		 * building and named this.
		 *
		 * The Month menu has nothing to centre and nothing to slice, so the
		 * reads do not exist to be forced. `recenter()` went with them, and
		 * canal.js no longer calls it.
		 */

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
		/*
		 * `PEAK_TAB` IS GONE. "Peak Now" was a FOURTH TAB beside Animals,
		 * Plants and Safety, and it never was a section: it cut across all
		 * three and meant "at its best in the visitor's month" (1.27.0).
		 * That is a MONTH question, so Rob moved it into the Month menu as
		 * "This Month" (1.44.0), where it reads as what it is.
		 *
		 * WHAT THAT CHANGED, AND IT IS NOT NOTHING: the filter no longer
		 * crosses sections. As a tab it showed two or three decks at once,
		 * which is why there was a `peakRow`, a `dccwlPeakMode` and a
		 * cross-deck `dccwlApplyView`. As a month it narrows whichever
		 * section is open, like every other month does. All three of those
		 * mechanisms are deleted rather than left inert.
		 *
		 * WHAT DID NOT CHANGE: it is computed in canal time in the browser,
		 * so a cached page can never carry a stale month; hazards are still
		 * excluded (1.33.0 — nobody goes looking for a cottonmouth); and the
		 * Safety list is still never month-filtered (1.28.0), so choosing a
		 * month while Safety is open shows the whole list.
		 */
		/* `pick` is the chosen CATEGORY, per section (1.38.0). It is a FILTER
		 * now — the sub-chips only scrolled the deck — and it is remembered
		 * per tab, so switching away and back does not lose it. A search sets
		 * it aside without clearing it: C4 says clearing the search restores
		 * what the guest had. */
		/* `month` IS THE MONTH MENU'S CHOICE: null = Any Month (no filter),
		 * 'now' = This Month (the old Peak Now), or 0-11 for a named month.
		 * Separate from state.month, which is the month the HEADLINE and the
		 * spotlight are about and is never null. */
		var guide = { q: '', group: null, pick: {}, month: null };

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

		/* ==============================================================
		 * THE GUIDE GRIDS ARE FILLED IN THE BROWSER (1.43.0).
		 *
		 * PHP ships them empty. 409 tiles were 299,662 bytes of markup and
		 * about 4,000 nodes on a page that opens on Water, where not one of
		 * them is visible — and the CPU profile showed the cost was not
		 * building them but LIVING with them: 419 ms in `centerMonth` and
		 * 515 ms of browser layout on a single tap, because every forced
		 * read walked the whole tree.
		 *
		 * HOW MUCH IS BUILT, AND WHEN. Two triggers:
		 *
		 *  1. An IntersectionObserver on each grid: nothing is built until
		 *     the Wildlife view is actually on screen. FIRST_BATCH tiles go
		 *     in immediately — one short task, not a 409-tile one.
		 *  2. IDLE TIME FINISHES THE JOB, in NEXT_BATCH chunks, whether or
		 *     not anybody scrolls.
		 *
		 * THE BRIEF ASKED FOR A SCROLL-DRIVEN SENTINEL AND THERE IS NONE, on
		 * purpose, and this is the one place this release departs from it.
		 * A sentinel <li> at the end of the list is still a grid item: it
		 * occupies a track and leaves exactly the empty cell Rob ruled out in
		 * 1.37.0 and again in 1.37.1 ("NO GAPS"). Putting it outside the <ul>
		 * does not work either — the <ul> IS the deck's scroll container, so
		 * a sibling after it never enters that scroller's viewport. Idle
		 * completion does the same job in a few frames and cannot leave a
		 * hole, so it replaces the sentinel rather than joining it.
		 *
		 * Idle completion is also the correctness rule, not belt-and-braces. A
		 * partially built grid would make the search and the category counts
		 * LIE — a guest searching "manatee" would be told it is not there
		 * because its tile had not been built yet. That is exactly the 1.28.0
		 * defect (an invisible filter put seven winter species out of reach)
		 * in a new disguise, and it is why `ensureTiles(all)` below forces a
		 * grid to completion the moment a filter, a category or a search
		 * needs the whole list.
		 *
		 * So the DOM converges to complete within a few idle frames, and no
		 * measurement — the deck's row count, the pager, a count beside a
		 * category — is ever taken against a half-filled list.
		 * ============================================================== */
		var FIRST_BATCH = 24;
		var NEXT_BATCH = 48;
		var gridWatcher = null;

		function orderFor(group) {
			return (CFG.order && CFG.order[group]) || [];
		}

		/** How many tiles this grid already holds. */
		function builtCount(grid) {
			return grid.querySelectorAll('.dccwl-tile').length;
		}

		/**
		 * Add up to `n` more tiles (null = all that remain).
		 * Returns true once the grid holds its whole list.
		 */
		function buildInto(grid, n) {
			var group = grid.getAttribute('data-dccwl-group');
			var ids = orderFor(group);
			var have = builtCount(grid);
			if (have >= ids.length) { return true; }
			var stop = null === n ? ids.length : Math.min(ids.length, have + n);
			var frag = document.createDocumentFragment();
			for (var i = have; i < stop; i++) {
				var sp = speciesById[ids[i]];
				if (!sp) { continue; }
				/*
				 * ZERO, NOT THE MONTH'S VALUE, AND IT MATTERS.
				 *
				 * `buildTile(sp, value)` adds the coral "Peak" flag when
				 * value >= PEAK_SCORE. It was written for the spotlight
				 * strip, which never contains a hazard, so it never had to
				 * ask. PHP's server-rendered guide tile carried NO flag at
				 * all — the month is cache-unsafe — and `refreshGuide()` has
				 * always been the one function that decides a guide tile's
				 * sub-label, hazards included (1.33.0: the safety list is a
				 * warning list, not a spotting list).
				 *
				 * Passing the real value here put "Peak" on the three
				 * venomous snakes in a search, which ui-chrome.mjs caught by
				 * name. Build the tile bare and let the one authority label
				 * it, exactly as it labelled the server-rendered ones.
				 */
				var li = buildTile(sp, 0);
				/* The category filter reads this attribute off the <li>, as it
				 * did when PHP wrote it — so the filter code is untouched.
				 * `browse` rides the wire now (Species::WIRE_INDEX), which is
				 * the one copy of that fact. */
				if (sp.browse) { li.setAttribute('data-dccwl-browse', sp.browse); }
				frag.appendChild(li);
			}
			grid.appendChild(frag);
			return builtCount(grid) >= ids.length;
		}

		/** Build in idle time until every lazy grid is complete. */
		function fillWhenIdle() {
			var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 32); };
			idle(function () {
				var pending = false;
				root.querySelectorAll('.dccwl-guide-grid[data-dccwl-lazy]').forEach(function (g) {
					if (!buildInto(g, NEXT_BATCH)) { pending = true; }
				});
				if (pending) {
					fillWhenIdle();
				} else {
					root.querySelectorAll('.dccwl-guide-grid[data-dccwl-lazy]').forEach(function (g) {
						g.removeAttribute('data-dccwl-lazy');
					});
					if (gridWatcher) { gridWatcher.disconnect(); gridWatcher = null; }
					refreshGuide();
				}
			});
		}

		/**
		 * Make sure the grids hold what the caller is about to measure.
		 * `all` forces completion — see the correctness note above.
		 */
		function ensureTiles(all) {
			var grids = root.querySelectorAll('.dccwl-guide-grid[data-dccwl-lazy]');
			if (!grids.length) { return false; }
			var changed = false;
			grids.forEach(function (g) {
				if (buildInto(g, all ? null : FIRST_BATCH)) {
					g.removeAttribute('data-dccwl-lazy');
					changed = true;
				} else if (all) {
					changed = true;
				}
			});
			return changed;
		}

		/** Arm the observers. Called once, from init. */
		function watchGrids() {
			var grids = root.querySelectorAll('.dccwl-guide-grid[data-dccwl-lazy]');
			if (!grids.length) { return; }

			/* NO IntersectionObserver — build everything now rather than
			 * leave a guest with empty grids. An old browser gets the 1.42.0
			 * behaviour, which is the one thing that must never regress. */
			if (!('IntersectionObserver' in window)) {
				root.querySelectorAll('.dccwl-guide-grid[data-dccwl-lazy]').forEach(function (g) {
					buildInto(g, null);
					g.removeAttribute('data-dccwl-lazy');
				});
				refreshGuide();
				return;
			}

			gridWatcher = new IntersectionObserver(function (entries) {
				var touched = false;
				entries.forEach(function (e) {
					if (!e.isIntersecting) { return; }
					var grid = e.target.closest ? (e.target.closest('.dccwl-guide-grid') || e.target) : e.target;
					if (!grid || !grid.getAttribute('data-dccwl-group')) { return; }
					if (buildInto(grid, builtCount(grid) ? NEXT_BATCH : FIRST_BATCH)) {
						grid.removeAttribute('data-dccwl-lazy');
					}
					touched = true;
				});
				if (touched) {
					refreshGuide();
					fillWhenIdle();
				}
			}, { rootMargin: '200px' });

			grids.forEach(function (g) { gridWatcher.observe(g); });
		}

		function refreshGuide() {
			var section = root.querySelector('.dccwl-guide');
			if (!section) { return; }
			var isCanal = !!root.closest('[data-dccwl-canal]');
			var q = guide.q, searching = q.length > 0;
			/* "This Month" (1.44.0, formerly the Peak Now tab): what is at its
			 * best in the month the VISITOR is in. state.month is canal time,
			 * computed in the browser, so this can never be baked into a
			 * cached page — which is why no peak grid and no peak count is
			 * ever server-rendered. */
			var peaking = 'now' === guide.month;
			/* A NAMED MONTH, which is what the twelve-month strip did. */
			var monthPick = 'number' === typeof guide.month ? guide.month : null;

			/* COMPLETE THE GRIDS BEFORE MEASURING ANYTHING. A search, a
			 * category or Peak Now asks a question about the WHOLE list, and
			 * a half-built grid would answer it wrongly and silently. Guarded
			 * so the common case — a plain month change — does not force 409
			 * tiles into existence before idle time gets to them. */
			var needsAll = searching || peaking || null !== monthPick
				|| Object.keys(guide.pick || {}).some(function (k) {
					return !!guide.pick[k];
				});

			/*
			 * VISIBILITY IS THE TRIGGER, AND THAT IS WHAT MEETS THE NODE
			 * BUDGET.
			 *
			 * /explore/ opens on Water, so the guide lives inside a panel the
			 * app keeps `display: none`. A hidden element has no offsetParent
			 * — and never intersects anything, which is why an
			 * IntersectionObserver alone could not start this. While it is
			 * hidden NOTHING is built: that is how the page stays near its
			 * DOM budget at load instead of carrying 409 tiles nobody can
			 * see.
			 *
			 * The moment it IS visible, the first batch goes in synchronously
			 * (so a guest never sees an empty grid) and idle time finishes
			 * the rest. A filter, a category or a search forces completion
			 * first, whatever the view's state — see the long note above.
			 */
			var shown = !!section.offsetParent;
			if (needsAll) {
				ensureTiles(true);
			} else if (shown && root.querySelector('.dccwl-guide-grid[data-dccwl-lazy]')) {
				ensureTiles(false);
				fillWhenIdle();
			}

			var rows = [], i = 0;

			// 1. Who is eligible: the open group (or, while searching, every
			//    group), then the month, then the search.
			section.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
				var group = g.getAttribute('data-dccwl-group');
				/* Searching looks in every group: at 402 species the answer to
				 * "where is the coot?" must not depend on which tab is open.
				 * A MONTH DOES NOT cross sections — that was Peak Now's doing
				 * as a tab, and it is a month now. */
				var groupOn = searching || null === guide.group || group === guide.group;
				g.querySelectorAll('.dccwl-tile').forEach(function (tile) {
					var sp = speciesById[tile.getAttribute('data-dccwl-species')];
					var old = tile.querySelector('.dccwl-tile-sub');
					if (old) { old.parentNode.removeChild(old); }
					var v = sp && sp.months ? (sp.months[state.month] || 0) : 0;
					var keep = groupOn;
					/* THE CATEGORY FILTER (1.38.0, Rob's C2). Set aside while
					 * searching — a search covers everything, including the
					 * separate Safety list. A month filter and a category
					 * filter now compose, because both narrow one section. */
					if (keep && !searching) {
						var want = guide.pick[group] || '';
						var own = tile.closest('li');
						if (want && own && want !== (own.getAttribute('data-dccwl-browse') || '')) { keep = false; }
					}
					if (keep && sp) {
						if (searching) {
							// A search overrides the month: a guest looking for
							// a species out of season still deserves to find it.
							keep = speciesMatches(sp, q);
						} else if (peaking) {
							/*
							 * HAZARDS ONLY IN SAFETY (1.33.0, owner's decision
							 * of 2026-09-28, reversing 1.27.0's rule that a
							 * venomous snake at its most active should be
							 * shown here rather than spared).
							 *
							 * "This Month" is a list of things worth going to
							 * look for. The Safety section, which a guest
							 * chooses deliberately, is where the cottonmouth
							 * belongs — and the 1.28.0 rule that the Safety
							 * grid is NEVER month-filtered is what keeps it
							 * whole here, exactly as a named month does below.
							 */
							keep = 'safety' === group || (isSpotting(sp)
								&& !!(sp.months && (sp.months[state.month] || 0) >= PEAK_SCORE));
						} else if (sp.months && null !== monthPick && state.monthPicked) {
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
							 * section, and the Month menu — which says what it
							 * does in its own label, every time — is where
							 * seasonality lives. Choosing a month there is an
							 * explicit request to see that month, and filters.
							 *
							 * THE `isCanal` GATE IS GONE (1.44.0), AND THAT
							 * IS A DELIBERATE CHANGE TO THE LEGACY WIDGET.
							 *
							 * Until this release the month filter ran in the
							 * HUB only. That was coherent while the control
							 * was the twelve-month strip, which on the
							 * standalone widget drove the headline and the
							 * spotlight band instead — it had visible work to
							 * do there. The strip is a chip on the GUIDE's own
							 * control row now, directly above the tiles it
							 * governs, so a gate would leave it reading
							 * "January" over a list of 308 animals that is
							 * not filtered at all. A control that lies about
							 * what it is doing is worse than one that is
							 * absent: this is the 1.28.0 rule from the other
							 * side, and the harness caught it on the
							 * standalone fixture in the run it was written.
							 *
							 * `state.monthPicked` still gates it, so the
							 * 1.28.0 defect itself cannot return: the page
							 * opens on "Any Month" and nothing is filtered
							 * until a guest chooses.
							 */
							keep = 'safety' === group || v >= SPOTLIGHT_MIN;
						}
					}
					if (isCanal && v >= PEAK_SCORE) {
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
			/*
			 * THE CHIP ROW IS ONE ROW, SHARED (1.44.0).
			 *
			 * It used to be three — one per section, each directly above its
			 * own grid — with elaborate rules deciding which of the three was
			 * on screen, a `peakRow` because Peak Now spanned sections, and a
			 * cross-deck `dccwlApplyView` so one Compact switch could govern
			 * three decks. Rob asked for ONE control row, so Month and the
			 * badge key are rendered once and only the per-section category
			 * pill is swapped: the one belonging to the open tab.
			 *
			 * DURING A SEARCH the current tab keeps its pill (1.38.0), reading
			 * "Show: All" — which is true, because a search covers everything.
			 */
			section.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
				var group = g.getAttribute('data-dccwl-group');
				var groupOn = searching || null === guide.group || group === guide.group;
				g.hidden = !groupOn || (searching && !perGrid[group]);

				var sub = section.querySelector('[data-dccwl-subnav="' + group + '"]');
				if (sub) {
					sub.hidden = group !== guide.group;
					if (sub.dccwlSyncPick) { sub.dccwlSyncPick(); }
				}
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
			/* A TABLIST, SO THE SELECTED TAB IS `aria-selected` (1.44.0).
			 * It was `aria-pressed`, which is a toggle button's state and
			 * says nothing about which panel is showing. `tabindex` follows
			 * it so Tab lands on the selected tab and the arrow keys move
			 * between them, which is what a tablist promises. */
			section.querySelectorAll('.dccwl-tab').forEach(function (t) {
				var on = !searching && t.getAttribute('data-dccwl-group') === guide.group;
				t.setAttribute('aria-selected', on ? 'true' : 'false');
				t.setAttribute('tabindex', on ? '0' : '-1');
			});
			/* "This Month" names no month in the markup, so say which one it
			 * means where a guest can read it, and say plainly when nothing
			 * is at its best rather than showing an empty page. */
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

		/* ---------- the section toolbar (1.31.0, rebuilt 1.38.0) ----------
		 *
		 * Three hundred animals is fifty swipes of the deck with only a
		 * counter for orientation. TWO controls now, on one row:
		 *
		 *  - THE PICKER filters the deck to one category. It replaced a row
		 *    of chips that scrolled to a sub-group and hid nothing, and a
		 *    native <select> that went straight to one species by name.
		 *  - A COMPACT toggle swaps photo cards for short rows.
		 *
		 * THE FILTER REVERSES THE 1.31.0 RULE, by the owner's instruction.
		 * The 1.28.0 lesson behind that rule — a filter nobody can see made
		 * seven winter species unreachable — is answered differently: this one
		 * names what it is doing in its own label, every time, and the search
		 * box overrides it so a species is never unreachable.
		 */
		function initBrowseNav(section) {
			section.querySelectorAll('[data-dccwl-subnav]').forEach(function (nav) {
				var slug = nav.getAttribute('data-dccwl-subnav');
				var grid = section.querySelector('.dccwl-guide-grid[data-dccwl-group="' + slug + '"]');
				if (!grid) { return; }

				/* ==========================================================
				 * THE CATEGORY PICKER (1.38.0 — Rob's C2/C3).
				 *
				 * One pill, "Show: All ▾", opening a list beneath it. It
				 * FILTERS the deck; the chips it replaces only scrolled to a
				 * group. That reverses the 1.31.0 rule that a sub-group is
				 * navigation and never a filter — reversed BY THE OWNER, who
				 * asked for exactly this after living with the chips.
				 *
				 * The 1.28.0 lesson behind that old rule still stands and is
				 * answered differently: a filter must never be invisible. This
				 * one says what it is doing in its own label, every time.
				 * ========================================================== */
				var pick = nav.querySelector('[data-dccwl-pick]');
				var pickBtn = pick && pick.querySelector('[data-dccwl-pick-btn]');
				var pickList = pick && pick.querySelector('[data-dccwl-pick-list]');
				var pickValue = pick && pick.querySelector('[data-dccwl-pick-value]');
				var opts = pick ? [].slice.call(pick.querySelectorAll('.dccwl-pick-opt')) : [];
				var allLabel = opts.length ? optName(opts[0]) : 'All';

				function optName(o) {
					var n = o.querySelector('.dccwl-pick-opt-name');
					return (n ? n.textContent : o.textContent || '').trim();
				}

				function openPick(on) {
					if (!pick || !pickList || !pickBtn) { return; }
					pickList.hidden = !on;
					pickBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
					pick.classList.toggle('dccwl-pick-open', !!on);
					if (on) {
						var sel = opts.filter(function (o) { return 'true' === o.getAttribute('aria-selected'); })[0];
						(sel || opts[0]).focus();
					}
				}

				/* The pill always shows what the deck is showing. While a
				 * search is on it reads "All", because a search covers
				 * everything (C4) — the guest's own choice is kept in
				 * guide.pick and comes back when they clear the box. */
				function syncPick() {
					if (!pick) { return; }
					var searching = !!guide.q;
					var want = searching ? '' : (guide.pick[slug] || '');
					opts.forEach(function (o) {
						var on = (o.getAttribute('data-dccwl-browse') || '') === want;
						o.setAttribute('aria-selected', on ? 'true' : 'false');
						if (on && pickValue) { pickValue.textContent = optName(o); }
					});
					if (!opts.length && pickValue) { pickValue.textContent = allLabel; }
				}

				function choose(value) {
					guide.pick[slug] = value || '';
					openPick(false);
					syncPick();
					refreshGuide();
					/* A new filter is a new list: the deck starts at its
					 * first page, as Rob asked. */
					if (window.DCCWL_Deck) {
						grid.scrollLeft = 0;
						window.DCCWL_Deck.refreshSoon(grid, CFG.i18n);
					}
					if (pickBtn) { pickBtn.focus(); }
				}

				if (pick && pickBtn && pickList) {
					pickBtn.addEventListener('click', function (ev) {
						ev.stopPropagation();
						openPick(pickList.hidden);
					});
					opts.forEach(function (o) {
						o.addEventListener('click', function () { choose(o.getAttribute('data-dccwl-browse')); });
					});
					/* Keyboard: the list is a listbox, so arrows move through
					 * it, Enter chooses, Escape closes and hands focus back. */
					pickList.addEventListener('keydown', function (ev) {
						var i = opts.indexOf(document.activeElement);
						if ('Escape' === ev.key) {
							ev.stopPropagation();
							openPick(false);
							pickBtn.focus();
						} else if ('ArrowDown' === ev.key || 'ArrowUp' === ev.key) {
							ev.preventDefault();
							var n = opts.length;
							var next = (i < 0 ? 0 : (i + ('ArrowDown' === ev.key ? 1 : n - 1)) % n);
							opts[next].focus();
						} else if ('Home' === ev.key || 'End' === ev.key) {
							ev.preventDefault();
							opts['Home' === ev.key ? 0 : opts.length - 1].focus();
						}
					});
					// A tap anywhere else closes it, like the map's menus.
					document.addEventListener('click', function (ev) {
						if (pickList.hidden) { return; }
						if (pick.contains(ev.target)) { return; }
						openPick(false);
					});
					nav.dccwlSyncPick = syncPick;
					syncPick();
				}

				/*
				 * THE COMPACT SWITCH IS GONE (1.44.0, Rob's brief), AND SO IS
				 * EVERYTHING IT NEEDED: `applyView`, the `data-dccwl-compact`
				 * attribute, the `.dccwl-compact-list` class, the published
				 * `dccwlApplyView` that let the one switch on screen govern
				 * three decks at once, and the `defaultView` setting that
				 * chose which view a guest landed in.
				 *
				 * Photo-first tiles have been the guide's face since 1.19.0;
				 * the switch offered a second way to read the same list, and
				 * the one control row Rob specified has no room for it. The
				 * setting is retired in Guide_Data rather than deleted, so a
				 * stored row is not changed.
				 */
			});
		}

		/* ---------- the Month menu (1.44.0) ---------- */

		/*
		 * ONE CHIP CARRYING WHAT THE TWELVE-MONTH STRIP AND PEAK NOW BOTH
		 * CARRIED. "Any Month" is the default and shows the whole section —
		 * the 1.28.0 rule that a category tab shows everything in it, which
		 * exists because an invisible month filter once put seven winter
		 * species out of reach. "This Month" is the old Peak Now. A named
		 * month is the old strip.
		 *
		 * THE LABEL IS WHAT MAKES THE FILTER VISIBLE, and that is the whole
		 * answer to the 1.28.0 defect: the chip reads the month it is
		 * filtering by, at all times, on the same row as the tiles.
		 */
		function monthMenu() {
			return root.querySelector('[data-dccwl-monthpick]');
		}

		function syncMonthChip() {
			var pick = monthMenu();
			if (!pick) { return; }
			var label = pick.querySelector('[data-dccwl-monthlabel]');
			var want = null === guide.month ? 'any'
				: ('now' === guide.month ? 'now' : String(guide.month));
			var opts = [].slice.call(pick.querySelectorAll('[data-dccwl-month]'));
			opts.forEach(function (o) {
				var on = o.getAttribute('data-dccwl-month') === want;
				var li = o.closest('li');
				if (li) { li.setAttribute('aria-selected', on ? 'true' : 'false'); }
				if (on && label) { label.textContent = o.textContent; }
			});
		}

		function initMonthMenu() {
			var pick = monthMenu();
			if (!pick) { return; }
			var btn = pick.querySelector('[data-dccwl-monthbtn]');
			var list = pick.querySelector('[data-dccwl-monthmenu]');
			if (!btn || !list) { return; }
			var opts = [].slice.call(list.querySelectorAll('[data-dccwl-month]'));

			function open(on) {
				list.hidden = !on;
				btn.setAttribute('aria-expanded', on ? 'true' : 'false');
				pick.classList.toggle('dccwl-chipmenu-open', !!on);
				if (on) {
					var sel = opts.filter(function (o) {
						var li = o.closest('li');
						return li && 'true' === li.getAttribute('aria-selected');
					})[0];
					(sel || opts[0]).focus();
				}
			}

			function choose(raw) {
				var m = canalToday().getMonth();
				if ('any' === raw) {
					guide.month = null;
					/* BACK TO "NO MONTH CHOSEN", not merely to this month.
					 * `state.monthPicked` is what the month filter is gated on
					 * (1.28.0), so clearing the chip has to clear it too, or
					 * "Any Month" would go on filtering by whatever was last
					 * picked — an invisible filter, which is the one thing
					 * that rule forbids. The headline keeps the canal month. */
					state.monthPicked = false;
				} else if ('now' === raw) {
					guide.month = 'now';
					state.monthPicked = true;
				} else {
					m = ((parseInt(raw, 10) % 12) + 12) % 12;
					guide.month = m;
					state.monthPicked = true;
				}
				/* `false` because the chip ABOVE is the record of the choice:
				 * passing `true` would have setMonth overwrite guide.month
				 * with a bare number, turning "This Month" into October. */
				setMonth(m, false);
				open(false);
				syncMonthChip();
				refreshGuide();
				resetDecks();
				btn.focus();
			}

			btn.addEventListener('click', function (ev) {
				ev.stopPropagation();
				open(list.hidden);
			});
			opts.forEach(function (o) {
				o.addEventListener('click', function () { choose(o.getAttribute('data-dccwl-month')); });
			});
			/* Keyboard: a listbox, like the category pill — arrows, Home, End,
			 * Escape, and focus handed back to the chip. */
			list.addEventListener('keydown', function (ev) {
				var i = opts.indexOf(document.activeElement);
				if ('Escape' === ev.key) {
					ev.stopPropagation();
					open(false);
					btn.focus();
				} else if ('ArrowDown' === ev.key || 'ArrowUp' === ev.key) {
					ev.preventDefault();
					var n = opts.length;
					opts[(i < 0 ? 0 : (i + ('ArrowDown' === ev.key ? 1 : n - 1)) % n)].focus();
				} else if ('Home' === ev.key || 'End' === ev.key) {
					ev.preventDefault();
					opts['Home' === ev.key ? 0 : opts.length - 1].focus();
				}
			});
			document.addEventListener('click', function (ev) {
				if (list.hidden || pick.contains(ev.target)) { return; }
				open(false);
			});
			syncMonthChip();
		}

		/* A new filter is a new list: every visible deck starts at its first
		 * page, as Rob asked in 1.38.0 for the category pill. A month is the
		 * same kind of change, so it gets the same treatment. */
		function resetDecks() {
			if (!window.DCCWL_Deck) { return; }
			root.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
				g.scrollLeft = 0;
				window.DCCWL_Deck.refreshSoon(g, CFG.i18n);
			});
		}

		/* ---------- the badge key popover (1.44.0) ----------
		 *
		 * The key was four always-on lines under the tabs. It is the same
		 * SERVER-RENDERED markup, now behind an ⓘ chip on the control row —
		 * so a guest without JavaScript still meets the whole key as ordinary
		 * text rather than a button that does nothing, and the 1.18.0 rule
		 * (a colour carrying meaning has a key beside where it is used) is
		 * intact: it is one tap from every tile that carries a mark.
		 */
		function initBadgeKey(section) {
			var btn = section.querySelector('[data-dccwl-badges]');
			var key = section.querySelector('[data-dccwl-badgepop]');
			if (!btn || !key) { return; }
			function open(on) {
				key.hidden = !on;
				btn.setAttribute('aria-expanded', on ? 'true' : 'false');
			}
			btn.addEventListener('click', function (ev) {
				ev.stopPropagation();
				open(key.hidden);
			});
			/* Escape and an outside tap close it, like every other popover
			 * here. Inside a sheet this would have to claim `dccwl:escape`
			 * (1.33.0) — it is not in one, so a plain keydown is correct. */
			document.addEventListener('keydown', function (ev) {
				if ('Escape' === ev.key && !key.hidden) { open(false); btn.focus(); }
			});
			document.addEventListener('click', function (ev) {
				if (key.hidden || key.contains(ev.target) || btn.contains(ev.target)) { return; }
				open(false);
			});
			open(false);
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
			initMonthMenu();
			initBadgeKey(section);
			// One deck per group grid (1.23.0). Attaching per grid rather than
			// once for the section means the visible group is the one being
			// paged, and changing tab changes decks with it.
			if (window.DCCWL_Deck) {
				section.querySelectorAll('.dccwl-guide-grid').forEach(function (g) {
					window.DCCWL_Deck.attach(g, CFG.i18n);
				});
			}
			var tabs = section.querySelectorAll('.dccwl-tab');
			var first = section.querySelector('.dccwl-tab[aria-selected="true"]') || tabs[0];
			guide.group = first ? first.getAttribute('data-dccwl-group') : null;
			var input = section.querySelector('[data-dccwl-search-input]');
			var clear = section.querySelector('[data-dccwl-search-clear]');

			function setQuery(raw) {
				guide.raw = String(raw || '').trim();
				guide.q = fold(guide.raw);
				if (clear) { clear.hidden = '' === guide.q; }
				refreshGuide();
			}

			var tabList = [].slice.call(tabs);

			function openTab(tab) {
				guide.group = tab.getAttribute('data-dccwl-group');
				// Picking a group is a way of saying "not that search any more".
				if (input && input.value) { input.value = ''; }
				setQuery('');
				/* A new section is a new list, so its deck starts at page one
				 * — the 1.38.0 rule, which the pill has always followed. */
				resetDecks();
			}

			tabList.forEach(function (tab) {
				tab.addEventListener('click', function () { openTab(tab); });
				/*
				 * A TABLIST MOVES WITH THE ARROW KEYS, AND THAT IS WHY IT IS
				 * ONE (1.44.0). The row was three buttons with `aria-pressed`,
				 * so a keyboard guest Tabbed through all three and nothing
				 * said which panel they governed. As a tablist it is ONE Tab
				 * stop and the arrows move between tabs, which is what the
				 * role promises — and the promise has to be kept or the role
				 * is worse than none.
				 */
				tab.addEventListener('keydown', function (ev) {
					var i = tabList.indexOf(tab), n = tabList.length, next = -1;
					if ('ArrowRight' === ev.key || 'ArrowDown' === ev.key) { next = (i + 1) % n; }
					else if ('ArrowLeft' === ev.key || 'ArrowUp' === ev.key) { next = (i + n - 1) % n; }
					else if ('Home' === ev.key) { next = 0; }
					else if ('End' === ev.key) { next = n - 1; }
					if (next < 0) { return; }
					ev.preventDefault();
					openTab(tabList[next]);
					tabList[next].focus();
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
				/*
				 * ITEM 5 (1.37.0) — ENTER / GO SHOWS THE RESULTS.
				 *
				 * It used to do one thing: stop a form submit reloading the
				 * page. The guest was left looking at the browser's own
				 * suggestion list over their results, with the keyboard still
				 * up and the matches behind both. Blurring the field is what
				 * closes that list and lowers the keyboard — there is no other
				 * handle on either — and the query is applied first so the
				 * results are already there when they appear.
				 */
				var submitSearch = function (e) {
					if ('Enter' !== e.key) { return; }
					e.preventDefault();
					setQuery(input.value);
					input.blur();
				};
				input.addEventListener('keydown', submitSearch);
				// A search field inside a form must never reload the page.
				input.addEventListener('keypress', function (e) { if ('Enter' === e.key) { e.preventDefault(); } });
				// iOS fires `search` on the Go key of the on-screen keyboard.
				input.addEventListener('search', function () { setQuery(input.value); input.blur(); });
			}
			if (clear && input) {
				clear.addEventListener('click', function () {
					input.value = '';
					setQuery('');
					input.focus();
				});
			}
			refreshGuide();
			/* Arm the lazy fill LAST, so the first refresh has already set
			 * the month, the open section and the pick state — the observer's
			 * callback calls refreshGuide() again and must not be the thing
			 * that initialises it. */
			watchGrids();
		}

		/* ---------- boot this instance ---------- */

		if (strip) {
			strip.addEventListener('scroll', updateStripEnd, { passive: true });
			window.addEventListener('resize', updateStripEnd);
		}

		updateHead();
		renderSpotlight();
		initGuide();   // refreshes the guide itself, and wires the Month menu

		/* Expose this instance so an outer shell can set the month. `recenter`
		 * is GONE: it existed only to centre the month strip's chosen pill
		 * after a hidden panel was shown, and a menu has nothing to centre. */
		roots.set(root, {
			setMonth: setMonth,
			month: function () { return state.month; }
		});

		/*
		 * ITEM 3 (1.45.0): a month asked for before this root existed.
		 *
		 * canal.js reads `#canal-month=` and calls DCCWL_Widget.setMonth()
		 * while the species panel is still hidden and, with the index
		 * deferred, before this function has ever run. That call stashed the
		 * month on the element; this applies it, after the handle is
		 * registered so nothing re-enters, and clears it so a later
		 * re-initialisation cannot resurrect a month the guest has since
		 * changed.
		 */
		var pending = root.getAttribute('data-dccwl-pending-month');
		if (null !== pending && '' !== pending) {
			var pm = parseInt(pending, 10);
			root.removeAttribute('data-dccwl-pending-month');
			var pex = '1' === root.getAttribute('data-dccwl-pending-explicit');
			root.removeAttribute('data-dccwl-pending-explicit');
			if (pm >= 0 && pm <= 11) { setMonth(pm, pex); }
		}
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
		/* A species' own picture, all three rungs. The hub's preview art used
		 * sprite() directly and SKIPPED every species without a drawing, so
		 * the art showed a subset of what the line beside it was counting. */
		art: function (sp, cls) { return speciesArt(sp, cls); },
		peakFor: function (m) {
			return speciesForMonth(m).filter(function (x) { return x.v >= PEAK_SCORE; })
				.map(function (x) { return x.s; });
		},
		setMonth: function (root, m, explicit) {
			var h = roots.get(root);
			if (h) { h.setMonth(m, explicit); return; }
			/*
			 * ITEM 3 (1.45.0): THE ROOT MAY NOT EXIST YET.
			 *
			 * With the index deferred, a root inside the hidden species
			 * panel is not initialised until that panel is shown — and
			 * canal.js's deep-link path calls this BEFORE it shows the
			 * panel, because `#canal-month=april` has to open Wildlife
			 * already filtered. Dropping the call on the floor (which is
			 * what the old `if (h)` did) would land the guest on an unfiltered
			 * list and lose the month they asked for.
			 *
			 * So it is stashed on the element and initRoot() applies it as
			 * its first act. An attribute rather than a property: it is
			 * visible in the DOM when something goes wrong, and it is the
			 * same channel initRoot already reads its per-placement options
			 * from.
			 */
			root.setAttribute('data-dccwl-pending-month', String(m));
			if (explicit) { root.setAttribute('data-dccwl-pending-explicit', '1'); }
		},
		month: function (root) {
			var h = roots.get(root);
			return h ? h.month() : null;
		}
	};

	/*
	 * The close control at the foot of the field guide and the credits
	 * (1.33.0). Server-rendered hidden, because without JavaScript a <details>
	 * only answers to its own <summary> and a button here would do nothing;
	 * unhidden and wired here.
	 *
	 * Closing a panel with focus inside it leaves focus on a node that is no
	 * longer rendered, so focus goes back to the summary — which is also where
	 * the reader now is on screen.
	 */
	function initFullguideClose(scope) {
		(scope || document).querySelectorAll('[data-dccwl-fullguide-close]').forEach(function (btn) {
			if (btn.getAttribute('data-dccwl-close-init')) { return; }
			btn.setAttribute('data-dccwl-close-init', '1');
			var panel = btn.closest('details.dccwl-fullguide');
			if (!panel) { return; }
			btn.hidden = false;
			btn.addEventListener('click', function () {
				panel.open = false;
				var summary = panel.querySelector('summary');
				if (summary) {
					summary.focus();
					summary.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
				}
			});
		});
	}

	/* ==================================================================
	 * ITEM 3 (1.45.0) — A ROOT THAT HAS NO INDEX YET WAITS FOR ONE.
	 *
	 * On /explore/ the species panel is hidden behind the view switch and
	 * the index is not in the page at all (Render::enqueue_assets). Three
	 * cases, and the third is the one that matters:
	 *
	 *   - nothing deferred: initialise now, exactly as before;
	 *   - deferred but this root is VISIBLE (a standalone [dcc_wildlife] on
	 *     a page that also carries the canal, which prints the shared config
	 *     first and therefore decided the deferral): fetch immediately, so
	 *     the one placement a guest can actually see is never left empty;
	 *   - deferred and hidden: wait for `dccwl:panel-shown`, which canal.js
	 *     fires on the panel it reveals. That is the whole saving — the
	 *     bytes are fetched when a guest asks for Wildlife and never for a
	 *     guest who stays on Water.
	 *
	 * The fetch is ensureDetail(), not a second call: /species carries both
	 * halves, so a guest who opens the panel has the sheet data already and
	 * the first species they tap opens with no wait at all.
	 * ================================================================== */
	function initDeferredRoot(root) {
		var panel = root.closest('[data-dccwl-panel]');
		var hidden = !!(panel && panel.hidden);
		var start = function () {
			ensureDetail().then(function () {
				/* Initialise even when the fetch FAILED. The page still has
				 * its server-rendered furniture and the guide degrades to
				 * what is in the markup — the 1.33.0 rule for the detail
				 * half, applied to the index: what is missing is missing,
				 * and nothing renders an error where a species should be. */
				initRoot(root);
			});
		};
		if (!hidden) { start(); return; }
		panel.addEventListener('dccwl:panel-shown', start, { once: true });
	}

	function initAll() {
		document.querySelectorAll('.dccwl-root').forEach(function (root) {
			if (CFG.indexDeferred && !CFG.species.length) {
				initDeferredRoot(root);
			} else {
				initRoot(root);
			}
		});
		initFullguideClose(document);
		initCountdown();
		/* The other routes in: a tab, a chip, the search box, a month. Any of
		 * them means the guide is being used and a sheet is likely next.
		 * `once` on each, and ensureDetail() is idempotent, so this costs one
		 * listener per control and at most one request. */
		document.querySelectorAll(
			'.dccwl-root .dccwl-tab, .dccwl-root .dccwl-pick-btn, .dccwl-root .dccwl-month, .dccwl-root .dccwl-search-input'
		).forEach(function (el) {
			el.addEventListener('focus', warmDetail, { once: true });
			el.addEventListener('click', warmDetail, { once: true });
		});
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
						initFullguideClose(scope);
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
