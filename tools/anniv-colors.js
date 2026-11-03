'use strict';
/**
 * DCC Seasons — the Anniversary's color round (for 4.14.6, Rob 2026-11-03:
 * "I'm not a fan of the gold. The site pink/coral and blues are more us").
 * Only the date band (11·11·11) and the two figures change color; their
 * shapes, sizes and motion are 4.14.5's, and the rings, toast, crystal and
 * year crystal stay gold.
 *
 * The site's own colors, measured from the live home page's CSS (not the
 * Elementor kit): coral #F08080, main blue #0F6DBF, button blue #0A50B2,
 * navy #0A3D62, cream no brighter than #F6F4EE (the style bible).
 *
 * Every candidate is held to the style bible (shading, never an outline;
 * light from the upper left: lighter at the top, the shadow down-right in a
 * darker tone) and to READABILITY, measured as WCAG contrast:
 *   - the numerals against their own band (date): at least 4.5:1;
 *   - the whole piece against the header photo (three patches, the worst
 *     taken), a white page and the navy footer: the piece's best-separated
 *     tone at least 3:1 (WCAG's bar for a graphic), and for the figures the
 *     numeral FACE at least 3:1, or its shadow at least 4.5:1.
 * A candidate that misses any bar is dropped and reported.
 *
 *   const C = require('./anniv-colors');
 *   C.DATE[key] / C.PCT[key]          the palettes
 *   C.dateSprite(pal) / C.pctSprite(pal, text, id)   'w h|<svg>' markup
 *   C.contrast(a, b), C.lum(hex)
 */
const { capLight, lum } = require('./anniv-light');
const SITE = { coral: '#F08080', blue: '#0F6DBF', button: '#0A50B2', navy: '#0A3D62', cream: '#F6F4EE' };
const rgb = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
const hex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
/* the bible's temperature rule: lit tones lean warm (toward cream), shadow
 * tones lean cool and darker (toward a deep slate-navy) */
const lit = (c, t) => capLight(mix(c, SITE.cream, t));
const shade = (c, t) => mix(c, '#06182A', t);
const contrast = (a, b) => { const x = typeof a === 'number' ? a : lum(a), y = typeof b === 'number' ? b : lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/* ---- the date band: a matte enamel band (no metallic sheen: Rob found the
 * gold tacky), lit from above (a lighter top, a deeper foot), the numerals
 * with a soft own-colour shadow below them, never a stroke. The tones are
 * pushed as far as the photo needs (its patches run from L .13 to .28, mid
 * values that only a light AND a dark tone both clear): each band carries a
 * tone light enough for the dark parts of the photo and one dark enough for
 * the bright water. ---- */
const DEEP = '#061A2C';   /* the deepest navy, the bible's near-black: never #000 */
const band = (o) => Object.assign({ numShadow: null, bevel: null }, o);
const DATE = {
  navyCream: band({ label: 'Navy band, cream numerals', note: 'The footer\'s navy, the date in cream.',
    top: lit(SITE.navy, 0.28), base: SITE.navy, foot: mix(SITE.navy, DEEP, 0.5), num: SITE.cream, numShadow: DEEP, bevel: lit(SITE.navy, 0.5) }),
  coralNavy: band({ label: 'Coral band, navy numerals', note: 'The site\'s coral, the date in deep navy.',
    top: lit(SITE.coral, 0.5), base: SITE.coral, foot: shade(SITE.coral, 0.32), num: mix(SITE.navy, DEEP, 0.4), numShadow: lit(SITE.coral, 0.55), bevel: lit(SITE.coral, 0.75) }),
  blueCream: band({ label: 'Main-blue band, cream numerals', note: 'The site\'s main blue, the date in cream.',
    top: lit(SITE.blue, 0.28), base: SITE.blue, foot: mix(SITE.blue, DEEP, 0.72), num: SITE.cream, numShadow: mix(SITE.blue, DEEP, 0.6), bevel: lit(SITE.blue, 0.55) }),
  creamBlue: band({ label: 'Cream band, deep-blue numerals', note: 'A cream band, the date in the button blue, deepened.',
    top: SITE.cream, base: mix(SITE.cream, '#C9D3DC', 0.25), foot: mix(SITE.cream, '#8C9BAA', 0.6), num: mix(SITE.button, DEEP, 0.45), numShadow: mix(SITE.cream, '#8C9BAA', 0.5), bevel: SITE.cream }),
  /* considered, and dropped on the numbers (see the review's notes) */
  navyCoral: band({ label: 'Navy band, coral numerals', note: '', top: lit(SITE.navy, 0.28), base: SITE.navy, foot: mix(SITE.navy, DEEP, 0.5), num: SITE.coral, numShadow: DEEP, bevel: lit(SITE.navy, 0.5) }),
  coralCream: band({ label: 'Coral band, cream numerals', note: '', top: lit(SITE.coral, 0.5), base: SITE.coral, foot: shade(SITE.coral, 0.32), num: SITE.cream, numShadow: shade(SITE.coral, 0.4), bevel: lit(SITE.coral, 0.75) }),
};
function dateSprite(p, id = 'dccAnD1') {
  return `42 18|<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset=".45" stop-color="${p.base}"/><stop offset="1" stop-color="${p.foot}"/></linearGradient></defs>` +
    `<rect x="1.2" y="2.4" width="39.6" height="13.2" rx="6.6" fill="url(#${id})"/>` +
    `<path d="M5.4 4.1 H36.6" stroke="${p.bevel}" stroke-width=".55" stroke-linecap="round" opacity=".5"/>` +
    `<text x="21" y="12.3" font-family="Georgia,serif" font-size="8" font-weight="700" fill="${p.numShadow}" opacity=".6" text-anchor="middle">11·11·11</text>` +
    `<text x="21" y="11.8" font-family="Georgia,serif" font-size="8" font-weight="700" fill="${p.num}" text-anchor="middle">11·11·11</text>`;
}

/* ---- the figures: the numerals alone, no band of their own, so the FACE
 * must read on the white page and on the navy footer by itself. That fixes
 * its value: luminance between about .23 and .30 clears both at 3:1, so the
 * coral is taken a step deeper and the main blue a step lighter. On the
 * photo (mid values, L .13-.28) no face can; there the deep-navy shadow,
 * offset down-right away from the light (as 4.14.5), carries the edge, and
 * a cream lit edge up-left where an option has one. ---- */
const CORAL_F = mix(SITE.coral, '#B5485A', 0.32);   /* coral, a step deeper (L ~.27) */
const BLUE_F = lit(SITE.blue, 0.30);                /* main blue, a step lighter (L ~.27) */
const fig = (o) => Object.assign({ litEdge: null, two: DEEP }, o);
const coralFace = { faceTop: lit(CORAL_F, 0.3), face: CORAL_F, faceFoot: shade(CORAL_F, 0.12) };
const blueFace = { faceTop: lit(BLUE_F, 0.3), face: BLUE_F, faceFoot: shade(BLUE_F, 0.12) };
const PCT = {
  coralDeep: fig(Object.assign({ label: 'Coral numerals, deep-navy shadow', note: 'The site\'s coral, a step deeper so it reads on white, lit at the top, cast in deep navy.' }, coralFace)),
  blueDeep: fig(Object.assign({ label: 'Sky-blue numerals, deep-navy shadow', note: 'The site\'s main blue, a step lighter so it reads on the navy footer, cast in deep navy.' }, blueFace)),
  coralLit: fig(Object.assign({ label: 'Coral numerals, cream lit edge and navy shadow', note: 'The same coral with the light catching each numeral\'s top-left edge in cream: an enamel look.', litEdge: SITE.cream }, coralFace)),
  oneEach: fig(Object.assign({ label: 'One of each: coral and sky blue', note: 'The first figure in coral, the second in sky blue, both cast in deep navy.', second: blueFace }, coralFace)),
  /* considered, and dropped on the numbers */
  creamNavy: fig({ label: 'Cream numerals, navy shadow', note: '', faceTop: SITE.cream, face: SITE.cream, faceFoot: mix(SITE.cream, '#C9D3DC', 0.4) }),
  coralPure: fig({ label: 'Coral numerals (#F08080 as is), navy shadow', note: '', faceTop: lit(SITE.coral, 0.3), face: SITE.coral, faceFoot: shade(SITE.coral, 0.12) }),
  navyLit: fig({ label: 'Navy numerals, cream lit edge', note: '', faceTop: lit(SITE.navy, 0.18), face: SITE.navy, faceFoot: mix(SITE.navy, DEEP, 0.5), litEdge: SITE.cream, two: null }),
  blueMain: fig({ label: 'Main-blue numerals (#0F6DBF as is), navy shadow', note: '', faceTop: lit(SITE.blue, 0.3), face: SITE.blue, faceFoot: shade(SITE.blue, 0.12) }),
};
/* n: which figure (1 or 2); 'oneEach' gives the second its own face */
function pctSprite(p, t, id = 'dccAnP1', n = 1) {
  const f = n === 2 && p.second ? Object.assign({}, p, p.second) : p;
  const T = (x, y, fill, extra) => `<text x="${x}" y="${y}" font-family="Georgia,serif" font-size="16" font-weight="700" fill="${fill}"${extra || ''} text-anchor="middle">${t}</text>`;
  return `34 20|<defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="${f.faceTop}"/><stop offset=".55" stop-color="${f.face}"/><stop offset="1" stop-color="${f.faceFoot}"/></linearGradient></defs>` +
    (f.two ? T(17.7, 16.2, f.two) : '') + (f.litEdge ? T(16.55, 14.85, f.litEdge, ' opacity=".9"') : '') + T(17, 15.4, `url(#${id})`);
}

/* ---- the bars ---- */
const BAR = { num: 4.5, piece: 3, faceOrShadow: [3, 4.5] };
/* bg: { white: L, navy: L, photo: [L, L, L] } (relative luminances) */
function scoreDate(p, bg) {
  const n = contrast(p.num, p.base);
  const tones = [p.top, p.base, p.foot, p.num];
  const on = L => Math.max(...tones.map(c => contrast(c, L)));
  const r = { numerals: n, white: on(bg.white), navy: on(bg.navy), photo: Math.min(...bg.photo.map(on)),
    bandWhite: contrast(p.base, bg.white), bandNavy: contrast(p.base, bg.navy), bandPhoto: Math.min(...bg.photo.map(L => contrast(p.base, L))) };
  r.pass = n >= BAR.num && r.white >= BAR.piece && r.navy >= BAR.piece && r.photo >= BAR.piece;
  return r;
}
function scorePct(p, bg) {
  const faces = [p.face].concat(p.second ? [p.second.face] : []);
  const edges = [p.two, p.litEdge].filter(Boolean);
  const best = (cs, L) => Math.max(0, ...cs.map(c => contrast(c, L)));
  /* the face must carry on the page and the footer; on the photo, the face
   * or an edge, at every patch */
  const r = { faceWhite: Math.min(...faces.map(c => contrast(c, bg.white))), faceNavy: Math.min(...faces.map(c => contrast(c, bg.navy))),
    photo: Math.min(...bg.photo.map(L => Math.min(...faces.map(c => Math.max(contrast(c, L), best(edges, L)))))),
    photoFace: Math.min(...bg.photo.map(L => Math.min(...faces.map(c => contrast(c, L))))), faceEdge: Math.min(...faces.map(c => best(edges, lum(c)))) };
  r.pass = r.faceWhite >= BAR.piece && r.faceNavy >= BAR.piece && r.photo >= BAR.piece;
  return r;
}

module.exports = { DEEP, SITE, DATE, PCT, dateSprite, pctSprite, contrast, lum, scoreDate, scorePct, BAR };
