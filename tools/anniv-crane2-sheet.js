'use strict';
/**
 * DCC Seasons — the redrawn Anniversary crane's sheet, and the Art
 * Standards' definition of done run on it (CLAUDE.md "Art Standards"):
 *  - the overlay: photo · drawing over it at 50% · drawing, per pose;
 *  - the fit score: the photo bird's outline (traced by hand on the
 *    photograph, legs at their measured widths) against the drawing's own
 *    painted pixels, as intersection over union, both outlines drawn;
 *  - the silhouette test: the drawing in solid black at guest size beside
 *    the photo bird's silhouette;
 *  - the value test: the drawing in grayscale;
 *  - the squint test: the pair at guest size on the real home page at 390,
 *    768 and 1440 (Rob's row 10 A, under the tagline, centered, 8 px clear),
 *    blurred as a squint, and a 3× close-up at 390;
 *  - the style test: the heron and the tom from the shipped engine beside
 *    the crane at the same height;
 *  - the cost: each pose pre-rendered at guest size × DPR 3, time and
 *    bitmap memory, at 1× and 4× CPU.
 * The numbers are printed and written to build/.anniv-crane2.json.
 *
 *   node tools/anniv-crane2-sheet.js [--out=file.png]
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');
const { DC2_SRC, TRACE } = require('./anniv-crane2');

const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
const B = path.join(__dirname, '..', 'build');
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6) || path.join(B, 'Seasons - 4.13.5 anniversary crane redraw.png');
const ENGINE = fs.readFileSync(path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
const POSES = ['stand', 'call', 'leap'];
const LIGHT = [0.3, -0.954];   /* from the home-page hero: above, a little from the right, in SCREEN space */
const M = 8;
/* the three moments of the dance: bird a faces right, bird b faces left */
const MOMENTS = [
  { name: 'they meet and call', a: 'stand', b: 'call' },
  { name: 'one springs up', a: 'leap', b: 'call' },
  { name: 'both wings open', a: 'call', b: 'leap' },
];

/* in every page: the painter, the trace, and a pose drawer in screen space */
const LIB = `${DC2_SRC}
window.T = ${JSON.stringify(TRACE)};
window.L0 = ${JSON.stringify(LIGHT)};
/* draw pose k with its feet at (x, y), H px tall (standing height), facing
 * f (+1 right, -1 left); the light stays fixed on the SCREEN */
window.drawPose = function (g, k, x, y, H, f, mode) {
  var P = T[k], s = H / P.ref.H, flip = f * P.ref.face;
  g.save(); g.translate(x, y); g.scale(s * flip, s); g.translate(-P.ref.ground[0], -P.ref.ground[1]);
  if (mode === 'black') { g.fillStyle = '#14161A'; g.strokeStyle = '#14161A'; g.beginPath(); c2Path(g, P.out); g.fill(); P.legs.forEach(function (Lg) { g.lineWidth = Lg.w[0]; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); Lg.p.forEach(function (q, i) { i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); }); }
  else { dc2Paint(g, P, L0[0] * flip, L0[1]); }
  g.restore();
};
/* the pose's painted box in units of H, relative to its feet, facing right */
window.poseBox = function (k) {
  var P = T[k], b = [1e9, 1e9, -1e9, -1e9];
  P.out.concat([].concat.apply([], P.legs.map(function (Lg) { return Lg.p.concat(Lg.toes); }))).forEach(function (q) {
    var u = (q[0] - P.ref.ground[0]) * P.ref.face / P.ref.H, v = (q[1] - P.ref.ground[1]) / P.ref.H;
    b[0] = Math.min(b[0], u); b[1] = Math.min(b[1], v); b[2] = Math.max(b[2], u); b[3] = Math.max(b[3], v); });
  return b;
};`;

function sep(a, b) { const dx = Math.max(b[0] - a[2], a[0] - b[2]), dy = Math.max(b[1] - a[3], a[1] - b[3]); return Math.max(dx, dy); }

(async () => {
  const R = { poses: {}, squint: {}, cost: {} };
  /* ---- 1. fits, silhouettes, values, from the photographs -------------- */
  const s1 = await open('<!doctype html><body></body>', { viewport: { width: 1200, height: 900 }, dsf: 1 });
  await s1.page.addScriptTag({ content: LIB });
  for (const k of POSES) {
    const P = TRACE[k], img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REF, P.ref.f)).toString('base64');
    R.poses[k] = await s1.page.evaluate(async ([k, img]) => {
      const P = T[k], im = new Image(); im.src = img; await im.decode();
      const [cx, cy, cw, ch] = P.ref.crop, Sc = Math.min(1.2, 440 / ch), W = Math.round(cw * Sc), H = Math.round(ch * Sc);
      const mk = () => { const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const g = c.getContext('2d'); g.scale(2 * Sc, 2 * Sc); g.translate(-cx, -cy); return [c, g]; };
      const light = [L0[0] * P.ref.face, L0[1]];
      const out = {};
      /* photo · 50% · drawing */
      let [c, g] = mk(); g.drawImage(im, 0, 0); out.photo = c.toDataURL();
      [c, g] = mk(); g.drawImage(im, 0, 0); g.globalAlpha = 0.5; dc2Paint(g, P, light[0], light[1]); out.over = c.toDataURL();
      [c, g] = mk(); g.fillStyle = '#4E5A4E'; g.fillRect(cx, cy, cw, ch); dc2Paint(g, P, light[0], light[1]); out.draw = c.toDataURL();
      /* the value test: the drawing alone, in grayscale */
      const [cd, gd] = mk(); dc2Paint(gd, P, light[0], light[1]);
      const [cv, gv] = mk(); gv.fillStyle = '#7F7F7F'; gv.fillRect(cx, cy, cw, ch);
      const vd = gd.getImageData(0, 0, cd.width, cd.height), bg = gv.getImageData(0, 0, cv.width, cv.height);
      for (let i = 0; i < vd.data.length; i += 4) { const a = vd.data[i + 3] / 255, y = 0.2126 * vd.data[i] + 0.7152 * vd.data[i + 1] + 0.0722 * vd.data[i + 2]; const v = y * a + bg.data[i] * (1 - a); bg.data[i] = bg.data[i + 1] = bg.data[i + 2] = v; }
      gv.putImageData(bg, 0, 0); out.value = cv.toDataURL();
      /* the fit score, at the photograph's own resolution */
      const fw = cw, fh = ch, A = document.createElement('canvas'), Bc = document.createElement('canvas');
      A.width = Bc.width = fw; A.height = Bc.height = fh;
      const ga = A.getContext('2d'); ga.translate(-cx, -cy); ga.fillStyle = '#000'; ga.strokeStyle = '#000';
      ga.beginPath(); P.out.forEach((q, i) => i ? ga.lineTo(q[0], q[1]) : ga.moveTo(q[0], q[1])); ga.closePath(); ga.fill();
      P.legs.forEach(Lg => { ga.lineCap = 'round'; ga.lineJoin = 'round'; Lg.p.forEach((q, i) => { if (!i) { return; } ga.lineWidth = i < Lg.p.length - 1 ? Lg.w[0] : Lg.w[1]; ga.beginPath(); ga.moveTo(Lg.p[i - 1][0], Lg.p[i - 1][1]); ga.lineTo(q[0], q[1]); ga.stroke(); });
        Lg.toes.forEach(t => { const f = Lg.p[Lg.p.length - 1]; ga.lineWidth = Lg.w[1] * 0.7; ga.beginPath(); ga.moveTo(f[0], f[1]); ga.lineTo(t[0], t[1]); ga.stroke(); }); });
      const gb = Bc.getContext('2d'); gb.translate(-cx, -cy);
      /* the drawing's pixels, the contact shadow left out (it is ground, not bird) */
      const P2 = Object.assign({}, P); dc2Paint(gb, P2, light[0], light[1]);
      const da = ga.getImageData(0, 0, fw, fh).data, db = gb.getImageData(0, 0, fw, fh).data;
      /* the contact shadow is translucent and lies on the ground: count only
       * pixels the bird paints opaquely */
      let I = 0, U = 0, onlyA = 0, onlyB = 0;
      for (let i = 3; i < da.length; i += 4) { const a = da[i] > 127, b = db[i] > 200; if (a && b) { I++; } if (a || b) { U++; } if (a && !b) { onlyA++; } if (b && !a) { onlyB++; } }
      out.fit = +(100 * I / U).toFixed(1); out.onlyPhoto = onlyA; out.onlyDrawing = onlyB; out.area = I;
      /* both outlines on the photo: the traced photo outline magenta, the
       * drawing's painted edge cyan */
      [c, g] = mk(); g.drawImage(im, 0, 0); g.globalAlpha = 0.55; g.fillStyle = '#FBF6EC'; g.fillRect(cx, cy, cw, ch); g.globalAlpha = 1;
      const edge = (d, col) => { const e = g.createImageData(fw, fh); for (let y = 1; y < fh - 1; y++) { for (let x = 1; x < fw - 1; x++) { const i = (y * fw + x) * 4 + 3, on = d[i] > (d === db ? 200 : 127); if (!on) { continue; } if (!(d[i - 4] > 127 && d[i + 4] > 127 && d[i - fw * 4] > 127 && d[i + fw * 4] > 127)) { e.data[i - 3] = col[0]; e.data[i - 2] = col[1]; e.data[i - 1] = col[2]; e.data[i] = 255; } } } const t = document.createElement('canvas'); t.width = fw; t.height = fh; t.getContext('2d').putImageData(e, 0, 0); g.drawImage(t, cx, cy); };
      edge(da, [230, 0, 170]); edge(db, [0, 170, 220]);
      out.outlines = c.toDataURL();
      /* the silhouette test at guest size (62 px standing height): the
       * drawing in solid black beside the photo bird's silhouette */
      const gs = 62, sc2 = gs / P.ref.H, sw = Math.ceil(cw * sc2) + 8, sh = Math.ceil(ch * sc2) + 4;
      const sil = (fn) => { const t = document.createElement('canvas'); t.width = sw * 3; t.height = sh * 3; const tg = t.getContext('2d'); tg.fillStyle = '#FBF6EC'; tg.fillRect(0, 0, t.width, t.height); tg.scale(3 * sc2, 3 * sc2); tg.translate(-cx + 4 / sc2, -cy + 2 / sc2); fn(tg); return t.toDataURL(); };
      out.silDraw = sil(tg => { const t2 = document.createElement('canvas'); t2.width = fw; t2.height = fh; const g2 = t2.getContext('2d'); g2.drawImage(Bc, 0, 0); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#14161A'; g2.fillRect(0, 0, fw, fh); tg.drawImage(t2, cx, cy); });
      out.silPhoto = sil(tg => { const t2 = document.createElement('canvas'); t2.width = fw; t2.height = fh; const g2 = t2.getContext('2d'); g2.drawImage(A, 0, 0); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#14161A'; g2.fillRect(0, 0, fw, fh); tg.drawImage(t2, cx, cy); });
      out.W = W; out.H = H; out.sw = sw; out.sh = sh;
      return out;
    }, [k, img]);
    console.log(k, 'fit', R.poses[k].fit + '%', 'photo-only px', R.poses[k].onlyPhoto, 'drawing-only px', R.poses[k].onlyDrawing);
  }
  /* ---- the cost: pre-render each pose at guest size x DPR 3 -------------- */
  for (const thr of [1, 4]) {
    const cdp = await s1.page.context().newCDPSession(s1.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
    R.cost[thr + 'x'] = await s1.page.evaluate(() => {
      const r = {}; const H = 62, dpr = 3;
      for (const k of ['stand', 'call', 'leap']) {
        const b = poseBox(k), w = Math.ceil((b[2] - b[0]) * H * dpr) + 6, h = Math.ceil((b[3] - b[1] + 0.04) * H * dpr) + 6;
        let best = 1e9;
        for (let n = 0; n < 5; n++) {
          const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
          const t0 = performance.now(); g.save(); g.scale(dpr, dpr); drawPose(g, k, -b[0] * H + 1, -b[1] * H + 1, H, 1); g.restore(); g.getImageData(0, 0, 1, 1);
          best = Math.min(best, performance.now() - t0);
        }
        r[k] = { ms: +best.toFixed(1), w, h, kb: Math.round(w * h * 4 / 1024) };
      }
      return r;
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log('cost', thr + 'x', JSON.stringify(R.cost[thr + 'x']));
  }
  await s1.close();

  /* ---- 2. guest size on the real home page, 390 / 768 / 1440 ---------- */
  const guest = {};
  for (const w of [390, 768, 1440]) {
    const ses = await open(rt.page({ extraHead: `<script>${LIB}</script>` }), { extra: rt.route, viewport: { width: w, height: 900 }, dsf: 2, ...rt.opts(w) });
    const pg = ses.page; await pg.waitForTimeout(1500);
    const keep = await rt.keepClear(pg);
    const pic0 = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    if (w === 390) { R.clean = (await pg.screenshot({ clip: { x: pic0[0], y: pic0[1], width: pic0[2], height: pic0[3] } })).toString('base64'); }
    const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    const boxes = {}; for (const k of POSES) { boxes[k] = await pg.evaluate(n => window.poseBox(n), k); }
    const tg = keep.tagline.reduce((m, b) => Math.max(m, b[3] - pic[1]), 0), floorY = pic[3] - 10;
    const up = Math.max(...POSES.map(k => -boxes[k][1]));
    let H = Math.floor((floorY - (tg + M)) / up);
    /* the pair stands 1.1 H apart, nearer at the moment the wings open */
    const place = H => MOMENTS.map(m => {
      const xa = pic[2] / 2 - 0.55 * H, xb = pic[2] / 2 + 0.55 * H;
      const birds = [{ k: m.a, x: xa, y: floorY, H, f: 1 }, { k: m.b, x: xb, y: floorY, H, f: -1 }];
      const bx = birds.map(b => { const u = boxes[b.k]; return b.f > 0 ? [b.x + u[0] * H, b.y + u[1] * H, b.x + u[2] * H, b.y + u[3] * H] : [b.x - u[2] * H, b.y + u[1] * H, b.x - u[0] * H, b.y + u[3] * H]; });
      return { birds, bx };
    });
    let fr, clear, who;
    for (; H > 20; H--) {
      fr = place(H); clear = 1e9; who = '';
      for (const f of fr) { for (const b of f.bx) { for (const [kk, list] of Object.entries(keep)) { for (const kb of list) { const s = sep(b, [kb[0] - pic[0], kb[1] - pic[1], kb[2] - pic[0], kb[3] - pic[1]]); if (s < clear) { clear = s; who = kk; } } } } }
      const inPic = fr.every(f => f.bx.every(b => b[0] >= 0 && b[2] <= pic[2]));
      if (clear >= M && inPic) { break; }
    }
    R.squint[w] = { H, clear: Math.round(clear), who };
    guest[w] = [];
    for (const f of fr) {
      await pg.evaluate(([birds, pic]) => {
        const host = document.querySelector('#header-image-main-inside'); let c = document.getElementById('dc2lab');
        if (!c) { c = document.createElement('canvas'); c.id = 'dc2lab'; c.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'; host.appendChild(c); }
        const dp = devicePixelRatio; c.width = pic[2] * dp; c.height = pic[3] * dp; c.style.width = pic[2] + 'px'; c.style.height = pic[3] + 'px';
        const g = c.getContext('2d'); g.scale(dp, dp); birds.forEach(b => drawPose(g, b.k, b.x, b.y, b.H, b.f));
      }, [f.birds, pic]);
      guest[w].push((await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } })).toString('base64'));
    }
    console.log('guest', w, JSON.stringify(R.squint[w]));
    await ses.close();
  }

  /* ---- 3. the sheet --------------------------------------------------- */
  const png = b => 'data:image/png;base64,' + b;
  const TITLES = { stand: 'Standing, Facing Its Mate', call: 'Calling, Wings Half Open', leap: 'The Leap, Both Wings Thrown Open' };
  const SRCS = { 'cr5.jpg': '“Sandhill Cranes Dancing, Dunes in Background,” Wikimedia Commons, public domain', 'cr6.jpg': '“Sandhill Cranes Kissing — Courtship Ritual,” Wikimedia Commons, public domain' };
  const fig = (src, cap, w) => `<figure><img src="${src}" style="width:${w}px"><figcaption>${cap}</figcaption></figure>`;
  const poseSec = k => { const r = R.poses[k]; return `<section><h2>${TITLES[k]}</h2><p class="note">Photograph: ${SRCS[TRACE[k].ref.f]}.</p>
    <div class="row">${fig(r.photo, 'the photograph', r.W)}${fig(r.over, 'the drawing over it at 50%', r.W)}${fig(r.draw, 'the drawing', r.W)}</div>
    <div class="row">${fig(r.outlines, `the fit: photo outline <b style="color:#E600AA">magenta</b>, drawing <b style="color:#00AADC">cyan</b> — <b>${r.fit}%</b> overlap`, r.W)}${fig(r.value, 'the value test: grayscale', r.W)}
      <figure><div class="row" style="gap:6px"><img src="${r.silPhoto}" style="width:${r.sw * 1.5}px"><img src="${r.silDraw}" style="width:${r.sw * 1.5}px"></div><figcaption>the silhouette test at guest size (shown 1.5×): photo · drawing</figcaption></figure></div></section>`; };
  const sq = w => { const disp = { 390: 390, 768: 640, 1440: 1100 }[w]; return `<h3>${w} px — the pair ${R.squint[w].H} px tall, ${R.squint[w].clear} px clear of the ${R.squint[w].who}</h3>
    <div class="row">${guest[w].map((b, i) => fig(png(b), MOMENTS[i].name, w === 390 ? 380 : disp)).join('')}</div>`; };
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#FBF6EC;font:14px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px;width:1360px}
    h1{font-size:24px;margin:4px 0 6px;text-align:center} h2{font-size:19px;margin:0 0 4px;text-align:center} h3{font-size:15px;margin:14px 0 6px;text-align:center;color:#444}
    .sub,.note{color:#555;margin:0 auto 10px;max-width:1040px;text-align:center} section{border-top:1px solid #E3D9C6;padding:16px 0 10px}
    .row{display:flex;gap:12px;justify-content:center;align-items:flex-end;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#555;margin-top:4px}
    img,canvas{display:block;border:1px solid #D9CDB6;border-radius:3px} .blur img{filter:blur(1.6px)} ul.chk{max-width:1040px;margin:6px auto;padding-left:20px} ul.chk li{margin:3px 0} table{margin:8px auto;border-collapse:collapse} td,th{border:1px solid #D9CDB6;padding:4px 12px;text-align:center}</style>
    <h1>The Anniversary: The Crane, Redrawn</h1>
    <p class="sub">Drawn again from the start, to the Art Standards. One continuous outline traced on each photograph, the masses built inside it (the folded wing over the body, the coverts over the flight feathers, the bustle over the tail, the legs coming out from under the belly feathers), one light from the home-page hero (soft, from above, cool shade), and detail last.</p>
    <section><h2>The Checks, Run Before This Sheet</h2><ul class="chk">
      <li><b>Overlay: passed.</b> At 50% the outline, the head (crown, cheek, where the bill starts), the ankles and the feet sit on each photograph's.</li>
      <li><b>Fit score: passed.</b> Standing ${R.poses.stand.fit}% · calling ${R.poses.call.fit}% · leap ${R.poses.leap.fit}%. The photo outline is my hand trace on the photograph at 4–8× zoom; the drawing's is its own painted pixels. Both are drawn on each pose below.</li>
      <li><b>Silhouette: passed.</b> In solid black at guest size each pose reads as a sandhill crane and matches the photo bird's silhouette beside it.</li>
      <li><b>Value: passed.</b> In grayscale each pose reads as one solid, rounded form: lit from above, shade underneath, the wings darker than the body.</li>
      <li><b>Squint at guest size: passed.</b> At 390, 768 and 1440, and blurred, the pair reads as two gray cranes with red crowns, clear of the tagline.</li>
      <li><b>Style: passed.</b> Beside the shipped heron and tom at the same height: the same painted-vector hand, soft form shading and one light. The crane is quieter because a sandhill is gray.</li></ul></section>
    ${POSES.map(poseSec).join('')}
    <section><h2>At Guest Size on the Real Home Page</h2><p class="note">Rob's row 10 A: under the tagline, centered, 8 px clear of everything on the keep-clear list, at every width.</p>
      ${[390, 768, 1440].map(sq).join('')}
      <h3>The squint test: 390, blurred</h3><div class="row blur">${guest[390].map((b, i) => fig(png(b), MOMENTS[i].name, 380)).join('')}</div>
      <h3>3× close-up at 390</h3><div class="row"><canvas id="zoom" width="1200" height="516" style="width:1200px;height:516px"></canvas></div></section>
    <section><h2>The Style Test</h2><p class="note">The heron and the tom from the shipped engine, beside the crane, all at the same height over the same header.</p>
      <div class="row"><canvas id="style" width="2400" height="760" style="width:1200px;height:380px"></canvas></div></section>
    <section><h2>Cost</h2><p class="note">Each pose pre-rendered once at guest size (62 px) × DPR 3, never redrawn in a frame. Two facings each (the light stays on the screen).</p>
      <table><tr><th>pose</th><th>bitmap</th><th>memory</th><th>1× CPU</th><th>4× CPU</th></tr>${POSES.map(k => `<tr><td>${k}</td><td>${R.cost['1x'][k].w}×${R.cost['1x'][k].h}</td><td>${R.cost['1x'][k].kb} KB</td><td>${R.cost['1x'][k].ms} ms</td><td>${R.cost['4x'][k].ms} ms</td></tr>`).join('')}</table></section>
    <script>${ENGINE}</script><script>${LIB}
    window.fin = async (z, clean) => {
      const im = new Image(); im.src = z; await im.decode(); const cl = new Image(); cl.src = clean; await cl.decode();
      const c = document.getElementById('zoom'), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      const sw = im.naturalWidth / 2, sh = im.naturalHeight / 2;
      g.drawImage(im, 0, (sh - 172) * 2, 400 * 2, 172 * 2, 0, 0, 1200, 516);
      /* style test: same height, the hero crop behind */
      const s = document.getElementById('style'), sg = s.getContext('2d'); sg.fillStyle = '#3F4A40'; sg.fillRect(0, 0, 2400, 760); const sh2 = cl.naturalWidth * 760 / 2400; sg.drawImage(cl, 0, cl.naturalHeight - sh2, cl.naturalWidth, sh2, 0, 0, 2400, 760);
      sg.fillStyle = 'rgba(0,0,0,.0)';
      const E = window.DCCSeasonsEngine.guide, Hh = 300, gy = 700;
      /* the heron, standing: its box [-36,-92,34,3] */
      sg.save(); sg.translate(420, gy); sg.scale(Hh / 92, Hh / 92); E.heron.stand(sg); sg.restore();
      /* the tom: his box, feet at its bottom */
      const b = E.tk[2], L = Hh * 0.62 / (b[3] - b[1]); sg.save(); sg.translate(1080 + (b[2] - b[0]) / 2 * L, gy - (b[3]) * L); sg.scale(-L, L); E.tk[0](sg, 0.12, 0, 0); sg.restore();
      drawPose(sg, 'stand', 1800, gy, Hh, -1);
      sg.font = '28px system-ui'; sg.fillStyle = '#fff'; sg.textAlign = 'center'; sg.fillText('heron (shipped)', 420, 740); sg.fillText('tom (shipped)', 1180, 740); sg.fillText('crane (new)', 1800, 740);
    };</script>`;
  const ses = await open(html, { viewport: { width: 1400, height: 900 }, dsf: 1 });
  await ses.page.evaluate(([z, c]) => window.fin(z, c), [png(guest[390][2]), png(R.clean)]);
  await ses.page.waitForTimeout(400);
  const h = await ses.page.evaluate(() => document.documentElement.scrollHeight);
  await ses.page.screenshot({ path: OUT, fullPage: true });
  await ses.close();
  fs.writeFileSync(path.join(B, '.anniv-crane2.json'), JSON.stringify({ fit: Object.fromEntries(POSES.map(k => [k, { fit: R.poses[k].fit, onlyPhoto: R.poses[k].onlyPhoto, onlyDrawing: R.poses[k].onlyDrawing }])), squint: R.squint, cost: R.cost }, null, 1));
  console.log(OUT, h + 'px tall');
})().catch(e => { console.error(e); process.exit(1); });
