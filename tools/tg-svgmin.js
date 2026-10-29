'use strict';
/**
 * DCC Seasons — 4.13.3: LOSSLESS minification of the Thanksgiving sprite
 * markup, to make room under the 82,225-byte ceiling without changing a
 * pixel. Three rewrites only, each exact by construction:
 *  1. path data re-serialised from its tokens with the fewest separators
 *     the SVG grammar allows (no space before a command letter, before '-',
 *     or before '.' when the previous number already holds a '.'); every
 *     number keeps its own text, so every value is the value it was;
 *  2. attributes equal to their SVG default dropped: <stop offset="0">, and
 *     on a gradient with NO gradientUnits / gradientTransform, linear
 *     x1="0" y1="0" x2="1" y2="0" and radial cx/cy/r=".5";
 *  3. a numeric attribute "0.N" written ".N".
 * Never a numeric-precision regex (CLAUDE.md): numbers are tokenised and
 * copied verbatim. Each rewritten d is parsed back and compared value for
 * value; tools/test-untouched.js and tg-svgmin's --check rasterise every
 * sprite before and after.
 *
 *   node tools/tg-svgmin.js [--write] key key ...
 */
const fs = require('fs');
const path = require('path');
const ENG = path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js');

const TOK = /([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([\s,]+)/g;
function tokens(d) {
  const out = []; let m, at = 0;
  TOK.lastIndex = 0;
  while ((m = TOK.exec(d))) {
    if (m.index !== at) { throw new Error('unparsed text at ' + at + ' in ' + d.slice(at, at + 20)); }
    at = TOK.lastIndex;
    if (m[1]) { out.push({ c: m[1] }); } else if (m[2]) { out.push({ n: m[2] }); }
  }
  if (at !== d.length) { throw new Error('trailing text in ' + d); }
  return out;
}
function serial(t) {
  let o = '', prev = null;
  for (const x of t) {
    if (x.c) { o += x.c; prev = null; continue; }
    const s = x.n;
    if (prev !== null) {
      const sep = !(s[0] === '-' || s[0] === '+' || (s[0] === '.' && /[.eE]/.test(prev)));
      if (sep) { o += ' '; }
    }
    o += s; prev = s;
  }
  return o;
}
function values(d) { return tokens(d).map(x => x.c || +x.n); }
function minD(d) {
  const r = serial(tokens(d));
  const a = values(d), b = values(r);
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) { throw new Error('a value changed:\n' + d + '\n' + r); }
  return r;
}
function minSvg(body) {
  let s = body.replace(/ d="([^"]*)"/g, (all, d) => ' d="' + minD(d) + '"');
  s = s.replace(/<stop offset="0"/g, '<stop');
  s = s.replace(/<(linear|radial)Gradient\b([^>]*)>/g, (all, kind, attrs) => {
    if (/gradientUnits|gradientTransform|href/.test(attrs)) { return all; }
    const DEF = kind === 'linear' ? { x1: '0', y1: '0', x2: '1', y2: '0' } : { cx: '.5', cy: '.5', r: '.5' };
    let a = attrs;
    for (const [k, v] of Object.entries(DEF)) {
      a = a.replace(new RegExp(' ' + k + '="(0?' + v.replace('.', '\\.') + '|' + v + ')"'), (m0, val) => (+val === +v ? '' : m0));
    }
    return '<' + kind + 'Gradient' + a + '>';
  });
  s = s.replace(/="0(\.\d+)"/g, '="$1"');
  return s;
}
module.exports = { minSvg, minD };

if (require.main === module) {
  const keys = process.argv.slice(2).filter(a => !a.startsWith('--'));
  let src = fs.readFileSync(ENG, 'utf8'), saved = 0;
  for (const k of keys) {
    const re = new RegExp("\\n\\t\\t" + k + ": '([^']*)'"), m = src.match(re);
    if (!m) { console.log('skip (not a string sprite):', k); continue; }
    const c = m[1].indexOf('|'), nb = m[1].slice(0, c + 1) + minSvg(m[1].slice(c + 1));
    saved += m[1].length - nb.length;
    console.log(k, m[1].length, '->', nb.length);
    src = src.replace(re, () => "\n\t\t" + k + ": '" + nb + "'");
  }
  console.log('raw bytes saved', saved);
  if (process.argv.includes('--write')) { fs.writeFileSync(ENG, src); console.log('written'); }
}
