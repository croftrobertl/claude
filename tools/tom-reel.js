'use strict';
/**
 * DCC Seasons — the tom's review clip (4.15.2: fewer feeding stops, never the
 * same feed twice running): 6 s of the bottom band of the REAL home page,
 * from the real engine on the mocked clock (30 fps), starting 1.5 s before
 * one of his feeding stops, so the clip shows the strut, a stop and the walk
 * on. Prints the walk's stops (time on screen, which feed) beside it.
 *
 *   node tools/tom-reel.js --width=390|1440 --out="<file without .mp4>" [--stop=1] [--seed=14] [--secs=6]
 *
 * --stop=N films round his Nth stop (1 = the first). DCC_ASSETS selects
 * another build's js folder (the 4.15.0 build, for a before clip).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const W = +arg('width', 390), H = W < 768 ? 844 : 900, SECS = +arg('secs', 6), STOP = +arg('stop', 1), SEED = +arg('seed', 14);
const OUT = arg('out', path.join(ROOT, 'build', `Seasons - tom ${W}`));
const BAND = W < 768 ? 220 : 260;

(async () => {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  const ses = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important} .dcc-seasons-diag{display:none!important}</style>' }),
    { ...rt.opts(W), viewport: { width: W, height: H }, dsf: 2, init: `Math.random = (() => { let a = ${SEED}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();` });
  const pg = ses.page;
  await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
  /* pass 1 on a second page with the same seed: when is his Nth stop? */
  const plan = await pg.evaluate(() => {
    const S = window.DCCSeasonsEngine._state; S.manual(true);
    const stops = []; let pf = 0, f = 0, on0 = -1, on1 = -1;
    for (; f < 30 * 400; f++) {
      S.tick(1000 / 30, 1); const t = S.calm.tom[0]; if (!t) { break; }
      const vis = t.leg !== 3 && t.x > -200 && t.x < innerWidth + 200;
      if (vis) { if (on0 < 0) { on0 = f; } on1 = f; }
      if (t.fs === 1 && pf !== 1) { stops.push({ f, fv: t.fv }); }
      pf = t.fs; if (t.leg === 3) { break; }
    }
    return { stops, on0, on1, f };
  });
  await ses.close();
  const st = plan.stops[STOP - 1];
  if (!st) { throw new Error('no stop ' + STOP + ': ' + JSON.stringify(plan)); }
  const ses2 = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important} .dcc-seasons-diag{display:none!important}</style>' }),
    { ...rt.opts(W), viewport: { width: W, height: H }, dsf: 2, init: `Math.random = (() => { let a = ${SEED}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();` });
  const p2 = ses2.page;
  await p2.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
  const from = Math.max(0, st.f - 45);
  await p2.evaluate(n => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < n; i++) { S.tick(1000 / 30, 1); } }, from);
  const check = await p2.evaluate(() => window.DCCSeasonsEngine._state.calm.tom[0]);
  const dir = path.join(ROOT, 'build', '.tom-' + process.pid); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let f = 0; f < SECS * 30; f++) {
    await p2.evaluate(() => window.DCCSeasonsEngine._state.tick(1000 / 30, 1));
    await p2.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), clip: { x: 0, y: H - BAND, width: W, height: BAND } });
  }
  await ses2.close();
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', OUT + '.mp4']);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  fs.copyFileSync(path.join(dir, String(45 + 30).padStart(4, '0') + '.png'), OUT + '.png');
  fs.rmSync(dir, { recursive: true, force: true });
  const names = ['two jabs', 'one jab', 'three jabs'];
  console.log(JSON.stringify({ width: W, stops: plan.stops.map(s => ({ atS: +((s.f - plan.on0) / 30).toFixed(1), feed: names[s.fv] || 'two jabs' })), filmedFrom: from, sameAsPass1: check && Math.round(check.x), out: path.basename(OUT) }));
})().catch(e => { console.error(e); process.exit(1); });
