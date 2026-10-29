'use strict';
/**
 * DCC Seasons — the Anniversary crane as ONE jointed bird (4.13.5), so the
 * three approved poses can be in-betweened with a continuous silhouette.
 *
 * The three hand traces (tools/data/anniv-crane-trace.json) have different
 * point counts, so they cannot be blended. Here each is cut at the same
 * anatomical landmarks (bill tip, bill base, back of the head, the base of
 * the neck, the top of the tail, the rear thigh, the front thigh, the base
 * of the fore-neck, the chin) and every stretch between two landmarks is
 * resampled to a fixed count. The wings become separate structures with the
 * same counts in every pose: a leading edge, the line the flight feathers
 * grow from, the feather tips (the photo's own outline) and the inner edge
 * over the body. Standing, the near wing is FOLDED along the back (its
 * feathers lie back toward the tail, as the photo's do); standing and
 * calling, the far wing is folded away behind the body.
 *
 * Everything is in the bird's own frame: origin on the ground between the
 * feet, facing +x, y down, 1 = standing height (set from the tarsus, so
 * the three are one bird).
 *
 *   const { RIG } = require('./anniv-crane-rig');   // { stand, call, leap }
 *   node tools/anniv-crane-rig.js                   // writes tools/data/anniv-crane-rig.json
 */
const fs = require('fs');
const path = require('path');

const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'anniv-crane-trace.json'), 'utf8'));

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/* a polyline resampled to n points evenly by arc length (ends kept) */
function resample(P, n) {
  const s = [0];
  for (let i = 1; i < P.length; i++) { s.push(s[i - 1] + len(P[i - 1], P[i])); }
  const L = s[s.length - 1] || 1, out = [];
  for (let k = 0; k < n; k++) {
    const d = L * k / (n - 1);
    let i = 1; while (i < P.length - 1 && s[i] < d) { i++; }
    const u = (d - s[i - 1]) / ((s[i] - s[i - 1]) || 1);
    out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]);
  }
  return out;
}
/* a closed shape resampled so every pose's ring starts at the same place
 * (its front-most point) and winds the same way, so blending two of them
 * never folds the shape through itself */
function ring(P, n) {
  let r = resample(P.concat([P[0]]), n + 1).slice(0, n);
  let ar = 0; for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; }
  if (ar < 0) { r.reverse(); }
  let k = 0; for (let i = 1; i < n; i++) { if (r[i][0] > r[k][0]) { k = i; } }
  r = r.slice(k).concat(r.slice(0, k));
  return r.concat([r[0].slice()]);
}
const slice = (O, a, b) => (a <= b ? O.slice(a, b + 1) : O.slice(a).concat(O.slice(0, b + 1)));

/* the counts every pose shares, per stretch of the body outline */
const SEG = [['bill', 5], ['crown', 7], ['nape', 10], ['back', 10], ['tail', 14], ['legs', 10], ['breast', 12], ['foreneck', 12], ['chin', 7]];
const WING = { lead: 9, base: 9, tips: 20, fingers: 5, inner: 5 };
const WINGB = { lead: 9, base: 9, tips: 16, fingers: 6, inner: 5 };

/* where each pose's outline is cut (indices into its trace), plus the
 * stretches no photograph shows: the back line under an open wing */
const CUT = {
  stand: { bill: [0, 2], crown: [2, 8], nape: [8, 16], back: [16, 23], tail: [23, 34], legs: [34, 43], breast: [43, 51], foreneck: [51, 58], chin: [58, 0] },
  call: { bill: [0, 2], crown: [2, 8], nape: [8, 16], back: null, tail: [49, 56], legs: [56, 59], breast: [59, 69], foreneck: [69, 79], chin: [79, 0],
    backLine: [[418, 334], [404, 352], [384, 384], [362, 420], [344, 448], [334, 466]] },
  leap: { bill: [0, 3], crown: [3, 7], nape: [7, 13], back: null, tail: [71, 78], legs: [78, 80], breast: [80, 89], foreneck: [89, 92], chin: [92, 0],
    backLine: [[612, 375], [655, 366], [700, 368], [735, 392], [750, 446], [752, 510], [757, 527]] },
};
/* the open bills: upper and lower mandible as closed shapes */
const BILLS = {
  stand: [[[582, 267], [598, 263], [613, 261], [615, 265], [598, 266]], [[582, 267], [598, 266], [615, 265], [613, 268], [597, 268]]],
};
/* the near wing folded on the standing bird: the lead from the shoulder to
 * the folded wrist, the feathers lying back to the lower edge of the folded
 * wing (the trace's 'back' region) */
const FOLD = {
  stand: { lead: [[652, 350], [670, 368], [690, 388], [710, 407], [730, 424], [750, 442], [766, 456], [780, 472]],
    base: [[784, 490], [766, 476], [746, 460], [726, 442], [706, 424], [686, 404], [668, 384], [656, 366]],
    tips: [[790, 506], [784, 512], [776, 508], [768, 504], [760, 498], [748, 485], [736, 472], [724, 457], [712, 442], [700, 426], [690, 412], [678, 397], [668, 384]],
    inner: [[668, 384], [662, 374], [656, 364], [652, 350]] },
};

function norm(P, q) { const r = P.ref; return [(q[0] - r.ground[0]) * r.face / r.H, (q[1] - r.ground[1]) / r.H]; }

function build(k) {
  const P = T[k], O = P.out, C = CUT[k], N = q => norm(P, q), U = {};
  /* the body outline, stretch by stretch */
  U.seg = {};
  for (const [name, n] of SEG) {
    let pts;
    if (name === 'back' && !C.back) { pts = C.backLine; } else { pts = slice(O, C[name][0], C[name][1]); }
    U.seg[name] = resample(pts.map(N), n);
  }
  /* the wings: A is the one toward the tail (calling bird's wing, the leap's
   * near wing, the standing bird's folded wing), B the one toward the head
   * (the leap's far wing; folded away behind the body otherwise) */
  const wingOf = (W, spec) => {
    const tips = [];
    const fingerPts = W.tips.fingers.map(i => O[i]);
    const fr = resample(fingerPts, spec.fingers);
    const e0 = W.tips.edge[0], e1 = W.tips.edge[1], seg = e0 <= e1 ? O.slice(e0, e1 + 1) : O.slice(e1, e0 + 1).reverse();
    const er = resample(seg, spec.tips - spec.fingers + 1).slice(1);
    return { lead: resample(W.lead.map(N), spec.lead), base: resample(W.base.map(N), spec.base), tips: fr.concat(er).map(N), inner: resample(W.inner.map(N), spec.inner), open: 1 };
  };
  if (k === 'stand') {
    const F = FOLD.stand;
    U.wa = { lead: resample(F.lead.map(N), WING.lead), base: resample(F.base.map(N), WING.base), tips: resample(F.tips.map(N), WING.tips), inner: resample(F.inner.map(N), WING.inner), open: 0 };
  } else if (k === 'call') { U.wa = wingOf(P.wings[0], WING); } else { U.wa = wingOf(P.wings[1], WING); }
  if (k === 'leap') { U.wb = wingOf(P.wings[0], WINGB); }
  else {
    /* folded away: every point gathered at the shoulder, behind the body */
    const sh = U.seg.back[1];
    const z = n => Array.from({ length: n }, () => sh.slice());
    U.wb = { lead: z(WINGB.lead), base: z(WINGB.base), tips: z(WINGB.tips), inner: z(WINGB.inner), open: 0 };
  }
  /* legs: near and far, hip (inside the belly), where the feathers end,
   * the ankle, the foot; toes */
  const legOf = L => { const p = L.p.length === 5 ? [L.p[0], L.p[1], L.p[2], L.p[4]] : L.p; return { p: p.map(N), toes: resample(L.toes.map(N), 3), w: L.w.map(v => v / P.ref.H) }; };
  U.legN = legOf(P.legs.find(L => !L.far)); U.legF = legOf(P.legs.find(L => L.far));
  /* the head */
  const bills = BILLS[k] || P.bill;
  U.billU = ring(bills[0].map(N), 6); U.billL = ring(bills[1].map(N), 6);
  U.crown = ring(P.crown.map(N), 10); U.cheek = ring(P.cheek.map(N), 8);
  U.eye = N(P.eye).concat([P.eye[2] / P.ref.H]);
  /* the bustle (standing), the hanging tertials (calling), the tail (leap) */
  U.plB = resample(P.plumes.base.map(N), 7); U.plT = resample(P.plumes.tips.map(N), 7);
  /* where the photographs show rust staining: centre, radius, strength */
  const rust = (P.rust || []).map(r => N(r).concat([r[2] / P.ref.H, r[3]]));
  while (rust.length < 4) { rust.push(rust[rust.length - 1].slice(0, 3).concat([0])); }
  U.rust = rust.slice(0, 4);
  U.k = k;
  return U;
}

const RIG = { stand: build('stand'), call: build('call'), leap: build('leap') };
/* rust on the folded wing of the standing bird and on each open wing's
 * coverts, as a share along the wing (0 shoulder, 1 wrist) and strength */
RIG.stand.wRust = [0.55, 0.3]; RIG.call.wRust = [0.5, 0.35]; RIG.leap.wRust = [0.45, 0.4];

module.exports = { RIG, SEG, WING, WINGB, resample };
if (require.main === module) {
  const out = path.join(__dirname, 'data', 'anniv-crane-rig.json');
  const r = v => (Array.isArray(v) ? v.map(r) : (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, r(b)])) : v)));
  fs.writeFileSync(out, JSON.stringify(r(RIG)));
  console.log(out, fs.statSync(out).size, 'bytes');
}
