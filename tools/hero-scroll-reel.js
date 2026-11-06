'use strict';
/**
 * DCC Seasons 4.17.0: the tom on the header photo's foot while the page
 * scrolls, at 390, with the phone's toolbar collapsing part way (emulated:
 * headless Chromium has no toolbar, so the window grows 88 px taller, as
 * iOS's does when its bottom bar hides). On the mocked clock, 30 fps, each
 * frame a screenshot of the whole window: he must stay on the photo's edge
 * and scroll away with it, never jumping. Prints, per frame, the photo's
 * foot and his canvas's foot.
 *
 *   node tools/hero-scroll-reel.js --out="<file without .mp4>" [--width=390] [--seed=14]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('width', 390), H = 844, OUT = arg('out', 'Seasons - scroll'), SEED = +arg('seed', 14);
(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; cfg.opacity = 0.7; cfg.gate = false;
  const ses = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner,div[style*="2147482000"]{display:none!important}html{scroll-behavior:auto!important}</style>' }), { ...rt.opts(W), viewport: { width: W, height: H }, dsf: 2,
    init: `Math.random = (() => { let a = ${SEED}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();` });
  const pg = ses.page;
  await pg.waitForFunction(() => { const S = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state; return S && S.tom.done && S.calm.tom[0] && S.calm.tom[0].hl; }, null, { timeout: 90000, polling: 200 });
  await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < 45; i++) { S.tick(1000 / 30, 1); } });
  const dir = OUT + '.frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const N = 30 * 5, log = [];
  for (let f = 0; f < N; f++) {
    const t = f / 30;
    /* 0-1 s still; 1-3.5 s scroll to 560 px (the toolbar hides at 1.6 s, as
     * iOS hides it once a scroll gets going); 3.5-5 s back up to 120 */
    const sy = t < 1 ? 0 : t < 3.5 ? 560 * (1 - Math.cos(Math.PI * (t - 1) / 2.5)) / 2 : 560 - 440 * (1 - Math.cos(Math.PI * Math.min(1, (t - 3.5) / 1.5))) / 2;
    const vh = t >= 1.6 && t < 4.2 ? H + 88 : H;
    if (pg.viewportSize().height !== vh) { await pg.setViewportSize({ width: W, height: vh }); }
    const m = await pg.evaluate(sy => { window.scrollTo(0, sy); const S = window.DCCSeasonsEngine._state; S.tick(1000 / 30, 1);
      const p = document.querySelector('#header-image-main-inside').getBoundingClientRect(), c = document.querySelector('canvas.dcc-seasons-ground').getBoundingClientRect();
      return { pic: +p.bottom.toFixed(2), tom: +c.bottom.toFixed(2) }; }, Math.round(sy));
    log.push({ f, sy: Math.round(sy), vh, ...m });
    await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), clip: { x: 0, y: 0, width: W, height: H } });
  }
  const r = spawnSync('/usr/bin/ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=' + W + ':-2:flags=area', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', OUT + '.mp4']);
  if (r.status) { throw new Error(String(r.stderr)); }
  fs.rmSync(dir, { recursive: true, force: true });
  const off = Math.max(...log.map(e => Math.abs(e.pic - e.tom)));
  console.log(JSON.stringify({ out: OUT + '.mp4', frames: N, worstFootMismatchPx: off, toolbarFrames: log.filter(e => e.vh > H).length }));
  await ses.close();
})().catch(e => { console.error(e); process.exit(1); });
