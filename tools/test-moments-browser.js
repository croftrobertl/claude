'use strict';
/**
 * DCC Seasons — both plugins on the homepage, the queue running (4.12.0).
 *
 * A stand-in Hero Effects: the real queue's contract (sessionStorage
 * 'dcc_moments', Rob's order Seasons → seaplane → heron → fish/rod, gaps
 * between moments, the header-in-view test) around the fixture's own
 * header picture, with the three other moments drawn as plain markers so
 * their turns can be seen. The Seasons half is the real engine.
 *
 * At 390 and 1280 px it proves, on a Halloween day:
 *   - the FIRST slot of the queue is ours, and it plays the scene and then
 *     the witch, both inside the header picture;
 *   - nothing of ours starts on its own before or after it;
 *   - the queue moves on to the seaplane afterwards;
 *   - with window.DCCHeroFx.heron true, no Seasons heron flies on a
 *     theme-less day and no heron poses are pre-drawn.
 *
 *   node tools/test-moments-browser.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const QUIET = '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}';

/* Hero Effects, as far as Seasons can see it: the queue, the order, the
 * gaps, the in-view test and the other three moments. Times are short so a
 * test can watch a whole round. */
const HERO_FX = `(() => {
  const ORDER = ['seasons', 'seaplane', 'heron', 'fish'];
  const KEY = 'dcc_moments';
  const regs = [];
  let playing = null, owed = [];
  window.__fx = { played: [], started: [] };
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || { i: 0 }; } catch (e) { return { i: 0 }; } };
  const write = s => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const inView = () => {
    const h = document.getElementById('header-image-main-inside');
    if (!h) { return false; }
    const r = h.getBoundingClientRect(), vis = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return r.height > 0 && vis / r.height >= 0.6;
  };
  const own = kind => {
    /* the stand-ins: a marker element for a second */
    window.__fx.started.push(kind);
    const d = document.createElement('div');
    d.className = 'fx-moment fx-' + kind;
    d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:900;width:12px;height:12px;background:#0b3';
    document.body.appendChild(d);
    setTimeout(() => { d.remove(); done(kind); }, 400);
  };
  const done = kind => { window.__fx.played.push(kind); playing = null; setTimeout(next, 150); };
  const next = () => {
    if (playing) { return; }
    const s = read();
    let kind = owed.length ? owed.shift() : ORDER[s.i % ORDER.length];
    if (!owed.length || true) { s.i = (ORDER.indexOf(kind) + 1) % ORDER.length; write(s); }
    const header = kind === 'seasons' || kind === 'fish';
    if (header && !inView()) { owed.push(kind); setTimeout(next, 200); return; }
    const r = regs.find(x => x.kind === kind);
    if (kind === 'seasons') {
      if (!r) { owed.push(kind); setTimeout(next, 200); return; }   /* waits for us */
      if (!r.ready()) { setTimeout(next, 150); return; }            /* skipped, not owed */
      playing = kind;
      window.__fx.started.push(kind);
      window.DCCHeroFx.state = 'busy';
      r.play(() => { window.DCCHeroFx.state = 'done'; done(kind); });
      return;
    }
    playing = kind;
    own(kind);
  };
  window.DCCHeroFx = { state: 'none', heron: window.__heronFlag === true };
  window.DCCMoments = {
    register(r) { if (regs.indexOf(r) < 0) { regs.push(r); } },
    get state() { return { registered: regs.map(r => r.kind), played: window.__fx.played.slice(), next: ORDER[read().i % ORDER.length], owed: owed.slice() }; },
  };
  (window.DCCMomentsPending || []).forEach(r => window.DCCMoments.register(r));
  window.DCCMomentsPending = { push: r => window.DCCMoments.register(r) };
  /* the first moment, a breath after load */
  setTimeout(next, 600);
})();`;

(async () => {
  for (const w of [390, 1280]) {
    console.log(`\n  --- both plugins on the homepage, ${w}px ---`);
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
    /* Halloween's pool is the heron and the witch; the witch is pinned so
     * the check is about her, as Rob's brief asks. The heron half is the
     * theme-less case below. */
    cfg.vigOnly = 'witchmoon'; cfg.heroOnly = 'witch';
    cfg.vigFirst = 2000; cfg.vigGap = 1e9; cfg.heroFirst = [2.5, 2.6]; cfg.heroEvery = [3, 4]; cfg.forceHour = 12;
    const html = fixture({ kind: 'bravada', config: cfg, banner: true }).replace('</body>', `<script>${HERO_FX}</script></body>`);
    const ses = await open(html, { viewport: { width: w, height: w < 768 ? 700 : 800 }, dsf: 2 });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: QUIET });
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      /* our slot is the queue's first */
      await pg.waitForFunction(() => window.__fx.started.length > 0, null, { timeout: 15000 });
      const first = await pg.evaluate(() => window.__fx.started[0]);
      ok(first === 'seasons', `the queue's first moment is ours (${first})`, first);
      /* the scene, then the witch, both inside the header picture */
      const seen = await pg.evaluate(async () => {
        const s = window.DCCSeasonsEngine._state, out = { scene: null, flyer: null, outside: 0, canvas: false };
        const box = () => document.getElementById('header-image-main-inside').getBoundingClientRect();
        for (let i = 0; i < 400; i++) {
          await new Promise(r => setTimeout(r, 100));
          if (s.vig && !out.scene) { out.scene = s.vig; }
          if (s.hero && !out.flyer) { out.flyer = s.hero; }
          const p = s.heroXY, k = s.sky;
          if (p && k.canvas) {
            const b = box(), x = p[0] + k.left, y = p[1] + k.top;
            if (y < b.top - 40 || y > b.bottom + 40) { out.outside++; }
          }
          if (!out.canvas) { out.canvas = !!document.querySelector('canvas.dcc-seasons-sky'); }
          /* wait for the queue to take its next turn, too */
          if (out.scene && out.flyer && !s.hero && !s.vig && window.__fx.started.length > 1) { break; }
        }
        out.played = window.__fx.played.slice();
        out.started = window.__fx.started.slice();
        out.logs = { v: s.vigLog.length, h: s.heroLog.length };
        out.state = window.DCCMoments.state;
        return out;
      });
      ok(seen.scene === 'witchmoon', `the moon-and-witch scene played (${seen.scene})`, JSON.stringify(seen));
      ok(seen.flyer === 'witch', `then the witch flew (${seen.flyer})`, JSON.stringify(seen));
      ok(seen.canvas && seen.outside === 0, 'both stayed in the header picture', JSON.stringify({ canvas: seen.canvas, outside: seen.outside }));
      ok(seen.logs.v === 1 && seen.logs.h === 1, `exactly one scene and one flyer, none self-started (${seen.logs.v}/${seen.logs.h})`, JSON.stringify(seen.logs));
      ok(seen.played[0] === 'seasons' && seen.started.indexOf('seaplane') > 0, `the queue moved on to the seaplane (${seen.started.join(' > ')})`, JSON.stringify(seen.started));
      ok(seen.state.registered.includes('seasons'), `window.DCCMoments.state shows us registered and the queue moving (next: ${seen.state.next})`, JSON.stringify(seen.state));
    } finally { await ses.close(); }
  }

  console.log('\n  --- the Hero Effects heron is on, on a theme-less day ---');
  {
    const cfg = config(['--theme=classic', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigFirst = 1e9; cfg.heroFirst = [1.5, 1.6]; cfg.heroEvery = [2, 3]; cfg.forceHour = 12;
    const html = fixture({ kind: 'bravada', config: cfg, banner: true })
      .replace('<head>', '<head><script>window.__heronFlag = true;</script>')
      .replace('</body>', `<script>${HERO_FX}</script></body>`);
    const ses = await open(html, { viewport: { width: 1280, height: 800 }, dsf: 2 });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: QUIET });
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      await pg.waitForTimeout(6000);
      const r = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state;
        return { heroes: s.heroLog.map(h => h.kind), poses: s.heron.cached, pool: s.moments.pool,
          ready: s.moments.ready, started: window.__fx.started.slice(), played: window.__fx.played.slice() };
      });
      ok(!r.heroes.length, `no Seasons heron flew (${r.heroes.join(', ') || 'none'})`, JSON.stringify(r));
      ok(r.poses === 0, `no heron poses were pre-drawn (${r.poses})`, String(r.poses));
      ok(r.ready === false && !r.pool.length, 'our slot is skipped, not owed (ready false)', JSON.stringify(r.pool));
      ok(r.played.includes('seaplane') || r.started.includes('seaplane'), `the queue carried on without us (${r.started.join(' > ')})`, JSON.stringify(r.started));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
