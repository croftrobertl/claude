<?php
/**
 * 0.50.0 — THE CLEANING SIGN, SERVER SIDE: ANY COTTAGE, ANY TIME (Rob).
 *
 * The plugin's real SQL on SQLite (tests/sqlite-wpdb.php). THE RULE, one
 * case at a time: a cottage's state is the NEWER of
 *   (a) its latest confirmed, non-dock-block checkout on or before today
 *       (Eastern) — automatic Not Ready, cleared after RED_DAYS — and
 *   (b) its last manual mark, Ready or Not Ready, which never expires;
 * never marked and no recent checkout = no sign. Then the stale page (a save
 * that did not see the latest state changes nothing), the 0.48/0.49 records
 * read as they are, and zero writes anywhere but the plugin's own option.
 * The page — every name held, the popup on <body> naming its cottage, a
 * transformed ancestor — is tests/browser/ready-0500-test.js.
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
$T = static fn(int $n): int => $today->modify(($n >= 0 ? '+' : '') . $n . ' days')->getTimestamp();   // that day's midnight, Eastern
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
$sign = static function (int $t): string {
    $s = Staff_Ready::state()[(string) $t] ?? null;
    return $s === null ? '(absent)' : $s['state'] . ($s['source'] !== '' ? ' ' . $s['source'] : '');
};
$at = static fn(int $t): int => Staff_Ready::state()[(string) $t]['at'];
$mark = static function (int $t, bool $ready, int $when) { // a stored mark at a chosen time
    $GLOBALS['t_options'][Staff_Ready::option_name($t)] = ['v' => 2, 'manual' => ['ready' => $ready, 'at' => $when], 'log' => [[$when, $ready ? 1 : 0]]];
};

echo "-- 1. the automatic part: which checkouts turn a cottage Not Ready --\n";
$book([22], -3, 0);                                                    // direct, out today
$book([23], -5, 0, 'confirmed', 'Air', ['_mphb_sync_id' => 'abc']);    // imported (Airbnb), out today
$book([31], -30, -20);                                                 // a real stay, long ago
$book([31], -2, 0, 'confirmed', 'DOCK', ['mphb_last_name' => 'BLOCK']); // a dock block, out today
$book([32], -3, 0, 'cancelled');
$book([33], -3, 0, 'pending');
$book([34], -2, 3);                                                    // a guest IN it (out in 3 days)
$book([35], -20, -13);                                                 // out 13 days ago
$book([36], -20, -14);                                                 // out 14 days ago
$s = Staff_Ready::state();
check('EVERY listed cottage has an entry (8), each a state, a source and a time — and nothing about any guest',
    array_keys($s) === $types && array_keys($s['22']) === ['state', 'source', 'at']
    && !preg_match('/Guest|Air|DOCK|name/i', json_encode($s)), $s);
check('a DIRECT stay out today: Not Ready, automatic', $sign(22) === 'notready auto', $sign(22));
check('an IMPORTED (iCal) stay out today: Not Ready, automatic', $sign(23) === 'notready auto', $sign(23));
check('a DOCK BLOCK out today does nothing (the stay before it is 20 days back: past RED_DAYS)', $sign(31) === 'none', $sign(31));
check('a CANCELLED and a PENDING booking out today do nothing; a cottage with a guest IN it and no checkout: no sign',
    $sign(32) === 'none' && $sign(33) === 'none' && $sign(34) === 'none', [$sign(32), $sign(33), $sign(34)]);
check('THE AUTOMATIC NOT READY CLEARS AFTER RED_DAYS (14): out 13 days ago still Not Ready; 14 days ago, no sign',
    $sign(35) === 'notready auto' && $sign(36) === 'none', [$sign(35), $sign(36)]);
check('its time is the START of the checkout day, Eastern', $at(22) === $T(0) && $at(35) === $T(-13), [$at(22), $T(0)]);

echo "\n-- 2. NEWER WINS --\n";
$db->log = [];
$r = Staff_Ready::save(22, true, $at(22));
check('Ready on a cottage Not Ready by today\'s checkout: Ready, manual (the mark is newer)', $r === true && $sign(22) === 'ready manual', $sign(22));
check('...its time is the mark\'s, after the checkout\'s', $at(22) > $T(0) && abs($at(22) - time()) < 5, [$at(22), time()]);
$mark(23, true, $T(-1) + 3600);                                         // marked Ready yesterday at 1 a.m.
check('a mark from YESTERDAY, then a checkout TODAY: the checkout is newer — Not Ready, automatic', $sign(23) === 'notready auto', $sign(23));
$mark(23, true, $T(0) + 11 * 3600);                                     // ...and Ready at 11 a.m. today
check('...marked Ready after it (today, 11 a.m.): Ready again', $sign(23) === 'ready manual', $sign(23));
$book([23], -1, 1);                                                     // the next guest is in; out tomorrow
check('a new guest IN the cottage changes nothing until their checkout day', $sign(23) === 'ready manual', $sign(23));

echo "\n-- 3. ANY COTTAGE, ANY TIME — and a manual mark never expires --\n";
$r = Staff_Ready::save(34, false, $at(34));
check('NOT READY on a cottage with a guest in it and no sign: allowed — Not Ready, manual', $r === false && $sign(34) === 'notready manual', $sign(34));
$mark(34, false, $T(-60));
check('A MANUAL NOT READY NEVER EXPIRES: marked 60 days ago, nothing since — still Not Ready', $sign(34) === 'notready manual', $sign(34));
$mark(33, true, $T(-40));
check('a manual Ready from 40 days ago, no checkout since: still Ready (green stays until the next checkout)', $sign(33) === 'ready manual', $sign(33));
$mark(36, true, $T(-40));
check('...but a manual Ready OLDER than the latest checkout (14 days ago) loses to it — and that has cleared: no sign', $sign(36) === 'none', $sign(36));
$mark(31, false, $T(-50));
check('a manual Not Ready OLDER than the latest checkout (20 days ago) loses to it — and that automatic one has cleared: no sign',
    $sign(31) === 'none', $sign(31));
$r = Staff_Ready::save(32, true, $at(32));
check('Ready on a cottage never marked, with no recent checkout: allowed — Ready, manual', $r === true && $sign(32) === 'ready manual', $sign(32));

echo "\n-- 4. THE STALE PAGE --\n";
$before = $GLOBALS['t_options'];
$seen = $at(35);
Staff_Ready::save(35, true, $seen);                                     // phone A marks Ready
$after = $GLOBALS['t_options'];
check('(instrument) phone A\'s mark, made against the state it saw, is stored', $sign(35) === 'ready manual');
$r = Staff_Ready::save(35, false, $seen);                               // phone B, still showing the old state
check('PHONE B, STILL SHOWING THE OLD STATE, marks Not Ready: REFUSED (null) — the cottage changed since its page saw it',
    $r === null && $sign(35) === 'ready manual', [$r, $sign(35)]);
check('...and nothing was written', $GLOBALS['t_options'] === $after);
$r = Staff_Ready::save(35, false, $at(35));
check('with the state it now shows, the same mark goes through', $r === false && $sign(35) === 'notready manual', $sign(35));
$seen22 = $at(22);
$book([22], -1, 0, 'confirmed', 'Second');                              // a second stay out the same day
check('a second stay out the SAME day does not make the page stale (its time is the same day\'s start)', $at(22) === $seen22, [$at(22), $seen22]);
$GLOBALS['t_options'][Staff_Ready::option_name(33)] = null;
$seen33 = $at(33);
$book([33], -4, 0);                                                     // a confirmed checkout appears (the iCal sync)
check('a NEW CHECKOUT after the page loaded: its old time is now stale — refused, nothing written',
    Staff_Ready::save(33, true, $seen33) === null && !isset($GLOBALS['t_options'][Staff_Ready::option_name(33)]['v']), $at(33));
check('an unlisted cottage: refused', Staff_Ready::save(99, true, PHP_INT_MAX) === null);

echo "\n-- 5. the record --\n";
$opt = $GLOBALS['t_options'][Staff_Ready::option_name(22)];
check('stored in the PLUGIN\'S OWN option, mphbac_ready_22, NOT autoloaded: the mark and the quiet log, no guest data',
    ($opt['v'] ?? 0) === 2 && $opt['manual']['ready'] === true && is_int($opt['manual']['at']) && ($GLOBALS['t_autoload'][Staff_Ready::option_name(22)] ?? null) === false
    && !preg_match('/Guest|name|booking|checkout/i', json_encode($opt)), $opt);
for ($i = 0; $i < 70; $i++) { Staff_Ready::save(22, $i % 2 === 0, $at(22)); }
$opt = $GLOBALS['t_options'][Staff_Ready::option_name(22)];
check('every mark is logged with its time, the log bounded at 50', count($opt['log']) === 50 && $opt['log'][49][0] === $opt['manual']['at'], count($opt['log']));
check('ZERO WRITES TO THE DATABASE (MotoPress\'s tables included): every statement was a SELECT',
    $db->log !== [] && !preg_grep('/^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\b/i', $db->log), preg_grep('/^\s*(INSERT|UPDATE|DELETE)/i', $db->log));

echo "\n-- 6. a 0.48/0.49 record, read as it is --\n";
$GLOBALS['t_options'][Staff_Ready::option_name(36)] = [$D(-14) => ['ready' => true, 'log' => [[$T(-14) + 7200, 1]]]];
check('an old record whose last change was READY: a manual Ready at that time', $sign(36) === 'ready manual' && $at(36) === $T(-14) + 7200, [$sign(36), $at(36)]);
$GLOBALS['t_options'][Staff_Ready::option_name(35)] = [$D(-13) => ['ready' => false, 'log' => [[$T(-13) + 3600, 1], [$T(-13) + 7200, 0]]]];
check('an old record whose last change was Not Ready (0.48\'s undo): no mark — the automatic state shows', $sign(35) === 'notready auto', $sign(35));
$was = $GLOBALS['t_options'][Staff_Ready::option_name(35)];
Staff_Ready::state();
check('...reading it rewrites nothing', $GLOBALS['t_options'][Staff_Ready::option_name(35)] === $was);
Staff_Ready::save(35, true, $at(35));
$opt = $GLOBALS['t_options'][Staff_Ready::option_name(35)];
check('...the next mark stores the new shape, keeping the old log', ($opt['v'] ?? 0) === 2 && count($opt['log']) === 3 && $opt['log'][0][0] === $T(-13) + 3600, $opt);

echo "\n-- 7. a failed read --\n";
$db->fail_on = '/mphb_check_out_date.*ORDER BY co\.meta_value DESC/s';
$threw = false;
try { Staff_Ready::state(); } catch (\MPHBAC\Staff_Read_Failed $e) { $threw = true; }
check('the checkout query fails: Staff_Ready throws (the board keeps the signs it has), never an empty answer', $threw);
$keep = $GLOBALS['t_options'];
$threw = false;
try { Staff_Ready::save(22, false, PHP_INT_MAX); } catch (\Throwable $e) { $threw = true; }
check('...and a save in that moment writes nothing', $threw && $GLOBALS['t_options'] === $keep);
$db->fail_on = null;

echo "\n-- 8. the endpoint --\n";
$src = (string) file_get_contents($ROOT . '/includes/class-staff.php');
check('Staff::handle_ready() checks the staff gate FIRST (password cookie or manager, then the nonce), then POST only',
    (bool) preg_match('/function handle_ready\(\): void\s*\{\s*self::require_authorization\(\);\s*if \(strtoupper\(\(string\) \(\$_SERVER\[\'REQUEST_METHOD\'\] \?\? \'\'\)\) !== \'POST\'\) \{\s*status_header\(405\);/', $src));
check('...takes `seen` (digits) and answers a stale save 409 "changed" with the signs as they are',
    str_contains($src, "Staff_Ready::save(\$type_id, \$ready === '1', (int) \$seen)") && (bool) preg_match("/'changed' => true, 'turnover' => \\\$state\], 409\)/", $src));
$rsrc = (string) file_get_contents($ROOT . '/includes/class-staff-ready.php');
check('nothing in Staff_Ready writes a post or its meta, or runs a write query',
    !preg_match('/wp_update_post|update_post_meta|add_post_meta|delete_post_meta|wp_insert_post|\$wpdb->(query|insert|update|delete|replace)\b/', $rsrc));
check('"the day" is the Eastern day: Data_Provider::today() and timezone(), never the server\'s or UTC date',
    !preg_match('/\b(gmdate|date)\s*\(|current_time\s*\(/', $rsrc) && Data_Provider::TZ === 'America/New_York');

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
