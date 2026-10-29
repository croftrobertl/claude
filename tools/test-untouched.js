'use strict';
/**
 * DCC Seasons — the Untouched test, for 4.13.5 (the Anniversary) against
 * 4.13.4, the release that is live when it ships. (Its 4.13.2/4.13.3 form,
 * Thanksgiving against 4.13.1, is in the history at 4de6bb9.) Outside the
 * Anniversary, the shared crane in Florida Keys' `cranes` scene (Rob's row
 * 9, the one exemption) and the check link's forced date, the build is
 * 4.13.4. Three proofs, each mutation-checked at the end of the run:
 *
 *  1. THEMES. Themes::themes() and subtle_defaults() for every theme but
 *     the Anniversary are byte-identical to 4.13.4's.
 *  2. TEXT. engine.js with the Anniversary's own code taken out is
 *     4.13.4's engine.js line for line, and so is the Keys scene once the
 *     new bird's branch is taken out (the old sprites' lines must still be
 *     there, character for character). Everything removed is named below,
 *     by marker or as the literal line; nothing is removed by "looks
 *     unimportant". ambient.js is 4.13.4's once its two named changes are
 *     reverted (the forced date; a list of art files), and matrix.js is
 *     byte-identical.
 *  3. PIXELS. Every theme but the Anniversary, played on the mocked clock
 *     with a seeded Math.random and a pinned Date (tools/untouched-hash.js),
 *     draws exactly the same pixels in both builds at seven moments over 24
 *     simulated seconds. Florida Keys is played WITHOUT the crane pack, so
 *     everything but its crane is proven; tools/test-anniversary.js proves
 *     the crane itself.
 *
 *   node tools/test-untouched.js [--quick]   (--quick: Halloween + 4 themes)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASE = 'b76051f';   /* 4.13.4, the split (staging 3 Nov, live 4 Nov) */
const NEW = 'anniversary';

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
  const changed = [...keys].filter(k => k !== NEW && JSON.stringify(both[0][k]) !== JSON.stringify(both[1][k]));
  const sub = [...new Set([...Object.keys(both[2]), ...Object.keys(both[3])])].filter(k => k !== NEW && both[2][k] !== both[3][k]);
  return { changed, sub, n: keys.size };
}

/* ---- 2. text ---- */
function strip(src) {
  let t = src;
  const cut = (from, to, need) => {
    const i = t.indexOf(from);
    if (i < 0) { if (need) { throw new Error('marker missing: ' + from); } return; }
    const j = t.indexOf(to, i + from.length); if (j < 0) { throw new Error('end marker missing: ' + to); }
    t = t.slice(0, i) + t.slice(j + to.length);
  };
  /* the Anniversary's own code (new only): its plan, its scene, its
   * idle-time preparation (with the Keys poses' one line) */
  cut("\t\tvar AD = ART.crane || null, AD_T = 11,", '\t\t\treturn pl;\n\t\t}\n', false);
  cut('\t\t\tannivdance: { actors: 2, run: function (st, dt) {', '\t\t\t\treturn st.t2 >= AD_T;\n\t\t\t} },\n', false);
  cut("\t\tif (AD && vigList.indexOf('annivdance') >= 0) {", "{ k: 60 * mn(W.devicePixelRatio || 1, 2) });\n\t\t}\n", false);
  /* the Keys scene's new-bird branch (the exemption), new only */
  cut('\t\t\t\t\tif (st.nb) {\n', '\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n', false);
  return t.split('\n')
    /* comment lines say nothing a guest sees */
    .filter(l => !/^\s*(\/\*|\*)/.test(l))
    /* its scene list, its background layer, its guide picture: by name */
    .filter(l => !/^\t\tanniversary: \['annivdance'\]/.test(l))
    .filter(l => !/^\s*if \(st\.nb == null\) \{ st\.nb = !!\(adK && adK\.done\); \}$/.test(l))
    .filter(l => !/^\s*var y = dance \? fy - hop : fy - hop \+ abs\(sin\(st\.ph \* 5\)\) \* \(st\.p === 1 \? 1\.5 : 0\);$/.test(l))
    /* the debug-only getter (stripped from the shipped build) */
    .filter(l => !/^\t\t\t\tget anniv\(\) \{ return \{ plan: adPlan,/.test(l))
    /* exact in-line additions, each removed as the literal text */
    .map(l => l
      .replace("'limpkinsnail', 'hibfloat'],", "'limpkinsnail', 'hibfloat']")
      .replace("cranes: 'sandhill',", "cranes: 'cranedance',")   /* the Keys scene's guide picture is the bird it now draws */
      .replace(", annivdance: 'sandhill'", '')
      .replace(" anniversary: '',", '')
      .replace(', annivdance: 1 };', ' };')
      .replace(' tk: TKM, crane: ART.crane || null,', ' tk: TKM,')
      /* the old sprites' calls, with the y the new branch shares spelt out
       * again: they must match 4.13.4's lines character for character */
      .replace("dspr('cranedance', x, y, W2 * 64 / 44, st.dir > 0, 0, a);", "dspr('cranedance', x, fy - hop, W2 * 64 / 44, st.dir > 0, 0, a);")
      .replace("dspr('crane', x, y, W2, st.dir > 0, st.dir * bow, a);", "dspr('crane', x, fy - hop + abs(sin(st.ph * 5)) * (st.p === 1 ? 1.5 : 0), W2, st.dir > 0, st.dir * bow, a);"))
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
/* the loader with its two named 4.13.5 changes put back as they were */
function ambientBack(src) {
  return src
    .replace("\t/* 4.13.5: the check link's forced date (CFG.date, set server-side only\n\t * with the check key or for an administrator), else the visitor's day */\n\tvar today = CFG.date || ymd(", '\tvar today = ymd(')
    .replace("\t\t\t/* 4.13.4: a season with its own art has it fetched alongside the\n\t\t\t * engine and run first; every other day fetches nothing more.\n\t\t\t * 4.13.5: a list of files (the shared crane, then the season's);\n\t\t\t * a single URL from an older cached config still works. */\n\t\t\tvar art = CFG.art && themeKey ? CFG.art[themeKey] : null, ai;\n\t\t\tif (typeof art === 'string') { art = [art]; }\n\t\t\tfor (ai = 0; art && ai < art.length; ai++) { loadScript(art[ai], null, null, true); }",
      "\t\t\t/* 4.13.4: a season with its own art file has it fetched alongside\n\t\t\t * the engine and run first; every other day fetches nothing more */\n\t\t\tvar art = CFG.art && themeKey ? CFG.art[themeKey] : null;\n\t\t\tif (art) { loadScript(art, null, null, true); }")
    .replace('\t\t\t}, null, !!(art && art.length));', '\t\t\t}, null, !!art);');
}

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
  const engNew = fs.readFileSync(`${JS}/engine.js`, 'utf8');
  const engOld = git('dcc-seasons/assets/js/engine.js');
  const thNew = fs.readFileSync(`${ROOT}/dcc-seasons/includes/class-themes.php`, 'utf8');
  const thOld = git('dcc-seasons/includes/class-themes.php');
  const ambNew = fs.readFileSync(`${JS}/ambient.js`, 'utf8'), ambOld = git('dcc-seasons/assets/js/ambient.js');

  console.log(`\n  --- 1. every theme but the Anniversary is 4.13.4's (${BASE}) ---`);
  const th = themesSame(themesOf(thNew, thOld));
  ok(!th.changed.length, `the other ${th.n - 1} themes are byte-identical`, th.changed.join(','));
  ok(!th.sub.length, 'and so are their background layers', th.sub.join(','));

  console.log('\n  --- 2. the text outside the Anniversary and the Keys crane ---');
  const tx = textSame(engNew, engOld);
  ok(tx.same, `engine.js identical to 4.13.4 line for line (${tx.n} lines compared)`, tx.at);
  ok(ambientBack(ambNew) === ambOld, 'ambient.js (the loader) is 4.13.4 but for the forced date and the list of art files', 'ambient');
  ok(fs.readFileSync(`${JS}/matrix.js`, 'utf8') === git('dcc-seasons/assets/js/matrix.js'), 'matrix.js (the egg) is byte-identical to 4.13.4', 'matrix');
  ok(fs.readFileSync(`${JS}/art-thanksgiving.js`, 'utf8') === git('dcc-seasons/assets/js/art-thanksgiving.js'), "Thanksgiving's art file is byte-identical to 4.13.4", 'art-thanksgiving');

  console.log('\n  --- 3. the pixels: every theme but the Anniversary, both builds ---');
  const now = {}, was = {};
  for (const f of fs.readdirSync(JS).filter(f => /\.js$/.test(f) && !/\.min\.js$/.test(f))) { now[f] = fs.readFileSync(path.join(JS, f), 'utf8'); }
  for (const f of ['ambient.js', 'engine.js', 'matrix.js', 'art-thanksgiving.js']) { was[f] = git(`dcc-seasons/assets/js/${f}`); }
  const dNew = folder(now, ['art-crane.js']), dOld = folder(was, []);
  const all = JSON.parse(execFileSync('php', [`${ROOT}/tools/gen-config.php`, '--diag'], { cwd: ROOT, encoding: 'utf8' })).themes;
  const list = (quick ? ['halloween', 'classic', 'florida_keys', 'christmas', 'thanksgiving'] : Object.keys(all)).filter(k => k !== NEW);
  const hn = hashes(dNew, list), ho = hashes(dOld, list);
  for (const k of list) {
    const bad = (hn[k] || []).filter((h, i) => h !== (ho[k] || [])[i]);
    const err = (hn[k] || []).some(h => h.startsWith('ERR'));
    ok(!bad.length && !err && hn[k] && hn[k].length === 7, `${k}: the same pixels at all 7 moments${k === 'florida_keys' ? ' (without the crane pack)' : ''} (${[...new Set((hn[k] || []).flatMap(h => h.split(' ').slice(2)))].join(', ') || 'sprites only'})`,
      JSON.stringify({ now: hn[k], was: ho[k] }));
  }

  console.log('\n  --- mutations: each one-line break must be caught ---');
  {
    const m1 = thNew.replace(/(\['s' => 'bat'[^\]]*?)\]/, "$1, 'w' => 9]");
    ok(m1 !== thNew && themesSame(themesOf(m1, thOld)).changed.includes('halloween'), 'a Halloween particle changed in PHP fails proof 1', 'bat w');
    const m2 = engNew.replace(/(\n\t\tbat: '[^']*?)(\d)(")/, (a, p, d, q) => p + ((+d + 1) % 10) + q);
    ok(m2 !== engNew && !textSame(m2, engOld).same, 'a Halloween sprite nudged by one digit fails proof 2', 'bat');
    /* the Keys scene outside the new bird's branch: its timing, its old sprites */
    const m3 = engNew.replace("if (st.p === 3 && st.t2 > 3.6) { st.p = 4; st.t2 = 0; }", "if (st.p === 3 && st.t2 > 3.7) { st.p = 4; st.t2 = 0; }");
    ok(m3 !== engNew && !textSame(m3, engOld).same, "the Keys cranes' dance lengthened fails proof 2", 'cranes p3');
    const m4 = engNew.replace("dspr('crane', x, y, W2, st.dir > 0, st.dir * bow, a);", "dspr('crane', x, y, W2 + 2, st.dir > 0, st.dir * bow, a);");
    ok(m4 !== engNew && !textSame(m4, engOld).same, "the Keys cranes' old sprite resized fails proof 2", 'crane W2');
    /* shared code every scene uses, and the sky list */
    const m5 = engNew.replace(/(\t\t\twitchmoon: \{ actors: )(\d)/, (a, p, d) => p + (+d + 1));
    ok(m5 !== engNew && !textSame(m5, engOld).same, 'the witchmoon scene changed fails proof 2', 'witchmoon');
    const m6 = engNew.replace(', annivdance: 1 };', ', annivdance: 1, giftdrop: 1 };');
    ok(m6 !== engNew && !textSame(m6, engOld).same, 'another scene slipped into the sky list fails proof 2', 'SKY_VIG');
    /* the loader: the forced date applied without being asked */
    const m7 = ambNew.replace('var today = CFG.date || ymd(', "var today = CFG.date || '2026-11-11' || ymd(");
    ok(m7 !== ambNew && ambientBack(m7) !== ambOld, 'the loader forcing a date on its own fails proof 2', 'today');
    /* and the pixels see a sprite change on their own */
    const dm = folder(Object.assign({}, now, { 'engine.js': engNew.replace(/(\n\t\tbat: ')(\d+) /, (a, p, d) => p + (+d + 4) + ' ') }), ['art-crane.js']);
    const hm = hashes(dm, ['halloween']);
    ok(JSON.stringify(hm.halloween) !== JSON.stringify(ho.halloween), 'a Halloween sprite resized in the engine fails proof 3 (the pixels)', JSON.stringify(hm.halloween));
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
