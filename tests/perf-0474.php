<?php
/**
 * THE 0.47.4 PERFORMANCE BUDGET, MEASURED.
 *
 *   php tests/perf-0474.php <plugin_dir> [live|fixture] [--json]
 *
 * One mphbac_query through Ajax::handle(): all 8 cottages, a 3-month window
 * starting today — server time cold (nothing stored), just after a booking
 * change (the availability months gone, as after every booking save and
 * iCal import), and cached (the same request again), and the response body raw and gzipped (level 6, what
 * Apache's mod_deflate sends by default). Run it against 0.47.3 (git archive
 * e515faf) and against this checkout; the budget is +10 ms and +2 KB gzipped
 * for the CACHED response.
 *
 * The database is SQLite in memory (tests/sqlite-wpdb.php) and storage is
 * in-memory too, for both versions alike, so the numbers are this plugin's
 * PHP — not MySQL's round trips, which add the same to both. MotoPress's own
 * rule engine sits behind mphb_availability_facade() (tests/vendor); 0.47.3
 * never calls it.
 *
 * "live" is the site's rules as read on 2026-10-17 by the WD: one 2-night
 * minimum for every cottage and season, nothing else, and live's four
 * seasons. "fixture" adds every kind of rule the release handles.
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/sqlite-wpdb.php';
$args = array_slice($argv, 1);
$ROOT = realpath($args[0] ?? (dirname(__DIR__) . '/mphb-availability-calendar'));
$MODE = in_array('fixture', $args, true) ? 'fixture' : 'live';
$JSON = in_array('--json', $args, true);

$db = new T_SQLite_WPDB();
$GLOBALS['wpdb'] = $db;
$db->create_blocks_table();
$db->create_custom_rules_table();
require __DIR__ . '/mphb-rules-harness.php';

$GLOBALS['t_tr'] = [];
function get_transient($k) { $v = $GLOBALS['t_tr'][$k] ?? null; return $v === null ? false : $v[0]; }
function set_transient($k, $v, $t) { $GLOBALS['t_tr'][$k] = [$v, $t]; return true; }
function delete_transient($k) { unset($GLOBALS['t_tr'][$k]); return true; }
final class T_Json extends \Exception { public $payload; }
function wp_send_json_success($d = null, $c = null) { $e = new T_Json('ok'); $e->payload = ['success' => true, 'data' => $d]; throw $e; }
function wp_send_json_error($d = null, $c = null) { $e = new T_Json('err'); $e->payload = ['success' => false, 'data' => $d]; throw $e; }
if (!function_exists('nocache_headers')) { function nocache_headers() {} }
if (!function_exists('wp_unslash')) { function wp_unslash($v) { return $v; } }
if (!defined('MPHBAC_AJAX_ACTION')) { define('MPHBAC_AJAX_ACTION', 'mphbac_query'); }

foreach (['class-settings.php', 'class-cache.php', 'class-booking-rules.php', 'class-data-provider.php', 'class-ajax.php'] as $f) {
    if (is_file("$ROOT/includes/$f")) { require "$ROOT/includes/$f"; }
}
use MPHBAC\Ajax;
use MPHBAC\Data_Provider;

// ---- 8 cottages, one room each, bookings over the window -----------------
$types = [3043, 3196, 3254, 3265, 3293, 3301, 3305, 3312];
foreach ($types as $n => $t) {
    t_post($t, 'mphb_room_type', 'publish', 'Cottage ' . (22 + $n) . ': Test ' . $n);
    $db->post($t * 10, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $t]);
}
$today = Data_Provider::today();
mt_srand(474);
$id = 100000;
foreach ($types as $t) {
    for ($d = -20; $d < 140;) {
        $len = mt_rand(2, 9);
        if (mt_rand(0, 9) < 6) {
            $b = ++$id;
            $db->post($b, 'mphb_booking', 'confirmed', 0, ['mphb_check_in_date' => $today->modify("+$d days")->format('Y-m-d'),
                'mphb_check_out_date' => $today->modify('+' . ($d + $len) . ' days')->format('Y-m-d')] + (mt_rand(0, 2) ? [] : ['_mphb_sync_id' => 'ical' . $b]));
            $db->post(++$id, 'mphb_reserved_room', 'publish', $b, ['_mphb_room_id' => $t * 10]);
        }
        $d += $len + mt_rand(0, 3);
    }
}
foreach ([[2080, '2025-12-31', '2027-03-31'], [2082, '2025-04-15', '2025-12-15'], [2079, '2024-12-15', '2025-04-15'], [2081, '2024-04-15', '2024-12-15']] as [$sid, $a, $b]) {
    t_mphb_season($sid, $a, $b);
}
$GLOBALS['t_options']['mphb_min_stay_length'] = [['season_ids' => [0], 'room_type_ids' => [0], 'min_stay_length' => 2]];
if ($MODE === 'fixture') {
    $GLOBALS['t_options']['mphb_check_in_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'check_in_days' => [0, 1, 3, 4, 5, 6]]];
    $GLOBALS['t_options']['mphb_min_stay_length'] = [['season_ids' => [2080], 'room_type_ids' => [0], 'min_stay_length' => 3],
        ['season_ids' => [0], 'room_type_ids' => [0], 'min_stay_length' => 2]];
    $GLOBALS['t_options']['mphb_max_stay_length'] = [['season_ids' => [0], 'room_type_ids' => [0], 'max_stay_length' => 14]];
    $GLOBALS['t_options']['mphb_buffer_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'buffer_days' => 1]];
    $GLOBALS['t_options']['mphb_min_advance_reservation'] = [['season_ids' => [0], 'room_type_ids' => [0], 'min_advance_reservation' => 1]];
}

$post = ['room_type_ids' => array_map('strval', $types), 'from' => $today->format('Y-m-d'),
    'to' => $today->modify('+3 months -1 day')->format('Y-m-d')];
$call = static function () use ($post): array {
    $_POST = $post;
    try { Ajax::handle(); } catch (T_Json $j) { return $j->payload; }
    throw new \RuntimeException('no answer');
};
$wipe = static function (): void {
    $GLOBALS['t_tr'] = [];
    foreach (array_keys($GLOBALS['t_options']) as $k) {
        if (strpos($k, 'mphbac_') === 0) { unset($GLOBALS['t_options'][$k]); }
    }
    t_mphb_new_request();
};
if (getenv('PERF_SETUP_ONLY')) { return; }   // a profiler script continues from here
$median = static function (array $xs): float { sort($xs); return $xs[intdiv(count($xs), 2)]; };

$call(); // warm PHP itself (opcache-less autoload of the classes)
$cold = []; $hot = []; $booking = [];
for ($i = 0; $i < 25; $i++) {
    $wipe();
    $t = hrtime(true); $r = $call(); $cold[] = (hrtime(true) - $t) / 1e6;
    // A guest books (or the iCal sync imports): the main generation moves,
    // the stored months go cold — and in 0.47.4 the stored rules do not.
    \MPHBAC\Cache::flush_all();
    t_mphb_new_request();
    $t = hrtime(true); $call(); $booking[] = (hrtime(true) - $t) / 1e6;
    for ($k = 0; $k < 4; $k++) {
        t_mphb_new_request();
        $t = hrtime(true); $r = $call(); $hot[] = (hrtime(true) - $t) / 1e6;
    }
}
$body = json_encode($r);
$out = [
    'version' => basename(dirname($ROOT)) . '/' . (preg_match("/'MPHBAC_VERSION',\\s*'([^']+)'/", (string) file_get_contents("$ROOT/mphb-availability-calendar.php"), $m) ? $m[1] : '?'),
    'mode' => $MODE, 'cold_ms' => round($median($cold), 2), 'after_booking_ms' => round($median($booking), 2), 'cached_ms' => round($median($hot), 2),
    'raw_bytes' => strlen($body), 'gzip_bytes' => strlen(gzencode($body, 6)), 'success' => $r['success'] ?? null,
    'days' => count(reset($r['data']['availability'])), 'has_rules' => isset($r['data']['rules']),
];
if ($JSON) { echo json_encode($out), "\n"; exit(0); }
foreach ($out as $k => $v) { printf("%-11s %s\n", $k, is_bool($v) ? var_export($v, true) : $v); }
