'use strict';
/**
 * DCC Seasons — the color round's Untouched proof: a 4.14.6 candidate
 * (the Anniversary pack built with a color pick, tools/anniv-build.js
 * --date= --pct=) against 4.14.5 (BASE). Only the date band (andate) and
 * the two figures (anpct1, anpct2) may differ, and only in color:
 *
 *  1. every other file of the js folder is byte-identical to 4.14.5's;
 *  2. in the Anniversary pack every other sprite (the hearts, rings,
 *     crystal, toast, year crystal) and the computed figures are
 *     identical, evaluated on 11 Nov 2026-2030;
 *  3. the three changed sprites keep 4.14.5's viewBox, text, font,
 *     positions and sizes: with every colour token (and the colour
 *     options' extra tones) read out, the geometry is the same;
 *  4. every other theme draws the same pixels (tools/untouched-hash.js).
 * Mutation-checked at the end.
 *
 *   node tools/test-color-candidate.js --date=coralNavy --pct=coralLit
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASE = '685f44c';   /* 4.14.5 */
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const DATE = arg('date', 'coralNavy'), PCT = arg('pct', 'coralLit');
const CHANGED = ['andate', 'anpct1', 'anpct2'];
let pass = 0, fail = 0; const problems = [];
const ok = (c, l, d) => { if (c) { pass++; console.log('    PASS  ' + l); } else { fail++; problems.push(l + ' — ' + d); console.log('    FAIL  ' + l + ' — ' + d); } };
const git = f => execFileSync('git', ['show', `${BASE}:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
const JS = path.join(ROOT, 'dcc-seasons', 'assets', 'js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-cc-'));
const candDir = path.join(tmp, 'cand'), baseDir = path.join(tmp, 'base'); fs.mkdirSync(candDir); fs.mkdirSync(baseDir);
const files = fs.readdirSync(JS).filter(f => /\.js$/.test(f) && !/\.min\.js$/.test(f));
for (const f of files) { fs.writeFileSync(path.join(baseDir, f), git(`dcc-seasons/assets/js/${f}`)); fs.writeFileSync(path.join(candDir, f), fs.readFileSync(path.join(JS, f))); }
execFileSync('node', [path.join(__dirname, 'anniv-build.js'), `--date=${DATE}`, `--pct=${PCT}`, `--out=${path.join(candDir, 'art-anniversary.js')}`], { cwd: ROOT });

const pack = (src, y) => { const W = { DCC_SEASONS: { date: `${y}-11-11` } }; new Function('window', src)(W); const A = W.DCCSeasonsArt.anniversary, o = {};
  for (const k in A.svgs) { o[k] = typeof A.svgs[k] === 'function' ? A.svgs[k]() : A.svgs[k]; } return { s: o, f: A.annivFigs() }; };
/* geometry: the markup with every colour, opacity and gradient stop removed */
const geom = s => s.replace(/<linearGradient[\s\S]*?<\/linearGradient>/g, '').replace(/ (fill|stroke|stop-color|opacity)="[^"]*"/g, '')
  .replace(/<path d="M5\.4 4\.1 H36\.6"[^>]*\/>/g, '').replace(/<rect x="3" y="4" width="36" height="10" rx="5"[^>]*\/>/g, '')   /* the band's highlight line (both looks) */
  .replace(/<text x="16\.55" y="14\.85"[^>]*>[^<]*<\/text>/g, '');   /* the lit-edge option's extra tone */

function check(candSrc, baseSrc, label) {
  const bad = [], geo = [];
  for (const y of [2026, 2027, 2028, 2029, 2030]) {
    const c = pack(candSrc, y), b = pack(baseSrc, y);
    if (c.f.join() !== b.f.join()) { bad.push('figures ' + y); }
    for (const k of new Set([...Object.keys(c.s), ...Object.keys(b.s)])) {
      if (CHANGED.includes(k)) { if (geom(c.s[k] || '') !== geom(b.s[k] || '')) { geo.push(k + ' ' + y); } } else if (c.s[k] !== b.s[k]) { bad.push(k + ' ' + y); }
    }
  }
  return { bad, geo };
}

(async () => {
  console.log(`\n  --- the candidate (date ${DATE}, figures ${PCT}) against 4.14.5 (${BASE}) ---`);
  const others = files.filter(f => f !== 'art-anniversary.js');
  for (const f of others) { ok(fs.readFileSync(path.join(candDir, f), 'utf8') === git(`dcc-seasons/assets/js/${f}`), `${f} byte-identical`, f); }
  const candSrc = fs.readFileSync(path.join(candDir, 'art-anniversary.js'), 'utf8'), baseSrc = git('dcc-seasons/assets/js/art-anniversary.js');
  const r = check(candSrc, baseSrc);
  ok(!r.bad.length, 'the Anniversary pack: every other sprite and the computed figures identical, 11 Nov 2026-2030', r.bad.join(', '));
  ok(!r.geo.length, 'the date band and the figures: the same shapes, text, sizes and positions; only colour differs', r.geo.join(', '));
  const c0 = pack(candSrc, 2026), b0 = pack(baseSrc, 2026);
  ok(CHANGED.every(k => c0.s[k] !== b0.s[k]), 'and their colours did change (the proof sees the change)', CHANGED.join(','));

  const all = JSON.parse(execFileSync('php', [`${ROOT}/tools/gen-config.php`, '--diag'], { cwd: ROOT, encoding: 'utf8' })).themes;
  const list = Object.keys(all).filter(k => k !== 'anniversary');
  const hashes = d => JSON.parse(execFileSync('node', [path.join(__dirname, 'untouched-hash.js'), '--themes=' + list.join(',')], { cwd: ROOT, env: Object.assign({}, process.env, { DCC_ASSETS: d }), encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }));
  const hn = hashes(candDir), ho = hashes(baseDir);
  const diff = list.filter(k => JSON.stringify(hn[k]) !== JSON.stringify(ho[k]) || !hn[k] || hn[k].length !== 7);
  ok(!diff.length, `every other theme (${list.length}) draws the same pixels at all 7 moments`, diff.join(','));

  console.log('\n  --- mutations ---');
  const m1 = candSrc.replace(/(ancrystal: '[^']*?)#E3EDF2/, '$1#E3EDF3');
  ok(m1 !== candSrc && check(m1, baseSrc).bad.length, 'the crystal recoloured is caught', 'crystal');
  const m2 = candSrc.replace(/(anrings: '[^']*?)#([0-9A-F]{6})/, '$1#010203');
  ok(m2 !== candSrc && check(m2, baseSrc).bad.length, 'a ring colour changed is caught', 'rings');
  const m3 = candSrc.replace('rx="6.6"', 'rx="5.6"');
  ok(m3 !== candSrc && check(m3, baseSrc).geo.length, "the date band's shape changed is caught", 'band rx');
  const m4 = candSrc.split('font-size="16"').join('font-size="17"');
  ok(m4 !== candSrc && check(m4, baseSrc).geo.length, "the figures' size changed is caught", 'font-size');
  const m5 = candSrc.replace('Math.round(100 * wed / ((on - Date.UTC(1986, 2, 25)) / YR))', 'Math.round(100 * wed / ((on - Date.UTC(1989, 2, 26)) / YR))');
  ok(m5 !== candSrc && check(m5, baseSrc).bad.length, 'a figure computed wrong is caught', 'figs');
  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
