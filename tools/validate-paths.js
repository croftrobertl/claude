#!/usr/bin/env node
/* DCC Seasons — SVG path validator.
 *
 * WHY THIS EXISTS: a precision-trim regex shipped in 3.2.0 matched any
 * \d+\.\d and so fused compact SVG number pairs — "M3.6 12 2.2 14" became
 * "M3.6 12.2 14". The corrupted output ("12.2") is an ordinary-looking
 * number, so NO text search can find it. It is only detectable by parsing:
 * tokenise every `d` attribute and check each command's argument count.
 *
 * The browser silently drops a malformed path, so the sprite renders with a
 * part missing and only whispers "<path> attribute d: Expected number" to
 * the console. This turns that whisper into a build failure.
 *
 * Usage: node tools/validate-paths.js [path/to/engine.js]
 * Exit 0 = every path valid; exit 1 = at least one malformed.
 */
'use strict';
const fs = require('fs');

const ARGC = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUM = /^[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/;

/** Tokenise a path `d` the way a browser does, compact notation included. */
function tokenise(d) {
  const out = [];
  let i = 0;
  while (i < d.length) {
    const ch = d[i];
    if (ch === ' ' || ch === ',' || ch === '\t' || ch === '\n') { i++; continue; }
    if (/[A-Za-z]/.test(ch)) { out.push({ cmd: ch }); i++; continue; }
    const m = NUM.exec(d.slice(i));
    if (!m) { out.push({ bad: ch, at: i }); i++; continue; }
    out.push({ num: parseFloat(m[0]) });
    i += m[0].length;
  }
  return out;
}

/** @returns {string[]} human-readable problems (empty = valid) */
function validatePath(d) {
  const toks = tokenise(d);
  const problems = [];
  let cur = null, args = 0;
  const flush = () => {
    if (!cur) return;
    const need = ARGC[cur.toUpperCase()];
    if (need === undefined) { problems.push(`unknown command "${cur}"`); return; }
    if (need === 0) {
      if (args !== 0) problems.push(`"${cur}" takes 0 numbers, got ${args}`);
    } else if (args === 0 || args % need !== 0) {
      problems.push(`"${cur}" needs a multiple of ${need} numbers, got ${args}`);
    }
  };
  for (const t of toks) {
    if (t.bad !== undefined) { problems.push(`stray character "${t.bad}" at ${t.at}`); continue; }
    if (t.cmd) { flush(); cur = t.cmd; args = 0; continue; }
    if (!cur) { problems.push('numbers before any command'); continue; }
    args++;
  }
  flush();
  return problems;
}

/* Every way a sprite key can be named, because all of them have fooled us:
 * a plain 's' => 'key', an 's' => ['a','b'] array, an 's' => $variable
 * defined elsewhere in the theme file, and keys COMPUTED by concatenation
 * ('heron' + frame). A theme that names a retired sprite draws nothing at
 * all and reports nothing, so this has to be mechanical. Heroes are not
 * sprites — they are drawn by their own `kind` branches — so they are
 * checked against the kinds the engine actually implements. */
function collectRefs(js, php) {
  const refs = new Map();          // key -> where it was named
  const add = (k, where) => { if (k && !refs.has(k)) refs.set(k, where); };
  const strings = t => [...t.matchAll(/'([A-Za-z0-9_]+)'/g)].map(m => m[1]);
  for (const m of js.matchAll(/\bdspr\('([A-Za-z0-9_]+)'/g)) add(m[1], 'engine dspr()');
  for (const m of js.matchAll(/\bsprite\('([A-Za-z0-9_]+)'/g)) add(m[1], 'engine sprite()');
  for (const m of js.matchAll(/\bkey = '([A-Za-z0-9_]+)'/g)) add(m[1], 'engine key');
  for (const m of js.matchAll(/\? '([A-Za-z0-9_]+)' : '([A-Za-z0-9_]+)';/g)) {
    // key = cond ? 'a' : 'b' — only where the assignment target is `key`
    if (/key = [^;]*$/.test(js.slice(0, m.index).split('\n').pop())) {
      add(m[1], 'engine key'); add(m[2], 'engine key');
    }
  }
  const vars = new Map();
  for (const m of php.matchAll(/\$([a-z_]+)\s*=\s*\[([^\]]*)\];/g)) vars.set(m[1], strings(m[2]));
  for (const m of php.matchAll(/'s'\s*=>\s*'([A-Za-z0-9_]+)'/g)) add(m[1], 'theme particle');
  for (const m of php.matchAll(/'s'\s*=>\s*\[([^\]]*)\]/g)) strings(m[1]).forEach(k => add(k, 'theme particle (array)'));
  for (const m of php.matchAll(/'s'\s*=>\s*\$([a-z_]+)/g)) (vars.get(m[1]) || []).forEach(k => add(k, `theme particle ($${m[1]})`));
  return refs;
}
/* Concatenated keys ('heron' + frame): the prefix must have sprites behind
 * it, and every sprite behind it counts as referenced. */
function collectPrefixes(js, keys) {
  const out = new Map();
  for (const m of js.matchAll(/'([A-Za-z0-9_]+)' \+ /g)) {
    const hits = [...keys].filter(k => k.startsWith(m[1]));
    if (hits.length) out.set(m[1], hits);
  }
  return out;
}
/* A theme's 'hero' => names a hero KIND, drawn by its own branch. */
function collectHeroes(js, php) {
  const kinds = new Set([...js.matchAll(/kind === '([a-z0-9_]+)'/g)].map(m => m[1]));
  const named = [...php.matchAll(/'hero'\s*=>\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
  return { kinds, missing: named.filter(h => !kinds.has(h)) };
}

function main() {
  const file = process.argv[2] || 'dcc-seasons/assets/js/engine.js';
  const src = fs.readFileSync(file, 'utf8');
  let checked = 0, badSprites = 0;
  const failures = [];
  // every sprite entry in the SVGS registry, plus any inline SVG elsewhere
  const block = (src.match(/var SVGS = \{[\s\S]*?\n\t\};/) || [src])[0];
  for (const m of block.matchAll(/([a-zA-Z0-9]+): '([^']*)'/g)) {
    const key = m[1];
    const bodyProblems = [];
    for (const p of m[2].matchAll(/\sd="([^"]*)"/g)) {
      checked++;
      const probs = validatePath(p[1]);
      if (probs.length) bodyProblems.push({ d: p[1], probs });
    }
    if (bodyProblems.length) {
      badSprites++;
      failures.push({ key, bodyProblems });
    }
  }
  for (const f of failures) {
    console.log(`\nFAIL  ${f.key}`);
    for (const b of f.bodyProblems) {
      console.log(`      d="${b.d.length > 96 ? b.d.slice(0, 96) + '…' : b.d}"`);
      b.probs.forEach(p => console.log(`      -> ${p}`));
    }
  }
  // ---- dangling and dead sprite keys ----
  const keys = new Set([...block.matchAll(/\n\t\t([A-Za-z0-9_]+): (?:'|function)/g)].map(m => m[1]));
  const themeFile = file.replace(/assets\/js\/engine\.js$/, 'includes/class-themes.php');
  const php = fs.existsSync(themeFile) ? fs.readFileSync(themeFile, 'utf8') : '';
  const refs = collectRefs(src, php);
  const prefixes = collectPrefixes(src, keys);
  const heroes = collectHeroes(src, php);
  /* For the DEAD direction only, any quoted occurrence of a key counts —
   * sprites reach the screen through scene factories, frame arrays and the
   * accent map as well as the four positional forms above, and a false
   * "referenced" here only means a dead sprite survives one more release.
   * The DANGLING direction stays strict: it decides the build. */
  const used = new Set([...refs.keys()].filter(k => keys.has(k)));
  for (const hits of prefixes.values()) hits.forEach(k => used.add(k));
  for (const text of [src, php]) {
    for (const m of text.matchAll(/'([A-Za-z0-9_]+)'/g)) { if (keys.has(m[1])) used.add(m[1]); }
  }
  const dangling = [...refs].filter(([k]) => !keys.has(k) && !prefixes.has(k));
  const dead = [...keys].filter(k => !used.has(k));
  for (const [k, where] of dangling) console.log(`DANGLING  '${k}' named by ${where} — no such sprite`);
  for (const h of heroes.missing) console.log(`DANGLING  hero '${h}' — the engine implements no such kind`);
  if (dead.length) console.log(`unreferenced sprite(s): ${dead.join(' ')}`);

  console.log(`\n${checked} path elements checked · ${badSprites} sprite(s) malformed · ${keys.size} sprites · ${refs.size} references · ${dangling.length + heroes.missing.length} dangling`);
  if (badSprites) { console.log('BUILD FAILURE: malformed path data would render with parts missing.'); process.exit(1); }
  if (dangling.length || heroes.missing.length) { console.log('BUILD FAILURE: a theme or scene names a sprite that does not exist; it would draw nothing.'); process.exit(1); }
  console.log('all paths valid');
}
if (require.main === module) main();
module.exports = { validatePath, tokenise };
