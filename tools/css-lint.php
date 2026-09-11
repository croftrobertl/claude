<?php
/**
 * Structural lint for every shipped stylesheet.
 *
 * This exists because 0.31.0 shipped an unbalanced brace that silently discarded a
 * whole rule. A stray `cursor: pointer; }` was left behind when a regex removed the
 * selector line above it, and the CSS parser does NOT treat an orphaned declaration
 * at the top level as a declaration — it reads it as the start of a SELECTOR
 * PRELUDE, and a semicolon does not end a prelude. So it swallowed the stray brace,
 * a comment, and the NEXT rule's selector before finding a `{`, then threw the
 * whole thing away as invalid. `.dccs-wizard-nav` lost display:flex and gap:10px
 * and nothing anywhere failed: the declarations were still in the file, they were
 * just never applied.
 *
 * Run: php tools/css-lint.php [file ...]
 */

/** Blank out comments and string literals so braces inside them do not count. */
function dccs_css_strip(string $css): string
{
    $out = '';
    $n = strlen($css);
    $i = 0;
    while ($i < $n) {
        $c = $css[$i];
        if ($c === '/' && $i + 1 < $n && $css[$i + 1] === '*') {
            $end = strpos($css, '*/', $i + 2);
            $end = $end === false ? $n : $end + 2;
            $out .= str_repeat(' ', $end - $i - substr_count(substr($css, $i, $end - $i), "\n"));
            $out .= str_repeat("\n", substr_count(substr($css, $i, $end - $i), "\n"));
            $i = $end;
            continue;
        }
        if ($c === '"' || $c === "'") {
            $q = $c; $out .= ' '; $i++;
            while ($i < $n && $css[$i] !== $q) {
                if ($css[$i] === '\\') { $out .= ' '; $i++; }
                $out .= $css[$i] === "\n" ? "\n" : ' ';
                $i++;
            }
            $out .= ' '; $i++;
            continue;
        }
        $out .= $c;
        $i++;
    }
    return $out;
}

/**
 * @return array<int,string> one message per problem found
 */
function dccs_css_lint(string $path): array
{
    $raw = (string) file_get_contents($path);
    $css = dccs_css_strip($raw);
    $problems = [];

    // 1. Brace balance, with the line of the first unmatched closer.
    $depth = 0; $line = 1; $opens = [];
    for ($i = 0, $n = strlen($css); $i < $n; $i++) {
        $c = $css[$i];
        if ($c === "\n") { $line++; continue; }
        if ($c === '{') { $depth++; $opens[] = $line; continue; }
        if ($c === '}') {
            $depth--;
            if ($depth < 0) {
                $problems[] = "unmatched '}' at line $line (depth went negative)";
                $depth = 0;
            } else {
                array_pop($opens);
            }
        }
    }
    if ($depth > 0) {
        $problems[] = "$depth unclosed '{' (still open from line " . ($opens[0] ?? '?') . ')';
    }

    // 2. A declaration sitting outside any rule block. At depth 0 a `prop: value;`
    //    is not a declaration at all — it is the head of a prelude — which is what
    //    makes this silent rather than loud.
    $depth = 0; $line = 1; $buf = '';
    for ($i = 0, $n = strlen($css); $i < $n; $i++) {
        $c = $css[$i];
        if ($c === "\n") { $line++; }
        if ($c === '{') { $depth++; $buf = ''; continue; }
        if ($c === '}') { $depth = max(0, $depth - 1); $buf = ''; continue; }
        if ($depth > 0) { continue; }
        if ($c === ';') {
            $frag = trim(preg_replace('/\s+/', ' ', $buf));
            // At-rules legitimately end in a semicolon at the top level.
            if ($frag !== '' && $frag[0] !== '@' && preg_match('/^[-a-zA-Z]+\s*:/', $frag)) {
                $problems[] = "declaration outside any rule block near line $line: '"
                    . (strlen($frag) > 60 ? substr($frag, 0, 57) . '...' : $frag) . "'";
            }
            $buf = '';
            continue;
        }
        $buf .= $c;
    }

    return $problems;
}

$files = array_slice($argv, 1);
if (!$files) {
    $files = glob(__DIR__ . '/../dcc-cottage-selector/assets/css/*.css') ?: [];
    // Any other DCC stylesheet that happens to be in the tree gets linted too.
    foreach (glob(__DIR__ . '/../*/assets/css/*.css') ?: [] as $f) {
        if (!in_array($f, $files, true)) { $files[] = $f; }
    }
}

$bad = 0;
foreach ($files as $f) {
    $problems = dccs_css_lint($f);
    $short = basename(dirname(dirname(dirname($f)))) . '/' . basename($f);
    if ($problems) {
        $bad++;
        echo "  NOT OK - $short\n";
        foreach ($problems as $p) { echo "      $p\n"; }
    } else {
        echo "  ok  - $short parses clean (braces balanced, no stray declarations)\n";
    }
}
echo $bad ? "\n$bad stylesheet(s) FAILED\n" : "\nall stylesheets structurally clean\n";
exit($bad ? 1 : 0);
