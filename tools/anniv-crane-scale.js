'use strict';
/**
 * DCC Seasons — the crane's body and head keep ONE scale through the dance
 * (4.13.5 fix 2: "the leaping bird's body grows during the leap"). Measures,
 * on every one of the 35 pre-drawn frames (tools/anniv-crane3.js dcFrames on
 * the rig):
 *  - head: the crown patch and the cheek patch, by area (geometric mean,
 *    square-rooted so it reads as a length), and the eye to the back of the
 *    head;
 *  - bill: each mandible's length, tip to base;
 *  - body: the trunk (back + tail + rump + breast outline, no neck, legs or
 *    wings): its length along its own long axis, breast to rump, its area
 *    square-rooted, and its size (their geometric mean).
 * Prints each frame as a % of the standing bird's, and the worst; exits 1
 * if the head, bill or body size is outside +-LIM% (default 4) on any frame,
 * or the body's length or area outside twice that.
 *
 *   node tools/anniv-crane-scale.js [--lim=4]
 */
const vm = require('vm');
const { DC3_SRC, DANCE_SRC } = require('./anniv-crane3');
const { RIG } = require('./anniv-crane-rig');
const LIM = +((process.argv.find(a => a.startsWith('--lim=')) || '--lim=4').slice(6));
const ctx = { RIG }; vm.createContext(ctx);
vm.runInContext(DC3_SRC + DANCE_SRC + '; this.F = dcFrames(RIG); this.at = c3At; this.L = c3L;', ctx);
const F = ctx.F, L = ctx.L;
function area(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
function axis(P) {
  const n = P.length, c = [0, 0]; P.forEach(p => { c[0] += p[0] / n; c[1] += p[1] / n; });
  let a = 0, b = 0, d = 0; P.forEach(p => { const x = p[0] - c[0], y = p[1] - c[1]; a += x * x; b += x * y; d += y * y; });
  const th = 0.5 * Math.atan2(2 * b, a - d), u = [Math.cos(th), Math.sin(th)];
  let lo = 1e9, hi = -1e9; P.forEach(p => { const v = p[0] * u[0] + p[1] * u[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); });
  return hi - lo;
}
function blen(B) { let x = 0; B.forEach(p => { x = Math.max(x, L(B[0], p)); }); return x; }
function m(U) {
  const s = U.seg, trunk = [].concat(s.back, s.tail, s.legs, s.breast);
  return { head: Math.pow(area(U.crown) * area(U.cheek), 0.25), skull: L(U.eye, s.nape[0]), bill: (blen(U.billU) + blen(U.billL)) / 2, body: Math.sqrt(Math.sqrt(area(trunk)) * axis(trunk)), length: axis(trunk), area: Math.sqrt(area(trunk)) };
}
const ref = m(F[0].U); let worst = { head: 0, skull: 0, bill: 0, body: 0, length: 0, area: 0 }, bad = 0;
/* held to the limit: the head, the bill and the body's SIZE; the body's
 * length and area alone are shown too: they trade against each other as the
 * shape changes (a crouch is shorter and deeper), and are held to 2x */
const LIMK = { head: LIM, skull: LIM, bill: LIM, body: LIM, length: 2 * LIM, area: 2 * LIM };
const pct = (v, r) => (v / r - 1) * 100;
for (const f of F) {
  const v = m(f.U), d = {}; for (const k in v) { d[k] = pct(v[k], ref[k]); }
  for (const k in d) { if (Math.abs(d[k]) > Math.abs(worst[k])) { worst[k] = d[k]; } if (Math.abs(d[k]) > LIMK[k]) { bad++; } }
  console.log(`${f.key.padEnd(5)} ` + Object.keys(d).map(k => `${k} ${d[k].toFixed(1).padStart(5)}%`).join('  '));
}
console.log(`${F.length} frames · worst: ` + Object.keys(worst).map(k => `${k} ${worst[k].toFixed(1)}%`).join(' · ') + ` (limit +-${LIM}%)`);
process.exit(bad ? 1 : 0);
