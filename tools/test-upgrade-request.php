<?php
/**
 * DCC Seasons — 4.13.6: the upgrade reaches an install that never visits
 * wp-admin (the Director, 2026-10-30). Until 4.13.5 the stored schedule was
 * brought forward only on admin_init, so after a WP-CLI install on staging
 * the version option stayed at 4.13.1 and 11 Nov resolved to Thanksgiving
 * until he ran the upgrade by hand; an auto-update or an FTP drop would
 * have left the Anniversary silently missing.
 *
 * Loads the plugin's REAL bootstrap (dcc-seasons.php) on a small fake
 * WordPress that records hooks, starts from the options a 4.13.1 install
 * stored (its default schedule, taken from git at 64340a4, and version
 * 4.13.1), and fires what a FRONT-END request fires: plugins_loaded, init,
 * never admin_init. Then:
 *  - the version option is the plugin's own; the stored schedule has the
 *    Anniversary's row, once; 11 Nov 2026 resolves to the Anniversary and
 *    the 10th and 12th to Thanksgiving;
 *  - a second request changes nothing (no second row, no rewrite);
 *  - a row the owner deleted in a release AFTER the one that added it is
 *    not brought back (the upgrade is scoped by version);
 *  - the same holds for a cron or WP-CLI request (no admin either).
 * Mutation-checked: DCC_UPG_MUT=admin moves the hook back to admin_init.
 *
 *   php tools/test-upgrade-request.php
 *
 * @package DCC_Seasons
 */

define('ABSPATH', 1);
$ROOT = dirname(__DIR__);
$GLOBALS['HOOKS'] = [];
$GLOBALS['OPTIONS'] = [];
$GLOBALS['WRITES'] = 0;
$GLOBALS['ADMIN'] = false;

function __($s, $d = null) { return $s; }
function _n($one, $many, $n, $d = null) { return $n == 1 ? $one : $many; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return $s; }
function esc_attr($s) { return $s; }
function apply_filters($tag, $value) { return $value; }
function add_action($tag, $fn, $prio = 10) { $GLOBALS['HOOKS'][$tag][] = [$prio, $fn]; }
function add_filter($tag, $fn, $prio = 10) { add_action($tag, $fn, $prio); }
function do_action($tag) {
    $h = $GLOBALS['HOOKS'][$tag] ?? [];
    usort($h, fn($a, $b) => $a[0] <=> $b[0]);
    foreach ($h as [$p, $fn]) { $fn(); }
}
function did_action($t) { return false; }
function is_admin() { return (bool) $GLOBALS['ADMIN']; }
function plugin_dir_path($f) { return dirname($f) . '/'; }
function plugin_dir_url($f) { return 'https://example.test/wp-content/plugins/dcc-seasons/'; }
function plugin_basename($f) { return 'dcc-seasons/dcc-seasons.php'; }
function register_activation_hook($f, $cb) {}
function register_deactivation_hook($f, $cb) {}
function load_plugin_textdomain() { return true; }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['OPTIONS']) ? $GLOBALS['OPTIONS'][$k] : $d; }
function update_option($k, $v, $a = null) { if (($GLOBALS['OPTIONS'][$k] ?? null) !== $v) { $GLOBALS['WRITES']++; } $GLOBALS['OPTIONS'][$k] = $v; return true; }
function set_transient($k, $v, $t) { return true; }
function get_transient($k) { return false; }
function delete_transient($k) { return true; }
function sanitize_key($k) { return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $k)); }
function sanitize_text_field($v) { return trim(strip_tags((string) $v)); }
function wp_unslash($v) { return $v; }

$pass = 0; $fail = 0; $problems = [];
function ok(bool $c, string $label, string $detail = ''): void {
    global $pass, $fail, $problems;
    if ($c) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; $problems[] = $label . ($detail ? " — $detail" : ''); echo "  FAIL  $label" . ($detail ? " — $detail" : '') . "\n"; }
}

/* the plugin's bootstrap, as WordPress loads it; under the mutation, the
 * upgrade hooked on admin_init again (4.13.5's wiring) */
$boot = file_get_contents("$ROOT/dcc-seasons/dcc-seasons.php");
$plugin = file_get_contents("$ROOT/dcc-seasons/includes/class-plugin.php");
if (getenv('DCC_UPG_MUT') === 'admin') {
    $plugin = str_replace("add_action('init', [\$this, 'maybe_purge_after_upgrade'], 20);", "if (is_admin()) { add_action('admin_init', [\$this, 'maybe_purge_after_upgrade'], 1); }", $plugin, $n);
    if (!$n) { fwrite(STDERR, "mutation did not apply\n"); exit(2); }
}
$tmp = sys_get_temp_dir() . '/dcc-upg-' . getmypid();
@mkdir("$tmp/includes", 0777, true);
foreach (glob("$ROOT/dcc-seasons/includes/*.php") as $f) { copy($f, "$tmp/includes/" . basename($f)); }
file_put_contents("$tmp/includes/class-plugin.php", $plugin);
/* a version later than any real one, so every case below is a real
 * upgrade (from 4.13.1, and from 4.13.5) whatever the plugin's own is */
$VERSION = '4.13.99';
$boot = preg_replace("/define\('DCC_SEASONS_VERSION', '[^']+'\)/", "define('DCC_SEASONS_VERSION', '$VERSION')", $boot, 1, $nv);
if (!$nv) { fwrite(STDERR, "no version define\n"); exit(2); }
file_put_contents("$tmp/dcc-seasons.php", $boot);

/* what a 4.13.1 install stored: its default schedule (from git), version
 * 4.13.1, and the settings row the settings page saved */
$old = shell_exec('git -C ' . escapeshellarg($ROOT) . ' show 64340a4:dcc-seasons/includes/class-schedule.php');
$old = str_replace('namespace DCC_Seasons;', 'namespace DCC_Seasons_4131;', $old);
file_put_contents("$tmp/old-schedule.php", $old);
require "$tmp/old-schedule.php";
$rows4131 = \DCC_Seasons_4131\Schedule::defaults();
ok(!in_array('anniversary', array_column($rows4131, 'theme'), true), "4.13.1's stored schedule has no Anniversary row (" . count($rows4131) . ' rows)');

require "$tmp/dcc-seasons.php";
use DCC_Seasons\Plugin;
use DCC_Seasons\Settings;
use DCC_Seasons\Schedule;

function fresh_4131(array $rows): void {
    $GLOBALS['OPTIONS'] = [
        Plugin::VERSION_OPTION => '4.13.1',
        Settings::OPTION       => array_merge(Settings::defaults(), ['schedule' => $rows]),
    ];
}
function request(): void {
    /* a front-end page, a cron run or a WP-CLI command: no admin */
    $GLOBALS['HOOKS'] = [];
    $r = new ReflectionClass(Plugin::class);
    $p = $r->getProperty('instance'); $p->setAccessible(true); $p->setValue(null, null);
    \DCC_Seasons\Plugin::instance()->boot();
    do_action('init');
    do_action('wp_loaded');
}
function day(string $d): string {
    $row = Schedule::active(get_option(Settings::OPTION)['schedule'], $d);
    return is_array($row) ? (string) $row['theme'] : '(none)';
}

echo "=== a front-end request after the files change, wp-admin never visited ===\n";
fresh_4131($rows4131);
ok(day('2026-11-11') === 'thanksgiving', 'before: 11 Nov 2026 resolves to Thanksgiving (the staging symptom)', day('2026-11-11'));
request();
$rows = get_option(Settings::OPTION)['schedule'];
ok(get_option(Plugin::VERSION_OPTION) === $VERSION, "the version option is now $VERSION", (string) get_option(Plugin::VERSION_OPTION));
ok(count(array_keys(array_column($rows, 'theme'), 'anniversary')) === 1, 'the stored schedule has the Anniversary row, once', json_encode(array_column($rows, 'theme')));
foreach (['2026-11-10' => 'thanksgiving', '2026-11-11' => 'anniversary', '2026-11-12' => 'thanksgiving', '2027-11-11' => 'anniversary'] as $d => $want) {
    ok(day($d) === $want, "$d resolves to $want", day($d));
}

echo "\n=== a second request changes nothing ===\n";
$before = $GLOBALS['OPTIONS']; $GLOBALS['WRITES'] = 0;
request();
ok($GLOBALS['OPTIONS'] === $before && $GLOBALS['WRITES'] === 0, 'no write, no second row', 'writes ' . $GLOBALS['WRITES']);

echo "\n=== a row the owner deleted after it was added stays deleted ===\n";
/* the owner deleted the row while on 4.13.5; then the next upgrade */
$opt = get_option(Settings::OPTION);
$opt['schedule'] = array_values(array_filter($opt['schedule'], fn($r) => ($r['theme'] ?? '') !== 'anniversary'));
$GLOBALS['OPTIONS'][Settings::OPTION] = $opt;
$GLOBALS['OPTIONS'][Plugin::VERSION_OPTION] = '4.13.5';
request();
ok(get_option(Plugin::VERSION_OPTION) === $VERSION && !in_array('anniversary', array_column(get_option(Settings::OPTION)['schedule'], 'theme'), true), "the upgrade from 4.13.5 to $VERSION ran and did not bring the Anniversary back", json_encode(array_column(get_option(Settings::OPTION)['schedule'], 'theme')));

echo "\n=== wp-admin still upgrades too ===\n";
fresh_4131($rows4131);
$GLOBALS['ADMIN'] = true;
request();   /* init runs in wp-admin too (admin_init also fires the settings page, which this fake has no WordPress for) */
$GLOBALS['ADMIN'] = false;
ok(day('2026-11-11') === 'anniversary' && get_option(Plugin::VERSION_OPTION) === $VERSION, 'an admin request: the Anniversary on 11 Nov, the version current', day('2026-11-11'));

array_map('unlink', glob("$tmp/includes/*.php")); @rmdir("$tmp/includes"); @unlink("$tmp/dcc-seasons.php"); @unlink("$tmp/old-schedule.php"); @rmdir($tmp);
echo "\n$pass passed · $fail failed" . (getenv('DCC_UPG_MUT') ? ' (MUTATION: ' . getenv('DCC_UPG_MUT') . ')' : '') . "\n";
if ($fail) { foreach ($problems as $p) { echo "  - $p\n"; } exit(1); }
