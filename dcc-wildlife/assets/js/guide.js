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
 *   4. `#dccwl-fl-<key>` deep links, which open that species on arrival.
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
		pane.textContent = '';
		pane.appendChild(contentFor(item));
		pane.hidden = false;
		list.classList.add('dccwl-gp-list-split');
		markOpen(item);
		state.openKey = item.getAttribute('data-key');
	}

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
	afterPaint(function () {
		measureTop();
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
	afterPaint(function () {
		openFromHash(window.location.hash, false);
	});
	window.addEventListener('hashchange', function () {
		openFromHash(window.location.hash, true);
	});
})();
