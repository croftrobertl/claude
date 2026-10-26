/**
 * THE WILDLIFE GUIDE PAGE (1.46.0) — the app-style list's behaviour.
 *
 * Loaded only on /wildlife-guide/. Four jobs and nothing else:
 *
 *   1. the "Seen Here | Wider Florida" switch, the search and the group
 *      pills, which between them decide which rows are shown;
 *   2. opening a species — in the shared sheet on a phone, in the pane
 *      beside the list on a wide screen;
 *   3. the counts in the pills, which follow the switch;
 *   4. `#dccwl-fl-<key>` deep links, which open that species on arrival,
 *      and `#credits`, which opens the folded photo credits (1.47.0).
 *
 * WHAT IT DOES NOT DO, AND WHY THAT IS THE DESIGN:
 *
 *  - IT CARRIES NO SPECIES DATA. Every value it filters on is an attribute
 *    on the row it filters — scope, group, name, scientific name — written
 *    by PHP from the registry and the local-first pull. There is no second
 *    copy of the dataset on this page, so nothing can disagree with what is
 *    on screen, and the script is a few kilobytes rather than a hundred.
 *  - IT BUILDS NO CONTENT. A sheet and the desktop pane are filled by
 *    CLONING the row's own entry — the same markup a crawler read. The only
 *    things it adds are the photograph and its credit, which the row has as
 *    attributes because the entry does not show them.
 *  - IT NEVER WRITES TO THE DOM INSIDE A TOUCH HANDLER. Rows open on
 *    `click`, which fires after the tap settles.
 */
(function () {
	'use strict';

	var CFG = window.DCC_WL_GUIDE || {};
	var I18N = CFG.i18n || {};

	var root = document.querySelector('[data-dccwl-gp]');
	if (!root) { return; }

	var list = root.querySelector('[data-dccwl-gp-list]');
	var top = root.querySelector('[data-dccwl-gp-top]');
	var pane = root.querySelector('[data-dccwl-gp-pane]');
	var statusEl = root.querySelector('[data-dccwl-gp-status]');
	var emptyEl = root.querySelector('[data-dccwl-gp-empty]');
	var searchEl = root.querySelector('[data-dccwl-gp-search]');
	var clearEl = root.querySelector('[data-dccwl-gp-clear]');
	if (!list) { return; }

	var items = [].slice.call(list.querySelectorAll('[data-dccwl-gp-item]'));
	if (!items.length) { return; }

	/*
	 * LET THE PINNED CONTROLS PIN (1.47.2). Found on live with the live-swap
	 * check: the theme wraps the page in three boxes with `overflow: hidden`
	 * (main.main, .one-column and the div inside it). `hidden` makes a box a
	 * SCROLL CONTAINER, and a sticky element sticks to its nearest scroll
	 * container — which here never scrolls — so the guide's pinned controls
	 * and the desktop pane have never stuck on live; they scrolled away.
	 *
	 * `overflow: clip` clips exactly as `hidden` does but is not a scroll
	 * container, so sticky works again. `hidden` also made each box a block
	 * formatting context, which `clip` does not, so a plain block gets
	 * `display: flow-root` to keep it: nothing inside moves. Only boxes that
	 * are `hidden` on BOTH axes, only up to <body> (never the viewport), only
	 * on this page, and only where the browser knows `clip`; anywhere else
	 * the page is exactly as before.
	 */
	(function unclipAncestors() {
		if (!window.CSS || !CSS.supports || !CSS.supports('overflow', 'clip')) { return; }
		for (var e = root.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
			var cs = getComputedStyle(e);
			if ('hidden' !== cs.overflowX || 'hidden' !== cs.overflowY) { continue; }
			if ('block' === cs.display) { e.style.display = 'flow-root'; }
			e.style.overflow = 'clip';
			e.setAttribute('data-dccwl-unclipped', '');
		}
	})();

	/* "Most Recorded Here" (1.47.0): server-rendered into the pane. Held by
	 * reference so it can be put back when the pane is emptied by a width
	 * change; it is never rebuilt. */
	var spot = pane ? pane.querySelector('[data-dccwl-gp-spot]') : null;

	var state = { scope: 'here', group: 'all', q: '', openKey: null };

	var wide = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
	var reduced = window.matchMedia
		? window.matchMedia('(prefers-reduced-motion: reduce)').matches
		: false;

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text !== undefined && text !== null) { n.textContent = text; }
		return n;
	}

	function fmt(tpl, v) { return String(tpl || '').replace(/%d|%s/, String(v)); }

	/* ------------------------------------------------------------------
	 * SEARCH MATCHING, THE SAME RULES THE /explore/ SEARCH USES (1.21.0).
	 *
	 * Substring, every word in any order, punctuation-insensitive, over the
	 * common AND scientific names. Deliberately NO letters-in-order
	 * fallback: on the other search it made "coot" return the cottonmouth,
	 * and a guest typing four letters of a bird and getting a pit viper has
	 * been failed by the search however forgiving it was trying to be.
	 * ------------------------------------------------------------------ */
	function norm(s) {
		return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
	}

	function matches(item, words) {
		if (!words.length) { return true; }
		var hay = item.__hay || (item.__hay =
			norm(item.getAttribute('data-name') + ' ' + item.getAttribute('data-sci')));
		for (var i = 0; i < words.length; i++) {
			if (hay.indexOf(words[i]) === -1) { return false; }
		}
		return true;
	}

	/* ------------------------------------------------------------------
	 * ONE PASS DECIDES EVERY ROW'S VISIBILITY, in this order: the scope
	 * switch, then the group pill, then the search.
	 *
	 * THE SEARCH DOES NOT OVERRIDE THE SCOPE, and that is the one place
	 * this differs from /explore/'s search (which overrides the month).
	 * "Seen Here" is a statement about evidence, not a convenience filter:
	 * a species with no record within 40 km must not appear under it
	 * because somebody typed its name. It DOES override nothing else —
	 * the pill is left alone too, so a search inside Birds searches birds.
	 * ------------------------------------------------------------------ */
	function refresh() {
		var words = state.q ? norm(state.q).split(' ').filter(Boolean) : [];
		var shown = 0;
		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			var ok = ('wider' === state.scope
					? true                                   /* every species */
					: 'here' === it.getAttribute('data-scope'))
				&& ('all' === state.group || state.group === it.getAttribute('data-group'))
				&& matches(it, words);
			/* WRITE ONLY WHAT CHANGES. Setting `.hidden` to the value it
			 * already has still invalidates the row's style, and 402 of
			 * those was most of a 479 ms task on a throttled phone. */
			if (it.hidden === ok) { it.hidden = !ok; }
			if (ok) { shown += 1; }
		}
		counts();
		say(shown, words.length > 0);
		atEnd();
		return shown;
	}

	/*
	 * THE COUNTS ARE COUNTED, not read from a table.
	 *
	 * A pill's number is a promise about what pressing it shows (the 1.38.1
	 * rule), so it is derived from the same attributes the filter reads. It
	 * ignores the SEARCH on purpose: a pill says how many birds there are,
	 * not how many birds match what you have typed so far, which would have
	 * every number flickering as a guest types.
	 */
	function counts() {
		var tally = { all: 0 };
		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			if ('wider' !== state.scope && 'here' !== it.getAttribute('data-scope')) { continue; }
			var g = it.getAttribute('data-group');
			tally.all += 1;
			tally[g] = (tally[g] || 0) + 1;
		}
		root.querySelectorAll('[data-dccwl-gp-count]').forEach(function (n) {
			var key = n.getAttribute('data-dccwl-gp-count');
			n.textContent = String(tally[key] || 0);
			/* A group with nothing in it under this scope cannot be chosen:
			 * a control that shows an empty list is not offered (1.31.0). */
			var pill = n.closest('[data-dccwl-gp-group]');
			if (pill && 'all' !== key) { pill.hidden = !tally[key]; }
		});
		if (searchEl) {
			searchEl.placeholder = fmt(
				'wider' === state.scope ? I18N.searchWider : I18N.searchHere,
				tally.all
			);
		}
	}

	/* What the result line says. Silent unless a search is running: with no
	 * search the pill's own count already says how many there are. */
	function say(shown, searching) {
		if (!statusEl || !emptyEl) { return; }
		if (!searching) {
			statusEl.hidden = true;
			statusEl.textContent = '';
			emptyEl.hidden = true;
			emptyEl.textContent = '';
			return;
		}
		if (!shown) {
			statusEl.hidden = true;
			statusEl.textContent = '';
			emptyEl.hidden = false;
			emptyEl.textContent = fmt(I18N.none, state.q);
			return;
		}
		emptyEl.hidden = true;
		emptyEl.textContent = '';
		statusEl.hidden = false;
		statusEl.textContent = 1 === shown ? (I18N.countOne || '') : fmt(I18N.count, shown);
	}

	/* ------------------------------------------------------------------
	 * OPENING A SPECIES.
	 *
	 * The content is a CLONE of the row's own entry, never a rebuild: the
	 * sheet shows the words the page already carries. Two things are added
	 * from the row's attributes, because the entry does not hold them — the
	 * photograph, and its credit, which is a licence obligation wherever a
	 * photograph is shown at size (1.24.0).
	 * ------------------------------------------------------------------ */
	function contentFor(item) {
		var frag = document.createDocumentFragment();
		var photo = item.getAttribute('data-photo');
		if (photo) {
			var img = document.createElement('img');
			img.className = 'dccwl-gp-photo';
			img.src = photo;
			img.alt = '';
			img.loading = 'lazy';
			img.decoding = 'async';
			frag.appendChild(img);
		}

		var entry = item.querySelector('[data-dccwl-gp-entry]');
		var clone = entry ? entry.cloneNode(true) : null;
		if (clone) {
			clone.removeAttribute('data-dccwl-gp-entry');
			/* The two tiles the mockup asks for, lifted out of the prose and
			 * put at the top. Found by their machine names, never by their
			 * translated labels. */
			var where = clone.querySelector('.dccwl-fg-line[data-k="where"]');
			var best = clone.querySelector('.dccwl-fg-line[data-k="best"]');
			if (where || best) {
				var tiles = el('div', 'dccwl-gp-tiles');
				if (where) { tiles.appendChild(where); }
				if (best) { tiles.appendChild(best); }
				var art = clone.querySelector('.dccwl-fg');
				if (art) {
					var firstP = art.querySelector('.dccwl-fg-fact');
					art.insertBefore(tiles, firstP || art.firstChild);
				} else {
					clone.insertBefore(tiles, clone.firstChild);
				}
			}
			frag.appendChild(clone);
		}

		var credit = item.getAttribute('data-credit');
		if (credit) {
			var p = el('p', 'dccwl-gp-credit');
			var url = item.getAttribute('data-credit-url');
			if (url && /^https?:\/\//i.test(url)) {
				var a = el('a', null, credit);
				a.href = url;
				a.rel = 'noopener';
				p.appendChild(a);
			} else {
				p.textContent = credit;
			}
			frag.appendChild(p);
		}
		return frag;
	}

	function markOpen(item) {
		items.forEach(function (x) {
			x.classList.toggle('dccwl-gp-item-on', x === item);
		});
	}

	function openInPane(item) {
		if (!pane) { return; }
		/*
		 * HOLD THE PANE'S HEIGHT UNTIL THE NEW PHOTOGRAPH ARRIVES (1.47.0).
		 * The photo has no height until it loads, so for that moment the
		 * pane was shorter than the list and the page lost height under
		 * it: scrolled to the bottom, the page was clamped up (measured,
		 * 23px at 1440). Holding the old height keeps the page still; it
		 * is released when the photo has its own.
		 */
		var held = pane.hidden ? 0 : pane.offsetHeight;
		if (held) { pane.style.minHeight = held + 'px'; }
		pane.textContent = '';
		pane.appendChild(contentFor(item));
		var photo = pane.querySelector('img.dccwl-gp-photo');
		var release = function () { pane.style.minHeight = ''; atEnd(); };
		if (held && photo && !photo.complete) {
			photo.addEventListener('load', release, { once: true });
			photo.addEventListener('error', release, { once: true });
		} else {
			pane.style.minHeight = '';
		}
		pane.hidden = false;
		/* The pane's name follows what it holds: the spotlight names itself
		 * by its heading; a species is "the species you chose". */
		pane.removeAttribute('aria-labelledby');
		pane.setAttribute('aria-label', pane.getAttribute('data-dccwl-gp-pane-label') || '');
		list.classList.add('dccwl-gp-list-split');
		markOpen(item);
		state.openKey = item.getAttribute('data-key');
		atEnd();
	}

	/* Put "Most Recorded Here" back (a wide window with nothing open). */
	function showSpotlight() {
		if (!pane || !spot) { return; }
		if (spot.parentNode !== pane) {
			pane.textContent = '';
			pane.appendChild(spot);
		}
		pane.removeAttribute('aria-label');
		pane.setAttribute('aria-labelledby', 'dccwl-gp-spot-h');
		pane.hidden = false;
		list.classList.add('dccwl-gp-list-split');
		atEnd();
	}

	/*
	 * THE SCROLL BOX'S CUE (1.47.0). With the pane in use the list scrolls
	 * inside its own box, and its bottom edge fades to say so — the same
	 * 34px mask and the same `dccwl-at-end` switch as /explore/'s spotlight
	 * strip. Scrolled to the end, or filtered short enough to fit, there is
	 * nothing more to cue and the fade goes. Nothing here traps the wheel:
	 * the box sets no overscroll-behavior, so a wheel that reaches its end
	 * carries on into the page.
	 */
	function atEnd() {
		var max = list.scrollHeight - list.clientHeight;
		list.classList.toggle('dccwl-at-end', max <= 4 || list.scrollTop >= max - 4);
	}
	list.addEventListener('scroll', atEnd, { passive: true });

	function openInSheet(item, opener) {
		if (!window.DCCWL_Sheet) { return false; }
		state.openKey = item.getAttribute('data-key');
		window.DCCWL_Sheet.open({
			title: item.getAttribute('data-name') || '',
			appClasses: CFG.appClasses || 'dccwl-app',
			closeLabel: I18N.close,
			closeAllLabel: I18N.closeAll,
			opener: opener || null,
			build: function (body) { body.appendChild(contentFor(item)); },
			onClose: function () {
				state.openKey = null;
				markOpen(null);
			}
		});
		markOpen(item);
		return true;
	}

	function openSpecies(item, opener) {
		if (!item) { return; }
		if (wide && wide.matches && pane) { openInPane(item); return; }
		if (!openInSheet(item, opener)) {
			/* No sheet script, for whatever reason: fall back to the fold
			 * the markup already is, so a tap still shows the entry. */
			var d = item.querySelector('[data-dccwl-gp-details]');
			if (d) { d.open = true; }
		}
	}

	/* ------------------------------------------------------------------
	 * WIRING
	 * ------------------------------------------------------------------ */
	root.querySelectorAll('[data-dccwl-gp-scope]').forEach(function (btn) {
		btn.addEventListener('click', function () {
			var want = btn.getAttribute('data-dccwl-gp-scope');
			if (want === state.scope) { return; }
			state.scope = want;
			root.querySelectorAll('[data-dccwl-gp-scope]').forEach(function (b) {
				b.setAttribute('aria-pressed',
					b.getAttribute('data-dccwl-gp-scope') === want ? 'true' : 'false');
			});
			refresh();
		});
	});

	root.querySelectorAll('[data-dccwl-gp-group]').forEach(function (btn) {
		btn.addEventListener('click', function () {
			state.group = btn.getAttribute('data-dccwl-gp-group');
			root.querySelectorAll('[data-dccwl-gp-group]').forEach(function (b) {
				b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
			});
			refresh();
		});
	});

	if (searchEl) {
		searchEl.addEventListener('input', function () {
			state.q = searchEl.value || '';
			if (clearEl) { clearEl.hidden = '' === state.q; }
			refresh();
		});
	}
	if (clearEl) {
		clearEl.addEventListener('click', function () {
			if (!searchEl) { return; }
			searchEl.value = '';
			state.q = '';
			clearEl.hidden = true;
			refresh();
			searchEl.focus();
		});
	}

	/*
	 * ONE LISTENER ON THE LIST, not 402 on the rows. Also the only place a
	 * row's default fold is prevented: with the script running, a row opens
	 * the sheet (or the pane) instead of expanding in place, and the
	 * <details> stays closed so the browser keeps hiding the entry itself.
	 */
	list.addEventListener('click', function (ev) {
		var summary = ev.target && ev.target.closest
			? ev.target.closest('.dccwl-gp-row')
			: null;
		if (!summary) { return; }
		/* A link inside the entry must still work; a click on the row's own
		 * chrome must not follow one. */
		if (ev.target.closest('a')) { return; }
		ev.preventDefault();
		var item = summary.closest('[data-dccwl-gp-item]');
		openSpecies(item, summary);
	});

	/*
	 * THE FOUR CARDS (1.47.0). Each is a real link to the species' anchor —
	 * with no script, or with a modifier key, it behaves as one. Otherwise
	 * it opens the entry in the pane in place: no hash jump, so neither the
	 * page nor the list moves under the guest. The card it was is replaced,
	 * so focus goes to the pane rather than falling back to the page.
	 */
	if (pane) {
		pane.addEventListener('click', function (ev) {
			var card = ev.target && ev.target.closest
				? ev.target.closest('[data-dccwl-gp-spot-key]')
				: null;
			if (!card) { return; }
			if (ev.defaultPrevented || ev.button !== 0
				|| ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) { return; }
			var key = card.getAttribute('data-dccwl-gp-spot-key') || '';
			var item = list.querySelector('[data-key="' + key.replace(/"/g, '') + '"]');
			if (!item) { return; }
			ev.preventDefault();
			openSpecies(item, card);
			if (wide && wide.matches) {
				pane.setAttribute('tabindex', '-1');
				try { pane.focus({ preventScroll: true }); } catch (e) { pane.focus(); }
			}
		});
	}

	/* Keyboard: a <summary> answers Enter and Space itself by toggling, and
	 * the click handler above sees that as a click — so nothing extra is
	 * needed, and adding a keydown handler would open twice. */

	/* ------------------------------------------------------------------
	 * THE PINNED BLOCK'S HEIGHT, MEASURED (for the desktop pane's offset).
	 * Re-measured whenever it changes size rather than once: the pills wrap
	 * differently with the language, the font and the width.
	 * ------------------------------------------------------------------ */
	function measureTop() {
		if (!top) { return; }
		/* The pane is the ONLY reader of this token, and it exists only at
		 * 900px and up. On a phone the measurement is a forced layout of
		 * the whole list for a value nothing uses. */
		if (!(wide && wide.matches)) { return; }
		var h = Math.round(top.getBoundingClientRect().height);
		root.style.setProperty('--dccwl-gp-top-h', h + 'px');
	}
	/*
	 * NEVER BEFORE FIRST PAINT. getBoundingClientRect() here was the forced
	 * reflow DevTools flagged on live: it made the browser lay out 4,600
	 * nodes synchronously, inside the script, before anything had been
	 * painted. Two animation frames from now the first frame has shipped
	 * and the browser has already done this layout for its own reasons,
	 * so the read is free.
	 */
	function afterPaint(fn) {
		if (!window.requestAnimationFrame) { setTimeout(fn, 0); return; }
		window.requestAnimationFrame(function () { window.requestAnimationFrame(fn); });
	}
	/*
	 * THE PINNED CONTROLS SIT UNDER THE THEME'S PINNED BAR (1.47.2, Rob's yes).
	 *
	 * From 1024px the theme's menu (`.site-header-bottom-fixed` on live) pins
	 * itself to the top — but only once the page has scrolled past it: at the
	 * top it is static, 10-72px down, and it turns `position: fixed` (0-63px)
	 * in the theme's own scroll handler. So the offset is MEASURED, on load
	 * and on every scroll (a frame at most), with the probe /explore/'s
	 * canal.js uses: the fixed or sticky boxes over the top edge, OUTSIDE
	 * this guide (its own pinned block must never push itself down).
	 * `elementsFromPoint`, all of them, so a bar is found whichever of the two
	 * is painted on top. Below 1024 the theme's menu scrolls away and the
	 * offset is 0, as Rob asked.
	 */
	var themeWide = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : null;
	var stickyLast = -1;

	function themeBarsBottom() {
		var w = window.innerWidth || 0;
		var h = window.innerHeight || 0;
		if (!w || !h || !document.elementsFromPoint) { return 0; }
		var best = 0;
		[0.5, 0.08, 0.92].forEach(function (fx) {
			var x = Math.round(w * fx);
			var y = 0;
			for (var n = 0; n < 4; n++) {
				var b = 0;
				var hits = document.elementsFromPoint(x, y + 1);
				for (var i = 0; i < hits.length && !b; i++) {
					for (var e = hits[i]; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
						if (root.contains(e)) { break; }
						var pos = getComputedStyle(e).position;
						if ('fixed' !== pos && 'sticky' !== pos) { continue; }
						var r = e.getBoundingClientRect();
						if (r.top <= y + 1 && r.bottom > y + 1 && r.bottom < h * 0.4) { b = Math.ceil(r.bottom); }
						break;
					}
				}
				if (b <= y) { break; }
				y = b;
			}
			best = Math.max(best, y);
		});
		return best;
	}

	function applySticky() {
		var px = (themeWide && themeWide.matches) ? themeBarsBottom() : 0;
		if (px === stickyLast) { return; }
		stickyLast = px;
		root.style.setProperty('--dccwl-sticky-offset', px + 'px');
	}

	/*
	 * FOLLOWED, NOT SAMPLED. On live the theme's bar is pinned in the
	 * theme's own scroll handler and then ANIMATES into place — measured at
	 * -13..50px while sliding, 0..63px at rest. A single reading at the
	 * scroll event caught it mid-slide (or not yet fixed) and nothing read it
	 * again. So after every scroll the offset follows it, frame by frame, for
	 * 0.7s; and any CSS transition or animation ending on the page asks once
	 * more. Below 1024 applySticky() returns 0 without probing, so a phone
	 * pays nothing.
	 */
	var followUntil = 0;
	var following = false;
	var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
	function follow() {
		applySticky();
		if (Date.now() < followUntil) { raf(follow); } else { following = false; }
	}
	function queueSticky() {
		followUntil = Date.now() + 700;
		if (following) { return; }
		following = true;
		raf(follow);
	}
	document.addEventListener('transitionend', queueSticky, true);
	document.addEventListener('animationend', queueSticky, true);

	afterPaint(function () {
		measureTop();
		applySticky();
		window.addEventListener('scroll', queueSticky, { passive: true });
		window.addEventListener('resize', queueSticky);
		if (wide && wide.matches) { atEnd(); }
		if (window.ResizeObserver && top) {
			new window.ResizeObserver(measureTop).observe(top);
		} else {
			window.addEventListener('resize', measureTop);
		}
	});

	/* A narrow window that becomes wide (or the other way) moves the open
	 * species between the sheet and the pane rather than leaving it in a
	 * container the layout no longer uses. */
	if (wide && wide.addEventListener) {
		wide.addEventListener('change', function () {
			var openItem = state.openKey
				? list.querySelector('[data-key="' + state.openKey + '"]')
				: null;
			if (!openItem) {
				if (spot) { showSpotlight(); return; }
				if (pane) { pane.hidden = true; }
				list.classList.remove('dccwl-gp-list-split');
				return;
			}
			if (wide.matches) {
				if (window.DCCWL_Sheet && window.DCCWL_Sheet.isOpen()) { window.DCCWL_Sheet.close(false); }
				openInPane(openItem);
			} else {
				if (pane) { pane.hidden = true; pane.textContent = ''; }
				list.classList.remove('dccwl-gp-list-split');
				openInSheet(openItem, null);
			}
		});
	}

	/* ------------------------------------------------------------------
	 * DEEP LINKS: #dccwl-fl-<key> OPENS THAT SPECIES.
	 *
	 * The id is on the row, so the browser has already scrolled to it; this
	 * is what makes the link do what the Director's brief asks — "opens
	 * that species there" — rather than merely landing beside it.
	 *
	 * IT ALSO CLEARS THE FILTERS IT WOULD OTHERWISE FIGHT. A link to a
	 * Wider Florida species arrives on a page showing Seen Here, where its
	 * row is hidden: without this, the one thing the link promised is the
	 * one thing that does not happen.
	 * ------------------------------------------------------------------ */
	function fromHash(hash) {
		var prefix = CFG.anchor || 'dccwl-fl-';
		var h = String(hash || '').replace(/^#/, '');
		if (!h || h.indexOf(prefix) !== 0) { return null; }
		return list.querySelector('[data-key="' + h.slice(prefix.length).replace(/"/g, '') + '"]');
	}

	function openFromHash(hash, scroll) {
		var item = fromHash(hash);
		if (!item) { return false; }
		if ('here' !== item.getAttribute('data-scope') && 'wider' !== state.scope) {
			var w = root.querySelector('[data-dccwl-gp-scope="wider"]');
			if (w) { w.click(); }
		}
		if ('all' !== state.group && state.group !== item.getAttribute('data-group')) {
			var all = root.querySelector('[data-dccwl-gp-group="all"]');
			if (all) { all.click(); }
		}
		item.hidden = false;
		if (scroll) {
			item.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
		}
		openSpecies(item, null);
		return true;
	}

	/*
	 * NO refresh() ON LOAD (1.46.1). The server rendered the default view —
	 * the seven Wider Florida rows arrive `hidden`, the pill counts arrive
	 * filled, the placeholder arrives worded — so there is nothing for the
	 * first pass to change, and a pass that changes nothing still costs a
	 * style recalculation over 402 rows. The first refresh() runs on the
	 * first tap, when there is a change to make.
	 *
	 * The deep link runs after the first frame: it is a scroll and a sheet,
	 * both of which can wait the ~16 ms it takes for the page to be on
	 * screen, and neither should stand between the HTML and its paint.
	 */
	/*
	 * `#credits` OPENS THE PHOTO CREDITS (1.47.0). They ship folded, and a
	 * browser does not open a closed <details> for a fragment naming the
	 * <details> itself — it scrolls to the summary and leaves it shut
	 * (measured). The explore widget's "Photo Credits" link and every
	 * sheet's arrive here with that hash, so it is opened for them. The
	 * browser has already scrolled to it; opening expands it downwards, so
	 * nothing above it moves.
	 */
	function openCredits(hash) {
		if ('#credits' !== String(hash || '')) { return false; }
		var d = document.getElementById('credits');
		if (d && 'DETAILS' === d.tagName) {
			d.open = true;
			whenSettled(function () { settleCredits(d); });
		}
		return true;
	}

	/*
	 * AND THEN LAND ON IT (1.47.1).
	 *
	 * Opening was not enough. On live the browser's own jump to #credits is
	 * taken against a layout that is still arriving — 395 rows at their
	 * estimated height, the theme's header photo, images — and it ended
	 * 2,142px PAST the summary at 390. At 1440 it landed at 1px, under the
	 * theme's pinned menu. So once the page has loaded and painted, the
	 * summary is put at the top of what the guest can actually see: below
	 * every fixed or sticky bar covering the top edge (the theme's menu, the
	 * guide's own pinned controls), MEASURED by hit-testing, never typed.
	 *
	 * For a few seconds afterwards it is put back if the layout above moves
	 * it — and the watch ends the moment the guest scrolls, taps or types,
	 * because a page that fights its reader is worse than one that missed.
	 *
	 * EVERY MOVE IS AN INSTANT JUMP, never an animation, whatever the theme's
	 * `scroll-behavior` says: it is a correction, and an instant one is what
	 * prefers-reduced-motion asks for.
	 */
	var creditsRun = 0;

	function whenSettled(fn) {
		var go = function () { afterPaint(fn); };
		if ('complete' === document.readyState) { go(); return; }
		window.addEventListener('load', go, { once: true });
	}

	function jumpTo(y) {
		try {
			window.scrollTo({ top: y, left: 0, behavior: 'instant' });
		} catch (e) {
			window.scrollTo(0, y);
		}
	}

	/* The bottom of the fixed or sticky bars stacked over the top edge at x,
	 * or 0. The canal.js probe, walking down through bars that stack (a
	 * theme menu over the guide's pinned controls). A box covering most of
	 * the screen is an overlay, not a bar, and does not count. */
	function barsBottom(x) {
		var h = window.innerHeight || 0;
		var y = 0;
		for (var n = 0; n < 5; n++) {
			var hit = document.elementFromPoint(x, y + 1);
			var b = 0;
			for (var e = hit; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
				var pos = getComputedStyle(e).position;
				if ('fixed' !== pos && 'sticky' !== pos) { continue; }
				var r = e.getBoundingClientRect();
				if (r.top <= y + 1 && r.bottom > y + 1 && r.bottom < h * 0.75) { b = Math.ceil(r.bottom); }
				break;
			}
			if (b <= y) { break; }
			y = b;
		}
		return y;
	}

	/* Where the summary's top should be right now: under every bar that
	 * covers the top edge at its x. Measured fresh each time it is asked,
	 * because the bars change WITH the scroll (1.47.2): the theme's menu is
	 * static at the top of the page and only turns fixed in the theme's own
	 * scroll handler, a frame after any jump. 1.47.1 measured before that
	 * frame, saw no bar, and placed the summary under it on live. */
	function creditsTarget(s) {
		var r = s.getBoundingClientRect();
		return barsBottom(Math.round(r.left + r.width / 2));
	}

	/* Put the summary where creditsTarget() says. */
	function placeCredits(d) {
		var s = d.querySelector('summary') || d;
		jumpTo(window.pageYOffset + s.getBoundingClientRect().top - creditsTarget(s));
	}

	function settleCredits(d) {
		var run = ++creditsRun;
		var stopped = false;
		var until = Date.now() + 4000;
		var stop = function () { stopped = true; };
		['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (t) {
			window.addEventListener(t, stop, { once: true, passive: true });
		});
		placeCredits(d);
		/* Every tick asks again where the summary SHOULD be — the bars may
		 * have changed since the jump — and corrects only if it is not
		 * there. Quiet once it is. */
		var tick = function () {
			if (stopped || run !== creditsRun || !d.open || Date.now() > until) { return; }
			var s = d.querySelector('summary') || d;
			if (Math.abs(Math.round(s.getBoundingClientRect().top) - creditsTarget(s)) > 2) { placeCredits(d); }
			setTimeout(tick, 120);
		};
		setTimeout(tick, 120);
	}

	afterPaint(function () {
		if (!openCredits(window.location.hash)) { openFromHash(window.location.hash, false); }
	});
	window.addEventListener('hashchange', function () {
		if (!openCredits(window.location.hash)) { openFromHash(window.location.hash, true); }
	});
})();
