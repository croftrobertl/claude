<?php
/**
 * 0.47.4 — MOTOPRESS'S BOOKING RULES ON THE PUBLIC CALENDAR, SERVER SIDE.
 *
 * Runs the plugin's real code over a real (SQLite) database with MotoPress
 * 6.4.0's own rule engine behind mphb_availability_facade() (tests/vendor,
 * tests/mphb-rules-harness.php). The browser half — the look, the tap, the
 * popup — is tests/browser/rules-0474-test.js.
 *
 *   1. each rule of the staging fixture, read through the facade
 *   2. the mphbac_query CONTRACT (the Cottage Selector reads it): every
 *      existing field and its meaning kept, against 0.47.3 itself
 *   3. a rule, season or block saved reaches the calendar at once — and a
 *      booking does not throw the rules away
 *   4. MotoPress unreadable: 0.47.3's answer, never stored, logged once
 *   5. NO DELETE ON A READ PATH (the 2026-10-17 deadlock), and the daily sweep
 *   6. the cache stays bounded
 *   7. the staff board is untouched
 *   8. the performance budget
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/sqlite-wpdb.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
$db = new T_SQLite_WPDB();
$GLOBALS['wpdb'] = $db;
$db->create_blocks_table();
$db->create_custom_rules_table();
require __DIR__ . '/mphb-rules-harness.php';

$GLOBALS['t_tr'] = [];
function get_transient($k) { t_count('get_transient'); $v = $GLOBALS['t_tr'][$k] ?? null; return $v === null ? false : $v[0]; }
function set_transient($k, $v, $t) { $GLOBALS['t_tr'][$k] = [$v, $t]; return true; }
function delete_transient($k) { t_count('delete_transient'); unset($GLOBALS['t_tr'][$k]); return true; }
final class T_Json extends \Exception { public $payload; }
function wp_send_json_success($d = null, $c = null) { $e = new T_Json('ok'); $e->payload = ['success' => true, 'data' => $d]; throw $e; }
function wp_send_json_error($d = null, $c = null) { $e = new T_Json('err'); $e->payload = ['success' => false, 'data' => $d]; throw $e; }
if (!function_exists('nocache_headers')) { function nocache_headers() {} }
if (!function_exists('wp_unslash')) { function wp_unslash($v) { return $v; } }
if (!defined('MPHBAC_AJAX_ACTION')) { define('MPHBAC_AJAX_ACTION', 'mphbac_query'); }
// error_log, caught: "logged once" is checked by counting lines.
$LOG = tempnam(sys_get_temp_dir(), 'mphbac-log');
ini_set('error_log', $LOG);
$logged = static fn(): int => substr_count((string) file_get_contents($LOG), 'MotoPress booking rules could not be read');

require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-booking-rules.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-ajax.php';

use MPHBAC\Ajax;
use MPHBAC\Booking_Rules;
use MPHBAC\Cache;
use MPHBAC\Data_Provider;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null && !$c ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

// ---- the staging fixture (as tests/render/fixture-0474.php) ---------------
$types = [1071, 1069, 1067];
foreach ($types as $n => $t) {
    t_post($t, 'mphb_room_type', 'publish', 'Cottage ' . (22 + $n) . ': Test');
    $db->post($t * 10, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $t]);
}
$today = Data_Provider::today();
$D = static fn(int $n): string => $today->modify(($n >= 0 ? '+' : '') . $n . ' days')->format('Y-m-d');
$bid = 800000;
$book = static function (int $type, int $ci, int $co, bool $imported = false) use ($db, $D, &$bid): void {
    $b = ($bid += 2);
    $db->post($b, 'mphb_booking', 'confirmed', 0, ['mphb_check_in_date' => $D($ci), 'mphb_check_out_date' => $D($co)] + ($imported ? ['_mphb_sync_id' => 'x'] : []));
    $db->post($b + 1, 'mphb_reserved_room', 'publish', $b, ['_mphb_room_id' => $type * 10]);
};
$book(1071, 10, 13);
$book(1069, 7, 12, true);
$rules_fixture = static function () use ($D): void {
    $GLOBALS['t_mphb']['seasons'] = [];
    t_mphb_season(2080, '2025-12-31', '2027-03-31');
    t_mphb_season(9001, $D(30), $D(60));
    $GLOBALS['t_options']['mphb_check_in_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'check_in_days' => [0, 1, 3, 4, 5, 6]]];
    $GLOBALS['t_options']['mphb_min_stay_length'] = [['season_ids' => [9001], 'room_type_ids' => [0], 'min_stay_length' => 3],
        ['season_ids' => [0], 'room_type_ids' => [0], 'min_stay_length' => 2]];
    $GLOBALS['t_options']['mphb_max_stay_length'] = [['season_ids' => [0], 'room_type_ids' => [0], 'max_stay_length' => 14]];
    $GLOBALS['t_options']['mphb_buffer_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'buffer_days' => 1]];
    $GLOBALS['t_options']['mphb_min_advance_reservation'] = [['season_ids' => [0], 'room_type_ids' => [0], 'min_advance_reservation' => 1]];
};
$rules_live = static function (): void {
    foreach (Cache::RULE_OPTIONS as $o) { unset($GLOBALS['t_options'][$o]); }
    $GLOBALS['t_mphb']['seasons'] = [];
    t_mphb_season(2080, '2025-12-31', '2027-03-31');
    $GLOBALS['t_options']['mphb_min_stay_length'] = [['season_ids' => [0], 'room_type_ids' => [0], 'min_stay_length' => 2]];
};
$fresh = static function (): void { t_cache_clear(); Cache::flush_rules(); t_mphb_new_request(); };
$call = static function (array $post): array {
    t_mphb_new_request();
    $_POST = $post;
    try { Ajax::handle(); } catch (T_Json $j) { return $j->payload; }
    throw new \RuntimeException('no JSON answer');
};
$window = ['room_type_ids' => array_map('strval', $types), 'from' => $D(0), 'to' => $D(70)];

echo "-- 1. each rule of the staging fixture, read through mphb_availability_facade() --\n";
$rules_fixture();
$fresh();
$j = $call($window);
$r = $j['data']['rules'][1071] ?? null;
$at = static fn(string $s, int $n): string => substr($s, $n, 1);
$dow = static fn(int $n): int => (int) $today->modify("+$n days")->format('w');
$tues = array_values(array_filter(range(1, 70), static fn($n) => $dow($n) === 2));
check('the answer carries `rules` for every cottage asked for (in id order, as `availability`), one character a day (71)', is_array($r)
    && array_keys($j['data']['rules']) === [1067, 1069, 1071] && strlen($r['in']) === 71 && strlen($r['out']) === 71, array_keys($j['data']['rules'] ?? []));
check('NO CHECK-IN ON TUESDAYS: every Tuesday "w", every other day from tomorrow on "1"',
    array_reduce(range(1, 70), static fn($ok, $n) => $ok && $at($r['in'], $n) === ($dow($n) === 2 ? 'w' : '1'), true), $r['in']);
check('A 1-DAY MINIMUM ADVANCE: today "a" (too soon)', $at($r['in'], 0) === 'a', $r['in']);
check('departures are free (no check-out rule): every day "1"', $r['out'] === str_repeat('1', 71));
$min = $r['min'];
check('THE SEASONAL 3-NIGHT MINIMUM: 3 for a stay starting today+30 … today+60, 2 every other day',
    is_array($min) && array_reduce(range(0, 70), static fn($ok, $n) => $ok && $min[$n] === (($n >= 30 && $n <= 60) ? 3 : 2), true), $min);
check('THE 14-NIGHT MAXIMUM: one number, the same every day', $r['max'] === 14, $r['max']);
$a = $j['data']['availability'][1071];
check('A 1-DAY BUFFER: the Boathouse (booked today+10 … +13) is booked today+9 and today+13 as well as its three nights',
    $a[$D(9)] === 'booked' && $a[$D(13)] === 'booked' && $a[$D(10)] === 'booked' && $a[$D(12)] === 'booked' && $a[$D(8)] === 'available' && $a[$D(14)] === 'available',
    array_slice($a, 8, 7));
$a2 = $j['data']['availability'][1069];
check('...an iCal-imported booking carries its buffer too while "sync with buffers" is off (MotoPress\'s default)',
    $a2[$D(6)] === 'booked' && $a2[$D(12)] === 'booked' && $a2[$D(5)] === 'available', array_slice($a2, 5, 9));
$GLOBALS['t_mphb']['sync_buf'] = true;
Cache::flush_if_rule_option('mphb_ical_sync_with_buffers');
$a2 = $call($window)['data']['availability'][1069];
check('...and none once "sync with buffers" is on (the other site\'s dates already hold them) — its switch refreshes the calendar',
    $a2[$D(6)] === 'available' && $a2[$D(12)] === 'available' && $a2[$D(7)] === 'booked', array_slice($a2, 5, 9));
$GLOBALS['t_mphb']['sync_buf'] = false;
Cache::flush_if_rule_option('mphb_ical_sync_with_buffers');
// The facade is the truth: every day of every cottage, the encoded answer
// equals asking MotoPress directly.
t_mphb_new_request();
$f = mphb_availability_facade();
$tz = Data_Provider::timezone();
$same = true; $bad = null;
foreach ($types as $t) {
    $e = $call($window)['data']['rules'][$t];
    for ($n = 0; $n <= 70 && $same; $n++) {
        $dt = new DateTime($D($n), $tz);
        $want = $f->isCheckInEarlierThanMinAdvanceDate($t, clone $dt, false) ? 'a' : ($f->isCheckInLaterThanMaxAdvanceDate($t, clone $dt, false) ? 'f' : ($f->isCheckInNotAllowed($t, clone $dt, false) ? 'w' : '1'));
        $mn = is_array($e['min']) ? $e['min'][$n] : $e['min'];
        $mx = is_array($e['max']) ? $e['max'][$n] : $e['max'];
        if ($at($e['in'], $n) !== $want || $mn !== $f->getMinStayNightsCount($t, clone $dt, false) || $mx !== $f->getMaxStayNightsCount($t, clone $dt, false)
            || $at($e['out'], $n) !== ($f->isCheckOutNotAllowed($t, clone $dt, false) ? 'w' : '1')) {
            $same = false; $bad = [$t, $D($n)];
        }
    }
}
check('every day of every cottage, the answer is MotoPress\'s own (213 days × in, out, min, max, against the facade)', $same, $bad);
$GLOBALS['t_options']['mphb_check_out_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'check_out_days' => [0, 1, 2, 4, 5, 6]]];
Cache::flush_if_rule_option('mphb_check_out_days');
$out = $call($window)['data']['rules'][1071]['out'];
check('NO CHECK-OUT ON WEDNESDAYS (beyond the WD\'s list): every Wednesday "w" in `out`, every other day "1"',
    array_reduce(range(0, 70), static fn($ok, $n) => $ok && $at($out, $n) === ($dow($n) === 3 ? 'w' : '1'), true), $out);
// The advance windows count from TODAY, so a stored month of rules must be
// today's: the key carries today's date (yesterday's row is never read).
$keyToday = Cache::rules_key(['rules_m1', [1067, 1069, 1071], $today->format('Y-m'), $today->format('Y-m-d')]);
check('the stored rules are keyed by TODAY\'s date: tomorrow reads a new row, not today\'s "too soon"',
    isset($GLOBALS['t_options'][$keyToday]) && is_array($GLOBALS['t_options'][$keyToday]['__v'] ?? null), $keyToday);
unset($GLOBALS['t_options']['mphb_check_out_days']);
Cache::flush_if_rule_option('mphb_check_out_days');
$rules_live();
$fresh();
$r = $call($window)['data']['rules'][1071];
check('LIVE\'S RULES (a 2-night minimum, nothing else): every day "1" in and out, min 2, max 0 — nothing for a guest to see',
    $r === ['in' => str_repeat('1', 71), 'out' => str_repeat('1', 71), 'min' => 2, 'max' => 0], $r);
unset($GLOBALS['t_options']['mphb_min_stay_length']);
$fresh();
$r = $call($window)['data']['rules'][1071];
check('NO minimum-stay rule in MotoPress at all: `min` is left out, so the widget\'s own "Minimum nights" applies', !array_key_exists('min', $r), $r);
$GLOBALS['t_options']['mphb_min_stay_length'] = [['season_ids' => [9001], 'room_type_ids' => [0], 'min_stay_length' => 3]];
t_mphb_season(9001, $D(30), $D(60));
$fresh();
$r = $call($window)['data']['rules'][1071];
check('a seasonal minimum ONLY: MotoPress\'s answer every day — 3 in the season and 1 outside it, which is what its checkout enforces',
    is_array($r['min']) && $r['min'][31] === 3 && $r['min'][5] === 1, $r['min'] ?? null);
$rules_live();

echo "\n-- 2. THE mphbac_query CONTRACT (the Cottage Selector), against 0.47.3 itself --\n";
$OLD = sys_get_temp_dir() . '/mphbac-0473-' . getmypid();
@mkdir($OLD);
exec('cd ' . escapeshellarg(dirname(__DIR__)) . ' && git archive e515faf mphb-availability-calendar | tar -x -C ' . escapeshellarg($OLD) . ' 2>&1', $o, $rc);
check('(instrument check) 0.47.3 itself, from git (e515faf)', $rc === 0 && is_file("$OLD/mphb-availability-calendar/includes/class-ajax.php"), $o);
$body = http_build_query(['action' => 'mphbac_query', 'from' => $D(-3), 'to' => $D(60), 'room_type_ids' => [1071, 1069, 1065, 1604, 1607, 1067, 1740, 1742]]);
$ask = static function (string $dir, string $mode) use ($body): array {
    $out = shell_exec('MPHBAC_FIXTURE_0474=' . escapeshellarg($mode) . ' php ' . escapeshellarg(__DIR__ . '/render/ajax.php') . ' ' . escapeshellarg($dir) . ' ' . escapeshellarg($body) . ' 2>/dev/null');
    return json_decode((string) $out, true) ?: [];
};
$old = $ask("$OLD/mphb-availability-calendar", 'live');
$new = $ask($ROOT, 'live');
check('(instrument check) both answered: 8 cottages, 64 days each', count($old['data']['availability'] ?? []) === 8 && count(reset($old['data']['availability'])) === 64 && count($new['data']['availability'] ?? []) === 8);
check('WITH LIVE\'S RULES, every field 0.47.3 sent is sent, byte for byte: success, rooms, availability, from, to, bookedThrough',
    json_encode(array_diff_key($new['data'], ['rules' => 1])) === json_encode($old['data']) && $new['success'] === $old['success']);
check('...in the same order — new data only AFTER them, as the one new optional field `rules`',
    array_keys($new['data']) === array_merge(array_keys($old['data']), ['rules']), array_keys($new['data']));
check('...and 0.47.3 never sent `rules` (it is new, so a client that does not know it ignores it)', !array_key_exists('rules', $old['data']));
$oldF = $ask("$OLD/mphb-availability-calendar", 'fixture');
$newF = $ask($ROOT, 'fixture');
$diff = [];
foreach ($oldF['data']['availability'] as $t => $days) {
    foreach ($days as $d => $st) {
        if ($newF['data']['availability'][$t][$d] !== $st) { $diff[] = "$t $d $st>" . $newF['data']['availability'][$t][$d]; }
    }
}
check('WITH THE FIXTURE\'S RULES, `availability` differs from 0.47.3 ONLY where a buffer night is now booked — available>booked, never the other way',
    $diff !== [] && !preg_grep('/>available$|past/', $diff) && !preg_grep('/^(?!.*available>booked$)/', $diff), $diff);
// A 1-day buffer closes the night before a stay and the night it ends: so
// each changed night borders a night 0.47.3 already showed booked, and they
// come two to a stay (ten stays in the fixture).
$borders = static function (string $line) use ($oldF): bool {
    [$t, $d] = explode(' ', $line);
    $prev = (new DateTimeImmutable($d))->modify('-1 day')->format('Y-m-d');
    $next = (new DateTimeImmutable($d))->modify('+1 day')->format('Y-m-d');
    return ($oldF['data']['availability'][$t][$prev] ?? '') === 'booked' || ($oldF['data']['availability'][$t][$next] ?? '') === 'booked';
};
check('...those are exactly the buffer nights: each borders a booked stay, two to a stay (ten stays: 20) — the Boathouse\'s today+9 and today+13 among them',
    count($diff) === 20 && count(array_filter($diff, $borders)) === 20
    && in_array('1071 ' . $D(9) . ' available>booked', $diff, true) && in_array('1071 ' . $D(13) . ' available>booked', $diff, true), $diff);
check('...every status is still one of the three the Selector knows: available, booked, past',
    array_diff(array_unique(array_merge(...array_map('array_values', $newF['data']['availability']))), ['available', 'booked', 'past']) === []);
check('...and rooms, from, to, bookedThrough are unchanged by the rules',
    json_encode([$newF['data']['rooms'], $newF['data']['from'], $newF['data']['to'], $newF['data']['bookedThrough']])
    === json_encode([$oldF['data']['rooms'], $oldF['data']['from'], $oldF['data']['to'], $oldF['data']['bookedThrough']]));
check('the errors are 0.47.3\'s too: a bad range answers success:false with the same message',
    (static function () use ($ask, $OLD, $ROOT): bool {
        $b = http_build_query(['action' => 'mphbac_query', 'from' => 'x', 'to' => 'y']);
        $run = static fn(string $dir) => shell_exec('MPHBAC_FIXTURE_0474=live php ' . escapeshellarg(__DIR__ . '/render/ajax.php') . ' ' . escapeshellarg($dir) . ' ' . escapeshellarg($b) . ' 2>/dev/null');
        return $run($ROOT) === $run("$OLD/mphb-availability-calendar") && str_contains((string) $run($ROOT), '"success":false');
    })());
exec('rm -rf ' . escapeshellarg($OLD));

echo "\n-- 3. a rule, season or block saved reaches the calendar at once --\n";
// The hooks Plugin::boot() registers, read off its source (the runtime
// table is consumer-test.php's; these are the 0.47.4 additions).
$boot = (string) file_get_contents($ROOT . '/includes/class-plugin.php');
$hooks = [];
preg_match_all("/add_action\\('([a-z_]+)', \\['\\\\\\\\MPHBAC\\\\\\\\Cache', '(flush_rules|flush_if_rule_option|flush_rules_if_rule_post|sweep)'\\]/", $boot, $m, PREG_SET_ORDER);
foreach ($m as [, $hook, $cb]) { $hooks[$hook] = $cb; }
$want = ['added_option', 'updated_option', 'deleted_option', 'mphb_reservation_rules_updated', 'mphb_booking_rules_updated',
    'mphb_set_custom_booking_rules', 'mphb_block_created', 'mphb_block_updated', 'mphb_block_deleted', 'mphb_blocks_deleted',
    'save_post_mphb_season', 'save_post_mphb_room', 'save_post_mphb_room_type', 'deleted_post', 'delete_expired_transients', 'wp_scheduled_delete'];
check('Plugin::boot() hooks the rule refresh on: ' . implode(', ', array_slice($want, 0, 14)), array_diff($want, array_keys($hooks)) === [], array_diff($want, array_keys($hooks)));
check('...and every MotoPress rule option is watched (the ten its own facade clears on, plus iCal "sync with buffers")',
    Cache::RULE_OPTIONS === ['mphb_check_in_days', 'mphb_check_out_days', 'mphb_min_stay_length', 'mphb_max_stay_length',
        'mphb_min_advance_reservation', 'mphb_max_advance_reservation', 'mphb_buffer_days', 'mphb_booking_rules_custom',
        'mphb_do_not_apply_booking_rules_for_admin', 'mphb_ical_sync_with_buffers']);
$rules_fixture();
$fresh();
$in = static fn() => $call($window)['data']['rules'][1071]['in'];
$before = $in();
$GLOBALS['t_options']['mphb_check_in_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'check_in_days' => [0, 1, 2, 3, 4, 5, 6]]];
check('(instrument check) without the hook the stored answer is served: Tuesdays still closed', $in() === $before);
Cache::flush_if_rule_option('mphb_check_in_days');
check('a rule OPTION saved (updated_option → mphb_check_in_days): the next request has Tuesdays open', strpos(substr($in(), 1), 'w') === false, $in());
$GLOBALS['t_options']['mphb_check_in_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'check_in_days' => [0, 1, 3, 4, 5, 6]]];
Cache::flush_if_rule_option('mphb_shop_page');   // not a rule
check('...an unrelated option saved changes nothing', strpos(substr($in(), 1), 'w') === false);
Cache::flush_if_rule_option('mphb_check_in_days');
check('...and saved back: Tuesdays closed again at once', $in() === $before);
t_mphb_season(9001, $D(40), $D(60));
$min = static fn() => $call($window)['data']['rules'][1071]['min'];
check('(instrument check) a SEASON moved, not yet saved through WordPress: the stored minimum still starts at today+30', $min()[30] === 3);
Cache::flush_rules();   // save_post_mphb_season
check('the season saved (save_post_mphb_season): the 3-night minimum now starts at today+40', $min()[30] === 2 && $min()[40] === 3, [$min()[30], $min()[40]]);
$db->block(1071, 0, $D(20), $D(20), 0, 1, 0);
check('(instrument check) a no-arrival BLOCK added, before its hook: not seen', $at($in(), 20) === ($dow(20) === 2 ? 'w' : '1'));
Cache::flush_rules();   // mphb_block_created
check('the block saved (mphb_block_created): today+20 cannot start a stay', $at($in(), 20) === 'w');
$db->clear_blocks();
Cache::flush_rules();
$call($window);         // the rules, stored again
$db->log = [];
Cache::flush_all();     // a guest books, or the iCal sync imports
$c0 = $GLOBALS['t_mphb']['calls'];
$call($window);
// Reading the rules for 3 cottages × 71 days is ~1,300 calls into MotoPress;
// what is left is the buffers: whether there are any, the longest, and one
// per booking in the window (2).
check('A BOOKING does not throw the rules away: after flush_all() they come from the store — MotoPress is asked only about buffers (4 calls, not ~1,300)',
    $GLOBALS['t_mphb']['calls'] - $c0 === 4, $GLOBALS['t_mphb']['calls'] - $c0);
check('...while the availability is recomputed (the reservations were read again)', (bool) preg_grep('/mphb_reserved_room/', $db->log));
$rules_live();
$fresh();

echo "\n-- 4. MotoPress cannot be read: 0.47.3's answer, never stored, logged once --\n";
$rules_fixture();
$fresh();
$GLOBALS['t_options']['mphbac_rules_failed_logged'] = 0;
$rows = static fn(): int => count(preg_grep('/^mphbac_c_/', array_map('strval', array_keys($GLOBALS['t_options']))));
Data_Provider::list_room_types();   // the cottage list keeps its own hour-long row, as ever
$r0 = $rows();
$GLOBALS['t_mphb']['throw'] = new RuntimeException('simulated');
$j1 = $call($window);
$j2 = $call($window);
check('the facade throws: the answer is a success, WITHOUT `rules`', $j1['success'] && !array_key_exists('rules', $j1['data']), array_keys($j1['data']));
check('...availability is 0.47.3\'s: no buffer nights (today+9 open), the stay\'s nights booked',
    $j1['data']['availability'][1071][$D(9)] === 'available' && $j1['data']['availability'][1071][$D(10)] === 'booked');
check('...NOTHING IS STORED (no availability month, no rules month), so the next request asks again', $rows() === $r0, [$r0, $rows()]);
check('...logged ONCE for two failed requests (an hour between lines at most)', $logged() === 1, $logged());
$GLOBALS['t_mphb']['throw'] = null;
$j3 = $call($window);
check('MotoPress back: the very next request has the rules and the buffer nights, and stores them',
    isset($j3['data']['rules']) && $j3['data']['availability'][1071][$D(9)] === 'booked' && $rows() > $r0);
// The facade ABSENT (a MotoPress without it) is permanent, not a failure.
$src = (string) file_get_contents($ROOT . '/includes/class-booking-rules.php');
check('a MotoPress WITHOUT the facade is treated as permanent: no buffers, availability stored as in 0.47.3 (max_buffer() returns 0 when the function is missing)',
    (bool) preg_match("/function max_buffer\\(\\): int\\s*\\{(?:(?!function ).)*if \\(!function_exists\\('mphb_availability_facade'\\)\\) \\{(?:(?!function ).)*return 0;/s", $src));
$rules_live();
$fresh();

echo "\n-- 5. NO DELETE ON A READ PATH (2026-10-17 14:48 UTC: get_transient → delete_option → deadlock) --\n";
$rules_fixture();
$fresh();
$call($window);                                     // fill the store
foreach (array_keys($GLOBALS['t_options']) as $k) { // ...and let every row expire
    if (strncmp((string) $k, 'mphbac_c_', 9) === 0) { $GLOBALS['t_options'][$k]['__e'] = time() - 1; }
}
t_reset();
$db->log = [];
for ($i = 0; $i < 20; $i++) { $call($window); }
check('20 public requests over EXPIRED entries: not one delete_option(), delete_transient() or get_transient() (which deletes as it reads)',
    !isset($GLOBALS['t_calls']['delete_option']) && !isset($GLOBALS['t_calls']['delete_transient']) && !isset($GLOBALS['t_calls']['get_transient']), $GLOBALS['t_calls']);
check('...and no DELETE reached the database', !preg_grep('/^\s*DELETE/i', $db->log), preg_grep('/^\s*DELETE/i', $db->log));
$read = '';
foreach (['class-ajax.php', 'class-data-provider.php', 'class-booking-rules.php', 'class-widget.php'] as $file) {
    $read .= preg_replace('~/\*.*?\*/|//[^\n]*~s', '', (string) file_get_contents("$ROOT/includes/$file"));
}
check('the read path\'s code (Ajax, Data_Provider, Booking_Rules, the widget\'s embed) calls no delete_option / delete_transient / get_transient',
    !preg_match('/\b(delete_option|delete_transient|get_transient)\s*\(/', $read));

echo "\n-- 5b. the daily sweep --\n";
$sweepdb = new T_SQLite_WPDB();
$ins = $sweepdb->pdo->prepare('INSERT INTO portal_options (option_name, option_value, autoload) VALUES (?, ?, ?)');
$now = time();
$ins->execute(['mphbac_c_expired', serialize(['__v' => 1, '__t' => $now - 2000, '__e' => $now - 100]), 'off']);
$ins->execute(['mphbac_c_fresh', serialize(['__v' => 2, '__t' => $now, '__e' => $now + 900]), 'off']);
$ins->execute(['mphbac_c_junk', 'not a row', 'off']);
$ins->execute(['mphbac_cache_gen', '7', 'on']);
$ins->execute(['mphbac_settings', serialize(['cache_ttl' => 900]), 'off']);
$ins->execute(['mphbacXc_lookalike', serialize(['__e' => 1]), 'off']);
$GLOBALS['wpdb'] = $sweepdb;
$sweepdb->log = [];
$n = (static function () {
    // bootstrap's delete_option() works on the in-memory options; route it
    // to the database for this one call.
    $GLOBALS['t_options']['mphbac_c_expired'] = 1; $GLOBALS['t_options']['mphbac_c_junk'] = 1;
    return Cache::sweep();
})();
$names = array_column($sweepdb->pdo->query('SELECT option_name FROM portal_options ORDER BY option_name')->fetchAll(PDO::FETCH_ASSOC), 'option_name');
check('sweep() finds the expired row and the unreadable one, and only those: 2', $n === 2, $n);
check('...read with ONE plain SELECT (a LIKE on the name, escaped: mphbac\\_c\\_%) — no range DELETE',
    $sweepdb->log === ["SELECT option_name, option_value FROM portal_options WHERE option_name LIKE 'mphbac\\_c\\_%' LIMIT 2000"], $sweepdb->log);
check('...each removed by name through delete_option() (WordPress\'s unique-key delete, one row at a time)',
    !isset($GLOBALS['t_options']['mphbac_c_expired']) && !isset($GLOBALS['t_options']['mphbac_c_junk']));
check('...the fresh row, the generation, the settings and a look-alike name are left alone',
    in_array('mphbac_c_fresh', $names, true) && in_array('mphbac_cache_gen', $names, true) && in_array('mphbac_settings', $names, true) && in_array('mphbacXc_lookalike', $names, true));
$GLOBALS['wpdb'] = $db;
$main = (string) file_get_contents($ROOT . '/mphb-availability-calendar.php');
check('it runs on WordPress\'s own daily events (delete_expired_transients, wp_scheduled_delete) — nothing scheduled, nothing written on activation',
    $hooks['delete_expired_transients'] === 'sweep' && $hooks['wp_scheduled_delete'] === 'sweep'
    && !preg_match('/wp_schedule_event|wp_schedule_single_event/', $boot . $main . (string) file_get_contents($ROOT . '/includes/class-cache.php')));

echo "\n-- 6. the cache stays bounded, rules and all --\n";
$rules_fixture();
$fresh();
$lo = $today->modify('-' . Ajax::CLAMP_PAST_DAYS . ' days');
$hi = $today->modify('+' . Ajax::CLAMP_FUTURE_DAYS . ' days');
$months = 0;
for ($m = $lo->modify('first day of this month'); $m <= $hi->modify('+' . ((int) \MPHBAC\Settings::get('forward_scan_days') + 1) . ' days'); $m = $m->modify('first day of next month')) { $months++; }
$bound = 2 * $months + 1;
mt_srand(474);
for ($i = 0; $i < 600; $i++) {
    $f = $lo->modify('+' . mt_rand(0, (int) $lo->diff($hi)->days) . ' days');
    $ids = array_values(array_filter(array_map('strval', $types), static fn() => mt_rand(0, 1))) ?: ['1071'];
    $call(['room_type_ids' => $ids, 'from' => $f->format('Y-m-d'), 'to' => $f->modify('+' . mt_rand(0, 94) . ' days')->format('Y-m-d')]);
}
check("600 random windows and cottage lists: {$rows()} rows — within one availability and one rules row per month, plus the cottage list ($bound)", $rows() <= $bound, [$rows(), $bound]);
$rules_live();

echo "\n-- 7. the staff board is untouched --\n";
exec('cd ' . escapeshellarg(dirname(__DIR__)) . ' && git diff --stat e515faf -- mphb-availability-calendar/includes/class-staff.php mphb-availability-calendar/includes/class-staff-data.php mphb-availability-calendar/includes/class-staff-widget.php mphb-availability-calendar/includes/class-staff-elementor.php mphb-availability-calendar/includes/class-staff-search.php mphb-availability-calendar/assets/js/staff.js mphb-availability-calendar/assets/js/staff.min.js mphb-availability-calendar/assets/css/staff.css 2>&1', $o2, $rc2);
check('the staff calendar\'s code, script and stylesheet are byte-for-byte 0.47.3\'s (git diff e515faf: empty)', $rc2 === 0 && $o2 === [], $o2);
$staff = '';
foreach (glob($ROOT . '/includes/class-staff*.php') as $file) { $staff .= (string) file_get_contents($file); }
check('...and none of it reads the booking rules', !preg_match('/Booking_Rules|get_rules|mphb_availability_facade/', $staff));

echo "\n-- 8. the performance budget: cached +10 ms, +2 KB gzipped at most (3 months, 8 cottages) --\n";
$OLD = sys_get_temp_dir() . '/mphbac-0473p-' . getmypid();
@mkdir($OLD);
exec('cd ' . escapeshellarg(dirname(__DIR__)) . ' && git archive e515faf mphb-availability-calendar | tar -x -C ' . escapeshellarg($OLD));
$perf = static fn(string $dir, string $mode) => json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/perf-0474.php') . ' ' . escapeshellarg($dir) . " $mode --json 2>/dev/null"), true);
$p0 = $perf("$OLD/mphb-availability-calendar", 'live');
$p1 = $perf($ROOT, 'live');
$p2 = $perf($ROOT, 'fixture');
exec('rm -rf ' . escapeshellarg($OLD));
printf("      0.47.3 live:    cold %6.2f ms  after a booking %5.2f ms  cached %5.2f ms  %6d B raw  %5d B gzip\n", $p0['cold_ms'], $p0['after_booking_ms'], $p0['cached_ms'], $p0['raw_bytes'], $p0['gzip_bytes']);
printf("      0.47.4 live:    cold %6.2f ms  after a booking %5.2f ms  cached %5.2f ms  %6d B raw  %5d B gzip\n", $p1['cold_ms'], $p1['after_booking_ms'], $p1['cached_ms'], $p1['raw_bytes'], $p1['gzip_bytes']);
printf("      0.47.4 fixture: cold %6.2f ms  after a booking %5.2f ms  cached %5.2f ms  %6d B raw  %5d B gzip\n", $p2['cold_ms'], $p2['after_booking_ms'], $p2['cached_ms'], $p2['raw_bytes'], $p2['gzip_bytes']);
check('(instrument check) both versions answered 92 days, and only 0.47.4 sent rules', $p0['days'] === 92 && $p1['days'] === 92 && !$p0['has_rules'] && $p1['has_rules']);
check('CACHED: within +10 ms of 0.47.3 (live rules, and the full fixture)', $p1['cached_ms'] - $p0['cached_ms'] <= 10 && $p2['cached_ms'] - $p0['cached_ms'] <= 10, [$p0['cached_ms'], $p1['cached_ms'], $p2['cached_ms']]);
check('GZIPPED: within +2 KB (2,048 bytes) of 0.47.3', $p1['gzip_bytes'] - $p0['gzip_bytes'] <= 2048 && $p2['gzip_bytes'] - $p0['gzip_bytes'] <= 2048, [$p0['gzip_bytes'], $p1['gzip_bytes'], $p2['gzip_bytes']]);

@unlink($LOG);
echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
