<?php
/**
 * 0.48.0 — THE CLEANING DOT, SERVER SIDE (Staff_Ready).
 *
 * The plugin's real SQL on SQLite (tests/sqlite-wpdb.php), the dot rules one
 * by one: which checkouts light a dot, red or green, how a new checkout
 * turns green back to red, what a save may write and where, and that it
 * writes nothing anywhere else. The page, the long press, the gate and the
 * failed save are tests/browser/ready-0480-test.js.
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/sqlite-wpdb.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
$db = new T_SQLite_WPDB();
$GLOBALS['wpdb'] = $db;
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function update_meta_cache($t, $ids) { $GLOBALS['t_primes'][] = count($ids); return true; }

require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-booking-rules.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';
require $ROOT . '/includes/class-staff-ready.php';

use MPHBAC\Data_Provider;
use MPHBAC\Staff_Ready;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null && !$c ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$types = [22, 23, 31, 32, 33, 34, 35, 36];
foreach ($types as $t) {
    t_post($t, 'mphb_room_type', 'publish', "Cottage $t: Test");
    $db->post($t * 100, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $t]);
}
$today = Data_Provider::today();
$D = static fn(int $n): string => $today->modify(($n >= 0 ? '+' : '') . $n . ' days')->format('Y-m-d');
$id = 900000;
$book = static function (array $types_, int $ci, int $co, string $status = 'confirmed', string $first = 'Guest', array $extra = []) use ($db, $D, &$id): int {
    $b = ($id += 10);
    $meta = $extra + ['mphb_check_in_date' => $D($ci), 'mphb_check_out_date' => $D($co), 'mphb_first_name' => $first, 'mphb_last_name' => 'X'];
    $db->post($b, 'mphb_booking', $status, 0, $meta);
    t_post($b, 'mphb_booking', $status, '', $meta);
    foreach (array_values($types_) as $i => $t) {
        $db->post($b + 1 + $i, 'mphb_reserved_room', 'publish', $b, ['_mphb_room_id' => $t * 100]);
    }
    return $b;
};
$state = static fn(): array => Staff_Ready::state();
$dot = static function (int $t) use ($state): string {
    $s = $state()[(string) $t] ?? null;
    return $s === null ? 'none' : ($s['ready'] ? 'green' : 'red') . ' ' . $s['checkout'];
};

echo "-- 1. which checkouts light a dot --\n";
$book([22], -3, 0);                                                    // direct, out today
$book([23], -5, 0, 'confirmed', 'Air', ['_mphb_sync_id' => 'abc']);    // imported (Airbnb), out today
$book([31], -30, -20);                                                 // a real stay, long ago
$book([31], -2, 0, 'confirmed', 'DOCK', ['mphb_last_name' => 'BLOCK']); // a dock block, out today
$book([32], -3, 0, 'cancelled');
$book([33], -3, 0, 'pending');
$book([34], -2, 1);                                                    // out tomorrow
$book([35], -20, -13);                                                 // 13 days ago
$book([36], -20, -14);                                                 // 14 days ago
check('a DIRECT stay out today: red, for today', $dot(22) === 'red ' . $D(0), $dot(22));
check('an IMPORTED (iCal) stay out today: red', $dot(23) === 'red ' . $D(0), $dot(23));
check('a DOCK BLOCK out today lights nothing (and the stay before it, 20 days back, is past the 14 days)', $dot(31) === 'none', $dot(31));
check('a CANCELLED and a PENDING booking out today light nothing', $dot(32) === 'none' && $dot(33) === 'none', [$dot(32), $dot(33)]);
check('a stay out TOMORROW lights nothing yet', $dot(34) === 'none', $dot(34));
check('THE 14 DAYS: unmarked 13 days after checkout still red; 14 days after, let go', $dot(35) === 'red ' . $D(-13) && $dot(36) === 'none', [$dot(35), $dot(36)]);
$book([31], -9, -5);
check('a dock block AFTER a real stay within the 14 days: the real stay\'s checkout is the dot', $dot(31) === 'red ' . $D(-5), $dot(31));
$book([34, 35], -6, -1);
check('ONE booking of TWO cottages: both dotted, each for that checkout', $dot(34) === 'red ' . $D(-1) && $dot(35) === 'red ' . $D(-1), [$dot(34), $dot(35)]);
check('the answer holds a cottage id, a date and a flag — nothing about any guest',
    !preg_match('/Guest|Air|DOCK|X\b|name/i', json_encode($state())) && array_keys(array_values($state())[0]) === ['checkout', 'ready'], $state());
check('the dock-block names are read with ONE meta prime for every booking, not one query each', ($GLOBALS['t_primes'] ?? [])[0] ?? 0 > 1, $GLOBALS['t_primes'] ?? null);

echo "\n-- 2. Ready, Not Ready, and the next checkout --\n";
$db->log = [];
$r = Staff_Ready::save(22, $D(0), true);
check('Ready on today\'s checkout: saved, and the dot is GREEN', $r === true && $dot(22) === 'green ' . $D(0), $dot(22));
$r = Staff_Ready::save(22, $D(0), false);
check('Not Ready: red again', $r === false && $dot(22) === 'red ' . $D(0), $dot(22));
Staff_Ready::save(22, $D(0), true);
$opt = $GLOBALS['t_options'][Staff_Ready::option_name(22)] ?? null;
check('stored in the PLUGIN\'S OWN option, mphbac_ready_22, keyed by the checkout date, NOT autoloaded',
    is_array($opt) && array_keys($opt) === [$D(0)] && ($GLOBALS['t_autoload'][Staff_Ready::option_name(22)] ?? null) === false, $opt);
check('THE QUIET RECORD: every change, with its time — Ready, Not Ready, Ready',
    array_map(static fn($x) => $x[1], $opt[$D(0)]['log']) === [1, 0, 1] && abs($opt[$D(0)]['log'][0][0] - time()) < 60, $opt[$D(0)]['log']);
check('ZERO WRITES TO THE DATABASE (MotoPress\'s tables included): every statement the saves ran was a SELECT',
    $db->log !== [] && !preg_grep('/^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\b/i', $db->log), preg_grep('/^\s*(INSERT|UPDATE|DELETE)/i', $db->log));
$book([22], -1, 0, 'confirmed', 'Second');                              // same-day: no change of date
check('a second stay out the SAME day: still the same checkout, still green', $dot(22) === 'green ' . $D(0), $dot(22));

$book([23], -10, -4);
Staff_Ready::save(35, $D(-1), true);
check('(instrument) Blue Heron green for its checkout yesterday', $dot(35) === 'green ' . $D(-1));
$book([35], -1, 0);                                                     // the next guest leaves today
check('GREEN → RED AT THE NEXT CHECKOUT: a new checkout today turns the dot red, for today', $dot(35) === 'red ' . $D(0), $dot(35));
check('...and the earlier Ready is kept, as the record of that checkout', ($GLOBALS['t_options'][Staff_Ready::option_name(35)][$D(-1)]['ready'] ?? null) === true);
Staff_Ready::save(34, $D(-1), true);
$book([34], -40, -30);
check('green does not expire: a cottage marked Ready stays green until its next checkout (an older stay added changes nothing)', $dot(34) === 'green ' . $D(-1), $dot(34));
$book([36], -60, -40);
Staff_Ready::save(36, $D(-40), true);
check('...and only the LATEST checkout can be marked: a 40-day-old one is not the dot (nothing written)',
    !isset($GLOBALS['t_options'][Staff_Ready::option_name(36)]), $GLOBALS['t_options'][Staff_Ready::option_name(36)] ?? null);
// Sunshine (36) last checked out 14 days ago — past the red
// window, so unmarked it has no dot (section 1). Marked Ready then, it stays green.
$GLOBALS['t_options'][Staff_Ready::option_name(36)] = [$D(-14) => ['ready' => true, 'log' => [[time() - 14 * 86400, 1]]]];
check('GREEN DOES NOT EXPIRE: marked Ready for a checkout 14 days ago (where an unmarked one is let go), nobody since — still green',
    $dot(36) === 'green ' . $D(-14), $dot(36));

echo "\n-- 3. what a save may not do --\n";
$before = $GLOBALS['t_options'];
check('a STALE checkout (the page was loaded before today\'s): refused, null, nothing written',
    Staff_Ready::save(35, $D(-1), false) === null && $GLOBALS['t_options'] === $before);
check('a cottage with NO dot (Pineapple: only a pending booking out today): refused, nothing written', Staff_Ready::save(33, $D(0), true) === null && $GLOBALS['t_options'] === $before);
check('a made-up date: refused', Staff_Ready::save(22, '2026-02-30', true) === null && $GLOBALS['t_options'] === $before);
for ($i = 0; $i < 30; $i++) { Staff_Ready::save(23, $D(0), $i % 2 === 0); }
check('the record is bounded: at most 20 changes kept per checkout', count($GLOBALS['t_options'][Staff_Ready::option_name(23)][$D(0)]['log']) === 20);
$data = [];
for ($i = 0; $i < 30; $i++) { $data[$D(-100 - $i)] = ['ready' => true, 'log' => []]; }
$GLOBALS['t_options'][Staff_Ready::option_name(23)] += $data;
Staff_Ready::save(23, $D(0), true);
$keys = array_keys($GLOBALS['t_options'][Staff_Ready::option_name(23)]);
check('...and at most 12 checkouts per cottage, the newest kept', count($keys) === 12 && $keys[0] === $D(0), $keys);

echo "\n-- 4. a failed read is not \"nobody checked out\" --\n";
$db->fail_on = '/mphb_check_out_date.*ORDER BY co\.meta_value DESC/s';
$threw = false;
try { Staff_Ready::state(); } catch (\MPHBAC\Staff_Read_Failed $e) { $threw = true; }
check('the checkout query fails: Staff_Ready throws (the board keeps the dots it has), never an empty answer', $threw);
$threw = false;
try { Staff_Ready::save(22, $D(0), false); } catch (\Throwable $e) { $threw = true; }
check('...and a save in that moment writes nothing', $threw && ($GLOBALS['t_options'][Staff_Ready::option_name(22)][$D(0)]['ready'] ?? null) === true);
$db->fail_on = null;
$src = (string) file_get_contents($ROOT . '/includes/class-staff.php');
check('Staff::view_or_fail() leaves `turnover` out when that read fails, and still answers the month',
    (bool) preg_match('/try \{\s*\$data\[\'turnover\'\] = Staff_Ready::state\(\);\s*\} catch \(Staff_Read_Failed \$e\)/', $src));

echo "\n-- 5. the endpoint and the day --\n";
check('Staff::handle_ready() checks the gate FIRST (require_authorization: the password cookie or a manager, then the nonce), then POST only',
    (bool) preg_match('/function handle_ready\(\): void\s*\{\s*self::require_authorization\(\);\s*if \(strtoupper\(\(string\) \(\$_SERVER\[\'REQUEST_METHOD\'\] \?\? \'\'\)\) !== \'POST\'\) \{\s*status_header\(405\);/', $src));
check('...registered like every staff endpoint (wp_ajax_ and wp_ajax_nopriv_: the gate, not the hook, decides), and kept out of page caches',
    str_contains($src, "foreach (['month', 'booking', 'photo', 'search', 'ready'] as \$ep)")
    && str_contains((string) file_get_contents($ROOT . '/includes/class-cache-integration.php'), "'search', 'ready']"));
$rsrc = (string) file_get_contents($ROOT . '/includes/class-staff-ready.php');
check('"the day" is the property\'s Eastern day: Data_Provider::today() (America/New_York), never the server\'s or UTC date',
    substr_count($rsrc, 'Data_Provider::today()') >= 2 && !preg_match('/\b(gmdate|date)\s*\(|current_time\s*\(/', $rsrc) && Data_Provider::TZ === 'America/New_York');
check('nothing in it writes a post or its meta (no wp_update_post, update_post_meta, wp_insert_post, $wpdb->query/insert/update)',
    !preg_match('/wp_update_post|update_post_meta|add_post_meta|delete_post_meta|wp_insert_post|\$wpdb->(query|insert|update|delete|replace)\b/', $rsrc));

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
