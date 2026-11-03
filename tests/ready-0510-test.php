<?php
/**
 * 0.51.0 — OCCUPIED: THE GRAY SIGN WHILE A GUEST IS IN (Rob's picks).
 *
 * Every case, through the plugin's real SQL on SQLite and its real rule
 * (Staff_Ready::state → decide), with MotoPress's check-in time set to 15:00.
 * Each case is its own cottage, so they cannot disturb one another. The run
 * prints THE TABLE the WD asked for — the input and the sign shown — and
 * every row is a check.
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
$case('Never marked', 'no stay, no checkout, no mark', static function ($t) {}, 'none');
$case('Never marked, a guest in', 'stay in 2d ago → out in 2d; no mark', static function ($t) use ($book) { $book($t, -2, 2); }, 'occupied');
$case('Marked Ready BEFORE arrival', 'Ready 3d ago 10:00; stay in 1d ago → out in 2d', static function ($t) use ($book, $mark, $T) { $book($t, -1, 2); $mark($t, true, $T(-3, 10)); }, 'occupied');
$case('Marked Ready on arrival day BEFORE check-in time', 'stay in 1d ago; Ready that day 14:00 (check-in 15:00)', static function ($t) use ($book, $mark, $T) { $book($t, -1, 2); $mark($t, true, $T(-1, 14)); }, 'occupied');
$case('Marked Ready on arrival day AFTER check-in time', 'stay in 1d ago; Ready that day 16:00', static function ($t) use ($book, $mark, $T) { $book($t, -1, 2); $mark($t, true, $T(-1, 16)); }, 'ready');
$case('Marked Not Ready mid-stay', 'stay in 2d ago → out in 2d; Not Ready yesterday 10:00', static function ($t) use ($book, $mark, $T) { $book($t, -2, 2); $mark($t, false, $T(-1, 10)); }, 'notready');
$case('Marked Ready mid-stay', 'stay in 2d ago → out in 2d; Ready yesterday 10:00', static function ($t) use ($book, $mark, $T) { $book($t, -2, 2); $mark($t, true, $T(-1, 10)); }, 'ready');
$case('Arrival day, nobody left that day', 'stay in today → out in 3d; no mark', static function ($t) use ($book) { $book($t, 0, 3); }, 'occupied');
$case('Checkout day, unmarked', 'stay 3d ago → out today; no mark', static function ($t) use ($book) { $book($t, -3, 0); }, 'notready');
$case('Checkout day, after a mid-stay Ready', 'stay 3d ago → out today; Ready yesterday 10:00', static function ($t) use ($book, $mark, $T) { $book($t, -3, 0); $mark($t, true, $T(-1, 10)); }, 'notready');
$case('Checkout day, marked Ready after it', 'stay 3d ago → out today; Ready today (now)', static function ($t) use ($book, $mark) { $book($t, -3, 0); $mark($t, true, time()); }, 'ready');
$case('TURNOVER day, before a Ready tap', 'A out today, B in today → out in 3d; no mark', static function ($t) use ($book) { $book($t, -3, 0); $book($t, 0, 3); }, 'notready');
$case('TURNOVER day, after a Ready tap', 'A out today, B in today; Ready today (now)', static function ($t) use ($book, $mark) { $book($t, -3, 0); $book($t, 0, 3); $mark($t, true, time()); }, 'ready');
$case('Morning after turnover, Ready tapped BEFORE check-in time', 'A out yesterday, B in yesterday; Ready yesterday 14:00', static function ($t) use ($book, $mark, $T) { $book($t, -3, -1); $book($t, -1, 3); $mark($t, true, $T(-1, 14)); }, 'occupied');
$case('Morning after turnover, Ready tapped AFTER check-in time', 'A out yesterday, B in yesterday; Ready yesterday 16:00', static function ($t) use ($book, $mark, $T) { $book($t, -3, -1); $book($t, -1, 3); $mark($t, true, $T(-1, 16)); }, 'ready');
$case('Morning after turnover, untapped', 'A out yesterday, B in yesterday; no mark', static function ($t) use ($book) { $book($t, -3, -1); $book($t, -1, 3); }, 'occupied');
$case('A DOCK BLOCK in the cottage', 'dock block in 2d ago → out in 2d', static function ($t) use ($book) { $book($t, -2, 2, 'confirmed', 'DOCK', 'BLOCK'); }, 'none');
$case('A CANCELLED booking over today', 'cancelled, in 2d ago → out in 2d', static function ($t) use ($book) { $book($t, -2, 2, 'cancelled'); }, 'none');
$case('A PENDING booking over today (the calendar draws it)', 'pending, in 2d ago → out in 2d', static function ($t) use ($book) { $book($t, -2, 2, 'pending'); }, 'occupied');
$case('A guest in, after an old manual Not Ready', 'Not Ready 30d ago; stay in 2d ago → out in 2d', static function ($t) use ($book, $mark, $T) { $book($t, -2, 2); $mark($t, false, $T(-30, 12)); }, 'occupied');
$case('The day after checkout, a mid-stay Not Ready', 'stay 4d ago → out yesterday; Not Ready 2d ago', static function ($t) use ($book, $mark, $T) { $book($t, -4, -1); $mark($t, false, $T(-2, 10)); }, 'notready');
// 0.52.0: the Occupied button — it clears the mark.
$case('Mid-stay Ready, then OCCUPIED tapped', 'stay in 2d ago → out in 2d; Ready yesterday 10:00, Occupied yesterday 12:00', static function ($t) use ($book, $clear, $T) { $book($t, -2, 2); $clear($t, $T(-1, 12)); }, 'occupied');
$case('Mid-stay Not Ready, then OCCUPIED tapped', 'stay in 2d ago → out in 2d; Not Ready yesterday 10:00, Occupied yesterday 12:00', static function ($t) use ($book, $clear, $T) { $book($t, -2, 2); $clear($t, $T(-1, 12)); }, 'occupied');
$case('OCCUPIED tapped, then Ready again', 'stay in 2d ago; Occupied yesterday 12:00, Ready yesterday 14:00', static function ($t) use ($book, $clear, $T) { $book($t, -2, 2); $clear($t, $T(-1, 12), ['ready' => true, 'at' => $T(-1, 14)]); }, 'ready');
$case('OCCUPIED tapped, then CHECKOUT MORNING', 'stay 3d ago → out today; Occupied yesterday 12:00', static function ($t) use ($book, $clear, $T) { $book($t, -3, 0); $clear($t, $T(-1, 12)); }, 'notready');

// ---------------------------------------------------------------- the table
$state = Staff_Ready::state();
// What the popup offers — the board's rule (staff.js openReady), mirrored:
// the choices it is not showing, Occupied only while the Occupied rule
// governs. tests/browser/ready-0500-test.js checks the page itself.
$offers = static function (array $st): string {
    $o = [];
    foreach (['ready' => 'Ready', 'notready' => 'Not Ready', 'occupied' => 'Occupied'] as $k => $w) {
        if ($k !== $st['state'] && ($k !== 'occupied' || !empty($st['stay']))) { $o[] = $w; }
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

echo "\n-- the stale page and the marks --\n";
$t = 100 + count($cases) + 1;
t_post($t, 'mphb_room_type', 'publish', "Cottage $t: Case");
$db->post($t * 100, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $t]);
$book($t, -2, 2);
t_cache_clear();   // the cottage list is cached: let it see the new cottage
$s = Staff_Ready::state()[(string) $t];
check('(instrument) a cottage with a guest in: Occupied, its time the start of the stay\'s first Occupied day', $s['state'] === 'occupied' && $s['at'] === $T(-2), $s);
check('Ready marked now on an Occupied cottage: saved, and it REPLACES gray (made after check-in time)', Staff_Ready::save($t, true, $s['at']) === true && Staff_Ready::state()[(string) $t]['state'] === 'ready');
$s2 = Staff_Ready::state()[(string) $t];
check('a page still showing Occupied cannot overwrite it: refused (409)', Staff_Ready::save($t, false, $s['at']) === null && Staff_Ready::state()[(string) $t]['state'] === 'ready');
check('...with the state it now shows, Not Ready goes through', Staff_Ready::save($t, false, $s2['at']) === false && Staff_Ready::state()[(string) $t]['state'] === 'notready');
$tt = (string) array_values(array_filter($cases, static fn($c) => $c[0] === 'TURNOVER day, after a Ready tap'))[0][2];
$book((int) $tt, 4, 6);   // a later stay changes nothing today
check('a future stay changes nothing today (TURNOVER, after a Ready tap, still Ready)', Staff_Ready::state()[$tt]['state'] === 'ready');
check('the turnover morning\'s change is a NEW time, so a page from the turnover day is stale the next morning',
    (static function () use ($T): bool {
        $d = Staff_Ready::decide(Data_Provider::today()->modify('-1 day')->format('Y-m-d'), null, Data_Provider::today()->modify('-1 day')->format('Y-m-d'), 15 * 3600);
        return $d['state'] === 'occupied' && $d['at'] === $T(0);
    })());

echo "\n-- 0.52.0: OCCUPIED, tapped (Staff_Ready::clear) --\n";
$by = static fn(string $n): string => (string) array_values(array_filter($cases, static fn($c) => $c[0] === $n))[0][2];
$offersOf = static fn(string $n): string => $offers(Staff_Ready::state()[$by($n)]);
$g = Staff_Ready::state()[$by('Never marked, a guest in')];
check('a GRAY cottage is flagged as governed by the stay (stay: true) — what lets Occupied be offered after a mark', $g['state'] === 'occupied' && $g['stay'] === true, $g);
check('the popup on a GRAY cottage offers Ready · Not Ready (as in 0.51.0)', $offersOf('Never marked, a guest in') === 'Ready · Not Ready', $offersOf('Never marked, a guest in'));
check('...on a mid-stay READY: Not Ready · Occupied', $offersOf('Marked Ready mid-stay') === 'Not Ready · Occupied', $offersOf('Marked Ready mid-stay'));
check('...on a mid-stay NOT READY: Ready · Occupied', $offersOf('Marked Not Ready mid-stay') === 'Ready · Occupied', $offersOf('Marked Not Ready mid-stay'));
check('...NEVER Occupied with no guest in (checkout day: Ready only; never marked: Ready · Not Ready)',
    $offersOf('Checkout day, unmarked') === 'Ready' && $offersOf('Never marked') === 'Ready · Not Ready', [$offersOf('Checkout day, unmarked'), $offersOf('Never marked')]);
check('...and not on a TURNOVER day, which the checkout governs (Ready only)', $offersOf('TURNOVER day, before a Ready tap') === 'Ready', $offersOf('TURNOVER day, before a Ready tap'));
$t = (int) $by('Marked Ready mid-stay');
$s1 = Staff_Ready::state()[(string) $t];
$saw = $s1['at'];                                        // phone A's page: Ready
check('(instrument) mid-stay Ready, governed by the stay', $s1['state'] === 'ready' && $s1['stay'] === true, $s1);
$r = Staff_Ready::clear($t, $saw);                        // phone B taps Occupied
$s2 = Staff_Ready::state()[(string) $t];
$opt = $GLOBALS['t_options'][Staff_Ready::option_name($t)];
check('OCCUPIED TAPPED: the mark is cleared and the gray person shows', $r === true && $s2['state'] === 'occupied' && $opt['manual'] === null, [$r, $s2]);
check('...logged in the record ([time, 2]) with its time kept as `cleared` — the one key 0.52.0 adds',
    end($opt['log'])[1] === 2 && $opt['cleared'] === end($opt['log'])[0] && $s2['at'] === $opt['cleared'] && $opt['cleared'] > $saw, $opt);
$before = $GLOBALS['t_options'];
check('STALE: phone A, still showing Ready, taps Not Ready — refused, nothing written', Staff_Ready::save($t, false, $saw) === null && $GLOBALS['t_options'] === $before);
check('STALE: phone A taps Occupied from its old page — refused too', Staff_Ready::clear($t, $saw) === null && $GLOBALS['t_options'] === $before);
check('...with the state it now shows, Ready goes through', Staff_Ready::save($t, true, $s2['at']) === true && Staff_Ready::state()[(string) $t]['state'] === 'ready');
$nog = (int) $by('Never marked');
$before = $GLOBALS['t_options'];
check('Occupied with NO GUEST IN: refused, nothing written', Staff_Ready::clear($nog, PHP_INT_MAX) === null && $GLOBALS['t_options'] === $before);
check('...nor on a TURNOVER day (the checkout governs it)', Staff_Ready::clear((int) $by('TURNOVER day, before a Ready tap'), PHP_INT_MAX) === null && $GLOBALS['t_options'] === $before);
$co = (int) $by('Checkout day, after a mid-stay Ready');
check('...nor on a guest\'s CHECKOUT day (no guest in)', Staff_Ready::clear($co, PHP_INT_MAX) === null && $GLOBALS['t_options'] === $before);
$GLOBALS['t_options'][Staff_Ready::option_name(9999)] = ['v' => 2, 'manual' => ['ready' => true, 'at' => 5], 'log' => []];
check('a 0.50/0.51 record (no `cleared` key) still reads: cleared 0',
    (static function (): bool { $m = new ReflectionMethod(Staff_Ready::class, 'record'); $m->setAccessible(true); $r = $m->invoke(null, 9999); return $r['cleared'] === 0 && $r['manual']['at'] === 5; })());

echo "\n-- the check-in time --\n";
check('read from MotoPress\'s setting: 15:00 → 54,000 seconds', Staff_Ready::checkin_seconds() === 54000, Staff_Ready::checkin_seconds());
$GLOBALS['t_options']['mphb_check_in_time'] = '11:30';
check('...a changed setting is used: 11:30 → 41,400', Staff_Ready::checkin_seconds() === 41400, Staff_Ready::checkin_seconds());
unset($GLOBALS['t_options']['mphb_check_in_time']);
check('...unset: MotoPress\'s own default, 11:00', Staff_Ready::checkin_seconds() === 39600, Staff_Ready::checkin_seconds());
$GLOBALS['t_options']['mphb_check_in_time'] = '15:00';
$d1 = Staff_Ready::decide(null, ['ready' => true, 'at' => $T(-1, 14, 59)], $D(-1), 15 * 3600);
$d2 = Staff_Ready::decide(null, ['ready' => true, 'at' => $T(-1, 15, 1)], $D(-1), 15 * 3600);
$d3 = Staff_Ready::decide(null, ['ready' => true, 'at' => $T(-1, 15, 0)], $D(-1), 15 * 3600);
check('the boundary: a mark at 14:59 on arrival day is pre-stay (Occupied), at 15:01 it counts (Ready), at 15:00 exactly it is pre-stay',
    $d1['state'] === 'occupied' && $d2['state'] === 'ready' && $d3['state'] === 'occupied', [$d1, $d2, $d3]);

echo "\n-- read-only, and nothing about any guest --\n";
check('every statement was a SELECT: nothing written to MotoPress', !preg_grep('/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i', $db->log), preg_grep('/^\s*(INSERT|UPDATE|DELETE)/i', $db->log));
check('the answer holds states, sources and times — no guest data', !preg_match('/Guest|DOCK|name/i', json_encode(Staff_Ready::state())));

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
