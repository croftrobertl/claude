/* DCC Seasons — Thanksgiving's art (4.13.4): its falling pieces, the
 * cornucopia, and the strutting tom with his poults, moved out of engine.js
 * so a visit outside November does not fetch them. The loader fetches this
 * file only for Thanksgiving (CFG.art), before the engine, which reads
 * window.DCCSeasonsArt when it runs. Unchanged drawing for drawing: every
 * line below is 4.13.3's, with SVGS (the engine's registry) read as this
 * file's own S. */
(function (W) {
	'use strict';
	/* TG_GEN_START — 4.13.2 Thanksgiving: three drawings built from their
	 * rules at load, so the engine carries the rule, not kilobytes of
	 * points (as the Christmas palm and wreath do). tools/tg-pieces.js
	 * renders these SAME functions for Rob's sheet. */
	function tgF(v) { return Math.round(v * 10) / 10; }
	/* the bald cypress branchlet, over the photographed one: a thin stem,
	 * soft flat needles in two rows 55 degrees off it, longest mid-way,
	 * yellow-green going rust at the tips */
	function tgCypress() {   /* B, bolder: Rob's pick (A, the finer one, is gone) */
		var A = [82, 46], B = [338, 140], ox = 56, oy = -24, an = 1.12, nw = 5.4, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy);
		var ux = dx / L, uy = dy / L, nx = -uy, ny = ux, nd = '', tp = '', i, sd;
		function f(x, y) { return tgF(x - ox) + ' ' + tgF(y - oy); }
		for (i = 0; i < 22; i++) {
			var t = 0.03 + i / 22 * 0.94, bx = A[0] + dx * t, by = A[1] + dy * t;
			var len = (54) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.05))) * (t > 0.85 ? 0.85 : 1);
			for (sd = -1; sd <= 1; sd += 2) {
				var al = Math.cos(an), ou = Math.sin(an) * sd, vx = ux * al + nx * ou, vy = uy * al + ny * ou;
				var tx = bx + vx * len, ty = by + vy * len, px = -vy * nw, py = vx * nw, hx = bx + vx * len * 0.5, hy = by + vy * len * 0.5;
				nd += 'M' + f(bx, by) + 'Q' + f(hx + px, hy + py) + ' ' + f(tx, ty) + 'Q' + f(hx - px, hy - py) + ' ' + f(bx, by) + 'Z';
				var mx = bx + vx * len * (0.48), my = by + vy * len * (0.48);
				tp += 'M' + f(mx + px * 0.7, my + py * 0.7) + 'Q' + f(tx + vx * 1.5, ty + vy * 1.5) + ' ' + f(mx - px * 0.7, my - py * 0.7) + 'Z';
			}
		}
		return ('320 228') + '|<defs><linearGradient id="dccTgY1" y2=".4"><stop stop-color="' + ('#B09A4E') + '"/><stop offset=".55" stop-color="' + ('#C8763A') + '"/><stop offset="1" stop-color="' + ('#A8442A') + '"/></linearGradient></defs>' +
			'<path d="' + nd + '" fill="url(#dccTgY1)" stroke="' + ('#6E3418') + '" stroke-width="' + (1.4) + '"/><path d="' + tp + '" fill="' + ('#9A3E22') + '" opacity=".9"/>' +
			'<path d="M' + (A[0] - ox - 8) + ' ' + (A[1] - oy - 3) + 'L' + (B[0] - ox) + ' ' + (B[1] - oy) + '" stroke="' + ('#6A5226') + '" stroke-width="' + (3.4) + '" stroke-linecap="round"/>';
	}
	/* the whole pumpkin pie, retraced (4.13.2) over "Pumpkin Pie" (USDA ARS
	 * image d260-1, Peggy Greb, public domain): the crust's outer rim and
	 * the open filling as the photo's two ellipses (seen from the same
	 * height, 0.49 deep), the fluted crimp browned at its tips, a matte
	 * orange filling deeper toward the edge and pitted with small pores, and
	 * the foil pan's sliver below. No steam (Rob). */
	function tgPie() {
		var cr = '', po = '', i, n = 40;
		for (i = 0; i < n; i++) {
			var a = i / n * Math.PI * 2, x = 250 + Math.cos(a) * 226, y = 128 + Math.sin(a) * 111, r = Math.atan2(Math.cos(a) * 111, -Math.sin(a) * 226) * 180 / Math.PI;
			cr += '<ellipse cx="' + tgF(x) + '" cy="' + tgF(y) + '" rx="13" ry="' + tgF(8 + 3 * Math.max(0, Math.sin(a))) + '" transform="rotate(' + tgF(r + 90) + ' ' + tgF(x) + ' ' + tgF(y) + ')"/>';
		}
		for (i = 0; i < 70; i++) {
			var u = Math.sin(i * 12.9898) * 43758.5453, v = Math.sin(i * 78.233) * 43758.5453; u -= Math.floor(u); v -= Math.floor(v);
			var ra = Math.sqrt(u) * 0.92, an = v * Math.PI * 2;
			po += '<ellipse cx="' + tgF(247 + Math.cos(an) * ra * 198) + '" cy="' + tgF(134 + Math.sin(an) * ra * 94) + '" rx="' + tgF(1.6 + u * 2) + '" ry="' + tgF(1 + v * 1.1) + '"/>';
		}
		/* the foil tin under the crust (Rob: "a floating orange disc"): its
		 * fluted side wall slopes in from the rim to a smaller base, seen
		 * from the photo's height, with a soft shadow below it */
		var wl = '', fl = '';
		for (i = 0; i <= 24; i++) { var b2 = i / 24 * Math.PI; wl += (i ? 'L' : 'M') + tgF(250 + Math.cos(b2) * 246) + ' ' + tgF(132 + Math.sin(b2) * 121); }
		for (i = 24; i >= 0; i--) { var b3 = i / 24 * Math.PI; wl += 'L' + tgF(250 + Math.cos(b3) * 208) + ' ' + tgF(184 + Math.sin(b3) * 102); }
		for (i = 1; i < 30; i++) { var b4 = i / 30 * Math.PI; fl += 'M' + tgF(250 + Math.cos(b4) * 245) + ' ' + tgF(132 + Math.sin(b4) * 120) + 'L' + tgF(250 + Math.cos(b4) * 209) + ' ' + tgF(184 + Math.sin(b4) * 101); }
		return '504 316|<defs><radialGradient id="dccTgI1f" cx=".44" cy=".38" r=".66"><stop stop-color="#E2A04A"/><stop offset=".6" stop-color="#D08838"/><stop offset=".9" stop-color="#B56A26"/><stop offset="1" stop-color="#9A561C"/></radialGradient>' +
			'<radialGradient id="dccTgI1c" cy=".35" r=".7"><stop stop-color="#F0DCAE"/><stop offset=".7" stop-color="#E2C48C"/><stop offset="1" stop-color="#C99A5A"/></radialGradient>' +
			'<radialGradient id="dccTgI1k" cy=".3" r=".7"><stop stop-color="#F4E4BE"/><stop offset=".7" stop-color="#DDBE84"/><stop offset="1" stop-color="#B8864A"/></radialGradient>' +
			'<linearGradient id="dccTgI1p"><stop stop-color="#7E8088"/><stop offset=".3" stop-color="#D9DBE0"/><stop offset=".55" stop-color="#A9ABB3"/><stop offset=".8" stop-color="#E4E6EA"/><stop offset="1" stop-color="#83858D"/></linearGradient>' +
			'<radialGradient id="dccTgI1s"><stop stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>' +
			'<ellipse cx="250" cy="268" rx="238" ry="48" fill="url(#dccTgI1s)"/>' +
			'<path d="' + wl + 'Z" fill="url(#dccTgI1p)" stroke="#6E7078" stroke-width="2"/><path d="' + fl + '" stroke="#7C7E86" stroke-width="2.2" opacity=".55"/>' +
			'<ellipse cx="250" cy="132" rx="250" ry="123" fill="#C6C8CE" stroke="#7E8088" stroke-width="2.4"/>' +
			'<ellipse cx="250" cy="128" rx="244" ry="120" fill="url(#dccTgI1c)" stroke="#A87A42" stroke-width="2"/>' +
			'<g fill="url(#dccTgI1k)" stroke="#B0844C" stroke-width="1.6">' + cr + '</g>' +
			'<ellipse cx="247" cy="134" rx="204" ry="99" fill="#C29256"/><ellipse cx="247" cy="135" rx="200" ry="96" fill="url(#dccTgI1f)"/>' +
			'<ellipse cx="247" cy="135" rx="196" ry="93" fill="none" stroke="#8E4E1A" stroke-width="5" opacity=".35"/>' +
			'<g fill="#A65E22" opacity=".42">' + po + '</g><ellipse cx="205" cy="108" rx="78" ry="30" fill="#F2C27E" opacity=".22"/>';
	}
	/* the cornucopia: a woven horn (the weave from a photographed willow
	 * basket) pouring out the redrawn pumpkins, corn, gourd, acorn and
	 * cranberries — the falling sprites themselves, nested; no squash
	 * (Rob, 4.13.2) */
	function tgNest(k, x, y, w, rot) {
		var r = S[k], c = r.indexOf('|'), wh = r.slice(0, c).split(' '), h = w * wh[1] / wh[0];
		return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')"><svg x="' + tgF(-w / 2) + '" y="' + tgF(-h / 2) + '" width="' + w + '" height="' + tgF(h) + '" viewBox="0 0 ' + r.slice(0, c) + '">' +
			r.slice(c + 1).replace(/(id="|url\(#)(dccTg\w+)/g, '$1$2n') + '</svg></g>';
	}
	function tgHorn() {
		function C(t) { var u = 1 - t; return [u * u * u * 10 + 3 * u * u * t * 18 + 3 * u * t * t * 50 + t * t * t * 80, u * u * u * 30 + 3 * u * u * t * 66 + 3 * u * t * t * 70 + t * t * t * 52]; }
		function N(t) { var a = C(Math.max(0, t - 0.01)), b = C(Math.min(1, t + 0.01)), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy); return [dx / d, dy / d]; }
		var top = [], bot = [], rows = '', i;
		for (i = 0; i <= 24; i++) {
			var t = i / 24, c = C(t), n = N(t), r = 1.5 + 21 * Math.pow(t, 1.15);
			top.push(tgF(c[0] - n[1] * r) + ' ' + tgF(c[1] + n[0] * r)); bot.unshift(tgF(c[0] + n[1] * r) + ' ' + tgF(c[1] - n[0] * r));
			if (i > 1 && i < 24) {
				rows += '<path d="M' + top[i] + 'Q' + tgF(c[0] + n[0] * r * 0.35) + ' ' + tgF(c[1] + n[1] * r * 0.35) + ' ' + bot[0] + '" stroke="' + (i % 2 ? '#E6CFA0' : '#C99A5E') + '" stroke-width="' + tgF(1.2 + r * 0.06) + '" fill="none"/>';
			}
		}
		var o = 'M' + top.join('L') + 'L' + bot.join('L') + 'Z', m = C(1), mx = tgF(m[0]), my = tgF(m[1]), rt = ' transform="rotate(-14 ' + mx + ' ' + my + ')"';
		return '130 88|<defs><linearGradient id="dccTgU1" x2="0" y2="1"><stop stop-color="#D8B57E"/><stop offset="1" stop-color="#8C5E2E"/></linearGradient><clipPath id="dccTgU2"><path d="' + o + '"/></clipPath></defs>' +
			'<path d="' + o + '" fill="url(#dccTgU1)"/><g clip-path="url(#dccTgU2)">' + rows + '<path d="' + o + '" fill="none" stroke="#5E3E1C" stroke-width="2.4" opacity=".6"/></g>' +
			'<path d="M10 30 Q4 24 8 19 Q13 16 15 22" stroke="#B58448" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
			'<ellipse cx="' + mx + '" cy="' + my + '" rx="6" ry="21.5" fill="#5E3E1C"' + rt + '/>' +
			tgNest('corn', 98, 36, 18, 70) + tgNest('gourd1', 92, 54, 25, 0) + tgNest('gourd3', 108, 66, 19, -20) + tgNest('gourd1', 97, 80, 22, 18) + tgNest('acorn', 84, 74, 11, -25) + tgNest('cranberry', 118, 76, 13, 15) +
			'<ellipse cx="' + mx + '" cy="' + my + '" rx="6" ry="21.5" fill="none" stroke="#B58448" stroke-width="3.2" stroke-dasharray="20 200" stroke-dashoffset="-34"' + rt + '/>';
	}
	/* TG_GEN_END */
	/* tkMod: the tom's painters in ONE function with nothing outside it but
	 * Math, so the pre-draw can hand its own source to a worker (4.13.2) */
	function tkMod() {
	/* TK_START — 4.13.2 Thanksgiving's strutting wild TOM and his poults,
	 * drawn in code like the heron (Rob, 2026-10-27: "the big fanned-out
	 * tail"). The whole tom is traced from ONE photograph, "Strutting Turkey
	 * at Gavins Point NFH" (USFWS, Sam Stukel, public domain): the fan, its
	 * coverts, the puffed body, the dropped wing, the head and the stepping
	 * leg, in that photo's pixels / 10 (origin 370, 1085). He faces RIGHT,
	 * ~108 units wide, feet on y = 101.
	 *
	 * tkPaint(g, ph, d, j): ph = walk phase 0-1 (two steps; < 0 stands), d =
	 * how far the head is down to feed (0 strut - 1 at the ground), j = the
	 * peck's jab. The engine PRE-DRAWS the frames once after load
	 * (`tkCache`): a crossing is one drawImage a frame. */
	var TK = {
		fan: '#5E4331', bar: 'rgba(28,17,11,.78)', sub: '#1B1310', tip0: '#A9744A', tip1: '#E6CDA4', cov: '#38231A', covEdge: '#8E6440', cov2: '#2E2018', cov2Edge: '#86603E', body: '#16110F', wing: '#1A1512', wbar: '#E4DED2', crown: '#F1F0F3', face: '#4F72D2', face2: '#86A6EA',
		wattle: '#D52B3D', wattle2: '#9E1A2B', pink: '#EE5A68', beak: '#CDBBA2', leg: '#B48A8C', leg2: '#8E6A6E', beard: '#16120F'
	};
	function tkPath(g, P, closed) {
		var n = P.length, i, a, b, c, d;
		g.moveTo(P[0][0], P[0][1]);
		for (i = 0; i < (closed ? n : n - 1); i++) {
			a = P[(i - 1 + n) % n]; b = P[i]; c = P[(i + 1) % n]; d = P[(i + 2) % n];
			if (!closed) { a = P[Math.max(0, i - 1)]; d = P[Math.min(n - 1, i + 2)]; }
			g.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
		}
		if (closed) { g.closePath(); }
	}
	/* the fan's outer edge, traced, as [angle from the pivot, radius] */
	var TK_P = [39, 43.5], TK_EDGE = [[21, 72], [16, 70], [12, 66], [8, 60.5], [5, 55.5], [2, 48.5], [0.5, 41.5], [1, 34.5], [1.5, 28.5], [3, 21.5], [6, 15.5], [10, 10.5],
		[15, 6], [21, 3], [29, 1], [36, 0.7], [44, 1.5], [51, 4.5], [57, 8.5], [62, 12.5], [65, 16.5], [70, 22]];
	function tkFanR(a) {
		var i, e, best = [], A;
		for (i = 0; i < TK_EDGE.length; i++) {
			e = TK_EDGE[i]; A = Math.atan2(e[1] - TK_P[1], e[0] - TK_P[0]); if (A < 1) { A += Math.PI * 2; }
			best.push([A, Math.sqrt((e[0] - TK_P[0]) * (e[0] - TK_P[0]) + (e[1] - TK_P[1]) * (e[1] - TK_P[1]))]);
		}
		if (a <= best[0][0]) { return best[0][1]; }
		for (i = 1; i < best.length; i++) { if (a <= best[i][0]) { var t = (a - best[i - 1][0]) / (best[i][0] - best[i - 1][0]); return best[i - 1][1] + (best[i][1] - best[i - 1][1]) * t; } }
		return best[best.length - 1][1];
	}
	/* a deterministic jitter, so every frame draws the SAME feathers */
	function tkJ(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
	/* one tail feather from the pivot: its own broad rounded vane (no
	 * drawn shaft: a real fan shows none), barred ACROSS along its own
	 * curve, darker toward the black band, then the chestnut-buff tip.
	 * Each feather is a little different in width, length and tip (k), and
	 * it casts a soft shadow on the one beneath, which is what separates
	 * them in the photo. */
	function tkFeather(g, a, R, wid, k) {
		a += (tkJ(k * 3 + 1) - 0.5) * 0.035; R *= 0.975 + tkJ(k * 5 + 2) * 0.045; wid *= 0.88 + tkJ(k * 7 + 3) * 0.24;
		var ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, px = TK_P[0], py = TK_P[1], i, bend = (tkJ(k * 11) - 0.5) * 0.06;
		function at(r, s) { var c = s + bend * r * r / R; return [px + ca * r + nx * c, py + sa * r + ny * c]; }
		function half(r) { return wid * 0.5 * (0.16 + 0.84 * Math.pow(Math.min(r, R * 0.9) / R, 0.8)); }
		function shape(r0, r1) {
			var p, q, m, steps = 6, j, r;
			g.beginPath(); p = at(r0, -half(r0)); g.moveTo(p[0], p[1]);
			for (j = 1; j <= steps; j++) { r = r0 + (Math.min(r1, R * 0.9) - r0) * j / steps; p = at(r, -half(r)); g.lineTo(p[0], p[1]); }
			if (r1 >= R) { var w1 = half(R * 0.9), sk = (tkJ(k * 13) - 0.5) * 0.3; q = at(R + wid * 0.06, w1 * sk); m = at(R * 0.9, w1);
				p = at(R * 0.985, -w1 * 0.92); g.quadraticCurveTo(p[0], p[1], q[0], q[1]); p = at(R * 0.985, w1 * 0.92); g.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
			else { p = at(r1, half(r1)); g.lineTo(p[0], p[1]); }
			for (j = steps - 1; j >= 0; j--) { r = r0 + (Math.min(r1, R * 0.9) - r0) * j / steps; p = at(r, half(r)); g.lineTo(p[0], p[1]); }
			g.closePath();
		}
		var u = g.getTransform ? Math.abs(g.getTransform().a) : 4;
		g.save(); g.shadowColor = 'rgba(12,6,2,.45)'; g.shadowBlur = 1.6 * u; g.shadowOffsetX = -0.4 * u * nx; g.shadowOffsetY = -0.4 * u * ny;
		var fg = g.createLinearGradient(px, py, px + ca * R, py + sa * R);
		fg.addColorStop(0, '#2E2018'); fg.addColorStop(0.45, tkJ(k) < 0.5 ? '#6C4E36' : '#634732'); fg.addColorStop(0.8, '#4E3727');
		g.fillStyle = fg; shape(R * 0.1, R); g.fill(); g.restore();
		g.save(); shape(R * 0.1, R); g.clip();
		/* the bars: bands across the vane, bowed toward the tip and wavy,
		 * alternating dark and tawny, closer together toward the band */
		for (i = 0; i < 13; i++) {
			var f0 = 0.3 + 0.52 * Math.pow((i + tkJ(k * 23) * 0.9) / 13.9, 0.85) + (tkJ(k * 29 + i) - 0.5) * 0.012, r = R * f0, w = half(r) * 1.15, bw = R * (0.012 + tkJ(k * 31 + i) * 0.008), bow = R * 0.03;
			var p0 = at(r, -w), p1 = at(r + bow + (tkJ(k * 17 + i) - 0.5) * R * 0.02, -w * 0.35), p2 = at(r + bow - (tkJ(k * 19 + i) - 0.5) * R * 0.02, w * 0.35), p3 = at(r, w);
			var q3 = at(r + bw, w), q2 = at(r + bw + bow, w * 0.35), q1 = at(r + bw + bow, -w * 0.35), q0 = at(r + bw, -w);
			g.fillStyle = i % 3 === 2 ? 'rgba(150,104,62,.55)' : TK.bar;
			g.beginPath(); g.moveTo(p0[0], p0[1]); g.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]); g.lineTo(q3[0], q3[1]); g.bezierCurveTo(q2[0], q2[1], q1[0], q1[1], q0[0], q0[1]); g.closePath(); g.fill();
		}
		/* the black band and the chestnut-buff tip, each bowed like the bars */
		function band(f0, f1, fill) { var w = half(R) * 1.3, b0 = R * 0.035, p0 = at(R * f0, -w), p1 = at(R * f0 + b0, 0), p2 = at(R * f0, w), q0 = at(R * f1, w), q1 = at(R * f1 + b0, 0), q2 = at(R * f1, -w);
			g.fillStyle = fill; g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); g.lineTo(q0[0], q0[1]); g.quadraticCurveTo(q1[0], q1[1], q2[0], q2[1]); g.closePath(); g.fill(); }
		band(0.8, 0.915, TK.sub);
		var tg = g.createLinearGradient(px + ca * R * 0.9, py + sa * R * 0.9, px + ca * R * 1.04, py + sa * R * 1.04);
		tg.addColorStop(0, TK.tip0); tg.addColorStop(0.5, '#C29466'); tg.addColorStop(1, TK.tip1);
		band(0.905, 1.12, tg);
		/* the frayed edge of the tip */
		g.strokeStyle = TK.tip1; g.lineWidth = 0.3;
		for (i = -4; i <= 4; i++) { var b0 = at(R * 0.985 - Math.abs(i) * 0.25, i * wid * 0.1), b1 = at(R * 0.985 - Math.abs(i) * 0.25 + 0.5 + tkJ(k * 13 + i) * 1.1, i * wid * 0.11); g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke(); }
		g.restore();
	}
	/* a LOOSE row of rounded covert feathers lying over the fan's base,
	 * about f of its radius out: each one placed, sized and turned a little
	 * differently, overlapping its neighbours and shading the one beneath,
	 * the photo's dark-brown vane with a chestnut then pale ragged edge */
	function tkCoverts(g, f, a0, a1, n, len, fill, edge, seed) {
		var i, st = (a1 - a0) / n, u = g.getTransform ? Math.abs(g.getTransform().a) : 4;
		for (i = 0; i < n; i++) {
			var a = a0 + st * (i + 0.5 + (tkJ(seed + i) - 0.5) * 0.45), R = tkFanR(a) * f * (0.94 + tkJ(seed + i + 40) * 0.12), L = len * (0.85 + tkJ(seed + i + 80) * 0.3);
			var ca = Math.cos(a + (tkJ(seed + i + 9) - 0.5) * 0.12), sa = Math.sin(a + (tkJ(seed + i + 9) - 0.5) * 0.12), w = st * R * (1.25 + tkJ(seed + i + 20) * 0.35);
			var tx = TK_P[0] + ca * R, ty = TK_P[1] + sa * R, bx = TK_P[0] + ca * (R - L), by = TK_P[1] + sa * (R - L), nx = -sa * w / 2, ny = ca * w / 2;
			function out() { g.beginPath(); g.moveTo(bx - nx * 0.6, by - ny * 0.6); g.quadraticCurveTo(tx - nx * 1.2 - ca * 2, ty - ny * 1.2 - sa * 2, tx + ca * 1.1, ty + sa * 1.1);
				g.quadraticCurveTo(tx + nx * 1.2 - ca * 2, ty + ny * 1.2 - sa * 2, bx + nx * 0.6, by + ny * 0.6); g.closePath(); }
			var cg = g.createLinearGradient(bx, by, tx + ca * 1.1, ty + sa * 1.1), lv = tkJ(seed + i + 60);
			cg.addColorStop(0, '#1A110B'); cg.addColorStop(0.62, fill); cg.addColorStop(0.86, lv < 0.5 ? edge : '#8A5E3C'); cg.addColorStop(0.955, '#D2B892'); cg.addColorStop(1, '#E6D6BA');
			g.save(); g.shadowColor = 'rgba(10,6,2,.5)'; g.shadowBlur = 1.4 * u; g.shadowOffsetX = 0.3 * u * ca; g.shadowOffsetY = 0.3 * u * sa;
			out(); g.fillStyle = cg; g.fill(); g.restore();
			/* the frayed barbs at its edge */
			g.strokeStyle = 'rgba(214,190,156,.38)'; g.lineWidth = 0.25;
			for (var q = -4; q <= 4; q++) { var qa = Math.atan2(sa, ca) + q * 0.085, rr = R + 0.6 - Math.abs(q) * 0.3, ex = TK_P[0] + Math.cos(qa) * rr, ey = TK_P[1] + Math.sin(qa) * rr;
				g.beginPath(); g.moveTo(ex - Math.cos(qa) * 1.1, ey - Math.sin(qa) * 1.1); g.lineTo(ex + Math.cos(qa) * (0.3 + tkJ(seed + i * 9 + q) * 0.8), ey + Math.sin(qa) * (0.3 + tkJ(seed + i * 9 + q) * 0.8)); g.stroke(); }
		}
	}
	/* The body feathers, as the photo lays them: rounded feathers in rows
	 * like shingles, flowing OUT from O (the neck, or a wing's shoulder)
	 * toward the tail, the farthest row laid first so each row overlaps the
	 * next. Each has a dark centre and a bronze edge that turns copper on
	 * the breast and bronze-green at the shoulder, all lit from ONE side
	 * (upper left); the iridescence is a soft sheen laid over the rows,
	 * never specks. a0-a1 is the arc the rows cover; pale = the rump's
	 * buff-tipped feathers. */
	/* where the photographed tom's body catches the light: the flank and
	 * shoulder coverts, and the lower breast; the back, the breast under
	 * the head and the belly stay near-black (4.13.2, Rob's round 4) */
	function tkLit(x, y) {
		var a = Math.exp(-((x - 62) * (x - 62) + (y - 46) * (y - 46)) / 338), b = 0.9 * Math.exp(-((x - 87) * (x - 87) + (y - 64) * (y - 64)) / 392);
		return Math.max(a, b) * (y > 76 ? Math.max(0, 1 - (y - 76) / 12) : 1);
	}
	/* the tom's body feathers: near-black, long and pointed, overlapping so
	 * only the tips show, each tip a NARROW bronze-to-copper edge, bright
	 * where the light falls and gone in the shadow; every feather a little
	 * different in size and angle so no two rows repeat */
	function tkGloss(g, O, r0, r1, a0, a1, sz, seed, buff) {
		var rows = [], r, k = 0, i;
		for (r = r0; r < r1; r += (sz + r * 0.15) * (0.3 + tkJ(seed + r) * 0.08)) { rows.push(r); }
		for (i = rows.length - 1; i >= 0; i--) {
			r = rows[i];
			var L = sz * 1.25 + r * 0.15, w = L * 0.42, step = w * 0.82 / r, a = a0 + tkJ(seed + i * 7) * step;
			for (; a <= a1; a += step * (0.85 + tkJ(seed + k + 6) * 0.3)) {
				var aj = a + (tkJ(seed + k) - 0.5) * step * 0.5, rr = r + (tkJ(seed + k + 1) - 0.5) * L * 0.35, x = O[0] + Math.cos(aj) * rr, y = O[1] + Math.sin(aj) * rr;
				var tw = aj + (tkJ(seed + k + 2) - 0.5) * 0.5, sc2 = 0.75 + tkJ(seed + k + 4) * 0.55, ux = Math.cos(tw), uy = Math.sin(tw), nx = -uy * w * sc2 / 2, ny = ux * w * sc2 / 2;
				var Ls = L * sc2, tx = x + ux * Ls, ty = y + uy * Ls, mx = ux * Ls * 0.55, my = uy * Ls * 0.55;
				g.beginPath(); g.moveTo(x - nx, y - ny); g.quadraticCurveTo(x - nx * 1.05 + mx, y - ny * 1.05 + my, tx, ty);
				g.quadraticCurveTo(x + nx * 1.05 + mx, y + ny * 1.05 + my, x + nx, y + ny); g.closePath();
				var cg = g.createLinearGradient(x, y, tx, ty); cg.addColorStop(0, '#060403'); cg.addColorStop(1, '#16100C');
				g.fillStyle = cg; g.fill();
				var lt = (buff ? 0.7 : tkLit(tx, ty)) * (0.75 + tkJ(seed + k + 3) * 0.25), q = Math.min(1, Math.max(0, (x - 60) / 40)), sd = tkJ(seed + k + 8) < 0.5 ? -1 : 1;
				if (lt > 0.04) {
					var c0 = buff ? [212, 188, 148] : [Math.round(170 + 26 * q), Math.round(128 - 14 * q), Math.round(80 - 14 * q)];
					if (lt > 0.7 && !buff) { c0 = [c0[0] + (lt - 0.7) * 60, c0[1] + (lt - 0.7) * 120, c0[2] + (lt - 0.7) * 140].map(Math.round); }   /* the brightest go silvery, as in the sun */
					/* a glint along ONE edge into the tip, the way light catches a
					 * curved feather: never a chevron */
					g.strokeStyle = 'rgba(' + c0.join(',') + ',' + (0.05 + 0.92 * lt).toFixed(2) + ')'; g.lineWidth = w * (0.07 + 0.06 * lt); g.lineCap = 'round';
					g.beginPath(); g.moveTo(x + sd * nx * 0.78 + ux * Ls * 0.5, y + sd * ny * 0.78 + uy * Ls * 0.5);
					g.quadraticCurveTo(x + sd * nx * 0.55 + ux * Ls * 0.85, y + sd * ny * 0.55 + uy * Ls * 0.85, tx - ux * 0.3, ty - uy * 0.3); g.stroke(); g.lineCap = 'butt';
				}
				k++;
			}
		}
	}
	function tkShingles(g, O, r0, r1, a0, a1, sz, seed) {
		var rows = [], r, k = 0, i;
		for (r = r0; r < r1; r += (sz + r * 0.12) * 0.5) { rows.push(r); }
		for (i = rows.length - 1; i >= 0; i--) {
			r = rows[i];
			var L = sz + r * 0.12, w = L * 0.66, step = w * 0.72 / r, off = (i % 2) * step * 0.5, a;
			for (a = a0 + off; a <= a1; a += step) {
				var aj = a + (tkJ(seed + k) - 0.5) * step * 0.4, rr = r + (tkJ(seed + k + 1) - 0.5) * L * 0.3, x = O[0] + Math.cos(aj) * rr, y = O[1] + Math.sin(aj) * rr, tw = aj + (tkJ(seed + k + 2) - 0.5) * 0.24, sc2 = 0.86 + tkJ(seed + k + 4) * 0.28;
				var ux = Math.cos(tw), uy = Math.sin(tw), nx = -uy * w * sc2 / 2, ny = ux * w * sc2 / 2;
				var ex = x + ux * L * 0.7 * sc2, ey = y + uy * L * 0.7 * sc2, tl = L * 0.3 * sc2;
				/* straight sides, then a rounded tip: the end of the feather
				 * that shows past the row above */
				g.beginPath(); g.moveTo(x - nx, y - ny); g.lineTo(ex - nx, ey - ny);
				g.bezierCurveTo(ex - nx + ux * tl * 1.3, ey - ny + uy * tl * 1.3, ex + nx + ux * tl * 1.3, ey + ny + uy * tl * 1.3, ex + nx, ey + ny);
				g.lineTo(x + nx, y + ny); g.closePath();
				var cl = [218, 196, 160], ea = 0.85 * (0.85 + tkJ(seed + k + 3) * 0.15);   /* buff edges: the rump and the poults (the tom's body is tkGloss) */
				var cg = g.createLinearGradient(x, y, ex + ux * tl, ey + uy * tl);
				cg.addColorStop(0, '#0A0706'); cg.addColorStop(1, '#3A2C20');
				g.fillStyle = cg; g.fill();
				/* the lit rim round the tip, a crescent, brighter toward the light */
				g.strokeStyle = 'rgba(' + cl.join(',') + ',' + ea.toFixed(2) + ')'; g.lineWidth = w * 0.14; g.lineCap = 'round';
				g.beginPath(); g.moveTo(ex - nx * 0.82 - ux * L * 0.12, ey - ny * 0.82 - uy * L * 0.12);
				g.bezierCurveTo(ex - nx * 0.82 + ux * tl * 1.15, ey - ny * 0.82 + uy * tl * 1.15, ex + nx * 0.82 + ux * tl * 1.15, ey + ny * 0.82 + uy * tl * 1.15, ex + nx * 0.82 - ux * L * 0.12, ey + ny * 0.82 - uy * L * 0.12); g.stroke();
				g.lineCap = 'butt';
				k++;
			}
		}
	}
	/* one barred wing feather, root to tip (narrow, irregular white bars:
	 * Florida's Osceola is darker winged than the bird photographed) */
	function tkWingF(g, x0, y0, x1, y1, w, k) {
		var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L, nx = -uy * w / 2, ny = ux * w / 2, i;
		g.beginPath(); g.moveTo(x0 - nx, y0 - ny); g.lineTo(x1 - nx * 0.8 - ux * w * 0.3, y1 - ny * 0.8 - uy * w * 0.3);
		g.quadraticCurveTo(x1 + ux * w * 0.25, y1 + uy * w * 0.25, x1 + nx * 0.8 - ux * w * 0.3, y1 + ny * 0.8 - uy * w * 0.3); g.lineTo(x0 + nx, y0 + ny); g.closePath();
		g.fillStyle = TK.wing; g.fill();
		g.save(); g.clip(); g.fillStyle = TK.wbar;
		for (i = 0; i < 12; i++) {
			for (var sd = -1; sd <= 1; sd += 2) {
				var t = 0.08 + i * 0.074 + (sd > 0 ? 0.03 : 0) + (tkJ(k * 5 + i + sd) - 0.5) * 0.022, bw = L * (0.02 + tkJ(k * 3 + i + sd * 7) * 0.016), cx0 = x0 + dx * t, cy0 = y0 + dy * t;
				var o0 = sd * (0.1 + tkJ(k + i * 3) * 0.12), o1 = sd * (0.75 + tkJ(k * 9 + i) * 0.2), sl = bw * 0.9, j0 = (tkJ(i * 7 + k) - 0.5) * bw;
				g.beginPath(); g.moveTo(cx0 + nx * o0, cy0 + ny * o0);
				g.quadraticCurveTo(cx0 + nx * (o0 + o1) / 2 + ux * (sl * 0.5 + j0), cy0 + ny * (o0 + o1) / 2 + uy * (sl * 0.5 + j0), cx0 + nx * o1 + ux * sl, cy0 + ny * o1 + uy * sl);
				g.lineTo(cx0 + nx * o1 + ux * (sl + bw), cy0 + ny * o1 + uy * (sl + bw));
				g.quadraticCurveTo(cx0 + nx * (o0 + o1) / 2 + ux * (sl * 0.5 + bw * 1.2 - j0), cy0 + ny * (o0 + o1) / 2 + uy * (sl * 0.5 + bw * 1.2 - j0), cx0 + nx * o0 + ux * bw * 0.8, cy0 + ny * o0 + uy * bw * 0.8);
				g.closePath(); g.fill();
			}
		}
		g.strokeStyle = 'rgba(10,8,6,.9)'; g.lineWidth = 0.45; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
		g.restore();
		g.strokeStyle = 'rgba(10,8,6,.8)'; g.lineWidth = 0.4; g.stroke();
	}
	/* a leg from the hock H to the foot F, toes forward; sw = 0-1 swing
	 * (the toes curl as the foot lifts) */
	function tkLeg(g, H, F, sw, col, sc) {
		var L = 15 * sc, dx = H[0] - F[0], dy = H[1] - F[1], D = Math.sqrt(dx * dx + dy * dy), J = D > L ? [F[0] + dx / D * L, F[1] + dy / D * L] : H;
		g.strokeStyle = TK.body; g.lineWidth = 4.2 * sc; g.lineCap = 'round';
		g.beginPath(); g.moveTo(H[0], H[1] - 2 * sc); g.lineTo(J[0], J[1]); g.stroke();   /* the feathered drumstick, mostly hidden */
		g.strokeStyle = col; g.lineWidth = 2.1 * sc;
		g.beginPath(); g.moveTo(J[0], J[1]); g.lineTo(F[0], F[1]); g.stroke();
		/* the scales across the tarsus */
		g.strokeStyle = 'rgba(70,40,44,.45)'; g.lineWidth = 0.35 * sc;
		for (var i = 1; i < 6; i++) { var t = i / 6, x = J[0] + (F[0] - J[0]) * t, y = J[1] + (F[1] - J[1]) * t; g.beginPath(); g.moveTo(x - 1 * sc, y); g.lineTo(x + 1 * sc, y); g.stroke(); }
		var cu = sw * 0.9;
		g.strokeStyle = col; g.lineWidth = 1.5 * sc;
		var toes = [[11, -0.02], [8.5, 0.22], [7.5, -0.2]];
		for (i = 0; i < 3; i++) {
			var a = toes[i][1] + cu, ln = toes[i][0] * sc;
			g.beginPath(); g.moveTo(F[0], F[1]); g.quadraticCurveTo(F[0] + ln * 0.55 * Math.cos(a * 0.5), F[1] + ln * 0.55 * Math.sin(a * 0.5), F[0] + ln * Math.cos(a), F[1] + ln * Math.sin(a) + 0.4 * sc); g.stroke();
		}
		g.lineWidth = 1.2 * sc; g.beginPath(); g.moveTo(F[0], F[1]); g.lineTo(F[0] - 3.6 * sc * Math.cos(cu * 0.6), F[1] + 0.2 * sc - 2.5 * sc * cu); g.stroke();   /* the hind toe */
		g.lineCap = 'butt';
	}
	/* the head at (x, y), turned by r (0 = the strut, beak forward-down) */
	function tkHead(g, x, y, r, rw) {
		g.save(); g.translate(x, y); g.rotate(r);
		/* the snood, draped over the beak */
		g.fillStyle = TK.beak; g.beginPath(); g.moveTo(2.6, 0.9); g.quadraticCurveTo(5.6, 1.6, 6.4, 3.6); g.quadraticCurveTo(4.4, 3.4, 2.4, 2.6); g.closePath(); g.fill();
		g.fillStyle = TK.face; g.beginPath(); g.ellipse(0.4, 0.8, 4.4, 3.6, 0.2, 0, Math.PI * 2); g.fill();
		g.fillStyle = TK.face2; g.beginPath(); g.ellipse(0.9, 0.3, 2.6, 1.9, 0.2, 0, Math.PI * 2); g.fill();
		g.fillStyle = TK.crown; g.beginPath(); g.ellipse(-0.4, -2.4, 4.2, 2.1, 0.12, 0, Math.PI * 2); g.fill();
		g.fillStyle = '#231616'; g.beginPath(); g.arc(1.1, 0.2, 0.85, 0, Math.PI * 2); g.fill();
		/* the snood, from the forehead down over the beak, turned back
		 * against the head's tilt so it hangs with gravity */
		g.translate(2.4, -1.4); g.rotate(-(rw || 0) * 0.9); g.translate(-2.4, 1.4);
		g.fillStyle = TK.wattle; g.beginPath(); g.moveTo(2.2, -2.2); g.quadraticCurveTo(3.6, -2.4, 3.9, -0.6); g.quadraticCurveTo(4.7, 2.6, 6.6, 5.4);
		g.quadraticCurveTo(6.5, 6.6, 5.6, 6.1); g.quadraticCurveTo(3.4, 3.2, 2.6, 0.4); g.closePath(); g.fill();
		g.restore();
	}
	/* the wattle down the throat, from under the chin (hx, hy) to the
	 * breast (bx, by): caruncled, red, the pink lobe at its foot */
	function tkThroat(g, hx, hy, bx, by) {
		var i, mx = (hx + bx) / 2, my = (hy + by) / 2, dx = bx - hx, dy = by - hy, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
		/* the pale bristled skin behind it */
		g.strokeStyle = 'rgba(190,188,200,.75)'; g.lineWidth = 0.4;
		for (i = 0; i < 9; i++) { var t = 0.15 + i * 0.09, x = hx + dx * t - nx * 2.2, y = hy + dy * t - ny * 2.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - nx * 1.6 + dx / L * 2.4, y - ny * 1.6 + dy / L * 2.4); g.stroke(); }
		/* one caruncled lobe, widening down the throat */
		var P = [], n = 12;
		for (i = 0; i <= n; i++) { var u = i / n, w = 1.3 + u * 2.6 + Math.sin(u * 19) * 0.35; P.push([hx + dx * u + nx * w, hy + dy * u + ny * w]); }
		for (i = n; i >= 0; i--) { var u2 = i / n, w2 = 0.8 + u2 * 1.8 + Math.sin(u2 * 23) * 0.3; P.push([hx + dx * u2 - nx * w2, hy + dy * u2 - ny * w2]); }
		g.fillStyle = TK.wattle; g.beginPath(); tkPath(g, P, true); g.fill();
		g.save(); g.clip();
		for (i = 0; i < 26; i++) { var t2 = tkJ(i + 400), o = (tkJ(i + 430) - 0.4) * 4, x2 = hx + dx * t2 + nx * o * (0.5 + t2), y2 = hy + dy * t2 + ny * o * (0.5 + t2);
			g.strokeStyle = TK.wattle2; g.lineWidth = 0.45; g.beginPath(); g.arc(x2, y2, 0.7 + t2 * 0.6, 0.3, 3.6); g.stroke(); }
		g.restore();
		g.fillStyle = TK.pink; g.beginPath(); g.ellipse(bx + nx * 1.2, by + ny * 1.2 + 0.4, 2.7, 2.1, Math.atan2(dy, dx), 0, Math.PI * 2); g.fill();
	}
	/* the walk: each foot is on the ground 60% of the cycle and moves back
	 * as he moves forward (no sliding), then lifts and swings through. The
	 * head holds, then thrusts, once a step. */
	var TK_STRIDE = 14, TK_GROUND = 101, TK_STANCE = 0.6;
	function tkFoot(ph, hx) {
		ph = ((ph % 1) + 1) % 1;
		if (ph < TK_STANCE) { return [hx + TK_STRIDE / 2 - TK_STRIDE * ph / TK_STANCE, TK_GROUND - 1, 0]; }
		var u = (ph - TK_STANCE) / (1 - TK_STANCE), e = u * u * (3 - 2 * u);
		return [hx - TK_STRIDE / 2 + TK_STRIDE * e, TK_GROUND - 1 - 4.5 * Math.sin(Math.PI * u), Math.sin(Math.PI * u)];
	}
	function tkPaint(g, ph, d, j) {
		var walk = ph >= 0, bob = walk ? -0.9 * Math.cos(ph * Math.PI * 4) : 0, i;
		var h2 = walk ? (ph * 2) % 1 : 0, hb = walk ? (h2 < 0.65 ? 1.6 - 3.2 * h2 / 0.65 : -1.6 + 3.2 * (h2 - 0.65) / 0.35) : 0;
		/* feeding (Rob's pick, fan up), from "Adult and young turkey" (NPS,
		 * public domain): the whole bird tips forward from the feet, and the
		 * strut's folded S of neck unfolds forward and down out of the
		 * breast's front, short and thick, the head turning bill-down but
		 * staying upright, the wattle and snood hanging with gravity */
		var t = Math.min(1, d), e = t * t * (3 - 2 * t), lean = e * 0.32;
		/* legs first: the far one behind everything, darker */
		var fF = walk ? tkFoot(ph + 0.5, 74) : [72, TK_GROUND - 1, 0], fN = walk ? tkFoot(ph, 81) : [84, TK_GROUND - 1, 0];
		tkLeg(g, [74, 85 + bob], fF, fF[2], TK.leg2, 0.92);
		g.save();
		g.translate(84, 100); g.rotate(lean); g.translate(-84, -100 + bob);
		/* the fan: outer feathers first, the middle ones on top */
		var A0 = 2.05, A1 = 5.5, N = 17, order = [], fw = (A1 - A0) / (N - 1);
		for (i = 0; i < N; i++) { order.push(i); }
		order.sort(function (a, b) { return Math.abs(b - 8.5) - Math.abs(a - 8.5); });
		for (i = 0; i < N; i++) { var a = A0 + fw * order[i]; tkFeather(g, a, tkFanR(a), tkFanR(a) * fw * 1.35, order[i]); }
		/* the coverts: a row of big rounded ones, a smaller copper row, then
		 * the rump's pale-tipped feathers into the back */
		tkCoverts(g, 0.72, 2.2, 5.3, 11, 13, TK.cov, TK.covEdge, 500);
		tkCoverts(g, 0.56, 2.32, 5.2, 9, 11, TK.cov2, TK.cov2Edge, 600);
		tkCoverts(g, 0.42, 2.5, 5.0, 7, 9, '#3A2A20', '#9A7050', 700);
		/* the head's path, in the body's (tilted) frame: from the strut
		 * along an arc to the ground in front of the breast */
		var cl = Math.cos(-lean), sl = Math.sin(-lean), TX = 84 + (124 - 84) * cl - (89 + j * 1.6 - 100) * sl, TY = 100 + (124 - 84) * sl + (89 + j * 1.6 - 100) * cl, q = 1 - e;
		var hx = q * q * (88 + hb) + 2 * q * e * 117 + e * e * TX, hy = q * q * (28 + Math.abs(hb) * 0.15) + 2 * q * e * 44 + e * e * TY, hr = e * 0.85;
		var chx = hx + Math.cos(hr) * 1.5 - Math.sin(hr) * 3.6, chy = hy + Math.sin(hr) * 1.5 + Math.cos(hr) * 3.6;
		if (e > 0.02) {
			/* the neck, drawn BEHIND the breast so it comes out of it: thick
			 * and feathered dark bronze at the base, thinning steadily into
			 * the bare blue-and-pink skin under the head */
			var NB = [100, 60 - 8 * (1 - e)], N1 = [NB[0] + 9 * e, NB[1] - 3], N2 = [hx - 5 - 2 * e, hy - 6], N3 = [hx - 0.6, hy + 1.2], seg = 18, pts = [];
			for (i = 0; i <= seg; i++) { var u = i / seg, v = 1 - u; pts.push([v * v * v * NB[0] + 3 * v * v * u * N1[0] + 3 * v * u * u * N2[0] + u * u * u * N3[0], v * v * v * NB[1] + 3 * v * v * u * N1[1] + 3 * v * u * u * N2[1] + u * u * u * N3[1]]); }
			for (i = 0; i < seg; i++) {
				var u0 = i / seg, a0 = pts[i], a1 = pts[i + 1], tx2 = a1[0] - a0[0], ty2 = a1[1] - a0[1], tl2 = Math.sqrt(tx2 * tx2 + ty2 * ty2) || 1, w0 = 8.4 - 5.2 * Math.pow(u0, 0.9), w1 = 8.4 - 5.2 * Math.pow((i + 1) / seg, 0.9);
				var px2 = -ty2 / tl2, py2 = tx2 / tl2, mix = Math.max(0, Math.min(1, (u0 - 0.42) / 0.3));
				g.fillStyle = mix <= 0 ? TK.body : 'rgb(' + Math.round(22 + (150 - 22) * mix) + ',' + Math.round(17 + (128 - 17) * mix) + ',' + Math.round(15 + (156 - 15) * mix) + ')';
				g.beginPath(); g.moveTo(a0[0] + px2 * w0 / 2, a0[1] + py2 * w0 / 2); g.lineTo(a1[0] + px2 * w1 / 2, a1[1] + py2 * w1 / 2); g.lineTo(a1[0] - px2 * w1 / 2, a1[1] - py2 * w1 / 2); g.lineTo(a0[0] - px2 * w0 / 2, a0[1] - py2 * w0 / 2); g.closePath(); g.fill();
				if (mix < 0.6 && i % 2) {   /* the feathers' lit rims on the lower neck */
					g.strokeStyle = 'rgba(176,138,90,' + (0.5 * (1 - mix)).toFixed(2) + ')'; g.lineWidth = 0.7;
					g.beginPath(); g.moveTo(a1[0] + px2 * w1 * 0.4, a1[1] + py2 * w1 * 0.4); g.quadraticCurveTo(a1[0] + tx2 / tl2 * 1.6, a1[1] + ty2 / tl2 * 1.6, a1[0] - px2 * w1 * 0.4, a1[1] - py2 * w1 * 0.4); g.stroke();
				}
			}
		}
		/* the body */
		var BODY = [[44, 28], [56, 19], [65, 16.5], [71, 17.7], [78, 19.5], [83 + e, 23 - e], [89 + 3 * e, 31 - 3 * e], [96 + 4 * e, 42 - 3 * e], [101 + e, 51.5],   /* the breast's top rounds over once the head is down */
			 [104.5, 55], [106, 61.5], [105, 67.5], [103, 72.5], [100, 77.5],
			[95, 81.5], [89, 84.5], [83, 86], [76, 86], [68, 84], [56, 78], [46, 70], [40, 60], [40, 45]];
		g.beginPath(); tkPath(g, BODY, true); g.fillStyle = TK.body; g.fill();
		g.save(); g.beginPath(); tkPath(g, BODY, true); g.clip();
		tkGloss(g, [100, 2], 16, 98, 0.85, 3.0, 5.2, 3);
		/* the iridescence: one soft bronze-green sheen across the shoulder
		 * rows and a copper one on the breast, where the light falls */
		/* the iridescence: a soft bronze-green sheen where the light falls */
		var bg = g.createRadialGradient(62, 46, 2, 62, 46, 20); bg.addColorStop(0, 'rgba(150,140,90,.1)'); bg.addColorStop(1, 'rgba(150,140,90,0)');
		g.fillStyle = bg; g.fillRect(40, 24, 46, 46);
		bg = g.createRadialGradient(87, 64, 2, 87, 64, 20); bg.addColorStop(0, 'rgba(180,120,70,.1)'); bg.addColorStop(1, 'rgba(180,120,70,0)');
		g.fillStyle = bg; g.fillRect(66, 44, 44, 42);
		g.restore();
		/* the rump over the body's back edge */
		g.save(); g.beginPath(); tkPath(g, [[40, 22], [52, 17], [60, 21], [62, 34], [56, 50], [46, 56], [38, 50], [36, 34]], true); g.clip();
		tkGloss(g, [62, 18], 2, 42, 1.5, 3.6, 3.4, 41, true); g.restore();
		/* the dropped wing: coverts, then the barred feathers down to the ground */
		/* primaries and secondaries: roots at the upper right, tips fanned
		 * down to the left onto the ground, as photographed */
		var WR = [[48, 62], [52, 65], [56, 68], [60, 70.5], [64, 72.5], [68, 75], [72, 77.5], [76, 80], [79, 82]],
			WT = [[28, 87], [30, 93], [33, 97.5], [38, 100.3], [44, 101.4], [51, 101.6], [58, 101.4], [65, 100.8], [72, 99.5]];
		for (i = WR.length - 1; i >= 0; i--) { tkWingF(g, WR[i][0], WR[i][1], WT[i][0], WT[i][1], 6.8, i); }
		/* the coverts over their roots: dark, barred white at the lower edge */
		var WC = [[34, 58], [46, 50], [60, 51], [72, 58], [80, 70], [80, 80], [70, 74], [58, 69], [46, 70], [36, 74], [32, 66]];
		g.beginPath(); tkPath(g, WC, true); g.fillStyle = TK.wing; g.fill();
		g.save(); g.beginPath(); tkPath(g, WC, true); g.clip();
		tkGloss(g, [82, 30], 14, 60, 1.45, 2.85, 4.4, 77);
		for (i = 0; i < 30; i++) { var bx = 33 + tkJ(i + 300) * 16, by = 62 + tkJ(i + 330) * 14; g.fillStyle = 'rgba(228,222,210,.85)'; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 2.2, by - 0.7); g.lineTo(bx + 2, by + 0.3); g.lineTo(bx, by + 0.9); g.closePath(); g.fill(); }
		g.restore();
		/* the beard */
		g.strokeStyle = TK.beard; g.lineCap = 'round';
		for (i = 0; i < 7; i++) { g.lineWidth = 0.7 + tkJ(i + 50) * 0.5; g.beginPath(); g.moveTo(102 + i * 0.25, 67); g.quadraticCurveTo(103.2 + i * 0.2, 78, 101.2 + i * 0.35 - d * 2, 88 + tkJ(i + 60) * 3); g.stroke(); }
		g.lineCap = 'butt';
		/* the wattle: down the front of the tucked neck in the strut; once
		 * he feeds it hangs straight down from his chin */
		tkThroat(g, hx, hy + 2 - e * 0.8, 98 + (chx + 0.6 - 98) * e, 49 + (chy + 8 - 49) * e);
		tkHead(g, hx, hy, hr, hr + lean);
		g.restore();
		/* the near leg, in front of the body and the wing */
		tkLeg(g, [81, 85 + bob], fN, fN[2], TK.leg, 1);
	}
	var TK_BOX = [-2, -3, 131, 104];   /* wide enough for his head at the ground */   /* x0 y0 x1 y1, every frame */

	/* A POULT, traced from the front poult of "Wild turkeys" (NPS,
	 * Shenandoah, Luca Pfeiffer, public domain), in that photo's pixels / 10
	 * (origin 1850, 1550): a small round head with a big dark eye, a thin
	 * pale downy neck, a mottled brown body whose feathers are edged buff,
	 * buff-barred wing coverts, and long pinkish legs that bend at the
	 * intertarsal joint, as photographed. Faces RIGHT, feet on y = 66.
	 * kpPaint(g, ph, d): ph = walk phase 0-1 (< 0 stands), d = feeding. */
	var KP = { edge: 'rgba(214,180,130,.8)', neck: '#B4A796', face: '#C4B8A8', eye: '#120C0A', beak: '#B39478', leg: '#C2A49C', leg2: '#9C8680' };
	var KP_STRIDE = 24, KP_GROUND = 65;
	/* a fuzzy edge: short down strokes standing out from a curve, so an
	 * outline reads soft and a little ragged, as a poult's does */
	function kpFuzz(g, P, out, n, col, len, seed) {
		var i;
		g.strokeStyle = col; g.lineWidth = 0.45; g.lineCap = 'round';
		for (i = 0; i < n; i++) {
			var u = i / (n - 1) * (P.length - 1), j = Math.min(P.length - 2, Math.floor(u)), f = u - j, x = P[j][0] + (P[j + 1][0] - P[j][0]) * f, y = P[j][1] + (P[j + 1][1] - P[j][1]) * f;
			var tx = P[j + 1][0] - P[j][0], ty = P[j + 1][1] - P[j][1], tl = Math.sqrt(tx * tx + ty * ty) || 1, nx = -ty / tl * out, ny = tx / tl * out, l = len * (0.5 + tkJ(seed + i) * 0.8);
			g.beginPath(); g.moveTo(x - nx * 0.6, y - ny * 0.6); g.quadraticCurveTo(x + nx * l * 0.6 + tx / tl * 0.5, y + ny * l * 0.6 + ty / tl * 0.5, x + nx * l + tx / tl * (tkJ(seed + i + 3) - 0.3), y + ny * l + ty / tl * (tkJ(seed + i + 3) - 0.3)); g.stroke();
		}
		g.lineCap = 'butt';
	}
	/* a leg with a hip, the backward-bending intertarsal joint and the
	 * foot, solved from the two bone lengths: gray-pink and scaly, the
	 * shin thicker, the bare tarsus slimmer below a clear
	 * joint, three toes ending in small dark claws, curled as it lifts */
	function kpLeg(g, H, F, sw, col, a, b, sc) {
		var dx = F[0] - H[0], dy = F[1] - H[1], D = Math.min(a + b - 0.01, Math.sqrt(dx * dx + dy * dy)), ang = Math.atan2(dy, dx);
		var k = Math.acos(Math.max(-1, Math.min(1, (a * a + D * D - b * b) / (2 * a * D)))), K = [H[0] + Math.cos(ang + k) * a, H[1] + Math.sin(ang + k) * a];
		var ux = (F[0] - K[0]) / b, uy = (F[1] - K[1]) / b, i;
		g.lineCap = 'round';
		/* the drumstick: feathered, tapering to the joint */
		/* the shin, thicker than the tarsus, running up into the belly's down */
		g.strokeStyle = col; g.lineWidth = 2.6 * sc; g.beginPath(); g.moveTo(H[0], H[1]); g.lineTo(K[0], K[1]); g.stroke();
		g.strokeStyle = col; g.lineWidth = 1.9 * sc; g.beginPath(); g.moveTo(K[0], K[1]); g.lineTo(F[0], F[1]); g.stroke();
		g.fillStyle = col; g.beginPath(); g.ellipse(K[0], K[1], 1.45 * sc, 1.25 * sc, ang, 0, Math.PI * 2); g.fill();   /* the joint */
		g.strokeStyle = 'rgba(110,82,76,.55)'; g.lineWidth = 0.25 * sc;
		for (i = 1; i < 8; i++) { var sx = K[0] + (F[0] - K[0]) * i / 8, sy = K[1] + (F[1] - K[1]) * i / 8; g.beginPath(); g.moveTo(sx - uy * 0.9 * sc, sy + ux * 0.9 * sc); g.quadraticCurveTo(sx + ux * 0.4, sy + uy * 0.4, sx + uy * 0.9 * sc, sy - ux * 0.9 * sc); g.stroke(); }
		var cu = sw * 1.25, toes = [[6.5, -0.03], [5, 0.25], [4.6, -0.28]];
		for (i = 0; i < 3; i++) {
			var t = toes[i][1] + cu, l = toes[i][0] * sc, ex = F[0] + l * Math.cos(t), ey = F[1] + l * Math.sin(t);
			g.strokeStyle = col; g.lineWidth = 0.95 * sc; g.beginPath(); g.moveTo(F[0], F[1]); g.quadraticCurveTo(F[0] + l * 0.6 * Math.cos(t * 0.6), F[1] + l * 0.6 * Math.sin(t * 0.6), ex, ey); g.stroke();
			g.strokeStyle = '#3A2A24'; g.lineWidth = 0.6 * sc; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(t + 0.5) * 1.1, ey + Math.sin(t + 0.5) * 1.1); g.stroke();   /* the claw */
		}
		g.strokeStyle = col; g.lineWidth = 0.8 * sc; g.beginPath(); g.moveTo(F[0], F[1]); g.lineTo(F[0] - 2.4 * sc, F[1] + 0.3 * sc - sw * 1.6 * sc); g.stroke();
		g.lineCap = 'butt';
	}
	function kpFoot(ph, hx) {
		ph = ((ph % 1) + 1) % 1;
		if (ph < TK_STANCE) { return [hx + KP_STRIDE / 2 - KP_STRIDE * ph / TK_STANCE, KP_GROUND - 0.5, 0]; }
		var u = (ph - TK_STANCE) / (1 - TK_STANCE), e = u * u * (3 - 2 * u);
		return [hx - KP_STRIDE / 2 + KP_STRIDE * e, KP_GROUND - 0.5 - 6 * Math.sin(Math.PI * u), Math.sin(Math.PI * u)];
	}
	function kpPaint(g, ph, d) {
		var walk = ph >= 0, bob = walk ? -0.8 * Math.cos(ph * Math.PI * 4) : 0, i;
		var h2 = walk ? (ph * 2) % 1 : 0, hb = walk ? (h2 < 0.6 ? 2.4 - 4.8 * h2 / 0.6 : -2.4 + 4.8 * (h2 - 0.6) / 0.4) : 0;
		/* the hips and stride as the photo's front poult steps */
		var fA = walk ? kpFoot(ph + 0.5, 11) : [9, KP_GROUND - 0.5, 0], fB = walk ? kpFoot(ph, 25) : [27, KP_GROUND - 0.5, 0];
		kpLeg(g, [11, 39 + bob], fA, fA[2], KP.leg2, 11, 14, 1);
		g.save(); g.translate(22, 40); g.rotate(d * 0.55); g.translate(-22, -40 + bob);
		/* the short tail, then the body */
		g.fillStyle = '#4A3626'; g.beginPath(); tkPath(g, [[7, 16], [-2, 19], [-4, 25], [4, 27]], true); g.fill();
		var B = [[10, 14], [18, 13], [30, 13.5], [40, 15], [42.5, 19], [42.5, 25], [40.5, 31], [36, 36.5], [30, 40], [24, 41.2], [17, 41], [10, 39.4], [5, 34], [3, 25], [5, 17]];
		var bg = g.createLinearGradient(0, 12, 0, 42); bg.addColorStop(0, '#4E3A28'); bg.addColorStop(0.55, '#5C4836'); bg.addColorStop(1, '#7A6C5E');
		g.beginPath(); tkPath(g, B, true); g.fillStyle = bg; g.fill();
		g.save(); g.beginPath(); tkPath(g, B, true); g.clip();
		/* the back and shoulders: the tom's own shingled rows, small, each
		 * feather dark-centered and edged buff, flowing from the neck to the
		 * tail, as photographed (approved in round 4) */
		tkShingles(g, [46, 4], 8, 46, 1.55, 3.05, 2.5, 900, true);
		var dg = g.createLinearGradient(0, 30, 0, 42); dg.addColorStop(0, 'rgba(120,104,88,0)'); dg.addColorStop(1, 'rgba(178,162,142,.85)');
		g.fillStyle = dg; g.fillRect(0, 28, 46, 16);
		g.restore();
		/* the downy belly's edge: soft and irregular, not an oval's line */
		kpFuzz(g, [[38, 34], [33, 38.6], [26, 41], [18, 41.2], [10, 39.6], [5.5, 35]], -1, 30, 'rgba(176,160,140,.5)', 1.1, 960);
		kpFuzz(g, [[5, 18], [3.2, 24], [4, 31]], -1, 7, 'rgba(110,90,70,.45)', 0.9, 975);
		/* the folded wing: separate long feathers, each shaded darker along
		 * its shaft, edged pale, overlapping the one below, the tips
		 * staggered back toward the tail */
		var WG = [[34, 20], [24, 19], [12, 19.5], [3, 22.5], [1, 27], [8, 31.5], [20, 32.5], [30, 30], [36, 25]];
		g.fillStyle = '#5E4F43'; g.beginPath(); tkPath(g, WG, true); g.fill();
		for (i = 6; i >= 0; i--) {
			var y0 = 21 + i * 1.6, x0 = 32 - i * 1.5, tx = 1 + i * 1.15 + (tkJ(i + 990) - 0.5) * 1.4, ty = y0 + 2.4 - i * 0.2, wd = 1.35 + tkJ(i + 995) * 0.3;
			var fg2 = g.createLinearGradient(0, y0 - wd, 0, y0 + wd * 1.4); fg2.addColorStop(0, '#9A8A78'); fg2.addColorStop(0.45, '#6A5A4C'); fg2.addColorStop(1, '#4A3E34');
			g.save(); g.shadowColor = 'rgba(20,14,10,.5)'; g.shadowBlur = 0.8 * (g.getTransform ? Math.abs(g.getTransform().a) : 4); g.shadowOffsetY = 0.25 * (g.getTransform ? Math.abs(g.getTransform().a) : 4);
			g.fillStyle = fg2; g.beginPath(); g.moveTo(x0, y0 - wd); g.quadraticCurveTo((x0 + tx) / 2, y0 - wd * 1.1, tx + 0.6, ty - 0.5);
			g.quadraticCurveTo(tx - 0.6, ty + 0.4, tx + 0.8, ty + 0.9); g.quadraticCurveTo((x0 + tx) / 2, y0 + wd * 1.3, x0, y0 + wd); g.closePath(); g.fill(); g.restore();
			g.strokeStyle = 'rgba(222,208,186,' + (0.6 + tkJ(i + 999) * 0.3).toFixed(2) + ')'; g.lineWidth = 0.42;
			g.beginPath(); g.moveTo(x0 - 3, y0 - wd * 0.95); g.quadraticCurveTo((x0 + tx) / 2, y0 - wd * 1.08, tx + 0.6, ty - 0.5); g.quadraticCurveTo(tx - 0.5, ty + 0.3, tx + 0.8, ty + 0.9); g.stroke();
		}
		/* the coverts over the wing's front: buff-tipped */
		g.save(); g.beginPath(); tkPath(g, [[37, 18.5], [28, 18], [21, 21], [25, 26.5], [35, 25.5]], true); g.fillStyle = '#4A3828'; g.fill(); g.clip();
		tkShingles(g, [40, 12], 4, 18, 1.8, 2.9, 2.2, 940, true); g.restore();
		/* the neck and head: upright, bobbing; to feed, the body tips
		 * forward and the short neck curves down out of the breast */
		var t = Math.min(1, d), hx = 51 + hb * (1 - t) - t * 2, hy = 3 + t * 42, nb = [39 + 2 * t, 17 + 7 * t];   /* the neck shortens as the body tips: it comes out of the breast */
		var c1x = nb[0] + 4 + t * 9, c1y = nb[1] - 7 + t * 8, NL = [], NR = [];
		for (i = 0; i <= 8; i++) {
			var u = i / 8, q = 1 - u, px = q * q * nb[0] + 2 * q * u * c1x + u * u * hx, py = q * q * nb[1] + 2 * q * u * c1y + u * u * hy;
			var ddx = 2 * q * (c1x - nb[0]) + 2 * u * (hx - c1x), ddy = 2 * q * (c1y - nb[1]) + 2 * u * (hy - c1y), dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1, wv = 3.4 - 1.7 * u;   /* thicker at the body */
			NL.push([px - ddy / dl * wv, py + ddx / dl * wv]); NR.push([px + ddy / dl * wv, py - ddx / dl * wv]);
		}
		var ng = g.createLinearGradient(nb[0], nb[1], hx, hy); ng.addColorStop(0, '#8C7C68'); ng.addColorStop(0.5, KP.neck); ng.addColorStop(1, '#C2B6A6');
		g.fillStyle = ng; g.beginPath(); tkPath(g, NL.concat(NR.slice().reverse()), true); g.fill();
		/* fine down streaks along it, and a ragged edge */
		g.strokeStyle = 'rgba(110,92,74,.32)'; g.lineWidth = 0.22;
		for (i = 0; i < 22; i++) { var su = tkJ(i + 1010), sv = tkJ(i + 1030) * 2 - 1, j2 = Math.min(7, Math.floor(su * 8)), xa = NL[j2][0] + (NR[j2][0] - NL[j2][0]) * (0.5 + sv * 0.4), ya = NL[j2][1] + (NR[j2][1] - NL[j2][1]) * (0.5 + sv * 0.4), xb = NL[j2 + 1][0] + (NR[j2 + 1][0] - NL[j2 + 1][0]) * (0.5 + sv * 0.4), yb = NL[j2 + 1][1] + (NR[j2 + 1][1] - NL[j2 + 1][1]) * (0.5 + sv * 0.4);
			g.beginPath(); g.moveTo(xa, ya); g.lineTo(xa + (xb - xa) * 0.6, ya + (yb - ya) * 0.6); g.stroke(); }
		kpFuzz(g, NL, -1, 14, 'rgba(190,178,162,.55)', 0.8, 1050); kpFuzz(g, NR, 1, 14, 'rgba(150,134,116,.5)', 0.8, 1070);
		g.save(); g.translate(hx, hy); g.rotate(t * 1.0);
		g.fillStyle = KP.face; g.beginPath(); g.ellipse(0, 0, 4.4, 3.9, 0, 0, Math.PI * 2); g.fill();
		kpFuzz(g, [[-4, 1.5], [-3.4, -2.2], [0, -3.9], [3.2, -2.6]], -1, 10, 'rgba(176,160,140,.55)', 0.7, 1090);
		/* the crown: buff-brown, speckled dark */
		g.fillStyle = 'rgba(132,104,78,.7)'; g.beginPath(); g.ellipse(-1, -2.3, 3.4, 1.6, 0, 0, Math.PI * 2); g.fill();
		g.fillStyle = 'rgba(70,52,38,.75)';
		for (i = 0; i < 9; i++) { g.beginPath(); g.arc(-3.4 + tkJ(i + 1110) * 5, -3.2 + tkJ(i + 1120) * 1.8, 0.22 + tkJ(i + 1130) * 0.2, 0, Math.PI * 2); g.fill(); }
		/* the bill, its nostril, its darker tip */
		g.fillStyle = KP.beak; g.beginPath(); g.moveTo(3.6, -0.2); g.quadraticCurveTo(6.4, 0.6, 7.6, 2); g.quadraticCurveTo(5.6, 2, 3.4, 1.8); g.closePath(); g.fill();
		g.fillStyle = '#7A6250'; g.beginPath(); g.moveTo(6.6, 1.1); g.quadraticCurveTo(7.2, 1.5, 7.6, 2); g.lineTo(6.8, 1.95); g.closePath(); g.fill();
		g.strokeStyle = 'rgba(80,60,46,.6)'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(4.6, 0.5); g.lineTo(5.6, 0.8); g.stroke();
		/* the eye in its pale ring */
		g.fillStyle = '#E8DED2'; g.beginPath(); g.arc(1.4, -0.4, 1.8, 0, Math.PI * 2); g.fill();
		g.fillStyle = KP.eye; g.beginPath(); g.arc(1.4, -0.4, 1.35, 0, Math.PI * 2); g.fill();
		g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(1.9, -0.9, 0.35, 0, Math.PI * 2); g.fill();
		g.restore();
		g.restore();
		kpLeg(g, [25, 39 + bob], fB, fB[2], KP.leg, 11, 14, 1);
	}
	var KP_BOX = [-6, -3, 66, 69];
	/* one pre-drawn pose into c (a canvas, or an OffscreenCanvas in the
	 * worker), mirrored to face LEFT as every walker's art does. o: H his
	 * height at the largest size the theme draws him, k a poult's share of
	 * it, fr / kfr the walk frames, dpr. Keys: 'w0'-'w15' the walk,
	 * 'p1'-'p4' the head lowering to feed, 'pj' the jab; 'k…' a poult. */
	function tkDraw(c, key, o) {
		var poult = key.charAt(0) === 'k', b = poult ? KP_BOX : TK_BOX, k2 = poult ? key.slice(1) : key;
		var u = o.H * (poult ? o.k : 1) / (b[3] - b[1]), s2 = u * o.dpr, g;
		c.width = Math.ceil((b[2] - b[0]) * s2); c.height = Math.ceil((b[3] - b[1]) * s2);
		g = c.getContext('2d');
		if (g) {
			g.setTransform(-s2, 0, 0, s2, b[2] * s2, -b[1] * s2);
			var ph = k2.charAt(0) === 'w' ? +k2.slice(1) / (poult ? o.kfr : o.fr) : 0, d = k2.charAt(0) === 'p' ? (k2 === 'pj' ? 1 : +k2.slice(1) / 4) : 0;
			if (poult) { kpPaint(g, ph, d); } else { tkPaint(g, ph, d, k2 === 'pj' ? 1 : 0); }
		}
		return { w: (b[2] - b[0]) * u, h: (b[3] - b[1]) * u, u: u };
	}
	/* TK_END */
	return [tkPaint, tkDraw, TK_BOX, KP_BOX, TK_STRIDE, TK_GROUND, TK_STANCE, KP_STRIDE, KP_GROUND];   /* an array: its names minify (the worker reads [1]) */
	}
	var S = {
		turkey: '1 1|',   /* 4.13.2: the tom is drawn in code (TK_ above); this key names him */
		/* — fall leaves, 4.13.0: the four Rob picked, all Central Florida.
		 * leafc draws the cypress's needles as needles; leafm/leafm2 are
		 * Acer rubrum full red and mid-turn, two variations of one kind.
		 * 4.13.1 (Rob's pick): leafo, leafs and the other Thanksgiving pieces
		 * marked 4.13.1 are redrawn over public-domain or CC0 photographs at
		 * 50% (tools/tg-pieces.js draws them in the photographs' pixels,
		 * tools/tg-build.js scales them here). leafo is the live oak's broad,
		 * blunt-tipped leaf, dried brown; leafs has a sweetgum's FIVE lobes,
		 * kept RED: a burgundy sweetgum vanished against the navy footer. — */
		leafm: '30.4 32|<defs><radialGradient id="dccTgM1" cx=".55" cy=".45" r=".75"><stop stop-color="#E0453A"/><stop offset=".6" stop-color="#B92A2C"/><stop offset="1" stop-color="#7E1A22"/></radialGradient></defs><path d="M6.7 19.8q-2.9.6-6.1 2.6" stroke="#7A2A1E" stroke-width=".3" fill="none" stroke-linecap="round"/><path d="M6.6 19.8l-.3-.3.1-.3-.3-.3.1-.2-.3-.4.1-.2-.4-.2 0-.3-.5-.2.1-.3-.5-.2.1-.3-.5-.2.1-.2-.5-.2 0-.3-.4-.2 0-.3-.2-.5.3-.1-.2-.5.2-.2-.1-.4.2-.2-.2-.5.2-.2-.1-.4.2-.2-.2-.5.2-.1-.1-.5.2-.2-.2-.4.3-.2-.2-.5.2-.2.5 0 .1.3.5 0 .1.3.5 0 .1.2.5 0 .1.3.1-.5.3 0 .1-.5.3-.1.1-.5.3 0 .1-.5.3 0 .1-.5.3-.1.1-.5.3 0 .1-.5.3 0 .1-.5.3-.1.4-.2.2.2.4-.3.2.2.4-.2.2.2.4-.3.2.2.2-.4.2 0 .2-.5.3.1.2-.5.2 0 .2-.4.3 0 .2-.4.3 0 .1-.5.3 0 .2-.5.3 0 .2-.4.3 0 .2-.4.2 0 .2-.4.3 0 .2-.4.3.1.1-.5.3.1.1.5-.2.2.1.5-.3.1.1.5-.2.2.1.5-.3.1.1.5-.2.2.1.5-.3.1.1.6-.2.1.2.4-.3.2.2.4-.2.2.2.4-.3.1.2.4-.2.2.2.4-.3.2.3.5-.2.2.2.5-.2.2.3.5-.2.2.2.5-.2.2.4-.1.2.2.5-.2.1.3.4-.2.2.3.5-.2.1.3.4-.4.2.2.4-.3.3.1.3-.3.3.1.4-.3.2.1.4-.3.2.1.4-.3.3.1.3-.3.3.1.3.4-.1.3.3.3-.1.3.3.4-.1.2.3.4-.1.3.5-.1.2.2.5-.2.1.3.5-.2.2.3.5-.1.2.2.5-.1.1.2.5-.1.2.2.5-.1.2.2.5-.1.1.2.5-.1.2.2-.2.4-.3 0-.2.4-.3 0-.2.4-.3 0-.2.4-.3-.1-.2.5-.2-.1-.3.5-.2-.1-.3.5-.2-.1-.2.4-.3 0-.2.4-.3 0-.1.5-.3 0 0 .5-.3.1-.1.4-.3.1 0 .5-.3 0-.3.4-.3-.1-.3.3-.2-.1-.3.3-.3-.1-.3.4-.2-.1-.3.3-.3-.1-.3.3-.2-.1-.3.4-.2 0-.3.4-.3 0-.2.4-.3-.1.4.2 0 .3.4.2 0 .3.4.2-.1.2.5.2-.1.3.5.2-.1.3.5.2-.1.2.4.2 0 .3.4.2 0 .3.4.1 0 .3.5.2-.1.2.5.2 0 .3.4.2 0 .2.4.2 0 .3.5.1-.1.3.5.1 0 .3.4.2 0 .3.4.1 0 .3-.4.1-.2-.2-.4.2-.2-.3-.4.2-.2-.2-.4.1-.2-.2-.4.1-.2-.2-.4.1-.2-.2-.4.2-.2-.3-.4.2-.2-.2-.4.1-.2-.2-.4.3-.2-.2-.4.3-.3-.2-.3.3-.3-.1-.4.3-.2-.2-.4.3-.2-.2-.4.3-.3-.1-.4.3-.2-.2-.5 0 0-.3-.5 0-.1-.3-.5 0 0-.2-.5 0-.1-.3-.5 0-.1-.3-.4 0-.1-.3-.5 0-.1-.2-.4 0-.1-.3 0 .5-.3 0 0 .5-.3 0 0 .5-.3 0 0 .5-.3 0-.4-.3.1-.3-.4-.3.1-.3-.4-.3.1-.3-.4-.3.1-.3-.4-.3.1-.2-.4-.3.1-.3-.5-.1-.1-.2-.5-.1-.1-.3-.5 0-.1-.3-.5 0-.1-.3-.2-.4.2-.2-.3-.4.2-.2-.2-.4.2-.2-.3-.4.2-.2-.2-.5.2-.2-.1-.4.2-.2-.2-.5.2-.2-.1-.4z" fill="url(#dccTgM1)" stroke="#6E1620" stroke-width=".2" stroke-linejoin="round"/><path d="M6.7 19.8q4.8-9.3 9.7-16.7m-9.7 16.7q12.2-3 20.8-5.4m-20.8 5.4q9 4.8 17.4 8.6m-17.4-8.6q-.7-5.1-2.4-9.2m2.4 9.2q1.3 4.8 3.4 8.6" stroke="#F08A72" stroke-width=".2" fill="none" stroke-linecap="round" opacity=".85"/>',
		leafm2: function () { return S.leafm.replace(/dccTgM1/g, 'dccTgM2').replace('<stop stop-color="#E0453A"/><stop offset=".6" stop-color="#B92A2C"/><stop offset="1" stop-color="#7E1A22"/>', '<stop stop-color="#F2C14E"/><stop offset=".45" stop-color="#E8823A"/><stop offset="1" stop-color="#B8322C"/>').replace('#6E1620', '#8A3A1E').replace('#F08A72', '#FBE0A0'); },   /* the same leaf turned orange-gold */
		leafo: '32 24.8|<defs><linearGradient id="dccTgO1" y2="1"><stop stop-color="#8C6A2E"/><stop offset=".55" stop-color="#9E7A35"/><stop offset="1" stop-color="#6E5022"/></linearGradient></defs><path d="M.3 2.4l-1.1-.6" stroke="#6B4E22" stroke-width=".7" stroke-linecap="round"/><path d="M.8 2.7c.6-.5 2.2-1.4 4.1-1.6 1.9-.2 5-.2 7.4.4 2.3.6 4.4 1.9 6.5 3.2 2 1.4 4.1 3.5 5.7 4.9 1.6 1.5 3 2.8 4.1 4.1 1 1.4 1.9 2.6 2.3 4.1.3 1.5.4 3.9-.3 4.9-.6 1-2.1 1-3.7.8-1.5-.1-3.6-.8-5.7-1.6-2-.8-4.5-2.2-6.5-3.3-2-1.1-4.1-2.2-5.7-3.3-1.6-1-3-1.9-4.1-3.2-1.1-1.4-1.8-3.6-2.4-4.9-.7-1.4-1-2.5-1.3-3.3-.2-.7-1-.7-.4-1.2z" fill="url(#dccTgO1)" stroke="#5E4219" stroke-width=".3"/><path d="M26.9 23c-.9-.3-3.6-.8-5.7-1.6-2-.9-4.5-2.2-6.5-3.3-2-1.1-4.1-2.2-5.7-3.3-1.6-1.1-3-1.9-4.1-3.2-1.1-1.4-1.8-3.6-2.4-4.9-.7-1.4-1-2.7-1.3-3.3-.2-.6-.3-.1-.4-.1" stroke="#C4A15C" stroke-width=".7" fill="none" opacity=".55"/><path d="M.8 2.7c1.5.3 6 .7 9 2 3 1.3 6.1 3.6 9 5.7 2.8 2.2 6.2 5.3 8.1 7.4 2 2 3.1 4.1 3.7 4.9" stroke="#D9C08A" stroke-width=".5" fill="none" stroke-linecap="round"/><path d="M5.3 3.7q1.9-1.7 3.3-3.7m1.2 4.7q2.9-1.2 5.5-3m-1 5.9q3.2-1.4 6-3.3m-1.5 6.1q3.3-.7 6.3-2.2m-2.2 5.9q2.8-.7 5.4-1.9m-1.4 5.6q2.2-.1 4.3-.6m-2.4 3q1.1 0 2.2-.3m-25.7-16.2q.8 1.9 1.2 3.9m3.3-2.9q.1 2.6-.3 5.1m4.8-2.2q.1 2.8-.4 5.6m4.9-2.8q-.4 2.8-1.3 5.4m5.4-1.7q-.3 2.4-1.1 4.7m5.1-1q-.5 1.7-1.4 3.2m3.3-.8q-.3.9-.8 1.7" stroke="#C9AD73" stroke-width=".3" fill="none" opacity=".75"/>',
		leafc: function () { return tgCypress(); },   /* Rob picked B, bolder (2026-10-28) */
		leafs: '32 23.1|<defs><radialGradient id="dccTgS1" cx=".55" cy=".25" r=".85"><stop stop-color="#E0552F"/><stop offset=".55" stop-color="#B5342A"/><stop offset="1" stop-color="#7E2230"/></radialGradient></defs><path d="M19.1 3.1q1.5-3.5 5.4-8.1" stroke="#7A3B22" stroke-width=".3" fill="none" stroke-linecap="round"/><path d="M19.1 3c.6.1 1.7-.5 2.7-.4 1 0 2.5.2 3.6.6 1.1.4 2.1 1.2 2.9 1.8.8.6 1.4 1.4 1.8 2 .4.7 1 1.8.7 2-.2.3-1.5-.5-2.3-.6-.8-.2-1.6-.2-2.2-.3-.7 0-1.6-.4-1.6-.1 0 .3.9 1.4 1.3 2.2.5.7.9 1.4 1.4 2.2.5.8.9 1.6 1.6 2.5.6.8 2.5 2.4 2.4 2.6-.1.3-2-1-2.9-1.3-.9-.3-1.7-.4-2.7-.7-.9-.2-1.9-.9-2.9-.9-1 .1-1.9.8-2.9 1.4-1 .5-2 1.3-3.1 2-1.1.7-2.4 1.5-3.6 2.2-1.2.7-3 2.2-3.6 2-.6-.1 0-2 0-3.1 0-1-.2-2-.2-3.1 0-1.1.1-2.7.1-3.6 0-.9.4-1.3-.1-1.6-.5-.2-1.9 0-2.9 0-1 .1-2.1.2-3.2.3-1 0-3 .5-3.1.2-.1-.4 1.7-1.6 2.5-2.3.8-.7 1.7-1.4 2.4-2 .8-.6 2-1.3 2.1-1.7 0-.3-1-.4-1.6-.5-.6-.1-2 0-2-.2 0-.3 1.1-.9 2-1.4.8-.5 1.8-1.1 3.1-1.5 1.3-.5 3.2-.9 4.5-1.2 1.3-.2 2.3-.4 3.1-.2.9.2 1.6.9 2 1.4.5.4.2 1.2.7 1.3z" fill="url(#dccTgS1)" stroke="#6E1F2A" stroke-width=".1" stroke-dasharray="0.3 0.1"/><path d="M19.1 3.1Q25.3 5.9 29.9 8.6M19.1 3.1Q25.6 10.1 30.4 16.4M19.1 3.1Q14.7 12.5 10.5 20.7M19.1 3.1Q10 7 1.8 10.6M19.1 3.1Q11.7 3.6 4.9 4.4" stroke="#E88A5C" stroke-width=".2" fill="none" stroke-linecap="round" opacity=".8"/>',
		/* — thanksgiving — */
		acorn: '21.3 32|<defs><radialGradient id="dccTgK1" cx=".62" cy=".3" r=".75"><stop stop-color="#9A6638"/><stop offset=".5" stop-color="#5E3818"/><stop offset="1" stop-color="#36200C"/></radialGradient><linearGradient id="dccTgK2"><stop stop-color="#6F5638"/><stop offset=".55" stop-color="#A18A62"/><stop offset="1" stop-color="#5E4A30"/></linearGradient></defs><path d="M9.6 27.4l.2 4.5 1.8 0 .2-4.5z" fill="#8B7650" stroke="#4E3D24" stroke-width=".3"/><path d="M10.6 1.9c.9 0 1.5.4 2.3 1.1.9.6 2 1.5 2.7 2.7.7 1.3 1.2 2.9 1.5 4.7.3 1.8 1.3 5.2.3 6.3-1.1 1.1-4.5.5-6.8.5-2.2 0-5.4.6-6.5-.5-1.1-1.1-.4-4.5-.2-6.3.2-1.8.7-3.4 1.4-4.7.7-1.2 1.9-2.1 2.8-2.7.9-.7 1.7-1.1 2.5-1.1z" fill="url(#dccTgK1)" stroke="#2A1808" stroke-width=".4"/><path d="M10.6 2.1l-.5-1.6q.5-.7 1.1 0z" fill="#4A2E14"/><path d="M14.4 6.2q1.9 3.1 1.7 6.9" stroke="#D9B48A" stroke-width="1" fill="none" opacity=".45" stroke-linecap="round"/><path d="M3.6 16.3c1.2-.6 4.7-.4 7-.4 2.4 0 5.9-.2 7.1.4 1.1.6.1 2.3-.1 3.4-.2 1.2-.5 2.6-1 3.6-.5 1.1-1.3 2-2.1 2.7-.8.7-1.7 1.3-2.5 1.5-.9.3-1.8.3-2.7 0-.9-.2-2-.8-2.8-1.5-.8-.7-1.5-1.6-2-2.7-.4-1-.7-2.4-.9-3.6-.1-1.1-1.2-2.8 0-3.4z" fill="url(#dccTgK2)" stroke="#3E2F1A" stroke-width=".4"/><path d="M3.8 17.4q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-14 1.3q.8 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.9 1 1.8 0m-.8 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-13.7 1.3q.9 1 1.8 0m-.8 0q.8 1 1.7 0m-.8 0q.9 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.9 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.8 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.8 1 1.7 0m-.8 0q.9 1 1.7 0m-.8 0q.9 1 1.8 0m-.8 0q.9 1 1.7 0m-.8 0q.9 1 1.8 0m-13.3 1.4q.9 1 1.7 0m-.6 0q.8 1 1.7 0m-.7 0q.9 1 1.8 0m-.7 0q.9 1 1.7 0m-.6 0q.8 1 1.7 0m-.7 0q.9 1 1.8 0m-.7 0q.9 1 1.8 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.8 0m-.7 0q.9 1 1.8 0m-.7 0q.9 1 1.7 0m-.6 0q.8 1 1.7 0m-12.6 1.3q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-11.2 1.3q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-9.2 1.3q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-7.2 1.3q.9 1 1.7 0m-.7 0q.9 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0m-.7 0q.8 1 1.7 0" stroke="#4E3D24" stroke-width=".3" fill="none" opacity=".75"/>',
		pie: function () { return tgPie(); },
		cornucopia: function () { return tgHorn(); },
		/* — 4.13.0, Rob's picks for Thanksgiving — */
		/* The gourds are ONE kind with three variations, the way the jack
		 * faces are: three different plants, not three colours of one. */
		gourd1: '31.4 32|<defs><radialGradient id="dccTgP1" cx=".38" cy=".38" r=".75"><stop stop-color="#FDB65A"/><stop offset=".5" stop-color="#F08A22"/><stop offset="1" stop-color="#B9580C"/></radialGradient><linearGradient id="dccTgP2"><stop stop-color="#8E7A45"/><stop offset=".5" stop-color="#D5C08A"/><stop offset="1" stop-color="#7A6638"/></linearGradient></defs><path d="M15.4 4.1c1.2-.2 2.6-1.7 4.1-1.9 1.4-.2 3 .1 4.3.6 1.3.6 2.6 1.5 3.5 2.5.9 1 1.7 2.1 2.2 3.5.5 1.4.9 3.2.9 5 .1 1.8-.1 3.8-.6 5.7-.5 1.8-1.2 3.9-2.2 5.6-1 1.7-2.4 3.3-3.8 4.4-1.3 1-2.8 1.6-4.3 1.9-1.6.2-3.3 0-5.1-.3-1.8-.4-3.9-1-5.6-1.9-1.7-.9-3.3-2.1-4.4-3.5-1.2-1.4-2-3.2-2.5-5-.6-1.8-.8-3.8-.8-5.6.1-1.9.4-4.1 1.1-5.7.6-1.6 1.7-2.8 2.8-3.8 1.1-.9 2.6-1.7 3.8-2.1 1.2-.5 2.3-.5 3.4-.4 1.1.1 2 1.1 3.2 1z" fill="url(#dccTgP1)" stroke="#A9520E" stroke-width=".3"/><path d="M14.1 4.6q-9.7 5.7-10.1 13.2t11.5 13.1m-.9-26.3q-6.2 5.7-6.5 13.2t8.1 13.1m-1.1-26.3q-2.5 5.7-2.7 13.2t4.5 13.1m-1.3-26.3q1.3 5.7 1.3 13.2t.7 13.1m-1.5-26.3q4.9 5.7 5.1 13.2t-2.9 13.1m-1.7-26.3q8.5 5.7 8.8 13.2t-6.4 13.1m-2-26.3q12 5.7 12.4 13.2t-9.7 13.1" stroke="#C4650F" stroke-width=".4" fill="none" opacity=".7"/><path d="M14.1 4.6q-9.7 5.7-10.1 13.2t11.5 13.1m-.9-26.3q-6.2 5.7-6.5 13.2t8.1 13.1m-1.1-26.3q-2.5 5.7-2.7 13.2t4.5 13.1m-1.3-26.3q1.3 5.7 1.3 13.2t.7 13.1m-1.5-26.3q4.9 5.7 5.1 13.2t-2.9 13.1m-1.7-26.3q8.5 5.7 8.8 13.2t-6.4 13.1m-2-26.3q12 5.7 12.4 13.2t-9.7 13.1" stroke="#FFD08A" stroke-width=".2" fill="none" opacity=".35" transform="translate(0.6 0)"/><path d="M13.3 6.9c-.4-.7-.3-2.8-.2-3.8 0-.9.1-1.4.5-1.7.3-.4 1.1-.5 1.6-.4.4.1.8.2 1.1.8.3.5.6 1.8.8 2.6.2.8.6 1.7.3 2.2-.2.5-1 .9-1.7.9-.7.1-2 .1-2.4-.6z" fill="url(#dccTgP2)" stroke="#5E4C25" stroke-width=".2"/><path d="M14.3 1.9l.1 4.7m1.2-5 .6 5" stroke="#6E5A2E" stroke-width=".2"/>',
		gourd3: '29.1 32|<defs><radialGradient id="dccTgA1" cx=".42" cy=".38" r=".7"><stop stop-color="#4C6E45"/><stop offset=".6" stop-color="#26412A"/><stop offset="1" stop-color="#132317"/></radialGradient></defs><path d="M14.5 5.2c2 0 4.1-1.1 5.9-.8 1.7.2 3.4 1.1 4.6 2.3 1.2 1.2 2.3 3 2.6 4.6.4 1.7 0 3.5-.5 5.3-.6 1.7-1.6 3.6-2.7 5.2-1.1 1.7-2.4 3.3-4 4.7-1.7 1.4-3.9 3.8-5.9 3.8-1.9 0-4.1-2.4-5.8-3.8-1.6-1.4-2.9-3-4-4.7-1.2-1.6-2.1-3.5-2.7-5.2-.5-1.8-.9-3.6-.5-5.3.3-1.6 1.4-3.4 2.6-4.6 1.2-1.2 2.9-2.1 4.6-2.3 1.8-.3 3.9.8 5.8.8z" fill="url(#dccTgA1)" stroke="#8FAE7C" stroke-width=".6"/><ellipse cx="10.5" cy="25.6" rx="3.2" ry="2" fill="#D98A2B" opacity=".75" transform="rotate(30 10.5 25.6)"/><path d="M4.7 7.6q-3.5 9.9 9.8 22.4m-4.9-24.8q-1.7 12.3 4.9 24.8m0-24.8q0 12.3 0 24.8m5-24.8q1.7 12.3-5 24.8m9.9-22.4q3.5 9.9-9.9 22.4" stroke="#0B170D" stroke-width=".7" fill="none"/><path d="M7 7.6q-3 8.4 4.9 18m0-18q-1 8.4 1.7 18m3.6-18q1 8.4-1.8 18m6.7-18q3 8.4-4.9 18" stroke="#86A276" stroke-width=".6" fill="none" opacity=".45" stroke-linecap="round"/><path d="M13.1 5.2l.3-3.5 2.3-.2.6 3.7z" fill="#A2865A" stroke="#5E4A2C" stroke-width=".3"/><path d="M14 2l.1 2.9m1-3 .2 3" stroke="#6E5836" stroke-width=".2"/>',
		/* 4.13.1: the ear in straight kernel rows, husk dried to straw. */
		corn: '14.3 32|<defs><linearGradient id="dccTgC1"><stop stop-color="#B98E1E"/><stop offset=".5" stop-color="#E9B83A"/><stop offset="1" stop-color="#A97C14"/></linearGradient></defs><pattern id="dccTgC3" width="1.26" height="2.8" patternUnits="userSpaceOnUse"><rect x=".09" y=".09" width="1.09" height="1.23" rx=".4" fill="#F4CF55"/><rect x="-0.54" y="1.49" width="1.09" height="1.23" rx=".4" fill="#F4CF55"/><rect x=".71" y="1.49" width="1.09" height="1.23" rx=".4" fill="#F4CF55"/></pattern><linearGradient id="dccTgC4"><stop stop-color="#7A5408" stop-opacity=".75"/><stop offset=".3" stop-color="#7A5408" stop-opacity="0"/><stop offset=".62" stop-color="#FFF6CC" stop-opacity=".25"/><stop offset="1" stop-color="#7A5408" stop-opacity=".8"/></linearGradient><path d="M7.1 2.9q4.3 1.1 4 11.4-.2 10.3-4 13.1-3.7-2.8-4-13.1-.2-10.3 4-11.4z" fill="#B98E1E"/><path d="M7.1 2.9q4.3 1.1 4 11.4-.2 10.3-4 13.1-3.7-2.8-4-13.1-.2-10.3 4-11.4z" fill="url(#dccTgC3)"/><path d="M7.1 2.9q4.3 1.1 4 11.4-.2 10.3-4 13.1-3.7-2.8-4-13.1-.2-10.3 4-11.4z" fill="url(#dccTgC4)"/><path d="M6.9 2.9q-.6-1.8-1.8-2.6m2.3 2.6q.3-1.8 1.5-2.6m-1.8 2.6q0-1.5 0-2.3" stroke="#C8A06A" stroke-width=".2" fill="none"/><path d="M7.1 26.9q-6-2.3-7.1-11.5 3.4 4 6 9.2z" fill="#D8C48A" stroke="#9C8650" stroke-width=".2"/><path d="M7.1 26.9q6-2.3 7.2-12-3.4 4.5-6 9.7z" fill="#CDB77A" stroke="#9C8650" stroke-width=".2"/><path d="M7.1 31.4q-4.2-1.7-4.5-6.8 2.3 1.7 4.5 2.3 2.3-.6 4.6-2.3-.3 5.1-4.6 6.8z" fill="#E2D19C" stroke="#9C8650" stroke-width=".2"/><path d="M2 18.9q1.4 3.4 4 6m6.3-6.6q-1.4 3.4-4 6.6m-3.7 3.1q1.4 1.4 2.5 2.9" stroke="#A8925C" stroke-width=".2" fill="none"/>',
		/* 4.13.1: cranberries, glossy, each on its own wiry stem. */
		cranberry: '32 30.8|<defs><radialGradient id="dccTgR1" cx=".38" cy=".35" r=".75"><stop stop-color="#F0506A"/><stop offset=".55" stop-color="#C8183A"/><stop offset="1" stop-color="#7E0A22"/></radialGradient></defs><path d="M7.4 1.5q1-1 2.4-.8m0 0q4.5.3 6 3.2m-6-3.2q1.5 2.3 1 4.7m3-3.4q7.9-1 13.3 1m-5.4-1.5q1.9 2.9 2.4 6.9" stroke="#5A3A22" stroke-width=".4" fill="none" stroke-linecap="round"/><path d="M7.4 1.5q-2-1-4 0 1.5 1.5 4 0zm9.8.2q1.5-1.7 4-1.2-1.5 2-4 1.2zm8.4.8q2-1.5 3.9-.5-1.9 1.4-3.9.5z" fill="#3E5A2A" stroke="#26391A" stroke-width=".2"/><ellipse cx="15.8" cy="15.8" rx="11.3" ry="10.6" fill="url(#dccTgR1)" stroke="#6E0E1E" stroke-width=".5"/><ellipse cx="11.8" cy="11.5" rx="2.5" ry="1.6" fill="#FFE1E6" opacity=".85" transform="rotate(-30 11.8 11.5)"/><circle cx="16.3" cy="5.7" r=".6" fill="#5A2018"/><ellipse cx="25.4" cy="12.8" rx="5.2" ry="4.9" fill="url(#dccTgR1)" stroke="#6E0E1E" stroke-width=".5"/><ellipse cx="23.5" cy="10.8" rx="1.1" ry=".7" fill="#FFE1E6" opacity=".85" transform="rotate(-30 23.5 10.8)"/><circle cx="25.6" cy="8.1" r=".6" fill="#5A2018"/><ellipse cx="8.9" cy="25.6" rx="4.4" ry="4.2" fill="url(#dccTgR1)" stroke="#6E0E1E" stroke-width=".5"/><ellipse cx="7.3" cy="23.9" rx="1" ry=".6" fill="#FFE1E6" opacity=".85" transform="rotate(-30 7.3 23.9)"/><circle cx="9.1" cy="21.6" r=".6" fill="#5A2018"/>',
	};
	(W.DCCSeasonsArt = W.DCCSeasonsArt || {}).thanksgiving = { svgs: S, tk: tkMod };
}(window));
