'use strict';
/**
 * DCC Seasons — 4.13.0, Thanksgiving: that what Rob approved is what ships.
 *
 * Every assertion here is a pick of his, so a mutation that quietly swaps
 * one has something to fail against. The set is pinned EXACTLY — an extra
 * sprite is as much a defect as a missing one, because an unapproved piece
 * reaching the build is the thing this is here to stop.
 *
 *   node tools/test-thanksgiving.js
 */
const { execFileSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const QUIET = '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}';

/* Rob's approved set, written out rather than derived: a test that reads the
 * same source as the code cannot tell you the code changed. */
const APPROVED = ['leafo', 'leafc', 'leafm', 'leafm2', 'leafs',
  'gourd1', 'gourd2', 'gourd3', 'corn', 'cranberry', 'acorn', 'pie', 'turkey'];

(async () => {
  console.log('\n  --- the approved pieces, and nothing else ---');
  {
    const keys = JSON.parse(execFileSync('php', ['-r', `define('ABSPATH',1);
      function __($s,$d=null){return $s;} function esc_html__($s,$d=null){return $s;}
      function apply_filters($t,$v){return $v;}
      require '${ROOT}/dcc-seasons/includes/class-schedule.php';
      require '${ROOT}/dcc-seasons/includes/class-themes.php';
      $t = \\DCC_Seasons\\Themes::themes()['thanksgiving']['ambient'];
      $k = []; foreach ($t['particles'] as $p) { foreach ((array) $p['s'] as $s) { $k[] = $s; } }
      echo json_encode($k);`], { cwd: ROOT, encoding: 'utf8' }));
    const extra = keys.filter(k => !APPROVED.includes(k));
    const missing = APPROVED.filter(k => !keys.includes(k));
    ok(!extra.length, `no unapproved piece reaches the build (${keys.length} kinds)`, extra.join(','));
    ok(!missing.length, 'every approved piece is there', missing.join(','));
    ok(['gourd1', 'gourd2', 'gourd3'].every(g => keys.includes(g)),
      "the gourds are the variety set, like Halloween's jack faces", keys.join(','));
    ok(keys.includes('leafm') && keys.includes('leafm2'),
      'the maple is one kind with two variations — full red and mid-turn', keys.join(','));
  }

  console.log('\n  --- the leaves are the ones Rob picked, not the ones they replaced ---');
  {
    const src = require('fs').readFileSync(`${ROOT}/dcc-seasons/assets/js/engine.js`, 'utf8');
    const spr = k => (src.match(new RegExp(`\\n\\t\\t${k}: '([^']*)'`)) || [])[1] || '';
    /* Each assertion names the thing that TELLS THE TWO DRAWINGS APART, so a
     * revert to the old art fails here rather than passing because a sprite
     * of that name still exists. */
    const oak = spr('leafo');
    ok(oak.startsWith('18 28|'), 'the live oak is the small oval leaf (18x28), not the lobed 22x30 one', oak.slice(0, 12));
    ok(!/Q17 5 17.6 7.6/.test(oak), "and none of the northern oak's lobes survive", oak.slice(0, 60));
    const cyp = spr('leafc');
    ok(cyp.includes('stroke-linecap="round"') && !cyp.includes('<ellipse'),
      'the cypress is needles drawn as needles, not a stack of ellipses', cyp.slice(0, 60));
    const sg = spr('leafs');
    const pts = (sg.match(/ L\d/g) || []).length;
    ok(sg.startsWith('26 26|') && pts >= 9,
      `the sweetgum is a five-pointed star (${pts} points), not the chevron it replaced`, sg.slice(0, 60));
    const m1 = spr('leafm'), m2 = spr('leafm2');
    ok(m1.startsWith('24 24|') && m2.startsWith('24 24|'),
      'the maples carry the shorter stalk Rob asked for (24 tall, not 30)', m1.slice(0, 10) + ' / ' + m2.slice(0, 10));
    ok(m2.includes('#E8A33D') && !m1.includes('#E8A33D'),
      'and only the mid-turn one carries the amber middle', 'leafm/leafm2');
  }

  console.log('\n  --- the crane is B, with the primaries picked out ---');
  {
    const src = require('fs').readFileSync(`${ROOT}/dcc-seasons/assets/js/engine.js`, 'utf8');
    const fn = src.slice(src.indexOf('function crPaint'), src.indexOf('function crGet'));
    /* B's greys, not A's: Rob compared them side by side and chose B. */
    ok(fn.includes("'#9BA3A8'"), "the body is B's grey, not A's", 'crPaint');
    ok(fn.includes("'#6E767C'"), "the far wing and tertials are B's darker grey", 'crPaint');
    ok(fn.includes("'#5A6268'"), 'the primaries are picked out, which is what B means', 'crPaint');
    ok(!fn.includes("'#8C949A'") && !fn.includes("'#636B71'"), "none of A's greys survive", 'crPaint');
  }

  for (const w of [390, 1280]) {
    console.log(`\n  --- the scene, ${w}px ---`);
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigOnly = 'cranemoon'; cfg.vigFirst = 600; cfg.vigGap = 1e9;
    cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), {
      viewport: { width: w, height: w < 768 ? 700 : 800 }, dsf: 2,
    });
    const pg = ses.page;
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    try {
      await pg.addStyleTag({ content: QUIET });
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.vig === 'cranemoon', null, { timeout: 25000 });
      await pg.waitForTimeout(700);
      const r = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state, st = s.vigSt;
        return { sky: s.sky.vigSky, pic: s.sky.pic, n: st && st.n, L: st && st.L, MR: st && st.MR,
          mx: st && st.mx, w: s.sky.w, cranes: s.cranes, hero: s.hero };
      });
      ok(r.sky === true && r.pic === true, 'it plays in the header picture, on the sky canvas', JSON.stringify(r));
      ok(r.n === 5, `a V of five (${r.n})`, String(r.n));
      ok(!r.hero, 'and there is no crane flyer — the cranes are the scene only', String(r.hero));
      ok(r.cranes.frames === 24, `twelve beats pre-drawn lit and dark (${r.cranes.frames})`, String(r.cranes.frames));
      ok(r.cranes.moon === true, 'the harvest moon is pre-drawn too', JSON.stringify(r.cranes));
      /* off centre, so it clears the centred page title and the Sun dial */
      ok(Math.abs(r.mx / r.w - 0.5) > 0.08, `the moon sits clear of the centred title (${(r.mx / r.w).toFixed(2)} of the width)`, String(r.mx));
      /* the moon is WARM: the engine's own painter with a grade over it */
      const hue = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state, st = s.vigSt;
        const c = s.witch.canvas, g = c.getContext('2d');
        const dp = Math.min(devicePixelRatio || 1, 2);
        const d = g.getImageData(Math.round(st.mx * dp), Math.round(st.my * dp), 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      });
      ok(hue.a > 200 && hue.r > hue.g + 40 && hue.g > hue.b,
        `the moon is harvest-orange, not a plain moon (rgb ${hue.r},${hue.g},${hue.b})`, JSON.stringify(hue));
      ok(!errs.length, 'no page errors', errs.join(' | '));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
