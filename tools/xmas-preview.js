'use strict';
/**
 * DCC Seasons — Santa's team MOVING, on the real home page, for Rob to judge
 * option A (high and small) against B (the moon in the trees, the team high)
 * before the build: about three seconds of each at 390, 768 and 1440, the
 * team mid-crossing, the moon's cut and the red nose visible. The geometry
 * is the placement lab's (tools/xmas-place.js, its last run's JSON); the
 * painters are the engine's; the gallop runs at the engine's rate (1.25
 * strides a second) and the team at its speed (2.2 sleigh lengths a second).
 *
 *   node tools/xmas-preview.js       (writes build/Seasons - 4.14.1 santa <opt> <w>.mp4)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { open } = require('./harness');
const rt = require('./real-theme');
const { PAINT, LAB } = require('./xmas-place');

const OUT = path.join(__dirname, '..', 'build');
const R = JSON.parse(fs.readFileSync(path.join(OUT, 'Seasons - 4.14.1 christmas placement.json'), 'utf8'));
const FPS = 30, SECS = 3, DSF = 2;

(async () => {
  const made = [];
  for (const W of [390, 768, 1440]) {
    const ses = await open(rt.page(), { viewport: { width: W, height: { 390: 844, 768: 1024, 1440: 900 }[W] }, extra: rt.route, dsf: DSF });
    const pg = ses.page;
    await pg.waitForTimeout(1000);
    await pg.addScriptTag({ content: PAINT + LAB });
    const pic = await pg.evaluate(() => { const r = document.getElementById('header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    for (const name of ['A', 'B']) {
      const o = R[W].opts[name];
      if (!o || o.none) { console.log(W, name, 'none'); continue; }
      const dir = path.join(OUT, `.prev-${name}-${W}`);
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
      for (let f = 0; f < FPS * SECS; f++) {
        const t = f / FPS;
        await pg.evaluate(({ o, t, SECS }) => {
          const host = document.getElementById('header-image-main-inside'), pr = host.getBoundingClientRect();
          let c = document.getElementById('xv');
          if (!c) { c = document.createElement('canvas'); c.id = 'xv'; c.style.cssText = 'position:absolute;left:0;top:0;z-index:2147483000;pointer-events:none'; host.appendChild(c); }
          c.width = pr.width * 2; c.height = pr.height * 2; c.style.width = pr.width + 'px'; c.style.height = pr.height + 'px';
          const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
          const mo = o.mo, L = o.L, v = L * 2.2;
          g.save(); g.translate(mo.x, mo.y); moonPaint(g, mo.r); g.restore();
          const x = mo.x - 1.4 * L + v * (t - SECS / 2);
          rig(g, x, o.ay, L, 1, 0, t * 1.25, mo);
        }, { o, t, SECS });
        await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } });
      }
      const mp4 = path.join(OUT, `Seasons - 4.14.1 santa ${name} ${W}.mp4`);
      const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'),
        '-vf', `scale=${W * DSF}:-2:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', mp4]);
      if (ff.status) { throw new Error(String(ff.stderr)); }
      fs.rmSync(dir, { recursive: true, force: true });
      made.push(mp4); console.log(W, name, 'L', o.L, 'moon r', o.mo.r, '->', path.basename(mp4));
    }
    await ses.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
