/* DCC Seasons — Great Blue Heron candidates (4.8.0 round), drawn in code.
 *
 * ONE skeleton and ONE wingbeat, three art styles for Rob to choose from:
 *   A  "Field guide" — realistic: shaded, individual primaries, covert rows,
 *      streaked foreneck, head plumes.
 *   B  "Painted"     — stylised: flat colours, clean shapes, fine outline,
 *      the same field marks with less detail.
 *   C  "Silhouette+" — a slate silhouette that keeps only the marks a
 *      birder checks: white face, black crown stripe, yellow bill and eye,
 *      rusty wrist and thighs.
 *
 * Field marks (the Website Director's brief): neck folded back in an S
 * with the head drawn in; legs trailing straight back well past the tail;
 * long, broad, rounded wings with dark flight feathers; slate blue-gray;
 * white face, black stripe above the eye into black plumes; long heavy
 * yellowish dagger bill; yellow eye; pale streaked foreneck; rusty thighs
 * and a touch of rust at the wrist.
 *
 * Motion: a continuous cycle, not frames — ~2 beats a second, the downstroke
 * a little longer than the upstroke; the wing bends at the wrist and the
 * primaries spread on the downstroke and fold on the upstroke; bouts of
 * 4-6 beats with short glides between; the body rises on each downstroke
 * and the neck lags it slightly.
 *
 * Bird faces LEFT (like the engine's sprites; the engine mirrors it), body
 * length ~100 units, drawn at scale s = width / 100. Standalone so it can
 * be judged before anything goes into engine.js. */
(function (root) {
	'use strict';
	var PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs;
	function lerp(a, b, t) { return a + (b - a) * t; }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function ease(t) { return 0.5 - 0.5 * cos(PI * clamp(t, 0, 1)); }

	/* ---- the wingbeat ---------------------------------------------------
	 * phase 0 = top of the upstroke. Downstroke 0 -> 0.56, upstroke after.
	 * psi: the wing's direction from the shoulder, -1.85 (up and back) to
	 * +1.05 (down). flex: how far the hand folds back at the wrist (0 = a
	 * straight, fully spread wing). spread: primaries fanned. */
	var DOWN = 0.56;
	function beatPose(ph) {
		var p = ph - Math.floor(ph), u, psi, flex, spread, bob;
		if (p < DOWN) {
			u = ease(p / DOWN);
			psi = lerp(-1.85, 1.05, u);
			flex = 0.12 + 0.18 * (1 - sin(PI * p / DOWN));   /* straightens through the stroke */
			spread = sin(PI * p / DOWN);
		} else {
			u = ease((p - DOWN) / (1 - DOWN));
			psi = lerp(1.05, -1.85, u);
			flex = 0.3 + 0.7 * sin(PI * (p - DOWN) / (1 - DOWN)); /* folds hard on the way up */
			spread = 0.15 * (1 - sin(PI * (p - DOWN) / (1 - DOWN)));
		}
		bob = -sin(TAU * (p - 0.12)) * 2.2;  /* the body lifts as the wing drives down */
		return { psi: psi, flex: flex, spread: spread, bob: bob, neck: -sin(TAU * (p - 0.28)) * 1.1 };
	}
	var GLIDE = { psi: 0.22, flex: 0.18, spread: 0.55, bob: 0, neck: 0 };
	function mixPose(a, b, t) {
		return { psi: lerp(a.psi, b.psi, t), flex: lerp(a.flex, b.flex, t), spread: lerp(a.spread, b.spread, t), bob: lerp(a.bob, b.bob, t), neck: lerp(a.neck, b.neck, t) };
	}
	/* A flight: bouts of beats with glides between. step(dt) -> pose. */
	function Flight(rand) {
		rand = rand || Math.random;
		this.rand = rand; this.ph = 0.05; this.beats = 4 + ((rand() * 3) | 0); this.glide = 0; this.blend = 0;
	}
	Flight.prototype.step = function (dt) {
		var BPS = 2.0;
		if (this.glide > 0) {
			this.glide -= dt;
			this.blend = Math.min(1, this.blend + dt / 0.35);
			if (this.glide <= 0) { this.beats = 4 + ((this.rand() * 3) | 0); this.ph = 0.42; }
			return mixPose(beatPose(0.42), GLIDE, ease(this.blend));
		}
		var was = this.ph;
		this.ph += dt * BPS;
		if (Math.floor(this.ph) > Math.floor(was)) { this.beats--; }
		/* glide out of the middle of a downstroke, wings held bowed */
		if (this.beats <= 0 && (this.ph % 1) > 0.42) { this.glide = 0.9 + this.rand() * 0.7; this.blend = 0; }
		var p = beatPose(this.ph);
		this.blend = Math.max(0, this.blend - dt / 0.3);
		return this.blend > 0 ? mixPose(p, GLIDE, ease(this.blend)) : p;
	};

	/* ---- geometry ------------------------------------------------------ */
	function wingGeom(pose, far) {
		var k = far ? 0.86 : 1;
		var S = far ? [-1, -6.5] : [-3, -4.6];
		var ps = pose.psi;
		/* projected length: a wing pointing at the viewer (psi ~ 0) is
		 * foreshortened; viewed a little from below, it never vanishes */
		var fore = 0.62 + 0.38 * abs(sin(ps));
		var La = 30 * k * fore, Lh = 41 * k * (0.55 + 0.45 * fore);
		/* the arm points up/down and a little back along the body */
		var ax = 0.42 + 0.22 * cos(ps), ay = sin(ps);
		var an = Math.sqrt(ax * ax + ay * ay); ax /= an; ay /= an;
		var Wr = [S[0] + ax * La, S[1] + ay * La];
		/* the hand: the arm's line, folded back toward the tail by flex */
		var hb = Math.atan2(ay, ax) + (ay < 0 ? 1 : -1) * pose.flex * 1.15 * (ay < 0 ? 1 : 1);
		if (ay < 0) { hb = Math.atan2(ay, ax) + pose.flex * 1.1; } else { hb = Math.atan2(ay, ax) - pose.flex * 0.9; }
		var Tp = [Wr[0] + cos(hb) * Lh, Wr[1] + sin(hb) * Lh];
		/* trailing edge, toward the tail: chord 13-15, narrowing to the tip */
		var nx = -sin(Math.atan2(ay, ax)), ny = cos(Math.atan2(ay, ax));
		if (nx < 0) { nx = -nx; ny = -ny; }                /* always the tail side */
		var hx = -sin(hb), hy = cos(hb); if (hx < 0) { hx = -hx; hy = -hy; }
		var c0 = 21 * k, c1 = 19 * k;
		var Rt = [14 * k, -3.5];
		var Wt = [Wr[0] + nx * c1, Wr[1] + ny * c1];
		return { S: S, W: Wr, T: Tp, Wt: Wt, R: Rt, hb: hb, hx: hx, hy: hy, ax: ax, ay: ay, Lh: Lh, k: k, c0: c0 };
	}

	/* ---- palettes per style -------------------------------------------- */
	var PAL = {
		A: { back: '#7F95AE', back2: '#62788F', belly: '#5D6B7C', cov: '#86A0BA', cov2: '#6E87A2', flight: '#2E394A', prim: '#222A36', farTint: 0.72,
			neck: '#ECE7DD', neckBack: '#A3AEBE', streak: 'rgba(58,66,80,.55)', face: '#F6F4EE', cap: '#1A1D22', bill: '#E2B23E', billTop: '#7A6326', eye: '#F2C230',
			leg: '#55553F', thigh: '#8E4A2A', wrist: '#A75C36', tail: '#5E7389', line: null },
		B: { back: '#7C93AC', back2: '#7C93AC', belly: '#66778A', cov: '#8AA3BC', cov2: '#8AA3BC', flight: '#34405A', prim: '#2A3346', farTint: 0.7,
			neck: '#EEE9DF', neckBack: '#A8B2C2', streak: 'rgba(64,72,87,.5)', face: '#FFFFFF', cap: '#1C1F25', bill: '#E8B93F', billTop: '#E8B93F', eye: '#F5C431',
			leg: '#5A5946', thigh: '#94502E', wrist: '#AD6138', tail: '#647A91', line: '#28323F' },
		C: { back: '#4D5E72', back2: '#4D5E72', belly: '#45546A', cov: '#55677D', cov2: '#55677D', flight: '#2B3545', prim: '#252E3C', farTint: 0.78,
			neck: '#4D5E72', neckBack: '#4D5E72', streak: null, face: '#F4F1EA', cap: '#14171C', bill: '#E2B13C', billTop: '#E2B13C', eye: '#F2C230',
			leg: '#3E4A58', thigh: '#8A4A2B', wrist: '#9E5634', tail: '#4D5E72', line: null }
	};
	function shade(hex, f) {
		var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
		return 'rgb(' + Math.round(r * f) + ',' + Math.round(gg * f) + ',' + Math.round(b * f) + ')';
	}

	function wingPath(g, w) {
		g.beginPath();
		g.moveTo(w.S[0], w.S[1]);
		g.quadraticCurveTo((w.S[0] + w.W[0]) / 2 - w.ax * 2, (w.S[1] + w.W[1]) / 2 - 2.5, w.W[0], w.W[1]);
		g.quadraticCurveTo((w.W[0] + w.T[0]) / 2, (w.W[1] + w.T[1]) / 2 - 1.5 * Math.sign(w.ay || 1), w.T[0], w.T[1]);
		/* the rounded tip, then back along the primaries' trailing edge */
		var mx = (w.T[0] + w.Wt[0]) / 2 + w.hx * 6, my = (w.T[1] + w.Wt[1]) / 2 + w.hy * 6;
		g.quadraticCurveTo(mx, my, w.Wt[0], w.Wt[1]);
		/* secondaries: a gently scalloped trailing edge to the body */
		g.quadraticCurveTo((w.Wt[0] + w.R[0]) / 2 + 2, (w.Wt[1] + w.R[1]) / 2 + 2, w.R[0], w.R[1]);
		g.closePath();
	}

	function drawWing(g, w, P, style, far) {
		var f = far ? P.farTint : 1;
		/* flight feathers first (the whole wing, dark) */
		wingPath(g, w);
		g.fillStyle = shade(P.flight, f); g.fill();
		/* primaries: separate feathers at the tip, fanned by spread */
		if (style !== 'C') {
			var n = style === 'A' ? 7 : 5;
			for (var i = 0; i < n; i++) {
				var q = i / (n - 1);
				var base = [lerp(w.W[0], w.T[0], 0.35 + 0.25 * q), lerp(w.W[1], w.T[1], 0.35 + 0.25 * q)];
				var ang = w.hb + (q - 0.3) * (0.25 + 0.55 * w.pose.spread) * (w.ay < 0 ? 1 : -1);
				var L = w.Lh * (0.62 - 0.05 * abs(q - 0.3)) * (style === 'A' ? 1 : 0.95);
				var tx = base[0] + cos(ang) * L, ty = base[1] + sin(ang) * L;
				var px = -sin(ang) * 2.1, py = cos(ang) * 2.1;
				g.beginPath();
				g.moveTo(base[0] - px, base[1] - py);
				g.quadraticCurveTo(tx - px * 0.6 - cos(ang) * 3, ty - py * 0.6 - sin(ang) * 3, tx, ty);
				g.quadraticCurveTo(tx + px * 0.6 - cos(ang) * 3, ty + py * 0.6 - sin(ang) * 3, base[0] + px, base[1] + py);
				g.closePath();
				g.fillStyle = shade(P.prim, f * (style === 'A' ? 0.9 + 0.2 * q : 1)); g.fill();
				if (style === 'A') { g.strokeStyle = shade('#56657A', f); g.lineWidth = 0.35; g.beginPath(); g.moveTo(base[0], base[1]); g.lineTo(tx, ty); g.stroke(); }
			}
		}
		/* coverts: the slate inner wing, over the flight feathers */
		var cvT = [lerp(w.W[0], w.T[0], 0.25), lerp(w.W[1], w.T[1], 0.25)];
		var cvB = [lerp(w.Wt[0], w.R[0], 0.12), lerp(w.Wt[1], w.R[1], 0.12)];
		g.beginPath();
		g.moveTo(w.S[0], w.S[1]);
		g.quadraticCurveTo((w.S[0] + w.W[0]) / 2 - w.ax * 2, (w.S[1] + w.W[1]) / 2 - 2.5, w.W[0], w.W[1]);
		g.lineTo(cvT[0], cvT[1]);
		g.quadraticCurveTo(lerp(cvT[0], cvB[0], 0.5) + w.hx * 3, lerp(cvT[1], cvB[1], 0.5) + w.hy * 3, cvB[0], cvB[1]);
		g.quadraticCurveTo((cvB[0] + w.R[0]) / 2, (cvB[1] + w.R[1]) / 2 - 1, w.R[0], w.R[1]);
		g.closePath();
		if (style === 'A') {
			var gr = g.createLinearGradient(w.S[0], w.S[1], cvB[0], cvB[1]);
			gr.addColorStop(0, shade(P.cov, f)); gr.addColorStop(1, shade(P.cov2, f));
			g.fillStyle = gr;
		} else { g.fillStyle = shade(P.cov, f); }
		g.fill();
		/* covert rows (A): two soft scallop lines across the inner wing */
		if (style === 'A') {
			g.strokeStyle = shade('#5B7189', f); g.lineWidth = 0.5;
			for (var r = 1; r <= 2; r++) {
				var t = r / 3;
				var a0 = [lerp(w.S[0], w.R[0], t), lerp(w.S[1], w.R[1], t)], a1 = [lerp(w.W[0], cvB[0], t), lerp(w.W[1], cvB[1], t)];
				g.beginPath(); g.moveTo(a0[0], a0[1]);
				g.quadraticCurveTo((a0[0] + a1[0]) / 2 + w.hx * 1.5, (a0[1] + a1[1]) / 2 + w.hy * 1.5, a1[0], a1[1]); g.stroke();
			}
		}
		/* rust at the wrist: a short band along the leading edge */
		g.strokeStyle = shade(P.wrist, f); g.lineWidth = style === 'C' ? 2.2 : 1.8; g.lineCap = 'round';
		g.beginPath();
		g.moveTo(lerp(w.S[0], w.W[0], 0.55), lerp(w.S[1], w.W[1], 0.55) - 0.6);
		g.lineTo(w.W[0], w.W[1]);
		g.stroke();
		if (P.line && !far) { wingPath(g, w); g.strokeStyle = P.line; g.lineWidth = 0.6; g.stroke(); }
	}

	/* the body, neck, head, bill, legs */
	function drawBody(g, pose, P, style) {
		var nb = pose.neck;
		/* legs, trailing straight back well past the tail */
		g.strokeStyle = P.leg; g.lineCap = 'round';
		g.lineWidth = 1.7;
		g.beginPath(); g.moveTo(10, 4.5); g.lineTo(52, 2.2); g.stroke();
		g.lineWidth = 1.5;
		g.beginPath(); g.moveTo(10.5, 5.5); g.lineTo(50, 4.4); g.stroke();
		/* feet: toes held together */
		g.lineWidth = 1.2;
		g.beginPath(); g.moveTo(52, 2.2); g.lineTo(57, 1.6); g.moveTo(50, 4.4); g.lineTo(55, 4.3); g.stroke();
		/* tail: short, square */
		g.fillStyle = P.tail;
		g.beginPath(); g.moveTo(14, -3.2); g.lineTo(27, -2.4); g.lineTo(27, 1.4); g.lineTo(14, 3); g.closePath(); g.fill();
		/* body: a long teardrop */
		g.beginPath();
		g.moveTo(-17, -1);
		g.bezierCurveTo(-14, -8, 6, -7.5, 18, -2.8);
		g.bezierCurveTo(19, 0.5, 14, 5.5, 6, 6.6);
		g.bezierCurveTo(-4, 7.6, -14, 6, -17, -1);
		g.closePath();
		if (style === 'A') {
			var gr = g.createLinearGradient(0, -7, 0, 7);
			gr.addColorStop(0, P.back); gr.addColorStop(0.55, P.back2); gr.addColorStop(1, P.belly);
			g.fillStyle = gr;
		} else { g.fillStyle = P.back; }
		g.fill();
		if (P.line) { g.strokeStyle = P.line; g.lineWidth = 0.6; g.stroke(); }
		/* belly streaks (A, B) */
		if (style !== 'C') {
			g.strokeStyle = style === 'A' ? 'rgba(236,231,221,.55)' : 'rgba(236,231,221,.45)'; g.lineWidth = 0.55;
			for (var i = 0; i < (style === 'A' ? 5 : 3); i++) { var x = -10 + i * 4; g.beginPath(); g.moveTo(x, 4.4); g.lineTo(x + 3, 5.6); g.stroke(); }
		}
		/* rusty thighs */
		g.fillStyle = P.thigh;
		g.beginPath(); g.ellipse(9.5, 4.6, 3.8, 1.9, 0.05, 0, TAU); g.fill();
		/* the folded neck: a slim S — forward and down from the shoulders,
		 * then back up under the head, which sits drawn in on the chest */
		var hx = -28, hy = -5.5 + nb;
		g.lineCap = 'round'; g.lineJoin = 'round';
		g.strokeStyle = P.neckBack; g.lineWidth = 6.2;
		g.beginPath(); g.moveTo(-12.5, -3); g.bezierCurveTo(-17, 3.4, -23.5, 5.6, -26.2, 0.6); g.lineTo(hx + 0.5, hy + 1); g.stroke();
		if (P.line) {
			g.strokeStyle = P.line; g.lineWidth = 0.55;
			g.beginPath(); g.moveTo(-14, 1.6); g.bezierCurveTo(-18.5, 6.8, -26, 8.8, -29, 2.6); g.stroke();
		}
		/* the pale streaked foreneck along the lower, front edge of the S */
		g.strokeStyle = P.neck; g.lineWidth = 2.5;
		g.beginPath(); g.moveTo(-14.5, 1.4); g.bezierCurveTo(-18.8, 6.2, -25.5, 8, -28.3, 2.4); g.stroke();
		if (P.streak) {
			g.strokeStyle = P.streak; g.lineWidth = style === 'A' ? 0.42 : 0.5;
			for (var s2 = 0; s2 < (style === 'A' ? 6 : 3); s2++) {
				var u = (s2 + 0.5) / (style === 'A' ? 6 : 3);
				/* points on the same bezier as the pale band */
				var v = 1 - u;
				var sx = v * v * v * -14.5 + 3 * v * v * u * -18.8 + 3 * v * u * u * -25.5 + u * u * u * -28.3;
				var sy = v * v * v * 1.4 + 3 * v * v * u * 6.2 + 3 * v * u * u * 8 + u * u * u * 2.4;
				g.beginPath(); g.moveTo(sx + 0.4, sy - 0.6); g.lineTo(sx - 0.2, sy + 0.6); g.stroke();
			}
		}
		/* the head */
		g.fillStyle = P.neckBack;
		g.beginPath(); g.ellipse(hx, hy, 5.2, 4.1, -0.12, 0, TAU); g.fill();
		/* white face: forehead, cheek and chin, not the whole head */
		g.fillStyle = P.face;
		g.beginPath(); g.ellipse(hx - 1.8, hy + 0.6, 3.5, 2.6, -0.2, 0, TAU); g.fill();
		/* black stripe above the eye, running back into the plumes */
		g.fillStyle = P.cap;
		g.beginPath();
		g.moveTo(hx - 4, hy - 1.4);
		g.quadraticCurveTo(hx, hy - 4.1, hx + 5, hy - 2.6);
		g.lineTo(hx + 4.8, hy - 1.2);
		g.quadraticCurveTo(hx, hy - 2.3, hx - 3.8, hy - 0.5);
		g.closePath(); g.fill();
		g.strokeStyle = P.cap; g.lineCap = 'round';
		g.lineWidth = style === 'A' ? 0.75 : 0.9;
		g.beginPath(); g.moveTo(hx + 4.2, hy - 2); g.quadraticCurveTo(hx + 9.5, hy - 3 + nb * 0.4, hx + 14.5, hy - 1 + nb * 0.6); g.stroke();
		if (style === 'A') { g.beginPath(); g.moveTo(hx + 4, hy - 1.5); g.quadraticCurveTo(hx + 8.5, hy - 1.8, hx + 12.5, hy + 0.5); g.stroke(); }
		/* the bill: long and heavy, a yellowish dagger — deep at the base,
		 * the culmen almost straight, the gape running back under the eye */
		var bx = hx - 3.6, by = hy + 0.6;
		g.beginPath();
		g.moveTo(bx + 0.8, by - 1.9);
		g.quadraticCurveTo(bx - 10, by - 1.5, bx - 24, by + 0.7);
		g.quadraticCurveTo(bx - 10, by + 1.9, bx + 0.8, by + 2);
		g.closePath();
		if (style === 'A') {
			var bg = g.createLinearGradient(0, by - 2, 0, by + 2);
			bg.addColorStop(0, P.billTop); bg.addColorStop(0.45, P.bill); bg.addColorStop(1, P.bill);
			g.fillStyle = bg;
		} else { g.fillStyle = P.bill; }
		g.fill();
		if (P.line) { g.strokeStyle = P.line; g.lineWidth = 0.45; g.stroke(); }
		/* the gape line */
		g.strokeStyle = style === 'C' ? 'rgba(60,45,20,.5)' : 'rgba(90,70,30,.6)'; g.lineWidth = 0.4;
		g.beginPath(); g.moveTo(bx + 1.2, by + 0.5); g.quadraticCurveTo(bx - 10, by + 0.6, bx - 21, by + 0.75); g.stroke();
		/* the eye: yellow, with a dark pupil */
		g.fillStyle = P.eye;
		g.beginPath(); g.arc(hx - 2.0, hy - 0.4, style === 'C' ? 1.15 : 1.05, 0, TAU); g.fill();
		g.fillStyle = '#111';
		g.beginPath(); g.arc(hx - 2.15, hy - 0.4, 0.5, 0, TAU); g.fill();
	}

	function drawFlying(g, pose, style, w) {
		var P = PAL[style], s = w / 100;
		g.save();
		g.scale(s, s);
		g.translate(0, pose.bob);
		var far = wingGeom(pose, true), near = wingGeom(pose, false);
		far.pose = pose; near.pose = pose;
		drawWing(g, far, P, style, true);
		drawBody(g, pose, P, style);
		drawWing(g, near, P, style, false);
		g.restore();
	}

	/* standing in the shallows (the landing sequence): neck up in an S,
	 * wings folded, long legs straight down */
	function drawStanding(g, style, w) {
		var P = PAL[style], s = w / 60;
		g.save(); g.scale(s, s);
		g.strokeStyle = P.leg; g.lineCap = 'round'; g.lineWidth = 1.5;
		g.beginPath(); g.moveTo(1, 8); g.lineTo(0, 30); g.moveTo(3.5, 8); g.lineTo(5, 30); g.stroke();
		g.fillStyle = P.thigh; g.beginPath(); g.ellipse(2.3, 7, 2.6, 2, 0, 0, TAU); g.fill();
		/* body, tilted, wings folded with dark primaries at the rear */
		g.save(); g.rotate(-0.55);
		g.beginPath(); g.ellipse(4, 0, 12, 5.6, 0, 0, TAU);
		g.fillStyle = P.back; g.fill();
		if (P.line) { g.strokeStyle = P.line; g.lineWidth = 0.6; g.stroke(); }
		g.fillStyle = P.prim; g.beginPath(); g.ellipse(10, 1.8, 7, 2.6, 0.1, 0, TAU); g.fill();
		g.fillStyle = P.cov; g.beginPath(); g.ellipse(3, -0.6, 9, 3.8, 0.05, 0, TAU); g.fill();
		g.strokeStyle = P.wrist; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-5, -2.6); g.lineTo(-1, -3.6); g.stroke();
		g.restore();
		/* neck: an S up to the head */
		g.strokeStyle = P.neckBack; g.lineWidth = 4.2;
		g.beginPath(); g.moveTo(-5, -4); g.bezierCurveTo(-12, -10, -2, -16, -7, -24); g.stroke();
		g.strokeStyle = P.neck; g.lineWidth = 2;
		g.beginPath(); g.moveTo(-6.8, -5); g.bezierCurveTo(-13, -10, -3.6, -16, -8.6, -23); g.stroke();
		if (P.streak) { g.strokeStyle = P.streak; g.lineWidth = 0.4; for (var i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-9.5 + i * 0.6, -8 - i * 3.6); g.lineTo(-10 + i * 0.6, -6.6 - i * 3.6); g.stroke(); } }
		var hx = -7.5, hy = -26;
		g.fillStyle = P.neckBack; g.beginPath(); g.ellipse(hx, hy, 3.6, 2.9, 0, 0, TAU); g.fill();
		g.fillStyle = P.face; g.beginPath(); g.ellipse(hx - 0.8, hy + 0.3, 2.9, 2.2, 0, 0, TAU); g.fill();
		g.fillStyle = P.cap; g.beginPath(); g.moveTo(hx - 2.6, hy - 1.2); g.quadraticCurveTo(hx, hy - 2.7, hx + 3.2, hy - 1.6); g.lineTo(hx + 3, hy - 0.8); g.quadraticCurveTo(hx, hy - 1.5, hx - 2.4, hy - 0.5); g.closePath(); g.fill();
		g.strokeStyle = P.cap; g.lineWidth = 0.6; g.beginPath(); g.moveTo(hx + 2.6, hy - 1.3); g.quadraticCurveTo(hx + 6, hy - 1, hx + 8.5, hy + 1.2); g.stroke();
		g.fillStyle = P.bill; g.beginPath(); g.moveTo(hx - 3, hy - 0.9); g.lineTo(hx - 17, hy + 0.6); g.lineTo(hx - 3, hy + 1.1); g.closePath(); g.fill();
		g.fillStyle = P.eye; g.beginPath(); g.arc(hx - 1.5, hy - 0.3, 0.8, 0, TAU); g.fill();
		g.fillStyle = '#111'; g.beginPath(); g.arc(hx - 1.6, hy - 0.3, 0.38, 0, TAU); g.fill();
		g.restore();
	}

	root.HeronLab = { beatPose: beatPose, GLIDE: GLIDE, Flight: Flight, drawFlying: drawFlying, drawStanding: drawStanding, STYLES: ['A', 'B', 'C'],
		NAMES: { A: 'A · Field guide (realistic)', B: 'B · Painted (stylised)', C: 'C · Silhouette+ (minimal)' } };
})(typeof window !== 'undefined' ? window : globalThis);
