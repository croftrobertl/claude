<?php
/**
 * 0.47.3 FIXES 1 AND 2 — WHAT CLOSES A NIGHT, AND HOW MUCH THE CACHE MAY HOLD.
 *
 * The public calendar must never show a closed night as open: that is the
 * most expensive mistake it can make (the WD). This runs the plugin's REAL
 * availability SQL (tests/sqlite-wpdb.php) against MotoPress's own tables as
 * MotoPress 6.4.0 creates them, with a fixture of three cottages:
 *   #22 — two rooms (2201, 2202): booked only when BOTH are closed;
 *   #23 — one room (2301);
 *   #31 — one room (3101).
 * Every closure MotoPress can store — a room, room 0 = every room of a type,
 * room 0 + type 0 = every room — is checked through Data_Provider and
 * through the public endpoint itself (Ajax::handle), and against the rule
 * that only not_stay_in closes a night, both ends included. Then: the
 * pre-6.0 option, read only where there is no table; a failed read never
 * cached and always booked; and the cache's size bounded however many
 * different windows a script asks for (fix 2).
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/sqlite-wpdb.php';

$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
$GLOBALS['t_tr'] = [];
function get_transient($k) { $v = $GLOBALS['t_tr'][$k] ?? null; return $v === null ? false : $v[0]; }
function set_transient($k, $v, $t) { $GLOBALS['t_tr'][$k] = [$v, $t]; return true; }
function delete_transient($k) { unset($GLOBALS['t_tr'][$k]); return true; }
final class T_Json extends \Exception { public $payload; public $ok; public $code; }
function wp_send_json_success($d = null, $code = null) { $e = new T_Json('ok'); $e->ok = true; $e->payload = $d; $e->code = $code; throw $e; }
function wp_send_json_error($d = null, $code = null) { $e = new T_Json('err'); $e->ok = false; $e->payload = $d; $e->code = $code; throw $e; }
if (!function_exists('nocache_headers')) { function nocache_headers() {} }
if (!function_exists('wp_unslash')) { function wp_unslash($v) { return $v; } }

require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-booking-rules.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-ajax.php';

use MPHBAC\Ajax;
use MPHBAC\Cache;
use MPHBAC\Data_Provider;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null && !$c ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

// ---- the fixture -------------------------------------------------------
$db = new T_SQLite_WPDB();
$GLOBALS['wpdb'] = $db;
foreach ([22 => [2201, 2202], 23 => [2301], 31 => [3101]] as $type => $rooms) {
    t_post($type, 'mphb_room_type', 'publish', 'Cottage ' . $type . ': Test');
    foreach ($rooms as $r) { $db->post($r, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $type]); }
}
$today = Data_Provider::today();
$D = static fn(int $n): string => $today->modify("+$n days")->format('Y-m-d');
$from = $today->modify('+10 days');
$to   = $today->modify('+40 days');
// Since 0.47.4 the cache's rows are options (mphbac_c_<hash>), not transients.
$fresh = static function (): void { $GLOBALS['t_tr'] = []; t_cache_clear(); Cache::flush_all(); };
$rows = static fn(): array => array_values(preg_grep('/^mphbac_c_/', array_map('strval', array_keys($GLOBALS['t_options']))));
$avail = static function (array $ids = [22, 23, 31]) use (&$from, &$to, $fresh): array {
    $fresh();
    return Data_Provider::get_availability($ids, $from, $to);
};
$st = static fn(array $a, int $t, int $n) => $a[$t][$GLOBALS['D']($n)] ?? '(none)';
$GLOBALS['D'] = $D;
$booked = static function (array $a, int $t, int $n1, int $n2) use ($st): bool {
    for ($n = $n1; $n <= $n2; $n++) { if ($st($a, $t, $n) !== Data_Provider::ST_BOOKED) { return false; } }
    return true;
};
$open = static function (array $a, int $t, int $n1, int $n2) use ($st): bool {
    for ($n = $n1; $n <= $n2; $n++) { if ($st($a, $t, $n) !== Data_Provider::ST_AVAIL) { return false; } }
    return true;
};
$db->create_blocks_table();

echo "-- 1. what closes a night (MotoPress 6.x: the {prefix}mphb_blocks table) --\n";
$a = $avail();
check('no booking, no block: every night of all three cottages open', $open($a, 22, 10, 40) && $open($a, 23, 10, 40) && $open($a, 31, 10, 40));

$db->block(23, 2301, $D(15), $D(17));
$a = $avail();
check('a block on ONE room (#23\'s only room, days 15–17): those nights booked, BOTH ENDS INCLUDED; day 14 and 18 open',
    $booked($a, 23, 15, 17) && $open($a, 23, 14, 14) && $open($a, 23, 18, 18), [$st($a, 23, 14), $st($a, 23, 15), $st($a, 23, 17), $st($a, 23, 18)]);
check('...and no other cottage touched', $open($a, 22, 10, 40) && $open($a, 31, 10, 40));
$db->clear_blocks();

$db->block(22, 0, $D(20), $D(22));
$a = $avail();
check('"ALL ACCOMMODATIONS" OF A TYPE (room 0, type #22): both its rooms closed, so #22 is booked on days 20–22 — until 0.47.2 these showed OPEN',
    $booked($a, 22, 20, 22) && $open($a, 22, 19, 19) && $open($a, 22, 23, 23), [$st($a, 22, 20), $st($a, 22, 22)]);
check('...#23 and #31 untouched', $open($a, 23, 10, 40) && $open($a, 31, 10, 40));
$db->clear_blocks();

$db->block(0, 0, $D(25), $D(25));
$a = $avail();
check('"ALL ACCOMMODATIONS" (room 0, type 0) on day 25: every cottage booked that night, the nights either side open',
    $booked($a, 22, 25, 25) && $booked($a, 23, 25, 25) && $booked($a, 31, 25, 25) && $open($a, 22, 24, 24) && $open($a, 31, 26, 26));
$db->clear_blocks();

$db->block(99, 0, $D(12), $D(30));
$a = $avail();
check('a block for ANOTHER type\'s every room (room 0, type 99): ours stay open', $open($a, 22, 10, 40) && $open($a, 23, 10, 40) && $open($a, 31, 10, 40));
$db->clear_blocks();

$db->block(0, 0, $D(12), $D(30), 0, 1, 1);
$db->block(22, 0, $D(12), $D(30), 0, 1, 0);
$a = $avail();
check('"not check-in" / "not check-out" without "not stay-in" (any scope): no night closed — only stay-in closes a night',
    $open($a, 22, 10, 40) && $open($a, 23, 10, 40) && $open($a, 31, 10, 40));
$db->clear_blocks();

$db->block(22, 2201, $D(30), $D(31));
$a = $avail();
check('a block on ONE of #22\'s two rooms: #22 still open (the other room is free)', $open($a, 22, 30, 31));
$db->post(9001, 'mphb_booking', 'confirmed', 0, ['mphb_check_in_date' => $D(31), 'mphb_check_out_date' => $D(33)]);
$db->post(9002, 'mphb_reserved_room', 'publish', 9001, ['_mphb_room_id' => 2202]);
$a = $avail();
check('...and with the other room BOOKED on day 31: #22 booked that night (block + booking together), open on 30 (block only) and 32 (booking only)',
    $booked($a, 22, 31, 31) && $open($a, 22, 30, 30) && $open($a, 22, 32, 32), [$st($a, 22, 30), $st($a, 22, 31), $st($a, 22, 32)]);
$db->clear_blocks();
$db->pdo->exec('DELETE FROM portal_posts WHERE ID IN (9001, 9002)');
$db->pdo->exec('DELETE FROM portal_postmeta WHERE post_id IN (9001, 9002)');

$db->block(22, 0, $D(5), $D(12));
$db->block(31, 0, $D(38), $D(60));
$a = $avail();
check('blocks reaching past either end of the window close only the nights inside it', $booked($a, 22, 10, 12) && $open($a, 22, 13, 40) && $booked($a, 31, 38, 40) && $open($a, 31, 10, 37));
$db->clear_blocks();

echo "\n-- ...through the public endpoint itself (Ajax::handle) --\n";
$call = static function (array $post): T_Json {
    $_POST = $post;
    try { Ajax::handle(); } catch (T_Json $j) { return $j; }
    throw new \RuntimeException('no JSON answer');
};
$db->block(0, 0, $D(20), $D(21));
$db->block(23, 0, $D(26), $D(27));
$fresh();
$j = $call(['room_type_ids' => ['22', '23', '31'], 'from' => $D(18), 'to' => $D(28)]);
$av = $j->payload['availability'] ?? [];
check('the endpoint answers "booked" for every cottage on the all-accommodations block (days 20–21)', $j->ok
    && ($av[22][$D(20)] ?? '') === 'booked' && ($av[23][$D(21)] ?? '') === 'booked' && ($av[31][$D(20)] ?? '') === 'booked', $av[22] ?? $j->payload);
check('...and for #23 on its type-wide block (26–27), while #22 and #31 stay open those nights',
    ($av[23][$D(26)] ?? '') === 'booked' && ($av[23][$D(27)] ?? '') === 'booked' && ($av[22][$D(26)] ?? '') === 'available' && ($av[31][$D(27)] ?? '') === 'available');
$j = $call(['room_type_ids' => ['23'], 'from' => $D(18), 'to' => $D(28)]);
check('...a one-cottage request (a cottage page) says the same', ($j->payload['availability'][23][$D(26)] ?? '') === 'booked' && ($j->payload['availability'][23][$D(20)] ?? '') === 'booked');
$db->clear_blocks();

echo "\n-- MotoPress before 6.0.0: the mphb_booking_rules_custom option --\n";
$db->drop_blocks_table();
$GLOBALS['t_options']['mphb_booking_rules_custom'] = [
    ['room_type_id' => 23, 'room_id' => 0, 'date_from' => $D(14), 'date_to' => $D(16), 'restrictions' => ['stay-in'], 'comment' => ''],
    ['room_type_id' => 0, 'room_id' => 0, 'date_from' => $D(33), 'date_to' => $D(33), 'restrictions' => ['check-in', 'stay-in'], 'comment' => ''],
    ['room_type_id' => 22, 'room_id' => 0, 'date_from' => $D(10), 'date_to' => $D(40), 'restrictions' => ['check-in', 'check-out'], 'comment' => ''],
    ['room_type_id' => 31, 'room_id' => 3101, 'date_from' => $D(36), 'date_to' => $D(36), 'restrictions' => ['stay-in'], 'comment' => ''],
];
$a = $avail();
check('no table: the option is read — a type-wide stay-in rule (#23, 14–16), an every-room one (33) and a room one (#31, 36) close those nights',
    $booked($a, 23, 14, 16) && $open($a, 23, 13, 13) && $booked($a, 22, 33, 33) && $booked($a, 31, 33, 33) && $booked($a, 31, 36, 36));
check('...and a check-in/check-out-only rule closes nothing (#22 open on its other nights)', $open($a, 22, 10, 32) && $open($a, 22, 34, 40));
$db->create_blocks_table();
$a = $avail();
check('WITH the table (6.0.0+): the option is a stale copy MotoPress left behind and is NOT read — nothing it says is closed',
    $open($a, 22, 10, 40) && $open($a, 23, 10, 40) && $open($a, 31, 10, 40));
unset($GLOBALS['t_options']['mphb_booking_rules_custom']);

echo "\n-- a failed read is never shown as open, and never cached --\n";
$db->block(22, 0, $D(20), $D(22));
$db->fail_on = '/mphb_blocks\b.*not_stay_in/s';
$a = $avail();
check('the blocks query fails: the answer is EMPTY — every night drawn as booked — not "open"', $a === [], array_slice($a[22] ?? [], 0, 3));
check('...and nothing was stored (the cottage list, an hour-long entry of its own, aside)', count($rows()) <= 1 && $GLOBALS['t_tr'] === [], $rows());
$db->fail_on = null;
$a = Data_Provider::get_availability([22, 23, 31], $from, $to);
check('...so the next request reads again and is right: #22 booked 20–22', $booked($a, 22, 20, 22) && $open($a, 22, 19, 19));
$db->fail_on = '/SHOW TABLES/';
$a = $avail();
check('the table check itself fails: empty (all booked) too, not open', $a === []);
$db->fail_on = null;
$db->clear_blocks();

echo "\n-- 2. the cache: one entry per month, never one per request --\n";
$keys = static fn() => count($rows()) + count($GLOBALS['t_tr']);
$fresh();
$valid = ['22', '23', '31'];
$lo = $today->modify('-' . Ajax::CLAMP_PAST_DAYS . ' days');
$hi = $today->modify('+' . Ajax::CLAMP_FUTURE_DAYS . ' days');
// The months anything may touch: the clamp window, plus the forward scan of
// a fully booked view (up to forward_scan_days past it), plus room types.
$scan = (int) \MPHBAC\Settings::get('forward_scan_days');
$months = 0;
for ($m = $lo->modify('first day of this month'); $m <= $hi->modify('+' . ($scan + 1) . ' days'); $m = $m->modify('first day of next month')) { $months++; }
$bound = $months + 1;
mt_srand(47);
$n = 0;
for ($i = 0; $i < 3000; $i++) {
    $f = $lo->modify('+' . mt_rand(0, (int) $lo->diff($hi)->days) . ' days');
    $t = $f->modify('+' . mt_rand(0, 94) . ' days');
    $ids = array_values(array_filter($valid, static fn() => mt_rand(0, 1)));
    try { $call(['room_type_ids' => $ids, 'from' => $f->format('Y-m-d'), 'to' => $t->format('Y-m-d')]); $n++; } catch (\Throwable $e) {}
}
$after = $keys();
check("3,000 different windows, cottage lists and lengths through the public endpoint: $after cache entries — within the fixed bound of $bound (one per month the calendar can be asked for, and the cottage list)",
    $n === 3000 && $after <= $bound, [$n, $after, $bound]);
for ($i = 0; $i < 1000; $i++) {
    $f = $lo->modify('+' . mt_rand(0, (int) $lo->diff($hi)->days) . ' days');
    $call(['room_type_ids' => $valid, 'from' => $f->format('Y-m-d'), 'to' => $f->modify('+' . mt_rand(0, 94) . ' days')->format('Y-m-d')]);
}
check('...1,000 more add nothing past it', $keys() <= $bound, [$keys(), $bound]);
check('...the old per-request key (avail_v2: ids, from, to) is never written, and nothing is a transient any more', !preg_grep('/avail_v2/', $rows()) && $GLOBALS['t_tr'] === []);

// Cutting a request from its months answers exactly what reading it straight does.
$db->block(22, 0, $D(20), $D(22));
$db->block(0, 0, $D(50), $D(51));
$db->post(9101, 'mphb_booking', 'confirmed', 0, ['mphb_check_in_date' => $D(45), 'mphb_check_out_date' => $D(60)]);
$db->post(9102, 'mphb_reserved_room', 'publish', 9101, ['_mphb_room_id' => 2301]);
$fresh();
$GLOBALS['t_options'][\MPHBAC\Settings::OPTION] = ['cache_ttl' => 0];
\MPHBAC\Settings::flush();
Data_Provider::list_room_types();                 // the cottage list keeps its own hour-long entry, as before
$k0 = $keys();
$same = true; $bad = null;
mt_srand(3);
$wins = [];
for ($i = 0; $i < 60; $i++) {
    $f = $today->modify('+' . mt_rand(-40, 400) . ' days');
    $wins[] = [$f, $f->modify('+' . mt_rand(0, 94) . ' days'), array_map('intval', array_values(array_filter($valid, static fn() => mt_rand(0, 1)) ?: ['22']))];
}
$direct = [];
foreach ($wins as $k => [$f, $t, $ids]) { $direct[$k] = Data_Provider::get_availability($ids, $f, $t); }
check('with "Remember availability for" at 0, no availability is stored at all (60 windows, not one entry)', $keys() === $k0, [$k0, $keys()]);
Cache::put('mphbac_t_direct', ['x' => 1]);
check('...and Cache::put() itself stores nothing at 0 (a 0 expiry would mean FOREVER, or nothing ever read)', !isset($GLOBALS['t_options']['mphbac_t_direct']) && !isset($GLOBALS['t_tr']['mphbac_t_direct']));
unset($GLOBALS['t_options'][\MPHBAC\Settings::OPTION]);
\MPHBAC\Settings::flush();
foreach ($wins as $k => [$f, $t, $ids]) {
    $cut = Data_Provider::get_availability($ids, $f, $t);
    if ($cut !== $direct[$k]) { $same = false; $bad = [$f->format('Y-m-d'), $t->format('Y-m-d'), $ids]; break; }
}
check('60 random windows, cut from the cached months, are identical — status for status, key order too — to reading them straight', $same, $bad);
$db->clear_blocks();

echo "\n-- 8. a cache clear deletes nothing --\n";
$db->log = [];
$gen = (int) get_option('mphbac_cache_gen', 1);
Cache::flush_all();
check('flush_all() runs no DELETE (or any query) on the options table', !preg_grep('/DELETE|options/i', $db->log), $db->log);
check('...and invalidates by the generation counter alone', (int) get_option('mphbac_cache_gen', 1) === $gen + 1);
$a = Data_Provider::get_availability([22], $from, $to);
$db->block(22, 0, $D(11), $D(11));
$b = Data_Provider::get_availability([22], $from, $to);
Cache::flush_all();
$c = Data_Provider::get_availability([22], $from, $to);
check('...a change is seen at once after the flush (day 11 booked), the stored month before it is not read again', $st($b, 22, 11) === 'available' && $st($c, 22, 11) === 'booked', [$st($b, 22, 11), $st($c, 22, 11)]);

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
