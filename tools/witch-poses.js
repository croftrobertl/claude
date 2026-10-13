'use strict';
/**
 * DCC Seasons — the SHIPPED witch and moon (4.10.1, from engine.js) as a
 * close-up sheet: the moon large and at its phone and desktop sizes, on a
 * daytime page and on the navy footer; the witch's 12 riding frames large,
 * with her cape and hair hanging as they do in level flight; and the
 * silhouette she makes crossing the moon.
 *
 *   node tools/witch-poses.js "build/reels/Seasons - witch and moon 4.10.1.png"
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const OUT = path.resolve(process.argv[2] || 'build/reels/Seasons - witch and moon 4.10.1.png');
const ENGINE = fs.readFileSync(path.join(__dirname, '../dcc-seasons/assets/js/engine.js'), 'utf8');

(async () => {
  const { chromium } = playwright();
  let b;
  try { b = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) { b = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const p = await b.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1f2328;color:#e8e8e8;font:15px system-ui}
    h2{font-size:18px;margin:18px 16px 6px}.row{display:flex;gap:6px;padding:0 16px 8px;flex-wrap:wrap;align-items:flex-end}
    .c{display:flex;flex-direction:column;align-items:center}.c canvas{border-radius:4px}.c span{font-size:12px;color:#aab;padding:2px}
  </style><div id="root"></div><script>window.DCC_SEASONS={};${ENGINE}</script>`);
  const res = await p.evaluate(() => {
    const G = window.DCCSeasonsEngine.guide, Wt = G.witch, root = document.getElementById('root');
    function tile(row, bg, w, h, label, draw) {
      const c = document.createElement('div'); c.className = 'c';
      const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.background = bg;
      const g = cv.getContext('2d'); g.scale(2, 2); draw(g, w, h);
      const sp = document.createElement('span'); sp.textContent = label;
      c.appendChild(cv); c.appendChild(sp); row.appendChild(c);
    }
    const sec = t => { const h = document.createElement('h2'); h.textContent = t; root.appendChild(h); const r = document.createElement('div'); r.className = 'row'; root.appendChild(r); return r; };
    /* the moon */
    let r = sec('The moon — close-up, then phone (r 41) and desktop (r 53) at real size ×2, on the page and on the navy footer');
    tile(r, '#0d1830', 520, 520, 'close-up, night', (g, w, h) => { g.translate(w / 2, h / 2); G.moon(g, 165); });
    tile(r, '#f7f5ef', 520, 520, 'close-up, daytime page', (g, w, h) => { g.translate(w / 2, h / 2); G.moon(g, 165); });
    for (const [bg, nm] of [['#f7f5ef', 'page'], ['#13294b', 'footer']]) {
      tile(r, bg, 150, 150, 'phone, ' + nm, (g, w, h) => { g.translate(w / 2, h / 2); G.moon(g, 41); });
      tile(r, bg, 200, 200, 'desktop, ' + nm, (g, w, h) => { g.translate(w / 2, h / 2); G.moon(g, 53); });
    }
    /* the witch: frames with a resting cape and hair (level flight to the left) */
    for (const bg of ['#f7f5ef', '#13294b']) {
      r = sec(bg === '#13294b' ? 'Her riding cycle on the navy footer' : 'Her riding cycle, 12 frames, 4× (bristles flick, hat tip, skirt hem and the cat’s tail sway; cape and hair trail)');
      for (let i = 0; i < 12; i += (bg === '#13294b' ? 3 : 1)) {
        tile(r, bg, 230, 175, 'frame ' + i + '/12', (g, w, h) => { g.translate(w * 0.47, h * 0.66); g.scale(2, 2); Wt.still(g, i / 12); });
      }
    }
    /* at real size, and against the moon */
    r = sec('At real size (phone, 84 px wide) and crossing the moon, where she reads as a silhouette');
    tile(r, '#f7f5ef', 140, 100, 'real size', (g, w, h) => { g.translate(w * 0.47, h * 0.62); g.scale(0.84, 0.84); Wt.still(g, 0.2); });
    tile(r, '#f7f5ef', 260, 200, 'crossing the moon (desktop)', (g, w, h) => {
      g.translate(w / 2, h / 2); G.moon(g, 60);
      const s = document.createElement('canvas'); s.width = 400; s.height = 300; const sg = s.getContext('2d');
      sg.translate(200, 150); sg.rotate(0.45); sg.scale(0.84 * 2, 0.84 * 2); Wt.still(sg, 0.4);
      g.drawImage(s, -100 - 10, -75 + 5, 200, 150);
      const s2 = document.createElement('canvas'); s2.width = 400; s2.height = 300; const g2 = s2.getContext('2d');
      g2.drawImage(s, 0, 0); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#0B0910'; g2.fillRect(0, 0, 400, 300);
      g.save(); g.beginPath(); g.arc(0, 0, 60, 0, 6.2832); g.clip(); g.drawImage(s2, -110, -70, 200, 150); g.restore();
    });
    return { w: document.body.scrollWidth, h: document.body.scrollHeight };
  });
  await p.setViewportSize({ width: Math.max(1200, res.w), height: res.h });
  await p.screenshot({ path: OUT, fullPage: true });
  console.log(path.basename(OUT));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
