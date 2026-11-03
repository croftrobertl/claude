'use strict';
/**
 * DCC Seasons — the style bible's lightest value (STYLE-BIBLE.md §3 and §6):
 * nothing in a piece is brighter than #F6F4EE. capLight() rewrites every
 * six-digit colour in a sprite whose relative luminance is above that
 * value, scaling it down in linear light so its hue stays (a warm cream
 * stays warm, a cool glint stays cool). Masks use three-digit #fff/#000
 * and are left alone on purpose: a mask is not paint.
 *
 *   const { capLight, lum, CAP } = require('./anniv-light');
 */
const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const unlin = v => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
const rgb = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
const lum = h => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const CAP = lum('#F6F4EE');
const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
function cap1(h) {
  const L = lum(h);
  if (L <= CAP + 1e-9) { return h; }
  const k = CAP / L;
  let out = hex(rgb(h).map(v => unlin(Math.min(1, lin(v) * k))));
  /* rounding can land a hair over: step down until it is not */
  while (lum(out) > CAP + 1e-9) { out = hex(rgb(out).map(v => v - 1)); }
  return out;
}
const capLight = s => s.replace(/#[0-9A-Fa-f]{6}\b/g, cap1);
module.exports = { capLight, lum, CAP };
