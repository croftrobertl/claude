<?php
/**
 * BUILD STEP: strip comments from a stylesheet, and nothing else.
 *
 *     php tools/build-css.php            # write the .min.css files
 *     php tools/build-css.php --check    # verify the committed ones are current
 *
 * WHY THIS EXISTS. widget.css is loaded in <head> on the home page,
 * /cottages/ and every cottage page, so it is render-blocking on the three
 * pages that matter most. It is 109 KB raw, and its comments — which no
 * browser reads — are the large majority of that. The comments are not
 * waste: this project's faults have been subtle enough that the reasons live
 * next to the rules, and PROJECT-NOTES records more than one release that
 * went wrong because a comment was missing or had gone stale. So the source
 * keeps every word and the browser is sent the rules.
 *
 * IT IS NOT A MINIFIER, DELIBERATELY. It removes comment blocks and the
 * blank lines they leave behind. It does not rewrite selectors, collapse
 * whitespace inside rules, reorder declarations, merge rules, shorten
 * colours or touch a value in any way. That restraint is the whole safety
 * argument: widget.css carries several constructs a real minifier is known
 * to mangle — nested var() fallbacks, `background:` declared twice so the
 * literal survives a browser without color-mix(), and duplicate-looking
 * declarations that are deliberate cascade fallbacks — and the file's own
 * header is why the <link> carries data-no-minify. That attribute STAYS.
 * A build-time comment strip and a runtime minifier are not the same thing.
 *
 * STRING-AWARE, not a regex. `/\*.*?\*​/` across a stylesheet is wrong the
 * moment a `/*` appears inside a quoted value or a url() — a content:
 * property or an inline SVG data URI would be silently truncated, and
 * widget.css ships several inline SVG data URIs. There are none today (this
 * script checks), but "none today" is not a property that survives editing.
 */

const TARGETS = [
    'mphb-availability-calendar/assets/css/widget.css' => 'mphb-availability-calendar/assets/css/widget.min.css',
];

/**
 * Remove /* *​/ comment blocks, honouring quoted strings and url() so a
 * comment-like sequence inside a value is never treated as a comment.
 * Preserves /*! bang comments, which by convention mark licences.
 */
function mphbac_strip_css_comments(string $css): string
{
    $out = '';
    $len = strlen($css);
    $i = 0;
    $quote = '';          // '"' or "'" while inside a string
    while ($i < $len) {
        $c = $css[$i];
        if ($quote !== '') {
            $out .= $c;
            if ($c === '\\' && $i + 1 < $len) {      // escaped char: copy both
                $out .= $css[$i + 1];
                $i += 2;
                continue;
            }
            if ($c === $quote) { $quote = ''; }
            $i++;
            continue;
        }
        if ($c === '"' || $c === "'") { $quote = $c; $out .= $c; $i++; continue; }
        if ($c === '/' && $i + 1 < $len && $css[$i + 1] === '*') {
            if ($i + 2 < $len && $css[$i + 2] === '!') {   // /*! licence */ — keep
                $end = strpos($css, '*/', $i + 2);
                $end = $end === false ? $len : $end + 2;
                $out .= substr($css, $i, $end - $i);
                $i = $end;
                continue;
            }
            $end = strpos($css, '*/', $i + 2);
            if ($end === false) {
                fwrite(STDERR, "build-css: unterminated comment — refusing to write\n");
                exit(1);
            }
            $i = $end + 2;
            continue;
        }
        $out .= $c;
        $i++;
    }
    // Collapse the blank lines the removed blocks left behind, and trailing
    // spaces on the lines they were appended to. Nothing else.
    $out = preg_replace('/[ \t]+$/m', '', $out);
    $out = preg_replace('/\n{2,}/', "\n", $out);
    return trim($out) . "\n";
}

/**
 * Refuse to build anything this script is not sure it understands. Cheap
 * insurance against the one failure mode that matters: silently shipping a
 * stylesheet with a value cut in half.
 */
function mphbac_sanity(string $src, string $out, string $path): void
{
    $problems = [];
    $norm = static fn(string $s): string => preg_replace('/\s+/', '', $s);

    /* TWO INDEPENDENT STRIPPERS MUST AGREE. Comparing the output against
       this script's own stripper would be tautological — it would pass
       however wrong that stripper was. So the output is compared against a
       NAIVE REGEX strip, which is the obvious implementation and is correct
       for every stylesheet that has no comment-like sequence inside a quoted
       value or a url(). Where the two disagree, the string-aware one is the
       right answer AND the file has grown a construct worth a human's
       attention, so the build stops rather than guessing.

       Braces are NOT compared against the source: this file's comments quote
       CSS at length, so the source legitimately holds braces the output does
       not. What is checked is that the output's own braces balance. */
    $naive = preg_replace('#/\*(?!!).*?\*/#s', '', $src);
    if ($norm($naive) !== $norm($out)) {
        $problems[] = 'the string-aware strip and a plain regex strip disagree — '
            . 'a comment-like sequence is probably inside a value; check by hand';
    }
    if (substr_count($out, '{') !== substr_count($out, '}')) {
        $problems[] = 'braces do not balance in the output: '
            . substr_count($out, '{') . ' open, ' . substr_count($out, '}') . ' close';
    }
    if (preg_match('#/\*(?!!)#', $out)) {
        $problems[] = 'a non-licence comment survived';
    }
    if (strlen($out) >= strlen($src)) {
        $problems[] = 'output is not smaller than the source — nothing was stripped';
    }
    if ($problems) {
        fwrite(STDERR, "build-css: REFUSING to write $path\n  - " . implode("\n  - ", $problems) . "\n");
        exit(1);
    }
}

$root  = dirname(__DIR__);
$check = in_array('--check', $argv, true);
$fail  = 0;

foreach (TARGETS as $from => $to) {
    $srcPath = $root . '/' . $from;
    $outPath = $root . '/' . $to;
    $src = file_get_contents($srcPath);
    if ($src === false) {
        fwrite(STDERR, "build-css: cannot read $from\n");
        exit(1);
    }
    $banner = "/*! " . basename($from) . " — comments stripped by tools/build-css.php."
            . " Edit the SOURCE, not this file, then re-run the build. */\n";
    $body   = mphbac_strip_css_comments($src);
    mphbac_sanity($src, $body, $to);
    $out = $banner . $body;

    if ($check) {
        $have = is_readable($outPath) ? file_get_contents($outPath) : null;
        if ($have === $out) {
            printf("%-46s current\n", $to);
        } else {
            printf("%-46s STALE — run: php tools/build-css.php\n", $to);
            $fail = 1;
        }
        continue;
    }
    file_put_contents($outPath, $out);
    printf("%-46s %7d -> %7d bytes (gzip -9: %d -> %d)\n", $to,
        strlen($src), strlen($out),
        strlen(gzencode($src, 9)), strlen(gzencode($out, 9)));
}
exit($fail);
