/**
 * THE ⓘ (1.48.1) — ONE PATTERN FOR EVERY CREDIT AND SOURCE LINE.
 *
 * Rob, 2026-11-04: "all credit and source lines go behind an ⓘ tooltip — one
 * ⓘ pattern everywhere." Each ⓘ sits at the end of the line or heading its
 * source belongs to, opens on tap and on keyboard, closes on an outside tap
 * or Esc, and the text inside keeps its Title Case and its dates.
 *
 * BUILT ON THE BROWSER'S OWN POPOVER, so most of the behaviour is not ours:
 *
 *  - The button names its panel with `popovertarget`, which makes it a real
 *    disclosure in every browser that supports popovers — Enter and Space
 *    toggle it, the button is announced as expanded or collapsed, and it
 *    works with NO JavaScript at all.
 *  - `popover="auto"` gives light dismiss for free: a tap outside or Esc
 *    closes it, and focus goes back to the ⓘ.
 *  - The panel is drawn in the TOP LAYER, so a deck's `overflow-x: auto` and
 *    the sheet's `transform` cannot clip or displace it. Its DOM stays where
 *    it is, so the sheet's focus trap and reading order are untouched.
 *  - A browser with no popover support ignores the attribute and shows the
 *    panel's text inline, where the credit used to be — the credit is never
 *    lost, it just stops being folded.
 *
 * WHAT THIS FILE ADDS on top:
 *
 *  - placement: the panel opens beside its ⓘ (the UA default centres it in
 *    the viewport), kept inside the screen, and follows a scroll while open;
 *  - Esc inside the sheet: sheet.js listens for Escape in the capture phase
 *    and would close the whole sheet. By its own 1.33.0 contract, the
 *    innermost open thing claims `dccwl:escape` — this file closes the panel
 *    and calls preventDefault(), and the next Esc closes the sheet;
 *  - `DCCWL_Info.make()`, the builder the scripts use, so a credit drawn in
 *    the browser has exactly the markup Render::info() prints in PHP.
 */
(function () {
	'use strict';

	var SUPPORTED = typeof HTMLElement !== 'undefined' &&
		Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
	var seq = 0;
	var GAP = 6;
	var EDGE = 12;

	/* The ⓘ glyph: a ring and an "i", drawn, so no font decides its shape. */
	function glyph() {
		var NS = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('viewBox', '0 0 20 20');
		svg.setAttribute('width', '18');
		svg.setAttribute('height', '18');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('focusable', 'false');
		var c = document.createElementNS(NS, 'circle');
		c.setAttribute('cx', '10'); c.setAttribute('cy', '10'); c.setAttribute('r', '8.25');
		c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'currentColor'); c.setAttribute('stroke-width', '1.5');
		var p = document.createElementNS(NS, 'path');
		p.setAttribute('d', 'M10 9v5M10 6.2v.1');
		p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
		p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round');
		svg.appendChild(c); svg.appendChild(p);
		return svg;
	}

	/**
	 * Build one ⓘ: a button and its panel, side by side, to be appended at
	 * the end of the line or heading the source belongs to.
	 *
	 * @param {string} label  The button's accessible name ("Source", "Photo Credit").
	 * @param {Node}   content What the panel holds; built by the caller with
	 *                         textContent and real elements, never HTML.
	 * @return {HTMLElement} span.dccwl-info
	 */
	function make(label, content) {
		seq += 1;
		var id = 'dccwl-info-j' + seq;
		var wrap = document.createElement('span');
		wrap.className = 'dccwl-info';
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'dccwl-info-btn';
		btn.setAttribute('popovertarget', id);
		btn.setAttribute('aria-label', label);
		btn.appendChild(glyph());
		var pop = document.createElement('span');
		pop.className = 'dccwl-info-pop';
		pop.id = id;
		pop.setAttribute('popover', 'auto');
		if (content) { pop.appendChild(content); }
		wrap.appendChild(btn);
		wrap.appendChild(pop);
		return wrap;
	}

	/* Place an open panel beside its button, inside the screen. */
	function place(pop) {
		var btn = document.querySelector('[popovertarget="' + pop.id + '"]');
		if (!btn) { return; }
		var b = btn.getBoundingClientRect();
		var vw = document.documentElement.clientWidth || window.innerWidth;
		var vh = window.innerHeight;
		var w = pop.offsetWidth;
		var h = pop.offsetHeight;
		/* Below the ⓘ, its right edge under the ⓘ's right edge, then pulled
		 * back inside the screen; above it if there is no room below. */
		var left = Math.min(Math.max(EDGE, b.right - w), vw - w - EDGE);
		var top = b.bottom + GAP;
		if (top + h > vh - EDGE && b.top - GAP - h >= EDGE) { top = b.top - GAP - h; }
		pop.style.left = Math.round(Math.max(EDGE, left)) + 'px';
		pop.style.top = Math.round(top) + 'px';
	}

	var openPop = null;
	var raf = 0;
	function follow() {
		if (raf || !openPop) { return; }
		raf = window.requestAnimationFrame(function () {
			raf = 0;
			if (openPop) { place(openPop); }
		});
	}

	if (SUPPORTED) {
		/* `toggle` does not bubble; the capture phase still sees it. */
		document.addEventListener('toggle', function (e) {
			var pop = e.target;
			if (!pop || !pop.classList || !pop.classList.contains('dccwl-info-pop')) { return; }
			if ('open' === e.newState) {
				openPop = pop;
				place(pop);
			} else if (openPop === pop) {
				openPop = null;
			}
		}, true);
		window.addEventListener('scroll', follow, { passive: true, capture: true });
		window.addEventListener('resize', follow, { passive: true });

		/* Esc inside the sheet: claim it, close the panel, keep the sheet. */
		document.addEventListener('dccwl:escape', function (e) {
			if (!openPop) { return; }
			try { openPop.hidePopover(); } catch (err) { /* already closed */ }
			e.preventDefault();
		});
	}

	window.DCCWL_Info = { make: make, supported: SUPPORTED };
})();
