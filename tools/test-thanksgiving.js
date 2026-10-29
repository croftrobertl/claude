'use strict';
/**
 * DCC Seasons — Thanksgiving (4.13.0, 4.13.1, 4.13.2): that what Rob
 * approved is what ships. That every OTHER theme is untouched is
 * tools/test-untouched.js (against 4.13.1, the live release).
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
  'gourd1', 'gourd3', 'corn', 'cranberry', 'acorn', 'pie', 'turkey'];

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
      echo json_encode([$k, $t['particles']]);`], { cwd: ROOT, encoding: 'utf8' }));
    const rows = keys.pop();
    keys.push(...keys.splice(0)[0]);
    const extra = keys.filter(k => !APPROVED.includes(k));
    const missing = APPROVED.filter(k => !keys.includes(k));
    ok(!extra.length, `no unapproved piece reaches the build (${keys.length} kinds)`, extra.join(','));
    ok(!missing.length, 'every approved piece is there', missing.join(','));
    ok(['gourd1', 'gourd3'].every(g => keys.includes(g)) && !keys.includes('gourd2'),
      'the two approved gourds, and no squash (the flat gourd2 is gone — Rob, 4.13.2)', keys.join(','));
    const row = k => rows.find(r => [].concat(r.s).includes(k)) || {};
    ok(!row('pie').fx, 'the pie has no smoke effect (no steam, Rob)', JSON.stringify(row('pie')));
    const tk = row('turkey');
    ok(tk.draw === 'tom' && tk.b === 'forage' && tk.face === 'L', 'the turkey is the drawn tom, walking (forage), art facing left', JSON.stringify(tk));
    ok(['leafo', 'leafc', 'leafm', 'leafs'].every(k => row(k).b === 'leaf') && ['gourd1', 'corn', 'cranberry', 'acorn', 'pie'].every(k => row(k).b === 'drop'),
      'leaves rock (leaf); heavy pieces drop and tumble (drop)', rows.map(r => [].concat(r.s).join('/') + ':' + r.b).join(' '));
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
    /* 4.13.1: redrawn over the Michaux plate — broad (wider than tall when
     * laid along its midrib) and dried brown (dccTgO1), never the narrow
     * pointed 18x28 oval of 4.13.0 */
    ok(oak.startsWith('32 24.8|') && oak.includes('dccTgO1'), 'the live oak is the 4.13.1 redraw from the plate, not the narrow 18x28 oval', oak.slice(0, 12));
    ok(!/Q17 5 17.6 7.6/.test(oak), "and none of the northern oak's lobes survive", oak.slice(0, 60));
    /* 4.13.2: the cypress is drawn by rule, and it is B (bolder) */
    /* 4.13.3 folded the painter to B alone (A's branches were dead): B's
     * own values, the rust #9A3E22 tips, the 1.4 outline and 320x228 box */
    const cyB = src.slice(src.indexOf('function tgCypress'), src.indexOf('function tgPie'));
    ok(/\n\t\tleafc: function \(\) \{ return tgCypress\(\); \}/.test(src) && !/bold \?|\(bold\)/.test(cyB) && cyB.includes("'#9A3E22'") && cyB.includes("'320 228'") && cyB.includes('(1.4)'),
      'the cypress is B, the bolder one, and only B', 'leafc');
    const cyf = src.slice(src.indexOf('function tgCypress'), src.indexOf('function tgPie'));
    ok(cyf.includes('stroke-linecap="round"') && !cyf.includes('<ellipse'), 'and needles drawn as needles, not a stack of ellipses', 'tgCypress');
    const sg = spr('leafs');
    /* 4.13.1: FIVE lobes from the photograph (a smooth traced outline, one
     * vein from the stalk to each tip), not the eight-pointed star of 4.13.0 */
    const veins = ((sg.match(/stroke="#E88A5C"[^>]*d="([^"]*)"|d="([^"]*)"[^>]*stroke="#E88A5C"/) || [])[1] || (sg.match(/d="([^"]*)"[^>]*stroke="#E88A5C"/) || [])[1] || '').split('M').length - 1;
    ok(sg.startsWith('32 23.1|') && veins === 5 && !/L15.4 8.2/.test(sg),
      `the sweetgum has five lobes (${veins} veins), not the eight-pointed star`, sg.slice(0, 60));
    /* the seven 4.13.1 photo redraws still in the set (each carries its
     * own dccTg gradient id); the turkey is the drawn tom since 4.13.2 */
    const RE7 = { leafo: 'dccTgO1', leafs: 'dccTgS1', gourd1: 'dccTgP1', gourd3: 'dccTgA1', corn: 'dccTgC3', acorn: 'dccTgK1', cranberry: 'dccTgR1' };
    const bad7 = Object.entries(RE7).filter(([k, id]) => !spr(k).includes(id)).map(([k]) => k);
    ok(!bad7.length, 'the seven photo redraws are 4.13.1\'s', bad7.join(' ') || 'all seven');
    ok(spr('turkey') === '1 1|' && /function tkPaint\(/.test(src) && /function kpPaint\(/.test(src), 'the turkey key names the drawn tom (tkPaint) and his poults (kpPaint), not a picture', spr('turkey').slice(0, 20));
    /* the pie in its tin, from the USDA photo, and nothing rising off it */
    const pf = src.slice(src.indexOf('function tgPie'), src.indexOf('function tgNest'));
    ok(/\n\t\tpie: function \(\) \{ return tgPie\(\); \}/.test(src) && pf.includes('dccTgI1p') && pf.includes('dccTgI1s') && !/steam/i.test(pf.replace('No steam', '')),
      'the pie sits in its foil tin with a soft shadow, and no steam', 'tgPie');
    /* the cornucopia at 0.85 (Rob saw it over page text at 390), no squash */
    ok(/thanksgiving: \['cornucopia', 'left:10px;bottom:10px;width:56px;opacity:\.85;'\]/.test(src), 'the cornucopia accent is at 0.85', 'ACCENTS');
    const hf = src.slice(src.indexOf('function tgHorn'), src.indexOf('/* TG_GEN_END */'));
    ok(!/gourd2|squash/i.test(hf.replace('no squash', '')) && /tgNest\('gourd1'/.test(hf), "the cornucopia's spill has no squash", 'tgHorn');
    /* 4.13.2: the red maple from its photograph (Rob approved both), the
     * mid-turn one the SAME leaf recoloured orange-gold */
    const m1 = spr('leafm');
    ok(m1.startsWith('30.4 32|') && m1.includes('dccTgM1'), 'the red maple is the 4.13.2 photo redraw', m1.slice(0, 16));
    ok(/\n\t\tleafm2: function \(\) \{ return SVGS\.leafm\.replace\(\/dccTgM1\/g, 'dccTgM2'\)/.test(src) && /leafm2:[^\n]*#F2C14E/.test(src),
      'and the mid-turn one is the same leaf turned orange-gold', 'leafm2');
    /* and it really IS recoloured: leafm2 replaces leafm's exact gradient
     * text, so a rewrite of leafm (4.13.3's lossless minify) that its search
     * string no longer matched would draw it plain red. Run it. */
    const m2f = src.match(/\n\t\tleafm2: (function \(\) \{[^\n]*?\}),/);
    const m2 = new Function('SVGS', 'return (' + m2f[1] + ')();')({ leafm: m1 });
    ok(m2.includes('#F2C14E') && m2.includes('#E8823A') && !m2.includes('#E0453A') && m2.includes('#FBE0A0') && !m2.includes('#F08A72'),
      'leafm2, run, is orange-gold (every recolour matched)', m2.slice(0, 200));
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
      ok(r.cranes.moon === true, 'the full moon is pre-drawn too', JSON.stringify(r.cranes));
      /* off centre, on the side the V flies into (4.13.1 keeps 0.30/0.70);
       * the keep-clear proof is test-thanksgiving-scene.js on the real page */
      ok(Math.abs(r.mx / r.w - 0.5) > 0.08, `the moon sits off centre, where the V flies (${(r.mx / r.w).toFixed(2)} of the width)`, String(r.mx));
      /* 4.13.1: PALE — a full moon high in the sky, the engine's own
       * painter ungraded (4.13.0's burnt orange is a horizon moon) */
      const hue = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state, st = s.vigSt;
        const c = s.witch.canvas, g = c.getContext('2d');
        const dp = Math.min(devicePixelRatio || 1, 2);
        const d = g.getImageData(Math.round(st.mx * dp), Math.round(st.my * dp), 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      });
      ok(hue.a > 200 && hue.r - hue.b < 70 && hue.g > 120,
        `the moon is pale cream, not 4.13.0's orange (rgb ${hue.r},${hue.g},${hue.b})`, JSON.stringify(hue));
      ok(!errs.length, 'no page errors', errs.join(' | '));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
