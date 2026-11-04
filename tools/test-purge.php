<?php
/**
 * DCC Seasons — the cache purge on save (4.16.0), outside WordPress.
 *
 * The Website Director's probe of live (2026-11-04): \SpeedyCache\Delete
 * exists with all_cache(); speedycache_delete_cache() does not; something
 * listens on epc_purge (the host's nginx proxy cache). Until 4.16.0 the
 * purge tried only entry points that do not exist there, so every save said
 * "no page cache could be purged automatically".
 *
 * Each case runs in its own PHP process (a class, once declared, cannot be
 * taken away), drives the REAL Cache_Purge::purge_and_report() and the REAL
 * Settings::purge_notice(), and checks what ran against what the notice says.
 *
 *   php tools/test-purge.php
 *   DCC_PURGE_MUT=nodelete|noepc|liar php tools/test-purge.php   (each must fail)
 *
 * @package DCC_Seasons
 */

$ROOT = __DIR__ . '/../dcc-seasons/includes';

/* ---- one case, in a child process ---- */
if (($argv[1] ?? '') === '--case') {
    $case = $argv[2];
    $src = $argv[3];   /* the class file to load: the real one, or a mutated copy */
    define('ABSPATH', 1);
    $GLOBALS['A'] = []; $GLOBALS['T'] = []; $GLOBALS['CALLS'] = [];
    function __($s, $d = null) { return $s; }
    function esc_html__($s, $d = null) { return $s; }
    function esc_html($s) { return $s; }
    function add_action($t, $f, $p = 10, $n = 1) { $GLOBALS['A'][$t][] = $f; }
    function has_action($t, $f = false) { return !empty($GLOBALS['A'][$t]); }
    function do_action($t, ...$a) { foreach ($GLOBALS['A'][$t] ?? [] as $f) { $f(...$a); } }
    function set_transient($k, $v, $e = 0) { $GLOBALS['T'][$k] = $v; return true; }
    function get_transient($k) { return $GLOBALS['T'][$k] ?? false; }
    function delete_transient($k) { unset($GLOBALS['T'][$k]); return true; }
    function get_current_screen() { return (object) ['id' => 'dcc_page_dcc-seasons']; }
    function apply_filters($t, $v) { return $v; }

    if (strpos($case, 'delete') !== false) {
        eval('namespace SpeedyCache; class Delete { public static function all_cache() { $GLOBALS["CALLS"][] = "Delete::all_cache"; } }');
    }
    if (strpos($case, 'throws') !== false) {
        eval('namespace SpeedyCache; class Delete { public static function all_cache() { throw new \RuntimeException("down"); } }');
    }
    if (strpos($case, 'epc') !== false) {
        add_action('epc_purge', function () { $GLOBALS['CALLS'][] = 'epc_purge'; });
    }
    if (strpos($case, 'oldfn') !== false) {
        eval('function speedycache_clear_cache() { $GLOBALS["CALLS"][] = "speedycache_clear_cache"; }');
    }
    require $src;
    require __DIR__ . '/../dcc-seasons/includes/class-settings.php';
    $r = new ReflectionProperty('DCC_Seasons\Settings', 'hook'); $r->setAccessible(true); $r->setValue(null, 'dcc_page_dcc-seasons');
    DCC_Seasons\Cache_Purge::purge_and_report();
    ob_start(); DCC_Seasons\Settings::purge_notice(); $notice = ob_get_clean();
    echo json_encode(['calls' => $GLOBALS['CALLS'], 'notice' => strip_tags($notice), 'warn' => strpos($notice, 'notice-warning') !== false]);
    exit(0);
}

/* ---- the runner ---- */
$src = $ROOT . '/class-cache-purge.php';
$mut = getenv('DCC_PURGE_MUT') ?: '';
if ($mut) {
    $s = file_get_contents($src);
    $M = [
        /* the purge skips Delete::all_cache */
        'nodelete' => ["\\SpeedyCache\\Delete::all_cache();\n", "/* skipped */\n"],
        /* the purge skips epc_purge */
        'noepc' => ["do_action('epc_purge');", "/* skipped */"],
    ][$mut] ?? null;
    if ($mut === 'liar') {
        /* the notice claims a purge that did not run: the server cache named whether or not anything listens */
        $M = ["if (function_exists('has_action') && has_action('epc_purge')) {", "if (true) {"];
    }
    if (!$M || strpos($s, $M[0]) === false) { fwrite(STDERR, "mutation does not apply: $mut\n"); exit(2); }
    $s = str_replace($M[0], $M[1], $s);
    $src = sys_get_temp_dir() . '/dcc-purge-' . getmypid() . '.php';
    file_put_contents($src, $s);
    echo "  MUTATION: $mut\n";
}
$pass = 0; $fail = 0;
function ok($c, $l, $d = '') { global $pass, $fail; if ($c) { $pass++; echo "    PASS  $l\n"; } else { $fail++; echo "    FAIL  $l — $d\n"; } }
function run($case, $src) {
    $out = shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' --case ' . escapeshellarg($case) . ' ' . escapeshellarg($src) . ' 2>&1');
    $j = json_decode((string) $out, true);
    if (!is_array($j)) { return ['calls' => [], 'notice' => 'ERROR: ' . $out, 'warn' => false]; }
    return $j;
}

echo "  --- live's shape: SpeedyCache\\Delete and an epc_purge listener ---\n";
$r = run('delete+epc', $src);
ok(in_array('Delete::all_cache', $r['calls'], true), 'Delete::all_cache() runs', json_encode($r));
ok(in_array('epc_purge', $r['calls'], true), 'epc_purge fires (the host\'s server cache)', json_encode($r));
ok(array_search('Delete::all_cache', $r['calls']) < array_search('epc_purge', $r['calls']), 'SpeedyCache first, then the server cache', json_encode($r['calls']));
ok(!$r['warn'] && strpos($r['notice'], 'SpeedyCache') !== false && strpos($r['notice'], 'Server cache') !== false, 'the notice names both: "' . trim($r['notice']) . '"', json_encode($r));

echo "  --- only one of them ---\n";
$r = run('delete', $src);
ok($r['calls'] === ['Delete::all_cache'] && strpos($r['notice'], 'Server cache') === false && strpos($r['notice'], 'SpeedyCache') !== false, 'SpeedyCache alone: the notice names SpeedyCache and not the server cache', json_encode($r));
$r = run('epc', $src);
ok($r['calls'] === ['epc_purge'] && strpos($r['notice'], 'Server cache') !== false && strpos($r['notice'], 'SpeedyCache') === false, 'the server cache alone: named alone', json_encode($r));

echo "  --- neither: the honest notice ---\n";
$r = run('none', $src);
ok($r['calls'] === [] && $r['warn'] && strpos($r['notice'], 'no page cache could be purged') !== false, 'nothing to call: "no page cache could be purged automatically", no success claimed', json_encode($r));

echo "  --- a failing Delete, and the older entry points ---\n";
$r = run('throws+epc', $src);
ok(strpos($r['notice'], 'SpeedyCache') === false && strpos($r['notice'], 'Server cache') !== false, 'Delete::all_cache() throws: SpeedyCache is not claimed; the server cache still is', json_encode($r));
$r = run('throws+oldfn', $src);
ok($r['calls'] === ['speedycache_clear_cache'] && strpos($r['notice'], 'speedycache_clear_cache') !== false, 'the older function entry point is still tried as a fallback', json_encode($r));
$r = run('delete+oldfn', $src);
ok($r['calls'] === ['Delete::all_cache'], 'and not tried when Delete::all_cache() already ran (one SpeedyCache purge)', json_encode($r));

echo "  --- the upgrade purges too ---\n";
$pl = file_get_contents($ROOT . '/class-plugin.php');
$i = strpos($pl, 'function maybe_purge_after_upgrade'); $j = strpos($pl, "\n    public function", $i + 10);
$body = substr($pl, $i, $j - $i);
ok(strpos($body, 'Cache_Purge::purge_and_report()') !== false && strpos($pl, "add_action('init', [\$this, 'maybe_purge_after_upgrade']") !== false, 'maybe_purge_after_upgrade() (on init, any request) runs the same purge', '');

if ($mut) { @unlink($src); }
echo "\n$pass passed · $fail failed\n";
exit($fail ? 1 : 0);
