<?php
/**
 * 0.58.0 — NO STATUS CHANGES WITHOUT A TAP (Rob, 2026-11-06, FINAL).
 *
 * "Ready", "Not Ready" and "Occupied" change ONLY when staff tap them: not at
 * midnight before a check-in, not at the check-in time, not at checkout, not
 * 14 days after a checkout. Through the plugin's real SQL on SQLite and its
 * real Staff_Ready::state().
 *
 * THE CLOCK WALK. The site's clock cannot be moved from PHP, so the WORLD is
 * moved instead, which is the same thing to the code under test: to stand
 * `n` days after the check-in day D, every booking AND every stored tap is
 * placed n days earlier against the real today. At each step MotoPress's
 * check-in time is also swept from 00:00 to 23:59, so "now" falls before and
 * after it. The 0.51.0–0.57.1 rule changed signs at these steps (the walk's
 * table says which); 0.58.0 must show every cottage exactly as tapped at
 * every step. Each row of the walk is a check.
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/sqlite-wpdb.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function update_meta_cache($t, $ids) { return true; }

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

// THE COTTAGES, against the check-in day D (offsets in days from D), and the
// tap each was given. [type, label, bookings [[in, out, status, first, last]],
// tap [kind, day, hour] | null, what 0.57.1 showed somewhere on the walk].
$COTTAGES = [
    [201, 'A: arriving D at 2 PM, Not Ready tapped D−1 6 PM (Rob\'s 11/6)', [[0, 3]], ['notready', -1, 18], 'Occupied from D 00:00; Not Ready from D+3'],
    [202, 'B: arriving D, Ready tapped D−1 5 PM', [[0, 3]], ['ready', -1, 17], 'Occupied from D 00:00; Not Ready from D+3'],
    [203, 'C: arriving D, never tapped', [[0, 3]], null, 'Occupied from D 00:00; Not Ready from D+3'],
    [204, 'D: checked in D−4, Occupied tapped D−4 4 PM, out D', [[-4, 0]], ['occupied', -4, 16], 'Not Ready from D 00:00; none from D+14'],
    [205, 'E: in D−3, Ready tapped mid-stay D−2, out D', [[-3, 0]], ['ready', -2, 10], 'Not Ready from D 00:00; none from D+14'],
    [206, 'F: TURNOVER on D (out D, in D), Not Ready tapped D−3 4 PM', [[-3, 0], [0, 4]], ['notready', -3, 16], 'Occupied on D−1 if the check-in time is after 4 PM; Not Ready D; Occupied D+1 to D+3; Not Ready D+4'],
    [207, 'G: out D−13, never tapped', [[-20, -13]], null, 'Not Ready until D, none from D+1 (RED_DAYS)'],
    [208, 'H: a pending booking arriving D, Ready tapped D−2', [[0, 2, 'pending']], ['ready', -2, 12], 'Occupied D to D+1, Ready again from D+2'],
    [209, 'I: a dock block over D, Occupied tapped D−1', [[-1, 2, 'confirmed', 'DOCK', 'BLOCK']], ['occupied', -1, 9], 'none: an Occupied tap showed only during a guest\'s stay'],
];
$TYPES = array_map(static fn($c) => $c[0], $COTTAGES);
$want = [];
foreach ($COTTAGES as [$t, , , $tap]) { $want[$t] = $tap === null ? 'none' : $tap[0]; }

/** The world n days after D: a fresh database, every booking and tap n days earlier. */
$world = static function (int $n) use ($COTTAGES, $D, $T): void {
    $db = new T_SQLite_WPDB();
    $GLOBALS['wpdb'] = $db;
    t_cache_clear();
    foreach (array_keys($GLOBALS['t_options']) as $k) {
        if (str_starts_with((string) $k, 'mphbac_ready_')) { unset($GLOBALS['t_options'][$k]); }
    }
    $id = 970000 + 1000 * ($n + 50);
    foreach ($COTTAGES as [$t, , $books, $tap]) {
        t_post($t, 'mphb_room_type', 'publish', "Cottage $t: Walk");
        $db->post($t * 100, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $t]);
        foreach ($books as $bk) {
            [$ci, $co] = $bk;
            $status = $bk[2] ?? 'confirmed';
            $meta = ['mphb_check_in_date' => $D($ci - $n), 'mphb_check_out_date' => $D($co - $n), 'mphb_first_name' => $bk[3] ?? 'Guest', 'mphb_last_name' => $bk[4] ?? 'X'];
            $b = ($id += 10);
            $db->post($b, 'mphb_booking', $status, 0, $meta);
            t_post($b, 'mphb_booking', $status, '', $meta);
            $db->post($b + 1, 'mphb_reserved_room', 'publish', $b, ['_mphb_room_id' => $t * 100]);
        }
        if ($tap !== null) {
            $at = $T($tap[1] - $n, $tap[2]);
            $GLOBALS['t_options'][Staff_Ready::option_name($t)] = $tap[0] === 'occupied'
                ? ['v' => 2, 'manual' => null, 'cleared' => $at, 'log' => [[$at, 2]]]
                : ['v' => 2, 'manual' => ['ready' => $tap[0] === 'ready', 'at' => $at], 'cleared' => 0, 'log' => [[$at, $tap[0] === 'ready' ? 1 : 0]]];
        }
    }
};
$tapAt = static fn(array $tap, int $n): int => $T($tap[1] - $n, $tap[2]);

echo "-- 1. THE WALK: D−1 evening → D (midnight, 1:08 AM, the check-in time) → checkout → 15 days on --\n";
$STEPS = [-1 => 'the evening before check-in (D−1)', 0 => 'CHECK-IN DAY D: past midnight (Rob saw Occupied at 1:08 AM)',
    1 => 'D+1, the morning after a turnover', 3 => 'D+3, CHECKOUT day of A, B, C', 4 => 'D+4, the day after', 15 => 'D+15, past the old 14-day Not Ready'];
$SWEEP = ['00:00', '01:08', '11:00', '14:00', '15:00', '23:59'];
echo "\n| Cottage | Tapped | Shown at every step (0.58.0) | What 0.57.1 did on this walk |\n|---|---|---|---|\n";
foreach ($COTTAGES as [$t, $label, , $tap, $was]) {
    printf("| %s | %s | %s | %s |\n", $label, $tap === null ? 'never' : $tap[0], $want[$t], $was);
}
echo "\n";
foreach ($STEPS as $n => $words) {
    $world($n);
    $seen = [];
    foreach ($SWEEP as $ct) {
        $GLOBALS['t_options']['mphb_check_in_time'] = $ct;
        $s = Staff_Ready::state();
        $seen[] = $s;
        $got = array_map(static fn($t) => $s[(string) $t]['state'] ?? '(absent)', $TYPES);
        $times = true;
        foreach ($COTTAGES as [$t, , , $tap]) {
            $times = $times && $s[(string) $t]['at'] === ($tap === null ? 0 : $tapAt($tap, $n));
        }
        check(sprintf('%-62s check-in time %s: every cottage as tapped, each time the tap\'s', $words, $ct),
            $got === array_values($want) && $times, array_combine($TYPES, $got));
    }
    check("$words: the same answer whatever the check-in time", count(array_unique(array_map('json_encode', $seen))) === 1);
}
unset($GLOBALS['t_options']['mphb_check_in_time']);

echo "\n-- 2. THE STALE PAGE ACROSS MIDNIGHT AND CHECKOUT --\n";
// One world, the bookings moved under it as the clock would move them: a
// page loaded before midnight is NOT stale after it (0.57.1: the arrival
// midnight was a new event, so the morning's tap was refused as "changed").
$world(-1);
$page = Staff_Ready::state();
$db = $GLOBALS['wpdb'];
$db->post(990001, 'mphb_booking', 'confirmed', 0, ['mphb_check_in_date' => $D(-2), 'mphb_check_out_date' => $D(0)]);
t_post(990001, 'mphb_booking', 'confirmed', '', ['mphb_check_in_date' => $D(-2), 'mphb_check_out_date' => $D(0), 'mphb_first_name' => 'Late', 'mphb_last_name' => 'Sync']);
$db->post(990002, 'mphb_reserved_room', 'publish', 990001, ['_mphb_room_id' => 20300]);
$db->post(990011, 'mphb_booking', 'confirmed', 0, ['mphb_check_in_date' => $D(0), 'mphb_check_out_date' => $D(2)]);
t_post(990011, 'mphb_booking', 'confirmed', '', ['mphb_check_in_date' => $D(0), 'mphb_check_out_date' => $D(2), 'mphb_first_name' => 'Walk', 'mphb_last_name' => 'In']);
$db->post(990012, 'mphb_reserved_room', 'publish', 990011, ['_mphb_room_id' => 20700]);
check('a checkout today and an arrival today appear under a loaded page: no status and no time changes', Staff_Ready::state() === $page, Staff_Ready::state());
check('...so the page\'s next tap goes through (not "changed"): C Not Ready, G Occupied',
    Staff_Ready::save(203, false, $page['203']['at']) === false && Staff_Ready::clear(207, $page['207']['at']) === true
    && Staff_Ready::state()['203']['state'] === 'notready' && Staff_Ready::state()['207']['state'] === 'occupied');

echo "\n-- 3. NOTHING BUT THE TAPS IS READ --\n";
$db->log = [];
Staff_Ready::state();
check('Staff_Ready::state() runs NO SQL at all: no booking, no checkout, no stay is read', $db->log === [], $db->log);
$src = (string) file_get_contents($ROOT . '/includes/class-staff-ready.php');
$body = static function (string $fn) use ($src): string {
    preg_match('/function ' . $fn . '\(.*?\n    \}\n/s', $src, $m);
    return $m[0] ?? '';
};
check('state() and decide() read no date and no clock (no today(), time(), DateTime, strtotime, date())',
    $body('state') !== '' && $body('decide') !== ''
    && !preg_match('/today\(|\btime\(|DateTime|strtotime|\bdate\(|current_time|\$wpdb|get_results|checkin/i', $body('state') . $body('decide')),
    [$body('state'), $body('decide')]);
check('the class holds no automatic rule: no RED_DAYS, no checkout or stay query, no check-in time',
    !preg_match('/RED_DAYS|LOOKBACK|latest_checkouts|current_stays|checkin_seconds|mphb_check_in_time|mphb_check_out_date/', $src));
check('save() and clear() still refuse a stale page — the only use of the clock is the time of the tap itself',
    substr_count($src, "\$current['at'] > \$seen") === 2 && substr_count($src, 'time()') === 2);
$plugin = (string) file_get_contents($ROOT . '/mphb-availability-calendar.php');
$all = $plugin . implode('', array_map('file_get_contents', glob($ROOT . '/includes/*.php')));
check('NO CRON and NO SCHEDULED EVENT anywhere in the plugin (nothing changes a status on a timer)',
    !preg_match('/wp_schedule_event|wp_schedule_single_event|wp_cron|cron_schedules/i', $all));
check('...and the one activation hook is the cache exclusion (0.4x), which never touches a status',
    preg_match_all('/register_activation_hook\(/', $all) === 1 && str_contains($plugin, "register_activation_hook(__FILE__, ['\\\\MPHBAC\\\\Cache_Integration', 'on_activate']);")
    && !preg_match('/mphbac_ready|Staff_Ready/', (string) file_get_contents($ROOT . '/includes/class-cache-integration.php')));
$js = (string) file_get_contents($ROOT . '/assets/js/staff.js');
preg_match('/function adoptTurnover\(t\) \{.*?\n        \}\n/s', $js, $adopt);
preg_match('/function paintDot\(label\) \{.*?\n        \}\n/s', $js, $paint);
check('THE BOARD only shows what the server stored: adoptTurnover() and paintDot() read no booking, date or clock',
    isset($adopt[0], $paint[0]) && !preg_match('/booking|checkin|checkout|today|Date\b|new Date|config\.today|stay/i', $adopt[0] . $paint[0]), [$adopt[0] ?? '', $paint[0] ?? '']);

echo "\n-- 4. THE UPGRADE: every stored status stays exactly as it is --\n";
// What 0.52.0–0.57.1 stored, read by 0.58.0: a Ready, a Not Ready, an
// Occupied tap (cleared), a Ready after an Occupied, and a 0.48/0.49 record.
$world(0);
$GLOBALS['t_options'][Staff_Ready::option_name(201)] = ['v' => 2, 'manual' => ['ready' => true, 'at' => 1000], 'log' => [[1000, 1]]];
$GLOBALS['t_options'][Staff_Ready::option_name(202)] = ['v' => 2, 'manual' => ['ready' => false, 'at' => 1000], 'log' => [[1000, 0]]];
$GLOBALS['t_options'][Staff_Ready::option_name(203)] = ['v' => 2, 'manual' => null, 'cleared' => 2000, 'log' => [[1000, 1], [2000, 2]]];
$GLOBALS['t_options'][Staff_Ready::option_name(204)] = ['v' => 2, 'manual' => ['ready' => true, 'at' => 3000], 'cleared' => 2000, 'log' => [[2000, 2], [3000, 1]]];
$GLOBALS['t_options'][Staff_Ready::option_name(205)] = [$D(-3) => ['ready' => true, 'log' => [[4000, 1]]]];
unset($GLOBALS['t_options'][Staff_Ready::option_name(206)]);
$taps = static fn(): array => array_filter($GLOBALS['t_options'], static fn($k) => str_starts_with((string) $k, 'mphbac_ready_'), ARRAY_FILTER_USE_KEY);
$before = $taps();                         // taken BEFORE anything reads them
$s = Staff_Ready::state();
check('a stored Ready reads Ready; Not Ready, Not Ready; an Occupied tap, Occupied; Ready after Occupied, Ready; a 0.48/0.49 Ready, Ready; nothing stored, none',
    [$s['201']['state'], $s['202']['state'], $s['203']['state'], $s['204']['state'], $s['205']['state'], $s['206']['state']] === ['ready', 'notready', 'occupied', 'ready', 'ready', 'none'],
    array_map(static fn($x) => $x['state'], $s));
check('...each with the time of its tap', [$s['201']['at'], $s['203']['at'], $s['204']['at'], $s['205']['at']] === [1000, 2000, 3000, 4000]);
Staff_Ready::state();
check('...and reading them (twice) writes nothing: no stored status is migrated, reset or cleaned — byte for byte', $taps() === $before, $taps());
check('ROLLBACK: 0.58.0 stores Occupied exactly as 0.52.0–0.57.1 did (manual null, cleared = the tap)',
    (static function () use ($s): bool {
        Staff_Ready::clear(206, $s['206']['at']);
        $o = $GLOBALS['t_options'][Staff_Ready::option_name(206)];
        return $o['v'] === 2 && $o['manual'] === null && is_int($o['cleared']) && $o['cleared'] > 0 && end($o['log'])[1] === 2 && array_keys($o) === ['v', 'manual', 'log', 'cleared'];
    })(), $GLOBALS['t_options'][Staff_Ready::option_name(206)] ?? null);

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
