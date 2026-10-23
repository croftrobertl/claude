'use strict';
/**
 * DCC Seasons — 4.13.x, the ANNIVERSARY: step 1 stills for Rob.
 *
 * A one-day theme for 11 November, every year. Nothing here is in the
 * plugin: these are options, and Rob picks.
 *
 * NO NAMES. Nothing a visitor could ever reach carries one, and neither
 * does this file — the date is the whole of it.
 *
 * The crane PAINTER is read out of engine.js, so the pair drawn from the
 * Thanksgiving bird really is that bird and not a copy of it that drifts.
 *
 *   node tools/anniv-lab.js
 *
 * Writes, into build/:
 *   Seasons - 4.13.x anniversary pieces.png
 *   Seasons - 4.13.x anniversary cranes.png
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js');
const OUT = path.join(ROOT, 'build');

function braceBlock(src, from) {
  const i = src.indexOf('{', from);
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; } else if (src[j] === '}') { d--; if (!d) { return src.slice(from, j + 1); } }
  }
  throw new Error('unbalanced');
}
function readEngine() {
  const src = fs.readFileSync(ENGINE, 'utf8');
  const PAL = JSON.parse(src.match(/var PAL = (\{[\s\S]*?\});/)[1]);
  const SVGS = new Function(`${src.match(/var SVGS = \{[\s\S]*?\n\t\};/)[0]}\nreturn SVGS;`)();
  const CR = [
    'var MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, mn = MT.min, mx2 = MT.max;',
    src.slice(src.indexOf('var CR_FR = 12;'), src.indexOf('var WITCH_BOX')),
  ].join('\n');
  return { PAL, SVGS, CR };
}

/* ---- the falling pieces, as candidates ------------------------------- */
const P = {
  /* hearts — a blush one and a gold-rimmed one */
  heartA: '24 22|<path d="M12 21 Q2 13 2 7.6 Q2 2 6.6 2 Q10 2 12 5.4 Q14 2 17.4 2 Q22 2 22 7.6 Q22 13 12 21 Z" fill="#E8838F"/><path d="M8 6.5 Q6 7.5 6 9.5" stroke="#F6C6CC" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  heartB: '24 22|<path d="M12 21 Q2 13 2 7.6 Q2 2 6.6 2 Q10 2 12 5.4 Q14 2 17.4 2 Q22 2 22 7.6 Q22 13 12 21 Z" fill="#C9A227"/><path d="M12 21 Q2 13 2 7.6 Q2 2 6.6 2 Q10 2 12 5.4 Q14 2 17.4 2 Q22 2 22 7.6 Q22 13 12 21 Z" fill="none" stroke="#F2DFA0" stroke-width="1.2"/><path d="M8 6.5 Q6 7.5 6 9.5" stroke="#FBF0C9" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  /* rings — one band, and two linked */
  ringA: '22 22|<circle cx="11" cy="12.5" r="7.6" fill="none" stroke="#C9A227" stroke-width="2.6"/><circle cx="11" cy="12.5" r="7.6" fill="none" stroke="#F2DFA0" stroke-width="0.9"/><path d="M11 4.9 L9.2 1.6 L12.8 1.6 Z" fill="#CFE8F5"/><path d="M6.4 9 Q6 11 6.6 13" stroke="#FBF0C9" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
  ringB: '30 22|<circle cx="11" cy="12" r="7.2" fill="none" stroke="#C9A227" stroke-width="2.4"/><circle cx="19" cy="12" r="7.2" fill="none" stroke="#D9B64A" stroke-width="2.4"/><path d="M15.6 6.2 A7.2 7.2 0 0 1 15.6 17.8" fill="none" stroke="#C9A227" stroke-width="2.4"/><path d="M6.6 9 Q6.2 11 6.8 13" stroke="#FBF0C9" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
  /* crystal, the traditional fifteenth gift */
  crystalA: '24 24|<path d="M12 1.6 L20.4 9 L12 22.4 L3.6 9 Z" fill="#DCEEF7" opacity=".92"/><path d="M12 1.6 L12 22.4 M3.6 9 L20.4 9 M12 1.6 L3.6 9 M12 1.6 L20.4 9" stroke="#FFFFFF" stroke-width="0.9" fill="none" opacity=".85"/><path d="M12 1.6 L15.6 9 L12 22.4 Z" fill="#FFFFFF" opacity=".35"/><circle cx="8.4" cy="6.4" r="1.1" fill="#FFFFFF"/>',
  crystalB: '24 22|<path d="M12 20.6 Q3 12.6 3 7.4 Q3 2.4 7.2 2.4 Q10.2 2.4 12 5.4 Q13.8 2.4 16.8 2.4 Q21 2.4 21 7.4 Q21 12.6 12 20.6 Z" fill="#DCEEF7" opacity=".9"/><path d="M12 5.4 L12 20.6 M6 6 L12 11 M18 6 L12 11" stroke="#FFFFFF" stroke-width="0.9" fill="none" opacity=".9"/><circle cx="8" cy="6.6" r="1.2" fill="#FFFFFF"/><circle cx="16.6" cy="8" r="0.8" fill="#FFFFFF" opacity=".8"/>',
  /* the toast: two flutes clinking, with bubbles */
  toastA: '30 30|<path d="M8 4 L14 4 L12.6 14 Q12.2 16 10.8 16.6 L10.8 25 L13.4 26.4 L6.6 26.4 L9.2 25 L9.2 16.6 Q7.8 16 7.4 14 Z" fill="#E8F3F8" opacity=".85"/><path d="M16.4 4.6 L22.4 3.2 L22.6 13.4 Q22.6 15.4 21.4 16.2 L22.8 24.4 L25.6 25.4 L18.8 26.6 L21 24.8 L19.6 16.8 Q18.2 16.4 17.4 14.6 Z" fill="#E8F3F8" opacity=".85"/><path d="M8.2 8 L13.2 8 L12.8 12 Q12.4 13.4 10.6 13.6 Q8.8 13.4 8.6 12 Z" fill="#F2D27E"/><path d="M16.8 8.2 L21.8 7.2 L21.9 11.6 Q21.9 13 20.2 13.4 Q18.4 13.4 18 12.1 Z" fill="#F2D27E"/><g fill="#FFFFFF" opacity=".9"><circle cx="10.8" cy="6.6" r="1"/><circle cx="19.4" cy="5.8" r="0.9"/><circle cx="13.2" cy="3" r="0.8"/><circle cx="17.6" cy="2.4" r="0.7"/></g>',
  toastB: '28 30|<path d="M6 5 L13 5 Q13 12 10.4 13.6 L10.4 25 L13.6 26.6 L5.4 26.6 L9 25 L9 13.6 Q6 12 6 5 Z" fill="#E8F3F8" opacity=".85"/><path d="M15 5 L22 5 Q22 12 19 13.6 L19 25 L22.6 26.6 L14.4 26.6 L17.6 25 L17.6 13.6 Q15 12 15 5 Z" fill="#E8F3F8" opacity=".85"/><path d="M6.6 8.4 L12.4 8.4 Q12.2 11.6 10.4 12.6 Q7.6 11.8 6.6 8.4 Z" fill="#F2D27E"/><path d="M15.6 8.4 L21.4 8.4 Q20.6 11.8 18.6 12.6 Q16 11.6 15.6 8.4 Z" fill="#F2D27E"/><g fill="#FFFFFF" opacity=".9"><circle cx="9.4" cy="6.6" r="0.9"/><circle cx="18.6" cy="6.4" r="0.9"/><circle cx="14" cy="3.2" r="1"/><circle cx="11.6" cy="1.8" r="0.7"/><circle cx="16.8" cy="2" r="0.6"/></g>',
  /* the date, as a small gold piece */
  dateA: '40 18|<rect x="1.5" y="3" width="37" height="12" rx="6" fill="#C9A227"/><rect x="1.5" y="3" width="37" height="12" rx="6" fill="none" stroke="#F2DFA0" stroke-width="1"/><text x="20" y="12.4" font-family="Georgia,serif" font-size="8" font-weight="700" fill="#FBF6E7" text-anchor="middle">11·11·11</text>',
  dateB: '34 22|<path d="M17 1.5 L21 6 L32 6 L26.5 11 L32 16 L21 16 L17 20.5 L13 16 L2 16 L7.5 11 L2 6 L13 6 Z" fill="#C9A227" opacity=".95"/><text x="17" y="13.6" font-family="Georgia,serif" font-size="6.6" font-weight="700" fill="#FBF6E7" text-anchor="middle">11·11·11</text>',
};

/* The year count, computed — never typed. */
const YEARS = new Date().getFullYear() - 2011;
const YEAR_OPTS = {
  A: `26 26|<path d="M13 1.6 L22 9.6 L13 24.4 L4 9.6 Z" fill="#DCEEF7" opacity=".92"/><path d="M13 1.6 L13 24.4 M4 9.6 L22 9.6" stroke="#FFFFFF" stroke-width="0.8" fill="none" opacity=".8"/><text x="13" y="18.6" font-family="Georgia,serif" font-size="8.5" font-weight="700" fill="#3C6E8F" text-anchor="middle">${YEARS}</text>`,
  B: `44 22|<rect x="1.5" y="2.5" width="41" height="13" rx="6.5" fill="#C9A227"/><rect x="1.5" y="2.5" width="41" height="13" rx="6.5" fill="none" stroke="#F2DFA0" stroke-width="1"/><text x="22" y="12.2" font-family="Georgia,serif" font-size="7.4" font-weight="700" fill="#FBF6E7" text-anchor="middle">11·11·11 · ${YEARS}</text>`,
};

/* ---- the dance ------------------------------------------------------- */
const DANCE = `
/* A sandhill crane STANDING and dancing, in the same hand as the flying
 * bird: the same greys, the same red crown, the same bill. A courtship
 * dance is a leap — the bird springs off the ground with its wings thrown
 * up and open, neck stretched, legs trailing under it — and between leaps
 * the pair bow to each other. 'rise' is 0 on the ground, 1 at the top of
 * the leap; 'bow' tips the body forward. */
function crStand(g, L, rise, bow, face, dark) {
  var body = dark ? '#241A12' : '#9BA3A8';
  var dk   = dark ? '#1B130D' : '#6E767C';
  var leg  = dark ? '#1B130D' : '#4A4F53';
  g.save();
  g.scale(face, 1);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.translate(0, -rise * L * 0.55);
  var tip = bow * 0.34;                 /* how far the body tips forward */
  /* legs: long and thin, planted when down, folded back in the leap */
  g.strokeStyle = leg; g.lineWidth = L * 0.026;
  for (var s = -1; s <= 1; s += 2) {
    var kx = s * L * 0.055;
    g.beginPath();
    g.moveTo(kx, L * 0.11);
    if (rise < 0.25) {
      g.quadraticCurveTo(kx + s * L * 0.015, L * 0.36, kx + s * L * 0.02, L * 0.60);
      g.moveTo(kx + s * L * 0.02, L * 0.60); g.lineTo(kx + s * L * 0.09, L * 0.625);
    } else {
      g.quadraticCurveTo(kx - L * 0.12, L * 0.30, -L * 0.26 - rise * L * 0.14, L * 0.30 + rise * L * 0.04);
    }
    g.stroke();
  }
  g.rotate(-tip);
  /* wings: folded along the flank at rest, thrown UP and open in the leap.
   * Both wings take the same shape — the far one only darker — so neither
   * reads as a scythe, which is what the first pass did. */
  var open = mx2(rise, bow * 0.25);
  for (var w = -1; w <= 1; w += 2) {
    var tipX = w * L * (0.26 + open * 0.44);
    var tipY = -L * (0.06 + open * 0.68);
    g.beginPath();
    g.moveTo(w * L * 0.05, -L * 0.14);
    g.quadraticCurveTo(w * L * (0.14 + open * 0.20), -L * (0.20 + open * 0.52), tipX, tipY);
    g.quadraticCurveTo(w * L * (0.30 + open * 0.14), -L * (0.02 + open * 0.30), w * L * 0.12, L * 0.10);
    g.quadraticCurveTo(w * L * 0.10, -L * 0.02, w * L * 0.05, -L * 0.14);
    g.closePath();
    g.fillStyle = w < 0 ? dk : body;
    g.fill();
    if (open > 0.3) {
      g.strokeStyle = dark ? dk : '#5A6268'; g.lineWidth = L * 0.018;
      for (var f = 0; f < 3; f++) {
        g.beginPath();
        g.moveTo(tipX * (0.88 - f * 0.07), tipY + L * (0.03 + f * 0.035));
        g.quadraticCurveTo(tipX * (1.06 + f * 0.02), tipY + L * (0.08 + f * 0.05),
                           tipX * (1.02 + f * 0.04), tipY + L * (0.20 + f * 0.07));
        g.stroke();
      }
    }
  }
  /* body: a crane's is SLIM and deep-chested, not a round goose */
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(L * 0.17, -L * 0.10);
  g.quadraticCurveTo(L * 0.06, -L * 0.21, -L * 0.06, -L * 0.17);
  g.quadraticCurveTo(-L * 0.19, -L * 0.12, -L * 0.20, L * 0.00);
  g.quadraticCurveTo(-L * 0.12, L * 0.13, L * 0.02, L * 0.12);
  g.quadraticCurveTo(L * 0.14, L * 0.07, L * 0.17, -L * 0.10);
  g.closePath(); g.fill();
  /* the bustle of tertials, drooping over the tail */
  g.fillStyle = dk;
  g.beginPath();
  g.moveTo(-L * 0.11, -L * 0.14);
  g.quadraticCurveTo(-L * 0.30, -L * 0.06, -L * 0.30, L * 0.10);
  g.quadraticCurveTo(-L * 0.18, L * 0.02, -L * 0.07, L * 0.10);
  g.closePath(); g.fill();
  /* neck: LONG, THIN and upright, the head well above the body */
  var hx = L * (0.10 + bow * 0.30), hy = -L * (0.62 - bow * 0.40);
  g.strokeStyle = body; g.lineWidth = L * 0.040;
  g.beginPath();
  g.moveTo(L * 0.08, -L * 0.17);
  g.quadraticCurveTo(L * (0.12 + bow * 0.10), -L * (0.42 - bow * 0.16), hx, hy);
  g.stroke();
  /* head: small, with a long dagger bill */
  g.fillStyle = body;
  g.beginPath(); g.ellipse(hx, hy, L * 0.040, L * 0.032, 0.25 + bow * 0.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = dark ? '#1B130D' : '#3F4448'; g.lineWidth = L * 0.017;
  g.beginPath();
  g.moveTo(hx + L * 0.028, hy + L * 0.012);
  g.lineTo(hx + L * (0.14 + bow * 0.05), hy + L * (0.05 + bow * 0.08));
  g.stroke();
  if (!dark) {
    g.fillStyle = '#C62828';
    g.beginPath(); g.ellipse(hx - L * 0.012, hy - L * 0.030, L * 0.026, L * 0.015, 0.1, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
`;

function svgData(raw, PAL) {
  if (typeof raw === 'function') { raw = raw(); }
  const cut = raw.indexOf('|');
  const [w, h] = raw.slice(0, cut).split(' ').map(Number);
  const body = raw.slice(cut + 1).replace(/%([a-x])/g, (m, k) => PAL[k] || '#f0f');
  return { w, h, url: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`) };
}

const CSS = `
  body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
  h1{font-size:19px;margin:0 0 2px;text-align:center}
  .sub{color:#6b6b6b;margin:0 auto 16px;max-width:920px}
  section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
  h2{font-size:15px;margin:0 0 4px;text-align:center}
  .note{margin:0 auto 10px;color:#6b6b6b;max-width:880px}
  .opts{display:flex;gap:30px;flex-wrap:wrap;justify-content:center}
  .opt{text-align:center} .opt p{margin:6px 0 0;font-weight:600;max-width:210px}
  .big{height:150px;display:flex;align-items:center;justify-content:center}
  .row{display:flex;gap:8px;justify-content:center;margin-top:8px}
  .onpage{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:5px}
  .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}
  figure{margin:0} figcaption{margin-top:5px;color:#6b6b6b;text-align:center}
  .strip{display:flex;gap:12px;justify-content:center}
  canvas{display:block;border:1px solid #D9CDB6;border-radius:3px}
`;

const ROWS = [
  { title: 'Hearts', note: 'Both fall. Rob picks one, or both as a variety set like the gourds.',
    opts: [['A — blush', 'heartA'], ['B — gold-rimmed', 'heartB']] },
  { title: 'Gold Rings', note: 'A is a single band with a stone; B is two bands linked, which reads as a pair at any size.',
    opts: [['A — one band', 'ringA'], ['B — two linked', 'ringB']] },
  { title: 'Crystal, the Fifteenth Gift', note: 'A is a cut crystal drop; B is a crystal heart. Both catch a glint as they turn.',
    opts: [['A — crystal drop', 'crystalA'], ['B — crystal heart', 'crystalB']] },
  { title: 'The Toast', note: 'Two flutes with rising bubbles. A is caught mid-clink, leaning into each other; B stands them square.',
    opts: [['A — clinking', 'toastA'], ['B — square', 'toastB']] },
  { title: 'The Date', note: 'A small gold piece that drifts down now and then, like the others.',
    opts: [['A — a gold band', 'dateA'], ['B — a gold star', 'dateB']] },
];

(async () => {
  const { PAL, SVGS, CR } = readEngine();
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = playwright();
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) { browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }

  /* ---------- sheet 1: the falling pieces ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 3 });
    const body = ROWS.map(r => {
      const cols = r.opts.map(([name, key]) => {
        const s = svgData(P[key], PAL), onPage = 26 / Math.max(s.w, s.h);
        return `<div class="opt"><div class="big"><img src="${s.url}" style="width:${s.w * (140 / Math.max(s.w, s.h))}px"></div>
          <div class="row"><span class="onpage light"><img src="${s.url}" style="width:${s.w * onPage}px"></span>
          <span class="onpage dark"><img src="${s.url}" style="width:${s.w * onPage}px"></span></div><p>${name}</p></div>`;
      }).join('');
      return `<section><h2>${r.title}</h2><p class="note">${r.note}</p><div class="opts">${cols}</div></section>`;
    }).join('');
    const yr = Object.entries(YEAR_OPTS).map(([k, raw]) => {
      const s = svgData(raw, PAL), onPage = 28 / Math.max(s.w, s.h);
      return `<div class="opt"><div class="big"><img src="${s.url}" style="width:${s.w * (140 / Math.max(s.w, s.h))}px"></div>
        <div class="row"><span class="onpage light"><img src="${s.url}" style="width:${s.w * onPage}px"></span>
        <span class="onpage dark"><img src="${s.url}" style="width:${s.w * onPage}px"></span></div>
        <p>${k === 'A' ? 'A — a crystal numeral of its own' : 'B — on the date piece itself'}</p></div>`;
    }).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <h1>Seasons — The Anniversary: The Falling Pieces</h1>
      <p class="sub">One day a year, 11 November. Each piece large enough to judge, then at the size a guest sees it, on cream and on the navy footer. Nothing here is in the plugin — Rob picks one per row, or says "both" where a variety set would suit.</p>
      ${body}
      <section><h2>The Year Count</h2>
        <p class="note">Worked out from the visitor's own date, never typed into the code: this year it reads ${YEARS}, next year ${YEARS + 1}, and in 2036 it will read 25 without anyone touching it. The number below is the real computed one. A gives it a crystal piece of its own that drifts down like the others; B puts it on the date piece, so there is one piece rather than two.</p>
        <div class="opts">${yr}</div></section>
      <section><h2>Can the Date Be Read at All?</h2>
        <p class="note">This is the one thing on the sheet I would flag before Rob picks. Every other piece is a shape, and a shape reads at any size — but the date and the year count are TEXT, and at the size the pieces actually fall they are a gold smudge and a blue dot. Below, the date piece at the normal piece size, then at half as big again, then at twice, all at a guest's scale. If Rob wants the date legible it has to be the largest piece on the screen; if he would rather it stayed the same size as the rest, it becomes a gold glint that only reads close up — which is a perfectly good answer, as long as it is the one he chose.</p>
        <div class="opts">${[1, 1.6, 2.2].map(k => {
          const s2 = svgData(P.dateA, PAL), on = (26 * k) / Math.max(s2.w, s2.h);
          return `<div class="opt"><div class="big"><img src="${s2.url}" style="width:${s2.w * (140 / Math.max(s2.w, s2.h))}px"></div>
            <div class="row"><span class="onpage light" style="width:${Math.round(46 * Math.max(1, k * 0.9))}px;height:${Math.round(46 * Math.max(1, k * 0.9))}px"><img src="${s2.url}" style="width:${s2.w * on}px"></span>
            <span class="onpage dark" style="width:${Math.round(46 * Math.max(1, k * 0.9))}px;height:${Math.round(46 * Math.max(1, k * 0.9))}px"><img src="${s2.url}" style="width:${s2.w * on}px"></span></div>
            <p>${k === 1 ? 'the same size as the other pieces' : k === 1.6 ? 'half as big again' : 'twice the size'}</p></div>`;
        }).join('')}</div></section>
      <section><h2>The Egg, in Gold and Blush</h2>
        <p class="note">The tap easter egg takes the same two colours as the pieces.</p>
        <div class="opts">
          <div class="opt"><div class="big"><span style="display:inline-block;width:64px;height:64px;border-radius:8px;background:#C9A227"></span></div><p>Gold #C9A227</p></div>
          <div class="opt"><div class="big"><span style="display:inline-block;width:64px;height:64px;border-radius:8px;background:#E8838F"></span></div><p>Blush #E8838F</p></div>
        </div></section>`);
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 1180, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, 'Seasons - 4.13.x anniversary pieces.png') });
    await page.close();
    console.log('pieces: ok');
  }

  /* ---------- sheet 2: the two crane pairs, and the scene ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.error('  page error:', e.message));
    const danceSvg = svgData(SVGS.cranedance, PAL);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <h1>Seasons — The Anniversary: The Courtship Dance</h1>
      <p class="sub">Two sandhill cranes, a pair that mates for life, dancing across the header picture: rising, circling each other, wings spread. Two questions here — which drawing the pair uses, and whether the Florida Keys water-line scene should adopt the same bird so the plugin carries one crane rather than two.</p>
      <div id="out"></div>
      <script>
      ${CR}
      ${DANCE}
      var out = document.getElementById('out');
      function panel(title, note, nodes) {
        var sec = document.createElement('section');
        var h = document.createElement('h2'); h.textContent = title; sec.appendChild(h);
        if (note) { var p = document.createElement('p'); p.className = 'note'; p.textContent = note; sec.appendChild(p); }
        var s = document.createElement('div'); s.className = 'strip';
        nodes.forEach(function (n) {
          var f = document.createElement('figure'); f.appendChild(n.c);
          var cap = document.createElement('figcaption'); cap.textContent = n.cap; f.appendChild(cap);
          s.appendChild(f);
        });
        sec.appendChild(s); out.appendChild(sec);
      }
      function plate(W, H) {
        var c = document.createElement('canvas');
        c.width = W; c.height = H; c.style.width = W + 'px'; c.style.height = H + 'px';
        var g = c.getContext('2d');
        var sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#2B4257'); sky.addColorStop(0.6, '#56606A'); sky.addColorStop(1, '#6E6A55');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(28,36,30,0.5)';
        g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.84); g.lineTo(W * 0.22, H * 0.74);
        g.lineTo(W * 0.42, H * 0.84); g.lineTo(W * 0.42, H); g.closePath(); g.fill();
        return { c: c, g: g };
      }
      /* B: the pair drawn from the Thanksgiving bird */
      function pairB(g, x, y, L, t) {
        var riseL = Math.max(0, Math.sin(t * Math.PI * 2));
        var riseR = Math.max(0, Math.sin((t + 0.5) * Math.PI * 2));
        var bowL = riseL < 0.05 ? 0.8 : 0, bowR = riseR < 0.05 ? 0.8 : 0;
        g.save(); g.translate(x - L * 0.55, y); crStand(g, L, riseL, bowL, 1, false); g.restore();
        g.save(); g.translate(x + L * 0.55, y); crStand(g, L, riseR, bowR, -1, false); g.restore();
      }
      /* A: the pair built from the sprite already in the engine */
      var img = new Image(); img.src = ${JSON.stringify(danceSvg.url)};
      img.onload = function () {
        var AW = ${danceSvg.w}, AH = ${danceSvg.h};
        function pairA(g, x, y, L, t) {
          var h1 = Math.max(0, Math.sin(t * Math.PI * 2)) * L * 0.30;
          var h2 = Math.max(0, Math.sin((t + 0.5) * Math.PI * 2)) * L * 0.30;
          var w = L * 1.1, h = w * AH / AW;
          g.save(); g.translate(x - L * 0.60, y - h1); g.drawImage(img, -w / 2, -h, w, h); g.restore();
          g.save(); g.translate(x + L * 0.60, y - h2); g.scale(-1, 1); g.drawImage(img, -w / 2, -h, w, h); g.restore();
        }
        var W = 390, H = 420, L = 62;
        [['A', pairA], ['B', pairB]].forEach(function (opt) {
          var frames = [0.08, 0.27, 0.62].map(function (t, i) {
            var p = plate(W, H);
            opt[1](p.g, W * (0.3 + i * 0.2), H * 0.70, L, t);
            return { c: p.c, cap: ['start — the pair meet and bow', 'middle — one springs, wings open', 'end — they circle each other'][i] };
          });
          panel(opt[0] === 'A' ? 'A — the pair already in the engine (the Florida Keys cranedance sprite)'
                               : 'B — a pair drawn from the Thanksgiving bird, in the same hand',
                opt[0] === 'A' ? 'This is the drawing the Florida Keys water-line scene uses today. It costs no new bytes.'
                               : 'The same greys, the same red crown and bill as the cranes that cross the harvest moon, so the plugin would carry one crane rather than two.',
                frames);
        });
        /* side by side, large */
        var cmp = [['A', pairA], ['B', pairB]].map(function (opt) {
          var c = document.createElement('canvas');
          c.width = 300; c.height = 240; c.style.width = '300px'; c.style.height = '240px';
          var g = c.getContext('2d');
          g.fillStyle = '#E8CFA0'; g.fillRect(0, 0, 300, 240);
          opt[1](g, 150, 200, 86, 0.25);
          return { c: c, cap: opt[0] === 'A' ? 'A — the sprite in the engine' : 'B — drawn from the Thanksgiving bird' };
        });
        panel('The Two Side by Side, at the Top of the Leap', '', cmp);
        window.__done = true;
      };
      img.onerror = function () { window.__done = true; };
      </script>`);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1240, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, 'Seasons - 4.13.x anniversary cranes.png') });
    await page.close();
    console.log('cranes: ok');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
