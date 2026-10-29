'use strict';
/**
 * DCC Seasons — the Anniversary's sandhill crane, REDRAWN to the Art
 * Standards (CLAUDE.md, 2026-10-29) after Rob's "body parts obviously
 * separate… like some Picasso painting".
 *
 * Order of work, as the standard sets it:
 *  1. reference: three PD photographs (cr5 standing and calling, cr6 the
 *     leap), landmarks noted in tools/data/anniv-crane-trace.json;
 *  2-3. ONE continuous outline per pose, traced by hand on the photo at
 *     4-8x zoom (`out`): bill, head, neck, body, the open wings and the
 *     feathered thighs are one path. Legs start INSIDE the body and the
 *     belly feathers are painted over their tops;
 *  4. construction inside that outline only (everything below is clipped
 *     to it): the folded wing over the body, coverts over the flight
 *     feathers, the bustle over the tail, each casting a soft shadow on
 *     what it overlaps;
 *  5. one light, from the home-page hero (soft overcast from above and a
 *     little from the right, cool shade): form shadow wrapped in from the
 *     edges that face away from it, a rim on those edges, occlusion where
 *     parts meet, a contact shadow on the ground;
 *  6. color sampled from the photographs (crane gray, rust staining), no
 *     pure black or white, warm light and cool shade;
 *  7. detail last: separate flight feathers with dark tips, covert rows,
 *     the bustle's plumes, the red crown, the white cheek.
 *
 * dc2Paint(g, pose, lx, ly) paints in the photo's own pixels; the caller
 * sets the transform (and so the size and facing) and passes the light
 * direction in those local units. Pre-rendered once per pose and facing.
 *
 *   node tools/anniv-crane2.js --pose=stand|call|leap [--out=file.png]
 */
const fs = require('fs');
const path = require('path');

const TRACE = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'anniv-crane-trace.json'), 'utf8'));

const DC2_SRC = String.raw`
var C2 = { base: '#95989C', lit: 'rgba(214,215,212,', shade: 'rgba(58,66,80,', rim: 'rgba(226,230,232,',
	back: '#8F8B86', back2: '#77736F', cov: '#958E87', cov2: '#7E7770', fl: '#5E5550', fl2: '#463F3B', tip: '#2A2523',
	plume: '#8A8580', plume2: '#6F6A66', cheek: '#E9E8E3', crown: '#B8323A', crown2: '#7E1C25', bill: '#45474B',
	leg: '#404247', leg2: '#33353A', eye: '#C9681E', rust: 'rgba(168,112,68,', ao: 'rgba(40,46,58,' };
function c2Len(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1]; return Math.sqrt(dx * dx + dy * dy); }
function c2Mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
/* a path through the points: smooth where the outline bends gently,
 * sharp where it turns hard (the bill's tip, a finger's tip, a notch) */
function c2Path(g, P, open) {
	var n = P.length, i, c = [];
	for (i = 0; i < n; i++) {
		var a = P[(i - 1 + n) % n], b = P[i], d = P[(i + 1) % n];
		var a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(d[1] - b[1], d[0] - b[0]), t = Math.abs(a2 - a1);
		if (t > Math.PI) { t = 2 * Math.PI - t; }
		c.push(t > 1.05 || (open && (i === 0 || i === n - 1)));
	}
	if (open) {
		g.moveTo(P[0][0], P[0][1]);
		for (i = 1; i < n - 1; i++) { var m = c2Mid(P[i], P[i + 1]); if (c[i]) { g.lineTo(P[i][0], P[i][1]); g.lineTo(m[0], m[1]); } else { g.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); } }
		g.lineTo(P[n - 1][0], P[n - 1][1]);
		return;
	}
	/* convex corners (a feather's tip, the bill's) are rounded a little;
	 * concave ones (the notches between primaries) stay sharp */
	var ar = 0; for (i = 0; i < n; i++) { ar += P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1]; }
	var s = c2Mid(P[n - 1], P[0]);
	g.moveTo(s[0], s[1]);
	for (i = 0; i < n; i++) {
		var q = P[i], nx2 = P[(i + 1) % n], pv = P[(i - 1 + n) % n], m2 = c2Mid(q, nx2);
		if (c[i]) {
			var cr = (q[0] - pv[0]) * (nx2[1] - q[1]) - (q[1] - pv[1]) * (nx2[0] - q[0]);
			if (cr * ar > 0) {
				/* the arc's tangent run is r / tan(half the inside angle): keep it a
				 * small share of the shorter side, so a bill's sharp tip stays sharp */
				var ia = Math.PI - Math.acos(Math.max(-1, Math.min(1, ((q[0] - pv[0]) * (nx2[0] - q[0]) + (q[1] - pv[1]) * (nx2[1] - q[1])) / ((c2Len(pv, q) * c2Len(q, nx2)) || 1))));
				g.arcTo(q[0], q[1], m2[0], m2[1], Math.min(2.6, Math.tan(ia / 2) * 0.1 * Math.min(c2Len(pv, q), c2Len(q, nx2)))); g.lineTo(m2[0], m2[1]);
			}
			else { g.lineTo(q[0], q[1]); g.lineTo(m2[0], m2[1]); }
		} else { g.quadraticCurveTo(q[0], q[1], m2[0], m2[1]); }
	}
	g.closePath();
}
/* along a polyline by fraction of its length */
function c2At(P, t) {
	var L = 0, i, s = [0];
	for (i = 1; i < P.length; i++) { L += c2Len(P[i - 1], P[i]); s.push(L); }
	var d = Math.max(0, Math.min(1, t)) * L;
	for (i = 1; i < P.length; i++) { if (s[i] >= d) { var u = (d - s[i - 1]) / ((s[i] - s[i - 1]) || 1); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; } }
	return P[P.length - 1].slice();
}
function c2Bounds(P) { var b = [1e9, 1e9, -1e9, -1e9]; P.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); return b; }
/* a soft-edged fill: the shape far off the canvas, its blurred shadow
 * thrown back onto it (shadowBlur works everywhere; ctx.filter does not) */
function c2K(g) { var m = g.getTransform(); return Math.sqrt(m.a * m.a + m.b * m.b); }
/* shadow settings are in DEVICE pixels, whatever the transform: convert */
function c2Shadow(g, color, blur, ox, oy) {
	var m = g.getTransform(), k = Math.sqrt(m.a * m.a + m.b * m.b);
	g.shadowColor = color; g.shadowBlur = blur * k; g.shadowOffsetX = (ox || 0) * m.a + (oy || 0) * m.c; g.shadowOffsetY = (ox || 0) * m.b + (oy || 0) * m.d;
}
function c2Soft(g, fn, color, blur, ox, oy, eo) {
	var m = g.getTransform(), T = 2e4 / (Math.abs(m.a) || 1);
	g.save(); c2Shadow(g, color, blur, (ox || 0) + T, oy);
	g.translate(-T, 0); g.beginPath(); fn(); g.fillStyle = '#000'; eo ? g.fill('evenodd') : g.fill(); g.restore();
}
/* shade wrapped in from every edge that faces one way: the region OUTSIDE
 * the outline, moved by (vx, vy), casts a soft shadow just inside */
function c2Wrap(g, P, vx, vy, color, blur) {
	var b = c2Bounds(P);
	c2SoftEvenOdd(g, function () { g.rect(b[0] - 400, b[1] - 400, b[2] - b[0] + 800, b[3] - b[1] + 800); c2Path(g, P); }, color, blur, vx, vy);
}
function c2SoftEvenOdd(g, fn, color, blur, ox, oy) { c2Soft(g, fn, color, blur, ox, oy, 1); }
/* one flight feather from its base b to its tip t: a long blade, lit vane
 * toward the light, a pale shaft, darkening to the tip */
function c2Feather(g, b, t, w, lx, ly, cols, far) {
	var dx = t[0] - b[0], dy = t[1] - b[1], d = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
	var m = [b[0] + dx * 0.55, b[1] + dy * 0.55];
	var gr = g.createLinearGradient(b[0], b[1], t[0], t[1]);
	gr.addColorStop(0, cols[0]); gr.addColorStop(0.6, cols[1]); gr.addColorStop(1, cols[2]);
	g.fillStyle = gr;
	g.beginPath();
	g.moveTo(b[0] + nx * w * 0.42, b[1] + ny * w * 0.42);
	g.quadraticCurveTo(m[0] + nx * w * 0.55, m[1] + ny * w * 0.55, t[0] + nx * w * 0.12 - dx / d * w * 0.3, t[1] + ny * w * 0.12 - dy / d * w * 0.3);
	g.quadraticCurveTo(t[0] + dx / d * w * 0.05, t[1] + dy / d * w * 0.05, t[0] - nx * w * 0.12 - dx / d * w * 0.3, t[1] - ny * w * 0.12 - dy / d * w * 0.3);
	g.quadraticCurveTo(m[0] - nx * w * 0.55, m[1] - ny * w * 0.55, b[0] - nx * w * 0.42, b[1] - ny * w * 0.42);
	g.closePath(); g.fill();
	if (far) { return; }
	/* the vane edge that faces the light catches it; the other is in shade */
	var lit = (nx * lx + ny * ly) < 0 ? 1 : -1;
	g.strokeStyle = 'rgba(196,192,186,.13)'; g.lineWidth = w * 0.06;
	g.beginPath(); g.moveTo(b[0] + lit * nx * w * 0.36 + dx * 0.15, b[1] + lit * ny * w * 0.36 + dy * 0.15);
	g.quadraticCurveTo(m[0] + lit * nx * w * 0.5, m[1] + lit * ny * w * 0.5, t[0] + lit * nx * w * 0.1 - dx / d * w * 0.6, t[1] + lit * ny * w * 0.1 - dy / d * w * 0.6); g.stroke();
	g.strokeStyle = 'rgba(30,30,34,.28)'; g.lineWidth = w * 0.12;
	g.beginPath(); g.moveTo(b[0] - lit * nx * w * 0.36 + dx * 0.1, b[1] - lit * ny * w * 0.36 + dy * 0.1);
	g.quadraticCurveTo(m[0] - lit * nx * w * 0.5, m[1] - lit * ny * w * 0.5, t[0] - lit * nx * w * 0.1 - dx / d * w * 0.6, t[1] - lit * ny * w * 0.1 - dy / d * w * 0.6); g.stroke();
	g.strokeStyle = 'rgba(170,166,160,.12)'; g.lineWidth = w * 0.035;
	g.beginPath(); g.moveTo(b[0] + dx * 0.1, b[1] + dy * 0.1); g.quadraticCurveTo(m[0], m[1], b[0] + dx * 0.9, b[1] + dy * 0.9); g.stroke();
}
/* an open wing: the coverts' ground, the flight feathers fanned from the
 * base line to the outline's own tips (secondaries first, the hand's
 * primaries over them), then the covert rows lying over the feathers'
 * bases, the whole wing throwing a soft shadow on the body under it */
function c2Wing(g, P, W, lx, ly, S) {
	var O = P.out, i, n, tips = [];
	W.tips.fingers.forEach(function (k) { tips.push(O[k]); });
	var e0 = W.tips.edge[0], e1 = W.tips.edge[1], seg = O.slice(Math.min(e0, e1), Math.max(e0, e1) + 1);
	if (e0 > e1) { seg.reverse(); }
	for (i = 1; i <= W.tips.n; i++) { tips.push(c2At(seg, i / W.tips.n)); }
	/* the wing's own region: leading edge, tips, inner edge back to the shoulder */
	var w0 = W.lead[W.lead.length - 1], wi = 0, wd = 1e9;
	O.forEach(function (q, k) { var dd = c2Len(q, w0); if (dd < wd) { wd = dd; wi = k; } });
	var R = W.lead.concat(O.slice(wi + 1, e1 + 1)).concat(W.inner.slice(1));
	/* its cast shadow and occlusion on the body below it */
	c2Soft(g, function () { c2Path(g, R); }, C2.ao + (W.far ? '.30)' : '.55)'), S * 0.03, -lx * S * 0.012, -ly * S * 0.012);
	g.save();
	g.beginPath(); c2Path(g, R); g.clip();
	var bb = c2Bounds(R);
	var gr = g.createLinearGradient(W.lead[0][0], W.lead[0][1], tips[tips.length - 1][0], tips[tips.length - 1][1]);
	gr.addColorStop(0, W.far ? '#ABA9A6' : C2.cov); gr.addColorStop(1, W.far ? '#8B8783' : C2.cov2);
	g.fillStyle = gr; g.fillRect(bb[0] - 5, bb[1] - 5, bb[2] - bb[0] + 10, bb[3] - bb[1] + 10);
	/* the feathers, proximal first so the hand's lie over the arm's */
	var B = W.base, Bs = W.base.slice().reverse();   /* base runs wrist -> shoulder */
	n = tips.length;
	var cols = W.far ? ['#958F8A', '#77716C', '#45403D'] : [C2.fl, C2.fl2, C2.tip];
	for (i = n - 1; i >= 0; i--) {
		var t = tips[i], b = c2At(B, i / (n - 1));
		var wq = Math.max(c2Len(tips[Math.max(0, i - 1)], tips[Math.min(n - 1, i + 1)]) * 1.15, S * 0.032);
		var fl = i < W.tips.fingers.length;
		c2Feather(g, b, t, fl ? wq * 0.8 : wq * 1.05, lx, ly, cols, W.far);
	}
	/* the coverts over the feathers' bases: shingled rows from the leading
	 * edge back to the base line, each a soft rounded feather end with a
	 * faint pale fringe, so the rows read as texture, never as chips */
	for (var r = 0; r < 4; r++) {
		var f = 0.18 + r * 0.24, row = [], k;
		for (k = 0; k <= 12; k++) { var a1 = c2At(W.lead, k / 12), b1 = c2At(Bs, k / 12); row.push([a1[0] + (b1[0] - a1[0]) * f, a1[1] + (b1[1] - a1[1]) * f]); }
		var rl = 0; for (k = 1; k <= 12; k++) { rl += c2Len(row[k - 1], row[k]); }
		var sz = S * (0.026 + r * 0.007) * (0.9 + 0.2 * Math.abs(Math.sin(r * 5.3))), cnt = Math.max(4, Math.round(rl / (sz * 0.9)));
		for (k = 0; k < cnt; k++) {
			var u = (k + 0.5 + (r % 2) * 0.5) / (cnt + 0.5), p0 = c2At(row, u), ref = c2At(Bs, u), lead = c2At(W.lead, u);
			var ax = ref[0] - lead[0], ay = ref[1] - lead[1], al = Math.sqrt(ax * ax + ay * ay) || 1;
			g.save(); g.translate(p0[0], p0[1]); g.rotate(Math.atan2(ay, ax));
			var tone = W.far ? [168, 166, 164] : (r < 2 ? [150, 144, 138] : [128, 120, 114]);
			c2Soft(g, function () { g.moveTo(-sz * 0.6, -sz * 0.5); g.quadraticCurveTo(sz * 0.9, -sz * 0.62, sz * 0.85, 0); g.quadraticCurveTo(sz * 0.9, sz * 0.62, -sz * 0.6, sz * 0.5); g.closePath(); },
				'rgba(' + tone.join(',') + ',.85)', sz * 0.18, 0, 0);
			g.strokeStyle = W.far ? 'rgba(214,212,208,.16)' : 'rgba(196,190,182,.16)'; g.lineWidth = sz * 0.06;
			g.beginPath(); g.moveTo(sz * 0.2, -sz * 0.5); g.quadraticCurveTo(sz * 0.88, -sz * 0.4, sz * 0.86, 0); g.quadraticCurveTo(sz * 0.88, sz * 0.4, sz * 0.2, sz * 0.5); g.stroke();
			g.strokeStyle = C2.ao + '.12)'; g.lineWidth = sz * 0.08;
			g.beginPath(); g.moveTo(sz * 0.95, -sz * 0.3); g.quadraticCurveTo(sz * 1.05, 0, sz * 0.95, sz * 0.3); g.stroke();
			g.restore();
		}
	}
	/* the lesser coverts along the leading edge: pale, the lit margin */
	g.strokeStyle = W.far ? 'rgba(200,200,198,.35)' : 'rgba(214,212,208,.45)'; g.lineWidth = S * 0.012; g.lineCap = 'round';
	g.beginPath(); c2Path(g, W.lead, true); g.stroke();
	/* the wing's rust staining, on the coverts, as the photographs show */
	var rc = c2At(W.lead, 0.45), rb = c2At(Bs, 0.45), rp = [rc[0] + (rb[0] - rc[0]) * 0.45, rc[1] + (rb[1] - rc[1]) * 0.45];
	c2Soft(g, function () { g.ellipse(rp[0], rp[1], c2Len(W.lead[0], W.lead[W.lead.length - 1]) * 0.32, c2Len(rc, rb) * 0.3, Math.atan2(W.lead[W.lead.length - 1][1] - W.lead[0][1], W.lead[W.lead.length - 1][0] - W.lead[0][0]), 0, Math.PI * 2); }, C2.rust + (W.far ? '.22)' : '.4)'), S * 0.03);
	g.restore();
}
/* a leg: tibia from inside the belly to the ankle (the joint that bends
 * backward), tarsus to the foot, toes flat on the ground; one tapered
 * shape, no knobs */
function c2Leg(g, L, lx, ly, S) {
	var p = L.p, w0 = L.w[0], w1 = L.w[1];
	g.lineCap = 'round'; g.lineJoin = 'round';
	g.strokeStyle = L.far ? C2.leg2 : C2.leg;
	for (var i = 0; i < p.length - 1; i++) {
		var wa = i < p.length - 2 ? w0 : w1;
		g.lineWidth = wa; g.beginPath(); g.moveTo(p[i][0], p[i][1]); g.lineTo(p[i + 1][0], p[i + 1][1]); g.stroke();
	}
	/* the joint is a gentle thickening, never a ball */
	var j = p[p.length - 2];
	g.lineWidth = w0 * 1.2; g.beginPath(); g.moveTo(j[0], j[1] - 0.01); g.lineTo(j[0], j[1] + 0.01); g.stroke();
	var f = p[p.length - 1];
	g.lineWidth = w1 * 0.72;
	L.toes.forEach(function (t) { g.beginPath(); g.moveTo(f[0], f[1]); g.quadraticCurveTo((f[0] + t[0]) / 2, Math.max(f[1], t[1]) + 0.5, t[0], t[1]); g.stroke(); });
	if (!L.far) {   /* the lit edge of the bare leg */
		g.strokeStyle = 'rgba(150,154,160,.55)'; g.lineWidth = w1 * 0.35;
		for (var k = 1; k < p.length - 1; k++) {
			var a = p[k], b = p[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
			if (nx * lx + ny * ly > 0) { nx = -nx; ny = -ny; }
			var o = (k < p.length - 2 ? w0 : w1) * 0.3;
			g.beginPath(); g.moveTo(a[0] + nx * o, a[1] + ny * o); g.lineTo(b[0] + nx * o, b[1] + ny * o); g.stroke();
		}
	}
}
/* a soft plume (a bustle tertial, a scapular): a curved shaft arching out
 * then drooping, a soft mass under it and loose barbs either side that
 * fray at the tip, so it never reads as a paddle */
function c2Plume(g, a, z, w, lx, ly, S, q, amt) {
	var dx = z[0] - a[0], dy = z[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
	var bow = (q % 2 ? 0.14 : 0.2) * d, c = [a[0] + dx * 0.45 - lx * bow, a[1] + dy * 0.45 - ly * bow];
	function at(t) { var u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * z[0], u * u * a[1] + 2 * u * t * c[1] + t * t * z[1]]; }
	c2Soft(g, function () { g.moveTo(a[0] + nx * w * 0.4, a[1] + ny * w * 0.4); g.quadraticCurveTo(c[0] + nx * w, c[1] + ny * w, z[0], z[1]); g.quadraticCurveTo(c[0] - nx * w, c[1] - ny * w, a[0] - nx * w * 0.4, a[1] - ny * w * 0.4); g.closePath(); },
		'rgba(' + (q % 2 ? '86,82,80' : '100,95,91') + ',' + (0.92 * amt) + ')', w * 0.5, -lx * w * 0.25, -ly * w * 0.25);
	g.lineCap = 'round';
	for (var i = 3; i < 13; i++) {
		var t = (i + 0.37 * Math.sin(q * 7.1 + i * 3.3)) / 13, p = at(t), p2 = at(Math.min(1, t + 0.06)), tx = p2[0] - p[0], ty = p2[1] - p[1], tl = Math.sqrt(tx * tx + ty * ty) || 1;
		tx /= tl; ty /= tl;
		var bl = w * (0.5 + 0.9 * Math.sin(t * Math.PI * 0.95)), sp = 0.55 + 0.25 * t;
		for (var sd = -1; sd <= 1; sd += 2) {
			var bx = -ty * sd, by = tx * sd, lit = (bx * lx + by * ly) > 0;
			g.strokeStyle = lit ? 'rgba(196,192,186,' + (0.16 * amt) + ')' : 'rgba(64,62,64,' + (0.16 * amt) + ')';
			g.lineWidth = S * 0.0035;
			g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + bx * bl * 0.6 + tx * bl * 0.2, p[1] + by * bl * 0.6 + ty * bl * 0.2, p[0] + bx * bl * sp + tx * bl * 0.8, p[1] + by * bl * sp + ty * bl * 0.8); g.stroke();
		}
	}
	g.strokeStyle = 'rgba(190,188,182,' + (0.4 * amt) + ')'; g.lineWidth = S * 0.0035;
	g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], z[0], z[1]); g.stroke();
}
/* the primaries as blades: each traced finger (notch, tip, notch) gets
 * two shoulder points so its sides run nearly parallel to a rounded tip,
 * the way separated primaries look, instead of a triangle. Indices into
 * the outline (wing tips) are remapped. Done once per pose. */
function c2Prep(P) {
	if (P._o) { return P; }
	var O = P.out, tipSet = {}, i;
	(P.wings || []).forEach(function (W) { W.tips.fingers.forEach(function (k) { tipSet[k] = 1; }); });
	var o2 = [], map = [];
	for (i = 0; i < O.length; i++) {
		if (tipSet[i]) {
			var T = O[i], NL = O[i - 1], NR = O[i + 1], M = c2Mid(NL, NR), dx = T[0] - M[0], dy = T[1] - M[1], dl = Math.sqrt(dx * dx + dy * dy) || 1;
			var ux = dx / dl, uy = dy / dl, px = -uy, py = ux, hw = Math.min(c2Len(NL, NR) * 0.3, dl * 0.16);
			if ((NL[0] - T[0]) * px + (NL[1] - T[1]) * py < 0) { px = -px; py = -py; }
			o2.push([T[0] - ux * dl * 0.5 + px * hw, T[1] - uy * dl * 0.5 + py * hw]);
			map[i] = o2.length; o2.push(T);
			o2.push([T[0] - ux * dl * 0.5 - px * hw, T[1] - uy * dl * 0.5 - py * hw]);
		} else { map[i] = o2.length; o2.push(O[i]); }
	}
	var Q = {}; for (var k in P) { Q[k] = P[k]; }
	Q.out = o2; Q._o = 1;
	Q.wings = (P.wings || []).map(function (W) { var V = {}; for (var k2 in W) { V[k2] = W[k2]; }
		V.tips = { fingers: W.tips.fingers.map(function (f) { return map[f]; }), edge: [map[W.tips.edge[0]], map[W.tips.edge[1]]], n: W.tips.n }; return V; });
	return Q;
}
/* The bird. P is one pose of tools/data/anniv-crane-trace.json, in its
 * photo's pixels; (lx, ly) is the direction the light comes FROM in those
 * pixels (unit). */
function dc2Paint(g, P, lx, ly) {
	P = c2Prep(P);
	var O = P.out, S = P.ref.H, gy = P.ref.ground[1];
	var bx = c2Bounds(O);
	/* the contact shadow on the ground, under the feet and the body */
	var feet = P.legs.map(function (L) { return L.p[L.p.length - 1]; });
	var fx0 = Math.min.apply(null, feet.map(function (f) { return f[0]; })), fx1 = Math.max.apply(null, feet.map(function (f) { return f[0]; }));
	c2Soft(g, function () { g.ellipse((fx0 + fx1) / 2, gy + S * 0.004, (fx1 - fx0) / 2 + S * 0.07, S * 0.018, 0, 0, Math.PI * 2); }, 'rgba(24,32,30,.42)', S * 0.02);
	/* the legs, behind: their tops go up under the belly feathers */
	P.legs.filter(function (L) { return L.far; }).forEach(function (L) { c2Leg(g, L, lx, ly, S); });
	P.legs.filter(function (L) { return !L.far; }).forEach(function (L) { c2Leg(g, L, lx, ly, S); });
	/* the ONE outline, filled; everything after this stays inside it */
	g.fillStyle = C2.base; g.beginPath(); c2Path(g, O); g.fill();
	g.save(); g.beginPath(); c2Path(g, O); g.clip();
	/* the overall value: lit from above, the underside in cool shade */
	var lg = g.createLinearGradient(bx[0] + (bx[2] - bx[0]) * (0.5 + lx * 0.3), bx[1] + (bx[3] - bx[1]) * (0.5 + ly * 0.5), bx[0] + (bx[2] - bx[0]) * (0.5 - lx * 0.3), bx[1] + (bx[3] - bx[1]) * (0.5 - ly * 0.5));
	lg.addColorStop(0, 'rgba(226,226,220,.30)'); lg.addColorStop(0.5, 'rgba(160,164,168,0)'); lg.addColorStop(1, 'rgba(70,78,92,.32)');
	g.fillStyle = lg; g.fillRect(bx[0] - 10, bx[1] - 10, bx[2] - bx[0] + 20, bx[3] - bx[1] + 20);
	/* the rust staining, soft, where the photographs show it */
	(P.rust || []).forEach(function (r) { c2Soft(g, function () { g.arc(r[0], r[1], r[2], 0, Math.PI * 2); }, C2.rust + r[3] + ')', r[2] * 0.9); });
	/* the folded wing and back over the body: darker, warm gray, casting
	 * occlusion on the breast below its edge */
	if (P.back) {
		/* the folded wing over the body: a soft-edged darker mass (its
		 * lower edge is found against the light breast, lost toward the
		 * back), its occlusion on the breast below it, rust in its coverts */
		c2Soft(g, function () { c2Path(g, P.back); }, C2.ao + '.42)', S * 0.03, -lx * S * 0.012, -ly * S * 0.014);
		c2Soft(g, function () { c2Path(g, P.back); }, 'rgba(104,96,88,.95)', S * 0.01);
		var b2 = c2Bounds(P.back);
		g.save(); g.beginPath(); c2Path(g, P.back); g.clip();
		var bgr = g.createLinearGradient(b2[0], b2[1], b2[2], b2[3]);
		bgr.addColorStop(0, 'rgba(150,146,140,.5)'); bgr.addColorStop(0.6, 'rgba(110,104,98,.25)'); bgr.addColorStop(1, 'rgba(84,80,78,.55)');
		g.fillStyle = bgr; g.fillRect(b2[0] - 5, b2[1] - 5, b2[2] - b2[0] + 10, b2[3] - b2[1] + 10);
		c2Soft(g, function () { g.ellipse(b2[0] + (b2[2] - b2[0]) * 0.5, b2[1] + (b2[3] - b2[1]) * 0.55, S * 0.07, S * 0.035, 0.7, 0, Math.PI * 2); }, C2.rust + '.5)', S * 0.04);
		g.restore();
		/* the scapulars and tertials lying back along it: long, soft plumes */
		(P.scaps || []).forEach(function (q, i) { c2Plume(g, q[0], q[1], S * 0.022, lx, ly, S, i, 0.75); });
	}
	/* the open wings, far first */
	(P.wings || []).forEach(function (W) { c2Wing(g, P, W, lx, ly, S); });
	/* the bustle (or the hanging tertials): drooping plumes, each its own
	 * feather, over the tail */
	if (P.plumes) {
		var pb = P.plumes.base, pt = P.plumes.tips;
		for (var q = 0; q < pb.length; q++) { c2Plume(g, pb[q], pt[Math.min(q, pt.length - 1)], S * (0.03 + 0.006 * (q % 3)), lx, ly, S, q, 1); }
	}
	/* form: shade wrapped in from the edges that face away from the light,
	 * a little warm light on the edges that face it, and the rim */
	c2Wrap(g, O, lx * S * 0.022, ly * S * 0.022, C2.shade + '.62)', S * 0.04);
	c2Wrap(g, O, -lx * S * 0.012, -ly * S * 0.012, C2.lit + '.38)', S * 0.02);
	c2Wrap(g, O, lx * S * 0.004, ly * S * 0.004, C2.rim + '.35)', S * 0.005);
	/* a found edge where the form turns away from the light, lost where it faces it */
	c2Wrap(g, O, lx * S * 0.0035, ly * S * 0.0035, C2.shade + '.7)', S * 0.0025);
	/* the head: the white cheek, the bare red crown, the eye, the bill */
	c2Soft(g, function () { c2Path(g, P.cheek); }, 'rgba(233,232,227,.95)', S * 0.004);
	var cr = c2Bounds(P.crown), crg = g.createLinearGradient(cr[0], cr[1], cr[0], cr[3]);
	crg.addColorStop(0, '#C9414A'); crg.addColorStop(1, C2.crown2);
	g.fillStyle = crg; g.beginPath(); c2Path(g, P.crown); g.fill();
	g.fillStyle = 'rgba(255,200,190,.25)'; g.beginPath(); g.ellipse((cr[0] + cr[2]) / 2 + lx * 2, cr[1] + 1.5, (cr[2] - cr[0]) * 0.28, (cr[3] - cr[1]) * 0.25, 0, 0, Math.PI * 2); g.fill();
	g.restore();
	P.bill.forEach(function (B) {
		var bb = c2Bounds(B), bgr2 = g.createLinearGradient(bb[0], bb[1], bb[0], bb[3]);
		bgr2.addColorStop(0, '#5C5E62'); bgr2.addColorStop(1, '#36383B');
		g.fillStyle = bgr2; g.beginPath(); c2Path(g, B); g.fill();
	});
	var e = P.eye;
	g.fillStyle = C2.eye; g.beginPath(); g.arc(e[0], e[1], e[2], 0, Math.PI * 2); g.fill();
	g.fillStyle = '#1E1C1B'; g.beginPath(); g.arc(e[0], e[1], e[2] * 0.45, 0, Math.PI * 2); g.fill();
}
`;

module.exports = { DC2_SRC, TRACE };

if (require.main === module) {
  const { chromium } = require('playwright');
  const refs = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
  const only = (process.argv.find(a => a.startsWith('--pose=')) || '').slice(7);
  const out = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6) || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/c2.png';
  (async () => {
    const b = await chromium.launch();
    const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const items = Object.keys(TRACE).filter(k => k[0] !== '_' && (!only || k === only)).map(k => ({ k, P: TRACE[k], img: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(refs, TRACE[k].ref.f)).toString('base64') }));
    await pg.setContent(`<body style="margin:0;background:#FBF6EC"><div id=w style="display:flex;flex-wrap:wrap;gap:8px;padding:8px"></div><script>${DC2_SRC}
      window.run = async (items) => { for (const it of items) { const im = new Image(); im.src = it.img; await im.decode();
        const [cx, cy, cw, ch] = it.P.ref.crop, Sc = window.SC || Math.min(1.3, 800 / ch);
        for (const mode of (window.MODES || ['photo', 'overlay', 'drawing'])) {
          const c = document.createElement('canvas'); c.width = cw * Sc * 2; c.height = ch * Sc * 2; c.style.width = cw * Sc + 'px';
          const g = c.getContext('2d'); g.scale(2 * Sc, 2 * Sc); g.translate(-cx, -cy);
          if (mode !== 'drawing') { g.drawImage(im, 0, 0); } else { g.fillStyle = '#4E5A4E'; g.fillRect(cx, cy, cw, ch); }
          if (mode !== 'photo') { g.save(); g.globalAlpha = mode === 'overlay' ? 0.5 : 1;
            /* the hero's light: from above, a little from the right of the SCREEN; in the photo's frame */
            dc2Paint(g, it.P, 0.30 * (it.P.ref.face > 0 ? 1 : 1), -0.95); g.restore(); }
          w.appendChild(c); } } };</script>`);
    const SC = +((process.argv.find(a => a.startsWith('--scale=')) || '').slice(8)) || 0;
    const MODES = (process.argv.find(a => a.startsWith('--modes=')) || '').slice(8);
    await pg.evaluate(([sc, md]) => { if (sc) { window.SC = sc; } if (md) { window.MODES = md.split(','); } }, [SC, MODES]);
    await pg.evaluate(it => window.run(it), items);
    await pg.screenshot({ path: out, fullPage: true });
    await b.close();
    console.log(out);
  })();
}
