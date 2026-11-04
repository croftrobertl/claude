<?php
/**
 * 0.56.0 — THE POP-UP'S SAMPLE BOOKINGS, THROUGH THE REAL Staff_Data.
 *
 *   php tests/render/popup-0560.php <plugin_dir>
 *
 * Builds nine invented bookings (no real guest data) the way the other PHP
 * tests do — posts and meta through tests/bootstrap.php, and a stand-in for
 * MotoPress's booking entity where only it can say something (the guest's
 * note, the internal notes, the amount paid) — and prints, as JSON, for the
 * plugin in <plugin_dir> (this checkout, or 0.55.0 taken from git):
 *   details  booking_detail() per booking: what the pop-up is sent
 *   search   search_doc() per booking
 *   index    Staff_Search::index(): the search index itself
 * So "before" and "after" are each version's own server output, and the
 * index of the two can be compared byte for byte.
 *
 * Today is 2026-11-04 (the stills' "this year" is 2026).
 *   801  direct, Cottage 33: Pineapple Place, Fri Nov 6 – Mon Nov 9, Total
 *        $640.00, paid $200.00 → Balance Due $440.00
 *   802  Booking.com, no guest count, Wed Sep 30 – Sun Oct 4 (the longest
 *        tile date at 320px)
 *   803  Airbnb, a CONFIRMED count (3 adults, 1 child)
 *   804  direct, three notes: the guest's and two staff notes
 *   805  Vrbo, no count, no notes
 *   806  direct, two cottages (22 and 23)
 *   807  direct, Dog + Boat + Guest 2 rows
 *   808  direct, a long cottage name
 *   809  direct, Wed Dec 30, 2026 – Sat Jan 2, 2027 (crosses New Year)
 */
namespace {
    [$self, $dir] = $argv + [null, null];
    $GLOBALS['t_auth'] = ['logged_in' => true, 'caps' => ['edit_mphb_bookings' => true, 'edit_post' => true]];
    function is_user_logged_in() { return true; }
    function current_user_can($cap, ...$args) { return true; }
    function post_password_required($p = null) { return false; }
    function get_transient($k) { return false; }
    function set_transient($k, $v, $t) { return true; }
    function delete_transient($k) { return true; }
    function _prime_post_caches($ids, $terms = true, $meta = false) {}
    function update_meta_cache($type, $ids) {}
    function is_email($e) { return (bool) filter_var($e, FILTER_VALIDATE_EMAIL); }
    function sanitize_email($e) { return filter_var($e, FILTER_SANITIZE_EMAIL); }
    function get_userdata($id) { return (object) ['display_name' => [7 => 'Rob Croft', 9 => 'Dana Admin'][(int) $id] ?? '']; }
    function date_i18n($f, $ts = null) { return gmdate($f, $ts ?? time()); }

    /** MotoPress's booking entity, for what only it carries here. */
    class T_Booking {
        public function __construct(private array $d) {}
        public function getNote() { return $this->d['note'] ?? ''; }
        public function getInternalNotes() { return $this->d['internal'] ?? []; }
        public function getPaidAmount() { return $this->d['paid'] ?? null; }
    }
    class T_Repo { public function findById($id) { return isset($GLOBALS['t_entities'][$id]) ? new T_Booking($GLOBALS['t_entities'][$id]) : null; } }
    class T_MPHB { public function getBookingRepository() { return new T_Repo(); } }
    function MPHB() { return new T_MPHB(); }

    require dirname(__DIR__) . '/bootstrap.php';
    foreach (['class-settings', 'class-cache', 'class-booking-rules', 'class-data-provider', 'class-staff', 'class-staff-ready', 'class-staff-data', 'class-staff-search'] as $f) {
        require $dir . '/includes/' . $f . '.php';
    }

    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
    foreach ([[22, 'Cottage 22: The Boathouse'], [23, 'Cottage 23: The Lighthouse'], [33, 'Cottage 33: Pineapple Place'], [35, 'Cottage 35: Blue Heron Hideaway'],
              [36, 'Cottage 36: Sunshine Suite'], [34, 'Cottage 34: Coconut Cottage'], [31, 'Cottage 31: Hibiscus Hut'],
              [37, 'Cottage 37: The Great Blue Heron Lakeside Hideaway']] as [$t, $title]) {
        t_post($t, 'mphb_room_type', 'publish', $title, ['mphb_adults_capacity' => 4]);
        t_post($t * 10, 'mphb_room', 'publish', 'R' . $t, ['mphb_room_type_id' => $t]);
    }
    $rr = 9000;
    $book = static function (int $id, string $ci, string $co, array $types, array $meta = [], array $room = []) use (&$rr) {
        t_post($id, 'mphb_booking', 'confirmed', 'B' . $id, $meta + ['mphb_check_in_date' => $ci, 'mphb_check_out_date' => $co, 'mphb_total_price' => 0]);
        foreach ($types as $t) {
            $rr++;
            t_post($rr, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => $t * 10] + $room);
            $GLOBALS['t_posts'][$rr]->post_parent = $id;
        }
    };
    $ota = static fn(string $prodid, int $id) => ['mphb_ical_prodid' => $prodid, '_mphb_sync_id' => 'ical-' . $id];
    $guest = static fn(string $f, string $l, string $phone, string $mail) => ['mphb_first_name' => $f, 'mphb_last_name' => $l, 'mphb_phone' => $phone, 'mphb_email' => $mail];

    $book(801, '2026-11-06', '2026-11-09', [33], ['mphb_total_price' => 640] + $guest('Jordan', 'Sample', '+1 (555) 010-1801', 'jordan@example.com'), ['_mphb_adults' => 2]);
    $GLOBALS['t_entities'][801] = ['paid' => 200];
    $book(802, '2026-09-30', '2026-10-04', [35], $ota('-//Booking.com//Booking.com Calendar 1.0//EN', 802) + ['mphb_first_name' => 'Casey', 'mphb_last_name' => 'Example'], ['_mphb_adults' => 2]);
    $book(803, '2026-11-12', '2026-11-15', [36], $ota('-//Airbnb Inc//Hosting Calendar 1.0//EN', 803) + ['mphb_first_name' => 'Riley', 'mphb_last_name' => 'Demo'],
        ['_mphb_adults' => 3, '_mphb_children' => 1, '_mphb_adults_confirmed' => 1]);
    $book(804, '2026-11-20', '2026-11-23', [34], $guest('Morgan', 'Placeholder', '+1 (555) 010-1804', 'morgan@example.com'), ['_mphb_adults' => 2]);
    $GLOBALS['t_entities'][804] = ['note' => "Arriving late, around 9pm.\nPlease leave the porch light on.",
        'internal' => [['note' => 'Tony: towels for 4, crib in the bedroom.', 'date' => 1793790000, 'user' => 7],
                       ['note' => "Guest asked about kayaks.\nTold them: life jackets in the shed.", 'date' => 1793700000, 'user' => 9]]];
    $book(805, '2026-11-26', '2026-11-29', [31], $ota('-//ddaysoftware.com//NONSGML DDay.iCal 1.0//EN', 805) + ['mphb_first_name' => 'Avery', 'mphb_last_name' => 'Testcase'], ['_mphb_adults' => 2]);
    $book(806, '2026-11-13', '2026-11-16', [22, 23], $guest('Quinn', 'Mockup', '+1 (555) 010-1806', 'quinn@example.com'), ['_mphb_adults' => 2]);
    $book(807, '2026-11-17', '2026-11-19', [22], $guest('Taylor', 'Fixture', '+1 (555) 010-1807', 'taylor@example.com')
        + ['mphb_guest_2_first_name' => 'Jamie', 'mphb_guest_2_last_name' => 'Fixture', 'mphb_guest_2_phone' => '+1 (555) 010-2807',
           'mphb_dog_type' => 'Labrador', 'mphb_dog_size' => 'Large (50+ lbs)', 'mphb_boat' => 'Yes'], ['_mphb_adults' => 2]);
    $book(808, '2026-11-24', '2026-11-27', [37], $guest('Drew', 'Specimen', '+1 (555) 010-1808', 'drew@example.com'), ['_mphb_adults' => 2]);
    $book(809, '2026-12-30', '2027-01-02', [33], $guest('Sky', 'Newyear', '+1 (555) 010-1809', 'sky@example.com'), ['_mphb_adults' => 4]);

    $ids = [801, 802, 803, 804, 805, 806, 807, 808, 809];
    $out = ['details' => [], 'search' => [], 'index' => null];
    foreach ($ids as $id) {
        $out['details'][$id] = \MPHBAC\Staff_Data::booking_detail($id);
        $out['search'][$id] = \MPHBAC\Staff_Data::search_doc($id);
    }
    try { $out['index'] = \MPHBAC\Staff_Search::index(); } catch (\Throwable $e) { $out['index'] = 'ERROR ' . $e->getMessage(); }
    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
