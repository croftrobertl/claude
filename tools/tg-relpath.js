'use strict';
/**
 * DCC Seasons — 4.13.2: rewrite the Thanksgiving sprites' path data from
 * absolute to RELATIVE commands, losslessly, to buy back bytes under the
 * 82,225-byte ceiling. Every coordinate is handled in integer units at the
 * path's own precision (10^decimals), so each point after the rewrite is
 * EXACTLY the point before it; each rewritten path is parsed back and
 * compared point for point, and the run fails on any difference.
 * Never a numeric-precision regex (CLAUDE.md): paths are tokenized.
 *
 *   node tools/tg-relpath.js [--write] key key ...
 */
const fs = require('fs');
const path = require('path');
const ENG = path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js');

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };
function tokens(d) {
  const out = [], re = /([MLHVCSQTZmlhvcsqtz])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)/g; let m;
  while ((m = re.exec(d))) { out.push(m[1] ? m[1] : m[2]); }
  return out;
}
/* absolute points as integer units: [[cmd, [ints...]], ...] */
function parse(d, P) {
  const t = tokens(d), segs = []; let i = 0, cmd = null;
  const num = s => Math.round(parseFloat(s) * P);
  while (i < t.length) {
    if (/[A-Za-z]/.test(t[i])) { cmd = t[i++]; if (cmd === 'Z' || cmd === 'z') { segs.push(['Z', []]); continue; } }
    if (cmd !== cmd.toUpperCase()) { throw new Error('already relative: ' + cmd); }
    const n = ARGS[cmd]; if (n === undefined) { throw new Error('unsupported command ' + cmd); }
    const a = t.slice(i, i + n).map(num); i += n;
    segs.push([cmd, a]);
    if (cmd === 'M') { cmd = 'L'; }
  }
  return segs;
}
function decimals(d) { let k = 0; for (const n of d.match(/\d*\.\d+/g) || []) { k = Math.max(k, n.split('.')[1].length); } return k; }
function fmt(v, P) {   /* an integer number of 1/P units, shortest form */
  let s = (v / P).toFixed(Math.log10(P)).replace(/\.?0+$/, '');
  if (s === '-0') { s = '0'; }
  return s.replace(/^(-?)0\./, '$1.');
}
function join(nums) { let o = ''; for (const n of nums) { o += (o && !n.startsWith('-') ? ' ' : '') + n; } return o; }   /* a minus sign is its own separator */
function toRel(d) {
  const p = decimals(d), P = Math.pow(10, p), segs = parse(d, P);
  let cx = 0, cy = 0, sx = 0, sy = 0, out = '', last = '';
  for (const [c, a] of segs) {
    let rc, r;
    if (c === 'Z') { out += 'z'; cx = sx; cy = sy; last = 'z'; continue; }
    if (c === 'M') { r = [a[0] - cx, a[1] - cy]; rc = out ? 'm' : 'M'; if (!out) { r = a; } cx = a[0]; cy = a[1]; sx = cx; sy = cy; }
    else if (c === 'H') { rc = 'h'; r = [a[0] - cx]; cx = a[0]; }
    else if (c === 'V') { rc = 'v'; r = [a[0] - cy]; cy = a[0]; }
    else { rc = c.toLowerCase(); r = a.map((v, k) => v - (k % 2 ? cy : cx)); cx = a[a.length - 2]; cy = a[a.length - 1]; }
    const s = join(r.map(v => fmt(v, P)));
    out += (rc === last && rc !== 'm' && rc !== 'M' ? (s.startsWith('-') ? '' : ' ') : rc) + s;
    last = rc === 'M' ? 'L' : rc === 'm' ? 'l' : rc;   /* after an ABSOLUTE M, bare pairs are absolute: the first l must be written */
  }
  return { d: out, P };
}
/* parse a relative path back to absolute integer points, to prove the rewrite */
function absBack(d, P) {
  const t = tokens(d), pts = []; let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0;
  const num = s => Math.round(parseFloat(s) * P);
  while (i < t.length) {
    if (/[A-Za-z]/.test(t[i])) { cmd = t[i++]; if (cmd === 'z' || cmd === 'Z') { pts.push('Z'); cx = sx; cy = sy; continue; } }
    const up = cmd.toUpperCase(), rel = cmd !== up, n = ARGS[up], a = t.slice(i, i + n).map(num); i += n;
    let abs;
    if (up === 'H') { abs = [rel ? cx + a[0] : a[0]]; cx = abs[0]; }
    else if (up === 'V') { abs = [rel ? cy + a[0] : a[0]]; cy = abs[0]; }
    else { abs = a.map((v, k) => rel ? v + (k % 2 ? cy : cx) : v); cx = abs[abs.length - 2]; cy = abs[abs.length - 1]; }
    if (up === 'M') { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; }
    pts.push(up === 'M' ? 'M' : up === 'H' || up === 'V' ? 'L' : up, abs.join(','));
  }
  return pts;
}
function absPts(d, P) { return parse(d, P).flatMap(([c, a]) => c === 'Z' ? ['Z'] : [c === 'H' || c === 'V' ? 'L' : c, a.join(',')]); }

if (require.main === module) {
  const keys = process.argv.slice(2).filter(a => !a.startsWith('--'));
  let src = fs.readFileSync(ENG, 'utf8'), saved = 0;
  for (const k of keys) {
    const re = new RegExp("\\n\\t\\t" + k + ": '([^']*)'"), m = src.match(re);
    if (!m) { console.log('skip (not a string sprite):', k); continue; }
    let body = m[1];
    const nb = body.replace(/ d="([^"]*)"/g, (all, d) => {
      if (!/^[MLHVCSQTZ\d.\- ,e]+$/.test(d) || /[a-z]/.test(d.replace(/e-?\d/g, ''))) { return all; }
      const { d: r, P } = toRel(d);
      const A = absPts(d, P), B = absBack(r, P);
      /* H/V come back as L with both coordinates: compare on the full points */
      const norm = (pts) => pts.join(' ');
      if (r.length >= d.length) { return all; }
      const a2 = absBack(d, P);
      if (norm(a2) !== norm(B)) { throw new Error(k + ': rewrite changed a point\n' + d + '\n' + r); }
      return ' d="' + r + '"';
    });
    saved += body.length - nb.length;
    console.log(k, body.length, '->', nb.length);
    src = src.replace(re, () => "\n\t\t" + k + ": '" + nb + "'");
  }
  console.log('raw bytes saved', saved);
  if (process.argv.includes('--write')) { fs.writeFileSync(ENG, src); console.log('written'); }
}
module.exports = { toRel, absBack };
