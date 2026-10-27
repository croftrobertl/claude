'use strict';
/**
 * DCC Seasons — 4.13.2: the strutting tom on the REAL home page at 390, 768
 * and 1440 (the standing three-width rule), mid-crossing, with the title,
 * tagline, menu and dial in view, from the real engine on the mocked clock.
 *
 *   node tools/tg-tom-widths.js   -> build/.tomw-<w>.png (for the round-3 sheet)
 */
const path = require('path');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');

(async () => {
  for (const W of [390, 768, 1440]) {
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
    { const t = cfg.themes.thanksgiving.ambient.particles.find(x => x.s === 'turkey'); t.w = 40; t.n = 1; }   /* make sure one walks, and only one */
    cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; cfg.forceHour = 12;
    const ses = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner{display:none!important}</style>' }), { ...rt.opts(W), viewport: { width: W, height: W < 768 ? 844 : 900 }, dsf: 2 });
    const pg = ses.page;
    await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.parts.length > 3, null, { timeout: 30000 });
    await pg.waitForTimeout(2500);   /* the pre-draw runs in idle time */
    const ok = await pg.evaluate((W) => {
      for (const el of document.querySelectorAll('body *')) { if (!el.children.length && /^DCC Seasons diagnostics/.test(el.textContent || '')) { el.parentElement.style.display = 'none'; break; } }   /* the --diag panel, not the page */
      const S = window.DCCSeasonsEngine._state; S.manual(true);
      let t = S.parts.find(p => p.sKey === 'turkey');
      if (!t) { return false; }
      t.dir = -1; t.vx = -17; t.x = W * 0.62; t.fs = 0; t.ft = 9; t.wp = 0.1; t.kp = 0.3; t.gap = 1;
      S.tick(1000 / 30, 20); return true;
    }, W);
    if (!ok) { console.log('no turkey at', W); }
    await pg.screenshot({ path: path.join(ROOT, 'build', '.tomw-' + W + '.png') });
    await ses.close();
    console.log(W, ok);
  }
})().catch(e => { console.error(e); process.exit(1); });
