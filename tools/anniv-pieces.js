'use strict';
/**
 * DCC Seasons — the Anniversary's falling pieces, redrawn to the palm and
 * flamingo's standard (2026-10-26): a shaped, shaded drawing, fitted over
 * a public-domain or CC0 photograph at 50% where the object has one.
 * Each entry is a sprite in the engine's format ('w h|<svg body>');
 * gradient ids are prefixed dccAn so nothing clashes if one is inlined.
 *
 *   node tools/anniv-pieces.js         (writes build/.anniv-pieces.json)
 */
const fs = require('fs');
const path = require('path');

const GOLD = (id, dir) => `<linearGradient id="${id}" ${dir || 'x1="0" y1="0" x2="1" y2="0"'}><stop offset="0" stop-color="#7C5C16"/><stop offset=".22" stop-color="#C9A227"/><stop offset=".42" stop-color="#F6E3A0"/><stop offset=".55" stop-color="#E2C25A"/><stop offset=".8" stop-color="#A9831F"/><stop offset="1" stop-color="#6E5013"/></linearGradient>`;

/* One flute, drawn over the MET's 19th-century cut-glass flute (CC0):
 * rim 3.1..22.9 at y .7, the bowl tapering to 10.6..16 at y 39.3, a
 * knopped stem and a round foot 23 wide. 26 x 61 units. */
function flute(id, fill) {
  return `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9DCE6" stop-opacity=".75"/><stop offset=".18" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset=".5" stop-color="#E4EFF5" stop-opacity=".25"/><stop offset=".82" stop-color="#FFFFFF" stop-opacity=".5"/><stop offset="1" stop-color="#B4CCD8" stop-opacity=".8"/></linearGradient>
<linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7E7A6"/><stop offset=".55" stop-color="#EDCB6A"/><stop offset="1" stop-color="#D9AE45"/></linearGradient></defs>
${fill ? `<path d="M4.3 8.5 L21.7 8.5 Q20.9 22 16.6 38.4 Q13 39.6 9.4 38.4 Q5.1 22 4.3 8.5 Z" fill="url(#${id}c)"/>
<ellipse cx="13" cy="8.5" rx="8.7" ry=".9" fill="#FBF0C6"/>
<g fill="#FFFCEB" opacity=".9"><circle cx="11.6" cy="34" r=".55"/><circle cx="12.4" cy="29" r=".5"/><circle cx="11.9" cy="23.5" r=".6"/><circle cx="13.1" cy="18" r=".5"/><circle cx="12.3" cy="12.5" r=".65"/><circle cx="14.3" cy="31" r=".45"/><circle cx="14.6" cy="21" r=".5"/><circle cx="14.1" cy="14.6" r=".45"/></g>` : ''}
<path d="M3.1 .8 L22.9 .8 Q21.9 21 16.2 39.3 Q13 40.2 9.8 39.3 Q4.1 21 3.1 .8 Z" fill="url(#${id}g)" stroke="#9FBCCB" stroke-width=".55"/>
<path d="M6.6 1.4 Q7.6 6 8.6 9.6 M10.6 1.4 Q11.1 6 11.4 10.2 M15.4 1.4 Q14.9 6 14.6 10.2 M19.4 1.4 Q18.4 6 17.4 9.6" stroke="#FFFFFF" stroke-width=".7" fill="none" opacity=".7"/>
<path d="M8.6 9.6 Q9.6 26 11.4 38.6 M11.4 10.2 Q11.9 26 12.4 39 M14.6 10.2 Q14.1 26 13.6 39 M17.4 9.6 Q16.4 26 14.6 38.6" stroke="#FFFFFF" stroke-width=".45" fill="none" opacity=".55"/>
<ellipse cx="13" cy=".9" rx="9.9" ry=".9" fill="none" stroke="#E8F2F7" stroke-width=".6"/>
<path d="M12.2 39.6 L12.3 47 L13.7 47 L13.8 39.6 Z" fill="#DCE9F0" stroke="#9FBCCB" stroke-width=".4"/>
<path d="M11 47 L15 47 L15.6 48.3 L15 49.6 L11 49.6 L10.4 48.3 Z" fill="#E9F2F6" stroke="#9FBCCB" stroke-width=".4"/>
<path d="M12.3 49.6 L12.1 54 L13.9 54 L13.7 49.6 Z" fill="#DCE9F0" stroke="#9FBCCB" stroke-width=".4"/>
<ellipse cx="13" cy="56.6" rx="11.7" ry="3" fill="url(#${id}g)" stroke="#9FBCCB" stroke-width=".55"/>
<path d="M3.6 56.6 L22.4 56.6 M6 55 L20 58.2 M20 55 L6 58.2" stroke="#FFFFFF" stroke-width=".35" opacity=".6"/>`;
}

/* A gold band in three-quarter view: the outer wall shaded as a
 * cylinder, the flat top face lighter, and the inside back wall seen
 * through the hole (the CC0 'Gold wedding ring' photograph gives the
 * colours: deep olive-gold in the shade, a pale cream highlight). */
function band(id, cx, cy, R, k, t, h) {
  const ri = R - t, top = cy, bot = cy + h;
  return `<defs>${GOLD(id + 'o')}${GOLD(id + 'i', 'x1="1" y1="0" x2="0" y2="0"')}
<clipPath id="${id}hc"><ellipse cx="${cx}" cy="${top}" rx="${ri}" ry="${ri * k}"/></clipPath>
<mask id="${id}m"><rect x="-50" y="-50" width="200" height="200" fill="#fff"/><g clip-path="url(#${id}hc)"><ellipse cx="${cx}" cy="${bot}" rx="${ri}" ry="${ri * k}" fill="#000"/></g></mask></defs>
<g mask="url(#${id}m)">
<path d="M${cx - R} ${top} L${cx - R} ${bot} A${R} ${R * k} 0 0 0 ${cx + R} ${bot} L${cx + R} ${top} Z" fill="url(#${id}o)"/>
<ellipse cx="${cx}" cy="${top}" rx="${R}" ry="${R * k}" fill="#E8CB6E"/>
<ellipse cx="${cx}" cy="${top}" rx="${ri}" ry="${ri * k}" fill="url(#${id}i)"/>
<path d="M${cx - R * 0.72} ${top - R * k * 0.62} A${R} ${R * k} 0 0 1 ${cx + R * 0.1} ${top - R * k * 0.99}" stroke="#FFF6D6" stroke-width="${t * 0.35}" fill="none" stroke-linecap="round" opacity=".9"/>
<path d="M${cx - R * 0.6} ${bot + R * k * 0.55} A${R} ${R * k} 0 0 0 ${cx - R * 0.15} ${bot + R * k * 0.95}" stroke="#FFF2C2" stroke-width="${h * 0.22}" fill="none" stroke-linecap="round" opacity=".85"/>
</g>`;
}

/* a heart outline, centred, w wide */
const HEART = 'M12 21.6 C9 19 2.2 14 2.2 8 C2.2 4.4 4.8 2.2 7.6 2.2 C9.6 2.2 11.1 3.4 12 5 C12.9 3.4 14.4 2.2 16.4 2.2 C19.2 2.2 21.8 4.4 21.8 8 C21.8 14 15 19 12 21.6 Z';
const HEART_IN = 'M12 17.4 C10 15.6 5.6 12.4 5.6 8.6 C5.6 6.5 7.1 5.3 8.7 5.3 C10 5.3 11.1 6.1 12 7.6 C12.9 6.1 14 5.3 15.3 5.3 C16.9 5.3 18.4 6.5 18.4 8.6 C18.4 12.4 14 15.6 12 17.4 Z';

const SPARK = (x, y, r) => `<path d="M${x} ${y - r} L${x + r * 0.22} ${y - r * 0.22} L${x + r} ${y} L${x + r * 0.22} ${y + r * 0.22} L${x} ${y + r} L${x - r * 0.22} ${y + r * 0.22} L${x - r} ${y} L${x - r * 0.22} ${y - r * 0.22} Z" fill="#FFFFFF"/>`;

const P = {
  heartA: `24 23|<defs><radialGradient id="dccAnH1" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#F7B9C2"/><stop offset=".55" stop-color="#E8838F"/><stop offset="1" stop-color="#C85A6B"/></radialGradient></defs>
<path d="${HEART}" fill="url(#dccAnH1)" stroke="#B9505F" stroke-width=".5"/>
<path d="M6.2 6.4 Q4.8 8 5.6 10.6" stroke="#FFE3E7" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".9"/><circle cx="8.6" cy="5.4" r=".9" fill="#FFF1F3"/>`,
  heartB: `24 23|<defs>${GOLD('dccAnH2', 'x1="0" y1="0" x2="1" y2="1"')}<radialGradient id="dccAnH3" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#F6B0BA"/><stop offset="1" stop-color="#D86C7C"/></radialGradient></defs>
<path d="${HEART}" fill="url(#dccAnH2)"/><path d="M12 19.6 C9.6 17.4 4 13.4 4 8.3 C4 5.5 6 3.9 8.1 3.9 C9.8 3.9 11.2 5 12 6.6 C12.8 5 14.2 3.9 15.9 3.9 C18 3.9 20 5.5 20 8.3 C20 13.4 14.4 17.4 12 19.6 Z" fill="url(#dccAnH3)"/>
<path d="M7 6.8 Q5.8 8.2 6.5 10.4" stroke="#FFE3E7" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
  ringA: `24 26|${band('dccAnR1', 12, 12.5, 9.2, 0.58, 2.1, 2.6)}<path d="M10.2 5.6 L12 2 L13.8 5.6 L12 6.8 Z" fill="#E4F3FB" stroke="#9CC0D4" stroke-width=".4"/><path d="M12 2 L12 6.8 M10.2 5.6 L13.8 5.6" stroke="#FFFFFF" stroke-width=".35"/>${SPARK(13.6, 2.6, 1.3)}`,
  ringB: `32 24|${band('dccAnR2', 20.5, 10.5, 8.6, 0.58, 2, 2.4)}${band('dccAnR3', 11.5, 12, 8.6, 0.58, 2, 2.4)}
<defs><clipPath id="dccAnRk"><rect x="24" y="0" width="10" height="11"/></clipPath></defs><g clip-path="url(#dccAnRk)">${band('dccAnR4', 20.5, 10.5, 8.6, 0.58, 2, 2.4)}</g>`,
  crystalA: `20 28|<defs><linearGradient id="dccAnC1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#D7ECF7"/><stop offset="1" stop-color="#A9CDE0"/></linearGradient></defs>
<circle cx="10" cy="2.2" r="1.3" fill="none" stroke="#B9CDD8" stroke-width=".6"/>
<path d="M10 3.6 Q17.6 10.6 17.6 17.6 Q17.6 26.4 10 26.4 Q2.4 26.4 2.4 17.6 Q2.4 10.6 10 3.6 Z" fill="url(#dccAnC1)" stroke="#8FB6CB" stroke-width=".55"/>
<path d="M10 3.6 L7.2 13 L10 22 L12.8 13 Z" fill="#F6FBFE" opacity=".9"/><path d="M10 3.6 L2.6 15.6 L7.2 13 Z M10 3.6 L17.4 15.6 L12.8 13 Z" fill="#C3E0EE"/>
<path d="M2.6 15.6 L7.2 13 L10 22 L4 23.2 Z" fill="#B3D5E7"/><path d="M17.4 15.6 L12.8 13 L10 22 L16 23.2 Z" fill="#E6F3FA"/><path d="M4 23.2 L10 22 L16 23.2 Q14 26.4 10 26.4 Q6 26.4 4 23.2 Z" fill="#9EC6DB"/>
${SPARK(6.4, 9.6, 1.6)}${SPARK(14.2, 20.6, 1.1)}`,
  crystalB: `24 23|<defs><linearGradient id="dccAnC2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#D5EAF6"/><stop offset="1" stop-color="#A3C9DE"/></linearGradient></defs>
<path d="${HEART}" fill="url(#dccAnC2)" stroke="#8FB6CB" stroke-width=".55"/>
<path d="${HEART_IN}" fill="#F3FAFE" stroke="#FFFFFF" stroke-width=".4"/>
<path d="M2.2 8 L5.6 8.6 M7.6 2.2 L8.7 5.3 M12 5 L12 7.6 M16.4 2.2 L15.3 5.3 M21.8 8 L18.4 8.6 M6 15.2 L8.4 13.6 M18 15.2 L15.6 13.6 M12 21.6 L12 17.4" stroke="#FFFFFF" stroke-width=".55" opacity=".9"/>
<path d="M2.2 8 C2.2 14 9 19 12 21.6 L12 17.4 C10 15.6 5.6 12.4 5.6 8.6 Z" fill="#B7D8EA" opacity=".7"/>
${SPARK(7.6, 6.4, 1.8)}${SPARK(16.8, 12.6, 1.1)}`,
  toastA: `38 44|<g transform="translate(4.5 5) rotate(-10 8 37) scale(.62)">${flute('dccAnF1', 1)}</g><g transform="translate(17.5 5) rotate(10 8 37) scale(.62)">${flute('dccAnF2', 1)}</g>${SPARK(19, 3, 1.8)}<g fill="#FFFFFF" opacity=".85"><circle cx="15" cy="1.6" r=".7"/><circle cx="23" cy="2" r=".6"/></g>`,
  toastB: `34 41|<g transform="translate(1 2) scale(.62)">${flute('dccAnF3', 1)}</g><g transform="translate(17 2) scale(.62)">${flute('dccAnF4', 1)}</g>`,
  dateA: `42 18|<defs>${GOLD('dccAnD1', 'x1="0" y1="0" x2="0" y2="1"')}</defs><rect x="1.2" y="2.4" width="39.6" height="13.2" rx="6.6" fill="url(#dccAnD1)" stroke="#7C5C16" stroke-width=".6"/><rect x="3" y="4" width="36" height="10" rx="5" fill="none" stroke="#FBEFC4" stroke-width=".5" opacity=".8"/><text x="21" y="12.3" font-family="Georgia,serif" font-size="8" font-weight="700" fill="#5A410C" text-anchor="middle">11·11·11</text><text x="21" y="11.8" font-family="Georgia,serif" font-size="8" font-weight="700" fill="#FFF8DD" text-anchor="middle">11·11·11</text>`,
  dateB: `36 34|<defs>${GOLD('dccAnD2', 'x1="0" y1="0" x2="1" y2="1"')}</defs><path d="M18 1.5 L22.2 12 L33.6 12.6 L24.8 19.8 L27.8 31 L18 24.8 L8.2 31 L11.2 19.8 L2.4 12.6 L13.8 12 Z" fill="url(#dccAnD2)" stroke="#7C5C16" stroke-width=".6"/><path d="M18 1.5 L18 18 M33.6 12.6 L18 18 M27.8 31 L18 18 M8.2 31 L18 18 M2.4 12.6 L18 18" stroke="#FBEFC4" stroke-width=".45" opacity=".7"/><text x="18" y="20.4" font-family="Georgia,serif" font-size="4.6" font-weight="700" fill="#5A410C" text-anchor="middle">11·11·11</text>`,
};

const FLUTE_ONLY = `26 61|${flute('dccAnF0', 0)}`;
const FLUTE_FULL = `26 61|${flute('dccAnF9', 1)}`;

module.exports = { P, FLUTE_ONLY, FLUTE_FULL, flute, band, HEART };

if (require.main === module) {
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'build', '.anniv-pieces.json'), JSON.stringify({ P, FLUTE_ONLY, FLUTE_FULL }));
  console.log(Object.keys(P).join(' '));
}

/* ---- the sheet: node tools/anniv-pieces.js --sheet ------------------- */
if (require.main === module && process.argv.includes('--sheet')) {
  const { open } = require('./harness');
  const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
  const YEARS = new Date().getFullYear() - 2011;
  const Y = {
    yearA: `20 28|${P.crystalA.slice(P.crystalA.indexOf('|') + 1).replace(/dccAnC1/g, 'dccAnY1')}<text x="10" y="21" font-family="Georgia,serif" font-size="8.4" font-weight="700" fill="#2F5F7C" text-anchor="middle">${YEARS}</text>`,
    yearB: `54 18|<defs>${GOLD('dccAnY2', 'x1="0" y1="0" x2="0" y2="1"')}</defs><rect x="1.2" y="2.4" width="51.6" height="13.2" rx="6.6" fill="url(#dccAnY2)" stroke="#7C5C16" stroke-width=".6"/><text x="27" y="12.3" font-family="Georgia,serif" font-size="7.6" font-weight="700" fill="#5A410C" text-anchor="middle">11·11·11 · ${YEARS}</text><text x="27" y="11.8" font-family="Georgia,serif" font-size="7.6" font-weight="700" fill="#FFF8DD" text-anchor="middle">11·11·11 · ${YEARS}</text>`,
  };
  const ALL = { ...P, ...Y };
  const url = r => { const c = r.indexOf('|'); const [w, h] = r.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${r.slice(c + 1)}</svg>`) }; };
  const jpg = f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REF, f)).toString('base64');
  const piece = (k, label, big = 150, guest = 26) => { const s = url(ALL[k]); return `<div class="opt"><div class="big"><img src="${s.u}" style="height:${big}px"></div>
    <div class="row"><span class="onpage light"><img src="${s.u}" style="height:${guest}px"></span><span class="onpage dark"><img src="${s.u}" style="height:${guest}px"></span></div><p>${label}</p></div>`; };
  const fl = url(FLUTE_ONLY), sc = 465 / 59.6, left = 482 - 13 * sc, top = 153 - 0.8 * sc;
  const fluteFit = `<div class="fit"><figure><div class="ph" style="width:200px;height:500px"><img src="${jpg('fl_a.jpg')}" style="position:absolute;left:${-(left - 25)}px;top:${-(top - 15)}px"></div><figcaption>the photograph</figcaption></figure>
    <figure><div class="ph" style="width:200px;height:500px"><img src="${jpg('fl_a.jpg')}" style="position:absolute;left:${-(left - 25)}px;top:${-(top - 15)}px"><img src="${fl.u}" style="position:absolute;left:25px;top:15px;width:${26 * sc}px;opacity:.5"></div><figcaption>the drawing over it at 50%</figcaption></figure>
    <figure><div class="ph" style="width:200px;height:500px;background:#E8D4A8"><img src="${url(FLUTE_FULL).u}" style="position:absolute;left:25px;top:15px;width:${26 * sc}px"></div><figcaption>the drawing, poured</figcaption></figure></div>`;
  const refRow = (f, cap, crop) => `<figure><div class="ph" style="width:260px;height:195px"><img src="${jpg(f)}" style="position:absolute;${crop}"></div><figcaption>${cap}</figcaption></figure>`;
  const ROWS = [
    ['Hearts', 'A heart is a symbol, not an object, so there is no photograph to lay it over: both are drawn as glossy pieces with a rim, so they catch the light the way the rings and crystal do. Both can fall, as a mixed set like the gourds.', [['heartA', 'A — blush'], ['heartB', 'B — gold-rimmed']], ''],
    ['Gold Rings', 'A band seen at an angle, the outer wall shaded as gold is (dark olive in the shade, a cream highlight, from the photograph) with the inside of the band showing through the hole. B is two linked bands.', [['ringA', 'A — one band with a stone'], ['ringB', 'B — two bands linked']],
      refRow('ring.jpg', 'Reference: “Gold wedding ring,” CC0. The band on the finger gives the gold\'s colors; it is seen side-on, so it is beside the drawing, not under it.', 'left:-330px;top:-120px;height:540px')],
    ['Crystal, the Fifteenth-Year Gift', 'A is a cut chandelier drop: a table facet, side facets lighter and darker, two glints. B is a cut crystal heart, its flat table ringed by a beveled rim, as in the photograph.', [['crystalA', 'A — a crystal drop'], ['crystalB', 'B — a crystal heart']],
      refRow('cheart.jpg', 'Reference: “Crystal heart pendant,” public domain. Shown at an angle, so it is a guide for the bevel and the light, not an overlay.', 'left:-130px;top:-260px;height:720px')],
    ['The Toast', 'Two champagne flutes, each drawn over the Metropolitan Museum’s cut-glass flute (CC0, below): the tapering bowl with its cut panels, the knop on the stem and the round foot, poured with bubbles rising. A clinks; B stands square.', [['toastA', 'A — clinking'], ['toastB', 'B — square']], fluteFit],
    ['The Date', 'Gold, shaded like the rings. The date is text: see the note on legibility below.', [['dateA', 'A — a gold band'], ['dateB', 'B — a gold star']], ''],
    ['The Year Count', `Worked out from the visitor’s own date, never typed: it reads ${YEARS} this year and ${YEARS + 1} next. A gives it a crystal drop of its own; B puts it on the date band.`, [['yearA', 'A — a crystal numeral'], ['yearB', 'B — on the date band']], ''],
  ];
  const css = `body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
    h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 4px;text-align:center}
    .sub,.note{color:#555;margin:0 auto 10px;max-width:900px} section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
    .opts{display:flex;gap:40px;justify-content:center;flex-wrap:wrap;align-items:flex-end} .opt{text-align:center} .opt p{margin:6px 0 0;font-weight:600}
    .big{height:160px;display:flex;align-items:flex-end;justify-content:center} .row{display:flex;gap:8px;justify-content:center;margin-top:8px}
    .onpage{display:inline-flex;align-items:center;justify-content:center;width:52px;height:46px;border-radius:5px} .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}
    figure{margin:0;text-align:center} figcaption{color:#666;margin-top:4px;max-width:260px;margin-left:auto;margin-right:auto} .ph{position:relative;overflow:hidden;border:1px solid #D9CDB6;border-radius:3px}
    .fit{display:flex;gap:14px;justify-content:center;margin-top:12px} .refs{display:flex;justify-content:center;margin-top:10px}`;
  const sizes = ['dateA'].map(k => { const s = url(ALL[k]); return [1, 1.5, 2].map((m, i) => `<div class="opt"><div class="row"><span class="onpage light" style="width:${60 * m}px;height:${40 * m}px"><img src="${s.u}" style="height:${18 * m}px"></span><span class="onpage dark" style="width:${60 * m}px;height:${40 * m}px"><img src="${s.u}" style="height:${18 * m}px"></span></div><p>${['the same size as the other pieces', 'half as big again', 'twice the size'][i]}</p></div>`).join(''); }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
    <h1>Seasons — The Anniversary: The Falling Pieces, Redrawn</h1>
    <p class="sub">One day a year, 11 November. Redrawn to the palm and flamingo’s standard: every piece shaded and shaped, and every object that has a real counterpart drawn from a public-domain or CC0 photograph, laid over it at 50% where the photograph shows it straight on. Each piece is shown large, then at the size a guest sees it, on cream and on the navy footer. Nothing here is in the plugin: Rob picks one per row, or says “both” where a mixed set suits.</p>
    ${ROWS.map(([t, n, o, extra]) => `<section><h2>${t}</h2><p class="note">${n}</p><div class="opts">${o.map(([k, l]) => piece(k, l)).join('')}</div>${extra && extra.startsWith('<figure') ? `<div class="refs">${extra}</div>` : extra}</section>`).join('')}
    <section><h2>Can the Date Be Read at All?</h2><p class="note">Every other piece is a shape, and a shape reads at any size. The date and the year count are text: at the size the pieces fall they are a gold glint. If Rob wants the date legible, it has to fall larger than the rest; if not, it stays a glint that reads only up close. Both are fine answers, as long as it is his.</p><div class="opts">${sizes}</div></section>`;
  (async () => {
    const ses = await open(html, { viewport: { width: 1100, height: 900 }, dsf: 2 });
    await ses.page.waitForTimeout(600);
    await ses.page.setViewportSize({ width: 1100, height: await ses.page.evaluate(() => document.body.scrollHeight) });
    await ses.page.screenshot({ path: path.join(__dirname, '..', 'build', 'Seasons - 4.13.1 anniversary pieces.png') });
    await ses.close();
    console.log('pieces sheet: ok');
  })();
}
