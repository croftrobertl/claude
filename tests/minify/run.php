<?php
/**
 * v0.34.2 — the built checkout assets, and which of the two a guest gets.
 *
 *     php tests/minify/run.php
 *
 * The Director's audit: checkout.js and checkout.css ship to every guest and
 * shipped as written — 127 KB and 57 KB raw. tools/build-assets.php now writes
 * a .min. copy of each guest-facing asset, and Assets::asset_url() serves it
 * unless SCRIPT_DEBUG is on.
 *
 * WHAT THIS PROVES: the built files on disk are what the shipped builder makes
 * of the current sources (so a source edit without a rebuild is caught), the
 * built JavaScript parses, the comments are gone and the code is not, and the
 * plugin serves the built file — or the source, under SCRIPT_DEBUG, or when
 * there is no built file at all.
 *
 * WHAT IT DOES NOT PROVE: that the built bundle BEHAVES like the source. That
 * is tests/selectlist run with DCC_MIN=1 — the whole dropdown, validation and
 * guest-count suite in a real browser, against the built files.
 */
define('ABSPATH', __DIR__);

$root  = dirname(__DIR__, 2);
$plugin = $root . '/dcc-custom-checkout';
$assets = $plugin . '/assets';

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n";
        echo '      actual:   ' . var_export($actual, true) . "\n";
    }
}
function run(array $cmd, &$code = null): string {
    $out = [];
    exec(implode(' ', array_map('escapeshellarg', $cmd)) . ' 2>&1', $out, $code);
    return implode("\n", $out);
}

/** The guest-facing assets, and what the builder is expected to cover. */
const GUEST_ASSETS = ['checkout.js', 'checkout.css', 'checkout-layout.css', 'guest-count.js', 'select-list.js', 'restore.js'];

/* --- Build from the CURRENT sources, into a directory of our own. The
   structural checks below read THAT, not the shipped files: they are
   evidence about the builder, not about what somebody last committed. ---- */
$fresh = sys_get_temp_dir() . '/dcc-minify-' . getmypid();
@mkdir($fresh, 0777, true);
$out = run(['php', $plugin . '/tools/build-assets.php', '--out=' . $fresh], $code);
check('the builder runs', $code, 0);
if ($code !== 0) {
    echo $out . "\n";
}

/* --- And the files on disk are that same build. -------------------------- */
$out = run(['php', $plugin . '/tools/build-assets.php', '--check'], $code);
check('the built assets match the sources (php tools/build-assets.php --check)', $code, 0);
if ($code !== 0) {
    echo $out . "\n";
}

foreach (GUEST_ASSETS as $name) {
    $min = $assets . '/' . preg_replace('/\.(js|css)$/', '.min.$1', $name);
    check("$name has a built file shipped", is_readable($min), true);
}

/** The freshly built file for an asset — what the shipped builder makes now. */
function built(string $name): string {
    global $fresh;
    return $fresh . '/' . preg_replace('/\.(js|css)$/', '.min.$1', $name);
}

/* --- The built JavaScript parses. Without this the suite could be green on
   a file no browser would run. ------------------------------------------- */
$node = run(['node', '--version'], $code);
check('node is available to parse-check the built files (not skipped)', $code, 0);
foreach (GUEST_ASSETS as $name) {
    if (substr($name, -3) !== '.js') {
        continue;
    }
    $out = run(['node', '--check', built($name)], $code);
    check("the built $name parses", $code, 0);
    if ($code !== 0) {
        echo $out . "\n";
    }
}

/* --- The comments are gone and the code is not. -------------------------- */
foreach (GUEST_ASSETS as $name) {
    $src = (string) file_get_contents($assets . '/' . $name);
    $min = (string) file_get_contents(built($name));
    check("$name: the built file is smaller", strlen($min) < strlen($src), true);
    check("$name: no comment line survives",
        (bool) preg_match('/^\s*(\/\/|\/\*|\*)/m', $min), false);
    check("$name: no line is indented", (bool) preg_match('/^[ \t]+\S/m', $min), false);
    check("$name: no blank line", (bool) preg_match('/^\s*$/m', rtrim($min, "\n")), false);
}

/* --- Nothing was dropped: every function the source declares is declared in
   the built file, and every CSS rule block survives. Read by a different
   reader from the builder's, over both files. The behavioural proof is
   tests/selectlist run with DCC_MIN=1. ------------------------------------ */
foreach (GUEST_ASSETS as $name) {
    $src = (string) file_get_contents($assets . '/' . $name);
    $min = (string) file_get_contents($assets . '/' . preg_replace('/\\.(js|css)$/', '.min.$1', $name));
    if (substr($name, -3) === '.js') {
        preg_match_all('/function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/', $src, $a);
        preg_match_all('/function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/', $min, $b);
        sort($a[1]); sort($b[1]);
        check("$name: every function it declares survives the build", $b[1], $a[1]);
        check("$name: ... and there are some to count", count($a[1]) > 10, true);
    } else {
        check("$name: every rule block survives",
            [substr_count($min, '{'), substr_count($min, '}')],
            [substr_count_code($src, '{'), substr_count_code($src, '}')]);
        check("$name: every declaration survives",
            substr_count($min, ';') >= substr_count_code($src, ';'), true);
    }
}

/**
 * Count a character in CSS, ignoring comments. A crude reader on purpose: it
 * is checking the builder's work, so it must not be the builder.
 */
function substr_count_code(string $css, string $needle): int {
    $stripped = preg_replace('!/\\*.*?\\*/!s', '', $css);
    return substr_count((string) $stripped, $needle);
}


/* --- Which one the plugin serves. ---------------------------------------- */
$urls = static function (int $debug, int $missing = 0, int $force = 0) use ($root): array {
    $out = run(['php', $root . '/tests/minify/url.php', (string) $debug, (string) $missing, (string) $force], $code);
    $json = json_decode($out, true);
    return is_array($json) ? $json : ['error' => $out];
};

check('with SCRIPT_DEBUG off, every guest asset is the built one', $urls(0), [
    'assets/checkout.js'     => 'checkout.min.js',
    'assets/checkout.css'    => 'checkout.min.css',
    'assets/checkout-layout.css' => 'checkout-layout.min.css',
    'assets/guest-count.js'  => 'guest-count.min.js',
    'assets/select-list.js'  => 'select-list.min.js',
    'assets/restore.js'      => 'restore.min.js',
]);
check('with SCRIPT_DEBUG on, every guest asset is the source', $urls(1), [
    'assets/checkout.js'     => 'checkout.js',
    'assets/checkout.css'    => 'checkout.css',
    'assets/checkout-layout.css' => 'checkout-layout.css',
    'assets/guest-count.js'  => 'guest-count.js',
    'assets/select-list.js'  => 'select-list.js',
    'assets/restore.js'      => 'restore.js',
]);
check('a plugin folder with no built files serves the sources, not a 404', $urls(0, 1), [
    'assets/checkout.js'     => 'checkout.js',
    'assets/checkout.css'    => 'checkout.css',
    'assets/checkout-layout.css' => 'checkout-layout.css',
    'assets/guest-count.js'  => 'guest-count.js',
    'assets/select-list.js'  => 'select-list.js',
    'assets/restore.js'      => 'restore.js',
]);
check('and a site can insist on the sources through the filter', $urls(0, 0, 1), [
    'assets/checkout.js'     => 'checkout.js',
    'assets/checkout.css'    => 'checkout.css',
    'assets/checkout-layout.css' => 'checkout-layout.css',
    'assets/guest-count.js'  => 'guest-count.js',
    'assets/select-list.js'  => 'select-list.js',
    'assets/restore.js'      => 'restore.js',
]);

/* --- Nothing guest-facing is enqueued around asset_url(). -----------------
   The next asset added to the checkout must go through it too, or it ships
   unminified and nothing says so. Admin assets and the flag-gated tap
   diagnostic are the named exceptions. ----------------------------------- */
$direct = [];
foreach (['includes/class-assets.php', 'includes/class-guest-count-script.php',
          'includes/class-restore.php'] as $rel) {
    $code_text = (string) file_get_contents($plugin . '/' . $rel);
    if (preg_match_all('/DCC_CHECKOUT_URL\s*\.\s*\'(assets\/[^\']+)\'/', $code_text, $m)) {
        foreach ($m[1] as $hit) {
            $direct[] = $hit;
        }
    }
}
check('every guest asset is enqueued through asset_url() (tap-debug.js is admin-only and flag-gated)',
    $direct, ['assets/tap-debug.js']);

array_map('unlink', (array) glob($fresh . '/*'));
@rmdir($fresh);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
