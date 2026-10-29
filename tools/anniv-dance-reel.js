'use strict';
/**
 * DCC Seasons — the Anniversary pair's dance at guest size on the REAL home
 * page (tests/real-theme), Rob's row 10 A placement (under the tagline,
 * centered, 8 px clear of the keep-clear set over the WHOLE dance, leaps
 * included). Every body frame is pre-drawn once, the way the engine will:
 * at guest size × min(DPR, 2) (the Director, 2026-10-29: as the heron, the
 * witch and the reindeer), both facings, then one drawImage per bird per frame
 * plus the live legs and shadow. Writes a frame strip, an MP4 (30 fps), and
 * the pre-draw time and bitmap memory.
 *
 *   node tools/anniv-dance-reel.js [--width=390] [--dpr=3] [--secs=11] [--name=...]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { open } = require('./harness');
const rt = require('./real-theme');
const { DC3_SRC, DANCE_SRC } = require('./anniv-crane3');
const { RIG } = require('./anniv-crane-rig');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('width', 390), DPR = +arg('dpr', 3), SECS = +arg('secs', 11), FPS = 30;
const NAME = arg('name', `Seasons - 4.13.5 anniversary dance ${W}`);
const B = path.join(__dirname, '..', 'build');
const TMP = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/dance-' + W;
const OFFSET = 2.25;   /* bird B's cycle starts this much later: they leap in turn */
const M = 8;

const LIB = `${DC3_SRC}
${DANCE_SRC}
window.RIG = ${JSON.stringify(RIG)};
window.L0 = [0.3, -0.954];
/* the whole dance's box for one bird facing +x, in bird units: every frame,
 * lifted to the top of the leap, plus the feet */
window.danceBox = function () {
  var F = window.FR || (window.FR = dcFrames(RIG)), b = [1e9, 1e9, -1e9, -1e9], c = document.createElement('canvas'), S = 300;
  c.width = c.height = 3 * S; var g = c.getContext('2d', { willReadFrequently: true });
  for (var t = 0; t < 5.4; t += 1 / 30) {
    var st = dcAt(F, t); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(S, 0, 0, S, 1.5 * S, 2.2 * S); dcDraw(g, F, st, L0[0], L0[1]);
    var d = g.getImageData(0, 0, c.width, c.height).data;
    for (var y = 0; y < c.height; y += 2) for (var x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 40) { var u = (x - 1.5 * S) / S, v = (y - 2.2 * S) / S; if (u < b[0]) b[0] = u; if (u > b[2]) b[2] = u; if (v < b[1]) b[1] = v; if (v > b[3]) b[3] = v; }
  }
  return b;
};
/* pre-draw every body frame at H px tall, DPR, for one facing; returns the
 * bitmaps, their boxes (bird units), the time and the memory */
window.preDraw = function (H, dpr, face) {
  var F = window.FR || (window.FR = dcFrames(RIG)), out = [], t0 = performance.now(), mem = 0, k = H * dpr;
  for (var i = 0; i < F.length; i++) {
    var U = {}; for (var q in F[i].U) { U[q] = F[i].U[q]; } U.noLegs = 1;
    /* the frame's own box: measured once on a scratch canvas at low res */
    var bb = window.frameBox(U, face);
    var cw = Math.ceil((bb[2] - bb[0]) * k) + 4, ch = Math.ceil((bb[3] - bb[1]) * k) + 4, c = document.createElement('canvas'); c.width = cw; c.height = ch;
    var g = c.getContext('2d'); g.setTransform(k * face, 0, 0, k, face > 0 ? (-bb[0] * k + 2) : (bb[2] * k + 2), -bb[1] * k + 2);
    dc3Paint(g, U, L0[0] * face, L0[1]);
    out.push({ c: c, box: face > 0 ? [bb[0] - 2 / k, bb[1] - 2 / k, bb[2] + 2 / k, bb[3] + 2 / k] : [-bb[2] - 2 / k, bb[1] - 2 / k, -bb[0] + 2 / k, bb[3] + 2 / k] });
    mem += cw * ch * 4;
  }
  out[0].c.getContext('2d').getImageData(0, 0, 1, 1);
  return { frames: out, ms: performance.now() - t0, mem: mem, n: F.length };
};
window.frameBox = function (U, face) {
  var S = 200, c = window._fb || (window._fb = document.createElement('canvas')); c.width = c.height = 3 * S;
  var g = c.getContext('2d', { willReadFrequently: true }); g.setTransform(S * face, 0, 0, S, 1.5 * S, 2.2 * S); dc3Paint(g, U, L0[0] * face, L0[1]);
  var d = g.getImageData(0, 0, c.width, c.height).data, b = [1e9, 1e9, -1e9, -1e9];
  for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 2) { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }
  /* back to the bird's frame, facing +x */
  var u0 = (b[0] - 1.5 * S) / S, u1 = (b[2] + 1 - 1.5 * S) / S, v0 = (b[1] - 2.2 * S) / S, v1 = (b[3] + 1 - 2.2 * S) / S;
  return face > 0 ? [u0, v0, u1, v1] : [-u1, v0, -u0, v1];
};`;

function sep(a, b) { return Math.max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3]); }

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  const ses = await open(rt.page({ extraHead: `<script>${LIB}</script>` }), { extra: rt.route, viewport: { width: W, height: W < 768 ? 844 : 900 }, dsf: DPR, ...rt.opts(W) });
  const pg = ses.page;
  await pg.waitForTimeout(1500);
  const keep = await rt.keepClear(pg);
  const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const db = await pg.evaluate(() => window.danceBox());
  /* place: the pair stands 1.1 H apart; as big as fits under the tagline */
  const tg = keep.tagline.reduce((m, b) => Math.max(m, b[3] - pic[1]), 0), floorY = pic[3] - 10;
  let H = Math.floor((floorY - (tg + M)) / -db[1]), xa, xb, clear, who;
  for (; H > 20; H--) {
    xa = pic[2] / 2 - 0.55 * H; xb = pic[2] / 2 + 0.55 * H;
    const boxes = [[xa + db[0] * H, floorY + db[1] * H, xa + db[2] * H, floorY + db[3] * H], [xb - db[2] * H, floorY + db[1] * H, xb - db[0] * H, floorY + db[3] * H]];
    clear = 1e9; who = '';
    for (const b of boxes) { for (const [k, list] of Object.entries(keep)) { for (const kb of list) { const s = sep(b, [kb[0] - pic[0], kb[1] - pic[1], kb[2] - pic[0], kb[3] - pic[1]]); if (s < clear) { clear = s; who = k; } } } }
    if (clear >= M && boxes.every(b => b[0] >= 0 && b[2] <= pic[2] && b[1] >= 0)) { break; }
  }
  /* pre-draw both facings and keep them on the page */
  const cost = await pg.evaluate(([H, dpr]) => { const a = window.preDraw(H, dpr, 1), b = window.preDraw(H, dpr, -1); window.PD = [a, b]; return { n: a.n, ms: +(a.ms + b.ms).toFixed(1), mem: a.mem + b.mem }; }, [H, Math.min(DPR, 2)]);
  console.log(W, 'H', H, 'clear', Math.round(clear), who, 'frames', cost.n, 'x2 facings, pre-draw', cost.ms, 'ms, memory', (cost.mem / 1048576).toFixed(2), 'MB');
  await pg.evaluate(([pic]) => {
    const host = document.querySelector('#header-image-main-inside'), c = document.createElement('canvas'); c.id = 'dclab';
    c.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'; host.appendChild(c);
    const dp = devicePixelRatio; c.width = pic[2] * dp; c.height = pic[3] * dp; c.style.width = pic[2] + 'px'; c.style.height = pic[3] + 'px';
  }, [pic]);
  const N = Math.round(SECS * FPS), strip = [];
  let drawMs = 0;
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    drawMs += await pg.evaluate(([t, H, xa, xb, floorY, off]) => {
      const c = document.getElementById('dclab'), g = c.getContext('2d'), dp = devicePixelRatio, F = window.FR, t0 = performance.now();
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
      /* fade in over the first 0.6 s and out over the last 0.8 */
      [[xa, 1, t, window.PD[0]], [xb, -1, t - off, window.PD[1]]].forEach(([x, f, tt, P]) => {
        const st = dcAt(F, Math.max(0, tt)), fr = P.frames[st.fi];
        g.setTransform(dp * H * f, 0, 0, dp * H, dp * x, dp * floorY);
        dcDraw(g, F, st, window.L0[0] * f, window.L0[1], fr.c, f > 0 ? fr.box : [-fr.box[2], fr.box[1], -fr.box[0], fr.box[3]]);
      });
      return performance.now() - t0;
    }, [t, H, xa, xb, floorY, OFFSET]);
    const buf = await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } });
    fs.writeFileSync(path.join(TMP, String(i).padStart(4, '0') + '.png'), buf);
    if (i % 15 === 0 && strip.length < 24) { strip.push([t, buf.toString('base64')]); }
  }
  await ses.close();
  const mp4 = path.join(B, NAME + '.mp4');
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(TMP, '%04d.png'), '-vf', `scale=${Math.min(W, 780) * 2}:-2:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4]);
  if (ff.status) { console.error(String(ff.stderr)); process.exit(1); }
  fs.writeFileSync(path.join(B, `.anniv-dance-${W}.json`), JSON.stringify({ W, H, clear: Math.round(clear), who, cost, drawMsPerFrame: +(drawMs / N).toFixed(2), strip }));
  console.log(mp4, 'draw per frame (both birds, live legs)', (drawMs / N).toFixed(2), 'ms');
})().catch(e => { console.error(e); process.exit(1); });
