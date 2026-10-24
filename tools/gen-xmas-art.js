'use strict';
/**
 * DCC Seasons — 4.14.0: the two Christmas drawings that are built from
 * geometry rather than drawn by hand — the sabal palm (palmxmas) and the
 * flamingo in a Santa hat (flamingoxmas). Prints their sprite strings, in
 * the engine's 'w h|svg' form, as JSON. The engine carries the output
 * verbatim; re-run this and paste when a drawing changes, never edit the
 * path data in engine.js by hand (a trim regex corrupted four sprites in
 * 3.2.0 — CLAUDE.md).
 *
 *   node tools/gen-xmas-art.js            -> {"palmxmas": "...", "flamingoxmas": "..."}
 *
 * Both were checked at 50% over CC0 photographs before Rob saw them
 * (tools/xmas-final.js renders the overlays):
 *   palm      — "SabalPalm.jpg", William Bumgarner, CC0 (Wikimedia Commons)
 *   flamingo  — "American flamingo in Galápagos (Phoenicopterus ruber)",
 *               E. Bailey, CC0 (Wikimedia Commons)
 */
const f1 = n => (Math.round(n * 10) / 10).toString();
const P = (x, y) => f1(x) + ' ' + f1(y);
const rad = d => d * Math.PI / 180;

/* ---- the sabal palm ---------------------------------------------------
 * Rob (round 4): "too symmetrical"; "needs clear branches before the
 * leaves spike out"; "more up top"; "the leaf parts starting to sprawl
 * out further along the branch". So every frond is a petiole (a visible
 * stalk) from the crown point, the costa running on past the hastula, and
 * the leaflets leaving the costa ALONG its length, not from one point —
 * the costapalmate fan. Angles, lengths and spreads are set by hand and
 * deliberately unequal: no mirror symmetry either way. Seven fronds rise
 * above the crown point, two go out to the sides, two old ones droop. */
function palm() {
  const C = [19.6, 21.6], out = [];
  /* the trunk, leaning a touch, with the crossed frond boots under the crown */
  out.push(`<path d="M17.7 47 C18.1 38 18.5 29 18.7 22.4 L21 22.6 C21.4 29 21.7 38 22.2 47 Z" fill="url(#tr)"/>`);
  for (let y = 24.4, i = 0; y < 34; y += 2.6, i++) {
    const w = 1.5 - i * 0.12, x = 19.9 + (i % 2 ? 0.25 : -0.2);
    out.push(`<path d="M${P(x - w, y)} L${P(x, y - 1.7)} L${P(x + w, y)} L${P(x, y + 0.7)} Z" fill="#5C3A1F" opacity=".7"/>`);
    out.push(`<path d="M${P(x - w * 0.8, y + 0.3)} L${P(x - w * 1.25, y - 1.4)}" stroke="#7A5230" stroke-width=".55"/>`);
  }
  /* one frond: a, the petiole's angle (deg, -90 up); p, its length; f,
   * the leaflets' length; s, the fan's half-spread (deg); n, leaflets;
   * sag, how the petiole bows under its own weight; col, [petiole, leaf] */
  function frond(a, p, f, s, n, sag, col, skew) {
    const d = rad(a), ux = Math.cos(d), uy = Math.sin(d);
    /* the petiole bows down toward its tip in proportion to how level it is */
    const bow = sag * p * Math.abs(ux);
    const H = [C[0] + ux * p, C[1] + uy * p + bow];
    const M = [C[0] + ux * p * 0.5 - uy * 0.4, C[1] + uy * p * 0.5 + bow * 0.25];
    out.push(`<path d="M${P(C[0], C[1])} Q${P(M[0], M[1])} ${P(H[0], H[1])}" stroke="${col[0]}" stroke-width=".75" fill="none" stroke-linecap="round"/>`);
    /* the costa runs on past the hastula; leaflets leave it along its length */
    const da = Math.atan2(H[1] - M[1], H[0] - M[0]), costa = f * 0.42;
    const E = [H[0] + Math.cos(da) * costa, H[1] + Math.sin(da) * costa + sag * costa * 0.6];
    out.push(`<path d="M${P(H[0], H[1])} L${P(E[0], E[1])}" stroke="${col[0]}" stroke-width=".55" fill="none" stroke-linecap="round"/>`);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;                                   /* across the fan */
      const off = (t - 0.5) * 2 * s * 1.45 + (skew || 0) * (t - 0.5) * (t - 0.5) * 40;
      const along = 0.08 + 0.55 * (1 - Math.abs(t - 0.5) * 2);   /* the middle leaflets leave furthest along: the fan opens past the hastula */
      const B = [lerp(H[0], E[0], along), lerp(H[1], E[1], along)];
      const la = da + rad(off), len = f * (0.62 + 0.38 * Math.cos((t - 0.5) * Math.PI)) * (0.9 + ((k * 37) % 10) / 50);
      /* the tip droops: more on the outer leaflets and on a level frond */
      const droop = len * (0.12 + 0.28 * Math.abs(t - 0.5) * 2) * (0.5 + 0.5 * Math.abs(Math.cos(la)));
      const T = [B[0] + Math.cos(la) * len, B[1] + Math.sin(la) * len + droop];
      const Q = [B[0] + Math.cos(la) * len * 0.55, B[1] + Math.sin(la) * len * 0.55 + droop * 0.15];
      const nx = -Math.sin(la) * 0.42, ny = Math.cos(la) * 0.42;
      out.push(`<path d="M${P(B[0] - nx, B[1] - ny)} Q${P(Q[0] - nx * 0.7, Q[1] - ny * 0.7)} ${P(T[0], T[1])} Q${P(Q[0] + nx * 0.7, Q[1] + ny * 0.7)} ${P(B[0] + nx, B[1] + ny)} Z" fill="${col[1]}"/>`);
    }
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  /* light enough to read on the navy footer as well as on cream */
  const BACK = ['#5E9A48', '#4DAE60'], MID = ['#6AA24A', '#5CC070'], FRONT = ['#7DAE52', '#7BD88A'], OLD = ['#A09C52', '#B8BC66'];
  /* the two old fronds, drooping low, drawn first (furthest back) */
  frond(146, 5.2, 8.4, 30, 9, 0.55, OLD, 0.4);
  frond(31, 4.4, 7.6, 26, 8, 0.6, OLD, -0.3);
  /* behind: the tall ones, darkest */
  frond(-101, 7.6, 10.6, 34, 12, 0.08, BACK, 0.2);
  frond(-134, 6.6, 10.2, 31, 11, 0.18, BACK, -0.25);
  frond(-66, 7.2, 11.2, 36, 12, 0.14, BACK, 0.35);
  /* the sides, bowing */
  frond(-171, 6.2, 9.4, 29, 10, 0.34, MID, 0.3);
  frond(-14, 5.6, 9.9, 32, 11, 0.3, MID, -0.4);
  /* in between, rising */
  frond(-151, 4.6, 8.6, 30, 10, 0.2, MID, 0.1);
  frond(-41, 5.0, 9.2, 33, 11, 0.18, MID, -0.15);
  /* facing the viewer: short petioles, wide fans, over the crown */
  frond(-86, 3.2, 7.4, 48, 13, 0.1, FRONT, 0.25);
  frond(-118, 2.8, 6.6, 40, 11, 0.12, FRONT, -0.3);
  out.push(`<circle cx="${f1(C[0])}" cy="${f1(C[1])}" r="1.5" fill="#3C5A26"/>`);
  return '40 47|<defs><linearGradient id="tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9A6A3C"/><stop offset=".5" stop-color="#7A5230"/><stop offset="1" stop-color="#55381F"/></linearGradient></defs>' + out.join('');
}

/* ---- the flamingo -----------------------------------------------------
 * Rob (round 4): the beak "isn't tucked right up against its neck in the
 * real photo" — it hangs with clear space in front of the neck; and the
 * neck "is also not so short and dips below going back up" — a long S:
 * down from the breast into a dip, then up to the head. Proportions read
 * off the CC0 photograph (1 unit = 15 photo px): head top to feet 67
 * units, body 31 long, the neck's dip at the bottom of the breast.
 * Everything else as approved: the webbed foot on the folded leg, the
 * folded leg crossing the standing one at mid-leg, the hat's cone falling
 * back to a pom, the scarf, the dark flight feathers along the wing. */
function flamingo() {
  return '42 74|<defs><linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA8C8"/><stop offset="1" stop-color="#EC6AA0"/></linearGradient><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F78DB2"/><stop offset="1" stop-color="#D64A86"/></linearGradient><linearGradient id="nk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFB8D2"/><stop offset="1" stop-color="#F07AA8"/></linearGradient></defs>' +
    '<g transform="translate(0 3)">' +
    /* legs first, behind the body: the standing leg (ankle bending back) and the folded one across it */
    '<path d="M21.2 30 L20.6 46.6 L19.8 66.4" stroke="#E64980" stroke-width="1.5" stroke-linecap="round" fill="none"/>' +
    '<circle cx="20.6" cy="46.6" r="1.15" fill="#D83A72"/>' +
    '<path d="M16.6 67 L19.8 66.4 L23.4 67" stroke="#E64980" stroke-width="1.3" stroke-linecap="round" fill="none"/>' +
    '<path d="M18.2 66.8 L19.8 66.4 L21.6 66.8 L19.9 67.6 Z" fill="#D83A72"/>' +
    '<path d="M25 30 L24.4 45.4 L15.6 46.4" stroke="#E64980" stroke-width="1.5" stroke-linecap="round" fill="none"/>' +
    '<circle cx="24.4" cy="45.4" r="1.15" fill="#D83A72"/>' +
    '<path d="M15.8 46.2 L12.4 48.8 L14 49.2 L15.4 48.4 L16.8 49.4 L17.2 47.8 Z" fill="#D83A72"/>' +
    /* the body: a long oval, the folded wing over it, the dark primaries along its trailing edge */
    '<path d="M9.4 26.4 C9.8 19.6 15 14.8 21.4 14.6 C29.4 14.4 37.4 18.6 40.6 25.2 C38 28 32.8 30.4 25.8 31.4 C18.4 32.4 11.6 30.6 9.4 26.4 Z" fill="url(#bd)"/>' +
    '<path d="M14.4 21.6 C18.4 17.2 27.2 16.8 34 21 C37 22.9 39 24.4 40.2 25.6 C35.4 27.8 28.4 29.2 21.4 28.8 C16.8 28.4 13.8 25.8 14.4 21.6 Z" fill="url(#wg)"/>' +
    '<path d="M26.6 28.7 C31.6 28.2 36.4 27.2 40.2 25.6 C38.8 28.2 35.2 29.9 30.6 30.3 C29 30.4 27.6 29.8 26.6 28.7 Z" fill="#2B2B2B" opacity=".88"/>' +
    '<path d="M18 20.2 C22 18.4 27 18.6 31 20.6" stroke="#FFC2DA" stroke-width=".7" fill="none" opacity=".7"/>' +
    /* the neck: from the breast DOWN into the dip, then a long rise, curving back at the top and over into the head */
    '<path d="M12.6 25.4 C9 29.8 5.2 30.2 4.8 25.6 C4.5 21 6.6 16 7.6 11.8 C8.3 8.6 8.3 5.8 6.4 4.6" stroke="url(#nk)" stroke-width="3.1" fill="none" stroke-linecap="round"/>' +
    '<path d="M5.8 24.4 C5.7 20.6 7.4 16.4 8.4 12.4" stroke="#FFD0E2" stroke-width=".7" fill="none" opacity=".6"/>' +
    /* the scarf at the base of the neck, its tails hanging in the dip */
    '<path d="M2.9 21.4 C4.5 19.8 7.5 20 8.5 21.8 C7.1 23.8 4.3 23.8 2.9 21.4 Z" fill="#2F9E44"/>' +
    '<path d="M3.7 22.8 C2.4 25.2 2.5 28 3.7 29.8 C5 27.8 5.4 25.2 5 23.2 Z" fill="#2F9E44"/>' +
    '<path d="M3.5 21.2 C5.1 20.3 7 20.3 8.2 21.4" stroke="#E03131" stroke-width=".9" fill="none" stroke-dasharray="1.6 1.3"/>' +
    '<path d="M3 25.8 L4.6 25.6 M3 27.8 L4.4 27.7" stroke="#E03131" stroke-width=".9"/>' +
    /* the head, small, and the beak: thick and pale at the base, bent sharply down at the middle, black at the tip — hanging in front of the neck */
    '<circle cx="5.3" cy="4.6" r="2.7" fill="#F783AC"/>' +
    '<path d="M3.6 3 L0.6 7.6 C0.3 8.3 0.3 9 0.4 9.6 L2.4 9.6 C2.5 9 2.8 8.4 3.4 7.6 L5 6 Z" fill="#F3E6EA"/>' +
    '<path d="M0.4 9.6 L0.8 14.2 C1 14.9 1.9 15 2.1 14.4 L2.4 9.6 Z" fill="#1A1A1A"/>' +
    '<path d="M1.4 9.6 L1.6 12.6" stroke="#4A4A4A" stroke-width=".35"/>' +
    '<circle cx="5.5" cy="3.8" r=".85" fill="#1A1A1A"/><circle cx="5.25" cy="3.55" r=".3" fill="#FFF"/>' +
    /* the Santa hat: the fur brim on the head, the cone falling back to the pom */
    '<path d="M3 2.6 C3.3 -1.4 7.6 -2.8 10.8 -0.8 C14 1.2 16.2 4.6 17 9 C14.6 6.2 11.8 3.8 8.6 2.8 Z" fill="#E03131"/>' +
    '<path d="M10.8 -0.8 C14 1.2 16.2 4.6 17 9 C14.2 6.6 11.4 4.4 9.2 3.4 Z" fill="#A61E1E" opacity=".5"/>' +
    '<path d="M2.6 3 C5 1.4 7.8 1.6 9.6 3.2" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<circle cx="17.1" cy="9.8" r="1.7" fill="#FFFFFF"/><circle cx="16.6" cy="9.3" r=".6" fill="#E9E4DA"/>' +
    '</g>';
}

if (require.main === module) {
  process.stdout.write(JSON.stringify({ palmxmas: palm(), flamingoxmas: flamingo() }, null, 1) + '\n');
}
module.exports = { palm, flamingo };
