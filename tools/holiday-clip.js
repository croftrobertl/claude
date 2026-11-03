'use strict';
/**
 * DCC Seasons — the holiday release's review clips: N seconds of one theme
 * on the REAL home page at 390 (DPR 2), from the real engine on the mocked
 * clock (30 fps), as an MP4 (and a mid-clip still).
 *
 *   node tools/holiday-clip.js --theme=christmas --scene=giftdrop --out="Seasons - 4.14.4 gift drop 3"
 *        [--secs=6] [--width=390] [--knobs='{"optGifts":3}'] [--skip=1.5] [--pieces=0] [--seed=14] [--weight=andate:8]
 *
 * --scene forces one scene (vigOnly) at --at seconds; --pieces=0 holds the
 * falling pieces back; --skip ticks that many seconds before recording.
 * DCC_ASSETS selects another build's js folder (a scratch options build).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const THEME = arg('theme', 'thanksgiving'), SCENE = arg('scene', ''), SECS = +arg('secs', 6), W = +arg('width', 390);
const OUT = arg('out', 'Seasons - clip'), KNOBS = JSON.parse(arg('knobs', '{}')), SKIP = +arg('skip', 0), AT = +arg('at', 0.5);
const H = { 390: 844, 768: 1024, 1440: 900 }[W] || 844;
(async () => {
  const cfg = config(['--theme=' + THEME, '--placement=content', '--layering=front', '--density=16', '--diag'].concat(arg('pieces', '1') === '0' ? ['--noparticles'] : []));
  cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  if (SCENE) { cfg.vigOnly = SCENE; cfg.vigFirst = AT * 1000; cfg.vigGap = 1e9; } else { cfg.vigFirst = 1e9; }
  Object.assign(cfg, KNOBS);
  /* --weight=key:w,key:w raises pieces' weights for a review clip only, so
   * the piece under review shows within the clip's seconds */
  for (const kv of (arg('weight', '') || '').split(',').filter(Boolean)) {
    const [k, w] = kv.split(':'); const r = cfg.themes[THEME].ambient.particles.find(q => q.s === k);
    if (!r) { throw new Error('no piece ' + k); } r.w = +w;
  }
  const ses = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}</style>' }), { ...rt.opts(W), viewport: { width: W, height: H }, dsf: 2, init: `Math.random = (() => { let a = ${+arg('seed', 14)}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();` });
  const pg = ses.page;
  await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(n => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < n; i++) { S.tick(1000 / 30, 1); } }, Math.round(SKIP * 30));
  const dir = path.join(ROOT, 'build', '.clip-' + process.pid); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let f = 0; f < SECS * 30; f++) {
    await pg.evaluate(() => window.DCCSeasonsEngine._state.tick(1000 / 30, 1));
    fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.png'), await pg.screenshot());
  }
  const log = await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; return { vig: (S.vigLog || []).slice(-4) }; }).catch(() => ({}));
  await ses.close();
  const mp4 = path.join(ROOT, 'build', OUT + '.mp4');
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', mp4]);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  const mid = arg('still', String(Math.floor(SECS * 15)));
  fs.copyFileSync(path.join(dir, String(+mid).padStart(4, '0') + '.png'), path.join(ROOT, 'build', OUT + '.png'));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ mp4: path.basename(mp4), bytes: fs.statSync(mp4).size, log }));
})().catch(e => { console.error(e); process.exit(1); });
