'use strict';
/**
 * DCC Seasons — when things appear (Rob, 2026-10-11, 4.8.0).
 *
 *   - the season's scene first at 6-10 s (4.9.0, Rob: scene first);
 *   - on a visit's FIRST page the flyer (hero) follows 2 s after that
 *     scene ends, never on top of it;
 *   - after that ONE appearance every 60-90 s, counted from the end of the
 *     last, scene and hero taking turns, never two at once;
 *   - a theme with no scene (or none at this hour) sends its hero at
 *     6-10 s, on any page;
 *   - every theme, including hero-only ones, and Christmas's evening-only
 *     sleighmoon (forceHour 20).
 *
 * Runs on the mocked clock (_state.tick), never wall time. Prints the first
 * appearances per theme and asserts the rules on each.
 *
 * Usage: node tools/test-timing.js [--width=390] [--only=theme]
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const WIDTH = +(arg('width') || 390);
const ONLY = arg('only');
const SIM = 330, STEP = 50;   /* simulated seconds, ms per tick */
const TOL = 0.12;             /* a few ticks of slack */

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}

async function run(theme, later, hour) {
  const cfg = config(['--placement=content', '--layering=front', '--density=16', '--ambient=0', '--diag', `--theme=${theme}`]);
  cfg.forceHour = hour;
  const ses = await open('<!doctype html><title>x</title>', { viewport: { width: WIDTH, height: WIDTH < 768 ? 844 : 900 } });
  if (later) { await ses.page.addInitScript(() => { try { sessionStorage.setItem('dcc_seasons_visit', '1'); } catch (e) { /* blocked */ } }); }
  await ses.page.route('http://dcc.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture({ kind: 'bravada', config: cfg }) }));
  await ses.page.goto('http://dcc.test/', { waitUntil: 'load' });
  try {
    await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
    return await ses.page.evaluate(([sim, step]) => {
      const s = window.DCCSeasonsEngine._state;
      s.manual(true);
      const vt0 = s.vt;
      for (let i = 0; i < sim * 1000 / step; i++) { s.tick(step, 1); }
      const ev = s.heroLog.map(h => ({ k: 'hero', n: h.kind, a: h.start - vt0, b: h.end < 0 ? null : h.end - vt0 }))
        .concat(s.vigLog.map(v => ({ k: 'scene', n: v.name, a: v.start - vt0, b: v.end < 0 ? null : v.end - vt0 })))
        .sort((x, y) => x.a - y.a);
      return { ev, vt0, first: s.firstPage, evening: s.evening };
    }, [SIM, STEP]);
  } finally { await ses.close(); }
}

(async () => {
  const keys = Object.keys(config(['--theme=halloween']).themes).filter(k => !ONLY || k === ONLY);
  const scenesOf = require('fs').readFileSync(require('path').join(__dirname, '../dcc-seasons/assets/js/engine.js'), 'utf8');
  const vigsBlock = scenesOf.slice(scenesOf.indexOf('var VIGS = {'), scenesOf.indexOf('};', scenesOf.indexOf('var VIGS = {')));
  const hasScene = k => new RegExp(`\\b${k}: \\[`).test(vigsBlock);
  const runs = [];
  for (const k of keys) {
    runs.push([k, false, 12]);
    runs.push([k, true, 12]);
  }
  if (!ONLY || ONLY === 'christmas') { runs.push(['christmas', false, 20]); }
  console.log(`\n  width ${WIDTH}px · ${SIM} simulated seconds per run · first three appearances (s from load)\n`);
  for (const [k, later, hour] of runs) {
    const r = await run(k, later, hour);
    const ev = r.ev;
    const tag = `${k}${later ? ' (later page)' : ''}${hour === 20 ? ' (evening)' : ''}`;
    console.log(`  ${tag.padEnd(34)} ` + ev.slice(0, 3).map(e => `${e.k === 'hero' ? 'H' : 'S'}:${e.n} ${e.a.toFixed(1)}-${e.b == null ? '…' : e.b.toFixed(1)}`).join('  ·  '));
    const scenes = hasScene(k) || (hour === 20 && k === 'christmas');
    /* never two at once */
    let overlap = null;
    for (let i = 1; i < ev.length; i++) { if (ev[i - 1].b == null || ev[i].a < ev[i - 1].b - 1e-6) { overlap = [ev[i - 1], ev[i]]; break; } }
    ok(!overlap, `${tag}: never two at once`, JSON.stringify(overlap));
    if (!ev.length) { ok(false, `${tag}: something appears`, 'nothing in 330 s'); continue; }
    /* 4.9.0 (Rob): scene first at 6-10 s; on a first page the flyer
     * follows 2 s after that scene ends; a theme with no scene sends its
     * hero at 6-10 s on every page */
    if (scenes) {
      ok(ev[0].k === 'scene' && ev[0].a >= 6 - TOL && ev[0].a <= 10 + TOL, `${tag}: the scene first, at 6-10 s`, JSON.stringify(ev[0]));
      if (!later) {
        ok(ev[1] && ev[1].k === 'hero' && ev[0].b != null && Math.abs(ev[1].a - ev[0].b - 2) <= TOL,
          `${tag}: the flyer second, 2 s after the scene ends`, JSON.stringify(ev.slice(0, 2)));
      }
    } else {
      ok(!ev.some(e => e.k === 'scene'), `${tag}: no scene (the theme has none at this hour)`, JSON.stringify(ev.find(e => e.k === 'scene')));
      ok(ev[0].k === 'hero' && ev[0].a >= 6 - TOL && ev[0].a <= 10 + TOL, `${tag}: no scene, so the hero at 6-10 s`, JSON.stringify(ev[0]));
    }
    /* after the opening appearances: one every 60-90 s after the last ends */
    const intro = !later && scenes ? 2 : 1;
    for (let i = intro; i < ev.length; i++) {
      const gap = ev[i].a - ev[i - 1].b;
      ok(gap >= 60 - TOL && gap <= 90 + TOL, `${tag}: appearance ${i + 1} comes 60-90 s after the last one ended`, `${gap.toFixed(2)} s (${JSON.stringify(ev[i])})`);
      if (scenes) { ok(ev[i].k !== ev[i - 1].k, `${tag}: hero and scene take turns`, `${ev[i - 1].k} then ${ev[i].k}`); }
    }
    /* nothing went missing at the end: the next appearance was due no more
     * than 90 s after the last one ended (a fixed count is wrong here — a
     * long summer scene and two 90 s gaps can push the 4th past 330 s) */
    const lastEnd = ev[ev.length - 1].b;
    ok(ev.length >= 3 && (lastEnd == null || SIM - lastEnd <= 90 + TOL), `${tag}: ${ev.length} appearances, and the screen is never idle more than 90 s at the end`, `last ended ${lastEnd}, run ${SIM}`);
  }
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { console.log(problems.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
