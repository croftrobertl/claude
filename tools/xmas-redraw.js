'use strict';
/**
 * DCC Seasons — 4.14.0 CHRISTMAS, STEP 1 REDRAWN: still drawings for Rob.
 *
 * Rob rejected the first step-1 sheets' drawing quality (2026-10-23): the
 * reindeer "tube-shaped", the run "like South Park kids walking", Santa
 * with "a Metallica beard". Everything here is drawn again to the standard
 * of the Halloween witch and the heron (PROJECT-NOTES.md): real anatomy from
 * reference, a true gallop cycle, gradients and separate shapes, legible at
 * guest size. Still only: nothing moves and nothing is in the plugin until
 * Rob approves these.
 *
 * Rob's picks, applied: ornaments A (red, gold, blue glass balls); candy cane
 * B (red, white and green, wrapping continuously, no sliver, no pink line);
 * flamingo C with the second leg folded in the "figure 4"; wreath A (bow at
 * the bottom, five berries, tails whole); the bokeh layer removed; the sleigh
 * stays LIT over the moon, only the team goes dark; Santa holds the reins and
 * flicks them, the snap rippling down to the lead reindeer.
 *
 * The palette and the real moon painter are READ OUT OF engine.js.
 *
 *   node tools/xmas-redraw.js
 *
 * Writes, into build/:
 *   Seasons - 4.14.0 step 1 round 3 pieces.png
 *   Seasons - 4.14.0 step 1 round 3 santa scene.png
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js');
const OUT = path.join(ROOT, 'build');

function braceBlock(src, from) {
  const i = src.indexOf('{', from);
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; } else if (src[j] === '}') { d--; if (!d) { return src.slice(from, j + 1); } }
  }
  throw new Error('unbalanced');
}
function readEngine() {
  const src = fs.readFileSync(ENGINE, 'utf8');
  const PAL = JSON.parse(src.match(/var PAL = (\{[\s\S]*?\});/)[1]);
  const SVGS = new Function(`${src.match(/var SVGS = \{[\s\S]*?\n\t\};/)[0]}\nreturn SVGS;`)();
  const mStart = src.indexOf('var MARIA = [');
  const mp = braceBlock(src, src.indexOf('function moonPaint'));
  const MOON_SRC = [
    'var D = document, MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, mn = MT.min, mx2 = MT.max, atan2 = MT.atan2, sqrt = MT.sqrt;',
    src.slice(mStart, src.indexOf(mp) + mp.length),
  ].join('\n');
  return { PAL, SVGS, MOON_SRC };
}
function svgData(raw, PAL) {
  if (typeof raw === 'function') { raw = raw(); }
  const cut = raw.indexOf('|');
  const [w, h] = raw.slice(0, cut).split(' ').map(Number);
  const body = raw.slice(cut + 1).replace(/%([a-x])/g, (m, k) => PAL[k] || '#f0f');
  return { w, h, url: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`) };
}

/* ---- the scene: Santa, the sleigh and the team, drawn --------------------
 * Everything below runs in the page. Units: the reindeer is drawn in a frame
 * where its body (chest to rump) is 60 units and L scales it; the sleigh in
 * a frame 100 units long. */
const SCENE = `
var lerp = function (a, b, t) { return a + (b - a) * t; };
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
/* a smooth, cyclic interpolation through keyframes K = [[phase, [angles]]]
 * — Catmull-Rom on the phase, so joints never snap between keys */
function keyAt(K, p) {
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
/* THE GALLOP, from Muybridge's horse and deer plates (a transverse gallop,
 * right lead): each leg is on the ground for ~35% of the stride, the
 * footfalls run left hind, right hind, left fore, right fore, and after the
 * leading fore lifts all four are in the air, gathered under the body.
 * Angles are from straight down, positive toward the head; each key is
 * [upper, middle, cannon, pastern]. The fore leg's middle joint (the knee)
 * bends backward; the hind leg's middle joint (the hock) bends FORWARD —
 * the stifle above it bends the other way, which is the deer's reverse
 * knee. */
var FORE = [
  [0.00, [0.50, 0.45, 0.35, 0.25]],     /* touchdown, reaching */
  [0.17, [0.08, 0.02, -0.02, -0.15]],   /* under the shoulder, nearly straight */
  [0.35, [-0.45, -0.55, -0.65, -0.85]], /* lift-off, trailing */
  [0.50, [-0.40, -0.95, -2.70, -2.90]], /* the knee folded, the hoof tucked up behind it */
  [0.68, [0.20, -0.35, -1.90, -2.00]],  /* swinging forward, still folded */
  [0.85, [0.60, 0.40, -0.45, -0.30]],   /* the reach, the hoof about to flip forward */
];
var HIND = [
  [0.00, [0.95, -0.10, 0.50, 0.40]],    /* touchdown well under the belly */
  [0.17, [0.60, -0.50, 0.15, 0.05]],
  [0.35, [-0.10, -1.00, -0.50, -0.70]], /* the push-off, extended back */
  [0.50, [0.15, -1.35, -0.10, -0.30]],  /* the hock flexed, the hoof hanging */
  [0.68, [0.60, -1.10, 0.30, 0.20]],    /* swinging forward */
  [0.85, [1.00, -0.45, 0.30, 0.30]],    /* reaching */
];
var LEG_OFF = { lh: 0, rh: 0.10, lf: 0.28, rf: 0.40 };
/* A reindeer (Rangifer) in profile, facing +x, origin mid-body, the hooves
 * about 55 units below it at a stand. ph is the stride phase. dark draws
 * the whole animal as one silhouette. */
var RC = {
  back: '#86674A', back2: '#6E5239', belly: '#5C4430', leg: '#4A3627', legHi: '#5E4835',
  fback: '#6A5039', fback2: '#553F2C', fbelly: '#473424', fleg: '#3A2A1E', fpale: '#CDC3B2', fpale2: '#B5A994',
  pale: '#EEE6D6', pale2: '#D5C8B2', mane: '#F2ECDF', antler: '#B59B7B', antler2: '#7A5F43',
  hoof: '#2A2320', eye: '#1A1512', nose: '#2A2220', dark: '#1B130D',
};
/* a leg as ONE smooth tapered shape round its joint chain: wide where the
 * thigh or arm roots in the body, the muscle of the gaskin / forearm
 * swelling below the stifle / elbow, then a slender cannon to the fetlock
 * and the hoof. No joint knobs: the taper carries the joints. */
function deerLeg(g, x0, y0, K, p, near, dark, hind, far) {
  var a = keyAt(K, p), len = hind ? [17, 20, 18, 5] : [13, 20, 18, 5];
  var J = [[x0, y0]], x = x0, y = y0, i;
  for (i = 0; i < 4; i++) { x += sin(a[i]) * len[i]; y += cos(a[i]) * len[i]; J.push([x, y]); }
  /* the centre line with its widths: root, (mid-thigh), stifle/elbow,
   * (the muscle), hock/knee, fetlock, the hoof top */
  var W = hind ? [8.4, 7.4, 6.0, 5.2, 2.7, 2.2, 2.4] : [7.0, 6.0, 5.0, 4.4, 2.5, 2.1, 2.3];
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
  if (dark) { g.fillStyle = RC.dark; }
  else {
    var lg = g.createLinearGradient(J[0][0], J[0][1], J[4][0], J[4][1]);
    lg.addColorStop(0, far ? RC.fback2 : RC.back2); lg.addColorStop(0.45, far ? RC.fleg : (near ? RC.legHi : RC.leg)); lg.addColorStop(1, far ? RC.fleg : RC.leg);
    g.fillStyle = lg;
  }
  g.fill();
  /* a broad cloven hoof, splayed with the pastern */
  g.save(); g.translate(J[4][0], J[4][1]); g.rotate(-a[3]);
  g.fillStyle = dark ? RC.dark : RC.hoof;
  g.beginPath(); g.moveTo(-2.6, -1.2); g.lineTo(2.8, -1.2); g.lineTo(3.6, 3.2); g.quadraticCurveTo(0, 4.2, -3.2, 3.2); g.closePath(); g.fill();
  if (!dark) { g.strokeStyle = RC.pale2; g.lineWidth = 0.5; g.beginPath(); g.moveTo(0.3, -0.4); g.lineTo(0.4, 3.2); g.stroke(); }
  g.restore();
}
/* The reindeer. L = the body length (chest to rump = 60 units scaled), ph
 * the stride phase, dark = one silhouette, far = the animal behind its
 * partner (a shade darker), nose = a red nose with a glow (Rob's row A). */
function deer(g, L, ph, dark, far, nose) {
  var s = L / 60;
  g.save(); g.scale(s, s);
  var bob = -3.2 * cos((ph - 0.85) * TAU);
  var pitch = 0.06 * sin((ph - 0.25) * TAU);
  var arch = 0.5 + 0.5 * cos((ph - 0.9) * TAU);
  var pump = 0.14 * sin((ph - 0.35) * TAU);
  g.translate(0, bob); g.rotate(-pitch);
  g.lineCap = 'round'; g.lineJoin = 'round';
  var cBack = far ? RC.fback : RC.back, cBack2 = far ? RC.fback2 : RC.back2, cBelly = far ? RC.fbelly : RC.belly;
  /* far legs first */
  deerLeg(g, -21, -4, HIND, ph - LEG_OFF.rh, false, dark, true, far);
  deerLeg(g, 17, -1, FORE, ph - LEG_OFF.rf, false, dark, false, far);
  /* the head's place: the neck runs from the withers to it and pumps */
  var hx = 50 + 2 * pump, hy = -38 + 16 * pump;      /* the head's base (where the neck meets the skull) */
  /* ONE outline for the neck and body, so there is no seam: the top line
   * runs from the rump over the hump and up the neck's crest to the head,
   * the under line from the throat down the chest and along the belly */
  var top = -20 - arch * 3, ty = -2 + arch * 2;
  g.beginPath();
  g.moveTo(-26, -17);                                            /* the rump top */
  g.bezierCurveTo(-16, -17, -6, top + 2, 6, top);                /* the back */
  g.bezierCurveTo(14, top - 2, 22, top - 1, 28, -13);            /* the hump, down to the crest root */
  g.bezierCurveTo(34, -20, 42, -30, hx, hy - 4);                 /* the crest up to the head */
  g.lineTo(hx + 3, hy + 4);                                      /* across the neck at the skull */
  g.bezierCurveTo(44, -22, 36, -8, 31, 0);                       /* the throat down to the chest */
  g.bezierCurveTo(32, 8, 29, 12, 22, 13);                        /* the deep chest */
  g.bezierCurveTo(12, 15, 4, 9 + ty, -8, 6 + ty);                /* the belly to the waist */
  g.bezierCurveTo(-16, 5 + ty, -24, 8, -31, 2);                  /* the flank to the rump */
  g.bezierCurveTo(-35, -6, -33, -16, -26, -17);                  /* the rump */
  g.closePath();
  if (dark) { g.fillStyle = RC.dark; g.fill(); }
  else {
    var gr = g.createLinearGradient(0, -26, 0, 14);
    gr.addColorStop(0, cBack); gr.addColorStop(0.6, cBack2); gr.addColorStop(1, cBelly);
    g.fillStyle = gr; g.fill();
    /* the shoulder, wrapping the base of the neck */
    g.fillStyle = cBack2; g.globalAlpha = 0.5;
    g.beginPath(); g.ellipse(23, -4, 9, 9, 0.3, 0, TAU); g.fill(); g.globalAlpha = 1;
    /* the pale belly and the white rump patch */
    g.fillStyle = far ? RC.fpale2 : RC.pale2;
    g.beginPath(); g.moveTo(20, 12); g.bezierCurveTo(12, 14.5, 4, 8.5 + ty, -8, 5.5 + ty); g.bezierCurveTo(-14, 5 + ty, -20, 7, -26, 4);
    g.bezierCurveTo(-18, 2, -10, 1 + ty, -4, 2 + ty); g.bezierCurveTo(6, 4, 14, 8, 20, 12); g.closePath(); g.fill();
    g.fillStyle = far ? RC.fpale : RC.pale;
    g.beginPath(); g.moveTo(-31, 2); g.bezierCurveTo(-35, -6, -33, -14, -28, -16); g.bezierCurveTo(-30, -10, -29, -3, -26, 2); g.closePath(); g.fill();
    /* the pale mane hanging under the throat, in soft locks */
    g.fillStyle = far ? RC.fpale : RC.mane;
    g.beginPath(); g.moveTo(hx + 2, hy + 5);
    for (var m = 0; m < 5; m++) { var mx = lerp(hx + 2, 31, (m + 1) / 5.2), my = lerp(hy + 5, 0, (m + 1) / 5.2); g.quadraticCurveTo(mx + 1.5, my + 4.2, mx - 1.5, my + 1.6); }
    g.lineTo(31, 0); g.bezierCurveTo(36, -8, 44, -22, hx + 3, hy + 4); g.closePath(); g.fill();
    /* the haunch */
    g.fillStyle = cBack2; g.globalAlpha = 0.6;
    g.beginPath(); g.ellipse(-20, -3, 9, 7.5, -0.3, 0, TAU); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,245,230,.16)'; g.lineWidth = 0.7;
    for (var i = 0; i < 5; i++) { g.beginPath(); g.moveTo(10 + i * 3, -14 + i); g.lineTo(8 + i * 3, -7 + i); g.stroke(); }
  }
  /* the short tail, pale underneath */
  g.fillStyle = dark ? RC.dark : (far ? RC.fpale : RC.pale);
  g.beginPath(); g.moveTo(-32, -14); g.quadraticCurveTo(-40, -18, -38, -10); g.quadraticCurveTo(-36, -8, -31, -6); g.closePath(); g.fill();
  /* near legs */
  deerLeg(g, -22, -3, HIND, ph - LEG_OFF.lh, true, dark, true, far);
  deerLeg(g, 18, 0, FORE, ph - LEG_OFF.lf, true, dark, false, far);
  /* the head: a broad, blunt muzzle, the eye set high, short rounded ears
   * below the antler bases */
  g.save(); g.translate(hx, hy); g.rotate(-pump * 0.6);
  g.beginPath();
  g.moveTo(-2, -6);                                   /* the brow */
  g.bezierCurveTo(4, -7, 10, -6, 14, -3.5);           /* the nose bridge, nearly straight */
  g.bezierCurveTo(17, -2, 17, 3, 14.5, 4.5);          /* the blunt end of the muzzle */
  g.bezierCurveTo(10, 6.5, 4, 6, 0, 5);               /* the jaw */
  g.bezierCurveTo(-3, 4, -4, 0, -2, -6);              /* the cheek back to the brow */
  g.closePath();
  if (dark) { g.fillStyle = RC.dark; g.fill(); }
  else {
    var hg = g.createLinearGradient(0, -7, 0, 6); hg.addColorStop(0, cBack); hg.addColorStop(1, cBack2);
    g.fillStyle = hg; g.fill();
    g.fillStyle = far ? RC.fpale2 : RC.pale; g.beginPath(); g.moveTo(8, 1); g.bezierCurveTo(12, 0.5, 15.5, 1.5, 15.2, 3.4); g.bezierCurveTo(13, 5.8, 8, 5.4, 6, 4); g.closePath(); g.fill();
    g.fillStyle = RC.eye; g.beginPath(); g.ellipse(3.6, -3.6, 1.5, 1.2, 0.15, 0, TAU); g.fill();
    g.fillStyle = '#FFF'; g.beginPath(); g.arc(3.1, -4, 0.45, 0, TAU); g.fill();
  }
  /* the nose pad — black, or Rob's red with its glow, which shows dark too */
  if (nose) {
    g.save(); g.globalAlpha = 0.55;
    var ng = g.createRadialGradient(15.3, 0.8, 0.5, 15.3, 0.8, 7); ng.addColorStop(0, '#FF5A4A'); ng.addColorStop(1, 'rgba(255,90,74,0)');
    g.fillStyle = ng; g.beginPath(); g.arc(15.3, 0.8, 7, 0, TAU); g.fill(); g.restore();
    g.fillStyle = '#E8392B'; g.beginPath(); g.arc(15.3, 0.8, 2.4, 0, TAU); g.fill();
    g.fillStyle = '#FFB3A8'; g.beginPath(); g.arc(14.6, 0, 0.7, 0, TAU); g.fill();
  } else if (!dark) { g.fillStyle = RC.nose; g.beginPath(); g.ellipse(15.3, 0.8, 2.2, 1.8, 0.3, 0, TAU); g.fill(); }
  /* the ears: short and rounded, below the antlers, one each side */
  g.fillStyle = dark ? RC.dark : cBack2;
  g.beginPath(); g.ellipse(-5, -5.5, 2.4, 4.2, 0.9, 0, TAU); g.fill();
  if (!dark) { g.fillStyle = far ? RC.fpale2 : RC.pale2; g.beginPath(); g.ellipse(-5.4, -5.6, 1.2, 2.6, 0.9, 0, TAU); g.fill(); }
  g.fillStyle = dark ? RC.dark : cBack;
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
  beam(-2.5, 2.0, dark ? RC.dark : RC.antler2);
  beam(2, 2.3, dark ? RC.dark : (far ? RC.antler2 : RC.antler));
  if (!dark) { g.strokeStyle = 'rgba(255,250,240,.35)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(2, -7.5); g.bezierCurveTo(-3, -17, -7, -28, -1.5, -39); g.stroke(); }
  g.restore();
  g.restore();
}
/* Santa in the sleigh. Units: the sleigh is 100 long, origin at the middle
 * of its floor. t is time in seconds for the bob and sway; flick is 0..1,
 * how far the rein flick has travelled (0 = at rest). The sleigh and Santa
 * are NEVER dark (Rob): only the team goes to silhouette on the moon. */
var SC = {
  red: '#C8262B', red2: '#9E1B20', red3: '#E04A4A', fur: '#FFFDF8', fur2: '#E6DFD2',
  skin: '#F6CDB0', cheek: '#F0908A', nose: '#E8766F', beard: '#FFFFFF', beard2: '#E4E1DA',
  belt: '#2B2420', buckle: '#E6B422', mitt: '#2E7D3F', mitt2: '#1E5A2B',
  gold: '#D9A62B', gold2: '#9E7718', wood: '#7A4E2C', sack: '#8A6238', sack2: '#6A4826',
};
function sleighBody(g) {
  /* the runners: curved steel with a scrolled nose, and the struts */
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = SC.gold2; g.lineWidth = 3.2;
  g.beginPath(); g.moveTo(-44, 26); g.lineTo(38, 26); g.bezierCurveTo(50, 26, 56, 18, 54, 8); g.bezierCurveTo(53, 3, 48, 4, 49, 8); g.stroke();
  g.strokeStyle = SC.gold; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-44, 24.8); g.lineTo(38, 24.8); g.bezierCurveTo(49, 24.8, 54.5, 17, 52.6, 8.5); g.stroke();
  g.strokeStyle = SC.gold2; g.lineWidth = 2.6;
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
  bg.addColorStop(0, SC.red3); bg.addColorStop(0.45, SC.red); bg.addColorStop(1, SC.red2);
  g.fillStyle = bg; g.fill();
  /* the gold rail along the top edge and the filigree on the side */
  g.strokeStyle = SC.gold; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(42, -8); g.bezierCurveTo(38, -10, 30, -8, 26, -6); g.lineTo(-30, -6); g.bezierCurveTo(-40, -6, -48, -16, -46, -30); g.stroke();
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(-40, 4); g.bezierCurveTo(-20, 0, 10, 0, 36, 4); g.stroke();
  g.beginPath(); g.moveTo(-36, 7); g.bezierCurveTo(-30, 2, -26, 2, -22, 7); g.moveTo(-14, 7); g.bezierCurveTo(-8, 2, -4, 2, 0, 7);
  g.moveTo(8, 7); g.bezierCurveTo(14, 2, 18, 2, 22, 7); g.stroke();
  g.fillStyle = SC.gold; g.beginPath(); g.arc(-29, 4.6, 1.3, 0, TAU); g.fill(); g.beginPath(); g.arc(-7, 4.6, 1.3, 0, TAU); g.fill(); g.beginPath(); g.arc(15, 4.6, 1.3, 0, TAU); g.fill();
  /* the lower band, darker, like the shadow under the curve */
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.beginPath(); g.moveTo(-46, 12); g.lineTo(44, 12); g.bezierCurveTo(46, 10, 46, 8, 44, 8); g.lineTo(-46, 8); g.closePath(); g.fill();
}
function sack(g) {
  /* the sack of gifts behind the seat, tied at the neck, two parcels showing */
  g.fillStyle = SC.sack;
  g.beginPath(); g.moveTo(-18, -8); g.bezierCurveTo(-8, -22, -14, -36, -24, -40); g.bezierCurveTo(-36, -38, -44, -26, -42, -8); g.closePath(); g.fill();
  g.fillStyle = SC.sack2;
  g.beginPath(); g.moveTo(-18, -8); g.bezierCurveTo(-14, -16, -18, -26, -26, -30); g.bezierCurveTo(-22, -22, -22, -14, -24, -8); g.closePath(); g.fill();
  g.strokeStyle = '#D9A62B'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-28, -38); g.lineTo(-20, -36); g.stroke();
  g.fillStyle = '#2F9E44'; g.fillRect(-30, -46, 7, 7); g.fillStyle = '#1864AB'; g.fillRect(-22, -44, 6, 6);
  g.strokeStyle = SC.gold; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-26.5, -46); g.lineTo(-26.5, -39); g.moveTo(-19, -44); g.lineTo(-19, -38); g.stroke();
}
/* the reins: a smooth line through the points P from Santa's hand to the
 * lead reindeer, sagging between each pair; w is where the flick has got
 * to along it (0..1, -1 = none) and the snap lifts the line as it passes */
function reinLine(g, P, w, amp) {
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
function santa(g, hand) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  var up = hand * 7;
  /* a sleeve: a tapered red shape from the shoulder to the wrist, a fur
   * cuff across the wrist, the mitten beyond it */
  function sleeve(sx, sy, wx, wy, shade) {
    var dx = wx - sx, dy = wy - sy, l = sqrt(dx * dx + dy * dy), nx = -dy / l, ny = dx / l;
    var sg = g.createLinearGradient(sx + nx * 5, sy + ny * 5, sx - nx * 5, sy - ny * 5);
    sg.addColorStop(0, shade ? SC.red2 : SC.red3); sg.addColorStop(0.5, shade ? SC.red2 : SC.red); sg.addColorStop(1, SC.red2);
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(sx + nx * 5.2, sy + ny * 5.2);
    g.quadraticCurveTo(sx + dx * 0.5 + nx * 5, sy + dy * 0.5 + ny * 5 - up * 0.4, wx + nx * 3.6, wy + ny * 3.6);
    g.lineTo(wx - nx * 3.6, wy - ny * 3.6);
    g.quadraticCurveTo(sx + dx * 0.5 - nx * 4.6, sy + dy * 0.5 - ny * 4.6 - up * 0.4, sx - nx * 5.2, sy - ny * 5.2);
    g.closePath(); g.fill();
    /* the fur cuff, across the wrist */
    g.save(); g.translate(wx, wy); g.rotate(atan2(dy, dx));
    g.fillStyle = shade ? SC.fur2 : SC.fur; g.beginPath(); g.roundRect ? g.roundRect(-2.2, -4.4, 4.4, 8.8, 2) : g.rect(-2.2, -4.4, 4.4, 8.8); g.fill();
    g.fillStyle = shade ? SC.mitt2 : SC.mitt; g.beginPath(); g.ellipse(5.2, 0.4, 4.4, 3.4, 0.2, 0, TAU); g.fill();
    g.fillStyle = SC.mitt2; g.beginPath(); g.ellipse(6.6, 2.6, 1.6, 1.1, 0.3, 0, TAU); g.fill();
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
  cg.addColorStop(0, SC.red3); cg.addColorStop(0.5, SC.red); cg.addColorStop(1, SC.red2);
  g.fillStyle = cg; g.fill();
  g.strokeStyle = SC.fur; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-15, -7.5); g.lineTo(12, -7.5); g.stroke();
  g.strokeStyle = SC.fur2; g.lineWidth = 1; g.beginPath(); g.moveTo(-14, -9.4); g.lineTo(11, -9.4); g.stroke();
  g.strokeStyle = SC.fur; g.lineWidth = 2.6; g.beginPath(); g.moveTo(10, -28); g.bezierCurveTo(12, -22, 13, -16, 12.5, -10); g.stroke();
  g.fillStyle = SC.belt; g.beginPath(); g.moveTo(-17, -17); g.bezierCurveTo(-6, -14, 4, -14, 13, -17); g.lineTo(13, -13.2); g.bezierCurveTo(4, -10.2, -6, -10.2, -17, -13.2); g.closePath(); g.fill();
  g.fillStyle = SC.buckle; g.fillRect(2, -16.6, 5.2, 5.2); g.fillStyle = SC.belt; g.fillRect(3.3, -15.3, 2.6, 2.6);
  /* the near arm forward to the reins */
  sleeve(-2, -25, 17, -16 - up, false);
  /* the head: round, the ear, the nose */
  g.fillStyle = SC.skin; g.beginPath(); g.arc(1, -46, 9.2, 0, TAU); g.fill();
  g.fillStyle = SC.skin; g.beginPath(); g.ellipse(-6.5, -45.5, 1.8, 2.4, 0, 0, TAU); g.fill();
  g.fillStyle = SC.cheek; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(-6.5, -45.5, 0.9, 1.3, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
  g.fillStyle = SC.nose; g.beginPath(); g.ellipse(9.4, -45, 2.4, 2, 0, 0, TAU); g.fill();
  g.fillStyle = '#FFF'; g.beginPath(); g.arc(8.8, -45.8, 0.6, 0, TAU); g.fill();
  /* the eye and the white brow */
  g.fillStyle = '#2B2420'; g.beginPath(); g.ellipse(5.2, -48.6, 1.3, 1.1, 0, 0, TAU); g.fill();
  g.fillStyle = '#FFF'; g.beginPath(); g.arc(4.8, -49, 0.4, 0, TAU); g.fill();
  g.strokeStyle = SC.fur; g.lineWidth = 1.6; g.beginPath(); g.moveTo(2.4, -51.6); g.quadraticCurveTo(5.5, -53.2, 8.2, -51.2); g.stroke();
  /* the blush: on the cheekbone, below the eye and above the mustache's outer edge */
  g.fillStyle = SC.cheek; g.globalAlpha = 0.75;
  g.beginPath(); g.ellipse(8.6, -42.6, 2.6, 1.8, -0.2, 0, TAU); g.fill(); g.globalAlpha = 1;
  /* the beard: a full rounded mass from the ears down over the chest */
  var bd = g.createLinearGradient(0, -44, 0, -18); bd.addColorStop(0, SC.beard); bd.addColorStop(1, SC.beard2);
  g.fillStyle = bd;
  g.beginPath();
  g.moveTo(-7.5, -44); g.bezierCurveTo(-10, -36, -11, -28, -8, -22);
  g.quadraticCurveTo(-6, -17.5, -2, -19); g.quadraticCurveTo(1, -16, 4, -19.5);
  g.quadraticCurveTo(8, -17, 10, -21); g.bezierCurveTo(14, -27, 14, -36, 9.5, -42);
  g.quadraticCurveTo(5, -40, 1, -40.5); g.quadraticCurveTo(-4, -40, -7.5, -44); g.closePath(); g.fill();
  g.strokeStyle = SC.beard2; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(-3, -38); g.quadraticCurveTo(-5, -30, -3, -23); g.moveTo(4, -38); g.quadraticCurveTo(7, -30, 5.5, -24); g.stroke();
  /* the hair: white, down in front of and above the ear, the sideburn
   * running into the beard, and the back of the head under the brim */
  g.fillStyle = SC.beard;
  g.beginPath(); g.moveTo(-4, -53); g.bezierCurveTo(-3, -49, -3.5, -45, -5, -42.5); g.quadraticCurveTo(-7, -44, -7.6, -44.5);
  g.bezierCurveTo(-6.6, -47, -6.8, -50, -7.8, -52.6); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-7.8, -52.6); g.bezierCurveTo(-11, -50, -11.4, -46, -9.4, -42.8); g.quadraticCurveTo(-8.4, -44, -7.6, -44.5);
  g.bezierCurveTo(-6.8, -47, -7, -50, -7.8, -52.6); g.closePath(); g.fill();
  g.strokeStyle = SC.beard2; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-5.4, -51); g.quadraticCurveTo(-5, -47, -6, -44); g.stroke();
  /* the mustache: two white lobes under the nose, curling out and up */
  g.fillStyle = SC.beard;
  g.beginPath(); g.moveTo(8.6, -43.2); g.bezierCurveTo(12, -43.6, 15, -41, 13.5, -38.6); g.bezierCurveTo(12, -37.5, 10.2, -39.5, 8.4, -40.6); g.quadraticCurveTo(7.4, -42, 8.6, -43.2); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(8.4, -43); g.bezierCurveTo(5, -44, 1.5, -42, 0.5, -39.6); g.bezierCurveTo(2, -38.5, 5.5, -39.6, 8.2, -40.6); g.quadraticCurveTo(9.2, -42, 8.4, -43); g.closePath(); g.fill();
  g.strokeStyle = SC.beard2; g.lineWidth = 0.6; g.beginPath(); g.moveTo(8.5, -42.4); g.lineTo(8.3, -40.8); g.stroke();
  /* the classic hat, ONE filled shape: from the brim's front the full red
   * body rises over the head, the long cone flops back and down to the
   * tip, and the under edge of the cone comes back to the brim's rear */
  var hg = g.createLinearGradient(-30, -66, 10, -52); hg.addColorStop(0, SC.red2); hg.addColorStop(0.5, SC.red); hg.addColorStop(1, SC.red3);
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
  g.fillStyle = 'rgba(0,0,0,.14)';                           /* the cone's underside in shadow */
  g.beginPath(); g.moveTo(-9.6, -55); g.bezierCurveTo(-11, -58, -14.5, -59.7, -19, -59.6); g.bezierCurveTo(-27, -59.4, -33, -57.6, -37.5, -55.6);
  g.bezierCurveTo(-30, -58.2, -20, -61.6, -12, -60); g.bezierCurveTo(-10.6, -58, -9.8, -56.4, -9.6, -55); g.closePath(); g.fill();
  g.strokeStyle = SC.fur; g.lineWidth = 4.4; g.lineCap = 'round';   /* the fur brim */
  g.beginPath(); g.moveTo(-9.8, -52.4); g.quadraticCurveTo(0.6, -56, 10.6, -53.4); g.stroke();
  g.strokeStyle = SC.fur2; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-8.2, -51); g.quadraticCurveTo(0.6, -54, 9.2, -52.2); g.stroke();
  g.fillStyle = SC.fur; g.beginPath(); g.arc(-38.8, -55.2, 3.5, 0, TAU); g.fill();
  g.fillStyle = SC.fur2; g.beginPath(); g.arc(-39.8, -54.2, 1.6, 0, TAU); g.fill();
}
/* the whole rig at (x, y), the sleigh L long, flying toward dir (+1 right).
 * u is 0..1 across the flight; t is seconds. moon = {x, y, r} in page px, or
 * null. flick = 0..1 how far the rein snap has travelled, or -1 for none.
 * Only the reindeer go dark over the moon; a reindeer is dark when its
 * body centre is inside the disc, as the cranes are. */
function rig(g, x, y, L, u, t, moon, dir, n, flick, opt) {
  opt = opt || {};
  var s = L / 100, dl = L * 0.50;                      /* a reindeer's body is half the sleigh */
  var gapX = 2.05 * dl, climb = -0.06 * dl;
  var bob = sin(t * 2.1) * 1.4 * s, sway = sin(t * 1.3 + 0.7) * 0.025;
  /* the team in pairs, each animal on a CLEARLY different point of the
   * stride (a quarter apart), spaced so no two bodies overlap; the far
   * animal of each pair behind, above, smaller and a shade darker */
  var parts = [];
  for (var i = 0; i < n; i++) {
    var pair = (i / 2) | 0, far = i % 2 === 1;
    parts.push({ x: L * 0.98 + pair * gapX + (far ? 0.55 * dl : 0), y: climb * pair - L * 0.02 - (far ? 0.30 * dl : 0),
      ph: (u * 7.5 + i * 0.25) % 1, far: far, pair: pair, lead: pair === (((n - 1) / 2) | 0) && !far });
  }
  g.save(); g.translate(x, y); if (dir < 0) { g.scale(-1, 1); }
  g.rotate(-0.06 + sway);
  function page(px, py) {
    var m = g.getTransform(); return [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f];
  }
  function isDark(px, py) {
    if (!moon) { return false; }
    var q = page(px, py), dp = window.devicePixelRatio || 1, wx = q[0] / dp, wy = q[1] / dp;
    var d = sqrt((wx - moon.x) * (wx - moon.x) + (wy - moon.y) * (wy - moon.y));
    return d < moon.r;
  }
  var hand = flick < 0 ? 0 : clamp(1 - flick * 3, 0, 1);
  var hx = 21 * s, hy = (-16.5 - hand * 7) * s + bob;
  for (var j = parts.length - 1; j >= 0; j--) {
    var q = parts[j], nose = opt.nose && q.lead;
    var lift = (q.pair === (((n - 1) / 2) | 0) && flick > 0.82) ? (flick - 0.82) * 0.5 : 0;
    var sc = q.far ? 0.90 : 1;
    if (opt.edge === 'clip' && moon) {
      /* Rob's row A: the silhouette cut exactly at the disc — lit, then
       * dark again inside the moon only */
      g.save(); g.translate(q.x, q.y); g.rotate(-lift); g.scale(sc, sc); deer(g, dl, q.ph, false, q.far, nose); g.restore();
      var M = g.getTransform(), dp = window.devicePixelRatio || 1;
      g.save(); g.setTransform(dp, 0, 0, dp, 0, 0); g.beginPath(); g.arc(moon.x, moon.y, moon.r, 0, TAU); g.setTransform(M); g.clip();
      g.translate(q.x, q.y); g.rotate(-lift); g.scale(sc, sc); deer(g, dl, q.ph, true, q.far, nose); g.restore();
    } else {
      var dk = isDark(q.x, q.y);
      g.save(); g.translate(q.x, q.y); g.rotate(-lift); g.scale(sc, sc);
      deer(g, dl, q.ph, dk, q.far, nose);
      g.restore();
    }
  }
  /* the reins: one line from the near hand over each pair to the lead */
  var P = [[hx, hy, 0]], s2 = dl / 60;
  for (var k = 0; k < parts.length; k += 2) {
    var p = parts[k];
    P.push([p.x + 48 * s2, p.y - 36 * s2, 8 * s2 + k * s2]);
  }
  g.strokeStyle = '#3E2A1C'; g.lineWidth = mx2(1, 1.4 * s);
  reinLine(g, P, flick, 10 * s);
  g.save(); g.scale(s, s); g.translate(0, bob / s);
  sack(g); sleighBody(g); santa(g, hand);
  g.restore();
  g.restore();
}
/* the real moon, pre-painted once at a radius */
function moonC(r) {
  var c = document.createElement('canvas'), dp = mn(window.devicePixelRatio || 1, 2), half = MT.ceil(r * 1.3);
  c.width = c.height = MT.ceil(2 * half * dp);
  var g = c.getContext('2d'); g.scale(dp, dp); g.translate(half, half); moonPaint(g, r);
  return { c: c, half: half, r: r };
}
`;

/* ---- the pieces, redrawn -------------------------------------------------
 * SVG sprites as the engine draws them (one document each, so gradient ids
 * may repeat between pieces). Each is drawn with gradients, highlights and
 * separate shapes so it stands beside the Halloween set, and checked at
 * guest size on cream and on the navy footer. */
const NEW = {
  /* holly: two leaves with spined, curling edges, a pale midrib and a sheen,
   * three berries each with a highlight and a dark navel */
  holly: '36 28|<defs><linearGradient id="l1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3E9E4F"/><stop offset="1" stop-color="#1E6B33"/></linearGradient><linearGradient id="l2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46A857"/><stop offset="1" stop-color="#1F6E35"/></linearGradient><linearGradient id="l3" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2E8A42"/><stop offset="1" stop-color="#1B5F2D"/></linearGradient><radialGradient id="b1" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FF6B6B"/><stop offset=".6" stop-color="#D62828"/><stop offset="1" stop-color="#8E1414"/></radialGradient></defs><path d="M18 14 C15 9 12 6 8 5.5 L9 8.2 C6.4 7.4 3.8 8 1.8 9.8 L4.6 10.8 C2.8 12.2 2 14 2.2 16.2 L5 15.4 C5 17.4 6.2 19.2 8 20.2 L8.8 17.8 C11 19 14 19.2 18 18 Z" fill="url(#l1)"/><path d="M18 14 C21 9 24 6 28 5.5 L27 8.2 C29.6 7.4 32.2 8 34.2 9.8 L31.4 10.8 C33.2 12.2 34 14 33.8 16.2 L31 15.4 C31 17.4 29.8 19.2 28 20.2 L27.2 17.8 C25 19 22 19.2 18 18 Z" fill="url(#l2)"/><path d="M18 15 C14.5 17 12 20 11.4 24 L14 22.8 C14.2 25 15.6 26.6 18 27.4 C20.4 26.6 21.8 25 22 22.8 L24.6 24 C24 20 21.5 17 18 15 Z" fill="url(#l3)"/><path d="M17 14.2 Q10 12.4 4.6 13.6 M19 14.2 Q26 12.4 31.4 13.6 M18 16 Q18 21 18 26" stroke="#BFE8C3" stroke-width=".8" fill="none" opacity=".75"/><circle cx="14.2" cy="14.4" r="4" fill="url(#b1)"/><circle cx="22" cy="14.4" r="4" fill="url(#b1)"/><circle cx="18" cy="18.6" r="4.2" fill="url(#b1)"/><g fill="#5A0E0E"><circle cx="15" cy="15.6" r=".6"/><circle cx="22.8" cy="15.6" r=".6"/><circle cx="18.8" cy="19.8" r=".6"/></g>',
  /* the gift: a box with a shaded side, the lid overhanging, a ribbon with a
   * lit edge and a tied bow with its loops and tails */
  gift: '28 30|<defs><linearGradient id="bx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A77C9"/><stop offset=".5" stop-color="#1864AB"/><stop offset="1" stop-color="#114A80"/></linearGradient><linearGradient id="ld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3C8DE0"/><stop offset="1" stop-color="#1F6BB8"/></linearGradient><linearGradient id="rb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE066"/><stop offset=".5" stop-color="#F1C40F"/><stop offset="1" stop-color="#C79E07"/></linearGradient></defs><rect x="3" y="12" width="22" height="16" rx="1.6" fill="url(#bx)"/><rect x="3" y="12" width="22" height="2.4" fill="#0F3F6C" opacity=".35"/><rect x="1.6" y="8.6" width="24.8" height="5.4" rx="1.6" fill="url(#ld)"/><rect x="11.6" y="8.6" width="4.8" height="19.4" fill="url(#rb)"/><rect x="11.6" y="8.6" width="1.4" height="19.4" fill="#FFF2A8" opacity=".6"/><path d="M14 9.4 C9 9.6 6.2 7 7.6 3.6 C9 1.4 12.4 3.2 14 9.4 Z" fill="#F1C40F"/><path d="M14 9.4 C19 9.6 21.8 7 20.4 3.6 C19 1.4 15.6 3.2 14 9.4 Z" fill="#D9AE0B"/><path d="M14 9.4 C9.4 8.6 7.6 6 8.6 4.2" stroke="#FFF2A8" stroke-width=".8" fill="none" opacity=".7"/><path d="M13 9.6 L10.2 14.4 M15 9.6 L17.8 14.4" stroke="#C79E07" stroke-width="1.6" stroke-linecap="round"/><circle cx="14" cy="9.2" r="1.7" fill="#FFE066"/>',
  /* the pine: four tiers of boughs with scalloped hems, each lit from the
   * left and shadowed under the tier above, a trunk, a gold star */
  pine: '32 42|<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3FA85B"/><stop offset=".55" stop-color="#2B8A3E"/><stop offset="1" stop-color="#1D6B30"/></linearGradient></defs><rect x="13.5" y="35" width="5" height="6" rx="1" fill="#6F4E37"/><path d="M16 22 L30 36 Q27 37 24.5 35.6 Q22 37.4 19.5 36 Q16 37.8 12.5 36 Q10 37.4 7.5 35.6 Q5 37 2 36 Z" fill="url(#t)"/><path d="M16 14 L27 26 Q24.5 27 22.5 25.8 Q19.5 27.4 16 26 Q12.5 27.4 9.5 25.8 Q7.5 27 5 26 Z" fill="url(#t)"/><path d="M16 14 L27 26 Q24.5 27 22.5 25.8 Q19.5 27.4 16 26 Q12.5 27.4 9.5 25.8 Q7.5 27 5 26 Z" fill="#000" opacity=".08"/><path d="M16 7 L24 17 Q22 18 20 17 Q18 18.4 16 17.4 Q14 18.4 12 17 Q10 18 8 17 Z" fill="url(#t)"/><path d="M16 2.5 L21 10 Q19.6 10.8 18 10 Q16 11 14 10 Q12.4 10.8 11 10 Z" fill="url(#t)"/><g fill="#000" opacity=".16"><path d="M16 14 L22 20.6 L10 20.6 Z"/><path d="M16 22 L24 30.6 L8 30.6 Z"/></g><path d="M16 0.6 L17.2 3.4 L20.2 3.6 L17.9 5.4 L18.6 8.3 L16 6.8 L13.4 8.3 L14.1 5.4 L11.8 3.6 L14.8 3.4 Z" fill="#FFD43B"/><path d="M16 1.6 L16.8 3.6 L15.2 3.6 Z" fill="#FFF2A8"/>',
  /* the sabal palm: a trunk with its boots, the fan of fronds in two tones
   * with a sheen on the near ones; the lights land on it as before */
  sabalpalm: '36 42|' + 0,
  /* the ornaments (Rob's A): three glass balls — red, gold and blue — each
   * with a window reflection, a soft rim light, a ridged gold cap and hook */
  orn1: '24 32|' + 0, orn2: '24 32|' + 0, orn3: '24 32|' + 0,
  /* the candy cane (Rob's B): red, white and green stripes wrapping the
   * whole cane continuously — a striped paint on the stroke, so the hook is
   * wrapped like the shaft and the tip ends cleanly in its round cap. No
   * shading line along it. */
  cane: '22 38|<defs><pattern id="st" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-50)"><rect width="7" height="7" fill="#FFFFFF"/><rect width="3.2" height="7" fill="#E03131"/><rect x="4.2" width="1.4" height="7" fill="#2F9E44"/></pattern></defs><path d="M7 35 L7 12 Q7 3.5 13 3.5 Q19 3.5 19 10.5" stroke="url(#st)" stroke-width="5.6" fill="none" stroke-linecap="round"/>',
  /* the flamingo (Rob's C, with the folded leg): the bird redrawn — a
   * teardrop body with the wing's darker primaries, the S neck, the head
   * with the bent bill black at the tip, one long leg with its backward
   * ankle and the other folded, its lower part crossing the standing leg
   * at mid-leg (the "figure 4") — in a Santa hat and a scarf */
  flamingo: '34 56|<defs><linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA3C6"/><stop offset="1" stop-color="#E8609A"/></linearGradient><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F783AC"/><stop offset="1" stop-color="#D64A86"/></linearGradient></defs><g transform="translate(0 2)"><path d="M8 30 C8 23 14 19 21 20 C27 21 31 26 30 31 C29 36 22 38 16 36 C11 35 8 33 8 30 Z" fill="url(#bd)"/><path d="M14 25 C18 21 26 22 29 27 C27 31 22 33 17 32 C13 31 12 28 14 25 Z" fill="url(#wg)"/><path d="M29 27 C28.4 30.2 25.6 32.4 21.5 33 C24.4 32.6 26.8 31.2 28.1 28.9 Z" fill="#2B2B2B" opacity=".85"/><path d="M13 26 C6 23 5.2 13 10.6 9.6" stroke="#F783AC" stroke-width="4.4" fill="none" stroke-linecap="round"/><path d="M7.4 20 C6.2 16 7.2 12.2 10 10" stroke="#FFB3D0" stroke-width="1.1" fill="none" opacity=".6"/><circle cx="11.8" cy="8.8" r="3.4" fill="#F783AC"/><path d="M10 7.2 C7.6 7.4 5.6 8.6 5.6 10.6 C5.6 11.4 6 12.2 6.2 13 L8.6 12.6 C8.4 11.6 8.4 10.8 9 10.2 C9.6 9.6 10.6 9.4 11.6 9.6 Z" fill="#F3E6EA"/><path d="M6.2 13 L6.6 16.4 C7.6 17.2 8.8 16.6 9 15.4 L8.6 12.6 Z" fill="#1A1A1A"/><circle cx="10.8" cy="7.8" r="1" fill="#1A1A1A"/><circle cx="10.5" cy="7.5" r=".35" fill="#FFF"/><path d="M14 35 L14 43.5 L13.4 53.5" stroke="#E64980" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="14" cy="43.6" r="1.4" fill="#D83A72"/><path d="M10 54 L13.4 53.5 L17 54" stroke="#E64980" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M20 35 L19 42.5 L10.4 43.2" stroke="#E64980" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="19" cy="42.6" r="1.4" fill="#D83A72"/><path d="M10.6 43 L7.2 45.6 L8.8 46 L10.2 45.2 L11.6 46.2 L12 44.6 Z" fill="#D83A72"/><path d="M8.4 21.4 C10.4 19 14.4 19.2 16.6 21.6 C14.6 24 10.4 24.2 8.4 21.4 Z" fill="#2F9E44"/><path d="M9.6 22.6 C7.4 25.2 7.2 28.4 9.2 31 C10.8 28.6 11 25.4 10.6 23 Z" fill="#2F9E44"/><path d="M9.2 21.2 C11 20 13.6 20 15.6 21.4" stroke="#E03131" stroke-width="1" fill="none" stroke-dasharray="1.8 1.4"/><path d="M8.6 26.2 C9.2 26 10 26 10.6 26.2 M8.4 28.4 C9 28.2 9.8 28.2 10.2 28.4" stroke="#E03131" stroke-width="1" fill="none"/><path d="M8.4 6.6 C8.8 2.2 12.6 0.4 15.6 1.8 C18.6 3.2 21.4 2.2 25.2 4.6 C22.2 4.2 19.8 5.4 16.8 6.4 L15.4 7 Z" fill="#E03131"/><path d="M15.6 1.8 C18.6 3.2 21.4 2.2 25.2 4.6 C21.8 5 18.4 6.6 16 6.4 Z" fill="#A61E1E" opacity=".55"/><path d="M8 7.2 C10.6 5.2 13.4 5.4 15.6 7.2" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="26" cy="5.2" r="2" fill="#FFFFFF"/></g>',
  /* the wreath (Rob's A): a ring of pine sprigs in two greens with their
   * needles, five berries clustered at the bottom, the red bow at the
   * bottom with its loops and BOTH tails drawn whole below the ring */
  wreath: '44 52|' + 0,
};
/* the three glass balls, one drawing in three colours */
function ball(c0, c1, c2) {
  return '24 32|<defs><radialGradient id="g" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="' + c0 + '"/><stop offset=".55" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></radialGradient><linearGradient id="cap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F3D27A"/><stop offset=".5" stop-color="#C9A227"/><stop offset="1" stop-color="#8C6E12"/></linearGradient></defs>' +
    '<circle cx="12" cy="3.2" r="2.2" fill="none" stroke="#B8860B" stroke-width="1.3"/><rect x="9.4" y="5" width="5.2" height="4.4" rx=".9" fill="url(#cap)"/><path d="M10.6 5.4 V9 M12 5.4 V9 M13.4 5.4 V9" stroke="#8C6E12" stroke-width=".5" opacity=".7"/>' +
    '<circle cx="12" cy="20" r="10.4" fill="url(#g)"/><ellipse cx="8.2" cy="15" rx="2.4" ry="3.8" fill="#FFFFFF" opacity=".55" transform="rotate(-28 8.2 15)"/><path d="M5.2 25.6 A10.4 10.4 0 0 0 18.6 27.4" stroke="#FFFFFF" stroke-width="1" fill="none" opacity=".28"/><circle cx="12" cy="20" r="10.4" fill="none" stroke="#000" stroke-width=".6" opacity=".12"/>';
}
NEW.orn1 = ball('#FF8A8A', '#D62828', '#7A0F0F');
NEW.orn2 = ball('#FFF0B0', '#E0B32A', '#8C6410');
NEW.orn3 = ball('#9ED0FF', '#2B7BD6', '#0F3F7A');
/* the sabal palm crown: costapalmate fan fronds radiating from the heart,
 * the ones behind first and darkest, the sides, then the ones facing the
 * viewer drawn over the heart; two old fronds drooping; boots on the trunk */
NEW.sabalpalm = (function () {
  var cx = 18, cy = 20, out = [];
  function frond(ang, len, half, col, droop) {
    /* a fan: the costa from the heart, leaflet tips round the far edge */
    var a0 = ang * Math.PI / 180, pts = [], n = 9, k;
    for (k = 0; k <= n; k++) {
      var t = k / n, a = a0 + (t - 0.5) * half * 2 * Math.PI / 180;
      var r = len * (0.78 + 0.22 * Math.abs(Math.cos((t - 0.5) * Math.PI)));
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r + droop * Math.pow(Math.abs(t - 0.5) * 2, 1.5) * len * 0.5;
      var ix = cx + Math.cos(a + (k % 2 ? 0.02 : -0.02)) * r * 0.78, iy = cy + Math.sin(a + (k % 2 ? 0.02 : -0.02)) * r * 0.78 + droop * len * 0.2;
      pts.push((k ? 'L' : '') + x.toFixed(1) + ' ' + y.toFixed(1));
      if (k < n) { pts.push('L' + ix.toFixed(1) + ' ' + iy.toFixed(1)); }
    }
    out.push('<path d="M' + cx + ' ' + cy + ' ' + pts.join(' ') + ' Z" fill="' + col + '"/>');
    out.push('<path d="M' + cx + ' ' + cy + ' L' + (cx + Math.cos(a0) * len * 0.8).toFixed(1) + ' ' + (cy + Math.sin(a0) * len * 0.8 + droop * len * 0.1).toFixed(1) + '" stroke="#DFF3DF" stroke-width=".5" opacity=".55"/>');
  }
  /* the trunk with its boots */
  out.push('<path d="M15 42 L16 20 L20 20 L21 42 Z" fill="url(#tr)"/>');
  for (var y = 22; y < 40; y += 3.2) {
    out.push('<path d="M15.3 ' + y + ' L18 ' + (y - 1.6) + ' L20.7 ' + y + ' L18 ' + (y + 0.9) + ' Z" fill="#4A2E18" opacity=".55"/>');
  }
  /* two old fronds drooping beside the trunk */
  frond(118, 15, 14, '#6E8A3A', 0.5); frond(62, 15, 14, '#7A9440', 0.5);
  /* the crown: behind, the sides, then the front */
  [-140, -90, -40].forEach(function (a) { frond(a, 18, 24, '#1F7A36', 0); });
  [-172, -8].forEach(function (a) { frond(a, 17, 20, '#2A8E42', 0.1); });
  [-115, -65].forEach(function (a) { frond(a, 15.5, 22, '#39A651', 0); });
  [150, 30].forEach(function (a) { frond(a, 14, 20, '#2F9E44', 0.3); });
  [112, 68].forEach(function (a) { frond(a, 12.5, 24, '#4CB862', 0.25); });
  frond(90, 11, 26, '#62C476', 0.2);
  out.push('<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="#2E7A3A"/>');
  return '36 42|<defs><linearGradient id="tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9A6A3C"/><stop offset=".5" stop-color="#7A5230"/><stop offset="1" stop-color="#55381F"/></linearGradient></defs>' + out.join('');
})();

NEW.wreath = (function () {
  var out = [], cx = 22, cy = 22, R = 14;
  /* the sprigs: each a short stem with needles both sides, laid round the ring */
  for (var i = 0; i < 22; i++) {
    var a = (i / 22) * Math.PI * 2, r = R + ((i % 3) - 1) * 1.6;
    var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, d = a + 1.25;
    var col = i % 2 ? '#1F6E35' : '#3B9A4C', len = 4.6;
    var x0 = x - Math.cos(d) * len, y0 = y - Math.sin(d) * len, x1 = x + Math.cos(d) * len, y1 = y + Math.sin(d) * len;
    out.push('<path d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '" stroke="' + col + '" stroke-width="1.1"/>');
    for (var k = 0; k < 5; k++) {
      var t = (k + 0.5) / 5, nx = x0 + (x1 - x0) * t, ny = y0 + (y1 - y0) * t, nd = d + 0.9, nl = 2.2;
      out.push('<path d="M' + (nx - Math.cos(nd) * nl).toFixed(1) + ' ' + (ny - Math.sin(nd) * nl).toFixed(1) + ' L' + (nx + Math.cos(nd) * nl).toFixed(1) + ' ' + (ny + Math.sin(nd) * nl).toFixed(1) + '" stroke="' + col + '" stroke-width=".9" stroke-linecap="round"/>');
    }
  }
  var ber = [[16.5, 33.5], [19.5, 36], [23.5, 36.4], [27.2, 34.4], [21, 33]];
  var berries = ber.map(function (b) { return '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="1.9" fill="url(#br)"/><circle cx="' + (b[0] - 0.6) + '" cy="' + (b[1] - 0.6) + '" r=".5" fill="#FFB3B3" opacity=".8"/>'; }).join('');
  var bow = '<g transform="translate(22 38)">' +
    '<path d="M-1.5 2 C-4 5 -5 9 -4.6 13 L-2.2 12.6 C-2.6 9 -2 6 0 3 Z" fill="#B51E1E"/>' +       /* the left tail */
    '<path d="M1.5 2 C4 5 5.2 9 4.8 13 L2.4 12.6 C2.8 9 2.2 6 0 3 Z" fill="#B51E1E"/>' +          /* the right tail */
    '<path d="M-4.6 13 L-2.2 12.6 L-3.6 11 Z M4.8 13 L2.4 12.6 L3.6 11 Z" fill="#7E1111"/>' +    /* the notched ends */
    '<path d="M0 0 C-4 -5 -11 -5 -11 -1 C-11 2.6 -5 3.6 0 0 Z" fill="url(#bw)"/>' +                /* the left loop */
    '<path d="M0 0 C4 -5 11 -5 11 -1 C11 2.6 5 3.6 0 0 Z" fill="url(#bw)"/>' +                     /* the right loop */
    '<path d="M-1.6 -0.6 C-5 -3.4 -9 -3 -9.4 -1" stroke="#FF7A7A" stroke-width=".7" fill="none" opacity=".7"/>' +
    '<path d="M1.6 -0.6 C5 -3.4 9 -3 9.4 -1" stroke="#FF7A7A" stroke-width=".7" fill="none" opacity=".7"/>' +
    '<rect x="-2" y="-2.2" width="4" height="4.4" rx="1" fill="#8E1414"/></g>';
  return '44 52|<defs><radialGradient id="br" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FF6B6B"/><stop offset=".6" stop-color="#D62828"/><stop offset="1" stop-color="#8E1414"/></radialGradient><linearGradient id="bw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E03131"/><stop offset="1" stop-color="#A51C1C"/></linearGradient></defs>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#174F28" stroke-width="7"/>' + out.join('') + berries + bow;
})();

/* ---- the pages ------------------------------------------------------- */
const CSS = `
  body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
  h1{font-size:19px;margin:0 0 2px;text-align:center}
  .sub{color:#6b6b6b;margin:0 auto 16px;max-width:940px}
  section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
  h2{font-size:15px;margin:0 0 4px;text-align:center}
  h3{font-size:13px;margin:8px 0 2px;text-align:center;color:#444}
  .note{margin:0 auto 10px;color:#6b6b6b;max-width:900px}
  .opts{display:flex;gap:28px;flex-wrap:wrap;justify-content:center}
  .opt{text-align:center} .opt p{margin:6px 0 0;font-weight:600;max-width:220px}
  .big{height:140px;display:flex;align-items:center;justify-content:center;gap:10px}
  .row{display:flex;gap:8px;justify-content:center;margin-top:8px}
  .onpage{display:inline-flex;align-items:center;justify-content:center;gap:3px;width:46px;height:46px;border-radius:5px}
  .wide{width:92px}
  .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}
  .was{font-weight:400;color:#8a8a8a;font-size:11px}
  figure{margin:0} figcaption{margin-top:5px;color:#6b6b6b;text-align:center}
  .strip{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  canvas{display:block;border:1px solid #D9CDB6;border-radius:3px}
`;
const ONLY = process.argv.find(a => a.startsWith('--only='));
const only = ONLY ? ONLY.slice(7) : '';

(async () => {
  const { PAL, SVGS, MOON_SRC } = readEngine();
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = playwright();
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) { browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }

  const piece = (raw, size) => {
    const s = svgData(raw, PAL), big = 130 / Math.max(s.w, s.h), on = size / Math.max(s.w, s.h);
    return { bigImg: `<img src="${s.url}" style="width:${s.w * big}px">`, onImg: `<img src="${s.url}" style="width:${s.w * on}px">`, w: s.w * on };
  };
  const opt = (ps, name, was, wide) => `<div class="opt"><div class="big">${ps.map(p => p.bigImg).join('')}</div>
    <div class="row"><span class="onpage light ${wide ? 'wide' : ''}">${ps.map(p => p.onImg).join('')}</span>
    <span class="onpage dark ${wide ? 'wide' : ''}">${ps.map(p => p.onImg).join('')}</span>${was ? `<span class="onpage light" style="opacity:.75">${was.onImg}</span>` : ''}</div><p>${name}${was ? '<br><span class="was">right: as 4.13.0 draws it</span>' : ''}</p></div>`;

  /* ---------- sheet 1: the pieces ---------- */
  if (!only || only === 'pieces') {
    const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 3 });
    const approved = [['cane', 'candy cane'], ['gift', 'gift'], ['pine', 'pine (lights up)']].map(([k, n]) => opt([piece(NEW[k], 30)], n));
    const ornA = opt(['orn1', 'orn2', 'orn3'].map(k => piece(NEW[k], 28)), 'the three glass balls', null, true);
    const ws = svgData(NEW.wreath, PAL);
    const wrA = `<div class="opt"><div class="big"><img src="${ws.url}" style="width:118px"></div>
        <div class="row"><span class="onpage light" style="width:70px;height:74px"><img src="${ws.url}" style="width:56px;opacity:.5"></span>
        <span class="onpage dark" style="width:70px;height:74px"><img src="${ws.url}" style="width:56px;opacity:.5"></span></div><p>the wreath</p></div>`;
    const holly = opt([piece(NEW.holly, 30)], 'holly — the leaves brought round to meet behind the berries', piece(SVGS.holly, 30));
    const palm = opt([piece(NEW.sabalpalm, 32)], 'the sabal palm — a real crown: fan fronds all round the heart, the front ones facing you, two old fronds drooping, boots on the trunk', piece(SVGS.sabalpalm, 30));
    const flam = opt([piece(NEW.flamingo, 42)], 'the flamingo — the real head and the thick beak bent sharply down, pale then black; the webbed foot on the folded leg; the hat\'s cone falling to one side to the pom; the flight feathers laid along the wing', piece(SVGS.flamingo, 36));
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <h1>Seasons 4.14.0 — Christmas, Step 1, Third Round: The Pieces</h1>
      <p class="sub">Rob's third look. Six pieces passed and are shown once more, unchanged, so the set is judged whole. The holly has his one fix; the sabal palm and the flamingo are redrawn to his notes. Each is shown large, then at guest size on cream and on the navy footer, with the 4.13.0 drawing at the right where one exists. Nothing here is in the plugin until he approves.</p>
      <section><h2>Approved — Unchanged</h2>
        <p class="note">The candy cane, the gift, the pine, the three ornaments and the wreath, exactly as he passed them.</p>
        <div class="opts">${approved.join('')}${ornA}${wrA}</div></section>
      <section><h2>The Holly — One Fix</h2>
        <p class="note">At guest size the two leaf groups read as "a heart with green wings". A third leaf now comes down behind the berries so the three meet in the middle: one closed sprig. Shown at guest size on cream and navy beside today's.</p>
        <div class="opts">${holly}</div></section>
      <section><h2>The Sabal Palm — Redrawn</h2>
        <p class="note">The old crown had no fronds in the middle ("a punk-rock spiked hair job"). Now the crown is built the way the tree grows: costapalmate fans radiating from the heart in every direction — the ones behind first and darkest, the sides, then the fronds facing the viewer drawn over the heart — with two old fronds drooping beside the trunk and the frond boots on the trunk below the crown. The lights land on it as before.</p>
        <div class="opts">${palm}</div></section>
      <section><h2>The Flamingo — Redrawn</h2>
        <p class="note">A small head with the real flamingo beak: thick, bent sharply down at the middle, pale at the base and black at the tip. The folded leg has its webbed foot. The Santa hat has the long cone falling to one side and ending in the pom. The black flight feathers lie along the folded wing as a dark edge instead of sticking out behind.</p>
        <div class="opts">${flam}</div></section>`);
    await page.waitForTimeout(600);
    await page.setViewportSize({ width: 1240, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, 'Seasons - 4.14.0 step 1 round 3 pieces.png') });
    await page.close();
    console.log('pieces: ok');
  }

  /* ---------- sheet 2: the scene ---------- */
  if (!only || only === 'scene') {
    const page = await browser.newPage({ viewport: { width: 2000, height: 1000 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.error('  page error:', e.message));
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <h1>Seasons 4.14.0 — Christmas, Step 1, Third Round: Santa Across the Moon</h1>
      <p class="sub">Rob's third look. Santa and the reindeer are redrawn to his notes (the hat, the blush, the hair, the sleeves; the legs, the head, the neck, the team staggered); the two A/B rows he asked for are at the end. Still key frames of the sleighmoon scene as it would play inside the header picture — in the daytime too — at 390px and at 1280px, then the gallop cycle, the rein flick, and the close-ups. The moon is the engine's own moon painter, ungraded. Only the reindeer go dark as they cross the face; Santa and the sleigh stay lit (Rob's pick). The frame behind them is a LABELED STAND-IN for the cottage photograph: the scene paints no sky and never will.</p>
      <div id="out"></div>
      <script>
      ${MOON_SRC}
      ${SCENE}
      var out = document.getElementById('out');
      function panel(title, note, nodes) {
        var sec = document.createElement('section');
        var h = document.createElement('h2'); h.textContent = title; sec.appendChild(h);
        if (note) { var p = document.createElement('p'); p.className = 'note'; p.textContent = note; sec.appendChild(p); }
        var s = document.createElement('div'); s.className = 'strip';
        nodes.forEach(function (n) {
          var f = document.createElement('figure'); f.appendChild(n.c);
          var cap = document.createElement('figcaption'); cap.textContent = n.cap; f.appendChild(cap); s.appendChild(f);
        });
        sec.appendChild(s); out.appendChild(sec);
      }
      function cv(W, H, cssW) {
        var c = document.createElement('canvas'), dp = 2;
        c.width = W * dp; c.height = H * dp; c.style.width = (cssW || W) + 'px'; c.style.height = (H * (cssW || W) / W) + 'px';
        var g = c.getContext('2d'); g.scale(dp, dp); return { c: c, g: g };
      }
      /* the stand-in header picture: flat, photo-like, and SAYS what it is */
      function plate(W, H, wide) {
        var o = cv(W, H, wide ? W * 0.5 : W), g = o.g;
        g.fillStyle = '#BFD5E6'; g.fillRect(0, 0, W, H);                 /* a pale day sky */
        g.fillStyle = '#5E8FA8'; g.fillRect(0, H * 0.64, W, H * 0.36);   /* the canal */
        g.fillStyle = '#3E5A3A'; g.fillRect(0, H * 0.58, W, H * 0.07);   /* the far bank and palms */
        for (var i = 0; i < 6; i++) {
          var px = W * (0.08 + i * 0.17), ph = H * (0.22 + (i % 2) * 0.05);
          g.fillRect(px - 2, H * 0.64 - ph, 4, ph);
          g.beginPath(); g.arc(px, H * 0.64 - ph, H * 0.06, 0, TAU); g.fill();
        }
        g.fillStyle = 'rgba(28,36,30,0.55)';                              /* a cottage roofline */
        g.beginPath(); g.moveTo(W * 0.56, H * 0.64); g.lineTo(W * 0.56, H * 0.50); g.lineTo(W * 0.70, H * 0.42);
        g.lineTo(W * 0.84, H * 0.50); g.lineTo(W * 0.84, H * 0.64); g.closePath(); g.fill();
        g.font = 'bold ' + (wide ? 44 : 22) + 'px Georgia, serif'; g.textAlign = 'center';
        g.fillStyle = '#FFFFFF'; g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6;
        g.fillText('DORA CANAL COURT', W / 2, H * 0.56); g.shadowBlur = 0;
        if (wide) {
          g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
          g.beginPath(); g.arc(W - 90, 80, 46, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(255,220,120,.9)'; g.beginPath(); g.arc(W - 90, 80, 10, 0, TAU); g.fill();
          g.font = '14px system-ui'; g.fillStyle = '#FFFFFF'; g.fillText('Sun dial', W - 90, 148);
        }
        g.font = (wide ? 20 : 11) + 'px system-ui'; g.textAlign = 'left';
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(6, H - (wide ? 34 : 20), wide ? 470 : 250, wide ? 28 : 16);
        g.fillStyle = '#FFFFFF'; g.fillText('STAND-IN for the cottage photograph — the scene paints no sky', 12, H - (wide ? 13 : 8));
        return o;
      }
      function frame(W, H, wide, u, cap, dir) {
        var p = plate(W, H, wide), g = p.g;
        var k = mn(mx2(W / 390, 0.82), 1.3);
        var MR = MT.round(54 * k), m = moonC(MR);
        var mx = MT.round(W * (dir > 0 ? 0.66 : 0.34)), my = MT.round(mx2(H * 0.24, MR + 12));
        g.drawImage(m.c, mx - m.half, my - m.half, m.half * 2, m.half * 2);
        var L = MT.round(78 * k);
        var x0 = dir > 0 ? -L * 2.6 : W + L * 2.6, x1 = dir > 0 ? W + L * 0.8 : -L * 0.8;
        /* u = 'mid' puts the lead pair over the moon's centre */
        if (u === 'mid') { u = ((mx - dir * 2.0 * L) - x0) / (x1 - x0); }
        var x = x0 + (x1 - x0) * u, y = my + MR * 0.26 - sin(u * MT.PI) * MR * 0.12;
        rig(g, x, y, L, u, u * 6, { x: mx, y: my, r: MR }, dir, 4, -1);
        return { c: p.c, cap: cap };
      }
      panel('At 390px — the Picture Is 420px Tall', 'Start, middle (the team across the face), end. The moon sits off center on the side the sleigh flies into.',
        [frame(390, 420, false, 0.14, 'start', 1), frame(390, 420, false, 'mid', 'middle — the team across the face', 1), frame(390, 420, false, 0.82, 'end', 1)]);
      panel('At 1280px — Shown at Half Size', 'The moon clear of the centered page title and of the Sun-on-the-Canal dial in the top right. The sleigh flies the other way here so both sides are seen.',
        [frame(1280, 420, true, 0.14, 'start', -1), frame(1280, 420, true, 'mid', 'middle — the team across the face', -1), frame(1280, 420, true, 0.82, 'end', -1)]);
      /* the gallop: six frames of the cycle, lit; the ground line shows the
       * footfalls and the moment all four are off it */
      var GAL = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
      var galCap = ['left hind lands', 'both hinds down, fores swinging forward', 'left fore lands as the hinds push off', 'right fore lands, left fore under the shoulder', 'right fore alone on the ground, hinds folding forward', 'all four in the air — gathered'];
      function galFrame(ph, dark, i) {
        var o = cv(210, 200), g = o.g;
        g.fillStyle = dark ? '#2A3A4B' : '#E8CFA0'; g.fillRect(0, 0, 210, 200);
        if (dark) { var m = moonC(74); g.drawImage(m.c, 105 - m.half, 96 - m.half, m.half * 2, m.half * 2); }
        else { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(10, 184); g.lineTo(200, 184); g.stroke(); }
        g.save(); g.translate(100, 112); deer(g, 76, ph, dark); g.restore();
        return { c: o.c, cap: dark ? galCap[i] : (i + 1) + ' — ' + galCap[i] };
      }
      panel('The Gallop — Six Frames of One Stride', 'A transverse gallop from Muybridge\\'s plates: the feet land left hind, right hind, left fore, right fore, then all four leave the ground, gathered under the body. The spine arches when gathered and hollows when stretched; the head and neck pump against the stride. In the scene each animal is on its own point of the stride, offset down the team.',
        GAL.map(function (ph, i) { return galFrame(ph, false, i); }));
      panel('The Same Six, Dark on the Moon', 'How a guest sees a reindeer as it crosses the face. Santa and the sleigh never go dark.',
        GAL.map(function (ph, i) { return galFrame(ph, true, i); }));
      /* the rein flick: rest, the flick, the ripple arriving at the lead */
      function flickFrame(fl, cap) {
        var o = cv(640, 270), g = o.g;
        g.fillStyle = '#E8CFA0'; g.fillRect(0, 0, 640, 270);
        rig(g, 112, 180, 150, 0.31, 1.2, null, 1, 4, fl);
        return { c: o.c, cap: cap };
      }
      panel('Santa Flicks the Reins', 'Rob\\'s pick: his hands hold the reins; every so often he flicks them and the snap ripples down the line to the team. Three key frames: at rest, the flick (hands up, the snap leaving them), and the ripple arriving at the lead reindeer, whose head comes up. His body bobs and sways with the sleigh throughout.',
        [flickFrame(-1, 'at rest — the reins sag to each animal'), flickFrame(0.12, 'the flick — hands up, the snap leaving them'), flickFrame(0.9, 'the ripple arriving at the lead reindeer')]);
      /* the whole team at guest size (the 390 picture's sizes), three
       * points in time, so the stagger can be judged where it matters */
      var k390 = 1, L390 = MT.round(78 * k390);
      var tm = [0.2, 0.5, 0.8].map(function (u, i) {
        var o = cv(390, 120), g = o.g;
        g.fillStyle = '#BFD5E6'; g.fillRect(0, 0, 390, 120);
        rig(g, 70, 70, L390, u, u * 6, null, 1, 4, -1);
        return { c: o.c, cap: ['a moment', 'a moment later', 'later still'][i] + ' — guest size at 390' };
      });
      panel('The Team at Guest Size — Three Points in Time', 'Rob: "a sloppy mess of indistinguishable brown animal parts". Each animal is now on a clearly different point of the stride (a quarter apart), the pairs are spaced so no two bodies overlap, and the far animal of each pair is behind, above, 10% smaller and a shade darker. Four separate animals, at the size a guest sees them.', tm);
      /* ROW: the red nose */
      function noseFrame(nose, dark, cap) {
        var o = cv(300, 220), g = o.g;
        g.fillStyle = dark ? '#2A3A4B' : '#E8CFA0'; g.fillRect(0, 0, 300, 220);
        if (dark) { var m = moonC(84); g.drawImage(m.c, 150 - m.half, 110 - m.half, m.half * 2, m.half * 2); }
        g.save(); g.translate(112, 150); deer(g, 90, 0.85, dark, false, nose); g.restore();
        return { c: o.c, cap: cap };
      }
      panel('Row 1 — A Red Nose for the Lead Reindeer?', 'Rob asked whether the first reindeer will have a red nose like Rudolph. A: the lead animal has a red nose with a soft glow, and the glow still shows when the team goes dark on the moon. B: no red nose.',
        [noseFrame(true, false, 'A — the red nose, lit'), noseFrame(true, true, 'A — dark on the moon, the glow still showing'), noseFrame(false, false, 'B — no red nose'), noseFrame(false, true, 'B — dark on the moon')]);
      /* ROW: the moon edge, at 390 where the overhang happens */
      function edgeFrame(edge, cap) {
        var p = plate(390, 420, false), g = p.g, MR = 54, m = moonC(MR), mx = 257, my = 112;
        g.drawImage(m.c, mx - m.half, my - m.half, m.half * 2, m.half * 2);
        /* the lead pair crossing the rim: its centre 0.55 R past the moon's
         * centre, so the head is outside the disc and the body inside */
        var L = 78, x0 = -L * 2.6, x1 = 390 + L * 0.8, u = ((mx + 0.55 * MR - 2.0 * L) - x0) / (x1 - x0);
        var x = x0 + (x1 - x0) * u, y = my + MR * 0.26 - sin(u * MT.PI) * MR * 0.12;
        rig(g, x, y, L, u, u * 6, { x: mx, y: my, r: MR }, 1, 4, -1, { edge: edge });
        return { c: p.c, cap: cap };
      }
      panel('Row 2 — The Moon\\'s Edge, at 390', 'A reindeer is nearly the moon\\'s size on a phone, so part of it hangs over the rim while it crosses. A: the silhouette is cut exactly at the disc — dark inside, lit outside, through the animal. B: the whole animal goes dark while its center is on the disc, as the cranes do.',
        [edgeFrame('clip', 'A — cut exactly at the disc'), edgeFrame('whole', 'B — the whole animal, as the cranes')]);
      /* close-ups */
      var sl = [0, 1].map(function (i) {
        var o = cv(360, 260), g = o.g;
        g.fillStyle = '#E8CFA0'; g.fillRect(0, 0, 360, 260);
        g.save(); if (i) { g.translate(176, 290); g.scale(3.6, 3.6); } else { g.translate(180, 170); g.scale(2.2, 2.2); }
        if (!i) { sack(g); sleighBody(g); } santa(g, 0); g.restore();
        return { c: o.c, cap: i ? 'his face: the mustache over the full round beard, the rosy cheeks, the fur brim and pom' : 'Santa in the sleigh' };
      });
      panel('Santa, Close Up', 'To Rob\\'s notes: the classic hat as one filled shape — the fur brim, the full red body rising from it, the long cone flopping back and down to the pom; the blush on the cheekbone, below the eye and above the mustache\\'s outer edge; white hair down in front of and above the ear, the sideburn running into the beard; the arms in red sleeves with fur cuffs to the mittens.', sl);
      var hd = [0, 1].map(function (i) {
        var o = cv(320, 260), g = o.g;
        g.fillStyle = i ? '#2A3A4B' : '#E8CFA0'; g.fillRect(0, 0, 320, 260);
        if (i) { var m = moonC(100); g.drawImage(m.c, 160 - m.half, 140 - m.half, m.half * 2, m.half * 2); }
        g.save(); g.translate(150, 172); deer(g, 100, 0.85, !!i, false, false); g.restore();
        return { c: o.c, cap: i ? 'the same, dark on the moon' : 'the reindeer, large: the chest and hump, the mane, the slim waist, the hocks, the antlers' };
      });
      panel('The Reindeer, Close Up', 'To Rob\\'s notes: the legs taper smoothly with the muscle of the forearm and gaskin and slender cannons to the hooves — no joint blocks; the head has a broad, blunt muzzle, the eye set high and short rounded ears below the antler bases; the neck and body are ONE outline, the shoulder wrapping the base of the neck, so there is no seam.', hd);
      window.__done = true;
      </script>`);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 2000, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, 'Seasons - 4.14.0 step 1 round 3 santa scene.png') });
    await page.close();
    console.log('scene: ok');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
