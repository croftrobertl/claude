#!/usr/bin/env node
/**
 * BUILD STEP: minify the plugin's two scripts (0.45.4, the Website Director's
 * speed audit).
 *
 *     node tools/build-js.js            # write widget.min.js and staff.min.js
 *     node tools/build-js.js --check    # verify the committed ones are current
 *     node tools/build-js.js --stdin    # minify stdin to stdout (the harnesses)
 *
 * WHY. widget.js is served on every page that shows the calendar — the home
 * page, /cottages/ and all eight cottage pages — and was 152 KB raw / 58 KB
 * gzipped, most of it comments: this project's reasons live next to its code
 * (see build-css.php for the same argument about the stylesheet). The source
 * keeps every word; the browser is sent the code. staff.js (~92 KB) loads on
 * /staff/ only, but is built the same way.
 *
 * WHAT, AND WHAT NOT. terser, pinned to an exact version in tools/package.json
 * so a rebuild can only change when a source does. Local names are shortened
 * and dead code dropped; PROPERTY names are never touched (the scripts read
 * Elementor's, MotoPress's and their own config objects by name). Output is
 * kept to ES5 as written, with terser's Safari 10 workaround on, and every
 * non-ASCII character escaped — the strings carry "…", "→", "±" and "✕", and
 * an escape survives any charset a server or a cache might misreport.
 *
 * THE TESTS RUN THIS OUTPUT. The browser harnesses load the minified build of
 * the CURRENT source (via --stdin), not the readable file: a minifier fault
 * fails the suites, and a mutation made to the source still reaches the code
 * under test. tests/run.sh then runs --check, so the committed .min.js — the
 * file that ships — is byte-for-byte the build the suites just exercised.
 * WordPress serves the readable sources when SCRIPT_DEBUG is on.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..', 'mphb-availability-calendar');
const VERSION = require('terser/package.json').version;
const TARGETS = [
    ['assets/js/widget.js', 'assets/js/widget.min.js'],
    ['assets/js/staff.js', 'assets/js/staff.min.js'],
];

async function build(source, from) {
    const out = await minify(source, {
        ecma: 5,
        compress: { passes: 1 },
        mangle: { safari10: true },           // locals only — never properties
        safari10: true,
        format: {
            ascii_only: true,
            comments: false,
            preamble: '/*! ' + (from || 'mphb-availability-calendar') + ' - built by tools/build-js.js (terser '
                + VERSION + '). Edit the source, not this file. */',
        },
    });
    if (!out || typeof out.code !== 'string' || !out.code) {
        throw new Error('terser produced no output for ' + (from || 'stdin'));
    }
    return out.code + '\n';
}

async function main() {
    const args = process.argv.slice(2);
    if (args[0] === '--stdin') {
        const chunks = [];
        for await (const c of process.stdin) chunks.push(c);
        process.stdout.write(await build(Buffer.concat(chunks).toString('utf8'), args[1]));
        return;
    }
    const check = args[0] === '--check';
    let stale = 0;
    for (const [src, dst] of TARGETS) {
        const code = await build(fs.readFileSync(path.join(ROOT, src), 'utf8'), path.basename(src));
        const target = path.join(ROOT, dst);
        if (check) {
            const have = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
            if (have !== code) {
                stale++;
                console.log('STALE  ' + dst + (have === null ? ' (missing)' : '') + ' — run: node tools/build-js.js');
            } else {
                console.log('ok     ' + dst);
            }
        } else {
            fs.writeFileSync(target, code);
            const raw = fs.statSync(path.join(ROOT, src)).size;
            console.log(dst + '  ' + raw + ' -> ' + Buffer.byteLength(code) + ' bytes');
        }
    }
    if (check && stale) process.exit(1);
}

main().catch(e => { console.error(e && e.message ? e.message : e); process.exit(2); });
