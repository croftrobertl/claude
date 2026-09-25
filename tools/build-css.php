<?php
/**
 * Generate assets/css/selector.min.css from selector.css by removing COMMENTS ONLY.
 *
 * Why a build step and not a hand-maintained minified file: the commented source
 * is the readable artefact and must stay authoritative. This is the same
 * arrangement as tools/build-bundle.php, including the --check mode that npm test
 * runs so a stale generated file cannot ship while every other test passes.
 *
 * WHAT IT DOES: strips /* ... *​/ comments, then collapses the blank lines they
 * leave behind and trims trailing whitespace. NOTHING ELSE. No selector
 * rewriting, no whitespace collapsing inside rules, no colour or unit shortening
 * — every one of those is a chance to change what the browser computes, and the
 * saving here is entirely in the comments (45% of the raw file).
 *
 * IT IS NOT A REGEX. A `/*` inside a string or a url() is not a comment, and
 * 0.31.0 shipped a broken stylesheet precisely because a regex was used to edit
 * CSS. This walks the file tracking string state instead.
 *
 * Usage: php tools/build-css.php [--check]
 */

/** Remove comments, honouring string context. */
function dccs_strip_comments(string $s): string
{
    $out = '';
    $n = strlen($s);
    $quote = '';          // '' | "'" | '"'
    for ($i = 0; $i < $n; $i++) {
        $c = $s[$i];

        if ($quote !== '') {
            $out .= $c;
            if ($c === '\\' && $i + 1 < $n) {   // escaped char inside a string
                $out .= $s[++$i];
            } elseif ($c === $quote) {
                $quote = '';
            }
            continue;
        }

        if ($c === '"' || $c === "'") {
            $quote = $c;
            $out .= $c;
            continue;
        }

        if ($c === '/' && $i + 1 < $n && $s[$i + 1] === '*') {
            $end = strpos($s, '*/', $i + 2);
            if ($end === false) {
                // Unterminated comment: leave the rest untouched rather than
                // silently truncating the stylesheet.
                $out .= substr($s, $i);
                return $out;
            }
            $i = $end + 1;                       // skip to the closing slash
            continue;
        }

        $out .= $c;
    }
    return $out;
}

// Included by the test suite to reuse dccs_strip_comments() — one copy of the
// stripping logic, not two that must agree. Only the CLI entry point runs.
if (PHP_SAPI !== 'cli' || !isset($argv[0]) || realpath($argv[0]) !== realpath(__FILE__)) {
    return;
}

$root = dirname(__DIR__) . '/dcc-cottage-selector/assets/css/';
$src  = $root . 'selector.css';
$dest = $root . 'selector.min.css';

$css = file_get_contents($src);
if ($css === false) {
    fwrite(STDERR, "cannot read $src\n");
    exit(1);
}


$min = dccs_strip_comments($css);
// Tidy only what removing comments left behind.
$min = preg_replace('/[ \t]+$/m', '', $min);     // trailing whitespace
$min = preg_replace('/\n{2,}/', "\n", $min);     // runs of blank lines
$min = ltrim($min, "\n");

$check = in_array('--check', $argv, true);
$current = is_readable($dest) ? file_get_contents($dest) : null;

if ($check) {
    if ($current === $min) {
        echo "ok — selector.min.css is current\n";
        exit(0);
    }
    fwrite(STDERR, "selector.min.css is STALE. Run: php tools/build-css.php\n");
    exit(1);
}

file_put_contents($dest, $min);
printf(
    "wrote selector.min.css — %d -> %d bytes raw (%.0f%% smaller), %d -> %d gzipped\n",
    strlen($css),
    strlen($min),
    100 * (1 - strlen($min) / strlen($css)),
    strlen(gzencode($css, 9)),
    strlen(gzencode($min, 9))
);
