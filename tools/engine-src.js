'use strict';
/**
 * DCC Seasons — engine.js as ONE text again, for the tools that read the
 * source (validate-paths.js, sprite-sheet.js, …), since 4.13.4 moved a
 * season's art into its own file (assets/js/art-<theme>.js). Each art file's
 * sprites (its `var S = { … };` block) are spliced into the SVGS registry
 * where the engine merges them at run time, and the rest of the file
 * (its painters) is appended, so a quoted mention there still counts.
 *
 *   const { engineSource } = require('./engine-src');
 *   const src = engineSource('dcc-seasons/assets/js/engine.js');
 */
const fs = require('fs');
const path = require('path');

function packs(dir) {
  return fs.readdirSync(dir).filter(f => /^art-[a-z_]+\.js$/.test(f)).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
}
function engineSource(file) {
  let src = fs.readFileSync(file, 'utf8');
  const P = packs(path.dirname(file));
  if (!P.length) { return src; }
  const svgs = P.map(t => { const m = t.match(/\n\tvar S = \{\n([\s\S]*?)\n\t\};/); return m ? m[1].replace(/\bS\./g, 'SVGS.') : ''; }).filter(Boolean).join('\n');
  src = src.replace(/(var SVGS = \{[\s\S]*?)(\n\t\};)/, (a, b, c) => b + '\n' + svgs + c);
  return src + '\n' + P.map(t => t.replace(/\n\tvar S = \{\n[\s\S]*?\n\t\};/, '')).join('\n');
}
module.exports = { engineSource, packs };
