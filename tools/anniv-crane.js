'use strict';
/**
 * DCC Seasons — the Anniversary's dancing sandhill crane, drawn from
 * photographs (Rob's method, 2026-10-25): every pose is fitted over a
 * public-domain photograph at 50% and fixed where the overlay shows a
 * fault, and the sheet shows the overlay beside the drawing.
 *
 *   node tools/anniv-crane.js [--refs=DIR]
 *
 * DC_SRC is the painter as it would go into engine.js: a rig of body,
 * neck, head, two legs and two wings, each wing a leading edge from
 * shoulder to wrist to tip, separate primaries splayed from the hand
 * and a scalloped row of secondaries.
 */
const fs = require('fs');
const path = require('path');

const DC_SRC = String.raw`
var DC = { body: '#A9AAAE', body2: '#6E7586', belly: '#DCD8D1', cheek: '#F4F2EC', neck: '#B9BBBD',
	crown: '#D0242E', bill: '#3A3B3D', leg: '#2E2F32', prim: '#3B322E', prim2: '#4D4340', sec: '#5A504B',
	cov: '#B4AFAA', cov2: '#8E8884', bust: '#7D8594', bust2: '#5C6577', rust: '#B0743E' };
function dcLerp(a, b, t) { return a + (b - a) * t; }
/* a filled strip of varying width along a cubic, so the neck tapers */
function dcTube(g, p0, c1, c2, p1, w0, w1, n) {
	var L = [], R = [], i, t, u, x, y, dx, dy, d, w;
	for (i = 0; i <= n; i++) {
		t = i / n; u = 1 - t;
		x = u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p1[0];
		y = u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p1[1];
		dx = 3*u*u*(c1[0]-p0[0]) + 6*u*t*(c2[0]-c1[0]) + 3*t*t*(p1[0]-c2[0]);
		dy = 3*u*u*(c1[1]-p0[1]) + 6*u*t*(c2[1]-c1[1]) + 3*t*t*(p1[1]-c2[1]);
		d = Math.sqrt(dx*dx + dy*dy) || 1; w = dcLerp(w0, w1, t) / 2;
		L.push([x - dy/d*w, y + dx/d*w]); R.push([x + dy/d*w, y - dx/d*w]);
	}
	g.beginPath(); g.moveTo(L[0][0], L[0][1]);
	for (i = 1; i <= n; i++) { g.lineTo(L[i][0], L[i][1]); }
	for (i = n; i >= 0; i--) { g.lineTo(R[i][0], R[i][1]); }
	g.closePath(); g.fill();
}
/* 4.13.4 detail pass (the Director, 2026-10-30): the surface of the bird,
 * fitted to the same three photographs. A deterministic jitter, so every
 * pre-drawn pose is the same bird. */
function dcH(i) { var x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); }
/* rows of contour feathers seen from the side: each a rounded tip pointing
 * back along 'ang', a shade darker than the ground, its pale fringe drawn
 * as a narrow crescent; rows overlap like shingles. Placed in the frame
 * (o, ang); callers clip to the region they cover. */
function dcRows(g, o, ang, len, wid, rows, per, sz, fill, edge, seed) {
	var ca = Math.cos(ang), sa = Math.sin(ang), r, k;
	for (r = 0; r < rows; r++) {
		for (k = 0; k < per; k++) {
			var j = dcH(seed + r * 31 + k * 7), j2 = dcH(seed + r * 17 + k * 13 + 5);
			var u = (k + (r % 2) * 0.5 + (j - 0.5) * 0.35) / per * len, v = ((r + 0.5) / rows - 0.5) * wid + (j2 - 0.5) * wid / rows * 0.4;
			var x = o[0] + u * ca - v * sa, y = o[1] + u * sa + v * ca, w = sz * (0.8 + 0.4 * j), h = w * 0.62;
			g.save(); g.translate(x, y); g.rotate(ang + (j2 - 0.5) * 0.3);
			g.fillStyle = fill;
			g.beginPath(); g.moveTo(-w * 0.2, -h); g.quadraticCurveTo(w * 1.05, -h * 0.9, w, 0); g.quadraticCurveTo(w * 1.05, h * 0.9, -w * 0.2, h); g.closePath(); g.fill();
			g.strokeStyle = edge; g.lineWidth = sz * 0.16;
			g.beginPath(); g.moveTo(w * 0.35, -h * 0.82); g.quadraticCurveTo(w * 1.02, -h * 0.5, w * 0.98, h * 0.1); g.stroke();
			g.restore();
		}
	}
}
/* one flight feather: a narrow blade from base to tip, curving a little */
function dcFeather(g, bx, by, tx, ty, w, bend) {
	var dx = tx - bx, dy = ty - by, d = Math.sqrt(dx*dx + dy*dy) || 1, nx = -dy/d, ny = dx/d;
	var mx = (bx + tx)/2 + nx*bend*d, my = (by + ty)/2 + ny*bend*d;
	g.beginPath();
	g.moveTo(bx + nx*w*0.5, by + ny*w*0.5);
	g.quadraticCurveTo(mx + nx*w*0.6, my + ny*w*0.6, tx, ty);
	g.quadraticCurveTo(mx - nx*w*0.6, my - ny*w*0.6, bx - nx*w*0.5, by - ny*w*0.5);
	g.closePath(); g.fill();
}
/* A wing seen open, drawn the heron's way: one smooth outline from the
 * shoulder S over the wrist W to the tip T, back along the primaries'
 * tips to E (where they meet the secondaries) and along the trailing
 * edge to the root R; the primaries as separate blades with shafts; the
 * coverts over the inner wing. 'under' is the underside a dancing bird
 * shows (dark flight feathers, pale lining); 'far' darkens it. */
function dcQ(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function dcWing(g, S, W, T, E, R, far, under, bulge) {
	var i, n = 7;
	bulge = bulge == null ? 0.06 : bulge;
	var fl = far ? '#4A423F' : (under ? '#4C423E' : '#5A504B');
	var pr = far ? '#3E3633' : (under ? '#3B322E' : '#463C38');
	/* outward normal of the leading edge, pointing away from the trailing side */
	var lx = W[0] - S[0], ly = W[1] - S[1], ll = Math.sqrt(lx*lx + ly*ly) || 1;
	var ox = ly / ll, oy = -lx / ll;
	var mid = dcQ(E, R, 0.5);
	if ((mid[0] - S[0]) * ox + (mid[1] - S[1]) * oy > 0) { ox = -ox; oy = -oy; }
	var Lc = [(S[0] + W[0]) / 2 + ox * ll * bulge * 2, (S[1] + W[1]) / 2 + oy * ll * bulge * 2];
	/* the primaries' tips lie on a curve from T round to E */
	var tx = T[0] - W[0], ty = T[1] - W[1], tl = Math.sqrt(tx*tx + ty*ty);
	var C = [(T[0] + E[0]) / 2 + (tx / tl) * tl * 0.36, (T[1] + E[1]) / 2 + (ty / tl) * tl * 0.36];
	function tipAt(q) { var u = 1 - q; return [u*u*T[0] + 2*u*q*C[0] + q*q*E[0], u*u*T[1] + 2*u*q*C[1] + q*q*E[1]]; }
	/* the whole wing, dark */
	g.fillStyle = fl;
	g.beginPath(); g.moveTo(S[0], S[1]);
	g.quadraticCurveTo(Lc[0], Lc[1], W[0], W[1]);
	g.lineTo(T[0], T[1]);
	/* the fingers: the outer primaries separate, a notch between each tip */
	for (i = 1; i < n; i++) {
		var q0 = tipAt((i - 1) / (n - 1) * 0.92), q1 = tipAt(i / (n - 1) * 0.92), qm = dcQ(q0, q1, 0.5);
		var nd = (0.42 - 0.26 * i / n) * tl;
		var vx = W[0] - qm[0], vy = W[1] - qm[1], vl = Math.sqrt(vx*vx + vy*vy) || 1;
		g.quadraticCurveTo(qm[0] + vx / vl * nd, qm[1] + vy / vl * nd, q1[0], q1[1]);
	}
	g.lineTo(E[0], E[1]);
	/* the secondaries' trailing edge, scalloped */
	var m = 7;
	for (i = 1; i <= m; i++) {
		var a0 = dcQ(E, R, (i - 1) / m), a1 = dcQ(E, R, i / m), am = dcQ(a0, a1, 0.5);
		g.quadraticCurveTo(am[0] - ox * tl * 0.035, am[1] - oy * tl * 0.035, a1[0], a1[1]);
	}
	g.closePath(); g.fill();
	/* the primaries, separate at the tip, each with a pale shaft */
	for (i = n - 1; i >= 0; i--) {
		var q = i / (n - 1) * 0.92, tp = tipAt(q);
		var bs = dcQ(dcQ(W, T, 0.18 + 0.30 * (1 - q)), E, 0.10), dx = tp[0] - bs[0], dy = tp[1] - bs[1], d = Math.sqrt(dx*dx + dy*dy) || 1;
		var px = -dy / d * tl * 0.034, py = dx / d * tl * 0.034;
		var pg = g.createLinearGradient(bs[0], bs[1], tp[0], tp[1]);   /* dark at the tip, as the photos show */
		pg.addColorStop(0, i % 2 ? pr : fl); pg.addColorStop(0.55, i % 2 ? pr : fl); pg.addColorStop(1, far ? '#2A2321' : '#1C1715');
		g.fillStyle = pg;
		g.beginPath();
		g.moveTo(bs[0] - px, bs[1] - py);
		g.quadraticCurveTo(tp[0] - px * 0.9 - dx / d * tl * 0.06, tp[1] - py * 0.9 - dy / d * tl * 0.06, tp[0], tp[1]);
		g.quadraticCurveTo(tp[0] + px * 0.9 - dx / d * tl * 0.06, tp[1] + py * 0.9 - dy / d * tl * 0.06, bs[0] + px, bs[1] + py);
		g.closePath(); g.fill();
		if (!far) {
			g.strokeStyle = under ? 'rgba(160,165,170,.55)' : 'rgba(150,155,160,.6)'; g.lineWidth = tl * 0.008;
			g.beginPath(); g.moveTo(bs[0], bs[1]); g.lineTo(dcLerp(bs[0], tp[0], 0.85), dcLerp(bs[1], tp[1], 0.85)); g.stroke();
		}
	}
	/* the secondaries: separate broad feathers from under the coverts to
	 * the scalloped trailing edge, alternately shaded, each with a pale
	 * fringe, so the inner wing is feathers and never a slab */
	var sb0 = dcQ(W, T, 0.12), sb1 = dcQ(R, S, 0.35);
	for (i = 0; i < m; i++) {
		var sq = (i + 0.5) / m, st = dcQ(E, R, sq), sbp = dcQ(dcQ(sb0, sb1, sq), st, 0.15);
		var sg = g.createLinearGradient(sbp[0], sbp[1], st[0], st[1]);
		sg.addColorStop(0, far ? '#4A423F' : (i % 2 ? '#5E5450' : '#685E59')); sg.addColorStop(1, far ? '#332C29' : (i % 2 ? '#3C3330' : '#463C38'));
		g.fillStyle = sg;
		dcFeather(g, sbp[0], sbp[1], st[0] - ox * tl * 0.02, st[1] - oy * tl * 0.02, tl * (0.15 + 0.03 * dcH(i + 70)), 0.03);
		if (!far) {
			g.strokeStyle = 'rgba(214,204,196,.42)'; g.lineWidth = tl * 0.007;
			g.beginPath(); g.moveTo(dcLerp(sbp[0], st[0], 0.45), dcLerp(sbp[1], st[1], 0.45)); g.lineTo(st[0] - ox * tl * 0.02, st[1] - oy * tl * 0.02); g.stroke();
		}
	}
	/* the coverts: the inner wing, lighter, in soft rows */
	var cT = dcQ(W, T, 0.20), cB = dcQ(dcQ(E, R, 0.18), S, under ? 0.50 : 0.38), cR = dcQ(R, S, under ? 0.45 : 0.30);
	g.beginPath(); g.moveTo(S[0], S[1]);
	g.quadraticCurveTo(Lc[0], Lc[1], W[0], W[1]);
	g.lineTo(cT[0], cT[1]);
	g.quadraticCurveTo(dcQ(cT, cB, 0.5)[0] - ox * tl * 0.05, dcQ(cT, cB, 0.5)[1] - oy * tl * 0.05, cB[0], cB[1]);
	g.quadraticCurveTo(dcQ(cB, cR, 0.5)[0] - ox * tl * 0.03, dcQ(cB, cR, 0.5)[1] - oy * tl * 0.03, cR[0], cR[1]);
	g.closePath();
	var gr = g.createLinearGradient(Lc[0], Lc[1], cB[0], cB[1]);
	if (far) { gr.addColorStop(0, '#8C8784'); gr.addColorStop(1, '#6E6966'); }
	else if (under) { gr.addColorStop(0, '#C9C5C0'); gr.addColorStop(0.35, '#A39D98'); gr.addColorStop(1, '#7A726D'); }
	else { gr.addColorStop(0, '#C4C0BB'); gr.addColorStop(0.5, '#A8A29D'); gr.addColorStop(1, '#857E79'); }
	g.fillStyle = gr; g.fill();
	if (!far) {
		/* the coverts in overlapping rows, fringed paler, lying back toward
		 * the trailing edge, with the photo's ochre wash over the inner wing */
		g.save(); g.clip();
		var wa = Math.atan2(E[1] - W[1], E[0] - W[0]), cl = Math.sqrt(Math.pow(cB[0] - S[0], 2) + Math.pow(cB[1] - S[1], 2));
		dcRows(g, dcQ(S, W, 0.1), Math.atan2(cB[1] - S[1], cB[0] - S[0]), cl * 1.1, tl * 0.9, 9, 11, tl * 0.034, under ? 'rgba(110,114,118,.2)' : 'rgba(100,106,112,.22)', under ? 'rgba(238,236,228,.4)' : 'rgba(222,222,218,.45)', 3);
		var rw = g.createRadialGradient(dcQ(S, cB, 0.55)[0], dcQ(S, cB, 0.55)[1], 0, dcQ(S, cB, 0.55)[0], dcQ(S, cB, 0.55)[1], cl * 0.7);
		rw.addColorStop(0, 'rgba(180,112,56,.40)'); rw.addColorStop(1, 'rgba(180,112,56,0)');
		g.fillStyle = rw; g.fillRect(-3, -3, 6, 6);
		g.restore();
		g.strokeStyle = under ? 'rgba(110,115,120,.55)' : 'rgba(120,125,130,.6)'; g.lineWidth = tl * 0.012;
		for (i = 1; i <= 2; i++) {
			var t2 = i / 3, a2 = dcQ(dcQ(S, Lc, 0.5), cR, t2), b2 = dcQ(W, cB, t2);
			g.beginPath(); g.moveTo(a2[0], a2[1]);
			g.quadraticCurveTo(dcQ(a2, b2, 0.5)[0] - ox * tl * 0.03, dcQ(a2, b2, 0.5)[1] - oy * tl * 0.03, b2[0], b2[1]); g.stroke();
		}
		/* the pale leading edge */
		g.strokeStyle = under ? 'rgba(236,236,232,.8)' : 'rgba(214,218,220,.7)'; g.lineWidth = tl * 0.02;
		g.beginPath(); g.moveTo(dcQ(S, W, 0.08)[0], dcQ(S, W, 0.08)[1]);
		g.quadraticCurveTo(Lc[0], Lc[1], dcQ(W, T, 0.08)[0], dcQ(W, T, 0.08)[1]); g.stroke();
	}
}
/* a leg: from the hip (in the body) to the heel joint and the foot; a
 * crane's 'backward knee' is its heel. Toes splay forward when down. */
function dcLeg(g, H, K, F, down, col, w) {
	g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
	/* the feathered thigh, then the bare tibia */
	g.strokeStyle = DC.body2; g.lineWidth = w * 2.4;
	g.beginPath(); g.moveTo(H[0], H[1]); g.lineTo(dcLerp(H[0], K[0], 0.18), dcLerp(H[1], K[1], 0.18)); g.stroke();
	g.strokeStyle = col;
	g.lineWidth = w;
	g.beginPath(); g.moveTo(H[0], H[1]); g.lineTo(K[0], K[1]); g.lineTo(F[0], F[1]); g.stroke();
	g.fillStyle = col; g.beginPath(); g.ellipse(K[0], K[1], w * 1.0, w * 0.8, Math.atan2(F[1] - K[1], F[0] - K[0]), 0, Math.PI * 2); g.fill();
	/* the low sun's line down the front of the bare leg */
	g.strokeStyle = 'rgba(150,140,120,.45)'; g.lineWidth = w * 0.3;
	g.beginPath(); g.moveTo(dcLerp(H[0], K[0], 0.3) + w * 0.3, dcLerp(H[1], K[1], 0.3)); g.lineTo(K[0] + w * 0.3, K[1]); g.lineTo(dcLerp(K[0], F[0], 0.9) + w * 0.3, dcLerp(K[1], F[1], 0.9)); g.stroke();
	g.strokeStyle = col;
	var dx = F[0] - K[0], dy = F[1] - K[1], d = Math.sqrt(dx*dx + dy*dy) || 1;
	var ax = dx/d, ay = dy/d, tl = 0.075;
	g.lineWidth = w * 0.75;
	g.beginPath();
	if (down) {
		g.moveTo(F[0], F[1]); g.lineTo(F[0] + tl, F[1] + w * 0.1);
		g.moveTo(F[0], F[1]); g.lineTo(F[0] + tl * 0.75, F[1] + w * 0.5);
		g.moveTo(F[0], F[1]); g.lineTo(F[0] - tl * 0.22, F[1] + w * 0.1);
	} else {
		/* toes hanging, curled */
		g.moveTo(F[0], F[1]); g.lineTo(F[0] + ax*tl*0.9 + ay*tl*0.25, F[1] + ay*tl*0.9 - ax*tl*0.25);
		g.moveTo(F[0], F[1]); g.lineTo(F[0] + ax*tl*0.95 - ay*tl*0.15, F[1] + ay*tl*0.95 + ax*tl*0.15);
	}
	g.stroke();
}
/* The bird, facing +x, ground at y = 0, 1 = standing height. */
function dcPaint(g, P, dark) {
	var b = P.b, ca = Math.cos(b[2]), sa = Math.sin(b[2]), bl = P.bl || 0.40, bd = P.bd || 0.21;
	function B(u, v) { return [b[0] + u*bl*ca - v*bd*sa, b[1] + u*bl*sa + v*bd*ca]; }
	g.lineCap = 'round'; g.lineJoin = 'round';
	var lw = 0.014;
	var legC = dark ? '#1B130D' : DC.leg;
	/* the far wing and the far leg, behind everything */
	if (P.w2) { dcWing(g, P.w2.s, P.w2.w, P.w2.t, P.w2.e, P.w2.r, !P.w2.lit, !!P.w2.lit, P.w2.bulge); }
	dcLeg(g, P.l2.h || B(-0.12, 0.42), P.l2.k, P.l2.f, P.l2.down, dark ? legC : '#2F3033', lw);
	/* a wing thrown up behind the body: the breast and flank cover its root */
	if (P.w1 && P.w1.behind) { dcWing(g, P.w1.s, P.w1.w, P.w1.t, P.w1.e, P.w1.r, false, !!P.w1.under, P.w1.bulge); }
	/* the bustle: the drooping tertials over the tail, a crane's mark */
	var bs = P.bs == null ? 1 : P.bs;
	var r0 = B(-0.20, -0.45), r1 = B(-0.62, -0.20), r2 = B(-0.66, 0.30);
	var bt = [r2[0] - 0.01, r2[1] + 0.10 * bs];
	g.fillStyle = DC.bust2;
	g.beginPath();
	g.moveTo(r0[0], r0[1]);
	g.quadraticCurveTo(r1[0], r1[1], bt[0], bt[1]);
	g.quadraticCurveTo(B(-0.40, 0.40)[0], B(-0.40, 0.40)[1] + 0.02 * bs, B(-0.20, 0.30)[0], B(-0.20, 0.30)[1]);
	g.closePath(); g.fill();
	/* the bustle's own feathers: long, loose, drooping over the tail, each
	 * slate with a paler fringe, the tips curling down */
	for (var tq = 0; tq < 7; tq++) {
		var ta = B(-0.16 - tq * 0.05, -0.40 + tq * 0.11), tb = B(-0.66 - dcH(tq) * 0.06, -0.12 + tq * 0.075);
		g.fillStyle = tq % 2 ? DC.bust : DC.bust2;
		dcFeather(g, ta[0], ta[1], tb[0], tb[1] + 0.05 * bs + tq * 0.008 * bs, 0.05, 0.12 + dcH(tq + 9) * 0.06);
		g.strokeStyle = 'rgba(196,198,200,.55)'; g.lineWidth = 0.004;
		g.beginPath(); g.moveTo(dcLerp(ta[0], tb[0], 0.35), dcLerp(ta[1], tb[1], 0.35)); g.quadraticCurveTo(dcLerp(ta[0], tb[0], 0.75), dcLerp(ta[1], tb[1], 0.75) + 0.012, tb[0], tb[1] + 0.05 * bs); g.stroke();
	}
	/* neck: long and thin, from the front of the body to the head */
	var n0 = P.n0 || B(0.46, -0.30), h = P.h, ha = P.ha;
	var c1 = [n0[0] + P.n[0], n0[1] + P.n[1]], c2 = [h[0] + P.n[2], h[1] + P.n[3]];
	/* the neck lit from in front: shade across it, never bands along it */
	var nm = dcQ(n0, h, 0.5), nax = h[0] - n0[0], nay = h[1] - n0[1], nal = Math.sqrt(nax * nax + nay * nay) || 1, npx = -nay / nal, npy = nax / nal;
	if (npx < 0) { npx = -npx; npy = -npy; }
	var ng = g.createLinearGradient(nm[0] - npx * 0.06, nm[1] - npy * 0.06, nm[0] + npx * 0.06, nm[1] + npy * 0.06);
	ng.addColorStop(0, dark ? '#241A12' : '#7A8293'); ng.addColorStop(0.45, dark ? '#241A12' : '#B9BBBE'); ng.addColorStop(1, dark ? '#241A12' : '#F1EEE7');
	g.fillStyle = ng;
	dcTube(g, n0, c1, c2, h, P.nw || 0.10, 0.042, 18);
	if (!dark) {   /* its ochre-tinged base and fine feathering low down */
		g.save(); g.clip();
		var ngr = g.createRadialGradient(n0[0], n0[1], 0, n0[0], n0[1], 0.16);
		ngr.addColorStop(0, 'rgba(170,116,64,.32)'); ngr.addColorStop(1, 'rgba(170,116,64,0)'); g.fillStyle = ngr; g.fillRect(n0[0] - 0.2, n0[1] - 0.2, 0.4, 0.4);
		dcRows(g, n0, Math.atan2(-nay, -nax), nal * 0.55, 0.11, 4, 12, 0.012, 'rgba(110,114,120,.14)', 'rgba(244,242,236,.32)', 41);
		g.restore();
	}
	/* body: deep-chested, tapering to the tail under the bustle; shaded
	 * darker along the back, paler at the breast, as the heron is */
	var gb0 = B(0, -0.6), gb1 = B(0.1, 0.6), gbr = g.createLinearGradient(gb0[0], gb0[1], gb1[0], gb1[1]);
	gbr.addColorStop(0, dark ? '#241A12' : '#5E687C'); gbr.addColorStop(0.5, dark ? '#241A12' : DC.body); gbr.addColorStop(1, dark ? '#241A12' : '#D9D5CE');
	g.fillStyle = gbr;
	var p = [B(0.50, -0.05), B(0.38, -0.52), B(-0.05, -0.56), B(-0.42, -0.30), B(-0.58, 0.10), B(-0.30, 0.55), B(0.10, 0.62), B(0.42, 0.40)];
	g.beginPath(); g.moveTo(p[0][0], p[0][1]);
	g.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0] + (p[2][0] - p[3][0]) * 0.2, p[3][1]);
	g.quadraticCurveTo(p[4][0], p[4][1] - 0.02, p[4][0], p[4][1]);
	g.bezierCurveTo(p[5][0], p[5][1], p[6][0], p[6][1], p[7][0], p[7][1]);
	g.quadraticCurveTo(B(0.56, 0.20)[0], B(0.56, 0.20)[1], p[0][0], p[0][1]);
	g.closePath(); g.fill();
	if (!dark) {
		g.save(); g.clip();
		/* contour feathers in rows from breast to tail, fringed paler */
		dcRows(g, B(0.55, -0.62), b[2] + Math.PI, bl * 1.25, bd * 1.25, 12, 16, 0.017, 'rgba(110,114,120,.09)', 'rgba(242,240,234,.24)', 11);
		/* the rusty, ochre staining the photos show on the back and flank */
		var rs = [[-0.05, -0.30, 0.20, 0.34], [0.20, 0.05, 0.16, 0.22], [-0.35, 0.10, 0.16, 0.26]];
		for (var ri = 0; ri < rs.length; ri++) {
			var rc = B(rs[ri][0], rs[ri][1]), rg = g.createRadialGradient(rc[0], rc[1], 0, rc[0], rc[1], rs[ri][2]);
			rg.addColorStop(0, 'rgba(178,110,52,' + (rs[ri][3] * 1.3) + ')'); rg.addColorStop(1, 'rgba(178,110,52,0)');
			g.fillStyle = rg; g.fillRect(rc[0] - 0.3, rc[1] - 0.3, 0.6, 0.6);
		}
		/* the light: the low sun on the breast, the back and belly in shade */
		var lg = g.createLinearGradient(B(0.55, -0.35)[0], B(0.55, -0.35)[1], B(-0.45, 0.45)[0], B(-0.45, 0.45)[1]);
		lg.addColorStop(0, 'rgba(255,246,232,.55)'); lg.addColorStop(0.45, 'rgba(255,246,232,0)'); lg.addColorStop(1, 'rgba(36,44,64,.36)');
		g.fillStyle = lg; g.fillRect(B(0, 0)[0] - 0.6, B(0, 0)[1] - 0.6, 1.2, 1.2);
		g.restore();
	}
	/* the paler breast and belly, fading into the flank */
	var bgr = g.createLinearGradient(B(0.50, 0.1)[0], B(0.50, 0.1)[1], B(-0.15, 0.3)[0], B(-0.15, 0.3)[1]);
	bgr.addColorStop(0, dark ? '#241A12' : 'rgba(236,232,224,.95)'); bgr.addColorStop(1, dark ? '#241A12' : 'rgba(220,216,209,0)');
	g.fillStyle = bgr;
	g.beginPath();
	var e0 = B(0.48, -0.10), e1 = B(0.50, 0.40), e2 = B(0.00, 0.62), e3 = B(-0.25, 0.48), e4 = B(0.05, 0.20);
	g.moveTo(e0[0], e0[1]); g.quadraticCurveTo(e1[0], e1[1], e2[0], e2[1]);
	g.quadraticCurveTo(e3[0], e3[1], e3[0], e3[1]);
	g.quadraticCurveTo(e4[0], e4[1], e0[0], e0[1]); g.closePath(); g.fill();
	/* the folded wing on the flank when it is not open */
	if (!P.w1) {
		var fw0 = B(0.0, -0.70), fw1 = B(-0.2, 0.25), fwg = g.createLinearGradient(fw0[0], fw0[1], fw1[0], fw1[1]);
		fwg.addColorStop(0, dark ? '#241A12' : '#8E929A'); fwg.addColorStop(0.55, dark ? '#241A12' : '#6A7384'); fwg.addColorStop(1, dark ? '#241A12' : '#36425A');
		g.fillStyle = fwg;   /* the folded wing, slate as in the photo */
		var f0 = B(0.36, -0.44), f1 = B(-0.10, -0.70), f2 = B(-0.66, -0.08), f3 = B(-0.20, 0.22);
		g.beginPath(); g.moveTo(f0[0], f0[1]); g.quadraticCurveTo(f1[0], f1[1], f2[0], f2[1]);
		g.quadraticCurveTo(f3[0], f3[1], B(0.30, -0.05)[0], B(0.30, -0.05)[1]); g.closePath(); g.fill();
		if (!dark) {   /* the folded coverts: scalloped rows, fringed, with the ochre wash */
			g.save(); g.clip();
			dcRows(g, B(0.34, -0.55), b[2] + Math.PI - 0.15, bl * 1.05, bd * 0.75, 8, 12, 0.021, 'rgba(60,66,74,.10)', 'rgba(206,208,210,.26)', 23);
			var fr = B(-0.05, -0.35), fg = g.createRadialGradient(fr[0], fr[1], 0, fr[0], fr[1], 0.22);
			fg.addColorStop(0, 'rgba(178,108,50,.46)'); fg.addColorStop(1, 'rgba(178,108,50,0)'); g.fillStyle = fg; g.fillRect(fr[0] - 0.3, fr[1] - 0.3, 0.6, 0.6);
			g.restore();
		}
		/* the tertials over the bustle, a few long feathers drooping */
		g.fillStyle = DC.bust;
		for (var q = 0; q < 4; q++) {
			var a0 = B(-0.18 - q * 0.08, -0.36 + q * 0.04), a1 = B(-0.62 - q * 0.02, 0.06 + q * 0.07);
			dcFeather(g, a0[0], a0[1], a1[0], a1[1] + 0.06 * bs, 0.035, 0.10);
		}
	}
	/* the near leg */
	dcLeg(g, P.l1.h || B(0.08, 0.48), P.l1.k, P.l1.f, P.l1.down, legC, lw);
	/* head: small; a long dagger bill; the red crown; the white cheek */
	var hc = Math.cos(ha), hs = Math.sin(ha);
	function Hd(u, v) { return [h[0] + u*hc - v*hs, h[1] + u*hs + v*hc]; }
	g.fillStyle = DC.neck;
	g.beginPath(); g.ellipse(h[0], h[1], 0.040, 0.030, ha, 0, Math.PI * 2); g.fill();
	g.fillStyle = dark ? DC.neck : '#F4F2EC';   /* the white cheek, gape to nape, below the crown */
	var k0 = Hd(0.032, 0.002), k1 = Hd(-0.010, 0.034), k2 = Hd(-0.046, 0.006);
	g.beginPath(); g.moveTo(k0[0], k0[1]); g.quadraticCurveTo(k1[0], k1[1], k2[0], k2[1]); g.quadraticCurveTo(Hd(-0.02, -0.016)[0], Hd(-0.02, -0.016)[1], k0[0], k0[1]); g.fill();
	var gape = P.gape || 0;
	g.fillStyle = DC.bill;
	var t0 = Hd(0.030, -0.010), t1 = Hd(0.150, -0.002 - gape * 0.03), t2 = Hd(0.030, 0.008);
	g.beginPath(); g.moveTo(t0[0], t0[1]); g.lineTo(t1[0], t1[1]); g.lineTo(t2[0], t2[1]); g.closePath(); g.fill();
	if (gape) {
		var u1 = Hd(0.138, 0.012 + gape * 0.035);
		g.beginPath(); g.moveTo(t2[0], t2[1]); g.lineTo(u1[0], u1[1]); g.lineTo(Hd(0.030, 0.014)[0], Hd(0.030, 0.014)[1]); g.closePath(); g.fill();
	}
	if (!dark) {
		g.fillStyle = DC.crown;
		var r0 = Hd(0.030, -0.010), r1 = Hd(0.000, -0.040), r2 = Hd(-0.030, -0.018);
		g.beginPath(); g.moveTo(r0[0], r0[1]); g.quadraticCurveTo(r1[0], r1[1], r2[0], r2[1]);
		g.quadraticCurveTo(Hd(0.000, -0.010)[0], Hd(0.000, -0.010)[1], r0[0], r0[1]); g.fill();
		g.fillStyle = 'rgba(120,10,20,.55)';   /* the crown is bare, warty skin */
		for (var cq = 0; cq < 6; cq++) { var cp = Hd(0.022 - cq * 0.008, -0.020 - dcH(cq) * 0.010); g.beginPath(); g.arc(cp[0], cp[1], 0.0028, 0, Math.PI * 2); g.fill(); }
		g.fillStyle = '#E2741C';
		var ey = Hd(0.012, -0.006); g.beginPath(); g.arc(ey[0], ey[1], 0.0058, 0, Math.PI * 2); g.fill();
		g.fillStyle = '#1A1A1A'; g.beginPath(); g.arc(ey[0], ey[1], 0.0026, 0, Math.PI * 2); g.fill();
		g.strokeStyle = 'rgba(150,150,140,.6)'; g.lineWidth = 0.004;   /* the bill's lit ridge */
		g.beginPath(); g.moveTo(Hd(0.034, -0.008)[0], Hd(0.034, -0.008)[1]); g.lineTo(Hd(0.14, -0.003 - gape * 0.03)[0], Hd(0.14, -0.003 - gape * 0.03)[1]); g.stroke();
	}
	/* the near wing over everything when open */
	if (P.w1 && !P.w1.behind) { dcWing(g, P.w1.s, P.w1.w, P.w1.t, P.w1.e, P.w1.r, false, !!P.w1.under, P.w1.bulge); }
}
`;

/* ---- the poses, each fitted over its photograph ---------------------- */
/* ref: which photo, where the bird stands in it (ground point, standing
 * height in photo px, facing). Units: 1 = standing height, y up negative. */
const POSES = {
  stand: {
    ref: { f: 'cr5.jpg', crop: [560, 220, 260, 420], x0: 692, y0: 620, H: 368, face: -1 },
    note: 'standing, facing its mate (the right bird in the photo)',
    P: { b: [-0.03, -0.45, -0.80], bl: 0.42, bd: 0.235, n0: [0.10, -0.60], n: [0.03, -0.20, -0.02, 0.14], h: [0.13, -0.955], ha: 0.10, bs: 0.35,
         l1: { h: [0.06, -0.31], k: [0.12, -0.14], f: [0.18, -0.005], down: true }, l2: { h: [-0.06, -0.30], k: [-0.075, -0.18], f: [-0.08, -0.005], down: true } },
  },
  call: {
    ref: { f: 'cr5.jpg', crop: [150, 170, 330, 470], x0: 385, y0: 625, H: 368, face: 1 },
    note: 'head thrown up, calling, wings half open (the left bird)',
    P: { b: [0.05, -0.61, -1.0], bl: 0.40, bd: 0.23, n0: [0.12, -0.72], n: [0.02, -0.14, -0.02, 0.12], h: [0.085, -1.13], ha: -0.38, gape: 1, bs: 0.25,
         l1: { h: [0.03, -0.44], k: [0.025, -0.20], f: [0.02, -0.005], down: true }, l2: { h: [0.07, -0.44], k: [0.10, -0.22], f: [0.11, -0.005], down: true },
         w1: { s: [0.16, -0.78], w: [-0.12, -0.97], t: [-0.58, -0.92], e: [-0.46, -0.79], r: [-0.12, -0.56], under: true, behind: true, bulge: 0.10 },
         w2: null },
  },
  leap: {
    ref: { f: 'cr6.jpg', crop: [380, 0, 580, 713], x0: 720, y0: 705, H: 470, face: -1 },
    note: 'springing up, both wings thrown open (the right bird)',
    P: { b: [0.07, -0.45, -0.65], bl: 0.46, bd: 0.20, n0: [0.17, -0.58], nw: 0.13, n: [0.12, -0.02, -0.12, 0.08], h: [0.51, -0.89], ha: 0.09, bs: 0.3,
         l1: { h: [-0.02, -0.30], k: [-0.09, -0.24], f: [0.05, -0.02], down: true }, l2: { h: [-0.05, -0.29], k: [-0.11, -0.23], f: [-0.11, -0.02], down: true },
         w1: { s: [0.07, -0.64], w: [-0.17, -0.88], t: [-0.33, -1.16], e: [-0.27, -0.50], r: [0.02, -0.43], bulge: 0.10 },
         w2: { s: [0.19, -0.70], w: [0.31, -1.05], t: [0.37, -1.45], e: [0.06, -1.02], r: [-0.02, -0.66], lit: true, bulge: 0.05 } },
  },
};

module.exports = { DC_SRC, POSES };

if (require.main === module && process.argv.includes('--sheet')) {
  /* the sheet for Rob: each pose over its photograph, the new bird beside
   * the sprite in the engine, at guest size on the real header */
  const { open } = require('./harness');
  const refs = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
  const old = SRC.match(/cranedance: '([^']*)'/)[1];
  const oc = old.indexOf('|'), [ow, oh] = old.slice(0, oc).split(' ').map(Number);
  const oldUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ow} ${oh}" width="${ow}" height="${oh}">${old.slice(oc + 1)}</svg>`);
  const scene = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', '.anniv-scene.json'), 'utf8'));
  const hdr = 'data:image/png;base64,' + scene.shots[390].clean;
  const items = Object.entries(POSES).map(([k, v]) => ({ k, ...v, img: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(refs, v.ref.f)).toString('base64') }));
  const SRCS = { 'cr5.jpg': '“Sandhill Cranes Dancing, Dunes in Background,” Wikimedia Commons, public domain', 'cr6.jpg': '“Sandhill Cranes Kissing — Courtship Ritual,” Wikimedia Commons, public domain' };
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
    h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 4px;text-align:center} .sub,.note{color:#555;margin:0 auto 10px;max-width:920px}
    section{border-top:1px solid #E3D9C6;padding:14px 0 8px} .row{display:flex;gap:10px;justify-content:center;align-items:flex-end;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#666;margin-top:4px}
    canvas,img.h{display:block;border:1px solid #D9CDB6;border-radius:3px}</style>
    <h1>Seasons — The Anniversary: The Dancing Pair, Drawn From Photographs</h1>
    <p class="sub">A sandhill crane drawn the way the heron was: a jointed bird (body, a long neck, the head with its red crown and dagger bill, legs with the backward-bending heel, and wings built from the shoulder, wrist and tip, with separate primaries and a scalloped row of secondaries), each pose fitted over a public-domain photograph of a real dance and fixed where the 50% overlay showed a fault. Florida sandhill cranes live in Lake County all year, and a pair stays together for life.</p>
    <div id=fits></div>
    <section><h2>Which Bird Dances</h2><p class="note">A is the crane sprite the Florida Keys water-line scene already uses; it costs no new bytes. B is the new bird. Both at the size a guest sees them on a phone, over the real home page.</p>
      <div class="row"><figure><div style="position:relative;width:390px;height:150px;overflow:hidden;border:1px solid #D9CDB6;border-radius:3px;background:url(${hdr}) 0 -270px/390px 420px"><img src="${oldUrl}" style="position:absolute;left:140px;top:62px;height:62px"><img src="${oldUrl}" style="position:absolute;left:200px;top:62px;height:62px;transform:scaleX(-1)"></div><figcaption>A — the sprite in the engine</figcaption></figure>
      <figure><div style="position:relative;width:390px;height:150px;overflow:hidden;border:1px solid #D9CDB6;border-radius:3px;background:url(${hdr}) 0 -270px/390px 420px"></div><figcaption>B — the new bird (the scene sheet shows it in place)</figcaption></figure></div>
      <p class="note">Florida Keys: if Rob picks B, should its water-line scene take the same bird, so the plugin carries one crane? Its scene is approved art, so this is asked separately, and leaving it alone is a fine answer.</p></section>
    <script>${DC_SRC}
    window.run = async (items, SRCS) => { const host = document.getElementById('fits');
      for (const it of items) { const im = new Image(); im.src = it.img; await im.decode();
        const [cx, cy, cw, ch] = it.ref.crop, S = Math.min(1.3, 340 / ch);
        const sec = document.createElement('section'); sec.innerHTML = '<h2>' + ({ stand: 'Standing, Facing Its Mate', call: 'Calling, Wings Half Open', leap: 'The Leap, Both Wings Thrown Open' })[it.k] + '</h2><p class="note">Photograph: ' + SRCS[it.ref.f] + '.</p>';
        const row = document.createElement('div'); row.className = 'row'; sec.appendChild(row);
        ['the photograph', 'the drawing over it at 50%', 'the drawing'].forEach(function (cap, i) {
          const c = document.createElement('canvas'); c.width = cw * S * 2; c.height = ch * S * 2; c.style.width = cw * S + 'px'; c.style.height = ch * S + 'px';
          const g = c.getContext('2d'); g.scale(2, 2);
          if (i < 2) { g.drawImage(im, cx, cy, cw, ch, 0, 0, cw * S, ch * S); } else { g.fillStyle = '#E8D4A8'; g.fillRect(0, 0, cw * S, ch * S); }
          if (i) { g.save(); g.globalAlpha = i === 1 ? 0.5 : 1; g.scale(S, S); g.translate(it.ref.x0 - cx, it.ref.y0 - cy); g.scale(it.ref.H * it.ref.face, it.ref.H); dcPaint(g, it.P); g.restore(); }
          const f = document.createElement('figure'); f.appendChild(c); const fc = document.createElement('figcaption'); fc.textContent = cap; f.appendChild(fc); row.appendChild(f);
        });
        host.appendChild(sec);
      }
      /* B at guest size, the leap and the call, on the header strip */
      const box = document.querySelectorAll('.row')[document.querySelectorAll('.row').length - 1].children[1].firstChild;
      const c = document.createElement('canvas'); c.width = 780; c.height = 300; c.style.cssText = 'position:absolute;left:0;top:0;width:390px;height:150px;border:0';
      const g = c.getContext('2d'); g.scale(2, 2);
      g.save(); g.translate(166, 128); g.scale(56, 56); dcPaint(g, ${JSON.stringify(POSES.call.P)}); g.restore();
      g.save(); g.translate(228, 124); g.scale(-56, 56); dcPaint(g, ${JSON.stringify(POSES.leap.P)}); g.restore();
      box.appendChild(c);
    };</script>`;
  (async () => {
    const ses = await open(html, { viewport: { width: 1200, height: 900 }, dsf: 2 });
    await ses.page.evaluate(([a, b]) => window.run(a, b), [items, SRCS]);
    await ses.page.waitForTimeout(400);
    await ses.page.setViewportSize({ width: 1200, height: await ses.page.evaluate(() => document.body.scrollHeight) });
    await ses.page.screenshot({ path: path.join(__dirname, '..', 'build', 'Seasons - 4.13.1 anniversary cranes.png') });
    await ses.close(); console.log('cranes sheet: ok');
  })();
} else if (require.main === module) {
  const { chromium } = require('playwright');
  const refs = (process.argv.find(a => a.startsWith('--refs=')) || '').slice(7) || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
  const only = (process.argv.find(a => a.startsWith('--pose=')) || '').slice(7);
  const out = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6) || path.join(refs, 'fit.png');
  (async () => {
    const b = await chromium.launch();
    const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const items = Object.entries(POSES).filter(([k]) => !only || k === only).map(([k, v]) => ({ k, ...v,
      img: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(refs, v.ref.f)).toString('base64') }));
    await pg.setContent(`<body style="margin:0;background:#FBF6EC;font:13px system-ui"><div id=w style="display:flex;flex-wrap:wrap;gap:10px;padding:10px"></div>
      <script>${DC_SRC}
      window.run = async (items) => { for (const it of items) {
        const im = new Image(); im.src = it.img; await im.decode();
        const [cx, cy, cw, ch] = it.ref.crop, S = window.SC || 1.6;
        const box = document.createElement('div'); box.innerHTML = '<b>' + it.k + '</b> — ' + it.note + '<br>';
        for (const mode of ['photo', 'overlay', 'drawing']) {
          const c = document.createElement('canvas'); c.width = cw * S; c.height = ch * S; c.style.marginRight = '6px';
          const g = c.getContext('2d');
          if (mode !== 'drawing') { g.drawImage(im, cx, cy, cw, ch, 0, 0, cw * S, ch * S); } else { g.fillStyle = '#E8D4A8'; g.fillRect(0, 0, c.width, c.height); }
          if (mode !== 'photo') {
            g.save(); g.globalAlpha = mode === 'overlay' ? 0.5 : 1;
            g.scale(S, S); g.translate(it.ref.x0 - cx, it.ref.y0 - cy); g.scale(it.ref.H * it.ref.face, it.ref.H);
            dcPaint(g, it.P); g.restore();
          }
          if (mode === 'photo' && window.GRID) {   /* pose units, every 0.1, to fit by */
            g.save(); g.scale(S, S); g.translate(it.ref.x0 - cx, it.ref.y0 - cy); g.scale(it.ref.H * it.ref.face, it.ref.H);
            g.lineWidth = 1 / it.ref.H; g.font = (10 / it.ref.H) + 'px sans-serif';
            for (let u = -1.0; u <= 1.01; u += 0.1) { g.strokeStyle = Math.abs(u) < 0.01 ? 'rgba(255,0,0,.8)' : 'rgba(0,255,255,.45)'; g.beginPath(); g.moveTo(u, -1.6); g.lineTo(u, 0.1); g.stroke(); }
            for (let v = -1.6; v <= 0.01; v += 0.1) { g.strokeStyle = 'rgba(0,255,255,.45)'; g.beginPath(); g.moveTo(-1, v); g.lineTo(1, v); g.stroke(); }
            g.fillStyle = '#ff0'; for (let u = -1.0; u <= 1.01; u += 0.2) { for (let v = -1.6; v <= 0.01; v += 0.2) { g.save(); g.translate(u, v); g.scale(it.ref.face, 1); g.fillText(u.toFixed(1) + ',' + v.toFixed(1), 0.004, -0.004); g.restore(); } }
            g.restore();
          }
          box.appendChild(c);
        }
        w.appendChild(box);
      } document.title = 'done'; };</script>`);
    if (process.argv.includes('--grid')) { await pg.evaluate(() => { window.GRID = 1; }); }
    const SC = +((process.argv.find(a => a.startsWith('--scale=')) || '').slice(8)) || 0; if (SC) { await pg.evaluate(v => { window.SC = v; }, SC); }
    await pg.evaluate(it => window.run(it), items);
    await pg.screenshot({ path: out, fullPage: true });
    await b.close();
    console.log(out);
  })();
}
