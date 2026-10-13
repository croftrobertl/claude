'use strict';
/**
 * DCC Seasons — smooth motion at Retina scale (4.10.6, Rob on a 2x MacBook:
 * the plane's and the witch's "motion moving forward is slightly glitchy").
 *
 * Real clock and real rAF (tools/measure-pacing.js), Rob's live settings,
 * the fixture's LIVE plane (a compositor animation with a drop-shadow and a
 * spinning propeller) crossing the moon while the witch scene plays:
 *
 *   - at 1280x700 and 1440x900 at 2x and 390x844 at 3x, at least 95% of
 *     frames come within 17 ms, over the whole scene AND while the plane is
 *     over the moon; and the same with the falling sprites on, and for the
 *     flyer witch meeting the plane;
 *   - every repaint clears the WHOLE canvas (never a partial clear: on a
 *     GPU-drawn canvas one makes the browser copy last frame's canvas
 *     first), during the scene and with the background layer alone;
 *   - scrolling down past the header picture and back while the scene
 *     plays (4.10.7: it scrolls with the picture): 95% within 17 ms, and
 *     no more layouts or style recalcs a second than with Seasons off;
 *   - the foreground cut draws the plane's still shapes from ONE picture,
 *     made again only when they change: a handful of pictures over a
 *     crossing that cuts every frame.
 *
 * What this container cannot show: it draws and composites on the CPU, so
 * rAF never waits for a GPU, and GPU costs (what Rob's Mac paid) do not
 * appear in these frame times at all. The GPU half is measured with
 * `node tools/measure-pacing.js --gpu=1` (Chromium's GPU canvas on
 * SwiftShader) and reported, build against build; the two mechanisms it
 * found are what the clear and picture checks above pin down.
 *
 *   node tools/test-frame-pacing.js [--runs=2]
 */
const { measure } = require('./measure-pacing');
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const RUNS = +(argv.runs || 2);

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const pct = s => s ? `${s.within17}% of ${s.frames} frames within 17 ms (p95 ${s.p95} ms, max ${s.max} ms)` : 'no frames';

(async () => {
  const sizes = [[1280, 700, 2], [1440, 900, 2], [390, 844, 3]];
  console.log('\n  --- the witch scene with the plane crossing the moon ---');
  for (const [w, h, d] of sizes) {
    const r = await measure({ width: w, height: h, dsf: d, runs: RUNS });
    const tag = `${w}x${h} at ${d}x`;
    ok(r.scene && r.scene.frames > 100 && r.scene.within17 >= 95, `${tag}: the scene: ${pct(r.scene)}`, JSON.stringify(r.scene));
    ok(r.planeOverMoon && r.planeOverMoon.frames > 20 && r.planeOverMoon.within17 >= 95, `${tag}: the plane over the moon: ${pct(r.planeOverMoon)}`, JSON.stringify(r.planeOverMoon));
    ok(r.clears.full > 100 && r.clears.part === 0, `${tag}: every repaint cleared the whole canvas (${r.clears.full} full, ${r.clears.part} partial)`, JSON.stringify(r.clears));
    ok(r.fore.cuts > 20 && r.fore.builds >= RUNS && r.fore.builds <= 4 * RUNS, `${tag}: the plane's still shapes cut from one picture (${r.fore.builds} pictures for ${r.fore.cuts} cut frames)`, JSON.stringify(r.fore));
    console.log(`          main thread ${r.mainThreadMsPerSec.task} ms/s (script ${r.mainThreadMsPerSec.script})`);
  }

  console.log('\n  --- falling sprites on, and the flyer witch meeting the plane (1280x700 at 2x) ---');
  {
    const r = await measure({ width: 1280, height: 700, dsf: 2, runs: RUNS, gen: ['--ambient=1'] });
    ok(r.scene && r.scene.within17 >= 95, `sprites on, the scene: ${pct(r.scene)}`, JSON.stringify(r.scene));
    ok(r.planeOverMoon && r.planeOverMoon.frames > 20 && r.planeOverMoon.within17 >= 95, `sprites on, the plane over the moon: ${pct(r.planeOverMoon)}`, JSON.stringify(r.planeOverMoon));
    ok(r.clears.part === 0, `sprites on: no partial clear (${r.clears.full} full)`, JSON.stringify(r.clears));
  }
  {
    const r = await measure({ width: 1280, height: 700, dsf: 2, runs: RUNS, hero: 'witch' });
    ok(r.scene && r.scene.frames > 60 && r.scene.within17 >= 95, `the flyer witch: ${pct(r.scene)}`, JSON.stringify(r.scene));
    ok(r.planeOverMoon && r.planeOverMoon.frames > 10 && r.planeOverMoon.within17 >= 95, `the plane meeting her: ${pct(r.planeOverMoon)}`, JSON.stringify(r.planeOverMoon));
  }

  /* 4.10.7: the scene is on a canvas inside the header picture and
   * scrolls with it on the compositor. A guest wheels down past the
   * picture and back up, twice, while it plays: the frames stay even, and
   * the page does no more layout or style work a second than it does with
   * Seasons off (nothing is read or written per scroll). */
  console.log('\n  --- scrolling while the scene plays ---');
  for (const [w, h, d] of sizes) {
    const tag = `${w}x${h} at ${d}x, scrolling`;
    const off = await measure({ width: w, height: h, dsf: d, runs: 1, scroll: true, seasons: false });
    const r = await measure({ width: w, height: h, dsf: d, runs: RUNS, scroll: true });
    ok(r.scrolled > 420, `${tag}: the page scrolled past the picture (${r.scrolled} px)`, String(r.scrolled));
    ok(r.scene && r.scene.frames > 100 && r.scene.within17 >= 95, `${tag}: ${pct(r.scene)}`, JSON.stringify(r.scene));
    ok(r.clears.part === 0, `${tag}: every repaint a full clear (${r.clears.full} full, both canvases)`, JSON.stringify(r.clears));
    ok(r.perSec.layouts <= off.perSec.layouts + 3 && r.perSec.styleRecalcs <= off.perSec.styleRecalcs + 6,
      `${tag}: no extra layout work (${r.perSec.layouts} layouts/s and ${r.perSec.styleRecalcs} style recalcs/s, Seasons off ${off.perSec.layouts} and ${off.perSec.styleRecalcs})`, JSON.stringify({ on: r.perSec, off: off.perSec }));
  }

  console.log('\n  --- the background layer alone, the plane flying (1280x700 at 2x) ---');
  {
    const r = await measure({ width: 1280, height: 700, dsf: 2, runs: RUNS, noscene: true });
    const per = r.clears.full / (RUNS * 5.2);
    ok(r.clears.part === 0 && per > 24 && per < 36, `30 repaints a second, each a full clear (${per.toFixed(1)}/s, ${r.clears.part} partial)`, JSON.stringify(r.clears));
    ok(r.scene && r.scene.within17 >= 95, `the page: ${pct(r.scene)}`, JSON.stringify(r.scene));
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
