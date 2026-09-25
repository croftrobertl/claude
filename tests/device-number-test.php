<?php
/**
 * Widget::device_number() — the clamp behind every responsive number control
 * (days shown, months shown, name-column width).
 *
 * It is private, so this reflects into it rather than routing through a
 * render: the function IS the unit, and going through render_config() would
 * test the caller's plumbing instead. The clamp bounds are asserted by the
 * CALLERS' arguments too, read from the source, so a caller quietly widening
 * its range does not slip past.
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/elementor-stub.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
// Settings is required by the classes below since 0.40.0 (Cache::ttl(),
// Staff::page_id(), the Ajax clamps, the widgets' control defaults). In
// production the plugin's autoloader supplies it on demand; these harnesses
// require their classes explicitly, so it has to be named here. Left out, the
// suite FATALS rather than failing — which mutate.php reports as NO RUN, and
// which is how this was caught before it shipped.
require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-widget.php';

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$m = new ReflectionMethod(\MPHBAC\Widget::class, 'device_number');
$m->setAccessible(true);
$dn = static fn($v, $d, $min, $max) => $m->invoke(null, $v, $d, $min, $max);

echo "-- unset falls back to the default, and is NOT clamped to it --\n";
check("'' gives the default", $dn('', 3, 1, 4) === 3);
check('null gives the default', $dn(null, 3, 1, 4) === 3);
check('a default outside the range is returned AS-IS — the clamp guards input, not config',
    $dn('', 9, 1, 4) === 9, $dn('', 9, 1, 4));

echo "\n-- real values are clamped, not rejected --\n";
foreach ([[1, 1], [4, 4], [2, 2], [0, 1], [-5, 1], [9, 4], [99, 4]] as [$in, $want]) {
    check("$in -> $want", $dn($in, 3, 1, 4) === $want, $dn($in, 3, 1, 4));
}

echo "\n-- the types Elementor actually hands over --\n";
check("a numeric STRING works — Elementor stores numbers as strings", $dn('2', 3, 1, 4) === 2);
check("'0' is a value, not an absence, and clamps to the minimum", $dn('0', 3, 1, 4) === 1);
check('a float string truncates rather than rounding up', $dn('2.9', 3, 1, 4) === 2, $dn('2.9', 3, 1, 4));
check('junk becomes 0 and then clamps to the minimum, never the default',
    $dn('abc', 3, 1, 4) === 1, $dn('abc', 3, 1, 4));

echo "\n-- the callers' own bounds --\n";
{
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-widget.php');
    // A call site's DEFAULT may now be a literal or a Settings::get() read
    // (0.40.0). Both shapes are matched, so a site that moved to the settings
    // does not silently drop out of this sweep — which is how a guard quietly
    // stops guarding anything.
    preg_match_all('/device_number\([^,]+,\s*((?:\(int\) )?Settings::get\(\'\w+\'\)|\d+),\s*(\d+),\s*(\d+)\)/', $src, $mm, PREG_SET_ORDER);
    check('every call site was found (instrument check)', count($mm) >= 3, count($mm));
    foreach ($mm as $c) {
        [$all, $def, $min, $max] = $c;
        if (str_contains($def, 'Settings::get')) {
            // The number lives in the schema now; defaults-test.php is what
            // proves it sits in range, against the schema's own min/max.
            check("a call site reading a setting names a key that exists: $def",
                preg_match("/'(\w+)'/", $def, $k) === 1
                && array_key_exists($k[1], MPHBAC\Settings::schema()), $all);
            continue;
        }
        check("a call site's default $def sits inside its own range $min-$max",
            (int) $def >= (int) $min && (int) $def <= (int) $max, $all);
    }
    $months = array_values(array_filter($mm, static fn($c) => str_contains($c[0], 'months')));
    check('the months clamp is 1-4, as device_number is called', count($months) === 3
        && array_unique(array_map(static fn($c) => $c[2] . '-' . $c[3], $months)) === ['1-4'],
        array_map(static fn($c) => $c[0], $months));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
