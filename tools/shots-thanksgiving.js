'use strict';
/**
 * DCC Seasons — the three-width check for 4.13.1 (a standing rule since
 * 4.14.0): Thanksgiving's scene on the REAL home page at 390, 768 and 1440,
 * frozen mid-crossing (the V over the moon's face), with the page as a
 * guest sees it: falling pieces, the header, the menu. Also a reel: the
 * crossing as an MP4 per width.
 *
 *   node tools/shots-thanksgiving.js [--version=4.13.1]
 *     -> build/Seasons - <v> thanksgiving <w>.png, ... <w>.mp4, ... scene sheet.png
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');
const V = (process.argv.find(a => a.startsWith('--version=')) || '--version=4.13.1').slice(10);
const OUT = path.join(ROOT, 'build');

(async () => {
  const shots = {};
  for (const W of [390, 768, 1440]) {
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigOnly = 'cranemoon'; cfg.vigFirst = 2500; cfg.vigGap = 1e9; cfg.vigDir = 1;
    cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; cfg.forceHour = 12;
    const ses = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner{display:none!important}</style>' }), { ...rt.opts(W), viewport: { width: W, height: W < 768 ? 844 : 900 }, dsf: 2 });
    const pg = ses.page;
    try {
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.vig === 'cranemoon', null, { timeout: 30000 });
      await pg.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
      const pic = await pg.evaluate(() => { const b = document.getElementById('header-image-main-inside').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
      const dir = path.join(OUT, '.tgreel-' + W); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
      let f = 0, still = null;
      for (let i = 0; i < 700; i++) {
        const s = await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.tick(1000 / 30, 1); const st = S.vigSt; return { on: S.vig === 'cranemoon', st: st && st.boxes ? { b: st.boxes, mx: st.mx, MR: st.MR } : null }; });
        if (!s.on) { break; }
        const buf = await pg.screenshot({ clip: { x: pic[0], y: pic[1], width: pic[2], height: pic[3] } });
        fs.writeFileSync(path.join(dir, String(f++).padStart(4, '0') + '.png'), buf);
        /* mid-crossing: the V's leader over the moon */
        if (!still && s.st && s.st.b.length > 3) { const L = s.st.b[3]; if (Math.abs((L[0] + L[2]) / 2 - s.st.mx) < s.st.MR * 0.5) { still = buf; } }
      }
      if (!still) { throw new Error('no frame with the V over the moon at ' + W); }
      const png = path.join(OUT, `Seasons - ${V} thanksgiving ${W}.png`); fs.writeFileSync(png, still); shots[W] = still.toString('base64');
      const mp4 = path.join(OUT, `Seasons - ${V} thanksgiving ${W}.mp4`);
      const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
      if (ff.status) { throw new Error(String(ff.stderr)); }
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(W, f, 'frames ->', path.basename(png), path.basename(mp4));
    } finally { await ses.close(); }
  }
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}h1{font-size:19px;text-align:center;margin:0 0 4px}.sub{color:#555;max-width:980px;margin:0 auto 12px}figure{margin:0 0 14px;text-align:center}img{border:1px solid #D9CDB6;border-radius:3px}</style>
    <h1>Seasons ${V} — Thanksgiving's Scene on the Real Home Page</h1>
    <p class="sub">Rob's pick A, high and small: the V of five sandhill cranes crosses November's full moon in the band of sky between the menu bar and the title, at least 8px clear of the title's letters, the tagline, the menu bar, the dial and the menu button at every width. The moon is pale, as a full moon high in the sky is, with the same real face as Halloween's; the cranes go dark as they cross it. Frozen mid-crossing.</p>
    ${[390, 768, 1440].map(w => `<figure><img src="data:image/png;base64,${shots[w]}" style="width:${w === 390 ? 300 : w === 768 ? 560 : 1100}px"><figcaption>${w}</figcaption></figure>`).join('')}`;
  const ses = await open(html, { viewport: { width: 1180, height: 900 }, dsf: 2 });
  await ses.page.waitForTimeout(400);
  await ses.page.setViewportSize({ width: 1180, height: await ses.page.evaluate(() => document.body.scrollHeight) });
  await ses.page.screenshot({ path: path.join(OUT, `Seasons - ${V} thanksgiving scene sheet.png`) });
  await ses.close();
})().catch(e => { console.error(e); process.exit(1); });
