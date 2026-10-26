'use strict';
/**
 * DCC Seasons — 4.13.1 step B: Thanksgiving's scene, A "high and small"
 * (Rob's pick), on the REAL home page (tests/real-theme/, captured from
 * live) at 390, 768, 1280 and 1440, with a real scrollbar from 768 up.
 *
 * Every frame of a crossing, on the mocked clock, every box the scene
 * paints (each crane by its sprite box, the moon with its glow) is at
 * least 8px from the keep-clear set: the title's and tagline's letters,
 * the menu bar and its pinned copy, the dial and the menu button. The
 * moon is pale (a real full moon high in the sky), nothing reaches the
 * water, the V crosses the moon's face, and everything is drawn in idle
 * time before the scene starts.
 *
 *   node tools/test-thanksgiving-scene.js
 */
const { execFileSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');
const rt = require('./real-theme');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const QUIET = '.dcc-wx-banner{display:none!important}';
function sep(a, b) { const dx = Math.max(a[0] - b[2], b[0] - a[2]), dy = Math.max(a[1] - b[3], b[1] - a[3]); return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy); }

(async () => {
  /* TG_QUICK=<width>: one width, one direction, no load checks (mutation runs) */
  const QUICK = +process.env.TG_QUICK || 0;
  if (!QUICK) console.log('\n  --- reduced motion: nothing animates, nothing is fetched ---');
  if (!QUICK) {
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--min']);
    const reqs = [];
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 844 }, dsf: 2, reducedMotion: 'reduce' });
    try {
      ses.page.on('request', r => reqs.push(r.url()));
      await ses.page.mouse.wheel(0, 300);
      await ses.page.waitForTimeout(12000);   /* past the loader's 10 s net */
      const r = await ses.page.evaluate(() => ({ eng: !!window.DCCSeasonsEngine, cv: document.querySelectorAll('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky').length, acc: document.querySelectorAll('.dcc-seasons-accent').length }));
      ok(!r.eng && !r.cv && !r.acc && !reqs.some(u => /engine/.test(u)), 'under prefers-reduced-motion the engine is never fetched: no canvas, no accent, no scene', JSON.stringify(r) + ' ' + reqs.join(','));
    } finally { await ses.close(); }
  }

  if (!QUICK) console.log('\n  --- /submit-booking/: zero Seasons assets, counted ---');
  if (!QUICK) {
    const decide = scope => execFileSync('php', [`${ROOT}/tools/scope-decide.php`, `--scope=${scope}`, '--kind=submitbooking'], { cwd: ROOT, encoding: 'utf8' }).trim();
    for (const scope of ['all', 'no_cottages', 'not_home']) {
      const verdict = decide(scope);
      /* served exactly as the site would: SKIP means the plugin printed nothing */
      const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--min']);
      let html = fixture({ kind: 'bravada', config: cfg, banner: 'page' });
      if (verdict === 'SKIP') { html = html.replace(/<script>window\.DCC_SEASONS = [\s\S]*?<\/script>/, '').replace(/<script src="\/[a-z.]+\.js"><\/script>/g, ''); }
      const reqs = [];
      const ses = await open(html, { viewport: { width: 390, height: 844 }, waitUntil: 'commit' });
      try {
        ses.page.on('request', r => { const u = new URL(r.url()); if (u.pathname !== '/') { reqs.push(u.pathname); } });
        await ses.page.reload({ waitUntil: 'load' });
        await ses.page.mouse.wheel(0, 200);
        await ses.page.waitForTimeout(11000);
        const g = await ses.page.evaluate(() => ({ cfg: !!window.DCC_SEASONS, eng: !!window.DCCSeasonsEngine, el: document.querySelectorAll('[class*="dcc-seasons"]').length }));
        const seasons = reqs.filter(u => /ambient|engine|matrix|dcc-seasons/.test(u));
        ok(verdict === 'SKIP' && seasons.length === 0 && !g.cfg && !g.eng && !g.el,
          `scope ${scope}: should_load() says ${verdict}; ${seasons.length} Seasons requests, no config, no element (${reqs.length} requests in all)`, JSON.stringify({ seasons, g }));
      } finally { await ses.close(); }
    }
  }

  for (const w of QUICK ? [QUICK] : [390, 768, 1280, 1440]) {
    for (const dir of QUICK ? [1] : [1, -1]) {
      console.log(`\n  --- ${w}px, flying ${dir > 0 ? 'right' : 'left'} ---`);
      const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
      cfg.vigOnly = 'cranemoon'; cfg.vigFirst = 2500; cfg.vigGap = 1e9;
      cfg.vigDir = dir; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; cfg.forceHour = 12;
      const ses = await open(rt.page({ config: cfg, extraHead: `<style>${QUIET}</style>` }),
        { ...rt.opts(w), viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2 });
      const pg = ses.page, errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      try {
        await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
        /* before the scene: the plan, every beat, the moon and the header's
         * letters are ready, so nothing is measured or drawn in its frames */
        await pg.waitForFunction(() => { const c = window.DCCSeasonsEngine._state.cranes; return c.plan && c.frames >= 24 && c.moon; }, null, { timeout: 15000 });
        const pre = await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; return { vig: s.vig, cr: s.cranes }; });
        ok(!pre.vig && pre.cr.frames >= 24 && pre.cr.moon && pre.cr.plan && !pre.cr.plan.none,
          'the plan, the 24 beats and the moon are drawn in idle time BEFORE the scene', JSON.stringify({ vig: pre.vig, frames: pre.cr.frames, moon: pre.cr.moon }));
        await pg.waitForFunction(() => window.DCCSeasonsEngine._state.vig === 'cranemoon', null, { timeout: 25000 });
        const r = await pg.evaluate(() => {
          const s = window.DCCSeasonsEngine._state; s.manual(true);
          const out = { boxes: [], frames: 0, crossed: 0, st: null };
          for (let i = 0; i < 900 && s.vig === 'cranemoon'; i++) {
            s.tick(1000 / 60, 1);
            const st = s.vigSt; if (!st || !st.boxes) { continue; }
            out.frames++;
            const m = st.boxes[0], mr = (m[2] - m[0]) / 2 / 1.25, mx = (m[0] + m[2]) / 2, my = (m[1] + m[3]) / 2;
            st.boxes.forEach(b => out.boxes.push(b));
            if (st.boxes.slice(1).some(b => Math.hypot((b[0] + b[2]) / 2 - mx, (b[1] + b[3]) / 2 - my) < mr * 0.6)) { out.crossed++; }
            if (!out.st) { out.st = { mx: st.mx, my: st.my, MR: st.MR, L: st.L, dir: st.dir, vy: st.vy }; }
            if (i === 60) {
              const c = s.witch.canvas, g = c.getContext('2d'), dp = Math.min(devicePixelRatio || 1, 2), d = g.getImageData(Math.round(st.mx * dp), Math.round((st.my + st.MR * 0.4) * dp), 1, 1).data;
              out.moonPx = [d[0], d[1], d[2], d[3]];
            }
          }
          out.plan = s.cranes.plan; out.full = s.cranes.plan.full; out.pic = [s.sky.w, s.sky.h];
          return out;
        });
        const keep = await rt.keepClear(pg);
        const pic = await pg.evaluate(() => { const b = document.getElementById('header-image-main-inside').getBoundingClientRect(); return [b.left, b.top]; });
        const K = [];
        for (const [k, list] of Object.entries(keep)) { for (const b of list) { K.push([k, [b[0] - pic[0], b[1] - pic[1], b[2] - pic[0], b[3] - pic[1]]]); } }
        let worst = 1e9, who = '';
        for (const b of r.boxes) { for (const [k, kb] of K) { const d = sep(b, kb); if (d < worst) { worst = d; who = k; } } }
        ok(r.st && r.st.dir === dir, `the V flies ${dir > 0 ? 'right' : 'left'}`, JSON.stringify(r.st));
        ok(r.frames > 100, `a whole crossing on the mocked clock (${r.frames} frames)`, String(r.frames));
        ok(worst >= 7.5, `every box the scene paints stays clear of the keep-clear set (${worst.toFixed(1)}px from the ${who})`, `${worst.toFixed(1)} from ${who}`);
        /* the photo's waterline: 395 of its 810 rows, the picture covered and centred */
        const sc = Math.max(r.pic[0] / 1080, r.pic[1] / 810), water = (r.pic[1] - 810 * sc) / 2 + 395 * sc;
        const low = Math.max(...r.boxes.map(b => b[3]));
        ok(low < water, `nothing reaches the water (lowest ${low.toFixed(0)} px, water at ${water.toFixed(0)})`, String(low));
        ok(r.crossed > 3, `the V crosses the moon's face (${r.crossed} frames)`, String(r.crossed));
        const p = r.moonPx || [0, 0, 0, 0];
        ok(p[3] > 200 && p[0] > 150 && p[1] > 140 && p[2] > 110 && p[0] - p[2] < 70,
          `the moon is pale, a full moon high in the sky (rgb ${p.slice(0, 3).join(',')})`, JSON.stringify(p));
        ok(r.st && r.st.L <= r.full, `small, never more than 4.13.0's size (crane ${r.st && r.st.L} of ${r.full}, moon r ${r.st && r.st.MR})`, JSON.stringify(r.st));
        ok(!errs.length, 'no page errors', errs.join(' | '));
      } finally { await ses.close(); }
    }
  }
  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
