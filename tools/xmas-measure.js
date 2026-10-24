'use strict';
/**
 * DCC Seasons — 4.14.0 Christmas: the COST of the moon-edge cut, planned
 * before the scene is built (the Director, 2026-10-24).
 *
 * Rob picked the silhouette cut exactly at the moon's disc, so a reindeer
 * crossing the rim is no longer one pre-drawn sprite per pose: both a LIT
 * and a DARK sprite are pre-drawn for every pose, and per frame the lit
 * one is drawn, then the dark one clipped to the moon's circle (one arc +
 * clip per animal, inside save/restore); the red nose's glow is drawn
 * after the clip so it shows on both sides of the rim.
 *
 * This measures that plan with the lab's painters (tools/xmas-redraw.js),
 * the way the engine would do it: at 390 px, DPR 3, 4x CPU throttle, all
 * four reindeer, Santa and the moon on screen, for 10 s of frames. It
 * reports the median and the worst frame's draw time, the sprite memory
 * (count x width x height x 4 bytes, pre-drawn at the RENDERED size), and
 * the pre-draw time.
 *
 *   node tools/xmas-measure.js [--seconds=10] [--throttle=4] [--dpr=3]
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : d; };
const SECONDS = arg('seconds', 10), THROTTLE = arg('throttle', 4), DPR = arg('dpr', 3), POSES = arg('poses', 24), SPDP = arg('spdp', 0), W = 390, H = 420;

const lab = fs.readFileSync(path.join(__dirname, 'xmas-redraw.js'), 'utf8');
const SCENE = lab.slice(lab.indexOf('const SCENE = `') + 15, lab.indexOf('`;\n', lab.indexOf('const SCENE = `')));
const eng = fs.readFileSync(path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
const mStart = eng.indexOf('var MARIA = [');
let d = 0, j = eng.indexOf('{', eng.indexOf('function moonPaint'));
for (; j < eng.length; j++) { if (eng[j] === '{') { d++; } else if (eng[j] === '}') { d--; if (!d) { break; } } }
const MOON = 'var D = document, MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, mn = MT.min, mx2 = MT.max, atan2 = MT.atan2, sqrt = MT.sqrt;\n' + eng.slice(mStart, j + 1);

const PAGE = `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;background:#BFD5E6">
<canvas id="c"></canvas><script>
${MOON}
${SCENE}
var POSES = ${POSES}, c = document.getElementById('c'), dp = window.devicePixelRatio, sdp = ${SPDP} || dp;   /* sdp: the sprites' own pixel ratio (the engine caps the witch at min(DPR, 2)) */
c.width = ${W} * dp; c.height = ${H} * dp; c.style.width = '${W}px'; c.style.height = '${H}px';
var g = c.getContext('2d');
var k = 1, MR = 54, L = 78, dl = L * 0.5, s = dl / 60;
/* the pre-draw: lit and dark, every pose, at the RENDERED size (dl) on
 * device pixels; the far animal's 0.9 scale is drawn from the same sprite */
var box = { x0: -42 * s, y0: -82 * s, x1: 66 * s, y1: 50 * s };
var sw = Math.ceil((box.x1 - box.x0) * sdp), sh = Math.ceil((box.y1 - box.y0) * sdp);
var cache = { lit: [], dark: [], far: [] }, t0 = performance.now();
function pre(kind) {
  for (var i = 0; i < POSES; i++) {
    var cv = document.createElement('canvas'); cv.width = sw; cv.height = sh;
    var cg = cv.getContext('2d'); cg.scale(sdp, sdp); cg.translate(-box.x0, -box.y0);
    deer(cg, dl, i / POSES, kind === 'dark', kind === 'far', false);
    cache[kind].push(cv);
  }
}
pre('lit'); pre('dark'); pre('far');
/* the sleigh and Santa, 12 bob poses, lit only (never dark) */
var SL = 12, sleighC = [], sb = { x0: -60, y0: -72, x1: 60, y1: 30 };
for (var q = 0; q < SL; q++) {
  var cv2 = document.createElement('canvas'); cv2.width = Math.ceil((sb.x1 - sb.x0) * s * sdp); cv2.height = Math.ceil((sb.y1 - sb.y0) * s * sdp);
  var g2 = cv2.getContext('2d'); g2.scale(sdp * s, sdp * s); g2.translate(-sb.x0, -sb.y0); sack(g2); sleighBody(g2); santa(g2, q < 3 ? q / 3 : 0);
  sleighC.push(cv2);
}
var preMs = performance.now() - t0;
var m = moonC(MR), mx = 257, my = 112;
var bytes = (cache.lit.length + cache.dark.length + cache.far.length) * sw * sh * 4 + sleighC.length * sleighC[0].width * sleighC[0].height * 4;
window.__pre = { preMs: preMs, sprites: cache.lit.length + cache.dark.length + cache.far.length + sleighC.length, sw: sw, sh: sh, bytes: bytes };
/* the frame: clear, the moon, the four animals lit + dark-clipped, the
 * nose glow after the clip, the reins, the sleigh — as the engine would */
var frames = [], u = 0, start = null;
function frame(ts) {
  if (start === null) { start = ts; }
  var a = performance.now();
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(dp, 0, 0, dp, 0, 0);
  g.drawImage(m.c, mx - m.half, my - m.half, m.half * 2, m.half * 2);
  u = ((ts - start) / 4000) % 1;
  var x = -L * 2.6 + (390 + L * 3.4) * u, y = my + MR * 0.26;
  for (var i = 0; i < 4; i++) {
    var pair = (i / 2) | 0, far = i % 2 === 1, px = x + L * 0.98 + pair * 2.05 * dl + (far ? 0.55 * dl : 0), py = y - 0.06 * dl * pair - L * 0.02 - (far ? 0.3 * dl : 0);
    var pose = Math.floor(((u * 7.5 + i * 0.25) % 1) * POSES), sc = far ? 0.9 : 1;
    var sp = far ? cache.far[pose] : cache.lit[pose];
    g.save(); g.translate(px, py); g.scale(sc, sc);
    g.drawImage(sp, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    g.restore();
    /* dark inside the disc only, when the animal's box meets it */
    var ddx = px - mx, ddy = py - my;
    if (Math.sqrt(ddx * ddx + ddy * ddy) < MR + 70 * s) {
      g.save(); g.beginPath(); g.arc(mx, my, MR, 0, TAU); g.clip();
      g.translate(px, py); g.scale(sc, sc);
      g.drawImage(cache.dark[pose], box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
      g.restore();
    }
    if (i === 2) { /* the lead animal's red nose and glow, after the clip */
      var nx = px + 16.8 * s + 43 * s, ny = py - 25 * s;
      var ng = g.createRadialGradient(nx, ny, 0.5, nx, ny, 7 * s); ng.addColorStop(0, 'rgba(255,90,74,.6)'); ng.addColorStop(1, 'rgba(255,90,74,0)');
      g.fillStyle = ng; g.beginPath(); g.arc(nx, ny, 7 * s, 0, TAU); g.fill();
      g.fillStyle = '#E8392B'; g.beginPath(); g.arc(nx, ny, 2.4 * s, 0, TAU); g.fill();
    }
  }
  g.strokeStyle = '#3E2A1C'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(x + 21 * s, y - 16 * s); g.lineTo(x + L * 0.98 + 44 * s, y - 30 * s); g.lineTo(x + L * 0.98 + 2.05 * dl + 44 * s, y - 36 * s); g.stroke();
  var sp2 = sleighC[Math.floor((ts / 80) % SL)];
  g.drawImage(sp2, x + sb.x0 * s, y + sb.y0 * s, (sb.x1 - sb.x0) * s, (sb.y1 - sb.y0) * s);
  frames.push(performance.now() - a);
  if (ts - start < ${SECONDS * 1000}) { requestAnimationFrame(frame); } else { window.__frames = frames; }
}
requestAnimationFrame(frame);
</script>`;

(async () => {
  const { chromium } = playwright();
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) { browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  page.on('pageerror', e => console.error('page error:', e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.setContent(PAGE);
  await page.waitForFunction(() => window.__frames, null, { timeout: (SECONDS + 30) * 1000 });
  const pre = await page.evaluate(() => window.__pre);
  const frames = await page.evaluate(() => window.__frames);
  const warm = frames.slice(30);   /* after the first half second: the JIT and the first paints */
  const sorted = frames.slice().sort((a, b) => a - b), sortedW = warm.slice().sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  console.log(`moon-edge cut, ${W}x${H} @ DPR ${DPR}, sprites at ${SPDP || DPR}x, ${POSES} poses, CPU x${THROTTLE}, ${SECONDS} s: ${frames.length} frames`);
  console.log(`  draw time per frame: median ${q(0.5).toFixed(2)} ms, p95 ${q(0.95).toFixed(2)} ms, p99 ${q(0.99).toFixed(2)} ms, worst ${sorted[sorted.length - 1].toFixed(2)} ms (worst after the first 30 frames: ${sortedW[sortedW.length - 1].toFixed(2)} ms)`);
  console.log(`  sprites: ${pre.sprites} (${pre.sw}x${pre.sh} device px each for the reindeer) = ${(pre.bytes / 1048576).toFixed(2)} MB; pre-draw ${pre.preMs.toFixed(0)} ms (throttled)`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
