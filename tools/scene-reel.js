'use strict';
/**
 * DCC Seasons — render a scene or a hero for Rob to judge: a WebM video,
 * a frame strip and a path trace, from the REAL engine on the mocked clock
 * (so every frame is exact and nothing depends on machine load).
 *
 *   node tools/scene-reel.js --scene=witchmoon --theme=halloween --width=390 \
 *        --out="build/Seasons - witch 390" [--frames=8] [--closeup=18] [--follow=18] [--arrival=18] [--banner=home|page]
 *   node tools/scene-reel.js --hero=heron --theme=florida_keys --width=1280 --out=... [--set=heronLand:1]
 *
 * --set=key:value (repeatable) sets a debug CFG key on the page config.
 * The video is VP8 WebM (the only encoder in Playwright's bundled ffmpeg),
 * 30 fps; frames are JPEG screenshots piped straight into it.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SCENE = arg('scene'), HERO = arg('hero'), THEME = arg('theme', 'halloween');
const WIDTH = +arg('width', 390), HEIGHT = +arg('height', WIDTH < 768 ? 844 : 800);
const OUT = path.resolve(arg('out', `build/Seasons - reel ${SCENE || HERO} ${WIDTH}`));
const NFR = +arg('frames', 8), FPS = 30, TAIL = +arg('tail', 0.6);
const FF = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

(async () => {
  const cfg = config(['--placement=content', '--layering=front', '--density=16', '--ambient=0', '--diag', `--theme=${THEME}`]);
  cfg.forceHour = 12;
  if (SCENE) { cfg.vigOnly = SCENE; cfg.vigFirst = 300; cfg.heroFirst = [9999, 10000]; }
  if (HERO) { cfg.heroOnly = HERO; cfg.heroFirst = [0.3, 0.31]; cfg.vigFirst = 1e9; }
  args.filter(a => a.startsWith('--set=')).forEach(a => { const [k, v] = a.slice(6).split(':'); cfg[k] = isNaN(+v) ? v : +v; });
  const ses = await open('<!doctype html><title>x</title>', { viewport: { width: WIDTH, height: HEIGHT }, dsf: 2 });
  await ses.page.addInitScript(() => { try { sessionStorage.setItem('dcc_seasons_visit', '1'); } catch (e) { /* blocked */ } });
  /* A guest's view: no test weather banner, no diagnostics panel. */
  await ses.page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}';
    document.head.appendChild(st);
  }); });
  /* --banner=home|page: the live banner shape (a header picture with the
   * page title over it), the homepage's or another page's */
  const BANNER = arg('banner', '');
  await ses.page.route('http://dcc.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture({ kind: 'bravada', config: cfg, banner: BANNER === 'home' ? true : (BANNER === 'page' ? 'page' : false) }) }));
  await ses.page.goto('http://dcc.test/', { waitUntil: 'load' });
  const P = ses.page;
  try {
    await P.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
    await P.waitForTimeout(600); /* sprites decode */
    await P.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
    /* run up to the start, then record until it ends (+ a short tail) */
    const live = SCENE ? 'vig' : 'hero';
    await P.evaluate(live => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < 600 && !s[live]; i++) { s.tick(1000 / 30, 1); } }, live);
    const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-c:v', 'libvpx', '-b:v', '6M', '-deadline', 'good', '-cpu-used', '2', '-an', OUT + '.webm']);
    /* 'pipe:0', not '-': this ffmpeg build has no '-' input. Listen for the
     * exit NOW — an ffmpeg that dies at once would otherwise close before
     * anyone waits on it, and the wait never returns. */
    let ffErr = '';
    const ffDone = new Promise(r => ff.on('close', r));
    ff.stderr.on('data', d => { ffErr += d; });
    ff.stdin.on('error', () => { /* reported via the exit code */ });
    const frames = [], track = [];
    let pathPts = null;
    let n = 0, tail = Math.round(TAIL * FPS), done = false;
    while (n < FPS * 40) {
      const st = await P.evaluate(live => {
        const s = window.DCCSeasonsEngine._state;
        s.tick(1000 / 30, 1);
        const v = s.vigSt || {};
        return { on: !!s[live], wx: v.wx, wy: v.wy, moon: v.moonA, hero: s.heroXY, mx: v.mx, my: v.my, R: v.R, MR: v.MR, W: v.W, wi: v.wi, l0: v.loop0, pts: v.pts || null };
      }, live);
      if (st.pts && !pathPts) { pathPts = st.pts; }
      st.pts = null;
      const jpg = await P.screenshot({ type: 'jpeg', quality: 92 });
      ff.stdin.write(jpg);
      frames.push(jpg); track.push(st);
      n++;
      if (!st.on) { done = true; if (--tail <= 0) { break; } }
    }
    ff.stdin.end();
    const code = await ffDone;
    if (code) { throw new Error('ffmpeg failed: ' + ffErr.slice(0, 300)); }
    if (!done) { console.warn('warning: it did not end within 40 s'); }
    /* the path, as the engine built it */
    const pts = pathPts;
    const xy = track.map(t => t.wx != null ? [t.wx, t.wy] : (t.hero ? t.hero : null));
    const on = track.map((t, i) => xy[i] ? i : -1).filter(i => i >= 0);
    const pick = [];
    for (let k = 0; k < NFR; k++) { pick.push(on[Math.round(k * (on.length - 1) / (NFR - 1))]); }
    /* strip + path trace, composed in the page itself */
    const b64 = i => 'data:image/jpeg;base64,' + frames[i].toString('base64');
    const W = WIDTH, H = HEIGHT;
    const strip = await ses.browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const cellW = Math.min(W, 420), crop = Math.round(Math.min(H, SCENE ? 460 : H));
    await strip.setContent(`<!doctype html><style>body{margin:0;background:#1f2328;font:13px system-ui;color:#eee}
      .row{display:flex;gap:6px;padding:8px}.c{width:${cellW}px}.c div{height:${crop * cellW / W}px;overflow:hidden;border:1px solid #444}
      .c img{width:${cellW}px;display:block}.t{padding:3px 0}</style><div class="row">${pick.map((i, k) => `<div class="c"><div><img src="${b64(i)}"></div><p class="t">${(i / FPS).toFixed(1)} s</p></div>`).join('')}</div>`);
    await strip.waitForTimeout(300);
    const sw = await strip.evaluate(() => document.querySelector('.row').scrollWidth);
    await strip.setViewportSize({ width: sw, height: 900 });
    await strip.locator('.row').screenshot({ path: OUT + ' strip.png' });
    /* --closeup=N: N frames magnified around the scene's centre (mx, my)
     * and its loop radius, in a grid, for judging the motion itself */
    const CLOSE = +arg('closeup', 0), g0 = track.find(t => t.R);
    if (CLOSE && g0) {
      const half = g0.R + 80, bx = g0.mx - half, by = g0.my - half, box = 2 * half, cell = 300, k = cell / box;
      const inBox = on.filter(i => xy[i] && xy[i][0] > bx - 20 && xy[i][0] < bx + box + 20 && xy[i][1] > by - 20 && xy[i][1] < by + box + 20);
      const cp = [];
      for (let j = 0; j < CLOSE; j++) { cp.push(inBox[Math.round(j * (inBox.length - 1) / (CLOSE - 1))]); }
      await strip.setViewportSize({ width: 1600, height: 900 });
      await strip.setContent(`<!doctype html><style>body{margin:0;background:#1f2328;font:13px system-ui;color:#eee}
        .g{display:grid;grid-template-columns:repeat(${Math.min(CLOSE, 6)},${cell}px);gap:6px;padding:8px}.c div{width:${cell}px;height:${cell}px;overflow:hidden;border:1px solid #444}
        .c img{width:${W * k}px;display:block;margin-left:${-bx * k}px;margin-top:${-by * k}px}.t{padding:3px 0}</style><div class="g">${cp.map(i => `<div class="c"><div><img src="${b64(i)}"></div><p class="t">${(i / FPS).toFixed(2)} s</p></div>`).join('')}</div>`);
      await strip.waitForTimeout(300);
      await strip.setViewportSize({ width: Math.min(CLOSE, 6) * (cell + 6) + 16, height: 900 });
      await strip.locator('.g').screenshot({ path: OUT + ' closeup.png' });
    }
    /* --arrival=N: the dive onto the moon, a fixed camera on the moon,
     * N frames from just before she reaches it until she is on the loop */
    const ARR = +arg('arrival', 0);
    if (ARR && g0 && g0.MR) {
      const near = on.filter(i => track[i].wi != null && Math.hypot(xy[i][0] - g0.mx, xy[i][1] - g0.my) < g0.MR + 1.6 * g0.W && track[i].wi <= track[i].l0 + 12);
      const half = g0.MR + 1.4 * g0.W, cell = 300, k = cell / (2 * half), bx = g0.mx - half, by = g0.my - half;
      const ap = [];
      for (let j = 0; j < ARR; j++) { ap.push(near[Math.round(j * (near.length - 1) / (ARR - 1))]); }
      await strip.setViewportSize({ width: 1600, height: 900 });
      await strip.setContent(`<!doctype html><style>body{margin:0;background:#1f2328;font:13px system-ui;color:#eee}
        .g{display:grid;grid-template-columns:repeat(6,${cell}px);gap:6px;padding:8px}.c div{width:${cell}px;height:${cell}px;overflow:hidden;border:1px solid #444}
        .c img{width:${W * k}px;display:block;margin-left:${-bx * k}px;margin-top:${-by * k}px}.t{padding:3px 0}</style><div class="g">${ap.map(i => `<div class="c"><div><img src="${b64(i)}"></div><p class="t">${(i / FPS).toFixed(2)} s</p></div>`).join('')}</div>`);
      await strip.waitForTimeout(300);
      await strip.setViewportSize({ width: 6 * (cell + 6) + 16, height: 900 });
      await strip.locator('.g').screenshot({ path: OUT + ' arrival.png' });
    }
    /* --follow=N: N frames magnified 3x around the actor itself */
    const FOL = +arg('follow', 0);
    if (FOL) {
      const half = 70, cell = 280, k = cell / (2 * half);
      const fp = [];
      const vis = on.filter(i => xy[i][0] > 30 && xy[i][0] < W - 30 && xy[i][1] > 20);
      for (let j = 0; j < FOL; j++) { fp.push(vis[Math.round(j * (vis.length - 1) / (FOL - 1))]); }
      await strip.setViewportSize({ width: 1600, height: 900 });
      await strip.setContent(`<!doctype html><style>body{margin:0;background:#1f2328;font:13px system-ui;color:#eee}
        .g{display:grid;grid-template-columns:repeat(6,${cell}px);gap:6px;padding:8px}.c div{width:${cell}px;height:${cell}px;overflow:hidden;border:1px solid #444}
        .c img{width:${W * k}px;display:block}.t{padding:3px 0}</style><div class="g">${fp.map(i => `<div class="c"><div><img src="${b64(i)}" style="margin-left:${-(xy[i][0] - half) * k}px;margin-top:${-(xy[i][1] - half) * k}px"></div><p class="t">${(i / FPS).toFixed(2)} s</p></div>`).join('')}</div>`);
      await strip.waitForTimeout(300);
      await strip.setViewportSize({ width: 6 * (cell + 6) + 16, height: 900 });
      await strip.locator('.g').screenshot({ path: OUT + ' follow.png' });
    }
    /* path trace: every frame's position over the middle frame, plus the
     * screen edges, so "stays on screen" can be seen, not just asserted */
    const mid = on[Math.floor(on.length / 2)];
    await strip.setViewportSize({ width: W, height: H });
    await strip.setContent(`<!doctype html><style>body{margin:0}</style><div style="position:relative;width:${W}px;height:${H}px">
      <img src="${b64(mid)}" style="width:${W}px;height:${H}px;display:block"><canvas id="c" width="${W}" height="${H}" style="position:absolute;inset:0"></canvas></div>`);
    await strip.evaluate(([xy, pts]) => {
      const g = document.getElementById('c').getContext('2d');
      if (pts) { g.strokeStyle = 'rgba(255,212,59,.9)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
      g.setLineDash([]); g.fillStyle = 'rgba(230,73,128,.9)';
      xy.forEach((p, i) => { if (p && i % 6 === 0) { g.beginPath(); g.arc(p[0], p[1], 3, 0, 7); g.fill(); } });
    }, [xy, pts]);
    await strip.screenshot({ path: OUT + ' path.png' });
    await strip.close();
    const secs = (on[on.length - 1] - on[0] + 1) / FPS;
    const inside = xy.filter(Boolean);
    console.log(JSON.stringify({ out: path.basename(OUT), frames: frames.length, onScreenSecs: +secs.toFixed(2),
      totalSecs: +(frames.length / FPS).toFixed(2), minX: Math.round(Math.min(...inside.map(p => p[0]))), maxX: Math.round(Math.max(...inside.map(p => p[0]))),
      minY: Math.round(Math.min(...inside.map(p => p[1]))), maxY: Math.round(Math.max(...inside.map(p => p[1]))) }));
  } finally { await ses.close(); }
})().catch(e => { console.error(e); process.exit(1); });
