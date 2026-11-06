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
  'gourd1', 'gourd3', 'corn', 'cranberry', 'acorn', 'pie', 'turkey',
  'cornucopia'];   /* 4.14.4 (Rob): it falls with the pieces now */

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
    ok(row('cornucopia').b === 'drop' && (row('cornucopia').w || 1) === (row('pie').w || 1), 'the cornucopia falls (drop), weighted as the pie', JSON.stringify(row('cornucopia')));
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
    const src = require('./engine-src').engineSource(`${ROOT}/dcc-seasons/assets/js/engine.js`);
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
    /* the corn is generated in code since 4.14.4 (multicolored, Rob):
     * run it, as leafm2 is run below */
    const cornSrc = (src.match(/\n\t\tcorn: (function \(\) \{[^\n]*?\}),/) || [])[1];
    const RE7 = { leafo: 'dccTgO1', leafs: 'dccTgS1', gourd1: 'dccTgP1', gourd3: 'dccTgA1', acorn: 'dccTgK1', cranberry: 'dccTgR1' };
    const bad7 = Object.entries(RE7).filter(([k, id]) => !spr(k).includes(id)).map(([k]) => k);
    if (!cornSrc || !/tgKernels\(\)/.test(cornSrc) || !/dccTgC1/.test(cornSrc)) { bad7.push('corn'); }
    ok(!bad7.length, 'the seven photo redraws are 4.13.1\'s', bad7.join(' ') || 'all seven');
    ok(spr('turkey') === '1 1|' && /function tkPaint\(/.test(src) && !/function kpPaint\(|KP_BOX/.test(src), 'the turkey key names the drawn tom (tkPaint), not a picture; no poult painter (4.17.0: Rob removed the poults)', spr('turkey').slice(0, 20));
    /* the pie in its tin, from the USDA photo, and nothing rising off it */
    const pf = src.slice(src.indexOf('function tgPie'), src.indexOf('function tgNest'));
    ok(/\n\t\tpie: function \(\) \{ return tgPie\(\); \}/.test(src) && pf.includes('dccTgI1p') && pf.includes('dccTgI1s') && !/steam/i.test(pf.replace('No steam', '')),
      'the pie sits in its foil tin with a soft shadow, and no steam', 'tgPie');
    /* the cornucopia at 0.85 (Rob saw it over page text at 390), no squash */
    /* 4.14.4 (Rob): no corner accent; the cornucopia falls, weighted as the pie */
    ok(!/\n\t\tthanksgiving: \['cornucopia'/.test(src), 'the cornucopia is no longer the corner accent', 'ACCENTS');
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

  console.log("\n  --- the cranes left Thanksgiving (Rob's A1, 4.14.4) ---");
  {
    const src = require('./engine-src').engineSource(`${ROOT}/dcc-seasons/assets/js/engine.js`);
    ok(/\n\t\tthanksgiving: \[\],/.test(src), 'Thanksgiving has no scene: the tom walks the foot of the screen', 'VIGS');
    ok(!/cranemoon|function crPaint|crPlanFor|fullMoonGet/.test(src), 'and the crane scene, its painter, its plan and its moon are gone from the engine', 'cranemoon');
    ok(/function dc3Paint|art-crane|danceBox/.test(src), "the Anniversary's crane (the crane pack) is untouched by it", 'crane pack');
    /* the scene on the real page, and the background leaves: test-holidays.js */
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
