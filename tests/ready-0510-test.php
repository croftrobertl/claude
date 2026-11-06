<?php
/**
 * 0.51.0 → 0.58.0 — THE CASE TABLE: EVERY STATUS IS WHAT STAFF LAST TAPPED.
 *
 * 0.51.0–0.57.1 worked a gray Occupied out of the bookings and a red Not
 * Ready out of a checkout. Since 0.58.0 (Rob, 2026-11-06, FINAL) "Ready",
 * "Not Ready" and "Occupied" change ONLY when staff tap them. The same inputs
 * as the 0.51.0 table, through the plugin's real SQL on SQLite and its real
 * rule (Staff_Ready::state → decide), MotoPress's check-in time 15:00. Each
 * case is its own cottage. The run prints THE TABLE — the input, the sign
 * shown and what the popup offers — and every row is a check. The clock
 * walk (midnight, check-in time, checkout) is ready-0580-test.php.
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/sqlite-wpdb.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
$db = new T_SQLite_WPDB();
$GLOBALS['wpdb'] = $db;
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function update_meta_cache($t, $ids) { return true; }
$GLOBALS['t_options']['mphb_check_in_time'] = '15:00';     // MotoPress's setting (no MPHB() here: the option it reads)

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

$today = Data_Provider::today();
$D = static fn(int $n): string => $today->modify(($n >= 0 ? '+' : '') . $n . ' days')->format('Y-m-d');
$T = static fn(int $n, int $h = 0, int $m = 0): int => $today->modify(($n >= 0 ? '+' : '') . $n . ' days')->getTimestamp() + $h * 3600 + $m * 60;
$id = 950000;
$cottage = 0;
$book = static function (int $type, int $ci, int $co, string $status = 'confirmed', string $first = 'Guest', string $last = 'X') use ($db, $D, &$id): void {
    $b = ($id += 10);
    $meta = ['mphb_check_in_date' => $D($ci), 'mphb_check_out_date' => $D($co), 'mphb_first_name' => $first, 'mphb_last_name' => $last];
    $db->post($b, 'mphb_booking', $status, 0, $meta);
    t_post($b, 'mphb_booking', $status, '', $meta);
    $db->post($b + 1, 'mphb_reserved_room', 'publish', $b, ['_mphb_room_id' => $type * 100]);
};
$mark = static function (int $type, bool $ready, int $when): void {
    $GLOBALS['t_options'][Staff_Ready::option_name($type)] = ['v' => 2, 'manual' => ['ready' => $ready, 'at' => $when], 'log' => [[$when, $ready ? 1 : 0]]];
};
$clear = static function (int $type, int $when, ?array $manual = null): void {   // a mark cleared back to Occupied (0.52.0)
    $GLOBALS['t_options'][Staff_Ready::option_name($type)] = ['v' => 2, 'manual' => $manual, 'cleared' => $when, 'log' => [[$when, 2]]];
};
$WORD = ['none' => 'no sign', 'notready' => 'Not Ready (red X)', 'ready' => 'Ready (green check)', 'occupied' => 'Occupied (gray person)'];
$cases = [];
$case = static function (string $name, string $input, callable $setup, string $want) use (&$cases, &$cottage, $db): void {
    $t = 100 + (++$cottage);
    t_post($t, 'mphb_room_type', 'publish', "Cottage $t: Case");
    $db->post($t * 100, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $t]);
    $setup($t);
    $cases[] = [$name, $input, $t, $want];
};
$day = static fn(int $n): string => $n === 0 ? 'today' : ($n < 0 ? (-$n) . 'd ago' : "+{$n}d");

// ---------------------------------------------------------------- the cases
// The last column is the status: the tap stored, whatever the bookings say.
$case('Never marked', 'no stay, no checkout, no tap', static function ($t) {}, 'none');
$case('Never marked, a guest in', 'stay in 2d ago → out in 2d; no tap', static function ($t) use ($book) { $book($t, -2, 2); }, 'none');
$case('Marked Ready BEFORE arrival', 'Ready 3d ago 10:00; stay in 1d ago → out in 2d', static function ($t) use ($book, $mark, $T) { $book($t, -1, 2); $mark($t, true, $T(-3, 10)); }, 'ready');
$case('Marked Ready on arrival day BEFORE check-in time', 'stay in 1d ago; Ready that day 14:00 (check-in 15:00)', static function ($t) use ($book, $mark, $T) { $book($t, -1, 2); $mark($t, true, $T(-1, 14)); }, 'ready');
$case('Marked Ready on arrival day AFTER check-in time', 'stay in 1d ago; Ready that day 16:00', static function ($t) use ($book, $mark, $T) { $book($t, -1, 2); $mark($t, true, $T(-1, 16)); }, 'ready');
$case('ROB\'S 11/6: a 2 PM arrival today, Not Ready tapped last night', 'stay in today → out in 3d; Not Ready yesterday 18:00', static function ($t) use ($book, $mark, $T) { $book($t, 0, 3); $mark($t, false, $T(-1, 18)); }, 'notready');
$case('Marked Not Ready mid-stay', 'stay in 2d ago → out in 2d; Not Ready yesterday 10:00', static function ($t) use ($book, $mark, $T) { $book($t, -2, 2); $mark($t, false, $T(-1, 10)); }, 'notready');
$case('Marked Ready mid-stay', 'stay in 2d ago → out in 2d; Ready yesterday 10:00', static function ($t) use ($book, $mark, $T) { $book($t, -2, 2); $mark($t, true, $T(-1, 10)); }, 'ready');
$case('Arrival day, nobody left that day', 'stay in today → out in 3d; no tap', static function ($t) use ($book) { $book($t, 0, 3); }, 'none');
$case('Checkout day, unmarked', 'stay 3d ago → out today; no tap', static function ($t) use ($book) { $book($t, -3, 0); }, 'none');
$case('Checkout day, after a mid-stay Ready', 'stay 3d ago → out today; Ready yesterday 10:00', static function ($t) use ($book, $mark, $T) { $book($t, -3, 0); $mark($t, true, $T(-1, 10)); }, 'ready');
$case('Checkout day, marked Ready after it', 'stay 3d ago → out today; Ready today (now)', static function ($t) use ($book, $mark) { $book($t, -3, 0); $mark($t, true, time()); }, 'ready');
$case('TURNOVER day, before a tap', 'A out today, B in today → out in 3d; no tap', static function ($t) use ($book) { $book($t, -3, 0); $book($t, 0, 3); }, 'none');
$case('TURNOVER day, after a Ready tap', 'A out today, B in today; Ready today (now)', static function ($t) use ($book, $mark) { $book($t, -3, 0); $book($t, 0, 3); $mark($t, true, time()); }, 'ready');
$case('Morning after turnover, Ready tapped BEFORE check-in time', 'A out yesterday, B in yesterday; Ready yesterday 14:00', static function ($t) use ($book, $mark, $T) { $book($t, -3, -1); $book($t, -1, 3); $mark($t, true, $T(-1, 14)); }, 'ready');
$case('Morning after turnover, Ready tapped AFTER check-in time', 'A out yesterday, B in yesterday; Ready yesterday 16:00', static function ($t) use ($book, $mark, $T) { $book($t, -3, -1); $book($t, -1, 3); $mark($t, true, $T(-1, 16)); }, 'ready');
$case('Morning after turnover, untapped', 'A out yesterday, B in yesterday; no tap', static function ($t) use ($book) { $book($t, -3, -1); $book($t, -1, 3); }, 'none');
$case('A DOCK BLOCK in the cottage', 'dock block in 2d ago → out in 2d', static function ($t) use ($book) { $book($t, -2, 2, 'confirmed', 'DOCK', 'BLOCK'); }, 'none');
$case('A CANCELLED booking over today', 'cancelled, in 2d ago → out in 2d', static function ($t) use ($book) { $book($t, -2, 2, 'cancelled'); }, 'none');
$case('A PENDING booking over today', 'pending, in 2d ago → out in 2d', static function ($t) use ($book) { $book($t, -2, 2, 'pending'); }, 'none');
$case('A guest in, after an old Not Ready', 'Not Ready 30d ago; stay in 2d ago → out in 2d', static function ($t) use ($book, $mark, $T) { $book($t, -2, 2); $mark($t, false, $T(-30, 12)); }, 'notready');
$case('An OLD Ready, a checkout since', 'Ready 40d ago; stay 10d ago → out 5d ago', static function ($t) use ($book, $mark, $T) { $book($t, -10, -5); $mark($t, true, $T(-40, 12)); }, 'ready');
$case('The day after checkout, a mid-stay Not Ready', 'stay 4d ago → out yesterday; Not Ready 2d ago', static function ($t) use ($book, $mark, $T) { $book($t, -4, -1); $mark($t, false, $T(-2, 10)); }, 'notready');
$case('Mid-stay Ready, then OCCUPIED tapped', 'stay in 2d ago → out in 2d; Ready yesterday 10:00, Occupied yesterday 12:00', static function ($t) use ($book, $clear, $T) { $book($t, -2, 2); $clear($t, $T(-1, 12)); }, 'occupied');
$case('OCCUPIED tapped, then Ready again', 'stay in 2d ago; Occupied yesterday 12:00, Ready yesterday 14:00', static function ($t) use ($book, $clear, $T) { $book($t, -2, 2); $clear($t, $T(-1, 12), ['ready' => true, 'at' => $T(-1, 14)]); }, 'ready');
$case('OCCUPIED tapped, then CHECKOUT MORNING', 'stay 3d ago → out today; Occupied 3d ago 16:00', static function ($t) use ($book, $clear, $T) { $book($t, -3, 0); $clear($t, $T(-3, 16)); }, 'occupied');
$case('OCCUPIED tapped, the guest left days ago', 'stay 6d ago → out 2d ago; Occupied 6d ago 16:00', static function ($t) use ($book, $clear, $T) { $book($t, -6, -2); $clear($t, $T(-6, 16)); }, 'occupied');
$case('OCCUPIED tapped with no booking at all', 'no stay; Occupied yesterday 09:00', static function ($t) use ($clear, $T) { $clear($t, $T(-1, 9)); }, 'occupied');

// ---------------------------------------------------------------- the table
$state = Staff_Ready::state();
// What the popup offers — the board's rule (staff.js openReady), mirrored:
// every status but the one shown. tests/browser/ready-0500-test.js checks
// the page itself.
$offers = static function (array $st): string {
    $o = [];
    foreach (['ready' => 'Ready', 'notready' => 'Not Ready', 'occupied' => 'Occupied'] as $k => $w) {
        if ($k !== $st['state']) { $o[] = $w; }
    }
    return implode(' · ', $o);
};
echo "\n| Case | Input (check-in time 15:00) | Sign shown | Popup offers |\n|---|---|---|---|\n";
foreach ($cases as [$name, $input, $t, $want]) {
    $st = $state[(string) $t] ?? ['state' => '(absent)'];
    printf("| %s | %s | %s | %s |\n", $name, $input, $WORD[$st['state']] ?? $st['state'], $offers($st));
}
echo "\n";
foreach ($cases as [$name, $input, $t, $want]) {
    $got = $state[(string) $t]['state'] ?? '(absent)';
    check("$name: " . $WORD[$want], $got === $want, $state[(string) $t] ?? null);
}
check('every status is a tap (source "manual") or none (source ""): never "auto" or "occupied" (the 0.51.0 derived sources)',
    array_filter($state, static fn($s) => !in_array($s['source'], ['manual', ''], true) || ($s['source'] === '') !== ($s['state'] === 'none')) === [], $state);
check('no answer carries the 0.51.0 `stay` flag (nothing is "governed by a stay" any more)', array_filter($state, static fn($s) => array_key_exists('stay', $s)) === []);

echo "\n-- the stale page and the taps --\n";
$by = static fn(string $n): string => (string) array_values(array_filter($cases, static fn($c) => $c[0] === $n))[0][2];
$offersOf = static fn(string $n): string => $offers(Staff_Ready::state()[$by($n)]);
check('the popup on a cottage never tapped offers all three: Ready · Not Ready · Occupied', $offersOf('Never marked') === 'Ready · Not Ready · Occupied', $offersOf('Never marked'));
check('...on a guest-in cottage never tapped: the same three (no date makes it gray)', $offersOf('Never marked, a guest in') === 'Ready · Not Ready · Occupied', $offersOf('Never marked, a guest in'));
check('...on READY: Not Ready · Occupied', $offersOf('Marked Ready mid-stay') === 'Not Ready · Occupied');
check('...on NOT READY: Ready · Occupied — on a checkout day too', $offersOf('Marked Not Ready mid-stay') === 'Ready · Occupied');
check('...on OCCUPIED: Ready · Not Ready', $offersOf('Mid-stay Ready, then OCCUPIED tapped') === 'Ready · Not Ready');

$t = (int) $by('Marked Ready mid-stay');
$s1 = Staff_Ready::state()[(string) $t];
$saw = $s1['at'];                                        // phone A's page: Ready
check('(instrument) a Ready tap: its time is the tap\'s', $s1['state'] === 'ready' && $s1['at'] === $T(-1, 10), $s1);
$r = Staff_Ready::clear($t, $saw);                        // phone B taps Occupied
$s2 = Staff_Ready::state()[(string) $t];
$opt = $GLOBALS['t_options'][Staff_Ready::option_name($t)];
check('OCCUPIED TAPPED: stored as 0.52.0 stored it (the mark cleared, `cleared` its time) and the gray person shows', $r === true && $s2['state'] === 'occupied' && $opt['manual'] === null, [$r, $s2]);
check('...logged in the record ([time, 2]), its time newer than what it replaced',
    end($opt['log'])[1] === 2 && $opt['cleared'] === end($opt['log'])[0] && $s2['at'] === $opt['cleared'] && $opt['cleared'] > $saw, $opt);
$before = $GLOBALS['t_options'];
check('STALE: phone A, still showing Ready, taps Not Ready — refused, nothing written', Staff_Ready::save($t, false, $saw) === null && $GLOBALS['t_options'] === $before);
check('STALE: phone A taps Occupied from its old page — refused too', Staff_Ready::clear($t, $saw) === null && $GLOBALS['t_options'] === $before);
check('...with the status it now shows, Ready goes through', Staff_Ready::save($t, true, $s2['at']) === true && Staff_Ready::state()[(string) $t]['state'] === 'ready');
foreach (['Never marked', 'Checkout day, unmarked', 'TURNOVER day, before a tap', 'A CANCELLED booking over today'] as $n) {
    $c = (int) $by($n);
    $was = Staff_Ready::state()[(string) $c];
    check("OCCUPIED CAN BE TAPPED ON ANY COTTAGE (0.58.0): $n — saved, gray", Staff_Ready::clear($c, $was['at']) === true && Staff_Ready::state()[(string) $c]['state'] === 'occupied');
}
$fresh = (int) $by('Arrival day, nobody left that day');
check('a tap on a cottage never tapped is not stale (its time is 0)', Staff_Ready::save($fresh, false, 0) === false && Staff_Ready::state()[(string) $fresh]['state'] === 'notready');
$tt = $by('TURNOVER day, after a Ready tap');
$book((int) $tt, 4, 6);
check('a new booking changes nothing (TURNOVER, after a Ready tap, still Ready, its time the tap\'s)', Staff_Ready::state()[$tt]['state'] === 'ready');
check('THE RULE ITSELF takes no booking and no date: decide(tap, cleared)',
    Staff_Ready::decide(null, 0)['state'] === 'none' && Staff_Ready::decide(['ready' => false, 'at' => 10], 0)['state'] === 'notready'
    && Staff_Ready::decide(['ready' => true, 'at' => 10], 20)['state'] === 'occupied' && Staff_Ready::decide(['ready' => true, 'at' => 30], 20)['state'] === 'ready'
    && Staff_Ready::decide(null, 20) === ['state' => 'occupied', 'source' => 'manual', 'at' => 20]);
$GLOBALS['t_options'][Staff_Ready::option_name(9999)] = ['v' => 2, 'manual' => ['ready' => true, 'at' => 5], 'log' => []];
check('a 0.50/0.51 record (no `cleared` key) still reads: cleared 0',
    (static function (): bool { $m = new ReflectionMethod(Staff_Ready::class, 'record'); $m->setAccessible(true); $r = $m->invoke(null, 9999); return $r['cleared'] === 0 && $r['manual']['at'] === 5; })());

echo "\n-- the check-in time --\n";
$snap = Staff_Ready::state();
foreach (['00:00', '11:00', '15:00', '23:59'] as $ct) {
    $GLOBALS['t_options']['mphb_check_in_time'] = $ct;
    check("MotoPress's check-in time $ct: every status the same (it is no longer read)", Staff_Ready::state() === $snap);
}
$GLOBALS['t_options']['mphb_check_in_time'] = '15:00';
check('Staff_Ready has no check-in-time reader, no checkout or stay query', !method_exists(Staff_Ready::class, 'checkin_seconds')
    && !method_exists(Staff_Ready::class, 'latest_checkouts') && !method_exists(Staff_Ready::class, 'current_stays'));

echo "\n-- read-only, and nothing about any guest --\n";
check('every statement was a SELECT: nothing written to MotoPress', !preg_grep('/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i', $db->log), preg_grep('/^\s*(INSERT|UPDATE|DELETE)/i', $db->log));
check('the answer holds states, sources and times — no guest data', !preg_match('/Guest|DOCK|name/i', json_encode(Staff_Ready::state())));

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
