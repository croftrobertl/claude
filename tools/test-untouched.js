'use strict';
/**
 * DCC Seasons — 4.13.2, the Untouched test: outside Thanksgiving (and the
 * inert-unless-asked check link), the build is 4.13.1, the release that is
 * live. Three proofs, each mutation-checked at the end of the run:
 *
 *  1. THEMES. Themes::themes() and subtle_defaults() for every theme but
 *     Thanksgiving are byte-identical to 4.13.1's.
 *  2. TEXT. engine.js with Thanksgiving's own code taken out is 4.13.1's
 *     engine.js with Thanksgiving's own code taken out, line for line.
 *     Everything removed is named below by a Thanksgiving-only marker
 *     (its blocks, its sprites, its behaviours, the tom's draw, the
 *     check link); nothing is removed by "looks unimportant".
 *  3. PIXELS. Every theme but Thanksgiving, played on the mocked clock
 *     with a seeded Math.random and a pinned Date (tools/untouched-hash.js),
 *     draws exactly the same pixels in both builds at seven moments over
 *     24 simulated seconds, through the first scene and flyer. Thanksgiving
 *     itself must DIFFER, or the pixel check is not looking.
 *
 *   node tools/test-untouched.js [--quick]   (--quick: Halloween + 3 themes)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASE = '64340a4';   /* 4.13.1, live since 2026-10-26 */

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const git = f => execFileSync('git', ['show', `${BASE}:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });

/* ---- 1. themes ---- */
function themesOf(newSrc, oldSrc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-unt-'));
  fs.writeFileSync(path.join(tmp, 'new.php'), newSrc);
  fs.writeFileSync(path.join(tmp, 'old.php'), oldSrc.replace('namespace DCC_Seasons;', 'namespace DCC_Seasons_Old;'));
  return JSON.parse(execFileSync('php', ['-r', `define('ABSPATH',1);
    function __($s,$d=null){return $s;} function esc_html__($s,$d=null){return $s;}
    function apply_filters($t,$v){return $v;}
    require '${ROOT}/dcc-seasons/includes/class-schedule.php';
    require '${tmp}/new.php'; require '${tmp}/old.php';
    echo json_encode([\\DCC_Seasons\\Themes::themes(), \\DCC_Seasons_Old\\Themes::themes(), \\DCC_Seasons\\Themes::subtle_defaults(), \\DCC_Seasons_Old\\Themes::subtle_defaults()]);`],
  { cwd: ROOT, encoding: 'utf8' }));
}
function themesSame(both) {
  const keys = new Set([...Object.keys(both[0]), ...Object.keys(both[1])]);
  const changed = [...keys].filter(k => k !== 'thanksgiving' && JSON.stringify(both[0][k]) !== JSON.stringify(both[1][k]));
  const sub = [...new Set([...Object.keys(both[2]), ...Object.keys(both[3])])].filter(k => k !== 'thanksgiving' && both[2][k] !== both[3][k]);
  return { changed, sub, n: keys.size };
}

/* ---- 2. text ---- */
/* Thanksgiving's sprites, in either build */
const TG_SPRITES = 'turkey|leafo|leafc|leafm|leafm2|leafs|gourd1|gourd2|gourd3|corn|cranberry|acorn|pie|cornucopia';
function strip(src) {
  let t = src;
  const cut = (from, to, need) => {
    const i = t.indexOf(from);
    if (i < 0) { if (need) { throw new Error('marker missing: ' + from); } return; }
    const j = t.indexOf(to, i + from.length); if (j < 0) { throw new Error('end marker missing: ' + to); }
    t = t.slice(0, i) + t.slice(j + to.length);
  };
  /* the drawn tom, his poults and the three generated pieces (new only) */
  cut('\t/* TG_GEN_START', '/* TK_MOD_END */\n', false);
  /* the tom's behaviour, his draw, his poults, his pre-draw (new only) */
  cut("\t\t\t\tcase 'forage':", '\t\t\t\t\tbreak;\n', false);
  cut("\t\t\t\tif (sp.def.draw === 'tom') {", '\n\t\t\t\t}\n', false);
  cut('\t\tfunction tomPoults(', '\n\t\t}\n', false);
  cut('\t\tvar TK_FR = ', "return (poult ? 'k' : '') + (jab && !poult ? 'pj' : 'p' + mx2(1, MT.round(d * 4)));\n\t\t}\n", false);
  cut('\t\tturkey: function (g, w, h) {', '\n\t\t},\n', false);
  return t.split('\n')
    /* comment lines say nothing a guest sees */
    .filter(l => !/^\s*(\/\*|\*)/.test(l))
    /* Thanksgiving's sprites and its corner accent */
    .filter(l => !new RegExp(`^\\t\\t(${TG_SPRITES}): `).test(l))
    .filter(l => !/^\t\tthanksgiving: \['cornucopia', /.test(l))
    /* its two new falling behaviours and its walker, by name only */
    .filter(l => !/^\t\t\tif \(b === '(leaf|drop)'\) \{/.test(l))
    .filter(l => !/^\t\t\t\t\tif \(b === 'leaf' && !p\.settled\)/.test(l))
    .filter(l => !/^\t\t\t\tif \(b === 'forage'\) \{/.test(l))
    /* the check link: two whole lines that act only when CFG.sceneNow */
    .filter(l => !/^\t\tvar sceneNow = !!CFG\.sceneNow;$/.test(l))
    /* the debug-only getter for the tom (stripped from the shipped build) */
    .filter(l => !/^\t\t\t\tget tom\(\) \{ return \{ mainBuilt: tkN, /.test(l))
    .filter(l => !/^\t\t\tif \(sceneNow && canVig\(\)\) \{ vigAt = vt \+ 3; heroAt = INF; return; \}$/.test(l))
    /* and exact in-line additions, each removed as the literal text */
    .map(l => l
      .replace(" || b === 'forage'", '')
      .replace(" case 'leaf': case 'drop':", '')
      .replace(' leaf drop ', ' ')
      .replace(' && !sceneNow', '')
      .replace('!sceneNow && ', '')
      .replace('{ vigAt = sceneNow ? 1 : (DEBUG', '{ vigAt = (DEBUG'))
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l !== '');
}
function textSame(newSrc, oldSrc) {
  const a = strip(oldSrc), b = strip(newSrc);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { return { same: false, at: `line ${i}: now "${String(b[i]).trim().slice(0, 80)}" | was "${String(a[i]).trim().slice(0, 80)}"`, n: b.length }; }
  }
  return { same: true, n: b.length };
}

/* ---- 3. pixels ---- */
function hashes(assets, themes) {
  const env = { ...process.env }; if (assets) { env.DCC_ASSETS = assets; } else { delete env.DCC_ASSETS; }
  return JSON.parse(execFileSync('node', [path.join(__dirname, 'untouched-hash.js'), '--themes=' + themes.join(',')],
    { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }));
}

(async () => {
  const quick = process.argv.includes('--quick');
  const engNew = fs.readFileSync(`${ROOT}/dcc-seasons/assets/js/engine.js`, 'utf8');
  const engOld = git('dcc-seasons/assets/js/engine.js');
  const thNew = fs.readFileSync(`${ROOT}/dcc-seasons/includes/class-themes.php`, 'utf8');
  const thOld = git('dcc-seasons/includes/class-themes.php');

  console.log(`\n  --- 1. every theme but Thanksgiving is 4.13.1's (${BASE}) ---`);
  const th = themesSame(themesOf(thNew, thOld));
  ok(!th.changed.length, `the other ${th.n - 1} themes are byte-identical`, th.changed.join(','));
  ok(!th.sub.length, 'and so are their background layers', th.sub.join(','));

  console.log('\n  --- 2. engine.js outside Thanksgiving and the check link ---');
  const tx = textSame(engNew, engOld);
  ok(tx.same, `identical to 4.13.1 line for line (${tx.n} lines compared)`, tx.at);
  for (const f of ['ambient.js', 'matrix.js']) {
    const a = fs.readFileSync(`${ROOT}/dcc-seasons/assets/js/${f}`, 'utf8'), b = git(`dcc-seasons/assets/js/${f}`);
    ok(a === b, `${f} (the loader / the egg) is byte-identical to 4.13.1`, f);
  }

  console.log('\n  --- 3. the pixels: every theme but Thanksgiving, both builds ---');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-unt-old-'));
  for (const f of ['ambient.js', 'engine.js', 'matrix.js']) { fs.writeFileSync(path.join(scratch, f), git(`dcc-seasons/assets/js/${f}`)); }
  const all = JSON.parse(execFileSync('php', [`${ROOT}/tools/gen-config.php`, '--diag'], { cwd: ROOT, encoding: 'utf8' })).themes;
  const list = quick ? ['halloween', 'classic', 'florida_keys', 'christmas', 'thanksgiving'] : Object.keys(all);
  const hn = hashes(null, list), ho = hashes(scratch, list);
  for (const k of list) {
    if (k === 'thanksgiving') {
      ok(JSON.stringify(hn[k]) !== JSON.stringify(ho[k]), 'Thanksgiving itself differs (the pixel check can see a change)', JSON.stringify(hn[k]));
      continue;
    }
    const bad = (hn[k] || []).filter((h, i) => h !== (ho[k] || [])[i]);
    const err = (hn[k] || []).some(h => h.startsWith('ERR'));
    ok(!bad.length && !err && hn[k] && hn[k].length === 7, `${k}: the same pixels at all 7 moments (${[...new Set((hn[k] || []).flatMap(h => h.split(' ').slice(2)))].join(', ') || 'sprites only'})`,
      JSON.stringify({ now: hn[k], was: ho[k] }));
  }

  console.log('\n  --- mutations: each one-line break must be caught ---');
  {
    /* a Halloween row changed in PHP */
    const m1 = thNew.replace("'halloween' =>", "'halloween' =>").replace(/(\['s' => 'bat'[^\]]*?)\]/, "$1, 'w' => 9]");
    ok(m1 !== thNew && themesSame(themesOf(m1, thOld)).changed.includes('halloween'), 'a Halloween particle changed in PHP fails proof 1', 'bat w');
    /* a Halloween sprite changed in the engine */
    const m2 = engNew.replace(/(\n\t\tbat: '[^']*?)(\d)(")/, (a, p, d, q) => p + ((+d + 1) % 10) + q);
    ok(m2 !== engNew && !textSame(m2, engOld).same, 'a Halloween sprite nudged by one digit fails proof 2', 'bat');
    /* shared motion code every theme uses */
    const m3 = engNew.replace("case 'fall': case 'sway': case 'tumble': case 'spin': case 'leaf': case 'drop':", "case 'fall': case 'sway': case 'spin': case 'leaf': case 'drop': case 'tumble':");
    ok(m3 !== engNew && !textSame(m3, engOld).same, 'the shared fall/sway/tumble code reordered fails proof 2', 'fall case');
    /* something hidden behind a Thanksgiving marker: the forage test also catching 'hop' */
    const m4 = engNew.replace("if (b === 'hop' || b === 'waddle' || b === 'chatter' || b === 'forage') {", "if (b === 'waddle' || b === 'chatter' || b === 'forage') {");
    ok(m4 !== engNew && !textSame(m4, engOld).same, "a change riding on the forage line (hop dropped) fails proof 2", 'hop');
    /* the witch scene, a constant in shared scheduling, the FREEAIR list */
    const m5 = engNew.replace(/(\t\t\twitchmoon: \{ actors: )(\d)/, (a, p, d) => p + (+d + 1));
    ok(m5 !== engNew && !textSame(m5, engOld).same, 'the witchmoon scene changed fails proof 2', 'witchmoon');
    const m6 = engNew.replace(' firefly leaf drop ', ' firefly leaf drop dangle2 ');
    ok(m6 !== engNew && !textSame(m6, engOld).same, 'an extra behaviour slipped into FREEAIR fails proof 2', 'FREEAIR');
    const m7 = engNew.replace('if (sceneNow && canVig()) { vigAt = vt + 3; heroAt = INF; return; }', 'if (canVig()) { vigAt = vt + 3; heroAt = INF; return; }');
    ok(m7 !== engNew && !textSame(m7, engOld).same, 'the check link acting without CFG.sceneNow fails proof 2', 'sceneNow');
    /* and the pixels see a sprite change on their own */
    const mdir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-unt-mut-'));
    for (const f of ['ambient.js', 'matrix.js']) { fs.copyFileSync(`${ROOT}/dcc-seasons/assets/js/${f}`, path.join(mdir, f)); }
    fs.writeFileSync(path.join(mdir, 'engine.js'), engNew.replace(/(\n\t\tbat: ')(\d+) /, (a, p, d) => p + (+d + 4) + ' '));
    const hm = hashes(mdir, ['halloween']);
    ok(JSON.stringify(hm.halloween) !== JSON.stringify(ho.halloween), 'a Halloween sprite resized in the engine fails proof 3 (the pixels)', JSON.stringify(hm.halloween));
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
