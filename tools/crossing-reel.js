'use strict';
/**
 * DCC Seasons — the plane crossing the moon while the witch dives across
 * it, as a 60 fps video at 2x (4.10.6): every frame 1/60 s apart on the
 * engine's mocked clock, the fixture's LIVE plane (its compositor flight
 * and propeller seeked to the same clock), Rob's live settings. Captured
 * at device pixels (a 1280 px page at 2x is 2560 px wide). It shows what
 * is drawn, frame by frame, not how fast a machine draws it: pacing is
 * measured by tools/measure-pacing.js and tools/test-frame-pacing.js.
 *
 *   node tools/crossing-reel.js [--width=1280] [--height=700] [--dsf=2] [--seed=7]
 *        [--out="build/Seasons - crossing 1280 2x"]
 *
 * Writes <out>.webm (VP8, 60 fps) and <out> strip.png (every 0.25 s).
 */
const path = require('path');
const { spawn } = require('child_process');
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

const argv = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i < 0 ? undefined : i), i < 0 ? '1' : a.slice(i + 1)]; }));
const W = +(argv.width || 1280), H = +(argv.height || 700), DSF = +(argv.dsf || 2), SEED = +(argv.seed || 7), FPS = 60;
const OUT = path.resolve(argv.out || `build/Seasons - crossing ${W} ${DSF}x`);
const FF = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

/* the same scene twice: Math.random seeded before the engine loads */
const SEEDED = `(() => { let a = ${SEED} >>> 0; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

async function session() {
  const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--ambient=0', '--diag']);
  cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.heroFirst = [9999, 10000]; cfg.forceHour = 12;
  const html = fixture({ kind: 'bravada', config: cfg, banner: true, heroFx: 'live' }).replace('<head>', `<head><script>${SEEDED}</script>`);
  const ses = await open(html, { viewport: { width: W, height: H }, dsf: DSF });
  await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' });
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
  /* to the scene's first frame on the mocked clock */
  await ses.page.evaluate((fps) => {
    const s = window.DCCSeasonsEngine._state; s.manual(true);
    for (let i = 0; i < 2000 && !s.vig; i++) { s.tick(1000 / fps, 1); }
  }, FPS);
  return ses;
}

(async () => {
  /* 1: where and when the witch is nearest the moon's middle */
  const probe = await session();
  const g = await probe.page.evaluate((fps) => {
    const s = window.DCCSeasonsEngine._state, v = s.vigSt, out = { best: 1e9, tc: 0, n: 0 };
    for (let i = 0; i < 2000 && s.vig; i++) {
      s.tick(1000 / fps, 1); out.n++;
      if (out.n === 1) { out.mx = v.mx + s.sky.left; out.my = v.my + s.sky.top; out.MR = v.MR; }
      if (v.wx != null && Math.abs(v.wx - v.mx) < out.best) { out.best = Math.abs(v.wx - v.mx); out.tc = out.n; } /* sky px, both */
    }
    return out;
  }, FPS);
  await probe.close();
  /* 2: the same scene, the plane timed to cross the moon with her */
  const ses = await session(), pg = ses.page;
  const fly = await pg.evaluate(([my, mx, W]) => {
    window.dccFly(my, (W + 380) / 260, 1);
    const an = document.getAnimations();
    an.forEach(a => a.pause());
    const f = document.querySelector('.dcc-hl-fly'), A = an.find(a => a.effect && a.effect.target === f), D = A.effect.getTiming().duration;
    const cxAt = c => { A.currentTime = c; const r = f.getBoundingClientRect(); return (r.left + r.right) / 2; };
    const x0 = cxAt(0), x1 = cxAt(D);
    /* the flight and the propeller follow the scene's clock; the banner's
     * flutter stays where the fixture holds it */
    window.__seek = an.filter(a => a === A || a.animationName === 'dccHlProp');
    return { D, cStar: (mx - x0) / (x1 - x0) * D };
  }, [g.my, g.mx, W]);
  const t0 = fly.cStar - g.tc * 1000 / FPS;   /* the flight's clock when the scene's clock is 0 */
  const band = { x: 0, y: Math.max(0, Math.round(g.my - g.MR - 120)), width: W, height: Math.min(H, Math.round(2 * g.MR + 240)) };
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'libvpx', '-b:v', '12M', '-deadline', 'good', '-cpu-used', '2', '-an', OUT + '.webm']);
  const ffDone = new Promise(r => ff.on('close', r));
  ff.stdin.on('error', () => {});
  const strip = [];
  for (let i = 0; i < g.n; i++) {
    await pg.evaluate(([c, fps]) => {
      window.__seek.forEach(a => { a.currentTime = Math.max(0, c); });
      window.DCCSeasonsEngine._state.tick(1000 / fps, 1);
    }, [t0 + (i + 1) * 1000 / FPS, FPS]);
    const jpg = await pg.screenshot({ type: 'jpeg', quality: 90, clip: band });
    ff.stdin.write(jpg);
    if (i % 15 === 0) { strip.push([i, jpg]); }
  }
  ff.stdin.end(); await ffDone;
  await ses.close();
  /* a strip around the crossing, every 0.25 s */
  const mid = strip.findIndex(([i]) => i >= g.tc), pick = strip.slice(Math.max(0, mid - 4), mid + 4);
  const { playwright } = require('./harness');
  const b = await playwright().chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.setContent(`<!doctype html><style>body{margin:0;background:#1f2328;color:#eee;font:13px system-ui;padding:8px}.c{margin-bottom:6px}.c img{width:1380px;display:block}.c p{margin:2px 0 0}</style>
    <div style="font-size:15px;margin-bottom:8px">The plane crossing the moon with the witch, ${W} px page at ${DSF}x, every 0.25 s (60 fps video alongside). The plane is the fixture's stand-in in the live markup; the moon and the witch are the real engine.</div>
    ${pick.map(([i, jpg]) => `<div class="c"><img src="data:image/jpeg;base64,${jpg.toString('base64')}"><p>${(i / FPS).toFixed(2)} s</p></div>`).join('')}`);
  await p.waitForTimeout(300);
  await p.setViewportSize({ width: 1400, height: await p.evaluate(() => document.body.scrollHeight) });
  await p.screenshot({ path: OUT + ' strip.png' });
  await b.close();
  console.log(JSON.stringify({ out: path.basename(OUT), frames: g.n, fps: FPS, seconds: +(g.n / FPS).toFixed(2), witchNearestMoonAt: +(g.tc / FPS).toFixed(2) }));
})().catch(e => { console.error(e); process.exit(1); });
