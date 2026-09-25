<?php
/**
 * month_view() — ONE query for the month, then ONE cache prime.
 *
 * The calendar draws a month of bookings across eight cottages. Done naively
 * that is a query per day or per booking; this suite is the thing that keeps
 * it at one. Two N+1s have already been hidden here by a MISSING MPHB() stub
 * — a stub kinder than production — so MPHB() is stubbed and COUNTED below.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
function _prime_post_caches($ids, $terms = true, $meta = false) { t_count('prime_post_caches'); $GLOBALS['t_primed'][] = $ids; }
function update_meta_cache($type, $ids) { t_count('update_meta_cache'); $GLOBALS['t_meta_primed'][] = $ids; }

/* MPHB, present and counted. Its absence is what hid two N+1s before. */
$GLOBALS['t_repo_calls'] = 0;
class T_Repo {
    public function findById($id) { $GLOBALS['t_repo_calls']++; return null; }
    public function findAll($a = []) { $GLOBALS['t_repo_calls']++; return []; }
}
class T_MPHB { public function getBookingRepository() { return new T_Repo(); } }
function MPHB() { return new T_MPHB(); }

// Settings is required by the classes below since 0.40.0 (Cache::ttl(),
// Staff::page_id(), the Ajax clamps, the widgets' control defaults). In
// production the plugin's autoloader supplies it on demand; these harnesses
// require their classes explicitly, so it has to be named here. Left out, the
// suite FATALS rather than failing — which mutate.php reports as NO RUN, and
// which is how this was caught before it shipped.
require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';

use MPHBAC\Staff_Data;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

/** A month of rows as query_range() returns them. */
function month(int $bookings, int $roomsEach = 1): array {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
    $GLOBALS['t_primed'] = []; $GLOBALS['t_meta_primed'] = [];
    $GLOBALS['t_repo_calls'] = 0;
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22: The Boathouse');
    $rows = [];
    $rid = 10000;
    for ($b = 1; $b <= $bookings; $b++) {
        for ($r = 0; $r < $roomsEach; $r++) {
            $rows[] = (object) [
                'booking_id' => 1000 + $b, 'reserved_id' => $rid++,
                'status' => 'confirmed', 'room_type_id' => 22,
                'check_in' => '2026-09-05', 'check_out' => '2026-09-09',
                'guest' => 'Guest ' . $b,
            ];
        }
    }
    $GLOBALS['t_rows'] = $rows;
    return $rows;
}

/* query_range() is private and SQL-backed; feed it through the wpdb stub. */
$GLOBALS['wpdb']->month_rows = [];
class T_WPDB_Month extends T_WPDB {
    public function get_results($sql, $out = null) {
        t_count('wpdb_get_results');
        if (str_contains((string) $sql, 'mphb_reserved_room')) { return $GLOBALS['t_rows'] ?? []; }
        return parent::get_results($sql, $out);
    }
}
$GLOBALS['wpdb'] = new T_WPDB_Month();

echo "-- one prime, regardless of how many bookings --\n";
foreach ([1, 8, 40] as $n) {
    month($n);
    t_reset();
    $GLOBALS['t_primed'] = []; $GLOBALS['t_meta_primed'] = [];
    Staff_Data::month_view(new DateTimeImmutable('2026-09-01'), new DateTimeImmutable('2026-09-30'));
    check("$n bookings: exactly ONE post-cache prime",
        ($GLOBALS['t_calls']['prime_post_caches'] ?? 0) === 1, $GLOBALS['t_calls']);
    check("$n bookings: exactly ONE meta prime for the reserved rooms",
        ($GLOBALS['t_calls']['update_meta_cache'] ?? 0) === 1, $GLOBALS['t_calls']);
    check("$n bookings: the month query runs ONCE, not per booking",
        ($GLOBALS['t_calls']['wpdb_get_results'] ?? 0) === 1, $GLOBALS['t_calls']);
    check("$n bookings: NO get_posts() per booking — source_for gets its ids handed to it",
        !in_array('mphb_reserved_room', $GLOBALS['t_queries'], true), $GLOBALS['t_queries']);
}

echo "\n-- the prime covers everything the loop then reads --\n";
{
    month(5);
    $GLOBALS['t_primed'] = []; $GLOBALS['t_meta_primed'] = [];
    Staff_Data::month_view(new DateTimeImmutable('2026-09-01'), new DateTimeImmutable('2026-09-30'));
    check('every booking id in the rows was primed',
        count($GLOBALS['t_primed'][0] ?? []) === 5, $GLOBALS['t_primed'][0] ?? null);
    check('every reserved-room id was meta-primed',
        count($GLOBALS['t_meta_primed'][0] ?? []) === 5, $GLOBALS['t_meta_primed'][0] ?? null);
}

echo "\n-- a multi-cottage booking is ONE entry, not several --\n";
{
    month(2, 3);        // two bookings, three reserved rooms each
    $view = Staff_Data::month_view(new DateTimeImmutable('2026-09-01'), new DateTimeImmutable('2026-09-30'));
    $ids = array_column($view['bookings'] ?? $view, 'id');
    check('two bookings across six reserved rooms produce two entries',
        count($ids) === 2 && count(array_unique($ids)) === 2, $ids);
}

echo "\n-- no MPHB repository call per booking --\n";
{
    month(12);
    $GLOBALS['t_repo_calls'] = 0;
    Staff_Data::month_view(new DateTimeImmutable('2026-09-01'), new DateTimeImmutable('2026-09-30'));
    check('ZERO repository calls — the month view reads the DB rows, not entities',
        $GLOBALS['t_repo_calls'] === 0, $GLOBALS['t_repo_calls']);
    check('(instrument check) MPHB() really is available, so a call WOULD have counted',
        function_exists('MPHB') && MPHB() instanceof T_MPHB);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
