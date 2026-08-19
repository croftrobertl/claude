/* DCC Seasons — ambient particle layer + 5-tap egg trigger.
 * Deferred, dependency-free. The Matrix engine (matrix.js) is lazy-loaded
 * only when the tap threshold is reached. The active theme is chosen here,
 * client-side, from the visitor's LOCAL date — cached HTML stays date-free. */
(function () {
	'use strict';
	var W = window, D = document, CFG = W.DCC_SEASONS;
	if (!CFG || !CFG.enabled) { return; }

	var mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
	function reduced() { return !!(mq && mq.matches); }

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	var now = new Date();
	var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
	var row = null, i, sch = CFG.schedule || [];
	for (i = 0; i < sch.length; i++) {
		if (sch[i].start <= today && today <= sch[i].end) { row = sch[i]; break; }
	}
	var theme = row && CFG.themes && CFG.themes[row.theme] ? CFG.themes[row.theme] : null;

	/* Admin-only preview (?dcc_season=<key>|off). The flag is only present
	 * in the config when PHP verified manage_options server-side. */
	if (CFG.preview) {
		if (CFG.preview === 'off') {
			row = null;
			theme = null;
		} else if (CFG.themes && CFG.themes[CFG.preview]) {
			theme = CFG.themes[CFG.preview];
			row = { theme: CFG.preview, label: CFG.previewLabel || CFG.preview };
		}
	}

	/* Can this glyph render? Draw it tiny and look for any opaque pixel. */
	var tcx = null;
	function drawable(g) {
		try {
			if (!tcx) {
				var tcv = D.createElement('canvas');
				tcv.width = tcv.height = 24;
				tcx = tcv.getContext('2d', { willReadFrequently: true });
			}
			tcx.clearRect(0, 0, 24, 24);
			tcx.font = '20px sans-serif';
			tcx.fillText(g, 2, 18);
			var d = tcx.getImageData(0, 0, 24, 24).data;
			for (var j = 3; j < d.length; j += 4) { if (d[j]) { return true; } }
			return false;
		} catch (e) { return true; }
	}

	/* Weighted glyph pool with per-glyph emoji→text fallback. */
	function pool(defs) {
		var out = [], k, p, n, g;
		for (k = 0; k < defs.length; k++) {
			p = defs[k];
			g = drawable(p.g) ? p.g : (p.f || '*');
			n = p.w || 1;
			while (n--) { out.push({ g: g, c: !!p.c || g !== p.g }); }
		}
		return out;
	}
	function rnd(a, b) { return a + Math.random() * (b - a); }
	function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

	/* ---------- Ambient layer ---------- */
	function ambient() {
		if (!CFG.ambient || !theme || !theme.ambient) { return; }
		var A = theme.ambient;
		if (A.mode === 'accent') { accent(A); return; }
		if (A.mode !== 'drift' && A.mode !== 'burst') { return; }
		if (reduced()) { return; }

		var glyphs = pool(A.particles || []);
		if (!glyphs.length) { return; }

		var cv = D.createElement('canvas');
		cv.setAttribute('aria-hidden', 'true');
		cv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99990;';
		D.body.appendChild(cv);
		var cx = cv.getContext('2d');
		var vw = 0, vh = 0, sizeTimer = 0;
		function size() {
			var dpr = Math.min(W.devicePixelRatio || 1, 2);
			vw = W.innerWidth; vh = W.innerHeight;
			cv.width = vw * dpr; cv.height = vh * dpr;
			cx.setTransform(dpr, 0, 0, dpr, 0, 0);
			cx.textBaseline = 'middle';
			cx.textAlign = 'center';
		}
		size();
		W.addEventListener('resize', function () {
			clearTimeout(sizeTimer);
			sizeTimer = setTimeout(size, 150);
		});

		var burst = A.mode === 'burst';
		var max = Math.max(1, Math.min(CFG.density || 10, 16)); /* hard cap 16 */
		var alpha = Math.min(Math.max(CFG.opacity || 0.35, 0.05), 1);
		var colors = A.colors || (theme.egg && theme.egg.colors) || ['#888888'];
		var vy = A.vy || [8, 22], vx = A.vx || [-6, 6], sz = A.size || [14, 22];
		var up = A.dir === 'up';
		var parts = [], nextBurst = 0;

		function seed(p, anywhere) {
			var g = pick(glyphs);
			p.g = g.g;
			p.col = g.c ? pick(colors) : '#888888';
			p.s = rnd(sz[0], sz[1]);
			p.vy = rnd(vy[0], vy[1]) * (up ? -1 : 1);
			p.vx = rnd(vx[0], vx[1]);
			p.ph = rnd(0, 6.28);
			p.sw = rnd(3, A.sway || 10);
			p.x = rnd(0, vw);
			p.y = anywhere ? rnd(0, vh) : (up ? vh + p.s : -p.s);
			p.burstUntil = 0;
			return p;
		}
		for (i = 0; i < max; i++) { parts.push(seed({}, true)); }

		/* Firework burst: re-aim up to 12 pooled particles radially. */
		function fire(t) {
			var bx = rnd(vw * 0.2, vw * 0.8), by = rnd(vh * 0.15, vh * 0.45), n = 0, a, sp, p, k;
			for (k = 0; k < parts.length && n < 12; k++) {
				p = parts[k];
				a = rnd(0, 6.28); sp = rnd(30, 90);
				p.x = bx; p.y = by;
				p.vx = Math.cos(a) * sp;
				p.vy = Math.sin(a) * sp;
				p.burstUntil = t + rnd(1200, 2200);
				p.col = pick(colors);
				n++;
			}
			nextBurst = t + rnd(2500, 5500);
		}

		var running = !D.hidden, last = 0, raf = 0;
		function step(t) {
			raf = 0;
			if (!running) { return; }
			var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
			last = t;
			cx.clearRect(0, 0, vw, vh);
			cx.globalAlpha = alpha;
			if (burst && t >= nextBurst) {
				if (!nextBurst) { nextBurst = t + 1500; } else { fire(t); }
			}
			for (var k = 0; k < parts.length; k++) {
				var p = parts[k];
				p.ph += dt * 1.6;
				if (p.burstUntil) {
					p.vy += 60 * dt; /* gravity on burst sparks */
					if (t > p.burstUntil) { seed(p, false); }
				}
				if (A.swayY) {
					p.x += p.vx * dt;
					p.y += p.vy * dt + Math.sin(p.ph) * p.sw * dt;
				} else {
					p.x += p.vx * dt + Math.sin(p.ph) * p.sw * dt;
					p.y += p.vy * dt;
				}
				if (p.y > vh + 40 || p.y < -40 || p.x < -40 || p.x > vw + 40) {
					seed(p, false);
				}
				cx.font = p.s + 'px sans-serif';
				cx.fillStyle = p.col;
				cx.fillText(p.g, p.x, p.y);
			}
			raf = W.requestAnimationFrame(step);
		}
		function play() {
			if (!raf && running) { last = 0; raf = W.requestAnimationFrame(step); }
		}
		D.addEventListener('visibilitychange', function () {
			running = !D.hidden && !reduced();
			if (running) { play(); }
		});
		if (mq && mq.addEventListener) {
			mq.addEventListener('change', function () {
				if (reduced()) {
					running = false;
					cv.style.display = 'none';
				} else {
					cv.style.display = '';
					running = !D.hidden;
					play();
				}
			});
		}
		play();
	}

	/* Subtle-only days: a small static corner accent, no animation. */
	function accent(A) {
		var d = D.createElement('div');
		d.setAttribute('aria-hidden', 'true');
		d.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99990;pointer-events:none;font:22px/1 sans-serif;opacity:.55;';
		d.textContent = A.accent || '';
		if (A.bar && A.bar.length) {
			var b = D.createElement('span');
			b.style.cssText = 'display:block;height:3px;margin-top:4px;border-radius:2px;background:linear-gradient(90deg,' + A.bar.join(',') + ');';
			d.appendChild(b);
		}
		D.body.appendChild(d);
	}

	/* ---------- Easter egg: N taps on the logo ---------- */
	function egg() {
		if (!CFG.egg) { return; }
		if (theme && theme.egg === false) { return; } /* Patriot Day / MLK Day */
		var eggCfg = (theme && theme.egg) || (CFG.themes && CFG.themes.classic && CFG.themes.classic.egg);
		if (!eggCfg) { return; }

		var el = D.querySelector(CFG.tapSelector || '#branding')
			|| D.querySelector(CFG.tapFallback || '#site-title');
		if (!el) { return; }

		var taps = [], lastTouch = 0, loading = false;
		var need = Math.max(2, CFG.tapCount || 5), win = CFG.tapWindow || 3000;

		function samePage(a) {
			return a && a.href && a.host === W.location.host &&
				a.pathname.replace(/\/$/, '') === W.location.pathname.replace(/\/$/, '');
		}
		function onTap(e) {
			var t = Date.now();
			if (e.type === 'click') {
				/* The logo usually links home. When that's the page we're
				 * already on, cancel the pointless reload so tap counting
				 * survives; links to OTHER pages still navigate normally. */
				var a = e.target && e.target.closest ? e.target.closest('a') : null;
				if (a && samePage(a)) { e.preventDefault(); }
				if (t - lastTouch < 700) { return; } /* ghost click after touch */
			} else {
				lastTouch = t;
			}
			taps.push(t);
			while (taps.length && t - taps[0] > win) { taps.shift(); }
			if (taps.length >= need) {
				taps = [];
				launch();
			}
		}
		el.addEventListener('touchstart', onTap, { passive: true });
		el.addEventListener('click', onTap, false);

		function open() {
			W.DCCSeasonsMatrix.launch({
				egg: eggCfg,
				label: (row && row.label) || '',
				reduced: reduced(),
				i18n: CFG.i18n || {}
			});
		}
		function launch() {
			if (W.DCCSeasonsMatrix) { open(); return; }
			if (loading || !CFG.matrixSrc) { return; }
			loading = true;
			var sc = D.createElement('script');
			sc.src = CFG.matrixSrc;
			sc.async = true;
			sc.onload = function () {
				loading = false;
				if (W.DCCSeasonsMatrix) { open(); }
			};
			sc.onerror = function () { loading = false; };
			(D.head || D.documentElement).appendChild(sc);
		}
	}

	function init() { ambient(); egg(); }
	if (D.readyState === 'loading') {
		D.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
