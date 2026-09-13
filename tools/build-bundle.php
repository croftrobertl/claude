<?php
/**
 * Concatenate the front-end scripts into one file.
 *
 * The widget loaded five separate scripts on every page carrying it. The homepage
 * already serves 41 scripts, so four of those requests were pure overhead: the
 * files are small and the combined payload is dominated by one of them.
 *
 * THE SOURCES REMAIN THE SOURCE OF TRUTH. assets/js/dccs.js is generated and must
 * never be hand-edited — a hand edit is silently lost the next time this runs, and
 * an out-of-date bundle is worse than no bundle because the repo and the site
 * disagree while every test passes. `dccs_bundle_check()` is wired into `npm test`
 * and fails if the committed bundle is not byte-identical to a fresh build.
 *
 * Order is the dependency order: selector.js reads DCCS.score / DCCS.labels /
 * DCCS.availability when it boots, and each source is an IIFE that
 * assigns onto window.DCCS, so concatenation in this order is equivalent to the
 * five <script> tags it replaces.
 *
 * Run: php tools/build-bundle.php          (writes the bundle)
 *      php tools/build-bundle.php --check  (fails if it is stale; no write)
 */

const DCCS_BUNDLE_SOURCES = ['score.js', 'labels.js', 'availability.js', 'selector.js'];

function dccs_bundle_dir(): string
{
    return dirname(__DIR__) . '/dcc-cottage-selector/assets/js/';
}

function dccs_bundle_path(): string
{
    return dccs_bundle_dir() . 'dccs.js';
}

/** The exact bytes the bundle should contain, built from the sources. */
function dccs_bundle_build(): string
{
    $dir = dccs_bundle_dir();
    $version = 'unknown';
    $header = (string) file_get_contents(dirname(__DIR__) . '/dcc-cottage-selector/dcc-cottage-selector.php');
    if (preg_match('/^\s*\*\s*Version:\s*(\S+)/m', $header, $m)) {
        $version = $m[1];
    }

    $out = "/*\n"
        . " * DCC Cottage Selector " . $version . " — generated bundle. DO NOT EDIT.\n"
        . " *\n"
        . " * Built by tools/build-bundle.php from, in order:\n";
    foreach (DCCS_BUNDLE_SOURCES as $f) {
        $out .= " *   assets/js/" . $f . "\n";
    }
    $out .= " *\n"
        . " * Edit those files, then run `php tools/build-bundle.php`. `npm test`\n"
        . " * fails if this file and the sources have drifted apart.\n"
        . " */\n";

    foreach (DCCS_BUNDLE_SOURCES as $f) {
        $path = $dir . $f;
        if (!is_readable($path)) {
            fwrite(STDERR, "missing source: $path\n");
            exit(1);
        }
        $out .= "\n/* ---- assets/js/" . $f . " ---- */\n";
        // A trailing semicolon between IIFEs: each source already ends in `})();`,
        // but a source that ever ends in an expression without one would otherwise
        // fuse with the next file's opening paren.
        $out .= rtrim((string) file_get_contents($path)) . "\n;\n";
    }
    return $out;
}

/** @return array{0:bool,1:string} [in sync, message] */
function dccs_bundle_check(): array
{
    $path = dccs_bundle_path();
    if (!is_readable($path)) {
        return [false, 'assets/js/dccs.js is missing — run php tools/build-bundle.php'];
    }
    $have = (string) file_get_contents($path);
    $want = dccs_bundle_build();
    if ($have === $want) {
        return [true, 'bundle is in sync with its ' . count(DCCS_BUNDLE_SOURCES) . ' sources'];
    }
    return [false, 'assets/js/dccs.js is STALE (' . strlen($have) . ' bytes on disk, '
        . strlen($want) . ' expected) — run php tools/build-bundle.php'];
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === realpath(__FILE__)) {
    $check = in_array('--check', $argv, true);
    if ($check) {
        [$ok, $msg] = dccs_bundle_check();
        echo ($ok ? '  ok  - ' : '  NOT OK - ') . $msg . "\n";
        exit($ok ? 0 : 1);
    }
    $bundle = dccs_bundle_build();
    file_put_contents(dccs_bundle_path(), $bundle);
    $raw = strlen($bundle);
    $gz = strlen((string) gzencode($bundle, 9));
    echo "wrote assets/js/dccs.js — $raw bytes, $gz gzipped, "
        . count(DCCS_BUNDLE_SOURCES) . " sources -> 1 request\n";
}
