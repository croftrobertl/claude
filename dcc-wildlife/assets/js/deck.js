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

	function attach(list, i18n) {
		if (!list || list.getAttribute('data-dccwl-deck-init')) { return; }
		list.setAttribute('data-dccwl-deck-init', '1');
		i18n = i18n || {};
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

	function refresh(list, i18n) {
		if (!list || !list.getAttribute('data-dccwl-deck-init')) { return; }
		i18n = i18n || {};
		var nav = list.nextElementSibling;
		if (!nav || !nav.classList.contains('dccwl-deck-nav')) { return; }
		var tiles = visibleTiles(list).length;
		// Nothing to page through: the controls would be furniture.
		var overflows = list.scrollWidth > list.clientWidth + 4;
		nav.hidden = !overflows || tiles === 0;
		if (nav.hidden) { return; }

		var prev = nav.querySelector('.dccwl-deck-prev');
		var next = nav.querySelector('.dccwl-deck-next');
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
		nav.querySelector('.dccwl-deck-status').textContent = shown.length
			? fmt(i18n.deckPos || '%1$s–%2$s of %3$s', shown[0].i, shown[shown.length - 1].i, tiles)
			: '';
	}

	window.DCCWL_Deck = { attach: attach, refresh: refresh, refreshSoon: refreshSoon };
}());
