'use strict';
/**
 * DCC Seasons — each layer on its own switch (4.5.0, Rob 2026-10-06).
 *
 * "Ambient particles" now switches the falling/drifting sprites ONLY. The
 * engine loads whenever any engine layer is on (CFG.engine, from
 * Settings::engine_needed()), so with ambient=0 and subtle=1 — the live
 * settings — the background layer, the corner accent, the hero and the
 * scenes still play, and no sprite is drawn. With every engine layer off
 * the engine is not even fetched. Runs on the mocked clock (--diag).
 *
 * Usage: node tools/test-switches.js
 */
const fs = require('fs');
const path = require('path');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const S = () => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
async function boot(args, width, tweak) {
  const cfg = config(['--placement=content', '--layering=front', '--density=16', '--diag', ...args]);
  if (tweak) { tweak(cfg); }
  const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width, height: width < 768 ? 844 : 900 } });
  return { ses, cfg };
}

(async () => {
  for (const w of [390, 1280]) {
    console.log(`\n  --- ambient=0, subtle=1 (live), ${w}px ---`);
    const { ses, cfg } = await boot(['--ambient=0', '--theme=halloween'], w, c => { c.heroEvery = [2, 3]; c.vigFirst = 6000; c.vigGap = 1e9; });
    try {
      ok(cfg.ambient === false && cfg.engine === true, 'config: ambient false, engine true', JSON.stringify({ a: cfg.ambient, e: cfg.engine }));
      const loaded = await ses.page.waitForFunction(S, null, { timeout: 15000 }).then(() => true, () => false);
      ok(loaded, 'the engine loads with Ambient off', 'no engine');
      if (!loaded) { continue; }
      await ses.page.waitForTimeout(800);
      await ses.page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
      await ses.page.evaluate(() => window.DCCSeasonsEngine._state.tick(1000 / 60, 60 * 40));
      const r = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine._state;
        return { sprites: s.parts.filter(p => !p.dormant).length, subtle: s.subtle, accents: document.querySelectorAll('.dcc-seasons-accent').length,
          heroes: s.heroLog.length, scenes: s.vigLog.length, canvas: !!document.querySelector('canvas.dcc-seasons-canvas') };
      });
      ok(r.canvas, 'the canvas is mounted', '');
      ok(r.sprites === 0, 'no falling/drifting sprite is drawn', `${r.sprites} live`);
      ok(r.subtle && r.subtle.on && r.subtle.n > 0, `the background layer plays (${r.subtle && r.subtle.key}, ${r.subtle && r.subtle.n} particles)`, JSON.stringify(r.subtle));
      ok(r.accents === 1, 'the corner accent (spider web) is up', `${r.accents}`);
      ok(r.heroes >= 1, `a hero crosses (${r.heroes} in 40 s)`, '');
      ok(r.scenes >= 1, 'a scene plays', `${r.scenes}`);
    } finally { await ses.close(); }
  }

  console.log('\n  --- Earth Day, ambient=0: no globe, so the hands never give way ---');
  {
    const { ses } = await boot(['--ambient=0', '--theme=earth_day'], 390, c => { c.heroEvery = [9999, 10000]; c.vigFirst = 1e9; });
    try {
      await ses.page.waitForFunction(S, null, { timeout: 15000 });
      await ses.page.waitForTimeout(800);
      await ses.page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
      await ses.page.evaluate(() => window.DCCSeasonsEngine._state.tick(1000 / 60, 60 * 60));
      const x = await ses.page.evaluate(() => window.DCCSeasonsEngine._state.xa);
      ok(x.globes === 0 && x.accent === '0.55', 'at 60 s: no globe, the hands still at their own .55', JSON.stringify(x));
    } finally { await ses.close(); }
  }

  console.log('\n  --- every engine layer off: the engine is not fetched ---');
  {
    const { ses, cfg } = await boot(['--ambient=0', '--subtle=off', '--richness=minimal', '--theme=halloween'], 390);
    try {
      await ses.page.waitForTimeout(2500);
      const r = await ses.page.evaluate(() => ({ eng: !!window.DCCSeasonsEngine, canvas: !!document.querySelector('canvas.dcc-seasons-canvas'),
        scripts: [...document.scripts].map(s => s.src).filter(Boolean) }));
      ok(cfg.engine === false && !r.eng && !r.canvas && !r.scripts.some(s => /engine/.test(s)), 'no engine script, no canvas', JSON.stringify(r));
    } finally { await ses.close(); }
  }

  console.log('\n  --- ambient=1: sprites still come back ---');
  {
    const { ses } = await boot(['--theme=halloween'], 1280);
    try {
      await ses.page.waitForFunction(S, null, { timeout: 15000 });
      await ses.page.waitForTimeout(1500);
      const n = await ses.page.evaluate(() => window.DCCSeasonsEngine._state.parts.filter(p => !p.dormant).length);
      ok(n >= 10, `sprites are drawn (${n})`, `${n}`);
    } finally { await ses.close(); }
  }

  console.log('\n  --- the settings-page preview panel is gone, the chip stays ---');
  {
    const src = fs.readFileSync(path.join(ROOT, 'dcc-seasons/includes/class-preview.php'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!/admin_notices|render_settings_panel/.test(src), 'no admin_notices hook, no render_settings_panel', '');
    ok(/add_action\('wp_footer', \[self::class, 'render_chip'\]\)/.test(src) && /function render_chip/.test(src), 'the front-end chip is still hooked', '');
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { console.log(problems.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
