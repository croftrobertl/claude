'use strict';
/**
 * DCC Seasons — 4.13.0 Thanksgiving, STEP 1: still drawings for Rob.
 *
 * Rob decides every look by choosing from rendered options, so nothing here
 * is in the engine. This lab holds the CANDIDATES and renders them still, at
 * the size a guest actually sees and again large enough to judge, plus the
 * three key frames of the cranes-across-the-harvest-moon scene.
 *
 * The palette, the maria table and the real moon painter are READ OUT OF
 * engine.js, never copied: a sheet drawn in stale colours invites redrawing
 * something that is already right (sprite-sheet.js, same rule).
 *
 *   node tools/thanks-lab.js
 *
 * Writes, into build/:
 *   Seasons - 4.13.0 step 1 pieces 390.png
 *   Seasons - 4.13.0 step 1 pieces 1280.png
 *   Seasons - 4.13.0 step 1 crane scene.png
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js');
const OUT = path.join(ROOT, 'build');

/* ---- read what the engine already has ---------------------------------- */
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
  const maria = src.slice(src.indexOf('var MARIA = ['));
  const MARIA_SRC = 'var MARIA = ' + maria.slice(maria.indexOf('['), maria.indexOf('];') + 1) + ';';
  /* moonPaint leans on a row of small helpers that sit directly above it
   * (mRng, mDest, mSpot and friends) and on MARIA. Take the whole
   * contiguous region from MARIA to the end of moonPaint rather than
   * chasing names one at a time, and reimplement nothing: a hand-copied
   * moon is a different moon.  Only the Math aliases, which live at the top
   * of the engine's IIFE, are restated. */
  const mStart = src.indexOf('var MARIA = [');
  const mEnd = src.indexOf(braceBlock(src, src.indexOf('function moonPaint'))) +
    braceBlock(src, src.indexOf('function moonPaint')).length;
  const MOON_SRC = [
    'var D = document, MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, mn = MT.min, mx2 = MT.max, atan2 = MT.atan2, sqrt = MT.sqrt;',
    src.slice(mStart, mEnd),
  ].join('\n');
  const block = src.match(/var SVGS = \{[\s\S]*?\n\t\};/)[0];
  const SVGS = new Function(`${block}\nreturn SVGS;`)();
  return { PAL, MOON_SRC, SVGS };
}

/* ---- the candidates ----------------------------------------------------
 * Same idiom as the engine's registry: 'w h|<svg body>', %x = palette key.
 * Every option is labelled, because Rob picks one of them — none of these
 * is a default.
 * ----------------------------------------------------------------------- */
const CAND = {
  /* --- leaves. Three shapes, Rob's pick. leafo/leafm/leafc ALREADY EXIST
   * in the engine, drawn and unused, so option A is "use what is there".
   * Option B redraws the oak: a LIVE oak leaf is small, oval and entire —
   * no lobes — and the existing leafo is a lobed northern white oak. */
  oakA: null,  /* filled from the engine: leafo */
  oakB: '18 28|<path d="M9 2 Q14 7 14 15 Q14 22 9 25 Q4 22 4 15 Q4 7 9 2 Z" fill="#A0622D"/><path d="M9 27 L9 3" stroke="#6F4E37" stroke-width="1.3" fill="none"/><path d="M9 8 Q12 9 12.6 11 M9 8 Q6 9 5.4 11 M9 13 Q12.6 14 13.4 16 M9 13 Q5.4 14 4.6 16 M9 18 Q12 19 12.4 20.6 M9 18 Q6 19 5.6 20.6" stroke="#6F4E37" stroke-width="0.8" fill="none"/><path d="M9 2 Q14 7 14 15 Q14 22 9 25 Q4 22 4 15 Q4 7 9 2 Z" fill="none" stroke="#8A5024" stroke-width="0.7"/>',
  mapleA: null, /* leafm */
  cypA: null,   /* leafc */
  cypB: '20 30|<path d="M10 29 L10 2" stroke="#8B4513" stroke-width="1.5" fill="none"/><g stroke="#C97B3D" stroke-width="2.1" stroke-linecap="round"><path d="M10 5 L6 2.6M10 5 L14 2.6M10 8.5 L4.6 5.6M10 8.5 L15.4 5.6M10 12 L3.6 9M10 12 L16.4 9M10 15.5 L3.4 13M10 15.5 L16.6 13M10 19 L4 17M10 19 L16 17M10 22.5 L5 21M10 22.5 L15 21"/></g>',

  /* --- a gourd or squash, three ways --- */
  gourdA: '26 26|<ellipse cx="13" cy="16" rx="10" ry="9" fill="%w"/><path d="M13 7q-4 4-4 9t4 9q4-4 4-9t-4-9Z" fill="#C9742A" opacity=".55"/><path d="M5 13q4 3 8 3t8-3" stroke="#B5651F" stroke-width="1" fill="none"/><path d="M13 7q0-4-3-5" stroke="%c" stroke-width="2" fill="none"/><path d="M10 2q-3 0-4 2" stroke="%c" stroke-width="1.6" fill="none"/>',
  gourdB: '24 30|<path d="M12 29q-7 0-7-7 0-5 4-7 2-1 2-4V8q0-4 3-4t3 4v3q0 3 2 4" fill="none"/><ellipse cx="11" cy="22" rx="7" ry="7" fill="#E8B04B"/><path d="M11 15q-1-4 1-7t3-4" stroke="#C9A227" stroke-width="4.6" fill="none" stroke-linecap="round"/><path d="M11 15q-1-4 1-7t3-4" stroke="#DCC06A" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M15 4q2-2 4-1" stroke="%c" stroke-width="1.6" fill="none"/><path d="M5 22q6 3 12 0" stroke="#C9A227" stroke-width="0.9" fill="none"/>',
  gourdC: '26 24|<path d="M13 4q9 0 9 8t-9 10Q4 20 4 12t9-8Z" fill="#2F6B3C"/><g stroke="#DDE8CF" stroke-width="1.6" fill="none"><path d="M13 5v16M7 7.5q2 7 0 11M19 7.5q-2 7 0 11"/></g><path d="M13 4q0-3-2-3" stroke="#6F4E37" stroke-width="2.2" fill="none"/>',

  /* --- an ear of corn with husk, two ways --- */
  cornA: '22 32|<path d="M11 3q5 3 5 12t-5 14q-5-5-5-14T11 3Z" fill="%k"/><g fill="#E8B04B"><circle cx="9" cy="10" r="1.1"/><circle cx="13" cy="10" r="1.1"/><circle cx="11" cy="13" r="1.1"/><circle cx="8" cy="16" r="1.1"/><circle cx="14" cy="16" r="1.1"/><circle cx="11" cy="19" r="1.1"/><circle cx="9" cy="22" r="1.1"/><circle cx="13" cy="22" r="1.1"/></g><path d="M11 3q-6 2-7 11 3-1 4-4" fill="#7FA650"/><path d="M11 3q6 2 7 11-3-1-4-4" fill="#9CBF63"/><path d="M11 29q-1 3 0 3" stroke="#C9A227" stroke-width="1.4" fill="none"/>',
  cornB: '26 32|<path d="M13 6q5 3 5 11t-5 13q-5-5-5-13T13 6Z" fill="%k"/><g fill="#C9742A" opacity=".85"><circle cx="11" cy="12" r="1.1"/><circle cx="15" cy="15" r="1.1"/><circle cx="11" cy="19" r="1.1"/><circle cx="15" cy="23" r="1.1"/></g><g fill="#8E3B2F" opacity=".8"><circle cx="15" cy="11" r="1.1"/><circle cx="11" cy="15" r="1.1"/><circle cx="15" cy="19" r="1.1"/><circle cx="11" cy="23" r="1.1"/></g><path d="M13 6Q6 9 3 20q4-1 6-6" fill="#7FA650"/><path d="M13 6q7 3 10 14-4-1-6-6" fill="#9CBF63"/><g stroke="#E8C46B" stroke-width="1" fill="none"><path d="M13 6q-3-4-5-5M13 6q1-4 3-5M13 6q4-3 6-3"/></g>',

  /* --- a cranberry sprig, two ways --- */
  cranA: '24 26|<path d="M12 25 Q11 16 13 8" stroke="#5B7A3A" stroke-width="1.6" fill="none"/><path d="M12 19 Q7 17 5 13 Q10 13 12 17Z" fill="#4E7A33"/><path d="M12.6 14 Q18 12 20 8 Q14 8 12.4 12Z" fill="#5E8C3E"/><circle cx="8" cy="8" r="3.6" fill="#B3121C"/><circle cx="15" cy="5" r="3.2" fill="#C8202A"/><circle cx="12" cy="11" r="2.8" fill="#9E0F18"/><circle cx="7" cy="7" r="1" fill="#E07A7A" opacity=".8"/><circle cx="14" cy="4" r="0.9" fill="#E07A7A" opacity=".8"/>',
  cranB: '22 28|<path d="M11 27 Q10 15 11 5" stroke="#5B7A3A" stroke-width="1.5" fill="none"/><g fill="#4E7A33"><path d="M11 20 Q6 18 4 14 Q9 14 11 18Z"/><path d="M11 14 Q16 12 18 8 Q12 9 11 13Z"/></g><g><circle cx="11" cy="4" r="3" fill="#C8202A"/><circle cx="7.4" cy="7.6" r="2.7" fill="#B3121C"/><circle cx="14.6" cy="7.6" r="2.7" fill="#9E0F18"/><circle cx="9.4" cy="11.4" r="2.4" fill="#C8202A"/><circle cx="13" cy="11.4" r="2.2" fill="#B3121C"/></g><circle cx="10.2" cy="3" r="0.9" fill="#E07A7A" opacity=".85"/>',
};

/* ---- the scene: a warm harvest moon and a V of sandhill cranes ---------
 * Drawn here exactly as it would be drawn in the engine, so the stills are
 * the real thing and not an impression of it.
 * ----------------------------------------------------------------------- */
const SCENE = `
/* A SANDHILL CRANE in flight, procedural, drawn from the field marks that
 * actually identify one at a distance:
 *   - the neck is held STRAIGHT OUT, not tucked (that is what separates it
 *     from a heron at a glance);
 *   - the legs trail well past the tail, about a third of the body again;
 *   - the wings are long and broad with a wrist, and the primaries splay
 *     into fingers at the tip;
 *   - a red crown on the forehead, a long dagger bill.
 * w is the wing phase 0..1. dark=true draws the whole bird as a silhouette,
 * which is what it is when it crosses the moon's face.
 */
function crane(g, L, w, style, dark) {
  var up = Math.sin(w * Math.PI * 2);            /* +1 wings up, -1 down */
  var body = dark ? '#241A12' : (style === 'B' ? '#9BA3A8' : '#8C949A');
  var dk   = dark ? '#1B130D' : (style === 'B' ? '#6E767C' : '#636B71');
  var leg  = dark ? '#1B130D' : '#4A4F53';
  var bill = dark ? '#1B130D' : '#3F4448';
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';

  /* --- legs: trailing straight back, a slight droop, with feet --- */
  g.strokeStyle = leg; g.lineWidth = L * 0.022;
  for (var s0 = 0; s0 < 2; s0++) {
    g.beginPath();
    g.moveTo(-L * 0.16, L * 0.030 + s0 * L * 0.010);
    g.quadraticCurveTo(-L * 0.38, L * 0.050 + s0 * L * 0.012, -L * 0.58, L * 0.062 + s0 * L * 0.014);
    g.stroke();
  }
  g.lineWidth = L * 0.016;
  g.beginPath();
  g.moveTo(-L * 0.58, L * 0.062); g.lineTo(-L * 0.645, L * 0.072);
  g.moveTo(-L * 0.58, L * 0.076); g.lineTo(-L * 0.645, L * 0.086);
  g.stroke();

  /* --- the far wing first, so the body overlaps it --- */
  function wing(side, back) {
    /* A bird's wing sweeps BACK from the shoulder: the wrist sits forward
     * of the tip, and the primaries trail behind and outward. Drawn the
     * other way round it reads as a hand, or as a bird flying backwards —
     * which is exactly how the first pass looked. */
    var lift = up * L * 0.34, sp = L * 0.62;
    var shX = L * 0.03, shY = -L * 0.045;
    var wrX = side * sp * 0.50 - L * 0.05, wrY = -lift * 0.74 - L * 0.03;
    var tpX = side * sp * 0.96 - L * 0.20, tpY = -lift - up * L * 0.08;
    g.beginPath();
    g.moveTo(shX, shY);
    /* leading edge: shoulder → wrist → tip, bowed forward slightly */
    g.quadraticCurveTo(side * sp * 0.26 + L * 0.02, wrY - L * 0.055, wrX, wrY);
    g.quadraticCurveTo(side * sp * 0.78 - L * 0.06, tpY - L * 0.045, tpX, tpY);
    /* trailing edge: back in under the wrist to the flank, well behind */
    g.quadraticCurveTo(side * sp * 0.56 - L * 0.16, tpY + L * 0.125, wrX - L * 0.10, wrY + L * 0.120);
    g.quadraticCurveTo(side * sp * 0.18 - L * 0.12, wrY + L * 0.150, -L * 0.07, L * 0.050);
    g.closePath();
    g.fillStyle = back ? dk : body;
    g.fill();
    /* the primaries: fingers off the tip, swept BACK and outward */
    g.strokeStyle = dark ? dk : (style === 'B' ? '#5A6268' : dk);
    g.lineWidth = L * 0.020;
    for (var f = 0; f < 4; f++) {
      var t0 = 0.86 - f * 0.05;
      g.beginPath();
      g.moveTo(tpX * t0, tpY + L * (0.015 + f * 0.020));
      g.quadraticCurveTo(tpX * (1.02 - f * 0.01) - side * L * 0.04, tpY + L * (0.05 + f * 0.035),
                         tpX * (1.00 - f * 0.05) - side * L * 0.10, tpY + L * (0.10 + f * 0.055));
      g.stroke();
    }
  }
  wing(1, true);

  /* --- body: a tapered spindle, deepest at the shoulder --- */
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(L * 0.20, -L * 0.012);
  g.quadraticCurveTo(L * 0.10, -L * 0.090, -L * 0.02, -L * 0.082);
  g.quadraticCurveTo(-L * 0.16, -L * 0.070, -L * 0.26, -L * 0.020);
  g.quadraticCurveTo(-L * 0.16, L * 0.070, -L * 0.02, L * 0.080);
  g.quadraticCurveTo(L * 0.11, L * 0.078, L * 0.20, -L * 0.012);
  g.closePath(); g.fill();
  /* the bustle of tertials over the tail, the crane's drooping "skirt" */
  g.fillStyle = dk;
  g.beginPath();
  g.moveTo(-L * 0.17, -L * 0.048);
  g.quadraticCurveTo(-L * 0.29, -L * 0.022, -L * 0.31, L * 0.030);
  g.quadraticCurveTo(-L * 0.23, L * 0.028, -L * 0.15, L * 0.050);
  g.closePath(); g.fill();

  /* --- neck straight out, head, dagger bill, red crown --- */
  g.strokeStyle = body; g.lineWidth = L * 0.052;
  g.beginPath();
  g.moveTo(L * 0.15, -L * 0.025);
  g.quadraticCurveTo(L * 0.30, -L * 0.050, L * 0.405, -L * 0.062);
  g.stroke();
  g.fillStyle = body;
  g.beginPath(); g.ellipse(L * 0.435, -L * 0.066, L * 0.044, L * 0.036, -0.1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = bill; g.lineWidth = L * 0.019;
  g.beginPath(); g.moveTo(L * 0.470, -L * 0.062); g.lineTo(L * 0.585, -L * 0.048); g.stroke();
  if (!dark) {
    g.fillStyle = '#C62828';
    g.beginPath(); g.ellipse(L * 0.442, -L * 0.092, L * 0.030, L * 0.017, -0.15, 0, Math.PI * 2); g.fill();
  }

  /* --- the near wing, over the body --- */
  wing(-1, false);
  g.restore();
}

/* The V. n birds, out of phase down each arm, each bobbing on its own beat,
 * the whole skein banking as it turns. A bird whose body is over the moon's
 * disc goes DARK — that is the picture, and it is the same rule the witch
 * follows over her moon. */
function skein(g, cx, cy, L, n, t, style, bank, moon) {
  var half = (n - 1) / 2, gapX = L * 0.80, gapY = L * 0.30;
  for (var i = 0; i < n; i++) {
    var k = i - half, s = k < 0 ? -1 : 1, d = Math.abs(k);
    var ph = (t + d * 0.17) % 1;
    var bob = Math.sin(ph * Math.PI * 2) * L * 0.05;
    /* position in the picture, bank applied about the leader */
    var lx = -d * gapX, ly = s * d * gapY + bob;
    var ca = Math.cos(bank || 0), sa = Math.sin(bank || 0);
    var x = cx + lx * ca - ly * sa, y = cy + lx * sa + ly * ca;
    var dark = false;
    if (moon) {
      var dx = x - moon.x, dy = y - moon.y;
      dark = Math.sqrt(dx * dx + dy * dy) < moon.r + L * 0.12;
    }
    g.save(); g.translate(x, y); g.rotate(bank || 0);
    crane(g, L, ph, style, dark);
    g.restore();
  }
}

/* The harvest moon: the engine's own painter, warm-graded. A harvest moon is
 * low, large and orange because its light comes through a lot of
 * atmosphere — so the grade is a multiply over the real painter, not a
 * repaint, and the maria stay exactly where moonPaint puts them. */
function harvest(r, variant) {
  var c = document.createElement('canvas');
  var dp = Math.min(window.devicePixelRatio || 1, 2);
  c.width = c.height = Math.ceil(r * 2.6 * dp);
  var g = c.getContext('2d');
  g.scale(dp, dp);
  g.translate(r * 1.3, r * 1.3);
  moonPaint(g, r);
  g.globalCompositeOperation = 'source-atop';
  var grad = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  if (variant === 'A') {
    grad.addColorStop(0, 'rgba(255,146,54,0.72)');
    grad.addColorStop(0.7, 'rgba(232,105,20,0.78)');
    grad.addColorStop(1, 'rgba(190,74,16,0.86)');
  } else {
    grad.addColorStop(0, 'rgba(255,205,120,0.55)');
    grad.addColorStop(0.7, 'rgba(240,170,80,0.58)');
    grad.addColorStop(1, 'rgba(214,138,54,0.66)');
  }
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  return { c: c, dp: dp, r: r };
}
function drawHarvest(g, m, x, y) {
  var r = m.r;
  var gl = g.createRadialGradient(x, y, r * 0.95, x, y, r * 1.5);
  gl.addColorStop(0, 'rgba(255,150,60,0.30)');
  gl.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = gl;
  g.beginPath(); g.arc(x, y, r * 1.5, 0, Math.PI * 2); g.fill();
  g.drawImage(m.c, Math.round(x - r * 1.3), Math.round(y - r * 1.3), r * 2.6, r * 2.6);
}
`;

/* ---- the page ---------------------------------------------------------- */
function svgData(raw, PAL) {
  if (typeof raw === 'function') { raw = raw(); }
  const cut = raw.indexOf('|');
  const [w, h] = raw.slice(0, cut).split(' ').map(Number);
  const body = raw.slice(cut + 1).replace(/%([a-x])/g, (m, k) => PAL[k] || '#f0f');
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
  return { w, h, url: 'data:image/svg+xml;utf8,' + encodeURIComponent(doc) };
}

const PIECES = [
  { title: 'Live oak leaf', note: 'A is the leaf already drawn in the engine and used by no theme. It is a LOBED northern oak; a live oak leaf is small, oval and un-lobed, which is B.', opts: [['A — already in the engine (leafo)', 'oakA'], ['B — a true live oak: oval, entire margin', 'oakB']] },
  { title: 'Red maple leaf', note: 'Already drawn in the engine (leafm) and used by no theme. Nothing to pick unless you want it changed.', opts: [['A — already in the engine (leafm)', 'mapleA']] },
  { title: 'Bald cypress leaf', note: 'A is in the engine already, built from ellipses. B draws the needles as needles.', opts: [['A — already in the engine (leafc)', 'cypA'], ['B — needles, not ellipses', 'cypB']] },
  { title: 'Gourd or squash', note: 'Three different plants, not three colours of one.', opts: [['A — round ribbed gourd', 'gourdA'], ['B — crookneck gourd', 'gourdB'], ['C — green acorn squash', 'gourdC']] },
  { title: 'Ear of corn', note: 'A is sweetcorn, half-shucked. B is Indian corn, multicoloured, with the silk showing.', opts: [['A — sweetcorn, husk peeled back', 'cornA'], ['B — Indian corn with silk', 'cornB']] },
  { title: 'Cranberry sprig', note: 'A is a sprig with three berries and two leaves. B is a tighter cluster of five.', opts: [['A — sprig, three berries', 'cranA'], ['B — cluster of five', 'cranB']] },
];

(async () => {
  const { PAL, MOON_SRC, SVGS } = readEngine();
  CAND.oakA = SVGS.leafo; CAND.mapleA = SVGS.leafm; CAND.cypA = SVGS.leafc;
  fs.mkdirSync(OUT, { recursive: true });

  const { chromium } = playwright();
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) { browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }

  /* ---------- sheet 1 and 2: the pieces, at a guest's size and large ----- */
  for (const [label, dpr, sizePx] of [['390', 3, 26], ['1280', 2, 26]]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: dpr });
    const cards = PIECES.map(p => {
      const cols = p.opts.map(([name, key]) => {
        const s = svgData(CAND[key], PAL);
        const scale = sizePx / Math.max(s.w, s.h);
        return `<div class="opt">
          <div class="big"><img src="${s.url}" style="width:${s.w * (150 / Math.max(s.w, s.h))}px"></div>
          <div class="row">
            <span class="onpage light"><img src="${s.url}" style="width:${s.w * scale}px"></span>
            <span class="onpage dark"><img src="${s.url}" style="width:${s.w * scale}px"></span>
          </div>
          <p>${name}</p>
        </div>`;
      }).join('');
      return `<section><h2>${p.title}</h2><p class="note">${p.note}</p><div class="opts">${cols}</div></section>`;
    }).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
      h1{font-size:19px;margin:0 0 2px} .sub{color:#6b6b6b;margin:0 0 16px}
      section{border-top:1px solid #E3D9C6;padding:12px 0 6px}
      h2{font-size:15px;margin:0 0 2px} .note{margin:0 0 8px;color:#6b6b6b;max-width:860px}
      .opts{display:flex;gap:26px;flex-wrap:wrap}
      .opt{text-align:center} .opt p{margin:6px 0 0;font-weight:600;max-width:200px}
      .big{height:160px;display:flex;align-items:flex-end;justify-content:center}
      .row{display:flex;gap:8px;justify-content:center;margin-top:8px}
      .onpage{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:5px}
      .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}
      </style>
      <h1>Seasons 4.13.0 — Thanksgiving, step 1: the new pieces</h1>
      <p class="sub">Each piece large enough to judge, then at the size a guest sees it (${label}px screen, DPR ${dpr}) on cream and on the navy footer. Nothing here is in the plugin yet — pick one per row.</p>
      ${cards}`);
    await page.waitForTimeout(450);
    await page.setViewportSize({ width: 1180, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, `Seasons - 4.13.0 step 1 pieces ${label}.png`) });
    await page.close();
    console.log(`pieces ${label}: ok`);
  }

  /* ---------- sheet 3: the crane scene, three key frames ---------------- */
  {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.error('  page error:', e.message));
    page.on('console', m => { if (m.type() === 'error') { console.error('  console:', m.text()); } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
      h1{font-size:19px;margin:0 0 2px} .sub{color:#6b6b6b;margin:0 0 14px;max-width:1000px}
      h2{font-size:15px;margin:14px 0 6px;border-top:1px solid #E3D9C6;padding-top:12px}
      .strip{display:flex;gap:12px} figure{margin:0} figcaption{margin-top:5px;color:#6b6b6b}
      canvas{display:block;border:1px solid #D9CDB6;border-radius:3px}
      </style>
      <h1>Seasons 4.13.0 — Thanksgiving, step 1: cranes across a harvest moon</h1>
      <p class="sub">Still key frames — start, middle, end — as the scene would play inside the header picture at 390px (the picture is 420px tall on every page). The moon is the engine's own moon painter with a warm grade over it, so the craters are the real ones. Two moon options and two crane drawings; the V is shown at five and at seven birds.</p>
      <div id="out"></div>
      <script>
      ${MOON_SRC}
      ${SCENE}
      var out = document.getElementById('out');
      function panel(title, rows) {
        var h = document.createElement('h2'); h.textContent = title; out.appendChild(h);
        var s = document.createElement('div'); s.className = 'strip';
        rows.forEach(function (r) {
          var f = document.createElement('figure');
          f.appendChild(r.c);
          var cap = document.createElement('figcaption'); cap.textContent = r.cap;
          f.appendChild(cap); s.appendChild(f);
        });
        out.appendChild(s);
      }
      /* the header picture at 390: 390 x 420 */
      var W = 390, H = 420;
      function frame(moonVar, style, n, t, label) {
        var c = document.createElement('canvas');
        c.width = W; c.height = H; c.style.width = W + 'px'; c.style.height = H + 'px';
        var g = c.getContext('2d');
        /* a stand-in for the header photograph: dusk over the canal */
        var sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#20344B'); sky.addColorStop(0.55, '#4A5A63'); sky.addColorStop(1, '#6E6A55');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        /* one phone-based size factor, as witchK does */
        var k = Math.min(Math.max(W / 390, 0.82), 1.3);
        var MR = Math.round(58 * k);                 /* a LOW, LARGE moon */
        var mx = Math.round(W * 0.62), my = Math.round(H * 0.70);
        var m = harvest(MR, moonVar);
        drawHarvest(g, m, mx, my);
        /* the skein crosses the moon's face: t 0..1 left to right */
        var L = Math.round(34 * k);
        var x0 = -L, x1 = W + L;
        var cx = x0 + (x1 - x0) * t;
        var cy = my - MR * 0.25 + Math.sin(t * Math.PI) * -MR * 0.12;
        var bank = (t - 0.5) * 0.22;
        skein(g, cx, cy, L, n, t * 6.0, style, bank, { x: mx, y: my, r: MR });
        return { c: c, cap: label };
      }
      [['A', 'deep burnt orange'], ['B', 'paler amber']].forEach(function (mv) {
        panel('Moon ' + mv[0] + ' — ' + mv[1] + ' · cranes A · V of 5', [
          frame(mv[0], 'A', 5, 0.14, 'start'),
          frame(mv[0], 'A', 5, 0.50, 'middle — across the face'),
          frame(mv[0], 'A', 5, 0.86, 'end'),
        ]);
      });
      panel('Cranes B — primaries picked out, darker wings · V of 7 · moon A', [
        frame('A', 'B', 7, 0.14, 'start'),
        frame('A', 'B', 7, 0.50, 'middle — across the face'),
        frame('A', 'B', 7, 0.86, 'end'),
      ]);
      /* close-ups so the bird itself can be judged */
      (function () {
        var h = document.createElement('h2'); h.textContent = 'The bird itself, close up — left crane A, right crane B (wings up, level, wings down)'; out.appendChild(h);
        var s = document.createElement('div'); s.className = 'strip';
        ['A', 'B'].forEach(function (st) {
          [0.25, 0.0, 0.75].forEach(function (ph) {
            var c = document.createElement('canvas');
            c.width = 260; c.height = 190; c.style.width = '260px'; c.style.height = '190px';
            var g = c.getContext('2d');
            g.fillStyle = '#E8CFA0'; g.fillRect(0, 0, 260, 190);
            /* the wing span is about 1.3 L, so L must leave room for it */
            g.translate(118, 96); crane(g, 118, ph, st, false);
            var f = document.createElement('figure'); f.appendChild(c);
            var cap = document.createElement('figcaption');
            cap.textContent = 'crane ' + st + ' — ' + (ph === 0.25 ? 'wings up' : ph === 0 ? 'level' : 'wings down');
            f.appendChild(cap); s.appendChild(f);
          });
        });
        out.appendChild(s);
      })();
      /* the bird as the scene actually shows it: dark on the moon's face */
      (function () {
        var h = document.createElement('h2');
        h.textContent = 'As the scene shows it — the bird dark on the moon\u2019s face (crane A, three beats)';
        out.appendChild(h);
        var s = document.createElement('div'); s.className = 'strip';
        [0.25, 0.0, 0.75].forEach(function (ph) {
          var c = document.createElement('canvas');
          c.width = 260; c.height = 190; c.style.width = '260px'; c.style.height = '190px';
          var g = c.getContext('2d');
          var m = harvest(96, 'A');
          g.fillStyle = '#2A3A4B'; g.fillRect(0, 0, 260, 190);
          drawHarvest(g, m, 130, 95);
          g.save(); g.translate(118, 96); crane(g, 118, ph, 'A', true); g.restore();
          var f = document.createElement('figure'); f.appendChild(c);
          var cap = document.createElement('figcaption');
          cap.textContent = ph === 0.25 ? 'wings up' : ph === 0 ? 'level' : 'wings down';
          f.appendChild(cap); s.appendChild(f);
        });
        out.appendChild(s);
      })();
      window.__done = true;
      </script>`);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1240, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, 'Seasons - 4.13.0 step 1 crane scene.png') });
    await page.close();
    console.log('crane scene: ok');
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
