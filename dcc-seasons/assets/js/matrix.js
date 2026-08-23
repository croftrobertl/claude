/* DCC Seasons — Matrix-style glyph rain engine.
 * Lazy-loaded by ambient.js on the Nth logo tap; never in the critical path.
 * One engine, themed via {colors[], glyphs[], dir, glitch} from the active
 * seasonal theme. Exit: ✕ button, Escape, or tapping anywhere on the overlay.
 * prefers-reduced-motion: shows a static themed banner instead of animating. */
(function () {
	'use strict';
	var W = window, D = document, isOpen = false;

	/* Drop glyphs the local font stack can't render; keep a plain fallback. */
	function usable(list) {
		var cv = D.createElement('canvas');
		cv.width = cv.height = 24;
		var cx = cv.getContext('2d', { willReadFrequently: true });
		function ok(g) {
			try {
				cx.clearRect(0, 0, 24, 24);
				cx.font = '20px monospace';
				cx.fillText(g, 2, 18);
				var d = cx.getImageData(0, 0, 24, 24).data;
				for (var j = 3; j < d.length; j += 4) { if (d[j]) { return true; } }
				return false;
			} catch (e) { return true; }
		}
		var out = [], i;
		for (i = 0; i < list.length; i++) {
			if (ok(list[i])) { out.push(list[i]); }
		}
		return out.length ? out : ['0', '1'];
	}

	function launch(opts) {
		if (isOpen) { return; }
		isOpen = true;

		opts = opts || {};
		var egg = opts.egg || {};
		var colors = (egg.colors && egg.colors.length) ? egg.colors : ['#00FF41'];
		var i18n = opts.i18n || {};
		var prevFocus = D.activeElement;
		var raf = 0, running = true;
		var play = function () {}, pause = function () {};

		var ov = D.createElement('div');
		ov.setAttribute('role', 'dialog');
		ov.setAttribute('aria-modal', 'true');
		ov.setAttribute('aria-label', i18n.eggLabel || 'Seasonal easter egg');
		ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483000;background:rgba(0,4,0,.85);cursor:pointer;';

		var btn = D.createElement('button');
		btn.type = 'button';
		btn.textContent = '✕';
		btn.setAttribute('aria-label', i18n.close || 'Close');
		btn.style.cssText = 'position:absolute;top:14px;right:14px;z-index:2;width:44px;height:44px;padding:0;border:1px solid ' + colors[0] + ';border-radius:50%;background:rgba(0,0,0,.55);color:' + colors[0] + ';font-size:20px;line-height:42px;text-align:center;cursor:pointer;';

		var cleanup = [];
		function close() {
			running = false;
			pause();
			while (cleanup.length) { cleanup.pop()(); }
			D.removeEventListener('keydown', onKey, true);
			D.removeEventListener('visibilitychange', onVis);
			if (ov.parentNode) { ov.parentNode.removeChild(ov); }
			isOpen = false;
			if (prevFocus && prevFocus.focus) {
				try { prevFocus.focus({ preventScroll: true }); } catch (e) {}
			}
		}
		function onKey(e) {
			if (e.key === 'Escape' || e.key === 'Esc') {
				e.stopPropagation();
				close();
			}
		}
		function onVis() {
			if (D.hidden) { pause(); } else { play(); }
		}

		ov.addEventListener('click', close);
		btn.addEventListener('click', function (e) { e.stopPropagation(); close(); });
		D.addEventListener('keydown', onKey, true);
		D.addEventListener('visibilitychange', onVis);

		/* Static themed banner for reduced-motion visitors. */
		function banner() {
			var box = D.createElement('div');
			box.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);max-width:82%;padding:26px 34px;text-align:center;border:2px solid ' + colors[0] + ';border-radius:12px;background:rgba(0,0,0,.72);color:#fff;font-family:monospace;pointer-events:none;';
			var g = D.createElement('div');
			g.style.cssText = 'font-size:42px;line-height:1.35;';
			g.textContent = usable(egg.glyphs || []).slice(0, 6).join(' ');
			var t = D.createElement('div');
			t.style.cssText = 'margin-top:10px;font-size:18px;color:' + colors[0] + ';';
			t.textContent = (i18n.banner || 'Seasonal mode') + (opts.label ? ': ' + opts.label : '');
			var r = D.createElement('div');
			r.style.cssText = 'margin-top:6px;font-size:12px;opacity:.7;';
			r.textContent = i18n.bannerReduced || '';
			box.appendChild(g);
			box.appendChild(t);
			if (r.textContent) { box.appendChild(r); }
			ov.appendChild(box);
		}

		/* The classic rain: per-column drops with a trailing fade. */
		function rain() {
			var cv = D.createElement('canvas');
			cv.setAttribute('aria-hidden', 'true');
			cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
			ov.appendChild(cv);
			var cx = cv.getContext('2d');
			var glyphs = usable(egg.glyphs || ['0', '1']);
			var up = egg.dir === 'up';
			var glitch = !!egg.glitch;
			var vw, vh, fontSize, nCols, colW, drops, speeds, colColors;

			/* Finale formation: ~18s in, the rain briefly organizes into the
			 * theme's shape (an alpha mask of one large glyph — or the
			 * auto-computed year), holds ~2.5s, dissolves back. */
			var finChar = egg.finale || null;
			var finAt = egg.finaleAt || 18000;
			var finStart = 0, finDone = false, finCells = null, finGlyphs = null, t0 = 0;
			function buildMask() {
				var rows = Math.max(4, Math.ceil(vh / fontSize));
				var oc = D.createElement('canvas');
				oc.width = nCols; oc.height = rows;
				var ox = oc.getContext('2d', { willReadFrequently: true });
				var text = finChar;
				if (text === 'YEAR') {
					var nowd = new Date();
					text = String(nowd.getFullYear() + (nowd.getMonth() >= 6 ? 1 : 0));
				}
				ox.textAlign = 'center';
				ox.textBaseline = 'middle';
				ox.font = Math.round(text.length > 2 ? rows * 0.52 : rows * 0.92) + 'px sans-serif';
				ox.fillStyle = '#fff';
				ox.fillText(text, nCols / 2, rows / 2);
				var d = ox.getImageData(0, 0, nCols, rows).data;
				finCells = [];
				finGlyphs = [];
				for (var r = 0; r < rows; r++) {
					for (var c = 0; c < nCols; c++) {
						if (d[(r * nCols + c) * 4 + 3] > 60) {
							finCells.push([c, r]);
							finGlyphs.push(glyphs[(Math.random() * glyphs.length) | 0]);
						}
					}
				}
				if (!finCells.length) { finDone = true; }
			}
			function drawFinale(t) {
				if (!finChar || finDone) { return; }
				if (!t0) { t0 = t; }
				if (!finStart) {
					if (t - t0 >= finAt) {
						finStart = t;
						buildMask();
						if (W.DCC_SEASONS && W.DCC_SEASONS.debug) { W.DCCSeasonsMatrix._fin = finCells ? finCells.length : 0; }
					}
					return;
				}
				var el = (t - finStart) / 1000;
				var a = el < 0.8 ? el / 0.8 : (el < 3.3 ? 1 : (el < 4.1 ? (4.1 - el) / 0.8 : 0));
				if (el >= 4.1) { finDone = true; return; }
				cx.save();
				cx.globalAlpha = a;
				cx.font = fontSize + 'px monospace';
				var refresh = ((t / 220) | 0) % 7;
				for (var k = 0; k < finCells.length; k++) {
					if (k % 7 === refresh) { finGlyphs[k] = glyphs[(Math.random() * glyphs.length) | 0]; }
					cx.fillStyle = colors[finCells[k][0] % colors.length];
					cx.fillText(finGlyphs[k], finCells[k][0] * colW + colW / 2, finCells[k][1] * fontSize + fontSize * 0.8);
				}
				cx.restore();
			}

			function build() {
				/* One width source: the canvas rect × DPR (Chrome changes
				 * devicePixelRatio at runtime on zoom). */
				var r = cv.getBoundingClientRect();
				var dpr = Math.min(W.devicePixelRatio || 1, 2);
				vw = Math.max(1, Math.round(r.width));
				vh = Math.max(1, Math.round(r.height));
				cv.width = Math.round(vw * dpr);
				cv.height = Math.round(vh * dpr);
				cx.setTransform(dpr, 0, 0, dpr, 0, 0);
				fontSize = Math.max(16, Math.round(vw / 55));
				nCols = Math.min(60, Math.ceil(vw / fontSize)); /* hard cap 60 */
				colW = vw / nCols;
				drops = []; speeds = []; colColors = [];
				for (var k = 0; k < nCols; k++) {
					drops[k] = Math.random() * (vh / fontSize);
					speeds[k] = 0.5 + Math.random() * 0.7;
					colColors[k] = colors[k % colors.length];
				}
				cx.textAlign = 'center';
				if (finStart && !finDone) { buildMask(); } /* grid changed */
			}
			build();
			var resizeTimer = 0;
			function onResize() {
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(function () { if (isOpen) { build(); } }, 150);
			}
			W.addEventListener('resize', onResize);
			if (W.visualViewport) { W.visualViewport.addEventListener('resize', onResize); }
			cleanup.push(function () {
				clearTimeout(resizeTimer);
				W.removeEventListener('resize', onResize);
				if (W.visualViewport) { W.visualViewport.removeEventListener('resize', onResize); }
			});

			var glitchAt = 0, glitchHue = 0;
			function frame(t) {
				raf = 0;
				if (!running) { return; }
				/* Fade what's drawn without stacking opaque black, so the
				 * dimmed page stays faintly visible behind the rain. */
				cx.globalCompositeOperation = 'destination-out';
				cx.fillStyle = 'rgba(0,0,0,0.14)';
				cx.fillRect(0, 0, vw, vh);
				cx.globalCompositeOperation = 'source-over';
				if (glitch) {
					if (t > glitchAt) {
						glitchHue = (Math.random() * 360) | 0;
						glitchAt = t + 400 + Math.random() * 1800;
					}
					cx.filter = 'hue-rotate(' + glitchHue + 'deg)';
				}
				cx.font = fontSize + 'px monospace';
				for (var k = 0; k < nCols; k++) {
					var y = drops[k] * fontSize;
					if (up) { y = vh - y; }
					var x = k * colW + colW / 2;
					if (glitch && Math.random() < 0.02) {
						x += (Math.random() - 0.5) * colW;
					}
					cx.fillStyle = colColors[k];
					cx.fillText(glyphs[(Math.random() * glyphs.length) | 0], x, y);
					drops[k] += speeds[k];
					if (drops[k] * fontSize > vh + fontSize && Math.random() > 0.965) {
						drops[k] = 0;
					}
				}
				if (glitch) { cx.filter = 'none'; }
				drawFinale(t);
				raf = W.requestAnimationFrame(frame);
			}
			play = function () {
				if (running && !raf && !D.hidden) { raf = W.requestAnimationFrame(frame); }
			};
			pause = function () {
				if (raf) { W.cancelAnimationFrame(raf); raf = 0; }
			};
			play();
		}

		/* Mount the overlay BEFORE building the rain: sizing reads the live
		 * canvas rect, which is 0×0 while detached. */
		ov.appendChild(btn);
		D.body.appendChild(ov);
		if (opts.reduced) { banner(); } else { rain(); }
		try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); }
	}

	W.DCCSeasonsMatrix = { launch: launch };
})();
