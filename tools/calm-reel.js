'use strict';
/**
 * DCC Seasons — Calmer Seasons' review material (4.15.0) at 390, DPR 3, from
 * the real engine on the real-theme fixture with the plugins' own files
 * (tools/calm-pages.js), on the mocked clock (30 fps), Thanksgiving:
 *
 *   img/1 contact 390.png         /contact/: pieces drifting behind the form
 *   img/2 contact edge 3x.png      the 3x close-up where a piece meets a field
 *   img/3 selector 390.png         the Cottage Selector's landing, pieces behind its buttons
 *   clips/4 contact typing 390.mp4 6 s: the message box focused at 1 s, typed into: the pieces fade
 *   clips/5 quiz 390.mp4           6 s: the quiz opened at 1 s: the pieces fade
 *   clips/6 tom turn 390.mp4       6 s round his turn, a third of the way in (bottom band)
 *
 *   node tools/calm-reel.js --out=<dir>
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');
const cp = require('./calm-pages');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const OUT = arg('out', path.join(ROOT, 'build', 'Seasons - 4.15.0 review'));
const SEED = n => `Math.random = (() => { let a = ${n}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();`;
const QUIET = '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important} .dcc-seasons-diag{display:none!important}</style>';
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'clips'), { recursive: true });

async function boot(make, seed) {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  const ses = await open(make({ config: cfg, extraHead: QUIET }), { ...rt.opts(390), viewport: { width: 390, height: 844 }, dsf: 3, init: SEED(seed) });
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
  return ses;
}
const tick = (pg, n) => pg.evaluate(n => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < n; i++) { S.tick(1000 / 30, 1); } }, n);
function encode(dir, mp4) {
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', mp4]);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  fs.rmSync(dir, { recursive: true, force: true });
}
async function clip(pg, name, frames, onFrame, clipBox) {
  const dir = path.join(OUT, '.f-' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let f = 0; f < frames; f++) {
    if (onFrame) { await onFrame(f); }
    await tick(pg, 1);
    await pg.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), clip: clipBox || undefined });
  }
  fs.copyFileSync(path.join(dir, String(Math.floor(frames * 0.75)).padStart(4, '0') + '.png'), path.join(OUT, 'img', name + ' still.png'));
  encode(dir, path.join(OUT, 'clips', name + '.mp4'));
}

(async () => {
  /* 1, 2: /contact/, and the moment a piece meets a field: two pages on
   * one seed in lockstep, one with the clip off (debug occClip:false), so
   * the close-up shows the SAME frame both ways */
  {
    const mk = async off => { const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
      cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; if (off) { cfg.occClip = false; }
      const ses = await open(cp.contact({ config: cfg, extraHead: QUIET }), { ...rt.opts(390), viewport: { width: 390, height: 844 }, dsf: 3, init: SEED(9) + 'window.requestAnimationFrame = function () { return 0; };' });
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 40000, polling: 200 });
      await ses.page.evaluate(() => document.querySelector('.dcc-contact-form').scrollIntoView({ block: 'center' }));
      await ses.page.waitForTimeout(1500);
      await ses.page.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); S.occBuild(); });
      return ses; };
    const on = await mk(false), off = await mk(true);
    let best = null;
    for (let k = 0; k < 90; k++) {
      await tick(on.page, 4); await tick(off.page, 4);
      /* how much of a piece the clip hides over each field, this frame */
      const sc = await off.page.evaluate(() => {
        const cv = document.querySelector('canvas.dcc-seasons-canvas'), g = cv.getContext('2d'), z = cv.width / 390;
        let b = null;
        for (const el of document.querySelectorAll('.dcc-contact-form input:not([type=checkbox]), .dcc-contact-form textarea, .dcc-contact-form select, .dcc-submit')) {
          const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { continue; }
          const x0 = (r.left * z) | 0, y0 = (r.top * z) | 0, w = (r.width * z) | 0, h = (r.height * z) | 0;
          const d = g.getImageData(x0, y0, w, h).data; let n = 0, ex = 0, ey = 0;
          for (let i = 3, q = 0; i < d.length; i += 4, q++) { if (d[i] > 60) { n++; ex += q % w; ey += (q / w) | 0; } }
          if (n > 400 && (!b || n > b.n)) { b = { n, x: (x0 + ex / n) / z, y: (y0 + ey / n) / z, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }
        }
        return b;
      });
      if (sc && (!best || sc.n > best.n)) {
        best = sc;
        await on.page.screenshot({ path: path.join(OUT, 'img', '1 contact 390.png') });
        await off.page.screenshot({ path: path.join(OUT, '.off.png') });
      }
    }
    if (best) {
      /* a 3x close-up centred where the piece meets the field's edge */
      const w = 130, h = 90, edgeY = Math.abs(best.y - best.top) < Math.abs(best.bottom - best.y) ? best.top : best.bottom;
      const cx = Math.max(0, Math.min(390 - w, best.x - w / 2)), cy = Math.max(0, Math.min(844 - h, edgeY - h / 2));
      for (const [src, dst] of [[path.join(OUT, 'img', '1 contact 390.png'), '2 contact edge 3x.png'], [path.join(OUT, '.off.png'), '2 contact edge 3x, clip off.png']]) {
        const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `crop=${w * 3}:${h * 3}:${Math.round(cx * 3)}:${Math.round(cy * 3)}`, path.join(OUT, 'img', dst)]);
        if (ff.status) { throw new Error(String(ff.stderr)); }
      }
      fs.rmSync(path.join(OUT, '.off.png'), { force: true });
      console.log('edge frame', JSON.stringify(best));
    }
    await on.close(); await off.close();
  }
  /* 3: the selector's landing */
  {
    const ses = await boot(cp.cottages, 9), pg = ses.page;
    await pg.evaluate(() => document.querySelector('.dccs-root').scrollIntoView({ block: 'center' }));
    await pg.waitForTimeout(1200);
    await tick(pg, 150);
    await pg.screenshot({ path: path.join(OUT, 'img', '3 selector 390.png') });
    await ses.close();
  }
  /* 4: typing */
  {
    const ses = await boot(cp.contact, 9), pg = ses.page;
    await pg.evaluate(() => document.querySelector('#dcc-f-message').scrollIntoView({ block: 'center' }));
    await pg.waitForTimeout(1200); await tick(pg, 30);
    const words = 'Hi, we would love a cottage near the canal for a week in March. '.split('');
    await clip(pg, '4 contact typing 390', 180, async f => {
      if (f === 30) { await pg.focus('#dcc-f-message'); }
      if (f > 30 && words.length && f % 2 === 0) { await pg.keyboard.type(words.shift()); }
    });
    await ses.close();
  }
  /* 5: the quiz */
  {
    const ses = await boot(cp.cottages, 9), pg = ses.page;
    await pg.evaluate(() => document.querySelector('.dccs-root').scrollIntoView({ block: 'start' }));
    await pg.waitForTimeout(1200); await tick(pg, 60);
    await clip(pg, '5 quiz 390', 180, async f => { if (f === 30) { await pg.click('.dccs-root .dccs-landing-choice'); } });
    await ses.close();
  }
  /* 6: the tom's turn, the bottom band, 6 s round it */
  {
    const ses = await boot(o => rt.page(o), 14), pg = ses.page;
    let f = 0;
    /* run on until he is about 1.5 s short of the turn point, then film 6 s */
    await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < 30 * 200; i++) { S.tick(1000 / 30, 1); const t = S.calm.tom[0]; if (t && t.leg === 0 && (t.dir > 0 ? t.x >= innerWidth / 3 - 28 : t.x <= innerWidth * 2 / 3 + 28)) { break; } } });
    await clip(pg, '6 tom turn 390', 180, null, { x: 0, y: 844 - 200, width: 390, height: 200 });
    await ses.close();
  }
  console.log('done', OUT);
})().catch(e => { console.error(e); process.exit(1); });
