'use strict';
/**
 * DCC Seasons — the start-up clip (4.16.1): N seconds of a page from just
 * before the Seasons engine's first frame, recorded from Chromium's own
 * screencast at its real timing (a frame only arrives when the picture
 * changes, so a freeze shows as a held frame of its true length), with the
 * GPU canvas emulated (SwiftShader: about 20x slower than a real GPU, so a
 * stall reads long; the SHAPE of the start is what the clip shows).
 *
 *   node tools/startup-clip.js --url=https://doracanalcourt.com/ --width=1440 --out="<file without .mp4>" [--swap=<js dir>] [--secs=5] [--gpu=1]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const URL0 = arg('url', 'https://doracanalcourt.com/'), W = +arg('width', 1440), H = +arg('height', 900), SECS = +arg('secs', 5), OUT = arg('out', 'Seasons - startup');
const GPU = arg('gpu', '1') === '1', SWAP = arg('swap', '');
const INIT = `(() => { const raf = window.requestAnimationFrame.bind(window); window.__dccF = [];
  window.requestAnimationFrame = function (cb) { const mine = /engine(\\.min)?\\.js/.test((new Error()).stack || ''); return raf(function (ts) { if (mine) { window.__dccF.push(performance.now()); } cb(ts); }); }; })();`;

(async () => {
  const args = GPU ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas'] : [];
  const br = await chromium.launch(Object.assign({ args }, process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}));
  const ctx = await br.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await ctx.addInitScript(INIT);
  if (SWAP) {
    await ctx.route(/\/dcc-seasons\/assets\/js\/[a-z-]+(\.min)?\.js/, r => {
      const m = r.request().url().match(/\/assets\/js\/([a-z-]+)(\.min)?\.js/), f = path.join(SWAP, m[1] + (m[2] || '') + '.js');
      if (!fs.existsSync(f)) { return r.continue(); }
      r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(f, 'utf8') });
    });
  }
  const pg = await ctx.newPage(), cdp = await ctx.newCDPSession(pg);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const frames = [];
  cdp.on('Page.screencastFrame', f => { frames.push({ t: f.metadata.timestamp * 1000, d: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await pg.goto(URL0, { waitUntil: 'commit', timeout: 60000 });
  /* until the engine's first frame, then SECS more (wall time) */
  const t0w = Date.now();
  while (Date.now() - t0w < 40000) { const n = await pg.evaluate(() => window.__dccF.length).catch(() => 0); if (n) { break; } await pg.waitForTimeout(100); }
  await pg.waitForTimeout(SECS * 1000 + 600);
  const first = await pg.evaluate(() => performance.timeOrigin + (window.__dccF[0] || 0));
  await cdp.send('Page.stopScreencast').catch(() => {});
  await br.close();
  /* the clip: from 0.3 s before his first frame, each frame held until the next */
  const a = first - 300, b = a + SECS * 1000, dir = path.resolve(OUT + '.frames');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const keep = frames.filter((f, i) => f.t < b && (i + 1 >= frames.length || frames[i + 1].t > a));
  let list = '';
  keep.forEach((f, i) => {
    const file = path.join(dir, String(i).padStart(4, '0') + '.jpg'); fs.writeFileSync(file, Buffer.from(f.d, 'base64'));
    const s = Math.max(f.t, a), e = Math.min(i + 1 < keep.length ? keep[i + 1].t : b, b);
    list += `file '${file}'\nduration ${Math.max(0.001, (e - s) / 1000).toFixed(3)}\n`;
  });
  if (keep.length) { list += `file '${path.join(dir, String(keep.length - 1).padStart(4, '0') + '.jpg')}'\n`; }
  fs.writeFileSync(path.join(dir, 'list.txt'), list);
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30,scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', OUT + '.mp4']);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  /* the longest hold inside the clip */
  let hold = 0;
  keep.forEach((f, i) => { const s = Math.max(f.t, a), e = Math.min(i + 1 < keep.length ? keep[i + 1].t : b, b); hold = Math.max(hold, e - s); });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ out: path.basename(OUT), frames: keep.length, longestHoldMs: Math.round(hold), swap: !!SWAP, gpu: GPU }));
})().catch(e => { console.error(e); process.exit(1); });
