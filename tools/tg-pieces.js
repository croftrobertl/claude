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
function liveSvgs() {
  const PAL = JSON.parse(ENG.match(/var PAL = (\{[\s\S]*?\});/)[1]);
  const SVGS = new Function(`${ENG.match(/var SVGS = \{[\s\S]*?\n\t\};/)[0]}\nreturn SVGS;`)();
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
  PIECES.push({ key: 'turkey', name: 'Wild Turkey Hen', ref: 'tk1.jpg', crop: [370, 50, 520, 590],
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
module.exports = { PIECES, TURKEY_SRC, liveSvgs, cr, veins };
/* ---- the review renders: node tools/tg-pieces.js --fit [key] | --sheet -- */
if (require.main === module) {
  const { open } = require('./harness');
  const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/tref';
  const live = liveSvgs();
  const url = r => { const c = r.indexOf('|'); const [w, h] = r.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${r.slice(c + 1)}</svg>`) }; };
  const only = (process.argv.find(a => a.startsWith('--fit=')) || '').slice(6);
  const list = PIECES.filter(p => !only || p.key === only).map(p => ({ ...p, liveU: url(live[p.key]), newU: url(p.redraw),
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
        } else if (i >= 2) { g.save(); g.globalAlpha = i === 2 ? 0.5 : 1; g.drawImage(nw, p.at[0], p.at[1], p.newU.w, p.newU.h); g.restore(); }
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
