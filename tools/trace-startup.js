'use strict';
/**
 * DCC Seasons — the desktop start-up trace (4.16.1, the Director: "on desktop
 * the effects move for a split second, FREEZE for a couple of seconds, then
 * start again"). A cold-cache load of a page (the LIVE site by default, or a
 * local fixture), a Chromium performance trace of the first --secs seconds,
 * and what it shows:
 *
 *   - every main-thread task over 50 ms, with what it was (script URL,
 *     layout, image decode, style, parse, GC) and when;
 *   - the frames the page produced (compositor frames), and the gaps;
 *   - first motion: the first engine frame that can be SEEN (the 4.16.1 gate),
 *     and the frames dropped (engine gaps over 50 ms) in the 5 s after it;
 *   - the Seasons engine's own frames (its requestAnimationFrame callbacks,
 *     timed by a wrapper) and every gap in them over 100 ms: a visible freeze.
 *
 *   node tools/trace-startup.js --url=https://doracanalcourt.com/ --width=1440 [--height=900] [--throttle=1] [--secs=8] [--dsf=1] [--gpu=1] [--out=<file.json>]
 *   node tools/trace-startup.js --local=home --width=1440     (the real-theme fixture with the shipped build)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const URL0 = arg('url', 'https://doracanalcourt.com/'), W = +arg('width', 1440), H = +arg('height', W < 768 ? 844 : 900);
const THR = +arg('throttle', 1), SECS = +arg('secs', 8), DSF = +arg('dsf', W < 768 ? 3 : 1), OUT = arg('out', '');

/* the engine's frames: wrap rAF before any page script runs, and tag the
 * callbacks the engine asks for (engine.min.js / engine.js in the stack) */
const INIT = `(() => {
  const raf = window.requestAnimationFrame.bind(window), t0 = performance.now();
  window.__dccF = []; window.__allF = [];
  window.requestAnimationFrame = function (cb) {
    const st = (new Error()).stack || '', mine = /engine(\\.min)?\\.js/.test(st);
    return raf(function (ts) { const a = performance.now(); cb(ts); const d = performance.now() - a; if (mine) { const c = document.querySelector('canvas.dcc-seasons-canvas'); window.__dccF.push([a, d, c ? c.style.opacity : '']); } else { window.__allF.push([a, d]); } });
  };
  try { new PerformanceObserver(l => { (window.__lt = window.__lt || []).push(...l.getEntries().map(e => [e.startTime, e.duration, (e.attribution && e.attribution[0] && e.attribution[0].containerSrc) || ''])); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
})();`;

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  /* --gpu=1: Chromium's GPU canvas on SwiftShader, as on a Mac or a phone (this
   * container otherwise draws canvases on the CPU and cannot see GPU stalls) */
  const GPU = arg('gpu', '0') === '1', args = GPU ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas'] : [];
  const br = await chromium.launch(Object.assign({ args }, proxy && /^https?:/.test(URL0) ? { proxy } : {}));
  const ctx = await br.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, ignoreHTTPSErrors: true, isMobile: W < 768, hasTouch: W < 768 });
  await ctx.addInitScript(INIT);
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (THR > 1) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR }); }
  /* --swap=DIR: serve the plugin's js from a local folder instead of the
   * site's (the readable sources for names in the profile, or a candidate
   * build: the same page, the same everything else) */
  const SWAP = arg('swap', '');
  if (SWAP) {
    await ctx.route(/\/dcc-seasons\/assets\/js\/[a-z-]+(\.min)?\.js/, r => {
      const m = r.request().url().match(/\/assets\/js\/([a-z-]+)(\.min)?\.js/), f = path.join(SWAP, m[1] + (arg('readable', '0') === '1' ? '.js' : (m[2] || '') + '.js'));
      if (!fs.existsSync(f)) { return r.continue(); }
      r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(f, 'utf8').replace(/__DCC_DEBUG__/g, 'false') });
    });
  }
  /* --profile=1: a CPU profile of the run, self time by function */
  const PROF = arg('profile', '0') === '1';
  if (PROF) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
  const tracePath = OUT || path.join(require('os').tmpdir(), 'dcc-trace-' + process.pid + '.json');
  await br.startTracing(pg, { path: tracePath, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8.execute', 'blink.user_timing'] });
  /* a screencast: Chromium sends a frame only when the picture changes, so a
   * gap in these frames while the effects run is a visible freeze */
  const shots = [];
  cdp.on('Page.screencastFrame', f => { shots.push(f.metadata.timestamp * 1000); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 20, maxWidth: 480, maxHeight: 480, everyNthFrame: 1 });
  const tNav = Date.now();
  await pg.goto(URL0, { waitUntil: 'commit', timeout: 60000 });
  await pg.waitForTimeout(SECS * 1000);
  await cdp.send('Page.stopScreencast').catch(() => {});
  let prof = null;
  if (PROF) {
    const { profile } = await cdp.send('Profiler.stop');
    const dt = {}, tot = profile.timeDeltas || [], byId = {};
    profile.nodes.forEach(n => { byId[n.id] = n; });
    (profile.samples || []).forEach((id, i) => { const n = byId[id], c = n.callFrame, k = (c.functionName || '(anon)') + ' ' + c.url.replace(/^.*\//, '').replace(/\?.*$/, '') + ':' + (c.lineNumber + 1); dt[k] = (dt[k] || 0) + (tot[i] || 0) / 1000; });
    prof = Object.entries(dt).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v)]);
  }
  const page = await pg.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource').filter(r => /dcc-seasons|engine|art-/.test(r.name)).map(r => [r.name.replace(/^.*\/(assets\/js\/)?/, '').replace(/\?.*$/, ''), Math.round(r.startTime), Math.round(r.responseEnd)]);
    return { origin: performance.timeOrigin, load: Math.round(nav.loadEventStart || 0), dcl: Math.round(nav.domContentLoadedEventStart || 0), dcc: window.__dccF || [], all: (window.__allF || []).length, lt: window.__lt || [], res, ver: (document.querySelector('script[src*="ambient"]') || {}).src };
  });
  await br.stopTracing();
  await br.close();

  /* the trace: top-level tasks over 50 ms on the renderer main thread */
  const ev = JSON.parse(fs.readFileSync(tracePath, 'utf8')).traceEvents || JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  const mainTid = (() => { const m = ev.find(e => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain'); return m ? [m.pid, m.tid] : null; })();
  const onMain = e => mainTid && e.pid === mainTid[0] && e.tid === mainTid[1];
  const navStart = (ev.find(e => e.name === 'navigationStart' && onMain(e)) || ev.find(e => e.name === 'TracingStartedInBrowser') || { ts: 0 }).ts;
  const tasks = ev.filter(e => onMain(e) && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.ph === 'X' && e.dur > 50000);
  const kids = ev.filter(e => onMain(e) && e.ph === 'X' && e.dur > 5000 && e.name !== 'RunTask' && e.name !== 'ThreadControllerImpl::RunTask');
  const what = t => {
    const inside = kids.filter(k => k.ts >= t.ts && k.ts + k.dur <= t.ts + t.dur).sort((a, b) => b.dur - a.dur);
    const named = inside.slice(0, 4).map(k => {
      const d = k.args && k.args.data || {};
      const u = (d.url || (d.stackTrace && d.stackTrace[0] && d.stackTrace[0].url) || d.frame || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').slice(-70);
      return `${k.name}${u ? ' ' + u : ''}${d.functionName ? ' ' + d.functionName : ''} ${(k.dur / 1000).toFixed(0)}ms`;
    });
    return named.join(' | ');
  };
  const long = tasks.map(t => ({ at: +((t.ts - navStart) / 1000).toFixed(0), ms: +(t.dur / 1000).toFixed(0), what: what(t) })).sort((a, b) => a.at - b.at);
  /* the engine's frames: when it starts, and its gaps over 100 ms after its first frame */
  const F = page.dcc.map(f => f[0]);
  const gaps = [];
  for (let i = 1; i < F.length; i++) { if (F[i] - F[i - 1] > 100) { gaps.push({ at: Math.round(F[i - 1]), ms: Math.round(F[i] - F[i - 1]) }); } }
  /* (a gap that runs past the 5 s is counted up to its end: a freeze longer
   * than the window is the whole window) */
  /* first motion: the first engine frame whose canvas can be seen (4.16.1's
   * start-up gate holds it at opacity 0 until frames are steady); then the
   * frames dropped in the 5 s after it (engine frame gaps over 50 ms) */
  const fm = page.dcc.find(f => f[2] !== '0'), fmT = fm ? fm[0] : null;
  let dropped = 0, worstGap = 0;
  if (fmT !== null) { for (let i = 1; i < F.length; i++) { if (F[i] > fmT && F[i - 1] < fmT + 5000) { const g = Math.min(F[i], fmT + 5000) - Math.max(F[i - 1], fmT); worstGap = Math.max(worstGap, g); if (g > 50) { dropped += Math.round(g / 16.7) - 1; } } } }
  const worstF = page.dcc.reduce((m, f) => f[1] > m[1] ? f : m, [0, 0]);
  /* screencast frames on the page's clock; gaps over 250 ms after the engine's first frame */
  const S = shots.map(t => t - page.origin).filter(t => t > 0).sort((a, b) => a - b), sg = [];
  const e0 = F.length ? F[0] : 1e9;
  for (let i = 1; i < S.length; i++) { if (S[i - 1] >= e0 && S[i] - S[i - 1] > 250) { sg.push({ at: Math.round(S[i - 1]), ms: Math.round(S[i] - S[i - 1]) }); } }
  const out = { url: URL0, screencast: { frames: S.length, afterEngine: S.filter(t => t >= e0).length, stills: sg }, width: W, dsf: DSF, cpu: THR, ver: (page.ver || '').replace(/^.*ver=/, ''), load: page.load, dcl: page.dcl, res: page.res,
    engine: { first: F.length ? Math.round(F[0]) : null, firstMotion: fmT === null ? null : Math.round(fmT), after5s: { dropped, worstGapMs: Math.round(worstGap) }, frames: F.length, worst: [Math.round(worstF[0]), +worstF[1].toFixed(1)], gaps },
    longTasks: long, profile: prof };
  console.log(JSON.stringify(out, null, 1));
  if (!OUT) { fs.rmSync(tracePath, { force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
