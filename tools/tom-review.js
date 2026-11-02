'use strict';
/**
 * DCC Seasons — 4.14.4, Rob's phone review of Thanksgiving: the review
 * material for the three fixes, from the real engine on the real home page
 * at 390 (DPR 3), on the mocked clock with a seeded field.
 *
 *  1. the tom at his LOWEST BEND (pose p4, the deepest feeding frame),
 *     before (DCC_BEFORE, a copy of the build before the fix) and after:
 *     the guest-size band and a 3x close-up;
 *  2. the poults walking behind him, 6 s, a close-up that follows him;
 *  3. the cornucopia falling with the pieces, 6 s (weighted up for the clip
 *     only, so it shows within the six seconds).
 *
 *   node tools/tom-review.js --out=<dir>   (writes <dir>/img and <dir>/clips)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = arg('out', path.join(__dirname, '..', 'build', 'Seasons - 4.14.4 review'));
const SEED = n => `Math.random = (() => { let a = ${n}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();`;
const QUIET = '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}</style>';
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'clips'), { recursive: true });

async function page(assets, cfgMod, seed) {
  if (assets) { process.env.DCC_ASSETS = assets; } else { delete process.env.DCC_ASSETS; }
  delete require.cache[require.resolve('./harness')];
  const H = require('./harness');
  const cfg = H.config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  if (cfgMod) { cfgMod(cfg); }
  const ses = await H.open(rt.page({ config: cfg, extraHead: QUIET }), { ...rt.opts(390), viewport: { width: 390, height: 844 }, dsf: 3, init: SEED(seed) });
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
  await ses.page.evaluate(() => {
    const S = window.DCCSeasonsEngine._state; S.manual(true);
    const cache = S.tom.cache, key = new Map(); for (const k in cache) { key.set(cache[k].c, k); }
    const P = CanvasRenderingContext2D.prototype, di = P.drawImage;
    window.__tk = [];
    P.drawImage = function (src, x, y, w, h) {
      const k = key.get(src);
      if (k && w !== undefined) {
        const m = this.getTransform(), cv = this.canvas, cr = cv.getBoundingClientRect(), z = cv.width / cr.width;
        const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => [(m.a * a + m.c * b + m.e) / z + cr.left, (m.b * a + m.d * b + m.f) / z + cr.top]);
        window.__tk.push({ k, L: Math.min(...pts.map(p => p[0])), R: Math.max(...pts.map(p => p[0])), T: Math.min(...pts.map(p => p[1])), B: Math.max(...pts.map(p => p[1])) });
      }
      return di.apply(this, arguments);
    };
  });
  return ses;
}
const tick = (pg, n) => pg.evaluate(n => { window.__tk = []; window.DCCSeasonsEngine._state.tick(1000 / 30, n); return window.__tk; }, n);
function encode(dir, mp4) {
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', mp4]);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  fs.rmSync(dir, { recursive: true, force: true });
}

(async () => {
  /* 1. the lowest bend, before and after */
  for (const [tag, assets] of [['before', process.env.DCC_BEFORE], ['after', null]]) {
    if (tag === 'before' && !assets) { console.log('no DCC_BEFORE: skipping the before frame'); continue; }
    const ses = await page(assets, null, 14), pg = ses.page;
    let box = null;
    for (let i = 0; i < 30 * 90 && !box; i++) {
      const d = await tick(pg, 1);
      const t = d.find(q => q.k === 'p4');
      if (t && t.L > 4 && t.R < 386) { box = t; }
    }
    if (!box) { throw new Error('the tom never bent to p4 on screen'); }
    const band = { x: 0, y: Math.max(0, box.B - 230), width: 390, height: Math.min(230, 844 - Math.max(0, box.B - 230)) };
    await pg.screenshot({ path: path.join(OUT, 'img', `1 tom lowest bend ${tag} 390.png`), clip: band });
    const cx = (box.L + box.R) / 2, w = 150, h = 120;
    await pg.screenshot({ path: path.join(OUT, 'img', `1 tom lowest bend ${tag} 3x.png`), clip: { x: Math.max(0, Math.min(390 - w, cx - w / 2)), y: box.B - h + 6, width: w, height: h } });
    console.log(tag, JSON.stringify(box));
    await ses.close();
  }

  /* 2. the poults walking, a close-up that follows the group */
  {
    const ses = await page(null, null, 14), pg = ses.page, dir = path.join(OUT, '.f2');
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    /* start when the tom is fully on screen and walking */
    for (let i = 0; i < 30 * 60; i++) { const d = await tick(pg, 1); const t = d.find(q => /^w\d+$/.test(q.k)); if (t && t.L > 120 && t.R < 360) { break; } }
    let cxs = null;
    for (let f = 0; f < 180; f++) {
      const d = await tick(pg, 1);
      const all = d.filter(q => q.R > 0 && q.L < 390);
      if (all.length) { const L = Math.min(...all.map(q => q.L)), R = Math.max(...all.map(q => q.R)), B = Math.max(...all.map(q => q.B)); const c = (L + R) / 2; cxs = cxs == null ? c : cxs + (c - cxs) * 0.15; cxs = Math.max(140, Math.min(250, cxs)); var bb = B; }
      await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), clip: { x: (cxs || 195) - 140, y: Math.min(844, (bb || 840)) - 110, width: 280, height: 110 } });
    }
    encode(dir, path.join(OUT, 'clips', '2 poults walk 390.mp4'));
    await ses.close();
  }

  /* 3. the cornucopia falling with the pieces */
  {
    const ses = await page(null, cfg => { const r = cfg.themes.thanksgiving.ambient.particles.find(p => p.s === 'cornucopia'); r.w = 6; }, 5), pg = ses.page, dir = path.join(OUT, '.f3');
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    await tick(pg, 60);
    for (let f = 0; f < 180; f++) { await tick(pg, 1); await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png') }); }
    fs.copyFileSync(path.join(dir, '0090.png'), path.join(OUT, 'img', '3 cornucopia falling 390.png'));
    encode(dir, path.join(OUT, 'clips', '3 cornucopia falls 390.mp4'));
    await ses.close();
  }
  console.log('done', OUT);
})().catch(e => { console.error(e); process.exit(1); });
