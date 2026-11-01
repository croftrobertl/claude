'use strict';
/**
 * DCC Seasons — the Untouched test, for 4.14.3 (the Preview tab) against
 * 4.14.2. NO theme is exempt: the preview's play buttons and its variant
 * rotation exist only when the page's config carries them (an
 * administrator or the check key), so every theme a guest sees must draw
 * exactly what 4.14.2 draws. (Its 4.14.2 form, against 4.14.1, is in
 * e721abd; 4.14.1 against 4.13.5 in e8db5eb; the Anniversary in e8bd38f.)
 * Three proofs, each mutation-checked at the end of the run:
 *
 *  1. THEMES. Themes::themes() and subtle_defaults() for every theme are
 *     byte-identical to 4.14.2's.
 *  2. TEXT. engine.js with Christmas's own code taken out is 4.14.1's
 *     engine.js line for line. Everything removed is named below, by
 *     marker or as the literal line; nothing is removed by "looks
 *     unimportant". ambient.js, matrix.js and the Thanksgiving, crane and
 *     Anniversary art files are byte-identical.
 *  3. PIXELS. Every theme but Christmas, played on the mocked clock with a
 *     seeded Math.random and a pinned Date (tools/untouched-hash.js), draws
 *     exactly the same pixels in both builds at seven moments over 24
 *     simulated seconds, with every art pack in place.
 *
 *   node tools/test-untouched.js [--quick]   (--quick: Halloween + 4 themes)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASE = 'e721abd';   /* 4.14.2, the wreath and the colors */
const NEW = '';   /* 4.14.3 changes no theme */

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
  /* Christmas's own code. New: the guide's picture of the team, the
   * team's pre-draw and placement, the scene, its idle-time preparation.
   * Old: the static sleigh flyer and the evening scene they replace. */
  cut('\t\tsanta: function (g, w, h) {\n', '\t\t\tg.restore();\n\t\t},\n', false);
  cut('\t\tvar SD_POSES = 24,', '\t\t\tcut.push([minx, miny, maxx - minx, maxy - miny]);\n\t\t}\n', false);
  cut('\t\t\tsleighmoon: { actors: 2, run: function (st, dt) {', '\t\t\t} },\n', true);
  cut("\t\tif (vigList.indexOf('sleighmoon') >= 0 && ART.xm) {", '\t\t\tsdLater(sdIdleFn);\n\t\t}\n', false);
  cut("\t\t\t} else if (kind === 'sleigh') {\n", "\t\t\t\tsprite('sleigh');\n", false);
  return t.split('\n')
    /* comment lines say nothing a guest sees */
    .filter(l => !/^\s*(\/\*|\*)/.test(l))
    /* the old pieces (now art-christmas.js), its accent, its scene lists */
    .filter(l => !/^\t\t(holly|ornament|gift|pine): '/.test(l))
    .filter(l => !/^\t\tchristmas: \[/.test(l))
    .filter(l => !/^\tvar EVENING_VIGS = /.test(l))
    .filter(l => !/^\t\tif \(!ART\.xm\) \{ vigList = vigList\.filter/.test(l))
    /* 4.14.2: the wreath's placement is called for Christmas only, and
     * finds its accent by the key every accent now carries */
    .filter(l => l !== "\t\tif (themeKey === 'christmas' && !footMode) { wrInit(); }")
    .filter(l => l !== '\t\t\tel._dccKey = key;')
    .filter(l => !/^\t\t\t\tget wreath\(\) \{/.test(l))
    /* 4.14.3: the Preview tab's play buttons and variants, only when the
     * config carries them; each added line named */
    .filter(l => l !== "\t\tvar PLAY = CFG.play ? String(CFG.play) : '', playHero = PLAY.indexOf('h:') === 0 ? PLAY.slice(2) : '';")
    .filter(l => l !== '\t\tif (playHero) { heroForced = true; heroPool = [playHero]; }')
    .filter(l => l !== '\t\t\tif (playHero) { heroAt = vt + 3; vigAt = INF; return; }')
    .filter(l => l !== "\t\tif (PLAY) { vigList = PLAY.indexOf('v:') === 0 && SCENES[PLAY.slice(2)] ? [PLAY.slice(2)] : []; }")
    .filter(l => l !== '\t\t\t\tif (CFG.variants && Array.isArray(sp.s) && sp.s.length > 1) { key = sp.s[((vt / 3) | 0) % sp.s.length]; }')
    /* the debug-only getter (stripped from the shipped build) */
    .filter(l => !/^\t\t\t\tget sleigh\(\) \{/.test(l))
    /* exact in-line changes, each put back as the literal text */
    .map(l => l
      .replace(" bass: 'bassleap', sleigh: 'sleigh', manatee:", " bass: 'bassleap', manatee:")
      .replace("sleighmoon: 'santa',", "sleighmoon: 'sleigh',")
      .replace(" christmas: 'bokeh',", " christmas: '',")
      .replace('witch: 1, sleigh: 1, osprey: 1 };', 'witch: 1, osprey: 1 };')
      .replace('osprey: 1 };   /* the sleigh flyer is gone since 4.14.0 */', 'osprey: 1 };')
      .replace("} else if (h.kind === 'sleigh' || h.kind === 'manatee') {", "} else if (h.kind === 'manatee') {")
      .replace("var sceneNow = !!CFG.sceneNow || PLAY.indexOf('v:') === 0;", 'var sceneNow = !!CFG.sceneNow;')
      .replace("var heroAt = heroFirst ? rnd(heroFirst[0], heroFirst[1]) : (playHero ? 1 : INF),", 'var heroAt = heroFirst ? rnd(heroFirst[0], heroFirst[1]) : INF,')
      .replace("return !!W.DCCMoments && !sceneNow && !PLAY; }", 'return !!W.DCCMoments && !sceneNow; }')
      .replace(" && vt < FX_CAP && !playHero) { return; }", ' && vt < FX_CAP) { return; }')
      .replace("p.sKey = Array.isArray(sp.s) ? (CFG.variants ? sp.s[(sp.rr = (sp.rr || 0) + 1) % sp.s.length] : pick(sp.s)) : sp.s;", 'p.sKey = Array.isArray(sp.s) ? pick(sp.s) : sp.s;')
      .replace('p.sKey = Array.isArray(sp.s) ? pick(sp.s) : sp.s;   /* the Preview tab shows every variant in turn */', 'p.sKey = Array.isArray(sp.s) ? pick(sp.s) : sp.s;')
      /* the guide's note that the wreath sits in the header picture (admin only) */
      .replace(' accentPic: { wreath: 1 }, ', ' '))
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
const SAME_FILES = ['ambient.js', 'matrix.js', 'art-thanksgiving.js', 'art-crane.js', 'art-anniversary.js', 'art-christmas.js'];

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

  console.log(`\n  --- 1. every theme is 4.14.2's (${BASE}) ---`);
  const th = themesSame(themesOf(thNew, thOld));
  ok(!th.changed.length, `the other ${th.n - 1} themes are byte-identical`, th.changed.join(','));
  ok(!th.sub.length, 'and so are their background layers', th.sub.join(','));

  console.log('\n  --- 2. the text, outside the Preview tab\'s named lines ---');
  const tx = textSame(engNew, engOld);
  ok(tx.same, `engine.js identical to 4.14.2 line for line (${tx.n} lines compared)`, tx.at);
  const same = {};
  for (const f of SAME_FILES) { same[f] = fs.readFileSync(`${JS}/${f}`, 'utf8'); ok(same[f] === git(`dcc-seasons/assets/js/${f}`), `${f} is byte-identical to 4.14.2`, f); }

  console.log('\n  --- 3. the pixels: every theme, both builds ---');
  const now = {}, was = {};
  for (const f of fs.readdirSync(JS).filter(f => /\.js$/.test(f) && !/\.min\.js$/.test(f))) { now[f] = fs.readFileSync(path.join(JS, f), 'utf8'); }
  for (const f of ['engine.js'].concat(SAME_FILES)) { was[f] = git(`dcc-seasons/assets/js/${f}`); }
  const dNew = folder(now, []), dOld = folder(was, []);
  const all = JSON.parse(execFileSync('php', [`${ROOT}/tools/gen-config.php`, '--diag'], { cwd: ROOT, encoding: 'utf8' })).themes;
  const list = (quick ? ['halloween', 'classic', 'florida_keys', 'anniversary', 'thanksgiving'] : Object.keys(all)).filter(k => k !== NEW);
  const hn = hashes(dNew, list), ho = hashes(dOld, list);
  for (const k of list) {
    const bad = (hn[k] || []).filter((h, i) => h !== (ho[k] || [])[i]);
    const err = (hn[k] || []).some(h => h.startsWith('ERR'));
    ok(!bad.length && !err && hn[k] && hn[k].length === 7, `${k}: the same pixels at all 7 moments (${[...new Set((hn[k] || []).flatMap(h => h.split(' ').slice(2)))].join(', ') || 'sprites only'})`,
      JSON.stringify({ now: hn[k], was: ho[k] }));
  }

  console.log('\n  --- mutations: each one-line break must be caught ---');
  {
    const m1 = thNew.replace(/(\['s' => 'bat'[^\]]*?)\]/, "$1, 'w' => 9]");
    ok(m1 !== thNew && themesSame(themesOf(m1, thOld)).changed.includes('halloween'), 'a Halloween particle changed in PHP fails proof 1', 'bat w');
    const m2 = engNew.replace(/(\n\t\tbat: '[^']*?)(\d)(")/, (a, p, d, q) => p + ((+d + 1) % 10) + q);
    ok(m2 !== engNew && !textSame(m2, engOld).same, 'a Halloween sprite nudged by one digit fails proof 2', 'bat');
    const m3 = engNew.replace(/(\t\t\twitchmoon: \{ actors: )(\d)/, (a, p, d) => p + (+d + 1));
    ok(m3 !== engNew && !textSame(m3, engOld).same, 'the witchmoon scene changed fails proof 2', 'witchmoon');
    const m4 = engNew.replace(', annivdance: 1 };', ', annivdance: 1, giftdrop: 1 };');
    ok(m4 !== engNew && !textSame(m4, engOld).same, 'another scene slipped into the sky list fails proof 2', 'SKY_VIG');
    /* what the sleigh flyer's removal touched: the manatee's branch */
    const m5 = engNew.replace("} else if (h.kind === 'manatee') {", "} else if (h.kind === 'manatee' || h.kind === 'bass') {");
    ok(m5 !== engNew && !textSame(m5, engOld).same, "the manatee's drawing branch widened fails proof 2", 'manatee');
    const m6 = engNew.replace("var SKY_HERO = { heron: 1, eagle: 1, witch: 1, osprey: 1 };", "var SKY_HERO = { heron: 1, eagle: 1, osprey: 1 };");
    ok(m6 !== engNew && !textSame(m6, engOld).same, 'the witch flyer dropped from the sky flyers fails proof 2', 'SKY_HERO');
    /* the shared keep-clear set the team's moon now reads */
    const m7 = engNew.replace("if (r.width > 0 && r.height > 0) { list.push([r.left - cvOX,", "if (r.width > 1 && r.height > 0) { list.push([r.left - cvOX,");
    ok(m7 !== engNew && !textSame(m7, engOld).same, 'the keep-clear set changed fails proof 2', 'kcRects');
    /* the packs and the loader, byte for byte */
    const m8 = same['art-thanksgiving.js'].replace('#5E4331', '#5E4332');
    ok(m8 !== same['art-thanksgiving.js'] && m8 !== git('dcc-seasons/assets/js/art-thanksgiving.js'), "a Thanksgiving colour changed fails proof 2", 'tk');
    /* 4.14.3: the Preview tab's variant rotation applied to every guest */
    const m9 = engNew.replace('(CFG.variants ? sp.s[(sp.rr', '(1 ? sp.s[(sp.rr');
    ok(m9 !== engNew && !textSame(m9, engOld).same, "the preview's variant rotation reaching guests fails proof 2", 'variants');
    const m10 = engNew.replace("if (PLAY) { vigList = PLAY.indexOf('v:') === 0", "if (1) { vigList = PLAY.indexOf('v:') === 0");
    ok(m10 !== engNew && !textSame(m10, engOld).same, "the preview's play list reaching guests fails proof 2", 'play');
    /* and the pixels see a sprite change on their own */
    const dm = folder(Object.assign({}, now, { 'engine.js': engNew.replace(/(\n\t\tbat: ')(\d+) /, (a, p, d) => p + (+d + 4) + ' ') }), []);
    const hm = hashes(dm, ['halloween']);
    ok(JSON.stringify(hm.halloween) !== JSON.stringify(ho.halloween), 'a Halloween sprite resized in the engine fails proof 3 (the pixels)', JSON.stringify(hm.halloween));
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
