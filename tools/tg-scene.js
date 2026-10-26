'use strict';
/**
 * DCC Seasons — Thanksgiving step 1: the scene options on the REAL home page
 * (tests/real-theme/), at 390, 768, 1280 and 1440, each walked across and
 * kept 8px clear of the title's letters, the tagline, the menu bar, the dial
 * and the menu button. Stills only: live Thanksgiving is untouched until Rob
 * picks.
 *
 *   node tools/tg-scene.js            (writes build/.tg-scene.json)
 *
 * The crane and the harvest moon are the engine's own painters (crPaint,
 * moonPaint graded as harvestGet grades it); the turkey is TURKEY_SRC from
 * tools/tg-pieces.js when it exists.
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');

const ROOT = path.resolve(__dirname, '..');
const ENG = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
function block(a, b) { const i = ENG.indexOf(a), j = ENG.indexOf(b, i); if (i < 0 || j < 0) { throw new Error('missing ' + a); } return ENG.slice(i, j); }
function fnBlock(name) {
  const i = ENG.indexOf('function ' + name + '('); let d = 0, j = ENG.indexOf('{', i);
  for (; j < ENG.length; j++) { if (ENG[j] === '{') { d++; } else if (ENG[j] === '}') { d--; if (!d) { break; } } }
  return ENG.slice(i, j + 1);
}
let TURKEY = '';
try { TURKEY = require('./tg-pieces').TURKEY_SRC || ''; } catch (e) { TURKEY = ''; }
const PAINT = [
  'var W = window, D = document, MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, mn = MT.min, mx2 = MT.max, atan2 = MT.atan2, sqrt = MT.sqrt;',
  'function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); } function lerp(a, b, t) { return a + (b - a) * t; }',
  block('var MARIA = [', 'function moonPaint('), fnBlock('moonPaint'),
  block('var CR_FR = 12;', 'var WITCH_BOX'),
  `function harvest(g, r) { moonPaint(g, r); g.globalCompositeOperation = 'source-atop';
    var gr = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r); gr.addColorStop(0, 'rgba(255,146,54,0.72)'); gr.addColorStop(0.7, 'rgba(232,105,20,0.78)'); gr.addColorStop(1, 'rgba(190,74,16,0.86)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over'; }`,
  TURKEY,
].join('\n');

const M = 8;
const WIDTHS = [390, 768, 1280, 1440];
const OPTS = {
  A: { title: 'A — The Harvest Moon, High and Small', why: 'Today’s story kept whole and moved clear, the way Rob’s Santa pick works: the burnt-orange moon and the V of five both shrink into the band of trees between the menu bar and the title, and the cranes cross the moon’s face and turn dark against it. Tavares: the full moon nearest the autumn equinox is the harvest moon, and Florida sandhill cranes fly to their roosts at dusk all year.' },
  B: { title: 'B — No Moon: The Skein Comes In Low Over the Canal', why: 'The V of five at full size, flying level under the tagline over the canal, the way cranes come in to roost: they spend the night standing in shallow water. No moon, so nothing turns dark. Tavares: each November the migrant greater sandhill cranes arrive from the north to winter in Lake County and join the Florida birds that live here all year.' },
  C: { title: 'C — No Moon: A Wild Turkey Hen and Her Poults', why: 'The Thanksgiving bird itself, as it lives here: an Osceola wild turkey hen leads three poults along the bank under the tagline. Tavares: the Osceola is the wild turkey found only on the Florida peninsula, and it is common in Lake County’s woods along the water.' },
};

const LAB = String.raw`
function sep(a, b) { var dx = mx2(a[0] - b[2], b[0] - a[2]), dy = mx2(a[1] - b[3], b[1] - a[3]); return dx > 0 && dy > 0 ? sqrt(dx * dx + dy * dy) : mx2(dx, dy); }
/* the V's birds, relative to its leader, flying right */
function vee(n, L) { var out = [], half = (n - 1) / 2; for (var i = 0; i < n; i++) { var k = i - half, d = abs(k); out.push([-d * L * 0.80, (k < 0 ? -1 : 1) * d * L * 0.30]); } return out; }
function veeBoxes(x, y, n, L) { return vee(n, L).map(function (p) { return [x + p[0] + CR_BOX[0] * L, y + p[1] + CR_BOX[1] * L, x + p[0] + CR_BOX[2] * L, y + p[1] + CR_BOX[3] * L]; }); }
function drawVee(g, x, y, n, L, ph, moon) {
  vee(n, L).forEach(function (p, i) {
    var bx = x + p[0], by = y + p[1], w = ((ph + i * 0.17) % 1 + 1) % 1;
    g.save(); g.translate(bx, by); crPaint(g, L, w, false); g.restore();
    if (moon) { g.save(); g.beginPath(); g.arc(moon.x, moon.y, moon.r, 0, TAU); g.clip(); g.translate(bx, by); crPaint(g, L, w, true); g.restore(); }
  });
}
`;

(async () => {
  const report = {}, shots = {};
  for (const w of WIDTHS) {
    const ses = await open(rt.page(), { viewport: { width: w, height: 900 }, extra: rt.route, dsf: 2 });
    const pg = ses.page;
    await pg.waitForTimeout(1200);
    await pg.addScriptTag({ content: PAINT + LAB });
    const keep = await rt.keepClear(pg);
    const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    const clean = (await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } })).toString('base64');
    const r = await pg.evaluate(({ keep, pic, M, hasT }) => {
      const [pl, pt, PW, PH] = pic, K = [];
      for (const [name, bs] of Object.entries(keep)) { for (const b of bs) { K.push({ name, b: [b[0] - pl, b[1] - pt, b[2] - pl, b[3] - pt] }); } }
      const s = Math.max(PW / 1080, PH / 810), waterY = (PH - 810 * s) / 2 + 395 * s;
      const menuB = Math.max(...K.filter(k => /menu/.test(k.name)).map(k => k.b[3]));
      const titleTop = Math.min(...K.filter(k => k.name === 'title').map(k => k.b[1]));
      const tagB = Math.max(...K.filter(k => k.name === 'tagline').map(k => k.b[3]));
      const kL = Math.min(Math.max(PW / 390, 0.82), 1.3), fullL = Math.round(34 * kL), fullR = Math.round(58 * kL);
      function clearOf(boxes) { let m = 1e9, who = ''; for (const b of boxes) { if (b[2] < 0 || b[0] > PW) { continue; } for (const k of K) { const d = sep(b, k.b); if (d < m) { m = d; who = k.name; } } } return { m: Math.round(m), who }; }
      function walkVee(n, L, y) {
        const span = 1.6 * L + 1.4 * L; let worst = { m: 1e9, who: '' };
        for (let i = 0; i <= 200; i++) { const x = -0.7 * L + (PW + span) * i / 200; const c = clearOf(veeBoxes(x, y, n, L)); if (c.m < worst.m) { worst = c; } }
        return worst;
      }
      const out = { waterY: Math.round(waterY), fullL, fullR, opts: {} };
      /* A: the band between the menu bar and the title */
      {
        const bt = menuB + M, bb = titleTop - M, h = bb - bt;
        const L = Math.min(fullL, Math.floor(h / 2.08)), R = Math.min(fullR, Math.floor(h / 2) - 1);
        const y = Math.round(bt + 0.6 * L + 0.52 * L), mo = { x: Math.round(Math.min(PW - R - 12, PW * 0.72)), y: Math.round(bt + h / 2), r: R };
        const moonBox = [mo.x - R * 1.05, mo.y - R * 1.05, mo.x + R * 1.05, mo.y + R * 1.05];
        out.opts.A = { L, mo, y, n: 5, pct: Math.round(100 * L / fullL), mpct: Math.round(100 * R / fullR), path: walkVee(5, L, y), moon: clearOf([moonBox]), moonWater: Math.round(waterY - (mo.y + R)), xs: [mo.x - 0.2 * L, mo.x + 1.6 * L] };
      }
      /* B: full size, level under the tagline */
      {
        let L = fullL; const top = tagB + M;
        while (L > 10 && top + 2.08 * L > PH - 4) { L--; }
        const y = Math.round(top + 0.6 * L + 0.52 * L);
        out.opts.B = { L, y, n: 5, pct: Math.round(100 * L / fullL), path: walkVee(5, L, y), xs: [PW * 0.35, PW * 0.62] };
      }
      /* C: the hen and poults on the bank under the tagline */
      if (hasT) {
        const top = tagB + M, room = PH - 6 - top, H = Math.min(Math.round(80 * kL), room);
        const foot = PH - 6;
        const birds = (x) => [[x, foot, H, 1], [x + 0.85 * H, foot, H * 0.46, 0], [x + 1.3 * H, foot, H * 0.44, 0], [x + 1.75 * H, foot, H * 0.46, 0]];
        const boxes = x => birds(x).map(([bx, by, h]) => [bx - 0.62 * h, by - h, bx + 0.42 * h, by]);
        let worst = { m: 1e9 };
        for (let i = 0; i <= 200; i++) { const x = -2.2 * H + (PW + 2.8 * H) * i / 200; const c = clearOf(boxes(x)); if (c.m < worst.m) { worst = c; } }
        out.opts.C = { H, foot, path: worst, xs: [PW * 0.42, PW * 0.66] };
      }
      return out;
    }, { keep, pic, M, hasT: !!TURKEY });
    report[w] = r;
    shots[w] = { clean };
    for (const [name, o] of Object.entries(r.opts)) {
      shots[w][name] = [];
      for (const x of o.xs) {
        await pg.evaluate(({ name, o, x, keep, pic, map }) => {
          const host = document.querySelector('#header-image-main-inside'), pr = host.getBoundingClientRect();
          let c = document.getElementById('tgx');
          if (!c) { c = document.createElement('canvas'); c.id = 'tgx'; c.style.cssText = 'position:absolute;left:0;top:0;z-index:2147483000;pointer-events:none'; host.appendChild(c); }
          c.width = pr.width * 2; c.height = pr.height * 2; c.style.width = pr.width + 'px'; c.style.height = pr.height + 'px';
          const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
          if (name === 'A') { g.save(); g.translate(o.mo.x, o.mo.y); harvest(g, o.mo.r); g.restore(); drawVee(g, x, o.y, o.n, o.L, 0.3, o.mo); }
          if (name === 'B') { drawVee(g, x, o.y, o.n, o.L, 0.3, null); }
          if (name === 'C') { [[x, o.foot, o.H, 1], [x + 0.85 * o.H, o.foot, o.H * 0.46, 0], [x + 1.3 * o.H, o.foot, o.H * 0.44, 0], [x + 1.75 * o.H, o.foot, o.H * 0.46, 0]].forEach((b, i) => { g.save(); g.translate(b[0], b[1]); g.scale(b[2], b[2]); tkPaint(g, b[3] ? 'hen' : 'poult', i * 0.3); g.restore(); }); }
          if (map) {
            const col = { title: '#E53935', tagline: '#FB8C00', menu: '#1E88E5', menuFixed: '#1E88E5', dial: '#8E24AA', menuButton: '#43A047' };
            for (const [k, bs] of Object.entries(keep)) { for (const b of bs) { g.strokeStyle = col[k]; g.lineWidth = 2; g.strokeRect(b[0] - pic[0], b[1] - pic[1], b[2] - b[0], b[3] - b[1]); } }
            g.fillStyle = 'rgba(255,255,255,.22)'; g.strokeStyle = '#fff'; g.lineWidth = 1;
            const band = name === 'C' ? [o.foot - o.H, o.foot] : [o.y - 0.6 * o.L + (-0.52) * o.L, o.y + 0.6 * o.L + 0.36 * o.L];
            g.fillRect(0, band[0], pr.width, band[1] - band[0]); g.strokeRect(0, band[0], pr.width, band[1] - band[0]);
          }
        }, { name, o, x, keep, pic, map: false });
        shots[w][name].push((await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } })).toString('base64'));
      }
      await pg.evaluate(({ name, o, keep, pic }) => window.__noop, { name, o, keep, pic });
      console.log(w, name, JSON.stringify({ L: o.L, H: o.H, pct: o.pct, mpct: o.mpct, path: o.path, moon: o.moon, moonWater: o.moonWater }));
    }
    await ses.close();
  }
  fs.writeFileSync(path.join(ROOT, 'build', '.tg-scene.json'), JSON.stringify({ report, shots, OPTS }));
  const im = (b64, w) => `<img src="data:image/png;base64,${b64}" style="width:${w}px;display:block;border:1px solid #D9CDB6;border-radius:3px">`;
  const disp = { 390: 250, 768: 400, 1280: 560, 1440: 560 };
  const line = (n, w) => { const o = report[w].opts[n]; if (!o) { return ''; }
    if (n === 'A') { return `team ${o.pct}% of today’s size, moon ${o.mpct}%; nearest the ${o.path.who} at ${o.path.m}px, the moon ${o.moon.m}px from the ${o.moon.who}, ${o.moonWater}px above the water`; }
    if (n === 'B') { return `team at ${o.pct}% of today’s size; nearest the ${o.path.who} at ${o.path.m}px`; }
    return `hen ${o.H}px tall; nearest the ${o.path.who} at ${o.path.m}px`; };
  const sec = n => `<section><h2>${OPTS[n].title}</h2><p class="note">${OPTS[n].why}</p>${[390, 768, 1280, 1440].map(w => shots[w][n] ? `<h3>${w}</h3><p class="cap">${line(n, w)}</p><div class="row">${shots[w][n].map(b => im(b, disp[w])).join('')}</div>` : '').join('')}</section>`;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
    h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 4px;text-align:center} h3{font-size:13px;margin:12px 0 2px;text-align:center}
    .sub,.note{color:#555;margin:0 auto 10px;max-width:1000px} .cap{color:#666;text-align:center;margin:0 0 4px} section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
    .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}</style>
    <h1>Seasons — Thanksgiving: Three Scenes on the Real Home Page</h1>
    <p class="sub">Today’s scene, the V of cranes over the harvest moon, crosses the title and the menu bar on the real home page at every width. Three ways to keep the season’s moment clear of the title’s letters, the tagline, the menu bar, the dial and the menu button, walked across every width with an 8px margin, drawn on the page captured from the live site. Two have no moon. Nothing is painted into the photograph. Live Thanksgiving stays exactly as it is until Rob picks.</p>
    ${['A', 'B', 'C'].map(sec).join('')}`;
  const ses2 = await open(html, { viewport: { width: 1200, height: 900 }, dsf: 2 });
  await ses2.page.waitForTimeout(500);
  await ses2.page.setViewportSize({ width: 1200, height: await ses2.page.evaluate(() => document.body.scrollHeight) });
  await ses2.page.screenshot({ path: path.join(ROOT, 'build', 'Seasons - 4.13.2 thanksgiving scenes.png') });
  await ses2.close(); console.log('scene sheet: ok');
})().catch(e => { console.error(e); process.exit(1); });
