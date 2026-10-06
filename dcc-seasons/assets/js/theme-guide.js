/**
 * DCC Seasons — the Theme guide tab (admin only, 4.4.0).
 *
 * Builds one card per theme from two live sources and nothing else:
 *   - window.DCCSeasonsGuideData — Theme_Guide::payload(): the same theme
 *     config the front end gets, the saved settings, and each theme's days
 *     this year walked through the real schedule resolver;
 *   - DCCSeasonsEngine.guide — engine.js itself: its sprites, corner
 *     accents, scene lists, timing and phone-scaling functions.
 * So every picture is the engine's own drawing and every count comes from
 * the engine's own rule. Nothing here names a theme or an effect.
 */
(function () {
	'use strict';
	var D = window.DCCSeasonsGuideData;
	var root = document.getElementById('dcc-seasons-guide');
	if (!root || !D) { return; }
	var E = window.DCCSeasonsEngine && window.DCCSeasonsEngine.guide;
	var T = D.i18n;
	if (!E) { root.innerHTML = ''; root.appendChild(el('p', 'notice notice-error dcc-guide-error', T.loadError)); return; }

	var S = D.settings, N = D.names;
	/* What actually runs, from the same gates the plugin and engine use:
	 * the loader fetches the engine only with Ambient on (ambient.js), the
	 * corner accents and scenes need Full richness, heroes anything but
	 * Minimal, scenes also the "scenes" toggle. */
	var engineOn = S.enabled && S.ambient;
	var on = {
		sprites: engineOn,
		subtle: engineOn && S.subtle,
		accent: engineOn && S.richness === 'full',
		scenes: engineOn && S.richness === 'full' && S.vignettes,
		hero: engineOn && S.richness !== 'minimal',
		egg: S.enabled && S.egg
	};
	var BOATS_BIRDS = ' cruise fly vee ';

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text != null) { n.textContent = text; }
		return n;
	}
	function fmt(s) {
		var a = arguments;
		return String(s).replace(/%(\d)\$s|%s|%d/g, function (m, i) { return i ? a[+i] : a[1]; });
	}
	function range(r) { return r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1]; }
	function spriteImg(key, name, cls) {
		var raw = E.svgs[key];
		if (!raw) { return el('span', 'dcc-guide-missing', name); }
		var img = el('img', cls || 'dcc-guide-pic');
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(E.svgDoc(raw));
		img.alt = name;
		img.title = name;
		img.loading = 'lazy';
		return img;
	}
	function glyph(g, name) {
		var s = el('span', 'dcc-guide-glyph', g);
		s.setAttribute('role', 'img');
		s.setAttribute('aria-label', name);
		s.title = name;
		return s;
	}
	function spriteName(key) { return (N.sprites && N.sprites[key]) || key; }
	/* A particle drawn by code rather than a sprite (star, heart, egg…):
	 * the engine's own PRIMS function, once per colour the theme gives it. */
	function primPic(c, color, color2, name) {
		var cv = el('canvas', 'dcc-guide-prim'), dpr = Math.min(window.devicePixelRatio || 1, 2), z = 34;
		cv.width = cv.height = z * dpr;
		cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', name); cv.title = name;
		var g = cv.getContext('2d');
		if (g && E.prims[c]) {
			g.scale(dpr, dpr); g.translate(z / 2, z / 2);
			try { E.prims[c](g, { size: 26, color: color, color2: color2 || color, deco: 0, shim: 0 }, 1, 0); } catch (e) { /* shown blank */ }
		}
		return cv;
	}
	/* What a particle spec looks like: its sprites, its shape, or its glyph. */
	function specLook(def) {
		if (def.s) {
			var keys = Array.isArray(def.s) ? def.s : [def.s], seen = {}, names = [];
			keys.forEach(function (k) { var n = spriteName(k); if (!seen[n]) { seen[n] = 1; names.push(n); } });
			return { id: 's:' + keys.join('|'), name: names.join(' / '), pics: function () { return keys.map(function (k) { return spriteImg(k, spriteName(k)); }); } };
		}
		if (def.c) {
			var nm = (N.prims && N.prims[def.c]) || def.c, cl = (def.cl || ['#888888']).slice(0, 5);
			return { id: 'c:' + def.c + ':' + cl.join(), name: nm, pics: function () { return cl.map(function (col, i) { return primPic(def.c, col, cl[(i + 1) % cl.length], nm); }); } };
		}
		var gl = def.e || def.f || '*';
		return { id: 'e:' + gl, name: gl, pics: function () { return [glyph(gl, gl)]; } };
	}

	/* A section of a card: label, optional "switched off" tag, then rows. */
	function section(label, isOn) {
		var sec = el('section', 'dcc-guide-sec');
		var h = el('h3', 'dcc-guide-label', label);
		if (!isOn) { h.appendChild(el('span', 'dcc-guide-off', T.off)); }
		sec.appendChild(h);
		if (!isOn) { sec.classList.add('is-off'); }
		return sec;
	}
	function item(pics, name, meta) {
		var row = el('div', 'dcc-guide-item');
		var p = el('div', 'dcc-guide-pics');
		pics.forEach(function (x) { p.appendChild(x); });
		row.appendChild(p);
		var t = el('div', 'dcc-guide-text');
		t.appendChild(el('span', 'dcc-guide-name', name));
		if (meta) { t.appendChild(el('span', 'dcc-guide-meta', meta)); }
		row.appendChild(t);
		return row;
	}

	/* The background layer, drawn by the engine's own effect code. */
	function subtlePreview(key, name) {
		var kit, eff, c = el('canvas', 'dcc-guide-subtle');
		var W = 168, H = 96, dpr = Math.min(window.devicePixelRatio || 1, 2);
		c.width = W * dpr; c.height = H * dpr;
		c.setAttribute('role', 'img');
		c.setAttribute('aria-label', name);
		c.title = name;
		var cx = c.getContext('2d');
		if (!cx) { return c; }
		try {
			kit = E.subtleKit({ cx: cx, vw: W, vh: H });
			eff = kit[key];
		} catch (e) { eff = null; }
		if (!eff) { return c; }
		cx.scale(dpr, dpr);
		var ps = [], i, k;
		for (i = 0; i < eff.n; i++) { var p = {}; eff.seed(p, true); p.al = 0.65 + Math.random() * 0.35; ps.push(p); }
		/* A moment of motion, respawning anything that leaves the box, as
		 * the engine does at the screen's edge. */
		for (k = 0; k < 30; k++) {
			for (i = 0; i < ps.length; i++) {
				eff.step(ps[i], 1 / 30);
				if (ps[i].y > H + 12 || ps[i].y < -12 || ps[i].x < -12 || ps[i].x > W + 12) { eff.seed(ps[i], false); ps[i].al = 0.65 + Math.random() * 0.35; }
			}
		}
		/* Brighter than on the site, where it sits under the page at the
		 * owner's intensity: a thumbnail has to show the shapes. */
		var a = Math.min(1, eff.a * 2.4);
		for (i = 0; i < ps.length; i++) {
			cx.save();
			cx.globalAlpha = Math.min(1, a * ps[i].al);
			eff.draw(ps[i]);
			cx.restore();
		}
		return c;
	}

	/* Expected sprites on screen at a width, by the engine's own rule. */
	function counts(A, specs, w) {
		var total = E.target(A, S.density, w);
		var copy = specs.map(function (s) { return { wt: s.wt, def: s.def }; });
		E.shares(copy, total, w);
		return { total: total, shares: copy.map(function (s) { return s.share; }) };
	}
	function shown(n) {
		if (n > 0 && Math.round(n) === 0) { return T.lessThanOne; }
		return String(Math.round(n));
	}

	function card(key) {
		var th = D.themes[key] || {}, A = th.ambient || null;
		var name = D.labels[key] || key;
		var c = el('article', 'dcc-guide-card');
		c.id = 'dcc-guide-' + key;
		var head = el('header', 'dcc-guide-head');
		head.appendChild(el('h2', 'dcc-guide-title', name));
		var runs = D.runs[key];
		if (runs && runs.length) {
			var dl = el('p', 'dcc-guide-dates');
			dl.appendChild(el('span', 'dcc-guide-year', fmt(T.datesIn, D.year)));
			dl.appendChild(document.createTextNode(' ' + runs.map(function (r) {
				var a = new Date(r[0] + 'T12:00:00'), b = new Date(r[1] + 'T12:00:00');
				var f = { month: 'short', day: 'numeric' };
				return range([a.toLocaleDateString(undefined, f), b.toLocaleDateString(undefined, f)]);
			}).join(', ')));
			head.appendChild(dl);
		} else {
			head.appendChild(el('p', 'dcc-guide-unsched', T.notScheduled));
		}
		var url = D.preview[key];
		if (url) {
			var pl = el('p', 'dcc-guide-preview');
			var a = el('a', null, url);
			a.href = url; a.target = '_blank'; a.rel = 'noopener';
			a.setAttribute('aria-label', T.preview + ': ' + name + ' ' + T.newTab);
			pl.appendChild(a);
			head.appendChild(pl);
		}
		c.appendChild(head);

		var accent = E.accents[key];
		var accentMounted = !!accent && S.richness === 'full';

		/* Falling/drifting sprites and boats/birds, with counts. A sprite
		 * marked xa sits out of the pool while the corner accent is up (it
		 * takes turns with it instead — see Special). */
		if (A && A.particles && A.particles.length) {
			var specs = [], turnDef = null;
			A.particles.forEach(function (def) {
				if (def.xa && accentMounted) { turnDef = def; return; }
				specs.push({ wt: def.w || 1, def: def });
			});
			var big = counts(A, specs, 1280), small = counts(A, specs, 390);
			var groups = [[], []];
			var merged = {};
			specs.forEach(function (sp, i) {
				var look = specLook(sp.def), id = look.id;
				var g = BOATS_BIRDS.indexOf(' ' + (sp.def.b || 'fall') + ' ') >= 0 ? 1 : 0;
				if (!merged[id]) { merged[id] = { look: look, big: 0, small: 0 }; groups[g].push(merged[id]); }
				merged[id].big += big.shares[i];
				merged[id].small += small.shares[i];
			});
			[T.sprites, T.boatsBirds].forEach(function (label, g) {
				if (!groups[g].length) { return; }
				var sec = section(label, on.sprites);
				if (g === 0) { sec.appendChild(el('p', 'dcc-guide-total', fmt(T.onScreen, big.total, small.total))); }
				groups[g].forEach(function (m) {
					sec.appendChild(item(m.look.pics(), m.look.name, fmt(T.onScreen, shown(m.big), shown(m.small))));
				});
				c.appendChild(sec);
			});
		}

		/* The background layer */
		var sub = D.subtle[key];
		if (sub && sub.key) {
			var ss = section(T.subtle, on.subtle);
			ss.appendChild(item([subtlePreview(sub.key, sub.name)], sub.name));
			c.appendChild(ss);
		}

		/* Corner accent */
		if (accent) {
			var as = section(T.accent, on.accent);
			as.appendChild(item([spriteImg(accent[0], spriteName(accent[0]))], spriteName(accent[0]), T.accentNote));
			c.appendChild(as);
		}

		/* Scenes */
		var scenes = (E.vigs[key] || []).map(function (s) { return [s, false]; });
		if (S.evening) { (E.eveningVigs[key] || []).forEach(function (s) { scenes.push([s, true]); }); }
		if (scenes.length) {
			var vs = section(T.scenes, on.scenes);
			vs.appendChild(el('p', 'dcc-guide-total', fmt(T.sceneTiming, range(E.timing.vigFirst), range(E.timing.vigGap)) +
				(scenes.length > 1 ? ' ' + T.oneOf : '')));
			scenes.forEach(function (s) {
				var nm = (N.scenes && N.scenes[s[0]]) || s[0];
				vs.appendChild(item([spriteImg(E.sceneArt[s[0]], nm)], nm, s[1] ? T.evenings : ''));
			});
			c.appendChild(vs);
		}

		/* Hero: the heron, or the theme's own, picked at random per crossing */
		if (A) {
			var pool = ['heron'];
			if (A.hero && pool.indexOf(A.hero) < 0) { pool.push(A.hero); }
			var hs = section(T.hero, on.hero);
			hs.appendChild(el('p', 'dcc-guide-total', fmt(T.heroTiming, range(E.timing.heroFirst), range(D.heroEvery || E.timing.heroEvery))));
			pool.forEach(function (h) {
				var nm = (N.heroes && N.heroes[h]) || h;
				var pics = [spriteImg(E.heroArt[h], nm)];
				if (E.heroGlyphs[h]) { pics.push(glyph(E.heroGlyphs[h], nm)); }
				hs.appendChild(item(pics, nm));
			});
			c.appendChild(hs);
		}

		/* Special behaviour */
		var sp = [];
		if (turnDef && accent) {
			var tk = Array.isArray(turnDef.s) ? turnDef.s[0] : turnDef.s;
			sp.push([[spriteImg(tk, spriteName(tk)), spriteImg(accent[0], spriteName(accent[0]))],
				fmt(T.turns, spriteName(tk), spriteName(accent[0]).toLowerCase(), E.timing.xaTurn), on.accent]);
		}
		if (A && A.phoneMin) { sp.push([[], fmt(T.phoneMin, A.phoneMin), on.sprites]); }
		if (key === E.countdown) { sp.push([[], T.countdown, on.scenes]); }
		sp.forEach(function (x) {
			var s2 = section(T.special, x[2]);
			s2.appendChild(item(x[0], x[1]));
			c.appendChild(s2);
		});

		/* The logo egg */
		var egg = th.egg;
		if (egg) {
			var es = section(T.egg, on.egg);
			var pics = [];
			(egg.colors || []).forEach(function (col) {
				var sw = el('span', 'dcc-guide-swatch');
				sw.style.background = col;
				sw.setAttribute('role', 'img');
				sw.setAttribute('aria-label', col);
				sw.title = col;
				pics.push(sw);
			});
			var gl = el('span', 'dcc-guide-eggglyphs', (egg.glyphs || []).join(' '));
			gl.style.color = (egg.colors || [])[0] || '';
			pics.push(gl);
			if (egg.finale) { pics.push(glyph(egg.finale, T.egg)); }
			es.appendChild(item(pics, T.eggNote));
			c.appendChild(es);
		}
		return c;
	}

	/* Order: through the year as scheduled, unscheduled last. */
	var keys = Object.keys(D.labels);
	var first = function (k) { return D.runs[k] && D.runs[k].length ? D.runs[k][0][0] : '9999'; };
	keys.sort(function (a, b) { var x = first(a), y = first(b); return x < y ? -1 : x > y ? 1 : keys.indexOf(a) - keys.indexOf(b); });

	root.innerHTML = '';
	root.appendChild(el('p', 'description dcc-guide-intro', T.intro));
	if (!S.enabled) { root.appendChild(el('p', 'notice notice-warning inline dcc-guide-note', T.masterOff)); }
	else if (!S.ambient) { root.appendChild(el('p', 'notice notice-info inline dcc-guide-note', T.engineOff)); }
	var grid = el('div', 'dcc-guide-grid');
	keys.forEach(function (k) { grid.appendChild(card(k)); });
	root.appendChild(grid);
})();
