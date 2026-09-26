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
        'halloween'   => 'snow',      // valid re-point
        'christmas'   => '',          // valid "none"
        'valentines'  => 'nonsense',  // unknown effect -> dropped
        'not_a_theme' => 'snow',      // unknown theme  -> dropped
    ],
]);
ok($clean['subtle'] === 1, 'subtle checkbox survives');
ok(abs($clean['subtle_intensity'] - 0.8) < 0.001, 'intensity survives');
ok(($clean['subtle_map']['halloween'] ?? null) === 'snow', 'a valid re-point is kept');
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
$full['halloween'] = 'snow';
$saved = Settings::sanitize(['subtle_map' => $full]);
ok(count($saved['subtle_map']) === 1, 'only the ONE changed theme is stored',
    'stored ' . count($saved['subtle_map']) . ' entries: ' . implode(',', array_keys($saved['subtle_map'])));
ok(($saved['subtle_map']['halloween'] ?? null) === 'snow', 'and it is the right one');
$untouched = Settings::sanitize(['subtle_map' => Themes::subtle_defaults()]);
ok($untouched['subtle_map'] === [], 'saving the form unchanged stores nothing at all');

echo "\n=== effective map (defaults + overrides) ===\n";
$eff = Settings::subtle_map(['subtle_map' => ['halloween' => 'snow']]);
ok($eff['halloween'] === 'snow', 'the override wins');
ok($eff['christmas'] === 'bokeh', 'an untouched theme keeps tracking the plugin');
ok(count($eff) === count($themes), 'the effective map still covers every theme');

echo "\n$pass passed · $fail failed\n";
if ($fail) {
    foreach ($problems as $p) {
        echo "  - $p\n";
    }
    exit(1);
}
