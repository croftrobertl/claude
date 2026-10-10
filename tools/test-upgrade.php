<?php
/**
 * DCC Seasons — the stored options row must describe reality after an upgrade.
 *
 * options() merges defaults on every read, so a key missing from the stored
 * row has never broken anything at runtime. That is good defensive design
 * and it is also why this went unnoticed: on the live site the 4.0.0 row was
 * still missing placement, subtle, subtle_intensity and subtle_map days
 * after the upgrade, because the row only gains a release's new keys when
 * someone opens the settings page and saves.
 *
 * The risk is not today's behaviour, it is tomorrow's: anything reading the
 * option directly — a migration, an export, a future getter that forgets to
 * merge — sees a feature as absent while it is running.
 *
 * Also proves the other half: the merge only ADDS. An upgrade that quietly
 * reset a choice the owner had made would be far worse than a missing key.
 *
 * Usage: php tools/test-upgrade.php
 *
 * @package DCC_Seasons
 */

define('ABSPATH', 1);
define('DCC_SEASONS_VERSION', '4.1.0');
define('DCC_SEASONS_URL', './');
define('DCC_SEASONS_FILE', __DIR__ . '/../dcc-seasons/dcc-seasons.php');

function __($s, $d = null) { return $s; }
function _n($one, $many, $n, $d = null) { return $n == 1 ? $one : $many; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return $s; }
function esc_attr($s) { return $s; }
function esc_textarea($s) { return $s; }
function apply_filters($tag, $value) { return $value; }
function do_action() {}
function add_action() {}
function add_filter() {}
function did_action() { return false; }
function sanitize_key($k) { return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $k)); }
function sanitize_text_field($v) { return trim(strip_tags((string) $v)); }
function wp_unslash($v) { return $v; }
function absint($v) { return abs((int) $v); }
function wp_parse_args($a, $d) { return array_merge($d, is_array($a) ? $a : []); }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['OPTIONS']) ? $GLOBALS['OPTIONS'][$k] : $d; }
function update_option($k, $v, $a = null) { $GLOBALS['OPTIONS'][$k] = $v; return true; }
function set_transient($k, $v, $t) { return true; }
function get_transient($k) { return false; }
function delete_transient($k) { return true; }
function is_front_page() { return false; }
function is_page($x = '') { return false; }
function is_singular($x = '') { return false; }
function get_queried_object() { return null; }

require __DIR__ . '/../dcc-seasons/includes/class-schedule.php';
require __DIR__ . '/../dcc-seasons/includes/class-themes.php';
require __DIR__ . '/../dcc-seasons/includes/class-settings.php';
require __DIR__ . '/../dcc-seasons/includes/class-cache-purge.php';
require __DIR__ . '/../dcc-seasons/includes/class-plugin.php';

use DCC_Seasons\Plugin;
use DCC_Seasons\Settings;
use DCC_Seasons\Themes;

$pass = 0;
$fail = 0;
$problems = [];

function ok(bool $cond, string $label, string $detail = ''): void {
    global $pass, $fail, $problems;
    if ($cond) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; $problems[] = $label . ($detail ? " — $detail" : ''); echo "  FAIL  $label" . ($detail ? " — $detail" : '') . "\n"; }
}

function run_upgrade(): void {
    $ref = new \ReflectionClass(Plugin::class);
    $m = $ref->getMethod('maybe_purge_after_upgrade');
    $m->setAccessible(true);
    $m->invoke($ref->newInstanceWithoutConstructor());
}

/* ---- The live row, reproduced: 4.0.0's four new keys are absent. ---- */
$live = Settings::defaults();
$missing = ['placement', 'subtle', 'subtle_intensity', 'subtle_map'];
foreach ($missing as $k) { unset($live[$k]); }
/* ...and two choices the owner made, which must survive untouched. */
$live['scope']    = 'no_cottages';
$live['layering'] = 'front';
$live['density']  = 16;

$GLOBALS['OPTIONS'] = [
    Settings::OPTION => $live,
    'dcc_seasons_version' => '4.0.0',
];

echo "=== before ===\n";
foreach ($missing as $k) {
    echo "  stored['$k'] : " . (array_key_exists($k, $live) ? 'present' : 'ABSENT') . "\n";
}

run_upgrade();
$after = $GLOBALS['OPTIONS'][Settings::OPTION];

echo "\n=== after the upgrade routine ===\n";
foreach ($missing as $k) {
    ok(array_key_exists($k, $after), "stored row now carries '$k'");
}

echo "\n=== the owner's choices are untouched ===\n";
ok($after['scope'] === 'no_cottages', "scope stayed 'no_cottages'", (string) ($after['scope'] ?? 'gone'));
ok($after['layering'] === 'front', "layering stayed 'front'", (string) ($after['layering'] ?? 'gone'));
ok((int) $after['density'] === 16, 'density stayed 16', (string) ($after['density'] ?? 'gone'));

echo "\n=== every default key is now present ===\n";
$still = array_values(array_diff(array_keys(Settings::defaults()), array_keys($after), Settings::TRACKED_DEFAULTS));
ok($still === [], 'no default key is missing from the stored row (TRACKED_DEFAULTS aside)', implode(' ', $still));
$tracked = array_values(array_intersect(Settings::TRACKED_DEFAULTS, array_keys($after)));
ok($tracked === [], 'TRACKED_DEFAULTS are never written back as "missing" keys', implode(' ', $tracked));

echo "\n=== a deliberate falsy value is NOT treated as missing ===\n";
$off = Settings::defaults();
$off['subtle'] = 0;          // the owner turned Layer 1 off
$off['guide_effects'] = 0;   // and left the guide undecorated
$GLOBALS['OPTIONS'] = [Settings::OPTION => $off, 'dcc_seasons_version' => '4.0.0'];
run_upgrade();
$after2 = $GLOBALS['OPTIONS'][Settings::OPTION];
ok((int) $after2['subtle'] === 0, 'subtle=0 was not "helpfully" reset to the default 1');
ok((int) $after2['guide_effects'] === 0, 'guide_effects=0 stayed 0');

/* ---- 4.7.0: the egg's tap target and count are Rob's, in the DEFAULTS. ---- */
echo "\n=== 4.7.0: stored tap_selector / tap_count equal to the new defaults are cleared ===\n";
$d = Settings::defaults();
ok($d['tap_selector'] === '.home #header-page-title .entry-title' && $d['tap_count'] === 4,
    'defaults: ".home #header-page-title .entry-title", 4 (Rob, 2026-10-10)', json_encode([$d['tap_selector'], $d['tap_count']]));
/* The live row on 2026-10-10: the Director stored exactly the new values
 * (count possibly as a string), plus Rob's other choices. */
$row = $live;
$row['tap_selector'] = ' .home #header-page-title .entry-title ';
$row['tap_count']    = '4';
$row['scope']        = 'no_cottages';
$GLOBALS['OPTIONS'] = [Settings::OPTION => $row, 'dcc_seasons_version' => '4.6.2'];
run_upgrade();
$a3 = $GLOBALS['OPTIONS'][Settings::OPTION];
ok(!array_key_exists('tap_selector', $a3) && !array_key_exists('tap_count', $a3), 'both stored keys cleared', json_encode(array_intersect_key($a3, array_flip(Settings::TRACKED_DEFAULTS))));
$eff = Settings::options();
ok($eff['tap_selector'] === $d['tap_selector'] && (int) $eff['tap_count'] === 4, 'options() now supplies the defaults');
ok($a3['scope'] === 'no_cottages' && (int) $a3['density'] === 16 && $a3['layering'] === 'front', 'nothing else in the row moved');

/* A value the owner chose that DIFFERS is never touched, by the upgrade or by a save. */
$own = $live;
$own['tap_selector'] = '#custom-target';
$own['tap_count']    = 6;
$GLOBALS['OPTIONS'] = [Settings::OPTION => $own, 'dcc_seasons_version' => '4.6.2'];
run_upgrade();
$a4 = $GLOBALS['OPTIONS'][Settings::OPTION];
ok(($a4['tap_selector'] ?? '') === '#custom-target' && (int) ($a4['tap_count'] ?? 0) === 6, 'different values survive the upgrade', json_encode([$a4['tap_selector'] ?? null, $a4['tap_count'] ?? null]));
$mixed = $live;
$mixed['tap_selector'] = '#custom-target';
$mixed['tap_count']    = 4;
$GLOBALS['OPTIONS'] = [Settings::OPTION => $mixed, 'dcc_seasons_version' => '4.6.2'];
run_upgrade();
$a5 = $GLOBALS['OPTIONS'][Settings::OPTION];
ok(($a5['tap_selector'] ?? '') === '#custom-target' && !array_key_exists('tap_count', $a5), 'each key is judged on its own');

echo "\n=== a settings SAVE stores them only when they differ ===\n";
$posted = ['enabled' => 1, 'egg' => 1, 'tap_selector' => '.home #header-page-title .entry-title', 'tap_count' => '4'];
$saved = Settings::sanitize($posted);
ok(!array_key_exists('tap_selector', $saved) && !array_key_exists('tap_count', $saved), 'saving the defaults stores neither key', json_encode(array_intersect_key($saved, array_flip(Settings::TRACKED_DEFAULTS))));
$saved2 = Settings::sanitize(['tap_selector' => '#custom-target', 'tap_count' => '6'] + $posted);
ok(($saved2['tap_selector'] ?? '') === '#custom-target' && ($saved2['tap_count'] ?? 0) === 6, 'saving different values stores both');
$saved3 = Settings::sanitize(['tap_selector' => ''] + $posted);
ok(!array_key_exists('tap_selector', $saved3), 'an emptied selector falls back to the default and is not stored');

echo "\n=== the instructions follow the settings ===\n";
ok(Settings::egg_howto($d) === 'Tap the title in the homepage banner 4 times', 'default: "' . Settings::egg_howto($d) . '"');
ok(Settings::egg_howto(['tap_selector' => '#x', 'tap_count' => 6]) === 'Tap the element matching #x 6 times', 'custom: "' . Settings::egg_howto(['tap_selector' => '#x', 'tap_count' => 6]) . '"');

/* ---- The other half of the same question: does every theme resolve? ---- */
echo "\n=== all 27 themes resolve to a subtle effect ===\n";
$map = Settings::subtle_map($live);          // the row WITHOUT subtle_map
$themes = array_keys(Themes::themes());
printf("  %-16s %-12s %s\n", 'THEME', 'EFFECT', 'SOURCE');
echo '  ' . str_repeat('-', 48) . "\n";
$none = [];
foreach ($themes as $t) {
    if (!array_key_exists($t, $map)) { $none[] = $t; $eff = '** MISSING **'; }
    elseif ($map[$t] === '') { $eff = '(none — deliberate)'; }
    else { $eff = $map[$t]; }
    printf("  %-16s %-12s %s\n", $t, $eff, isset($live['subtle_map'][$t]) ? 'owner' : 'plugin default');
}
ok($none === [], 'every theme has an entry even with subtle_map absent from the row', implode(' ', $none));
ok(count($map) === count($themes), 'the map covers exactly the themes that exist',
    count($map) . ' vs ' . count($themes));

$exceptions = ['valentines' => 'hearts', 'new_years' => 'confetti', 'halloween' => 'embers',
               'july4' => 'sparks', 'christmas' => 'bokeh'];
$wrong = [];
foreach ($exceptions as $theme => $want) {
    if (($map[$theme] ?? null) !== $want) { $wrong[] = "$theme=" . ($map[$theme] ?? 'none'); }
}
ok($wrong === [], 'all five bespoke exceptions resolve', implode(' ', $wrong));

$effects = Settings::subtle_effects();
$unknown = [];
foreach ($map as $theme => $eff) {
    if ($eff !== '' && !isset($effects[$eff])) { $unknown[] = "$theme=>$eff"; }
}
ok($unknown === [], 'no theme maps to an effect the engine does not implement', implode(' ', $unknown));

echo "\n$pass passed · $fail failed\n";
if ($fail) {
    foreach ($problems as $p) { echo "  - $p\n"; }
    exit(1);
}
