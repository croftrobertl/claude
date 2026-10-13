'use strict';
/**
 * DCC Seasons — the seaplane crossing the Halloween moon (4.10.4), for Rob:
 * a frame strip and a short video from the REAL engine on the mocked clock,
 * on the fixture's stand-in header picture (tools/fixture.js heroFx: the
 * live markup and stacking of dcc-hero-life's plane, drawn here as a plain
 * red stand-in, not the mu-plugin's own art). Two rows: the build before
 * (DCC_ASSETS, e.g. 4.10.3: the moon over the plane) and this one.
 *
 *   node tools/fore-reel.js --width=390 --out="build/Seasons - plane over moon 390" [--before=<old assets/js>]
 */
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const WIDTH = +arg('width', 390), HEIGHT = WIDTH < 768 ? 844 : 800, OUT = path.resolve(arg('out', `build/Seasons - plane over moon ${WIDTH}`));
const BEFORE = arg('before', ''), FPS = 30, PICK = 6;
/* --mode=moon (the plane across the moon), banner (on along, until its
 * CSS banner crosses the moon too: 4.10.5), flyer (the flyer witch meets
 * the plane: 4.10.5) */
const MODE = arg('mode', 'moon'), N = MODE === 'banner' ? 80 : 48;
const FF = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

async function shoot(assets, video) {
  if (assets) { process.env.DCC_ASSETS = assets; } else { delete process.env.DCC_ASSETS; }
  for (const k of Object.keys(require.cache)) { if (k.includes(`${path.sep}tools${path.sep}`)) { delete require.cache[k]; } }
  const { config, open } = require('./harness');
  const { page: fixture } = require('./fixture');
  const cfg = MODE === 'flyer'
    ? config(['--theme=classic', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--diag'])
    : config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
  if (MODE === 'flyer') { cfg.heroOnly = 'witch'; cfg.heroFirst = [0.3, 0.31]; cfg.heroEvery = [0.3, 0.4]; cfg.vigFirst = 1e9; }
  else { cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; }
  cfg.forceHour = 12;
  const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true, heroFx: true }), { viewport: { width: WIDTH, height: HEIGHT }, dsf: 2 });
  const pg = ses.page;
  try {
    /* a guest's view: no test weather banner, no diagnostics panel */
    await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' });
    await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
    await pg.waitForTimeout(800); /* sprites decode */
    await pg.evaluate(() => { ['plane', 'catch', 'reeds', 'gator', 'wake', 'glint'].forEach(k => window.dccPose(k, { x: -900, y: -900 })); });
    let g, clip, fly = null;
    if (MODE === 'flyer') {
      /* run on until a flyer is crossing the header picture, a third of the
       * way in; the plane then flies to meet her */
      fly = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        const r = document.getElementById('header-image-main-inside').getBoundingClientRect();
        let last = null;
        for (let k = 0; k < 20000; k++) {
          s.tick(1000 / 30, 1);
          const p0 = s.heroXY, p = p0 && [p0[0] + s.sky.left, p0[1] + s.sky.top];   /* sky px to the viewport (4.10.7) */
          if (p && last && p[1] > r.top + 40 && p[1] < r.bottom - 40 && Math.abs(p[0] - innerWidth * (p[0] > last[0] ? 0.3 : 0.7)) < 4) { return { x: p[0], y: p[1], dir: p[0] > last[0] ? 1 : -1, vx: (p[0] - last[0]) * 30 }; }
          last = p;
        }
        return null;
      });
      if (!fly) { throw new Error('no flyer crossed the header picture'); }
      g = { mx: fly.x + fly.dir * (Math.abs(fly.vx) * N / FPS / 2), my: fly.y, MR: 40 };
      clip = { x: Math.max(0, g.mx - 170), y: Math.max(0, g.my - 70), width: 340, height: 140 };
    } else {
      g = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 900 && !(s.vig && s.vigSt && s.vigSt.moonA >= 0.99); i++) { s.tick(1000 / 30, 1); }
        return { mx: s.vigSt.mx + s.sky.left, my: s.vigSt.my + s.sky.top, MR: s.vigSt.MR };
      });
      /* the moon, with room either side for the plane coming and going */
      clip = { x: Math.max(0, g.mx - g.MR - 70), y: Math.max(0, g.my - g.MR - 22), width: 2 * g.MR + 140, height: 2 * g.MR + 44 };
    }
    let ff = null, ffDone = null;
    if (video) {
      ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
        '-c:v', 'libvpx', '-b:v', '6M', '-deadline', 'good', '-cpu-used', '2', '-an', video]);
      ffDone = new Promise(r => ff.on('close', r));
      ff.stdin.on('error', () => {});
    }
    const frames = [];
    for (let i = 0; i < N; i++) {
      if (MODE === 'flyer') {
        /* the plane flies the other way, to pass her where the strip looks */
        const x = g.mx - fly.dir * (170 - 340 * i / (N - 1)) * -1;
        await pg.evaluate(([x, y, f]) => window.dccPose('plane', { x, y, angle: 0, flip: f, banner: false }), [x, g.my + 2, fly.dir > 0]);
      } else {
        /* a level flyover with its banner out, left to right across the moon
         * (far enough, in banner mode, for the banner to cross it too) */
        const x = g.mx - 160 + (MODE === 'banner' ? 520 : 320) * i / (N - 1);
        await pg.evaluate(([x, y]) => window.dccPose('plane', { x, y, angle: 0, flip: false, banner: true }), [x, g.my + 4]);
      }
      await pg.evaluate(() => window.DCCSeasonsEngine._state.tick(1000 / 30, 1));
      const jpg = await pg.screenshot({ type: 'jpeg', quality: 92, clip });
      frames.push(jpg);
      if (ff) { ff.stdin.write(jpg); }
    }
    if (ff) { ff.stdin.end(); await ffDone; }
    return { frames, clip };
  } finally { await ses.close(); }
}

(async () => {
  const rows = [];
  const what = { moon: ['the moon covers the plane', 'the plane in front of the moon'], banner: ['the moon covers the banner', 'the plane and its banner in front of the moon'], flyer: ['the witch flies in front of the plane', 'the witch flies behind the plane'] }[MODE];
  if (BEFORE) { rows.push([arg('beforeLabel', 'before') + ': ' + what[0], await shoot(BEFORE, null)]); }
  rows.push([arg('label', 'this build') + ': ' + what[1], await shoot(null, OUT + '.webm')]);
  const { chromium } = require(path.join(process.env.SCRATCH || '', 'node_modules', 'playwright'));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1800, height: 900 } });
  const idx = MODE === 'banner' ? [...Array(PICK)].map((_, k) => Math.round(30 + k * (N - 34) / (PICK - 1))) : [...Array(PICK)].map((_, k) => Math.round(10 + k * (N - 21) / (PICK - 1)));
  const cw = 300;
  const html = rows.map(([label, r]) => `<div class="lab">${label}</div><div class="row">${idx.map(i => `<div class="c"><img src="data:image/jpeg;base64,${r.frames[i].toString('base64')}"><p>${(i / FPS).toFixed(2)} s</p></div>`).join('')}</div>`).join('');
  await p.setContent(`<!doctype html><style>body{margin:0;background:#1f2328;color:#eee;font:13px system-ui;padding:8px}.row{display:flex;gap:6px}.c img{width:${cw}px;display:block;border:1px solid #444}.c p{margin:3px 0 10px}.lab{font-weight:600;margin:4px 0 6px}</style>
    <div style="font-size:15px;margin-bottom:8px">${MODE === 'flyer' ? 'The flyer witch meeting the seaplane' : 'The seaplane crossing the moon'}, ${WIDTH}px screen. The plane and its banner are the fixture's stand-ins in the live markup; the moon and the witch are the real engine.</div>${html}`);
  await p.waitForTimeout(400);
  const w = await p.evaluate(() => document.body.scrollWidth), h = await p.evaluate(() => document.body.scrollHeight);
  await p.setViewportSize({ width: w, height: h });
  await p.screenshot({ path: OUT + ' strip.png' });
  await b.close();
  console.log(JSON.stringify({ out: path.basename(OUT), rows: rows.length, frames: N }));
})().catch(e => { console.error(e); process.exit(1); });
