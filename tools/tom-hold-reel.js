'use strict';
/**
 * DCC Seasons — 4.16.0's review material for the Thanksgiving group (the tom
 * holds his strut; the poults step and peck on their own spots), from the
 * real engine on the mocked clock (30 fps), on the real-theme fixture:
 *
 *   clip  --mode=clip   N s of the screen's foot round his first fan rattle
 *   near  --mode=near   a 3x still of EVERY moment a poult comes nearest him
 *                       (it reaches the end of its spot on his side), over
 *                       --secs of play, and a sheet of them
 *
 *   node tools/tom-hold-reel.js --mode=clip|near --width=390|1440 --page=home|cottages --out="<path without extension>" [--secs=8] [--seed=14]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');
const cp = require('./calm-pages');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const MODE = arg('mode', 'clip'), W = +arg('width', 390), PAGE = arg('page', 'home'), SEED = +arg('seed', 14);
const SECS = +arg('secs', MODE === 'near' ? 60 : 8), H = W < 768 ? 844 : 900, BAND = W < 768 ? 200 : 220;
const OUT = arg('out', path.join(ROOT, 'build', `Seasons - tom ${PAGE} ${W}`));
const QUIET = '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important} .dcc-seasons-diag{display:none!important}</style>';

(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  const make = PAGE === 'cottages' ? cp.cottages : rt.page;
  const ses = await open(make({ config: cfg, extraHead: QUIET }), { ...rt.opts(W), viewport: { width: W, height: H }, dsf: MODE === 'near' ? 3 : 2,
    init: `Math.random = (() => { let a = ${SEED}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();` });
  const pg = ses.page;
  await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
  if (PAGE === 'cottages') { await pg.evaluate(() => document.querySelector('.dccs-root').scrollIntoView({ block: 'center' })); await pg.waitForTimeout(800); }
  const tick = n => pg.evaluate(n => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < n; i++) { S.tick(1000 / 30, 1); } return S.calm.tom[0]; }, n);
  /* he fades in over 1.2 s: start once he is up */
  let t = await tick(45);
  const dir = OUT + '.frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const group = t => { const g = t.geo, x0 = Math.max(0, g.lo[0] - 30), x1 = Math.min(W, g.hi[1] + 30); return { x: Math.floor(x0), y: H - BAND, width: Math.ceil(x1 - x0), height: BAND }; };
  if (MODE === 'clip') {
    /* the clock only runs forward, so film every frame from here and keep
     * SECS seconds starting 1.5 s before his first rattle */
    let f = 0, start = -1;
    for (; f < 30 * 40 && (start < 0 || f < start + SECS * 30); f++) {
      await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), clip: { x: 0, y: H - BAND, width: W, height: BAND } });
      t = await tick(1);
      if (start < 0 && t.sv >= 0) { start = Math.max(0, f - 45); }
    }
    if (start < 0) { start = 0; }
    const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-start_number', String(start), '-i', path.join(dir, '%04d.png'), '-frames:v', String(SECS * 30), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', OUT + '.mp4']);
    if (ff.status) { throw new Error(String(ff.stderr)); }
    fs.copyFileSync(path.join(dir, String(start + 52).padStart(4, '0') + '.png'), OUT + '.png');   /* a still mid-rattle */
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(JSON.stringify({ mode: MODE, page: PAGE, width: W, rattleAt: ((start + 45) / 30).toFixed(1), out: path.basename(OUT) }));
  } else {
    /* nearest: poult 1 at the top of its spot (his head side), poult 2 at the bottom (his tail side) */
    const shots = [], ep = [null, null];
    for (let f = 0; f < SECS * 30; f++) {
      t = await tick(1);
      const g = t.geo;
      for (const c of [0, 1]) {
        /* clear ground between the poult's widest reach and his drawing's box */
        const gap = c === 0 ? (t.x - g.tw / 2) - (t.kx[0] + g.E) : (t.kx[1] - g.E) - (t.x + g.tw / 2);
        const near = gap <= g.G + g.R * 0.3;   /* in the third of its spot on his side */
        if (near) {
          if (!ep[c]) { ep[c] = { c, f, gap: 1e9, file: path.join(dir, `${shots.length + 1} poult ${c + 1}.png`) }; shots.push(ep[c]); }
          if (gap < ep[c].gap - 0.01) {   /* the closest frame of this visit */
            ep[c].gap = +gap.toFixed(1); ep[c].f = f; ep[c].s = +(f / 30).toFixed(1); ep[c].state = ['standing', 'stepping', 'pecking', 'turning'][t.ks[c]];
            await pg.screenshot({ path: ep[c].file, clip: group(t) });
          }
        } else { ep[c] = null; }
      }
    }
    shots.forEach(s => { s.file = path.basename(s.file); });
    /* the sheet */
    const cells = shots.map(s => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, s.file)).toString('base64')}"><figcaption>Poult ${s.c + 1} nearest, ${s.s} s, ${s.state}; ${s.gap} px of clear ground to his drawing's box</figcaption></figure>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#FBF6EC;font:14px system-ui,sans-serif;color:#2b2b2b;width:${Math.max(900, W < 768 ? 900 : 1400)}px}h1{text-align:center;font-size:20px}figure{display:inline-block;margin:8px;vertical-align:top;width:${W < 768 ? 400 : 640}px}img{width:100%;border:1px solid #E3D9C6;border-radius:4px}figcaption{margin-top:4px}</style><h1>Seasons 4.16.0 · Every Moment a Poult Is Nearest the Tom · ${PAGE === 'home' ? 'Home' : 'Cottages'} at ${W} (3x)</h1>${cells}`;
    const br = await require('playwright').chromium.launch(); const p2 = await br.newPage({ viewport: { width: 1440, height: 900 } });
    await p2.setContent(html); await p2.waitForTimeout(300); await p2.screenshot({ path: OUT + '.png', fullPage: true }); await br.close();
    console.log(JSON.stringify({ mode: MODE, page: PAGE, width: W, shots: shots.length, minGap: Math.min(...shots.map(s => s.gap)), out: path.basename(OUT) }));
  }
  await ses.close();
})().catch(e => { console.error(e); process.exit(1); });
