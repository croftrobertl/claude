'use strict';
/**
 * Pull named functions out of widget.js and evaluate them in isolation.
 *
 * WHY EXTRACT RATHER THAN IMPORT: widget.js is a single IIFE with no exports,
 * built to run in a page. Extraction lets the pure logic — date maths, range
 * state, freshness — be tested without a browser at all.
 *
 * THE TRAP THIS CARRIES A GUARD FOR: an extracted function that closes over
 * something from its original scope throws at call time, and the failure
 * looks like a logic bug rather than a harness one. `extract()` therefore
 * reports exactly which free identifiers a function needs, and `build()`
 * refuses to evaluate until every one has been supplied.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../mphb-availability-calendar/assets/js/widget.js');
const src = () => fs.readFileSync(SRC, 'utf8');

/** The source text of `function NAME(...) { ... }`, brace-balanced. */
function extract(name, text = src()) {
  const re = new RegExp('(^|\\n)\\s*function ' + name + '\\s*\\(');
  const m = text.match(re);
  if (!m) throw new Error('function not found in widget.js: ' + name);
  const start = text.indexOf('function ' + name, m.index);
  let i = text.indexOf('{', start), depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('unbalanced function body: ' + name);
}

/**
 * Evaluate a set of extracted functions together, with explicit dependencies.
 * Anything they reference that is neither defined here nor supplied is a
 * MISSING DEPENDENCY and throws now, by name, rather than at call time.
 */
function build(names, deps = {}) {
  const bodies = names.map(n => extract(n));
  const defined = new Set(names.concat(Object.keys(deps)));
  // Keywords first: `if (`, `return (`, `switch (` and friends all look like
  // calls to a regex, and reporting them as missing dependencies buries the
  // real ones in noise.
  const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
    'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'try', 'finally', 'throw',
    'function', 'var', 'let', 'const', 'instanceof', 'await', 'yield']);
  const globals = new Set(['Date', 'Math', 'String', 'Number', 'Array', 'Object', 'JSON',
    'parseInt', 'parseFloat', 'isNaN', 'RegExp', 'Intl', 'console', 'undefined', 'null',
    'true', 'false', 'window', 'document', 'NaN', 'Infinity', 'Boolean', 'Set', 'Map',
    'Promise', 'setTimeout', 'clearTimeout', 'encodeURIComponent', 'decodeURIComponent']);
  const missing = new Set();
  // Scan the CODE, not the comments. Prose reads as calls to a regex — a
  // comment containing "own row (see …)" reported `row` as a missing
  // dependency. Same failure as a CSS assertion matching a comment that
  // quotes the declaration it describes.
  const strip = t => t
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  for (const raw of bodies) {
    const body = strip(raw);
    const locals = new Set();
    for (const m of body.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g)) locals.add(m[1]);
    for (const m of body.matchAll(/function\s*([\w$]*)\s*\(([^)]*)\)/g)) {
      // The NAME of a nested declaration is local too — dayHasAvail and
      // dayIsPast live inside buildAvailabilityHint, so treating them as
      // unsupplied dependencies would demand they be passed in from outside.
      if (m[1]) locals.add(m[1]);
      m[2].split(',').map(s => s.trim()).filter(Boolean).forEach(a => locals.add(a));
    }
    for (const m of body.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const id = m[2];
      if (keywords.has(id) || globals.has(id) || defined.has(id) || locals.has(id)) continue;
      missing.add(id);
    }
  }
  if (missing.size) {
    throw new Error('extract: unsupplied dependencies for [' + names.join(', ') + ']: '
      + [...missing].join(', ') + ' — supply them in deps, or extract them too');
  }
  const keys = Object.keys(deps);
  const factory = new Function(...keys,
    bodies.join('\n') + '\nreturn {' + names.map(n => n + ': ' + n).join(', ') + '};');
  return factory(...keys.map(k => deps[k]));
}

function reporter() {
  const state = { fail: 0 };
  const check = (label, cond, extra) => {
    console.log((cond ? 'PASS  ' : 'FAIL  ') + label
      + (extra !== undefined ? '   [' + JSON.stringify(extra) + ']' : ''));
    if (!cond) state.fail++;
  };
  const done = () => {
    console.log(state.fail ? '\n' + state.fail + ' FAILED' : '\nALL OK');
    process.exit(state.fail ? 1 : 0);
  };
  return { check, done };
}

module.exports = { src, extract, build, reporter, SRC };
