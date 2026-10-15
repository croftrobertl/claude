'use strict';
/**
 * DCC Seasons — how long a Seasons moment runs (4.12.0).
 *
 * Rob's queue budgets "about 30 s or less" for our turn. The moment is the
 * scene and then, a breath later, the flyer, and the flyer crosses the
 * header picture's whole width at the speed Rob chose — so a wide screen
 * takes longer than a phone for the same flight. This plays one moment per
 * theme and width on the mocked clock and prints the visible seconds from
 * play() to done().
 *
 *   node tools/measure-moment.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');
const Q = `(() => { const regs=[]; window.__q={done:0,t0:0,t1:0};
  window.DCCMoments = { register(r){ if(regs.indexOf(r)<0) regs.push(r); },
    run(k){ const r=regs.find(x=>x.kind===k); if(!r||!r.ready()) return false; window.__q.t0=window.DCCSeasonsEngine._state.vt; r.play(()=>{ window.__q.done++; window.__q.t1=window.DCCSeasonsEngine._state.vt; }); return true; } };
  (window.DCCMomentsPending||[]).forEach(r=>window.DCCMoments.register(r)); window.DCCMomentsPending={push:r=>window.DCCMoments.register(r)}; })();`;
(async () => {
  const out = [];
  for (const [theme, hero] of [['halloween', 'witch'], ['halloween', 'heron'], ['florida_keys', 'osprey'], ['christmas', 'sleigh'], ['new_years', '']]) {
    for (const w of [390, 1280]) {
      const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16', '--diag']);
      cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.vigFirst = 1e9; cfg.forceHour = 19;
      if (hero) cfg.heroOnly = hero;
      const html = fixture({ kind: 'bravada', config: cfg, banner: true }).replace('<head>', `<head><script>${Q}</script>`);
      const ses = await open(html, { viewport: { width: w, height: w < 768 ? 700 : 800 } });
      const pg = ses.page;
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      await pg.waitForTimeout(600);
      const r = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        if (!window.DCCMoments.run('seasons')) return { skip: true };
        for (let i = 0; i < 60 * 60 && !window.__q.done; i++) s.tick(1000 / 60, 1);
        return { len: +(window.__q.t1 - window.__q.t0).toFixed(1), stats: s.moments.stats, v: s.vigLog.map(x=>x.name), h: s.heroLog.map(x=>x.kind) };
      });
      out.push({ theme, hero: hero || '(any)', w, ...r });
      await ses.close();
    }
  }
  console.log(out.map(o => `${o.theme} ${o.hero} @${o.w}: ${o.skip ? 'ready() false' : o.len + ' s  (' + (o.v.join(',')||'no scene') + ' + ' + (o.h.join(',')||'no flyer') + (o.stats.capped ? ', CAPPED' : '') + ')'}`).join('\n'));
})();
