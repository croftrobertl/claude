'use strict';
/**
 * DCC Seasons 4.17.0: film a poult's turn on the header picture's foot, from
 * the build in DCC_ASSETS (or the shipped js), on the mocked clock (30 fps),
 * seeded: 0.7 s before the turn starts to 1 s after it ends. Two clips: the
 * group at guest size on the header, and a 3x close-up of the turning poult.
 * Also a strip of every frame of the turn.
 *
 *   DCC_ASSETS=<js dir> node tools/turn-reel.js --width=390 --out="<path without extension>" [--seed=14] [--nth=1]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('width', 390), H = W < 768 ? 844 : 900, SEED = +arg('seed', 14), NTH = +arg('nth', 1), OUT = arg('out', 'Seasons - turn');
const QUIET = '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}</style>';

(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; cfg.opacity = 0.7; cfg.gate = false;
  const ses = await open(rt.page({ config: cfg, extraHead: QUIET }), { ...rt.opts(W), viewport: { width: W, height: H }, dsf: 3,
    init: `Math.random = (() => { let a = ${SEED}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();` });
  const pg = ses.page;
  await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 90000, polling: 200 });
  await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < 45; i++) { S.tick(1000 / 30, 1); } });
  const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  const dir = OUT + '.frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const buf = []; let seen = 0, start = -1, end = -1, who = -1, n = 0, box = null, prev = await pg.evaluate(() => window.DCCSeasonsEngine._state.calm.tom[0].ks);
  for (let i = 0; i < 30 * 60; i++) {
    const st = await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.tick(1000 / 30, 1); const t = S.calm.tom[0]; return { ks: t.ks, kx: t.kx, geo: t.geo }; });
    if (start < 0) { for (let c = 0; c < 2; c++) { if (st.ks[c] === 3 && prev[c] !== 3) { seen++; if (seen === NTH) { start = buf.length; who = c; } } } }
    else if (end < 0 && st.ks[who] !== 3) { end = buf.length; }
    prev = st.ks.slice();
    const file = path.join(dir, String(n++).padStart(4, '0') + '.png');
    await pg.screenshot({ path: file, clip: { x: 0, y: pic[3] - 170, width: W, height: 190 } });
    buf.push({ i, file, st });
    if (start >= 0 && !box) { const g = st.geo, cxp = pic[0] + st.kx[who], hw = Math.max(24, g.ku * 72 * 0.8); box = { x: Math.max(0, Math.min(W - 2 * hw, Math.round(cxp - hw))), y: Math.round(pic[3] - hw * 1.7), width: Math.round(hw * 2), height: Math.round(hw * 1.7 + 8) }; }
    if (end >= 0 && buf.length >= end + 30) { break; }
  }
  if (start < 0) { throw new Error('no turn seen'); }
  /* the close-up: crop each kept frame around the poult (3x pixels) */
  const keep = buf.slice(Math.max(0, start - 21));
  const list = keep.map(b => b.file);
  const cdir = OUT + '.close'; fs.rmSync(cdir, { recursive: true, force: true }); fs.mkdirSync(cdir);
  const bx = { x: box.x * 3, y: (box.y - (pic[3] - 170)) * 3, w: box.width * 3, h: box.height * 3 };
  list.forEach((f, k) => { spawnSync('/usr/bin/ffmpeg', ['-loglevel', 'error', '-y', '-i', f, '-vf', `crop=${bx.w}:${Math.min(bx.h, 570 - Math.max(0, bx.y))}:${bx.x}:${Math.max(0, bx.y)},scale=-2:420:flags=lanczos`, path.join(cdir, String(k).padStart(4, '0') + '.png')]); });
  const enc = (pat, out, vf) => { const r = spawnSync('/usr/bin/ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', pat, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]); if (r.status) { throw new Error(String(r.stderr)); } };
  const tmp = OUT + '.seq'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  list.forEach((f, k) => fs.copyFileSync(f, path.join(tmp, String(k).padStart(4, '0') + '.png')));
  enc(path.join(tmp, '%04d.png'), OUT + ' group.mp4', `scale=${W}:-2:flags=area,pad=ceil(iw/2)*2:ceil(ih/2)*2`);
  enc(path.join(cdir, '%04d.png'), OUT + ' close-up.mp4', 'pad=ceil(iw/2)*2:ceil(ih/2)*2');
  /* the strip: the turn's frames, every second one, from the close-up */
  const pre = Math.min(21, start), sf = fs.readdirSync(cdir).sort(), a = pre, b = Math.min(sf.length - 1, pre + (end - start) + 1), pick = [];
  for (let k = a - 2; k <= b + 1; k += 2) { if (sf[k]) { pick.push(path.join(cdir, sf[k])); } }
  const args = []; pick.forEach(p => args.push('-i', p));
  spawnSync('/usr/bin/ffmpeg', ['-loglevel', 'error', '-y', ...args, '-filter_complex', pick.map((_, k) => `[${k}]`).join('') + `hstack=inputs=${pick.length}`, OUT + ' strip.png']);
  [dir, cdir, tmp].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  console.log(JSON.stringify({ out: OUT, turnFrames: end - start, poult: who, frames: list.length }));
  await ses.close();
})().catch(e => { console.error(e); process.exit(1); });
