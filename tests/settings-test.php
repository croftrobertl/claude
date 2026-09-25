<?php
/**
 * The settings registry: defaults, coercion, sanitisation, the upgrade merge,
 * and the zero-cost token emission.
 *
 * THE UPGRADE MERGE IS THE ONE TO STARE AT. A new version's defaults do NOT
 * merge into an already-stored option row, so a key added this release reads
 * as empty and its feature silently looks switched off. The failure is
 * invisible — nothing errors, the site just quietly behaves as though the new
 * setting were off — so it is asserted from BOTH sides here: the read path
 * must answer with the default for a key that has never been stored, and the
 * write path must persist the merge.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';

$GLOBALS['t_options'] = [];
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
if (!function_exists('trigger_error_stub')) { /* real trigger_error is used */ }

require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-ajax.php';
require $ROOT . '/includes/class-settings.php';

use MPHBAC\Settings;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
function reset_store(array $opts = []): void {
    $GLOBALS['t_options'] = $opts;
    Settings::flush();
}

echo "-- the schema is well formed --\n";
{
    $schema = Settings::schema();
    $groups = Settings::groups();
    check('every field names a group that exists',
        !array_filter($schema, static fn($f) => !isset($groups[$f['group']])),
        array_keys(array_filter($schema, static fn($f) => !isset($groups[$f['group']]))));
    $types = array_unique(array_column($schema, 'type'));
    sort($types);
    check('every field has a type the coercer handles',
        $types === ['bool', 'choice', 'color', 'int'], $types);
    $bad = [];
    foreach ($schema as $k => $f) {
        if ($f['type'] === 'color' && !preg_match('/^#[0-9a-fA-F]{3,8}$/', (string) $f['default'])) { $bad[] = $k; }
        if ($f['type'] === 'int' && ($f['default'] < $f['min'] || $f['default'] > $f['max'])) { $bad[] = $k; }
        if ($f['type'] === 'choice' && !array_key_exists($f['default'], $f['choices'])) { $bad[] = $k; }
    }
    check('no field ships a default its own rules would reject', $bad === [], $bad);
    check('there is at least one advanced group and one common one',
        count(array_filter($groups, static fn($g) => $g['advanced'])) > 0
        && count(array_filter($groups, static fn($g) => !$g['advanced'])) > 0);
}

echo "\n-- an empty database behaves exactly as the shipped defaults --\n";
{
    reset_store();
    check('all() with nothing stored IS the defaults, key for key',
        Settings::all() === Settings::defaults());
    check('...and nothing is emitted to the front end',
        Settings::tokens_css() === '', Settings::tokens_css());
}

echo "\n-- THE UPGRADE TRAP, from both sides --\n";
{
    // A row stored by an older release: it has SOME keys, and is missing the
    // ones this release added. This is the exact shape that made a sibling
    // plugin's new features look switched off.
    reset_store([Settings::OPTION => ['color_booked' => '#123456']]);
    $all = Settings::all();
    check('READ SIDE: a key that has never been stored still answers with its default',
        $all['min_nights'] === Settings::defaults()['min_nights'], $all['min_nights']);
    check('...and the one key that WAS stored is honoured',
        $all['color_booked'] === '#123456', $all['color_booked']);
    check('...and no key is missing from the answer',
        array_keys($all) === array_keys(Settings::defaults()));

    reset_store([Settings::OPTION => ['color_booked' => '#123456']]);
    Settings::maybe_upgrade();
    $stored = $GLOBALS['t_options'][Settings::OPTION];
    check('WRITE SIDE: maybe_upgrade persists every missing key',
        array_keys($stored) === array_keys(Settings::defaults()));
    check('...without trampling the value that was already there',
        $stored['color_booked'] === '#123456');
    check('...and records the schema version so it does not run again',
        (int) $GLOBALS['t_options'][Settings::VERSION_OPT] === Settings::SCHEMA_VERSION);

    // Second run must be a no-op rather than another write.
    $before = $GLOBALS['t_options'][Settings::OPTION];
    Settings::maybe_upgrade();
    check('a second upgrade run writes nothing new',
        $GLOBALS['t_options'][Settings::OPTION] === $before);
}

echo "\n-- sanitisation rejects bad input rather than storing it --\n";
{
    reset_store();
    $out = Settings::sanitize([
        'color_booked'   => 'javascript:alert(1)',
        'color_past'     => '#ABC',
        'min_nights'     => '9999',
        'cache_ttl'      => '-5',
        'visible_days'   => 'not a number',
        'dow_format'     => 'klingon',
        'show_legend'    => 'yes',
        'evil_key'       => 'payload',
        'staff_capability' => 'read',
    ]);
    $d = Settings::defaults();
    check('a colour that is not a hex colour falls back to the default, never to the input',
        $out['color_booked'] === $d['color_booked'], $out['color_booked']);
    check('a three-digit hex is accepted', $out['color_past'] === '#ABC', $out['color_past']);
    check('an out-of-range number is clamped, not stored',
        $out['min_nights'] === 30, $out['min_nights']);
    check('a negative where the floor is 0 is clamped to 0',
        $out['cache_ttl'] === 0, $out['cache_ttl']);
    check('a non-numeric number falls back to the default',
        $out['visible_days'] === $d['visible_days'], $out['visible_days']);
    check('an unknown choice falls back to the default',
        $out['dow_format'] === $d['dow_format'], $out['dow_format']);
    check('a capability that is not on the list is refused — this one gates guest PII',
        $out['staff_capability'] === $d['staff_capability'], $out['staff_capability']);
    check('a key the schema does not declare is DROPPED, not stored',
        !array_key_exists('evil_key', $out), array_keys($out));
    check('the sanitised array contains exactly the schema keys',
        array_keys($out) === array_keys($d));
}

echo "\n-- an unchecked box means OFF, not 'leave it alone' --\n";
{
    reset_store();
    // An unchecked checkbox posts NOTHING. If absence meant "keep the
    // default", a switch that ships ON could never be turned off.
    $out = Settings::sanitize(['color_booked' => '#123456']);
    check('a switch that ships ON is stored OFF when its box is absent',
        $out['show_legend'] === false, $out['show_legend']);
    $out = Settings::sanitize(['show_legend' => '1']);
    check('...and ON when it is present', $out['show_legend'] === true);
}

echo "\n-- a hostile or corrupt stored row cannot reach the page --\n";
{
    reset_store([Settings::OPTION => [
        'color_booked' => '#fff"><script>alert(1)</script>',
        'cache_ttl'    => ['an', 'array'],
        'show_legend'  => 'maybe',
    ]]);
    $all = Settings::all();
    check('a stored colour is re-validated on READ, not trusted because it is in the database',
        $all['color_booked'] === Settings::defaults()['color_booked'], $all['color_booked']);
    check('a stored array where an int belongs falls back to the default',
        $all['cache_ttl'] === Settings::defaults()['cache_ttl'], $all['cache_ttl']);
    check('a stored non-boolean reads as false rather than as truthy junk',
        $all['show_legend'] === false, $all['show_legend']);
    check('and nothing of it reaches the emitted CSS',
        !str_contains(Settings::tokens_css(), '<script'), Settings::tokens_css());
}

echo "\n-- the token block costs nothing until a colour is actually changed --\n";
{
    reset_store([Settings::OPTION => Settings::defaults()]);
    check('every value at its default emits ZERO bytes',
        Settings::tokens_css() === '', Settings::tokens_css());

    reset_store([Settings::OPTION => ['color_booked' => '#123456']]);
    $css = Settings::tokens_css();
    check('one changed colour emits one declaration, not the whole palette',
        substr_count($css, '--') === 1, $css);
    check('...on the portal-safe selectors, so it survives the popup moving to <body>',
        str_contains($css, '.mphbac-root,.mphbac-sheet,.mphbac-info-sheet'), $css);
    check('...and it is small', strlen($css) < 120, strlen($css));

    reset_store([Settings::OPTION => ['staff_nav_bg' => '#123456']]);
    $css = Settings::tokens_css();
    check('a staff colour lands on the staff roots, not the public ones',
        str_contains($css, '.mphbac-staff,.mphbac-staff-sheet,.mphbac-staff-overlay')
        && !str_contains($css, '.mphbac-root'), $css);
}

echo "\n-- get() --\n";
{
    reset_store();
    check('a known key answers', Settings::get('min_nights') === 2);
    check('an unknown key answers null rather than a fatal or a silent ""',
        @Settings::get('no_such_key') === null);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
