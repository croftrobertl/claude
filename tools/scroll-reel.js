'use strict';
/**
 * DCC Seasons — scrolling the page while the moon and the witch play
 * (4.10.7, Rob: the sky belongs to the header picture). A 60 fps video of
 * the whole screen at 2x: the engine on its mocked clock 1/60 s a frame,
 * the fixture's live plane seeked to the same clock, and the page scrolled
 * a little every frame — down until the picture has gone, then back up
 * while the scene is still running. Rob's live settings (embers on, no
 * falling sprites). It shows what is drawn where, frame by frame; pacing
 * is measured by tools/measure-pacing.js --scroll=1.
 *
 *   node tools/scroll-reel.js [--width=1280] [--height=700] [--dsf=2] [--seed=7]
 *        [--out="build/Seasons - scrolling 1280 2x"]
 */
const path = require('path');
const { spawn } = require('child_process');
const { config, open, playwright } = require('./harness');
const { page: fixture } = require('./fixture');

const argv = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i < 0 ? undefined : i), i < 0 ? '1' : a.slice(i + 1)]; }));
const W = +(argv.width || 1280), H = +(argv.height || 700), DSF = +(argv.dsf || 2), SEED = +(argv.seed || 7), FPS = 60;
const OUT = path.resolve(argv.out || `build/Seasons - scrolling ${W} ${DSF}x`);
const FF = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
const SEEDED = `(() => { let a = ${SEED} >>> 0; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

(async () => {
  const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--ambient=0', '--diag']);
  cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
  const html = fixture({ kind: 'bravada', config: cfg, banner: true, heroFx: 'live' }).replace('<head>', `<head><script>${SEEDED}</script>`);
  const ses = await open(html, { viewport: { width: W, height: H }, dsf: DSF });
  const pg = ses.page;
  await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' });
  await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
  await pg.waitForTimeout(600);
  /* to the scene's first frame, then the plane sent across the moon */
  const g = await pg.evaluate((fps) => {
    const s = window.DCCSeasonsEngine._state; s.manual(true);
    for (let i = 0; i < 2000 && !s.vig; i++) { s.tick(1000 / fps, 1); }
    s.tick(1000 / fps, 1);
    const v = s.vigSt, k = s.sky;
    window.dccFly(v.my + k.top, (innerWidth + 380) / 260, 1);
    window.__seek = document.getAnimations().filter(a => a.animationName === 'hfxfly' || a.animationName === 'dccHlProp');
    window.__seek.forEach(a => a.pause());
    return { my: v.my + k.top, picTop: k.top, picH: k.h };
  }, FPS);
  const N = 6 * FPS, maxY = g.picTop + g.picH + 60;
  /* 0-1 s still, 1-2.6 s down past the picture, 2.6-3.4 s away, 3.4-5 s
   * back up, then still: eased, as a trackpad flick reads */
  const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const scrollAt = t => t < 1 ? 0 : t < 2.6 ? maxY * ease((t - 1) / 1.6) : t < 3.4 ? maxY : t < 5 ? maxY * (1 - ease((t - 3.4) / 1.6)) : 0;
  const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-c:v', 'libvpx', '-b:v', '14M', '-deadline', 'good', '-cpu-used', '2', '-an', OUT + '.webm']);
  const ffDone = new Promise(r => ff.on('close', r));
  ff.stdin.on('error', () => {});
  const strip = [], log = [];
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    const st = await pg.evaluate(([c, fps, y]) => {
      window.scrollTo(0, y);
      window.__seek.forEach(a => { a.currentTime = c; });
      const s = window.DCCSeasonsEngine._state; s.tick(1000 / fps, 1);
      return { vig: s.vig, y: window.pageYOffset };
    }, [(i + 1) * 1000 / FPS, FPS, Math.round(scrollAt(t))]);
    const jpg = await pg.screenshot({ type: 'jpeg', quality: 88 });
    ff.stdin.write(jpg);
    log.push(st);
    if ([0.6, 1.5, 2.1, 3.0, 3.9, 4.5, 5.4].some(x => Math.abs(t - x) < 0.5 / FPS)) { strip.push([t, st, jpg]); }
  }
  ff.stdin.end(); await ffDone;
  await ses.close();
  const b = await playwright().chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  await p.setContent(`<!doctype html><style>body{margin:0;background:#1f2328;color:#eee;font:13px system-ui;padding:8px}.row{display:flex;flex-wrap:wrap;gap:8px}.c img{width:360px;display:block;border:1px solid #444}.c p{margin:3px 0 8px}</style>
    <div style="font-size:15px;margin-bottom:8px">Scrolling during the moon and the witch, ${W} px at ${DSF}x (60 fps video alongside). The moon, the witch and the plane scroll away with the header picture and come back with it; the embers stay on screen.</div>
    <div class="row">${strip.map(([t, st, jpg]) => `<div class="c"><img src="data:image/jpeg;base64,${jpg.toString('base64')}"><p>${t.toFixed(1)} s · scrolled ${st.y} px${st.vig ? '' : ' · scene over'}</p></div>`).join('')}</div>`);
  await p.waitForTimeout(300);
  await p.setViewportSize({ width: 1500, height: await p.evaluate(() => document.body.scrollHeight) });
  await p.screenshot({ path: OUT + ' strip.png' });
  await b.close();
  console.log(JSON.stringify({ out: path.basename(OUT), frames: N, fps: FPS, maxScroll: Math.max(...log.map(l => l.y)), sceneFrames: log.filter(l => l.vig).length }));
})().catch(e => { console.error(e); process.exit(1); });
