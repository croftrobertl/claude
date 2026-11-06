<?php
/**
 * 0.50.0 → 0.58.0 — THE COTTAGE STATUS, SERVER SIDE: ANY COTTAGE, ANY TIME.
 *
 * The plugin's real SQL on SQLite (tests/sqlite-wpdb.php). THE RULE since
 * 0.58.0 (Rob, FINAL): a cottage's status is its last tap — Ready, Not
 * Ready or Occupied — and nothing else; a checkout of any kind changes
 * nothing (0.48.0–0.57.1 showed an automatic Not Ready after one). Never
 * tapped = no sign. Then the stale page (a save that did not see the latest
 * tap changes nothing), the 0.48/0.49 records read as they are, and zero
 * writes anywhere but the plugin's own option.
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

echo "-- 1. checkouts change nothing (0.58.0: no automatic Not Ready) --\n";
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
check('NOTHING TAPPED, SO NO SIGN ANYWHERE: a direct and an iCal stay out today, a dock block, a cancelled and a pending booking, a guest in, out 13 and 14 days ago',
    array_values(array_map(static fn($x) => $x['state'] . '/' . $x['source'] . '/' . $x['at'], $s)) === array_fill(0, 8, 'none//0'), $s);

echo "\n-- 2. THE NEWEST TAP WINS; a checkout is not a tap --\n";
$db->log = [];
$r = Staff_Ready::save(22, true, $at(22));
check('Ready on a cottage checked out today: Ready, manual', $r === true && $sign(22) === 'ready manual', $sign(22));
check('...its time is the tap\'s', abs($at(22) - time()) < 5, [$at(22), time()]);
$mark(23, true, $T(-1) + 3600);                                         // tapped Ready yesterday at 1 a.m.
check('a tap from YESTERDAY, then a checkout TODAY: still Ready (0.57.1: Not Ready, automatic)', $sign(23) === 'ready manual', $sign(23));
$mark(23, false, $T(0) + 11 * 3600);                                    // ...and Not Ready at 11 a.m. today
check('...tapped Not Ready after it: Not Ready', $sign(23) === 'notready manual', $sign(23));
$book([23], -1, 1);                                                     // the next guest is in; out tomorrow
check('a new guest IN the cottage changes nothing', $sign(23) === 'notready manual', $sign(23));

echo "\n-- 3. ANY COTTAGE, ANY TIME — and a tap never expires --\n";
$r = Staff_Ready::save(34, false, $at(34));
check('NOT READY on a cottage with a guest in it and no sign: allowed — Not Ready, manual', $r === false && $sign(34) === 'notready manual', $sign(34));
$mark(33, false, $T(-60));
check('A NOT READY NEVER EXPIRES: tapped 60 days ago, nothing since — still Not Ready', $sign(33) === 'notready manual', $sign(33));
$mark(33, true, $T(-40));
check('a Ready from 40 days ago: still Ready', $sign(33) === 'ready manual', $sign(33));
$mark(36, true, $T(-40));
check('a Ready OLDER than the latest checkout (14 days ago): still Ready (0.57.1: the checkout won, then cleared)', $sign(36) === 'ready manual', $sign(36));
$mark(31, false, $T(-50));
check('a Not Ready older than the latest checkout (20 days ago): still Not Ready', $sign(31) === 'notready manual', $sign(31));
$r = Staff_Ready::save(32, true, $at(32));
check('Ready on a cottage never tapped: allowed — Ready, manual', $r === true && $sign(32) === 'ready manual', $sign(32));

echo "\n-- 4. THE STALE PAGE --\n";
$seen = $at(35);
Staff_Ready::save(35, true, $seen);                                     // phone A taps Ready
$after = $GLOBALS['t_options'];
check('(instrument) phone A\'s tap, made against the status it saw, is stored', $sign(35) === 'ready manual');
$r = Staff_Ready::save(35, false, $seen);                               // phone B, still showing the old status
check('PHONE B, STILL SHOWING THE OLD STATUS, taps Not Ready: REFUSED (null) — the cottage changed since its page saw it',
    $r === null && $sign(35) === 'ready manual', [$r, $sign(35)]);
check('...and nothing was written', $GLOBALS['t_options'] === $after);
$r = Staff_Ready::save(35, false, $at(35));
check('with the status it now shows, the same tap goes through', $r === false && $sign(35) === 'notready manual', $sign(35));
$seen22 = $at(22);
$book([22], -1, 0, 'confirmed', 'Second');                              // a second stay out the same day
check('a second stay out the SAME day changes neither the status nor its time', $at(22) === $seen22 && $sign(22) === 'ready manual', [$at(22), $seen22]);
$GLOBALS['t_options'][Staff_Ready::option_name(33)] = null;
$seen33 = $at(33);
$book([33], -4, 0);                                                     // a confirmed checkout appears (the iCal sync)
check('a NEW CHECKOUT after the page loaded does NOT make the page stale (0.57.1 refused the tap): it goes through',
    $seen33 === 0 && $at(33) === 0 && Staff_Ready::save(33, true, $seen33) === true && $sign(33) === 'ready manual', $at(33));
check('an unlisted cottage: refused', Staff_Ready::save(99, true, PHP_INT_MAX) === null);
check('...an Occupied tap on one too', Staff_Ready::clear(99, PHP_INT_MAX) === null);

echo "\n-- 5. the record --\n";
$opt = $GLOBALS['t_options'][Staff_Ready::option_name(22)];
check('stored in the PLUGIN\'S OWN option, mphbac_ready_22, NOT autoloaded: the mark and the quiet log, no guest data',
    ($opt['v'] ?? 0) === 2 && $opt['manual']['ready'] === true && is_int($opt['manual']['at']) && ($GLOBALS['t_autoload'][Staff_Ready::option_name(22)] ?? null) === false
    && !preg_match('/Guest|name|booking|checkout/i', json_encode($opt)), $opt);
for ($i = 0; $i < 70; $i++) { Staff_Ready::save(22, $i % 2 === 0, $at(22)); }
$opt = $GLOBALS['t_options'][Staff_Ready::option_name(22)];
check('every mark is logged with its time, the log bounded at 50', count($opt['log']) === 50 && $opt['log'][49][0] === $opt['manual']['at'], count($opt['log']));
check('ZERO WRITES TO THE DATABASE (MotoPress\'s tables included): every statement was a SELECT',
    !preg_grep('/^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\b/i', $db->log), preg_grep('/^\s*(INSERT|UPDATE|DELETE)/i', $db->log));

echo "\n-- 6. a 0.48/0.49 record, read as it is --\n";
$GLOBALS['t_options'][Staff_Ready::option_name(36)] = [$D(-14) => ['ready' => true, 'log' => [[$T(-14) + 7200, 1]]]];
check('an old record whose last change was READY: a manual Ready at that time', $sign(36) === 'ready manual' && $at(36) === $T(-14) + 7200, [$sign(36), $at(36)]);
$GLOBALS['t_options'][Staff_Ready::option_name(35)] = [$D(-13) => ['ready' => false, 'log' => [[$T(-13) + 3600, 1], [$T(-13) + 7200, 0]]]];
check('an old record whose last change was Not Ready (0.48\'s undo): no tap stored — no sign', $sign(35) === 'none', $sign(35));
$was = $GLOBALS['t_options'][Staff_Ready::option_name(35)];
Staff_Ready::state();
check('...reading it rewrites nothing', $GLOBALS['t_options'][Staff_Ready::option_name(35)] === $was);
Staff_Ready::save(35, true, $at(35));
$opt = $GLOBALS['t_options'][Staff_Ready::option_name(35)];
check('...the next mark stores the new shape, keeping the old log', ($opt['v'] ?? 0) === 2 && count($opt['log']) === 3 && $opt['log'][0][0] === $T(-13) + 3600, $opt);

echo "\n-- 7. no booking is read --\n";
$was = Staff_Ready::state();
$db->fail_on = '/mphb_booking|mphb_check_out_date|mphb_check_in_date/s';
$threw = false;
$got = null;
try { $got = Staff_Ready::state(); } catch (\Throwable $e) { $threw = true; }
check('every booking query failing changes nothing: Staff_Ready reads none (0.57.1 threw here)', !$threw && $got === $was, $got);
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
check('Staff_Ready reads no date at all: no today(), date(), gmdate() or current_time()',
    !preg_match('/today\(|\b(gmdate|date)\s*\(|current_time\s*\(/', $rsrc));

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
