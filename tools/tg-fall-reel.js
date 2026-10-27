'use strict';
/**
 * DCC Seasons — 4.13.2 lab: ten seconds of Thanksgiving's falling pieces on
 * the REAL home page at 390 (DPR 2), from the real engine on the mocked
 * clock, the scene held back so the motion can be judged: leaves rock and
 * drift, heavy pieces drop and turn. Also counts how many are on screen.
 *
 *   node tools/tg-fall-reel.js [--secs=10] [--out=name]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');
const SECS = +((process.argv.find(a => a.startsWith('--secs=')) || '--secs=10').slice(7));
const NAME = (process.argv.find(a => a.startsWith('--out=')) || '--out=Seasons - 4.13.2 falling 390').slice(6);
(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  const ses = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}</style>' }), { ...rt.opts(390), viewport: { width: 390, height: 844 }, dsf: 2 });
  const pg = ses.page;
  await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.parts.length > 3, null, { timeout: 20000 });
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < 300; i++) { S.tick(1000 / 30, 1); } });
  const dir = path.join(ROOT, 'build', '.fallreel'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const counts = [];
  for (let f = 0; f < SECS * 30; f++) {
    const n = await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.tick(1000 / 30, 1);
      return S.parts.filter(p => !p.dormant && p.alpha > 0 && p.y > -20 && p.y < innerHeight + 20).length; });
    counts.push(n);
    fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.png'), await pg.screenshot());
  }
  await ses.close();
  const mp4 = path.join(ROOT, 'build', NAME + '.mp4');
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4]);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  fs.copyFileSync(path.join(dir, String(Math.floor(SECS * 15)).padStart(4, '0') + '.png'), path.join(ROOT, 'build', '.fall-mid.png'));
  fs.rmSync(dir, { recursive: true, force: true });
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  console.log(JSON.stringify({ mp4: path.basename(mp4), onScreenAvg: +avg.toFixed(1), min: Math.min(...counts), max: Math.max(...counts) }));
})().catch(e => { console.error(e); process.exit(1); });
