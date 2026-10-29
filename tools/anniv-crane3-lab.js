'use strict';
/**
 * DCC Seasons — eye-check renders of the jointed crane (tools/anniv-crane3.js)
 * over its photographs: photo · 50% · drawing per key pose, and optional
 * in-between strips.
 *
 *   node tools/anniv-crane3-lab.js [--pose=stand] [--scale=1] [--modes=photo,overlay,drawing] [--out=file.png]
 *   node tools/anniv-crane3-lab.js --mix=stand,call --n=6 --out=file.png   (in-betweens, on a dark panel)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { DC3_SRC } = require('./anniv-crane3');
const { RIG0, RIG: RIGd } = require('./anniv-crane-rig');
/* over the photographs: the poses as traced; the in-betweens: the dance's */
const RIG = process.argv.some(a => a.startsWith('--mix=')) ? RIGd : RIG0;
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'anniv-crane-trace.json'), 'utf8'));

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
const OUT = arg('out', '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/c3.png');

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await pg.setContent(`<body style="margin:0;background:#FBF6EC"><div id=w style="display:flex;flex-wrap:wrap;gap:8px;padding:8px;align-items:flex-end"></div><script>${DC3_SRC}
    window.RIG = ${JSON.stringify(RIG)}; window.TR = ${JSON.stringify(Object.fromEntries(['stand', 'call', 'leap'].map(k => [k, T[k].ref])))};
    window.keys = async (items, Sc0, modes) => { for (const it of items) { const im = new Image(); im.src = it.img; await im.decode();
      const R = TR[it.k], [cx, cy, cw, ch] = R.crop, Sc = Sc0 || Math.min(1.3, 800 / ch);
      for (const mode of modes) {
        const c = document.createElement('canvas'); c.width = cw * Sc * 2; c.height = ch * Sc * 2; c.style.width = cw * Sc + 'px';
        const g = c.getContext('2d'); g.scale(2 * Sc, 2 * Sc); g.translate(-cx, -cy);
        if (mode !== 'drawing') { g.drawImage(im, 0, 0); } else { g.fillStyle = '#4E5A4E'; g.fillRect(cx, cy, cw, ch); }
        if (mode !== 'photo') { g.save(); g.globalAlpha = mode === 'overlay' ? 0.5 : 1; g.translate(R.ground[0], R.ground[1]); g.scale(R.H * R.face, R.H);
          dc3Paint(g, RIG[it.k], 0.3 * R.face, -0.954); g.restore(); }
        w.appendChild(c); } } };
    window.mix = (a, bb, n, H) => { const c = document.createElement('canvas'), W = Math.round(H * 1.5), Hh = Math.round(H * 1.6);
      c.width = W * n * 2; c.height = Hh * 2; c.style.width = W * n + 'px'; const g = c.getContext('2d'); g.scale(2, 2); g.fillStyle = '#4E5A4E'; g.fillRect(0, 0, W * n, Hh);
      for (let i = 0; i < n; i++) { const t = i / (n - 1), U = dc3Mix(RIG[a], RIG[bb], t); g.save(); g.translate(W * i + W * 0.42, Hh - 8); g.scale(H, H); dc3Paint(g, U, 0.3, -0.954); g.restore(); }
      w.appendChild(c); };</script>`);
  const mix = arg('mix', '');
  if (mix) { const [a, bb] = mix.split(','); await pg.evaluate(([a, bb, n, H]) => window.mix(a, bb, n, H), [a, bb, +arg('n', 6), +arg('h', 200)]); }
  else {
    const only = arg('pose', '');
    const items = ['stand', 'call', 'leap'].filter(k => !only || k === only).map(k => ({ k, img: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REF, T[k].ref.f)).toString('base64') }));
    await pg.evaluate(([it, sc, md]) => window.keys(it, sc, md), [items, +arg('scale', 0), arg('modes', 'photo,overlay,drawing').split(',')]);
  }
  await pg.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log(OUT);
})().catch(e => { console.error(e); process.exit(1); });
