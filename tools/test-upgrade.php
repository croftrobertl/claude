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
$still = array_values(array_diff(array_keys(Settings::defaults()), array_keys($after)));
ok($still === [], 'no default key is missing from the stored row', implode(' ', $still));

echo "\n=== a deliberate falsy value is NOT treated as missing ===\n";
$off = Settings::defaults();
$off['subtle'] = 0;          // the owner turned Layer 1 off
$off['guide_effects'] = 0;   // and left the guide undecorated
$GLOBALS['OPTIONS'] = [Settings::OPTION => $off, 'dcc_seasons_version' => '4.0.0'];
run_upgrade();
$after2 = $GLOBALS['OPTIONS'][Settings::OPTION];
ok((int) $after2['subtle'] === 0, 'subtle=0 was not "helpfully" reset to the default 1');
ok((int) $after2['guide_effects'] === 0, 'guide_effects=0 stayed 0');

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
