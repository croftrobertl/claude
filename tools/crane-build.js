'use strict';
/**
 * DCC Seasons — write the sandhill crane's art pack (4.13.5),
 * dcc-seasons/assets/js/art-crane.js, from the painter Rob approved
 * (tools/anniv-crane3.js: DC3_SRC, the jointed painter, and DANCE_SRC, the
 * dance) and the rig (tools/anniv-crane-rig.js, the poses at one body
 * scale). The pack is shared: the Anniversary's dance and the Florida Keys
 * `cranes` scene both draw this bird. The engine merges it into ART.crane.
 *
 * The art is edited in the tools (the labs and sheets draw the same
 * functions) and this file is regenerated; never edit art-crane.js by hand.
 *
 *   node tools/crane-build.js          (writes the pack)
 *   node tools/crane-build.js --check  (exits 1 if the pack is stale)
 */
const fs = require('fs');
const path = require('path');
const { DC3_SRC, DANCE_SRC } = require('./anniv-crane3');
const { RIG } = require('./anniv-crane-rig');
const OUT = path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'art-crane.js');

/* the rig at 4 decimals (a bird unit is the standing height: 1e-4 of 76 px) */
const r4 = v => (Array.isArray(v) ? v.map(r4) : (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, r4(b)])) : v)));
const ind = (s, t) => s.split('\n').map(l => (l ? t + l : l)).join('\n');

const BODY = String.raw`
var RIG = ${JSON.stringify(r4(RIG))};
/* one light for every pose: above and a little toward the bird's front */
var L0 = [0.3, -0.954], F = dcFrames(RIG);
/* a body frame's box in bird units, from its geometry (no pixel reads):
 * the outline, the wings, the plumes and the bill, plus room for the
 * soft shadows and strokes. The legs are drawn live, outside it. */
function crBox(U) {
	var P = c3Out(U).concat(U.plB, U.plT, U.billU, U.billL), b = [1e9, 1e9, -1e9, -1e9], i, w, q;
	for (w = 0; w < 2; w++) { var Wg = U[w ? 'wb' : 'wa']; for (q in { lead: 1, base: 1, tips: 1, inner: 1 }) { P = P.concat(Wg[q]); } }
	for (i = 0; i < P.length; i++) { b[0] = Math.min(b[0], P[i][0]); b[1] = Math.min(b[1], P[i][1]); b[2] = Math.max(b[2], P[i][0]); b[3] = Math.max(b[3], P[i][1]); }
	return [b[0] - 0.05, b[1] - 0.05, b[2] + 0.05, b[3] + 0.05];
}
function crNoLegs(U) { var V = {}, k; for (k in U) { V[k] = U[k]; } V.noLegs = 1; return V; }
/* paint dance frame i into canvas c (a canvas or an OffscreenCanvas) at k
 * px per bird unit, graded to the scene's light; returns its box */
function crFrame(c, i, k, grade) {
	var U = crNoLegs(F[i].U), b = crBox(U);
	c.width = Math.ceil((b[2] - b[0]) * k); c.height = Math.ceil((b[3] - b[1]) * k);
	var g = c.getContext('2d');
	g.setTransform(k, 0, 0, k, -b[0] * k, -b[1] * k);
	dc3Paint(g, U, L0[0], L0[1]);
	/* the scene's light (Art Standards step 6), over the bird's own pixels */
	if (grade) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = grade; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
	return { box: b };
}
/* a whole key pose (legs included), facing f, at k px per bird unit, for
 * the Keys scene; its box is in bird units about the feet */
function crKey(c, name, k, f) {
	var U = RIG[name], b = crBox(U), i, L;
	for (L = 0; L < 2; L++) { var lg = U[L ? 'legF' : 'legN']; for (i = 0; i < lg.p.length; i++) { b[1] = Math.min(b[1], lg.p[i][1] - 0.03); b[3] = Math.max(b[3], lg.p[i][1] + 0.03); b[0] = Math.min(b[0], lg.p[i][0] - 0.03); b[2] = Math.max(b[2], lg.p[i][0] + 0.03); } for (i = 0; i < lg.toes.length; i++) { b[0] = Math.min(b[0], lg.toes[i][0] - 0.03); b[2] = Math.max(b[2], lg.toes[i][0] + 0.03); b[3] = Math.max(b[3], lg.toes[i][1] + 0.03); } }
	b[3] += 0.03;   /* the contact shadow */
	var bf = f > 0 ? b : [-b[2], b[1], -b[0], b[3]];
	c.width = Math.ceil((bf[2] - bf[0]) * k); c.height = Math.ceil((bf[3] - bf[1]) * k);
	var g = c.getContext('2d');
	g.setTransform(k * f, 0, 0, k, -bf[0] * k, -bf[1] * k);
	dc3Paint(g, U, L0[0], L0[1]);
	return { box: bf };
}
/* the whole dance's box for one bird facing +x, in bird units: every
 * frame where the cycle puts it (lifted to the top of the leap), the feet */
function crDanceBox() {
	var b = [1e9, 1e9, -1e9, -1e9], T = 0, i, t;
	for (i = 0; i < DC_CYC.length; i++) { T += DC_CYC[i][2]; }
	for (t = 0; t < T; t += 1 / 30) {
		var st = dcAt(F, t), fb = crBox(F[st.fi].U);
		b[0] = Math.min(b[0], st.root + fb[0]); b[1] = Math.min(b[1], st.dy + fb[1]); b[2] = Math.max(b[2], st.root + fb[2]); b[3] = Math.max(b[3], st.dy + fb[3]);
		for (i = 0; i < 2; i++) { b[0] = Math.min(b[0], st.feet[i][0] - 0.1); b[2] = Math.max(b[2], st.feet[i][0] + 0.1); b[3] = Math.max(b[3], st.feet[i][1] + 0.03); }
	}
	return b;
}
return [crFrame, crKey, F, dcAt, dcDraw, L0, crDanceBox, crBox];`;

const MANAGER = String.raw`
var M = crMod(), FR = M[2];
/* the pre-draw (as the tom's, 4.13.2): in a WORKER where the browser has
 * OffscreenCanvas, so no frame ever pays for it; the bitmaps come back
 * transferred and become ordinary canvases in idle time. No worker, no
 * OffscreenCanvas, or an error: one pose per idle moment on the page's
 * thread. Never inside a frame. Jobs: ['f', i] a dance frame, ['k', name,
 * face] a whole key pose. */
function later(f) { if (W.requestIdleCallback) { W.requestIdleCallback(f, { timeout: 2000 }); } else { setTimeout(f, 50); } }
function key(j) { return j[0] + j[1] + (j[2] || ''); }
function prep(jobs, o, done) {
	var cache = {}, todo = jobs.slice(), wk, ms = 0, bytes = 0, st = { cache: cache, done: false, ms: 0, bytes: 0, worker: false };
	function store(j, m) { cache[key(j)] = m; bytes += m.c.width * m.c.height * 4; }
	function finish() {
		later(function () {
			/* one throwaway draw of each canvas, so no first drawImage lands in
			 * the scene's first frame (as the Christmas sleigh's, 4.14.0: it
			 * measured 9-10 ms on that frame at 4x CPU before) */
			var wc = W.document.createElement('canvas'); wc.width = wc.height = 2;
			var wg = wc.getContext('2d');
			for (var q in cache) {
				var m = cache[q], c = m.c;
				if (c.close) { c = W.document.createElement('canvas'); c.width = m.c.width; c.height = m.c.height; c.getContext('2d').drawImage(m.c, 0, 0); m.c.close(); m.c = c; }
				c.getContext('2d').getImageData(0, 0, 1, 1);   /* rasterised now, not in its first frame */
				if (wg) { wg.drawImage(c, 0, 0, 1, 1); }
			}
			st.done = true; st.ms = ms; st.bytes = bytes;
			if (done) { done(st); }
		});
	}
	function one(j) {
		var t0 = W.performance.now(), c = W.document.createElement('canvas'), m = j[0] === 'f' ? M[0](c, j[1], o.k, o.grade) : M[1](c, j[1], o.k, j[2]);
		m.c = c; ms += W.performance.now() - t0; store(j, m);
	}
	function idle() { var j = todo.shift(); if (j) { one(j); } if (todo.length) { later(idle); } else { finish(); } }
	function fall() { if (wk) { wk.terminate(); wk = 0; } later(idle); }
	later(function () {
		try {
			wk = new W.Worker(URL.createObjectURL(new Blob(['var M=(' + crMod + ')();onmessage=function(e){var o=e.data[0];e.data[1].forEach(function(j){var t0=performance.now(),c=new OffscreenCanvas(1,1),m=j[0]==="f"?M[0](c,j[1],o.k,o.grade):M[1](c,j[1],o.k,j[2]);m.ms=performance.now()-t0;m.c=c.transferToImageBitmap();postMessage([j,m],[m.c])})}'])));
			st.worker = true;
			wk.onmessage = function (e) {
				var j = e.data[0], m = e.data[1], i;
				ms += m.ms; store(j, m);
				for (i = 0; i < todo.length; i++) { if (key(todo[i]) === key(j)) { todo.splice(i, 1); break; } }
				if (!todo.length) { wk.terminate(); wk = 0; finish(); }
			};
			wk.onerror = fall;
			wk.postMessage([o, todo.slice()]);
		} catch (e) { st.worker = false; later(idle); }
	});
	return st;
}
/* the dance's frames, every one: what the Anniversary pre-draws */
function danceJobs() { var j = [], i; for (i = 0; i < FR.length; i++) { j.push(['f', i]); } return j; }
/* one bird of the dance at time t (s into its cycle), in its own frame:
 * the caller has put its feet at the origin, facing +x, one bird unit to
 * its standing height. Its legs and shadow are live; the body is the
 * pre-drawn frame. Nothing is drawn (false) for a frame not ready. */
function dance(g, S, t) {
	var st = M[3](FR, t), fr = S.cache['f' + st.fi];
	if (!fr) { return false; }
	M[4](g, FR, st, M[5][0], M[5][1], fr.c, fr.box);
	return true;
}
W.DCCSeasonsArt = W.DCCSeasonsArt || {};
W.DCCSeasonsArt.crane = { svgs: {}, crane: { mod: crMod, M: M, prep: prep, danceJobs: danceJobs, dance: dance, danceBox: M[6](), cycle: 5.4 } };`;

const src = `/* DCC Seasons — the sandhill crane (4.13.5): the jointed painter Rob
 * approved, its rig at one body scale and the dance, shared by the
 * Anniversary's pair and the Florida Keys \`cranes\` scene. The loader
 * fetches it only on their days (CFG.art), before the engine, which reads
 * it as ART.crane.
 *
 * GENERATED by tools/crane-build.js from tools/anniv-crane3.js and
 * tools/anniv-crane-rig.js. Do not edit here: edit those and regenerate. */
(function (W) {
	'use strict';
	/* crMod's own source is the pre-draw worker's (as the tom's tkMod) */
	function crMod() {
${ind(DC3_SRC.trim() + '\n' + DANCE_SRC.trim() + '\n' + BODY.trim(), '\t\t')}
	}
${ind(MANAGER.trim(), '\t')}
}(window));
`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== src) { console.error('art-crane.js is stale: run node tools/crane-build.js'); process.exit(1); }
  console.log('art-crane.js is current');
} else {
  fs.writeFileSync(OUT, src);
  console.log(OUT, src.length, 'bytes');
}
