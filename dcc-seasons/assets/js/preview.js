/**
 * DCC Seasons — the Preview tab (admin only, 4.14.3; Rob's Step 0).
 *
 * One whole theme on the real home page, in a frame at 390, 768 or 1440:
 *   - "Falling Pieces and Background": the page as a guest sees it on the
 *     theme's days, with every variant of a piece taking its turn
 *     (dcc_variants), the background layer and the corner accent;
 *   - one button per scene and per flyer: the frame reloads with dcc_play,
 *     and the engine plays that one alone, about a second in and again a
 *     few seconds after it leaves;
 *   - "Easter Egg": taps the home page title in the frame as many times as
 *     the settings ask, the same path a guest takes.
 * The lists come from the engine itself (DCCSeasonsEngine.guide) and the
 * theme config (DCCSeasonsGuideData), so nothing here names a theme.
 */
(function () {
	'use strict';
	var root = document.getElementById('dcc-seasons-preview');
	var D = window.DCCSeasonsGuideData, E = window.DCCSeasonsEngine && window.DCCSeasonsEngine.guide;
	if (!root || !D || !E) { return; }
	var T = D.i18n, N = D.names || {}, key = root.getAttribute('data-theme');
	var th = D.themes[key] || {}, A = th.ambient || {};
	var stage = root.querySelector('.dcc-pv-stage');
	var WIDTHS = [390, 768, 1440], HEIGHT = { 390: 844, 768: 1024, 1440: 900 };
	var width = 390, play = '';
	try { width = +localStorage.getItem('dccPvWidth') || 390; } catch (e) { width = 390; }
	if (WIDTHS.indexOf(width) < 0) { width = 390; }

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text != null) { n.textContent = text; }
		return n;
	}
	function src() {
		var u = root.getAttribute('data-home');
		return u + (play ? '&dcc_play=' + encodeURIComponent(play) : '');
	}

	stage.innerHTML = '';
	stage.appendChild(el('p', 'description dcc-pv-note', T.pvNote));

	/* the width: a segmented control */
	var seg = el('div', 'dcc-pv-seg');
	seg.setAttribute('role', 'radiogroup');
	seg.setAttribute('aria-label', T.pvWidth);
	WIDTHS.forEach(function (w) {
		var b = el('button', 'button', w + ' px');
		b.type = 'button';
		b.setAttribute('role', 'radio');
		b.addEventListener('click', function () { width = w; try { localStorage.setItem('dccPvWidth', String(w)); } catch (e) { /* fine */ } layout(); mark(); });
		b._w = w;
		seg.appendChild(b);
	});
	function mark() {
		Array.prototype.forEach.call(seg.children, function (b) { var on = b._w === width; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('button-primary', on); });
	}
	stage.appendChild(seg);

	/* the play buttons */
	var bar = el('div', 'dcc-pv-play');
	function btn(label, kind, value) {
		var b = el('button', 'button', label);
		b.type = 'button';
		b.setAttribute('data-kind', kind);
		b.addEventListener('click', function () {
			Array.prototype.forEach.call(bar.querySelectorAll('button'), function (x) { x.classList.remove('button-primary'); x.removeAttribute('aria-pressed'); });
			b.classList.add('button-primary'); b.setAttribute('aria-pressed', 'true');
			if (kind === 'egg') { egg(); return; }
			play = value; load();
		});
		bar.appendChild(b);
		return b;
	}
	var first = btn(T.pvPieces, 'pieces', '');
	first.classList.add('button-primary'); first.setAttribute('aria-pressed', 'true');
	var scenes = (E.vigs[key] || []).concat(E.eveningVigs[key] || []);
	scenes.forEach(function (s) { btn(T.pvScene + ': ' + ((N.scenes && N.scenes[s]) || s), 'scene', 'v:' + s); });
	var heroes = ['heron'];
	if (A.hero) { heroes.push(A.hero); }
	heroes.forEach(function (h) { btn(T.pvHero + ': ' + ((N.heroes && N.heroes[h]) || h), 'hero', 'h:' + h); });
	if (th.egg) { btn(T.pvEgg, 'egg', ''); }
	stage.appendChild(bar);

	/* the frame, scaled to fit the page */
	var box = el('div', 'dcc-pv-box'), frame = el('iframe', 'dcc-pv-frame');
	frame.title = (D.labels[key] || key) + ' — ' + T.pvPlay;
	box.appendChild(frame);
	stage.appendChild(box);
	var open = el('a', 'dcc-pv-open', T.pvOpen);
	open.target = '_blank'; open.rel = 'noopener';
	stage.appendChild(open);

	function layout() {
		var h = HEIGHT[width], avail = Math.max(280, stage.clientWidth), k = Math.min(1, avail / width);
		frame.style.width = width + 'px'; frame.style.height = h + 'px';
		frame.style.transform = 'scale(' + k + ')';
		box.style.width = Math.round(width * k) + 'px'; box.style.height = Math.round(h * k) + 'px';
	}
	function load() { frame.src = src(); open.href = frame.src; }

	/* the egg: tap the title as many times as the settings ask */
	function egg() {
		var doc = null;
		try { doc = frame.contentDocument; } catch (e) { doc = null; }
		var sel = root.getAttribute('data-tapsel') || '.home #header-page-title .entry-title', n = +root.getAttribute('data-taps') || 4;
		var t = doc && doc.querySelector(sel);
		if (!t) { window.alert(T.pvEggNone); return; }
		for (var i = 0; i < n; i++) { t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: frame.contentWindow })); }
	}

	window.addEventListener('resize', layout);
	mark(); layout(); load();
}());
