'use strict';
/**
 * DCC Seasons — a heron candidate crossing the screen, as a 30 fps WebM, at a
 * guest's size (100px, the engine's heron is 96) over the real fixture page.
 * Same flight as the engine's heron: 60-90 px/s (75 here), a band in the
 * upper half of the screen, the engine's gentle drift; the wingbeat and
 * glides come from tools/heron-lab.js.
 *
 *   node tools/heron-reel.js A 390 "build/reels/Seasons - heron A 390"
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

const [, , STYLE = 'A', WSTR = '390', OUTARG] = process.argv;
const W = +WSTR, H = W < 768 ? 844 : 800, FPS = 30, SPEED = 75, BIRD = 100;
const OUT = path.resolve(OUTARG || `build/reels/Seasons - heron ${STYLE} ${W}`);
const LAB = fs.readFileSync(path.join(__dirname, 'heron-lab.js'), 'utf8');
const FF = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

(async () => {
  /* the page a guest sees, effects at rest, as the backdrop */
  const cfg = config(['--placement=content', '--layering=front', '--density=16', '--ambient=0', '--theme=florida_keys']);
  cfg.engine = false;
  const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width: W, height: H }, dsf: 2 });
  await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
  await ses.page.waitForTimeout(500);
  const bg = (await ses.page.screenshot({ type: 'jpeg', quality: 95 })).toString('base64');
  const p = await ses.browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await p.setContent(`<!doctype html><body style="margin:0;overflow:hidden"><img src="data:image/jpeg;base64,${bg}" style="position:fixed;inset:0;width:${W}px;height:${H}px">
    <canvas id="c" style="position:fixed;inset:0;width:${W}px;height:${H}px"></canvas><script>${LAB}</script>`);
  await p.evaluate(([W, H, STYLE, SPEED, BIRD]) => {
    const c = document.getElementById('c'); c.width = W * 2; c.height = H * 2;
    const g = c.getContext('2d'); g.scale(2, 2);
    let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const fl = new HeronLab.Flight(rand);
    window.__bird = { x: -110, y: H * 0.3, ph: 0 };
    window.__step = dt => {
      const b = window.__bird;
      b.x += SPEED * dt; b.ph += dt * 2; b.y += Math.sin(b.ph) * 8 * dt;
      const pose = fl.step(dt);
      g.clearRect(0, 0, W, H);
      g.save(); g.translate(b.x, b.y); g.scale(-1, 1);   /* flying left to right */
      HeronLab.drawFlying(g, pose, STYLE, BIRD);
      g.restore();
      return b.x < W + 110;
    };
  }, [W, H, STYLE, SPEED, BIRD]);
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'libvpx', '-b:v', '6M', '-deadline', 'good', '-cpu-used', '2', '-an', OUT + '.webm']);
  let err = ''; const done = new Promise(r => ff.on('close', r));
  ff.stderr.on('data', d => { err += d; }); ff.stdin.on('error', () => {});
  let n = 0;
  while (await p.evaluate(dt => window.__step(dt), 1 / FPS) && n < FPS * 30) {
    ff.stdin.write(await p.screenshot({ type: 'jpeg', quality: 92 })); n++;
  }
  ff.stdin.end();
  if (await done) { throw new Error('ffmpeg: ' + err.slice(0, 300)); }
  console.log(JSON.stringify({ out: path.basename(OUT), frames: n, secs: +(n / FPS).toFixed(1) }));
  await ses.close();
})().catch(e => { console.error(e); process.exit(1); });
