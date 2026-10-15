'use strict';
/**
 * DCC Seasons — our turn in Rob's moments queue, and the heron standing
 * down for the Hero Effects one (4.12.0).
 *
 * The queue lives in the Director's mu-plugin; here it is a STAND-IN with
 * the same contract (register / ready / play(done) / DCCMomentsPending),
 * so the engine is driven exactly as Hero Effects drives it, in both load
 * orders. What is proved:
 *
 *   - the moment is registered as the script runs, before any idle work,
 *     whether the queue is already there or arrives later;
 *   - ready() answers honestly and changes nothing;
 *   - play() runs the scene and then, a breath later, the flyer, and calls
 *     done() exactly once — including when the scene declines, when the
 *     flyer declines, when both do, and when the visitor scrolls away;
 *   - while the queue exists nothing of ours starts by itself and our
 *     clocks stay parked, the 'dcc_seasons_visit' key is never written,
 *     and a scene owed from another page plays here;
 *   - without the queue, 4.11.0's own timing is unchanged;
 *   - the heron is never picked while DCCHeroFx.heron is true — set early,
 *     set late, false or absent — and its poses are not pre-drawn.
 *
 *   node tools/test-moments.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

/* A wait that FAILS the check instead of throwing: a build that never
 * registers, or never finishes a moment, must read as a failure, not as a
 * crashed suite. */
async function until(pg, fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 20000)) {
    if (await pg.evaluate(fn)) { return true; }
    await pg.waitForTimeout(100);
  }
  return false;
}

/* run the engine's clock until the queue is told the moment is over */
async function ticksUntilDone(pg, seconds) {
  for (let i = 0; i < seconds * 3 && !(await pg.evaluate(() => window.__q.done)); i++) {
    await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let k = 0; k < 10; k++) { s.tick(1000 / 30, 1); } });
  }
  return pg.evaluate(() => window.__q.done);
}

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const QUIET = '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}';

/* The queue, as Hero Effects provides it: it drains DCCMomentsPending when
 * it starts, and calls ready()/play() on our slot. `early` installs it
 * before the engine's script runs, `late` after. */
const QUEUE = (early) => `(() => {
  const install = () => {
    const regs = [];
    window.__q = { calls: [], done: 0, playing: false };
    window.DCCMoments = {
      /* by identity: the contract has the engine push to DCCMomentsPending
         AND call register() when the queue is already there, so a queue
         must not count the same object twice */
      register(r) { if (regs.indexOf(r) >= 0) { return; } regs.push(r); window.__q.calls.push('register:' + r.kind); },
      get state() { return { registered: regs.map(r => r.kind), done: window.__q.done }; },
      ask(kind) { const r = regs.find(x => x.kind === kind); return r ? !!r.ready() : null; },
      run(kind) {
        const r = regs.find(x => x.kind === kind);
        if (!r) { return false; }
        window.__q.playing = true;
        window.__q.calls.push('play:' + kind);
        r.play(() => { window.__q.done++; window.__q.playing = false; window.__q.calls.push('done:' + kind); });
        return true;
      },
    };
    (window.DCCMomentsPending || []).forEach(r => window.DCCMoments.register(r));
    window.DCCMomentsPending = { push: r => window.DCCMoments.register(r) };
  };
  ${early ? 'install();' : 'window.__installQueue = install;'}
})();`;

async function boot(o) {
  const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag', ...(o.gen || [])]);
  cfg.vigOnly = o.vigOnly === null ? undefined : (o.vigOnly || 'witchmoon');
  if (o.vigOnly === null) { delete cfg.vigOnly; }
  cfg.vigFirst = o.vigFirst != null ? o.vigFirst : 1500;
  cfg.vigGap = 1e9; cfg.heroEvery = o.heroEvery || [9999, 10000]; cfg.forceHour = 12;
  if (o.heroFirst) { cfg.heroFirst = o.heroFirst; }
  if (o.heroOnly) { cfg.heroOnly = o.heroOnly; }
  if (o.cfg) { Object.assign(cfg, o.cfg); }
  let html = fixture({ kind: 'bravada', config: cfg, banner: true, headerPic: o.headerPic !== false });
  const inject = [];
  if (o.queue) { inject.push(QUEUE(o.queue === 'early')); }
  if (o.heron != null) { inject.push(`window.DCCHeroFx = { state: 'none', heron: ${o.heron} };`); }
  if (inject.length) { html = html.replace('<head>', `<head><script>${inject.join('\n')}</script>`); }
  const ses = await open(html, { viewport: { width: o.width || 1280, height: 800 } });
  await ses.page.addStyleTag({ content: QUIET });
  if (o.queue === 'late' && !o.noWait) {
    /* the engine's script runs first, then Hero Effects starts and drains
     * what we left in DCCMomentsPending */
    await ses.page.waitForFunction(() => window.DCCMomentsPending && window.DCCMomentsPending.length, null, { timeout: 15000 });
    await ses.page.evaluate(() => window.__installQueue());
  }
  if (o.noWait) { return ses; }
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
  await ses.page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
  return ses;
}
/* tick the engine's own clock; the queue's stand-in needs no clock */
const tick = (pg, n) => pg.evaluate(n => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < n; i++) { s.tick(1000 / 30, 1); } }, n);
const q = pg => pg.evaluate(() => ({ calls: window.__q.calls.slice(), done: window.__q.done, playing: window.__q.playing }));
const st = pg => pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; return { m: s.moments, vig: s.vig, hero: s.hero, vt: s.vt, vigs: s.vigLog.length, heroes: s.heroLog.length, first: s.firstPage }; });

(async () => {
  console.log('\n  --- registering, in both load orders ---');
  for (const order of ['early', 'late']) {
    const ses = await boot({ queue: order, noWait: true });
    try {
      if (order === 'late') {
        const pending = await until(ses.page, () => !!(window.DCCMomentsPending && window.DCCMomentsPending.length), 20000);
        ok(pending, 'late: the moment is waiting in DCCMomentsPending for the queue to drain', 'nothing pending in 20 s');
        await ses.page.evaluate(() => window.__installQueue());
      }
      ok(await until(ses.page, () => !!(window.__q && window.__q.calls.length)), `${order}: a moment was registered at all`, 'nothing registered in 20 s');
      const r = await q(ses.page);
      ok(r.calls.filter(c => c === 'register:seasons').length === 1,
        `${order}: the Seasons moment is registered exactly once (${r.calls.join(', ') || 'nothing'})`, JSON.stringify(r));
      ok(await ses.page.evaluate(() => window.DCCMoments.ask('seasons') !== null), `${order}: and the queue can ask it`, '');
    } finally { await ses.close(); }
  }
  {
    /* within 3 s of DOMContentLoaded, which is the queue's patience */
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
    const html = fixture({ kind: 'bravada', config: cfg, banner: true })
      .replace('<head>', `<head><script>window.__dcl = 0; document.addEventListener('DOMContentLoaded', () => { window.__dcl = performance.now(); });
        Object.defineProperty(window, 'DCCMomentsPending', { configurable: true, set(v) { this.__p = v; window.__regAt = performance.now(); }, get() { return this.__p; } });</script>`);
    const ses = await open(html, { viewport: { width: 1280, height: 800 } });
    try {
      await ses.page.waitForFunction(() => window.DCCMomentsPending && window.DCCMomentsPending.length, null, { timeout: 15000 });
      const t = await ses.page.evaluate(() => ({ reg: window.__regAt, dcl: window.__dcl }));
      ok(t.reg - t.dcl < 3000, `registered ${((t.reg - t.dcl) / 1000).toFixed(2)} s after DOMContentLoaded (the queue waits 3 s)`, JSON.stringify(t));
    } finally { await ses.close(); }
  }

  console.log('\n  --- ready() is honest, and changes nothing ---');
  {
    const ses = await boot({ queue: 'early' });
    try {
      const before = await st(ses.page);
      const a = await ses.page.evaluate(() => [window.DCCMoments.ask('seasons'), window.DCCMoments.ask('seasons'), window.DCCMoments.ask('seasons')]);
      const after = await st(ses.page);
      ok(a.every(x => x === true), 'Halloween: ready() is true (a scene and a flyer today)', JSON.stringify(a));
      ok(after.vigs === before.vigs && after.heroes === before.heroes && !after.vig && !after.hero && after.first === 'unread',
        'asking three times started nothing and read no storage', JSON.stringify({ before, after }));
    } finally { await ses.close(); }
  }
  {
    /* nothing to show: the heron-only default with the Hero Effects heron on */
    const ses = await boot({ queue: 'early', heron: true, gen: ['--theme=classic'], vigOnly: null, vigFirst: 1e9 });
    try {
      const r = await ses.page.evaluate(() => ({ ready: window.DCCMoments.ask('seasons'), m: window.DCCSeasonsEngine._state.moments }));
      ok(r.ready === false, 'a theme-less day with the Hero Effects heron on: ready() is false', JSON.stringify(r));
      ok(r.m.pool.length === 0, 'and no other bird is substituted (the pool is empty)', JSON.stringify(r.m.pool));
    } finally { await ses.close(); }
  }

  console.log('\n  --- play(): the scene, then the flyer, and done() exactly once ---');
  {
    const ses = await boot({ queue: 'early' });
    const pg = ses.page;
    try {
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      await tick(pg, 2);
      const s1 = await st(pg);
      ok(s1.vig === 'witchmoon', 'the scene starts within a frame of play()', JSON.stringify(s1));
      await ticksUntilDone(pg, 40);
      const r = await q(pg), s2 = await st(pg);
      ok(r.done === 1, `done() was called exactly once (${r.done})`, JSON.stringify(r));
      ok(s2.vigs === 1 && s2.heroes === 1, 'one scene and one flyer played', JSON.stringify(s2));
      ok(s2.m.stats.scenes === 1 && s2.m.stats.flyers === 1 && s2.m.stats.last > 1 && s2.m.stats.last < 50 && !s2.m.stats.capped,
        `the whole moment ran to its own end in ${s2.m.stats.last.toFixed(1)} s of visible time (net 50, the queue's 60)`, JSON.stringify(s2.m.stats));
      /* and the flyer followed the scene by about a breath */
      const log = await pg.evaluate(() => ({ v: window.DCCSeasonsEngine._state.vigLog, h: window.DCCSeasonsEngine._state.heroLog }));
      const gap = log.h.length && log.v.length ? log.h[0].start - log.v[0].end : -1;
      ok(gap >= 1.8 && gap <= 2.6, `the flyer follows the scene by ${gap.toFixed(2)} s (a breath)`, JSON.stringify(log));
      /* done() cannot fire twice, even if the moment is finished twice
       * (the cap landing on the last frame, a queue calling play again) */
      const twice = await pg.evaluate(() => {
        const before = window.__q.done;
        window.DCCMoments.run('seasons');
        window.DCCSeasonsEngine._state.momForce();
        return { before, after: window.__q.done };
      });
      ok(twice.after - twice.before === 1, `finishing a moment twice still calls done() once (${twice.after - twice.before})`, JSON.stringify(twice));
    } finally { await ses.close(); }
  }
  {
    /* the scene declines (none today): the flyer still plays */
    const ses = await boot({ queue: 'early', gen: ['--theme=classic'], vigOnly: null, vigFirst: 1e9, heroOnly: 'heron' });
    const pg = ses.page;
    try {
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      await ticksUntilDone(pg, 60);
      const r = await q(pg), s2 = await st(pg);
      ok(r.done === 1 && s2.vigs === 0 && s2.heroes === 1, 'no scene today: the flyer plays alone and done() is called once', JSON.stringify({ r, s2: { v: s2.vigs, h: s2.heroes } }));
    } finally { await ses.close(); }
  }
  {
    /* the flyer declines (heroes off): the scene still plays */
    const ses = await boot({ queue: 'early', gen: ['--richness=minimal'] });
    const pg = ses.page;
    try {
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      await ticksUntilDone(pg, 60);
      const r = await q(pg), s2 = await st(pg);
      ok(r.done === 1 && s2.heroes === 0, `no flyer: done() once, no hero (${s2.vigs} scenes)`, JSON.stringify({ r, s2: { v: s2.vigs, h: s2.heroes } }));
    } finally { await ses.close(); }
  }
  {
    /* both decline: done() at once, nothing drawn */
    const ses = await boot({ queue: 'early', headerPic: false, gen: ['--theme=classic'], vigOnly: null, vigFirst: 1e9 });
    const pg = ses.page;
    try {
      const ready = await pg.evaluate(() => window.DCCMoments.ask('seasons'));
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      const r = await q(pg), s2 = await st(pg);
      ok(r.done === 1 && !s2.vig && !s2.hero, `nothing to show: done() at once, before a frame (ready said ${ready})`, JSON.stringify(r));
    } finally { await ses.close(); }
  }
  {
    /* the visitor scrolls away mid-moment: it finishes normally */
    const ses = await boot({ queue: 'early' });
    const pg = ses.page;
    try {
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      await tick(pg, 30);
      await pg.evaluate(() => window.scrollTo(0, 1400));
      await pg.waitForTimeout(120);
      const mid = await st(pg);
      await ticksUntilDone(pg, 60);
      const r = await q(pg), s2 = await st(pg);
      ok(mid.vig === 'witchmoon', 'the scene was playing when the visitor scrolled away', JSON.stringify(mid));
      ok(r.done === 1 && s2.vigs === 1 && s2.heroes === 1, 'it finished normally: one scene, one flyer, one done()', JSON.stringify({ r, s2: { v: s2.vigs, h: s2.heroes } }));
      ok(await pg.evaluate(() => window.pageYOffset > 1000), 'and the page was still scrolled away at the end', '');
    } finally { await ses.close(); }
  }

  console.log('\n  --- while the queue exists, nothing of ours starts by itself ---');
  {
    const ses = await boot({ queue: 'early', vigFirst: 300, heroFirst: [0.5, 0.6] });
    const pg = ses.page;
    try {
      await tick(pg, 30 * 180);
      const s2 = await st(pg);
      ok(s2.vigs === 0 && s2.heroes === 0 && !s2.vig && !s2.hero, '180 s of visible time: no scene and no flyer started', JSON.stringify({ v: s2.vigs, h: s2.heroes }));
      ok(s2.m.heroAt > 1e8 && s2.m.vigAt > 1e8, 'both clocks are parked at INF', JSON.stringify({ heroAt: s2.m.heroAt, vigAt: s2.m.vigAt }));
      ok(s2.first === 'unread', "the 'dcc_seasons_visit' key was never read or written", String(s2.first));
      const ss = await pg.evaluate(() => { try { return sessionStorage.getItem('dcc_seasons_visit'); } catch (e) { return 'blocked'; } });
      ok(ss === null, 'and storage confirms it', String(ss));
      /* and it still takes its turn afterwards */
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      await tick(pg, 2);
      ok((await st(pg)).vig === 'witchmoon', 'the queue can still start it', '');
    } finally { await ses.close(); }
  }
  {
    /* a slot owed from another page: scope "Homepage only" means the engine
     * does not load elsewhere, so the queue brings the slot here, and the
     * moment plays as soon as it is asked */
    const ses = await boot({ queue: 'late', vigFirst: 1e9 });
    const pg = ses.page;
    try {
      await tick(pg, 30 * 30);
      const before = await st(pg);
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      await tick(pg, 2);
      const after = await st(pg);
      ok(before.vigs === 0 && after.vig === 'witchmoon', 'a slot owed from another page plays here, as soon as the queue asks', JSON.stringify({ before: before.vigs, after: after.vig }));
    } finally { await ses.close(); }
  }

  console.log('\n  --- without the queue, 4.11.0 timing is unchanged ---');
  {
    const ses = await boot({ vigFirst: 300, heroEvery: [0.5, 0.6] });
    const pg = ses.page;
    try {
      await tick(pg, 30 * 60);
      const s2 = await st(pg);
      ok(s2.vigs >= 1, `the scene still starts on our own clock (${s2.vigs} scenes, ${s2.heroes} flyers)`, JSON.stringify(s2));
      ok(s2.first === true || s2.first === false, `the first-page rule still runs (firstPage ${s2.first})`, String(s2.first));
      ok(!s2.m.on && !s2.m.playing, 'and the moments runtime is inert', JSON.stringify(s2.m.stats));
    } finally { await ses.close(); }
  }
  {
    /* reduced motion: no engine at all, with or without the queue */
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
    const html = fixture({ kind: 'bravada', config: cfg, banner: true }).replace('<head>', `<head><script>${QUEUE(true)}</script>`);
    const ses = await open(html, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    try {
      await ses.page.waitForTimeout(2500);
      const r = await ses.page.evaluate(() => ({
        state: !!(window.DCCSeasonsEngine && window.DCCSeasonsEngine._state),
        ready: window.DCCMoments.ask('seasons'),
        canvas: !!document.querySelector('canvas.dcc-seasons-canvas'),
      }));
      ok(!r.canvas && r.ready !== true, 'reduced motion: nothing renders and the slot is not claimed', JSON.stringify(r));
    } finally { await ses.close(); }
  }

  console.log('\n  --- the heron stands down for the Hero Effects one ---');
  for (const [flag, label] of [[true, 'flag true'], [false, 'flag false'], [null, 'flag absent']]) {
    const ses = await boot({ queue: 'early', heron: flag, gen: ['--theme=classic'], vigOnly: null, vigFirst: 1e9, heroEvery: [0.3, 0.4] });
    const pg = ses.page;
    try {
      const m = (await st(pg)).m;
      ok(m.heronOff === (flag === true), `${label}: heronOff is ${m.heronOff}`, JSON.stringify(m.pool));
      ok(m.pool.includes('heron') === (flag !== true), `${label}: the pool ${flag === true ? 'drops' : 'keeps'} the heron (${m.pool.join(', ') || 'empty'})`, JSON.stringify(m.pool));
      await pg.waitForTimeout(700);   /* the idle pre-draw gets its chance */
      const poses = await pg.evaluate(() => window.DCCSeasonsEngine._state.heron.cached);
      ok(flag === true ? poses === 0 : poses > 0, `${label}: ${poses} heron poses pre-drawn`, String(poses));
    } finally { await ses.close(); }
  }
  {
    /* set LATE: after the engine started, before the choice */
    const ses = await boot({ queue: 'early', gen: ['--theme=classic'], vigOnly: null, vigFirst: 1e9, heroEvery: [0.3, 0.4] });
    const pg = ses.page;
    try {
      const was = (await st(pg)).m;
      await pg.evaluate(() => { window.DCCHeroFx = { state: 'none', heron: true }; });
      const now = await st(pg);
      ok(was.pool.includes('heron') && !now.m.pool.includes('heron'), 'the flag is read at every choice, so setting it late works', JSON.stringify({ was: was.pool, now: now.m.pool }));
      ok(now.m.ready === false, 'and with nothing else to show, ready() turns false', JSON.stringify(now.m));
      await pg.evaluate(() => window.DCCMoments.run('seasons'));
      await ticksUntilDone(pg, 20);
      const s2 = await st(pg);
      ok(s2.heroes === 0 && (await q(pg)).done === 1, 'a moment asked for anyway draws no heron and finishes', JSON.stringify({ h: s2.heroes }));
    } finally { await ses.close(); }
  }
  {
    /* a debug knob or preview may still force it */
    const ses = await boot({ queue: 'early', heron: true, gen: ['--theme=classic'], vigOnly: null, vigFirst: 1e9, heroOnly: 'heron', heroEvery: [0.3, 0.4] });
    try {
      const m = (await st(ses.page)).m;
      ok(m.pool.includes('heron') && !m.heronOff, 'a forced heron (debug or preview) still flies', JSON.stringify(m.pool));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
