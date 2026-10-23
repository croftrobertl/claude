'use strict';
/**
 * DCC Seasons — 4.14.0 CHRISTMAS, STEP 1: still drawings for Rob.
 *
 * Stills only: nothing here is animated and nothing is in the plugin until
 * Rob picks. Same format as Thanksgiving's sheets, with its lessons applied:
 * the header stand-in is LABELLED as a stand-in (the dusk gradient last time
 * read as a painted sky, and no scene paints one), and the 1280 frame shows
 * the moon clear of the page title and the Sun-on-the-Canal dial.
 *
 * The palette, the existing Christmas pieces and the real moon painter are
 * READ OUT OF engine.js, never copied.
 *
 *   node tools/xmas-lab.js
 *
 * Writes, into build/:
 *   Seasons - 4.14.0 step 1 pieces.png
 *   Seasons - 4.14.0 step 1 santa scene.png
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
  const mStart = src.indexOf('var MARIA = [');
  const mp = braceBlock(src, src.indexOf('function moonPaint'));
  const MOON_SRC = [
    'var D = document, MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, mn = MT.min, mx2 = MT.max, atan2 = MT.atan2, sqrt = MT.sqrt;',
    src.slice(mStart, src.indexOf(mp) + mp.length),
  ].join('\n');
  return { PAL, SVGS, MOON_SRC };
}
function svgData(raw, PAL) {
  if (typeof raw === 'function') { raw = raw(); }
  const cut = raw.indexOf('|');
  const [w, h] = raw.slice(0, cut).split(' ').map(Number);
  const body = raw.slice(cut + 1).replace(/%([a-x])/g, (m, k) => PAL[k] || '#f0f');
  return { w, h, url: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`) };
}

/* ---- the candidate pieces ------------------------------------------- */
const ball = (c, hi) => `<circle cx="12" cy="18" r="10" fill="${c}"/><ellipse cx="8.5" cy="13.5" rx="3" ry="4.2" fill="${hi}" opacity=".55" transform="rotate(-30 8.5 13.5)"/><rect x="9.5" y="4" width="5" height="5" rx="1" fill="%f"/><circle cx="12" cy="3" r="2" fill="none" stroke="%f" stroke-width="1.6"/>`;
const CAND = {
  /* ornament sets — three options, three pieces each */
  ornA1: `24 30|${ball('#E03131', '#FFC9C9')}`,
  ornA2: `24 30|${ball('#C9A227', '#FBF0C9')}`,
  ornA3: `24 30|${ball('#1864AB', '#A5D8FF')}`,
  ornB1: `24 30|${ball('#E03131', '#FFC9C9')}`,
  ornB2: '22 34|<rect x="8.5" y="2" width="5" height="4" rx="1" fill="%f"/><path d="M11 6 Q20 12 18 20 Q16 27 11 32 Q6 27 4 20 Q2 12 11 6 Z" fill="#C9A227"/><path d="M11 6 L11 32" stroke="#FBF0C9" stroke-width="0.9" opacity=".7"/><path d="M4.6 18 Q11 15 17.4 18" stroke="#FBF0C9" stroke-width="0.9" fill="none" opacity=".6"/>',
  ornB3: '24 32|<rect x="9.5" y="2" width="5" height="4" rx="1" fill="%f"/><path d="M12 6 L21 13 L18 25 L12 30 L6 25 L3 13 Z" fill="#1864AB"/><path d="M12 6 L12 30 M3 13 L21 13 M6 25 L18 25 M3 13 L12 30 L21 13" stroke="#A5D8FF" stroke-width="0.9" fill="none" opacity=".75"/>',
  ornC1: `24 30|${ball('#E03131', '#FFC9C9')}`,
  ornC2: '26 30|<rect x="10.5" y="2" width="5" height="4" rx="1" fill="%f"/><path d="M13 6 L15.9 13.6 L24 14.2 L17.7 19.3 L19.9 27.2 L13 22.8 L6.1 27.2 L8.3 19.3 L2 14.2 L10.1 13.6 Z" fill="#C9A227"/><path d="M13 9 L14.6 14.2 M13 9 L11.4 14.2" stroke="#FBF0C9" stroke-width="1" opacity=".7"/>',
  ornC3: '24 32|<rect x="9.5" y="2" width="5" height="4" rx="1" fill="%f"/><path d="M12 6 Q6 10 5 22 Q4 27 1.5 28 L22.5 28 Q20 27 19 22 Q18 10 12 6 Z" fill="#C9A227"/><circle cx="12" cy="29" r="2.4" fill="#8E6B12"/><path d="M12 7 Q8 11 7 20" stroke="#FBF0C9" stroke-width="1" fill="none" opacity=".7"/>',
  /* candy cane */
  caneA: '20 34|<path d="M6 32 L6 12 Q6 3 12 3 Q18 3 18 10" stroke="#FFFFFF" stroke-width="5.2" fill="none" stroke-linecap="round"/><path d="M6 32 L6 12 Q6 3 12 3 Q18 3 18 10" stroke="#E03131" stroke-width="5.2" fill="none" stroke-linecap="butt" stroke-dasharray="4 4"/><path d="M6 32 L6 12 Q6 3 12 3 Q18 3 18 10" stroke="#B8252A" stroke-width="0.8" fill="none" opacity=".5"/>',
  caneB: '20 34|<path d="M6 32 L6 12 Q6 3 12 3 Q18 3 18 10" stroke="#FFFFFF" stroke-width="5.2" fill="none" stroke-linecap="round"/><path d="M6 32 L6 12 Q6 3 12 3 Q18 3 18 10" stroke="#E03131" stroke-width="5.2" fill="none" stroke-linecap="butt" stroke-dasharray="4 8"/><path d="M6 32 L6 12 Q6 3 12 3 Q18 3 18 10" stroke="#2F9E44" stroke-width="5.2" fill="none" stroke-linecap="butt" stroke-dasharray="3 9" stroke-dashoffset="-6"/>',
  /* the flamingo in a Santa hat: the existing bird, three ways */
  flamA: '28 44|<g transform="translate(0 4)"><ellipse cx="14" cy="25" rx="10" ry="7" fill="%s"/><path d="M8 20q4-4 8-2" fill="none" stroke="%u" stroke-width="2.4" opacity="0.55"/><path d="M17 20q3.4-9-2.6-12.4T6 11" fill="none" stroke="%s" stroke-width="4.2" stroke-linecap="round"/><circle cx="6" cy="10" r="3.4" fill="%s"/><path d="M3.4 11 0.4 14 4.4 13Z" fill="%b"/><circle cx="5.2" cy="9" r="0.9" fill="%g"/><path d="M12 31v7m4.4-7v7" stroke="%u" stroke-width="1.6"/><path d="M9.6 38H14m1 0h4.4" stroke="%u" stroke-width="1.4"/></g><path d="M2.6 10.6 Q6 2 12 4.6 L10 11 Z" fill="#E03131"/><path d="M2.2 11.4 Q6.4 9.4 10.6 11.6" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.4" cy="4.2" r="1.8" fill="#FFFFFF"/>',
  flamB: '28 44|<g transform="translate(0 4)"><ellipse cx="14" cy="25" rx="10" ry="7" fill="%s"/><path d="M8 20q4-4 8-2" fill="none" stroke="%u" stroke-width="2.4" opacity="0.55"/><path d="M17 20q3.4-9-2.6-12.4T6 11" fill="none" stroke="%s" stroke-width="4.2" stroke-linecap="round"/><circle cx="6" cy="10" r="3.4" fill="%s"/><path d="M3.4 11 0.4 14 4.4 13Z" fill="%b"/><circle cx="5.2" cy="9" r="0.9" fill="%g"/><path d="M12 31v7m4.4-7v7" stroke="%u" stroke-width="1.6"/><path d="M9.6 38H14m1 0h4.4" stroke="%u" stroke-width="1.4"/></g><path d="M2.6 10.6 Q4 3 8.6 2.6 Q14 3.2 16.8 8 L10 11 Z" fill="#E03131"/><path d="M2.2 11.4 Q6.4 9.4 10.6 11.6" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="17.4" cy="8.6" r="1.9" fill="#FFFFFF"/>',
  flamC: '28 44|<g transform="translate(0 4)"><ellipse cx="14" cy="25" rx="10" ry="7" fill="%s"/><path d="M8 20q4-4 8-2" fill="none" stroke="%u" stroke-width="2.4" opacity="0.55"/><path d="M17 20q3.4-9-2.6-12.4T6 11" fill="none" stroke="%s" stroke-width="4.2" stroke-linecap="round"/><circle cx="6" cy="10" r="3.4" fill="%s"/><path d="M3.4 11 0.4 14 4.4 13Z" fill="%b"/><circle cx="5.2" cy="9" r="0.9" fill="%g"/><path d="M14 31 v7" stroke="%u" stroke-width="1.6"/><path d="M11.4 38 H17" stroke="%u" stroke-width="1.4"/><path d="M10 18 Q12 20 11 24 Q14 22 13 19" fill="none" stroke="#2F9E44" stroke-width="2.2" stroke-linecap="round"/><path d="M8 16 Q14 14 18 17" stroke="#2F9E44" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M8 16 Q14 14 18 17" stroke="#E03131" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-dasharray="2.5 2.5"/></g><path d="M2.6 10.6 Q6 2 12 4.6 L10 11 Z" fill="#E03131"/><path d="M2.2 11.4 Q6.4 9.4 10.6 11.6" stroke="#FFFFFF" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12.4" cy="4.2" r="1.8" fill="#FFFFFF"/>',
};
/* the wreath, as a corner accent at the cobweb's size class (96px, .5) */
function wreath(bowAt, berries) {
  const seg = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, r = 14 + (i % 3) * 1.2;
    const x = 20 + Math.cos(a) * r, y = 20 + Math.sin(a) * r;
    const d = a + 0.9;
    seg.push(`<path d="M${(x - Math.cos(d) * 3.4).toFixed(1)} ${(y - Math.sin(d) * 3.4).toFixed(1)} L${(x + Math.cos(d) * 3.4).toFixed(1)} ${(y + Math.sin(d) * 3.4).toFixed(1)}" stroke="${i % 2 ? '#2B8A3E' : '#37B24D'}" stroke-width="2.6" stroke-linecap="round"/>`);
  }
  const ber = [];
  for (let i = 0; i < berries; i++) {
    const a = (i / berries) * Math.PI * 2 + 0.4, r = 14.5;
    ber.push(`<circle cx="${(20 + Math.cos(a) * r).toFixed(1)}" cy="${(20 + Math.sin(a) * r).toFixed(1)}" r="1.9" fill="#E03131"/>`);
  }
  const [bx, by] = bowAt === 'top' ? [20, 5] : bowAt === 'right' ? [31, 30] : [20, 35];
  const bow = `<g transform="translate(${bx} ${by})"><path d="M0 0 Q-7 -6 -8 -1 Q-7 4 0 0 Z" fill="#E03131"/><path d="M0 0 Q7 -6 8 -1 Q7 4 0 0 Z" fill="#E03131"/><path d="M0 0 L-3 7 M0 0 L3 7" stroke="#C92A2A" stroke-width="2.2" stroke-linecap="round"/><circle cx="0" cy="0" r="1.8" fill="#C92A2A"/></g>`;
  return `40 40|<circle cx="20" cy="20" r="14" fill="none" stroke="#1F6E3A" stroke-width="7"/>${seg.join('')}${ber.join('')}${bow}`;
}
CAND.wreathA = wreath('bottom', 5);
CAND.wreathB = wreath('top', 3);
CAND.wreathC = wreath('right', 9);

/* ---- the scene: Santa, the sleigh and the team, drawn ---------------- */
const SCENE = `
/* The team: a reindeer in profile, L = its body length. ph is the gallop
 * phase 0..1; the legs swing with it, the body rises on the stride. dark
 * draws the silhouette. Drawn from the real animal: a deep chest, a short
 * neck carried forward, a small head with antlers, slim legs with a hock. */
function deer(g, L, ph, dark) {
  var body = dark ? '#241A12' : '#8B5A2B', dk = dark ? '#1B130D' : '#6F4522', pale = dark ? '#241A12' : '#D9B27C';
  var sw = sin(ph * TAU), bob = -abs(sw) * L * 0.05;
  g.save(); g.translate(0, bob);
  g.lineCap = 'round'; g.lineJoin = 'round';
  /* legs: fore pair and hind pair, opposite phases, with a hock */
  g.strokeStyle = dk; g.lineWidth = L * 0.045;
  function leg(x0, hind, s) {
    var a = sw * s * 0.55;
    var kx = x0 + sin(a) * L * 0.16, ky = L * 0.18 + cos(a) * L * 0.16;
    var fx = kx + sin(a * 1.6 + (hind ? -0.5 : 0.3)) * L * 0.16, fy = ky + cos(a * 1.6) * L * 0.16;
    g.beginPath(); g.moveTo(x0, L * 0.06); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
  }
  leg(-L * 0.28, true, 1); leg(-L * 0.22, true, -0.6);
  leg(L * 0.22, false, -1); leg(L * 0.28, false, 0.6);
  /* body: deep chest, rising to the rump */
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(L * 0.34, -L * 0.08);
  g.quadraticCurveTo(L * 0.36, L * 0.10, L * 0.18, L * 0.12);
  g.quadraticCurveTo(0, L * 0.14, -L * 0.22, L * 0.10);
  g.quadraticCurveTo(-L * 0.40, L * 0.06, -L * 0.38, -L * 0.08);
  g.quadraticCurveTo(-L * 0.20, -L * 0.18, 0, -L * 0.16);
  g.quadraticCurveTo(L * 0.22, -L * 0.16, L * 0.34, -L * 0.08);
  g.closePath(); g.fill();
  g.fillStyle = pale;   /* the pale belly and chest */
  g.beginPath(); g.ellipse(L * 0.02, L * 0.06, L * 0.22, L * 0.055, 0, 0, TAU); g.fill();
  /* tail */
  g.fillStyle = pale;
  g.beginPath(); g.moveTo(-L * 0.38, -L * 0.07); g.lineTo(-L * 0.46, -L * 0.12); g.lineTo(-L * 0.40, -L * 0.01); g.closePath(); g.fill();
  /* neck forward, head, muzzle, ear */
  g.strokeStyle = body; g.lineWidth = L * 0.13;
  g.beginPath(); g.moveTo(L * 0.30, -L * 0.08); g.quadraticCurveTo(L * 0.42, -L * 0.16, L * 0.50, -L * 0.26); g.stroke();
  g.fillStyle = body;
  g.beginPath(); g.ellipse(L * 0.54, -L * 0.29, L * 0.10, L * 0.065, 0.35, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(L * 0.63, -L * 0.25, L * 0.055, L * 0.04, 0.3, 0, TAU); g.fill();
  if (!dark) { g.fillStyle = '#2B2B2B'; g.beginPath(); g.arc(L * 0.675, -L * 0.245, L * 0.018, 0, TAU); g.fill(); }
  g.fillStyle = dk;
  g.beginPath(); g.moveTo(L * 0.50, -L * 0.33); g.lineTo(L * 0.46, -L * 0.42); g.lineTo(L * 0.54, -L * 0.36); g.closePath(); g.fill();
  if (!dark) { g.fillStyle = '#2B2B2B'; g.beginPath(); g.arc(L * 0.575, -L * 0.315, L * 0.014, 0, TAU); g.fill(); }
  /* antlers */
  g.strokeStyle = dark ? dk : '#5C3A1B'; g.lineWidth = L * 0.028;
  g.beginPath();
  g.moveTo(L * 0.54, -L * 0.34); g.quadraticCurveTo(L * 0.50, -L * 0.50, L * 0.56, -L * 0.60);
  g.moveTo(L * 0.52, -L * 0.46); g.lineTo(L * 0.45, -L * 0.52);
  g.moveTo(L * 0.54, -L * 0.54); g.lineTo(L * 0.62, -L * 0.57);
  g.moveTo(L * 0.57, -L * 0.34); g.quadraticCurveTo(L * 0.64, -L * 0.46, L * 0.70, -L * 0.52);
  g.moveTo(L * 0.63, -L * 0.44); g.lineTo(L * 0.69, -L * 0.42);
  g.stroke();
  g.restore();
}
/* The sleigh with Santa aboard. L = the sleigh's length. Santa's scarf and
 * the coat's hem are drawn trailing (in the engine they will be Verlet
 * strands like the witch's cape; here they are the pose they would be in). */
function sleigh(g, L, dark, t) {
  var red = dark ? '#241A12' : '#C92A2A', red2 = dark ? '#1B130D' : '#A61E1E', gold = dark ? '#1B130D' : '#C9A227';
  var white = dark ? '#241A12' : '#FFFFFF', skin = dark ? '#241A12' : '#F3C9A8';
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  /* runners */
  g.strokeStyle = gold; g.lineWidth = L * 0.035;
  g.beginPath();
  g.moveTo(-L * 0.46, L * 0.26); g.lineTo(L * 0.40, L * 0.26);
  g.quadraticCurveTo(L * 0.50, L * 0.26, L * 0.50, L * 0.16);
  g.moveTo(-L * 0.36, L * 0.12); g.lineTo(-L * 0.36, L * 0.26);
  g.moveTo(L * 0.26, L * 0.12); g.lineTo(L * 0.26, L * 0.26);
  g.stroke();
  /* body: a high curled back, a low front */
  g.fillStyle = red;
  g.beginPath();
  g.moveTo(-L * 0.48, -L * 0.22);
  g.quadraticCurveTo(-L * 0.58, -L * 0.26, -L * 0.52, -L * 0.08);
  g.lineTo(-L * 0.48, L * 0.12);
  g.lineTo(L * 0.42, L * 0.12);
  g.quadraticCurveTo(L * 0.50, L * 0.12, L * 0.50, L * 0.02);
  g.lineTo(L * 0.48, -L * 0.06);
  g.quadraticCurveTo(L * 0.30, -L * 0.10, L * 0.10, -L * 0.08);
  g.lineTo(-L * 0.42, -L * 0.08);
  g.closePath(); g.fill();
  g.fillStyle = red2;
  g.beginPath(); g.moveTo(-L * 0.48, L * 0.12); g.lineTo(L * 0.42, L * 0.12); g.lineTo(L * 0.42, L * 0.06); g.lineTo(-L * 0.48, L * 0.06); g.closePath(); g.fill();
  g.strokeStyle = gold; g.lineWidth = L * 0.018;
  g.beginPath(); g.moveTo(-L * 0.44, -L * 0.02); g.quadraticCurveTo(0, -L * 0.03, L * 0.42, L * 0.00); g.stroke();
  /* the sack of gifts behind him */
  g.fillStyle = dark ? '#241A12' : '#8B5A2B';
  g.beginPath(); g.ellipse(-L * 0.32, -L * 0.16, L * 0.13, L * 0.12, 0, 0, TAU); g.fill();
  if (!dark) {
    g.fillStyle = '#2F9E44'; g.fillRect(-L * 0.38, -L * 0.30, L * 0.08, L * 0.07);
    g.fillStyle = '#1864AB'; g.fillRect(-L * 0.29, -L * 0.32, L * 0.07, L * 0.08);
  }
  /* Santa: seated, leaning forward with the reins */
  g.fillStyle = red;
  g.beginPath(); g.ellipse(-L * 0.06, -L * 0.20, L * 0.13, L * 0.15, 0.1, 0, TAU); g.fill();
  g.strokeStyle = white; g.lineWidth = L * 0.03;      /* coat trim */
  g.beginPath(); g.moveTo(-L * 0.17, -L * 0.08); g.quadraticCurveTo(-L * 0.06, -L * 0.04, L * 0.06, -L * 0.08); g.stroke();
  g.fillStyle = dark ? '#1B130D' : '#2B2B2B';           /* belt */
  g.fillRect(-L * 0.17, -L * 0.17, L * 0.22, L * 0.035);
  if (!dark) { g.fillStyle = gold; g.fillRect(-L * 0.08, -L * 0.18, L * 0.04, L * 0.05); }
  /* arm forward holding the reins, mitten */
  g.strokeStyle = red; g.lineWidth = L * 0.06;
  g.beginPath(); g.moveTo(L * 0.02, -L * 0.24); g.lineTo(L * 0.16, -L * 0.20); g.stroke();
  g.fillStyle = dark ? '#241A12' : '#2B8A3E';
  g.beginPath(); g.arc(L * 0.18, -L * 0.20, L * 0.035, 0, TAU); g.fill();
  /* head, beard, hat with a bobble streaming back */
  g.fillStyle = skin;
  g.beginPath(); g.arc(L * 0.02, -L * 0.40, L * 0.075, 0, TAU); g.fill();
  g.fillStyle = white;
  g.beginPath();
  g.moveTo(-L * 0.04, -L * 0.37); g.quadraticCurveTo(L * 0.06, -L * 0.24, L * 0.10, -L * 0.36);
  g.quadraticCurveTo(L * 0.06, -L * 0.33, L * 0.00, -L * 0.34); g.closePath(); g.fill();
  if (!dark) { g.fillStyle = '#2B2B2B'; g.beginPath(); g.arc(L * 0.05, -L * 0.42, L * 0.012, 0, TAU); g.fill(); }
  g.fillStyle = red;
  g.beginPath();
  g.moveTo(-L * 0.06, -L * 0.44); g.quadraticCurveTo(L * 0.02, -L * 0.56, L * 0.09, -L * 0.45);
  g.quadraticCurveTo(-L * 0.10, -L * 0.52, -L * 0.24, -L * 0.46); g.closePath(); g.fill();
  g.strokeStyle = white; g.lineWidth = L * 0.03;
  g.beginPath(); g.moveTo(-L * 0.07, -L * 0.44); g.quadraticCurveTo(L * 0.02, -L * 0.47, L * 0.10, -L * 0.44); g.stroke();
  g.fillStyle = white; g.beginPath(); g.arc(-L * 0.25, -L * 0.46, L * 0.028, 0, TAU); g.fill();
  /* the scarf, streaming back and lifting with the wind — the cloth
   * physics in the engine; its pose here */
  g.strokeStyle = dark ? '#241A12' : '#2B8A3E'; g.lineWidth = L * 0.035;
  g.beginPath();
  g.moveTo(-L * 0.04, -L * 0.33);
  g.quadraticCurveTo(-L * 0.16, -L * 0.30 + sin(t * 7) * L * 0.02, -L * 0.28, -L * 0.36 + sin(t * 9) * L * 0.03);
  g.quadraticCurveTo(-L * 0.36, -L * 0.40, -L * 0.42, -L * 0.34);
  g.stroke();
  if (!dark) {
    g.strokeStyle = '#C92A2A'; g.lineWidth = L * 0.012;
    g.beginPath(); g.moveTo(-L * 0.30, -L * 0.38); g.lineTo(-L * 0.32, -L * 0.33); g.moveTo(-L * 0.36, -L * 0.40); g.lineTo(-L * 0.37, -L * 0.35); g.stroke();
  }
  g.restore();
}
/* The whole rig: the sleigh, n reindeer in pairs ahead of it, the reins
 * sagging between. Everything in the sleigh's units. u is 0..1 across the
 * flight; the team's gallop runs off it. Birds dark over the moon as before. */
function rig(g, x, y, L, u, moon, dir, n) {
  var dl = L * 0.52;                   /* a reindeer's body length */
  var gapX = L * 0.50, climb = -L * 0.045;
  var parts = [];
  for (var i = 0; i < n; i++) {
    var px = L * 0.55 + i * gapX, py = climb * i, ph = (u * 9 + i * 0.23) % 1;
    parts.push({ x: px, y: py, ph: ph, deer: true });
  }
  g.save(); g.translate(x, y); if (dir < 0) { g.scale(-1, 1); }
  var tilt = -0.08;
  g.rotate(tilt);
  function isDark(px, py) {
    if (!moon) { return false; }
    /* back into page space */
    var ca = cos(tilt), sa = sin(tilt);
    var wx = x + dir * (px * ca - py * sa), wy = y + (px * sa + py * ca);
    var d = sqrt((wx - moon.x) * (wx - moon.x) + (wy - moon.y) * (wy - moon.y));
    return d < moon.r + L * 0.10;
  }
  /* reins: from Santa's hand to each deer's head, sagging between */
  g.strokeStyle = isDark(0, -L * 0.2) ? '#1B130D' : '#5C3A1B'; g.lineWidth = L * 0.012;
  var hx = L * 0.18, hy = -L * 0.20;
  for (var k = 0; k < parts.length; k++) {
    var p = parts[k], tx = p.x + dl * 0.56, ty = p.y - dl * 0.26;
    g.beginPath(); g.moveTo(hx, hy);
    g.quadraticCurveTo((hx + tx) / 2, (hy + ty) / 2 + L * 0.09 + k * L * 0.02, tx, ty);
    g.stroke();
  }
  for (var j = parts.length - 1; j >= 0; j--) {
    var q = parts[j];
    g.save(); g.translate(q.x, q.y); deer(g, dl, q.ph, isDark(q.x, q.y)); g.restore();
  }
  sleigh(g, L, isDark(0, -L * 0.2), u);
  g.restore();
}
/* the real moon, pre-painted once at a radius */
function moonC(r) {
  var c = document.createElement('canvas'), dp = mn(window.devicePixelRatio || 1, 2), half = MT.ceil(r * 1.3);
  c.width = c.height = MT.ceil(2 * half * dp);
  var g = c.getContext('2d'); g.scale(dp, dp); g.translate(half, half); moonPaint(g, r);
  return { c: c, half: half, r: r };
}
`;

/* ---- the pages ------------------------------------------------------- */
const CSS = `
  body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
  h1{font-size:19px;margin:0 0 2px;text-align:center}
  .sub{color:#6b6b6b;margin:0 auto 16px;max-width:940px}
  section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
  h2{font-size:15px;margin:0 0 4px;text-align:center}
  h3{font-size:13px;margin:8px 0 2px;text-align:center;color:#444}
  .note{margin:0 auto 10px;color:#6b6b6b;max-width:900px}
  .opts{display:flex;gap:28px;flex-wrap:wrap;justify-content:center}
  .opt{text-align:center} .opt p{margin:6px 0 0;font-weight:600;max-width:220px}
  .big{height:140px;display:flex;align-items:center;justify-content:center;gap:10px}
  .row{display:flex;gap:8px;justify-content:center;margin-top:8px}
  .onpage{display:inline-flex;align-items:center;justify-content:center;gap:3px;width:46px;height:46px;border-radius:5px}
  .wide{width:92px}
  .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}
  figure{margin:0} figcaption{margin-top:5px;color:#6b6b6b;text-align:center}
  .strip{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  canvas{display:block;border:1px solid #D9CDB6;border-radius:3px}
`;

(async () => {
  const { PAL, SVGS, MOON_SRC } = readEngine();
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = playwright();
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) { browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }

  const piece = (raw, size, label) => {
    const s = svgData(raw, PAL), big = 130 / Math.max(s.w, s.h), on = size / Math.max(s.w, s.h);
    return { bigImg: `<img src="${s.url}" style="width:${s.w * big}px">`, onImg: `<img src="${s.url}" style="width:${s.w * on}px">`, label };
  };
  const opt = (ps, name, wide) => `<div class="opt"><div class="big">${ps.map(p => p.bigImg).join('')}</div>
    <div class="row"><span class="onpage light ${wide ? 'wide' : ''}">${ps.map(p => p.onImg).join('')}</span>
    <span class="onpage dark ${wide ? 'wide' : ''}">${ps.map(p => p.onImg).join('')}</span></div><p>${name}</p></div>`;

  /* ---------- sheet 1: the pieces ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 3 });
    const today = ['ornament', 'holly', 'gift', 'pine', 'sabalpalm'].map(k => opt([piece(SVGS[k], 28)], k === 'sabalpalm' ? 'sabal palm (lights up)' : k === 'pine' ? 'pine (lights up)' : k));
    const orn = [
      opt(['ornA1', 'ornA2', 'ornA3'].map(k => piece(CAND[k], 26)), 'A — three glass balls, three colours', true),
      opt(['ornB1', 'ornB2', 'ornB3'].map(k => piece(CAND[k], 26)), 'B — a ball, a teardrop, a faceted lantern', true),
      opt(['ornC1', 'ornC2', 'ornC3'].map(k => piece(CAND[k], 26)), 'C — a ball, a star, a bell', true),
    ];
    const cane = [opt([piece(CAND.caneA, 30)], 'A — classic red and white'), opt([piece(CAND.caneB, 30)], 'B — with a green stripe')];
    const flam = [
      opt([piece(CAND.flamA, 36)], 'A — the hat upright'),
      opt([piece(CAND.flamB, 36)], 'B — the hat flopped over'),
      opt([piece(CAND.flamC, 36)], 'C — on one leg, with a scarf'),
    ];
    const wr = [['wreathA', 'A — bow at the bottom, five berries'], ['wreathB', 'B — bow at the top, three berries'], ['wreathC', 'C — bow to the side, nine berries']].map(([k, n]) => {
      const s = svgData(CAND[k], PAL);
      return `<div class="opt"><div class="big"><img src="${s.url}" style="width:130px"></div>
        <div class="row"><span class="onpage light" style="width:110px;height:110px"><img src="${s.url}" style="width:96px;opacity:.5"></span>
        <span class="onpage dark" style="width:110px;height:110px"><img src="${s.url}" style="width:96px;opacity:.5"></span></div><p>${n}</p></div>`;
    }).join('');
    const fall = ['ornament', 'holly', 'gift', 'pine', 'sabalpalm'].map(k => svgData(SVGS[k], PAL));
    const BOKEH = `
      var out = document.getElementById('bokeh');
      var srcs = ${JSON.stringify(fall.map(f => ({ url: f.url, w: f.w, h: f.h })))};
      var imgs = [], left = srcs.length;
      srcs.forEach(function (s, i) { var im = new Image(); im.onload = im.onerror = function () { if (!--left) { draw(); } }; im.src = s.url; imgs[i] = im; });
      function draw() {
        /* over the cream page AND over the navy footer: on cream the layer
         * is genuinely faint (its real alpha is .22), and the footer is
         * where a guest actually sees it */
        [[true, false], [false, false], [true, true], [false, true]].forEach(function (opt) {
          var withBokeh = opt[0], navy = opt[1];
          var W = 390, H = navy ? 300 : 520, c = document.createElement('canvas');
          c.width = W * 2; c.height = H * 2; c.style.width = W + 'px'; c.style.height = H + 'px';
          var g = c.getContext('2d'); g.scale(2, 2);
          g.fillStyle = navy ? '#16314A' : '#FBF6EC'; g.fillRect(0, 0, W, H);
          /* a column of page copy, so the layer is judged over what it sits behind */
          g.fillStyle = navy ? '#FFFFFF' : '#2b2b2b'; g.font = 'bold 20px Georgia, serif'; g.textAlign = 'center';
          g.fillText(navy ? 'Dora Canal Court' : 'About Us', W / 2, 60);
          g.font = '13px system-ui'; g.textAlign = 'left'; g.fillStyle = navy ? 'rgba(255,255,255,.6)' : '#444';
          for (var l = 0; l < (navy ? 7 : 14); l++) { g.fillRect(28, 90 + l * 22, 150 + ((l * 73) % 180), 8); }
          if (withBokeh) {
            /* the engine's bokeh effect, drawn from its own parameters: 8
             * soft discs, r 9-20, in its four colours, at its alpha */
            var cl = ['#FFD8A8', '#FFE8CC', '#FFC9C9', '#D8F5A2'];
            var pts = [[40, 120, 16], [330, 80, 12], [200, 300, 19], [90, 420, 11], [300, 380, 15], [160, 180, 9], [350, 250, 20], [60, 290, 13]];
            pts.forEach(function (p, i) {
              var r = p[2], gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
              gr.addColorStop(0, cl[i % 4]); gr.addColorStop(0.55, cl[i % 4]); gr.addColorStop(1, 'rgba(255,255,255,0)');
              g.globalAlpha = 0.22 * (0.55 + 0.45 * ((i * 7) % 10) / 10);
              g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill();
            });
            g.globalAlpha = 1;
          }
          /* the same handful of falling pieces in both */
          var at = navy ? [[60, 150, 0], [300, 110, 1], [210, 230, 2], [120, 60, 3]] : [[60, 150, 0], [300, 110, 1], [210, 240, 2], [120, 360, 3], [320, 460, 4], [250, 60, 1]];
          at.forEach(function (a) { var im = imgs[a[2]], s = srcs[a[2]], k = 28 / Math.max(s.w, s.h); g.drawImage(im, a[0], a[1], s.w * k, s.h * k); });
          var f = document.createElement('figure'); f.appendChild(c);
          var cap = document.createElement('figcaption');
          cap.textContent = (withBokeh ? 'A — keep the bokeh layer' : 'B — remove it, as the Thanksgiving ovals went') + (navy ? ' (on the footer)' : ' (on the page)');
          f.appendChild(cap); out.appendChild(f);
        });
        window.__bokeh = true;
      }`;
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <h1>Seasons 4.14.0 — Christmas, Step 1: The Pieces</h1>
      <p class="sub">Each piece large enough to judge, then at the size a guest sees it, on cream and on the navy footer. The five pieces Christmas already has are shown first so the whole set can be judged together. Nothing here is in the plugin — pick one per row. No snow, as ever.</p>
      <section><h2>The Set Today — Kept As They Are</h2><div class="opts">${today.join('')}</div></section>
      <section><h2>The Ornaments — One Kind, Three Variations</h2>
        <p class="note">Like the gourds: three pieces mixed as they fall. They replace the single ornament above. A keeps one shape in three colours; B and C are three shapes.</p>
        <div class="opts">${orn.join('')}</div></section>
      <section><h2>The Candy Cane</h2><div class="opts">${cane.join('')}</div></section>
      <section><h2>The Flamingo in a Santa Hat</h2>
        <p class="note">The flamingo already in the plugin, in its own pink, with a hat added three ways. C also stands it on one leg with a scarf.</p>
        <div class="opts">${flam.join('')}</div></section>
      <section><h2>The Wreath in the Corner</h2>
        <p class="note">A corner accent in the cobweb's size class — 96px at half opacity, which is how the small squares show it. Pine, a red bow and berries. Christmas has no corner accent today.</p>
        <div class="opts">${wr}</div></section>
      <section><h2>The Background Layer — Keep or Remove?</h2>
        <p class="note">Christmas has a bokeh layer today: eight soft warm discs drifting behind everything, as in the plugin. Thanksgiving's plain ovals went in 4.13.0 because real leaves now fall in front of them. The same question for Christmas, over a column of page copy with the same handful of pieces in both.</p>
        <div class="strip" id="bokeh" style="max-width:820px;margin:0 auto"></div></section>
      <script>${BOKEH}</script>`);
    await page.waitForFunction(() => window.__bokeh === true, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 1240, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, 'Seasons - 4.14.0 step 1 pieces.png') });
    await page.close();
    console.log('pieces: ok');
  }

  /* ---------- sheet 2: the scene ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1320, height: 1000 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.error('  page error:', e.message));
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <h1>Seasons 4.14.0 — Christmas, Step 1: Santa Across the Moon</h1>
      <p class="sub">Still key frames of the sleighmoon scene as it would play inside the header picture — in the daytime too, now — at 390px and at 1280px. The moon is the engine's own moon painter, ungraded. The team goes dark as it crosses the face, as the cranes do. The frame behind them is a LABELLED STAND-IN for the cottage photograph: the scene paints no sky and never will.</p>
      <div id="out"></div>
      <script>
      ${MOON_SRC}
      ${SCENE}
      var out = document.getElementById('out');
      function panel(title, note, nodes) {
        var sec = document.createElement('section');
        var h = document.createElement('h2'); h.textContent = title; sec.appendChild(h);
        if (note) { var p = document.createElement('p'); p.className = 'note'; p.textContent = note; sec.appendChild(p); }
        var s = document.createElement('div'); s.className = 'strip';
        nodes.forEach(function (n) {
          var f = document.createElement('figure'); f.appendChild(n.c);
          var cap = document.createElement('figcaption'); cap.textContent = n.cap; f.appendChild(cap); s.appendChild(f);
        });
        sec.appendChild(s); out.appendChild(sec);
      }
      /* the stand-in header picture: flat, photo-like, and SAYS what it is */
      function plate(W, H, wide) {
        var c = document.createElement('canvas');
        c.width = W; c.height = H; c.style.width = (wide ? W * 0.5 : W) + 'px'; c.style.height = (wide ? H * 0.5 : H) + 'px';
        var g = c.getContext('2d');
        g.fillStyle = '#BFD5E6'; g.fillRect(0, 0, W, H);                 /* a pale day sky */
        g.fillStyle = '#5E8FA8'; g.fillRect(0, H * 0.64, W, H * 0.36);   /* the canal */
        g.fillStyle = '#3E5A3A';                                          /* the far bank and palms */
        g.fillRect(0, H * 0.58, W, H * 0.07);
        for (var i = 0; i < 6; i++) {
          var px = W * (0.08 + i * 0.17), ph = H * (0.22 + (i % 2) * 0.05);
          g.fillRect(px - 2, H * 0.64 - ph, 4, ph);
          g.beginPath(); g.arc(px, H * 0.64 - ph, H * 0.06, 0, TAU); g.fill();
        }
        g.fillStyle = 'rgba(28,36,30,0.55)';                              /* a cottage roofline */
        g.beginPath(); g.moveTo(W * 0.56, H * 0.64); g.lineTo(W * 0.56, H * 0.50); g.lineTo(W * 0.70, H * 0.42);
        g.lineTo(W * 0.84, H * 0.50); g.lineTo(W * 0.84, H * 0.64); g.closePath(); g.fill();
        /* the live page title, centred, and the Sun-on-the-Canal dial */
        g.font = 'bold ' + (wide ? 44 : 22) + 'px Georgia, serif'; g.textAlign = 'center';
        g.fillStyle = '#FFFFFF'; g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6;
        g.fillText('DORA CANAL COURT', W / 2, H * 0.56); g.shadowBlur = 0;
        if (wide) {
          g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
          g.beginPath(); g.arc(W - 90, 80, 46, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(255,220,120,.9)'; g.beginPath(); g.arc(W - 90, 80, 10, 0, TAU); g.fill();
          g.font = '14px system-ui'; g.fillStyle = '#FFFFFF'; g.fillText('Sun dial', W - 90, 148);
        }
        /* the label, so no one reads this as the scene painting a sky */
        g.font = (wide ? 20 : 11) + 'px system-ui'; g.textAlign = 'left';
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(6, H - (wide ? 34 : 20), wide ? 470 : 250, wide ? 28 : 16);
        g.fillStyle = '#FFFFFF'; g.fillText('STAND-IN for the cottage photograph — the scene paints no sky', 12, H - (wide ? 13 : 8));
        return { c: c, g: g };
      }
      function frame(W, H, wide, u, cap, dir) {
        var p = plate(W, H, wide);
        var k = mn(mx2(W / 390, 0.82), 1.3);
        var MR = MT.round(54 * k), m = moonC(MR);
        /* off centre, on the side the sleigh flies into: clear of the title and the dial */
        var mx = MT.round(W * (dir > 0 ? 0.66 : 0.34)), my = MT.round(mx2(H * 0.24, MR + 12));
        var dp = mn(window.devicePixelRatio || 1, 2);
        p.g.drawImage(m.c, MT.round((mx - m.half) * dp) / dp, MT.round((my - m.half) * dp) / dp, m.half * 2, m.half * 2);
        var L = MT.round(78 * k);                      /* the sleigh's length */
        var x0 = dir > 0 ? -L * 2.6 : W + L * 2.6, x1 = dir > 0 ? W + L * 2.6 : -L * 2.6;
        var x = x0 + (x1 - x0) * u, y = my + MR * 0.10 - sin(u * MT.PI) * MR * 0.18;
        rig(p.g, x, y, L, u, { x: mx, y: my, r: MR }, dir, 4);
        return { c: p.c, cap: cap };
      }
      panel('At 390px — the Picture Is 420px Tall', 'Start, middle (the team across the face), end. The moon sits off centre on the side the sleigh flies into.',
        [frame(390, 420, false, 0.16, 'start', 1), frame(390, 420, false, 0.50, 'middle — across the face', 1), frame(390, 420, false, 0.84, 'end', 1)]);
      panel('At 1280px — Shown at Half Size', 'The moon clear of the centred page title and of the Sun-on-the-Canal dial in the top right. The sleigh flies the other way here so both sides are seen.',
        [frame(1280, 420, true, 0.16, 'start', -1), frame(1280, 420, true, 0.50, 'middle — across the face', -1), frame(1280, 420, true, 0.84, 'end', -1)]);
      /* close-ups: the team at three points of the gallop, lit and dark */
      var lit = [0.0, 0.33, 0.66].map(function (ph, i) {
        var c = document.createElement('canvas'); c.width = 300; c.height = 170; c.style.width = '300px'; c.style.height = '170px';
        var g = c.getContext('2d'); g.fillStyle = '#E8CFA0'; g.fillRect(0, 0, 300, 170);
        g.save(); g.translate(150, 110); deer(g, 150, ph, false); g.restore();
        return { c: c, cap: ['legs gathered', 'reaching', 'stretched'][i] };
      });
      panel('The Reindeer, Close Up — Three Points of the Gallop', 'Lit. In the scene each animal is on its own point of the stride, offset down the team.', lit);
      var dark = [0.0, 0.33, 0.66].map(function (ph, i) {
        var c = document.createElement('canvas'); c.width = 300; c.height = 170; c.style.width = '300px'; c.style.height = '170px';
        var g = c.getContext('2d'); g.fillStyle = '#2A3A4B'; g.fillRect(0, 0, 300, 170);
        var m = moonC(78); var dp = mn(window.devicePixelRatio || 1, 2);
        g.drawImage(m.c, MT.round((150 - m.half) * dp) / dp, MT.round((85 - m.half) * dp) / dp, m.half * 2, m.half * 2);
        g.save(); g.translate(150, 110); deer(g, 150, ph, true); g.restore();
        return { c: c, cap: ['legs gathered', 'reaching', 'stretched'][i] };
      });
      panel('The Same Three, Dark on the Moon', 'How a guest sees them as they cross the face.', dark);
      var sl = [false, true].map(function (dk) {
        var c = document.createElement('canvas'); c.width = 330; c.height = 200; c.style.width = '330px'; c.style.height = '200px';
        var g = c.getContext('2d'); g.fillStyle = dk ? '#2A3A4B' : '#E8CFA0'; g.fillRect(0, 0, 330, 200);
        if (dk) { var m = moonC(90), dp = mn(window.devicePixelRatio || 1, 2); g.drawImage(m.c, MT.round((165 - m.half) * dp) / dp, MT.round((100 - m.half) * dp) / dp, m.half * 2, m.half * 2); }
        g.save(); g.translate(165, 120); sleigh(g, 220, dk, 0.3); g.restore();
        return { c: c, cap: dk ? 'dark on the moon' : 'lit' };
      });
      panel('Santa and the Sleigh, Close Up', 'The scarf and the coat trim are the pose the cloth physics would give them; the reins sag to each animal.', sl);
      window.__done = true;
      </script>`);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1320, height: await page.evaluate(() => document.body.scrollHeight) });
    await page.screenshot({ path: path.join(OUT, 'Seasons - 4.14.0 step 1 santa scene.png') });
    await page.close();
    console.log('scene: ok');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
