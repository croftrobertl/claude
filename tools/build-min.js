#!/usr/bin/env node
/**
 * Generate assets/js/dccs.min.js from assets/js/dccs.js.
 *
 * THE PIPELINE IS: four sources -> tools/build-bundle.php -> dccs.js -> HERE ->
 * dccs.min.js, and dccs.min.js is what the front end loads. Each arrow has its
 * own check, because a stale artefact at either step means the repo and the site
 * disagree while every other test passes:
 *   - build-bundle.php --check  : sources -> dccs.js
 *   - build-min.js --check      : dccs.js -> dccs.min.js
 *
 * COMMENTS AND WHITESPACE ONLY — no compress, no mangle. Owner's decision: the
 * extra 3.3 KB mangling buys is not worth the equivalence burden on a widget that
 * gets debugged in devtools on the live site. Identifiers and structure survive,
 * so a stack trace from a guest's browser still names real functions.
 *
 * Usage: node tools/build-min.js [--check]
 */
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const JS_DIR = path.join(__dirname, '..', 'dcc-cottage-selector', 'assets', 'js');
const SRC = path.join(JS_DIR, 'dccs.js');
const OUT = path.join(JS_DIR, 'dccs.min.js');

/** Terser options. Kept here, in one place, so the shipped file is reproducible. */
const OPTIONS = {
  compress: false,      // no expression rewriting
  mangle: false,        // identifiers survive, so devtools stays readable
  format: { comments: false },
};

(async () => {
  const src = fs.readFileSync(SRC, 'utf8');

  // Carry the "generated" warning across: someone who opens the shipped file
  // should be told not to edit it, exactly as the bundle says.
  const version = (src.match(/DCC Cottage Selector ([\d.]+)/) || [, '?'])[1];
  const banner = `/*! DCC Cottage Selector ${version} — generated from dccs.js by tools/build-min.js. DO NOT EDIT. */\n`;

  const result = await minify(src, OPTIONS);
  if (result.error) {
    console.error('terser failed:', result.error);
    process.exit(1);
  }
  const out = banner + result.code;

  const check = process.argv.includes('--check');
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

  if (check) {
    if (current === out) {
      console.log('ok — dccs.min.js is current');
      process.exit(0);
    }
    console.error('dccs.min.js is STALE. Run: node tools/build-min.js');
    process.exit(1);
  }

  fs.writeFileSync(OUT, out);
  const gz = (s) => require('zlib').gzipSync(Buffer.from(s), { level: 9 }).length;
  console.log(
    `wrote dccs.min.js — ${src.length} -> ${out.length} bytes raw ` +
    `(${Math.round(100 * (1 - out.length / src.length))}% smaller), ` +
    `${gz(src)} -> ${gz(out)} gzipped`
  );
})();
