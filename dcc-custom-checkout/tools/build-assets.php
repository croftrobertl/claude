<?php
/**
 * Build the minified checkout assets (v0.34.2).
 *
 *     php dcc-custom-checkout/tools/build-assets.php          # write
 *     php dcc-custom-checkout/tools/build-assets.php --check  # verify only
 *
 * WHY THIS EXISTS: checkout.js and checkout.css ship to every guest on
 * /submit-booking/, and until 0.34.2 they shipped as written — comments,
 * indentation and all (the Director's audit: 127 KB and 57 KB raw). The
 * comments in those files are load-bearing documentation and are not going
 * anywhere, so they are stripped at build time instead.
 *
 * WHAT IT DOES, AND DELIBERATELY NOTHING MORE:
 *   - removes comments;
 *   - removes indentation and trailing whitespace;
 *   - removes blank lines.
 * It does NOT rename anything, does NOT join lines, and does NOT reorder or
 * rewrite a single statement. Every newline in the source survives.
 *
 * WHY SO CONSERVATIVE: joining lines in JavaScript means taking on automatic
 * semicolon insertion, and renaming means taking on scope analysis. Either one
 * can change behaviour in a way that is invisible in the file and visible on a
 * guest's phone at the moment they book. The gain from those two is not worth
 * that on a site where the whole budget is a few tens of KB, and the files are
 * served gzipped anyway, which recovers most of what joining would have won.
 *
 * The source files are still shipped, and are what loads under SCRIPT_DEBUG.
 *
 * Strings, template literals and regular expressions are tracked, so a "//"
 * inside a string and a "/*" inside a regex are left alone.
 */

$root  = dirname(__DIR__);
$check = in_array('--check', $argv, true);
// --out=DIR writes the built files somewhere else, so a test can build from
// the current sources and read the result without touching the shipped files.
$out_dir = '';
foreach ($argv as $arg) {
    if (strpos($arg, '--out=') === 0) {
        $out_dir = rtrim(substr($arg, 6), '/');
    }
}

/** The assets a guest downloads. tap-debug.js is admin-only and flag-gated. */
$targets = [
    'assets/checkout.js',
    'assets/checkout.css',
    'assets/checkout-layout.css',
    'assets/guest-count.js',
    'assets/select-list.js',
];

$fail = 0;
foreach ($targets as $rel) {
    $src = $root . '/' . $rel;
    if (!is_readable($src)) {
        echo "MISSING  $rel\n";
        $fail++;
        continue;
    }
    $ext  = pathinfo($src, PATHINFO_EXTENSION);
    $out  = preg_replace('/\.(js|css)$/', '.min.$1', $out_dir === '' ? $src : $out_dir . '/' . basename($src));
    $code = file_get_contents($src);
    $min  = $ext === 'css' ? dcc_minify_css($code) : dcc_minify_js($code);

    $note = sprintf(
        '%-26s %6.1f KB -> %6.1f KB  (%d%% off)',
        basename($rel),
        strlen($code) / 1024,
        strlen($min) / 1024,
        (int) round((1 - strlen($min) / max(1, strlen($code))) * 100)
    );

    if ($check) {
        $have = is_readable($out) ? file_get_contents($out) : null;
        if ($have === null) {
            echo "STALE    $note  (no built file)\n";
            $fail++;
        } elseif ($have !== $min) {
            echo "STALE    $note  (built file does not match the source)\n";
            $fail++;
        } else {
            echo "OK       $note\n";
        }
        continue;
    }

    file_put_contents($out, $min);
    echo "BUILT    $note\n";
}

if ($check && $fail) {
    echo "\n$fail file(s) need rebuilding: php dcc-custom-checkout/tools/build-assets.php\n";
}
exit($fail ? 1 : 0);

/**
 * Remove JavaScript comments, indentation and blank lines. Newlines are kept,
 * so no statement can be joined to the one after it.
 */
function dcc_minify_js(string $code): string
{
    $out = '';
    $len = strlen($code);
    $i   = 0;
    // The last significant character written, for telling a regular expression
    // from a division.
    $prev = '';
    while ($i < $len) {
        $c    = $code[$i];
        $next = $i + 1 < $len ? $code[$i + 1] : '';

        if ($c === '/' && $next === '/') {
            while ($i < $len && $code[$i] !== "\n") {
                $i++;
            }
            continue;
        }
        if ($c === '/' && $next === '*') {
            $end = strpos($code, '*/', $i + 2);
            $i   = $end === false ? $len : $end + 2;
            continue;
        }
        if ($c === '"' || $c === "'" || $c === '`') {
            $j = dcc_scan_quoted($code, $i, $c);
            $out .= substr($code, $i, $j - $i);
            $prev = $c;
            $i    = $j;
            continue;
        }
        if ($c === '/' && dcc_js_regex_here($out, $prev)) {
            $j = dcc_scan_regex($code, $i);
            $out .= substr($code, $i, $j - $i);
            $prev = '/';
            $i    = $j;
            continue;
        }
        $out .= $c;
        if ($c !== ' ' && $c !== "\t" && $c !== "\n" && $c !== "\r") {
            $prev = $c;
        }
        $i++;
    }

    return dcc_trim_lines($out);
}

/**
 * Remove CSS comments, indentation and blank lines. Strings and url() values
 * are copied through untouched — the caret is an inline SVG data URI carrying
 * spaces, slashes and semicolons of its own.
 */
function dcc_minify_css(string $code): string
{
    $out = '';
    $len = strlen($code);
    $i   = 0;
    while ($i < $len) {
        $c    = $code[$i];
        $next = $i + 1 < $len ? $code[$i + 1] : '';
        if ($c === '/' && $next === '*') {
            $end = strpos($code, '*/', $i + 2);
            $i   = $end === false ? $len : $end + 2;
            continue;
        }
        if ($c === '"' || $c === "'") {
            $j = dcc_scan_quoted($code, $i, $c);
            $out .= substr($code, $i, $j - $i);
            $i    = $j;
            continue;
        }
        $out .= $c;
        $i++;
    }

    return dcc_trim_lines($out);
}

/** Indentation, trailing whitespace and blank lines go; newlines stay. */
function dcc_trim_lines(string $code): string
{
    $lines = preg_split('/\r\n|\r|\n/', $code);
    $kept  = [];
    foreach ($lines as $line) {
        $line = rtrim($line);
        $trim = ltrim($line);
        if ($trim === '') {
            continue;
        }
        $kept[] = $trim;
    }
    return implode("\n", $kept) . "\n";
}

/** Index just past a quoted string (or template literal) starting at $i. */
function dcc_scan_quoted(string $code, int $i, string $quote): int
{
    $len = strlen($code);
    $j   = $i + 1;
    while ($j < $len) {
        if ($code[$j] === '\\') {
            $j += 2;
            continue;
        }
        if ($code[$j] === $quote) {
            return $j + 1;
        }
        $j++;
    }
    return $len;
}

/** Index just past a regular expression literal starting at $i. */
function dcc_scan_regex(string $code, int $i): int
{
    $len   = strlen($code);
    $j     = $i + 1;
    $class = false;
    while ($j < $len) {
        $c = $code[$j];
        if ($c === '\\') {
            $j += 2;
            continue;
        }
        if ($c === "\n") {
            return $i + 1; // Unterminated: it was a division after all.
        }
        if ($c === '[') {
            $class = true;
        } elseif ($c === ']') {
            $class = false;
        } elseif ($c === '/' && !$class) {
            $j++;
            while ($j < $len && ctype_alpha($code[$j])) {
                $j++; // flags
            }
            return $j;
        }
        $j++;
    }
    return $len;
}

/**
 * Does a "/" here start a regular expression? It does unless the previous
 * significant character ends a value — an identifier, a number, or a closing
 * bracket — and even then it does after a keyword like `return`.
 */
function dcc_js_regex_here(string $written, string $prev): bool
{
    if ($prev === '') {
        return true;
    }
    if (!preg_match('/[A-Za-z0-9_$)\]]/', $prev)) {
        return true;
    }
    if ($prev === ')' || $prev === ']') {
        return false;
    }
    // An identifier: a keyword that takes an expression means a regex follows.
    if (preg_match('/([A-Za-z_$][A-Za-z0-9_$]*)\s*$/', $written, $m)) {
        return in_array($m[1], [
            'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
            'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
        ], true);
    }
    return false;
}
