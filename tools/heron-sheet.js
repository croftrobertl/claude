'use strict';
/**
 * DCC Seasons — the heron candidates as frame strips: 12 points through one
 * wingbeat plus the glide pose and the standing bird, for every style, large,
 * on a sky tile and a dark tile (the effects run over photos and the navy
 * footer), and times each style's draw call. This is the 4.8.0 candidate
 * round; Rob picked A, and the shipped bird is in engine.js — render it
 * with tools/heron-poses.js.
 *
 *   node tools/heron-sheet.js "build/reels/Seasons - heron poses.png" [scale]
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const OUT = path.resolve(process.argv[2] || 'build/reels/Seasons - heron poses.png');
const SCALE = +(process.argv[3] || 3);
const LAB = fs.readFileSync(path.join(__dirname, 'heron-lab.js'), 'utf8');
const ENGINE = fs.readFileSync(path.join(__dirname, '../dcc-seasons/assets/js/engine.js'), 'utf8');

(async () => {
  const { chromium } = playwright();
  let b;
  try { b = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) { b = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const p = await b.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1f2328;color:#e8e8e8;font:15px system-ui}
    h2{font-size:18px;margin:18px 16px 6px}.row{display:flex;gap:4px;padding:0 16px 8px;flex-wrap:nowrap}
    .c{display:flex;flex-direction:column;align-items:center}.c canvas{border-radius:4px}.c span{font-size:12px;color:#aab;padding:2px}
  </style><div id="root"></div><script>${LAB}</script><script>window.DCC_SEASONS={};${ENGINE}</script>`);
  const res = await p.evaluate(async (S) => {
    const L = window.HeronLab, root = document.getElementById('root');
    const W = 112 * S, H = 118 * S;
    function tile(bg, label, draw) {
      const c = document.createElement('div'); c.className = 'c';
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.background = bg;
      const g = cv.getContext('2d'); g.translate(W * 0.5, H * 0.6); draw(g);
      const sp = document.createElement('span'); sp.textContent = label;
      c.appendChild(cv); c.appendChild(sp); return c;
    }
    const phases = []; for (let i = 0; i < 12; i++) { phases.push(i / 12); }
    const times = {};
    for (const st of L.STYLES) {
      const h = document.createElement('h2'); h.textContent = L.NAMES[st]; root.appendChild(h);
      for (const bg of ['#9fc3df', '#13294b']) {
        const row = document.createElement('div'); row.className = 'row';
        phases.forEach(ph => row.appendChild(tile(bg, 'beat ' + ph.toFixed(2), g => L.drawFlying(g, L.beatPose(ph), st, 100 * S * 0.9))));
        row.appendChild(tile(bg, 'glide', g => L.drawFlying(g, L.GLIDE, st, 100 * S * 0.9)));
        row.appendChild(tile(bg, 'standing', g => { g.translate(0, -H * 0.05); L.drawStanding(g, st, 60 * S * 0.75); }));
        root.appendChild(row);
      }
      /* cost of one draw at the engine's size (100px), in a real 2D context */
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; const g = cv.getContext('2d');
      const t0 = performance.now(); let n = 0;
      while (performance.now() - t0 < 400) { g.setTransform(1, 0, 0, 1, 200, 150); L.drawFlying(g, L.beatPose((n % 60) / 60), st, 100); n++; }
      times[st] = (performance.now() - t0) / n;
    }
    return { times, w: document.body.scrollWidth, h: document.body.scrollHeight };
  }, SCALE);
  await p.setViewportSize({ width: Math.max(1200, res.w), height: res.h });
  await p.screenshot({ path: OUT, fullPage: true });
  console.log(JSON.stringify({ out: path.basename(OUT), msPerDraw: Object.fromEntries(Object.entries(res.times).map(([k, v]) => [k, +v.toFixed(4)])) }));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
