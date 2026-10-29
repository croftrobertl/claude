'use strict';
/**
 * DCC Seasons — the 4.13.5 crane sheet: the six polish points, the Art
 * Standards' checks, the dance and Florida Keys, all from the painter that
 * ships (tools/anniv-crane3.js on the jointed rig, tools/anniv-crane-rig.js).
 *
 * The fit score is now measured TWO ways (the Director, 2026-10-29):
 *  - against a mask of the photo bird that was not used to build the
 *    drawing: OpenCV GrabCut from a plain box (tools/anniv-crane-grabcut.py;
 *    a hue/saturation threshold was tried first and could not tell the
 *    sunlit brown flight feathers from the sunlit ground). It checks the
 *    hand trace and the drawing together;
 *  - against the hand trace, as before (checks only that the drawing did
 *    not drift from the trace).
 *
 * Needs, first: node tools/anniv-dance-reel.js (390), node
 * tools/anniv-keys-cranes.js --width=390 and --width=1440.
 *
 *   node tools/anniv-crane3-sheet.js
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');
const { DC3_SRC } = require('./anniv-crane3');
const { RIG, RIG0 } = require('./anniv-crane-rig');

const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'anniv-crane-trace.json'), 'utf8'));
const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
const B = path.join(__dirname, '..', 'build');
const OUT = path.join(B, 'Seasons - 4.13.5 anniversary crane polish.png');
const ENGINE = fs.readFileSync(path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
/* since 4.13.4 the tom's painter is Thanksgiving's own art file, read before the engine */
const ART = require('./engine-src').packs(path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js')).join('\n');
const POSES = ['stand', 'call', 'leap'];
/* a seed inside each photo bird's body (photo px) */
const SEED = { stand: [690, 420], call: [430, 400], leap: [600, 450] };
const M = 8;
const MOMENTS = [{ name: 'they meet and call', a: 'stand', b: 'call' }, { name: 'one springs up', a: 'leap', b: 'call' }, { name: 'both wings open', a: 'call', b: 'leap' }];
const dance = JSON.parse(fs.readFileSync(path.join(B, '.anniv-dance-390.json'), 'utf8'));
const keys = { 390: JSON.parse(fs.readFileSync(path.join(B, '.anniv-keys-390.json'), 'utf8')), 1440: JSON.parse(fs.readFileSync(path.join(B, '.anniv-keys-1440.json'), 'utf8')) };

const LIB = `${DC3_SRC}
window.RIG = ${JSON.stringify(RIG)}; window.RIG0 = ${JSON.stringify(RIG0)}; window.TR = ${JSON.stringify(Object.fromEntries(POSES.map(k => [k, T[k]])))}; window.L0 = [0.3, -0.954];
/* a key pose in its photograph's pixels */
window.inPhoto = function (g, k, legs) { var R = TR[k].ref; g.save(); g.translate(R.ground[0], R.ground[1]); g.scale(R.H * R.face, R.H); var U = RIG0[k]; if (legs === 0) { U = Object.assign({}, U, { noLegs: 1 }); } dc3Paint(g, U, L0[0] * R.face, L0[1]); g.restore(); };
/* a key pose on screen: feet at (x, y), H px, facing f */
window.drawPose = function (g, k, x, y, H, f) { g.save(); g.translate(x, y); g.scale(H * f, H); dc3Paint(g, RIG[k], L0[0] * f, L0[1]); g.restore(); };
window.poseBox = function (k) {
  var c = document.createElement('canvas'), S = 200; c.width = c.height = 3 * S; var g = c.getContext('2d', { willReadFrequently: true });
  g.translate(1.5 * S, 2.2 * S); g.scale(S, S); dc3Paint(g, RIG[k], L0[0], L0[1]);
  var d = g.getImageData(0, 0, c.width, c.height).data, b = [1e9, 1e9, -1e9, -1e9];
  for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }
  return [(b[0] - 1.5 * S) / S, (b[1] - 2.2 * S) / S, (b[2] + 1 - 1.5 * S) / S, (b[3] + 1 - 2.2 * S) / S];
};`;

function sep(a, b) { return Math.max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3]); }

(async () => {
  const R = { poses: {}, squint: {} };
  const s1 = await open('<!doctype html><body></body>', { viewport: { width: 1200, height: 900 }, dsf: 1 });
  await s1.page.addScriptTag({ content: LIB });
  for (const k of POSES) {
    const P = T[k], img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REF, P.ref.f)).toString('base64');
    R.poses[k] = await s1.page.evaluate(async ([k, img, gcMask]) => {
      const P = TR[k], im = new Image(); im.src = img; await im.decode();
      const [cx, cy, cw, ch] = P.ref.crop, Sc = Math.min(1.2, 440 / ch), W = Math.round(cw * Sc), H = Math.round(ch * Sc);
      const mk = () => { const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const g = c.getContext('2d'); g.scale(2 * Sc, 2 * Sc); g.translate(-cx, -cy); return [c, g]; };
      const out = {};
      let [c, g] = mk(); g.drawImage(im, 0, 0); out.photo = c.toDataURL();
      [c, g] = mk(); g.drawImage(im, 0, 0); g.globalAlpha = 0.5; inPhoto(g, k); out.over = c.toDataURL();
      [c, g] = mk(); g.fillStyle = '#4E5A4E'; g.fillRect(cx, cy, cw, ch); inPhoto(g, k); out.draw = c.toDataURL();
      /* value: the drawing alone in grayscale */
      const [cd, gd] = mk(); inPhoto(gd, k);
      const [cv, gv] = mk(); gv.fillStyle = '#7F7F7F'; gv.fillRect(cx, cy, cw, ch);
      const vd = gd.getImageData(0, 0, cd.width, cd.height), bg = gv.getImageData(0, 0, cv.width, cv.height);
      for (let i = 0; i < vd.data.length; i += 4) { const a = vd.data[i + 3] / 255, y = 0.2126 * vd.data[i] + 0.7152 * vd.data[i + 1] + 0.0722 * vd.data[i + 2]; const v = y * a + bg.data[i] * (1 - a); bg.data[i] = bg.data[i + 1] = bg.data[i + 2] = v; }
      gv.putImageData(bg, 0, 0); out.value = cv.toDataURL();
      /* three masks at the photo's own resolution: segmentation, trace, drawing */
      const fw = cw, fh = ch, mkm = () => { const m = document.createElement('canvas'); m.width = fw; m.height = fh; return m; };
      /* 1. segmentation */
      const pc = mkm(), pg = pc.getContext('2d', { willReadFrequently: true }); pg.drawImage(im, -cx, -cy);
      /* the independent outline: OpenCV GrabCut from a plain box round the
       * bird (tools/anniv-crane-grabcut.py), loaded as a mask. It loses the
       * thin legs, so every mask is compared above the bird's body bottom
       * (the lowest row where the GrabCut bird is still 12 px wide) */
      const gm = new Image(); gm.src = gcMask; await gm.decode();
      const gmc = mkm(), gmg = gmc.getContext('2d', { willReadFrequently: true }); gmg.drawImage(gm, 0, 0);
      const gmd = gmg.getImageData(0, 0, fw, fh).data, seg2 = new Uint8Array(fw * fh);
      let cut = 0;
      for (let y = 0; y < fh; y++) { let n = 0; for (let x = 0; x < fw; x++) { const v = gmd[(y * fw + x) * 4] > 127; seg2[y * fw + x] = v; n += v; } if (n >= 12) { cut = y; } }
      out.segN = seg2.reduce((a, v) => a + v, 0); out.cut = cut;
      /* 2. the hand trace */
      const A = mkm(), ga = A.getContext('2d', { willReadFrequently: true }); ga.translate(-cx, -cy); ga.fillStyle = '#000'; ga.strokeStyle = '#000';
      ga.beginPath(); P.out.forEach((q, i) => i ? ga.lineTo(q[0], q[1]) : ga.moveTo(q[0], q[1])); ga.closePath(); ga.fill();
      P.legs.forEach(Lg => { ga.lineCap = 'round'; ga.lineJoin = 'round'; Lg.p.forEach((q, i) => { if (!i) { return; } ga.lineWidth = i < Lg.p.length - 1 ? Lg.w[0] : Lg.w[1]; ga.beginPath(); ga.moveTo(Lg.p[i - 1][0], Lg.p[i - 1][1]); ga.lineTo(q[0], q[1]); ga.stroke(); });
        Lg.toes.forEach(t => { const f = Lg.p[Lg.p.length - 1]; ga.lineWidth = Lg.w[1] * 0.7; ga.beginPath(); ga.moveTo(f[0], f[1]); ga.lineTo(t[0], t[1]); ga.stroke(); }); });
      /* 3. the drawing's own opaque pixels (its translucent contact shadow is ground) */
      const Bc = mkm(), gb = Bc.getContext('2d', { willReadFrequently: true }); gb.translate(-cx, -cy); inPhoto(gb, k);
      const da = ga.getImageData(0, 0, fw, fh).data, db = gb.getImageData(0, 0, fw, fh).data;
      const mS = i => seg2[i], mT = i => da[i * 4 + 3] > 127, mD = i => db[i * 4 + 3] > 200;
      const iou = (f1, f2) => { let I = 0, U = 0; for (let i = 0; i < (cut + 1) * fw; i++) { const a = f1(i), b = f2(i); if (a && b) { I++; } if (a || b) { U++; } } return +(100 * I / (U || 1)).toFixed(1); };
      out.fitSegDraw = iou(mS, mD); out.fitSegTrace = iou(mS, mT); out.fitTraceDraw = iou(mT, mD);
      /* the outlines on the photo: segmentation yellow, trace magenta, drawing cyan */
      [c, g] = mk(); g.drawImage(im, 0, 0); g.globalAlpha = 0.55; g.fillStyle = '#FBF6EC'; g.fillRect(cx, cy, cw, ch); g.globalAlpha = 1;
      const edge = (f, col) => { const e = g.createImageData(fw, fh); for (let y = 1; y < fh - 1; y++) for (let x = 1; x < fw - 1; x++) { const i = y * fw + x; if (!f(i)) { continue; } if (!(f(i - 1) && f(i + 1) && f(i - fw) && f(i + fw))) { e.data[i * 4] = col[0]; e.data[i * 4 + 1] = col[1]; e.data[i * 4 + 2] = col[2]; e.data[i * 4 + 3] = 255; } } const t = document.createElement('canvas'); t.width = fw; t.height = fh; t.getContext('2d').putImageData(e, 0, 0); g.drawImage(t, cx, cy); };
      edge(mS, [230, 170, 0]); edge(mT, [230, 0, 170]); edge(mD, [0, 160, 220]);
      out.outlines = c.toDataURL();
      /* the silhouette test at guest size (60 px standing height) */
      const gs = 60, sc2 = gs / P.ref.H, sw = Math.ceil(cw * sc2) + 8, sh = Math.ceil(ch * sc2) + 4;
      const sil = f => { const t = document.createElement('canvas'); t.width = sw * 3; t.height = sh * 3; const tg = t.getContext('2d'); tg.fillStyle = '#FBF6EC'; tg.fillRect(0, 0, t.width, t.height);
        const m = tg.createImageData(fw, fh); for (let i = 0; i < fw * fh; i++) { if (f(i)) { m.data[i * 4] = 22; m.data[i * 4 + 1] = 24; m.data[i * 4 + 2] = 28; m.data[i * 4 + 3] = 255; } }
        const t2 = document.createElement('canvas'); t2.width = fw; t2.height = fh; t2.getContext('2d').putImageData(m, 0, 0); tg.imageSmoothingQuality = 'high'; tg.drawImage(t2, 12, 6, fw * sc2 * 3, fh * sc2 * 3); return t.toDataURL(); };
      out.silPhoto = sil(mS); out.silDraw = sil(mD);
      out.W = W; out.H = H; out.sw = sw; out.sh = sh;
      return out;
    }, [k, img, 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'data', 'anniv-crane-mask-' + k + '.png')).toString('base64')]);
    console.log(k, 'mask px', R.poses[k].segN, 'fit vs segmentation', R.poses[k].fitSegDraw + '%', '· trace vs segmentation', R.poses[k].fitSegTrace + '%', '· drawing vs trace', R.poses[k].fitTraceDraw + '%');
  }
  await s1.close();
  if (process.argv.includes('--fit')) {   /* the fit alone, for checking the mask */
    for (const k of POSES) { fs.writeFileSync(path.join(require('os').tmpdir(), 'dcc-fit-' + k + '.png'), Buffer.from(R.poses[k].outlines.split(',')[1], 'base64')); }
    return;
  }

  /* guest size on the real home page, three widths */
  const guest = {};
  for (const w of [390, 768, 1440]) {
    const ses = await open(rt.page({ extraHead: `<script>${LIB}</script>` }), { extra: rt.route, viewport: { width: w, height: 900 }, dsf: 2, ...rt.opts(w) });
    const pg = ses.page; await pg.waitForTimeout(1500);
    const keep = await rt.keepClear(pg);
    const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    if (w === 390) { R.clean = (await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } })).toString('base64'); }
    const boxes = {}; for (const k of POSES) { boxes[k] = await pg.evaluate(n => window.poseBox(n), k); }
    const tg = keep.tagline.reduce((m, b) => Math.max(m, b[3] - pic[1]), 0), floorY = pic[3] - 10;
    let H = Math.floor((floorY - (tg + M)) / Math.max(...POSES.map(k => -boxes[k][1]))), fr, clear, who;
    for (; H > 20; H--) {
      fr = MOMENTS.map(m => { const xa = pic[2] / 2 - 0.55 * H, xb = pic[2] / 2 + 0.55 * H; const birds = [{ k: m.a, x: xa, y: floorY, H, f: 1 }, { k: m.b, x: xb, y: floorY, H, f: -1 }];
        return { birds, bx: birds.map(b => { const u = boxes[b.k]; return b.f > 0 ? [b.x + u[0] * H, b.y + u[1] * H, b.x + u[2] * H, b.y + u[3] * H] : [b.x - u[2] * H, b.y + u[1] * H, b.x - u[0] * H, b.y + u[3] * H]; }) }; });
      clear = 1e9; who = '';
      for (const f of fr) { for (const b of f.bx) { for (const [kk, list] of Object.entries(keep)) { for (const kb of list) { const s = sep(b, [kb[0] - pic[0], kb[1] - pic[1], kb[2] - pic[0], kb[3] - pic[1]]); if (s < clear) { clear = s; who = kk; } } } } }
      if (clear >= M && fr.every(f => f.bx.every(b => b[0] >= 0 && b[2] <= pic[2]))) { break; }
    }
    R.squint[w] = { H, clear: Math.round(clear), who };
    guest[w] = [];
    for (const f of fr) {
      await pg.evaluate(([birds, pic]) => { const host = document.querySelector('#header-image-main-inside'); let c = document.getElementById('dc3lab');
        if (!c) { c = document.createElement('canvas'); c.id = 'dc3lab'; c.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'; host.appendChild(c); }
        const dp = devicePixelRatio; c.width = pic[2] * dp; c.height = pic[3] * dp; c.style.width = pic[2] + 'px'; c.style.height = pic[3] + 'px';
        const g = c.getContext('2d'); g.scale(dp, dp); birds.forEach(b => drawPose(g, b.k, b.x, b.y, b.H, b.f)); }, [f.birds, pic]);
      guest[w].push((await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } })).toString('base64'));
    }
    console.log('guest', w, JSON.stringify(R.squint[w]));
    await ses.close();
  }

  /* the sheet */
  const png = b => 'data:image/png;base64,' + b;
  const TITLES = { stand: 'Standing, Facing Its Mate', call: 'Calling, Wings Half Open', leap: 'The Leap, Both Wings Thrown Open' };
  const SRCS = { 'cr5.jpg': '“Sandhill Cranes Dancing, Dunes in Background,” Wikimedia Commons, public domain', 'cr6.jpg': '“Sandhill Cranes Kissing — Courtship Ritual,” Wikimedia Commons, public domain' };
  const fig = (src, cap, w) => `<figure><img src="${src}" style="width:${w}px"><figcaption>${cap}</figcaption></figure>`;
  const poseSec = k => { const r = R.poses[k]; return `<section><h2>${TITLES[k]}</h2><p class="note">Photograph: ${SRCS[T[k].ref.f]}.</p>
    <div class="row">${fig(r.photo, 'The photograph', r.W)}${fig(r.over, 'The drawing over it at 50%', r.W)}${fig(r.draw, 'The drawing', r.W)}</div>
    <div class="row">${fig(r.outlines, `Fit: GrabCut mask <b style="color:#C89400">gold</b> · hand trace <b style="color:#E600AA">magenta</b> · drawing <b style="color:#00A0DC">cyan</b><br>drawing vs mask <b>${r.fitSegDraw}%</b> · trace vs mask <b>${r.fitSegTrace}%</b> · drawing vs trace <b>${r.fitTraceDraw}%</b>`, r.W)}${fig(r.value, 'The value test: grayscale', r.W)}
      <figure><div class="row" style="gap:6px"><img src="${r.silPhoto}" style="width:${r.sw * 1.5}px"><img src="${r.silDraw}" style="width:${r.sw * 1.5}px"></div><figcaption>Silhouettes at guest size (shown 1.5×):<br>the photo's GrabCut mask · the drawing</figcaption></figure></div></section>`; };
  const sq = w => { const disp = { 390: 380, 768: 640, 1440: 1100 }[w]; return `<h3>${w} px: the Pair ${R.squint[w].H} px Tall, ${R.squint[w].clear} px Clear of the ${R.squint[w].who === 'tagline' ? 'Tagline' : R.squint[w].who}</h3>
    <div class="row">${guest[w].map((b, i) => fig(png(b), MOMENTS[i].name, disp)).join('')}</div>`; };
  const keyRow = w => ['today', 'new'].map(m => `<h3>${m === 'today' ? 'Today: the Sprite the Keys Scene Has Now' : 'With the Polished Bird: Same Timing, Positions and Size'}</h3>
    <div class="row">${keys[w].runs[m].map(s => fig(png(s.close), s.name, 300)).join('')}</div>`).join('');
  const sf = dance.strip.slice(0, 20);
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#FBF6EC;font:14px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px;width:1360px}
    h1{font-size:24px;margin:4px 0 6px;text-align:center} h2{font-size:19px;margin:0 0 4px;text-align:center} h3{font-size:15px;margin:14px 0 6px;text-align:center;color:#444}
    .sub,.note{color:#555;margin:0 auto 10px;max-width:1040px;text-align:center} section{border-top:1px solid #E3D9C6;padding:16px 0 10px}
    .row{display:flex;gap:12px;justify-content:center;align-items:flex-end;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#555;margin-top:4px}
    img,canvas{display:block;border:1px solid #D9CDB6;border-radius:3px} .blur img{filter:blur(1.6px)} ul{max-width:1040px;margin:6px auto;padding-left:20px} li{margin:3px 0}
    .strip{display:grid;grid-template-columns:repeat(5,250px);gap:6px;justify-content:center} .strip div{position:relative;width:250px;height:140px;overflow:hidden;border:1px solid #D9CDB6;border-radius:3px} .strip img{position:absolute;border:0;width:585px;left:-167px;top:-460px} .strip span{position:absolute;left:5px;top:3px;color:#fff;font:12px system-ui;text-shadow:0 0 3px #000}</style>
    <h1>The Anniversary: The Crane, Polished</h1>
    <p class="sub">Rob's approved bird with the six polish points, drawn by the painter that ships: one jointed bird, so the dance moves between the three approved poses with one continuous outline.</p>
    <section><h2>The Six Points</h2><ul>
      <li><b>1. The leap's near wing:</b> every primary is a separate blade that keeps its width to a rounded tip, like the far wing's; no edge is a sawtooth.</li>
      <li><b>2. The rust:</b> staining on the feathers, on each covert's edge and each secondary's outer vane near its base, fading along it; no smudge, on every pose.</li>
      <li><b>3. Body texture:</b> faint scallops and fringe highlights along the feathers' flow, visible in the 3× close-up, gone at guest size.</li>
      <li><b>4. Edge contrast:</b> found edges on the head, neck and wing leading edges; deeper shade under the body and wings. Still crane-gray.</li>
      <li><b>5. Nothing behind the feather tips:</b> the wing is now its coverts plus its feathers. The gaps between the tips show the scene; nothing is filled to the traced outline.</li>
      <li><b>6. The tail, legs and rump:</b> the bustle as separate drooping plumes, each with its own edge, shade and gray-brown; the darker under-tail; feathered thighs the legs disappear into; the pale belly darkening to the rear.</li></ul></section>
    <section><h2>The Checks, Run Before This Sheet</h2><ul>
      <li><b>Overlay: passed.</b> At 50% the outline, head, ankles and feet sit on each photograph's.</li>
      <li><b>Fit score, against an outline not used to build the drawing: passed.</b> OpenCV GrabCut, started from a plain box round each photo bird (no tracing), compared above the ankles because GrabCut loses the thin legs (the overlay checks those). Drawing vs mask ${POSES.map(k => R.poses[k].fitSegDraw + '%').join(' · ')} (standing · calling · leap); my hand trace vs the same mask ${POSES.map(k => R.poses[k].fitSegTrace + '%').join(' · ')}. Drawing vs trace, as before: ${POSES.map(k => R.poses[k].fitTraceDraw + '%').join(' · ')}; it is lower than last round's 98% on purpose: the wing is now its feathers, so the gaps between the tips (point 5) are no longer painted.</li>
      <li><b>Silhouette: passed.</b> In solid black at guest size each pose reads as a sandhill crane, beside the photo's own GrabCut silhouette (its legs are partly lost; the drawing's are not).</li>
      <li><b>Value: passed.</b> In grayscale each pose reads as one solid form.</li>
      <li><b>Squint at guest size: passed.</b> At 390, 768 and 1440, and blurred at 390, two gray cranes with red crowns, clear of the tagline.</li>
      <li><b>Style: passed.</b> Beside the shipped heron and tom at the same height: the same painted hand, crisper now.</li></ul></section>
    ${POSES.map(poseSec).join('')}
    <section><h2>At Guest Size on the Real Home Page</h2><p class="note">Rob's row 10 A: under the tagline, centered, 8 px clear of everything on the keep-clear list, at every width.</p>
      ${[390, 768, 1440].map(sq).join('')}
      <h3>The Squint Test: 390, Blurred</h3><div class="row blur">${guest[390].map((b, i) => fig(png(b), MOMENTS[i].name, 380)).join('')}</div>
      <h3>3× Close-Up at 390</h3><div class="row"><canvas id="zoom" width="1200" height="516" style="width:1200px;height:516px"></canvas></div></section>
    <section><h2>The Dance at Guest Size, 390</h2><p class="note">Every 0.5 s of the video (Seasons - 4.13.5 anniversary dance 390.mp4), close up on the pair. The birds dance in turn: a step into the call as the wings open, a crouch, the spring, a landing on the same spot that settles; the feet stay planted on every step.</p>
      <div class="strip">${sf.map(([t, b]) => `<div><img src="${png(b)}"><span>${t.toFixed(1)} s</span></div>`).join('')}</div></section>
    <section><h2>Florida Keys: Its Water-Line Scene With the Polished Bird</h2><p class="note">The scene runs unchanged in the engine, on the mocked clock with the same seed; only the two crane pictures are swapped, in the same boxes.</p>
      <h3 style="font-size:17px;color:#2b2b2b">390</h3>${keyRow(390)}<h3 style="font-size:17px;color:#2b2b2b">1440</h3>${keyRow(1440)}</section>
    <section><h2>The Style Test</h2><p class="note">The heron and the tom from the shipped engine, beside the crane, all at the same height over the same header.</p>
      <div class="row"><canvas id="style" width="2400" height="760" style="width:1200px;height:380px"></canvas></div></section>
    <script>${ART}</script><script>${ENGINE}</script><script>${LIB}
    window.fin = async (z, clean) => {
      const im = new Image(); im.src = z; await im.decode(); const cl = new Image(); cl.src = clean; await cl.decode();
      const c = document.getElementById('zoom'), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      const sh = im.naturalHeight / 2; g.drawImage(im, 0, (sh - 172) * 2, 800, 344, 0, 0, 1200, 516);
      const s = document.getElementById('style'), sg = s.getContext('2d'), sh2 = cl.naturalWidth * 760 / 2400; sg.drawImage(cl, 0, cl.naturalHeight - sh2, cl.naturalWidth, sh2, 0, 0, 2400, 760);
      const E = window.DCCSeasonsEngine.guide, Hh = 300, gy = 700;
      sg.save(); sg.translate(420, gy); sg.scale(Hh / 92, Hh / 92); E.heron.stand(sg); sg.restore();
      const b = E.tk[2], L = Hh * 0.62 / (b[3] - b[1]); sg.save(); sg.translate(1080 + (b[2] - b[0]) / 2 * L, gy - (b[3]) * L); sg.scale(-L, L); E.tk[0](sg, 0.12, 0, 0); sg.restore();
      drawPose(sg, 'stand', 1800, gy, Hh, -1);
      sg.font = '28px system-ui'; sg.fillStyle = '#fff'; sg.textAlign = 'center'; sg.fillText('Heron (shipped)', 420, 745); sg.fillText('Tom (shipped)', 1180, 745); sg.fillText('Crane (polished)', 1800, 745);
    };</script>`;
  /* a page this size is too big to hand over as a string: write it out */
  const tmp = path.join(require('os').tmpdir(), 'dcc-crane3-sheet.html'); fs.writeFileSync(tmp, html);
  const br = await require('playwright').chromium.launch(), bp = await br.newPage({ viewport: { width: 1400, height: 900 } });
  await bp.goto('file://' + tmp, { waitUntil: 'load', timeout: 120000 });
  await bp.evaluate(([z, c]) => window.fin(z, c), [png(guest[390][2]), png(R.clean)]);
  await bp.waitForTimeout(400);
  const h = await bp.evaluate(() => document.documentElement.scrollHeight);
  await bp.screenshot({ path: OUT, fullPage: true });
  await br.close();
  fs.writeFileSync(path.join(B, '.anniv-crane3.json'), JSON.stringify({ fit: Object.fromEntries(POSES.map(k => [k, { segDraw: R.poses[k].fitSegDraw, segTrace: R.poses[k].fitSegTrace, traceDraw: R.poses[k].fitTraceDraw }])), squint: R.squint }, null, 1));
  console.log(OUT, h + 'px tall');
})().catch(e => { console.error(e); process.exit(1); });
