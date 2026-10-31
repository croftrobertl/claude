/* DCC Seasons — Christmas art (4.14.1): the pieces, the wreath, and the
 * painters of Santa, his sleigh and his team, moved out of engine.js as
 * Thanksgiving was in 4.13.4, so a visit outside Christmas does not fetch
 * them. The loader fetches this file only on Christmas days (CFG.art),
 * before the engine, which reads window.DCCSeasonsArt when it runs.
 * Drawing for drawing these are 4.14.0 (approved by Rob over four rounds);
 * the engine pre-draws every pose in idle time and a crossing is drawImage. */
(function (W) {
	'use strict';
	var MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, atan2 = MT.atan2, sqrt = MT.sqrt;
	function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
	function lerp(a, b, t) { return a + (b - a) * t; }
	/* 4.14.0 Christmas: drawings built from geometry, as functions so the
	 * engine carries the few lines that make them rather than kilobytes of
	 * path data. Deterministic: the same picture every call. */
	function x1(n) { return MT.round(n * 10) / 10; }
	function xP(x, y) { return x1(x) + ' ' + x1(y); }
	/* The three glass balls (Rob's pick A): one drawing in three colours —
	 * a window reflection, a rim light, a ridged gold cap and a hook. */
	function xBall(c0, c1, c2) {
		return '24 32|<defs><radialGradient id="g" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="' + c0 + '"/><stop offset=".55" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></radialGradient><linearGradient id="cap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F3D27A"/><stop offset=".5" stop-color="#C9A227"/><stop offset="1" stop-color="#8C6E12"/></linearGradient></defs>' +
			'<circle cx="12" cy="3.2" r="2.2" fill="none" stroke="#B8860B" stroke-width="1.3"/><rect x="9.4" y="5" width="5.2" height="4.4" rx=".9" fill="url(#cap)"/><path d="M10.6 5.4 V9 M12 5.4 V9 M13.4 5.4 V9" stroke="#8C6E12" stroke-width=".5" opacity=".7"/>' +
			'<circle cx="12" cy="20" r="10.4" fill="url(#g)"/><ellipse cx="8.2" cy="15" rx="2.4" ry="3.8" fill="#FFFFFF" opacity=".55" transform="rotate(-28 8.2 15)"/><path d="M5.2 25.6 A10.4 10.4 0 0 0 18.6 27.4" stroke="#FFFFFF" stroke-width="1" fill="none" opacity=".28"/><circle cx="12" cy="20" r="10.4" fill="none" stroke="' + c2 + '" stroke-width=".6" opacity=".12"/>';
	}
	/* The wreath (Rob's pick A), the corner accent: pine sprigs with their
	 * needles in two greens, five berries and the bow at the bottom, both
	 * tails whole. It is INLINED into the page as an accent, so its
	 * gradient ids are prefixed: ids are page-global there. */
	function xWreath() {
		var out = [], cx = 22, cy = 22, R = 14, i, k;
		for (i = 0; i < 22; i++) {
			var a = (i / 22) * TAU, r = R + ((i % 3) - 1) * 1.6, x = cx + cos(a) * r, y = cy + sin(a) * r, d = a + 1.25;
			var col = i % 2 ? '#1F6E35' : '#3B9A4C', x0 = x - cos(d) * 4.6, y0 = y - sin(d) * 4.6, xe = x + cos(d) * 4.6, ye = y + sin(d) * 4.6;
			out.push('<path d="M' + xP(x0, y0) + ' L' + xP(xe, ye) + '" stroke="' + col + '" stroke-width="1.1"/>');
			for (k = 0; k < 5; k++) {
				var t = (k + 0.5) / 5, nx = x0 + (xe - x0) * t, ny = y0 + (ye - y0) * t, nd = d + 0.9;
				out.push('<path d="M' + xP(nx - cos(nd) * 2.2, ny - sin(nd) * 2.2) + ' L' + xP(nx + cos(nd) * 2.2, ny + sin(nd) * 2.2) + '" stroke="' + col + '" stroke-width=".9" stroke-linecap="round"/>');
			}
		}
		[[16.5, 33.5], [19.5, 36], [23.5, 36.4], [27.2, 34.4], [21, 33]].forEach(function (b) {
			out.push('<circle cx="' + b[0] + '" cy="' + b[1] + '" r="1.9" fill="url(#dccWrB)"/><circle cx="' + x1(b[0] - 0.6) + '" cy="' + x1(b[1] - 0.6) + '" r=".5" fill="#FFB3B3" opacity=".8"/>');
		});
		return '44 52|<defs><radialGradient id="dccWrB" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FF6B6B"/><stop offset=".6" stop-color="#D62828"/><stop offset="1" stop-color="#8E1414"/></radialGradient><linearGradient id="dccWrW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E03131"/><stop offset="1" stop-color="#A51C1C"/></linearGradient></defs>' +
			'<circle cx="22" cy="22" r="14" fill="none" stroke="#174F28" stroke-width="7"/>' + out.join('') +
			'<g transform="translate(22 38)"><path d="M-1.5 2 C-4 5 -5 9 -4.6 13 L-2.2 12.6 C-2.6 9 -2 6 0 3 Z" fill="#B51E1E"/><path d="M1.5 2 C4 5 5.2 9 4.8 13 L2.4 12.6 C2.8 9 2.2 6 0 3 Z" fill="#B51E1E"/><path d="M-4.6 13 L-2.2 12.6 L-3.6 11 Z M4.8 13 L2.4 12.6 L3.6 11 Z" fill="#7E1111"/><path d="M0 0 C-4 -5 -11 -5 -11 -1 C-11 2.6 -5 3.6 0 0 Z" fill="url(#dccWrW)"/><path d="M0 0 C4 -5 11 -5 11 -1 C11 2.6 5 3.6 0 0 Z" fill="url(#dccWrW)"/><path d="M-1.6 -0.6 C-5 -3.4 -9 -3 -9.4 -1" stroke="#FF7A7A" stroke-width=".7" fill="none" opacity=".7"/><path d="M1.6 -0.6 C5 -3.4 9 -3 9.4 -1" stroke="#FF7A7A" stroke-width=".7" fill="none" opacity=".7"/><rect x="-2" y="-2.2" width="4" height="4.4" rx="1" fill="#8E1414"/></g>';
	}
	/* The sabal palm for Christmas (palmxmas; Florida Keys keeps its own
	 * sabalpalm). Rob, round 4: no mirror symmetry; a visible petiole from
	 * the crown first, the fan opening further along it; more fronds up
	 * than drooping; the leaflets sprawling out along the costa past the
	 * hastula. Checked at 50% over a CC0 photograph ("SabalPalm.jpg",
	 * William Bumgarner, Wikimedia Commons). Angles and lengths are set by
	 * hand and deliberately unequal. */
	function xPalm() {
		var C = [19.6, 21.6], out = [], y, i;
		out.push('<path d="M17.7 47 C18.1 38 18.5 29 18.7 22.4 L21 22.6 C21.4 29 21.7 38 22.2 47 Z" fill="url(#tr)"/>');
		for (y = 24.4, i = 0; y < 34; y += 2.6, i++) {
			var w = 1.5 - i * 0.12, x = 19.9 + (i % 2 ? 0.25 : -0.2);
			out.push('<path d="M' + xP(x - w, y) + ' L' + xP(x, y - 1.7) + ' L' + xP(x + w, y) + ' L' + xP(x, y + 0.7) + ' Z" fill="#5C3A1F" opacity=".7"/>');
			out.push('<path d="M' + xP(x - w * 0.8, y + 0.3) + ' L' + xP(x - w * 1.25, y - 1.4) + '" stroke="#7A5230" stroke-width=".55"/>');
		}
		function frond(a, p, f, s, n, sag, col, skew) {
			var d = a * MT.PI / 180, ux = cos(d), uy = sin(d), bow = sag * p * abs(ux);
			var H = [C[0] + ux * p, C[1] + uy * p + bow], M = [C[0] + ux * p * 0.5 - uy * 0.4, C[1] + uy * p * 0.5 + bow * 0.25];
			out.push('<path d="M' + xP(C[0], C[1]) + ' Q' + xP(M[0], M[1]) + ' ' + xP(H[0], H[1]) + '" stroke="' + col[0] + '" stroke-width=".75" fill="none" stroke-linecap="round"/>');
			var da = atan2(H[1] - M[1], H[0] - M[0]), costa = f * 0.42;
			var E = [H[0] + cos(da) * costa, H[1] + sin(da) * costa + sag * costa * 0.6];
			out.push('<path d="M' + xP(H[0], H[1]) + ' L' + xP(E[0], E[1]) + '" stroke="' + col[0] + '" stroke-width=".55" fill="none" stroke-linecap="round"/>');
			for (var k = 0; k < n; k++) {
				var t = (k + 0.5) / n, off = (t - 0.5) * 2 * s * 1.45 + (skew || 0) * (t - 0.5) * (t - 0.5) * 40;
				var along = 0.08 + 0.55 * (1 - abs(t - 0.5) * 2);
				var B = [lerp(H[0], E[0], along), lerp(H[1], E[1], along)];
				var la = da + off * MT.PI / 180, len = f * (0.62 + 0.38 * cos((t - 0.5) * MT.PI)) * (0.9 + ((k * 37) % 10) / 50);
				var droop = len * (0.12 + 0.28 * abs(t - 0.5) * 2) * (0.5 + 0.5 * abs(cos(la)));
				var T = [B[0] + cos(la) * len, B[1] + sin(la) * len + droop], Q = [B[0] + cos(la) * len * 0.55, B[1] + sin(la) * len * 0.55 + droop * 0.15];
				var nx = -sin(la) * 0.42, ny = cos(la) * 0.42;
				out.push('<path d="M' + xP(B[0] - nx, B[1] - ny) + ' Q' + xP(Q[0] - nx * 0.7, Q[1] - ny * 0.7) + ' ' + xP(T[0], T[1]) + ' Q' + xP(Q[0] + nx * 0.7, Q[1] + ny * 0.7) + ' ' + xP(B[0] + nx, B[1] + ny) + ' Z" fill="' + col[1] + '"/>');
			}
		}
		/* greens light enough to read on the navy footer as well as on cream */
		var BACK = ['#5E9A48', '#4DAE60'], MID = ['#6AA24A', '#5CC070'], FRONT = ['#7DAE52', '#7BD88A'], OLD = ['#A09C52', '#B8BC66'];
		frond(146, 5.2, 8.4, 30, 9, 0.55, OLD, 0.4);     /* two old fronds, drooping, furthest back */
		frond(31, 4.4, 7.6, 26, 8, 0.6, OLD, -0.3);
		frond(-101, 7.6, 10.6, 34, 12, 0.08, BACK, 0.2); /* the tall ones behind, darkest */
		frond(-134, 6.6, 10.2, 31, 11, 0.18, BACK, -0.25);
		frond(-66, 7.2, 11.2, 36, 12, 0.14, BACK, 0.35);
		frond(-171, 6.2, 9.4, 29, 10, 0.34, MID, 0.3);   /* the sides, bowing */
		frond(-14, 5.6, 9.9, 32, 11, 0.3, MID, -0.4);
		frond(-151, 4.6, 8.6, 30, 10, 0.2, MID, 0.1);    /* in between, rising */
		frond(-41, 5.0, 9.2, 33, 11, 0.18, MID, -0.15);
		frond(-86, 3.2, 7.4, 48, 13, 0.1, FRONT, 0.25);  /* facing the viewer, over the crown */
		frond(-118, 2.8, 6.6, 40, 11, 0.12, FRONT, -0.3);
		out.push('<circle cx="19.6" cy="21.6" r="1.5" fill="#3C5A26"/>');
		return '40 47|<defs><linearGradient id="tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9A6A3C"/><stop offset=".5" stop-color="#7A5230"/><stop offset="1" stop-color="#55381F"/></linearGradient></defs>' + out.join('');
	}
	/* ---- 4.14.0 Christmas: Santa, the sleigh and the team --------------
	 * Approved by Rob over four rounds of stills (tools/xmas-redraw.js
	 * renders them). Module scope, beside the crane and the witch, so the
	 * Theme guide's ART_DRAW paints the same animals the scene does. The
	 * scene itself never paints these live: start() pre-draws every pose,
	 * lit and dark, in idle time (sdGet), and a crossing is drawImage. */
	/* a smooth, cyclic interpolation through keyframes K = [[phase, [angles]]]
	 * — Catmull-Rom on the phase, so joints never snap between keys */
	function rdKey(K, p) {
		p = ((p % 1) + 1) % 1;
		var n = K.length, i;
		for (i = 0; i < n; i++) { var a = K[i][0], b = K[(i + 1) % n][0] + (i + 1 === n ? 1 : 0); if (p >= a && p < b) { break; } }
		var k0 = K[(i - 1 + n) % n][1], k1 = K[i][1], k2 = K[(i + 1) % n][1], k3 = K[(i + 2) % n][1];
		var a0 = K[i][0], a1 = K[(i + 1) % n][0] + (i + 1 === n ? 1 : 0), t = (p - a0) / (a1 - a0);
		var out = [];
		for (var j = 0; j < k1.length; j++) {
			var P0 = k0[j], P1 = k1[j], P2 = k2[j], P3 = k3[j];
			out.push(0.5 * ((2 * P1) + (-P0 + P2) * t + (2 * P0 - 5 * P1 + 4 * P2 - P3) * t * t + (-P0 + 3 * P1 - 3 * P2 + P3) * t * t * t));
		}
		return out;
	}
	/* THE GALLOP, from Muybridge's horse and rdPaint plates (a transverse gallop,
	 * right lead): each leg is on the ground for ~35% of the stride, the
	 * footfalls run left hind, right hind, left fore, right fore, and after the
	 * leading fore lifts all four are in the air, gathered under the body.
	 * Angles are from straight down, positive toward the head; each key is
	 * [upper, middle, cannon, pastern]. The fore leg's middle joint (the knee)
	 * bends backward; the hind leg's middle joint (the hock) bends FORWARD —
	 * the stifle above it bends the other way, which is the rdPaint's reverse
	 * knee. */
	var RD_FORE = [
		[0.00, [0.50, 0.45, 0.35, 0.25]],     /* touchdown, reaching */
		[0.12, [0.08, 0.02, -0.02, -0.15]],   /* under the shoulder, nearly straight */
		[0.25, [-0.45, -0.55, -0.65, -0.85]], /* lift-off, trailing */
		[0.42, [-0.40, -0.95, -2.70, -2.90]], /* the knee folded, the hoof tucked up behind it */
		[0.62, [0.20, -0.35, -1.90, -2.00]],  /* swinging forward, still folded */
		[0.84, [0.60, 0.40, -0.45, -0.30]],   /* the reach, the hoof about to flip forward */
	];
	var RD_HIND = [
		[0.00, [0.95, -0.10, 0.50, 0.40]],    /* touchdown well under the belly */
		[0.12, [0.60, -0.50, 0.15, 0.05]],
		[0.25, [-0.10, -1.00, -0.50, -0.70]], /* the push-off, extended back */
		[0.42, [0.15, -1.35, -0.10, -0.30]],  /* the hock flexed, the hoof hanging */
		[0.62, [0.60, -1.10, 0.30, 0.20]],    /* swinging forward */
		[0.84, [1.00, -0.45, 0.30, 0.30]],    /* reaching */
	];
	/* footfalls, from Muybridge's plate: left hind, right hind, then the
	 * fores only after both hinds have left the ground (frame 6), so the
	 * stride has a brief stretched moment and the long gathered suspension */
	var RD_OFF = { lh: 0, rh: 0.10, lf: 0.45, rf: 0.56 };   /* each leg down 25% of the stride */
	/* A reindeer (Rangifer) in profile, facing +x, origin mid-body, the hooves
	 * about 55 units below it at a stand. ph is the stride phase. dark draws
	 * the whole animal as one silhouette. */
	var RDC = {
		back: '#86674A', back2: '#6E5239', belly: '#5C4430', leg: '#4A3627', legHi: '#5E4835',
		fback: '#6A5039', fback2: '#553F2C', fbelly: '#473424', fleg: '#3A2A1E', fpale: '#CDC3B2', fpale2: '#B5A994',
		pale: '#EEE6D6', pale2: '#D5C8B2', mane: '#F2ECDF', antler: '#B59B7B', antler2: '#7A5F43',
		hoof: '#2A2320', eye: '#1A1512', nose: '#2A2220', dark: '#1B130D',
	};
	/* a leg as ONE smooth tapered shape round its joint chain: wide where the
	 * thigh or arm roots in the body, the muscle of the gaskin / forearm
	 * swelling below the stifle / elbow, then a slender cannon to the fetlock
	 * and the hoof. No joint knobs: the taper carries the joints. */
	function rdLeg(g, x0, y0, K, p, near, dark, hind, far) {
		var a = rdKey(K, p), len = hind ? [14, 17, 15, 4] : [11, 17, 15, 4];
		var J = [[x0, y0]], x = x0, y = y0, i;
		for (i = 0; i < 4; i++) { x += sin(a[i]) * len[i]; y += cos(a[i]) * len[i]; J.push([x, y]); }
		/* the centre line with its widths: root, (mid-thigh), stifle/elbow,
		 * (the muscle), hock/knee, fetlock, the hoof top */
		var W = hind ? [7.6, 6.6, 5.2, 4.4, 2.3, 1.9, 2.1] : [6.2, 5.3, 4.4, 3.8, 2.2, 1.9, 2.0];
		var C = [J[0], mid(J[0], J[1], 0.5), J[1], mid(J[1], J[2], 0.42), J[2], J[3], J[4]];
		function mid(p1, p2, t) { return [lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t)]; }
		var L2 = [], R2 = [];
		for (i = 0; i < C.length; i++) {
			var p0 = C[i > 0 ? i - 1 : i], p1 = C[i < C.length - 1 ? i + 1 : i];
			var dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l;
			L2.push([C[i][0] + nx * W[i], C[i][1] + ny * W[i]]); R2.push([C[i][0] - nx * W[i], C[i][1] - ny * W[i]]);
		}
		g.beginPath(); g.moveTo(L2[0][0], L2[0][1]);
		for (i = 1; i < L2.length; i++) { var m1 = mid(L2[i - 1], L2[i], 0.5); g.quadraticCurveTo(L2[i - 1][0], L2[i - 1][1], m1[0], m1[1]); }
		g.lineTo(L2[L2.length - 1][0], L2[L2.length - 1][1]); g.lineTo(R2[R2.length - 1][0], R2[R2.length - 1][1]);
		for (i = R2.length - 2; i >= 0; i--) { var m2 = mid(R2[i + 1], R2[i], 0.5); g.quadraticCurveTo(R2[i + 1][0], R2[i + 1][1], m2[0], m2[1]); }
		g.closePath();
		if (dark) { g.fillStyle = RDC.dark; }
		else {
			var lg = g.createLinearGradient(J[0][0], J[0][1], J[4][0], J[4][1]);
			lg.addColorStop(0, far ? RDC.fback2 : RDC.back2); lg.addColorStop(0.45, far ? RDC.fleg : (near ? RDC.legHi : RDC.leg)); lg.addColorStop(1, far ? RDC.fleg : RDC.leg);
			g.fillStyle = lg;
		}
		g.fill();
		/* a broad cloven hoof, splayed with the pastern */
		g.save(); g.translate(J[4][0], J[4][1]); g.rotate(-a[3]);
		g.fillStyle = dark ? RDC.dark : RDC.hoof;
		g.beginPath(); g.moveTo(-2.3, -1); g.lineTo(2.5, -1); g.lineTo(3.2, 2.8); g.quadraticCurveTo(0, 3.7, -2.8, 2.8); g.closePath(); g.fill();
		if (!dark) { g.strokeStyle = RDC.pale2; g.lineWidth = 0.5; g.beginPath(); g.moveTo(0.3, -0.4); g.lineTo(0.4, 3.2); g.stroke(); }
		g.restore();
	}
	/* The reindeer. L = the body length (chest to rump = 60 units scaled), ph
	 * the stride phase, dark = one silhouette, far = the animal behind its
	 * partner (a shade darker), nose = a red nose with a glow (Rob's row A). */
	/* The stride's body motion, shared by the painter and the live red
	 * nose so the glow lands exactly on the pre-drawn head: the body rises
	 * in the suspension and sinks as the forelegs land, the spine arches
	 * when gathered, the neck pumps against the stride. */
	function rdPose(ph) {
		var pump = 0.14 * sin((ph - 0.35) * TAU);
		return { bob: -3.2 * cos((ph - 0.85) * TAU), pitch: 0.06 * sin((ph - 0.25) * TAU), arch: 0.5 + 0.5 * cos((ph - 0.9) * TAU),
			pump: pump, hx: 43 + 2 * pump, hy: -25 + 12 * pump };
	}
	/* Rob's red nose (A) with its soft glow, in the 60-unit body frame. The
	 * scene draws it AFTER the moon's cut, so it shows on the disc too. */
	function rdGlow(g, ph) {
		var o = rdPose(ph), a = -o.pump * 0.6, ca = cos(a), sa = sin(a);
		var nx = o.hx + 16.8 * ca - 0.8 * sa, ny = o.hy + 16.8 * sa + 0.8 * ca;
		var pc = cos(-o.pitch), ps = sin(-o.pitch), x = nx * pc - ny * ps, y = nx * ps + ny * pc + o.bob;
		var ng = g.createRadialGradient(x, y, 0.5, x, y, 7);
		ng.addColorStop(0, 'rgba(255,90,74,.55)'); ng.addColorStop(1, 'rgba(255,90,74,0)');
		g.fillStyle = ng; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
		g.fillStyle = '#E8392B'; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill();
		g.fillStyle = '#FFB3A8'; g.beginPath(); g.arc(x - 0.7, y - 0.8, 0.7, 0, TAU); g.fill();
	}
	function rdPaint(g, L, ph, dark, far, nose) {
		var s = L / 60, o = rdPose(ph);
		g.save(); g.scale(s, s);
		var bob = o.bob, pitch = o.pitch, arch = o.arch, pump = o.pump;
		g.translate(0, bob); g.rotate(-pitch);
		g.lineCap = 'round'; g.lineJoin = 'round';
		var cBack = far ? RDC.fback : RDC.back, cBack2 = far ? RDC.fback2 : RDC.back2, cBelly = far ? RDC.fbelly : RDC.belly;
		/* far legs first */
		rdLeg(g, -21, -1, RD_HIND, ph - RD_OFF.rh, false, dark, true, far);
		rdLeg(g, 18, 1, RD_FORE, ph - RD_OFF.rf, false, dark, false, far);
		/* the head's place: the neck runs from the withers to it and pumps */
		var hx = o.hx, hy = o.hy;
		/* ONE outline for the neck and body (no seam). Proportions from the
		 * NPS caribou photograph on the sheet: the body about 0.4 as deep as it
		 * is long, the neck about 0.45 of the body, carried forward and up */
		var top = -15 - arch * 2.5, ty = -1.5 + arch * 1.5;
		g.beginPath();
		g.moveTo(-26, -13);                                            /* the rump top */
		g.bezierCurveTo(-16, -13.5, -6, top + 1.5, 6, top);            /* the back */
		g.bezierCurveTo(14, top - 1.5, 22, top - 1, 27, -12);          /* the hump, into the crest */
		g.bezierCurveTo(32, -16, 38, -22, hx, hy - 5);                 /* the crest up to the head */
		g.lineTo(hx + 3, hy + 5);                                      /* across the neck at the skull */
		g.bezierCurveTo(40, -12, 36, -2, 33, 3);                       /* the throat, thick, down to the chest */
		g.bezierCurveTo(33, 7, 29, 9.5, 22, 10);                       /* the deep chest */
		g.bezierCurveTo(12, 11.5, 4, 7 + ty, -8, 5 + ty);              /* the belly to the waist */
		g.bezierCurveTo(-16, 4 + ty, -24, 6, -31, 1);                  /* the flank to the rump */
		g.bezierCurveTo(-35, -5, -33, -12.5, -26, -13);                /* the rump */
		g.closePath();
		if (dark) { g.fillStyle = RDC.dark; g.fill(); }
		else {
			var gr = g.createLinearGradient(0, -20, 0, 11);
			gr.addColorStop(0, cBack); gr.addColorStop(0.6, cBack2); gr.addColorStop(1, cBelly);
			g.fillStyle = gr; g.fill();
			g.fillStyle = cBack2; g.globalAlpha = 0.5;
			g.beginPath(); g.ellipse(23, -3, 8, 7.5, 0.3, 0, TAU); g.fill(); g.globalAlpha = 1;
			g.fillStyle = far ? RDC.fpale2 : RDC.pale2;
			g.beginPath(); g.moveTo(20, 9.5); g.bezierCurveTo(12, 11.5, 4, 7 + ty, -8, 4.8 + ty); g.bezierCurveTo(-14, 4 + ty, -20, 5.5, -26, 3.5);
			g.bezierCurveTo(-18, 1.5, -10, 0.5 + ty, -4, 1.5 + ty); g.bezierCurveTo(6, 3, 14, 6.5, 20, 9.5); g.closePath(); g.fill();
			g.fillStyle = far ? RDC.fpale : RDC.pale;
			g.beginPath(); g.moveTo(-31, 1); g.bezierCurveTo(-35, -5, -33, -11, -28, -12.5); g.bezierCurveTo(-30, -8, -29, -2, -26, 1.5); g.closePath(); g.fill();
			g.fillStyle = far ? RDC.fpale : RDC.mane;
			g.beginPath(); g.moveTo(hx + 2, hy + 6);
			for (var m = 0; m < 5; m++) { var mx = lerp(hx + 2, 33, (m + 1) / 5.2), my = lerp(hy + 6, 3, (m + 1) / 5.2); g.quadraticCurveTo(mx + 1.5, my + 3.6, mx - 1.5, my + 1.4); }
			g.lineTo(33, 3); g.bezierCurveTo(36, -2, 40, -12, hx + 3, hy + 5); g.closePath(); g.fill();
			g.fillStyle = cBack2; g.globalAlpha = 0.6;
			g.beginPath(); g.ellipse(-20, -2, 8.5, 6.5, -0.3, 0, TAU); g.fill(); g.globalAlpha = 1;
			g.strokeStyle = 'rgba(255,245,230,.16)'; g.lineWidth = 0.7;
			for (var i = 0; i < 5; i++) { g.beginPath(); g.moveTo(10 + i * 3, -11 + i); g.lineTo(8 + i * 3, -5 + i); g.stroke(); }
		}
		/* the short tail, pale underneath */
		g.fillStyle = dark ? RDC.dark : (far ? RDC.fpale : RDC.pale);
		g.beginPath(); g.moveTo(-32, -11); g.quadraticCurveTo(-39, -14.5, -37.5, -8); g.quadraticCurveTo(-36, -6, -31, -4.5); g.closePath(); g.fill();
		/* near legs */
		rdLeg(g, -22, 0, RD_HIND, ph - RD_OFF.lh, true, dark, true, far);
		rdLeg(g, 19, 2, RD_FORE, ph - RD_OFF.lf, true, dark, false, far);
		/* the head: a broad, blunt muzzle, the eye set high, short rounded ears
		 * below the antler bases */
		g.save(); g.translate(hx, hy); g.rotate(-pump * 0.6);
		g.beginPath();
		g.moveTo(-2, -6);                                   /* the brow */
		g.bezierCurveTo(4, -7, 11, -6, 15.5, -3.5);         /* the nose bridge, nearly straight */
		g.bezierCurveTo(18.5, -2, 18.5, 3, 16, 4.5);        /* the blunt end of the muzzle */
		g.bezierCurveTo(11, 6.5, 4, 6, 0, 5);               /* the jaw */
		g.bezierCurveTo(-3, 4, -4, 0, -2, -6);              /* the cheek back to the brow */
		g.closePath();
		if (dark) { g.fillStyle = RDC.dark; g.fill(); }
		else {
			var hg = g.createLinearGradient(0, -7, 0, 6); hg.addColorStop(0, cBack); hg.addColorStop(1, cBack2);
			g.fillStyle = hg; g.fill();
			g.fillStyle = far ? RDC.fpale2 : RDC.pale; g.beginPath(); g.moveTo(9, 1); g.bezierCurveTo(13, 0.5, 17, 1.5, 16.7, 3.4); g.bezierCurveTo(14, 5.8, 9, 5.4, 7, 4); g.closePath(); g.fill();
			g.fillStyle = RDC.eye; g.beginPath(); g.ellipse(3.6, -3.6, 1.5, 1.2, 0.15, 0, TAU); g.fill();
			g.fillStyle = '#FFF'; g.beginPath(); g.arc(3.1, -4, 0.45, 0, TAU); g.fill();
		}
		/* the nose pad — black, or Rob's red with its glow, which shows dark too */
		if (!dark) { g.fillStyle = RDC.nose; g.beginPath(); g.ellipse(16.8, 0.8, 2.2, 1.8, 0.3, 0, TAU); g.fill(); }
		/* the ears: short and rounded, below the antlers, one each side */
		g.fillStyle = dark ? RDC.dark : cBack2;
		g.beginPath(); g.ellipse(-5, -5.5, 2.4, 4.2, 0.9, 0, TAU); g.fill();
		if (!dark) { g.fillStyle = far ? RDC.fpale2 : RDC.pale2; g.beginPath(); g.ellipse(-5.4, -5.6, 1.2, 2.6, 0.9, 0, TAU); g.fill(); }
		g.fillStyle = dark ? RDC.dark : cBack;
		g.beginPath(); g.ellipse(-0.5, -7.5, 2.2, 3.8, 0.5, 0, TAU); g.fill();
		/* the antlers from the top of the skull */
		function beam(dx, w, col) {
			g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
			g.beginPath(); g.moveTo(dx, -6.5); g.bezierCurveTo(-5 + dx, -16, -9 + dx, -28, -3 + dx, -40); g.stroke();
			g.lineWidth = w * 0.8;
			g.beginPath(); g.moveTo(-1.5 + dx, -11); g.bezierCurveTo(3 + dx, -14, 8 + dx, -14, 11 + dx, -11); g.stroke();
			g.beginPath(); g.moveTo(-5 + dx, -20); g.bezierCurveTo(-1 + dx, -24, 3 + dx, -25, 6 + dx, -23); g.stroke();
			g.beginPath(); g.moveTo(-8 + dx, -30); g.lineTo(-14 + dx, -33); g.stroke();
			g.lineWidth = w * 0.7;
			g.beginPath(); g.moveTo(-5 + dx, -36); g.lineTo(-10 + dx, -43); g.moveTo(-4 + dx, -38); g.lineTo(-3 + dx, -46); g.moveTo(-3 + dx, -40); g.lineTo(3 + dx, -45); g.stroke();
		}
		beam(-2.5, 2.0, dark ? RDC.dark : RDC.antler2);
		beam(2, 2.3, dark ? RDC.dark : (far ? RDC.antler2 : RDC.antler));
		if (!dark) { g.strokeStyle = 'rgba(255,250,240,.35)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(2, -7.5); g.bezierCurveTo(-3, -17, -7, -28, -1.5, -39); g.stroke(); }
		g.restore();
		g.restore();
		if (nose) { g.save(); g.scale(s, s); rdGlow(g, ph); g.restore(); }
	}
	/* Santa in the sleigh. Units: the sleigh is 100 long, origin at the middle
	 * of its floor. t is time in seconds for the bob and sway; flick is 0..1,
	 * how far the rein flick has travelled (0 = at rest). The sleigh and Santa
	 * are NEVER dark (Rob): only the team goes to silhouette on the moon. */
	var SNC = {
		red: '#C8262B', red2: '#9E1B20', red3: '#E04A4A', fur: '#FFFDF8', fur2: '#E6DFD2',
		skin: '#F6CDB0', cheek: '#F0908A', nose: '#E8766F', beard: '#F6F4EE', beard2: '#E4E1DA',
		belt: '#2B2420', buckle: '#E6B422', mitt: '#2E7D3F', mitt2: '#1E5A2B',
		gold: '#D9A62B', gold2: '#9E7718', wood: '#7A4E2C', snSack: '#8A6238', sack2: '#6A4826',
	};
	function snSleigh(g) {
		/* the runners: curved steel with a scrolled nose, and the struts */
		g.lineCap = 'round'; g.lineJoin = 'round';
		g.strokeStyle = SNC.gold2; g.lineWidth = 3.2;
		g.beginPath(); g.moveTo(-44, 26); g.lineTo(38, 26); g.bezierCurveTo(50, 26, 56, 18, 54, 8); g.bezierCurveTo(53, 3, 48, 4, 49, 8); g.stroke();
		g.strokeStyle = SNC.gold; g.lineWidth = 1.2;
		g.beginPath(); g.moveTo(-44, 24.8); g.lineTo(38, 24.8); g.bezierCurveTo(49, 24.8, 54.5, 17, 52.6, 8.5); g.stroke();
		g.strokeStyle = SNC.gold2; g.lineWidth = 2.6;
		g.beginPath(); g.moveTo(-32, 12); g.lineTo(-34, 26); g.moveTo(24, 12); g.lineTo(26, 26); g.stroke();
		/* the body: a cutter, low at the dash, sweeping up to a scrolled back */
		g.beginPath();
		g.moveTo(44, 12);                                     /* the dash foot */
		g.bezierCurveTo(50, 10, 50, -2, 42, -8);              /* the curved dash */
		g.bezierCurveTo(38, -10, 30, -8, 26, -6);             /* over to the seat front */
		g.lineTo(-30, -6);                                    /* the seat line */
		g.bezierCurveTo(-40, -6, -48, -16, -46, -30);         /* rising to the back */
		g.bezierCurveTo(-45, -38, -56, -40, -56, -32);        /* the scroll */
		g.bezierCurveTo(-56, -28, -50, -28, -51, -31);
		g.lineTo(-52, -22);
		g.bezierCurveTo(-54, -8, -52, 8, -46, 12);            /* the back down to the floor */
		g.closePath();
		var bg = g.createLinearGradient(0, -30, 0, 12);
		bg.addColorStop(0, SNC.red3); bg.addColorStop(0.45, SNC.red); bg.addColorStop(1, SNC.red2);
		g.fillStyle = bg; g.fill();
		/* the gold rail along the top edge and the filigree on the side */
		g.strokeStyle = SNC.gold; g.lineWidth = 1.6;
		g.beginPath(); g.moveTo(42, -8); g.bezierCurveTo(38, -10, 30, -8, 26, -6); g.lineTo(-30, -6); g.bezierCurveTo(-40, -6, -48, -16, -46, -30); g.stroke();
		g.lineWidth = 1;
		g.beginPath(); g.moveTo(-40, 4); g.bezierCurveTo(-20, 0, 10, 0, 36, 4); g.stroke();
		g.beginPath(); g.moveTo(-36, 7); g.bezierCurveTo(-30, 2, -26, 2, -22, 7); g.moveTo(-14, 7); g.bezierCurveTo(-8, 2, -4, 2, 0, 7);
		g.moveTo(8, 7); g.bezierCurveTo(14, 2, 18, 2, 22, 7); g.stroke();
		g.fillStyle = SNC.gold; g.beginPath(); g.arc(-29, 4.6, 1.3, 0, TAU); g.fill(); g.beginPath(); g.arc(-7, 4.6, 1.3, 0, TAU); g.fill(); g.beginPath(); g.arc(15, 4.6, 1.3, 0, TAU); g.fill();
		/* the lower band, darker, like the shadow under the curve */
		g.fillStyle = 'rgba(74,14,36,.18)';   /* the red's own darker, cooler tone, not black (4.14.2) */
		g.beginPath(); g.moveTo(-46, 12); g.lineTo(44, 12); g.bezierCurveTo(46, 10, 46, 8, 44, 8); g.lineTo(-46, 8); g.closePath(); g.fill();
	}
	function snSack(g) {
		/* the snSack of gifts behind the seat, tied at the neck, two parcels showing */
		g.fillStyle = SNC.snSack;
		g.beginPath(); g.moveTo(-18, -8); g.bezierCurveTo(-8, -22, -14, -36, -24, -40); g.bezierCurveTo(-36, -38, -44, -26, -42, -8); g.closePath(); g.fill();
		g.fillStyle = SNC.sack2;
		g.beginPath(); g.moveTo(-18, -8); g.bezierCurveTo(-14, -16, -18, -26, -26, -30); g.bezierCurveTo(-22, -22, -22, -14, -24, -8); g.closePath(); g.fill();
		g.strokeStyle = '#D9A62B'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-28, -38); g.lineTo(-20, -36); g.stroke();
		g.fillStyle = '#2F9E44'; g.fillRect(-30, -46, 7, 7); g.fillStyle = '#1864AB'; g.fillRect(-22, -44, 6, 6);
		g.strokeStyle = SNC.gold; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-26.5, -46); g.lineTo(-26.5, -39); g.moveTo(-19, -44); g.lineTo(-19, -38); g.stroke();
	}
	/* the reins: a smooth line through the points P from Santa's hand to the
	 * lead reindeer, sagging between each pair; w is where the flick has got
	 * to along it (0..1, -1 = none) and the snap lifts the line as it passes */
	function snReins(g, P, w, amp) {
		g.beginPath(); g.moveTo(P[0][0], P[0][1]);
		for (var i = 0; i < P.length - 1; i++) {
			var a = P[i], b = P[i + 1], segs = 10;
			for (var k = 1; k <= segs; k++) {
				var t = k / segs, s = (i + t) / (P.length - 1);
				var sag = sin(t * MT.PI) * (b[2] || 6);
				var snap = w < 0 ? 0 : -amp * MT.exp(-((s - w) * (s - w)) / 0.012) * sin(MT.PI * clamp((s - w + 0.11) / 0.22, 0, 1));
				g.lineTo(lerp(a[0], b[0], t), lerp(a[1], b[1], t) + sag + snap);
			}
		}
		g.stroke();
	}
	/* Santa, seated, facing +x. hand = how far the hands have come up in the
	 * flick (0..1); bob/sway are the sleigh's motion, already applied by the
	 * caller. He is drawn with the same care as the witch: a round face with a
	 * rosy cheek, a clear white mustache over a full rounded beard, the hat's
	 * fur brim and pom, the coat's fur trim, the belt and buckle. */
	function snSanta(g, hand) {
		g.lineCap = 'round'; g.lineJoin = 'round';
		var up = hand * 7;
		/* a sleeve: a tapered red shape from the shoulder to the wrist, a fur
		 * cuff across the wrist, the mitten beyond it */
		function sleeve(sx, sy, wx, wy, shade) {
			var dx = wx - sx, dy = wy - sy, l = sqrt(dx * dx + dy * dy), nx = -dy / l, ny = dx / l;
			var sg = g.createLinearGradient(sx + nx * 5, sy + ny * 5, sx - nx * 5, sy - ny * 5);
			sg.addColorStop(0, shade ? SNC.red2 : SNC.red3); sg.addColorStop(0.5, shade ? SNC.red2 : SNC.red); sg.addColorStop(1, SNC.red2);
			g.fillStyle = sg;
			g.beginPath();
			g.moveTo(sx + nx * 5.2, sy + ny * 5.2);
			g.quadraticCurveTo(sx + dx * 0.5 + nx * 5, sy + dy * 0.5 + ny * 5 - up * 0.4, wx + nx * 3.6, wy + ny * 3.6);
			g.lineTo(wx - nx * 3.6, wy - ny * 3.6);
			g.quadraticCurveTo(sx + dx * 0.5 - nx * 4.6, sy + dy * 0.5 - ny * 4.6 - up * 0.4, sx - nx * 5.2, sy - ny * 5.2);
			g.closePath(); g.fill();
			/* the fur cuff, across the wrist */
			g.save(); g.translate(wx, wy); g.rotate(atan2(dy, dx));
			g.fillStyle = shade ? SNC.fur2 : SNC.fur; g.beginPath(); g.roundRect ? g.roundRect(-2.2, -4.4, 4.4, 8.8, 2) : g.rect(-2.2, -4.4, 4.4, 8.8); g.fill();
			g.fillStyle = shade ? SNC.mitt2 : SNC.mitt; g.beginPath(); g.ellipse(5.2, 0.4, 4.4, 3.4, 0.2, 0, TAU); g.fill();
			g.fillStyle = SNC.mitt2; g.beginPath(); g.ellipse(6.6, 2.6, 1.6, 1.1, 0.3, 0, TAU); g.fill();
			g.restore();
		}
		/* the far arm, behind the body */
		sleeve(-5, -23, 13, -17.5 - up, true);
		/* the body: a round belly in the red coat, the fur hem on the seat */
		g.beginPath();
		g.moveTo(-16, -8); g.bezierCurveTo(-18, -24, -12, -34, -2, -34);
		g.bezierCurveTo(6, -34, 12, -26, 13, -12); g.bezierCurveTo(13, -6, 8, -6, 2, -6);
		g.lineTo(-14, -6); g.closePath();
		var cg = g.createLinearGradient(-16, -34, 12, -6);
		cg.addColorStop(0, SNC.red3); cg.addColorStop(0.5, SNC.red); cg.addColorStop(1, SNC.red2);
		g.fillStyle = cg; g.fill();
		g.strokeStyle = SNC.fur; g.lineWidth = 4;
		g.beginPath(); g.moveTo(-15, -7.5); g.lineTo(12, -7.5); g.stroke();
		g.strokeStyle = SNC.fur2; g.lineWidth = 1; g.beginPath(); g.moveTo(-14, -9.4); g.lineTo(11, -9.4); g.stroke();
		g.strokeStyle = SNC.fur; g.lineWidth = 2.6; g.beginPath(); g.moveTo(10, -28); g.bezierCurveTo(12, -22, 13, -16, 12.5, -10); g.stroke();
		g.fillStyle = SNC.belt; g.beginPath(); g.moveTo(-17, -17); g.bezierCurveTo(-6, -14, 4, -14, 13, -17); g.lineTo(13, -13.2); g.bezierCurveTo(4, -10.2, -6, -10.2, -17, -13.2); g.closePath(); g.fill();
		g.fillStyle = SNC.buckle; g.fillRect(2, -16.6, 5.2, 5.2); g.fillStyle = SNC.belt; g.fillRect(3.3, -15.3, 2.6, 2.6);
		/* the near arm forward to the reins */
		sleeve(-2, -25, 17, -16 - up, false);
		/* the head: round, the ear, the nose */
		g.fillStyle = SNC.skin; g.beginPath(); g.arc(1, -46, 9.2, 0, TAU); g.fill();
		g.fillStyle = SNC.skin; g.beginPath(); g.ellipse(-6.5, -45.5, 1.8, 2.4, 0, 0, TAU); g.fill();
		g.fillStyle = SNC.cheek; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(-6.5, -45.5, 0.9, 1.3, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
		g.fillStyle = SNC.nose; g.beginPath(); g.ellipse(9.4, -45, 2.4, 2, 0, 0, TAU); g.fill();
		g.fillStyle = '#FFF'; g.beginPath(); g.arc(8.8, -45.8, 0.6, 0, TAU); g.fill();
		/* the eye and the white brow */
		g.fillStyle = '#2B2420'; g.beginPath(); g.ellipse(5.2, -48.6, 1.3, 1.1, 0, 0, TAU); g.fill();
		g.fillStyle = '#FFF'; g.beginPath(); g.arc(4.8, -49, 0.4, 0, TAU); g.fill();
		g.strokeStyle = SNC.fur; g.lineWidth = 1.6; g.beginPath(); g.moveTo(2.4, -51.6); g.quadraticCurveTo(5.5, -53.2, 8.2, -51.2); g.stroke();
		/* the blush: on the cheekbone, below the eye and above the mustache's outer edge */
		g.fillStyle = SNC.cheek; g.globalAlpha = 0.75;
		g.beginPath(); g.ellipse(8.6, -42.6, 2.6, 1.8, -0.2, 0, TAU); g.fill(); g.globalAlpha = 1;
		/* the beard: a full rounded mass from the ears down over the chest */
		var bd = g.createLinearGradient(0, -44, 0, -18); bd.addColorStop(0, SNC.beard); bd.addColorStop(1, SNC.beard2);
		g.fillStyle = bd;
		g.beginPath();
		g.moveTo(-7.5, -44); g.bezierCurveTo(-10, -36, -11, -28, -8, -22);
		g.quadraticCurveTo(-6, -17.5, -2, -19); g.quadraticCurveTo(1, -16, 4, -19.5);
		g.quadraticCurveTo(8, -17, 10, -21); g.bezierCurveTo(14, -27, 14, -36, 9.5, -42);
		g.quadraticCurveTo(5, -40, 1, -40.5); g.quadraticCurveTo(-4, -40, -7.5, -44); g.closePath(); g.fill();
		g.strokeStyle = SNC.beard2; g.lineWidth = 0.7;
		g.beginPath(); g.moveTo(-3, -38); g.quadraticCurveTo(-5, -30, -3, -23); g.moveTo(4, -38); g.quadraticCurveTo(7, -30, 5.5, -24); g.stroke();
		/* the hair: white, down in front of and above the ear, the sideburn
		 * running into the beard, and the back of the head under the brim */
		g.fillStyle = SNC.beard;
		g.beginPath(); g.moveTo(-4, -53); g.bezierCurveTo(-3, -49, -3.5, -45, -5, -42.5); g.quadraticCurveTo(-7, -44, -7.6, -44.5);
		g.bezierCurveTo(-6.6, -47, -6.8, -50, -7.8, -52.6); g.closePath(); g.fill();
		g.beginPath(); g.moveTo(-7.8, -52.6); g.bezierCurveTo(-11, -50, -11.4, -46, -9.4, -42.8); g.quadraticCurveTo(-8.4, -44, -7.6, -44.5);
		g.bezierCurveTo(-6.8, -47, -7, -50, -7.8, -52.6); g.closePath(); g.fill();
		g.strokeStyle = SNC.beard2; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-5.4, -51); g.quadraticCurveTo(-5, -47, -6, -44); g.stroke();
		/* the mustache: two white lobes under the nose, curling out and up */
		g.fillStyle = SNC.beard;
		g.beginPath(); g.moveTo(8.6, -43.2); g.bezierCurveTo(12, -43.6, 15, -41, 13.5, -38.6); g.bezierCurveTo(12, -37.5, 10.2, -39.5, 8.4, -40.6); g.quadraticCurveTo(7.4, -42, 8.6, -43.2); g.closePath(); g.fill();
		g.beginPath(); g.moveTo(8.4, -43); g.bezierCurveTo(5, -44, 1.5, -42, 0.5, -39.6); g.bezierCurveTo(2, -38.5, 5.5, -39.6, 8.2, -40.6); g.quadraticCurveTo(9.2, -42, 8.4, -43); g.closePath(); g.fill();
		g.strokeStyle = SNC.beard2; g.lineWidth = 0.6; g.beginPath(); g.moveTo(8.5, -42.4); g.lineTo(8.3, -40.8); g.stroke();
		/* the classic hat, ONE filled shape: from the brim's front the full red
		 * body rises over the head, the long cone flops back and down to the
		 * tip, and the under edge of the cone comes back to the brim's rear */
		var hg = g.createLinearGradient(-30, -66, 10, -52); hg.addColorStop(0, SNC.red2); hg.addColorStop(0.5, SNC.red); hg.addColorStop(1, SNC.red3);
		g.fillStyle = hg;
		g.beginPath();
		g.moveTo(10.6, -53.4);                                     /* the brim, front */
		g.bezierCurveTo(10.2, -61, 6, -67, 0, -67.6);              /* the body rising to the crown */
		g.bezierCurveTo(-8, -68.2, -16, -66, -24, -62);            /* the top edge of the cone, flopping back */
		g.bezierCurveTo(-30, -59, -34.5, -56.8, -37.5, -55.6);     /* ...down to the tip */
		g.bezierCurveTo(-33, -57.6, -27, -59.4, -19, -59.6);       /* the under edge of the cone, back toward the head */
		g.bezierCurveTo(-14.5, -59.7, -11, -58, -9.6, -55);        /* ...meeting the head */
		g.lineTo(-9.6, -52.6);                                     /* the brim, rear */
		g.closePath(); g.fill();
		g.fillStyle = 'rgba(74,14,36,.14)';                         /* the cone's underside in shadow: the red's own darker, cooler tone (4.14.2) */
		g.beginPath(); g.moveTo(-9.6, -55); g.bezierCurveTo(-11, -58, -14.5, -59.7, -19, -59.6); g.bezierCurveTo(-27, -59.4, -33, -57.6, -37.5, -55.6);
		g.bezierCurveTo(-30, -58.2, -20, -61.6, -12, -60); g.bezierCurveTo(-10.6, -58, -9.8, -56.4, -9.6, -55); g.closePath(); g.fill();
		g.strokeStyle = SNC.fur; g.lineWidth = 4.4; g.lineCap = 'round';   /* the fur brim */
		g.beginPath(); g.moveTo(-9.8, -52.4); g.quadraticCurveTo(0.6, -56, 10.6, -53.4); g.stroke();
		g.strokeStyle = SNC.fur2; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-8.2, -51); g.quadraticCurveTo(0.6, -54, 9.2, -52.2); g.stroke();
		g.fillStyle = SNC.fur; g.beginPath(); g.arc(-38.8, -55.2, 3.5, 0, TAU); g.fill();
		g.fillStyle = SNC.fur2; g.beginPath(); g.arc(-39.8, -54.2, 1.6, 0, TAU); g.fill();
	}
	var S = {
		/* — christmas — */
		/* 4.14.0: every Christmas piece redrawn to the standard of the witch
		 * and the heron, and approved by Rob piece by piece (four rounds). */
		/* 4.14.2 (Rob, from the style test): the pine's shading is its own
		 * dark cool green (#0E3A2A), not black; the candy cane's and the
		 * flamingo's hat-brim whites are #F6F4EE, not pure white; and (the
		 * two the style test missed) each glass ball's rim is its own darkest
		 * shade, not black, and Santa's beard is #F6F4EE. */
		/* holly: a closed sprig — a third leaf behind the berries */
		holly: '36 28|<defs><linearGradient id="l1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3E9E4F"/><stop offset="1" stop-color="#1E6B33"/></linearGradient><linearGradient id="l2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46A857"/><stop offset="1" stop-color="#1F6E35"/></linearGradient><linearGradient id="l3" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2E8A42"/><stop offset="1" stop-color="#1B5F2D"/></linearGradient><radialGradient id="b1" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FF6B6B"/><stop offset=".6" stop-color="#D62828"/><stop offset="1" stop-color="#8E1414"/></radialGradient></defs><path d="M18 14 C15 9 12 6 8 5.5 L9 8.2 C6.4 7.4 3.8 8 1.8 9.8 L4.6 10.8 C2.8 12.2 2 14 2.2 16.2 L5 15.4 C5 17.4 6.2 19.2 8 20.2 L8.8 17.8 C11 19 14 19.2 18 18 Z" fill="url(#l1)"/><path d="M18 14 C21 9 24 6 28 5.5 L27 8.2 C29.6 7.4 32.2 8 34.2 9.8 L31.4 10.8 C33.2 12.2 34 14 33.8 16.2 L31 15.4 C31 17.4 29.8 19.2 28 20.2 L27.2 17.8 C25 19 22 19.2 18 18 Z" fill="url(#l2)"/><path d="M18 15 C14.5 17 12 20 11.4 24 L14 22.8 C14.2 25 15.6 26.6 18 27.4 C20.4 26.6 21.8 25 22 22.8 L24.6 24 C24 20 21.5 17 18 15 Z" fill="url(#l3)"/><path d="M17 14.2 Q10 12.4 4.6 13.6 M19 14.2 Q26 12.4 31.4 13.6 M18 16 Q18 21 18 26" stroke="#BFE8C3" stroke-width=".8" fill="none" opacity=".75"/><circle cx="14.2" cy="14.4" r="4" fill="url(#b1)"/><circle cx="22" cy="14.4" r="4" fill="url(#b1)"/><circle cx="18" cy="18.6" r="4.2" fill="url(#b1)"/><g fill="#5A0E0E"><circle cx="15" cy="15.6" r=".6"/><circle cx="22.8" cy="15.6" r=".6"/><circle cx="18.8" cy="19.8" r=".6"/></g>',
		/* the three glass balls replace the single ornament */
		ballred: function () { return xBall('#FF8A8A', '#D62828', '#7A0F0F'); },
		ballgold: function () { return xBall('#FFF0B0', '#E0B32A', '#8C6410'); },
		ballblue: function () { return xBall('#9ED0FF', '#2B7BD6', '#0F3F7A'); },
		gift: '28 30|<defs><linearGradient id="bx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A77C9"/><stop offset=".5" stop-color="#1864AB"/><stop offset="1" stop-color="#114A80"/></linearGradient><linearGradient id="ld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3C8DE0"/><stop offset="1" stop-color="#1F6BB8"/></linearGradient><linearGradient id="rb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE066"/><stop offset=".5" stop-color="#F1C40F"/><stop offset="1" stop-color="#C79E07"/></linearGradient></defs><rect x="3" y="12" width="22" height="16" rx="1.6" fill="url(#bx)"/><rect x="3" y="12" width="22" height="2.4" fill="#0F3F6C" opacity=".35"/><rect x="1.6" y="8.6" width="24.8" height="5.4" rx="1.6" fill="url(#ld)"/><rect x="11.6" y="8.6" width="4.8" height="19.4" fill="url(#rb)"/><rect x="11.6" y="8.6" width="1.4" height="19.4" fill="#FFF2A8" opacity=".6"/><path d="M14 9.4 C9 9.6 6.2 7 7.6 3.6 C9 1.4 12.4 3.2 14 9.4 Z" fill="#F1C40F"/><path d="M14 9.4 C19 9.6 21.8 7 20.4 3.6 C19 1.4 15.6 3.2 14 9.4 Z" fill="#D9AE0B"/><path d="M14 9.4 C9.4 8.6 7.6 6 8.6 4.2" stroke="#FFF2A8" stroke-width=".8" fill="none" opacity=".7"/><path d="M13 9.6 L10.2 14.4 M15 9.6 L17.8 14.4" stroke="#C79E07" stroke-width="1.6" stroke-linecap="round"/><circle cx="14" cy="9.2" r="1.7" fill="#FFE066"/>',
		pine: '32 42|<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3FA85B"/><stop offset=".55" stop-color="#2B8A3E"/><stop offset="1" stop-color="#1D6B30"/></linearGradient></defs><rect x="13.5" y="35" width="5" height="6" rx="1" fill="#6F4E37"/><path d="M16 22 L30 36 Q27 37 24.5 35.6 Q22 37.4 19.5 36 Q16 37.8 12.5 36 Q10 37.4 7.5 35.6 Q5 37 2 36 Z" fill="url(#t)"/><path d="M16 14 L27 26 Q24.5 27 22.5 25.8 Q19.5 27.4 16 26 Q12.5 27.4 9.5 25.8 Q7.5 27 5 26 Z" fill="url(#t)"/><path d="M16 14 L27 26 Q24.5 27 22.5 25.8 Q19.5 27.4 16 26 Q12.5 27.4 9.5 25.8 Q7.5 27 5 26 Z" fill="#0E3A2A" opacity=".08"/><path d="M16 7 L24 17 Q22 18 20 17 Q18 18.4 16 17.4 Q14 18.4 12 17 Q10 18 8 17 Z" fill="url(#t)"/><path d="M16 2.5 L21 10 Q19.6 10.8 18 10 Q16 11 14 10 Q12.4 10.8 11 10 Z" fill="url(#t)"/><g fill="#0E3A2A" opacity=".16"><path d="M16 14 L22 20.6 L10 20.6 Z"/><path d="M16 22 L24 30.6 L8 30.6 Z"/></g><path d="M16 0.6 L17.2 3.4 L20.2 3.6 L17.9 5.4 L18.6 8.3 L16 6.8 L13.4 8.3 L14.1 5.4 L11.8 3.6 L14.8 3.4 Z" fill="#FFD43B"/><path d="M16 1.6 L16.8 3.6 L15.2 3.6 Z" fill="#FFF2A8"/>',
		/* the candy cane (Rob's B): red, white and green painted onto the
		 * stroke, so the stripes wrap the hook and end cleanly at the tip */
		candycane: '22 38|<defs><pattern id="st" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-50)"><rect width="7" height="7" fill="#F6F4EE"/><rect width="3.2" height="7" fill="#E03131"/><rect x="4.2" width="1.4" height="7" fill="#2F9E44"/></pattern></defs><path d="M7 35 L7 12 Q7 3.5 13 3.5 Q19 3.5 19 10.5" stroke="url(#st)" stroke-width="5.6" fill="none" stroke-linecap="round"/>',
		palmxmas: function () { return xPalm(); },
		/* the flamingo in a Santa hat (flamingoxmas; Snowbird keeps its own
		 * flamingo): the long S neck dipping below the breast, the beak hanging
		 * clear in front of it, one leg folded across the other at mid-leg with
		 * its webbed foot, the scarf, the dark primaries along the wing. Checked
		 * at 50% over a CC0 photograph ("American flamingo in Galápagos",
		 * E. Bailey, Wikimedia Commons). */
		flamingoxmas: '42 74|<defs><linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA8C8"/><stop offset="1" stop-color="#EC6AA0"/></linearGradient><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F78DB2"/><stop offset="1" stop-color="#D64A86"/></linearGradient><linearGradient id="nk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFB8D2"/><stop offset="1" stop-color="#F07AA8"/></linearGradient></defs><g transform="translate(0 3)"><path d="M21.2 30 L20.6 46.6 L19.8 66.4" stroke="#E64980" stroke-width="1.5" stroke-linecap="round" fill="none"/><circle cx="20.6" cy="46.6" r="1.15" fill="#D83A72"/><path d="M16.6 67 L19.8 66.4 L23.4 67" stroke="#E64980" stroke-width="1.3" stroke-linecap="round" fill="none"/><path d="M18.2 66.8 L19.8 66.4 L21.6 66.8 L19.9 67.6 Z" fill="#D83A72"/><path d="M25 30 L24.4 45.4 L15.6 46.4" stroke="#E64980" stroke-width="1.5" stroke-linecap="round" fill="none"/><circle cx="24.4" cy="45.4" r="1.15" fill="#D83A72"/><path d="M15.8 46.2 L12.4 48.8 L14 49.2 L15.4 48.4 L16.8 49.4 L17.2 47.8 Z" fill="#D83A72"/><path d="M9.4 26.4 C9.8 19.6 15 14.8 21.4 14.6 C29.4 14.4 37.4 18.6 40.6 25.2 C38 28 32.8 30.4 25.8 31.4 C18.4 32.4 11.6 30.6 9.4 26.4 Z" fill="url(#bd)"/><path d="M14.4 21.6 C18.4 17.2 27.2 16.8 34 21 C37 22.9 39 24.4 40.2 25.6 C35.4 27.8 28.4 29.2 21.4 28.8 C16.8 28.4 13.8 25.8 14.4 21.6 Z" fill="url(#wg)"/><path d="M26.6 28.7 C31.6 28.2 36.4 27.2 40.2 25.6 C38.8 28.2 35.2 29.9 30.6 30.3 C29 30.4 27.6 29.8 26.6 28.7 Z" fill="#2B2B2B" opacity=".88"/><path d="M18 20.2 C22 18.4 27 18.6 31 20.6" stroke="#FFC2DA" stroke-width=".7" fill="none" opacity=".7"/><path d="M12.6 25.4 C9 29.8 5.2 30.2 4.8 25.6 C4.5 21 6.6 16 7.6 11.8 C8.3 8.6 8.3 5.8 6.4 4.6" stroke="url(#nk)" stroke-width="3.1" fill="none" stroke-linecap="round"/><path d="M5.8 24.4 C5.7 20.6 7.4 16.4 8.4 12.4" stroke="#FFD0E2" stroke-width=".7" fill="none" opacity=".6"/><path d="M2.9 21.4 C4.5 19.8 7.5 20 8.5 21.8 C7.1 23.8 4.3 23.8 2.9 21.4 Z" fill="#2F9E44"/><path d="M3.7 22.8 C2.4 25.2 2.5 28 3.7 29.8 C5 27.8 5.4 25.2 5 23.2 Z" fill="#2F9E44"/><path d="M3.5 21.2 C5.1 20.3 7 20.3 8.2 21.4" stroke="#E03131" stroke-width=".9" fill="none" stroke-dasharray="1.6 1.3"/><path d="M3 25.8 L4.6 25.6 M3 27.8 L4.4 27.7" stroke="#E03131" stroke-width=".9"/><circle cx="5.3" cy="4.6" r="2.7" fill="#F783AC"/><path d="M3.6 3 L0.6 7.6 C0.3 8.3 0.3 9 0.4 9.6 L2.4 9.6 C2.5 9 2.8 8.4 3.4 7.6 L5 6 Z" fill="#F3E6EA"/><path d="M0.4 9.6 L0.8 14.2 C1 14.9 1.9 15 2.1 14.4 L2.4 9.6 Z" fill="#1A1A1A"/><path d="M1.4 9.6 L1.6 12.6" stroke="#4A4A4A" stroke-width=".35"/><circle cx="5.5" cy="3.8" r=".85" fill="#1A1A1A"/><circle cx="5.25" cy="3.55" r=".3" fill="#FFF"/><path d="M3 2.6 C3.3 -1.4 7.6 -2.8 10.8 -0.8 C14 1.2 16.2 4.6 17 9 C14.6 6.2 11.8 3.8 8.6 2.8 Z" fill="#E03131"/><path d="M10.8 -0.8 C14 1.2 16.2 4.6 17 9 C14.2 6.6 11.4 4.4 9.2 3.4 Z" fill="#A61E1E" opacity=".5"/><path d="M2.6 3 C5 1.4 7.8 1.6 9.6 3.2" stroke="#F6F4EE" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="17.1" cy="9.8" r="1.7" fill="#FFFFFF"/><circle cx="16.6" cy="9.3" r=".6" fill="#E9E4DA"/></g>',
		wreath: function () { return xWreath(); },
	};
	(W.DCCSeasonsArt = W.DCCSeasonsArt || {}).christmas = { svgs: S, xm: { paint: rdPaint, glow: rdGlow, sleigh: snSleigh, sack: snSack, reins: snReins, santa: snSanta } };
}(window));
