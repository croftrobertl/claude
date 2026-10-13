'use strict';
/**
 * DCC Seasons — frame pacing while the Halloween scene and the seaplane
 * share the sky (4.10.6, Rob on a Retina Mac: "their motion moving forward
 * is slightly glitchy"; his recording ran at a flat 30 fps for the scene).
 *
 * Real clock, real rAF, the fixture's LIVE plane (heroFx: 'live': a
 * compositor translateX animation, a drop-shadow filter, a propeller
 * spinning every 0.11 s), Rob's live settings (ambient off, background
 * layer on, density 16, front layering). The plane is sent across at the
 * moon's height when the scene starts. Records every frame's interval from
 * the page's own rAF, and the main thread's busy time (CDP), for the scene
 * window and for the frames where the plane is over the moon.
 *
 *   node tools/measure-pacing.js [--width=1280] [--height=700] [--dsf=2] [--runs=3]
 *        [--plane=1|0] [--seasons=1|0] [--noscene=1] [--throttle=N]
 *        [--hero=<kind>] [--css=<extra css>] [--cfg=<json merged into the config>] [--gpu=1]
 *   DCC_ASSETS=/path/to/old/assets/js node tools/measure-pacing.js …   (a previous build)
 *
 * --noscene measures the background layer alone (the plane still flies);
 * --hero=witch a flyer meeting the plane instead of the scene.
 * --gpu=1 draws the canvas on the GPU as a Mac does, through Chromium's
 * SwiftShader (a GPU in software, many times slower than a real one): only
 * there does the GPU's work hold frames back, so only there do GPU costs
 * show in the frame times at all. Without it this container rasterises on
 * the CPU and composites in software, and rAF runs at 60 whatever the GPU
 * would have cost. Compare builds side by side on the same machine.
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

const GPU_ARGS = '--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-gpu-rasterization --enable-accelerated-2d-canvas';

async function once(o) {
  const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--ambient=0', '--diag', ...(o.gen || [])]);
  cfg.vigOnly = 'witchmoon'; cfg.vigFirst = o.noscene || o.hero ? 1e9 : 1500; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.heroFirst = [9999, 10000]; cfg.forceHour = 12;
  /* --hero=<kind>: a flyer instead of the scene, the plane sent across at her height */
  if (o.hero) { cfg.heroOnly = o.hero; cfg.heroFirst = [1.5, 1.6]; }
  if (o.cfg) { Object.assign(cfg, o.cfg); }
  if (o.seasons === false) { cfg.enabled = false; cfg.engine = false; }
  if (o.gpu) { process.env.DCC_CHROME_ARGS = GPU_ARGS; }
  let ses;
  try { ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true, heroFx: 'live' }), { viewport: { width: o.width, height: o.height }, dsf: o.dsf }); }
  finally { if (o.gpu) { delete process.env.DCC_CHROME_ARGS; } }
  const pg = ses.page, seasons = o.seasons !== false, plane = o.plane !== false;
  try {
    /* a guest's view: no test weather banner, no diagnostics panel */
    await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' + (o.css || '') });
    const cdp = await pg.context().newCDPSession(pg);
    await cdp.send('Performance.enable');
    if (o.throttle > 1) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.throttle }); }
    if (seasons && o.hero) { await pg.waitForFunction(() => { const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, p = s && s.heroXY; return p && p[0] > -40 && p[0] < innerWidth + 40; }, null, { timeout: 30000, polling: 'raf' }); }
    else if (seasons && !o.noscene) { await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.vig, null, { timeout: 30000 }); }
    else { await pg.waitForTimeout(seasons ? 3000 : 1500); }
    /* the scene has just started: send the plane across at the moon's
     * height, timed so it passes the moon in the middle of the scene */
    const geo = await pg.evaluate(([plane, seasons, W, noscene, hero]) => {
      const s = seasons && window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
      const v = s && s.vigSt, hp = hero && s && s.heroXY;
      const my = hp ? hp[1] : (v && v.my ? v.my : 150), mx = v && v.mx ? v.mx : W / 2;
      /* a flyer: the plane comes the other way to meet her */
      if (plane) { window.dccFly(my, (W + 380) / 260, hp && hp[0] < W / 2 ? -1 : 1); }
      /* every frame's time and where the plane is */
      window.__fr = []; window.__on = true;
      /* every clear of the page's canvas, and whether it was the whole of it */
      const cv = document.querySelector('canvas.dcc-seasons-canvas'), P = CanvasRenderingContext2D.prototype, cr = P.clearRect;
      window.__clears = { full: 0, part: 0 };
      if (cv && !P.__dccWrapped) {
        P.__dccWrapped = 1;
        P.clearRect = function (x, y, w, h) {
          if (this.canvas === cv && window.__on) {
            const t = this.getTransform(), X = t.a * x + t.e, Y = t.d * y + t.f, Wd = t.a * w, Hd = t.d * h;
            window.__clears[X <= 0 && Y <= 0 && X + Wd >= cv.width && Y + Hd >= cv.height ? 'full' : 'part']++;
          }
          return cr.apply(this, arguments);
        };
      }
      const fly = document.querySelector('.dcc-hl-fly');
      const step = (ts) => {
        if (!window.__on) { return; }
        const r = plane ? fly.getBoundingClientRect() : null;
        const hx = hero && s && s.heroXY;
        window.__fr.push([ts, r ? (r.left + r.right) / 2 : -1, hero ? !!hx : (s && !noscene ? !!s.vig : true), hx ? hx[0] : mx]);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return { mx, my, MR: v && v.MR || 50, f0: s && s.fore ? s.fore.stats : null };
    }, [plane, seasons, o.width, !!o.noscene, o.hero || '']);
    const m0 = await cdp.send('Performance.getMetrics');
    await pg.waitForTimeout(o.ms || 5200);
    const m1 = await cdp.send('Performance.getMetrics');
    const fin = await pg.evaluate(() => {
      window.__on = false;
      const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
      return { fr: window.__fr, clears: window.__clears, fore: s && s.fore ? Object.assign({}, s.fore.stats) : null };
    });
    const met = (m, k) => (m.metrics.find(x => x.name === k) || {}).value || 0;
    const span = met(m1, 'Timestamp') - met(m0, 'Timestamp');
    const busy = k => +((met(m1, k) - met(m0, k)) / span * 1000).toFixed(1);
    const gaps = [], over = [], fr = fin.fr;
    for (let i = 1; i < fr.length; i++) {
      if (!fr[i][2]) { continue; }
      const d = fr[i][0] - fr[i - 1][0];
      gaps.push(d);
      if (plane && Math.abs(fr[i][1] - fr[i][3]) < geo.MR + 160) { over.push(d); }
    }
    const f0 = geo.f0 || { frames: 0, cuts: 0, builds: 0 }, f1 = fin.fore || f0;
    return { gaps, over, clears: fin.clears, fore: { frames: f1.frames - f0.frames, cuts: f1.cuts - f0.cuts, builds: (f1.builds || 0) - (f0.builds || 0) },
      busy: { task: busy('TaskDuration'), script: busy('ScriptDuration'), style: busy('RecalcStyleDuration'), layout: busy('LayoutDuration') } };
  } finally { await ses.close(); }
}

function sum(g) {
  if (!g.length) { return null; }
  const s = g.slice().sort((a, b) => a - b), pct = q => +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(1);
  return { frames: g.length, fps: +(1000 * g.length / g.reduce((a, b) => a + b, 0)).toFixed(1), within17: +(100 * g.filter(d => d <= 17).length / g.length).toFixed(1), over17: g.filter(d => d > 17).length, p50: pct(0.5), p95: pct(0.95), max: +s[s.length - 1].toFixed(1) };
}

/** Measure o.runs crossings; returns the summary (see the header). */
async function measure(o) {
  o = Object.assign({ width: 1280, height: 700, dsf: 2, runs: 3, throttle: 1 }, o);
  const all = [], over = [], busy = [], clears = { full: 0, part: 0 }, fore = { frames: 0, cuts: 0, builds: 0 };
  for (let r = 0; r < o.runs; r++) {
    const x = await once(o);
    all.push(...x.gaps); over.push(...x.over); busy.push(x.busy);
    clears.full += x.clears.full; clears.part += x.clears.part;
    for (const k in fore) { fore[k] += x.fore[k]; }
  }
  const avg = k => +(busy.reduce((a, b) => a + b[k], 0) / busy.length).toFixed(1);
  return { build: process.env.DCC_ASSETS || 'working tree', width: o.width, height: o.height, dsf: o.dsf, throttle: o.throttle, gpu: !!o.gpu,
    plane: o.plane !== false, seasons: o.seasons !== false, noscene: !!o.noscene, hero: o.hero || '', runs: o.runs,
    scene: sum(all), planeOverMoon: sum(over), clears, fore,
    mainThreadMsPerSec: { task: avg('task'), script: avg('script'), style: avg('style'), layout: avg('layout') } };
}

module.exports = { measure, GPU_ARGS };

if (require.main === module) {
  const argv = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), '1'] : [a.slice(0, i).replace(/^--/, ''), a.slice(i + 1)]; }));
  measure({
    width: +(argv.width || 1280), height: +(argv.height || 700), dsf: +(argv.dsf || 2), runs: +(argv.runs || 3), throttle: +(argv.throttle || 1),
    plane: argv.plane !== '0', seasons: argv.seasons !== '0', noscene: argv.noscene === '1', gpu: argv.gpu === '1', hero: argv.hero || '',
    css: argv.css || '', cfg: argv.cfg ? JSON.parse(argv.cfg) : null, gen: argv.gen ? argv.gen.split(' ') : [],
  }).then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e); process.exit(1); });
}
