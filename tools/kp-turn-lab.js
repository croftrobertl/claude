'use strict';
/**
 * DCC Seasons 4.17.0: the poult-turn lab. Draws tools/kp-turn-art.js's
 * frames with the pack's own helpers (injected into tkMod), lays the rear
 * three-quarter over the NPS photo at 50%, scores the fit against the
 * photo's own silhouette (colour-segmented, the other birds masked out),
 * and renders the self-check sheet: overlay, fit, silhouette, value, the
 * frames of each option at guest size and 3x, next to the approved profile.
 *
 *   node tools/kp-turn-lab.js --photo=<big-f1.jpg> --out="<sheet.png>"
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..');
const { SRC } = require('./kp-turn-art');

/* the pack with the turn painter inside tkMod, returned as [9] (and the
 * profile painter as [10]) */
function packWithTurn() {
  let p = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'art-thanksgiving.js'), 'utf8');
  const ret = '\treturn [tkPaint, tkDraw, TK_BOX, KP_BOX, TK_STRIDE, TK_GROUND, TK_STANCE, KP_STRIDE, KP_GROUND];';
  if (p.indexOf(ret) < 0) { throw new Error('pack return not found'); }
  return p.replace(ret, SRC + '\n\treturn [tkPaint, tkDraw, TK_BOX, KP_BOX, TK_STRIDE, TK_GROUND, TK_STANCE, KP_STRIDE, KP_GROUND, kpTurnPaint, kpPaint];');
}
module.exports = { packWithTurn };

if (require.main === module) (async () => {
  const PHOTO = arg('photo'), OUT = arg('out', 'Seasons - poult turn sheet.png');
  const crop = path.join(path.dirname(path.resolve(OUT)), '.kp-crop-' + process.pid + '.png');
  execFileSync('/usr/bin/ffmpeg', ['-loglevel', 'error', '-y', '-i', PHOTO, '-vf', 'crop=540:700:1440:1600', crop]);
  const cropURL = 'data:image/png;base64,' + fs.readFileSync(crop).toString('base64'); fs.rmSync(crop);
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
  await pg.setContent('<!doctype html><body style="margin:0"></body>');
  await pg.addScriptTag({ content: packWithTurn() });
  const res = await pg.evaluate(async ({ cropURL }) => {
    const M = window.DCCSeasonsArt.thanksgiving.tk(), turn = M[9], prof = M[10], KPG = M[8];
    const img = new Image(); img.src = cropURL; await img.decode();
    const U = 9.5, OX = 55, OY = 55 + 9.5;   /* unit -> crop px: x*U+OX, y*U+OY */
    const mk = (w, h, bg) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } return [c, g]; };
    /* the photo's silhouette: its outline traced by hand on the photograph
     * (crop px), INDEPENDENTLY of the drawing's own points: the wing tips,
     * the back, the neck and the back of the head, the flank, the belly and
     * both legs to the toes */
    const OUTL = [[30,338],[27,325],[40,300],[36,280],[55,262],[68,240],[85,225],[100,205],[125,190],[160,175],[190,165],[215,162],[245,163],[280,170],[320,180],[360,190],[390,200],
      [392,170],[395,130],[398,100],[402,75],[415,58],[440,50],[465,55],[485,68],[495,85],[490,100],[470,115],[455,140],[450,170],[445,200],[440,230],[432,270],[428,310],[420,345],[405,370],
      [380,390],[340,405],[300,415],[272,428],[285,470],[300,500],[310,550],[330,640],[345,655],[400,660],[415,668],[405,675],[335,672],[320,662],[285,560],[262,480],[245,445],
      [225,480],[190,560],[160,610],[185,670],[175,676],[150,628],[140,672],[128,670],[128,622],[90,630],[85,622],[150,598],[170,560],[200,490],[215,440],
      [200,420],[165,405],[140,385],[130,360],[120,345],[80,345],[50,348]];
    const [pc, pgc] = mk(540, 700); pgc.fillStyle = '#000'; pgc.beginPath(); OUTL.forEach((q, i) => i ? pgc.lineTo(q[0], q[1]) : pgc.moveTo(q[0], q[1])); pgc.closePath(); pgc.fill();
    const pd = pgc.getImageData(0, 0, 540, 700).data, photoMask = new Uint8Array(540 * 700);
    for (let k = 0; k < 540 * 700; k++) { photoMask[k] = pd[k * 4 + 3] > 100 ? 1 : 0; }
    /* the drawing's silhouette, the same frame */
    const drawAt = (g, v, hd, s, ox, oy) => { g.save(); g.translate(ox, oy); g.scale(s, s); turn(g, v, hd); g.restore(); };
    const [dc, dg] = mk(540, 700); drawAt(dg, 1, 0, U, OX, OY); const dd = dg.getImageData(0, 0, 540, 700).data;
    let inter = 0, uni = 0, inter2 = 0, uni2 = 0;
    for (let y = 0; y < 700; y++) for (let x = 0; x < 540; x++) {
      const a = photoMask[y * 540 + x], b = dd[(y * 540 + x) * 4 + 3] > 100 ? 1 : 0;
      if (a || b) { uni++; if (a && b) { inter++; } }
      if (y < 430) { if (a || b) { uni2++; if (a && b) { inter2++; } } }   /* the body, neck and head: above the legs, which the photo has mid-stride */
    }
    const out = { fitAll: +(inter / uni * 100).toFixed(1), fitBody: +(inter2 / uni2 * 100).toFixed(1) };
    const url = c => c.toDataURL('image/png');
    /* panels: the photo; the drawing over it at 50%; the drawing; the
     * outlines (photo cyan, drawing red); silhouettes; value */
    const P = {};
    { const [c, g] = mk(540, 700); g.drawImage(img, 0, 0); P.photo = url(c); }
    { const [c, g] = mk(540, 700); g.drawImage(img, 0, 0); g.globalAlpha = 0.5; drawAt(g, 1, 0, U, OX, OY); P.over = url(c); }
    { const [c, g] = mk(540, 700, '#F6F1E7'); drawAt(g, 1, 0, U, OX, OY); P.draw = url(c); }
    { const [c, g] = mk(540, 700, '#ffffff'); const id = g.getImageData(0, 0, 540, 700);
      for (let y = 1; y < 699; y++) for (let x = 1; x < 539; x++) { const k = y * 540 + x, i = k * 4;
        const ea = photoMask[k] && (!photoMask[k - 1] || !photoMask[k + 1] || !photoMask[k - 540] || !photoMask[k + 540]);
        const dA = dd[i + 3] > 100, eb = dA && (dd[i - 4 + 3] <= 100 || dd[i + 4 + 3] <= 100 || dd[i - 2160 + 3] <= 100 || dd[i + 2160 + 3] <= 100);
        if (photoMask[k]) { id.data[i] = 200; id.data[i + 1] = 236; id.data[i + 2] = 240; }
        if (ea) { id.data[i] = 0; id.data[i + 1] = 150; id.data[i + 2] = 190; }
        if (eb) { id.data[i] = 210; id.data[i + 1] = 30; id.data[i + 2] = 30; } }
      g.putImageData(id, 0, 0); P.outl = url(c); }
    { const [c, g] = mk(540, 700, '#ffffff'); const id = g.getImageData(0, 0, 540, 700);
      for (let k = 0; k < 540 * 700; k++) { if (photoMask[k]) { id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = 30; } } g.putImageData(id, 0, 0); P.silP = url(c); }
    { const [c, g] = mk(540, 700); drawAt(g, 1, 0, U, OX, OY); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#1E1E1E'; g.fillRect(0, 0, 540, 700); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, 540, 700); P.silD = url(c); }
    { const [c, g] = mk(540, 700, '#F6F1E7'); drawAt(g, 1, 0, U, OX, OY); const id = g.getImageData(0, 0, 540, 700); for (let i = 0; i < id.data.length; i += 4) { const l = id.data[i] * 0.299 + id.data[i + 1] * 0.587 + id.data[i + 2] * 0.114; id.data[i] = id.data[i + 1] = id.data[i + 2] = l; } g.putImageData(id, 0, 0); P.value = url(c); }
    /* frames: A = profile, rear 3/4, rear, rear 3/4 mirrored, profile mirrored;
     * B = the peck, rear with the head down, the mirrored peck */
    const frame = (kind, H, bg) => { const s = H / 72, [c, g] = mk(Math.ceil(78 * s), Math.ceil(76 * s), bg);
      const px = 39 * s, py = 4 * s; g.save(); g.translate(px, py);
      const m = kind.m ? -1 : 1; g.scale(m * s, s); g.translate(-20, 0);   /* the pivot (x 20) on the panel's centre */
      if (kind.p != null) { prof(g, kind.ph != null ? kind.ph : -1, kind.p); } else { turn(g, kind.v, kind.hd || 0); }
      g.restore(); return url(c); };
    const A = [{ p: 0 }, { v: 1 }, { v: 2 }, { v: 1, m: 1 }, { p: 0, m: 1 }];
    const B = [{ p: 0 }, { p: 1 }, { v: 2, hd: 1 }, { p: 1, m: 1 }, { p: 0, m: 1 }];
    const FLAT = [{ p: 0 }, { p: 0, sq: 0.6 }, { p: 0, sq: 0.3 }, { p: 0, sq: 0.6, m: 1 }, { p: 0, m: 1 }];
    const flat = (k, H, bg) => { const s = H / 72, [c, g] = mk(Math.ceil(78 * s), Math.ceil(76 * s), bg); g.save(); g.translate(39 * s, 4 * s); g.scale((k.m ? -1 : 1) * (k.sq || 1) * s, s); g.translate(-20, 0); prof(g, -1, 0); g.restore(); return url(c); };
    out.frames = { A: A.map(k => [frame(k, 66, '#F6F1E7'), frame(k, 200, '#F6F1E7')]), B: B.map(k => [frame(k, 66, '#F6F1E7'), frame(k, 200, '#F6F1E7')]), FLAT: FLAT.map(k => [flat(k, 66, '#F6F1E7'), flat(k, 200, '#F6F1E7')]) };
    out.P = P; return out;
  }, { cropURL });
  const sec = (t, s, body) => `<section><h2>${t}</h2><p class="s">${s}</p>${body}</section>`;
  const fig = (u, cap, w) => `<figure><img src="${u}" style="${w ? 'width:' + w + 'px' : ''}"><figcaption>${cap}</figcaption></figure>`;
  const strip = (fr, big, caps) => `<div class="r">${fr.map((f, i) => fig(f[big ? 1 : 0], caps[i])).join('')}</div>`;
  const P = res.P;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#FBF6EC;font:15px system-ui,sans-serif;color:#2b2b2b;width:1452px}h1,h2{text-align:center}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:26px 0 4px}p.s{text-align:center;color:#555;margin:0 auto 12px;max-width:1100px}.r{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;align-items:flex-end}figure{margin:0;text-align:center}figure img{display:block;border:1px solid #E3D9C6;border-radius:4px;max-width:270px}figcaption{font-size:12px;color:#555;margin-top:3px}</style>
<h1>Seasons 4.17.0 · The Poult's Turn, Self-Checks</h1><p class="s">Today's turn squeezes the side view flat and flips it (the bottom row). The two options draw a real turn instead. Option A turns away from you through a rear three-quarter and a rear view. Option B makes the turn during a peck, with the head down and hidden behind the body. The rear three-quarter is traced from the same NPS photograph (public domain) as the approved poult: the poult walking away, left of the front one.</p>` +
    sec('The Rear Three-Quarter Over the Photo', `The photo; the drawing over it at 50%; the drawing. Fit against the photo's own outline, traced by hand on the photograph independently of the drawing: <b>${res.fitBody}%</b> for the body, neck and head; <b>${res.fitAll}%</b> with the legs, which the photo has mid-stride and the turn has standing.`,
      `<div class="r">${fig(P.photo, 'the photograph')}${fig(P.over, 'the drawing over it at 50%')}${fig(P.draw, 'the drawing')}</div>`) +
    sec('Outline, Silhouette and Value', 'The two outlines (the photo in blue, the drawing in red); the photo\'s silhouette and the drawing\'s in solid black; the drawing in grayscale, lit from the upper left like the approved poult.',
      `<div class="r">${fig(P.outl, 'outlines')}${fig(P.silP, 'the photo, solid')}${fig(P.silD, 'the drawing, solid')}${fig(P.value, 'value')}</div>`) +
    sec('Option A: Turns Away Through a Rear View', 'Side, rear three-quarter, rear, rear three-quarter, side: every frame pivots on the same spot between its feet. Guest size, then 3×.',
      strip(res.frames.A, false, ['side', 'rear ¾', 'rear', 'rear ¾ (other way)', 'side (other way)']) + strip(res.frames.A, true, ['side', 'rear ¾', 'rear', 'rear ¾', 'side'])) +
    sec('Option B: Turns While Pecking', 'Side, the peck, from behind with the head down (only the rump shows), the peck facing the other way, side.',
      strip(res.frames.B, false, ['side', 'peck', 'rear, head down', 'peck (other way)', 'side (other way)']) + strip(res.frames.B, true, ['side', 'peck', 'rear, head down', 'peck', 'side'])) +
    sec('Today (4.16.1): the Flat Flip', 'For comparison: the side view squeezed to 30% and mirrored.', strip(res.frames.FLAT, false, ['side', 'squeezed', '30%', 'mirrored', 'side (other way)']));
  const p2 = await br.newPage({ viewport: { width: 1500, height: 900 } }); await p2.setContent(html); await p2.waitForTimeout(300);
  await p2.screenshot({ path: OUT, fullPage: true }); await br.close();
  console.log(JSON.stringify({ out: OUT, fitBody: res.fitBody, fitAll: res.fitAll }));
})().catch(e => { console.error(e); process.exit(1); });
