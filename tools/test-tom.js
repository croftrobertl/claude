'use strict';
/**
 * DCC Seasons — 4.13.2, the strutting tom (alone since 4.17.0), in the engine:
 * he steps (a planted foot never slides), stops only with both feet down,
 * feeds 2.1-3.3 s without moving (4.15.2: three feeds, never one twice running), walks on; he walks along the bottom of
 * the header picture's foot (4.17.0); all 14 poses are pre-drawn after load
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
    console.log(`\n  --- 4.16.0: he holds his strut in one place; one idle motion at a time, ${w}px ---`);
    const cfg = base(); cfg.vigFirst = 1e9;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: w, height: 800 }, init: SEED });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 20000 });
      /* his first fit plan is made in idle time: wait for it before the mocked clock takes over */
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.calm.tom[0] && window.DCCSeasonsEngine._state.calm.tom[0].fk != null, null, { timeout: 20000 });
      const r = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        const out = [];
        for (let i = 0; i < 30 * 120; i++) {
          s.tick(1000 / 30, 1);
          const t = s.parts.find(q => !q.dormant && q.b === 'forage');
          if (t) { out.push({ hl: t.hl, x: t.x, y: t.y, fs: t.fs, sv: t.sv, a: t.alpha, sc: t.sc }); }
        }
        const pic = document.querySelector('#header-image-main-inside');
        return { out, vh: pic.clientHeight, vw: pic.clientWidth };
      });
      const fr = r.out.filter(f => f.hl);
      ok(fr.length > 30 * 100, `he is on the page (${fr.length} of 3600 frames)`, r.out.length);
      const xs = [...new Set(fr.map(f => f.x))], ys = [...new Set(fr.map(f => f.y))];
      ok(xs.length === 1 && xs[0] > r.vw * 0.5 && xs[0] < r.vw, `he never walks: one x for the whole visit (${xs.map(x => x.toFixed(1)).join(', ')}), right of centre`, JSON.stringify(xs.slice(0, 5)));
      ok(ys.length === 1 && ys[0] === r.vh, `and stands on the header picture's foot (${ys[0]} of its ${r.vh} px)`, JSON.stringify(ys.slice(0, 5)));
      const fade = r.out.filter(f => f.hl).slice(0, 40).map(f => f.a);
      ok(fade[0] < 0.1 && fade.every((a, i) => i === 0 || a >= fade[i - 1]), 'he fades in where he stands (never walks or pops in)', JSON.stringify(fade.slice(0, 6)));
      const both = fr.filter(f => f.sv >= 0 && f.fs === 1).length;
      ok(both === 0, 'never two idle motions at once (the rattle and a feed never overlap)', both);
      /* the motions: runs of frames */
      const runs = []; let cur = null;
      for (const f of fr) { const m = f.sv >= 0 ? 'rattle' : f.fs === 1 ? 'feed' : 'hold'; if (!cur || cur.m !== m) { cur = { m, n: 0 }; runs.push(cur); } cur.n++; }
      const whole = runs.slice(0, -1);   /* the last run is cut off by the end of the 120 s */
      const rat = whole.filter(q => q.m === 'rattle'), fed = whole.filter(q => q.m === 'feed'), holds = runs.filter(q => q.m === 'hold').slice(1, -1);
      ok(rat.length >= 1 && rat.every(q => Math.abs(q.n / 30 - 0.9) < 0.07), `the fan rattles now and then (${rat.length} in 120 s), 0.9 s each`, JSON.stringify(rat));
      ok(fed.every(q => q.n / 30 >= 1.9 && q.n / 30 <= 3.2), `each feed lasts ${fed.map(q => (q.n / 30).toFixed(1)).join(', ') || '-'} s`, JSON.stringify(fed));
      ok(holds.every(q => q.n / 30 >= 4.9), `he holds his strut at least 5 s between motions (shortest ${holds.length ? (Math.min(...holds.map(q => q.n)) / 30).toFixed(1) : '-'} s)`, JSON.stringify(holds));
    } finally { await ses.close(); }
  }

  console.log('\n  --- the pre-draw: 14 poses after load, in idle time ---');
  {
    const cfg = base(); cfg.vigFirst = 1e9;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 700 }, dsf: 3 });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      const t0 = await ses.page.evaluate(() => performance.now());
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 20000 });
      const r = await ses.page.evaluate(() => ({ t: performance.now(), tom: window.DCCSeasonsEngine._state.tom }));
      ok(r.tom.cached === 14 && r.tom.done, `standing, 5 feeding poses and 8 of the fan's rattle (no walk frames: he never walks; no poult): ${r.tom.cached} pre-drawn`, JSON.stringify(Object.keys(r.tom.cache || {})));
      ok(r.tom.mainBuilt === 0, 'all drawn in a worker (OffscreenCanvas), none on the page\'s thread', JSON.stringify(r.tom));
      console.log(`          (done ${((r.t - t0) / 1000).toFixed(1)} s after the engine started)`);
    } finally { await ses.close(); }
    /* the fallback (no Worker, as on browsers without OffscreenCanvas): all
     * 14 on the page's thread, one per scroll-quiet idle moment */
    const fb = base(); fb.vigFirst = 1e9;
    const s3 = await open(fixture({ kind: 'bravada', config: fb, banner: true }), { viewport: { width: 1440, height: 800 }, init: 'delete window.Worker;' + SEED });   /* 1440: he is always in the mix */
    try {
      await s3.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      /* until his poses exist he stands just off the edge: never drawn, never popping in */
      const early = await s3.page.evaluate(() => { const s = window.DCCSeasonsEngine._state, t = s.parts.find(q => !q.dormant && q.b === 'forage'); return { done: s.tom.done, x: t ? t.x : null, a: t ? t.alpha : null, vw: s.vw, size: t ? t.size : 0 }; });
      ok(early.done === false && early.x !== null && (early.a === 0 || early.x < 0 || early.x > early.vw), `before his poses are ready he is not drawn (alpha ${early.a}, x ${early.x === null ? '-' : early.x.toFixed(0)})`, JSON.stringify(early));
      await s3.page.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000 });
      const t3 = await s3.page.evaluate(() => window.DCCSeasonsEngine._state.tom);
      ok(t3.mainBuilt === 14 && t3.cached === 14, 'with no Worker the fallback draws all 14 on the page\'s thread', JSON.stringify({ mainBuilt: t3.mainBuilt, cached: t3.cached }));
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
  /* 4.14.4: Thanksgiving has no scene (Rob's A1), so the link is proven on
   * Christmas, which has two; on Thanksgiving it has nothing to play */
  for (const now of [true, false, 'tg']) {
    const cfg = now === 'tg' ? base() : config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--diag']);
    if (now) { cfg.sceneNow = true; }
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 700 }, init: QUEUE });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      const r = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 30 * 40; i++) { s.tick(1000 / 30, 1); }
        return { log: s.vigLog.map(v => ({ name: v.name, start: v.start, end: v.end })), ready: window.DCCSeasonsEngine.moment ? null : null, now: s.tom.sceneNow };
      });
      if (now === 'tg') {
        ok(r.log.length === 0, 'on Thanksgiving, which has no scene since 4.14.4, it plays nothing', JSON.stringify(r.log));
      } else if (now) {
        const L = r.log;
        ok(L.length >= 2 && /^(sleighmoon|giftdrop)$/.test(L[0].name) && Math.abs(L[0].start - 1) < 0.1, `with it: the scene starts at 1 s of visible time (${L.length ? L[0].start.toFixed(2) : '-'} s), queue or not`, JSON.stringify(L));
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
