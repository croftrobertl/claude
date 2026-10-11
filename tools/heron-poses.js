'use strict';
/**
 * DCC Seasons — the SHIPPED heron (4.9.0, style A, from engine.js) as a
 * pose sheet: 12 points through the wingbeat, the glide, the landing (legs
 * lowering, the flare) and the standing bird, large, on a sky tile and a
 * dark tile. Also times one fresh draw against one cached drawImage.
 *
 *   node tools/heron-poses.js "build/reels/Seasons - heron poses 4.9.0.png" [scale]
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const OUT = path.resolve(process.argv[2] || 'build/reels/Seasons - heron poses 4.9.0.png');
const SCALE = +(process.argv[3] || 3);
const ENGINE = fs.readFileSync(path.join(__dirname, '../dcc-seasons/assets/js/engine.js'), 'utf8');

(async () => {
  const { chromium } = playwright();
  let b;
  try { b = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) { b = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const p = await b.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1f2328;color:#e8e8e8;font:15px system-ui}
    h2{font-size:18px;margin:18px 16px 6px}.row{display:flex;gap:4px;padding:0 16px 8px;flex-wrap:wrap}
    .c{display:flex;flex-direction:column;align-items:center}.c canvas{border-radius:4px}.c span{font-size:12px;color:#aab;padding:2px}
  </style><div id="root"></div><script>window.DCC_SEASONS={};${ENGINE}</script>`);
  const res = await p.evaluate(async (S) => {
    const H = window.DCCSeasonsEngine.guide.heron, root = document.getElementById('root');
    const W = 128 * S, Ht = 118 * S;
    function tile(bg, label, draw, h) {
      const c = document.createElement('div'); c.className = 'c';
      const cv = document.createElement('canvas'); cv.width = W; cv.height = h || Ht; cv.style.background = bg;
      const g = cv.getContext('2d'); g.translate(W * 0.47, (h || Ht) * 0.55); g.scale(S, S); draw(g);
      const sp = document.createElement('span'); sp.textContent = label;
      c.appendChild(cv); c.appendChild(sp); return c;
    }
    const fly = (key, legs, pitch) => g => { g.rotate(pitch || 0); g.translate(0, H.pose(key).bob); H.legs(g, legs || 0); H.fly(g, H.pose(key)); };
    for (const bg of ['#9fc3df', '#13294b']) {
      const h = document.createElement('h2'); h.textContent = bg === '#9fc3df' ? 'Wingbeat, glide and landing — on sky' : 'The same on the navy footer'; root.appendChild(h);
      const row = document.createElement('div'); row.className = 'row';
      for (let i = 0; i < 24; i += 2) { row.appendChild(tile(bg, 'beat ' + i + '/24', fly('b' + i))); }
      row.appendChild(tile(bg, 'glide', fly('g6')));
      row.appendChild(tile(bg, 'gliding in, legs lowering', fly('g6', 0.5, 0.06)));
      row.appendChild(tile(bg, 'legs down', fly('g6', 1, 0.12)));
      row.appendChild(tile(bg, 'flare', fly('f', 1, 0.32)));
      row.appendChild(tile(bg, 'standing', g => { g.translate(0, 40); H.stand(g); }, Ht * 1.15));
      row.appendChild(tile(bg, 'take-off', fly('b2', 0.7, 0.2)));
      root.appendChild(row);
    }
    /* cost: one fresh draw vs one drawImage of a cached pose, at 96px, DPR 2 */
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; const g = cv.getContext('2d');
    let n = 0, t0 = performance.now();
    while (performance.now() - t0 < 400) { g.setTransform(1.92, 0, 0, 1.92, 200, 150); H.legs(g, 0); H.fly(g, H.pose('b' + (n % 24))); n++; }
    const fresh = (performance.now() - t0) / n;
    const bd = H.bounds('b4'), c2 = document.createElement('canvas'); c2.width = (bd[2] - bd[0]) * 1.92; c2.height = (bd[3] - bd[1]) * 1.92;
    const g2 = c2.getContext('2d'); g2.setTransform(1.92, 0, 0, 1.92, -bd[0] * 1.92, -bd[1] * 1.92); H.fly(g2, H.pose('b4'));
    n = 0; t0 = performance.now();
    while (performance.now() - t0 < 400) { g.setTransform(2, 0, 0, 2, 0, 0); g.save(); g.scale(0.96, 0.96); H.legs(g, 0); g.restore(); g.drawImage(c2, 50, 40, c2.width / 2, c2.height / 2); n++; }
    const cached = (performance.now() - t0) / n;
    return { fresh, cached, w: document.body.scrollWidth, h: document.body.scrollHeight };
  }, SCALE);
  await p.setViewportSize({ width: Math.max(1200, res.w), height: res.h });
  await p.screenshot({ path: OUT, fullPage: true });
  console.log(JSON.stringify({ out: path.basename(OUT), msFresh: +res.fresh.toFixed(4), msCached: +res.cached.toFixed(4) }));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
