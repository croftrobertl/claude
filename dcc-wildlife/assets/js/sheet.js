/**
 * DCC Wildlife — the sliding sheet (v1.9.0).
 *
 * ONE overlay implementation, shared by the species detail and the chain
 * map, so the drawer moves and dismisses identically wherever it opens —
 * the Guest Guide's tile -> detail pattern.
 *
 * Accessibility is the point of this module, not decoration on it:
 *   - role="dialog" aria-modal, labelled by its own title
 *   - focus moves in on open and RETURNS to the opener on close
 *   - focus is trapped while open (Tab and Shift+Tab cycle inside)
 *   - Escape, the back affordance, the scrim (outside tap) and the browser
 *     /Android back button all close it
 *   - the page behind is scroll-locked so the drawer does not drag it
 *
 * Callers pass a build(body) callback and insert their own content with
 * textContent — nothing here ever interpolates a string into innerHTML.
 * Motion is CSS; prefers-reduced-motion is honoured there.
 */
(function () {
	'use strict';

	var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
		'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

	/* Static, trusted constant — the only innerHTML in this file. */
	/* ITEM 9 (1.36.0) — the × that closes the sheet outright, drawn to the
	 * Availability Calendar's close: a 30px SVG cross, stroke-width 2.75, in
	 * the blue the rest of that plugin uses. Static trusted constant, like
	 * ICON_BACK — the only innerHTML this file permits. */
	var ICON_CLOSE = '<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true" focusable="false">' +
		'<path d="M7 7 L23 23 M23 7 L7 23" fill="none" stroke="currentColor" ' +
		'stroke-width="2.75" stroke-linecap="round"/></svg>';

	var ICON_BACK = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
		'<path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" ' +
		'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

	var host = null;
	var scrim = null;
	var sheet = null;
	var titleEl = null;
	var bodyEl = null;
	var backBtn = null;
	var closeBtn = null;

	var state = {
		open: false,
		opener: null,
		onClose: null,
		pushedHistory: false
	};

	var uid = 0;

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text !== undefined && text !== null) { n.textContent = text; }
		return n;
	}

	/* The host is built once and reused: a single sheet can be open at a
	 * time, which is also what keeps the focus trap unambiguous. */
	function ensureHost(appClasses) {
		if (host) {
			// Keep the host's theme classes in step with whichever widget
			// opened it, so the sheet inherits that instance's tokens.
			host.className = 'dccwl-sheet-host ' + appClasses;
			return;
		}

		host = el('div', 'dccwl-sheet-host ' + appClasses);
		host.setAttribute('data-dccwl-open', 'false');
		host.hidden = true;

		scrim = el('div', 'dccwl-sheet-scrim');
		scrim.addEventListener('click', function () { close(true); });

		sheet = el('div', 'dccwl-sheet');
		sheet.setAttribute('role', 'dialog');
		sheet.setAttribute('aria-modal', 'true');
		sheet.setAttribute('tabindex', '-1');

		var grip = el('div', 'dccwl-sheet-grip');
		grip.setAttribute('aria-hidden', 'true');

		var head = el('div', 'dccwl-sheet-head');
		backBtn = el('button', 'dccwl-sheet-back');
		backBtn.type = 'button';
		backBtn.innerHTML = ICON_BACK; // static trusted constant
		backBtn.addEventListener('click', function () { close(true); });

		titleEl = el('h3', 'dccwl-sheet-title');
		titleEl.id = 'dccwl-sheet-title';
		sheet.setAttribute('aria-labelledby', titleEl.id);

		/*
		 * TWO CONTROLS, TWO JOBS. The ‹ on the left keeps doing what it has
		 * always done — one step back, which for a sheet opened from a tile
		 * means closing it and handing focus to that tile. The × on the
		 * right closes the sheet outright, and it is here because that is
		 * where a guest looks for one. The title sits between them.
		 */
		closeBtn = el('button', 'dccwl-sheet-close');
		closeBtn.type = 'button';
		closeBtn.innerHTML = ICON_CLOSE; // static trusted constant
		closeBtn.addEventListener('click', function () { close(true); });

		head.appendChild(backBtn);
		head.appendChild(titleEl);
		head.appendChild(closeBtn);

		bodyEl = el('div', 'dccwl-sheet-body');

		sheet.appendChild(grip);
		sheet.appendChild(head);
		sheet.appendChild(bodyEl);
		host.appendChild(scrim);
		host.appendChild(sheet);
		document.body.appendChild(host);

		document.addEventListener('keydown', onKeydown, true);
		window.addEventListener('popstate', onPopState);
	}

	function onKeydown(e) {
		if (!state.open) { return; }

		if (e.key === 'Escape' || e.key === 'Esc') {
			/* ONE ESCAPE, ONE LAYER (1.33.0).
			 *
			 * This listener is on `document` in the CAPTURE phase and stops
			 * propagation, which is right for a modal — nothing behind the
			 * sheet should see the key — but it also meant nothing INSIDE the
			 * sheet ever saw it either. The map bar's Layers and Colour menus
			 * open over the map; pressing Escape to dismiss one tore down the
			 * whole map sheet instead, losing the guest's place.
			 *
			 * So the sheet asks first. Anything inside it that has something
			 * open listens for `dccwl:escape` and calls preventDefault() to
			 * say "that one was mine". Only if nobody claims it does the sheet
			 * close. A second press then closes the sheet, because by then the
			 * menu is shut and nobody claims it. */
			var claim = new CustomEvent('dccwl:escape', { bubbles: true, cancelable: true });
			var target = (document.activeElement && sheet.contains(document.activeElement))
				? document.activeElement
				: bodyEl;
			target.dispatchEvent(claim);

			e.preventDefault();
			e.stopPropagation();
			if (!claim.defaultPrevented) { close(true); }
			return;
		}

		if (e.key !== 'Tab') { return; }

		var items = Array.prototype.filter.call(
			sheet.querySelectorAll(FOCUSABLE),
			function (n) { return n.offsetParent !== null || n === document.activeElement; }
		);
		if (!items.length) {
			// Nothing tabbable inside: keep focus on the sheet rather than
			// letting it escape to the page behind.
			e.preventDefault();
			sheet.focus();
			return;
		}
		var first = items[0];
		var last = items[items.length - 1];
		if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	/* Browser / Android back closes the sheet instead of leaving the page. */
	function onPopState() {
		if (state.open) {
			state.pushedHistory = false; // the entry is already gone
			close(true);
		}
	}

	function open(opts) {
		opts = opts || {};
		ensureHost(opts.appClasses || 'dccwl-app');

		var wasOpen = state.open;
		state.opener = opts.opener || document.activeElement;
		state.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;

		sheet.classList.toggle('dccwl-sheet-tall', !!opts.tall);
		titleEl.textContent = opts.title || '';
		if (backBtn) {
			backBtn.setAttribute('aria-label', opts.closeLabel || 'Close');
		}
		if (closeBtn) {
			/* Its OWN label, not the caller's. The ‹ says what going back
			 * means in context ("Close details"); the × says the one thing it
			 * does, and Rob specified that word. */
			closeBtn.setAttribute('aria-label', opts.closeAllLabel || 'Close');
		}

		bodyEl.textContent = '';
		bodyEl.scrollTop = 0;
		if (typeof opts.build === 'function') {
			opts.build(bodyEl);
		}

		host.hidden = false;
		document.documentElement.classList.add('dccwl-sheet-lock');
		// Force a layout pass so the transform transition actually runs
		// rather than being collapsed with the unhide.
		void host.offsetHeight;
		host.setAttribute('data-dccwl-open', 'true');
		state.open = true;

		if (!wasOpen) {
			uid += 1;
			try {
				window.history.pushState({ dccwlSheet: uid }, '');
				state.pushedHistory = true;
			} catch (err) {
				state.pushedHistory = false; // file:// and the like
			}
		}

		// Focus the sheet itself: a screen reader then reads the dialog and
		// its title, and Tab from there lands on the back button.
		sheet.focus();
	}

	function close(focusBack) {
		if (!state.open) { return; }
		state.open = false;
		host.setAttribute('data-dccwl-open', 'false');
		document.documentElement.classList.remove('dccwl-sheet-lock');

		var opener = state.opener;
		var onClose = state.onClose;
		state.opener = null;
		state.onClose = null;

		if (state.pushedHistory) {
			state.pushedHistory = false;
			try { window.history.back(); } catch (err) { /* nothing to undo */ }
		}

		// Hide only after the slide-out finishes, so it is not cut short.
		var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		window.setTimeout(function () {
			if (!state.open) {
				host.hidden = true;
				bodyEl.textContent = '';
			}
		}, reduced ? 0 : 240);

		if (onClose) { onClose(); }
		if (focusBack && opener && document.contains(opener)) {
			opener.focus();
		}
	}

	window.DCCWL_Sheet = {
		open: open,
		close: close,
		isOpen: function () { return state.open; },
		/* Exposed for tests and for callers that want the same element
		 * factory rather than rolling their own. */
		el: el
	};
})();
