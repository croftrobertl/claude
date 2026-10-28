'use strict';
/**
 * DCC Seasons — 4.13.2, the strutting tom and his poults, in the engine:
 * he steps (a planted foot never slides), stops only with both feet down,
 * feeds 2.5-3.1 s without moving, walks on; he walks along the bottom of
 * the screen with his feet showing; all 37 poses are pre-drawn after load
 * in idle time; and the check link (?dcc_scene=now) plays the scene at once
 * and again after each one, outside the moments queue, and only when asked.
 *
 *   node tools/test-tom.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const base = () => { const c = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']); c.forceHour = 12; return c; };
const SEED = `(() => { let a = 7; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

(async () => {
  for (const w of [1440, 768]) {
    console.log(`\n  --- he walks, stops, feeds and walks on, ${w}px ---`);
    const cfg = base(); cfg.vigFirst = 1e9;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: w, height: 800 }, init: SEED });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      /* his poses are drawn in real time (a worker, then a scroll-quiet idle
       * moment); until then he waits off the edge, by design */
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 20000 });
      const r = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        const out = []; let tom = null;
        for (let i = 0; i < 30 * 90; i++) {
          s.tick(1000 / 30, 1);
          const t = s.parts.find(q => !q.dormant && q.b === 'forage');
          if (t && t !== tom) { tom = t; out.push({ seed: 1 }); }
          if (t) { out.push({ x: t.x, y: t.y, fs: t.fs, wp: t.wp, ft: t.ft, vx: t.vx, size: t.size, sc: t.sc }); }
        }
        return { out, vh: s.vh, vw: s.vw };
      });
      const fr = r.out;
      ok(fr.filter(f => !f.seed).length > 30 * 60, `he is on the page (${fr.filter(f => !f.seed).length} of 2700 frames)`, fr.length);
      /* stride-linked: each frame's ground covered over its walk-phase advance
       * is one walk cycle at his drawn scale, so the planted foot stays put */
      let worst = 0, walked = 0, bad = '';
      for (let i = 1; i < fr.length; i++) {
        const a = fr[i - 1], b = fr[i];
        if (a.seed || b.seed || b.fs === 1 || a.fs === 1 || b.wp < a.wp) { continue; }
        const dx = Math.abs(b.x - a.x), dw = b.wp - a.wp;
        if (dx < 0.05 || dx > 5) { continue; }   /* > 5: re-seeded at the far edge */
        const tu = (b.size * 1.3 * 1.55 * b.sc) / 107, cyc = 14 / 0.6 * tu, e = Math.abs(dx / dw - cyc) / cyc;
        if (e > worst) { worst = e; bad = JSON.stringify([a, b]); } walked++;
      }
      ok(walked > 100 && worst < 0.01, `the walk phase advances with the ground covered: no sliding (worst ${(worst * 100).toFixed(2)}% over ${walked} frames)`, bad);
      const feeds = []; let st = -1, x0 = 0, drift = 0;
      for (let i = 0; i < fr.length; i++) {
        const f = fr[i]; if (f.seed) { st = -1; continue; }
        if (f.fs === 1 && st < 0) { st = i; x0 = f.x; ok(f.wp === 0, 'he stops on a planted step (walk phase 0: both feet down)', f.wp); }
        if (f.fs === 1) { drift = Math.max(drift, Math.abs(f.x - x0)); }
        if (f.fs !== 1 && st >= 0) { feeds.push((i - st) / 30); st = -1; }
      }
      ok(feeds.length >= 2, `he stops to feed, more than once (${feeds.length} times in 90 s)`, feeds.join(','));
      ok(feeds.every(d => d >= 2.4 && d <= 3.2), `each feed lasts 2.5-3.1 s (${feeds.map(d => d.toFixed(1)).join(', ')})`, feeds.join(','));
      ok(drift === 0, 'and he does not move while he feeds', drift);
      const sp = fr.filter(f => !f.seed).map(f => Math.abs(f.vx));
      ok(sp.every(v => v >= 14 && v <= 20), `a strut: 14-20 px/s (${Math.min(...sp).toFixed(1)}-${Math.max(...sp).toFixed(1)})`, '');
      const feet = fr.filter(f => !f.seed).map(f => f.y + 10 * f.sc);
      const g0 = fr.find(f => !f.seed).y;
      ok(fr.filter(f => !f.seed).every(f => f.y === g0) && g0 > r.vh - 40 && Math.max(...feet) < r.vh, `he walks along the bottom of the screen, feet showing (feet at ${Math.max(...feet).toFixed(0)} of ${r.vh})`, JSON.stringify({ g0, ys: [...new Set(fr.filter(f => !f.seed).map(f => f.y))].slice(0, 5) }));
    } finally { await ses.close(); }
  }

  console.log('\n  --- the pre-draw: 37 poses after load, in idle time ---');
  {
    const cfg = base(); cfg.vigFirst = 1e9;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 700 }, dsf: 3 });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      const t0 = await ses.page.evaluate(() => performance.now());
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 20000 });
      const r = await ses.page.evaluate(() => ({ t: performance.now(), tom: window.DCCSeasonsEngine._state.tom }));
      ok(r.tom.cached === 37 && r.tom.done, `16 walk frames and 5 feeding poses for him, 12 + 4 for a poult: ${r.tom.cached} pre-drawn`, JSON.stringify(r.tom));
      ok(r.tom.mainBuilt === 0, 'all drawn in a worker (OffscreenCanvas), none on the page\'s thread', JSON.stringify(r.tom));
      console.log(`          (done ${((r.t - t0) / 1000).toFixed(1)} s after the engine started)`);
    } finally { await ses.close(); }
    /* the fallback (no Worker, as on browsers without OffscreenCanvas): all
     * 37 on the page's thread, one per scroll-quiet idle moment */
    const fb = base(); fb.vigFirst = 1e9;
    const s3 = await open(fixture({ kind: 'bravada', config: fb, banner: true }), { viewport: { width: 1440, height: 800 }, init: 'delete window.Worker;' + SEED });   /* 1440: he is always in the mix */
    try {
      await s3.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      /* until his poses exist he stands just off the edge: never drawn, never popping in */
      const early = await s3.page.evaluate(() => { const s = window.DCCSeasonsEngine._state, t = s.parts.find(q => !q.dormant && q.b === 'forage'); return { done: s.tom.done, x: t ? t.x : null, vw: s.vw, size: t ? t.size : 0 }; });
      ok(early.done === false && early.x !== null && (early.x < 0 || early.x > early.vw), `before his poses are ready he is off the screen (x ${early.x === null ? '-' : early.x.toFixed(0)} of ${early.vw})`, JSON.stringify(early));
      await s3.page.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000 });
      const t3 = await s3.page.evaluate(() => window.DCCSeasonsEngine._state.tom);
      ok(t3.mainBuilt === 37 && t3.cached === 37, 'with no Worker the fallback draws all 37 on the page\'s thread', JSON.stringify(t3));
    } finally { await s3.close(); }
    const c2 = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
    const s2 = await open(fixture({ kind: 'bravada', config: c2, banner: true }), { viewport: { width: 390, height: 700 } });
    try {
      await s2.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      await s2.page.waitForTimeout(3000);
      const t = await s2.page.evaluate(() => window.DCCSeasonsEngine._state.tom);
      ok(t.cached === 0 && t.todo === -1, 'a theme without the tom pre-draws nothing of him', JSON.stringify(t));
    } finally { await s2.close(); }
  }

  console.log('\n  --- the check link: ?dcc_scene=now ---');
  const QUEUE = 'window.DCCMoments = { register: function () {}, _q: [] };';
  for (const now of [true, false]) {
    const cfg = base(); if (now) { cfg.sceneNow = true; }
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 700 }, init: QUEUE });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      const r = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 30 * 40; i++) { s.tick(1000 / 30, 1); }
        return { log: s.vigLog.map(v => ({ name: v.name, start: v.start, end: v.end })), ready: window.DCCSeasonsEngine.moment ? null : null, now: s.tom.sceneNow };
      });
      if (now) {
        const L = r.log;
        ok(L.length >= 2 && L[0].name === 'cranemoon' && Math.abs(L[0].start - 1) < 0.1, `with it: the scene starts at 1 s of visible time (${L.length ? L[0].start.toFixed(2) : '-'} s), queue or not`, JSON.stringify(L));
        ok(L.length >= 2 && Math.abs(L[1].start - L[0].end - 3) < 0.1, `and again 3 s after it ends (${L.length > 1 ? (L[1].start - L[0].end).toFixed(2) : '-'} s)`, JSON.stringify(L));
      } else {
        ok(r.log.length === 0 && r.now === false, 'without it, under the moments queue nothing starts on its own (the queue owns the timing)', JSON.stringify(r.log));
      }
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
