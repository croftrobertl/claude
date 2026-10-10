<?php
/**
 * WHAT THE BOARD IS SENT FOR 0.44.0 — the source key, the pet rule, the
 * guest count, the contact links and the WP-Admin link.
 *
 *   SOURCE: a stable key (direct / airbnb / booking / vrbo / other) the bar
 *   colour and the Source filter use. "other" is the channel ota_name()
 *   cannot name — on live, two confirmed bookings from DDay.iCal.
 *
 *   PETS: exactly the sheet's rule — a non-empty dog type OR a pet / dog fee
 *   on a reserved room. NEVER dog size or dog hair: those hold old select
 *   defaults on every historical booking. Live has no qualifying confirmed
 *   booking, so these fixtures are the only proof.
 *
 *   GUESTS: the sheet's rule, so the quick preview never shows a count the
 *   sheet would not (an import carrying only the cottage's capacity shows
 *   nothing).
 *
 *   WP-ADMIN: decided on the server. Only a LOGGED-IN visitor with the staff
 *   capability who may edit_post THIS booking gets the link; a password-only
 *   visitor never does.
 */
namespace {
    $GLOBALS['t_auth'] = ['logged_in' => true, 'caps' => ['edit_mphb_bookings' => true, 'edit_post' => true]];
    function is_user_logged_in() { return $GLOBALS['t_auth']['logged_in']; }
    function current_user_can($cap, ...$args) { return !empty($GLOBALS['t_auth']['caps'][$cap]); }
    function post_password_required($p = null) { return !empty($GLOBALS['t_auth']['password_ok']) ? false : true; }
    function wp_verify_nonce($n, $a) { return $n === 'good' ? 1 : false; }
    function nocache_headers() {}
    function status_header($code) { $GLOBALS['t_status'] = $code; }
    function wp_unslash($v) { return $v; }
    function get_transient($k) { return false; }
    function set_transient($k, $v, $t) { return true; }
    function delete_transient($k) { return true; }
    function _prime_post_caches($ids, $terms = true, $meta = false) {}
    function update_meta_cache($type, $ids) {}
    function get_edit_post_link($id, $context = 'display') { return 'https://example.test/wp-admin/post.php?post=' . (int) $id . '&action=edit'; }
    function is_email($e) { return (bool) filter_var($e, FILTER_VALIDATE_EMAIL); }
    function sanitize_email($e) { return filter_var($e, FILTER_SANITIZE_EMAIL); }
    class T_Json extends \Exception { public $payload; public $code_; }
    function wp_send_json_success($d = null) { $e = new T_Json('ok'); $e->payload = $d; throw $e; }
    function wp_send_json_error($d = null, $c = 200) { $e = new T_Json('err'); $e->payload = $d; $e->code_ = $c; throw $e; }

    require __DIR__ . '/bootstrap.php';
    $ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
    require $ROOT . '/includes/class-settings.php';
    require $ROOT . '/includes/class-cache.php';
    require $ROOT . '/includes/class-data-provider.php';
    require $ROOT . '/includes/class-staff.php';
    require $ROOT . '/includes/class-staff-data.php';

    use MPHBAC\Staff;
    use MPHBAC\Staff_Data;

    $fail = 0;
    function check(string $l, bool $c, $x = null): void {
        global $fail;
        echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
        if (!$c) { $fail++; }
    }

    /* query_range() is SQL-backed; feed its rows through the wpdb stub. */
    class T_WPDB_Board extends T_WPDB {
        public function get_results($sql, $out = null) {
            t_count('wpdb_get_results');
            if (str_contains((string) $sql, 'mphb_reserved_room')) { return $GLOBALS['t_rows'] ?? []; }
            return parent::get_results($sql, $out);
        }
    }
    $GLOBALS['wpdb'] = new T_WPDB_Board();

    /** One booking per spec: [booking meta, reserved-room meta]. */
    function board(array $specs): array {
        $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
        t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
        t_post(77, 'mphb_room_service', 'publish', 'Pet Fee');
        t_post(78, 'mphb_room_service', 'publish', 'Early Check-in');
        t_post(79, 'mphb_room_service', 'publish', 'Dog bed');
        $rows = [];
        $i = 0;
        foreach ($specs as $bid => [$bmeta, $rmeta]) {
            t_post($bid, 'mphb_booking', 'confirmed', 'B', $bmeta);
            $rid = 50000 + $i++;
            t_post($rid, 'mphb_reserved_room', 'publish', 'RR', $rmeta + ['_mphb_room_id' => 220]);
            $GLOBALS['t_posts'][$rid]->post_parent = $bid;
            $rows[] = (object) ['reserved_id' => $rid, 'booking_id' => $bid, 'status' => 'confirmed',
                'room_id' => 220, 'room_type_id' => 22, 'checkin' => '2026-10-05', 'checkout' => '2026-10-09'];
        }
        $GLOBALS['t_rows'] = $rows;
        $out = [];
        foreach (Staff_Data::month_view(new DateTimeImmutable('2026-10-01'), new DateTimeImmutable('2026-10-31'))['bookings'] as $b) {
            $out[$b['id']] = $b;
        }
        return $out;
    }

    echo "-- the source key: one stable key per channel --\n";
    $b = board([
        1 => [[], ['_mphb_adults' => 2]],
        2 => [['mphb_ical_prodid' => '-//Airbnb Inc//Hosting Calendar 0.8.8//EN'], ['_mphb_adults' => 4]],
        3 => [['mphb_ical_prodid' => '-//Booking.com//NONSGML Booking.com Calendar//EN'], []],
        4 => [['mphb_ical_prodid' => '-//HomeAway.com, Inc.//NONSGML HomeAway Calendar//EN'], []],
        5 => [['mphb_ical_prodid' => '-//ddaysoftware.com//NONSGML DDay.iCal 1.0//EN'], []],
    ]);
    $keys = array_map(static fn($x) => $x['sourceKey'], $b);
    check('direct / airbnb / booking / vrbo, and DDay.iCal is VRBO (0.44.1)', $keys === [1 => 'direct', 2 => 'airbnb', 3 => 'booking', 4 => 'vrbo', 5 => 'vrbo'], $keys);
    check('...named Vrbo in the sheet too — the two bookings that carry it are Vrbo reservations', $b[5]['source']['ota'] === 'Vrbo', $b[5]['source']);
    $b6 = board([6 => [['mphb_ical_prodid' => '-//Some New Channel//EN'], []]]);
    check('a channel nobody recognises is still "other" — the board shows it in the Direct colour', $b6[6]['sourceKey'] === 'other', $b6[6]['source']);

    echo "\n-- the pet rule: dog type OR a pet fee, never size or hair --\n";
    $b = board([
        10 => [['mphb_dog_type' => 'Labrador'], []],
        11 => [[], ['_mphb_services' => [77 => 1]]],
        12 => [[], ['_mphb_services' => [79]]],
        13 => [['mphb_dog_size' => '10-20 lbs', 'mphb_dog_hair' => 'short-haired'], []],
        14 => [['mphb_dog_type' => '—'], ['_mphb_services' => [78 => 1]]],
        15 => [[], []],
    ]);
    $pets = array_map(static fn($x) => $x['pets'], $b);
    check('a dog type: pets', $pets[10] === true, $pets);
    check('a pet fee on the reserved room (id => qty map): pets', $pets[11] === true, $pets);
    check('a dog fee (list form): pets', $pets[12] === true, $pets);
    check('ONLY the old size / hair defaults: NOT pets', $pets[13] === false, $pets);
    check('a placeholder dog type and an unrelated service: NOT pets', $pets[14] === false, $pets);
    check('nothing at all: not pets', $pets[15] === false, $pets);

    echo "\n-- the guest count, by the sheet's rule --\n";
    $b = board([
        // Ids clear of 22, the room type: a booking with that id would replace
        // it and its capacity, and every import would then look like the default.
        30 => [[], ['_mphb_adults' => 2, '_mphb_children' => 1]],
        31 => [['mphb_ical_prodid' => '-//Airbnb Inc//Hosting Calendar//EN'], ['_mphb_adults' => 4]],
        32 => [['mphb_ical_prodid' => '-//Airbnb Inc//Hosting Calendar//EN'], ['_mphb_adults' => 4, '_mphb_adults_confirmed' => 1]],
        33 => [['mphb_ical_prodid' => '-//Airbnb Inc//Hosting Calendar//EN'], ['_mphb_adults' => 3]],
    ]);
    $g = array_map(static fn($x) => $x['guests'], $b);
    check('a direct booking: its count, children broken out', str_starts_with($g[30], '3') && str_contains($g[30], 'child'), $g);
    check('an import carrying only the cottage\'s capacity: NO count', $g[31] === '', $g);
    check('the same, confirmed by a person: shown', $g[32] === '4', $g);
    check('an import with a real, different count: shown', $g[33] === '3', $g);

    echo "\n-- 0.44.1 Couch: 3+ guests, only from a count a PERSON set --\n";
    $imp = ['mphb_ical_prodid' => '-//Airbnb Inc//Hosting Calendar//EN'];
    $b = board([
        40 => [[], ['_mphb_adults' => 2, '_mphb_children' => 1]],                       // website / WP-Admin, 3
        41 => [[], ['_mphb_adults' => 2]],                                              // website, 2
        42 => [$imp, ['_mphb_adults' => 4]],                                            // import's own (default) 4
        43 => [$imp, ['_mphb_adults' => 3]],                                            // import's own 3: still NOT
        44 => [$imp, ['_mphb_adults' => 3, '_mphb_adults_confirmed' => 1]],             // staff-confirmed 3
        45 => [[], ['_mphb_adults' => 5, '_mphb_adults_confirmed' => 1, '_mphb_children' => 0]],
        46 => [$imp, ['_mphb_adults' => 2, '_mphb_adults_confirmed' => 1]],             // confirmed 2
    ]);
    $c = array_map(static fn($x) => $x['couch'], $b);
    check('a website / WP-Admin booking of 3 (2 adults + 1 child): Couch', $c[40] === true, $c);
    check('...of 2: no Couch', $c[41] === false, $c);
    check('an IMPORT\'s own count, 4 or 3: NEVER Couch — the platforms send no real count', $c[42] === false && $c[43] === false, $c);
    check('an import whose count staff CONFIRMED as 3: Couch', $c[44] === true, $c);
    check('a confirmed 5: Couch; a confirmed 2: none', $c[45] === true && $c[46] === false, $c);

    echo "\n-- 0.44.1 Boat: the \"boat\" checkout field says yes --\n";
    $b = board([
        50 => [['mphb_boat' => 'Yes'], []],
        51 => [['mphb_boat' => 'yes'], []],
        52 => [['mphb_boat' => 'No'], []],
        53 => [['mphb_boat' => ''], []],
        54 => [[], []],
    ]);
    $bt = array_map(static fn($x) => $x['boat'], $b);
    check('"Yes" and "yes": Boat; "No", blank and no field: none', $bt === [50 => true, 51 => true, 52 => false, 53 => false, 54 => false], $bt);

    echo "\n-- no query per booking for any of it --\n";
    {
        $spec = static function (int $n): array {
            $s = [];
            for ($i = 0; $i < $n; $i++) { $s[100 + $i] = [['mphb_dog_type' => ''], ['_mphb_services' => [77 => 1, 78 => 1]]]; }
            return $s;
        };
        $budget = [];
        foreach ([1, 10, 50] as $n) {
            t_reset();
            board($spec($n));
            $budget[$n] = count(array_filter($GLOBALS['t_queries'], static fn($t) => $t === 'mphb_room_service'));
        }
        check('ONE services lookup for the whole window, however many bookings carry a fee', $budget === [1 => 1, 10 => 1, 50 => 1], $budget);
    }

    echo "\n-- tap to call / text / email: cleaned targets on the rows --\n";
    {
        $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
        t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
        t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
        t_post(900, 'mphb_booking', 'confirmed', 'B', ['mphb_phone' => '+1 (555) 010-4421', 'mphb_email' => 'ann@example.com',
            'mphb_guest_2_phone' => '555.010.9999', 'mphb_first_name' => 'Ann', 'mphb_total_price' => 0]);
        t_post(901, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => 220, '_mphb_adults' => 2]);
        $GLOBALS['t_posts'][901]->post_parent = 900;
        $rows = [];
        foreach (Staff_Data::booking_detail(900)['sections']['customer'] as $r) { $rows[$r['label']] = $r; }
        check('Phone: shown as entered, linked by its digits with the leading +',
            ($rows['Phone']['value'] ?? '') === '+1 (555) 010-4421' && ($rows['Phone']['tel'] ?? '') === '+15550104421', $rows['Phone'] ?? null);
        check('Email: linked as a cleaned address', ($rows['Email']['email'] ?? '') === 'ann@example.com', $rows['Email'] ?? null);
        check('Guest 2 Phone: linked too', ($rows['Guest 2 Phone']['tel'] ?? '') === '5550109999', $rows['Guest 2 Phone'] ?? null);
        check('no "boat" answer: no Boat row', !isset($rows['Boat']));
        $GLOBALS['t_meta'][900]['mphb_boat'] = 'Yes';
        $GLOBALS['t_meta'][900]['mphb_dog_type'] = 'Poodle';
        $rows = []; $order = [];
        foreach (Staff_Data::booking_detail(900)['sections']['customer'] as $r) { $rows[$r['label']] = $r; $order[] = $r['label']; }
        check('0.44.1: a Boat row, "Yes", after the dog rows', ($rows['Boat']['value'] ?? '') === 'Yes'
            && array_search('Boat', $order, true) > array_search('Dog Type', $order, true), $order);
        unset($GLOBALS['t_meta'][900]['mphb_boat'], $GLOBALS['t_meta'][900]['mphb_dog_type']);
        $GLOBALS['t_meta'][900]['mphb_phone'] = 'ask at desk';
        $GLOBALS['t_meta'][900]['mphb_email'] = 'not an address';
        $rows = [];
        foreach (Staff_Data::booking_detail(900)['sections']['customer'] as $r) { $rows[$r['label']] = $r; }
        check('a phone with no number in it: shown, NOT linked', isset($rows['Phone']) && !isset($rows['Phone']['tel']), $rows['Phone'] ?? null);
        check('an email that is not an address: shown, NOT linked', isset($rows['Email']) && !isset($rows['Email']['email']), $rows['Email'] ?? null);
    }

    echo "\n-- Open in WP-Admin: decided on the server --\n";
    {
        $ask = static function (): array {
            $_POST = $_REQUEST = ['booking_id' => '900', 'nonce' => 'good'];
            try { Staff::handle_booking(); } catch (T_Json $e) { return (array) $e->payload; }
            return [];
        };
        $GLOBALS['t_auth'] = ['logged_in' => true, 'caps' => ['edit_mphb_bookings' => true, 'edit_post' => true]];
        $d = $ask();
        check('logged in, staff capability, may edit this booking: the link is sent',
            ($d['adminUrl'] ?? '') === 'https://example.test/wp-admin/post.php?post=900&action=edit', $d['adminUrl'] ?? null);
        $GLOBALS['t_auth'] = ['logged_in' => true, 'caps' => ['edit_mphb_bookings' => true]];
        check('logged in with the capability but NOT edit_post on this booking: no link', !isset($ask()['adminUrl']));
        $GLOBALS['t_auth'] = ['logged_in' => true, 'caps' => ['edit_post' => true, 'edit_mphb_bookings' => false]];
        // Authorized for the board by the password instead, so the request is answered at all.
        $GLOBALS['t_auth']['password_ok'] = true;
        update_option('mphbac_settings', ['staff_page_id' => 18102]);
        t_post(18102, 'page', 'publish', 'Staff');
        $GLOBALS['t_posts'][18102]->post_password = 'secret';
        $d = $ask();
        check('(instrument check) the password-only request IS answered', isset($d['id']), $d);
        check('logged in WITHOUT the staff capability (password only): no link', !isset($d['adminUrl']));
        $GLOBALS['t_auth'] = ['logged_in' => false, 'caps' => ['edit_mphb_bookings' => true, 'edit_post' => true], 'password_ok' => true];
        $d = $ask();
        check('not logged in at all, password cookie only: no link, even if a capability check would pass', isset($d['id']) && !isset($d['adminUrl']), $d['adminUrl'] ?? null);
    }

    echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
    exit($fail ? 1 : 0);
}
