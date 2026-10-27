'use strict';
/**
 * DCC Seasons — 4.13.2 lab: the Thanksgiving hen walking, stopping to peck
 * and walking on, her poults behind her, from the REAL engine on the mocked
 * clock at 390 (DPR 2): a frame strip and a 10-second MP4, camera following
 * her. Only the hen is on screen so she can be judged.
 *
 *   node tools/tg-hen-reel.js [--secs=10] [--out=name]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');
const SECS = +((process.argv.find(a => a.startsWith('--secs=')) || '--secs=10').slice(7));
const NAME = (process.argv.find(a => a.startsWith('--out=')) || '--out=Seasons - 4.13.2 hen walk 390').slice(6);
(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  const th = cfg.themes.thanksgiving.ambient;
  th.particles = th.particles.filter(x => x.s === 'turkey').map(x => ({ ...x, n: 1 })); cfg.density = 4;
  cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true, headerPic: false }), { viewport: { width: 390, height: 700 }, dsf: 2 });
  const pg = ses.page;
  await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' });
  await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.parts.some(p => p.sKey === 'turkey'), null, { timeout: 20000 });
  await pg.waitForTimeout(1500);   /* sprites decode */
  await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true);
    const h = S.parts.find(p => p.sKey === 'turkey'); h.dir = -1; h.vx = -22; h.x = 320; h.fs = 0; h.ft = 2.6; h.gap = 1; });
  const dir = path.join(ROOT, 'build', '.henreel'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const strip = [];
  for (let f = 0; f < SECS * 30; f++) {
    const st = await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.tick(1000 / 30, 1); const h = S.parts.find(p => p.sKey === 'turkey');
      const c = document.querySelector('canvas.dcc-seasons-canvas').getBoundingClientRect(); return { x: h.x + c.left, y: h.y + c.top, fs: h.fs, peck: h.peck }; });
    const clip = { x: 0, y: Math.max(0, Math.min(700 - 110, st.y - 70)), width: 390, height: 110 };
    const buf = await pg.screenshot({ clip });
    fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.png'), buf);
    if (f % 15 === 0) { strip.push({ b: buf.toString('base64'), t: (f / 30).toFixed(1), fs: st.fs, peck: st.peck }); }
  }
  await ses.close();
  const mp4 = path.join(ROOT, 'build', NAME + '.mp4');
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=780:-2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4]);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  fs.rmSync(dir, { recursive: true, force: true });
  const s2 = await open(`<body style="margin:0;background:#FBF6EC;font:12px sans-serif;display:flex;flex-wrap:wrap;gap:6px;padding:8px">${strip.map(x => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${x.b}" style="width:390px;border:1px solid #ccc"><figcaption>${x.t}s ${x.fs ? (x.peck ? 'stopped · peck' : 'stopped') : 'walking'}</figcaption></figure>`).join('')}</body>`, { viewport: { width: 1300, height: 800 } });
  await s2.page.setViewportSize({ width: 1300, height: await s2.page.evaluate(() => document.body.scrollHeight) });
  await s2.page.screenshot({ path: path.join(ROOT, 'build', NAME + ' strip.png') });
  await s2.close();
  console.log(mp4);
})().catch(e => { console.error(e); process.exit(1); });
