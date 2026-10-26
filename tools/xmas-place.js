'use strict';
/**
 * DCC Seasons — where Santa's team can fly on the REAL header (the
 * Director, 2026-10-25: on staging the moon sat on the title at 390, the
 * team crossed the tagline at 768 and rode the menu bar at 1440).
 *
 * Rob's rule: nothing of a scene over the title's letters, the tagline,
 * the menu bar, the dial or the menu button, at any width; and no moon on
 * the water (the authenticity rule). Where no width has room at full size
 * Rob chooses between options from stills; this renders them.
 *
 * Everything is drawn with the ENGINE's own painters (read out of
 * engine.js) on the real-theme fixture (tests/real-theme/). For each
 * option and width it walks the whole crossing (200 steps), boxes every
 * animal and the sleigh at every step, and reports the closest any part
 * comes to a keep-clear box (negative = overlap), shrinking the team only
 * as far as the option needs.
 *
 *   node tools/xmas-place.js   -> build/Seasons - 4.14.1 christmas placement.png + .json
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const ENG = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
function block(a, b) { const i = ENG.indexOf(a), j = ENG.indexOf(b, i); if (i < 0 || j < 0) { throw new Error('missing ' + a); } return ENG.slice(i, j); }
function fnBlock(name) {
  const i = ENG.indexOf('function ' + name + '('); let d = 0, j = ENG.indexOf('{', i);
  for (; j < ENG.length; j++) { if (ENG[j] === '{') { d++; } else if (ENG[j] === '}') { d--; if (!d) { break; } } }
  return ENG.slice(i, j + 1);
}
const PAINT = [
  'var W = window, D = document, MT = Math, TAU = MT.PI * 2, sin = MT.sin, cos = MT.cos, abs = MT.abs, mn = MT.min, mx2 = MT.max, atan2 = MT.atan2, sqrt = MT.sqrt;',
  'function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); } function lerp(a, b, t) { return a + (b - a) * t; }',
  block('var MARIA = [', 'function moonPaint('), fnBlock('moonPaint'),
  block('/* ---- 4.14.0 Christmas: Santa, the sleigh and the team', 'var ART_DRAW = {'),
].join('\n');

/* the scene's geometry, the engine's own numbers (sledRig, SD_BOX, SL_BOX) */
const LAB = String.raw`
var SD_BOX = [-53, -75, 64, 53], SL_BOX = [-57, -70, 57, 29];
function parts(L) {
  var dl = L * 0.5, out = [];
  for (var i = 0; i < 4; i++) {
    var pair = (i / 2) | 0, far = i % 2 === 1;
    out.push({ x: L * 0.98 + pair * 2.05 * dl + (far ? 0.55 * dl : 0), y: -0.06 * dl * pair - L * 0.02 - (far ? 0.30 * dl : 0), sc: far ? 0.9 : 1, far: far, pair: pair, i: i });
  }
  return out;
}
/* every box the rig paints, in picture px, for the sleigh at (x, y) */
function rigBoxes(x, y, L, dir, rot) {
  var dl = L * 0.5, k = dl / 60, s = L / 100, ca = cos(rot), sa = sin(rot), out = [];
  function add(lx, ly, b, sc) {
    var xs = [], ys = [];
    [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].forEach(function (c) {
      var px = lx + c[0] * sc, py = ly + c[1] * sc;
      xs.push(x + dir * (px * ca - py * sa)); ys.push(y + px * sa + py * ca);
    });
    out.push([mn.apply(0, xs), mn.apply(0, ys), mx2.apply(0, xs), mx2.apply(0, ys)]);
  }
  parts(L).forEach(function (q) { add(q.x, q.y, SD_BOX, k * q.sc); });
  add(0, 0, SL_BOX, s);
  return out;
}
function rig(g, x, y, L, dir, rot, ph0, moon) {
  var dl = L * 0.5, k = dl / 60, s = L / 100, P = parts(L);
  function T() { g.translate(x, y); if (dir < 0) { g.scale(-1, 1); } g.rotate(rot); }
  for (var j = P.length - 1; j >= 0; j--) {
    var q = P[j], ph = ((ph0 + j * 0.25) % 1 + 1) % 1;
    g.save(); T(); g.translate(q.x, q.y); g.scale(k * q.sc, k * q.sc); rdPaint(g, 60, ph, false, q.far, false); g.restore();
    if (moon) {
      g.save(); g.beginPath(); g.arc(moon.x, moon.y, moon.r, 0, TAU); g.clip();
      T(); g.translate(q.x, q.y); g.scale(k * q.sc, k * q.sc); rdPaint(g, 60, ph, true, q.far, false); g.restore();
    }
    if (q.pair === 1 && !q.far) { g.save(); T(); g.translate(q.x, q.y); g.scale(k, k); rdGlow(g, ph); g.restore(); }
  }
  var R = [[21 * s, -16.5 * s, 0]];
  for (var i = 0; i < 4; i += 2) { R.push([P[i].x + 44 * k, P[i].y - 30 * k, 8 * k + i * k]); }
  g.save(); T(); g.strokeStyle = '#3E2A1C'; g.lineWidth = mx2(1, 1.4 * s); g.lineCap = 'round'; snReins(g, R, -1, 0); g.restore();
  g.save(); T(); g.scale(s, s); snSack(g); snSleigh(g); snSanta(g, 0); g.restore();
}
function sep(a, b) {   /* gap between two boxes; negative when they overlap */
  var dx = mx2(a[0] - b[2], b[0] - a[2]), dy = mx2(a[1] - b[3], b[1] - a[3]);
  return dx > 0 && dy > 0 ? sqrt(dx * dx + dy * dy) : mx2(dx, dy);
}
`;

const M = 8;                 /* the margin kept clear around every box, px */
const FULL = w => Math.round(78 * Math.min(Math.max(w / 390, 0.82), 1.3));   /* the engine's sleigh length */
const FULLR = w => Math.round(54 * Math.min(Math.max(w / 390, 0.82), 1.3));  /* and its moon */

module.exports = { PAINT, LAB, M, FULL, FULLR };
if (require.main === module && !process.argv.includes('--sheet')) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = {};
  const shots = {};
  for (const W of [390, 768, 1280, 1440]) {
    const ses = await open(rt.page(), { viewport: { width: W, height: 460 }, extra: rt.route, dsf: 2 });
    const pg = ses.page;
    await pg.waitForTimeout(800);
    await pg.addScriptTag({ content: PAINT + LAB });
    const keep = await rt.keepClear(pg);
    const r = await pg.evaluate(({ keep, W, M, FULLL, FULLR }) => {
      const pic = document.getElementById('header-image-main-inside').getBoundingClientRect();
      const H = pic.height, picTop = pic.top;
      /* keep-clear boxes in the PICTURE's px, with the margin */
      const K = [];
      for (const [name, boxes] of Object.entries(keep)) { for (const b of boxes) { K.push({ name, b: [b[0] - pic.left - M, b[1] - picTop - M, b[2] - pic.left + M, b[3] - picTop + M] }); } }
      /* the photo: 1080x810, cover, centered; its waterline is 395/810 down */
      const s = Math.max(W / 1080, H / 810), waterY = (H - 810 * s) / 2 + 395 * s;
      const menuB = Math.max(...K.filter(k => /menu/.test(k.name)).map(k => k.b[3]));
      const tl = K.filter(k => k.name === 'title').map(k => k.b), tg = K.filter(k => k.name === 'tagline').map(k => k.b);
      const titleTop = Math.min(...tl.map(b => b[1])), titleL = Math.min(...tl.map(b => b[0])), titleR = Math.max(...tl.map(b => b[2]));
      const tagB = Math.max(...tg.map(b => b[3]));
      function clearOf(boxes) { let m = 1e9, who = ''; for (const b of boxes) { for (const k of K) { const d = sep(b, k.b); if (d < m) { m = d; who = k.name; } } } return { m, who }; }
      function moonOK(mo) {
        const b = [mo.x - mo.r * 1.05, mo.y - mo.r * 1.05, mo.x + mo.r * 1.05, mo.y + mo.r * 1.05];
        const c = clearOf([b]);
        return { clear: c.m + M, who: c.who, water: waterY - (mo.y + mo.r), inPic: mo.x - mo.r >= 0 && mo.x + mo.r <= W && mo.y - mo.r >= 0 };
      }
      /* walk a crossing: at(u) gives the sleigh's place and the rig's angle */
      function walk(L, dir, at) {
        let worst = { m: 1e9, who: '', u: 0 };
        for (let i = 0; i <= 200; i++) {
          const u = i / 200, p = at(u), bx = rigBoxes(p.x, p.y, L, dir, p.rot);
          const onPic = bx.filter(b => b[2] > 0 && b[0] < W && b[3] > 0 && b[1] < H);
          const c = clearOf(onPic);
          if (c.m < worst.m) { worst = { m: c.m, who: c.who, u }; }
        }
        return { clear: Math.round(worst.m + M), who: worst.who, at: worst.u };   /* the closest any part comes to a box, beyond nothing */
      }
      const out = { W, H, waterY: Math.round(waterY), menuB: Math.round(menuB + M), titleTop: Math.round(titleTop + M), titleL: Math.round(titleL + M), titleR: Math.round(titleR - M), tagB: Math.round(tagB - M), fullL: FULLL, fullR: FULLR, opts: {} };
      const dir = 1;
      /* the FULL-SIZE scene as 4.14.0 shipped it, for the record */
      {
        const L = FULLL, R = FULLR, my = Math.round(Math.max(H * 0.24, R + 12)), mx = Math.round(W * 0.66);
        const mo = { x: mx, y: my, r: R }, ahead = L * 2.9, behind = L * 0.62;
        const at = u => ({ x: -ahead + (W + behind + ahead) * u, y: my + R * 0.26 - Math.sin(u * Math.PI) * R * 0.12, rot: -0.06 });
        out.opts.shipped = { L, mo, mc: moonOK(mo), path: walk(L, dir, at), at: 'level', mid: (mx - 2.0 * L + ahead) / (W + behind + ahead) };
      }
      /* A — HIGH AND SMALL: moon and team in the band between the menu bar and the title */
      {
        const bt = menuB, bb = titleTop, h = bb - bt;
        const R = Math.max(10, Math.floor(h / 2) - 1), L = Math.min(FULLL, Math.floor((h - 2) / 1.16));
        const my = Math.round(bt + h / 2), mx = Math.round(Math.min(W - R - 12, W * 0.74));
        const mo = { x: mx, y: my, r: R }, ahead = L * 2.9, behind = L * 0.62, ay = my + 0.16 * L;
        const at = u => ({ x: -ahead + (W + behind + ahead) * u, y: ay, rot: 0 });
        out.opts.A = { L, mo, mc: moonOK(mo), path: walk(L, dir, at), mid: (mx - 2.0 * L + ahead) / (W + behind + ahead), ay };
      }
      /* (A climb out of the canal across a moon beside the title was tried
       * first and fails at every width down to 40%: the team is ~2.9 sleigh
       * lengths long and must rise ~165px inside the side band.) */
      /* the moon in the trees BESIDE the title, as large as the canopy allows
       * above the water: shared by B and C */
      const xl = titleR, xr = W - 6, yt = menuB, yb = waterY - 6;
      const sideR = Math.max(0, Math.min(FULLR, Math.floor((xr - xl) / 2) - 3, Math.floor((yb - yt) / 2) - 3));
      const sideMoon = { x: Math.round((xl + xr) / 2), y: Math.round(yt + sideR + 2), r: sideR };
      /* B — THE MOON IN THE TREES, THE TEAM HIGH: the small team crosses
       * above the title and in front of the moon's upper half */
      {
        const bt = menuB, bb = titleTop, h = bb - bt, L = Math.min(FULLL, Math.floor((h - 2) / 1.16));
        const mo = sideMoon, ahead = L * 2.9, behind = L * 0.62, ay = bt + h / 2 + 0.16 * L;
        const at = u => ({ x: -ahead + (W + behind + ahead) * u, y: ay, rot: 0 });
        out.opts.B = mo.r >= 14 ? { L, mo, mc: moonOK(mo), path: walk(L, dir, at), mid: (mo.x - 2.0 * L + ahead) / (W + behind + ahead), ay, crosses: ay - 0.74 * L < mo.y + mo.r && ay + 0.42 * L > mo.y - mo.r }
          : { none: true, why: `no room for a moon beside the title above the water (${Math.round(xr - xl)} x ${Math.round(yb - yt)} px)` };
      }
      /* C — THE TEAM LOW OVER THE CANAL, FULL SIZE: level under the tagline,
       * the moon in the trees beside the title; the team does not cross it */
      {
        let best = null;
        for (let f = 1; f >= 0.5 && !best; f -= 0.02) {
          const L = Math.round(FULLL * f), ay = tagB + M + 0.74 * L;
          if (ay + 0.42 * L > H + 2) { continue; }
          const ahead = L * 2.9, behind = L * 0.62;
          const at = u => ({ x: -ahead + (W + behind + ahead) * u, y: ay, rot: 0 });
          const w = walk(L, dir, at);
          if (w.clear >= M) { best = { L, mo: sideMoon, mc: moonOK(sideMoon), path: w, mid: 0.5, ay, crosses: false }; }
        }
        out.opts.C = best && sideMoon.r >= 14 ? best : { none: true, why: sideMoon.r < 14 ? `no room for a moon beside the title above the water` : 'no clear level run under the tagline' };
      }
      return out;
    }, { keep, W, M, FULLL: FULL(W), FULLR: FULLR(W) });
    report[W] = r;
    /* the stills: each option mid-crossing, drawn on an overlay over the picture */
    shots[W] = {};
    for (const name of ['shipped', 'A', 'B', 'C']) {
      const o = r.opts[name];
      if (!o || o.none) { continue; }
      for (const map of [false, true]) {
        await pg.evaluate(({ o, name, W, map, r, keep, M }) => {
          let c = document.getElementById('xp');
          const pic = document.getElementById('header-image-main-inside');
          const pr = pic.getBoundingClientRect();
          if (!c) { c = document.createElement('canvas'); c.id = 'xp'; c.style.cssText = 'position:absolute;left:0;top:0;z-index:2147483000;pointer-events:none'; pic.appendChild(c); }
          c.width = pr.width * 2; c.height = pr.height * 2; c.style.width = pr.width + 'px'; c.style.height = pr.height + 'px';
          const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, pr.width, pr.height);
          const mo = o.mo;
          g.save(); g.translate(mo.x, mo.y); moonPaint(g, mo.r); g.restore();
          const dir = 1, L = o.L, ahead = L * 2.9;
          let x, y, rot = 0;
          if (name === 'B') {
            const th = o.deg * Math.PI / 180, lead = 2.0 * L;
            const cx = mo.x - lead * Math.cos(th), cy = mo.y + lead * Math.sin(th);
            x = cx; y = cy; rot = -th;
          } else if (name === 'shipped') { x = mo.x - 2.0 * L; y = mo.y + mo.r * 0.26 - mo.r * 0.12; rot = -0.06; }
          else if (name === 'C') { x = W * 0.5 - 1.2 * L; y = o.ay; }
          else { x = mo.x - 2.0 * L; y = o.ay; }
          if (map) {
            /* the map: every box the crossing paints, faint, and the keep-clear set */
            g.lineWidth = 1;
            for (let i = 0; i <= 60; i++) {
              const u = i / 60;
              let px, py, pr2 = 0;
              if (name === 'B') {
                const th = o.deg * Math.PI / 180, x0 = -ahead, x1 = W + L;
                px = x0 + (x1 - x0) * u; const e = Math.min(1, Math.max(0, (px - o.xa + 0.6 * L) / (1.2 * L))), ee = e * e * (3 - 2 * e);
                py = px < o.xa ? o.yLow : o.yLow - (px - o.xa) * Math.tan(th); pr2 = -th * ee;
              } else if (name === 'shipped') { px = -ahead + (W + L * 0.62 + ahead) * u; py = mo.y + mo.r * 0.26 - Math.sin(u * Math.PI) * mo.r * 0.12; pr2 = -0.06; }
              else { px = -ahead + (W + L * 0.62 + ahead) * u; py = o.ay; }
              g.strokeStyle = 'rgba(255,255,255,.35)';
              rigBoxes(px, py, L, dir, pr2).forEach(b => g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]));
            }
            const COL = { title: '#ff3030', tagline: '#ff9a00', menu: '#2f7bff', menuFixed: '#2f7bff', dial: '#a040ff', menuButton: '#20c040' };
            g.lineWidth = 2;
            for (const [n, boxes] of Object.entries(keep)) { for (const b of boxes) { g.strokeStyle = COL[n]; g.strokeRect(b[0] - pr.left, b[1] - pr.top, b[2] - b[0], b[3] - b[1]); } }
            g.strokeStyle = '#00e5ff'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, r.waterY); g.lineTo(W, r.waterY); g.stroke(); g.setLineDash([]);
          }
          rig(g, x, y, L, dir, rot, 0.3, mo);
        }, { o, name, W, map, r, keep, M });
        shots[W][name + (map ? 'map' : '')] = (await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: Math.round(r.H) } })).toString('base64');
      }
    }
    await ses.close();
  }
  fs.writeFileSync(path.join(OUT, 'Seasons - 4.14.1 christmas placement.json'), JSON.stringify(report, null, 1));
  /* print the table */
  for (const W of Object.keys(report)) {
    const r = report[W];
    console.log(`\n${W}px  picture ${r.H}px tall · water from y ${r.waterY} · clear band above the title y ${r.menuB}-${r.titleTop} (${r.titleTop - r.menuB}px) · title x ${r.titleL}-${r.titleR} · full size: sleigh ${r.fullL}, moon r ${r.fullR}`);
    for (const [n, o] of Object.entries(r.opts)) {
      if (o.none) { console.log(`  ${n.padEnd(8)} not possible: ${o.why}`); continue; }
      console.log(`  ${n.padEnd(8)} team ${Math.round(100 * o.L / r.fullL)}% (sleigh ${o.L}px), moon r ${o.mo.r} (${Math.round(100 * o.mo.r / r.fullR)}%) at ${o.mo.x},${o.mo.y}` +
        ` · moon clear by ${Math.round(o.mc.clear)}px (nearest: ${o.mc.who}), ${o.mc.water >= 0 ? 'above the water by ' + Math.round(o.mc.water) + 'px' : 'ON THE WATER by ' + Math.round(-o.mc.water) + 'px'}` +
        ` · team clear by ${o.path.clear}px (nearest: ${o.path.who})${o.deg ? ` · climb ${o.deg}°` : ''}${o.crosses === false ? ' · DOES NOT CROSS THE MOON' : ''}`);
    }
  }
  fs.writeFileSync(path.join(OUT, '.xp-shots.json'), JSON.stringify(shots));
})().catch(e => { console.error(e); process.exit(1); });

/* ---- the sheet for Rob, from the last run's stills and numbers ---------
 *   node tools/xmas-place.js --sheet */
if (require.main === module && process.argv.includes('--sheet')) {
  (async () => {
    const R = JSON.parse(fs.readFileSync(path.join(OUT, 'Seasons - 4.14.1 christmas placement.json'), 'utf8'));
    const S = JSON.parse(fs.readFileSync(path.join(OUT, '.xp-shots.json'), 'utf8'));
    const img = (W, k, w) => S[W] && S[W][k] ? `<img src="data:image/png;base64,${S[W][k]}" style="width:${w}px;display:block;border:1px solid #D9CDB6;border-radius:3px">` : '<div style="padding:30px;color:#999">not possible at this width</div>';
    const pct = (a, b) => Math.round(100 * a / b) + '%';
    const cell = (W, n) => {
      const r = R[W], o = r.opts[n];
      if (!o || o.none) { return `<td colspan="4"><i>${o ? o.why : '—'}</i></td>`; }
      return `<td>${pct(o.L, r.fullL)} (${o.L}px sleigh)</td><td>r ${o.mo.r} (${pct(o.mo.r, r.fullR)})</td><td>${o.mc.clear >= 7 ? o.mc.clear.toFixed(1) + 'px clear' : '<b>over by ' + Math.round(-o.mc.clear) + 'px</b>'}; ${o.mc.water >= 0 ? Math.round(o.mc.water) + 'px above the water' : '<b>on the water</b>'}</td><td>${o.path.clear >= 7 ? o.path.clear + 'px clear' : '<b>over by ' + (-o.path.clear) + 'px</b>'} (nearest: ${o.path.who === 'menuButton' ? 'menu button' : o.path.who})${o.crosses === false ? '; does not cross the moon' : ''}</td>`;
    };
    const table = `<table><tr><th>width</th><th>option</th><th>team</th><th>moon</th><th>the moon against the keep-clear set and the water</th><th>the team over the whole crossing</th></tr>` +
      [390, 768, 1280, 1440].map(W => ['shipped', 'A', 'B', 'C'].map((n, i) => `<tr${i === 0 ? ' class="top"' : ''}><td>${i === 0 ? W : ''}</td><td>${n === 'shipped' ? '4.14.0 as built' : n}</td>${cell(W, n)}</tr>`).join('')).join('') + '</table>';
    const css = `body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
      h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 6px;text-align:center} h3{font-size:13px;margin:10px 0 4px;text-align:center}
      .sub,.note{color:#555;margin:0 auto 12px;max-width:1000px} section{border-top:1px solid #E3D9C6;padding:14px 0 10px}
      .row{display:flex;gap:14px;justify-content:center;align-items:flex-start;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#666;margin-top:4px}
      table{border-collapse:collapse;margin:8px auto;font-size:12px} td,th{border-bottom:1px solid #E3D9C6;padding:3px 8px;vertical-align:top} th{text-align:center} tr.top td{border-top:2px solid #cbbd9f}`;
    const opt = (n, title, why) => `<section><h2>${title}</h2><p class="note">${why}</p>
      <div class="row"><figure>${img(390, n, 300)}<figcaption>390</figcaption></figure><figure>${img(768, n, 560)}<figcaption>768</figcaption></figure></div>
      <div class="row" style="margin-top:10px"><figure>${img(1440, n, 1060)}<figcaption>1440</figcaption></figure></div>
      <h3>Where It Flies — Every Box the Crossing Paints (White) Against the Keep-Clear Set</h3>
      <div class="row"><figure>${img(390, n + 'map', 300)}<figcaption>390</figcaption></figure><figure>${img(768, n + 'map', 560)}<figcaption>768</figcaption></figure></div>
      <div class="row" style="margin-top:10px"><figure>${img(1440, n + 'map', 1060)}<figcaption>1440</figcaption></figure></div></section>`;
    const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
      <h1>Seasons — Where Santa Flies on the Real Home Page</h1>
      <p class="sub">On staging the Director found 4.14.0's scene over the real title at 390, the tagline at 768 and the menu bar at 1440: my test page had none of them where the site has them. These stills are drawn on the real home page, captured from the live site, with the engine's own drawings. Rob's rule: nothing of a scene over the title's letters, the tagline, the menu bar, the dial or the menu button, at any width, and no moon on the water. The picture is canal and trees: the water starts about 200px down at every width, and the title fills the middle of the canopy above it, so the full-size scene fits nowhere. Three ways to make room follow. Every crossing was walked in 200 steps, with every reindeer and the sleigh boxed at each step and kept at least 8px from every box in the set (the moon's round edge at least 7px). The red nose and the cut at the moon's edge are as Rob picked them. Rob picks one.</p>
      <section><h2>4.14.0 as Built — Why It Has to Change</h2><p class="note">The moon and the team at full size cross the menu bar and the title at every width.</p>
        <div class="row"><figure>${img(390, 'shippedmap', 300)}<figcaption>390</figcaption></figure><figure>${img(768, 'shippedmap', 560)}<figcaption>768</figcaption></figure></div>
        <div class="row" style="margin-top:10px"><figure>${img(1440, 'shippedmap', 1060)}<figcaption>1440</figcaption></figure></div></section>
      ${opt('A', 'A — High and Small', 'The moon and the team both shrink to fit the band of trees between the menu bar and the title, and the team crosses the moon there, dark inside the disc as picked. It keeps the whole story, but the band is only 41–60px tall, so the team is 58% of full size on a phone and a third of it at 1440, and the moon shrinks with it.')}
      ${opt('B', 'B — The Moon in the Trees, the Team High', 'The moon goes in the trees beside the title, as large as the canopy allows above the water (three-quarters of full size on a computer). The small team from A crosses above the title and in front of the moon\'s upper half, so it still turns dark against it. A phone has almost no room beside the title, so there the moon is small, tucked at the right under the menu bar.')}
      ${opt('C', 'C — Full Size, Low Over the Canal', 'The team flies at full size, level, below the tagline over the canal\'s reflection, as seasonal art over the photograph; the moon hangs in the trees beside the title, as in B. The team never crosses the moon, so nothing turns dark. This is the only way the team keeps its size. It shares the band under the tagline with the front-door wreath (wreath option B), so those two cannot both be picked.')}
      <section><h2>The Numbers, at All Four Widths</h2>${table}
        <p class="note">A climb out of the canal across a moon beside the title was tried first: it fails at every width down to 40% of full size, because the team is almost three sleigh-lengths long and must rise about 165px within the room beside the title. The staging boxes the Director measured sit 13–15px above the live ones; the 8px margin plus his re-check on staging covers that.</p></section>`;
    const ses = await open(html, { viewport: { width: 1200, height: 900 }, dsf: 2 });
    await ses.page.waitForTimeout(600);
    await ses.page.setViewportSize({ width: 1200, height: await ses.page.evaluate(() => document.body.scrollHeight) });
    await ses.page.screenshot({ path: path.join(OUT, 'Seasons - 4.14.1 christmas placement.png') });
    await ses.close();
    console.log('sheet: ok');
  })().catch(e => { console.error(e); process.exit(1); });
}
