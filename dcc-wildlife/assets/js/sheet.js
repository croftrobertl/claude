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
	var ICON_BACK = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
		'<path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" ' +
		'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

	var host = null;
	var scrim = null;
	var sheet = null;
	var titleEl = null;
	var bodyEl = null;
	var backBtn = null;

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

		head.appendChild(backBtn);
		head.appendChild(titleEl);

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
			e.preventDefault();
			e.stopPropagation();
			close(true);
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
