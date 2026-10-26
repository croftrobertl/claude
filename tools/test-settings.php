<?php
/**
 * DCC Seasons — the options sanitiser round-trips, outside WordPress.
 *
 * The sanitiser is the only thing standing between a POSTed form and an
 * option array that is shipped to every visitor as JSON, so a key it lets
 * through unchecked is a key that reaches the browser. This asserts the
 * shape it produces rather than that it ran.
 *
 * Usage: php tools/test-settings.php
 *
 * @package DCC_Seasons
 */

define('ABSPATH', 1);

if (!function_exists('__')) {
    function __($s, $d = null) { return $s; }
}
if (!function_exists('esc_html__')) {
    function esc_html__($s, $d = null) { return $s; }
}
if (!function_exists('apply_filters')) {
    function apply_filters($tag, $value) { return $value; }
}
if (!function_exists('sanitize_key')) {
    function sanitize_key($k) { return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $k)); }
}
if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($v) { return trim(strip_tags((string) $v)); }
}
if (!function_exists('wp_unslash')) {
    function wp_unslash($v) { return $v; }
}
if (!function_exists('absint')) {
    function absint($v) { return abs((int) $v); }
}

require __DIR__ . '/../dcc-seasons/includes/class-schedule.php';
require __DIR__ . '/../dcc-seasons/includes/class-themes.php';
require __DIR__ . '/../dcc-seasons/includes/class-settings.php';

use DCC_Seasons\Settings;
use DCC_Seasons\Themes;

$pass = 0;
$fail = 0;
$problems = [];

function ok(bool $cond, string $label, string $detail = ''): void {
    global $pass, $fail, $problems;
    if ($cond) {
        $pass++;
        echo "  PASS  $label\n";
    } else {
        $fail++;
        $problems[] = $label . ($detail ? " — $detail" : '');
        echo "  FAIL  $label" . ($detail ? " — $detail" : '') . "\n";
    }
}

$d = Settings::defaults();

echo "=== defaults ===\n";
ok(isset($d['subtle']) && $d['subtle'] === 1, 'subtle layer is on by default');
ok(isset($d['subtle_intensity']) && abs($d['subtle_intensity'] - 0.6) < 0.001, 'default intensity is 0.6');
ok(isset($d['subtle_map']) && $d['subtle_map'] === [], 'no per-theme overrides by default');

echo "\n=== the built-in map covers every theme ===\n";
$map    = Themes::subtle_defaults();
$themes = array_keys(Themes::themes());
$missing = array_values(array_diff($themes, array_keys($map)));
ok($missing === [], 'every theme has a subtle effect', implode(' ', $missing));

$fx = Settings::subtle_effects();
$bad = [];
foreach ($map as $theme => $eff) {
    if ($eff !== '' && !isset($fx[$eff])) {
        $bad[] = "$theme=>$eff";
    }
}
ok($bad === [], 'every mapped effect is one the engine implements', implode(' ', $bad));

echo "\n=== sanitiser ===\n";
$clean = Settings::sanitize([
    'subtle'           => '1',
    'subtle_intensity' => '0.8',
    'subtle_map'       => [
        'halloween'   => 'bokeh',     // valid re-point
        'christmas'   => '',          // valid "none"
        'valentines'  => 'nonsense',  // unknown effect -> dropped
        'not_a_theme' => 'bokeh',     // unknown theme  -> dropped
    ],
]);
ok($clean['subtle'] === 1, 'subtle checkbox survives');
ok(abs($clean['subtle_intensity'] - 0.8) < 0.001, 'intensity survives');
ok(($clean['subtle_map']['halloween'] ?? null) === 'bokeh', 'a valid re-point is kept');
ok(array_key_exists('christmas', $clean['subtle_map']) && $clean['subtle_map']['christmas'] === '',
    '"none" is kept — it is a real choice, not an empty field');
ok(!array_key_exists('valentines', $clean['subtle_map']), 'an unknown EFFECT is dropped');
ok(!array_key_exists('not_a_theme', $clean['subtle_map']), 'an unknown THEME is dropped');

$clamped = Settings::sanitize(['subtle_intensity' => '9']);
ok(abs($clamped['subtle_intensity'] - 1.0) < 0.001, 'intensity is clamped to 1');
$clamped2 = Settings::sanitize(['subtle_intensity' => '-3']);
ok(abs($clamped2['subtle_intensity']) < 0.001, 'intensity is clamped to 0');
$off = Settings::sanitize([]);
ok($off['subtle'] === 0, 'an absent checkbox means off, as HTML forms require');

echo "\n=== the stored map is OVERRIDES ONLY, even after a full-form save ===\n";
/* The settings form posts a value for every one of the 27 themes on every
 * save. Before 4.1.3 the sanitiser kept all of them, so one Save turned the
 * stored map into a full copy that pinned every theme to that day's plugin
 * default — and "an untouched theme keeps tracking the plugin" quietly
 * became false. This reproduces a real save: all 27 as the plugin ships
 * them, plus exactly one deliberate change. */
$full = Themes::subtle_defaults();
$full['halloween'] = 'bokeh';
$saved = Settings::sanitize(['subtle_map' => $full]);
ok(count($saved['subtle_map']) === 1, 'only the ONE changed theme is stored',
    'stored ' . count($saved['subtle_map']) . ' entries: ' . implode(',', array_keys($saved['subtle_map'])));
ok(($saved['subtle_map']['halloween'] ?? null) === 'bokeh', 'and it is the right one');
$untouched = Settings::sanitize(['subtle_map' => Themes::subtle_defaults()]);
ok($untouched['subtle_map'] === [], 'saving the form unchanged stores nothing at all');

echo "\n=== effective map (defaults + overrides) ===\n";
$eff = Settings::subtle_map(['subtle_map' => ['halloween' => 'bokeh']]);
ok($eff['halloween'] === 'bokeh', 'the override wins');
ok($eff['christmas'] === 'bokeh', 'an untouched theme keeps tracking the plugin');
ok(count($eff) === count($themes), 'the effective map still covers every theme');

echo "\n=== no snow anywhere (4.2.0) ===\n";
ok(!isset($fx['snow']), 'the Snow choice is gone from the dropdown');
foreach (['sunglow', 'goldlight', 'mardiconfetti', 'orangeblossom'] as $e) {
    ok(isset($fx[$e]), "the named choice '$e' exists");
}
$want = ['snowbird' => 'sunglow', 'mlk' => 'goldlight', 'mardi_gras' => 'mardiconfetti', 'presidents' => 'orangeblossom', 'christmas' => 'bokeh'];
foreach ($want as $t => $e) {
    ok($map[$t] === $e, "$t defaults to $e (Rob's pick)", "got {$map[$t]}");
}
ok(!in_array('snow', $map, true), 'no theme defaults to snow');
/* Rob's live options still carry what an older release stored. They are
 * IGNORED on read — never rewritten. */
$legacy = ['subtle_map' => ['snowbird' => 'snow', 'mlk' => 'snow', 'halloween' => 'embers'], 'fx_snow' => 1];
$eff2 = Settings::subtle_map($legacy);
ok($eff2['snowbird'] === 'sunglow' && $eff2['mlk'] === 'goldlight', 'a stored "snow" falls back to the theme default');
ok($eff2['halloween'] === 'embers', 'a stored valid override still wins');
ok(!array_key_exists('fx_snow', $d), 'fx_snow is no longer a setting');
$cleaned = Settings::sanitize(['fx_snow' => '1', 'subtle_map' => ['snowbird' => 'snow']]);
ok(!array_key_exists('fx_snow', $cleaned), 'a posted fx_snow is dropped');
ok(!array_key_exists('snowbird', $cleaned['subtle_map']), 'a posted snow override is dropped');
$src = file_get_contents(__DIR__ . '/../dcc-seasons/includes/class-themes.php');
ok(strpos($src, "'snowflake'") === false, 'no theme names the snowflake sprite');
ok(strpos($src, '❄') === false, 'no ❄ anywhere in the themes (the Christmas egg now carries H and O)');
$xm = Themes::themes()['christmas']['egg']['glyphs'];
ok(in_array('H', $xm, true) && in_array('O', $xm, true), 'the Christmas egg carries H and O');

echo "\n$pass passed · $fail failed\n";
if ($fail) {
    foreach ($problems as $p) {
        echo "  - $p\n";
    }
    exit(1);
}
