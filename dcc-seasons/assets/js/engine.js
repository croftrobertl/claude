/* DCC Seasons — ambient particle engine. Lazy-loaded by ambient.js after
 * idle; never in the critical path. Systems:
 *  - THE WATERLINE: an invisible water surface along the bottom ~8% of the
 *    viewport (the business sits ON the Dora Canal). Leaves settle on it
 *    with a ripple, bobbers/lotus float, bass jump OUT of it, the manatee
 *    glides submerged. Per-theme opt-in; ripples count toward the cap.
 *  - Motion personalities: fall sway flutter wobble float rise grow fly vee
 *    pulse orbit tumble dangle hang toss hop waddle dart twinkle chatter
 *    jump spin (+ the burst firework emitter with auto-year text).
 *  - Hybrid rendering: emoji where strong, canvas-drawn primitives where
 *    emoji can't be recolored (r/w/b stars, confetti, decorated eggs,
 *    license plates), small inline SVG sprites for the rest. Emoji are
 *    tofu-checked at init and swapped for fallbacks.
 *  - BRAND HERO: the great blue heron (the DCC logo bird) glides across
 *    rarely in EVERY theme and on no-theme days — the year-round signature.
 *    Per-theme heroes: eagle, witch, Santa sleigh, manatee, big bass jump,
 *    ducklings, the St. Patrick's rainbow corner moment.
 *  - Sizing hardened for Chrome zoom / wide monitors: one width source (the
 *    canvas rect × DPR), re-applied on window.resize AND visualViewport
 *    resize, with a full particle re-seed on change. */
(function () {
	'use strict';
	var W = window, D = document, TAU = Math.PI * 2;

	function rnd(a, b) { return a + Math.random() * (b - a); }
	function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
	function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

	/* ---------- SVG sprite registry (bold, 2–3 colors, legible ~30px) ---------- */
	var SVGS = {
		bobber: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 30"><line x1="12" y1="0" x2="12" y2="4" stroke="#495057" stroke-width="1.5"/><circle cx="12" cy="16" r="11" fill="#F1F3F5"/><path d="M1 16a11 11 0 0 1 22 0Z" fill="#E03131"/><circle cx="12" cy="16" r="11" fill="none" stroke="#343A40" stroke-width="1.2"/><circle cx="12" cy="4" r="2.4" fill="#343A40"/></svg>',
		candycorn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 30"><path d="M11 1 21 29H1Z" fill="#FFD43B"/><path d="M4.4 19 11 1l6.6 18Z" fill="#FF922B"/><path d="M8 9.2 11 1l3 8.2Z" fill="#FFF9DB"/></svg>',
		witchhat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 26"><ellipse cx="16" cy="22" rx="15" ry="3.6" fill="#212529"/><path d="M16 0 24 21H8Z" fill="#343A40"/><rect x="9" y="16.4" width="14" height="4" fill="#9C36B5"/><rect x="14" y="16.9" width="3.4" height="3" fill="#FFD43B"/></svg>',
		acorn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 28"><path d="M4 12h14c0 8-4 13-7 15-3-2-7-7-7-15Z" fill="#B08552"/><path d="M2 12c0-5 4-8 9-8s9 3 9 8Z" fill="#6F4E37"/><line x1="11" y1="4" x2="11" y2="0" stroke="#6F4E37" stroke-width="2.4"/></svg>',
		holly: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 22"><path d="M15 10C11 2 4 2 1 6c4 1 4 5 8 7Z" fill="#2B8A3E"/><path d="M19 10c4-8 11-8 14-4-4 1-4 5-8 7Z" fill="#2F9E44"/><circle cx="14" cy="14" r="4" fill="#E03131"/><circle cx="21" cy="14" r="4" fill="#C92A2A"/><circle cx="17.5" cy="18" r="4" fill="#E03131"/></svg>',
		ornament: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 30"><rect x="9.4" y="2" width="5.2" height="5" rx="1" fill="#B8860B"/><circle cx="12" cy="8" r="2" fill="none" stroke="#B8860B" stroke-width="1.6"/><circle cx="12" cy="19" r="10" fill="#C92A2A"/><path d="M2.6 16.4a10 10 0 0 1 18.8 0" fill="#E03131"/><ellipse cx="8.6" cy="14" rx="2.6" ry="3.6" fill="#FFF5F5" opacity=".55"/></svg>',
		beads: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 26"><path d="M2 2q18 30 36 0" fill="none" stroke="#5F3DC4" stroke-width="1.2"/><circle cx="5" cy="6" r="3.4" fill="#7C3AED"/><circle cx="12" cy="13" r="3.4" fill="#2F9E44"/><circle cx="20" cy="16.6" r="3.8" fill="#F1C40F"/><circle cx="28" cy="13" r="3.4" fill="#7C3AED"/><circle cx="35" cy="6" r="3.4" fill="#2F9E44"/></svg>',
		doubloon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="#F1C40F"/><circle cx="13" cy="13" r="12" fill="none" stroke="#B8860B" stroke-width="1.6"/><circle cx="13" cy="13" r="8.4" fill="none" stroke="#B8860B" stroke-width="1"/><path d="M13 7c-2 3-2 3 0 5 2-2 2-2 0-5Zm0 12c2-3 2-3 0-5-2 2-2 2 0 5Zm-6-6c3 2 3 2 5 0-2-2-2-2-5 0Zm12 0c-3-2-3-2-5 0 2 2 2 2 5 0Z" fill="#B8860B"/></svg>',
		horseshoe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><path d="M5 26V13a9 9 0 0 1 18 0v13h-5V13a4 4 0 0 0-8 0v13Z" fill="#868E96"/><circle cx="7.5" cy="17" r="1.2" fill="#495057"/><circle cx="7.5" cy="22" r="1.2" fill="#495057"/><circle cx="20.5" cy="17" r="1.2" fill="#495057"/><circle cx="20.5" cy="22" r="1.2" fill="#495057"/></svg>',
		dragonfly: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 22"><ellipse cx="10" cy="11" rx="9" ry="2.6" fill="#96C8F0" opacity=".8" transform="rotate(-24 10 11)"/><ellipse cx="10" cy="11" rx="9" ry="2.6" fill="#96C8F0" opacity=".8" transform="rotate(24 10 11)"/><ellipse cx="26" cy="11" rx="8" ry="2.2" fill="#B3D9F5" opacity=".8" transform="rotate(-18 26 11)"/><ellipse cx="26" cy="11" rx="8" ry="2.2" fill="#B3D9F5" opacity=".8" transform="rotate(18 26 11)"/><rect x="6" y="9.8" width="26" height="2.4" rx="1.2" fill="#1864AB"/><circle cx="5.4" cy="11" r="3" fill="#1864AB"/></svg>',
		cannabis: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><g fill="#2B8A3E"><path d="M15 2c2 5 2 10 0 14-2-4-2-9 0-14Z"/><path d="M3 6c5 1 9 4 11 8-5 0-9-3-11-8Z"/><path d="M27 6c-5 1-9 4-11 8 5 0 9-3 11-8Z"/><path d="M1 16c4-1 8 0 12 2-4 2-9 1-12-2Z"/><path d="M29 16c-4-1-8 0-12 2 4 2 9 1 12-2Z"/><path d="M8 25c3-3 5-5 7-9 2 4 4 6 7 9-3 1-5-1-7-3-2 2-4 4-7 3Z"/></g><line x1="15" y1="16" x2="15" y2="28" stroke="#2B8A3E" stroke-width="1.6"/></svg>',
		jester: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 28"><path d="M5 22 2 4l10 10L17 2l5 12L32 4l-3 18Z" fill="#7C3AED"/><path d="M17 2l5 12 5-6-2 14H12l-2-14 5 6Z" fill="#2F9E44" opacity=".85"/><rect x="4" y="21" width="26" height="5" rx="2.5" fill="#F1C40F"/><circle cx="2.5" cy="4" r="2.4" fill="#F1C40F"/><circle cx="17" cy="2.5" r="2.4" fill="#F1C40F"/><circle cx="31.5" cy="4" r="2.4" fill="#F1C40F"/></svg>',
		teeth0: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24"><path d="M2 10q13-8 26 0v5q-13 8-26 0Z" fill="#F783AC"/><path d="M4 10q11-6 22 0l-1 3q-10 5-20 0Z" fill="#FFF"/><line x1="9" y1="8" x2="9" y2="13" stroke="#DEE2E6"/><line x1="15" y1="7" x2="15" y2="14" stroke="#DEE2E6"/><line x1="21" y1="8" x2="21" y2="13" stroke="#DEE2E6"/><circle cx="25" cy="18" r="3" fill="#ADB5BD"/></svg>',
		teeth1: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24"><path d="M2 5q13-6 26 0v3q-13 6-26 0Z" fill="#F783AC"/><path d="M2 16q13-6 26 0v3q-13 6-26 0Z" fill="#F783AC"/><path d="M4 6q11-4 22 0v1.4q-11 4-22 0Z" fill="#FFF"/><path d="M4 17q11-4 22 0v1.4q-11 4-22 0Z" fill="#FFF"/><circle cx="25" cy="12" r="3" fill="#ADB5BD"/></svg>',
		rainbow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60"><g fill="none" stroke-width="4"><path d="M5 58a40 40 0 0 1 80 0" stroke="#E03131"/><path d="M9 58a36 36 0 0 1 72 0" stroke="#FF922B"/><path d="M13 58a32 32 0 0 1 64 0" stroke="#FFD43B"/><path d="M17 58a28 28 0 0 1 56 0" stroke="#2F9E44"/><path d="M21 58a24 24 0 0 1 48 0" stroke="#5C7CFA"/></g><path d="M68 46h20l-2.6 10a7 7 0 0 1-6.8 4h-1.2a7 7 0 0 1-6.8-4Z" fill="#212529"/><circle cx="73" cy="45" r="3" fill="#F1C40F"/><circle cx="79" cy="43.6" r="3" fill="#FFD43B"/><circle cx="85" cy="45" r="3" fill="#F1C40F"/></svg>',
		ribbon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 40"><path d="M8 2C4 10 6 20 16 34l6-4C14 20 12 10 15 2Z" fill="#B22234"/><path d="M18 2c4 8 2 18-8 32l-6-4C12 20 14 10 11 2Z" fill="#3C3B6E"/><path d="M11 2h4l-2 8Z" fill="#F1F3F5"/></svg>',
		heron0: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60"><path d="M12 26q4-8 14-6l4 3-6 5q-8 2-12-2Z" fill="#2C3E50"/><path d="M28 22 8 12l2 8 14 6Z" fill="#5D6D7E"/><path d="M8 12 2 10l5 4Z" fill="#F1C40F"/><path d="M30 25q18-14 44-10-12 10-26 12l16 2q-16 8-30 2Z" fill="#4A6B8A"/><path d="M34 24Q52 4 78 8 64 20 48 26Z" fill="#5D8AA8"/><path d="M56 30q10 2 22 12-14 0-24-6Z" fill="#4A6B8A"/><path d="M52 32l16 10 4 6-8-2-14-10Z" fill="#34495E"/></svg>',
		heron1: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60"><path d="M12 30q4-8 14-6l4 3-6 5q-8 2-12-2Z" fill="#2C3E50"/><path d="M28 26 8 16l2 8 14 6Z" fill="#5D6D7E"/><path d="M8 16 2 14l5 4Z" fill="#F1C40F"/><path d="M30 29q18 14 44 10-12-10-26-12l16-2q-16-8-30-2Z" fill="#4A6B8A"/><path d="M34 30q18 20 44 16-14-12-30-18Z" fill="#5D8AA8"/><path d="M52 30l16 12 4 6-8-2-14-12Z" fill="#34495E"/></svg>',
		manatee: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 46"><ellipse cx="42" cy="24" rx="34" ry="17" fill="#8D99A6"/><path d="M72 20q14-4 16-12-2 12 2 18-4 6-2 18-8-10-16-12 4-6 0-12Z" fill="#7B8794"/><circle cx="14" cy="18" r="9" fill="#8D99A6"/><circle cx="10" cy="16" r="1.6" fill="#343A40"/><ellipse cx="7" cy="21" rx="4.4" ry="3.4" fill="#7B8794"/><circle cx="5.6" cy="20" r=".9" fill="#343A40"/><circle cx="8.6" cy="20" r=".9" fill="#343A40"/><path d="M34 38q6 6 12 0l-4 6h-4Z" fill="#7B8794"/></svg>',
		sleigh: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 40"><path d="M60 8q22-2 34 6 8 5 6 12H62q-8 0-10-8Z" fill="#C92A2A"/><path d="M60 8q12-1 22 2l-4 8H58Z" fill="#E03131"/><path d="M56 30h46q4 0 6-4M58 30l-4 6m40-6 4 6" fill="none" stroke="#B8860B" stroke-width="2.4"/><path d="M2 18h44" stroke="#8B5A2B" stroke-width="1.6"/><path d="M10 16q8-8 16-6 8 2 10 8-4 6-12 6-10 0-14-8Z" fill="#8B5A2B"/><path d="M12 12q-2-8 4-10-1 6 2 8m4 2q0-8 6-9-2 6 0 9" fill="none" stroke="#6F4E37" stroke-width="2"/><circle cx="8" cy="17" r="2.2" fill="#E03131"/></svg>'
	};

	var sprites = {};
	function sprite(name) {
		var s = sprites[name];
		if (s) { return s; }
		s = { ready: false, img: new Image(), ratio: 1 };
		s.img.onload = function () {
			s.ratio = (s.img.naturalHeight || 1) / (s.img.naturalWidth || 1);
			s.ready = true;
		};
		s.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVGS[name] || '');
		sprites[name] = s;
		return s;
	}

	/* ---------- Emoji tofu check ---------- */
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

	/* ---------- Canvas-drawn primitives (recolorable where emoji can't) ---------- */
	function drawStar(cx, r, color) {
		cx.fillStyle = color;
		cx.beginPath();
		for (var i = 0; i < 10; i++) {
			var rr = i % 2 ? r * 0.42 : r;
			var a = -Math.PI / 2 + i * Math.PI / 5;
			cx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
		}
		cx.closePath();
		cx.fill();
	}
	var PRIMS = {
		star: function (cx, p, s) { drawStar(cx, p.size * 0.45 * s, p.color); },
		confetti: function (cx, p, s) {
			cx.fillStyle = p.color;
			cx.fillRect(-p.size * 0.28 * s, -p.size * 0.11 * s, p.size * 0.56 * s, p.size * 0.22 * s);
		},
		bubble: function (cx, p, s) {
			cx.strokeStyle = p.color;
			cx.lineWidth = 1;
			cx.beginPath();
			cx.arc(0, 0, p.size * 0.16 * s, 0, TAU);
			cx.stroke();
		},
		egg: function (cx, p, s) {
			var rx = p.size * 0.32 * s, ry = p.size * 0.42 * s;
			cx.save();
			cx.beginPath();
			cx.ellipse(0, 0, rx, ry, 0, 0, TAU);
			cx.fillStyle = p.color;
			cx.fill();
			cx.clip();
			cx.fillStyle = p.color2;
			if (p.deco) { /* dots */
				for (var i = 0; i < 5; i++) {
					cx.beginPath();
					cx.arc((i % 3 - 1) * rx * 0.7, ((i / 3 | 0) - 0.5) * ry * 0.8, rx * 0.16, 0, TAU);
					cx.fill();
				}
			} else { /* stripes */
				cx.fillRect(-rx, -ry * 0.45, rx * 2, ry * 0.22);
				cx.fillRect(-rx, ry * 0.15, rx * 2, ry * 0.22);
			}
			cx.restore();
		},
		plate: function (cx, p, s) {
			var w = p.size * 1.35 * s, h = w * 0.5;
			cx.fillStyle = '#F1F3F5';
			cx.strokeStyle = '#495057';
			cx.lineWidth = 1.4;
			cx.beginPath();
			if (cx.roundRect) { cx.roundRect(-w / 2, -h / 2, w, h, 3); }
			else { cx.rect(-w / 2, -h / 2, w, h); }
			cx.fill();
			cx.stroke();
			cx.fillStyle = '#1864AB';
			cx.font = 'bold ' + Math.round(h * 0.62) + 'px sans-serif';
			cx.textAlign = 'center';
			cx.textBaseline = 'middle';
			cx.fillText(p.state, 0, 1);
		}
	};

	/* ================= Engine ================= */
	function start(boot) {
		var CFG = boot.cfg || {};
		var theme = boot.theme;
		var A = (theme && theme.ambient) || { particles: [] };
		var mq = boot.mq;
		var reduced = function () { return !!(mq && mq.matches); };
		if (reduced()) { return; }

		var water = !!A.water;
		var up = !!A.up;
		var burstMode = A.mode === 'burst';
		var alphaBase = clamp(CFG.opacity || 0.35, 0.05, 1);
		var maxTotal = clamp(CFG.density || 10, 1, 16); /* hard cap, ripples included */
		var reserve = water ? 3 : 0;                    /* ripple headroom */
		var maxParts = Math.max(1, maxTotal - reserve);
		var heroEvery = CFG.heroEvery || [120, 180];

		/* Static corner accent (Patriot Day flag ribbon) — DOM, no motion. */
		if (A.accent && A.accent.svg && SVGS[A.accent.svg]) {
			var acc = D.createElement('div');
			acc.setAttribute('aria-hidden', 'true');
			acc.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99990;pointer-events:none;width:26px;opacity:.6;';
			acc.innerHTML = SVGS[A.accent.svg];
			D.body.appendChild(acc);
		}

		var cv = D.createElement('canvas');
		cv.setAttribute('aria-hidden', 'true');
		cv.className = 'dcc-seasons-canvas';
		cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99990;';
		D.body.appendChild(cv);
		var cx = cv.getContext('2d');

		/* --- Sizing (Bug 2): ONE width source — the canvas rect × DPR.
		 * Chrome changes devicePixelRatio at runtime on zoom, so re-apply on
		 * window.resize AND visualViewport resize, and re-seed on change. */
		var vw = 0, vh = 0, waterY = 0, ground = 0, sizeTimer = 0;
		function applySize() {
			var r = cv.getBoundingClientRect();
			var dpr = Math.min(W.devicePixelRatio || 1, 2);
			var w = Math.max(1, Math.round(r.width));
			var h = Math.max(1, Math.round(r.height));
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
			cx.setTransform(dpr, 0, 0, dpr, 0, 0);
			vw = w; vh = h;
			waterY = vh * 0.92;
			ground = vh - 16;
			for (var k = 0; k < parts.length; k++) { seed(parts[k], true); }
			ripples.length = 0;
			if (hero) { hero = null; } /* re-schedule on new geometry */
		}
		function queueSize() { clearTimeout(sizeTimer); sizeTimer = setTimeout(applySize, 150); }
		W.addEventListener('resize', queueSize);
		if (W.visualViewport) { W.visualViewport.addEventListener('resize', queueSize); }

		/* --- Resolve particle specs (tofu-check emoji, build weighted pool). */
		function resolve(def) {
			var sp = { def: def, b: def.b || 'fall' };
			if (def.s) { sp.kind = 's'; sp.s = def.s; sprite(def.s); }
			else if (def.c) { sp.kind = 'c'; sp.c = def.c; }
			else {
				var g = def.e;
				if (!g || !drawable(g)) {
					var f = def.f || '*';
					/* an emoji fallback (surrogate pair) stays an emoji;
					 * a plain text glyph gets tinted */
					if (f.charCodeAt(0) >= 0xD800 && drawable(f)) {
						sp.kind = 'e'; sp.g = f;
						return sp;
					}
					sp.kind = 't'; sp.g = f; sp.color = def.fc || '#888888';
					return sp;
				}
				sp.kind = 'e'; sp.g = g;
			}
			return sp;
		}
		var pool = [];
		(A.particles || []).forEach(function (def) {
			var sp = resolve(def), n = def.w || 1;
			while (n--) { pool.push(sp); }
		});

		/* --- Ripples (waterline). Count toward the cap. */
		var ripples = [];
		function addRipple(x, y, big) {
			if (parts.length + ripples.length >= maxTotal) { return; }
			ripples.push({ x: x, y: y, r: big ? 6 : 3, a: 0.8, big: !!big });
		}
		function stepRipples(dt) {
			for (var k = ripples.length - 1; k >= 0; k--) {
				var r = ripples[k];
				r.r += dt * (r.big ? 34 : 22);
				r.a -= dt * 0.9;
				if (r.a <= 0) { ripples.splice(k, 1); }
			}
		}
		function drawRipples() {
			cx.lineWidth = 1;
			for (var k = 0; k < ripples.length; k++) {
				var r = ripples[k];
				cx.globalAlpha = alphaBase * r.a;
				cx.strokeStyle = '#9CC3E5';
				cx.beginPath();
				cx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, TAU);
				cx.stroke();
			}
		}

		/* --- Particles. */
		var parts = [];
		function dirY() { return up ? -1 : 1; }

		function seed(p, anywhere) {
			var sp = pick(pool);
			if (!sp) { return p; }
			var def = sp.def;
			p.sp = sp;
			p.b = sp.b;
			p.size = def.sz ? rnd(def.sz[0], def.sz[1]) : rnd(16, 24);
			p.sc = rnd(0.7, 1.4);
			p.rot = 0;
			p.vr = rnd(-1.2, 1.2);
			p.alpha = 1;
			p.ph = rnd(0, TAU);
			p.phv = rnd(0.8, 2);
			p.st = 0;
			p.t = 0;
			p.settled = 0;
			if (def.cl) { p.color = pick(def.cl); p.color2 = pick(def.cl); p.deco = Math.random() < 0.5 ? 1 : 0; }
			if (def.states) { p.state = pick(def.states); }
			var slow = def.slow ? 0.45 : 1;
			var b = p.b;
			p.x = rnd(0, vw);
			p.y = anywhere ? rnd(0, vh * 0.8) : (up ? vh + 30 : -30);
			p.vx = rnd(-8, 8);
			p.vy = rnd(14, 30) * slow * dirY();
			p.sw = 6;
			if (b === 'sway') { p.vy = rnd(8, 16) * slow * dirY(); p.sw = 22; p.vr = rnd(-0.6, 0.6); }
			if (b === 'tumble') { p.vr = rnd(-4, 4); p.sw = 10; }
			if (b === 'spin') { p.vy = rnd(4, 8) * dirY(); p.vr = rnd(0.5, 1); p.sw = 3; }
			if (b === 'wobble') { p.vy = rnd(6, 10); p.sw = 18; p.vr = 0; }
			if (b === 'flutter') {
				p.y = rnd(vh * 0.05, vh * 0.7);
				p.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(25, 55);
				p.vy = 0; p.vr = 0;
			}
			if (b === 'float') {
				p.x = rnd(vw * 0.05, vw * 0.95);
				p.y = waterY;
				p.vx = rnd(-4, 4); p.vy = 0; p.vr = 0;
			}
			if (b === 'rise') {
				p.y = anywhere ? rnd(vh * 0.3, vh) : vh + 20;
				p.vy = -rnd(15, 35); p.vr = 0; p.sw = 8;
			}
			if (b === 'grow') {
				p.y = vh + 20;
				p.gy = vh - rnd(30, 110);
				p.st = 1; p.vr = 0; p.vx = 0;
			}
			if (b === 'fly' || b === 'vee') {
				p.dir = Math.random() < 0.5 ? -1 : 1;
				p.x = p.dir > 0 ? -50 : vw + 50;
				p.y = def.low ? rnd(vh * 0.72, vh * 0.88) : rnd(vh * 0.08, vh * 0.55);
				p.vx = p.dir * rnd(30, 70) * slow;
				p.vy = 0; p.vr = 0;
				p.n = b === 'vee' ? 2 + ((Math.random() * 3) | 0) : 1;
				if (anywhere) { p.x = rnd(0, vw); }
			}
			if (b === 'pulse') {
				p.y = anywhere ? rnd(0, vh) : vh + 20;
				p.vy = -rnd(6, 12); p.vr = 0; p.sw = 10;
			}
			if (b === 'orbit') {
				p.x = rnd(vw * 0.15, vw * 0.85);
				p.y = rnd(vh * 0.15, vh * 0.6);
				p.vx = rnd(-5, 5); p.vy = rnd(-4, -1);
				p.orr = rnd(14, 22); p.vr = 0;
			}
			if (b === 'dangle') {
				p.x = rnd(vw * 0.1, vw * 0.9);
				p.y = 0;
				p.dy = water ? waterY - 40 : rnd(vh * 0.2, vh * 0.5);
				p.st = 1; p.t = 0; p.vr = 0;
			}
			if (b === 'hang') {
				p.x = rnd(vw * 0.05, vw * 0.95);
				p.len = rnd(30, 80);
				p.vr = 0;
			}
			if (b === 'toss') {
				p.dir = Math.random() < 0.5 ? -1 : 1;
				p.x = p.dir > 0 ? -20 : vw + 20;
				p.y = rnd(-40, 0);
				p.vx = p.dir * rnd(120, 220);
				p.vy = rnd(-30, 10);
				p.vr = rnd(-5, 5);
			}
			if (b === 'hop' || b === 'waddle' || b === 'chatter') {
				p.dir = Math.random() < 0.5 ? -1 : 1;
				p.x = anywhere ? rnd(0, vw) : (p.dir > 0 ? -30 : vw + 30);
				p.vx = p.dir * (b === 'hop' ? rnd(40, 80) : b === 'chatter' ? rnd(50, 90) : rnd(15, 30));
				p.vy = 0; p.vr = 0;
				p.hopH = rnd(20, 40);
			}
			if (b === 'dart') {
				p.hx = rnd(vw * 0.1, vw * 0.9);
				p.hy = rnd(vh * 0.1, vh * 0.66);
				p.x = p.hx; p.y = p.hy;
				p.st = 1; p.t = rnd(1, 2.5); p.darts = 4 + ((Math.random() * 3) | 0); p.vr = 0;
			}
			if (b === 'twinkle') {
				p.x = rnd(0, vw); p.y = rnd(0, vh * 0.85);
				p.vx = 2; p.vy = 0; p.vr = 0;
				p.t = rnd(6, 10);
			}
			if (b === 'jump') {
				p.st = 1; p.t = rnd(3, 10); p.vr = 0; /* waiting underwater */
			}
			return p;
		}

		function settleLand(p) {
			p.settled = 1;
			p.vy = 0;
			p.vx = rnd(-8, 8);
			p.t = 2;
			p.y = waterY;
			addRipple(p.x, waterY);
		}

		function step(p, dt, t) {
			var b = p.b, off = 40;
			p.ph += dt * p.phv;
			p.rot += p.vr * dt;
			switch (b) {
				case 'fall': case 'sway': case 'tumble': case 'spin':
					if (p.settled) {
						p.x += p.vx * dt;
						p.t -= dt;
						p.alpha = clamp(p.t / 2, 0, 1);
						if (p.t <= 0) { seed(p); }
						return;
					}
					p.x += p.vx * dt + Math.sin(p.ph) * p.sw * dt;
					p.y += p.vy * dt;
					if (p.sp.def.glint) { p.alpha = Math.random() < 0.03 ? 1 : 0.75; }
					if (!up && water && p.sp.def.st && p.y >= waterY) { settleLand(p); return; }
					if (p.y > vh + off || p.y < -off) { seed(p); }
					break;
				case 'wobble':
					p.x += Math.sin(p.ph) * 18 * dt + p.vx * dt * 0.3;
					p.y += p.vy * dt;
					p.alpha = 0.35 + 0.35 * Math.sin(p.ph * 0.7);
					if (p.y > vh + off) { seed(p); }
					break;
				case 'flutter':
					p.x += p.vx * dt;
					p.y += Math.sin(p.ph * 2) * 30 * dt;
					if (Math.random() < dt * 0.4) { p.vx = -p.vx; }
					if (p.x < -off || p.x > vw + off) { seed(p); }
					break;
				case 'float':
					p.x += p.vx * dt + Math.sin(p.ph * 0.4) * 4 * dt;
					p.y = waterY + Math.sin(p.ph) * 3;
					p.rot = Math.sin(p.ph) * 0.08;
					if (p.x < -off || p.x > vw + off) { seed(p); }
					break;
				case 'rise':
					p.x += Math.sin(p.ph) * p.sw * dt;
					p.y += p.vy * dt;
					p.alpha = clamp(p.y / (vh * 0.3), 0, 1);
					if (p.sp.kind === 'e' && p.sp.g === '💨') { p.sc += dt * 0.25; }
					if (p.y < -off) { seed(p); }
					break;
				case 'grow':
					if (p.st === 1) {
						p.y += (p.gy - p.y) * Math.min(1, dt * 2);
						if (Math.abs(p.y - p.gy) < 2) { p.st = 2; p.t = rnd(2, 4); }
					} else if (p.st === 2) {
						p.rot = Math.sin(p.ph) * 0.05;
						p.t -= dt;
						if (p.t <= 0) { p.st = 3; p.t = 1; }
					} else {
						p.t -= dt;
						p.alpha = clamp(p.t, 0, 1);
						if (p.t <= 0) { seed(p); }
					}
					break;
				case 'fly': case 'vee':
					p.x += p.vx * dt;
					p.y += Math.sin(p.ph) * 6 * dt;
					if ((p.dir > 0 && p.x > vw + 60) || (p.dir < 0 && p.x < -60)) { seed(p); }
					break;
				case 'pulse':
					p.x += Math.sin(p.ph) * p.sw * dt;
					p.y += p.vy * dt;
					if (p.y < -off) { seed(p); }
					break;
				case 'orbit':
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					if (p.y < -off || p.x < -off || p.x > vw + off) { seed(p); }
					break;
				case 'dangle':
					if (p.st === 1) { /* lowering */
						p.y += 40 * dt;
						if (p.y >= p.dy) { p.st = 2; p.t = rnd(1.5, 3); }
					} else if (p.st === 2) { /* pause */
						p.t -= dt;
						p.x += Math.sin(p.ph) * 3 * dt;
						if (p.t <= 0) { p.st = 3; }
					} else if (p.st === 3) { /* reeling up */
						p.y -= 60 * dt;
						if (p.y <= 0) { p.st = 4; p.t = rnd(3, 8); p.alpha = 0; }
					} else { /* off-screen wait */
						p.t -= dt;
						if (p.t <= 0) { seed(p); p.alpha = 1; }
					}
					break;
				case 'hang':
					p.rot = Math.sin(p.ph) * 0.12;
					break;
				case 'toss':
					p.vy += 160 * dt;
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					if (p.y > vh + off || p.x < -60 || p.x > vw + 60) { seed(p); }
					break;
				case 'hop':
					p.x += p.vx * dt;
					p.y = ground - Math.abs(Math.sin(p.ph * 3)) * p.hopH;
					if (p.x < -60 || p.x > vw + 60) { seed(p); }
					break;
				case 'waddle': case 'chatter':
					p.x += p.vx * dt;
					p.y = ground + Math.sin(p.ph * 6) * 2;
					p.rot = Math.sin(p.ph * 6) * 0.08;
					if (b === 'chatter') { p.frame = ((t / 160) | 0) % 2; }
					if (p.x < -60 || p.x > vw + 60) { seed(p); }
					break;
				case 'dart':
					if (p.st === 1) { /* hover */
						p.x = p.hx + Math.sin(p.ph * 5) * 3;
						p.y = p.hy + Math.cos(p.ph * 4) * 3;
						p.t -= dt;
						if (p.t <= 0) {
							p.st = 2;
							p.tx = clamp(p.hx + rnd(-150, 150), 20, vw - 20);
							p.ty = clamp(p.hy + rnd(-100, 100), 20, vh * 0.7);
						}
					} else { /* zip */
						p.x += (p.tx - p.x) * Math.min(1, dt * 6);
						p.y += (p.ty - p.y) * Math.min(1, dt * 6);
						if (Math.abs(p.x - p.tx) < 4 && Math.abs(p.y - p.ty) < 4) {
							p.hx = p.tx; p.hy = p.ty;
							p.st = 1; p.t = rnd(1, 2.5);
							if (--p.darts <= 0) { seed(p); }
						}
					}
					break;
				case 'twinkle':
					p.alpha = 0.25 + 0.75 * Math.abs(Math.sin(p.ph));
					p.x += p.vx * dt;
					p.t -= dt;
					if (p.t <= 0) { seed(p, true); p.t = rnd(6, 10); }
					break;
				case 'jump':
					if (p.st === 1) { /* under the surface */
						p.alpha = 0;
						p.t -= dt;
						if (p.t <= 0) {
							p.st = 2;
							p.x = rnd(vw * 0.1, vw * 0.9);
							p.y = waterY + 6;
							p.vy = -rnd(290, 350);
							p.vx = rnd(-40, 40);
							p.alpha = 1;
							addRipple(p.x, waterY);
						}
					} else { /* airborne arc */
						p.vy += 420 * dt;
						p.x += p.vx * dt;
						p.y += p.vy * dt;
						p.rot = Math.atan2(p.vy, p.vx * 4) * 0.5;
						if (p.vy > 0 && p.y >= waterY) { /* splash back */
							addRipple(p.x, waterY, true);
							p.st = 1; p.t = rnd(4, 12); p.alpha = 0;
						}
					}
					break;
			}
		}

		function drawGlyph(p, s) {
			var sp = p.sp;
			if (sp.kind === 'e' || sp.kind === 't') {
				cx.font = Math.round(p.size * s) + 'px sans-serif';
				cx.textAlign = 'center';
				cx.textBaseline = 'middle';
				if (sp.def.glow) {
					cx.save();
					cx.globalAlpha *= 0.35;
					cx.fillStyle = '#FF922B';
					cx.beginPath();
					cx.arc(0, 0, p.size * 0.65 * s, 0, TAU);
					cx.fill();
					cx.restore();
				}
				if (sp.kind === 't') { cx.fillStyle = sp.color; }
				cx.fillText(sp.g, 0, 0);
			} else if (sp.kind === 's') {
				var key = sp.s === 'teeth' ? 'teeth' + (p.frame || 0) : sp.s;
				var im = sprite(key);
				if (im.ready) {
					var w = p.size * 1.3 * s, h = w * im.ratio;
					cx.drawImage(im.img, -w / 2, -h / 2, w, h);
				}
			} else if (sp.kind === 'c') {
				PRIMS[sp.c](cx, p, s);
			}
		}

		function drawP(p, t) {
			if (p.alpha <= 0) { return; }
			var b = p.b;
			cx.save();
			cx.globalAlpha = alphaBase * clamp(p.alpha, 0, 1);
			/* threads first (unrotated, from the top edge) */
			if (b === 'dangle' && p.st !== 4) {
				cx.strokeStyle = 'rgba(90,90,90,.6)';
				cx.lineWidth = 1;
				cx.beginPath(); cx.moveTo(p.x, 0); cx.lineTo(p.x, p.y); cx.stroke();
			}
			if (b === 'hang') {
				cx.strokeStyle = 'rgba(120,120,120,.5)';
				cx.lineWidth = 1;
				cx.beginPath(); cx.moveTo(p.x, 0); cx.lineTo(p.x + Math.sin(p.ph) * 8, p.len); cx.stroke();
			}
			var px = p.x, py = p.y;
			if (b === 'hang') { px = p.x + Math.sin(p.ph) * 8; py = p.len + p.size * 0.5; }
			cx.translate(px, py);
			if (p.rot) { cx.rotate(p.rot); }
			var s = p.sc;
			if (b === 'pulse') { s *= 1 + 0.18 * Math.sin(p.ph * 2.2); }
			if (b === 'orbit') { /* two glyphs circling each other */
				for (var k = 0; k < 2; k++) {
					cx.save();
					cx.translate(Math.cos(p.ph + k * Math.PI) * p.orr, Math.sin(p.ph + k * Math.PI) * p.orr * 0.5);
					drawGlyph(p, s * 0.85);
					cx.restore();
				}
			} else if (b === 'vee') { /* small V formation */
				var offs = [[0, 0], [-24, 12], [-24, -12], [-48, 24]];
				for (var m = 0; m < p.n && m < offs.length; m++) {
					cx.save();
					/* trailing birds sit BEHIND the leader */
					cx.translate(offs[m][0] * (p.dir > 0 ? 1 : -1), offs[m][1]);
					drawGlyph(p, s * (m ? 0.85 : 1));
					cx.restore();
				}
			} else if (p.sp.def.worm && p.b === 'dangle' && p.st === 2) {
				drawGlyph(p, s);
				cx.font = Math.round(p.size * 0.7) + 'px sans-serif';
				cx.fillText(drawable('🪱') ? '🪱' : '~', 0, p.size * 0.8);
			} else {
				drawGlyph(p, s);
			}
			cx.restore();
		}

		/* --- Burst mode (New Year's): the firework emitter + auto-year. --- */
		var nextBurst = 0, yearFx = null;
		var yearNow = new Date();
		var yearText = String(yearNow.getFullYear() + (yearNow.getMonth() >= 6 ? 1 : 0));
		var sparkCl = A.sparkCl || ['#FFD43B', '#CED4DA'];
		function fire(t) {
			var bx = rnd(vw * 0.2, vw * 0.8), by = rnd(vh * 0.15, vh * 0.45), n = 0;
			for (var k = 0; k < parts.length && n < 9; k++) {
				var p = parts[k];
				if (p.b === 'twinkle' || p.b === 'rise') { continue; }
				var a = rnd(0, TAU), sp = rnd(40, 110);
				p.b = 'spark';
				p.x = bx; p.y = by;
				p.vx = Math.cos(a) * sp;
				p.vy = Math.sin(a) * sp;
				p.sparkUntil = t + rnd(1100, 2000);
				p.sparkColor = pick(sparkCl);
				p.alpha = 1;
				n++;
			}
			yearFx = { x: bx, y: by, a: 1.4 };
			nextBurst = t + rnd(2800, 5800);
		}
		function stepSpark(p, dt, t) {
			p.vy += 70 * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.alpha = clamp((p.sparkUntil - t) / 900, 0, 1);
			if (t > p.sparkUntil) { seed(p); }
		}
		function drawSpark(p) {
			cx.save();
			cx.globalAlpha = alphaBase * clamp(p.alpha, 0, 1);
			cx.fillStyle = p.sparkColor;
			cx.fillRect(p.x - 2, p.y - 2, 4, 4);
			cx.restore();
		}

		/* --- Heroes: rare crossers. The heron is always in the rotation. --- */
		var hero = null, heroNext = 0;
		var heroPool = ['heron'];
		if (A.hero) { heroPool.push(A.hero); }
		function spawnHero(t) {
			var kind = pick(heroPool);
			var dir = Math.random() < 0.5 ? -1 : 1;
			hero = { kind: kind, dir: dir, t: 0, ph: 0, done: false };
			if (kind === 'heron') {
				hero.x = dir > 0 ? -110 : vw + 110;
				hero.y = rnd(vh * 0.15, vh * 0.45);
				hero.vx = dir * rnd(60, 90);
				hero.w = 96;
				sprite('heron0'); sprite('heron1');
			} else if (kind === 'eagle' || kind === 'witch') {
				var g = kind === 'eagle' ? '🦅' : '🧙‍♀️';
				if (!drawable(g)) { hero = null; heroNext = t + 5000; return; }
				hero.g = g;
				hero.x = dir > 0 ? -60 : vw + 60;
				hero.y = rnd(vh * 0.1, vh * 0.4);
				hero.vx = dir * rnd(70, 110);
			} else if (kind === 'sleigh') {
				hero.x = dir > 0 ? -140 : vw + 140;
				hero.y = rnd(vh * 0.08, vh * 0.3);
				hero.vx = dir * rnd(80, 120);
				hero.w = 120;
				sprite('sleigh');
			} else if (kind === 'manatee') {
				hero.x = dir > 0 ? -110 : vw + 110;
				hero.y = vh * 0.955;
				hero.vx = dir * rnd(22, 34);
				hero.w = 96;
				hero.rip = 0;
				sprite('manatee');
			} else if (kind === 'bass') {
				hero.x = rnd(vw * 0.15, vw * 0.85);
				hero.y = waterY + 8;
				hero.vy = -rnd(340, 400);
				hero.vxj = rnd(-50, 50);
				addRipple(hero.x, waterY, true);
			} else if (kind === 'ducks') {
				hero.x = dir > 0 ? -90 : vw + 90;
				hero.y = ground;
				hero.vx = dir * rnd(30, 45);
			} else if (kind === 'rainbow') {
				hero.corner = Math.random() < 0.5 ? 0 : 1;
				hero.t = 0;
				sprite('rainbow');
			}
		}
		function stepHero(dt, t) {
			if (!hero) {
				if (!heroNext) { heroNext = t + rnd(heroEvery[0], heroEvery[1]) * 1000; }
				else if (t >= heroNext) { spawnHero(t); heroNext = 0; }
				return;
			}
			var h = hero;
			h.ph += dt * 2;
			h.t += dt;
			if (h.kind === 'rainbow') {
				if (h.t > 6) { hero = null; } /* 1s in + 4s hold + 1s out */
				return;
			}
			if (h.kind === 'bass') {
				h.vy += 420 * dt;
				h.x += h.vxj * dt;
				h.y += h.vy * dt;
				if (h.vy > 0 && h.y >= waterY) { addRipple(h.x, waterY, true); hero = null; }
				return;
			}
			h.x += h.vx * dt;
			if (h.kind !== 'manatee' && h.kind !== 'ducks') { h.y += Math.sin(h.ph) * 8 * dt; }
			if (h.kind === 'manatee') {
				h.rip -= dt;
				if (h.rip <= 0) { addRipple(h.x + h.dir * 40, waterY + 2); h.rip = rnd(2, 4); }
			}
			if ((h.dir > 0 && h.x > vw + 150) || (h.dir < 0 && h.x < -150)) { hero = null; }
		}
		function drawHero(t) {
			if (!hero) { return; }
			var h = hero;
			cx.save();
			if (h.kind === 'rainbow') {
				var a = h.t < 1 ? h.t : (h.t > 5 ? clamp(6 - h.t, 0, 1) : 1);
				cx.globalAlpha = clamp(alphaBase * 1.6 * a, 0, 1);
				var im = sprite('rainbow');
				if (im.ready) {
					var w = 150, hh = w * im.ratio;
					var x = h.corner ? vw - w - 10 : 10;
					cx.drawImage(im.img, x, vh - hh - 6, w, hh);
				}
				cx.restore();
				return;
			}
			cx.globalAlpha = Math.min(1, alphaBase * 2) * (h.kind === 'manatee' ? 0.55 : 1);
			cx.translate(h.x, h.y);
			if (h.kind === 'heron') {
				var frame = ((t / 400) | 0) % 2;
				var him = sprite('heron' + frame);
				if (him.ready) {
					if (h.dir > 0) { cx.scale(-1, 1); } /* art faces left */
					cx.drawImage(him.img, -h.w / 2, -h.w * him.ratio / 2, h.w, h.w * him.ratio);
				}
			} else if (h.kind === 'sleigh' || h.kind === 'manatee') {
				var sim = sprite(h.kind);
				if (sim.ready) {
					if (h.dir > 0) { cx.scale(-1, 1); }
					cx.drawImage(sim.img, -h.w / 2, -h.w * sim.ratio / 2, h.w, h.w * sim.ratio);
				}
			} else if (h.kind === 'eagle' || h.kind === 'witch') {
				cx.font = '42px sans-serif';
				cx.textAlign = 'center';
				cx.textBaseline = 'middle';
				if (h.kind === 'witch') { cx.rotate(h.dir * -0.15); }
				cx.fillText(h.g, 0, 0);
			} else if (h.kind === 'ducks') {
				cx.font = '30px sans-serif';
				cx.textAlign = 'center';
				cx.textBaseline = 'middle';
				var duck = drawable('🦆') ? '🦆' : '🐤';
				var chick = drawable('🐥') ? '🐥' : '🐤';
				cx.fillText(duck, 0, Math.sin(h.ph * 3) * 2);
				cx.font = '20px sans-serif';
				cx.fillText(chick, -h.dir * 30, Math.sin(h.ph * 3 + 1) * 2);
				cx.fillText(chick, -h.dir * 54, Math.sin(h.ph * 3 + 2) * 2);
			}
			cx.restore();
		}

		/* --- Size first (waterY/ground must exist), then seed. --- */
		applySize();
		for (var i = 0; i < maxParts && pool.length; i++) { parts.push(seed({}, true)); }

		var running = !D.hidden, last = 0, raf = 0;
		function frame(t) {
			raf = 0;
			if (!running) { return; }
			var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
			last = t;
			cx.clearRect(0, 0, vw, vh);
			if (burstMode) {
				if (!nextBurst) { nextBurst = t + 1500; }
				else if (t >= nextBurst) { fire(t); }
				if (yearFx) {
					yearFx.a -= dt * 0.7;
					yearFx.y -= dt * 12;
					if (yearFx.a <= 0) { yearFx = null; }
					else {
						cx.save();
						cx.globalAlpha = clamp(alphaBase * 1.8 * clamp(yearFx.a, 0, 1), 0, 1);
						cx.fillStyle = sparkCl[0];
						cx.font = 'bold 34px sans-serif';
						cx.textAlign = 'center';
						cx.fillText(yearText, yearFx.x, yearFx.y);
						cx.restore();
					}
				}
			}
			stepRipples(dt);
			drawRipples();
			for (var k = 0; k < parts.length; k++) {
				var p = parts[k];
				if (p.b === 'spark') { stepSpark(p, dt, t); drawSpark(p); continue; }
				step(p, dt, t);
				drawP(p, t);
			}
			stepHero(dt, t);
			drawHero(t);
			raf = W.requestAnimationFrame(frame);
		}
		function play() { if (!raf && running) { last = 0; raf = W.requestAnimationFrame(frame); } }
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

	W.DCCSeasonsEngine = { start: start };
})();
