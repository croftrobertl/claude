<?php
/**
 * THE QUERY BUDGET, for both staff paths.
 *
 * A STUB MUST NOT BE MORE FORGIVING THAN PRODUCTION. Two N+1s lived here
 * undetected because MPHB() was absent from the harness: every entity read
 * short-circuited to null and never issued the query it would issue live. So
 * MPHB() is present and every repository call is counted.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
function _prime_post_caches($ids, $terms = true, $meta = false) { t_count('prime_post_caches'); }
function update_meta_cache($type, $ids) { t_count('update_meta_cache'); }

$GLOBALS['t_repo_calls'] = [];
class T_Repo {
    public function findById($id) { $GLOBALS['t_repo_calls'][] = "findById($id)"; return null; }
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

class T_WPDB_Rows extends T_WPDB {
    public function get_results($sql, $out = null) {
        t_count('wpdb_get_results');
        if (str_contains((string) $sql, 'mphb_reserved_room')) { return $GLOBALS['t_rows'] ?? []; }
        return parent::get_results($sql, $out);
    }
}
$GLOBALS['wpdb'] = new T_WPDB_Rows();

function month_rows(int $n): void {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22: The Boathouse');
    $rows = [];
    for ($b = 1; $b <= $n; $b++) {
        $rows[] = (object) ['booking_id' => 2000 + $b, 'reserved_id' => 30000 + $b,
            'status' => 'confirmed', 'room_type_id' => 22,
            'check_in' => '2026-09-05', 'check_out' => '2026-09-09', 'guest' => "G$b"];
    }
    $GLOBALS['t_rows'] = $rows;
}

echo "-- the MONTH view: constant queries as the month fills up --\n";
{
    $budget = [];
    foreach ([1, 10, 50] as $n) {
        month_rows($n);
        t_reset();
        $GLOBALS['t_repo_calls'] = [];
        Staff_Data::month_view(new DateTimeImmutable('2026-09-01'), new DateTimeImmutable('2026-09-30'));
        $budget[$n] = [
            'sql'      => $GLOBALS['t_calls']['wpdb_get_results'] ?? 0,
            'get_posts'=> $GLOBALS['t_calls']['get_posts'] ?? 0,
            // The N+1 risk is a RESERVED-ROOM lookup per booking. The one
            // get_posts() the month view does make is the room-type list,
            // which is a single constant call — counting all get_posts()
            // together would flag that as a fault it is not.
            'reserved' => count(array_filter($GLOBALS['t_queries'], static fn($t) => $t === 'mphb_reserved_room')),
            'types'    => count(array_filter($GLOBALS['t_queries'], static fn($t) => $t === 'mphb_room_type')),
            'primes'   => ($GLOBALS['t_calls']['prime_post_caches'] ?? 0) + ($GLOBALS['t_calls']['update_meta_cache'] ?? 0),
            'repo'     => count($GLOBALS['t_repo_calls']),
        ];
    }
    check('the query budget does NOT grow with the number of bookings',
        $budget[1] == $budget[10] && $budget[10] == $budget[50], $budget);
    check('ZERO MPHB repository calls — no per-booking entity N+1',
        $budget[50]['repo'] === 0, $budget[50]);
    check('ZERO reserved-room lookups — source_for is handed the ids the month query returned',
        $budget[50]['reserved'] === 0, $budget[50]);
    check('the one get_posts() is the room-type list, and it is constant',
        $budget[1]['types'] === 1 && $budget[50]['types'] === 1, ['1' => $budget[1], '50' => $budget[50]]);
}

echo "\n-- the DETAIL view: one booking, a fixed budget --\n";
{
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = []; $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(2500, 'mphb_booking', 'confirmed', 'B', ['mphb_total_price' => 0, 'mphb_dog_type' => 'Poodle']);
    t_post(2501, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => 220, '_mphb_adults' => 2]);
    $GLOBALS['t_posts'][2501]->post_parent = 2500;
    t_reset();
    $GLOBALS['t_repo_calls'] = [];
    Staff_Data::booking_detail(2500);
    $rr = count(array_filter($GLOBALS['t_queries'], static fn($t) => $t === 'mphb_reserved_room'));
    check('the reserved rooms are resolved ONCE across all three sections', $rr === 1, $GLOBALS['t_queries']);
    check('the booking entity is fetched ONCE, not per section',
        count($GLOBALS['t_repo_calls']) <= 1, $GLOBALS['t_repo_calls']);
    check('(instrument check) MPHB() is present, so a per-section fetch WOULD have counted',
        function_exists('MPHB'));
}

echo "\n-- adding a pet fee does not add a query per service --\n";
{
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = []; $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(2600, 'mphb_booking', 'confirmed', 'B', ['mphb_total_price' => 0]);
    t_post(2601, 'mphb_reserved_room', 'publish', 'RR',
        ['_mphb_room_id' => 220, '_mphb_adults' => 2, '_mphb_services' => [77 => 1, 78 => 1, 79 => 2]]);
    $GLOBALS['t_posts'][2601]->post_parent = 2600;
    foreach ([77 => 'Pet Fee', 78 => 'Early Check-in', 79 => 'Late Checkout'] as $sid => $title) {
        t_post($sid, 'mphb_room_service', 'publish', $title);
    }
    t_reset();
    Staff_Data::booking_detail(2600);
    $svc = count(array_filter($GLOBALS['t_queries'], static fn($t) => $t === 'mphb_room_service'));
    check('three services cost ONE query, not three', $svc === 1, $GLOBALS['t_queries']);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
