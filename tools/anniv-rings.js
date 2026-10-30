'use strict';
/**
 * DCC Seasons — the Anniversary's two gold rings, LINKED (Rob, 2026-10-30:
 * "they sit side by side and appear to pass through each other's sides,
 * which is physically impossible"). One band lies tilted toward us; the
 * other stands up through its opening. Drawn in depth order — the lying
 * band's far half, the standing band, the lying band's near half — so the
 * standing band passes IN FRONT of the far rim and BEHIND the near rim:
 * each passes through the other's opening, and at each crossing the
 * overlap shows which is in front.
 *
 * Each band is a gold torus seen at an angle: a thick elliptical stroke
 * shaded across its width (dark at the inner edge, a pale highlight toward
 * the light, up and to the left as every Seasons piece is lit), with the
 * far half a little darker (its inside face is in shade).
 *
 *   const { rings } = require('./anniv-rings');  rings('dccAnR') -> 'w h|<svg>'
 */
const f = v => Math.round(v * 100) / 100;
/* half of an ellipse (centre c, radii rx ry, rotated a degrees): 'far' is
 * the half away from us (its upper side before rotation) */
function half(c, rx, ry, a, far) {
  const L = [c[0] - rx, c[1]], R = [c[0] + rx, c[1]];
  return `<path d="M${f(L[0])} ${f(L[1])} A${f(rx)} ${f(ry)} 0 0 ${far ? 1 : 0} ${f(R[0])} ${f(R[1])}" transform="rotate(${a} ${f(c[0])} ${f(c[1])})"`;
}
function band(id, c, rx, ry, a, t, which) {
  /* which: 'far' | 'near' | 'all' */
  const halves = which === 'all' ? [true, false] : [which === 'far'];
  return halves.map(far => {
    const g = far ? `url(#${id}f)` : `url(#${id}n)`;
    return `${half(c, rx, ry, a, far)} fill="none" stroke="#5E4410" stroke-width="${f(t + 0.7)}"/>` +
      `${half(c, rx, ry, a, far)} fill="none" stroke="${g}" stroke-width="${f(t)}"/>` +
      /* the inner edge in shade, the outer edge catching the light */
      `${half(c, rx - t * 0.32, ry - t * 0.32, a, far)} fill="none" stroke="#7A5A14" stroke-width="${f(t * 0.22)}" opacity=".6"/>` +
      (far ? '' : `${half(c, rx + t * 0.18, ry + t * 0.18, a, far)} fill="none" stroke="#FFF3C8" stroke-width="${f(t * 0.18)}" opacity=".75"/>`);
  }).join('');
}
function rings(id) {
  const W = 34, H = 28, t = 2.6;
  /* the lying band: wide and flat; the standing band: narrower in view,
   * tilted up and to the right, its lower arc through the lying band's
   * opening */
  const A = { c: [12.4, 17.2], rx: 9, ry: 4.6, a: -14 };
  const B = { c: [21.2, 12.4], rx: 8.6, ry: 5.2, a: 64 };
  /* in the page's units across the whole band, so its two halves share one
   * gradient (each half's own box made a seam where they met) */
  const grad = (k, c0, c1, c2, R) => `<linearGradient id="${id}${k}" gradientUnits="userSpaceOnUse" x1="${f(R.c[0] - R.rx)}" y1="${f(R.c[1] - R.rx)}" x2="${f(R.c[0] + R.rx)}" y2="${f(R.c[1] + R.rx)}"><stop offset="0" stop-color="${c0}"/><stop offset=".45" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
  /* one gradient per band, both halves (two made a seam where they met) */
  const defs = `<defs>${grad('n', '#F6E3A0', '#E2C25A', '#A9831F', A)}${grad('f', '#F6E3A0', '#E2C25A', '#A9831F', A)}${grad('bn', '#F3DC8E', '#D9B64C', '#9C7A1C', B)}${grad('bf', '#F3DC8E', '#D9B64C', '#9C7A1C', B)}</defs>`;
  const bandB = band(id + 'b', B.c, B.rx, B.ry, B.a, t, 'all').replace(/url\(#([^)]*?)b([fn])\)/g, (m, p, k) => `url(#${id}b${k})`);
  const body = defs +
    band(id, A.c, A.rx, A.ry, A.a, t, 'far') +
    bandB +
    band(id, A.c, A.rx, A.ry, A.a, t, 'near') +
    /* a glint on each band */
    `<path d="M${f(A.c[0] - 6.6)} ${f(A.c[1] + 1.6)} l1.1 -.35 l.35 -1.1 l.35 1.1 l1.1 .35 l-1.1 .35 l-.35 1.1 l-.35 -1.1 Z" fill="#FFFFFF"/>` +
    `<path d="M${f(B.c[0] + 1.4)} ${f(B.c[1] - 7.4)} l.9 -.3 l.3 -.9 l.3 .9 l.9 .3 l-.9 .3 l-.3 .9 l-.3 -.9 Z" fill="#FFFFFF" opacity=".9"/>`;
  return `${W} ${H}|${body}`;
}
module.exports = { rings };
