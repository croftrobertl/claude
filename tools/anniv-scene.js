'use strict';
/**
 * DCC Seasons — the Anniversary scene on the REAL home page (the fixture
 * captured from live, tests/real-theme/), at 390, 768, 1280 and 1440:
 * the pair of sandhill cranes from tools/anniv-crane.js dancing in the
 * canal's shallows, kept clear of the title's letters, the tagline, the
 * menu bar, the dial and the menu button by the 8px margin, in every
 * pose of the dance. Stills only; Rob picks the placement.
 *
 *   node tools/anniv-scene.js      (writes build/.anniv-scene.json)
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');
const { DC_SRC, POSES } = require('./anniv-crane');

const M = 8;
const W = [390, 768, 1280, 1440];
/* the three moments, each bird's pose and how high it is off the water */
const MOMENTS = [
  { name: 'they meet and call', a: ['stand', 0], b: ['call', 0] },
  { name: 'one springs up', a: ['leap', 0.10], b: ['call', 0] },
  { name: 'both wings open', a: ['call', 0], b: ['leap', 0.22] },
];
const OPTS = {
  A: 'In the shallows under the tagline, centered',
  B: 'In the shallows beside the title, larger, on the left',
};

const PAGE_JS = `${DC_SRC}
window.__poses = ${JSON.stringify(Object.fromEntries(Object.entries(POSES).map(([k, v]) => [k, v.P])))};
/* a pose's painted box, in units, measured from its pixels */
window.__box = function (name) {
  var c = document.createElement('canvas'), S = 200; c.width = c.height = 4 * S;
  var g = c.getContext('2d'); g.translate(2 * S, 3 * S); g.scale(S, S); dcPaint(g, __poses[name]);
  var d = g.getImageData(0, 0, c.width, c.height).data, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [(x0 - 2 * S) / S, (y0 - 3 * S) / S, (x1 + 1 - 2 * S) / S, (y1 + 1 - 3 * S) / S];
};
window.__draw = function (birds, map) {
  var host = document.querySelector('#header-image-main-inside'), r = host.getBoundingClientRect();
  var c = document.getElementById('dccAnLab');
  if (!c) { c = document.createElement('canvas'); c.id = 'dccAnLab'; c.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'; host.appendChild(c); }
  var dp = devicePixelRatio; c.width = r.width * dp; c.height = r.height * dp; c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  var g = c.getContext('2d'); g.scale(dp, dp);
  birds.forEach(function (b) { g.save(); g.translate(b.x, b.y); g.scale(b.H * b.face, b.H); dcPaint(g, __poses[b.pose]); g.restore(); });
  if (map) {
    g.lineWidth = 1.5;
    map.boxes.forEach(function (b) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); g.strokeStyle = '#fff'; g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); });
    var col = { title: '#E53935', tagline: '#FB8C00', menu: '#1E88E5', menuFixed: '#1E88E5', dial: '#8E24AA', menuButton: '#43A047' };
    Object.keys(map.keep).forEach(function (k) { map.keep[k].forEach(function (b) { g.strokeStyle = col[k]; g.lineWidth = 2; g.strokeRect(b[0] - r.left, b[1] - r.top, b[2] - b[0], b[3] - b[1]); }); });
  }
};`;

function sep(a, b) {
  const dx = Math.max(b[0] - a[2], a[0] - b[2]), dy = Math.max(b[1] - a[3], a[1] - b[3]);
  return dx > 0 || dy > 0 ? Math.max(dx, dy) : Math.max(dx, dy);
}

(async () => {
  const shots = {}, report = {};
  for (const w of W) {
    const ses = await open(rt.page({ extraHead: `<script>${PAGE_JS}</script>` }), { extra: rt.route, viewport: { width: w, height: 900 }, dsf: 2 });
    const pg = ses.page;
    await pg.waitForTimeout(1500);
    const keep = await rt.keepClear(pg);
    const pic0 = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    const clean = (await pg.screenshot({ clip: { x: pic0[0], y: pic0[1], width: pic0[2], height: pic0[3] } })).toString('base64');
    const boxes = {};
    for (const k of Object.keys(POSES)) { boxes[k] = await pg.evaluate(n => window.__box(n), k); }
    const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    const flat = Object.values(keep).flat().map(b => [b[0] - pic[0], b[1] - pic[1], b[2] - pic[0], b[3] - pic[1]]);
    const tg = keep.tagline.reduce((m, b) => Math.max(m, b[3] - pic[1]), 0);
    const tl = keep.title.reduce((m, b) => Math.min(m, b[0] - pic[0]), 1e9);
    const floorY = pic[3] - 10;
    /* every box the pair paints over the whole dance, for a placement */
    function place(opt) {
      let H, xa, xb;
      const up = Math.max(...MOMENTS.flatMap(m => [m.a, m.b].map(([p, lift]) => -boxes[p][1] + lift)));
      if (opt === 'A') {
        H = Math.floor((floorY - (tg + M)) / up);
        xa = w / 2 - 0.55 * H; xb = w / 2 + 0.55 * H;
      } else {
        if (w < 1024) { return null; }
        H = Math.min(120, Math.floor((floorY - 90) / up));
        const room = tl - M;
        for (; H > 40; H--) { const span = 1.1 * H + 0.65 * H * 2; if (span <= room - 16) { break; } }
        xa = 16 + 0.65 * H; xb = xa + 1.1 * H;
      }
      const all = [];
      const frames = MOMENTS.map(m => {
        const birds = [{ pose: m.a[0], x: xa, y: floorY - m.a[1] * H, H, face: 1 }, { pose: m.b[0], x: xb, y: floorY - m.b[1] * H, H, face: -1 }];
        const bx = birds.map(b => { const u = boxes[b.pose]; return b.face > 0 ? [b.x + u[0] * b.H, b.y + u[1] * b.H, b.x + u[2] * b.H, b.y + u[3] * b.H] : [b.x - u[2] * b.H, b.y + u[1] * b.H, b.x - u[0] * b.H, b.y + u[3] * b.H]; });
        all.push(...bx);
        return { birds, bx };
      });
      let clear = 1e9, who = '';
      for (const b of all) { for (const [k, list] of Object.entries(keep)) { for (const kb of list) { const s = sep(b, [kb[0] - pic[0], kb[1] - pic[1], kb[2] - pic[0], kb[3] - pic[1]]); if (s < clear) { clear = s; who = k; } } } }
      const inPic = all.every(b => b[0] >= 0 && b[2] <= pic[2] && b[1] >= 0 && b[3] <= pic[3]);
      return { H, frames, all, clear: Math.round(clear), who, inPic };
    }
    report[w] = {};
    shots[w] = { clean };
    for (const opt of Object.keys(OPTS)) {
      const P = place(opt);
      if (!P) { report[w][opt] = { none: true }; continue; }
      report[w][opt] = { H: P.H, clear: P.clear, who: P.who, inPic: P.inPic };
      shots[w][opt] = [];
      for (const f of P.frames) {
        await pg.evaluate(b => window.__draw(b), f.birds);
        shots[w][opt].push((await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } })).toString('base64'));
      }
      await pg.evaluate(([b, m]) => window.__draw(b, m), [P.frames[1].birds, { boxes: P.all, keep }]);
      shots[w][opt + 'map'] = (await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } })).toString('base64');
      console.log(w, opt, JSON.stringify(report[w][opt]));
    }
    await ses.close();
  }
  fs.writeFileSync(path.join(__dirname, '..', 'build', '.anniv-scene.json'), JSON.stringify({ report, shots, MOMENTS, OPTS }));
  /* the sheet */
  const im = (b64, w) => `<img src="data:image/png;base64,${b64}" style="width:${w}px;display:block;border:1px solid #D9CDB6;border-radius:3px">`;
  const disp = { 390: 260, 768: 420, 1280: 700, 1440: 760 };
  const optSec = (o, title, why) => `<section><h2>${title}</h2><p class="note">${why}</p>${W.map(w => {
    const r = report[w][o];
    if (r.none) { return `<h3>${w}</h3><p class="note" style="text-align:center">${w}px has no room beside the title, so this width shows A.</p>`; }
    return `<h3>${w} — birds ${r.H}px tall standing; nearest the ${r.who === 'menuButton' ? 'menu button' : r.who} at ${r.clear}px</h3><div class="row">${shots[w][o].map((b, i) => `<figure>${im(b, disp[w] * (w < 1000 ? 1 : 0.5))}<figcaption>${MOMENTS[i].name}</figcaption></figure>`).join('')}</div>
      <div class="row" style="margin-top:6px"><figure>${im(shots[w][o + 'map'], disp[w] * (w < 1000 ? 1 : 0.75))}<figcaption>every box the dance paints (white) against the keep-clear set</figcaption></figure></div>`;
  }).join('')}</section>`;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
    h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 4px;text-align:center} h3{font-size:13px;margin:12px 0 4px;text-align:center}
    .sub,.note{color:#555;margin:0 auto 10px;max-width:980px} section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
    .row{display:flex;gap:10px;justify-content:center;align-items:flex-start;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#666;margin-top:3px}</style>
    <h1>Seasons — The Anniversary: Where the Pair Dances</h1>
    <p class="sub">Drawn on the real home page, captured from the live site, at 390, 768, 1280 and 1440. The pair stands at the foot of the picture: on a phone and a tablet that is the canal’s shallows, where sandhill cranes wade; on a computer the photograph is cropped higher and it is the bank by the boardwalk. Nothing is painted into the photograph: no ripples, no reflections. Every pose of the dance is boxed and kept at least 8px from the title’s letters, the tagline, the menu bar, the dial and the menu button. The dance in three moments: they meet and call, one springs up, both wings open. Rob picks A or B; there is no moon.</p>
    ${optSec('A', 'A — Under the Tagline, Centered', 'The same picture at every width: the pair dances centered in the band between the tagline and the bottom of the header. The band is about 110px tall everywhere, so the birds are 62–78px tall standing.')}
    ${optSec('B', 'B — Beside the Title, Larger', 'From 1024px up there is room left of the title: the pair dances there at up to 120px tall, closer to the size the photographs show them. Phones and tablets have no room beside the title and show A.')}`;
  const ses = await open(html, { viewport: { width: 1200, height: 900 }, dsf: 2 });
  await ses.page.waitForTimeout(500);
  await ses.page.setViewportSize({ width: 1200, height: await ses.page.evaluate(() => document.body.scrollHeight) });
  await ses.page.screenshot({ path: path.join(__dirname, '..', 'build', 'Seasons - 4.13.1 anniversary scene.png') });
  await ses.close();
  console.log('scene sheet: ok');
})().catch(e => { console.error(e); process.exit(1); });
