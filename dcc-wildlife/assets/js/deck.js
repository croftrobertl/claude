/**
 * DCC Wildlife — the tile deck (1.23.0).
 *
 * Turns an existing tile list into something you can swipe sideways, WITHOUT
 * touching the tiles themselves: no clones, no virtualisation, no new tile
 * markup. The list keeps every <li> it already had, in the order it already
 * had them, and native overflow scrolling does the swiping. That is the whole
 * trick, and it is what makes the accessibility fall out for free:
 *
 *   - A screen reader walks the same DOM it always did. Nothing is removed
 *     from the accessibility tree when it scrolls out of view, so every
 *     species is still reachable whatever the deck is showing.
 *   - Tab still moves through the tiles in order, and the browser scrolls a
 *     focused tile into view by itself, which keeps the deck in step.
 *   - The visible Previous/Next buttons are ordinary buttons. Swipe is an
 *     addition, never the only way through — the failure this feature invites
 *     is becoming swipe-only, and a page of tiles you cannot reach without a
 *     touchscreen is worse than the grid it replaced.
 *   - Under prefers-reduced-motion the buttons still move the deck; they just
 *     jump instead of gliding.
 *
 * The one thing it adds per list is its own control row (a wrapper, two
 * buttons and a status line). Tile count is untouched.
 */
(function () {
	'use strict';

	var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text !== undefined && text !== null) { n.textContent = text; }
		return n;
	}

	function fmt(template) {
		var args = Array.prototype.slice.call(arguments, 1);
		var auto = 0;
		return String(template).replace(/%(\d+\$)?[sd]/g, function (m, pos) {
			return String(args[pos ? parseInt(pos, 10) - 1 : auto++]);
		});
	}

	function visibleTiles(list) {
		return Array.prototype.filter.call(list.children, function (li) { return !li.hidden; });
	}

	/** One "page" is whatever is on screen; scrolling by that is what a swipe does. */
	function page(list) {
		return Math.max(120, list.clientWidth);
	}

	function atStart(list) { return list.scrollLeft <= 2; }
	function atEnd(list) { return list.scrollLeft >= list.scrollWidth - list.clientWidth - 2; }

	function scrollByPage(list, dir) {
		var opts = { left: dir * page(list), behavior: reduced ? 'auto' : 'smooth' };
		if (list.scrollBy) { list.scrollBy(opts); } else { list.scrollLeft += opts.left; }
	}

	/* Move FOCUS, not just the viewport: an arrow key that scrolled the deck
	 * but left focus behind would strand a keyboard user on a tile they can no
	 * longer see. */
	function focusStep(list, from, dir) {
		var tiles = visibleTiles(list);
		var i = tiles.indexOf(from.closest('li'));
		if (i < 0) { return false; }
		var next = tiles[i + dir];
		if (!next) { return false; }
		var btn = next.querySelector('button, a, [tabindex]');
		if (!btn) { return false; }
		btn.focus();
		return true;
	}

	/* Per-list state, so setContext() and jumpTo() can be called later without
	 * the caller having to hand back the i18n table it passed to attach(). */
	var known = new WeakMap();

	/**
	 * Replace what the position line says, without touching how it is measured.
	 *
	 * The sub-group chips need "Wading birds · 2/3" where the deck would say
	 * "7–12 of 38". Both are true; the chip's version is the one that answers
	 * the question the guest just asked. Pass null to hand the line back.
	 */
	function setContext(list, fn) {
		if (!list) { return; }
		var st = known.get(list);
		if (!st) { return; }
		st.context = (typeof fn === 'function') ? fn : null;
		refresh(list, st.i18n);
	}

	/** Scroll a tile to the start of the view. Returns false if it is not here. */
	function jumpTo(list, li) {
		if (!list || !li || li.parentNode !== list) { return false; }
		var lb = list.getBoundingClientRect();
		var tb = li.getBoundingClientRect();
		var left = list.scrollLeft + (tb.left - lb.left);
		if (list.scrollTo) {
			list.scrollTo({ left: left, behavior: reduced ? 'auto' : 'smooth' });
		} else {
			list.scrollLeft = left;
		}
		return true;
	}

	function attach(list, i18n) {
		if (!list || list.getAttribute('data-dccwl-deck-init')) { return; }
		list.setAttribute('data-dccwl-deck-init', '1');
		i18n = i18n || {};
		known.set(list, { i18n: i18n, context: null });
		list.classList.add('dccwl-deck');

		var nav = el('div', 'dccwl-deck-nav');
		var prev = el('button', 'dccwl-deck-btn dccwl-deck-prev');
		prev.type = 'button';
		prev.setAttribute('aria-label', i18n.deckPrev || 'Previous');
		prev.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		var next = el('button', 'dccwl-deck-btn dccwl-deck-next');
		next.type = 'button';
		next.setAttribute('aria-label', i18n.deckNext || 'Next');
		next.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		// Politely announced, so a screen-reader user knows the deck moved and
		// how much is left, without the position stealing focus.
		var status = el('p', 'dccwl-deck-status');
		status.setAttribute('role', 'status');
		status.setAttribute('aria-live', 'polite');

		nav.appendChild(prev);
		nav.appendChild(status);
		nav.appendChild(next);
		list.parentNode.insertBefore(nav, list.nextSibling);

		prev.addEventListener('click', function () { scrollByPage(list, -1); });
		next.addEventListener('click', function () { scrollByPage(list, 1); });

		list.addEventListener('keydown', function (e) {
			if ('ArrowRight' !== e.key && 'ArrowLeft' !== e.key) { return; }
			var t = e.target;
			if (!t || !t.closest || !t.closest('li')) { return; }
			if (focusStep(list, t, 'ArrowRight' === e.key ? 1 : -1)) { e.preventDefault(); }
		});

		list.addEventListener('scroll', function () { refresh(list, i18n); }, { passive: true });
		window.addEventListener('resize', function () { refresh(list, i18n); });

		/* A deck is very often built while its panel is still hidden — the hub
		 * fills the water cards before the guest has opened the water panel —
		 * and a hidden element measures zero, so the controls would decide
		 * there was nothing to page through and stay away for good. Watching
		 * the box means the deck sizes itself the moment it actually has a
		 * size, whatever revealed it. */
		if (window.ResizeObserver) {
			var ro = new ResizeObserver(function () { refreshSoon(list, i18n); });
			ro.observe(list);
		}
		refreshSoon(list, i18n);
	}

	/* Measure on the next frame, and once more after the panel transition has
	 * had time to finish. A deck is usually revealed by a panel that animates
	 * in, and a rect read mid-flight gave a position line that was wrong and
	 * then never corrected, because nothing scrolls afterwards to trigger a
	 * second look. */
	function refreshSoon(list, i18n) {
		var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
		raf(function () { refresh(list, i18n); });
		setTimeout(function () { refresh(list, i18n); }, 400);
	}

	/* ==================================================================
	 * NO DECK LEAVES AN EMPTY COLUMN (1.37.1 — Rob's ruling, 2026-10-03).
	 *
	 * The row count is fixed by CSS: three on a phone. A deck with THREE
	 * matches therefore filled one column top to bottom and left the second
	 * empty — which is what the Website Director measured on the Safety deck
	 * for "snake" (Eastern Diamondback, Dusky Pygmy Rattlesnake, Eastern
	 * Coral Snake, stacked in the left column). Nothing was broken in the
	 * grid; three items in three rows IS one column. The policy was wrong.
	 *
	 * So the rows now follow the matches: ceil(n / columns that fit), capped
	 * at the CSS row count, never below one. Three matches across two columns
	 * becomes two rows — [2, 1] — and the right column is in use.
	 *
	 * THE DECLARED COUNT IS RE-READ EVERY TIME, WITH OUR OVERRIDE TAKEN OFF
	 * FIRST, and it is never cached. Caching it was the first version of this
	 * and it was wrong twice over: the first refresh can run while the panel
	 * is still hidden, where the grid reports whatever it likes, and a cached
	 * number also survives a breakpoint change that was supposed to alter it.
	 * The deck came back with a base of 2 where the stylesheet says 3.
	 * Explicit tracks are reported even when empty, so reading them with the
	 * override removed gives the stylesheet's own answer — as long as the
	 * element is actually laid out, which is what the width guards are for.
	 */
	function fitRows(list) {
		var items = visibleTiles(list);
		if (!items.length || !list.clientWidth) { return; }
		var w = items[0].getBoundingClientRect().width;
		if (!w) { return; }

		list.style.removeProperty('--dccwl-deck-rows');
		var cs = window.getComputedStyle(list);
		var tpl = (cs.gridTemplateRows || '').trim();
		var base = tpl && 'none' !== tpl ? tpl.split(/\s+/).length : 1;
		var gap = parseFloat(cs.columnGap) || 0;

		var fits = Math.max(1, Math.floor((list.clientWidth + gap) / (w + gap)));
		var want = Math.max(1, Math.min(base, Math.ceil(items.length / fits)));
		if (want < base) { list.style.setProperty('--dccwl-deck-rows', String(want)); }
	}

	function refresh(list, i18n) {
		if (!list || !list.getAttribute('data-dccwl-deck-init')) { return; }
		i18n = i18n || {};
		if (!list.getAttribute('data-dccwl-compact')) { fitRows(list); }
		var nav = list.nextElementSibling;
		if (!nav || !nav.classList.contains('dccwl-deck-nav')) { return; }
		var tiles = visibleTiles(list).length;
		var prev = nav.querySelector('.dccwl-deck-prev');
		var next = nav.querySelector('.dccwl-deck-next');

		/*
		 * COMPACT MODE HAS NO WINDOW, SO IT MUST NOT DESCRIBE ONE (1.33.0).
		 *
		 * The list is vertical here and every species is on the page, so
		 * "1-6 of 38" is false twice over — it names a six-tile window that
		 * does not exist and implies the other 32 are somewhere else. The
		 * paging buttons go, and the line says the only thing that is true:
		 * how many species are in front of you.
		 *
		 * Driven by an attribute the view toggle sets, not by measuring
		 * overflow, because a compact row wide enough to overflow would have
		 * brought the deck's controls back with a stale measurement — which
		 * is how the wrong line was reachable at all.
		 */
		if (list.getAttribute('data-dccwl-compact')) {
			nav.hidden = 0 === tiles;
			prev.hidden = true;
			next.hidden = true;
			nav.querySelector('.dccwl-deck-status').textContent =
				0 === tiles ? '' : fmt(i18n.deckCount || '%d species', tiles);
			return;
		}
		prev.hidden = false;
		next.hidden = false;

		// Nothing to page through: the controls would be furniture.
		var overflows = list.scrollWidth > list.clientWidth + 4;
		nav.hidden = !overflows || tiles === 0;
		if (nav.hidden) { return; }

		prev.disabled = atStart(list);
		next.disabled = atEnd(list);

		/* Measured, not estimated: this line is read aloud, so "3–8 of 24" has
		 * to be the tiles actually on screen. A ratio of scroll positions was
		 * close but wrong at the edges, and a screen reader has no way to
		 * notice it is being told something approximate. */
		// Rectangles, compared where they actually are. offsetLeft looked
		// simpler and was wrong: a tile's offsetParent is not always the list,
		// so the arithmetic silently drifted on one of the two consumers.
		var box = list.getBoundingClientRect();
		var shown = visibleTiles(list).map(function (li, i) {
			var r = li.getBoundingClientRect();
			return { i: i + 1, l: r.left, r: r.right };
		}).filter(function (t) { return t.r > box.left + 1 && t.l < box.right - 1; });
		var line = shown.length
			? fmt(i18n.deckPos || '%1$s–%2$s of %3$s', shown[0].i, shown[shown.length - 1].i, tiles)
			: '';

		// A context may rewrite the line. It is handed the 1-based indices of
		// the tiles actually on screen and the total, and returning anything
		// falsy leaves the measured line alone.
		var st = known.get(list);
		if (st && st.context && shown.length) {
			var alt = st.context(shown.map(function (t) { return t.i; }), tiles);
			if (alt) { line = alt; }
		}

		nav.querySelector('.dccwl-deck-status').textContent = line;
	}

	window.DCCWL_Deck = {
		attach: attach,
		refresh: refresh,
		refreshSoon: refreshSoon,
		setContext: setContext,
		jumpTo: jumpTo
	};
}());
