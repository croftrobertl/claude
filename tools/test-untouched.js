'use strict';
/**
 * DCC Seasons — the Untouched test, for 4.14.5 (the Anniversary's round 1:
 * its pieces held to the style bible) against 4.14.4, live. The
 * Anniversary is exempt and nothing else: every other theme a guest sees
 * must draw exactly what 4.14.4 draws. 4.14.5 changes only the
 * Anniversary's own art pack, so the proof is stricter than 4.14.4's: the
 * engine, the loader, the egg and every other pack are BYTE-identical.
 * (Its 4.14.4 form, against 4.14.3, with each of that release's engine
 * lines named, is in 8ed410d; 4.14.3 against 4.14.2 in ebab72e; 4.14.2
 * against 4.14.1 in e721abd; 4.14.1 against 4.13.5 in e8db5eb; the
 * Anniversary in e8bd38f.)
 * Three proofs, each mutation-checked at the end of the run:
 *
 *  1. THEMES. Themes::themes() and subtle_defaults() for every theme are
 *     byte-identical to 4.14.4's, the Anniversary included.
 *  2. TEXT. engine.js, ambient.js, matrix.js and the Thanksgiving,
 *     Christmas and crane packs are byte-identical to 4.14.4's (the crane
 *     is Florida Keys' too).
 *  3. PIXELS. Every theme but the Anniversary, played on the mocked clock
 *     with a seeded Math.random and a pinned Date (tools/untouched-hash.js),
 *     draws exactly the same pixels in both builds at seven moments over 24
 *     simulated seconds, with every art pack in place.
 *
 *   node tools/test-untouched.js [--quick]   (--quick: Halloween + 4 themes)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASE = '8ed410d';   /* 4.14.4, Rob's Thanksgiving and Christmas corrections (live) */
const NEW = ['anniversary'];   /* the one theme 4.14.5 changes */

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
  const changed = [...keys].filter(k => !NEW.includes(k) && JSON.stringify(both[0][k]) !== JSON.stringify(both[1][k]));
  const sub = [...new Set([...Object.keys(both[2]), ...Object.keys(both[3])])].filter(k => !NEW.includes(k) && both[2][k] !== both[3][k]);
  return { changed, sub, n: keys.size };
}

/* ---- 2. text ---- */
const SAME_FILES = ['engine.js', 'ambient.js', 'matrix.js', 'art-thanksgiving.js', 'art-christmas.js', 'art-crane.js'];

/* ---- 3. pixels ---- */
function hashes(assets, themes) {
  const env = { ...process.env }; if (assets) { env.DCC_ASSETS = assets; } else { delete env.DCC_ASSETS; }
  return JSON.parse(execFileSync('node', [path.join(__dirname, 'untouched-hash.js'), '--themes=' + themes.join(',')],
    { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }));
}
const JS = `${ROOT}/dcc-seasons/assets/js`;
/* a copy of a build's js folder, less some files */
function folder(files, drop) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-unt-'));
  for (const [f, txt] of Object.entries(files)) { if (!drop.includes(f)) { fs.writeFileSync(path.join(d, f), txt); } }
  return d;
}

(async () => {
  const quick = process.argv.includes('--quick');
  const thNew = fs.readFileSync(`${ROOT}/dcc-seasons/includes/class-themes.php`, 'utf8');
  const thOld = git('dcc-seasons/includes/class-themes.php');

  console.log(`\n  --- 1. every theme, the Anniversary's row included, is 4.14.4's (${BASE}) ---`);
  const th = themesSame(themesOf(thNew, thOld));
  ok(!th.changed.length, `the other ${th.n - NEW.length} themes are byte-identical`, th.changed.join(','));
  ok(!th.sub.length, 'and so are their background layers', th.sub.join(','));
  const both = themesOf(thNew, thOld);
  ok(JSON.stringify(both[0].anniversary) === JSON.stringify(both[1].anniversary), "the Anniversary's own row is unchanged too (only its drawings change)", 'anniversary');

  console.log('\n  --- 2. the text: the engine, the loader, the egg, every other pack ---');
  const same = {}, base = {};
  for (const f of SAME_FILES) { same[f] = fs.readFileSync(`${JS}/${f}`, 'utf8'); base[f] = git(`dcc-seasons/assets/js/${f}`); ok(same[f] === base[f], `${f} is byte-identical to 4.14.4`, f); }

  console.log('\n  --- 3. the pixels: every theme but the Anniversary, both builds ---');
  const now = {}, was = {};
  for (const f of fs.readdirSync(JS).filter(f => /\.js$/.test(f) && !/\.min\.js$/.test(f))) { now[f] = fs.readFileSync(path.join(JS, f), 'utf8'); }
  for (const f of SAME_FILES.concat(['art-anniversary.js'])) { was[f] = git(`dcc-seasons/assets/js/${f}`); }
  for (const f of Object.keys(now)) { if (!(f in was)) { try { was[f] = git(`dcc-seasons/assets/js/${f}`); } catch (e) { /* new since 4.14.4 */ } } }
  const dNew = folder(now, []), dOld = folder(was, []);
  const all = JSON.parse(execFileSync('php', [`${ROOT}/tools/gen-config.php`, '--diag'], { cwd: ROOT, encoding: 'utf8' })).themes;
  const list = (quick ? ['halloween', 'classic', 'florida_keys', 'christmas', 'thanksgiving'] : Object.keys(all)).filter(k => !NEW.includes(k));
  const hn = hashes(dNew, list), ho = hashes(dOld, list);
  for (const k of list) {
    const bad = (hn[k] || []).filter((h, i) => h !== (ho[k] || [])[i]);
    const err = (hn[k] || []).some(h => h.startsWith('ERR'));
    ok(!bad.length && !err && hn[k] && hn[k].length === 7, `${k}: the same pixels at all 7 moments (${[...new Set((hn[k] || []).flatMap(h => h.split(' ').slice(2)))].join(', ') || 'sprites only'})`,
      JSON.stringify({ now: hn[k], was: ho[k] }));
  }
  /* and the exempt theme really did change (the proof is not blind to it) */
  const ha = hashes(dNew, ['anniversary']), hb = hashes(dOld, ['anniversary']);
  ok(JSON.stringify(ha.anniversary) !== JSON.stringify(hb.anniversary), "the Anniversary itself draws differently (the change under review is seen)", JSON.stringify(ha.anniversary));

  console.log('\n  --- mutations: each one-line break must be caught ---');
  {
    const m1 = thNew.replace(/(\['s' => 'bat'[^\]]*?)\]/, "$1, 'w' => 9]");
    ok(m1 !== thNew && themesSame(themesOf(m1, thOld)).changed.includes('halloween'), 'a Halloween particle changed in PHP fails proof 1', 'bat w');
    const m1b = thNew.replace("['s' => 'anheart', 'b' => 'leaf', 'w' => 3,", "['s' => 'anheart', 'b' => 'leaf', 'w' => 4,");
    const t1b = themesOf(m1b, thOld);
    ok(m1b !== thNew && JSON.stringify(t1b[0].anniversary) !== JSON.stringify(t1b[1].anniversary), "the Anniversary's mix changed in PHP fails proof 1", 'anheart w');
    const muts = [
      ['engine.js', s => s.replace(/(\n\t\tbat: '[^']*?)(\d)(")/, (a, p, d, q) => p + ((+d + 1) % 10) + q), 'a Halloween sprite nudged by one digit'],
      ['engine.js', s => s.replace(', annivdance: 1 };', ', annivdance: 1, witchmoon: 1 };'), 'the sky list changed'],
      ['art-crane.js', s => s.replace(/#[0-9A-F]{6}/, '#010203'), 'a crane colour changed (Florida Keys)'],
      ['art-thanksgiving.js', s => s.replace(/#[0-9A-F]{6}/, '#010203'), 'a Thanksgiving colour changed'],
      ['art-christmas.js', s => s.replace(/#[0-9A-F]{6}/, '#010203'), 'a Christmas colour changed'],
      ['matrix.js', s => s.replace('finaleFit', 'finaleFitX'), 'the egg changed'],
    ];
    for (const [f, fn, label] of muts) { const m = fn(same[f]); ok(m !== same[f] && m !== base[f], `${label} fails proof 2`, f); }
    /* the pixels see a sprite change on their own */
    const dm = folder(Object.assign({}, now, { 'engine.js': now['engine.js'].replace(/(\n\t\tbat: ')(\d+) /, (a, p, d) => p + (+d + 4) + ' ') }), []);
    const hm = hashes(dm, ['halloween']);
    ok(JSON.stringify(hm.halloween) !== JSON.stringify(ho.halloween), 'a Halloween sprite resized in the engine fails proof 3 (the pixels)', JSON.stringify(hm.halloween));
    /* (the crane draws on Florida Keys only in its cranes scene, which the
     * 24 s pixel walk does not reach: proof 2 holds the crane byte for byte) */
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
