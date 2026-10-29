'use strict';
/**
 * DCC Seasons — the Anniversary crane's painter and in-betweener (4.13.5),
 * for the jointed bird of tools/anniv-crane-rig.js. Rob approved the
 * redrawn bird (2026-10-29); this carries it with the Director's six
 * polish points:
 *  1. separated, rounded primary tips (no sawtooth at any size);
 *  2. rust as staining ON the feathers, along each feather's edge and
 *     fading along it, never a smudge;
 *  3. faint feather texture on the body that reads at 3x and vanishes at
 *     guest size;
 *  4. the heron's crispness: found edges on the head, neck and wing
 *     leading edges, deeper shade under the body and wings;
 *  5. nothing painted behind the flight feathers: the feathers ARE the end
 *     of the wing, the gaps between them show the scene;
 *  6. the tail, legs and rump drawn: distinct bustle plumes, a darker
 *     under-tail, feathered thighs the legs disappear into, the value step
 *     from the pale belly to the darker rear.
 *
 * dc3Paint(g, U, lx, ly): U is a pose in the bird's frame (feet at the
 * origin, facing +x, 1 = standing height); the caller sets the transform.
 * (lx, ly) is the unit direction the light comes FROM in that frame.
 * dc3Mix(A, B, t) blends two poses: wing points swing round the shoulder
 * and the head round the base of the neck (arcs), the rest is linear.
 */
const fs = require('fs');
const path = require('path');

const DC3_SRC = String.raw`
var C3 = { base: '#93969A', shade: 'rgba(52,60,76,', lit: 'rgba(214,215,212,', rim: 'rgba(226,230,232,', ao: 'rgba(36,42,54,',
	cov: '#958E87', cov2: '#7C756E', fl: '#5E5550', fl2: '#463F3B', tip: '#2A2523', leg: '#3E4045', leg2: '#313338',
	rust: [168, 108, 62], crown2: '#7E1C25', eye: '#C9681E' };
function c3L(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1]; return Math.sqrt(dx * dx + dy * dy); }
function c3M(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function c3H(i) { var x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); }
function c3B(P) { var b = [1e9, 1e9, -1e9, -1e9]; for (var i = 0; i < P.length; i++) { var q = P[i]; if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1]; } return b; }
function c3At(P, t) {
	var L = 0, i, s = [0];
	for (i = 1; i < P.length; i++) { L += c3L(P[i - 1], P[i]); s.push(L); }
	var d = Math.max(0, Math.min(1, t)) * L;
	for (i = 1; i < P.length; i++) { if (s[i] >= d) { var u = (d - s[i - 1]) / ((s[i] - s[i - 1]) || 1); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; } }
	return P[P.length - 1].slice();
}
/* smooth where the outline bends gently, a corner where it turns hard;
 * convex corners rounded a touch, concave ones sharp */
function c3Path(g, P, open) {
	var n = P.length, i, c = [], ar = 0;
	for (i = 0; i < n; i++) {
		var a = P[(i - 1 + n) % n], b = P[i], d = P[(i + 1) % n];
		var t = Math.abs(Math.atan2(d[1] - b[1], d[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])); if (t > Math.PI) { t = 2 * Math.PI - t; }
		c.push(t > 1.05 || (open && (i === 0 || i === n - 1)));
		ar += P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1];
	}
	if (open) {
		g.moveTo(P[0][0], P[0][1]);
		for (i = 1; i < n - 1; i++) { var m = c3M(P[i], P[i + 1]); if (c[i]) { g.lineTo(P[i][0], P[i][1]); g.lineTo(m[0], m[1]); } else { g.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); } }
		g.lineTo(P[n - 1][0], P[n - 1][1]); return;
	}
	var s = c3M(P[n - 1], P[0]); g.moveTo(s[0], s[1]);
	for (i = 0; i < n; i++) {
		var q = P[i], nx = P[(i + 1) % n], pv = P[(i - 1 + n) % n], m2 = c3M(q, nx);
		if (c[i]) {
			var cr = (q[0] - pv[0]) * (nx[1] - q[1]) - (q[1] - pv[1]) * (nx[0] - q[0]);
			if (cr * ar > 0) {
				var ia = Math.PI - Math.acos(Math.max(-1, Math.min(1, ((q[0] - pv[0]) * (nx[0] - q[0]) + (q[1] - pv[1]) * (nx[1] - q[1])) / ((c3L(pv, q) * c3L(q, nx)) || 1))));
				g.arcTo(q[0], q[1], m2[0], m2[1], Math.min(0.007, Math.tan(ia / 2) * 0.1 * Math.min(c3L(pv, q), c3L(q, nx)))); g.lineTo(m2[0], m2[1]);
			} else { g.lineTo(q[0], q[1]); g.lineTo(m2[0], m2[1]); }
		} else { g.quadraticCurveTo(q[0], q[1], m2[0], m2[1]); }
	}
	g.closePath();
}
/* shadow settings are in device pixels: convert from the frame's units */
function c3Sh(g, color, blur, ox, oy) {
	var m = g.getTransform(), k = Math.sqrt(m.a * m.a + m.b * m.b);
	g.shadowColor = color; g.shadowBlur = blur * k; g.shadowOffsetX = (ox || 0) * m.a + (oy || 0) * m.c; g.shadowOffsetY = (ox || 0) * m.b + (oy || 0) * m.d;
}
/* a soft-edged fill: the shape drawn far away, its blurred shadow thrown
 * back (shadowBlur works everywhere; ctx.filter does not) */
function c3Soft(g, fn, color, blur, ox, oy, eo) {
	var m = g.getTransform(), T = 2e4 / (Math.abs(m.a) || 1);
	g.save(); c3Sh(g, color, blur, (ox || 0) + T, oy); g.translate(-T, 0); g.beginPath(); fn(); g.fillStyle = '#000'; if (eo) { g.fill('evenodd'); } else { g.fill(); } g.restore();
}
/* shade wrapped in from the edges that face one way */
function c3Wrap(g, P, vx, vy, color, blur) {
	var b = c3B(P);
	c3Soft(g, function () { g.rect(b[0] - 2, b[1] - 2, b[2] - b[0] + 4, b[3] - b[1] + 4); c3Path(g, P); }, color, blur, vx, vy, 1);
}
function c3Rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }
function c3Mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
/* the body outline from the pose's stretches, each joint once */
function c3Out(U) {
	var o = [], names = ['bill', 'crown', 'nape', 'back', 'tail', 'legs', 'breast', 'foreneck', 'chin'];
	for (var i = 0; i < names.length; i++) { var s = U.seg[names[i]]; o = o.concat(i ? s.slice(1) : s); }
	o.pop();   /* the chin ends where the bill began */
	return o;
}
/* one flight feather, base b to tip t: a blade that keeps its width to a
 * ROUNDED tip (point 1), lit vane toward the light, shaded vane away, a pale
 * shaft, dark at the tip; rust staining along its outer edge near the base,
 * fading along it (point 2) */
function c3Feather(g, b, t, w, lx, ly, cols, far, rust, fing) {
	var dx = t[0] - b[0], dy = t[1] - b[1], d = Math.sqrt(dx * dx + dy * dy) || 1e-6, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
	/* a primary tapers to a narrow rounded tip; a secondary keeps its
	 * width and ends in a shallow round */
	var tw = fing ? 0.24 : 0.4, r = Math.min(w * (fing ? 0.9 : 0.34), d * 0.3), m = [b[0] + dx * 0.5, b[1] + dy * 0.5];
	var gr = g.createLinearGradient(b[0], b[1], t[0], t[1]);
	gr.addColorStop(0, cols[0]); gr.addColorStop(0.62, cols[1]); gr.addColorStop(1, cols[2]);
	g.fillStyle = gr;
	g.beginPath();
	g.moveTo(b[0] + nx * w * 0.4, b[1] + ny * w * 0.4);
	g.quadraticCurveTo(m[0] + nx * w * 0.52, m[1] + ny * w * 0.52, t[0] - ux * r + nx * w * tw, t[1] - uy * r + ny * w * tw);
	g.quadraticCurveTo(t[0] + nx * w * tw * 0.9, t[1] + ny * w * tw * 0.9, t[0] + ux * w * 0.02, t[1] + uy * w * 0.02);
	g.quadraticCurveTo(t[0] - nx * w * tw * 0.9, t[1] - ny * w * tw * 0.9, t[0] - ux * r - nx * w * tw, t[1] - uy * r - ny * w * tw);
	g.quadraticCurveTo(m[0] - nx * w * 0.52, m[1] - ny * w * 0.52, b[0] - nx * w * 0.4, b[1] - ny * w * 0.4);
	g.closePath(); g.fill();
	var lit = (nx * lx + ny * ly) < 0 ? 1 : -1;
	if (rust > 0.02) {
		var rg = g.createLinearGradient(b[0], b[1], b[0] + dx * 0.55, b[1] + dy * 0.55);
		rg.addColorStop(0, c3Rgba(C3.rust, 0.55 * rust)); rg.addColorStop(1, c3Rgba(C3.rust, 0));
		g.strokeStyle = rg; g.lineWidth = w * 0.28;
		g.beginPath(); g.moveTo(b[0] + lit * nx * w * 0.24, b[1] + lit * ny * w * 0.24); g.quadraticCurveTo(m[0] + lit * nx * w * 0.32, m[1] + lit * ny * w * 0.32, b[0] + dx * 0.55 + lit * nx * w * 0.3, b[1] + dy * 0.55 + lit * ny * w * 0.3); g.stroke();
	}
	if (far) { return; }
	g.strokeStyle = 'rgba(200,196,190,.18)'; g.lineWidth = w * 0.06;
	g.beginPath(); g.moveTo(b[0] + lit * nx * w * 0.36 + dx * 0.15, b[1] + lit * ny * w * 0.36 + dy * 0.15);
	g.quadraticCurveTo(m[0] + lit * nx * w * 0.48, m[1] + lit * ny * w * 0.48, t[0] - ux * r + lit * nx * w * tw * 0.85, t[1] - uy * r + lit * ny * w * tw * 0.85); g.stroke();
	g.strokeStyle = 'rgba(24,24,28,.34)'; g.lineWidth = w * 0.12;
	g.beginPath(); g.moveTo(b[0] - lit * nx * w * 0.36 + dx * 0.1, b[1] - lit * ny * w * 0.36 + dy * 0.1);
	g.quadraticCurveTo(m[0] - lit * nx * w * 0.48, m[1] - lit * ny * w * 0.48, t[0] - ux * r - lit * nx * w * tw * 0.85, t[1] - uy * r - lit * ny * w * tw * 0.85); g.stroke();
	g.strokeStyle = 'rgba(170,166,160,.14)'; g.lineWidth = w * 0.035;
	g.beginPath(); g.moveTo(b[0] + dx * 0.1, b[1] + dy * 0.1); g.quadraticCurveTo(m[0], m[1], b[0] + dx * 0.88, b[1] + dy * 0.88); g.stroke();
}
/* how much rust a wing carries at a share u along it (0 shoulder, 1 wrist) */
function c3WR(U, u, j) { var w = U.wRust || [0.5, 0.3], d = (u - w[0]) / 0.22; return w[1] * Math.exp(-d * d) * (0.55 + 0.9 * c3H(j)); }
/* a wing: its occlusion on the body under it, the coverts' ground (only
 * between the leading edge and the feathers' base line), the flight
 * feathers from that line to the tips and NOTHING behind them (point 5),
 * the covert rows over the feathers' bases, the crisp leading edge */
function c3Wing(g, U, W, lx, ly, far, Obody) {
	var lead = W.lead, base = W.base, tips = W.tips, n = tips.length, nf = far ? 6 : 5, i;
	var span = c3L(lead[0], lead[lead.length - 1]) + c3L(lead[lead.length - 1], tips[0]);
	if (span < 0.03) { return; }
	var fade = Math.min(1, (span - 0.03) / 0.08);
	g.save(); g.globalAlpha *= fade;
	var cov = lead.concat(base);
	/* occlusion and cast shadow on the body, inside the body only */
	if (Obody) {
		g.save(); g.beginPath(); c3Path(g, Obody); g.clip();
		c3Soft(g, function () { c3Path(g, cov); for (var q = 0; q < n; q++) { var bb = c3At(base, q / (n - 1)); g.moveTo(bb[0], bb[1]); g.lineTo(tips[q][0], tips[q][1]); } }, C3.ao + '.5)', 0.03, -lx * 0.014, -ly * 0.016);
		g.restore();
	}
	/* the flight feathers, proximal first so the hand's lie over the arm's */
	/* folded (the standing bird) the secondaries are the wing's gray-brown
	 * and only the primaries at the rear go dark; open, they are the dark
	 * flight feathers the photographs show */
	var op = Math.max(0, Math.min(1, W.open)), FO = [[138, 132, 126], [122, 116, 110], [96, 90, 86]], FP = [[94, 85, 80], [70, 63, 59], [42, 37, 35]];
	var OPEN = far ? [[149, 143, 138], [119, 113, 108], [69, 64, 61]] : FP;
	for (i = n - 1; i >= 0; i--) {
		var t = tips[i], bpt = c3At(base, i / (n - 1));
		var fo = (i < nf) ? FP : FO, cl = [0, 1, 2].map(function (q) { return c3Rgba(c3Mixc(fo[q], OPEN[q], op), 1); }), cols = cl;
		var sp = c3L(tips[Math.max(0, i - 1)], tips[Math.min(n - 1, i + 1)]);
		var fing = i < nf && W.open > 0.5, w = fing ? Math.min(Math.max(sp * 0.95, 0.03), 0.062) : Math.max(sp * 0.62, 0.024);
		c3Feather(g, bpt, t, w, lx, ly, cols, far, fing ? 0 : c3WR(U, 1 - i / (n - 1), i) * 0.45, fing);
	}
	/* the coverts (4.13.5 fix 3): OPAQUE overlapping feather rows growing
	 * from the leading edge back over the flight feathers' bases, the last
	 * row's rounded ends making the scalloped edge, as in the photographs.
	 * A small solid ground under the first rows only, so nothing reads as a
	 * see-through fan. Rows are drawn from the back row forward, so each
	 * row lies over the one behind it. */
	var Bs = base.slice().reverse(), RW = 5, FR = [0.1, 0.3, 0.5, 0.7, 0.9];
	function rowAt(f) { var row = []; for (var q = 0; q <= 10; q++) { var a1 = c3At(lead, q / 10), b1 = c3At(Bs, q / 10); row.push([a1[0] + (b1[0] - a1[0]) * f, a1[1] + (b1[1] - a1[1]) * f]); } return row; }
	var g0 = lead.concat(rowAt(0.32).reverse());
	g.fillStyle = far ? '#A5A29E' : '#8E8781'; g.beginPath(); c3Path(g, g0); g.fill();
	for (var r = RW - 1; r >= 0; r--) {
		var row = rowAt(FR[r]), k, rl = 0; for (k = 1; k <= 10; k++) { rl += c3L(row[k - 1], row[k]); }
		var sz = (0.026 + r * 0.01) * (far ? 0.9 : 1), cnt = Math.max(3, Math.round(rl / (sz * 0.85)));
		for (k = 0; k < cnt; k++) {
			var u = (k + 0.5 + (r % 2) * 0.5) / (cnt + 0.5), p0 = c3At(row, u), ref = c3At(Bs, u), ld = c3At(lead, u);
			var ang = Math.atan2(ref[1] - ld[1], ref[0] - ld[0]), j = r * 37 + k;
			/* lighter and grayer near the leading edge, browner and darker
			 * toward the flight feathers, as the photographs show */
			var tone = far ? c3Mixc([176, 173, 170], [150, 146, 142], r / (RW - 1)) : c3Mixc([152, 147, 142], [112, 103, 96], r / (RW - 1));
			var ru = far ? 0 : c3WR(U, u, j) * (0.4 + r * 0.25);
			(function (sz, tone, ru) {
				g.save(); g.translate(p0[0], p0[1]); g.rotate(ang);
				function shp() { g.moveTo(-sz * 0.9, -sz * 0.52); g.quadraticCurveTo(sz * 0.9, -sz * 0.62, sz * 0.88, 0); g.quadraticCurveTo(sz * 0.9, sz * 0.62, -sz * 0.9, sz * 0.52); g.closePath(); }
				/* its own soft shadow on what it lies over */
				g.save(); c3Sh(g, C3.ao + '.45)', sz * 0.3, sz * 0.16, 0); g.fillStyle = c3Rgba(tone, 1); g.beginPath(); shp(); g.fill(); g.restore();
				/* shade along the feather toward its tip; rust staining from
				 * its tip edge, fading back along it */
				var fg = g.createLinearGradient(-sz * 0.9, 0, sz * 0.9, 0);
				fg.addColorStop(0, c3Rgba(c3Mixc(tone, [210, 206, 200], 0.18), 1)); fg.addColorStop(0.6, c3Rgba(tone, 1));
				fg.addColorStop(1, c3Rgba(c3Mixc(tone, C3.rust, Math.min(0.75, ru)), 1));
				g.fillStyle = fg; g.beginPath(); shp(); g.fill();
				/* the fringe: pale on the lit side */
				g.strokeStyle = far ? 'rgba(220,218,214,.35)' : 'rgba(208,202,194,.38)'; g.lineWidth = sz * 0.07;
				g.beginPath(); g.moveTo(sz * 0.2, -sz * 0.5); g.quadraticCurveTo(sz * 0.88, -sz * 0.4, sz * 0.86, 0); g.quadraticCurveTo(sz * 0.88, sz * 0.4, sz * 0.2, sz * 0.5); g.stroke();
				g.strokeStyle = 'rgba(44,40,40,.25)'; g.lineWidth = sz * 0.06;
				g.beginPath(); g.moveTo(sz * 0.1, sz * 0.12); g.lineTo(sz * 0.8, sz * 0.02); g.stroke();
				g.restore();
			})(sz, tone, ru);
		}
	}
	/* the leading edge: pale lesser coverts with a crisp found edge on the
	 * shade side (point 4) */
	g.lineCap = 'round';
	g.strokeStyle = far ? 'rgba(204,204,200,' + (0.32 * W.open) + ')' : 'rgba(216,214,210,' + (0.4 * W.open) + ')'; g.lineWidth = 0.008;
	g.beginPath(); c3Path(g, lead, true); g.stroke();
	g.strokeStyle = 'rgba(40,44,54,' + (0.38 * W.open) + ')'; g.lineWidth = 0.0035;
	var lo = []; for (i = 0; i < lead.length; i++) { var a = lead[Math.max(0, i - 1)], b2 = lead[Math.min(lead.length - 1, i + 1)], ddx = b2[0] - a[0], ddy = b2[1] - a[1], dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1, ox = -ddy / dl, oy = ddx / dl; if (ox * lx + oy * ly < 0) { ox = -ox; oy = -oy; } lo.push([lead[i][0] - ox * 0.0075, lead[i][1] - oy * 0.0075]); }
	g.beginPath(); c3Path(g, lo, true); g.stroke();
	g.restore();
}
/* a leg: hip inside the belly, the feathers' end, the ankle (bends
 * backward), the foot; one tapered shape, no knobs; dark where it goes up
 * under the thigh feathers */
function c3Leg(g, L, lx, ly, far) {
	var p = L.p, w0 = L.w[0], w1 = L.w[1], i;
	g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = far ? C3.leg2 : C3.leg;
	g.lineWidth = w0; g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[1][0], p[1][1]); g.lineTo(p[2][0], p[2][1]); g.stroke();
	g.lineWidth = w1; g.beginPath(); g.moveTo(p[2][0], p[2][1]); g.lineTo(p[3][0], p[3][1]); g.stroke();
	g.lineWidth = w0 * 1.15; g.beginPath(); g.moveTo(p[2][0], p[2][1]); g.lineTo(p[2][0] + (p[3][0] - p[2][0]) * 0.06, p[2][1] + (p[3][1] - p[2][1]) * 0.06); g.stroke();
	var f = p[3]; g.lineWidth = w1 * 0.72;
	for (i = 0; i < L.toes.length; i++) { var t = L.toes[i]; g.beginPath(); g.moveTo(f[0], f[1]); g.quadraticCurveTo((f[0] + t[0]) / 2, Math.max(f[1], t[1]) + 0.001, t[0], t[1]); g.stroke(); }
	if (!far) {
		g.strokeStyle = 'rgba(150,154,160,.5)'; g.lineWidth = w1 * 0.32;
		for (var k = 1; k < 3; k++) {
			var a = p[k], b = p[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
			if (nx * lx + ny * ly > 0) { nx = -nx; ny = -ny; }
			var o = (k < 2 ? w0 : w1) * 0.3;
			g.beginPath(); g.moveTo(a[0] + nx * o, a[1] + ny * o); g.lineTo(b[0] + nx * o, b[1] + ny * o); g.stroke();
		}
	}
	/* occlusion where the leg goes up under the feathers */
	var e = p[1], q2 = [e[0] + (p[2][0] - e[0]) * 0.18, e[1] + (p[2][1] - e[1]) * 0.18];
	var ag = g.createLinearGradient(e[0], e[1], q2[0], q2[1]); ag.addColorStop(0, 'rgba(20,22,26,.45)'); ag.addColorStop(1, 'rgba(20,22,26,0)');
	g.strokeStyle = ag; g.lineWidth = w0 * 0.95;
	g.beginPath(); g.moveTo(e[0], e[1]); g.lineTo(q2[0], q2[1]); g.stroke();
}
/* a plume of the bustle (or a hanging tertial, or the tail): its own
 * shape with a found lower edge, a lit upper rim, its own gray-brown tone,
 * soft barbs fraying at the tip (point 6) */
function c3Plume(g, a, z, w, lx, ly, q, tone) {
	var dx = z[0] - a[0], dy = z[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1e-6, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
	if (nx * lx + ny * ly > 0) { nx = -nx; ny = -ny; }   /* n points toward the light */
	var c = [a[0] + dx * 0.45 + lx * d * 0.16, a[1] + dy * 0.45 + ly * d * 0.16];
	function at(t) { var u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * z[0], u * u * a[1] + 2 * u * t * c[1] + t * t * z[1]]; }
	function shape() { g.moveTo(a[0] + nx * w * 0.35, a[1] + ny * w * 0.35); g.quadraticCurveTo(c[0] + nx * w * 1.05, c[1] + ny * w * 1.05, z[0] + nx * w * 0.1, z[1] + ny * w * 0.1); g.quadraticCurveTo(z[0] + ux * w * 0.3, z[1] + uy * w * 0.3, z[0] - nx * w * 0.12, z[1] - ny * w * 0.12); g.quadraticCurveTo(c[0] - nx * w * 0.7, c[1] - ny * w * 0.7, a[0] - nx * w * 0.35, a[1] - ny * w * 0.35); g.closePath(); }
	/* its shadow on what lies under it */
	c3Soft(g, shape, C3.ao + '.38)', w * 0.5, -lx * w * 0.3, -ly * w * 0.35);
	var pg = g.createLinearGradient(a[0] + nx * w, a[1] + ny * w, a[0] - nx * w, a[1] - ny * w);
	pg.addColorStop(0, c3Rgba(c3Mixc(tone, [210, 206, 200], 0.25), 1)); pg.addColorStop(0.5, c3Rgba(tone, 1)); pg.addColorStop(1, c3Rgba(c3Mixc(tone, [40, 40, 46], 0.35), 1));
	g.fillStyle = pg; g.beginPath(); shape(); g.fill();
	/* the found edge on the shade side, the lit rim on top */
	g.lineCap = 'round';
	g.strokeStyle = 'rgba(34,36,42,.3)'; g.lineWidth = w * 0.08;
	g.beginPath(); g.moveTo(a[0] - nx * w * 0.35, a[1] - ny * w * 0.35); g.quadraticCurveTo(c[0] - nx * w * 0.7, c[1] - ny * w * 0.7, z[0] - nx * w * 0.12, z[1] - ny * w * 0.12); g.stroke();
	g.strokeStyle = 'rgba(214,210,204,.16)'; g.lineWidth = w * 0.06;
	g.beginPath(); g.moveTo(a[0] + nx * w * 0.3, a[1] + ny * w * 0.3); g.quadraticCurveTo(c[0] + nx * w * 0.95, c[1] + ny * w * 0.95, z[0] + nx * w * 0.1, z[1] + ny * w * 0.1); g.stroke();
	/* barbs, faint, fraying at the tip */
	for (var i = 4; i < 12; i++) {
		var t = (i + 0.4 * Math.sin(q * 7.1 + i * 3.3)) / 12, p = at(t), p2 = at(Math.min(1, t + 0.06)), tx = p2[0] - p[0], ty = p2[1] - p[1], tl = Math.sqrt(tx * tx + ty * ty) || 1;
		tx /= tl; ty /= tl;
		var bl = w * (0.45 + 0.7 * t);
		for (var sd = -1; sd <= 1; sd += 2) {
			var bx = -ty * sd, by = tx * sd, lt = (bx * lx + by * ly) < 0;
			g.strokeStyle = lt ? 'rgba(200,196,190,.14)' : 'rgba(50,48,52,.16)'; g.lineWidth = 0.0025;
			g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + bx * bl * 0.5 + tx * bl * 0.3, p[1] + by * bl * 0.5 + ty * bl * 0.3, p[0] + bx * bl * 0.7 + tx * bl, p[1] + by * bl * 0.7 + ty * bl); g.stroke();
		}
	}
	g.strokeStyle = 'rgba(190,186,180,.3)'; g.lineWidth = 0.0028;
	g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], z[0] - ux * w * 0.4, z[1] - uy * w * 0.4); g.stroke();
}
/* The bird. */
function dc3Paint(g, U, lx, ly) {
	var O = c3Out(U), bx = c3B(O), i;
	var tailTip = c3At(U.seg.tail, 0.5), breast = c3At(U.seg.breast, 0.45), eye = U.eye;
	/* the contact shadow under the feet and the body */
	/* the far wing, behind everything; the legs, their tops under the belly.
	 * In the dance the legs and the contact shadow are drawn live (dc3Legs,
	 * the heron's way) so the feet stay planted while the body moves:
	 * U.noLegs leaves them out of the pre-drawn body */
	c3Wing(g, U, U.wb, lx, ly, 1, null);
	if (!U.noLegs) {
		var fN = U.legN.p[3], fF = U.legF.p[3];
		dc3Shadow(g, (fN[0] + fF[0]) / 2, Math.abs(fN[0] - fF[0]), 0);
		c3Leg(g, U.legF, lx, ly, 1); c3Leg(g, U.legN, lx, ly, 0);
	}
	/* the body: ONE outline, filled; everything below stays inside it */
	g.fillStyle = C3.base; g.beginPath(); c3Path(g, O); g.fill();
	g.save(); g.beginPath(); c3Path(g, O); g.clip();
	/* value: lit from above, the underside in cool shade (deeper, point 4) */
	var lg = g.createLinearGradient(bx[0] + (bx[2] - bx[0]) * (0.5 + lx * 0.3), bx[1] + (bx[3] - bx[1]) * (0.5 + ly * 0.5), bx[0] + (bx[2] - bx[0]) * (0.5 - lx * 0.3), bx[1] + (bx[3] - bx[1]) * (0.5 - ly * 0.5));
	lg.addColorStop(0, 'rgba(226,226,220,.28)'); lg.addColorStop(0.5, 'rgba(160,164,168,0)'); lg.addColorStop(1, 'rgba(52,60,78,.55)');
	g.fillStyle = lg; g.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
	/* the value step from the pale breast to the darker rear (point 6) */
	var rg = g.createLinearGradient(breast[0], breast[1], tailTip[0], tailTip[1]);
	rg.addColorStop(0, 'rgba(226,224,218,.22)'); rg.addColorStop(0.55, 'rgba(120,118,116,0)'); rg.addColorStop(1, 'rgba(70,66,64,.42)');
	g.fillStyle = rg; g.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
	/* body texture: faint scallops along the feathers' flow, rust-stained
	 * where the photographs are (points 2 and 3); gone at guest size */
	var fl = [tailTip[0] - eye[0], tailTip[1] - eye[1]], fll = Math.sqrt(fl[0] * fl[0] + fl[1] * fl[1]) || 1, fa = Math.atan2(fl[1], fl[0]);
	var st = 0.026, cnt = 0;
	for (var yy = bx[1]; yy < bx[3]; yy += st * 0.62) {
		for (var xx = bx[0] + ((cnt++) % 2) * st * 0.5; xx < bx[2]; xx += st) {
			var j = Math.round(xx * 997 + yy * 131), px = xx + (c3H(j) - 0.5) * st * 0.5, py = yy + (c3H(j + 7) - 0.5) * st * 0.4;
			if ((px - eye[0]) * (px - eye[0]) + (py - eye[1]) * (py - eye[1]) < 0.01) { continue; }
			var ru = 0;
			for (var q = 0; q < U.rust.length; q++) { var R = U.rust[q], dd = ((px - R[0]) * (px - R[0]) + (py - R[1]) * (py - R[1])) / (R[2] * R[2] * 2.2); ru += R[3] * Math.exp(-dd); }
			ru = Math.min(1, ru * (0.6 + 0.8 * c3H(j + 3)));
			var sz = st * (0.55 + 0.3 * c3H(j + 11));
			g.save(); g.translate(px, py); g.rotate(fa + (c3H(j + 5) - 0.5) * 0.5);
			if (c3H(j + 17) < 0.35) { g.restore(); continue; }
			g.strokeStyle = ru > 0.15 ? c3Rgba(C3.rust, 0.22 * ru) : 'rgba(226,224,218,.06)'; g.lineWidth = sz * (ru > 0.15 ? 0.16 : 0.09);
			g.beginPath(); g.moveTo(sz * 0.1, -sz * 0.55); g.quadraticCurveTo(sz * 0.62, -sz * 0.4, sz * 0.62, 0); g.quadraticCurveTo(sz * 0.62, sz * 0.4, sz * 0.1, sz * 0.55); g.stroke();
			g.strokeStyle = 'rgba(40,44,54,.05)'; g.lineWidth = sz * 0.09;
			g.beginPath(); g.moveTo(sz * 0.7, -sz * 0.35); g.quadraticCurveTo(sz * 0.78, 0, sz * 0.7, sz * 0.35); g.stroke();
			g.restore();
		}
	}
	/* the darker under-tail */
	var ut = c3At(U.seg.tail, 0.78);
	c3Soft(g, function () { g.ellipse(ut[0], ut[1], 0.07, 0.04, Math.atan2(fl[1], fl[0]), 0, Math.PI * 2); }, 'rgba(60,56,56,.5)', 0.03);
	/* the feathered thighs: the belly feathers come down over the top of
	 * each leg in a soft fringe */
	[U.legF, U.legN].forEach(function (L, li) {
		var e = L.p[1], h = L.p[0], ang = Math.atan2(e[1] - h[1], e[0] - h[0]);
		for (var k = 0; k < 4; k++) {
			var o = (k - 1.5) * 0.008, sz = 0.016 + 0.004 * c3H(k + li * 9);
			(function (o, sz) {
				g.save(); g.translate(e[0] + Math.cos(ang + 1.57) * o, e[1] + Math.sin(ang + 1.57) * o - 0.004); g.rotate(ang);
				c3Soft(g, function () { g.moveTo(-sz, -sz * 0.45); g.quadraticCurveTo(sz * 0.9, -sz * 0.5, sz * 0.8, 0); g.quadraticCurveTo(sz * 0.9, sz * 0.5, -sz, sz * 0.45); g.closePath(); }, li ? 'rgba(150,150,150,.9)' : 'rgba(120,120,122,.9)', sz * 0.2, -lx * sz * 0.2, -ly * sz * 0.3);
				g.restore();
			})(o, sz);
		}
	});
	/* the bustle, hanging tertials or tail: distinct plumes, back to front,
	 * each its own gray-brown */
	for (i = 0; i < U.plB.length; i++) {
		var tone = [[122, 116, 110], [108, 102, 98], [132, 126, 119], [98, 93, 90], [116, 110, 104], [104, 99, 96], [126, 120, 113]][i % 7];
		if (U.k === 'call') { tone = c3Mixc(tone, [206, 204, 200], 0.5); } else { tone = c3Mixc(tone, [66, 62, 60], 0.3); }
		c3Plume(g, U.plB[i], U.plT[i], (U.k === 'call' ? 0.026 : 0.036) + 0.006 * (i % 3), lx, ly, i, tone);
	}
	/* form: shade wrapped in from the edges away from the light, a little
	 * light on the edges toward it, the rim, a found edge (point 4) */
	c3Wrap(g, O, lx * 0.024, ly * 0.024, C3.shade + '.72)', 0.04);
	c3Wrap(g, O, -lx * 0.012, -ly * 0.012, C3.lit + '.36)', 0.02);
	c3Wrap(g, O, lx * 0.004, ly * 0.004, C3.rim + '.32)', 0.005);
	c3Wrap(g, O, lx * 0.004, ly * 0.004, C3.shade + '.95)', 0.0022);
	/* the head: the white cheek, the bare red crown, its found edge */
	c3Soft(g, function () { c3Path(g, U.cheek); }, 'rgba(233,232,227,.96)', 0.003);
	var cr = c3B(U.crown), crg = g.createLinearGradient(cr[0], cr[1], cr[0], cr[3]);
	crg.addColorStop(0, '#C9414A'); crg.addColorStop(1, C3.crown2);
	g.fillStyle = crg; g.beginPath(); c3Path(g, U.crown); g.fill();
	g.fillStyle = 'rgba(255,200,190,.25)'; g.beginPath(); g.ellipse((cr[0] + cr[2]) / 2 + lx * 0.005, cr[1] + 0.004, (cr[2] - cr[0]) * 0.28, (cr[3] - cr[1]) * 0.25, 0, 0, Math.PI * 2); g.fill();
	g.restore();
	/* a crisp found edge round the head and neck on the shade side */
	var hn = U.seg.crown.concat(U.seg.nape.slice(1));
	g.strokeStyle = 'rgba(38,42,52,.42)'; g.lineWidth = 0.0032; g.lineCap = 'round'; g.beginPath(); c3Path(g, hn, true); g.stroke();
	/* the near wing over the body */
	c3Wing(g, U, U.wa, lx, ly, 0, O);
	/* the bill and the eye */
	[U.billU, U.billL].forEach(function (B) {
		var bb = c3B(B), bgr = g.createLinearGradient(bb[0], bb[1], bb[0], bb[3]);
		bgr.addColorStop(0, '#5C5E62'); bgr.addColorStop(1, '#36383B');
		g.fillStyle = bgr; g.beginPath(); c3Path(g, B); g.fill();
	});
	g.fillStyle = C3.eye; g.beginPath(); g.arc(eye[0], eye[1], eye[2], 0, Math.PI * 2); g.fill();
	g.fillStyle = '#1E1C1B'; g.beginPath(); g.arc(eye[0], eye[1], eye[2] * 0.45, 0, Math.PI * 2); g.fill();
}
/* the contact shadow: soft, wider than the feet, fading as the bird rises */
function dc3Shadow(g, x, span, lift) {
	var k = Math.max(0.25, 1 - lift * 5);
	c3Soft(g, function () { g.ellipse(x, 0.004, span / 2 + 0.07 * (0.7 + 0.3 * k), 0.018 * (0.6 + 0.4 * k), 0, 0, Math.PI * 2); }, 'rgba(22,30,28,' + (0.42 * k) + ')', 0.02);
}
/* the legs drawn live: hip (in the moving body) to a foot in the world.
 * Two-bone IK, the joint between them the ankle, which bends BACKWARD
 * (behind the hip-foot line, -x in the bird's frame); a foot out of reach
 * is pulled up (the bird has left the ground) and its toes hang. */
function dc3Leg(g, hip, foot, Lt, Ls, w0, w1, frac, far, lx, ly, air) {
	var dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = Math.sqrt(dx * dx + dy * dy) || 1e-6, R = (Lt + Ls) * 0.995;
	if (d > R) { foot = [hip[0] + dx / d * R, hip[1] + dy / d * R]; dx = foot[0] - hip[0]; dy = foot[1] - hip[1]; d = R; }
	var a = (Lt * Lt - Ls * Ls + d * d) / (2 * d), h = Math.sqrt(Math.max(0, Lt * Lt - a * a)), ux = dx / d, uy = dy / d;
	var px = -uy, py = ux; if (px > 0) { px = -px; py = -py; }   /* the ankle goes behind */
	var ank = [hip[0] + ux * a + px * h, hip[1] + uy * a + py * h];
	var p1 = [hip[0] + (ank[0] - hip[0]) * frac, hip[1] + (ank[1] - hip[1]) * frac];
	var L = { p: [hip, p1, ank, foot], w: [w0, w1], toes: [] };
	var tl = 0.075, hang = Math.min(1, air);
	var tf = [[tl, 0.002], [tl * 0.72, 0.008], [-tl * 0.24, 0.002]];
	for (var i = 0; i < 3; i++) {
		/* planted: flat on the ground, forward; hanging: curled down and back */
		var tx = tf[i][0] * (1 - hang * 0.4), ty = tf[i][1] + hang * Math.abs(tf[i][0]) * 0.8;
		L.toes.push([foot[0] + tx, foot[1] + ty]);
	}
	c3Leg(g, L, lx, ly, far);
	return ank;
}
/* ---- in-betweening ---------------------------------------------------- */
function c3Lerp(a, b, t) { return a + (b - a) * t; }
function c3LP(A, B, t) { var o = []; for (var i = 0; i < A.length; i++) { o.push(typeof A[i] === 'number' ? c3Lerp(A[i], B[i], t) : c3LP(A[i], B[i], t)); } return o; }
/* points that swing round a pivot: angle and radius interpolated, the pivot
 * itself moving linearly, so a wing opens in arcs, never along chords */
function c3Arc(A, B, pa, pb, t) {
	var pc = [c3Lerp(pa[0], pb[0], t), c3Lerp(pa[1], pb[1], t)], o = [];
	for (var i = 0; i < A.length; i++) {
		var ra = c3L(pa, A[i]), rb = c3L(pb, B[i]), aa = Math.atan2(A[i][1] - pa[1], A[i][0] - pa[0]), ab = Math.atan2(B[i][1] - pb[1], B[i][0] - pb[0]);
		var da = ab - aa; while (da > Math.PI) { da -= 2 * Math.PI; } while (da < -Math.PI) { da += 2 * Math.PI; }
		if (ra < 1e-4) { aa = ab; da = 0; } if (rb < 1e-4) { da = 0; }
		var an = aa + da * t, r = c3Lerp(ra, rb, t);
		o.push([pc[0] + Math.cos(an) * r, pc[1] + Math.sin(an) * r]);
	}
	return o;
}
function dc3Mix(A, B, t, tw, th) {
	/* tw / th: separate timing for the wings and the head (overlap and
	 * follow-through), default t */
	if (tw == null) { tw = t; } if (th == null) { th = t; }
	var U = { k: t < 0.5 ? A.k : B.k, seg: {} }, n;
	var na = A.seg.nape[A.seg.nape.length - 1], nb = B.seg.nape[B.seg.nape.length - 1];
	for (n in A.seg) {
		if (n === 'bill' || n === 'crown' || n === 'nape' || n === 'foreneck' || n === 'chin') { U.seg[n] = c3Arc(A.seg[n], B.seg[n], na, nb, th); }
		else { U.seg[n] = c3LP(A.seg[n], B.seg[n], t); }
	}
	['billU', 'billL', 'crown', 'cheek'].forEach(function (k) { U[k] = c3Arc(A[k], B[k], na, nb, th); });
	var e = c3Arc([A.eye], [B.eye], na, nb, th)[0]; U.eye = [e[0], e[1], c3Lerp(A.eye[2], B.eye[2], th)];
	['wa', 'wb'].forEach(function (w) {
		var WA = A[w], WB = B[w], sa = WA.lead[0], sb = WB.lead[0], W = {};
		['lead', 'base', 'tips', 'inner'].forEach(function (k) { W[k] = c3Arc(WA[k], WB[k], sa, sb, tw); });
		W.open = c3Lerp(WA.open, WB.open, tw); U[w] = W;
	});
	['legN', 'legF'].forEach(function (l) { U[l] = { p: c3LP(A[l].p, B[l].p, t), toes: c3LP(A[l].toes, B[l].toes, t), w: c3LP(A[l].w, B[l].w, t) }; });
	U.plB = c3LP(A.plB, B.plB, t); U.plT = c3LP(A.plT, B.plT, t); U.rust = c3LP(A.rust, B.rust, t); U.wRust = c3LP(A.wRust, B.wRust, t);
	return U;
}
`;

module.exports = { DC3_SRC };

/* The dance (4.13.5): one bird's 5.4 s cycle as segments on a fixed list of
 * pre-drawn body frames (keys S, C, L and the in-betweens of SC, CS, CL, LC,
 * each with the wings leading and the head following: overlapping action).
 * Feet are planted in the world: on a step the far foot holds and the body
 * moves over it while the near foot lifts and swings to its new place; on
 * the leap the body crouches (anticipation), springs, the legs straighten,
 * leave the ground and hang, and it lands on the same spot and settles
 * (follow-through). The legs and the contact shadow are drawn live. */
const DANCE_SRC = String.raw`
var DC_SEQ = { SC: ['stand', 'call', 10], CS: ['call', 'stand', 10], CL: ['call', 'leap', 8], LC: ['leap', 'call', 8] };
var DC_CYC = [['hold', 'S', 0.7], ['seq', 'SC', 0.9], ['hold', 'C', 0.5], ['dip', 'C', 0.25, 0, 1], ['seq', 'CL', 0.45], ['seq', 'LC', 0.45],
	['dip', 'C', 0.3, 1, 0], ['hold', 'C', 0.35], ['seq', 'CS', 0.9], ['hold', 'S', 0.6]];
var DC_LIFT = 0.14, DC_DIP = 0.035;
function dcEase(t) { return t * t * (3 - 2 * t); }
/* the frame list: keys first, then each sequence's in-betweens */
function dcFrames(RIG) {
	var F = [{ key: 'S', U: RIG.stand }, { key: 'C', U: RIG.call }, { key: 'L', U: RIG.leap }], idx = { S: 0, C: 1, L: 2 };
	for (var s in DC_SEQ) {
		var q = DC_SEQ[s], A = RIG[q[0]], B = RIG[q[1]], n = q[2]; idx[s] = [];
		for (var i = 1; i < n; i++) {
			var t = i / n, tw = dcEase(Math.min(1, t * 1.25)), th = dcEase(Math.max(0, (t - 0.18) / 0.82));
			idx[s].push(F.length); F.push({ key: s + i, U: dc3Mix(A, B, dcEase(t), tw, th) });
		}
	}
	F.idx = idx;
	return F;
}
function dcLegInfo(U, which) {
	var L = U[which], p = L.p, Lt = c3L(p[0], p[2]), Ls = c3L(p[2], p[3]);
	return { hip: p[0], foot: p[3], Lt: Lt, Ls: Ls, frac: c3L(p[0], p[1]) / (Lt || 1), w: L.w };
}
/* the state of one bird at time tt (s) into its cycle: which frame, where
 * the body is (root x, lift), and each foot in the world (bird units) */
function dcAt(F, tt) {
	var T = 0, i, c; for (i = 0; i < DC_CYC.length; i++) { T += DC_CYC[i][2]; }
	tt = ((tt % T) + T) % T;
	var t0 = 0;
	for (i = 0; i < DC_CYC.length; i++) { c = DC_CYC[i]; if (tt < t0 + c[2]) { break; } t0 += c[2]; }
	var u = (tt - t0) / c[2], fi, dy = 0, step = null;
	var S = F[0].U, C = F[1].U;
	/* the root stands so the far foot is where it was planted: standing, the
	 * far foot is at the root's 0; calling, the root has moved over it */
	var farS = S.legF.p[3][0], farC = C.legF.p[3][0], rootS = 0, rootC = farS - farC;
	var root = rootS, feet;
	function frameOf(seq, uu) { var L = F.idx[seq], k = Math.round(dcEase(uu) * (L.length + 1)); return k <= 0 ? F.idx[DC_SEQ[seq][0] === 'stand' ? 'S' : DC_SEQ[seq][0] === 'call' ? 'C' : 'L'] : (k > L.length ? F.idx[DC_SEQ[seq][1] === 'stand' ? 'S' : DC_SEQ[seq][1] === 'call' ? 'C' : 'L'] : L[k - 1]); }
	var nearS = [rootS + S.legN.p[3][0], 0], nearC = [rootC + C.legN.p[3][0], 0], farW = [rootS + farS, 0];
	if (c[0] === 'hold') { fi = F.idx[c[1]]; root = c[1] === 'S' ? rootS : rootC; feet = c[1] === 'S' ? [nearS, farW] : [nearC, farW]; }
	else if (c[0] === 'dip') { fi = F.idx.C; root = rootC; dy = DC_DIP * dcEase(c[3] + (c[4] - c[3]) * u); feet = [nearC, farW]; }
	else if (c[1] === 'SC' || c[1] === 'CS') {
		fi = frameOf(c[1], u); var e = dcEase(u), fwd = c[1] === 'SC';
		var U = F[fi].U; root = farW[0] - U.legF.p[3][0];
		var a = fwd ? nearS : nearC, b = fwd ? nearC : nearS, lift = 0.035 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.15) / 0.7)));
		var e2 = dcEase(Math.min(1, Math.max(0, (u - 0.15) / 0.7)));
		feet = [[a[0] + (b[0] - a[0]) * e2, -lift], farW];
	} else {
		fi = frameOf(c[1], u); root = rootC; feet = [nearC, farW];
		dy = c[1] === 'CL' ? DC_DIP * (1 - u) * (1 - u) - DC_LIFT * Math.sin(u * Math.PI / 2) : -DC_LIFT * Math.cos(u * Math.PI / 2) + DC_DIP * u * u;
	}
	return { fi: fi, root: root, dy: dy, feet: feet, air: Math.max(0, Math.min(1, (-dy - 0.03) / 0.06)) };
}
/* draw one bird of the dance in its own frame (feet at the origin's
 * ground line, facing +x): live shadow and legs, then the body frame,
 * either pre-drawn (img, its box) or painted now */
function dcDraw(g, F, st, lx, ly, img, box) {
	var U = F[st.fi].U, nI = dcLegInfo(U, 'legN'), fI = dcLegInfo(U, 'legF');
	var mid = (st.feet[0][0] + st.feet[1][0]) / 2;
	dc3Shadow(g, mid, Math.abs(st.feet[0][0] - st.feet[1][0]), -st.dy);
	function leg(I, foot, far) {
		var hip = [st.root + I.hip[0], I.hip[1] + st.dy];
		var hang = [hip[0] + (I.foot[0] - I.hip[0]), hip[1] + (I.foot[1] - I.hip[1])];
		var tg = [foot[0] + (hang[0] - foot[0]) * st.air, foot[1] + (hang[1] - foot[1]) * st.air];
		dc3Leg(g, hip, tg, I.Lt, I.Ls, I.w[0], I.w[1], I.frac, far, lx, ly, st.air + Math.max(0, -foot[1]) * 20);
	}
	leg(fI, st.feet[1], 1); leg(nI, st.feet[0], 0);
	if (img) { g.drawImage(img, st.root + box[0], st.dy + box[1], box[2] - box[0], box[3] - box[1]); }
	else { g.save(); g.translate(st.root, st.dy); var V = {}; for (var k in U) { V[k] = U[k]; } V.noLegs = 1; dc3Paint(g, V, lx, ly); g.restore(); }
}
`;
module.exports.DANCE_SRC = DANCE_SRC;
