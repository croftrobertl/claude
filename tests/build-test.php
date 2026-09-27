<?php
/**
 * The CSS build step, and the thing it is easiest to get wrong: shipping a
 * .min.css that no longer matches the source it was built from.
 *
 * THE SOURCE IS NOT WHAT VISITORS GET (0.42.0). widget.css keeps every
 * comment; widget.min.css is enqueued. Two files mean two ways to be wrong —
 * editing the source and forgetting to rebuild, or hand-editing the built
 * file — and neither shows up on any page until someone looks at the right
 * pixel. --check is what makes that a failing test instead.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
$TOOLS = dirname(__DIR__) . '/tools';

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$src = file_get_contents($ROOT . '/assets/css/widget.css');
$min = @file_get_contents($ROOT . '/assets/css/widget.min.css');

echo "-- the built file is committed and current --\n";
{
    check('widget.min.css exists in the plugin folder, so the zip carries it',
        is_string($min) && $min !== '');
    // THE REAL GUARD. Running the build in --check mode is the only way to
    // know the committed file is what the current source produces; comparing
    // sizes or spot-checking a rule would pass a file that was rebuilt from
    // a different revision.
    $out = [];
    $code = 0;
    exec('php ' . escapeshellarg($TOOLS . '/build-css.php') . ' --check 2>&1', $out, $code);
    check('it is exactly what the current source builds to — rebuild if this fails',
        $code === 0, implode(' / ', $out));
}

echo "\n-- it is a comment strip, NOT a minifier --\n";
{
    $norm = static fn(string $s): string => preg_replace('/\s+/', '', $s);
    $naive = preg_replace('#/\*(?!!).*?\*/#s', '', $src);
    check('the built file is the source minus comments, character for character',
        $norm($naive) === $norm(preg_replace('#/\*!.*?\*/#s', '', (string) $min)));
    check('every rule in the source is a rule in the build',
        substr_count($naive, '{') === substr_count((string) $min, '{'),
        [substr_count($naive, '{'), substr_count((string) $min, '{')]);

    /* THE CONSTRUCTS A MINIFIER WOULD EAT. Each of these is in widget.css
       for a documented reason and each is the kind of thing a real minifier
       "optimises" away. Asserting them by name is what makes the claim "this
       is not a minifier" checkable rather than a promise in a comment. */
    check('the doubled background survives, in order — the literal must come FIRST',
        preg_match('/background:\s*#E7EEF7;\s*background:\s*color-mix\(/', (string) $min) === 1);
    check('nested var() fallbacks survive',
        str_contains((string) $min, 'var(--mphbac-color-btn-hover, var(--dcc-button-hover-bg))'));
    check('the max-height fallback chain survives all three steps',
        substr_count((string) $min, 'max-height: 90vh') === 1
        && substr_count((string) $min, 'max-height: 90dvh') === 1
        && substr_count((string) $min, 'max-height: 90svh') === 1);
    check('the !important that keeps line-height off the theme survives',
        str_contains((string) $min, '!important'));
}

echo "\n-- F9: the stripper refuses what it cannot be sure of --\n";
{
    /* Driven as a BLACK BOX through --strip, with the exit code as the
       verdict. The 0.42.0 stripper tracked quoted strings only, so a `/*`
       inside an UNQUOTED url() would have been cut as a comment — and the
       regex cross-check would have agreed, because it makes the same
       mistake. Nothing in widget.css does this; the point is that it cannot
       start doing it silently. */
    $tmp = sys_get_temp_dir() . '/mphbac-strip-' . getmypid();
    $run = static function (string $css) use ($tmp, $TOOLS): array {
        file_put_contents($tmp, $css);
        $out = []; $code = 0;
        exec('php ' . escapeshellarg($TOOLS . '/build-css.php') . ' --strip ' . escapeshellarg($tmp) . ' 2>&1', $out, $code);
        return [$code, implode("\n", $out)];
    };
    [$c, $o] = $run("a{background:url(data:image/svg+xml,<svg>/*x*/</svg>)}\nb{color:red}/* gone */\n");
    check('a /* inside an UNQUOTED url() is REFUSED, exit 1', $c === 1, [$c, substr($o, 0, 80)]);
    check('...and says why', str_contains($o, "inside an unquoted url()"), $o);
    /* THE CONTRACT IS "REFUSE ANYTHING AMBIGUOUS", not "be clever". A `/*`
       inside a QUOTED value is one the string-aware strip handles correctly
       — and the build still refuses it, because its cross-check against a
       plain regex strip sees the two disagree and stops rather than trusting
       either. That is deliberate: widget.css has no such value, and the day
       one appears is a day a human should look. The first version of this
       test expected the quoted cases to be KEPT; the tool's actual, safer
       contract is that they are refused too. F9's addition is the UNQUOTED
       case above, where the two strippers used to agree on the wrong answer
       and nothing refused anything. */
    [$c, $o] = $run("a{background:url(\"data:image/svg+xml,<svg>/*x*/</svg>\")}\nb{color:red}/* gone */\n");
    check('inside a QUOTED url() it is refused too, by the cross-check, not silently cut',
        $c === 1 && str_contains($o, 'disagree'), [$c, substr($o, 0, 120)]);
    [$c, $o] = $run("a{content:'/* not a comment */'}\n/* real */\nb{color:red}\n");
    check('a comment-like sequence inside a string: refused for the same reason',
        $c === 1 && str_contains($o, 'disagree'), [$c, substr($o, 0, 120)]);
    [$c, $o] = $run("a{color:red}\n/* plain */\nb{color:blue}\n");
    check('and an ordinary stylesheet strips cleanly, exit 0',
        $c === 0 && !str_contains($o, 'plain') && str_contains($o, 'b{color:blue}'), [$c, $o]);
    [$c, $o] = $run("a{color:red}/*! licence */\n/* plain */\n");
    check('a /*! bang comment survives, a plain one does not',
        $c === 0 && str_contains($o, '/*! licence */') && !str_contains($o, 'plain'), [$c, $o]);
    @unlink($tmp);
}

echo "\n-- the saving is real, measured the way a phone pays for it --\n";
{
    $g = static fn(string $s): int => strlen(gzencode($s, 9));
    check('raw: the build is under half the source',
        strlen((string) $min) < strlen($src) * 0.5,
        [strlen($src), strlen((string) $min)]);
    check('gzipped: the build is under a quarter of the source',
        $g((string) $min) < $g($src) * 0.25, [$g($src), $g((string) $min)]);
    printf("      raw %d -> %d bytes, gzip -9 %d -> %d bytes\n",
        strlen($src), strlen((string) $min), $g($src), $g((string) $min));
}

echo "\n-- the enqueue, and the attribute that must NOT go with the comments --\n";
{
    $php = file_get_contents($ROOT . '/includes/class-widget.php');
    check('register_assets enqueues the BUILT file, not the source',
        preg_match("/wp_register_style\(\s*'mphbac-widget',\s*MPHBAC_URL \. 'assets\/css\/' \. self::stylesheet_file\(\)/", $php) === 1);
    check('SCRIPT_DEBUG still serves the commented source',
        preg_match("/SCRIPT_DEBUG\)\s*\?\s*'widget\.css'\s*:\s*'widget\.min\.css'/", $php) === 1);
    /* data-no-minify KEEPS SpeedyCache's RUNTIME minifier off this file. A
       build-time comment strip is not the same thing and does not replace
       it — the runtime minifier is what would rewrite the constructs
       asserted above. */
    check('the <link> still carries data-no-minify and data-no-optimize',
        str_contains($php, "'<link data-no-optimize=\"1\" data-no-minify=\"1\" '"));
}

echo "\n-- the source keeps its reasoning --\n";
{
    check('widget.css still carries the portal explanation the build strips',
        str_contains($src, 'THE TOKENS ARE DECLARED WHERE THE PORTAL CAN STILL SEE THEM'));
    check('...and the built file does not, which is the entire point',
        !str_contains((string) $min, 'THE TOKENS ARE DECLARED WHERE'));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
