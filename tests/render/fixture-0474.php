<?php
/**
 * THE 0.47.4 SITE: bookings in a real (SQLite) database and MotoPress's rule
 * engine over them — loaded by boot.php when MPHBAC_FIXTURE_0474 is set, so
 * render.php (the page, its embedded first paint) and ajax.php (the endpoint)
 * answer from the same site. The value picks the rules:
 *
 *   live      the site's rules on 2026-10-17 (the WD): a 2-night minimum,
 *             nothing else — what boot.php sets anyway
 *   fixture   the staging fixture the WD will build, every rule at once:
 *               - no check-in on Tuesdays (every cottage);
 *               - a SEASON from today+30 to today+60 with a 3-night minimum
 *                 (2 nights everywhere else, as live);
 *               - a 14-night maximum;
 *               - a 1-day buffer;
 *               - a 1-day minimum advance (no arrival today).
 *   checkout  fixture + no check-OUT on Wednesdays and a 60-day maximum
 *             advance (not on the WD's list; here so the departure rule and
 *             the "too far ahead" days are exercised too)
 *   throw     fixture, but every call into MotoPress throws: the fallback
 *
 * Bookings are relative to today, so the dates move but the shapes do not.
 * All are confirmed except where noted. The Boathouse (1071) carries the
 * buffer case: a stay today+10 … today+13, so with the buffer today+9 and
 * today+13 close too (0.47.3 showed them open).
 */
require_once dirname(__DIR__) . '/sqlite-wpdb.php';

$f_mode = (string) getenv('MPHBAC_FIXTURE_0474');
$f_db = new T_SQLite_WPDB();
$GLOBALS['wpdb'] = $f_db;
$f_db->create_blocks_table();
$f_db->create_custom_rules_table();

$f_tz = new DateTimeZone('America/New_York');
$f_today = new DateTimeImmutable('today', $f_tz);
$f_d = static fn(int $n): string => $f_today->modify(($n >= 0 ? '+' : '') . $n . ' days')->format('Y-m-d');

$f_n = 0;
foreach (array_keys($cottages) as $f_type) {
    $f_db->post($f_type * 10, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => $f_type]);
}
$f_book = static function (int $type, int $ci, int $co, string $status = 'confirmed', bool $imported = false) use ($f_db, $f_d, &$f_n): void {
    $b = 700000 + (++$f_n) * 2;
    $f_db->post($b, 'mphb_booking', $status, 0, ['mphb_check_in_date' => $f_d($ci), 'mphb_check_out_date' => $f_d($co)]
        + ($imported ? ['_mphb_sync_id' => 'ical-' . $b] : []));
    $f_db->post($b + 1, 'mphb_reserved_room', 'publish', $b, ['_mphb_room_id' => $type * 10]);
};
$f_book(1071, 10, 13);                       // the buffer case
$f_book(1069, 2, 6);
$f_book(1069, 20, 27);
$f_book(1067, 5, 9);
$f_book(1065, 14, 18);
$f_book(1604, 3, 5);
$f_book(1604, 40, 48);
$f_book(1607, 1, 4);
$f_book(1740, 7, 12, 'confirmed', true);     // imported (iCal)
$f_book(1742, 25, 31);

$GLOBALS['t_mphb']['seasons'] = [];
foreach ([[2080, '2025-12-31', '2027-03-31'], [2082, '2025-04-15', '2025-12-15'], [2079, '2024-12-15', '2025-04-15'], [2081, '2024-04-15', '2024-12-15']] as [$f_sid, $f_a, $f_b]) {
    t_mphb_season($f_sid, $f_a, $f_b);
}
$GLOBALS['t_options']['mphb_min_stay_length'] = [['season_ids' => [0], 'room_type_ids' => [0], 'min_stay_length' => 2]];

if (in_array($f_mode, ['fixture', 'checkout', 'throw'], true)) {
    t_mphb_season(9001, $f_d(30), $f_d(60));
    $GLOBALS['t_options']['mphb_check_in_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'check_in_days' => [0, 1, 3, 4, 5, 6]]];
    $GLOBALS['t_options']['mphb_min_stay_length'] = [
        ['season_ids' => [9001], 'room_type_ids' => [0], 'min_stay_length' => 3],
        ['season_ids' => [0], 'room_type_ids' => [0], 'min_stay_length' => 2],
    ];
    $GLOBALS['t_options']['mphb_max_stay_length'] = [['season_ids' => [0], 'room_type_ids' => [0], 'max_stay_length' => 14]];
    $GLOBALS['t_options']['mphb_buffer_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'buffer_days' => 1]];
    $GLOBALS['t_options']['mphb_min_advance_reservation'] = [['season_ids' => [0], 'room_type_ids' => [0], 'min_advance_reservation' => 1]];
}
if ($f_mode === 'checkout') {
    $GLOBALS['t_options']['mphb_check_out_days'] = [['season_ids' => [0], 'room_type_ids' => [0], 'check_out_days' => [0, 1, 2, 4, 5, 6]]];
    $GLOBALS['t_options']['mphb_max_advance_reservation'] = [['season_ids' => [0], 'room_type_ids' => [0], 'max_advance_reservation' => 60]];
}
if ($f_mode === 'throw') {
    $GLOBALS['t_mphb']['throw'] = new RuntimeException('simulated MotoPress failure');
}
