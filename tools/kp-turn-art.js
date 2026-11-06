'use strict';
/**
 * DCC Seasons 4.17.0: the poult's TURN (Rob, 2026-11-06: "the poults turn
 * into flat 2-D cutouts while they turn"). The drawings for a real turn,
 * the source of the two options on Rob's review page. Nothing here is in
 * the plugin until he picks; the picked painter then moves into
 * art-thanksgiving.js (inside tkMod, so the worker can pre-draw it).
 *
 * Reference: the same NPS photograph the poult was traced from (big-f1.jpg,
 * public domain): the poult LEFT of the front one walks AWAY from the
 * camera at about three-quarters, so the photo shows a poult from behind:
 * the rounded rump, both folded wings draped over the flanks with their
 * long feathers trailing toward the viewer, the short tail under them, the
 * neck rising from the far shoulder and the back of the head, both legs
 * under the belly. Traced in that photo's pixels (crop 1440,1600, ~9.5 px
 * a unit) into the poult rig's units: feet on y = 65, the feet's centre on
 * x = 20 (the profile's pivot, KP_FX), so every frame of the turn pivots on
 * the same spot.
 *
 * kpTurnPaint(g, v, hd): v = 1 the rear three-quarter (facing AWAY, toward
 * +x, the rig's facing), v = 2 straight from behind; hd = 1 the head is
 * down, hidden in front of the body (option B: the turn made while pecking).
 * It uses the pack's own helpers (tkPath, tkJ, tkShingles, kpLeg, kpFuzz,
 * KP), so it must run INSIDE tkMod.
 */
const SRC = String.raw`
	function kpTurnPaint(g, v, hd) {
		var r = v === 2, i;
		/* the legs first: the belly's down covers the hips. From behind they
		 * stand side by side (the near one a little lower and paler), the
		 * toes pointing away, so foreshortened */
		var fA = r ? [16, KP_GROUND - 0.5, 0] : [13.5, KP_GROUND - 0.5, 0], fB = r ? [24, KP_GROUND - 0.5, 0] : [25.5, KP_GROUND - 0.5, 0];
		kpLeg(g, r ? [16.5, 38] : [15, 37.5], fA, 0, KP.leg2, 11, 14, 0.82);
		kpLeg(g, r ? [23.5, 38] : [23.5, 38.5], fB, 0, KP.leg, 11, 14, 0.82);
		g.save();
		if (hd) { g.translate(20, 40); g.rotate(r ? 0 : -0.12); g.translate(-20, -40); }
		/* the body from behind: the rounded rump, wider at the shoulders */
		var B = r ? [[8, 15], [13, 11.5], [20, 10.6], [27, 11.5], [32, 15], [34.6, 21], [34, 28], [31, 33.6], [26, 37.4], [20, 38.6], [14, 37.4], [9, 33.6], [6, 28], [5.4, 21]]
			: [[3, 19.5], [6.5, 15], [12.1, 11.4], [18.4, 10.4], [25.8, 11.6], [33.2, 13.7], [37.4, 16.4], [40.5, 20.5], [40.5, 26.5], [38.4, 31.2], [34.2, 34.8], [27, 37.4], [19, 38.2], [12.4, 36.6], [7.8, 33.2], [4.6, 28.5], [3, 24]];
		var bg = g.createLinearGradient(0, 10, 0, 39); bg.addColorStop(0, '#46342A'); bg.addColorStop(0.55, '#4C3E32'); bg.addColorStop(1, '#5E5246');   /* the rump: the photo's dark grey-brown down */
		g.beginPath(); tkPath(g, B, true); g.fillStyle = bg; g.fill();
		g.save(); g.beginPath(); tkPath(g, B, true); g.clip();
		/* the back between the wings: the profile's own small shingled rows,
		 * flowing from the neck's base toward the viewer */
		g.save(); g.beginPath(); if (r) { g.ellipse(20, 10, 15, 14, 0, 0, Math.PI * 2); } else { g.ellipse(31, 9, 17, 14, -0.15, 0, Math.PI * 2); } g.clip();
		if (r) { tkShingles(g, [20, 6], 6, 24, 0.95, 2.2, 2, 1200, true); }
		else { tkShingles(g, [35, 7], 6, 30, 1.5, 2.7, 2, 1240, true); }
		g.restore();
		/* the light from upper left, as on the profile: the far side in shade */
		var sg = r ? g.createLinearGradient(6, 0, 35, 0) : g.createLinearGradient(-3, 0, 41, 0);
		sg.addColorStop(0, 'rgba(255,240,215,.08)'); sg.addColorStop(0.6, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(24,16,10,.3)');
		g.fillStyle = sg; g.fillRect(-6, 8, 52, 34);
		/* the rump's down: fine short streaks, darker and paler, as the
		 * photo's grey-brown under the wings */
		for (i = 0; i < 90; i++) { var dx = (r ? 7 : 4) + tkJ(i + 1600) * (r ? 26 : 35), dy = 20 + tkJ(i + 1700) * 18, da = 1.3 + (tkJ(i + 1800) - 0.5) * 0.8;
			g.strokeStyle = tkJ(i + 1900) < 0.5 ? 'rgba(52,40,30,.35)' : 'rgba(150,132,112,.3)'; g.lineWidth = 0.35;
			g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + Math.cos(da) * 1.6, dy + Math.sin(da) * 1.6); g.stroke(); }
		var dg = g.createLinearGradient(0, 29, 0, 39); dg.addColorStop(0, 'rgba(120,104,88,0)'); dg.addColorStop(1, 'rgba(150,134,116,.5)');
		g.fillStyle = dg; g.fillRect(-4, 27, 48, 14);
		g.restore();
		/* the folded wings, draped over the flanks like a cape: broad long
		 * feathers, barred across, edged pale on the lit side, each laid
		 * over the one behind it, the tips trailing toward the viewer and
		 * past the body's edge, as the photo shows them */
		var WS = r ? [[[16, 14], 1.95, 2.6, 21, 6, 0], [[24, 14], 1.19, 0.54, 21, 6, 1]] : [[[25, 13.5], 2.25, 2.92, 29, 7, 0], [[37.5, 17], 1.62, 1.3, 15, 3, 1]];
		for (var w = 0; w < WS.length; w++) {
			var S = WS[w][0], A0 = WS[w][1], A1 = WS[w][2], L0 = WS[w][3], n = WS[w][4], shade = WS[w][5] && !r;
			for (i = n - 1; i >= 0; i--) {
				var q = n > 1 ? i / (n - 1) : 0, ang = A0 + (A1 - A0) * q + (tkJ(i + 1290 + w * 20) - 0.5) * 0.05;
				var L = L0 - q * L0 * 0.32 + (tkJ(i + 1300 + w * 20) - 0.5) * 1.6, wd = (r ? 2.6 : shade ? 2 : 2.9) + tkJ(i + 1310 + w * 20) * 0.5;
				var x0 = S[0] + Math.cos(ang) * 2, y0 = S[1] + Math.sin(ang) * 2 + q * 1.2;
				var ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy * wd, ny = ux * wd, ex = x0 + ux * L, ey = y0 + uy * L;
				var fg = g.createLinearGradient(x0 - nx, y0 - ny, x0 + nx, y0 + ny);
				fg.addColorStop(0, shade ? '#54443A' : '#7A6856'); fg.addColorStop(0.5, shade ? '#3E3228' : '#5A4A3C'); fg.addColorStop(1, shade ? '#2E241C' : '#3E3228');
				g.save(); g.shadowColor = 'rgba(20,14,10,.45)'; g.shadowBlur = 0.9 * (g.getTransform ? Math.abs(g.getTransform().a) : 4); g.shadowOffsetY = 0.3 * (g.getTransform ? Math.abs(g.getTransform().a) : 4);
				g.fillStyle = fg; g.beginPath(); g.moveTo(x0 - nx * 0.7, y0 - ny * 0.7);
				g.bezierCurveTo(x0 - nx * 1.15 + ux * L * 0.4, y0 - ny * 1.15 + uy * L * 0.4, ex - nx * 0.9 - ux * 1.5, ey - ny * 0.9 - uy * 1.5, ex, ey);
				g.bezierCurveTo(ex + nx * 0.9 - ux * 1.5, ey + ny * 0.9 - uy * 1.5, x0 + nx * 1.1 + ux * L * 0.4, y0 + ny * 1.1 + uy * L * 0.4, x0 + nx * 0.7, y0 + ny * 0.7);
				g.closePath(); g.fill(); g.restore();
				/* the bars across it, following the feather's own curve */
				g.save(); g.clip();
				g.strokeStyle = 'rgba(40,28,20,' + (shade ? 0.3 : 0.38) + ')'; g.lineWidth = 0.55;
				for (var k = 1; k < 6; k++) { var t = 0.2 + k * 0.13, bx = x0 + ux * L * t, by = y0 + uy * L * t;
					g.beginPath(); g.moveTo(bx - nx * 1.2, by - ny * 1.2); g.quadraticCurveTo(bx + ux * 0.6, by + uy * 0.6, bx + nx * 1.2, by + ny * 1.2); g.stroke(); }
				g.restore();
				/* the pale edge on the side the light comes from */
				g.strokeStyle = 'rgba(222,208,186,' + (shade ? 0.28 : 0.55 + tkJ(i + 1330 + w * 20) * 0.25).toFixed(2) + ')'; g.lineWidth = 0.45;
				g.beginPath(); g.moveTo(x0 - nx * 0.7, y0 - ny * 0.7); g.bezierCurveTo(x0 - nx * 1.15 + ux * L * 0.4, y0 - ny * 1.15 + uy * L * 0.4, ex - nx * 0.9 - ux * 1.5, ey - ny * 0.9 - uy * 1.5, ex, ey); g.stroke();
			}
		}
		/* the coverts over the shoulders, buff-tipped */
		g.save(); g.beginPath();
		if (r) { tkPath(g, [[11, 13], [20, 11.5], [29, 13], [27, 18.5], [20, 19.5], [13, 18.5]], true); }
		else { tkPath(g, [[16, 12], [27, 11.6], [35, 14.4], [31, 19.5], [20, 19.6]], true); }
		g.fillStyle = '#4A3828'; g.fill(); g.clip();
		tkShingles(g, r ? [20, 6] : [34, 6], 4, 16, r ? 0.6 : 1.6, r ? 2.55 : 3.1, 2.2, 1360, true); g.restore();
		/* the downy edge of the belly between the legs */
		kpFuzz(g, r ? [[31, 33.6], [26, 37.4], [20, 38.6], [14, 37.4], [9, 33.6]] : [[34.2, 34.8], [27, 37.4], [19, 38.2], [12.4, 36.6], [7.8, 33.2]], -1, 22, 'rgba(176,160,140,.5)', 1.1, 1380);
		/* the neck and the back of the head (none while the head is down:
		 * from behind a feeding poult is its rump) */
		if (!hd) {
			var nb = r ? [20, 14] : [38.4, 15], hx = r ? 20 : 41, hy = r ? 2.6 : 2.4, NL = [], NR = [];
			for (i = 0; i <= 8; i++) {
				var u = i / 8, px = nb[0] + (hx - nb[0]) * u + (r ? 0 : Math.sin(u * Math.PI) * 1.2), py = nb[1] + (hy - nb[1]) * u, wv = 3.5 - 1.6 * u;
				NL.push([px - wv, py]); NR.push([px + wv, py]);
			}
			var ng = g.createLinearGradient(nb[0], nb[1], hx, hy); ng.addColorStop(0, '#8C7C68'); ng.addColorStop(0.5, KP.neck); ng.addColorStop(1, '#C2B6A6');
			g.fillStyle = ng; g.beginPath(); tkPath(g, NL.concat(NR.slice().reverse()), true); g.fill();
			g.strokeStyle = 'rgba(110,92,74,.32)'; g.lineWidth = 0.22;
			for (i = 0; i < 16; i++) { var sv = tkJ(i + 1400) * 2 - 1, j2 = Math.min(7, Math.floor(tkJ(i + 1420) * 8)), xa = (NL[j2][0] + NR[j2][0]) / 2 + sv * 2, ya = NL[j2][1];
				g.beginPath(); g.moveTo(xa, ya); g.lineTo(xa + sv * 0.3, ya - 1.6); g.stroke(); }
			kpFuzz(g, NL, -1, 12, 'rgba(190,178,162,.55)', 0.8, 1440); kpFuzz(g, NR, 1, 12, 'rgba(150,134,116,.5)', 0.8, 1460);
			/* the head from behind: round, the crown speckled dark, a sliver of
			 * the cheek and the pale eye ring at the edge on the three-quarter */
			g.save(); g.translate(hx, hy);
			var hg = g.createRadialGradient(-1.2, -1.4, 0.5, 0, 0, 5); hg.addColorStop(0, '#CEC2B2'); hg.addColorStop(1, '#A89A88');
			g.fillStyle = hg; g.beginPath(); g.ellipse(0, 0, 4.3, 4, 0, 0, Math.PI * 2); g.fill();
			kpFuzz(g, [[-4, 1.5], [-3.4, -2.2], [0, -3.9], [3.4, -2.2], [4, 1.5]], -1, 12, 'rgba(176,160,140,.55)', 0.7, 1480);
			g.fillStyle = 'rgba(132,104,78,.7)'; g.beginPath(); g.ellipse(0, -1.6, 3.2, 2, 0, 0, Math.PI * 2); g.fill();
			g.fillStyle = 'rgba(70,52,38,.75)';
			g.fillStyle = 'rgba(70,52,38,.5)'; for (i = 0; i < 6; i++) { g.beginPath(); g.arc(-2.4 + tkJ(i + 1500) * 4.8, -2.8 + tkJ(i + 1510) * 1.8, 0.18 + tkJ(i + 1520) * 0.14, 0, Math.PI * 2); g.fill(); }
			if (!r) {
				g.fillStyle = '#E8DED2'; g.beginPath(); g.ellipse(3.9, -0.3, 0.7, 1.5, 0, 0, Math.PI * 2); g.fill();   /* the eye ring's edge */
				g.fillStyle = KP.beak; g.beginPath(); g.moveTo(4, 0.8); g.quadraticCurveTo(5.6, 1.4, 5.5, 2.2); g.quadraticCurveTo(4.6, 2.2, 3.8, 1.9); g.closePath(); g.fill();   /* the bill's base */
			}
			g.restore();
		}
		g.restore();
	}`;
module.exports = { SRC };
