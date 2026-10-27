'use strict';
/**
 * DCC Seasons — Thanksgiving step 1: every live piece beside a CC0 or
 * public-domain photograph, the LIVE drawing over it at 50%, and a fix-pass
 * redraw over it at 50%, then both at the size a guest sees them on cream
 * and on navy. Stills only: live Thanksgiving is untouched until Rob picks.
 *
 *   node tools/tg-pieces.js --sheet   (DCC_REFS=<dir of reference photos>)
 *
 * Each REDRAW is a sprite in the engine's format ('w h|<svg body>'), ids
 * prefixed dccTg. FIT places the sprite over its photo: [x, y, height] of
 * the sprite's box in photo pixels (and an optional rotation, degrees).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENG = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
/* the LIVE drawings are 4.13.1's (commit 64340a4), not this working copy */
const LIVE_ENG = require('child_process').execSync('git show 64340a4:dcc-seasons/assets/js/engine.js', { cwd: ROOT, maxBuffer: 1 << 26 }).toString();
function liveSvgs() {
  const PAL = JSON.parse(LIVE_ENG.match(/var PAL = (\{[\s\S]*?\});/)[1]);
  const SVGS = new Function(`${LIVE_ENG.match(/var SVGS = \{[\s\S]*?\n\t\};/)[0]}\nreturn SVGS;`)();
  const out = {};
  for (const [k, v] of Object.entries(SVGS)) { if (typeof v !== 'string') { continue; } let r = v; out[k] = r.replace(/%([a-x])/g, (m, q) => PAL[q] || '#f0f'); }
  return out;
}

/* a smooth closed (or open) path through traced points, Catmull-Rom as
 * cubics, coordinates relative to the crop's corner, rounded to 0.1 */
function cr(pts, closed, ox, oy) {
  const P = pts.map(p => [p[0] - (ox || 0), p[1] - (oy || 0)]), n = P.length, f = v => +v.toFixed(1);
  const at = i => closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
/* veins: n strokes from points along the midrib out toward the edge */
function veins(mid, n, out, len, side) {
  let d = '';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), a = mid[Math.floor(t * (mid.length - 1))], b = mid[Math.min(mid.length - 1, Math.floor(t * (mid.length - 1)) + 1)];
    const x = a[0] + (b[0] - a[0]) * ((t * (mid.length - 1)) % 1), y = a[1] + (b[1] - a[1]) * ((t * (mid.length - 1)) % 1);
    const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    const L = len * Math.sin(Math.PI * (0.15 + 0.85 * t)) ;
    d += `M${x.toFixed(1)} ${y.toFixed(1)}Q${(x + (ux * 0.55 + side * -uy * 0.8) * L * 0.6).toFixed(1)} ${(y + (uy * 0.55 + side * ux * 0.8) * L * 0.6).toFixed(1)} ${(x + (ux * out + side * -uy) * L).toFixed(1)} ${(y + (uy * out + side * ux) * L).toFixed(1)}`;
  }
  return d;
}

/* ---- the pieces ------------------------------------------------------ */
const PIECES = [];
{
  /* LIVE OAK (leafo), over the live oak in Michaux's North American Sylva
   * (NAS-012f, public domain): the small, oval, UNLOBED leaf with a
   * rounded tip, a pale midrib and fine parallel veins. Dried, as it falls:
   * olive-brown above, tan at the edge. */
  const O = [480, 305]; var OAK_AT = O; const up = [[486.3, 325.6], [517.5, 313.1], [573.8, 316.3], [623.8, 341.3], [667.5, 378.8], [698.8, 410], [716.3, 441.3], [714.4, 478.8]],
    lo = [[686.3, 485], [642.5, 472.5], [592.5, 447.5], [548.8, 422.5], [517.5, 397.5], [498.8, 360], [489.4, 335]],
    mid = [[486.3, 325.6], [555, 341], [623.8, 385], [686.3, 441], [714.4, 478.8]].map(p => [p[0] - O[0], p[1] - O[1]]);
  const outline = cr(up.concat(lo), true, O[0], O[1]);
  PIECES.push({ key: 'leafo', name: 'Live Oak Leaf', ref: 'oaknas.png', crop: [470, 295, 265, 205],
    src: 'Michaux, “North American Sylva,” plate of Quercus virens (live oak), public domain',
    fit: { base: [486.3, 325.6], tip: [714.4, 478.8] }, at: O,
    redraw: `245 190|<defs><linearGradient id="dccTgO1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8C6A2E"/><stop offset=".55" stop-color="#9E7A35"/><stop offset="1" stop-color="#6E5022"/></linearGradient></defs>
<path d="M2 18 L-6 14" stroke="#6B4E22" stroke-width="5" stroke-linecap="round"/>
<path d="${outline}" fill="url(#dccTgO1)" stroke="#5E4219" stroke-width="2.5"/>
<path d="${cr(lo.map(p => [p[0], p[1] - 4]).concat([[486.3, 330]]), false, O[0], O[1])}" stroke="#C4A15C" stroke-width="5" fill="none" opacity=".55"/>
<path d="${cr(mid, false)}" stroke="#D9C08A" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="${veins(mid, 7, 0.55, 46, -1)}${veins(mid, 7, 0.55, 38, 1)}" stroke="#C9AD73" stroke-width="2" fill="none" opacity=".75"/>`,
    note: 'The live drawing is a narrow pointed oval; the real leaf is broader, with a blunt rounded tip and the widest part past the middle. Redrawn to the plate, dried to brown as it falls.' });
}




{
  /* SWEETGUM (leafs), over 'American Sweetgum (31045580841),' CC0: a leaf
   * held up against the sky. FIVE pointed lobes in a star, palmate veins
   * from the petiole to each tip; the live drawing has eight points. Kept
   * the red the live piece falls in (a Lake County sweetgum turns red,
   * purple or yellow). Traced in the photo's pixels, origin [30, 130]. */
  const k = 1.1, O = [30, 130];
  const pts = [[460,210],[520,200],[600,215],[665,255],[705,300],[722,345],[670,330],[620,325],[585,322],[615,370],[645,420],[680,475],[735,535],[670,505],[610,490],[545,470],[480,500],[410,545],[330,595],[250,640],[250,570],[245,500],[248,420],[245,385],[180,385],[110,390],[40,395],[95,345],[150,300],[195,262],[160,250],[115,245],[160,215],[230,180],[330,155],[400,150],[445,180]].map(p => [p[0] / k, p[1] / k]);
  const C = [460 / k, 212 / k], tips = [[722,345],[735,535],[250,640],[40,395],[115,245]].map(p => [p[0] / k - O[0], p[1] / k - O[1]]);
  const c0 = [C[0] - O[0], C[1] - O[1]];
  const vein = tips.map(t => `M${c0[0].toFixed(1)} ${c0[1].toFixed(1)}Q${((c0[0] + t[0]) / 2 + 6).toFixed(1)} ${((c0[1] + t[1]) / 2 - 4).toFixed(1)} ${(c0[0] + (t[0] - c0[0]) * 0.92).toFixed(1)} ${(c0[1] + (t[1] - c0[1]) * 0.92).toFixed(1)}`).join('');
  PIECES.push({ key: 'leafs', name: 'Sweetgum Leaf', ref: 'sg2.jpg', crop: [20, 110, 660, 500],
    src: '“American Sweetgum (31045580841),” Wikimedia Commons, CC0',
    fit: { base: [250 / k, 640 / k], tip: [C[0], C[1]] }, at: O,
    redraw: `650 470|<defs><radialGradient id="dccTgS1" cx=".55" cy=".25" r=".85"><stop offset="0" stop-color="#E0552F"/><stop offset=".55" stop-color="#B5342A"/><stop offset="1" stop-color="#7E2230"/></radialGradient></defs>
<path d="M${(c0[0]).toFixed(1)} ${c0[1].toFixed(1)}Q${(c0[0] + 30).toFixed(1)} ${(c0[1] - 70).toFixed(1)} ${(c0[0] + 110).toFixed(1)} ${(c0[1] - 165).toFixed(1)}" stroke="#7A3B22" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="${cr(pts, true, O[0], O[1])}" fill="url(#dccTgS1)" stroke="#6E1F2A" stroke-width="3" stroke-dasharray="7 3"/>
<path d="${vein}" stroke="#E88A5C" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>`,
    note: 'The live piece is an eight-pointed star; a sweetgum leaf has five pointed lobes, the lower two swept back, on a long stalk, with a vein running from the stalk to each tip. Redrawn to the photograph, in the same red.' });
}
{
  /* PUMPKIN (gourd1), over 'Cucurbita 2011 G1,' public domain: a field
   * pumpkin, wider than tall, the top pushed in round the stalk, the ribs
   * running pole to pole, and a thick ridged stalk, not a curl. */
  const k = 2, X = 630, Y = 140, O = [640, 155];
  const P = (a) => a.map(p => [X + p[0] / k, Y + p[1] / k]);
  const out = P([[265,95],[330,65],[400,75],[455,115],[490,170],[505,250],[495,340],[460,430],[400,500],[330,530],[250,525],[160,495],[90,440],[50,360],[38,270],[55,180],[100,120],[160,85],[215,80]]);
  const top = [X + 268 / k, Y + 100 / k], bot = [X + 300 / k, Y + 528 / k];
  const ribs = [-0.82, -0.55, -0.27, 0.02, 0.3, 0.58, 0.84].map(f => {
    const w = 118, mx = (top[0] + bot[0]) / 2 + f * w, my = (top[1] + bot[1]) / 2;
    return `M${(top[0] + f * 14 - O[0]).toFixed(1)} ${(top[1] - O[1] + 2).toFixed(1)}Q${(mx - O[0]).toFixed(1)} ${(my - O[1] - 60).toFixed(1)} ${(mx - O[0] + f * 4).toFixed(1)} ${(my - O[1]).toFixed(1)}T${(bot[0] + f * 20 - O[0]).toFixed(1)} ${(bot[1] - O[1] - 3).toFixed(1)}`;
  }).join('');
  const stem = P([[232,140],[228,80],[236,52],[262,46],[280,58],[292,100],[298,135],[270,150]]);
  PIECES.push({ key: 'gourd1', name: 'Pumpkin', ref: 'cu11.jpg', crop: [635, 145, 245, 260],
    src: '“Cucurbita 2011 G1,” Wikimedia Commons, public domain',
    fit: { base: [780, 405], tip: [780, 163] }, at: O,
    redraw: `250 255|<defs><radialGradient id="dccTgP1" cx=".38" cy=".38" r=".75"><stop offset="0" stop-color="#FDB65A"/><stop offset=".5" stop-color="#F08A22"/><stop offset="1" stop-color="#B9580C"/></radialGradient>
<linearGradient id="dccTgP2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8E7A45"/><stop offset=".5" stop-color="#D5C08A"/><stop offset="1" stop-color="#7A6638"/></linearGradient></defs>
<path d="${cr(out, true, O[0], O[1])}" fill="url(#dccTgP1)" stroke="#A9520E" stroke-width="2"/>
<path d="${ribs}" stroke="#C4650F" stroke-width="3.5" fill="none" opacity=".7"/>
<path d="${ribs}" stroke="#FFD08A" stroke-width="1.6" fill="none" opacity=".35" transform="translate(5 0)"/>
<path d="${cr(stem, true, O[0], O[1])}" fill="url(#dccTgP2)" stroke="#5E4C25" stroke-width="1.6"/>
<path d="M${(X + 248 / k - O[0]).toFixed(1)} ${(Y + 60 / k - O[1]).toFixed(1)}L${(X + 250 / k - O[0]).toFixed(1)} ${(Y + 135 / k - O[1]).toFixed(1)}M${(X + 268 / k - O[0]).toFixed(1)} ${(Y + 56 / k - O[1]).toFixed(1)}L${(X + 278 / k - O[0]).toFixed(1)} ${(Y + 135 / k - O[1]).toFixed(1)}" stroke="#6E5A2E" stroke-width="1.6"/>`,
    note: 'The live pumpkin is a plain oval with a thin green curl. The real one is wider than tall, sunk round a thick ridged stalk, with deep ribs from pole to pole. Redrawn to the photograph.' });
}
{
  /* ACORN SQUASH (gourd3), over 'Acorn squashes,' CC0: a dark green squash
   * of deep rounded ribs that run to a point at the blossom end, with a
   * patch of orange where it lay. The live piece is a round squash with
   * white stripes, which an acorn squash never has. Drawn upright; laid
   * along the photo's squash, stem end to point, for the overlay. */
  const out = [[50,18],[70,15],[86,23],[95,39],[93,57],[84,75],[70,91],[50,104],[30,91],[16,75],[7,57],[5,39],[14,23],[30,15]];
  const groove = [16, 33, 50, 67, 84].map((x, i) => `M${x} ${i === 0 || i === 4 ? 26 : 18}Q${(x + (x - 50) * 0.35).toFixed(1)} ${60} 50 103`).join('');
  const shine = [24, 41, 59, 76].map(x => `M${x} 26Q${(x + (x - 50) * 0.4).toFixed(1)} 55 ${(50 + (x - 50) * 0.35).toFixed(1)} 88`).join('');
  PIECES.push({ key: 'gourd3', name: 'Acorn Squash', ref: 'acs.jpg', crop: [80, 170, 520, 380],
    src: '“Acorn squashes,” Wikimedia Commons, CC0',
    fit: { base: [559, 512], tip: [105, 340] }, fitNew: { base: [559, 512], tip: [105, 340], span: 96, dy: 6 },
    redraw: `100 110|<defs><radialGradient id="dccTgA1" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#4C6E45"/><stop offset=".6" stop-color="#26412A"/><stop offset="1" stop-color="#132317"/></radialGradient></defs>
<path d="${cr(out, true)}" fill="url(#dccTgA1)" stroke="#8FAE7C" stroke-width="2.2"/>
<ellipse cx="36" cy="88" rx="11" ry="7" fill="#D98A2B" opacity=".75" transform="rotate(30 36 88)"/>
<path d="${groove}" stroke="#0B170D" stroke-width="2.4" fill="none"/>
<path d="${shine}" stroke="#86A276" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/>
<path d="M45 18 L46 6 L54 5 L56 18 Z" fill="#A2865A" stroke="#5E4A2C" stroke-width="1"/><path d="M48 7 L48.5 17 M52 6.5 L52.5 17" stroke="#6E5836" stroke-width=".8"/>`,
    note: 'The live squash is round and striped white, more like a delicata. An acorn squash is dark green, deeply ribbed, and comes to a point at the blossom end, often with an orange patch where it lay on the ground.' });
}
{
  /* EAR OF CORN (corn), over 'VegCorn,' USDA, public domain: kernels packed
   * in STRAIGHT ROWS of rounded squares round the cob, narrowing toward the
   * tip, never scattered dots. Drawn upright with the husk peeled back from
   * the base, dried to straw as it is in November, and a little silk. */
  const ker = '';
  PIECES.push({ key: 'corn', name: 'Ear of Corn', ref: 'corn.jpg', crop: [0, 30, 470, 260],
    src: '“VegCorn,” USDA, Wikimedia Commons, public domain',
    fit: { base: [0, 92], tip: [430, 212] }, fitNew: { base: [-60, 75], tip: [430, 212], span: 106 },
    redraw: `50 112|<defs><linearGradient id="dccTgC1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B98E1E"/><stop offset=".5" stop-color="#E9B83A"/><stop offset="1" stop-color="#A97C14"/></linearGradient></defs>
<pattern id="dccTgC3" width="4.4" height="9.8" patternUnits="userSpaceOnUse"><rect x=".3" y=".3" width="3.8" height="4.3" rx="1.4" fill="#F4CF55"/><rect x="-1.9" y="5.2" width="3.8" height="4.3" rx="1.4" fill="#F4CF55"/><rect x="2.5" y="5.2" width="3.8" height="4.3" rx="1.4" fill="#F4CF55"/></pattern>
<linearGradient id="dccTgC4" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7A5408" stop-opacity=".75"/><stop offset=".3" stop-color="#7A5408" stop-opacity="0"/><stop offset=".62" stop-color="#FFF6CC" stop-opacity=".25"/><stop offset="1" stop-color="#7A5408" stop-opacity=".8"/></linearGradient>
<path d="M25 10 Q40 14 39 50 Q38 86 25 96 Q12 86 11 50 Q10 14 25 10 Z" fill="#B98E1E"/>
<path d="M25 10 Q40 14 39 50 Q38 86 25 96 Q12 86 11 50 Q10 14 25 10 Z" fill="url(#dccTgC3)"/>
<path d="M25 10 Q40 14 39 50 Q38 86 25 96 Q12 86 11 50 Q10 14 25 10 Z" fill="url(#dccTgC4)"/>
<path d="M24 10 Q22 4 18 1 M26 10 Q27 4 31 1 M25 10 Q25 5 25 2" stroke="#C8A06A" stroke-width=".8" fill="none"/>
<path d="M25 94 Q4 86 0 54 Q12 68 21 86 Z" fill="#D8C48A" stroke="#9C8650" stroke-width=".8"/>
<path d="M25 94 Q46 86 50 52 Q38 68 29 86 Z" fill="#CDB77A" stroke="#9C8650" stroke-width=".8"/>
<path d="M25 110 Q10 104 9 86 Q17 92 25 94 Q33 92 41 86 Q40 104 25 110 Z" fill="#E2D19C" stroke="#9C8650" stroke-width=".8"/>
<path d="M7 66 Q12 78 21 87 M43 64 Q38 76 29 87 M16 98 Q21 103 25 108" stroke="#A8925C" stroke-width=".6" fill="none"/>`,
    note: 'The live ear has scattered red dots for kernels. Real kernels pack in straight rows of rounded squares that wrap the cob and shrink toward the tip. Redrawn with the husk peeled back from the base, dried to straw for November.' });
}
{
  /* ACORN (acorn), over the live oak acorn in the same Michaux plate
   * (public domain): a long, glossy, dark nut with a point at the tip, set
   * in a deep cup of overlapping scales on a stalk. The live acorn is a
   * cap like a hat over a short nut; the live oak's cup holds the lower
   * third. Traced at the plate's own scale. */
  const nut = [[171,30],[208,48],[250,92],[275,167],[279,268],[171,276],[66,268],[63,167],[85,92],[130,48]];
  const cup = [[58,262],[171,256],[284,262],[283,317],[267,375],[233,417],[192,442],[150,442],[105,417],[73,375],[58,317]];
  let sc = '';
  for (let r = 0; r < 8; r++) {
    const y = 280 + r * 21, half = r < 4 ? 112 - r * 3 : 112 - (r - 3) * 16, n = Math.max(3, Math.round(half / 16));
    for (let i = -n; i <= n; i++) { const x = 171 + i * (half / n) + (r % 2) * (half / n) / 2; if (Math.abs(x - 171) > half - 6) { continue; }
      sc += `M${(x - 14).toFixed(1)} ${y}Q${x.toFixed(1)} ${y + 16} ${(x + 14).toFixed(1)} ${y}`; }
  }
  PIECES.push({ key: 'acorn', name: 'Acorn', ref: 'oakac.png', crop: [0, 0, 342, 514],
    src: 'Michaux, “North American Sylva,” plate of Quercus virens (live oak acorn), public domain',
    fit: { base: [171, 513], tip: [171, 14] }, at: [0, 0],
    redraw: `342 514|<defs><radialGradient id="dccTgK1" cx=".62" cy=".3" r=".75"><stop offset="0" stop-color="#9A6638"/><stop offset=".5" stop-color="#5E3818"/><stop offset="1" stop-color="#36200C"/></radialGradient>
<linearGradient id="dccTgK2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6F5638"/><stop offset=".55" stop-color="#A18A62"/><stop offset="1" stop-color="#5E4A30"/></linearGradient></defs>
<path d="M154 440 L157 512 L186 512 L189 440 Z" fill="#8B7650" stroke="#4E3D24" stroke-width="5"/>
<path d="${cr(nut, true)}" fill="url(#dccTgK1)" stroke="#2A1808" stroke-width="7"/>
<path d="M171 34 L162 8 Q171 -4 180 8 Z" fill="#4A2E14"/>
<path d="M232 100 Q262 150 258 210" stroke="#D9B48A" stroke-width="16" fill="none" opacity=".45" stroke-linecap="round"/>
<path d="${cr(cup, true)}" fill="url(#dccTgK2)" stroke="#3E2F1A" stroke-width="7"/>
<path d="${sc}" stroke="#4E3D24" stroke-width="5" fill="none" opacity=".75"/>`,
    note: 'The live acorn is a cap like a hat over a short round nut. The live oak’s acorn is long, glossy and nearly black-brown, with a point at the tip and a deep scaly cup holding its lower third, on a stalk.', guest: 30 });
}
{
  /* CRANBERRIES (cranberry), over 'Cranberries ripening (8053877914),' public
   * domain: berries round to a little oval, glossy crimson with a pale
   * cheek, each on a thin wiry stem, with the small oval evergreen leaves
   * of the vine. The live piece has two dull balls on a thick green stalk. */
  const B = (cx, cy, rx, ry, id) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})" stroke="#6E0E1E" stroke-width="2"/><ellipse cx="${cx - rx * 0.35}" cy="${cy - ry * 0.4}" rx="${rx * 0.22}" ry="${ry * 0.15}" fill="#FFE1E6" opacity=".85" transform="rotate(-30 ${cx - rx * 0.35} ${cy - ry * 0.4})"/><circle cx="${cx + rx * 0.05}" cy="${cy - ry * 0.95}" r="2.4" fill="#5A2018"/>`;
  PIECES.push({ key: 'cranberry', name: 'Cranberries', ref: 'cb1.jpg', crop: [360, 270, 150, 140],
    src: '“Cranberries ripening (8053877914),” Wikimedia Commons, public domain',
    fit: { base: [430, 395], tip: [430, 290] }, at: [372, 278],
    redraw: `130 125|<defs><radialGradient id="dccTgR1" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#F0506A"/><stop offset=".55" stop-color="#C8183A"/><stop offset="1" stop-color="#7E0A22"/></radialGradient></defs>
<path d="M30 6 Q34 2 40 3 M40 3 Q58 4 64 16 M40 3 Q46 12 44 22 M56 8 Q88 4 110 12 M88 6 Q96 18 98 34" stroke="#5A3A22" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M30 6 Q22 2 14 6 Q20 12 30 6 Z M70 7 Q76 0 86 2 Q80 10 70 7 Z M104 10 Q112 4 120 8 Q112 14 104 10 Z" fill="#3E5A2A" stroke="#26391A" stroke-width=".8"/>
${B(64, 64, 46, 43, 'dccTgR1')}${B(103, 52, 21, 20, 'dccTgR1')}${B(36, 104, 18, 17, 'dccTgR1')}`,
    note: 'The live cranberries are two dull balls on a thick green stalk. Real ones are glossy crimson with a pale highlight, a little oval, each hanging from its own thin wiry stem among small oval leaves.', guest: 26 });
}
/* WILD TURKEY HEN (turkey, and scene C), over 'Wild Turkey with Chicks
 * (50614047608),' public domain: a hen in profile, small bare blue-grey
 * head, long neck, the body a deep teardrop of bronze-barred feathers, the
 * folded wing with pale bars, the tail closed and sloping down behind,
 * long pink-grey legs. The live sprite is a cartoon tom with a fanned tail;
 * only the hen raises poults, and the live piece leads chicks. Traced in
 * the photo's pixels; TK_* are those paths in units of her height, origin
 * at her feet, facing left. */
const TK_PX = { foot: [552, 620], H: 542 };
const TK_BODY = [[402,92],[420,80],[445,77],[464,92],[472,130],[482,190],[505,245],[560,295],[640,345],[715,405],[785,470],[838,525],[856,560],[830,575],[760,578],[690,566],[630,548],[580,525],[540,495],[500,455],[460,410],[432,360],[425,300],[440,230],[452,170],[450,125],[432,108],[412,102]];
const TK_WING = [[515,300],[590,330],[660,385],[715,450],[740,520],[700,540],[640,515],[585,470],[540,410],[512,350]];
const TK_TAIL = [[700,470],[790,500],[856,560],[835,580],[760,580],[700,560]];
function tkUnits(pts) { return pts.map(p => [+((p[0] - TK_PX.foot[0]) / TK_PX.H).toFixed(4), +((p[1] - TK_PX.foot[1]) / TK_PX.H).toFixed(4)]); }
const TURKEY_SRC = `
var TK_BODY = ${JSON.stringify(tkUnits(TK_BODY))}, TK_WING = ${JSON.stringify(tkUnits(TK_WING))}, TK_TAIL = ${JSON.stringify(tkUnits(TK_TAIL))};
function tkPath(g, P) { var n = P.length; g.beginPath(); g.moveTo(P[0][0], P[0][1]);
  for (var i = 0; i < n; i++) { var a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
    g.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]); } g.closePath(); }
/* kind 'hen' or 'poult'; ph steps the legs. Origin at the feet, 1 = height, facing left. */
function tkPaint(g, kind, ph) {
  var poult = kind === 'poult', s = Math.sin(ph * 6.283) * 0.04;
  g.save(); if (poult) { g.scale(1.25, 1.25); }
  g.strokeStyle = '#B29A8C'; g.lineWidth = 0.018; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-0.01, -0.19); g.lineTo(-0.01 + s, 0); g.moveTo(0.20, -0.12); g.lineTo(0.20 - s, 0); g.stroke();
  if (poult) { g.restore(); g.save(); g.translate(0.02, -0.05); g.scale(1.25, 1.25);
    g.fillStyle = '#6B5034'; g.beginPath(); g.ellipse(0.08, -0.2, 0.17, 0.12, 0.1, 0, 6.283); g.fill(); g.fillStyle = '#9A7A52'; g.beginPath(); g.ellipse(0.04, -0.24, 0.09, 0.05, 0.1, 0, 6.283); g.fill();
    g.fillStyle = '#B08E62'; g.beginPath(); g.ellipse(-0.08, -0.36, 0.075, 0.07, 0, 0, 6.283); g.fill(); g.fillStyle = '#1A1410'; g.beginPath(); g.arc(-0.1, -0.375, 0.012, 0, 6.283); g.fill();
    g.fillStyle = '#5E4428'; g.beginPath(); g.moveTo(-0.15, -0.37); g.lineTo(-0.2, -0.355); g.lineTo(-0.15, -0.345); g.fill();
    g.strokeStyle = '#5E4428'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(-0.02, -0.25); g.quadraticCurveTo(0.08, -0.31, 0.2, -0.24); g.stroke();
    g.restore(); return; }
  var gr = g.createLinearGradient(-0.2, -0.6, 0.4, -0.05); gr.addColorStop(0, '#5A4630'); gr.addColorStop(0.5, '#3E2F20'); gr.addColorStop(1, '#2A2016');
  g.fillStyle = gr; tkPath(g, TK_BODY); g.fill();
  g.fillStyle = '#4C3A26'; tkPath(g, TK_TAIL); g.fill();
  g.strokeStyle = '#A88A5E'; g.lineWidth = 0.008;
  for (var t = 0; t < 4; t++) { g.beginPath(); g.moveTo(0.27 + t * 0.025, -0.24 + t * 0.03); g.lineTo(0.55 - t * 0.01, -0.13 + t * 0.012); g.stroke(); }
  g.fillStyle = '#5E4A30'; tkPath(g, TK_WING); g.fill();
  g.strokeStyle = '#C7B48A'; g.lineWidth = 0.009;
  for (var w = 0; w < 5; w++) { g.beginPath(); g.moveTo(-0.04 + w * 0.035, -0.5 + w * 0.05); g.quadraticCurveTo(0.06 + w * 0.03, -0.44 + w * 0.05, 0.12 + w * 0.025, -0.36 + w * 0.06); g.stroke(); }
  g.strokeStyle = 'rgba(160,130,80,.5)'; g.lineWidth = 0.006;
  for (var r = 0; r < 9; r++) { g.beginPath(); g.moveTo(-0.2 + r * 0.02, -0.62 + r * 0.06); g.quadraticCurveTo(-0.12 + r * 0.03, -0.6 + r * 0.06, -0.06 + r * 0.035, -0.62 + r * 0.065); g.stroke(); }
  g.fillStyle = '#9BA4B0'; g.beginPath(); g.ellipse(-0.19, -0.99, 0.042, 0.028, -0.2, 0, 6.283); g.fill();
  g.fillStyle = '#C66E6E'; g.beginPath(); g.ellipse(-0.205, -0.965, 0.018, 0.012, 0, 0, 6.283); g.fill();
  g.fillStyle = '#1A1410'; g.beginPath(); g.arc(-0.2, -1.0, 0.008, 0, 6.283); g.fill();
  g.fillStyle = '#C8B49A'; g.beginPath(); g.moveTo(-0.225, -0.995); g.lineTo(-0.275, -0.977); g.lineTo(-0.225, -0.975); g.fill();
  g.restore();
}`;
{
  const svgPath = pts => cr(pts, true, 380, 60);
  PIECES.push({ key: 'turkey_r1', name: 'Wild Turkey Hen (4.13.1)', old: true, ref: 'tk1.jpg', crop: [370, 50, 520, 590],
    src: '“Wild Turkey with Chicks (50614047608),” Wikimedia Commons, public domain',
    fit: { base: [600, 620], tip: [600, 80] }, at: [380, 60],
    redraw: `490 580|<defs><linearGradient id="dccTgT1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6A5236"/><stop offset=".5" stop-color="#4A3824"/><stop offset="1" stop-color="#2E2318"/></linearGradient>
<pattern id="dccTgT2" width="70" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><path d="M0 30 Q35 10 70 30" stroke="#C99050" stroke-width="12" fill="none"/><path d="M0 40 Q35 20 70 40" stroke="#1E1610" stroke-width="7" fill="none"/></pattern>
<clipPath id="dccTgT3"><path d="${svgPath(TK_BODY)}"/></clipPath></defs>
<path d="M170 455 L172 556 M285 495 L282 556" stroke="#B29A8C" stroke-width="9" stroke-linecap="round" fill="none"/>
<path d="M172 556 L140 562 M172 556 L150 572 M172 556 L188 566 M282 556 L250 562 M282 556 L262 572 M282 556 L298 566" stroke="#A08878" stroke-width="6" stroke-linecap="round" fill="none"/>
<path d="${svgPath(TK_BODY)}" fill="url(#dccTgT1)"/>
<g clip-path="url(#dccTgT3)"><rect x="70" y="190" width="420" height="400" fill="url(#dccTgT2)" opacity=".85"/></g>
<path d="${svgPath(TK_TAIL)}" fill="#4C3A26"/>
<path d="M330 410 L470 490 M342 425 L462 500 M356 440 L455 510" stroke="#C08A4A" stroke-width="5"/>
<path d="${svgPath(TK_WING)}" fill="#5E4A30"/>
<path d="M150 262 Q205 300 240 350 M172 274 Q225 318 258 375 M196 290 Q246 338 276 400 M220 305 Q268 356 296 420" stroke="#E2D0A8" stroke-width="7" fill="none"/>
<path d="${svgPath(TK_BODY)}" fill="none" stroke="#C7B48A" stroke-width="4"/>
<ellipse cx="62" cy="35" rx="24" ry="17" fill="#9BA4B0"/><ellipse cx="52" cy="50" rx="10" ry="7" fill="#C66E6E"/><circle cx="56" cy="32" r="4.5" fill="#1A1410"/>
<path d="M44 34 L18 33 L44 44 Z" fill="#C8B49A"/>`,
    note: 'The live turkey is a cartoon tom with a fanned tail, yet it leads two chicks, and only the hen raises poults. Redrawn as the hen in the photograph: small bare head, long neck, bronze-barred body, the pale-barred wing and a closed tail sloping down behind.', guest: 34 });
}
/* a toothed edge: along each segment of a closed outline, small saw teeth
 * pointing outward every `step` px, `depth` deep (red maple, sweetgum) */
function serrate(pts, step, depth) {
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1, out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), n = Math.max(1, Math.round(L / step));
    const nx = -dy / L * sg, ny = dx / L * sg;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 0.7) / n;
      out.push([a[0] + dx * t0, a[1] + dy * t0]);
      out.push([a[0] + dx * t1 - nx * depth, a[1] + dy * t1 - ny * depth]);
    }
  }
  return out;
}
const poly = (pts, ox, oy) => 'M' + pts.map(p => (p[0] - ox).toFixed(1) + ' ' + (p[1] - oy).toFixed(1)).join('L') + 'Z';
{
  /* RED MAPLE (leafm, leafm2), Florida's Acer rubrum, over a pressed red
   * maple in the Billings-Kittredge Herbaria (Woodstock, Vermont, 1910,
   * public domain): three main lobes and the small side lobes at the base,
   * shallow notches, a toothed edge, veins from the stalk to each tip. The
   * live drawing is a sugar maple, the flag's leaf. Traced in the crop's
   * 2.4x pixels and taken back to the sheet's. */
  const X = q => [380 + q[0] / 4, 920 + q[1] / 4];
  const tips = [[165,495],[150,452],[88,380],[100,236],[160,262],[240,156],[300,150],[345,108],[392,62],[438,25],[412,140],[406,212],[410,282],[470,292],[580,258],[600,322],[750,345],[640,432],[605,486],[522,520],[482,548],[560,642],[655,740],[520,722],[410,745],[300,690],[270,740],[226,652],[166,620],[160,560]].map(X);
  const out = serrate(tips, 4, 1.3);
  const O = [380, 920];
  const ctr = X([168, 495]);
  const vein = [[438, 30], [745, 345], [650, 735], [102, 240], [262, 735]].map(X).map((t, i) => `M${(ctr[0] - O[0]).toFixed(1)} ${(ctr[1] - O[1]).toFixed(1)}Q${((ctr[0] + t[0]) / 2 - O[0] + (i % 2 ? 4 : -4)).toFixed(1)} ${((ctr[1] + t[1]) / 2 - O[1]).toFixed(1)} ${(ctr[0] + (t[0] - ctr[0]) * 0.9 - O[0]).toFixed(1)} ${(ctr[1] + (t[1] - ctr[1]) * 0.9 - O[1]).toFixed(1)}`).join('');
  const stalk = `M${(ctr[0] - O[0]).toFixed(1)} ${(ctr[1] - O[1]).toFixed(1)}Q${(ctr[0] - O[0] - 18).toFixed(1)} ${(ctr[1] - O[1] + 4).toFixed(1)} ${(ctr[0] - O[0] - 38).toFixed(1)} ${(ctr[1] - O[1] + 16).toFixed(1)}`;
  const body = (id, stops, vc, ec) => `190 200|<defs><radialGradient id="${id}" cx=".55" cy=".45" r=".75">${stops}</radialGradient></defs>
<path d="${stalk}" stroke="#7A2A1E" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="${poly(out, O[0], O[1])}" fill="url(#${id})" stroke="${ec}" stroke-width="1" stroke-linejoin="round"/>
<path d="${vein}" stroke="${vc}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".85"/>`;
  PIECES.push({ key: 'leafm', name: 'Red Maple, Full Red', ref: 'herb.jpg', crop: [380, 920, 190, 200],
    src: '“Acer Rubrum (Red Maple) in Billings-Kittredge Herbaria,” Wikimedia Commons, public domain',
    fit: { base: X([60, 560]), tip: X([520, 380]), span: 26 }, at: O,
    redraw: body('dccTgM1', '<stop offset="0" stop-color="#E0453A"/><stop offset=".6" stop-color="#B92A2C"/><stop offset="1" stop-color="#7E1A22"/>', '#F08A72', '#6E1620'),
    note: 'The live maple is a sugar maple, the Canadian flag’s leaf. Florida’s red maple has three main lobes and small side lobes at the base, shallow notches between them, and a finely toothed edge. Redrawn over a pressed red maple leaf, in full red.' });
  PIECES.push({ key: 'leafm2', name: 'Red Maple, Turning', ref: 'herb.jpg', crop: [380, 920, 190, 200],
    src: 'the same herbarium sheet, public domain',
    fit: { base: X([60, 560]), tip: X([520, 380]), span: 26 }, at: O,
    redraw: body('dccTgM2', '<stop offset="0" stop-color="#F2C14E"/><stop offset=".45" stop-color="#E8823A"/><stop offset="1" stop-color="#B8322C"/>', '#FBE0A0', '#8A3A1E'),
    note: 'The same leaf mid-turn: gold at the heart going orange and red toward the tips, as red maples turn in a Central Florida November.' });
}
/* ---- round 2 (4.13.2): the OSCEOLA hen, Florida's own wild turkey ----
 * Over 'Meleagris gallopavo osceola 246449936' (Wikimedia Commons, CC0): a
 * hen in profile walking, tail folded. Darker than the Eastern bird, the
 * wing's white barring subdued. Traced in the 1.8x crop's pixels. */
const OS = q => [330 + q[0] / 1.8, 170 + q[1] / 1.8];
const OS_BODY = [[52,48],[70,30],[95,24],[122,32],[134,58],[130,82],[118,100],[160,98],[232,98],[330,114],[420,140],[488,184],[530,222],[505,262],[470,288],[420,300],[372,302],[300,300],[236,284],[182,258],[128,222],[94,180],[86,138],[88,106],[82,84],[72,66]].map(OS);
const OS_WING = [[220,142],[300,128],[370,138],[440,170],[486,214],[494,262],[440,262],[370,250],[300,228],[240,196]].map(OS);
const OS_TAILF = [[480,196],[540,228],[600,270],[652,308],[656,322],[606,318],[540,296],[488,276]].map(OS);
function tailSpread() {
  /* a hen's tail partly opened: nine barred feathers fanned up and back
   * from the rump, buff tips; never the full strut of a tom */
  const base = OS([492, 232]), out = [];
  for (let i = 0; i < 11; i++) {
    const a = (-1.45 + i * 0.15), L = 96 + 14 * Math.sin(i / 10 * Math.PI);
    out.push([base, [base[0] + Math.cos(a) * L, base[1] + Math.sin(a) * L], a]);
  }
  return out;
}
function henSvg(id, spread) {
  const O = OS([0, 0]), P = pts => cr(pts, true, O[0], O[1]);
  const legs = [[OS([300, 296]), OS([282, 380]), OS([270, 462])], [OS([368, 300]), OS([388, 380]), OS([410, 455])]];
  const legPath = legs.map(l => `M${(l[0][0] - O[0]).toFixed(1)} ${(l[0][1] - O[1]).toFixed(1)}L${(l[1][0] - O[0]).toFixed(1)} ${(l[1][1] - O[1]).toFixed(1)}L${(l[2][0] - O[0]).toFixed(1)} ${(l[2][1] - O[1]).toFixed(1)}`).join('');
  const toes = legs.map(l => { const f = l[2]; const x = f[0] - O[0], y = f[1] - O[1]; return `M${x} ${y}l-14 2M${x} ${y}l-10 6M${x} ${y}l6 2`; }).join('');
  let tail;
  if (!spread) {
    tail = `<path d="${P(OS_TAILF)}" fill="url(#${id}t)"/>`
      + `<path d="${[[500,206,640,300],[495,232,630,310],[492,258,620,316]].map(q => { const a = OS([q[0], q[1]]), b = OS([q[2], q[3]]); return `M${(a[0] - O[0]).toFixed(1)} ${(a[1] - O[1]).toFixed(1)}L${(b[0] - O[0]).toFixed(1)} ${(b[1] - O[1]).toFixed(1)}`; }).join('')}" stroke="#1E1610" stroke-width="1.2" opacity=".6"/>`
      + `<path d="M${(OS([600, 308])[0] - O[0]).toFixed(1)} ${(OS([600, 308])[1] - O[1]).toFixed(1)}L${(OS([652, 310])[0] - O[0]).toFixed(1)} ${(OS([652, 310])[1] - O[1]).toFixed(1)}L${(OS([652, 323])[0] - O[0]).toFixed(1)} ${(OS([652, 323])[1] - O[1]).toFixed(1)}L${(OS([606, 318])[0] - O[0]).toFixed(1)} ${(OS([606, 318])[1] - O[1]).toFixed(1)}Z" fill="#C9A66B"/>`;
  } else {
    tail = tailSpread().map(([b, t, a], i) => {
      const w = 11, nx = -Math.sin(a) * w, ny = Math.cos(a) * w, bx = b[0] - O[0], by = b[1] - O[1], tx = t[0] - O[0], ty = t[1] - O[1];
      const tip = [tx - Math.cos(a) * 9, ty - Math.sin(a) * 9];
      return `<path d="M${bx} ${by}L${(tx + nx).toFixed(1)} ${(ty + ny).toFixed(1)}Q${(tx + Math.cos(a) * 5).toFixed(1)} ${(ty + Math.sin(a) * 5).toFixed(1)} ${(tx - nx).toFixed(1)} ${(ty - ny).toFixed(1)}Z" fill="url(#${id}t)" stroke="#1E1610" stroke-width=".8"/>`
        + `<path d="M${(tip[0] + nx).toFixed(1)} ${(tip[1] + ny).toFixed(1)}L${(tx + nx).toFixed(1)} ${(ty + ny).toFixed(1)}Q${(tx + Math.cos(a) * 5).toFixed(1)} ${(ty + Math.sin(a) * 5).toFixed(1)} ${(tx - nx).toFixed(1)} ${(ty - ny).toFixed(1)}L${(tip[0] - nx).toFixed(1)} ${(tip[1] - ny).toFixed(1)}Z" fill="#C9A66B"/>`;
    }).reverse().join('');
  }
  /* rows of feather edges on the folded wing: Osceola's barring is
   * subdued, so bronze-buff scallops, not white */
  let rows = '';
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) {
    const q = OS([250 + k * 38 + r * 14, 150 + r * 24 + k * 6]); const x = q[0] - O[0], y = q[1] - O[1];
    rows += `M${(x - 9).toFixed(1)} ${y.toFixed(1)}Q${x.toFixed(1)} ${(y + 7).toFixed(1)} ${(x + 9).toFixed(1)} ${y.toFixed(1)}`;
  }
  let body = '';
  for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) {
    const q = OS([140 + k * 46 + (r % 2) * 22, 130 + r * 28]); const x = q[0] - O[0], y = q[1] - O[1];
    body += `M${(x - 8).toFixed(1)} ${y.toFixed(1)}Q${x.toFixed(1)} ${(y + 6).toFixed(1)} ${(x + 8).toFixed(1)} ${y.toFixed(1)}`;
  }
  const hd = OS([100, 45]), wt = OS([92, 96]), ey = OS([93, 36]);
  return `${spread ? 400 : 370} 270|<defs><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A3A2A"/><stop offset=".6" stop-color="#3A2C20"/><stop offset="1" stop-color="#2A2018"/></linearGradient>
<linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C3A28"/><stop offset="1" stop-color="#2E2218"/></linearGradient>
<linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6A5236"/><stop offset="1" stop-color="#4A3A28"/></linearGradient>
<clipPath id="${id}c"><path d="${P(OS_BODY)}"/></clipPath><clipPath id="${id}d"><path d="${P(OS_WING)}"/></clipPath></defs>
<path d="${legPath}" stroke="#C99A92" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${toes}" stroke="#B88A82" stroke-width="3.2" stroke-linecap="round"/>
${spread ? tail : ''}
<path d="${P(OS_BODY)}" fill="url(#${id}b)" stroke="#8C7556" stroke-width="2"/>
<g clip-path="url(#${id}c)"><path d="${body}" stroke="#7A6040" stroke-width="2.2" fill="none" opacity=".75"/></g>
${spread ? '' : tail}
<path d="${P(OS_WING)}" fill="url(#${id}w)"/>
<g clip-path="url(#${id}d)"><path d="${rows}" stroke="#B89668" stroke-width="2.6" fill="none" opacity=".85"/></g>
<ellipse cx="${(hd[0] - O[0]).toFixed(1)}" cy="${(hd[1] - O[1]).toFixed(1)}" rx="16" ry="12" fill="#8E9AA8"/>
<ellipse cx="${(wt[0] - O[0]).toFixed(1)}" cy="${(wt[1] - O[1]).toFixed(1)}" rx="5" ry="6" fill="#C46A6A"/>
<circle cx="${(ey[0] - O[0]).toFixed(1)}" cy="${(ey[1] - O[1]).toFixed(1)}" r="3" fill="#15100C"/>
<path d="M${(OS([70, 40])[0] - O[0]).toFixed(1)} ${(OS([70, 40])[1] - O[1]).toFixed(1)}L${(OS([50, 48])[0] - O[0]).toFixed(1)} ${(OS([50, 48])[1] - O[1]).toFixed(1)}L${(OS([72, 54])[0] - O[0]).toFixed(1)} ${(OS([72, 54])[1] - O[1]).toFixed(1)}Z" fill="#CDBBA0"/>`;
}
PIECES.push({ key: 'turkey', name: 'Osceola Turkey Hen, Tail Folded', ref: 'osc1.jpg', crop: [330, 170, 420, 330],
  src: '“Meleagris gallopavo osceola 246449936,” Wikimedia Commons, CC0',
  fit: { base: OS([340, 470]), tip: OS([340, 20]) }, at: OS([0, 0]), redraw: henSvg('dccTgH1', false), guest: 32,
  note: 'Florida’s own wild turkey, the Osceola, traced over a hen photographed in Florida: darker than the northern bird, with the wing’s barring subdued to bronze and buff. Her long tail is folded and clearly separate from the body, sloping down behind, barred, with a buff tip.' });
PIECES.push({ key: 'turkeyS', name: 'Osceola Turkey Hen, Tail Partly Spread', ref: 'osc1.jpg', crop: [330, 170, 420, 330],
  src: 'the same photograph; the tail opened as a hen opens hers, never a tom’s full strut',
  fit: { base: OS([340, 470]), tip: OS([340, 20]) }, at: OS([0, 0]), redraw: henSvg('dccTgH2', true), guest: 32, option: true, liveKey: 'turkey',
  note: 'The same hen with her tail partly opened: eleven barred feathers fanned up and back with buff tips. Hens rarely do this, so it is the less natural pose, but the tail reads at once as a turkey’s.' });
/* ---- the POULTS, over 'Wild turkeys (54004544308)' (Wikimedia Commons,
 * public domain): a hen leading young poults, buff and brown, the back
 * mottled, the face pale. Traced in the 1.6x crop's pixels; drawn facing
 * LEFT like the hen (the photo's poult faces right, so x is mirrored). */
const PL = q => [340 + q[0] / 1.6, 200 + q[1] / 1.6];
function poultSvg(id, down) {
  /* drawn in the photo's orientation (facing right), then the whole picture
   * is mirrored in one group so the sprite faces left like the hen */
  const X0 = 340 + 180 / 1.6, Y0 = 200 + 280 / 1.6, W = 160, H = 225;
  const T = pts => cr(pts.map(PL), true, X0, Y0);
  const body = [[372,352],[352,374],[320,362],[282,354],[240,360],[212,378],[198,402],[204,428],[228,448],[268,462],[318,458],[352,440],[370,410]];
  const neck = down ? [[352,372],[384,398],[412,440],[424,480],[410,486],[392,452],[366,424],[350,406]]
                    : [[352,372],[366,334],[380,310],[400,300],[418,306],[414,322],[396,330],[384,352],[372,400]];
  const hd = down ? PL([416, 482]) : PL([404, 310]), bl = down ? [PL([422, 476]), PL([432, 498]), PL([414, 494])] : [PL([416, 306]), PL([434, 316]), PL([416, 318])];
  const legs = [[[302, 458], [290, 520], [300, 558]], [[236, 452], [212, 510], [188, 554]]].map(l => l.map(PL));
  const P = q => `${(q[0] - X0).toFixed(1)} ${(q[1] - Y0).toFixed(1)}`;
  const legP = legs.map(l => `M${P(l[0])}L${P(l[1])}L${P(l[2])}`).join('') + legs.map(l => `M${P(l[2])}l8 1M${P(l[2])}l6 4M${P(l[2])}l-6 1`).join('');
  /* mottling: rows of brown scallops edged buff over the back and wing */
  let mot = '';
  for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) {
    const q = PL([214 + k * 28 + (r % 2) * 14, 368 + r * 16]); const x = q[0] - X0, y = q[1] - Y0;
    mot += `M${(x - 6).toFixed(1)} ${y.toFixed(1)}Q${x.toFixed(1)} ${(y + 6).toFixed(1)} ${(x + 6).toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${W} ${H}|<defs><linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A5A38"/><stop offset=".6" stop-color="#9C7A50"/><stop offset="1" stop-color="#C8AA7C"/></linearGradient>
<clipPath id="${id}c"><path d="${T(body)}"/></clipPath></defs><g transform="matrix(-1 0 0 1 ${W} 0)">
<path d="${legP}" stroke="#D9B7A2" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${T(body)}" fill="url(#${id}a)" stroke="#4E3820" stroke-width="1.3"/>
<g clip-path="url(#${id}c)"><path d="${mot}" stroke="#3E2A16" stroke-width="2.6" fill="none"/><path d="${mot}" stroke="#E2C99A" stroke-width="1.1" fill="none" transform="translate(0 2.2)"/></g>
<path d="${T(neck)}" fill="#CDB48A" stroke="#6E5232" stroke-width="1.1"/>
<circle cx="${(hd[0] - X0).toFixed(1)}" cy="${(hd[1] - Y0).toFixed(1)}" r="8.5" fill="#E6D6B6" stroke="#8E7450" stroke-width=".8"/>
<circle cx="${(hd[0] - X0 + 2.5).toFixed(1)}" cy="${(hd[1] - Y0 - 1.5).toFixed(1)}" r="1.9" fill="#1A1410"/>
<path d="M${P(bl[0])}L${P(bl[1])}L${P(bl[2])}Z" fill="#8E7454"/></g>`;
}
PIECES.push({ key: 'poult', name: 'Wild Turkey Poult', ref: 'pl4.jpg', crop: [340, 200, 470, 380], liveKey: 'chick',
  src: '“Wild turkeys (54004544308),” Wikimedia Commons, public domain', mirror: true,
  fit: { base: PL([280, 560]), tip: PL([280, 300]) }, at: [340 + 180 / 1.6, 200 + 280 / 1.6], redraw: poultSvg('dccTgL1', false), guest: 14,
  note: 'The yellow cartoon chick becomes a wild turkey poult, traced over a photograph of a hen leading hers: buff and brown, the back mottled, a pale face, long pale legs. Drawn facing left, as she does, so the overlay is mirrored.' });
PIECES.push({ key: 'poultpeck', name: 'Wild Turkey Poult, Feeding', ref: 'pl4.jpg', crop: [340, 200, 470, 380], liveKey: 'chick',
  src: 'the same photograph; the neck bent to the ground as the poults feed', mirror: true,
  fit: { base: PL([280, 560]), tip: PL([280, 300]) }, at: [340 + 180 / 1.6, 200 + 280 / 1.6], redraw: poultSvg('dccTgL2', true), guest: 14,
  note: 'The same poult with its neck bent and its bill at the ground, for when the hen stops and the poults feed beside her.' });
/* ---- the hen FEEDING (4.13.2, Rob's peck): over 'Adult and young turkey'
 * (Wikimedia Commons, public domain) — a hen with her head down at the
 * grass and a poult beside her. That photograph is three-quarters from
 * behind, so it gives the neck and head; the body, wing and tail are the
 * Osceola trace, nearly level as a feeding bird's is. The neck comes down
 * from the front of the breast in one curve, the bill at the ground. */
function henPeckSvg(id) {
  const std = henSvg(id, false);
  const O = OS([0, 0]);
  const body = [[150,112],[232,98],[330,114],[420,140],[488,184],[530,222],[505,262],[470,288],[420,300],[372,302],[300,300],[236,284],[182,262],[150,248],[118,262],[92,300],[74,348],[66,388],[78,402],[96,380],[114,338],[136,300],[156,268],[150,200],[138,150]].map(OS);
  const hd = OS([66, 408]), wt = OS([86, 390]), ey = OS([60, 402]);
  const P = pts => cr(pts, true, O[0], O[1]);
  /* swap the standing outline's path for the feeding one, and the head */
  return std.replace(/<path d="[^"]*" fill="url\(#[A-Za-z0-9]+b\)" stroke="#8C7556" stroke-width="2"\/>/, `<path d="${P(body)}" fill="url(#${id}b)" stroke="#8C7556" stroke-width="2"/>`)
    .replace(/<clipPath id="([A-Za-z0-9]+)c"><path d="[^"]*"\/><\/clipPath>/, (m, k) => `<clipPath id="${k}c"><path d="${P(body)}"/></clipPath>`)
    .replace(/<ellipse cx="[^"]*" cy="[^"]*" rx="16" ry="12" fill="#8E9AA8"\/>[\s\S]*$/, `<ellipse cx="${(hd[0] - O[0]).toFixed(1)}" cy="${(hd[1] - O[1]).toFixed(1)}" rx="15" ry="11" fill="#8E9AA8" transform="rotate(62 ${(hd[0] - O[0]).toFixed(1)} ${(hd[1] - O[1]).toFixed(1)})"/>
<ellipse cx="${(wt[0] - O[0]).toFixed(1)}" cy="${(wt[1] - O[1]).toFixed(1)}" rx="5" ry="6" fill="#C46A6A"/>
<circle cx="${(ey[0] - O[0]).toFixed(1)}" cy="${(ey[1] - O[1]).toFixed(1)}" r="3" fill="#15100C"/>
<path d="M${(OS([52, 414])[0] - O[0]).toFixed(1)} ${(OS([52, 414])[1] - O[1]).toFixed(1)}L${(OS([42, 446])[0] - O[0]).toFixed(1)} ${(OS([42, 446])[1] - O[1]).toFixed(1)}L${(OS([64, 424])[0] - O[0]).toFixed(1)} ${(OS([64, 424])[1] - O[1]).toFixed(1)}Z" fill="#CDBBA0"/>`);
}
PIECES.push({ key: 'turkeypeck', name: 'The Hen Feeding (Head Down)', ref: 'fg2.jpg', crop: [270, 85, 300, 260], liveKey: 'turkey',
  src: '“Adult and young turkey,” Wikimedia Commons, public domain (the neck and head); the body is the Osceola trace', mirror: true,
  fit: { base: [420, 330], tip: [420, 90] }, at: [282, 90], atScale: 0.78, redraw: henPeckSvg('dccTgH3'), guest: 32,
  note: 'Her own feeding pose, not the standing bird tipped forward: the body stays nearly level and the neck comes down from the front of the breast in one curve to the bill at the grass, as the hen in this photograph feeds. That photograph is three-quarters from behind, so it guided the neck and head; the body, wing and tail are the Osceola hen.' });
{
  /* BALD CYPRESS (leafc), over 'Cyprès chauves à Vaires-sur-Marne D201511 4'
   * (Wikimedia Commons, public domain): Taxodium distichum is a deciduous
   * conifer that drops whole branchlets in fall, so the falling piece is ONE
   * branchlet: a thin stem with flat, soft needles in two rows, angled
   * toward the tip, longest at the middle, yellow-green at the base turning
   * rust at the tips. Traced in the photo's pixels (the 2.2x crop). */
  const A = [82, 46], B = [338, 140], O = [60, -10];
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  let nd = '', tips = '';
  const n = 22, f = (x, y) => `${(x - O[0]).toFixed(1)} ${(y - O[1]).toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const t = 0.03 + i / n * 0.94, bx = A[0] + dx * t, by = A[1] + dy * t;
    const len = 44 * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.05))) * (t > 0.85 ? 0.85 : 1);
    for (const sd of [-1, 1]) {
      /* along the stem cos(a), out to one side sin(a): a = 55 degrees off */
      const along = Math.cos(0.96), out = Math.sin(0.96) * sd;
      const vx = ux * along + nx * out, vy = uy * along + ny * out;
      const tx = bx + vx * len, ty = by + vy * len, w = 4.2, px = -vy * w, py = vx * w;
      nd += `M${f(bx, by)}Q${f(bx + vx * len * 0.5 + px, by + vy * len * 0.5 + py)} ${f(tx, ty)}Q${f(bx + vx * len * 0.5 - px, by + vy * len * 0.5 - py)} ${f(bx, by)}Z`;
      const mx = bx + vx * len * 0.62, my = by + vy * len * 0.62;
      tips += `M${f(mx + px * 0.7, my + py * 0.7)}Q${f(tx + vx * 1.5, ty + vy * 1.5)} ${f(mx - px * 0.7, my - py * 0.7)}Z`;
    }
  }
  PIECES.push({ key: 'leafc', name: 'Bald Cypress Branchlet', prec: 100, ref: 'cy2.jpg', crop: [70, 30, 340, 160],
    src: '“Cyprès chauves à Vaires-sur-Marne D201511 4 (fruit et feuilles),” Wikimedia Commons, public domain',
    fit: { base: A, tip: B, span: 20 }, at: O,
    redraw: `310 200|<defs><linearGradient id="dccTgY1" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#B8B060"/><stop offset=".55" stop-color="#D49A50"/><stop offset="1" stop-color="#C46A3A"/></linearGradient></defs>
<path d="${nd}" fill="url(#dccTgY1)" stroke="#8A5A2A" stroke-width=".6"/>
<path d="${tips}" fill="#B4542E" opacity=".9"/>
<path d="M${A[0] - O[0] - 8} ${A[1] - O[1] - 3}L${B[0] - O[0]} ${B[1] - O[1]}" stroke="#7E6A36" stroke-width="2.4" stroke-linecap="round"/>`,
    note: 'The live cypress reads as a fern frond. A bald cypress is a conifer that loses its leaves: in fall it drops whole branchlets, a thin stem with soft, flat needles in two rows, yellow-green going rust at the tips. Redrawn as one fallen branchlet.' });
}
{
  /* YELLOW SQUASH (gourd2), over 'CSA-Yellow-Squash' (Wikimedia Commons,
   * public domain): no public-domain or CC0 photograph of a crookneck could
   * be found, so the piece is the yellow summer squash in this one, with
   * its bend at the neck: a swollen blossom end streaked green, a long
   * yellow body flecked paler, a short green stalk. */
  const out = [[20,215],[80,130],[170,80],[270,48],[400,30],[560,30],[720,25],[860,20],[885,35],[892,100],[880,145],[840,162],[700,170],[560,185],[480,220],[400,255],[300,280],[180,285],[80,268],[30,240]];
  let fl = '';
  for (let i = 0; i < 46; i++) {
    const x = 60 + (i * 197) % 800, y = 60 + (i * 89) % 190, inBody = x > 300 ? (y > 30 && y < 170 - (x > 500 ? 0 : (x - 300) * -0.2)) : (y > 90 && y < 270);
    if (!inBody) { continue; }
    fl += `M${x} ${y}l${14 + (i % 3) * 6} ${(i % 2 ? 2 : -2)}`;
  }
  PIECES.push({ key: 'gourd2', name: 'Yellow Squash', ref: 'sq1.jpg', crop: [0, 0, 960, 307],
    src: '“CSA-Yellow-Squash,” Wikimedia Commons, public domain', guest: 26,
    fit: { base: [20, 215], tip: [940, 100], span: 30 }, at: [0, 0],
    redraw: `960 307|<defs><linearGradient id="dccTgQ1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B9CC6A"/><stop offset=".3" stop-color="#D8D070"/><stop offset=".38" stop-color="#F2C640"/><stop offset="1" stop-color="#F0B21C"/></linearGradient>
<linearGradient id="dccTgQ2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6C8" stop-opacity=".55"/><stop offset=".35" stop-color="#FFF6C8" stop-opacity="0"/><stop offset="1" stop-color="#9A6A08" stop-opacity=".35"/></linearGradient></defs>
<path d="${cr(out, true)}" fill="url(#dccTgQ1)" stroke="#A07A10" stroke-width="5"/>
<path d="${fl}" stroke="#FFF2A8" stroke-width="7" stroke-linecap="round" opacity=".7"/>
<path d="M60 200l60-60M90 230l90-90M150 250l100-110M120 180l70-60" stroke="#7FA43A" stroke-width="9" stroke-linecap="round" opacity=".55"/>
<path d="${cr(out, true)}" fill="url(#dccTgQ2)"/>
<path d="M884 64 Q910 70 936 92 L944 116 Q920 120 892 128 Q900 96 884 64 Z" fill="#7CA640" stroke="#4E7020" stroke-width="4"/>`,
    note: 'The live crookneck is a flat yellow blob. No public-domain or CC0 photograph of a crookneck turned up, so this is the yellow summer squash in the photograph: a swollen blossom end streaked green, a long yellow body flecked paler, the bend at the neck and a short green stalk. If Rob wants a true crookneck, it needs a photograph first.' });
}
/* ---- the CORNUCOPIA accent (4.13.2): a woven horn spilling the redrawn
 * produce. No public-domain or CC0 photograph of a woven cornucopia exists
 * on Commons, so the WEAVE is drawn from 'Sweet cherries in basket 2018 G1'
 * (public domain): rows of pale willow over darker stakes, a rolled rim.
 * The produce IS the redrawn pumpkin, corn, cranberries and acorn squash,
 * nested, so the accent and the falling pieces are one family. */
function nest(key, x, y, w, rot) {
  const p = PIECES.find(q => q.key === key && !q.old); const c = p.redraw.indexOf('|');
  const [vw2, vh2] = p.redraw.slice(0, c).split(' ').map(Number);
  const body = p.redraw.slice(c + 1).replace(/id="(dccTg[A-Za-z0-9]+)"/g, 'id="$1n"').replace(/url\(#(dccTg[A-Za-z0-9]+)\)/g, 'url(#$1n)');
  const h = w * vh2 / vw2;
  return `<g transform="translate(${x} ${y}) rotate(${rot || 0})"><svg x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" viewBox="0 0 ${vw2} ${vh2}">${body}</svg></g>`;
}
function cornucopiaSvg() {
  /* the horn: a tapering curve from the curled tip (left, low) to the open
   * mouth (right, up), in a 120x84 box; its centreline and half-widths */
  const C = t => { const u = 1 - t; return [u * u * u * 10 + 3 * u * u * t * 18 + 3 * u * t * t * 50 + t * t * t * 80, u * u * u * 30 + 3 * u * u * t * 66 + 3 * u * t * t * 70 + t * t * t * 52]; };
  const R = t => 1.5 + 21 * Math.pow(t, 1.15);
  const top = [], bot = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = C(Math.max(0, t - 0.01)), b = C(Math.min(1, t + 0.01)), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d, c = C(t), r = R(t);
    top.push([c[0] + nx * r, c[1] + ny * r]); bot.push([c[0] - nx * r, c[1] - ny * r]);
  }
  const outline = 'M' + top.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L') + 'L' + bot.reverse().map(p => p.map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
  /* weave rows: arcs across the horn at even steps, alternating shade */
  let rows = '';
  for (let i = 2; i < 24; i++) {
    const t = i / 24, a = C(t - 0.01), b = C(t + 0.01), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d, c = C(t), r = R(t);
    const p0 = [c[0] + nx * r, c[1] + ny * r], p1 = [c[0] - nx * r, c[1] - ny * r], bend = r * 0.35;
    rows += `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}Q${(c[0] + dx / d * bend).toFixed(1)} ${(c[1] + dy / d * bend).toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke="${i % 2 ? '#E6CFA0' : '#C99A5E'}" stroke-width="${(1.2 + r * 0.06).toFixed(2)}" fill="none"/>`;
  }
  const mouth = C(1), m0 = top[top.length - 1];
  return `130 88|<defs><linearGradient id="dccTgU1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D8B57E"/><stop offset="1" stop-color="#8C5E2E"/></linearGradient><clipPath id="dccTgU2"><path d="${outline}"/></clipPath></defs>
<path d="${outline}" fill="url(#dccTgU1)"/>
<g clip-path="url(#dccTgU2)">${rows}<path d="${outline}" fill="none" stroke="#5E3E1C" stroke-width="2.4" opacity=".6"/></g>
<path d="M10 30 Q4 24 8 19 Q13 16 15 22" stroke="#B58448" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<ellipse cx="${mouth[0].toFixed(1)}" cy="${mouth[1].toFixed(1)}" rx="6" ry="21.5" fill="#5E3E1C" transform="rotate(-14 ${mouth[0].toFixed(1)} ${mouth[1].toFixed(1)})"/>
${nest('corn', 98, 36, 18, 70)}${nest('gourd1', 92, 54, 25, 0)}${nest('gourd3', 108, 66, 19, -20)}${nest('gourd2', 96, 79, 24, -4)}${nest('cranberry', 118, 76, 13, 15)}
<ellipse cx="${mouth[0].toFixed(1)}" cy="${mouth[1].toFixed(1)}" rx="6" ry="21.5" fill="none" stroke="#B58448" stroke-width="3.2" stroke-dasharray="20 200" stroke-dashoffset="-34" transform="rotate(-14 ${mouth[0].toFixed(1)} ${mouth[1].toFixed(1)})"/>`;
}
PIECES.push({ key: 'cornucopia', prec: 100, name: 'The Cornucopia (Bottom-Left Corner)', ref: 'bk1.jpg', crop: [180, 300, 600, 380], accent: true,
  src: '“Sweet cherries in basket 2018 G1,” Wikimedia Commons, public domain (the weave; no public-domain photograph of a woven cornucopia exists)',
  fit: null, at: [0, 0], redraw: cornucopiaSvg(), guest: 40,
  note: 'A woven horn from the curled tip to an open mouth with a rolled rim, the weave in rows of pale willow over darker stakes as in the basket photographed, spilling the redrawn pumpkin, corn, cranberries and squashes. It is shown beside the basket rather than over it: the shapes differ, the weave and colors are what it gives.' });
/* ---- the PIE (4.13.2, Rob confirmed a whole pie): the crust over
 * 'Motherhood and apple pie' (USDA, Wikimedia Commons, public domain), a
 * whole pie in its pan seen a little from above, with a crimped edge. A
 * pumpkin pie's top is open, so inside the traced rim the filling is drawn:
 * smooth orange custard, darker at the edge where it baked. With steam and
 * without (Rob picks). Traced in the photo's pixels, origin [0, 30]. */
function pieSvg(id, steam) {
  const cx = 244, cy = 233, RX = 244, RY = 205, n = 46;
  let crimp = '';
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2, m = (a + b) / 2;
    const p0 = [cx + Math.cos(a) * (RX - 6), cy + Math.sin(a) * (RY - 6)], p1 = [cx + Math.cos(b) * (RX - 6), cy + Math.sin(b) * (RY - 6)];
    const q = [cx + Math.cos(m) * (RX + 6), cy + Math.sin(m) * (RY + 6)];
    const i0 = [cx + Math.cos(a) * (RX - 34), cy + Math.sin(a) * (RY - 30)];
    crimp += `<path d="M${i0[0].toFixed(1)} ${i0[1].toFixed(1)}L${p0[0].toFixed(1)} ${p0[1].toFixed(1)}Q${q[0].toFixed(1)} ${q[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke="#8A4E1A" stroke-width="3" fill="none" opacity=".55"/>`;
  }
  const st = steam ? `<g stroke="#FFFFFF" stroke-width="12" fill="none" stroke-linecap="round" opacity=".55"><path d="M170 150 Q140 100 175 60 Q205 20 170 -20"/><path d="M250 140 Q222 90 255 50 Q285 10 252 -30"/><path d="M330 150 Q300 100 334 60 Q362 22 330 -18"/></g>` : '';
  return `500 ${steam ? 520 : 470}|<defs><radialGradient id="${id}f" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#E08A3A"/><stop offset=".75" stop-color="#C8662A"/><stop offset="1" stop-color="#9A4A1C"/></radialGradient>
<radialGradient id="${id}c" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#F2C27A"/><stop offset="1" stop-color="#C98A3E"/></radialGradient></defs>
<g transform="translate(0 ${steam ? 50 : 0})">
<ellipse cx="${cx}" cy="${cy + 10}" rx="${RX + 6}" ry="${RY + 8}" fill="#5A5A60"/>
<ellipse cx="${cx}" cy="${cy}" rx="${RX}" ry="${RY}" fill="url(#${id}c)" stroke="#8A4E1A" stroke-width="5"/>
${crimp}
<ellipse cx="${cx + 4}" cy="${cy + 4}" rx="${RX - 40}" ry="${RY - 36}" fill="url(#${id}f)" stroke="#A85A24" stroke-width="5"/>
<ellipse cx="${cx - 40}" cy="${cy - 50}" rx="70" ry="34" fill="#F4B070" opacity=".35"/>
</g>${st}`;
}
PIECES.push({ key: 'pie', name: 'Pumpkin Pie, Whole', ref: 'ap3.jpg', crop: [0, 40, 520, 450],
  src: '“Motherhood and apple pie,” USDA, Wikimedia Commons, public domain (the pie, pan and crimped crust)',
  fit: { base: [244, 470], tip: [244, 30] }, at: [0, 30], redraw: pieSvg('dccTgI1', false), guest: 28,
  note: 'The live pie is a flat wedge. Redrawn as a whole pie in its pan, traced over a photographed pie seen a little from above with a crimped crust; a pumpkin pie is open on top, so inside the rim is the smooth orange filling, darker where it baked at the edge. No steam.' });
PIECES.push({ key: 'pieS', name: 'Pumpkin Pie, Whole, With Steam', ref: 'ap3.jpg', crop: [0, 40, 520, 450], option: true, liveKey: 'pie',
  src: 'the same photograph', fit: { base: [244, 470], tip: [244, 30] }, at: [0, -20], redraw: pieSvg('dccTgI2', true), guest: 30,
  note: 'The same pie with three wisps of steam rising off it, fresh from the oven.' });
/* the three pieces the ENGINE builds from rules (TG_GEN in engine.js):
 * the sheet shows exactly what the engine draws */
function engineGen() {
  const src = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
  const blk = src.slice(src.indexOf('/* TG_GEN_START'), src.indexOf('/* TG_GEN_END */'));
  const SV = new Function(`var tgCypress, tgPie, tgHorn; ${src.match(/var SVGS = \{[\s\S]*?\n\t\};/)[0].replace(/\n\t\t\w+: function \(\) \{[^\n]*\},?/g, '')}\nreturn SVGS;`)();
  return new Function('SVGS', blk + '\nreturn { tgCypress: tgCypress, tgPie: tgPie, tgHorn: tgHorn };')(SV);
}
if (fs.existsSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js')) && ENG.indexOf('TG_GEN_START') >= 0) {
  const G = engineGen();
  const set = (k, v) => { const p = PIECES.find(q => q.key === k && !q.old); if (p) { p.redraw = v; } };
  set('leafc', G.tgCypress()); set('pie', G.tgPie(false)); set('pieS', G.tgPie(true)); set('cornucopia', G.tgHorn());
}
module.exports = { PIECES, TURKEY_SRC, liveSvgs, cr, veins };
/* ---- the review renders: node tools/tg-pieces.js --fit [key] | --sheet -- */
if (require.main === module) {
  const { open } = require('./harness');
  const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/tref';
  const live = liveSvgs();
  const url = r => { const c = r.indexOf('|'); const [w, h] = r.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${r.slice(c + 1)}</svg>`) }; };
  const only = (process.argv.find(a => a.startsWith('--fit=')) || '').slice(6);
  const list = PIECES.filter(p => (!only && !p.old) || p.key === only).map(p => ({ ...p, liveU: url(live[p.liveKey || p.key] || live.turkey), newU: url(p.redraw),
    img: 'data:image/' + (p.ref.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(path.join(REF, p.ref)).toString('base64') }));
  const RUN = `window.run = async (list, sheet) => {
    for (const p of list) {
      const im = new Image(); im.src = p.img; await im.decode();
      const lv = new Image(); lv.src = p.liveU.u; await lv.decode();
      const nw = new Image(); nw.src = p.newU.u; await nw.decode();
      const [cx, cy, cw, ch] = p.crop, S = Math.min(1.6, 290 / Math.max(cw, ch)), box = document.createElement('section');
      box.innerHTML = '<h2>' + p.name + '</h2><p class="note">' + p.note + ' Reference: ' + p.src + '.</p>';
      const row = document.createElement('div'); row.className = 'row'; box.appendChild(row);
      const caps = ['the photograph', 'the live drawing over it at 50%', 'the redraw over it at 50%', 'the redraw'];
      for (let i = 0; i < 4; i++) {
        const c = document.createElement('canvas'), W = Math.round(cw * S), H = Math.round(ch * S);
        c.width = W * 2; c.height = H * 2; c.style.width = W + 'px'; c.style.height = H + 'px';
        const g = c.getContext('2d'); g.scale(2, 2);
        if (i < 3) { g.drawImage(im, cx, cy, cw, ch, 0, 0, W, H); } else { g.fillStyle = '#F3E6C8'; g.fillRect(0, 0, W, H); }
        g.scale(S, S); g.translate(-cx, -cy);
        if (i === 1) {
          const f = p.fit, ax = f.tip[0] - f.base[0], ay = f.tip[1] - f.base[1], len = Math.hypot(ax, ay);
          const sw = p.liveU.w, sh = p.liveU.h, k = len / (f.span || sh);
          g.save(); g.globalAlpha = 0.5; g.translate(f.base[0], f.base[1]); g.rotate(Math.atan2(ay, ax) + Math.PI / 2 + (f.rot || 0)); g.scale(k, k);
          g.drawImage(lv, -sw / 2, -sh, sw, sh); g.restore();
        }
        if (i >= 2 && p.fitNew) {
          const f = p.fitNew, ax = f.tip[0] - f.base[0], ay = f.tip[1] - f.base[1], len = Math.hypot(ax, ay), sw = p.newU.w, sh = p.newU.h, k = len / (f.span || sh);
          g.save(); g.globalAlpha = i === 2 ? 0.5 : 1; g.translate(f.base[0], f.base[1]); g.rotate(Math.atan2(ay, ax) + Math.PI / 2); g.scale(k, k);
          g.drawImage(nw, -sw / 2 + (f.dx || 0), -sh + (f.dy || 0), sw, sh); g.restore();
        } else if (i >= 2) { g.save(); g.globalAlpha = i === 2 ? 0.5 : 1; const k2 = p.atScale || 1; if (p.mirror) { g.translate(p.at[0] * 2 + p.newU.w * k2, 0); g.scale(-1, 1); } g.drawImage(nw, p.at[0], p.at[1], p.newU.w * k2, p.newU.h * k2); g.restore(); }
        const fg = document.createElement('figure'); fg.appendChild(c); const fc = document.createElement('figcaption'); fc.textContent = caps[i]; fg.appendChild(fc); row.appendChild(fg);
      }
      const gs = document.createElement('div'); gs.className = 'row'; gs.style.marginTop = '8px';
      [['live', p.liveU.u], ['redraw', p.newU.u]].forEach(([n, u]) => {
        const f = document.createElement('figure'); f.innerHTML = '<div class="row"><span class="onpage light"><img src="' + u + '" style="height:' + (p.guest || 26) + 'px"></span><span class="onpage dark"><img src="' + u + '" style="height:' + (p.guest || 26) + 'px"></span></div><figcaption>' + n + ', at a guest’s size</figcaption>'; gs.appendChild(f); });
      box.appendChild(gs); document.getElementById('w').appendChild(box);
    } document.title = 'done'; };`;
  const CSS = `body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
    h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 4px;text-align:center} .sub,.note{color:#555;margin:0 auto 10px;max-width:980px}
    section{border-top:1px solid #E3D9C6;padding:14px 0 8px} .row{display:flex;gap:10px;justify-content:center;align-items:flex-end;flex-wrap:wrap}
    figure{margin:0;text-align:center} figcaption{color:#666;margin-top:3px} canvas{display:block;border:1px solid #D9CDB6;border-radius:3px}
    .onpage{display:inline-flex;align-items:center;justify-content:center;width:52px;height:46px;border-radius:5px} .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}`;
  (async () => {
    const sheet = process.argv.includes('--sheet');
    const head = sheet ? (process.env.TG_HEAD || '') : '';
    const KEPT = [['leafm', 'Red maple, full red'], ['leafm2', 'Red maple, mid-turn'], ['leafc', 'Bald cypress'], ['gourd2', 'Crookneck squash'], ['pie', 'Pumpkin pie']];
    const top = sheet ? `<h1>Seasons — Thanksgiving: Every Piece Against a Photograph</h1>
      <p class="sub">Every falling piece, drawn again the way the palm and the flamingo were: a public-domain or CC0 photograph, the live drawing laid over it at 50%, the redraw laid over it at 50% after the fix pass, then both at the size a guest sees them, on cream and on the navy footer. Nothing here is live: Thanksgiving stays exactly as it is until Rob picks, piece by piece, live or redraw.</p>` : '';
    const tail = sheet ? `<section><h2>Not Yet Redrawn</h2><p class="note">No public-domain or CC0 photograph usable for an overlay has turned up yet for these, so the live drawing stands and nothing is offered in its place. The two maples were redrawn from photographs for 4.13.0 and Rob approved them.</p><div class="row">${KEPT.map(([k, n]) => { const u = url(live[k]).u; return `<figure><div class="row"><span class="onpage light"><img src="${u}" style="height:26px"></span><span class="onpage dark"><img src="${u}" style="height:26px"></span></div><figcaption>${n}</figcaption></figure>`; }).join('')}</div></section>` : '';
    const ses = await open(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${head}${top}<div id="w"></div>${tail}<script>${RUN}</script>`, { viewport: { width: 1300, height: 900 }, dsf: sheet ? 2 : 1 });
    await ses.page.evaluate(([l, s]) => window.run(l, s), [list, sheet]);
    await ses.page.setViewportSize({ width: 1300, height: await ses.page.evaluate(() => document.body.scrollHeight) });
    const out = sheet ? path.join(ROOT, 'build', 'Seasons - 4.13.1 thanksgiving pieces.png') : path.join(REF, 'fit.png');
    await ses.page.screenshot({ path: out });
    await ses.close(); console.log(out);
  })();
}
