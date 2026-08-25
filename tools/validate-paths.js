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
  console.log(`\n${checked} path elements checked · ${badSprites} sprite(s) malformed`);
  if (badSprites) { console.log('BUILD FAILURE: malformed path data would render with parts missing.'); process.exit(1); }
  console.log('all paths valid');
}
if (require.main === module) main();
module.exports = { validatePath, tokenise };
